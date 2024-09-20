const { St } = imports.gi;
const Main = imports.ui.main;

const PointerWatcher = require("./pointerWatcher.js").getPointerWatcher();
const { POINTER_WATCH_MS, UUID, MOUSE_PARADE_DELAY_MS } = require("./constants.js");
const { Debouncer } = require("./helpers.js");


var MouseMovementTracker = class MouseMovementTracker {
    constructor(icon, size, opacity, persist_on_stopped) {
        this.size = size;
        this.opacity = opacity;
        this.icon = icon;
        this.icon_actor = null;
        this.listener = null;
        this.persist_on_stopped = persist_on_stopped;
        this.handle_parade = (new Debouncer()).debounce(
            this.on_parade.bind(this),
            MOUSE_PARADE_DELAY_MS,
        );
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
        this.move_to(x, y);
        Main.uiGroup.add_child(this.icon_actor);
        this.listener = PointerWatcher.addWatch(POINTER_WATCH_MS, this.move_to.bind(this));
        global.log(UUID, "mouse movement tracker started");
    }

    update(params) {
        if (params.size) {
            this.size = params.size;
            this.icon_actor.set_size(params.size);
        }
        if (params.opacity) {
            this.opacity = params.opacity;
            this.icon_actor.set_opacity(params.opacity);
        }
        if (params.icon) {
            Main.uiGroup.remove_child(this.icon_actor);
            const [x, y, _] = global.get_pointer();
            this.icon_actor = new St.Icon({
                reactive: false,
                can_focus: false,
                track_hover: false,
                icon_size: this.size,
                opacity: this.opacity,
                gicon: params.icon,
            });
            this.move_to(x, y);
            Main.uiGroup.add_child(this.icon_actor);
            if (!this.persist_on_stopped)
                this.icon_actor.hide();
        }
        if (params.persist_on_stopped === true) {
            this.persist_on_stopped = params.persist_on_stopped;
            this.icon_actor.show();
        } else if (params.persist_on_stopped === false) {
            this.persist_on_stopped = params.persist_on_stopped;
            this.icon_actor.hide();
        }
    }

    finalize() {
        Main.uiGroup.remove_child(this.icon_actor);
        this.listener.remove();
        this.icon_actor.destroy();
        global.log(UUID, "mouse movement tracker finalized");
    }

    move_to(x, y) {
        this.icon_actor.show();
        this.icon_actor.set_position(
            x - (this.size * global.ui_scale / 2),
            y - (this.size * global.ui_scale / 2));
        if (!this.persist_on_stopped)
            this.handle_parade();
    }

    on_parade() {
        this.icon_actor.hide();
    }
}