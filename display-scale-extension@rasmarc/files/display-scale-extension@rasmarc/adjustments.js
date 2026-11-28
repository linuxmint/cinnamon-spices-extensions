// All changes to Cinnamon's panels, window lists and desklets live here.
const Main = imports.ui.main;
const WindowListSpacingGuard = require("./window-list-spacing");
const PanelCompensation = require("./panel-compensation");
const DeskletPositionCompensation = require("./desklet-position-compensation");
const Osd150OffsetCompensation = require("./osd150-offset-compensation");

class DisplayScaleExtension {
    constructor() {
        this.apiVersion = 1;
        this.available = true;
        this._owner = null;
        this._spacingGuard = null;
        this._panelCompensation = null;
        this._deskletCompensation = null;
        this._osd150Compensation = null;
    }

    register(owner) {
        if (!this.available || typeof owner !== "string" || !owner)
            return false;
        if (owner !== this._owner) {
            this._clear();
            this._owner = owner;
            this._spacingGuard = new WindowListSpacingGuard();
            this._panelCompensation = new PanelCompensation();
            this._deskletCompensation = new DeskletPositionCompensation();
            this._osd150Compensation = new Osd150OffsetCompensation();
        }
        return true;
    }

    _owns(owner) {
        return this.available && owner === this._owner && this._panelCompensation !== null;
    }

    prepareDesklets(owner, enabled) {
        if (this._owns(owner))
            this._deskletCompensation.prepare(enabled === true);
    }

    suspend(owner) {
        if (!this._owns(owner))
            return;
        this._spacingGuard.setEnabled(false);
        this._panelCompensation.suspend();
    }

    retarget(owner, percent) {
        if (this._owns(owner))
            this._panelCompensation.retargetSuspended(percent);
    }

    update(owner, state) {
        if (!this._owns(owner) || !state ||
            ![state.screenPercent, state.textFactor, state.totalPercent].every(value =>
                Number.isFinite(value) && value > 0))
            return false;
        const keepPanel = state.keepPanel === true;
        const screenMode = state.screenMode === true;
        this._spacingGuard.setEnabled(keepPanel && screenMode && state.screenPercent > 100);
        if (screenMode) {
            this._panelCompensation.update(true, state.screenPercent,
                keepPanel, keepPanel, keepPanel && !state.growPanelText, state.textFactor);
        } else {
            this._panelCompensation.updateText(state.textFactor * 100,
                keepPanel, !state.growPanelText);
        }
        this._deskletCompensation.update(screenMode && state.totalPercent > 100,
            state.screenPercent / Math.max(1, global.ui_scale || 1), state.keepDeskletCenters === true);
        this._osd150Compensation.update(state.screenPercent,
            screenMode && state.keepOsd150Offset === true, keepPanel);
        return true;
    }

    redraw(owner) {
        if (!this._owns(owner) || !Main.panelManager)
            return;
        for (const panel of Main.panelManager.getPanels()) {
            if (panel && !panel._destroyed && panel.actor)
                panel.actor.queue_redraw();
        }
    }

    release(owner) {
        if (owner === this._owner)
            this._clear();
    }

    _clear() {
        for (const object of [this._spacingGuard, this._panelCompensation, this._deskletCompensation,
            this._osd150Compensation]) {
            if (object) {
                try { object.destroy(); } catch (error) { global.logError(error); }
            }
        }
        this._owner = null;
        this._spacingGuard = this._panelCompensation = this._deskletCompensation = null;
        this._osd150Compensation = null;
    }

    destroy() {
        this.available = false;
        this._clear();
    }
}

module.exports = DisplayScaleExtension;
