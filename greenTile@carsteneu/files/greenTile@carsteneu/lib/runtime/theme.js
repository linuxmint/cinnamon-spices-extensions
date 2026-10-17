/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App theme and accent runtime: resolves the panel theme from the panelTheme
 * setting, the x-apps portal color scheme and the Cinnamon theme name, and reso-
 * lves theme-probed vs. custom accent/state colors, writing the generated
 * stylesheet — one sheet carrying the accent AND state rules — into the user
 * cache dir and loading/unloading it on the current St.Theme — the same
 * mechanism Cinnamon uses for extension stylesheets, so hover/focus
 * pseudo-classes keep working and an open panel restyles at once. Owned by the
 * App: theme_init re-created the portal/cinnamon Gio.Settings after every
 * shutdown anyway, so the whole state rides the App recreation. The generation
 * sequence is NOT here — it must outlive an App recreation and stays on the
 * session (nextAccentGen, seeded with the clock). Re-load hooks into
 * 'theme-set' because every Cinnamon theme switch replaces the whole St.Theme
 * object. init() gets the Config itself, not the app: it runs inside the
 * Config constructor, where the app's config property is not assigned yet.
 * The sheet is written asynchronously (Gio.replace_contents_bytes_async over
 * GLib.Bytes) into a PRIVATE per-Theme cache file whose private (0700) directory
 * is prepared asynchronously as well, and the resolved look —
 * theme class, colors, sheet load, border and an open panel — is committed only
 * once that write succeeded AND the live theme accepted the sheet. A slow or
 * failed write commits nothing new, and so does a refused load: the panel keeps
 * its previous colors (the same-path reload has already dropped the old sheet,
 * so the next changed() simply retries).
 * The write is never cancelled (a cancelled replace may leave the file
 * truncated); the per-Theme file keeps an old owner's late write away from a
 * new owner's file. All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const {
    accentDefault, accentParse, accentIsOwn,
    accentFromProbed, accentProbeFirst, accentTones, accentCss,
} = XLET.lib.model.accent;
const { stateDefault, stateMode, stateTones, stateCss } = XLET.lib.model.state;
const { themeResolve, THEME_CAIRO } = XLET.lib.model.theme;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

// The accent cache directory is owner-only; make_directory_async takes no mode, so
// the mode is applied with set_attributes_async right after the directory exists.
var PRIVATE_DIR_MODE = 0o700;

/**
 * True when a Gio error is the "already there" one. make_directory_finish reports an
 * existing directory as an error, and an existing directory is the normal case for
 * every start after the first — treating it as a failure would skip the write and
 * log an error on every run.
 * @param {AnyRecord} gio
 * @param {any} error
 * @returns {boolean}
 */
var existsError = function (gio, error) {
    try {
        return !!error && typeof error.matches === 'function'
            && error.matches(gio.io_error_quark(), gio.IOErrorEnum.EXISTS);
    }
    catch (_e) {
        return false;
    }
};

/**
 * Theme and accent runtime owner: stylesheet generation and theme/accent
 * probing and resolution.
 * @typedef {Object} ThemeDeps
 * @property {AnyRecord} st imports.gi.St
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the global object
 * @property {AnyRecord} glib imports.gi.GLib
 * @property {AnyRecord} byteArray imports.byteArray, fromString() = ByteArray
 * @property {() => string} nextAccentGen () => 'gk-acc<n>'
 * @property {() => AnyRecord | null} panelOpen () => app.panel.actor, null while no panel is open
 * @property {(app: AppFacade) => void} panelRebuild (app) => panelRebuild(app)
 */
/**
 * Config surface the theme reads and restyles through. init() gets the Config
 * itself, not the app: it runs inside the Config constructor, where the app's
 * config property is not assigned yet — it is set once the constructor finishes.
 * @typedef {Object} ThemeConfig
 * @property {SettingsFacade} settings
 * @property {AppFacade} app
 */
/**
 * One look request queued behind the asynchronous stylesheet write.
 * @typedef {Object} LookRequest
 * @property {string} css the generated stylesheet content for this look
 * @property {'dark' | 'light'} theme the resolved panel theme
 * @property {Rgb} base the resolved accent color
 * @property {Rgb} stateBase the resolved state color
 * @property {ThemeConfig} config
 */
var Theme = class {
    /**
     * @param {ThemeDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._st = deps.st;
        this._gio = deps.gio;
        this._main = deps.main;
        this._global = deps.global;
        this._glib = deps.glib;
        this._byteArray = deps.byteArray;
        /** @type {'dark' | 'light'} */ this._theme = 'dark';
        this._config = null;
        this._portal = null;
        this._portalSig = 0;
        this._cinnamon = null;
        this._cinnamonSig = 0;
        this._rgb = accentDefault;
        this._stateRgb = null;
        this._path = null;
        this._themeObj = null;
        this._themeSig = 0;
        this._gen = '';
        // The css currently on disk ('' until the first write) and the css
        // currently loaded on _themeObj: a request equal to _written needs no
        // write, one differing from _loaded needs a reload.
        this._written = '';
        this._loaded = '';
        // One async write at a time; _pending holds the newest look request while
        // it runs, so a slow write can never apply a superseded look.
        this._busy = false;
        this._pending = null;
        this._destroyed = false;
        this._deleteWhenDone = false;
        this._directoryReady = false;
        // Per-Theme cache file: an old owner's already-dispatched write cannot be
        // recalled (cancelling would truncate it), so each owner writes its own
        // file and removes it on teardown.
        this._token = 't' + Math.random().toString(36).slice(2);
    }

    /** Resolved panel theme. */
    get theme() {
        return this._theme;
    }

    /** Resolved accent color.
     * @returns {Rgb}
     */
    get rgb() {
        return this._rgb;
    }

    /** Resolved state color, null until the first change.
     * @returns {Rgb | null}
     */
    get stateRgb() {
        return this._stateRgb;
    }

    /** Current stylesheet generation class, '' while nothing is loaded. */
    get gen() {
        return this._gen;
    }

    /**
     * Cairo colors for the current theme (thumbnails, painter's dashed outline, the
     * painter's handle ink — everything the stylesheet does not cover).
     * @param {'thumb' | 'outline' | 'painter'} key
     * @returns {number[]}
     */
    cairo(key) {
        return THEME_CAIRO[this._theme][key];
    }

    panelClass() {
        return (this._theme === 'light' ? 'gk-panel gk-light' : 'gk-panel') + (this._gen ? ' ' + this._gen : '');
    }

    /**
     * @param {ThemeConfig} config
     */
    init(config) {
        if (this._portal === null) {
            const source = this._gio.SettingsSchemaSource.get_default();
            if (source && source.lookup('org.x.apps.portal', true)) {
                // gjs: the object form must go through the constructor, Settings.new takes the schema id string only
                this._portal = new this._gio.Settings({ schema_id: 'org.x.apps.portal' });
                this._portalSig = this._portal.connect('changed::color-scheme', () => this.changed());
            }
            if (source && source.lookup('org.cinnamon.theme', true)) {
                this._cinnamon = new this._gio.Settings({ schema_id: 'org.cinnamon.theme' });
                this._cinnamonSig = this._cinnamon.connect('changed::name', () => this.changed());
            }
        }
        if (this._themeSig === 0) {
            // Cinnamon theme switch: loadTheme replaced the St.Theme object — the accent
            // sheet is re-applied and the theme accent re-probed on top of the new theme
            // (through the async write queue, committed once it settled).
            this._themeSig = this._main.themeManager.connect('theme-set', () => this.changed());
        }
        this._config = config;
        this.changed();
    }

    /** Re-resolves theme and colors and rewrites the stylesheet when changed. */
    changed() {
        const config = this._config;
        if (!config) {
            return;
        }
        // the resolved theme is NOT committed here: the sheet is written
        // asynchronously, so the whole look is committed together in _commit
        // once the write won — a failed or superseded write leaves the old look
        const theme = themeResolve(
            config.settings.getValue(SETTINGS_KEYS.panelTheme),
            this._portal ? this._portal.get_string('color-scheme') : null,
            this._cinnamon ? this._cinnamon.get_string('name') : null
        );
        try {
            this._apply(config, theme);
        }
        catch (e) {
            // a failing accent (unusable probe) keeps the old look; a failing
            // write is reported asynchronously
            this._global.logError('greenTile: accent color: ' + e);
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._portal && this._portalSig) {
            try {
                this._portal.disconnect(this._portalSig);
            }
            catch (_e) {
                // signal was already gone
            }
            this._portal = null;
            this._portalSig = 0;
        }
        if (this._cinnamon && this._cinnamonSig) {
            try {
                this._cinnamon.disconnect(this._cinnamonSig);
            }
            catch (_e) {
                // signal was already gone
            }
            this._cinnamon = null;
            this._cinnamonSig = 0;
        }
        if (this._themeSig) {
            try {
                this._main.themeManager.disconnect(this._themeSig);
            }
            catch (_e) {
                // signal was already gone
            }
            this._themeSig = 0;
        }
        // the panel is closed here; the accent sheet comes off the theme with it
        this._unload();
        this._config = null;
        if (this._busy) {
            // an in-flight write cannot be recalled: remove the file once it settled
            this._deleteWhenDone = true;
        }
        else {
            this._deleteFile();
        }
    }

    /**
     * Probes the theme accent color with a temporary widget in the given
     * pseudo-class state. null when the probe cannot run.
     * @param {string} className
     * @param {string} pseudoClass
     * @returns {Rgb | null}
     */
    _probe(className, pseudoClass) {
        let probe = null;
        try {
            probe = new this._st.BoxLayout({ style_class: className, opacity: 0 });
            probe.add_style_pseudo_class(pseudoClass);
            this._main.uiGroup.add_child(probe);
            const c = probe.get_theme_node().get_background_color();
            return accentFromProbed(c.red, c.green, c.blue, c.alpha);
        }
        catch (_e) {
            return null;
        }
        finally {
            if (probe) {
                probe.destroy();
            }
        }
    }

    /**
     * Loads the accent sheet on the live theme. St.Theme.load_stylesheet returns
     * a boolean (and may throw): a false return is a REFUSED load — the load is
     * then not recorded at all, so no generation class marks a sheet that is not
     * there and this Theme stays unloaded (a later changed() retries).
     * @param {AnyRecord} theme the live St.Theme object
     * @param {string} css the content that is now on disk at the stylesheet path
     * @returns {boolean} whether the sheet is loaded
     */
    _load(theme, css) {
        try {
            if (!theme.load_stylesheet(this._accentPath())) {
                this._global.logError('greenTile: accent stylesheet: not loaded');
                return false;
            }
        }
        catch (e) {
            this._global.logError('greenTile: accent stylesheet: ' + e);
            return false;
        }
        this._themeObj = theme;
        this._loaded = css;
        this._gen = this._deps.nextAccentGen();
        return true;
    }

    _unload() {
        if (!this._themeObj) {
            return;
        }
        try {
            this._themeObj.unload_stylesheet(this._path);
        }
        catch (_e) {
            // the old theme object is already gone after a Cinnamon theme switch
        }
        this._themeObj = null;
        this._loaded = '';
        // nothing is loaded any more: the generation class marks a LOADED sheet,
        // so it goes with it (a later _load takes a fresh one)
        this._gen = '';
    }

    _accentPath() {
        if (!this._path) {
            this._path = this._glib.build_filenamev([this._glib.get_user_cache_dir(), 'greenTile@carsteneu', 'panel-accent-' + this._token + '.css']);
        }
        return this._path;
    }

    /**
     * @param {ThemeConfig} config
     * @param {'dark' | 'light'} theme the freshly resolved panel theme
     */
    _apply(config, theme) {
        const own = accentIsOwn(config.settings.getValue(SETTINGS_KEYS.accentMode));
        const mode = stateMode(config.settings.getValue(SETTINGS_KEYS.stateMode));
        // the probe chain serves both "Follow theme" modes — accent, state color
        // or both (first theme node with a usable accent wins, see accent-model)
        const probe = (!own || mode === 'theme') ? accentProbeFirst((/** @type {string} */ className, /** @type {string} */ pseudoClass) => this._probe(className, pseudoClass)) : null;
        const rgb = own ? accentParse(config.settings.getValue(SETTINGS_KEYS.accentColor)) : probe;
        const stateRgb = mode === 'own'
            ? accentParse(config.settings.getValue(SETTINGS_KEYS.stateColor))
            : (mode === 'theme' ? probe : null);
        const base = rgb || accentDefault;
        const stateBase = stateRgb || stateDefault;
        // one sheet, one load: accent and state rules ride on the same generated file,
        // so ANY color change goes through the css comparison in _drain and bumps the
        // root class again (a state-only change must reload too)
        const css = accentCss(accentTones(base)) + '\n' + stateCss(stateTones(stateBase));
        if (this._destroyed) {
            return;
        }
        // EVERY request goes through the queue, even one matching the content
        // already on disk: it must wait behind an in-flight write, otherwise the
        // slower write would land afterwards and win over it.
        this._pending = { config, css, theme, base, stateBase };
        this._drain();
    }

    /** Writes the pending request's css when needed; the newest request wins. */
    _drain() {
        if (this._destroyed || this._busy || !this._pending) {
            return;
        }
        const request = this._pending;
        this._pending = null;
        if (request.css === this._written) {
            // the file already holds this content: nothing to write, apply directly
            this._commit(request);
            this._drain();
            return;
        }
        this._busy = true;
        try {
            // The private directory is prepared once and asynchronously; the write runs
            // from its callback. Both route a failure to _settle so the queue never wedges.
            this._withDirectory((error) => {
                if (error) {
                    this._settle(request, error);
                    return;
                }
                this._write(request.css, (writeError) => this._settle(request, writeError));
            });
        }
        catch (error) {
            // a synchronous dispatch failure must not wedge the queue
            this._settle(request, error);
        }
    }

    /**
     * A settled write (or its failure): commit the look when this request is
     * still the newest, and on failure re-run the queue so a newer request wins.
     * @param {LookRequest} request
     * @param {any} error
     */
    _settle(request, error) {
        this._busy = false;
        if (this._destroyed) {
            if (this._deleteWhenDone) {
                this._deleteWhenDone = false;
                this._deleteFile();
            }
            return;
        }
        if (error) {
            // the old file and the old look stay: log it and let a newer request run
            this._global.logError('greenTile: accent color: ' + error);
            this._drain();
            return;
        }
        this._written = request.css;
        if (this._pending) {
            // a newer request owns the look now
            this._drain();
            return;
        }
        this._commit(request);
    }

    /**
     * Runs done(null) once the private (0700) cache directory exists, and done(error)
     * when it cannot be made at all. Both steps are asynchronous; the mode has to be
     * applied separately because Gio.File.make_directory_async takes no mode.
     * @param {(error: any) => void} done
     */
    _withDirectory(done) {
        if (this._directoryReady) {
            done(null);
            return;
        }
        /** @type {any} */
        let file = null;
        try {
            file = this._gio.File.new_for_path(this._glib.path_get_dirname(this._accentPath()));
        }
        catch (error) {
            done(error);
            return;
        }
        try {
            file.make_directory_async(this._glib.PRIORITY_DEFAULT, null, (/** @type {any} */ _source, /** @type {any} */ res) => {
                try {
                    file.make_directory_finish(res);
                }
                catch (error) {
                    // An existing directory is the normal case — make_directory finishes
                    // with EXISTS. Any other error means the sheet has nowhere to go, and
                    // the preparation stays un-remembered so the next write retries it.
                    if (!existsError(this._gio, error)) {
                        done(error);
                        return;
                    }
                }
                this._setDirectoryMode(file, done);
            });
        }
        catch (error) {
            done(error);
        }
    }

    /**
     * Applies the private (0700) mode to the cache directory, then hands over to the
     * write. A failure here is reported and retried with the next write rather than
     * remembered as success.
     * @param {any} file
     * @param {(error: any) => void} done
     */
    _setDirectoryMode(file, done) {
        /** @type {any} */
        let info = null;
        try {
            info = this._gio.FileInfo.new();
            info.set_attribute_uint32('unix::mode', PRIVATE_DIR_MODE);
        }
        catch (error) {
            done(error);
            return;
        }
        try {
            file.set_attributes_async(info, this._gio.FileQueryInfoFlags.NONE, this._glib.PRIORITY_DEFAULT, null,
                (/** @type {any} */ _source, /** @type {any} */ res) => {
                    try {
                        file.set_attributes_finish(res);
                    }
                    catch (error) {
                        done(error);
                        return;
                    }
                    this._directoryReady = true;
                    done(null);
                });
        }
        catch (error) {
            done(error);
        }
    }

    /**
     * Starts the async bytes write of css to this Theme's file, user-only
     * (Gio.FileCreateFlags.PRIVATE) and replacing any previous content. No
     * Cancellable is passed: cancelling an in-flight replace may leave the
     * destination truncated. A construction throw is routed to done so the
     * queue never wedges.
     * @param {string} css
     * @param {(error: any) => void} done
     */
    _write(css, done) {
        /** @type {any} */
        let file = null;
        /** @type {any} */
        let bytes = null;
        try {
            file = this._gio.File.new_for_path(this._accentPath());
            bytes = new this._glib.Bytes(this._byteArray.fromString(css));
        }
        catch (error) {
            done(error);
            return;
        }
        try {
            file.replace_contents_bytes_async(bytes, null, false, this._gio.FileCreateFlags.PRIVATE | this._gio.FileCreateFlags.REPLACE_DESTINATION, null, (/** @type {any} */ _source, /** @type {any} */ res) => {
                try {
                    file.replace_contents_finish(res);
                }
                catch (error) {
                    done(error);
                    return;
                }
                done(null);
            });
        }
        catch (error) {
            done(error);
        }
    }

    /**
     * Commits a persisted (or unchanged) look: theme class, colors, sheet
     * (re)load and the border and an open panel repaint. Only runs while this
     * component is alive — a write may settle after destroy(). A sheet the live
     * theme refuses is NOT committed (the panel is not restyled against a look
     * whose sheet is missing); the same-path reload already dropped the previous
     * sheet, and a later changed() retries.
     * @param {LookRequest} request
     */
    _commit(request) {
        if (this._destroyed) {
            return;
        }
        const theme = this._st.ThemeContext.get_for_stage(this._global.stage).get_theme();
        // reload when the file content changed since the last load, or a Cinnamon
        // theme switch replaced the whole live St.Theme object
        if (this._loaded !== request.css || (this._themeObj && this._themeObj !== theme)) {
            this._unload();
        }
        if (!this._themeObj && !this._load(theme, request.css)) {
            return;
        }
        this._theme = request.theme;
        this._rgb = request.base;
        this._stateRgb = request.stateBase;
        // the border and an open panel repaint in the same color; a throw must not
        // escape into the async callback
        try {
            request.config.app.border.restyle();
            // An open panel or editor rebuilds itself: restyling in place would
            // leave the Cairo thumbnails and the painter in the old colors.
            if (this._deps.panelOpen()) {
                this._deps.panelRebuild(request.config.app);
            }
        }
        catch (e) {
            this._global.logError('greenTile: accent style: ' + e);
        }
    }

    /** Best-effort async removal of this Theme's stylesheet file. */
    _deleteFile() {
        try {
            const file = this._gio.File.new_for_path(this._accentPath());
            file.delete_async(this._glib.PRIORITY_DEFAULT, null, (/** @type {any} */ _source, /** @type {any} */ res) => {
                try {
                    file.delete_finish(res);
                }
                catch (_e) {
                    // already gone — cleanup is best effort
                }
            });
        }
        catch (_e) {
            // dispatch failure: cleanup is best effort
        }
    }
};
