/*
 * tilo - the zone editor.
 *
 * Draws the layout full screen and lets you cut it up: click a zone to split it
 * side by side, Ctrl+click to stack, right click to remove it. Every edit goes
 * through layoutTree.js, so the result cannot overlap or leave a hole.
 *
 * Unlike the picker, the editor runs with no window manager grab in the way, so
 * it uses real Clutter events rather than polling the pointer.
 *
 * The help line at the bottom is not decoration. Every zone editor in this
 * category hides itself behind an undocumented modifier, and the most common
 * complaint about all of them is that nobody can tell how to drive them.
 */

const St = require('gi.St');
const Clutter = require('gi.Clutter');
const Main = require('ui.main');
const Tree = require('./lib/layoutTree');
const Logger = require('./lib/logger');
const { _ } = require('./lib/i18n');

function helpText() {
    return [_('Click to split side by side'), _('Ctrl+click to stack'),
            _('Right click to remove'), _('Enter to save'), _('Esc to cancel')]
           .join('   .   ');
}

class ZoneEditor {
    /* handlers: { onSave(tree), onCancel() } */
    constructor(handlers) {
        this._handlers = handlers;
        this._container = null;
        this._zones = [];
        this._tree = null;
        this._workArea = null;
        this._keyId = 0;
    }

    get open() { return this._container !== null; }

    show(workArea, tree) {
        if (this.open) return;

        this._workArea = workArea;
        this._tree = Tree.clone(tree);

        this._container = new St.Widget({ style_class: 'tilo-editor', reactive: true });
        this._container.set_position(workArea.x, workArea.y);
        this._container.set_size(workArea.width, workArea.height);
        Main.layoutManager.addChrome(this._container, { affectsInputRegion: true });

        this._help = new St.Label({ style_class: 'tilo-editor-help', text: helpText() });
        this._container.add_child(this._help);

        this._rebuild();

        Main.pushModal(this._container);
        this._container.grab_key_focus();
        this._keyId = this._container.connect('key-press-event',
                                              (a, e) => this._onKey(e));
    }

    close() {
        if (!this.open) return;

        if (this._keyId) { this._container.disconnect(this._keyId); this._keyId = 0; }
        Main.popModal(this._container);
        this._container.destroy();
        this._container = null;
        this._zones = [];
        this._tree = null;
    }

    /* ------------------------------------------------------------- drawing */

    _rebuild() {
        this._zones.forEach(z => z.destroy());
        this._zones = [];

        const { width, height } = this._workArea;
        Tree.toZones(this._tree).forEach(({ rect, path }) => {
            const [fx, fy, fw, fh] = rect;
            const widget = new St.Widget({ style_class: 'tilo-editor-zone', reactive: true });
            widget.set_position(Math.round(fx * width) + 3, Math.round(fy * height) + 3);
            widget.set_size(Math.max(1, Math.round(fw * width) - 6),
                            Math.max(1, Math.round(fh * height) - 6));

            widget.connect('enter-event', () => {
                widget.add_style_class_name('tilo-editor-zone-hover');
                return Clutter.EVENT_PROPAGATE;
            });
            widget.connect('leave-event', () => {
                widget.remove_style_class_name('tilo-editor-zone-hover');
                return Clutter.EVENT_PROPAGATE;
            });
            widget.connect('button-press-event', (a, e) => this._onZoneClick(path, e));

            this._container.add_child(widget);
            this._zones.push(widget);
        });

        /* Keep the help line above the zones it describes, centred near the
           bottom edge. A plain St.Widget does no layout of its own, which is
           what we want for the zones, so the label is placed by hand too. */
        this._container.set_child_above_sibling(this._help, null);
        const [, helpWidth] = this._help.get_preferred_width(-1);
        const [, helpHeight] = this._help.get_preferred_height(-1);
        this._help.set_position(Math.round((width - helpWidth) / 2),
                                Math.round(height - helpHeight - 28));
    }

    /* ------------------------------------------------------------- editing */

    _onZoneClick(path, event) {
        const button = event.get_button();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (button === 1) {
            this._tree = Tree.splitAt(this._tree, path, ctrl ? 'col' : 'row');
        } else if (button === 3) {
            if (Tree.countZones(this._tree) <= 1) return Clutter.EVENT_STOP;
            this._tree = Tree.removeAt(this._tree, path);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }

        this._rebuild();
        return Clutter.EVENT_STOP;
    }

    _onKey(event) {
        const symbol = event.get_key_symbol();

        if (symbol === Clutter.KEY_Escape) {
            const cancel = this._handlers.onCancel;
            this.close();
            if (cancel) cancel();
            return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            const tree = Tree.clone(this._tree);
            const save = this._handlers.onSave;
            this.close();
            if (save) save(tree);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }
}

module.exports = { ZoneEditor };
