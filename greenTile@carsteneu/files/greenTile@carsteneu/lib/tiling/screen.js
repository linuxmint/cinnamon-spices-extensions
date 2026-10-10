/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Tiling screen services: the usable work area behind Cinnamon's panels and
 * the focus-window resolution the hotkeys and retiles build on.
 * panelHeight/usableArea are derived from gTile 2.2.1
 * (src/base/utils.ts).
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { windowTileable } = XLET.lib.tiling.windows;

/**
 * @param {AnyRecord} panel
 * @returns {number}
 */
var panelHeight = (panel) => {
    return panel.height
        || panel.actor.get_height();
};
/**
 * @param {CinnamonMonitor} monitor
 * @returns {Rect}
 */
var usableArea = (monitor) => {
    const Main = imports.ui.main;
    const Panel = imports.ui.panel;
    let top = monitor.y;
    let bottom = monitor.y + monitor.height;
    let left = monitor.x;
    let right = monitor.x + monitor.width;
    for (const panel of Main.panelManager.getPanelsInMonitor(monitor.index)) {
        if (!panel.isHideable()) {
            switch (panel.panelPosition) {
                case Panel.PanelLoc.top:
                    top += panelHeight(panel);
                    break;
                case Panel.PanelLoc.bottom:
                    bottom -= panelHeight(panel);
                    break;
                case Panel.PanelLoc.left:
                    left += panelHeight(panel);
                    break;
                case Panel.PanelLoc.right:
                    right -= panelHeight(panel);
                    break;
            }
        }
    }
    const width = right > left ? right - left : 0;
    const height = bottom > top ? bottom - top : 0;
    return [left, top, width, height];
};
// The real focus may sit on another workspace (e.g. a maximized terminal there);
// muffin ignores resizes on maximized windows, so such a window would claim a slot
// and leave it empty. Accept only visible normal windows of the active workspace,
// otherwise fall back to the first visible window here.
var focusWindow = () => {
    const Meta = imports.gi.Meta;
    const Main = imports.ui.main;
    const focus = global.display.focus_window;
    const active = global.workspace_manager.get_active_workspace();
    if (focus && !focus.minimized && focus.get_window_type() === Meta.WindowType.NORMAL
        && (focus.get_workspace() === active || focus.is_on_all_workspaces())) {
            return focus;
        }
    const tabList = Main.getTabList();
    // Cinnamon's getTabList also lists app-less dialogs (main.js isInteresting), so
    // the fallback must apply the same tileability filter the collector uses — a
    // dialog may never become the focus a retile counts and places a cell for. The
    // list is already scoped to the active workspace, so no further filtering.
    for (let i = 0; i < tabList.length; i++) {
        if (windowTileable(tabList[i])) {
            return tabList[i];
        }
    }
    return null;
};
var focusMonitorIndex = () => {
    const Main = imports.ui.main;
    const focused = focusWindow();
    return focused ? focused.get_monitor() : Main.layoutManager.primaryIndex;
};
