// Keyboard actions: move / span windows across tiles, focus by direction,
// untile, centre, highlight and layout cycling.

const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const L = Me.imports.lib.layouts;

const FULL_TILE = { x: 0, y: 0, width: 1, height: 1, groups: [] };

var ACTIONS = [
    'move-window-right', 'move-window-left', 'move-window-up', 'move-window-down',
    'span-window-right', 'span-window-left', 'span-window-up', 'span-window-down',
    'span-window-all-tiles', 'untile-window', 'untile-all-windows', 'move-window-center',
    'focus-window-right', 'focus-window-left', 'focus-window-up', 'focus-window-down',
    'focus-window-next', 'focus-window-prev', 'highlight-current-window',
    'cycle-layouts', 'cycle-layouts-backward',
];

const MOVE_ACTIONS = new Set(ACTIONS.filter(a => a.startsWith('move-window-') || a.startsWith('span-window-') ||
    a.startsWith('untile') || a.startsWith('focus-window-')));

function neighborMonitor(index, dir) {
    const mons = U.monitors();
    const m = mons[index];
    let best = -1, bestD = Infinity;
    mons.forEach((o, i) => {
        if (i === index)
            return;
        let d, overlap;
        if (dir === 'right' || dir === 'left') {
            overlap = Math.min(o.y + o.height, m.y + m.height) - Math.max(o.y, m.y);
            d = dir === 'right' ? o.x - (m.x + m.width) : m.x - (o.x + o.width);
        } else {
            overlap = Math.min(o.x + o.width, m.x + m.width) - Math.max(o.x, m.x);
            d = dir === 'down' ? o.y - (m.y + m.height) : m.y - (o.y + o.height);
        }
        if (overlap > 0 && d >= -2 && d < bestD) {
            bestD = d;
            best = i;
        }
    });
    return best;
}

var KeybindingManager = class KeybindingManager {
    constructor(controller) {
        this._c = controller;
        this._registered = [];
    }

    get tiling() {
        return this._c.tiling;
    }

    register() {
        this.unregister();
        const enabled = this._c.settings.get('enable-move-keybindings');
        for (const action of ACTIONS) {
            if (!enabled && MOVE_ACTIONS.has(action))
                continue;
            const value = this._c.settings.get(action);
            if (!value)
                continue;
            const name = `${U.UUID}-${action}`;
            const ok = Main.keybindingManager.addHotKey(name, value, () => {
                try {
                    this.run(action);
                } catch (e) {
                    U.logError(e, `keybinding ${action}`);
                }
            });
            if (ok)
                this._registered.push(name);
        }
    }

    unregister() {
        for (const name of this._registered)
            Main.keybindingManager.removeHotKey(name);
        this._registered = [];
    }

    // Every accelerator currently configured for a window-moving action.
    configuredAccelerators() {
        const out = new Set();
        if (!this._c.settings.get('enable-move-keybindings'))
            return out;
        for (const action of ACTIONS) {
            const v = this._c.settings.get(action);
            if (v)
                v.split('::').filter(s => s.trim()).forEach(s => out.add(s.trim()));
        }
        return out;
    }

    run(action) {
        const [verb, , dir] = action.split('-');
        switch (action) {
        case 'span-window-all-tiles':
            return this._spanAll();
        case 'untile-window':
            return this._untile();
        case 'untile-all-windows':
            return this._untileAll();
        case 'move-window-center':
            return this._center();
        case 'focus-window-next':
            return this._focusCycle(1);
        case 'focus-window-prev':
            return this._focusCycle(-1);
        case 'highlight-current-window':
            return this._highlight();
        case 'cycle-layouts':
            return this._cycleLayouts(1);
        case 'cycle-layouts-backward':
            return this._cycleLayouts(-1);
        }
        if (verb === 'move')
            return this._move(dir);
        if (verb === 'span')
            return this._span(dir);
        if (verb === 'focus')
            return this._focusDir(dir);
        return undefined;
    }

    _focused() {
        const win = global.display.focus_window;
        return U.isTileable(win) ? win : null;
    }

    _normRect(win, mon) {
        const st = this.tiling.getState(win);
        if (st && st.tile && this.tiling.isTiled(win) && st.monitor === mon)
            return st.tile;
        const wa = U.workArea(mon);
        const fr = U.frameRect(win);
        return {
            x: (fr.x - wa.x) / wa.width, y: (fr.y - wa.y) / wa.height,
            width: fr.width / wa.width, height: fr.height / wa.height,
        };
    }

    _edgeTile(layout, dir, ref) {
        // The tile touching the side we arrive from, best aligned with `ref`.
        const tiles = layout.tiles.filter(t => {
            switch (dir) {
            case 'right': return t.x <= U.EPS;
            case 'left': return t.x + t.width >= 1 - U.EPS;
            case 'down': return t.y <= U.EPS;
            default: return t.y + t.height >= 1 - U.EPS;
            }
        });
        let best = tiles[0] || layout.tiles[0], bestO = -1;
        for (const t of tiles) {
            const o = (dir === 'left' || dir === 'right')
                ? Math.min(t.y + t.height, ref.y + ref.height) - Math.max(t.y, ref.y)
                : Math.min(t.x + t.width, ref.x + ref.width) - Math.max(t.x, ref.x);
            if (o > bestO) {
                bestO = o;
                best = t;
            }
        }
        return best;
    }

    _move(dir) {
        const win = this._focused();
        if (!win)
            return;
        const tm = this.tiling;
        const mon = win.get_monitor();
        const layout = this._c.layoutFor(mon);

        if (U.isMaximized(win)) {
            const st = tm.getState(win);
            if (dir === 'down') {
                win.unmaximize(Meta.MaximizeFlags.BOTH);
                if (st && st.lastTile && st.lastTile.tile)
                    tm.tileWindow(win, st.lastTile.tile, st.lastTile.monitor);
            } else if (dir === 'left' || dir === 'right') {
                tm.tileWindow(win, this._edgeTile(layout, dir === 'left' ? 'right' : 'left', FULL_TILE), mon);
            }
            return;
        }

        const cur = this._normRect(win, mon);
        if (!tm.isTiled(win)) {
            let tile = L.neighborTile(layout, cur, dir);
            if (!tile) {
                const c = { x: cur.x + cur.width / 2, y: cur.y + cur.height / 2 };
                const i = L.tileIndexAt(layout, Math.min(Math.max(c.x, 0), 0.9999), Math.min(Math.max(c.y, 0), 0.9999));
                tile = layout.tiles[i >= 0 ? i : 0];
            }
            tm.tileWindow(win, tile, mon);
            return;
        }

        const nb = L.neighborTile(layout, cur, dir);
        if (nb) {
            tm.tileWindow(win, nb, mon);
            return;
        }
        const other = neighborMonitor(mon, dir);
        if (other >= 0) {
            tm.tileWindow(win, this._edgeTile(this._c.layoutFor(other), dir, cur), other);
            return;
        }
        if (dir === 'up') {
            const st = tm.getState(win);
            if (st)
                st.lastTile = { tile: st.tile, monitor: st.monitor };
            win.maximize(Meta.MaximizeFlags.BOTH);
        } else if (dir === 'down') {
            tm.untileWindow(win);
        }
    }

    _span(dir) {
        const win = this._focused();
        if (!win)
            return;
        const tm = this.tiling;
        const mon = win.get_monitor();
        const layout = this._c.layoutFor(mon);
        if (!tm.isTiled(win)) {
            this._move(dir);
            return;
        }
        const cur = this._normRect(win, mon);
        const nb = L.neighborTile(layout, cur, dir);
        if (nb)
            tm.tileWindow(win, L.spanTiles(layout, cur, nb), mon);
    }

    _spanAll() {
        const win = this._focused();
        if (win)
            this.tiling.tileWindow(win, FULL_TILE, win.get_monitor());
    }

    _untile() {
        const win = this._focused();
        if (win)
            this.tiling.untileWindow(win);
    }

    _untileAll() {
        for (const w of this.tiling.tiledWindows())
            this.tiling.untileWindow(w);
    }

    _center() {
        const win = this._focused();
        if (!win)
            return;
        if (this.tiling.isTiled(win)) {
            this.tiling.untileWindow(win, { center: true });
            return;
        }
        if (U.isMaximized(win))
            win.unmaximize(Meta.MaximizeFlags.BOTH);
        const wa = U.workArea(win.get_monitor());
        const fr = U.frameRect(win);
        win.move_frame(true, Math.round(wa.x + (wa.width - fr.width) / 2), Math.round(wa.y + (wa.height - fr.height) / 2));
    }

    _focusCandidates() {
        const tiledOnly = this._c.settings.get('enable-directional-focus-tiled-only');
        return U.workspaceWindows().filter(w => !w.minimized && (!tiledOnly || this.tiling.isTiled(w)));
    }

    _focusDir(dir) {
        const cur = global.display.focus_window;
        const cands = this._focusCandidates().filter(w => w !== cur);
        if (cands.length === 0)
            return;
        if (!cur) {
            cands[0].activate(global.get_current_time());
            return;
        }
        const c = U.center(U.frameRect(cur));
        const horiz = dir === 'left' || dir === 'right';
        const sign = (dir === 'right' || dir === 'down') ? 1 : -1;
        let best = null, bestScore = Infinity;
        for (const w of cands) {
            const wc = U.center(U.frameRect(w));
            const primary = (horiz ? wc.x - c.x : wc.y - c.y) * sign;
            const perp = Math.abs(horiz ? wc.y - c.y : wc.x - c.x);
            if (primary <= 1)
                continue;
            const score = primary + perp * 2;
            if (score < bestScore) {
                bestScore = score;
                best = w;
            }
        }
        if (!best && this._c.settings.get('enable-wraparound-focus')) {
            // Wrap to the window furthest in the opposite direction.
            let far = -Infinity;
            for (const w of cands) {
                const wc = U.center(U.frameRect(w));
                const primary = (horiz ? c.x - wc.x : c.y - wc.y) * sign;
                const perp = Math.abs(horiz ? wc.y - c.y : wc.x - c.x);
                const score = primary - perp * 2;
                if (primary > 1 && score > far) {
                    far = score;
                    best = w;
                }
            }
        }
        if (best)
            best.activate(global.get_current_time());
    }

    _focusCycle(step) {
        let list = this.tiling.tiledWindows();
        if (list.length === 0)
            list = this._focusCandidates();
        if (list.length === 0)
            return;
        list.sort((a, b) => {
            const ra = U.frameRect(a), rb = U.frameRect(b);
            return a.get_monitor() - b.get_monitor() || ra.x - rb.x || ra.y - rb.y;
        });
        const i = list.indexOf(global.display.focus_window);
        const next = list[((i < 0 ? 0 : i + step) % list.length + list.length) % list.length];
        next.activate(global.get_current_time());
    }

    _highlight() {
        const win = global.display.focus_window;
        if (!win)
            return;
        const fr = U.frameRect(win);
        const a = new St.Widget({ style_class: 'tiling-highlight', reactive: false });
        const pad = Math.round(4 * U.scaleFactor());
        a.set_position(fr.x - pad, fr.y - pad);
        a.set_size(fr.width + pad * 2, fr.height + pad * 2);
        Main.uiGroup.add_child(a);
        a.opacity = 255;
        U.ease(a, { opacity: 0, duration: 900, mode: imports.gi.Clutter.AnimationMode.EASE_IN_QUAD, onComplete: () => a.destroy() });
    }

    _cycleLayouts(step) {
        const win = global.display.focus_window;
        const p = U.pointer();
        const mon = win ? win.get_monitor() : U.monitorAt(p.x, p.y);
        const layouts = this._c.layouts;
        const cur = this._c.layoutFor(mon);
        const i = layouts.findIndex(l => l.id === cur.id);
        const next = layouts[((i + step) % layouts.length + layouts.length) % layouts.length];
        this._c.setLayout(mon, next.id);
        this._c.showLayoutOsd(mon, next.id);
    }

    destroy() {
        this.unregister();
    }
};
