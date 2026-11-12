/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App placement-resource owner: the exact transitions greenTile started on
 * a window's compositor actor (lib/tiling/place.js parks translation/scale and
 * eases them back to identity). One record per window, keyed by the MetaWindow
 * and holding the actor it was read from — the window's
 * get_compositor_private() is already NULL by the time an App teardown runs
 * (Muffin queues the actor destroy first), so the actor cannot be re-resolved
 * later.
 *
 * Ownership is per transition object (actor.get_transition(name)), never per
 * property name. Each of our transitions carries its own 'stopped' handler
 * (environment.js connects exactly this signal: `transition.connect('stopped',
 * (t, finished) => ...)`), so:
 *   - a foreign animation that replaced one of our transitions is recognised by
 *     the transition IDENTITY and left completely alone — its transition is
 *     never removed and its value is never reset;
 *   - one cancelled property no longer drops the ownership of its siblings: the
 *     record survives, and each property is resolved on its own.
 * A property whose transition is gone is repaired only when it is provably
 * ours: our transition stopped unfinished, the actor never reported another
 * transition COMPLETING on that property afterwards, and the field still carries
 * the value it froze at. The middle condition is the actor's own detailed
 * ::transition-stopped signal (name, is_finished) — Muffin emits it from
 * on_transition_stopped when a transition finishes and from
 * clutter_actor_remove_transition when one is removed, both AFTER the
 * transition has left the actor's table (clutter-actor.c 19387-19391,
 * 19722-19770). Our own removal only ever reports is_finished=FALSE, so a TRUE
 * for a property whose entry we already saw stop can only come from a different
 * transition — a takeover. Numeric equality of the value is deliberately NOT
 * used as the proof: a foreign animation that supersedes ours and finishes on
 * exactly the value we froze leaves the same field value behind.
 *
 * Every identity write re-checks the property immediately before writing it: a
 * removal emits ::transition-stopped synchronously and a handler may chain a
 * replacement (that is what the "emitted after removal" invariant exists for),
 * and the assignment itself would cancel that replacement through the
 * duration-0 skip branch (clutter-actor.c 5420-5423, 4819, 19433-19436).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/** @param {unknown} e */
const failText = (e) => {
    try {
        return e instanceof Error ? e.message : String(e);
    }
    catch (_e) {
        // a half-disposed wrapper may refuse to be stringified; a failing
        // message must not escape the cleanup it describes
        return 'unprintable error';
    }
};

/**
 * @typedef {Object} PlacementDeps
 * @property {(message: string) => void} logError global.logError
 */

/**
 * @typedef {Object} OwnTransition
 * @property {AnyRecord} transition the Clutter transition object we started
 * @property {string} field the actor field the transition animates
 * @property {number} identity the value that makes visual == buffer
 * @property {boolean} stopped whether that transition reported its stop
 * @property {number|undefined} frozen the field value at the stop
 * @property {boolean} takenOver a different transition completed on this
 * property after ours stopped — the value is no longer greenTile's to touch
 */

/**
 * @typedef {Object} PlacementRecord
 * @property {object} token identifies the acquisition this record belongs to
 * @property {CinnamonActor} actor the actor read at acquisition time
 * @property {Map<string, OwnTransition>} transitions property -> own transition
 * @property {unknown} actorHandler the actor's ::transition-stopped subscription
 *
 * Keyed by the MetaWindow, relying on GJS handing out one stable wrapper per
 * GObject instance: the window an 'unmanaged' signal delivers is the same
 * wrapper the placement was called with. A divergence would not leak a
 * transition — the record would simply be released at App teardown instead —
 * but it would delay the identity snap on close.
 */

var Placement = class {
    /** @param {PlacementDeps} deps */
    constructor(deps) {
        this._logError = deps.logError;
        /** @type {Map<CinnamonWindow, PlacementRecord>} */
        this._records = new Map();
    }

    // Observable ownership state: true while a placement of this window still
    // holds live transitions of its own. Guaranteed to fall back to false on
    // completion, cancel-with-release, window close and App teardown; a record
    // whose transitions the shell cancelled globally (remove_all_transitions)
    // stays until the next place or teardown snaps the parked values back, which
    // is deliberate — see _release.
    /** @param {CinnamonWindow} metaWindow */
    has(metaWindow) {
        return this._records.has(metaWindow);
    }

    // True while any of the props carries a transition that is NOT ours — the
    // shell's own window effect, a third-party animation. The animated
    // placement must not ease those properties: the platform cancels whatever
    // sits on an eased property (environment.js _easeActor), and cancelling a
    // foreign animation is exactly what the original contract forbids. A
    // property we still own does not count; an unreadable actor protects
    // nothing.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {CinnamonActor} actor
     * @param {ReadonlyArray<{ prop: string }>} props
     * @returns {boolean}
     */
    foreignActive(metaWindow, actor, props) {
        const record = this._records.get(metaWindow);
        const own = record ? record.transitions : null;
        for (const p of props) {
            let current = null;
            try {
                current = actor.get_transition(p.prop);
            }
            catch (_e) {
                return false;
            }
            if (current === null) {
                continue;
            }
            const entry = own ? own.get(p.prop) : null;
            if (!entry || entry.transition !== current) {
                return true;
            }
        }
        return false;
    }

    // Takes ownership of the transitions the ease just created. The token is
    // this acquisition's identity: a superseded ease's stop must never release a
    // newer record, and every entry is additionally guarded by its transition
    // object.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {object} token
     * @param {CinnamonActor} actor
     * @param {ReadonlyArray<{ prop: string, field: string, identity: number }>} props
     */
    acquired(metaWindow, token, actor, props) {
        /** @type {Map<string, OwnTransition>} */
        const transitions = new Map();
        for (const p of props) {
            let transition = null;
            try {
                transition = actor.get_transition(p.prop);
            }
            catch (_e) {
                // a destroyed actor holds no transition of ours any more; stop
                // reading and keep what was collected so a later teardown still
                // releases it
                break;
            }
            if (!transition) {
                continue;
            }
            /** @type {OwnTransition} */
            const entry = {
                transition,
                field: p.field,
                identity: p.identity,
                stopped: false,
                frozen: undefined,
                takenOver: false,
            };
            try {
                transition.connect('stopped', (/** @type {unknown} */ _t, /** @type {boolean} */ finished) => {
                    this._onStopped(metaWindow, token, p.prop, entry, finished);
                });
            }
            catch (_e) {
                // no signal surface on this wrapper: the entry stays owned and
                // is resolved by identity at release time
            }
            transitions.set(p.prop, entry);
        }
        if (transitions.size === 0) {
            this._detachIfPresent(metaWindow);
            this._records.delete(metaWindow);
            return;
        }
        // A superseded record must stop observing: its actor subscription would
        // otherwise outlive it, adding one handler per placement for the life of
        // the window.
        this._detachIfPresent(metaWindow);
        let actorHandler = null;
        try {
            actorHandler = actor.connect('transition-stopped',
                (/** @type {unknown} */ _a, /** @type {string} */ name, /** @type {boolean} */ finished) => {
                    this._onTransitionStopped(metaWindow, name, finished);
                });
        }
        catch (_e) {
            // an actor without the signal surface simply loses the takeover
            // evidence: identity and the frozen value still gate every write
        }
        this._records.set(metaWindow, { token, actor, transitions, actorHandler });
    }

    // The actor's own ::transition-stopped (name, is_finished). A completed
    // transition on a property whose entry we already saw stop cannot be ours —
    // our own removal reports FALSE only — so the property now carries a value
    // an animation of someone else put there. Marked permanently: the entry is
    // never repaired, whatever the field happens to hold.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {string} name
     * @param {boolean} finished
     */
    _onTransitionStopped(metaWindow, name, finished) {
        if (finished !== true) {
            return;
        }
        const record = this._records.get(metaWindow);
        if (!record) {
            return;
        }
        const entry = record.transitions.get(name);
        if (entry && entry.stopped) {
            entry.takenOver = true;
        }
    }

    // One of our transitions stopped. finished=true is the whole ease running
    // through (the value is already the identity, nothing to repair). Any other
    // stop is a cancellation or a foreign takeover: the value the field carries
    // right now is frozen and kept as the evidence _release classifies against —
    // a foreign ease installs its replacement synchronously after this emission,
    // so the decision cannot be made here.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {object} token
     * @param {string} prop
     * @param {OwnTransition} entry
     * @param {boolean} finished
     */
    _onStopped(metaWindow, token, prop, entry, finished) {
        const record = this._records.get(metaWindow);
        if (!record || record.token !== token || record.transitions.get(prop) !== entry) {
            return;
        }
        if (finished) {
            record.transitions.delete(prop);
            this._sweep(record);
            if (record.transitions.size === 0) {
                this._detach(record);
                this._records.delete(metaWindow);
            }
            return;
        }
        entry.stopped = true;
        try {
            entry.frozen = /** @type {AnyRecord} */ (record.actor)[entry.field];
        }
        catch (_e) {
            entry.frozen = undefined;
        }
    }

    // The earliest point at which a sibling that was cancelled on its own can be
    // repaired safely: a whole ease has just finished, so a foreign takeover of
    // any sibling has long since installed its own transition and is skipped.
    // Only properties that are provably ours are snapped; a null transition that
    // carries a foreign value is left alone.
    /** @param {PlacementRecord} record */
    _sweep(record) {
        const actor = record.actor;
        for (const [prop, entry] of [...record.transitions]) {
            if (this._transitionOf(actor, prop) !== null || !this._repairable(actor, entry)) {
                continue;
            }
            // re-check: another handler of the emission this sweep runs inside
            // may have chained a transition in the meantime
            if (this._transitionOf(actor, prop) !== null) {
                continue;
            }
            try {
                /** @type {AnyRecord} */ (actor)[entry.field] = entry.identity;
                record.transitions.delete(prop);
            }
            catch (_e) {
                // left in the record: the release reports it
            }
        }
    }

    // The transition the actor currently holds for a property, or null. A throw
    // (disposed wrapper, erroring read) is reported as a non-null sentinel by the
    // callers through the null-check they already do — an unreadable actor never
    // justifies a write.
    /**
     * @param {CinnamonActor} actor
     * @param {string} prop
     * @returns {AnyRecord|null}
     */
    _transitionOf(actor, prop) {
        try {
            return actor.get_transition(prop);
        }
        catch (_e) {
            return /** @type {AnyRecord} */ ({});
        }
    }

    // The value a field holds, or a sentinel that never compares equal to a read
    // — an unreadable wrapper must not look like "unchanged".
    /**
     * @param {CinnamonActor} actor
     * @param {string} field
     * @returns {AnyRecord}
     */
    _fieldOf(actor, field) {
        try {
            return /** @type {AnyRecord} */ (actor)[field];
        }
        catch (_e) {
            return /** @type {AnyRecord} */ ({});
        }
    }

    // Drops one window's record and releases what is still ours: the window is
    // gone (unmanaged), or a non-animated placement is about to move the buffer
    // and the actor has to sit at identity for it. Failures are reported the
    // same way as at teardown — a failed release is never silent.
    /** @param {CinnamonWindow} metaWindow */
    release(metaWindow) {
        const record = this._records.get(metaWindow);
        if (!record) {
            return;
        }
        this._records.delete(metaWindow);
        /** @type {string[]} */
        const failures = [];
        this._release(record, failures);
        this._detach(record);
        this._report(failures);
    }

    // App teardown: every record is released, per window and per property
    // isolated so one bad actor cannot strand the rest, and the failures are
    // reported once instead of disappearing into the unload.
    destroy() {
        /** @type {string[]} */
        const failures = [];
        for (const [metaWindow, record] of this._records) {
            this._records.delete(metaWindow);
            this._release(record, failures);
            this._detach(record);
        }
        this._report(failures);
    }

    // Drops the actor subscription the record installed, so a dead App leaves no
    // handler on a live actor. A failure here is swallowed: the handler is inert
    // once the record is gone (it looks the MetaWindow up and finds nothing).
    /** @param {PlacementRecord} record */
    _detach(record) {
        if (record.actorHandler === null) {
            return;
        }
        try {
            record.actor.disconnect(record.actorHandler);
        }
        catch (_e) {
            // wrapper already gone — the subscription died with it
        }
        record.actorHandler = null;
    }

    /** @param {CinnamonWindow} metaWindow */
    _detachIfPresent(metaWindow) {
        const record = this._records.get(metaWindow);
        if (record) {
            this._detach(record);
        }
    }

    // A record's MetaWindow can be the only reference to a window that was
    // placed and closed before the auto observer started tracking it (the
    // asynchronous monitor reply): that record is held until App teardown,
    // which releases it. Bounded per App, and no transition outlives the actor.
    // The record is removed before it is released, so a release that keeps
    // failing can be reported at most once per acquisition — never per frame.
    /** @param {string[]} failures */
    _report(failures) {
        if (failures.length) {
            try {
                this._logError('greenTile placement cleanup completed with errors: ' + failures.join('; '));
            }
            catch (_e) {
                // the cleanup already ran: a failing report must not escape
                // into the signal handler or the App teardown step
            }
        }
    }

    // True only for a property that is provably OURS to repair: our transition
    // stopped unfinished, no other transition has completed on the property
    // since, and the field still carries exactly the value it froze at. Anything
    // else is not greenTile's to touch — a completed ease already sits at the
    // identity, and a property a foreign animation touched (running or settled)
    // carries a value greenTile did not put there. A null transition alone is
    // never permission to snap, and neither is a value that merely happens to
    // match.
    /**
     * @param {CinnamonActor} actor
     * @param {OwnTransition} entry
     * @returns {boolean}
     */
    _repairable(actor, entry) {
        if (!entry.stopped || entry.takenOver) {
            return false;
        }
        try {
            return /** @type {AnyRecord} */ (actor)[entry.field] === entry.frozen;
        }
        catch (_e) {
            return false;
        }
    }

    // Removes exactly the transitions that are still ours and, when the property
    // is provably ours, snaps it to the identity (visual == buffer). A property
    // a foreign transition holds — running or settled — is left completely
    // alone, and so is an actor that is already destroyed: its transitions died
    // with it.
    /**
     * @param {PlacementRecord} record
     * @param {string[] | null} failures
     */
    _release(record, failures) {
        const actor = record.actor;
        const entries = [...record.transitions];
        if (entries.length === 0) {
            return;
        }
        try {
            actor.get_transition(entries[0][0]);
        }
        catch (_e) {
            // wrapper already disposed — nothing of ours outlived it
            return;
        }
        for (const [prop, entry] of entries) {
            let current = null;
            try {
                current = actor.get_transition(prop);
            }
            catch (e) {
                if (failures) {
                    failures.push(prop + ': ' + failText(e));
                }
                continue;
            }
            if (current !== null && current !== entry.transition) {
                // a foreign transition owns the property now — never touch it
                continue;
            }
            if (current === entry.transition) {
                // What the property held before the removal. Removing a
                // transition does not change the value, so any change across the
                // emission is a write by a handler of that emission.
                const before = this._fieldOf(actor, entry.field);
                try {
                    actor.remove_transition(prop);
                }
                catch (e) {
                    if (failures) {
                        failures.push(prop + ': ' + failText(e));
                    }
                    continue;
                }
                // the removal emitted ::transition-stopped synchronously; a
                // handler may have chained a replacement on the property, and
                // writing the identity would cancel it (the assignment routes
                // through the duration-0 skip branch). Re-check after the
                // emission, before the write.
                if (this._transitionOf(actor, prop) !== null) {
                    continue;
                }
                // a chained animation with duration 0 leaves no transition
                // behind to see — only the value itself shows that the property
                // was written by someone else during the emission
                if (this._fieldOf(actor, entry.field) !== before) {
                    continue;
                }
            }
            else if (!this._repairable(actor, entry)) {
                continue;
            }
            try {
                /** @type {AnyRecord} */ (actor)[entry.field] = entry.identity;
            }
            catch (e) {
                if (failures) {
                    failures.push(entry.field + ': ' + failText(e));
                }
            }
        }
    }
};
