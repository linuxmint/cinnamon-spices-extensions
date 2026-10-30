/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Window collecting and window geometry: the own window collector instead of
 * gTile's GetNotFocusedWindowsOfMonitor, plus the reset / move-resize window
 * operations, derived from gTile 2.2.1 (src/base/utils.ts).
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The intrinsic tileability of a window — the part of the collector's filter that
// depends on neither the app nor the monitor. Shared with the focus resolution
// (lib/tiling/screen.js) and the focus count/placement path (lib/tiling/retile.js)
// so that a window the collector excludes can never become the focus a retile
// counts and places an extra cell for. Needed because Cinnamon's own
// Main.getTabList() lists app-less dialogs too (main.js isInteresting).
// A window transient for another (a child/properties dialog, often typed NORMAL)
// and a window that cannot be resized (a fixed-size dialog) are not tileable
// either: they float where they are, like an excluded window.
/**
 * @param {CinnamonWindow | null | undefined} w
 * @returns {boolean}
 */
var windowTileable = (w) => {
    const Meta = imports.gi.Meta;
    const tracker = imports.gi.Cinnamon.WindowTracker.get_default();
    return w != null && !w.minimized && w.get_wm_class() != null
        && w.get_window_type() === Meta.WindowType.NORMAL
        && w.get_transient_for() == null
        && w.allows_resize()
        && tracker.get_window_app(w) != null;
};

// A window the user has filled the screen with: maximized in BOTH directions or
// fullscreen. Single-window mode leaves such a window untouched (lib/tiling/retile.js)
// — a placement would unmaximize it first (windowReset below) and shrink it into
// the centered frame, undoing a deliberate maximize for nothing. A window
// maximized in only ONE direction is not this: tiling still owns its other axis,
// so the mode places it as usual.
/**
 * @param {CinnamonWindow | null | undefined} w
 * @returns {boolean}
 */
var windowMaximizedOrFullscreen = (w) => {
    if (w == null) {
        return false;
    }
    const Meta = imports.gi.Meta;
    if (w.is_fullscreen()) {
        return true;
    }
    const both = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;
    return (w.get_maximized() & both) === both;
};

// Own collector instead of gTile's GetNotFocusedWindowsOfMonitor: that one excludes
// app.focusMetaWindow, which goes stale because gTile tracks focus via the app-level
// 'notify::focus-app' signal (silent on same-app window switches) — visible windows
// get dropped. RULE: active workspace only, never pull windows across workspaces.
/**
 * @param {AppFacade} app
 * @param {CinnamonMonitor} monitor
 * @param {CinnamonWindow | null} focusWindow
 * @param {number | null | undefined} [wsIndex]
 * @returns {CinnamonWindow[]}
 */
var collectWindows = (app, monitor, focusWindow, wsIndex = null) => {
    const Main = imports.ui.main;
    const result = [];
    const tabList = wsIndex == null ? Main.getTabList()
        : global.workspace_manager.get_workspace_by_index(wsIndex).list_windows();
    // A window that is on EVERY workspace (a pinned player, a recorder) is listed by
    // each of them. A retile the user is not looking at must not move it into that
    // other workspace's cell — the user may not even have tiling on where it is
    // visible, and the active retile would otherwise have to undo the move. The
    // active workspace still places it (wsIndex null, or the active index).
    const otherWorkspace = wsIndex != null
        && wsIndex !== global.workspace_manager.get_active_workspace().index();
    for (let i = 0; i < tabList.length; i++) {
        const w = tabList[i];
        if (w === focusWindow || !windowTileable(w)) {
            continue;
        }
        if (otherWorkspace && isOnAllWorkspaces(w)) {
            continue;
        }
        if (app.excl.isExcluded(w)) {
            continue;
        }
        if (Main.layoutManager.monitors[w.get_monitor()] !== monitor) {
            continue;
        }
        result.push(w);
    }
    return result;
};

/**
 * Whether Muffin shows the window on every workspace. Older Cinnamon has no such
 * accessor: absent means "on one workspace only", which keeps the collector's
 * behaviour unchanged there.
 * @param {CinnamonWindow} w
 * @returns {boolean}
 */
var isOnAllWorkspaces = (w) => {
    try {
        return w.is_on_all_workspaces() === true;
    }
    catch (_e) {
        return false;
    }
};

// Window reset, derived from gTile 2.2.1 src/base/utils.ts: let go of both
// maximize states before a tile placement, in the order Muffin settles best.
/**
 * @param {CinnamonWindow | null} metaWindow
 */
var windowReset = (metaWindow) => {
    const Meta = imports.gi.Meta;
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
};

// Move-resize, derived from gTile 2.2.1 src/base/utils.ts: the extra move_frame
// call pins the window onto fractional-scale monitors where move_resize_frame
// alone leaves it one frame short.
/**
 * @param {CinnamonWindow | null} metaWindow
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {boolean} [userOp] Meta's user-op flag. false marks greenTile's own repair (the
 * actor resync's 1 px detour) as not a user move, so it cannot be recorded as one.
 */
var windowMoveResize = (metaWindow, x, y, width, height, userOp = true) => {
    if (!metaWindow) {
        return;
    }
    metaWindow.move_resize_frame(userOp, x, y, width, height);
    metaWindow.move_frame(userOp, x, y);
};
