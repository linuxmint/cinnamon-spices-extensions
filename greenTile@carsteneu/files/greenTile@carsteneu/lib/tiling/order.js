/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Reading-order sort over windows with the auto mode's sort-rect overrides
 * (set after an edge resize, used up by the next retile).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { sortOrder } = XLET.lib.model.split;

// Sort direction must match the target layout: column-major for the low-res
// column-stack, row-major for uniform grids — otherwise re-tiles shuffle
// windows between cells and manual arrangements do not survive. Grouping by overlap
// (sortOrder) keeps windows in their column/row with unequal borders too.
// app.auto carries the sort-rect overrides: stable sequence -> frame to sort by
// instead of the current one (set after an edge resize: the dragged window keeps
// the cell it was tiled into; used up by the next retile, ignored after 2000 ms
// when no retile came). consume=false is the read-only use: focus navigation
// places no window and must leave the override to the retile that consumes it.
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow[]} windows
 * @param {boolean} columnMajor
 * @param {boolean} [consume]
 * @returns {CinnamonWindow[]}
 */
var sortReadingOrder = (app, windows, columnMajor, consume = true) => {
    const GLib = imports.gi.GLib;
    const now = GLib.get_monotonic_time() / 1000;
    app.auto.sortPoll(now);
    const rects = /** @type {Rect[]} */ (windows.map((/** @type {CinnamonWindow} */ w) => {
        const seq = w.get_stable_sequence();
        const rect = consume ? app.auto.sortTake(seq, now) : app.auto.sortPeek(seq, now);
        if (rect) {
            return rect;
        }
        const f = w.get_frame_rect();
        return [f.x, f.y, f.width, f.height];
    }));
    return sortOrder(rects, columnMajor).map((/** @type {number} */ i) => windows[i]);
};
