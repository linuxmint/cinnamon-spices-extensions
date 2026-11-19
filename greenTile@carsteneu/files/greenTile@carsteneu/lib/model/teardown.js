/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * teardown model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Disconnects every [target, ...ids] entry; a throwing disconnect (signal already
 * gone) is swallowed so every entry is attempted — callers then reset their lists.
 * @param {Array<[AnyRecord, ...number[]]>} entries
 */
var disconnectEach = (entries) => {
    for (const [target, ...ids] of entries)
        {for (const id of ids) {
            try {
                target.disconnect(id);
            }
            catch (_e) {
                // signal was already gone
            }
        }}
};
