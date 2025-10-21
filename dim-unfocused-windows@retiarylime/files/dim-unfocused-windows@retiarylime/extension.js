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
        this.dimOpacity = 70;
        this.animationTime = 300;
        this.animationType = "easeInOutQuad";
        this.dimMinimized = false;
        this.excludeDialogs = true;
        
        // Settings - try to bind with error handling
        try {
            this.settings = new Settings.ExtensionSettings(this, UUID);
            this.settings.bind("dim-opacity", "dimOpacity", this._onSettingsChanged);
            this.settings.bind("animation-time", "animationTime", this._onSettingsChanged);
            this.settings.bind("animation-type", "animationType", this._onSettingsChanged);
            this.settings.bind("dim-minimized", "dimMinimized", this._onSettingsChanged);
            this.settings.bind("exclude-dialogs", "excludeDialogs", this._onSettingsChanged);
        } catch (e) {
            global.log("[" + UUID + "] Settings binding failed, using defaults: " + e);
        }
        
        global.log("[" + UUID + "] Extension initialized with opacity: " + this.dimOpacity + "%");
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
        global.log("[" + UUID + "] Settings changed - opacity: " + this.dimOpacity + "%, animation: " + this.animationTime + "ms");
        
        // Immediately update all currently dimmed windows with new opacity
        let targetOpacity = Math.round(255 * (this.dimOpacity / 100));
        
        for (let [window, state] of this._windowStates) {
            if (state.isDimmed) {
                let actor = window.get_compositor_private();
                if (actor) {
                    // Apply new opacity immediately with animation
                    Tweener.addTween(actor, {
                        opacity: targetOpacity,
                        time: this.animationTime / 1000,
                        transition: 'easeInOutQuad'
                    });
                    
                    let windowTitle = window.get_title().substring(0, 30) + "...";
                    global.log("[" + UUID + "] Updated '" + windowTitle + "' to new opacity: " + targetOpacity);
                }
            }
        }
        
        // Also reapply dimming for consistency
        if (this._activeWindow) {
            this._dimUnfocusedWindows();
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
            isDimmed: false
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
            let targetOpacity = Math.round(255 * (this.dimOpacity / 100));
            let windowTitle = window.get_title().substring(0, 30) + "...";
            
            global.log("[" + UUID + "] Dimming '" + windowTitle + "' from " + actor.opacity + " to " + targetOpacity);
            
            // Use smooth animation
            Tweener.addTween(actor, {
                opacity: targetOpacity,
                time: this.animationTime / 1000,
                transition: 'easeInOutQuad',
                onComplete: () => {
                    state.isDimmed = true;
                }
            });
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
        global.log("[" + UUID + "] Restoring '" + windowTitle + "' from " + actor.opacity + " to 255");
        
        // Use smooth animation
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
            if (state.isDimmed) {
                let actor = window.get_compositor_private();
                if (actor) {
                    actor.opacity = 255;
                    state.isDimmed = false;
                }
            }
        }
        global.log("[" + UUID + "] Restored all windows");
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