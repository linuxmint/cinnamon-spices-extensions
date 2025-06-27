const Main = imports.ui.main;
const Lang = imports.lang;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Util = imports.misc.util;
const Overlay = require('./overlay').Overlay;
const Screenshot = require('./screenshot').Screenshot;
const Preview = require('./preview').Preview;
const Settings = imports.ui.settings;
const Gettext = imports.gettext;
const UUID = 'cinnamon-screenshot@hilyxx';

let settingsObj = { hotkey: null };
let settings = null;
let hotkeyId = 'cinnamon-screenshot-key';
let currentHotkey = null;

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');
function _(str) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if (customTranslation != str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}

function init(metadata) {
    // Initialization if needed
}

function enable() {
    global.log('cinnamon-screenshot: enable() called');
    settings = new Settings.ExtensionSettings(settingsObj, UUID);
    settings.bindProperty(Settings.BindingDirection.IN, 'hotkey', 'hotkey', _setKeybinding, null);
    _setKeybinding();
}

function disable() {
    global.log('cinnamon-screenshot: disable() called');
    _removeKeybinding();
    if (settings) {
        settings.finalize();
        settings = null;
    }
}

function _setKeybinding() {
    _removeKeybinding();
    if (settingsObj.hotkey && settingsObj.hotkey.length > 0) {
        Main.keybindingManager.addHotKey(hotkeyId, settingsObj.hotkey, onHotkeyPressed);
        currentHotkey = settingsObj.hotkey;
    }
}

function _removeKeybinding() {
    Main.keybindingManager.removeHotKey(hotkeyId);
    currentHotkey = null;
}

function onHotkeyPressed() {
    global.log('cinnamon-screenshot: hotkey pressed');
    Overlay.showOverlay((type, timer, mouse) => {
        global.log('cinnamon-screenshot: onOptionSelected called with type=' + type);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            Screenshot.takeScreenshot(type, timer, mouse, (filename) => {
                if (filename) {
                    global.log('cinnamon-screenshot: screenshot taken: ' + filename);
                    Preview.showScreenshotPreview(filename, (savedPath) => {
                        global.log('cinnamon-screenshot: screenshot saved to: ' + savedPath);
                    });
                } else {
                    global.log('cinnamon-screenshot: screenshot failed');
                }
            });
            return GLib.SOURCE_REMOVE;
        });
    });
} 
