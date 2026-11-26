# SPDX-License-Identifier: GPL-3.0-or-later
# Window Memory: the "Forget all remembered windows" row of the settings dialog.
# A custom widget in place of the plain schema button: a red warning icon before the label,
# and a border in the theme's selection colour, the border of the "Pick a window" button. It
# does what the plain button does: it asks Cinnamon to run the extension callback named in the
# schema. Then a dialog says what happened: how many remembered windows were forgotten, or why
# they were not. The label, the text colour and the button colour are the plain button's: only
# the icon is red.
#
# cinnamon-settings builds it for a schema item of type "custom"
# (xlet-settings.py:474-491, called at :457) as ForgetAllButton(item, key, settings),
# where item is the schema entry, key is "forget-all" and settings is the
# JSONSettingsHandler of the instance. The result has to be a SettingsWidget (:460-461).
# It loads each custom file as a module of its own (:481-483), so this file cannot import
# pick_button.py or backup_buttons.py: the border rule and the D-Bus call below are copies of
# pick_button.py's, and a test keeps the border rule equal; the reason of a failed call and the
# message dialog are copies of backup_buttons.py's.

import gettext
import json
import os
import sys

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
# (warn) stay in English.
_TRANSLATIONS = gettext.translation(UUID, os.path.join(GLib.get_home_dir(), '.local', 'share', 'locale'), fallback=True)


def _(text):
    return _TRANSLATIONS.gettext(text)


# Mint-Y and Mint-Y-Yaru inherit Adwaita, which ships this icon, so lookup_icon finds it there and
# users see the Adwaita icon. The character below is only for an icon theme chain without it.
# The Ubuntu font has no U+26A0, so GTK takes the glyph from a fallback font (DejaVu Sans, if
# one is installed). It is a label of its own in front of the text, so that the red can be put
# on the glyph alone.
ICON_NAME = 'dialog-warning-symbolic'
FALLBACK_GLYPH = '⚠'  # WARNING SIGN, U+26A0

# How long cinnamon-settings waits for Cinnamon, in milliseconds, before the click gives up.
CALL_TIMEOUT_MS = 5000

# The setting that makes dialog windows eligible to be remembered. The dialog that follows a click is
# one of them, so the setting is held off during a click (_hold_dialogs_off), and put back
# RELEASE_DELAY_MS after the dialog is closed, when Muffin has dropped its window.
DIALOGS_KEY = 'include-dialogs'
RELEASE_DELAY_MS = 500

# The texts of the dialogs of a click (_on_clicked), translated when the module is loaded.
# CONFIRM asks before anything is forgotten; NOTHING_TO_FORGET is all that is said when no window is remembered.
CONFIRM = _('Forget all remembered windows?')
NOTHING_TO_FORGET = _('No windows were remembered, so there is nothing to forget.')
FORGOTTEN = _('Forgot all remembered windows.')
NOT_FORGOTTEN = _('The remembered windows were not forgotten.')
# The text and detail when no answer came in time, or the connection closed: forgetAll may have run
# all the same (_outcome_unknown).
UNANSWERED = _('It is not known whether the remembered windows were forgotten.')
UNANSWERED_DETAIL = _('Window Memory did not answer in time.')
# The text and detail after a call that succeeded when the state file still holds an entry from
# before it: the extension could not write the emptied state (old_entries_left).
NOT_SAVED = _('Forgot all remembered windows, but the change could not be saved.')
NOT_SAVED_DETAIL = _('The remembered windows may come back the next time Window Memory starts.')

# The D-Bus name of the error the bus answers when Cinnamon went away, or did not answer, before it
# replied (NO_REPLY_ERROR in backup_buttons.py).
NO_REPLY_ERROR = 'org.freedesktop.DBus.Error.NoReply'

# The remote error of a call that Cinnamon could not run, and what the error dialog says then:
# NOT_RUNNING_ERROR and NOT_RUNNING of backup_buttons.py. Cinnamon looks the callback up on the
# object of the uuid (ui/cinnamonDBus.js:359-363), which is null while the extension is not
# running, and cjs returns the TypeError this raises under this name (cjs 6.0.0,
# core/overrides/Gio.js:327-341).
NOT_RUNNING_ERROR = 'org.gnome.gjs.JSError.TypeError'
NOT_RUNNING = _('Window Memory is not running. Enable it in System Settings, then try again.')

# The warning icon, or the glyph, is red. Only while it is not disabled (GTK 3.20+ accepts
# :not(:disabled)): the icon is disabled whenever the button is, because GTK passes
# insensitivity down to children. The button is disabled while "Enable Window Memory" is off,
# and then the icon has the theme's own disabled colour, like the label. A single-colour
# symbolic icon, such as Adwaita's dialog-warning-symbolic, is drawn in the CSS colour of its
# widget, as text is, so one rule colours both kinds of mark. That holds for single-colour
# symbolic icons only: GTK draws the parts of a symbolic icon that are marked as warning, error
# or success in the theme's colours for those, and does not recolour a full-colour icon.
RED = '#e01b24'
ICON_CSS_CLASS = 'window-memory-forget-icon'
ICON_CSS = ('.%s:not(:disabled) { color: %s; }' % (ICON_CSS_CLASS, RED)).encode('utf-8')

# The border rule of pick_button.py (CSS_CLASS and CSS there), word for word, in a class of its
# own. @theme_selected_bg_color is the selection colour of Adwaita-based themes, Mint-Y
# included (orange, #ff7139, in Mint-Y-Dark-Orange). A name the theme does not define is not a
# CSS error: the colour is looked up when the widget is styled, and the border is then drawn
# in the text colour. box-shadow: none removes the outer shadow some themes give buttons. Both
# only while the button is not disabled: then it is the theme's own disabled button.
CSS_CLASS = 'window-memory-forget'
CSS = ('.%s:not(:disabled) { border: 1px solid @theme_selected_bg_color; box-shadow: none; }'
       % CSS_CLASS).encode('utf-8')


def warn(message):
    print('window-memory: ' + message, file=sys.stderr)


# sentence, describe and remote_reason are copies of the functions of the same names in
# backup_buttons.py.
def sentence(text):
    return text if text.endswith('.') else text + '.'


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


def state_path():
    # The state file of the extension, STATE_PATH in extension.js: GLib.get_user_config_dir() +
    # '/window-memory' (STATE_DIR, line 27) + '/state.json'. cinnamon-settings runs in the session
    # of Cinnamon, so GLib gives both the same folder.
    return os.path.join(GLib.get_user_config_dir(), 'window-memory', 'state.json')


def read_windows():
    # The entries of "windows" in the state file, read once, as JSON. Raises FileNotFoundError when
    # there is no file, and another exception when the file cannot be read or parsed, or holds no
    # list of windows.
    with open(state_path(), 'rb') as f:
        state = json.loads(f.read().decode('utf-8'))
    windows = state.get('windows') if isinstance(state, dict) else None
    if not isinstance(windows, list):
        raise ValueError('it holds no list of windows')
    return windows


def entry_ids(windows):
    # The ids of the entries in windows: the "id" text that the extension gives every entry it saves.
    return set(entry['id'] for entry in windows if isinstance(entry, dict) and isinstance(entry.get('id'), str))


def remembered_windows():
    # Before the call, from one read of the state file: (count, ids). count is how many windows are
    # remembered, the entries of "windows"; ids is the set of their ids. (0, no ids) when there is
    # no file: the extension writes it when it first saves a window. (None, None), unknown, when the
    # file cannot be read or parsed, or holds no list of windows; the reason is logged. It never
    # raises, so that it cannot stop the call.
    try:
        windows = read_windows()
        return len(windows), entry_ids(windows)
    except FileNotFoundError:
        return 0, set()
    except Exception as e:  # OSError; ValueError: not UTF-8, not JSON, no list
        warn('could not count the remembered windows in the state file: %s' % e)
        return None, None


def old_entries_left(ids):
    # After a call that succeeded: True when the state file still holds an entry whose id is in ids,
    # the ids from before the call. The extension writes the emptied state during the call, so an old
    # entry that is left means that this write failed. Ids, not counts: an entry saved after the call
    # has a new id. False when ids is unknown (None) or the file cannot be read now; it never raises.
    try:
        now = entry_ids(read_windows())
    except Exception:  # no file, or one that cannot be read or parsed: no old entry can be seen in it
        return False
    return bool(ids and ids & now)


def forgotten_detail(count):
    # The secondary text of the dialog after a call that succeeded, for count remembered windows;
    # None, no secondary text, when the count is unknown. The form for the count is the language's
    # (ngettext). The count is filled in by name, so that a translated form without it still works.
    if not count:  # unknown (None); a count of 0 never reaches the call
        return None
    return _TRANSLATIONS.ngettext('%(count)d remembered window was forgotten.',
                                  '%(count)d remembered windows were forgotten.', count) % {'count': count}


def add_style(widget, css_class, css, what):
    # Puts css_class on widget, with the rule css for it. A rule GTK rejects is logged and
    # left out; the widget keeps the theme's look.
    provider = Gtk.CssProvider()
    try:
        provider.load_from_data(css)
    except GLib.Error as e:
        warn('the %s CSS was rejected: %s' % (what, e.message))
        return
    context = widget.get_style_context()
    context.add_class(css_class)
    # Added to this widget only, and above the theme (which is at THEME priority).
    context.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)


class ForgetAllButton(SettingsWidget):
    # An exception raised in __init__ stops cinnamon-settings from building the whole page:
    # create_custom_widget calls the class outside any try (xlet-settings.py:491), and its
    # callers have none either (:457, :413). So keep __init__ defensive: what depends on the
    # theme or on GTK is wrapped in try, logged, and given a plain fallback.
    #
    # Greying out: this widget binds nothing itself. Once the page is shown, the page pass of
    # pick_button.py (PickWindowButton._on_map) binds every SettingsWidget on the page to "Enable
    # Window Memory", except that switch and the rows marked always_sensitive (the pick button
    # binds itself), and this widget is one of the rows it binds: while the switch is off, the
    # row, its button and the icon are greyed out. self.key is set as the other rows set theirs.
    # The pass does not need it to bind this row: it reads the keys of the rows only to find the
    # switch and the never-remember list, and to name a row in its warnings.
    def __init__(self, info, key, settings):
        super(ForgetAllButton, self).__init__()
        self.key = key
        self.settings = settings
        self.callback = str(info['callback'])
        self.uuid = UUID
        # A single-instance xlet such as an extension has one settings file named after
        # its uuid, and the handler's instance_id is that file name (xlet-settings.py:307-308,
        # :328). The plain button sends the same value (:409, :453).
        self.instance_id = str(getattr(settings, 'instance_id', None) or UUID)
        self.label = info['description']
        self._proxy = None
        self._held = False  # True while this row has turned include-dialogs off and not yet back on
        self._release_id = None
        self.connect('destroy', lambda *args: self._release_dialogs())

        self.content_widget = Gtk.Button()
        self.content_widget.connect('clicked', self._on_clicked)

        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        row.set_halign(Gtk.Align.CENTER)
        try:
            has_icon = self._theme_has_icon()
        except Exception as e:
            warn('could not look up the %s icon: %s' % (ICON_NAME, e))
            has_icon = False
        if has_icon:
            mark = Gtk.Image.new_from_icon_name(ICON_NAME, Gtk.IconSize.BUTTON)
        else:
            mark = Gtk.Label(label=FALLBACK_GLYPH)
        try:
            self._apply_red(mark)
        except Exception as e:
            warn('could not colour the warning mark: %s' % e)
        row.pack_start(mark, False, False, 0)
        row.pack_start(Gtk.Label(label=self.label), False, False, 0)
        self.content_widget.add(row)

        try:
            self._apply_border()
        except Exception as e:
            warn('could not style the button border: %s' % e)
        self.pack_start(self.content_widget, True, True, 0)

    @staticmethod
    def _theme_has_icon():
        # lookup_icon rather than has_icon: it also searches the legacy icon folders
        # (linuxmint/cinnamon#13270). 16 px is the size of Gtk.IconSize.BUTTON.
        theme = Gtk.IconTheme.get_default()
        return theme is not None and theme.lookup_icon(ICON_NAME, 16, 0) is not None

    def _apply_red(self, mark):
        add_style(mark, ICON_CSS_CLASS, ICON_CSS, 'warning mark')

    def _apply_border(self):
        add_style(self.content_widget, CSS_CLASS, CSS, 'button border')

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

    def _on_clicked(self, *args):
        # The same call as XLETSettingsButton.on_activated (xlet-settings.py:65).
        # Cinnamon runs the callback on the object enable() returned
        # (ui/cinnamonDBus.js:359-363, :296-310).
        # The timeout keeps a Cinnamon that does not answer from freezing the settings window
        # for the 25 s D-Bus default (the call is synchronous, as the plain button's is).
        # The remembered windows are counted before the call: the extension empties the state file
        # during it. A window remembered in the second before the click may not be in the file yet,
        # so the count can be low. The ids of the entries are read with the count, and again after a
        # call that succeeded (old_entries_left). A dialog then says what happened.
        # Nothing remembered (a count of 0): a dialog says so, and nothing is called. Otherwise a dialog asks
        # first, and only its OK goes on to the call: Cancel and the window's close button leave the windows
        # remembered. An unknown count (None) is asked about as well: there may be windows to lose.
        count, ids = remembered_windows()
        self._hold_dialogs_off()
        try:
            if count == 0:
                self._tell(NOTHING_TO_FORGET)
            elif self._confirmed():
                self._click(count, ids)
        finally:
            self._release_later()

    def _hold_dialogs_off(self):
        # With "Also remember dialog windows" on, the dialog of this click would be remembered itself, and
        # the next Forget all would count it. So the setting is turned off for the click, and put back by
        # _release_later. A second click before that finds it already held: the setting is then off, but
        # the user's value is still the one to put back. A handler that cannot read or set it is logged
        # and left alone: the click goes on.
        if self._held:
            self._cancel_release()
            return
        try:
            if self.settings.get_value(DIALOGS_KEY) is not True:
                return
            self.settings.set_value(DIALOGS_KEY, False)
            self._held = True
        except AttributeError:  # a handler with no get_value or set_value
            return
        except Exception as e:
            warn('could not turn %s off for the dialog: %s' % (DIALOGS_KEY, e))

    def _release_later(self):
        # After the dialog is destroyed its window is unmanaged by Muffin a moment later, so the setting
        # goes back on after a short delay, and at once if the row is destroyed before that.
        if not self._held:
            return
        self._cancel_release()
        self._release_id = GLib.timeout_add(RELEASE_DELAY_MS, self._release_dialogs)

    def _cancel_release(self):
        if self._release_id is not None:
            GLib.source_remove(self._release_id)
            self._release_id = None

    def _release_dialogs(self):
        # Puts include-dialogs back on, once; returns False so that the timeout is not repeated.
        self._release_id = None
        if self._held:
            self._held = False
            try:
                self.settings.set_value(DIALOGS_KEY, True)
            except Exception as e:
                warn('could not turn %s back on: %s' % (DIALOGS_KEY, e))
        return False

    def _click(self, count, ids):
        try:
            self._get_proxy().activateCallback('(sss)', self.callback, self.uuid, self.instance_id,
                                               timeout=CALL_TIMEOUT_MS)
        except GLib.Error as e:
            warn('could not run %s in Cinnamon: %s' % (self.callback, e.message))
            if self._outcome_unknown(e):
                self._tell(UNANSWERED, UNANSWERED_DETAIL, error=True)
            else:
                self._tell(NOT_FORGOTTEN, self._reason(e), error=True)
            return
        if old_entries_left(ids):
            self._tell(NOT_SAVED, NOT_SAVED_DETAIL, error=True)
        else:
            self._tell(FORGOTTEN, forgotten_detail(count))

    @staticmethod
    def _outcome_unknown(error):
        # True when a failed call may have run all the same, so that the remembered windows may have
        # been forgotten: no answer came in time, the connection closed, or the bus answered NoReply
        # for Cinnamon. GDBus raises a call that times out (here after CALL_TIMEOUT_MS), or meets a
        # closed connection, as a local Gio.IOErrorEnum.TIMED_OUT or CLOSED (Gio.DBusError has no
        # CLOSED); Gio.DBusError.TIMED_OUT counts too. Any other remote error is an answer, of
        # Cinnamon or of the bus, and any other error comes before the call is sent: the dialog then
        # says that the windows were not forgotten. The code is a copy of _outcome_unknown in
        # backup_buttons.py, so that both buttons classify a failed call the same way.
        if not isinstance(error, GLib.Error):
            return False
        if Gio.DBusError.is_remote_error(error):
            return Gio.DBusError.get_remote_error(error) == NO_REPLY_ERROR
        io, dbus = Gio.io_error_quark(), Gio.dbus_error_quark()
        return (error.matches(io, Gio.IOErrorEnum.TIMED_OUT) or error.matches(io, Gio.IOErrorEnum.CLOSED)
                or error.matches(dbus, Gio.DBusError.TIMED_OUT))

    @staticmethod
    def _reason(error):
        # The reason in error, as a sentence for the user: for a remote D-Bus error, the text of the
        # error reply (remote_reason); else describe. A copy of _reason in backup_buttons.py.
        if isinstance(error, GLib.Error) and Gio.DBusError.is_remote_error(error):
            return remote_reason(Gio.DBusError.get_remote_error(error), error.message)
        return describe(error)

    # The dialog: _tell runs it, and returns once it is closed. The harness replaces Gtk.Dialog.run,
    # and checks the dialog that _message_dialog builds. These three are copies of the methods of
    # the same names in backup_buttons.py.

    def _parent(self):
        # The settings window, so that a dialog stays above it; None while the row is in no window.
        window = self.get_toplevel()
        return window if isinstance(window, Gtk.Window) else None

    def _message_dialog(self, text, detail, error):
        return Gtk.MessageDialog(transient_for=self._parent(), modal=True,
                                 message_type=Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO,
                                 buttons=Gtk.ButtonsType.OK, text=text, secondary_text=detail)

    def _confirmed(self):
        # The question: Cancel (the default, so that Enter does not forget) and OK. True only for OK; the
        # window's close button answers DELETE_EVENT, which is a cancel.
        dialog = Gtk.MessageDialog(transient_for=self._parent(), modal=True, message_type=Gtk.MessageType.QUESTION,
                                   buttons=Gtk.ButtonsType.OK_CANCEL, text=CONFIRM)
        dialog.set_default_response(Gtk.ResponseType.CANCEL)
        try:
            return dialog.run() == Gtk.ResponseType.OK
        finally:
            dialog.destroy()

    def _tell(self, text, detail=None, error=False):
        dialog = self._message_dialog(text, detail, error)
        try:
            dialog.run()
        finally:
            dialog.destroy()
