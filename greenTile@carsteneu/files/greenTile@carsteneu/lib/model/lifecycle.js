/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * lifecycle model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Tracks the current pending operation: begin() marks a new one and returns its token,
 * is_current() tells whether that token may still act, invalidate() drops everything
 * in flight (teardown).
 * @returns {{ begin(): number, is_current(token: number): boolean, invalidate(): void }}
 */
var pendingRegistry = () => {
    let epoch = 0;
    return {
        begin: () => ++epoch,
        is_current: (token) => token === epoch,
        invalidate: () => epoch++,
    };
};
