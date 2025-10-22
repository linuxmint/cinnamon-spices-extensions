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

    // (debug logging preference removed)

    const btnBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
    const saveBtn = new Gtk.Button({ label: 'Save JSON' });
    const status = new Gtk.Label({ label: '' });
    saveBtn.connect('clicked', () => {
        const [start, end] = [buffer.get_start_iter(), buffer.get_end_iter()];
        const text = buffer.get_text(start, end, true);
        try {
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error('Top-level value must be an array of rule objects');
            // Normalize wmClass values: trim and lowercase
            for (let i = 0; i < parsed.length; i++) {
                const r = parsed[i];
                    if (r && r.wmClass) {
                        // If rule is title-based, lowercase the title for case-insensitive matching
                        if (r.matchField && r.matchField === 'title') {
                            r.wmClass = String(r.wmClass).trim().toLowerCase();
                        } else {
                            r.wmClass = String(r.wmClass).trim().toLowerCase();
                        }
                    }
            }
            settings.setValue('app-rules', parsed);
            status.set_text('Saved ' + parsed.length + ' rule(s).');
        } catch (e) {
            status.set_text('JSON error: ' + e.message);
        }
    });
    btnBox.pack_start(saveBtn, false, false, 0);

    const captureBtn = new Gtk.Button({ label: 'Capture Current Window' });
    // Capture field selector (WM_CLASS or Title)
    const captureFieldBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
    const captureLabel = new Gtk.Label({ label: 'Capture as:', xalign: 0 });
    const captureCombo = new Gtk.ComboBoxText();
    captureCombo.append_text('WM_CLASS');
    captureCombo.append_text('Title');
    // Default to WM_CLASS
    captureCombo.set_active(0);
    captureFieldBox.pack_start(captureLabel, false, false, 0);
    captureFieldBox.pack_start(captureCombo, false, false, 0);
    main.pack_start(captureFieldBox, false, false, 0);
    captureBtn.connect('clicked', () => {
        try {
            let win = null;
            if (global.display && global.display.get_focus_window) win = global.display.get_focus_window();
            if (!win && global.screen && global.screen.get_active_window) win = global.screen.get_active_window();
            if (!win) { status.set_text('No active window'); return; }
            const captureField = captureCombo.get_active_text() || 'WM_CLASS';
            let wm = null; try { wm = win.get_wm_class && win.get_wm_class(); } catch (e) { wm = null; }
            let title = null; try { title = win.get_title && win.get_title(); } catch (e) { title = null; }
            if (captureField === 'WM_CLASS' && !wm) { status.set_text('WM_CLASS not available'); return; }
            if (captureField === 'Title' && !title) { status.set_text('Title not available'); return; }
            let rect = null; try { rect = win.get_frame_rect && win.get_frame_rect(); } catch (e) { rect = null; }
            const rule = {};
            if (captureField === 'WM_CLASS') {
                rule.wmClass = String(wm).trim().toLowerCase();
            } else {
                // store lowercased title as the rule's wmClass string and set matchField to title
                rule.wmClass = String(title).trim().toLowerCase();
                rule.matchField = 'title';
            }
            if (rect) { rule.x = rect.x; rule.y = rect.y; rule.width = rect.width; rule.height = rect.height; }
            const [start, end] = [buffer.get_start_iter(), buffer.get_end_iter()];
            let text = buffer.get_text(start, end, true);
            try {
                const arr = JSON.parse(text);
                if (!Array.isArray(arr)) throw new Error('top-level not array');
                arr.push(rule);
                buffer.set_text(JSON.stringify(arr, null, 2));
                status.set_text('Captured ' + (captureField === 'WM_CLASS' ? wm : title));
            } catch (e) { status.set_text('Cannot append: JSON invalid'); }
        } catch (e) { status.set_text('Capture error: ' + e.message); }
    });
    btnBox.pack_start(captureBtn, false, false, 0);

    btnBox.pack_start(status, true, true, 0);
    main.pack_start(btnBox, false, false, 0);

    main.show_all();
    return main;
}
