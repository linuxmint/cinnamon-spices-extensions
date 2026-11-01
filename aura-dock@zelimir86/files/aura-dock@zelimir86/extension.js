// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Extension = imports.ui.extension;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

const Me = Extension.getCurrentExtension();

let metadata = null;
let controllers = [];
let _recreateScheduled = false;

function _readMonitorMode() {
    try {
        const Gio = imports.gi.Gio;
        const path = GLib.build_filenamev([
            GLib.get_user_config_dir(), 'cinnamon', 'spices',
            metadata.uuid, metadata.uuid + '.json'
        ]);
        const file = Gio.File.new_for_path(path);
        const [ok, bytes] = file.load_contents(null);
        if (ok) {
            const text = imports.byteArray.toString(bytes);
            const data = JSON.parse(text);
            if (data && data.monitor && data.monitor.value)
                return data.monitor.value;
        }
    } catch (e) {
        // Fall back to the primary monitor.
    }
    return 'primary';
}

function _monitorIndicesForMode(mode) {
    const lm = Main.layoutManager;
    const primary = (lm && typeof lm.primaryIndex === 'number') ? lm.primaryIndex : 0;
    const count = lm && lm.monitors ? lm.monitors.length : 1;

    if (mode === 'primary')
        return [primary];
    if (mode === 'secondary') {
        for (let i = 0; i < count; i++) {
            if (i !== primary)
                return [i];
        }
        return [primary];
    }
    if (mode === 'all') {
        const out = [];
        for (let i = 0; i < count; i++)
            out.push(i);
        return out.length ? out : [primary];
    }
    return [primary];
}

function _destroyAll() {
    for (const c of controllers) {
        try { c.destroy(); } catch (e) { /* ignore */ }
    }
    controllers = [];
    if (global.auraDock) delete global.auraDock;
}

function _recreateAll(mode) {
    const { DockController } = Me.imports.dock;
    if (!mode)
        mode = _readMonitorMode();
    const indices = _monitorIndicesForMode(mode);
    for (const idx of indices) {
        try {
            const c = new DockController(idx, metadata, _recreateAll);
            c.enable();
            controllers.push(c);
        } catch (e) {
            global.logError(e, 'Aura Dock: failed to create dock for monitor ' + idx);
        }
    }
    global.auraDock = controllers.length ? controllers[0] : null;
}

function _scheduleRecreate() {
    if (_recreateScheduled)
        return;
    _recreateScheduled = true;
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        _recreateScheduled = false;
        try {
            _destroyAll();
            _recreateAll();
        } catch (e) {
            global.logError(e, 'Aura Dock: recreate failed');
        }
        return GLib.SOURCE_REMOVE;
    });
}

function init(meta) {
    metadata = meta;
}

let _monitorsChangedId = 0;

function enable() {
    _recreateAll();

    if (Main.layoutManager && !_monitorsChangedId) {
        _monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            _scheduleRecreate();
        });
    }
}

function disable() {
    if (_monitorsChangedId && Main.layoutManager) {
        try { Main.layoutManager.disconnect(_monitorsChangedId); } catch (e) { /* ignore */ }
        _monitorsChangedId = 0;
    }
    _destroyAll();
}
