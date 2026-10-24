/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * state model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { accentHsl, accentRgb } = XLET.lib.model.accent;

/**
 * The state color tints the "Auto: on" marker and the assigned preset cards.
 * The default green keeps its exact table — which in the light scope uses TWO
 * greens: the text (#3f8f22) and the tints + stripe (#4ea530) are different
 * colors and must stay that way. Any other base derives from HSL: dark
 * keeps the base rgb, the light text sits a bit darker than the light tints
 * (mirroring the default's split).
 */
/**
 * Default state tone triple, Object.freeze'd — handed out as immutable Rgb.
 * @type {Rgb}
 */
var stateDefault = Object.freeze([156, 224, 114]);
/**
 * "green" (the default look) | "theme" (the probed theme accent) | "own" (stateColor)
 * @param {string} mode stateMode setting value
 * @returns {'green' | 'theme' | 'own'}
 */
var stateMode = (mode) => (mode === 'own' || mode === 'custom') ? 'own' : (mode === 'theme' ? 'theme' : 'green');
/**
 * Tone table of the state color: dark-scope text/tint and light-scope text/tint.
 * @param {Rgb} base
 * @returns {StateTones}
 */
var stateTones = (base) => {
    if (base[0] === 156 && base[1] === 224 && base[2] === 114)
        {return {
            text: [156, 224, 114],
            tint: [156, 224, 114],
            lightText: [63, 143, 34],
            lightTint: [78, 165, 48],
        };}
    const [h, s, l] = accentHsl(base);
    return {
        text: [base[0], base[1], base[2]],
        tint: [base[0], base[1], base[2]],
        lightText: accentRgb([h, s, Math.min(l, 0.36)]),
        lightTint: accentRgb([h, s, Math.min(l, 0.42)]),
    };
};
/**
 * Same shape as accentCss: the generated rules are prefixed with the
 * panel root class, so they outrank the base rules of stylesheet.css in both
 * scopes (.gk-light rules carry the base alphas, only the colors differ).
 * @param {StateTones} tones
 * @returns {string}
 */
var stateCss = (tones) => {
    const rgb = (/** @type {Rgb} */ c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const rgba = (/** @type {Rgb} */ c, /** @type {number} */ a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    return [
        `.gk-panel .gk-auto-on { color: ${rgb(tones.text)}; border-color: ${rgba(tones.tint, 0.5)}; background-color: ${rgba(tones.tint, 0.08)}; }`,
        `.gk-panel .gk-auto-on:hover { color: ${rgb(tones.text)}; background-color: ${rgba(tones.tint, 0.16)}; }`,
        `.gk-panel .gk-card-assigned { background-color: ${rgba(tones.tint, 0.06)}; }`,
        `.gk-panel .gk-card-assigned:hover { background-color: ${rgba(tones.tint, 0.13)}; }`,
        `.gk-panel .gk-card-stripe { background-color: ${rgb(tones.tint)}; }`,
        `.gk-panel .gk-sub { color: ${rgb(tones.text)}; }`,
        `.gk-panel.gk-light .gk-auto-on { color: ${rgb(tones.lightText)}; border-color: ${rgba(tones.lightTint, 0.5)}; background-color: ${rgba(tones.lightTint, 0.1)}; }`,
        `.gk-panel.gk-light .gk-auto-on:hover { color: ${rgb(tones.lightText)}; background-color: ${rgba(tones.lightTint, 0.18)}; }`,
        `.gk-panel.gk-light .gk-card-assigned { background-color: ${rgba(tones.lightTint, 0.08)}; }`,
        `.gk-panel.gk-light .gk-card-assigned:hover { background-color: ${rgba(tones.lightTint, 0.16)}; }`,
        `.gk-panel.gk-light .gk-card-stripe { background-color: ${rgb(tones.lightTint)}; }`,
        `.gk-panel.gk-light .gk-sub { color: ${rgb(tones.lightText)}; }`,
    ].join('\n');
};
