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
const Settings = imports.ui.settings;

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
    // Each managed actor carries two named Clutter effects that are eased
    // toward their target on every focus change (via the actor easing patched
    // in by Cinnamon's environment.js, mirroring core's WindowDimmer). A dimmed
    // window has its brightness pushed below neutral and its colour desaturated;
    // the focused window eases back to neutral, where the effects are disabled
    // again so idle windows pay no GPU cost.

    _setDim: function(actor, dimmed, instant) {
        // Snap (no fade) the first time we see an actor, or when asked to.
        let firstSight = actor._diwSeen !== true;
        let duration = (instant || firstSight) ? 0 : this.animationTime;
        actor._diwSeen = true;
        actor._diwDimmed = dimmed;

        let desat = this._effect(actor, EFFECT_DESAT,
            () => new Clutter.DesaturateEffect({ factor: 0 }));
        let dim = this._effect(actor, EFFECT_DIM,
            () => new Clutter.BrightnessContrastEffect());

        let desatOn = this.mode === "both" || this.mode === "desaturate";
        let dimOn = this.mode === "both" || this.mode === "dim";
        let factor = (dimmed && desatOn) ? this.desaturateAmount : 0;
        // BrightnessContrastEffect.brightness is a Clutter.Color where 127 is
        // neutral; brightness b in [-1, 0] maps to a neutral grey 127*(1 + b).
        let b = (dimmed && dimOn) ? -this.dimAmount : 0;
        let val = Math.round(127 * (1 + b));
        let color = Clutter.Color.new(val, val, val, 255);

        // Keep effects live while (re)animating; _syncEnabled turns off the
        // ones that settle back at neutral.
        desat.enabled = true;
        dim.enabled = true;

        actor.ease_property("@effects." + EFFECT_DESAT + ".factor", factor, {
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: duration,
            onComplete: () => this._syncEnabled(actor)
        });
        actor.ease_property("@effects." + EFFECT_DIM + ".brightness", color, {
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: duration,
            onComplete: () => this._syncEnabled(actor)
        });
    },

    _effect: function(actor, name, create) {
        let e = actor.get_effect(name);
        if (!e) {
            e = create();
            actor.add_effect_with_name(name, e);
        }
        return e;
    },

    // Disable an effect once it has settled at neutral (no transition running),
    // mirroring Cinnamon's own WindowDimmer so idle windows cost nothing.
    _syncEnabled: function(actor) {
        try {
            let desat = actor.get_effect(EFFECT_DESAT);
            if (desat) {
                let animating = actor.get_transition("@effects." + EFFECT_DESAT + ".factor") != null;
                desat.enabled = animating || desat.factor > EPS;
            }
            let dim = actor.get_effect(EFFECT_DIM);
            if (dim) {
                let animating = actor.get_transition("@effects." + EFFECT_DIM + ".brightness") != null;
                dim.enabled = animating || dim.brightness.red != 127;
            }
        } catch (e) {
            // Actor may have been destroyed mid-fade; nothing to do.
        }
    },

    _reset: function(actor) {
        try {
            actor.remove_transition("@effects." + EFFECT_DESAT + ".factor");
            actor.remove_transition("@effects." + EFFECT_DIM + ".brightness");
            if (actor.get_effect(EFFECT_DESAT))
                actor.remove_effect_by_name(EFFECT_DESAT);
            if (actor.get_effect(EFFECT_DIM))
                actor.remove_effect_by_name(EFFECT_DIM);
        } catch (e) {}
        delete actor._diwSeen;
        delete actor._diwDimmed;
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
