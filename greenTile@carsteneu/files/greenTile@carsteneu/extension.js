/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * The single entry: init/enable/disable as Cinnamon requires them
 * (extension.js requiredFunctions check in
 * /usr/share/cinnamon/js/ui/extension.js). Modified version of 5.4/extension.js
 * from gTile (UUID gTile@shuairan), derived from gTile 2.2.1; the session is
 * created from lib/app, the composition root.
 *
 * Loading works through both module generations: the 6.6 legacy loader wraps
 * this file as createExports and, without an explicit module.exports line,
 * exports the top-level function declarations itself; the native importer
 * exposes them as public namespace properties. That is also why no
 * module.exports line may return: under native loading the module global does
 * not exist (upstream only shims it inside the deprecated require stack).
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];
const { App } = XLET.lib.app.app;
const { Session } = XLET.lib.runtime.session;

// init/enable/disable are called member-style on the loaded module in both
// generations (extensionSystem.js: getModuleByIndex(i).enable() legacy,
// extension.module.enable() native), yet the session does not ride `this`: the
// extensibility of a natively imported namespace is not a contract we rely on.
// The module-private holder below owns the session instead — the one allowed
// top-level mutable binding (see zero-module-state.test.js). Reload semantics
// differ per generation and are safe here only because nothing else lives at
// module level: on 6.6 forgetExtension re-evaluates this ENTRY (fileUtils
// unloadModule is dir-wide for the entry directory, then
// delete imports.extensions[uuid] FAILS — the native dir-importer property is
// permanent, configurable:false), while the lib modules resolved through that
// tree stay cached for the process lifetime (installed cjs 115 exposes no
// clearCache). The pinned upstream clearXletImportCache clears only its
// PRIVATE per-extension importer (extension.imports); the shared
// imports.extensions tree the XLET chains address is left alone, so those lib
// modules also survive a reload. On neither generation does a reload refresh
// edited lib byte contents in place (younger upstream can via a private
// importer the entry would have to route its chains through). With top-level
// state reduced to this holder, that asymmetry cannot leak between sessions.
//
// The limitation is accepted, not worked around: disable/enable is a LIFECYCLE
// operation and stays fully correct, while replacing files is a SOURCE update
// that only a fresh Cinnamon process activates. The files on disk and the code
// a running Cinnamon executes are therefore two different things; install.sh
// says so, and no reload is presented as activating replaced library code.
// X11 restarts with Alt+F2 then r, Wayland has no such restart and needs a log
// out and back in. No build-generation directories or importer rebinding are
// used for this.
/** @type {{ session: { destroy(): void } | null }} */
const lifecycle = { session: null };

/**
 * Read view on the session for settings-button diagnostics and the white-box
 * tests: enable()/disable() keep the only writers. Returns the live Session
 * or null between enable/disable — never the holder itself, so no consumer
 * can repoint the owner.
 */
var currentSession = () => lifecycle.session;

function init() {
}

/**
 * One extension session per enable(): it outlives every App recreation and
 * carries the state that must survive them (settle wait, fallback-logged
 * flag, the monitors-changed handler on its own scope).
 */
function enable() {
    const Main = imports.ui.main;
    const Mainloop = imports.mainloop;
    const SignalManager = imports.misc.signalManager.SignalManager;
    const Gio = imports.gi.Gio;
    const Meta = imports.gi.Meta;
    /**
     * @param {string} msg
     */
    const log = (msg) => global.log(msg);
    const session = new Session({
        signalManager: new SignalManager(),
        layoutManager: Main.layoutManager,
        mainloop: Mainloop,
        gobject: imports.gi.GObject,
        now: Date.now,
        log,
        /**
         * @param {any} app
         */
        onSettled: (app) => app.auto.settleAll(app),
        /**
         * @param {any} appSession
         */
        createApp: (appSession) => new App(appSession, {
            main: Main,
            gio: Gio,
            meta: Meta,
            global: global,
            gobject: imports.gi.GObject,
            cinnamonNs: imports.gi.Cinnamon,
        }),
    });
    // own the constructed session BEFORE start(): if the settings slot or a
    // hotkey fails mid-start, the rollback paths must find — and disable()
    // must release — the partially wired session
    lifecycle.session = session;
    session.start();
}

/**
 * Disables: destroys the session created by enable().
 */
function disable() {
    // destroy() takes the monitors-changed handler down FIRST, then the App
    // dies — no monitor change can resurrect an App after disable, even when
    // app.destroy() throws.
    if (lifecycle.session) {
        lifecycle.session.destroy();
        lifecycle.session = null;
    }
}
