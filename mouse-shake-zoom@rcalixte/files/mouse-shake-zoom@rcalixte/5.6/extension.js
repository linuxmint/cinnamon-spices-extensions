// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const UUID = "mouse-shake-zoom@rcalixte";
const Self = imports.ui.extensionSystem.extensionMeta[UUID];

imports.searchPath.push(Self.path);
const PointerWatcher = imports.pointerWatcher.getPointerWatcher();
const DESKTOP_SCHEMA = 'org.cinnamon.desktop.interface';
const CURSOR_SIZE_KEY = 'cursor-size';

var DURATION_MS = 2000;
var HISTORY_MAX = 500;
var INTERVAL_MS = 10;
var SHAKE_DEGREES = 500;

function MouseShakeZoom(metadata) {
    this._init(metadata);
}

MouseShakeZoom.prototype = {
    _init: function (metadata) {
        this.metadata = metadata;
        this.settings = new Settings.ExtensionSettings(this, UUID, metadata.uuid);
        this.settings.bindProperty(Settings.BindingDirection.IN, "growth-speed",
            "growth_speed");
        this.settings.bindProperty(Settings.BindingDirection.IN, "shrink-speed",
            "shrink_speed");
        this.settings.bindProperty(Settings.BindingDirection.IN, "shake-threshold",
            "shake_threshold");

        this.desktop_settings = new Gio.Settings({ schema_id: DESKTOP_SCHEMA });
        this.start_size = this.desktop_settings.get_int(CURSOR_SIZE_KEY);

        this.history = [];
        this.lastX = 0;
        this.lastY = 0;
        this.intervals = [];
        this.jiggling = false;
    },

    enable: function () {
        try {
            this.pointerListener = PointerWatcher.addWatch(INTERVAL_MS, (x, y) => {
                this._history_push(x, y);
            });
            this.intervals.push(Mainloop.timeout_add(INTERVAL_MS, () => {
                if (this._history_check()) {
                    if (!this.jiggling) {
                        this.jiggling = true;
                        // debug
                        // global.log('Starting jiggle effect');
                        this._start();
                    }
                } else if (this.jiggling) {
                    this.jiggling = false;
                    // debug
                    // global.log('Stopping jiggle effect');
                    this._stop();
                }

                return true;
            }));
        } catch (err) {
            // ensure we clean up any leftovers if there's a problem!
            this.disable();
            throw err;
        }
    },

    disable: function () {
        // reset to defaults
        this.jiggling = false;
        this.history = [];
        // remove our pointer listener
        if (this.pointerListener) {
            // debug
            // global.log('Clearing pointer listener');
            PointerWatcher._removeWatch(this.pointerListener);
        }
        // stop the interval
        this.intervals.map(i => Mainloop.source_remove(i));
        this.intervals = [];
        this.settings.finalize();
        this.settings = null;
    },

    /**
     * Check history and report whether the mouse is being shaken
     * 
     * @return {Boolean}
     */
    _history_check: function () {
        // get the current loop timestamp
        let now = new Date().getTime();

        // prune stale buffer
        for (let i = 0; i < this.history.length; ++i) {
            if (now - this.history[i].t > HISTORY_MAX) {
                this.history.splice(i, 1);
            }
        }

        // reset degrees so we can add them again
        let degrees = 0;
        let max = 0;
        // add up gammas (deg=sum(gamma))
        if (this.history.length > 2) {
            for (let i = 2; i < this.history.length; ++i) {
                degrees += this._math_gamma(this.history[i],
                    this.history[i - 1], this.history[i - 2]);
                max = Math.max(max, this._math_distance(this.history[i - 2],
                    this.history[i - 1]), this._math_distance(this.history[i - 1],
                        this.history[i]));
            }
        }
        return (degrees > SHAKE_DEGREES && max > this.shake_threshold);
    },

    /**
     * Push new mouse coordinates to the history
     * 
     * @param {Number} x 
     * @param {Number} y 
     */
    _history_push: function (x, y) {
        if (x == 0 && y == 0) {
            return;
        }
        if (x < 0 || y < 0) {
            return;
        }
        this.history.push({
            x: this.lastX = x, y: this.lastY = y,
            t: new Date().getTime()
        });
    },

    _math_distance: function (p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    },

    _math_gamma: function (st, nd, rd) {
        // pythagoras
        var a = Math.sqrt(Math.pow(st.x - nd.x, 2) + Math.pow(st.y - nd.y, 2));
        var b = Math.sqrt(Math.pow(nd.x - rd.x, 2) + Math.pow(nd.y - rd.y, 2));
        var c = Math.sqrt(Math.pow(rd.x - st.x, 2) + Math.pow(rd.y - st.y, 2));

        if (0 === a * b) {
            return 0;
        }
        // law of cosines
        return 180 - Math.acos((Math.pow(a, 2) + Math.pow(b, 2) -
            Math.pow(c, 2)) / (2 * a * b)) * 180 / Math.PI;
    },

    _start: function () {
        this.start_size = this.desktop_settings.get_int(CURSOR_SIZE_KEY);
        let new_size = this.start_size;
        for (let i = 0.0; i <= DURATION_MS; i += this.growth_speed) {
            this.desktop_settings.set_int(CURSOR_SIZE_KEY, new_size);
            new_size = Math.min(96, parseInt(new_size * (1 + this.growth_speed)));
        }
    },

    _stop: function () {
        let new_size = 96;
        for (let i = DURATION_MS; i >= 0.0; i -= this.shrink_speed) {
            this.desktop_settings.set_int(CURSOR_SIZE_KEY, new_size);
            new_size = Math.max(this.start_size, parseInt(new_size * (1 - this.shrink_speed)));
        }
        this.desktop_settings.set_int(CURSOR_SIZE_KEY, this.start_size);
    },
}

let extension = null;

function enable() {
    try {
        extension.enable();
    } catch (err) {
        extension.disable();
        throw err;
    }
}

function disable() {
    try {
        extension.disable();
    } catch (err) {
        global.logError(err);
    } finally {
        extension = null;
    }
}

function init(metadata) {
    extension = new MouseShakeZoom(metadata);
}
