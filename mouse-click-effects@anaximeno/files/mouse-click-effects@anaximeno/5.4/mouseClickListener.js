/* mouseClickListener.js
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

const { Atspi, Meta } = imports.gi;
const { logInfo } = require("./helpers.js");

const ATSPI_CLICK_EVENTS = Object.freeze([
    'mouse:b1p',
    'mouse:b2p',
    'mouse:b3p',
    'mouse:button:1p',
    'mouse:button:2p',
    'mouse:button:3p',
]);

const ATSPI_BUTTON_BY_EVENT_TYPE = Object.freeze({
    'mouse:b1p': 1,
    'mouse:button:1p': 1,
    'mouse:b2p': 2,
    'mouse:button:2p': 2,
    'mouse:b3p': 3,
    'mouse:button:3p': 3,
});

var MouseClickListener = class MouseClickListener {
    constructor(on_click) {
        this._on_click = on_click;
        this._atspi_listener = null;
        this._cursor_tracker = null;
        this._pointer_button_signal_id = 0;
        this._active = false;
    }

    start() {
        if (this._active)
            return;

        logInfo(`is_wayland_compositor = ${Meta.is_wayland_compositor()}`);

        if (Meta.is_wayland_compositor()) {
            this._active = this._start_pointer_button_signal();
        } else {
            this._start_atspi();
            this._active = true;
        }

        logInfo('MouseClickListener started ' + (this._active ? 'successfully' : 'unsuccessfully'));
    }

    stop() {
        if (!this._active)
            return;

        if (this._pointer_button_signal_id && this._cursor_tracker) {
            this._cursor_tracker.disconnect(this._pointer_button_signal_id);
            this._pointer_button_signal_id = 0;
            this._cursor_tracker = null;
        } else if (this._atspi_listener) {
            ATSPI_CLICK_EVENTS.forEach(name => this._atspi_listener.deregister(name));
        }

        this._active = false;
    }

    destroy() {
        this.stop();
        this._atspi_listener = null;
    }

    _start_pointer_button_signal() {
        try {
            this._cursor_tracker = Meta.CursorTracker.get_for_display(global.display);
            this._pointer_button_signal_id = this._cursor_tracker.connect(
                'pointer-button', (tracker, button, pressed) => {
                    logInfo(`pointer-button event: button=${button} pressed=${pressed}`);
                    if (pressed)
                        this._on_click(button);
                });
            logInfo("pointer-button signal connected");
            return true;
        } catch (e) {
            logInfo(`pointer-button signal unavailable (${e}), using AT-SPI instead`);
            this._cursor_tracker = null;
            return false;
        }
    }

    _start_atspi() {
        logInfo("using AT-SPI mouse click listener");

        if (!this._atspi_listener) {
            if (!Atspi.is_initialized())
                Atspi.init();

            this._atspi_listener = Atspi.EventListener.new(event => {
                let button = ATSPI_BUTTON_BY_EVENT_TYPE[event.type];
                if (button)
                    this._on_click(button);
            });
        }

        ATSPI_CLICK_EVENTS.forEach(name => this._atspi_listener.register(name));
    }
};
