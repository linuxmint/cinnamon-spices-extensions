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
        this.dimEnabled = true;
        this.dimmingMode = "opacity";
        this.opacity = 100;
        this.dimLevel = 30;
        this.animationTime = 300;
        this.animationType = "easeInOutQuad";
        this.dimMinimized = false;
        this.excludeDialogs = true;
        
        // Settings - try to bind with error handling
        try {
            this.settings = new Settings.ExtensionSettings(this, UUID);
            this.settings.bind("dim-enabled", "dimEnabled", this._onSettingsChanged);
            this.settings.bind("dimming-mode", "dimmingMode", this._onSettingsChanged);
            this.settings.bind("opacity", "opacity", this._onSettingsChanged);
            this.settings.bind("dim", "dimLevel", this._onSettingsChanged);
            this.settings.bind("animation-time", "animationTime", this._onSettingsChanged);
            this.settings.bind("animation-type", "animationType", this._onSettingsChanged);
            this.settings.bind("dim-minimized", "dimMinimized", this._onSettingsChanged);
            this.settings.bind("exclude-dialogs", "excludeDialogs", this._onSettingsChanged);
        } catch (e) {
            global.log("[" + UUID + "] Settings binding failed, using defaults: " + e);
        }
        
        global.log("[" + UUID + "] Extension initialized with mode: " + this.dimmingMode + ", opacity: " + this.opacity + "%, dim: " + this.dimLevel + "%");
    },
    
    enable: function() {
        global.log("[" + UUID + "] Enabling extension");
        
        // Connect to window focus events
        this._signals.connect(global.display, 'notify::focus-window', 
                             this._onFocusChanged, this);
        
        // Connect to window creation events
        this._signals.connect(global.display, 'window-created', 
                             this._onWindowCreated, this);
        
        // Initialize existing windows
        this._initializeExistingWindows();
        
        // Set initial focus state
        this._onFocusChanged();
    },
    
    disable: function() {
        global.log("[" + UUID + "] Disabling extension");
        
        // Restore all windows
        this._restoreAllWindows();
        
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
        global.log("[" + UUID + "] Settings changed - enabled: " + this.dimEnabled + ", mode: " + this.dimmingMode + ", opacity: " + this.opacity + "%, dim: " + this.dimLevel + "%, animation: " + this.animationTime + "ms");
        
        if (!this.dimEnabled) {
            this._restoreAllWindows();
            return;
        }
        
        // Update focused window to full brightness/opacity
        if (this._activeWindow) {
            let actor = this._activeWindow.get_compositor_private();
            if (actor) {
                Tweener.removeTweens(actor);
                
                if (this.dimmingMode === "brightness") {
                    // Remove brightness effect and ensure full opacity
                    let state = this._windowStat\es.get(this._activeWindow);
                    if (state && state.brightnessEffect) {
                        actor.remove_effect(state.brightnessEffect);
                        state.brightnessEffect = null;
                    }
                    actor.opacity = 255;
                } else {
                    // Opacity mode: set to full opacity
                    Tweener.addTween(actor, {
                        opacity: 255,
                        time: this.animationTime / 1000,
                        transition: 'easeInOutQuad'
                    });
                }
                
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
        
        if (this.dimmingMode === "brightness") {
            // Brightness dimming: keep opacity at 100%, apply brightness effect
            actor.opacity = 255;
            
            // Remove existing brightness effect if any
            if (state.brightnessEffect) {
                actor.remove_effect(state.brightnessEffect);
            }
            
            // Create new brightness effect
            let brightness = -this.dimLevel / 100.0; // Convert 0-100% to 0 to -1.0
            state.brightnessEffect = new Clutter.BrightnessContrastEffect();
            state.brightnessEffect.set_brightness(brightness);
            state.brightnessEffect.set_contrast(0.0); // Keep contrast normal
            
            actor.add_effect(state.brightnessEffect);
            global.log("[" + UUID + "] Applied brightness dimming to '" + windowTitle + "' (brightness: " + brightness + ")");
            
        } else {
            // Opacity dimming: apply opacity reduction
            let unfocusedOpacity = Math.max(0, this.opacity - this.dimLevel);
            let targetOpacity = Math.round(255 * (unfocusedOpacity / 100));
            
            if (animate) {
                Tweener.addTween(actor, {
                    opacity: targetOpacity,
                    time: this.animationTime / 1000,
                    transition: this.animationType
                });
            } else {
                actor.opacity = targetOpacity;
            }
            
            global.log("[" + UUID + "] Applied opacity dimming to '" + windowTitle + "' (opacity: " + targetOpacity + ")");
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
        if (!this.dimEnabled) {
            this._restoreAllWindows();
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
        
        // Ensure full opacity
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
        
        let windowType = window.window_type;
        if (windowType === Meta.WindowType.NORMAL || 
            windowType === Meta.WindowType.UTILITY) {
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