#!/usr/bin/python3

import random
from JsonSettingsWidgets import *
from gi.repository import Gio, Gtk

class TwoCheckButtonsTitleWidget(SettingsWidget):
    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)
        self.key = key
        self.settings = settings
        self.info = info

        self.descLabel = Gtk.Label('', halign=Gtk.Align.START)
        self.descLabel.set_markup('<b>' + _(info['description']) + '</b>');

        self.label1 = Gtk.Label('', halign=Gtk.Align.END)
        self.label1.set_markup('<b>' + _(info['titleB']) + '</b>');

        self.label2 = Gtk.Label('', halign=Gtk.Align.END)
        self.label2.set_markup('<b>' + _(info['titleA']) + '</b>');

        self.pack_start(self.descLabel, True, True, 0)
        self.pack_end(self.label1, False, False, 10)
        self.pack_end(self.label2, False, False, 10)


class TwoCheckButtonsWidget(SettingsWidget):
    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)
        self.key = key
        self.settings = settings
        self.info = info

        self.pack_start(Gtk.Label(_(info['description']), halign=Gtk.Align.START), True, True, 0)
        self.chkBtn1 = Gtk.CheckButton()
        self.chkBtn1.set_margin_start(17)
        self.chkBtn2 = Gtk.CheckButton()
        self.chkBtn2.set_margin_start(17)
        self.settings.bind(info['close'], self.chkBtn1, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.settings.bind(info['open'], self.chkBtn2, 'active', Gio.SettingsBindFlags.DEFAULT)
        self.pack_end(self.chkBtn1, False, False, 10)
        self.pack_end(self.chkBtn2, False, False, 10)
