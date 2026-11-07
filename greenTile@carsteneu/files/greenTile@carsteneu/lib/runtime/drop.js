/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App drop runtime: drag tracking for the zone split. While a tiled window
 * is moved (mouse move grab), a 50 ms pointer poll shows a preview of the cell
 * a drop would produce; on release over a zone of another tiled window the new
 * layout is placed directly and stored as a shape (per monitor, workspace and
 * window count). Cancel (Esc), release in the centre or outside tiled cells
 * keeps the plain snap-on-release behaviour. Owned by the App (monitors-changed
 * destroys the App): a drag cannot survive a monitor change — Muffin ends the
 * grab there anyway, and the 50 ms tick dies with its App. The timer and the
 * preview actor are replaced mid-life (explicit id / reference, no scope);
 * stop() leaves the last .hit in place. destroy() is an idempotent
 * stop: timers and the actor die, nothing is written. All Cinnamon access is
 * injected (deps), the app parameter carries the App's own surfaces (split,
 * auto, config).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const {
    SPLIT_MIN_PX, splitFit, splitRects, sortOrder,
} = XLET.lib.model.split;
const { dropZone, dropLayout, dropFits } = XLET.lib.model.drop;
const { layoutsParse } = XLET.lib.model.layouts;
const { gapCell } = XLET.lib.model.gap;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

// deps: meta (imports.gi.Meta), main (imports.ui.main — uiGroup), global
// (the global object), mainloop (imports.mainloop), st (imports.gi.St),
// collectWindows, excludeCheck, layoutShape, layoutSet, usableArea,
// gap, placeFit, accentRgb (() => the theme component's resolved accent rgb).
/**
 * @typedef {Object} DropDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main — uiGroup
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} st imports.gi.St
 * @property {(w: CinnamonWindow) => boolean} excludeCheck
 * @property {(monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number) => CinnamonWindow[]} collectWindows
 * @property {(app: AppFacade, monitorIndex: number, windowCount: number) => Layout | null} layoutShape
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void} layoutSet
 * @property {(monitor: CinnamonMonitor) => Rect} usableArea
 * @property {(app: AppFacade) => number} gap
 * @property {(app: AppFacade, wins: CinnamonWindow[], layout: Layout, area: Rect, animate: boolean, monitorIndex: number, wsIndex: number, n: number) => FittedLayout} placeFit
 * @property {() => Rgb} accentRgb
 */
/**
 * Shape a successful target() lookup returns.
 * @typedef {Object} DropTargetHit
 * @property {number} monitorIndex
 * @property {number} n
 * @property {DragLayout} layout
 * @property {CinnamonWindow[]} ordered
 * @property {number} fromIndex
 * @property {number} toIndex
 * @property {'top'|'bottom'|'left'|'right'|'center'} zone
 * @property {{ kind: 'cols' | 'rows', shape: readonly number[], order: number[] } | null} next
 */
var Drop = class {
    /**
     * @param {DropDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._meta = deps.meta;
        this._main = deps.main;
        this._global = deps.global;
        this._mainloop = deps.mainloop;
        /** @type {{ timer: number, actor: AnyRecord | null, seq: number | null, from: number | null, start: Rect | null, w: CinnamonWindow | null, hit: any }} */
        this._drop = { timer: 0, actor: null, seq: null, from: null, start: null, w: null, hit: null };
    }

    stop() {
        if (this._drop.timer) {
            this._mainloop.source_remove(this._drop.timer);
            this._drop.timer = 0;
        }
        if (this._drop.actor) {
            this._drop.actor.destroy();
            this._drop.actor = null;
        }
        this._drop.seq = null;
        this._drop.from = null;
        this._drop.start = null;
        this._drop.w = null;
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    begin(app, w, op) {
        if (op !== this._meta.GrabOp.MOVING || this._drop.seq !== null) {
            return;
        }
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        const monitorIndex = w.get_monitor();
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor || this._deps.excludeCheck(w)) {
            return;
        }
        const windows = this._deps.collectWindows(monitor, null);
        if (windows.indexOf(w) === -1) {
            return;
        }
        if (!this._deps.layoutShape(app, monitorIndex, windows.length)) {
            return;
        }
        const f = w.get_frame_rect();
        this._drop.seq = w.get_stable_sequence();
        this._drop.from = monitorIndex;
        this._drop.start = [f.x, f.y, f.width, f.height];
        this._drop.w = w;
        const rgb = this._deps.accentRgb();
        const actor = new this._deps.st.Widget({ reactive: false, style: 'background-color: rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.25); border: 2px solid rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ');' });
        this._main.uiGroup.add_child(actor);
        actor.hide();
        this._drop.actor = actor;
        this._drop.timer = this._mainloop.timeout_add(50, () => this.tick(app));
    }

    // Where a drop at (px, py) would land: the target cell of another tiled window and
    // the zone, plus the new layout (lib/model/drop.js). null outside any zone. The target set
    // holds all tiled windows of the pointer's monitor with A in it — dragged within its
    // own monitor A keeps its reading-order place; from another monitor it is inserted
    // fresh (from = -1) and the count there grows by one.
    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {number} px
     * @param {number} py
     * @param {number | null} [fromMonitor]
     * @param {Rect | null} [startFrame]
     * @returns {DropTargetHit | null}
     */
    target(app, w, px, py, fromMonitor, startFrame) {
        const monitors = this._main.layoutManager.monitors;
        let monitorIndex = -1;
        for (let i = 0; i < monitors.length; i++) {
            const m = monitors[i];
            if (px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height) {
                monitorIndex = i;
                break;
            }
        }
        if (monitorIndex === -1) {
            return null;
        }
        const monitor = monitors[monitorIndex];
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const same = (fromMonitor != null ? fromMonitor : this._drop.from) === monitorIndex;
        const others = this._deps.collectWindows(monitor, null, wsIndex).filter((t) => t !== w);
        const windows = same ? others.concat([w]) : others;
        const n = windows.length;
        if (n < (same ? 2 : 1)) {
            return null;
        }
        const layout = this._deps.layoutShape(app, monitorIndex, n);
        if (!layout) {
            return null;
        }
        // Reading order from the grab-start geometry: A's frame follows the pointer, so
        // its live frame would shuffle the order the stored shape is keyed by.
        const rects = /** @type {Rect[]} */ (windows.map((t) => {
            if (t === w) {
                return startFrame || this._drop.start;
            }
            const f = t.get_frame_rect();
            return [f.x, f.y, f.width, f.height];
        }));
        const indices = sortOrder(rects, layout.kind === 'cols');
        const ordered = indices.map((/** @type {number} */ i) => windows[i]);
        const fromIndex = ordered.indexOf(w);
        const area = this._deps.usableArea(monitor);
        // The hit test must use the cells the windows actually sit in — after an
        // application-minimum adaptation the settled arrangement is not the nominal
        // splitRects output, and a nominal hit test would pick the wrong neighbour.
        const fit = app.split.effective(app, monitorIndex, wsIndex, n, layout, ordered, indices.map((i) => rects[i]));
        const cellRects = fit.cells || splitRects(fit.kind, fit.shape, fit.split, fit.area || area);
        let ci = -1;
        for (let i = 0; i < cellRects.length; i++) {
            const [cx, cy, cw, ch] = cellRects[i];
            if (px >= cx && px < cx + cw && py >= cy && py < cy + ch) {
                ci = i;
                break;
            }
        }
        if (ci === -1 || ci >= ordered.length) {
            return null;
        }
        // fromIndex -1: cross-monitor drop, A is appended fresh (dropLayout).
        // On the own monitor A's index must exist and the target cell must not be A's.
        if (same && fromIndex === -1) {
            return null;
        }
        if (fromIndex === ci) {
            return null;
        }
        const zone = dropZone(cellRects[ci], px, py);
        if (!zone) {
            return null;
        }
        // The transform starts from the EFFECTIVE shape, not the nominal one: after an
        // application-minimum adaptation the arrangement on screen is not the nominal
        // shape, and transforming the nominal shape dropped the window into a different
        // place than the preview showed.
        const next = zone === 'center' ? null : dropLayout(fit.kind, fit.shape, fromIndex, ci, zone);
        if (next && !dropFits(next.kind, next.shape, area[2], area[3], this._deps.gap(app), SPLIT_MIN_PX)) {
            return null;
        }
        return { monitorIndex: monitorIndex, n: n, layout: layout, ordered: ordered, fromIndex: fromIndex, toIndex: ci, zone: zone, next: next };
    }

    /** @param {AppFacade} app */
    tick(app) {
        if (this._drop.seq === null || this._global.display.get_grab_op() === this._meta.GrabOp.NONE) {
            this.stop();
            return false;
        }
        const p = this._global.get_pointer();
        // seq != null at this point (checked above) means begin() populated the state:
        // the drag window and the preview actor both exist.
        const drag = /** @type {{ w: CinnamonWindow, actor: AnyRecord }} */ (/** @type {unknown} */ (this._drop));
        const hit = this.target(app, drag.w, p[0], p[1]);
        this._drop.hit = hit;
        if (!hit || !hit.next) {
            drag.actor.hide();
            return true;
        }
        const monitor = this._main.layoutManager.monitors[hit.monitorIndex];
        if (!monitor) {
            this.stop();
            return false;
        }
        const area = this._deps.usableArea(monitor);
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const n = hit.next.order.length;
        // A's cell in the new layout; a cross-monitor A sits at the end of the order.
        const orderedByNext = hit.next.order.map((/** @type {number} */ i) => (i === hit.ordered.length ? drag.w : hit.ordered[i]));
        // The preview must show the PROPOSED arrangement, so it fits the proposal itself.
        // Reading the recorded placement here would paint the arrangement that is already
        // on screen whenever the drop only changes the shape (a shape-only drop keeps the
        // reading order, so the identity check matches) — the preview then showed the
        // dragged window still in its own cell while the drop moved it elsewhere.
        // Landing clears the previous resize even when the proposed shape is unchanged.
        const fit = splitFit(hit.next.kind, hit.next.shape,
            app.split.minsFor(app, hit.monitorIndex, wsIndex, n, orderedByNext,
                { monitorIndex: /** @type {number} */ (this._drop.from), wsIndex: wsIndex }),
            area, this._deps.gap(app), SPLIT_MIN_PX, null);
        const rects = splitRects(fit.kind, fit.shape, fit.split, area);
        const at = orderedByNext.indexOf(drag.w);
        const cell = gapCell(rects[at], area, this._deps.gap(app));
        drag.actor.set_position(cell[0], cell[1]);
        drag.actor.set_size(cell[2], cell[3]);
        drag.actor.show();
        return true;
    }

    // true = split applied, the grab-end handler must not run the usual snap.
    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    end(app, w, op) {
        if (this._drop.seq === null) {
            return false;
        }
        const start = this._drop.start;
        const fromMonitor = this._drop.from;
        this.stop();
        if (op !== this._meta.GrabOp.MOVING) {
            return false;
        }
        // Esc cancel (spike 2): Muffin put the frame back at the start rect.
        const f = w.get_frame_rect();
        if (start && Math.abs(f.x - start[0]) <= 2 && Math.abs(f.y - start[1]) <= 2) {
            return false;
        }
        const p = this._global.get_pointer();
        const hit = this.target(app, w, p[0], p[1], fromMonitor, start);
        if (!hit || !hit.next) {
            return false;
        }
        // seq != null above means begin() ran: from carries the drag's monitor.
        const from = /** @type {number} */ (fromMonitor);
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
        if (layouts === null) {
            return false;
        }
        const n = hit.next.order.length;
        const ref = app.split.ref(app, hit.monitorIndex, wsIndex, n);
        if (!ref) {
            return false;
        }
        app.split.forget(ref.key);
        this._deps.layoutSet(app, hit.monitorIndex, wsIndex, { shapes: { [ref.n]: { kind: hit.next.kind, shape: hit.next.shape } }, splits: { [ref.n]: null } });
        const monitor = this._main.layoutManager.monitors[hit.monitorIndex];
        const area = this._deps.usableArea(monitor);
        const orderedByNext = hit.next.order.map((/** @type {number} */ i) => (i === hit.ordered.length ? w : hit.ordered[i]));
        // A drop landing inside a workspace-switch effect (a switch during the drag)
        // waits like every retile (lib/runtime/auto.js): placed now, its frames would
        // stay drawn where the effect's cleanup puts the actors back. When it runs, the
        // windows of the drop must still be the surface's windows (none closed or moved
        // meanwhile); otherwise the surface is retiled from its own state instead — the
        // stored shape written above still applies to the count it was written for (a
        // surface with automatic tiling off is then left as it is: accepted, rare).
        const layout = { kind: hit.next.kind, shape: hit.next.shape };
        const dropMonitor = hit.monitorIndex;
        const held = app.auto.switching();
        const hadActor = orderedByNext.map((t) => t.get_compositor_private() != null);
        app.auto.afterSwitch('drop\n' + dropMonitor + '\n' + wsIndex, () => {
            let intact = !held;
            if (held) {
                try {
                    // The dragged window belongs to the target although its frame may
                    // still lie mostly on the source monitor (pointer just past the
                    // edge): it only has to be alive and on the workspace. The others
                    // must be exactly the target surface's windows. Accepted: a dragged
                    // window moved on to a third monitor during the hold is still
                    // brought back into the cell it was dropped into.
                    const now = this._deps.collectWindows(monitor, null, wsIndex).filter((t) => t !== w);
                    const others = orderedByNext.filter((t) => t !== w);
                    const ws = w.get_workspace();
                    intact = now.length === others.length
                        && others.every((t) => now.includes(t))
                        && orderedByNext.every((t, i) => !hadActor[i] || t.get_compositor_private() != null)
                        && Boolean(ws) && ws.index() === wsIndex;
                }
                catch (_e) {
                    intact = false;
                }
            }
            if (intact) {
                this._deps.placeFit(app, orderedByNext, layout, area, true, dropMonitor, wsIndex, n);
            }
            else {
                app.ops.retileMonitor(app, dropMonitor, null, true, wsIndex);
            }
        });
        // The user arranged this surface by hand: the order it now has is the one
        // the surface's stored order must be — recorded straight away (explicit),
        // because no retile necessarily follows a drop on the same monitor.
        app.orders.record(app, hit.monitorIndex, wsIndex, orderedByNext, true);
        // Overrides from a recent resize/swap must not re-sort the freshly placed order.
        for (const t of orderedByNext) {
            app.auto.sortClear(t.get_stable_sequence());
        }
        // The drop placed this window explicitly: its fresh record must not re-append
        // it at the end of the next retile. Only this window — other fresh windows
        // keep their append order, and the record sits under its spawn monitor.
        app.auto.pendingForget(w.get_stable_sequence());
        if (from !== hit.monitorIndex) {
            app.auto.scheduleMonitor(app, from, 250);
        }
        this._global.log('greenTile drag split ws' + (wsIndex + 1) + ' mon=' + ref.mkey + ' n=' + n + ' ' + hit.next.kind + '=[' + hit.next.shape.join(',') + ']');
        return true;
    }

    destroy() {
        this.stop();
        this._drop.hit = null;
    }
};
