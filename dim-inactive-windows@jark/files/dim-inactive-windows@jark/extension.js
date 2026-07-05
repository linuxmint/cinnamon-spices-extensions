/*
 * Dim Inactive Windows - Cinnamon extension
 *
 * Fades a dim/desaturate effect onto every inactive window and removes it from
 * the focused window. Works per Meta.WindowActor -> per window, NOT per app,
 * so two windows of the same application (e.g. an IDE main window and its
 * free-floating terminal) are told apart.
 */

const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;

const FRAME_MS = 16;   // ~60 fps

const EFFECT_DESAT = "dim-inactive-desat";
const EFFECT_DIM = "dim-inactive-dim";
const EPS = 0.001;

let manager = null;

function DimInactiveWindows(meta) {
    this._init(meta);
}

DimInactiveWindows.prototype = {

    _init: function(meta) {
        this.uuid = meta.uuid;
        this._signals = [];

        // Overwritten by the settings bindings below; safe fallbacks otherwise.
        this.mode = "both";
        this.dimAmount = 0.25;
        this.desaturateAmount = 0.5;
        this.animationTime = 150;      // ms
        this.respectTransient = false;
        this.dimWhenNoFocus = false;

        this.settings = new Settings.ExtensionSettings(this, this.uuid);
        let reapply = () => this._updateAll(true);   // instant re-apply on change
        this.settings.bind("mode", "mode", reapply);
        this.settings.bind("dim-amount", "dimAmount", reapply);
        this.settings.bind("desaturate-amount", "desaturateAmount", reapply);
        this.settings.bind("animation-time", "animationTime", reapply);
        this.settings.bind("respect-transient", "respectTransient", reapply);
        this.settings.bind("dim-when-no-focus", "dimWhenNoFocus", reapply);
    },

    enable: function() {
        this._connect(global.display, "notify::focus-window");
        this._connect(global.window_manager, "map");
        this._connect(global.window_manager, "destroy");
        this._connect(global.window_manager, "switch-workspace");
        this._updateAll(true);   // snap to correct state, no initial fade
    },

    disable: function() {
        for (let i = 0; i < this._signals.length; i++) {
            let [obj, id] = this._signals[i];
            try { obj.disconnect(id); } catch (e) {}
        }
        this._signals = [];
        this._clearAll();
        try { this.settings.finalize(); } catch (e) {}
    },

    _connect: function(obj, signal) {
        let id = obj.connect(signal, () => this._updateAll(false));
        this._signals.push([obj, id]);
    },

    // --- Core logic ------------------------------------------------------

    _updateAll: function(instant) {
        let focus = global.display.get_focus_window();
        let actors = global.get_window_actors();

        for (let i = 0; i < actors.length; i++) {
            let actor = actors[i];
            let mw = actor.get_meta_window();

            if (!mw || this._skip(mw)) {
                this._reset(actor);
                continue;
            }
            this._setDim(actor, !this._isActive(mw, focus), instant);
        }
    },

    // Only manage real content windows. Menus, tooltips, notifications,
    // panels/docks, the desktop and override-redirect overlays stay untouched.
    _skip: function(mw) {
        let t = mw.get_window_type();
        return !(t === Meta.WindowType.NORMAL ||
                 t === Meta.WindowType.DIALOG ||
                 t === Meta.WindowType.MODAL_DIALOG ||
                 t === Meta.WindowType.UTILITY);
    },

    // Active = the focused window itself, or (only when respectTransient is on)
    // its parent while a MODAL dialog child holds focus. Deliberately no app /
    // PID grouping, so sibling windows of one app stay independent.
    _isActive: function(mw, focus) {
        if (!focus)
            return !this.dimWhenNoFocus;
        if (mw === focus)
            return true;
        if (!this.respectTransient)
            return false;
        if (this._isModal(focus) && this._inTransientChain(focus, mw))
            return true;
        return false;
    },

    _isModal: function(mw) {
        return mw.get_window_type() === Meta.WindowType.MODAL_DIALOG;
    },

    // Walks the transient_for chain up from "start" and checks for "target".
    _inTransientChain: function(start, target) {
        let seen = new Set();
        let w = start.get_transient_for();
        while (w && !seen.has(w)) {
            if (w === target)
                return true;
            seen.add(w);
            w = w.get_transient_for();
        }
        return false;
    },

    // --- Effect handling with fade --------------------------------------
    // Each managed actor carries a float "level" in [0, 1] (0 = active/neutral,
    // 1 = fully dimmed) that is animated by a ~60 fps GLib timeout. Every frame
    // we set both effect values from that float with full precision, so the fade
    // stays perfectly smooth: set_brightness() takes a float, whereas easing the
    // BrightnessContrastEffect.brightness *property* would quantise it to an
    // integer Clutter.Color and look stepped. A plain GLib source is used because
    // a stand-alone Clutter.Timeline has no frame clock in this Muffin version.

    _setDim: function(actor, dimmed, instant) {
        let target = dimmed ? 1 : 0;
        let firstSight = actor._diwLevel === undefined;
        let duration = this.animationTime;

        this._effect(actor, EFFECT_DESAT, () => new Clutter.DesaturateEffect({ factor: 0 }));
        this._effect(actor, EFFECT_DIM, () => new Clutter.BrightnessContrastEffect());

        // Snap (no fade) on first sighting or when an instant update is asked for.
        if (firstSight || instant || duration <= 0) {
            this._stopAnim(actor);
            actor._diwLevel = target;
            actor._diwTarget = target;
            this._apply(actor, target);
            return;
        }

        if (actor._diwTarget === target)
            return;   // already at or heading toward this target

        this._stopAnim(actor);
        let from = actor._diwLevel;
        actor._diwTarget = target;
        let start = GLib.get_monotonic_time();   // microseconds

        actor._diwTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FRAME_MS, () => {
            let t = (GLib.get_monotonic_time() - start) / 1000 / duration;
            if (t >= 1) {
                actor._diwLevel = target;
                this._apply(actor, target);
                actor._diwTimer = 0;
                return GLib.SOURCE_REMOVE;
            }
            let p = 1 - (1 - t) * (1 - t);   // easeOutQuad
            actor._diwLevel = from + (target - from) * p;
            this._apply(actor, actor._diwLevel);
            return GLib.SOURCE_CONTINUE;
        });
    },

    // Apply a float level to both effects; disable an effect at neutral so idle
    // (active) windows pay no GPU cost.
    _apply: function(actor, level) {
        try {
            let desatOn = this.mode === "both" || this.mode === "desaturate";
            let dimOn = this.mode === "both" || this.mode === "dim";

            let desat = actor.get_effect(EFFECT_DESAT);
            if (desat) {
                let on = level > EPS && desatOn;
                desat.enabled = on;
                desat.set_factor(on ? level * this.desaturateAmount : 0);
            }
            let dim = actor.get_effect(EFFECT_DIM);
            if (dim) {
                let on = level > EPS && dimOn;
                dim.enabled = on;
                dim.set_brightness(on ? -(level * this.dimAmount) : 0);
            }
        } catch (e) {
            // Actor may have been destroyed mid-fade; nothing to do.
        }
    },

    _effect: function(actor, name, create) {
        let e = actor.get_effect(name);
        if (!e) {
            e = create();
            actor.add_effect_with_name(name, e);
        }
        return e;
    },

    _stopAnim: function(actor) {
        if (actor._diwTimer) {
            try { GLib.source_remove(actor._diwTimer); } catch (e) {}
            actor._diwTimer = 0;
        }
    },

    _reset: function(actor) {
        this._stopAnim(actor);
        try {
            if (actor.get_effect(EFFECT_DESAT))
                actor.remove_effect_by_name(EFFECT_DESAT);
            if (actor.get_effect(EFFECT_DIM))
                actor.remove_effect_by_name(EFFECT_DIM);
        } catch (e) {}
        delete actor._diwLevel;
        delete actor._diwTarget;
    },

    _clearAll: function() {
        let actors = global.get_window_actors();
        for (let i = 0; i < actors.length; i++)
            this._reset(actors[i]);
    }
};

// --- Cinnamon entry points ----------------------------------------------

function init(meta) {
    manager = new DimInactiveWindows(meta);
    return manager;
}

function enable() {
    manager.enable();
}

function disable() {
    manager.disable();
    manager = null;
}
