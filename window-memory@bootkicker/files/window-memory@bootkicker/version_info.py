# SPDX-License-Identifier: GPL-3.0-or-later
# Window Memory: the "Version" row, the last row of each tab of the settings window (the keys version-info and
# version-info-login of the schema build one instance each), for example
#   Version                      0.1.0 [1a2b3c4] | Report an issue
# The version is the "version" key of metadata.json. The commit is a link to that commit on
# GitHub: a Gtk.LinkButton, which opens the address in the user's default browser when it is
# clicked (its default handler calls gtk_show_uri_on_window(), Gtk-3.0.gir, signal
# activate-link of GtkLinkButton). The widget starts nothing and opens no connection itself.
# "Report an issue" is a second link of the same kind, at the end of the row: it opens the
# new-issue page of the repository with the bug report template. It is there without
# version.json too.
#
# On a Wayland session a short dimmed note, "Wayland (experimental)", follows the "Version" label, with its explanation
# as a tooltip. A session on X11 gets the row without it. The session is read from XDG_SESSION_TYPE when the row is
# built (from WAYLAND_DISPLAY when that is not set): the settings window runs inside the session it configures.
#
# The commit comes from version.json, next to this file. It is written into the installed copy and
# the package when they are built (scripts/write-version-json.sh) and is not tracked in the source
# repository. Without it only the version is shown.
#
# cinnamon-settings builds this widget for a schema item of type "custom"
# (xlet-settings.py:474-491, called at :413 and :457) as VersionInfo(item, key, settings),
# where item is the schema entry, key is "version-info" (or "version-info-login", the same row on the
# "Startup apps" tab) and settings is the JSONSettingsHandler of the instance. The result has to be a SettingsWidget (:416-417 and :460-461). The item's
# "description" has been run through the translation of the extension before this class sees
# it (xlet-settings.py:343-345), so the label is translated when a translation exists. The texts
# on the right ("unknown", "(uncommitted changes)", "Report an issue") are translated here.

import gettext
import json
import os
import re
import sys

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import GLib, Gtk
# SettingsWidget is the class cinnamon-settings checks with isinstance; SettingsLabel is the
# label the stock rows use (xapp/SettingsWidgets.py:261 and :299; Switch, :311-323, is built
# the same way: a SettingsLabel packed at the start, the control packed at the end).
from xapp.SettingsWidgets import SettingsLabel, SettingsWidget

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


# The commit page of the repository; the full hash is appended.
COMMIT_URL = 'https://github.com/bootkicker/window-memory/commit/'
# The new-issue page of the repository, with the bug report template.
ISSUE_URL = 'https://github.com/bootkicker/window-memory/issues/new?template=bug_report.md'

# The folder that holds this file: the installed copy (or the package) with metadata.json and
# version.json. cinnamon-settings loads this file by its path (xlet-settings.py:477-483), and
# importlib sets __file__ for a module loaded that way.
FOLDER = os.path.dirname(os.path.abspath(__file__))

# git prints a SHA-1 (40) or SHA-256 (64) hash in lower case. fullmatch, because `$` would also
# accept a trailing newline. Anything else is not put into a web address.
COMMIT_PATTERN = re.compile(r'[0-9a-f]{40,64}')
SHORT_LENGTH = 7

# Shown in place of the version when metadata.json has none.
UNKNOWN_VERSION = _('unknown')

# The note after the "Version" label on a Wayland session: a short label, and the explanation as its tooltip.
WAYLAND_NOTE = _('Wayland (experimental)')
WAYLAND_TIP = _("You are using Cinnamon's Wayland session, which is still experimental. Window Memory has been tested "
                "with it on Cinnamon 6.0.5. If a window is not remembered as expected, please use Report an issue.")

# A link button is a button, with the theme's button padding and minimum size around its text,
# which would leave gaps in "0.1.0 [1a2b3c4]". Without padding it reads as one line of text.
# Added to the links only, and above the theme (which is at THEME priority).
LINK_CSS_CLASS = 'window-memory-version-link'
LINK_CSS = ('.%s { padding: 0; min-width: 0; min-height: 0; }' % LINK_CSS_CLASS).encode('utf-8')


def is_wayland_session(env):
    """True on a Wayland session. env is a mapping like os.environ. XDG_SESSION_TYPE, set by the login manager, decides
    when it is there (an X11 login can still carry a WAYLAND_DISPLAY from elsewhere); without it, WAYLAND_DISPLAY does."""
    session = (env.get('XDG_SESSION_TYPE') or '').strip().lower()
    if session:
        return session == 'wayland'
    return bool(env.get('WAYLAND_DISPLAY'))


def warn(message):
    print('window-memory: ' + message, file=sys.stderr)


def read_json_object(name, may_be_missing):
    # The JSON object in the file called name in FOLDER, or None. A missing file is only
    # worth a warning when it should be there: version.json is not in a source checkout.
    path = os.path.join(FOLDER, name)
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        if not may_be_missing:
            warn('%s is missing' % path)
        return None
    except (OSError, ValueError) as e:  # ValueError: bad JSON, and bytes that are not UTF-8
        warn('could not read %s: %s' % (path, e))
        return None
    if not isinstance(data, dict):
        warn('%s does not hold a JSON object' % path)
        return None
    return data


def read_version():
    metadata = read_json_object('metadata.json', may_be_missing=False)
    version = metadata.get('version') if metadata else None
    if isinstance(version, str) and version.strip():
        return version.strip()
    if metadata is not None:
        warn('metadata.json has no usable "version"')
    return UNKNOWN_VERSION


def read_commit():
    # (commit, short, dirty) from version.json, or None when the file is missing or unusable.
    data = read_json_object('version.json', may_be_missing=True)
    if data is None:
        return None
    commit = data.get('commit')
    if not isinstance(commit, str) or not COMMIT_PATTERN.fullmatch(commit):
        warn('version.json has no valid "commit"; the commit link is left out')
        return None
    short = data.get('short')
    # The text on the link is trusted only when it is the start of the commit.
    if not (isinstance(short, str) and len(short) >= SHORT_LENGTH and commit.startswith(short)):
        short = commit[:SHORT_LENGTH]
    return commit, short, data.get('dirty') is True


class VersionInfo(SettingsWidget):
    # pick_button.py leaves a row with this attribute alone when it greys out the page while
    # "Enable Window Memory" is off: the version and the commit link are not a setting.
    always_sensitive = True

    # An exception raised in __init__ stops cinnamon-settings from building the whole page
    # (xlet-settings.py:491 has no try, and neither have its callers). Every failure that can
    # be expected here, a missing or damaged file, is handled by the read functions above.
    def __init__(self, info, key, settings):
        super(VersionInfo, self).__init__()
        self.key = key
        self.settings = settings
        self.label = SettingsLabel(info['description'])
        self.pack_start(self.label, False, False, 0)

        # None on X11. Cosmetic: if it cannot be made, the row is still complete.
        self.wayland_note = None
        if is_wayland_session(os.environ):
            try:
                note = Gtk.Label(label=WAYLAND_NOTE)
                note.set_tooltip_text(WAYLAND_TIP)
                note.set_margin_start(12)
                note.get_style_context().add_class('dim-label')
                self.pack_start(note, False, False, 0)
                self.wayland_note = note
            except Exception as e:
                warn('could not add the Wayland note: %s' % e)

        self.content_widget = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=0)
        self.pack_end(self.content_widget, False, False, 0)

        version = read_version()
        commit = read_commit()
        if commit is None:
            self._add_text(version)
            self._add_issue_link()
            return
        full, short, dirty = commit
        self._add_text(version + ' [')
        link = Gtk.LinkButton.new_with_label(COMMIT_URL + full, short)
        try:
            self._remove_padding(link)
        except Exception as e:
            warn('could not style the commit link: %s' % e)
        self.content_widget.pack_start(link, False, False, 0)
        self._add_text(']')
        if dirty:
            self._add_text(' ' + _('(uncommitted changes)'))
        self._add_issue_link()

    def _add_text(self, text):
        self.content_widget.pack_start(Gtk.Label(label=text), False, False, 0)

    def _add_issue_link(self):
        self._add_text(' | ')
        link = Gtk.LinkButton.new_with_label(ISSUE_URL, _('Report an issue'))
        try:
            self._remove_padding(link)
        except Exception as e:
            warn('could not style the issue link: %s' % e)
        self.content_widget.pack_start(link, False, False, 0)

    @staticmethod
    def _remove_padding(link):
        provider = Gtk.CssProvider()
        try:
            provider.load_from_data(LINK_CSS)
        except GLib.Error as e:
            warn('the link CSS was rejected: %s' % e.message)
            return
        context = link.get_style_context()
        context.add_class(LINK_CSS_CLASS)
        context.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
