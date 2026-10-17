/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * editor model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Preset editor model. A rule is {min, stacks} with an optional parallel `spans`
 * (grid columns a painted column covers, 1 when absent); stacks[i] = windows stacked
 * in column i. The painter grid of the approved prototype has 6 columns and 4 rows.
 */
/** Painter grid width, in columns. */
var editorCols = 6;
/** Painter grid height, in rows (and thus the highest stack). */
var editorRows = 4;
/** Smallest min value a rule can carry. */
var editorMinFloor = 2;
/** Largest min value a rule can carry. */
var editorMinCeiling = 50;
/**
 * Floor(v), clamped into [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
var editorClampInt = (v, lo, hi) => Math.min(Math.max(Math.floor(v), lo), hi);
/**
 * Stacks trimmed to editorCols columns, every stack clamped to [1, editorRows];
 * at least one column stays.
 * @param {number[]} stacks
 * @returns {number[]}
 */
var editorClamp = (stacks) => {
    const next = stacks.slice(0, editorCols).map((s) => editorClampInt(s, 1, editorRows));
    return next.length ? next : [1];
};
/**
 * Spans of the painted columns: exactly `len` entries, every one a finite integer in
 * [1, editorCols]; a missing, non-finite or below-one entry reads as one, so a rule
 * without the field spans one grid column per painted column.
 * @param {any} spans
 * @param {number} len
 * @returns {number[]}
 */
var editorSpans = (spans, len) => {
    const src = Array.isArray(spans) ? spans : [];
    const out = [];
    for (let i = 0; i < len; i++) {
        const v = Math.floor(Number(src[i]));
        out.push(Number.isFinite(v) && v >= 1 ? Math.min(v, editorCols) : 1);
    }
    return out;
};
/**
 * Column `col` holds `row + 1` windows; missing columns up to `col` get the same value.
 * @param {number[]} stacks
 * @param {number} col
 * @param {number} row
 * @returns {number[]}
 */
var editorPaint = (stacks, col, row) => {
    const c = editorClampInt(col, 0, editorCols - 1);
    const value = editorClampInt(row, 0, editorRows - 1) + 1;
    const next = stacks.slice(0, editorCols);
    while (next.length < c) {
        next.push(value);
    }
    next[c] = value;
    return next;
};
/**
 * Paints the same row over the columns from..to (inclusive), clamp-corrected.
 * @param {number[]} stacks
 * @param {number} from
 * @param {number} to
 * @param {number} row
 * @returns {number[]}
 */
var editorPaintRange = (stacks, from, to, row) => {
    const a = editorClampInt(Math.min(from, to), 0, editorCols - 1);
    const b = editorClampInt(Math.max(from, to), 0, editorCols - 1);
    let next = stacks.slice();
    for (let c = a; c <= b; c++) {
        next = editorPaint(next, c, row);
    }
    return next;
};
/**
 * Removes a column; the last remaining column is never removed.
 * @param {number[]} stacks
 * @param {number} col
 * @returns {number[]}
 */
var editorRemove = (stacks, col) => {
    const next = stacks.slice();
    if (next.length > 1 && col >= 0 && col < next.length) {
        next.splice(col, 1);
    }
    return next;
};
/**
 * Merges painted column `col` with its right neighbour: the left column keeps its
 * stack count and gains the neighbour's span, so the merged column is one painted
 * column over both grid widths. null without a right neighbour (last column, index
 * out of range).
 * @param {number[]} stacks
 * @param {any} spans
 * @param {number} col
 * @returns {{ stacks: number[], spans: number[] } | null}
 */
var editorMerge = (stacks, spans, col) => {
    if (!(col >= 0) || col + 1 >= stacks.length) {
        return null;
    }
    const nextSpans = editorSpans(spans, stacks.length);
    const nextStacks = stacks.slice();
    nextStacks.splice(col + 1, 1);
    nextSpans[col] = nextSpans[col] + nextSpans[col + 1];
    nextSpans.splice(col + 1, 1);
    return { stacks: nextStacks, spans: nextSpans };
};
/**
 * Splits one grid column off the right of the merged column `col`: its span loses one
 * and a new column holding one window follows. null when the column already spans one
 * grid column or the index is out of range.
 * @param {number[]} stacks
 * @param {any} spans
 * @param {number} col
 * @returns {{ stacks: number[], spans: number[] } | null}
 */
var editorSplit = (stacks, spans, col) => {
    if (!(col >= 0) || col >= stacks.length) {
        return null;
    }
    const nextSpans = editorSpans(spans, stacks.length);
    if (nextSpans[col] <= 1) {
        return null;
    }
    const nextStacks = stacks.slice();
    nextStacks.splice(col + 1, 0, 1);
    nextSpans[col] = nextSpans[col] - 1;
    nextSpans.splice(col + 1, 0, 1);
    return { stacks: nextStacks, spans: nextSpans };
};
/**
 * Rules sorted by min (ascending).
 * @param {Rule[]} rules
 * @returns {Rule[]}
 */
var editorSort = (rules) => rules.slice().sort((a, b) => a.min - b.min);
/**
 * Appends a new rule starting one min above the current last, or the initial rule
 * when none exist; at the editorMinCeiling nothing is added. Spans are carried along
 * (the copy spans the columns it was painted with) and stay absent when the source
 * rule has none.
 * @param {Rule[]} rules
 * @returns {{ rules: Rule[], index: number }} updated rule list and index of the new rule
 */
var editorAddRule = (rules) => {
    const sorted = editorSort(rules);
    const last = sorted[sorted.length - 1];
    if (!last) {
        return { rules: [{ min: editorMinFloor, stacks: [1, 1] }], index: 0 };
    }
    if (last.min >= editorMinCeiling) {
        return { rules: sorted, index: sorted.length - 1 };
    }
    /** @type {Rule} */
    const copy = { min: last.min + 1, stacks: last.stacks.slice() };
    if (last.spans) {
        copy.spans = last.spans.slice();
    }
    return { rules: sorted.concat([copy]), index: sorted.length };
};
/**
 * Deletes the rule at index; the last remaining rule is never deleted.
 * @param {Rule[]} rules
 * @param {number} index
 * @returns {{ rules: Rule[], index: number }} updated list and the index to select
 */
var editorDeleteRule = (rules, index) => {
    if (rules.length <= 1 || index < 0 || index >= rules.length) {
        return { rules: rules.slice(), index: editorClampInt(index, 0, Math.max(rules.length - 1, 0)) };
    }
    const next = rules.slice();
    next.splice(index, 1);
    return { rules: next, index: Math.min(index, next.length - 1) };
};
/**
 * Moves the threshold of rule `index` by delta and skips values used by other rules.
 * The stacks and their spans travel with the rule.
 * @param {Rule[]} rules
 * @param {number} index
 * @param {number} delta
 * @returns {{ rules: Rule[], index: number }} updated list and the rule's new position
 */
var editorStepMin = (rules, index, delta) => {
    const used = rules.filter((r, i) => i !== index).map((r) => r.min);
    let min = rules[index].min + delta;
    while (used.indexOf(min) !== -1) {
        min += delta;
    }
    if (min < editorMinFloor || min > editorMinCeiling) {
        return { rules: rules.slice(), index };
    }
    /** @type {Rule} */
    const edited = { min, stacks: rules[index].stacks.slice() };
    if (rules[index].spans) {
        edited.spans = /** @type {number[]} */ (rules[index].spans).slice();
    }
    const sorted = editorSort(rules.map((r, i) => (i === index ? edited : r)));
    return { rules: sorted, index: sorted.indexOf(edited) };
};
/**
 * A draft is valid when it has a name; returns null or the name of the invalid field.
 * @param {{ name?: string }} draft
 * @returns {'name' | null}
 */
var editorValidate = (draft) => (String(draft.name || '').trim() ? null : 'name');
/**
 * The next free generated preset id ("p<max + 1>").
 * @param {Preset[]} presets
 * @returns {string}
 */
var editorNewId = (presets) => {
    let max = 0;
    for (const p of presets) {
        const found = /^p(\d+)$/.exec(String(p.id));
        if (found) {
            max = Math.max(max, parseInt(found[1], 10));
        }
    }
    return 'p' + (max + 1);
};
/**
 * Inserts or replaces a preset by id in the stored list.
 * @param {Preset[]} presets
 * @param {Preset} preset
 * @returns {Preset[]}
 */
var editorCommit = (presets, preset) => {
    const i = presets.findIndex((p) => p.id === preset.id);
    if (i === -1) {
        return presets.concat([preset]);
    }
    const next = presets.slice();
    next[i] = preset;
    return next;
};
/**
 * All presets except the one with the given id.
 * @param {Preset[]} presets
 * @param {string} id
 * @returns {Preset[]}
 */
var editorDeletePreset = (presets, id) => presets.filter((p) => p.id !== id);
