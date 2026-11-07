/*
 * tilo - drag detection.
 *
 * Watches for a window being moved and reports the pointer position while it
 * lasts. Draws nothing and moves nothing.
 *
 * Why polling rather than Clutter events: while the window manager holds a
 * pointer grab (which it does for the whole duration of a window move), our
 * actors receive no input events at all. The pointer position must be read
 * directly instead.
 */

const Meta = require('gi.Meta');
const Mainloop = require('mainloop');
const Logger = require('./lib/logger');

/* ~60 Hz. Measured cost of a poll plus hit test is well under a microsecond. */
const POLL_INTERVAL_MS = 16;

/*
 * Collected from the enum rather than listed by hand: Mutter has eight resize
 * operations plus keyboard variants, and the set has changed between versions.
 */
const RESIZE_OPS = Object.keys(Meta.GrabOp)
    .filter(name => name.indexOf('RESIZING') !== -1)
    .map(name => Meta.GrabOp[name]);

class DragWatcher {
    /* handlers: {
     *   onDragStart(window),
     *   onDragMove(window, x, y),
     *   onDragEnd(window, x, y),
     *   onResizeEnd(window, startRect, endRect)
     * } */
    constructor(handlers) {
        this._handlers = handlers;
        this._beginId = 0;
        this._endId = 0;
        this._pollId = 0;
        this._window = null;
        this._lastX = 0;
        this._lastY = 0;
        this._resizing = null;
    }

    enable() {
        this._beginId = global.display.connect('grab-op-begin',
                                               (...args) => this._onGrabBegin(args));
        this._endId = global.display.connect('grab-op-end',
                                             (...args) => this._onGrabEnd(args));
    }

    disable() {
        this._stopPolling();
        if (this._beginId) global.display.disconnect(this._beginId);
        if (this._endId) global.display.disconnect(this._endId);
        this._beginId = this._endId = 0;
        this._window = null;
    }

    /*
     * The argument list of grab-op-begin/end changed across Mutter versions
     * (a screen argument was dropped), and Muffin tracks Mutter. Rather than
     * betting on a position, pick the arguments out by type.
     */
    _parse(args) {
        const window = args.find(a => a && typeof a.get_frame_rect === 'function');
        const op = args.find(a => typeof a === 'number');
        return { window, op };
    }

    _isMove(op) {
        return op === Meta.GrabOp.MOVING ||
               op === Meta.GrabOp.KEYBOARD_MOVING;
    }

    _isResize(op) {
        return RESIZE_OPS.indexOf(op) !== -1;
    }

    _rect(window) {
        const r = window.get_frame_rect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    _onGrabBegin(args) {
        const { window, op } = this._parse(args);
        if (!window) return;

        if (this._isResize(op)) {
            /* Remember the geometry rather than the operation: comparing the
               rectangle before and after tells us which edges the user actually
               moved, without having to map eight enum values onto edges. */
            this._resizing = { window, startRect: this._rect(window) };
            return;
        }

        if (!this._isMove(op)) return;

        this._window = window;
        this._startPolling();
        Logger.debug(`drag started on "${window.get_title()}"`);

        /*
         * Announced at the start rather than when the pointer nears an edge.
         * The picker only used to appear once you were already 48px from the
         * top, which meant nobody found out it existed unless they happened to
         * drag a window up there. Telling you at the moment you pick a window
         * up is the whole point.
         */
        if (this._handlers.onDragStart) this._handlers.onDragStart(window);
    }

    _onGrabEnd(args) {
        if (this._resizing) {
            const { window, startRect } = this._resizing;
            this._resizing = null;
            if (this._handlers.onResizeEnd) {
                this._handlers.onResizeEnd(window, startRect, this._rect(window));
            }
            return;
        }

        if (!this._window) return;

        const window = this._window;
        this._stopPolling();
        this._window = null;

        Logger.debug('drag ended');
        this._handlers.onDragEnd(window, this._lastX, this._lastY);
    }

    _startPolling() {
        this._stopPolling();
        this._pollId = Mainloop.timeout_add(POLL_INTERVAL_MS, () => {
            if (!this._window) return false;
            const [x, y] = global.get_pointer();

            /* A drag spends a good part of its time with the pointer at rest,
               and re-running the hit test against an unchanged position buys
               nothing. This callback shares a thread with the compositor, so
               the cheapest frame is the one that does nothing. */
            if (x === this._lastX && y === this._lastY) return true;

            this._lastX = x;
            this._lastY = y;
            this._handlers.onDragMove(this._window, x, y);
            return true; /* keep polling */
        });
    }

    _stopPolling() {
        if (this._pollId) {
            Mainloop.source_remove(this._pollId);
            this._pollId = 0;
        }
    }
}

module.exports = { DragWatcher };
