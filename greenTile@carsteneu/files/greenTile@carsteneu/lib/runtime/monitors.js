/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App monitor registry: stable per-monitor keys and display labels, rebuilt
 * at App boot and owned by the App (monitors-changed destroys the App, so this
 * state is effectively per App). Keys come from the DisplayConfig tuples via
 * the monitor-model block; a monitor that stays unknown (DBus failure) keeps a
 * fallback key, logged once per extension session. Teardown is two lines: the
 * epoch guard first (a synchronous throw inside monitors-changed must never
 * leave teardown half done), the Gio.Cancellable second — a cancelled call
 * still invokes its callback, and the epoch check makes that reply a silent
 * no-op. All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { pendingRegistry } = XLET.lib.model.lifecycle;
const { monitorFallbackKey, monitorStates, monitorLabels, monitorWsKey } = XLET.lib.model.monitor;

/**
 * Monitor registry owner: stable per-monitor keys and display labels.
 * @typedef {Object} MonitorsDeps
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} global the global object
 * @property {AnyRecord} session the extension Session carrying the fallback-logged flag
 */
var Monitors = class {
    /**
     * @param {MonitorsDeps} deps
     */
    constructor(deps) {
        this._main = deps.main;
        this._gio = deps.gio;
        this._meta = deps.meta;
        this._global = deps.global;
        this._session = deps.session;
        this._registry = pendingRegistry();
        this._cancellable = null;
        this._muffinSettings = null;
        /** @type {string[]} */ this.keys = [];
        /** @type {string[]} */ this.labels = [];
        this.ready = false;
    }

    /**
     * Rebuilds keys and labels from the current DisplayConfig state and the
     * layout manager monitors, asynchronously.
     * @param {() => void} onReady
     */
    refresh(onReady) {
        // Monitor changes destroy and recreate the App; a late reply for a refresh that
        // belongs to a destroyed App must not connect observers or write registry state.
        const epoch = this._registry.begin();
        this.ready = false;
        this.keys = [];
        this.labels = [];
        this._cancelCurrent();
        this._cancellable = new this._gio.Cancellable();
        this._gio.DBus.session.call('org.cinnamon.Muffin.DisplayConfig', '/org/cinnamon/Muffin/DisplayConfig',
            'org.cinnamon.Muffin.DisplayConfig', 'GetCurrentState', null, null,
            this._gio.DBusCallFlags.NONE, 3000, this._cancellable, (/** @type {AnyRecord} */ source, /** @type {AnyRecord} */ result) => {
                if (!this._registry.is_current(epoch)) {
                    return;
                }
                /** @type {AnyRecord[]} */
                let states = [];
                try {
                    const reply = source.call_finish(result);
                    const unpacked = reply.deep_unpack();
                    states = monitorStates(Array.isArray(unpacked) ? unpacked[1] : null);
                }
                catch (e) {
                    this._global.log('greenTile DisplayConfig.GetCurrentState failed: ' + e);
                }
                const monitors = this._main.layoutManager.monitors;
                const keys = monitors.map(() => '');
                const connectors = monitors.map(() => '');
                for (const state of states) {
                    const index = this._meta.MonitorManager.get().get_monitor_for_connector(state.connector);
                    if (index < 0 || index >= keys.length) {
                        continue;
                    }
                    keys[index] = state.key;
                    connectors[index] = state.connector;
                }
                // Meta.Display.get_monitor_name exists from Cinnamon 6.4 on. On older
                // versions there is no human name to ask for, so the connector (or the
                // index) stands in — a throw here would abort this callback and leave
                // the registry unready, which kills every tiling path. Only the name
                // source changes: keys still come from the DisplayConfig tuple, so a
                // monitor keeps its stored layout; what differs before 6.4 is the panel
                // label, plus the fallback key of a monitor with no DisplayConfig state.
                const canName = typeof this._global.display.get_monitor_name === 'function';
                const names = monitors.map((/** @type {AnyRecord} */ m, /** @type {number} */ i) => canName ? this._global.display.get_monitor_name(i) : (connectors[i] || 'monitor-' + i));
                for (let i = 0; i < keys.length; i++) {
                    if (!keys[i] && monitors[i]) {
                        keys[i] = monitorFallbackKey(names[i], monitors[i].width, monitors[i].height);
                        if (!this._session.monitorFallbackLogged) {
                            this._session.monitorFallbackLogged = true;
                            this._global.log('greenTile monitor key fallback for ' + names[i] + ' (' + keys[i] + ')');
                        }
                    }
                }
                this.keys = keys;
                this.labels = monitorLabels(names, connectors);
                this.ready = true;
                this._global.log('greenTile monitors: ' + keys.map((/** @type {string} */ k, /** @type {number} */ i) => i + '=' + k).join(', '));
                onReady();
            });
    }

    /**
     * The epoch guard invalidates pending replies, the cancellable is the
     * second line of teardown.
     */
    destroy() {
        this._registry.invalidate();
        this._cancelCurrent();
    }

    _cancelCurrent() {
        if (this._cancellable) {
            try {
                this._cancellable.cancel();
            }
            catch (_e) {
                // the call was already gone
            }
            this._cancellable = null;
        }
    }

    /**
     * Cached muffin schema: 'workspaces-only-on-primary' shapes the workspace
     * part of every layout key.
     * @returns {boolean}
     */
    onlyPrimary() {
        if (!this._muffinSettings) {
            this._muffinSettings = new this._gio.Settings({ schema_id: 'org.cinnamon.muffin' });
        }
        return this._muffinSettings.get_boolean('workspaces-only-on-primary');
    }

    /**
     * Workspace key for a layout lookup: numbered on the primary monitor (and
     * always when workspaces-only-on-primary is off), '*' for every other
     * monitor when the setting is on.
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {string}
     */
    wsKey(monitorIndex, wsIndex) {
        return monitorWsKey(wsIndex, monitorIndex === this._main.layoutManager.primaryIndex, this.onlyPrimary());
    }
};
