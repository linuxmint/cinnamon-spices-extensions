#!/usr/bin/python3

import random
import math
import gi

from JsonSettingsWidgets import *
from gi.repository import Gio, Gtk, Gdk, GLib

class FireColorChooser(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info
      rgba = Gdk.RGBA()

      self.pack_start(Gtk.Label(_(info['description']), halign=Gtk.Align.START), True, True, 0)
      self.cBtn1 = Gtk.ColorButton()
      self.cBtn1.set_use_alpha(True)
      self.cBtn1.set_margin_start(2)

      self.cBtn2 = Gtk.ColorButton()
      self.cBtn2.set_use_alpha(True)
      self.cBtn2.set_margin_start(2)

      self.cBtn3 = Gtk.ColorButton()
      self.cBtn3.set_use_alpha(True)
      self.cBtn3.set_margin_start(2)

      self.cBtn4 = Gtk.ColorButton()
      self.cBtn4.set_use_alpha(True)
      self.cBtn4.set_margin_start(2)

      self.cBtn5 = Gtk.ColorButton()
      self.cBtn5.set_use_alpha(True)
      self.cBtn5.set_margin_start(2)

      self.pack_end(self.cBtn5, False, False, 2)
      self.pack_end(self.cBtn4, False, False, 2)
      self.pack_end(self.cBtn3, False, False, 2)
      self.pack_end(self.cBtn2, False, False, 2)
      self.pack_end(self.cBtn1, False, False, 2)

      rgba.parse(settings.get_value(info["color1"]))
      self.cBtn1.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color2"]))
      self.cBtn2.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color3"]))
      self.cBtn3.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color4"]))
      self.cBtn4.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color5"]))
      self.cBtn5.set_rgba(rgba);

      settings.listen(info["color1"], self.on_key_value_changed1);
      settings.listen(info["color2"], self.on_key_value_changed2);
      settings.listen(info["color3"], self.on_key_value_changed3);
      settings.listen(info["color4"], self.on_key_value_changed4);
      settings.listen(info["color5"], self.on_key_value_changed5);

      self.cBtn1.connect('color-set', self.on_my_value_changed)
      self.cBtn2.connect('color-set', self.on_my_value_changed)
      self.cBtn3.connect('color-set', self.on_my_value_changed)
      self.cBtn4.connect('color-set', self.on_my_value_changed)
      self.cBtn5.connect('color-set', self.on_my_value_changed)

   def on_key_value_changed1(self, key, value):
      color_string = self.cBtn1.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn1.set_rgba(rgba);

   def on_key_value_changed2(self, key, value):
      color_string = self.cBtn2.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn2.set_rgba(rgba);

   def on_key_value_changed3(self, key, value):
      color_string = self.cBtn3.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn3.set_rgba(rgba);

   def on_key_value_changed4(self, key, value):
      color_string = self.cBtn4.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn4.set_rgba(rgba);

   def on_key_value_changed5(self, key, value):
      color_string = self.cBtn5.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn5.set_rgba(rgba);

   def on_my_value_changed(self, widget):
      color_string = self.cBtn1.get_rgba().to_string()
      self.settings.set_value(self.info["color1"], color_string)
      color_string = self.cBtn2.get_rgba().to_string()
      self.settings.set_value(self.info["color2"], color_string)
      color_string = self.cBtn3.get_rgba().to_string()
      self.settings.set_value(self.info["color3"], color_string)
      color_string = self.cBtn4.get_rgba().to_string()
      self.settings.set_value(self.info["color4"], color_string)
      color_string = self.cBtn5.get_rgba().to_string()
      self.settings.set_value(self.info["color5"], color_string)


class MushroomColorChooser(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info
      rgba = Gdk.RGBA()

      self.pack_start(Gtk.Label(_(info['description']), halign=Gtk.Align.START), True, True, 0)
      self.cBtn1 = Gtk.ColorButton()
      self.cBtn1.set_use_alpha(True)
      self.cBtn1.set_margin_start(2)

      self.cBtn2 = Gtk.ColorButton()
      self.cBtn2.set_use_alpha(True)
      self.cBtn2.set_margin_start(2)

      self.cBtn3 = Gtk.ColorButton()
      self.cBtn3.set_use_alpha(True)
      self.cBtn3.set_margin_start(2)

      self.cBtn4 = Gtk.ColorButton()
      self.cBtn4.set_use_alpha(True)
      self.cBtn4.set_margin_start(2)

      self.cBtn5 = Gtk.ColorButton()
      self.cBtn5.set_use_alpha(True)
      self.cBtn5.set_margin_start(2)

      self.cBtn6 = Gtk.ColorButton()
      self.cBtn6.set_use_alpha(True)
      self.cBtn6.set_margin_start(2)

      self.pack_end(self.cBtn6, False, False, 2)
      self.pack_end(self.cBtn5, False, False, 2)
      self.pack_end(self.cBtn4, False, False, 2)
      self.pack_end(self.cBtn3, False, False, 2)
      self.pack_end(self.cBtn2, False, False, 2)
      self.pack_end(self.cBtn1, False, False, 2)

      rgba.parse(settings.get_value(info["color1"]))
      self.cBtn1.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color2"]))
      self.cBtn2.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color3"]))
      self.cBtn3.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color4"]))
      self.cBtn4.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color5"]))
      self.cBtn5.set_rgba(rgba);
      rgba.parse(settings.get_value(info["color6"]))
      self.cBtn6.set_rgba(rgba);

      settings.listen(info["color1"], self.on_key_value_changed1);
      settings.listen(info["color2"], self.on_key_value_changed2);
      settings.listen(info["color3"], self.on_key_value_changed3);
      settings.listen(info["color4"], self.on_key_value_changed4);
      settings.listen(info["color5"], self.on_key_value_changed5);
      settings.listen(info["color6"], self.on_key_value_changed6);

      self.cBtn1.connect('color-set', self.on_my_value_changed)
      self.cBtn2.connect('color-set', self.on_my_value_changed)
      self.cBtn3.connect('color-set', self.on_my_value_changed)
      self.cBtn4.connect('color-set', self.on_my_value_changed)
      self.cBtn5.connect('color-set', self.on_my_value_changed)
      self.cBtn6.connect('color-set', self.on_my_value_changed)

   def on_key_value_changed1(self, key, value):
      color_string = self.cBtn1.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn1.set_rgba(rgba);

   def on_key_value_changed2(self, key, value):
      color_string = self.cBtn2.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn2.set_rgba(rgba);

   def on_key_value_changed3(self, key, value):
      color_string = self.cBtn3.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn3.set_rgba(rgba);

   def on_key_value_changed4(self, key, value):
      color_string = self.cBtn4.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn4.set_rgba(rgba);

   def on_key_value_changed5(self, key, value):
      color_string = self.cBtn5.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn5.set_rgba(rgba);

   def on_key_value_changed6(self, key, value):
      color_string = self.cBtn6.get_rgba().to_string()
      if color_string != value:
         rgba = Gdk.RGBA()
         rgba.parse(value)
         self.cBtn6.set_rgba(rgba);

   def on_my_value_changed(self, widget):
      color_string = self.cBtn1.get_rgba().to_string()
      self.settings.set_value(self.info["color1"], color_string)
      color_string = self.cBtn2.get_rgba().to_string()
      self.settings.set_value(self.info["color2"], color_string)
      color_string = self.cBtn3.get_rgba().to_string()
      self.settings.set_value(self.info["color3"], color_string)
      color_string = self.cBtn4.get_rgba().to_string()
      self.settings.set_value(self.info["color4"], color_string)
      color_string = self.cBtn5.get_rgba().to_string()
      self.settings.set_value(self.info["color5"], color_string)
      color_string = self.cBtn6.get_rgba().to_string()
      self.settings.set_value(self.info["color6"], color_string)


# A reset to default widget, allows for resetting a list of settings keys back to the default
class ResetToDefault(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      self.content_widget = Gtk.Button(info["description"])
      self.pack_start(self.content_widget, True, True, 0)
      self.content_widget.connect("clicked", self._on_button_clicked)

   def _on_button_clicked(self, *args):
      for key in self.info["keys"]:
         default = self.settings.get_property(key, "default")
         self.settings.set_value(key, default);

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


# Two buttons to set / clear the "random-include" check boxes
class SetClearButtons(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      self.setBtn = Gtk.Button(info["set-button"])
      self.pack_start(self.setBtn, True, True, 0)
      self.clearBtn = Gtk.Button(info["clear-button"])
      self.pack_start(self.clearBtn, True, True, 0)

      self.setBtn.connect("clicked", self._on_set_button_clicked)
      self.clearBtn.connect("clicked", self._on_clear_button_clicked)

   def _on_set_button_clicked(self, *args):
      lst = self.settings.get_value("random-include")
      newList = []
      for element in lst:
         newList.append( {"name": element["name"], "open": True, "close": True, "minimize": True, "unminimize": True} )
      self.settings.set_value("random-include", newList)

   def _on_clear_button_clicked(self, *args):
      lst = self.settings.get_value("random-include")
      newList = []
      for element in lst:
         newList.append( {"name": element["name"], "open": False, "close": False, "minimize": False, "unminimize": False} )
      self.settings.set_value("random-include", newList)


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
