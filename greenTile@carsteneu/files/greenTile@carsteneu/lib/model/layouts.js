/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * layouts model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */


/**
 * Per monitor AND workspace layout assignments, stored in the string setting layouts:
 * { "<monitor key>": { "<workspace number from 1 | *>": { preset?: id, auto?: boolean, splits?: { "<window count>": split } } } }
 * (splits: movable borders, see split-model).
 * Missing entry/field: no preset, automatic tiling on exactly when a preset is assigned.
 * Nothing is inherited from other monitors or workspaces; invalid data is ignored on read.
 * @param {string} raw raw stored JSON, validated here
 * @returns {any} LayoutsMap when the JSON parses to a plain object, otherwise null
 */
var layoutsParse = (raw) => {
    if (raw == null || raw === '') {
        return {};
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (_e) {
        return null;
    }
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
};
/**
 * (monitor, workspace) entry resolved: the assigned preset id or null, and whether
 * automatic tiling is on (explicit auto, or no preset assigned).
 * @param {any} layouts raw stored layouts, validated here
 * @param {MonitorKey} mkey
 * @param {WsKey} wskey
 * @param {string[]} presetIds
 * @returns {{ preset: string | null, auto: boolean }}
 */
var layoutsEntry = (layouts, mkey, wskey, presetIds) => {
    const monitor = (layouts && typeof layouts === 'object' && !Array.isArray(layouts) ? layouts[mkey] : null) || {};
    const entry = (entry_ => (entry_ && typeof entry_ === 'object' ? entry_ : null) || {})(monitor[wskey]);
    let preset = null;
    if (typeof entry.preset === 'string' && presetIds.indexOf(entry.preset) !== -1) {
        preset = entry.preset;
    }
    const auto = typeof entry.auto === 'boolean' ? entry.auto : preset != null;
    return { preset: preset, auto: auto };
};
/**
 * Raw "splits" object of an entry ({ "<window count>": split }), {} when missing.
 * @param {any} layouts raw stored layouts, validated here
 * @param {MonitorKey} mkey
 * @param {WsKey} wskey
 * @returns {any}
 */
var layoutsSplits = (layouts, mkey, wskey) => {
    const isObject = (/** @type {any} */ v) => Object.prototype.toString.call(v) === '[object Object]';
    const monitor = isObject(layouts) && isObject(layouts[mkey]) ? layouts[mkey] : {};
    const entry = isObject(monitor[wskey]) ? monitor[wskey] : {};
    return isObject(entry.splits) ? entry.splits : {};
};
/**
 * Raw "shapes" object of an entry ({ "<window count>": { kind, shape } }), {} when
 * missing. Dragged layouts, see drop-model.
 * @param {any} layouts raw stored layouts, validated here
 * @param {MonitorKey} mkey
 * @param {WsKey} wskey
 * @returns {any}
 */
var layoutsShapes = (layouts, mkey, wskey) => {
    const isObject = (/** @type {any} */ v) => Object.prototype.toString.call(v) === '[object Object]';
    const monitor = isObject(layouts) && isObject(layouts[mkey]) ? layouts[mkey] : {};
    const entry = isObject(monitor[wskey]) ? monitor[wskey] : {};
    return isObject(entry.shapes) ? entry.shapes : {};
};
/**
 * Applies a patch (preset/auto/splits/shapes) to one (monitor, workspace) entry and
 * returns the updated deep copy; empty entries and monitors are dropped.
 * @param {any} layouts raw stored layouts, validated here
 * @param {MonitorKey} mkey
 * @param {WsKey} wskey
 * @param {any} patch raw patch, validated here
 * @returns {any}
 */
var layoutsSet = (layouts, mkey, wskey, patch) => {
    const next = JSON.parse(JSON.stringify(layouts && typeof layouts === 'object' ? layouts : {}));
    const monitor = Object.prototype.toString.call(next[mkey]) === '[object Object]' ? next[mkey] : {};
    const entry = Object.assign({}, monitor[wskey] || {});
    if (patch && 'preset' in patch) {
        if (patch.preset == null) {
            delete entry.preset;
        }
        else if (typeof patch.preset === 'string' && patch.preset) {
            entry.preset = patch.preset;
        }
    }
    if (patch && 'auto' in patch) {
        if (patch.auto == null) {
            delete entry.auto;
        }
        else if (typeof patch.auto === 'boolean') {
            entry.auto = patch.auto;
        }
    }
    // splits: null removes all; { "<window count>": split | null } sets/removes single
    // counts. The split objects are checked on read (splitValid), not here.
    if (patch && 'splits' in patch) {
        const isObject = (/** @type {any} */ v) => Object.prototype.toString.call(v) === '[object Object]';
        if (patch.splits === null) {
            delete entry.splits;
        }
        else if (isObject(patch.splits)) {
            const splits = isObject(entry.splits) ? Object.assign({}, entry.splits) : {};
            for (const count of Object.keys(patch.splits)) {
                if (!/^\d+$/.test(count)) {
                    continue;
                }
                const value = patch.splits[count];
                if (value === null) {
                    delete splits[count];
                }
                else if (isObject(value)) {
                    splits[count] = JSON.parse(JSON.stringify(value));
                }
            }
            if (Object.keys(splits).length === 0) {
                delete entry.splits;
            }
            else {
                entry.splits = splits;
            }
        }
    }
    // shapes: same patch semantics as splits (null removes all, single counts set/remove).
    // The shape objects are checked on read (shapeValid), not here.
    if (patch && 'shapes' in patch) {
        const isObject = (/** @type {any} */ v) => Object.prototype.toString.call(v) === '[object Object]';
        if (patch.shapes === null) {
            delete entry.shapes;
        }
        else if (isObject(patch.shapes)) {
            const shapes = isObject(entry.shapes) ? Object.assign({}, entry.shapes) : {};
            for (const count of Object.keys(patch.shapes)) {
                if (!/^\d+$/.test(count)) {
                    continue;
                }
                const value = patch.shapes[count];
                if (value === null) {
                    delete shapes[count];
                }
                else if (isObject(value)) {
                    shapes[count] = JSON.parse(JSON.stringify(value));
                }
            }
            if (Object.keys(shapes).length === 0) {
                delete entry.shapes;
            }
            else {
                entry.shapes = shapes;
            }
        }
    }
    if (Object.keys(entry).length === 0) {
        delete monitor[wskey];
    }
    else {
        monitor[wskey] = entry;
    }
    if (Object.keys(monitor).length === 0) {
        delete next[mkey];
    }
    else {
        next[mkey] = monitor;
    }
    return next;
};
/**
 * Removes every reference to a deleted preset id, same semantics as ✕ unassign:
 * the preset key goes, explicit auto/splits/shapes stay, empty entries and
 * monitors are dropped. Unknown ids leave the layouts untouched.
 * @param {any} layouts raw stored layouts, validated here
 * @param {string} presetId
 * @returns {any}
 */
var layoutsRemovePreset = (layouts, presetId) => {
    const isObject = (/** @type {any} */ v) => Object.prototype.toString.call(v) === '[object Object]';
    const next = JSON.parse(JSON.stringify(isObject(layouts) ? layouts : {}));
    for (const mkey of Object.keys(next)) {
        if (!isObject(next[mkey])) {
            continue;
        }
        for (const wskey of Object.keys(next[mkey])) {
            const entry = next[mkey][wskey];
            if (!isObject(entry) || entry.preset !== presetId) {
                continue;
            }
            delete entry.preset;
            if (Object.keys(entry).length === 0) {
                delete next[mkey][wskey];
            }
        }
        if (Object.keys(next[mkey]).length === 0) {
            delete next[mkey];
        }
    }
    return next;
};
/**
 * A dragged layout { kind, shape } is valid for n windows when every part is an
 * integer >= 1 and the parts sum to n. Normalised copy, null otherwise.
 * @param {any} value raw stored shape, validated here
 * @param {number} n
 * @returns {DragLayout | null}
 */
var shapeValid = (value, n) => {
    if (value == null || typeof value !== 'object') {
        return null;
    }
    if (value.kind !== 'cols' && value.kind !== 'rows') {
        return null;
    }
    const shape = Array.isArray(value.shape) ? value.shape : [];
    if (shape.length === 0 || !shape.every((/** @type {number} */ k) => Number.isInteger(k) && k >= 1)) {
        return null;
    }
    if (shape.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) !== n) {
        return null;
    }
    return { kind: value.kind, shape: shape.slice() };
};
/**
 * A valid stored shape wins over the base layout (same rule/preset metadata, other
 * kind + shape); without a base or with an invalid/missing shape the base stands.
 * @param {DragLayout | null} base
 * @param {any} stored raw stored shape, validated by shapeValid
 * @param {number} n
 * @returns {Layout | null}
 */
var layoutResolve = (base, stored, n) => {
    const shape = shapeValid(stored, n);
    if (!base || !shape) {
        return base;
    }
    return Object.assign({}, base, shape);
};
