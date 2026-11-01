#!/usr/bin/python3
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk

import JsonSettingsWidgets
from JsonSettingsWidgets import SettingsWidget

class MonitorSelector(SettingsWidget):
    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)
        self.key = key
        self.settings = settings
        self.info = info

        hbox = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)

        self.label = Gtk.Label(label=info.get("description", "Monitor:"))
        self.label.set_alignment(0.0, 0.5)

        self.combo = Gtk.ComboBoxText()

        try:
            display = Gdk.Display.get_default()
            n_monitors = display.get_n_monitors()
            for i in range(n_monitors):
                monitor = display.get_monitor(i)
                model = monitor.get_model() if monitor else None
                label_text = f"{model} ({i})" if model else f"Display {i}"
                self.combo.append(str(i), label_text)
        except Exception as e:
            print(f"[Dock Settings] Error reading monitors: {e}")
            for i in range(4):
                self.combo.append(str(i), f"Display {i}")

        try:
            current_val = self.settings.get_value(self.key)
            if current_val is None:
                current_val = 0
        except Exception:
            current_val = 0
            
        self.combo.set_active_id(str(current_val))
        self.combo.connect("changed", self.on_changed)

        hbox.pack_start(self.label, False, False, 0)
        hbox.pack_end(self.combo, False, False, 0)

        self.pack_start(hbox, True, True, 0)
        
        if "tooltip" in info:
            self.set_tooltip_text(info["tooltip"])

    def on_changed(self, widget):
        val = self.combo.get_active_id()
        if val is not None:
            try:
                self.settings.set_value(self.key, int(val))
            except Exception as e:
                print(f"[Dock Settings] Error saving setting: {e}")
