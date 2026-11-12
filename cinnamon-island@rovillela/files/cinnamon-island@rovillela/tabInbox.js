const { Cinnamon, Clutter, Gio, GLib, Pango, St } = imports.gi;
const Main = imports.ui.main;
const { _, scrollStep } = require('./util');

const ROWS = 3;
const ICON_SIZE = 18;
const MESSAGE_MS = 2500;

// The title as the engine stores it: no markup, single spaces.
function plain(text) {
    return String(text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function formatTime(seconds) {
    let date = GLib.DateTime.new_from_unix_local(seconds);
    return date ? date.format('%H:%M') : '';
}

const HELP = () => _("Click opens the app · right-click dismisses");

// A notification: the icon of the program, the title in bold, then the text
// (whatever fits on one line) and the time at the end.
class Row {
    constructor(onClicked) {
        let box = new St.BoxLayout({ style_class: 'island-clip-row-box' });
        this._icon = new St.Icon({ icon_size: ICON_SIZE, y_align: Clutter.ActorAlign.CENTER });
        box.add_child(this._icon);
        this._title = new St.Label({ style_class: 'island-notice-title', y_align: Clutter.ActorAlign.CENTER });
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(this._title);
        this._body = new St.Label({ style_class: 'island-notice-text', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._body.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(this._body);
        this._time = new St.Label({ style_class: 'island-notice-time', y_align: Clutter.ActorAlign.CENTER });
        box.add_child(this._time);

        this.actor = new St.Button({
            style_class: 'island-clip-row',
            child: box,
            x_expand: true,
            x_fill: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
        });
        this.actor.connect('clicked', (button, mouseButton) => onClicked(mouseButton));
        this._iconKey = null;
    }

    set(item) {
        this.actor.visible = !!item;
        if (!item)
            return;
        if (item.icon !== this._iconKey) {
            this._iconKey = item.icon;
            // The icon comes as a theme name or as the path of an image.
            try {
                this._icon.gicon = item.icon.startsWith('/')
                    ? new Gio.FileIcon({ file: Gio.File.new_for_path(item.icon) })
                    : Gio.Icon.new_for_string(item.icon);
            } catch (e) {
                this._icon.icon_name = 'dialog-information-symbolic';
            }
        }
        this._title.text = item.title;
        // With no text of its own, its spot takes the name of the program.
        this._body.text = item.body || item.app;
        this._time.text = formatTime(item.time);
    }
}

// Inbox of the system notifications, newest first. Clicking opens the program
// that sent it; right-click only dismisses.
class InboxTab {
    constructor(engine) {
        this._engine = engine;
        this._state = null;
        this._offset = 0;
        this._apps = {};      // notification id -> the Cinnamon app that sent it
        this._flashTimer = 0;

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
        // the start, at the end or if everything fits, it moves on and
        // switches tabs.
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
        this._help = new St.Label({
            style_class: 'island-notes-status',
            text: HELP(),
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._position = new St.Label({ style_class: 'island-notes-status', y_align: Clutter.ActorAlign.CENTER });
        let clear = new St.Button({ style_class: 'island-clip-clear', label: _("Clear all") });
        clear.connect('clicked', () => this._engine.call('Inbox', 'Clear'));
        this._footer.add_child(this._help);
        this._footer.add_child(this._position);
        this._footer.add_child(clear);
        this.actor.add_child(this._footer);

        this.update(null);
    }

    _items() {
        return this._state ? this._state.items : [];
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
        // A row that could not be opened stays in the list, with a message.
        if (mouseButton !== 3 && !this._open(item)) {
            this._flash(_("Couldn't find the program to open"));
            return;
        }
        delete this._apps[item.id];
        this._engine.call('Inbox', 'Remove', new GLib.Variant('(u)', [item.id]));
    }

    // Cinnamon's own copy of a notification, while it still holds one.
    _live(title) {
        let live = Main.notificationDaemon ? Main.notificationDaemon._notifications : {};
        for (let id in live) {
            let data = live[id];
            if (data && data.notification && plain(data.summary) === title)
                return data;
        }
        return null;
    }

    // The island calls this when a notification arrives. Cinnamon knows which
    // running program sent it (by its process), which is far more reliable
    // than the name the program reports; the tab keeps that for later, when
    // Cinnamon may have already thrown its copy away.
    remember(id, title) {
        let data = id ? this._live(title) : null;
        let source = data ? data.notification.source : null;
        if (source && source.app)
            this._apps[id] = source.app;
    }

    // Opens what the notification is about. Returns false when there is
    // nothing to open.
    _open(item) {
        // 1. Cinnamon still has the notification: clicking its copy does
        //    exactly what clicking the banner would (the program receives the
        //    click and its window comes forward).
        //    Only when that click leads somewhere: the program declared a
        //    default action, or Cinnamon knows which program it is.
        let data = this._live(item.title);
        if (data) {
            let actions = data.actions || [];
            let hasDefault = actions.some((action, i) => i % 2 === 0 && action === 'default');
            let source = data.notification.source;
            if (hasDefault || (source && source.app)) {
                data.notification._onClicked();
                return true;
            }
        }
        // 2. Otherwise bring the program forward, or start it.
        let app = this._apps[item.id];
        if (!app && item.desktop)
            app = Cinnamon.AppSystem.get_default().lookup_app(item.desktop);
        if (!app)
            return false;
        let windows = app.get_windows();
        if (windows.length > 0)
            Main.activateWindow(windows[0]);
        else
            app.activate();
        return true;
    }

    // Shows a message in the bottom strip for a moment.
    _flash(message) {
        if (this._flashTimer)
            GLib.source_remove(this._flashTimer);
        this._help.text = message;
        this._flashTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MESSAGE_MS, () => {
            this._flashTimer = 0;
            this._help.text = HELP();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._flashTimer)
            GLib.source_remove(this._flashTimer);
        this._flashTimer = 0;
    }

    update(state) {
        this._state = state;
        let items = this._items();
        this._empty.visible = items.length === 0;
        this._empty.text = !state ? _("The Cinnamon Island engine is not running")
            : !state.available ? _("Could not listen to system notifications")
            : !state.enabled ? _("Notifications are turned off in the settings")
            : _("No notifications");
        this._list.visible = items.length > 0;
        this._footer.visible = items.length > 0;
        this._offset = Math.max(0, Math.min(this._offset, items.length - ROWS));
        this._render();
    }

    _render() {
        let items = this._items();
        this._rows.forEach((row, i) => row.set(items[this._offset + i]));
        let last = Math.min(items.length, this._offset + ROWS);
        this._position.text = items.length > ROWS
            ? (this._offset + 1) + '–' + last + ' / ' + items.length : '';
    }
}

module.exports = { InboxTab };
