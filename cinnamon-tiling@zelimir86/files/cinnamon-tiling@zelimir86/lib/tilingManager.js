// Core tiling: per-window state, drag-to-tile (tiling system, span multiple
// tiles, snap assistant, screen edges), smart resize, auto-tiling and
// raise-together.

const Meta = imports.gi.Meta;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;
const L = Me.imports.lib.layouts;
const W = Me.imports.lib.widgets;
const SnapAssist = Me.imports.lib.snapAssist;

const FULL_TILE = { x: 0, y: 0, width: 1, height: 1, groups: [] };

function pickWindowAndOp(args) {
    const win = args.find(a => a && typeof a === 'object' && typeof a.get_frame_rect === 'function') || null;
    let op = Meta.GrabOp.NONE;
    for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === 'number') {
            op = args[i];
            break;
        }
    }
    return [win, op];
}

function isMoveOp(op) {
    return op === Meta.GrabOp.MOVING || op === Meta.GrabOp.KEYBOARD_MOVING;
}

// Which edges a resize grab op drags.
function resizeEdges(op) {
    const G = Meta.GrabOp;
    const map = [
        [G.RESIZING_E, 'e'], [G.RESIZING_W, 'w'], [G.RESIZING_N, 'n'], [G.RESIZING_S, 's'],
        [G.RESIZING_NE, 'ne'], [G.RESIZING_NW, 'nw'], [G.RESIZING_SE, 'se'], [G.RESIZING_SW, 'sw'],
        [G.KEYBOARD_RESIZING_E, 'e'], [G.KEYBOARD_RESIZING_W, 'w'], [G.KEYBOARD_RESIZING_N, 'n'],
        [G.KEYBOARD_RESIZING_S, 's'], [G.KEYBOARD_RESIZING_NE, 'ne'], [G.KEYBOARD_RESIZING_NW, 'nw'],
        [G.KEYBOARD_RESIZING_SE, 'se'], [G.KEYBOARD_RESIZING_SW, 'sw'],
    ];
    for (const [v, e] of map) {
        if (v !== undefined && op === v)
            return e;
    }
    return null;
}

var TilingManager = class TilingManager {
    constructor(controller) {
        this._c = controller;
        this._states = new Map();
        this._signals = new U.SignalTracker();
        this._winSignals = new U.SignalTracker();
        this._drag = null;
        this._resize = null;
        this._dragTimer = 0;
        this._raising = false;

        this._preview = new W.SelectionPreview(controller);
        this._overlay = new W.LayoutOverlay(controller);
        this._snapAssist = new SnapAssist.SnapAssist(controller);

        // Muffin's signal signatures differ between Cinnamon versions (6.8 passes
        // an extra display argument), so pick the window and op out of the args.
        this._signals.connect(global.display, 'grab-op-begin', (...args) => this._onGrabBegin(...pickWindowAndOp(args)));
        this._signals.connect(global.display, 'grab-op-end', (...args) => this._onGrabEnd(...pickWindowAndOp(args)));
        this._signals.connect(global.display, 'window-created', (...args) => this._onWindowCreated(pickWindowAndOp(args)[0]));
        this._signals.connect(global.display, 'notify::focus-window', () => this._onFocusChanged());
    }

    get settings() {
        return this._c.settings;
    }

    // ---- state -----------------------------------------------------------

    _trackWindow(win) {
        if (this._states.has(win))
            return;
        this._winSignals.connect(win, 'unmanaged', () => {
            this._states.delete(win);
            this._winSignals.disconnectObject(win);
        });
    }

    getState(win) {
        return this._states.get(win) || null;
    }

    isTiled(win) {
        const s = this._states.get(win);
        if (!s || !s.rect)
            return false;
        if (win.minimized || U.isMaximized(win) || win.is_fullscreen())
            return false;
        return U.rectsClose(U.frameRect(win), s.rect);
    }

    // Tiled windows on the active workspace (optionally a single monitor).
    tiledWindows(monitorIndex = -1, workspace = null) {
        const ws = workspace || global.workspace_manager.get_active_workspace();
        return U.workspaceWindows(ws).filter(w => this.isTiled(w) &&
            (monitorIndex < 0 || this._states.get(w).monitor === monitorIndex));
    }

    // ---- tiling primitives -----------------------------------------------

    tileRect(tile, monitorIndex) {
        const wa = U.workArea(monitorIndex);
        const g = this._c.gaps();
        return L.tileToRect(tile, wa, g.inner, g.outer);
    }

    tileWindow(win, tile, monitorIndex, opts = {}) {
        if (!win || !tile)
            return;
        if (L.sameTile(tile, FULL_TILE) && opts.maximize) {
            this._rememberOriginal(win);
            win.maximize(Meta.MaximizeFlags.BOTH);
            return;
        }
        const r = this.tileRect(tile, monitorIndex);
        this._rememberOriginal(win);
        this._trackWindow(win);
        const st = this._states.get(win);
        st.tile = Object.assign({}, tile);
        st.monitor = monitorIndex;
        st.rect = r;

        if (win.is_fullscreen())
            win.unmake_fullscreen();
        if (win.get_maximized())
            win.unmaximize(Meta.MaximizeFlags.BOTH);
        if (win.minimized)
            win.unminimize();

        const wa = U.workArea(monitorIndex);
        // On Wayland, when a client refuses the requested size (minimum size
        // bigger than the tile) Muffin applies the new size but drops the move.
        // Re-check after the client answered and put the window in place.
        const settle = retrySize => {
            const s = this._states.get(win);
            if (!s || s.target !== r)
                return;
            const fr = U.frameRect(win);
            // e.g. an unmaximize that finished after our resize: ask once more.
            if (retrySize && (Math.abs(fr.width - r.width) > 48 || Math.abs(fr.height - r.height) > 48)) {
                win.move_resize_frame(true, r.x, r.y, r.width, r.height);
                return;
            }
            const x = Math.max(wa.x, Math.min(r.x, wa.x + wa.width - fr.width));
            const y = Math.max(wa.y, Math.min(r.y, wa.y + wa.height - fr.height));
            if (Math.abs(fr.x - x) > 1 || Math.abs(fr.y - y) > 1)
                win.move_frame(true, x, y);
            s.rect = { x, y, width: fr.width, height: fr.height };
        };
        st.target = r;
        const apply = () => {
            try {
                win.move_resize_frame(true, r.x, r.y, r.width, r.height);
                U.timeout(150, () => settle(true));
                U.timeout(450, () => settle(false));
            } catch (e) {
                U.logError(e, 'move_resize_frame');
            }
        };
        if (opts.now)
            apply();
        else
            U.idle(apply);
    }

    _rememberOriginal(win) {
        this._trackWindow(win);
        let st = this._states.get(win);
        if (!st) {
            st = { original: null, tile: null, monitor: -1, rect: null, lastTile: null };
            this._states.set(win, st);
        }
        if (!this.isTiled(win) && !U.isMaximized(win)) {
            const fr = U.frameRect(win);
            st.original = { width: fr.width, height: fr.height, x: fr.x, y: fr.y };
        }
    }

    untileWindow(win, opts = {}) {
        const st = this._states.get(win);
        if (U.isMaximized(win)) {
            win.unmaximize(Meta.MaximizeFlags.BOTH);
            return;
        }
        if (!st)
            return;
        const wasTiled = this.isTiled(win);
        if (st.rect)
            st.lastTile = { tile: st.tile, monitor: st.monitor };
        st.rect = null;
        st.target = null;
        st.tile = null;
        if (!wasTiled || !st.original || !this.settings.get('restore-window-original-size'))
            return;
        const fr = U.frameRect(win);
        let x, y;
        if (opts.pointer) {
            // Keep the window under the pointer at the same relative position.
            const p = U.pointer();
            x = Math.round(p.x - (p.x - fr.x) * (st.original.width / Math.max(1, fr.width)));
            y = fr.y;
        } else if (opts.center) {
            const wa = U.workArea(win.get_monitor());
            x = Math.round(wa.x + (wa.width - st.original.width) / 2);
            y = Math.round(wa.y + (wa.height - st.original.height) / 2);
        } else {
            x = Math.round(fr.x + (fr.width - st.original.width) / 2);
            y = Math.round(fr.y + (fr.height - st.original.height) / 2);
        }
        const w = st.original.width, h = st.original.height;
        U.idle(() => win.move_resize_frame(true, x, y, w, h));
    }

    // Tiles of the active layout on a monitor that no tiled window occupies.
    emptyTiles(monitorIndex, exclude = null) {
        const layout = this._c.layoutFor(monitorIndex);
        const occupied = this.tiledWindows(monitorIndex).filter(w => w !== exclude)
            .map(w => this._states.get(w).target || this._states.get(w).rect);
        return layout.tiles.filter(t => {
            const r = this.tileRect(t, monitorIndex);
            const area = r.width * r.height;
            return !occupied.some(o => U.intersectArea(o, r) > area * 0.2);
        });
    }

    // Empty tile closest to the work area centre.
    bestTile(monitorIndex, exclude = null) {
        const empties = this.emptyTiles(monitorIndex, exclude);
        if (empties.length === 0)
            return null;
        const wa = U.workArea(monitorIndex);
        const c = U.center(wa);
        let best = null, bestD = Infinity;
        for (const t of empties) {
            const tc = U.center(this.tileRect(t, monitorIndex));
            const d = Math.hypot(tc.x - c.x, tc.y - c.y);
            if (d < bestD) {
                bestD = d;
                best = t;
            }
        }
        return best;
    }

    // ---- drag handling ---------------------------------------------------

    _onGrabBegin(win, op) {
        if (!win || !U.isTileable(win))
            return;
        if (isMoveOp(op)) {
            this._beginDrag(win);
            return;
        }
        const edges = resizeEdges(op);
        if (edges)
            this._beginResize(win, edges);
    }

    _onGrabEnd(win, op) {
        if (this._drag && this._drag.win === win)
            this._endDrag();
        if (this._resize && this._resize.win === win)
            this._endResize();
    }

    _beginDrag(win) {
        this._endDrag(true);
        const p = U.pointer();
        this._drag = {
            win,
            startedTiled: this.isTiled(win) || U.isMaximized(win),
            wasTiled: this.isTiled(win),
            startX: p.x, startY: p.y,
            moved: false,
            monitor: U.monitorAt(p.x, p.y),
            selection: null,
            spanAnchor: null,
        };
        if (this.settings.get('enable-snap-assist'))
            this._snapAssist.open(this._drag.monitor);
        this._dragTimer = U.interval(16, () => this._onDragTick());
    }

    _tilingSystemActive(mods) {
        if (!this.settings.get('enable-tiling-system'))
            return false;
        const act = this.settings.get('tiling-system-activation-key');
        if (act === 'none') {
            const deact = this.settings.get('tiling-system-deactivation-key');
            return !(deact !== 'none' && U.modifierPressed(mods, deact));
        }
        return U.modifierPressed(mods, act);
    }

    _onDragTick() {
        const d = this._drag;
        if (!d)
            return;
        const p = U.pointer();
        if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > 6)
            d.moved = true;

        const mon = U.monitorAt(p.x, p.y);
        if (mon !== d.monitor) {
            d.monitor = mon;
            d.spanAnchor = null;
            this._snapAssist.moveToMonitor(mon);
        }

        let sel = null;
        const sa = this._snapAssist.update(p.x, p.y);
        if (sa) {
            this._overlay.hide();
            sel = { tile: sa.tile, monitor: mon, source: 'snap', layout: sa.layout };
        } else if (this._tilingSystemActive(p.mods)) {
            const layout = this._c.layoutFor(mon);
            this._overlay.show(mon, layout, d.win);
            const wa = U.workArea(mon);
            const nx = (p.x - wa.x) / wa.width, ny = (p.y - wa.y) / wa.height;
            const idx = L.tileIndexAt(layout, Math.min(Math.max(nx, 0), 0.9999), Math.min(Math.max(ny, 0), 0.9999));
            if (idx >= 0) {
                let tile = layout.tiles[idx];
                const spanOn = this.settings.get('enable-span-multiple-tiles') &&
                    U.modifierPressed(p.mods, this.settings.get('span-multiple-tiles-activation-key'));
                if (spanOn) {
                    if (!d.spanAnchor)
                        d.spanAnchor = tile;
                    tile = L.spanTiles(layout, d.spanAnchor, tile);
                } else {
                    d.spanAnchor = null;
                }
                sel = { tile, monitor: mon, source: 'tiling' };
            }
        } else {
            this._overlay.hide();
            d.spanAnchor = null;
            if (d.moved && this.settings.get('active-screen-edges'))
                sel = this._edgeSelection(p.x, p.y, mon);
        }

        d.selection = sel;
        if (sel) {
            const r = sel.maximize ? U.workArea(mon) : this.tileRect(sel.tile, mon);
            this._preview.show(r, d.win);
        } else {
            this._preview.hide();
        }
    }

    _edgeSelection(x, y, mon) {
        const m = U.monitorGeometry(mon);
        const wa = U.workArea(mon);
        const off = this.settings.get('edge-tiling-offset') * U.scaleFactor();
        const q = this.settings.get('quarter-tiling-threshold') / 100;
        const left = x <= m.x + off;
        const right = x >= m.x + m.width - 1 - off;
        const top = y <= m.y + off;
        if (!left && !right && !top)
            return null;

        if (this.settings.get('edge-tiling-mode') === 'adaptive') {
            const layout = this._c.layoutFor(mon);
            const nx = Math.min(Math.max((x - wa.x) / wa.width, 0), 0.9999);
            const ny = Math.min(Math.max((y - wa.y) / wa.height, 0), 0.9999);
            if (top && !left && !right && this.settings.get('top-edge-maximize'))
                return { tile: FULL_TILE, monitor: mon, source: 'edge', maximize: true };
            const cands = layout.tiles.filter(t =>
                (left && t.x <= U.EPS && ny >= t.y && ny < t.y + t.height) ||
                (right && t.x + t.width >= 1 - U.EPS && ny >= t.y && ny < t.y + t.height) ||
                (top && !left && !right && t.y <= U.EPS && nx >= t.x && nx < t.x + t.width));
            if (cands.length === 0)
                return null;
            return { tile: cands[0], monitor: mon, source: 'edge' };
        }

        if (left || right) {
            const tx = left ? 0 : 0.5;
            if (y < wa.y + wa.height * q)
                return { tile: { x: tx, y: 0, width: 0.5, height: 0.5 }, monitor: mon, source: 'edge' };
            if (y > wa.y + wa.height * (1 - q))
                return { tile: { x: tx, y: 0.5, width: 0.5, height: 0.5 }, monitor: mon, source: 'edge' };
            return { tile: { x: tx, y: 0, width: 0.5, height: 1 }, monitor: mon, source: 'edge' };
        }
        if (top && this.settings.get('top-edge-maximize'))
            return { tile: FULL_TILE, monitor: mon, source: 'edge', maximize: true };
        return null;
    }

    _endDrag(silent = false) {
        this._dragTimer = U.removeSource(this._dragTimer);
        const d = this._drag;
        this._drag = null;
        this._preview.hide();
        this._overlay.hide();
        this._snapAssist.close();
        if (!d || silent)
            return;
        const win = d.win;
        const sel = d.selection;
        if (sel) {
            if (sel.maximize) {
                this._rememberOriginal(win);
                win.maximize(Meta.MaximizeFlags.BOTH);
                return;
            }
            this.tileWindow(win, sel.tile, sel.monitor);
            if (sel.source === 'snap' && sel.layout && this.settings.get('snap-assist-sync-layout'))
                this._c.setLayout(sel.monitor, sel.layout.id);
            const key = {
                tiling: 'enable-tiling-system-windows-suggestions',
                snap: 'enable-snap-assistant-windows-suggestions',
                edge: 'enable-screen-edges-windows-suggestions',
            }[sel.source];
            if (key && this.settings.get(key)) {
                const edgeTile = sel.source === 'edge' ? sel.tile : null;
                U.timeout(250, () => this._c.showSuggestions(sel.monitor, win, edgeTile));
            }
            return;
        }
        if (d.wasTiled && d.moved) {
            // Dragged out of its tile: give the window its old size back.
            this.untileWindow(win, { pointer: true });
        }
    }

    // ---- smart resize ----------------------------------------------------

    _beginResize(win, edges) {
        this._endResize();
        if (!this.settings.get('resize-complementing-windows') || !this.isTiled(win))
            return;
        const st = this._states.get(win);
        const r = U.frameRect(win);
        const gap = this._c.gaps().inner;
        const tol = gap + 12;
        const others = this.tiledWindows(st.monitor).filter(w => w !== win);
        const linked = [];
        for (const o of others) {
            const or = U.frameRect(o);
            const vOverlap = Math.min(or.y + or.height, r.y + r.height) - Math.max(or.y, r.y) > 0;
            const hOverlap = Math.min(or.x + or.width, r.x + r.width) - Math.max(or.x, r.x) > 0;
            const link = { win: o, init: or, e: null, w: null, n: null, s: null };
            if (edges.includes('e')) {
                if (vOverlap && Math.abs(or.x - (r.x + r.width + gap)) <= tol)
                    link.e = 'opp';
                else if (!vOverlap && Math.abs(or.x + or.width - (r.x + r.width)) <= tol)
                    link.e = 'same';
            }
            if (edges.includes('w')) {
                if (vOverlap && Math.abs(or.x + or.width + gap - r.x) <= tol)
                    link.w = 'opp';
                else if (!vOverlap && Math.abs(or.x - r.x) <= tol)
                    link.w = 'same';
            }
            if (edges.includes('s')) {
                if (hOverlap && Math.abs(or.y - (r.y + r.height + gap)) <= tol)
                    link.s = 'opp';
                else if (!hOverlap && Math.abs(or.y + or.height - (r.y + r.height)) <= tol)
                    link.s = 'same';
            }
            if (edges.includes('n')) {
                if (hOverlap && Math.abs(or.y + or.height + gap - r.y) <= tol)
                    link.n = 'opp';
                else if (!hOverlap && Math.abs(or.y - r.y) <= tol)
                    link.n = 'same';
            }
            if (link.e || link.w || link.n || link.s)
                linked.push(link);
        }
        if (linked.length === 0)
            return;
        this._resize = { win, init: r, linked };
        this._resize.id = win.connect('size-changed', () => this._onResizeTick());
    }

    _onResizeTick() {
        const rs = this._resize;
        if (!rs)
            return;
        const r = U.frameRect(rs.win);
        const dE = (r.x + r.width) - (rs.init.x + rs.init.width);
        const dW = r.x - rs.init.x;
        const dS = (r.y + r.height) - (rs.init.y + rs.init.height);
        const dN = r.y - rs.init.y;
        for (const l of rs.linked) {
            let { x, y, width, height } = l.init;
            if (l.e === 'opp') {
                x += dE; width -= dE;
            } else if (l.e === 'same') {
                width += dE;
            }
            if (l.w === 'opp') {
                width += dW;
            } else if (l.w === 'same') {
                x += dW; width -= dW;
            }
            if (l.s === 'opp') {
                y += dS; height -= dS;
            } else if (l.s === 'same') {
                height += dS;
            }
            if (l.n === 'opp') {
                height += dN;
            } else if (l.n === 'same') {
                y += dN; height -= dN;
            }
            if (width > 50 && height > 50)
                l.win.move_resize_frame(true, x, y, width, height);
        }
    }

    _endResize() {
        const rs = this._resize;
        this._resize = null;
        if (!rs)
            return;
        try {
            rs.win.disconnect(rs.id);
        } catch (e) { /* ignore */ }
        // Re-record the new geometry so these windows still count as tiled.
        U.timeout(100, () => {
            const g = this._c.gaps();
            for (const w of [rs.win, ...rs.linked.map(l => l.win)]) {
                const st = this._states.get(w);
                if (!st)
                    continue;
                st.rect = U.frameRect(w);
                st.target = st.rect;
                st.tile = L.rectToTile(st.rect, U.workArea(st.monitor), g.inner, g.outer);
            }
        });
    }

    // After a plain (non-smart) resize of a tiled window, keep its state in sync.
    syncAfterResize(win) {
        const st = this._states.get(win);
        if (!st || !st.rect)
            return;
        st.rect = U.frameRect(win);
    }

    // ---- auto-tiling / raise together ------------------------------------

    _onWindowCreated(win) {
        if (!this.settings.get('enable-autotiling'))
            return;
        U.timeout(200, () => {
            if (!U.isTileable(win) || win.minimized || win.get_maximized() || win.is_fullscreen())
                return;
            if (!win.located_on_workspace(global.workspace_manager.get_active_workspace()))
                return;
            const mon = win.get_monitor();
            const tile = this.bestTile(mon, win);
            if (tile)
                this.tileWindow(win, tile, mon);
        });
    }

    _onFocusChanged() {
        if (this._raising || !this.settings.get('raise-together'))
            return;
        const win = global.display.focus_window;
        if (!win || !this.isTiled(win))
            return;
        const st = this._states.get(win);
        const sameMon = this.settings.get('raise-together-current-monitor-only');
        const group = this.tiledWindows(sameMon ? st.monitor : -1).filter(w => w !== win);
        if (group.length === 0)
            return;
        this._raising = true;
        try {
            for (const w of U.stackingOrder(group))
                w.raise();
            win.raise();
        } finally {
            this._raising = false;
        }
    }

    destroy() {
        this._endDrag(true);
        this._endResize();
        this._signals.disconnectAll();
        this._winSignals.disconnectAll();
        this._preview.destroy();
        this._overlay.destroy();
        this._snapAssist.destroy();
        this._states.clear();
    }
};
