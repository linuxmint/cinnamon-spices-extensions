/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * focus model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Monitor-edge rules of the Super+Arrow focus movement (Super+Ctrl+Arrow swaps instead).
 * Which monitor borders in the direction (monitors ordered by geometry x, no wrap) — same
 * x-only convention as swapChainStep — and which window on it is nearest:
 * leftmost when entering from the left / rightmost when entering from the right, then the
 * best vertical overlap with the frame the focus comes from, then the topmost. Up/down
 * never leave the own monitor.
 * @param {{ dir: string, monitorIndex: number, monitors: Array<{ index: number, x: number }> }} input
 * @returns {number | null} index of the monitor to move focus to, or null
 */
var focusMonitorStep = (input) => {
    const { dir, monitorIndex, monitors } = input;
    if (dir !== 'left' && dir !== 'right') {
        return null;
    }
    const cur = monitors.find((mo) => mo.index === monitorIndex);
    if (!cur) {
        return null;
    }
    const right = dir === 'right';
    const cand = monitors.filter((mo) => (right ? mo.x > cur.x : mo.x < cur.x));
    if (!cand.length) {
        return null;
    }
    cand.sort((a, b) => (right ? a.x - b.x : b.x - a.x) || (a.index - b.index));
    return cand[0].index;
};
/**
 * Horizontal focus movement across monitors: on the bordering monitor in the given
 * direction, the window with the best vertical overlap with the source frame.
 * @param {CinnamonMonitor[]} frames screen objects of one monitor
 * @param {string} dir 'left' | 'right' (any other value picks nothing)
 * @param {CinnamonRectangle} self frame the focus comes from (plain geometry, not a window object)
 * @returns {number | null} index of the window to focus, or null
 */
var focusMonitorPick = (frames, dir, self) => {
    if ((dir !== 'left' && dir !== 'right') || frames.length === 0) {
        return null;
    }
    const right = dir === 'right';
    const edge = frames.reduce((best, f) => Math[right ? 'min' : 'max'](best, f.x), right ? Infinity : -Infinity);
    const overlap = (/** @type {CinnamonMonitor} */ f) => Math.max(0, Math.min(self.y + self.height, f.y + f.height) - Math.max(self.y, f.y));
    const pool = frames.filter((f) => f.x === edge).sort((a, b) => (overlap(b) - overlap(a)) || (a.y - b.y) || (a.index - b.index));
    return pool[0].index;
};
