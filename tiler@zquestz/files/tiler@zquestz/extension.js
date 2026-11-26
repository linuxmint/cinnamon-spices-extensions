/*
 * Tiler - Grid-based window tiling for Cinnamon
 * Copyright (C) 2026 Josh Ellithorpe
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * This file is the stable Cinnamon entry point; the implementation lives
 * in tiler.js, which is generated from the TypeScript sources in src/.
 */

const Tiler = require("./tiler");

function init(metadata) {
  return Tiler.init(metadata);
}

function enable() {
  return Tiler.enable();
}

function disable() {
  return Tiler.disable();
}
