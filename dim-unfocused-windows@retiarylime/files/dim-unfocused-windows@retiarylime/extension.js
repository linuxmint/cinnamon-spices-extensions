/*
 * Dim Unfocused Windows - Simplified Version
 * 
 * This version focuses on core functionality without complex settings
 */

const UUID = "dim-unfocused-windows@retiarylime";
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;
const Tweener = imports.ui.tweener;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;

let extension = null;

function DimUnfocusedWindowsExtension() {
    this._init();
}

DimUnfocusedWindowsExtension.prototype = {
    
    _init: function() {
        this._signals = new SignalManager.SignalManager(null);
        this._windowStates = new Map();
        this._activeWindow = null;
        
        // Set default values first
        this.opacity = 70;
        this.brightness = 70;
        this.animationTime = 300;
        this.animationType = "easeInOutQuad";
        this.excludeDialogs = true;
        this.disableDimMinimized = true;
        this.excludeWindowTitles = "Picture in picture";
        this.toggleKeybinding = "<Super><Shift>d";
        this.dimmingEnabled = true;
        
        // Settings - try to bind with error handling
        try {
            this.settings = new Settings.ExtensionSettings(this, UUID);
            this.settings.bind("opacity", "opacity", this._onSettingsChanged);
            this.settings.bind("brightness", "brightness", this._onSettingsChanged);
            this.settings.bind("animation-time", "animationTime", this._onSettingsChanged);
            this.settings.bind("animation-type", "animationType", this._onSettingsChanged);
            this.settings.bind("exclude-dialogs", "excludeDialogs", this._onSettingsChanged);
            this.settings.bind("disable-dim-minimized", "disableDimMinimized", this._onSettingsChanged);
            this.settings.bind("exclude-window-titles", "excludeWindowTitles", this._onSettingsChanged);
            this.settings.bind("toggle-keybinding", "toggleKeybinding", this._onKeybindingChanged);
        } catch (e) {
            global.log("[" + UUID + "] Settings binding failed, using defaults: " + e);
        }
        
        global.log("[" + UUID + "] Extension initialized with opacity: " + this.opacity + "%, brightness: " + this.brightness + "%, exclude dialogs: " + this.excludeDialogs + ", disable dim minimized: " + this.disableDimMinimized + ", exclude titles: '" + this.excludeWindowTitles + "'");
    },
    
    enable: function() {
        global.log("[" + UUID + "] Enabling extension");
        
        // Connect to window focus events
        this._signals.connect(global.display, 'notify::focus-window', 
                             this._onFocusChanged, this);
        
        // Connect to window creation events
        this._signals.connect(global.display, 'window-created', 
                             this._onWindowCreated, this);
        
        // Set up keybinding
        this._setupKeybinding();
        
        // Initialize existing windows
        this._initializeExistingWindows();
        
        // Set initial focus state
        this._onFocusChanged();
    },
    
    disable: function() {
        global.log("[" + UUID + "] Disabling extension");
        
        // Restore all windows
        this._restoreAllWindows();
        
        // Clean up keybinding
        this._cleanupKeybinding();
        
        // Disconnect signals
        if (this._signals) {
            this._signals.disconnectAllSignals();
        }
        
        // Clean up
        this._windowStates.clear();
        this._activeWindow = null;
        
        // Finalize settings
        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
    },
    
        _onSettingsChanged: function() {
        global.log("[" + UUID + "] Settings changed - opacity: " + this.opacity + "%, brightness: " + this.brightness + "%, animation: " + this.animationTime + "ms, exclude dialogs: " + this.excludeDialogs + ", disable dim minimized: " + this.disableDimMinimized + ", exclude titles: '" + this.excludeWindowTitles + "'");
        
        // Update focused window to full brightness/opacity
        if (this._activeWindow) {
            let actor = this._activeWindow.get_compositor_private();
            if (actor) {
                Tweener.removeTweens(actor);
                
                // Remove brightness effect and ensure full opacity
                let state = this._windowStates.get(this._activeWindow);
                if (state && state.brightnessEffect) {
                    actor.remove_effect(state.brightnessEffect);
                    state.brightnessEffect = null;
                }
                actor.opacity = 255;
                
                let windowTitle = this._activeWindow.get_title().substring(0, 30) + "...";
                global.log("[" + UUID + "] Updated focused '" + windowTitle + "' to full brightness");
            }
        }
        
        // Immediately update all currently dimmed windows with new settings
        for (let [window, state] of this._windowStates) {
            if (state.isDimmed) {
                this._applyDimmingToWindow(window, false); // false = no animation for immediate update
            }
        }
        
        // Also reapply dimming for consistency
        if (this._activeWindow) {
            this._dimUnfocusedWindows();
        }
    },
    
    _applyDimmingToWindow: function(window, animate) {
        let actor = window.get_compositor_private();
        if (!actor) return;
        
        let state = this._windowStates.get(window);
        if (!state) return;
        
        let windowTitle = window.get_title().substring(0, 30) + "...";
        
        // Apply opacity
        let targetOpacity = Math.round(255 * (this.opacity / 100));
        
        // Apply brightness effect
        // Remove existing brightness effect if any
        if (state.brightnessEffect) {
            actor.remove_effect(state.brightnessEffect);
        }
        
        // Create new brightness effect: 0% = -1.0 (completely dark), 100% = 0.0 (normal brightness)
        let targetBrightness = (this.brightness - 100) / 100.0; // Convert 0-100% to -1.0 to 0.0
        state.brightnessEffect = new Clutter.BrightnessContrastEffect();
        state.brightnessEffect.set_brightness(targetBrightness);
        state.brightnessEffect.set_contrast(0.0); // Keep contrast normal
        
        actor.add_effect(state.brightnessEffect);
        
        if (animate) {
            // Animate both opacity and brightness
            Tweener.addTween(actor, {
                opacity: targetOpacity,
                time: this.animationTime / 1000,
                transition: this.animationType
            });
            
            // Animate brightness effect
            this._animateBrightness(actor, state.brightnessEffect, targetBrightness, this.animationTime);
        } else {
            actor.opacity = targetOpacity;
            // Brightness is already set above
        }
        
        global.log("[" + UUID + "] Applied dimming to '" + windowTitle + "' (opacity: " + targetOpacity + ", brightness: " + targetBrightness + ")");
    },
    
    _animateBrightness: function(actor, brightnessEffect, targetBrightness, duration) {
        // Get the current brightness value (assuming it starts from 0.0 for full brightness)
        let startBrightness = 0.0; // Full brightness
        let startTime = Date.now();
        
        let animate = () => {
            let elapsed = Date.now() - startTime;
            let progress = Math.min(elapsed / duration, 1.0);
            
            // Apply easing function based on animation type
            let easedProgress = this._applyEasing(progress, this.animationType);
            
            // Interpolate between start and target brightness
            let currentBrightness = startBrightness + (targetBrightness - startBrightness) * easedProgress;
            
            brightnessEffect.set_brightness(currentBrightness);
            
            if (progress < 1.0) {
                // Continue animation
                setTimeout(animate, 16); // ~60fps
            }
        };
        
        animate();
    },
    
    _applyEasing: function(t, easingType) {
        // Apply the same easing functions as Tweener
        switch (easingType) {
            case 'linear':
                return t;
            case 'easeInQuad':
                return t * t;
            case 'easeOutQuad':
                return t * (2 - t);
            case 'easeInOutQuad':
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            case 'easeInCubic':
                return t * t * t;
            case 'easeOutCubic':
                let t1 = t - 1;
                return t1 * t1 * t1 + 1;
            case 'easeInOutCubic':
                return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
            default:
                return t; // Default to linear
        }
    },
    
    _onKeybindingChanged: function() {
        // Clean up old keybinding and set up new one
        this._cleanupKeybinding();
        this._setupKeybinding();
    },
    
    _setupKeybinding: function() {
        if (this.toggleKeybinding && this.toggleKeybinding !== "") {
            Main.keybindingManager.addHotKey(UUID + "-toggle", this.toggleKeybinding, () => {
                this._toggleDimming();
            });
            global.log("[" + UUID + "] Keybinding set up: " + this.toggleKeybinding);
        }
    },
    
    _cleanupKeybinding: function() {
        Main.keybindingManager.removeHotKey(UUID + "-toggle");
        global.log("[" + UUID + "] Keybinding cleaned up");
    },
    
    _toggleDimming: function() {
        this.dimmingEnabled = !this.dimmingEnabled;
        global.log("[" + UUID + "] Dimming " + (this.dimmingEnabled ? "enabled" : "disabled") + " via keybinding");
        
        if (this.dimmingEnabled) {
            // Re-enable dimming
            this._dimUnfocusedWindows();
        } else {
            // Disable dimming - restore all windows
            this._restoreAllWindows();
        }
    },
    
    _initializeExistingWindows: function() {
        let windows = global.get_window_actors();
        
        for (let windowActor of windows) {
            let window = windowActor.get_meta_window();
            if (window && !window.is_skip_taskbar()) {
                this._trackWindow(window);
            }
        }
        global.log("[" + UUID + "] Initialized " + windows.length + " windows");
    },
    
    _onWindowCreated: function(display, window) {
        this._trackWindow(window);
    },
    
    _trackWindow: function(window) {
        if (this._windowStates.has(window)) {
            return;
        }
        
        let actor = window.get_compositor_private();
        if (!actor) return;
        
        this._windowStates.set(window, {
            originalOpacity: 255,
            isDimmed: false,
            brightnessEffect: null
        });
        
        this._signals.connect(window, 'unmanaged', () => {
            this._windowStates.delete(window);
        }, this);
        
        global.log("[" + UUID + "] Tracking new window");
    },
    
    _onFocusChanged: function() {
        let focusedWindow = global.display.focus_window;
        
        if (this._activeWindow === focusedWindow) {
            return;
        }
        
        let focusedTitle = focusedWindow ? focusedWindow.get_title() : "None";
        global.log("[" + UUID + "] Focus changed to: " + focusedTitle);
        
        this._activeWindow = focusedWindow;
        
        // Process all windows - restore focused, dim others
        this._dimUnfocusedWindows();
    },
    
    _dimUnfocusedWindows: function() {
        if (!this.dimmingEnabled) {
            return;
        }
        
        let windows = global.get_window_actors();
        let dimmedCount = 0;
        let restoredCount = 0;
        
        // First, restore the focused window to ensure it's bright
        if (this._activeWindow && this._shouldDimWindow(this._activeWindow)) {
            this._restoreWindow(this._activeWindow);
            restoredCount++;
            global.log("[" + UUID + "] Explicitly restored focused window: " + this._activeWindow.get_title());
        }
        
        // Then process all unfocused windows
        for (let windowActor of windows) {
            let window = windowActor.get_meta_window();
            if (!window || window === this._activeWindow) continue;
            
            if (this._shouldDimWindow(window)) {
                this._dimWindow(window);
                dimmedCount++;
            }
        }
        
        global.log("[" + UUID + "] Restored " + restoredCount + " focused window, dimmed " + dimmedCount + " unfocused windows");
    },
    
    _dimWindow: function(window) {
        let actor = window.get_compositor_private();
        if (!actor) return;
        
        let state = this._windowStates.get(window);
        if (!state) {
            this._trackWindow(window);
            state = this._windowStates.get(window);
        }
        
        if (state && !state.isDimmed) {
            this._applyDimmingToWindow(window, true); // true = animate
            state.isDimmed = true;
        }
    },
    
    _restoreWindow: function(window) {
        let actor = window.get_compositor_private();
        if (!actor) return;
        
        let state = this._windowStates.get(window);
        if (!state) {
            this._trackWindow(window);
            state = this._windowStates.get(window);
        }
        
        let windowTitle = window.get_title().substring(0, 30) + "...";
        global.log("[" + UUID + "] Restoring '" + windowTitle + "' to full brightness");
        
        // Remove brightness effect if it exists
        if (state.brightnessEffect) {
            actor.remove_effect(state.brightnessEffect);
            state.brightnessEffect = null;
        }
        
        // Ensure full opacity and brightness
        Tweener.addTween(actor, {
            opacity: 255,
            time: this.animationTime / 1000,
            transition: 'easeInOutQuad',
            onComplete: () => {
                if (state) {
                    state.isDimmed = false;
                }
            }
        });
    },
    
    _restoreAllWindows: function() {
        for (let [window, state] of this._windowStates) {
            let actor = window.get_compositor_private();
            if (actor) {
                // Remove brightness effect if it exists
                if (state.brightnessEffect) {
                    actor.remove_effect(state.brightnessEffect);
                    state.brightnessEffect = null;
                }
                // Ensure full opacity
                actor.opacity = 255;
                state.isDimmed = false;
            }
        }
        global.log("[" + UUID + "] Restored all windows to full brightness");
    },
    
    _shouldDimWindow: function(window) {
        if (!window || window.is_skip_taskbar()) return false;
        
        // Don't dim minimized windows if the setting is enabled
        if (this.disableDimMinimized && window.minimized) {
            return false;
        }
        
        // Don't dim windows with excluded titles
        if (this.excludeWindowTitles && this.excludeWindowTitles.trim() !== "") {
            let windowTitle = window.get_title();
            let patterns = this.excludeWindowTitles.split(',').map(p => p.trim());
            for (let pattern of patterns) {
                if (pattern && windowTitle.includes(pattern)) {
                    return false;
                }
            }
        }
        
        let windowType = window.window_type;
        
        // Always dim NORMAL and UTILITY windows
        if (windowType === Meta.WindowType.NORMAL || 
            windowType === Meta.WindowType.UTILITY) {
            return true;
        }
        
        // Dim dialog windows only if exclude-dialogs is disabled
        if (!this.excludeDialogs && 
            (windowType === Meta.WindowType.DIALOG || 
             windowType === Meta.WindowType.MODAL_DIALOG)) {
            return true;
        }
        
        return false;
    }
};

function init(metadata) {
    extension = new DimUnfocusedWindowsExtension();
}

function enable() {
    if (extension) {
        extension.enable();
    }
}

function disable() {
    if (extension) {
        extension.disable();
        extension = null;
    }
}