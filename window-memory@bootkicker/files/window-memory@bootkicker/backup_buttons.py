# SPDX-License-Identifier: GPL-3.0-or-later
# Window Memory: the "Back up or restore" row of the settings dialog, two buttons.
# "Export backup…" saves every setting, the never-remember list and the remembered windows to one
# JSON file. "Import backup…" checks such a file, asks, and replaces the remembered windows (through
# the importState callback of the extension) and the settings with the ones in the file, in the
# order that _import explains.
#
# The backup file, format version 1:
#   {"format": "window-memory-backup", "version": 1, "created": "2025-01-31T12:00:00Z",
#    "extensionVersion": "0.1.0", "settings": {...}, "state": {"version": 1, "windows": [...]}}
# settings holds the value of every schema item that stores one, in the schema's order; created is
# UTC; extensionVersion is the version in metadata.json; state is the state file as saved.
#
# cinnamon-settings builds the widget for a schema item of type "custom" (xlet-settings.py:474-491,
# called at :457) as BackupButtons(item, key, settings), where item is the schema entry, key is
# "backup" and settings is the JSONSettingsHandler of the instance. The result has to be a
# SettingsWidget (:460-461). It loads each custom file as a module of its own (:481-483), so this
# file cannot import pick_button.py: the D-Bus proxy below is a copy of that file's.
#
# The work is done by the plain functions, which take paths and data as arguments and use only the
# standard library, so tests/helpers/backup_harness.py checks them without GTK and without the
# real configuration folder. The widget reads the files, asks the user, and calls them.

import calendar
import collections
import gettext
import json
import math
import os
import pwd
import stat
import sys
import tempfile
import time

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gio, GLib, Gtk
# SettingsWidget is the class cinnamon-settings checks with isinstance (bin/SettingsWidgets.py:10
# re-exports it).
from xapp.SettingsWidgets import SettingsWidget

UUID = 'window-memory@bootkicker'

# The texts the user reads are translated in the domain of the uuid, from the .mo files that the
# Spices installer compiles into ~/.local/share/locale (bin/Spices.py:733-737), the folder
# cinnamon-settings looks in first (xlet-settings.py:67-75). The language is the session's
# (LANGUAGE, LC_ALL, LC_MESSAGES, LANG); without a translation the texts stay in English. Each custom
# file has its own copy of these lines: cinnamon-settings loads each one on its own. The log lines
# (warn) stay in English, except where they repeat a message the user is shown (_fail). A value is
# put into a text by name (%(name)s), so that a translation can put it anywhere, and a count picks
# the form of its language (_TRANSLATIONS.ngettext).
_TRANSLATIONS = gettext.translation(UUID, os.path.join(GLib.get_home_dir(), '.local', 'share', 'locale'), fallback=True)


def _(text):
    return _TRANSLATIONS.gettext(text)


# The folder that holds this file, with settings-schema.json and metadata.json. cinnamon-settings
# loads this file by its path (xlet-settings.py:477-483), and importlib sets __file__ for a module
# loaded that way.
FOLDER = os.path.dirname(os.path.abspath(__file__))

# How long the page waits for importState, in milliseconds, before the call gives up. The call is
# synchronous, so the settings window does not respond meanwhile. The restore writes the state file
# and binds the open windows, which on a slow or busy desktop can take longer than the 5 s that the
# other buttons wait (CALL_TIMEOUT_MS in pick_button.py and forget_button.py), and a call that gives
# up leaves the outcome unknown (see _import). 20 s is still below the 25 s D-Bus default.
IMPORT_TIMEOUT_MS = 20000

# The callback of the extension that loads the remembered windows from the staging file.
IMPORT_CALLBACK = 'importState'

# The staging file, next to state.json: the basename of STAGING_PATH in extension.js. The test
# tests/backup-buttons.test.js checks that the two names, and the callback name above, agree.
STAGING_NAME = 'import-pending.json'

# The one setting that a restore may set before the call (see _import).
MAX_ENTRIES_KEY = 'max-entries'

# The remote errors of a failed importState call that the page tells apart, by their D-Bus name.
# Cinnamon looks the callback up on the object of the uuid (ui/cinnamonDBus.js:359-363), which is
# null while the extension is not running, and cjs returns the TypeError this raises under the
# first name (cjs 6.0.0, core/overrides/Gio.js:327-341). The bus answers with the second when
# Cinnamon went away, or did not answer, before it replied: the callback may have run all the same.
NOT_RUNNING_ERROR = 'org.gnome.gjs.JSError.TypeError'
NO_REPLY_ERROR = 'org.freedesktop.DBus.Error.NoReply'
NOT_RUNNING = _('Window Memory is not running. Enable it in System Settings, then try again.')

# The message, text and detail, when importState gives no answer in time: the remembered windows
# may have been replaced or not (see _import).
UNCONFIRMED = _('Window Memory did not confirm the restore in time.')
UNCONFIRMED_DETAIL = _('The remembered windows may or may not have been replaced, and the other settings '
                       'were left as they were. Importing the same backup again is safe.')

BACKUP_FORMAT = 'window-memory-backup'
BACKUP_VERSION = 1
# The version of the state file (VERSION in lib/store.js).
STATE_VERSION = 1

# The schema types that store a value. Items of the other types used here, custom and button,
# store nothing and are left out of a backup.
STORED_TYPES = ('switch', 'spinbutton', 'combobox', 'list', 'keybinding', 'entry')

# A larger file is refused before it is read. TOO_LARGE says the same number.
MAX_BACKUP_BYTES = 20 * 1024 * 1024
TOO_LARGE = _('The file is larger than 20 MB, too large to be a Window Memory backup.')

CREATED_FORMAT = '%Y-%m-%dT%H:%M:%SZ'
# The extensionVersion of a backup when metadata.json has none: data in the file, not a text to translate.
UNKNOWN_VERSION = 'unknown'

# The labels of the two buttons when the schema item has no usable "buttons" (the schema's labels).
PLAIN_LABELS = (_('Export backup…'), _('Import backup…'))

# The tooltips of the two buttons are in the schema's "buttons", where the template tool of Cinnamon and the
# Spices store does not look. Listing them here as texts of the code makes that tool find them, so that a
# template it makes keeps their translations. They are translated from the schema, in _button_texts.
SCHEMA_TOOLTIPS = (_('Save every setting, the never-remember list and the remembered windows to a file.'),
                   _('Replace every setting and remembered window with the ones in a backup file. Asks first.'))

SAVE_FAILED = _('Could not save the backup.')
RESTORE_FAILED = _('Could not restore the backup.')

# Sentences that end several messages.
NOTHING_CHANGED = _('Nothing was changed.')
SETTINGS_UNCHANGED = _('The settings were not changed.')
NOTHING_ELSE_CHANGED = _('The remembered windows and the other settings were not changed.')
SAFE_TO_REPEAT = _('Importing the same backup again is safe.')

# A backup that passed check_backup: the settings to apply (schema order), the state, how many
# settings the schema does not know, and "created" as the file has it.
CheckedBackup = collections.namedtuple('CheckedBackup', 'settings state unknown created')


def warn(message):
    print('window-memory: ' + message, file=sys.stderr)


class BackupError(Exception):
    """A backup that cannot be made or used. The message is a sentence for the user."""


def sentence(text):
    return text if text.endswith('.') else text + '.'


def sentences(*parts):
    # The sentences in parts, one after the other; an empty part is left out.
    return ' '.join(part for part in parts if part)


def describe(error):
    # The reason in error, as a sentence: the system's words for an OSError, else its text (a
    # GLib.Error keeps it in .message).
    if isinstance(error, OSError) and error.strerror:
        text = error.strerror
    else:
        text = str(getattr(error, 'message', None) or error) or type(error).__name__
    return sentence(text)


def remote_reason(name, message):
    # The reason in a remote D-Bus error (name, and the message of the GLib.Error), as a sentence
    # for the user. GDBus puts "GDBus.Error:<name>: " before the text of an error reply
    # (g_dbus_error_new_for_dbus_error), and this takes it away again, as
    # Gio.DBusError.strip_remote_error does. That function cannot do it here: PyGObject (3.42)
    # hands it a copy of the error, and the message of the exception keeps the prefix. The
    # TypeError of a callback that Cinnamon could not find means that Window Memory is not running.
    if name == NOT_RUNNING_ERROR:
        return NOT_RUNNING
    prefix = 'GDBus.Error:%s: ' % name
    text = message[len(prefix):] if message.startswith(prefix) else message
    return sentence(text or name)


def is_int(value):
    # A whole number in the JSON: bool is an int in Python, but true is not a number.
    return isinstance(value, int) and not isinstance(value, bool)


def raises_limit(settings, current):
    # True when max-entries in settings (the checked settings of a backup) is larger than in current
    # (the values now): the restore then sets it before the call (see _import). The backup's value is
    # a whole number (check_setting); the current one can be any number, since cinnamon-settings
    # stores a spin button changed in the dialog as a float (300.0).
    new, old = settings.get(MAX_ENTRIES_KEY), current.get(MAX_ENTRIES_KEY)
    return is_int(new) and isinstance(old, (int, float)) and not isinstance(old, bool) and new > old


def refuse_constant(name):
    raise ValueError('%s is not allowed in JSON' % name)


def parse_json(text):
    # json.loads without NaN, Infinity and -Infinity: Python accepts them, JSON.parse (the
    # extension) does not.
    return json.loads(text, parse_constant=refuse_constant)


def user_config_dir(environ=None):
    # The configuration folder that extension.js builds STATE_DIR on (line 27:
    # GLib.get_user_config_dir() + '/window-memory'). GLib.get_user_config_dir() is $XDG_CONFIG_HOME
    # when it is set and not empty, else $HOME/.config, with the home folder of the user database
    # when HOME is not set. This is the same rule in the standard library; the widget checks of the
    # harness compare it with GLib's.
    environ = os.environ if environ is None else environ
    config = environ.get('XDG_CONFIG_HOME')
    if config:
        return config
    home = environ.get('HOME')
    if home is None:
        home = pwd.getpwuid(os.getuid()).pw_dir
    return os.path.join(home, '.config')


def state_path(config_dir):
    return os.path.join(config_dir, 'window-memory', 'state.json')


def staging_path(config_dir):
    # The state to load, written here before importState is called.
    return os.path.join(config_dir, 'window-memory', STAGING_NAME)


def stored_keys(schema):
    # The keys of the schema items that store a value, in the schema's order.
    return [key for key, item in schema.items() if isinstance(item, dict) and item.get('type') in STORED_TYPES]


def read_schema(folder):
    try:
        with open(os.path.join(folder, 'settings-schema.json'), encoding='utf-8') as f:
            schema = json.load(f)
    except (OSError, ValueError) as e:  # ValueError: not UTF-8, not JSON
        raise BackupError(_('The settings schema cannot be read: %(reason)s') % {'reason': describe(e)})
    if not isinstance(schema, dict):
        raise BackupError(_('The settings schema cannot be read: it is not a JSON object.'))
    return schema


def read_extension_version(folder):
    # The "version" of metadata.json in folder; "unknown", with a warning, when there is none.
    path = os.path.join(folder, 'metadata.json')
    try:
        with open(path, encoding='utf-8') as f:
            metadata = json.load(f)
    except (OSError, ValueError) as e:
        warn('could not read %s: %s' % (path, e))
        return UNKNOWN_VERSION
    version = metadata.get('version') if isinstance(metadata, dict) else None
    if isinstance(version, str) and version.strip():
        return version.strip()
    warn('%s has no usable "version"' % path)
    return UNKNOWN_VERSION


def empty_state():
    return {'version': STATE_VERSION, 'windows': []}


# The reason read_state gives when there is no state file. That is not a fault: the extension
# writes the file when it first saves a window, so no window is remembered yet. It is never shown,
# so it is not translated.
NO_STATE_FILE = 'the state file does not exist'


def read_state(path):
    # (state, problem): the state file at path as saved and None, or an empty state and the reason
    # when the file does not exist (NO_STATE_FILE), cannot be read or is not a state of version 1.
    try:
        with open(path, 'rb') as f:
            state = parse_json(f.read().decode('utf-8'))
    except FileNotFoundError:
        return empty_state(), NO_STATE_FILE
    except ValueError:  # bytes that are not UTF-8, text that is not JSON
        return empty_state(), _('the state file is not valid JSON')
    except OSError as e:
        return empty_state(), e.strerror or str(e)
    if not (isinstance(state, dict) and is_int(state.get('version')) and state['version'] == STATE_VERSION
            and isinstance(state.get('windows'), list)):
        return empty_state(), _('the state file is not a state of version %(version)d') % {'version': STATE_VERSION}
    return state, None


def is_number(value):
    # A finite number, as lib/store.js isFiniteNumber: not a bool (a JSON true is no number there).
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def has_numbers(obj, fields):
    return isinstance(obj, dict) and all(is_number(obj.get(f)) for f in fields)


def is_valid_entry(e):
    # The same rules as isValidEntry in lib/store.js, which the extension applies when it reads the windows of an
    # import: a field the extension cannot use drops the entry. minimized alone may be absent.
    return (isinstance(e, dict) and isinstance(e.get('id'), str) and isinstance(e.get('key'), str)
            and is_number(e.get('lastSeen'))
            and (e.get('rel') is None and 'rel' in e or has_numbers(e.get('rel'), ('x', 'y', 'w', 'h')))
            and (e.get('monitor') is None and 'monitor' in e or has_numbers(e.get('monitor'), ('index', 'x', 'y', 'w', 'h')))
            and isinstance(e.get('maximized'), bool)
            and ('minimized' not in e or isinstance(e['minimized'], bool))
            and (e.get('workspace') is None and 'workspace' in e or is_number(e.get('workspace'))))


def kept_windows(windows):
    # The entries of windows that the extension keeps when it imports them (parseState in lib/store.js): the valid
    # ones, not a pop-up (role 'pop-up'), and the first of each id. The message after an import counts these, not
    # the entries in the backup.
    kept, seen = [], set()
    for e in windows:
        if is_valid_entry(e) and e.get('role') != 'pop-up' and e['id'] not in seen:
            seen.add(e['id'])
            kept.append(e)
    return kept


def utc_stamp(seconds):
    return time.strftime(CREATED_FORMAT, time.gmtime(seconds))


def local_time(created):
    # created ("YYYY-MM-DDTHH:MM:SSZ", UTC) in local time as "YYYY-MM-DD HH:MM", or None when it is
    # not a time in that form.
    if not isinstance(created, str):
        return None
    try:
        return time.strftime('%Y-%m-%d %H:%M', time.localtime(calendar.timegm(time.strptime(created, CREATED_FORMAT))))
    except (ValueError, OverflowError, OSError):
        return None


def backup_file_name(seconds):
    # The name the save dialog suggests, with the local date.
    return 'window-memory-backup-%s.json' % time.strftime('%Y-%m-%d', time.localtime(seconds))


def backup_folder(documents, home):
    # The folder the save and the open dialog start in: Documents if it exists, else the home folder.
    return documents if documents and os.path.isdir(documents) else home


def build_backup(schema, values, state, created, extension_version):
    # values maps each stored key of the schema to its value; other keys in it are not taken.
    return {
        'format': BACKUP_FORMAT,
        'version': BACKUP_VERSION,
        'created': created,
        'extensionVersion': extension_version,
        'settings': {key: values[key] for key in stored_keys(schema)},
        'state': state,
    }


def backup_text(data):
    # allow_nan=False: a value JSON.parse would refuse fails here instead of in the file.
    return json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + '\n'


def read_up_to(fd, limit):
    # At most limit bytes from the descriptor fd: os.read can give fewer than it is asked for.
    chunks = []
    left = limit
    while left > 0:
        chunk = os.read(fd, left)
        if not chunk:
            break
        chunks.append(chunk)
        left -= len(chunk)
    return b''.join(chunks)


def read_backup(path):
    # The JSON in the file at path. The path is opened once, and everything is checked on that
    # descriptor, so nothing can be swapped in between a check and the read. O_NONBLOCK: opening a
    # FIFO does not wait for a writer (it changes nothing for a regular file). A file that is not a
    # regular file, or is over the limit, is refused before any of it is read; the read stops after
    # the limit too, in case the file grew in between.
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
    except OSError as e:
        raise BackupError(_('The file cannot be read: %(reason)s') % {'reason': describe(e)})
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise BackupError(_('The file is not a regular file.'))
        if info.st_size > MAX_BACKUP_BYTES:
            raise BackupError(TOO_LARGE)
        raw = read_up_to(fd, MAX_BACKUP_BYTES + 1)
    except OSError as e:
        raise BackupError(_('The file cannot be read: %(reason)s') % {'reason': describe(e)})
    finally:
        os.close(fd)
    if len(raw) > MAX_BACKUP_BYTES:
        raise BackupError(TOO_LARGE)
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        raise BackupError(_('The file is not UTF-8 text.'))
    try:
        return parse_json(text)
    except ValueError as e:
        raise BackupError(_('The file is not valid JSON: %(reason)s') % {'reason': describe(e)})


def check_setting(key, item, value):
    # The value to apply for the stored schema item, or a BackupError. A spinbutton value written
    # with a fraction part that is zero (750.0) is taken as the whole number. The key is the
    # setting's name in the schema, which is not translated.
    kind = item['type']
    names = {'key': key}
    if kind == 'switch':
        if not isinstance(value, bool):
            raise BackupError(_('The setting "%(key)s" in the backup is not true or false.') % names)
    elif kind == 'spinbutton':
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        if not is_int(value):
            raise BackupError(_('The setting "%(key)s" in the backup is not a whole number.') % names)
        low, high = item.get('min'), item.get('max')
        if (low is not None and value < low) or (high is not None and value > high):
            raise BackupError(_('The setting "%(key)s" in the backup is outside the range %(min)s to %(max)s.')
                              % {'key': key, 'min': low, 'max': high})
    elif kind == 'combobox':
        # options is {label: value}; the value is stored. Same type too: in Python 1 == True.
        if not any(type(value) is type(option) and value == option for option in item.get('options', {}).values()):
            raise BackupError(_('The setting "%(key)s" in the backup is not one of its choices.') % names)
    elif kind == 'list':
        # A row of the list is an object with a value under the id of each column, checked by the
        # column's type (the never-remember list has two columns: the boolean enabled, then the text
        # wmclass). A boolean must be true or false, but may be missing: a backup made before the
        # column was added has none, and cinnamon-settings shows such a row with the column default
        # (bin/TreeListWidgets.py, List.on_setting_changed). Any other column must hold a text.
        if not isinstance(value, list):
            raise BackupError(_('The setting "%(key)s" in the backup is not a list.') % names)
        columns = [(column.get('id'), column.get('type')) for column in item.get('columns', []) if isinstance(column, dict)]
        for entry in value:
            if not isinstance(entry, dict):
                raise BackupError(_('The setting "%(key)s" in the backup has an entry that is not an object.') % names)
            for column, column_type in columns:
                if column_type == 'boolean':
                    if column in entry and not isinstance(entry[column], bool):
                        raise BackupError(_('The setting "%(key)s" in the backup has an entry whose "%(column)s" is not true or false.')
                                          % {'key': key, 'column': column})
                elif not isinstance(entry.get(column), str):
                    raise BackupError(_('The setting "%(key)s" in the backup has an entry without a text "%(column)s".')
                                      % {'key': key, 'column': column})
    elif kind in ('keybinding', 'entry'):
        if not isinstance(value, str):
            raise BackupError(_('The setting "%(key)s" in the backup is not text.') % names)
    return value


def check_backup(data, schema):
    # A CheckedBackup when data (the parsed JSON of a file) is a usable backup for this schema, else
    # a BackupError that names the first problem. Settings the schema does not know are counted and
    # left out; those it stores no value for are left out.
    if not isinstance(data, dict):
        raise BackupError(_('The file is not a Window Memory backup: it does not hold a JSON object.'))
    if data.get('format') != BACKUP_FORMAT:
        raise BackupError(_('The file is not a Window Memory backup: its "format" is not "%(format)s".')
                          % {'format': BACKUP_FORMAT})
    version = data.get('version')
    if is_int(version) and version > BACKUP_VERSION:
        raise BackupError(_('The backup was made by a newer version of Window Memory (backup format %(found)d). '
                            'This version reads format %(supported)d only.') % {'found': version, 'supported': BACKUP_VERSION})
    if not (is_int(version) and version == BACKUP_VERSION):
        raise BackupError(_('The "version" of the backup is not %(version)d.') % {'version': BACKUP_VERSION})
    settings = data.get('settings')
    if not isinstance(settings, dict):
        raise BackupError(_('The backup has no "settings" object.'))
    state = data.get('state')
    if not isinstance(state, dict):
        raise BackupError(_('The backup has no "state" object.'))
    if not (is_int(state.get('version')) and state['version'] == STATE_VERSION):
        raise BackupError(_('The "version" of the "state" in the backup is not %(version)d.') % {'version': STATE_VERSION})
    if not isinstance(state.get('windows'), list):
        raise BackupError(_('The "windows" of the "state" in the backup are not a list.'))
    checked = {}
    unknown = 0
    for key, value in settings.items():
        item = schema.get(key)
        if item is None:
            unknown += 1
        elif isinstance(item, dict) and item.get('type') in STORED_TYPES:
            checked[key] = check_setting(key, item, value)
    ordered = {key: checked[key] for key in schema if key in checked}
    return CheckedBackup(ordered, state, unknown, data.get('created'))


def write_private(path, text):
    # Writes text, as UTF-8, to path: first to a temporary file in the same folder, created with mode
    # 0600, then os.replace. On failure the temporary file is removed and path is left as it was.
    data = text.encode('utf-8')
    fd, temporary = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), prefix='.window-memory-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f:
            os.fchmod(f.fileno(), 0o600)  # mkstemp asks for 0600, but the umask can take bits away
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def write_staging(config_dir, state):
    # Writes state to the staging file under config_dir, making its folder when there is none yet.
    path = staging_path(config_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_private(path, json.dumps(state, ensure_ascii=False, allow_nan=False) + '\n')
    return path


def remove_file(path):
    # Removes the file at path; a file that is not there is fine.
    try:
        os.unlink(path)
    except (FileNotFoundError, NotADirectoryError):
        pass


def settings_count(number):
    # "1 setting", "12 settings": a part of the messages below, in the form of the language for the number.
    return _TRANSLATIONS.ngettext('%(count)d setting', '%(count)d settings', number) % {'count': number}


def windows_count(number):
    # "1 remembered window", "2 remembered windows": a part of the messages below.
    return _TRANSLATIONS.ngettext('%(count)d remembered window', '%(count)d remembered windows', number) % {'count': number}


def export_message(settings, windows, state_problem):
    # (text, detail) after an export. No state file is no problem: no window is remembered yet.
    text = _('Backup saved: %(settings)s, %(windows)s.') % {'settings': settings_count(settings), 'windows': windows_count(windows)}
    if state_problem == NO_STATE_FILE:
        return text, _('No windows are remembered yet.')
    if state_problem:
        return text, _('The remembered windows could not be read (%(problem)s), so none were saved.') % {'problem': state_problem}
    return text, None


def replace_question(windows, created):
    # (question, detail) before an import. windows is the number remembered now.
    when = local_time(created)
    if when:
        question = _TRANSLATIONS.ngettext(
            'Replace the settings and the %(count)d remembered window with this backup from %(time)s?',
            'Replace the settings and the %(count)d remembered windows with this backup from %(time)s?',
            windows) % {'count': windows, 'time': when}
    else:
        question = _TRANSLATIONS.ngettext(
            'Replace the settings and the %(count)d remembered window with this backup?',
            'Replace the settings and the %(count)d remembered windows with this backup?',
            windows) % {'count': windows}
    return question, _('The current settings and remembered windows are lost. This cannot be undone.')


def restore_message(settings, windows, unknown):
    # (text, detail) after an import.
    text = _('Restored %(settings)s and %(windows)s.') % {'settings': settings_count(settings), 'windows': windows_count(windows)}
    if unknown:
        return text, _TRANSLATIONS.ngettext(
            '%(count)d setting in the backup is not known to this version of Window Memory and was left out.',
            '%(count)d settings in the backup are not known to this version of Window Memory and were left out.',
            unknown) % {'count': unknown}
    return text, None


def partial_restore_message(windows, key, reason, left):
    # (text, detail) when the remembered windows were restored and then the setting key could not be
    # set, for reason (a sentence); left is how many settings after it were not set either.
    text = _TRANSLATIONS.ngettext('Restored %(count)d remembered window, but not all the settings.',
                                  'Restored %(count)d remembered windows, but not all the settings.',
                                  windows) % {'count': windows}
    failed = _('The setting "%(key)s" could not be set: %(reason)s') % {'key': key, 'reason': reason}
    rest = _TRANSLATIONS.ngettext('%(count)d setting after it was not set either.',
                                  '%(count)d settings after it were not set either.', left) % {'count': left} if left else None
    return text, sentences(failed, rest, SAFE_TO_REPEAT)


def not_handed(reason):
    # The first sentence of an error when the remembered windows could not be handed to the extension,
    # for reason (a sentence).
    return _('The remembered windows could not be handed to Window Memory: %(reason)s') % {'reason': reason}


class BackupButtons(SettingsWidget):
    # An exception raised in __init__ stops cinnamon-settings from building the whole page:
    # create_custom_widget calls the class outside any try (xlet-settings.py:491), and its callers
    # have none either (:457, :413). So keep __init__ defensive: an item without usable "buttons"
    # is logged, and the buttons get the plain labels and no tooltips.
    #
    # Greying out: this widget binds nothing itself. Once the page is shown, the page pass of
    # pick_button.py (PickWindowButton._on_map) binds every SettingsWidget on the page to "Enable
    # Window Memory", except that switch and the rows marked always_sensitive (the pick button
    # binds itself), and this widget is one of the rows it binds: while the switch is off, the
    # row and its two buttons are greyed out. self.key is set as the other rows set theirs. The
    # pass does not need it to bind this row: it reads the keys of the rows only to find the
    # switch and the never-remember list, and to name a row in its warnings.
    def __init__(self, info, key, settings):
        super(BackupButtons, self).__init__()
        self.key = key
        self.settings = settings
        self.uuid = UUID
        # A single-instance xlet such as an extension has one settings file named after
        # its uuid, and the handler's instance_id is that file name (xlet-settings.py:307-308,
        # :328). The plain button sends the same value (:409, :453).
        self.instance_id = str(getattr(settings, 'instance_id', None) or UUID)
        self._proxy = None

        self.content_widget = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        self.content_widget.set_halign(Gtk.Align.CENTER)
        actions = (self._on_export_clicked, self._on_import_clicked)
        for (label, tooltip), on_clicked in zip(self._button_texts(info), actions):
            button = Gtk.Button(label=label)
            if tooltip:
                button.set_tooltip_text(tooltip)
            button.connect('clicked', on_clicked)
            self.content_widget.pack_start(button, False, False, 0)
        self.pack_start(self.content_widget, True, True, 0)

    @staticmethod
    def _button_texts(info):
        # [(label, tooltip)] of the Export and the Import button, from the item's "buttons", translated:
        # cinnamon-settings translates the description and the tooltip of an item, not its "buttons"
        # (xlet-settings.py:339-359). An empty text is left as it is (gettext gives the header of the
        # translation for an empty msgid).
        try:
            texts = [(spec['label'], spec['tooltip']) for spec in info['buttons']]
            if len(texts) != 2 or not all(isinstance(text, str) for pair in texts for text in pair):
                raise ValueError('two buttons with a text label and tooltip each are needed')
            return [(_(label) if label else label, _(tooltip) if tooltip else tooltip) for label, tooltip in texts]
        except Exception as e:
            warn('the "buttons" of the schema item cannot be used (%s); the plain labels are shown' % e)
            return [(label, None) for label in PLAIN_LABELS]

    def _on_export_clicked(self, *args):
        self._run_safely(self._export, SAVE_FAILED)

    def _on_import_clicked(self, *args):
        self._run_safely(self._import, RESTORE_FAILED)

    def _run_safely(self, action, failure):
        # PyGObject only prints a traceback for an exception raised in a signal handler; the user
        # would see nothing. Whatever else goes wrong is shown and logged.
        try:
            action()
        except Exception as e:
            self._fail(failure, describe(e))

    def _fail(self, text, detail):
        warn('%s %s' % (text, detail))
        self._tell(text, detail, error=True)

    def _current_values(self, keys):
        # The value of each key in the handler. A key it does not have is a BackupError, before any change.
        values = {}
        for key in keys:
            try:
                values[key] = self.settings.get_value(key)
            except KeyError:
                raise BackupError(_('The settings file has no value for "%(key)s".') % {'key': key})
        return values

    @staticmethod
    def _backup_folder():
        # The folder that both choosers start in: Documents if it exists, else the home folder.
        return backup_folder(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS), GLib.get_home_dir())

    def _export(self):
        path = self._ask_save_path(backup_file_name(time.time()), self._backup_folder())
        if not path:
            return
        schema = read_schema(FOLDER)
        values = self._current_values(stored_keys(schema))
        state, problem = read_state(state_path(user_config_dir()))
        data = build_backup(schema, values, state, utc_stamp(time.time()), read_extension_version(FOLDER))
        try:
            write_private(path, backup_text(data))
        except OSError as e:
            raise BackupError(_('%(path)s cannot be written: %(reason)s') % {'path': path, 'reason': describe(e)})
        text, detail = export_message(len(data['settings']), len(state['windows']), problem)
        self._tell(text, detail)

    def _import(self):
        path = self._ask_open_path(self._backup_folder())
        if not path:
            return
        config = user_config_dir()
        try:
            backup = check_backup(read_backup(path), read_schema(FOLDER))
        except BackupError as e:
            self._fail(RESTORE_FAILED, sentences(str(e), NOTHING_CHANGED))
            return
        # The state alone: "remembered, _ = ..." would make _ a local name in this method, and hide the
        # translation function.
        remembered = read_state(state_path(config))[0]
        question, detail = replace_question(len(remembered['windows']), backup.created)
        if not self._ask_replace(question, detail):
            return
        try:
            current = self._current_values(backup.settings)
        except BackupError as e:
            self._fail(RESTORE_FAILED, sentences(str(e), NOTHING_CHANGED))
            return
        # The order. importState replaces the remembered windows, or throws before any change
        # (extension.js, _importState), and the settings come after it, so that a failed call leaves
        # them as they are. One setting may come first. The extension prunes its list with the
        # max-entries it reads when it saves a window, so a save between the call and the settings
        # would prune the restored windows with the old limit. A larger limit never prunes more, so a
        # backup that raises max-entries sets it before the call, and sets it back when the call
        # surely failed: no window is lost either way. A smaller or equal one is set after the call,
        # with the others: set before, it could prune the current windows of a restore that then fails.
        early = raises_limit(backup.settings, current)
        new_limit, old_limit = backup.settings.get(MAX_ENTRIES_KEY), current.get(MAX_ENTRIES_KEY)
        staging = staging_path(config)
        # 1. The windows to the staging file, and the proxy. A failure here comes before any change.
        try:
            write_staging(config, backup.state)
            proxy = self._get_proxy()
        except Exception as e:  # OSError, GLib.Error
            self._remove_staging(staging)
            self._fail(RESTORE_FAILED, sentences(not_handed(self._reason(e)), SETTINGS_UNCHANGED))
            return
        # 2. A larger max-entries. If that fails, the restore stops here.
        if early:
            try:
                self.settings.set_value(MAX_ENTRIES_KEY, new_limit)
            except Exception as e:
                self._remove_staging(staging)
                self._fail(RESTORE_FAILED, sentences(
                    _('The setting "%(key)s" could not be set to %(value)d before the restore: %(reason)s')
                    % {'key': MAX_ENTRIES_KEY, 'value': new_limit, 'reason': describe(e)}, NOTHING_ELSE_CHANGED))
                return
        # 3. The remembered windows, through the extension. The page removes the staging file after the
        # call, whatever its outcome: the extension removes it too, and this covers a removal that
        # failed there.
        try:
            self._call_import_state(proxy)
        except Exception as e:  # GLib.Error; or the arguments, before the call is sent
            self._remove_staging(staging)
            if self._outcome_unknown(e):
                # The windows may have been replaced: max-entries stays as it is, which they may need,
                # and no other setting is set.
                self._fail(UNCONFIRMED, UNCONFIRMED_DETAIL)
                return
            # importState did not run, or threw before any change: a larger max-entries is set back.
            failed = not_handed(self._reason(e))
            if early:
                try:
                    self.settings.set_value(MAX_ENTRIES_KEY, old_limit)
                except Exception as rollback:
                    self._fail(RESTORE_FAILED, sentences(
                        failed,
                        _('The setting "%(key)s" was set to %(new)d for the restore and could not be set back to '
                          '%(old)d: %(reason)s')
                        % {'key': MAX_ENTRIES_KEY, 'new': new_limit, 'old': old_limit, 'reason': describe(rollback)},
                        NOTHING_ELSE_CHANGED))
                    return
            self._fail(RESTORE_FAILED, sentences(failed, SETTINGS_UNCHANGED))
            return
        self._remove_staging(staging)
        # 4. The other settings that differ, in the schema order. The handler writes the settings file,
        # and the open page follows (bin/JsonSettingsWidgets.py:83-92). The windows are replaced by now,
        # so a setting that fails sets nothing back: the restore stops there, and the message says that
        # the windows were restored, which setting failed, and that importing the backup again is safe.
        later = [(key, value) for key, value in backup.settings.items()
                 if value != current[key] and not (early and key == MAX_ENTRIES_KEY)]
        for number, (key, value) in enumerate(later):
            try:
                self.settings.set_value(key, value)
            except Exception as e:
                self._fail(*partial_restore_message(len(kept_windows(backup.state['windows'])), key, describe(e), len(later) - number - 1))
                return
        # 5. What was restored.
        text, detail = restore_message(len(backup.settings), len(kept_windows(backup.state['windows'])), backup.unknown)
        self._tell(text, detail)

    @staticmethod
    def _remove_staging(path):
        # A staging file that is not there is fine; one that cannot be removed is logged.
        try:
            remove_file(path)
        except OSError as e:
            warn('could not remove %s: %s' % (path, describe(e)))

    def _call_import_state(self, proxy):
        # The call of the plain schema button (XLETSettingsButton.on_activated, xlet-settings.py:65),
        # for importState, with a timeout of its own (IMPORT_TIMEOUT_MS). Cinnamon runs the callback
        # on the object enable() returned (ui/cinnamonDBus.js:359-363, :296-310).
        proxy.activateCallback('(sss)', IMPORT_CALLBACK, self.uuid, self.instance_id, timeout=IMPORT_TIMEOUT_MS)

    @staticmethod
    def _reason(error):
        # The reason in error, as a sentence for the user: for a remote D-Bus error, the text of the
        # error reply (remote_reason); else describe.
        if isinstance(error, GLib.Error) and Gio.DBusError.is_remote_error(error):
            return remote_reason(Gio.DBusError.get_remote_error(error), error.message)
        return describe(error)

    @staticmethod
    def _outcome_unknown(error):
        # True when a failed importState call may have run all the same, so that the windows may have
        # been replaced: no answer came in time, the connection closed, or the bus answered NoReply
        # for Cinnamon. GDBus raises a call that times out, or meets a closed connection, as a local
        # Gio.IOErrorEnum.TIMED_OUT or CLOSED (Gio.DBusError has no CLOSED); Gio.DBusError.TIMED_OUT
        # counts too. Any other remote error is the answer of Cinnamon or of the extension, which
        # throws before any change, and any other error comes before the call is sent.
        if not isinstance(error, GLib.Error):
            return False
        if Gio.DBusError.is_remote_error(error):
            return Gio.DBusError.get_remote_error(error) == NO_REPLY_ERROR
        io, dbus = Gio.io_error_quark(), Gio.dbus_error_quark()
        return (error.matches(io, Gio.IOErrorEnum.TIMED_OUT) or error.matches(io, Gio.IOErrorEnum.CLOSED)
                or error.matches(dbus, Gio.DBusError.TIMED_OUT))

    def _get_proxy(self):
        # The proxy xlet-settings.py makes for its own buttons (:162-163, :35) is a module
        # global of that script; this builds the same one: same bus, name, path, interface.
        if self._proxy is None:
            # No property cache and no signal subscriptions: the proxy only makes one call.
            flags = Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES | Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS
            self._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION, flags, None,
                'org.Cinnamon', '/org/Cinnamon', 'org.Cinnamon', None)
        return self._proxy

    # The dialogs. Each _ask_ method and _tell runs one dialog and returns the answer; the harness
    # replaces them, and checks the dialogs that the methods below build.

    def _parent(self):
        # The settings window, so that a dialog stays above it; None while the row is in no window.
        window = self.get_toplevel()
        return window if isinstance(window, Gtk.Window) else None

    # The labels of the dialog buttons are translated here too, mnemonic and all: GTK 3 translates
    # only its own stock buttons (the OK of a message dialog).
    def _save_dialog(self, name, folder):
        dialog = Gtk.FileChooserDialog(title=_('Export backup'), transient_for=self._parent(), modal=True,
                                       action=Gtk.FileChooserAction.SAVE)
        dialog.add_button(_('_Cancel'), Gtk.ResponseType.CANCEL)
        dialog.add_button(_('_Save'), Gtk.ResponseType.ACCEPT)
        dialog.set_default_response(Gtk.ResponseType.ACCEPT)
        dialog.set_do_overwrite_confirmation(True)
        dialog.set_current_folder(folder)
        dialog.set_current_name(name)
        return dialog

    def _open_dialog(self, folder):
        dialog = Gtk.FileChooserDialog(title=_('Import backup'), transient_for=self._parent(), modal=True,
                                       action=Gtk.FileChooserAction.OPEN)
        dialog.add_button(_('_Cancel'), Gtk.ResponseType.CANCEL)
        dialog.add_button(_('_Open'), Gtk.ResponseType.ACCEPT)
        dialog.set_default_response(Gtk.ResponseType.ACCEPT)
        json_files = Gtk.FileFilter()
        json_files.set_name(_('JSON files'))
        json_files.add_pattern('*.json')
        dialog.add_filter(json_files)
        # For a backup saved under a name without .json. JSON files stay the filter it opens with.
        all_files = Gtk.FileFilter()
        all_files.set_name(_('All files'))
        all_files.add_pattern('*')
        dialog.add_filter(all_files)
        dialog.set_filter(json_files)
        dialog.set_current_folder(folder)
        return dialog

    def _replace_dialog(self, question, detail):
        dialog = Gtk.MessageDialog(transient_for=self._parent(), modal=True, message_type=Gtk.MessageType.WARNING,
                                   buttons=Gtk.ButtonsType.NONE, text=question, secondary_text=detail)
        dialog.add_button(_('_Cancel'), Gtk.ResponseType.CANCEL)
        replace = dialog.add_button(_('_Replace'), Gtk.ResponseType.ACCEPT)
        replace.get_style_context().add_class('destructive-action')
        dialog.set_default_response(Gtk.ResponseType.CANCEL)
        return dialog

    def _message_dialog(self, text, detail, error):
        return Gtk.MessageDialog(transient_for=self._parent(), modal=True,
                                 message_type=Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO,
                                 buttons=Gtk.ButtonsType.OK, text=text, secondary_text=detail)

    @staticmethod
    def _run_chooser(dialog):
        try:
            return dialog.get_filename() if dialog.run() == Gtk.ResponseType.ACCEPT else None
        finally:
            dialog.destroy()

    def _ask_save_path(self, name, folder):
        return self._run_chooser(self._save_dialog(name, folder))

    def _ask_open_path(self, folder):
        return self._run_chooser(self._open_dialog(folder))

    def _ask_replace(self, question, detail):
        dialog = self._replace_dialog(question, detail)
        try:
            return dialog.run() == Gtk.ResponseType.ACCEPT
        finally:
            dialog.destroy()

    def _tell(self, text, detail=None, error=False):
        dialog = self._message_dialog(text, detail, error)
        try:
            dialog.run()
        finally:
            dialog.destroy()
