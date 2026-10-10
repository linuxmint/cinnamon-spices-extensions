/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App auto-tiling observer: the per-monitor debounce timers, the fresh-
 * window pending sets, the monitor maps, the workspace/window observers and
 * the sort-rect overrides a resize or swap leaves for the next retile. Owned
 * by the App (monitors-changed destroys the App) and destroyed in the
 * autoDisconnectAll slot of Config.destroy, in the same order: timers
 * removed, maps cleared, drop.stop(), sort overrides cleared, exclusion
 * toggles cleared, workspaces disconnected, global signals disconnected,
 * tracked windows untracked.
 * The global signals are connected on the component's own runtime Scope (App
 * lifetime). The workspace window-added/removed handlers are dropped and
 * reconnected mid-life (notify::n-workspaces) and the per-monitor debounce
 * timers are replaced on reschedule — both keep explicit id lists / a timer
 * Map instead of the scope (no selective mid-life disconnect). Split, drop,
 * border and exclusion runtime comes in as injected deps. All Cinnamon access
 * is injected.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { createScope } = XLET.lib.runtime.scope;
const { disconnectEach } = XLET.lib.model.teardown;

// sortRectOverride on this component: stable sequence -> frame to sort by
// instead of the current one (set after an edge resize or a swap: the dragged window
// keeps the cell it was tiled into; used up by the next retile, ignored after
// SORT_OVERRIDE_MS when no retile came)
const SORT_OVERRIDE_MS = 2000;

// A plain click on a title bar is a MOVING grab that ends exactly where it began:
// Cinnamon starts a move grab on every button press on a title bar, motion or not
// (verified live). Retiling the surface for it re-places every tile, and any small
// deviation of a window (a focus-driven shift, a size-increment rounding) then snaps
// back visibly — the "jumps a pixel on every click" report. The grabbed window's frame
// is therefore compared with a couple of pixels of slack, the same slack the drop
// module uses for its cancel test (#94937): this is only the click/drag distinction,
// a real drag moves the frame by far more. The whole frame is compared, not just the
// origin: a MOVING grab can also resize under the same op (the WM un-maximizing or
// unsnapping a window on the first drag), and a released window at a floating size
// must still be placed.
const GRAB_MOVE_TOLERANCE = 2;

// Cinnamon animates every workspace switch on the window ACTORS
// (/usr/share/cinnamon/js/ui/windowManager.js _switchWorkspace): at the switch it
// records each actor of the old and the new workspace as origX/origY, eases x/y for
// WORKSPACE_ANIMATION_TIME (150 ms) times the effect-speed multiplier (at most 1.4),
// and its cleanup ends with set_position(origX, origY). A frame greenTile moves inside
// that window is therefore undone on the actor: Muffin synced the actor to the new
// frame, the cleanup writes the position from BEFORE the switch back, and Muffin does
// not re-sync until the frame changes again. The frame is right while the window is
// drawn at its old place — the overlaps, empty cells and off-screen windows after a
// Super+Ctrl+Arrow push. A retile asked for while the effect runs is held until it
// ended, and not a frame longer: Cinnamon's handler runs before greenTile's (it is
// connected when the shell starts, windowManager.js constructor, before any extension)
// and creates every ease synchronously (/usr/share/cinnamon/js/ui/environment.js
// _easeActor reads the new transitions right after restore_easing_state), so when
// greenTile sees the switch the whole effect is already visible on the actors. No actor
// with the effect's origX mark and a live x/y ease means no effect: nothing is held.
// Otherwise the hold looks again every SWITCH_POLL_MS (about one frame) and ends at the
// first look after the cleanup removed the last mark; SWITCH_EFFECT_CAP_MS is the
// emergency brake if an effect never reports its end.
const SWITCH_POLL_MS = 16;
const SWITCH_EFFECT_CAP_MS = 1000;
// Switches back to back restart the hold, so a chain of them (a held workspace key, a
// client switching desktops in a loop) could keep tiling waiting for as long as it
// lasts. A hold that has lasted this long is not extended any more: the next look ends
// it. And a press flood inside one hold is bounded: beyond this many held presses the
// newest are dropped (and logged) instead of piling up for one burst of placements.
// The price of the total bound, accepted: a switch chain longer than this ends its hold
// at the running look's 1000 ms cap even if a later switch's effect still runs, so the
// held runs of that one chain may land inside an effect (the stale-actor case once per
// chain, which the actor resync in lib/runtime/actorsync.js may still repair).
const SWITCH_HOLD_TOTAL_MS = 3000;
const SWITCH_PRESS_CAP = 32;
// The price of the hold, accepted: the geometry hotkeys and retiles after a switch wait
// for Cinnamon's effect (150 ms at the default effect speed, 90 ms at "fast", 210 ms at
// "slow") plus at most one look.

// deps: mainloop (imports.mainloop), meta (imports.gi.Meta), main
// (imports.ui.main), global (the global object), signalManager (fresh, this
// scope alone), gobject (imports.gi.GObject, activates the scope's GObject
// guard), focusWindow (focusWindow), focusMonitorIndex (focusMonitorIndex),
// layoutFor (layoutFor), layoutSet (layoutSet), retileMonitor
// (retileMonitor), borderUpdate (() => the border component's update),
// grabIsResize (grabIsResize), dropBegin (app.drop.begin), dropEnd (app.drop.end),
// dropStop (app.drop.stop), resizeEnd (app.split.onResizeEnd) — all resolved
// through the app at call time, so construction order does not matter. Ad-hoc
// exclusion state is NOT auto's business: it rides the session (exclusions.js)
// and ends with its window's close watch. The App's own surfaces — app.session
// and app.monitors — are read through the app parameter (settle wait, monitor
// readiness), not injected as deps.
/**
 * @typedef {Object} AutoDeps
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} signalManager fresh, this scope alone
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {AnyRecord} glib imports.gi.GLib (monotonic clock of the switch hold and its total bound)
 * @property {() => CinnamonWindow | null} focusWindow
 * @property {() => number} focusMonitorIndex
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { auto: boolean }} layoutFor
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => boolean} layoutSet
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void} retileMonitor
 * @property {() => void} borderUpdate
 * @property {(op: string) => boolean} grabIsResize
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => boolean} dropBegin
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => boolean} dropEnd
 * @property {() => void} dropStop
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => void} resizeEnd
 */
var Auto = class {
    /**
     * @param {AutoDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._mainloop = deps.mainloop;
        this._meta = deps.meta;
        this._main = deps.main;
        this._global = deps.global;
        this._scope = createScope({
            signalManager: deps.signalManager,
            mainloop: deps.mainloop,
            gobject: deps.gobject,
        });
        this._overrides = new Map();
        this._timers = new Map();
        // _destroyed: once destroy() ran, a debounce timer that could not be
        // removed (a throwing source_remove) must do nothing when it still fires.
        this._destroyed = false;
        // _settleWaiting: the settle fan-out is held back until the restart-order store
        // is read (it is asynchronous); this keeps it from registering twice.
        this._settleWaiting = false;
        // _pending: per monitor, the stable sequences of fresh windows (append at the end).
        // _lastMonitor: stable sequence -> monitor the window was last seen on (close path).
        // _grabMonitor: stable sequence -> monitor at grab start (manual move across monitors).
        this._pending = new Map();
        this._lastMonitor = new Map();
        this._grabMonitor = new Map();
        // _moveStart: stable sequence -> [x, y, width, height] when a move grab began, so a
        // release can tell a plain click (the frame did not change) from a real drag
        // (see onGrabEnd).
        this._moveStart = new Map();
        // _resizeStart: stable sequence -> { rect, monitor } at the start of an edge resize.
        this._resizeStart = new Map();
        /** @type {Array<[AnyRecord, number, number]>} */
        this._workspaceSignals = [];
        /** @type {Array<[CinnamonWindow, number, number, number]>} */
        this._tracked = [];
        // _switchTimer: the running workspace-switch effect's end (0 = none runs).
        // _afterSwitch: key -> the run held until that end. A surface key keeps one
        // run, newest wins, with the options of every request it replaced merged in
        // (see afterSwitch); a press key is unique, so every held press replays.
        // _holdSince: monotonic ms when the current hold opened (sort overrides are
        // shifted by the held time, so their freshness window does not run out).
        this._switchTimer = 0;
        /** @type {Map<string, {fn: (opts: AnyRecord) => void, opts: AnyRecord}>} */
        this._afterSwitch = new Map();
        this._holdSince = 0;
        // _holdGen: counts the holds; a caller that keeps state per hold (the focus
        // chain in lib/app/app.js) compares it instead of guessing where a hold ended
        this._holdGen = 0;
        this._pressSeq = 0;
        this._pressDropLogged = false;
    }

    /**
     * The current hold's number (it grows with every hold that opens).
     * @returns {number}
     */
    holdGeneration() {
        return this._holdGen;
    }

    /**
     * Whether the shell's workspace-switch effect may still own the window actors
     * (see SWITCH_POLL_MS): a frame moved now would be drawn at its old place.
     * @returns {boolean}
     */
    switching() {
        return this._switchTimer !== 0;
    }

    /**
     * Runs `fn(opts)` now, or — while the switch effect runs — once it ended. One held
     * run per key: a newer request for the same key replaces the older one and moves
     * to the end, so the held runs replay in the order of their newest request (the
     * settle fan-out relies on the active surface being placed last). Options of the
     * replaced request survive where the newer one leaves them empty: an option the
     * newer request sets to null, undefined or false takes the older value, so a
     * settle or an explicit arrangement is never lost to a plain retile.
     * @param {string} key the surface (monitor and workspace)
     * @param {(opts: AnyRecord) => void} fn
     * @param {AnyRecord} [opts]
     */
    afterSwitch(key, fn, opts = {}) {
        if (this._switchTimer === 0) {
            fn(opts);
            return;
        }
        const older = this._afterSwitch.get(key);
        /** @type {AnyRecord} */
        const merged = Object.assign({}, older ? older.opts : {});
        for (const name of Object.keys(opts)) {
            const v = opts[name];
            if (v !== null && v !== undefined && v !== false) {
                merged[name] = v;
            }
            else if (!(name in merged)) {
                merged[name] = v;
            }
        }
        this._afterSwitch.delete(key);
        this._afterSwitch.set(key, { fn: fn, opts: merged });
    }

    /**
     * A key press that reads or moves tiled geometry: run now, or — inside the switch
     * effect — queued behind every held retile, in press order. The surfaces it reads
     * are only settled once the held retiles ran; a press answered from the frames
     * before that lands one cell off, or arranges against a placement record of the
     * wrong count. At most SWITCH_PRESS_CAP presses wait per hold; a flood beyond that
     * is dropped (one log line per hold).
     * @param {() => void} fn
     */
    afterSwitchPress(fn) {
        if (this._switchTimer !== 0) {
            let held = 0;
            for (const key of this._afterSwitch.keys()) {
                if (key.startsWith('press\n')) {
                    held += 1;
                }
            }
            if (held >= SWITCH_PRESS_CAP) {
                if (!this._pressDropLogged) {
                    this._pressDropLogged = true;
                    this._global.log('greenTile workspace switch hold: more than ' + SWITCH_PRESS_CAP + ' presses, dropping the rest');
                }
                return;
            }
        }
        this._pressSeq += 1;
        this.afterSwitch('press\n' + this._pressSeq, () => fn());
    }

    // Whether the shell's switch effect still runs: Cinnamon marks every actor it
    // animates with origX and an x/y ease, and its cleanup removes both. An origX
    // without a live ease (the ease cancelled by another shell effect, which skips the
    // cleanup) does not count, or every later switch would wait for the cap.
    /** @returns {boolean} */
    _effectRunning() {
        try {
            return this._global.get_window_actors().some((/** @type {AnyRecord} */ a) => a.origX !== undefined
                && typeof a.get_transition === 'function' && Boolean(a.get_transition('x') || a.get_transition('y')));
        }
        catch (_e) {
            return false;
        }
    }

    _monotonicMs() {
        try {
            // glib is a required dependency; the guard only serves unit tests that
            // build an Auto from a partial dependency set
            return this._deps.glib ? this._deps.glib.get_monotonic_time() / 1000 : 0;
        }
        catch (_e) {
            return 0;
        }
    }

    // A switch (re)starts the hold: a switch inside a running effect cancels the running
    // eases (environment.js _easeActor removes them without their onComplete), keeps
    // the first origX and animates on from there, so the hold ends with the LAST effect.
    _noteSwitch() {
        if (this._destroyed) {
            return;
        }
        // Without animations, or under a modal, the shell runs no effect at all
        // (windowManager.js _switchWorkspace: !Main.animations_enabled || Main.modalCount)
        // and nothing needs to wait.
        if (this._main.animations_enabled === false || this._main.modalCount > 0) {
            return;
        }
        // Cinnamon's handler already ran (see SWITCH_POLL_MS): a switch while no effect
        // owns an actor (empty workspaces, only sticky windows) needs no hold. While an
        // earlier effect still runs, the look is restarted (it comes 16 ms later anyway).
        if (!this._effectRunning()) {
            return;
        }
        this._openHold(SWITCH_POLL_MS);
    }

    /**
     * Opens (or restarts) the hold: the first look after `ms`.
     * @param {number} ms
     */
    _openHold(ms) {
        if (this._switchTimer !== 0) {
            // a chain of switches does not extend the hold past SWITCH_HOLD_TOTAL_MS:
            // the running look keeps its schedule and ends the hold
            if (this._monotonicMs() - this._holdSince >= SWITCH_HOLD_TOTAL_MS) {
                return;
            }
            try {
                this._mainloop.source_remove(this._switchTimer);
            }
            catch (e) {
                this._global.logError('greenTile: switch timer not removed: ' + e);
            }
        }
        else {
            this._holdSince = this._monotonicMs();
            this._holdGen += 1;
            this._pressDropLogged = false;
        }
        this._switchTimer = 0;
        this._armSwitchEnd(ms, ms);
    }

    /**
     * @param {number} ms the wait before the next look
     * @param {number} elapsed the time the hold has lasted once that wait is over
     */
    _armSwitchEnd(ms, elapsed) {
        this._switchTimer = this._mainloop.timeout_add(ms, () => {
            // cleared first: whatever follows, no dead source id keeps the hold on
            this._switchTimer = 0;
            if (!this._destroyed && elapsed < SWITCH_EFFECT_CAP_MS && this._effectRunning()) {
                this._armSwitchEnd(SWITCH_POLL_MS, elapsed + SWITCH_POLL_MS);
                return false;
            }
            const held = Array.from(this._afterSwitch.entries());
            this._afterSwitch.clear();
            if (this._destroyed) {
                return false;
            }
            // The held retiles consume the swap's sort overrides: the time an override
            // spent inside the hold must not count against its freshness window. The
            // landing override of a push is set right AFTER the hold opened, so each
            // override is shifted by its own share of the hold — never past now.
            const now = this._monotonicMs();
            for (const o of this._overrides.values()) {
                const waited = now - Math.max(o.at, this._holdSince);
                if (waited > 0) {
                    o.at += waited;
                }
            }
            // each held run on its own: one failing surface must not drop the others
            let ran = 0;
            for (let i = 0; i < held.length; i++) {
                if (this._destroyed) {
                    break;
                }
                if (this._switchTimer !== 0) {
                    // A replayed run switched the workspace again (a held push): a new
                    // effect owns the actors. The rest waits for it, BEHIND what that run
                    // just held, so retiles still come before the presses after them.
                    this._rehold(held.slice(i));
                    break;
                }
                const [, run] = held[i];
                try {
                    run.fn(run.opts);
                }
                catch (e) {
                    this._global.logError('greenTile retile after workspace switch failed: ' + e);
                }
                ran += 1;
            }
            if (ran > 0) {
                this._global.log('greenTile retile after workspace switch n=' + ran);
            }
            return false;
        });
    }

    /**
     * Puts runs of a finished hold behind the ones a new hold collected meanwhile. A
     * key held in both keeps the NEWER run and its options win; the older options fill
     * in what it leaves empty (the afterSwitch merge rule, applied in time order).
     * @param {Array<[string, {fn: (opts: AnyRecord) => void, opts: AnyRecord}]>} rest
     */
    _rehold(rest) {
        for (const [key, run] of rest) {
            const newer = this._afterSwitch.get(key);
            if (!newer) {
                this._afterSwitch.set(key, run);
                continue;
            }
            /** @type {AnyRecord} */
            const merged = Object.assign({}, run.opts);
            for (const name of Object.keys(newer.opts)) {
                const v = newer.opts[name];
                if ((v !== null && v !== undefined && v !== false) || !(name in merged)) {
                    merged[name] = v;
                }
            }
            newer.opts = merged;
        }
    }

    // Per-monitor debounce: every monitor has its own pending timer, so a burst on one
    // monitor does not delay or cancel a retile on another. The timer re-checks that the
    // monitor still exists and that automatic tiling is still on for the active workspace.
    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} ms
     */
    scheduleMonitor(app, monitorIndex, ms) {
        const existing = this._timers.get(monitorIndex);
        if (existing) {
            this._mainloop.source_remove(existing);
            this._timers.delete(monitorIndex);
        }
        this._timers.set(monitorIndex, this._mainloop.timeout_add(ms, () => {
            this._timers.delete(monitorIndex);
            // A destroyed Auto is dead even if this source could not be removed:
            // the App is being torn down, so touch nothing (its settings are
            // finalized just after).
            if (this._destroyed) {
                return false;
            }
            // The App is recreated when monitors change, so indexes never survive a change;
            // a timer for a monitor that is gone (or no longer ready) must do nothing.
            if (!app.monitors.ready || !this._main.layoutManager.monitors[monitorIndex]) {
                return false;
            }
            const wsIndex = this._global.workspace_manager.get_active_workspace().index();
            // A retained intent for this monitor+workspace outranks the stored
            // setting: apply it now that a retile is due (the layouts setting may
            // have been repaired since), and gate the retile on what it says.
            if (!this._applyOrHonorPending(app, monitorIndex, wsIndex)) {
                return false;
            }
            if (this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
                this._deps.retileMonitor(app, monitorIndex, null);
            }
            return false;
        }));
    }

    /**
     * @param {AppFacade} app
     * @param {number} ms
     */
    scheduleAll(app, ms) {
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const count = this._main.layoutManager.monitors.length;
        for (let i = 0; i < count; i++) {
            if (this._deps.layoutFor(app, i, wsIndex).auto) {
                this.scheduleMonitor(app, i, ms);
            }
        }
    }

    /**
     * The settle fan-out: by the time the settle wait expires Muffin has moved the
     * windows of EVERY workspace — a Cinnamon restart re-manages them all, a monitor
     * change parks them on the remaining monitor and moves them back — so the settle
     * must place every workspace greenTile tiles, not only the active one. Otherwise
     * a background workspace stays where Muffin left it until the user visits it.
     * The active workspace keeps the debounced path (it applies a retained intent
     * first and animates); the background workspaces are placed right here, without
     * animation. A paused workspace stays untouched: the retile gates on autoAllowed.
     * On a monitor whose workspaces live on the primary only, every numbered
     * workspace resolves to the same surface: it is placed once.
     * @param {AppFacade} app
     */
    settleAll(app) {
        // The recorded order is read asynchronously, and this fan-out is the retile
        // that restores it. Waiting for the store here keeps the startup restore from
        // being missed by the one pass that was meant to use it. The wait always ends:
        // a store resolves on a successful read, a failed one and a missing file alike.
        if (app.orders.ready !== true) {
            if (!this._settleWaiting) {
                this._settleWaiting = true;
                app.orders.onReady(() => {
                    this._settleWaiting = false;
                    this.settleAll(app);
                });
            }
            return;
        }
        this._settleAllNow(app);
    }

    /**
     * The fan-out body: runs once the store is known.
     * @param {AppFacade} app
     */
    _settleAllNow(app) {
        const activeWs = this._global.workspace_manager.get_active_workspace().index();
        this.scheduleAll(app, 0);
        const monitors = this._main.layoutManager.monitors.length;
        const workspaces = this._global.workspace_manager.get_n_workspaces();
        /** @type {Set<string>} */
        const placed = new Set();
        for (let i = 0; i < monitors; i++) {
            const mkey = app.monitors.keys[i];
            if (!mkey) {
                continue;
            }
            for (let ws = 0; ws < workspaces; ws++) {
                if (ws === activeWs) {
                    // the debounced active path above covers it
                    continue;
                }
                // layoutFor's auto is exactly "a preset is assigned, or auto tiling
                // was switched on explicitly" — the same gate retileMonitor applies
                if (!this._deps.layoutFor(app, i, ws).auto) {
                    continue;
                }
                const surface = mkey + '\n' + app.monitors.wsKey(i, ws);
                if (placed.has(surface)) {
                    continue;
                }
                placed.add(surface);
                this._deps.retileMonitor(app, i, null, false, ws, null, true);
            }
            // Inside a held switch effect the debounced active pass above resolves its
            // workspace only when it replays — a further switch meanwhile would leave
            // TODAY's active workspace without its settle, so it is held explicitly as
            // well. The debounced pass still follows it (its 0 ms timer parks later,
            // under the monitor's 'active' key): it re-places the same rects, which
            // leaves the frames as they are. A surface the loop above already placed
            // (workspaces shared on a non-primary monitor) is not placed twice.
            const activeSurface = mkey + '\n' + app.monitors.wsKey(i, activeWs);
            if (this.switching() && !placed.has(activeSurface) && this._deps.layoutFor(app, i, activeWs).auto) {
                placed.add(activeSurface);
                this._deps.retileMonitor(app, i, null, false, activeWs, null, true);
            }
        }
    }

    // Automatic tiling is switched per monitor and workspace (stored in the layouts
    // setting): Super+Ctrl+A turns it on for the focused monitor and the active workspace
    // and tiles right away (with the preset if one is assigned, otherwise with the auto
    // grid); pressing it again just tiles again. Super+Ctrl+D turns it off; that also
    // pauses a preset, which stays assigned and comes back with Super+Ctrl+A.
    // The hotkeys exist before the asynchronous monitor reply fills the registry,
    // but a layout write needs the monitor key. Until it is there the command
    // cannot be written: rather than dropping it and still reporting success, the
    // intent is queued on the session (which survives an App recreation) and
    // applied by applyPending() before the first retile. _monitorWritable mirrors
    // the guard layoutSet applies internally.
    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @returns {boolean}
     */
    _monitorWritable(app, monitorIndex) {
        return app.monitors.ready && !!app.monitors.keys[monitorIndex];
    }

    /**
     * Stores an auto on/off command for its monitor+workspace slot, newest wins: the
     * intent already retained for the slot is dropped, the new one appended. The one
     * enqueue path — reached both when the registry cannot address the target yet and
     * when the layout guard refused the write (a corrupt layouts setting). The queue
     * stays bounded by the monitor/workspace count, so a held hotkey cannot grow it.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {boolean} auto
     */
    _retainAuto(app, monitorIndex, wsIndex, auto) {
        this._dropIntent(app, monitorIndex, wsIndex);
        app.session.pendingAuto.push({ monitorIndex: monitorIndex, wsIndex: wsIndex, auto: auto });
    }

    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {boolean} auto
     */
    _deferAuto(app, monitorIndex, wsIndex, auto) {
        this._retainAuto(app, monitorIndex, wsIndex, auto);
        this._global.log('greenTile auto tiling ' + (auto ? 'on' : 'off') + ' pending until monitors ready for ws' + wsIndex);
    }

    /**
     * The retained intent for that monitor+workspace, if any.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {{monitorIndex: number, wsIndex: number, auto: boolean} | undefined}
     */
    _pendingIntent(app, monitorIndex, wsIndex) {
        // newest wins: the queue can hold two numbered workspaces of one shared
        // slot, and the old one must never be the one found
        app.session.normalizePending(app);
        return app.session.pendingAuto.find(
            (c) => app.session.sameSlot(app, c.monitorIndex, c.wsIndex, monitorIndex, wsIndex));
    }

    /**
     * Drops the retained intent for that key: an explicit command that took effect
     * (or a newer explicit command) supersedes it, one per monitor+workspace.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     */
    _dropIntent(app, monitorIndex, wsIndex) {
        app.session.dropIntent(app, monitorIndex, wsIndex);
    }

    /**
     * Retains an intent the layout guard REFUSED (a corrupt layouts setting): the
     * newest explicit command is the pending one, so it replaces any older one and
     * is applied once the setting can take it.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {boolean} auto
     */
    _holdRefused(app, monitorIndex, wsIndex, auto) {
        this._retainAuto(app, monitorIndex, wsIndex, auto);
        this._global.log('greenTile auto tiling ' + (auto ? 'on' : 'off') + ' retained for ws' + wsIndex + ': the layouts setting refused it');
    }

    /**
     * Applies an explicit auto on/off command: writes it when the registry can
     * address the monitor, then drops the retained intent for that slot — removed
     * ONLY once the write actually landed, so a refused write (a corrupt layouts
     * setting) leaves the intent in place. The one successful-write/removal path.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {boolean} auto
     * @returns {boolean} whether the command was written
     */
    _applyAuto(app, monitorIndex, wsIndex, auto) {
        if (!this._monitorWritable(app, monitorIndex)
            || !this._deps.layoutSet(app, monitorIndex, wsIndex, { auto: auto })) {
            return false;
        }
        this._dropIntent(app, monitorIndex, wsIndex);
        return true;
    }

    /**
     * Applies a retained intent that outranks the stored setting — one held while
     * the layouts setting was corrupt — and reports whether an automatic retile may
     * proceed for that monitor+workspace. A retained PAUSE that still cannot be
     * written returns false: the stored `auto` would otherwise place windows
     * against the user's last command.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {boolean}
     */
    _applyOrHonorPending(app, monitorIndex, wsIndex) {
        const pending = this._pendingIntent(app, monitorIndex, wsIndex);
        if (!pending) {
            return true;
        }
        if (this._applyAuto(app, monitorIndex, wsIndex, pending.auto)) {
            this._global.log('greenTile retained auto tiling ' + (pending.auto ? 'on' : 'off') + ' for ws' + wsIndex);
            return true;
        }
        return pending.auto !== false;
    }

    /**
     * Applies the auto on/off commands queued before the registry was ready —
     * called by the monitor-ready callback after connectAll and before the settle
     * retile, so no automatic tiling runs against a requested pause. Each intent
     * leaves the queue only once the layout write actually happened, so a throw
     * mid-way (or a refusal by the layout guard, e.g. a corrupt layouts setting)
     * keeps it queued for the next monitor-ready; an intent whose monitor no
     * longer exists is dropped (there is no key to address it, and nothing ever
     * will be).
     * @param {AppFacade} app
     */
    applyPending(app) {
        app.session.normalizePending(app);
        if (app.session.pendingAuto.length === 0) {
            return;
        }
        // EVERY state write lands before any effect: a retile places in the ACTIVE
        // workspace (retileMonitor takes no workspace), and that may differ from the
        // workspace a command was issued for — retiling inside this loop would
        // place windows into a workspace a later retained command just paused.
        // Iterate a snapshot: _applyAuto removes from the live queue and
        // Session.dropIntent REPLACES that array, so iterating it in place is unsafe.
        const applied = [];
        for (const cmd of app.session.pendingAuto.slice()) {
            if (!this._monitorWritable(app, cmd.monitorIndex)) {
                // no key can ever address it: discard (never applied, never logged)
                this._dropIntent(app, cmd.monitorIndex, cmd.wsIndex);
                continue;
            }
            // A refused write is NOT a success: _applyAuto leaves the intent retained
            // (and no effect follows) until the layout setting can take it.
            if (this._applyAuto(app, cmd.monitorIndex, cmd.wsIndex, cmd.auto)) {
                this._global.log('greenTile auto tiling ' + (cmd.auto ? 'on' : 'off') + ' for ws' + cmd.wsIndex);
                applied.push(cmd);
            }
        }
        if (applied.length === 0) {
            return;
        }
        const activeWs = this._global.workspace_manager.get_active_workspace().index();
        for (const cmd of applied) {
            if (cmd.auto) {
                // A retile places in the ACTIVE workspace, so it may run only for a
                // command that ADDRESSES that workspace (active-only contract) and
                // only where that workspace is still on: an On for an inactive
                // workspace must not tile the one the user is looking at.
                if (app.session.sameSlot(app, cmd.monitorIndex, cmd.wsIndex, cmd.monitorIndex, activeWs)
                    && this._deps.layoutFor(app, cmd.monitorIndex, activeWs).auto) {
                    this._deps.retileMonitor(app, cmd.monitorIndex, null, true, activeWs);
                }
            }
            else {
                // no retile follows auto off — the border has no geometry event to
                // hide it, so refresh right here (the border update lives in
                // lib/runtime/border.js but is only ever CALLED at runtime)
                this._deps.borderUpdate();
            }
        }
    }

    /** @param {AppFacade} app */
    activate(app) {
        const focusWindow = this._deps.focusWindow();
        const monitorIndex = focusWindow ? focusWindow.get_monitor() : this._main.layoutManager.primaryIndex;
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._monitorWritable(app, monitorIndex)) {
            this._deferAuto(app, monitorIndex, wsIndex, true);
            return;
        }
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            // a refused write (corrupt layouts) must not be reported as success
            // nor retiled against: the stored state is still off, and the newest
            // explicit command is retained for when the setting can take it
            if (!this._applyAuto(app, monitorIndex, wsIndex, true)) {
                this._holdRefused(app, monitorIndex, wsIndex, true);
                return;
            }
            this._global.log('greenTile auto tiling on for ws' + wsIndex);
        }
        else {
            // already on: the explicit command took effect and supersedes anything
            // retained for it, without an unnecessary settings write
            this._dropIntent(app, monitorIndex, wsIndex);
        }
        this._pending.delete(monitorIndex);
        this._deps.retileMonitor(app, monitorIndex, focusWindow);
    }

    /** @param {AppFacade} app */
    deactivate(app) {
        const monitorIndex = this._deps.focusMonitorIndex();
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._monitorWritable(app, monitorIndex)) {
            this._deferAuto(app, monitorIndex, wsIndex, false);
            return;
        }
        // the explicit command writes and supersedes anything retained for it;
        // a refused write (corrupt layouts) retains the newest command instead
        if (!this._applyAuto(app, monitorIndex, wsIndex, false)) {
            this._holdRefused(app, monitorIndex, wsIndex, false);
            return;
        }
        this._pending.delete(monitorIndex);
        this._global.log('greenTile auto tiling off for ws' + wsIndex);
        // no retile follows auto off — the border has no geometry event to hide it,
        // so refresh right here (the border update lives in lib/runtime/border.js but
        // is only ever CALLED at runtime)
        this._deps.borderUpdate();
    }

    /**
     * @param {AppFacade} app
     * @param {AnyRecord} ws
     * @param {CinnamonWindow} w
     */
    onWindowAdded(app, ws, w) {
        if (ws !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL) {
            return;
        }
        const monitorIndex = w.get_monitor();
        let pending = this._pending.get(monitorIndex);
        if (!pending) {
            pending = new Set();
            this._pending.set(monitorIndex, pending);
        }
        pending.add(w.get_stable_sequence());
        this._lastMonitor.set(w.get_stable_sequence(), monitorIndex);
        this.scheduleMonitor(app, monitorIndex, 300);
    }

    /**
     * @param {AppFacade} app
     * @param {AnyRecord} ws
     * @param {CinnamonWindow} w
     */
    onWindowRemoved(app, ws, w) {
        if (ws !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        if (w == null) {
            return;
        }
        // The wrapper may already be destroyed; its stable sequence still maps to the
        // monitor the window was last seen on — without a record there is nothing to retile.
        let seq;
        try {
            seq = w.get_stable_sequence();
        }
        catch (_e) {
            return;
        }
        const monitorIndex = this._lastMonitor.get(seq);
        if (monitorIndex === undefined) {
            return;
        }
        // The window cannot be re-appended: drop its fresh record, so the per-monitor
        // sets stay bounded on a paused monitor, where no retile ever drains them.
        this.pendingForget(seq);
        this.scheduleMonitor(app, monitorIndex, 300);
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    onGrabBegin(app, w, op) {
        if (!this._windowOk(w)) {
            return;
        }
        if (this._deps.grabIsResize(op)) {
            // Frame at grab start identifies the cell the window was tiled into.
            const f = w.get_frame_rect();
            this._resizeStart.set(w.get_stable_sequence(), { rect: [f.x, f.y, f.width, f.height], monitor: w.get_monitor() });
            return;
        }
        if (op !== this._meta.GrabOp.MOVING && op !== this._meta.GrabOp.KEYBOARD_MOVING) {
            return;
        }
        this._deps.dropBegin(app, w, op);
        const seq = w.get_stable_sequence();
        this._grabMonitor.set(seq, w.get_monitor());
        const f = w.get_frame_rect();
        this._moveStart.set(seq, [f.x, f.y, f.width, f.height]);
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    onGrabEnd(app, w, op) {
        if (!this._windowOk(w)) {
            return;
        }
        if (this._deps.grabIsResize(op)) {
            this._deps.resizeEnd(app, w, op);
            return;
        }
        if (op !== this._meta.GrabOp.MOVING && op !== this._meta.GrabOp.KEYBOARD_MOVING) {
            return;
        }
        const seq = w.get_stable_sequence();
        const started = this._moveStart.get(seq);
        this._moveStart.delete(seq);
        if (this._deps.dropEnd(app, w, op)) {
            return;
        }
        // A plain click dropped nothing and moved nothing: there is no new cell to snap
        // to, and re-placing the surface would only move the tiles that are already
        // right (and snap back any pixel a focus or an increment rounding shifted).
        const f = w.get_frame_rect();
        if (started && Math.abs(f.x - started[0]) <= GRAB_MOVE_TOLERANCE
            && Math.abs(f.y - started[1]) <= GRAB_MOVE_TOLERANCE
            && Math.abs(f.width - started[2]) <= GRAB_MOVE_TOLERANCE
            && Math.abs(f.height - started[3]) <= GRAB_MOVE_TOLERANCE) {
            this._grabMonitor.delete(seq);
            return;
        }
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        const from = this._grabMonitor.get(seq);
        this._grabMonitor.delete(seq);
        const to = w.get_monitor();
        // Manual moves can cross monitors: both the monitor at grab start and the one at
        // release may need a retile (one call when equal, per-monitor timers anyway).
        if (from !== undefined && from !== to) {
            this.scheduleMonitor(app, from, 250);
        }
        this.scheduleMonitor(app, to, 250);
    }

    // Minimizing does NOT fire workspace window-removed (the window stays on its
    // workspace), and Meta.Display has no 'window-minimize' signal in muffin 6.6 —
    // the canonical way (Cinnamon's own windowManager.js:419) is per-window
    // 'notify::minimized', wired for every window and new windows via window-created.
    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     */
    onMinimizedNotify(app, w) {
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL) {
            return;
        }
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        this.scheduleMonitor(app, w.get_monitor(), 300);
    }

    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {CinnamonWindow} w
     */
    onEnteredMonitor(app, monitorIndex, w) {
        if (w == null) {
            return;
        }
        this._lastMonitor.set(w.get_stable_sequence(), monitorIndex);
        // Muffin moving windows across monitors restarts the settle wait while it runs.
        if (app.session.settle.started) {
            app.session.settle.start(app);
        }
    }

    /** @param {CinnamonWindow} w */
    _windowOk(w) {
        return w != null && !w.minimized && w.get_wm_class() != null
            && w.get_window_type() === this._meta.WindowType.NORMAL;
    }

    /** @param {any[]} args */
    _anyWindow(args) {
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a && a.get_wm_class) {
                return a;
            }
        }
        return null;
    }

    /** @param {CinnamonWindow} w */
    _untrack(w) {
        const idx = this._tracked.findIndex(([tw]) => tw === w);
        if (idx === -1) {
            return;
        }
        const [_, mid, uid, seq] = this._tracked[idx];
        // stopping the tracking does NOT remove the window's ad-hoc exclusion:
        // it lives on the session until the user toggles again or the window
        // closes (its own close watch, exclusions.js) — waived here even when
        // the trigger is the App's destruction. Each id is attempted on its own:
        // the pair is only ever half-connectable, so a throwing first disconnect
        // must not abandon the second one.
        for (const id of [mid, uid]) {
            try {
                w.disconnect(id);
            }
            catch (_e) {
                // window already destroyed — wrapper invalid, nothing to clean
            }
        }
        this._lastMonitor.delete(seq);
        this._grabMonitor.delete(seq);
        this._moveStart.delete(seq);
        this._resizeStart.delete(seq);
        // The close path is the guaranteed one: window-removed may arrive on an
        // inactive workspace, or after this handler. Drop the fresh record here too,
        // so the per-monitor sets stay bounded on a paused monitor where no retile
        // ever drains them — independent of Muffin's signal order.
        this.pendingForget(seq);
        this._tracked.splice(idx, 1);
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     */
    trackWindow(app, w) {
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL) {
            return;
        }
        if (this._tracked.some(([tw]) => tw === w)) {
            return;
        }
        // Read the wrapper-derived values BEFORE connecting: a destroyed wrapper
        // throws here, when no handler exists yet to leak. The two connects are
        // acquired as a pair — a failure on the second releases the first, so the
        // window never carries a handler the teardown does not own.
        const seq = w.get_stable_sequence();
        const monitor = w.get_monitor();
        let mid = 0;
        let uid = 0;
        try {
            mid = w.connect('notify::minimized', () => this.onMinimizedNotify(app, w));
            // closing a window mid-animation must not leave a placement owner
            // behind (the actor may already be gone — the owner tolerates that)
            uid = w.connect('unmanaged', () => {
                this._untrack(w);
                app.placement.release(w);
            });
        }
        catch (e) {
            if (mid) {
                try {
                    w.disconnect(mid);
                }
                catch (_e) {
                    // window already destroyed — wrapper invalid, nothing to clean
                }
            }
            throw e;
        }
        // Spec: a tracked window records its monitor when it is tracked — the close
        // path needs it because the window is gone when window-removed arrives.
        this._lastMonitor.set(seq, monitor);
        this._tracked.push([w, mid, uid, seq]);
    }

    _disconnectWorkspaces() {
        disconnectEach(this._workspaceSignals);
        this._workspaceSignals = [];
    }

    /**
     * @param {AppFacade} app
     * @param {AnyRecord} ws
     */
    _connectWorkspace(app, ws) {
        const a = ws.connect('window-added', (/** @type {AnyRecord} */ ws_, /** @type {CinnamonWindow} */ w) => this.onWindowAdded(app, ws_, w));
        let r = 0;
        try {
            r = ws.connect('window-removed', (/** @type {AnyRecord} */ ws_, /** @type {CinnamonWindow} */ w) => this.onWindowRemoved(app, ws_, w));
        }
        catch (e) {
            // the pair is owned as a unit: a failed second connect must not leave
            // the first handler behind (it would survive destroy, which walks the
            // recorded list only)
            try {
                ws.disconnect(a);
            }
            catch (_e) {
                // the workspace was already gone
            }
            throw e;
        }
        this._workspaceSignals.push([ws, a, r]);
    }

    /** @param {AppFacade} app */
    connectAll(app) {
        // All-or-nothing: a throw part-way through (a failed per-window or
        // per-workspace connect, a destroyed wrapper in the existing-window pass)
        // must not leave a half-started observer set. The rollback restores the
        // pre-attempt state and reports whether the release was clean; a release
        // that left entries behind is logged, because the App rollback that
        // follows (Config's ready boundary) is the only remaining owner of them.
        try {
            this._connectAll(app);
        }
        catch (e) {
            if (!this._rollbackConnectAll()) {
                this._global.logError('greenTile observer rollback left entries behind');
            }
            throw e;
        }
    }

    /** @param {AppFacade} app */
    _connectAll(app) {
        const n = this._global.workspace_manager.get_n_workspaces();
        for (let i = 0; i < n; i++) {
            this._connectWorkspace(app, this._global.workspace_manager.get_workspace_by_index(i));
        }
        this._scope.connect(this._global.workspace_manager, 'notify::n-workspaces', () => {
            // Workspace set changed: drop and reconnect all (old objects may be
            // gone). The reconnect is all-or-nothing like the first pass — a
            // failing connect must not leave a partial workspace set behind.
            this._disconnectWorkspaces();
            const n2 = this._global.workspace_manager.get_n_workspaces();
            try {
                for (let j = 0; j < n2; j++) {
                    this._connectWorkspace(app, this._global.workspace_manager.get_workspace_by_index(j));
                }
            }
            catch (e) {
                this._disconnectWorkspaces();
                this._global.logError('greenTile workspace reconnect failed: ' + e);
            }
        });
        // Muffin 6.6 emits grab-op-begin/end as (display, display, window, op) — the
        // display is passed twice (legacy screen slot). Verified via live signal probe.
        this._scope.connect(this._global.display, 'grab-op-begin', (/** @type {AnyRecord} */ display, /** @type {AnyRecord} */ display2, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => this.onGrabBegin(app, w, op));
        this._scope.connect(this._global.display, 'grab-op-end', (/** @type {AnyRecord} */ display, /** @type {AnyRecord} */ display2, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => this.onGrabEnd(app, w, op));
        // Cross-monitor moves: (monitor index, MetaWindow), signature verified live
        // via GObject.signal_query.
        this._scope.connect(this._global.display, 'window-entered-monitor', (/** @type {AnyRecord} */ display, /** @type {number} */ monitorIndex, /** @type {CinnamonWindow} */ w) => this.onEnteredMonitor(app, monitorIndex, w));
        // Arg scan by duck typing guards against muffin signature quirks (grab-op
        // passes the display twice). window-created wires minimize tracking for
        // new windows; existing ones are tracked below.
        this._scope.connect(this._global.display, 'window-created', (/** @type {any} */ ...args) => this.trackWindow(app, this._anyWindow(args)));
        const wn = this._global.workspace_manager.get_n_workspaces();
        for (let i = 0; i < wn; i++) {
            const wl = this._global.workspace_manager.get_workspace_by_index(i).list_windows();
            for (let j = 0; j < wl.length; j++) {
                this.trackWindow(app, wl[j]);
            }
        }
        // Switching onto a preset workspace retiles there (Cinnamon's own
        // windowManager.js:358 uses this signal with (wm, from, to, direction)).
        // The same signal starts the shell's switch effect (connected before this one):
        // retiles asked for while it runs wait for its end (SWITCH_POLL_MS).
        this._scope.connect(this._global.window_manager, 'switch-workspace', (/** @type {AnyRecord} */ _wm, /** @type {AnyRecord} */ _from, /** @type {AnyRecord} */ _to) => {
            this._noteSwitch();
            this.scheduleAll(app, 300);
        });
        // An App (re)created while a switch effect still runs (monitors-changed, the
        // asynchronous monitor reply) missed its signal: hold from here on as well.
        if (this._effectRunning()) {
            this._openHold(SWITCH_POLL_MS);
        }
    }

    /**
     * Releases every acquisition connectAll made and rebuilds the scope.
     * @returns {boolean} whether the release was clean (the scope's signal manager
     *   is empty again), i.e. whether a retry may safely re-register
     */
    _rollbackConnectAll() {
        this._disconnectWorkspaces();
        for (const [w] of this._tracked.slice()) {
            this._untrack(w);
        }
        // The scope rebuild is best-effort: a throwing destroy must not replace
        // the error that sent us here (the caller reports the original one).
        try {
            this._scope.destroy();
        }
        catch (e) {
            this._global.logError('greenTile observer scope rollback failed: ' + e);
        }
        const clean = this._deps.signalManager.getSignals().length === 0;
        this._scope = createScope({
            signalManager: this._deps.signalManager,
            mainloop: this._deps.mainloop,
            gobject: this._deps.gobject,
        });
        return clean;
    }

    // new windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Returns the pending set so far and
    // resets it; cleared after each tiling.
    /** @param {number} monitorIndex */
    pendingTake(monitorIndex) {
        const pending = this._pending.get(monitorIndex) || new Set();
        this._pending.set(monitorIndex, new Set());
        return pending;
    }

    // A successful Drop placed the window explicitly: forget exactly its fresh
    // record, so the next retile does not re-append it at the end. The record is
    // keyed by the monitor the window opened on, which need not be the drop target
    // (cross-monitor drag) — and a window carried to another active workspace can
    // sit under more than one monitor key, so every set is swept. Uninvolved fresh
    // windows keep their records.
    /**
     * @param {number} seq
     */
    pendingForget(seq) {
        for (const pending of this._pending.values()) {
            pending.delete(seq);
        }
    }

    // { rect, monitor } at grab start, dropped on read — an edge resize is consumed once.
    /** @param {number} seq */
    resizeStartTake(seq) {
        const start = this._resizeStart.get(seq);
        this._resizeStart.delete(seq);
        return start;
    }

    // Sort-override state for the tiling reading order: expired entries are
    // pruned on every read, an override handed out is deleted and only honoured while
    // fresh — the exact previous inline semantics.
    /**
     * @param {number} seq
     * @param {Rect} rect
     * @param {number} now
     */
    sortOverride(seq, rect, now) {
        this._overrides.set(seq, { rect: rect, at: now });
    }

    /**
     * @param {number} seq
     * @param {number} now
     */
    sortTake(seq, now) {
        const o = this._overrides.get(seq);
        if (o) {
            this._overrides.delete(seq);
            if (now - o.at <= SORT_OVERRIDE_MS) {
                return o.rect;
            }
        }
        return null;
    }

    // Read-only counterpart of sortTake for callers that place no window (focus
    // navigation): the override stays in place for the retile that does consume
    // it. Callers run sortPoll first (sortReadingOrder does), so expired entries
    // never accumulate.
    /**
     * @param {number} seq
     * @param {number} now
     */
    sortPeek(seq, now) {
        const o = this._overrides.get(seq);
        if (o && now - o.at <= SORT_OVERRIDE_MS) {
            return o.rect;
        }
        return null;
    }

    /** @param {number} seq */
    sortClear(seq) {
        this._overrides.delete(seq);
    }

    /** @param {number} now */
    sortPoll(now) {
        for (const [seq, o] of this._overrides)
            {if (now - o.at > SORT_OVERRIDE_MS)
                {this._overrides.delete(seq);}}
    }

    destroy() {
        // Marked first: a debounce timer whose source_remove throws below may
        // still fire once, and its callback must do nothing then.
        this._destroyed = true;
        // The animated-placement resources are NOT released here: they live on
        // the per-App placement owner, which covers every placement — including
        // the ones that happened before the asynchronous monitor reply filled
        // these tracked lists.
        // Untracking comes FIRST so it never depends on the teardown below: every
        // tracked window is disconnected here (a throwing disconnect is tolerated
        // per window inside _untrack), so no window handler keeps the dead Auto
        // reachable while the work below runs.
        for (const [w] of this._tracked.slice()) {
            this._untrack(w);
        }
        // Each timer removal and dropStop run on their own: a throwing
        // source_remove or a throwing dropStop must not skip the remaining timer
        // removals or the scope release below — those would leave signal callbacks
        // into the destroyed App.
        for (const id of this._timers.values()) {
            try {
                this._mainloop.source_remove(id);
            }
            catch (e) {
                // The cause is NOT assumed: the source may already be gone, or it
                // may survive and fire once more — the callback's _destroyed check
                // makes that fire inert. Report it rather than hide it.
                this._global.logError('greenTile: auto timer not removed: ' + e);
            }
        }
        this._timers.clear();
        if (this._switchTimer !== 0) {
            try {
                this._mainloop.source_remove(this._switchTimer);
            }
            catch (e) {
                // inert if it still fires: its callback checks _destroyed
                this._global.logError('greenTile: switch timer not removed: ' + e);
            }
            this._switchTimer = 0;
        }
        // Held runs die with the App: a retile is owed again by the settle that
        // follows an App recreation, a held key press is simply lost (accepted).
        this._afterSwitch.clear();
        this._pending.clear();
        this._lastMonitor.clear();
        this._grabMonitor.clear();
        this._moveStart.clear();
        this._resizeStart.clear();
        try {
            this._deps.dropStop();
        }
        catch (_e) {
            // drop teardown is best effort and reports itself: Config.destroy runs
            // drop's own step later in the same teardown, which retries stop() and
            // logs a failure that persists, so logging it here would only
            // duplicate the line. The scope release below must still run.
        }
        this._overrides.clear();
        this._disconnectWorkspaces();
        this._scope.destroy();
    }
};
