/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Composition root per App, derived from gTile 2.2.1 (src/base/app.ts): constructs
 * every per-App component in a fixed order, hands the Cinnamon access
 * to each one as explicit deps and finishes with the settings Config — the
 * constructor's last step, so the binds fire into a fully wired app.
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { Split } = XLET.lib.runtime.split;
const { Drop } = XLET.lib.runtime.drop;
const { Theme } = XLET.lib.runtime.theme;
const { Border } = XLET.lib.runtime.border;
const { Focus } = XLET.lib.runtime.focus;
const { Monitors } = XLET.lib.runtime.monitors;
const { Auto } = XLET.lib.runtime.auto;
const { Orders } = XLET.lib.runtime.orders;
const { Placement } = XLET.lib.runtime.placement;
const { ActorSync } = XLET.lib.runtime.actorsync;
const { Hotkeys, PANEL_ESC_NAME } = XLET.lib.runtime.hotkeys;
const { Exclusions } = XLET.lib.runtime.exclusions;
const { PanelState } = XLET.lib.runtime['panel-state'];
const { _ } = XLET.lib.ui.i18n;
const { panelRebuild, panelWindowCount } = XLET.lib.ui.panel;
const { usableArea, focusWindow, focusMonitorIndex } = XLET.lib.tiling.screen;
const { collectWindows, windowMoveResize } = XLET.lib.tiling.windows;
const { gap, placeFit } = XLET.lib.tiling.place;
const { presetsRead, presetsWrite, layoutFor, layoutSet, layoutShape, rulesPick } = XLET.lib.tiling.layout;
const { sortReadingOrder } = XLET.lib.tiling.order;
const { retileMonitor, exclRetile } = XLET.lib.tiling.retile;
const { focusHotkey } = XLET.lib.tiling['focus-nav'];
const { grabOpName, grabIsResize } = XLET.lib.tiling.grab;
const { Config } = XLET.lib.app.config;

/**
 * @typedef {Object} AppCinnamon
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {AnyRecord} cinnamonNs imports.gi.Cinnamon
 */
var App = class {
    /**
     * @param {SessionFacade} session
     * @param {AppCinnamon} cinnamon
     */
    constructor(session, cinnamon) {
        const Main = imports.ui.main;
        const SignalManager = imports.misc.signalManager.SignalManager;
        const GLib = imports.gi.GLib;
        const St = imports.gi.St;
        const Mainloop = imports.mainloop;
        const Gio = imports.gi.Gio;
        const ByteArray = imports.byteArray;

        this.session = session;
        // The animated-placement owner is per App and takes every acquisition
        // directly from lib/tiling/place.js, so it holds the window animations
        // that started before the auto observer's asynchronous monitor reply
        // and can release them without re-resolving the window's actor.
        this.placement = new Placement({
            logError: (/** @type {string} */ message) => cinnamon.global.logError(message),
        });
        this.excl = new Exclusions({
            appSystem: cinnamon.cinnamonNs.AppSystem,
            windowTracker: cinnamon.cinnamonNs.WindowTracker,
            gio: cinnamon.gio,
            main: cinnamon.main,
            global: cinnamon.global,
            // session-owned: the Super+G toggles and their close watches
            // survive an App recreation (FEATURES.md lifetime)
            toggles: session.exclToggles,
            watches: session.exclWatches,
            focusWindow,
            retileMonitor,
            retile: exclRetile,
            translate: _,
        });
        this.hotkeys = new Hotkeys({ keybindingManager: cinnamon.main.keybindingManager });
        this.panel = new PanelState({
            main: cinnamon.main,
            glib: GLib,
            escName: PANEL_ESC_NAME,
        });
        this.monitors = new Monitors({
            main: cinnamon.main,
            gio: cinnamon.gio,
            meta: cinnamon.meta,
            global: cinnamon.global,
            session,
        });
        // facade types on the component assignments break the constructor
        // dep inference cycle (deps callbacks reference `this`) and pin the
        // cross-App surface greenTile consumes
        /** @type {SplitFacade} */
        this.split = new Split({
            mainloop: Mainloop,
            glib: GLib,
            gio: Gio,
            global: cinnamon.global,
            main: cinnamon.main,
            focusWindow,
            layoutFor,
            layoutShape,
            layoutSet,
            collectWindows: (/** @type {any} */ monitor, /** @type {any} */ focus, /** @type {any} */ ws) => collectWindows(this, monitor, focus, ws),
            usableArea,
            gap,
            retileMonitor,
            grabOpName,
            sortReadingOrder,
        });
        // The restart-order store: written after every placement, its snapshot is
        // read once per surface by the first retile after enable (lib/tiling/retile.js).
        /** @type {OrdersFacade} */
        this.orders = new Orders({
            glib: GLib,
            gio: Gio,
            byteArray: ByteArray,
            mainloop: Mainloop,
            global: cinnamon.global,
            log: (/** @type {string} */ msg) => cinnamon.global.log(msg),
        });
        // The post-placement actor verification (lib/runtime/actorsync.js): one check per
        // surface, one nudge per actor that did not follow its frame.
        /** @type {ActorSyncFacade} */
        this.actorsync = new ActorSync({
            mainloop: Mainloop,
            log: (/** @type {string} */ msg) => cinnamon.global.log(msg),
            moveResize: windowMoveResize,
            // A grab owns the geometry: the resync must not move a window the user is
            // dragging or resizing. An unreadable op means no grab — a missing accessor
            // must not silently disable the check (drop.js reads the same pair).
            grabActive: () => {
                try {
                    const op = cinnamon.global.display.get_grab_op();
                    return op !== undefined && op !== null && op !== cinnamon.meta.GrabOp.NONE;
                }
                catch (_e) {
                    return false;
                }
            },
        });
        this.theme = new Theme({
            st: St,
            gio: Gio,
            main: Main,
            global: cinnamon.global,
            glib: GLib,
            byteArray: ByteArray,
            nextAccentGen: () => session.nextAccentGen(),
            panelOpen: () => this.panel.actor,
            panelRebuild: (/** @type {any} */ a) => panelRebuild(a),
        });
        /** @type {BorderFacade} */
        this.border = new Border({
            st: St,
            glib: GLib,
            meta: cinnamon.meta,
            main: Main,
            global: cinnamon.global,
            stateRgb: () => this.theme.stateRgb,
            exclCheck: (/** @type {CinnamonWindow} */ w) => this.excl.isExcluded(w),
            layoutFor,
            collectWindows: (/** @type {any} */ monitor, /** @type {any} */ focus, /** @type {any} */ ws) => collectWindows(this, monitor, focus, ws),
        });
        // focusChain: where the last held focus press left the focus, the window
        // Muffin handed that press (every press inside one effect gets the same one),
        // and the hold it ran in — a chain never reaches into the next hold.
        // Assumed, not verified on the host: activate() updates display.focus_window at
        // once; if it does not, a second held press only moves one cell (never wrong).
        /** @type {{origin: CinnamonWindow | null, after: CinnamonWindow | null, gen: number}} */
        const focusChain = { origin: null, after: null, gen: -1 };
        this.focus = new Focus({
            meta: cinnamon.meta,
            keybindingManager: cinnamon.main.keybindingManager,
            // Focus navigation reads the tiled geometry: inside a workspace-switch
            // effect it waits behind the held retiles (lib/runtime/auto.js). Muffin
            // hands every press inside the effect the window focused at the press, so
            // a later held press continues from where the earlier held press left the
            // focus (two quick presses move two cells, as without the hold). A press
            // whose focus was taken elsewhere meanwhile (the user clicked another
            // window) is dropped instead of pulling the focus back.
            hotkey: (/** @type {AppFacade} */ app, /** @type {'left' | 'right' | 'up' | 'down'} */ dir) => {
                const handler = focusHotkey(app, dir);
                return (/** @type {AnyRecord} */ display, /** @type {CinnamonWindow} */ win) => {
                    const held = app.auto.switching();
                    // The hold a press was made in, and the hold it is replayed in: a
                    // replayed push re-holds the presses behind it into a newer hold, in
                    // either order around the press before. The chain counts when it was
                    // made in either of them; a chain of an earlier hold is older than both.
                    const pressGen = held ? app.auto.holdGeneration() : -1;
                    app.auto.afterSwitchPress(() => {
                        const replayGen = held ? app.auto.holdGeneration() : -1;
                        const current = cinnamon.global.display.focus_window;
                        let from = win;
                        if (held && win && current !== win) {
                            if ((focusChain.gen !== pressGen && focusChain.gen !== replayGen)
                                || focusChain.origin !== win || !focusChain.after || current !== focusChain.after) {
                                return;
                            }
                            from = current;
                        }
                        handler(display, from);
                        if (win) {
                            focusChain.origin = held ? win : null;
                            focusChain.after = held ? cinnamon.global.display.focus_window : null;
                            focusChain.gen = replayGen;
                        }
                    });
                };
            },
            logError: (message) => cinnamon.global.logError(message),
        });
        /** @type {DropFacade} */
        this.drop = new Drop({
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            mainloop: Mainloop,
            st: St,
            collectWindows: (/** @type {any} */ monitor, /** @type {any} */ focus, /** @type {any} */ ws) => collectWindows(this, monitor, focus, ws),
            excludeCheck: (/** @type {any} */ w) => this.excl.isExcluded(w),
            layoutShape,
            layoutSet,
            usableArea,
            gap,
            placeFit,
            accentRgb: () => this.theme.rgb,
        });
        this.auto = new Auto({
            mainloop: Mainloop,
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            signalManager: new SignalManager(),
            gobject: cinnamon.gobject,
            glib: GLib,
            focusWindow,
            focusMonitorIndex,
            layoutFor,
            layoutSet,
            retileMonitor,
            borderUpdate: () => this.border.update(),
            grabIsResize,
            dropBegin: (/** @type {AppFacade} */ grabApp, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => grabApp.drop.begin(grabApp, w, op),
            dropEnd: (/** @type {AppFacade} */ grabApp, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => grabApp.drop.end(grabApp, w, op),
            dropStop: () => this.drop.stop(),
            resizeEnd: (/** @type {AppFacade} */ grabApp, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => grabApp.split.onResizeEnd(grabApp, w, op),
        });
        // Explicit UI facade (one place): the tiling functions the preset panel
        // (lib/ui) calls — frozen, so nothing beyond these lookups is reachable.
        // Model modules are required by lib/ui directly (no facade needed).
        this.ops = Object.freeze({
            focusWindow,
            focusMonitorIndex,
            collectWindows,
            layoutFor,
            layoutSet,
            retileMonitor,
            presetsRead,
            presetsWrite,
            gap,
            rulesPick,
            windowCount: panelWindowCount,
            rebuild: panelRebuild,
        });
        // The bind callbacks fire into a fully wired App: Config is last.
        /** @type {ConfigFacade} */
        this.config = new Config(this);
    }
    destroy() {
        this.config.destroy();
    }
};
