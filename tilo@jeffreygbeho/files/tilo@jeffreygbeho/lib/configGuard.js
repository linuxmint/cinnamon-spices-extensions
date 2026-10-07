/*
 * tilo - ConfigGuard: the consent contract.
 *
 * tilo never modifies a configuration key belonging to anyone else without an
 * explicit gesture from the user, and always restores the original state.
 *
 * The only allowed path to touching a foreign key
 * (e.g. org.cinnamon.desktop.keybindings.wm push-tile-left, org.cinnamon.muffin
 * edge-tiling) is:
 *
 *     explicit opt-in  ->  backup  ->  apply  ->  restore
 *
 * Restore is triggered by: the user unticking the option, the extension being
 * disabled, or uninstallation. Nothing is ever left behind.
 *
 * No override is active in phase 1 - this module exists up front so that phase 2
 * has no excuse to bypass the rule.
 */

const Gio = require('gi.Gio');
const GLib = require('gi.GLib');
const Logger = require('./lib/logger');

/* Resolved lazily, never at import time: a throw during module load would take
   the whole extension down with it. */
let _backupDir = null;
let _backupFile = null;

function _paths() {
    if (_backupDir === null) {
        _backupDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'tilo']);
        _backupFile = GLib.build_filenamev([_backupDir, 'overrides.json']);
    }
    return { dir: _backupDir, file: _backupFile };
}

/*
 * The saved values live in memory and are loaded once, asynchronously, when the
 * extension starts.
 *
 * Reading them on demand meant a synchronous file read on a path that can sit
 * on a network home directory, from a thread shared with the compositor. It was
 * only a few hundred bytes and only on a user action, but a blocking read has
 * no business anywhere near the main loop, and there is no reason to repeat it:
 * this process is the only thing that writes the file.
 */
let _backups = null;      /* null until the first load completes */

function _readBackups() {
    return _backups || {};
}

/*
 * Called once from enable(). Attempts the read and treats a missing file as an
 * empty set rather than asking first, which is both one syscall fewer and free
 * of the gap between asking and reading.
 */
function load() {
    if (_backups !== null) return;
    _backups = {};

    try {
        Gio.File.new_for_path(_paths().file).load_contents_async(null, (file, result) => {
            try {
                const [ok, bytes] = file.load_contents_finish(result);
                if (ok) _backups = JSON.parse(new TextDecoder().decode(bytes));
            } catch (e) {
                /* No file yet is the normal case on a first run. */
                if (!e.matches || !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                    Logger.debug(`no saved overrides to load: ${e}`);
                }
            }
        });
    } catch (e) {
        Logger.error('Could not start reading backups', e);
    }
}

function _writeBackups(backups) {
    try {
        _backups = backups;
        const { dir, file } = _paths();
        GLib.mkdir_with_parents(dir, 0o755);
        GLib.file_set_contents(file, JSON.stringify(backups, null, 2));
        return true;
    } catch (e) {
        Logger.error('Could not write backups', e);
        return false;
    }
}

function _key(schemaId, key) {
    return `${schemaId}::${key}`;
}

/*
 * Takes over a foreign key after recording its original value.
 * Call ONLY from a path where the user has explicitly consented.
 */
function override(schemaId, key, newValue) {
    const backups = _readBackups();
    const id = _key(schemaId, key);

    try {
        const settings = new Gio.Settings({ schema_id: schemaId });

        /* Never overwrite an existing backup: the first value we saw is the
           user's legitimate value. */
        if (backups[id] === undefined) {
            backups[id] = settings.get_value(key).print(true);
            if (!_writeBackups(backups)) {
                Logger.error(`Could not back up ${id} - override cancelled`);
                return false;
            }
            Logger.info(`Recorded original value for ${id}`);
        }

        settings.set_value(key, GLib.Variant.parse(null, newValue, null, null));
        Logger.info(`Key overridden: ${id}`);
        return true;
    } catch (e) {
        Logger.error(`Override of ${id} failed`, e);
        return false;
    }
}

/* Restores a single key to its original state. */
function restore(schemaId, key) {
    const backups = _readBackups();
    const id = _key(schemaId, key);
    if (backups[id] === undefined) return true; /* never touched */

    try {
        const settings = new Gio.Settings({ schema_id: schemaId });
        settings.set_value(key, GLib.Variant.parse(null, backups[id], null, null));
        delete backups[id];
        _writeBackups(backups);
        Logger.info(`Key restored: ${id}`);
        return true;
    } catch (e) {
        Logger.error(`Restore of ${id} failed`, e);
        return false;
    }
}

/* Safety net: called on every disable(). Never leaves anything behind. */
function restoreAll() {
    const backups = _readBackups();
    const ids = Object.keys(backups);
    if (ids.length === 0) return;

    Logger.info(`Restoring ${ids.length} overridden key(s)`);
    ids.forEach(id => {
        const [schemaId, key] = id.split('::');
        restore(schemaId, key);
    });
}

function hasOverrides() {
    return Object.keys(_readBackups()).length > 0;
}

module.exports = { load, override, restore, restoreAll, hasOverrides };
