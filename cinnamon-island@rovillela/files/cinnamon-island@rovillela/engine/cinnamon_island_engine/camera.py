"""Camera mirror: a small round window right below the island.

The window belongs to the engine (GTK), not to the island. It never takes
keyboard focus and stays above other windows. The picture is flipped, like a
mirror.
"""
import math

import cairo
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('Gst', '1.0')
from gi.repository import Gdk, GLib, Gst, Gtk

SIZES = (180, 300)       # normal and enlarged diameter
BUTTON = 26
GAP = 8
AUTO_OFF_S = 5 * 60      # the camera turns itself off after this long
RING = 3

CSS = b"""
.island-camera-button {
    min-width: 26px; min-height: 26px; padding: 0;
    border-radius: 13px; border: none; box-shadow: none;
    background-image: none; background-color: #16161a; color: #e6e6ea;
}
.island-camera-button:hover { background-color: #3a3a40; }
"""


def _circle(region, center_x, center_y, radius):
    """Adds a circle to a region, row by row."""
    for dy in range(-radius, radius):
        half = int(math.sqrt(radius * radius - (dy + 0.5) ** 2))
        if half > 0:
            region.union(cairo.RectangleInt(center_x - half, center_y + dy, 2 * half, 1))


class CameraMirror:
    """Turns the mirror on and off; calls `on_changed(open, error)` on every
    change.
    """

    def __init__(self, on_changed):
        self._on_changed = on_changed
        self._window = None
        self._pipeline = None
        self._timer = 0
        self._large = False
        self._anchor = (0, 0)   # horizontal centre and top, on screen
        # Where the person dragged the mirror to, relative to the default spot.
        # Kept until the engine restarts, like the size.
        self._offset = (0, 0)
        self._drag = None       # pointer (x, y) on screen and the offset, when the drag started

    @property
    def active(self):
        return self._window is not None

    def open(self, center_x, top):
        if self._window:
            return
        self._anchor = (center_x, top)
        Gst.init(None)
        # Camera -> square crop -> mirror -> the GTK video area.
        try:
            pipeline = Gst.parse_launch(
                'v4l2src ! videoconvert ! aspectratiocrop aspect-ratio=1/1 ! '
                'videoflip method=horizontal-flip ! videoconvert ! gtksink name=saida sync=false')
        except GLib.Error:
            self._on_changed(False, True)
            return
        video = pipeline.get_by_name('saida').props.widget

        provider = Gtk.CssProvider()
        provider.load_from_data(CSS)
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        window = Gtk.Window(type=Gtk.WindowType.POPUP)
        window.set_keep_above(True)
        window.set_accept_focus(False)
        fixed = Gtk.Fixed()
        fixed.put(video, 0, 0)
        # A ring over the edge of the video hides the jagged edge of the crop.
        ring = Gtk.DrawingArea()
        ring.connect('draw', self._draw_ring)
        # The ring covers the whole circle, so it is what receives the mouse:
        # press and drag to move the mirror.
        ring.add_events(
            Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK |
            Gdk.EventMask.POINTER_MOTION_MASK)
        ring.connect('button-press-event', self._on_press)
        ring.connect('motion-notify-event', self._on_motion)
        ring.connect('button-release-event', self._on_release)
        fixed.put(ring, 0, 0)
        close = self._button('window-close-symbolic', self.close)
        resize = self._button('view-fullscreen-symbolic', self._toggle_size)
        fixed.put(close, 0, 0)
        fixed.put(resize, 0, 0)
        window.add(fixed)

        self._window, self._pipeline = window, pipeline
        self._video, self._ring, self._fixed = video, ring, fixed
        self._close_button, self._resize_button = close, resize

        bus = pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message::error', lambda *a: self.close(error=True))
        self._layout()
        window.show_all()
        # When it appears, the window takes the natural size of the video; the
        # layout has to be redone once it is on screen.
        self._layout()
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            self.close(error=True)
            return
        self._timer = GLib.timeout_add_seconds(AUTO_OFF_S, lambda: self.close() or False)
        self._on_changed(True, False)

    def _button(self, icon, callback):
        button = Gtk.Button.new_from_icon_name(icon, Gtk.IconSize.MENU)
        button.set_can_focus(False)
        button.set_size_request(BUTTON, BUTTON)
        button.get_style_context().add_class('island-camera-button')
        button.connect('clicked', lambda *a: callback())
        return button

    def _draw_ring(self, widget, cr):
        size = SIZES[1 if self._large else 0]
        cr.set_source_rgba(0.086, 0.086, 0.102, 1)
        cr.set_line_width(RING * 2)
        cr.arc(size / 2, size / 2, size / 2, 0, 2 * math.pi)
        cr.stroke()
        return False

    def _layout(self):
        """Sets the size, the position and the round shape of the window."""
        size = SIZES[1 if self._large else 0]
        width = size + GAP + BUTTON
        self._video.set_size_request(size, size)
        self._ring.set_size_request(size, size)
        self._fixed.move(self._close_button, size + GAP, 6)
        self._fixed.move(self._resize_button, size + GAP, 6 + BUTTON + 6)
        self._window.resize(width, size)
        self._place()

        # The window only exists where the video circle and the two buttons
        # are.
        region = cairo.Region()
        _circle(region, size // 2, size // 2, size // 2)
        _circle(region, size + GAP + BUTTON // 2, 6 + BUTTON // 2, BUTTON // 2)
        _circle(region, size + GAP + BUTTON // 2, 6 + BUTTON + 6 + BUTTON // 2, BUTTON // 2)
        self._window.shape_combine_region(region)
        self._ring.queue_draw()

    def _place(self):
        """Puts the window at the default spot plus the dragged offset, never off
        screen.
        """
        size = SIZES[1 if self._large else 0]
        center_x, top = self._anchor
        screen = Gdk.Screen.get_default()
        x = center_x - size // 2 + self._offset[0]
        y = top + self._offset[1]
        x = max(0, min(screen.get_width() - size, x))
        y = max(0, min(screen.get_height() - size, y))
        self._window.move(x, y)

    def _on_press(self, widget, event):
        if event.button == 1:
            self._drag = (event.x_root, event.y_root, self._offset)
        return True

    def _on_motion(self, widget, event):
        if self._drag:
            start_x, start_y, offset = self._drag
            self._offset = (offset[0] + int(event.x_root - start_x), offset[1] + int(event.y_root - start_y))
            self._place()
        return True

    def _on_release(self, widget, event):
        self._drag = None
        return True

    def _toggle_size(self):
        self._large = not self._large
        self._layout()

    def close(self, error=False):
        if not self._window:
            return
        if self._timer:
            GLib.source_remove(self._timer)
            self._timer = 0
        self._pipeline.get_bus().remove_signal_watch()
        self._pipeline.set_state(Gst.State.NULL)
        self._window.destroy()
        self._window = self._pipeline = None
        self._on_changed(False, error)
