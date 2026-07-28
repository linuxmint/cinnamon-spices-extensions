/*
 * @license
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
 */

import { App } from "./app.ts";
import { initTranslations } from "./i18n.ts";

interface ExtensionMeta {
  uuid: string;
}

let app: App | null = null;

/**
 * The uuid Cinnamon loaded this extension under, which is what its settings
 * are registered against. It is not always the uuid in metadata.json: the
 * test-spice script installs a renamed copy alongside the real one.
 */
let uuid = "";

export function init(meta: ExtensionMeta): void {
  uuid = meta.uuid;
  initTranslations(uuid);
}

export function enable(): void {
  if (app) {
    return;
  }

  app = new App(uuid);
}

export function disable(): void {
  if (app) {
    app.destroy();
    app = null;
  }
}
