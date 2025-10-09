const { Gio, GLib } = imports.gi;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

let settings, container, listBox, addButton, saveButton, statusLabel;

function init(metadata) {}

function _makeRow(rule) {
    rule = rule || {};
    // Use a column-based layout: left column for WM_CLASS, right column for numeric fields + actions
    let row = new St.BoxLayout({ style_class: 'amw-row', vertical: false, x_expand: true, y_expand: false });

    // Left column: WM_CLASS and First-only
    let leftCol = new St.BoxLayout({ vertical: true, style_class: 'amw-leftcol' });
    const { Gio, GLib } = imports.gi;
    const Settings = imports.ui.settings;
    const St = imports.gi.St;
    const Main = imports.ui.main;
    const ExtensionUtils = imports.misc.extensionUtils;

    let settings, container, listBox, addButton, saveButton, statusLabel;

    function init(metadata) {}

    function _makeRow(rule) {
        rule = rule || {};
        // Use a column-based layout: left column for WM_CLASS, right column for numeric fields + actions
        let row = new St.BoxLayout({ style_class: 'amw-row', vertical: false, x_expand: true, y_expand: false });

        // Left column: WM_CLASS and First-only
        let leftCol = new St.BoxLayout({ vertical: true, style_class: 'amw-leftcol' });
        let wmLabel = new St.Label({ text: 'App (WM_CLASS):', style_class: 'amw-label' });
        let wmEntry = new St.Entry({ text: rule.wmClass || '', style_class: 'amw-entry', x_expand: true });
        let firstRow = new St.BoxLayout({ vertical: false });
        let firstCheck = new St.CheckButton({ active: !!rule.firstOnly });
        firstRow.add_child(new St.Label({ text: 'First only', style_class: 'amw-label-small' }));
        firstRow.add_child(firstCheck);
        const { Gio, GLib } = imports.gi;
        const Settings = imports.ui.settings;
        const St = imports.gi.St;
        const Main = imports.ui.main;
        const ExtensionUtils = imports.misc.extensionUtils;

        let settings, container, listBox, addButton, saveButton, statusLabel;

        function init(metadata) {}

        function _makeRow(rule) {
            rule = rule || {};
            let row = new St.BoxLayout({ style_class: 'amw-row', vertical: false, x_expand: true, y_expand: false });

            // WM_CLASS + firstOnly
            let wmEntry = new St.Entry({ text: rule.wmClass || '', style_class: 'amw-entry', x_expand: true });
            let firstCheck = new St.CheckButton({ active: !!rule.firstOnly });

            // Numeric fields
            let wsEntry = new St.Entry({ text: (Number.isInteger(rule.workspace) ? String(rule.workspace) : ''), style_class: 'amw-entry-small' });
            let xEntry = new St.Entry({ text: (Number.isFinite(rule.x) ? String(rule.x) : ''), style_class: 'amw-entry-small' });
            let yEntry = new St.Entry({ text: (Number.isFinite(rule.y) ? String(rule.y) : ''), style_class: 'amw-entry-small' });
            let wEntry = new St.Entry({ text: (Number.isFinite(rule.width) ? String(rule.width) : ''), style_class: 'amw-entry-small' });
            let hEntry = new St.Entry({ text: (Number.isFinite(rule.height) ? String(rule.height) : ''), style_class: 'amw-entry-small' });

            // Build layout
            let left = new St.BoxLayout({ vertical: true });
            left.add_child(new St.Label({ text: 'App (WM_CLASS):' }));
            left.add_child(wmEntry);
            left.add_child(firstCheck);

            let right = new St.BoxLayout({ vertical: true });
            let grid = new St.GridLayout({ column_spacing: 8 });
            grid.add_child_at(new St.Label({ text: 'WS' }), 0, 0);
            grid.add_child_at(wsEntry, 1, 0);
            grid.add_child_at(new St.Label({ text: 'X' }), 0, 1);
            grid.add_child_at(xEntry, 1, 1);
            grid.add_child_at(new St.Label({ text: 'Y' }), 0, 2);
            grid.add_child_at(yEntry, 1, 2);
            grid.add_child_at(new St.Label({ text: 'W' }), 0, 3);
            grid.add_child_at(wEntry, 1, 3);
            grid.add_child_at(new St.Label({ text: 'H' }), 0, 4);
            grid.add_child_at(hEntry, 1, 4);
            right.add_child(grid);

            let removeBtn = new St.Button({ label: 'Remove' });
            removeBtn.connect('clicked', () => listBox.remove_child(row));
            right.add_child(removeBtn);

            row.add_child(left);
            row.add_child(right);

            row._fields = { wmEntry, wsEntry, xEntry, yEntry, wEntry, hEntry, firstCheck };
            return row;
        }

        function buildPrefsWidget() {
            settings = new Settings.ExtensionSettings(null, ExtensionUtils.getCurrentExtension().uuid);
            container = new St.BoxLayout({ vertical: true });

            container.add_child(new St.Label({ text: 'Auto Move Windows — Rules', style_class: 'pref-title' }));
            container.add_child(new St.Label({ text: 'WM_CLASS matching is case-insensitive. Workspace indices are 0-based.', style_class: 'pref-description', wrap: true }));

            listBox = new St.BoxLayout({ vertical: true });
            /**
             * Initialize the extension.
             * - metadata (object): Metadata about the extension, including its UUID.
             */
            let scroll = new St.ScrollView({ x_expand: true, y_expand: true });
            scroll.add_actor(listBox);
            container.add_child(scroll);

            let bar = new St.BoxLayout({ vertical: false });
            addButton = new St.Button({ label: 'Add rule' });
            saveButton = new St.Button({ label: 'Save rules' });
            bar.add_child(addButton);
            bar.add_child(saveButton);
            container.add_child(bar);

            statusLabel = new St.Label({ text: '' });
            container.add_child(statusLabel);

            addButton.connect('clicked', () => listBox.add_child(_makeRow({}))); 
            saveButton.connect('clicked', _saveRules);

            let rules = settings.getValue('app-rules') || [];
            for (let i = 0; i < rules.length; i++) listBox.add_child(_makeRow(rules[i]));

            let exampleBtn = new St.Button({ label: 'Insert example rules' });
            exampleBtn.connect('clicked', () => {
                listBox.remove_all_children();
                listBox.add_child(_makeRow({ wmClass: 'firefox', workspace: 1, x: 50, y: 50, width: 1200, height: 800 }));
                listBox.add_child(_makeRow({ wmClass: 'gnome-terminal', workspace: 2, width: 1000, height: 700, firstOnly: true }));
            });
            container.add_child(exampleBtn);

            let captureBtn = new St.Button({ label: 'Capture Current Window' });
            captureBtn.connect('clicked', _captureCurrentWindow);
            container.add_child(captureBtn);

            return container;
        }

        function _saveRules() {
            try {
                let rules = [];
                let errors = [];
                let children = listBox.get_children();
                for (let i = 0; i < children.length; i++) {
                    let row = children[i];
                    if (!row._fields) continue;
                    let f = row._fields;
                    let wm = f.wmEntry.get_text().trim();
                    if (!wm) { errors.push('Row ' + (i+1) + ': WM_CLASS is required'); continue; }
                    wm = wm.toLowerCase();
                    let ws = f.wsEntry.get_text().trim();
                    let workspace = ws !== '' ? parseInt(ws) : undefined;
                    if (workspace !== undefined && (isNaN(workspace) || workspace < 0)) errors.push('Row ' + (i+1) + ': workspace must be a non-negative integer');
                    let x = f.xEntry.get_text().trim(); x = x !== '' ? parseInt(x) : undefined;
                    let y = f.yEntry.get_text().trim(); y = y !== '' ? parseInt(y) : undefined;
                    let w = f.wEntry.get_text().trim(); w = w !== '' ? parseInt(w) : undefined;
                    let h = f.hEntry.get_text().trim(); h = h !== '' ? parseInt(h) : undefined;
            /**
             * Build a UI row for a single rule.
             * - rule (object): may contain wmClass, workspace, x, y, width, height, firstOnly
             * Returns: a St.Actor row with attached _fields for reading values on save.
             */
                    if (w !== undefined && (isNaN(w) || w <= 0)) errors.push('Row ' + (i+1) + ': width must be a positive integer');
                    if (h !== undefined && (isNaN(h) || h <= 0)) errors.push('Row ' + (i+1) + ': height must be a positive integer');
                    let firstOnly = !!f.firstCheck.active;

                    let rule = { wmClass: wm };
                    if (workspace !== undefined) rule.workspace = workspace;
                    if (x !== undefined) rule.x = x; if (y !== undefined) rule.y = y;
                    if (w !== undefined) rule.width = w; if (h !== undefined) rule.height = h;
                    if (firstOnly) rule.firstOnly = true;
                    rules.push(rule);
                }

                if (errors.length) { statusLabel.text = 'Errors: ' + errors.join('; '); return; }

                settings.setValue('app-rules', rules);
                statusLabel.text = 'Saved ' + rules.length + ' rule(s).';
            } catch (e) { statusLabel.text = 'Error saving rules: ' + e.message; }
        }

        function _captureCurrentWindow() {
            try {
                let win = (global.display && global.display.get_focus_window) ? global.display.get_focus_window() : null;
                if (!win && global.screen && global.screen.get_active_window) win = global.screen.get_active_window();
                if (!win && Main && Main.get_focus_window) win = Main.get_focus_window();
                if (!win) { statusLabel.text = 'No active window to capture.'; return; }

                let wm = null; try { wm = win.get_wm_class && win.get_wm_class(); } catch (e) { wm = null; }
                if (!wm) { statusLabel.text = 'Cannot determine WM_CLASS for active window.'; return; }

                let rect = null; try { rect = win.get_frame_rect && win.get_frame_rect(); } catch (e) { rect = null; }
                let rule = { wmClass: wm.toLowerCase() };
                if (rect) { rule.x = rect.x; rule.y = rect.y; rule.width = rect.width; rule.height = rect.height; }
                listBox.add_child(_makeRow(rule));
                statusLabel.text = 'Captured ' + wm;
            } catch (e) { statusLabel.text = 'Error capturing window: ' + e.message; }
        }

    actionsRow.add_child(delBtn);
    rightCol.add_child(actionsRow);

    delBtn.connect('clicked', () => {
        listBox.remove_child(row);
    });

    row.add_child(leftCol);
    row.add_child(rightCol);

    // attach a small accessor to read values later
    row._fields = { wmEntry, wsEntry, xEntry, yEntry, wEntry, hEntry, firstCheck };
    return row;
}

function buildPrefsWidget() {
    settings = new Settings.ExtensionSettings(null, ExtensionUtils.getCurrentExtension().uuid);

    container = new St.BoxLayout({ style_class: 'vbox pref-amw', vertical: true, x_expand: true, y_expand: true });

            /**
             * Validate and save rules from the UI back into settings.
             * - Normalizes wmClass to lowercase before storing (runtime expects lowercase matching).
             * - Skips empty rows and displays validation errors in `statusLabel`.
             */
    let title = new St.Label({ text: 'Auto Move Windows — Rules', style_class: 'pref-title' });
    container.add_child(title);

    let help = new St.Label({ text: 'Add rules to move/resize windows when they open. WM_CLASS matching is used (use `xprop WM_CLASS` to inspect). Workspace indices are 0-based.', style_class: 'pref-description', wrap: true });
    container.add_child(help);

    // Scrollable list area
    listBox = new St.BoxLayout({ style_class: 'amw-list', vertical: true, x_expand: true, y_expand: true });
    let scroll = new St.ScrollView({ x_expand: true, y_expand: true });
    scroll.add_actor(listBox);
    container.add_child(scroll);

    // Buttons
    let btnBar = new St.BoxLayout({ style_class: 'pref-buttons' });
    addButton = new St.Button({ label: 'Add rule' });
    saveButton = new St.Button({ label: 'Save rules' });
    btnBar.add_child(addButton);
    btnBar.add_child(saveButton);
    container.add_child(btnBar);

    statusLabel = new St.Label({ text: '', style_class: 'pref-status' });
    container.add_child(statusLabel);

    addButton.connect('clicked', () => {
        listBox.add_child(_makeRow({}));
    });

    saveButton.connect('clicked', () => {
        _saveRules();
    });

    // Load rules into rows
    let rules = settings.getValue('app-rules') || [];
    for (let i = 0; i < rules.length; i++) {
        listBox.add_child(_makeRow(rules[i]));
    }

    // Provide a quick example
    let exampleBtn = new St.Button({ label: 'Insert example rules' });
    exampleBtn.connect('clicked', () => {
        listBox.remove_all_children();
        listBox.add_child(_makeRow({ wmClass: 'Firefox', workspace: 1, x: 50, y: 50, width: 1200, height: 800, firstOnly: false }));
        listBox.add_child(_makeRow({ wmClass: 'Gnome-terminal', workspace: 2, width: 1000, height: 700, firstOnly: true }));
    });
    container.add_child(exampleBtn);
    // Capture current window button
    let captureBtn = new St.Button({ label: 'Capture Current Window' });
    captureBtn.connect('clicked', () => {
        _captureCurrentWindow();
    });
    container.add_child(captureBtn);

            /**
             * Capture the currently focused/active window and insert a pre-filled rule row.
             * This is best-effort: WM_CLASS or geometry may not be available for some windows/compositors.
             */
    return container;
}

function _saveRules() {
    try {
        let rules = [];
        let errors = [];
        let children = listBox.get_children();
        for (let i = 0; i < children.length; i++) {
            let row = children[i];
            if (!row._fields) continue;
            let f = row._fields;
            let wm = f.wmEntry.get_text().trim();
            if (!wm) {
                errors.push('Row ' + (i+1) + ': WM_CLASS is required');
                continue;
            }
            let workspaceText = f.wsEntry.get_text().trim();
            let workspace = workspaceText !== '' ? parseInt(workspaceText) : undefined;
            if (workspace !== undefined && (isNaN(workspace) || workspace < 0)) {
                errors.push('Row ' + (i+1) + ': workspace must be a non-negative integer');
            }
            let xText = f.xEntry.get_text().trim();
            let yText = f.yEntry.get_text().trim();
            let wText = f.wEntry.get_text().trim();
            let hText = f.hEntry.get_text().trim();
            let x = xText !== '' ? parseInt(xText) : undefined;
            let y = yText !== '' ? parseInt(yText) : undefined;
            let width = wText !== '' ? parseInt(wText) : undefined;
            let height = hText !== '' ? parseInt(hText) : undefined;
            if (width !== undefined && (isNaN(width) || width <= 0)) errors.push('Row ' + (i+1) + ': width must be a positive integer');
            if (height !== undefined && (isNaN(height) || height <= 0)) errors.push('Row ' + (i+1) + ': height must be a positive integer');
            let firstOnly = !!f.firstCheck.active;

            let rule = { wmClass: wm };
            if (workspace !== undefined) rule.workspace = workspace;
            if (x !== undefined) rule.x = x;
            if (y !== undefined) rule.y = y;
            if (width !== undefined) rule.width = width;
            if (height !== undefined) rule.height = height;
            if (firstOnly) rule.firstOnly = true;
            rules.push(rule);
        }

        if (errors.length > 0) {
            statusLabel.text = 'Errors: ' + errors.join('; ');
            return;
        }

        settings.setValue('app-rules', rules);
        statusLabel.text = 'Saved ' + rules.length + ' rule(s).';
    } catch (e) {
        statusLabel.text = 'Error saving rules: ' + e.message;
    }
}

function _captureCurrentWindow() {
    try {
        let win = null;
        if (global.display && global.display.get_focus_window)
            win = global.display.get_focus_window();
        if (!win && global.screen && global.screen.get_active_window)
            win = global.screen.get_active_window();
        if (!win && Main && Main.get_focus_window)
            win = Main.get_focus_window();

        if (!win) {
            statusLabel.text = 'No active window to capture.';
            return;
        }

        let wm = null;
        try { wm = win.get_wm_class && win.get_wm_class(); } catch (e) { wm = null; }
        if (!wm) {
            statusLabel.text = 'Cannot determine WM_CLASS for active window.';
            return;
        }

        let rect = null;
        try { rect = win.get_frame_rect && win.get_frame_rect(); } catch (e) { rect = null; }

        let rule = { wmClass: wm };
        if (rect) {
            rule.x = rect.x; rule.y = rect.y; rule.width = rect.width; rule.height = rect.height;
        }

        listBox.add_child(_makeRow(rule));
        statusLabel.text = 'Captured ' + wm;
    } catch (e) {
        statusLabel.text = 'Error capturing window: ' + e.message;
    }
}
const { Gio, GLib } = imports.gi;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;

let settings, container, textArea, saveButton, errorLabel, exampleButton;

function init(metadata) {
    // nothing to do here
}

function buildPrefsWidget() {
    settings = new Settings.ExtensionSettings(null, ExtensionUtils.getCurrentExtension().uuid);

    container = new St.BoxLayout({ style_class: 'vbox', vertical: true, reactive: true });

    let title = new St.Label({ text: 'Auto Move Windows — Rules (JSON array)', style_class: 'pref-title' });
    container.add_child(title);

    // TextArea: simple multi-line text entry using St.Entry for now (limited). Many spices use a plain entry.
    textArea = new St.Text({ style_class: 'pref-textarea', x_expand: true, y_expand: true });
    // Use a ScrollView container
    let scroll = new St.ScrollView({ x_expand: true, y_expand: true, style_class: 'pref-scroll' });
    scroll.add_actor(textArea);
    container.add_child(scroll);

    errorLabel = new St.Label({ text: '', style_class: 'pref-error' });
    container.add_child(errorLabel);

    let buttonBox = new St.BoxLayout({ style_class: 'pref-buttons' });
    saveButton = new St.Button({ label: 'Save', reactive: true });
    exampleButton = new St.Button({ label: 'Insert Example', reactive: true });
    buttonBox.add_child(saveButton);
    buttonBox.add_child(exampleButton);
    container.add_child(buttonBox);

    saveButton.connect('clicked', () => {
        _save();
    });

    exampleButton.connect('clicked', () => {
        const example = JSON.stringify([
            { wmClass: 'Firefox', workspace: 1, x: 50, y: 50, width: 1200, height: 800, firstOnly: false },
            { wmClass: 'Gnome-terminal', workspace: 2, width: 1000, height: 700, firstOnly: true }
        ], null, 2);
        textArea.text = example;
    });

    // Load current rules
    let rules = settings.getValue('app-rules');
    if (!rules) rules = [];
    try {
        textArea.text = JSON.stringify(rules, null, 2);
    } catch (e) {
        textArea.text = '[]';
    }

    return container;
}

function _save() {
    errorLabel.text = '';
    let raw = textArea.text;
    try {
        let parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('Top-level JSON must be an array');
        settings.setValue('app-rules', parsed);
        errorLabel.text = 'Saved.';
    } catch (e) {
        errorLabel.text = 'Error: ' + e.message;
    }
}
