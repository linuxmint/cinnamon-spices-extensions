/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * panel-size model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * The preset panel can be resized with the grip in its bottom right corner, list and
 * editor separately. Setting panelSize: {"list": {"w", "h"}, "editor": {"w", "h"}};
 * w is the panel width, h the height of the part that stretches (list: the preset
 * rows, editor: the painter). Without a stored size the panel keeps its natural size.
 */
var PANEL_MIN = Object.freeze({ list: Object.freeze({ w: 600, h: 180 }), editor: Object.freeze({ w: 600, h: 136 }) });
/**
 * Whether a raw value is a panel size object with finite positive w and h.
 * @param {any} s raw size candidate, validated here
 * @returns {boolean}
 */
var panelSizeOk = (s) => s != null && typeof s === 'object'
    && typeof s.w === 'number' && Number.isFinite(s.w) && s.w > 0
    && typeof s.h === 'number' && Number.isFinite(s.h) && s.h > 0;
/**
 * Parsed panelSize setting object, or {} for anything unparsable.
 * @param {string} raw raw stored JSON, validated here
 * @returns {AnyRecord}
 */
var panelSizeObj = (raw) => {
    try {
        const v = JSON.parse(raw || '{}');
        return v != null && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }
    catch (_e) {
        return {};
    }
};
/**
 * Stored sizes of both views: { list, editor }, each a size or null when absent.
 * @param {string} raw raw stored JSON
 * @returns {AnyRecord}
 */
var panelSizeParse = (raw) => {
    const v = panelSizeObj(raw);
    return {
        list: panelSizeOk(v.list) ? { w: v.list.w, h: v.list.h } : null,
        editor: panelSizeOk(v.editor) ? { w: v.editor.w, h: v.editor.h } : null,
    };
};
/**
 * Sets the size of one view in the stored panelSize JSON and returns the result.
 * @param {string} raw raw stored JSON
 * @param {string} view 'list' | 'editor'
 * @param {{ w: number, h: number }} size
 * @returns {string}
 */
var panelSizeSet = (raw, view, size) => {
    const parsed = panelSizeParse(raw);
    /** @type {AnyRecord} */
    const next = {};
    for (const key of ['list', 'editor']) {
        if (parsed[key]) {
            next[key] = parsed[key];
        }
    }
    next[view] = { w: Math.round(size.w), h: Math.round(size.h) };
    return JSON.stringify(next);
};
/**
 * Clamps a panel size into the minimum and the given monitor room (min wins when
 * the room is smaller), rounded to whole px.
 * @param {{ w: number, h: number }} size
 * @param {{ w: number, h: number }} min
 * @param {{ w: number, h: number }} max
 * @returns {{ w: number, h: number }}
 */
var panelSizeClamp = (size, min, max) => ({
    w: Math.round(Math.max(Math.min(size.w, max.w), min.w)),
    h: Math.round(Math.max(Math.min(size.h, max.h), min.h)),
});
