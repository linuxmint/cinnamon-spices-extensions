# SPDX-License-Identifier: GPL-3.0-or-later
# Window Memory: the "Startup apps" tab of the settings dialog. The first part is the file
# logic: it reads and writes the startup entries (desktop files in the autostart folder) the way the
# system tool (cinnamon-settings startup, cs_startup.py) does, so that the tab and the system tool
# always agree: which entries are listed, the switch, Remove, "Choose application" and "Custom
# command". Only functions and plain data there: GLib and Gio are imported, GTK is not, so that the
# module can be loaded and tested without a display. The second part is the widget, StartupList
# (see "the widget" below): its class is made the first time it is asked for, and only then is GTK
# loaded.
#
# The system tool's Python (cs_startup.py) is not importable and not stable across Cinnamon
# versions, and cinnamon-settings loads each custom file of the extension on its own, so this is a
# small implementation of its own. Where it differs from cs_startup.py the comment says so.
#
# A "folder" below is an autostart folder itself (the one that holds the .desktop files):
# ~/.config/autostart for the user, and <dir>/autostart of each XDG config dir for the system.
# The caller passes them; nothing here reads the real ones unless asked to (system_dirs=None).
#
# All files are read and written with GLib.KeyFile, as cs_startup.py does, so that unknown keys,
# translated strings and comments of a desktop file survive a change. One difference: the system
# tool passes KEEP_COMMENTS and KEEP_TRANSLATIONS joined with "and", which Python evaluates to
# KEEP_TRANSLATIONS alone, so it drops comments; this module keeps both.

import gettext
import glob
import json
import os
import sys

from gi.repository import Gio, GLib

UUID = 'window-memory@bootkicker'

GROUP = 'Desktop Entry'
ENABLED_KEY = 'X-GNOME-Autostart-enabled'
DELAY_KEY = 'X-GNOME-Autostart-Delay'
KEYFILE_FLAGS = GLib.KeyFileFlags.KEEP_COMMENTS | GLib.KeyFileFlags.KEEP_TRANSLATIONS

# The system tool (cs_startup.py:get_shown) lists an entry with OnlyShowIn only if it names GNOME
# or Cinnamon. This is the one name the tool takes from XDG_CURRENT_DESKTOP for NotShowIn.
DEFAULT_DESKTOP = 'X-Cinnamon'

# The longest free-name search of the system tool (cs_startup.py:find_free_basename).
MAX_TRIES = 100
# The limits of the "Startup delay" field of the system tool, in seconds.
MAX_DELAY = 100


class Entry:
    """One startup entry as the list shows it.

    basename   the file name with its .desktop, for example 'nemo.desktop'
    user_path  the user's file for this basename, or None when only a system file exists
    system     True when a system file with this basename exists (the user file then overrides it)
    system_path  the system file that is used (the first system folder that has it), or None;
                 set_enabled and remove_entry copy it into the user folder
    """

    def __init__(self, basename, name, comment, command, icon, delay, enabled, system, user_path,
                 system_path=None):
        self.basename = basename
        self.name = name
        self.comment = comment
        self.command = command
        self.icon = icon
        self.delay = delay
        self.enabled = enabled
        self.system = system
        self.user_path = user_path
        self.system_path = system_path

    def __repr__(self):
        return 'Entry(%r, name=%r, enabled=%r, system=%r, user_path=%r)' % (
            self.basename, self.name, self.enabled, self.system, self.user_path)


class AddResult:
    """What add_application did, enough for undo().

    action    'added' (a new user file), 'already-on' (nothing changed), 'enabled' (an entry that
              was off is on), 'restored' (an entry that was removed is back)
    previous  the exact earlier content of the user file, None if it did not exist
    written   the content the add left in the user file, None when it changed nothing or deleted
              the file (a removal override that only existed to hide a system entry)
    """

    def __init__(self, action, basename, previous, written):
        self.action = action
        self.basename = basename
        self.previous = previous
        self.written = written

    def __repr__(self):
        return 'AddResult(%r, %r, previous=%r, written=%r)' % (
            self.action, self.basename, self.previous, self.written)


# ---- small helpers -----------------------------------------------------------------------------

def _warn(text):
    print('window-memory: startup list: %s' % text, file=sys.stderr)


def _load(path):
    kf = GLib.KeyFile.new()
    kf.load_from_file(path, KEYFILE_FLAGS)
    return kf


def _get_bool(kf, key, default):
    try:
        return kf.get_boolean(GROUP, key)
    except GLib.Error:
        return default


def _get_string(kf, key, default=None):
    try:
        return kf.get_string(GROUP, key)
    except GLib.Error:
        return default


def _get_locale_string(kf, key, default=None):
    # None as locale: the session's, as cs_startup.py does.
    try:
        return kf.get_locale_string(GROUP, key, None)
    except GLib.Error:
        return default


def _remove_key(kf, key):
    try:
        kf.remove_key(GROUP, key)
    except GLib.Error:
        pass  # not there


def _get_list(kf, key):
    try:
        return kf.get_string_list(GROUP, key)
    except GLib.Error:
        return []


def _shown(kf, desktop):
    """cs_startup.py:get_shown: OnlyShowIn / NotShowIn against GNOME and the desktop."""
    only_show_in = _get_list(kf, 'OnlyShowIn')
    if only_show_in and not any(d in ('GNOME', desktop) for d in only_show_in):
        return False
    not_show_in = _get_list(kf, 'NotShowIn')
    if not_show_in and desktop in not_show_in:
        return False
    return True


def _read_bytes(path):
    try:
        with open(path, 'rb') as f:
            return f.read()
    except FileNotFoundError:
        return None


def _write_bytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    GLib.file_set_contents(path, data)  # a temp file and a rename: never half a file


def _save(kf, path):
    """Saves the key file (the same way) and returns the content now in the file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kf.save_to_file(path)
    return _read_bytes(path)


def _system_file(system_dirs, basename):
    for d in system_dirs:
        path = os.path.join(d, basename)
        if os.path.isfile(path):
            return path
    return None


def _system_dirs_or_default(system_dirs):
    if system_dirs is not None:
        return system_dirs
    return [os.path.join(d, 'autostart') for d in GLib.get_system_config_dirs()]


def _user_keyfile(user_dir, entry):
    """The key file to change for an entry: its user file, or a copy of its system file."""
    path = entry.user_path or os.path.join(user_dir, entry.basename)
    if os.path.isfile(path):
        return path, _load(path)
    if entry.system_path is None:
        raise FileNotFoundError('no user file and no system file for %s' % entry.basename)
    return path, _load(entry.system_path)


# ---- the list ----------------------------------------------------------------------------------

def _stem(basename):
    return basename[:-len('.desktop')] if basename.endswith('.desktop') else basename


def gather_entries(user_dir, system_dirs, blacklist, desktop=DEFAULT_DESKTOP):
    """The entries the system tool lists, sorted by name.

    As cs_startup.py (gather_apps, get_shown, the row filter and sort): the user's files and the
    system files merged by file name (the user's file wins), minus the names in blacklist (names
    without .desktop, the autostart-blacklist of Cinnamon's session settings), minus entries
    that are Hidden, NoDisplay or excluded by OnlyShowIn / NotShowIn. A system folder listed first
    wins over a later one (the XDG order; the system tool uses the last one for the "system
    position" only). A file that cannot be read is skipped and logged to stderr; as in the
    system tool an unreadable user file also hides the system entry of that name.
    """
    found = {}  # basename -> [user_path, system_path]; insertion order is the file order
    for path in sorted(glob.glob(os.path.join(user_dir, '*.desktop'))):
        basename = os.path.basename(path)
        if _stem(basename) in blacklist:
            continue
        found[basename] = [path, None]
    for d in system_dirs:
        for path in sorted(glob.glob(os.path.join(d, '*.desktop'))):
            basename = os.path.basename(path)
            if _stem(basename) in blacklist:
                continue
            if basename not in found:
                found[basename] = [None, path]
            elif found[basename][1] is None:
                found[basename][1] = path

    entries = []
    for basename, (user_path, system_path) in found.items():
        winner = user_path or system_path
        try:
            kf = _load(winner)
        except GLib.Error as e:
            _warn('cannot read %s: %s' % (winner, e.message))
            continue
        if (_get_bool(kf, 'Hidden', False) or _get_bool(kf, 'NoDisplay', False)
                or not _shown(kf, desktop)):
            continue
        name = _get_locale_string(kf, 'Name', None)
        if not name:
            name = _stem(basename)
        try:
            delay = int(_get_string(kf, DELAY_KEY, '0'))
        except ValueError:
            delay = 0
        entries.append(Entry(
            basename=basename,
            name=name,
            comment=_get_locale_string(kf, 'Comment', None) or '',
            command=_get_string(kf, 'Exec', ''),
            icon=_get_locale_string(kf, 'Icon', None) or None,
            delay=delay,
            enabled=_get_bool(kf, ENABLED_KEY, True),
            system=system_path is not None,
            user_path=user_path,
            system_path=system_path))
    entries.sort(key=lambda e: e.name.lower())  # stable: equal names keep the file order
    return entries


# ---- the switch and Remove ---------------------------------------------------------------------

# The fields cs_startup.py:user_equals_system compares, each read from a key file. The names and
# the comment are read in the session's language; a missing delay is "0", as there.
_COMPARED = (
    lambda kf, desktop: _get_bool(kf, 'Hidden', False),
    lambda kf, desktop: _get_bool(kf, ENABLED_KEY, True),
    lambda kf, desktop: _shown(kf, desktop),
    lambda kf, desktop: _get_bool(kf, 'NoDisplay', False),
    lambda kf, desktop: _get_locale_string(kf, 'Name'),
    lambda kf, desktop: _get_locale_string(kf, 'Comment'),
    lambda kf, desktop: _get_string(kf, 'Exec'),
    lambda kf, desktop: _get_string(kf, DELAY_KEY, '0'),
    lambda kf, desktop: _get_locale_string(kf, 'Icon'),
)


def _equals_system(kf, system_path, desktop=DEFAULT_DESKTOP):
    """cs_startup.py:user_equals_system: True when kf, a user file as it is about to be saved,
    says what the system file says, field by field (_COMPARED). Comments and the keys it does not
    compare do not count. False without a system file, or when it cannot be read."""
    if system_path is None:
        return False
    try:
        system_kf = _load(system_path)
    except GLib.Error:
        return False
    return all(get(kf, desktop) == get(system_kf, desktop) for get in _COMPARED)


def _save_or_drop(kf, path, system_path):
    """Saves kf at path, as the system tool saves an entry (cs_startup.py, save): a user file that
    would equal the system file of its name is deleted instead, so that the system entry is used as
    it is. Returns the content now in the user's file, None when there is no file."""
    if _equals_system(kf, system_path):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        return None
    return _save(kf, path)


def set_enabled(user_dir, entry, enabled):
    """The switch: writes X-GNOME-Autostart-enabled into the user's file. A system entry gets a
    user override (a copy of the system file); a system file is never edited. An override that
    then equals the system file is deleted (_save_or_drop), so a switch off and on leaves no user
    file. The entry object is updated to match."""
    path, kf = _user_keyfile(user_dir, entry)
    kf.set_boolean(GROUP, ENABLED_KEY, bool(enabled))
    written = _save_or_drop(kf, path, entry.system_path)
    entry.enabled = bool(enabled)
    entry.user_path = path if written is not None else None


def remove_entry(user_dir, entry):
    """Remove: a user-only file is deleted. Otherwise (a system entry, or a user file that
    overrides one) the user file gets Hidden=true and enabled=false (cs_startup.py:remove)."""
    if entry.user_path and not entry.system:
        try:
            os.remove(entry.user_path)
        except FileNotFoundError:
            pass
        entry.user_path = None
        return
    path, kf = _user_keyfile(user_dir, entry)
    kf.set_boolean(GROUP, 'Hidden', True)
    kf.set_boolean(GROUP, ENABLED_KEY, False)
    written = _save_or_drop(kf, path, entry.system_path)
    entry.enabled = False
    entry.user_path = path if written is not None else None


# ---- adding ------------------------------------------------------------------------------------

def add_application(user_dir, entries, desktop_file, system_dirs=None):
    """The pick of an application that has a desktop file ("Choose application" of the system
    tool, except that an application is never added twice).

    The application is looked up by the name of its desktop file, in entries (the listed ones) and
    in the user's folder (an entry that was removed is not listed):
      listed and on            -> 'already-on', nothing changes
      listed and off           -> 'enabled': switched on
      user file with Hidden    -> 'restored': the hiding is cleared and the entry switched on
    In both cases a user file that then equals the system file of its name (field by field, as
    the system tool compares them: an override that only hid or switched off a system entry) is
    deleted, and the result's written is None; an override with an edit (Exec, Name, delay, ...)
    is kept.
      none                     -> 'added': the desktop file copied, enabled=true, delay 0 (no
                                  Delay key is the same as 0), under its own name, never as
                                  name-1.desktop as the system tool does for a second copy
    system_dirs are the system autostart folders (None: those of the XDG config dirs).
    """
    system_dirs = _system_dirs_or_default(system_dirs)
    basename = os.path.basename(desktop_file)
    target = os.path.join(user_dir, basename)
    previous = _read_bytes(target)

    entry = next((e for e in entries if e.basename == basename), None)
    if entry is not None:
        if entry.enabled:
            return AddResult('already-on', basename, previous, None)
        set_enabled(user_dir, entry, True)
        return AddResult('enabled', basename, previous, _read_bytes(target))

    if previous is not None:
        try:
            kf = _load(target)
        except GLib.Error:
            kf = None  # unreadable: replaced below; undo() brings the exact bytes back
        if kf is not None:
            system_path = _system_file(system_dirs, basename)
            if _get_bool(kf, 'Hidden', False):
                # Brought back: the hiding cleared and switched on.
                kf.set_boolean(GROUP, 'Hidden', False)
                kf.set_boolean(GROUP, ENABLED_KEY, True)
                return AddResult('restored', basename, previous, _save_or_drop(kf, target, system_path))
            # Present but not in the list (blacklisted, or excluded for this desktop): the
            # file decides.
            if _get_bool(kf, ENABLED_KEY, True):
                return AddResult('already-on', basename, previous, None)
            kf.set_boolean(GROUP, ENABLED_KEY, True)
            return AddResult('enabled', basename, previous, _save_or_drop(kf, target, system_path))

    kf = _load(desktop_file)
    kf.set_boolean(GROUP, ENABLED_KEY, True)
    _remove_key(kf, DELAY_KEY)  # a new entry starts at delay 0 (no key is 0)
    # A desktop file that hides itself would give an entry that is not listed.
    for key in ('Hidden', 'NoDisplay'):
        if _get_bool(kf, key, False):
            kf.set_boolean(GROUP, key, False)
    return AddResult('added', basename, previous, _save(kf, target))


def _free_basename(user_dir, system_dirs, name):
    stem = ''.join(c for c in name.replace('/', '-') if c >= ' ' and c != '\x7f')
    stem = stem.strip()
    if stem.endswith('.desktop'):
        stem = stem[:-len('.desktop')]
    stem = stem.lstrip('.').strip()[:100] or 'startup'
    candidate = '%s.desktop' % stem
    tries = 1
    # Free means free in the user's folder and in the system folders: a user file of the same
    # name would override (hide) a system entry.
    while (os.path.lexists(os.path.join(user_dir, candidate))
           or _system_file(system_dirs, candidate) is not None):
        if tries >= MAX_TRIES:
            raise OSError('no free file name for %r in %s' % (name, user_dir))
        candidate = '%s-%d.desktop' % (stem, tries)
        tries += 1
    return candidate


def add_custom(user_dir, name, command, comment, delay, system_dirs=None):
    """A custom command ("Custom command" of the system tool): a new user file, enabled, with the
    four fields of the form. Returns its basename, a free name made from name (find_free_basename
    of the system tool, with a / in the name made harmless). The Name is written as a plain Name
    key (the system tool writes only a Name[locale] key). The delay is kept between 0 and 100."""
    basename = _free_basename(user_dir, _system_dirs_or_default(system_dirs), name)
    kf = GLib.KeyFile.new()
    kf.set_string(GROUP, 'Type', 'Application')
    kf.set_string(GROUP, 'Name', name)
    kf.set_string(GROUP, 'Exec', command)
    if comment:
        kf.set_string(GROUP, 'Comment', comment)
    kf.set_boolean(GROUP, ENABLED_KEY, True)
    kf.set_string(GROUP, DELAY_KEY, str(max(0, min(MAX_DELAY, int(delay)))))
    _save(kf, os.path.join(user_dir, basename))
    return basename


# ---- Undo --------------------------------------------------------------------------------------

def undo(user_dir, result):
    """Puts the user's file back as it was before add_application: its earlier content, or no
    file if there was none. Only if the file is still exactly what the add left (result.written;
    None means no file); if anything changed it since, or it cannot be read or written (a
    directory, no permission), nothing is touched and False is returned, nothing is raised.
    An 'already-on' result changed nothing, so there is nothing to undo (True)."""
    if result.action == 'already-on':
        return True
    path = os.path.join(user_dir, result.basename)
    try:
        if _read_bytes(path) != result.written:
            return False
        if result.previous is None:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
        else:
            _write_bytes(path, result.previous)
    except (OSError, GLib.Error):
        # A directory, a file we may not read or write: not what the add left. Refuse.
        return False
    return True


# ================================================================================================
# The widget
# ================================================================================================
#
# cinnamon-settings builds it for a schema item of type "custom" (xlet-settings.py:474-491) as
# StartupList(item, key, settings), where item is the schema entry, key its name and settings the
# JSONSettingsHandler of the instance; the result has to be a SettingsWidget. It loads this file as
# a module of its own (:481-483) and then asks it for the class by name (getattr, :491). The
# module answers that through __getattr__ below, which loads GTK and makes the class once: so the
# file logic above stays loadable without GTK, and the widget is still found by its name.
#
# What it shows: a short explanation; the startup entries (gather_entries), one row each with icon,
# name, command line (dimmed), "delay N s" and a switch, a system entry dimmed with "(system
# entry)"; the buttons "Pick a window to start at login" (the extension's pickStartupWindow
# callback, called as pick_button.py calls pickWindow), "Remove" and "Add or edit in Startup
# Applications…" (starts cinnamon-settings startup); and a message bar that says what a pick did,
# with Undo when there is something to undo, or what went wrong. The bar stays until it is replaced
# or closed.
#
# How a pick reaches it: the extension writes the result into the hidden key startup-pick, as JSON
# text (parse_pick), and the handler notifies the widget (settings.listen). The widget listens only
# once it is built; a value that is in the key when the window opens (an old result) is cleared
# then without being used. A result that is used is cleared at once (set to ''), so that the
# command line of a window does not stay in the settings file; the empty value that this writes is
# ignored. A clear pauses the handler's view of the file for 2 s, so the widget has it read the
# file again once, RECHECK_MS later (the only timer; removed when the widget is destroyed).
#
# The list is read from the folders again on every change of the user's autostart folder (a
# Gio.FileMonitor made in __init__ and cancelled when the widget is destroyed), after every change
# the widget makes, and right before a pick is decided (the list on screen may be stale). A file
# the user cannot see in the list (blacklisted, or not for this desktop) can make a pick say "is
# already in the list": the file decides, as add_application documents.
#
# Every call into the file logic is in a try for OSError and GLib.Error; the reason goes to the
# message bar (or to the form) and to stderr, never out of a GTK handler.

# The texts the user reads are translated in the domain of the uuid, from the .mo files that the
# Spices installer compiles into ~/.local/share/locale (bin/Spices.py:733-737), as in the other
# custom files of the settings window (forget_button.py has the same lines: each custom file is
# loaded on its own). The language is the session's; without a translation the texts stay in
# English. The log lines stay in English.
_TRANSLATIONS = gettext.translation(UUID, os.path.join(GLib.get_home_dir(), '.local', 'share', 'locale'), fallback=True)


def _(text):
    return _TRANSLATIONS.gettext(text)


EXPLANATION = _('These applications start when you log in, and Window Memory puts their windows back in place, '
                'unless they are enabled in the never remember list. It is the same list as in Startup Applications.')
EMPTY_LIST = _('No applications start at login.')
PICK_LABEL = _('Pick a window to start at login')
# The crosshair icon of the "Pick a window to never remember" button of the General tab (pick_button.py:
# ICON_NAME and FALLBACK_GLYPH; each widget file is loaded alone, so the two values are repeated and a test
# keeps them equal). The glyph is only for an icon theme without the icon.
PICK_ICON_NAME = 'find-location-symbolic'
PICK_ICON_FALLBACK = '⌖'  # POSITION INDICATOR, a crosshair
REMOVE_LABEL = _('Remove')
STARTUP_LABEL = _('Add or edit in Startup Applications…')
SYSTEM_NOTE = _('(system entry)')
DELAY_TEXT = _('delay %(seconds)d s')
UNDO_LABEL = _('Undo')
# What a pick did (AddResult.action), and what Undo found.
ACTION_TEXTS = {
    'added': _('Added %(name)s'),
    'already-on': _('%(name)s is already in the list'),
    'enabled': _('%(name)s switched on'),
    'restored': _('%(name)s brought back'),
}
CHANGED_TEXT = _('%(name)s changed in the meantime and was left as it is.')
# Errors, with the reason as a sentence (describe).
NOT_READ_TEXT = _('Could not read the startup applications: %(reason)s')
NOT_ADDED_TEXT = _('Could not add %(name)s: %(reason)s')
NOT_CHANGED_TEXT = _('Could not change %(name)s: %(reason)s')
NOT_PICKED_TEXT = _('Could not start the pick: %(reason)s')
NOT_OPENED_TEXT = _('Could not open Startup Applications: %(reason)s')
NOT_RUNNING_TEXT = _('Window Memory is not running. Enable it in System Settings, then try again.')
# The form for a window without a desktop file: the four fields of the system tool's dialog.
FORM_TITLE = _('Start at login')
NAME_LABEL = _('Name')
COMMAND_LABEL = _('Command')
COMMENT_LABEL = _('Comment')
DELAY_LABEL = _('Startup delay')
CANCEL_LABEL = _('Cancel')
ADD_LABEL = _('Add')
GUESS_TEXT = _('This command is a best guess from the window. Check it before adding.')
EMPTY_COMMAND_TEXT = _('The command cannot be empty.')
BAD_COMMAND_TEXT = _('The command is not valid: %(reason)s')

# The hidden key the extension writes a pick result into (settings-schema.json), and the key of
# the "Enable Window Memory" switch: while it is off the whole widget is greyed out.
PICK_KEY = 'startup-pick'
ENABLED_SETTING = 'enabled'
# The extension callback that starts the pick (extension.js, callbacks()).
PICK_CALLBACK = 'pickStartupWindow'
# How long the settings window waits for Cinnamon, in milliseconds (pick_button.py's value).
CALL_TIMEOUT_MS = 5000
# The remote error of a callback Cinnamon could not run because the extension is not running
# (forget_button.py, NOT_RUNNING_ERROR).
NOT_RUNNING_ERROR = 'org.gnome.gjs.JSError.TypeError'
# The system tool.
STARTUP_TOOL = ['cinnamon-settings', 'startup']
# The icon of a row without one (cs_startup.py uses the same name).
DEFAULT_ICON = 'application-x-executable'
ICON_PIXELS = 24
# The least height of the list, in pixels: about nine rows of about 48 px, so that the page is about as tall as the
# "General" tab and the Version row below it ends up near the bottom of the window. Change it here to tune the look.
LIST_MIN_HEIGHT = 430
# The response of the Undo button of the message bar.
UNDO_RESPONSE = 1
# After the widget clears startup-pick, the handler does not see the settings file change for 2 s:
# its save_settings cancels its file monitor, and do_resume reconnects it 2000 ms later without
# reading the file (bin/JsonSettingsWidgets.py, save_settings, pause_monitor, resume_monitor). A
# result the extension writes in that pause would be lost, and its command line would stay in the
# file. So, this long after a clear, the widget asks the handler once to read the file again
# (check_settings), which notifies it of anything that changed in the pause.
RECHECK_MS = 2500


def describe(error):
    """The reason in error, as a sentence: the system's words for an OSError, else its text (a
    GLib.Error keeps it in .message); the remote error of a D-Bus call without GDBus's prefix."""
    if isinstance(error, OSError) and error.strerror:
        text = error.strerror
    else:
        text = str(getattr(error, 'message', None) or error) or type(error).__name__
        if isinstance(error, GLib.Error) and Gio.DBusError.is_remote_error(error):
            name = Gio.DBusError.get_remote_error(error)
            if name == NOT_RUNNING_ERROR:
                return NOT_RUNNING_TEXT
            prefix = 'GDBus.Error:%s: ' % name
            text = text[len(prefix):] if text.startswith(prefix) else text
    return text if text.endswith('.') else text + '.'


def blacklisted_apps():
    """The autostart-blacklist of Cinnamon's session settings (cs_startup.py:get_blacklisted_apps):
    names without .desktop. Empty when the schema or the key is missing."""
    source = Gio.SettingsSchemaSource.get_default()
    schema = source.lookup('org.cinnamon.SessionManager', True) if source else None
    if not schema or not schema.has_key('autostart-blacklist'):
        return set()
    return set(Gio.Settings.new('org.cinnamon.SessionManager').get_strv('autostart-blacklist'))


def parse_pick(value):
    """The pick result in the text value of startup-pick, as written by the extension
    (lib/startupPick.js, encodeResult): {"v":1,"stamp":N,"kind":"app","desktopFile":"/x.desktop",
    "name":"..."} or {"v":1,"stamp":N,"kind":"form","name":"...","command":"..."}. Returns the dict,
    or (None, why) when it is not such a result. The empty value is not a result either."""
    if not isinstance(value, str) or not value:
        return None, 'empty'
    try:
        result = json.loads(value)
    except ValueError:
        return None, 'not JSON'
    if not isinstance(result, dict) or result.get('v') != 1:
        return None, 'not a version 1 result'
    stamp = result.get('stamp')
    if isinstance(stamp, bool) or not isinstance(stamp, (int, float)):
        return None, 'no stamp'
    if not isinstance(result.get('name'), str):
        return None, 'no name'
    kind = result.get('kind')
    if kind == 'app':
        desktop_file = result.get('desktopFile')
        if not (isinstance(desktop_file, str) and os.path.isabs(desktop_file) and desktop_file.endswith('.desktop')):
            return None, 'no absolute desktop file'
    elif kind == 'form':
        if not isinstance(result.get('command'), str):
            return None, 'no command'
    else:
        return None, 'an unknown kind'
    return result, None


def check_command(command):
    """(argv, None) for a command the form can save, else (None, the reason for the user). The
    same checks as the system tool's dialog (cs_startup.py, AppDialog.run_dialog)."""
    if not command.strip():
        return None, EMPTY_COMMAND_TEXT
    try:
        ok, argv = GLib.shell_parse_argv(command)
    except GLib.Error as e:
        return None, BAD_COMMAND_TEXT % {'reason': describe(e)}
    if not ok or not argv:
        return None, EMPTY_COMMAND_TEXT
    return argv, None


# Filled in by _load_gtk when the class is first asked for; the methods below find them here.
Gtk = None
Pango = None
GdkPixbuf = None
_widget_class = None


def _load_gtk():
    global Gtk, Pango, GdkPixbuf
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('Pango', '1.0')
    gi.require_version('GdkPixbuf', '2.0')
    from gi.repository import GdkPixbuf as gdkpixbuf, Gtk as gtk, Pango as pango
    # SettingsWidget is the class cinnamon-settings checks with isinstance (bin/SettingsWidgets.py:10
    # re-exports it).
    from xapp.SettingsWidgets import SettingsWidget
    Gtk, Pango, GdkPixbuf = gtk, pango, gdkpixbuf
    return SettingsWidget


def __getattr__(name):
    # Python 3.7+ calls this for a name the module does not have (PEP 562): here only StartupList.
    global _widget_class
    if name != 'StartupList':
        raise AttributeError('module %r has no attribute %r' % (__name__, name))
    if _widget_class is None:
        settings_widget = _load_gtk()

        class StartupList(_StartupListBody, settings_widget):
            pass

        StartupList.__qualname__ = 'StartupList'
        _widget_class = StartupList
    return _widget_class


class _StartupListBody(object):
    """The methods of StartupList; the class itself is made by __getattr__ with SettingsWidget."""

    # An exception raised in __init__ stops cinnamon-settings from building the whole page:
    # create_custom_widget calls the class outside any try (xlet-settings.py:491). So each part is
    # in a try, logged, and left out on its own.
    def __init__(self, info, key, settings):
        super(_StartupListBody, self).__init__()
        self.key = key
        self.settings = settings
        self.uuid = UUID
        # A single-instance xlet such as an extension has one settings file named after its uuid,
        # and the handler's instance_id is that file name (pick_button.py does the same).
        self.instance_id = str(getattr(settings, 'instance_id', None) or UUID)
        self.user_dir = os.path.join(GLib.get_user_config_dir(), 'autostart')
        self._proxy = None
        self._monitor = None
        self._entries = []
        self._built = False
        self._undo = None  # (AddResult, name) of the message on the bar, while its Undo is offered
        self._last_stamp = None
        self._recheck_id = None  # the pending re-read of the settings file (RECHECK_MS), if any
        self._destroyed = False
        self.connect('destroy', self._on_destroy)

        try:
            self._build()
            self._built = True
        except Exception as e:
            _warn('could not build the list of startup applications: %s' % e)
            return
        for part, what in ((self.refresh, 'read the startup entries'),
                           (self._watch_folder, 'watch the autostart folder'),
                           (self._follow_enabled, 'follow the "%s" setting' % ENABLED_SETTING),
                           (self._drop_old_pick, 'clear the old value of %s' % PICK_KEY),
                           (self._listen_for_picks, 'listen to %s' % PICK_KEY)):
            try:
                part()
            except Exception as e:
                _warn('could not %s: %s' % (what, e))

    # ---- building ------------------------------------------------------------------------------

    def _build(self):
        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        self.pack_start(outer, True, True, 0)

        explanation = Gtk.Label(label=EXPLANATION, xalign=0.0)
        explanation.set_line_wrap(True)
        outer.pack_start(explanation, False, False, 0)

        self.list_box = Gtk.ListBox()
        self.list_box.set_selection_mode(Gtk.SelectionMode.SINGLE)
        placeholder = Gtk.Label(label=EMPTY_LIST)
        placeholder.get_style_context().add_class('dim-label')
        placeholder.show()
        self.list_box.set_placeholder(placeholder)
        self.list_box.connect('row-selected', lambda *args: self._update_remove())
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        # A scrollbar that takes room and stays visible while the list is longer than its area, so that it is plain
        # that there is more below (an overlay scrollbar shows only while the pointer moves over it).
        scrolled.set_overlay_scrolling(False)
        scrolled.set_shadow_type(Gtk.ShadowType.IN)
        scrolled.set_min_content_height(LIST_MIN_HEIGHT)
        scrolled.add(self.list_box)
        outer.pack_start(scrolled, True, True, 0)

        buttons = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        self.pick_button = Gtk.Button(label=PICK_LABEL)
        self._add_pick_icon()
        self.pick_button.connect('clicked', self._on_pick_clicked)
        self.remove_button = Gtk.Button(label=REMOVE_LABEL)
        self.remove_button.connect('clicked', self._on_remove_clicked)
        self.remove_button.set_sensitive(False)
        self.startup_button = Gtk.Button(label=STARTUP_LABEL)
        self.startup_button.connect('clicked', self._on_startup_clicked)
        buttons.pack_start(self.pick_button, False, False, 0)
        buttons.pack_start(self.remove_button, False, False, 0)
        buttons.pack_end(self.startup_button, False, False, 0)
        outer.pack_start(buttons, False, False, 0)

        # The message bar: hidden until there is something to say, then it stays until it is
        # replaced or closed. show_all of the page must not show it.
        self.bar = Gtk.InfoBar()
        self.bar.set_no_show_all(True)
        self.bar.set_show_close_button(True)
        self.bar_label = Gtk.Label(xalign=0.0)
        self.bar_label.set_line_wrap(True)
        self.bar_label.show()
        self.bar.get_content_area().pack_start(self.bar_label, True, True, 0)
        self.undo_button = self.bar.add_button(UNDO_LABEL, UNDO_RESPONSE)
        self.bar.connect('response', self._on_bar_response)
        outer.pack_start(self.bar, False, False, 0)

    def _make_row(self, entry):
        row = Gtk.ListBoxRow()
        row.entry = entry
        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=12)
        box.set_border_width(6)
        box.pack_start(self._icon(entry.icon), False, False, 0)

        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        text.set_hexpand(True)
        top = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        name = Gtk.Label(xalign=0.0)
        name.set_markup('<b>%s</b>' % GLib.markup_escape_text(entry.name))
        name.set_ellipsize(Pango.EllipsizeMode.END)
        top.pack_start(name, False, False, 0)
        if entry.system:
            name.get_style_context().add_class('dim-label')
            note = Gtk.Label(label=SYSTEM_NOTE, xalign=0.0)
            note.get_style_context().add_class('dim-label')
            top.pack_start(note, False, False, 0)
        text.pack_start(top, False, False, 0)
        command = Gtk.Label(xalign=0.0)
        command.set_markup('<small>%s</small>' % GLib.markup_escape_text(entry.command))
        command.set_ellipsize(Pango.EllipsizeMode.END)
        command.get_style_context().add_class('dim-label')
        text.pack_start(command, False, False, 0)
        box.pack_start(text, True, True, 0)

        delay = Gtk.Label(label=DELAY_TEXT % {'seconds': entry.delay})
        delay.get_style_context().add_class('dim-label')
        box.pack_start(delay, False, False, 0)

        row.switch = Gtk.Switch()
        row.switch.set_valign(Gtk.Align.CENTER)
        row.switch.set_active(entry.enabled)
        row.switch.connect('notify::active', self._on_switch, row)
        box.pack_start(row.switch, False, False, 0)
        if entry.comment:
            row.set_tooltip_text(entry.comment)
        row.add(box)
        row.show_all()
        return row

    @staticmethod
    def _icon(icon):
        # As cs_startup.py (AutostartRow): a path is loaded at 24 px, a name comes from the theme.
        try:
            if icon and GLib.path_is_absolute(icon):
                pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(icon, ICON_PIXELS, ICON_PIXELS, True)
                image = Gtk.Image.new_from_pixbuf(pixbuf)
            else:
                image = Gtk.Image.new_from_icon_name(icon or DEFAULT_ICON, Gtk.IconSize.LARGE_TOOLBAR)
        except Exception:  # GLib.Error: a missing or broken image file
            image = Gtk.Image.new_from_icon_name(DEFAULT_ICON, Gtk.IconSize.LARGE_TOOLBAR)
        image.set_pixel_size(ICON_PIXELS)
        return image

    def _watch_folder(self):
        # The folder may not exist yet: GLib then watches for it to appear.
        self._monitor = Gio.File.new_for_path(self.user_dir).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, None)
        self._monitor.connect('changed', self._on_folder_changed)

    def _follow_enabled(self):
        # As pick_button.py: the handler sets 'sensitive' to the key's value now and on every change.
        self.settings.bind(ENABLED_SETTING, self, 'sensitive', Gio.SettingsBindFlags.GET)

    def _drop_old_pick(self):
        # A result in the key when the window opens is old (picked while no tab was open to take
        # it): it is not used, and it is cleared, because it may hold the command line of a window.
        if self.settings.get_value(PICK_KEY):
            self._clear_pick()

    def _listen_for_picks(self):
        # Only now, once the widget is built: the value the key had before is never used.
        self.settings.listen(PICK_KEY, self._on_pick_value)

    def _on_destroy(self, *args):
        self._destroyed = True
        if self._monitor is not None:
            self._monitor.cancel()
        if self._recheck_id is not None:
            GLib.source_remove(self._recheck_id)
            self._recheck_id = None

    # ---- the list ------------------------------------------------------------------------------

    def _gather(self):
        return gather_entries(self.user_dir, _system_dirs_or_default(None), blacklisted_apps())

    @staticmethod
    def _signature(entries):
        return [(e.basename, e.name, e.comment, e.command, e.icon, e.delay, e.enabled, e.system, e.user_path)
                for e in entries]

    def refresh(self):
        """Reads the entries again and rebuilds the rows if they changed; the selected entry stays
        selected. A list that cannot be read is said in the message bar; the rows stay as they are."""
        if self._destroyed or not self._built:
            return
        try:
            entries = self._gather()
        except Exception as e:  # OSError, GLib.Error; the logic itself catches what a file can raise
            _warn('could not read the startup entries: %s' % describe(e))
            self._error(NOT_READ_TEXT % {'reason': describe(e)})
            return
        if self._signature(entries) == self._signature(self._entries) and self.list_box.get_children():
            return
        selected = self.list_box.get_selected_row()
        selected = selected.entry.basename if selected is not None else None
        for row in self.list_box.get_children():
            self.list_box.remove(row)
            row.destroy()
        self._entries = entries
        for entry in entries:
            row = self._make_row(entry)
            self.list_box.add(row)
            if entry.basename == selected:
                self.list_box.select_row(row)
        self._update_remove()

    def _on_folder_changed(self, *args):
        if not self._destroyed:
            self.refresh()

    def _update_remove(self):
        self.remove_button.set_sensitive(self.list_box.get_selected_row() is not None)

    def _on_switch(self, switch, pspec, row):
        active = switch.get_active()
        if active == row.entry.enabled:
            return
        try:
            set_enabled(self.user_dir, row.entry, active)
        except (OSError, GLib.Error) as e:
            _warn('could not switch %s: %s' % (row.entry.basename, describe(e)))
            self._error(NOT_CHANGED_TEXT % {'name': row.entry.name, 'reason': describe(e)})
            switch.set_active(row.entry.enabled)  # back; entry.enabled was not changed

    def _on_remove_clicked(self, *args):
        row = self.list_box.get_selected_row()
        if row is None:
            return
        try:
            remove_entry(self.user_dir, row.entry)
        except (OSError, GLib.Error) as e:
            _warn('could not remove %s: %s' % (row.entry.basename, describe(e)))
            self._error(NOT_CHANGED_TEXT % {'name': row.entry.name, 'reason': describe(e)})
        self.refresh()

    # ---- the buttons ---------------------------------------------------------------------------

    def _get_proxy(self):
        # The proxy of pick_button.py: same bus, name, path, interface; no property cache and no
        # signal subscriptions, it only makes calls.
        if self._proxy is None:
            flags = Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES | Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS
            self._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION, flags, None,
                'org.Cinnamon', '/org/Cinnamon', 'org.Cinnamon', None)
        return self._proxy

    def _add_pick_icon(self):
        # The crosshair icon in front of the label, as on the General tab. The button keeps its label and its
        # natural width: only an image is set, shown even when the theme turns button images off. Without the
        # icon in the theme the glyph goes in front of the label instead. It never stops the page from building.
        # lookup_icon rather than has_icon: it also searches the legacy icon folders (linuxmint/cinnamon#13270);
        # 16 px is the size of Gtk.IconSize.BUTTON.
        try:
            theme = Gtk.IconTheme.get_default()
            if theme is not None and theme.lookup_icon(PICK_ICON_NAME, 16, 0) is not None:
                self.pick_button.set_image(Gtk.Image.new_from_icon_name(PICK_ICON_NAME, Gtk.IconSize.BUTTON))
                self.pick_button.set_image_position(Gtk.PositionType.LEFT)
                self.pick_button.set_always_show_image(True)
            else:
                self.pick_button.set_label(PICK_ICON_FALLBACK + ' ' + PICK_LABEL)
        except Exception as e:
            _warn('could not add the icon to the pick button: %s' % e)

    def _on_pick_clicked(self, *args):
        # The call of pick_button.py's _on_clicked (xlet-settings.py:65), with this callback. The
        # pick itself runs in Cinnamon; its result comes back through startup-pick.
        try:
            self._get_proxy().activateCallback('(sss)', PICK_CALLBACK, self.uuid, self.instance_id,
                                               timeout=CALL_TIMEOUT_MS)
        except GLib.Error as e:
            _warn('could not run %s in Cinnamon: %s' % (PICK_CALLBACK, e.message))
            self._error(NOT_PICKED_TEXT % {'reason': describe(e)})

    def _on_startup_clicked(self, *args):
        # Started without a shell and not waited for: GLib reaps it when it ends.
        try:
            Gio.Subprocess.new(STARTUP_TOOL, Gio.SubprocessFlags.NONE)
        except GLib.Error as e:
            _warn('could not start %s: %s' % (' '.join(STARTUP_TOOL), e.message))
            self._error(NOT_OPENED_TEXT % {'reason': describe(e)})

    # ---- the message bar -----------------------------------------------------------------------

    def _tell(self, text, undo=None, error=False):
        self._undo = undo
        self.bar.set_message_type(Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO)
        self.bar_label.set_text(text)
        self.undo_button.set_visible(undo is not None)
        self.bar.show()

    def _error(self, text):
        self._tell(text, error=True)

    def _on_bar_response(self, bar, response):
        if response == UNDO_RESPONSE:
            self._on_undo()
        else:  # the close button
            self._undo = None
            self.bar.hide()

    def _on_undo(self):
        if self._undo is None:
            return
        result, name = self._undo
        self._undo = None
        if undo(self.user_dir, result):  # never raises: a file it cannot read or write is a False
            self.bar.hide()
        else:
            self._tell(CHANGED_TEXT % {'name': name})
        self.refresh()

    # ---- a pick result -------------------------------------------------------------------------

    def _on_pick_value(self, key, value):
        # Called by the settings handler; nothing may raise out of it.
        if self._destroyed:
            return
        try:
            self._take_pick(value)
        except Exception as e:
            _warn('could not use the pick result: %s' % e)

    def _take_pick(self, value):
        if value == '' or value is None:
            return  # no result, or the clearing below
        result, why = parse_pick(value)
        if result is None:
            # The value is not logged: it may hold a command line.
            _warn('ignored a %s value: %s' % (PICK_KEY, why))
            return
        if result['stamp'] == self._last_stamp:
            return  # the same result again
        self._last_stamp = result['stamp']
        self._clear_pick()
        if result['kind'] == 'app':
            self._add_application(result)
        else:
            self._open_form(result)

    def _clear_pick(self):
        try:
            self.settings.set_value(PICK_KEY, '')
        except Exception as e:
            _warn('could not clear %s: %s' % (PICK_KEY, e))
            return
        # The clear paused the handler's view of the file (RECHECK_MS): read it again later, once.
        if self._recheck_id is None and not self._destroyed:
            self._recheck_id = GLib.timeout_add(RECHECK_MS, self._recheck)

    def _recheck(self):
        # A one-shot timer: returns False. A result written in the pause reaches _on_pick_value now.
        self._recheck_id = None
        check_settings = getattr(self.settings, 'check_settings', None)
        if not self._destroyed and callable(check_settings):
            try:
                check_settings()
            except Exception as e:
                _warn('could not read the settings file again: %s' % e)
        return False

    def _add_application(self, result):
        desktop_file = result['desktopFile']
        name = result['name'] or _stem(os.path.basename(desktop_file))
        try:
            # Read again: the decision must be made on the files, not on the rows on screen.
            added = add_application(self.user_dir, self._gather(), desktop_file)
        except (OSError, GLib.Error) as e:
            _warn('could not add %s: %s' % (desktop_file, describe(e)))
            self._error(NOT_ADDED_TEXT % {'name': name, 'reason': describe(e)})
            self.refresh()
            return
        self.refresh()
        # "Already in the list" changed nothing: there is nothing to undo.
        undoable = (added, name) if added.action != 'already-on' else None
        self._tell(ACTION_TEXTS[added.action] % {'name': name}, undo=undoable)

    def _parent(self):
        # The settings window, so that the form stays above it; None while the widget is in none.
        window = self.get_toplevel()
        return window if isinstance(window, Gtk.Window) else None

    def _make_form(self, result):
        dialog = Gtk.Dialog(title=FORM_TITLE, transient_for=self._parent(), modal=True)
        dialog.add_button(CANCEL_LABEL, Gtk.ResponseType.CANCEL)
        dialog.add_button(ADD_LABEL, Gtk.ResponseType.OK)
        dialog.set_default_response(Gtk.ResponseType.OK)
        area = dialog.get_content_area()
        area.set_border_width(6)
        grid = Gtk.Grid(column_spacing=12, row_spacing=6, border_width=6)
        area.add(grid)

        def field(number, label, widget):
            caption = Gtk.Label(label=label, xalign=0.0)
            grid.attach(caption, 0, number, 1, 1)
            grid.attach(widget, 1, number, 1, 1)

        dialog.name_entry = Gtk.Entry(hexpand=True, activates_default=True)
        dialog.name_entry.set_text(result['name'])
        dialog.command_entry = Gtk.Entry(hexpand=True, activates_default=True)
        dialog.command_entry.set_text(result['command'])  # exactly as received
        dialog.comment_entry = Gtk.Entry(hexpand=True, activates_default=True)
        dialog.delay_spin = Gtk.SpinButton.new_with_range(0, MAX_DELAY, 1)
        dialog.delay_spin.set_value(0)
        dialog.delay_spin.set_halign(Gtk.Align.START)
        field(0, NAME_LABEL, dialog.name_entry)
        field(1, COMMAND_LABEL, dialog.command_entry)
        guess = Gtk.Label(label=GUESS_TEXT, xalign=0.0)
        guess.set_line_wrap(True)
        guess.get_style_context().add_class('dim-label')
        grid.attach(guess, 1, 2, 1, 1)
        field(3, COMMENT_LABEL, dialog.comment_entry)
        field(4, DELAY_LABEL, dialog.delay_spin)
        dialog.error_label = Gtk.Label(xalign=0.0)
        dialog.error_label.set_line_wrap(True)
        dialog.error_label.set_no_show_all(True)
        grid.attach(dialog.error_label, 1, 5, 1, 1)
        area.show_all()
        return dialog

    def _open_form(self, result):
        """The form for a window without a desktop file: Add saves a custom entry (add_custom) and
        the bar offers Undo; Cancel and the close button save nothing. A command that cannot be
        saved, or a save that fails, is said in the form, which stays open."""
        dialog = self._make_form(result)
        added = None
        try:
            while dialog.run() == Gtk.ResponseType.OK:
                command = dialog.command_entry.get_text()
                argv, problem = check_command(command)
                if problem is None:
                    name = dialog.name_entry.get_text().strip() or os.path.basename(argv[0])
                    try:
                        basename = add_custom(self.user_dir, name, command, dialog.comment_entry.get_text(),
                                              dialog.delay_spin.get_value_as_int())
                        written = _read_bytes(os.path.join(self.user_dir, basename))
                        added = (AddResult('added', basename, None, written), name)
                        break
                    except (OSError, GLib.Error) as e:
                        _warn('could not add a custom entry: %s' % describe(e))
                        problem = NOT_ADDED_TEXT % {'name': name, 'reason': describe(e)}
                dialog.error_label.set_text(problem)
                dialog.error_label.show()
        finally:
            dialog.destroy()
        self.refresh()
        if added is not None:
            self._tell(ACTION_TEXTS['added'] % {'name': added[1]}, undo=added)
