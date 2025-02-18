const { Meta } = imports.gi;
const { IDLE_TIME } = require('./constants.js');


var IdleMonitor = class IdleMonitor {
    constructor(params = {idle_delay: IDLE_TIME, on_idle: null, on_active: null, on_finish: null}) {
        this.idle_monitor = Meta.IdleMonitor.get_core();
        this.idle_delay = idle_delay;
        this._on_idle = params.on_idle;
        this._on_active = params.on_active;
        this._on_finish = params.on_finish;
        this._idle_watch_id = null;
        this.idle = false;
    }

    start() {
        this.idle_monitor.add_idle_watch(this.idle_delay, this.idle_handler.bind(this));
        this.idle = this.idle_monitor.get_idletime() > this.idle_delay;
    }

    stop() {
        if (this._on_finish) this._on_finish();
        if (this._idle_watch_id) this.idle_monitor.remove_watch(this._idle_watch_id);
    }

    idle_handler() {
        this._idle_watch_id = this.idle_monitor.add_user_active_watch(this.active_handler.bind(this));
        this.idle = true;
        if (this._on_idle) this._on_idle();
    }

    active_handler() {
        if (this._on_active) this._on_active();
    }
}