/*
 * tilo - the saved arrangements overlay.
 *
 * One card per saved group, showing the shape it will restore and which apps it
 * expects, plus a card to save whatever is on screen right now. Click to
 * restore, right click to forget.
 *
 * Like the editor and unlike the picker, nothing is dragging while this is up,
 * so it uses real Clutter events.
 */

const St = require('gi.St');
const Clutter = require('gi.Clutter');
const Main = require('ui.main');
const Tree = require('./lib/layoutTree');
const SavedGroups = require('./lib/savedGroups');
const { _ } = require('./lib/i18n');

const CARD_W = 168;
const CARD_H = 142;
const CARD_GAP = 12;
const PANEL_PAD = 14;
const PREVIEW_H = 86;
const MINI_GAP = 3;

function helpText() {
    return [_('Click to restore'), _('Right click to forget'), _('Esc to close')]
           .join('   .   ');
}

class GroupSwitcher {
    /* handlers: { getGroups(), canSave(), onRestore(group), onDelete(group), onSave() } */
    constructor(handlers) {
        this._handlers = handlers;
        this._container = null;
        this._keyId = 0;
    }

    get open() { return this._container !== null; }

    show(workArea) {
        if (this.open) return;

        const groups = this._handlers.getGroups();
        const canSave = this._handlers.canSave();
        if (groups.length === 0 && !canSave) return;

        this._container = new St.Widget({ style_class: 'tilo-switcher', reactive: true });
        this._container.set_position(workArea.x, workArea.y);
        this._container.set_size(workArea.width, workArea.height);
        Main.layoutManager.addChrome(this._container, { affectsInputRegion: true });

        const count = groups.length + (canSave ? 1 : 0);
        const panelW = count * CARD_W + (count - 1) * CARD_GAP + 2 * PANEL_PAD;
        const panelH = CARD_H + 2 * PANEL_PAD;
        const panelX = Math.round((workArea.width - panelW) / 2);
        const panelY = Math.round((workArea.height - panelH) / 2);

        const panel = new St.Widget({ style_class: 'tilo-switcher-panel' });
        panel.set_position(panelX, panelY);
        panel.set_size(panelW, panelH);
        this._container.add_child(panel);

        groups.forEach((group, i) => {
            panel.add_child(this._card(group, PANEL_PAD + i * (CARD_W + CARD_GAP)));
        });
        if (canSave) {
            panel.add_child(this._saveCard(PANEL_PAD + groups.length * (CARD_W + CARD_GAP)));
        }

        const help = new St.Label({ style_class: 'tilo-editor-help', text: helpText() });
        this._container.add_child(help);
        const [, helpW] = help.get_preferred_width(-1);
        const [, helpH] = help.get_preferred_height(-1);
        help.set_position(Math.round((workArea.width - helpW) / 2),
                          panelY + panelH + 20);

        Main.pushModal(this._container);
        this._container.grab_key_focus();
        this._keyId = this._container.connect('key-press-event', (a, e) => this._onKey(e));
    }

    close() {
        if (!this.open) return;
        if (this._keyId) { this._container.disconnect(this._keyId); this._keyId = 0; }
        Main.popModal(this._container);
        this._container.destroy();
        this._container = null;
    }

    _card(group, x) {
        const card = new St.Widget({ style_class: 'tilo-card', reactive: true });
        card.set_position(x, PANEL_PAD);
        card.set_size(CARD_W, CARD_H);

        const preview = new St.Widget({ style_class: 'tilo-card-preview' });
        preview.set_position(10, 10);
        preview.set_size(CARD_W - 20, PREVIEW_H);
        card.add_child(preview);

        Tree.toFractions(group.tree).forEach(([fx, fy, fw, fh]) => {
            const mini = new St.Widget({ style_class: 'tilo-mini' });
            mini.set_position(Math.round(fx * (CARD_W - 20)) + MINI_GAP / 2,
                              Math.round(fy * PREVIEW_H) + MINI_GAP / 2);
            mini.set_size(Math.max(1, Math.round(fw * (CARD_W - 20)) - MINI_GAP),
                          Math.max(1, Math.round(fh * PREVIEW_H) - MINI_GAP));
            preview.add_child(mini);
        });

        const label = new St.Label({ style_class: 'tilo-card-name',
                                     text: SavedGroups.describe(group) || group.name });
        label.set_position(10, PREVIEW_H + 16);
        card.add_child(label);

        card.connect('enter-event', () => {
            card.add_style_class_name('tilo-card-hover');
            return Clutter.EVENT_PROPAGATE;
        });
        card.connect('leave-event', () => {
            card.remove_style_class_name('tilo-card-hover');
            return Clutter.EVENT_PROPAGATE;
        });
        card.connect('button-press-event', (a, e) => {
            const button = e.get_button();
            this.close();
            if (button === 1) this._handlers.onRestore(group);
            else if (button === 3) this._handlers.onDelete(group);
            return Clutter.EVENT_STOP;
        });

        return card;
    }

    _saveCard(x) {
        const card = new St.Widget({ style_class: 'tilo-card tilo-card-save', reactive: true });
        card.set_position(x, PANEL_PAD);
        card.set_size(CARD_W, CARD_H);

        const label = new St.Label({ style_class: 'tilo-card-name',
                                     text: _('Save what is on screen') });
        label.set_position(10, PREVIEW_H + 16);
        card.add_child(label);

        card.connect('enter-event', () => {
            card.add_style_class_name('tilo-card-hover');
            return Clutter.EVENT_PROPAGATE;
        });
        card.connect('leave-event', () => {
            card.remove_style_class_name('tilo-card-hover');
            return Clutter.EVENT_PROPAGATE;
        });
        card.connect('button-press-event', () => {
            this.close();
            this._handlers.onSave();
            return Clutter.EVENT_STOP;
        });

        return card;
    }

    _onKey(event) {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}

module.exports = { GroupSwitcher };
