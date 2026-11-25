// Windows suggestions: after a window is tiled, offer the other open windows
// to fill the tiles that are still empty.

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Pango = imports.gi.Pango;
const Main = imports.ui.main;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;

const MAX_CANDIDATES = 16;

function complementTiles(edgeTile) {
    // Screen-edge tiles are halves or quarters: suggest the rest of the screen.
    if (edgeTile.height >= 1 - U.EPS)
        return [{ x: edgeTile.x < 0.5 ? 0.5 : 0, y: 0, width: 0.5, height: 1 }];
    const quarters = [
        { x: 0, y: 0, width: 0.5, height: 0.5 }, { x: 0.5, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0.5, width: 0.5, height: 0.5 }, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ];
    return quarters.filter(q => Math.abs(q.x - edgeTile.x) > U.EPS || Math.abs(q.y - edgeTile.y) > U.EPS);
}

var Suggestions = class Suggestions {
    constructor(controller, monitorIndex, justTiled, edgeTile) {
        this._c = controller;
        this._mon = monitorIndex;
        this._justTiled = justTiled;
        this._edgeTile = edgeTile;
        this.actor = null;
        this._open();
    }

    _emptyTiles() {
        const tm = this._c.tiling;
        if (!this._edgeTile)
            return tm.emptyTiles(this._mon);
        const occupied = tm.tiledWindows(this._mon).map(w => tm.getState(w).target || tm.getState(w).rect);
        return complementTiles(this._edgeTile).filter(t => {
            const r = tm.tileRect(t, this._mon);
            return !occupied.some(o => U.intersectArea(o, r) > r.width * r.height * 0.2);
        });
    }

    _candidates() {
        const tm = this._c.tiling;
        return U.workspaceWindows()
            .filter(w => w !== this._justTiled && !tm.isTiled(w))
            .slice(0, MAX_CANDIDATES);
    }

    _open() {
        const tiles = this._emptyTiles();
        const wins = this._candidates();
        if (tiles.length === 0 || wins.length === 0) {
            this.close();
            return;
        }
        if (!this.actor) {
            const m = U.monitorGeometry(this._mon);
            this.actor = new St.Widget({ style_class: 'tiling-suggestions-backdrop', reactive: true, can_focus: true, x: m.x, y: m.y, width: m.width, height: m.height });
            this._origin = { x: m.x, y: m.y };
            Main.uiGroup.add_child(this.actor);
            Main.uiGroup.set_child_above_sibling(this.actor, null);
            Main.pushModal(this.actor);
            this.actor.grab_key_focus();
            this.actor.connect('button-press-event', () => {
                this.close();
                return Clutter.EVENT_STOP;
            });
            this.actor.connect('key-press-event', (a, e) => {
                if (e.get_key_symbol() === Clutter.KEY_Escape) {
                    this.close();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            this.actor.opacity = 0;
            U.ease(this.actor, { opacity: 255, duration: 150 });
        }
        this.actor.destroy_all_children();
        for (const tile of tiles)
            this._buildTile(tile, wins);
    }

    _buildTile(tile, wins) {
        const scale = U.scaleFactor();
        const r = this._c.tiling.tileRect(tile, this._mon);
        const panel = new St.BoxLayout({ style_class: 'tiling-suggestions-tile', vertical: true, reactive: true });
        panel.set_position(r.x - this._origin.x, r.y - this._origin.y);
        panel.set_size(r.width, r.height);
        panel.connect('button-press-event', () => Clutter.EVENT_STOP);

        // No St.ScrollView here: destroying one built this way aborts Cinnamon
        // 6.8 (st_bin_destroy assertion). Instead size the grid so it fits.
        const grid = new St.BoxLayout({ vertical: true, style_class: 'tiling-suggestions-grid' });
        const pad = 16 * scale;
        const spacing = 10 * scale;
        const itemExtra = 12 * scale;
        const titleH = 28 * scale;
        const innerW = Math.max(100, r.width - pad * 2);
        const innerH = Math.max(100, r.height - pad * 2);
        const n = wins.length;
        let fit = null;
        for (let cols = 1; cols <= n; cols++) {
            const cellW = Math.floor((innerW - spacing * (cols - 1)) / cols) - itemExtra;
            if (cellW < 90 * scale)
                break;
            const thumbH = Math.round(cellW * 0.6);
            const rows = Math.ceil(n / cols);
            fit = { cols, cellW, thumbH };
            if (rows * (thumbH + titleH + itemExtra) + spacing * (rows - 1) <= innerH)
                break;
        }
        if (!fit) {
            const cellW = Math.max(60, innerW - itemExtra);
            fit = { cols: 1, cellW, thumbH: Math.round(cellW * 0.6) };
        }
        const rowH = fit.thumbH + titleH + itemExtra;
        const maxRows = Math.max(1, Math.floor((innerH + spacing) / (rowH + spacing)));
        const shown = wins.slice(0, maxRows * fit.cols);

        let row = null;
        shown.forEach((w, i) => {
            if (i % fit.cols === 0) {
                row = new St.BoxLayout({ vertical: false, style_class: 'tiling-suggestions-row' });
                grid.add_child(row);
            }
            row.add_child(this._buildItem(w, tile, fit.cellW, fit.thumbH));
        });
        panel.add_child(grid);
        this.actor.add_child(panel);
    }

    _buildItem(win, tile, cellW, thumbH) {
        const btn = new St.Button({ style_class: 'tiling-suggestion', reactive: true, can_focus: true, track_hover: true });
        const box = new St.BoxLayout({ vertical: true });
        const thumbBin = new St.Widget({ layout_manager: new Clutter.BinLayout(), width: cellW, height: thumbH });
        const actor = U.windowActor(win);
        let added = false;
        if (actor && !win.minimized) {
            const [aw, ah] = actor.get_size();
            if (aw > 0 && ah > 0) {
                const s = Math.min(cellW / aw, thumbH / ah);
                const clone = new Clutter.Clone({
                    source: actor, width: Math.round(aw * s), height: Math.round(ah * s),
                    x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                });
                thumbBin.add_child(clone);
                added = true;
            }
        }
        const app = Cinnamon.WindowTracker.get_default().get_window_app(win);
        if (!added && app) {
            const icon = app.create_icon_texture(Math.round(64 * U.scaleFactor()));
            icon.x_align = Clutter.ActorAlign.CENTER;
            icon.y_align = Clutter.ActorAlign.CENTER;
            thumbBin.add_child(icon);
        }
        const title = new St.BoxLayout({ vertical: false, style_class: 'tiling-suggestion-title-box' });
        if (app && added) {
            const small = app.create_icon_texture(Math.round(16 * U.scaleFactor()));
            title.add_child(small);
        }
        const label = new St.Label({ style_class: 'tiling-suggestion-title', text: win.get_title() || '' });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        label.set_width(cellW - 24 * U.scaleFactor());
        title.add_child(label);
        box.add_child(thumbBin);
        box.add_child(title);
        btn.set_child(box);
        btn.connect('clicked', () => {
            this._c.tiling.tileWindow(win, tile, this._mon);
            win.activate(global.get_current_time());
            this._justTiled = win;
            U.timeout(200, () => {
                if (this.actor)
                    this._open();
            });
        });
        return btn;
    }

    close() {
        if (!this.actor) {
            this._c.onSuggestionsClosed(this);
            return;
        }
        try {
            Main.popModal(this.actor);
        } catch (e) { /* ignore */ }
        const a = this.actor;
        this.actor = null;
        U.ease(a, { opacity: 0, duration: 120, onComplete: () => a.destroy() });
        this._c.onSuggestionsClosed(this);
    }
};
