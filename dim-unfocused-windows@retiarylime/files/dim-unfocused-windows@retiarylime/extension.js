/*
 * Dim Unfocused Windows - Cinnamon Extension
 * 
 * Copyright (C) 2025
 * 
 * This extension dims windows when they lose focus to enhance visual clarity
 * and reduce distractions, making it easier to identify the active window.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 */

const UUID = "dim-unfocused-windows@retiarylime";

const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const SignalManager = imports.misc.signalManager;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;

// Global variables
let extension = null;

function _(str) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if(customTranslation !== str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}

/**
 * Main extension class that handles window dimming functionality
 */
function DimUnfocusedWindowsExtension() {
    this._init();
}

DimUnfocusedWindowsExtension.prototype = {
    
    _init: function() {
        this._signals = new SignalManager.SignalManager(null);
        this._windowStates = new Map(); // Track original opacity states
        this._activeWindow = null;
        this._enabled = true; // Track if dimming is temporarily disabled
        
        // Set default values first
        this.dimOpacity = 70;
        this.animationTime = 300;
        this.animationType = "easeInOutQuad";
        this.dimMinimized = false;
        this.excludeDialogs = true;
        this.toggleKeybinding = "<Super><Shift>d";
        
        // Settings - try to bind with error handling
        try {
            this.settings = new Settings.ExtensionSettings(this, UUID);
            this.settings.bind("dim-opacity", "dimOpacity", this._onSettingsChanged);
            this.settings.bind("animation-time", "animationTime", this._onSettingsChanged);
            this.settings.bind("animation-type", "animationType", this._onSettingsChanged);
            this.settings.bind("dim-minimized", "dimMinimized", this._onSettingsChanged);
            this.settings.bind("exclude-dialogs", "excludeDialogs", this._onSettingsChanged);
            this.settings.bind("toggle-keybinding", "toggleKeybinding", this._onKeybindingChanged);
        } catch (e) {
            global.log("[" + UUID + "] Settings binding failed, using defaults: " + e);
        }
        
        // Initialize gettext
        Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");
    },
    
    enable: function() {
        global.log("[" + UUID + "] Enabling extension");
        global.log("[" + UUID + "] Settings - opacity: " + this.dimOpacity + "%, animation: " + this.animationTime + "ms, type: " + this.animationType);
        
        // Connect to window focus events
        this._signals.connect(global.display, 'notify::focus-window', 
                             this._onFocusChanged, this);
        
        // Connect to window creation events to track new windows
        this._signals.connect(global.display, 'window-created', 
                             this._onWindowCreated, this);
        
        // Initialize existing windows
        this._initializeExistingWindows();
        
        // Set initial focus state
        this._onFocusChanged();
        
        // Set up keybinding
        this._onKeybindingChanged();
    },
    
    disable: function() {
        global.log("[" + UUID + "] Disabling extension");
        
        // Restore all windows to full opacity
        this._restoreAllWindows();
        
        // Disconnect all signals
        this._signals.disconnectAllSignals();
        
        // Clean up
        this._windowStates.clear();
        this._activeWindow = null;
        
        // Remove keybinding
        try {
            Main.keybindingManager.removeHotKey("dim-unfocused-toggle");
        } catch (e) {
            global.log("[" + UUID + "] Keybinding removal failed: " + e);
        }
        
        // Finalize settings
        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
    },
    
    _initializeExistingWindows: function() {
        // Get all windows from all workspaces that are visible
        let windows = global.get_window_actors();
        
        for (let windowActor of windows) {
            let window = windowActor.get_meta_window();
            if (window && !window.is_skip_taskbar()) {
                this._trackWindow(window);
            }
        }
    },
    
    _onWindowCreated: function(display, window) {
        // Small delay to ensure window is fully initialized
        Mainloop.timeout_add(100, () => {
            this._trackWindow(window);
            return false; // Don't repeat
        });
    },
    
    _trackWindow: function(window) {
        // Skip if we're already tracking this window
        if (this._windowStates.has(window)) {
            return;
        }
        
        let actor = window.get_compositor_private();
        if (!actor) return;
        
        // Store original opacity (ensure it's a valid value)
        let originalOpacity = actor.opacity;
        if (originalOpacity === undefined || originalOpacity === null) {
            originalOpacity = 255; // Default to fully opaque
        }
        
        this._windowStates.set(window, {
            originalOpacity: originalOpacity,
            isDimmed: false
        });
        
        // Connect to window destroy event to clean up state
        this._signals.connect(window, 'unmanaged', () => {
            this._windowStates.delete(window);
        }, this);
        
        // Connect to window minimize/unminimize events
        this._signals.connect(window, 'notify::minimized', () => {
            if (window.minimized && !this.dimMinimized) {
                this._restoreWindow(window);
            } else if (window !== this._activeWindow && this._enabled) {
                this._dimWindow(window);
            }
        }, this);
    },
    
    _onFocusChanged: function() {
        if (!this._enabled) return;
        
        let focusedWindow = global.display.focus_window;
        
        // If the same window is still focused, do nothing
        if (this._activeWindow === focusedWindow) {
            return;
        }
        
        // Restore previous active window (if it exists and is valid)
        if (this._activeWindow && !this._activeWindow.is_destroyed()) {
            this._restoreWindow(this._activeWindow);
        }
        
        // Update active window
        this._activeWindow = focusedWindow;
        
        // Small delay to ensure the window focus change is processed
        Mainloop.timeout_add(50, () => {
            if (this._enabled) {
                this._dimUnfocusedWindows();
            }
            return false; // Don't repeat
        });
    },
    
    _dimUnfocusedWindows: function() {
        if (!this._enabled) return; // Skip if temporarily disabled
        
        // Get all visible windows
        let windows = global.get_window_actors();
        
        for (let windowActor of windows) {
            let window = windowActor.get_meta_window();
            if (window && !window.is_skip_taskbar() && window !== this._activeWindow) {
                this._dimWindow(window);
            }
        }
    },
    
    _dimWindow: function(window) {
        if (!this._shouldDimWindow(window)) {
            return;
        }
        
        let actor = window.get_compositor_private();
        if (!actor) {
            global.log("[" + UUID + "] No actor found for window");
            return;
        }
        
        let state = this._windowStates.get(window);
        if (!state) {
            global.log("[" + UUID + "] No state found for window, tracking it now");
            this._trackWindow(window);
            state = this._windowStates.get(window);
        }
        
        if (state.isDimmed) {
            global.log("[" + UUID + "] Window already dimmed, skipping");
            return;
        }
        
        // Calculate dim opacity (0-255 range)
        let targetOpacity = Math.round(255 * (this.dimOpacity / 100));
        
        global.log("[" + UUID + "] Dimming window from " + actor.opacity + " to " + targetOpacity + " (setting: " + this.dimOpacity + "%)");
        
        // Try direct opacity change first to test if it works
        if (this.animationTime === 0) {
            actor.opacity = targetOpacity;
            state.isDimmed = true;
            global.log("[" + UUID + "] Applied immediate opacity change");
        } else {
            // Animate to dimmed state
            Tweener.addTween(actor, {
                opacity: targetOpacity,
                time: this.animationTime / 1000,
                transition: this.animationType || 'easeInOutQuad',
                onComplete: () => {
                    if (state) {
                        state.isDimmed = true;
                        global.log("[" + UUID + "] Animation completed, window dimmed");
                    }
                },
                onError: (error) => {
                    global.log("[" + UUID + "] Animation error: " + error);
                }
            });
        }
    },
    
    _restoreWindow: function(window) {
        if (!window) return;
        
        let actor = window.get_compositor_private();
        if (!actor) return;
        
        let state = this._windowStates.get(window);
        if (!state || !state.isDimmed) return;
        
        global.log("[" + UUID + "] Restoring window from " + actor.opacity + " to " + state.originalOpacity);
        
        // Try direct opacity change first to test if it works
        if (this.animationTime === 0) {
            actor.opacity = state.originalOpacity;
            state.isDimmed = false;
            global.log("[" + UUID + "] Applied immediate opacity restore");
        } else {
            // Animate back to original opacity
            Tweener.addTween(actor, {
                opacity: state.originalOpacity,
                time: this.animationTime / 1000,
                transition: this.animationType || 'easeInOutQuad',
                onComplete: () => {
                    state.isDimmed = false;
                    global.log("[" + UUID + "] Restore animation completed");
                },
                onError: (error) => {
                    global.log("[" + UUID + "] Restore animation error: " + error);
                }
            });
        }
    },
    
    _restoreAllWindows: function() {
        for (let [window, state] of this._windowStates) {
            if (state.isDimmed) {
                let actor = window.get_compositor_private();
                if (actor) {
                    // Restore immediately without animation
                    actor.opacity = state.originalOpacity;
                    state.isDimmed = false;
                }
            }
        }
    },
    
    _shouldDimWindow: function(window) {
        if (!window) return false;
        
        // Don't dim if window is already minimized and we don't want to dim minimized windows
        if (window.minimized && !this.dimMinimized) {
            return false;
        }
        
        // Don't dim dialogs if setting is enabled
        if (this.excludeDialogs && window.window_type === Meta.WindowType.DIALOG) {
            return false;
        }
        
        // Don't dim certain window types
        let windowType = window.window_type;
        if (windowType === Meta.WindowType.DESKTOP ||
            windowType === Meta.WindowType.DOCK ||
            windowType === Meta.WindowType.SPLASHSCREEN ||
            windowType === Meta.WindowType.NOTIFICATION ||
            windowType === Meta.WindowType.TOOLTIP ||
            windowType === Meta.WindowType.MENU ||
            windowType === Meta.WindowType.DROPDOWN_MENU ||
            windowType === Meta.WindowType.POPUP_MENU) {
            return false;
        }
        
        // Only dim normal windows and utility windows
        if (windowType !== Meta.WindowType.NORMAL && 
            windowType !== Meta.WindowType.UTILITY) {
            return false;
        }
        
        return true;
    },
    
    _onSettingsChanged: function() {
        // Reapply dimming with new settings
        if (this._activeWindow) {
            this._dimUnfocusedWindows();
        }
    },
    
    _onKeybindingChanged: function() {
        try {
            // Remove existing keybinding
            Main.keybindingManager.removeHotKey("dim-unfocused-toggle");
            
            // Add new keybinding if set
            if (this.toggleKeybinding && this.toggleKeybinding !== "") {
                Main.keybindingManager.addHotKey("dim-unfocused-toggle", 
                                               this.toggleKeybinding, 
                                               this._toggleDimming.bind(this));
            }
        } catch (e) {
            global.log("[" + UUID + "] Keybinding setup failed: " + e);
        }
    },
    
    _toggleDimming: function() {
        this._enabled = !this._enabled;
        
        if (this._enabled) {
            // Re-enable dimming
            this._dimUnfocusedWindows();
            global.log("[" + UUID + "] Dimming enabled");
        } else {
            // Disable dimming - restore all windows
            this._restoreAllWindows();
            global.log("[" + UUID + "] Dimming disabled");
        }
    },
    
    _onKeybindingChanged: function() {
        Main.keybindingManager.removeHotKey("dim-unfocused-toggle");
        if (this.toggleKeybinding) {
            Main.keybindingManager.addHotKey("dim-unfocused-toggle", 
                                           this.toggleKeybinding, 
                                           this._toggleDimming.bind(this));
        }
    },
    
    _toggleDimming: function() {
        this._enabled = !this._enabled;
        
        if (this._enabled) {
            // Re-enable dimming
            global.log("[" + UUID + "] Dimming enabled");
            this._dimUnfocusedWindows();
        } else {
            // Disable dimming, restore all windows
            global.log("[" + UUID + "] Dimming disabled");
            this._restoreAllWindows();
        }
    }
};

// Extension lifecycle functions
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