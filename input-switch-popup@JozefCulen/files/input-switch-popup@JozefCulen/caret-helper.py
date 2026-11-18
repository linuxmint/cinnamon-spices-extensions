#!/usr/bin/env python3
"""Text caret tracker for the Input Switch Popup Cinnamon extension.

Runs as a child process of Cinnamon so that slow accessibility (AT-SPI) calls
can never freeze the desktop. Line-based protocol:

  stdin  "q"                  -> query the caret of the focused text widget
  stdout "caret PID X Y W H"  -> caret rectangle in screen coordinates
  stdout "none"               -> no usable caret

Exits when stdin is closed.
"""

import os
import sys

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib  # noqa: E402

# Last text widget that received focus or moved its caret.
focused = None


def has_text(accessible):
    try:
        return accessible is not None and accessible.get_text_iface() is not None
    except GLib.Error:
        return False


def on_event(event):
    global focused
    if event.type.startswith("object:state-changed:focused"):
        if event.detail1:
            focused = event.source if has_text(event.source) else None
    elif has_text(event.source):  # object:text-caret-moved
        focused = event.source


def usable(rect):
    return rect.height > 0 and (rect.x > 0 or rect.y > 0)


def caret_rect(accessible):
    """Returns (pid, x, y, width, height) of the caret, or None."""
    try:
        if not accessible.get_state_set().contains(Atspi.StateType.FOCUSED):
            return None
        offset = Atspi.Text.get_caret_offset(accessible)
        if offset < 0:
            return None
        screen = Atspi.CoordType.SCREEN
        rect = Atspi.Text.get_character_extents(accessible, offset, screen)
        if not usable(rect) and offset > 0:
            # At the end of the text there is no character under the caret:
            # use the right edge of the previous one.
            rect = Atspi.Text.get_character_extents(accessible, offset - 1, screen)
            rect.x += rect.width
            rect.width = 0
        if not usable(rect):
            # Some toolkits report no character extents: use the widget's
            # top-left corner with a typical line height.
            rect = accessible.get_extents(screen)
            if not usable(rect):
                return None
            rect.height = min(rect.height, 24)
            rect.width = 0
        return (accessible.get_process_id(), rect.x, rect.y, rect.width, rect.height)
    except GLib.Error:
        return None


def reply(line):
    try:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()
    except BrokenPipeError:
        loop.quit()


def on_stdin(fd, condition):
    # Read the raw fd: Python's buffered stdin would hide queued lines from
    # the GLib watch.
    data = os.read(fd, 4096) if condition & GLib.IOCondition.IN else b""
    if not data:
        loop.quit()
        return GLib.SOURCE_REMOVE
    for line in data.decode(errors="ignore").splitlines():
        if line.strip() == "q":
            rect = caret_rect(focused) if focused is not None else None
            reply("caret %d %d %d %d %d" % rect if rect else "none")
    return GLib.SOURCE_CONTINUE


if __name__ == "__main__":
    Atspi.init()
    listener = Atspi.EventListener.new(on_event)
    listener.register("object:text-caret-moved")
    listener.register("object:state-changed:focused")

    loop = GLib.MainLoop()
    GLib.io_add_watch(
        sys.stdin.fileno(),
        GLib.PRIORITY_DEFAULT,
        GLib.IOCondition.IN | GLib.IOCondition.HUP | GLib.IOCondition.ERR,
        on_stdin,
    )
    loop.run()
