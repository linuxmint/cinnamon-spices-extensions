// Full-screen graphical layout editor.
//   Left click            split tile left | right
//   Ctrl + left click     split tile top / bottom
//   Right click           delete tile (neighbours absorb the space)
//   Drag a divider        resize every tile sharing that edge
//   Ctrl+Z / Enter / Esc  undo / save / cancel

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const _ = U._;
const L = Me.imports.lib.layouts;

const EDITOR_GAP = 8;

var LayoutEditor = class LayoutEditor {
    constructor(controller, layout, monitorIndex, opts = {}) {
        this._c = controller;
        this._layout = L.cloneLayout(layout);
        this._originalId = layout.id;
        this._isNew = !!opts.isNew;
        this._mon = monitorIndex;
        this._history = [];
        this._dragSlider = null;
        this._ctrl = false;
        this._sliders = [];
        this._tileActors = [];

        const m = U.monitorGeometry(monitorIndex);
        this._wa = U.workArea(monitorIndex);
        this.actor = new St.Widget({
            style_class: 'tiling-editor', reactive: true, can_focus: true,
            x: m.x, y: m.y, width: m.width, height: m.height,
        });
        this._origin = { x: m.x, y: m.y };
        this._content = new St.Widget({ reactive: false });
        this.actor.add_child(this._content);
        this._hoverLine = new St.Widget({ style_class: 'tiling-editor-hover-line', visible: false, reactive: false });
        this.actor.add_child(this._hoverLine);
        // Must be on the stage before the toolbar is measured.
        Main.uiGroup.add_child(this.actor);
        Main.uiGroup.set_child_above_sibling(this.actor, null);
        this._buildToolbar();
        this._modal = Main.pushModal(this.actor);
        this.actor.grab_key_focus();

        this.actor.connect('captured-event', (a, e) => this._onEvent(e));
        this.actor.connect('key-press-event', (a, e) => this._onKey(e));
        this._rebuild();
    }

    _buildToolbar() {
        this._toolbar = new St.BoxLayout({ style_class: 'tiling-editor-toolbar', vertical: true, reactive: true });
        const title = new St.Label({ style_class: 'tiling-editor-title', text: this._isNew ? _('New layout') : _('Editing “%s”').format(this._layout.id) });
        const help = new St.Label({
            style_class: 'tiling-editor-help',
            text: _('Click: split left/right  ·  Ctrl+click: split top/bottom  ·  Right click: delete  ·  Drag a divider: resize  ·  Ctrl+Z: undo'),
        });
        const row = new St.BoxLayout({ style_class: 'tiling-editor-buttons', vertical: false });
        const mk = (label, cls, cb) => {
            const b = new St.Button({ style_class: `tiling-editor-button ${cls}`, label, reactive: true, can_focus: true, track_hover: true });
            b.connect('clicked', cb);
            row.add_child(b);
            return b;
        };
        mk(_('Save'), 'suggested', () => this._save());
        mk(_('Cancel'), '', () => this.close());
        mk(_('Reset'), '', () => {
            this._pushHistory();
            this._layout.tiles = [{ x: 0, y: 0, width: 1, height: 1, groups: [] }];
            this._rebuild();
        });
        if (!this._isNew && this._c.layouts.length > 1) {
            mk(_('Delete layout'), 'destructive', () => {
                this._c.deleteLayout(this._originalId);
                this.close();
            });
        }
        this._toolbar.add_child(title);
        this._toolbar.add_child(help);
        this._toolbar.add_child(row);
        this.actor.add_child(this._toolbar);
        this._placeToolbar(false);
    }

    _placeToolbar(top) {
        const [, w] = this._toolbar.get_preferred_width(-1);
        const [, h] = this._toolbar.get_preferred_height(w);
        const wa = this._wa;
        const x = Math.round(wa.x - this._origin.x + (wa.width - w) / 2);
        const pad = Math.round(24 * U.scaleFactor());
        const y = top ? wa.y - this._origin.y + pad : wa.y - this._origin.y + wa.height - h - pad;
        this._toolbar.set_position(x, y);
        this._toolbarTop = top;
    }

    _pushHistory() {
        this._history.push(JSON.stringify(this._layout.tiles));
        if (this._history.length > 50)
            this._history.shift();
    }

    _rebuild() {
        this._content.destroy_all_children();
        this._tileActors = [];
        const wa = this._wa;
        const local = { x: wa.x - this._origin.x, y: wa.y - this._origin.y, width: wa.width, height: wa.height };
        const gap = Math.round(EDITOR_GAP * U.scaleFactor());
        this._layout.tiles.forEach(t => {
            const r = L.tileToRect(t, local, gap, gap);
            const a = new St.Widget({ style_class: 'tiling-editor-tile', layout_manager: new Clutter.BinLayout() });
            a.set_position(r.x, r.y);
            a.set_size(r.width, r.height);
            const lbl = new St.Label({
                style_class: 'tiling-editor-tile-label',
                text: `${Math.round(t.width * 100)}% × ${Math.round(t.height * 100)}%`,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            });
            a.add_child(lbl);
            this._content.add_child(a);
            this._tileActors.push(a);
        });
        this._sliders = L.computeSliders(this._layout);
        const thick = Math.round(14 * U.scaleFactor());
        this._sliderRects = [];
        for (const s of this._sliders) {
            const a = new St.Widget({ style_class: `tiling-editor-slider ${s.vertical ? 'vertical' : 'horizontal'}` });
            let r;
            if (s.vertical) {
                r = { x: local.x + s.pos * wa.width - thick / 2, y: local.y + s.start * wa.height + gap, width: thick, height: (s.end - s.start) * wa.height - gap * 2 };
            } else {
                r = { x: local.x + s.start * wa.width + gap, y: local.y + s.pos * wa.height - thick / 2, width: (s.end - s.start) * wa.width - gap * 2, height: thick };
            }
            a.set_position(Math.round(r.x), Math.round(r.y));
            a.set_size(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
            this._content.add_child(a);
            this._sliderRects.push({ slider: s, rect: { x: r.x + this._origin.x, y: r.y + this._origin.y, width: r.width, height: r.height }, actor: a });
        }
    }

    _norm(x, y) {
        return { nx: (x - this._wa.x) / this._wa.width, ny: (y - this._wa.y) / this._wa.height };
    }

    _overToolbar(x, y) {
        const [ax, ay] = this._toolbar.get_transformed_position();
        const [w, h] = this._toolbar.get_transformed_size();
        return x >= ax && x < ax + w && y >= ay && y < ay + h;
    }

    _sliderAt(x, y) {
        for (const s of this._sliderRects) {
            if (U.contains(s.rect, x, y))
                return s;
        }
        return null;
    }

    _updateHover(x, y, ctrl) {
        const { nx, ny } = this._norm(x, y);
        const idx = L.tileIndexAt(this._layout, nx, ny);
        if (idx < 0 || this._sliderAt(x, y) || this._overToolbar(x, y)) {
            this._hoverLine.hide();
            return;
        }
        const t = this._layout.tiles[idx];
        const wa = this._wa;
        const lx = wa.x - this._origin.x, ly = wa.y - this._origin.y;
        const th = Math.max(2, Math.round(2 * U.scaleFactor()));
        if (!ctrl) {
            this._hoverLine.set_position(Math.round(x - this._origin.x - th / 2), Math.round(ly + t.y * wa.height));
            this._hoverLine.set_size(th, Math.round(t.height * wa.height));
        } else {
            this._hoverLine.set_position(Math.round(lx + t.x * wa.width), Math.round(y - this._origin.y - th / 2));
            this._hoverLine.set_size(Math.round(t.width * wa.width), th);
        }
        this._hoverLine.show();
        // Keep the toolbar out of the way of the pointer.
        const nearBottom = y > wa.y + wa.height * 0.7;
        if (nearBottom !== this._toolbarTop)
            this._placeToolbar(nearBottom);
    }

    _onEvent(event) {
        const type = event.type();
        const [x, y] = event.get_coords();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (type === Clutter.EventType.MOTION) {
            if (this._dragSlider) {
                const { nx, ny } = this._norm(x, y);
                L.moveSlider(this._layout, this._dragSlider, this._dragSlider.vertical ? nx : ny);
                this._rebuild();
                return Clutter.EVENT_STOP;
            }
            this._updateHover(x, y, ctrl);
            return Clutter.EVENT_PROPAGATE;
        }

        if (type === Clutter.EventType.BUTTON_PRESS) {
            if (this._overToolbar(x, y))
                return Clutter.EVENT_PROPAGATE;
            const button = event.get_button();
            const s = this._sliderAt(x, y);
            if (s && button === 1) {
                this._pushHistory();
                this._dragSlider = s.slider;
                s.actor.add_style_pseudo_class('active');
                this._hoverLine.hide();
                return Clutter.EVENT_STOP;
            }
            const { nx, ny } = this._norm(x, y);
            const idx = L.tileIndexAt(this._layout, nx, ny);
            if (idx < 0)
                return Clutter.EVENT_STOP;
            if (button === 1) {
                this._pushHistory();
                if (!L.splitTile(this._layout, idx, ctrl ? ny : nx, !ctrl))
                    this._history.pop();
                this._rebuild();
            } else if (button === 3) {
                this._pushHistory();
                if (!L.deleteTile(this._layout, idx)) {
                    this._history.pop();
                    Main.notify(_('Cinnamon Tiling'), _('This tile cannot be removed: no neighbouring tiles cover its whole side.'));
                }
                this._rebuild();
            }
            this._updateHover(x, y, ctrl);
            return Clutter.EVENT_STOP;
        }

        if (type === Clutter.EventType.BUTTON_RELEASE) {
            if (this._dragSlider) {
                this._dragSlider = null;
                this._rebuild();
                return Clutter.EVENT_STOP;
            }
            return this._overToolbar(x, y) ? Clutter.EVENT_PROPAGATE : Clutter.EVENT_STOP;
        }

        if (type === Clutter.EventType.KEY_PRESS || type === Clutter.EventType.KEY_RELEASE) {
            const sym = event.get_key_symbol();
            if (sym === Clutter.KEY_Control_L || sym === Clutter.KEY_Control_R) {
                const [px, py] = global.get_pointer();
                this._updateHover(px, py, type === Clutter.EventType.KEY_PRESS);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onKey(event) {
        const sym = event.get_key_symbol();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
        if (sym === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
            this._save();
            return Clutter.EVENT_STOP;
        }
        if (ctrl && (sym === Clutter.KEY_z || sym === Clutter.KEY_Z)) {
            const prev = this._history.pop();
            if (prev) {
                this._layout.tiles = JSON.parse(prev);
                this._rebuild();
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _save() {
        this._c.saveLayout(this._layout, this._isNew ? null : this._originalId, this._mon);
        this.close();
    }

    close() {
        if (!this.actor)
            return;
        try {
            Main.popModal(this.actor);
        } catch (e) { /* not modal */ }
        this.actor.destroy();
        this.actor = null;
        this._c.onEditorClosed(this);
    }
};
