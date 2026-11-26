"""Notices: things that happen on their own and that the island shows while
collapsed.

There are three sources: files that finish arriving in the downloads folder,
Bluetooth accessories that connect, and accessory batteries that run low. Each
notice bumps a counter (`seq`) in the state; the front end shows the notice
when the counter changes.
"""
import json
import os
import time

from gi.repository import Gio, GLib

from .service import Service

# Names browsers and other programs use while a download is not finished.
TEMP_SUFFIXES = ('.part', '.crdownload', '.tmp', '.download', '.partial', '.opdownload', '.!qb')
SETTLE_MS = 1200          # time without changes before the file counts as ready
REPEAT_WINDOW_S = 15      # never announce the same file twice within this time
LOW_BATTERY = 20          # announce when the battery reaches this percentage
BATTERY_RESET = 30        # and only announce again after it goes above this one

UPOWER = 'org.freedesktop.UPower'
UPOWER_DEVICE = 'org.freedesktop.UPower.Device'
BLUEZ = 'org.bluez'
BLUEZ_DEVICE = 'org.bluez.Device1'
PROPS_IFACE = 'org.freedesktop.DBus.Properties'
# UPower types that are the machine itself, not an accessory.
UPOWER_NOT_ACCESSORY = (0, 1, 2, 3)  # unknown, line power, battery, UPS


def is_temp(name):
    return name.startswith('.') or name.lower().endswith(TEMP_SUFFIXES)


class Notices(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Notices'
    METHODS = {'Configure': 's'}

    def __init__(self, connection):
        super().__init__(connection)
        self._seq = 0
        self._downloads = True
        self._devices = True
        self._pending = {}    # path -> id of the "settled" timer
        self._announced = {}  # path -> when it was announced
        self._low = set()     # accessories already announced as low on battery
        self._monitor = None
        self.set_state({'seq': 0, 'notice': None})
        self._watch_downloads()
        self._watch_system_bus()

    def notify(self, kind, **fields):
        """Shows a notice on the island; other parts of the engine use it too."""
        self._seq += 1
        self.set_state({'seq': self._seq, 'notice': dict(fields, kind=kind)})

    # --- downloads -----------------------------------------------------------

    def _watch_downloads(self):
        folder = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)
        if not folder or not os.path.isdir(folder):
            return
        try:
            self._monitor = Gio.File.new_for_path(folder).monitor_directory(
                Gio.FileMonitorFlags.WATCH_MOVES, None)
        except GLib.Error:
            return
        self._monitor.connect('changed', self._on_file_event)

    def _on_file_event(self, monitor, file, other, event):
        # A finished download shows up in two ways: the browser renames the
        # temporary file to the final name, or the program writes straight to
        # the final name and stops touching it.
        if event in (Gio.FileMonitorEvent.RENAMED, Gio.FileMonitorEvent.MOVED_IN):
            target = other if event == Gio.FileMonitorEvent.RENAMED else file
            if target is not None:
                self._settle(target.get_path())
        elif event in (Gio.FileMonitorEvent.CREATED, Gio.FileMonitorEvent.CHANGED,
                       Gio.FileMonitorEvent.CHANGES_DONE_HINT):
            self._settle(file.get_path())

    def _settle(self, path):
        """(Re)starts the wait: the notice goes out when the file stops changing."""
        if not path or is_temp(os.path.basename(path)):
            return
        if path in self._pending:
            GLib.source_remove(self._pending[path])
        self._pending[path] = GLib.timeout_add(SETTLE_MS, self._on_settled, path)

    def _on_settled(self, path):
        self._pending.pop(path, None)
        now = time.monotonic()
        self._announced = {p: t for p, t in self._announced.items() if now - t < REPEAT_WINDOW_S}
        try:
            ready = os.path.isfile(path) and os.path.getsize(path) > 0
        except OSError:
            ready = False
        # While a temporary file sits next to it (file.pdf.part), the browser
        # is still downloading.
        still_downloading = any(os.path.exists(path + suffix) for suffix in TEMP_SUFFIXES)
        if self._downloads and ready and not still_downloading and path not in self._announced:
            self._announced[path] = now
            self.notify('download', name=os.path.basename(path), path=path)
        return GLib.SOURCE_REMOVE

    # --- accessories
    # -----------------------------------------------------------

    def _watch_system_bus(self):
        try:
            self._system = Gio.bus_get_sync(Gio.BusType.SYSTEM, None)
        except GLib.Error:
            self._system = None
            return
        # Bluetooth: the Connected property of a device changed.
        self._system.signal_subscribe(
            BLUEZ, PROPS_IFACE, 'PropertiesChanged', None, BLUEZ_DEVICE,
            Gio.DBusSignalFlags.NONE, self._on_bluez_changed)
        # UPower: the battery percentage of a device changed.
        self._system.signal_subscribe(
            UPOWER, PROPS_IFACE, 'PropertiesChanged', None, UPOWER_DEVICE,
            Gio.DBusSignalFlags.NONE, self._on_upower_changed)

    def _get_all(self, bus_name, path, interface, callback):
        def done(connection, result):
            try:
                callback(connection.call_finish(result).unpack()[0])
            except GLib.Error:
                pass
        self._system.call(
            bus_name, path, PROPS_IFACE, 'GetAll', GLib.Variant('(s)', (interface,)),
            GLib.VariantType.new('(a{sv})'), Gio.DBusCallFlags.NONE, -1, None, done)

    def _on_bluez_changed(self, connection, sender, path, interface, signal, parameters):
        iface, changed, invalidated = parameters.unpack()
        if changed.get('Connected') is not True or not self._devices:
            return
        self._get_all(BLUEZ, path, BLUEZ_DEVICE, lambda props: self.notify(
            'device', name=props.get('Alias') or props.get('Name') or '', icon=props.get('Icon', '')))

    def _on_upower_changed(self, connection, sender, path, interface, signal, parameters):
        iface, changed, invalidated = parameters.unpack()
        if 'Percentage' not in changed:
            return
        self._get_all(UPOWER, path, UPOWER_DEVICE, lambda props: self.check_battery(path, props))

    def check_battery(self, path, props):
        """Announces once when the battery of an accessory drops to the limit."""
        if props.get('Type') in UPOWER_NOT_ACCESSORY or not props.get('IsPresent', True):
            return
        percentage = round(props.get('Percentage', 100))
        if percentage > BATTERY_RESET:
            self._low.discard(path)
        elif percentage <= LOW_BATTERY and path not in self._low:
            self._low.add(path)
            if self._devices:
                self.notify('battery', name=props.get('Model') or '', percentage=percentage)

    # --- commands ----------------------------------------------------------

    def do_Configure(self, text):
        config = json.loads(text)
        self._downloads = bool(config.get('downloads', True))
        self._devices = bool(config.get('devices', True))
