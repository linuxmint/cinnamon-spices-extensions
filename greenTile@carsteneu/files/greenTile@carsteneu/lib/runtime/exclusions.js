/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App exclusions runtime: the "never tile on" state — per-window toggles
 * (stable sequence -> excluded), exclusion rows and column classes derived
 * from the exclusions setting including the StartupWMClass resolution per app
 * row — plus the AppSystem 'installed-changed' handler that re-resolves both
 * after app installs, the excludeAppPicker options population and the hotkey
 * toggle for the focused window. Owned by the App (monitors-changed destroys
 * the App): destroy disconnects the handler and resets the derived rules —
 * the Super+G toggles and their close watches ride the session instead (their
 * lifetime outlives an App recreation until toggled again, window close or
 * disable), so destroy leaves them alone. Exactly one
 * signal, so the handler rides an explicit id (not a scope) and disconnects
 * in its own Config.destroy slot, fault tolerant.
 * All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

const {
    exclRowsNormalize, exclRowsAppend, exclMatch, exclAppOptions, exclToggleSet,
} = XLET.lib.model.exclude;

/**
 * Exclusions runtime owner: per-window toggles, exclusion rows and column
 * classes, the installed-changed re-resolution and the picker plumbing.
 * @typedef {Object} ExclusionsDeps
 * @property {AnyRecord} appSystem imports.gi.Cinnamon.AppSystem namespace
 * @property {AnyRecord} windowTracker imports.gi.Cinnamon.WindowTracker namespace
 * @property {AnyRecord} gio imports.gi.Gio, OSD icon
 * @property {AnyRecord} main imports.ui.main, osdWindowManager
 * @property {AnyRecord} global the global object
 * @property {() => CinnamonWindow | null} focusWindow focusWindow
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void} retileMonitor retileMonitor
 * @property {(app: AppFacade) => void} retile exclRetile
 * @property {TranslateFn} translate _ gettext
 * @property {Map<number, boolean>} toggles session-owned Super+G toggles, seq -> true
 * @property {Map<number, { disconnect: () => void }>} watches session-owned per-window close watches
 */
var Exclusions = class {
    /**
     * @param {ExclusionsDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._appSystem = deps.appSystem;
        this._windowTracker = deps.windowTracker;
        this._main = deps.main;
        this._global = deps.global;
        // Session-owned state (survives App recreations): the Super+G toggles
        // and the per-window close watches that end an exclusion with its window.
        this.toggled = deps.toggles;
        this._watches = deps.watches;
        // Null-prototype object: rule texts must not collide with Object.prototype
        // keys (see exclAppOptions).
        /** @type {ExclRow[]} */ this.rows = [];
        this.classes = Object.create(null);
        this._appSystemHandlerId = 0;
        /** @type {any} */ this._settings = null;
    }

    /**
     * @param {CinnamonWindow | null} w
     * @returns {boolean}
     */
    isExcluded(w) {
        if (w == null) {
            return false;
        }
        if (this.toggled.get(w.get_stable_sequence())) {
            return true;
        }
        if (this.rows.length === 0) {
            return false;
        }
        const app = this._windowTracker.get_default().get_window_app(w);
        return exclMatch(w.get_wm_class(), w.get_wm_class_instance(), w.get_title(), this.rows, app ? app.get_id() : null, this.classes);
    }

    /**
     * StartupWMClass per app row, resolved once per apply (not per window per retile);
     * the value is null when AppSystem cannot resolve the rule text or the app declares
     * no StartupWMClass — those rows fall back to the id compare. Rebuilt with the rows
     * themselves on installed-changed.
     * @param {ExclRow[]} rows
     * @returns {Record<string, string | null>}
     */
    _appClasses(rows) {
        const appSystem = this._appSystem.get_default();
        const result = Object.create(null);
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].match !== 'app' || result[rows[i].text] !== undefined) {
                continue;
            }
            const app = appSystem.lookup_app(rows[i].text);
            const info = app ? app.get_app_info() : null;
            result[rows[i].text] = info ? info.get_startup_wm_class() : null;
        }
        return result;
    }

    /**
     * @param {SettingsFacade} settings
     */
    apply(settings) {
        this.rows = exclRowsNormalize(settings.getValue(SETTINGS_KEYS.exclusions));
        this.classes = this._appClasses(this.rows);
    }

    /**
     * The app picker combobox (SETTINGS_KEYS.excludeAppPicker): the dialog collects its options from
     * the settings file when it opens, so the extension writes them via the official
     * setOptions API at enable time and on AppSystem's installed-changed.
     * @param {SettingsFacade} settings
     */
    populate(settings) {
        const apps = this._appSystem.get_default().get_all();
        const list = [];
        for (let i = 0; i < apps.length; i++) {
            const info = apps[i].get_app_info();
            if (!info || !info.should_show()) {
                continue;
            }
            list.push({ id: apps[i].get_id(), name: apps[i].get_name() });
        }
        settings.setOptions(SETTINGS_KEYS.excludeAppPicker, exclAppOptions(list, this._deps.translate("Add application …")));
    }

    /**
     * Apply + populate up front, then the installed-changed handler that keeps
     * both fresh while this App lives.
     * @param {SettingsFacade} settings
     */
    start(settings) {
        this._settings = settings;
        this.apply(settings);
        this.populate(settings);
        this._appSystemHandlerId = this._appSystem.get_default().connect('installed-changed', () => {
            this.apply(this._settings);
            this.populate(this._settings);
        });
    }

    destroy() {
        if (this._appSystemHandlerId) {
            const id = this._appSystemHandlerId;
            this._appSystemHandlerId = 0;
            try {
                this._appSystem.get_default().disconnect(id);
            }
            catch (_e) {
                // handler was already gone
            }
        }
        // The toggles and their close watches are NOT released here: they ride
        // the session across App recreations (FEATURES.md lifetime) — only the
        // session destroy ends them.
        this.rows = [];
        this.classes = Object.create(null);
    }

    /**
     * @param {number} seq
     */
    removeToggle(seq) {
        this.toggled.delete(seq);
        this._clearWatch(seq);
    }

    /**
     * Keeps the close watch for one excluded window: when the window goes
     * away, its entry leaves the session state — closed windows never leak an
     * exclusion for later windows, beyond the auto-tracked set and on paused
     * workspaces alike. The handler closes over the session-owned maps only,
     * so it stays valid after the App that created it was destroyed.
     * @param {CinnamonWindow} w
     * @param {number} seq
     */
    _addCloseWatch(w, seq) {
        this._clearWatch(seq);
        const toggles = this.toggled;
        const watches = this._watches;
        const id = w.connect('unmanaged', () => {
            toggles.delete(seq);
            const watch = watches.get(seq);
            if (watch) {
                watches.delete(seq);
                try {
                    watch.disconnect();
                }
                catch (_e) {
                    // the emitting handler itself
                }
            }
        });
        watches.set(seq, { disconnect: () => w.disconnect(id) });
    }

    /**
     * @param {number} seq
     */
    _clearWatch(seq) {
        const watch = this._watches.get(seq);
        if (watch) {
            this._watches.delete(seq);
            try {
                watch.disconnect();
            }
            catch (_e) {
                // the window was already gone
            }
        }
    }

    /**
     * Picking an app appends the exclusion row and resets the combobox; setValue
     * alone would not fire the exclusions binding, so apply + retile run explicitly.
     * @param {SettingsFacade} settings
     * @param {AppFacade} app
     * @param {string} value
     */
    picked(settings, app, value) {
        if (typeof value !== 'string' || value === 'picker') {
            return;
        }
        settings.setValue(SETTINGS_KEYS.exclusions, exclRowsAppend(settings.getValue(SETTINGS_KEYS.exclusions), value));
        this.apply(settings);
        this._deps.retile(app);
        settings.setValue(SETTINGS_KEYS.excludeAppPicker, 'picker');
    }

    /**
     * Toggle exclusion for the focused window and retile its monitor, with an
     * OSD as feedback.
     * @param {AppFacade} app
     */
    toggleFocused(app) {
        // The user's own focus, never the retile-oriented focusWindow(): that one
        // deliberately guesses the first tileable window when a dialog or panel holds
        // focus (possibly on another monitor), which is not the window the user is
        // pointing at. With no focused window there is nothing to toggle — the
        // exclusion is keyed by the window's sequence, so the raw focus needs none of
        // focusWindow's minimized/workspace guards.
        const display = this._global.display;
        const w = display ? display.focus_window : null;
        if (!w) {
            return;
        }
        const excluded = !this.isExcluded(w);
        const seq = w.get_stable_sequence();
        exclToggleSet(this.toggled, seq, excluded);
        // the exclusion ends with the window: watch it while it is set
        if (excluded) {
            this._addCloseWatch(w, seq);
        }
        else {
            this.removeToggle(seq);
        }
        this._global.log('greenTile ' + (excluded ? 'never tile on: ' : 'tiling again: ') + String(w.get_wm_class()).replace(/\s+/g, ' ') + ' seq=' + w.get_stable_sequence());
        try {
            this._main.osdWindowManager.show(w.get_monitor(), this._deps.gio.ThemedIcon.new('window-restore-symbolic'),
                excluded ? this._deps.translate("Window floats") : this._deps.translate("Window tiles again"), null);
        }
        catch (_e) {
            // OSD is feedback only — a failing show must not block the retile
        }
        this._deps.retileMonitor(app, w.get_monitor(), null);
    }
};
