"""Files tab: a drag-and-drop shelf.

Cinnamon does not deliver files dragged from other programs to its extensions,
nor does it let them be dragged out. So the shelf has two halves: the island
draws the files, and the engine keeps an invisible window exactly under the
shelf area. The island opens a "hole" in its input region there, and that
window is what receives drops and starts drags out.

The shelf stores only the path of each file; nothing is copied or moved. A file
stays until the person removes it, with the x on its corner or by clearing
everything. Opening it or dragging it out does not remove it.
"""
import json
import os

import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, Gio, GLib, Gtk

from .service import Service

DATA_FILE = os.path.join(GLib.get_user_data_dir(), 'cinnamon-island', 'files.json')

# Width of each file on the shelf. The island draws the files left to right
# with this width, and the window uses the same arithmetic to know which file
# the mouse is over.
CELL = 88
# The square of each file's x: (x, y, side) inside the cell, against the top
# right corner of the icon. The island draws the x there and the window treats
# a click in that square as "remove".
CLOSE = (56, 14, 22)
URI_TARGET = 'text/uri-list'


class Files(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Files'
    METHODS = {'SetShelf': 'iiiib', 'Add': 's', 'Remove': 's', 'Clear': ''}
    # The mouse wheel turned over the invisible window: +1 down, -1 up. The
    # island never sees this event, so the engine forwards it.
    SIGNALS = {'Scrolled': 'i'}

    def __init__(self, connection):
        super().__init__(connection)
        self._paths = []
        try:
            with open(DATA_FILE) as file:
                saved = json.load(file)
            # For a while the file was a dictionary, with the pinned files
            # listed apart.
            if isinstance(saved, dict):
                saved = saved.get('files', [])
            self._paths = [p for p in saved if isinstance(p, str)]
        except (OSError, ValueError):
            pass
        self._hover = False
        self._over_close = -1     # index of the file whose x is under the mouse
        self._dropping = False    # something is being dragged over the shelf
        # Counts the drags that start in any program: whoever drags becomes the
        # owner of the XdndSelection selection. The island uses this to make
        # the drop target easier to hit.
        self._drags = 0
        self._dnd = None
        if Gdk.Display.get_default() is not None:
            self._dnd = Gtk.Clipboard.get(Gdk.Atom.intern('XdndSelection', False))
            self._dnd.connect('owner-change', self._on_drag_started)
        self._press = None        # (x, y, button) of the click in progress
        self._dragged = None      # path being dragged out
        self._drag_failed = False
        self._window = None
        self._build_window()
        self._publish()

    # --- state -------------------------------------------------------------

    def _publish(self):
        existing = [p for p in self._paths if os.path.exists(p)]
        if existing != self._paths:
            self._paths = existing
            self._save()
        files = []
        for path in self._paths:
            content_type, uncertain = Gio.content_type_guess(path, None)
            if os.path.isdir(path):
                content_type = 'inode/directory'
            files.append({
                'path': path,
                'name': os.path.basename(path) or path,
                'icon': Gio.content_type_get_icon(content_type).to_string(),
                'image': content_type.startswith('image/'),
            })
        self.set_state({'files': files, 'cell': CELL, 'close': CLOSE, 'hover': self._hover,
                        'over_close': self._over_close, 'drop': self._dropping,
                        'drags': self._drags})

    def _save(self):
        try:
            os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
            with open(DATA_FILE, 'w') as file:
                json.dump(self._paths, file, indent=2)
        except OSError:
            pass

    def _on_drag_started(self, clipboard, event):
        # A drag that starts from the shelf itself does not count.
        if self._dragged or not getattr(event, 'owner', None):
            return
        self._drags += 1
        self._publish()

    def _set_dropping(self, dropping):
        self._dropping = dropping
        self._set_hover(dropping)
        self._publish()

    def _set_hover(self, hover):
        if hover != self._hover:
            self._hover = hover
            if not hover:
                self._over_close = -1
            self._publish()

    def add(self, paths):
        """Puts files on the shelf (those already there are ignored)."""
        for path in paths:
            if path and path not in self._paths and os.path.exists(path):
                self._paths.append(path)
        self._save()
        self._publish()

    def _remove(self, path):
        if path in self._paths:
            self._paths.remove(path)
            self._over_close = -1
            self._save()
            self._publish()

    # --- invisible window ----------------------------------------------------

    def _build_window(self):
        if Gdk.Display.get_default() is None:
            return  # no display (e.g. engine started outside the graphical session)
        window = Gtk.Window(type=Gtk.WindowType.POPUP)
        window.set_app_paintable(True)
        visual = window.get_screen().get_rgba_visual()
        if visual:
            window.set_visual(visual)
        window.add_events(
            Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK |
            Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.ENTER_NOTIFY_MASK |
            Gdk.EventMask.LEAVE_NOTIFY_MASK | Gdk.EventMask.SCROLL_MASK)
        window.connect('draw', self._on_draw)
        window.connect('enter-notify-event', lambda *a: self._set_hover(True))
        window.connect('leave-notify-event', lambda *a: self._set_hover(False))
        window.connect('button-press-event', self._on_press)
        window.connect('motion-notify-event', self._on_motion)
        window.connect('button-release-event', self._on_release)
        window.connect('scroll-event', self._on_scroll)

        target = [Gtk.TargetEntry.new(URI_TARGET, 0, 0)]
        # Only COPY and LINK: with MOVE, the source program could delete the
        # file after "moving" it to the shelf.
        window.drag_dest_set(Gtk.DestDefaults.ALL, target, Gdk.DragAction.COPY | Gdk.DragAction.LINK)
        window.connect('drag-motion', lambda *a: self._set_dropping(True))
        window.connect('drag-leave', lambda *a: self._set_dropping(False))
        window.connect('drag-data-received', self._on_data_received)
        window.connect('drag-data-get', self._on_data_get)
        window.connect('drag-failed', self._on_drag_failed)
        window.connect('drag-end', self._on_drag_end)
        self._window = window

    @staticmethod
    def _on_draw(window, cr):
        cr.set_source_rgba(0, 0, 0, 0)
        cr.set_operator(0)  # CLEAR: the window is fully transparent
        cr.paint()
        return True

    def _on_scroll(self, window, event):
        if event.direction in (Gdk.ScrollDirection.DOWN, Gdk.ScrollDirection.RIGHT):
            self.emit('Scrolled', 'i', 1)
        elif event.direction in (Gdk.ScrollDirection.UP, Gdk.ScrollDirection.LEFT):
            self.emit('Scrolled', 'i', -1)
        return True

    def _path_at(self, x):
        index = int(x // CELL)
        return self._paths[index] if 0 <= index < len(self._paths) else None

    def _close_at(self, x, y):
        """Index of the file whose x is at (x, y), or -1."""
        index = int(x // CELL)
        left, top, side = CLOSE
        if (0 <= index < len(self._paths) and left <= x % CELL < left + side
                and top <= y < top + side):
            return index
        return -1

    def _on_press(self, window, event):
        self._press = (event.x, event.y, event.button)
        return True

    def _on_motion(self, window, event):
        if not self._press:
            over = self._close_at(event.x, event.y)
            if over != self._over_close:
                self._over_close = over
                self._publish()
            return False
        if self._press[2] != 1:
            return False
        x, y, button = self._press
        path = self._path_at(x)
        if path and self._close_at(x, y) < 0 and window.drag_check_threshold(int(x), int(y), int(event.x), int(event.y)):
            self._press = None
            self._dragged = path
            self._drag_failed = False
            targets = Gtk.TargetList.new([Gtk.TargetEntry.new(URI_TARGET, 0, 0)])
            context = window.drag_begin_with_coordinates(
                targets, Gdk.DragAction.COPY | Gdk.DragAction.MOVE | Gdk.DragAction.LINK,
                1, event, int(x), int(y))
            Gtk.drag_set_icon_gicon(context, Gio.content_type_get_icon(
                Gio.content_type_guess(path, None)[0]), 0, 0)
        return True

    def _on_release(self, window, event):
        if not self._press:
            return False
        x, y, button = self._press
        self._press = None
        path = self._path_at(x)
        if not path or button != 1:
            return True
        if self._close_at(x, y) >= 0:
            # Only removes if the button was released still over the same x.
            if self._close_at(event.x, event.y) == self._close_at(x, y):
                self._remove(path)
            return True
        # A plain click opens the file in the default program.
        try:
            Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(path, None), None)
        except GLib.Error:
            pass
        return True

    def _on_data_received(self, window, context, x, y, data, info, time):
        # Dropping a shelf file on the shelf itself does nothing.
        if self._dragged:
            Gtk.drag_finish(context, False, False, time)
            return
        paths = []
        for uri in data.get_uris() or []:
            try:
                paths.append(GLib.filename_from_uri(uri)[0])
            except GLib.Error:
                pass  # addresses that are not local files are ignored
        self.add(paths)
        Gtk.drag_finish(context, bool(paths), False, time)

    def _on_data_get(self, window, context, data, info, time):
        if self._dragged:
            data.set_uris([GLib.filename_to_uri(self._dragged, None)])

    def _on_drag_failed(self, window, context, result):
        self._drag_failed = True
        return False

    def _on_drag_end(self, window, context):
        # The file stays on the shelf after being dropped somewhere else.
        self._dragged = None

    # --- commands ----------------------------------------------------------

    def do_SetShelf(self, x, y, width, height, visible):
        """The island reports where the shelf is on screen (or that it is gone)."""
        if not self._window:
            return
        if visible and width > 0 and height > 0:
            self._window.move(x, y)
            self._window.resize(width, height)
            self._window.show()
        else:
            self._window.hide()
            self._press = None
            self._set_hover(False)

    def do_Add(self, path):
        self.add([path])

    def do_Remove(self, path):
        self._remove(path)

    def do_Clear(self):
        self._paths = []
        self._over_close = -1
        self._save()
        self._publish()
