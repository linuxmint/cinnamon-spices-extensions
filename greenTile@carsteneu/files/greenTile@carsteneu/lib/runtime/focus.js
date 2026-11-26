/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App focus bindings: Super+Arrow moves the keyboard focus on
 * monitor+workspaces where automatic tiling is on. push-tile-* are Cinnamon's
 * own builtin wm keybindings (org.cinnamon.desktop.keybindings.wm), so both
 * module generations register through the generation's builtin surface:
 *
 *  - upstream (keybindingManager.setBuiltinHandler present and
 *    Meta.KeyBindingAction resolves the name): the manager route, so the
 *    shell's action-mode filter applies (default ActionMode.NORMAL — the
 *    hotkeys go quiet in overview/modal states) and the dispatcher entry is
 *    tracked for restore.
 *  - 6.6 / enum-less muffin (no setBuiltinHandler): the direct
 *    Meta.keybindings_set_custom_handler surface — mode filtering is not part
 *    of it.
 *
 * connect() records one registration per name BEFORE the acquisition call and
 * installs an own dispatcher that turns inert the moment destroy() starts, so
 * no failure anywhere in teardown can leave a live callback holding the
 * destroyed App.
 *
 * destroy() restores per registration, each in its own try, so one throwing
 * restore never strands the remaining names, and reports the combined failures
 * to the caller (Config.destroy logs them). What it does per failure is decided
 * by WHO owns the manager-visible slot right now, because that slot is a
 * singleton across App recreation — it is the rollback target the next App will
 * capture:
 *
 *  - slot is OURS and a prior is known: hand the prior back. If that handoff
 *    fails, the prior is written back into the slot itself before retrying, so
 *    the next App still recovers the real prior instead of our dead dispatcher.
 *  - slot is OURS and nothing was there before us: remove our entry and reset
 *    the Meta handler. The Meta reset is attempted even when the slot is
 *    already gone, otherwise our dispatcher keeps swallowing the key.
 *  - slot already holds our known prior: retry the handoff (idempotent).
 *  - slot belongs to a NEWER owner that registered after us: leave it alone —
 *    never restored over, never removed, never reset.
 *
 * A failed registration stays owned so a same-instance retry can complete it,
 * unless the slot was handed to a newer owner.
 *
 *  - direct Meta route restore target: only the names THIS instance overrode
 *    are reset to muffin's builtin. Meta.keybindings_set_custom_handler has no
 *    getter counterpart, so an unknown foreign direct handler that predated us
 *    cannot be discovered — a platform limitation, reported rather than papered
 *    over with an invented getter.
 *
 * Platform limits that no ownership bookkeeping can close (documented, not
 * papered over): the direct route exposes no ownership signal at all — no
 * readable handler and no manager map — so a handler registered there AFTER us
 * cannot be distinguished either, and destroy() necessarily resets the name to
 * muffin's builtin on that route. On the manager route, upstream's
 * setBuiltinHandler hands out a FRESH entry object per call, so ownership is
 * decided by that object's identity — not by callback identity, which cannot
 * tell a newer owner that reused the same callback with different allowedModes
 * from the prior we recorded. Upstream also stores `bindings: []`, so a prior
 * entry's configured accelerator array is not round-tripped; the restore hands
 * back the callback and allowedModes, which is what the delivery path reads.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const FOCUS_BINDING_PREFIX = 'push-tile-';
const FOCUS_BINDING_NAMES = Object.freeze([
    'push-tile-left',
    'push-tile-right',
    'push-tile-up',
    'push-tile-down',
]);

// 'push-tile-left' -> 'PUSH_TILE_LEFT' (Meta.KeyBindingAction member naming)
/**
 * @param {string} name
 * @returns {string}
 */
const actionEnumName = (name) => name.toUpperCase().replace(/-/g, '_');

/**
 * Focus bindings owner: registers the push-tile builtin handlers with the App
 * and restores the pre-connect owner on destroy.
 * @typedef {Object} FocusDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} [keybindingManager] imports.ui.main.keybindingManager — absent on the 6.6 fake surface
 * @property {(app: AppFacade, dir: 'left' | 'right' | 'up' | 'down') => (display: AnyRecord, win: CinnamonWindow) => void} hotkey the handler factory: focusHotkey from lib/tiling/focus-nav.js, wrapped by the App so a press inside a workspace-switch effect waits behind the held retiles (app.auto.afterSwitchPress); the names of FOCUS_BINDING_NAMES end in exactly these directions
 * @property {(message: string) => void} [logError] registration failures
 */

/**
 * One acquired binding.
 * @typedef {Object} FocusRegistration
 * @property {string} name binding name ('push-tile-left')
 * @property {number | undefined} actionId Meta.KeyBindingAction id; undefined on the direct Meta route
 * @property {AnyRecord | undefined} prior manager entry that was in place before we took over
 * @property {((display: AnyRecord, win: CinnamonWindow, binding?: AnyRecord) => void) | null} handler our live callback, dropped on destroy
 * @property {((display: AnyRecord, win: CinnamonWindow, binding: AnyRecord) => void) | null} install the dispatcher we handed to the shell — kept so the manager-visible slot can be classified as ours
 * @property {AnyRecord | undefined} installedEntry the manager entry object our install produced; the ownership token (undefined when the install threw before the effect)
 * @property {AnyRecord | undefined} restoredEntry the manager entry object our own hand-back of the prior produced
 * @property {boolean} active false once destroy made the callback inert
 */

var Focus = class {
    /**
     * @param {FocusDeps} deps
     */
    constructor(deps) {
        this._meta = deps.meta;
        this._manager = deps.keybindingManager || null;
        this._hotkey = deps.hotkey;
        this._logError = deps.logError || (() => {});
        /** @type {FocusRegistration[]} */
        this._registrations = [];
    }

    /**
     * Registers the push-tile handlers, one per binding name, through the
     * generation's builtin surface. Re-entrant: an existing ownership is
     * released first, so a repeated connect never captures our own handler as
     * the rollback target (a failing release surfaces here).
     * @param {AppFacade} app
     */
    connect(app) {
        if (this._registrations.length)
            {this.destroy();}
        for (const name of FOCUS_BINDING_NAMES) {
            const dir = /** @type {'left' | 'right' | 'up' | 'down'} */ (name.slice(FOCUS_BINDING_PREFIX.length));
            /** @type {FocusRegistration} */
            const registration = {
                name,
                actionId: undefined,
                prior: undefined,
                handler: this._hotkey(app, dir),
                install: null,
                installedEntry: undefined,
                restoredEntry: undefined,
                active: true,
            };
            const dispatch = (/** @type {AnyRecord} */ display, /** @type {CinnamonWindow} */ win, /** @type {AnyRecord} */ binding) => {
                const handler = registration.handler;
                if (registration.active && handler)
                    {handler(display, win, binding);}
            };
            const actionId = this._manager && this._manager.setBuiltinHandler
                ? this._meta.KeyBindingAction[actionEnumName(name)]
                : undefined;
            registration.install = dispatch;
            if (this._manager && this._manager.setBuiltinHandler && actionId !== undefined) {
                registration.actionId = actionId;
                // save the rollback ownership BEFORE the registration call:
                // setBuiltinHandler may throw after mutating state, and a
                // partial connect must stay fully restorable by destroy()
                registration.prior = this._manager.bindings && this._manager.bindings.has(actionId)
                    ? this._manager.bindings.get(actionId)
                    : undefined;
                this._registrations.push(registration);
                try {
                    this._manager.setBuiltinHandler(name, actionId, dispatch);
                }
                finally {
                    // the manager hands out a fresh entry object per call: capture
                    // the one that actually holds OUR dispatcher as the ownership
                    // token (undefined when the call threw before the effect, so
                    // the fallback classification still applies)
                    registration.installedEntry = this._captureEntry(actionId, dispatch);
                }
            }
            else {
                this._registrations.push(registration);
                try {
                    this._setMeta(name, dispatch);
                }
                catch (error) {
                    // A partial install must never call the App after fallback.
                    registration.active = false;
                    registration.handler = null;
                    let fallback = 'Cinnamon default restored';
                    try {
                        this._setMeta(name, null);
                        this._registrations.pop();
                    }
                    catch (resetError) {
                        fallback = 'default reset failed: ' + resetError;
                    }
                    this._logError('greenTile: ' + name + ' registration failed: ' + error + '; ' + fallback);
                }
            }
        }
    }

    /**
     * Restores what WE acquired. Two stages, so a failure can never leave a
     * live own callback behind:
     *  1. make every own callback inert and drop its App closure — a binding
     *     whose restore then fails still delivers nothing;
     *  2. restore per registration, each in its own try, so one throwing
     *     restore never strands the remaining names.
     * A registration that failed is recovered (see _recover) and kept for a
     * retry, unless its slot went to a newer owner.
     */
    destroy() {
        for (const registration of this._registrations) {
            registration.active = false;
            registration.handler = null;
        }
        /** @type {string[]} */ const failures = [];
        /** @type {FocusRegistration[]} */ const unrestored = [];
        for (const registration of this._registrations) {
            try {
                this._restore(registration);
            }
            catch (e) {
                failures.push(registration.name + ': ' + (e instanceof Error ? e.message : String(e)));
                try {
                    this._recover(registration);
                    if (this._ownerState(registration) !== 'foreign')
                        {unrestored.push(registration);}
                }
                catch (_recoverError) {
                    // the recovery itself failed (the manager surface threw while
                    // classifying the slot): the isolation must cover this path
                    // too — keep the registration retryable and, above all, do
                    // not strand the remaining registrations
                    unrestored.push(registration);
                }
            }
        }
        this._registrations = unrestored;
        if (failures.length)
            {throw new Error('push-tile restore failed for ' + failures.length + ' binding(s) — ' + failures.join('; '));}
    }

    /**
     * Classifies the manager-visible slot for one registration. That slot is
     * what a later App captures as its prior, so it decides whether there is
     * anything of ours left to release:
     *  - 'ours': still holds the entry object we installed
     *  - 'prior': holds the entry we recorded before taking over, or the one our
     *    own hand-back produced
     *  - 'empty': nobody's
     *  - 'foreign': a newer owner registered after us — untouchable
     * The direct route has no comparable slot, so it reports 'ours' to keep its
     * own retry behaviour.
     * @param {FocusRegistration} registration
     * @returns {'ours' | 'prior' | 'empty' | 'foreign'}
     */
    _ownerState(registration) {
        const manager = this._manager;
        if (registration.actionId === undefined || manager === null || !manager.bindings)
            {return 'ours';}
        const entry = manager.bindings.get(registration.actionId);
        if (!entry)
            {return 'empty';}
        // The manager hands out a FRESH entry object per registration, so object
        // identity is the ownership token. It also separates a newer owner that
        // reused the same callback with different allowedModes — which callback
        // identity alone cannot. The object must still carry the callback it was
        // created with, so a manager that re-registers in place is not mistaken
        // for ours either.
        if (entry === registration.installedEntry && entry.callback === registration.install)
            {return 'ours';}
        if ((entry === registration.restoredEntry || entry === registration.prior)
            && registration.prior !== undefined && entry.callback === registration.prior.callback)
            {return 'prior';}
        if (registration.installedEntry === undefined && registration.restoredEntry === undefined) {
            // no entry object was ever captured (the manager call threw before
            // the effect): callback identity is the only signal left, and the
            // modes must match as well — otherwise this is a newer owner that
            // reused the callback
            if (registration.install && entry.callback === registration.install)
                {return 'ours';}
            if (registration.prior && entry.callback === registration.prior.callback
                && entry.allowedModes === registration.prior.allowedModes)
                {return 'prior';}
        }
        return 'foreign';
    }

    /**
     * Reads back the manager entry a just-issued call produced, so its identity
     * can serve as the ownership token. Best effort: a throwing manager read
     * must not mask the failure that got us here, and an entry that does not
     * carry the expected callback is not ours to claim.
     * @param {number} actionId
     * @param {unknown} callback
     * @returns {AnyRecord | undefined}
     */
    _captureEntry(actionId, callback) {
        const manager = this._manager;
        if (manager === null)
            {return undefined;}
        try {
            const entry = manager.bindings ? manager.bindings.get(actionId) : undefined;
            return entry && callback !== null && entry.callback === callback ? entry : undefined;
        }
        catch (_e) {
            return undefined;
        }
    }

    /**
     * Restores one acquired binding to its pre-connect owner.
     * @param {FocusRegistration} registration
     */
    _restore(registration) {
        const manager = this._manager;
        if (registration.actionId === undefined || manager === null) {
            this._setMeta(registration.name, null);
            return;
        }
        const owner = this._ownerState(registration);
        if (owner === 'foreign')
            {return;}
        if (registration.prior !== undefined) {
            try {
                manager.setBuiltinHandler(registration.name, registration.actionId, registration.prior.callback, registration.prior.allowedModes);
            }
            finally {
                // remember the entry our own hand-back produced, so a retry
                // recognises it instead of reading it as a newer owner
                registration.restoredEntry = this._captureEntry(registration.actionId, registration.prior.callback);
            }
            return;
        }
        if (owner === 'ours' && manager.bindings)
            {manager.bindings.delete(registration.actionId);}
        this._setMeta(registration.name, null);
    }

    /**
     * Best-effort recovery after a restore threw, so the failure leaves as
     * little damage as the platform allows. The collected error from destroy()
     * already reports the throw; nothing here may replace it.
     * @param {FocusRegistration} registration
     */
    _recover(registration) {
        const manager = this._manager;
        if (registration.actionId === undefined || manager === null) {
            this._retryMetaReset(registration);
            return;
        }
        if (this._ownerState(registration) === 'foreign')
            {return;}
        if (registration.prior !== undefined) {
            // A KNOWN prior must not be lost: put it back into the slot first,
            // so the next App captures the real prior as its rollback target
            // even if the dispatcher handoff keeps failing.
            try {
                if (manager.bindings)
                    {manager.bindings.set(registration.actionId, registration.prior);}
            }
            catch (_e) {
                // best effort; a later retry still holds the prior in this record
            }
            try {
                manager.setBuiltinHandler(registration.name, registration.actionId, registration.prior.callback, registration.prior.allowedModes);
            }
            catch (_e) {
                // prior preserved above; the failure is already reported
            }
            registration.restoredEntry = this._captureEntry(registration.actionId, registration.prior.callback);
            return;
        }
        // nothing was there before us: our entry may be left in the slot and
        // Meta may still hold our dispatcher — clean up both, independently
        try {
            if (manager.bindings && this._ownerState(registration) === 'ours')
                {manager.bindings.delete(registration.actionId);}
        }
        catch (_e) {
            // best effort
        }
        this._retryMetaReset(registration);
    }

    /**
     * Attempts the Meta reset on its own, independent of any manager state, so
     * a dispatcher of ours can never keep swallowing the key just because the
     * binding-map entry is already gone.
     * @param {FocusRegistration} registration
     */
    _retryMetaReset(registration) {
        try {
            this._setMeta(registration.name, null);
        }
        catch (_e) {
            // best effort; destroy() already collected the failure
        }
    }

    /**
     * @param {string} name
     * @param {((...args: any[]) => void) | null} handler
     */
    _setMeta(name, handler) {
        if (this._meta.keybindings_set_custom_handler(name, handler) === false)
            {throw new Error('Cinnamon rejected ' + name);}
    }
};
