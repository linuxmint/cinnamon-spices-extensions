/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * accent model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * All accent colors derive from one base: the default orange, the accent of the
 * Cinnamon theme (probed at runtime — lib/runtime/theme.js applies it) or the custom
 * accentColor setting. The default orange keeps its exact tone table, so
 * the default look stays pixel-identical; every other base is derived from
 * HSL lightness: hover lighter, light theme darker, text by luminance.
 */
/** @type {Rgb} */
var accentDefault = Object.freeze([255, 150, 64]);
/**
 * The colorchooser stores Gdk.RGBA strings ("rgb(r,g,b)", "rgba(r,g,b,a)").
 * #hex is accepted too (hand-edited JSON); anything else falls back below.
 * @param {any} value raw stored accentColor setting, validated here
 * @returns {Rgb | null}
 */
var accentParse = (value) => {
    if (typeof value !== 'string') {
        return null;
    }
    const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (rgb) {
        const parts = rgb.slice(1, 4).map(Number);
        return parts.some((c) => c > 255) ? null : (/** @type {Rgb} */ (/** @type {unknown} */ (parts)));
    }
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        return (/** @type {Rgb} */ (/** @type {unknown} */ ([0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)))));
    }
    return null;
};
/**
 * The settings dialog cannot offer an option with the value "custom"
 * (xlet-settings.py drops it), so the schema value is "own"; a stored legacy
 * "custom" (hand-edited file of an older version) keeps meaning the same thing.
 * @param {string} mode
 * @returns {boolean}
 */
var accentIsOwn = (mode) => mode === 'own' || mode === 'custom';
/**
 * The probed ink is only an accent when it is opaque, saturated enough to
 * differ from the panel greys and neither near-black (invisible) nor
 * near-white (unreadable) — anything else keeps the default orange.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} a
 * @returns {Rgb | null}
 */
var accentFromProbed = (r, g, b, a) => {
    if (![r, g, b, a].every((n) => Number.isFinite(n)) || a < 250) {
        return null;
    }
    const rgb = [r, g, b].map(Math.round);
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    const l = (max + min) / 510;
    const s = max === min ? 0 : l < 0.5 ? (max - min) / (max + min) : (max - min) / (510 - max - min);
    if (s < 0.15 || l < 0.14 || l > 0.92) {
        return null;
    }
    return (/** @type {Rgb} */ (/** @type {unknown} */ (rgb)));
};
/**
 * The theme probe chain, in fallback order: the menu entries carry the theme
 * accent in Mint-L, but Mint-Y paints them grey — there the calendar day
 * hover state holds it. accentProbeFirst walks the chain and returns
 * the first color the model accepts, so grey themes keep the default. The
 * probes resolve class-selector rules only — themes painting their accent on
 * type-qualified selectors or in border-color keep the default too.
 */
var accentProbes = Object.freeze([
    ['popup-menu-item', 'active'],
    ['popup-menu-item', 'hover'],
    ['calendar-day-base', 'hover'],
]);
/**
 * First probe result the model accepts, or null when none does.
 * @param {(className: string, pseudoClass: string) => Rgb | null} probeFn
 * @returns {Rgb | null}
 */
var accentProbeFirst = (probeFn) => {
    for (const [className, pseudoClass] of accentProbes) {
        const rgb = probeFn(className, pseudoClass);
        if (rgb) {
            return rgb;
        }
    }
    return null;
};
/**
 * RGB 0–255 -> HSL [h 0–360, s 0–1, l 0–1].
 * @param {Rgb} rgb
 * @returns {Hsl}
 */
var accentHsl = (rgb) => {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min));
    let h = 0;
    if (max !== min) {
        if (max === r) {
            h = ((g - b) / (max - min)) % 6;
        }
        else if (max === g) {
            h = (b - r) / (max - min) + 2;
        }
        else {
            h = (r - g) / (max - min) + 4;
        }
        h = h * 60;
        if (h < 0) {
            h += 360;
        }
    }
    return [h, s, l];
};
/**
 * HSL -> RGB 0–255, rounded.
 * @param {Hsl} hsl
 * @returns {Rgb}
 */
var accentRgb = (hsl) => {
    const [h, s, l] = hsl;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const parts = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return (/** @type {Rgb} */ (/** @type {unknown} */ (parts.map((v) => Math.round((v + m) * 255)))));
};
/** The two ink colours the accent model draws with: dark on bright bases, light on dark. */
/** @type {Rgb} */
var accentInkDark = Object.freeze([20, 22, 29]);
/** @type {Rgb} */
var accentInkLight = Object.freeze([246, 247, 250]);
/**
 * WCAG relative luminance of an rgb 0-255.
 * @param {Rgb} rgb
 * @returns {number}
 */
var accentLuminance = (rgb) => {
    const lin = (/** @type {number} */ v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
};
/**
 * WCAG contrast ratio between two colors (1…21).
 * @param {Rgb} a
 * @param {Rgb} b
 * @returns {number}
 */
var accentContrast = (a, b) => {
    const ya = accentLuminance(a);
    const yb = accentLuminance(b);
    return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
};
/**
 * Text/ink color with enough contrast on the given background rgb.
 * @param {Rgb} rgb
 * @returns {Rgb}
 */
var accentTextOn = (rgb) => (accentLuminance(rgb) > 0.3 ? accentInkDark : accentInkLight);
/**
 * The ink of the two that stands further apart from the given background — for marks
 * whose background is not text-shaped, so the pick maximizes contrast instead of
 * following the text threshold.
 * @param {Rgb} rgb background the ink is drawn on
 * @returns {Rgb}
 */
var accentInkOn = (rgb) => (accentContrast(accentInkDark, rgb) >= accentContrast(accentInkLight, rgb) ? accentInkDark : accentInkLight);
/**
 * Fill and rim of a painter boundary handle. Each band is picked for the surface it
 * actually covers: a merge handle straddles the gap between two painted columns, so its
 * fill band lies on the painter background and its rim band on the columns beside it; a
 * split handle sits inside a merged column, so both bands lie on the painted column and
 * the rim takes the opposite ink for an inner edge. The painted column is the accent at
 * 0.85 over the painter background, exactly as lib/ui/editor.js fills it.
 * @param {'merge' | 'split'} kind
 * @param {Rgb} base resolved accent color (app.theme.rgb)
 * @param {Rgb} gap painter background the columns are painted over (theme cairo 'painter')
 * @returns {{ fill: Rgb, rim: Rgb }}
 */
var accentHandleInk = (kind, base, gap) => {
    const painted = /** @type {Rgb} */ ([
        base[0] * 0.85 + gap[0] * 0.15,
        base[1] * 0.85 + gap[1] * 0.15,
        base[2] * 0.85 + gap[2] * 0.15,
    ]);
    const onColumn = accentInkOn(painted);
    if (kind === 'merge') {
        return { fill: accentInkOn(gap), rim: onColumn };
    }
    return { fill: onColumn, rim: onColumn === accentInkDark ? accentInkLight : accentInkDark };
};
/**
 * Tone table of an accent base: dark-scope base/hover/saveHover and the light-scope
 * counterparts plus the text color on the base.
 * @param {Rgb} base
 * @returns {AccentTones}
 */
var accentTones = (base) => {
    if (base[0] === 255 && base[1] === 150 && base[2] === 64)
        {return {
            base: [255, 150, 64],
            hover: [255, 176, 112],
            saveHover: [255, 171, 102],
            lightBase: [217, 122, 36],
            lightHover: [232, 154, 63],
            textOn: [20, 22, 29],
        };}
    const [h, s, l] = accentHsl(base);
    const lighter = (/** @type {number} */ v) => Math.min(v + 0.10, 0.92);
    const lightBase = accentRgb([h, s, Math.min(l, 0.5)]);
    return {
        base: [base[0], base[1], base[2]],
        hover: accentRgb([h, s, lighter(l)]),
        saveHover: accentRgb([h, s, Math.min(l + 0.08, 0.92)]),
        lightBase: lightBase,
        lightHover: accentRgb([h, s, lighter(Math.min(l, 0.5))]),
        textOn: accentTextOn(base),
    };
};
/**
 * The generated stylesheet overrides the accent rules of stylesheet.css. The
 * selectors are prefixed with .gk-panel (every accent actor is a descendant of
 * the panel root), which makes them more specific than the base rules — the
 * override does not depend on how st orders equally specific sheets. As in the
 * base rules, the light scope tints keep the base rgb — only the alphas differ.
 * @param {AccentTones} tones
 * @returns {string}
 */
var accentCss = (tones) => {
    const rgb = (/** @type {Rgb} */ c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const rgba = (/** @type {Rgb} */ c, /** @type {number} */ a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    return [
        '/* generated by the greenTile accent model (accent and state colors) — manual edits are overwritten */',
        `.gk-panel .gk-plus { color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-plus:hover { color: ${rgb(tones.hover)}; }`,
        `.gk-panel .gk-grip:hover { color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-reset-btn:hover { background-color: ${rgba(tones.base, 0.18)}; border-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-ed-rule-active { background-color: ${rgba(tones.base, 0.08)}; }`,
        `.gk-panel .gk-ed-rule-active:hover { background-color: ${rgba(tones.base, 0.14)}; }`,
        `.gk-panel .gk-ed-rule-stripe { background-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-ed-add { color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-ed-add:hover { color: ${rgb(tones.hover)}; }`,
        `.gk-panel .gk-stepper-btn:hover { border-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-entry { selection-background-color: ${rgb(tones.base)}; selected-color: ${rgb(tones.textOn)}; }`,
        `.gk-panel .gk-entry:focus { border-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-save { color: ${rgb(tones.textOn)}; background-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-save:hover { background-color: ${rgb(tones.saveHover)}; }`,
        `.gk-panel.gk-light .gk-plus { color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-plus:hover { color: ${rgb(tones.lightHover)}; }`,
        `.gk-panel.gk-light .gk-grip:hover { color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-reset-btn:hover { background-color: ${rgba(tones.base, 0.22)}; border-color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-ed-rule-active { background-color: ${rgba(tones.base, 0.14)}; }`,
        `.gk-panel.gk-light .gk-ed-rule-active:hover { background-color: ${rgba(tones.base, 0.2)}; }`,
        `.gk-panel.gk-light .gk-ed-rule-stripe { background-color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-ed-add { color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-ed-add:hover { color: ${rgb(tones.lightHover)}; }`,
        `.gk-panel.gk-light .gk-stepper-btn:hover { border-color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-entry:focus { border-color: ${rgb(tones.lightBase)}; }`,
    ].join('\n');
};
