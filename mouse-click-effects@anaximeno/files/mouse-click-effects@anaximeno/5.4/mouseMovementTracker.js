const { St, Clutter } = imports.gi;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;

const PointerWatcher = require("./pointerWatcher.js").getPointerWatcher();
const { POINTER_WATCH_MS, MOUSE_PARADE_DELAY_MS, MOUSE_PARADE_ANIMATION_MS } = require("./constants.js");
const { Debouncer, logInfo } = require("./helpers.js");


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
        this.signals.disconnectAllSignals();
        Main.uiGroup.remove_child(this.iconActor);
        this.listener.remove();
        this.iconActor.destroy();
        logInfo("mouse movement tracker stopped");
    }

    move_to(x, y) {
        if (!this.iconActor) return;

        if (this.is_fullscreen_block) {
            this.iconActor.hide();
            logInfo("movement tracker hidden due to deactivation in fullscreen");
            return;
        }

        this.iconActor.ease({
            x: x - this._halfIconSize,
            y: y - this._halfIconSize,
            scale_x: 1,
            scale_y: 1,
            duration: 0,
            opacity: this.opacity,
        });

        this.iconActor.show();
        this.handle_parade();
    }

    handle_parade = (new Debouncer()).debounce(() => {
        if (!this.persist && this.iconActor) {
            this.iconActor.ease({
                opacity: 0,
                duration: MOUSE_PARADE_ANIMATION_MS,
                mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
                onComplete: () => this.iconActor.hide(),
            })
        }
    }, MOUSE_PARADE_DELAY_MS);

    handle_monitors_changed() {
        // Update icon size to take into account new ui scale
        this._halfIconSize = this._size * global.ui_scale * 0.5;
    }
};