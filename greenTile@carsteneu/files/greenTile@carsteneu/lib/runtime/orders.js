/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Restart-order runtime: the small file-backed store of per-surface window
 * orders (monitor key + workspace key -> X11 window descriptions) that survives
 * a Cinnamon restart. A Cinnamon restart on X11 re-manages the existing X11
 * windows (their descriptions survive) while Muffin moves them around before
 * greenTile loads, so the startup retile would otherwise re-derive the order
 * from the scrambled positions. The store is written after every placement and
 * consumed once per surface by the first retile after enable.
 *
 * The file lives in the user's runtime dir (wiped at logout, exactly the needed
 * lifetime) and is untrusted input: reads tolerate anything, writes are private
 * (0600 file behind a 0700 dir). Every file call is asynchronous — the read is
 * dispatched in the constructor, the write after the debounce — so neither blocks
 * the compositor's only thread. No failure may reach the tiling path: every error
 * is logged and swallowed.
 *
 * All Cinnamon access is injected (deps): glib (imports.gi.GLib), gio
 * (imports.gi.Gio), byteArray (imports.byteArray), mainloop (imports.mainloop),
 * global and log. Read through the app parameter: app.monitors (the surface
 * keys) and app.session.orderUsed (the per-surface first-use gate).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { orderKey, orderParse, orderGet, orderSet, ORDER_MAX_BYTES, ORDER_VERSION } = XLET.lib.model['window-order'];

// Placements happen often (window-added bursts, held resize keys, drops); the
// write is coalesced so the runtime file sees at most one write per idle second.
var ORDER_WRITE_MS = 1000;
var ORDER_DIR = 'greenTile@carsteneu';
var ORDER_FILE = 'order.json';
// The store's directory is owner-only; make_directory_async takes no mode, so the
// mode is applied with set_attributes_async right after the directory exists.
var ORDER_DIR_MODE = 0o700;

/**
 * True when a Gio error is the "already there" one. make_directory_finish reports an
 * existing directory as an error, and an existing directory is the normal case for
 * every start after the first — treating it as a failure would skip the write and
 * log an error on every run.
 * @param {AnyRecord} gio
 * @param {any} error
 * @returns {boolean}
 */
var isExistsError = function (gio, error) {
    try {
        return !!error && typeof error.matches === 'function'
            && error.matches(gio.io_error_quark(), gio.IOErrorEnum.EXISTS);
    }
    catch (_e) {
        return false;
    }
};

/**
 * @typedef {Object} OrdersDeps
 * @property {AnyRecord} glib imports.gi.GLib (get_user_runtime_dir, build_filenamev, Bytes, PRIORITY_DEFAULT)
 * @property {AnyRecord} gio imports.gi.Gio (File.new_for_path, query_info_async, load_contents_async, replace_contents_bytes_async, make_directory_async, set_attributes_async, FileInfo, FileCreateFlags, FileQueryInfoFlags, FileType, IOErrorEnum, io_error_quark)
 * @property {{ toString(bytes: Uint8Array): string, fromString(text: string): Uint8Array }} byteArray imports.byteArray
 * @property {AnyRecord} mainloop imports.mainloop (timeout_add, source_remove)
 * @property {AnyRecord} global the Cinnamon global object
 * @property {(msg: string) => void} log
 */
var Orders = class {
    /**
     * @param {OrdersDeps} deps
     */
    constructor(deps) {
        this._glib = deps.glib;
        this._gio = deps.gio;
        this._byteArray = deps.byteArray;
        this._mainloop = deps.mainloop;
        this._global = deps.global;
        this._log = deps.log;
        // No session runtime dir (XDG_RUNTIME_DIR unset): glib falls back to the
        // cache dir, which survives a log out. An order kept there would describe a
        // session that is over and snap the NEXT one into an old arrangement, so
        // the store is simply off then — no read, no write, no restore.
        this._runtimeDir = this._resolveRuntimeDir();
        // The store as the file had it when this App was built: the restore side
        // reads ONLY this, so a placement of THIS run can never become a "restored"
        // order for a surface that has not been retiled yet. Still null here — the
        // read is asynchronous, which is what `ready` reports.
        this._snapshot = null;
        // The mutable store the record side writes back. Until the read lands it holds
        // only what this run recorded; _loaded merges the two.
        /** @type {{ v: number, s: Record<string, string[]> }} */
        this._store = { v: ORDER_VERSION, s: {} };
        // True once the file was read (or its read failed). Before that the store is
        // not known: it may neither answer a restore nor be written back.
        this.ready = false;
        /**
         * Callbacks waiting for the store to be known, released once by _loaded.
         * @type {Array<() => void>}
         */
        this._readyCbs = [];
        this._dirty = false;
        this._timer = 0;
        this._destroyed = false;
        this._corruptLogged = false;
        this._earlyLogged = false;
        if (this._runtimeDir) {
            this._load();
        }
        else {
            // nothing will ever be read: the store is known to be empty
            this.ready = true;
        }
    }

    /**
     * The directory the store lives in, or null when there is no per-session
     * runtime dir to put it in.
     * @returns {string | null}
     */
    _resolveRuntimeDir() {
        try {
            const dir = this._glib.get_user_runtime_dir();
            if (!dir || dir === this._glib.get_user_cache_dir() || dir === this._glib.get_home_dir()) {
                return null;
            }
            return dir;
        }
        catch (e) {
            this._log('greenTile window-order runtime dir failed: ' + e);
            return null;
        }
    }

    /** @returns {string} the order file path (built from the runtime dir, never from file content). */
    _path() {
        return this._glib.build_filenamev([this._runtimeDir, ORDER_DIR, ORDER_FILE]);
    }

    /** @returns {string} the directory the order file lives in. */
    _dir() {
        return this._glib.build_filenamev([this._runtimeDir, ORDER_DIR]);
    }

    /**
     * Reads and parses the file once, asynchronously. A missing file is an empty
     * store; unreadable or foreign content is ignored (logged once) and treated as
     * empty, so tiling never depends on the file's state. EVERY exit path resolves
     * the store: the settle fan-out waits for `ready` (lib/runtime/auto.js) and must
     * never wait forever.
     */
    _load() {
        /** @type {any} */
        let file = null;
        try {
            file = this._gio.File.new_for_path(this._path());
        }
        catch (e) {
            this._log('greenTile window-order read failed: ' + e);
            this._loaded(null);
            return;
        }
        try {
            file.query_info_async('standard::type,standard::size',
                this._gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, this._glib.PRIORITY_DEFAULT, null,
                (/** @type {any} */ _source, /** @type {any} */ res) => {
                    /** @type {any} */
                    let info = null;
                    try {
                        info = file.query_info_finish(res);
                    }
                    catch (e) {
                        this._log('greenTile window-order read failed: ' + e);
                        this._loaded(null);
                        return;
                    }
                    // The type and the size are checked BEFORE the content is read: the
                    // path lives in a user-writable directory, and a FIFO, a symlink to
                    // /dev/zero or a huge file would otherwise exhaust the read. An
                    // asynchronous read cannot be guarded from outside its callback, so
                    // the check opens it and the content is only asked for once it passed.
                    if (!info || info.get_file_type() !== this._gio.FileType.REGULAR || info.get_size() > ORDER_MAX_BYTES) {
                        this._ignore('not a small regular file');
                        this._loaded(null);
                        return;
                    }
                    this._loadContents(file);
                });
        }
        catch (e) {
            this._log('greenTile window-order read failed: ' + e);
            this._loaded(null);
        }
    }

    /**
     * The content half of the read: its callback keeps the second size check the
     * synchronous version had (the file can grow between the query and the read) and
     * then parses.
     * @param {any} file
     */
    _loadContents(file) {
        try {
            file.load_contents_async(null, (/** @type {any} */ _source, /** @type {any} */ res) => {
                /** @type {boolean} */
                let ok = false;
                /** @type {any} */
                let bytes = null;
                try {
                    [ok, bytes] = file.load_contents_finish(res);
                }
                catch (e) {
                    this._log('greenTile window-order read failed: ' + e);
                    this._loaded(null);
                    return;
                }
                if (!ok || !bytes) {
                    this._loaded(null);
                    return;
                }
                if (bytes.length > ORDER_MAX_BYTES) {
                    // the file grew between the query and the read
                    this._ignore('too large');
                    this._loaded(null);
                    return;
                }
                const store = orderParse(this._byteArray.toString(bytes));
                if (store === null) {
                    this._ignore('not valid greenTile data');
                }
                this._loaded(store);
            });
        }
        catch (e) {
            this._log('greenTile window-order read failed: ' + e);
            this._loaded(null);
        }
    }

    /**
     * The read settled: publish the snapshot, merge whatever this run recorded while
     * the read was in flight, and release everyone waiting for the store.
     * @param {{ v: number, s: Record<string, string[]> } | null} store
     */
    _loaded(store) {
        if (this._destroyed || this.ready) {
            // a late completion of a store that was already resolved (or destroyed)
            return;
        }
        this._snapshot = store;
        // A placement can land before the file is known (a window added right after
        // enable). It must not be lost to the read arriving later, so what this run
        // recorded is applied OVER the file's own surfaces.
        const overlay = this._store;
        /** @type {{ v: number, s: Record<string, string[]> }} */
        let merged = store || { v: ORDER_VERSION, s: {} };
        for (const key of Object.keys(overlay.s || {})) {
            merged = orderSet(merged, key, overlay.s[key]);
        }
        this._store = merged;
        this.ready = true;
        const waiting = this._readyCbs;
        this._readyCbs = [];
        for (const cb of waiting) {
            try {
                cb();
            }
            catch (e) {
                this._log('greenTile window-order ready callback failed: ' + e);
            }
        }
        if (this._dirty) {
            // a placement that arrived during the read still owes its write
            this._schedule();
        }
    }

    /**
     * Runs cb once the store is known — immediately when it already is. One-shot, and
     * a destroyed store releases nobody: that is what keeps a deferred retile off a
     * torn-down App.
     * @param {() => void} cb
     */
    onReady(cb) {
        if (this._destroyed) {
            return;
        }
        if (this.ready) {
            cb();
            return;
        }
        this._readyCbs.push(cb);
    }

    /**
     * Logs a rejected file once per store. A file that is not this code's own is
     * never an error that could break tiling: it is ignored and reported.
     * @param {string} why
     */
    _ignore(why) {
        if (!this._corruptLogged) {
            this._corruptLogged = true;
            this._log('greenTile window-order file ignored (' + why + ')');
        }
    }

    /** Arms (or re-arms) the coalesced write. */
    _schedule() {
        if (this._timer) {
            this._mainloop.source_remove(this._timer);
        }
        this._timer = this._mainloop.timeout_add(ORDER_WRITE_MS, () => {
            this._timer = 0;
            if (!this._destroyed) {
                this._flush();
            }
            return false;
        });
    }

    /**
     * Writes the whole store, privately and replacing any previous content. A failure
     * (no runtime dir, read-only home, full disk) is logged and swallowed; the store
     * keeps the latest order, so a later placement that changes it self-heals. The
     * directory is prepared first and the write is chained to it, both asynchronously.
     */
    _flush() {
        if (this._timer) {
            try {
                this._mainloop.source_remove(this._timer);
            }
            catch (_e) {
                // the source was already gone
            }
            this._timer = 0;
        }
        if (!this._runtimeDir || !this.ready) {
            // A store that is still loading holds only what this run recorded: writing
            // it back would drop every surface the file still has.
            return;
        }
        this._makeDir(() => this._write());
    }

    /**
     * Prepares the private (0700) directory, then hands over to the write. An existing
     * directory is the normal case — the finish reports EXISTS — and is not a failure;
     * any other error means the store has nowhere to go, so the write is skipped (the
     * next placement retries it) instead of stamping a file into a missing directory.
     * @param {() => void} done
     */
    _makeDir(done) {
        /** @type {any} */
        let file = null;
        try {
            file = this._gio.File.new_for_path(this._dir());
        }
        catch (e) {
            this._log('greenTile window-order dir could not be created: ' + e);
            return;
        }
        try {
            file.make_directory_async(this._glib.PRIORITY_DEFAULT, null,
                (/** @type {any} */ _source, /** @type {any} */ res) => {
                    try {
                        file.make_directory_finish(res);
                    }
                    catch (e) {
                        if (!isExistsError(this._gio, e)) {
                            this._log('greenTile window-order dir could not be created: ' + e);
                            return;
                        }
                    }
                    this._setDirMode(file, done);
                });
        }
        catch (e) {
            this._log('greenTile window-order dir could not be created: ' + e);
        }
    }

    /**
     * Applies the private (0700) mode — make_directory_async takes no mode — and hands
     * over to the write. A failure is logged and swallowed: the write reports the real
     * error on the next placement.
     * @param {any} file
     * @param {() => void} done
     */
    _setDirMode(file, done) {
        /** @type {any} */
        let info = null;
        try {
            info = this._gio.FileInfo.new();
            info.set_attribute_uint32('unix::mode', ORDER_DIR_MODE);
        }
        catch (e) {
            this._log('greenTile window-order dir mode could not be set: ' + e);
            done();
            return;
        }
        try {
            file.set_attributes_async(info, this._gio.FileQueryInfoFlags.NONE, this._glib.PRIORITY_DEFAULT, null,
                (/** @type {any} */ _source, /** @type {any} */ res) => {
                    try {
                        file.set_attributes_finish(res);
                    }
                    catch (e) {
                        this._log('greenTile window-order dir mode could not be set: ' + e);
                    }
                    done();
                });
        }
        catch (e) {
            this._log('greenTile window-order dir mode could not be set: ' + e);
            done();
        }
    }

    /** The write half: the whole store, user-only (PRIVATE), atomically replacing the file. */
    _write() {
        try {
            const bytes = new this._glib.Bytes(this._byteArray.fromString(JSON.stringify(this._store)));
            /** @type {any} */
            const file = this._gio.File.new_for_path(this._path());
            file.replace_contents_bytes_async(bytes, null, false,
                this._gio.FileCreateFlags.PRIVATE | this._gio.FileCreateFlags.REPLACE_DESTINATION, null,
                (/** @type {any} */ _source, /** @type {any} */ res) => {
                    try {
                        file.replace_contents_finish(res);
                    }
                    catch (e) {
                        this._log('greenTile window-order write failed: ' + e);
                    }
                });
        }
        catch (e) {
            this._log('greenTile window-order write failed: ' + e);
        }
    }

    /**
     * The stored order for a (monitor, workspace) surface, for the FIRST retile of
     * that surface since enable — null afterwards, and null when there is none.
     * Resolving against the App's monitors keeps the key identical to the one
     * record() writes.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {string[] | null}
     */
    restore(app, monitorIndex, wsIndex) {
        if (this._destroyed) {
            return null;
        }
        try {
            const mkey = app.monitors.keys[monitorIndex];
            if (!mkey) {
                return null;
            }
            const key = orderKey(mkey, app.monitors.wsKey(monitorIndex, wsIndex));
            const used = app.session.orderUsed;
            if (used.has(key)) {
                return null;
            }
            if (!this.ready) {
                // The read has not landed yet. Answering null here would be a lie the
                // caller cannot tell apart from "no order", and spending the surface
                // would drop the order the file holds. So the surface stays OWED: the
                // settle fan-out waits for the store (lib/runtime/auto.js), and a
                // retile that ran too early still restores on its next pass.
                if (!this._earlyLogged) {
                    this._earlyLogged = true;
                    this._log('greenTile window-order restore asked before the store was ready');
                }
                return null;
            }
            used.add(key);
            const ids = orderGet(this._snapshot, key);
            if (ids) {
                this._log('greenTile restart order used ws' + (wsIndex + 1) + ' mon=' + mkey);
            }
            return ids;
        }
        catch (e) {
            this._log('greenTile window-order restore failed: ' + e);
            return null;
        }
    }

    /**
     * Records the order a placement produced. Only windows with an X11
     * description count (a Wayland window has none), and fewer than two leaves no
     * order to restore. An unchanged order writes nothing. A FIRST placement that
     * holds fewer than two windows keeps the stored order: that set can still be
     * opening after a restart.
     *
     * Two callers exist and they differ in what they teach the store:
     * - `explicit` (a swap, an edge resize, or the drag-and-drop that placed the
     *   window the user moved): the placement IS the user's arrangement, so it is
     *   recorded and the surface's pending restore is closed — a later retile must
     *   not undo it.
     * - otherwise the retile placed the surface's windows by their live positions,
     *   which after a restart are the ones Muffin scrambled them into. That is no
     *   order to learn from while the surface's stored one is still waiting to be
     *   restored (a background workspace retiled by an exclusion toggle): writing it
     *   would destroy exactly the order the restore is for.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {CinnamonWindow[]} ordered the windows in placement order
     * @param {boolean} [explicit] the placement came from a user arrangement
     */
    record(app, monitorIndex, wsIndex, ordered, explicit = false) {
        if (this._destroyed || !this._runtimeDir) {
            return;
        }
        try {
            const mkey = app.monitors.keys[monitorIndex];
            if (!mkey) {
                return;
            }
            const key = orderKey(mkey, app.monitors.wsKey(monitorIndex, wsIndex));
            const used = app.session.orderUsed;
            // the surface's restore is still waiting: this is its FIRST placement, so
            // the set may not be complete yet (its windows can still be opening)
            const first = !used.has(key);
            if (!explicit && first) {
                return;
            }
            used.add(key);
            /** @type {unknown[]} */
            const ids = [];
            for (const w of ordered) {
                let desc = null;
                try {
                    desc = w.get_description();
                }
                catch (_e) {
                    desc = null;
                }
                ids.push(desc);
            }
            // A FIRST placement of fewer than two windows is a set that can still be
            // opening (the mode places a lone window), and orderSet would REMOVE the
            // surface's entry for such a list: record nothing and keep the stored order.
            // The restore is closed above either way, so a user arrangement keeps its
            // word, and an established surface that shrank to one window still drops its
            // record.
            if (first && ordered.length < 2) {
                return;
            }
            // restore() spends the surface's one restore BEFORE this placement runs, so
            // `first` is already false and the guard above cannot protect the set. A
            // placement right after the restore that holds FEWER windows than the stored
            // order is therefore not evidence that windows are gone: a minimized window,
            // or one Muffin has not moved back yet, is simply not collected this pass.
            // Writing it would silently shrink the order the surface exists to keep.
            // Keeping it is safe — a stored id with no window is skipped on restore and
            // the next full placement writes the truth.
            const stored = orderGet(this._store, key);
            if (!explicit && !first && stored !== null && ids.length < stored.length) {
                return;
            }
            const next = orderSet(this._store, key, ids);
            if (JSON.stringify(next) === JSON.stringify(this._store)) {
                return;
            }
            this._store = next;
            this._dirty = true;
            if (this.ready) {
                this._schedule();
            }
            // While the store is still loading nothing is written: _loaded schedules the
            // write once the file (and with it the other surfaces) is known.
        }
        catch (e) {
            this._log('greenTile window-order record failed: ' + e);
        }
    }

    /**
     * Stops the debounce timer after flushing the pending write: the last
     * placement before a teardown is not lost.
     */
    destroy() {
        this._destroyed = true;
        // nobody waiting for the store may run a retile into a torn-down App
        this._readyCbs = [];
        if (this._timer) {
            this._flush();
        }
        this._timer = 0;
    }
};
