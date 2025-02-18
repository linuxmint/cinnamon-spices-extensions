/* applet.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
'use strict';

const DEBUG = false;

const UUID = "mouse-click-effects@anaximeno";

const PAUSE_EFFECTS_KEY = `${UUID}-bind-pause-effects`;

const CLICK_DEBOUNCE_MS = 16;

const POINTER_WATCH_MS = 16;

const MOUSE_PARADE_DELAY_MS = 256;

const MOUSE_PARADE_ANIMATION_MS = 256;

const IDLE_TIME = 1024;
