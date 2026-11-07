/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Retile diagnostics: logs which windows a collect skipped and why — a canary
 * against drift between this reason list and the collector's filters.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Diagnostics: the reason list mirrors the collectWindows filters by design —
// 'UNKNOWN' means the two have drifted apart (canary, should never appear).
/**
 * @param {AppFacade} app
 * @param {CinnamonMonitor} monitor
 * @param {CinnamonWindow | null} focusWindow
 * @param {CinnamonWindow[]} collected
 * @param {number | null} [wsIndex] the workspace the collect targeted (null: active);
 * the candidate list must be that workspace's, or a retile of a workspace the user is
 * not looking at would report the active workspace's windows as skipped
 */
var debugCount = (app, monitor, focusWindow, collected, wsIndex = null) => {
    const Meta = imports.gi.Meta;
    const Main = imports.ui.main;
    try {
        const all = wsIndex == null
            ? global.workspace_manager.get_active_workspace().list_windows()
            : global.workspace_manager.get_workspace_by_index(wsIndex).list_windows();
        const missing = [];
        for (let i = 0; i < all.length; i++) {
            const w = all[i];
            if (w === focusWindow || collected.indexOf(w) > -1) {
                continue;
            }
            const reasons = [];
            if (w.minimized) {
                reasons.push('minimized');
            }
            if (w.get_wm_class() == null) {
                reasons.push('wm_class');
            }
            // mirrors collectWindows' sticky filter: a window on every workspace is
            // not collected for the workspace the collect did not target
            if (wsIndex != null && wsIndex !== global.workspace_manager.get_active_workspace().index()) {
                try {
                    if (w.is_on_all_workspaces() === true) {
                        reasons.push('sticky');
                    }
                }
                catch (_e) {
                    reasons.push('sticky=error');
                }
            }
            if (app.excl.isExcluded(w)) {
                reasons.push('excluded');
            }
            if (Main.getTabList().indexOf(w) === -1) {
                reasons.push('not-in-tablist');
            }
            if (imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(w) == null) {
                reasons.push('no-app');
            }
            if (Main.layoutManager.monitors[w.get_monitor()] !== monitor) {
                reasons.push('monitor');
            }
            if (w.get_window_type() !== Meta.WindowType.NORMAL) {
                reasons.push('type=' + w.get_window_type());
            }
            if (w.get_transient_for() != null) {
                reasons.push('transient');
            }
            if (!w.allows_resize()) {
                reasons.push('non-resizable');
            }
            missing.push(String(w.get_wm_class()) + ' "' + String(w.get_title()).slice(0, 20) + '": ' + (reasons.join(',') || 'UNKNOWN'));
        }
        if (missing.length > 0) {
            global.log('greenTile skipped ' + missing.length + ' window(s) on ws' + ((wsIndex == null ? global.workspace_manager.get_active_workspace().index() : wsIndex) + 1) + ': ' + missing.join(' | '));
        }
    }
    catch (e) {
        global.log('greenTile debugCount error: ' + e);
    }
};
