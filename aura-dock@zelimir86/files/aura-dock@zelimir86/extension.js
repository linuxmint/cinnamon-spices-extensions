// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Extension = imports.ui.extension;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

const Me = Extension.getCurrentExtension();

let metadata = null;
let controllers = [];
let _recreateScheduled = false;
let _monitorsChangedId = 0;

function _readMonitorMode(callback) {
    try {
        const Gio = imports.gi.Gio;
        const path = GLib.build_filenamev([
            GLib.get_user_config_dir(), 'cinnamon', 'spices',
            metadata.uuid, metadata.uuid + '.json'
        ]);
        const file = Gio.File.new_for_path(path);
        file.load_contents_async(null, (f, res) => {
            try {
                const [ok, bytes] = f.load_contents_finish(res);
                if (ok) {
                    const text = imports.byteArray.toString(bytes);
                    const data = JSON.parse(text);
                    if (data && data.monitor && data.monitor.value) {
                        callback(data.monitor.value);
                        return;
                    }
                }
            } catch (e) {
                // Fall back to the primary monitor.
            }
            callback('primary');
        });
    } catch (e) {
        callback('primary');
    }
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

function _recreateAll(mode, callback) {
    const { DockController } = Me.imports.dock;
    const doCreate = (m) => {
        const indices = _monitorIndicesForMode(m);
        for (const idx of indices) {
            try {
                const c = new DockController(idx, metadata, (newMode) => {
                    _destroyAll();
                    _recreateAll(newMode);
                });
                c.enable();
                controllers.push(c);
            } catch (e) {
                global.logError(e, 'Aura Dock: failed to create dock for monitor ' + idx);
            }
        }
        global.auraDock = controllers.length ? controllers[0] : null;
        if (callback) callback();
    };

    if (mode) {
        doCreate(mode);
    } else {
        _readMonitorMode(doCreate);
    }
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
