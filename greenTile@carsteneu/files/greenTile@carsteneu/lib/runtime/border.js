/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App focus border: a thin border around the newly focused tiled window in
 * the state color, shown for three seconds after a Super+Arrow focus move —
 * pure keyboard feedback, never shown for mouse or Alt+Tab focus changes. Only
 * on monitor+workspaces with automatic tiling on, only for windows the tiling
 * manages; hidden while the window is minimized, maximized or fullscreen, the
 * moment focus moves elsewhere, and when the border setting is off. One
 * non-reactive actor in the overlay group follows the flashed window's
 * geometry; the color updates live with the theme settings (the theme
 * component stores the resolved state rgb and calls restyle()). Owned by the
 * App. The per-flash-window handlers and the 3 s timer are replaced mid-life,
 * so they keep explicit id lists / a timer id instead of a runtime scope
 * (no selective mid-life disconnect). All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { stateDefault } = XLET.lib.model.state;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

const BORDER_WIDTH = 3;
const BORDER_TIMEOUT_MS = 3000;

/**
 * Focus border: a thin border around the newly focused tiled window in the
 * state color, pure keyboard feedback after a Super+Arrow focus move.
 */
/**
 * @typedef {Object} BorderDeps
 * @property {AnyRecord} st imports.gi.St
 * @property {AnyRecord} glib imports.gi.GLib
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the global object
 * @property {() => Rgb | null} stateRgb () => the theme component's resolved state color
 * @property {(w: CinnamonWindow) => boolean} exclCheck (w) => app.excl.isExcluded(w)
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { preset: Preset | null, auto: boolean }} layoutFor layoutFor
 * @property {(monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number) => CinnamonWindow[]} collectWindows (monitor, focus, ws) => collectWindows(app, monitor, focus, ws)
 */
var Border = class {
    /**
     * @param {BorderDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._st = deps.st;
        this._glib = deps.glib;
        this._meta = deps.meta;
        this._main = deps.main;
        this._global = deps.global;
        this._app = null;
        this._actor = null;
        this._flashWin = null;
        /** @type {Array<{ win: CinnamonWindow, id: number }>} */ this._winSig = [];
        /** @type {Array<{ obj: AnyRecord, id: number }>} */ this._sig = [];
        this._timer = 0;
    }

    _style() {
        const c = this._deps.stateRgb() || stateDefault;
        return 'border: ' + BORDER_WIDTH + 'px solid rgb(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + '); background-color: transparent;';
    }

    /**
     * the border is keyboard feedback, not a decoration: only the Super+Arrow focus move
     * shows it (flash), it switches itself off after a few seconds and any event that
     * makes the flashed window focusless or unmanaged hides it again
     */
    _armTimer() {
        if (this._timer) {
            this._glib.Source.remove(this._timer);
        }
        this._timer = this._glib.timeout_add(this._glib.PRIORITY_DEFAULT, BORDER_TIMEOUT_MS, () => {
            this._timer = 0;
            this._flashWin = null;
            if (this._actor) {
                this._actor.hide();
            }
            return this._glib.SOURCE_REMOVE;
        });
    }

    _unbindFlash() {
        for (const w of this._winSig) {
            try {
                w.win.disconnect(w.id);
            }
            catch (_e) { /* signal already gone */ }
        }
        this._winSig = [];
    }

    _rebindFlash() {
        this._unbindFlash();
        const win = this._flashWin;
        if (win) {
            this._winSig.push({ win, id: win.connect('position-changed', () => this.update()) });
            this._winSig.push({ win, id: win.connect('size-changed', () => this.update()) });
        }
    }

    /**
     * @param {AppFacade} app
     * @returns {boolean}
     */
    _settingOn(app) {
        return app.config.settings.getValue(SETTINGS_KEYS.focusBorder) !== false;
    }

    /**
     * Frame of win when the border may show for it on the active workspace,
     * null for unmanaged/hidden cases.
     * @param {AppFacade} app
     * @param {CinnamonWindow} win
     * @returns {AnyRecord | null}
     */
    _frame(app, win) {
        if (win.minimized || win.is_on_all_workspaces()
            || win.get_window_type() !== this._meta.WindowType.NORMAL || this._deps.exclCheck(win)) {
                return null;
            }
        const monitorIndex = win.get_monitor();
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor || !app.monitors.ready) {
            return null;
        }
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            return null;
        }
        if (win.get_maximized() || win.is_fullscreen()) {
            return null;
        }
        // invisible to the tiling = invisible to the border (floating, excluded, dialog)
        return this._deps.collectWindows(monitor, null, wsIndex).includes(win) ? win.get_frame_rect() : null;
    }

    /**
     * Creates the overlay actor once and binds the global focus/workspace
     * observers.
     * @param {AppFacade} app
     */
    init(app) {
        this._app = app;
        // runs after theme init in the Config constructor, so stateRgb is resolved
        // already and the first style is the real state color, not the default green
        if (!this._actor) {
            this._actor = new this._st.Bin({ reactive: false, style: this._style() });
            this._global.overlay_group.add_actor(this._actor);
            this._actor.hide();
            this._sig.push({ obj: this._global.display, id: this._global.display.connect('notify::focus-window', () => this.update()) });
            this._sig.push({ obj: this._global.workspace_manager, id: this._global.workspace_manager.connect('workspace-switched', () => this.update()) });
        }
        this.update();
    }

    /** Shows, moves or hides the border for the flashed window. */
    update() {
        const app = this._app;
        // app.config is missing while the Config constructor is still running: the
        // settings binding fires before the border (and everything else) is set up
        if (!app || !app.config || !this._actor) {
            return;
        }
        const win = this._flashWin;
        const focus = this._global.display.focus_window;
        // the border belongs to the keyboard-driven focus move only: a focus change to
        // another window (mouse click, Alt+Tab, an app demanding attention) clears it
        if (!win || focus !== win) {
            this._unbindFlash();
            this._flashWin = null;
            this._actor.hide();
            return;
        }
        const frame = this._settingOn(app) ? this._frame(app, win) : null;
        const actor = this._actor;
        if (!frame) {
            actor.hide();
            return;
        }
        actor.set_style(this._style());
        actor.set_position(Math.round(frame.x), Math.round(frame.y));
        actor.set_size(Math.round(frame.width), Math.round(frame.height));
        actor.raise_top();
        actor.show();
        this._armTimer();
    }

    /**
     * called from the focus hotkey only — this is what makes the border keyboard feedback
     * @param {CinnamonWindow} win
     */
    flash(win) {
        this._flashWin = win;
        this._rebindFlash();
        this.update();
    }

    /** called by the theme component on every accent/state color change */
    restyle() {
        if (this._actor) {
            this._actor.set_style(this._style());
        }
    }

    destroy() {
        if (this._timer) {
            this._glib.Source.remove(this._timer);
            this._timer = 0;
        }
        for (const s of this._sig) {
            try {
                s.obj.disconnect(s.id);
            }
            catch (_e) { /* signal already gone */ }
        }
        this._sig = [];
        this._unbindFlash();
        this._flashWin = null;
        this._app = null;
        if (this._actor) {
            this._actor.destroy();
            this._actor = null;
        }
    }
};
