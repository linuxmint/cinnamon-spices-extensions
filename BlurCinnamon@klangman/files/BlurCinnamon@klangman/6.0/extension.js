// Blur Cinnamon: Blur some components of the Cinnamon Desktop

// Copyright (c) 2025 Kevin Langman

// Some code bowwowed from the BlurOverview Cinnamon extension Copyright (C) 2012 Jen Bowen aka nailfarmer

// Gaussian Blur (borrowed from Blur-my-shell / Aurélien Hamy) modified for Cinnamon by Kevin Langman 2024

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Clutter       = imports.gi.Clutter;
const St            = imports.gi.St;
const Tweener       = imports.ui.tweener;
const Overview      = imports.ui.overview;
const Expo          = imports.ui.expo;
const Settings      = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Panel         = imports.ui.panel;
const Main          = imports.ui.main;
const Meta          = imports.gi.Meta;
const Mainloop      = imports.mainloop;
const AppletManager = imports.ui.appletManager;
const Lang          = imports.lang;
const UPowerGlib    = imports.gi.UPowerGlib;


// For PopupMenu effects
const Applet        = imports.ui.applet;
const PopupMenu     = imports.ui.popupMenu;

const GaussianBlur = require("./gaussian_blur");

const ANIMATION_TIME = 0.25;
const AUTOHIDE_ANIMATION_TIME = 0.2;  // This is a copy of "Panel.AUTOHIDE_ANIMATION_TIME", we can't legally access it since it's a const and EC6 does not allow it

const BLUR_EFFECT_NAME = "blur";
const DESAT_EFFECT_NAME = "desat";
const BRIGHTNESS_EFFECT_NAME = "brightness";

let originalAnimateOverview;
let originalAnimateExpo;

let settings;
let blurPanels;
let blurPopupMenus;
let blurDesktop;

var blurPanelsThis;
var blurPopupMenusThis;

const BlurType = {
   None: 0,
   Simple: 1,
   Gaussian: 2
}

const PanelLoc = {
   All: 0,
   Top: 1,
   Bottom: 2,
   Left: 3,
   Right: 4
}

const PanelMonitor = {
   All: 100
}

function _animateVisibleOverview() {
   if (this.visible || this.animationInProgress)
      return;

   this._oldAnimateVisible();

   let children = this._background.get_children();

   let blurType = (settings.overviewOverride) ? settings.overviewBlurType : settings.blurType;
   let radius = (settings.overviewOverride) ? settings.overviewRadius : settings.radius;
   let blendColor = (settings.overviewOverride) ? settings.overviewBlendColor : settings.blendColor;
   let opacity = (settings.overviewOverride) ? settings.overviewOpacity : settings.opacity;
   let saturation = (settings.overviewOverride) ? settings.overviewSaturation : settings.saturation;

   // Get the overview's background image and add the BlurEffect to it if configured to do so
   let desktopBackground = children[0];
   if (blurType > BlurType.None) {
      let fx;
      if (blurType === BlurType.Simple) {
         fx =  new Clutter.BlurEffect();
      } else {
         fx = new GaussianBlur.GaussianBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
      }
      desktopBackground.add_effect_with_name( BLUR_EFFECT_NAME, fx );
   }
   if (saturation<100) {
      let desat = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
      desktopBackground.add_effect_with_name( DESAT_EFFECT_NAME, desat );
   }
   // Get the overview's backgroundShade child and set it's color to see-through solid black/"Color blend" color
   let backgroundShade = children[1];
   let [ret,color] = Clutter.Color.from_string( blendColor );
   backgroundShade.set_opacity(0);
   backgroundShade.set_background_color(color);

   // Dim the backgroundShade by making the black/"Color blend" color less see-through by the configured percentage
   Tweener.addTween( backgroundShade,
      { opacity: Math.round(opacity*2.55), time: ANIMATION_TIME, transition: 'easeNone' } );
}

function _animateVisibleExpo() {
   if (this.visible || this.animationInProgress)
      return;

   this._oldAnimateVisible();
   this._gradient.hide();   // Remove the gradient so that the background image is visible

   let blurType = (settings.expoOverride) ? settings.expoBlurType : settings.blurType;
   let radius = (settings.expoOverride) ? settings.expoRadius : settings.radius;
   let blendColor = (settings.expoOverride) ? settings.expoBlendColor : settings.blendColor;
   let opacity = (settings.expoOverride) ? settings.expoOpacity : settings.opacity;
   let saturation = (settings.expoOverride) ? settings.expoSaturation : settings.saturation;

   let desktopBackground = this._background
   if (blurType > BlurType.None) {
      let fx;
      if (blurType === BlurType.Simple) {
         fx =  new Clutter.BlurEffect();
      } else {
         fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
      }
      desktopBackground.add_effect_with_name( BLUR_EFFECT_NAME, fx );
   }
   if (saturation<100) {
      let desat = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
      desktopBackground.add_effect_with_name( DESAT_EFFECT_NAME, desat );
   }
   // Create a shade, set it's color in accordance with the settings and make it invisible
   let backgroundShade = new St.Bin({style_class: 'workspace-overview-background-shade'});
   this._backgroundShade = backgroundShade;
   backgroundShade.set_size(global.screen_width, global.screen_height);
   this._background.add_actor(backgroundShade);
   let [ret,color] = Clutter.Color.from_string( blendColor );
   backgroundShade.set_opacity(0);
   backgroundShade.set_background_color(color);
   // Dim the backgroundShade by making the black/"Color blend" color less see-through by the configured percentage
   Tweener.addTween( backgroundShade,
      { opacity: Math.round(opacity*2.55), time: ANIMATION_TIME, transition: 'easeNone' } );
}

// This is an implementation of Panel._panelHasOpenMenus() that will be used in pre-Cinnamon 6.4 versions
function panelHasOpenMenus() {
   return global.menuStackLength > 0;
}

// This class manages the blurring of the panels
class BlurPanels {

   constructor() {
      this._signalManager = new SignalManager.SignalManager(null);
      this._blurredPanels = [];
      this._blurExistingPanels();

      blurPanelsThis = this; // Make the 'this' pointer available in patch functions

      // Monkey patch panel functions so we can manage the blurred backgrounds when the panels are hidden/shown
      this._originalPanelEnable    = Panel.Panel.prototype.enable;
      this._originalPanelDisable   = Panel.Panel.prototype.disable;

      Panel.Panel.prototype.enable     = this.blurEnable;
      Panel.Panel.prototype.disable    = this.blurDisable;

      // Connect to important events
      this._signalManager.connect(global.settings,    "changed::panels-enabled", this._panel_changed, this);
      this._signalManager.connect(Main.layoutManager, "monitors-changed",        this._panel_changed, this);
      this._signalManager.connect(global.display,     "in-fullscreen-changed",   this._fullscreen_changed, this);

      // Get notified when we resume from sleep so we can try and fix up the blurred panels
      // There has a been a report of issues after a resume
      //this._upClient = new UPowerGlib.Client();
      //log( "Blur Cinnamon: using notify::resume" );
      //this._upClient.connect('notify::resume', Lang.bind(this, this._resumeedFromSleep));
   }

   //_resumeedFromSleep() {
   //   log( "Blur Cinnamon: We have resumed from sleep!" );
   //}

   // If a fullscreen window event occurs we need to hide or show the background overlay
   _fullscreen_changed() {
      let panels = Main.getPanels();
      let monitor;
      let panel;
      let background;

      for ( let i=0 ; i < panels.length ; i++ ) {
         panel = panels[i];
         if (panel && panel.__blurredPanel && panel.__blurredPanel.background && !panel._hidden) {
            background = panel.__blurredPanel.background;
            if (global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
               background.hide();
            } else {
               background.show();
            }
         }
      }
   }

   // This function is called when some change occurred to the panel setup (i.e. number of panels or panel heights, panel locations)
   _panel_changed() {
      let panels = Main.getPanels();
      // Mark our panel metadata so we can track which panels have been removed
      this._blurredPanels.forEach( (element) => element.foundPanel = false );
      let i;
      // Check for new panels
      for ( i=0 ; i < panels.length  ; i++ ) {
         if (panels[i]) {
            if (!panels[i].__blurredPanel) {
               this._blurPanel(panels[i]);
            }
            panels[i].__blurredPanel.foundPanel = true;
         }
      }
      // Check for removed panels
      for ( i=this._blurredPanels.length-1 ; i >= 0 ; i-- ) {
         if (this._blurredPanels[i] && this._blurredPanels[i].foundPanel === false) {
            let blurredPanel = this._blurredPanels[i];
            if (blurredPanel.background) {
               blurredPanel.background.destroy();
               blurredPanel.signalManager.disconnectAllSignals();
               this._blurredPanels.splice(i,1);
            }
         }
      }
   }

   _setClip(panel){
      if (panel && panel.__blurredPanel && panel.__blurredPanel.background) {
         let actor = panel.actor;
         if (actor.is_visible()) {
            panel.__blurredPanel.background.set_clip( actor.x, actor.y, actor.width, actor.height );
         } else {
            panel.__blurredPanel.background.set_clip( 0, 0, 0, 0 );
         }
         if (panel._hidden || panel._disabled || global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
            panel.__blurredPanel.background.hide();
         } else if (!panel.__blurredPanel.background.is_visible()) {
            panel.__blurredPanel.background.show();
         }
      }
   }

   // Apply the blur effects to all the existing panels
   _blurExistingPanels() {
      let panels = Main.getPanels();
      for ( let i=0 ; i < panels.length ; i++ ) {
         if (panels[i]) {
            this._blurPanel(panels[i]);
         }
      }
   }

   // Create a new blur effect for the panel argument.
   _blurPanel(panel) {
      let panelSettings = this._getPanelSettings(panel);
      if (!panelSettings ) return;
      let [opacity, blendColor, blurType, radius, saturation] = panelSettings;

      let actor = panel.actor;
      let blurredPanel = panel.__blurredPanel;

      // Emulate the Cinnamon 6.4 panel._panelHasOpenMenus() function for older Cinnamon releases
      if (typeof panel._panelHasOpenMenus !== "function") {
         this.added_panelHasOpenMenus = true;
         panel._panelHasOpenMenus = panelHasOpenMenus;
      }
      if (!blurredPanel) {
         // Save the current panel setting if we don't already have the data saved
         blurredPanel = { original_color: actor.get_background_color(), original_style: actor.get_style(), original_class: actor.get_style_class_name(),
                          original_pseudo_class: actor.get_style_pseudo_class(), background: null, effect: null, panel: panel };
         panel.__blurredPanel = blurredPanel;
         this._blurredPanels.push(blurredPanel);
      }
      if (settings.allowTransparentColorPanels) {
         // Set the panels color
         let [ret,color] = Clutter.Color.from_string( blendColor );
         if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
         color.alpha = opacity*2.55;
         actor.set_background_color(color);
         // Make the panel transparent
         actor.set_style( "border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                          "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent;    background: transparent;" );
      }
      // If blurring is required, create a background, create effect, clip background to cover the panel only
      // With this commented out, a panel with no effects applied (just made transparent) will still prevent
      // windows beneath the panels from being visible.
      //if (blurType > BlurType.None || saturation<100) {
         let fx;
         let background;
         if (!Meta.is_wayland_compositor()) {
            background = Meta.X11BackgroundActor.new_for_display(global.display);
         } else {
            background = new Clutter.Actor();
         }
         global.overlay_group.add_actor(background);
         blurredPanel.background = background;
         background.set_clip( panel.actor.x, panel.actor.y, panel.actor.width, panel.actor.height );
         if (blurType === BlurType.Simple) {
            fx =  new Clutter.BlurEffect();
         } else if (blurType === BlurType.Gaussian) {
            fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1 , width: 0, height: 0} );
         }
         if (fx) {
            background.add_effect_with_name( BLUR_EFFECT_NAME, fx );
            //blurredPanel.effect = fx;
         }
         if (panel._hidden || global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
            background.hide();
         }
         if (saturation<100) {
            let desat = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
            blurredPanel.background.add_effect_with_name( DESAT_EFFECT_NAME, desat );
         }
      //}
      blurredPanel.signalManager = new SignalManager.SignalManager(null);
      blurredPanel.signalManager.connect(actor, 'notify::size', () => {this._setClip(panel);} );
      blurredPanel.signalManager.connect(actor, 'notify::position', () => {this._setClip(panel);} );
   }

   // This function will restore all panels to their original state and undo the monkey patching
   destroy() {
      let panels = Main.getPanels();

      this._signalManager.disconnectAllSignals();

      // Restore the panels to their original state
      for ( let i=0 ; i < panels.length ; i++ ) {
         this._unblurPanel(panels[i]);
      }

      // Restore the original functions that we monkey patched
      Panel.Panel.prototype.enable     = this._originalPanelEnable;
      Panel.Panel.prototype.disable    = this._originalPanelDisable;
   }

   _unblurPanel(panel) {
      if (panel) {
         let actor = panel.actor;
         let blurredPanel = panel.__blurredPanel
         if (blurredPanel) {
            actor.set_background_color(blurredPanel.original_color);
            actor.set_style(blurredPanel.original_style);
            actor.set_style_class_name(blurredPanel.original_class);
            actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
            if (blurredPanel.background) {
               let effect = blurredPanel.background.get_effect(BLUR_EFFECT_NAME);
               if (effect)
                  blurredPanel.background.remove_effect(effect);
               effect = blurredPanel.background.get_effect(DESAT_EFFECT_NAME);
               if (effect)
                  blurredPanel.background.remove_effect(effect);
               global.overlay_group.remove_actor(blurredPanel.background);
               blurredPanel.background.destroy();
            }
            // Find the index of this panels this._blurredPanels entry then remove the entry
            for ( let i=0 ; i < this._blurredPanels.length ; i++ ) {
               if (this._blurredPanels[i].panel === panel) {
                  this._blurredPanels.splice(i,1);
                  break;
               }
            }
            delete panel.__blurredPanel;
            if (this.added_panelHasOpenMenus) {
               delete panel._panelHasOpenMenus;
            }
         }
      }
   }

   // An extension setting controlling the color saturation overlay was modified
   // This method assumes that there is a this._blurredPanels entry for all necessary panels
   // If the "panel-unique-settings" list changes then updateBlur() will have been called 1st
   updateSaturation() {
      for ( let i=0 ; i < this._blurredPanels.length ; i++ ) {
         let blurredPanel = this._blurredPanels[i];
         let panel = blurredPanel.panel;
         let panelSettings = this._getPanelSettings(panel);
         if (panelSettings) {
            let [opacity, blendColor, blurType, radius, saturation] = panelSettings;
            if (!blurredPanel.background) {
               //let background = Meta.X11BackgroundActor.new_for_display(global.display);
               //global.overlay_group.add_actor(background);
               //blurredPanel.background = background;
               this._blurPanel(panel);
            } else {
               let effect = blurredPanel.background.get_effect(DESAT_EFFECT_NAME);
               if (effect) {
                  effect.set_factor((100-saturation)/100);
               } else {
                  let desat = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
                  blurredPanel.background.add_effect_with_name( DESAT_EFFECT_NAME, desat );
               }
            }
         }
      }
   }

   // An extension setting controlling how the dim overlay was modified
   // This method assumes that there is a this._blurredPanels entry for all necessary panels
   // If the "panel-unique-settings" list changes then updateBlur() will have been called 1st
   updateColor() {
      for ( let i=0 ; i < this._blurredPanels.length ; i++ ) {
         let blurredPanel = this._blurredPanels[i];
         let panel = blurredPanel.panel;
         let panelSettings = this._getPanelSettings(panel);

         if (panelSettings) {
            let actor = panel.actor;
            let [opacity, blendColor, blurType, radius, saturation] = panelSettings;
            if (settings.allowTransparentColorPanels) {
               let [ret,color] = Clutter.Color.from_string( blendColor );
               if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
               color.alpha = opacity*2.55;
               actor.set_background_color(color);
               // Make the panel transparent
               actor.set_style( "border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                                "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                                "background-gradient-end: transparent;    background: transparent;" );
            } else {
               actor.set_background_color(blurredPanel.original_color);
               actor.set_style(blurredPanel.original_style);
               actor.set_style_class_name(blurredPanel.original_class);
               actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
            }
         }
      }
   }

   // An extension setting controlling how to blur is handled was modified
   // This method can't assume that there is a this._blurredPanel entry for all necessary panels
   updateBlur() {
      let panels = Main.getPanels();
      for ( let i=0 ; i < panels.length ; i++ ) {
         if (panels[i]) {
            let panelSettings = this._getPanelSettings(panels[i]);
            if (panelSettings) {
               let [opacity, blendColor, blurType, radius, saturation] = panelSettings;
               let blurredPanel = panels[i].__blurredPanel;
               if (blurredPanel) {
                  let effect = (blurredPanel.background) ? blurredPanel.background.get_effect(BLUR_EFFECT_NAME) : null;
                  if (blurType !== BlurType.None && !blurredPanel.background) {
                     this._blurPanel(panels[i]);
                  } else if (blurType === BlurType.None && effect) {
                     blurredPanel.background.remove_effect(effect);
                     //blurredPanel.background.destroy();
                     //blurredPanel.background = null;
                  } else if (blurType === BlurType.Simple && (!effect || effect instanceof GaussianBlur.GaussianBlurEffect)) {
                     if (effect)
                        blurredPanel.background.remove_effect(effect);
                     effect =  new Clutter.BlurEffect();
                     blurredPanel.background.add_effect_with_name( BLUR_EFFECT_NAME, effect );
                  } else if (blurType === BlurType.Gaussian && (!effect || effect instanceof Clutter.BlurEffect)) {
                     if (effect)
                        blurredPanel.background.remove_effect(effect);
                     effect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
                     blurredPanel.background.add_effect_with_name( BLUR_EFFECT_NAME, effect );
                  } else if (effect && blurType === BlurType.Gaussian && blurredPanel.radius !== radius) {
                     effect.radius = radius;
                  }
               } else {
                  this._blurPanel(panels[i]);
               }
            } else if (panels[i].__blurredPanel) {
               // No settings found to apply to this panel, so remove all effects for this panel
               this._unblurPanel(panels[i])
            }
         }
      }
   }

   // Determine the settings that should apply for the panel argument panel
   _getPanelSettings(panel) {
      if (settings.panelsOverride && settings.enablePanelUniqueSettings) {
         for( let i=0 ; i < settings.panelUniqueSettings.length ; i++ ) {
            let uniqueSetting = settings.panelUniqueSettings[i];
            if (uniqueSetting.enabled) {
               if (uniqueSetting.panels !== PanelLoc.All) {
                  if ( (panel.panelPosition === Panel.PanelLoc.top && uniqueSetting.panels !== PanelLoc.Top) ||
                       (panel.panelPosition === Panel.PanelLoc.bottom && uniqueSetting.panels !== PanelLoc.Bottom) ||
                       (panel.panelPosition === Panel.PanelLoc.left && uniqueSetting.panels !== PanelLoc.Left) ||
                       (panel.panelPosition === Panel.PanelLoc.right && uniqueSetting.panels !== PanelLoc.Right) )
                  {
                     continue;
                  }
               }
               if (uniqueSetting.monitors !== PanelMonitor.All) {
                  if (panel.monitorIndex !== uniqueSetting.monitors) {
                     continue;
                  }
               }
               return [uniqueSetting.opacity, uniqueSetting.color, uniqueSetting.blurtype, uniqueSetting.radius, uniqueSetting.saturation];
            }
         }
         return null;
      } else {
         let radius = (settings.panelsOverride) ? settings.panelsRadius : settings.radius;
         let blurType = (settings.panelsOverride) ? settings.panelsBlurType : settings.blurType;
         let blendColor = (settings.panelsOverride) ? settings.panelsBlendColor : settings.blendColor;
         let opacity = (settings.panelsOverride) ? settings.panelsOpacity : settings.opacity;
         let saturation = (settings.panelsOverride) ? settings.panelsSaturation : settings.saturation;
         return [opacity, blendColor, blurType, radius, saturation];
      }
   }

   // Functions that will be monkey patched over the Panel functions
   blurEnable(...params) {
      try {
         if (this.__blurredPanel && this.__blurredPanel.background && !global.display.get_monitor_in_fullscreen(this.monitorIndex) && !this._hidden) {
            // Only show the blurred background after the panel animation is almost done
            Mainloop.timeout_add((AUTOHIDE_ANIMATION_TIME * 1000)*.9, () => this.__blurredPanel.background.show() );
         }
      } catch (e) {}
      blurPanelsThis._originalPanelEnable.apply(this, params);
   }

   blurDisable(...params) {
      try {
         if (this.__blurredPanel && this. __blurredPanel.background && !this._hidden) {
            // Delay 50ms before hiding the blurred background to avoid a sudden unblurring of the panel before other animations even get started
            Mainloop.timeout_add(50, () => this.__blurredPanel.background.hide() );
         }
      } catch (e) {}
      blurPanelsThis._originalPanelDisable.apply(this, params);
   }
}

class BlurPopupMenus {
   constructor() {
      blurPopupMenusThis = this; // Make "this" available to monkey patched functions
      this.original_popupmenu_open = PopupMenu.PopupMenu.prototype.open;
      PopupMenu.PopupMenu.prototype.open = this._popupMenuOpen;
      //this.original_popupmenu_close = PopupMenu.PopupMenu.prototype.close;
      //PopupMenu.PopupMenu.prototype.close = this._popupMenuClose;

      this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: 0, brightness: 1 , width: 0, height: 0} );
      this._desatEffect = new Clutter.DesaturateEffect({factor: 1});
      if (!Meta.is_wayland_compositor()) {
         this._background = Meta.X11BackgroundActor.new_for_display(global.display);
      } else {
         this._background = new Clutter.Actor();
      }
      this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      this._background.add_effect_with_name( DESAT_EFFECT_NAME, this._desatEffect );
      global.overlay_group.add_actor(this._background);
      this._background.hide();
   }

   // Monkey patched over PupupMenu.open()
   _popupMenuOpen(animate) {
      if (this instanceof Applet.AppletPopupMenu || this instanceof Applet.AppletContextMenu || this instanceof Panel.PanelContextMenu) {
         blurPopupMenusThis._blurPopupMenu(this);
      }
      blurPopupMenusThis.original_popupmenu_open.call(this, animate);
   }

   // Monkey patched over PopupMenu.close()
   //_popupMenuClose(animate) {
   //   blurPopupMenusThis.original_popupmenu_close.call(this, animate);
   //}

   // Set the visible section of the background based on the size of the popup menu
   _setClip(menu){
      if (menu && this._currentMenu && menu === this._currentMenu) {
         let actor = menu.actor;
         if (actor.visible) {
            let bm = menu.box.get_margin();
            this._background.set_clip( actor.x+bm.left, actor.y+bm.top, actor.width-(bm.left+bm.right), actor.height-(bm.top+bm.bottom) );
         } else {
            this._background.set_clip( 0, 0, 0, 0 );
         }
      }
   }

   _onOpenStateChanged(menu, open) {
      if (open) {
         let radius = (settings.popupOverride) ? settings.popupRadius : settings.radius;
         let blurType = (settings.popupOverride) ? settings.popupBlurType : settings.blurType;
         let blendColor = (settings.popupOverride) ? settings.popupBlendColor : settings.blendColor;
         let opacity = (settings.popupOverride) ? settings.popupOpacity : settings.opacity;
         let accentOpacity = (settings.popupOverride) ? settings.popupAccentOpacity : Math.min(settings.opacity+10, 100);
         let saturation = (settings.popupOverride) ? settings.popupSaturation : settings.saturation;

         if (settings.allowTransparentColorPopup) {
            let box = menu.box;
            menu.blurCinnamonData.push( {entry: box, original_entry_color: box.get_background_color(), original_entry_style: box.get_style(),
                                 original_entry_class: box.get_style_class_name(), original_entry_pseudo_class: box.get_style_pseudo_class()} );
            box.set_style( "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                           "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                           "background-gradient-end: transparent;    background: transparent;" );
            // Since menu.actor style is reset every time anyhow, we don't need to remember the style and restore it when the menu closes
            menu.actor.set_style(  "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                           "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                           "background-gradient-end: transparent;    background: transparent;"  );

            // Set the popup menu color
            let [ret,color] = Clutter.Color.from_string( blendColor );
            if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
            color.alpha = opacity*2.55;
            menu.box.set_background_color(color);

            // Setup the popup menu accent actor color
            color.alpha = (accentOpacity)*2.55;
            this._accentColor = color;
            // Find all the accent actors and adjust their transparency and background color
            this._findAccentActors(menu, menu.actor);
         }
         // Setup the blur effect properly
         let curEffect = this._background.get_effect(BLUR_EFFECT_NAME);
         if (blurType === BlurType.None && curEffect) {
            this._background.remove_effect(curEffect);
         } else if (blurType === BlurType.Simple && !(this._blurEffect instanceof Clutter.BlurEffect)) {
            if (curEffect) {
               this._background.remove_effect(curEffect);
            }
            this._blurEffect =  new Clutter.BlurEffect();
            this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
         } else if (blurType === BlurType.Gaussian && !(this._blurEffect instanceof GaussianBlur.GaussianBlurEffect)) {
            if (curEffect) {
               this._background.remove_effect(curEffect);
            }
            this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
            this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
         } else if (blurType !== BlurType.None && curEffect === null) {
            this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
         }
         // Adjust the effects
         if (this._blurEffect instanceof GaussianBlur.GaussianBlurEffect && this._blurEffect.radius != radius) {
            this._blurEffect.radius = radius;
         }
         if (this._desatEffect.factor !== (100-saturation)/100) {
            this._desatEffect.set_factor((100-saturation)/100);
         }

         this._currentMenu = menu;
         if (menu.animating) {
            // Make the background visible but zero size initially, let the paint signal re-clip the background as needed
            this._background.set_clip( 0, 0, 0, 0 );
         } else {
            let actor = menu.actor;
            let margin = actor.get_margin();
            let bm = menu.box.get_margin();
            this._background.set_clip( actor.x+margin.left+bm.left, actor.y+margin.top+bm.top,
                                       actor.width-(margin.left+margin.right)-(bm.left+bm.right),
                                       actor.height-(margin.top+margin.bottom)-(bm.top+bm.bottom) );
         }
         this._background.show();
         // Now that the menu is open we need to know if new actors are added so we can check for accent elements
         menu.blurCinnamonSignalManager.connect(menu.actor, "queue-relayout", () => {this._findAccentActors(menu, menu.actor);} );
      }
   }

   // Called when Popup method is now closed and the animation is complete!
   _onClosed(menu) {
      this._unblurPopupMenu(menu);
   }

   // Look for Popup menu accent actors
   _findAccentActors(menu, actor, indent="") {
      let children = actor.get_children();
      for (let i=0 ; i < children.length ; i++ ) {
         let child = children[i];
         if (child instanceof St.Entry) {
            if (!menu.blurCinnamonData.find( (element) => {return(element.entry === child);} )) {
               menu.blurCinnamonData.push( {entry: child, original_entry_color: child.get_background_color(), original_entry_style: child.get_style(),
                                original_entry_class: child.get_style_class_name(), original_entry_pseudo_class: child.get_style_pseudo_class()} );
            }
            child.set_style( "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                             "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent;    background: transparent;" );
            child.set_background_color(this._accentColor);
         } else if (child instanceof St.BoxLayout) {
            let styleClassName = child.get_style_class_name();
            if (styleClassName && styleClassName.indexOf("menu-favorites-box") !== -1) {
               // This is for the menu@cinnamon.org applet
               if (!menu.blurCinnamonData.find( (element) => {return(element.entry === child);} )) {
                  menu.blurCinnamonData.push( {entry: child, original_entry_color: child.get_background_color(), original_entry_style: child.get_style(),
                                original_entry_class: child.get_style_class_name(), original_entry_pseudo_class: child.get_style_pseudo_class()} );
               }
               child.set_style( "border-radius: 0px; transition-duration: 0;" + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                                "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                                "background-gradient-end: transparent;    background: transparent;" );
               child.set_background_color(this._accentColor);
            }
         } else if (child instanceof St.Table) {
            let name = child.get_name();
            if (name && name.indexOf("notification") !== -1) {
               // Notification messages in the Notifications applet, these messages can be removed by the user so we need to handle that case
               if (!menu.blurCinnamonData.find( (element) => {return(element.entry === child);} )) {
                  menu.blurCinnamonData.push( {entry: child, original_entry_color: child.get_background_color(), original_entry_style: child.get_style(),
                                original_entry_class: child.get_style_class_name(), original_entry_pseudo_class: child.get_style_pseudo_class()} );
                  menu.blurCinnamonSignalManager.connect(child, 'destroy', (actor) =>
                     {
                        // If the child is removed then remove the restore data to avoid errors
                        let idx = menu.blurCinnamonData.findIndex( (element) => {return(element.entry === child);} )
                        if (idx!=-1) {
                           menu.blurCinnamonData.splice(idx,1);
                        }
                     } );
               }
               child.set_style( "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                                "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                                "background-gradient-end: transparent;    background: transparent;" );
               child.set_background_color(this._accentColor);
            }
         }
         //if (child instanceof St.Widget) {
         //   log( `Widget: ${indent}${child}` );
         //}
         this._findAccentActors(menu, child, indent+"  ");
      }
   }

   _blurPopupMenu(menu) {
      menu.blurCinnamonData = [];
      menu.blurCinnamonSignalManager = new SignalManager.SignalManager(null);
      menu.blurCinnamonSignalManager.connect(menu, "open-state-changed", Lang.bind(this, this._onOpenStateChanged) );
      menu.blurCinnamonSignalManager.connect(menu, "menu-animated-closed", Lang.bind(this, this._onClosed) );
      menu.blurCinnamonSignalManager.connect(menu.actor, 'notify::size', () => {this._setClip(menu);} );
      menu.blurCinnamonSignalManager.connect(menu.actor, 'notify::position', () => {this._setClip(menu);} );
   }

   _unblurPopupMenu(menu) {
      menu.blurCinnamonSignalManager.disconnectAllSignals();
      delete menu.blurCinnamonSignalManager;
      let box = menu.box;
      // Restore the menu to it's original state
      for (let i=0 ; i < menu.blurCinnamonData.length ; i++) {
         let entry = menu.blurCinnamonData[i];
         entry.entry.set_background_color(entry.original_entry_color);
         entry.entry.set_style(entry.original_entry_style);
         entry.entry.set_style_class_name(entry.original_entry_class);
         entry.entry.set_style_pseudo_class(entry.original_entry_pseudo_class);
      }
      delete menu.blurCinnamonData;
      if (this._currentMenu === menu) {
         this._background.hide();
         this._currentMenu = null;
      }
   }

   destroy() {
      // Restore monkey patched PopupMenu open & close functions
      PopupMenu.PopupMenu.prototype.open = this.original_popupmenu_open;
      global.overlay_group.remove_actor(this._background);
      this._background.destroy();
      //PopupMenu.PopupMenu.prototype.close = this.original_popupmenu_close;
   }
}

class BlurDesktop {
   constructor() {
      this._signalManager = new SignalManager.SignalManager(null);

      this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: 0, brightness: 1, width: 0, height: 0} );
      this._desatEffect = new Clutter.DesaturateEffect({factor: 1});
      this._brightnessEffect = new Clutter.BrightnessContrastEffect();
      //this._tintEffect = new Clutter.ColorizeEffect( Clutter.Color.from_string( "rgba(0,0,0,0.2)" )[1] );
      global.background_actor.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      global.background_actor.add_effect_with_name( DESAT_EFFECT_NAME, this._desatEffect );
      global.background_actor.add_effect_with_name( BRIGHTNESS_EFFECT_NAME, this._brightnessEffect );
      //global.background_actor.add_effect_with_name( "tint", this._tintEffect );

      this._originalBackgroundColor = global.background_actor.get_background_color();
      this._effects_applied = true;
      this.updateEffects();
   }

   updateEffects() {
      let blurType = (settings.desktopOverride) ? settings.desktopBlurType : settings.blurType;
      let radius = (settings.desktopOverride) ? settings.desktopRadius : settings.radius;
      let blendColor = (settings.desktopOverride) ? settings.desktopBlendColor : settings.blendColor;
      let opacity = (settings.desktopOverride) ? settings.desktopOpacity : settings.opacity;
      let saturation = (settings.desktopOverride) ? settings.desktopSaturation : settings.saturation;

      this._withoutFocusSettings = {radius: radius, opacity: opacity, saturation: saturation};
      if (settings.desktopOverride && settings.desktopWithFocus) {
         this._withFocusSettings = {radius: settings.radius, opacity: settings.opacity, saturation: settings.saturation};
      } else {
         this._withFocusSettings = {radius: 0, opacity: 0, saturation: 100};
      }
      if (this._connected && !settings.desktopWithoutFocus) {
         this._signalManager.disconnectAllSignals();
         this._connected = false
      } else if(!this._connected && settings.desktopWithoutFocus) {
         this._signalManager.connect(global.display, "notify::focus-window", this._onFocusChanged, this);
         this._connected = true;
      }
      let curEffect = global.background_actor.get_effect(BLUR_EFFECT_NAME);
      if (blurType === BlurType.None && curEffect) {
         global.background_actor.remove_effect(curEffect);
      } else if (blurType === BlurType.Simple && !(this._blurEffect instanceof Clutter.BlurEffect)) {
         if (curEffect) {
            global.background_actor.remove_effect(curEffect);
         }
         this._blurEffect = new Clutter.BlurEffect();
         global.background_actor.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      } else if (blurType === BlurType.Gaussian && !(this._blurEffect instanceof GaussianBlur.GaussianBlurEffect)) {
         if (curEffect) {
            global.background_actor.remove_effect(curEffect);
         }
         this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
         global.background_actor.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      } else if (blurType !== BlurType.None && curEffect === null) {
         global.background_actor.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      }
      // Adjust the effects
      if (this._blurEffect instanceof GaussianBlur.GaussianBlurEffect && this._blurEffect.radius != radius) {
         this._blurEffect.radius = radius;
      }
      if (this._desatEffect.factor !== (100-saturation)/100) {
         this._desatEffect.set_factor((100-saturation)/100);
      }
      if (this._brightnessEffect) {
         this._brightnessEffect.set_brightness(-(opacity/100));
      }
      //if (this._tintEffect) {
         //let [ret,color] = Clutter.Color.from_string( blendColor );
         //if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
         //color.alpha = .6; //opacity*2.55;
         //this._tintEffect.set_tint(color);
      //}
      if (this._connected) {
         this._onFocusChanged();
      }
   }

   _onFocusChanged(){
      let window = global.display.get_focus_window();
      if (!window || window.get_window_type() === Meta.WindowType.DESKTOP) {
         if (this._blurEffect instanceof GaussianBlur.GaussianBlurEffect && this._blurEffect.radius != this._withFocusSettings.radius)
            this._blurEffect.radius = this._withFocusSettings.radius;
         if (this._brightnessEffect)
            this._brightnessEffect.set_brightness(-(this._withFocusSettings.opacity/100));
         if (this._desatEffect.factor !== (100-this._withFocusSettings.saturation)/100)
            this._desatEffect.set_factor((100-this._withFocusSettings.saturation)/100);
         this._currentlyWithFocus = true;
         return;
      }
      if (this._currentlyWithFocus) {
         if (this._blurEffect instanceof GaussianBlur.GaussianBlurEffect && this._blurEffect.radius != this._withoutFocusSettings.radius)
            this._blurEffect.radius = this._withoutFocusSettings.radius;
         if (this._brightnessEffect)
            this._brightnessEffect.set_brightness(-(this._withoutFocusSettings.opacity/100));
         if (this._desatEffect.factor !== (100-this._withoutFocusSettings.saturation)/100)
            this._desatEffect.set_factor((100-this._withoutFocusSettings.saturation)/100);
         this._currentlyWithFocus = false;
      }
   }

   destroy() {
      this._signalManager.disconnectAllSignals();
      let effect = global.background_actor.get_effect(BLUR_EFFECT_NAME);
      if (effect) {
         global.background_actor.remove_effect(effect);
      }
      effect = global.background_actor.get_effect(DESAT_EFFECT_NAME);
      if (effect) {
         global.background_actor.remove_effect(effect);
      }
      effect = global.background_actor.get_effect(BRIGHTNESS_EFFECT_NAME);
      if (effect) {
         global.background_actor.remove_effect(effect);
      }
   }
}

class BlurSettings {
   constructor(uuid) {
      this.settings = new Settings.ExtensionSettings(this, uuid);
      this.settings.bind('opacity',    'opacity',    colorChanged);
      this.settings.bind('blurType',   'blurType',   blurChanged);
      this.settings.bind('radius',     'radius',     blurChanged);
      this.settings.bind('blendColor', 'blendColor', colorChanged);
      this.settings.bind('saturation', 'saturation', saturationChanged);

      this.settings.bind('overview-opacity',    'overviewOpacity');
      this.settings.bind('overview-blurType',   'overviewBlurType');
      this.settings.bind('overview-radius',     'overviewRadius');
      this.settings.bind('overview-blendColor', 'overviewBlendColor');
      this.settings.bind('overview-saturation', 'overviewSaturation');

      this.settings.bind('expo-opacity',    'expoOpacity');
      this.settings.bind('expo-blurType',   'expoBlurType');
      this.settings.bind('expo-radius',     'expoRadius');
      this.settings.bind('expo-blendColor', 'expoBlendColor');
      this.settings.bind('expo-saturation', 'expoSaturation');

      this.settings.bind('panels-opacity',    'panelsOpacity',    colorChanged);
      this.settings.bind('panels-blurType',   'panelsBlurType',   blurChanged);
      this.settings.bind('panels-radius',     'panelsRadius',     blurChanged);
      this.settings.bind('panels-blendColor', 'panelsBlendColor', colorChanged);
      this.settings.bind('panels-saturation', 'panelsSaturation', saturationChanged);

      this.settings.bind('popup-opacity',        'popupOpacity');
      this.settings.bind('popup-accent-opacity', 'popupAccentOpacity');
      this.settings.bind('popup-blurType',       'popupBlurType');
      this.settings.bind('popup-radius',         'popupRadius');
      this.settings.bind('popup-blendColor',     'popupBlendColor');
      this.settings.bind('popup-saturation',     'popupSaturation');
      this.settings.bind('allow-transparent-color-popup', 'allowTransparentColorPopup');

      this.settings.bind('desktop-opacity',       'desktopOpacity',      updateDesktopEffects);
      this.settings.bind('desktop-blurType',      'desktopBlurType',     updateDesktopEffects);
      this.settings.bind('desktop-radius',        'desktopRadius',       updateDesktopEffects);
      this.settings.bind('desktop-blendColor',    'desktopBlendColor',   updateDesktopEffects);
      this.settings.bind('desktop-saturation',    'desktopSaturation',   updateDesktopEffects);
      this.settings.bind('desktop-with-focus',    'desktopWithFocus',    updateDesktopEffects);
      this.settings.bind('desktop-without-focus', 'desktopWithoutFocus', updateDesktopEffects);

      this.settings.bind('enable-overview-override', 'overviewOverride');
      this.settings.bind('enable-expo-override',     'expoOverride');
      this.settings.bind('enable-panels-override',   'panelsOverride', panelsSettingsChangled);
      this.settings.bind('enable-popup-override',    'popupOverride');
      this.settings.bind('enable-desktop-override',    'desktopOverride', updateDesktopEffects);

      this.settings.bind('enable-overview-effects', 'enableOverviewEffects', enableOverviewChanged);
      this.settings.bind('enable-expo-effects',     'enableExpoEffects',     enableExpoChanged);
      this.settings.bind('enable-panels-effects',   'enablePanelsEffects',   enablePanelsChanged);
      this.settings.bind('enable-popup-effects',    'enablePopupEffects',    enablePopupChanged);
      this.settings.bind('enable-desktop-effects',  'enableDesktopEffects',  enableDesktopChanged);

      this.settings.bind('enable-panel-unique-settings', 'enablePanelUniqueSettings');
      this.settings.bind('panel-unique-settings', 'panelUniqueSettings', panelsSettingsChangled);
      this.settings.bind('allow-transparent-color-panels', 'allowTransparentColorPanels', colorChanged);
   }
}

function updateDesktopEffects() {
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
}

function saturationChanged() {
   if (blurPanels) {
      blurPanels.updateSaturation();
   }
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
}

function colorChanged() {
   if (blurPanels) {
      blurPanels.updateColor();
   }
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
}

function blurChanged() {
   if (blurPanels) {
      blurPanels.updateBlur();
   }
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
}

function panelsSettingsChangled() {
   if (blurPanels) {
      blurPanels.updateBlur();
      blurPanels.updateColor();
      blurPanels.updateSaturation();
   }
}

function enableOverviewChanged() {
   if (settings.enableOverviewEffects) {
      Overview.Overview.prototype._animateVisible = _animateVisibleOverview;
      Overview.Overview.prototype._oldAnimateVisible = originalAnimateOverview;
   } else {
      delete Overview.Overview.prototype._oldAnimateVisible;
      Overview.Overview.prototype._animateVisible = originalAnimateOverview;
   }
}

function enableExpoChanged() {
   if (settings.enableExpoEffects) {
      Expo.Expo.prototype._animateVisible = _animateVisibleExpo;
      Expo.Expo.prototype._oldAnimateVisible = originalAnimateExpo;
   } else {
      delete Expo.Expo.prototype._oldAnimateVisibleExpo;
      Expo.Expo.prototype._animateVisible = originalAnimateExpo;
   }
}

function enablePanelsChanged() {
   if (blurPanels && !settings.enablePanelsEffects) {
      blurPanels.destroy();
      blurPanels = null;
   } else if (!blurPanels && settings.enablePanelsEffects ) {
      blurPanels = new BlurPanels();
   }
}

function enablePopupChanged() {
   if (blurPopupMenus && !settings.enablePopupEffects) {
      blurPopupMenus.destroy();
      blurPopupMenus = null;
   } else if (!blurPopupMenus && settings.enablePopupEffects ) {
      blurPopupMenus = new BlurPopupMenus();
   }
}

function enableDesktopChanged() {
   if (blurDesktop && !settings.enableDesktopEffects) {
      blurDesktop.destroy();
      blurDesktop = null;
   } else if (!blurDesktop && settings.enableDesktopEffects ) {
      blurDesktop = new BlurDesktop();
   }
}

function init(extensionMeta) {
   settings = new BlurSettings(extensionMeta.uuid);

   originalAnimateOverview = Overview.Overview.prototype._animateVisible;
   originalAnimateExpo = Expo.Expo.prototype._animateVisible;
}

function enable() {
   // Monkey patch to enable Overview effects
   if (settings.enableOverviewEffects) {
      Overview.Overview.prototype._animateVisible = this._animateVisibleOverview;
      Overview.Overview.prototype._oldAnimateVisible = originalAnimateOverview;
   }

   // Monkey patch to enable Expo effects
   if (settings.enableExpoEffects) {
      Expo.Expo.prototype._animateVisible = this._animateVisibleExpo;
      Expo.Expo.prototype._oldAnimateVisible = originalAnimateExpo;
   }

   // Create a Panel Effects class instance, the constructor will kick things off
   if (settings.enablePanelsEffects) {
      blurPanels = new BlurPanels();
   }
   // Create a Popup menu Effects class instance, the constructor will set everything up.
   if (settings.enablePopupEffects) {
      blurPopupMenus = new BlurPopupMenus();
   }
   // Create a Desktop Effects class instance, the constructor will set everything up.
   if (settings.enableDesktopEffects) {
      blurDesktop = new BlurDesktop();
   }
}

function disable() {
   if (settings.enableOverviewEffects) {
      delete Overview.Overview.prototype._oldAnimateVisible;
      Overview.Overview.prototype._animateVisible = originalAnimateOverview;
   }

   if (settings.enableExpoEffects) {
      delete Expo.Expo.prototype._oldAnimateVisibleExpo;
      Expo.Expo.prototype._animateVisible = originalAnimateExpo;
   }

   if (blurPanels) {
      blurPanels.destroy();
      blurPanels = null;
   }

   if (blurPopupMenus) {
      blurPopupMenus.destroy();
      blurPopupMenus = null;
   }

   if (blurDesktop) {
      blurDesktop.destroy();
      blurDesktop = null;
   }
}
