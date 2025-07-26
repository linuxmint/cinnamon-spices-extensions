// === TRANSITION MANAGER ===
// Centralized management of transition effects for the Cinnamon-Screenshot extension

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

// === CONSTANTS ===
const TRANSITION_DURATION = 230;
const INTERMEDIATE_TRANSITION_DURATION = 180;
const TRANSITION_MODE = Clutter.AnimationMode.EASE_OUT_CUBIC;

// === TRANSITION MANAGER CLASS ===
class TransitionManager {
    constructor() {
        this._isTransitioning = false;
        this._enabled = true; // Can be disabled via settings
    }

    setEnabled(enabled) {
        this._enabled = enabled;
    }

    isEnabled() {
        return this._enabled;
    }

    isTransitioning() {
        return this._isTransitioning;
    }

    // === OPENING TRANSITION ===
    fadeIn(dialog, options = {}) {
        if (!this._enabled) {
            this._isTransitioning = false;
            return;
        }

        this._isTransitioning = true;
        const duration = options.duration || TRANSITION_DURATION;
        const mode = options.mode || TRANSITION_MODE;

        // Set initial state - simple fade, no scale
        dialog.opacity = 0;

        // Animate to final state - just fade in
        dialog.ease({
            opacity: 255,
            duration: duration,
            mode: mode,
            onComplete: () => {
                this._isTransitioning = false;
                if (options.onComplete) options.onComplete();
            }
        });

        // Animate toolbar with slide from top + fade
        if (dialog._toolbar) {
            dialog._toolbar.opacity = 0;
            dialog._toolbar.translation_y = -40; // Small slide from the top
            dialog._toolbar.ease({
                opacity: 255,
                translation_y: 0,
                duration: duration + 80, // Delay for staggered effect
                mode: mode
            });
        }

        // Animate superposeBox with simple fade and slight delay
        if (dialog._superposeBox) {
            dialog._superposeBox.opacity = 0;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 90, () => {
                dialog._superposeBox.ease({
                    opacity: 255,
                    duration: duration + 150,
                    mode: mode
                });
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // === CLOSING TRANSITION ===
    fadeOut(dialog, options = {}) {
        if (!this._enabled) {
            if (options.onComplete) options.onComplete();
            return;
        }

        this._isTransitioning = true;
        const duration = options.duration || INTERMEDIATE_TRANSITION_DURATION;
        const mode = options.mode || TRANSITION_MODE;

        // Animate main dialog - simple fade out
        dialog.ease({
            opacity: 0,
            duration: duration,
            mode: mode,
            onComplete: () => {
                this._isTransitioning = false;
                if (options.onComplete) options.onComplete();
            }
        });

        if (dialog._toolbar) {
            dialog._toolbar.ease({
                opacity: 0,
                duration: duration - 180,
                mode: mode
            });
        }

        if (dialog._superposeBox) {
            dialog._superposeBox.ease({
                opacity: 0,
                duration: duration - 180,
                mode: mode
            });
        }
    }
}

/**
 * Gets the singleton instance of the transition manager
 * @returns {TransitionManager} The transition manager instance
 */
let _transitionManager = null;

function getTransitionManager() {
    if (!_transitionManager) {
        _transitionManager = new TransitionManager();
    }
    return _transitionManager;
}
