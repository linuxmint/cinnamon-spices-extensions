/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * gettext binding: the `_` identifier is the xgettext keyword
 * (cinnamon-xlet-makepot scans all .js files recursively, so these strings are
 * found without makepot changes). Translations ship to and load from the XDG
 * data dir (install.sh mirrors this; no migration of existing files).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const UUID = 'greenTile@carsteneu';
/**
 * @param {string} str
 * @returns {string}
 */
function _(str) {
    // imports read inside the call, not at module level: the native module
    // graph evaluates on import and the test harness swaps fake environments
    // per test — an eager binding would pin the first environment
    const Gettext = imports.gettext;
    const GLib = imports.gi.GLib;
    Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + '/locale');
    const customTranslation = Gettext.dgettext(UUID, str);
    if (customTranslation !== str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}
