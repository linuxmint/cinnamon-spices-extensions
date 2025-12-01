#!/usr/bin/python3

import random
import math
import gi

from JsonSettingsWidgets import *
from gi.repository import Gio, Gtk, Gdk, GLib

# An About page Widget with an image and a centered label that supports markup
class About(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      UUID = "CinnamonBurnMyWindows@klangman"
      extensions_path  = GLib.get_home_dir() + "/.local/share/cinnamon/extensions/"

      self.box = Gtk.Box(spacing=10,orientation=Gtk.Orientation.VERTICAL,margin_start=20, margin_end=20, margin_top=20, margin_left=20, margin_right=20)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"].replace("ext-version", settings.get_value("ext-version")))
      self.image = Gtk.Image.new_from_file(extensions_path + UUID + info["icon"])
      self.box.add(self.image)
      self.box.add(self.label)
      self.pack_start(self.box, True, True, 0)


# This is based on the Range class that handles the "scale" type. It's modified so that it fits on one line
# to save space at the expense of the scale widget width. This allows the Effects Settings data to fit better
# It also adds a mark to indicate where the default value is
class CompactScale(SettingsWidget):
    bind_prop = "value"
    bind_dir = Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.NO_SENSITIVITY
    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)
        self.key = key
        self.settings = settings
        self.info = info

        mini = info["min"]
        maxi = info["max"]
        step = info["step"]
        invert = False
        log = False
        show_value = True
        flipped = False
        units = ""
        digits = 1

        self.set_orientation(Gtk.Orientation.VERTICAL)
        self.set_spacing(0)

        self.log = log
        self.invert = invert
        self.flipped = flipped
        self.timer = None
        self.value = info["value"]
        self.digits = digits
        self.units = units

        hbox = Gtk.Box()

        self.label = Gtk.Label.new(info["description"])
        self.label.set_halign(Gtk.Align.CENTER)

        if log:
            mini = math.log(mini)
            maxi = math.log(maxi)
            if self.flipped:
                self.map_get = lambda x: -1 * (math.log(x))
                self.map_set = lambda x: math.exp(x)
            else:
                self.map_get = lambda x: math.log(x)
                self.map_set = lambda x: math.exp(x)
        elif self.flipped:
            self.map_get = lambda x: x * -1
            self.map_set = lambda x: x * -1

        if self.flipped:
            tmp_mini = mini
            mini = maxi * -1
            maxi = tmp_mini * -1

        if step is None:
            self.step = (maxi - mini) * 0.02
        else:
            self.step = math.log(step) if log else step

        self.content_widget = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, mini, maxi, self.step)
        self.content_widget.set_inverted(invert)
        self.content_widget.set_draw_value(show_value and not self.flipped)
        self.content_widget.set_value_pos(Gtk.PositionType.RIGHT)
        self.content_widget.add_mark(info["default"], Gtk.PositionType.TOP, None); # mini+((maxi-mini)/2)
        self.content_widget.set_value(self.value)
        self.bind_object = self.content_widget.get_adjustment()

        if self.units != "":
            def format_value(scale, value, data=None):
                return "{0:0.{prec}f}{1}".format(value, self.units, prec=self.digits)

            self.content_widget.connect("format-value", format_value)

        if invert:
            self.step *= -1 # Gtk.Scale.new_with_range want a positive value, but our custom scroll handler wants a negative value

        hbox.pack_start(self.label, False, False, 0)
        hbox.pack_start(self.content_widget, True, True, 10)

        self.pack_start(hbox, True, True, 6)

        self.content_widget.connect("scroll-event", self.on_scroll_event)
        self.content_widget.connect("value-changed", self.apply_later)

        if (not log) and self.step % 1 == 0:
            self.content_widget.connect("change-value", self.round_value_to_step)

        settings.listen(key, self.on_key_value_changed);

        if "tooltip" in info:
           self.label.set_tooltip_text(info["tooltip"])
           self.content_widget.set_tooltip_text(info["tooltip"])

    def on_key_value_changed(self, key, value):
        if self.content_widget.get_value() != value:
           self.content_widget.set_value(value);

    def round_value_to_step(self, widget, scroll, value, data=None):
        if value % self.step != 0:
            widget.set_value(round(value / self.step) * self.step)
            return True
        return False

    def apply_later(self, *args):
        def apply(self):
            if self.log:
                self.content_widget.set_value(math.exp(abs(self.content_widget.get_value())))
            else:
                if self.flipped:
                    self.content_widget.set_value(self.content_widget.get_value() * -1)
                else:
                    self.content_widget.set_value(self.content_widget.get_value())
            self.settings.set_value(self.key, self.content_widget.get_value())
            self.timer = None

        if self.timer:
            GLib.source_remove(self.timer)
        self.timer = GLib.timeout_add(300, apply, self)

    def on_scroll_event(self, widget, event):
        found, delta_x, delta_y = event.get_scroll_deltas()

        # If you scroll up, delta_y < 0. This is a weird world
        widget.set_value(widget.get_value() - delta_y * self.step)

        return True

    def add_mark(self, value, position, markup):
        if self.log:
            self.content_widget.add_mark(math.log(value), position, markup)
        else:
            self.content_widget.add_mark(value, position, markup)

    def set_rounding(self, digits):
        if not self.log:
            self.digits = digits
            self.content_widget.set_round_digits(digits)
            self.content_widget.set_digits(digits)
