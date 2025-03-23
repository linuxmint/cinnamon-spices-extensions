#!/usr/bin/python3

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, GLib

UUID = "CinnamonBurnMyWindows@klangman"
extensions_path  = GLib.get_home_dir() + "/.local/share/cinnamon/extensions/"

class TestWindow(Gtk.Window):
    def __init__(self):
        super().__init__(title="Burn-My-Windows Preview Window")

        self.box = Gtk.Box(spacing=10,orientation=Gtk.Orientation.VERTICAL,margin_start=50, margin_end=70, margin_top=70, margin_left=50, margin_right=50)
        self.button = Gtk.Button(label="Close")
        self.label = Gtk.Label.new("Close this Window to Preview the Effect!");
        self.image = Gtk.Image.new_from_file(extensions_path + UUID + "/icons/cinnamon-burn-my-window.png")
        self.button.connect("clicked", self.on_button_clicked)
        self.box.add(self.image)
        self.box.add(self.label)
        self.box.add(self.button)
        self.add(self.box)

    def on_button_clicked(self, widget):
        Gtk.main_quit();


win = TestWindow()
win.connect("destroy", Gtk.main_quit)
win.set_default_size(650, 550)
win.show_all()
Gtk.main()