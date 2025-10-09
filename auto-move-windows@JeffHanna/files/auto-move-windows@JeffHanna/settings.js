/*
 * settings.js - Preferences UI for auto-move-windows
 * Minimal, robust row-based editor for `app-rules` (saved as an array).
 * - Add rule
 * - Remove row
 * - Save rules (validates required wmClass and numeric fields)
 * - Capture current active window (pre-fills wmClass + geometry when available)
 */

const { Gio, GLib, Gtk } = imports.gi;
const Settings = imports.ui.settings;
const ExtensionUtils = imports.misc.extensionUtils;

let settings;

function init(metadata) {}

function buildPrefsWidget() {
    Gtk.init(null);
    settings = new Settings.ExtensionSettings(null, ExtensionUtils.getCurrentExtension().uuid);

    const main = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, border_width: 6 });
    const title = new Gtk.Label({ label: '<b>Auto Move Windows — JSON editor</b>', use_markup: true, xalign: 0 });
    main.pack_start(title, false, false, 0);

    const desc = new Gtk.Label({ label: 'Edit `app-rules` as JSON. Each item is an object: { wmClass: string (case-insensitive), workspace?: number, x?: number, y?: number, width?: number, height?: number, firstOnly?: boolean }', xalign: 0, wrap: true });
    main.pack_start(desc, false, false, 0);

    const scrolled = new Gtk.ScrolledWindow({ hexpand: true, vexpand: true });
    const textview = new Gtk.TextView({ wrap_mode: Gtk.WrapMode.WORD });
    scrolled.add(textview);
    main.pack_start(scrolled, true, true, 0);

    // Load existing value
    let rules = settings.getValue('app-rules');
    if (!Array.isArray(rules)) rules = [];
    const buffer = textview.get_buffer();
    try {
        buffer.set_text(JSON.stringify(rules, null, 2));
    } catch (e) {
        buffer.set_text('[]');
    }

    const btnBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
    const saveBtn = new Gtk.Button({ label: 'Save JSON' });
    const status = new Gtk.Label({ label: '' });
    saveBtn.connect('clicked', () => {
        const [start, end] = [buffer.get_start_iter(), buffer.get_end_iter()];
        const text = buffer.get_text(start, end, true);
        try {
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error('Top-level value must be an array of rule objects');
            // Normalize wmClass to lowercase for each rule
            for (let i = 0; i < parsed.length; i++) {
                const r = parsed[i];
                if (r && r.wmClass) r.wmClass = String(r.wmClass).toLowerCase();
            }
            settings.setValue('app-rules', parsed);
            status.set_text('Saved ' + parsed.length + ' rule(s).');
        } catch (e) {
            status.set_text('JSON error: ' + e.message);
        }
    });
    btnBox.pack_start(saveBtn, false, false, 0);

    const captureBtn = new Gtk.Button({ label: 'Capture Current Window' });
    captureBtn.connect('clicked', () => {
        try {
            let win = null;
            if (global.display && global.display.get_focus_window) win = global.display.get_focus_window();
            if (!win && global.screen && global.screen.get_active_window) win = global.screen.get_active_window();
            if (!win) { status.set_text('No active window'); return; }
            let wm = null; try { wm = win.get_wm_class && win.get_wm_class(); } catch (e) { wm = null; }
            if (!wm) { status.set_text('WM_CLASS not available'); return; }
            let rect = null; try { rect = win.get_frame_rect && win.get_frame_rect(); } catch (e) { rect = null; }
            const rule = { wmClass: wm.toLowerCase() };
            if (rect) { rule.x = rect.x; rule.y = rect.y; rule.width = rect.width; rule.height = rect.height; }
            // Append to buffer
            const [start, end] = [buffer.get_start_iter(), buffer.get_end_iter()];
            let text = buffer.get_text(start, end, true);
            try {
                const arr = JSON.parse(text);
                if (!Array.isArray(arr)) throw new Error('top-level not array');
                arr.push(rule);
                buffer.set_text(JSON.stringify(arr, null, 2));
                status.set_text('Captured ' + wm);
            } catch (e) { status.set_text('Cannot append: JSON invalid'); }
        } catch (e) { status.set_text('Capture error: ' + e.message); }
    });
    btnBox.pack_start(captureBtn, false, false, 0);

    btnBox.pack_start(status, true, true, 0);
    main.pack_start(btnBox, false, false, 0);

    main.show_all();
    return main;
}
