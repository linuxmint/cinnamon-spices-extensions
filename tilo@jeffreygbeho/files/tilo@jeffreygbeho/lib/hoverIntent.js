/*
 * tilo - hover intent.
 *
 * Pointer position alone is a poor signal of what someone meant. Brushing past
 * the tab on the way somewhere else is not a request to open the picker, and a
 * moment of wobble at the edge of the panel is not a request to close it.
 *
 * So neither the opening nor the closing fires on the first frame that the
 * pointer qualifies. It has to keep qualifying for a short while, and stopping
 * to qualify cancels the pending action rather than reversing it.
 */

const Mainloop = require('mainloop');
const Logger = require('./lib/logger');

class HoverIntent {
    constructor(delayMs, action) {
        this._delay = delayMs;
        this._action = action;
        this._timeoutId = 0;
    }

    get pending() { return this._timeoutId !== 0; }

    /* Start the countdown. Repeated calls while it runs are no-ops, so this can
       be called on every frame of a drag without restarting the clock. */
    arm() {
        if (this._timeoutId) return;
        this._timeoutId = Mainloop.timeout_add(this._delay, () => {
            this._timeoutId = 0;
            try {
                this._action();
            } catch (e) {
                Logger.error('hover intent action failed', e);
            }
            return false;
        });
    }

    cancel() {
        if (!this._timeoutId) return;
        Mainloop.source_remove(this._timeoutId);
        this._timeoutId = 0;
    }

    destroy() {
        this.cancel();
        this._action = null;
    }
}

module.exports = { HoverIntent };
