/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Restart order store: the per-surface window order (monitor key + workspace
 * key -> list of X11 window descriptions) that the startup retile restores
 * after a Cinnamon restart. The content lives in the user's runtime dir and is
 * therefore untrusted input: parse, validation, caps and the reorder are pure
 * and defensive, so a foreign or hand-edited file can only ever be ignored.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// On-disk schema version. A future change bumps it and old files are ignored.
var ORDER_VERSION = 1;
// Bounds: a surface keeps at most this many window ids, the file at most this
// many surfaces (the file must never grow with the session).
var ORDER_MAX_PER_SURFACE = 64;
var ORDER_MAX_SURFACES = 64;
// A surface key is a monitor key plus a workspace key; anything longer is not a
// key this code produced (the file is untrusted).
var ORDER_MAX_KEY = 256;
// The whole file is read before it is parsed, so its size is bounded too: a store
// this code wrote stays far below this, and a file above it is not parsed at all.
var ORDER_MAX_BYTES = 256 * 1024;
// An X11 window description (MetaWindow.get_description()), e.g. "0x6a00004".
// Wayland windows have no description, and a foreign id can never match a
// window we place, so a strict hex pattern is the whole identity test.
var ORDER_ID_RE = /^0x[0-9a-fA-F]{1,16}$/;

/**
 * The storage key of a (monitor, workspace) surface — the same join the layout
 * store uses, so both address a surface identically.
 * @param {MonitorKey} mkey
 * @param {WsKey} wskey
 * @returns {string}
 */
var orderKey = (mkey, wskey) => mkey + '\n' + wskey;

/**
 * @param {unknown} id
 * @returns {boolean}
 */
var orderItemValid = (id) => typeof id === 'string' && ORDER_ID_RE.test(id);

/**
 * The validated id list of one surface: only X11 hex descriptions, deduplicated
 * (first occurrence wins) and capped. Returns null when too few remain to be an
 * order.
 * @param {unknown} raw
 * @returns {string[] | null}
 */
var orderIds = (raw) => {
    if (!Array.isArray(raw)) {
        return null;
    }
    /** @type {string[]} */
    const out = [];
    for (const id of raw) {
        if (out.length >= ORDER_MAX_PER_SURFACE) {
            break;
        }
        if (orderItemValid(id) && out.indexOf(id) === -1) {
            out.push(id);
        }
    }
    return out.length >= 2 ? out : null;
};

/**
 * Parses the stored JSON. Returns null for anything that is not this schema —
 * the caller logs that once and treats the store as empty, never as an error
 * that could break tiling.
 * @param {unknown} text
 * @returns {{ v: number, s: Record<string, string[]> } | null}
 */
var orderParse = (text) => {
    if (typeof text !== 'string') {
        return null;
    }
    /** @type {any} */
    let data;
    try {
        data = JSON.parse(text);
    }
    catch (_e) {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)
        || data.v !== ORDER_VERSION || !data.s || typeof data.s !== 'object' || Array.isArray(data.s)) {
        return null;
    }
    /** @type {Record<string, string[]>} */
    // No prototype: the file is untrusted, so a "__proto__" key in it must become
    // an ordinary (ignored) property instead of reaching an inherited setter.
    const s = Object.create(null);
    let count = 0;
    for (const key of Object.keys(data.s)) {
        if (count >= ORDER_MAX_SURFACES) {
            break;
        }
        if (typeof key !== 'string' || key.length === 0 || key.length > ORDER_MAX_KEY) {
            continue;
        }
        const ids = orderIds(data.s[key]);
        if (ids) {
            s[key] = ids;
            count++;
        }
    }
    return { v: ORDER_VERSION, s: s };
};

/**
 * The order stored for a surface, or null when there is none. A copy, so a
 * caller cannot alias the store.
 * @param {{ v: number, s: Record<string, string[]> } | null} store
 * @param {string} key
 * @returns {string[] | null}
 */
var orderGet = (store, key) => {
    const ids = store && store.s ? store.s[key] : null;
    return ids ? ids.slice() : null;
};

/**
 * Returns a NEW store with that surface set to the valid ids (or removed when
 * fewer than two remain). Other surfaces keep their position, so setting the
 * same order again yields an identical store (and thus writes nothing); the
 * input store is never mutated. New surfaces append while the cap allows.
 * @param {{ v: number, s: Record<string, string[]> } | null} store
 * @param {string} key
 * @param {unknown[]} ids
 * @returns {{ v: number, s: Record<string, string[]> }}
 */
var orderSet = (store, key, ids) => {
    const clean = key.length > 0 && key.length <= ORDER_MAX_KEY ? orderIds(ids) : null;
    const other = store && store.s ? store.s : {};
    /** @type {Record<string, string[]>} */
    // No prototype: the file is untrusted, so a "__proto__" key in it must become
    // an ordinary (ignored) property instead of reaching an inherited setter.
    const s = Object.create(null);
    let count = 0;
    let placed = clean === null;
    for (const k of Object.keys(other)) {
        if (count >= ORDER_MAX_SURFACES) {
            break;
        }
        if (k === key) {
            if (clean !== null) {
                s[k] = clean;
                count++;
                placed = true;
            }
            continue;
        }
        s[k] = other[k];
        count++;
    }
    if (!placed && clean !== null && count < ORDER_MAX_SURFACES) {
        s[key] = clean;
    }
    return { v: ORDER_VERSION, s: s };
};

/**
 * Reorders an already reading-ordered window list: the windows whose description
 * appears in `ids` come first, in the stored order, and every other window keeps
 * its incoming relative position after them. Unknown ids and windows without a
 * description therefore never lose their place — a surface with no match at all
 * keeps today's reading order.
 * @param {string[] | null} ids
 * @param {CinnamonWindow[]} windows
 * @param {(w: CinnamonWindow) => string | null} descOf
 * @returns {CinnamonWindow[]}
 */
var orderSort = (ids, windows, descOf) => {
    if (!ids || ids.length < 2) {
        return windows.slice();
    }
    /** @type {Map<string, CinnamonWindow>} */
    const byDesc = new Map();
    for (const w of windows) {
        const desc = descOf(w);
        if (typeof desc === 'string' && !byDesc.has(desc)) {
            byDesc.set(desc, w);
        }
    }
    /** @type {CinnamonWindow[]} */
    const lead = [];
    const used = new Set();
    for (const id of ids) {
        const w = byDesc.get(id);
        if (w && !used.has(w)) {
            lead.push(w);
            used.add(w);
        }
    }
    if (lead.length === 0) {
        return windows.slice();
    }
    for (const w of windows) {
        if (!used.has(w)) {
            lead.push(w);
        }
    }
    return lead;
};
