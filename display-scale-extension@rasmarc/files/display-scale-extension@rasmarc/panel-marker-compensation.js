// Easy Effects Selector's deviation dot is an independently sized St.Icon.
// Preserve its logical size alongside ordinary panel icons, without changing
// the selector's files, visibility or quick-slot alignment.
const AppletManager = imports.ui.appletManager;

class PanelMarkerCompensation {
    constructor() {
        this._factor = 1;
        this._icons = new Map();
        this._writing = false;
    }

    update(factor, enabled) {
        if (!enabled || factor <= 1) {
            this.destroy();
            return;
        }
        const changed = factor !== this._factor;
        this._factor = factor;
        const seen = new Set();
        for (const applet of AppletManager.getRunningInstancesForUuid("easy-effects-selector@rasmarc")) {
            const icon = applet._presetDot;
            if (!icon || !(icon.icon_size > 0))
                continue;
            seen.add(icon);
            let record = this._icons.get(icon);
            if (!record) {
                record = { icon, original: icon.icon_size, applied: null, ids: [] };
                record.ids.push(icon.connect("destroy", () => this._icons.delete(icon)));
                record.ids.push(icon.connect("notify::icon-size", () => {
                    if (!this._writing && icon.icon_size !== record.applied) {
                        record.original = icon.icon_size;
                        this._apply(record);
                    }
                }));
                this._icons.set(icon, record);
                this._apply(record);
            } else if (changed) {
                this._apply(record);
            }
        }
        for (const [icon, record] of this._icons) {
            if (!seen.has(icon)) {
                this._restore(record);
                this._icons.delete(icon);
            }
        }
    }

    _apply(record) {
        this._writing = true;
        try {
            record.applied = Math.max(1, Math.round(record.original / this._factor));
            record.icon.icon_size = record.applied;
        } finally {
            this._writing = false;
        }
    }

    _restore(record) {
        for (const id of record.ids)
            record.icon.disconnect(id);
        if (record.icon.icon_size === record.applied)
            record.icon.icon_size = record.original;
    }

    destroy() {
        this._factor = 1;
        for (const record of this._icons.values())
            this._restore(record);
        this._icons.clear();
    }
}

module.exports = PanelMarkerCompensation;
