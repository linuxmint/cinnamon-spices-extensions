/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Super+Ctrl+Arrow swap hotkeys: swap the focused tiled window with its
 * neighbour — or, when nothing borders in that direction or the surface is not
 * tiled, push it along the monitor/workspace chain: onto the next tiling's edge
 * slot, or moved as it is onto a surface without active tiling.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { usableArea, focusWindow } = XLET.lib.tiling.screen;
const { collectWindows, windowTileable, windowMoveResize } = XLET.lib.tiling.windows;
const { layoutShape, layoutShapeWs, autoAllowed } = XLET.lib.tiling.layout;
const { sortReadingOrder } = XLET.lib.tiling.order;
const { retileMonitor } = XLET.lib.tiling.retile;
const { splitRects } = XLET.lib.model.split;
const { gap } = XLET.lib.tiling.place;
const { swapNeighbor, swapLandingCell, swapChainStep } = XLET.lib.model.swap;

/**
 * @param {AppFacade} app
 * @param {CinnamonWindow} metaWindow
 * @param {Rect} rect
 */
var swapOverride = (app, metaWindow, rect) => {
    const GLib = imports.gi.GLib;
    app.auto.sortOverride(metaWindow.get_stable_sequence(), rect, GLib.get_monotonic_time() / 1000);
};
/**
 * Forgets the source surface's hand-made sizes for the counts a push displaced: the
 * count the pushed window sat on (its arrangement may have been drawn with that window)
 * and the count the surface falls back to. The sizes are keyed by window count alone, so
 * without this the round trip would re-expose them and the preset could not come back
 * until the panel's Reset sizes. Called before the retiles, so the source is placed on
 * the preset in this same gesture. The landing side keeps its own sizes: its saved split
 * is what landingCells validated the incoming slot against.
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {number} n the source count BEFORE the push, including the pushed window
 */
var dropDisplacedSizes = (app, monitorIndex, wsIndex, n) => {
    app.split.forgetCount(app, monitorIndex, wsIndex, n);
    app.split.forgetCount(app, monitorIndex, wsIndex, n - 1);
};
// Super+Ctrl+Arrow hotkeys: swap the focused tiled window with its neighbor (both
// windows sort into each other's cell, then the monitor retiles), or — when nothing
// borders in the direction pressed, or the source surface has no active tiling — push
// it along the monitor chain onto the next monitor/workspace, where it lands in the
// edge slot of an active tiling (insert, not swap) or, on a surface without active
// tiling, keeps its frame (move only). Focus always stays on the moved window so
// repeated presses keep moving the same window.
/**
 * Effective landing cells of a target monitor/workspace: its own windows in reading
 * order with the incoming window appended (the cross-monitor convention), fitted to
 * the minima observed so far. The landing slot must come from the cells the target
 * settles into — a nominal side-by-side cell would send the window to the wrong
 * place on a target that stacks because of application minima.
 * @param {AppFacade} app
 * @param {CinnamonMonitor} targetMonitor
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {number} n
 * @param {Layout} layout
 * @param {CinnamonWindow[]} others target windows without the incoming one
 * @param {CinnamonWindow} incoming
 * @param {{monitorIndex: number, wsIndex: number}} source
 * @returns {Rect[]}
 */
var landingCells = (app, targetMonitor, monitorIndex, wsIndex, n, layout, others, incoming, source) => {
    const ordered = sortReadingOrder(app, others, layout.kind === 'cols', false).concat([incoming]);
    const fit = app.split.fit(app, monitorIndex, wsIndex, n, layout,
        app.split.minsFor(app, monitorIndex, wsIndex, n, ordered, source), usableArea(targetMonitor), gap(app));
    return splitRects(fit.kind, fit.shape, fit.split, usableArea(targetMonitor));
};
/**
 * Moves the window onto the landing monitor, verifying the move. Muffin's
 * move_to_monitor() silently keeps a window TALLER than the target's work area on its
 * source monitor: no error, no frame change. Live-verified 2026-10-14 on Cinnamon
 * 6.6/X11 with two 3440x1440 monitors, the one at x=0 behind a 40 px panel (1400 px
 * work area): a full-height tile of the panel-less monitor (1716x1440) did not move,
 * the same window at 1400 px (exactly the target work area) and at 1390 px did. The
 * width is not checked (a 4000 px wide window moved). A greenTile tile fills its
 * surface's work-area height, so every push out of the roomier monitor used to fail:
 * the target's retile never counted the incoming window (its monitor had not changed)
 * and the source's placed it back into the cell it came from. The fallback places the
 * window on the target itself — the size clamped into the target work area, at the
 * position it held inside the source work area, which is what move_to_monitor would
 * have produced. The retile that follows then fits it to the target's slot.
 * @param {CinnamonWindow} w
 * @param {CinnamonMonitor} source
 * @param {CinnamonMonitor} target
 * @param {number} targetIndex
 * @param {Rect} frame the window's frame at the push
 */
var moveToMonitor = (w, source, target, targetIndex, frame) => {
    w.move_to_monitor(targetIndex);
    let landed;
    try {
        landed = w.get_monitor();
    }
    catch (_e) {
        // a wrapper finalized mid-push: nothing is left to place
        return;
    }
    if (landed === targetIndex) {
        return;
    }
    const from = usableArea(source);
    const area = usableArea(target);
    const width = Math.min(frame[2], area[2]);
    const height = Math.min(frame[3], area[3]);
    const x = area[0] + Math.min(Math.max(frame[0] - from[0], 0), area[2] - width);
    const y = area[1] + Math.min(Math.max(frame[1] - from[1], 0), area[3] - height);
    windowMoveResize(w, x, y, width, height);
};
/**
 * @param {AppFacade} app
 * @param {'left'|'right'|'up'|'down'} dir
 */
var swapHotkey = (app, dir) => {
    const Main = imports.ui.main;
    const focused = focusWindow();
    // The swap places windows, so the focus must be one the collector would place
    // too (windowTileable covers minimized) — otherwise the source is a window the
    // retile counts for nobody and the swap arms an override nothing consumes.
    if (!focused || !windowTileable(focused) || focused.is_on_all_workspaces() || app.excl.isExcluded(focused)) {
        return;
    }
    const monitorIndex = focused.get_monitor();
    const monitor = Main.layoutManager.monitors[monitorIndex];
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    // Before the monitor registry answered nothing is known about which surfaces are
    // tiled (autoAllowed and layoutFor both report "off"), so a push would land every
    // window as move only on surfaces that tile a moment later: wait for readiness.
    if (!monitor || !app.monitors.ready) {
        return;
    }
    // A source monitor-workspace without active tiling — none set up, explicitly
    // paused (preset kept, auto off), or a retained pause that outranks a stored auto
    // (autoAllowed, the decision the retile uses) — rearranges nothing ON itself: no
    // local exchange, no retile, its stored sizes stay. Sending the window AWAY is
    // still a push along the chain like the edge push of a tiled surface (user
    // decision 2026-10-08), so a window travels through untiled and paused surfaces
    // instead of getting stuck; Up/Down have no chain and stay no-ops there.
    const sourceTiled = autoAllowed(app, monitorIndex, wsIndex);
    const area = usableArea(monitor);
    const frame = focused.get_frame_rect();
    /** @type {Rect} */
    const frameRect = [frame.x, frame.y, frame.width, frame.height];
    const windows = collectWindows(app, monitor, focused);
    const n = windows.length + 1;
    const layout = sourceTiled ? layoutShape(app, monitorIndex, n) : null;
    /** @type {Rect[] | null} */
    let cells = null;
    /** @type {CinnamonWindow[] | null} */
    let ordered = null;
    /** @type {FittedLayout | null} */
    let fit = null;
    let selfIdx = -1;
    if (layout) {
        ordered = sortReadingOrder(app, [focused].concat(windows), layout.kind === 'cols');
        fit = app.split.effective(app, monitorIndex, wsIndex, n, layout, ordered);
        cells = fit.cells || splitRects(fit.kind, fit.shape, fit.split, fit.area || area);
        selfIdx = /** @type {CinnamonWindow[]} */ (ordered).indexOf(focused);
    }
    if (layout && selfIdx >= 0) {
        // cells/ordered are always filled when layout is non-null (both assignments
        // above ran); the casts restate that invariant for tsc.
        const nb = swapNeighbor(/** @type {Rect[]} */ (cells), selfIdx, dir);
        if (nb != null) {
            swapOverride(app, focused, (/** @type {Rect[]} */ (cells))[nb]);
            swapOverride(app, (/** @type {CinnamonWindow[]} */ (ordered))[nb], (/** @type {Rect[]} */ (cells))[selfIdx]);
            retileMonitor(app, monitorIndex, focused, true, wsIndex, fit);
            global.log('greenTile swap ' + dir + ' ws' + (wsIndex + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n);
            return;
        }
    }
    if (dir === 'up' || dir === 'down') {
        return;
    }
    const step = swapChainStep({
        dir: dir,
        monitorIndex: monitorIndex,
        primaryIndex: Main.layoutManager.primaryIndex,
        onlyPrimary: app.monitors.onlyPrimary(),
        monitors: Main.layoutManager.monitors.map((/** @type {AnyRecord} */ m, /** @type {number} */ i) => ({ index: i, x: m.x, width: m.width })),
        workspaces: global.workspace_manager.get_n_workspaces(),
        wsIndex: wsIndex,
    });
    if (!step) {
        return;
    }
    const targetMonitor = Main.layoutManager.monitors[step.monitor];
    if (!targetMonitor) {
        return;
    }
    // On a target without active tiling — none set up, paused, or a retained pause
    // (the same autoAllowed decision as for the source and the retile gate) — the
    // window lands untiled (move only, its frame kept as far as it fits the target
    // work area — see moveToMonitor): no slot is computed and no override is armed
    // that the gated retile would never consume. Gate and shape read the same,
    // explicit workspace.
    if (step.kind === 'monitor') {
        const others = collectWindows(app, targetMonitor, null);
        const nTarget = others.length + 1;
        const targetLayout = autoAllowed(app, step.monitor, wsIndex) ? layoutShapeWs(app, step.monitor, wsIndex, nTarget) : null;
        if (targetLayout) {
            const targetCells = landingCells(app, targetMonitor, step.monitor, wsIndex, nTarget, targetLayout, others, focused,
                { monitorIndex: monitorIndex, wsIndex: wsIndex });
            const slotIdx = swapLandingCell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
            if (slotIdx != null) {
                swapOverride(app, focused, targetCells[slotIdx]);
            }
        }
        moveToMonitor(focused, monitor, targetMonitor, step.monitor, frameRect);
        if (sourceTiled) {
            dropDisplacedSizes(app, monitorIndex, wsIndex, n);
        }
        retileMonitor(app, step.monitor, focused);
        if (sourceTiled) {
            retileMonitor(app, monitorIndex, null, true, wsIndex);
        }
        global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> mon=' + (app.monitors.keys[step.monitor] || '?') + ' ws' + (wsIndex + 1));
        return;
    }
    // Workspace landing: the count of the other windows is read before the switch, the
    // slot is computed after it, gate and shape both for the explicit target workspace
    // (not the active one, so they cannot disagree if the switch lags). The
    // window is moved to the landing monitor too — a workspace switch alone would leave
    // it on the source monitor. The source workspace retiles with one window less even
    // though it is no longer active. Both retiles are asked for right after the switch,
    // while the shell's switch effect still owns the window actors; retileMonitor holds
    // them until that effect ended (lib/runtime/auto.js SWITCH_POLL_MS), because the
    // effect's cleanup would draw every moved frame at its pre-push place.
    const targetWsIndex = wsIndex + step.delta;
    const others = collectWindows(app, targetMonitor, focused, targetWsIndex);
    const nTarget = others.length + 1;
    // Muffin's signature is (index, append); Cinnamon's main.js passes a third time
    // argument that GJS drops with a "Too many arguments" warning.
    focused.change_workspace_by_index(targetWsIndex, false);
    moveToMonitor(focused, monitor, targetMonitor, step.monitor, frameRect);
    global.workspace_manager.get_workspace_by_index(targetWsIndex).activate_with_focus(focused, global.get_current_time());
    const targetLayout = autoAllowed(app, step.monitor, targetWsIndex) ? layoutShapeWs(app, step.monitor, targetWsIndex, nTarget) : null;
    if (targetLayout) {
        const targetCells = landingCells(app, targetMonitor, step.monitor, targetWsIndex, nTarget, targetLayout, others, focused,
            { monitorIndex: monitorIndex, wsIndex: wsIndex });
        const slotIdx = swapLandingCell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
        if (slotIdx != null) {
            swapOverride(app, focused, targetCells[slotIdx]);
        }
    }
    // A source without active tiling keeps its stored sizes and is not retiled.
    if (sourceTiled) {
        dropDisplacedSizes(app, monitorIndex, wsIndex, n);
    }
    retileMonitor(app, step.monitor, focused, true, targetWsIndex);
    if (sourceTiled) {
        retileMonitor(app, monitorIndex, null, true, wsIndex);
    }
    global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> ws' + (targetWsIndex + 1) + ' mon=' + (app.monitors.keys[step.monitor] || '?'));
};
