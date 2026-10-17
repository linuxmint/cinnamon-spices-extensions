/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Compositor-actor resync: a placement moves a window's FRAME rect, and Muffin syncs
 * the window's compositor actor to it. After rapid successive placements the actor of a
 * client-decorated (CSD, sync-request) window can stay stuck at an intermediate
 * position/size while the frame rect AND the X server are already correct — measured
 * live after a Super+Ctrl+Left push chain: the frame sat in cell 3 while the actor was
 * still drawn at cell 4, so cell 3 looked empty and the cell-4 window was covered.
 * greenTile's geometry was right; only the actor lagged.
 *
 * One verification per surface and placement, a short delay after the retile (see
 * ACTOR_SYNC_MS): every placed window's actor must keep the offset it had from its frame
 * before the placement. That relation needs no frame-extents API — Muffin exposes none
 * for the actor — and is the same for CSD and SSD windows, because whichever actor
 * Muffin draws, a placement must move it by exactly what the frame moved.
 *
 * On a mismatch the surface is nudged exactly once: a DIFFERENT rect (which is what
 * makes a stuck sync follow again) and then the target rect. Re-issuing the same rect is
 * a no-op in Muffin and would not repair anything — the live repair test showed a +1 px
 * move followed by the real rect puts the actor back. No loop, no retry: a stuck actor
 * that a nudge does not repair is left alone rather than fought. The log line reports
 * the nudge that was issued, not a re-read result.
 *
 * Deliberate blind spots. The relation is a DELTA, so a placement that re-issues the
 * same rect cannot expose an actor that was already stale before it — the check has no
 * fresh reference to compare against. A desync in SIZE alone is detected, but the
 * repair re-issues the position only: a 1 px size detour would make a terminal reflow
 * its character grid, which costs the user more than the lag does.
 *
 * A user's grab and a running position animation (the shell's workspace switch writes
 * actor.x/y) own the geometry: the check stands down while either is live instead of
 * fighting it, and misses that one repair. The workspace-switch effect is the known
 * source of stale actors after a Super+Ctrl+Arrow push — its cleanup restores the
 * positions from before the switch — and is avoided upstream: retileMonitor, the drop
 * landing and the geometry hotkeys place nothing while it runs (lib/runtime/auto.js
 * SWITCH_POLL_MS). This check stays as the safety net for a stale actor that arises
 * outside that effect.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The actor follows a frame move asynchronously: Muffin moves it when the compositor
// processes the request, and a client-decorated window answers through its sync-request
// counter, so the offsets must be read after the compositor had its moment. 320 ms
// clears the placement ease (ANIMATE_MS 250 in lib/tiling/place.js) and is deliberately
// distinct from the auto observer's 300 ms debounce, so a following retile supersedes
// this check and timer-counting tests stay unambiguous. Short enough that a gap never
// becomes visible: the host's gap lasted minutes because nothing repaired it at all.
const ACTOR_SYNC_MS = 320;
// The actor rounds to whole pixels and a fractional-scale monitor can shift the frame by
// one: the offset is only compared with a few pixels of slack.
const ACTOR_SYNC_TOLERANCE = 2;

/**
 * @typedef {Object} ActorSyncDeps
 * @property {AnyRecord} mainloop imports.mainloop (timeout_add, source_remove)
 * @property {(message: string) => void} log global.log
 * @property {(win: CinnamonWindow, x: number, y: number, width: number, height: number, userOp: boolean) => void} moveResize windowMoveResize (lib/tiling/windows.js)
 * @property {() => boolean} grabActive true while the user holds a grab (drag or resize)
 */

/**
 * @typedef {Object} ActorWatch
 * @property {CinnamonWindow} window
 * @property {CinnamonActor} actor the actor read before the placement
 * @property {number} offX actor.x - frame.x before the placement
 * @property {number} offY actor.y - frame.y before the placement
 * @property {number} offW actor.width - frame.width before the placement
 * @property {number} offH actor.height - frame.height before the placement
 */

var ActorSync = class {
    /** @param {ActorSyncDeps} deps */
    constructor(deps) {
        this._mainloop = deps.mainloop;
        this._log = deps.log;
        this._moveResize = deps.moveResize;
        this._grabActive = deps.grabActive;
        /** @type {Map<string, number>} surface key -> pending mainloop timer */
        this._pending = new Map();
        this._destroyed = false;
    }

    /**
     * The actor state a placement is about to invalidate, or null when there is nothing
     * to compare later (no compositor actor yet). Read BEFORE the frame moves.
     * @param {CinnamonWindow | null} metaWindow
     * @returns {ActorWatch | null}
     */
    watch(metaWindow) {
        if (!metaWindow || this._destroyed) {
            return null;
        }
        const actor = metaWindow.get_compositor_private();
        if (!actor) {
            return null;
        }
        const f = metaWindow.get_frame_rect();
        return {
            window: metaWindow,
            actor: actor,
            offX: actor.x - f.x,
            offY: actor.y - f.y,
            offW: actor.width - f.width,
            offH: actor.height - f.height,
        };
    }

    /**
     * Arms the one verification of this surface. A newer placement on the same surface
     * replaces the watched state and re-arms; other surfaces keep theirs.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {ActorWatch[]} watched
     */
    arm(app, monitorIndex, wsIndex, watched) {
        if (this._destroyed) {
            return;
        }
        const key = monitorIndex + '\n' + wsIndex;
        this._cancel(key);
        if (watched.length === 0) {
            return;
        }
        const id = this._mainloop.timeout_add(ACTOR_SYNC_MS, () => {
            this._pending.delete(key);
            if (!this._destroyed) {
                this._verify(app, monitorIndex, wsIndex, watched);
            }
            return false;
        });
        this._pending.set(key, id);
    }

    /**
     * The one nudge per window whose actor did not follow. The window's actor is read
     * first — get_compositor_private() reads null once Muffin tore the actor down and is
     * therefore the accessor that survives a close, unlike the state getters of a wrapper
     * that was finalized between placement and check — and every window is isolated, so
     * one dead wrapper cannot drop the verification of the others.
     *
     * Left alone: a window without its actor (or with a different one), a minimized,
     * maximized or fullscreen window (none of them is in the tiling state the placement
     * established, and a nudge would fight whatever mode took over), a geometry a user
     * currently holds in a grab, and a position the shell is animating right now.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {ActorWatch[]} watched
     */
    _verify(app, monitorIndex, wsIndex, watched) {
        let repaired = 0;
        for (const w of watched) {
            try {
                const window = w.window;
                const actor = window.get_compositor_private();
                if (!actor || actor !== w.actor || (typeof actor.is_destroyed === 'function' && actor.is_destroyed())) {
                    continue;
                }
                if (this._grabActive()) {
                    continue;
                }
                if (window.minimized === true || window.get_maximized() !== 0 || window.is_fullscreen()) {
                    continue;
                }
                if (actor.get_transition('x') || actor.get_transition('y')) {
                    continue;
                }
                const f = window.get_frame_rect();
                const stuck = Math.abs(actor.x - f.x - w.offX) > ACTOR_SYNC_TOLERANCE
                    || Math.abs(actor.y - f.y - w.offY) > ACTOR_SYNC_TOLERANCE
                    || Math.abs(actor.width - f.width - w.offW) > ACTOR_SYNC_TOLERANCE
                    || Math.abs(actor.height - f.height - w.offH) > ACTOR_SYNC_TOLERANCE;
                if (!stuck) {
                    continue;
                }
                // A rect the actor has not seen is what makes the stuck sync follow again;
                // the target rect after it lands the window where it belongs. Both calls
                // are isolated: a window released between them must not skip the others,
                // and the return to the target rect is still attempted.
                try {
                    this._moveResize(window, f.x + 1, f.y + 1, f.width, f.height, false);
                }
                catch (_e) {
                    // the window was released mid-repair
                }
                try {
                    this._moveResize(window, f.x, f.y, f.width, f.height, false);
                }
                catch (_e) {
                    // the window was released mid-repair
                }
                repaired += 1;
            }
            catch (_e) {
                // a wrapper a window close finalized between placement and check
            }
        }
        if (repaired > 0) {
            this._log('greenTile actor resync ws' + (wsIndex + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + repaired);
        }
    }

    /**
     * @param {string} key
     */
    _cancel(key) {
        const id = this._pending.get(key);
        if (id === undefined) {
            return;
        }
        this._pending.delete(key);
        try {
            this._mainloop.source_remove(id);
        }
        catch (_e) {
            // the source was already gone
        }
    }

    destroy() {
        this._destroyed = true;
        for (const key of Array.from(this._pending.keys())) {
            this._cancel(key);
        }
    }
};
