const Main = imports.ui.main;
const Lang = imports.lang;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const Settings = imports.ui.settings;

const Overlay = require('./overlay').Overlay;
const Screenshot = require('./screenshot').Screenshot;
const Preview = require('./preview').Preview;
const { _, initTranslation } = require('./translation');

const UUID = 'cinnamon-screenshot@hilyxx';

// Initialize translation
initTranslation(UUID);

let settingsObj = { 
    hotkey: null,
    fullscreenHotkey: null,
    activeWindowHotkey: null,
    selectionHotkey: null
};
let settings = null;
let hotkeyId = 'cinnamon-screenshot-key';
let fullscreenHotkeyId = 'cinnamon-screenshot-fullscreen-key';
let activeWindowHotkeyId = 'cinnamon-screenshot-active-window-key';
let selectionHotkeyId = 'cinnamon-screenshot-selection-key';

function init(metadata) {
}

function enable() {
    global.log('cinnamon-screenshot: enable() called');
    settings = new Settings.ExtensionSettings(settingsObj, UUID);
    settings.bindProperty(Settings.BindingDirection.IN, 'hotkey', 'hotkey', _setKeybinding, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'fullscreenHotkey', 'fullscreenHotkey', _setFullscreenKeybinding, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'activeWindowHotkey', 'activeWindowHotkey', _setActiveWindowKeybinding, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'selectionHotkey', 'selectionHotkey', _setSelectionKeybinding, null);
    _setKeybinding();
    _setFullscreenKeybinding();
    _setActiveWindowKeybinding();
    _setSelectionKeybinding();
}

function disable() {
    global.log('cinnamon-screenshot: disable() called');
    _removeKeybinding();
    _removeFullscreenKeybinding();
    _removeActiveWindowKeybinding();
    _removeSelectionKeybinding();
    if (settings) {
        settings.finalize();
        settings = null;
    }
}

function _setKeybinding() {
    _removeKeybinding();
    if (settingsObj.hotkey && settingsObj.hotkey.length > 0) {
        Main.keybindingManager.addHotKey(hotkeyId, settingsObj.hotkey, onHotkeyPressed);
    }
}

function _removeKeybinding() {
    Main.keybindingManager.removeHotKey(hotkeyId);
}

function _setFullscreenKeybinding() {
    _removeFullscreenKeybinding();
    if (settingsObj.fullscreenHotkey && settingsObj.fullscreenHotkey.length > 0) {
        Main.keybindingManager.addHotKey(fullscreenHotkeyId, settingsObj.fullscreenHotkey, onFullscreenHotkeyPressed);
    }
}

function _removeFullscreenKeybinding() {
    Main.keybindingManager.removeHotKey(fullscreenHotkeyId);
}

function _setActiveWindowKeybinding() {
    _removeActiveWindowKeybinding();
    if (settingsObj.activeWindowHotkey && settingsObj.activeWindowHotkey.length > 0) {
        Main.keybindingManager.addHotKey(activeWindowHotkeyId, settingsObj.activeWindowHotkey, onActiveWindowHotkeyPressed);
    }
}

function _removeActiveWindowKeybinding() {
    Main.keybindingManager.removeHotKey(activeWindowHotkeyId);
}

function _setSelectionKeybinding() {
    _removeSelectionKeybinding();
    if (settingsObj.selectionHotkey && settingsObj.selectionHotkey.length > 0) {
        Main.keybindingManager.addHotKey(selectionHotkeyId, settingsObj.selectionHotkey, onSelectionHotkeyPressed);
    }
}

function _removeSelectionKeybinding() {
    Main.keybindingManager.removeHotKey(selectionHotkeyId);
}

function onHotkeyPressed() {
    global.log('cinnamon-screenshot: hotkey pressed');
    showOverlayWithCallback();
}

function showOverlayWithCallback() {
    Overlay.showOverlay((type, timer, mouse) => {
        global.log('cinnamon-screenshot: onOptionSelected called with type=' + type);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            Screenshot.takeScreenshot(type, timer, mouse, (filename) => {
                if (filename) {
                    global.log('cinnamon-screenshot: screenshot taken: ' + filename);
                    Preview.showScreenshotPreview(filename, (savedPath) => {
                        global.log('cinnamon-screenshot: screenshot saved to: ' + savedPath);
                    }, () => {
                        // Callback for back button - return to overlay
                        global.log('cinnamon-screenshot: returning to overlay from preview');
                        showOverlayWithCallback();
                    }, true);
                } else {
                    global.log('cinnamon-screenshot: screenshot failed');
                }
            });
            return GLib.SOURCE_REMOVE;
        });
    });
}

function onFullscreenHotkeyPressed() {
    global.log('cinnamon-screenshot: fullscreen hotkey pressed');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        Screenshot.takeScreenshot('fullscreen', 0, false, (filename) => {
            if (filename) {
                global.log('cinnamon-screenshot: fullscreen screenshot taken: ' + filename);
                Preview.showScreenshotPreview(filename, (savedPath) => {
                    global.log('cinnamon-screenshot: fullscreen screenshot saved to: ' + savedPath);
                });
            } else {
                global.log('cinnamon-screenshot: fullscreen screenshot failed');
            }
        });
        return GLib.SOURCE_REMOVE;
    });
}

function onActiveWindowHotkeyPressed() {
    global.log('cinnamon-screenshot: active window hotkey pressed');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        Screenshot.takeScreenshot('window', 0, false, (filename) => {
            if (filename) {
                global.log('cinnamon-screenshot: active window screenshot taken: ' + filename);
                Preview.showScreenshotPreview(filename, (savedPath) => {
                    global.log('cinnamon-screenshot: active window screenshot saved to: ' + savedPath);
                });
            } else {
                global.log('cinnamon-screenshot: active window screenshot failed');
            }
        });
        return GLib.SOURCE_REMOVE;
    });
}

function onSelectionHotkeyPressed() {
    global.log('cinnamon-screenshot: selection hotkey pressed');
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        Screenshot.takeScreenshot('selection', 0, false, (filename) => {
            if (filename) {
                global.log('cinnamon-screenshot: selection screenshot taken: ' + filename);
                Preview.showScreenshotPreview(filename, (savedPath) => {
                    global.log('cinnamon-screenshot: selection screenshot saved to: ' + savedPath);
                });
            } else {
                global.log('cinnamon-screenshot: selection screenshot failed');
            }
        });
        return GLib.SOURCE_REMOVE;
    });
} 
