/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App hotkey owner: registers the static 'greenTile-*' hotkeys on the
 * injected keybindingManager and removes exactly those 14 names idempotently.
 * register() always removes first, so a binding change arriving through
 * Config.registerHotkeys re-registers exactly once — WITHOUT touching the panel's
 * Escape hotkey, which the panel state owner binds and unbounds per open/close
 * (mid-life things keep explicit ids, learning #95219). Per-entry fault
 * tolerant: one failing removeHotKey must not skip the rest.
 * All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

var HOTKEY_NAMES = Object.freeze([
    'greenTile-auto6', 'greenTile-auto3', 'greenTile-autoN', 'greenTile-autoOff',
    'greenTile-preset', 'greenTile-exclude',
    'greenTile-resize-wider', 'greenTile-resize-narrower', 'greenTile-resize-taller', 'greenTile-resize-shorter',
    'greenTile-swap-left', 'greenTile-swap-right', 'greenTile-swap-up', 'greenTile-swap-down',
]);

var PANEL_ESC_NAME = 'greenTile-panel-esc';

/**
 * Hotkey owner: registers and removes the 14 static 'greenTile-*' hotkeys on
 * the injected keybinding manager.
 * @typedef {Object} HotkeysDeps
 * @property {AnyRecord} keybindingManager Main.keybindingManager
 */
var Hotkeys = class {
    /**
     * @param {HotkeysDeps} deps
     */
    constructor(deps) {
        this._keybindingManager = deps.keybindingManager;
    }

    /**
     * Registers the 14 static hotkeys with the settings values and callbacks
     * resolved at call time, after removing the previous registration.
     * @param {Array<{ name: string, bindings: any, callback: () => void }>} bindings
     */
    register(bindings) {
        this.remove();
        for (const binding of bindings) {
            this._keybindingManager.addHotKey(binding.name, binding.bindings, binding.callback);
        }
    }

    /**
     * Removes the 14 static hotkeys idempotently. The settings-driven
     * re-registration path (Config.registerHotkeys on every binding change)
     * touches ONLY the static names: the panel's Escape hotkey is bound and
     * unbound by the panel state owner per open/close and must survive a
     * re-registration while the list is open.
     */
    remove() {
        for (const name of HOTKEY_NAMES) {
            try {
                this._keybindingManager.removeHotKey(name);
            }
            catch (_e) {
                // binding was already gone
            }
        }
    }
};
