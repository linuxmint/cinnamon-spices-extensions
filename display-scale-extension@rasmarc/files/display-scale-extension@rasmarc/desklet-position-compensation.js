// Position-only output zoom compensation. Stored desklet positions are left
// to Cinnamon; temporary translations keep the visible centres in place.
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

class DeskletPositionCompensation {
    constructor() {
        this._records = new Map();
        this._factor = 1;
        this._suspended = false;
        this._sourceId = 0;
        this._idleId = 0;
        this._writing = false;
    }

    _container() { return Main.deskletContainer && Main.deskletContainer.actor; }

    _centre(actor) {
        const [x, y] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();
        return [x + width / 2, y + height / 2];
    }

    prepare(enabled) {
        if (enabled) {
            this._scan();
            this._suspended = true;
        }
    }

    update(uiMode, percent, enabled) {
        if (!enabled || !uiMode || !Number.isFinite(percent) || percent <= 0) {
            this.destroy();
            return;
        }
        this._factor = percent / 100;
        this._suspended = false;
        this._scan();
        if (!this._sourceId) {
            this._sourceId = Mainloop.timeout_add(1000, () => {
                this._scan();
                return true;
            });
        }
    }

    _scan() {
        const container = this._container();
        if (!container)
            return;
        const seen = new Set();
        for (const actor of container.get_children()) {
            const desklet = actor._desklet || actor._delegate;
            if (!desklet || !desklet._draggable)
                continue;
            seen.add(actor);
            let record = this._records.get(actor);
            if (!record) {
                if (!(actor.width > 0 && actor.height > 0))
                    continue;
                const [x, y] = this._centre(actor);
                if (![x, y].every(Number.isFinite))
                    continue;
                record = { actor, x, y, originalX: actor.translation_x || 0,
                    originalY: actor.translation_y || 0, appliedX: null, appliedY: null,
                    dragging: false, ids: [] };
                this._records.set(actor, record);
                const connect = (object, signal, callback) => {
                    record.ids.push([object, object.connect(signal, callback)]);
                };
                connect(actor, "destroy", () => {
                    this._disconnect(record);
                    this._records.delete(actor);
                });
                for (const property of ["width", "height"])
                    connect(actor, "notify::" + property, () => this._queue());
                for (const property of ["x", "y"])
                    connect(actor, "notify::" + property, () => {
                        if (!this._writing && !record.dragging && !this._suspended) {
                            const [cx, cy] = this._centre(actor);
                            record.x = cx - (actor.translation_x - record.originalX);
                            record.y = cy - (actor.translation_y - record.originalY);
                            this._queue();
                        }
                    });
                connect(desklet._draggable, "drag-begin", () => {
                    record.dragging = true;
                    record.dragOriginal = { x: actor.x, y: actor.y, cx: record.x, cy: record.y };
                    // Give native DND an ordinary actor at its visible position.
                    this._writing = true;
                    try {
                        actor.set_position(actor.x + actor.translation_x - record.originalX,
                            actor.y + actor.translation_y - record.originalY);
                        actor.translation_x = record.originalX;
                        actor.translation_y = record.originalY;
                        record.appliedX = record.originalX;
                        record.appliedY = record.originalY;
                    } finally { this._writing = false; }
                });
                connect(desklet._draggable, "drag-end", (draggable, time, success) => {
                    record.dragging = false;
                    if (!success && record.dragOriginal) {
                        this._writing = true;
                        try { actor.set_position(record.dragOriginal.x, record.dragOriginal.y); }
                        finally { this._writing = false; }
                        record.x = record.dragOriginal.cx;
                        record.y = record.dragOriginal.cy;
                    } else {
                        const [cx, cy] = this._centre(actor);
                        record.x = cx * this._factor;
                        record.y = cy * this._factor;
                    }
                    record.dragOriginal = null;
                    this._queue();
                });
            }
            if (!this._suspended)
                this._apply(record);
        }
        for (const [actor, record] of this._records) {
            if (!seen.has(actor) && !record.dragging) {
                this._restore(record);
                this._records.delete(actor);
            }
        }
    }

    _queue() {
        if (this._idleId || this._suspended)
            return;
        this._idleId = Mainloop.idle_add(() => {
            this._idleId = 0;
            if (!this._suspended)
                this._scan();
            return false;
        });
    }

    _apply(record) {
        if (record.dragging || record.actor.get_parent() !== this._container())
            return;
        const actor = record.actor;
        const [cx, cy] = this._centre(actor);
        const x = actor.translation_x + record.x / this._factor - cx;
        const y = actor.translation_y + record.y / this._factor - cy;
        if (![x, y].every(Number.isFinite))
            return;
        this._writing = true;
        try {
            // Preserve subpixels to avoid drift after repeated switches.
            if (Math.abs(actor.translation_x - x) > 0.001)
                actor.translation_x = x;
            if (Math.abs(actor.translation_y - y) > 0.001)
                actor.translation_y = y;
            record.appliedX = actor.translation_x;
            record.appliedY = actor.translation_y;
        } finally { this._writing = false; }
    }

    _disconnect(record) {
        for (const [object, id] of record.ids) {
            try { object.disconnect(id); } catch (error) {}
        }
        record.ids = [];
    }

    _restore(record) {
        this._disconnect(record);
        const actor = record.actor;
        if (record.appliedX !== null && actor.translation_x === record.appliedX)
            actor.translation_x = record.originalX;
        if (record.appliedY !== null && actor.translation_y === record.appliedY)
            actor.translation_y = record.originalY;
    }

    destroy() {
        if (this._sourceId)
            Mainloop.source_remove(this._sourceId);
        if (this._idleId)
            Mainloop.source_remove(this._idleId);
        this._sourceId = this._idleId = 0;
        for (const record of this._records.values())
            this._restore(record);
        this._records.clear();
        this._factor = 1;
        this._suspended = false;
    }
}

module.exports = DeskletPositionCompensation;
