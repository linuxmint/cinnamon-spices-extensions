/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App split runtime: the pending split writes (key "mkey\nwskey\nn" ->
 * { mkey, wskey, n, split }), the 500 ms flush timer they ride, the accel
 * state of the resize hotkeys and the cached keyboard repeat settings.
 * Owned by the App (monitors-changed destroys the App): a hotkey repeat that
 * straddles a monitor change restarts its acceleration in the new App, inside
 * the ~600 ms repeat window the only observable difference. The layouts-corrupt
 * log-once flag instead rides the extension session — the flag must
 * stay log-once across App recreations. destroy() and invalidate() remove the
 * flush timer and clear the pending map: writes go through flush() only, which
 * Config.destroy calls BEFORE any teardown (nothing may write after settings
 * finalize). invalidate() answers an external value-changing write the Config
 * sees as changed::layouts — it drops the stale deferred writes without touching
 * the accel state, so a held resize key keeps accelerating. An external write
 * that produces no value diff (a backup import of the value already in memory)
 * and one that lands before the framework reloads it are NOT observable here;
 * tests/app/settings-external-write.blocked-evidence.js reproduces both.
 * All Cinnamon access is injected (deps), the App's own surfaces (monitors,
 * auto, session, config) are read through the app parameter.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const {
    SPLIT_MIN_PX, splitEqual, splitValid, splitMinimal, splitRects, splitCellAt,
    splitBorderPos, splitMove, splitKeyTarget, splitEdgeRef,
    splitAccel, splitOpEdges, splitFrameEdges, splitMinSizes, splitFit, splitFitShape,
} = XLET.lib.model.split;
const { layoutsParse, layoutsSplits, layoutsShapes, layoutsSet, shapeValid } = XLET.lib.model.layouts;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

var SPLIT_FLUSH_MS = 500;

/**
 * Split runtime: pending split writes, flush timer, resize-hotkey
 * acceleration and the cached keyboard repeat settings. Deps (all injected):
 * mainloop (imports.mainloop), glib (imports.gi.GLib), gio (imports.gi.Gio),
 * global (the global object), main (imports.ui.main — layoutManager),
 * focusWindow, layoutFor, layoutShape, layoutSet, collectWindows,
 * usableArea, gap, retileMonitor, grabOpName, sortReadingOrder.
 * @typedef {Object} SplitDeps
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} glib imports.gi.GLib
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} global the global object
 * @property {AnyRecord} main imports.ui.main — layoutManager
 * @property {() => CinnamonWindow | null} focusWindow
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { preset: Preset | null, auto: boolean }} layoutFor
 * @property {(app: AppFacade, monitorIndex: number, windowCount: number) => DragLayout | null} layoutShape
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void} layoutSet
 * @property {(monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number | null) => CinnamonWindow[]} collectWindows
 * @property {(monitor: CinnamonMonitor) => Rect} usableArea
 * @property {(app: AppFacade) => number} gap
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void} retileMonitor
 * @property {(op: string) => string} grabOpName
 * @property {(app: AppFacade, windows: CinnamonWindow[], columnMajor: boolean, consume?: boolean) => CinnamonWindow[]} sortReadingOrder
 */
var Split = class {
    /**
     * @param {SplitDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._mainloop = deps.mainloop;
        this._glib = deps.glib;
        this._gio = deps.gio;
        this._global = deps.global;
        this._main = deps.main;
        this._pending = new Map();
        // One last placement per monitor/effective workspace, never a count history.
        // Only requested-vs-settled refusals are minima; the next placement probes anew.
        this._mins = new Map();
        this._flushTimer = { id: 0 };
        /** @type {{ state: AccelState | null }} */
        this.keys = { state: null };
        this._keyboardSettings = null;
    }

    /**
     * Pending-write key parts for the monitor + workspace + window count.
     * null when the monitor has no key (unknown monitor).
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @returns {{ key: string, mkey: string, wskey: string, n: string } | null}
     */
    ref(app, monitorIndex, wsIndex, n) {
        const mkey = app.monitors.keys[monitorIndex];
        if (!mkey) {
            return null;
        }
        const wskey = app.monitors.wsKey(monitorIndex, wsIndex);
        return { key: mkey + '\n' + wskey + '\n' + n, mkey: mkey, wskey: wskey, n: String(n) };
    }

    /**
     * Stored split for the layout when it fits (kind, shape), null otherwise. Read-time
     * effective geometry: the returned split is corrected to keep the promised minimum
     * in FINAL (post gap) frames when the usable area allows it (legacy narrow borders,
     * a raised gap, a shrunken monitor) — stored and pending values stay untouched, so
     * restoring the original conditions restores the original placement.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {Layout} layout
     * @returns {SplitShape | null}
     */
    for (app, monitorIndex, wsIndex, n, layout) {
        const valid = splitValid(layout.kind, layout.shape, this.manual(app, monitorIndex, wsIndex, n));
        // The preset spans are the starting widths while no border was dragged for this
        // window count — a dragged border wins. A spans list that does not describe this
        // shape (a dragged shape, a regrouped minimum fit) is no fraction list for it.
        const weights = layout.weights && layout.weights.length === layout.shape.length
            ? splitEqual(layout.kind, layout.shape, layout.weights)
            : null;
        const base = valid || weights;
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        return monitor ? splitMinimal(layout.kind, layout.shape, base,
            this._deps.usableArea(monitor), this._deps.gap(app), SPLIT_MIN_PX) : base;
    }

    /**
     * Valid manual size intent at this count, including its original kind/shape.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @returns {SplitShape | null}
     */
    manual(app, monitorIndex, wsIndex, n) {
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!ref) {
            return null;
        }
        const pending = this._pending.get(ref.key);
        const raw = pending ? pending.split
            : layoutsSplits(layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || ''), ref.mkey, ref.wskey)[ref.n];
        const shape = shapeValid(raw, n);
        return shape ? splitValid(shape.kind, shape.shape, raw) : null;
    }

    /**
     * Records the arrangement that was actually PLACED for a (monitor, workspace, window
     * surface): fit and stable identities, plus explicit cells when the fit alone cannot
     * describe an underfilled command. External resets invalidate it at the existing seam.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {(FittedLayout & {mins: Array<{seq: number, w: number, h: number}>}) | null} entry null clears this surface only
     */
    setPlacement(app, monitorIndex, wsIndex, n, entry) {
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!ref) {
            return;
        }
        const key = ref.mkey + '\n' + ref.wskey;
        if (entry) { this._mins.set(key, entry); }
        else { this._mins.delete(key); }
    }

    /**
     * The recorded arrangement when it describes EXACTLY these windows in this order,
     * null otherwise. The identity check is the point: a window closed and replaced at
     * the same count must not inherit the predecessor's arrangement or its minimum.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {CinnamonWindow[]} ordered
     * @returns {FittedLayout | null}
     */
    placementFor(app, monitorIndex, wsIndex, n, ordered) {
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        const entry = ref ? this._mins.get(ref.mkey + '\n' + ref.wskey) : null;
        return entry && ordered && entry.mins.length === ordered.length
            && ordered.every((w, i) => entry.mins[i].seq === w.get_stable_sequence()) ? entry : null;
    }

    /**
     * Cell minima of the recorded placement, mapped to the requested windows BY IDENTITY:
     * a window carries its own observed minimum wherever it sits in the arrangement, so a
     * proposal that reorders the windows still sees the genuine refusals — and a window
     * that is not in the record (a fresh one, or a closed window's replacement) gets zero
     * instead of inheriting someone else's. The order deliberately does NOT have to match:
     * only the read-side geometry needs a record in one specific order.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {CinnamonWindow[]} ordered
     * @param {{monitorIndex: number, wsIndex: number}} [source] source surface of an incoming window
     * @returns {Array<{w: number, h: number}>}
     */
    minsFor(app, monitorIndex, wsIndex, n, ordered, source) {
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        const sourceRef = source ? this.ref(app, source.monitorIndex, source.wsIndex, n) : null;
        const bySeq = new Map();
        for (const r of [sourceRef, ref]) {
            const entry = r ? this._mins.get(r.mkey + '\n' + r.wskey) : null;
            for (const m of entry ? entry.mins : []) {
                bySeq.set(m.seq, { w: m.w, h: m.h });
            }
        }
        return ordered.map((w) => bySeq.get(w.get_stable_sequence()) || { w: 0, h: 0 });
    }

    /**
     * Effective arrangement for the ordered windows of a layout: the arrangement the last
     * placement under this key ACTUALLY produced, when that placement describes exactly
     * these windows. Consumers therefore read the real geometry — a placement made from a
     * different layout (the column hotkey can fall back to 'cols' while the automatic
     * layout is 'rows') can never be mistaken for one the consumer would have derived from
     * its own nominal layout. Without a matching record the plain equal division of the
     * nominal layout is used, never a guess about minima.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {Layout} layout
     * @param {CinnamonWindow[]} ordered
     * @param {Rect[]} [frames] action-start frames in the same ordered identity sequence
     * @returns {FittedLayout}
     */
    effective(app, monitorIndex, wsIndex, n, layout, ordered, frames) {
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor || ordered.length !== n) {
            return { kind: layout.kind, shape: layout.shape.slice(), split: this.for(app, monitorIndex, wsIndex, n, layout) };
        }
        const recorded = this.placementFor(app, monitorIndex, wsIndex, n, ordered);
        if (recorded) {
            return recorded;
        }
        const fit = this.fit(app, monitorIndex, wsIndex, n, layout,
            Array.from({ length: n }, () => ({ w: 0, h: 0 })), this._deps.usableArea(monitor), this._deps.gap(app));
        // A changed window set has not been placed yet: its live frames, not a former
        // count's fit, are the current hit/focus geometry. Large frames imply no minima.
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (ref && this._mins.has(ref.mkey + '\n' + ref.wskey)) {
            fit.cells = frames || ordered.map((w) => {
                const f = w.get_frame_rect();
                return [f.x, f.y, f.width, f.height];
            });
        }
        return fit;
    }

    /**
     * The arrangement for explicit cell minima — what placeFit re-runs on as it gathers
     * the evidence of its own placements. The effective shape is decided BEFORE the
     * stored split is read, so a resize the user made on a regrouped arrangement is
     * read back against exactly that shape rather than being dropped.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {Layout} layout
     * @param {Array<{w: number, h: number}>} mins
     * @param {Rect} area
     * @param {number} gap
     * @returns {FittedLayout}
     */
    fit(app, monitorIndex, wsIndex, n, layout, mins, area, gap) {
        const gapArea = area;
        area = layout.area || area;
        const shape = splitFitShape(layout.kind, layout.shape, mins, area[2], area[3], gap);
        const base = splitValid(layout.kind, shape, layout.split)
            || splitValid(layout.kind, shape, this.manual(app, monitorIndex, wsIndex, n))
            // The preset spans are the last fallback before the equal division, and only
            // for the shape they were cut to: a minimum fit that regrouped the windows
            // (fewer or OTHER groups of the same count, e.g. [1, 3] -> [2, 2]) starts
            // nominally again.
            || (layout.weights && layout.weights.length === shape.length
                && layout.shape.every((/** @type {number} */ k, /** @type {number} */ i) => k === shape[i])
                ? splitEqual(layout.kind, shape, layout.weights)
                : null);
        return Object.assign(splitFit(layout.kind, layout.shape, mins, area, gap, SPLIT_MIN_PX, base, shape, layout.area ? gapArea : undefined),
            layout.area ? { area: area } : {});
    }

    /**
     * Minimum final frame size of the two parts either side of the border an edge of
     * cell idx belongs to. The floor comes from the minima the last placement observed,
     * so a border already sitting on a window's real minimum stays exactly where it is
     * instead of creeping outward. Each side keeps its OWN gap inset on the split axis;
     * the greenTile floor is a target and stays the legacy 120 px plus one full gap.
     * @param {'cols'|'rows'} kind
     * @param {readonly number[]} shape
     * @param {Array<{w: number, h: number}>} mins
     * @param {number} idx
     * @param {string} edge
     * @param {number} gap
     * @returns {[number, number]}
     */
    _edgeMins(kind, shape, mins, idx, edge, gap) {
        /** @type {[number, number]} */
        const def = [SPLIT_MIN_PX + gap, SPLIT_MIN_PX + gap];
        const ref = splitEdgeRef(kind, shape, idx, edge);
        if (!ref) {
            return def;
        }
        const parts = splitMinSizes(kind, shape, mins);
        const list = ref.list === 'major' ? parts.major : parts.minor[ref.i];
        if (!list || list.length <= ref.b + 1) {
            return def;
        }
        const lead = Math.floor(gap / 2);
        const trail = gap - lead;
        // an outer part on this axis loses only the half gap facing its neighbour, an
        // inner part loses both halves
        /** @param {number} b @returns {number} */
        const inset = (b) => (b > 0 ? lead : 0) + (b < list.length - 1 ? trail : 0);
        // Two floors meet here. The greenTile floor is a TARGET the resize kept all
        // along: a cell keeps 120 px after losing a full gap, so an outer part still
        // ends up half a gap above 120 (the legacy clamp). An APPLICATION minimum is a
        // hard constraint instead, so it only needs its own inset.
        /** @param {number} b @returns {number} */
        const floor = (b) => Math.max(SPLIT_MIN_PX + gap, Math.max(list[b], SPLIT_MIN_PX) + inset(b));
        return /** @type {[number, number]} */ ([floor(ref.b), floor(ref.b + 1)]);
    }

    /**
     * Writes all pending splits into the layouts setting and stops the flush
     * timer. Never overwrites a corrupt layouts setting.
     * @param {AppFacade} app
     */
    flush(app) {
        if (this._flushTimer.id) {
            this._mainloop.source_remove(this._flushTimer.id);
            this._flushTimer.id = 0;
        }
        if (this._pending.size === 0) {
            return;
        }
        let layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
        if (layouts === null) {
            // corrupt setting: same rule as layoutSet, never overwrite it
            this._pending.clear();
            if (!app.session.splitCorruptLogged) {
                app.session.splitCorruptLogged = true;
                this._global.log('greenTile layouts setting is corrupt, splits not written');
            }
            return;
        }
        app.session.splitCorruptLogged = false;
        for (const entry of this._pending.values()) {
            layouts = layoutsSet(layouts, entry.mkey, entry.wskey, { splits: { [entry.n]: entry.split } });
        }
        this._pending.clear();
        app.config.settings.setValue(SETTINGS_KEYS.layouts, JSON.stringify(layouts));
    }

    /**
     * Stores a pending split write; debounced by the 500 ms flush timer unless
     * flushNow.
     * @param {AppFacade} app
     * @param {{ key: string, mkey: string, wskey: string, n: string }} ref
     * @param {SplitShape} split
     * @param {boolean} flushNow
     */
    remember(app, ref, split, flushNow) {
        this._pending.set(ref.key, { mkey: ref.mkey, wskey: ref.wskey, n: ref.n, split: split });
        if (flushNow) {
            this.flush(app);
            return;
        }
        if (this._flushTimer.id) {
            this._mainloop.source_remove(this._flushTimer.id);
        }
        this._flushTimer.id = this._mainloop.timeout_add(SPLIT_FLUSH_MS, () => {
            this._flushTimer.id = 0;
            this.flush(app);
            return false;
        });
    }

    /**
     * A split that the hotkeys have not yet written expires: a drop on the same
     * monitor + workspace + window count stores its shape and a stale pending
     * split would win over it on the next read.
     * @param {string} refKey
     */
    forget(refKey) {
        this._pending.delete(refKey);
    }

    /**
     * Drops every deferred split write and its flush timer. An external write of
     * the layouts setting (the settings dialog's reset, an import — or its save
     * of a whole stale copy) is authoritative: flush() re-reads the setting and
     * would otherwise merge the splits computed against the old value back in.
     * The accel state is untouched, so a held resize key keeps accelerating.
     */
    invalidate() {
        this._dropFlushTimer();
        this._pending.clear();
        this._mins.clear();
    }

    /** Removes the armed flush timer, if any (its source may already be gone). */
    _dropFlushTimer() {
        if (this._flushTimer.id) {
            try {
                this._mainloop.source_remove(this._flushTimer.id);
            }
            catch (_e) {
                // the source was already gone
            }
            this._flushTimer.id = 0;
        }
    }

    /**
     * true when the monitor + workspace has stored (or pending) splits or dragged shapes —
     * shows the reset button
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {boolean}
     */
    any(app, monitorIndex, wsIndex) {
        const ref = this.ref(app, monitorIndex, wsIndex, 0);
        if (!ref) {
            return false;
        }
        const prefix = ref.mkey + '\n' + ref.wskey + '\n';
        for (const key of this._pending.keys()) {
            if (key.indexOf(prefix) === 0) {
                return true;
            }
        }
        const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
        return Object.keys(layoutsSplits(layouts, ref.mkey, ref.wskey)).length > 0
            || Object.keys(layoutsShapes(layouts, ref.mkey, ref.wskey)).length > 0;
    }

    /**
     * Removes pending splits and stored splits/shapes of the
     * monitor + workspace.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     */
    reset(app, monitorIndex, wsIndex) {
        const ref = this.ref(app, monitorIndex, wsIndex, 0);
        if (!ref) {
            return;
        }
        const prefix = ref.mkey + '\n' + ref.wskey + '\n';
        for (const key of Array.from(this._pending.keys())) {
            if (key.indexOf(prefix) === 0) {
                this._pending.delete(key);
            }
        }
        this.setPlacement(app, monitorIndex, wsIndex, 0, null);
        this._deps.layoutSet(app, monitorIndex, wsIndex, { splits: null, shapes: null });
        this._global.log('greenTile sizes reset ws' + (wsIndex + 1) + ' mon=' + ref.mkey);
    }

    /**
     * Drops the size intent (pending split + stored split/shape) the surface holds for
     * exactly one window count. The intent is keyed by count alone, so a composition
     * change the user did not arrange would silently re-expose the sizes of the
     * arrangement it replaced. reset() is the whole-surface form of this. The placement
     * record is deliberately kept: it is keyed by surface only and its identity check
     * (placementFor) makes a stale one inert, while the incoming landing still reads it.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     */
    forgetCount(app, monitorIndex, wsIndex, n) {
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!ref) {
            return;
        }
        this._pending.delete(ref.key);
        this._deps.layoutSet(app, monitorIndex, wsIndex, { splits: { [ref.n]: null }, shapes: { [ref.n]: null } });
    }

    /**
     * Keyboard repeat delay for the hotkey acceleration: the desktop's repeat delay
     * plus margin, 600 ms as the fallback when the schema is unreadable.
     * @returns {number}
     */
    repeatThreshold() {
        try {
            if (!this._keyboardSettings) {
                this._keyboardSettings = new this._gio.Settings({ schema_id: 'org.cinnamon.desktop.peripherals.keyboard' });
            }
            return this._keyboardSettings.get_uint('delay') + 100;
        }
        catch (_e) {
            return 600;
        }
    }

    /**
     * Resize hotkeys (Super+Alt+arrows): move a border of the focused window's cell. A tap
     * moves 1 px, holding the key accelerates (splitAccel). Retiles without animation
     * at every step; the split is written 500 ms after the last step.
     * @param {AppFacade} app
     * @param {string} action
     */
    hotkey(app, action) {
        const w = this._deps.focusWindow();
        if (!w) {
            return;
        }
        const monitorIndex = w.get_monitor();
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            return;
        }
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor) {
            return;
        }
        const windows = this._deps.collectWindows(monitor, null);
        // only windows of the layout (focusWindow may fall back to another window)
        if (windows.indexOf(w) === -1) {
            return;
        }
        const n = windows.length;
        const layout = this._deps.layoutShape(app, monitorIndex, n);
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!layout || !ref) {
            return;
        }
        const ordered = this._deps.sortReadingOrder(app, windows, layout.kind === 'cols', false);
        const fit = this.effective(app, monitorIndex, wsIndex, n, layout, ordered);
        const area = fit.area || this._deps.usableArea(monitor);
        const split = fit.split;
        const f = w.get_frame_rect();
        const idx = splitCellAt(fit.cells || splitRects(fit.kind, fit.shape, split, area), [f.x, f.y, f.width, f.height]);
        const target = idx < 0 ? null : splitKeyTarget(fit.kind, fit.shape, idx, action);
        if (!target) {
            return;
        }
        const accel = splitAccel(this.keys.state, action, this._glib.get_monotonic_time() / 1000, this.repeatThreshold());
        this.keys.state = accel.state;
        const from = splitBorderPos(fit.kind, fit.shape, split, idx, target.edge, area);
        // The minimum applies to the final frame, and each side of the border keeps its
        // own gap inset: a border already sitting on a window's real minimum does not
        // move at all (no growth, no settings write).
        const minPx = this._edgeMins(fit.kind, fit.shape, this.minsFor(app, monitorIndex, wsIndex, n, ordered), idx, target.edge, this._deps.gap(app));
        // splitBorderPos only yields null for an idx outside the layout; idx comes from
        // splitCellAt over the same cells, so it is always in range here.
        const fromPx = /** @type {number} */ (from);
        const next = splitMove(fit.kind, fit.shape, split, idx, target.edge, fromPx + target.sign * accel.step, area, minPx);
        // at the minimum size the border stays: no retile and no new flush timer per repeat
        if (!next || (split && JSON.stringify(next) === JSON.stringify(split))) {
            return;
        }
        this.remember(app, ref, next, false);
        this._deps.retileMonitor(app, monitorIndex, null, false, wsIndex, Object.assign({}, fit, { split: next }));
    }

    /**
     * Edge resize of a tiled window (mouse or window menu): the moved edges become the new
     * borders of the layout (lib/model/split.js), stored for this monitor, workspace and
     * window count; the neighbours follow in the retile. Edges on the monitor border have
     * no neighbour: the window snaps back. With automatic tiling off it stays a free resize.
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    onResizeEnd(app, w, op) {
        const seq = w.get_stable_sequence();
        const start = app.auto.resizeStartTake(seq);
        const active = this._global.workspace_manager.get_active_workspace();
        if (!start || w.get_workspace() !== active) {
            return;
        }
        const monitorIndex = w.get_monitor();
        const wsIndex = active.index();
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            return;
        }
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor || start.monitor !== monitorIndex) {
            app.auto.scheduleMonitor(app, monitorIndex, 250);
            return;
        }
        const windows = this._deps.collectWindows(monitor, null);
        if (windows.indexOf(w) === -1) {
            return;
        }
        const n = windows.length;
        const layout = this._deps.layoutShape(app, monitorIndex, n);
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!layout || !ref) {
            return;
        }
        // The retile sorts the dragged window by its frame at grab start, so a moved left or
        // top edge never pushes it into another cell (sortReadingOrder).
        app.auto.sortOverride(seq, start.rect, this._glib.get_monotonic_time() / 1000);
        const ordered = this._deps.sortReadingOrder(app, windows, layout.kind === 'cols', false);
        const fit = this.effective(app, monitorIndex, wsIndex, n, layout, ordered);
        const area = fit.area || this._deps.usableArea(monitor);
        let split = fit.split;
        const idx = splitCellAt(fit.cells || splitRects(fit.kind, fit.shape, split, area), start.rect);
        const f = w.get_frame_rect();
        /** @type {Rect} */
        const end = [f.x, f.y, f.width, f.height];
        // Only edges that really moved count: a click on the edge without dragging must not
        // store anything (the frame edge never sits exactly on the computed border — rounding,
        // terminals snap their size to character cells).
        const moved = splitFrameEdges(start.rect, end);
        const named = splitOpEdges(this._deps.grabOpName(op));
        const edges = named.length ? named.filter((/** @type {string} */ e) => moved.indexOf(e) !== -1) : moved;
        // The gap sits half on each side of a border (gapCell): border = frame edge + half gap outward.
        const gap = this._deps.gap(app);
        const lead = Math.floor(gap / 2);
        const trail = gap - lead;
        /** @type {Record<string, number>} */
        const pos = { left: f.x - lead, right: f.x + f.width + trail, top: f.y - lead, bottom: f.y + f.height + trail };
        // The minimum applies to the final frame, each side with its own gap inset, like
        // dropFits (see split.hotkey).
        let changed = false;
        for (const edge of edges) {
            const minPx = this._edgeMins(fit.kind, fit.shape, this.minsFor(app, monitorIndex, wsIndex, n, ordered), idx, edge, gap);
            const next = idx < 0 ? null : splitMove(fit.kind, fit.shape, split, idx, edge, pos[edge], area, minPx);
            if (next) {
                split = next;
                changed = true;
            }
        }
        if (changed && split) {
            this.remember(app, ref, split, true);
            // Publish the mouse's new border before the debounce: the next key must
            // address it, while hit tests still see the frames currently on screen.
            const mins = this.minsFor(app, monitorIndex, wsIndex, n, ordered);
            this.setPlacement(app, monitorIndex, wsIndex, n, Object.assign({}, fit, {
                split: split,
                mins: mins.map((m, i) => ({ seq: ordered[i].get_stable_sequence(), w: m.w, h: m.h })),
                cells: ordered.map((t) => { const frame = t.get_frame_rect(); return /** @type {Rect} */ ([frame.x, frame.y, frame.width, frame.height]); }),
            }));
            this._global.log('greenTile split stored ws' + (wsIndex + 1) + ' mon=' + ref.mkey + ' n=' + n + ' edges=' + edges.join('+'));
        }
        app.auto.scheduleMonitor(app, monitorIndex, 250);
    }

    /** Stops the flush timer and drops all pending writes. */
    destroy() {
        this._dropFlushTimer();
        // No settings write here: pending splits reach the settings through flush(),
        // called by Config.destroy before any teardown — after finalize nothing writes.
        this._pending.clear();
        this._mins.clear();
        this.keys.state = null;
        this._keyboardSettings = null;
    }
};
