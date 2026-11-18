// Windows 11 style snap assistant: a strip of layouts at the top of the
// monitor that expands when a dragged window gets close to it.

const St = imports.gi.St;
const Main = imports.ui.main;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const W = Me.imports.lib.widgets;

const THUMB_W = 112;
const THUMB_H = 64;
const PEEK = 12;
const MARGIN = 10;

var SnapAssist = class SnapAssist {
    constructor(controller) {
        this._controller = controller;
        // The strip lives in a clipping box that covers the top of the work
        // area, so the collapsed part never draws over a panel or off-screen.
        this._clip = new St.Widget({ clip_to_allocation: true, reactive: false, visible: false });
        this.actor = new St.BoxLayout({ style_class: 'tiling-snap-assist', vertical: false, reactive: false });
        this._clip.add_child(this.actor);
        Main.uiGroup.add_child(this._clip);
        this._thumbs = [];
        this._expanded = false;
        this._monitor = -1;
        this._hover = null;
    }

    _duration() {
        return this._controller.settings.get('snap-assistant-animation-time');
    }

    _build() {
        this.actor.destroy_all_children();
        this._thumbs = [];
        for (const layout of this._controller.layouts) {
            const wrap = new St.Bin({ style_class: 'tiling-snap-layout' });
            const thumb = new W.LayoutThumbnail(layout, THUMB_W, THUMB_H, {
                styleClass: 'tiling-snap-thumb',
                tileStyleClass: 'tiling-thumb-tile tiling-snap-tile',
                gap: 3,
            });
            wrap.set_child(thumb.actor);
            this.actor.add_child(wrap);
            this._thumbs.push({ wrap, thumb, layout });
        }
    }

    _size() {
        const [, w] = this.actor.get_preferred_width(-1);
        const [, h] = this.actor.get_preferred_height(w);
        return [w, h];
    }

    _collapsedOffset() {
        const [, h] = this._size();
        return -(h + MARGIN * U.scaleFactor() - PEEK * U.scaleFactor());
    }

    open(monitorIndex) {
        this._build();
        this._monitor = monitorIndex;
        this._expanded = false;
        this._hover = null;
        this._place();
        this.actor.translation_y = this._collapsedOffset();
        this.actor.opacity = 0;
        this._clip.show();
        Main.uiGroup.set_child_above_sibling(this._clip, null);
        U.ease(this.actor, { opacity: 200, duration: this._duration() });
    }

    _place() {
        const wa = U.workArea(this._monitor);
        const [w, h] = this._size();
        const margin = Math.round(MARGIN * U.scaleFactor());
        this._clip.set_position(wa.x, wa.y);
        // Extra room below for the shadow.
        this._clip.set_size(wa.width, h + margin * 3);
        this.actor.set_position(Math.round((wa.width - w) / 2), margin);
    }

    moveToMonitor(monitorIndex) {
        if (!this._clip.visible || monitorIndex === this._monitor)
            return;
        this._monitor = monitorIndex;
        this._place();
        this._setExpanded(false);
    }

    _setExpanded(expanded) {
        if (this._expanded === expanded)
            return;
        this._expanded = expanded;
        U.ease(this.actor, {
            translation_y: expanded ? 0 : this._collapsedOffset(),
            opacity: expanded ? 255 : 200,
            duration: this._duration(),
        });
        if (!expanded)
            this._setHover(null);
    }

    _setHover(h) {
        for (const t of this._thumbs) {
            t.thumb.setHovered(h && h.layout === t.layout ? h.index : -1);
            if (h && h.layout === t.layout)
                t.wrap.add_style_pseudo_class('hover');
            else
                t.wrap.remove_style_pseudo_class('hover');
        }
        this._hover = h;
    }

    // Called on every drag tick. Returns { layout, tile } when a tile is hovered.
    update(px, py) {
        if (!this._clip.visible)
            return null;
        const threshold = this._controller.settings.get('snap-assistant-threshold') * U.scaleFactor();
        const [w, h] = this._size();
        const x = this._clip.x + this.actor.x;
        const ay = this._clip.y + this.actor.y;
        const top = this._expanded ? ay : ay + h + this._collapsedOffset();
        const bottom = ay + h + (this._expanded ? 0 : this._collapsedOffset());
        const dx = px < x ? x - px : (px > x + w ? px - (x + w) : 0);
        const dy = py < top ? top - py : (py > bottom ? py - bottom : 0);
        const near = Math.hypot(dx, dy) <= threshold || (py <= top + threshold && dx === 0);
        this._setExpanded(near);
        if (!this._expanded)
            return null;
        for (const t of this._thumbs) {
            const i = t.thumb.tileAtStage(px, py);
            if (i >= 0) {
                this._setHover({ layout: t.layout, index: i });
                return { layout: t.layout, tile: t.layout.tiles[i] };
            }
        }
        this._setHover(null);
        return null;
    }

    close() {
        if (!this._clip.visible)
            return;
        this._expanded = false;
        U.ease(this.actor, {
            opacity: 0,
            duration: this._duration(),
            onComplete: () => {
                this._clip.hide();
                this.actor.destroy_all_children();
                this._thumbs = [];
            },
        });
    }

    destroy() {
        this._clip.destroy();
    }
};
