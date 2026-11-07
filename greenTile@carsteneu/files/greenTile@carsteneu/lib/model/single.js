/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * single model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * What happens to a lone tiled window (setting singleWindowMode, a select):
 *
 * - 'leave'  the window is not placed at all.
 * - 'fill'   it fills the whole usable area (singleLayout).
 * - 'center' it is placed centered — golden-ratio width, 90 % height, equal
 *            margins (singleCenterLayout).
 *
 * singleMode normalises a stored value — anything that is not a known mode
 * reads as 'leave', so a corrupt or legacy value never tiles a lone window by
 * accident. singleActive is the n guard the tiling reads: only exactly one
 * window, and only off 'leave'. singleBase picks the layout for the active
 * mode (the fallback of 'fill' and of every unknown case is the full area).
 * @param {any} raw
 * @returns {'leave' | 'fill' | 'center'}
 */
var singleMode = (raw) => (raw === 'fill' || raw === 'center') ? raw : 'leave';
/**
 * @param {any} raw
 * @param {number} n
 * @returns {boolean}
 */
var singleActive = (raw, n) => n === 1 && singleMode(raw) !== 'leave';
/**
 * Whether single-window mode must leave this lone window alone: the mode is
 * active, but the window is already maximized (both directions) or fullscreen —
 * the user's own full-area placement. Placing it would unmaximize it first
 * (windowReset, lib/tiling/windows.js) and shrink it into the centered frame or
 * re-fill it, undoing a deliberate maximize for nothing. A window maximized in
 * only ONE direction does not count: tiling still owns its other axis. Only the
 * mode's own lone placement is affected — a landing that passes an explicit
 * actionLayout (the split/drop route) and any count of two or more place as
 * before.
 * @param {any} raw singleWindowMode value
 * @param {number} n
 * @param {boolean} maximized the lone window is maximized in both directions or fullscreen
 * @returns {boolean}
 */
var singleLeavesMaximized = (raw, n, maximized) => singleActive(raw, n) && maximized;
var singleLayout = Object.freeze({ kind: 'rows', shape: Object.freeze([1]) });

/** Share of the usable width a centered window keeps (the golden ratio 1/φ). */
var SINGLE_CENTER_WIDTH = 0.6180339887;
/** Share of the usable height a centered window keeps. */
var SINGLE_CENTER_HEIGHT = 0.9;
/**
 * The centered window's frame: golden-ratio width, 90 % height, its margins
 * equal on each axis. Width and height round, the offsets floor, so the frame
 * stays inside the usable area (1920x1040 -> [366, 52, 1187, 936]).
 * @param {Rect} area
 * @returns {Rect}
 */
var singleCenterRect = (area) => {
    const [ax, ay, aw, ah] = area;
    const w = Math.round(aw * SINGLE_CENTER_WIDTH);
    const h = Math.round(ah * SINGLE_CENTER_HEIGHT);
    return /** @type {Rect} */ ([ax + Math.floor((aw - w) / 2), ay + Math.floor((ah - h) / 2), w, h]);
};
/**
 * The layout of a centered lone window. The window gap is deliberately NOT
 * subtracted on top of the golden margins — the margins dwarf any gap. The
 * layout therefore carries the centered frame OUTSET by the gap as its `area`:
 * the gap handling (lib/model/gap.js gapCell) subtracts that outset again, so the
 * placed frame is singleCenterRect. The cancellation needs the margins to exceed
 * half the gap, because gapCell insets a side only while it differs by 1 px or
 * more; in the narrow band just below that (usable height about ten times the gap
 * — 480 px at gap 48 — or a usable width under ~130 px) a side keeps its outset
 * and the window grows by up to the gap. Desktop sizes are exact.
 *
 * An application minimum larger than the frame is not overruled: the window then
 * grows from the frame's top-left corner, exactly like a full-area single window
 * that refuses to shrink. The fit machinery raises cell sizes, never re-centers a
 * refused frame, so a very large minimum can push the window off center.
 *
 * `area` also reaches the placement record (lib/tiling/place.js); re-applying a
 * stored manual split is guarded by splitValid, and no split can be stored for a
 * shape of one cell, so a lone window never re-applies one.
 * @param {Rect} area
 * @param {number} gap
 * @returns {Layout}
 */
var singleCenterLayout = (area, gap) => {
    const [x, y, w, h] = singleCenterRect(area);
    const lead = Math.floor(gap / 2);
    return { kind: 'rows', shape: [1], area: /** @type {Rect} */ ([x - lead, y - lead, w + gap, h + gap]) };
};
/**
 * @param {'leave' | 'fill' | 'center'} mode
 * @param {Rect} area
 * @param {number} gap
 * @returns {Layout}
 */
var singleBase = (mode, area, gap) => (mode === 'center' ? singleCenterLayout(area, gap) : singleLayout);
