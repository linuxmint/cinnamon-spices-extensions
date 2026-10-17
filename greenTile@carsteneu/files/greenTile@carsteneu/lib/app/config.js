/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Per-App settings owner, derived from gTile 2.2.1 (src/base/config.ts): binds the
 * persisted settings to the app through two declarative tables (settings
 * bindings, hotkey registrations) and owns the teardown order — the split
 * flush writes before the runtime teardowns die, settings.finalize() runs
 * LAST, after every consumer of bound callbacks is gone. It also subscribes to
 * changed::layouts so an external value-changing write of the layouts setting
 * invalidates the App's deferred split writes (own writes never emit it).
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];
const { appColumns, exclRetile, singleRetile } = XLET.lib.tiling.retile;
const { swapHotkey } = XLET.lib.tiling.swap;
const { panelToggle } = XLET.lib.ui.panel;

// The 14 static hotkeys: settings prop, registered name and the tiling
// command the hotkey runs. register removes every name first, so a binding
// change re-registers exactly once. The commands that read or move tiled geometry
// (columns, resize, swap) wait behind the retiles a workspace switch holds
// (lib/runtime/auto.js afterSwitchPress): answered from the frames before those
// retiles ran, a second Super+Ctrl+Arrow inside the effect lands one cell off.
/**
 * @param {AppFacade} app
 * @param {() => void} fn
 */
const press = (app, fn) => app.auto.afterSwitchPress(fn);
const HOTKEYS = Object.freeze([
    { name: 'greenTile-auto6', prop: SETTINGS_KEYS.columns6Hotkey, command: (/** @type {AppFacade} */ app) => press(app, () => appColumns(app, 6)) },
    { name: 'greenTile-auto3', prop: SETTINGS_KEYS.columns3Hotkey, command: (/** @type {AppFacade} */ app) => press(app, () => appColumns(app, 3)) },
    { name: 'greenTile-autoN', prop: SETTINGS_KEYS.autoOnHotkey, command: (/** @type {AppFacade} */ app) => app.auto.activate(app) },
    { name: 'greenTile-autoOff', prop: SETTINGS_KEYS.autoOffHotkey, command: (/** @type {AppFacade} */ app) => app.auto.deactivate(app) },
    { name: 'greenTile-preset', prop: SETTINGS_KEYS.presetHotkey, command: (/** @type {AppFacade} */ app) => panelToggle(app) },
    { name: 'greenTile-exclude', prop: SETTINGS_KEYS.excludeHotkey, command: (/** @type {AppFacade} */ app) => app.excl.toggleFocused(app) },
    { name: 'greenTile-resize-wider', prop: SETTINGS_KEYS.resizeWiderHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => app.split.hotkey(app, 'wider')) },
    { name: 'greenTile-resize-narrower', prop: SETTINGS_KEYS.resizeNarrowerHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => app.split.hotkey(app, 'narrower')) },
    { name: 'greenTile-resize-taller', prop: SETTINGS_KEYS.resizeTallerHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => app.split.hotkey(app, 'taller')) },
    { name: 'greenTile-resize-shorter', prop: SETTINGS_KEYS.resizeShorterHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => app.split.hotkey(app, 'shorter')) },
    { name: 'greenTile-swap-left', prop: SETTINGS_KEYS.swapLeftHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => swapHotkey(app, 'left')) },
    { name: 'greenTile-swap-right', prop: SETTINGS_KEYS.swapRightHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => swapHotkey(app, 'right')) },
    { name: 'greenTile-swap-up', prop: SETTINGS_KEYS.swapUpHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => swapHotkey(app, 'up')) },
    { name: 'greenTile-swap-down', prop: SETTINGS_KEYS.swapDownHotkey, command: (/** @type {AppFacade} */ app) => press(app, () => swapHotkey(app, 'down')) },
]);

// The settings bindings: schema key, instance prop and the handler a dialog
// change fires. Order matters — it is the init order of the binds.
const BINDINGS = Object.freeze([
    { key: SETTINGS_KEYS.columns6Hotkey, prop: SETTINGS_KEYS.columns6Hotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.columns3Hotkey, prop: SETTINGS_KEYS.columns3Hotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.autoOnHotkey, prop: SETTINGS_KEYS.autoOnHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.autoOffHotkey, prop: SETTINGS_KEYS.autoOffHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.presetHotkey, prop: SETTINGS_KEYS.presetHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.excludeHotkey, prop: SETTINGS_KEYS.excludeHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    {
        key: SETTINGS_KEYS.exclusions,
        prop: SETTINGS_KEYS.exclusions,
        changed: (/** @type {Config} */ config) => {
            config.app.excl.apply(config.settings);
            exclRetile(config.app);
        },
    },
    {
        key: SETTINGS_KEYS.excludeAppPicker,
        prop: 'excludeAppPickerValue',
        changed: (/** @type {Config} */ config) => {
            config.app.excl.picked(config.settings, config.app, config.settings.getValue(SETTINGS_KEYS.excludeAppPicker));
        },
    },
    { key: SETTINGS_KEYS.resizeWiderHotkey, prop: SETTINGS_KEYS.resizeWiderHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeNarrowerHotkey, prop: SETTINGS_KEYS.resizeNarrowerHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeTallerHotkey, prop: SETTINGS_KEYS.resizeTallerHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeShorterHotkey, prop: SETTINGS_KEYS.resizeShorterHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapLeftHotkey, prop: SETTINGS_KEYS.swapLeftHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapRightHotkey, prop: SETTINGS_KEYS.swapRightHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapUpHotkey, prop: SETTINGS_KEYS.swapUpHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapDownHotkey, prop: SETTINGS_KEYS.swapDownHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.panelTheme, prop: SETTINGS_KEYS.panelTheme, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.accentMode, prop: SETTINGS_KEYS.accentMode, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.accentColor, prop: SETTINGS_KEYS.accentColor, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.stateMode, prop: SETTINGS_KEYS.stateMode, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.stateColor, prop: SETTINGS_KEYS.stateColor, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.focusBorder, prop: 'focusBorderValue', changed: (/** @type {Config} */ config) => config.app.border.update() },
    {
        key: SETTINGS_KEYS.singleWindowMode,
        prop: 'singleWindowModeValue',
        changed: (/** @type {Config} */ config) => singleRetile(config.app),
    },
]);

// Cumulative size of the starter preset set after every generation of starters added to
// the schema default. The boundary tells the import which starters an install that
// already has generation N is still missing.
const STARTER_GENERATIONS = Object.freeze([12, 16]);

var Config = class {
    /**
     * @param {AppFacade} app
     */
    constructor(app) {
        this.app = app;
        // The App's asynchronous start can fail and roll the App back, after which
        // the recreation (or the session teardown) destroys this shell once more.
        this._destroyed = false;
        const Settings = imports.ui.settings;
        // Rollback on partial initialization: every acquisition below (the
        // settings slot with its binds, the installed-changed handler, the
        // hotkeys, the theme sheet, the focus overrides, the border actor) is
        // released when a later acquisition throws — Cinnamon logs an
        // enable()/recreation failure but never calls disable() for it.
        try {
            this.settings = new Settings.ExtensionSettings(this, 'greenTile@carsteneu');
            this._migrateSingleWindow();
            this._importStarterPresets();
            this._seedExclusionDefaults();
            // Wired before the first bind: a reload that lands while the bindings
            // are being installed must already invalidate. Own writes never emit
            // changed::layouts, so nothing else has to be sequenced around it.
            this._initSettingsObserver();
            for (const binding of BINDINGS) {
                this.settings.bind(binding.key, binding.prop, () => binding.changed(this), null);
            }
            // The exclusions must exist before the first bound callback can apply
            // a dialog change to them.
            this.app.excl.start(this.settings);
            this.registerHotkeys();
            this.app.theme.init(this);
            this.app.focus.connect(this.app);
            this.app.border.init(this.app);
            app.monitors.refresh(() => {
                // The monitor reply arrives after this constructor returned, so
                // this callback is the only catch for a failure in the
                // asynchronous start. One boundary covers the whole start —
                // observers, queued auto commands, the settle wait — because a
                // failure in any of them means this App never became fully
                // started: its hotkeys would address an observer set that is not
                // there, and its settle wait would retile into a torn-down App.
                // The App is rolled back whole and the session drops it; the next
                // monitor change builds a fresh one (which registers everything
                // exactly once), and a queued auto command survives on the session
                // for that fresh App to apply.
                try {
                    app.auto.connectAll(app);
                    // The wait Muffin's window moves owe is armed first: a failure
                    // in the queued command below must not cancel it (the wait is
                    // the session's), and the retile it schedules is at least a turn
                    // away, so the pause is still in place long before any retile.
                    app.session.settle.consumePending(app);
                    // Auto on/off pressed before the registry was ready rides the
                    // session: apply it now, before the settle retile, so no
                    // automatic tiling runs against a requested pause.
                    app.auto.applyPending(app);
                }
                catch (e) {
                    global.logError('greenTile monitor-ready start failed: ' + e);
                    // The whole start failed: roll the App back at once and let the
                    // session own the shell until the next recreation.
                    app.session.rollbackApp(app);
                }
            });
        }
        catch (e) {
            // destroy() tolerates the partial state (per-step isolation) and
            // keeps finalize last, then the error travels to the caller.
            this.destroy();
            throw e;
        }
    }

    // One-time migration of the boolean "Fill the monitor with a single window"
    // into the singleWindowMode select. The old key stays in the schema (out of
    // every section, so it is hidden) because Cinnamon's _doUpgrade drops a key
    // that is no longer declared — reading it is the only way to keep a user's
    // choice. An existing install keeps its old switch (true -> 'fill', false ->
    // 'leave'), a fresh install is left on the schema default ('center').
    //
    // Recognising an existing install takes two signals, because a new key always
    // arrives with its default and starterPresetsImported only exists since 2.2.1:
    // that marker covers 2.2.1 and later, an older install shows its preset list
    // instead. A file created by this release holds the shipped starters (the
    // schema default); every older file holds the 2.2.0 default '[]' or the user's
    // own presets, since _doUpgrade keeps a stored value for a key that is still
    // declared. Read BEFORE _importStarterPresets, so the list is still the file's.
    // The marker is authoritative and read first, so neither a later change of the
    // select nor the starter import that runs right after re-runs the migration.
    //
    // On a downgrade the old key still carries its pre-update value: a user who
    // had the switch off and later picked "Fill the monitor" loses that later
    // choice after the downgrade.
    _migrateSingleWindow() {
        const settings = this.settings;
        if (settings.getValue(SETTINGS_KEYS.singleWindowMigrated) === true) {
            return;
        }
        const imported = settings.getValue(SETTINGS_KEYS.starterPresetsImported) === true;
        const shippedPresets = settings.getValue(SETTINGS_KEYS.presets)
            === settings.getDefaultValue(SETTINGS_KEYS.presets);
        if (imported || !shippedPresets) {
            settings.setValue(SETTINGS_KEYS.singleWindowMode,
                settings.getValue(SETTINGS_KEYS.fillSingleWindow) === true ? 'fill' : 'leave');
        }
        settings.setValue(SETTINGS_KEYS.singleWindowMigrated, true);
    }

    // One-time additive import, regardless of how the extension was installed. Defaults are
    // read from the schema, so fresh installs and a partially saved import deduplicate
    // naturally. Existing names (including edited namesakes) win; once a generation is
    // recorded, deletions/renames are never touched again. A generation is a batch of
    // starters added to the schema default in one release: generation 1 is the twelve
    // shipped up to 2.2.3 (the boolean marker recorded them before the counter existed),
    // generation 2 adds the four span starters.
    _importStarterPresets() {
        const settings = this.settings;
        const raw = settings.getValue(SETTINGS_KEYS.presets);
        let current, starters, layouts;
        try {
            current = JSON.parse(raw);
            starters = JSON.parse(settings.getDefaultValue(SETTINGS_KEYS.presets));
            layouts = JSON.parse(settings.getValue(SETTINGS_KEYS.layouts) || '{}');
        }
        catch (_e) {
            return; // unreadable user data is never replaced or marked complete
        }
        const valid = (/** @type {any} */ p) => p && typeof p === 'object'
            && typeof p.id === 'string' && p.id && typeof p.name === 'string' && Array.isArray(p.rules);
        if (!Array.isArray(current) || !current.every(valid)
            || !Array.isArray(starters) || starters.length !== STARTER_GENERATIONS[STARTER_GENERATIONS.length - 1]
            || !starters.every(valid)
            || !layouts || typeof layouts !== 'object' || Array.isArray(layouts)) {
            return;
        }
        const used = new Set(current.map(p => p.id));
        if (used.size !== current.length) {
            return;
        }
        for (const monitor of Object.values(layouts)) {
            if (!monitor || typeof monitor !== 'object' || Array.isArray(monitor)) {
                return;
            }
            for (const entry of Object.values(monitor)) {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                    return;
                }
                if (typeof entry.preset === 'string') used.add(entry.preset);
            }
        }
        // The generation this install already has. The boolean marker of up to 2.2.3 is
        // authoritative: without it nothing was imported at all, with it the twelve are
        // generation 1 and an unreadable counter (hand-edited file, or the key absent
        // before Cinnamon applied its schema default) changes nothing.
        const marked = settings.getValue(SETTINGS_KEYS.starterPresetsImported) === true;
        const stored = Number(settings.getValue(SETTINGS_KEYS.starterGeneration));
        const generation = marked ? (Number.isInteger(stored) && stored > 0 ? stored : 1) : 0;
        if (generation >= STARTER_GENERATIONS.length) {
            return;
        }
        const from = generation > 0 ? STARTER_GENERATIONS[generation - 1] : 0;
        const names = new Set(current.map(p => p.name));
        const next = current.slice();
        let id = 1;
        for (const preset of starters.slice(from)) {
            if (names.has(preset.name)) continue;
            while (used.has('p' + id)) id++;
            const newId = 'p' + id++;
            used.add(newId);
            names.add(preset.name);
            next.push({ ...preset, id: newId });
        }
        if (next.length !== current.length) {
            settings.setValue(SETTINGS_KEYS.presets, JSON.stringify(next));
        }
        settings.setValue(SETTINGS_KEYS.starterPresetsImported, true);
        settings.setValue(SETTINGS_KEYS.starterGeneration, STARTER_GENERATIONS.length);
    }

    // One-time additive seed of the built-in exclusion rows (the Cinnamon xlet
    // settings dialogs, whose WM_CLASS is "xlet-settings.py" — verified live on
    // Cinnamon 6.6.4: the dialog is a NORMAL top-level window that would otherwise
    // be tiled). Fresh installs carry the rows in the schema default; an existing
    // install gets a row appended ONCE, so a row the user later deletes is never
    // re-added (the marker is authoritative) and an equivalent row the user already
    // has is left alone.
    //
    // This write appends to the RAW stored list, so rows this reader cannot parse —
    // and rows of any shape it does not recognise — stay exactly as they are (the
    // settings dialog's own writer, exclRowsAppend, normalizes differently); a value
    // that is not a list at all (hand-edited file, foreign content) is never replaced
    // and never marked, so the seed simply retries on the next start.
    _seedExclusionDefaults() {
        const settings = this.settings;
        if (settings.getValue(SETTINGS_KEYS.exclusionsSeeded) === true) {
            return;
        }
        const current = settings.getValue(SETTINGS_KEYS.exclusions);
        const builtin = settings.getDefaultValue(SETTINGS_KEYS.exclusions);
        if (!Array.isArray(current) || !Array.isArray(builtin)) {
            return;
        }
        // Equivalent = same kind and same text, comparing the text the way exclMatch
        // does (case-insensitive, trimmed); a row of a different kind is not the same
        // rule and never counts as a duplicate.
        const has = (/** @type {any} */ row) => current.some((/** @type {any} */ r) => r && typeof r === 'object'
            && r.match === row.match && typeof r.text === 'string'
            && r.text.trim().toLowerCase() === row.text.toLowerCase());
        const missing = builtin.filter((/** @type {any} */ row) => row && typeof row === 'object'
            && typeof row.match === 'string' && typeof row.text === 'string' && !has(row));
        if (missing.length !== 0) {
            // plain copies: the stored value must be its own data, never the objects
            // the schema default hands out
            settings.setValue(SETTINGS_KEYS.exclusions,
                current.concat(missing.map((/** @type {any} */ row) => ({ match: row.match, text: row.text }))));
        }
        settings.setValue(SETTINGS_KEYS.exclusionsSeeded, true);
    }

    /**
     * Makes an external write of the layouts setting invalidate the App's
     * deferred split writes (see Split.invalidate).
     *
     * Covered by this surface: an external value-changing write whose reload
     * reaches us before the 500 ms flush — the ordinary settings-dialog reset or
     * import. settings.js emits changed::<key> only for a key whose RELOADED value
     * differs (`_checkSettings`), and own writes never emit it (`_setValue` only
     * stores and saves), so an own layoutSet/preset/drop/unrelated write leaves a
     * pending resize valid.
     *
     * NOT covered (bounded BLOCKED, reproduced by
     * tests/app/settings-external-write.blocked-evidence.js):
     * (1) a value-IDENTICAL external write (a backup import that restores the value
     *     already in memory) is invisible here by construction — there is no value
     *     diff to report; (2) the settings dialog rewrites the whole FILE before its
     *     asynchronous notification (JsonSettingsWidgets.save_settings ->
     *     notify_callback -> remoteUpdate), so a flush landing in that gap still
     *     merges the pending splits over the external value and the later reload
     *     then sees no difference to correct it. Closing either case needs an
     *     authorship signal this surface does not have; the options and their
     *     contract conflicts are recorded on the BLOCKED report.
     */
    _initSettingsObserver() {
        this.settings.connect('changed::' + SETTINGS_KEYS.layouts, () => this.app.split.invalidate());
    }

    registerHotkeys() {
        // The hotkeys component carries the fixed greenTile binding names:
        // register removes every name first, so a binding change re-registers
        // exactly once.
        this.app.hotkeys.register(HOTKEYS.map((hotkey) => ({
            name: hotkey.name,
            bindings: /** @type {any} */ (/** @type {unknown} */ (this[/** @type {keyof Config} */ (hotkey.prop)])),
            callback: () => hotkey.command(this.app),
        })));
    }

    unregisterHotkeys() {
        this.app.hotkeys.remove();
    }

    destroy() {
        // A rolled back App's shell can be destroyed a second time (the recreation
        // replaces it, the session tears it down): only the first call tears down.
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        // Every step runs on its own: a failing step (settings writes via
        // flush are the realistic throwers — full disk, read-only home) must
        // not release the next component. Failures are collected and reported
        // once, so Cinnamon's extensionSystem does not abort on the first one
        // and unload the module with everything after the throw still live.
        /** @type {string[]} */ const failures = [];
        const step = (/** @type {string} */ label, /** @type {() => void} */ teardown) => {
            try {
                teardown();
            }
            catch (e) {
                failures.push(label + ': ' + (e instanceof Error ? e.message : String(e)));
            }
        };
        step('unregister hotkeys', () => this.unregisterHotkeys());
        step('exclusion rows', () => this.app.excl.destroy());
        // resize hotkey steps not yet written (500 ms debounce) must not get lost
        step('split flush', () => this.app.split.flush(this.app));
        step('monitors', () => this.app.monitors.destroy());
        step('auto', () => this.app.auto.destroy());
        // flushes the pending restart-order write; the file lives outside the
        // settings, so it does not have to wait for the finalize below
        step('orders', () => this.app.orders.destroy());
        // releases the in-flight window animations of this App: exactly the
        // transitions still owned, per window and per property isolated
        step('placement', () => this.app.placement.destroy());
        // drops the pending actor verification: a nudge after teardown would move a
        // window for an App that no longer owns the surface
        step('actorsync', () => this.app.actorsync.destroy());
        // both stay teardown-only: they remove timers/actors, they must not
        // write settings (finalize happens below)
        step('split', () => this.app.split.destroy());
        step('drop', () => this.app.drop.destroy());
        // The settle wait belongs to the session, not to this App: it stays owed
        // across an App rollback and is re-armed by the App that replaces this one
        // (its callback expires silently when its App is gone). The session stops
        // the timer in its own teardown and on a recreation.
        step('panel', () => this.app.panel.close());
        step('theme', () => this.app.theme.destroy());
        step('focus', () => this.app.focus.destroy());
        step('border', () => this.app.border.destroy());
        // settings dialog changes must no longer reach the destroyed app;
        // a dialog still open then throws in cinnamonDBus — Cinnamon's behaviour
        // for every finalized xlet. LAST, after every consumer of the bound
        // callbacks is gone — even when a teardown above failed.
        if (this.settings) {
            step('settings finalize', () => this.settings.finalize());
        }
        if (failures.length) {
            try {
                global.logError('greenTile cleanup completed with errors: ' + failures.join('; '));
            }
            catch (_e) {
                // the cleanup already ran; a failing report must not re-arm
                // the unload-despite-error behaviour this isolation prevents
            }
        }
    }
};
