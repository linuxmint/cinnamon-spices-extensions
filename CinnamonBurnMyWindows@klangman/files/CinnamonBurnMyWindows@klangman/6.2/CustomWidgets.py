#!/usr/bin/python3

import random
from JsonSettingsWidgets import *
from gi.repository import Gio, Gtk

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

        self.cBtn1.connect('color-set', self.on_my_value_changed)
        self.cBtn2.connect('color-set', self.on_my_value_changed)
        self.cBtn3.connect('color-set', self.on_my_value_changed)
        self.cBtn4.connect('color-set', self.on_my_value_changed)
        self.cBtn5.connect('color-set', self.on_my_value_changed)

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

        self.cBtn1.connect('color-set', self.on_my_value_changed)
        self.cBtn2.connect('color-set', self.on_my_value_changed)
        self.cBtn3.connect('color-set', self.on_my_value_changed)
        self.cBtn4.connect('color-set', self.on_my_value_changed)
        self.cBtn5.connect('color-set', self.on_my_value_changed)
        self.cBtn6.connect('color-set', self.on_my_value_changed)

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
