/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * monitor model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Stable monitor identity from the DisplayConfig tuple (connector, vendor, product,
 * serial): the key survives rearrangements and re-plugging, identical models are
 * separated by serial, and panels with a zero serial (typical laptop screens) by
 * the connector. Workspace key '*' covers all workspaces of non-primary monitors
 * when workspaces-only-on-primary is on.
 * @param {string} connector
 * @param {string} vendor
 * @param {string} product
 * @param {string} serial
 * @returns {MonitorKey}
 */
var monitorKey = (connector, vendor, product, serial) => {
    const base = vendor + '|' + product + '|' + serial;
    return (!serial || /^(0x)?0+$/.test(serial)) ? base + '|' + connector : base;
};
/**
 * Key for monitors the DisplayConfig data is unavailable for: the trusted name plus
 * the geometry, so it stays distinguishable from real identity keys.
 * @param {string} name
 * @param {number} width
 * @param {number} height
 * @returns {MonitorKey}
 */
var monitorFallbackKey = (name, width, height) => 'name:' + name + '|' + width + 'x' + height;
/**
 * Keys of the monitors currently wired (DisplayConfig triples), validated here.
 * @param {any} monitors raw DisplayConfig data, validated here
 * @returns {Array<{ connector: string, key: MonitorKey }>}
 */
var monitorStates = (monitors) => {
    if (!Array.isArray(monitors)) {
        return [];
    }
    /** @type {Array<{ connector: string, key: MonitorKey }>} */
    const states = [];
    for (const item of monitors) {
        if (!Array.isArray(item) || !Array.isArray(item[0]) || !item[0][0]) {
            continue;
        }
        const [connector, vendor, product, serial] = item[0];
        states.push({ connector: connector, key: monitorKey(connector, vendor, product, serial) });
    }
    return states;
};
/**
 * Workspace part of the layouts key: '*' for non-primary monitors when workspaces
 * exist on the primary only, otherwise the 1-based workspace number.
 * @param {number} wsIndex
 * @param {boolean} isPrimary
 * @param {boolean} onlyPrimary
 * @returns {WsKey}
 */
var monitorWsKey = (wsIndex, isPrimary, onlyPrimary) => {
    return (onlyPrimary && !isPrimary) ? '*' : String(wsIndex + 1);
};
/**
 * Human monitor names, disambiguated by connector (or position) on duplicates.
 * @param {string[]} names
 * @param {string[]} connectors
 * @returns {string[]}
 */
var monitorLabels = (names, connectors) => {
    const duplicate = (/** @type {string} */ name) => names.indexOf(name) !== names.lastIndexOf(name);
    return names.map((name, i) => {
        if (!duplicate(name)) {
            return name;
        }
        return name + ' (' + (connectors[i] || i + 1) + ')';
    });
};
