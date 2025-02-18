const { St, Clutter } = imports.gi;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;

const PointerWatcher = require("./pointerWatcher.js").getPointerWatcher();
const { POINTER_WATCH_MS, MOUSE_PARADE_DELAY_MS, MOUSE_PARADE_ANIMATION_MS } = require("./constants.js");
const { Debouncer, logInfo } = require("./helpers.js");


var MouseMovementTracker = class MouseMovementTracker {
    constructor(extension, icon, size, opacity, persistOnStopped) {
        this.extension = extension;
        this.size = size;
        this.opacity = opacity;
        this.icon = icon;
        this.persistOnStopped = persistOnStopped;
        this.signals = new SignalManager.SignalManager(null);
        this.iconActor = null;
        this.listener = null;
    }

    get is_fullscreen_block() {
        return this.extension.deactivate_in_fullscreen &&
            global.display.focus_window &&
            global.display.focus_window.is_fullscreen();
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

        const [x, y, _] = global.get_pointer();
        this.move_to(x, y);

        logInfo("mouse movement tracker started");
    }

    update(params) {
        if (params.size) this.size = params.size;
        if (params.opacity) this.opacity = params.opacity;
        if (params.icon) this.icon = params.icon;
        if (typeof params.persistOnStopped !== 'undefined') {
            this.persistOnStopped = params.persistOnStopped;
        }

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

        const iconSize = this.size * global.ui_scale;

        this.iconActor.ease({
            x: x - iconSize / 2,
            y: y - iconSize / 2,
            scale_x: 1,
            scale_y: 1,
            duration: 0,
            opacity: 255,
            onComplete: () => this.handle_parade(),
        });

        this.iconActor.show();
    }

    handle_parade = (new Debouncer()).debounce(() => {
        if (!this.persistOnStopped && this.iconActor) {
            this.iconActor.ease({
                opacity: 0,
                duration: MOUSE_PARADE_ANIMATION_MS,
                mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
                onComplete: () => this.iconActor.hide(),
            })
        }
    }, MOUSE_PARADE_DELAY_MS);
};