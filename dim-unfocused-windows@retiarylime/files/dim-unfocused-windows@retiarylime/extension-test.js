/*
 * Simple Test Version - Dim Unfocused Windows
 * This version uses direct opacity changes without animation for testing
 */

const UUID = "dim-unfocused-windows@retiarylime";
const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;

let extension = null;

function SimpleExtension() {
    this._init();
}

SimpleExtension.prototype = {
    _init: function() {
        this._signals = new SignalManager.SignalManager(null);
        this._activeWindow = null;
        
        // Settings with defaults
        this.settings = new Settings.ExtensionSettings(this, UUID);
        this.dimOpacity = 70; // Default 70%
        this.settings.bind("dim-opacity", "dimOpacity", this._onSettingsChanged);
    },
    
    enable: function() {
        global.log("[" + UUID + "] TEST VERSION: Enabling simple dimming");
        
        this._signals.connect(global.display, 'notify::focus-window', 
                             this._onFocusChanged, this);
    },
    
    disable: function() {
        global.log("[" + UUID + "] TEST VERSION: Disabling");
        this._restoreAllWindows();
        this._signals.disconnectAllSignals();
        
        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
    },
    
    _onFocusChanged: function() {
        let focusedWindow = global.display.focus_window;
        
        if (this._activeWindow === focusedWindow) {
            return;
        }
        
        // Restore all windows first
        this._restoreAllWindows();
        
        // Update active window
        this._activeWindow = focusedWindow;
        
        // Dim unfocused windows
        this._dimUnfocusedWindows();
    },
    
    _dimUnfocusedWindows: function() {
        let windows = global.get_window_actors();
        
        for (let windowActor of windows) {
            let window = windowActor.get_meta_window();
            if (window && window !== this._activeWindow && this._shouldDimWindow(window)) {
                let actor = window.get_compositor_private();
                if (actor) {
                    let targetOpacity = Math.round(255 * (this.dimOpacity / 100));
                    actor.opacity = targetOpacity;
                    global.log("[" + UUID + "] TEST: Set window opacity to " + targetOpacity);
                }
            }
        }
    },
    
    _restoreAllWindows: function() {
        let windows = global.get_window_actors();
        
        for (let windowActor of windows) {
            let window = windowActor.get_meta_window();
            if (window) {
                let actor = window.get_compositor_private();
                if (actor) {
                    actor.opacity = 255;
                }
            }
        }
    },
    
    _shouldDimWindow: function(window) {
        if (!window || window.is_skip_taskbar()) return false;
        
        let windowType = window.window_type;
        return (windowType === Meta.WindowType.NORMAL || 
                windowType === Meta.WindowType.UTILITY);
    },
    
    _onSettingsChanged: function() {
        global.log("[" + UUID + "] TEST: Settings changed, opacity now: " + this.dimOpacity + "%");
        if (this._activeWindow) {
            this._dimUnfocusedWindows();
        }
    }
};

function init(metadata) {
    extension = new SimpleExtension();
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