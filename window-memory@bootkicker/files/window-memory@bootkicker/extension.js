// SPDX-License-Identifier: GPL-3.0-or-later
// Window Memory: automatically remembers and restores window geometry per application.
// Cinnamon glue only; the logic lives in lib/.
'use strict';

const Main = imports.ui.main;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const ByteArray = imports.byteArray;
const Gettext = imports.gettext;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

const Extension = imports.ui.extension;

// The modules in lib/. Cinnamon 6.8 imports them natively through getCurrentExtension() and deprecates require; Cinnamon
// 6.0 to 6.6 have no getCurrentExtension(), so there require loads <extension dir>/lib/<name>.js (misc/fileUtils.js).
function libModule(name) {
    if (typeof Extension.getCurrentExtension === 'function') return Extension.getCurrentExtension().imports.lib[name];
    return require('./lib/' + name);
}

const Geometry = libModule('geometry');
const Identity = libModule('identity');
const Pick = libModule('pick');
const Safety = libModule('safety');
const StartupPick = libModule('startupPick');
const Store = libModule('store');
const Timing = libModule('timing');

const UUID = 'window-memory@bootkicker';
const LOG = '[window-memory] ';
const HOTKEY = 'window-memory-forget-focused';
const STATE_DIR = GLib.get_user_config_dir() + '/window-memory';
const STATE_PATH = STATE_DIR + '/state.json';
// Why the extension stopped itself, if it did (lib/safety.js). A separate file, so that state.json is never touched by a stop.
const SAFETY_PATH = STATE_DIR + '/safety.json';
// The kernel's id of the running boot, one line (proc(5)); part of the session a start is recorded under (sessionKey).
const BOOT_ID_PATH = '/proc/sys/kernel/random/boot_id';
// The window list of a backup, which the settings page writes here before it calls importState (backup_buttons.py).
const STAGING_PATH = STATE_DIR + '/import-pending.json';
const SAVE_DELAY_MS = 1000;
// An error is counted for the error budget at most once per distinct text in this many seconds: one fault of one odd window
// repeats at every size or position change of a drag, and must not stop the whole extension. Logged every time all the same.
const ERROR_DEDUPE_SECONDS = 5;
const ERROR_DEDUPE_MAX = 200; // the texts remembered at most; the memory is emptied when it is full
const PICK_TIMEOUT_MS = 20000; // a pick that is not finished by then is cancelled
// The look of the pick overlay: a hint near the top of the primary monitor, and over the window under the pointer a
// teal highlight (#00CDCD, rgb 0,205,205: a fill at 0.16 opacity, 84% transparent, and a solid 2 px border) holding a label with its
// WM_CLASS. The hint and the label have the orange of the Mint-Y-Dark-Orange theme (#ff7139, rgb 255,113,57) as a
// background at 0.75 opacity and its dark gray (#353535, the colour of the toggles' knob) as the text.
const PICK_HINT_TOP = 60; // px below the top edge of the primary monitor
const PICK_HINT_STYLE = 'background-color: rgba(255,113,57,0.75); color: #353535; padding: 10px 18px; border-radius: 8px; font-size: 11pt;';
const PICK_HIGHLIGHT_STYLE = 'border: 2px solid rgba(0,205,205,1); background-color: rgba(0,205,205,0.16); border-radius: 6px;';
const PICK_NAME_STYLE = 'background-color: rgba(255,113,57,0.75); color: #353535; padding: 4px 10px; border-radius: 4px; font-weight: bold;';
const PICK_NAME_INSET = 10; // px from the top-left corner of the highlight
// What a press of "Forget the focused window" found (_forgetWindow): no window, or one that is not tracked (an excluded
// application, a dialog); a tracked window with no saved entry; a tracked window whose saved entry it removed. Or the
// forget failed (_forgetFocused).
const FORGET_UNTRACKED = 'untracked';
const FORGET_NOT_SAVED = 'not-saved';
const FORGET_REMOVED = 'removed';
const FORGET_FAILED = 'failed';

// The texts the user reads, the notifications, are translated in the domain of the uuid (cjs modules/script/gettext.js:
// dgettext). enable() binds the domain to the folder of its .mo files. A text with no translation stays in English, and
// so does everything this extension logs. A text that depends on a count would need Gettext.dngettext(UUID, ...):
// Gettext.ngettext looks in the default domain, which is Cinnamon's own (ui/main.js:204-205).
const _ = (s) => Gettext.dgettext(UUID, s);

// File I/O in the forms Cinnamon uses itself (ui/settings.js:692-694, 844-850; misc/fileUtils.js:92-94).
const fileIO = {
    exists(path) {
        return Gio.File.new_for_path(path).query_exists(null);
    },
    read(path) {
        const file = Gio.File.new_for_path(path);
        if (!file.query_exists(null)) return null;
        const result = file.load_contents(null);
        return ByteArray.toString(result[1]);
    },
    write(path, text) {
        const dir = Gio.File.new_for_path(STATE_DIR);
        if (!dir.query_exists(null)) dir.make_directory_with_parents(null);
        const raw = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
        const out = Gio.BufferedOutputStream.new_sized(raw, 4096);
        Cinnamon.write_string_to_stream(out, text);
        out.close(null);
    },
    rename(from, to) {
        // Not used in Cinnamon's JS; confirmed against the Gio typelib.
        Gio.File.new_for_path(from).move(Gio.File.new_for_path(to), Gio.FileCopyFlags.OVERWRITE, null, null);
    },
    // A file that is not there is left alone (ui/appletManager.js:356-359).
    remove(path) {
        const file = Gio.File.new_for_path(path);
        if (file.query_exists(null)) file.delete(null);
    },
};

// ui/windowMenu.js:355-362
const sched = {
    setTimeout(fn, ms) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            fn();
            return GLib.SOURCE_REMOVE;
        });
    },
    clearTimeout(id) {
        GLib.source_remove(id);
    },
};

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

// The id of the login session Cinnamon runs in (XDG_SESSION_ID), '' when unknown.
function sessionId() {
    try {
        return GLib.getenv('XDG_SESSION_ID') || '';
    } catch (e) {
        return '';
    }
}

// The id of the running boot of the kernel (a new one at every boot), '' when it cannot be read.
function bootId() {
    try {
        const text = fileIO.read(BOOT_ID_PATH);
        return text === null ? '' : text.trim();
    } catch (e) {
        return '';
    }
}

// The session a start is recorded under: '<boot id>:<session id>', '' when both are unknown. The restart-loop breaker counts
// only starts of one session: a logout in between is not a loop. logind numbers the sessions from the same counter at every
// boot (the login session often gets the same id after every boot), so the boot id keeps two quick reboots from looking like one session.
function sessionKey() {
    const boot = bootId();
    const session = sessionId();
    return boot === '' && session === '' ? '' : boot + ':' + session;
}

// ui/layout.js:43-47, 193-203
function monitorList() {
    const lm = Main.layoutManager;
    return lm.monitors.map((m, i) => ({
        index: i, x: m.x, y: m.y, w: m.width, h: m.height, primary: i === lm.primaryIndex,
    }));
}

// True for a window of a native Wayland client (Meta.WindowClientType, muffin meta/window.h:85-93); false for X11 and XWayland.
function isNativeWayland(win) {
    return typeof win.get_client_type === 'function' && win.get_client_type() === Meta.WindowClientType.WAYLAND;
}

function clientOf(win) {
    return isNativeWayland(win) ? 'wayland' : 'x11';
}

// The desktop file id of the application of win ('gnome-terminal.desktop'), the same in an X11 and in a Wayland session; null for
// a window-backed application (it has no desktop file, and its id is only that of this window) or when Cinnamon does not know it.
function appIdOf(win) {
    try {
        const app = Cinnamon.WindowTracker.get_default().get_window_app(win);
        const id = app && !app.is_window_backed() ? app.get_id() : null;
        return typeof id === 'string' && id !== '' ? id : null;
    } catch (e) {
        return null;
    }
}

function onWayland() {
    return typeof Meta.is_wayland_compositor === 'function' && Meta.is_wayland_compositor();
}

function typeName(win) {
    if (win.is_override_redirect()) return 'other';
    const t = win.get_window_type();
    // A native Wayland dialog (the Open dialog of a text editor) is a normal toplevel with a parent: Muffin 6.0.1 reports
    // it as NORMAL. With a transient parent it is a dialog; X11 and XWayland windows keep their type.
    if (t === Meta.WindowType.NORMAL) return isNativeWayland(win) && win.get_transient_for() ? 'dialog' : 'normal';
    if (t === Meta.WindowType.DIALOG || t === Meta.WindowType.MODAL_DIALOG) return 'dialog';
    return 'other';
}

function frameOf(win) {
    const f = win.get_frame_rect();
    return { x: f.x, y: f.y, w: f.width, h: f.height };
}

function sameFrame(a, b) {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

// Which parts of a target rect are remembered; the others are null and left as Muffin set them.
function rememberedParts(t, opts) {
    return {
        x: opts.position ? t.x : null, y: opts.position ? t.y : null,
        w: opts.size ? t.w : null, h: opts.size ? t.h : null,
    };
}

function windowInfo(win) {
    return {
        type: typeName(win),
        wmClass: win.get_wm_class() || '',
        instance: win.get_wm_class_instance() || '',
        role: win.get_role() || '',
        title: win.get_title() || '',
    };
}

// The name a notification gives the application of win: the name Cinnamon's window tracker knows it by, else the window's
// WM_CLASS. Never the window title. Cinnamon.WindowTracker.get_default() and get_window_app(), which can give null
// (ui/workspace.js:217-220); an application that is window-backed has no .desktop file, so Cinnamon does not know it
// (ui/lookingGlass.js:209-210); app.get_name() (ui/appSwitcher/classicSwitcher.js:437).
function appName(win) {
    // Without the tracker (an optional member) the WM_CLASS is the name.
    const app = Cinnamon.WindowTracker ? Cinnamon.WindowTracker.get_default().get_window_app(win) : null;
    const known = app && !app.is_window_backed() ? app.get_name() : '';
    return known || win.get_wm_class() || '';
}

// What the startup pick knows of win, for StartupPick.classify: {desktopFile, name, argv}, each null when it cannot be
// found. Every lookup is its own try, so one that fails leaves the others, and nothing here ever throws.
// - application and desktop file: Cinnamon.WindowTracker.get_default().get_window_app(win) (ui/workspace.js:217-220; it can
//   give null), then app.get_name() and app.get_app_info().get_filename(). get_app_info() gives a Gio.DesktopAppInfo,
//   or null for an application with no .desktop file (ui/notificationDaemon.js:675); checked on X11 with Nemo, which
//   gave /usr/share/applications/nemo.desktop.
// - command line: GLib.file_get_contents('/proc/<pid>/cmdline') gives [ok, Uint8Array] (cjs 6.0.0, checked); the arguments
//   are NUL-ended. ByteArray.toString stops at the first NUL (cjs 6.0.0, checked), so the bytes are cut at each NUL here
//   and each part is decoded alone. Meta.Window.get_pid() is 0 for a window with no process id: no command line then.
function startupInfo(win) {
    let app = null;
    try {
        app = Cinnamon.WindowTracker.get_default().get_window_app(win) || null;
    } catch (e) {
        app = null;
    }
    let name = null;
    let desktopFile = null;
    if (app) {
        try {
            name = app.get_name() || null;
        } catch (e) {
            name = null;
        }
        try {
            const info = app.get_app_info();
            const file = info ? info.get_filename() : null;
            desktopFile = typeof file === 'string' && file !== '' ? file : null;
        } catch (e) {
            desktopFile = null;
        }
    }
    let argv = null;
    if (desktopFile === null) { // an application is copied from its desktop file: no command line is needed
        try {
            const pid = win.get_pid();
            if (pid > 0) argv = splitCmdline(GLib.file_get_contents('/proc/' + pid + '/cmdline')[1]);
        } catch (e) {
            argv = null;
        }
    }
    return { desktopFile: desktopFile, name: name, argv: argv };
}

// The arguments of a /proc/<pid>/cmdline: bytes cut at each NUL, each part decoded alone. The file ends with a NUL, so
// the part after the last one is not an argument. An empty file gives [].
function splitCmdline(bytes) {
    const argv = [];
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== 0) continue;
        argv.push(ByteArray.toString(bytes.subarray(start, i)));
        start = i + 1;
    }
    if (start < bytes.length) argv.push(ByteArray.toString(bytes.subarray(start))); // a file with no final NUL
    return argv;
}

// The body of the notification after "Forget the focused window", for the outcome of the press. name is appName(win) of
// the window found for FORGET_REMOVED and FORGET_NOT_SAVED, else null. It goes where the text, or its translation,
// has %s.
function forgetMessage(outcome, name) {
    if (outcome === FORGET_REMOVED) return withName(_('Forgot the remembered window of %s.'), name);
    if (outcome === FORGET_NOT_SAVED) return withName(_('%s is not remembered, so nothing was forgotten.'), name);
    if (outcome === FORGET_FAILED) return _('Could not forget the remembered window. See the log.');
    return _('The focused window is not remembered, so nothing was forgotten.');
}

// text with name in place of its %s. The replacement is a function, so that the name is put in as it is:
// String.prototype.replace reads "$&" and the like in a replacement string.
function withName(text, name) {
    return text.replace('%s', () => name);
}

// Cinnamon's and Muffin's versions, for the start line and the notification of a stop. imports.misc.config.PACKAGE_VERSION
// (misc/config.js) and Meta.MAJOR_VERSION, MINOR_VERSION, MICRO_VERSION; 'unknown' for one that cannot be read.
function versions() {
    let cinnamon = 'unknown';
    let muffin = 'unknown';
    try {
        const v = imports.misc.config.PACKAGE_VERSION;
        if (typeof v === 'string' && v !== '') cinnamon = v;
    } catch (e) {
        // stays unknown
    }
    try {
        const parts = [Meta.MAJOR_VERSION, Meta.MINOR_VERSION, Meta.MICRO_VERSION];
        if (parts.every(n => Number.isInteger(n))) muffin = parts.join('.');
    } catch (e) {
        // stays unknown
    }
    return { cinnamon: cinnamon, muffin: muffin };
}

// The members of Cinnamon and Muffin that the extension cannot work without, by the names it uses them under, and the
// Meta.Window methods it calls on every window. Each name was seen on Cinnamon 6.0.5 (Muffin 6.0.1). One that is gone, after
// an update, stops the extension at start (requiredMissing) instead of failing again and again inside a signal handler.
const REQUIRED_WINDOW_METHODS = ['get_frame_rect', 'move_resize_frame', 'move_frame', 'move_to_monitor', 'maximize', 'minimize',
    'get_monitor', 'get_workspace', 'get_wm_class', 'get_wm_class_instance', 'get_window_type', 'get_maximized', 'change_workspace'];

// Reads a member by its path, 'Main.layoutManager', without throwing: undefined when any step on the way is missing.
function member(root, names) {
    let o = root;
    for (const n of names) {
        if (o === undefined || o === null) return undefined;
        o = o[n];
    }
    return o;
}

// The names of the required members that are missing, in a fixed order; [] when all are there. enable() runs this before it
// connects anything, so a missing member never reaches a half-started extension.
function requiredMissing() {
    const found = [];
    const need = (name, ok) => {
        if (!ok) found.push(name);
    };
    need('global.display', !!global.display);
    need('global.window_manager', !!global.window_manager);
    need('global.workspace_manager', !!global.workspace_manager);
    need('global.get_window_actors', typeof global.get_window_actors === 'function');
    need('Main.layoutManager', !!member(Main, ['layoutManager']));
    need('Main.layoutManager.monitors', !!member(Main, ['layoutManager']) && !!Main.layoutManager.monitors);
    need('Settings.ExtensionSettings', typeof member(Settings, ['ExtensionSettings']) === 'function');
    need('SignalManager.SignalManager', typeof member(SignalManager, ['SignalManager']) === 'function');
    need('Meta.MaximizeFlags', !!member(Meta, ['MaximizeFlags']));
    need('Meta.WindowType', !!member(Meta, ['WindowType']));
    // The file I/O of fileIO (state.json, safety.json). toString must be the module's own: every object inherits one.
    need('imports.byteArray.toString', typeof member(ByteArray, ['toString']) === 'function' && ByteArray.toString !== Object.prototype.toString);
    need('Cinnamon.write_string_to_stream', typeof member(Cinnamon, ['write_string_to_stream']) === 'function');
    need('Gio.BufferedOutputStream.new_sized', typeof member(Gio, ['BufferedOutputStream', 'new_sized']) === 'function');
    need('Gio.File.new_for_path', typeof member(Gio, ['File', 'new_for_path']) === 'function');
    const proto = member(Meta, ['Window', 'prototype']);
    REQUIRED_WINDOW_METHODS.forEach(m => need('Meta.Window.prototype.' + m, !!proto && typeof proto[m] === 'function'));
    return found;
}

// The optional members that are missing: each one only costs its feature, which the code skips or degrades without it.
// Meta.later_add and later_remove (a restored minimized state, the correction of a hidden window), Main.keybindingManager
// (the hotkey), Main.pushModal, popModal and Cinnamon.Cursor ("Pick a window"), Main.notify (a log line instead of a
// notification), Cinnamon.WindowTracker (the WM_CLASS names the application).
function optionalMissing() {
    const found = [];
    if (!hasLater()) found.push('Meta.later_add');
    if (typeof member(Meta, ['later_remove']) !== 'function') found.push('Meta.later_remove');
    if (!member(Main, ['keybindingManager'])) found.push('Main.keybindingManager');
    if (typeof member(Main, ['pushModal']) !== 'function') found.push('Main.pushModal');
    if (typeof member(Main, ['popModal']) !== 'function') found.push('Main.popModal');
    if (!member(Cinnamon, ['Cursor'])) found.push('Cinnamon.Cursor');
    if (typeof member(Main, ['notify']) !== 'function') found.push('Main.notify');
    if (!member(Cinnamon, ['WindowTracker'])) found.push('Cinnamon.WindowTracker');
    return found;
}

// Meta.later_add and the types it takes are there: a restored minimized state and the correction of a hidden window need them.
function hasLater() {
    return typeof member(Meta, ['later_add']) === 'function' && !!member(Meta, ['LaterType']);
}

// The first sentence of the notification of a stop: why. The second, resumeSentence: how to resume.
function stopSentence(reason) {
    if (reason === Safety.REASONS.MISSING_CALL) {
        return _('Window Memory stopped itself for safety: a function it needs is missing from this version of Cinnamon.');
    }
    if (reason === Safety.REASONS.TOO_MANY_ERRORS) return _('Window Memory stopped itself for safety: too many errors.');
    if (reason === Safety.REASONS.RESTART_LOOP) return _('Window Memory stopped itself for safety: Cinnamon restarted repeatedly.');
    return _('Window Memory stopped itself for safety: it could not start.');
}

// 'switch': the settings object is there, so the Enable switch can resume. 'file': it is not, so only deleting safety.json can.
function resumeSentence(resume) {
    if (resume === 'file') {
        return _('To resume once the problem is fixed, delete ~/.config/window-memory/safety.json. If this happens again, please report an issue.');
    }
    return _('To resume, turn "Enable Window Memory" off and on in its settings. If this happens again, please report an issue.');
}

class WindowMemory {
    constructor(meta) {
        this._meta = meta;
        this._settings = null;
        this._signals = null;
        this._saver = null;
        this._lastWritten = null; // the last text written to the state file; null until the first write after enable
        this._safety = Safety.emptySafety(); // what safety.json says: a recorded stop, the recorded starts
        this._safetyText = null; // the text of safety.json as last read or written; null while there is no such file
        this._stopped = false; // true in stopped mode: nothing is tracked, only the Enable switch is watched
        this._working = false; // true between _startWork and _releaseWork
        this._failSeen = new Map(); // the text of an error -> the second it was last counted
        this._budget = Safety.createErrorBudget(Safety.LIMITS.errorLimit, Safety.LIMITS.errorWindowSeconds); // the unexpected errors of this run
        this._enabledWatched = false; // changed::enabled is connected on the current settings object
        this._settingsHooked = false; // the other settings handlers are connected on the current settings object
        this._state = Store.emptyState();
        this._saveBlocked = false; // true while an unreadable state file could not be moved aside
        this._pick = null; // {actor, eventId, timeoutId} while "Pick a window" is running, else null
        // Meta.Window -> {key, entryId, ready, restored, target, targetMonitor, lateEntry, paused, grabFrame, handles, idle,
        // minimizeLater, correctLater, placeUnchecked}
        this._tracked = new Map();
        // Meta.Window -> {handles, mapped} for a window that had no class at window-created and is waited for until it has one.
        this._waiting = new Map();
    }

    enable() {
        try {
            this._enable();
        } catch (e) {
            // Nothing stays connected: what the start took is given back, then the extension stops, with the Enable switch as the
            // way to resume if the settings object is there. This is the one error that is logged and not counted.
            this._failedStart(e);
            const st = this._safety.stopped;
            if (st && !this._stopped) {
                // A stop recorded before this start stands as it is (safety.json read first, in _enable): no new record over it,
                // no second notification for a start that fails at every login.
                this._stopped = true;
                this._logStopped(st);
                this._watchEnabled();
                return;
            }
            this._stop(Safety.REASONS.START_FAILED, this._settings ? 'switch' : 'file');
        }
    }

    // The log line of a failed start, and the release of what it took.
    _failedStart(e) {
        global.logError(LOG + 'starting failed: ' + e);
        try {
            this._releaseWork();
        } catch (e2) {
            global.logWarning(LOG + 'releasing a failed start failed: ' + e2);
        }
    }

    _enable() {
        // The Spices installer compiles po/<lang>.po into <locale folder>/<lang>/LC_MESSAGES/<uuid>.mo: the user data dir's
        // locale folder in current Cinnamon (python3/cinnamon/harvester.py:44-45), ~/.local/share/locale in Cinnamon 6.0
        // (cinnamon-settings bin/Spices.py:27, 733-737), the same folder unless XDG_DATA_HOME is set. Cinnamon binds the
        // domain of an applet to its folder (ui/appletManager.js:612), not the domain of an extension.
        Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + '/locale');
        // Read before anything that can fail: a start that fails knows whether a stop was already recorded.
        this._readSafety();
        // Without the settings class there is no Enable switch to resume with: then only deleting safety.json resumes.
        if (typeof member(Settings, ['ExtensionSettings']) === 'function') {
            this._settings = new Settings.ExtensionSettings(this, UUID); // ui/settings.js:939
        }
        const v = versions();
        global.log(LOG + 'starting: Cinnamon ' + v.cinnamon + ', Muffin ' + v.muffin + ', session ' + (onWayland() ? 'wayland' : 'x11'));
        // Every start is recorded, also one that finds a stop; a disable() clears the record. Three starts of one session, each
        // within LIMITS.loopGapSeconds of the one before, are a restart loop (lib/safety.js). With a stop already recorded the
        // loop is not judged again: nothing is connected and nothing is notified a second time.
        const stoppedBefore = this._safety.stopped !== null;
        this._safety = Safety.recordStart(this._safety, nowSeconds(), sessionKey());
        this._writeSafety();
        if (!stoppedBefore && Safety.isRestartLoop(this._safety, Safety.LIMITS.loopStarts, Safety.LIMITS.loopGapSeconds)) {
            global.logWarning(LOG + 'Cinnamon restarted repeatedly: stopping');
            this._stop(Safety.REASONS.RESTART_LOOP, this._settings ? 'switch' : 'file');
            return;
        }
        if (this._safety.stopped) {
            // Stopped: no signal, no hotkey, no timer; state.json is not even read. Only the switch is watched, to resume.
            this._stopped = true;
            this._logStopped(this._safety.stopped);
            this._watchEnabled();
            return;
        }
        this._guardedStart();
    }

    // The one line a start that finds a recorded stop logs.
    _logStopped(st) {
        global.log(LOG + 'stopped (' + st.reason + '): not tracking windows; ' +
            (st.resume === 'file' ? 'delete ' + SAFETY_PATH + ' to resume' : 'turn "Enable Window Memory" off and on to resume'));
    }

    // Starts the work behind the guards, for enable() and for a resume by the Enable switch alike: a required member that is
    // missing stops the extension before anything is connected, a missing optional member is reported, and a failure in the
    // middle of _startWork gives back what it took and stops with start-failed. Never leaves anything half-started.
    _guardedStart() {
        const resume = this._settings ? 'switch' : 'file';
        const missing = requiredMissing();
        if (missing.length > 0) {
            global.logWarning(LOG + 'required and missing: ' + missing.join(', '));
            this._stop(Safety.REASONS.MISSING_CALL, resume);
            return;
        }
        const optional = optionalMissing();
        if (optional.length > 0) global.logWarning(LOG + 'missing, and the feature that needs it is skipped: ' + optional.join(', '));
        try {
            this._startWork();
        } catch (e) {
            this._failedStart(e);
            this._stop(Safety.REASONS.START_FAILED, resume);
        }
    }

    // Everything that makes the extension work: the state, the signals, the hotkey, the open windows.
    _startWork() {
        this._working = true;
        this._budget.reset();
        this._failSeen.clear();
        this._signals = new SignalManager.SignalManager(null);
        this._saver = Timing.createDebouncer(SAVE_DELAY_MS, () => this._flush(), sched);
        this._lastWritten = null;
        this._loadState();
        this._signals.connect(global.display, 'window-created', this._onWindowCreated, this);
        this._signals.connect(global.display, 'grab-op-begin', this._onGrabOpBegin, this);
        this._signals.connect(global.display, 'grab-op-end', this._onGrabOpEnd, this);
        this._signals.connect(global.window_manager, 'map', this._onMap, this);
        if (!this._settingsHooked) {
            this._settingsHooked = true;
            // 'changed::<key>' (ui/settings.js:623); finalize() disconnects these (ui/settings.js:866-873). They stay
            // connected through a stop, so each does nothing while the extension is stopped.
            this._settings.connect('changed::forget-focused', () => {
                if (!this._stopped) this._bindHotkey();
            });
            // Settings changes apply at once: these change which open windows are eligible.
            this._settings.connect('changed::excluded-apps', () => {
                if (!this._stopped) this._trackExisting();
            });
            this._settings.connect('changed::include-dialogs', () => {
                if (!this._stopped) this._trackExisting();
            });
        }
        this._watchEnabled();
        this._bindHotkey();
        this._trackExisting();
    }

    _watchEnabled() {
        if (this._enabledWatched || !this._settings) return;
        this._settings.connect('changed::enabled', () => this._onEnabledChanged());
        this._enabledWatched = true; // only once connected: a connect that failed is tried again at the next chance
    }

    // Any change of the Enable switch clears a stop (the only way to resume besides deleting safety.json). A resume starts the
    // work as enable() does, through the same guards and whatever the switch now says (the handlers check it themselves); a
    // guard that fails again is a new stop, with its own notification. Not stopped, it re-evaluates the open windows as before.
    _onEnabledChanged() {
        try {
            if (this._stopped) {
                this._safety = Safety.resumeSafety();
                this._writeSafety();
                this._stopped = false;
            }
            if (!this._working) {
                this._guardedStart();
            } else {
                this._trackExisting();
            }
        } catch (e) {
            global.logError(LOG + 'applying the Enable switch failed: ' + e);
        }
    }

    // Stops the extension completely: everything released, the stop written to safety.json, one notification. resume is
    // 'switch' when the Enable switch can resume it, 'file' when only deleting safety.json can (no settings object). A second
    // call while stopped does nothing. state.json is not touched here, except for the flush of changes still pending, which
    // _releaseWork makes as disable() does. Never throws: it runs inside enable(), signal handlers and catch blocks.
    _stop(reason, resume) {
        if (this._stopped) return;
        this._stopped = true;
        try {
            try {
                this._releaseWork();
            } catch (e) {
                global.logWarning(LOG + 'releasing everything for a stop failed: ' + e);
            }
            const v = versions();
            const record = Safety.stopRecord(reason, nowSeconds(), v.cinnamon, v.muffin, resume);
            this._safety = Safety.stopSafety(this._safety, record);
            this._writeSafety();
            this._notifyStop(record);
            this._watchEnabled();
        } catch (e) {
            try {
                global.logWarning(LOG + 'stopping failed: ' + e);
            } catch (e2) {
                // nothing is left to report to
            }
        }
    }

    // The one place an unexpected error is logged: LOG + message + ': ' + error, as before. When counted, it also goes into
    // the error budget, and too many in a short time stop the extension (lib/safety.js). counted is false for an expected
    // condition (an unreadable or unwritable state file, a failed release); nothing is counted either while the extension is
    // leaving or already stopped (_releaseWork has cleared _working), and an error with the same text as one counted less than
    // ERROR_DEDUPE_SECONDS ago is logged and not counted. Never throws: it is called from catch blocks.
    _fail(message, error, counted = true) {
        try {
            global.logError(LOG + message + ': ' + error);
            if (!counted || !this._working || this._stopped) return;
            const now = nowSeconds();
            const text = message + ': ' + error;
            const last = this._failSeen.get(text);
            if (last !== undefined && now - last < ERROR_DEDUPE_SECONDS) return;
            if (this._failSeen.size >= ERROR_DEDUPE_MAX) this._failSeen.clear();
            this._failSeen.set(text, now);
            if (this._budget.record(now)) this._stop(Safety.REASONS.TOO_MANY_ERRORS, 'switch');
        } catch (e) {
            try {
                global.logWarning(LOG + 'counting an error failed: ' + e);
            } catch (e2) {
                // nothing is left to report to
            }
        }
    }

    // Main.notify(title, body) (ui/main.js:751-757). No window title, path or user data in it. A notification that fails, or
    // is not there, leaves the log line: the stop stands.
    _notifyStop(record) {
        const body = stopSentence(record.reason) + '\n' + resumeSentence(record.resume) + '\n' +
            'Cinnamon ' + record.cinnamon + ', Muffin ' + record.muffin;
        try {
            Main.notify(_('Window Memory'), body);
        } catch (e) {
            global.logWarning(LOG + 'the notification of a stop failed (' + e + '): ' + body);
        }
    }

    // A file that is missing, unreadable or not understood means: no stop recorded, no starts. Never an error.
    _readSafety() {
        this._safety = Safety.emptySafety();
        this._safetyText = null;
        try {
            const text = fileIO.read(SAFETY_PATH);
            if (text === null) return;
            this._safetyText = text;
            this._safety = Safety.parseSafety(text);
        } catch (e) {
            global.logWarning(LOG + 'could not read ' + SAFETY_PATH + ': ' + e);
        }
    }

    // Writes nothing when there is nothing to record and no file, or when the file already says it. A failure is logged as a
    // warning (never counted as an error) and never stops anything: the extension works without this file.
    _writeSafety() {
        try {
            const text = Safety.serializeSafety(this._safety);
            if (text === this._safetyText) return;
            if (this._safetyText === null && !this._safety.stopped && this._safety.starts.length === 0) return;
            fileIO.write(SAFETY_PATH, text);
            this._safetyText = text;
        } catch (e) {
            global.logWarning(LOG + 'could not write ' + SAFETY_PATH + ': ' + e);
        }
    }

    // Gives back everything _startWork took: pending changes are written first, then the signals, the window handles, the
    // timers and the hotkey are released. The settings object stays. Safe to call when nothing is connected.
    _releaseWork() {
        this._working = false;
        this._endPick(); // never leave the input grabbed when the extension goes away
        // Capture the changes still waiting for their idle second, then write them.
        this._tracked.forEach(rec => {
            try {
                rec.idle.flush();
            } catch (e) {
                this._fail('saving a pending change failed', e, false);
            }
        });
        if (this._saver) this._saver.flush();
        if (this._signals) this._signals.disconnectAllSignals();
        this._tracked.forEach(rec => this._releaseHandles(rec));
        this._tracked.clear();
        Array.from(this._waiting.keys()).forEach(win => this._stopWaiting(win));
        if (Main.keybindingManager) {
            try {
                Main.keybindingManager.removeHotKey(HOTKEY);
            } catch (e) {
                this._fail('removing the hotkey failed', e, false);
            }
        }
        if (this._saver) this._saver.cancel();
        this._signals = null;
        this._saver = null;
    }

    disable() {
        this._releaseWork();
        // Cinnamon calls disable() when it unloads the extension, not at a restart or a logout: a clean disable. A recorded
        // stop stays: only the Enable switch or deleting safety.json clears it.
        this._safety = Safety.afterCleanDisable(this._safety);
        this._writeSafety();
        if (this._settings) this._settings.finalize();
        this._settings = null;
        this._enabledWatched = false;
        this._settingsHooked = false;
        this._stopped = false;
    }

    // Button callbacks are looked up on this object (ui/extensionSystem.js:84-90, ui/cinnamonDBus.js:359-363).
    // Stopped, they answer with a log line and do nothing: they need the windows, the state or the pick that are released.
    callbacks() {
        return {
            forgetAll: this._unlessStopped('forgetAll', () => this._forgetAll()),
            forgetFocused: this._unlessStopped('forgetFocused', () => this._forgetFocused()),
            pickWindow: this._unlessStopped('pickWindow', () => this._startPick('exclude')),
            pickStartupWindow: this._unlessStopped('pickStartupWindow', () => this._startPick('startup')),
            importState: this._unlessStopped('importState', () => this._importState(), 'import rejected: Window Memory is stopped for safety'),
        };
    }

    // reject: the message of the error that a call throws while stopped, when its caller must hear that nothing was done
    // (importState: a normal return makes the settings page report a success); it throws before it touches the state file or the staging file.
    _unlessStopped(name, fn, reject) {
        return () => {
            if (this._stopped) {
                if (reject) throw new Error(LOG + reject);
                global.log(LOG + 'stopped; ignoring ' + name);
                return undefined;
            }
            return fn();
        };
    }

    _active() {
        return !!this._settings && !!this._settings.getValue('enabled');
    }

    _options() {
        const s = this._settings;
        const rows = s.getValue('excluded-apps') || [];
        return {
            size: !!s.getValue('remember-size'),
            position: !!s.getValue('remember-position'),
            monitor: !!s.getValue('remember-monitor'),
            workspace: !!s.getValue('remember-workspace'),
            maximized: !!s.getValue('remember-maximized'),
            minimized: !!s.getValue('remember-minimized'),
            matchByTitle: s.getValue('match-by-title') === 'class+title',
            includeDialogs: !!s.getValue('include-dialogs'),
            // Only the rows that are checked: a row saved before the Enabled column has no `enabled` and counts as checked.
            excludedApps: rows.filter(row => !(row && row.enabled === false)).map(row => (row && row.wmclass) || ''),
            maxEntries: s.getValue('max-entries') || 500,
        };
    }

    _claimedIds() {
        const ids = new Set();
        this._tracked.forEach(rec => {
            if (rec.entryId !== null) ids.add(rec.entryId);
        });
        return ids;
    }

    // Binds the record of an open window to the saved entry that pickEntry chooses for it among those no other open
    // window holds, or to none. The window is not moved.
    _claimSavedEntry(rec, info, opts, win) {
        const saved = this._pickSaved(win, rec, {
            title: info.title,
            role: info.role,
            type: info.type,
            matchByTitle: opts.matchByTitle,
            minimizedMatters: opts.minimized,
            claimed: this._claimedIds(),
        });
        rec.entryId = saved ? saved.id : null;
    }

    // The saved entry for a window: the best of the entries with its key or an equivalent key; if there is none, the best entry
    // that the same application (desktop file id) saved as the other kind of client (Identity.learnedCandidates).
    _pickSaved(win, rec, ctx) {
        const own = Identity.pickEntry(Store.entriesForKeys(this._state, Identity.equivalentKeys(rec.key)), ctx);
        if (own) return own;
        const client = clientOf(win);
        const appId = appIdOf(win);
        if (appId === null) {
            // Not known yet, perhaps: look again at the next size or position change if some entry could match then.
            rec.learnPending = !rec.ready && this._state.windows.some(e => e.appId && (e.client || 'x11') !== client);
            return null;
        }
        rec.learnPending = false;
        const learned = Identity.learnedCandidates(this._state.windows, appId, client);
        if (learned.length === 0) return null;
        return Identity.pickEntry(learned.slice().sort((a, b) => b.lastSeen - a.lastSeen), ctx);
    }

    // The restore found no entry while the application was still unknown: try again now that it may be known, before the first
    // show. Only a window with learnPending set does anything here.
    _retryLearned(win) {
        try {
            const rec = this._tracked.get(win);
            if (!rec || !rec.learnPending) return;
            if (rec.ready || rec.entryId !== null || rec.paused) {
                rec.learnPending = false;
                return;
            }
            if (appIdOf(win) === null) return;
            rec.learnPending = false;
            rec.restored = false;
            this._restore(win);
        } catch (e) {
            this._fail('looking again for a saved place failed', e);
        }
    }

    // A state file that exists but cannot be read or parsed is never overwritten: it is moved aside
    // to state.json.bad-<seconds>, or, if that fails, saving is switched off for this session.
    _loadState() {
        this._saveBlocked = false;
        this._state = Store.emptyState();
        try {
            const loaded = Store.loadState(fileIO, STATE_PATH, nowSeconds());
            this._state = loaded.state;
            if (loaded.recovered) {
                // loadState has already tried to move the file aside; check that it did.
                if (fileIO.exists(STATE_PATH)) this._blockSaves('the unreadable state file could not be moved aside');
                else global.logWarning(LOG + 'state file was unreadable and has been moved aside');
            }
        } catch (e) {
            this._fail('could not read the state file', e, false);
            try {
                fileIO.rename(STATE_PATH, STATE_PATH + '.bad-' + nowSeconds());
                global.logWarning(LOG + 'the unreadable state file has been moved aside');
            } catch (e2) {
                this._blockSaves('the unreadable state file could not be moved aside: ' + e2);
            }
        }
    }

    _blockSaves(why) {
        this._saveBlocked = true;
        global.logError(LOG + why + '; not saving, to keep the file as it is');
    }

    // Keybinding settings have no callback; register the value (ui/keybindings.js:69-73, 128-137).
    _bindHotkey() {
        if (!Main.keybindingManager) return; // an optional member: no hotkey without it (optionalMissing has said so)
        try {
            Main.keybindingManager.removeHotKey(HOTKEY);
            const accel = this._settings.getValue('forget-focused');
            if (accel) Main.keybindingManager.addHotKey(HOTKEY, accel, () => this._forgetFocused());
        } catch (e) {
            this._fail('binding the hotkey failed', e);
        }
    }

    // Windows that exist already were mapped before enable(). ui/main.js:1109, ui/layout.js:27
    _trackExisting() {
        try {
            // A window still waiting for its class is tracked when the class arrives (as not yet mapped, so that it is restored).
            // A stop in the middle (the 20th error) leaves the rest of the windows alone.
            for (const actor of global.get_window_actors()) {
                if (!this._working || this._stopped) break;
                if (!this._waiting.has(actor.meta_window)) this._track(actor.meta_window, true);
            }
        } catch (e) {
            this._fail('tracking open windows failed', e);
        }
    }

    // ui/windowManager.js:358
    // A native Wayland window has no class yet when Muffin announces it: its app id arrives about 20 ms later, before its first size,
    // and the window is placed and shown after that (seen on Cinnamon 6.0.5 on Wayland). Such a window is waited for;
    // an X11 or XWayland window has its class at window-created and is tracked at once, as before.
    _onWindowCreated(display, win) {
        try {
            if (!win) return;
            if (win.get_wm_class() || !isNativeWayland(win)) this._track(win, false); // X11 and XWayland: as before
            else this._waitForClass(win);
        } catch (e) {
            this._fail('window-created handler failed', e);
        }
    }

    // Watches a window that has no class yet. The class is read again when Muffin announces it (notify::wm-class) and, in case
    // that is not sent for this property, at the window's first size and position changes, which come before the window is
    // shown. Only the first time the class is there decides: _track then restores the window if it is not mapped yet.
    _waitForClass(win) {
        if (this._waiting.has(win)) return;
        const wait = { handles: [], mapped: false };
        this._waiting.set(win, wait);
        const check = () => this._classArrived(win);
        ['notify::wm-class', 'size-changed', 'position-changed'].forEach(sig => {
            if (!this._working) return; // a failure above stopped the extension
            try {
                wait.handles.push([win, win.connect(sig, check)]);
            } catch (e) {
                this._fail('connecting ' + sig + ' to wait for the class failed', e);
            }
        });
        if (!this._working) return;
        try {
            wait.handles.push([win, win.connect('unmanaged', () => this._stopWaiting(win))]);
        } catch (e) {
            this._fail('connecting unmanaged failed', e);
        }
    }

    _classArrived(win) {
        try {
            const wait = this._waiting.get(win);
            if (!wait || !win.get_wm_class()) return;
            this._stopWaiting(win);
            // A window that mapped before its class was known was shown already: it is tracked without being moved.
            this._track(win, wait.mapped);
        } catch (e) {
            this._fail('class handler failed', e);
        }
    }

    _stopWaiting(win) {
        const wait = this._waiting.get(win);
        if (!wait) return;
        this._waiting.delete(win);
        wait.handles.forEach(h => {
            try {
                h[0].disconnect(h[1]);
            } catch (e) {
                // The window is already gone; nothing left to disconnect.
            }
        });
        wait.handles = [];
    }

    // global.window_manager 'map' passes (cinnamonwm, actor) (ui/windowManager.js:282, 830-831).
    // The first map ends the window's first-frame decision: from here on its changes are captured, and the place
    // chosen at window-created is only corrected. A window the user already moved (ready) is left where it is.
    _onMap(cinnamonwm, actor) {
        try {
            const win = actor ? actor.meta_window : null;
            const wait = win ? this._waiting.get(win) : null;
            if (wait) {
                wait.mapped = true; // shown with no class: when the class arrives it is tracked as already mapped
                this._classArrived(win);
                return;
            }
            const rec = win ? this._tracked.get(win) : null;
            if (!rec || rec.ready) return;
            rec.ready = true;
            this._correctAtMap(win, rec, true);
        } catch (e) {
            this._fail('map handler failed', e);
        }
    }

    // grab-op-begin and grab-op-end pass (emitter, display, window, op) (Cinnamon's windowManager.js, display signals).
    // Take the first argument that is a window; an event without one is ignored.
    _onGrabOpBegin(...args) {
        try {
            const win = args.find(a => a && typeof a.get_frame_rect === 'function');
            const rec = win ? this._tracked.get(win) : null;
            if (rec) rec.grabFrame = frameOf(win);
        } catch (e) {
            this._fail('grab-op-begin handler failed', e);
        }
    }

    _onGrabOpEnd(...args) {
        try {
            const win = args.find(a => a && typeof a.get_frame_rect === 'function');
            const rec = win ? this._tracked.get(win) : null;
            if (!rec) return;
            // A plain click on the title bar also ends a grab. Only a grab that changed the frame (or one whose
            // begin was not seen) teaches the window, so a click does not undo a forget.
            const before = rec.grabFrame;
            rec.grabFrame = null;
            if (before && sameFrame(before, frameOf(win))) return;
            rec.idle.cancel();
            rec.ready = true; // moved by the user before its first map: the map must not move it back
            rec.paused = false; // an explicit drag or resize teaches the window again after a forget
            rec.placeUnchecked = false; // and the user chose the place, so the capture below saves it
            this._capture(win, true);
        } catch (e) {
            this._fail('grab-op-end handler failed', e);
        }
    }

    _track(win, mapped) {
        try {
            if (!win || !this._working || this._stopped || !this._active() || this._tracked.has(win)) return;
            const info = windowInfo(win);
            const opts = this._options();
            if (!Identity.isEligible(info, opts)) return;
            // paused: set by forget; the window is not captured again until the user drags or resizes it.
            // idle: captures a position or size change once the window has been still for SAVE_DELAY_MS.
            // grabFrame: the frame when the current grab began, to tell a drag from a click.
            // ready: false until the first map or the first 'shown' (a window restored minimized never maps), or a user
            // move before either; captures are ignored until then.
            // restored: the first-frame restore has run (once, at window-created) or never will (a window already mapped).
            // target: the rect that restore chose, {x, y, w, h} with null for a part that is not remembered, or null.
            // targetMonitor: the monitor a maximized window was sent to, which the map checks, or null.
            // lateEntry: the entry whose rect the map works out again from the monitor the window is on then
            // (remember-monitor off: before the map the monitor is only what the client asked for), or null.
            // minimizeLater: the id of the Meta.later_add that minimizes a window restored minimized, until it runs, or null.
            // correctLater: the id of the Meta.later_add (BEFORE_REDRAW) that puts a window on its restored place if it has
            // not mapped or been shown by then, queued when a place is waiting for a map to check it (target, targetMonitor
            // or lateEntry set), until it runs, or null.
            // placeUnchecked: true when the window became ready at a 'shown' while a restored place was still waiting for
            // a map to check it (target, targetMonitor, monitorKeep or lateEntry set). No map did: correctLater put the window on
            // its saved place before this show, and until the user drags or resizes it, captures keep its saved monitor and
            // rect. False otherwise.
            // monitorKeep: the saved monitor, when the restore chose one: Muffin's placement on Wayland can take a window back to
            // the pointer's monitor after the restore, so the map checks it (also with size and position off), or null.
            // fixMaximize: Wayland only: the window was maximized by the restore; when the maximized size arrives the frame is put
            // at the work area origin, because Muffin on Wayland keeps the position the window had (seen on Cinnamon 6.0.5).
            // learnPending: the restore found no entry, the window's application is still only the window-backed placeholder
            // (Cinnamon knows the desktop application a few tens of ms after the class), and the state holds entries of the other kind
            // of client with an application id: the lookup by application id is tried again at the next size or position change,
            // until the first show. Never true for a session with one kind of client only. false otherwise.
            // maximizeAtMap: native Wayland only: the window is restored maximized, and the maximize waits for the first map (or the
            // later that corrects a hidden window), after the window was put at its saved place (see _restore).
            // maximizeOnShow: {monitor} for a window restored minimized and maximized: a maximize before the first show is
            // dropped when the window is minimized, so it is applied when the window is un-minimized, or null.
            const rec = {
                key: Identity.windowKey(info), entryId: null, ready: !!mapped, restored: !!mapped, target: null,
                targetMonitor: null, lateEntry: null, paused: false, grabFrame: null, handles: [], idle: null,
                minimizeLater: null, correctLater: null, placeUnchecked: false,
                monitorKeep: null, fixMaximize: false, maximizeAtMap: false, maximizeOnShow: null, learnPending: false,
            };
            rec.idle = Timing.createDebouncer(SAVE_DELAY_MS, () => this._capture(win), sched);
            this._tracked.set(win, rec);
            if (mapped) {
                // Already open and already placed: claim its saved entry without moving the window, so that a
                // later window of the same app is not restored on top of it and its captures update that entry.
                this._claimSavedEntry(rec, info, opts, win);
            }
            if (!this._working) return; // a failure while claiming the entry stopped the extension: nothing is connected
            const whenIdle = () => this._captureWhenIdle(win);
            rec.handles.push([win, win.connect('position-changed', whenIdle)]);
            rec.handles.push([win, win.connect('size-changed', whenIdle)]);
            // 'notify::minimized' is the property's change notification, which Cinnamon connects itself
            // (ui/windowManager.js:346). 'shown' is Meta.Window's signal for a hidden window that is visible again
            // (muffin core/window.c:757-758, 2730); a signal that cannot be connected is logged and the restore below
            // still happens.
            this._tryConnect(win, rec, 'notify::minimized', () => {
                this._onUnminimized(win);
                whenIdle();
            });
            this._tryConnect(win, rec, 'size-changed', () => this._fixMaximized(win));
            this._tryConnect(win, rec, 'size-changed', () => this._retryLearned(win));
            this._tryConnect(win, rec, 'position-changed', () => this._retryLearned(win));
            this._tryConnect(win, rec, 'shown', () => this._onShown(win));
            if (!this._working) { // a failed connect stopped the extension: what this window has connected is given back
                this._releaseHandles(rec);
                return;
            }
            // 'unmanaging' fires while the window is intact (ui/windowManager.js:352); 'unmanaged' after.
            rec.handles.push([win, win.connect('unmanaging', () => this._captureNow(win))]);
            rec.handles.push([win, win.connect('unmanaged', () => this._untrack(win))]);
            // A window that is not mapped yet is placed now, before Muffin shows it. The map only corrects.
            if (!mapped) this._restore(win);
        } catch (e) {
            this._fail('tracking a window failed', e);
        }
    }

    _restore(win) {
        const rec = this._tracked.get(win);
        if (!rec || rec.restored) return;
        rec.restored = true;
        try {
            if (!this._active()) return;
            const opts = this._options();
            const entry = this._pickSaved(win, rec, {
                title: win.get_title() || '',
                role: win.get_role() || '',
                type: typeName(win),
                matchByTitle: opts.matchByTitle,
                minimizedMatters: opts.minimized,
                claimed: this._claimedIds(),
            });
            if (!entry) return;
            rec.entryId = entry.id; // bind first: captures caused by the moves below update this entry
            if (entry.rel && (opts.position || opts.size)) {
                const target = this._targetRect(win, entry, opts);
                if (target) {
                    win.move_resize_frame(false, target.x, target.y, target.w, target.h);
                    rec.target = rememberedParts(target, opts);
                    if (!opts.monitor) rec.lateEntry = entry;
                }
            }
            // The saved monitor, if the window is not on it by now: a rect that was applied has usually put it there
            // already, but with position and size off, or an entry with no rect (only ever seen maximized), nothing
            // else would (Meta.Window.move_to_monitor, ui/workspace.js:628).
            let mon = null;
            if (opts.monitor && entry.monitor) {
                mon = this.monitorFor(win, entry);
                if (mon && mon.index !== win.get_monitor()) win.move_to_monitor(mon.index);
                if (mon && onWayland()) rec.monitorKeep = mon.index; // X11 keeps the monitor it was sent to
            }
            if (opts.workspace && typeof entry.workspace === 'number') {
                const ws = global.workspace_manager.get_workspace_by_index(entry.workspace);
                if (ws) win.change_workspace(ws); // ui/windowMenu.js:327
            }
            if (opts.maximized && entry.maximized) {
                const later = opts.minimized && entry.minimized;
                if (later) {
                    // A window that is minimized before its first show can lose a maximize (seen on Cinnamon 6.0.5: xterm on
                    // X11 and every native Wayland window lose it; Chrome on X11 keeps it). So it is applied again when the
                    // window is un-minimized, if it was dropped, on the monitor chosen here.
                    rec.maximizeOnShow = { monitor: mon ? mon.index : null };
                }
                if (!(later && onWayland())) {
                    // On Wayland a maximize before the minimize is always lost, so it waits for the un-minimize there.
                    // Muffin may still put the window on the monitor under the pointer and maximize it there, which
                    // loses the moves above; the map checks targetMonitor.
                    // A native window has no targetMonitor: that check maximizes a window that is not on its monitor, and the
                    // later of a hidden window would do it before the window has a rect or is placed (Muffin then defers the
                    // maximize and keeps its default place as the place to return to: core/constraints.c:521-540). Its monitor
                    // is kept by monitorKeep, which only moves the window.
                    if (mon && !isNativeWayland(win)) rec.targetMonitor = mon.index;
                    if (isNativeWayland(win)) {
                        // The rect that Muffin returns to when the window is un-maximized is the window's rect at the moment of the
                        // maximize (core/window.c:2913-2927, meta_window_save_rect). A native Wayland window has no rect yet at
                        // window-created, and Muffin places it itself a moment later, so a maximize now made that default place
                        // the place to return to (seen on Cinnamon 6.0.5). The maximize waits for the map, after _correctAtMap
                        // has put the window at its saved place; target and lateEntry stay for that. X11 and XWayland windows
                        // have their rect at once and are maximized now, as before.
                        rec.maximizeAtMap = true;
                    } else {
                        win.maximize(Meta.MaximizeFlags.BOTH); // ui/windowMenu.js:213
                        rec.fixMaximize = onWayland();
                    }
                }
                if (!rec.maximizeAtMap) {
                    // A maximized frame is not the saved rect, so the map has no rect to correct.
                    rec.target = null;
                    rec.lateEntry = null;
                }
            }
            if (opts.minimized && entry.minimized && hasLater()) {
                // Not now: Muffin unminimizes a window whose flag is set when it handles the MapRequest, in the same
                // handler as window-created (x11/events.c:1427-1429). A RESIZE later should run before Muffin decides
                // what to show (core/util.c:793-834), so the window is minimized
                // before its first show: no frame, and no map.
                rec.minimizeLater = Meta.later_add(Meta.LaterType.RESIZE, () => {
                    rec.minimizeLater = null; // it is no longer pending
                    this._minimizeRestored(win, rec);
                    return GLib.SOURCE_REMOVE; // run once, as Cinnamon's own later does (ui/main.js:1420-1423)
                });
            }
            if (hasLater() && (rec.target !== null || rec.targetMonitor !== null || rec.lateEntry !== null || rec.monitorKeep !== null)) {
                // A restored place is waiting for the map to check it. A window that is hidden at its first showing decision
                // (on another workspace, or minimized) gets no map until it is shown, or never. Muffin places a new window in
                // its CALC_SHOWING pass: a new window is unplaced, so it goes through the branch at core/window.c:1942
                // (meta_window_calc_showing, which force-places a window that is to be hidden, 1842-1843); 1968 is for windows
                // that are already placed. A minimized window is marked placed without running placement
                // (core/constraints.c:490-498). BEFORE_REDRAW laters run after the CALC_SHOWING phase in the same repaint pass
                // (core/util.c:830-833; meta/util.h:202-207), so this puts a window that has not mapped or been shown by then
                // (hidden, or shown with no map during a workspace switch; the gate is rec.ready) back on its place after
                // Muffin has placed it: nothing moved inside the show, where Cinnamon's workspace-switch slide would put the
                // actor back when it ends (ui/windowManager.js:1106-1115). A window that maps is ready by then and is skipped:
                // _onMap has corrected it. From the muffin 6.0.1 source.
                rec.correctLater = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                    rec.correctLater = null; // it is no longer pending
                    if (this._tracked.get(win) !== rec || rec.paused || rec.ready) return GLib.SOURCE_REMOVE;
                    try {
                        this._correctAtMap(win, rec);
                    } catch (e) {
                        this._fail('correcting a hidden window failed', e);
                    }
                    return GLib.SOURCE_REMOVE; // run once
                });
            }
        } catch (e) {
            this._fail('restore failed', e);
        }
    }

    // What the restore's later does when it runs. The window may have been forgotten or closed since window-created, and
    // the extension or the switch turned off; then nothing is minimized.
    _minimizeRestored(win, rec) {
        try {
            if (this._tracked.get(win) !== rec || rec.paused || !this._active() || !this._options().minimized) return;
            win.minimize(); // ui/windowMenu.js:196
        } catch (e) {
            this._fail('minimizing a restored window failed', e);
        }
    }

    // Takes back the restore's correction of a hidden window if it has not run yet.
    _cancelCorrection(rec) {
        if (rec.correctLater === null) return;
        const id = rec.correctLater;
        rec.correctLater = null;
        try {
            if (typeof Meta.later_remove === 'function') Meta.later_remove(id);
        } catch (e) {
            this._fail('cancelling a pending correction failed', e);
        }
    }

    // Takes back the restore's minimize if it has not run yet.
    _cancelMinimize(rec) {
        if (rec.minimizeLater === null) return;
        const id = rec.minimizeLater;
        rec.minimizeLater = null;
        try {
            if (typeof Meta.later_remove === 'function') Meta.later_remove(id);
        } catch (e) {
            this._fail('cancelling a pending minimize failed', e);
        }
    }

    // Connects a window signal and keeps the handle for _releaseHandles. A signal that cannot be connected is logged
    // and skipped, so that it cannot stop the tracking and the restore that follow.
    _tryConnect(win, rec, signal, handler) {
        if (!this._working) return;
        try {
            rec.handles.push([win, win.connect(signal, handler)]);
        } catch (e) {
            this._fail('connecting ' + signal + ' failed', e);
        }
    }

    // Meta.Window 'shown' passes (window): a hidden window is visible again (muffin core/window.c:2730). A window that was
    // restored minimized never maps, so the user restoring it is its first show, and that gives Cinnamon 'unminimize', not
    // 'map' (ui/windowManager.js:521-526). Like the map, the first show ends the wait for the first frame, so that the
    // window's changes are captured from here on; without it the saved minimized state would never be corrected and the
    // window would come back minimized at every start. Only the show that makes the window ready does this; a window
    // that is ready already is shown again at every workspace switch, and there is nothing new to save.
    // A window that maps gets its 'map' first: meta_window_show shows it to the compositor (core/window.c:2660), which
    // sends the plugin's map event at once (compositor/meta-window-actor.c:624, 864), before this emit, so _onMap has run.
    // A window first shown during a workspace switch gets no map (meta-window-actor.c:863-864), and one restored minimized
    // never does. If a restored place was waiting for the map (target, targetMonitor or lateEntry), that place was put
    // right by the later that _restore queued (correctLater), while the window had not mapped or been shown, so this show
    // moves nothing: a move inside the show can be lost to Cinnamon's workspace-switch slide (ui/windowManager.js:1106-1115).
    // placeUnchecked is set instead: the captures keep the saved monitor and rect until the user drags or resizes the
    // window, so that what the application or Muffin changes later is not saved as the user's choice.
    _onShown(win) {
        try {
            const rec = this._tracked.get(win);
            if (!rec || rec.ready) return;
            rec.ready = true;
            // A native window restored maximized that never maps (first shown during a workspace switch) is maximized here.
            if (rec.maximizeAtMap) this._correctAtMap(win, rec, true);
            rec.placeUnchecked = (rec.target !== null || rec.targetMonitor !== null || rec.lateEntry !== null ||
                rec.monitorKeep !== null);
            this._captureWhenIdle(win);
        } catch (e) {
            this._fail('shown handler failed', e);
        }
    }

    // The rect an entry asks for on the monitor chosen for win, clamped to that monitor's work area, as {x, y, w, h}.
    // A part that is not remembered takes the window's current value. Null when there is no monitor.
    _targetRect(win, entry, opts) {
        const mon = this.monitorFor(win, entry);
        if (!mon) return null;
        const cur = win.get_frame_rect();
        const abs = Geometry.toAbsolute(entry.rel, mon);
        return Geometry.clampRect({
            x: opts.position ? abs.x : cur.x,
            y: opts.position ? abs.y : cur.y,
            w: opts.size ? abs.w : cur.width,
            h: opts.size ? abs.h : cur.height,
        }, this.workAreaOf(win, mon));
    }

    // At the first map, or, for a window that has not mapped or been shown by then (hidden, or shown with no map during a
    // workspace switch) when the later that _restore queued runs (correctLater): put the window where restore meant it to
    // be if Muffin has put it elsewhere since. Only the parts that are remembered are compared, so the others stay as
    // Muffin set them. The monitor a maximized window was sent to is not used if it is no longer in the list (it was
    // unplugged since the restore chose it): the window is then not sent to a monitor that does not exist, and not
    // maximized for it.
    // shown: true at the first map or the first show of a window that never maps, false in the later of a hidden window.
    _correctAtMap(win, rec, shown) {
        if (!this._active()) return;
        let t = rec.target;
        if (rec.lateEntry) {
            const opts = this._options();
            const late = this._targetRect(win, rec.lateEntry, opts); // by the monitor the window is on now
            t = late ? rememberedParts(late, opts) : null;
        }
        if (t) {
            const cur = frameOf(win);
            const want = {
                x: t.x === null ? cur.x : t.x, y: t.y === null ? cur.y : t.y,
                w: t.w === null ? cur.w : t.w, h: t.h === null ? cur.h : t.h,
            };
            if (!sameFrame(cur, want)) win.move_resize_frame(false, want.x, want.y, want.w, want.h);
        }
        if (rec.targetMonitor !== null && rec.targetMonitor < monitorList().length && win.get_monitor() !== rec.targetMonitor) {
            win.move_to_monitor(rec.targetMonitor);
            if (win.get_maximized() !== Meta.MaximizeFlags.BOTH) win.maximize(Meta.MaximizeFlags.BOTH);
        } else if (rec.monitorKeep !== null && rec.targetMonitor === null && rec.monitorKeep < monitorList().length &&
            win.get_monitor() !== rec.monitorKeep) {
            // Muffin's placement took the window back to another monitor after the restore sent it to its own.
            win.move_to_monitor(rec.monitorKeep);
        }
        if (rec.maximizeAtMap && shown) {
            // Native Wayland: the window is at its saved place now (and on its saved monitor), which Muffin keeps as the
            // place to return to when the window is un-maximized. The maximized size arrives as a size-changed (_fixMaximized).
            // Not in the later of a hidden window: BEFORE_REDRAW comes before the client's first commit, when the window has
            // no rect yet (0,0 0x0) and Muffin has not placed it.
            rec.maximizeAtMap = false;
            if (win.get_maximized() !== Meta.MaximizeFlags.BOTH) win.maximize(Meta.MaximizeFlags.BOTH);
            rec.fixMaximize = true;
        }
    }

    // A window that was minimized before its first show is shown for the first time when it is un-minimized. A maximize that
    // waited for this is applied now, unless the application maximized itself. On Wayland Muffin also sends no 'shown' for
    // this show, so the window becomes ready here, as at a 'shown', and its changes are captured.
    _onUnminimized(win) {
        try {
            const rec = this._tracked.get(win);
            if (!rec || win.minimized) return;
            const pending = rec.maximizeOnShow;
            rec.maximizeOnShow = null;
            if (pending && !rec.paused && this._active() && this._options().maximized) {
                if (pending.monitor !== null && pending.monitor < monitorList().length && win.get_monitor() !== pending.monitor) {
                    win.move_to_monitor(pending.monitor);
                }
                if (win.get_maximized() !== Meta.MaximizeFlags.BOTH) {
                    win.maximize(Meta.MaximizeFlags.BOTH);
                    rec.fixMaximize = onWayland();
                }
            }
            if (onWayland() && !rec.ready) this._onShown(win);
        } catch (e) {
            this._fail('un-minimize handler failed', e);
        }
    }

    // Wayland: the maximized size of a window maximized by the restore arrives as a size-changed, with the frame still at the
    // position the window had (seen on Cinnamon 6.0.5: 1920x1080 at the saved place, hanging over the monitor's edge). Once, when
    // that size is there, the frame goes to the origin of the work area of its monitor, where a maximized window belongs.
    _fixMaximized(win) {
        try {
            const rec = this._tracked.get(win);
            if (!rec || !rec.fixMaximize || win.get_maximized() !== Meta.MaximizeFlags.BOTH) return;
            rec.fixMaximize = false;
            // The monitor chosen at the restore, if there was one: the oversized frame can overlap two monitors.
            const index = rec.monitorKeep !== null ? rec.monitorKeep : win.get_monitor();
            const mon = monitorList()[index];
            if (!mon) return;
            const wa = this.workAreaOf(win, mon);
            const f = frameOf(win);
            if (f.x !== wa.x || f.y !== wa.y) win.move_frame(false, wa.x, wa.y);
        } catch (e) {
            this._fail('placing a maximized window failed', e);
        }
    }

    // Forget: nothing chosen at window-created may be applied at the map any more, nor a minimize or a correction still
    // waiting.
    _dropPlan(rec) {
        rec.target = null;
        rec.targetMonitor = null;
        rec.lateEntry = null;
        rec.monitorKeep = null;
        rec.fixMaximize = false;
        rec.maximizeAtMap = false;
        rec.maximizeOnShow = null;
        this._cancelMinimize(rec);
        this._cancelCorrection(rec);
    }

    _captureWhenIdle(win) {
        try {
            const rec = this._tracked.get(win);
            if (rec) rec.idle.call();
        } catch (e) {
            this._fail('scheduling a capture failed', e);
        }
    }

    _captureNow(win) {
        try {
            const rec = this._tracked.get(win);
            if (rec) rec.idle.cancel();
        } catch (e) {
            this._fail('cancelling a pending capture failed', e);
        }
        this._capture(win);
    }

    // deliberate: the capture follows a drag or resize the user just finished (grab-op-end).
    _capture(win, deliberate) {
        try {
            const rec = this._tracked.get(win);
            if (!rec || !rec.ready || rec.paused || !this._active()) return;
            const opts = this._options();
            const info = windowInfo(win);
            if (!Identity.isEligible(info, opts)) return;
            if (rec.entryId === null) rec.entryId = Store.newEntryId(Date.now(), Math.random);
            const id = rec.entryId;
            const prev = this._state.windows.find(e => e.id === id) || null;
            const ws = win.get_workspace(); // null for a window that has no workspace yet
            const maximized = win.get_maximized() === Meta.MaximizeFlags.BOTH;
            // Every field is always set, with null where unknown: the loader drops entries with undefined fields.
            const entry = {
                id: id,
                key: rec.key,
                appId: appIdOf(win),
                client: clientOf(win),
                wmClass: info.wmClass,
                instance: info.instance,
                role: info.role,
                type: info.type,
                title: info.title,
                lastSeen: nowSeconds(),
                workspace: (win.is_on_all_workspaces() || !ws) ? null : ws.index(),
                maximized: maximized,
                // At 'unmanaging' the flag keeps its last value: meta_window_unmanage writes none before it emits (muffin
                // 6.0.1 source, core/window.c:1513-1524).
                minimized: !!win.minimized,
                monitor: (prev && prev.monitor) || null,
                rel: (prev && prev.rel) || null,
            };
            // A saved monitor that is absent from the layout (unplugged) keeps its monitor and rel: Muffin moves
            // the windows off it, and saving where they landed would lose the saved place for good. So does a window
            // that became ready at a show with no map (placeUnchecked): it was put on its saved place before that show,
            // and what the application or Muffin changes after that is not the user's choice. Only a deliberate drag or
            // resize overrides this, because then the user chose the new place.
            const monitors = monitorList();
            const saved = prev ? prev.monitor : null;
            const savedGone = !deliberate && !!saved && !Geometry.isConnected(monitors, saved);
            const keepPlace = savedGone || (rec.placeUnchecked && !deliberate && prev !== null);
            const mon = monitors[win.get_monitor()];
            if (!keepPlace && !win.is_fullscreen() && mon) {
                entry.monitor = { index: mon.index, x: mon.x, y: mon.y, w: mon.w, h: mon.h };
                // A maximized window fills the monitor, so its frame says nothing about the normal geometry:
                // it teaches the monitor only, and the previous rel stays for un-maximizing later.
                if (!maximized) {
                    const f = win.get_frame_rect();
                    entry.rel = Geometry.toRelative({ x: f.x, y: f.y, w: f.width, h: f.height }, mon);
                }
            }
            this._state = Store.pruneState(Store.upsertEntry(this._state, entry), opts.maxEntries);
            this._saver.call();
        } catch (e) {
            this._fail('capture failed', e);
        }
    }

    _untrack(win) {
        try {
            const rec = this._tracked.get(win);
            this._tracked.delete(win);
            if (rec) this._releaseHandles(rec);
            if (this._saver) this._saver.flush();
        } catch (e) {
            this._fail('untrack failed', e);
        }
    }

    _releaseHandles(rec) {
        rec.handles.forEach(h => {
            try {
                h[0].disconnect(h[1]);
            } catch (e) {
                // The window is already gone; nothing left to disconnect.
            }
        });
        rec.handles = [];
        try {
            rec.idle.cancel();
        } catch (e) {
            this._fail('cancelling a pending capture failed', e);
        }
        this._cancelMinimize(rec);
        this._cancelCorrection(rec);
    }

    monitorFor(win, entry) {
        const monitors = monitorList();
        if (!this._settings.getValue('remember-monitor')) {
            return monitors[win.get_monitor()] || Geometry.chooseMonitor(monitors, null);
        }
        return Geometry.chooseMonitor(monitors, entry.monitor);
    }

    // Work area fields: ui/applet.js:1143-1147, ui/cinnamonDBus.js:467-470. A window with no workspace
    // yet (sticky or not placed) uses the active workspace (ui/cinnamonDBus.js:468).
    workAreaOf(win, mon) {
        try {
            const ws = win.get_workspace() || global.workspace_manager.get_active_workspace();
            const r = ws.get_work_area_for_monitor(mon.index);
            if (r && r.width > 0 && r.height > 0) return { x: r.x, y: r.y, w: r.width, h: r.height };
        } catch (e) {
            global.logWarning(LOG + 'no work area, using the monitor rect: ' + e);
        }
        return { x: mon.x, y: mon.y, w: mon.w, h: mon.h };
    }

    // global.display.focus_window: ui/layout.js:224
    // Each press ends with a notification that says what was forgotten, shown after the change. A forget that fails is
    // logged, and the notification says that it failed.
    _forgetFocused() {
        let win = null;
        let outcome;
        try {
            win = global.display.focus_window;
            outcome = this._forgetWindow(win);
        } catch (e) {
            this._fail('forget focused failed', e);
            outcome = FORGET_FAILED;
        }
        this._notifyForget(win, outcome);
    }

    // Forgets the saved entry of win, and pauses it. Returns what it found: FORGET_UNTRACKED, FORGET_NOT_SAVED or
    // FORGET_REMOVED.
    _forgetWindow(win) {
        const rec = win ? this._tracked.get(win) : null;
        if (!rec) return FORGET_UNTRACKED;
        // Pause even without a bound entry: the capture on close would otherwise create one.
        rec.paused = true;
        this._dropPlan(rec);
        if (rec.entryId === null) return FORGET_NOT_SAVED;
        this._state = Store.removeEntry(this._state, rec.entryId);
        rec.entryId = null;
        this._saver.call();
        return FORGET_REMOVED;
    }

    // Main.notify(title, body) shows a transient notification (ui/main.js:751-757); the body is shown as plain text, not
    // markup (ui/messageTray.js:63-81, 167-171). The title is the name of the extension. A notification that fails is
    // logged, and the forget stands.
    _notifyForget(win, outcome) {
        try {
            const named = outcome === FORGET_REMOVED || outcome === FORGET_NOT_SAVED;
            Main.notify(_('Window Memory'), forgetMessage(outcome, named ? appName(win) : null));
        } catch (e) {
            this._fail('the notification of a forget failed', e);
        }
    }

    _forgetAll() {
        try {
            this._state = Store.emptyState();
            this._tracked.forEach(rec => {
                rec.entryId = null;
                rec.paused = true; // otherwise the next capture, or the one on close, would save the window again
                this._dropPlan(rec);
            });
            this._saver.call();
            // Written at once as well: the settings page counts the remembered windows in the file before each click
            // (forget_button.py), so a click right after this one must find none. _flush keeps to _saveBlocked, and the
            // debounced save above tries the write again if this one fails.
            this._flush();
        } catch (e) {
            this._fail('forget all failed', e);
        }
    }

    // "Import backup…" in the settings (backup_buttons.py) writes the window list of a backup to STAGING_PATH and calls
    // this. Cinnamon calls it with no try (ui/cinnamonDBus.js:359-363), and cjs logs an error thrown here and returns it
    // as the D-Bus error of the page's call (cjs 6.0.0, core/overrides/Gio.js:327-341); the page then leaves the settings
    // as they are. So every failure throws before any change and keeps the state as it was, and a normal return means
    // the windows were replaced. Each message starts with LOG, like the other lines this extension logs. The staging
    // file is removed whatever happens. When saving is off for this session (_saveBlocked), the restore is refused
    // before any change: the restored windows could not be saved, and would be gone when Cinnamon restarts.
    // The entries are kept as the file has them: nothing is pruned or left out by the current max-entries or
    // excluded-apps. The page sets the backup's settings after this returns; the one it may set before, a larger
    // max-entries, never prunes more.
    _importState() {
        try {
            if (!this._settings) throw new Error(LOG + 'import rejected: Window Memory is not running');
            if (this._saveBlocked) throw new Error(LOG + 'the state file cannot be saved, so the restore was refused');
            let text;
            try {
                text = fileIO.read(STAGING_PATH);
            } catch (e) {
                throw new Error(LOG + 'import rejected: ' + STAGING_PATH + ' cannot be read: ' + (e.message || e));
            }
            if (text === null) throw new Error(LOG + 'import rejected: ' + STAGING_PATH + ' does not exist');
            const parsed = Store.parseState(text);
            if (parsed.recovered) throw new Error(LOG + "import rejected: the backup's window list is not readable");
            const opts = this._options();
            // The imported state is written first: when it cannot be saved the import fails here, before any change, and
            // not later as a log line with the page reporting success.
            try {
                Store.saveState(fileIO, STATE_PATH, parsed.state);
            } catch (e) {
                throw new Error(LOG + 'import rejected: the state file cannot be written: ' + (e.message || e));
            }
            // As at enable(), the imported state is the only state: no capture, save or plan made for the state it
            // replaces is applied, and each open window is bound to an imported entry without being moved.
            this._saver.cancel();
            this._tracked.forEach(rec => {
                rec.idle.cancel();
                this._dropPlan(rec);
                rec.entryId = null;
                rec.paused = false;
                rec.placeUnchecked = false; // the saved place it kept is one of the state being replaced
            });
            this._state = parsed.state;
            this._lastWritten = Store.serializeState(parsed.state); // what the file holds now
            this._tracked.forEach((rec, win) => {
                try {
                    this._claimSavedEntry(rec, windowInfo(win), opts, win);
                } catch (e) {
                    this._fail('binding an open window to an imported entry failed', e);
                }
            });
        } finally {
            try {
                fileIO.remove(STAGING_PATH);
            } catch (e) {
                this._fail('removing ' + STAGING_PATH + ' failed', e, false);
            }
        }
    }

    // "Pick a window". A transparent actor over the whole stage takes all input through a modal grab, as Cinnamon's
    // own colour picker does (ui/screenshot.js:437-475, 532-549): Main.pushModal (ui/main.js:1212) and Main.popModal
    // (ui/main.js:1265). The stage's 'captured-event' (ui/screenshot.js:392, 507) then sees the next key or click.
    // A click of the primary button adds the WM_CLASS of the window under it to excluded-apps: the press chooses the
    // window, the release ends the pick. Escape, a right-click, a click on no window, an error and PICK_TIMEOUT_MS
    // cancel the pick with no change. No pick ends without _endPick, which gives the input back.
    // While it runs, an overlay inside the same actor shows a hint and highlights the window under the pointer
    // (_buildPickOverlay, _pickHover); it goes when the actor is destroyed. Drawing it is never needed for the pick: if
    // it fails, that is logged and the pick goes on without it.
    // mode 'exclude' (pickWindow) adds the class to excluded-apps. Mode 'startup' (pickStartupWindow) writes what the
    // window is to the hidden key startup-pick, for the tab "Startup apps" of the settings window. Nothing else
    // differs: the same grab, the same single timeout, the same handler.
    _startPick(mode) {
        let actor = null;
        try {
            if (this._pick || !this._settings) return;
            actor = new St.Widget({ reactive: true, x: 0, y: 0, layout_manager: new Clutter.FixedLayout() });
            actor.add_constraint(new Clutter.BindConstraint({ source: global.stage, coordinate: Clutter.BindCoordinate.ALL }));
            Main.uiGroup.add_actor(actor);
            Main.uiGroup.set_child_above_sibling(actor, null);
            if (!Main.pushModal(actor)) {
                global.logWarning(LOG + 'could not take the input to pick a window');
                actor.destroy();
                return;
            }
            // target: set by the press of the primary button, {wmClass, win} with nulls for no pickable window; null before.
            // overlay: {highlight, name} of the overlay, null without one. candidates: the windows the highlight looks at,
            // listed once here (the press lists them afresh). hovered: the candidate highlighted now, null for none.
            this._pick = {
                actor: actor, eventId: null, timeoutId: null, target: null, mode: mode,
                overlay: null, candidates: [], hovered: null,
            };
            this._pick.eventId = global.stage.connect('captured-event', (stage, event) => this._onPickEvent(event));
            global.set_cursor(Cinnamon.Cursor.CROSSHAIR); // ui/screenshot.js:472
            this._pick.timeoutId = sched.setTimeout(() => this._onPickTimeout(), PICK_TIMEOUT_MS);
            this._startPickOverlay(actor, mode);
        } catch (e) {
            this._fail('starting the pick failed', e);
            if (this._pick) {
                this._endPick();
            } else if (actor) {
                try {
                    actor.destroy();
                } catch (e2) {
                    this._fail('removing the pick actor failed', e2);
                }
            }
        }
    }

    // Draws the overlay of the pick that has just started and highlights the window under the pointer. Never throws: a
    // failure is logged and the pick goes on without the overlay (or without the highlight). Pieces built before a
    // failure are removed at once (the pick actor has no other children; ui/workspace.js:92 empties an actor the same way).
    _startPickOverlay(actor, mode) {
        const pick = this._pick;
        try {
            pick.overlay = this._buildPickOverlay(actor, mode);
        } catch (e) {
            this._fail('drawing the pick overlay failed', e);
            try {
                actor.destroy_all_children();
            } catch (e2) {
                this._fail('removing a half-drawn pick overlay failed', e2);
            }
            return;
        }
        try {
            pick.candidates = this._pickCandidates();
            this._pickHover(() => global.get_pointer()); // [x, y, mods] (ui/messageTray.js:1041)
        } catch (e) {
            pick.candidates = [];
            this._fail('finding the window under the pointer for the pick overlay failed', e);
        }
    }

    // The hint, centred PICK_HINT_TOP px below the top of the primary monitor (Main.layoutManager.primaryMonitor,
    // ui/layout.js:204), and the hidden highlight with its name label. All are children of the full-stage pick actor,
    // whose FixedLayout places them in stage coordinates. The actor is on the stage already, so the hint's natural width
    // (get_preferred_width(-1) gives [minimum, natural], ui/panel.js:3305) is known.
    _buildPickOverlay(actor, mode) {
        const highlight = new St.Widget({ visible: false, style: PICK_HIGHLIGHT_STYLE });
        const name = new St.Label({ x: PICK_NAME_INSET, y: PICK_NAME_INSET, style: PICK_NAME_STYLE });
        highlight.add_child(name);
        actor.add_child(highlight);
        const text = mode === 'startup'
            ? _('Click a window to start its application at login.  Esc or right-click to cancel.')
            : _('Click a window to never remember its application.  Esc or right-click to cancel.');
        const hint = new St.Label({ text: text, style: PICK_HINT_STYLE });
        actor.add_child(hint);
        const monitor = Main.layoutManager.primaryMonitor;
        const [, width] = hint.get_preferred_width(-1);
        // A hint wider than the monitor starts at its left edge rather than to the left of it.
        hint.set_position(Math.max(monitor.x, monitor.x + Math.floor((monitor.width - width) / 2)), monitor.y + PICK_HINT_TOP);
        return { highlight: highlight, name: name };
    }

    // Puts the highlight over the window the pick would take at the point where() gives ([x, y, ...]), by the rule of the
    // click (Pick.topWindowAt) on the windows listed when the pick started, and names it by its WM_CLASS; hides it over
    // anything else. Only redraws when that window changes. A failure (reading the point included) is logged once and
    // the overlay is dropped; the pick goes on.
    _pickHover(where) {
        const pick = this._pick;
        if (!pick || !pick.overlay) return;
        try {
            const [x, y] = where();
            const hit = Pick.topWindowAt(pick.candidates, x, y);
            if (hit === pick.hovered) return;
            pick.hovered = hit;
            const o = pick.overlay;
            if (hit === null) {
                o.highlight.hide();
                return;
            }
            o.highlight.set_position(hit.rect.x, hit.rect.y);
            o.highlight.set_size(hit.rect.w, hit.rect.h);
            o.name.set_text(hit.wmClass);
            o.highlight.show();
        } catch (e) {
            this._fail('moving the pick highlight failed', e);
            const o = pick.overlay;
            pick.overlay = null;
            try {
                o.highlight.hide();
            } catch (e2) {
                // the pick goes on; the actor and the highlight go when the pick ends
            }
        }
    }

    // Gives back everything the pick took, whatever has failed before: each step runs on its own.
    _endPick() {
        const pick = this._pick;
        if (!pick) return;
        this._pick = null; // first, so that nothing below can end the pick a second time
        const step = (what, fn) => {
            try {
                fn();
            } catch (e) {
                this._fail('ending the pick, ' + what + ' failed', e);
            }
        };
        if (pick.eventId !== null) step('disconnecting the stage handler', () => global.stage.disconnect(pick.eventId));
        if (pick.timeoutId !== null) step('clearing the timeout', () => sched.clearTimeout(pick.timeoutId));
        step('releasing the input grab', () => {
            try {
                Main.popModal(pick.actor);
            } catch (e) {
                // popModal can fail before it has ended the grab. With no modal left, end it here the way popModal does
                // (ui/main.js:1308-1311); Main.modalCount is read as in ui/screenshot.js:393.
                if (Main.modalCount === 0) {
                    step('ending the modal state', () => global.end_modal(global.get_current_time()));
                    step('resetting the stage input mode', () => global.set_stage_input_mode(Cinnamon.StageInputMode.NORMAL));
                }
                throw e; // logged by the step
            }
        });
        step('restoring the cursor', () => global.unset_cursor()); // ui/screenshot.js:541
        // Destroyed in an idle, not inside the event that ended the pick (ui/screenshot.js:544-547).
        step('removing the pick actor', () => GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            try {
                pick.actor.destroy();
            } catch (e) {
                this._fail('removing the pick actor failed', e);
            }
            return GLib.SOURCE_REMOVE;
        }));
    }

    // The stage's 'captured-event' passes (stage, event). Main's own handler is connected earlier, so it runs first and
    // may still trigger a keybinding (ui/main.js:445, 1119-1138); returning Clutter.EVENT_STOP keeps the keys and
    // clicks from the windows. Only the primary button picks (ui/applet.js:1058): its press chooses the window, its
    // release ends the pick. The release of the secondary button cancels the pick (its press is swallowed, so the
    // release does not reach a window either). The middle button is swallowed and changes nothing. A mouse move only
    // moves the highlight and is swallowed too: under the modal grab nothing else needs it.
    _onPickEvent(event) {
        if (!this._pick) return Clutter.EVENT_PROPAGATE;
        try {
            const type = event.type();
            if (type === Clutter.EventType.KEY_PRESS) {
                if (event.get_key_symbol() === Clutter.KEY_Escape) this._endPick(); // ui/screenshot.js:487-490
                return Clutter.EVENT_STOP;
            }
            if (type === Clutter.EventType.BUTTON_PRESS) {
                if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                    const [x, y] = event.get_coords(); // ui/screenshot.js:501
                    const hit = Pick.topWindowAt(this._pickCandidates(), x, y);
                    this._pick.target = { wmClass: hit ? hit.wmClass : null, win: hit ? hit.win : null };
                }
                return Clutter.EVENT_STOP;
            }
            if (type === Clutter.EventType.MOTION) {
                this._pickHover(() => event.get_coords());
                return Clutter.EVENT_STOP;
            }
            if (type === Clutter.EventType.BUTTON_RELEASE) {
                const target = this._pick.target;
                const button = event.get_button();
                if (button === Clutter.BUTTON_SECONDARY) {
                    this._endPick();
                    return Clutter.EVENT_STOP;
                }
                if (button !== Clutter.BUTTON_PRIMARY || target === null) return Clutter.EVENT_STOP;
                try {
                    if (target.wmClass !== null) this._finishPick(this._pick.mode, target);
                } finally {
                    this._endPick();
                }
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        } catch (e) {
            this._fail('pick handler failed', e);
            this._endPick();
            return Clutter.EVENT_STOP;
        }
    }

    _onPickTimeout() {
        try {
            if (this._pick) this._pick.timeoutId = null; // it has run: GLib must not be asked to remove it
        } catch (e) {
            this._fail('pick timeout failed', e);
        } finally {
            this._endPick();
        }
    }

    // What the release of a pick does with the window it chose, by the mode the pick was started in.
    _finishPick(mode, target) {
        if (mode === 'startup') {
            this._writeStartupPick(target.win);
        } else {
            this._excludeClass(target.wmClass);
        }
    }

    // Writes what the window is to the key startup-pick as the JSON text of StartupPick.encodeResult. The value holds the
    // stamp of the pick, so two picks of the same application are two changes of the key, which the settings tab
    // (another process) watches. setValue stores and saves the value (ui/settings.js:509-515). It never throws for a
    // window it cannot read: it gives the form with an empty command (StartupPick.classify).
    _writeStartupPick(win) {
        const result = StartupPick.classify(startupInfo(win));
        this._settings.setValue('startup-pick', StartupPick.encodeResult(result, Date.now()));
    }

    // Makes excluded-apps exclude the class (Pick.excludeRows): nothing when a checked row covers it already, else the
    // unchecked row of that very class is checked again, else a checked row is appended. The other rows stay exactly as
    // they are. setValue stores and saves the value (ui/settings.js:509-515); it sends no 'changed::' signal for this
    // change, and none is needed: every capture reads excluded-apps again, so the application's open windows stop being
    // saved at once.
    _excludeClass(wmClass) {
        const result = Pick.excludeRows(this._settings.getValue('excluded-apps') || [], wmClass);
        if (result.changed) this._settings.setValue('excluded-apps', result.rows);
    }

    // The windows a click can reach now: showing on their workspace (not minimized), and on the active workspace or on
    // all of them. Windows that are hidden are left out, so they do not take a click. The actors come in stacking
    // order, bottom to top (the last is the topmost: ui/xdndHandler.js:60-63, ui/workspacesView.js:345-351), so an
    // actor's index is its stack position.
    _pickCandidates() {
        const active = global.workspace_manager.get_active_workspace().index();
        const out = [];
        global.get_window_actors().forEach((actor, i) => {
            const win = actor.meta_window;
            if (!win || !win.showing_on_its_workspace()) return; // ui/windowManager.js:1141, ui/workspace.js:735
            const ws = win.get_workspace();
            if (!win.is_on_all_workspaces() && !(ws && ws.index() === active)) return;
            const info = windowInfo(win);
            // win: the Meta window, for the startup pick (lib/pick.js ignores it).
            out.push({ rect: frameOf(win), wmClass: info.wmClass, type: info.type, role: info.role, stack: i, win: win });
        });
        return out;
    }

    // Writes only when the serialized state differs from the last text written. The first flush after enable
    // always writes (nothing is known about the file yet), and a failed write is tried again at the next flush.
    _flush() {
        if (this._saveBlocked) return;
        try {
            const text = Store.serializeState(this._state);
            if (text === this._lastWritten) return;
            Store.saveState(fileIO, STATE_PATH, this._state);
            this._lastWritten = text;
        } catch (e) {
            this._fail('saving the state file failed', e, false);
        }
    }
}

let instance = null;

function init(meta) {
    instance = new WindowMemory(meta);
}

function enable() {
    instance.enable();
    return instance.callbacks();
}

function disable() {
    if (instance) instance.disable();
    instance = null;
}
