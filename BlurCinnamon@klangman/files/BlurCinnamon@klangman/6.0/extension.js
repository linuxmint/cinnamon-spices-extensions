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
const AppSwitcher3D = imports.ui.appSwitcher.appSwitcher3D;
const Settings      = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Panel         = imports.ui.panel;
const Main          = imports.ui.main;
const Meta          = imports.gi.Meta;
const Mainloop      = imports.mainloop;
const AppletManager = imports.ui.appletManager;
const Lang          = imports.lang;
const UPowerGlib    = imports.gi.UPowerGlib;
const MessageTray   = imports.ui.messageTray;
const Util          = imports.misc.util;
const Tooltips      = imports.ui.tooltips;

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
let originalInitAppSwitcher3D;
let originalHideAppSwitcher3D;

let settings;
let blurPanels;
let blurPopupMenus;
let blurDesktop;
let blurNotifications;
let blurTooltips;
let metaData;

var blurPanelsThis;
var blurPopupMenusThis;
var blurNotificationsThis;
var blurTooltipsThis;

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

function debugMsg(...params) {
   //log(...params);
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

function _initAppSwitcher3D(...params) {
   this._oldInit(...params);

   if (this._background && this.actor) {
      let blurType = (settings.appswitcherOverride) ? settings.appswitcherBlurType : settings.blurType;
      let radius = (settings.appswitcherOverride) ? settings.appswitcherRadius : settings.radius;
      let blendColor = (settings.appswitcherOverride) ? settings.appswitcherBlendColor : settings.blendColor;
      let opacity = (settings.appswitcherOverride) ? settings.appswitcherOpacity : settings.opacity;
      let saturation = (settings.appswitcherOverride) ? settings.appswitcherSaturation : settings.saturation;

      let desktopBackground = this._background
      if (blurType > BlurType.None) {
         let fx;
         if (blurType === BlurType.Simple) {
            fx =  new Clutter.BlurEffect();
         } else {
            fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
         }
         desktopBackground.add_effect_with_name( BLUR_EFFECT_NAME, fx );
         this._blurCinnamonBlurEffect = fx;
      }
      if (saturation<100) {
         let desat = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
         desktopBackground.add_effect_with_name( DESAT_EFFECT_NAME, desat );
         this._blurCinnamonDesatEffect = desat;
      }

      let [ret,color] = Clutter.Color.from_string( blendColor );
      if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
      color.alpha = opacity*2.55;
      this.actor.set_background_color(color);
   }
}

function _hideAppSwitcher3D(...params) {
   if (this._background && this._blurCinnamonBlurEffect) {
      this._background.remove_effect(this._blurCinnamonBlurEffect);
   }
   if (this._background && this._blurCinnamonDesatEffect) {
      this._background.remove_effect(this._blurCinnamonDesatEffect);
   }
   this._oldHide(...params);
}

// This is an implementation of Panel._panelHasOpenMenus() that will be used in pre-Cinnamon 6.4 versions
function panelHasOpenMenus() {
   return global.menuStackLength > 0;
}

class BlurBase {
   constructor() {
   }

   _getGenericSettings() {
      return [settings.opacity, settings.blendColor, settings.blurType, settings.radius, settings.saturation];
   }

   _getUniqueSettings() {
      log( "Error: Blur effect class does not implement _getUniqueSettings()!" );
   }

   _getColor(colorString, opacity) {
      let [ret,color] = Clutter.Color.from_string( colorString );
      if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
      color.alpha = opacity*2.55;
      return color;
   }

   // Returns [opacity, blendColor, blurType, radius, saturation]
   _getSettings(override) {
      if (override) {
         return this._getUniqueSettings();
      } else {
         return this._getGenericSettings();
      }
   }

   _createBackgroundAndEffects(blurType, radius, saturation) {
      let blurEffect;
      let desatEffect;
      let background;
      // Create the effects and the background actor to apply to effects to
      if (blurType === BlurType.Simple) {
         blurEffect =  new Clutter.BlurEffect();
      } else if (blurType === BlurType.Gaussian) {
         blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1 , width: 0, height: 0} );
      }
      if (saturation<100) {
         desatEffect = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
      }
      if (!Meta.is_wayland_compositor()) {
         background = Meta.X11BackgroundActor.new_for_display(global.display);
      } else {
         background = new Clutter.Actor();
      }
      if (blurEffect)
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      if (desatEffect)
         background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect );
      global.overlay_group.add_actor(background);
      background.hide();
      return [background, blurEffect, desatEffect];
   }

   _updateEffects(blurType, radius, saturation) {
      // Setup the blur effect properly
      let curEffect = this._background.get_effect(BLUR_EFFECT_NAME);
      if (blurType === BlurType.None && curEffect) {
         this._background.remove_effect(curEffect);
      } else if (blurType === BlurType.Simple && !(curEffect instanceof Clutter.BlurEffect)) {
         if (curEffect) {
            this._background.remove_effect(curEffect);
         }
         this._blurEffect =  new Clutter.BlurEffect();
         this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      } else if (blurType === BlurType.Gaussian && !(curEffect instanceof GaussianBlur.GaussianBlurEffect)) {
         if (curEffect) {
            this._background.remove_effect(curEffect);
         }
         this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
         this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      }// else if (blurType !== BlurType.None && curEffect === null) {
         // The last used blur effect is correct, but not enabled, so enable it
      //   this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      //}
      // Adjust the blur effects
      if (curEffect instanceof GaussianBlur.GaussianBlurEffect && curEffect.radius != radius) {
         curEffect.radius = radius;
      }
      // Setup/Adjust the desaturation effect
      curEffect = this._background.get_effect(DESAT_EFFECT_NAME);
      if (curEffect && saturation === 100) {
         this._background.remove_effect(curEffect);
         this._desatEffect = null;
      } else if (curEffect && curEffect.factor !== (100-saturation)/100) {
         curEffect.set_factor((100-saturation)/100);
      } else if (!curEffect && saturation<100) {
         this._desatEffect = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
         this._background.add_effect_with_name( DESAT_EFFECT_NAME, this._desatEffect );
      }
   }

   _setClip(actor, marginsActor=null) {
      //this._printActor(actor);
      if (marginsActor) {
         let themeNode = marginsActor.get_theme_node();
         let left   = themeNode.get_margin(St.Side.LEFT)   //+ themeNode.get_padding(St.Side.LEFT);
         let right  = themeNode.get_margin(St.Side.RIGHT)  //+ themeNode.get_padding(St.Side.RIGHT);
         let top    = themeNode.get_margin(St.Side.TOP)    //+ themeNode.get_padding(St.Side.TOP);
         let bottom = themeNode.get_margin(St.Side.BOTTOM) //+ themeNode.get_padding(St.Side.BOTTOM);
         //log( `Margins: ${left}, ${right}, ${top}, ${bottom}` );
         this._background.set_clip( actor.x+left, actor.y+top, actor.width-(left+right), actor.height-(top+bottom) );
      } else {
         this._background.set_clip( actor.x, actor.y, actor.width, actor.height );
      }
   }

   _printActor(actor) {
      let themeNode = actor.get_theme_node();
      let margins = actor.get_margin();
      log( `Actor: ${actor} : visible: ${actor.visible}` );
      log( `  Size:    ${actor.x} ${actor.y} ${actor.width} ${actor.height}` );
      log( `  Margin:  ${themeNode.get_margin(St.Side.LEFT)} ${themeNode.get_margin(St.Side.RIGHT)} ${themeNode.get_margin(St.Side.TOP)} ${themeNode.get_margin(St.Side.BOTTOM)}` );
      log( `  Border:  ${themeNode.get_border_width(St.Side.LEFT)} ${themeNode.get_border_width(St.Side.RIGHT)} ${themeNode.get_border_width(St.Side.TOP)} ${themeNode.get_border_width(St.Side.BOTTOM)}` );
      log( `  Padding: ${themeNode.get_padding(St.Side.LEFT)} ${themeNode.get_padding(St.Side.RIGHT)} ${themeNode.get_padding(St.Side.TOP)} ${themeNode.get_padding(St.Side.BOTTOM)}` );
      log( `  Margin:  ${margins.left} ${margins.right} ${margins.top} ${margins.bottom}` );
   }
}

// This class manages the blurring of the panels
class BlurPanels extends BlurBase {

   constructor() {
      super();
      this._signalManager = new SignalManager.SignalManager(null);
      this._maximizeSignalManager = new SignalManager.SignalManager(null);
      this._blurredPanels = [];
      this._blurExistingPanels();

      blurPanelsThis = this; // Make the 'this' pointer available in patch functions

      // Monkey patch panel functions so we can manage the blurred backgrounds when the panels are hidden/shown
      this._originalPanelEnable    = Panel.Panel.prototype.enable;
      this._originalPanelDisable   = Panel.Panel.prototype.disable;

      Panel.Panel.prototype.enable  = this.blurEnable;
      Panel.Panel.prototype.disable = this.blurDisable;

      // Connect to events so we know if panels are added or removed
      this._signalManager.connect(global.settings,    "changed::panels-enabled", this._panel_changed, this);
      this._signalManager.connect(Main.layoutManager, "monitors-changed",        this._panel_changed, this);
      // Connect to an event that can hide the panels
      this._signalManager.connect(global.display,     "in-fullscreen-changed",   this._fullscreen_changed, this);

      this.setupMaximizeMonitoring();

      // Get notified when we resume from sleep so we can try and fix up the blurred panels
      // There has a been a report of issues after a resume
      //this._upClient = new UPowerGlib.Client();
      //log( "Blur Cinnamon: using notify::resume" );
      //this._upClient.connect('notify::resume', Lang.bind(this, this._resumeedFromSleep));
   }

   setupMaximizeMonitoring() {
      if (settings.noPanelEffectsMaximized) {
         // Connect to events so we can know if there is a maximized window
         this._maximizeSignalManager.connect(global.window_manager, "size-change", this._on_window_size_change, this);
         this._maximizeSignalManager.connect(global.window_manager, "unminimize", this._on_window_unminimize, this);
         this._maximizeSignalManager.connect(global.window_manager, "minimize", this._on_window_minimize, this);
         this._maximizeSignalManager.connect(global.window_manager, "switch-workspace", this._on_workspace_switch, this);
         this._maximizeSignalManager.connect(global.window_manager, "destroy", this._on_window_removed, this);
         this._maximizeSignalManager.connect(global.screen, "window-added", this._on_window_added, this);
         //this._maximizeSignalManager.connect(global.screen, "window-monitor-changed", this.windowMonitorChanged, this);
         this._maximizeSignalManager.connect(global.screen, "window-workspace-changed", this._on_window_workspace_changed, this);
         // If there are panels to make transparent, then do it now.
         if (this._blurredPanels.length) {
            this._setupPanelTransparencyOnAllMonitors();
         }
      } else {
         // Remove all the signals for detecting maximized windows
         this._maximizeSignalManager.disconnectAllSignals();
         // Make sure all the panels are made transparent
         if (this._blurredPanels.length) {
            this._applyPanelTransparencyOnAllMonitors();
         }
      }
   }

   //_resumeedFromSleep() {
   //   log( "Blur Cinnamon: We have resumed from sleep!" );
   //}

   _on_window_workspace_changed(screen, metaWindow, metaWorkspace) {
      let workspace = global.screen.get_active_workspace();
      if (workspace === metaWorkspace) {
         if (this._windowIsMaximized(metaWindow)) {
            this._setTransparencyForEachPanelOnMonitor(metaWindow.get_monitor(), false);
         }
      } else {
         if (this._windowIsMaximized(metaWindow)) {
            this._setupPanelTransparencyOnMonitor(metaWindow.get_monitor());
         }
      }
   }

   _on_window_added(screen, metaWindow, monitor) {
      if (this._blurredPanels.length === 0) return;
      // Post an event to the end of the event queue, if we check right away we won't see this new window as maximized just yet
      Mainloop.idle_add( () => {
            if (this._windowIsMaximized(metaWindow)) {
               this._setTransparencyForEachPanelOnMonitor(monitor, false);
            }
      });
   }

   _on_window_removed(ws, win) {
      if (this._blurredPanels.length === 0) return;
      // If we removed a mizimized window, then we might need to make panels transparent
      let metaWindow = win.get_meta_window();
      let monitor = metaWindow.get_monitor();
      if (this._windowIsMaximized(metaWindow)) {
         // The removed window doesn't show up in the list of windows on this monitor any more, so it's safe to check now for all maximized windows
         this._setupPanelTransparencyOnMonitor(monitor);
      }
   }

   _on_window_size_change(wm, win, change) {
      if (this._blurredPanels.length === 0) return;

      let metaWindow = win.get_meta_window();
      let monitor = metaWindow.get_monitor();
      if (change === Meta.SizeChange.MAXIMIZE) {
         this._setTransparencyForEachPanelOnMonitor(monitor, false);
      } else if (change === Meta.SizeChange.UNMAXIMIZE || change === Meta.SizeChange.TILE) {
         this._setupPanelTransparencyOnMonitor(monitor);
      }
   }

   _on_window_minimize(wm, win) {
      if (this._blurredPanels.length === 0) return;

      let metaWindow = win.get_meta_window();
      if (metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH) {
         let monitor = metaWindow.get_monitor();
         this._setupPanelTransparencyOnMonitor(monitor);
      }
   }

   _on_window_unminimize(wm, win) {
      if (this._blurredPanels.length === 0) return;

      // A window was unminimized one one monitor, so we need check for other maximized windows on that monitor and set the panels transparency for panels on that monitor
      let metaWindow = win.get_meta_window();
      if (this._windowIsMaximized(metaWindow)) {
         let monitor = metaWindow.get_monitor();
         this._setupPanelTransparencyOnMonitor(monitor);
      }
   }

   _on_workspace_switch() {
      if (this._blurredPanels.length === 0) return;

      // All the windows on all monitors have changed, so we have to check everything
      this._setupPanelTransparencyOnAllMonitors();
   }

   // A window has changed on the one monitor so we need to setup the panels transparency of panels on that monitor
   _setupPanelTransparencyOnMonitor(monitor) {
      let workspace = global.screen.get_active_workspace();
      let windows = workspace.list_windows();
      let maximizedWindows = windows.filter( (window) => {return(window.get_monitor() === monitor && this._windowIsMaximized(window));} );
      this._setTransparencyForEachPanelOnMonitor(monitor, maximizedWindows.length===0);
   }

   // Apply/Remove transparency appropriately for all blurred panels (taking maximized windows in to account)
   _setupPanelTransparencyOnAllMonitors() {
      let workspace = global.screen.get_active_workspace();
      let windows = workspace.list_windows();
      let maximizedWindows = windows.filter( (window) => this._windowIsMaximized(window) );

      // Clear the transparent flag in get blurredPanel
      this._blurredPanels.forEach( (element) => { element.transparent = undefined; } );

      if (maximizedWindows.length) {
         // Remove effects from any panel on a monitor with a maximized window
         maximizedWindows.forEach( (window) => {this._setTransparencyForEachPanelOnMonitor( window.get_monitor(), false );} );
         // Apply effects on all panels that don't have a maximized window
         this._blurredPanels.forEach( (bp) => {if (bp.transparent == undefined) this._setPanelTransparency(bp, true);} );
      } else {
         // Make sure all panels are blurred
         this._blurredPanels.forEach( (bp) => {this._setPanelTransparency(bp, true);} );
      }
   }

   // Unconditionally apply transparency to all blurred pancels
   _applyPanelTransparencyOnAllMonitors() {
      this._blurredPanels.forEach( (bp) => {this._setPanelTransparency(bp, true);} );
   }

   _windowIsMaximized(win) {
      return(!win.minimized && win.get_window_type() !== Meta.WindowType.DESKTOP && win.get_maximized() === Meta.MaximizeFlags.BOTH);
   }

   _setTransparencyForEachPanelOnMonitor(monitor, transparent) {
      this._blurredPanels.forEach( (element) =>
         {
            if (element.panel.monitorIndex === monitor) {
               this._setPanelTransparency(element, transparent);
            }
         });
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
      // Now that we are done setting up the panels, if need be, remove the transparency when maximized windows exist
      if (settings.noPanelEffectsMaximized) {
         this._setupPanelTransparencyOnAllMonitors();
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
         let color = this._getColor( blendColor, opacity );
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
         let blur;
         let desat
         let background;
         [background, blur, desat] = this._createBackgroundAndEffects(blurType, radius, saturation);
         blurredPanel.background = background;
         background.set_clip( panel.actor.x, panel.actor.y, panel.actor.width, panel.actor.height );
         if (!panel._hidden && !global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
            background.show();
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
      this._maximizeSignalManager.disconnectAllSignals();

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
               let color = this._getColor( blendColor, opacity );
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

   _getUniqueSettings() {
      return [settings.panelsOpacity, settings.panelsBlendColor, settings.panelsBlurType, settings.panelsRadius, settings.panelsSaturation];
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
         return this._getSettings(settings.panelsOverride);
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

class BlurPopupMenus extends BlurBase {
   constructor() {
      super();
      debugMsg( "Constructing popup menu object" );
      this._menus = [];
      blurPopupMenusThis = this; // Make "this" available to monkey patched functions
      this.original_popupmenu_open = PopupMenu.PopupMenu.prototype.open;
      PopupMenu.PopupMenu.prototype.open = this._popupMenuOpen;

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.popupOverride);
      [this._background, this._blurEffect, this._desatEffect] = this._createBackgroundAndEffects(blurType, radius, saturation);

      // Setup the popup menu box color
      this._boxColor = this._getColor( blendColor, opacity );

      // Setup the popup menu accent color
      let accentOpacity = (settings.popupOverride) ? settings.popupAccentOpacity : Math.min(opacity+10, 100);
      this._accentColor = this._getColor( blendColor, accentOpacity );

      this._changeCount = 0;
      debugMsg( "BlurPopupMenus initilized, actor hidden" );
   }

   _getUniqueSettings() {
      return [settings.popupOpacity, settings.popupBlendColor, settings.popupBlurType, settings.popupRadius, settings.popupSaturation];
   }

   // Monkey patched over PupupMenu.open()
   _popupMenuOpen(animate) {
      if (this instanceof Applet.AppletPopupMenu || this instanceof Applet.AppletContextMenu || this instanceof Panel.PanelContextMenu) {
         debugMsg( "Attaching to a new popup menu, _popupMenuOpen()" );
         blurPopupMenusThis._blurPopupMenu(this);
      }
      blurPopupMenusThis.original_popupmenu_open.call(this, animate);
   }

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
         debugMsg( `Applying setting to new popup menu: ${menu}` )
         let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.popupOverride);

         if (settings.allowTransparentColorPopup) {
            // Has some Blur Cinnamon settings changed since we last opened this menu?
            if (menu._blurCinnamonChangeCount != this._changeCount) {
               debugMsg( "Applying new settings to menu" );
               this._reapplyMenuStyle(menu, this._boxColor);
            }
            menu._blurCinnamonChangeCount = this._changeCount;

            // Find all the accent actors and adjust their transparency and background color
            this._findAccentActors(menu, menu.actor);

            // Adjust the menu transparency and color for the menu box if required
            if (!menu.box._blurCinnamonData) {
               this._applyActorStyle(menu.box, this._boxColor);
            }

            // Since menu.actor style is reset every time anyhow, we don't need to remember it's style, but we do have to set it every time
            menu.actor.set_style(  "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                           "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                           "background-gradient-end: transparent;    background: transparent;"  );
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
         debugMsg( "Blurred actor is now visible" );
         // Now that the menu is open we need to know if new actors are added so we can check for accent elements
         menu.blurCinnamonSignalManager.connect(menu.actor, 'queue-relayout', () => {this._findAccentActors(menu, menu.actor);} );
      }
   }

   // Called when Popup method is now closed and the animation is complete!
   _onClosed(menu) {
      debugMsg( "Menu close signal" );
      this._unblurPopupMenu(menu);
   }

   _onDestroyed(menu) {
      if (this._currentMenu === menu && this._background.is_visible()) {
         // In some cases the Tween for the popupMenu close animation will not call its onComplete function
         // and therefore no "menu-animated-closed" signal which would call _onClosed().
         // In those cases we must unblur the popup menu, but the menu is already gone so we just hide the background.
         debugMsg( "Unblurring on destroy" );
         this._background.hide();
      }
      if (menu.blurCinnamonSignalManager) {
         menu.blurCinnamonSignalManager.disconnectAllSignals();
      }
      let idx = this._menus.indexOf(menu);
      if (idx !== -1) {
         debugMsg( `Removing menu at index ${idx}` );
         this._menus.splice( idx, 1 );
      }
   }

   _reapplyMenuStyle(menu, color) {
      if (menu.box._blurCinnamonData) {
         this._applyActorStyle(menu.box, color);
         this._reapplyActorChildrenStyle(menu.actor);
      }
   }

   _reapplyActorChildrenStyle(actor) {
      let children = actor.get_children();
      for (let i=0 ; i < children.length ; i++ ) {
         if (children[i]._blurCinnamonData) {
            this._applyActorStyle(children[i], this._accentColor);
         }
         this._reapplyActorChildrenStyle(children[i]);
      }
   }

   _applyActorStyle(actor, color) {
      if (!actor._blurCinnamonData) {
         actor._blurCinnamonData = {original_entry_color: actor.get_background_color(), original_entry_style: actor.get_style(),
                                    original_entry_class: actor.get_style_class_name(), original_entry_pseudo_class: actor.get_style_pseudo_class()};
      }
      actor.set_style( "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                       "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                       "background-gradient-end: transparent;    background: transparent;" );
      actor.set_background_color(color);
   }

   _restoreMenuStyle(menu) {
      if (menu.box._blurCinnamonData) {
         this._restoreActorStyle(menu.box);
         this._restoreActorChildrenStyle(menu.actor);
      }
   }

   _restoreActorChildrenStyle(actor) {
      let children = actor.get_children();
      for (let i=0 ; i < children.length ; i++ ) {
         if (children[i]._blurCinnamonData) {
            this._restoreActorStyle(children[i]);
         }
         this._restoreActorChildrenStyle(children[i]);
      }
   }

   _restoreActorStyle(actor) {
      let orgStyleData = actor._blurCinnamonData;
      actor.set_background_color(orgStyleData.original_entry_color);
      actor.set_style(orgStyleData.original_entry_style);
      actor.set_style_class_name(orgStyleData.original_entry_class);
      actor.set_style_pseudo_class(orgStyleData.original_entry_pseudo_class);
      delete actor._blurCinnamonData;
   }

   // Look for Popup menu accent actors
   _findAccentActors(menu, actor) {
      let children = actor.get_children();
      for (let i=0 ; i < children.length ; i++ ) {
         let child = children[i];
         if (child._blurCinnamonData === undefined) {
            if (child instanceof St.Entry) {
               debugMsg( "found new accent actor" );
               this._applyActorStyle(child, this._accentColor);
            } else if (child instanceof St.BoxLayout) {
               let styleClassName = child.get_style_class_name();
               if (styleClassName && styleClassName.indexOf("menu-favorites-box") !== -1) {
                  debugMsg( "found new accent actor" );
                  this._applyActorStyle(child, this._accentColor);
               }
            } else if (child instanceof St.Table) {
               let name = child.get_name();
               if (name && name.indexOf("notification") !== -1) {
                  debugMsg( "found new accent actor" );
                  this._applyActorStyle(child, this._accentColor);
               }
            } else {
               child._blurCinnamonData = null; // Used to signal that this actor is not an interesting one for future calls to this function
            }
         }
         this._findAccentActors(menu, child);
      }
   }

   _blurPopupMenu(menu) {
      if (!menu.blurCinnamonSignalManager) {
         menu.blurCinnamonSignalManager = new SignalManager.SignalManager(null);
         menu.blurCinnamonSignalManager.connect(menu, "open-state-changed", Lang.bind(this, this._onOpenStateChanged) );
         menu.blurCinnamonSignalManager.connect(menu, "menu-animated-closed", Lang.bind(this, this._onClosed) );
         menu.blurCinnamonSignalManager.connect(menu, "destroy", () => {this._onDestroyed(menu)} );
         menu.blurCinnamonSignalManager.connect(menu.actor, 'notify::size', () => {this._setClip(menu);} );
         menu.blurCinnamonSignalManager.connect(menu.actor, 'notify::position', () => {this._setClip(menu);} );
         this._menus.push(menu);
      }
      debugMsg( "attach complete" );
   }

   _unblurPopupMenu(menu) {
      if (this._currentMenu === menu) {
         this._background.hide();
         debugMsg( "blur actor hidden" );
         this._currentMenu = null;
      }
      debugMsg( "unblur complete\n" );
   }

   updateEffects() {
      debugMsg("updateEffects for popup menus" );
      this._changeCount++;

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.popupOverride);
      let accentOpacity = (settings.popupOverride) ? settings.popupAccentOpacity : Math.min(opacity+10, 100);

      this._updateEffects(blurType, radius, saturation);

      // Update the popup menu box dimming color
      this._boxColor = this._getColor( blendColor, opacity );

      // Update the accent dimming color
      this._accentColor = this._getColor( blendColor, accentOpacity );
   }

   destroy() {
      // Restore monkey patched PopupMenu open & close functions
      debugMsg( "Destroying Popup Menu object" );
      PopupMenu.PopupMenu.prototype.open = this.original_popupmenu_open;
      global.overlay_group.remove_actor(this._background);
      this._background.destroy();
      // Remove all data in the menus associated with blurCinnamon
      let menus = this._menus;
      if (menus) {
         for (let i=0 ; i < menus.length ; i++) {
            if (menus[i].blurCinnamonSignalManager) {
               menus[i].blurCinnamonSignalManager.disconnectAllSignals();
               delete menus[i].blurCinnamonSignalManager;
            }
            if (menus[i].box._blurCinnamonData) {
               this._restoreMenuStyle(menus[i]);
            }
         }
      }
   }
}

class BlurDesktop extends BlurBase {
   constructor() {
      super();
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

   _getUniqueSettings() {
      return [settings.desktopOpacity, settings.desktopBlendColor, settings.desktopBlurType, settings.desktopRadius, settings.desktopSaturation];
   }

   updateEffects() {
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.desktopOverride);

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

class BlurNotifications extends BlurBase {
   constructor() {
      super();
      this._signalManager = new SignalManager.SignalManager(null);
      this.animation_time = 0.08; // seconds
      blurNotificationsThis = this; // Make "this" available to monkey patched functions
      // Monkey patch the Notification show and hide functions
      this.original_showNotification = MessageTray.MessageTray.prototype._showNotification;
      MessageTray.MessageTray.prototype._showNotification = this._showNotification;
      this.original_hideNotification = MessageTray.MessageTray.prototype._hideNotification
      MessageTray.MessageTray.prototype._hideNotification = this._hideNotification;

      // Create the effects and the background actor to apply to effects to
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.notificationOverride);
      [this._background, this._blurEffect, this._desatEffect] = this._createBackgroundAndEffects(blurType, radius, saturation);

      this._activeNotificationData = null;
      this.updateEffects();
   }

   _getUniqueSettings() {
      return [settings.notificationOpacity, settings.notificationBlendColor, settings.notificationBlurType, settings.notificationRadius, settings.notificationSaturation];
   }

   updateEffects() {
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.notificationOverride);

      this._updateEffects(blurType, radius, saturation);

      if (this._activeNotificationData) {
         let actor = this._activeNotificationData.actor;
         let button = actor.get_child();
         let table = button.get_child()
         let color = this._getColor( blendColor, opacity );
         table.set_background_color(color);
         actor.set_style( "border-radius: 0px; background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent; background: transparent;" );
         button.set_style( "border-radius: 0px; background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent; background: transparent;" );
         table.set_style( "border-radius: 0px; background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent; background: transparent;" );
      }
   }

   _showNotification() {
      // Call the original function then call the function to setup the effect
      blurNotificationsThis.original_showNotification.call(this);
      blurNotificationsThis._blurNotification.call(blurNotificationsThis, this._notificationBin);
   }

   _blurNotification(actor) {
      let blendColor = (settings.notificationOverride) ? settings.notificationBlendColor : settings.blendColor;
      let opacity = (settings.notificationOverride) ? settings.notificationOpacity : settings.opacity;

      let button = actor.get_child();
      let table = button.get_child()
      //log( `Bluring the notification bin actor: ${actor}` );
      //log( `   button ${actor.get_child()}` );
      //log( `   table  ${actor.get_child().get_child()}` );
      //this._printActor(actor);
      //this._printActor(button);
      //this._printActor(table);


      if (actor.visible) {
         if (settings.allowTransparentColorPanels) {
            // Save the current settings so we can restore it if need be.
            this._activeNotificationData = {actor: actor, original_table_color: table.get_background_color(), original_actor_style: actor.get_style(),
                                            original_button_style: button.get_style(), original_table_style: table.get_style()};
            // Set the notification color and style
            let color = this._getColor( blendColor, opacity );
            table.set_background_color(color);
            actor.set_style( "border-radius: 0px; background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            button.set_style( "border-radius: 0px; background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            table.set_style( "border-radius: 0px; background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
         }
      }
      // Resize the background to match the size of the notification window
      this._setClip(actor, table);
      // The notification window size can change after being shown, so we need to adjust the background when that happens
      this._signalManager.connect(actor, 'notify::size', () => {this._setClip(actor, table);} );
      // Delay showing the blurred background until the notification tween is well underway.
      Mainloop.timeout_add(this.animation_time * 1000, () => this._background.show() );
   }

   _hideNotification() {
      blurNotificationsThis._activeNotificationData = null;
      blurNotificationsThis._signalManager.disconnectAllSignals();
      blurNotificationsThis._background.hide();
      blurNotificationsThis.original_hideNotification.call(this);
   }

   destroy() {
      // If there is an active notification, then restore it's original visual settings
      if (this._activeNotificationData) {
         let actor = this._activeNotificationData.actor;
         let button = actor.get_child();
         let table = button.get_child()
         table.set_background_color( this._activeNotificationData.original_table_color );
         actor.set_style( this._activeNotificationData.original_actor_style );
         button.set_style( this._activeNotificationData.original_button_style );
         table.set_style( this._activeNotificationData.original_table_style );
      }
      this._signalManager.disconnectAllSignals();
      this._background.hide();

      // Restore monkey patched functions and destroy the _background
      MessageTray.MessageTray.prototype._showNotification = this.original_showNotification;
      MessageTray.MessageTray.prototype._hideNotification = this.original_hideNotification;
      global.overlay_group.remove_actor(this._background);
      this._background.destroy();
   }
}

class BlurTooltips extends BlurBase {
   constructor() {
      super();
      this._signalManager = new SignalManager.SignalManager(null);
      blurTooltipsThis = this; // Make "this" available to monkey patched functions

      // Monkey patch the Tooltip show and hide functions
      this.original_PanelItemTooltip_show = Tooltips.PanelItemTooltip.prototype.show;
      Tooltips.PanelItemTooltip.prototype.show = this._show_PanelItemTooltip;
      this.original_Tooltip_hide = Tooltips.Tooltip.prototype.hide;
      Tooltips.Tooltip.prototype.hide = this._hide_Tooltip;

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.tooltipsOverride);
      [this._background, this._blurEffect, this._desatEffect] = this._createBackgroundAndEffects(blurType, radius, saturation);
   }

   _getUniqueSettings() {
      return [settings.tooltipOpacity, settings.tooltipBlendColor, settings.tooltipBlurType, settings.tooltipRadius, settings.tooltipSaturation];
   }

   _blurTooltip(actor) {
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.tooltipsOverride);
      this._updateEffects(blurType, radius, saturation);
      // Set the tooltip color
      let color = this._getColor( blendColor, opacity);
      actor.set_background_color(color);
      // Make the tooltip transparent and remove the rounded corners
      this._originalStyle = actor.get_style();
      actor.set_style(  "border-radius: 0px; " + //"border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                        "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                        "background-gradient-end: transparent;    background: transparent;"  );
      // Track the showing tooltip actor so we know which hide call to react to
      this._tooltipActor = actor;
      // Clip the background subtracting the actors margins since in some cases not doing so makes the background too large
      this._setClip(actor, actor);
      this._background.show();
      // Adapt to any future tooltip size changes
      this._signalManager.connect(actor, 'notify::size', () => {this._setClip(actor);} );
      // When idle, make sure the clip is set right, sometimes it's wrong on the outset
      Mainloop.idle_add( () => {this._setClip(actor);} );
   }

   _unblurTooltip(actor) {
      if (actor === this._tooltipActor) {
         this._background.hide();
         this._signalManager.disconnectAllSignals();
         this._tooltipActor.set_style( this._originalStyle );
         this._tooltipActor = null;
      }
   }

   _show_PanelItemTooltip() {
      blurTooltipsThis.original_PanelItemTooltip_show.call(this);
      if (this._tooltip.visible) {
         blurTooltipsThis._blurTooltip.call(blurTooltipsThis, this._tooltip);
      }
   }

   _hide_Tooltip() {
      blurTooltipsThis._unblurTooltip.call(blurTooltipsThis, this._tooltip);
      blurTooltipsThis.original_Tooltip_hide.call(this);
   }

   destroy() {
      // Undo Monkey patching the Tooltip show and hide functions
      Tooltips.PanelItemTooltip.prototype.show = this.original_PanelItemTooltip_show;
      Tooltips.Tooltip.prototype.hide = this.original_Tooltip_hide;

      this._signalManager.disconnectAllSignals();
      this._background.hide();
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
      this.settings.bind('no-panel-effects-maximized', 'noPanelEffectsMaximized', maximizedOptionChanged );

      this.settings.bind('popup-opacity',        'popupOpacity',       updatePopupEffects);
      this.settings.bind('popup-accent-opacity', 'popupAccentOpacity', updatePopupEffects);
      this.settings.bind('popup-blurType',       'popupBlurType',      updatePopupEffects);
      this.settings.bind('popup-radius',         'popupRadius',        updatePopupEffects);
      this.settings.bind('popup-blendColor',     'popupBlendColor',    updatePopupEffects);
      this.settings.bind('popup-saturation',     'popupSaturation',    updatePopupEffects);
      this.settings.bind('allow-transparent-color-popup', 'allowTransparentColorPopup');

      this.settings.bind('desktop-opacity',       'desktopOpacity',      updateDesktopEffects);
      this.settings.bind('desktop-blurType',      'desktopBlurType',     updateDesktopEffects);
      this.settings.bind('desktop-radius',        'desktopRadius',       updateDesktopEffects);
      this.settings.bind('desktop-blendColor',    'desktopBlendColor',   updateDesktopEffects);
      this.settings.bind('desktop-saturation',    'desktopSaturation',   updateDesktopEffects);
      this.settings.bind('desktop-with-focus',    'desktopWithFocus',    updateDesktopEffects);
      this.settings.bind('desktop-without-focus', 'desktopWithoutFocus', updateDesktopEffects);

      this.settings.bind('notification-opacity',    'notificationOpacity',    updateNotificationEffects);
      this.settings.bind('notification-blurType',   'notificationBlurType',   updateNotificationEffects);
      this.settings.bind('notification-radius',     'notificationRadius',     updateNotificationEffects);
      this.settings.bind('notification-blendColor', 'notificationBlendColor', updateNotificationEffects);
      this.settings.bind('notification-saturation', 'notificationSaturation', updateNotificationEffects);

      this.settings.bind('appswitcher-opacity',    'appswitcherOpacity');
      this.settings.bind('appswitcher-blurType',   'appswitcherBlurType');
      this.settings.bind('appswitcher-radius',     'appswitcherRadius');
      this.settings.bind('appswitcher-blendColor', 'appswitcherBlendColor');
      this.settings.bind('appswitcher-saturation', 'appswitcherSaturation');

      this.settings.bind('tooltips-opacity',    'tooltipOpacity');
      this.settings.bind('tooltips-blurType',   'tooltipBlurType');
      this.settings.bind('tooltips-radius',     'tooltipRadius');
      this.settings.bind('tooltips-blendColor', 'tooltipBlendColor');
      this.settings.bind('tooltips-saturation', 'tooltipSaturation');

      this.settings.bind('enable-overview-override',     'overviewOverride');
      this.settings.bind('enable-expo-override',         'expoOverride');
      this.settings.bind('enable-panels-override',       'panelsOverride', panelsSettingsChangled);
      this.settings.bind('enable-popup-override',        'popupOverride');
      this.settings.bind('enable-desktop-override',      'desktopOverride', updateDesktopEffects);
      this.settings.bind('enable-notification-override', 'notificationOverride', updateNotificationEffects);
      this.settings.bind('enable-appswitcher-override',  'appswitcherOverride');
      this.settings.bind('enable-tooltips-override',     'tooltipsOverride');

      this.settings.bind('enable-overview-effects',      'enableOverviewEffects', enableOverviewChanged);
      this.settings.bind('enable-expo-effects',          'enableExpoEffects',     enableExpoChanged);
      this.settings.bind('enable-panels-effects',        'enablePanelsEffects',   enablePanelsChanged);
      this.settings.bind('enable-popup-effects',         'enablePopupEffects',    enablePopupChanged);
      this.settings.bind('enable-desktop-effects',       'enableDesktopEffects',  enableDesktopChanged);
      this.settings.bind('enable-notification-effects',  'enableNotificationEffects', enableNotificationChanged);
      this.settings.bind('enable-appswitcher-effects',   'enableAppswitcherEffects', enableAppswitcherChanged);
      this.settings.bind('enable-tooltips-effects',      'enableTooltipEffects',  enableTooltipsChanged);

      this.settings.bind('enable-panel-unique-settings', 'enablePanelUniqueSettings');
      this.settings.bind('panel-unique-settings', 'panelUniqueSettings', panelsSettingsChangled);
      this.settings.bind('allow-transparent-color-panels', 'allowTransparentColorPanels', colorChanged);

      this.settings.bind('new-install', 'newInstall');
   }

   destroy() {
      this.settings.finalize();
   }
}

function maximizedOptionChanged() {
   if (blurPanels) {
      blurPanels.setupMaximizeMonitoring();
   }
}

function updatePopupEffects() {
   if (blurPopupMenus && settings.enablePopupEffects) {
      blurPopupMenus.updateEffects();
   }
}

function updateDesktopEffects() {
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
}

function updateNotificationEffects() {
   if (blurNotifications && settings.enableNotificationEffects) {
      blurNotifications.updateEffects();
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

function enableAppswitcherChanged() {
   if (settings.enableAppswitcherEffects) {
      AppSwitcher3D.AppSwitcher3D.prototype._init = _initAppSwitcher3D;
      AppSwitcher3D.AppSwitcher3D.prototype._oldInit = originalInitAppSwitcher3D;
      AppSwitcher3D.AppSwitcher3D.prototype._hide = _hideAppSwitcher3D;
      AppSwitcher3D.AppSwitcher3D.prototype._oldHide = originalHideAppSwitcher3D;
   } else {
      delete AppSwitcher3D.AppSwitcher3D.prototype._oldInit;
      AppSwitcher3D.AppSwitcher3D.prototype._init = originalInitAppSwitcher3D;
      delete AppSwitcher3D.AppSwitcher3D.prototype._oldHide;
      AppSwitcher3D.AppSwitcher3D.prototype._hide = originalHideAppSwitcher3D;
   }
}

function enablePanelsChanged() {
   if (blurPanels && !settings.enablePanelsEffects) {
      blurPanels.destroy();
      blurPanels = null;
   } else if (!blurPanels && settings.enablePanelsEffects) {
      blurPanels = new BlurPanels();
   }
}

function enablePopupChanged() {
   if (blurPopupMenus && !settings.enablePopupEffects) {
      blurPopupMenus.destroy();
      blurPopupMenus = null;
   } else if (!blurPopupMenus && settings.enablePopupEffects) {
      blurPopupMenus = new BlurPopupMenus();
   }
}

function enableDesktopChanged() {
   if (blurDesktop && !settings.enableDesktopEffects) {
      blurDesktop.destroy();
      blurDesktop = null;
   } else if (!blurDesktop && settings.enableDesktopEffects) {
      blurDesktop = new BlurDesktop();
   }
}

function enableNotificationChanged() {
   if (blurNotifications && !settings.settings.enableNotificationEffects) {
      blurNotifications.destroy();
      blurNotifications = null;
   } else if (!blurNotifications && settings.enableNotificationEffects) {
      blurNotifications = new BlurNotifications();
   }
}

function enableTooltipsChanged() {
   if (blurTooltips && !settings.settings.enableTooltipEffects) {
      blurTooltips.destroy();
      blurTooltips = null;
   } else if (!blurTooltips && settings.enableTooltipEffects) {
      blurTooltips = new BlurTooltips();
   }
}

function init(extensionMeta) {
   settings = new BlurSettings(extensionMeta.uuid);
   metaData = extensionMeta;

   originalAnimateOverview = Overview.Overview.prototype._animateVisible;
   originalAnimateExpo = Expo.Expo.prototype._animateVisible;
   originalInitAppSwitcher3D = AppSwitcher3D.AppSwitcher3D.prototype._init;
   originalHideAppSwitcher3D = AppSwitcher3D.AppSwitcher3D.prototype._hide;
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

   // Monkey patch to enable 3D AppSwitcher effects
   if (settings.enableAppswitcherEffects) {
      AppSwitcher3D.AppSwitcher3D.prototype._init = this._initAppSwitcher3D;
      AppSwitcher3D.AppSwitcher3D.prototype._oldInit = originalInitAppSwitcher3D;
      AppSwitcher3D.AppSwitcher3D.prototype._hide = this._hideAppSwitcher3D;
      AppSwitcher3D.AppSwitcher3D.prototype._oldHide = originalHideAppSwitcher3D;
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
   // Create a Notification Effects class instance, the constructor will set everything up.
   if (settings.enableNotificationEffects) {
      blurNotifications = new BlurNotifications();
   }
   // Create a Tooltip Effects class instance, the constructor will set everything up.
   if (settings.enableTooltipEffects) {
      blurTooltips = new BlurTooltips();
   }
   // If this is the first time running Blur Cinnamon, sent a welcome notification message
   if (settings.newInstall) {
      settings.settings.setValue( "new-install", 0 );
      let source = new MessageTray.Source(metaData.name);
      let notification = new MessageTray.Notification(source, _("Welcome to Blur Cinnamon"),
         _("Hope you are enjoying your new Panel, Expo, Overview and Alt-Tab Coverflow/Timeline effects.\n\nOpen the Blur Cinnamon Settings to enable additional effects on several other Cinnamon components like menus and notifications, or disable effects on components that were enabled by default. You can also make changes to the effect properties like blur intensity, color saturation and dimming."),
         {icon: new St.Icon({icon_name: "blur-cinnamon", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
         );
      Main.messageTray.add(source);
      notification.addButton("blur-cinnamon-settings", _("Open Blur Cinnamon Settings"));
      notification.connect("action-invoked", (self, id) => { if (id === "blur-cinnamon-settings") Util.spawnCommandLineAsync("xlet-settings extension " + metaData.uuid ); } );
      notification.setUrgency( MessageTray.Urgency.CRITICAL );
      source.notify(notification);
   }
   return Callbacks
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

   if (settings.enableAppswitcherEffects) {
      delete AppSwitcher3D.AppSwitcher3D.prototype._oldInit;
      AppSwitcher3D.AppSwitcher3D.prototype._init = originalInitAppSwitcher3D;
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

   if (blurNotifications) {
      blurNotifications.destroy();
      blurNotifications = null;
   }

   if (blurTooltips) {
      blurTooltips.destroy();
      blurTooltips = null;
   }

   // If disabled was called to remove the extension entirely rather than a reload
   // we can reset the "new-install" value so that if the user adds the extension
   // again in the future, we can show the welcome notification again!
   let err = new Error();
   if (err.stack.includes("unloadRemovedExtensions@")) {
      log( "Resetting the new-install value" );
      settings.settings.setValue( "new-install", 1 );
   }
   settings.destroy();
   settings = null;
}

const Callbacks = {
  on_notification_test_button_pressed: function() {
     let source = new MessageTray.Source(metaData.name);
     let notification = new MessageTray.Notification(source, _("Testing Blur Cinnamon Notification Effects"),
         _("This is how notifications will appear when using the current Blur Cinnamon Notification Popup effects.\n\nMaking further changes to the notification effect settings will automatically apply to this notification message."),
         {icon: new St.Icon({icon_name: "blur-cinnamon", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
         );
      Main.messageTray.add(source);
      notification.setUrgency( MessageTray.Urgency.CRITICAL );
      source.notify(notification);  },
   on_window_settings_button_pressed: function() {
      Util.spawnCommandLineAsync("cinnamon-settings windows -t 2");
   }
}
