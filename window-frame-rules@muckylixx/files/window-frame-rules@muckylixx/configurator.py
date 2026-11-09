#!/usr/bin/env python3
import json
import shutil
from pathlib import Path
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk

APP_NAME = "Window Frame Rules"
CONFIG_DIR = Path.home() / ".config" / "window-frame-rules"
CONFIG_FILE = CONFIG_DIR / "config.json"
DEFAULT_FILE = Path(__file__).resolve().parent / "default-config.json"


def load_config():
    source = CONFIG_FILE if CONFIG_FILE.exists() else DEFAULT_FILE
    return json.loads(source.read_text(encoding="utf-8"))


def color_button(value):
    button = Gtk.ColorButton()
    rgba = button.get_rgba()
    rgba.parse(value or "#00DDFF")
    button.set_rgba(rgba)
    button.set_use_alpha(False)
    return button


def color_hex(button):
    c = button.get_rgba()
    return "#{:02X}{:02X}{:02X}".format(round(c.red*255), round(c.green*255), round(c.blue*255))


class RuleEditor(Gtk.Frame):
    def __init__(self, rule, remove_callback):
        super().__init__()
        self.set_shadow_type(Gtk.ShadowType.IN)
        self.remove_callback = remove_callback
        grid = Gtk.Grid(column_spacing=10, row_spacing=7, margin=10)
        self.add(grid)

        self.enabled = Gtk.Switch(active=rule.get("enabled", True))
        self.name = Gtk.Entry(text=rule.get("name", "New rule"))
        self.priority = Gtk.SpinButton.new_with_range(-9999, 9999, 10)
        self.priority.set_value(rule.get("priority", 0))
        self.title = Gtk.Entry(text=rule.get("title_contains", ""))
        self.wmclass = Gtk.Entry(text=rule.get("class_contains", ""))
        self.instance = Gtk.Entry(text=rule.get("instance_contains", ""))
        self.active = color_button(rule.get("active_color", "#00DDFF"))
        self.inactive = color_button(rule.get("inactive_color", "#145363"))
        self.width = Gtk.SpinButton.new_with_range(0, 40, 1)
        self.width.set_value(rule.get("frame_width") or 0)
        self.radius = Gtk.SpinButton.new_with_range(-1, 80, 1)
        self.radius.set_value(rule.get("corner_radius") if rule.get("corner_radius") is not None else -1)
        self.types = Gtk.Entry(text=",".join(rule.get("window_types", [])))
        self.types.set_placeholder_text("normal,dialog,modal_dialog,utility — empty = all")

        fields = [
            ("Enabled", self.enabled), ("Name", self.name), ("Priority", self.priority),
            ("Title contains", self.title), ("Window class contains", self.wmclass),
            ("Instance contains", self.instance), ("Window types", self.types),
            ("Active color", self.active), ("Inactive color", self.inactive),
            ("Frame width (0 = global)", self.width), ("Corner radius (-1 = global)", self.radius)
        ]
        for row, (label, widget) in enumerate(fields):
            lab = Gtk.Label(label=label, xalign=0)
            grid.attach(lab, 0, row, 1, 1)
            grid.attach(widget, 1, row, 1, 1)

        remove = Gtk.Button(label="Remove rule")
        remove.connect("clicked", lambda _b: self.remove_callback(self))
        grid.attach(remove, 1, len(fields), 1, 1)

    def data(self):
        types = [x.strip().lower() for x in self.types.get_text().split(",") if x.strip()]
        result = {
            "name": self.name.get_text().strip() or "Unnamed rule",
            "enabled": self.enabled.get_active(),
            "priority": int(self.priority.get_value()),
            "title_contains": self.title.get_text(),
            "class_contains": self.wmclass.get_text(),
            "instance_contains": self.instance.get_text(),
            "window_types": types,
            "active_color": color_hex(self.active),
            "inactive_color": color_hex(self.inactive)
        }
        width = int(self.width.get_value())
        radius = int(self.radius.get_value())
        if width > 0: result["frame_width"] = width
        if radius >= 0: result["corner_radius"] = radius
        return result


class App(Gtk.Window):
    def __init__(self):
        super().__init__(title=APP_NAME)
        self.set_default_size(760, 820)
        self.connect("destroy", Gtk.main_quit)
        self.config = load_config()
        self.rule_editors = []

        outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8, margin=10)
        self.add(outer)
        notebook = Gtk.Notebook()
        outer.pack_start(notebook, True, True, 0)

        general_scroll = Gtk.ScrolledWindow()
        general_grid = Gtk.Grid(column_spacing=12, row_spacing=8, margin=14)
        general_scroll.add(general_grid)
        notebook.append_page(general_scroll, Gtk.Label(label="General"))

        g = self.config.get("general", {})
        self.general = {}
        specs = [
            ("frame_width", "Frame width", 1, 40, 1),
            ("corner_radius", "Corner radius", 0, 80, 1),
            ("offset_left", "Offset left", -50, 50, 1),
            ("offset_right", "Offset right", -50, 50, 1),
            ("offset_top", "Offset top", -50, 50, 1),
            ("offset_bottom", "Offset bottom", -50, 50, 1),
            ("active_opacity", "Active opacity (%)", 0, 100, 1),
            ("inactive_opacity", "Inactive opacity (%)", 0, 100, 1),
            ("glow_radius", "Glow radius", 0, 50, 1)
        ]
        for row, (key, label, minimum, maximum, step) in enumerate(specs):
            w = Gtk.SpinButton.new_with_range(minimum, maximum, step)
            w.set_value(g.get(key, 0))
            self.general[key] = w
            general_grid.attach(Gtk.Label(label=label, xalign=0), 0, row, 1, 1)
            general_grid.attach(w, 1, row, 1, 1)

        for key, label in [("glow_enabled","Glow enabled"),("include_maximized","Include maximized windows"),("include_fullscreen","Include fullscreen windows"),("debug","Debug logging")]:
            row = len(self.general)
            w = Gtk.Switch(active=g.get(key, False))
            self.general[key] = w
            general_grid.attach(Gtk.Label(label=label, xalign=0), 0, row, 1, 1)
            general_grid.attach(w, 1, row, 1, 1)

        fallback = self.config.get("fallback", {})
        self.fallback_enabled = Gtk.Switch(active=fallback.get("enabled", False))
        self.fallback_active = color_button(fallback.get("active_color", "#FFE65C"))
        self.fallback_inactive = color_button(fallback.get("inactive_color", "#5E5726"))
        base = 20
        for i,(label,w) in enumerate([("Frame unmatched windows",self.fallback_enabled),("Fallback active color",self.fallback_active),("Fallback inactive color",self.fallback_inactive)]):
            general_grid.attach(Gtk.Label(label=label, xalign=0),0,base+i,1,1)
            general_grid.attach(w,1,base+i,1,1)

        rules_outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8, margin=8)
        rules_scroll = Gtk.ScrolledWindow()
        self.rules_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin=6)
        rules_scroll.add(self.rules_box)
        rules_outer.pack_start(rules_scroll, True, True, 0)
        add = Gtk.Button(label="Add rule")
        add.connect("clicked", lambda _b: self.add_rule({"name":"New rule","enabled":True,"priority":0,"active_color":"#00DDFF","inactive_color":"#145363"}))
        rules_outer.pack_start(add, False, False, 0)
        notebook.append_page(rules_outer, Gtk.Label(label="Rules"))

        for rule in self.config.get("rules", []): self.add_rule(rule)

        buttons = Gtk.ButtonBox(layout_style=Gtk.ButtonBoxStyle.END, spacing=8)
        reset = Gtk.Button(label="Reset defaults")
        save = Gtk.Button(label="Save")
        close = Gtk.Button(label="Close")
        reset.connect("clicked", self.reset_defaults)
        save.connect("clicked", self.save)
        close.connect("clicked", lambda _b: self.destroy())
        buttons.add(reset); buttons.add(save); buttons.add(close)
        outer.pack_start(buttons, False, False, 0)
        self.show_all()

    def add_rule(self, rule):
        editor = RuleEditor(rule, self.remove_rule)
        self.rule_editors.append(editor)
        self.rules_box.pack_start(editor, False, False, 0)
        editor.show_all()

    def remove_rule(self, editor):
        self.rule_editors.remove(editor)
        self.rules_box.remove(editor)

    def collect(self):
        g = {}
        for key, widget in self.general.items():
            g[key] = widget.get_active() if isinstance(widget, Gtk.Switch) else int(widget.get_value())
        return {
            "general": g,
            "fallback": {
                "enabled": self.fallback_enabled.get_active(),
                "active_color": color_hex(self.fallback_active),
                "inactive_color": color_hex(self.fallback_inactive)
            },
            "rules": [editor.data() for editor in self.rule_editors]
        }

    def save(self, _button):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        if CONFIG_FILE.exists():
            shutil.copy2(CONFIG_FILE, CONFIG_FILE.with_suffix(".json.bak"))
        CONFIG_FILE.write_text(json.dumps(self.collect(), indent=4) + "\n", encoding="utf-8")
        dialog = Gtk.MessageDialog(self, 0, Gtk.MessageType.INFO, Gtk.ButtonsType.OK, "Configuration saved")
        dialog.format_secondary_text("Open windows update automatically.")
        dialog.run(); dialog.destroy()

    def reset_defaults(self, _button):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(DEFAULT_FILE, CONFIG_FILE)
        dialog = Gtk.MessageDialog(self, 0, Gtk.MessageType.INFO, Gtk.ButtonsType.OK, "Defaults restored")
        dialog.format_secondary_text("Close and reopen the configurator to edit the restored values.")
        dialog.run(); dialog.destroy()


if __name__ == "__main__":
    App()
    Gtk.main()
