// Cinnamon Tiling — a layout based tiling system for Cinnamon, modelled on
// the Tiling Shell extension for GNOME.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Extension = imports.ui.extension;

const Me = Extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const _ = U._;
const L = Me.imports.lib.layouts;
const SettingsLib = Me.imports.lib.settings;
const TilingLib = Me.imports.lib.tilingManager;
const KeysLib = Me.imports.lib.keybindings;
const EditorLib = Me.imports.lib.editor;
const SuggestionsLib = Me.imports.lib.suggestions;
const BorderLib = Me.imports.lib.windowBorder;
const IndicatorLib = Me.imports.lib.indicator;
const WindowMenuLib = Me.imports.lib.windowMenu;

const WM_KEYS_SCHEMA = 'org.cinnamon.desktop.keybindings.wm';
const MUFFIN_SCHEMA = 'org.cinnamon.muffin';
const CONFLICTING_WM_KEYS = [
    'push-tile-left', 'push-tile-right', 'push-tile-up', 'push-tile-down',
    'push-snap-left', 'push-snap-right', 'push-snap-up', 'push-snap-down',
    'maximize', 'unmaximize', 'toggle-maximized',
];
const KEY_SETTINGS = ['enable-move-keybindings', ...KeysLib.ACTIONS];

var Controller = class Controller {
    constructor() {
        this.settings = new SettingsLib.SettingsWrapper(U.UUID);
        this._editor = null;
        this._suggestions = null;
        this._indicator = null;
        this._border = null;
        this._suppressLayoutReload = false;
        this._keysTimer = 0;
        this._panelTimer = 0;
        this._signals = new U.SignalTracker();

        this._loadLayouts();
        this.tiling = new TilingLib.TilingManager(this);
        this.keys = new KeysLib.KeybindingManager(this);
        this._osd = new IndicatorLib.LayoutOsd(this);
        this._windowMenu = new WindowMenuLib.WindowMenuPatch(this);

        this._applyOverrides();
        this._scheduleKeys();
        this._syncIndicator();
        this._syncBorder();

        this.settings.connect('layouts-json', () => {
            if (!this._suppressLayoutReload) {
                this._loadLayouts();
                this._refreshIndicator();
            }
        });
        this.settings.connect('selected-layouts', () => this._refreshIndicator());
        this.settings.connect('sync-layout-across-workspaces', () => this._refreshIndicator());
        this.settings.connect('show-indicator', () => this._syncIndicator());
        this.settings.connect('enable-window-border', () => this._syncBorder());
        for (const k of ['window-border-width', 'window-border-radius', 'window-border-color', 'window-use-custom-border-color']) {
            this.settings.connect(k, () => {
                if (this._border)
                    this._border.updateStyle();
            });
        }
        for (const k of [...KEY_SETTINGS, 'disable-cinnamon-edge-tiling', 'override-cinnamon-keybindings'])
            this.settings.connect(k, () => this._scheduleKeys(true));

        this._signals.connect(global.workspace_manager, 'active-workspace-changed', () => this._refreshIndicator());
        this._signals.connect(Main.layoutManager, 'monitors-changed', () => {
            if (this._editor)
                this._editor.close();
            if (this._suggestions)
                this._suggestions.close();
            this._refreshIndicator();
        });
        // Panels get rebuilt when the user edits them; put the indicator back.
        this._signals.connect(global.settings, 'changed::panels-enabled', () => {
            this._panelTimer = U.removeSource(this._panelTimer);
            this._panelTimer = U.timeout(800, () => {
                this._panelTimer = 0;
                this._destroyIndicator();
                this._syncIndicator();
            });
        });
    }

    // ---- layouts ---------------------------------------------------------

    get layouts() {
        return this._layouts;
    }

    _loadLayouts() {
        let layouts = L.normalizeLayouts(this.settings.getCopy('layouts-json'));
        if (layouts.length === 0)
            layouts = L.normalizeLayouts(L.DEFAULT_LAYOUTS);
        this._layouts = layouts;
    }

    _saveLayouts() {
        this._suppressLayoutReload = true;
        try {
            this.settings.set('layouts-json', JSON.parse(JSON.stringify(this._layouts)));
        } finally {
            this._suppressLayoutReload = false;
        }
        this._refreshIndicator();
    }

    gaps() {
        const s = U.scaleFactor();
        return {
            inner: Math.round(this.settings.get('inner-gaps') * s),
            outer: Math.round(this.settings.get('outer-gaps') * s),
        };
    }

    _selectionKey() {
        if (this.settings.get('sync-layout-across-workspaces'))
            return 'all';
        return String(global.workspace_manager.get_active_workspace_index());
    }

    layoutFor(monitorIndex) {
        const sel = this.settings.get('selected-layouts') || {};
        const ids = [(sel[this._selectionKey()] || [])[monitorIndex], (sel.all || [])[monitorIndex]];
        for (const id of ids) {
            const l = id && this._layouts.find(x => x.id === id);
            if (l)
                return l;
        }
        return this._layouts[0];
    }

    setLayout(monitorIndex, layoutId) {
        const sel = this.settings.getCopy('selected-layouts') || {};
        const key = this._selectionKey();
        const n = U.monitors().length;
        const arr = (sel[key] || []).slice();
        for (let i = 0; i < n; i++) {
            if (monitorIndex < 0 || i === monitorIndex)
                arr[i] = layoutId;
            else if (!arr[i])
                arr[i] = this.layoutFor(i).id;
        }
        sel[key] = arr;
        this.settings.set('selected-layouts', sel);
        this._refreshIndicator();
    }

    saveLayout(layout, originalId, monitorIndex) {
        const l = L.normalizeLayout(layout, layout.id);
        if (!l)
            return;
        if (originalId) {
            const i = this._layouts.findIndex(x => x.id === originalId);
            l.id = originalId;
            if (i >= 0)
                this._layouts[i] = l;
            else
                this._layouts.push(l);
        } else {
            l.id = L.uniqueId(this._layouts);
            this._layouts.push(l);
        }
        this._saveLayouts();
        if (monitorIndex !== undefined && monitorIndex !== null)
            this.setLayout(monitorIndex, l.id);
    }

    deleteLayout(id) {
        if (this._layouts.length <= 1)
            return;
        this._layouts = this._layouts.filter(l => l.id !== id);
        this._saveLayouts();
    }

    resetLayouts() {
        this._layouts = L.normalizeLayouts(L.DEFAULT_LAYOUTS);
        this._saveLayouts();
        this.settings.set('selected-layouts', {});
        Main.notify(_('Cinnamon Tiling'), _('Layouts were reset to the defaults.'));
    }

    // ---- UI entry points ---------------------------------------------------

    _pointerMonitor() {
        const p = U.pointer();
        return U.monitorAt(p.x, p.y);
    }

    openEditor(layoutId, monitorIndex) {
        if (this._editor)
            return;
        const mon = (typeof monitorIndex === 'number') ? monitorIndex : this._pointerMonitor();
        const layout = (layoutId && this._layouts.find(l => l.id === layoutId)) || this.layoutFor(mon);
        this._editor = new EditorLib.LayoutEditor(this, layout, mon, { isNew: false });
    }

    newLayout(monitorIndex) {
        if (this._editor)
            return;
        const mon = (typeof monitorIndex === 'number') ? monitorIndex : this._pointerMonitor();
        const layout = { id: L.uniqueId(this._layouts), tiles: [{ x: 0, y: 0, width: 1, height: 1, groups: [] }] };
        this._editor = new EditorLib.LayoutEditor(this, layout, mon, { isNew: true });
    }

    onEditorClosed(editor) {
        if (this._editor === editor)
            this._editor = null;
    }

    showSuggestions(monitorIndex, win, edgeTile) {
        if (this._suggestions)
            this._suggestions.close();
        const s = new SuggestionsLib.Suggestions(this, monitorIndex, win, edgeTile || null);
        this._suggestions = s.actor ? s : null;
    }

    onSuggestionsClosed(s) {
        if (this._suggestions === s)
            this._suggestions = null;
    }

    showLayoutOsd(monitorIndex, layoutId) {
        this._osd.show(monitorIndex, layoutId);
    }

    openSettings() {
        Util.spawn(['xlet-settings', 'extension', U.UUID]);
    }

    _fileDialog(save, cb) {
        const zenity = GLib.find_program_in_path('zenity');
        const fallback = GLib.build_filenamev([GLib.get_home_dir(), 'tiling-layouts.json']);
        if (!zenity) {
            cb(fallback);
            return;
        }
        const argv = [zenity, '--file-selection', '--title', save ? _('Export layouts') : _('Import layouts'), `--file-filter=${_('JSON files')} | *.json`];
        if (save)
            argv.push('--save', '--confirm-overwrite', `--filename=${fallback}`);
        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, out] = p.communicate_utf8_finish(res);
                    const path = (out || '').trim();
                    if (p.get_successful() && path)
                        cb(path);
                } catch (e) {
                    U.logError(e, 'file dialog');
                }
            });
        } catch (e) {
            U.logError(e, 'zenity');
            cb(fallback);
        }
    }

    exportLayouts() {
        this._fileDialog(true, path => {
            const data = new TextEncoder().encode(JSON.stringify(this._layouts, null, 2));
            const file = Gio.File.new_for_path(path);
            file.replace_contents_bytes_async(new GLib.Bytes(data), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
                    try {
                        f.replace_contents_finish(res);
                        Main.notify(_('Cinnamon Tiling'), _('Exported %d layouts to %s.').format(this._layouts.length, path));
                    } catch (e) {
                        Main.notify(_('Cinnamon Tiling'), _('Export failed: %s').format(e.message));
                    }
                });
        });
    }

    importLayouts() {
        this._fileDialog(false, path => {
            Gio.File.new_for_path(path).load_contents_async(null, (f, res) => {
                try {
                    const [, bytes] = f.load_contents_finish(res);
                    const parsed = JSON.parse(new TextDecoder().decode(bytes));
                    const incoming = L.normalizeLayouts(Array.isArray(parsed) ? parsed : [parsed]);
                    if (incoming.length === 0)
                        throw new Error(_('The file contains no valid layouts.'));
                    for (const l of incoming) {
                        const i = this._layouts.findIndex(x => x.id === l.id);
                        if (i >= 0)
                            this._layouts[i] = l;
                        else
                            this._layouts.push(l);
                    }
                    this._saveLayouts();
                    Main.notify(_('Cinnamon Tiling'), _('Imported %d layouts.').format(incoming.length));
                } catch (e) {
                    Main.notify(_('Cinnamon Tiling'), _('Import failed: %s').format(e.message));
                }
            });
        });
    }

    // ---- indicator / border ----------------------------------------------

    _syncIndicator() {
        const want = this.settings.get('show-indicator');
        if (want && !this._indicator) {
            try {
                this._indicator = new IndicatorLib.Indicator(this);
            } catch (e) {
                U.logError(e, 'indicator');
                this._indicator = null;
            }
        } else if (!want) {
            this._destroyIndicator();
        }
    }

    _destroyIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _refreshIndicator() {
        if (this._indicator)
            this._indicator.refresh();
    }

    _syncBorder() {
        const want = this.settings.get('enable-window-border');
        if (want && !this._border) {
            this._border = new BorderLib.WindowBorder(this);
        } else if (!want && this._border) {
            this._border.destroy();
            this._border = null;
        }
    }

    // ---- overriding conflicting Cinnamon settings ------------------------

    _scheduleKeys(reapply = false) {
        this._keysTimer = U.removeSource(this._keysTimer);
        this._keysTimer = U.timeout(reapply ? 300 : 500, () => {
            this._keysTimer = 0;
            try {
                if (reapply) {
                    this.keys.unregister();
                    this._applyOverrides();
                    // Give Muffin a moment to release accelerators we freed.
                    U.timeout(300, () => this.keys.register());
                } else {
                    this.keys.register();
                }
            } catch (e) {
                U.logError(e, 'keybindings');
            }
        });
    }

    _gsettings(schema) {
        const src = Gio.SettingsSchemaSource.get_default();
        if (!src.lookup(schema, true))
            return null;
        return new Gio.Settings({ schema_id: schema });
    }

    // Saved originals look like { schema: { key: { type, value } } }.
    _applyOverrides() {
        const saved = this.settings.getCopy('overridden-settings') || {};
        const want = {};
        if (this.settings.get('disable-cinnamon-edge-tiling'))
            want[MUFFIN_SCHEMA] = { 'edge-tiling': new GLib.Variant('b', false) };

        if (this.settings.get('override-cinnamon-keybindings')) {
            const accels = this.keys.configuredAccelerators();
            const gs = this._gsettings(WM_KEYS_SCHEMA);
            if (gs && accels.size) {
                for (const key of CONFLICTING_WM_KEYS) {
                    if (!gs.settings_schema.has_key(key))
                        continue;
                    const orig = saved[WM_KEYS_SCHEMA] && saved[WM_KEYS_SCHEMA][key]
                        ? saved[WM_KEYS_SCHEMA][key].value : gs.get_strv(key);
                    if (orig.some(a => accels.has(a))) {
                        want[WM_KEYS_SCHEMA] = want[WM_KEYS_SCHEMA] || {};
                        want[WM_KEYS_SCHEMA][key] = new GLib.Variant('as', orig.filter(a => !accels.has(a)));
                    }
                }
            }
        }

        // Restore anything we no longer need to override.
        for (const schema of Object.keys(saved)) {
            for (const key of Object.keys(saved[schema])) {
                if (want[schema] && want[schema][key])
                    continue;
                this._restoreKey(schema, key, saved[schema][key]);
                delete saved[schema][key];
            }
            if (Object.keys(saved[schema]).length === 0)
                delete saved[schema];
        }
        // Apply new overrides, remembering the user's original values once.
        for (const schema of Object.keys(want)) {
            const gs = this._gsettings(schema);
            if (!gs)
                continue;
            for (const key of Object.keys(want[schema])) {
                if (!gs.settings_schema.has_key(key))
                    continue;
                saved[schema] = saved[schema] || {};
                if (!saved[schema][key]) {
                    const v = gs.get_value(key);
                    saved[schema][key] = { type: v.get_type_string(), value: v.deep_unpack() };
                }
                gs.set_value(key, want[schema][key]);
            }
        }
        this.settings.set('overridden-settings', saved);
    }

    _restoreKey(schema, key, entry) {
        try {
            const gs = this._gsettings(schema);
            if (gs && gs.settings_schema.has_key(key))
                gs.set_value(key, new GLib.Variant(entry.type, entry.value));
        } catch (e) {
            U.logError(e, `restore ${schema} ${key}`);
        }
    }

    _restoreOverrides() {
        const saved = this.settings.getCopy('overridden-settings') || {};
        for (const schema of Object.keys(saved)) {
            for (const key of Object.keys(saved[schema]))
                this._restoreKey(schema, key, saved[schema][key]);
        }
        this.settings.set('overridden-settings', {});
    }

    destroy() {
        this._keysTimer = U.removeSource(this._keysTimer);
        this._panelTimer = U.removeSource(this._panelTimer);
        this._signals.disconnectAll();
        if (this._editor)
            this._editor.close();
        if (this._suggestions)
            this._suggestions.close();
        this.keys.destroy();
        this._restoreOverrides();
        this._windowMenu.destroy();
        this._osd.destroy();
        this._destroyIndicator();
        if (this._border)
            this._border.destroy();
        this.tiling.destroy();
        this.settings.destroy();
        U.clearAllSources();
    }
};

let controller = null;

function init(metadata) {
}

function enable() {
    try {
        controller = new Controller();
    } catch (e) {
        U.logError(e, 'enable');
        throw e;
    }
    // Methods used by the "button" rows in the settings window.
    return {
        openEditor: () => controller && controller.openEditor(),
        newLayout: () => controller && controller.newLayout(),
        importLayouts: () => controller && controller.importLayouts(),
        exportLayouts: () => controller && controller.exportLayouts(),
        resetLayouts: () => controller && controller.resetLayouts(),
    };
}

function disable() {
    if (controller) {
        controller.destroy();
        controller = null;
    }
}
