// Reusable actors: layout thumbnails, tile previews and the layout overlay
// shown while dragging.

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const L = Me.imports.lib.layouts;

// Small picture of a layout. With `buttons: true` every tile is an St.Button and
// `onTileClicked(tile, index)` is called when one is pressed.
var LayoutThumbnail = class LayoutThumbnail {
    constructor(layout, width, height, opts = {}) {
        const scale = U.scaleFactor();
        this.layout = layout;
        this.width = Math.round(width * scale);
        this.height = Math.round(height * scale);
        this.gap = Math.max(1, Math.round((opts.gap !== undefined ? opts.gap : 2) * scale));
        this.actor = new St.Widget({
            style_class: opts.styleClass || 'tiling-thumb',
            width: this.width,
            height: this.height,
            reactive: !!opts.buttons,
        });
        this.tiles = [];
        layout.tiles.forEach((t, i) => {
            const r = L.tileToRect(t, { x: 0, y: 0, width: this.width, height: this.height }, this.gap, this.gap);
            let a;
            if (opts.buttons) {
                a = new St.Button({
                    style_class: opts.tileStyleClass || 'tiling-thumb-tile tiling-thumb-button',
                    reactive: true,
                    track_hover: true,
                    can_focus: true,
                });
                a.connect('clicked', () => {
                    if (opts.onTileClicked)
                        opts.onTileClicked(t, i);
                });
            } else {
                a = new St.Widget({ style_class: opts.tileStyleClass || 'tiling-thumb-tile' });
            }
            a.set_position(r.x, r.y);
            a.set_size(r.width, r.height);
            this.actor.add_child(a);
            this.tiles.push({ actor: a, tile: t, index: i });
        });
    }

    // Index of the tile under a stage point, or -1.
    tileAtStage(x, y) {
        for (const t of this.tiles) {
            const [ax, ay] = t.actor.get_transformed_position();
            const [w, h] = t.actor.get_transformed_size();
            if (x >= ax && x < ax + w && y >= ay && y < ay + h)
                return t.index;
        }
        return -1;
    }

    setHovered(index) {
        this.tiles.forEach(t => {
            if (t.index === index)
                t.actor.add_style_pseudo_class('hover');
            else
                t.actor.remove_style_pseudo_class('hover');
        });
    }

    destroy() {
        this.actor.destroy();
    }
};

// Highlight rectangle that animates to the selected tile.
var SelectionPreview = class SelectionPreview {
    constructor(controller) {
        this._controller = controller;
        this.actor = new St.Widget({ style_class: 'tiling-selection-preview', visible: false, reactive: false });
        global.window_group.add_child(this.actor);
        this._rect = null;
    }

    _keepBelow(win) {
        const wa = win ? U.windowActor(win) : null;
        try {
            if (wa && wa.get_parent() === global.window_group)
                global.window_group.set_child_below_sibling(this.actor, wa);
            else
                global.window_group.set_child_above_sibling(this.actor, null);
        } catch (e) { /* ignore */ }
    }

    show(r, win) {
        const duration = this._controller.settings.get('tile-preview-animation-time');
        this._keepBelow(win);
        if (!this.actor.visible || !this._rect) {
            const p = U.pointer();
            this.actor.set_position(p.x, p.y);
            this.actor.set_size(1, 1);
            this.actor.opacity = 0;
            this.actor.show();
        }
        if (this._rect && U.rectsClose(this._rect, r, 0, 0))
            return;
        this._rect = r;
        U.ease(this.actor, { x: r.x, y: r.y, width: r.width, height: r.height, opacity: 255, duration });
    }

    hide() {
        if (!this.actor.visible)
            return;
        this._rect = null;
        const duration = this._controller.settings.get('tile-preview-animation-time');
        U.ease(this.actor, {
            opacity: 0,
            duration,
            onComplete: () => {
                if (!this._rect)
                    this.actor.hide();
            },
        });
    }

    destroy() {
        this.actor.destroy();
    }
};

// All tiles of a layout drawn on a monitor while the tiling system is active.
var LayoutOverlay = class LayoutOverlay {
    constructor(controller) {
        this._controller = controller;
        this.actor = new St.Widget({ style_class: 'tiling-layout-overlay', visible: false, reactive: false });
        global.window_group.add_child(this.actor);
        this._key = null;
        this._tileActors = [];
    }

    show(monitorIndex, layout, win) {
        const key = `${monitorIndex}:${layout.id}:${JSON.stringify(layout.tiles)}`;
        const wa = U.workArea(monitorIndex);
        const gaps = this._controller.gaps();
        try {
            const wact = win ? U.windowActor(win) : null;
            if (wact && wact.get_parent() === global.window_group)
                global.window_group.set_child_below_sibling(this.actor, wact);
        } catch (e) { /* ignore */ }
        if (key !== this._key) {
            this._key = key;
            this.actor.destroy_all_children();
            this._tileActors = [];
            this.actor.set_position(wa.x, wa.y);
            this.actor.set_size(wa.width, wa.height);
            for (const t of layout.tiles) {
                const r = L.tileToRect(t, { x: 0, y: 0, width: wa.width, height: wa.height }, gaps.inner, gaps.outer);
                const a = new St.Widget({ style_class: 'tiling-tile-preview' });
                a.set_position(r.x, r.y);
                a.set_size(r.width, r.height);
                this.actor.add_child(a);
                this._tileActors.push(a);
            }
        }
        if (!this.actor.visible) {
            this.actor.opacity = 0;
            this.actor.show();
            U.ease(this.actor, { opacity: 255, duration: this._controller.settings.get('tile-preview-animation-time') });
        }
    }

    hide() {
        if (!this.actor.visible)
            return;
        this._key = null;
        this.actor.hide();
    }

    destroy() {
        this.actor.destroy();
    }
};
