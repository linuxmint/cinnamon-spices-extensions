"""Tools tab: keep the screen awake, colour picker, screenshot and copying text
from the screen.
"""
import datetime
import os
import shutil
import subprocess
import tempfile

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, Gio, GLib, Gtk

from .service import Service

try:
    from .camera import CameraMirror
except (ImportError, ValueError):  # without GStreamer there is no camera mirror
    CameraMirror = None

SESSION = 'org.gnome.SessionManager'
SESSION_PATH = '/org/gnome/SessionManager'
# Blocks suspend (4) and the idle screen saver (8).
INHIBIT_FLAGS = 4 | 8
OCR_LANGUAGES = ('por', 'eng', 'spa')


class Tools(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Tools'
    METHODS = {
        'KeepAwake': 'd',        # minutes; 0 = until turned off
        'StopAwake': '',
        'PickColor': 'ii',       # reads the colour of the screen point (x, y)
        'Screenshot': 'b',       # true = pick an area
        'CopyScreenText': '',
        'ToggleCamera': 'ii',    # horizontal centre and top where the mirror opens
    }

    def __init__(self, connection, notices, files):
        super().__init__(connection)
        self._notices = notices
        self._files = files
        self._cookie = 0
        self._awake_minutes = 0   # chosen duration; 0 = until turned off
        self._awake_until = 0     # monotonic clock; 0 = no deadline
        self._awake_timer = 0
        self._camera = CameraMirror(self._on_camera_changed) if CameraMirror else None
        self._publish()

    def _on_camera_changed(self, active, error):
        if error:
            self._notices.notify('error', reason='camera')
        self._publish()

    def do_ToggleCamera(self, center_x, top):
        if not self._camera:
            self._notices.notify('error', reason='camera')
        elif self._camera.active:
            self._camera.close()
        else:
            self._camera.open(center_x, top)

    def _publish(self):
        remaining = -1
        if self._cookie and self._awake_until:
            remaining = max(0, int(self._awake_until - GLib.get_monotonic_time() / 1e6))
        self.set_state({
            'awake': bool(self._cookie),
            'awake_minutes': self._awake_minutes if self._cookie else 0,
            'awake_remaining': remaining,   # seconds; -1 = no deadline
            'ocr_available': shutil.which('tesseract') is not None,
            'camera': bool(self._camera and self._camera.active),
        })

    # --- keep awake
    # ------------------------------------------------------------

    def _session_call(self, method, parameters, reply=None):
        return self._connection.call_sync(
            SESSION, SESSION_PATH, SESSION, method, parameters,
            GLib.VariantType.new(reply) if reply else None, Gio.DBusCallFlags.NONE, 3000, None)

    def do_KeepAwake(self, minutes):
        self._stop_awake()
        try:
            self._cookie = self._session_call(
                'Inhibit', GLib.Variant('(susu)', ('cinnamon-island', 0, 'Keep the screen awake', INHIBIT_FLAGS)),
                '(u)').unpack()[0]
        except GLib.Error:
            self._cookie = 0
            self._notices.notify('error', reason='awake')
            return
        self._awake_minutes = minutes
        self._awake_until = GLib.get_monotonic_time() / 1e6 + minutes * 60 if minutes > 0 else 0
        self._awake_timer = GLib.timeout_add_seconds(15, self._on_awake_tick)
        self._publish()

    def _on_awake_tick(self):
        if self._awake_until and GLib.get_monotonic_time() / 1e6 >= self._awake_until:
            self._awake_timer = 0
            self.do_StopAwake()
            return GLib.SOURCE_REMOVE
        self._publish()
        return GLib.SOURCE_CONTINUE

    def do_StopAwake(self):
        self._stop_awake()
        self._publish()

    def _stop_awake(self):
        """Turns it off without telling the front ends (the caller decides when to
        publish).
        """
        if self._awake_timer:
            GLib.source_remove(self._awake_timer)
            self._awake_timer = 0
        if self._cookie:
            try:
                self._session_call('Uninhibit', GLib.Variant('(u)', (self._cookie,)))
            except GLib.Error:
                pass
            self._cookie = 0
        self._awake_until = 0

    # --- colour picker
    # -----------------------------------------------------------

    # What these tools "copy" travels in the notice itself (`copy`), and the
    # front end is the one that puts it on the clipboard: copying from here, a
    # process without a window, has already failed silently right after an area
    # capture.

    def do_PickColor(self, x, y):
        pixbuf = Gdk.pixbuf_get_from_window(Gdk.get_default_root_window(), x, y, 1, 1)
        if pixbuf is None:
            self._notices.notify('error', reason='color')
            return
        red, green, blue = pixbuf.get_pixels()[:3]
        color = '#%02X%02X%02X' % (red, green, blue)
        self._notices.notify('color', color=color, copy=color)

    # --- screenshot
    # --------------------------------------------------------------

    def _capture(self, area, path, done):
        """Takes the capture with gnome-screenshot and calls `done(succeeded)`."""
        args = ['gnome-screenshot', '-f', path] + (['-a'] if area else [])
        try:
            process = Gio.Subprocess.new(args, Gio.SubprocessFlags.STDERR_SILENCE)
        except GLib.Error:
            done(False)
            return
        # Cancelling the area selection (Esc) leaves no file at all.
        process.wait_async(None, lambda *a: done(os.path.exists(path) and os.path.getsize(path) > 0))

    def do_Screenshot(self, area):
        folder = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) or GLib.get_home_dir()
        name = datetime.datetime.now().strftime('Captura %Y-%m-%d %H-%M-%S.png')
        path = os.path.join(folder, name)

        def done(ok):
            if ok:
                self._files.add([path])
                self._notices.notify('screenshot', name=name, path=path)
        self._capture(area, path, done)

    def do_CopyScreenText(self):
        if shutil.which('tesseract') is None:
            self._notices.notify('error', reason='ocr-missing')
            return
        # The capture goes to a temporary folder private to the user: a
        # predictable name directly in /tmp could be taken first by another
        # account on the machine.
        folder = tempfile.mkdtemp(prefix='cinnamon-island-')
        path = os.path.join(folder, 'texto.png')

        def done(ok):
            if not ok:
                shutil.rmtree(folder, ignore_errors=True)
                return
            try:
                installed = subprocess.run(
                    ['tesseract', '--list-langs'], capture_output=True, text=True, timeout=10).stdout.split()
                languages = [lang for lang in OCR_LANGUAGES if lang in installed] or ['eng']
                text = subprocess.run(
                    ['tesseract', path, 'stdout', '-l', '+'.join(languages)],
                    capture_output=True, text=True, timeout=30).stdout.strip()
            except (OSError, subprocess.SubprocessError):
                text = ''
            finally:
                shutil.rmtree(folder, ignore_errors=True)
            if text:
                self._notices.notify('text', characters=len(text), copy=text)
            else:
                self._notices.notify('error', reason='ocr-empty')
        self._capture(True, path, done)
