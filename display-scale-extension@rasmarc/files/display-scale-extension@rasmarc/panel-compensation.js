// Counter-size Cinnamon panels before XRandR enlarges the finished output.
// Original panel settings remain the source of truth. Runtime methods, size
// caches and text styles are adjusted; nothing is saved to dconf.

const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const AppletManager = imports.ui.appletManager;
const PanelTextCompensation = require("./panel-text-compensation");
const PanelMarkerCompensation = require("./panel-marker-compensation");

const SIZE_METHODS = ["_getScaledPanelHeight", "_clampPanelZoneColorIconSize", "_clampPanelZoneSymbolicIconSize"];

class PanelCompensation {
    constructor() {
        this._factor = 1;
        this._textOnly = false;
        this._textFactor = 1;
        this._fontMode = "output";
        this._outputFactor = 1;
        this._keepHeight = false;
        this._keepIcons = false;
        this._keepText = false;
        this._textCompensation = new PanelTextCompensation();
        this._markerCompensation = new PanelMarkerCompensation();
        this._records = new Map();
        this._sourceId = 0;
        this._reportedError = false;
        this._refreshPending = false;
        this._suspended = false;
    }

    update(uiMode, percent, keepHeight, keepIcons, keepText = false, textFactor = 1) {
        const factor = percent / 100;
        const fontFactor = factor * textFactor;
        if (!uiMode || !Number.isFinite(fontFactor) || factor < 1 || textFactor <= 0 ||
            !(keepHeight || keepIcons || keepText) || (factor === 1 && fontFactor === 1)) {
            this._stop();
            return;
        }
        const changed = this._suspended || factor !== this._factor || fontFactor !== this._textFactor ||
            keepHeight !== this._keepHeight || keepIcons !== this._keepIcons || keepText !== this._keepText;
        this._suspended = false;
        this._textOnly = factor === 1;
        this._textFactor = fontFactor;
        this._fontMode = "hybrid";
        this._outputFactor = factor;
        this._factor = factor;
        this._keepHeight = keepHeight;
        this._keepIcons = keepIcons;
        this._keepText = keepText;
        this._scan(changed);
        this._ensureTimer();
    }

    updateText(percent, keepPanel, keepText) {
        if (!keepPanel || !Number.isFinite(percent)) {
            this._stop();
            return;
        }
        const factor = Math.max(1, percent / 100);
        const changed = this._suspended || !this._textOnly || factor !== this._textFactor || keepText !== this._keepText;
        this._suspended = false;
        this._textOnly = true;
        this._textFactor = factor;
        this._fontMode = "text";
        this._outputFactor = 1;
        // Text scaling does not magnify finished pixels: native heights,
        // pixel icons and the preset dot must retain their original sizes.
        this._factor = 1;
        this._keepHeight = false;
        this._keepIcons = false;
        this._keepText = keepText;
        this._scan(changed);
        this._ensureTimer();
    }

    suspend() {
        if (this._suspended)
            return;
        this._suspended = true;
        if (this._sourceId) {
            Mainloop.source_remove(this._sourceId);
            this._sourceId = 0;
        }
        try {
            this._textCompensation.suspend();
        } catch (error) {
            this._reportError(error);
        }
    }

    retargetSuspended(percent) {
        if (!this._suspended || !Number.isFinite(percent) || percent < 100)
            return;
        // The native reply is authoritative. Correct the held display sizes
        // now, before waiting for DPI/theme processing and measuring again.
        this._factor = this._outputFactor = percent / 100;
        try {
            this._textCompensation.retargetSuspended(this._factor);
            for (const record of this._records.values())
                this._refresh(record.panel);
            this._markerCompensation.update(this._factor, this._keepIcons);
        } catch (error) {
            this._reportError(error);
        }
    }

    _ensureTimer() {
        if (!this._sourceId) {
            this._sourceId = Mainloop.timeout_add(1000, () => {
                this._scan(false);
                return true;
            });
        }
    }

    _panels() {
        return Main.panelManager ? Main.panelManager.getPanels().filter(panel => panel && !panel._destroyed) : [];
    }

    _install(panel) {
        if (SIZE_METHODS.some(name => typeof panel[name] !== "function") ||
            typeof panel._moveResizePanel !== "function" || typeof panel._onPanelZoneSizesChanged !== "function")
            return null;
        const record = { panel, descriptors: {}, originals: {}, wrappers: {} };
        for (const name of SIZE_METHODS) {
            record.descriptors[name] = Object.getOwnPropertyDescriptor(panel, name);
            record.originals[name] = panel[name];
        }
        const compensation = this;
        record.wrappers._getScaledPanelHeight = function(...args) {
            const original = record.originals._getScaledPanelHeight.apply(this, args);
            if (!compensation._keepHeight || compensation._factor === 1)
                return original;
            // The normal panel preference has a 20 px lower limit. Preserve
            // that limit in Cinnamon's own scale units as well.
            return Math.max(20, Math.round(original / global.ui_scale / compensation._factor)) * global.ui_scale;
        };
        for (const name of SIZE_METHODS.slice(1)) {
            record.wrappers[name] = function(...args) {
                if (!compensation._keepIcons || compensation._factor === 1)
                    return record.originals[name].apply(this, args);
                // Resolve 'exact' and 'optimal' icon sizes against the original
                // panel height, then compensate once. A lightweight context
                // supplies the original height without resizing the real panel.
                const originalContext = Object.create(this);
                Object.defineProperty(originalContext, "height", {
                    value: record.originals._getScaledPanelHeight.call(this)
                });
                const original = record.originals[name].apply(originalContext, args);
                const minimum = name === "_clampPanelZoneSymbolicIconSize" ? 10 : 1;
                return Math.max(minimum, Math.round(original / compensation._factor));
            };
        }
        for (const name of SIZE_METHODS) {
            Object.defineProperty(panel, name, {
                configurable: true, writable: true, value: record.wrappers[name]
            });
        }
        return record;
    }

    _refresh(panel) {
        if (panel._destroyed)
            return;
        // Use Cinnamon's normal resize path so panel placement, struts,
        // applet heights and icon-size signals all follow the new dimensions.
        panel._moveResizePanel();
        panel._onPanelZoneSizesChanged();
        panel.actor.queue_relayout();
    }

    _scan(refreshAll) {
        if (this._suspended)
            return;
        try {
            // Applets are still constructing and adding their actor trees
            // during login. Start observing/restyling them only after their
            // initial load completes; the existing timer retries this pass.
            if (AppletManager.appletsLoaded === false) {
                this._refreshPending = this._refreshPending || refreshAll;
                return;
            }
            refreshAll = refreshAll || this._refreshPending;
            this._refreshPending = false;
            // Native geometry writes must not be measured with outgoing font factors.
            // Weak 100% font references survive this suspension.
            if (refreshAll)
                this._textCompensation.destroy();
            const panels = new Set(this._panels());
            for (const [panel, record] of this._records) {
                if (this._textOnly || !panels.has(panel)) {
                    this._restoreMethods(record);
                    this._records.delete(panel);
                    if (this._textOnly)
                        this._refresh(panel);
                }
            }
            for (const panel of this._textOnly ? [] : panels) {
                let record = this._records.get(panel);
                const newlyAdded = !record;
                if (!record) {
                    record = this._install(panel);
                    if (!record)
                        continue;
                    this._records.set(panel, record);
                }
                if (refreshAll || newlyAdded)
                    this._refresh(panel);
            }
            this._textCompensation.update([...panels], this._textFactor, this._keepText, true,
                this._fontMode, this._outputFactor);
            this._markerCompensation.update(this._factor, this._keepIcons);
        } catch (error) {
            this._reportError(error);
        }
    }

    _restoreMethods(record) {
        for (const name of SIZE_METHODS) {
            // Do not overwrite an extension that replaced our wrapper later.
            if (record.panel[name] !== record.wrappers[name])
                continue;
            const descriptor = record.descriptors[name];
            if (descriptor)
                Object.defineProperty(record.panel, name, descriptor);
            else
                delete record.panel[name];
        }
    }

    _reportError(error) {
        if (!this._reportedError) {
            this._reportedError = true;
            global.logError(error);
        }
    }

    _stop() {
        this._suspended = false;
        this._factor = 1;
        this._textOnly = false;
        this._textFactor = 1;
        this._keepHeight = false;
        this._keepIcons = false;
        this._keepText = false;
        this._refreshPending = false;
        this._textCompensation.destroy();
        this._markerCompensation.destroy();
        if (this._sourceId) {
            Mainloop.source_remove(this._sourceId);
            this._sourceId = 0;
        }
        const records = [...this._records.values()];
        this._records.clear();
        for (const record of records) {
            try {
                this._restoreMethods(record);
                this._refresh(record.panel);
            } catch (error) {
                this._reportError(error);
            }
        }
    }

    destroy() {
        this._stop();
    }
}

module.exports = PanelCompensation;
