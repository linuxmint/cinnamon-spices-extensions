const { Clutter, Gio, GLib, Pango, St } = imports.gi;
const { _ } = require('./util');
const { coverStyle } = require('./tabMusic');

const ICON_SIZE = 40;

// The file shelf. The island only draws: clicks and drag and drop in the shelf
// area are handled by an invisible engine window sitting underneath (see
// engine/cinnamon_island_engine/files.py). That is why files have to be drawn
// left to right, each with the `cell` width reported by the engine.
class FilesTab {
    constructor(engine) {
        this._engine = engine;
        this._key = '';

        this.actor = new St.BoxLayout({ style_class: 'island-files', x_expand: true, y_expand: true });

        this._empty = new St.Label({
            style_class: 'island-empty',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // The shelf area; `shelf` is what the island reports to the engine.
        this.shelf = new St.Widget({
            style_class: 'island-shelf',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true,
        });
        this._cells = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this._hint = new St.Label({
            style_class: 'island-empty',
            text: _("Drag files here"),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.shelf.add_child(this._cells);
        this.shelf.add_child(this._hint);
        this.actor.add_child(this._empty);
        // The shelf and, below it, a reminder of how to use it.
        this._column = new St.BoxLayout({ vertical: true, style_class: 'island-files-column', x_expand: true, y_expand: true });
        this._column.add_child(this.shelf);
        this._help = new St.Label({
            style_class: 'island-notes-status',
            text: _("Click opens · drag it out to use it · × removes"),
        });
        this._column.add_child(this._help);
        this.actor.add_child(this._column);

        this._clear = new St.Button({
            style_class: 'island-button',
            child: new St.Icon({ icon_name: 'edit-clear-all-symbolic', icon_size: 18 }),
        });
        // On St.Button, the y_align property is that of the content; the
        // alignment of the button itself is the Clutter one, set through this
        // method.
        this._clear.set_y_align(Clutter.ActorAlign.CENTER);
        this._clear.connect('clicked', () => this._engine.call('Files', 'Clear'));
        this.actor.add_child(this._clear);

        this.update(null);
    }

    update(state) {
        this._empty.visible = !state;
        this._empty.text = _("The Cinnamon Island engine is not running");
        this._column.visible = !!state;
        this._help.visible = !!state && state.files.length > 0;
        this._clear.visible = !!state && state.files.length > 0;
        if (!state)
            return;

        this._hint.visible = state.files.length === 0;
        // The shelf only lights up when something is being dragged over it.
        if (state.drop)
            this.shelf.add_style_pseudo_class('hover');
        else
            this.shelf.remove_style_pseudo_class('hover');

        let key = JSON.stringify(state.files);
        if (key === this._key) {
            this._markClose(state);
            return;
        }
        this._key = key;
        this._cells.destroy_all_children();
        this._closes = [];
        for (let file of state.files) {
            // The cell takes the full height of the shelf: that way the x sits
            // at a fixed spot in it, where the engine window expects it.
            let slot = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                width: state.cell,
                y_expand: true,
            });
            let cell = new St.BoxLayout({
                style_class: 'island-file',
                vertical: true,
                x_expand: true,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            slot.add_child(cell);
            // An icon inside an St.Bin sits right in the centre of the circle
            // (the "×" character of a text ends up off centre).
            let close = new St.Bin({
                style_class: 'island-file-remove',
                child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 }),
                width: state.close[2],
                height: state.close[2],
            });
            // Fixed position inside the cell (BinLayout ignores margins).
            let pinned = new St.Widget({ layout_manager: new Clutter.FixedLayout(), x_expand: true, y_expand: true });
            close.set_position(state.close[0], state.close[1]);
            pinned.add_child(close);
            slot.add_child(pinned);
            this._closes.push(close);

            let picture;
            let thumbnail = file.image ? coverStyle(file.path) : null;
            if (thumbnail) {
                picture = new St.Widget({ style_class: 'island-file-image', style: thumbnail });
            } else {
                picture = new St.Icon({ icon_size: ICON_SIZE });
                try {
                    picture.gicon = Gio.Icon.new_for_string(file.icon);
                } catch (e) {
                    picture.icon_name = 'text-x-generic';
                }
            }
            picture.x_align = Clutter.ActorAlign.CENTER;
            cell.add_child(picture);

            let name = new St.Label({ style_class: 'island-file-name', text: file.name });
            name.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
            cell.add_child(name);
            this._cells.add_child(slot);
        }
        this._markClose(state);
    }

    // Lights up the x that has the mouse over it (the engine is the one that
    // knows).
    _markClose(state) {
        (this._closes || []).forEach((close, index) => {
            if (index === state.over_close)
                close.add_style_pseudo_class('hover');
            else
                close.remove_style_pseudo_class('hover');
        });
    }
}

module.exports = { FilesTab };
