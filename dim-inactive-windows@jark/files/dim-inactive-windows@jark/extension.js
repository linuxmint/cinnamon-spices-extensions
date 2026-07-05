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
const Tweener = imports.ui.tweener;

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
    // Each managed actor carries a state object { level } in [0, 1]:
    //   0 = fully active (no effect), 1 = fully dimmed.

    _setDim: function(actor, dimmed, instant) {
        let target = dimmed ? 1 : 0;
        let time = this.animationTime / 1000;

        // First time we see this actor: snap, don't fade (avoids a flash).
        if (!actor._dimState) {
            actor._dimState = { level: target };
            actor._dimTarget = target;
            this._apply(actor, target);
            return;
        }

        if (instant || time <= 0) {
            Tweener.removeTweens(actor._dimState);
            actor._dimTarget = target;
            actor._dimState.level = target;
            this._apply(actor, target);
            return;
        }

        if (actor._dimTarget === target)
            return;   // already heading there

        actor._dimTarget = target;
        Tweener.removeTweens(actor._dimState);
        Tweener.addTween(actor._dimState, {
            level: target,
            time: time,
            transition: "easeOutQuad",
            onUpdate: () => this._apply(actor, actor._dimState.level),
            onComplete: () => this._apply(actor, target)
        });
    },

    _apply: function(actor, level) {
        try {
            let wantDesat = level > EPS && (this.mode === "both" || this.mode === "desaturate");
            let wantDim = level > EPS && (this.mode === "both" || this.mode === "dim");

            if (wantDesat) {
                let e = actor.get_effect(EFFECT_DESAT);
                if (!e) {
                    e = new Clutter.DesaturateEffect({ factor: 0 });
                    actor.add_effect_with_name(EFFECT_DESAT, e);
                }
                e.set_factor(level * this.desaturateAmount);
            } else if (actor.get_effect(EFFECT_DESAT)) {
                actor.remove_effect_by_name(EFFECT_DESAT);
            }

            if (wantDim) {
                let e = actor.get_effect(EFFECT_DIM);
                if (!e) {
                    e = new Clutter.BrightnessContrastEffect();
                    actor.add_effect_with_name(EFFECT_DIM, e);
                }
                e.set_brightness(-(level * this.dimAmount));
            } else if (actor.get_effect(EFFECT_DIM)) {
                actor.remove_effect_by_name(EFFECT_DIM);
            }
        } catch (e) {
            // Actor may have been destroyed mid-tween; nothing to do.
        }
    },

    _reset: function(actor) {
        if (actor._dimState) {
            Tweener.removeTweens(actor._dimState);
            delete actor._dimState;
            delete actor._dimTarget;
        }
        try {
            if (actor.get_effect(EFFECT_DESAT))
                actor.remove_effect_by_name(EFFECT_DESAT);
            if (actor.get_effect(EFFECT_DIM))
                actor.remove_effect_by_name(EFFECT_DIM);
        } catch (e) {}
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
