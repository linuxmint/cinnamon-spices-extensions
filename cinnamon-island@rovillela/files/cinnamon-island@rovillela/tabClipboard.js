const { Clutter, GLib, Pango, St } = imports.gi;
const { _, scrollStep, COLORS, css, makeDot } = require('./util');

const ROWS = 3;
const NOTICE_MS = 1500;

function isLink(text) {
    return /^(https?:\/\/|www\.)\S+$/i.test(text.trim());
}

// A history row: a blue dot on the item that is on the clipboard right now,
// the kind (Link or Text), the start of the content and, on hover, "Copy" at
// the end.
class Row {
    constructor(onClicked) {
        let box = new St.BoxLayout({ style_class: 'island-clip-row-box' });
        this._dot = makeDot(COLORS.blue);
        box.add_child(this._dot);
        this._kind = new St.Label({ style_class: 'island-clip-tag', y_align: Clutter.ActorAlign.CENTER });
        box.add_child(this._kind);
        this._text = new St.Label({ style_class: 'island-clip-text', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(this._text);
        let copy = new St.BoxLayout({ style_class: 'island-clip-copy', opacity: 0, y_align: Clutter.ActorAlign.CENTER });
        copy.add_child(new St.Icon({ icon_name: 'edit-copy-symbolic', icon_size: 11 }));
        copy.add_child(new St.Label({ text: _("Copy"), y_align: Clutter.ActorAlign.CENTER }));
        box.add_child(copy);

        this.actor = new St.Button({
            style_class: 'island-clip-row',
            child: box,
            x_expand: true,
            x_fill: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
        });
        this.actor.connect('notify::hover', () => { copy.opacity = this.actor.hover ? 255 : 0; });
        this.actor.connect('clicked', (button, mouseButton) => onClicked(mouseButton));
    }

    set(item, isCurrent) {
        this.actor.visible = !!item;
        if (!item)
            return;
        this._kind.text = isLink(item.text) ? _("Link") : _("Text");
        this._dot.opacity = isCurrent ? 255 : 0;
        this._text.text = item.text;
    }
}

// Clipboard history, one item per row, most recent first. Clicking a row
// copies it again; right-click removes it from the history.
class ClipboardTab {
    constructor(engine) {
        this._engine = engine;
        this._state = null;
        this._offset = 0;
        this._noticeTimer = 0;

        this.actor = new St.BoxLayout({ style_class: 'island-clipboard', vertical: true, x_expand: true, y_expand: true });

        this._empty = new St.Label({
            style_class: 'island-empty',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._empty);

        this._list = new St.BoxLayout({
            style_class: 'island-clip-list',
            vertical: true,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
        });
        // The wheel scrolls the list while there is somewhere to scroll; at
        // the start or the end (or if everything fits), it moves on and
        // switches tabs, as in the rest of the island.
        this._list.connect('scroll-event', (actor, event) =>
            this._scroll(scrollStep(event)) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE);
        this.actor.add_child(this._list);
        this._rows = [];
        for (let i = 0; i < ROWS; i++) {
            let row = new Row(mouseButton => this._onClicked(i, mouseButton));
            this._list.add_child(row.actor);
            this._rows.push(row);
        }

        this._footer = new St.BoxLayout({ style_class: 'island-clip-footer' });
        this._help = new St.Label({ style_class: 'island-notes-status', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._position = new St.Label({ style_class: 'island-notes-status', y_align: Clutter.ActorAlign.CENTER });
        this._clear = new St.Button({ style_class: 'island-clip-clear', label: _("Clear all") });
        this._clear.connect('clicked', () => this._engine.call('Clipboard', 'Clear'));
        this._footer.add_child(this._help);
        this._footer.add_child(this._position);
        this._footer.add_child(this._clear);
        this.actor.add_child(this._footer);

        this._setNotice(null);
        this.update(null);
    }

    _items() {
        return this._state ? this._state.items : [];
    }

    _setNotice(message) {
        if (this._noticeTimer) {
            GLib.source_remove(this._noticeTimer);
            this._noticeTimer = 0;
        }
        this._help.text = message || _("Click a line to copy it again · right-click removes it");
        if (message) {
            this._noticeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, NOTICE_MS, () => {
                this._noticeTimer = 0;
                this._setNotice(null);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // Scrolls the list by one item; returns whether it actually moved.
    _scroll(step) {
        let max = Math.max(0, this._items().length - ROWS);
        let offset = Math.max(0, Math.min(max, this._offset + step));
        if (offset === this._offset)
            return false;
        this._offset = offset;
        this._render();
        return true;
    }

    _onClicked(index, mouseButton) {
        let item = this._items()[this._offset + index];
        if (!item)
            return;
        if (mouseButton === 3) {
            this._engine.call('Clipboard', 'Remove', new GLib.Variant('(u)', [item.id]));
        } else {
            this._engine.call('Clipboard', 'Copy', new GLib.Variant('(u)', [item.id]));
            // The copied item becomes the most recent; the list goes back to
            // the start.
            this._offset = 0;
            this._setNotice(_("Copied"));
        }
    }

    update(state) {
        this._state = state;
        let items = this._items();
        this._empty.visible = items.length === 0;
        this._empty.text = !state ? _("The Cinnamon Island engine is not running") : _("Nothing copied yet");
        this._list.visible = items.length > 0;
        this._footer.visible = items.length > 0;
        this._offset = Math.max(0, Math.min(this._offset, items.length - ROWS));
        this._render();
    }

    _render() {
        let items = this._items();
        this._rows.forEach((row, i) => {
            let index = this._offset + i;
            row.set(items[index], index === 0);
        });
        let last = Math.min(items.length, this._offset + ROWS);
        this._position.text = items.length > ROWS
            ? (this._offset + 1) + '–' + last + ' / ' + items.length : '';
    }

    destroy() {
        if (this._noticeTimer)
            GLib.source_remove(this._noticeTimer);
        this._noticeTimer = 0;
    }
}

module.exports = { ClipboardTab };
