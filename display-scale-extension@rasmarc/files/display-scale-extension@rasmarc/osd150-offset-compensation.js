// Preserve OSD150's placement along the available path towards each screen edge.
// The OSD itself grows; only its temporary translations are adjusted.
const Main = imports.ui.main;
const Extension = imports.ui.extension;
const ExtensionSystem = imports.ui.extensionSystem;

const OSD_UUID = "OSD150@claudiux";

class Osd150OffsetCompensation {
    constructor() {
        this._factor = 1;
        this._keepPanel = false;
        this._signals = [];
        this._record = null;
        this._paintId = 0;
    }

    update(screenPercent, enabled, keepPanel = false) {
        const screenFactor = screenPercent / 100;
        const factor = screenPercent / 100 / Math.max(1, global.ui_scale || 1);
        if (!enabled || !Number.isFinite(factor) || factor <= 0 ||
            (Math.abs(factor - 1) < 0.000001 && Math.abs(screenFactor - 1) < 0.000001)) {
            this.destroy();
            return;
        }
        this._factor = factor;
        this._keepPanel = keepPanel;
        if (!this._signals.length) {
            const type = Extension.Type.EXTENSION;
            for (const signal of ["extension-loaded", "extension-unloaded"])
                this._signals.push([type, type.connect(signal, (object, uuid) => {
                    if (uuid === OSD_UUID)
                        this._sync();
                })]);
            if (Main.layoutManager)
                this._signals.push([Main.layoutManager,
                    Main.layoutManager.connect("monitors-changed", () => this._sync())]);
        }
        this._sync();
    }

    _offsets(manager) {
        const settings = manager && manager.settings;
        return settings && Number.isFinite(settings.xRelocation) && Number.isFinite(settings.yRelocation) ?
            [settings.xRelocation, settings.yRelocation] : null;
    }

    _sync() {
        const running = ExtensionSystem.runningExtensions || [];
        const manager = Main.osdWindowManager;
        if (!running.includes(OSD_UUID) || !manager || !this._offsets(manager) ||
            !Array.isArray(manager._osdWindows) || typeof manager._showOsdWindow !== "function") {
            this._detach();
            return;
        }
        if (!this._record || this._record.manager !== manager) {
            this._detach();
            const record = { manager, original: manager._showOsdWindow, applied: new Map() };
            const compensation = this;
            record.wrapper = function (...args) {
                const result = record.original.apply(this, args);
                if (compensation._record === record && this === manager) {
                    compensation._prune(record);
                    compensation._apply(record, manager._osdWindows[args[0]]);
                    compensation._queue(record);
                }
                return result;
            };
            this._record = record;
            manager._showOsdWindow = record.wrapper;
        }
        this._prune(this._record);
        for (const actor of manager._osdWindows) {
            if (actor && (actor.visible || this._record.applied.has(actor)))
                this._apply(this._record, actor);
        }
        if (manager._osdWindows.some(actor => actor && actor.visible))
            this._queue(this._record);
    }

    _prune(record) {
        const current = new Set(record.manager._osdWindows);
        for (const [actor, entry] of record.applied) {
            if (!current.has(actor)) {
                this._unwatch(entry);
                record.applied.delete(actor);
            }
        }
    }

    _queue(record) {
        if (this._paintId || this._record !== record)
            return;
        // Meta's BEFORE_REDRAW still precedes Clutter's layout pass. The
        // stage signal follows it, even when the resulting boxes are unchanged
        // and no allocation-changed signal is emitted.
        this._paintId = global.stage.connect("before-paint", () => {
            global.stage.disconnect(this._paintId);
            this._paintId = 0;
            if (this._record === record) {
                this._prune(record);
                for (const actor of record.applied.keys()) {
                    if (actor.visible)
                        this._apply(record, actor);
                }
            }
        });
        // A first, unmeasured OSD can initially lie entirely off screen.
        // Ensure a paint for that first measurement, not for every volume event.
        if ([...record.applied].some(([actor, entry]) => actor.visible && !entry.ratios))
            global.stage.queue_redraw();
    }

    _watch(record, actor) {
        let entry = record.applied.get(actor);
        if (entry)
            return entry;
        entry = { values: null, ratios: null, factor: null, uiScale: null,
            keepPanel: null, signals: [] };
        record.applied.set(actor, entry);
        for (const object of [actor, actor._hbox]) {
            if (object)
                entry.signals.push([object,
                    object.connect("allocation-changed", () => this._queue(record))]);
        }
        entry.signals.push([actor, actor.connect("destroy", () => {
            this._unwatch(entry);
            record.applied.delete(actor);
        })]);
        return entry;
    }

    _unwatch(entry) {
        for (const [object, id] of entry.signals)
            object.disconnect(id);
        entry.signals = [];
    }

    _workArea(index) {
        const rect = global.workspace_manager.get_workspace_by_index(0)
            .get_work_area_for_monitor(index);
        const area = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        // Match Cinnamon 6.6's MonitorConstraint, which also reserves hidden
        // panels even though they do not contribute workspace struts.
        for (let side = 0; side < 4; side++) {
            const panel = Main.panelManager.getPanel(index, side);
            if (!panel || !panel.isHideable())
                continue;
            if (side < 2) {
                const height = panel.actor.get_height();
                area.height -= height;
                if (side === 0)
                    area.y += height;
            } else {
                const width = panel.actor.get_width();
                area.width -= width;
                if (side === 2)
                    area.x += width;
            }
        }
        return area;
    }

    _placementRatios(actor) {
        const body = actor._hbox;
        const index = actor._monitorIndex;
        const monitor = Main.layoutManager.monitors[index];
        if (!monitor || !body || !actor.has_allocation() || !body.has_allocation())
            return null;

        const area = this._workArea(index);
        const original = [actor.translation_x, actor.translation_y];
        let x, y, width, height, actorX, actorY, actorWidth, actorHeight;
        try {
            actor.translation_x = 0;
            actor.translation_y = 0;
            [x, y] = body.get_transformed_position();
            [width, height] = body.get_transformed_size();
            [actorX, actorY] = actor.get_transformed_position();
            [actorWidth, actorHeight] = actor.get_transformed_size();
        } finally {
            actor.translation_x = original[0];
            actor.translation_y = original[1];
        }
        if (![x, y, width, height, actorX, actorY, actorWidth, actorHeight,
            area.x, area.y, area.width, area.height, monitor.x, monitor.y,
            monitor.width, monitor.height].every(Number.isFinite) || width <= 0 || height <= 0)
            return null;

        const uiScale = Math.max(1, global.ui_scale || 1);
        const factor = this._factor;
        // Reconstruct the unzoomed work area and OSD from the current native
        // allocation. Panel compensation keeps physical struts constant;
        // ordinary panels, OSD contents and theme margins grow with the screen.
        const panelFactor = this._keepPanel ? factor : 1 / uiScale;
        const left = (area.x - monitor.x) * panelFactor;
        const top = (area.y - monitor.y) * panelFactor;
        const right = (monitor.x + monitor.width - area.x - area.width) * panelFactor;
        const bottom = (monitor.y + monitor.height - area.y - area.height) * panelFactor;
        const baseWidth = monitor.width * factor;
        const baseHeight = monitor.height * factor;
        const baseX = left + Math.floor((baseWidth - left - right - actorWidth / uiScale) / 2) +
            (x - actorX) / uiScale;
        const baseY = top + Math.floor(baseHeight - top - bottom - actorHeight / uiScale) +
            (y - actorY) / uiScale;

        const reference = [baseX, baseWidth - baseX - width / uiScale,
            baseY, baseHeight - baseY - height / uiScale];
        const current = [x - monitor.x, monitor.x + monitor.width - x - width,
            y - monitor.y, monitor.y + monitor.height - y - height];
        return current.map((distance, side) => reference[side] > 0 ?
            Math.max(0, distance) / reference[side] : 1 / factor);
    }

    _apply(record, actor) {
        const offsets = this._offsets(record.manager);
        if (!actor || !offsets)
            return;
        const entry = this._watch(record, actor);
        const uiScale = Math.max(1, global.ui_scale || 1);
        if (entry.factor !== this._factor || entry.uiScale !== uiScale || entry.keepPanel !== this._keepPanel)
            entry.ratios = null;
        // OSD150 rebuilds its children on every show, temporarily invalidating
        // their allocation. Keep the last valid ranges until layout is ready;
        // recompute from raw settings so new offsets and direction changes work.
        entry.ratios = this._placementRatios(actor) || entry.ratios;
        entry.factor = this._factor;
        entry.uiScale = uiScale;
        entry.keepPanel = this._keepPanel;
        const [x, y] = offsets.map((value, axis) => value * (entry.ratios ?
            entry.ratios[axis * 2 + (value > 0 ? 1 : 0)] : 1 / this._factor));
        actor.translation_x = x;
        actor.translation_y = y;
        entry.values = [x, y];
    }

    _detach() {
        const record = this._record;
        if (!record)
            return;
        if (this._paintId)
            global.stage.disconnect(this._paintId);
        this._paintId = 0;
        this._record = null;
        if (record.manager._showOsdWindow === record.wrapper)
            record.manager._showOsdWindow = record.original;
        const offsets = this._offsets(record.manager);
        const current = new Set(record.manager._osdWindows);
        if (offsets) {
            for (const [actor, entry] of record.applied) {
                if (!current.has(actor))
                    continue;
                // Restore only translations still owned by this adjustment.
                for (const [index, property] of ["translation_x", "translation_y"].entries()) {
                    if (entry.values && Math.abs(actor[property] - entry.values[index]) < 0.000001)
                        actor[property] = offsets[index];
                }
            }
        }
        for (const entry of record.applied.values())
            this._unwatch(entry);
        record.applied.clear();
    }

    destroy() {
        for (const [object, id] of this._signals)
            object.disconnect(id);
        this._signals = [];
        this._detach();
        this._factor = 1;
        this._keepPanel = false;
    }
}

module.exports = Osd150OffsetCompensation;
