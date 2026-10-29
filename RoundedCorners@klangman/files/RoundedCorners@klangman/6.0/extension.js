// Rounded Corners: Round window corners of the Cinnamon Desktop

// Copyright (c) 2026 Kevin Langman

// Rounded Corners effect (borrowed from Blur-my-shell / Aurélien Hamy) modified for Cinnamon by Kevin Langman 2025

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
const Settings       = imports.ui.settings;
const SignalManager  = imports.misc.signalManager;
const Signals        = imports.signals;
const Main           = imports.ui.main;
const Meta           = imports.gi.Meta;
const MessageTray    = imports.ui.messageTray;
const Util           = imports.misc.util;
const Cinnamon       = imports.gi.Cinnamon;
const GLib           = imports.gi.GLib;
const Gio            = imports.gi.Gio;
const Gettext        = imports.gettext;

const UUID = "RoundedCorners@klangman";

// Translation support: look in the extension's own catalog first, then fall back to Cinnamon's
Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale");

function _(text) {
   let locText = Gettext.dgettext(UUID, text);
   if (locText === text)
      locText = window._(text);
   return locText;
}

// User visible messages for each list the window picker can add to. Each one is a complete
// sentence so translators don't have to fit a list name into a sentence. "%s" is the application.
function getListMessages(listKey) {
   switch (listKey) {
      case "windows-inclusion-list":
         return { hint:    _("Click a window to add its application to the inclusion list.  Esc or right-click to cancel."),
                  already: _("\"%s\" is already in the inclusion list."),
                  enabled: _("Enabled \"%s\" in the inclusion list."),
                  added:   _("Added \"%s\" to the inclusion list.") };
      case "windows-exclusion-list":
         return { hint:    _("Click a window to add its application to the exclusion list.  Esc or right-click to cancel."),
                  already: _("\"%s\" is already in the exclusion list."),
                  enabled: _("Enabled \"%s\" in the exclusion list."),
                  added:   _("Added \"%s\" to the exclusion list.") };
      default: // "border-app-list"
         return { hint:    _("Click a window to add its application to the application border list.  Esc or right-click to cancel."),
                  already: _("\"%s\" is already in the application border list."),
                  enabled: _("Enabled \"%s\" in the application border list."),
                  added:   _("Added \"%s\" to the application border list.") };
   }
}

const CornerEffect = require("./corner");

const CORNER_EFFECT_NAME = "corner";
const PADDING_EFFECT_NAME = "corner-shadow-padding";
const SHADOW_EFFECT_NAME = "corner-shadow";

let roundedCorners;

function debugMsg(...params) {
   //log(...params);
}

// Shared notifier between this extension and other extensions (e.g. Blur Cinnamon), published as
// global.roundedCornersNotifier. Whichever extension loads first creates it, and neither ever removes
// it, so either can connect to it at any time, whatever the load order. Each extension disconnects only
// its own handlers. This extension emits:
//   "enabled"                     it started; metaWindow._roundedCornersRadius is now set on every window it rounds
//   "radius-changed" (metaWindow) that window's _roundedCornersRadius ([top, bottom] in logical pixels,
//                                 null for corners this extension isn't rounding, which should be treated as
//                                 for a window it doesn't round) was set, changed or cleared (undefined)
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

// Find the window's surface actor (the window's image). Don't assume it is the first
// child: other extensions (e.g. Blur Cinnamon) may insert their own actors before it.
function getSurfaceActor(compositor) {
   if (!compositor)
      return null;
   return compositor.get_children().find(child =>
      (Meta.SurfaceActor && child instanceof Meta.SurfaceActor) ||
      child.constructor.name.includes("SurfaceActor")) || null;
}

// Some apps draw part of their own shadow/border inside the frame rect they report.
// Pull the clip in by this many pixels on each side for those apps (keyed by WM_CLASS).
// TODO: move this into the windows-inclusion-list settings as inset columns.
// Entry syntax:  "<WM_CLASS>": { left: <px>, top: <px>, right: <px>, bottom: <px> },
const CLIP_INSETS = {
};
const NO_INSET = { left: 0, top: 0, right: 0, bottom: 0 };

// Windows draw their 1px outer border line just outside the frame rect Muffin reports:
// Muffin themes for Muffin-decorated windows, and Gtk/Firefox client-side decorations
// (as part of their shadow). Grow the clip by this much on every side to keep that line.
// Per-app CLIP_INSETS are applied on top of this.
const BORDER_OUTSET = 1;

// Convert a colour value ("rgb(r,g,b)", "rgba(r,g,b,a)", "#rrggbb" or "#rrggbbaa") to [r, g, b, a], each 0..1.
// Returns null if the value can't be parsed.
function tryParseColor(value) {
   value = (value || "").trim();
   let m = /rgba?\(([^)]*)\)/.exec(value || "");
   if (m) {
      let p = m[1].split(",").map(v => parseFloat(v));
      if (p.length >= 3 && p.every(v => !isNaN(v)))
         return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
   }
   m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
   if (m) {
      let n = parseInt(m[1], 16);
      let a = m[2] ? parseInt(m[2], 16) / 255 : 1;
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
   }
   return null;
}

function parseColor(value) {
   return tryParseColor(value) || [0, 0, 0, 0.3];
}

// Muffin's per-window shadow mode (MetaShadowMode: AUTO=0, FORCED_OFF=1, FORCED_ON=2)
const SHADOW_MODE_FORCED_OFF = Meta.ShadowMode ? Meta.ShadowMode.FORCED_OFF : 1;

// The window types that get a frame and can be rounded (and picked in the window picker).
// Everything else (docks, the desktop, menus, tooltips, notifications, splash screens...) is left alone.
const ROUNDED_TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG,
                       Meta.WindowType.MODAL_DIALOG, Meta.WindowType.UTILITY];

class RoundedCorners {
   constructor(metadata) {
      this.metaData = metadata;
   }

   enable() {
      this.settings = new Settings.ExtensionSettings(this, this.metaData.uuid);
      // Save the version number to the settings so that the About page can read it
      this.settings.setValue("ext-version", this.metaData.version);
      // Any change to a setting re-evaluates every window
      let refresh = () => this._refreshAllWindows();
      this.settings.bind("auto-include",             "autoInclude",      refresh);
      this.settings.bind("corner-radius",            "cornerRadius",     refresh);
      this.settings.bind("corners-top",              "cornersTop",       refresh);
      this.settings.bind("corners-bottom",           "cornersBottom",    refresh);
      this.settings.bind("disable-maximized",        "disableMaximized", refresh);
      this.settings.bind("windows-inclusion-list",   "inclusionList",    refresh);
      this.settings.bind("windows-exclusion-list",   "exclusionList",    refresh);
      this.settings.bind("border-mode",              "borderMode",       refresh);
      this.settings.bind("border-width",             "borderWidth",      refresh);
      this.settings.bind("border-contrast",          "borderContrast",   refresh);
      this.settings.bind("border-color",             "borderColor",      refresh);
      this.settings.bind("border-color-unfocused",   "borderColorUnfocused", refresh);
      this.settings.bind("border-app-list",          "borderAppList",    refresh);
      this.settings.bind("shadow-enabled",           "shadowEnabled",    refresh);
      this.settings.bind("shadow-size",              "shadowSize",       refresh);
      this.settings.bind("shadow-offset",            "shadowOffset",     refresh);
      this.settings.bind("shadow-opacity",           "shadowOpacity",    refresh);
      this.settings.bind("shadow-unfocused-opacity", "shadowUnfocusedOpacity", refresh);

      this._signalManager = new SignalManager.SignalManager(null);
      this._signalManager.connect(global.display, "window-created", this._windowAdded, this);
      this._signalManager.connect(global.display, "notify::focus-window", this._onFocusChanged, this);
      //this._signalManager.connect(global.display, "grab-op-begin", this._onWindowGrabbed, this);

      // WindowTracker so we can map windows to application
      this._windowTracker = Cinnamon.WindowTracker.get_default();

      this.windowWithFocus = global.display.get_focus_window();

      // Notifier for other extensions (e.g. Blur Cinnamon), see getRoundedCornersNotifier()
      this._notifier = getRoundedCornersNotifier();
      this._notifier.enabled = true;

      // Round any existing windows that should be rounded
      this._refreshAllWindows();
      this._notify("enabled");

      // If this is the first time running Rounded Corners, send a welcome notification message
      if (this.settings.getValue("new-install")) {
         this.settings.setValue("new-install", 0);
         this._showWelcomeNotification();
      }
   }

   // Welcome the user and explain that nothing is rounded until the settings allow it
   _showWelcomeNotification() {
      let source = new MessageTray.Source(this.metaData.name);
      // The icon lives in the extension's root folder, metaData.path may point to the version subfolder
      let iconPath = GLib.build_filenamev([this.metaData.path, "icon.png"]);
      if (!GLib.file_test(iconPath, GLib.FileTest.EXISTS))
         iconPath = GLib.build_filenamev([GLib.path_get_dirname(this.metaData.path), "icon.png"]);
      let params = {};
      if (GLib.file_test(iconPath, GLib.FileTest.EXISTS))
         params.icon = new St.Icon({gicon: new Gio.FileIcon({file: Gio.File.new_for_path(iconPath)}), icon_size: source.ICON_SIZE});
      let notification = new MessageTray.Notification(source, _("Welcome to Rounded Corners"),
         _("Thanks for installing Rounded Corners!\n\nBy default no window corners will be rounded until you change the settings to allow it. Open the Rounded Corners settings to either round the corners of all windows by default, or add the applications you want rounded to the inclusion list. You can also adjust the corner radius, and add borders and shadows."),
         params);
      Main.messageTray.add(source);
      notification.addButton("rounded-corners-settings", _("Open Rounded Corners Settings"));
      notification.connect("action-invoked", (self, id) => {
         if (id === "rounded-corners-settings")
            Util.spawnCommandLineAsync("xlet-settings extension " + this.metaData.uuid);
      });
      notification.setUrgency(MessageTray.Urgency.CRITICAL);
      source.notify(notification);
   }

   // Remove the effect from every window, then re-apply it according to the current settings
   _refreshAllWindows() {
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         let compositor = windows[i].get_compositor_private();
         if (compositor && compositor._roundedCornerData)
            this._unroundWindow(compositor);
         this._watchWindowState(windows[i]);
         this._roundWindow(windows[i]);
      }
   }

   _onFocusChanged() {
      let window = global.display.get_focus_window();
      if (window && window !== this.windowWithFocus) {
         if (this.windowWithFocus) {
            let compositor = this.windowWithFocus.get_compositor_private();
            if (compositor && compositor._roundedCornerData)
               this._setClip(this.windowWithFocus);
         }
         let compositor = window.get_compositor_private();
         if (compositor && compositor._roundedCornerData)
            this._setClip(window);
         this.windowWithFocus = window;
      }
   }

   _windowAdded(display, metaWindow) {
      this._watchWindowState(metaWindow);
      this._roundWindow(metaWindow);
   }

   // Watch a window's maximized/fullscreen state so its rounding can be removed and
   // restored as it changes. This is separate from the per-window rounding data, which
   // is removed while the window isn't rounded.
   _watchWindowState(metaWindow) {
      if (metaWindow._roundedCornerStateIds)
         return;
      let update = () => this._updateWindow(metaWindow);
      metaWindow._roundedCornerStateIds = [
         metaWindow.connect("notify::maximized-horizontally", update),
         metaWindow.connect("notify::maximized-vertically", update),
         metaWindow.connect("notify::fullscreen", update),
         // Some toolkits set the window type after the window is mapped
         metaWindow.connect("notify::window-type", update),
         metaWindow.connect("unmanaged", () => this._unwatchWindowState(metaWindow)),
      ];
   }

   _unwatchWindowState(metaWindow) {
      let ids = metaWindow._roundedCornerStateIds;
      if (ids) {
         for (let id of ids)
            metaWindow.disconnect(id);
         metaWindow._roundedCornerStateIds = undefined;
      }
   }

   // Round or unround one window to match the current settings and its current state
   _updateWindow(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      if (!compositor)
         return;
      let rounded = !!compositor._roundedCornerData;
      let wanted = this._getSettings(metaWindow) !== null;
      if (rounded && !wanted)
         this._unroundWindow(compositor);
      else if (!rounded && wanted)
         this._roundWindow(metaWindow);
   }

   disable() {
      this._endPick();
      // Stop watching for new windows, focus changes and settings changes
      this._signalManager.disconnectAllSignals();
      // If disable was called to remove the extension entirely rather than a reload
      // we can reset the "new-install" value so that if the user adds the extension
      // again in the future, we can show the welcome notification again!
      let err = new Error();
      if (err.stack.includes("unloadRemovedExtensions@"))
         this.settings.setValue("new-install", 1);
      this.settings.finalize();
      // Remove the effect from any rounded windows
      let windows = global.display.list_windows(0);
      for (let i = 0; i < windows.length; i++) {
         this._unwatchWindowState(windows[i]);
         let compositor = windows[i].get_compositor_private();
         if (compositor && compositor._roundedCornerData) {
            this._unroundWindow(compositor);
         }
      }
      // Tell other extensions. The notifier stays published (and their handlers connected) so they
      // hear about it when this extension is enabled again.
      if (this._notifier) {
         this._notifier.enabled = false;
         this._notify("disabled");
         this._notifier = null;
      }
   }

   // Emit a signal on the notifier, never letting another extension's handler break us
   _notify(signal, ...args) {
      if (!this._notifier)
         return;
      try {
         this._notifier.emit(signal, ...args);
      } catch (e) {
         logError(e, `RoundedCorners: a "${signal}" handler failed`);
      }
   }

   _roundWindow(metaWindow) {
      // The window's compositor actor (MetaWindowActor). Muffin paints its own
      // shadow for server-side decorated windows on this actor, which enlarges the
      // offscreen texture of any effect added here. So the effect goes on the
      // surface actor (the window's image only), whose texture always matches its size.
      let compositor = metaWindow.get_compositor_private();
      if (!compositor || compositor._roundedCornerData)
         return;
      let surface = getSurfaceActor(compositor);
      if (!surface)
         return;

      // Get the settings that apply to this window (null = don't round it)
      let windowSettings = this._getSettings(metaWindow);

      if (windowSettings) {
         let {radius: corner_radius, top, bottom} = windowSettings;
         debugMsg( `a window effect is being applied! radius: ${corner_radius}  ${top}  ${bottom}` );
         // A signal manager for this window
         let signalManager = new SignalManager.SignalManager(null);

         // Get an effect (a pooled one if there is one, see effect_base.js) and add it to the window's surface
         let cornerEffect = CornerEffect.acquireCornerEffect( this.metaData.uuid, {radius: corner_radius, corners_top: top, corners_bottom: bottom}, this._getBorderSettings(metaWindow) );
         // The padding effect goes *after* the corner effect: it only enlarges the area
         // Clutter redraws (for the shadow), not the corner effect's texture
         let paddingEffect = new CornerEffect.ShadowPaddingEffect();
         surface.add_effect_with_name( CORNER_EFFECT_NAME, cornerEffect );
         surface.add_effect_with_name( PADDING_EFFECT_NAME, paddingEffect );

         // The shadow: a plain actor inside the window actor, below everything else in it,
         // so it moves, fades and hides with the window. Its own content is ignored by
         // the shadow shader; the background just gives it something to paint.
         let shadowActor = new Clutter.Actor({ reactive: false });
         shadowActor.set_background_color(new Clutter.Color({ red: 0, green: 0, blue: 0, alpha: 255 }));
         let shadowEffect = CornerEffect.acquireShadowEffect(this.metaData.uuid);
         shadowActor.add_effect_with_name( SHADOW_EFFECT_NAME, shadowEffect );
         compositor.insert_child_at_index(shadowActor, 0);

         // Turn off Muffin's shadow for this window: it doesn't follow the rounded
         // corners, and Muffin leaves it out under the frame, so the cut-off corners
         // would show un-shadowed desktop. Remember the old mode so it can be restored.
         let oldShadowMode = null;
         if ("shadow_mode" in compositor) {
            oldShadowMode = compositor.shadow_mode;
            compositor.shadow_mode = SHADOW_MODE_FORCED_OFF;
         }

         // Add rounding data to the compositor while rounding is in effect
         // Publish the corner radius for other extensions (e.g. Blur Cinnamon): [top, bottom]
         // in logical pixels, or null for corners this extension isn't rounding. null means
         // "not handled here": the theme or app may still round those corners itself, so the
         // other extension should treat them as it would a window this extension doesn't
         // round. Only set while this extension is rounding the window; undefined otherwise.
         metaWindow._roundedCornersRadius = [top ? corner_radius : null, bottom ? corner_radius : null];
         this._notify("radius-changed", metaWindow);

         compositor._roundedCornerData = { metaWindow: metaWindow, signalManager: signalManager, surface: surface, effect: cornerEffect, padding: paddingEffect,
                                           shadowActor: shadowActor, shadowEffect: shadowEffect,
                                           radius: corner_radius, top: top, bottom: bottom, shaded: false, oldShadowMode: oldShadowMode };
         this._setClip(metaWindow);

         // Add listeners for this window
         signalManager.connect(compositor, "destroy", () => this._unroundWindow(compositor) );
         signalManager.connect(compositor, "notify::size", () => this._setClip(metaWindow) );
         signalManager.connect(metaWindow, "size-changed", () => this._setClip(metaWindow) );
         signalManager.connect(metaWindow, "focus", () => this._setClip(metaWindow) );
      }
   }

   _setClip(metaWindow) {
      let compositor = metaWindow.get_compositor_private();
      let data = compositor ? compositor._roundedCornerData : null;
      if (!data)
         return;

      // Muffin can replace a window's surface actor; if so move the effect to the new one
      let surface = getSurfaceActor(compositor);
      if (surface && surface !== data.surface) {
         this._removeEffects(data);
         // If the old surface was destroyed with the effects on it, reattaching them would log
         // criticals (see effect_base.js), so use new ones where the old ones can be freed. The
         // padding effect is a plain Clutter.Effect, always cheap to replace.
         if (CornerEffect.shouldReplaceEffect(data.effect)) {
            CornerEffect.releaseCornerEffect(data.effect);
            data.effect = CornerEffect.acquireCornerEffect( this.metaData.uuid, {radius: data.radius, corners_top: data.top, corners_bottom: data.bottom}, this._getBorderSettings(metaWindow) );
         }
         data.padding = new CornerEffect.ShadowPaddingEffect();
         surface.add_effect_with_name( CORNER_EFFECT_NAME, data.effect );
         surface.add_effect_with_name( PADDING_EFFECT_NAME, data.padding );
         data.surface = surface;
      }

      // The surface covers the buffer rect (window + any client-side shadow or
      // invisible borders). Clip to the visible frame rect, relative to the buffer.
      let frame = metaWindow.get_frame_rect();
      let buffer = metaWindow.get_buffer_rect();
      let rect = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
      // A shaded window keeps its full-size frame rect, but only its title bar is shown
      // (the surface shrinks to it). The bottom of a shaded title bar is square.
      let shaded = metaWindow.is_shaded();
      if (shaded)
         rect.height = this._getShadedHeight(metaWindow, frame, buffer);
      let bottom = data.bottom && !shaded;
      if (data.effect.corners_bottom !== bottom)
         data.effect.corners_bottom = bottom;
      if (data.shaded !== shaded) {
         data.shaded = shaded;
         // Tell other extensions the bottom corners aren't rounded while shaded
         metaWindow._roundedCornersRadius = [data.top ? data.radius : null, bottom ? data.radius : null];
         this._notify("radius-changed", metaWindow);
      }
      let inset = Object.assign({}, CLIP_INSETS[metaWindow.get_wm_class()] || NO_INSET);
      // Don't let the outset reach past the surface (e.g. maximized/tiled CSD windows,
      // or apps without invisible borders, where the buffer rect equals the frame rect)
      let avail = { left: frame.x - buffer.x, top: frame.y - buffer.y,
                    right: buffer.x + buffer.width - (frame.x + frame.width),
                    bottom: buffer.y + buffer.height - (frame.y + frame.height) };
      for (let side of ["left", "top", "right", "bottom"])
         inset[side] = Math.max(inset[side] - BORDER_OUTSET, -avail[side]);
      let clip = [rect.x - buffer.x + inset.left, rect.y - buffer.y + inset.top,
                  rect.width - inset.left - inset.right, rect.height - inset.top - inset.bottom];
      data.effect.clip = clip;
      // The custom border colour depends on focus
      data.effect.setBorder(this._getBorderSettings(metaWindow));

      // Shadow: the same size for focused and unfocused windows (so its texture isn't
      // re-allocated on every focus change), only its strength differs.
      let shadow = this._getShadowSettings(metaWindow);
      let margin = shadow.size > 0 ? Math.ceil(shadow.size + shadow.offsetY) + 2 : 0;
      data.effect.updateTextureGeometry();
      // Make Clutter redraw the shadow area along with the window
      data.padding.setBox(clip[0] - margin, clip[1] - margin, clip[0] + clip[2] + margin, clip[1] + clip[3] + margin);
      if (margin > 0) {
         // The surface sits at (0, 0) in the window actor, so clip coordinates work for both
         let width = clip[2] + 2 * margin, height = clip[3] + 2 * margin;
         data.shadowActor.set_position(clip[0] - margin, clip[1] - margin);
         data.shadowActor.set_size(width, height);
         // The shadow's top corners are always rounded, even when the window's aren't:
         // many themes round the title bar themselves, and a square shadow would leave the
         // see-through bit outside the theme's curve unshadowed (the shadow isn't drawn
         // under the window). Under an opaque square title bar the extra shadow is hidden.
         // Bottom corners follow the setting, since they are more often translucent.
         data.shadowEffect.update(width, height, [margin, margin, margin + clip[2], margin + clip[3]],
                                  Object.assign({ radius: data.radius, top: true, bottom: bottom,
                                                  cutoutInset: BORDER_OUTSET + 1 }, shadow));
         data.shadowActor.show();
      } else {
         data.shadowActor.hide();
      }
   }

   // The visible height of a shaded window: its title bar plus the frame's visible bottom
   // border. Muffin shrinks a shaded window's frame to borders.total.top + borders.total.bottom;
   // frame_rect_to_client_rect() takes off the visible borders, so the difference is their sum.
   _getShadedHeight(metaWindow, frame, buffer) {
      // The most the surface can show below the top of the frame rect
      let available = buffer.y + buffer.height - frame.y;
      let height = 0;
      try {
         let client = metaWindow.frame_rect_to_client_rect(frame);
         if (client)
            height = frame.height - client.height;
      } catch (e) {
      }
      // Fallback (or a window without a Muffin frame): the shrunken buffer, less the invisible
      // border at the bottom, assumed to be as wide as the one at the side
      if (!(height > 0) || height > available)
         height = available - (frame.x - buffer.x);
      return Math.max(1, Math.min(height, available));
   }

   _unroundWindow(compositor) {
      let data = compositor._roundedCornerData;
      if (data) {
         debugMsg( "unrounding a window" );
         data.signalManager.disconnectAllSignals();
         this._removeEffects(data);
         // Back to the pools for the next window. The shadow effect is detached before its actor is
         // destroyed, so that it can be reused.
         CornerEffect.releaseCornerEffect(data.effect);
         CornerEffect.releaseShadowEffect(data.shadowEffect);
         data.effect = data.shadowEffect = null;
         if (data.shadowActor)
            data.shadowActor.destroy();
         // Give the window its Muffin shadow back
         if (data.oldShadowMode !== null && "shadow_mode" in compositor)
            compositor.shadow_mode = data.oldShadowMode;
         compositor._roundedCornerData = undefined;
         if (data.metaWindow) {
            data.metaWindow._roundedCornersRadius = undefined;
            this._notify("radius-changed", data.metaWindow);
         }
      }
   }

   _getAppForWindow(metaWindow) {
      let app = this._windowTracker.get_window_app(metaWindow);
      if (!app) {
        app = this._windowTracker.get_app_from_pid(metaWindow.get_pid());
      }
      if (app)
         return app;
      return null;
   }

   // Returns {radius, top, bottom} for a window that should be rounded, or null if it shouldn't.
   //  - "auto-include" on:  every normal window, with the "corner-radius", "corners-top" and
   //                        "corners-bottom" settings, unless it's enabled in the exclusion list.
   //  - "auto-include" off: only windows enabled in the inclusion list, with that entry's settings.
   _getSettings(metaWindow) {
      if (!ROUNDED_TYPES.includes(metaWindow.get_window_type()))
         return null;
      // Never round fullscreen windows, and optionally not maximized ones
      if (metaWindow.is_fullscreen())
         return null;
      if (this.disableMaximized && metaWindow.get_maximized() === Meta.MaximizeFlags.BOTH)
         return null;

      let ids = this._getWindowIds(metaWindow);
      let result = null;
      if (this.autoInclude) {
         let excluded = (this.exclusionList || []).some(entry => entry.enabled && this._idMatches(entry.application, ids));
         if (!excluded)
            result = { radius: this.cornerRadius, top: this.cornersTop, bottom: this.cornersBottom };
      } else {
         let entry = (this.inclusionList || []).find(entry => entry.enabled && this._idMatches(entry.application, ids));
         if (entry)
            result = { radius: entry.corner_radius, top: entry.corner_top, bottom: entry.corner_bottom };
      }
      // A modal dialog attached to its parent has no title bar and sits flush under the
      // parent's title bar, so rounding its top corners would leave notches
      if (result && metaWindow.is_attached_dialog && metaWindow.is_attached_dialog())
         result.top = false;
      // Nothing to round
      if (result && (result.radius <= 0 || (!result.top && !result.bottom)))
         result = null;
      return result;
   }

   // Remove the corner and padding effects from whatever actor they are on
   _removeEffects(data) {
      for (let effect of [data.effect, data.padding]) {
         let actor = effect ? effect.get_actor() : null;
         if (actor)
            actor.remove_effect(effect);
      }
   }

   // The shadow settings in the form CornerEffect.setShadow() expects
   _getShadowSettings(metaWindow) {
      if (!this.shadowEnabled)
         return { size: 0, opacity: 0, offsetY: 0 };
      let focused = this._isFocused(metaWindow);
      return {
         size: this.shadowSize,
         opacity: (focused ? this.shadowOpacity : this.shadowUnfocusedOpacity) / 100,
         offsetY: this.shadowOffset
      };
   }

   // The border settings in the form CornerEffect.setBorder() expects
   _getBorderSettings(metaWindow) {
      // The Custom option's value is "custom-colors": Cinnamon's settings window hides any
      // combobox option whose value is exactly "custom" (it is reserved in xlet-settings.py)
      let modes = { none: CornerEffect.BorderMode.NONE, auto: CornerEffect.BorderMode.AUTO, match: CornerEffect.BorderMode.MATCH,
                    "custom-colors": CornerEffect.BorderMode.CUSTOM };
      let focused = this._isFocused(metaWindow);
      let globalColor = parseColor(focused ? this.borderColor : this.borderColorUnfocused);
      // An enabled entry in the application border list overrides the global border settings.
      // An empty or unparsable colour falls back to the global colour.
      let ids = this._getWindowIds(metaWindow);
      let entry = (this.borderAppList || []).find(entry => entry.enabled && this._idMatches(entry.application, ids));
      if (entry) {
         return {
            mode: modes[entry.mode] ?? CornerEffect.BorderMode.NONE,
            width: Math.max(1, Math.min(4, entry.width ?? this.borderWidth)),
            contrast: Math.max(0, Math.min(100, entry.contrast ?? this.borderContrast)) / 100,
            color: tryParseColor(focused ? entry.color : entry.color_unfocused) || globalColor
         };
      }
      return {
         mode: modes[this.borderMode] ?? CornerEffect.BorderMode.NONE,
         width: this.borderWidth,
         contrast: this.borderContrast / 100,
         color: globalColor
      };
   }

   _isFocused(metaWindow) {
      return metaWindow.has_focus ? metaWindow.has_focus() : (metaWindow === global.display.get_focus_window());
   }

   // The names a window can be matched by: its desktop file id (with and without
   // ".desktop") and its WM_CLASS class and instance names, all lower case.
   _getWindowIds(metaWindow) {
      let ids = [];
      let app = this._getAppForWindow(metaWindow);
      let appId = app ? app.get_id() : null;
      if (appId) {
         appId = appId.toLowerCase();
         ids.push(appId, appId.replace(/\.desktop$/, ""));
      }
      let wmClass = metaWindow.get_wm_class();
      if (wmClass)
         ids.push(wmClass.toLowerCase());
      let wmInstance = metaWindow.get_wm_class_instance();
      if (wmInstance)
         ids.push(wmInstance.toLowerCase());
      return ids;
   }

   // Does a list entry's "Application" field name this window? (case-insensitive, ".desktop" optional)
   _idMatches(application, ids) {
      if (!application)
         return false;
      let name = application.trim().toLowerCase();
      return name.length > 0 && (ids.includes(name) || ids.includes(name.replace(/\.desktop$/, "")));
   }

   // ---- Window picker ----
   // Started from a button in the settings dialog (see Callbacks below). The user clicks the
   // window they mean and its application is added to one of the list settings. While picking,
   // a transparent modal overlay covers the screen: it highlights the window under the pointer
   // and names it, a click picks it, and Esc, a right-click or a 30 second timeout cancels.
   pickWindow(listKey) {
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
      let hint = new St.Label({ text: getListMessages(listKey).hint,
         style: "background-color: rgba(0,0,0,0.85); color: white; padding: 10px 18px; border-radius: 8px; font-size: 11pt;" });
      overlay.add_child(hint);
      Main.uiGroup.add_child(overlay);
      Main.uiGroup.set_child_above_sibling(overlay, null);
      let monitor = Main.layoutManager.primaryMonitor;
      let [, hintWidth] = hint.get_preferred_width(-1);
      hint.set_position(monitor.x + Math.floor((monitor.width - hintWidth) / 2), monitor.y + 60);

      if (!Main.pushModal(overlay)) {
         overlay.destroy();
         Main.notify(this.metaData.name, _("Couldn't start the window picker. Close any open menus and try again."));
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
               this._addWindowToList(metaWindow, listKey);
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

   // The topmost visible window on the current workspace whose frame contains (x, y), or null
   _windowAtPoint(x, y) {
      let workspace = global.workspace_manager.get_active_workspace();
      let windows = global.display.list_windows(0).filter(w =>
         ROUNDED_TYPES.includes(w.get_window_type()) && !w.minimized && w.showing_on_its_workspace() &&
         (w.is_on_all_workspaces() || w.get_workspace() === workspace));
      windows = global.display.sort_windows_by_stacking(windows);   // bottom to top
      for (let i = windows.length - 1; i >= 0; i--) {
         let rect = windows[i].get_frame_rect();
         if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height)
            return windows[i];
      }
      return null;
   }

   // The name a picked window is added to a list as: its WM_CLASS, or failing that its desktop file id
   _getWindowListName(metaWindow) {
      let wmClass = metaWindow.get_wm_class();
      if (wmClass)
         return wmClass;
      let app = this._getAppForWindow(metaWindow);
      let appId = app ? app.get_id() : null;
      if (appId && !appId.startsWith("window:"))   // "window:N" is Cinnamon's id for windows with no known app
         return appId.replace(/\.desktop$/, "");
      return null;
   }

   // Add the window's application to a list setting, or enable its entry if it's there but disabled
   _addWindowToList(metaWindow, listKey) {
      let messages = getListMessages(listKey);
      let name = this._getWindowListName(metaWindow);
      if (!name) {
         Main.notify(this.metaData.name, _("That window has no WM_CLASS or application id, so it can't be added."));
         return;
      }
      let ids = this._getWindowIds(metaWindow);
      let list = (this.settings.getValue(listKey) || []).map(entry => Object.assign({}, entry));
      let existing = list.find(entry => this._idMatches(entry.application, ids));
      let message;
      if (existing && existing.enabled) {
         Main.notify(this.metaData.name, messages.already.format(existing.application));
         return;
      } else if (existing) {
         existing.enabled = true;
         message = messages.enabled.format(existing.application);
      } else {
         list.push(this._newListEntry(listKey, name));
         message = messages.added.format(name);
      }
      this.settings.setValue(listKey, list);
      this._refreshAllWindows();
      Main.notify(this.metaData.name, message);
   }

   // A new list entry with every column at its schema default
   _newListEntry(listKey, application) {
      let entry = {};
      let data = this.settings.settingsData ? this.settings.settingsData[listKey] : null;
      for (let column of (data && data.columns) || [])
         entry[column.id] = column.default;
      entry.enabled = true;
      entry.application = application;
      return entry;
   }

   destroy() {
   }
}

function init(extensionMeta) {
   roundedCorners = new RoundedCorners(extensionMeta);
}

function enable() {
   roundedCorners.enable();
   return Callbacks;
}

function disable() {
   CornerEffect.cancelFramebufferGC();
   if (roundedCorners) {
      roundedCorners.disable();
      roundedCorners.destroy();
      roundedCorners = null;
      // Every window has been unrounded, so free the pooled effects (where they can be freed)
      CornerEffect.drainPools();
   }
}

// Settings dialog button callbacks: let the user click a window to add it to a list
function pickWindow(listKey) {
   if (roundedCorners)
      roundedCorners.pickWindow(listKey);
}

// The Applications section has a single picker button with no "dependency" that adds to whichever
// list is showing. A button that depends on "auto-include", in a section where every row has a
// dependency, isn't drawn after toggling "auto-include" on (python-xapp's SettingsSection hides
// the section's frame mid-animation and the last revealer is left unmapped).
const Callbacks = {
   on_pick_application_window: () => {
      if (roundedCorners && roundedCorners.autoInclude)
         pickWindow("windows-exclusion-list");
      else
         pickWindow("windows-inclusion-list");
   },
   on_pick_border_window: () => pickWindow("border-app-list")
}
