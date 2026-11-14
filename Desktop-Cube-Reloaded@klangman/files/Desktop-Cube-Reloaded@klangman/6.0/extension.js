// Desktop Cube Reloaded - a Cinnamon port of the GNOME Desktop Cube extension.
//
// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de> (original GNOME extension)
// SPDX-FileCopyrightText: Kevin Langman (Cinnamon port)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// How this works
// --------------
// GNOME Shell moves whole workspace groups during a switch, and the GNOME extension
// only adds 3D transforms to them. Cinnamon has no such groups: its
// WindowManager._switchWorkspace() slides each window actor on its own. So this port
// replaces that method. While the cube is visible, global.window_group is hidden and a
// scene built from clones is shown instead:
//
//   root (in Main.uiGroup, directly above global.window_group)
//   |- the panorama, if any: one clone per rotating monitor (see Skybox)
//   |- one "cube" per rotating monitor, inside a perspective wrapper (see below)
//   |    '- one "face" per workspace: wallpaper, desktop layer (icons, desklets),
//   |         panels (if they are drawn on the faces), windows
//   |- one "static" layer per monitor that does not rotate
//   |    (only when workspaces are on the primary monitor only)
//   '- an overlay with windows that stay put: sticky windows and the window being
//      moved to the new workspace
//
// The cube is described by two numbers:
//   progress  horizontal rotation, measured in workspaces. Face i is rotated by
//             (i - progress) * faceAngle around a pivot behind the screen.
//   pitch     vertical tilt in [-1, 1], times MAX_VERTICAL_ROTATION degrees.
//   zoom      extra distance in pixels, set with the scroll wheel while dragging
//             (positive = closer). This is our own addition, not in the GNOME version.
//   autoZoom  in [0, 1]: how much of the "zoom out while the cube moves" setting is
//             applied right now. During a switch it follows the animation; during a
//             mouse rotation it follows how far the mouse has moved. Also our own
//             addition.
//
// The cube is shown in three situations ("modes"):
//   switch    Muffin switched workspaces (e.g. Ctrl+Alt+Arrow); we animate to it.
//   drag      The user is dragging a panel; the cube follows the mouse.
//   settle    The drag ended; we animate to the nearest workspace and then activate it.
//
// Per-monitor perspective: Clutter has a single camera, centered on the whole stage, so
// a cube on a monitor away from the stage center would be seen from the side and look
// skewed. The GNOME extension fixes this by changing the projection of each stage view
// (on X11 only for the monitor with the pointer). We use an exact equivalent that works
// for every monitor on X11 too: viewing the scene from a camera at M is the same as
// viewing it from the stage camera S after shearing it, i.e. moving each point
// sideways in proportion to its depth z by (S - M) * z / cameraDistance. Each cube gets
// a wrapper actor with that shear as its transform. The shear also maps camera M onto
// camera S, so the depth sorting below keeps working with the stage camera.
//
// Pushing the pointer against an outer left or right screen edge switches to the next
// workspace, taking a dragged window along, or starts free rotation (see EdgeSwitch).

const Clutter = imports.gi.Clutter;
const ExtensionSystem = imports.ui.extensionSystem;
const Cogl = imports.gi.Cogl;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gettext = imports.gettext;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Graphene = imports.gi.Graphene;
const Extension = imports.ui.extension;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const PointerTracker = imports.misc.pointerTracker;
const HotCorner = imports.ui.hotCorner;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Settings = imports.ui.settings;
const Signals = imports.signals;
const Util = imports.misc.util;

const UUID = 'Desktop-Cube-Reloaded@klangman';

// Translation support: look in the extension's own catalog first, then fall back to
// Cinnamon's. Strings with something filled in use "%s" and .format() rather than
// template literals, so xgettext can extract them and translators can move the value.
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(text) {
  const translated = Gettext.dgettext(UUID, text);
  return translated !== text ? translated : window._(text);
}

// Extensions that also replace Cinnamon's workspace switch animation. They patch the
// same functions and react to the same events as we do, so if one of them is already
// running when we are enabled, we do nothing at all (see _findConflicts).
const CONFLICTING_EXTENSIONS = ['DesktopCube@yare', 'Flipper@connerdev'];

// Workspaces are laid out in a single row, so vertical switches are left to Cinnamon.
const NOOP_DIRECTIONS = [Meta.MotionDirection.UP, Meta.MotionDirection.DOWN];

// Maximum degrees the cube can be tilted up and down (same as the GNOME extension).
const MAX_VERTICAL_ROTATION = 50;

// Spacing to the screen sides of the tilted cube (same as the GNOME extension).
const PADDING_V_ROTATION = 0.2;

// Pixels the mouse has to move before a press on a panel turns into a drag.
const DRAG_THRESHOLD = 8;

// Name of the hold-to-rotate keybinding registered with Cinnamon.
const SHORTCUT_NAME = 'desktop-cube-reloaded-rotate';

// Hot corner actions. Cinnamon's hot corner settings only offer Expo, Scale, Show
// desktop and "custom command", so the user picks "custom command" and enters one of
// these names. We intercept them before Cinnamon would run them as a command (see
// _patchHotCorners). They must not contain ':', the separator in the hotcorner-layout
// setting, and must not start with a built-in action name ('expo', 'scale', 'desktop'):
// the settings dialog saves the entry while the user types, and the moment the text is
// exactly a built-in name it switches the corner to that action.
const HOT_CORNER_ACTIONS = {
  FREE_ROTATE: 'cube-free-rotate',
  LEFT: 'cube-rotate-left',
  RIGHT: 'cube-rotate-right',
};

// Our settings that remember what Cinnamon had in each corner before a cube action was
// picked for it, in the order of Cinnamon's hotcorner-layout setting.
const HOT_CORNER_KEYS = ['hot-corner-top-left', 'hot-corner-top-right',
                         'hot-corner-bottom-left', 'hot-corner-bottom-right'];

// Scroll zoom, as fractions of the monitor width: per wheel click, and the limits.
const ZOOM_STEP = 0.1;
const MAX_ZOOM_IN = 0.3;
const MAX_ZOOM_OUT = 3.0;

// "Zoom out while the cube moves": part of a switch animation spent zooming out (and
// the same at the end for zooming back in), and how many pixels the mouse has to
// travel during a mouse rotation for the full zoom-out.
const AUTO_ZOOM_EDGE = 0.3;
// How far (in workspaces) the edge peek turns before a dragged window is fully faded.
const PEEK_FADE = 0.02;
const AUTO_ZOOM_DRAG_DISTANCE = 150;

let desktopCube = null;

// Decomposes the shear x' = x + c * z (in the x-z plane) into
//   rotation_y(angle1) * scale(scaleX, 1, scaleZ) * rotation_y(angle2)
// using Clutter/Cogl rotation conventions, angles in degrees. This is the closed-form
// singular value decomposition of a 2x2 matrix, here [[1, c], [0, 1]] acting on (x, z).
function shearDecomposition(c) {
  // E = (A00 + A11) / 2, F = (A00 - A11) / 2, G = (A10 + A01) / 2, H = (A10 - A01) / 2
  const e = 1, f = 0, g = c / 2, h = -c / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const a1 = Math.atan2(g, f);
  const a2 = Math.atan2(h, e);
  const theta = (a2 - a1) / 2;                     // A = Rot(phi) * diag(q + r, q - r) * Rot(theta)
  const phi = (a2 + a1) / 2;
  // rotation_y(t) maps (x, z) like the standard 2D rotation by -t, hence the signs.
  return [-phi * 180 / Math.PI, q + r, q - r, -theta * 180 / Math.PI];
}

// Shared notifier between this extension and Blur Cinnamon, published as
// global.desktopCubeNotifier. Whichever extension loads first creates it, and neither ever
// removes it, so either can use it at any time, whatever the load order. Each extension only
// clears or disconnects what it added itself.
//   notifier.active               true while the cube scene is up (the real window group,
//                                 desklets included, is hidden and only drawn through clones)
//   notifier.deskletBlurProvider  set by Blur Cinnamon while it blurs desklets, else null. Its
//                                 createDeskletBlur(deskletActor, offsetX, offsetY) returns an
//                                 actor that draws that desklet's blurred background, already
//                                 positioned with the offset applied, or null. The caller owns
//                                 the returned actor and destroys it. It may rely on clips, so
//                                 the cube only draws it inside a flat clip (createFlatClip()).
//   notifier.panelBlurProvider    the same for panels, optional: its createPanelBlur(panel,
//                                 offsetX, offsetY) gets a Cinnamon Panel object (not its actor)
//                                 and follows the same rules. Used when the panels are drawn on
//                                 the cube faces.
// Desktop Cube emits:
//   "cube-starting"  the scene is about to be built (desklets are still mapped)
//   "cube-finished"  the scene was destroyed (the real window group is about to be shown)
function getCubeNotifier() {
  let notifier = global.desktopCubeNotifier;
  if (!notifier || typeof notifier.connect !== 'function' || typeof notifier.emit !== 'function') {
    notifier = {active: false, deskletBlurProvider: null, panelBlurProvider: null};
    Signals.addSignalMethods(notifier);
    global.desktopCubeNotifier = notifier;
  }
  return notifier;
}

// Returns an actor of the given size at (x, y) that draws `child` clipped to that rect.
//
// Clips must never be applied under the cube's 3D transform: Cogl can only scissor a clip
// that stays an axis-aligned rectangle on screen, so a rotated one is drawn into the stencil
// buffer instead. Stencil clipping is fragile (the wallpaper flickered or vanished on some
// drivers, and every extra stencil clip in the scene made it worse). So the returned actor
// is redirected offscreen: its contents, and with them the clip, are drawn flat into a
// texture of exactly this size, and only that texture gets the 3D transform. Its own clip
// would be applied outside that texture, so the clip is on an inner actor. Nothing inside
// changes during a rotation, so the texture is only drawn once.
function createFlatClip(child, x, y, width, height) {
  const flat = new Clutter.Actor({x, y, width, height});
  flat.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
  const clip = new Clutter.Actor({width, height, clip_to_allocation: true});
  clip.add_child(child);
  flat.add_child(clip);
  return flat;
}

// True if `actor` or anything inside it clips its contents.
function hasClips(actor) {
  if (actor.has_clip || actor.clip_to_allocation) {
    return true;
  }
  for (let child = actor.get_first_child(); child; child = child.get_next_sibling()) {
    if (hasClips(child)) {
      return true;
    }
  }
  return false;
}

// Returns a clone of `source` for a cube face. A source with clips inside (a window blurred
// by Blur Cinnamon, a desklet with a scrolled area, ...) would have them applied under the
// cube's 3D transform, so its clone is redirected offscreen like createFlatClip(): the source
// is drawn flat into a texture, which is redrawn only when the source changes. A clone has
// no clip of its own, so no wrapper is needed.
function createFaceClone(source, x, y) {
  const clone = new Clutter.Clone({source, x, y});
  if (hasClips(source)) {
    clone.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
  }
  return clone;
}

// The rect a window actor paints into, in stage coordinates: its buffer plus its shadow.
function getPaintRect(actor) {
  try {
    const [ok, box] = actor.get_paint_box();
    if (ok) {
      return {x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2};
    }
  } catch (e) {
    // Fall back to the allocation below.
  }
  return {x1: actor.x, y1: actor.y, x2: actor.x + actor.width, y2: actor.y + actor.height};
}

// True if the two rects (Meta.Rectangle or monitor-style {x, y, width, height}) overlap.
function rectsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
         a.y < b.y + b.height && b.y < a.y + a.height;
}

// True if `rect` lies entirely inside `monitor`.
function rectInside(rect, monitor) {
  return rect.x >= monitor.x && rect.y >= monitor.y &&
         rect.x + rect.width <= monitor.x + monitor.width &&
         rect.y + rect.height <= monitor.y + monitor.height;
}

// Returns a clone of a window actor for a face of `monitor`, showing only the part of the
// window that is on that monitor, the way the real screen shows it. Used for windows that
// straddle two monitors (each monitor's cube gets its own part) or hang off the screen.
// The clip is done flat (see createFlatClip()), never under the cube's 3D transform. The
// clip rect starts from the paint box rather than the frame so the shadow is kept on the
// sides away from the monitor edge. Returns null if nothing of the window is on `monitor`.
function createMonitorClippedClone(actor, monitor) {
  const paint = getPaintRect(actor);
  const x1 = Math.floor(Math.max(paint.x1, monitor.x));
  const y1 = Math.floor(Math.max(paint.y1, monitor.y));
  const x2 = Math.ceil(Math.min(paint.x2, monitor.x + monitor.width));
  const y2 = Math.ceil(Math.min(paint.y2, monitor.y + monitor.height));
  if (x2 <= x1 || y2 <= y1) {
    return null;
  }
  const clone = new Clutter.Clone({source: actor, x: actor.x - x1, y: actor.y - y1});
  return createFlatClip(clone, x1 - monitor.x, y1 - monitor.y, x2 - x1, y2 - y1);
}

class DesktopCube {
  constructor(metadata) {
    this._meta = metadata;
    this._anim = null;
    this._drag = null;
    this._blocked = false;
  }

  // ------------------------------------------------------------------------ lifecycle

  enable() {
    // Refuse to run next to an extension we would fight with. Nothing has been set up
    // at this point, so disable() has nothing to undo either.
    const conflicts = this._findConflicts();
    this._blocked = conflicts.length > 0;
    if (this._blocked) {
      global.logWarning(`${this._meta.uuid}: not starting, conflicting extension(s) ` +
                        `already loaded: ${conflicts.map(c => c.uuid).join(', ')}`);
      this._showConflict(conflicts.map(c => c.name));
      return;
    }

    this._settings = new Settings.ExtensionSettings(this, this._meta.uuid);

    // The About tab of the settings dialog shows this.
    this._settings.setValue('ext-version', this._meta.version);

    // "Leave a gap between the last and first workspace" follows Cinnamon's "Allow
    // cycling through workspaces": cycling means the workspaces wrap around, which is
    // what a closed cube (no gap) shows. While we are enabled, any change to the
    // Cinnamon setting is copied to ours. Changes made while we are not running are
    // picked up when the user enables the extension (the first time, or again after
    // disabling it). 'gap-synced' is set here and cleared in disable(), so a restart of
    // Cinnamon or a new login, where enable() runs without a matching disable(), keeps
    // a gap setting the user changed on our side afterwards.
    this._muffinSettings = null;
    this._workspaceCycleID = 0;
    try {
      this._muffinSettings = new Gio.Settings({ schema_id: 'org.cinnamon.muffin' });
      this._workspaceCycleID = this._muffinSettings.connect('changed::workspace-cycle',
                                                            () => this._syncGapSetting());
      if (!this._settings.getValue('gap-synced')) {
        this._syncGapSetting();
      }
    } catch (e) {
      global.logError(`${this._meta.uuid}: could not read workspace-cycle: ${e}`);
    }
    this._settings.setValue('gap-synced', true);

    // _switchWorkspace normally lives on WindowManager.prototype. Cinnamon connects
    // 'switch-workspace' with an arrow function that calls this._switchWorkspace(), so
    // shadowing the method on the Main.wm instance is enough to take it over.
    this._hadOwnSwitch = Object.prototype.hasOwnProperty.call(Main.wm, '_switchWorkspace');
    this._origSwitch = Main.wm._switchWorkspace;
    // Muffin waits for completed_switch_workspace() after every switch, so an error in
    // our code must never leave a switch uncompleted.
    this._hook = (cinnamonwm, from, to, direction) => {
      this._switchCounted = false;
      try {
        this._switchWorkspace(cinnamonwm, from, to, direction);
      } catch (e) {
        global.logError(`${this._meta.uuid}: workspace switch failed: ${e}\n${e.stack}`);
        this._finish();
        if (!this._switchCounted) {
          cinnamonwm.completed_switch_workspace();
        }
      }
    };
    Main.wm._switchWorkspace = this._hook;

    // Rotating the cube with the mouse: by dragging a panel, or while holding a shortcut.
    this._drag = new DragController(this);
    this._settings.bind('cube-shortcut', 'cubeShortcut', () => this._updateShortcut());
    this._updateShortcut();
    this._patchHotCorners();

    // Remember which window the user is dragging around; it stays in front of the cube.
    this._draggedWindow = null;
    // Muffin's grab-op-begin passes the display again as its first argument, so the
    // handler gets (emitter, display, window, op) - unlike GNOME's (display, window, op).
    this._grabBeginID = global.display.connect('grab-op-begin', (emitter, display, window, op) => {
      if (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING) {
        this._draggedWindow = window;
      }
    });
    this._grabEndID = global.display.connect('grab-op-end', () => {
      this._draggedWindow = null;
    });

    this._edgeSwitch = new EdgeSwitch(this);
    this._settings.bind('enable-edge-switch', 'enableEdgeSwitch',
                        () => this._edgeSwitch && this._edgeSwitch.update(true));
    this._settings.bind('enable-edge-push', 'enableEdgePush',
                        () => this._edgeSwitch && this._edgeSwitch.update(true));

    this._skybox = null;
    this._settings.bind('enable-panorama', 'enablePanorama', () => this._updateSkybox(true));
    this._settings.bind('background-panorama', 'backgroundPanorama',
                        () => this._updateSkybox(true));
    this._updateSkybox(false);

    // The first time the extension runs, explain how to use it.
    if (this._settings.getValue('new-install')) {
      this._settings.setValue('new-install', false);
      this._showWelcome();
    }
  }

  disable() {
    // Cinnamon also calls disable() when it reloads the extension (an update, or the
    // reload button in Looking Glass), but not when it shuts down or restarts. Only
    // unloadRemovedExtensions() means the user took the extension out.
    const removed = new Error().stack.includes('unloadRemovedExtensions@');

    if (this._blocked) {
      // enable() bailed out before changing anything. The hot corners may still hold
      // cube actions from an earlier session, though.
      this._blocked = false;
      if (removed) {
        try {
          const settings = new Settings.ExtensionSettings(this, this._meta.uuid);
          this._restoreHotCorners(settings);
          settings.finalize();
        } catch (e) {
          global.logError(`${this._meta.uuid}: could not restore the hot corners: ${e}`);
        }
      }
      return;
    }
    Main.keybindingManager.removeHotKey(SHORTCUT_NAME);
    this._unpatchHotCorners();
    this._drag.destroy();
    this._drag = null;
    this._edgeSwitch.destroy();
    this._edgeSwitch = null;
    global.display.disconnect(this._grabBeginID);
    global.display.disconnect(this._grabEndID);
    this._draggedWindow = null;
    this._finish();

    if (this._skybox) {
      this._skybox.destroy();
      this._skybox = null;
    }

    if (Main.wm._switchWorkspace === this._hook) {
      if (this._hadOwnSwitch) {
        Main.wm._switchWorkspace = this._origSwitch;
      } else {
        delete Main.wm._switchWorkspace;
      }
    }
    this._hook = null;
    this._origSwitch = null;

    if (this._muffinSettings) {
      if (this._workspaceCycleID) {
        this._muffinSettings.disconnect(this._workspaceCycleID);
      }
      this._workspaceCycleID = 0;
      this._muffinSettings = null;
    }

    if (this._settings) {
      // Sync the gap setting again the next time the extension is enabled.
      this._settings.setValue('gap-synced', false);
      // If the extension is being removed rather than reloaded, show the welcome
      // notification again should the user ever add it back, and give the hot corners
      // that run a cube action back to Cinnamon.
      if (removed) {
        this._settings.setValue('new-install', true);
        this._restoreHotCorners(this._settings);
      }
      this._settings.finalize();
      this._settings = null;
    }
  }

  // The conflicting extensions (see CONFLICTING_EXTENSIONS) that are running right now,
  // as [{uuid, name}]. Cinnamon adds an extension to runningExtensions once its enable()
  // has returned, so this finds the ones that were loaded before us. An extension loaded
  // after us is not noticed; it is up to that one to step aside.
  _findConflicts() {
    const conflicts = [];
    try {
      const running = ExtensionSystem.runningExtensions || [];
      for (const uuid of CONFLICTING_EXTENSIONS) {
        if (!running.includes(uuid)) {
          continue;
        }
        const extension = Extension.getExtension(uuid);
        const name = extension && extension.meta && extension.meta.name;
        conflicts.push({uuid, name: name || uuid});
      }
    } catch (e) {
      global.logError(`${this._meta.uuid}: could not check for conflicting extensions: ${e}`);
    }
    return conflicts;
  }

  // A notification telling the user why the cube is not working: `names` are the
  // conflicting extensions that were loaded before us.
  _showConflict(names) {
    const body = [
      _('Desktop Cube Reloaded can not be used together with: %s')
        .format(names.join(', ')),
      _('Both change how Cinnamon switches workspaces, so Desktop Cube Reloaded will ' +
        'do nothing until the other extension is removed. After removing it, disable ' +
        'Desktop Cube Reloaded and enable it again.'),
    ].join('\n\n');
    const [source, notification] =
      this._createNotification(_('Desktop Cube Reloaded is not running'), body);
    notification.addButton('extensions', _('Open Extensions Settings'));
    notification.connect('action-invoked', (self, id) => {
      if (id === 'extensions') {
        Util.spawn(['cinnamon-settings', 'extensions']);
      }
    });
    notification.setUrgency(MessageTray.Urgency.CRITICAL);
    source.notify(notification);
  }

  // Returns [source, notification] for a notification with our icon. The caller adds
  // buttons as needed and shows it with source.notify(notification).
  _createNotification(title, body) {
    const source = new MessageTray.Source(this._meta.name);
    const params = {};
    // With "multiversion" the metadata path is the version folder (e.g. ".../6.0");
    // icon.png is one up.
    const dir = /^\d+(\.\d+)+$/.test(GLib.path_get_basename(this._meta.path)) ?
      GLib.path_get_dirname(this._meta.path) : this._meta.path;
    const file = Gio.File.new_for_path(GLib.build_filenamev([dir, 'icon.png']));
    params.icon = new St.Icon({gicon: new Gio.FileIcon({file}), icon_size: source.ICON_SIZE});
    const notification = new MessageTray.Notification(source, title, body, params);
    Main.messageTray.add(source);
    return [source, notification];
  }

  // A notification telling a new user what the extension does and how to rotate the
  // cube freely, with a button that opens the settings dialog.
  _showWelcome() {
    // The hold-to-rotate shortcut as the user has it set, e.g. "<Super><Alt>space"
    // becomes "Super+Alt+Space". Only the first binding is shown.
    const binding = (this._settings.getValue('cube-shortcut') || '').split('::')[0];
    const shortcut = binding.replace(/<(Primary|Control)>/g, 'Ctrl+')
                            .replace(/<(\w+)>/g, '$1+')
                            .replace(/\+(\w)/g, (m, c) => '+' + c.toUpperCase());
    const howToSpin = shortcut ?
      _('To spin the cube freely, drag an empty part of a panel with the left mouse ' +
        'button, or hold %s and move the mouse.').format(shortcut) :
      _('To spin the cube freely, drag an empty part of a panel with the left mouse button.');
    const body = [
      _('Switching workspaces now rotates your desktop as the faces of a 3D cube.'),
      howToSpin + ' ' +
      _('Move sideways to rotate, up or down to tilt, and scroll to zoom. Let go to ' +
        'switch to the workspace facing you, or press Esc to go back.'),
      _('In the settings you can also set a hot corner that starts free rotation, and ' +
        'add a panorama image around the cube on the Background tab.'),
    ].join('\n\n');
    const [source, notification] =
      this._createNotification(_('Welcome to Desktop Cube Reloaded'), body);
    notification.addButton('cube-settings', _('Open Desktop Cube Reloaded Settings'));
    notification.connect('action-invoked', (self, id) => {
      if (id === 'cube-settings') {
        Util.spawn(['xlet-settings', 'extension', this._meta.uuid]);
      }
    });
    notification.setUrgency(MessageTray.Urgency.CRITICAL);
    source.notify(notification);
  }

  // Copies Cinnamon's "Allow cycling through workspaces" to our gap setting (inverted).
  // Only the next rotation uses the new value; a cube shown right now is not changed.
  _syncGapSetting() {
    const gap = !this._muffinSettings.get_boolean('workspace-cycle');
    if (this._settings.getValue('last-first-gap') !== gap) {
      this._settings.setValue('last-first-gap', gap);
    }
  }

  // (Re)loads the panorama when its settings change. The cube shown right now (if any)
  // keeps its old background; the new one is used from the next rotation on.
  // `notifyWhenReady` is set when the user changed the settings, so they hear when the
  // new panorama is ready; at startup the panorama loads quietly.
  _updateSkybox(notifyWhenReady) {
    if (this._skybox) {
      this._skybox.destroy();
      this._skybox = null;
    }

    const file = this._settings.getValue('background-panorama');
    if (this._settings.getValue('enable-panorama') && file) {
      this._skybox = new Skybox(file, this._meta.uuid, notifyWhenReady);
    }
  }

  // (Re)registers the hold-to-rotate shortcut. The binding passed to the callback tells
  // us which modifiers the user has to keep holding.
  _updateShortcut() {
    Main.keybindingManager.removeHotKey(SHORTCUT_NAME);
    const shortcut = this._settings.getValue('cube-shortcut');
    if (shortcut) {
      Main.keybindingManager.addHotKey(SHORTCUT_NAME, shortcut, (...args) => {
        const binding = args.find(arg => arg && typeof arg.get_mask === 'function');
        this._drag.startFromShortcut(binding ? binding.get_mask() : 0);
      });
    }
  }

  // ---------------------------------------------------------------------- hot corners

  // HotCorner.runAction() handles 'expo', 'scale' and 'desktop' and runs anything else
  // as a shell command. We wrap it on the prototype, so the corners that already exist
  // pick it up too, and handle our own action names before they reach the shell.
  //
  // In Cinnamon 6.0 - 6.6 the HotCorner class is declared with `class HotCorner`, which
  // the module doesn't export (only later versions use `var`). HotCornerManager is
  // exported in all of them, so we take the prototype from a corner it created. If no
  // corner is enabled yet, we wrap HotCornerManager.update(), which creates the corners
  // whenever the hot corner settings change, and patch as soon as one exists.
  _patchHotCorners() {
    this._hotCornerProto = null;
    this._origRunAction = null;
    this._hotCornerRunAction = null;

    const managerProto = HotCorner.HotCornerManager.prototype;
    const origUpdate = managerProto.update;
    const cube = this;
    this._origCornerUpdate = origUpdate;
    this._hotCornerUpdate = function (...args) {
      const result = origUpdate.apply(this, args);
      if (cube._hotCornerUpdate) {
        cube._patchHotCornerPrototype(this);
      }
      return result;
    };
    managerProto.update = this._hotCornerUpdate;

    this._patchHotCornerPrototype(Main.layoutManager.hotCornerManager);
  }

  // Patches runAction on the prototype of the manager's corners, once.
  _patchHotCornerPrototype(manager) {
    if (this._hotCornerProto || !manager || !manager.corners) {
      return;
    }
    const corner = Object.values(manager.corners).find(c => c);
    if (!corner) {
      return;
    }

    const proto = Object.getPrototypeOf(corner);
    const orig = proto.runAction;
    if (typeof orig !== 'function') {
      global.logError(`${this._meta.uuid}: hot corners have no runAction(); ` +
                      'hot corner actions are not available');
      return;
    }

    const cube = this;
    this._hotCornerProto = proto;
    this._origRunAction = orig;
    this._hotCornerRunAction = function (timestamp) {
      // If another extension wrapped runAction after us, we may still be called after
      // being disabled; then just behave like Cinnamon.
      if (cube._drag) {
        try {
          if (cube._runHotCornerAction(this.action, timestamp)) {
            return;
          }
        } catch (e) {
          global.logError(`${cube._meta.uuid}: hot corner action failed: ${e}\n${e.stack}`);
          return;
        }
      }
      orig.call(this, timestamp);
    };
    proto.runAction = this._hotCornerRunAction;
  }

  _unpatchHotCorners() {
    const managerProto = HotCorner.HotCornerManager.prototype;
    if (managerProto.update === this._hotCornerUpdate) {
      managerProto.update = this._origCornerUpdate;
    }
    if (this._hotCornerProto && this._hotCornerProto.runAction === this._hotCornerRunAction) {
      this._hotCornerProto.runAction = this._origRunAction;
    }
    this._hotCornerUpdate = null;
    this._origCornerUpdate = null;
    this._hotCornerProto = null;
    this._hotCornerRunAction = null;
    this._origRunAction = null;
  }

  // Called when the extension is removed. Every corner that is set to a cube action
  // right now goes back to what Cinnamon had there before (kept in our hot-corner-*
  // settings by the settings dialog, see HotCornerChooser in CustomWidgets.py), or to
  // Cinnamon's default if nothing was saved. Without this, Cinnamon would try to run the
  // cube action names as shell commands. Corners that don't hold a cube action, and so
  // the whole setting if none does, are left alone.
  _restoreHotCorners(settings) {
    try {
      const cinnamon = new Gio.Settings({schema_id: 'org.cinnamon'});
      const layout = cinnamon.get_strv('hotcorner-layout');
      if (layout.length !== HOT_CORNER_KEYS.length) {
        return;
      }
      const defaultValue = cinnamon.get_default_value('hotcorner-layout');
      const defaults = defaultValue ? defaultValue.deep_unpack() : [];
      const cubeActions = Object.values(HOT_CORNER_ACTIONS);

      let changed = false;
      HOT_CORNER_KEYS.forEach((key, i) => {
        // "action:enabled:delay"; the action (a command) may itself contain ':'.
        const match = /^(.*):([^:]*):[^:]*$/.exec(layout[i]);
        if (!match || match[2] !== 'true' || !cubeActions.includes(match[1])) {
          return;
        }
        layout[i] = settings.getValue(key) || defaults[i] || 'expo:false:0';
        settings.setValue(key, '');
        changed = true;
      });
      if (changed) {
        cinnamon.set_strv('hotcorner-layout', layout);
      }
    } catch (e) {
      global.logError(`${this._meta.uuid}: could not restore the hot corners: ${e}`);
    }
  }

  // Returns true if `action` is one of ours.
  _runHotCornerAction(action, timestamp) {
    switch (action) {
      case HOT_CORNER_ACTIONS.FREE_ROTATE:
        this._drag.startFromHotCorner(timestamp);
        return true;
      case HOT_CORNER_ACTIONS.LEFT:
        this._switchToNeighbor(Meta.MotionDirection.LEFT, timestamp);
        return true;
      case HOT_CORNER_ACTIONS.RIGHT:
        this._switchToNeighbor(Meta.MotionDirection.RIGHT, timestamp);
        return true;
    }
    return false;
  }

  // Same as Ctrl+Alt+Left/Right (Cinnamon's actionMoveWorkspaceLeft/Right), including
  // wrapping around if "workspace-cycle" is on, but with the hot corner's timestamp:
  // the hover activation runs from a timeout, where global.get_current_time() is 0.
  // The switch then goes through our _switchWorkspace hook like any other.
  _switchToNeighbor(direction, timestamp) {
    if (Main.modalCount) {
      return;
    }
    const active = global.workspace_manager.get_active_workspace();
    const neighbor = active.get_neighbor(direction);
    if (neighbor && neighbor !== active) {
      neighbor.activate(timestamp || global.get_current_time());
    }
  }


  // ------------------------------------------------------------ workspace switching

  _switchWorkspace(cinnamonwm, from, to, direction) {
    const nWorkspaces = global.workspace_manager.get_n_workspaces();

    // We activated this workspace ourselves at the end of a drag, while the cube still
    // covers the screen. The cube is already showing it; just finish together with it.
    if (this._anim && (this._anim.absorbSwitch || this._anim.mode === 'drag')) {
      this._anim.pending++;
      this._switchCounted = true;
      this._playSwitchFeedback();
      return;
    }

    // Cinnamon 6.8 added trackpad swipes that slide the workspaces under the fingers
    // (Main.wm.workspaceAnimation) and activate the new workspace only once the slide
    // has settled. Cinnamon's own _switchWorkspace() takes care of two cases, and so
    // must we. Older versions don't have workspaceAnimation.
    const swipe = Main.wm.workspaceAnimation;
    if (swipe) {
      // This switch comes from a swipe that already animated it; rotating the cube now
      // would show the same switch a second time. Cinnamon's code just completes it.
      if (swipe.gestureActive) {
        this._finish();
        this._switchCounted = true;   // Cinnamon's own code completes it.
        this._origSwitch.call(Main.wm, cinnamonwm, from, to, direction);
        return;
      }
      // Something else switched workspaces during a swipe that still follows the
      // fingers. Drop the swipe, or its clones stay on screen next to the cube. That
      // shows the window group again, which has to stay hidden while the cube is up.
      swipe.cancelSwitchAnimation();
      if (this._anim) {
        global.window_group.hide();
      }
    }

    // Leave everything we don't handle to Cinnamon's own implementation. That includes
    // the case where animations are off, which Cinnamon handles by completing at once.
    const useCube = Main.animations_enabled && !Main.modalCount && nWorkspaces > 1 &&
      from !== to && !NOOP_DIRECTIONS.includes(direction);

    if (!useCube) {
      this._finish();
      this._switchCounted = true;   // Cinnamon's own code completes it.
      this._origSwitch.call(Main.wm, cinnamonwm, from, to, direction);
      return;
    }

    this._playSwitchFeedback();

    // Cinnamon sets _movingWindow when a window is moved to the next workspace with the
    // keyboard; that window stays in place while the cube turns. Like Cinnamon's own
    // animation, each switch takes it over, so a later plain switch doesn't keep it.
    const movingWindow = Main.wm._movingWindow || null;
    Main.wm._movingWindow = undefined;

    // A workspace was added or removed while the cube was shown; it is outdated.
    if (this._anim && this._anim.nWorkspaces !== nWorkspaces) {
      this._finish();
    }

    // If the cube is still moving, continue from where it is right now.
    const base = this._anim ? this._nearestEquivalent(from, this._anim.progress) : from;
    const target = base + this._getSteps(from, to, nWorkspaces);

    // The window that stays in place changed (another window was moved, or this is a
    // plain switch right after moving one): rebuild the scene around the current pose.
    if (this._anim && this._anim.movingWindow !== movingWindow) {
      this._rebuildScene(movingWindow);
    }

    this._ensureScene(from, movingWindow);
    this._anim.mode = 'switch';
    this._anim.pending++;   // Muffin counts switches; each needs a completion call.
    this._switchCounted = true;
    this._animateTo(target, this._settings.getValue('animation-time'));
  }

  _playSwitchFeedback() {
    if (Main.soundManager) {
      Main.soundManager.play('switch');
    }
    Main.wm.showWorkspaceOSD();
  }

  // How many workspaces the cube turns, signed (positive = to the right).
  _getSteps(from, to, n) {
    // With the gap there is no wrap-around: we always rotate through the workspaces in
    // between, exactly like the GNOME extension.
    if (this._settings.getValue('last-first-gap')) {
      return to - from;
    }

    // A closed cube takes the shortest way. Muffin derives the direction from the
    // workspace positions, so it can't tell us that the user wrapped around.
    let steps = ((to - from) % n + n) % n;
    if (steps > n / 2) {
      steps -= n;
    }
    return steps;
  }

  // On a closed cube, progress values that differ by a multiple of n show the same
  // workspace. Returns the one for workspace `index` that is closest to `progress`.
  _nearestEquivalent(index, progress) {
    if (this._settings.getValue('last-first-gap')) {
      return index;
    }
    const n = this._anim.nWorkspaces;
    return index + n * Math.round((progress - index) / n);
  }

  // ----------------------------------------------------------------------- dragging

  // Called by DragController when a drag starts. Returns false if the cube can't be
  // shown.
  beginDrag() {
    const nWorkspaces = global.workspace_manager.get_n_workspaces();
    if (nWorkspaces < 2) {
      return false;
    }
    if (this._anim && this._anim.nWorkspaces !== nWorkspaces) {
      this._finish();
    }

    // If a switch animation is still running, grab the cube where it is.
    this._ensureScene(global.workspace_manager.get_active_workspace_index());
    this._anim.timeline.stop();
    this._anim.mode = 'drag';
    this._anim.dragStartProgress = this._nearestEquivalent(
      global.workspace_manager.get_active_workspace_index(), this._anim.progress);

    // The automatic zoom-out follows the mouse: it grows with the distance the mouse
    // travels, starting from wherever a running switch animation had it.
    this._anim.dragAutoZoomStart = this._anim.autoZoom;
    this._anim.dragDistance = 0;
    return true;
  }

  // Esc during a drag: go back to the workspace the drag started on.
  cancelDrag() {
    const anim = this._anim;
    if (!anim || anim.mode !== 'drag') {
      return;
    }
    anim.mode = 'settle';
    this._animateTo(anim.dragStartProgress, this._settings.getValue('animation-time'));
  }

  // deltaX is the horizontal mouse movement in pixels, pitch is in [-1, 1], and moved is
  // how far the mouse travelled since the last update (in any direction).
  updateDrag(deltaX, pitch, moved = 0) {
    const anim = this._anim;
    if (!anim || anim.mode !== 'drag') {
      return;
    }

    // Same as the GNOME extension: one workspace per screen width (divided by the
    // speed setting), and faster while the cube is tilted so you can spin it quickly.
    const speed = this._settings.getValue('mouse-rotation-speed');
    const width = Main.layoutManager.primaryMonitor.width;
    const tiltBoost = 1 + (anim.nWorkspaces - 1) * Math.abs(pitch);

    anim.progress = this._clampProgress(anim.progress - deltaX * speed * tiltBoost / width);
    anim.pitch = Math.max(-1, Math.min(1, pitch));

    anim.dragDistance += moved;
    const start = anim.dragAutoZoomStart;
    anim.autoZoom = start + (1 - start) *
      Math.min(1, anim.dragDistance / AUTO_ZOOM_DRAG_DISTANCE);
    anim.fade = Math.max(anim.fade, Math.min(1, anim.dragDistance / AUTO_ZOOM_DRAG_DISTANCE));
    this._updateCubes();
  }

  // Scroll wheel during a drag. steps > 0 zooms in, steps < 0 zooms out; smooth
  // scrolling gives fractional steps.
  zoomDrag(steps) {
    const anim = this._anim;
    if (!anim || anim.mode !== 'drag') {
      return;
    }
    const width = Main.layoutManager.primaryMonitor.width;
    anim.zoom = Math.max(-MAX_ZOOM_OUT * width,
                         Math.min(MAX_ZOOM_IN * width, anim.zoom + steps * ZOOM_STEP * width));
    this._updateCubes();
  }

  // velocity is in workspaces per millisecond, used to "throw" the cube.
  endDrag(velocity) {
    const anim = this._anim;
    if (!anim || anim.mode !== 'drag') {
      return;
    }

    const thrown = anim.progress + Math.max(-0.5, Math.min(0.5, velocity * 150));
    const target = this._clampProgress(Math.round(thrown));

    anim.mode = 'settle';
    const duration = Math.max(this._settings.getValue('animation-time'),
                              500 * Math.abs(anim.pitch));
    this._animateTo(target, duration);
  }

  // Edge push: the cube is held in drag mode without a modal grab, so the user keeps
  // working normally; _switchWorkspace absorbs switches as it does during a drag.
  beginPeek() {
    return this.beginDrag();
  }

  // offset in workspaces, signed (positive = to the right).
  updatePeek(offset) {
    const anim = this._anim;
    if (!anim || anim.mode !== 'drag') {
      return;
    }
    anim.progress = this._clampProgress(anim.dragStartProgress + offset);
    // A light zoom-out that grows with the peek, like the one during a mouse rotation.
    const start = anim.dragAutoZoomStart;
    anim.autoZoom = start + (1 - start) * Math.min(1, Math.abs(offset) / 0.25);
    // The peek turns the cube only a little, so a dragged window is fully see-through
    // early on; it gets solid again as the cube settles.
    anim.fade = Math.min(1, Math.abs(offset) / PEEK_FADE);
    this._updateCubes();
  }

  commitPeek(direction) {
    const anim = this._anim;
    if (!anim || anim.mode !== 'drag') {
      return;
    }
    const target = this._clampProgress(anim.dragStartProgress + direction);
    anim.mode = 'settle';
    // Only the rest of the turn is left, so take proportionally less time.
    this._animateTo(target, this._settings.getValue('animation-time') *
                    Math.abs(target - anim.progress));
  }

  _clampProgress(progress) {
    if (this._settings.getValue('last-first-gap')) {
      return Math.max(0, Math.min(this._anim.nWorkspaces - 1, progress));
    }
    return progress;
  }

  // ---------------------------------------------------------------------- animation

  // Shows the cube, facing workspace `index`, unless it is already shown. movingWindow
  // is a window being moved to the new workspace with the keyboard; it doesn't rotate.
  _ensureScene(index, movingWindow = null) {
    if (this._anim) {
      return;
    }

    const timeline = this._createTimeline();
    timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_CUBIC);

    this._anim = {
      mode: 'switch',
      nWorkspaces: global.workspace_manager.get_n_workspaces(),
      pending: 0,
      absorbSwitch: false,
      movingWindow: movingWindow,
      progress: index,
      pitch: 0,
      zoom: 0,
      autoZoom: 0,
      fade: 0,      // how see-through a carried window is, 0..1 (scaled by the setting)
      start: {progress: index, pitch: 0, zoom: 0, autoZoom: 0, fade: 0},
      target: {progress: index, pitch: 0, zoom: 0},
      timeline: timeline,
      cubes: [],
      root: null,
    };

    // If building the scene fails half way, undo whatever was done.
    try {
      this._buildScene();
    } catch (e) {
      this._finish();
      throw e;
    }

    // Errors in the per-frame code end the animation instead of leaving the cube up.
    const guard = (what, func) => () => {
      try {
        func();
      } catch (e) {
        global.logError(`${this._meta.uuid}: ${what} failed: ${e}\n${e.stack}`);
        this._finish();
      }
    };

    const anim = this._anim;
    anim.newFrameID = timeline.connect('new-frame', guard('animation frame', () => {
      const t = timeline.get_progress();
      anim.progress = anim.start.progress + (anim.target.progress - anim.start.progress) * t;
      anim.pitch = anim.start.pitch + (anim.target.pitch - anim.start.pitch) * t;
      anim.zoom = anim.start.zoom + (anim.target.zoom - anim.start.zoom) * t;
      if (anim.mode === 'settle') {
        // After a mouse rotation: zoom back in together with the rotation and tilt
        // (same eased progress), so the cube squares up and comes forward in one motion.
        anim.autoZoom = anim.start.autoZoom * (1 - t);
        anim.fade = anim.start.fade * (1 - t);
      } else {
        const elapsed = timeline.get_elapsed_time() / timeline.get_duration();
        anim.autoZoom = this._autoZoomEnvelope(elapsed, anim.start.autoZoom);
        anim.fade = this._autoZoomEnvelope(elapsed, anim.start.fade);
      }
      this._updateCubes();
    }));
    anim.completedID = timeline.connect('completed',
                                        guard('animation end', () => this._onAnimationDone()));

    // No 'kill-switch-workspace' handler: Muffin emits it only right before it calls
    // _switchWorkspace again, and that continues the rotation from where it is. Ending
    // the animation there would make every quick second switch start over.

    this._updateCubes();
  }

  // Replaces the cube's contents with a fresh scene, keeping the rotation, the zoom and
  // the running animation. Used when the windows that stay in place change mid-turn.
  _rebuildScene(movingWindow) {
    const anim = this._anim;
    if (anim.root) {
      anim.root.destroy();
    }
    anim.root = null;
    anim.skyLayer = null;
    anim.skybox = null;
    anim.cubes = [];
    anim.followers = [];
    if (anim.cubeNotified) {
      const notifier = getCubeNotifier();
      notifier.active = false;
      notifier.emit('cube-finished');
      anim.cubeNotified = false;
    }
    // _buildScene clones the desklets inside the window group while it is visible and
    // hides it again; nothing is painted in between.
    global.window_group.show();

    anim.movingWindow = movingWindow;
    try {
      this._buildScene();
    } catch (e) {
      this._finish();
      throw e;
    }
    this._updateCubes();
  }

  // Newer Clutter versions drive timelines from a frame clock and want an actor;
  // older ones (Cinnamon 6.0 and 6.2) don't have that property at all.
  _createTimeline() {
    try {
      return new Clutter.Timeline({duration: 1000, actor: global.stage});
    } catch (e) {
      return new Clutter.Timeline({duration: 1000});
    }
  }

  // How much of the automatic zoom-out to apply at time t (0..1, not eased) of an
  // animation that started with `start` of it applied: zoom out during the first part
  // (from wherever it was), hold, and zoom back in during the last part.
  _autoZoomEnvelope(t, start) {
    const smooth = x => {
      x = Math.max(0, Math.min(1, x));
      return x * x * (3 - 2 * x);
    };
    const zoomOut = start + (1 - start) * smooth(t / AUTO_ZOOM_EDGE);
    const zoomIn = smooth((1 - t) / AUTO_ZOOM_EDGE);
    return Math.min(zoomOut, zoomIn);
  }

  // Animates from the current position to the given progress, and back to zero pitch
  // and zoom.
  _animateTo(progress, duration) {
    const anim = this._anim;
    anim.start = {progress: anim.progress, pitch: anim.pitch, zoom: anim.zoom,
                  autoZoom: anim.autoZoom, fade: anim.fade};
    anim.target = {progress: progress, pitch: 0, zoom: 0};

    const timeline = anim.timeline;
    timeline.stop();
    timeline.set_duration(Math.max(50, Math.round(duration)));
    timeline.rewind();
    timeline.start();
  }

  _onAnimationDone() {
    const anim = this._anim;
    if (!anim) {
      return;
    }

    // After a drag, the cube has turned to some workspace; now make it the real one.
    // This emits 'switch-workspace' right away, which _switchWorkspace absorbs.
    if (anim.mode === 'settle') {
      const n = anim.nWorkspaces;
      const index = ((Math.round(anim.target.progress) % n) + n) % n;
      const workspace = global.workspace_manager.get_workspace_by_index(index);
      if (workspace && index !== global.workspace_manager.get_active_workspace_index()) {
        anim.absorbSwitch = true;
        workspace.activate(global.get_current_time());
        anim.absorbSwitch = false;
      }
    }

    this._finish();
  }

  // Hides the cube, if shown, and restores the real windows. This also cleans up after
  // a scene that failed half way, so each step checks what actually happened and
  // errors in one step don't prevent the others.
  _finish() {
    const anim = this._anim;
    if (!anim) {
      return;
    }
    this._anim = null;

    const step = (func) => {
      try {
        func();
      } catch (e) {
        global.logError(`${this._meta.uuid}: cleanup failed: ${e}`);
      }
    };

    step(() => {
      if (anim.newFrameID) {
        anim.timeline.disconnect(anim.newFrameID);
      }
      if (anim.completedID) {
        anim.timeline.disconnect(anim.completedID);
      }
      anim.timeline.stop();
    });

    step(() => {
      if (anim.root) {
        anim.root.destroy();
      }
    });
    // All clones are gone; tell Blur Cinnamon before the real desklets come back.
    if (anim.cubeNotified) {
      step(() => {
        const notifier = getCubeNotifier();
        notifier.active = false;
        notifier.emit('cube-finished');
      });
    }
    step(() => global.window_group.show());
    step(() => {
      if (anim.unredirectDisabled) {
        Meta.enable_unredirect_for_display(global.display);
      }
    });
    Main.wm._movingWindow = undefined;

    for (let i = 0; i < anim.pending; i++) {
      step(() => global.window_manager.completed_switch_workspace());
    }
  }


  // ---------------------------------------------------------------- building the scene

  _buildScene() {
    const anim = this._anim;
    const monitors = Main.layoutManager.monitors;
    const primary = Main.layoutManager.primaryIndex;
    // Same check Cinnamon uses for its workspace OSD.
    const onlyPrimary = Main.wm.wm_settings.get_boolean('workspaces-only-on-primary');
    const isRotating = (index) => !onlyPrimary || index === primary;

    // Let Blur Cinnamon know before anything is cloned or hidden.
    const notifier = getCubeNotifier();
    notifier.active = true;
    anim.cubeNotified = true;
    try {
      notifier.emit('cube-starting');
    } catch (e) {
      global.logError(`${this._meta.uuid}: cube-starting handler failed: ${e}`);
    }

    const root = new Clutter.Actor({
      name: 'desktop-cube-reloaded',
      width: global.screen_width,
      height: global.screen_height,
    });
    anim.root = root;

    // The panorama, if any, is painted first, behind everything else. All monitors'
    // panoramas share one layer below all cubes, so a cube that swings past the edge of
    // its monitor still covers the neighbor's panorama. Each rotating monitor shows a
    // clone of the skybox, centered on that monitor's camera. The skybox itself is not
    // part of the scene: it stays on the stage, invisible, for as long as it exists (see
    // Skybox), and only its clones come and go with each rotation.
    const skybox = this._skybox && this._skybox.ready ? this._skybox : null;
    anim.skybox = skybox;
    anim.skyLayer = new Clutter.Actor();
    root.add_child(anim.skyLayer);
    if (skybox) {
      skybox.placeAtCamera(this._getCamera());
    }

    // Per monitor: either a cube with one face per workspace, or a single static layer.
    const layers = monitors.map((monitor, index) => {
      if (isRotating(index)) {
        const camera = this._getMonitorCamera(monitor);

        const cube = new Clutter.Actor({
          x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height,
        });
        const faces = [];
        for (let i = 0; i < anim.nWorkspaces; i++) {
          const face = this._createFace(monitor);
          cube.add_child(face);
          faces.push(face);
        }
        const wrapper = new Clutter.Actor();
        this._applyPerspective(wrapper, camera);
        wrapper.add_child(cube);
        root.add_child(wrapper);
        anim.cubes.push({monitor: monitor, monitorIndex: index, actor: cube, faces: faces});

        if (skybox) {
          const clip = new Clutter.Actor();
          clip.set_clip(monitor.x, monitor.y, monitor.width, monitor.height);
          const skyWrapper = new Clutter.Actor();
          this._applyPerspective(skyWrapper, camera);
          skyWrapper.add_child(new Clutter.Clone({
            source: skybox.actor,
            x: camera.x,
            y: camera.y,
            width: 1,
            height: 1,
            translation_z: camera.z,
          }));
          clip.add_child(skyWrapper);
          anim.skyLayer.add_child(clip);
        }
        return {faces: faces};
      }

      const layer = this._createFace(monitor);
      layer.set_position(monitor.x, monitor.y);
      root.add_child(layer);
      return {faces: [layer]};
    });

    const overlay = new Clutter.Actor();
    root.add_child(overlay);

    // Sort clones of all window actors into the layers. get_window_actors() is in
    // stacking order, so adding them in this order keeps it.
    anim.followers = [];

    global.get_window_actors().forEach(actor => {
      const window = actor.meta_window;
      if (!window) {
        return;
      }

      const type = window.get_window_type();
      if (type === Meta.WindowType.OVERRIDE_OTHER || !window.showing_on_its_workspace()) {
        return;
      }

      // A window is drawn on every monitor it overlaps, not only on the one Cinnamon
      // assigns it to (the one holding most of it). A window straddling two monitors then
      // shows its left part on one cube and its right part on the other, each clipped to
      // its face, instead of hanging off the side of one cube.
      const ownIndex = monitors[window.get_monitor()] ? window.get_monitor() : primary;
      const frame = window.get_frame_rect();
      const targets = [];
      monitors.forEach((monitor, index) => {
        if (index === ownIndex || rectsOverlap(frame, monitor)) {
          targets.push(index);
        }
      });

      // Desktop icons go on the face's flat desktop layer, everything else floats.
      const isDesktop = type === Meta.WindowType.DESKTOP;
      const addTo = (face, monitorIndex) => {
        const monitor = monitors[monitorIndex];
        const clone = rectInside(frame, monitor) ?
          createFaceClone(actor, actor.x - monitor.x, actor.y - monitor.y) :
          createMonitorClippedClone(actor, monitor);
        if (!clone) {
          return;
        }
        const parent = isDesktop ? face._desktop : face._windows;
        parent.add_child(clone);
        // Cinnamon hides a monitor's panels for the topmost window of that monitor only.
        if (!isDesktop && monitorIndex === ownIndex) {
          face._topWindow = window;
        }
      };

      // The window being dragged to the new workspace, and windows on all workspaces,
      // don't rotate. This matches what Cinnamon's own animation does. They are drawn
      // once, whole and flat above the cubes, so they need no clipping.
      const moving = window === anim.movingWindow || window === this._draggedWindow;
      const sticky = !isDesktop && window.is_on_all_workspaces();
      if ((moving || sticky) && targets.some(isRotating)) {
        const clone = new Clutter.Clone({source: actor, x: actor.x, y: actor.y});
        overlay.add_child(clone);
        // A window that is dragged with the mouse keeps moving during the rotation.
        if (moving) {
          anim.followers.push({clone, actor});
        }
        return;
      }

      const workspace = window.get_workspace();
      targets.forEach(index => {
        const layer = layers[index];
        if (!isRotating(index)) {
          // On a static monitor everything simply stays where it is.
          addTo(layer.faces[0], index);
        } else if (isDesktop) {
          // Nemo's desktop window is on all workspaces; give every face a copy.
          layer.faces.forEach(face => addTo(face, index));
        } else if (workspace && layer.faces[workspace.index()]) {
          addTo(layer.faces[workspace.index()], index);
        }
      });
    });

    // Desklets are on every workspace and live in a container that Muffin keeps inside
    // global.window_group, so they would vanish with it. Every face gets a copy of each
    // desklet on its desktop layer, above the desktop icons, flat on the wallpaper. We
    // clone the desklets one by one and measure their positions now, while they are
    // still mapped.
    //
    // Blur Cinnamon puts its blurred desklet backgrounds into the same container
    // (tagged with _blurCinnamonName). They are full screen actors clipped to the desklet,
    // and some are only drawn through a separate viewport actor, so cloning them like the
    // desklets doesn't work. They are left out here, and Blur Cinnamon instead hands us a
    // ready-to-use actor for each desklet's blur through the shared notifier (see
    // getCubeNotifier()), which goes right below that desklet's clone.
    const container = global.desklet_container;
    const desklets = (container && global.window_group.contains(container)) ?
      container.get_children().filter(d => d.visible && d._blurCinnamonName === undefined) :
      [];
    const deskletPositions = desklets.map(d => d.get_transformed_position());
    // Each desklet belongs to the monitor its center is on. Only that monitor's faces get a
    // copy: on any other monitor it would sit outside the face and float beside the cube.
    const deskletMonitors = desklets.map((desklet, k) => {
      const [x, y] = deskletPositions[k];
      const cx = x + desklet.width / 2;
      const cy = y + desklet.height / 2;
      const index = monitors.findIndex(m => cx >= m.x && cx < m.x + m.width &&
                                            cy >= m.y && cy < m.y + m.height);
      return index >= 0 ? index : primary;
    });
    const blurProvider = notifier.deskletBlurProvider;
    const createDeskletBlur = (desklet, offsetX, offsetY) => {
      if (!blurProvider || typeof blurProvider.createDeskletBlur !== 'function') {
        return null;
      }
      try {
        return blurProvider.createDeskletBlur(desklet, offsetX, offsetY);
      } catch (e) {
        global.logError(`${this._meta.uuid}: Blur Cinnamon desklet blur failed: ${e}`);
        return null;
      }
    };

    layers.forEach((layer, index) => {
      const monitor = monitors[index];
      layer.faces.forEach(face => {
        desklets.forEach((desklet, k) => {
          if (deskletMonitors[k] !== index) {
            return;
          }
          const [x, y] = deskletPositions[k];
          // Blur Cinnamon clips its blur to the desklet's rect, so draw it flat (see
          // createFlatClip()) with the clip done inside, at the desklet's place on the face.
          const blur = createDeskletBlur(desklet, x, y);
          if (blur) {
            face._desktop.add_child(createFlatClip(blur, x - monitor.x, y - monitor.y,
                                                   Math.ceil(desklet.width),
                                                   Math.ceil(desklet.height)));
          }
          face._desktop.add_child(createFaceClone(desklet, x - monitor.x, y - monitor.y));
        });
      });
    });

    const panelMode = this._settings.getValue('panel-mode');
    if (panelMode === 'faces') {
      this._addPanelClones(layers, notifier);
    }

    // Remember each clone's place in the stacking order. The children get reordered
    // for depth sorting later, but the topmost window must stay closest to the viewer.
    anim.cubes.forEach(cube => cube.faces.forEach(face => {
      const windows = face._windows.get_children();
      windows.forEach((clone, j) => {
        clone._depthFactor = (j + 1) / windows.length;
      });
    }));

    // Cinnamon draws a black stage background behind uiGroup, which is what shows
    // around the cube once the windows are hidden. Normally the cube goes right above
    // the window group, below the panels.
    //
    // To hide the panels, we don't touch them at all: fading them out made parts of
    // the cube flicker. Instead the cube goes above them, on a black backdrop that
    // covers each monitor where it rotates. Panels drawn on the faces are hidden the
    // same way, so only their clones show.
    let below = global.window_group;
    if (panelMode === 'hide' || panelMode === 'faces') {
      anim.cubes.slice().reverse().forEach(cube => {
        const m = cube.monitor;
        root.insert_child_at_index(new Clutter.Actor({
          x: m.x, y: m.y, width: m.width, height: m.height,
          background_color: new Clutter.Color({red: 0, green: 0, blue: 0, alpha: 255}),
        }), 0);
      });
      below = this._getTopmostPanelActor() || below;
    }
    Main.uiGroup.insert_child_above(root, below);
    if (!anim.unredirectDisabled) {   // A rebuilt scene keeps the first call.
      Meta.disable_unredirect_for_display(global.display);
      anim.unredirectDisabled = true;
    }
    global.window_group.hide();
  }

  // Gives every face a clone of each panel on its monitor, like the desklets. Panels are
  // on all workspaces, so every face shows the same live panel: applets that depend on
  // the workspace (a window list showing only the current workspace's windows, the
  // workspace switcher) show the current state on every face.
  //
  // Cinnamon hides the panels of a monitor whose topmost window is fullscreen. The real
  // panel is then hidden, but a clone still draws its source, so we leave the clone out
  // on exactly those faces and keep it on the others.
  _addPanelClones(layers, notifier) {
    if (!Main.panelManager) {
      return;
    }
    const monitors = Main.layoutManager.monitors;
    const blurProvider = notifier.panelBlurProvider;
    const createPanelBlur = (panel, offsetX, offsetY) => {
      if (!blurProvider || typeof blurProvider.createPanelBlur !== 'function') {
        return null;
      }
      try {
        return blurProvider.createPanelBlur(panel, offsetX, offsetY);
      } catch (e) {
        global.logError(`${this._meta.uuid}: Blur Cinnamon panel blur failed: ${e}`);
        return null;
      }
    };

    Main.panelManager.getPanels().forEach(panel => {
      const actor = panel ? panel.actor : null;
      // Disabled panels (e.g. while panels are being edited) stay hidden. Some extensions
      // (Centered Cinnamon Dock) hide a panel by fading or scaling it to nothing; a clone
      // ignores its source's opacity and scale, so check those by hand.
      if (!actor || panel._disabled || actor.opacity === 0 ||
          actor.scale_x === 0 || actor.scale_y === 0) {
        return;
      }
      const layer = layers[panel.monitorIndex];
      const monitor = monitors[panel.monitorIndex];
      if (!layer || !monitor) {
        return;
      }
      // The panel's real size is its allocation. actor.width/height are not reliable here:
      // while a relayout is pending (Blur Cinnamon re-applying its custom CSS, an applet
      // updating, ...) they return the preferred size instead, and with CSS margins that
      // is the full monitor, because Cinnamon makes the panel shorter by the margins and
      // Clutter adds them back to the preferred size. Clutter.Clone stretches its source to
      // the clone's size, so the panel would come out stretched. get_allocation_box() runs
      // the pending relayout first, so the size and position are current.
      const box = actor.get_allocation_box();
      const width = box.x2 - box.x1;
      const height = box.y2 - box.y1;
      const [x, y] = actor.get_transformed_position();
      // Clip the panel and its blur to the monitor, like the real screen does, in case a
      // panel sticks out (e.g. while it slides in or out). The clip is done flat (see
      // createFlatClip()), never under the cube's 3D transform.
      const x1 = Math.max(x, monitor.x);
      const y1 = Math.max(y, monitor.y);
      const visibleWidth = Math.ceil(Math.min(x + width, monitor.x + monitor.width) - x1);
      const visibleHeight = Math.ceil(Math.min(y + height, monitor.y + monitor.height) - y1);
      if (visibleWidth <= 0 || visibleHeight <= 0) {
        return;
      }
      layer.faces.forEach(face => {
        if (face._topWindow && face._topWindow.is_fullscreen()) {
          return;
        }
        // A blurred panel's background goes right below it, drawn flat like a desklet's.
        const blur = createPanelBlur(panel, x1, y1);
        if (blur) {
          const flat = createFlatClip(blur, x1 - monitor.x, y1 - monitor.y,
                                      visibleWidth, visibleHeight);
          flat.opacity = actor.opacity;
          face._panels.add_child(flat);
        }
        // The clone gets the panel's allocated size, so it isn't stretched (see above).
        const clone = new Clutter.Clone({source: actor, x: x - x1, y: y - y1, width, height});
        const flat = createFlatClip(clone, x1 - monitor.x, y1 - monitor.y,
                                    visibleWidth, visibleHeight);
        flat.opacity = actor.opacity;
        face._panels.add_child(flat);
      });
    });
  }

  // Returns the panel actor that is highest in Main.uiGroup, or null.
  _getTopmostPanelActor() {
    if (!Main.panelManager) {
      return null;
    }
    const children = Main.uiGroup.get_children();
    let topmost = null;
    let topIndex = children.indexOf(global.window_group);
    Main.panelManager.getPanels().forEach(panel => {
      const index = panel ? children.indexOf(panel.actor) : -1;
      if (index > topIndex) {
        topIndex = index;
        topmost = panel.actor;
      }
    });
    return topmost;
  }

  // A face is a monitor-sized actor holding a clipped background and the window clones.
  _createFace(monitor) {
    const face = new Clutter.Actor({width: monitor.width, height: monitor.height});

    // The wallpaper actor covers the whole screen, so it is clipped to this monitor. The
    // clip is done flat (see createFlatClip()), never under the cube's 3D transform.
    const background = this._createBackground() || new Clutter.Actor();
    background.set_position(-monitor.x, -monitor.y);
    const backgroundHolder = createFlatClip(background, 0, 0, monitor.width, monitor.height);
    face.add_child(backgroundHolder);
    face._background = backgroundHolder;

    // Desktop icons and desklets: these stay flat on the wallpaper.
    face._desktop = new Clutter.Actor();
    face.add_child(face._desktop);

    // Panels, if they are drawn on the faces: also flat on the wallpaper, above the
    // desklets. With no depth buffer, paint order is depth order, so they are painted
    // before the windows, which float in front of them while the cube rotates. The real
    // panels are above the windows, but windows rarely overlap a panel, and only a window
    // that does would show above it when the cube is at rest.
    face._panels = new Clutter.Actor();
    face.add_child(face._panels);

    // Windows: these float in front of the face while the cube rotates.
    face._windows = new Clutter.Actor();
    face.add_child(face._windows);
    face._topWindow = null;
    face._frontFacing = true;

    return face;
  }

  // Returns an actor that draws the wallpaper for the whole screen, or null.
  _createBackground() {
    try {
      // Newer Cinnamon versions have a helper that also works on Wayland.
      if (typeof Main.createFullScreenBackground === 'function') {
        return Main.createFullScreenBackground();
      }
      if (!Meta.is_wayland_compositor()) {
        return Meta.X11BackgroundActor.new_for_display(global.display);
      }
    } catch (e) {
      global.logError(`${this._meta.uuid}: could not create background: ${e}`);
    }
    return null;
  }

  // ------------------------------------------------------------------- per-frame update

  _updateCubes() {
    const anim = this._anim;

    const progress = anim.progress;
    const pitch = anim.pitch;
    const faceAngle = this._getFaceAngle(anim.nWorkspaces);
    const camera = this._getCamera();

    // A window being moved to the new workspace stays in front of the cube; it turns
    // partly see-through while the cube moves (fade follows the motion: 0 at rest).
    const seeThrough = this._settings.getValue('moving-window-transparency') / 100;
    const followerOpacity = Math.round(255 * (1 - seeThrough * anim.fade));
    anim.followers.forEach(f => {
      f.clone.set_position(f.actor.x, f.actor.y);
      f.clone.opacity = followerOpacity;
    });

    // Only if the scene's clones show the current skybox: the panorama may have been
    // changed or turned off while the cube is up.
    if (anim.skybox && anim.skybox === this._skybox) {
      anim.skybox.setRotation(progress, pitch, anim.nWorkspaces);
    }

    const faceOpacity = Math.round(255 * (1.0 - Math.abs(pitch)));

    anim.cubes.forEach(cube => {
      const monitor = cube.monitor;
      const centerDepth = this._getCenterDist(monitor.width, faceAngle);
      const [depthOffset, explode] =
        this._getExplodeFactors(progress, pitch, centerDepth, monitor);

      // Vertical tilt and zoom are applied to the whole cube.
      cube.actor.set_pivot_point(0.5, 0.5);
      cube.actor.pivot_point_z = -centerDepth;
      cube.actor.rotation_angle_x = pitch * MAX_VERTICAL_ROTATION;
      cube.actor.translation_z = anim.zoom - this._getAutoZoomDistance(anim.autoZoom, camera);

      cube.faces.forEach((face, i) => {
        const angle = this._normalizeAngle((i - progress) * faceAngle);

        face.set_pivot_point(0.5, 0.5);
        face.pivot_point_z = -centerDepth;
        face.rotation_angle_y = angle;
        face.translation_z = -depthOffset;
        face._angle = angle;

        // The wallpaper fades out while the cube is tilted, so you can see inside it. The
        // desklets, desktop icons and panels are drawn flat on the wallpaper, so they fade
        // with it rather than being left floating in front of nothing.
        face._background.opacity = faceOpacity;
        face._desktop.opacity = faceOpacity;
        face._panels.opacity = faceOpacity;

        // Spread the windows between the face and `explode` pixels in front of it. The
        // topmost window ends up closest to the viewer.
        face._windows.get_children().forEach(clone => {
          clone.translation_z = explode * clone._depthFactor;
        });
      });

      // Clutter has no depth buffer here, so paint order is depth order. Within a face,
      // the windows are parallel planes: painting them in stacking order is right when
      // the face is seen from the front, and has to be reversed when seen from behind.
      cube.faces.forEach(face => {
        const frontFacing = this._isFrontFacing(face, camera);
        if (frontFacing !== face._frontFacing) {
          face._frontFacing = frontFacing;
          this._reverseChildren(face);
          this._reverseChildren(face._windows);
        }
      });

      // Faces that are rotated further away are painted first.
      const sorted = cube.faces.slice().sort((a, b) =>
        Math.abs(b.rotation_angle_y) - Math.abs(a.rotation_angle_y));
      sorted.forEach((face, k) => cube.actor.set_child_at_index(face, k));
    });
  }

  _reverseChildren(actor) {
    actor.get_children().reverse().forEach((child, k) => actor.set_child_at_index(child, k));
  }

  // Whether the camera sees the front side of the face. We transform the face's center
  // and a point one pixel in front of it to stage coordinates; the face is front facing
  // if the camera is on the side that point lies on.
  _isFrontFacing(face, camera) {
    // Right after the scene is built nothing has been allocated yet, and the transforms
    // below come out wrong (seen on Cinnamon 6.8): the front face was taken for one seen
    // from behind, so its wallpaper was painted over its windows for the first frame.
    // Until then, judge by the face's angle alone.
    if (!face.has_allocation()) {
      return Math.abs(face._angle || 0) < 90;
    }
    const x = face.width / 2;
    const y = face.height / 2;
    const a = face.apply_relative_transform_to_point(null, new Graphene.Point3D({x, y, z: 0}));
    const b = face.apply_relative_transform_to_point(null, new Graphene.Point3D({x, y, z: 1}));
    return (camera.x - a.x) * (b.x - a.x) + (camera.y - a.y) * (b.y - a.y) +
      (camera.z - a.z) * (b.z - a.z) > 0;
  }

  // ------------------------------------------------- cube geometry (from the GNOME code)

  // The angle between consecutive workspaces.
  _getFaceAngle(faceCount) {
    // With the gap the "cube" only covers 180° (90° for two workspaces), so it doesn't
    // look like you could rotate from the last to the first workspace.
    if (this._settings.getValue('last-first-gap')) {
      return (faceCount === 2 ? 90 : 180) / (faceCount - 1);
    }
    return 360.0 / faceCount;
  }

  // The z-distance from the cube faces to the rotation pivot.
  _getCenterDist(workspaceWidth, faceAngle) {
    let centerDepth = workspaceWidth / 2;
    if (faceAngle < 180) {
      centerDepth /= Math.tan(faceAngle * 0.5 * Math.PI / 180);
    }
    return centerDepth;
  }

  // Maps an angle to (-180, 180]. Needed because a closed cube can be rotated past the
  // last workspace, which would otherwise break the depth sorting.
  _normalizeAngle(angle) {
    let a = ((angle % 360) + 360) % 360;
    return a > 180 ? a - 360 : a;
  }

  _getFovy() {
    try {
      return global.stage.perspective.fovy || 60;
    } catch (e) {
      return 60;
    }
  }

  // How far to move the cube back so that it looks `setting` percent smaller than the
  // screen, scaled by `amount` (0..1). Something at distance D from the camera looks
  // s times its size at distance D / s, so we move it back by D * (1 / s - 1).
  _getAutoZoomDistance(amount, camera) {
    const percent = this._settings.getValue('auto-zoom-out');
    if (!percent || amount <= 0) {
      return 0;
    }
    const scale = 1 - Math.min(0.9, percent / 100 * amount);
    return camera.z * (1 / scale - 1);
  }

  // Position of Clutter's virtual camera in stage coordinates: centered in front of
  // the stage, at the distance where the stage exactly fills the field of view.
  _getCamera() {
    const fovy = this._getFovy();
    return {
      x: global.screen_width / 2,
      y: global.screen_height / 2,
      z: global.screen_height / (2 * Math.tan(fovy / 2 * Math.PI / 180)),
      fovy: fovy,
    };
  }

  // The camera a monitor's cube should be seen from: centered in front of the monitor
  // with per-monitor perspective, otherwise Clutter's stage camera.
  _getMonitorCamera(monitor) {
    const camera = this._getCamera();
    if (!this._settings.getValue('per-monitor-perspective')) {
      return camera;
    }
    return {
      x: monitor.x + monitor.width / 2,
      y: monitor.y + monitor.height / 2,
      z: camera.z,
      fovy: camera.fovy,
    };
  }

  // Makes everything inside `actor` look as if seen from `camera` instead of the stage
  // camera, by shearing it (see "Per-monitor perspective" at the top of this file). The
  // actor must sit at the stage origin without other transforms.
  _applyPerspective(actor, camera) {
    const stage = this._getCamera();
    const a = (stage.x - camera.x) / stage.z;
    const b = (stage.y - camera.y) / stage.z;
    if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) {
      return;
    }
    try {
      actor.set_transform(this._createShearMatrix(a, b));
    } catch (e) {
      // Without the correction the cube just looks as it does with a single camera.
      global.logError(`${this._meta.uuid}: per-monitor perspective failed: ${e}`);
    }
  }

  // Returns a matrix for x' = x + a * z, y' = y + b * z, of the type that
  // ClutterActor.set_transform() takes.
  //
  // In Muffin that is ClutterMatrix, a C typedef of CoglMatrix, which JavaScript sees
  // as Cogl.Matrix. Its init_from_array() has no introspection annotation for the array,
  // so it can't be relied on from JavaScript. Instead the shear is built from rotations
  // and a scale, which only take plain numbers: turn its direction (a, b) onto the
  // x axis, apply the singular value decomposition of a shear along x (a rotation, a
  // non-uniform scale and another rotation), and turn back. The result is checked by
  // transforming a point before it is used.
  //
  // Newer Mutter-based Clutter versions take a Graphene.Matrix instead, whose
  // init_from_float() is properly annotated; that is used if Cogl.Matrix is missing.
  _createShearMatrix(a, b) {
    if (!Cogl.Matrix) {
      if (Graphene.Matrix) {
        return new Graphene.Matrix().init_from_float([1, 0, 0, 0,
                                                      0, 1, 0, 0,
                                                      a, b, 1, 0,
                                                      0, 0, 0, 1]);
      }
      throw new Error('no matrix type available');
    }

    const amount = Math.hypot(a, b);
    const direction = Math.atan2(b, a) * 180 / Math.PI;
    const [angle1, scaleX, scaleZ, angle2] = shearDecomposition(amount);

    const matrix = new Cogl.Matrix();
    matrix.init_identity();
    matrix.rotate(direction, 0, 0, 1);
    matrix.rotate(angle1, 0, 1, 0);
    matrix.scale(scaleX, 1, scaleZ);
    matrix.rotate(angle2, 0, 1, 0);
    matrix.rotate(-direction, 0, 0, 1);

    // A point one unit in front of the origin must end up at (a, b, 1).
    const [x, y, z] = matrix.transform_point(0, 0, 1, 1);
    if (Math.abs(x - a) > 1e-3 || Math.abs(y - b) > 1e-3 || Math.abs(z - 1) > 1e-3) {
      throw new Error(`the shear matrix came out wrong: (0, 0, 1) -> (${x}, ${y}, ${z}), ` +
                      `expected (${a}, ${b}, 1)`);
    }
    return matrix;
  }

  // While rotating, the cube moves back and the windows float in front of the faces.
  // Both effects are zero when facing a workspace. They are small for horizontal
  // rotations, so switching isn't obtrusive, and strong when the cube is tilted.
  // Returns [depthOffset, explode] in pixels.
  _getExplodeFactors(progress, pitch, centerDepth, monitor) {
    // 0 when facing a workspace, 1 when looking at an edge / when fully tilted.
    const fraction = ((progress % 1) + 1) % 1;
    const hFactor = 1.0 - 2.0 * Math.abs(fraction - 0.5);
    const vFactor = Math.abs(pitch);

    // Horizontal: move back far enough that the cube's corners stay behind the screen
    // plane. The topmost window then stays at a constant depth.
    const cornerDist = Math.sqrt(Math.pow(centerDepth, 2) + Math.pow(monitor.width / 2, 2));
    const hDepthOffset =
      this._settings.getValue('window-parallax') * (cornerDist - centerDepth);
    const hExplode = hDepthOffset;

    // Vertical: move back far enough to see the whole cube, and let the windows float
    // up to half a screen in front of their faces.
    const vExplode = this._settings.getValue('do-explode') ?
      Math.max(monitor.width, monitor.height) / 2 : 0;
    const diameter = 2 * (vExplode + centerDepth);
    const camDist = monitor.height / (2 * Math.tan(this._getFovy() / 2 * Math.PI / 180));
    const vDepthOffset =
      (1 + PADDING_V_ROTATION) * diameter * camDist / monitor.width - centerDepth;

    return [
      Math.max(hFactor * hDepthOffset, vFactor * vDepthOffset),
      Math.max(hFactor * hExplode, vFactor * vExplode),
    ];
  }
}

// -------------------------------------------------------------------- panorama skybox

// Draws a 360° panorama (equirectangular projection, usually 2:1) around the cube.
//
// The GNOME extension draws it with a fragment shader that computes a view ray per
// pixel. Cinnamon's shader classes can't bind a texture of our own in any released
// version (CinnamonGLSLEffect only gained get_pipeline() after 6.6), so we use a
// classic cube map instead: the panorama is resampled once into the six faces of a
// cube centered on Clutter's camera. Seen from the center, flat cube faces show the
// panorama exactly, with no seams and no approximation.
//
// The resampling uses the same mapping from direction to image as the GNOME shader,
// and the same yaw/pitch conventions, so a panorama looks the same as it does there:
//   u = 0.5 + 0.5 * atan2(view.x, -view.z) / pi,  v = acos(view.y) / pi
//   (view space: x right, y up, looking along -z; stage space has y pointing down)
//
// Actor tree (all rotations are around each actor's origin):
//   actor  - positioned at the camera
//    tilt  - rotation_angle_x = cube pitch
//     spin - rotation_angle_y = -yaw
//      faces - one per cube side, rotated to face front/right/back/left/top/bottom
//       tiles - SKY_FACE_TILES x SKY_FACE_TILES per face, SKY_RADIUS from the camera
//
// The cube surrounds the camera, so many tiles are beside or behind it. Clutter does
// not cope well with geometry at or behind the camera plane, so only tiles that lie
// completely in front of the camera and within the field of view are shown.
//
// Resampling a large panorama takes a few seconds, so the image is decoded
// asynchronously and the cube faces are then computed a few rows at a time from an
// idle callback, keeping Cinnamon responsive. The panorama is used once all six faces
// exist.
//
// The finished faces are saved as PNG files in ~/.cache/desktop-cube-reloaded/<key>/,
// where the key depends on the panorama's path, size and modification time. Next time
// (e.g. after logging in), the faces are simply loaded from there. Only the cache for
// the current panorama is kept.
const SKY_FACE_TILES = 8;
const SKY_MAX_FACE_SIZE = 2048;
const SKY_RADIUS = 500;
const SKY_BUILD_SLICE_US = 8000;   // Time spent computing faces per idle callback.
const SKY_CACHE_VERSION = 1;       // Bump when the face format or projection changes.
const SKY_CACHE_DIR = 'desktop-cube-reloaded';

// The six cube faces, as Clutter rotations of the front face (which looks along -z).
const SKY_FACES = [
  {rx: 0, ry: 0},      // front
  {rx: 0, ry: -90},    // right
  {rx: 0, ry: 180},    // back
  {rx: 0, ry: 90},     // left
  {rx: -90, ry: 0},    // top
  {rx: 90, ry: 0},     // bottom
];

// Rotations with the same conventions as Clutter's rotation_angle_x/y (in degrees).
function rotateX(degrees, [x, y, z]) {
  const c = Math.cos(degrees * Math.PI / 180);
  const s = Math.sin(degrees * Math.PI / 180);
  return [x, c * y - s * z, s * y + c * z];
}

function rotateY(degrees, [x, y, z]) {
  const c = Math.cos(degrees * Math.PI / 180);
  const s = Math.sin(degrees * Math.PI / 180);
  return [c * x + s * z, y, -s * x + c * z];
}

function normalize([x, y, z]) {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

// Calls obj.<name>_async(...args, callback) and returns a promise of obj.<name>_finish().
function gioAsync(obj, name, ...args) {
  return new Promise((resolve, reject) => {
    obj[`${name}_async`](...args, (source, result) => {
      try {
        resolve(obj[`${name}_finish`](result));
      } catch (e) {
        reject(e);
      }
    });
  });
}

class Skybox {
  constructor(file, uuid, notifyWhenReady = false) {
    this._uuid = uuid;
    this._notifyWhenReady = notifyWhenReady;
    this.ready = false;
    this._destroyed = false;
    this._idleID = 0;
    this._cancellable = new Gio.Cancellable();  // Stops file I/O on destroy.
    this._tiles = [];      // {actor, center, corners}: unit directions before rotation.
    this._faceActors = [];
    this._cosCone = 0;

    // The scene shows clones of this actor, one per monitor. It gets a size of 1x1 so
    // that clones of the same size draw it without any scaling.
    //
    // The actor itself is never shown. It sits at the bottom of the stage from now until
    // destroy(), with opacity 0: Clutter skips such an actor when painting, while clones
    // draw their source with their own opacity. It is not hidden instead, because Clutter
    // doesn't lay out hidden actors, so the tiles would have no size and the clones would
    // draw nothing. And it is not taken off the stage between rotations: on Cinnamon 6.8
    // Wayland a skybox that had been removed and added again was no longer drawn, so the
    // panorama only showed during the first rotation.
    this.actor = new Clutter.Actor({
      name: 'desktop-cube-reloaded-skybox', width: 1, height: 1, opacity: 0,
    });
    global.stage.insert_child_below(this.actor, null);
    this._tilt = new Clutter.Actor();
    this._spin = new Clutter.Actor();
    this.actor.add_child(this._tilt);
    this._tilt.add_child(this._spin);

    this._load(file).catch(e => this._fail(e));
  }

  destroy() {
    this._destroyed = true;
    this._cancellable.cancel();
    if (this._idleID) {
      GLib.source_remove(this._idleID);
      this._idleID = 0;
    }
    this._source = null;
    this.actor.destroy();
  }

  // Puts the center of the cube at the camera position (in stage coordinates), and
  // works out the field of view: half the screen diagonal plus a margin for the tile
  // size.
  placeAtCamera(camera) {
    this.actor.set_position(camera.x, camera.y);
    this.actor.translation_z = camera.z;

    const aspect = global.screen_width / global.screen_height;
    const halfFovy = camera.fovy / 2 * Math.PI / 180;
    const halfDiagonal = Math.atan(Math.tan(halfFovy) * Math.sqrt(1 + aspect * aspect));
    const cone = Math.min(halfDiagonal + 12 * Math.PI / 180, 89 * Math.PI / 180);
    this._cosCone = Math.cos(cone);
  }

  // Same as the GNOME extension: one full turn of the panorama per full turn through
  // all workspaces, and the same tilt as the cube.
  setRotation(progress, pitch, nWorkspaces) {
    const spin = -360 * progress / nWorkspaces;
    const tilt = pitch * MAX_VERTICAL_ROTATION;
    this._spin.rotation_angle_y = spin;
    this._tilt.rotation_angle_x = tilt;

    // The camera looks along -z. Show a tile if its center is within the field of view
    // and all of its corners are clearly in front of the camera.
    const turn = (dir) => rotateX(tilt, rotateY(spin, dir));
    this._tiles.forEach(tile => {
      const center = turn(tile.center);
      tile.actor.visible = -center[2] > this._cosCone &&
        tile.corners.every(corner => -turn(corner)[2] > 0.05);
    });
  }

  async _load(file) {
    // The settings widget may store a URI or a plain path.
    const gfile = file.startsWith('file://') ?
      Gio.File.new_for_uri(file) : Gio.File.new_for_path(file);
    this._name = gfile.get_basename() || file;
    this._file = file;

    // Cached cube faces are found by the panorama's location, date and size.
    try {
      const info = await gioAsync(gfile, 'query_info', 'time::modified,standard::size',
                                  Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
                                  this._cancellable);
      const key = GLib.compute_checksum_for_string(
        GLib.ChecksumType.SHA256,
        [SKY_CACHE_VERSION, gfile.get_uri(), info.get_attribute_uint64('time::modified'),
         info.get_size(), SKY_MAX_FACE_SIZE, SKY_FACE_TILES].join('|'),
        -1);
      this._cacheRoot = GLib.build_filenamev([GLib.get_user_cache_dir(), SKY_CACHE_DIR]);
      this._cacheDir = GLib.build_filenamev([this._cacheRoot, key]);
    } catch (e) {
      this._fail(e);
      return;
    }
    if (this._destroyed) {
      return;
    }

    // The cache is used only if the "complete" marker shows that all faces were saved.
    // Otherwise (usually because there is no marker yet) the panorama is converted.
    try {
      await gioAsync(Gio.File.new_for_path(this._cacheFile('complete')), 'query_info',
                     'standard::type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT,
                     this._cancellable);
    } catch (e) {
      if (this._destroyed) {
        return;
      }
      if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
        global.log(`${this._uuid}: ignoring the panorama cache: ${e}`);
      }
      this._loadPanorama(gfile);
      return;
    }
    if (!this._destroyed) {
      this._loadCachedFace(0);
    }
  }

  _cacheFile(name) {
    return GLib.build_filenamev([this._cacheDir, name]);
  }

  // All six faces are in place, from the cache or freshly converted.
  _setReady() {
    this.ready = true;
    if (this._notifyWhenReady) {
      Main.notify(
        _('Desktop Cube Reloaded: the panorama is ready'),
        _('"%s" has been loaded and will be shown around the cube the next time it ' +
          'rotates.').format(this._name));
    }
  }

  _fail(error) {
    if (this._destroyed) {
      return;  // Cancelled by destroy().
    }
    global.logError(`${this._uuid}: could not load panorama ${this._file}: ${error}`);
    Main.warningNotify(
      _('Desktop Cube Reloaded: the panorama could not be loaded'),
      _('"%s" could not be read as an image. Use a JPEG or PNG file. The cube is shown ' +
        'on black for now.').format(this._name));
  }

  // Loads face `index` from the cache, then the next one. Falls back to converting the
  // panorama again if anything is wrong with the cache.
  _loadCachedFace(index) {
    if (this._destroyed) {
      return;
    }
    if (index === SKY_FACES.length) {
      this._setReady();
      return;
    }

    const fallback = (error) => {
      if (this._destroyed) {
        return;
      }
      global.log(`${this._uuid}: ignoring the panorama cache: ${error}`);
      this._clearFaces();
      const file = this._file;
      this._loadPanorama(file.startsWith('file://') ?
        Gio.File.new_for_uri(file) : Gio.File.new_for_path(file));
    };

    const gfile = Gio.File.new_for_path(this._cacheFile(`face-${index}.png`));
    gfile.read_async(GLib.PRIORITY_DEFAULT, this._cancellable, (obj, readResult) => {
      try {
        const stream = gfile.read_finish(readResult);
        GdkPixbuf.Pixbuf.new_from_stream_async(stream, this._cancellable, (obj2, result) => {
          try {
            const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(result);
            if (this._destroyed) {
              return;
            }
            if (pixbuf.width !== pixbuf.height || pixbuf.width < SKY_FACE_TILES) {
              throw new Error(`face ${index} has the wrong size`);
            }
            this._addFace(index, pixbuf);
            this._loadCachedFace(index + 1);
          } catch (e) {
            fallback(e);
          }
        });
      } catch (e) {
        fallback(e);
      }
    });
  }

  // Removes any faces that were already added (used when the cache turns out broken).
  _clearFaces() {
    this._faceActors.forEach(actor => actor && actor.destroy());
    this._faceActors = [];
    this._tiles = [];
  }

  // Decodes the panorama and starts converting it into cube faces.
  _loadPanorama(gfile) {
    gfile.read_async(GLib.PRIORITY_DEFAULT, this._cancellable, (obj, readResult) => {
      let stream;
      try {
        stream = gfile.read_finish(readResult);
      } catch (e) {
        this._fail(e);
        return;
      }

      GdkPixbuf.Pixbuf.new_from_stream_async(stream, this._cancellable, (obj2, result) => {
        let pixbuf;
        try {
          pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(result);
        } catch (e) {
          this._fail(e);
          return;
        }
        if (this._destroyed) {
          return;
        }

        // Equirectangular panoramas are twice as wide as they are high. Anything else
        // still works, but looks stretched or squashed.
        const aspect = pixbuf.width / pixbuf.height;
        if (Math.abs(aspect - 2) > 0.05) {
          Main.warningNotify(
            _('Desktop Cube Reloaded: the panorama has an unusual shape'),
            _('"%s" is %d × %d pixels. A 360° panorama should be twice as wide as it is ' +
              'high, otherwise it looks stretched.').format(this._name, pixbuf.width,
                                                            pixbuf.height));
        }

        try {
          // A cube face showing 90° needs about a quarter of the panorama's width. It
          // must be a multiple of the number of tiles.
          const faceSize = Math.min(SKY_MAX_FACE_SIZE, Math.round(pixbuf.width / 4));
          this._faceSize = Math.max(1, Math.round(faceSize / SKY_FACE_TILES)) *
            SKY_FACE_TILES;
          this._source = {
            pixels: pixbuf.get_pixels(),
            width: pixbuf.width,
            height: pixbuf.height,
            rowstride: pixbuf.rowstride,
            channels: pixbuf.get_n_channels(),
          };
        } catch (e) {
          this._fail(e);
          return;
        }

        this._face = 0;
        this._row = 0;
        this._facePixels = new Uint8Array(this._faceSize * this._faceSize * 3);
        this._savedFaces = 0;
        // The old "complete" marker must be gone before any new face is saved.
        this._prepareCacheDir().then(() => this._startConversion());
      });
    });
  }

  // Computes the faces in idle time, a slice at a time, so the desktop stays responsive.
  _startConversion() {
    if (this._destroyed) {
      return;
    }
    this._idleID = GLib.idle_add(GLib.PRIORITY_LOW, () => {
      try {
        return this._convertSome();
      } catch (e) {
        this._idleID = 0;
        this._source = null;
        this._facePixels = null;
        this._fail(e);
        return GLib.SOURCE_REMOVE;
      }
    });
  }

  // Computes face rows until the time slice is used up. Returns whether to be called
  // again.
  _convertSome() {
    const start = GLib.get_monotonic_time();
    const size = this._faceSize;

    while (this._face < SKY_FACES.length) {
      this._convertRow(this._face, this._row);
      this._row++;

      if (this._row === size) {
        // The face is complete: show it, and save it in the background.
        const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
          new GLib.Bytes(this._facePixels), GdkPixbuf.Colorspace.RGB, false, 8, size, size,
          size * 3);
        this._addFace(this._face, pixbuf);
        this._saveFace(this._face, pixbuf);

        this._face++;
        this._row = 0;
        this._facePixels = new Uint8Array(size * size * 3);
      }

      if (GLib.get_monotonic_time() - start > SKY_BUILD_SLICE_US) {
        return GLib.SOURCE_CONTINUE;
      }
    }

    // Done. Let the decoded panorama be freed; the tiles have their own pixels.
    this._idleID = 0;
    this._source = null;
    this._facePixels = null;
    this._setReady();
    return GLib.SOURCE_REMOVE;
  }

  // Direction from the camera to a point (a, b) on the front face, both in [-1, 1] with
  // b pointing down, rotated onto the given face.
  _faceDir(face, a, b) {
    const p = [a, b, -1];
    return face.rx !== 0 ? rotateX(face.rx, p) : rotateY(face.ry, p);
  }

  // Computes one row of a face by sampling the panorama in each pixel's direction.
  _convertRow(faceIndex, row) {
    const face = SKY_FACES[faceIndex];
    const size = this._faceSize;
    const src = this._source;
    const pixels = this._facePixels;
    const b = -1 + 2 * (row + 0.5) / size;
    let out = row * size * 3;

    for (let i = 0; i < size; i++) {
      const a = -1 + 2 * (i + 0.5) / size;
      const d = this._faceDir(face, a, b);

      // Stage space to view space (y up), then the GNOME shader's mapping.
      const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      const u = 0.5 + 0.5 * Math.atan2(d[0], -d[2]) / Math.PI;
      const v = Math.acos(Math.max(-1, Math.min(1, -d[1] / len))) / Math.PI;

      this._sample(src, u, v, pixels, out);
      out += 3;
    }
  }

  // Cuts a finished face into tiles and adds them to the scene.
  _addFace(faceIndex, pixbuf) {
    const face = SKY_FACES[faceIndex];
    const faceActor = new Clutter.Actor({
      rotation_angle_x: face.rx,
      rotation_angle_y: face.ry,
    });
    this._spin.add_child(faceActor);
    this._faceActors[faceIndex] = faceActor;

    const tileSize = Math.floor(pixbuf.width / SKY_FACE_TILES);
    const step = 2 * SKY_RADIUS / SKY_FACE_TILES;

    for (let ty = 0; ty < SKY_FACE_TILES; ty++) {
      for (let tx = 0; tx < SKY_FACE_TILES; tx++) {
        const tilePixbuf = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,
                                                pixbuf.get_has_alpha(), 8,
                                                tileSize, tileSize);
        pixbuf.copy_area(tx * tileSize, ty * tileSize, tileSize, tileSize,
                         tilePixbuf, 0, 0);

        const image = new Clutter.Image();
        image.set_data(tilePixbuf.get_pixels(),
                       tilePixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 :
                                                    Cogl.PixelFormat.RGB_888,
                       tileSize, tileSize, tilePixbuf.rowstride);

        const tile = new Clutter.Actor({
          x: -SKY_RADIUS + tx * step,
          y: -SKY_RADIUS + ty * step,
          width: step,
          height: step,
          translation_z: -SKY_RADIUS,
          content: image,
        });
        tile.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR,
                                         Clutter.ScalingFilter.LINEAR);
        faceActor.add_child(tile);

        // Directions to the tile's center and corners, for deciding visibility.
        const a0 = -1 + 2 * tx / SKY_FACE_TILES;
        const b0 = -1 + 2 * ty / SKY_FACE_TILES;
        const a1 = a0 + 2 / SKY_FACE_TILES;
        const b1 = b0 + 2 / SKY_FACE_TILES;
        this._tiles.push({
          actor: tile,
          center: normalize(this._faceDir(face, (a0 + a1) / 2, (b0 + b1) / 2)),
          corners: [[a0, b0], [a1, b0], [a0, b1], [a1, b1]]
            .map(([a, b]) => normalize(this._faceDir(face, a, b))),
        });
      }
    }
  }

  // Creates this panorama's cache directory and deletes its "complete" marker, since the
  // faces are about to be rewritten. Then removes other panoramas' caches in the
  // background. The cache is only an optimization, so errors are logged and ignored.
  async _prepareCacheDir() {
    GLib.mkdir_with_parents(this._cacheDir, 0o755);
    try {
      await gioAsync(Gio.File.new_for_path(this._cacheFile('complete')), 'delete',
                     GLib.PRIORITY_DEFAULT, this._cancellable);
    } catch (e) {
      if (!this._destroyed && !e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
        global.logError(`${this._uuid}: could not prepare the panorama cache: ${e}`);
      }
    }
    if (!this._destroyed) {
      this._removeOldCaches();
    }
  }

  async _removeOldCaches() {
    try {
      const root = Gio.File.new_for_path(this._cacheRoot);
      for (const info of await this._listDir(root, 'standard::name,standard::type')) {
        const dir = root.get_child(info.get_name());
        if (dir.get_path() === this._cacheDir ||
            info.get_file_type() !== Gio.FileType.DIRECTORY) {
          continue;
        }
        for (const child of await this._listDir(dir, 'standard::name')) {
          await gioAsync(dir.get_child(child.get_name()), 'delete', GLib.PRIORITY_LOW,
                         this._cancellable);
        }
        await gioAsync(dir, 'delete', GLib.PRIORITY_LOW, this._cancellable);
      }
    } catch (e) {
      if (!this._destroyed) {
        global.logError(`${this._uuid}: could not remove old panorama caches: ${e}`);
      }
    }
  }

  // Returns the FileInfos of a directory's children.
  async _listDir(dir, attributes) {
    const enumerator = await gioAsync(dir, 'enumerate_children', attributes,
                                      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                                      GLib.PRIORITY_LOW, this._cancellable);
    const infos = [];
    try {
      let batch;
      while ((batch = await gioAsync(enumerator, 'next_files', 100, GLib.PRIORITY_LOW,
                                     this._cancellable)).length > 0) {
        infos.push(...batch);
      }
    } finally {
      enumerator.close_async(GLib.PRIORITY_LOW, null, () => {});
    }
    return infos;
  }

  // Saves a face as PNG on a worker thread. Once all six are written, the "complete"
  // marker is created, so a half-written cache is never used.
  _saveFace(index, pixbuf) {
    try {
      const gfile = Gio.File.new_for_path(this._cacheFile(`face-${index}.png`));
      const stream = gfile.replace(null, false, Gio.FileCreateFlags.NONE, null);
      pixbuf.save_to_streamv_async(stream, 'png', ['compression'], ['3'], this._cancellable,
                                   (obj, result) => {
        try {
          GdkPixbuf.Pixbuf.save_to_stream_finish(result);
          stream.close(null);
          this._savedFaces++;
          if (this._savedFaces === SKY_FACES.length) {
            GLib.file_set_contents(this._cacheFile('complete'), '');
          }
        } catch (e) {
          if (!this._destroyed) {
            global.logError(`${this._uuid}: could not save the panorama cache: ${e}`);
          }
        }
      });
    } catch (e) {
      global.logError(`${this._uuid}: could not save the panorama cache: ${e}`);
    }
  }

  // Bilinear sample of the panorama at (u, v) in [0, 1], wrapping horizontally.
  _sample(src, u, v, out, offset) {
    const fx = u * src.width - 0.5;
    const fy = Math.max(0, Math.min(src.height - 1, v * src.height - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const wx = fx - x0;
    const wy = fy - y0;
    const xa = ((x0 % src.width) + src.width) % src.width;
    const xb = (xa + 1) % src.width;
    const ya = y0;
    const yb = Math.min(src.height - 1, y0 + 1);

    const p = src.pixels;
    const c = src.channels;
    const i00 = ya * src.rowstride + xa * c;
    const i10 = ya * src.rowstride + xb * c;
    const i01 = yb * src.rowstride + xa * c;
    const i11 = yb * src.rowstride + xb * c;

    for (let k = 0; k < 3; k++) {
      const top = p[i00 + k] + (p[i10 + k] - p[i00 + k]) * wx;
      const bottom = p[i01 + k] + (p[i11 + k] - p[i01 + k]) * wx;
      out[offset + k] = top + (bottom - top) * wy;
    }
  }
}

// --------------------------------------------------------- switching at the screen edges
//
// Pushing the pointer against an outer left/right screen edge rotates to the neighboring
// workspace: while dragging a window (the window comes along, as before), or, if
// enabled, with no window at all. A plain push can instead start free rotation, the
// same mode as the cube-free-rotate hot corner action.
//
// Only "outer" edges count: the parts of a monitor's left/right side that have no other
// monitor next to them. On an inner edge the pointer just crosses over, so there is
// nothing to push against. Offset or mixed-height layouts leave outer pieces on inner
// sides too (e.g. the lower part of a tall monitor next to a short one); those count.
//
// While the user pushes, the cube turns a little towards the target ("peek") in
// proportion to the pressure. Reaching the threshold commits the rotation. Resting at the
// edge holds the peek; moving the pointer a little away from the edge springs it back.
// The peek reuses DesktopCube's drag mode, so absorbing
// the workspace switch and settling work exactly like a panel drag.
//
// Pressure is now a decaying sum instead of GNOME's one-second window, so it can drive
// the peek smoothly. While pushing, the decay time constant is PRESSURE_TIMEOUT, which
// gives about the same threshold feel as before for a steady push.

const PRESSURE_TIMEOUT = 1000;  // ms, decay time constant while pushing
const PUSH_IDLE = 150;          // ms without hits after which the push counts as over
const RELEASE_TIME = 150;       // ms, decay time constant once the push is over
const PEEK_TICK = 16;           // ms between peek updates
const MAX_SINGLE_HIT = 15;      // px, one motion event counts at most this much
const CORNER_MARGIN = 10;       // px kept free at monitor corners, for hot corners
const LEAVE_DISTANCE = 10;      // px the pointer must move away from the edge to end a peek
const PEEK_START = 0.4;         // fraction of the threshold before the cube starts to turn

const MODIFIER_MASKS = {
  none: 0,
  ctrl: Clutter.ModifierType.CONTROL_MASK,
  alt: Clutter.ModifierType.MOD1_MASK,
  shift: Clutter.ModifierType.SHIFT_MASK,
  // No Super: releasing it on its own opens the main menu.
};
const BUTTON_MASK = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK |
                    Clutter.ModifierType.BUTTON3_MASK;

// The outer left/right edge pieces of the given monitors (Main.layoutManager.monitors).
// direction is -1 for a left edge (previous workspace) and +1 for a right edge.
function outerEdgeSegments(monitors) {
  const subtract = (spans, a, b) => {
    const out = [];
    for (const [s, e] of spans) {
      if (b <= s || a >= e) {
        out.push([s, e]);
        continue;
      }
      if (a > s) out.push([s, a]);
      if (b < e) out.push([b, e]);
    }
    return out;
  };

  const segments = [];
  monitors.forEach((m, index) => {
    for (const left of [true, false]) {
      // Same convention as the old barriers: x of the first column for a left edge,
      // one past the last column for a right edge.
      const x = left ? m.x : m.x + m.width;
      let spans = [[m.y, m.y + m.height]];
      for (const o of monitors) {
        if (o !== m && (left ? o.x + o.width === x : o.x === x)) {
          spans = subtract(spans, o.y, o.y + o.height);
        }
      }
      for (let [y1, y2] of spans) {
        // Keep the monitor's own corners free for hot corners.
        if (y1 === m.y) y1 += CORNER_MARGIN;
        if (y2 === m.y + m.height) y2 -= CORNER_MARGIN;
        if (y2 > y1) {
          segments.push({x, y1, y2, monitor: index, direction: left ? -1 : 1});
        }
      }
    }
  });
  return segments;
}

class EdgeSwitch {
  constructor(cube) {
    this._cube = cube;
    this._settings = cube._settings;
    this._barriers = [];
    this._windowDrag = false;
    this._peek = null;          // {direction, turn} while the cube is peeking
    this._leaving = null;       // the barrier the pointer just moved off, during a peek
    this._tickID = 0;
    this._isTriggered = false;
    this._reset();

    this._beginID = global.display.connect('grab-op-begin', (emitter, display, window, op) => {
      if (op === Meta.GrabOp.MOVING) {
        this._windowDrag = true;
        this._update(false);
      }
    });
    this._endID = global.display.connect('grab-op-end', () => {
      // The window was dropped mid-peek: spring back.
      if (this._windowDrag) {
        this._cancel();
      }
      this._windowDrag = false;
      this._update(false);
    });
    this._monitorsID = Main.layoutManager.connect('monitors-changed', () => this._update(true));
    // Also call update(true) from the settings callbacks of enable-edge-switch and
    // enable-edge-push.
    this._update(false);
  }

  destroy() {
    global.display.disconnect(this._beginID);
    global.display.disconnect(this._endID);
    Main.layoutManager.disconnect(this._monitorsID);
    this._cancel();
    this._destroyBarriers();
  }

  // Barriers exist all the time with edge push on, otherwise only during window drags.
  // They sit where the pointer can't go anyway, so they don't change normal pointer use.
  update(rebuild) {
    this._update(rebuild);
  }

  _update(rebuild) {
    const wanted = this._settings.getValue('enable-edge-push') ||
      (this._windowDrag && this._settings.getValue('enable-edge-switch'));
    if (!wanted) {
      this._cancel();
      this._destroyBarriers();
    } else if (rebuild || this._barriers.length === 0) {
      this._createBarriers();
    }
  }

  _createBarriers() {
    this._cancel();
    this._destroyBarriers();
    this._isTriggered = false;

    try {
      for (const segment of outerEdgeSegments(Main.layoutManager.monitors)) {
        const barrier = new Meta.Barrier({
          display: global.display,
          x1: segment.x, y1: segment.y1, x2: segment.x, y2: segment.y2,
          directions: segment.direction < 0 ? Meta.BarrierDirection.POSITIVE_X
                                            : Meta.BarrierDirection.NEGATIVE_X,
        });
        barrier._segment = segment;
        barrier._isHit = false;
        barrier._hitID = barrier.connect('hit', (b, event) => this._onHit(b, event));
        barrier._leftID = barrier.connect('left', (b) => this._onLeft(b));
        this._barriers.push(barrier);
      }
    } catch (e) {
      global.logError(`Desktop Cube Reloaded: could not create edge barriers: ${e}`);
      this._destroyBarriers();
    }
  }

  _destroyBarriers() {
    this._barriers.forEach(barrier => {
      barrier.disconnect(barrier._hitID);
      barrier.disconnect(barrier._leftID);
      barrier.destroy();
    });
    this._barriers = [];
  }

  _reset() {
    this._pressure = 0;
    this._lastHit = 0;
    this._lastDecay = this._now();
  }

  _now() {
    return GLib.get_monotonic_time() / 1000;
  }

  // A plain push (no window) set to start free rotation instead of switching.
  _freeRotate() {
    return !this._windowDrag &&
      this._settings.getValue('edge-push-action') === 'free-rotate';
  }

  _threshold() {
    return this._settings.getValue(this._windowDrag ? 'edge-switch-pressure'
                                                    : 'edge-push-pressure');
  }

  // Whether a push on this barrier should do anything right now.
  _allowed(barrier) {
    const cube = this._cube;
    // Don't take over a rotation that is already in progress (panel drag, hot corner,
    // or a settle that hasn't activated its workspace yet). A plain switch animation is
    // fine: beginDrag() picks the cube up where it is.
    if (cube._anim && !this._peek && cube._anim.mode !== 'switch') {
      return false;
    }

    if (this._windowDrag) {
      return this._settings.getValue('enable-edge-switch');
    }

    if (!this._settings.getValue('enable-edge-push') || Main.modalCount) {
      return false;
    }
    const [, , mods] = global.get_pointer();
    // A held button means a text selection, a resize, a drag in some app...
    if (mods & BUTTON_MASK) {
      return false;
    }
    const need = MODIFIER_MASKS[this._settings.getValue('edge-push-modifier')] || 0;
    if ((mods & need) !== need) {
      return false;
    }
    // Games and videos.
    if (global.display.get_monitor_in_fullscreen(barrier._segment.monitor)) {
      return false;
    }
    return true;
  }

  // false if there is no workspace in that direction (gap at the first/last one).
  _targetIndex(direction) {
    const manager = global.workspace_manager;
    const n = manager.get_n_workspaces();
    if (n < 2) {
      return -1;
    }
    let index = manager.get_active_workspace_index() + direction;
    if (index < 0 || index >= n) {
      if (this._settings.getValue('last-first-gap')) {
        return -1;
      }
      index = (index + n) % n;
    }
    return index;
  }

  // Before the peek shows, pressure fades, so stray bumps against the edge never add up
  // to anything. Once the peek is showing, the user can see where they are, so it holds
  // for as long as the pointer stays at the edge, however the mouse wobbles; it only
  // goes away when the pointer moves off the edge (see _onLeft and _tick).
  _decay(now) {
    if (this._peek && (this._leaving || this._barriers.some(b => b._isHit))) {
      this._lastDecay = now;
      return;
    }
    const tau = now - this._lastHit > PUSH_IDLE ? RELEASE_TIME : PRESSURE_TIMEOUT;
    this._pressure *= Math.exp(-(now - this._lastDecay) / tau);
    this._lastDecay = now;
  }

  _onHit(barrier, event) {
    barrier._isHit = true;
    this._leaving = null;               // back at the edge
    // After triggering, wait until the pointer has left the edge before triggering again.
    if (this._isTriggered || !this._allowed(barrier)) {
      return;
    }
    const direction = barrier._segment.direction;
    // Which way the peek turns the cube. Switching turns towards the next workspace, so
    // the face slides away from the edge. Free rotation follows the hand (moving the
    // mouse right slides the face right), so its peek slides the face into the edge;
    // otherwise the cube would reverse the moment free rotation takes over.
    const turn = this._freeRotate() ? -direction : direction;
    // With the gap there may be no workspace that way. Free rotation can still start
    // there; it just doesn't peek.
    const canTurn = this._targetIndex(turn) >= 0;
    if (!canTurn && !this._freeRotate()) {
      return;
    }
    // A peek towards the other side (pointer jumped edges) starts over.
    if (this._peek && this._peek.direction !== direction) {
      this._cancel();
    }

    const threshold = this._threshold();
    const slide = Math.abs(event.dy);
    const distance = Math.abs(event.dx);
    const now = this._now();
    this._decay(now);

    if (distance >= threshold) {
      this._pressure = threshold;        // a hard flick commits at once, as before
    } else if (slide * 2 > distance) {
      return;                            // not clearly into the edge (e.g. moving along it)
    } else {
      this._pressure += Math.min(MAX_SINGLE_HIT, distance);
    }
    this._lastHit = now;

    if (this._pressure >= threshold) {
      this._commit(direction);
      return;
    }

    // Light pushes don't show the cube at all; it starts turning at PEEK_START.
    if (!canTurn || this._settings.getValue('edge-peek') <= 0 ||
        this._pressure < PEEK_START * threshold) {
      return;
    }
    if (!this._peek) {
      if (!this._cube.beginPeek()) {
        return;
      }
      this._peek = {direction, turn};
      this._tickID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PEEK_TICK, () => this._tick());
    }
    this._showPeek();
  }

  // Keeps the peek following the pressure while no hit events arrive (the user holds
  // still or eases off), and springs back once it has faded.
  _tick() {
    if (!this._peek) {
      this._tickID = 0;
      return GLib.SOURCE_REMOVE;
    }
    // The pointer moved off the edge during a peek: end it once it is clearly away,
    // so a small wobble doesn't drop the peek.
    if (this._leaving && this._isAwayFrom(this._leaving)) {
      this._tickID = 0;     // _cancel() must not remove the source we're returning from
      this._cancel();
      this._isTriggered = false;
      return GLib.SOURCE_REMOVE;
    }
    this._decay(this._now());
    // Below PEEK_START the peek is back at zero, so springing back is seamless.
    if (this._pressure < PEEK_START * this._threshold()) {
      this._tickID = 0;     // _cancel() must not remove the source we're returning from
      this._cancel();
      return GLib.SOURCE_REMOVE;
    }
    this._showPeek();
    return GLib.SOURCE_CONTINUE;
  }

  _showPeek() {
    const amount = this._settings.getValue('edge-peek') / 100;    // fraction of a face
    // PEEK_START..1 of the threshold maps to 0..1 of the peek.
    const p = Math.max(0, Math.min(1,
      (this._pressure / this._threshold() - PEEK_START) / (1 - PEEK_START)));
    const eased = 1 - (1 - p) * (1 - p);                          // fast start, then slows
    this._cube.updatePeek(this._peek.turn * amount * eased);
  }

  _onLeft(barrier) {
    barrier._isHit = false;
    if (this._barriers.some(b => b._isHit)) {
      return;
    }
    // During a peek, _tick ends it once the pointer is LEAVE_DISTANCE away.
    if (this._peek) {
      this._leaving = barrier;
      return;
    }
    this._cancel();
    this._isTriggered = false;
  }

  // Whether the pointer is at least LEAVE_DISTANCE away from the barrier's edge, or has
  // slid past the end of its segment.
  _isAwayFrom(barrier) {
    const [x, y] = global.get_pointer();
    const seg = barrier._segment;
    if (y < seg.y1 || y >= seg.y2) {
      return true;
    }
    // A left edge's barrier is at its first column, a right edge's one past its last.
    const distance = seg.direction < 0 ? x - seg.x : seg.x - 1 - x;
    return distance >= LEAVE_DISTANCE;
  }

  _commit(direction) {
    this._isTriggered = true;
    this._stopTick();
    this._reset();
    this._leaving = null;

    if (this._freeRotate()) {
      // Hand the cube over to free rotation, starting from the peek angle (beginDrag
      // picks up a cube that is already in drag mode where it is). Like the hot corner,
      // the pointer stays at the screen center afterwards, away from the edge.
      const peeking = !!this._peek;
      this._peek = null;
      const drag = this._cube._drag;
      drag.startFromHotCorner(global.get_current_time());
      if (drag._state !== DragState.ACTIVE && peeking) {
        this._cube.cancelDrag();
      }
      return;
    }

    if (this._peek) {
      this._peek = null;
      // Continues from the peek angle; the workspace is activated when the cube
      // arrives. Muffin moves a dragged window along at that point.
      this._cube.commitPeek(direction);
      return;
    }

    // No peek (setting is 0): switch right away, as the old code did.
    const workspace = global.workspace_manager.get_workspace_by_index(
      this._targetIndex(direction));
    if (workspace) {
      workspace.activate(global.get_current_time());
    }
  }

  _cancel() {
    this._stopTick();
    this._reset();
    this._leaving = null;
    if (this._peek) {
      this._peek = null;
      this._cube.cancelDrag();      // springs back to the workspace it started on
    }
  }

  _stopTick() {
    if (this._tickID) {
      GLib.source_remove(this._tickID);
      this._tickID = 0;
    }
  }
}

// ------------------------------------------------------ rotating the cube with the mouse

// Lets the user rotate the cube with the mouse. Horizontal movement rotates, vertical
// movement tilts, and the scroll wheel zooms. There are two ways to start:
//
//   panel     Drag an empty part of any panel with the left mouse button. Releasing
//             the button snaps to the workspace in front; clicking the right button
//             while dragging goes back to the workspace the drag started on.
//   shortcut  Hold the shortcut (Super+Alt+Space by default) and move the mouse, no
//             button needed. Releasing the shortcut's modifier keys, a left click, or
//             Enter snaps to the workspace in front; a right click goes back. This works anywhere, including over the
//             desktop, whose clicks go to Nemo and never reach Cinnamon. It is modeled
//             on Cinnamon's Alt+Tab switcher, which also ends when the modifiers are
//             released.
//
//   hotcorner The cube-free-rotate hot corner action. A left click or Enter snaps
//             to the workspace in front; a right click goes back.
//
// In every case a right click or Esc goes back to the workspace the drag started on.
//
// This plays the role of DragGesture.js in the GNOME extension. GNOME feeds the drag
// into its SwipeTracker; Cinnamon has none, so we drive the cube directly.
//
// We watch the stage's captured-event signal, which sees every event before any actor
// does. A press on an empty panel area is remembered but passed on, so panels still
// work normally. Only once the mouse has moved past a threshold do we take a modal grab
// and consume the events until the drag ends. During the drag the pointer is hidden
// and kept near the screen center, so screen edges never stop the rotation.
const DragState = {INACTIVE: 0, PENDING: 1, ACTIVE: 2};
// Why the pointer was last warped to the center, if that warp hasn't arrived yet.
const WarpState = {NONE: 0, BEGIN: 1, RECENTER: 2};

class DragController {
  constructor(cube) {
    this._cube = cube;
    this._state = DragState.INACTIVE;
    this._source = null;       // 'panel', 'shortcut' or 'hotcorner'
    this._grabActor = null;
    this._modal = false;
    // Mouse buttons (as Clutter.ModifierType masks) whose press we consumed but whose
    // release came after the drag ended. Those releases are swallowed too, so they
    // can't reach the panel or whatever else is under the pointer.
    this._swallowMask = 0;

    // An error here must never leave the modal grab in place, or the desktop stops
    // responding. So any error ends the drag and removes the cube.
    this._eventID = global.stage.connect('captured-event', (actor, event) => {
      try {
        return this._onEvent(event);
      } catch (e) {
        global.logError(`Desktop Cube Reloaded: drag failed: ${e}\n${e.stack}`);
        this._state = DragState.INACTIVE;
        try {
          this._ungrab();
        } catch (e2) {
          global.logError(`Desktop Cube Reloaded: could not release the grab: ${e2}`);
        }
        this._cube._finish();
        return Clutter.EVENT_PROPAGATE;
      }
    });
  }

  destroy() {
    if (this._state === DragState.ACTIVE) {
      this._ungrab();
      this._cube.endDrag(0);
    }
    this._state = DragState.INACTIVE;
    global.stage.disconnect(this._eventID);
  }

  // Called when the shortcut is pressed. `mask` holds the modifier keys the user has to
  // keep holding; 0 if the shortcut has none (then a click or Enter ends the drag).
  startFromShortcut(mask) {
    if (this._state === DragState.ACTIVE || Main.modalCount) {
      return;
    }

    const [x, y] = global.get_pointer();
    this._source = 'shortcut';
    this._mask = mask;
    this._grabActor = global.stage;
    this._startX = x;
    this._startY = y;

    if (!this._begin(global.get_current_time())) {
      return;
    }

    // Like Alt+Tab: if the modifiers were already released before we got the grab,
    // we never see the release, so check now. A quick tap just shows nothing.
    if (this._modifiersReleased()) {
      this._end(true);
    }
  }

  // Called by the cube-free-rotate hot corner action. No button or key is held,
  // so the mode ends with a click: left (or Enter) switches to the workspace in front,
  // right (or Esc) goes back to where it started.
  startFromHotCorner(time) {
    if (this._state === DragState.ACTIVE || Main.modalCount) {
      return;
    }

    const [x, y] = global.get_pointer();
    this._source = 'hotcorner';
    this._mask = 0;
    this._grabActor = global.stage;
    this._startX = x;
    this._startY = y;
    this._begin(time || global.get_current_time());
  }

  _modifiersReleased() {
    if (!this._mask) {
      return false;
    }
    const [, , mods] = global.get_pointer();
    return (mods & this._mask) !== this._mask;
  }

  // Returns the panel if the actor is the panel itself or one of its three zone boxes,
  // i.e. the press was not on an applet.
  _panelForActor(actor) {
    const panels = Main.panelManager ? Main.panelManager.getPanels() : [];
    return panels.find(p => p && actor &&
      [p.actor, p._leftBox, p._centerBox, p._rightBox].includes(actor));
  }

  _onEvent(event) {
    const type = event.type();

    if (this._state === DragState.INACTIVE) {
      if (this._swallowMask) {
        if (type === Clutter.EventType.BUTTON_RELEASE) {
          const mask = this._buttonMask(event.get_button());
          if (this._swallowMask & mask) {
            this._swallowMask &= ~mask;
            return Clutter.EVENT_STOP;
          }
        } else if (type === Clutter.EventType.BUTTON_PRESS ||
                   type === Clutter.EventType.MOTION) {
          // Forget releases we must have missed.
          this._swallowMask &= event.get_state();
        }
      }
      if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() === 1 &&
          !Main.modalCount && this._cube._settings.getValue('enable-panel-dragging') &&
          this._panelForActor(event.get_source())) {
        this._state = DragState.PENDING;
        this._source = 'panel';
        this._grabActor = this._panelForActor(event.get_source()).actor;
        [this._startX, this._startY] = event.get_coords();
      }
      return Clutter.EVENT_PROPAGATE;
    }

    if (this._state === DragState.PENDING) {
      if (type === Clutter.EventType.MOTION) {
        if ((event.get_state() & Clutter.ModifierType.BUTTON1_MASK) === 0) {
          this._state = DragState.INACTIVE;
          return Clutter.EVENT_PROPAGATE;
        }
        const [x, y] = event.get_coords();
        if (Math.abs(x - this._startX) > DRAG_THRESHOLD ||
            Math.abs(y - this._startY) > DRAG_THRESHOLD) {
          this._begin(event.get_time());
        }
      } else if (type === Clutter.EventType.BUTTON_RELEASE) {
        this._state = DragState.INACTIVE;
      }
      return Clutter.EVENT_PROPAGATE;
    }

    // ACTIVE: we own all events until the drag ends.
    const shortcut = this._source === 'shortcut';
    const hotCorner = this._source === 'hotcorner';
    if (type === Clutter.EventType.MOTION) {
      this._onDragMotion(event);
    } else if (type === Clutter.EventType.SCROLL) {
      this._onDragScroll(event);
    } else if (type === Clutter.EventType.KEY_PRESS) {
      const key = event.get_key_symbol();
      if (key === Clutter.KEY_Escape) {
        this._end(true);
      } else if ((shortcut || hotCorner) &&
                 (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter)) {
        this._end(false, event.get_time());
      }
    } else if (type === Clutter.EventType.KEY_RELEASE) {
      if (shortcut && this._modifiersReleased()) {
        this._end(false, event.get_time());
      }
    } else if (type === Clutter.EventType.BUTTON_RELEASE) {
      if (hotCorner) {
        // End on the release of a press we saw, so the release can't reach whatever
        // is under the pointer after the grab (the hot corner reacts to releases).
        if (this._pressedButton === event.get_button()) {
          this._end(event.get_button() === 3, event.get_time());
        }
      } else if (!shortcut) {
        this._end(false, event.get_time());
      }
    } else if (type === Clutter.EventType.BUTTON_PRESS) {
      if (hotCorner) {
        this._pressedButton = event.get_button();
      } else if (shortcut) {
        // A right click goes back to where it started; any other click snaps to the
        // workspace in front. Either way the button's release is swallowed.
        const button = event.get_button();
        this._end(button === 3, event.get_time(), this._buttonMask(button));
      } else if (event.get_button() === 3) {
        // A right click during a panel drag goes back to where it started, as it
        // does for the hot corner and the shortcut. The left button is usually still
        // held; both releases are swallowed once the drag has ended.
        this._end(true, event.get_time(), this._buttonMask(3));
      }
    }
    return Clutter.EVENT_STOP;
  }

  _buttonMask(button) {
    return button >= 1 && button <= 5 ? Clutter.ModifierType.BUTTON1_MASK << (button - 1) : 0;
  }

  // Ends the drag: snap to the workspace in front (throwing the cube if the mouse was
  // still moving), or go back to where the drag started if cancelled.
  // `pressedMask` adds buttons whose press is being handled right now and so isn't in
  // the pointer state yet. Any buttons still held have their releases swallowed.
  _end(cancelled, time = 0, pressedMask = 0) {
    const allButtons = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK |
      Clutter.ModifierType.BUTTON3_MASK | Clutter.ModifierType.BUTTON4_MASK |
      Clutter.ModifierType.BUTTON5_MASK;
    const [, , mods] = global.get_pointer();
    this._swallowMask = (mods | pressedMask) & allButtons;

    this._ungrab();
    this._state = DragState.INACTIVE;

    if (cancelled) {
      this._cube.cancelDrag();
      return;
    }

    // If the mouse rested before the drag ended, don't throw.
    const resting = time - this._lastTime > 100;
    const speed = this._cube._settings.getValue('mouse-rotation-speed');
    const width = Main.layoutManager.primaryMonitor.width;
    this._cube.endDrag(resting ? 0 : -this._velocity * speed / width);
  }

  // Scrolling up zooms in, scrolling down zooms out.
  _onDragScroll(event) {
    // A wheel click can arrive both as a smooth scroll and as an emulated up/down
    // event. Only use the real one.
    if (event.is_pointer_emulated && event.is_pointer_emulated()) {
      return;
    }
    const direction = event.get_scroll_direction();
    if (direction === Clutter.ScrollDirection.UP) {
      this._cube.zoomDrag(1);
    } else if (direction === Clutter.ScrollDirection.DOWN) {
      this._cube.zoomDrag(-1);
    } else if (direction === Clutter.ScrollDirection.SMOOTH) {
      const [, dy] = event.get_scroll_delta();
      this._cube.zoomDrag(-dy);
    }
  }

  // While dragging, the pointer is hidden and kept near the center of the primary
  // monitor, so it never gets stuck at a screen edge. We only use the relative movement.
  _onDragMotion(event) {
    const [x, y] = event.get_coords();
    const time = event.get_time();

    // At the start of a drag, events queued before the first warp report positions
    // from before the grab. Skip everything until the warp itself arrives as a motion
    // to the center (or, to be safe, until a short time has passed).
    if (this._warpPending === WarpState.BEGIN) {
      const arrived = Math.abs(x - this._centerX) <= 1 && Math.abs(y - this._centerY) <= 1;
      if (!arrived && time - this._warpTime < 150) {
        return;
      }
      this._warpPending = WarpState.NONE;
      this._lastX = x;
      this._lastY = y;
      this._lastTime = time;
      return;
    }

    // While re-centering, no motion may be thrown away or the cube stalls each time
    // the pointer is warped. Events still far from the center were queued before the
    // warp and are measured from the old position. The first event back near the
    // center is after the warp, and is measured from the center the pointer was
    // moved to (the user has usually moved on a few pixels past it already).
    if (this._warpPending === WarpState.RECENTER) {
      if (Math.abs(x - this._centerX) <= this._warpMarginX / 2 &&
          Math.abs(y - this._centerY) <= this._warpMarginY / 2) {
        this._warpPending = WarpState.NONE;
        this._lastX = this._centerX;
        this._lastY = this._centerY;
      } else if (time - this._warpTime > 150) {
        // The warp seems to have been lost; try again after handling this event.
        this._warpPending = WarpState.NONE;
      }
    }

    const deltaX = x - this._lastX;
    const deltaY = y - this._lastY;

    // Smoothed velocity in pixels per millisecond, for throwing the cube.
    const dt = time - this._lastTime;
    if (dt > 0) {
      this._velocity = 0.6 * (deltaX / dt) + 0.4 * this._velocity;
    }

    // Moving the mouse up tilts the cube one way, down the other. Clamp the total so
    // that reversing direction takes effect right away.
    const height = global.screen_height;
    this._totalY = Math.max(-height, Math.min(height, this._totalY + deltaY));

    this._lastX = x;
    this._lastY = y;
    this._lastTime = time;
    this._cube.updateDrag(deltaX, -this._totalY / height, Math.hypot(deltaX, deltaY));

    if (this._warpPending === WarpState.NONE &&
        (Math.abs(x - this._centerX) > this._warpMarginX ||
         Math.abs(y - this._centerY) > this._warpMarginY)) {
      this._warp(this._centerX, this._centerY);
      this._warpPending = WarpState.RECENTER;
      this._warpTime = time;
    }
  }

  // Takes the modal grab and shows the cube. Returns whether that worked.
  _begin(time) {
    // The modal grab makes sure we keep getting all mouse and keyboard events, wherever
    // the pointer is. If something else already grabbed the pointer (possible when
    // started from a shortcut), try again with keyboard only, like Alt+Tab does.
    let modal = Main.pushModal(this._grabActor, time);
    if (!modal && this._source === 'shortcut') {
      modal = Main.pushModal(this._grabActor, time, Meta.ModalOptions.POINTER_ALREADY_GRABBED);
    }
    if (!modal) {
      this._state = DragState.INACTIVE;
      return false;
    }
    this._modal = true;
    if (!this._cube.beginDrag()) {
      this._ungrab();
      this._state = DragState.INACTIVE;
      return false;
    }

    const monitor = Main.layoutManager.primaryMonitor;
    this._centerX = Math.round(monitor.x + monitor.width / 2);
    this._centerY = Math.round(monitor.y + monitor.height / 2);
    this._warpMarginX = monitor.width / 4;
    this._warpMarginY = monitor.height / 4;

    this._state = DragState.ACTIVE;
    this._pressedButton = 0;
    this._totalY = 0;
    this._velocity = 0;
    this._lastTime = time;

    // Hide the pointer and move it to the center; we put it back when the drag ends.
    this._setPointerVisible(false);
    this._warp(this._centerX, this._centerY);
    this._warpPending = WarpState.BEGIN;
    this._warpTime = time;
    return true;
  }

  // Ends the modal grab (if we hold one) and restores the pointer.
  _ungrab() {
    if (!this._modal) {
      return;
    }
    this._modal = false;
    this._setPointerVisible(true);
    // Putting the pointer back into a hot corner would trigger it again, so after a
    // hot corner rotation it stays at the screen center.
    if (this._source !== 'hotcorner') {
      this._warp(this._startX, this._startY);
    }
    Main.popModal(this._grabActor);
  }

  _warp(x, y) {
    try {
      new PointerTracker.PointerTracker().setPosition(x, y);
    } catch (e) {
      global.logError(`Desktop Cube Reloaded: could not move the pointer: ${e}`);
    }
  }

  _setPointerVisible(visible) {
    try {
      Meta.CursorTracker.get_for_display(global.display).set_pointer_visible(visible);
    } catch (e) {
      global.logError(`Desktop Cube Reloaded: could not change pointer visibility: ${e}`);
    }
  }
}

// --------------------------------------------------------------- Cinnamon entry points

function init(metadata) {
  desktopCube = new DesktopCube(metadata);
}

function enable() {
  desktopCube.enable();
}

function disable() {
  desktopCube.disable();
}
