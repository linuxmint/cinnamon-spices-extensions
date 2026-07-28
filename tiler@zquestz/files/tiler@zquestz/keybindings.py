"""The keybindings legend, shown on Tiler's settings page.

A real two-column grid rather than text lined up with tabs, so the columns
stay aligned whatever language the rows are in and whatever font renders
them.
"""

import gettext
import os

from gi.repository import Gtk
from JsonSettingsWidgets import SettingsWidget

UUID = "tiler@zquestz"

# Cinnamon compiles translations into this directory on install. With
# fallback=True a missing catalogue (an English desktop, say) means plain
# English rather than an error.
LOCALE_DIR = os.path.join(os.path.expanduser("~"), ".local/share/locale")
_ = gettext.translation(UUID, LOCALE_DIR, fallback=True).gettext

# What each key means while the grid is open. Even the rows naming bare keys
# are translatable: the letters stay the letters, but the separators between
# them are typography, and typography belongs to the language.
KEYBINDINGS = [
    (_("Arrows"), _("Move the selection")),
    (_("Shift+Arrow"), _("Grow the selection")),
    (_("1-4"), _("Switch between grids")),
    (_("L / R"), _("Main Left, Main Right")),
    (_("Shift+L / R"), _("Equal Left, Equal Right")),
    (_("Enter/Space"), _("Confirm selection")),
    (_("Escape"), _("Cancel")),
]


class KeybindingsWidget(SettingsWidget):
    """The legend itself: a label pair per binding, attached column-wise."""

    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)

        grid = Gtk.Grid()
        grid.set_column_spacing(32)
        grid.set_row_spacing(6)

        for row, (key_name, action) in enumerate(KEYBINDINGS):
            grid.attach(Gtk.Label(label=key_name, halign=Gtk.Align.START), 0, row, 1, 1)
            grid.attach(Gtk.Label(label=action, halign=Gtk.Align.START), 1, row, 1, 1)

        self.pack_start(grid, True, True, 0)
