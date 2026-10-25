#!/usr/bin/python3
import subprocess
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk

class CustomRestartButton(Gtk.Bin):
    def __init__(self, info, key, settings):
        super().__init__()
        
        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        box.set_border_width(6)
        
        label = Gtk.Label(label="Riavvia Cinnamon")
        label.set_xalign(0.0)
        box.pack_start(label, True, True, 0)
        
        button = Gtk.Button(label="Riavvia Ora")
        button.connect("clicked", self.on_button_clicked)
        box.pack_end(button, False, False, 0)
        
        self.add(box)
        self.show_all()

    def on_button_clicked(self, widget):
        dialog = Gtk.MessageDialog(
            transient_for=self.get_toplevel(),
            flags=0,
            message_type=Gtk.MessageType.QUESTION,
            buttons=Gtk.ButtonsType.OK_CANCEL,
            text="Vuoi riavviare Cinnamon?"
        )
        dialog.format_secondary_text("L'interfaccia utente verrà ricaricata.")
        
        response = dialog.run()
        if response == Gtk.ResponseType.OK:
            subprocess.Popen(["cinnamon", "--replace"])
        
        dialog.destroy()
