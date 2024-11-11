/* helpers.js
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

const Util = imports.misc.util;

const { UUID, DEBUG } = require('./constants.js');


var Debouncer = class Debouncer {
    _sourceId;

    constructor() {
        this._sourceId = 0;
    }

    clear() {
        if (this._sourceId > 0) {
            Util.clearTimeout(this._sourceId);
            this._sourceId = 0;
        }
    }

    debounce(fn, timeout) {
        return ((...args) => {
            this.clear();
            this._sourceId = Util.setTimeout(() => {
                this.clear();
                fn.apply(this, args);
            }, timeout);
        }).bind(this);
    }
}


function logInfo(...args) {
    if (DEBUG) global.log(`${UUID}: ${args.join(' ')}`);
}

function logError(...args) {
    global.logError(`${UUID}: ${args.join(' ')}`);
}
