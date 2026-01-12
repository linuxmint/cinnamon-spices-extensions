// Blur Cinnamon: Blur some components of the Cinnamon Desktop

// Copyright (c) 2025 Kevin Langman

// Some code bowwowed from the BlurOverview Cinnamon extension Copyright (C) 2012 Jen Bowen aka nailfarmer

// Gaussian Blur (borrowed from Blur-my-shell / Aurélien Hamy) modified for Cinnamon by Kevin Langman 2024
// Rounded Corners (borrowed from Blur-my-shell / Aurélien Hamy) modified for Cinnamon by Kevin Langman 2025

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

const Clutter        = imports.gi.Clutter;
const St             = imports.gi.St;
const Tweener        = imports.ui.tweener;
const Overview       = imports.ui.overview;
const Expo           = imports.ui.expo;
const AppSwitcher3D  = imports.ui.appSwitcher.appSwitcher3D;
const Settings       = imports.ui.settings;
const SignalManager  = imports.misc.signalManager;
const Panel          = imports.ui.panel;
const Main           = imports.ui.main;
const Meta           = imports.gi.Meta;
const Mainloop       = imports.mainloop;
const AppletManager  = imports.ui.appletManager;
const Lang           = imports.lang;
const UPowerGlib     = imports.gi.UPowerGlib;
const MessageTray    = imports.ui.messageTray;
const Util           = imports.misc.util;
const Tooltips       = imports.ui.tooltips;
const WindowMenu     = imports.ui.windowMenu;
const Cinnamon       = imports.gi.Cinnamon;
const DeskletManager = imports.ui.deskletManager;

// For PopupMenu effects
const Applet        = imports.ui.applet;
const PopupMenu     = imports.ui.popupMenu;

const GaussianBlur = require("./gaussian_blur");
const CornerEffect = require("./corner");

const ANIMATION_TIME = 0.25;
const AUTOHIDE_ANIMATION_TIME = 0.2;  // This is a copy of "Panel.AUTOHIDE_ANIMATION_TIME", we can't legally access it since it's a const and EC6 does not allow it

const BLUR_EFFECT_NAME = "blur";
const DESAT_EFFECT_NAME = "desat";
const CORNER_EFFECT_NAME = "corner";

let originalAnimateOverview;
let originalAnimateExpo;
let originalInitAppSwitcher3D;
let originalHideAppSwitcher3D;
let originalSizeChangeWindowDone;

let settings;
let blurPanels;
let blurPopupMenus;
let blurDesktop;
let blurNotifications;
let blurTooltips;
let blurApplications;
let blurDesklets;
let blurFocusEffect;
let metaData;

var blurPanelsThis;
var blurPopupMenusThis;
var blurNotificationsThis;
var blurTooltipsThis;
var blurDeskletsThis;

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

const Component = {
  AltTab: 0,
  Desklets: 1,
  Desktop: 2,
  Expo: 3,
  Menus: 4,
  Notifications: 5,
  Overview: 6,
  Panels: 7,
  Tooltips: 8,
  Windows: 9
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

function _sizeChangeWindowDoneWindowManager(cinnamonwm, actor) {
   if (actor._blurCinnamonDataWindow) {
      actor._blurCinnamonDataWindow.effectThis._setClip(actor);
   }
   if (actor._blurCinnamonDataFocusEffect) {
      actor._blurCinnamonDataFocusEffect.effectThis._setClip();
   }
   originalSizeChangeWindowDone.apply(this, [cinnamonwm, actor]);
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

   _createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, parent=global.overlay_group, cornerRadius=0, top=true, bottom=true) {
      let blurEffect;
      let desatEffect;
      let cornerEffect;
      //let dimmerCornerEffect;
      let background;

      // Create the effects
      if (blurType === BlurType.Simple)
         blurEffect =  new Clutter.BlurEffect();
      else if (blurType === BlurType.Gaussian)
         blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1 , width: 0, height: 0} );
      if (saturation<100)
         desatEffect = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
      if (cornerRadius>0)
         cornerEffect = new CornerEffect.CornerEffect( metaData.uuid, {radius: cornerRadius, corners_top: top, corners_bottom: bottom} );

      // Create the background actor where the effects will be applied
      if (!Meta.is_wayland_compositor()) {
         background = Meta.X11BackgroundActor.new_for_display(global.display);
      } else {
         background = new Clutter.Actor();
      }

      // Add a dimmer child to the background so we can change the colorization and dimming of the background
      let dimmerColor = this._getColor( blendColor, opacity );
      let dimmer = new Clutter.Actor({x_expand: true, y_expand: true, width: background.width, height: background.height, background_color: dimmerColor});
      //if (cornerRadius>0) {
      //   dimmerCornerEffect = new CornerEffect.CornerEffect( metaData.uuid, {radius: cornerRadius, corners_top: top, corners_bottom: bottom} );
      //   dimmer.add_effect_with_name( CORNER_EFFECT_NAME, dimmerCornerEffect );
      //}
      background.add_child(dimmer);
      // If the screen resolution changes we need to change the dimmer actor size to match
      background.connect("notify::size", () => {dimmer.set_width(background.width); dimmer.set_height(background.height);} );
      background._blurCinnamonDimmer = dimmer;

      // Attach the effects. The cornerEffect needs to be first or else the blur effect will spill over the corner effect clip bounds.
      if (cornerEffect)
         background.add_effect_with_name( CORNER_EFFECT_NAME, cornerEffect );
      if (blurEffect)
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      if (desatEffect)
         background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect );
      if (parent)
         parent.add_actor(background);
      background.hide();
      return background;
   }

   _getBlurEffect(background) {
      return background.get_effect(BLUR_EFFECT_NAME);
   }

   _getDesatEffect(background) {
      return background.get_effect(DESAT_EFFECT_NAME);
   }

   _getCornerEffect(background) {
      return background.get_effect(CORNER_EFFECT_NAME);
   }

   _updateEffects(background, opacity, blendColor, blurType, radius, saturation) {
      // Setup the blur effect properly
      let curEffect = background.get_effect(BLUR_EFFECT_NAME);
      if (blurType === BlurType.None && curEffect) {
         background.remove_effect(curEffect);
      } else if (blurType === BlurType.Simple && !(curEffect instanceof Clutter.BlurEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
         }
         let blurEffect =  new Clutter.BlurEffect();
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      } else if (blurType === BlurType.Gaussian && !(curEffect instanceof GaussianBlur.GaussianBlurEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
         }
         let blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      }// else if (blurType !== BlurType.None && curEffect === null) {
         // The last used blur effect is correct, but not enabled, so enable it
      //   background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      //}
      // Adjust the blur effects
      if (curEffect instanceof GaussianBlur.GaussianBlurEffect && curEffect.radius != radius) {
         curEffect.radius = radius;
      }
      // Setup/Adjust the desaturation effect
      curEffect = background.get_effect(DESAT_EFFECT_NAME);
      if (curEffect && saturation === 100) {
         background.remove_effect(curEffect);
      } else if (curEffect && curEffect.factor !== (100-saturation)/100) {
         curEffect.set_factor((100-saturation)/100);
      } else if (!curEffect && saturation<100) {
         let desatEffect = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
         background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect );
      }
      // Setup the colorization/dimming
      let dimmerColor = this._getColor( blendColor, opacity );
      background._blurCinnamonDimmer.set_background_color(dimmerColor);
   }

   _updateCornerRadius(background, radius) {
      let ce = background.get_effect(CORNER_EFFECT_NAME);
      if (ce)
         ce.radius = radius;
      //ce = background._blurCinnamonDimmer.get_effect(CORNER_EFFECT_NAME);
      //if (ce)
      //   ce.radius = radius;
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

   destroy(background) {
      if (background._blurCinnamonDimmer) {
         background.remove_child(background._blurCinnamonDimmer);
      }
      let effect = this._getCornerEffect(background);
      if (effect)
         background.remove_effect(effect);
      effect = this._getDesatEffect(background);
      if (effect)
         background.remove_effect(effect);
      effect = this._getBlurEffect(background);
      if (effect)
         background.remove_effect(effect);
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
         let cornerEffect = this._getCornerEffect(panel.__blurredPanel.background);
         if (actor.is_visible()) {
            if (cornerEffect)
               cornerEffect.clip = [actor.x+2, actor.y+2, actor.width-3, actor.height-3];
            else
               panel.__blurredPanel.background.set_clip( actor.x, actor.y, actor.width, actor.height );
         } else {
            if (cornerEffect)
               cornerEffect.clip = [0, 0, 0, 0];
            else
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
      let topRadius = 0;
      let bottomRadius = 0;
      let cornerRadius = 0;
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
         // Make the panel transparent
         actor.set_style( "border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                          "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent;    background: transparent;" );
      }
      // Determine the corner radius
      let themeNode = actor.get_theme_node();
      if (themeNode) {
         // TODO: Need to be able to independently round all four corners, needs improvements to the corner effect code!
         topRadius = themeNode.get_border_radius(St.Corner.TOPLEFT);
         bottomRadius = themeNode.get_border_radius(St.Corner.BOTTOMLEFT);
         cornerRadius = Math.max(topRadius, bottomRadius);
      }
      // If blurring is required, create a background, create effect, clip background to cover the panel only
      // With this commented out, a panel with no effects applied (just made transparent) will still prevent
      // windows beneath the panels from being visible.
      //if (blurType > BlurType.None || saturation<100) {
         let background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, cornerRadius, topRadius!==0, bottomRadius!==0);
         blurredPanel.background = background;
         this._setClip(panel);
      //}
      blurredPanel.signalManager = new SignalManager.SignalManager(null);
      blurredPanel.signalManager.connect(actor, "notify::allocation", () => this._setClip(panel) );
      //blurredPanel.signalManager.connect(actor, 'notify::size', () => {this._setClip(panel);} );
      //blurredPanel.signalManager.connect(actor, 'notify::position', () => {this._setClip(panel);} );

      // When the panel uses a custom size in cinnamon.css we need to wait a bit and check that the size is right.
      // I hope to find a better solution than this hack one day!
      Mainloop.timeout_add( 1500, () => this._setClip(panel) );
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
               super.destroy(blurredPanel.background);
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

   // Setup the panel to be transparent or restore the panels original setup based on the 'transparent' parameter
   _setPanelTransparency(blurredPanel, transparent) {
      let panel = blurredPanel.panel
      let actor = panel.actor;
      blurredPanel.transparent = transparent;
      if (transparent) {
         if (settings.allowTransparentColorPanels) {
            let panelSettings = this._getPanelSettings(panel);
            if (!panelSettings ) return;
            let [opacity, blendColor, blurType, radius, saturation] = panelSettings;
            // Make the panel transparent
            actor.set_style( "border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                             "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent;    background: transparent;" );
         }
      } else {
         actor.set_background_color(blurredPanel.original_color);
         actor.set_style(blurredPanel.original_style);
         actor.set_style_class_name(blurredPanel.original_class);
         actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
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
               blurredPanel.background._blurCinnamonDimmer.set_background_color(color);
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
               if (uniqueSetting.override) {
                  return [uniqueSetting.opacity, uniqueSetting.color, uniqueSetting.blurtype, uniqueSetting.radius, uniqueSetting.saturation];
               } else {
                  return this._getGenericSettings();
               }
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

      // Setup the popup menu box color
      this._boxColor = this._getColor( "rgba(0,0,0,0)", 0/*blendColor, opacity*/ );

      this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10); // Assume a corner radius of 10, it will be fixed if needed

      // Get the corner effect for easier reference later on
      this._cornerEffect = this._background.get_effect(CORNER_EFFECT_NAME);

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
      if ( (settings.popupAppletMenuEffects && (this instanceof Applet.AppletPopupMenu || this instanceof Applet.AppletContextMenu)) ||
           (settings.popupPanelMenuEffects && this instanceof Panel.PanelContextMenu) ||
           (settings.popupTitleMenuEffects && this instanceof WindowMenu.WindowMenu) )
      {
         debugMsg( "Attaching to a new popup menu, _popupMenuOpen()" );
         blurPopupMenusThis._blurPopupMenu(this);
      } else {
         // If we applied effects to this menu in the past, remove the effects now
         let idx = blurPopupMenusThis._menus.indexOf(this);
         if (idx !== -1) {
            this.blurCinnamonSignalManager.disconnectAllSignals();
            delete this.blurCinnamonSignalManager;
            blurPopupMenusThis._restoreMenuStyle(this);
            blurPopupMenusThis._menus.splice( idx, 1 );
         }
      }
      blurPopupMenusThis.original_popupmenu_open.call(this, animate);
   }

   // Set the visible section of the background based on the size of the popup menu
   _setClip(menu){
      if (menu && this._currentMenu && menu === this._currentMenu) {
         let actor = menu.actor;
         if (actor.visible) {
            let bm = menu.box.get_margin();
            if (this._cornerEffect) {
               this._cornerEffect.clip = [actor.x+bm.left+2, actor.y+bm.top+2, actor.width-(bm.left+bm.right)-3, actor.height-(bm.top+bm.bottom)-3];
            } else {
               this._background.set_clip( actor.x+bm.left, actor.y+bm.top, actor.width-(bm.left+bm.right), actor.height-(bm.top+bm.bottom) );
            }
         } else {
            if (this._cornerEffect) {
               this._cornerEffect.clip = [ 0,0,0,0 ];
            } else {
               this._background.set_clip( 0, 0, 0, 0 );
            }
         }
      }
   }

   _onOpenStateChanged(menu, open) {
      if (open) {
         debugMsg( `Applying setting to new popup menu: ${menu}` );
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
               let radius = this._applyActorStyle(menu.box, this._boxColor);
               this._updateCornerRadius( this._background, radius );
            }

            // The menu's rounded corners could be applied to the box or the menus actor, so we have to check both
            let themeNode = menu.actor.get_theme_node();
            if (themeNode) {
               // We are assuming that all corners have the same radius, hope that is true.
               let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
               if (radius != 0) {
                  this._updateCornerRadius( this._background, radius );
               }
            }

            // Since menu.actor style is reset every time anyhow, we don't need to remember it's style, but we do have to set it every time
            menu.actor.set_style(  "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                                   "background-gradient-end: transparent;    background: transparent;"  );
         }

         this._currentMenu = menu;
         if (menu.animating) {
            // Make the background visible but zero size initially, let the paint signal re-clip the background as needed
            if (this._cornerEffect) {
               this._cornerEffect.clip = [ 0,0,0,0 ];
            } else {
               this._background.set_clip( 0, 0, 0, 0 );
            }
         } else {
            let actor = menu.actor;
            let margin = actor.get_margin();
            let bm = menu.box.get_margin();
            if (this._cornerEffect) {
               this._cornerEffect.clip = [ actor.x+margin.left+bm.left+2, actor.y+margin.top+bm.top+2,
                                           actor.width-(margin.left+margin.right)-(bm.left+bm.right)-3,
                                           actor.height-(margin.top+margin.bottom)-(bm.top+bm.bottom)-3 ];
            } else {
               this._background.set_clip( actor.x+margin.left+bm.left, actor.y+margin.top+bm.top,
                                          actor.width-(margin.left+margin.right)-(bm.left+bm.right),
                                          actor.height-(margin.top+margin.bottom)-(bm.top+bm.bottom) );
            }
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
         this._reapplyActorChildrenStyle(menu.actor);
         // menu.box will have been detected as an accent actor, this will reset the menu.box to the correct color
         this._applyActorStyle(menu.box, color);
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
      let radius = 0;
      if (!actor._blurCinnamonData) {
         actor._blurCinnamonData = {original_entry_color: actor.get_background_color(), original_entry_style: actor.get_style(),
                                    original_entry_class: actor.get_style_class_name(), original_entry_pseudo_class: actor.get_style_pseudo_class()};
      }

      let themeNode = actor.get_theme_node();
      if (themeNode) {
         // We are assuming that all corners have the same radius, hope that is true.
         radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
      }

      let rgba = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha/255.0})`
      actor.set_style( `background-gradient-direction: vertical; background-gradient-start: ${rgba}; background-gradient-end: ${rgba};`  );
      return radius;
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
         //menu.blurCinnamonSignalManager.connect(menu.actor, 'notify::size', () => {this._setClip(menu);} );
         //menu.blurCinnamonSignalManager.connect(menu.actor, 'notify::position', () => {this._setClip(menu);} );
         menu.blurCinnamonSignalManager.connect(menu.actor, "notify::allocation", () => this._setClip(menu) );
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

      this._updateEffects(this._background, opacity, blendColor, blurType, radius, saturation);

      // Update the accent dimming color
      this._accentColor = this._getColor( blendColor, accentOpacity );

      // If the options to allow theme overrides is disabled, remove theme overrides
      if (!settings.allowTransparentColorPopup) {
         debugMsg( "Removing theme override for popup menus" );
         let menus = this._menus;
         if (menus) {
            for (let i=0 ; i < menus.length ; i++) {
               if (menus[i].box._blurCinnamonData) {
                  this._restoreMenuStyle(menus[i]);
               }
            }
         }
      }
   }

   destroy() {
      // Restore monkey patched PopupMenu open & close functions
      debugMsg( "Destroying Popup Menu object" );
      PopupMenu.PopupMenu.prototype.open = this.original_popupmenu_open;
      super.destroy(this._background);
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

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.desktopOverride);

      if (blurType === BlurType.Simple)
         this._blurEffect = new Clutter.BlurEffect();
      else if (blurType === BlurType.Gaussian)
         this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
      this._desatEffect = new Clutter.DesaturateEffect({factor: (100-saturation)/100});
      if (this._blurEffect)
         global.background_actor.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      global.background_actor.add_effect_with_name( DESAT_EFFECT_NAME, this._desatEffect );
      // Add a dimmer child to the background so we can change the colorization and dimming of the background
      let dimmerColor = this._getColor( blendColor, opacity );
      this._dimmer = new Clutter.Actor({x_expand: true, y_expand: true, width: global.background_actor.width, height: global.background_actor.height, background_color: dimmerColor});
      global.background_actor.add_child(this._dimmer);
      this.updateEffects();
   }

   _getUniqueSettings() {
      return [settings.desktopOpacity, settings.desktopBlendColor, settings.desktopBlurType, settings.desktopRadius, settings.desktopSaturation];
   }

   updateEffects() {
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.desktopOverride);

      this._withoutFocusSettings = {radius: radius, opacity: opacity, blendColor: blendColor, saturation: saturation};
      if (settings.desktopOverride && settings.desktopWithFocus) {
         this._withFocusSettings = {radius: settings.radius, opacity: settings.opacity, blendColor: settings.blendColor, saturation: settings.saturation};
      } else {
         this._withFocusSettings = {radius: 0, opacity: 0, blendColor: "",saturation: 100};
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
      let dimmerColor = this._getColor( blendColor, opacity );
      this._dimmer.set_background_color(dimmerColor);
      if (this._connected) {
         this._onFocusChanged();
      }
   }

   _onFocusChanged(){
      let window = global.display.get_focus_window();
      if (!window || window.get_window_type() === Meta.WindowType.DESKTOP) {
         if (this._blurEffect instanceof GaussianBlur.GaussianBlurEffect && this._blurEffect.radius != this._withFocusSettings.radius)
            this._blurEffect.radius = this._withFocusSettings.radius;
         let dimmerColor = this._getColor( this._withFocusSettings.blendColor, this._withFocusSettings.opacity );
         this._dimmer.set_background_color(dimmerColor);
         if (this._desatEffect.factor !== (100-this._withFocusSettings.saturation)/100)
            this._desatEffect.set_factor((100-this._withFocusSettings.saturation)/100);
         this._currentlyWithFocus = true;
         return;
      }
      if (this._currentlyWithFocus) {
         if (this._blurEffect instanceof GaussianBlur.GaussianBlurEffect && this._blurEffect.radius != this._withoutFocusSettings.radius)
            this._blurEffect.radius = this._withoutFocusSettings.radius;
         let dimmerColor = this._getColor( this._withoutFocusSettings.blendColor, this._withoutFocusSettings.opacity );
         this._dimmer.set_background_color(dimmerColor);
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
      if (this._dimmer) {
         global.background_actor.remove_child(this._dimmer);
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
      this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10);

      this._activeNotificationData = null;
      this.updateEffects();
   }

   _getUniqueSettings() {
      return [settings.notificationOpacity, settings.notificationBlendColor, settings.notificationBlurType, settings.notificationRadius, settings.notificationSaturation];
   }

   updateEffects() {
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.notificationOverride);

      this._updateEffects(this._background, opacity, blendColor, blurType, radius, saturation);

      if (this._activeNotificationData) {
         let actor = this._activeNotificationData.actor;
         let button = actor.get_child();
         let table = button.get_child();

         let themeNode = table.get_theme_node();
         if (themeNode) {
            // We are assuming that all corners have the same radius, hope that is true.
            let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
            this._updateCornerRadius(this._background, radius+6);
         }

         actor.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent; background: transparent;" );
         button.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                          "background-gradient-end: transparent; background: transparent;" );
         table.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
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
      let table = button.get_child();
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

            let themeNode = table.get_theme_node();
            if (themeNode) {
               // We are assuming that all corners have the same radius, hope that is true.
               let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
               this._updateCornerRadius(this._background, radius+6);
            }

            actor.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            button.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            table.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
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
         let table = button.get_child();
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
      super.destroy(this._background);
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
      this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10);
   }

   _getUniqueSettings() {
      return [settings.tooltipOpacity, settings.tooltipBlendColor, settings.tooltipBlurType, settings.tooltipRadius, settings.tooltipSaturation];
   }

   _blurTooltip(actor) {
      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.tooltipsOverride);
      this._updateEffects(this._background, opacity, blendColor, blurType, radius, saturation);
      // Make the tooltip transparent and remove the rounded corners
      this._originalStyle = actor.get_style();

      let themeNode = actor.get_theme_node();
      if (themeNode) {
         // We are assuming that all corners have the same radius, hope that is true.
         let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
         this._updateCornerRadius(this._background, radius+6);
      }

      actor.set_style(  "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                        "background-gradient-end: transparent;    background: transparent;"  );
      // Track the showing tooltip actor so we know which hide call to react to
      this._tooltipActor = actor;
      // Clip the background subtracting the actors margins since in some cases not doing so makes the background too large
      this._setClip(actor, actor);
      this._background.show();
      // Adapt to any future tooltip size changes
      //this._signalManager.connect(actor, 'notify::size', () => {this._setClip(actor);} );
      this._signalManager.connect(actor, "notify::allocation", () => this._setClip(actor) );

      // When idle, make sure the clip is set right, sometimes it's wrong on the outset
      Mainloop.idle_add( () => {
         this._setClip(actor);
         // Try one more time
         Mainloop.idle_add( () => {this._setClip(actor);} );
         });
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
      super.destroy(this._background);
      this._background.destroy();
   }
}

class BlurApplications extends BlurBase {
   constructor() {
      super();
      // BlurApplication global listeners
      this._signalManager = new SignalManager.SignalManager(null);
      this._signalManager.connect(global.screen, "window-added", this._windowAdded, this);
      this._signalManager.connect(global.display, "notify::focus-window", this._onFocusChanged, this);
      this._signalManager.connect(global.display, "grab-op-begin", this._onWindowGrabbed, this);

      // WindowTracker so we can map windows to application
      this._windowTracker = Cinnamon.WindowTracker.get_default();

      // Check existing windows to see if any need to be blurred
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         if (this._windowShouldBeBlurred(windows[i])) {
            this._blurWindow(windows[i]);
         }
      }
   }

   _onWindowGrabbed(display, screen, window, op) {
      if (op !== Meta.GrabOp.MOVING) {
         return;
      }
      let compositor = (window) ? window.get_compositor_private() : null;
      if (compositor && compositor._blurCinnamonDataWindow) {
         let compizMitigation = settings.settings.getValue("windows-compiz-mitigation");
         if (compizMitigation) {
            let effect = compositor.get_effect('wobbly-compiz-effect');
            if (effect) {
               effect.on_end_event(compositor);
            } else {
               // Give the "Compiz windows effect" time to attach the effect, then we disable the effect if the Compiz effect is active.
               Mainloop.idle_add( () => {
                  let effect = compositor.get_effect('wobbly-compiz-effect');
                  if (effect) {
                     effect.on_end_event(compositor);
                  }
               });
            }
         }
      }
   }

   _windowAdded(workspace, metaWindow) {
      if (this._windowShouldBeBlurred(metaWindow)) {
         this._blurWindow(metaWindow);
      }
   }

   _windowShouldBeBlurred(metaWindow) {
      if (metaWindow.get_window_type() !== Meta.WindowType.NORMAL)
         return false;
      let app = this._getAppForWindow(metaWindow);
      let appId = app ? app.get_id() : null;
      let wmclass = metaWindow.get_wm_class();
      return settings.windowInclusionList.find( (element) => {if (element.enabled && (element.application == appId || element.application == wmclass)) {return true;}} );
   }

   _blurWindow(metaWindow) {
      // A signal manager for this window
      let signalManager = new SignalManager.SignalManager(null);

      // Get the windows compositor actor
      let compositor = metaWindow.get_compositor_private();

      // Get the effect setting that should apply to Application windows
      let [enabled, window_opacity, opacity, blendColor, blurType, radius, saturation, corner_radius, top, bottom] = this._getSettings(metaWindow);

      // Setup the window opacity
      if (!window_opacity || window_opacity < 10 || window_opacity > 100 )
         window_opacity = 100;
      metaWindow.set_opacity(window_opacity*2.55);

      // Create the effect and add it to the window
      let background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, null, corner_radius, top, bottom);
      compositor.insert_child_at_index(background, 0);

      // Add blur data to the compositor while blurring is in effect
      compositor._blurCinnamonDataWindow = { effectThis: this, background: background, metaWindow: metaWindow, signalManager: signalManager };

      // Add listeners for this window's compositor
      //signalManager.connect(metaWindow, "notify::maximized-horizontally", () => this._maximized(metaWindow) );
      //signalManager.connect(metaWindow, "notify::maximized-vertically ",  () => this._maximized(metaWindow) );
      //signalManager.connect(metaWindow, "unmanaged"/*"unmanaging"*/, () => this._unblurWindow(compositor) );
      signalManager.connect(compositor, "destroy", () => this._unblurWindow(compositor) );
      signalManager.connect(compositor, "notify::allocation", () => this._setClip(compositor) );
      //signalManager.connect(metaWindow, "notify::maximized-horizontally", () => this._setClip(compositor) );
      //signalManager.connect(metaWindow, "notify::maximized-vertically", () => this._setClip(compositor) );

      // Resize / reposition the blurred actor
      this._setClip(compositor);
      // Make the background visible
      background.show();
   }

   /*
   _maximized(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      if (metaWindow.get_maximized()) {
         log( "maximized" );
         this._setClip(compositor);
      } else {
         log( "unmaximized" );
         this._setClip(compositor);
      }
   }*/

   // Get the window specific effect settings, or a disabled set of value when no settings exist
   _getSettings(metaWindow) {
      let app = this._getAppForWindow(metaWindow);
      let appId = app ? app.get_id() : null;
      let wmclass = metaWindow.get_wm_class();
      let element = settings.windowInclusionList.find( (element) => {if (element.application == appId || element.application == wmclass) {return true;}} );
      if (element) {
         if (element.override) {
            return [element.enabled, element.window_opacity, element.opacity, element.color, element.blurtype, element.radius, element.saturation, element.corner_radius, element.corner_top, element.corner_bottom];
         }
         return [element.enabled, element.window_opacity, ...super._getSettings(false), element.corner_radius, element.corner_top, element.corner_bottom ];
      }
      return [false, 100, 0, undefined, BlurType.None, 0, 100, 0, false, false]
   }

   _setClip(compositor) {
      if (compositor._blurCinnamonDataWindow) {
         let data = compositor._blurCinnamonDataWindow;
         let rect = data.metaWindow.get_frame_rect();
         // Set the background position to the displays 0,0 based on the compositor's position and the shadow size
         //let windowShadowSizeX = (compositor.get_width() - rect.width) / 2;
         //let windowShadowSizeY = (compositor.get_height() - rect.height) / 2;
         //data.background.set_position( -rect.x+windowShadowSizeX, -rect.y+windowShadowSizeY );

         // Set the background position to the displays 0,0 based on it's transformed position and it's current position
         let [rx,ry] = data.background.get_transformed_position();
         let [x,y] = data.background.get_position();
         data.background.set_position( x-rx, y-ry );

         let cornerEffect = this._getCornerEffect(data.background);
         if (cornerEffect) {
            cornerEffect.clip = [rect.x+2, rect.y+2, rect.width-3, rect.height-3];
         } else {
            data.background.set_clip( rect.x, rect.y, rect.width, rect.height );
         }
      }
   }

   _unblurWindow(compositor) {
      if (compositor._blurCinnamonDataWindow) {
         let data = compositor._blurCinnamonDataWindow;
         data.signalManager.disconnectAllSignals();
         compositor.remove_child(data.background);
         super.destroy(data.background);
         data.background.destroy();
         data.metaWindow.set_opacity(255);
         compositor._blurCinnamonDataWindow = undefined;
      }
   }

   updateEffects(){
      // Go through all windows and update/apply/remove effects
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         let compositor = windows[i].get_compositor_private();
         let data = compositor._blurCinnamonDataWindow;
         let [enabled, window_opacity, opacity, blendColor, blurType, radius, saturation, corner_radius, top, bottom] = this._getSettings(windows[i]);
         if (compositor._blurCinnamonDataWindow) {
            if (!enabled) {
               this._unblurWindow(compositor);
            } else {
               this._updateEffects(data.background, opacity, blendColor, blurType, radius, saturation);
               let cornerEffect = this._getCornerEffect(data.background);
               if (cornerEffect) {
                  cornerEffect.corners_top = top;
                  cornerEffect.corners_bottom = bottom;
               }
               this._updateCornerRadius(data.background, corner_radius);
               if (!window_opacity || window_opacity < 10 || window_opacity > 100 )
                  window_opacity = 100;
               windows[i].set_opacity(window_opacity*2.55);
            }
         } else if (enabled) {
            this._blurWindow(windows[i]);
         }
      }
   }

   _getAppForWindow(window) {
      let app = this._windowTracker.get_window_app(window);
      if (!app) {
        app = this._windowTracker.get_app_from_pid(window.get_pid());
      }
      if (app)
         return app;
      return null;
   }

   _onFocusChanged() {
      this.prev_focused_window = this.last_focused_window;
      this.last_focused_window = global.display.get_focus_window();
   }

   // Add a new app window list row for the application of the last focused window
   window_add_button_pressed() {
      if (this.prev_focused_window) {
         let app = this._getAppForWindow(this.prev_focused_window);
         if (app && !app.is_window_backed()) {
            let windowList = settings.settings.getValue("windows-inclusion-list");
            windowList.push( {enabled:true, application:app.get_id(), override: true, opacity:0, color:"rgb(0,0,0)", blurtype:BlurType.Gaussian, radius:10, saturation:100, corner_radius: 10, corner_top: true, corner_bottom: false  } );
            settings.settings.setValue("windows-inclusion-list", windowList);
         } else if (this.prev_focused_window.get_wm_class()) {
            let windowList = settings.settings.getValue("windows-inclusion-list");
            windowList.push( {enabled:true, application:this.prev_focused_window.get_wm_class(), override: true, opacity:0, color:"rgb(0,0,0)", blurtype:BlurType.Gaussian, radius:10, saturation:100, corner_radius: 10, corner_top: true, corner_bottom: false } );
            settings.settings.setValue("windows-inclusion-list", windowList);
         } else {
            let source = new MessageTray.Source(this.meta.name);
            let notification = new MessageTray.Notification(source, _("Error") + ": " + this.meta.name,
               _("Unable to determine the application or the WM_CLASS of the previously focused window, therefore Blur Cinnamon effects can not be applied to that window"),
               {icon: new St.Icon({icon_name: "cinnamon-burn-my-window", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
               );
            Main.messageTray.add(source);
            source.notify(notification);
         }
      }
   }

   destroy() {
      this._signalManager.disconnectAllSignals();
      // Go through all windows and remove effects when a windows compositor has a _blurCinnamonDataWindow field
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         let compositor = windows[i].get_compositor_private();
         if (compositor._blurCinnamonDataWindow) {
            this._unblurWindow(compositor);
         }
      }
   }
}

class BlurFocusEffect extends BlurBase {
   constructor() {
      super();
      // global listeners
      this._signalManager = new SignalManager.SignalManager(null);
      this._signalManager.connect(global.display, "notify::focus-window", this._onFocusChanged, this);
      this._signalManager.connect(global.display, "grab-op-begin", this._onWindowGrabbed, this);
      this._signalManager.connect(global.display, "grab-op-end", this._onFocusChanged ,this);


      if (!Meta.is_wayland_compositor()) {
         this._background = Meta.X11BackgroundActor.new_for_display(global.display);
      } else {
         this._background = new Clutter.Actor();
      }

      this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: settings.focusedWindowEffect, brightness: 1 , width: 0, height: 0} );
      this._cornerEffect = new CornerEffect.CornerEffect( metaData.uuid, {radius: 10, corners_top: true, corners_bottom: true} );

      // By adding the corner effect after the blur effect, the blur effect will spill over the clip border slightly (based on the blur radius).
      // This gives a glow type of effect around the windows border best seen when the focused window is obove other windows.
      this._background.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
      this._background.add_effect_with_name( CORNER_EFFECT_NAME, this._cornerEffect );
      this._background.hide();
      this._onFocusChanged();
   }

   _onWindowGrabbed() {
      // Give the "Compiz windows effect" time to attach the effect, then we remove the backlight effect if the Compiz effect is active.
      // The Compiz effect clips the backlight effect to the compositor actor bounds making for a bad visual result
      Mainloop.idle_add( () => {
         if (this._focusedCompositor && this._focusedCompositor.get_effect('wobbly-compiz-effect')) {
            this._removeEffect();
         }
      });
   }

   _onFocusChanged() {
      let window = global.display.get_focus_window();
      if (this._focusedWindow !== window) {
         this._removeEffect();
      }
      if (window && this._focusedWindow !== window && window.get_window_type() !== Meta.WindowType.DESKTOP) {
         this._focusedWindow = window;
         this._focusedCompositor = window.get_compositor_private();
         this._focusedCompositor.insert_child_at_index(this._background, 0);
         this._signalManager.connect(this._focusedCompositor, "notify::allocation", () => this._setClip() );
         this._signalManager.connect(window, "unmanaging", () => this._removeEffect() );
         this._focusedCompositor._blurCinnamonDataFocusEffect = { effectThis: this };
         this._setClip();
         this._background.show();
      }
   }

   _removeEffect() {
      this._background.hide();
      if (this._focusedCompositor) {
         this._signalManager.disconnect("notify::allocation", this._focusedCompositor );
         this._signalManager.disconnect("unmanaging", this._focusedWindow );
         this._focusedCompositor.remove_child(this._background);
         this._focusedCompositor._blurCinnamonDataFocusEffect = undefined;
      }
      this._focusedWindow = undefined;
      this._focusedCompositor = undefined;
   }

   _setClip() {
      if (this._focusedCompositor) {
         let rect = this._focusedWindow.get_frame_rect();
         // Set the background position to the displays 0,0 based on the compositor's position and the shadow size
         //let windowShadowSizeX = (compositor.get_width() - rect.width) / 2;
         //let windowShadowSizeY = (compositor.get_height() - rect.height) / 2;
         //data.background.set_position( -rect.x+windowShadowSizeX, -rect.y+windowShadowSizeY );

         // Set the background position to the displays 0,0 based on it's transformed position and it's current position
         let [rx,ry] = this._background.get_transformed_position();
         let [x,y] = this._background.get_position();
         this._background.set_position( x-rx, y-ry );

         if (this._cornerEffect)
            this._cornerEffect.clip = [rect.x+2, rect.y+2, rect.width-3, rect.height-3];
         else
            this._background.set_clip( rect.x, rect.y, rect.width, rect.height );
      }
   }

   updateEffect(radius) {
      this._blurEffect.radius = radius;
   }

   destroy() {
      this._background.hide();
      if (this._focusedCompositor) {
         this._signalManager.disconnectAllSignals();
         this._focusedCompositor.remove_child(this._background);
      }
      this._focusedWindow = undefined;
      this._focusedCompositor = undefined;
      this._background.destroy();
   }
}

class BlurDesklets extends BlurBase {
   constructor() {
      super();
      // global listeners
      //this._signalManager = new SignalManager.SignalManager(null);

      blurDeskletsThis = this; // Make "this" available to monkey patched functions

      this.original_createDesklets = DeskletManager._createDesklets;
      DeskletManager._createDesklets = this._createDesklets;
      this.original_unloadDesklet = DeskletManager._unloadDesklet;
      DeskletManager._unloadDesklet = this._unloadDesklet;

      // Make sure all the Desklets are defined in the deskletList
      let desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet && uuid) {
            this._addDeskletToList(desklet);
            this._blurDesklet(desklet);
         }
      }

      // Remove any deskletList entries that are not currently enabled
      let deskletList = settings.settings.getValue("desklets-list");
      for (let i=deskletList.length-1 ; i>=0 ; i-- ) {
         if ( !desklets.find( (element) => element.desklet.instance_id == deskletList[i].instance ) ) {
            deskletList.splice(i, 1);
         }
      }
      // Save desklets-list just in case we removed anything
      settings.settings.setValue("desklets-list", deskletList);
   }

   _blurDesklet(desklet) {
      let content = desklet.content;
      let child = content.get_first_child();
      let themeNode;
      if (child instanceof St.Widget)
         themeNode = child.get_theme_node();
      let topRadius = 0;
      let bottomRadius = 0;
      let cornerRadius = 0;
      if (themeNode) {
         // TODO: Need to be able to independently round all four corners, needs improvements to the corner effect code!
         topRadius = themeNode.get_border_radius(St.Corner.TOPLEFT);
         bottomRadius = themeNode.get_border_radius(St.Corner.BOTTOMLEFT);
         cornerRadius = Math.max(topRadius, bottomRadius);
      }
      let [enabled, opacity, blendColor, blurType, radius, saturation] = this._getDeskletSettings(desklet);
      if (enabled) {
         let background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.bottom_window_group, cornerRadius, topRadius!==0, bottomRadius!==0);
         desklet._blurCinnamonBackground = background;
         this._setClip(desklet);
         background.show();
         desklet._blurCinnamonSignalManager = new SignalManager.SignalManager(null);
         desklet._blurCinnamonSignalManager.connect(desklet.actor, "notify::allocation", () => this._setClip(desklet) );
         //desklet._blurCinnamonSignalManager.connect(desklet, "destroy", () => this._deskletRemoved(desklet) );
      }
   }

   // This is a monkey patched version of DeskletManager._createDesklets()
   // This is done so we know when new Desklets are added.
   _createDesklets(extension, deskletDefinition) {
      let desklet = blurDeskletsThis.original_createDesklets(extension, deskletDefinition);
      blurDeskletsThis._addDeskletToList(desklet);
      Mainloop.idle_add( () => { blurDeskletsThis._blurDesklet(desklet) } );
      return desklet;
   }

   // This is a monkey patched version of DeskletManager._unloadDesklet()
   // This is done so we know when Desklets are removed.
   _unloadDesklet(deskletDefinition, deleteConfig) {
      if (deskletDefinition.desklet) {
         blurDeskletsThis._deskletRemoved(deskletDefinition.desklet);
      }
      blurDeskletsThis.original_unloadDesklet(deskletDefinition, deleteConfig);
   }

   _getUniqueSettings() {
      return [settings.deskletsOpacity, settings.deskletsBlendColor, settings.deskletsBlurType, settings.deskletsRadius, settings.deskletsSaturation];
   }

   _getDeskletSettings(desklet) {
      if (!settings.deskletsOverride || !settings.enableDeskletsUniqueSettings) {
         return [true, ...this._getSettings(settings.deskletsOverride)];
      }
      let uuid = desklet._uuid;
      let instance = desklet.instance_id;
      let deskletList = settings.settings.getValue("desklets-list");
      let found = deskletList.find((element) => element.instance == instance );
      // It should always be found!! We add entries for new Desklet elsewhere
      if (found) {
         if (found.override) {
            return [found.enabled, found.opacity, found.color, found.blurtype, found.radius, found.saturation];
         } else {
            return [found.enabled, ...this._getGenericSettings()];
         }
      } else {
         log( `Blur Cinnamon error: Unable to locate Desklet list entry for ${uuid} / ${instance}` );
      }
   }

   _setClip(desklet) {
      if (desklet && desklet.actor && desklet._blurCinnamonBackground) {
         let actor = desklet.actor;
         let background = desklet._blurCinnamonBackground;
         let cornerEffect = this._getCornerEffect(background);
         if (cornerEffect) {
            cornerEffect.clip = [actor.x+2, actor.y+2, actor.width-3, actor.height-3];
         } else {
            background.set_clip( actor.x, actor.y, actor.width, actor.height );
         }
      }
   }

   updateEffects() {
      let deskletList = settings.settings.getValue("desklets-list");
      deskletList.forEach( (element) => {
         let desklet =  DeskletManager.get_object_for_instance(element.instance);
         if (desklet) {
            //log( `Updating ${desklet.metadata.name} / ${desklet._uuid} / ${desklet.instance_id} / ${(desklet._blurCinnamonBackground!==undefined)}` );
            let [enabled, opacity, blendColor, blurType, radius, saturation] = this._getDeskletSettings(desklet);
            if (desklet._blurCinnamonBackground) {
               if (enabled) {
                  this._updateEffects( desklet._blurCinnamonBackground, opacity, blendColor, blurType, radius, saturation );
               } else {
                  this._deskletDestroy(desklet);
               }
            } else if (enabled) {
               this._blurDesklet(desklet)
            }
         }
      });
   }

   _addDeskletToList(desklet) {
      let deskletList = settings.settings.getValue("desklets-list");
      let found = deskletList.find((element) => element.instance == desklet.instance_id);
      if (!found) {
         // Add a new entry for this Desklet and set the "enabled" based on the auto setting
         log( `Adding: ${desklet.metadata.name} / ${desklet.instance_id}` );
         deskletList.push( {enabled: settings.autoDeskletAdd, name: desklet.metadata.name, uuid: desklet._uuid, instance: desklet.instance_id} );
         settings.settings.setValue( "desklets-list", deskletList );
      } else {
         // Update the name of the Desklet just in case some Desklet update changed it's name in the metadata
         log( `Updating: ${desklet.metadata.name} / ${desklet.instance_id}` );
         found.name = desklet.metadata.name;
         settings.settings.setValue( "desklets-list", deskletList );
      }
   }

   _removeDeskletFromList(desklet) {
      let deskletList = settings.settings.getValue("desklets-list");
      let idx = deskletList.findIndex((element) => element.uuid == desklet._uuid && element.instance == desklet.instance_id);
      if (idx!=-1) {
         deskletList.splice(idx, 1);
         settings.settings.setValue( "desklets-list", deskletList );
      }
   }

   _deskletDestroy(desklet) {
      if (desklet._blurCinnamonSignalManager) {
         desklet._blurCinnamonSignalManager.disconnectAllSignals();
         delete desklet._blurCinnamonSignalManager;
      }
      if (desklet._blurCinnamonBackground) {
         desklet._blurCinnamonBackground.hide();
         global.bottom_window_group.remove_actor(desklet._blurCinnamonBackground);
         desklet._blurCinnamonBackground.destroy();
         delete desklet._blurCinnamonBackground;
      }
   }

   _deskletRemoved(desklet) {
      this._deskletDestroy(desklet);
      this._removeDeskletFromList(desklet);
   }

   destroy() {
      let desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet._blurCinnamonBackground) {
            this._deskletDestroy(desklet);
         }
      }
      DeskletManager._createDesklets = this.original_createDesklets;
      DeskletManager._unloadDesklet = this.original_unloadDesklet;
   }
}

class BlurSettings {
   constructor(uuid) {
      this._signalManager = new SignalManager.SignalManager(null);
      this.settings = new Settings.ExtensionSettings(this, uuid);
      this.bind('opacity',    'opacity',    colorChanged);
      this.bind('blurType',   'blurType',   blurChanged);
      this.bind('radius',     'radius',     blurChanged);
      this.bind('blendColor', 'blendColor', colorChanged);
      this.bind('saturation', 'saturation', saturationChanged);

      this.bind('overview-opacity',    'overviewOpacity');
      this.bind('overview-blurType',   'overviewBlurType');
      this.bind('overview-radius',     'overviewRadius');
      this.bind('overview-blendColor', 'overviewBlendColor');
      this.bind('overview-saturation', 'overviewSaturation');

      this.bind('expo-opacity',    'expoOpacity');
      this.bind('expo-blurType',   'expoBlurType');
      this.bind('expo-radius',     'expoRadius');
      this.bind('expo-blendColor', 'expoBlendColor');
      this.bind('expo-saturation', 'expoSaturation');

      this.bind('panels-opacity',    'panelsOpacity',    colorChanged);
      this.bind('panels-blurType',   'panelsBlurType',   blurChanged);
      this.bind('panels-radius',     'panelsRadius',     blurChanged);
      this.bind('panels-blendColor', 'panelsBlendColor', colorChanged);
      this.bind('panels-saturation', 'panelsSaturation', saturationChanged);
      this.bind('no-panel-effects-maximized', 'noPanelEffectsMaximized', maximizedOptionChanged );

      this.bind('popup-opacity',        'popupOpacity',       updatePopupEffects);
      this.bind('popup-accent-opacity', 'popupAccentOpacity', updatePopupEffects);
      this.bind('popup-blurType',       'popupBlurType',      updatePopupEffects);
      this.bind('popup-radius',         'popupRadius',        updatePopupEffects);
      this.bind('popup-blendColor',     'popupBlendColor',    updatePopupEffects);
      this.bind('popup-saturation',     'popupSaturation',    updatePopupEffects);
      this.bind('allow-transparent-color-popup', 'allowTransparentColorPopup', updatePopupEffects);
      this.bind('popup-applet-menu-effects', 'popupAppletMenuEffects');
      this.bind('popup-panel-menu-effects',  'popupPanelMenuEffects');
      this.bind('popup-title-menu-effects',  'popupTitleMenuEffects');

      this.bind('desktop-opacity',       'desktopOpacity',      updateDesktopEffects);
      this.bind('desktop-blurType',      'desktopBlurType',     updateDesktopEffects);
      this.bind('desktop-radius',        'desktopRadius',       updateDesktopEffects);
      this.bind('desktop-blendColor',    'desktopBlendColor',   updateDesktopEffects);
      this.bind('desktop-saturation',    'desktopSaturation',   updateDesktopEffects);
      this.bind('desktop-with-focus',    'desktopWithFocus',    updateDesktopEffects);
      this.bind('desktop-without-focus', 'desktopWithoutFocus', updateDesktopEffects);

      this.bind('notification-opacity',    'notificationOpacity',    updateNotificationEffects);
      this.bind('notification-blurType',   'notificationBlurType',   updateNotificationEffects);
      this.bind('notification-radius',     'notificationRadius',     updateNotificationEffects);
      this.bind('notification-blendColor', 'notificationBlendColor', updateNotificationEffects);
      this.bind('notification-saturation', 'notificationSaturation', updateNotificationEffects);

      this.bind('appswitcher-opacity',    'appswitcherOpacity');
      this.bind('appswitcher-blurType',   'appswitcherBlurType');
      this.bind('appswitcher-radius',     'appswitcherRadius');
      this.bind('appswitcher-blendColor', 'appswitcherBlendColor');
      this.bind('appswitcher-saturation', 'appswitcherSaturation');

      this.bind('tooltips-opacity',    'tooltipOpacity');
      this.bind('tooltips-blurType',   'tooltipBlurType');
      this.bind('tooltips-radius',     'tooltipRadius');
      this.bind('tooltips-blendColor', 'tooltipBlendColor');
      this.bind('tooltips-saturation', 'tooltipSaturation');

      this.bind('desklets-opacity',    'deskletsOpacity',    updateDeskletEffects);
      this.bind('desklets-blurType',   'deskletsBlurType',   updateDeskletEffects);
      this.bind('desklets-radius',     'deskletsRadius',     updateDeskletEffects);
      this.bind('desklets-blendColor', 'deskletsBlendColor', updateDeskletEffects);
      this.bind('desklets-saturation', 'deskletsSaturation', updateDeskletEffects);

      this.bind('desklets-list',    'deskletList',        updateDeskletEffects);
      //this.bind('desklets-effects', 'deskletEffectsList', updateDeskletEffects);
      this.bind('desklets-auto',    'autoDeskletAdd',     updateDeskletEffects);
      this.bind('enable-desklets-unique-settings', 'enableDeskletsUniqueSettings', updateDeskletEffects);

      this.bind('windows-inclusion-list', 'windowInclusionList', updateWindowEffects);

      this.bind('focused-window-backlight', 'focusedWindowEffect', updateFocusedWindowEffect);

      this.bind('enable-overview-override',     'overviewOverride');
      this.bind('enable-expo-override',         'expoOverride');
      this.bind('enable-panels-override',       'panelsOverride', panelsSettingsChangled);
      this.bind('enable-popup-override',        'popupOverride');
      this.bind('enable-desktop-override',      'desktopOverride', updateDesktopEffects);
      this.bind('enable-notification-override', 'notificationOverride', updateNotificationEffects);
      this.bind('enable-appswitcher-override',  'appswitcherOverride');
      this.bind('enable-tooltips-override',     'tooltipsOverride');
      this.bind('enable-desklets-override',     'deskletsOverride');

      this.bind('enable-overview-effects',      'enableOverviewEffects', enableOverviewChanged);
      this.bind('enable-expo-effects',          'enableExpoEffects',     enableExpoChanged);
      this.bind('enable-panels-effects',        'enablePanelsEffects',   enablePanelsChanged);
      this.bind('enable-popup-effects',         'enablePopupEffects',    enablePopupChanged);
      this.bind('enable-desktop-effects',       'enableDesktopEffects',  enableDesktopChanged);
      this.bind('enable-notification-effects',  'enableNotificationEffects', enableNotificationChanged);
      this.bind('enable-appswitcher-effects',   'enableAppswitcherEffects', enableAppswitcherChanged);
      this.bind('enable-tooltips-effects',      'enableTooltipEffects',  enableTooltipsChanged);
      this.bind('enable-window-effects',        'enableWindowEffects',  enableWindowChanged);
      this.bind('enable-desklet-effects',       'enableDeskletEffects',  enableDeskletChanged);

      this.bind('enable-panel-unique-settings', 'enablePanelUniqueSettings');
      this.bind('panel-unique-settings', 'panelUniqueSettings', panelsSettingsChangled);
      this.bind('allow-transparent-color-panels', 'allowTransparentColorPanels', colorChanged);

      this.bind('new-install', 'newInstall');

      this.bind('component-selector', 'componentSelector');
   }

   // Since Cinnamon's settings does not allow binding to custom type json entries we have to have our own
   bind(key, variable, callback=null) {
      this._signalManager.connect(this.settings, "changed::"+key, () => this._keyChanged(key, variable, callback));
      this[variable] = this.settings.getValue(key);
   }

   _keyChanged(key, variable, callback) {
      let old = this[variable];
      this[variable] = this.settings.getValue(key);
      if (callback && old != this[variable]) {
         callback();
      }
   }

   destroy() {
      this._signalManager .disconnectAllSignals();
      this.settings.finalize();
   }
}

function maximizedOptionChanged() {
   if (blurPanels) {
      blurPanels.setupMaximizeMonitoring();
   }
}

function updateFocusedWindowEffect() {
   if (settings.focusedWindowEffect === 0){
      if (blurFocusEffect) {
         blurFocusEffect.destroy();
         blurFocusEffect = null;
      }
   } else if (settings.focusedWindowEffect > 0) {
      if (!blurFocusEffect) {
         blurFocusEffect = new BlurFocusEffect();
      } else {
         blurFocusEffect.updateEffect(settings.focusedWindowEffect);
      }
   }
}

function updateDeskletEffects() {
   if (blurDesklets && settings.enableDeskletEffects) {
      blurDesklets.updateEffects();
   }
}

function updateWindowEffects() {
   if (blurApplications && settings.enableWindowEffects) {
      blurApplications.updateEffects();
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
   if (blurNotifications && settings.enableNotificationEffects) {
      blurNotifications.updateEffects();
   }
   if (blurApplications && settings.enableWindowEffects) {
      blurApplications.updateEffects();
   }
   if (blurDesklets && settings.enableDeskletEffects) {
      blurDesklets.updateEffects();
   }
}

function colorChanged() {
   if (blurPanels) {
      blurPanels.updateColor();
   }
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
   if (blurNotifications && settings.enableNotificationEffects) {
      blurNotifications.updateEffects();
   }
   if (blurApplications && settings.enableWindowEffects) {
      blurApplications.updateEffects();
   }
   if (blurDesklets && settings.enableDeskletEffects) {
      blurDesklets.updateEffects();
   }
}

function blurChanged() {
   if (blurPanels) {
      blurPanels.updateBlur();
   }
   if (blurDesktop && settings.enableDesktopEffects) {
      blurDesktop.updateEffects();
   }
   if (blurNotifications && settings.enableNotificationEffects) {
      blurNotifications.updateEffects();
   }
   if (blurApplications && settings.enableWindowEffects) {
      blurApplications.updateEffects();
   }
   if (blurDesklets && settings.enableDeskletEffects) {
      blurDesklets.updateEffects();
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
   if (blurNotifications && !settings.enableNotificationEffects) {
      blurNotifications.destroy();
      blurNotifications = null;
   } else if (!blurNotifications && settings.enableNotificationEffects) {
      blurNotifications = new BlurNotifications();
   }
}

function enableTooltipsChanged() {
   if (blurTooltips && !settings.enableTooltipEffects) {
      blurTooltips.destroy();
      blurTooltips = null;
   } else if (!blurTooltips && settings.enableTooltipEffects) {
      blurTooltips = new BlurTooltips();
   }
}

function enableWindowChanged() {
   if (blurApplications && !settings.enableWindowEffects) {
      blurApplications.destroy();
      blurApplications = null;
   } else if (!blurApplications && settings.enableWindowEffects) {
      blurApplications = new BlurApplications();
   }
}

function enableDeskletChanged() {
   settings.enableDeskletEffects
   if (blurDesklets && !settings.enableDeskletEffects) {
      blurDesklets.destroy();
      blurDesklets = null;
   } else if (!blurDesklets && settings.enableDeskletEffects) {
      blurDesklets = new BlurDesklets();
   }
}

function init(extensionMeta) {
   settings = new BlurSettings(extensionMeta.uuid);
   metaData = extensionMeta;

   // Save the version number to the settings so that the About page can read it (is there a better way?)
   settings.settings.setValue("ext-version", extensionMeta.version);

   // Store the original functions for monkey patched functions
   originalAnimateOverview = Overview.Overview.prototype._animateVisible;
   originalAnimateExpo = Expo.Expo.prototype._animateVisible;
   originalInitAppSwitcher3D = AppSwitcher3D.AppSwitcher3D.prototype._init;
   originalHideAppSwitcher3D = AppSwitcher3D.AppSwitcher3D.prototype._hide;
   originalSizeChangeWindowDone = Main.wm._sizeChangeWindowDone;
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

   // Unconditionally monkey patch _sizeChangeWindowDone since it's needed for two effects
   Main.wm._sizeChangeWindowDone = _sizeChangeWindowDoneWindowManager;

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
   // Create a Application (Window) Effects class instance, the constructor will set everything up.
   if (settings.enableWindowEffects) {
      blurApplications = new BlurApplications();
   }
   // Create a Focused Window Effect class instance, the constructor will set everything up.
   if (settings.focusedWindowEffect > 0) {
      blurFocusEffect = new BlurFocusEffect();
   }
   // Create a Focused Window Effect class instance, the constructor will set everything up.
   if (settings.enableDeskletEffects > 0) {
      blurDesklets = new BlurDesklets();
   }
   // If this is the first time running Blur Cinnamon, sent a welcome notification message
   if (settings.newInstall) {
      settings.settings.setValue( "new-install", 0 );
      let source = new MessageTray.Source(metaData.name);
      let notification = new MessageTray.Notification(source, _("Welcome to Blur Cinnamon"),
         _("Hope you are enjoying your new Panel, Expo, Overview and Alt-Tab Coverflow/Timeline effects.\n\nOpen the Blur Cinnamon Settings to enable additional effects on several other desktop elements like menus, notifications and windows, or disable effects on components that were enabled by default. You can also make changes to the effect properties like blur intensity, color saturation and dimming."),
         {icon: new St.Icon({icon_name: "blur-cinnamon", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
         );
      Main.messageTray.add(source);
      notification.addButton("blur-cinnamon-settings", _("Open Blur Cinnamon Settings"));
      notification.connect("action-invoked", (self, id) => { if (id === "blur-cinnamon-settings") Util.spawnCommandLineAsync("xlet-settings extension " + metaData.uuid ); } );
      notification.setUrgency( MessageTray.Urgency.CRITICAL );
      source.notify(notification);
   }
   return Callbacks;
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
      delete AppSwitcher3D.AppSwitcher3D.prototype._oldHide;
      AppSwitcher3D.AppSwitcher3D.prototype._hide = originalHideAppSwitcher3D;
   }

   Main.wm._sizeChangeWindowDone = originalSizeChangeWindowDone;

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

   if (blurApplications) {
      blurApplications.destroy();
      blurApplications = null;
   }

   if (blurFocusEffect) {
      blurFocusEffect.destroy();
      blurFocusEffect = null;
   }

   if (blurDesklets) {
      blurDesklets.destroy();
      blurDesklets = null;
   }

   // If disabled was called to remove the extension entirely rather than a reload
   // we can reset the "new-install" value so that if the user adds the extension
   // again in the future, we can show the welcome notification again!
   let err = new Error();
   if (err.stack.includes("unloadRemovedExtensions@")) {
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
      source.notify(notification);
   },

   on_window_settings_button_pressed: function() {
      Util.spawnCommandLineAsync("cinnamon-settings windows -t 2");
   },

   on_window_add_button_pressed: function() {
      if (blurApplications) {
         blurApplications.window_add_button_pressed();
      }
   }
}
