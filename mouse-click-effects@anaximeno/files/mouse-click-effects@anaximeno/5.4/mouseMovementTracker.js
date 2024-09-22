const { St } = imports.gi;
const Main = imports.ui.main;

const PointerWatcher = require("./pointerWatcher.js").getPointerWatcher();
const { POINTER_WATCH_MS, UUID, MOUSE_PARADE_DELAY_MS } = require("./constants.js");
const { Debouncer, logInfo } = require("./helpers.js");


var MouseMovementTracker = class MouseMovementTracker {
    constructor(icon, size, opacity, persist_on_stopped) {
        this.size = size;
        this.opacity = opacity;
        this.icon = icon;
        this.persist_on_stopped = persist_on_stopped;
        this.icon_actor = null;
        this.listener = null;
    }

    start() {
        const [x, y, _] = global.get_pointer();
        this.icon_actor = new St.Icon({
            reactive: false,
            can_focus: false,
            track_hover: false,
            icon_size: this.size,
            opacity: this.opacity,
            gicon: this.icon,
        });
        this.icon_actor.set_style("pointer-events: none;");
        this.move_to(x, y);
        Main.uiGroup.add_child(this.icon_actor);
        this.listener = PointerWatcher.addWatch(POINTER_WATCH_MS, this.move_to.bind(this));
        logInfo("mouse movement tracker started");
    }

    update(params) {
        if (params.size) {
            this.size = params.size;
        }
        if (params.opacity) {
            this.opacity = params.opacity;
        }
        if (params.icon) {
            this.icon = params.icon;
        }
        if (params.persist_on_stopped === true || params.persist_on_stopped === false) {
            this.persist_on_stopped = params.persist_on_stopped;
        }

        this.finalize();
        this.start();
    }

    finalize() {
        Main.uiGroup.remove_child(this.icon_actor);
        this.listener.remove();
        this.icon_actor.destroy();
        logInfo("mouse movement tracker finalized");
    }

    move_to(x, y) {
        if (this.icon_actor) {
            this.icon_actor.show();
            this.icon_actor.set_position(
                x - (this.size * global.ui_scale / 2),
                y - (this.size * global.ui_scale / 2));
            if (!this.persist_on_stopped)
                this.handle_parade();
        }
    }

    handle_parade = (new Debouncer()).debounce(() => {
        if (this.icon_actor) this.icon_actor.hide();
    }, MOUSE_PARADE_DELAY_MS);
}