/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * theme model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Cairo colors for the thumbnails, the painter's dashed outline and the painter's handle
 * ink, per theme; the CSS classes cover the rest. Thumbs stand somewhat (not
 * dramatically) apart from the panel background: #1c1f28 in dark, #f6f7fa in light —
 * thumb contrast 1.70→2.04 (dark, lighter) and 1.49→1.76 (light, darker) against the
 * panel. The outline pairs with the CSS border tokens (#2a2e39 / #c3c9d6) and stays.
 * `painter` is the .gk-painter background the painted columns are drawn over and the
 * gap between two columns shows (stylesheet.css: #14161d dark, #e8ebf1 light) — the
 * painter needs it to pick an ink that contrasts with what it actually paints on, and
 * cairo cannot read the stylesheet.
 */
var THEME_CAIRO = Object.freeze({
    dark: Object.freeze({ thumb: [72, 80, 100], outline: [42, 46, 57], painter: [20, 22, 29] }),
    light: Object.freeze({ thumb: [183, 189, 204], outline: [195, 201, 214], painter: [232, 235, 241] }),
});

/**
 * The preset panel follows the desktop. "system" resolves the x-apps portal color
 * scheme ('prefer-dark'/'prefer-light'); 'default' or a missing schema falls back to
 * the Cinnamon theme name (Mint's dark themes carry "Dark" in their name), then light.
 * "light"/"dark" override the system, whatever it says.
 * @param {'light' | 'dark' | 'system'} setting panelTheme setting value
 * @param {string} colorScheme x-apps portal color scheme or ''
 * @param {string} themeName Cinnamon theme name or ''
 * @returns {'light' | 'dark'}
 */
var themeResolve = (setting, colorScheme, themeName) => {
    if (setting === 'light' || setting === 'dark') {
        return setting;
    }
    if (colorScheme === 'prefer-dark') {
        return 'dark';
    }
    if (colorScheme === 'prefer-light') {
        return 'light';
    }
    return /dark/i.test(String(themeName || '')) ? 'dark' : 'light';
};
/**
 * The header toggle switches between light and dark only; the panelTheme setting
 * written is the opposite of the theme currently SHOWN, so "system" is overridden
 * by a click. "Follow system" is selectable again in the settings dialog.
 * @param {'light' | 'dark'} theme theme currently shown
 * @returns {'light' | 'dark'}
 */
var themeToggleTarget = (theme) => (theme === 'light' ? 'dark' : 'light');
