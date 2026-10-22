"""Notifications tab: the system notifications, in an inbox.

The engine does not replace the notification service of the desktop: it only
listens. A second D-Bus connection becomes a "monitor" (`BecomeMonitor`) and
receives a copy of every `Notify` request programs send. The desktop keeps
showing notifications its own way.

Limits of listening: notifications Cinnamon creates internally (without going
through D-Bus) do not show up, and the engine cannot answer a notification.
Opening one is the job of the front end, which lives inside the desktop and
can reach the real notification and the windows of the program.

Nothing is written to disk: the inbox lives only while the engine runs.
"""
import html
import os
import re
import time

from gi.repository import Gio, GLib

from .service import Service

MAX_ITEMS = 30
MAX_BODY = 300
# Successive updates of the same notification (a progress report, for instance)
# replace the previous one instead of piling up.
SAME_WINDOW_S = 20
RULE = "type='method_call',interface='org.freedesktop.Notifications',member='Notify'"
# Programs whose notifications only echo something the island already shows.
IGNORED_APPS = ('cinnamon-island',)


def clean(text):
    """Strips the markup (<b>, <a href>) and repeated whitespace."""
    text = re.sub(r'<[^>]+>', '', text or '')
    return re.sub(r'\s+', ' ', html.unescape(text)).strip()


class Inbox(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Inbox'
    METHODS = {'Remove': 'u', 'Clear': '', 'MarkRead': '', 'SetEnabled': 'b'}

    def __init__(self, connection, notices=None):
        super().__init__(connection)
        self._notices = notices
        # Off until the front end turns it on: listening to notifications is
        # opt-in.
        self._enabled = False
        self._items = []      # most recent first
        self._next_id = 1
        self._unread = 0
        self._monitor = None
        self._publish()
        self._listen()

    def _publish(self):
        self.set_state({
            'available': self._monitor is not None,
            'enabled': self._enabled,
            'unread': self._unread,
            'items': [{key: item[key] for key in ('id', 'app', 'icon', 'title', 'body', 'time', 'desktop')}
                      for item in self._items],
        })

    # --- listening ---------------------------------------------------------

    def _listen(self):
        try:
            address = Gio.dbus_address_get_for_bus_sync(Gio.BusType.SESSION, None)
            monitor = Gio.DBusConnection.new_for_address_sync(
                address,
                Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT |
                Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
                None, None)
            # The filter has to be in place before the connection becomes a
            # monitor.
            monitor.add_filter(self._on_message)
            monitor.call_sync(
                'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.Monitoring',
                'BecomeMonitor', GLib.Variant('(asu)', ([RULE], 0)), None,
                Gio.DBusCallFlags.NONE, 3000, None)
        except GLib.Error:
            return  # bus without monitor support: the tab says so
        self._monitor = monitor
        self._publish()

    def _on_message(self, connection, message, incoming, *data):
        # Runs on a GDBus worker thread: it only extracts the data and hands
        # the work back to the main loop. The Notify request is swallowed here
        # (a monitor never replies); everything else goes through, otherwise
        # the reply to BecomeMonitor itself would be lost and the call would
        # hang.
        if (incoming and message.get_message_type() == Gio.DBusMessageType.METHOD_CALL
                and message.get_member() == 'Notify'):
            body = message.get_body()
            if body is not None:
                try:
                    GLib.idle_add(self._on_notify, body.unpack())
                except (TypeError, ValueError):
                    pass
            return None
        return message

    def _on_notify(self, fields):
        if not self._enabled or len(fields) < 8:
            return GLib.SOURCE_REMOVE
        app_name, replaces, app_icon, summary, body, actions, hints, expire = fields[:8]
        title = clean(summary)
        text = clean(body)[:MAX_BODY]
        desktop = str(hints.get('desktop-entry') or '')
        if not title and not text:
            return GLib.SOURCE_REMOVE
        if app_name.lower() in IGNORED_APPS:
            return GLib.SOURCE_REMOVE

        info = self._app_info(desktop) or self._app_info(app_name)
        item = {
            'app': info.get_display_name() if info else (app_name or desktop),
            'icon': self._icon(app_icon, hints, info),
            'title': title or text,
            'body': text if title else '',
            'time': int(time.time()),
            'desktop': info.get_id() if info else '',
        }
        # "Transient" notifications (the program asks not to keep them) show on
        # the closed island but do not enter the inbox.
        transient = bool(hints.get('transient'))
        if not transient:
            newest = self._items[0] if self._items else None
            if (newest and newest['app'] == item['app'] and newest['title'] == item['title']
                    and item['time'] - newest['time'] <= SAME_WINDOW_S):
                item['id'] = newest['id']
                self._items[0] = item
            else:
                item['id'] = self._next_id
                self._next_id += 1
                self._items.insert(0, item)
                del self._items[MAX_ITEMS:]
                self._unread += 1
            self._publish()
        if self._notices:
            self._notices.notify('notification', id=item.get('id', 0), app=item['app'],
                                 icon=item['icon'], title=item['title'], stored=not transient)
        return GLib.SOURCE_REMOVE

    @staticmethod
    def _app_info(name):
        """The program that sent it, from the name it reported."""
        if not name:
            return None
        for candidate in (name, name.lower(), name.lower().replace(' ', '-')):
            try:
                info = Gio.DesktopAppInfo.new(candidate + '.desktop')
            except TypeError:
                info = None
            if info:
                return info
        # Without a .desktop file with that exact name, take the first
        # installed program the system search finds for it.
        for group in Gio.DesktopAppInfo.search(name):
            for candidate in group:
                info = Gio.DesktopAppInfo.new(candidate)
                if info:
                    return info
        return None

    @staticmethod
    def _icon(app_icon, hints, info):
        """Icon name or image path, whichever is best."""
        for value in (app_icon, hints.get('image-path'), hints.get('image_path')):
            if not value or not isinstance(value, str):
                continue
            if value.startswith('file://'):
                try:
                    value = GLib.filename_from_uri(value)[0]
                except GLib.Error:
                    continue
            if not value.startswith('/') or os.path.exists(value):
                return value
        if info and info.get_icon():
            return info.get_icon().to_string()
        return 'dialog-information-symbolic'

    # --- commands ----------------------------------------------------------

    def do_Remove(self, item_id):
        self._items = [item for item in self._items if item['id'] != item_id]
        self._unread = min(self._unread, len(self._items))
        self._publish()

    def do_Clear(self):
        self._items = []
        self._unread = 0
        self._publish()

    def do_MarkRead(self):
        if self._unread:
            self._unread = 0
            self._publish()

    def do_SetEnabled(self, enabled):
        self._enabled = bool(enabled)
        self._publish()
