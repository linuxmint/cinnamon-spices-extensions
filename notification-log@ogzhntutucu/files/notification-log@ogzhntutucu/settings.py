# Custom pages for the Notification Log settings window (loaded by cinnamon-settings'
# xlet-settings.py). The extension only appends to the log; reading, deleting and
# redacting records happens here, in the settings process, never inside Cinnamon.

import gettext
import json
import os
import re
from datetime import datetime
from pathlib import Path

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, Gio, GLib, Gtk, Pango
from xapp.SettingsWidgets import SettingsPage, SettingsWidget

UUID = 'notification-log@ogzhntutucu'
LOG_DIR = Path(GLib.get_user_state_dir()) / 'notifications'
HIDDEN = '[hidden]'
# Browsers put the site as the first body line ("mail.proton.me")
SITE_RE = re.compile(r'^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$')

gettext.bindtextdomain(UUID, os.path.expanduser('~/.local/share/locale'))


def _(text):
    return gettext.dgettext(UUID, text)


def log_files():
    return sorted(LOG_DIR.glob('*.jsonl'))


def read_records():
    records = []
    for path in log_files():
        try:
            lines = path.read_text(encoding='utf-8').splitlines()
        except OSError:
            continue
        for line in lines:
            try:
                records.append((path, line, json.loads(line)))
            except ValueError:
                continue
    return records


def rewrite(path, transform):
    """Replace path with transform(line) for each line (None drops the line).

    The extension appends by path, so the new file is swapped in atomically and
    anything appended to the old file meanwhile is carried over."""
    with open(path, 'rb') as old:
        lines = old.read().decode('utf-8').splitlines()
        out = []
        for line in lines:
            new = transform(line)
            if new is not None:
                out.append(new + '\n')
        tmp = path.with_suffix('.tmp')
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.writelines(out)
        os.replace(tmp, path)
        rest = old.read()
    if rest:
        with open(path, 'ab') as f:
            f.write(rest)


def redact(record, hide_title=True):
    record = dict(record, body=HIDDEN, hidden=True)
    if hide_title:
        record['title'] = HIDDEN
    return json.dumps(record, ensure_ascii=False, separators=(',', ':'))


def matches(record, key):
    names = [record.get('source'), record.get('app')]
    names = [n.lower() for n in names if n]
    if record.get('app'):
        names.append(record['app'].lower().removesuffix('.desktop'))
    return any(key in n for n in names) or key in (record.get('body') or '').lower()


class HistoryPage(SettingsPage):
    COLUMNS = ('time', 'source', 'title', 'body', 'tooltip', 'path', 'line', 'sort')

    def __init__(self, info, settings):
        super().__init__()
        self.settings = settings
        self.set_margin_left(20)
        self.set_margin_right(20)
        self.set_spacing(10)

        bar = Gtk.Box(spacing=6)
        self.search = Gtk.SearchEntry(placeholder_text=_('Search'))
        self.search.connect('search-changed', lambda *a: (self.filter.refilter(), self.update_status()))
        bar.pack_start(self.search, True, True, 0)
        # Unticked apps are remembered, so apps seen for the first time always show up
        self.hidden_sources = set(settings.get_value('history-hidden-sources') or []) \
            if settings.has_key('history-hidden-sources') else set()
        self.app_button = Gtk.MenuButton()
        self.app_popover = Gtk.Popover()
        self.app_button.set_popover(self.app_popover)
        bar.pack_start(self.app_button, False, False, 0)
        refresh = Gtk.Button.new_from_icon_name('view-refresh-symbolic', Gtk.IconSize.BUTTON)
        refresh.set_tooltip_text(_('Refresh'))
        refresh.connect('clicked', lambda *a: self.load())
        bar.pack_start(refresh, False, False, 0)
        self.pack_start(bar, False, False, 0)

        self.store = Gtk.ListStore(str, str, str, str, str, str, str, str)
        self.filter = self.store.filter_new()
        self.filter.set_visible_func(self.visible)
        self.view = Gtk.TreeView(model=self.filter)
        self.view.set_tooltip_column(self.COLUMNS.index('tooltip'))
        self.view.connect('button-press-event', self.on_button_press)
        self.view.connect('popup-menu', lambda v: self.show_menu(None))
        for title, col, width in ((_('Time'), 0, 0), (_('App'), 1, 160), (_('Title'), 2, 220), (_('Text'), 3, 0)):
            # The time column is never shortened: it sizes itself to the longest timestamp
            cell = Gtk.CellRendererText(ellipsize=Pango.EllipsizeMode.END if col else Pango.EllipsizeMode.NONE)
            column = Gtk.TreeViewColumn(title, cell, text=col)
            column.set_resizable(True)
            if width:
                column.set_fixed_width(width)
            elif col == 0:
                column.set_sizing(Gtk.TreeViewColumnSizing.AUTOSIZE)
            column.set_expand(col == 3)
            self.view.append_column(column)

        scroll = Gtk.ScrolledWindow()
        scroll.set_shadow_type(Gtk.ShadowType.IN)
        scroll.set_min_content_height(380)
        scroll.set_min_content_width(820)
        scroll.add(self.view)
        self.pack_start(scroll, True, True, 0)

        self.status = Gtk.Label(xalign=0)
        self.status.get_style_context().add_class('dim-label')
        self.pack_start(self.status, False, False, 0)

        self.load()
        self.show_all()

    def load(self):
        self.store.clear()
        records = read_records()
        apps = {}
        for path, line, r in reversed(records):
            source = r.get('source') or '?'
            if r.get('internal'):
                source += ' (Cinnamon)'
            apps[source] = apps.get(source, 0) + 1
            try:
                when = datetime.fromisoformat(r['time'])
                time = when.strftime('%Y-%m-%d %H:%M:%S')
            except (KeyError, ValueError):
                time = r.get('time', '')
            body = r.get('body') or ''
            tooltip = GLib.markup_escape_text(body if len(body) < 2000 else body[:2000] + '…')
            self.store.append([time, source, r.get('title') or '', body.split('\n', 1)[0],
                               tooltip, str(path), line, r.get('time', '')])

        self.total = len(records)
        self.build_app_menu(apps)
        self.update_status()

    def build_app_menu(self, apps):
        self.apps = apps
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin=8)
        buttons = Gtk.Box(spacing=6, homogeneous=True)
        for label, show in ((_('All'), True), (_('None'), False)):
            b = Gtk.Button(label=label)
            b.connect('clicked', lambda b, show=show: self.set_all_apps(show))
            buttons.pack_start(b, True, True, 0)
        box.pack_start(buttons, False, False, 0)
        box.pack_start(Gtk.Separator(), False, False, 0)
        checks = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        self.app_checks = {}
        for app in sorted(apps, key=str.lower):
            check = Gtk.CheckButton(label='%s (%d)' % (app, apps[app]))
            check.set_active(app not in self.hidden_sources)
            check.connect('toggled', self.on_app_toggled, app)
            checks.pack_start(check, False, False, 0)
            self.app_checks[app] = check
        scroll = Gtk.ScrolledWindow(hscrollbar_policy=Gtk.PolicyType.NEVER)
        scroll.set_propagate_natural_height(True)
        scroll.set_max_content_height(400)
        scroll.add(checks)
        box.pack_start(scroll, True, True, 0)
        box.show_all()
        old = self.app_popover.get_child()
        if old:
            old.destroy()
        self.app_popover.add(box)

    def set_all_apps(self, show):
        for check in self.app_checks.values():
            check.set_active(show)

    def on_app_toggled(self, check, app):
        if check.get_active():
            self.hidden_sources.discard(app)
        else:
            self.hidden_sources.add(app)
        if self.settings.has_key('history-hidden-sources'):
            self.settings.set_value('history-hidden-sources', sorted(self.hidden_sources))
        self.filter.refilter()
        self.update_status()

    def update_status(self):
        shown_apps = sum(1 for app in self.apps if app not in self.hidden_sources)
        self.app_button.set_label(_('Apps (%d/%d)') % (shown_apps, len(self.apps)))
        if not self.total:
            self.status.set_text(_('No notifications logged yet. New notifications will appear here after you press Refresh.'))
            return
        shown = len(self.filter)
        if shown == self.total:
            text = gettext.dngettext(
                UUID, '%d notification. Right-click a row for more actions.',
                '%d notifications. Right-click a row for more actions.', self.total) % self.total
        else:
            text = gettext.dngettext(
                UUID, 'Showing %d of %d notification. Right-click a row for more actions.',
                'Showing %d of %d notifications. Right-click a row for more actions.',
                self.total) % (shown, self.total)
        self.status.set_text(text)

    def visible(self, model, it, data):
        if model[it][1] in self.hidden_sources:
            return False
        text = self.search.get_text().strip().lower()
        if not text:
            return True
        row = model[it]
        return text in ' '.join((row[1], row[2], row[4])).lower()

    def on_button_press(self, view, event):
        if event.type == Gdk.EventType.BUTTON_PRESS and event.button == 3:
            hit = view.get_path_at_pos(int(event.x), int(event.y))
            if hit:
                view.get_selection().select_path(hit[0])
                self.show_menu(event)
            return True
        return False

    def selected(self):
        model, it = self.view.get_selection().get_selected()
        if it is None:
            return None
        row = model[it]
        return Path(row[5]), row[6], json.loads(row[6])

    def show_menu(self, event):
        sel = self.selected()
        if sel is None:
            return
        path, line, record = sel
        menu = Gtk.Menu()

        def item(label, callback, sensitive=True):
            mi = Gtk.MenuItem(label=label)
            mi.set_sensitive(sensitive)
            mi.connect('activate', lambda *a: callback())
            menu.append(mi)

        hidden = bool(record.get('hidden'))
        item(_('Copy text'), lambda: self.copy(record), not hidden)
        menu.append(Gtk.SeparatorMenuItem())
        source = (record.get('source') or '').strip()
        if source:
            item(_('Hide notifications from "%s"') % source, lambda: self.hide(source.lower()))
        site = (record.get('body') or '').split('\n', 1)[0].strip().lower()
        if not hidden and SITE_RE.match(site):
            item(_('Hide notifications from site "%s"') % site, lambda: self.hide(site))
        menu.append(Gtk.SeparatorMenuItem())
        item(_('Delete this record'), lambda: self.delete(path, line))

        menu.show_all()
        menu.popup_at_pointer(event)

    def copy(self, record):
        text = '\n'.join(t for t in (record.get('title'), record.get('body')) if t)
        Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text(text, -1)

    def hide(self, key):
        rules = [dict(r) for r in (self.settings.get_value('hidden-apps') or [])]
        rule = next((r for r in rules if (r.get('app') or '').strip().lower() == key), None)
        if rule is None:
            rule = {'enabled': True, 'app': key, 'hide-title': True}
            rules.append(rule)
            self.settings.set_value('hidden-apps', rules)
        hide_title = rule.get('hide-title') is not False

        existing = [(p, l) for p, l, r in read_records() if not r.get('hidden') and matches(r, key)]
        if existing and self.confirm(
                _('Notifications matching "%s" will no longer be logged.') % key,
                gettext.dngettext(UUID, 'Also hide the text of the record already logged?',
                                  'Also hide the text of the %d records already logged?',
                                  len(existing)).replace('%d', str(len(existing))),
                _('Hide existing records')):
            targets = {}
            for p, l in existing:
                targets.setdefault(p, set()).add(l)
            for p, lines in targets.items():
                rewrite(p, lambda l, lines=lines: redact(json.loads(l), hide_title) if l in lines else l)
        self.load()

    def delete(self, path, line):
        done = []

        def drop(l):
            if not done and l == line:
                done.append(l)
                return None
            return l
        rewrite(path, drop)
        self.load()

    def confirm(self, text, secondary, action):
        dialog = Gtk.MessageDialog(transient_for=self.get_toplevel(), modal=True,
                                   message_type=Gtk.MessageType.QUESTION, text=text,
                                   secondary_text=secondary)
        dialog.add_button(_('Keep'), Gtk.ResponseType.CANCEL)
        dialog.add_button(action, Gtk.ResponseType.OK)
        response = dialog.run()
        dialog.destroy()
        return response == Gtk.ResponseType.OK


class StorageTools(SettingsWidget):
    def __init__(self, info, key, settings):
        super().__init__()
        self.info = Gtk.Label(xalign=0)
        self.pack_start(self.info, True, True, 0)
        open_button = Gtk.Button(label=_('Open log folder'))
        open_button.connect('clicked', self.open_folder)
        self.pack_end(open_button, False, False, 0)
        clear = Gtk.Button(label=_('Delete all logs…'))
        clear.get_style_context().add_class('destructive-action')
        clear.connect('clicked', self.clear)
        self.pack_end(clear, False, False, 0)
        self.update()

    def update(self):
        files = log_files()
        size = sum(f.stat().st_size for f in files)
        self.info.set_text(gettext.dngettext(UUID, '%d file, %s', '%d files, %s', len(files))
                           % (len(files), GLib.format_size(size)))

    def open_folder(self, *args):
        LOG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        Gio.AppInfo.launch_default_for_uri(LOG_DIR.as_uri(), None)

    def clear(self, *args):
        dialog = Gtk.MessageDialog(transient_for=self.get_toplevel(), modal=True,
                                   message_type=Gtk.MessageType.WARNING,
                                   text=_('Delete all logged notifications?'),
                                   secondary_text=_('This cannot be undone. New notifications will still be logged.'))
        dialog.add_button(_('Keep'), Gtk.ResponseType.CANCEL)
        dialog.add_button(_('Delete all'), Gtk.ResponseType.OK)
        dialog.get_widget_for_response(Gtk.ResponseType.OK).get_style_context().add_class('destructive-action')
        response = dialog.run()
        dialog.destroy()
        if response == Gtk.ResponseType.OK:
            for f in log_files():
                f.unlink(missing_ok=True)
            self.update()
