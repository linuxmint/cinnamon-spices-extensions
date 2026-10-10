/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * The single place that contains persisted settings key strings. The .po msgids
 * come from settings-schema.json and Cinnamon keeps stored user values
 * only for identical keys (settings.js _doUpgrade), so a key rename must be a
 * conscious edit here and in the schema, never a scattered textual change.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// One constant per persisted schema key (the "layout" dialogue structure entry
// is not a persisted key). The values are the schema keys themselves.
var SETTINGS_KEYS = Object.freeze({
    columns6Hotkey: 'columns6Hotkey',
    columns3Hotkey: 'columns3Hotkey',
    autoOnHotkey: 'autoOnHotkey',
    autoOffHotkey: 'autoOffHotkey',
    presetHotkey: 'presetHotkey',
    resizeWiderHotkey: 'resizeWiderHotkey',
    resizeNarrowerHotkey: 'resizeNarrowerHotkey',
    resizeTallerHotkey: 'resizeTallerHotkey',
    resizeShorterHotkey: 'resizeShorterHotkey',
    swapLeftHotkey: 'swapLeftHotkey',
    swapRightHotkey: 'swapRightHotkey',
    swapUpHotkey: 'swapUpHotkey',
    swapDownHotkey: 'swapDownHotkey',
    presets: 'presets',
    starterPresetsImported: 'starterPresetsImported',
    starterGeneration: 'starterGeneration',
    excludeHotkey: 'excludeHotkey',
    excludeAppPicker: 'excludeAppPicker',
    exclusions: 'exclusions',
    // One-time marker for the built-in exclusion seed (Config._seedExclusionDefaults).
    exclusionsSeeded: 'exclusionsSeeded',
    layouts: 'layouts',
    panelSize: 'panelSize',
    windowGap: 'windowGap',
    tileAnimation: 'tileAnimation',
    focusBorder: 'focusBorder',
    // Hidden since the select replaced it: kept in the schema so Cinnamon's
    // _doUpgrade preserves the stored boolean, read once by the migration.
    fillSingleWindow: 'fillSingleWindow',
    singleWindowMode: 'singleWindowMode',
    singleWindowMigrated: 'singleWindowMigrated',
    panelTheme: 'panelTheme',
    accentMode: 'accentMode',
    accentColor: 'accentColor',
    stateMode: 'stateMode',
    stateColor: 'stateColor',
});
