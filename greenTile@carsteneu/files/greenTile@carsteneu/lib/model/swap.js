/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * swap model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Keyboard window swapping (Super+Ctrl+Arrow). Cells are rects [x, y, width, height] in
 * placement order, dir one of 'left'|'right'|'up'|'down'. The neighbor search prefers
 * cells overlapping on the perpendicular axis (the swap lands at "the same height"),
 * then takes the nearest cell in the direction.
 * @param {string} dir
 * @returns {boolean}
 */
var swapDirOk = (dir) => dir === 'left' || dir === 'right' || dir === 'up' || dir === 'down';
/**
 * Axis a direction acts on: 0 = x for left/right, 1 = y for up/down.
 * @param {string} dir
 * @returns {number}
 */
var swapAxis = (dir) => (dir === 'left' || dir === 'right') ? 0 : 1;
/**
 * Sign of a direction along its axis: +1 for right/down, -1 for left/up.
 * @param {string} dir
 * @returns {number}
 */
var swapSign = (dir) => (dir === 'right' || dir === 'down') ? 1 : -1;
/**
 * Overlap of two rects' extents along the given axis, in px.
 * @param {Rect} a
 * @param {Rect} b
 * @param {number} axis
 * @returns {number}
 */
var swapOverlap = (a, b, axis) => Math.min(a[axis] + a[axis + 2], b[axis] + b[axis + 2]) - Math.max(a[axis], b[axis]);
/**
 * Centre coordinate of a rect along the given axis.
 * @param {Rect} r
 * @param {number} axis
 * @returns {number}
 */
var swapCenter = (r, axis) => r[axis] + r[axis + 2] / 2;
/**
 * Index of the cell a swap in the given direction lands on: among the cells beyond
 * self's centre those with perpendicular overlap, then the nearest in direction.
 * @param {Rect[]} cells
 * @param {number} self index of the moving window's cell
 * @param {string} dir
 * @returns {number | null}
 */
var swapNeighbor = (cells, self, dir) => {
    if (!swapDirOk(dir) || self == null || self < 0 || self >= cells.length) {
        return null;
    }
    const d = swapAxis(dir);
    const p = 1 - d;
    const sign = swapSign(dir);
    const own = cells[self];
    const ownCenter = swapCenter(own, d);
    let pool = [];
    for (let i = 0; i < cells.length; i++) {
        if (i === self) {
            continue;
        }
        const c = swapCenter(cells[i], d);
        if (sign > 0 ? c > ownCenter : c < ownCenter) {
            pool.push(i);
        }
    }
    if (pool.length === 0) {
        return null;
    }
    const overlapping = pool.filter((i) => swapOverlap(own, cells[i], p) > 0);
    if (overlapping.length) {
        pool = overlapping;
    }
    pool.sort((a, b) => {
        const da = (cells[a][d] - own[d]) * sign;
        const db = (cells[b][d] - own[d]) * sign;
        const oa = swapOverlap(own, cells[a], p);
        const ob = swapOverlap(own, cells[b], p);
        return (da - db) || (ob - oa) || (cells[a][p] - cells[b][p]) || (a - b);
    });
    return pool[0];
};
/**
 * Landing slot when a window is pushed into a monitor edge slot (Super+Ctrl+Left/Right
 * across monitors or onto another workspace): the first (right)/last (left) cell of the
 * target layout, with several candidates on the edge column chosen by the best vertical
 * overlap with the moved window's frame, else the top one.
 * @param {Rect[]} cells
 * @param {Rect} frame
 * @param {string} dir
 * @returns {number | null}
 */
var swapLandingCell = (cells, frame, dir) => {
    if (cells.length === 0 || (dir !== 'left' && dir !== 'right')) {
        return null;
    }
    const right = dir === 'right';
    let edgeX = cells[0][0];
    for (const r of cells) {
        edgeX = right ? Math.min(edgeX, r[0]) : Math.max(edgeX, r[0]);
    }
    let pool = [];
    for (let i = 0; i < cells.length; i++) {
        if (cells[i][0] === edgeX) {
            pool.push(i);
        }
    }
    pool = pool.map((i) => ({ i: i, ov: swapOverlap(cells[i], frame, 1) }));
    const overlapping = pool.filter((c) => c.ov > 0);
    if (overlapping.length) {
        pool = overlapping;
    }
    else
        {pool.forEach((c) => (c.ov = 0));} // none overlaps: fall back to the top one
    pool.sort((a, b) => (b.ov - a.ov) || (cells[a.i][1] - cells[b.i][1]) || (a.i - b.i));
    return pool[0].i;
};
/**
 * One chain step for Super+Ctrl+Left/Right. Monitors ordered by geometry x; Left/Right
 * first stay within the same workspace (the neighbor search handles the in-layout swap,
 * this decides the cross-monitor landing), then continue onto the previous/next
 * workspace, landing in the edge slot of the rightmost/leftmost monitor. workspaces-
 * only-on-primary: the workspace step only anchors on the primary monitor (the only one
 * with a workspace dimension), so the landing monitor is the primary. No wrap.
 * @param {{ dir: string, monitorIndex: number, primaryIndex: number, onlyPrimary: boolean, monitors: Array<{ index: number, x: number, width: number }>, workspaces: number, wsIndex: number }} input
 * @returns {{ kind: 'monitor', to: number, monitor: number, slot: 'first' | 'last' } | { kind: 'workspace', delta: number, monitor: number, slot: 'first' | 'last' } | null}
 */
var swapChainStep = (input) => {
    const { dir, monitorIndex, primaryIndex, onlyPrimary, monitors, workspaces, wsIndex } = input;
    if (dir !== 'left' && dir !== 'right') {
        return null;
    }
    const cur = monitors.find((mo) => mo.index === monitorIndex);
    if (!cur) {
        return null;
    }
    const right = dir === 'right';
    const cand = monitors.filter((mo) => (right ? mo.x > cur.x : mo.x < cur.x));
    if (cand.length) {
        cand.sort((a, b) => (right ? a.x - b.x : b.x - a.x) || (a.index - b.index));
        return { kind: 'monitor', to: cand[0].index, monitor: cand[0].index, slot: right ? 'first' : 'last' };
    }
    if (onlyPrimary && monitorIndex !== primaryIndex) {
        return null;
    }
    const delta = right ? 1 : -1;
    const nextWs = wsIndex + delta;
    if (nextWs < 0 || nextWs >= workspaces) {
        return null;
    }
    const sorted = monitors.slice().sort((a, b) => (a.x - b.x) || (a.index - b.index));
    const edge = onlyPrimary
        ? monitors.find((mo) => mo.index === primaryIndex)
        : (right ? sorted[0] : sorted[sorted.length - 1]);
    if (!edge) {
        return null;
    }
    return { kind: 'workspace', delta: delta, monitor: edge.index, slot: right ? 'first' : 'last' };
};
