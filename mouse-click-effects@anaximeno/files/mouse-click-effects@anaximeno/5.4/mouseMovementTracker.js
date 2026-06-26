const { St, Clutter, GLib } = imports.gi;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;

const PointerWatcher = require("./pointerWatcher.js").getPointerWatcher();
const { POINTER_WATCH_MS, MOUSE_PARADE_DELAY_MS, MOUSE_PARADE_ANIMATION_MS } = require("./constants.js");
const { logInfo } = require("./helpers.js");


var MouseMovementTracker = class MouseMovementTracker {
    constructor(extension, params) {
        this.extension = extension;
        this.icon = params.icon;
        this.opacity = params.opacity;
        this.persist = params.persist;
        this.size = params.size;
        this.signals = new SignalManager.SignalManager(null);
        this.iconActor = null;
        this.listener = null;
        this._paradeTimeoutId = 0;
        this._lastMoveTime = 0;
        this._isFading = false;
    }

    get is_fullscreen_block() {
        return this.extension.deactivate_in_fullscreen &&
            global.display.focus_window &&
            global.display.focus_window.is_fullscreen();
    }

    set size(value) {
        this._size = value;
        this._halfIconSize = this._size * global.ui_scale * 0.5;
    }

    get size() {
        return this._size;
    }

    on_fullscreen_changed() {
        const [x, y, _] = global.get_pointer();
        this.move_to(x, y);
    }

    start() {
        if (this.iconActor)
            return;

        this.iconActor = new St.Icon({
            reactive: false,
            can_focus: false,
            track_hover: false,
            icon_size: this.size,
            opacity: this.opacity,
            gicon: this.icon,
        });
        this.iconActor.set_style("pointer-events: none;");

        Main.uiGroup.add_child(this.iconActor);

        this.listener = PointerWatcher.addWatch(POINTER_WATCH_MS, this.move_to.bind(this));
        this.signals.connect(global.screen, 'in-fullscreen-changed', this.on_fullscreen_changed, this);
        this.signals.connect(Main.layoutManager, 'monitors-changed', this.handle_monitors_changed, this);

        const [x, y, _] = global.get_pointer();
        this.move_to(x, y);

        logInfo("mouse movement tracker started");
    }

    restart() {
        this.stop();
        this.start();
    }

    stop() {
        this._clear_parade_timeout();
        this.signals.disconnectAllSignals();

        if (this.listener) {
            this.listener.remove();
            this.listener = null;
        }

        if (this.iconActor) {
            this.iconActor.remove_all_transitions();
            Main.uiGroup.remove_child(this.iconActor);
            this.iconActor.destroy();
            this.iconActor = null;
        }

        this._isFading = false;
        logInfo("mouse movement tracker stopped");
    }

    move_to(x, y) {
        if (!this.iconActor) return;

        if (this.is_fullscreen_block) {
            this.iconActor.hide();
            logInfo("movement tracker hidden due to deactivation in fullscreen");
            return;
        }

        if (this._isFading) {
            this.iconActor.remove_all_transitions();
            this._isFading = false;
        }

        this.iconActor.set_position(x - this._halfIconSize, y - this._halfIconSize);
        this.iconActor.set_scale(1, 1);
        this.iconActor.opacity = this.opacity;

        this.iconActor.show();
        this._schedule_parade();
    }

    _schedule_parade() {
        if (this.persist)
            return;

        this._lastMoveTime = GLib.get_monotonic_time() / 1000;

        if (this._paradeTimeoutId)
            return;

        this._paradeTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            Math.min(MOUSE_PARADE_DELAY_MS, 64),
            this._handle_parade_timeout.bind(this)
        );
        GLib.Source.set_name_by_id(this._paradeTimeoutId, '[cinnamon mouse-click-effects] MouseMovementTracker._schedule_parade');
    }

    _clear_parade_timeout() {
        if (!this._paradeTimeoutId)
            return;

        GLib.source_remove(this._paradeTimeoutId);
        this._paradeTimeoutId = 0;
    }

    _handle_parade_timeout() {
        if (this.persist || !this.iconActor) {
            this._paradeTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }

        if (GLib.get_monotonic_time() / 1000 - this._lastMoveTime < MOUSE_PARADE_DELAY_MS)
            return GLib.SOURCE_CONTINUE;

        this._paradeTimeoutId = 0;
        this._fade_after_movement_stops();
        return GLib.SOURCE_REMOVE;
    }

    _fade_after_movement_stops() {
        if (this.persist || !this.iconActor)
            return;

        this._isFading = true;
        this.iconActor.ease({
            opacity: 0,
            duration: MOUSE_PARADE_ANIMATION_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
            onComplete: () => {
                if (!this.iconActor || !this._isFading)
                    return;

                this.iconActor.hide();
                this._isFading = false;
            },
        });
    }

    handle_monitors_changed() {
        // Update icon size to take into account new ui scale
        this._halfIconSize = this._size * global.ui_scale * 0.5;
    }
};
