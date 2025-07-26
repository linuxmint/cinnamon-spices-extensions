// === IMPORTS & CONSTANTS ===
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;

const { Overlay } = require('./overlay');
const { Screenshot } = require('./screenshot');
const { showScreenshotPreview } = require('./preview');
const { _, initTranslation } = require('./translation');
const { getTransitionManager } = require('./transitionEffects');

const UUID = 'cinnamon-screenshot@hilyxx';

initTranslation(UUID);

// === SETTINGS OBJECT & IDS ===
const settingsObj = { 
    hotkey: null,
    fullscreenHotkey: null,
    activeWindowHotkey: null,
    selectionHotkey: null,
    mousePointerVisible: true,
    enableTransitions: true
};
let settings = null;
const hotkeyId = 'cinnamon-screenshot-key';
const fullscreenHotkeyId = 'cinnamon-screenshot-fullscreen-key';
const activeWindowHotkeyId = 'cinnamon-screenshot-active-window-key';
const selectionHotkeyId = 'cinnamon-screenshot-selection-key';

function init() {
}

function enable() {
    global.log('cinnamon-screenshot: enable() called');
    settings = new Settings.ExtensionSettings(settingsObj, UUID);
    settings.bindProperty(Settings.BindingDirection.IN, 'hotkey', 'hotkey', setAllKeybindings, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'fullscreenHotkey', 'fullscreenHotkey', setAllKeybindings, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'activeWindowHotkey', 'activeWindowHotkey', setAllKeybindings, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'selectionHotkey', 'selectionHotkey', setAllKeybindings, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'mousePointerVisible', 'mousePointerVisible', null, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'enableTransitions', 'enableTransitions', _setTransitionsEnabled, null);
    setAllKeybindings();
    _setTransitionsEnabled();
}

function disable() {
    global.log('cinnamon-screenshot: disable() called');
    Main.keybindingManager.removeHotKey(hotkeyId);
    Main.keybindingManager.removeHotKey(fullscreenHotkeyId);
    Main.keybindingManager.removeHotKey(activeWindowHotkeyId);
    Main.keybindingManager.removeHotKey(selectionHotkeyId);
    if (settings) {
        settings.finalize();
        settings = null;
    }
}

// === MOUSE POINTER STATE PERSISTENCE ===
function saveMousePointerState(visible) {
    if (settings) {
        settingsObj.mousePointerVisible = visible;
    }
}

// === TRANSITIONS MANAGEMENT ===
function _setTransitionsEnabled() {
    const transitionManager = getTransitionManager();
    if (transitionManager) {
        transitionManager.setEnabled(settingsObj.enableTransitions);
        global.log('CS: Transitions ' + (settingsObj.enableTransitions ? 'enabled' : 'disabled'));
    }
}

// === HOTKEY CALLBACKS & OVERLAY LOGIC ===
function onHotkeyPressed() {
    showOverlayWithCallback();
}

function showOverlayWithCallback() {
    Overlay.showOverlay((type, timer, mouse) => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            Screenshot.takeScreenshot(type, timer, mouse, (filename) => {
                if (filename) {
                    showScreenshotPreview(filename, (savedPath) => {
                    }, () => {
                        // Callback for back button - return to overlay
                        showOverlayWithCallback();
                    }, true);
                } else {
                }
            });
            return GLib.SOURCE_REMOVE;
        });
    }, settingsObj.mousePointerVisible, saveMousePointerState);
}

function onFullscreenHotkeyPressed() {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        Screenshot.takeScreenshot('full', 0, true, (filename) => {
            if (filename) {
                showScreenshotPreview(filename, (savedPath) => {
                });
            } else {
            }
        });
        return GLib.SOURCE_REMOVE;
    });
}

function onActiveWindowHotkeyPressed() {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        Screenshot.takeScreenshot('window', 0, true, (filename) => {
            if (filename) {
                showScreenshotPreview(filename, (savedPath) => {
                });
            } else {
            }
        });
        return GLib.SOURCE_REMOVE;
    });
}

function onSelectionHotkeyPressed() {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
        Screenshot.takeScreenshot('selection', 0, true, (filename) => {
            if (filename) {
                showScreenshotPreview(filename, (savedPath) => {
                });
            } else {
            }
        });
        return GLib.SOURCE_REMOVE;
    });
}

function setAllKeybindings() {
    Main.keybindingManager.removeHotKey(hotkeyId);
    if (settingsObj.hotkey && settingsObj.hotkey.length > 0) {
        Main.keybindingManager.addHotKey(hotkeyId, settingsObj.hotkey, onHotkeyPressed);
    }
    Main.keybindingManager.removeHotKey(fullscreenHotkeyId);
    if (settingsObj.fullscreenHotkey && settingsObj.fullscreenHotkey.length > 0) {
        Main.keybindingManager.addHotKey(fullscreenHotkeyId, settingsObj.fullscreenHotkey, onFullscreenHotkeyPressed);
    }
    Main.keybindingManager.removeHotKey(activeWindowHotkeyId);
    if (settingsObj.activeWindowHotkey && settingsObj.activeWindowHotkey.length > 0) {
        Main.keybindingManager.addHotKey(activeWindowHotkeyId, settingsObj.activeWindowHotkey, onActiveWindowHotkeyPressed);
    }
    Main.keybindingManager.removeHotKey(selectionHotkeyId);
    if (settingsObj.selectionHotkey && settingsObj.selectionHotkey.length > 0) {
        Main.keybindingManager.addHotKey(selectionHotkeyId, settingsObj.selectionHotkey, onSelectionHotkeyPressed);
    }
}
