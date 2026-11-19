/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * exclude model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Windows that are never tiled: rows of the exclusions list setting
 * ({ match: "class" | "title" | "app", text }) match by WM_CLASS (equals, the instance variant
 * counts too) or window title (contains) or the Cinnamon app id of the window (equals,
 * via WindowTracker — robust where WM classes lie, e.g. flatpaks). An app row also matches
 * when the picked app's StartupWMClass equals the window's WM_CLASS or instance — the
 * WindowTracker may map the window to a different .desktop entry of the same program
 * (NoDisplay launchers, Xwayland siblings), and the StartupWMClass still identifies it,
 * case-insensitive in every variant; rows with empty text or an unknown match are ignored.
 * On top, Super+G toggles the focused window ad hoc — in-memory only, per window,
 * forgotten when the window is unmanaged.
 * @param {any} rows raw stored list setting, validated here
 * @returns {ExclRow[]}
 */
var exclRowsNormalize = (rows) => {
    if (!Array.isArray(rows)) {
        return [];
    }
    /** @type {ExclRow[]} */
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row == null || typeof row !== 'object') {
            continue;
        }
        const text = typeof row.text === 'string' ? row.text.trim() : '';
        if ((row.match !== 'class' && row.match !== 'title' && row.match !== 'app') || !text) {
            continue;
        }
        result.push({ match: row.match, text: text });
    }
    return result;
};
/**
 * Whether a window matches the exclusion rows: rows of kind "class" compare the
 * WM class and instance, "title" is contained in the title, "app" compares the
 * Cinnamon app id or one of its StartupWMClass candidates.
 * @param {string | null} wmClass
 * @param {string | null} wmInstance
 * @param {string | null} title
 * @param {ExclRow[]} rows
 * @param {string | null} appId
 * @param {AnyRecord | null} appClasses StartupWMClass candidates by row text
 * @returns {boolean}
 */
var exclMatch = (wmClass, wmInstance, title, rows, appId, appClasses) => {
    const t = typeof title === 'string' ? title.toLowerCase() : '';
    const id = typeof appId === 'string' ? appId.toLowerCase() : '';
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.match === 'class') {
            if ((typeof wmClass === 'string' && wmClass.toLowerCase() === row.text.toLowerCase())
                || (typeof wmInstance === 'string' && wmInstance.toLowerCase() === row.text.toLowerCase())) {
                    return true;
                }
        }
        else if (row.match === 'title' && t && t.indexOf(row.text.toLowerCase()) !== -1) {
            return true;
        }
        else if (row.match === 'app') {
            if (id && id === row.text.toLowerCase()) {
                return true;
            }
            const swc = appClasses ? appClasses[row.text] : null;
            if (typeof swc === 'string' && swc) {
                const s = swc.toLowerCase();
                if ((typeof wmClass === 'string' && wmClass.toLowerCase() === s)
                    || (typeof wmInstance === 'string' && wmInstance.toLowerCase() === s)) {
                        return true;
                    }
            }
        }
    }
    return false;
};
/**
 * Appends an app exclusion row (the settings-dialog app picker) unless an identical
 * app row is already there.
 * @param {any} rows current stored rows
 * @param {string} text
 * @returns {ExclRow[]}
 */
var exclRowsAppend = (rows, text) => {
    const result = exclRowsNormalize(rows);
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t) {
        return result;
    }
    for (let i = 0; i < result.length; i++) {
        if (result[i].match === 'app' && result[i].text === t) {
            return result;
        }
    }
    result.push({ match: 'app', text: t });
    return result;
};
/**
 * Combobox options for the app picker: label to app id, sorted alphabetically;
 * the placeholder comes first. Duplicate labels keep the first app. A null-prototype
 * object keeps apps named like inherited Object.prototype properties ("constructor")
 * in the picker instead of colliding with them.
 * @param {any} apps raw app list, validated here
 * @param {string} placeholderLabel
 * @returns {AnyRecord}
 */
var exclAppOptions = (apps, placeholderLabel) => {
    /** @type {Array<{ id: string, name: string }>} */
    const list = [];
    if (Array.isArray(apps)) {
        for (let i = 0; i < apps.length; i++) {
            const app = apps[i];
            if (app && typeof app.id === 'string' && app.id && typeof app.name === 'string' && app.name) {
                list.push({ id: app.id, name: app.name });
            }
        }
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    const options = Object.create(null);
    if (typeof placeholderLabel === 'string' && placeholderLabel) {
        options[placeholderLabel] = 'picker';
    }
    for (let i = 0; i < list.length; i++) {
        if (options[list[i].name] === undefined) {
            options[list[i].name] = list[i].id;
        }
    }
    return options;
};
/**
 * Sets or clears the ad hoc exclusion toggle of one window (by sequence number).
 * @param {Map<number, boolean>} map
 * @param {number} seq
 * @param {boolean} on
 * @returns {void}
 */
var exclToggleSet = (map, seq, on) => {
    if (on) {
        map.set(seq, true);
    }
    else {
        map.delete(seq);
    }
};
