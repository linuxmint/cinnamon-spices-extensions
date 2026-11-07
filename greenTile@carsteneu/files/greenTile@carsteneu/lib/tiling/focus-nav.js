/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Super+Arrow focus navigation: when the tiling has something to say, the
 * neighbour window is activated inside the layout; everywhere else the
 * keybinding falls through to Cinnamon's native push-tile.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { usableArea } = XLET.lib.tiling.screen;
const { collectWindows } = XLET.lib.tiling.windows;
const { layoutFor, layoutShape } = XLET.lib.tiling.layout;
const { sortReadingOrder } = XLET.lib.tiling.order;
const { splitRects } = XLET.lib.model.split;
const { swapNeighbor } = XLET.lib.model.swap;
const { focusMonitorStep, focusMonitorPick } = XLET.lib.model.focus;

// Super+Arrow moves the keyboard focus on monitor+workspaces where automatic tiling is
// on: the neighbouring tiled window in that direction is activated, nothing is moved or
// retiled. Cinnamon's own push-tile keybindings are taken over wholesale (the gsettings
// bindings stay in org.cinnamon.desktop.keybindings.wm, so rebinding push-tile keeps
// working). Wherever the tiling has nothing to say — other monitor/workspace states, a
// focused window greenTile does not manage (floating, excluded, dialog) — push_tile runs
// with the received window, the exact native behaviour. Left/right cross over to the
// adjacent monitor at the edge (no wrap); up/down never leave the monitor or workspace.
// (In-layout neighbour: swapNeighbor in lib/model/swap.js — same cells, same semantics.)
/**
 * @param {'left'|'right'|'up'|'down'} dir
 * @returns {number} a Meta.MotionDirection value
 */
var focusMotion = (dir) => {
    const Meta = imports.gi.Meta;
    return {
        left: Meta.MotionDirection.LEFT,
        right: Meta.MotionDirection.RIGHT,
        up: Meta.MotionDirection.UP,
        down: Meta.MotionDirection.DOWN,
    }[dir];
};
/**
 * @param {CinnamonWindow} window
 * @param {'left'|'right'|'up'|'down'} dir
 */
var focusPushNative = (window, dir) => {
    global.display.push_tile(window, focusMotion(dir));
};
/**
 * @param {AppFacade} app
 * @param {'left'|'right'|'up'|'down'} dir
 */
var focusHotkey = (app, dir) => (/** @type {AnyRecord} */ display, /** @type {CinnamonWindow} */ window) => {
    const Main = imports.ui.main;
    if (!window)
        {return;} // native has no window to push either
    if (window.minimized || window.is_on_all_workspaces() || app.excl.isExcluded(window)) {
        focusPushNative(window, dir);
        return;
    }
    const monitorIndex = window.get_monitor();
    const monitor = Main.layoutManager.monitors[monitorIndex];
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (!monitor || !app.monitors.ready || !layoutFor(app, monitorIndex, wsIndex).auto) {
        focusPushNative(window, dir);
        return;
    }
    // The focus window sits in the cell the current layout gives it; the neighbour is
    // whatever the tiling would place next to it in that direction.
    const windows = collectWindows(app, monitor, null, wsIndex);
    let cells = null;
    let ordered = null;
    const n = windows.length;
    const layout = n ? layoutShape(app, monitorIndex, n) : null;
    if (layout) {
        ordered = sortReadingOrder(app, windows, layout.kind === 'cols', false);
        const fit = app.split.effective(app, monitorIndex, wsIndex, n, layout, ordered);
        cells = fit.cells || splitRects(fit.kind, fit.shape, fit.split, fit.area || usableArea(monitor));
        const selfIdx = ordered.indexOf(window);
        // a tiling-managed focus window is one of the collected ones; anything else
        // (floating, dialog accidentally focused) keeps the native key behaviour.
        // A cell/window mismatch is a corrupt state — native as well.
        if (selfIdx < 0 || cells.length !== n) {
            focusPushNative(window, dir);
            return;
        }
        const nb = swapNeighbor(cells, selfIdx, dir);
        if (nb != null) {
            ordered[nb].activate(global.get_current_time());
            app.border.flash(ordered[nb]);
            return;
        }
    }
    if (dir === 'left' || dir === 'right') {
        const step = focusMonitorStep({
            dir: dir,
            monitorIndex: monitorIndex,
            monitors: Main.layoutManager.monitors.map((/** @type {AnyRecord} */ m, /** @type {number} */ i) => ({ index: i, x: m.x })),
        });
        if (step != null) {
            const frame = window.get_frame_rect();
            const cands = collectWindows(app, Main.layoutManager.monitors[step], null, wsIndex).map((/** @type {CinnamonWindow} */ w, /** @type {number} */ i) => {
                const r = w.get_frame_rect();
                return { index: i, x: r.x, y: r.y, width: r.width, height: r.height, w: w };
            });
            const pick = focusMonitorPick(cands, dir, { x: frame.x, y: frame.y, width: frame.width, height: frame.height });
            if (pick != null) {
                cands[pick].w.activate(global.get_current_time());
                app.border.flash(cands[pick].w);
                return;
            }
        }
    }
};
