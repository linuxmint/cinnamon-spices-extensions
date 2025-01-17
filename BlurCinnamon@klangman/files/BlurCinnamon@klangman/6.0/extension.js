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

const GaussianBlur = require("./gaussian_blur");

const ANIMATION_TIME = 0.25;
const AUTOHIDE_ANIMATION_TIME = 0.2;  // This is a copy of "Panel.AUTOHIDE_ANIMATION_TIME", we can't legally access it since it's a const and EC6 does not allow it

let originalAnimateOverview;
let originalAnimateExpo;

let settings;
let blurPanels;

var blurExtensionThis;

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

   // Get the overview's background image and add the BlurEffect to it if configured to do so
   if (blurType > BlurType.None) {
      let fx;
      let desktopBackground = children[0];
      if (blurType === BlurType.Simple) {
         fx =  new Clutter.BlurEffect();
      } else {
         fx = new GaussianBlur.GaussianBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
      }
      desktopBackground.add_effect_with_name( "blur", fx );
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
   if (blurType > BlurType.None) {
      let fx;
      let desktopBackground = this._background
      if (blurType === BlurType.Simple) {
         fx =  new Clutter.BlurEffect();
      } else {
         fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
      }
      desktopBackground.add_effect_with_name( "blur", fx );
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

function panelHasOpenMenus() {
   return global.menuStackLength > 0;
}

// This class manages the blurring of the panels
class BlurPanels {

   constructor() {
      this._signalManager = new SignalManager.SignalManager(null);
      this._blurredPanels = [];
      this._blurExistingPanels();

      blurExtensionThis = this; // Make the 'this' pointer available in patch functions

      // Monkey patch panel functions so we can manage the blurred backgrounds when the panels are hidden/shown
      this._originalPanelEnable    = Panel.Panel.prototype.enable;
      this._originalPanelDisable   = Panel.Panel.prototype.disable;
      this._originalPanelShowPanel = Panel.Panel.prototype._showPanel;
      this._originalPanelHidePanel = Panel.Panel.prototype._hidePanel;

      Panel.Panel.prototype.enable     = this.blurEnable;
      Panel.Panel.prototype.disable    = this.blurDisable;
      Panel.Panel.prototype._showPanel = this.blurShowPanel;
      Panel.Panel.prototype._hidePanel = this.blurHidePanel;

      // Connect to important events
      this._signalManager.connect(global.settings, "changed::panels-enabled",   this._panel_changed, this);
      this._signalManager.connect(global.settings, "changed::panels-height",    this._panel_changed, this);
      this._signalManager.connect(global.settings, "changed::panels-resizable", this._panel_changed, this);
      this._signalManager.connect(global.settings, "changed::panels-autohide",  this._panel_changed, this);
      this._signalManager.connect(Main.layoutManager, "monitors-changed",       this._panel_changed, this);
      this._signalManager.connect(global.display,  "in-fullscreen-changed",     this._fullscreen_changed, this);
   }

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
      for ( let i=0 ; i < this._blurredPanels.length || i < panels.length  ; i++ ) {
         if (panels[i]) {
            let panel = panels[i];
            let blurredPanel = panel.__blurredPanel;
            if (blurredPanel) {
               // The panel height might have changed
               let actor = panel.actor;
               blurredPanel.background.set_clip( actor.x, actor.y, actor.width, actor.height );
            } else {
               // A new panel was added, so we need to apply the effects to it
               this._blurPanel( panel, i );
            }
         } else if (this._blurredPanels[i]) {
            // A panel was removed
            let blurredPanel = this._blurredPanels[i];
            if (blurredPanel.background) {
               blurredPanel.background.destroy();
               this._blurredPanels[i] = null;
            }
         }
      }
   }

   // Apply the blur effects to all the existing panels
   _blurExistingPanels() {
      let panels = Main.getPanels();

      for ( let i=0 ; i < panels.length ; i++ ) {
         if (panels[i]) {
            this._blurPanel(  panels[i], i );
         }
      }
   }

   // Create a new blur effect for the panel argument.
   _blurPanel(panel, index) {
      let panelSettings = this._getPanelSettings(panel, index);
      if (!panelSettings ) return;
      let [opacity, blendColor, blurType, radius] = panelSettings;

      let actor = panel.actor;
      let blurredPanel = panel.__blurredPanel;

      // Emulate the Cinnamon 6.4 panel._panelHasOpenMenus() function for older Cinnamon releases
      if (typeof panel._panelHasOpenMenus !== "function") {
         this.added_panelHasOpenMenus = true;
         panel._panelHasOpenMenus = panelHasOpenMenus;
      }
      if (!blurredPanel) {
         // Save the current panel setting if we don't already have the data saved
         blurredPanel = { original_color: null, origianl_style: null, original_class: null, original_pseudo_class: null, background: null, effect: null };
         blurredPanel.original_color = actor.get_background_color();
         blurredPanel.original_style = actor.get_style();
         blurredPanel.original_class = actor.get_style_class_name();
         blurredPanel.original_pseudo_class = actor.get_style_pseudo_class();
         panel.__blurredPanel = blurredPanel;
         this._blurredPanels[index] = blurredPanel;
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
      if (blurType > BlurType.None) {
         let fx;
         let background = Meta.X11BackgroundActor.new_for_display(global.display);
         global.overlay_group.add_actor(background);
         if (blurType === BlurType.Simple) {
            fx =  new Clutter.BlurEffect();
         } else {
            fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1 , width: 0, height: 0} );
         }
         background.add_effect_with_name( "blur", fx );
         background.set_clip( panel.actor.x, panel.actor.y, panel.actor.width, panel.actor.height );
         if (panel._hidden || global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
            background.hide();
         }
         blurredPanel.effect = fx;
         blurredPanel.background = background;
      }
   }

   // This function will restore all panels to their original state and undo the monkey patching
   unblurPanels() {
      let panels = Main.getPanels();

      this._signalManager.disconnectAllSignals();

      // Restore the panels to their original state
      for ( let i=0 ; i < panels.length ; i++ ) {
         this._unblurPanel(panels[i], i);
      }

      // Restore the original functions that we monkey patched
      Panel.Panel.prototype.enable     = this._originalPanelEnable;
      Panel.Panel.prototype.disable    = this._originalPanelDisable;
      Panel.Panel.prototype._showPanel = this._originalPanelShowPanel;
      Panel.Panel.prototype._hidePanel = this._originalPanelHidePanel;
   }

   _unblurPanel(panel, index) {
      if (panel && this._blurredPanels[index]) {
         let actor = panel.actor;
         let blurredPanel = this._blurredPanels[index];

         actor.set_background_color(blurredPanel.original_color);
         actor.set_style(blurredPanel.original_style);
         actor.set_style_class_name(blurredPanel.original_class);
         actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
         if (blurredPanel.background) {
            blurredPanel.background.remove_effect(blurredPanel.effect);
            blurredPanel.background.destroy();
         }
         this._blurredPanels[index] = null;
         delete panel.__blurredPanel;
         if (this.added_panelHasOpenMenus) {
            delete panel._panelHasOpenMenus;
         }
      }
   }

   // An extension setting controlling how the dim overlay was modified
   updateColor() {
      let panels = Main.getPanels();
      for ( let i=0 ; i < this._blurredPanels.length ; i++ ) {
         if (panels[i] && this._blurredPanels[i]) {
            let panelSettings = this._getPanelSettings(panels[i], i);
            if (panelSettings) {
               let actor = panels[i].actor;
               let [opacity, blendColor, blurType, radius] = panelSettings;
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
                  let blurredPanel = this._blurredPanels[i]
                  actor.set_background_color(blurredPanel.original_color);
                  actor.set_style(blurredPanel.original_style);
                  actor.set_style_class_name(blurredPanel.original_class);
                  actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
               }
            }
         }
      }
   }

   // An extension setting controlling how to blur is handled was modified
   updateBlur() {
      let panels = Main.getPanels();
      for ( let i=0 ; i < panels.length ; i++ ) {
         if (panels[i]) {
            let panelSettings = this._getPanelSettings(panels[i], i);
            if (panelSettings) {
               let [opacity, blendColor, blurType, radius] = panelSettings;
               let blurredPanel = panels[i].__blurredPanel;
               if (blurredPanel) {
                  if (blurType !== BlurType.None && !blurredPanel.background) {
                     this._blurPanel(panels[i], i);
                  } else if (blurType === BlurType.None && blurredPanel.background) {
                     blurredPanel.background.remove_effect(blurredPanel.effect);
                     blurredPanel.background.destroy();
                     blurredPanel.background = null;
                  } else if (blurType === BlurType.Simple && blurredPanel.effect instanceof GaussianBlur.GaussianBlurEffect) {
                     blurredPanel.background.remove_effect(blurredPanel.effect);
                     blurredPanel.effect =  new Clutter.BlurEffect();
                     blurredPanel.background.add_effect_with_name( "blur", blurredPanel.effect );
                  } else if (blurType === BlurType.Gaussian && blurredPanel.effect instanceof Clutter.BlurEffect) {
                     blurredPanel.background.remove_effect(blurredPanel.effect);
                     blurredPanel.effect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
                     blurredPanel.background.add_effect_with_name( "blur", blurredPanel.effect );
                  } else if (blurType === BlurType.Gaussian && blurredPanel.radius !== radius) {
                     blurredPanel.effect.radius = radius;
                  }
               } else {
                  this._blurPanel(panels[i], i);
               }
            } else {
               // No settings found to apply to this panel, so remove all effects for this panel
               this._unblurPanel(panels[i], i)
            }
         }
      }
   }

   // Determine the settings that should apply for the panel argument panel
   _getPanelSettings(panel, index) {
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
               return [uniqueSetting.opacity, uniqueSetting.color, uniqueSetting.blurtype, uniqueSetting.radius];
            }
         }
         return null;
      } else {
         let radius = (settings.panelsOverride) ? settings.panelsRadius : settings.radius;
         let blurType = (settings.panelsOverride) ? settings.panelsBlurType : settings.blurType;
         let blendColor = (settings.panelsOverride) ? settings.panelsBlendColor : settings.blendColor;
         let opacity = (settings.panelsOverride) ? settings.panelsOpacity : settings.opacity;
         return [opacity, blendColor, blurType, radius];
      }
   }

   // Functions that will be monkey patched over the Panel functions
   blurEnable(...params) {
      try {
         if (this.__blurredPanel && this.__blurredPanel.background && !global.display.get_monitor_in_fullscreen(this.monitorIndex) && !this._hidden) {
            this.__blurredPanel.background.show();
            this.__blurredPanel.background.ease(
               {opacity: 255, duration: AUTOHIDE_ANIMATION_TIME * 1000, mode: Clutter.AnimationMode.EASE_OUT_QUAD } );
         }
      } catch (e) {}
      blurExtensionThis._originalPanelEnable.apply(this, params);
   }

   blurDisable(...params) {
      try {
         if (this.__blurredPanel && this. __blurredPanel.background && !this._hidden) {
            this.__blurredPanel.background.ease(
               {opacity: 0, duration: AUTOHIDE_ANIMATION_TIME * 1000, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                  onComplete: () => { this.__blurredPanel.background.hide(); } });
         }
      } catch (e) {}
      blurExtensionThis._originalPanelDisable.apply(this, params);
   }

   blurShowPanel(...params) {
      try {
         if (!this._disabled && this._hidden) {
            let background = this.__blurredPanel.background;
            this.__blurredPanel.background.show();
            Tweener.addTween(this.__blurredPanel.background, {time: AUTOHIDE_ANIMATION_TIME, onUpdateScope: this, onUpdate: () => {
               this.__blurredPanel.background.set_clip( this.actor.x, this.actor.y, this.actor.width, this.actor.height );
            } } );
         }
      } catch (e) {}
      blurExtensionThis._originalPanelShowPanel.apply(this, params);
   }

   blurHidePanel(force) {
      try {
         let background = this.__blurredPanel.background;
         if (background && background.is_visible() && !this._destroyed && (!this._shouldShow || force) && !this._panelHasOpenMenus()) {
            Tweener.addTween(background, {time: AUTOHIDE_ANIMATION_TIME, onUpdateScope: this, onUpdate: () => { 
               this.__blurredPanel.background.set_clip( this.actor.x, this.actor.y, this.actor.width, this.actor.height ); 
            }, onComplete: () => { background.hide(); } } );
         }
      } catch (e) {}
      blurExtensionThis._originalPanelHidePanel.apply(this, force);
   }
}

class BlurSettings {
   constructor(uuid) {
      this.settings = new Settings.ExtensionSettings(this, uuid);
      this.settings.bind('opacity',    'opacity',    colorChanged);
      this.settings.bind('blurType',   'blurType',   blurChanged);
      this.settings.bind('radius',     'radius',     blurChanged);
      this.settings.bind('blendColor', 'blendColor', colorChanged);

      this.settings.bind('overview-opacity',    'overviewOpacity');
      this.settings.bind('overview-blurType',   'overviewBlurType');
      this.settings.bind('overview-radius',     'overviewRadius');
      this.settings.bind('overview-blendColor', 'overviewBlendColor');

      this.settings.bind('expo-opacity',    'expoOpacity');
      this.settings.bind('expo-blurType',   'expoBlurType');
      this.settings.bind('expo-radius',     'expoRadius');
      this.settings.bind('expo-blendColor', 'expoBlendColor');

      this.settings.bind('panels-opacity',    'panelsOpacity',    colorChanged);
      this.settings.bind('panels-blurType',   'panelsBlurType',   blurChanged);
      this.settings.bind('panels-radius',     'panelsRadius',     blurChanged);
      this.settings.bind('panels-blendColor', 'panelsBlendColor', colorChanged);

      this.settings.bind('enable-overview-override', 'overviewOverride');
      this.settings.bind('enable-expo-override',     'expoOverride');
      this.settings.bind('enable-panels-override',   'panelsOverride', panelsSettingsChangled);

      this.settings.bind('enable-overview-effects', 'enableOverviewEffects', enableOverviewChanged);
      this.settings.bind('enable-expo-effects',     'enableExpoEffects',     enableExpoChanged);
      this.settings.bind('enable-panels-effects',   'enablePanelsEffects',   enablePanelsChanged);

      this.settings.bind('enable-panel-unique-settings', 'enablePanelUniqueSettings');
      this.settings.bind('panel-unique-settings', 'panelUniqueSettings', panelsSettingsChangled);
      this.settings.bind('allow-transparent-color-panels', 'allowTransparentColorPanels', colorChanged);
   }
}

function colorChanged() {
   if (blurPanels) {
      blurPanels.updateColor();
   }
}

function blurChanged() {
   if (blurPanels) {
      blurPanels.updateBlur();
   }
}

function panelsSettingsChangled() {
   if (blurPanels) {
      blurPanels.updateBlur();
      blurPanels.updateColor();
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
      blurPanels.unblurPanels();
      blurPanels = null;
   } else if (!blurPanels && settings.enablePanelsEffects ) {
      blurPanels = new BlurPanels();
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
      blurPanels.unblurPanels();
      blurPanels = null;
   }
}
