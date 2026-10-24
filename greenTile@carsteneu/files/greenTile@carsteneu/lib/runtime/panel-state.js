/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App panel state: the preset panel's persistence across rebuilds and the
 * teardown of everything the open panel holds — the actor with its chrome
 * registration, the connected workspace-switch/stage/display signal ids and
 * the Escape hotkey bound while the list is open (explicit per-open binding,
 * not a scope — the panel closes mid-life). The UI itself (building widgets,
 * editor, painter) lives in lib/ui and reads/writes this state through
 * app.panel. Owned by the App: on monitors-changed the recreation closes the
 * panel together with the whole App. The saved position is NOT here — it rides
 * the extension session (session.panelSaved, survives App recreations, resets
 * per enable) and is re-validated against the current monitors on every open.
 * Per-entry fault tolerant close: one failing removeHotKey/disconnect must
 * not skip the rest of the teardown.
 * All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Monotonic-time µs window after a view switch during which mouse buttons on the
// panel are swallowed (see the panel's captured-event handler in lib/ui/panel.js).
const PANEL_SWITCH_GUARD_US = 400 * 1000;

/**
 * Panel state deps.
 * @typedef {Object} PanelStateDeps
 * @property {AnyRecord} main imports.ui.main: keybindingManager, layoutManager
 * @property {AnyRecord} glib imports.gi.GLib: get_monotonic_time
 * @property {string} escName the Escape binding name, greenTile-panel-esc —
 * owned by lib/runtime/hotkeys.js
 */
var PanelState = class {
    /**
     * @param {PanelStateDeps} deps
     */
    constructor(deps) {
        this._main = deps.main;
        this._glib = deps.glib;
        this._escName = deps.escName;
        /** @type {AnyRecord | null} */
        this.actor = null;
        this.positioned = false;
        /** @type {Array<{ obj: AnyRecord, id: number }>} */
        this.sig = [];
        this.dragging = false;
        // 'list' (view 1) or 'editor' (view 2); the draft is the editor's working copy
        /** @type {'list' | 'editor'} */
        this.view = 'list';
        /** @type {AnyRecord | null} */
        this.draft = null;
        // Monotonic time (µs) until which mouse buttons on the panel are ignored: the
        // second click of a double-click must not act in the view it just opened.
        this.guardUntil = 0;
        // Escape registered as a hotkey while the list is open (it has no modal).
        this.escBound = false;
    }

    /**
     * Double-click guard: right after a switch between list and editor, clicks are
     * swallowed in the capture phase for a moment (the guardUntil time).
     */
    guard() {
        this.guardUntil = this._glib.get_monotonic_time() + PANEL_SWITCH_GUARD_US;
    }

    /**
     * Closes the panel: unbinds the Escape hotkey, disconnects the signals and
     * removes the chrome actor. Per-entry fault tolerant: one failing
     * removeHotKey/disconnect must not skip the rest of the teardown.
     */
    close() {
        if (this.escBound) {
            this.escBound = false;
            try {
                this._main.keybindingManager.removeHotKey(this._escName);
            }
            catch (_e) {
                // esc hotkey was already gone
            }
        }
        if (!this.actor) {
            return;
        }
        const actor = this.actor;
        this.actor = null;
        this.dragging = false;
        this.view = 'list';
        this.draft = null;
        this.sig.splice(0).forEach(({ obj, id }) => {
            try {
                obj.disconnect(id);
            }
            catch (_e) {
                // signal was already gone
            }
        });
        try {
            this._main.layoutManager.removeChrome(actor);
        }
        catch (_e) {
            // not in the chrome — destroy anyway
        }
        actor.destroy();
    }
};
