const { Clutter, GLib, St } = imports.gi;
const { _, COLORS, makeDot } = require('./util');

const SAVE_DELAY_MS = 400;

// Quick notes: saves by itself while the person types.
class NotesTab {
    // `editing` receives { begin(), end() }, as in the Pomodoro tab.
    // `showShelf` is called after the note is sent to the file shelf.
    constructor(engine, editing, showShelf) {
        this._engine = engine;
        this._editing = editing;
        this._showShelf = showShelf;
        this._isEditing = false;
        this._saveTimer = 0;
        this._saved = '';

        // A single card: the text on top and, below, a strip with the reminder
        // that the note saves itself and the two labelled buttons.
        this.actor = new St.BoxLayout({ style_class: 'island-notes', vertical: true, x_expand: true, y_expand: true });

        // The field is only as tall as the text and sits at the top of the
        // area; a click anywhere in the area (even below the text) starts
        // editing.
        let textArea = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            reactive: true,
            clip_to_allocation: true,
        });
        this._entry = new St.Entry({
            style_class: 'island-notes-text',
            can_focus: true,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        let text = this._entry.clutter_text;
        text.single_line_mode = false;
        text.activatable = false;
        text.line_wrap = true;

        // The hint sits at the top, where the text starts (the hint of
        // St.Entry itself shows vertically centred).
        this._hint = new St.Label({
            style_class: 'island-notes-hint',
            text: _("Write a quick note…"),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
        });
        textArea.add_child(this._entry);
        textArea.add_child(this._hint);
        this.actor.add_child(textArea);

        textArea.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
                this._beginEdit();
            return Clutter.EVENT_PROPAGATE;
        });
        text.connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._endEdit();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        text.connect('text-changed', () => {
            this._syncHint();
            if (this._isEditing)
                this._queueSave();
        });

        this._footer = new St.BoxLayout({ style_class: 'island-notes-footer' });
        this._status = new St.Label({
            style_class: 'island-notes-status',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._footer.add_child(makeDot(COLORS.green));
        this._footer.add_child(this._status);
        this._button('edit-copy-symbolic', _("Copy"), () => {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._entry.get_text());
            this._flashStatus(_("Copied"));
        });
        this._button('folder-symbolic', _("Save to Files"), () => {
            if (this._isEditing)
                this._endEdit();
            else
                this._save();
            this._engine.call('Notes', 'SendToShelf');
            this._showShelf();
        });
        this.actor.add_child(this._footer);

        this._flashStatus(null);
        this.update(null);
    }

    _button(iconName, label, callback) {
        let box = new St.BoxLayout({ style_class: 'island-output-box' });
        box.add_child(new St.Icon({ icon_name: iconName, icon_size: 13 }));
        box.add_child(new St.Label({ text: label, y_align: Clutter.ActorAlign.CENTER }));
        let button = new St.Button({ style_class: 'island-output', child: box });
        button.connect('clicked', () => {
            if (this._entry.get_text().trim())
                callback();
        });
        this._footer.add_child(button);
    }

    // Shows a message in the bottom strip for 2 seconds; then goes back to the
    // reminder that the note saves itself.
    _flashStatus(message) {
        if (this._statusTimer) {
            GLib.source_remove(this._statusTimer);
            this._statusTimer = 0;
        }
        this._status.text = message || _("Saved automatically");
        if (message) {
            this._statusTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                this._statusTimer = 0;
                this._flashStatus(null);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _syncHint() {
        this._hint.visible = !this._isEditing && this._entry.get_text() === '';
    }

    update(state) {
        this._entry.reactive = !!state;
        this._footer.visible = !!state;
        if (!state || this._isEditing)
            return;
        this._saved = state.text;
        this._entry.set_text(state.text);
        this._syncHint();
    }

    _beginEdit() {
        if (this._isEditing || !this._editing.begin(() => this._endEdit()))
            return;
        this._isEditing = true;
        this._syncHint();
        this._entry.grab_key_focus();
    }

    _endEdit() {
        if (!this._isEditing)
            return;
        this._isEditing = false;
        this._editing.end();
        this._save();
        this._syncHint();
    }

    _queueSave() {
        if (this._saveTimer)
            GLib.source_remove(this._saveTimer);
        this._saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveTimer = 0;
            this._save();
            return GLib.SOURCE_REMOVE;
        });
    }

    _save() {
        if (this._saveTimer) {
            GLib.source_remove(this._saveTimer);
            this._saveTimer = 0;
        }
        let text = this._entry.get_text();
        if (text === this._saved)
            return;
        this._saved = text;
        this._engine.call('Notes', 'SetText', new GLib.Variant('(s)', [text]));
    }

    destroy() {
        for (let id of [this._saveTimer, this._statusTimer]) {
            if (id)
                GLib.source_remove(id);
        }
        this._saveTimer = this._statusTimer = 0;
    }
}

module.exports = { NotesTab };
