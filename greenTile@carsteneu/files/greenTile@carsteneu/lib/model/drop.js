/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * drop model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Drag-and-drop zone split. Edge bands of a drop target's cell in fractions of the
 * cell size; a corner goes to the axis with the smaller relative distance.
 */
var DROP_EDGE = 0.25;
/**
 * Zone under the pointer in the cell [x, y, w, h]: 'top'|'bottom'|'left'|'right'
 * inside the edge band, 'center' otherwise, null when the pointer is outside.
 * @param {Rect} cell
 * @param {number} px
 * @param {number} py
 * @returns {'top' | 'bottom' | 'left' | 'right' | 'center' | null}
 */
var dropZone = (cell, px, py) => {
    const [x, y, w, h] = cell;
    if (px < x || px >= x + w || py < y || py >= y + h) {
        return null;
    }
    const bands = (/** @type {Array<[string, number]>} */ ([
        ['left', (px - x) / w],
        ['right', (x + w - px) / w],
        ['top', (py - y) / h],
        ['bottom', (y + h - py) / h],
    ])).filter(([, d]) => d < DROP_EDGE);
    if (bands.length === 0) {
        return 'center';
    }
    let best = bands[0];
    for (const b of bands.slice(1))
        {if (b[1] < best[1])
            {best = b;}}
    return (/** @type {'top' | 'bottom' | 'left' | 'right'} */ (best[0]));
};
/**
 * New layout when A (window index from, or -1 for a drop from another monitor) lands
 * on zone of B (index to) in the layout kind + shape (reading order indexes).
 * cols: top/bottom stack A into B's column, left/right open a new column; rows
 * mirrored. null for center, self-drop, unknown input or when nothing would change.
 * @param {string} kind
 * @param {readonly number[]} shape
 * @param {number} from
 * @param {number} to
 * @param {string} zone
 * @returns {{ kind: 'cols' | 'rows', shape: readonly number[], order: number[] } | null}
 */
var dropLayout = (kind, shape, from, to, zone) => {
    if (kind !== 'cols' && kind !== 'rows') {
        return null;
    }
    if (zone !== 'top' && zone !== 'bottom' && zone !== 'left' && zone !== 'right') {
        return null;
    }
    if (from === to) {
        return null;
    }
    /** @type {number[][]} */
    const groups = [];
    let next = 0;
    for (const k of shape) {
        const g = [];
        for (let i = 0; i < k; i++) {
            g.push(next++);
        }
        groups.push(g);
    }
    if (from < 0) {
        from = next;
    }
    for (let i = 0; i < groups.length; i++) {
        const at = groups[i].indexOf(from);
        if (at !== -1) {
            groups[i].splice(at, 1);
            if (groups[i].length === 0) {
                groups.splice(i, 1);
            }
            break;
        }
    }
    let bi = -1;
    let bpos = -1;
    for (let i = 0; i < groups.length && bi === -1; i++) {
        const at = groups[i].indexOf(to);
        if (at !== -1) {
            bi = i;
            bpos = at;
        }
    }
    if (bi === -1) {
        return null;
    }
    const alongAxis = (kind === 'cols') === (zone === 'top' || zone === 'bottom');
    const after = zone === 'bottom' || zone === 'right';
    if (alongAxis) {
        groups[bi].splice(after ? bpos + 1 : bpos, 0, from);
    }
    else {
        groups.splice(after ? bi + 1 : bi, 0, [from]);
    }
    const order = groups.reduce((a, g) => a.concat(g), []);
    const newShape = groups.map((g) => g.length);
    const identity = order.every((v, i) => v === i);
    const sameShape = newShape.length === shape.length && newShape.every((v, i) => v === shape[i]);
    if (sameShape && identity) {
        return null;
    }
    return { kind: kind, shape: newShape, order: order };
};
/**
 * Equal division of the usable area (gap included) stays at or above minPx in both axes.
 * @param {string} kind
 * @param {readonly number[]} shape
 * @param {number} width
 * @param {number} height
 * @param {number} gap
 * @param {number} minPx
 * @returns {boolean}
 */
var dropFits = (kind, shape, width, height, gap, minPx) => {
    const widest = Math.max.apply(null, /** @type {number[]} */ (/** @type {unknown} */ (shape)));
    const cols = kind === 'cols';
    const major = (cols ? width : height) / shape.length - gap;
    const minor = (cols ? height : width) / widest - gap;
    return major >= minPx && minor >= minPx;
};
