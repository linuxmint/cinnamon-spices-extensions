const { St } = imports.gi;
const Main = imports.ui.main;

const PointerWatcher = require("./pointerWatcher.js").getPointerWatcher();
const { POINTER_WATCH_MS, UUID } = require("./constants.js");


var MouseMovementTracker = class MouseMovementTracker {
    constructor(icon, size, opacity) {
        this.size = size;
        this.opacity = opacity;
        this.icon = icon;
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
        this.move_to(x, y);
        Main.uiGroup.add_child(this.icon_actor);
        this.listener = PointerWatcher.addWatch(
            POINTER_WATCH_MS,
            this.move_to.bind(this),
        );
        global.log(UUID, "started mouse movement tracker");
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
            this.icon_actor = new St.Icon({
                reactive: false,
                can_focus: false,
                track_hover: false,
                icon_size: this.size,
                opacity: this.opacity,
                gicon: icon,
            });
            Main.uiGroup.add_child(this.icon_actor);
        }
    }

    finalize() {
        Main.uiGroup.remove_child(this.icon_actor);
        this.listener.remove();
        this.listener = null;
        this.icon_actor.destroy();
        this.icon_actor = null;
        global.log(UUID, "finalized mouse movement tracker");
    }

    move_to(x, y) {
        this.icon_actor.set_position(
            x - (this.size * global.ui_scale / 2),
            y - (this.size * global.ui_scale / 2),
        );
    }
}