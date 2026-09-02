const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;

const SMILE_DBUS_INTERFACE = 'it.mijorus.smile';
const SMILE_DBUS_PATH = '/it/mijorus/smile/actions';
const SMILE_SIGNAL = 'CopiedEmojiBroadcast';

let dbusSignalId = null;
let pendingTimeouts = [];
let settings = null;
let pasteDelay = 100;

function getVirtualKeyboard() {
    return Clutter.get_default_backend()
        .get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
}

function sendCtrlV(keyboard) {
    const time = Clutter.get_current_event_time();
    keyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time, Clutter.KEY_v,         Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time, Clutter.KEY_v,         Clutter.KeyState.RELEASED);
    keyboard.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
}

function clearTimeouts() {
    for (let id of pendingTimeouts) {
        GLib.Source.remove(id);
    }
    pendingTimeouts = [];
}

function init(metadata) {
    settings = new Settings.ExtensionSettings(this, metadata.uuid);
    settings.bind('paste-delay', 'pasteDelay', null);
}

function enable() {
    dbusSignalId = Gio.DBus.session.signal_subscribe(
        null,
        SMILE_DBUS_INTERFACE,
        SMILE_SIGNAL,
        SMILE_DBUS_PATH,
        null,
        Gio.DBusSignalFlags.NONE,
        function() {
            const keyboard = getVirtualKeyboard();
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pasteDelay, function() {
                sendCtrlV(keyboard);
                return GLib.SOURCE_REMOVE;
            });
            pendingTimeouts.push(id);
        }
    );
}

function disable() {
    clearTimeouts();

    if (dbusSignalId !== null) {
        Gio.DBus.session.signal_unsubscribe(dbusSignalId);
        dbusSignalId = null;
    }

    settings = null;
}
