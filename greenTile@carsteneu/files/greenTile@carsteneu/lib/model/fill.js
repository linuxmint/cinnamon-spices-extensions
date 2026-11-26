/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * fill model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { editorCols, editorRows } = XLET.lib.model.editor;

/**
 * 100 % area rule: tiled windows always cover the whole usable area, no cell stays empty.
 * Layout of a painted rule for n windows. Surplus windows extend the last column. With
 * fewer windows the highest column loses one cell (on a tie the right one) until the
 * count fits; below one window per column, columns drop from the right. n < 1 returns
 * the painted rule (list thumbnail on an empty workspace).
 * @param {number[]} stacks
 * @param {number} n
 * @returns {number[]}
 */
var fillStacks = (stacks, n) => {
    // Corrupt preset data must never hang the fill: stack values and the column
    // count clamp into the editor grid (lib/model/editor), so the balancing
    // loops below always terminate on a bounded total.
    const out = (Array.isArray(stacks) ? stacks.slice(0, editorCols) : []).map((/** @type {any} */ s) => {
        const v = Math.floor(Number(s));
        return Number.isFinite(v) && v >= 1 ? Math.min(v, editorRows) : 1;
    });
    if (n < 1 || out.length === 0) {
        return out;
    }
    if (n < out.length) {
        return out.slice(0, n).map(() => 1);
    }
    let total = out.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    if (n >= total) {
        out[out.length - 1] += n - total;
        return out;
    }
    while (total > n) {
        let hi = 0;
        for (let c = 1; c < out.length; c++) {
            if (out[c] >= out[hi]) {
                hi = c;
            }
        }
        out[hi]--;
        total--;
    }
    return out;
};
/** Widest row of the wide automatic grid, in windows. */
var AUTO_ROW_MAX = 6;
/**
 * Wide automatic grid: up to AUTO_ROW_MAX windows side by side in one row, more
 * are spread evenly over ceil(n / max) rows, the upper rows take the surplus
 * (7 = 4+3, 9 = 5+4, 13 = 5+4+4). Every row spans the full width.
 * @param {number} n
 * @returns {number[]}
 */
var autoRows = (n) => {
    const count = Math.max(1, Math.ceil(n / AUTO_ROW_MAX));
    const base = Math.floor(n / count);
    const rem = n % count;
    const rows = [];
    for (let r = 0; r < count; r++) {
        rows.push(base + (r < rem ? 1 : 0));
    }
    return rows;
};
/**
 * Narrow automatic grid (below 2100 px, from 4 windows): 3 columns with balanced stacks,
 * full-height singles stay left (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2, 8 = 2·3·3).
 * @param {number} n
 * @returns {number[]}
 */
var autoNarrowStacks = (n) => {
    const base = Math.floor(n / 3);
    const rem = n % 3;
    return [base, base + (rem > 1 ? 1 : 0), base + (rem > 0 ? 1 : 0)];
};
