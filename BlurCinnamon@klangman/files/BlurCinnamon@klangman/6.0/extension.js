// Blur Cinnamon: Blur some components of the Cinnamon Desktop

// Copyright (c) 2026 Kevin Langman

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

const Clutter         = imports.gi.Clutter;
const St              = imports.gi.St;
const Tweener         = imports.ui.tweener;
const Overview        = imports.ui.overview;
const Expo            = imports.ui.expo;
const AppSwitcher3D   = imports.ui.appSwitcher.appSwitcher3D;
const ClassicSwitcher = imports.ui.appSwitcher.classicSwitcher;
const Settings        = imports.ui.settings;
const SignalManager   = imports.misc.signalManager;
const Panel           = imports.ui.panel;
const Main            = imports.ui.main;
const Meta            = imports.gi.Meta;
const Mainloop        = imports.mainloop;
const Signals         = imports.signals;
const AppletManager   = imports.ui.appletManager;
const Lang            = imports.lang;
const UPowerGlib      = imports.gi.UPowerGlib;
const MessageTray     = imports.ui.messageTray;
const Util            = imports.misc.util;
const Tooltips        = imports.ui.tooltips;
const WindowMenu      = imports.ui.windowMenu;
const Cinnamon        = imports.gi.Cinnamon;
const DeskletManager  = imports.ui.deskletManager;
const OsdWindow       = imports.ui.osdWindow;
const GLib            = imports.gi.GLib;
const GObject         = imports.gi.GObject;
const Gettext         = imports.gettext;

const UUID = "BlurCinnamon@klangman";

// Translation support: look in the extension's own catalog first, then fall back to Cinnamon's
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(text) {
   let locText = Gettext.dgettext(UUID, text);
   if (locText === text)
      locText = window._(text);
   return locText;
}

// The special "Default window settings" row in the window list is identified by its name, which is
// saved in the settings. Match both the English name and the translated one, so a row saved before a
// translation was installed (or under a different language) is still found.
const DEFAULT_WINDOW_SETTINGS = "Default window settings";
function isDefaultWindowSettings(element) {
   return element.application === DEFAULT_WINDOW_SETTINGS || element.application === _(DEFAULT_WINDOW_SETTINGS);
}

// For Plank support (reading X11 property)
imports.gi.versions.Gdk = '3.0';
imports.gi.versions.GdkX11 = '3.0';
const Gdk = imports.gi.Gdk;
const GdkX11 = imports.gi.GdkX11;

try {
   var WorkspaceOsd    = imports.ui.workspaceOsd;
   var usesWorkspaceOsd = true;
} catch(e) {
   var  ModalDialog = imports.ui.modalDialog;
   var usesWorkspaceOsd = false;
}

// For PopupMenu effects
const Applet    = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;

const GaussianBlur = require("./gaussian_blur");
const MonteCarloBlur = require("./monte_carlo_blur");
const DualKawaseBlur = require("./dual_kawase_blur");
const Refraction = require("./refraction");
const CornerEffect = require("./corner");
const EffectPool = require("./effect_base");
const Utils = require("./utils.js");

const ANIMATION_TIME = 0.25;
const AUTOHIDE_ANIMATION_TIME = 0.2;  // This is a copy of "Panel.AUTOHIDE_ANIMATION_TIME", we can't legally access it since it's a const and EC6 does not allow it

const BLUR_EFFECT_NAME = "blur";
const DESAT_EFFECT_NAME = "desat";
const CORNER_EFFECT_NAME = "corner";
const NOCULL_EFFECT_NAME = "blurcinnamon-nocull";

// An effect that does nothing at all. Muffin's window culling (meta-cullable.c) skips any window actor
// that has an enabled effect: such a window is not treated as hiding the windows underneath it, so
// those windows are painted in full rather than only where they are visible on screen. Our window
// clones paint through the same culled window actors, so without this the parts of the windows
// underneath that are hidden by a title-bar-blurred window's opaque body come out empty, and the
// blur's sampling margin below the title bar picks up bare wallpaper. A plain Clutter.Effect has no
// offscreen pass, so attaching it costs nothing beyond the extra overdraw of the windows underneath.
const NoCullEffect = GObject.registerClass({
   GTypeName: `BlurCinnamonNoCullEffect_${Math.floor(Math.random() * 100000) + 1}`
}, class NoCullEffect extends Clutter.Effect {});

// Inline style BlurPanels appends to a panel's own inline style so the theme background doesn't hide the blurred background
const PANEL_TRANSPARENT_STYLE = "border-image: none;  border-color: transparent;  box-shadow: 0 0 transparent; " +
                                "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                                "background-gradient-end: transparent;    background: transparent; ";

// Detect workspace API availability once when the module is loaded, used by "windowIsOnWorkspace"
const HAS_LOCATED_ON_WORKSPACE = typeof Meta.Window.prototype.located_on_workspace === 'function';
const HAS_IS_ON_ALL_WORKSPACES = typeof Meta.Window.prototype.is_on_all_workspaces === 'function';
const HAS_GET_WORKSPACE = typeof Meta.Window.prototype.get_workspace === 'function';

let originalAnimateOverview;
let originalAnimateExpo;
let originalShowAppSwitcher3D;
let originalHideAppSwitcher3D;
let originalSizeChangeWindowDone;

let settings;
let blurClassicSwitcher;
let blurPanels;
let blurPopupMenus;
let blurDesktop;
let blurNotifications;
let blurTooltips;
let blurApplications;
let blurDesklets;
let blurOSD;
let blurFocusEffect;
let metaData;

let cloneManager;
let wallpaperTracker = null;
let screenSizeTracker = null;

var blurClassicSwitcherThis;
var blurPanelsThis;
var blurPopupMenusThis;
var blurNotificationsThis;
var blurTooltipsThis;
var blurDeskletsThis;
var blurOSDThis;
var blurWorkspaceOsdThis;

let cloneCount = 0;
let backgroundCount = 0;
let windowEnableIdleId = 0;

const BlurType = {
   None: 0,
   Simple: 1,
   Gaussian: 2,
   Transparent: 3,
   DynamicBlur: 4,    // Dynamic blur using Gaussian
   MonteCarlo: 5,
   DynamicMC: 6,      // Dynamic blur using Monte-Carlo
   DualKawase: 7,
   DynamicDK: 8,      // Dynamic blur using Dual-Kawase
   LiquidGlass: 9,    // Liquid Glass (refraction) effect
   DynamicLG: 10,     // Dynamic blur using Liquid Glass
}

// True for any of the "Dynamic" blur types
function isDynamicBlurType(blurType) {
   return blurType === BlurType.DynamicBlur || blurType === BlurType.DynamicMC || blurType === BlurType.DynamicDK || blurType === BlurType.DynamicLG;
}

// The static blur type that corresponds to a Dynamic blur type (other types are returned unchanged)
function staticBlurType(blurType) {
   switch (blurType) {
      case BlurType.DynamicBlur: return BlurType.Gaussian;
      case BlurType.DynamicMC:   return BlurType.MonteCarlo;
      case BlurType.DynamicDK:   return BlurType.DualKawase;
      case BlurType.DynamicLG:   return BlurType.LiquidGlass;
   }
   return blurType;
}

// True for either of the Liquid Glass blur types
function isLiquidGlassBlurType(blurType) {
   return blurType === BlurType.LiquidGlass || blurType === BlurType.DynamicLG;
}

// The "Blur intensity" setting acts as a percentage (0-100), scale it to the Liquid Glass maximum blur radius
function liquidGlassBlurRadius(radius) {
   return Math.min(Refraction.MAX_BLUR_RADIUS, Math.max(0, radius) * Refraction.MAX_BLUR_RADIUS / 100);
}

// The Liquid Glass effect parameters based on the current settings and the given blur "radius" setting
function getLiquidGlassParams(radius) {
   return {
      strength: settings.liquidGlassStrength,
      blur_radius: liquidGlassBlurRadius(radius),
      edge_size: settings.liquidGlassEdgeSize,
      rim_width: settings.liquidGlassRimWidth,
      falloff: settings.liquidGlassFalloff,
      gloss: settings.liquidGlassGloss,
      tint: 0,   // The generic Tint strength and Tint color settings provide the tinting
      backdrop_zoom: settings.liquidGlassBackdropZoom,
      shadow: settings.liquidGlassShadow,
      rgb_fringing: settings.liquidGlassRgbFringing,
      texture_repeat: settings.liquidGlassTextureRepeat
   };
}

// Update an existing Liquid Glass effect so that it matches the current settings and blur "radius" setting
function applyLiquidGlassSettings(effect, radius) {
   let params = getLiquidGlassParams(radius);
   for (const name in params)
      effect[name] = params[name];
}

function cancelWindowEnableIdle() {
   if (windowEnableIdleId) {
      Mainloop.source_remove(windowEnableIdleId);
      windowEnableIdleId = 0;
   }
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

/*const Component = {
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
}*/

function debugMsg(...params) {
   //log(...params);
}

function printStackTrace(header) {
   log( header );
   var err = new Error();
   log( "Stack:\n"+err.stack );
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
   // The Liquid Glass blur doesn't make any sense for the Overview so we'll default to Gaussian if the generic settings calls for Liquid Glass
   let desktopBackground = children[0];
   if (blurType > BlurType.None) {
      let fx;
      if (blurType === BlurType.Simple) {
         fx = new Clutter.BlurEffect();
      } else if (blurType === BlurType.Gaussian || blurType === BlurType.DynamicBlur || isLiquidGlassBlurType(blurType)) {
         fx = new GaussianBlur.GaussianBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
      } else if (blurType === BlurType.MonteCarlo || blurType === BlurType.DynamicMC) {
         fx = new MonteCarloBlur.MonteCarloBlurEffect( { radius: radius, iterations: settings.montecarloIterations, prefer_closer_pixels: settings.montecarloPerferCloserPixels, use_base_pixel: settings.montecarloUseBasePixel, brightness: 1, width: 0, height: 0 } );
      } else { // Dual-Kawase
         fx = new DualKawaseBlur.DualFilteringBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
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

   // The Liquid Glass blur doesn't make any sense for the Expo so we'll default to Gaussian if the generic settings calls for Liquid Glass
   let desktopBackground = this._background
   if (blurType > BlurType.None) {
      let fx;
      if (blurType === BlurType.Simple) {
         fx =  new Clutter.BlurEffect();
      } else if (blurType === BlurType.Gaussian || blurType === BlurType.DynamicBlur || isLiquidGlassBlurType(blurType)) {
         fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
      } else if (blurType === BlurType.MonteCarlo || blurType === BlurType.DynamicMC) {
         fx = new MonteCarloBlur.MonteCarloBlurEffect( { radius: radius, iterations: settings.montecarloIterations, prefer_closer_pixels: settings.montecarloPerferCloserPixels, use_base_pixel: settings.montecarloUseBasePixel, brightness: 1, width: 0, height: 0 } );
      } else { // Dual-Kawase
         fx = new DualKawaseBlur.DualFilteringBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
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

function _showAppSwitcher3D(...params) {
   this._oldShow(...params);

   if (this._background && this.actor && settings.enableAppswitcherEffects && settings.appswitcherAllow3D) {
      let blurType = (settings.appswitcherOverride) ? settings.appswitcherBlurType : settings.blurType;
      let radius = (settings.appswitcherOverride) ? settings.appswitcherRadius : settings.radius;
      let blendColor = (settings.appswitcherOverride) ? settings.appswitcherBlendColor : settings.blendColor;
      let opacity = (settings.appswitcherOverride) ? settings.appswitcherOpacity : settings.opacity;
      let saturation = (settings.appswitcherOverride) ? settings.appswitcherSaturation : settings.saturation;

      // The Liquid Glass blur doesn't make any sense for the 3dAppSwicher so we'll default to Gaussian of the generic settings calls for Liquid Glass
      let desktopBackground = this._background
      if (blurType > BlurType.None) {
         let fx;
         if (blurType === BlurType.Simple) {
            fx =  new Clutter.BlurEffect();
         } else if (blurType === BlurType.Gaussian || blurType === BlurType.DynamicBlur || isLiquidGlassBlurType(blurType)) {
            fx = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
         } else if (blurType === BlurType.MonteCarlo || blurType === BlurType.DynamicMC) {
            fx = new MonteCarloBlur.MonteCarloBlurEffect( { radius: radius, iterations: settings.montecarloIterations, prefer_closer_pixels: settings.montecarloPerferCloserPixels, use_base_pixel: settings.montecarloUseBasePixel, brightness: 1, width: 0, height: 0 } );
         } else { // Dual-Kawase
            fx = new DualKawaseBlur.DualFilteringBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
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
      color.alpha = Math.round(opacity*2.55);
      this.actor.set_background_color(color);
   }

   // Disable all panels
   if (settings.appswitcherDisablePanels) {
      let panels = Main.getPanels();
      for ( let i=0 ; i < panels.length  ; i++ ) {
         if (panels[i])
            panels[i].disable();
      }
   }
}

function _hideAppSwitcher3D(...params) {
   if (this._background && this._blurCinnamonBlurEffect) {
      this._background.remove_effect(this._blurCinnamonBlurEffect);
   }
   if (this._background && this._blurCinnamonDesatEffect) {
      this._background.remove_effect(this._blurCinnamonDesatEffect);
   }

   // Enable all panels
   if (settings.appswitcherDisablePanels) {
      let panels = Main.getPanels();
      for ( let i=0 ; i < panels.length  ; i++ ) {
         if (panels[i]) {
            // For some reason, if we enable the panels right now the panels applets don't reappear, doing this at idle seems to solve it.
            Mainloop.idle_add( () => panels[i].enable() );
         }
      }
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

function rectOverlap(aX, aY, aX2, aY2, bX, bY, bX2, bY2) {
   if (aX < bX2 && aX2 > bX && // X-axis overlap
       aY < bY2 && aY2 > bY)   // Y-axis overlap
   {
      return true;
   }
   return false;
}

// Is metawindow a above b
function isAbove(a, b) {
   if (a === b) return false;
   const windows = global.display.sort_windows_by_stacking([a, b]);
   return windows[0] === b;
}

// The blur shaders clamp their sample position to 3 px inside their texture (see getTexture() in
// gaussian_blur.glsl and sampleBoundary() in dual_filtering_*.glsl), so the outermost 3 px of a
// viewport's FBO are never real content.
const VIEWPORT_EDGE_PAD = 3;

// How many pixels a wrapped viewport must extend past the visible rect, on every side, so that the blur
// effect always has real, correctly cloned content to sample for every visible pixel. Each blur effect
// reports its own maximum sampling distance through sample_reach (see the .js file of each effect).
function getViewportMargin(viewport) {
   let effect = viewport.get_effect(BLUR_EFFECT_NAME);
   if (!effect || !effect.sample_reach)
      return 0;
   return Math.ceil(effect.sample_reach) + VIEWPORT_EDGE_PAD;
}

// The visible rect grown by margin on every side, then cut to the stage, as [x, y, width, height].
// Nothing outside the stage is ever cloned, so any part of the viewport out there would be transparent.
// The blur would then mix that transparency into the pixels near the screen edge, and every inner pass
// of the effect chain (blur passes, desaturate) stores partial alpha as a*a (see SNIPPET_CODE in
// effect_base.js), compounding pass after pass. The final pass then lets the unblurred scene behind show
// through over the blurred colour: a bright, glowing band along the screen edge wherever a window hangs
// off the screen (worst with Dual Kawase, which has the most passes). Cut to the stage, the FBO holds
// only real, opaque content and the shaders' own edge clamp applies at the screen edge, as it does for a
// panel there. The corner effect's clip stays the full visible rect, so off-screen corners stay off screen.
function getExpandedRect(x, y, width, height, margin) {
   if (![x, y, width, height, margin].every(Number.isFinite) || width <= 0 || height <= 0)
      return [0, 0, 0, 0];

   margin = Math.max(0, margin);
   let x1 = Math.floor(Math.max(0, x - margin));
   let y1 = Math.floor(Math.max(0, y - margin));
   let x2 = Math.ceil(Math.min(global.stage.width, x + width + margin));
   let y2 = Math.ceil(Math.min(global.stage.height, y + height + margin));

   // Entirely off the stage: nothing to show
   if (x2 <= x1 || y2 <= y1)
      return [0, 0, 0, 0];

   return [x1, y1, x2 - x1, y2 - y1];
}

function getBackgroundClip(background) {
   // When a background has been wrapped in a "viewport" actor (see
   // BlurBase._createBackgroundAndEffects's useViewport), the corner/blur/desaturate effects live on
   // the viewport instead, and background itself carries a plain Clutter clip matching the viewport's
   // *expanded* rect (the visible rect plus the blur's sampling margin - see _applyBackgroundClip()).
   // That expanded rect is what CloneManager must use to decide which windows need cloning, since the
   // blur samples the whole margin, not just the visible rect.
   if (background._blurCinnamonViewport)
      return background.get_clip();
   let effect = background.get_effect(CORNER_EFFECT_NAME);
   let clip;
   if (effect) {
      clip = effect.clip;
   } else {
      clip = background.get_clip();
   }
   return clip;
}

// Hack: To fix artifacts after a lower z-order clone is updated, redraw the clone that is one higher in the z-order (the window directly above).
// This is only needed for application window backgrounds.
//
// Preferred trigger: the source window actor's "damaged" signal. It fires only when that window's content
// really changes, and before the stage paints, so the extra redraw lands in the same frame.
//
// Fallback (Muffin builds without "damaged"): the clone's "paint" signal. That fires whenever the blur group
// repaints (for any reason, every clone in it), and queue_redraw() called from inside a paint is serviced in
// the NEXT frame, where every clone paints again and would queue its neighbour again, forever. So the frame
// our redraws cause is a "forced frame" in which clonePainted() does nothing; the stage then goes idle.
let artifactUseDamaged = true;       // Cleared the first time connecting to "damaged" fails
let artifactRedrawQueued = false;   // We queued redraws during the frame currently being painted
let artifactForcedFrame = false;    // The frame currently being painted was caused by our redraws
let artifactAfterPaintId = 0;

function artifactAfterPaint() {
   artifactForcedFrame = artifactRedrawQueued;
   artifactRedrawQueued = false;
   if (!artifactForcedFrame) {
      // Idle again, no need to watch the stage until clonePainted() queues something.
      stopArtifactMitigationGuard();
   }
}

function stopArtifactMitigationGuard() {
   if (artifactAfterPaintId) {
      global.stage.disconnect(artifactAfterPaintId);
      artifactAfterPaintId = 0;
   }
   artifactRedrawQueued = false;
   artifactForcedFrame = false;
}

// Queue a redraw of the first drawn clone above "actor" in background's z-order, if the two windows overlap.
// Returns true if a redraw was queued.
function redrawCloneAbove(background, actor) {
   let clones = background._blurCinnamonWinClones;
   if (!clones) {
      return false;
   }
   // Use the already-maintained, already-ordered (bottom -> top) clone list instead of asking Clutter
   // for the group's full child list (which also holds the dimmer, corner-effect actor, desklet clone,
   // etc.) and linear-scanning it every time.
   let idx = clones.indexOf(actor);
   if (idx === -1) {
      return false;
   }
   // Find the first clone above that is actually drawn. A clone whose window is hidden or at opacity 0
   // (e.g. Burn-My-Windows hides the real window and draws its effect container instead) gets no paint,
   // so redrawing it does nothing; its effect clone, if any, is what is visible in its place.
   for (let i = idx+1 ; i < clones.length ; i++) {
      let next = clones[i];
      let fx = next._blurCinnamonEffectClone;
      let nextDrawn = next.visible && next.opacity > 0;
      if (!nextDrawn && !fx) {
         continue;
      }
      // Skip clones that can't possibly show the artifact: if the two windows don't overlap on screen
      // there's no shared seam between them for a stale-pixel gap to appear in.
      let a = actor._metaWindow.get_buffer_rect();
      let b = next._metaWindow.get_buffer_rect();
      if (rectOverlap(a.x, a.y, a.x + a.width, a.y + a.height, b.x, b.y, b.x + b.width, b.y + b.height)) {
         //log( `[artifact] ${actor._metaWindow.get_title()} updated, queuing redraw for ${next._metaWindow.get_title()}` );
         if (nextDrawn) {
            next.queue_redraw();
         }
         if (fx) {
            fx.queue_redraw();
         }
         return true;
      }
      return false;
   }
   return false;
}

// Fallback trigger, see above.
function clonePainted(background, actor) {
   if (artifactForcedFrame) {
      return;
   }
   if (redrawCloneAbove(background, actor)) {
      artifactRedrawQueued = true;
      if (!artifactAfterPaintId) {
         artifactAfterPaintId = global.stage.connect("after-paint", artifactAfterPaint);
      }
   }
}

function connectArtifactMitigation(background, windowClone, compositor) {
   if (windowClone._artifactHandler) {
      return;
   }
   if (artifactUseDamaged && compositor) {
      try {
         let id = compositor.connect("damaged", () => redrawCloneAbove(background, windowClone));
         windowClone._artifactHandler = { obj: compositor, id: id };
         return;
      } catch (e) {
         // This Muffin has no "damaged" signal on window actors.
         artifactUseDamaged = false;
         debugMsg( `No "damaged" signal on window actors, using the paint signal for artifact mitigation` );
      }
   }
   let id = windowClone.connect("paint", () => clonePainted(background, windowClone));
   windowClone._artifactHandler = { obj: windowClone, id: id };
}

function disconnectArtifactMitigation(windowClone) {
   let h = windowClone._artifactHandler;
   if (h) {
      try {
         h.obj.disconnect(h.id);
      } catch (e) {
         // The window actor is already gone (closed window), its handlers went with it.
      }
      delete windowClone._artifactHandler;
   }
}

function getWindowCloneRect(metaWindow, background) {
   if (background._blurCinnamonName !== "OsdWindow")
      return metaWindow.get_buffer_rect();

   const compositor = metaWindow.get_compositor_private();
   if (!compositor || !compositor.get_stage())
      return null;

   const box = Cinnamon.util_get_transformed_allocation(compositor);
   const width = box.x2 - box.x1;
   const height = box.y2 - box.y1;
   if (![box.x1, box.y1, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
      return null;

   return {x: box.x1, y: box.y1, width, height};
}

function updateWindowCloneGeometry(windowClone, background, rect) {
   windowClone.set_position(rect.x, rect.y);
   if (background._blurCinnamonName === "OsdWindow")
      windowClone.set_size(rect.width, rect.height);
}

// Painting a window clone paints its source window, including that window's own blurred background
// and the window clones in it. If following those clones leads back to `background`, adding a clone
// of `source` to it would make the stage paint loop forever ("too much recursion" in UiActor.vfunc_paint,
// then a crash). createWindowClone() already removes the direct A <-> B case; this also catches longer
// loops (A -> B -> C -> A) left behind when only some backgrounds have been rescanned after a stacking
// change (i.e. restoring a minimized window). Returns the window backgrounds on the way, or null if
// there is no loop.
function findCloneLoop(background, source) {
   let seen = new Set();
   let visited = [];
   let stack = [source];
   let loop = false;
   while (stack.length) {
      let actor = stack.pop();
      if (!actor || seen.has(actor))
         continue;
      seen.add(actor);
      if (actor.contains(background))
         loop = true;
      let bg = actor._blurCinnamonDataWindow ? actor._blurCinnamonDataWindow.background : null;
      if (!bg || !bg._blurCinnamonWinClones)
         continue;
      visited.push(bg);
      for (const clone of bg._blurCinnamonWinClones)
         stack.push(clone.get_source());
   }
   return loop ? visited : null;
}

// Log a clone loop that was refused and rescan the backgrounds on it, so they rebuild their clones
// from the current stacking order.
function refuseCloneLoop(background, metaWindow, loopBackgrounds) {
   let owner = background._blurCinnamonMetaWindowOwner;
   let names = loopBackgrounds.map( (bg) => bg._blurCinnamonMetaWindowOwner ? `"${bg._blurCinnamonMetaWindowOwner.get_title()}"` : bg._blurCinnamonName );
   log( `BlurCinnamon: not cloning "${metaWindow.get_title()}" into the background of ${owner ? `"${owner.get_title()}"` : background._blurCinnamonName}, it would paint itself through ${names.join(" -> ")}` );
   for (const bg of loopBackgrounds)
      cloneWindowsForBackground(bg, bg._blurCinnamonDesktopOnly);
   cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
}

function createWindowClone(metaWindow, background, desktopOnly) {
   // The wallpaper already comes from the WallpaperTracker clone at the bottom of the group
   if (hasStaticWallpaper(background) && isWallpaperWindow(metaWindow))
      return null;
   let owner = background._blurCinnamonMetaWindowOwner;
   if (background.is_mapped() && owner !== metaWindow && (!desktopOnly || metaWindow.get_window_type() === Meta.WindowType.DESKTOP) &&
      (!owner || owner.get_window_type() !== Meta.WindowType.DESKTOP || metaWindow.get_window_type() === Meta.WindowType.DESKTOP) ) {
      // Debugging check
      if( background._blurCinnamonWinClones.find( (element) => element._metaWindow === metaWindow) ) {
         log( `Warning! Tried to add a window clone to a background that already has a clone for that window.` );
         return;
      }
      let rect = getWindowCloneRect(metaWindow, background);
      let compositor = metaWindow.get_compositor_private();
      if (!rect || !compositor)
         return null;
      // Remove any clones of the backgrounds window in metaWindow's clones. Required to avoid a recurrsion during painting.
      if (owner && compositor) {
         let blurData = compositor._blurCinnamonDataWindow;
         if (blurData && blurData.background &&  blurData.background._blurCinnamonWinClones) {
            destroyClones(blurData.background, (clone) => clone._metaWindow === owner );
         }
      }
      let loopBackgrounds = findCloneLoop(background, compositor);
      if (loopBackgrounds) {
         refuseCloneLoop(background, metaWindow, loopBackgrounds);
         return null;
      }
      let windowClone = new Clutter.Clone({reactive: false, x: rect.x, y: rect.y });
      updateWindowCloneGeometry(windowClone, background, rect);
      cloneCount++;
      if (owner) {
         debugMsg( `Created clone ${windowClone} of ${metaWindow.get_title()}/${metaWindow.get_id()} for background ${background._blurCinnamonName} "${owner.get_title()}"/"${owner.get_wm_class()}"` );
      } else {
         debugMsg( `Created clone ${windowClone} of ${metaWindow.get_title()}/${metaWindow.get_id()} for background ${background._blurCinnamonName}` );
      }
      if (metaWindow.get_window_type() === Meta.WindowType.DESKTOP && background._blurCinnamonDeskletClone) {
         background._blurCinnamonGroup.insert_child_below(windowClone, background._blurCinnamonDeskletClone);
      } else {
         background._blurCinnamonGroup.insert_child_below(windowClone, background._blurCinnamonDimmer);
      }
      // Set the source only after the clone is in the group. Mapping a clone that has a source reads
      // its allocation, and from inside a window's allocation that runs a nested stage relayout that
      // drops the window group's pending relayout. With no source yet, mapping doesn't read it.
      windowClone.set_source(compositor);
      background._blurCinnamonWinClones.push(windowClone);
      windowClone._metaWindow = metaWindow;
      if (settings.windowArtifactMitigation && owner) {
         connectArtifactMitigation(background, windowClone, compositor);
      }
      // Follow the window actor's opacity and any Burn-My-Windows effect container (see
      // syncWindowCloneWithSource()). Done after the clone is in the group, since an effect
      // clone gets inserted right above it.
      windowClone._blurCinnamonSource = compositor;
      windowClone._blurCinnamonOpacityId = compositor.connect("notify::opacity", () => syncWindowCloneWithSource(background, windowClone));
      syncWindowCloneWithSource(background, windowClone);
      return windowClone;
   } else {
      debugMsg( "Not creating an unnecessary clone." );
   }
}

// ---------------------------------------------------------------------------------------------
// Burn-My-Windows (CinnamonBurnMyWindows@klangman) interop
//
// A Clutter.Clone ignores its source's opacity (ClutterClone overrides the source's paint opacity
// with its own), and BMW effects that need more room than the window (Apparition, Broken Glass,
// Doom, Matrix, Snap, T-Rex) or draw on several layers (Aperture Panels, Morph, Wormhole) don't
// draw on the window actor at all: they set actor.opacity = 0 and render a clone of the window,
// with the shader, on a separate actor in Main.uiGroup (above global.window_group). Without the
// code below, every blurred background keeps showing the plain, un-animated window for the whole
// animation.
//
// BMW's contract (see _setupEffect() and the effects' createLayers()):
//   * actor._bmwEffectContainer is set BEFORE actor.opacity drops to 0 and cleared BEFORE it is
//     restored to 255, so a notify::opacity handler always sees the right container.
//   * The container only ever holds a clone of the animating window itself (never clones of other
//     windows), so cloning it can't recurse any more than cloning the window already could.
//   * Effects that draw directly on the window actor (most of them) need nothing: the offscreen
//     shader paints its FBO with the current modelview, so it renders correctly through clones.
// ---------------------------------------------------------------------------------------------

// Stage position of an actor, from the x/y properties of it and its ancestors, ignoring any
// scale/pivot. BMW containers are never scaled or rotated, and x/y (unlike the allocation) are up
// to date as soon as BMW moves them from its timeline, so the clone never lags a frame behind.
// Also used to position a window's blur inside its (possibly BMW-scaled) compositor actor.
function _stagePosition(actor) {
   let x = 0, y = 0;
   for (let a = actor ; a && a !== global.stage ; a = a.get_parent()) {
      x += a.x;
      y += a.y;
   }
   return [x, y];
}

function _positionEffectClone(windowClone) {
   let fx = windowClone._blurCinnamonEffectClone;
   if (fx && windowClone._blurCinnamonEffectSource) {
      let [x, y] = _stagePosition(windowClone._blurCinnamonEffectSource);
      fx.set_position(Math.round(x), Math.round(y));
   }
}

function _destroyEffectClone(windowClone) {
   let fx = windowClone._blurCinnamonEffectClone;
   if (!fx) return;
   for (let [obj, id] of windowClone._blurCinnamonEffectHandlers) {
      try {
         obj.disconnect(id);
      } catch (e) {
         // Already destroyed together with the BMW container.
      }
   }
   delete windowClone._blurCinnamonEffectHandlers;
   delete windowClone._blurCinnamonEffectSource;
   delete windowClone._blurCinnamonEffectClone;
   let parent = fx.get_parent();
   if (parent) parent.remove_child(fx);
   fx.destroy();
}

// Keep the effect clone directly above its window clone (call after restacking windowClone).
function restackEffectClone(windowClone) {
   let fx = windowClone._blurCinnamonEffectClone;
   let parent = windowClone.get_parent();
   if (fx && parent && fx.get_parent() === parent) {
      parent.set_child_above_sibling(fx, windowClone);
   }
}

// Make windowClone look like its source window actor right now: same opacity, and while a BMW
// effect runs elsewhere, a clone of the BMW effect container stacked right above it.
function syncWindowCloneWithSource(background, windowClone) {
   let source = windowClone._blurCinnamonSource;
   if (!source) return;
   windowClone.opacity = source.opacity;

   let container = source._bmwEffectContainer || null;
   // The BMW container is a plain Clutter.Actor on the stage. Never clone one that contains this
   // background (impossible with the current BMW code, but it would recurse forever if it did).
   if (container && (container.contains(background) || !container.get_stage())) {
      container = null;
   }
   if (container === (windowClone._blurCinnamonEffectSource || null)) {
      return;
   }
   _destroyEffectClone(windowClone);
   if (!container) {
      return;
   }
   let parent = windowClone.get_parent();
   if (!parent) {
      return;
   }
   let fx = new Clutter.Clone({reactive: false});
   parent.insert_child_above(fx, windowClone);
   // Source set after inserting, for the same reason as in createWindowClone()
   fx.set_source(container);
   windowClone._blurCinnamonEffectClone = fx;
   windowClone._blurCinnamonEffectSource = container;
   // BMW moves the canvas (unscaled-canvas effects) or the layer group holding the container
   // (layered effects) once a frame while a window opens; follow any of them.
   let handlers = [];
   for (let a = container ; a && a !== global.stage ; a = a.get_parent()) {
      handlers.push([a, a.connect("notify::x", () => _positionEffectClone(windowClone))]);
      handlers.push([a, a.connect("notify::y", () => _positionEffectClone(windowClone))]);
   }
   handlers.push([container, container.connect("destroy", () => _destroyEffectClone(windowClone))]);
   windowClone._blurCinnamonEffectHandlers = handlers;
   _positionEffectClone(windowClone);
   debugMsg( `Cloned the Burn-My-Windows effect of "${windowClone._metaWindow ? windowClone._metaWindow.get_title() : "?"}" into background ${background._blurCinnamonName}` );
}

// Destroy a clone, but does not remove the clone reference
function _destroyWindowClone(windowClone, background) {
   if (!windowClone._metaWindow) {
      debugMsg( `No _metaWindow for clone ${windowClone}` );
   }
   if (background._blurCinnamonMetaWindowOwner) {
      debugMsg( `Removing clone ${windowClone} of "${windowClone._metaWindow.get_title()}"/${windowClone._metaWindow.get_id()} from background ${background._blurCinnamonName} / ${background._blurCinnamonMetaWindowOwner.get_title()} with ${background._blurCinnamonWinClones.length} clones` );
   } else {
      debugMsg( `Removing clone ${windowClone} of "${windowClone._metaWindow.get_title()}"/${windowClone._metaWindow.get_id()} from background ${background._blurCinnamonName} with ${background._blurCinnamonWinClones.length} clones` );
   }
   disconnectArtifactMitigation(windowClone);
   if (windowClone._blurCinnamonOpacityId) {
      try {
         windowClone._blurCinnamonSource.disconnect(windowClone._blurCinnamonOpacityId);
      } catch (e) {
         // The window actor is already gone (closed window), its handlers went with it.
      }
      delete windowClone._blurCinnamonOpacityId;
   }
   delete windowClone._blurCinnamonSource;
   _destroyEffectClone(windowClone);
   background._blurCinnamonGroup.remove_child(windowClone);
   windowClone.destroy();
   cloneCount--;
}

// Destroy and removes the referece to the clone.
// This should never be called from within a forEach on _blurCinnamonWinClones since this function mutates the array
// Use destroyClones() instead!
function destroyWindowClone(windowClone, background) {
   _destroyWindowClone(windowClone, background);
   let idx = background._blurCinnamonWinClones.indexOf(windowClone);
   if (idx != -1 ) {
      background._blurCinnamonWinClones.splice(idx, 1);
      debugMsg( `Removed clone array element idx ${idx} leaving ${background._blurCinnamonWinClones.length} clones in the array` );
   }
}

function destroyAllWindowsClones(background) {
   debugMsg( `Removing ${background._blurCinnamonWinClones.length} window clones from background ${background}` );
   background._blurCinnamonWinClones.forEach( (windowClone) => {
      _destroyWindowClone(windowClone, background);
   });
   // Remove all references!
   background._blurCinnamonWinClones = [];
}

function destroyClones(background, shouldDestroy) {
   for( let i=background._blurCinnamonWinClones.length-1 ; i >= 0 ; i-- ) {
      if (shouldDestroy(background._blurCinnamonWinClones[i])) {
         destroyWindowClone(background._blurCinnamonWinClones[i], background);
      }
   }
}

// Remove clones not in the new list of clones, add clones for windows not in the existing list of clones
function applyNewCloneList(background, windowsToClone, desktopOnly) {
   // Hide all clones that are no longer needed
   let clones = background._blurCinnamonWinClones;
   clones.forEach( (clone) => {
      if (!windowsToClone.includes(clone._metaWindow)) {
         clone.hide();
      }
   });
   // Reorder and/or add any missing clones.
   windowsToClone.forEach( (metaWindow) => {
      if (background.is_mapped() && background._blurCinnamonMetaWindowOwner !== metaWindow && (!desktopOnly || metaWindow.get_window_type() === Meta.WindowType.DESKTOP)) {
         let idx = clones.findIndex( (clone) => clone._metaWindow === metaWindow );
         if (idx !==-1) {
            if (metaWindow.get_window_type() === Meta.WindowType.DESKTOP && background._blurCinnamonDeskletClone) {
               background._blurCinnamonGroup.insert_child_below(clones[idx], background._blurCinnamonDeskletClone);
            } else {
               background._blurCinnamonGroup.insert_child_below(clones[idx], background._blurCinnamonDimmer);
            }
            restackEffectClone(clones[idx]);
         } else {
            createWindowClone(metaWindow, background, desktopOnly);
         }
      }
   });
   // Remove all hidden clones on idle to avoid issues (do we really need to do it at idle??)
   Mainloop.idle_add( () => {
      if (!background._blurCinnamonWinClones) {
         return;
      }
      destroyClones(background, (clone) => !clone.is_visible());
   });
}

function destroyAllNonDesktopClones(background) {
   destroyClones(background, (clone) => clone._metaWindow.get_window_type() !== Meta.WindowType.DESKTOP);
}

function windowIsOnWorkspace(metaWindow, workspace) {
  if (!metaWindow || !workspace)
    return false;

  if (HAS_LOCATED_ON_WORKSPACE) {
      try {
          return metaWindow.located_on_workspace(workspace);
      } catch (e) {
         // Fall through to compatibility checks
      }
  }

  if (HAS_IS_ON_ALL_WORKSPACES) {
    try {
      if (metaWindow.is_on_all_workspaces())
        return true;
    } catch (e) {
    }
  }

  if (HAS_GET_WORKSPACE) {
    try {
      return metaWindow.get_workspace() === workspace;
    } catch (e) {
    }
  }

  // Avoid excluding windows on unsupported Cinnamon/Muffin versions
  return true;
}

function cancelWindowCloneUpdate(background) {
    if (background._blurCinnamonCloneUpdateId) {
        Meta.later_remove(background._blurCinnamonCloneUpdateId);
        delete background._blurCinnamonCloneUpdateId;
    }
}

// This function just schedules an update to the background clones.
// We don't do this work right away for a number of reasons:
// 1. There are (what I believe to be) bugs in Clutter that causes hangs and weird behavior if done immediately
// 2. The sort_windows_by_stacking() API will sort incorrectly when called from within the "notify::focus-window" event handler
//
// Clip updates call this on every frame of a window drag or a panel animation, so keep at most one pending
// update per background: further calls before it runs only record the latest desktopOnly.
function cloneWindowsForBackground(background, desktopOnly) {
  if (background._blurCinnamonName === "OsdWindow") {
      if (!background._blurCinnamonWinClones || background._blurCinnamonCloneUpdateId)
          return;
      background._blurCinnamonCloneUpdateId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
        delete background._blurCinnamonCloneUpdateId;
        cloneWindowsForBackgroundNow(background, desktopOnly);
        return false;
      });
      return;
  }
   //Promise.resolve().then( () => cloneWindowsForBackgroundNow(background, desktopOnly) );
   background._blurCinnamonRecloneDesktopOnly = desktopOnly;
   if (background._blurCinnamonRecloneId)
      return;
   background._blurCinnamonRecloneId = Mainloop.idle_add( () => {
      background._blurCinnamonRecloneId = 0;
      cloneWindowsForBackgroundNow(background, background._blurCinnamonRecloneDesktopOnly);
      return false;
   });
}

// Find windows that need to be cloned for the background passed in.
// metaWindowOwner is the window that owns the background and therefore
// only windows with a z-order below that window should be included.
// If metaWindowOwner is null, all overlapping windows will be cloned.
// desktopOnly: bool, true when the background should only show desktop clones
function cloneWindowsForBackgroundNow(background, desktopOnly) {
   cancelWindowCloneUpdate(background);
   // addBackground() will create an empty _blurCinnamonWinClones array. If we
   // don't see that array now then the background must have been already deleted
   // so we can safely just abort this call.
   if (!background._blurCinnamonWinClones) {
      return;
   }
   let isOsd = background._blurCinnamonName === "OsdWindow";
   let [blurX, blurY, blurWidth, blurHeight] = getBackgroundClip(background);
   if (blurWidth===0 || blurHeight===0 || !background.is_mapped()) {
      debugMsg( `Blurred background is zero size or unmapped: width ${blurWidth}  height ${blurHeight}  mapped ${background.is_mapped()}` );
      return;
   }
   let blurX2 = blurX + blurWidth;
   let blurY2 = blurY + blurHeight;
   let windowsToClone = [];
   let metaWindowOwner = background._blurCinnamonMetaWindowOwner;

   // Find all windows that are visible and overlap with the passed in background
   let windows = global.get_window_actors();
   windows.forEach( (window) => {
      let metaWindow = window.get_meta_window();
      if (!metaWindow)
          return;

      let compositor = metaWindow.get_compositor_private();
      if (!compositor)
          return;

      if (compositor.visible &&
         (!desktopOnly || metaWindow.get_window_type() === Meta.WindowType.DESKTOP) &&
          metaWindow.get_window_type() !== Meta.WindowType.OVERRIDE_OTHER /*&& metaWindow.get_wm_class() !== "Nemo-desktop"*/ &&
          !(hasStaticWallpaper(background) && isWallpaperWindow(metaWindow))) {

          let winRect = getWindowCloneRect(metaWindow, background);
          if (!winRect)
             return;
          let winX = winRect.x;
          let winY = winRect.y;
          let winX2 = winRect.x + winRect.width;
          let winY2 = winRect.y + winRect.height;
          if (rectOverlap(winX, winY, winX2, winY2, blurX, blurY, blurX2, blurY2)) {
              windowsToClone.push(metaWindow);
          }
      }
   });

   // Sort the windows bye the stacking order (lowest -> highest z-order)
   windowsToClone = global.display.sort_windows_by_stacking(windowsToClone);

   // Remove owner window and all windows above it
   if (metaWindowOwner) {
      let idx = windowsToClone.findIndex( (element) => element === metaWindowOwner );
      if (idx !== -1) {
         debugMsg( `Removing windowsToClone (${windowsToClone.length}) before index ${idx}` );
         windowsToClone.splice(idx, Infinity);
      }
   }

   // Deal with the existing clones
   let clones = background._blurCinnamonWinClones;
   if (clones.length > 0) {
      // Check if we have any changes to worry about
      if (windowsToClone.length === clones.length) {
         let i=0;
         for( i=0 ; i<clones.length ; i++ ) {
            if (windowsToClone[i] !== clones[i]._metaWindow) {
               break;
            }
         }
         if (i === clones.length) {
            // No changes to the set of clones, so do nothing.
            // An OSD clone still needs the current visual position during workspace animation.
            if (isOsd) {
               for (const clone of clones) {
                  const rect = getWindowCloneRect(clone._metaWindow, background);
                  if (rect) updateWindowCloneGeometry(clone, background, rect);
               }
            }
            return;
         }
      }

      // There are changes to the set of clones needed, so clear all existing clones
      destroyAllWindowsClones(background);
   }
   // Create all the needed clones
   debugMsg( `Creating ${windowsToClone.length} clones for Background of ${background._blurCinnamonName}` );
   if (metaWindowOwner) {
      debugMsg( `Window: ${metaWindowOwner.get_title()}/${metaWindowOwner.get_id()}` );
   }
   windowsToClone.forEach( (window) => createWindowClone(window, background, desktopOnly) );

   return;
}

// Shared notifier between this extension and the "Rounded Corners" extension, published as
// global.roundedCornersNotifier. Whichever extension loads first creates it, and neither ever removes
// it, so either can connect to it at any time, whatever the load order. Each extension disconnects only
// its own handlers. Rounded Corners emits:
//   "enabled"                     it started; metaWindow._roundedCornersRadius is now set on every window it rounds
//   "radius-changed" (metaWindow) that window's _roundedCornersRadius ([top, bottom] in logical pixels,
//                                 null where Rounded Corners isn't rounding those corners) was set, changed
//                                 or cleared (undefined)
//   "disabled"                    it stopped; no window has _roundedCornersRadius any more
// and keeps notifier.enabled true while it's running.
function getRoundedCornersNotifier() {
   let notifier = global.roundedCornersNotifier;
   if (!notifier || typeof notifier.connect !== "function" || typeof notifier.emit !== "function") {
      notifier = { enabled: false };
      Signals.addSignalMethods(notifier);
      global.roundedCornersNotifier = notifier;
   }
   return notifier;
}

// Manage the window clones that are attached to blurred backgrounds when Dynamic Blurring is enabled on one or more components.
// This will create and delete window clones as needed based on whether or not there is any overlap between a window and the
// blurred background clip regions. Also tracks windows as they appear, disappear or move and makes the appropriate changes
// to the window clones.
class CloneManager {

   constructor() {
      this._signalManager = new SignalManager.SignalManager(null);
      this._backgrounds = [];
      this._activeWorkspaceIdx = global.workspace_manager.get_active_workspace_index();

      this._signalManager.connect(global.screen, "window-added", (screen, metaWindow, monitor) => this._onWindowAppeared(metaWindow) );
      this._signalManager.connect(global.window_manager, "switch-workspace", () => this._updateCurrentWorkspace() );
      this._signalManager.connect(global.display, "notify::focus-window", () => this._onFocusChanged() );
      this._signalManager.connect(global, 'scale-changed', () => this._uiScaleChanged());
      this._setupWindowListeners();
   }

   _uiScaleChanged() {
      debugMsg( "UI Scale Changed" );
      this._backgrounds.forEach( (background) => destroyAllWindowsClones(background) );
      // Delay creating closes to avoid issues with an instance destroy/create sequence
      this._backgrounds.forEach( (background) => cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly) );
   }

   getBackgroundCount() {
      return this._backgrounds.length;
   }

   backgroundClipChanged(background) {
      debugMsg( "Clip Changed" );
      let idx = this._backgrounds.indexOf(background);
      if (idx!==-1) {
         cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
      }
   }

   updateArtifactMitigation() {
      debugMsg( "Update Artifact Mitigation" );
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonMetaWindowOwner) {
            background._blurCinnamonWinClones.forEach( (windowClone) => {
               if (settings.windowArtifactMitigation) {
                  connectArtifactMitigation(background, windowClone, windowClone._metaWindow.get_compositor_private());
               } else {
                  disconnectArtifactMitigation(windowClone);
               }
            });
         }
      });
   }

   addBackground(background, owner, desktopOnly) {
      let idx = this._backgrounds.indexOf(background);
      if (idx !== -1) {
         debugMsg( `Not adding existing background "${background._blurCinnamonName}"` );
         return;
      }
      if (background._blurCinnamonWinClones)
         debugMsg( `Already has clones... length ${background._blurCinnamonWinClones.length}` );
      debugMsg( `Adding background "${background}", children ${background._blurCinnamonGroup.get_n_children()}` );
      background._blurCinnamonWinClones = [];
      this._backgrounds.push(background);
      if (owner !== global.desklet_container && (!owner || owner.get_window_type() !== Meta.WindowType.DESKTOP)) {
         let deskletClone = new Clutter.Clone({source : Main.deskletContainer.actor});
         background._blurCinnamonGroup.insert_child_below(deskletClone, background._blurCinnamonDimmer);
         background._blurCinnamonDeskletClone = deskletClone;
      }
      if (owner instanceof Meta.Window) {
         background._blurCinnamonMetaWindowOwner = owner;
      } else {
         background._blurCinnamonMetaWindowOwner = null;
      }
      background._blurCinnamonDesktopOnly = desktopOnly;
      cloneWindowsForBackgroundNow(background, background._blurCinnamonDesktopOnly);
      this._signalManager.connect(background, "notify::mapped", () => this._onBackgroundMapped(background));
      debugMsg( `Added a Dynamic background, currently have ${this._backgrounds.length} backgrounds, current clone count: ${cloneCount}` );
   }

   removeBackground(background) {
      let idx = this._backgrounds.indexOf(background);
      if (idx === -1) {
         return;
      }
      this._signalManager.disconnect( "notify::mapped", background );
      cancelWindowCloneUpdate(background);
      if (background._blurCinnamonRecloneId) {
         Mainloop.source_remove(background._blurCinnamonRecloneId);
         background._blurCinnamonRecloneId = 0;
      }
      destroyAllWindowsClones(background);
      delete background._blurCinnamonWinClones;
      if (background._blurCinnamonDeskletClone) {
         background._blurCinnamonGroup.remove_child(background._blurCinnamonDeskletClone);
         background._blurCinnamonDeskletClone.destroy();
         delete background._blurCinnamonDeskletClone;
      }
      delete background._blurCinnamonMetaWindowOwner;
      delete background._blurCinnamonDesktopOnly;
      this._backgrounds.splice(idx, 1);
      debugMsg( `Removed background for "${background}"/"${background._blurCinnamonName}", group children = ${background._blurCinnamonGroup.get_n_children()}` );
      debugMsg( `Removed a Dynamic background, currently have ${this._backgrounds.length} backgrounds, current clone count: ${cloneCount}` );
   }

   refreshBackground(background, clearFirst = false) {
       if (!background)
           return;
       let idx = this._backgrounds.indexOf(background);
       if (idx === -1)
           return;
       if (clearFirst && background._blurCinnamonWinClones) {
           destroyAllWindowsClones(background);
       }
       cloneWindowsForBackground(
           background,
           background._blurCinnamonDesktopOnly
       );
   }

   isDynamicEffectActive(background) {
      let idx = this._backgrounds.indexOf(background);
      return (idx!==-1);
   }

   raiseDeskletBackground(background) {
      debugMsg( "Raising desklet background" );
      // Hide the desklet container from all backgrounds to avoid an endless loop while painting
      // The desklets are not under any backgrounds anymore since it's been raised to the top
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonDeskletClone) {
            background._blurCinnamonDeskletClone.hide();
         }
      });
      background._blurCinnamonDesktopOnly = false;
      cloneWindowsForBackgroundNow(background, false);
   }

   lowerDeskletBackground(background) {
      debugMsg( "Lowering desklet background" );
      // Show the desklet containter for all backgrounds since the desklets are now lowered again
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonDeskletClone) {
            background._blurCinnamonDeskletClone.show();
         }
      });
      background._blurCinnamonDesktopOnly = true;
      // We need to immediately remove clones of window for the desklet background to avoid SOF during painting
      cloneWindowsForBackgroundNow(background, background._blurCinnamonDesktopOnly);
   }

   _onBackgroundMapped(background) {
      let owner = background._blurCinnamonMetaWindowOwner;
      if (owner) {
         let compositor = owner.get_compositor_private();
         if (compositor && !compositor.visible) {
            // The background is for an application window and that window is not visible,
            // therefore this map/unmap is for some clone (i.e a Windowlist Thubmnail, Alt-Tab etc.).
            return;
         }
      }
      debugMsg( `Background ${(background.mapped)?"mapped":"unmapped"} for ${background._blurCinnamonName}` );
      if (background.mapped === true) {
         cloneWindowsForBackgroundNow(background, background._blurCinnamonDesktopOnly);
      } else {
         // An unmapped background can still be visible when a clone is shows (i.e Alt-Tab)
         destroyAllWindowsClones(background);
      }
   }

   // Globally setup window listeners, add listeners that are required, remove listeners that are no longer needed
   _setupWindowListeners() {
      let windows = global.get_window_actors();
      windows.forEach( (window) => {
         let metaWindow = window.get_meta_window();
         let compositor = metaWindow.get_compositor_private();
         if (!metaWindow._blurCinnamonVisibleEventId)
            metaWindow._blurCinnamonVisibleEventId = compositor.connect("notify::visible", () => this._visibilityChanged(metaWindow) );
         if (compositor.visible && metaWindow.get_window_type() !== Meta.WindowType.DESKTOP)
         {
            if (!metaWindow._blurCinnamonAllocEventID)
               metaWindow._blurCinnamonAllocEventID = compositor.connect("notify::allocation", () => this._allocationChanged(metaWindow) );
         } else if(metaWindow) {
            if (metaWindow._blurCinnamonAllocEventID) {
               compositor.disconnect(metaWindow._blurCinnamonAllocEventID);
               delete metaWindow._blurCinnamonAllocEventID;
            }
         }
      });
   }

   _visibilityChanged(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      if (compositor.visible) {
         debugMsg( `Window "${metaWindow.get_title()}" is visible!` );
         this._onWindowAppeared(metaWindow);
      }else {
         debugMsg( `Window "${metaWindow.get_title()}" is NOT visible!` );
         this._onWindowDisappeared(metaWindow);
         if (compositor && compositor._blurCinnamonDataWindow) {
            debugMsg( "Application window has been made invisible" );
            destroyAllWindowsClones(compositor._blurCinnamonDataWindow.background);
         }
      }
   }

   _onWindowAppeared(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      if (!compositor)
         return;
      if (!metaWindow._blurCinnamonAllocEventID)
         metaWindow._blurCinnamonAllocEventID = compositor.connect("notify::allocation", () => this._allocationChanged(metaWindow) );
      if (!metaWindow._blurCinnamonVisibleEventId) {
         metaWindow._blurCinnamonVisibleEventId = compositor.connect("notify::visible", () => this._visibilityChanged(metaWindow) );
      }

      debugMsg( `Checking if clones are needed for appeared window: "${metaWindow.get_title()}"` );
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonName === "OsdWindow") {
            cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
            return;
         }
         if (!background._blurCinnamonMetaWindowOwner || metaWindow.get_window_type() === Meta.WindowType.DESKTOP || isAbove(background._blurCinnamonMetaWindowOwner, metaWindow)) {
            let [blurX, blurY, blurWidth, blurHeight] = getBackgroundClip(background);
            let blurX2 = blurX + blurWidth;
            let blurY2 = blurY + blurHeight;
            const rect = getWindowCloneRect(metaWindow, background);
            if (rect && rectOverlap(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height, blurX, blurY, blurX2, blurY2))
            {
               createWindowClone(metaWindow, background, background._blurCinnamonDesktopOnly)
            }
         }
      });
   }

   _onWindowDisappeared(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      if (compositor && metaWindow._blurCinnamonAllocEventID) {
         compositor.disconnect(metaWindow._blurCinnamonAllocEventID);
         delete metaWindow._blurCinnamonAllocEventID;
      }
      // Remove windowClones for this window from each background
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonName === "OsdWindow") {
            cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
            return;
         }
         if (background._blurCinnamonWinClones) {
            destroyClones(background, (clone) => clone._metaWindow === metaWindow);
         }
      });
   }

   _onFocusChanged() {
      let window = global.display.get_focus_window();
      if (!window || window.get_window_type() === Meta.WindowType.DESKTOP)
         return;
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonName === "OsdWindow") {
            cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
            return;
         }
         if (background._blurCinnamonMetaWindowOwner === window) {
            // This background is for the new focused window, we might need to create any number of clones for this background
            debugMsg( "Cloning windows because a blurred window has received the focus" );
            cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
         } else {
            if (background._blurCinnamonWinClones) {
               let dimmer = background._blurCinnamonDimmer;
               let group = background._blurCinnamonGroup;
               // We are going backwards through the clones since destroyWindowClone mutates the array
               for (let idx=background._blurCinnamonWinClones.length-1 ; idx >=0  ; idx-- ) {
                  let windowClone = background._blurCinnamonWinClones[idx];
                  if (windowClone._metaWindow === window) {
                     if (background._blurCinnamonMetaWindowOwner) {
                        // This background is for an application window. The focused window is usually raised above it now,
                        // but not above a keep-above owner, so recheck the stacking order instead of deleting the clone
                        debugMsg( "Rechecking window background clones because the clone's window has the focus now" );
                        cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
                     } else {
                        // This background is for a non-window element (i.e panel, notification, tooltip etc), so this clone now needs to be on top of all other clones
                        debugMsg( "Moving clone to top due to focus change" );
                        group.set_child_below_sibling(windowClone, dimmer);
                        restackEffectClone(windowClone);
                     }
                     // There can only be one clone of a window in any given background, so we can break once we find a clone of the focused window
                     break;
                  }
               }
            }
         }
      });
   }

   _updateCurrentWorkspace() {
       let currentWs = global.workspace_manager.get_active_workspace_index();
       if (currentWs === this._activeWorkspaceIdx)
           return;
       let previousWs = this._activeWorkspaceIdx;
       this._activeWorkspaceIdx = currentWs;
       debugMsg(`Workspace changed from ${previousWs} to ${currentWs}`);

       // Recompose visible actors before painting, including both sides of
       // a workspace animation. Logical workspace membership is not visibility.
       this._backgrounds.forEach(background => {
           if (background._blurCinnamonName === "OsdWindow") {
               this.refreshBackground(background);
           }
       });
   }

   // The metaWindow has moved, so we need to move it's clones.
   // Also we check if we need to add or remove clones based on
   // the window overlap state of the new size/location of a window
   _allocationChanged(metaWindow) {
      this._backgrounds.forEach( (background) => {
         if (background._blurCinnamonName === "OsdWindow") {
            cloneWindowsForBackground(background, background._blurCinnamonDesktopOnly);
            return;
         }
         const rect = getWindowCloneRect(metaWindow, background);
         let [blurX, blurY, blurWidth, blurHeight] = getBackgroundClip(background);
         let blurX2 = blurX + blurWidth;
         let blurY2 = blurY + blurHeight;
         let overlap = rect && rectOverlap(rect.x, rect.y, rect.x+rect.width, rect.y+rect.height, blurX, blurY, blurX+blurWidth, blurY+blurHeight);
         // Runs on every frame of any window move: skip the stacking check (a native sort) when there's nothing to do
         if (!overlap && !background._blurCinnamonWinClones.some( (clone) => clone._metaWindow === metaWindow ))
            return;
         let underOwner = (!background._blurCinnamonMetaWindowOwner || metaWindow.get_window_type() === Meta.WindowType.DESKTOP || isAbove(background._blurCinnamonMetaWindowOwner, metaWindow));
         let found = false;
         // We are going backwards through the clones since destroyWindowClone mutates the array
         for (let idx=background._blurCinnamonWinClones.length-1 ; idx >= 0 ; idx-- ) {
            let windowClone = background._blurCinnamonWinClones[idx];
            if (windowClone._metaWindow === metaWindow) {
               found = true;
               if (!overlap || !underOwner) {
                  debugMsg( `Removing unneeded clone` );
                  destroyWindowClone(windowClone, background);
                  break;
               } else {
                  updateWindowCloneGeometry(windowClone, background, rect);
               }
            }
         }
         if (!found && overlap && underOwner) {
            debugMsg( `Adding clone on allocation event` );
            createWindowClone(metaWindow, background, background._blurCinnamonDesktopOnly);
         }
      });
   }

   destroy() {
      this._signalManager.disconnectAllSignals();
      stopArtifactMitigationGuard();
      for (const background of [...this._backgrounds])
          this.removeBackground(background);
      let windows = global.get_window_actors();
      windows.forEach( (window) => {
         let metaWindow = window.get_meta_window();
         if (metaWindow._blurCinnamonAllocEventID) {
            metaWindow.get_compositor_private().disconnect(metaWindow._blurCinnamonAllocEventID);
            delete metaWindow._blurCinnamonAllocEventID;
         }
         if (metaWindow._blurCinnamonVisibleEventId) {
            metaWindow.get_compositor_private().disconnect(metaWindow._blurCinnamonVisibleEventId);
            delete metaWindow._blurCinnamonVisibleEventId;
         }
      });
   }
}

// ---------------------------------------------------------------------------------------------
// Wayland wallpaper source for the static blur types
//
// On X11 the static (non-Dynamic) blur types get the wallpaper from a Meta.X11BackgroundActor,
// which paints the root window's background pixmap that csd-background draws into. Wayland has no
// root window: csd-background draws the wallpaper into its own DESKTOP-type window instead
// (wm_class "Csd-background", bottom of the stack, with Nemo-desktop's icon window just above it).
// So on Wayland every non-Transparent background gets a Clutter.Clone of that window at the bottom
// of its _blurCinnamonGroup, standing in for the X11BackgroundActor. Only csd-background is cloned,
// not every DESKTOP window, so desktop icons don't show through a static blur (same as on X11).
//
// Dynamic backgrounds get the same clone, and CloneManager skips csd-background for any background
// that has one (see hasStaticWallpaper()), so the wallpaper is never in a group twice and a
// static <-> dynamic switch doesn't need any special handling.
//
// Signal handlers on window actors / backgrounds use the signal's own emitter argument rather than
// closing over the actor, so no handler holds a JS reference back to the object it's connected to.
// ---------------------------------------------------------------------------------------------
const WALLPAPER_WM_CLASS = "Csd-background";

function isWallpaperWindow(metaWindow) {
   return !!metaWindow && metaWindow.get_window_type() === Meta.WindowType.DESKTOP && metaWindow.get_wm_class() === WALLPAPER_WM_CLASS;
}

// True when background carries WallpaperTracker clones (Wayland, non-Transparent)
function hasStaticWallpaper(background) {
   return !!background._blurCinnamonWallpaperClones;
}

// Give background a wallpaper clone (Wayland only). Safe to call repeatedly.
function addStaticWallpaper(background) {
   if (!Meta.is_wayland_compositor())
      return;
   if (!wallpaperTracker)
      wallpaperTracker = new WallpaperTracker();
   wallpaperTracker.addBackground(background);
}

// Remove background's wallpaper clone, if any. Safe to call for any background, on X11 too.
function removeStaticWallpaper(background) {
   if (!wallpaperTracker)
      return;
   wallpaperTracker.removeBackground(background);
   if (wallpaperTracker.getBackgroundCount() === 0) {
      wallpaperTracker.destroy();
      wallpaperTracker = null;
   }
}

class WallpaperTracker {

   constructor() {
      this._backgrounds = [];
      this._windows = [];   // csd-background MetaWindows being cloned (one, or possibly one per monitor)
      // Wayland clients may not have their app_id (wm_class) yet when the window is created, so
      // pick csd-background up when it maps instead. A restarted csd-background is caught the same way.
      this._mapId = global.window_manager.connect("map", (wm, actor) => this._onWindowMapped(actor));
      this._scanWindows();
   }

   getBackgroundCount() {
      return this._backgrounds.length;
   }

   addBackground(background) {
      if (this._backgrounds.indexOf(background) !== -1)
         return;
      background._blurCinnamonWallpaperClones = [];
      background._blurCinnamonWallpaperDestroyId = background.connect("destroy", (self) => removeStaticWallpaper(self));
      this._backgrounds.push(background);
      if (this._windows.length === 0)
         this._scanWindows();
      this._windows.forEach( (metaWindow) => this._addClone(background, metaWindow) );
      // If this background was already dynamic, drop CloneManager's own csd-background clone
      if (background._blurCinnamonWinClones)
         destroyClones(background, (clone) => isWallpaperWindow(clone._metaWindow));
      debugMsg( `Added wallpaper clone(s) to background "${background._blurCinnamonName}", ${this._backgrounds.length} wallpaper backgrounds` );
   }

   removeBackground(background) {
      let idx = this._backgrounds.indexOf(background);
      if (idx === -1)
         return;
      this._backgrounds.splice(idx, 1);
      background._blurCinnamonWallpaperClones.forEach( (clone) => this._destroyClone(clone) );
      delete background._blurCinnamonWallpaperClones;
      background.disconnect(background._blurCinnamonWallpaperDestroyId);
      delete background._blurCinnamonWallpaperDestroyId;
   }

   _scanWindows() {
      global.get_window_actors().forEach( (actor) => this._onWindowMapped(actor) );
   }

   _onWindowMapped(actor) {
      let metaWindow = actor.get_meta_window ? actor.get_meta_window() : null;
      if (!isWallpaperWindow(metaWindow) || this._windows.indexOf(metaWindow) !== -1)
         return;
      let compositor = metaWindow.get_compositor_private();
      if (!compositor)
         return;
      this._windows.push(metaWindow);
      metaWindow._blurCinnamonWallpaperPosId = metaWindow.connect("position-changed", (self) => this._syncClonePosition(self));
      metaWindow._blurCinnamonWallpaperSizeId = metaWindow.connect("size-changed", (self) => this._syncClonePosition(self));
      compositor._blurCinnamonWallpaperDestroyId = compositor.connect("destroy", (self) => this._onWindowActorDestroyed(self));
      this._backgrounds.forEach( (background) => this._addClone(background, metaWindow) );
      debugMsg( `Tracking wallpaper window "${metaWindow.get_wm_class()}"/${metaWindow.get_id()}` );
   }

   _onWindowActorDestroyed(compositor) {
      let idx = this._windows.findIndex( (metaWindow) => metaWindow.get_compositor_private() === compositor );
      if (idx === -1)
         return;
      this._untrackWindow(this._windows[idx]);
   }

   _untrackWindow(metaWindow) {
      let idx = this._windows.indexOf(metaWindow);
      if (idx === -1)
         return;
      this._windows.splice(idx, 1);
      if (metaWindow._blurCinnamonWallpaperPosId) {
         metaWindow.disconnect(metaWindow._blurCinnamonWallpaperPosId);
         metaWindow.disconnect(metaWindow._blurCinnamonWallpaperSizeId);
         delete metaWindow._blurCinnamonWallpaperPosId;
         delete metaWindow._blurCinnamonWallpaperSizeId;
      }
      let compositor = metaWindow.get_compositor_private();
      if (compositor && compositor._blurCinnamonWallpaperDestroyId) {
         compositor.disconnect(compositor._blurCinnamonWallpaperDestroyId);
         delete compositor._blurCinnamonWallpaperDestroyId;
      }
      this._backgrounds.forEach( (background) => {
         let clones = background._blurCinnamonWallpaperClones;
         for (let i = clones.length-1 ; i >= 0 ; i--) {
            if (clones[i]._metaWindow === metaWindow) {
               this._destroyClone(clones[i]);
               clones.splice(i, 1);
            }
         }
      });
   }

   _addClone(background, metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      if (!compositor || !background._blurCinnamonGroup)
         return;
      // Backgrounds sit at the stage origin, so the window's buffer rect is the clone's position
      // in the group - same convention as createWindowClone().
      let loopBackgrounds = findCloneLoop(background, compositor);
      if (loopBackgrounds) {
         refuseCloneLoop(background, metaWindow, loopBackgrounds);
         return;
      }
      let rect = metaWindow.get_buffer_rect();
      let clone = new Clutter.Clone({source: compositor, reactive: false, x: rect.x, y: rect.y});
      clone._metaWindow = metaWindow;
      // Bottom of the group: below any dynamic window clones, the desklet clone and the dimmer
      background._blurCinnamonGroup.insert_child_at_index(clone, 0);
      background._blurCinnamonWallpaperClones.push(clone);
   }

   _destroyClone(clone) {
      let parent = clone.get_parent();
      if (parent)
         parent.remove_child(clone);
      clone.destroy();
   }

   _syncClonePosition(metaWindow) {
      let rect = metaWindow.get_buffer_rect();
      this._backgrounds.forEach( (background) => {
         background._blurCinnamonWallpaperClones.forEach( (clone) => {
            if (clone._metaWindow === metaWindow)
               clone.set_position(rect.x, rect.y);
         });
      });
   }

   destroy() {
      global.window_manager.disconnect(this._mapId);
      this._backgrounds.slice().forEach( (background) => this.removeBackground(background) );
      this._windows.slice().forEach( (metaWindow) => this._untrackWindow(metaWindow) );
   }
}

// ---------------------------------------------------------------------------------------------
// Screen-size tracking for plain Clutter.Actor backgrounds
//
// A Meta.X11BackgroundActor follows the screen size by itself, but the plain Clutter.Actor used on
// Wayland (and for Transparent on X11) is sized once, at creation. ScreenSizeTracker resizes every
// such background when the monitor layout changes; each background's own notify::size handler then
// resizes its group and dimmer. Setting the size (rather than a BindConstraint) keeps the actor's
// preferred size right too, which the viewport's Clutter.Clone of background is allocated from.
// ---------------------------------------------------------------------------------------------
function trackScreenSize(background) {
   if (!screenSizeTracker)
      screenSizeTracker = new ScreenSizeTracker();
   screenSizeTracker.addBackground(background);
}

function untrackScreenSize(background) {
   if (!screenSizeTracker)
      return;
   screenSizeTracker.removeBackground(background);
   if (screenSizeTracker.getBackgroundCount() === 0) {
      screenSizeTracker.destroy();
      screenSizeTracker = null;
   }
}

// Keep background's group and dimmer the same size as background. Uses the signal's own emitter
// argument so the handler holds no JS reference to background (see _createBackgroundAndEffects).
function connectDimmerResize(background) {
   background.connect("notify::size", (self) => {
      if (self._blurCinnamonGroup)
         self._blurCinnamonGroup.set_size(self.width, self.height);
      if (self._blurCinnamonDimmer)
         self._blurCinnamonDimmer.set_size(self.width, self.height);
   });
}

class ScreenSizeTracker {

   constructor() {
      this._backgrounds = [];
      this._monitorsChangedId = Main.layoutManager.connect("monitors-changed", () => this._monitorsChanged());
   }

   getBackgroundCount() {
      return this._backgrounds.length;
   }

   addBackground(background) {
      if (this._backgrounds.indexOf(background) !== -1)
         return;
      this._backgrounds.push(background);
      background._blurCinnamonScreenSizeDestroyId = background.connect("destroy", (self) => untrackScreenSize(self));
      background.set_size(global.screen_width, global.screen_height);
   }

   removeBackground(background) {
      let idx = this._backgrounds.indexOf(background);
      if (idx === -1)
         return;
      this._backgrounds.splice(idx, 1);
      background.disconnect(background._blurCinnamonScreenSizeDestroyId);
      delete background._blurCinnamonScreenSizeDestroyId;
   }

   _monitorsChanged() {
      debugMsg( `Resizing ${this._backgrounds.length} plain backgrounds to ${global.screen_width}x${global.screen_height}` );
      this._backgrounds.forEach( (background) => background.set_size(global.screen_width, global.screen_height) );
   }

   destroy() {
      Main.layoutManager.disconnect(this._monitorsChangedId);
      this._backgrounds.slice().forEach( (background) => this.removeBackground(background) );
   }
}

class BlurBase {
   static cornerEffectCache     = [];
   static gaussianEffectCache   = [];
   static liquidGlassEffectCache = [];
   static monteCarloEffectCache = [];
   static dualKawaseEffectCache = [];

   constructor() {
   }

   // Dispose all pooled effects; called once every component has released its effects in disable().
   // Top-level pools go first: the gaussian and dual kawase effects already handed their chained /
   // pyramid sub-effects to their own pools when they were detached, so those are drained after.
   static drainEffectPools() {
      [ BlurBase.cornerEffectCache, BlurBase.gaussianEffectCache, BlurBase.liquidGlassEffectCache,
        BlurBase.monteCarloEffectCache, BlurBase.dualKawaseEffectCache ].forEach( (pool) => EffectPool.drainPool(pool) );
      GaussianBlur.drainPools();
      DualKawaseBlur.drainPools();
   }

   _aquireCornerEffect(radius, top, bottom) {
      if (BlurBase.cornerEffectCache.length > 0) {
         let effect = BlurBase.cornerEffectCache.pop();
         effect.radius = radius;
         effect.corners_top = top;
         effect.corners_bottom = bottom;
         return(effect);
      } else {
         return(new CornerEffect.CornerEffect( metaData.uuid, {radius: radius, corners_top: top, corners_bottom: bottom}));
      }
   }

   _releaseCornerEffect(effect) {
      EffectPool.releaseToPool(BlurBase.cornerEffectCache, effect);
   }

   // Clutter's own effects are not pooled: they are cheap to create, never leaked, and can't be told
   // apart once their actor is destroyed under them (see _noteSetActor() in effect_base.js)
   _aquireSimpleBlurEffect() {
      return(new Clutter.BlurEffect());
   }

   _releaseSimpleBlurEffect(effect) {
   }


   _aquireGaussianEffect(radius) {
      if (BlurBase.gaussianEffectCache.length > 0) {
         let effect = BlurBase.gaussianEffectCache.pop();
         effect.radius = radius;
         return(effect);
      } else {
         return(new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1 , width: 0, height: 0} ));
      }
   }

   _releaseGaussianEffect(effect) {
      EffectPool.releaseToPool(BlurBase.gaussianEffectCache, effect);
   }

   _aquireLiquidGlassEffect(radius) {
      if (BlurBase.liquidGlassEffectCache.length > 0) {
         let effect = BlurBase.liquidGlassEffectCache.pop();
         applyLiquidGlassSettings(effect, radius);
         return(effect);
      } else {
         return(new Refraction.RefractionEffect( getLiquidGlassParams(radius) ));
      }
   }

   _releaseLiquidGlassEffect(effect) {
      // Don't let a viewport's glass rect follow the effect to its next user
      effect.glass_rect = null;
      EffectPool.releaseToPool(BlurBase.liquidGlassEffectCache, effect);
   }

   _aquireMonteCarloEffect(radius) {
      if (BlurBase.monteCarloEffectCache.length > 0) {
         let effect = BlurBase.monteCarloEffectCache.pop();
         effect.radius = radius;
         effect.iterations = settings.montecarloIterations;
         effect.use_base_pixel = settings.montecarloUseBasePixel;
         effect.prefer_closer_pixels = settings.montecarloPerferCloserPixels;
         return(effect);
      } else {
         return(new MonteCarloBlur.MonteCarloBlurEffect( { radius: radius, iterations: settings.montecarloIterations, prefer_closer_pixels: settings.montecarloPerferCloserPixels, use_base_pixel: settings.montecarloUseBasePixel, brightness: 1, width: 0, height: 0 } ));
      }
   }

   _releaseMonteCarloEffect(effect) {
      EffectPool.releaseToPool(BlurBase.monteCarloEffectCache, effect);
   }

   _aquireDualKawaseEffect(radius) {
      if (BlurBase.dualKawaseEffectCache.length > 0) {
         let effect = BlurBase.dualKawaseEffectCache.pop();
         effect.radius = radius;
         return(effect);
      } else {
         return(new DualKawaseBlur.DualFilteringBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } ));
      }
   }

   _releaseDualKawaseEffect(effect) {
      EffectPool.releaseToPool(BlurBase.dualKawaseEffectCache, effect);
   }

   _aquireDesaturateEffect(factor) {
      return(new Clutter.DesaturateEffect({factor: factor}));
   }

   _releaseDesaturateEffect(effect) {
   }

   _releaseBlurEffect(effect) {
      if (effect instanceof GaussianBlur.GaussianBlurEffect) {
         this._releaseGaussianEffect(effect);
      } else if (effect instanceof Refraction.RefractionEffect) {
         this._releaseLiquidGlassEffect(effect);
      } else if (effect instanceof MonteCarloBlur.MonteCarloBlurEffect) {
         this._releaseMonteCarloEffect(effect);
      } else if (effect instanceof DualKawaseBlur.DualFilteringBlurEffect) {
         this._releaseDualKawaseEffect(effect);
      } else if (effect instanceof Clutter.BlurEffect) {
         this._releaseSimpleBlurEffect(effect);
      }
   }

   _getGenericSettings() {
      if (!this._supportsDynamicBlur() && (isDynamicBlurType(settings.blurType)))
         return [settings.opacity, settings.blendColor, staticBlurType(settings.blurType), settings.radius, settings.saturation];
      return [settings.opacity, settings.blendColor, settings.blurType, settings.radius, settings.saturation];
   }

   _supportsDynamicBlur() {
      return false;
   }

   _getUniqueSettings() {
      log( "Error: Blur effect class does not implement _getUniqueSettings()!" );
   }

   _getColor(colorString, opacity) {
      let [ret,color] = Clutter.Color.from_string( colorString );
      if (!ret) { [ret,color] = Clutter.Color.from_string( "rgba(0,0,0,0)" ); }
      color.alpha = Math.round(opacity*2.55);
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

   _isDynamicEffectActive(background) {
      if (cloneManager) {
         return cloneManager.isDynamicEffectActive(background);
      }
      return false;
   }

   _createDynamicEffect(background, owner=null, desktopOnly=false) {
      if (!cloneManager) {
         cloneManager = new CloneManager();
      }
      cloneManager.addBackground(background, owner, desktopOnly);
   }

   _destroyDynamicEffect(background) {
      if (cloneManager) {
         cloneManager.removeBackground(background);
         if (cloneManager.getBackgroundCount() === 0) {
            cloneManager.destroy();
            cloneManager = null;
         }
      }
   }

   _raiseDeskletDynamicBackground(background) {
      if (cloneManager) {
         cloneManager.raiseDeskletBackground(background);
      }
   }

   _lowerDeskletDynamicBackground(background) {
      if (cloneManager) {
         cloneManager.lowerDeskletBackground(background);
      }
   }

   // useViewport: instead of attaching the corner/blur/desaturate effects to background itself,
   // create a small "viewport" actor (an St.Group, clip_to_allocation:true) that shows a
   // Clutter.Clone of background, and attach the effects to *that* instead - background is left
   // with no effects of its own. background._blurCinnamonViewport is set to the viewport (or left
   // undefined/null when useViewport is false), for the caller to pick up.
   //
   // customParent, when given, is a function(background, viewport) that the caller uses to parent
   // both actors itself (e.g. BlurApplications needs specific sibling indices within a window's
   // compositor actor, below the window's own real content) instead of the generic `parent`
   // add_child fallback below. Either way, parenting happens *before* any effects are attached to
   // viewport: viewport is an St.Group/St.Widget, and attaching a ShaderEffect/CornerEffect to one
   // with no path up to the stage yet triggers a "st_widget_get_theme_node ... not in the stage"
   // St-CRITICAL warning. background itself isn't an St.Widget (Meta.X11BackgroundActor/
   // Clutter.Actor), so its effects were always safe to attach before parenting, and still are here
   // when useViewport is false.
   _createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, parent=global.overlay_group, cornerRadius=0, top=true, bottom=true, useViewport=false, customParent=null) {
      let blurEffect;
      let desatEffect;
      let cornerEffect;
      let background;
      let viewport = null;

      // Create the effects
      if (blurType === BlurType.Simple) {
         blurEffect = this._aquireSimpleBlurEffect();
      } else if (blurType === BlurType.Gaussian || blurType === BlurType.DynamicBlur) {
         blurEffect = this._aquireGaussianEffect(radius);
      } else if (blurType === BlurType.MonteCarlo || blurType === BlurType.DynamicMC) {
         blurEffect = this._aquireMonteCarloEffect(radius);
      } else if (blurType === BlurType.DualKawase || blurType === BlurType.DynamicDK) {
         blurEffect = this._aquireDualKawaseEffect(radius);
      } else if (isLiquidGlassBlurType(blurType)) {
         blurEffect = this._aquireLiquidGlassEffect(radius);
      }
      if (saturation < 100)
         desatEffect = this._aquireDesaturateEffect( (100-saturation)/100 );
      // A wrapped viewport always needs a corner effect, even with no rounding (radius 0): the viewport is
      // sized to the *expanded* rect (visible rect + the blur's sampling margin - see _applyBackgroundClip)
      // and its corner effect's clip is what cuts that margin away again. Without one, the viewport would
      // paint its blurred and tinted content over the whole margin, outside the visible bounds.
      if (cornerRadius>0 || useViewport)
         cornerEffect = this._aquireCornerEffect(Math.max(0, cornerRadius), top, bottom);

      // Create the background actor where the effects will be applied
      if (!Meta.is_wayland_compositor() && blurType !== BlurType.Transparent) {
         background = Meta.X11BackgroundActor.new_for_display(global.display);
      } else {
         background = new Clutter.Actor({width: global.stage.width, height: global.stage.height});
         trackScreenSize(background);
      }

      // Add a dimmer child to the background so we can change the colorization and dimming of the background
      let dimmerColor = this._getColor( blendColor, opacity );
      let dimmer = new Clutter.Actor({width: background.width, height: background.height, background_color: dimmerColor});
      let group = new St.Group({clip_to_allocation: true});
      group.set_size( background.width, background.height);

      group.add_child(dimmer);
      background.add_child(group);

      // If the screen resolution changes we need to change the dimmer actor size to match.
      // IMPORTANT: use the callback's own emitted-object argument (`self`) rather than closing
      // over the outer `background` variable. Closing over `background` here would make this
      // closure - which is stored natively as background's own signal handler - hold a strong
      // JS reference back to background itself. That's a self-referential cycle spanning the
      // JS/native boundary (background -> native GClosure -> JS closure -> background), and
      // while GObject's dispose() disconnects an object's own signal handlers (which should
      // normally break this), relying on that timing turned out to leave this and everything
      // reachable through it (viewport, blur effect, and its own listeners) alive far longer
      // than expected. Using the signal's own argument avoids creating the cycle in the first
      // place: group/dimmer are still captured, but they're background's own children, not
      // background itself, so this is no longer self-referential.
      background.connect("notify::size", (self) => {
         group.set_width(self.width);
         group.set_height(self.height);
         dimmer.set_width(self.width);
         dimmer.set_height(self.height);
      });
      background._blurCinnamonDimmer = dimmer;
      background._blurCinnamonGroup = group;

      // Wayland has no X11BackgroundActor, so clone csd-background's wallpaper window instead
      if (Meta.is_wayland_compositor() && blurType !== BlurType.Transparent)
         addStaticWallpaper(background);

      let effectTarget = background;
      if (useViewport) {
         viewport = new St.Group({clip_to_allocation: true});
         let sceneClone = new Clutter.Clone({source: background, reactive: false});
         viewport.add_child(sceneClone);
         viewport._blurCinnamonSceneClone = sceneClone;
         effectTarget = viewport;
      }

      // Parent before attaching effects - see the note above the function.
      if (customParent) {
         customParent(background, viewport);
      } else if (parent) {
         parent.add_child(background);
         if (viewport) parent.add_child(viewport);
      }
      this.parent = parent;

      // Attach the effects. The cornerEffect needs to be first or else the blur effect will spill
      // over the corner effect clip bounds. All three always go on the same actor (effectTarget) -
      // background when unwrapped, viewport when useViewport.
      if (cornerEffect)
         effectTarget.add_effect_with_name( CORNER_EFFECT_NAME, cornerEffect );
      if (desatEffect)
         effectTarget.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect );
      if (blurEffect)
         effectTarget.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      this._syncLiquidGlassCornerRadius(effectTarget);

      // When wrapped, viewport paints the blurred result and background is only kept mapped and shown as
      // the source of viewport's Clutter.Clone. background's clip is now the *expanded* viewport rect
      // (the visible rect plus the blur's sampling margin - see _applyBackgroundClip), so painting it
      // directly would show a raw, un-blurred (and tinted) ring around the visible rect. A Clutter.Clone
      // paints its source at the clone's own opacity, ignoring the source's, so making background itself
      // fully transparent hides that direct paint without changing what the clone samples. (This replaces
      // the mirrored CornerEffect background used to carry to hide its own square corners: none of
      // background is visible directly any more.)
      if (viewport)
         background.set_opacity(0);

      background.hide();
      if (viewport) viewport.hide();
      background._blurCinnamonViewport = viewport;

      return background;
   }

   _getBlurEffect(background) {
      return background.get_effect(BLUR_EFFECT_NAME);
   }

   // The Liquid Glass effect draws its own rounded shape (used for the refraction, rim lighting and to
   // clip its output), so its corner radius must match the corner effect of the same actor. It only
   // has a single radius for all 4 corners, so if just the top or just the bottom corners are rounded
   // then use 0 and let the corner effect do the rounding. Does nothing for other blur effects.
   _syncLiquidGlassCornerRadius(actor) {
      let blurEffect = this._getBlurEffect(actor);
      if (blurEffect instanceof Refraction.RefractionEffect) {
         let cornerEffect = this._getCornerEffect(actor);
         blurEffect.corner_radius = (cornerEffect && cornerEffect.corners_top && cornerEffect.corners_bottom) ? cornerEffect.radius : 0;
         // A Liquid Glass effect newly added to a viewport picks up the last visible rect
         if (actor._blurCinnamonGlassRect)
            blurEffect.glass_rect = actor._blurCinnamonGlassRect;
      }
   }

   // Liquid Glass draws its glass shape (edges, rim reflections, corners) over the actor's clip, or the
   // whole actor when it has none. A viewport has no clip and is sized to the *expanded* rect, so the glass
   // edge ended up out in the sampling margin, where the viewport's corner effect then cut it away - on every
   // side except where getExpandedRect() clamps the margin to the screen edge (e.g. a panel's outer edge).
   // rect is the visible rect in viewport-local coordinates, the same rect the corner effect clips to.
   _setLiquidGlassRect(viewport, rect) {
      viewport._blurCinnamonGlassRect = rect;
      let blurEffect = this._getBlurEffect(viewport);
      if (blurEffect instanceof Refraction.RefractionEffect)
         blurEffect.glass_rect = rect;
   }

   _getDesatEffect(background) {
      return background.get_effect(DESAT_EFFECT_NAME);
   }

   _getCornerEffect(background) {
      return background.get_effect(CORNER_EFFECT_NAME);
   }

   _getDimmer(background) {
      return background._blurCinnamonDimmer;
   }

   _updateEffects(background, opacity, blendColor, blurType, radius, saturation) {
      // Setup the blur effect properly
      let curEffect = background.get_effect(BLUR_EFFECT_NAME);
      let cornerEffect = background.get_effect(CORNER_EFFECT_NAME);
      let desatEffect = background.get_effect(DESAT_EFFECT_NAME);
      let dynamicEffectActive = this._isDynamicEffectActive(background);
      // Remove any dynamic blurring if enabled
      if (dynamicEffectActive) {
         this._destroyDynamicEffect(background);
      }
      // Create the background actor and attach the corner & desat effects
      if (Meta.is_wayland_compositor()) {
         // No X11BackgroundActor on Wayland: background stays a plain Clutter.Actor and only the
         // csd-background wallpaper clone is added/removed (see WallpaperTracker)
         if (blurType !== BlurType.Transparent)
            addStaticWallpaper(background);
         else
            removeStaticWallpaper(background);
      } else if (blurType !== BlurType.Transparent && !(background instanceof Meta.X11BackgroundActor)) {
         let dimmer = background._blurCinnamonDimmer;
         background._blurCinnamonGroup.remove_child(background._blurCinnamonDimmer);
         this.parent.remove_child(background);
         if (cornerEffect) { background.remove_effect(cornerEffect); }
         if (desatEffect) { background.remove_effect(desatEffect); }
         background.destroy();
         background = Meta.X11BackgroundActor.new_for_display(global.display);
         let group = new St.Group({clip_to_allocation: true});
         group.set_size( background.width, background.height);
         group.add_child(dimmer);
         background.add_child(group);
         background._blurCinnamonGroup = group
         background._blurCinnamonDimmer = dimmer;
         connectDimmerResize(background);
         if (cornerEffect) { background.add_effect_with_name( CORNER_EFFECT_NAME, cornerEffect ); }
         if (desatEffect) { background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect ); }
         this.parent.add_child(background);
      }
      if (blurType === BlurType.None && curEffect) {
         background.remove_effect(curEffect);
         this._releaseBlurEffect(curEffect);
      } else if (blurType === BlurType.Simple && !(curEffect instanceof Clutter.BlurEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         let blurEffect =  this._aquireSimpleBlurEffect();
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      } else if ((blurType === BlurType.Gaussian || blurType === BlurType.DynamicBlur) && !(curEffect instanceof GaussianBlur.GaussianBlurEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         let blurEffect = this._aquireGaussianEffect(radius);
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      } else if ((blurType === BlurType.MonteCarlo || blurType === BlurType.DynamicMC) && !(curEffect instanceof MonteCarloBlur.MonteCarloBlurEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         let blurEffect = this._aquireMonteCarloEffect(radius);
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      } else if ((blurType === BlurType.DualKawase || blurType === BlurType.DynamicDK) && !(curEffect instanceof DualKawaseBlur.DualFilteringBlurEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         let blurEffect = this._aquireDualKawaseEffect(radius);
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      } else if (isLiquidGlassBlurType(blurType) && !(curEffect instanceof Refraction.RefractionEffect)) {
         if (curEffect) {
            background.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         let blurEffect = this._aquireLiquidGlassEffect(radius);
         background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
      } else if (blurType === BlurType.Transparent && Meta.is_wayland_compositor() && curEffect) {
         // Wayland keeps the same actor when switching to Transparent, so just drop the blur
         background.remove_effect(curEffect);
         this._releaseBlurEffect(curEffect);
      } else if (blurType === BlurType.Transparent && background instanceof Meta.X11BackgroundActor) {
         if (curEffect) {
            background.remove_effect(curEffect);
         }
         let dimmer = background._blurCinnamonDimmer;
         background._blurCinnamonGroup.remove_child(background._blurCinnamonDimmer);
         this.parent.remove_child(background);
         if (cornerEffect) { background.remove_effect(cornerEffect); }
         if (desatEffect) { background.remove_effect(desatEffect); }
         background .destroy();
         let stageWidth = global.stage.width;
         let stageHeight = global.stage.height;
         background = new Clutter.Actor({width: stageWidth, height: stageHeight});
         // Same group/dimmer layout as _createBackgroundAndEffects, so switching back to a blurred
         // type (which removes the dimmer from _blurCinnamonGroup) works
         let group = new St.Group({clip_to_allocation: true});
         group.set_size(stageWidth, stageHeight);
         group.add_child(dimmer);
         background.add_child(group);
         background._blurCinnamonGroup = group;
         background._blurCinnamonDimmer = dimmer;
         connectDimmerResize(background);
         trackScreenSize(background);
         if (cornerEffect) { background.add_effect_with_name( CORNER_EFFECT_NAME, cornerEffect ); }
         if (desatEffect) { background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect ); }
         this.parent.add_actor(background);
      }
      curEffect = this._getBlurEffect(background);
      // Adjust the blur effects
      if ((curEffect instanceof GaussianBlur.GaussianBlurEffect || curEffect instanceof MonteCarloBlur.MonteCarloBlurEffect || curEffect instanceof DualKawaseBlur.DualFilteringBlurEffect) && curEffect.radius != radius) {
         curEffect.radius = radius;
      }
      // If Monte Carlo, update it's settings
      if (curEffect instanceof MonteCarloBlur.MonteCarloBlurEffect) {
         curEffect.iterations = settings.montecarloIterations;
         curEffect.use_base_pixel = settings.montecarloUseBasePixel;
         curEffect.prefer_closer_pixels = settings.montecarloPerferCloserPixels;
      }
      // If Liquid Glass, update it's settings
      if (curEffect instanceof Refraction.RefractionEffect) {
         applyLiquidGlassSettings(curEffect, radius);
      }
      this._syncLiquidGlassCornerRadius(background);
      // Setup/Adjust the desaturation effect
      curEffect = background.get_effect(DESAT_EFFECT_NAME);
      if (curEffect && saturation === 100) {
         background.remove_effect(curEffect);
      } else if (curEffect && curEffect.factor !== (100-saturation)/100) {
         curEffect.set_factor((100-saturation)/100);
      } else if (!curEffect && saturation<100) {
         let desatEffect = this._aquireDesaturateEffect( (100-saturation)/100 );
         background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect );
      }
      // Setup the colorization/dimming
      let dimmerColor = this._getColor( blendColor, opacity );
      background._blurCinnamonDimmer.set_background_color(dimmerColor);
      return(background);
   }

   _updateCornerRadius(background, radius, top=true, bottom=true) {
      let ce = background.get_effect(CORNER_EFFECT_NAME);
      if (ce) {
         ce.radius = radius;
      } else {
         if (radius>0) {
            // Create the effect
            let cornerEffect = this._aquireCornerEffect(radius, top, bottom);
            // Remove all the other effects so we can add them back in the correct order (corner effect must be first)
            let desatEffect = this._getDesatEffect(background);
            if (desatEffect) background.remove_effect(desatEffect);
            let blurEffect = this._getBlurEffect(background);
            if (blurEffect) background.remove_effect(blurEffect);
            background.add_effect_with_name( CORNER_EFFECT_NAME, cornerEffect );
            if (desatEffect) background.add_effect_with_name( DESAT_EFFECT_NAME, desatEffect );
            if (blurEffect) background.add_effect_with_name( BLUR_EFFECT_NAME, blurEffect );
         }
      }
      this._syncLiquidGlassCornerRadius(background);
   }

   // Generic equivalent of BlurBase._updateEffects(), but for a background that's been wrapped in a
   // viewport (see _createBackgroundAndEffects's useViewport): the blur/corner/desaturate effects
   // live on viewport, not background, so _updateEffects() itself must never be called on a wrapped
   // background directly - it looks up BLUR_EFFECT_NAME etc. on the background actor it's given,
   // and finding none there (they're all on viewport instead) would make it create a *second*,
   // duplicate set of effects on background alongside viewport's real ones.
   _updateViewportEffects(background, viewport, opacity, blendColor, blurType, radius, saturation) {
      let curEffect = this._getBlurEffect(viewport);
      if (blurType === BlurType.DynamicBlur && !(curEffect instanceof GaussianBlur.GaussianBlurEffect)) {
         if (curEffect) {
            viewport.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         viewport.add_effect_with_name( BLUR_EFFECT_NAME, this._aquireGaussianEffect(radius) );
      } else if (blurType === BlurType.DynamicMC && !(curEffect instanceof MonteCarloBlur.MonteCarloBlurEffect)) {
         if (curEffect) {
            viewport.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         viewport.add_effect_with_name( BLUR_EFFECT_NAME, this._aquireMonteCarloEffect(radius) );
      } else if (blurType === BlurType.DynamicDK && !(curEffect instanceof DualKawaseBlur.DualFilteringBlurEffect)) {
         if (curEffect) {
            viewport.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         viewport.add_effect_with_name( BLUR_EFFECT_NAME, this._aquireDualKawaseEffect(radius) );
      } else if (blurType === BlurType.DynamicLG && !(curEffect instanceof Refraction.RefractionEffect)) {
         if (curEffect) {
            viewport.remove_effect(curEffect);
            this._releaseBlurEffect(curEffect);
         }
         viewport.add_effect_with_name( BLUR_EFFECT_NAME, this._aquireLiquidGlassEffect(radius) );
      }
      curEffect = this._getBlurEffect(viewport);
      if ((curEffect instanceof GaussianBlur.GaussianBlurEffect || curEffect instanceof MonteCarloBlur.MonteCarloBlurEffect || curEffect instanceof DualKawaseBlur.DualFilteringBlurEffect) && curEffect.radius != radius) {
         curEffect.radius = radius;
      }
      if (curEffect instanceof MonteCarloBlur.MonteCarloBlurEffect) {
         curEffect.iterations = settings.montecarloIterations;
         curEffect.use_base_pixel = settings.montecarloUseBasePixel;
         curEffect.prefer_closer_pixels = settings.montecarloPerferCloserPixels;
      }
      if (curEffect instanceof Refraction.RefractionEffect) {
         applyLiquidGlassSettings(curEffect, radius);
      }
      this._syncLiquidGlassCornerRadius(viewport);

      let desatEffect = this._getDesatEffect(viewport);
      if (desatEffect && saturation === 100) {
         viewport.remove_effect(desatEffect);
      } else if (desatEffect && desatEffect.factor !== (100-saturation)/100) {
         desatEffect.set_factor((100-saturation)/100);
      } else if (!desatEffect && saturation < 100) {
         viewport.add_effect_with_name( DESAT_EFFECT_NAME, this._aquireDesaturateEffect( (100-saturation)/100 ) );
      }

      let dimmerColor = this._getColor( blendColor, opacity );
      background._blurCinnamonDimmer.set_background_color(dimmerColor);

      // The blur's sampling reach - and so viewport's margin - depends on the blur type and radius, so
      // re-derive the expanded rect now (consumers of _applyBackgroundClip only; windows do the same
      // from BlurApplications.updateEffects()).
      if (viewport._blurCinnamonVisibleRect)
         this._applyBackgroundClip(background, viewport, ...viewport._blurCinnamonVisibleRect);
   }

   // Refreshes corner_radius/top/bottom on whichever actor carries the corner effect for this
   // background: viewport when wrapped (see _createBackgroundAndEffects's useViewport), background
   // otherwise. Safe to call unconditionally; _updateCornerRadius already handles a corner_radius of 0
   // with no corner effect yet.
   _updateViewportCornerRadius(background, viewport, corner_radius, top, bottom) {
      let effectsActor = viewport || background;
      let cornerEffect = this._getCornerEffect(effectsActor);
      if (cornerEffect) {
         cornerEffect.corners_top = top;
         cornerEffect.corners_bottom = bottom;
      }
      this._updateCornerRadius(effectsActor, corner_radius, top, bottom);
   }

   // Generic viewport-aware clip/position helper for every consumer besides windows (which use
   // BlurApplications' own _setClip, since a window's background/viewport live inside that
   // window's own compositor actor and need position offsets this generic version doesn't). Every
   // other consumer parents background (and viewport, when used) directly into global.overlay_group
   // via _createBackgroundAndEffects's default `parent` fallback, so both actors already live in
   // plain global/stage coordinates - no compositor-relative translation is needed here the way
   // BlurApplications._setClip needs the compositor's stage position.
   //
   // x/y/width/height is the target visible rect, in that same global/stage coordinate space.
   // When viewport is null (background isn't wrapped - see _createBackgroundAndEffects's useViewport)
   // background alone is clipped to that rect, and masked by its own corner effect if it has one.
   // When viewport is non-null, viewport and background are instead sized/clipped to the *expanded*
   // rect: the visible rect grown by the blur's sampling margin (see getViewportMargin()), so the blur
   // always has real, correctly cloned content to sample right up to the visible edge. viewport's scene
   // clone is offset to crop the matching sub-region of background, and viewport's own corner effect
   // is clipped to the visible rect, which also cuts the margin away again (the corner shader makes
   // everything outside its clip transparent).
   _applyBackgroundClip(background, viewport, x, y, width, height) {
      if (![x, y, width, height].every(Number.isFinite))
        x = y = width = height = 0;

      width = Math.max(0, width);
      height = Math.max(0, height);
      if (viewport) {
         // Remember the visible rect so the margin can be re-derived if the blur radius/type changes
         viewport._blurCinnamonVisibleRect = [x, y, width, height];
         let margin = (width > 0 && height > 0) ? getViewportMargin(viewport) : 0;
         let [ex, ey, ew, eh] = getExpandedRect(x, y, width, height, margin);
         background.set_clip(ex, ey, ew, eh);
         viewport.set_position(ex, ey);
         viewport.set_size(ew, eh);
         viewport._blurCinnamonSceneClone.set_position(-ex, -ey);
         let cornerEffect = this._getCornerEffect(viewport);
         if (cornerEffect) {
            // Local to the viewport and exactly the visible rect (corner.glsl pads its own mapping by
            // 3px, so no inset is needed - same as BlurApplications._setClip).
            cornerEffect.set_viewport_clip([x - ex, y - ey, width, height]);
         }
         this._setLiquidGlassRect(viewport, [x-ex, y-ey, width, height]);
      } else {
         background.set_clip(x, y, width, height);
         let backgroundCornerEffect = this._getCornerEffect(background);
         if (backgroundCornerEffect) {
            backgroundCornerEffect.clip = [x+2, y+2, Math.max(0, width-3), Math.max(0, height-3)];
         }
      }
      if (cloneManager)
         cloneManager.backgroundClipChanged(background);
   }

   _needsBackgroundRebuild(background, blurType, wantsViewport) {
      const changesBackgroundKind = !Meta.is_wayland_compositor() &&
         ((background instanceof Meta.X11BackgroundActor) !== (blurType !== BlurType.Transparent));
      return !!background._blurCinnamonViewport !== wantsViewport || changesBackgroundKind;
   }

   // Generic viewport teardown helper for every consumer besides windows (BlurApplications does
   // this itself in _unblurWindow, with its own compositor-child removal). Callers must call this
   // (which internally strips both actors' effects first - see the reentrancy-race comment on
   // destroy() below) instead of just background.destroy()/viewport.destroy() directly, and must
   // call it *before* removing/destroying background so the effects-strip can still read
   // background._blurCinnamonViewport.
   //
   // Several subclasses (BlurOSD, BlurPanels, BlurDesklets, ...) define their own no-arg destroy()
   // for whole-manager teardown, which would silently shadow BlurBase.prototype.destroy(background)
   // if this called `this.destroy(background)` - so it calls the base class's version explicitly
   // (exactly what a subclass's own `super.destroy(background)` does) rather than through `this`.
   _destroyBackgroundAndViewport(background, parent=null) {
      let viewport = background._blurCinnamonViewport;
      BlurBase.prototype.destroy.call(this, background);
      if (viewport) {
         let viewportParent = parent || viewport.get_parent();
         if (viewportParent) viewportParent.remove_child(viewport);
         viewport.destroy();
      }
      let backgroundParent = parent || background.get_parent();
      if (backgroundParent) backgroundParent.remove_child(background);
      background.destroy();
   }

   // Whether blurType is one of the three Dynamic* types - the only types _createBackgroundAndEffects's
   // useViewport is meant for (see BlurApplications._blurWindow's own useViewport computation for the
   // full rationale: correctness for Dynamic types specifically, since only those clone windows via
   // CloneManager and so are the only ones that can hit the wallpaper-bleed bug viewport-wrapping
   // fixes - plus the same FBO-shrink GPU/CPU win as a bonus).
   _wantsViewport(blurType) {
      return isDynamicBlurType(blurType);
   }

   // viewport (see _createBackgroundAndEffects's useViewport): when the caller's background was
   // wrapped, pass its viewport here too so it gets sized/positioned/clipped along with it - see
   // _applyBackgroundClip, which this now delegates to. Left null (the default), this behaves
   // exactly as before for callers that never wrap (background alone gets clipped/masked).
   _setClip(actor, background, marginsActor=null, viewport=null) {
      //printStackTrace("setClip");
      //this._printActor(actor);
      let x, y, width, height;
      if (marginsActor) {
         let themeNode = marginsActor.get_theme_node();
         let left   = themeNode.get_margin(St.Side.LEFT)   //+ themeNode.get_padding(St.Side.LEFT);
         let right  = themeNode.get_margin(St.Side.RIGHT)  //+ themeNode.get_padding(St.Side.RIGHT);
         let top    = themeNode.get_margin(St.Side.TOP)    //+ themeNode.get_padding(St.Side.TOP);
         let bottom = themeNode.get_margin(St.Side.BOTTOM) //+ themeNode.get_padding(St.Side.BOTTOM);
         //log( `Margins: ${left}, ${right}, ${top}, ${bottom}` );
         x = actor.x+left; y = actor.y+top; width = actor.width-(left+right); height = actor.height-(top+bottom);
      } else {
         x = actor.x; y = actor.y; width = actor.width; height = actor.height;
      }
      this._applyBackgroundClip(background, viewport, x, y, width, height);
   }

   destroy(background) {
      removeStaticWallpaper(background);
      untrackScreenSize(background);
      if (background._blurCinnamonDimmer) {
         background._blurCinnamonGroup.remove_child(background._blurCinnamonDimmer);
         background._blurCinnamonDimmer.destroy();
         delete background._blurCinnamonDimmer;
      }
      let effect = this._getCornerEffect(background);
      if (effect) {
         background.remove_effect(effect);
         this._releaseCornerEffect(effect);
      }
      effect = this._getDesatEffect(background);
      if (effect) {
         background.remove_effect(effect);
         this._releaseDesaturateEffect(effect);
      }
      effect = this._getBlurEffect(background);
      if (effect) {
         background.remove_effect(effect);
         this._releaseBlurEffect(effect);
      }

      // When background is wrapped in a viewport (see _createBackgroundAndEffects's useViewport),
      // the corner/desat/blur effects actually live on viewport, not background - strip them from
      // viewport too, one at a time, the same way background's own effects are removed above,
      // *before* the caller destroys either actor. Callers must call this (or otherwise strip
      // viewport's effects) before destroying viewport, not after.
      let viewport = background._blurCinnamonViewport;
      if (viewport) {
         effect = this._getCornerEffect(viewport);
         if (effect) {
            viewport.remove_effect(effect);
            this._releaseCornerEffect(effect);
         }
         effect = this._getDesatEffect(viewport);
         if (effect) {
            viewport.remove_effect(effect);
            this._releaseDesaturateEffect(effect);
         }
         effect = this._getBlurEffect(viewport);
         if (effect) {
            viewport.remove_effect(effect);
            this._releaseBlurEffect(effect);
         }
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

class BlurOSD extends BlurBase {
   constructor() {
      super();
      this._states = new Map();
      this._destroyed = false;
      blurOSDThis = this; // Make "this" available to monkey patched functions

      this.has_own_show = OsdWindow.OsdWindow.prototype.hasOwnProperty('show');
      this.original_show = OsdWindow.OsdWindow.prototype.show;
      OsdWindow.OsdWindow.prototype.show = this._show;

      // 'hide' (modern) or '_hide' (legacy)
      if (typeof OsdWindow.OsdWindow.prototype.hide === 'function') {
         this.has_own_hide = OsdWindow.OsdWindow.prototype.hasOwnProperty('hide');
         this.original_hide = OsdWindow.OsdWindow.prototype.hide;
         OsdWindow.OsdWindow.prototype.hide = this._wrapHide(this.original_hide);
      }
      if (typeof OsdWindow.OsdWindow.prototype._hide === 'function') {
         this.has_own_old_hide = OsdWindow.OsdWindow.prototype.hasOwnProperty('_hide');
         this.original_old_hide = OsdWindow.OsdWindow.prototype._hide;
         OsdWindow.OsdWindow.prototype._hide = this._wrapHide(this.original_old_hide);
      }

      if (usesWorkspaceOsd) {
         this.has_own_display = WorkspaceOsd.WorkspaceOsd.prototype.hasOwnProperty('display');
         this.original_display = WorkspaceOsd.WorkspaceOsd.prototype.display;
         WorkspaceOsd.WorkspaceOsd.prototype.display = this._display;
      } else {
         this.has_own_info_show = ModalDialog.InfoOSD.prototype.hasOwnProperty('show');
         this.original_infoOSD_show = ModalDialog.InfoOSD.prototype.show;
         ModalDialog.InfoOSD.prototype.show = this._infoOSD_show;

         this.has_own_info_hide = ModalDialog.InfoOSD.prototype.hasOwnProperty('hide');
         this.original_infoOSD_hide = ModalDialog.InfoOSD.prototype.hide;
         ModalDialog.InfoOSD.prototype.hide = this._wrapHide(this.original_infoOSD_hide);
      }
   }

   _supportsDynamicBlur() {
      return true;
   }

   _getUniqueSettings() {
      return [settings.osdOpacity, settings.osdBlendColor, settings.osdBlurType, settings.osdRadius, settings.osdSaturation];
   }

   _show(...params) {
      const owner = blurOSDThis;
      const ret = owner.original_show.call(this, ...params);
      try {
         if (settings.osdSliderEffects) {
            const actor = this._hbox || this.actor;
            // On older Cinnamon versions the content actor may only
            // cover the inner contents of the OSD, while this.actor
            // represents the entire popup
            const clipActor = (!usesWorkspaceOsd && this.actor) ? this.actor : actor;
            owner._showBackground(this, actor, false, clipActor);
         } else {
            owner._hideBackground(this);
         }
      } catch (e) {
         global.logError(e);
      }
      return ret;
   }

   _wrapHide(original) {
      const owner = this;
      return function(...params) {
         const ret = original.call(this, ...params);
         try {
            if (!owner._destroyed && !owner._getOsdActor(this)?.visible)
               owner._hideBackground(this);
         } catch (e) {
            global.logError(e);
         }
         return ret;
      };
   }

   _display(...params) {
      const owner = blurOSDThis;
      const ret = owner.original_display.call(this, ...params);
      try {
         if (settings.osdWorkspaceEffects)
            owner._showBackground(this, this._vbox || (this.actor ? this.actor.get_first_child() : null), true);
         else
            owner._hideBackground(this);
      } catch (e) {
         global.logError(e);
      }
      return ret;
   }

   _infoOSD_show(...params) {
      const owner = blurOSDThis;
      const ret = owner.original_infoOSD_show.call(this, ...params);
      try {
         if (settings.osdWorkspaceEffects)
            owner._showBackground(this, this.actor, true, this.actor);
         else
            owner._hideBackground(this);
      } catch (e) {
         global.logError(e);
      }
      return ret;
   }

   _getOsdActor(osd) {
      // Legacy OSDs wrap an actor while modern OSDs are actors themselves
      return osd.actor || (osd instanceof Clutter.Actor ? osd : null);
   }

   _isCurrentState(state) {
      return !this._destroyed && this._states.get(state.osd) === state;
   }

   _cancelReclip(state) {
      if (state.laterId) {
         Meta.later_remove(state.laterId);
         state.laterId = 0;
      }
   }

   _syncActorStyle(actor, transparent) {
      if (!actor) return;
      if (transparent && settings.allowTransparentColorOSD && !actor._blurCinnamonData) {
         actor._blurCinnamonData = {
            original_color: actor.get_background_color(),
            original_style: actor.get_style(),
            original_class: actor.get_style_class_name(),
            original_pseudo_class: actor.get_style_pseudo_class()
         };

         actor.set_style(
            "background-gradient-direction: vertical; " +
            "background-gradient-start: transparent; " +
            "background-gradient-end: transparent; " +
            "background: transparent;"
         );
      } else if ((!transparent || !settings.allowTransparentColorOSD) && actor._blurCinnamonData) {
         actor.set_background_color(actor._blurCinnamonData.original_color);
         actor.set_style(actor._blurCinnamonData.original_style);
         actor.set_style_class_name(actor._blurCinnamonData.original_class);
         actor.set_style_pseudo_class(actor._blurCinnamonData.original_pseudo_class);
         delete actor._blurCinnamonData;
      }
   }

   _syncBackgroundOpacity(state) {
      const target = state.viewport || state.background;
      target.set_opacity(state.osdActor.get_paint_opacity());
   }

   _scheduleReclip(state, showBackground = false) {
      if (!this._isCurrentState(state))
         return;
      this._cancelReclip(state);

      // Keep the callback registered until preparation succeeds
      // or its owner hides/destroys it.
      let laterId = 0;
      laterId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
         if (!this._isCurrentState(state) || state.laterId !== laterId)
            return false;

         if (!state.osdActor.visible) {
            this._hideBackground(state.osd);
            return false;
         }

         if (!state.clipActor.is_mapped() || !this._setClip(state))
            return true;

         // A forced layout can emit allocation notifications and replace this
         // callback while _setClip() runs. Do not erase the replacement's ID.
         if (!this._isCurrentState(state) || state.laterId !== laterId)
            return false;
         state.laterId = 0;

         if (showBackground) {
            this._syncBackgroundOpacity(state);
            state.background.show();
            if (state.viewport) state.viewport.show();
            if (isDynamicBlurType(state.blurType))
               cloneWindowsForBackgroundNow(state.background, state.background._blurCinnamonDesktopOnly);
            this._syncActorStyle(state.actor, true);
         }
         return false;
      });
      state.laterId = laterId;
   }

   _showBackground(osd, actor, isWorkspaceOsd = false, clipActor = actor) {
      const osdActor = this._getOsdActor(osd);
      if (this._destroyed)
         return;
      if (!actor || !clipActor || !osdActor?.visible) {
         this._hideBackground(osd);
         return;
      }

      const values = this._getSettings(settings.osdOverride);
      const [opacity, blendColor, blurType, radius, saturation] = values;
      const useViewport = this._wantsViewport(blurType);
      let state = this._states.get(osd);
      if (state && (state.actor !== actor || state.clipActor !== clipActor || this._needsBackgroundRebuild(state.background, blurType, useViewport))) {
         this._hideBackground(osd);
         state = null;
      }

      if (state) {
         this.parent = state.background.get_parent() || global.overlay_group;
         if (state.viewport)
            this._updateViewportEffects(state.background, state.viewport, ...values);
         else
            this._updateEffects(state.background, ...values);
         state.blurType = blurType;

         // Workspace OSD needs an explicit refresh because its visual
         // source changes when switching workspaces
         this._scheduleReclip(state, true);
         return;
      }

      // Stale marker from a background that has already gone away
      if (osd._blurCinnamonBackground)
         delete osd._blurCinnamonBackground;

      const background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, useViewport);
      const viewport = background._blurCinnamonViewport;
      background._blurCinnamonName = "OsdWindow";
      if (viewport) viewport._blurCinnamonName = "OsdWindow";
      state = {
         osd, actor, clipActor, osdActor, background, viewport, blurType,
         signalManager: new SignalManager.SignalManager(null), laterId: 0
      };
      this._states.set(osd, state);
      osd._blurCinnamonBackground = background;

      try {
         if (isDynamicBlurType(blurType))
            this._createDynamicEffect(background);

         const scheduleReclip = () => this._scheduleReclip(state, true);
         state.signalManager.connect(osdActor, "notify::opacity", () => {
            if (this._isCurrentState(state)) this._syncBackgroundOpacity(state);
         });
         state.signalManager.connect(osdActor, "notify::visible", () => {
            if (this._isCurrentState(state) && !osdActor.visible)
               this._hideBackground(osd);
         });
         state.signalManager.connect(osdActor, "destroy", () => {
            if (this._isCurrentState(state)) this._hideBackground(osd, actor, false);
         });
         if (osdActor !== clipActor) {
            state.signalManager.connect(osdActor, "notify::allocation", scheduleReclip);
            state.signalManager.connect(osdActor, "notify::mapped", scheduleReclip);
         }
         state.signalManager.connect(clipActor, "notify::allocation", scheduleReclip);
         state.signalManager.connect(clipActor, "notify::mapped", scheduleReclip);
         state.signalManager.connect(clipActor, "style-changed", scheduleReclip);

         this._scheduleReclip(state, true);
      } catch (e) {
         this._hideBackground(osd);
         throw e;
      }
   }

   _hideBackground(osd, actor = null, restoreStyle = true) {
      const state = this._states.get(osd);
      if (!state)
         return;

      // Ignore a stale hide callback from an OSD that no longer owns
      // the active BlurOSD background
      if (actor && actor !== state.actor)
         return;

      this._states.delete(osd);
      this._cancelReclip(state);
      state.signalManager.disconnectAllSignals();
      if (isDynamicBlurType(state.blurType))
         this._destroyDynamicEffect(state.background);

      // A native destroy needs resource cleanup, but no CSS restoration.
      if (restoreStyle)
         this._syncActorStyle(state.actor, false);
      else
         delete state.actor._blurCinnamonData;

      // background (and viewport, when wrapped - see _createBackgroundAndEffects's useViewport)
      // are always parented into global.overlay_group here (the parent argument passed to
      // _createBackgroundAndEffects above), so _destroyBackgroundAndViewport's parent argument
      // covers the same "usually overlay_group, defensively whatever it actually is" cases the old
      // parent-detection code here handled.
      const parent = state.background.get_parent() || global.overlay_group;
      this._destroyBackgroundAndViewport(state.background, parent);
      if (osd._blurCinnamonBackground === state.background)
         delete osd._blurCinnamonBackground;
   }

   _setClip(state) {
      const actor = state.clipActor;
      if (!this._isCurrentState(state) || !actor.get_stage())
         return false;

      // Use the allocated bounds: width/height may return the preferred
      // size, including theme margins, while a relayout is pending
      const box = Cinnamon.util_get_transformed_allocation(actor);
      const width = box.x2 - box.x1;
      const height = box.y2 - box.y1;
      if (![box.x1, box.y1, width, height].every(Number.isFinite) ||
          width <= 0 || height <= 0)
         return false;

      // Use the actor that represents the complete popup for
      // both clipping geometry and corner radius
      const themeNode = actor.get_theme_node();
      if (themeNode) {
         let cornerRadius = themeNode.get_border_radius(St.Corner.TOPLEFT);
         if (cornerRadius === 9999)
            cornerRadius = Math.min(width, height) / 2;
         this._updateViewportCornerRadius(state.background, state.viewport, cornerRadius / global.ui_scale, true, true);
      }
      if (!this._isCurrentState(state))
         return false;
      this._applyBackgroundClip(state.background, state.viewport, box.x1, box.y1, width, height);
      return true;
   }

   destroy() {
      this._destroyed = true;
      for (const osd of this._states.keys())
         this._hideBackground(osd);
      this.parent = null;

      if (this.has_own_show) OsdWindow.OsdWindow.prototype.show = this.original_show;
      else delete OsdWindow.OsdWindow.prototype.show;

      if (this.has_own_hide) OsdWindow.OsdWindow.prototype.hide = this.original_hide;
      else if (OsdWindow.OsdWindow.prototype.hide) delete OsdWindow.OsdWindow.prototype.hide;

      if (this.has_own_old_hide) OsdWindow.OsdWindow.prototype._hide = this.original_old_hide;
      else if (OsdWindow.OsdWindow.prototype._hide) delete OsdWindow.OsdWindow.prototype._hide;

      if (usesWorkspaceOsd) {
         if (this.has_own_display) WorkspaceOsd.WorkspaceOsd.prototype.display = this.original_display;
         else delete WorkspaceOsd.WorkspaceOsd.prototype.display;
      } else {
         if (this.has_own_info_show) ModalDialog.InfoOSD.prototype.show = this.original_infoOSD_show;
         else delete ModalDialog.InfoOSD.prototype.show;

         if (this.has_own_info_hide) ModalDialog.InfoOSD.prototype.hide = this.original_infoOSD_hide;
         else delete ModalDialog.InfoOSD.prototype.hide;
      }
      if (blurOSDThis === this) blurOSDThis = null;
   }
}

class BlurClassicSwitcher extends BlurBase {
   constructor() {
      super();
      this._signalManager = new SignalManager.SignalManager(null);
      blurClassicSwitcherThis = this; // Make "this" available to monkey patched functions

      this.original_show = ClassicSwitcher.ClassicSwitcher.prototype._show;
      this.original_hide = ClassicSwitcher.ClassicSwitcher.prototype._hide;
      ClassicSwitcher.ClassicSwitcher.prototype._show = this._show;
      ClassicSwitcher.ClassicSwitcher.prototype._hide = this._hide;
   }

   _supportsDynamicBlur() {
      return true;
   }

   _getUniqueSettings() {
      return [settings.appswitcherOpacity, settings.appswitcherBlendColor, settings.appswitcherBlurType, settings.appswitcherRadius, settings.appswitcherSaturation];
   }

   // Monkey patch function. The 'this' will be for ClassicSwitcher
   _show(...params) {
      if (!this._previewEnabled)
         blurClassicSwitcherThis._showBackground(this);
      blurClassicSwitcherThis.original_show.call(this, ...params);
      if (!this._previewEnabled)
         blurClassicSwitcherThis._setClip(this._appList.actor)
   }

   _showBackground(switcher) {
      let actor = switcher._appList.actor;
      if (actor) {
         if (settings.allowTransparentColorSwitcher) {
            actor.set_style( "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
         }

         // Create the effects and the background actor to apply to effects to
         let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.appswitcherOverride);
         this._blurType = blurType
         let useViewport = this._wantsViewport(blurType);
         this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, useViewport);
         this._background._blurCinnamonName = "ClassicSwitcher";
         this._viewport = this._background._blurCinnamonViewport;
         if (this._viewport) this._viewport._blurCinnamonName = "ClassicSwitcher";

         let themeNode = actor.get_theme_node();
         if (themeNode) {
            // We are assuming that all corners have the same radius, hope that is true.
            let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
            this._updateViewportCornerRadius(this._background, this._viewport, (radius/*+6*/)/global.ui_scale, true, true);
         }
         this._signalManager.connect(actor, "notify::allocation", () => this._setClip(actor) );

         this._setClip(actor)
         // If Dynamic Blurring is enabled, create a workspace clone and add the clone to the background
         if (isDynamicBlurType(blurType)) {
            debugMsg( "Creating dynamic effect for classic app switcher" );
            this._createDynamicEffect(this._background);
         }
         this._background.show();
         if (this._viewport) this._viewport.show();
      }
   }

   // Monkey patch function. The 'this' will be for ClassicSwitcher
   _hide(...params) {
      if (!this._previewEnabled) {
         blurClassicSwitcherThis._hideBackground.call(blurClassicSwitcherThis);
      }
      blurClassicSwitcherThis.original_hide.call(this, ...params);
   }

   _hideBackground() {
      if (isDynamicBlurType(this._blurType)) {
         debugMsg( "Removing dynamic effect for classic app switcher" );
         this._destroyDynamicEffect(this._background);
      }
      this._signalManager.disconnectAllSignals();
      this._destroyBackgroundAndViewport(this._background, global.overlay_group);
      this._viewport = null;
   }

   _setClip(actor) {
      let [x,y] = actor.get_transformed_position();
      this._applyBackgroundClip(this._background, this._viewport, x, y, actor.width, actor.height);
   }

   destroy() {
      ClassicSwitcher.ClassicSwitcher.prototype._show = this.original_show;
      ClassicSwitcher.ClassicSwitcher.prototype._hide = this.original_hide;
      if (this._background) {
         this._destroyBackgroundAndViewport(this._background, global.overlay_group);
         this._viewport = null;
      }
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

   _supportsDynamicBlur() {
      return true;
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
      let workspace = global.workspace_manager.get_active_workspace();
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
      let workspace = global.workspace_manager.get_active_workspace();
      let windows = workspace.list_windows();
      let maximizedWindows = windows.filter( (window) => {return(window.get_monitor() === monitor && this._windowIsMaximized(window));} );
      this._setTransparencyForEachPanelOnMonitor(monitor, maximizedWindows.length===0);
   }

   // Apply/Remove transparency appropriately for all blurred panels (taking maximized windows in to account)
   _setupPanelTransparencyOnAllMonitors() {
      let workspace = global.workspace_manager.get_active_workspace();
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

   _queuePanelVisibility(panel, visible, delay) {
      const data = panel.__blurredPanel;
      if (!data) return;
      if (data.visibilityTimeoutId)
         Mainloop.source_remove(data.visibilityTimeoutId);
      data.visibilityTimeoutId = Mainloop.timeout_add(delay, () => {
         data.visibilityTimeoutId = 0;
         if (panel.__blurredPanel !== data) return false;
         if (visible && (panel._hidden || global.display.get_monitor_in_fullscreen(panel.monitorIndex)))
            return false;
         if (visible) {
            data.background.show();
            if (data.viewport) data.viewport.show();
         } else {
            data.background.hide();
            if (data.viewport) data.viewport.hide();
         }
         return false;
      });
   }

   // If a fullscreen window event occurs we need to hide or show the background overlay
   _fullscreen_changed() {
      let panels = Main.getPanels();
      let monitor;
      let panel;
      let background;
      let viewport;

      for ( let i=0 ; i < panels.length ; i++ ) {
         panel = panels[i];
         if (panel && panel.__blurredPanel && panel.__blurredPanel.background && !panel._hidden) {
            background = panel.__blurredPanel.background;
            viewport = panel.__blurredPanel.viewport;
            if (global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
               background.hide();
               if (viewport) viewport.hide();
            } else {
               background.show();
               if (viewport) viewport.show();
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
               // Strip effects (background's and, when wrapped, viewport's - see
               // _destroyBackgroundAndViewport) before destroying either actor, same as
               // _unblurPanel() - a bare background.destroy() here never gave a multi-pass blur
               // effect (Dual Kawase) a chance to tear its own sub-effects down cleanly first.
               this._destroyDynamicEffect(blurredPanel.background);
               this._destroyBackgroundAndViewport(blurredPanel.background, global.overlay_group);
               blurredPanel.signalManager.disconnectAllSignals();
               this._blurredPanels.splice(i,1);
            }
         }
      }
   }

   _setClip(panel){
      if (panel && panel.__blurredPanel && panel.__blurredPanel.background) {
         let actor = panel.actor;
         let background = panel.__blurredPanel.background;
         let viewport = panel.__blurredPanel.viewport;
         if (actor.is_visible()) {
            this._applyBackgroundClip(background, viewport, actor.x, actor.y, actor.width, actor.height);
         } else {
            this._applyBackgroundClip(background, viewport, 0, 0, 0, 0);
         }
         if (panel._hidden || panel._disabled || global.display.get_monitor_in_fullscreen(panel.monitorIndex)) {
            background.hide();
            if (viewport) viewport.hide();
         } else if (!background.is_visible()) {
            background.show();
            if (viewport) viewport.show();
         }
      }
   }

   // Some extensions (e.g. Centered Cinnamon Dock) restyle panel.actor by calling set_style() on it directly, which
   // replaces the whole inline style including our transparency CSS. They also re-apply their own style whenever the
   // panel's style changes, so re-appending our CSS from a style-changed handler would ping-pong forever. Instead we
   // intercept set_style() calls on the panel actor, remember the caller's style as externalStyle, and always set
   // externalStyle + our transparency CSS. St ignores a set_style() with an unchanged string (no style-changed is
   // emitted), so both sides converge after one round.
   _wrapPanelSetStyle(panel) {
      let blurredPanel = panel.__blurredPanel;
      if (!blurredPanel || blurredPanel.setStyleWrapped) return;
      let actor = panel.actor;
      blurredPanel.setStyleWrapped = true;
      actor.set_style = (style) => {
         if (panel.__blurredPanel === blurredPanel) {
            blurredPanel.externalStyle = style || "";
            this._applyPanelStyle(panel);
         } else {
            St.Widget.prototype.set_style.call(actor, style);
         }
      };
   }

   _unwrapPanelSetStyle(panel) {
      let blurredPanel = panel.__blurredPanel;
      if (blurredPanel && blurredPanel.setStyleWrapped) {
         delete panel.actor.set_style;
         blurredPanel.setStyleWrapped = false;
      }
   }

   // Set the panel's inline style to externalStyle followed by our transparency CSS (when the panel should be transparent)
   _applyPanelStyle(panel) {
      let blurredPanel = panel.__blurredPanel;
      if (!blurredPanel) return;
      let style = blurredPanel.externalStyle || "";
      if (settings.allowTransparentColorPanels && blurredPanel.transparent !== false) {
         if (style.length && !style.trim().endsWith(";")) style += ";";
         style += (style.length ? " " : "") + PANEL_TRANSPARENT_STYLE + (blurredPanel.customCSS || "");
      }
      St.Widget.prototype.set_style.call(panel.actor, style.length ? style : null);
   }

   // The panel's border radius can change at any time (e.g. Centered Cinnamon Dock rounds the panel's corners via its
   // inline style), so keep the blurred background's corner radius in sync. style-changed fires often (the dock
   // re-styles every frame while animating its width), so only touch the effects when the radius actually changed.
   _syncPanelCornerRadius(panel, force=false) {
      let blurredPanel = panel.__blurredPanel;
      if (!blurredPanel || !blurredPanel.background || !panel.actor.get_stage()) return;
      let themeNode = panel.actor.get_theme_node();
      if (!themeNode) return;
      // TODO: Need to be able to independently round all four corners, needs improvements to the corner effect code!
      let topRadius = themeNode.get_border_radius(St.Corner.TOPLEFT);
      let bottomRadius = themeNode.get_border_radius(St.Corner.BOTTOMLEFT);
      if (!force && topRadius === blurredPanel.topRadius && bottomRadius === blurredPanel.bottomRadius) return;
      blurredPanel.topRadius = topRadius;
      blurredPanel.bottomRadius = bottomRadius;
      this._updateViewportCornerRadius(blurredPanel.background, blurredPanel.viewport, Math.max(topRadius, bottomRadius), topRadius!==0, bottomRadius!==0);
      // A newly created corner effect needs its clip region set
      this._setClip(panel);
   }

   // Some extensions (e.g. Centered Cinnamon Dock's auto-hide) fade the panel out by animating its opacity and then
   // scale it to zero, rather than calling Panel.disable(), so make the blurred background follow the panel's
   // opacity and scale.
   _syncPanelOpacity(panel) {
      let blurredPanel = panel.__blurredPanel;
      if (!blurredPanel || !blurredPanel.background) return;
      let actor = panel.actor;
      let opacity = (actor.scale_x === 0 || actor.scale_y === 0) ? 0 : actor.opacity;
      if (blurredPanel.viewport) {
         // When wrapped, background is never painted directly: it is clipped to the viewport's *expanded* rect
         // (visible rect + the blur's sampling margin), so its own paint would show un-blurred, tinted content
         // outside the panel. viewport paints background through a Clutter.Clone (which overrides the source's
         // opacity with its own), so background stays at 0 (see _createBackgroundAndEffects) and only viewport
         // follows the panel's opacity.
         blurredPanel.viewport.opacity = opacity;
         blurredPanel.background.opacity = 0;
      } else {
         blurredPanel.background.opacity = opacity;
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
      let [opacity, blendColor, blurType, radius, saturation, customCSS] = panelSettings;

      let actor = panel.actor;
      let blurredPanel = panel.__blurredPanel;

      // Emulate the Cinnamon 6.4 panel._panelHasOpenMenus() function for older Cinnamon releases
      if (typeof panel._panelHasOpenMenus !== "function") {
         this.added_panelHasOpenMenus = true;
         panel._panelHasOpenMenus = panelHasOpenMenus;
      }
      if (!blurredPanel) {
         // Save the current panel setting if we don't already have the data saved
         // externalStyle is the inline style last set on the panel by anyone other than us (see _wrapPanelSetStyle)
         blurredPanel = { original_color: actor.get_background_color(), externalStyle: actor.get_style() || "", original_class: actor.get_style_class_name(),
                          original_pseudo_class: actor.get_style_pseudo_class(), background: null, effect: null, panel: panel };
         panel.__blurredPanel = blurredPanel;
         this._blurredPanels.push(blurredPanel);
      }
      blurredPanel.customCSS = customCSS;
      this._wrapPanelSetStyle(panel);
      // Make the panel transparent (when allowTransparentColorPanels is enabled)
      this._applyPanelStyle(panel);
      // Determine the corner radius
      let themeNode = actor.get_theme_node();
      if (themeNode) {
         // TODO: Need to be able to independently round all four corners, needs improvements to the corner effect code!
         topRadius = themeNode.get_border_radius(St.Corner.TOPLEFT);
         bottomRadius = themeNode.get_border_radius(St.Corner.BOTTOMLEFT);
         cornerRadius = Math.max(topRadius, bottomRadius);
      }

      blurredPanel.topRadius = topRadius;
      blurredPanel.bottomRadius = bottomRadius;

      let useViewport = this._wantsViewport(blurType);
      let background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, cornerRadius, topRadius!==0, bottomRadius!==0, useViewport);
      background._blurCinnamonName = "Panel";
      blurredPanel.background = background;
      blurredPanel.viewport = background._blurCinnamonViewport;
      if (blurredPanel.viewport) blurredPanel.viewport._blurCinnamonName = "Panel";
      this._setClip(panel);

      if (isDynamicBlurType(blurType)) {
         this._createDynamicEffect(background);
      }

      blurredPanel.signalManager = new SignalManager.SignalManager(null);
      blurredPanel.signalManager.connect(actor, "notify::allocation", () => this._setClip(panel) );
      blurredPanel.signalManager.connect(actor, "enter-event", () => this._onEnterEvent(panel) );
      blurredPanel.signalManager.connect(actor, "leave-event", () => this._onLeaveEvent(panel) );
      // Other code (e.g. the Centered Cinnamon Dock extension) can restyle, fade, scale or hide the panel directly
      // without going through Panel.enable()/disable(), so follow those changes too
      blurredPanel.signalManager.connect(actor, "style-changed",   () => this._syncPanelCornerRadius(panel) );
      blurredPanel.signalManager.connect(actor, "notify::opacity", () => this._syncPanelOpacity(panel) );
      blurredPanel.signalManager.connect(actor, "notify::scale-x", () => this._syncPanelOpacity(panel) );
      blurredPanel.signalManager.connect(actor, "notify::scale-y", () => this._syncPanelOpacity(panel) );
      blurredPanel.signalManager.connect(actor, "notify::visible", () => this._setClip(panel) );
      this._syncPanelOpacity(panel);
      //blurredPanel.signalManager.connect(actor, 'notify::size', () => {this._setClip(panel);} );
      //blurredPanel.signalManager.connect(actor, 'notify::position', () => {this._setClip(panel);} );

      if (blurredPanel.reclipTimeoutId)
         Mainloop.source_remove(blurredPanel.reclipTimeoutId);

      blurredPanel.reclipTimeoutId = Mainloop.timeout_add(1500, () => {
         blurredPanel.reclipTimeoutId = 0;
         if (panel.__blurredPanel === blurredPanel)
            this._setClip(panel);
         return false;
      });
   }

   _onEnterEvent(panel) {
      if (settings.hoverBrightenPanels && panel) {
         //let actor = panel.actor;
         let blurredPanel = panel.__blurredPanel
         if (blurredPanel) {
            let panelSettings = this._getPanelSettings(panel);
            if (!panelSettings) return
            let [opacity, blendColor, blurType, radius, saturation, customCSS] = panelSettings;

            let dimmerColor = this._getColor( blendColor, 0 );
            blurredPanel.background._blurCinnamonDimmer.set_background_color(dimmerColor);

            // The desaturate effect lives on viewport, not background, once wrapped (see
            // _createBackgroundAndEffects's useViewport) - background itself only carries the
            // mirrored corner effect in that case, never a desat effect of its own.
            let effect = this._getDesatEffect(blurredPanel.viewport || blurredPanel.background)
            if (effect) {
               effect.set_factor(0);
            }
            //effect = this._getBlurEffect(blurredPanel.background);
            //if (effect && effect instanceof GaussianBlur.GaussianBlurEffect) {
            //   effect.radius = effect.radius+25;
            //}
         }
      }
   }

   _onLeaveEvent(panel) {
      if (settings.hoverBrightenPanels && panel) {
         //let actor = panel.actor;
         let blurredPanel = panel.__blurredPanel
         if (blurredPanel) {
            let panelSettings = this._getPanelSettings(panel);
            if (!panelSettings ) return;
            let [opacity, blendColor, blurType, radius, saturation, customCSS] = panelSettings;

            let dimmerColor = this._getColor( blendColor, opacity );
            blurredPanel.background._blurCinnamonDimmer.set_background_color(dimmerColor);

            // See the matching comment in _onEnterEvent - the desat effect lives on viewport once
            // wrapped.
            let effect = this._getDesatEffect(blurredPanel.viewport || blurredPanel.background)
            if (effect) {
               effect.set_factor((100-saturation)/100);
            }
            //effect = this._getBlurEffect(blurredPanel.background);
            //if (effect && effect instanceof GaussianBlur.GaussianBlurEffect) {
            //   effect.radius = radius;
            //}
         }
      }
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
            for (const name of ['visibilityTimeoutId', 'reclipTimeoutId']) {
                if (blurredPanel[name]) Mainloop.source_remove(blurredPanel[name]);
                blurredPanel[name] = 0;
            }
            this._unwrapPanelSetStyle(panel);
            actor.set_background_color(blurredPanel.original_color);
            // Restore the style most recently set by someone other than us rather than a snapshot from when we blurred
            // the panel, in case another extension has restyled (or un-styled) the panel since then
            actor.set_style(blurredPanel.externalStyle || null);
            actor.set_style_class_name(blurredPanel.original_class);
            actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
            if (blurredPanel.background) {
               this._destroyDynamicEffect(blurredPanel.background);
               this._destroyBackgroundAndViewport(blurredPanel.background, global.overlay_group);
               blurredPanel.viewport = null;
            }
            if (blurredPanel.signalManager)
               blurredPanel.signalManager.disconnectAllSignals()
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
         let panelSettings = this._getPanelSettings(panel);
         if (!panelSettings ) return;
         blurredPanel.customCSS = panelSettings[5];
         // Append our transparency CSS to the panel's own style (when allowTransparentColorPanels is enabled)
         this._applyPanelStyle(panel);
         //Mainloop.idle_add( () => { this._setClip(panel) } ); // This call to _setClip causes the blurred background to disappear for some reason.
      } else {
         actor.set_background_color(blurredPanel.original_color);
         actor.set_style_class_name(blurredPanel.original_class);
         actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
         // blurredPanel.transparent is false now, so this applies only the panel's own (external) style
         this._applyPanelStyle(panel);
      }
   }

   // Update the effects for each panel because some change was made to the panel settings
   updateEffects() {
      let panels = Main.getPanels();
      for ( let i=0 ; i < panels.length ; i++ ) {
         if (panels[i]) {
            let panelSettings = this._getPanelSettings(panels[i]);
            if (panelSettings) {
               let [opacity, blendColor, blurType, radius, saturation, customCSS] = panelSettings;
               let blurredPanel = panels[i].__blurredPanel;
               if (blurredPanel) {
                  let wantsViewport = this._wantsViewport(blurType);
                  if (!!blurredPanel.viewport !== wantsViewport) {
                     // Whether this panel's background needs to be wrapped in a viewport (see
                     // _createBackgroundAndEffects's useViewport) has changed - rebuild rather than
                     // migrate the actor tree in place, the same way BlurApplications.updateEffects()
                     // rebuilds for the equivalent transition.
                     this._unblurPanel(panels[i]);
                     this._blurPanel(panels[i]);
                     blurredPanel = panels[i].__blurredPanel;
                  } else if (blurredPanel.viewport) {
                     this._updateViewportEffects(blurredPanel.background, blurredPanel.viewport, opacity, blendColor, blurType, radius, saturation);
                  } else {
                     blurredPanel.background = this._updateEffects(blurredPanel.background, opacity, blendColor, blurType, radius, saturation);
                  }
                  if (!settings.noPanelEffectsMaximized) {
                     this._setPanelTransparency(blurredPanel, true);
                  }
                  this._setClip(panels[i]);
                  let actor = panels[i].actor;
                  // The customCSS (or allowTransparentColorPanels) might have changed, so re-compose the panel's style
                  blurredPanel.customCSS = customCSS;
                  actor.set_style_class_name(blurredPanel.original_class);
                  actor.set_style_pseudo_class(blurredPanel.original_pseudo_class);
                  this._applyPanelStyle(panels[i]);
                  // The corner radius might have changed via the customCSS, so re-sync it
                  this._syncPanelCornerRadius(panels[i], true);
               } else {
                  this._blurPanel(panels[i]);
                  blurredPanel = panels[i].__blurredPanel;
               }
               if ((isDynamicBlurType(blurType)) && !this._isDynamicEffectActive(blurredPanel.background)) {
                  this._createDynamicEffect(blurredPanel.background);
               }
            } else if (panels[i].__blurredPanel) {
               // No settings found to apply to this panel, so remove all effects for this panel
               this._unblurPanel(panels[i])
            }
         }
      }
      if (settings.noPanelEffectsMaximized) {
         this._setupPanelTransparencyOnAllMonitors();
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
                  return [uniqueSetting.opacity, uniqueSetting.color, uniqueSetting.blurtype, uniqueSetting.radius, uniqueSetting.saturation, uniqueSetting.customCSS];
               } else {
                  return [...this._getGenericSettings(), ""]
               }
            }
         }
         return null;
      } else {
         return [...this._getSettings(settings.panelsOverride), ""];
      }
   }

   // Functions that will be monkey patched over the Panel functions
   blurEnable(...params) {
      try {
         if (this.__blurredPanel && this.__blurredPanel.background && !global.display.get_monitor_in_fullscreen(this.monitorIndex) && !this._hidden) {
            // Only show the blurred background after the panel animation is almost done
            blurPanelsThis._queuePanelVisibility(this, true, AUTOHIDE_ANIMATION_TIME * 1000 * .9);
         }
      } catch (e) {}
      blurPanelsThis._originalPanelEnable.apply(this, params);
   }

   blurDisable(...params) {
      try {
         if (this.__blurredPanel && this. __blurredPanel.background && !this._hidden) {
            // Delay 50ms before hiding the blurred background to avoid a sudden unblurring of the panel before other animations even get started
            blurPanelsThis._queuePanelVisibility(this, false, 50);
         }
      } catch (e) {}
      blurPanelsThis._originalPanelDisable.apply(this, params);
   }
}

// Inline style appended to a popup menu's actor so the theme background doesn't hide the blurred background
const MENU_TRANSPARENT_STYLE = "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                               "background-gradient-end: transparent; background: transparent;";

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

      let useViewport = this._wantsViewport(blurType);
      this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, useViewport); // Assume a corner radius of 10, it will be fixed if needed
      this._background._blurCinnamonName = "Menus";
      this._viewport = this._background._blurCinnamonViewport;
      if (this._viewport) this._viewport._blurCinnamonName = "Menus";

      // Setup the popup menu accent color
      let accentOpacity = settings.popupAccentOpacity;
      this._accentColor = this._getColor( blendColor, accentOpacity );

      this._changeCount = 0;
      debugMsg( "BlurPopupMenus initilized, actor hidden" );
   }

   _supportsDynamicBlur() {
      return true;
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
            let themeNode = menu.actor.get_theme_node();
            let pLeft = themeNode.get_padding(St.Side.LEFT);
            let pRight = themeNode.get_padding(St.Side.RIGHT);
            let pTop = themeNode.get_padding(St.Side.TOP);
            let pBottom = themeNode.get_padding(St.Side.BOTTOM);
            let bm = menu.box.get_margin();
            this._applyBackgroundClip(this._background, this._viewport,
               actor.x+bm.left+pLeft, actor.y+bm.top+pTop,
               actor.width-(bm.left+bm.right+pLeft+pRight), actor.height-(bm.top+bm.bottom+pTop+pBottom));
         } else {
            this._applyBackgroundClip(this._background, this._viewport, 0, 0, 0, 0);
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
            if (!menu._foundAccentActors) {
               this._findAccentActors(menu, menu.actor);
               menu._foundAccentActors=true;
            } else {
               this._reapplyAccentActorsStyle(menu);
            }

            // Adjust the menu transparency and color for the menu box if required
            if (!menu.box._blurCinnamonData) {
               this._applyActorStyle(menu.box, this._boxColor);
            }

            // The menu's rounded corners could be applied to the box or the menus actor, so we have to check both
            // We are assuming that all corners have the same radius, hope that is true.
            let themeNode = menu.box.get_theme_node();
            if (themeNode) {
               let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
               this._updateViewportCornerRadius( this._background, this._viewport, radius/global.ui_scale, true, true );
            }
            themeNode = menu.actor.get_theme_node();
            if (themeNode) {
               let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
               if (radius != 0)
                  this._updateViewportCornerRadius( this._background, this._viewport, radius/global.ui_scale, true, true );
            }

            // PopupMenu.open() calls setMaxHeight() just before emitting 'open-state-changed', which replaces
            // menu.actor's inline style with "max-height: Npx; max-width: Npx;". We must append to that style
            // rather than replace it, otherwise the max-height is lost: the menu can then grow past the monitor
            // and PopupSubMenu._needsScrollbar() sees no max-height, so sub-menu scrollbars are disabled
            // (see cinnamon-spices-extensions issue #1117, Radio3.0 applet). setMaxHeight() resets the style on
            // every open, but guard against duplicating our fragment in case a menu overrides setMaxHeight().
            let curStyle = menu.actor.get_style() || "";
            if (!curStyle.includes(MENU_TRANSPARENT_STYLE)) {
               if (curStyle.length > 0 && !curStyle.trimEnd().endsWith(";"))
                  curStyle += ";";
               menu.actor.set_style( (curStyle.length > 0 ? curStyle + " " : "") + MENU_TRANSPARENT_STYLE );
            }
         }

         this._currentMenu = menu;
         if (menu.animating) {
            // Make the background visible but zero size initially, let the paint signal re-clip the background as needed
            this._applyBackgroundClip(this._background, this._viewport, 0, 0, 0, 0);
         } else {
            // Use the exact same clip-rect formula _setClip() uses for every later notify::allocation update
            this._setClip(menu);
         }
         this._background.show();
         if (this._viewport) this._viewport.show();
         debugMsg( "Blurred actor is now visible" );

         // If Dynamic Blurring is enabled, create window clones and add them to the background
         if (isDynamicBlurType(blurType)) {
            this._createDynamicEffect(this._background);
         }

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
         if (this._viewport) this._viewport.hide();
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

   _reapplyAccentActorsStyle(menu) {
      menu._blurCinnamonAccentActors.forEach( (child) => this._applyActorStyle(child, this._accentColor) );
   }

   _applyActorStyle(actor, color) {
      let radius = 0;
      if (!actor._blurCinnamonData) {
         actor._blurCinnamonData = {original_entry_color: actor.get_background_color(), original_entry_style: actor.get_style(),
                                    original_entry_class: actor.get_style_class_name(), original_entry_pseudo_class: actor.get_style_pseudo_class()};
      } else {
         let style = actor.get_style();
         if (style.startsWith(actor._blurCinnamonData.original_entry_style) === false) {
            actor._blurCinnamonData = {original_entry_color: actor.get_background_color(), original_entry_style: actor.get_style(),
                                    original_entry_class: actor.get_style_class_name(), original_entry_pseudo_class: actor.get_style_pseudo_class()};
         }
      }

      let rgba = `rgba(${color.red}, ${color.green}, ${color.blue}, ${color.alpha/255.0})`
      actor.set_style( actor._blurCinnamonData.original_entry_style + `background-gradient-direction: vertical; background-gradient-start: ${rgba}; background-gradient-end: ${rgba};`  );
      return;
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
      if (!menu._blurCinnamonAccentActors)
         menu._blurCinnamonAccentActors = []
      let children = actor.get_children();
      for (let i=0 ; i < children.length ; i++ ) {
         let child = children[i];
         if (child._blurCinnamonData === undefined) {
            if (child instanceof St.Entry && !(child.get_parent() instanceof St.BoxLayout && child.get_parent().get_parent() instanceof St.ScrollView)) {
               debugMsg( "found new entry accent actor" );
               this._applyActorStyle(child, this._accentColor);
               menu._blurCinnamonAccentActors.push(child);
            } else if (child instanceof St.BoxLayout) {
               let styleClassName = child.get_style_class_name();
               if (styleClassName && (styleClassName == "menu-favorites-box" || styleClassName == "appmenu-sidebar")) {
                  debugMsg( `found new menu accent actor: ${styleClassName}` );
                  this._applyActorStyle(child, this._accentColor);
                  menu._blurCinnamonAccentActors.push(child);
               }
            } else if (child instanceof St.Table) {
               let name = child.get_name();
               if (name && name.indexOf("notification") !== -1) {
                  debugMsg( "found new notification accent actor" );
                  this._applyActorStyle(child, this._accentColor);
                  menu._blurCinnamonAccentActors.push(child);
               }
            } else if (child instanceof St.ScrollView) {
               let name = child.get_name();
               if (name && name === "menu-search-entry") { // Used by PanelTranslator
                  this._applyActorStyle(child, this._accentColor);
                  menu._blurCinnamonAccentActors.push(child);
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
         if (this._viewport) this._viewport.hide();
         debugMsg( "blur actor hidden" );
         this._currentMenu = null;
         // In case we are using Dynamic Blur, destroy it
         this._destroyDynamicEffect(this._background);
      }
      menu.blurCinnamonSignalManager.disconnect("queue-relayout", menu.actor);
      debugMsg( "unblur complete\n" );
   }

   updateEffects() {
      debugMsg("updateEffects for popup menus" );
      this._changeCount++;

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.popupOverride);
      let accentOpacity = settings.popupAccentOpacity;

      let wantsViewport = this._wantsViewport(blurType);
      if (!!this._viewport !== wantsViewport) {
         // Whether the shared menu background needs to be wrapped in a viewport (see
         // _createBackgroundAndEffects's useViewport) has changed - rebuild rather than migrate
         // the actor tree in place, the same way BlurApplications.updateEffects() rebuilds for the
         // equivalent transition. Corner radius is rebuilt at the same default-10 the constructor
         // uses - _onOpenStateChanged() re-derives the real radius from the menu's theme node the
         // next time a menu opens, exactly as it already does after construction.
         this._destroyBackgroundAndViewport(this._background, global.overlay_group);
         this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, wantsViewport);
         this._background._blurCinnamonName = "Menus";
         this._viewport = this._background._blurCinnamonViewport;
         if (this._viewport) this._viewport._blurCinnamonName = "Menus";
      } else if (this._viewport) {
         this._updateViewportEffects(this._background, this._viewport, opacity, blendColor, blurType, radius, saturation);
      } else {
         this._background = this._updateEffects(this._background, opacity, blendColor, blurType, radius, saturation);
      }
      //this._setClip(this._currentMenu);
      this._background.hide();
      if (this._viewport) this._viewport.hide();

      // Update the accent dimming color
      this._accentColor = this._getColor( blendColor, accentOpacity );

      if ((isDynamicBlurType(blurType)) && !this._isDynamicEffectActive(this._background)) {
         this._createDynamicEffect(this._background);
      }

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
      this._destroyBackgroundAndViewport(this._background, global.overlay_group);
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
   // The effects and dimmer go on the actor that paints the wallpaper (see _findTarget()): on X11 that's
   // global.background_actor. Wayland has no root-window background, so csd-background draws the wallpaper
   // in its own DESKTOP window (see WallpaperTracker) and that window's actor is the target instead. It
   // may not exist yet when this class starts, and csd-background can be restarted, so on Wayland the
   // target is picked up when the window maps and dropped when its actor is destroyed.
   constructor() {
      super();
      this._signalManager = new SignalManager.SignalManager(null);
      this._target = null;
      this._targetDestroyId = 0;
      this._mapId = 0;

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.desktopOverride);

      if (blurType === BlurType.Simple)
         this._blurEffect = new Clutter.BlurEffect();
      else if (blurType === BlurType.Gaussian)
         this._blurEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
      else if (blurType === BlurType.MonteCarlo)
         this._blurEffect = new MonteCarloBlur.MonteCarloBlurEffect( { radius: radius, iterations: settings.montecarloIterations, prefer_closer_pixels: settings.montecarloPerferCloserPixels, use_base_pixel: settings.montecarloUseBasePixel, brightness: 1, width: 0, height: 0 } );
      else if (blurType === BlurType.DualKawase)
         this._blurEffect = new DualKawaseBlur.DualFilteringBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
      this._blurEnabled = !!this._blurEffect;
      this._desatEffect = new Clutter.DesaturateEffect({ factor: (100 - saturation) / 100 });
      // A dimmer child of the target so we can change the colorization and dimming of the background
      let dimmerColor = this._getColor( blendColor, opacity );
      this._dimmer = new Clutter.Actor({x_expand: true, y_expand: true, width: global.screen_width, height: global.screen_height, background_color: dimmerColor});

      // Always keep the dimmer at the screen size (this used to be connected only with the "without focus" option)
      this._monitorsChangedId = Main.layoutManager.connect("monitors-changed", () => this._monitorsChanged());
      if (Meta.is_wayland_compositor())
         this._mapId = global.window_manager.connect("map", (wm, actor) => this._onWindowMapped(actor));

      this._setTarget(this._findTarget());
      this.updateEffects();
   }

   _getGenericSettings() {
      let genericSettings = super._getGenericSettings();
      if (isLiquidGlassBlurType(genericSettings[2]))
         genericSettings[2] = BlurType.Gaussian;
      return genericSettings;
   }

   _getUniqueSettings() {
      return [settings.desktopOpacity, settings.desktopBlendColor, settings.desktopBlurType, settings.desktopRadius, settings.desktopSaturation];
   }

   _findTarget() {
      if (!Meta.is_wayland_compositor())
         return global.background_actor;
      let actor = global.get_window_actors().find( (a) => isWallpaperWindow(a.get_meta_window()) );
      return actor || null;
   }

   _onWindowMapped(actor) {
      if (actor !== this._target && isWallpaperWindow(actor.get_meta_window ? actor.get_meta_window() : null))
         this._setTarget(actor);
   }

   // The "destroy" signal's default handler (which destroys children) runs after this, so the dimmer is
   // taken off the dying window actor here before it would be destroyed along with it.
   _onTargetDestroyed(actor) {
      if (actor === this._target)
         this._setTarget(null);
   }

   // Move our effects and dimmer from the current target (if any) to target (may be null)
   _setTarget(target) {
      if (target === this._target)
         return;
      let old = this._target;
      if (old) {
         if (this._targetDestroyId) {
            old.disconnect(this._targetDestroyId);
            this._targetDestroyId = 0;
         }
         if (this._blurEffect && old.get_effect(BLUR_EFFECT_NAME) === this._blurEffect)
            old.remove_effect(this._blurEffect);
         if (old.get_effect(DESAT_EFFECT_NAME) === this._desatEffect)
            old.remove_effect(this._desatEffect);
         if (this._dimmer.get_parent() === old)
            old.remove_child(this._dimmer);
      }
      this._target = target;
      if (target) {
         if (target !== global.background_actor)
            this._targetDestroyId = target.connect("destroy", (self) => this._onTargetDestroyed(self));
         if (this._blurEnabled)
            target.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
         target.add_effect_with_name( DESAT_EFFECT_NAME, this._desatEffect );
         target.add_child(this._dimmer);
         debugMsg( `Desktop effects attached to ${target}` );
      }
   }

   // Make the target's blur effect match this._blurEffect/this._blurEnabled
   _syncBlurOnTarget() {
      if (!this._target)
         return;
      let curEffect = this._target.get_effect(BLUR_EFFECT_NAME);
      if (this._blurEnabled) {
         if (curEffect !== this._blurEffect) {
            if (curEffect)
               this._target.remove_effect(curEffect);
            this._target.add_effect_with_name( BLUR_EFFECT_NAME, this._blurEffect );
         }
      } else if (curEffect) {
         this._target.remove_effect(curEffect);
      }
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
         this._signalManager.connect(global.display, "notify::focus-window", () => this._onFocusChanged());
         this._connected = true;
      }
      // Switch to a new blur effect when the type changed (any other type keeps the current one, as before)
      let newEffect = this._blurEffect;
      if (blurType === BlurType.Simple && !(newEffect instanceof Clutter.BlurEffect)) {
         newEffect = new Clutter.BlurEffect();
      } else if (blurType === BlurType.Gaussian && !(newEffect instanceof GaussianBlur.GaussianBlurEffect)) {
         newEffect = new GaussianBlur.GaussianBlurEffect( {radius: radius, brightness: 1, width: 0, height: 0} );
      } else if (blurType === BlurType.MonteCarlo && !(newEffect instanceof MonteCarloBlur.MonteCarloBlurEffect)) {
         newEffect = new MonteCarloBlur.MonteCarloBlurEffect( { radius: radius, iterations: settings.montecarloIterations, prefer_closer_pixels: settings.montecarloPerferCloserPixels, use_base_pixel: settings.montecarloUseBasePixel, brightness: 1, width: 0, height: 0 } );
      } else if (blurType === BlurType.DualKawase && !(newEffect instanceof DualKawaseBlur.DualFilteringBlurEffect)) {
         newEffect = new DualKawaseBlur.DualFilteringBlurEffect( { radius: radius, brightness: 1, width: 0, height: 0 } );
      }
      if (newEffect !== this._blurEffect && this._target && this._blurEffect && this._target.get_effect(BLUR_EFFECT_NAME) === this._blurEffect)
         this._target.remove_effect(this._blurEffect);
      this._blurEffect = newEffect;
      this._blurEnabled = blurType !== BlurType.None && !!this._blurEffect;
      this._syncBlurOnTarget();
      // Adjust the effects
      if ((this._blurEffect instanceof GaussianBlur.GaussianBlurEffect || this._blurEffect instanceof MonteCarloBlur.MonteCarloBlurEffect || this._blurEffect instanceof DualKawaseBlur.DualFilteringBlurEffect) && this._blurEffect.radius != radius) {
         this._blurEffect.radius = radius;
      }
      // If Monte Carlo, update it's settings
      if (this._blurEffect instanceof MonteCarloBlur.MonteCarloBlurEffect) {
         this._blurEffect.iterations = settings.montecarloIterations;
         this._blurEffect.use_base_pixel = settings.montecarloUseBasePixel;
         this._blurEffect.prefer_closer_pixels = settings.montecarloPerferCloserPixels;
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
         if ((this._blurEffect instanceof GaussianBlur.GaussianBlurEffect || this._blurEffect instanceof MonteCarloBlur.MonteCarloBlurEffect || this._blurEffect instanceof DualKawaseBlur.DualFilteringBlurEffect) && this._blurEffect.radius != this._withFocusSettings.radius)
            this._blurEffect.radius = this._withFocusSettings.radius;
         let dimmerColor = this._getColor( this._withFocusSettings.blendColor, this._withFocusSettings.opacity );
         this._dimmer.set_background_color(dimmerColor);
         if (this._desatEffect.factor !== (100-this._withFocusSettings.saturation)/100)
            this._desatEffect.set_factor((100-this._withFocusSettings.saturation)/100);
         this._currentlyWithFocus = true;
         return;
      }
      if (this._currentlyWithFocus) {
         if ((this._blurEffect instanceof GaussianBlur.GaussianBlurEffect || this._blurEffect instanceof MonteCarloBlur.MonteCarloBlurEffect || this._blurEffect instanceof DualKawaseBlur.DualFilteringBlurEffect) && this._blurEffect.radius != this._withoutFocusSettings.radius)
            this._blurEffect.radius = this._withoutFocusSettings.radius;
         let dimmerColor = this._getColor( this._withoutFocusSettings.blendColor, this._withoutFocusSettings.opacity );
         this._dimmer.set_background_color(dimmerColor);
         if (this._desatEffect.factor !== (100-this._withoutFocusSettings.saturation)/100)
            this._desatEffect.set_factor((100-this._withoutFocusSettings.saturation)/100);
         this._currentlyWithFocus = false;
      }
   }

   _monitorsChanged() {
      debugMsg( `Monitor Changed: Scale ${global.ui_scale}, Width,Height ${global.screen_width},${global.screen_height}` );
      this._dimmer.set_width(global.screen_width);
      this._dimmer.set_height(global.screen_height);
   }

   destroy() {
      this._signalManager.disconnectAllSignals();
      Main.layoutManager.disconnect(this._monitorsChangedId);
      if (this._mapId) {
         global.window_manager.disconnect(this._mapId);
         this._mapId = 0;
      }
      this._setTarget(null);
      this._dimmer.destroy();
      this._dimmer = null;
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
      this._blurType = blurType;
      let useViewport = this._wantsViewport(blurType);
      this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, useViewport);
      this._background._blurCinnamonName = "Notifications";
      this._viewport = this._background._blurCinnamonViewport;
      if (this._viewport) this._viewport._blurCinnamonName = "Notifications";

      this._activeNotificationData = null;
      this.updateEffects();
   }

   _supportsDynamicBlur() {
      return true;
   }

   _getUniqueSettings() {
      return [settings.notificationOpacity, settings.notificationBlendColor, settings.notificationBlurType, settings.notificationRadius, settings.notificationSaturation];
   }

   updateEffects() {
      this._cancelShowTimeout()

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.notificationOverride);

      this._blurType = blurType;
      let wantsViewport = this._wantsViewport(blurType);
      if (!!this._viewport !== wantsViewport) {
         // Whether the shared notification background needs to be wrapped in a viewport (see
         // _createBackgroundAndEffects's useViewport) has changed - rebuild rather than migrate
         // the actor tree in place, the same way BlurApplications.updateEffects() rebuilds for the
         // equivalent transition. Corner radius is rebuilt at the same default-10 the constructor
         // uses - the block below re-derives the real radius from the notification's theme node
         // right after, exactly as it already did after construction.
         this._destroyBackgroundAndViewport(this._background, global.overlay_group);
         this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, wantsViewport);
         this._background._blurCinnamonName = "Notifications";
         this._viewport = this._background._blurCinnamonViewport;
         if (this._viewport) this._viewport._blurCinnamonName = "Notifications";
      } else if (this._viewport) {
         this._updateViewportEffects(this._background, this._viewport, opacity, blendColor, blurType, radius, saturation);
      } else {
         this._background = this._updateEffects(this._background, opacity, blendColor, blurType, radius, saturation);
      }

      if (this._activeNotificationData) {
        let {actor, button, table} = this._activeNotificationData;

         let themeNode = table.get_theme_node();
         if (themeNode) {
            // We are assuming that all corners have the same radius, hope that is true.
            let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
            this._updateViewportCornerRadius(this._background, this._viewport, (radius/*+6*/)/global.ui_scale, true, true);
         }
         if (settings.allowTransparentColorNotifications) {
            actor.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            button.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            table.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
         } else {
            actor.set_style( this._activeNotificationData.original_actor_style );
            button.set_style( this._activeNotificationData.original_button_style );
            table.set_style( this._activeNotificationData.original_table_style );
         }
         this._setClip(actor, this._background, table, this._viewport);
         this._fullscreen_changed()
         if ((isDynamicBlurType(this._blurType)) && !this._isDynamicEffectActive(this._background)) {
            this._createDynamicEffect(this._background);
         }
      } else {
         this._background.hide()
         if (this._viewport) this._viewport.hide();
      }
   }

   _showNotification() {
      // Call the original function then call the function to setup the effect
      blurNotificationsThis.original_showNotification.call(this);
      const allowFullscreen = this._showFullscreenNotifications || this._notification?.urgency === MessageTray.Urgency.CRITICAL;
      blurNotificationsThis._blurNotification.call(blurNotificationsThis, this._notificationBin, allowFullscreen);
   }

   _restoreNotificationStyle() {
      const data = this._activeNotificationData;
      if (!data) return;
      data.actor.set_style(data.original_actor_style);
      data.button.set_style(data.original_button_style);
      data.table.set_style(data.original_table_style);
   }

   _blurNotification(actor, showFullscreenNotifications) {
      this._cancelShowTimeout();
      this._signalManager.disconnectAllSignals();
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
         let themeNode = table.get_theme_node();
         if (themeNode) {
            // We are assuming that all corners have the same radius, hope that is true.
            let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
            this._updateViewportCornerRadius(this._background, this._viewport, (radius/*+6*/)/global.ui_scale, true, true);
         }

         // Save the current settings so we can restore it if need be
         const data = this._activeNotificationData;
         if (!data || data.actor !== actor || data.button !== button || data.table !== table) {
            this._restoreNotificationStyle();
            this._activeNotificationData = {
               actor, button, table, showFullscreenNotifications,
               original_actor_style: actor.get_style(),
               original_button_style: button.get_style(),
               original_table_style: table.get_style()
            };
         }
         this._activeNotificationData.showFullscreenNotifications = showFullscreenNotifications;

         if (settings.allowTransparentColorNotifications) {
            actor.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            button.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
            table.set_style( /*"border-radius: 0px;*/ "background-gradient-direction: vertical; background-gradient-start: transparent; " +
                             "background-gradient-end: transparent; background: transparent;" );
         }
      }
      // Resize the background to match the size of the notification window
      this._setClip(actor, this._background, table, this._viewport);
      // If Dynamic Blurring is enabled, create a workspace clone and add the clone to the background
      if (isDynamicBlurType(this._blurType)) {
         this._createDynamicEffect(this._background);
      }
      // The notification window size can change after being shown, so we need to adjust the background when that happens
      this._signalManager.connect(actor, "notify::allocation", () => this._setClip(actor, this._background, table, this._viewport) );
      if (!showFullscreenNotifications) {
         this._signalManager.connect(global.display, "in-fullscreen-changed", this._fullscreen_changed, this);
      }
      let monitor = Main.layoutManager.findMonitorForActor(this._background);
      let idx = Main.layoutManager.monitors.indexOf(monitor);
      if (showFullscreenNotifications || !global.display.get_monitor_in_fullscreen(idx)) {
         // Delay showing the blurred background until the notification tween is well underway
         const background = this._background;
         const activeData = this._activeNotificationData;
         this._showTimeoutId = Mainloop.timeout_add(this.animation_time * 1000, () => {
            this._showTimeoutId = 0;
            if (!activeData || this._activeNotificationData !== activeData ||
                this._background !== background || !actor.visible)
               return false;
            const monitor = Main.layoutManager.findMonitorForActor(background);
            const idx = Main.layoutManager.monitors.indexOf(monitor);
            if (showFullscreenNotifications || !global.display.get_monitor_in_fullscreen(idx)) {
               background.show();
               if (this._viewport) this._viewport.show();
            }
            return false;
         });
      }
   }

   _fullscreen_changed() {
      const data = this._activeNotificationData;
      let shouldShow = false;
      if (data && data.actor.visible) {
         const monitor = Main.layoutManager.findMonitorForActor(this._background);
         const idx = Main.layoutManager.monitors.indexOf(monitor);
         shouldShow = data.showFullscreenNotifications ||
            !global.display.get_monitor_in_fullscreen(idx);
      }
      if (shouldShow) {
         this._background.show();
         if (this._viewport) this._viewport.show();
      } else {
         this._background.hide();
         if (this._viewport) this._viewport.hide();
      }
   }

   _hideNotification() {
      blurNotificationsThis._destroyDynamicEffect(blurNotificationsThis._background);
      blurNotificationsThis._cancelShowTimeout();
      blurNotificationsThis._restoreNotificationStyle();
      blurNotificationsThis._activeNotificationData = null;
      blurNotificationsThis._signalManager.disconnectAllSignals();
      blurNotificationsThis._background.hide();
      if (blurNotificationsThis._viewport) blurNotificationsThis._viewport.hide();
      blurNotificationsThis.original_hideNotification.call(this);
   }

   _cancelShowTimeout() {
      if (this._showTimeoutId) {
         Mainloop.source_remove(this._showTimeoutId);
         this._showTimeoutId = 0;
      }
   }

   destroy() {
      // If there is an active notification, then restore it's original visual settings
      this._cancelShowTimeout();
      this._restoreNotificationStyle();
      this._activeNotificationData = null;
      this._signalManager.disconnectAllSignals();
      this._background.hide();
      if (this._viewport) this._viewport.hide();

      // Restore monkey patched functions and destroy the _background
      MessageTray.MessageTray.prototype._showNotification = this.original_showNotification;
      MessageTray.MessageTray.prototype._hideNotification = this.original_hideNotification;
      this._destroyBackgroundAndViewport(this._background, global.overlay_group);
      if (blurNotificationsThis === this) blurNotificationsThis = null;
   }
}

class BlurTooltips extends BlurBase {
   constructor() {
      super();
      this._signalManager = new SignalManager.SignalManager(null);
      this._reclipLaterId = 0;
      blurTooltipsThis = this; // Make "this" available to monkey patched functions

      // Monkey patch the Tooltip show and hide functions
      this.original_PanelItemTooltip_show = Tooltips.PanelItemTooltip.prototype.show;
      Tooltips.PanelItemTooltip.prototype.show = this._show_PanelItemTooltip;
      this.original_Tooltip_hide = Tooltips.Tooltip.prototype.hide;
      Tooltips.Tooltip.prototype.hide = this._hide_Tooltip;

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.tooltipsOverride);
      let useViewport = this._wantsViewport(blurType);
      this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, useViewport);
      this._background._blurCinnamonName = "Tooltips";
      this._viewport = this._background._blurCinnamonViewport;
      if (this._viewport) this._viewport._blurCinnamonName = "Tooltips";
   }

   _supportsDynamicBlur() {
      return true;
   }

   _getUniqueSettings() {
      return [settings.tooltipOpacity, settings.tooltipBlendColor, settings.tooltipBlurType, settings.tooltipRadius, settings.tooltipSaturation];
   }

   _blurTooltip(actor) {
      if (this._tooltipActor)
         this._unblurTooltip(this._tooltipActor);

      let [opacity, blendColor, blurType, radius, saturation] = this._getSettings(settings.tooltipsOverride);
      // Settings are re-read fresh on every show (tooltips are ephemeral, unlike the classes with a
      // live updateEffects() dispatcher), so a blur-type change since the last show is handled right
      // here: rebuild rather than migrate the actor tree in place whenever whether this background
      // needs to be wrapped in a viewport (see _createBackgroundAndEffects's useViewport) changes.
      let wantsViewport = this._wantsViewport(blurType);
      if (!!this._viewport !== wantsViewport) {
         this._destroyBackgroundAndViewport(this._background, global.overlay_group);
         this._background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, global.overlay_group, 10, true, true, wantsViewport);
         this._background._blurCinnamonName = "Tooltips";
         this._viewport = this._background._blurCinnamonViewport;
         if (this._viewport) this._viewport._blurCinnamonName = "Tooltips";
      } else if (this._viewport) {
         this._updateViewportEffects(this._background, this._viewport, opacity, blendColor, blurType, radius, saturation);
      } else {
         this._background = this._updateEffects(this._background, opacity, blendColor, blurType, radius, saturation);
      }
      this._background.hide();
      if (this._viewport) this._viewport.hide();
      // Make the tooltip transparent and remove the rounded corners
      this._originalStyle = actor.get_style();
      this._originalOpacity = actor.get_opacity();
      // Track the showing tooltip actor so we know which hide call to react to
      this._tooltipActor = actor;
      this._tooltipBlurType = blurType;
      this._tooltipReady = false;
      actor.set_opacity(0);

      try {
         if (settings.allowTransparentColorTooltips) {
            actor.set_style(
               "background-gradient-direction: vertical; background-gradient-start: transparent; " +
               "background-gradient-end: transparent;    background: transparent;"
            );
         }

         // Adapt to any future tooltip size changes
         //this._signalManager.connect(actor, 'notify::size', () => {this._setClip(actor);} );
         const reclip = () => this._queueTooltipReclip(actor);
         this._signalManager.connect(actor, "notify::allocation", reclip);
         this._signalManager.connect(actor, "notify::mapped", reclip);
         this._signalManager.connect(actor, "style-changed", reclip);
         this._signalManager.connect(actor, "notify::visible", () => {
            if (!actor.visible) this._unblurTooltip(actor);
         });
         this._signalManager.connect(actor, "destroy", () => this._unblurTooltip(actor, false));

         // When idle, make sure the clip is set right, sometimes it's wrong on the outset
         // Use BEFORE_REDRAW instead of generic idles so preparation precedes painting.
         this._queueTooltipReclip(actor);
      } catch (error) {
         this._unblurTooltip(actor);
         global.logError(error);
      }
   }

   _unblurTooltip(actor, restoreActor = true) {
      if (!actor || actor !== this._tooltipActor)
         return;

      this._cancelTooltipReclip();
      this._tooltipActor = null;
      this._signalManager.disconnectAllSignals();
      // In case we are using Dynamic effect, destroy it
      this._destroyDynamicEffect(this._background);
      this._background.hide();
      if (this._viewport) this._viewport.hide();
      if (restoreActor) {
         actor.set_style(this._originalStyle);
         actor.set_opacity(this._originalOpacity);
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

   _cancelTooltipReclip() {
      if (this._reclipLaterId) {
         Meta.later_remove(this._reclipLaterId);
         this._reclipLaterId = 0;
      }
   }

   _queueTooltipReclip(actor) {
      if (this._tooltipActor !== actor || this._reclipLaterId)
         return;

      const background = this._background;
      const viewport = this._viewport;
      const blurType = this._tooltipBlurType;
      let laterId = 0;
      const isCurrent = () => this._tooltipActor === actor &&
         this._background === background && this._viewport === viewport &&
         this._reclipLaterId === laterId;

      laterId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
         if (!isCurrent()) return false;
         try {
            if (!actor.visible) {
               this._unblurTooltip(actor);
               return false;
            }
            if (!actor.get_stage() || !actor.is_mapped())
               return true;

            const box = Cinnamon.util_get_transformed_allocation(actor);
            if (!isCurrent()) return false;
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            if (![box.x1, box.y1, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
               return true;

            const themeNode = actor.get_theme_node();
            if (themeNode) {
               // We are assuming that all corners have the same radius, hope that is true.
               const radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
               this._updateViewportCornerRadius(background, viewport,
                  (radius /*+6*/) / global.ui_scale, true, true);
            }
            // Clip the background subtracting the actors margins since in some cases not doing so makes the background too large
            // The allocated box already excludes those margins; do not subtract them again.
            this._applyBackgroundClip(background, viewport, box.x1, box.y1, width, height);
            if (!isCurrent()) return false;

            // If Dynamic Blurring is enabled, create a workspace clone and add the clone to the background
            if (isDynamicBlurType(blurType) && !this._isDynamicEffectActive(background))
               this._createDynamicEffect(background);

            background.show();
            if (viewport) viewport.show();
            if (isDynamicBlurType(blurType))
               cloneWindowsForBackgroundNow(background, background._blurCinnamonDesktopOnly);
            if (!isCurrent()) return false;

            if (!this._tooltipReady) {
               this._tooltipReady = true;
               actor.set_opacity(this._originalOpacity);
            }
            if (isCurrent()) this._reclipLaterId = 0;
            return false;
         } catch (error) {
            if (isCurrent()) this._unblurTooltip(actor);
            global.logError(error);
            return false;
         }
      });
      this._reclipLaterId = laterId;
   }

   destroy() {
      this._cancelTooltipReclip();
      if (this._tooltipActor)
         this._unblurTooltip(this._tooltipActor);

      // Undo Monkey patching the Tooltip show and hide functions
      Tooltips.PanelItemTooltip.prototype.show = this.original_PanelItemTooltip_show;
      Tooltips.Tooltip.prototype.hide = this.original_Tooltip_hide;

      this._signalManager.disconnectAllSignals();
      this._background.hide();
      if (this._viewport) this._viewport.hide();
      this._destroyBackgroundAndViewport(this._background, global.overlay_group);
      if (blurTooltipsThis === this) blurTooltipsThis = null;
   }
}

class BlurApplications extends BlurBase {
   constructor() {
      super();
      this._destroyed = false;
      this._windowRebuildIds = new Map();
      // BlurApplication global listeners
      this._signalManager = new SignalManager.SignalManager(null);
      this._signalManager.connect(global.screen, "window-added", this._windowAdded, this);
      this._signalManager.connect(global.display, "grab-op-begin", this._onWindowGrabbed, this);

      // WindowTracker so we can map windows to application
      this._windowTracker = Cinnamon.WindowTracker.get_default();

      // Wayland windows still waiting for their wm_class (see _windowAdded)
      this._windowsWaitingForWmClass = [];

      // Follow the corner radius the "Rounded Corners" extension gives each window (see
      // _connectRoundedCornersNotifier). Done before blurring the existing windows so they pick it up.
      this._roundedCornersPending = new Set();
      this._roundedCornersIdleId = 0;
      this._connectRoundedCornersNotifier();

      // Add a "Default window settings" if one does not exist
      let element = settings.windowInclusionList.find(isDefaultWindowSettings);
      if (!element) {
         let windowList = settings.settings.getValue("windows-inclusion-list");
         windowList.splice( 0, 0, {enabled:false, application:_(DEFAULT_WINDOW_SETTINGS), override: false, opacity:0, color:"rgb(0,0,0)", blurtype:BlurType.Gaussian, radius:10, saturation:100, corner_radius: 8, corner_top: true, corner_bottom: false  } );
         settings.settings.setValue("windows-inclusion-list", windowList);
      }

      // Check existing windows to see if any need to be blurred
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         this._windowAdded(null, windows[i]);
      }
   }

   _supportsDynamicBlur() {
      return true;
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
      // A native Wayland client sets its app_id (which becomes the wm_class) only after its MetaWindow
      // exists, so window-added usually arrives before there is a wm_class, and before
      // Cinnamon.WindowTracker can map the window to an app. _getSettings() would then match nothing in
      // the inclusion list and the window would never be blurred. Wait for the wm_class instead. X11
      // clients (including Xwayland) set WM_CLASS before mapping, so they're handled right away as before.
      if (!metaWindow.get_wm_class() && metaWindow.get_client_type() === Meta.WindowClientType.WAYLAND) {
         this._waitForWmClass(metaWindow);
         return;
      }
      this._blurWindow(metaWindow);
   }

   // Blur metaWindow once it has a wm_class. Handlers use the emitting MetaWindow argument rather than
   // closing over metaWindow, so neither holds a JS reference back to the object it's connected to.
   _waitForWmClass(metaWindow) {
      if (metaWindow._blurCinnamonWmClassId)
         return;
      metaWindow._blurCinnamonWmClassId = metaWindow.connect("notify::wm-class", (self) => {
         if (!self.get_wm_class())
            return;
         this._cancelWaitForWmClass(self);
         // Let Cinnamon.WindowTracker see the new wm_class first, so _getAppForWindow() finds the real app
         Mainloop.idle_add( () => {
            if (this._windowsWaitingForWmClass && self.get_compositor_private())
               this._blurWindow(self);
            return false;
         });
      });
      metaWindow._blurCinnamonUnmanagedId = metaWindow.connect("unmanaged", (self) => this._cancelWaitForWmClass(self));
      this._windowsWaitingForWmClass.push(metaWindow);
   }

   _cancelWaitForWmClass(metaWindow) {
      if (!metaWindow._blurCinnamonWmClassId)
         return;
      metaWindow.disconnect(metaWindow._blurCinnamonWmClassId);
      metaWindow.disconnect(metaWindow._blurCinnamonUnmanagedId);
      delete metaWindow._blurCinnamonWmClassId;
      delete metaWindow._blurCinnamonUnmanagedId;
      let idx = this._windowsWaitingForWmClass.indexOf(metaWindow);
      if (idx !== -1)
         this._windowsWaitingForWmClass.splice(idx, 1);
   }

   _queueWindowRebuild(metaWindow) {
      if (this._destroyed || this._windowRebuildIds.has(metaWindow)) return;
      const id = Mainloop.idle_add(() => {
         this._windowRebuildIds.delete(metaWindow);
         if (this._destroyed || !global.display.list_windows(0).includes(metaWindow))
            return false;
         const compositor = metaWindow.get_compositor_private();
         if (!compositor) return false;
         this._unblurWindow(compositor);
         if (!this._destroyed) this._blurWindow(metaWindow);
         return false;
      });
      this._windowRebuildIds.set(metaWindow, id);
   }

   _blurWindow(metaWindow) {
      // Get the windows compositor actor
      let compositor = metaWindow.get_compositor_private();
      // Nothing to blur yet, or already blurred (e.g. the wm_class wait and a settings change both got here)
      if (!compositor || compositor._blurCinnamonDataWindow)
         return;

      // Get the effect setting that should apply to Application windows
      let [enabled, window_opacity, opacity, blendColor, blurType, radius, saturation, corner_radius, top, bottom, titlebarsOnly] = this._getSettings(metaWindow);
      if (enabled) {
         // A signal manager for this window
         let signalManager = new SignalManager.SignalManager(null);

         // Setup the window opacity
         if (!window_opacity || window_opacity < 10 || window_opacity > 100 )
            window_opacity = 100;
         metaWindow.set_opacity(Math.round(window_opacity*2.55));

         // Plank will need a completely separate clipping path (_setClipPlank, driven by its own
         // "_PLANK_BACKGROUND_BLUR_REGION" property rather than a MetaWindow frame rect). The
         // backend in Plank has not been implmented in Plank in a way I can access here (yet).
         //
         // Dynamic blur reconstructs "what's really behind" this window out of clones of the
         // windows stacked below it, composited over the desktop background (see CloneManager).
         // Rather than run the blur shader over that whole full-screen composite and only crop the
         // *result* down to the visible rect afterwards (which is what background.set_clip() alone
         // would do), shrink the actual blurred surface itself down to just the clip rect via a
         // small "viewport" actor (see _createBackgroundAndEffects's useViewport). This keeps the
         // shader's edge sampling from ever reaching past the clip into un-cloned regions of the
         // screen - which is what let raw wallpaper bleed into the bottom of title-bar-only blurs
         // even when a window was really there - and it cuts the pixel count the blur has to
         // process from the whole monitor down to just the clip area, which is also a meaningful
         // GPU/CPU win.
         let useViewport = (isDynamicBlurType(blurType)) && metaWindow.get_wm_class() !== "Plank";

         // Create the effect(s) and add them to the window. background needs to sit at the bottom
         // of this window's compositor actor (index 0, below the window's own real content), and
         // viewport (when used) directly above it (index 1, still below that real content) - so
         // parenting is done via customParent rather than _createBackgroundAndEffects's generic
         // `parent` add_child fallback, which doesn't have index control.
         let background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, null, corner_radius, top, bottom, useViewport,
            (bg, vp) => {
               compositor.insert_child_at_index(bg, 0);
               if (vp) compositor.insert_child_at_index(vp, 1);
            });
         background._blurCinnamonName = "Window";
         let viewport = background._blurCinnamonViewport;
         if (viewport) viewport._blurCinnamonName = "Window";

         // Add blur data to the compositor while blurring is in effect
         compositor._blurCinnamonDataWindow = { effectThis: this, background: background, viewport: viewport, metaWindow: metaWindow, signalManager: signalManager, titlebarsOnly: titlebarsOnly };

         // Add listeners for this window's compositor
         signalManager.connect(compositor, "destroy", () => this._unblurWindow(compositor) );
         if (metaWindow.get_wm_class() == "Plank") {
            //log( `Found a "Plank" window / ${metaWindow.get_id()}` );
            signalManager.connect(compositor, "notify::allocation", () => this._setClipPlank(metaWindow) );
            signalManager.connect(compositor, "notify::mapped", () => this._setClipPlank(metaWindow) );
            signalManager.connect(metaWindow, "raised", () => this._setClipPlank(metaWindow) );
            // Resize / reposition the blurred actor
            this.lastBlurGeometryString = null;
            this._setClipPlank(metaWindow);
         } else {
            // Some windows are positioned after their first allocation, so keep the blur aligned
            // when either the compositor actor or the MetaWindow reports a position update.
            signalManager.connect(compositor, "notify::allocation", () => this._setClip(compositor) );
            signalManager.connect(metaWindow, "position-changed", () => this._setClip(compositor) );
            // Resize / reposition & make visible the blurred actor
            this._setClip(compositor);
         }

         if (isDynamicBlurType(blurType)) {
            this._createDynamicEffect(background, metaWindow);
         }
      }
   }

   // Get the window specific effect settings, or a disabled set of value when no settings exist
   _getSettings(metaWindow) {
      let titlebarsOnly = false;
      let enabled;
      let wmclass = metaWindow.get_wm_class();
      let winType = metaWindow.get_window_type();
      // We want to allow blurring for normal window, docks and desktop windows (i.e Conky). Not Plank: reading its blur
      // region with Gdk.property_get() (_getPlankBlurRegion()) segfaults cjs, so Cinnamon would crash on every start.
      if ((winType === Meta.WindowType.NORMAL || (settings.windowsTitlebarBlur && (winType === Meta.WindowType.DIALOG || winType === Meta.WindowType.MODAL_DIALOG)) ||
           winType === Meta.WindowType.DOCK || winType === Meta.WindowType.DESKTOP) && wmclass !== "Nemo-desktop" && wmclass !== "Plank")
      {
         let app = this._getAppForWindow(metaWindow);
         let appId = app ? app.get_id() : null;
         let element = settings.windowInclusionList.find( (element) => {if (element.application == appId || element.application == wmclass) {return true;}} );
         if (!element) {
            element = settings.windowInclusionList.find(isDefaultWindowSettings);
            if (!element.enabled && settings.windowsTitlebarBlur && this._getTitlebarHeight(metaWindow) > 0) {
               titlebarsOnly = true;
               enabled = true;
            } else {
               enabled = element.enabled;
            }
         } else {
            enabled = element.enabled;
         }
         if (element) {
            if (element.override) {
               return this._applyRoundedCornersRadius(metaWindow, [enabled, element.window_opacity, element.opacity, element.color, element.blurtype, element.radius, element.saturation, element.corner_radius, element.corner_top, element.corner_bottom, titlebarsOnly]);
            }
            return this._applyRoundedCornersRadius(metaWindow, [enabled, element.window_opacity, ...super._getSettings(false), element.corner_radius, element.corner_top, element.corner_bottom, titlebarsOnly ]);
         }
      }
      return [false, 100, 0, undefined, BlurType.None, 0, 100, 0, false, false, false]
   }

   // When the "Rounded Corners" extension is rounding metaWindow, use its corner radius in place of the
   // inclusion list's corner_radius/corner_top/corner_bottom so the blur's corners match the window's.
   // Rounded Corners reports [top, bottom]; an entry is null when it isn't rounding those corners, and
   // then the inclusion list's values are used for that pair (they describe the app's own, e.g. client
   // side decoration, corners). Windows it isn't rounding at all (excluded, maximized, fullscreen...)
   // have no _roundedCornersRadius, or [null, null], and keep the inclusion list's values entirely.
   // settingsArray is the _getSettings() result: [..., corner_radius(7), top(8), bottom(9), titlebarsOnly(10)]
   _applyRoundedCornersRadius(metaWindow, settingsArray) {
      if (!settings.windowsRoundedCornersSync || !this._roundedCornersNotifier || !this._roundedCornersNotifier.enabled)
         return settingsArray;
      let rcRadius = metaWindow._roundedCornersRadius;
      if (!Array.isArray(rcRadius) || rcRadius.length < 2)
         return settingsArray;
      let rcValue = (value) => {
         if (value === null || value === undefined)
            return null;
         let num = Number(value);
         return Number.isFinite(num) ? Math.max(0, num) : null;
      };
      let rcTop = rcValue(rcRadius[0]);
      let rcBottom = rcValue(rcRadius[1]);
      if (rcTop === null && rcBottom === null)
         return settingsArray;
      // Fall back to Blur Cinnamon's own settings for any corners Rounded Corners isn't rounding
      let ownRadius = Math.max(0, Number(settingsArray[7]) || 0);
      let topRadius    = (rcTop    !== null) ? rcTop    : (settingsArray[8] ? ownRadius : 0);
      let bottomRadius = (rcBottom !== null) ? rcBottom : (settingsArray[9] ? ownRadius : 0);
      // A title-bar-only blur ends where the window body starts, the window's bottom corners aren't part of it
      if (settingsArray[10])
         bottomRadius = 0;
      // The corner effect has a single radius for the corners it rounds, so if the top and bottom
      // radii differ (one from Rounded Corners, one from our settings) the larger one is used for both.
      settingsArray[7] = Math.max(topRadius, bottomRadius);
      settingsArray[8] = topRadius > 0;
      settingsArray[9] = bottomRadius > 0;
      return settingsArray;
   }

   // Follow the "Rounded Corners" extension through the notifier shared with it (see
   // getRoundedCornersNotifier()). It's there whatever order the extensions load in.
   _connectRoundedCornersNotifier() {
      let notifier = getRoundedCornersNotifier();
      this._roundedCornersNotifier = notifier;
      this._roundedCornersSignalIds = [
         notifier.connect("radius-changed", (emitter, metaWindow) => this._queueRoundedCornersUpdate(metaWindow)),
         notifier.connect("enabled",  () => this._queueRoundedCornersUpdate(null)),
         notifier.connect("disabled", () => this._queueRoundedCornersUpdate(null))
      ];
   }

   _disconnectRoundedCornersNotifier() {
      if (this._roundedCornersNotifier) {
         for (let id of this._roundedCornersSignalIds)
            this._roundedCornersNotifier.disconnect(id);
      }
      this._roundedCornersSignalIds = [];
      this._roundedCornersNotifier = null;
   }

   // Rounded Corners unrounds and re-rounds every window when its settings change, so collect the
   // windows and update each once from an idle callback. metaWindow null means every window.
   _queueRoundedCornersUpdate(metaWindow) {
      if (!this._roundedCornersPending)
         return;
      if (metaWindow) {
         this._roundedCornersPending.add(metaWindow);
      } else {
         global.display.list_windows(0).forEach( (win) => this._roundedCornersPending.add(win) );
      }
      if (!this._roundedCornersIdleId) {
         this._roundedCornersIdleId = Mainloop.idle_add( () => {
            this._roundedCornersIdleId = 0;
            this._processRoundedCornersUpdates();
            return false;
         });
      }
   }

   _processRoundedCornersUpdates() {
      if (!this._roundedCornersPending)
         return;
      let pending = Array.from(this._roundedCornersPending);
      this._roundedCornersPending.clear();
      let windows = global.display.list_windows(0);
      for (let metaWindow of pending) {
         if (!windows.includes(metaWindow))
            continue;
         let compositor = metaWindow.get_compositor_private();
         if (!compositor || !compositor._blurCinnamonDataWindow)
            continue;
         let [enabled, , , , , , , corner_radius, top, bottom] = this._getSettings(metaWindow);
         if (enabled)
            this._updateWindowCorners(compositor, corner_radius, top, bottom);
      }
   }

   // Apply a corner radius to a blurred window and re-sync its clip (a newly created corner effect
   // needs its clip set, and a viewport's margin may have changed)
   _updateWindowCorners(compositor, corner_radius, top, bottom) {
      let data = compositor._blurCinnamonDataWindow;
      if (!data)
         return;
      let effectsActor = data.viewport || data.background;
      let cornerEffect = this._getCornerEffect(effectsActor);
      if (cornerEffect) {
         cornerEffect.corners_top = top;
         cornerEffect.corners_bottom = bottom;
      }
      this._updateCornerRadius(effectsActor, corner_radius, top, bottom);
      this._setClip(compositor);
   }

   // Height of the Muffin-drawn titlebar, or 0 when Muffin draws no frame. Client-side decorated windows
   // (all native Wayland clients, and CSD/headerbar apps on X11) have decorated == false, and for them
   // frame_rect_to_client_rect() grows the rect outward by the client's shadow extents, so the raw
   // difference would be negative.
   _getTitlebarHeight(metaWindow) {
      if (!metaWindow.decorated)
         return 0;
      let rect = metaWindow.get_frame_rect();
      let clientRect = metaWindow.frame_rect_to_client_rect(rect);
      return Math.max(0, clientRect.y - rect.y);
   }

   _setClip(compositor) {
      if (compositor._blurCinnamonDataWindow) {
         let data = compositor._blurCinnamonDataWindow;
         // When wrapped in a viewport (see _createBackgroundAndEffects's useViewport), data.background
         // stays a genuinely shown/positioned/clipped actor in its own right - not just a clone source - so
         // it needs to be shown/hidden in lockstep with the viewport that's painted on top of it.
         if (compositor.get_transition("x") || compositor.get_transition("y") ) {
            data.background.hide();
            if (data.viewport) data.viewport.hide();
            return;
         } else {
            data.background.show();
            if (data.viewport) data.viewport.show();
         }
         let rect = data.metaWindow.get_frame_rect();

         // If the window is shaded or the blur is for the titlebar only, then we only want to blur under the title bar.
         if (data.metaWindow.is_shaded() || data.titlebarsOnly) {
            //let clientRect = data.metaWindow.frame_rect_to_client_rect(rect);
            rect.height = this._getTitlebarHeight(data.metaWindow); //clientRect.y - rect.y;
            if (rect.height <= 0) {
               //rect.height = 3;        // Hack, bad things happen if we set the height to 0 or less
               // Hide the background (and viewport) since we can't determine the title bar height
               data.background.hide();
               if (data.viewport) data.viewport.hide();
               return;
            }
         }
         // Set the background position to the displays 0,0 based on the compositor's position and the shadow size
         //let windowShadowSizeX = (compositor.get_width() - rect.width) / 2;
         //let windowShadowSizeY = (compositor.get_height() - rect.height) / 2;
         //data.background.set_position( -rect.x+windowShadowSizeX, -rect.y+windowShadowSizeY );

         // Set the background position to the displays 0,0 based on it's transformed position and it's current position
         //let [rx,ry] = data.background.get_transformed_position();
         //let [x,y] = data.background.get_position();
         //data.background.set_position( x-rx, y-ry );
         // The blur background lives inside the window compositor actor, so it must be
         // offset by the compositor's stage position, not by its own previous transformed
         // position. Otherwise the blur and the real window can drift apart.
         // Use the compositor's *untransformed* position (see _stagePosition()), not
         // get_transformed_position(): background is in the compositor's local, pre-scale
         // coordinates and inherits whatever scale the compositor has. Burn-My-Windows scales the
         // window actor around its center while it opens/closes, and resets the scale to 1 at the
         // end without any allocation change, so a scaled transformed position computed here
         // mid-animation left the blur offset until the window was next moved.
         let [rx, ry] = _stagePosition(compositor);

         // data.background is repositioned to global (0,0) exactly as it always was, whether or not
         // it's wrapped in a viewport - it stays a real, normally-shown/mapped actor either way.
         data.background.set_position(-rx, -ry);

         if (data.viewport) {
            // Wrapped: the corner/blur/desaturate effects live on the viewport now, not on
            // background. Both actors are sized/clipped to the *expanded* rect - the visible rect grown
            // by the blur's sampling margin (see getViewportMargin()) - so the blur always has real,
            // correctly cloned content to sample right up to the visible edge. This is also the rect
            // CloneManager uses to decide which windows to clone (see getBackgroundClip()).
            data.viewport._blurCinnamonSamplingRect = [rect.x, rect.y, rect.width, rect.height];

            let margin = getViewportMargin(data.viewport);
            let [ex, ey, ew, eh] = getExpandedRect(rect.x, rect.y, rect.width, rect.height, margin);
            data.background.set_clip( ex, ey, ew, eh );

            // Title-bar-only blur: the margin below the title bar lies over this window's own opaque body,
            // and Muffin doesn't paint the parts of the windows underneath that it hides - not even through
            // our clones of them - so the blur would sample bare wallpaper there. Stop this window from
            // culling the windows below it (see NoCullEffect) so the margin has real content.
            this._setCullsWindowsBelow(compositor, !data.titlebarsOnly);

            // Size/position the viewport to the expanded rect (converted from global/stage coordinates
            // to compositor-local, since the viewport is a child of the compositor), and offset its
            // clone of the background so the matching crop of the background/window-clone composite
            // lands inside it. Painted directly on top of background (see _blurWindow's z-order);
            // background itself is transparent (see _createBackgroundAndEffects) so only viewport shows.
            data.viewport.set_position(ex - rx, ey - ry);
            data.viewport.set_size(ew, eh);
            data.viewport._blurCinnamonSceneClone.set_position(-ex, -ey);

            let cornerEffect = this._getCornerEffect(data.viewport);
            if (cornerEffect) {
               // Local to the viewport, and sized to exactly the visible rect - cuts the margin away
               // again (corner.glsl's padded mapping means an exact rect-sized clip covers it edge to
               // edge with no inset needed; see the "un-blurred strip" fix this replaces).
               cornerEffect.set_viewport_clip([rect.x - ex, rect.y - ey, rect.width, rect.height]);
            }
            this._setLiquidGlassRect(data.viewport, [rect.x - ex, rect.y - ey, rect.width, rect.height]);
         } else {
            let cornerEffect = this._getCornerEffect(data.background);
            if (cornerEffect) {
               cornerEffect.clip = [rect.x+2, rect.y+2, rect.width-3, rect.height-3];
            } else {
               data.background.set_clip( rect.x, rect.y, rect.width, rect.height );
            }
         }
         if (cloneManager)
            cloneManager.backgroundClipChanged(data.background);
      }
   }

   // Add or remove the NoCullEffect on a window actor (see NoCullEffect)
   _setCullsWindowsBelow(compositor, culls) {
      let effect = compositor.get_effect(NOCULL_EFFECT_NAME);
      if (culls && effect) {
         compositor.remove_effect(effect);
      } else if (!culls && !effect) {
         compositor.add_effect_with_name(NOCULL_EFFECT_NAME, new NoCullEffect());
      }
   }

   _unblurWindow(compositor) {
      if (compositor._blurCinnamonDataWindow) {
         let data = compositor._blurCinnamonDataWindow;
         data.signalManager.disconnectAllSignals();
         this._setCullsWindowsBelow(compositor, true);
         this._destroyDynamicEffect(data.background);
         // Strip every effect (background's own, and viewport's when wrapped - see
         // BlurBase.destroy()) one at a time *before* destroying either actor, so a multi-pass
         // blur effect's own reentrant sub-effect cleanup never races Clutter's own actor-destroy
         // teardown of the same effects list.
         super.destroy(data.background);
         if (data.viewport) {
            // Destroy the viewport (and its clone of data.background) before destroying
            // data.background itself, so nothing is left holding a clone of a destroyed source.
            compositor.remove_child(data.viewport);
            data.viewport.destroy();
            // Clear the back-reference to the now-destroyed viewport - leaving it in place
            // serves no purpose once destroyed and only adds another edge for a JS-side
            // reference-cycle to route through.
            data.background._blurCinnamonViewport = null;
         }
         compositor.remove_child(data.background);
         data.background.destroy();
         data.metaWindow.set_opacity(255);
         compositor._blurCinnamonDataWindow = undefined;
      }
   }

   // This is a work-around for some issues with Dynamic Blurring after switching workspaces or
   // restoring from minimized when a panel has dynamic blur effects applied
   reapplyEffects(metaWindow=null) {
      if (metaWindow) {
         let compositor = metaWindow.get_compositor_private();
         let data = compositor._blurCinnamonDataWindow;
         if (data) {
            debugMsg( "Reapplying effects to window" );
            this._queueWindowRebuild(metaWindow)
         }
      } else {
         // Go through all windows and remove then reapply effects
         let windows = global.display.list_windows(0);
         for (let i = 0; i < windows.length; i++) {
            let compositor = windows[i].get_compositor_private();
            let data = compositor._blurCinnamonDataWindow;
            if (data) {
              debugMsg( "Reapplying effects to window" );
              this._queueWindowRebuild(windows[i]);
            }
         }
      }
   }

   updateEffects() {
      // Go through all windows and update/apply/remove effects
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         let compositor = windows[i].get_compositor_private();
         let data = compositor._blurCinnamonDataWindow;
         let [enabled, window_opacity, opacity, blendColor, blurType, radius, saturation, corner_radius, top, bottom, titlebarsOnly] = this._getSettings(windows[i]);
         if (compositor._blurCinnamonDataWindow) {
            if (!enabled) {
               this._unblurWindow(compositor);
            } else {
               let wantsViewport = (isDynamicBlurType(blurType)) && windows[i].get_wm_class() !== "Plank";
               if (this._needsBackgroundRebuild(data.background, blurType, wantsViewport)) {
                  this._queueWindowRebuild(windows[i]);
                  continue;
               }
               data.titlebarsOnly = titlebarsOnly;
               let effectsActor = data.viewport || data.background;
               if (data.viewport) {
                  this._updateViewportEffects(data.background, data.viewport, opacity, blendColor, blurType, radius, saturation);
               } else {
                  this._updateEffects(data.background, opacity, blendColor, blurType, radius, saturation);
               }
               // Also re-syncs the clip: the blur's sampling reach - and so the viewport's margin -
               // may have changed along with the blur type or radius.
               this._updateWindowCorners(compositor, corner_radius, top, bottom);
               if (!window_opacity || window_opacity < 10 || window_opacity > 100 )
                  window_opacity = 100;
               windows[i].set_opacity(Math.round(window_opacity*2.55));
               if (wantsViewport && !this._isDynamicEffectActive(data.background)) {
                  this._createDynamicEffect(data.background, data.metaWindow);
               }
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

   // ---- Window picker ----
   // Started from the "Pick a window to blur" button in the settings dialog. The user clicks the window
   // they mean and its application is added to the window inclusion list. While picking, a transparent
   // modal overlay covers the screen: it highlights the window under the pointer and names it, a left
   // click picks it, and Esc, any other button or a 30 second timeout cancels.
   pickWindow() {
      if (this._picker)
         return;
      let overlay = new St.Widget({ reactive: true, can_focus: true, x: 0, y: 0,
                                    width: global.screen_width, height: global.screen_height });
      let highlight = new St.Widget({ visible: false,
         style: "border: 2px solid rgba(53,132,228,1); background-color: rgba(53,132,228,0.2); border-radius: 6px;" });
      let highlightLabel = new St.Label({ x: 10, y: 10,
         style: "background-color: rgba(0,0,0,0.8); color: white; padding: 4px 10px; border-radius: 4px; font-weight: bold;" });
      highlight.add_child(highlightLabel);
      overlay.add_child(highlight);
      let hint = new St.Label({ text: _("Click a window to add its application to the Blur Cinnamon window list.  Esc or right-click to cancel."),
         style: "background-color: rgba(0,0,0,0.85); color: white; padding: 10px 18px; border-radius: 8px; font-size: 11pt;" });
      overlay.add_child(hint);
      Main.uiGroup.add_child(overlay);
      Main.uiGroup.set_child_above_sibling(overlay, null);
      let monitor = Main.layoutManager.primaryMonitor;
      let [, hintWidth] = hint.get_preferred_width(-1);
      hint.set_position(monitor.x + Math.floor((monitor.width - hintWidth) / 2), monitor.y + 60);

      if (!Main.pushModal(overlay)) {
         overlay.destroy();
         Main.notify(metaData.name, _("Couldn't start the window picker. Close any open menus and try again."));
         return;
      }
      this._picker = { overlay: overlay, highlight: highlight, label: highlightLabel, window: null, timeoutId: 0 };
      overlay.grab_key_focus();
      if (Cinnamon.Cursor && Cinnamon.Cursor.CROSSHAIR !== undefined)
         global.set_cursor(Cinnamon.Cursor.CROSSHAIR);

      overlay.connect("motion-event", (actor, event) => {
         let [x, y] = event.get_coords();
         this._pickerHover(x, y);
         return Clutter.EVENT_STOP;
      });
      overlay.connect("button-press-event", () => Clutter.EVENT_STOP);
      overlay.connect("scroll-event", () => Clutter.EVENT_STOP);
      // Act on the release, so it doesn't reach the window underneath once the grab is gone
      overlay.connect("button-release-event", (actor, event) => {
         if (event.get_button() === 1) {
            let [x, y] = event.get_coords();
            let metaWindow = this._windowAtPoint(x, y);
            if (metaWindow) {   // a click on the desktop or a panel just keeps picking
               this._endPick();
               this._addWindowToList(metaWindow);
            }
         } else {
            this._endPick();
         }
         return Clutter.EVENT_STOP;
      });
      overlay.connect("key-press-event", (actor, event) => {
         if (event.get_key_symbol() === Clutter.KEY_Escape)
            this._endPick();
         return Clutter.EVENT_STOP;
      });
      // Never leave the desktop grabbed if something goes wrong
      this._picker.timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 30, () => {
         if (this._picker)
            this._picker.timeoutId = 0;
         this._endPick();
         return GLib.SOURCE_REMOVE;
      });

      let [px, py] = global.get_pointer();
      this._pickerHover(px, py);
   }

   _endPick() {
      let picker = this._picker;
      if (!picker)
         return;
      this._picker = null;
      if (picker.timeoutId)
         GLib.source_remove(picker.timeoutId);
      global.unset_cursor();
      Main.popModal(picker.overlay);
      picker.overlay.destroy();
   }

   // Highlight the window under the pointer and show the name it would be added as
   _pickerHover(x, y) {
      let picker = this._picker;
      if (!picker)
         return;
      let metaWindow = this._windowAtPoint(x, y);
      if (metaWindow === picker.window)
         return;
      picker.window = metaWindow;
      if (!metaWindow) {
         picker.highlight.hide();
         return;
      }
      let rect = metaWindow.get_frame_rect();
      picker.highlight.set_position(rect.x, rect.y);
      picker.highlight.set_size(rect.width, rect.height);
      picker.label.text = this._getWindowListName(metaWindow) || _("(unknown application)");
      picker.highlight.show();
   }

   // The topmost visible window on the current workspace whose frame contains (x, y), or null.
   // Docks (i.e. Plank) and desktop windows (i.e. Conky) can be blurred so they can be picked too,
   // but not the Nemo desktop or the wallpaper window, which cover the whole screen.
   _windowAtPoint(x, y) {
      let workspace = (global.workspace_manager || global.screen).get_active_workspace();
      let types = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG, Meta.WindowType.UTILITY,
                   Meta.WindowType.DOCK, Meta.WindowType.DESKTOP];
      let windows = global.display.list_windows(0).filter(w =>
         types.includes(w.get_window_type()) && !w.minimized && w.showing_on_its_workspace() &&
         w.get_wm_class() !== "Nemo-desktop" && !isWallpaperWindow(w) &&
         (w.is_on_all_workspaces() || w.get_workspace() === workspace));
      windows = global.display.sort_windows_by_stacking(windows);   // bottom to top
      for (let i = windows.length - 1; i >= 0; i--) {
         let rect = windows[i].get_frame_rect();
         if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height)
            return windows[i];
      }
      return null;
   }

   // The name a picked window is added to the list as: its desktop file id, or failing that its WM_CLASS
   _getWindowListName(metaWindow) {
      let app = this._getAppForWindow(metaWindow);
      if (app && !app.is_window_backed())
         return app.get_id();
      return metaWindow.get_wm_class() || null;
   }

   // Add the window's application to the inclusion list, or enable its entry if it's there but disabled
   _addWindowToList(metaWindow) {
      // The blur is drawn behind the window, so it can't be seen through an opaque one
      let note = "\n\n" + _("Note: The blur is only visible behind transparent windows. If this application doesn't support transparency, set its \"Opacity\" in the window list to less than 100.");
      let name = this._getWindowListName(metaWindow);
      if (!name) {
         Main.notify(metaData.name, _("Unable to determine the application or the WM_CLASS of that window, therefore Blur Cinnamon effects can not be applied to it."));
         return;
      }
      let app = this._getAppForWindow(metaWindow);
      let ids = [metaWindow.get_wm_class(), app ? app.get_id() : null].filter(id => id);
      let windowList = settings.settings.getValue("windows-inclusion-list");
      let existing = windowList.find(element => ids.includes(element.application));
      if (existing && existing.enabled) {
         Main.notify(metaData.name, _("\"%s\" is already in the window list.").format(existing.application) + note);
         return;
      } else if (existing) {
         existing.enabled = true;
         settings.settings.setValue("windows-inclusion-list", windowList);
         Main.notify(metaData.name, _("Enabled \"%s\" in the window list.").format(existing.application) + note);
      } else {
         windowList.push( {enabled:true, application:name, window_opacity:100, override: true, opacity:0, color:"rgb(0,0,0)", blurtype:BlurType.Gaussian, radius:10, saturation:100, corner_radius: 10, corner_top: true, corner_bottom: false } );
         settings.settings.setValue("windows-inclusion-list", windowList);
         Main.notify(metaData.name, _("Added \"%s\" to the window list. Adjust its effect settings in the table.").format(name) + note);
      }
   }

   _getPlankBlurRegion(xid) {
      let display = Gdk.Display.get_default();
      let gdkWindow = GdkX11.X11Window.foreign_new_for_display(display, xid);
      if (!gdkWindow)
         return null;

      let propAtom = Gdk.Atom.intern('_PLANK_BACKGROUND_BLUR_REGION', false);
      let typeAtom = Gdk.Atom.intern('CARDINAL', false);

      // length is in 32-bit units for a CARDINAL request; 8 values is plenty, ask for more to be safe
      let [success, actualType, actualFormat, data] =
         //gdkWindow.property_get(propAtom, typeAtom, 0, 32 /* longs */, false);
         Gdk.property_get(gdkWindow, propAtom, typeAtom, 0, 32 /* longs */, false);

      if (!success || !data || actualFormat !== 32)
         return null;

      // `data` is the raw byte buffer GJS hands back for the property.
      // Wrap it in a DataView so we can read native-endian uint32s out of it.
      let bytes = Uint8Array.from(data); // ensure it's a plain byte array
      let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      let littleEndian = true; // true on x86/x86_64/ARM Linux (native host order)
      let values = [];
      for (let i = 0; i + 4 <= view.byteLength; i += 4)
         values.push(view.getUint32(i, littleEndian));

      if (values.length < 8)
         return null;

      return {
         x: values[0],
         y: values[1],
         width: values[2],
         height: values[3],
         radiusTopLeft: values[4],
         radiusTopRight: values[5],
         radiusBottomLeft: values[6],
         radiusBottomRight: values[7],
      };
   }

   _setClipPlank(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      let data = compositor._blurCinnamonDataWindow;
      if (!compositor.is_mapped()) {
         log( "plank is currently unmapped" );
         if (data)
            data.background.hide();
         return;
      }
      try {
         let xid = metaWindow.get_xwindow();
         let result = this._getPlankBlurRegion(xid);
         if (result) {
            let cornerEffect = this._getCornerEffect(data.background);
            if (cornerEffect) {
               log( `setclip using corner effect: ${result.x}, ${result.y}, ${result.width}, ${result.height}` );
               cornerEffect.clip = [result.x+2, result.y+2, result.width-3, result.height-3];
               this._updateCornerRadius(data.background, radius);
            } else {
               log( `setClip using background: ${result.x}, ${result.y}, ${result.width}, ${result.height}` );
               data.background.set_clip( result.x, result.y, result.width, result.height );
            }
            if (cloneManager)
               cloneManager.backgroundClipChanged(data.background);
         }
         /*
         let command = `xprop -id ${xid} _PLANK_BACKGROUND_BLUR_REGION`;
         log( `running: ${command}` );
         let [success, stdout] = GLib.spawn-command-line-sync(command);  // This call is considered unsafe by Cinnamon (because it's sync and code could run for a long time)
         log( `stdout: ${new TextDecoder().decode(stdout)}` );
         if (success && stdout) {
            log( "Got xprop" );
            let output = new TextDecoder().decode(stdout); //stdout.toString().trim();
            let match = output.match(/=\s*(.+)$/m);
            if (match) {
               log( "It's a match" );
               let geometryString = match[1].trim();
               // Only proceed if there is some change to apply
               if (geometryString == this.lastBlurGeometryString) {
                  log( "No change" );
                  return;
               }
               // Update cache with the new unique string
               this.lastBlurGeometryString = geometryString;
               // Split the output into 4 integers
               let blurData = geometryString.split(',').map(num => parseInt(num.trim(), 10));
               if (blurData.length >= 5) {
                  if (data) {
                     let [x, y, width, height, radius] = blurData;
                     log( `got 4 ints: ${x}, ${y}, ${width}, ${height}, ${radius}` );
                     data.background.show();
                     let cornerEffect = this._getCornerEffect(data.background);
                     if (cornerEffect) {
                        log( `setclip using corner effect: ${x}, ${y}, ${width}, ${height}` );
                        cornerEffect.clip = [x+2, y+2, width-3, height-3];
                        this._updateCornerRadius(data.background, radius);
                     } else {
                        log( `setClip using background: ${x}, ${y}, ${width}, ${height}` );
                        data.background.set_clip( x, y, width, height );
                     }
                     if (cloneManager)
                        cloneManager.backgroundClipChanged(data.background);
                  }
               }
            }
         }
         */
      } catch (e) {
         log( `Got exception:\n${e}` );
      }
   }

   destroy() {
      this._destroyed = true;
      for (const id of this._windowRebuildIds.values()) {
          Mainloop.source_remove(id);
      }
      this._windowRebuildIds.clear();
      this._endPick();
      this._signalManager.disconnectAllSignals();
      this._windowsWaitingForWmClass.slice().forEach( (metaWindow) => this._cancelWaitForWmClass(metaWindow) );
      this._windowsWaitingForWmClass = null;
      this._disconnectRoundedCornersNotifier();
      if (this._roundedCornersIdleId) {
         Mainloop.source_remove(this._roundedCornersIdleId);
         this._roundedCornersIdleId = 0;
      }
      this._roundedCornersPending = null;
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

      // BlurFocusEffect deliberately does NOT use viewport-wrapping as it would prevent the blur
      // effect from bleeding over the windows borders which is how this "glow" effect is acheived.
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
         this._addEffect(window);
      }
   }

   _addEffect(window) {
      this._focusedWindow = window;
      this._focusedCompositor = window.get_compositor_private();
      this._focusedCompositor.insert_child_at_index(this._background, 0);
      this._signalManager.connect(this._focusedCompositor, "notify::allocation", () => this._setClip() );
      this._signalManager.connect(window, "position-changed", () => this._setClip() );
      this._signalManager.connect(window, "unmanaging", () => this._removeEffect() );
      this._focusedCompositor._blurCinnamonDataFocusEffect = { effectThis: this };
      this._setClip();
      this._background.show();
   }

   _removeEffect() {
      this._background.hide();
      if (this._focusedCompositor) {
         this._signalManager.disconnect("notify::allocation", this._focusedCompositor );
         this._signalManager.disconnect("position-changed", this._focusedWindow );
         this._signalManager.disconnect("unmanaging", this._focusedWindow );
         this._focusedCompositor.remove_child(this._background);
         this._focusedCompositor._blurCinnamonDataFocusEffect = undefined;
      }
      this._focusedWindow = undefined;
      this._focusedCompositor = undefined;
   }

   _setClip() {
      if (this._focusedCompositor) {
         if (/*this._focusedCompositor.__animationInfo ||*/ this._focusedCompositor.get_transition("x") || this._focusedCompositor.get_transition("y") ) {
            this._background.hide();
            //if (this._focusedCompositor.__animationInfo)
            //   Mainloop.idle_add( () => this._setClip() );
            return;
         } else {
            this._background.show();
         }

         let rect = this._focusedWindow.get_frame_rect();
         // Set the background position to the displays 0,0 based on the compositor's position and the shadow size
         //let windowShadowSizeX = (compositor.get_width() - rect.width) / 2;
         //let windowShadowSizeY = (compositor.get_height() - rect.height) / 2;
         //data.background.set_position( -rect.x+windowShadowSizeX, -rect.y+windowShadowSizeY );

         // Set the background position to the displays 0,0 based on it's transformed position and it's current position
         //let [rx,ry] = this._background.get_transformed_position();
         //let [x,y] = this._background.get_position();
         //this._background.set_position( x-rx, y-ry );
         // Keep the focus background aligned with the compositor actor in stage coordinates.
         // Untransformed position, see BlurApplications._setClip() (window scale animations)
         let [rx, ry] = _stagePosition(this._focusedCompositor);
         this._background.set_position(-rx, -ry);

         // Deliberately NOT viewport-wrapped and NOT hard-clipped via background.set_clip() either
         // (see the constructor's comment) - the corner effect's own `clip` uniform is a purely
         // visual, shader-side mask, not a real geometric confinement of the blur's input FBO, so
         // the blur (running on this genuinely full-screen background) can still sample and spill
         // a few pixels past this rect for the glow effect.
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
      this._removeEffect();
      this._signalManager.disconnectAllSignals();
      this._background.destroy();
   }
}

class BlurDesklets extends BlurBase {
   constructor() {
      super();
      // global listeners
      //this._signalManager = new SignalManager.SignalManager(null);
      this._destroyed = false;
      this._deskletIdleIds = new Map();
      blurDeskletsThis = this; // Make "this" available to monkey patched functions

      this.original_createDesklets = DeskletManager._createDesklets;
      DeskletManager._createDesklets = this._createDesklets;
      this.original_unloadDesklet = DeskletManager._unloadDesklet;
      DeskletManager._unloadDesklet = this._unloadDesklet;

      this.origianl_raise = DeskletManager.DeskletContainer.prototype.raise;
      DeskletManager.DeskletContainer.prototype.raise = this._raise;
      this.origianl_lower = DeskletManager.DeskletContainer.prototype.lower;
      DeskletManager.DeskletContainer.prototype.lower = this._lower;

      // Make sure all the Desklets are defined in the deskletList
      let desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet && uuid) {
            this._addDeskletToList(desklet);
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

      // See if any desklets need to be blurred now that we have the desklets-list all setup right
      desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet && uuid) {
            this._blurDesklet(desklet);
         }
      }
   }

   _supportsDynamicBlur() {
      return true;
   }

   // Monkey patched function to raise the desklets
   _raise() {
      blurDeskletsThis.origianl_raise.call(this);
      blurDeskletsThis._deskletsRaised.call(blurDeskletsThis);
   }

   _deskletsRaised() {
      let desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet && desklet._blurCinnamonBackground) {
            let blurSettings = desklet._blurCinnamonBackground._blurCinnamonSettings;
            if(isDynamicBlurType(blurSettings[3])) {
               this._raiseDeskletDynamicBackground(desklet._blurCinnamonBackground);
            }
         }
      }
   }

   // Monkey patched function to lower the deskelts
   _lower() {
      blurDeskletsThis.origianl_lower.call(this);
      blurDeskletsThis._deskletsLowered.call(blurDeskletsThis);
   }

   _deskletsLowered() {
      let desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet && desklet._blurCinnamonBackground) {
            let blurSettings = desklet._blurCinnamonBackground._blurCinnamonSettings;
            if(isDynamicBlurType(blurSettings[3])) {
               this._lowerDeskletDynamicBackground(desklet._blurCinnamonBackground);
            }
         }
      }
   }

   _blurDesklet(desklet) {
      if (this._destroyed || desklet._blurCinnamonBackground) return;
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
      let deskletSettings = this._getDeskletSettings(desklet);
      let [enabled, opacity, blendColor, blurType, radius, saturation] = deskletSettings;
      if (enabled) {
         let useViewport = this._wantsViewport(blurType);
         let background = this._createBackgroundAndEffects(opacity, blendColor, blurType, radius, saturation, null, cornerRadius, topRadius!==0, bottomRadius!==0, useViewport,
            (bg, vp) => {
               global.desklet_container.insert_child_at_index(bg, 0);
               if (vp) global.desklet_container.insert_child_at_index(vp, 1);
            });
         background._blurCinnamonName = "Desklet";
         desklet._blurCinnamonBackground = background;
         background._blurCinnamonSettings = deskletSettings;
         let viewport = background._blurCinnamonViewport;
         if (viewport) viewport._blurCinnamonName = "Desklet";
         this._setClip(desklet);
         background.show();
         if (viewport) viewport.show();
         desklet._blurCinnamonSignalManager = new SignalManager.SignalManager(null);
         desklet._blurCinnamonSignalManager.connect(desklet.actor, "notify::allocation", () => this._setClip(desklet) );
         //desklet._blurCinnamonSignalManager.connect(desklet, "destroy", () => this._deskletRemoved(desklet) );
         if (isDynamicBlurType(blurType)) {
            this._createDynamicEffect(background, global.desklet_container, true);
         }
      }
   }

   // This is a monkey patched version of DeskletManager._createDesklets()
   // This is done so we know when new Desklets are added.
   _createDesklets(extension, deskletDefinition) {
      const owner = blurDeskletsThis;
      let desklet = owner.original_createDesklets(extension, deskletDefinition);
      owner._addDeskletToList(desklet);
      owner._queueDeskletBlur(desklet);
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

   _queueDeskletBlur(desklet) {
      if (this._destroyed || this._deskletIdleIds.has(desklet)) return;
      const id = Mainloop.idle_add(() => {
         this._deskletIdleIds.delete(desklet);
         if (this._destroyed ||
             DeskletManager.get_object_for_instance(desklet.instance_id) !== desklet ||
             desklet._blurCinnamonBackground)
            return false;
         this._blurDesklet(desklet);
         return false;
      });
      this._deskletIdleIds.set(desklet, id);
   }

   _cancelDeskletIdle(desklet) {
      const id = this._deskletIdleIds.get(desklet);
      if (id) Mainloop.source_remove(id);
      this._deskletIdleIds.delete(desklet);
   }

   _getUniqueSettings() {
      return [settings.deskletsOpacity, settings.deskletsBlendColor, settings.deskletsBlurType, settings.deskletsRadius, settings.deskletsSaturation];
   }

   // A string that changes whenever a global, blur type specific setting used by the given blur type changes
   _getExtraEffectSignature(blurType, radius) {
      if (isLiquidGlassBlurType(blurType))
         return JSON.stringify( getLiquidGlassParams(radius) );
      if (blurType === BlurType.MonteCarlo || blurType === BlurType.DynamicMC)
         return `${settings.montecarloIterations}/${settings.montecarloUseBasePixel}/${settings.montecarloPerferCloserPixels}`;
      return "";
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
         let viewport = background._blurCinnamonViewport;
         this._applyBackgroundClip(background, viewport, actor.x, actor.y, actor.width, actor.height);
      }
   }

   updateEffects() {
      let deskletList = settings.settings.getValue("desklets-list");
      deskletList.forEach( (element) => {
         let desklet =  DeskletManager.get_object_for_instance(element.instance);
         if (desklet) {
            //log( `Updating ${desklet.metadata.name} / ${desklet._uuid} / ${desklet.instance_id} / ${(desklet._blurCinnamonBackground!==undefined)}` );
            let deskletSettings = this._getDeskletSettings(desklet);
            // If desklet was never blurred in the past, or any of the desklets blur settings have changed
            // The blur type specific "additional settings" (Liquid Glass, Monte Carlo) are global and not part of
            // deskletSettings, so track them separately or changing them would never be noticed here
            let extraSig = this._getExtraEffectSignature(deskletSettings[3], deskletSettings[4]);
            if (!desklet._blurCinnamonBackground || extraSig !== desklet._blurCinnamonBackground._blurCinnamonExtraSig ||
                !deskletSettings.every( (e, i) => e == desklet._blurCinnamonBackground._blurCinnamonSettings[i] )) {
               let [enabled, opacity, blendColor, blurType, radius, saturation] = deskletSettings;
               if (desklet._blurCinnamonBackground) {
                  if (enabled) {
                     let wantsViewport = this._wantsViewport(blurType);
                     let viewport = desklet._blurCinnamonBackground._blurCinnamonViewport;
                     if (this._needsBackgroundRebuild(desklet._blurCinnamonBackground, blurType, wantsViewport)) {
                        this._deskletDestroy(desklet);
                        this._blurDesklet(desklet);
                     } else if (viewport) {
                        this._updateViewportEffects(desklet._blurCinnamonBackground, viewport, opacity, blendColor, blurType, radius, saturation);
                     } else {
                        this._updateEffects( desklet._blurCinnamonBackground, opacity, blendColor, blurType, radius, saturation );
                     }
                     desklet._blurCinnamonBackground._blurCinnamonSettings = deskletSettings;
                     desklet._blurCinnamonBackground._blurCinnamonExtraSig = extraSig;
                     if ((isDynamicBlurType(blurType)) && !this._isDynamicEffectActive(desklet._blurCinnamonBackground)) {
                        this._createDynamicEffect(desklet._blurCinnamonBackground, global.desklet_container, true);
                     }
                  } else {
                     this._deskletDestroy(desklet);
                  }
               } else if (enabled) {
                  this._blurDesklet(desklet)
                  desklet._blurCinnamonBackground._blurCinnamonSettings = deskletSettings;
                  desklet._blurCinnamonBackground._blurCinnamonExtraSig = extraSig;
               }
            }
         }
      });
   }

   _addDeskletToList(desklet) {
      let deskletList = settings.settings.getValue("desklets-list");
      let found = deskletList.find((element) => element.instance == desklet.instance_id);
      if (!found) {
         // Add a new entry for this Desklet and set the "enabled" based on the auto setting
         deskletList.push( {enabled: settings.autoDeskletAdd, name: desklet.metadata.name, uuid: desklet._uuid, instance: desklet.instance_id} );
         settings.settings.setValue( "desklets-list", deskletList );
      } else {
         // Update the name of the Desklet just in case some Desklet update changed it's name in the metadata
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
         this._destroyDynamicEffect(desklet._blurCinnamonBackground);
         desklet._blurCinnamonBackground.hide();
         let viewport = desklet._blurCinnamonBackground._blurCinnamonViewport;
         if (viewport) viewport.hide();
         // Strip effects (background's and, when wrapped, viewport's) before destroying either
         // actor - see _destroyBackgroundAndViewport - so a multi-pass blur effect (Dual Kawase)
         // gets to tear its own sub-effects down cleanly first, same as every other consumer's
         // destroy path.
         this._destroyBackgroundAndViewport(desklet._blurCinnamonBackground, global.desklet_container);
         delete desklet._blurCinnamonBackground;
      }
   }

   _deskletRemoved(desklet) {
      this._cancelDeskletIdle(desklet);
      this._deskletDestroy(desklet);
      this._removeDeskletFromList(desklet);
   }

   destroy() {
     this._destroyed = true;
     for (const id of this._deskletIdleIds.values()) {
        Mainloop.source_remove(id);
     }
     this._deskletIdleIds.clear();

      let desklets = DeskletManager.getDefinitions();
      for (let i=0 ; i<desklets.length ; i++) {
         let {uuid, desklet_id} = desklets[i];
         let desklet = desklets[i].desklet;
         if (desklet && desklet._blurCinnamonBackground) {
            this._deskletDestroy(desklet);
         }
      }
      DeskletManager._createDesklets = this.original_createDesklets;
      DeskletManager._unloadDesklet = this.original_unloadDesklet;

      DeskletManager.DeskletContainer.prototype.raise = this.origianl_raise;
      DeskletManager.DeskletContainer.prototype.lower = this.origianl_lower;

      if (blurDeskletsThis === this) blurDeskletsThis = null;
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

      this.bind('monte-carlo-iterations', 'montecarloIterations', blurChanged);
      this.bind('monte-carlo-use-base-pixel', 'montecarloUseBasePixel', blurChanged);
      this.bind('monte-carlo-prefer-closer-pixels', 'montecarloPerferCloserPixels', blurChanged);

      this.bind('liquid-glass-strength', 'liquidGlassStrength', blurChanged);
      this.bind('liquid-glass-edge-size', 'liquidGlassEdgeSize', blurChanged);
      this.bind('liquid-glass-rim-width', 'liquidGlassRimWidth', blurChanged);
      this.bind('liquid-glass-falloff', 'liquidGlassFalloff', blurChanged);
      this.bind('liquid-glass-gloss', 'liquidGlassGloss', blurChanged);
      this.bind('liquid-glass-backdrop-zoom', 'liquidGlassBackdropZoom', blurChanged);
      this.bind('liquid-glass-shadow', 'liquidGlassShadow', blurChanged);
      this.bind('liquid-glass-rgb-fringing', 'liquidGlassRgbFringing', blurChanged);
      this.bind('liquid-glass-texture-repeat', 'liquidGlassTextureRepeat', blurChanged);

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
      this.bind('hover-brighten-panels', 'hoverBrightenPanels' );

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
      this.bind('allow-transparent-color-notifications', 'allowTransparentColorNotifications', updateNotificationEffects);

      this.bind('appswitcher-opacity',    'appswitcherOpacity');
      this.bind('appswitcher-blurType',   'appswitcherBlurType');
      this.bind('appswitcher-radius',     'appswitcherRadius');
      this.bind('appswitcher-blendColor', 'appswitcherBlendColor');
      this.bind('appswitcher-saturation', 'appswitcherSaturation');
      this.bind('appswitcher-disable-3d-panels', 'appswitcherDisablePanels');
      this.bind('appswitcher-allow-classic',     'appswitcherAllowClassic', enableClassicSwitcherChecked);
      this.bind('appswitcher-allow-3d',          'appswitcherAllow3D');
      this.bind('allow-transparent-color-switcher', 'allowTransparentColorSwitcher');

      this.bind('tooltips-opacity',    'tooltipOpacity');
      this.bind('tooltips-blurType',   'tooltipBlurType');
      this.bind('tooltips-radius',     'tooltipRadius');
      this.bind('tooltips-blendColor', 'tooltipBlendColor');
      this.bind('tooltips-saturation', 'tooltipSaturation');
      this.bind('allow-transparent-color-tooltips', 'allowTransparentColorTooltips');

      this.bind('desklets-opacity',    'deskletsOpacity',    updateDeskletEffects);
      this.bind('desklets-blurType',   'deskletsBlurType',   updateDeskletEffects);
      this.bind('desklets-radius',     'deskletsRadius',     updateDeskletEffects);
      this.bind('desklets-blendColor', 'deskletsBlendColor', updateDeskletEffects);
      this.bind('desklets-saturation', 'deskletsSaturation', updateDeskletEffects);

      this.bind('osd-opacity',        'osdOpacity');
      this.bind('osd-blurType',       'osdBlurType');
      this.bind('osd-radius',         'osdRadius');
      this.bind('osd-blendColor',     'osdBlendColor');
      this.bind('osd-saturation',     'osdSaturation');
      this.bind(`osd-slider-effects`, `osdSliderEffects`);
      this.bind(`osd-workspace-effects`, `osdWorkspaceEffects`);
      this.bind('allow-transparent-color-osd', 'allowTransparentColorOSD');

      this.bind('desklets-list',    'deskletList',        updateDeskletEffects);
      //this.bind('desklets-effects', 'deskletEffectsList', updateDeskletEffects);
      this.bind('desklets-auto',    'autoDeskletAdd',     updateDeskletEffects);
      this.bind('enable-desklets-unique-settings', 'enableDeskletsUniqueSettings', updateDeskletEffects);

      this.bind('windows-inclusion-list', 'windowInclusionList', updateWindowEffects);
      this.bind('windows-atrifact-mitigation', 'windowArtifactMitigation', updateArtifactMitigation);
      this.bind('windows-titlebar-blur', `windowsTitlebarBlur`, updateWindowEffects);
      this.bind('windows-rounded-corners-sync', 'windowsRoundedCornersSync', updateWindowEffects);

      this.bind('focused-window-backlight', 'focusedWindowEffect', updateFocusedWindowEffect);

      this.bind('enable-overview-override',     'overviewOverride');
      this.bind('enable-expo-override',         'expoOverride');
      this.bind('enable-panels-override',       'panelsOverride', panelsSettingsChangled);
      this.bind('enable-popup-override',        'popupOverride', updatePopupEffects);
      this.bind('enable-desktop-override',      'desktopOverride', updateDesktopEffects);
      this.bind('enable-notification-override', 'notificationOverride', updateNotificationEffects);
      this.bind('enable-appswitcher-override',  'appswitcherOverride');
      this.bind('enable-tooltips-override',     'tooltipsOverride');
      this.bind('enable-desklets-override',     'deskletsOverride', updateDeskletEffects);
      this.bind('enable-osd-override',          'osdOverride');

      this.bind('enable-overview-effects',      'enableOverviewEffects', enableOverviewChanged);
      this.bind('enable-expo-effects',          'enableExpoEffects',     enableExpoChanged);
      this.bind('enable-panels-effects',        'enablePanelsEffects',   enablePanelsChanged);
      this.bind('enable-popup-effects',         'enablePopupEffects',    enablePopupChanged);
      this.bind('enable-desktop-effects',       'enableDesktopEffects',  enableDesktopChanged);
      this.bind('enable-notification-effects',  'enableNotificationEffects', enableNotificationChanged);
      this.bind('enable-appswitcher-effects',   'enableAppswitcherEffects', enableClassicSwitcherChecked);
      this.bind('enable-tooltips-effects',      'enableTooltipEffects',  enableTooltipsChanged);
      this.bind('enable-window-effects',        'enableWindowEffects',  enableWindowChanged);
      this.bind('enable-desklet-effects',       'enableDeskletEffects',  enableDeskletChanged);
      this.bind('enable-osd-effects',           'enableOSDEffects',  enableOSDChanged);

      this.bind('enable-panel-unique-settings', 'enablePanelUniqueSettings', panelsSettingsChangled);
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
      this._signalManager.disconnectAllSignals();
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

function updateArtifactMitigation() {
   if (cloneManager) {
      cloneManager.updateArtifactMitigation();
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
      blurPanels.updateEffects();
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
   if (blurPopupMenus && settings.enablePopupEffects) {
      blurPopupMenus.updateEffects();
   }
}

function colorChanged() {
   if (blurPanels) {
      blurPanels.updateEffects();
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
   if (blurPopupMenus && settings.enablePopupEffects) {
      blurPopupMenus.updateEffects();
   }
}

function blurChanged() {
   if (blurPanels) {
      blurPanels.updateEffects();
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
   if (blurPopupMenus && settings.enablePopupEffects) {
      blurPopupMenus.updateEffects();
   }
}

function panelsSettingsChangled() {
   if (blurPanels) {
      blurPanels.updateEffects();
   }
}

function enableOverviewChanged() {
   if (settings.enableOverviewEffects) {
      Overview.Overview.prototype._animateVisible = _animateVisibleOverview;
      Overview.Overview.prototype._oldAnimateVisible = originalAnimateOverview;
   } else if (Overview.Overview.prototype._oldAnimateVisible) {
      delete Overview.Overview.prototype._oldAnimateVisible;
      Overview.Overview.prototype._animateVisible = originalAnimateOverview;
   }
}

function enableExpoChanged() {
   if (settings.enableExpoEffects) {
      Expo.Expo.prototype._animateVisible = _animateVisibleExpo;
      Expo.Expo.prototype._oldAnimateVisible = originalAnimateExpo;
   } else if (Expo.Expo.prototype._oldAnimateVisible) {
      delete Expo.Expo.prototype._oldAnimateVisible;
      Expo.Expo.prototype._animateVisible = originalAnimateExpo;
   }
}

function enableClassicSwitcherChecked() {
   if (settings.enableAppswitcherEffects && settings.appswitcherAllowClassic) {
      blurClassicSwitcher = new BlurClassicSwitcher();
   } else {
      if (blurClassicSwitcher) {
         blurClassicSwitcher.destroy();
         blurClassicSwitcher = null;
      }
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
  cancelWindowEnableIdle();
   if (blurApplications && !settings.enableWindowEffects) {
      blurApplications.destroy();
      blurApplications = null;
   } else if (!blurApplications && settings.enableWindowEffects) {
      blurApplications = new BlurApplications();
   }
}

function enableDeskletChanged() {
   if (blurDesklets && !settings.enableDeskletEffects) {
      blurDesklets.destroy();
      blurDesklets = null;
   } else if (!blurDesklets && settings.enableDeskletEffects) {
      blurDesklets = new BlurDesklets();
   }
}

function enableOSDChanged() {
   if (blurOSD && !settings.enableOSDEffects) {
      blurOSD.destroy();
      blurOSD = null;
   } else if (!blurOSD && settings.enableOSDEffects) {
      blurOSD = new BlurOSD();
   }
}

function init(extensionMeta) {
   metaData = extensionMeta;

   // Store the original functions for monkey patched functions
   originalAnimateOverview = Overview.Overview.prototype._animateVisible;
   originalAnimateExpo = Expo.Expo.prototype._animateVisible;
   originalShowAppSwitcher3D = AppSwitcher3D.AppSwitcher3D.prototype._show;
   originalHideAppSwitcher3D = AppSwitcher3D.AppSwitcher3D.prototype._hide;
   originalSizeChangeWindowDone = Main.wm._sizeChangeWindowDone;
}

function enable() {
   settings = new BlurSettings(metaData.uuid);

   // Save the version number to the settings so that the About page can read it (is there a better way?)
   settings.settings.setValue("ext-version", metaData.version);

   // Let the settings dialog hide options that don't apply under Wayland (i.e. "windows-titlebar-blur")
   settings.settings.setValue("is-wayland", Meta.is_wayland_compositor());

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
   AppSwitcher3D.AppSwitcher3D.prototype._show = this._showAppSwitcher3D;
   AppSwitcher3D.AppSwitcher3D.prototype._oldShow = originalShowAppSwitcher3D;
   AppSwitcher3D.AppSwitcher3D.prototype._hide = this._hideAppSwitcher3D;
   AppSwitcher3D.AppSwitcher3D.prototype._oldHide = originalHideAppSwitcher3D;

   // Unconditionally monkey patch _sizeChangeWindowDone since it's needed for two effects
   Main.wm._sizeChangeWindowDone = _sizeChangeWindowDoneWindowManager;

   // Create a OsdWindow Effects class instance, the constructor will kick things off
   if (settings.enableOSDEffects) {
      blurOSD = new BlurOSD();
   }
   // Create a Classic Switcher Effects class instance, the constructor will kick things off
   if (settings.enableAppswitcherEffects && settings.appswitcherAllowClassic) {
      blurClassicSwitcher = new BlurClassicSwitcher();
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
   // Create a Application (Window) Effects class instance, the constructor will set everything up.
   if (settings.enableWindowEffects) {
      cancelWindowEnableIdle();
      const currentSettings = settings;
      windowEnableIdleId = Mainloop.idle_add(() => {
         windowEnableIdleId = 0;
         if (settings === currentSettings && settings.enableWindowEffects && !blurApplications)
            blurApplications = new BlurApplications();
         return false;
      });
   }
   // Create a Focused Window Effect class instance, the constructor will set everything up.
   if (settings.focusedWindowEffect > 0) {
      blurFocusEffect = new BlurFocusEffect();
   }
   // Create a Focused Window Effect class instance, the constructor will set everything up.
   if (settings.enableDeskletEffects > 0) {
      blurDesklets = new BlurDesklets();
   }
   // If this is the first time running Blur Cinnamon, send a welcome notification message
   if (settings.newInstall) {
      settings.settings.setValue( "new-install", 0 );
      let source = new MessageTray.Source(metaData.name);
      let notification = new MessageTray.Notification(source, _("Welcome to Blur Cinnamon"),
         _("Hope you are enjoying your new Panel, Expo, Overview and Alt-Tab effects.\n\nOpen the Blur Cinnamon Settings to enable additional effects on several other desktop elements like menus, notifications and windows, or disable effects on components that were enabled by default. You can also make changes to the effect properties like blur intensity, color saturation and tint."),
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
  cancelWindowEnableIdle();
  Utils.cancelFramebufferGC();

   if (Overview.Overview.prototype._oldAnimateVisible) {
      delete Overview.Overview.prototype._oldAnimateVisible;
      Overview.Overview.prototype._animateVisible = originalAnimateOverview;
   }

   if (Expo.Expo.prototype._oldAnimateVisible) {
      delete Expo.Expo.prototype._oldAnimateVisible;
      Expo.Expo.prototype._animateVisible = originalAnimateExpo;
   }

   delete AppSwitcher3D.AppSwitcher3D.prototype._oldShow;
   AppSwitcher3D.AppSwitcher3D.prototype._show = originalShowAppSwitcher3D;
   delete AppSwitcher3D.AppSwitcher3D.prototype._oldHide;
   AppSwitcher3D.AppSwitcher3D.prototype._hide = originalHideAppSwitcher3D;

   Main.wm._sizeChangeWindowDone = originalSizeChangeWindowDone;

   if (blurOSD) {
      blurOSD.destroy();
      blurOSD = null;
   }

   if (blurClassicSwitcher) {
      blurClassicSwitcher.destroy();
      blurClassicSwitcher = null;
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

   // Every component's backgrounds have released their wallpaper clones by now; this is just a safety net
   if (wallpaperTracker) {
      wallpaperTracker.destroy();
      wallpaperTracker = null;
   }
   if (screenSizeTracker) {
      screenSizeTracker.destroy();
      screenSizeTracker = null;
   }

   // All components have released their effects into the pools by now
   BlurBase.drainEffectPools();

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

   on_window_pick_button_pressed: function() {
      if (blurApplications) {
         blurApplications.pickWindow();
      }
   }
}
