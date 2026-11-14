#!/usr/bin/python3

# Custom widgets for the Desktop Cube Reloaded settings dialog.
#
# The About, LabelWithTooltip and CompactScale widgets are taken from the BlurCinnamon
# extension; keep the copies in sync. CompactScale has two small changes here: it doesn't
# apply BlurCinnamon's dependency patch, and it takes an optional "digits" key.

import gettext
import math

from xapp.SettingsWidgets import SettingsWidget
from gi.repository import Gio, Gtk, GdkPixbuf, GLib, Pango

UUID = "Desktop-Cube-Reloaded@klangman"
gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale")


def _(text):
   return gettext.dgettext(UUID, text)


# A label that supports markup, with an optional tooltip (which also supports markup)
class LabelWithTooltip(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"])

      self.label.set_alignment(0.0, 0.5)
      self.label.set_line_wrap(True)
      self.pack_start(self.label, True, True, 0)
      if "tooltip" in info:
         self.label.set_tooltip_markup(info["tooltip"])


# An About page widget with an image and a centered label that supports markup. The text
# "ext-version" in the description is replaced by the extension's version, which the
# extension stores in the "ext-version" setting when it is enabled.
class About(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      extensions_path = GLib.get_user_data_dir() + "/cinnamon/extensions/"

      self.box = Gtk.Box(spacing=10, orientation=Gtk.Orientation.VERTICAL, margin_start=20,
                         margin_end=20, margin_top=20, margin_left=20, margin_right=20)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"].replace("ext-version",
                                                        settings.get_value("ext-version")))
      try:
         pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(extensions_path + UUID + info["icon"],
                                                          width=192, height=192,
                                                          preserve_aspect_ratio=True)
         self.image = Gtk.Image.new_from_pixbuf(pixbuf)
         self.box.add(self.image)
      except GLib.Error as error:
         print(f"{UUID}: could not load the About icon: {error.message}")
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
        digits = info.get("digits", 1)   # Desktop Cube Reloaded: number of decimals shown

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
        self.content_widget.set_digits(self.digits)
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


# ---------------------------------------------------------------------------- hot corners
#
# Cinnamon keeps its hot corners in org.cinnamon "hotcorner-layout": four strings (top
# left, top right, bottom left, bottom right) of the form "action:enabled:delay", where
# action is expo, scale, desktop or a command (which may itself contain ':'). The cube
# actions are commands the extension intercepts (see HOT_CORNER_ACTIONS in extension.js).
#
# Each corner gets a HotCornerChooser. Picking a cube action for a corner that Cinnamon
# uses for something else first saves that corner's entry in the widget's own setting;
# the first item of the dropdown then names the saved action and puts it back exactly
# (action, on/off and delay). If the corner is changed in System Settings -> Hot Corners
# to something that isn't a cube action, the saved entry is dropped.

HOT_CORNER_SCHEMA = "org.cinnamon"
HOT_CORNER_LAYOUT_KEY = "hotcorner-layout"
CUBE_CORNER_ACTIONS = [
   ("cube-free-rotate", _("Cube: rotate with the mouse")),
   ("cube-rotate-left", _("Cube: rotate left")),
   ("cube-rotate-right", _("Cube: rotate right")),
]
CUBE_CORNER_IDS = [action for action, label in CUBE_CORNER_ACTIONS]
# Hover delay (ms) used when a corner without one gets a cube action. It helps against
# triggering the cube by accident.
DEFAULT_CUBE_CORNER_DELAY = 250


def _parse_corner(entry):
   parts = entry.rsplit(":", 2)   # the action (a command) may contain ':'
   if len(parts) != 3:
      return entry, False, 0
   action, enabled, delay = parts
   try:
      delay = int(delay)
   except ValueError:
      delay = 0
   return action, enabled == "true", delay


def _is_cube_corner(entry):
   action, enabled, delay = _parse_corner(entry)
   return enabled and action in CUBE_CORNER_IDS


def _describe_corner(entry):
   action, enabled, delay = _parse_corner(entry)
   if not enabled:
      return _("Off")
   names = {
      "expo": _("Show all workspaces (Expo)"),
      "scale": _("Show all windows (Scale)"),
      "desktop": _("Show the desktop"),
   }
   return names.get(action, _("Run: %s") % action)


class HotCornerChooser(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.corner = info["corner"]
      self.updating = False

      self.cinnamon = Gio.Settings.new(HOT_CORNER_SCHEMA)

      self.label = Gtk.Label.new(info["description"])
      self.label.set_alignment(0.0, 0.5)
      self.pack_start(self.label, True, True, 0)

      self.model = Gtk.ListStore(str, str)   # cube action ('' = the other entry), label
      self.combo = Gtk.ComboBox.new_with_model(self.model)
      renderer = Gtk.CellRendererText()
      renderer.set_property("ellipsize", Pango.EllipsizeMode.END)
      renderer.set_property("max-width-chars", 32)
      self.combo.pack_start(renderer, True)
      self.combo.add_attribute(renderer, "text", 1)
      self.pack_end(self.combo, False, False, 0)

      if "tooltip" in info:
         self.label.set_tooltip_markup(info["tooltip"])
         self.combo.set_tooltip_markup(info["tooltip"])

      self.combo.connect("changed", self.on_combo_changed)
      self.layout_changed_id = self.cinnamon.connect("changed::" + HOT_CORNER_LAYOUT_KEY,
                                                     self.on_layout_changed)
      self.connect("destroy", self.on_destroy)
      self.refresh()

   def on_destroy(self, *args):
      if self.layout_changed_id:
         self.cinnamon.disconnect(self.layout_changed_id)
         self.layout_changed_id = 0

   def get_layout(self):
      layout = list(self.cinnamon.get_strv(HOT_CORNER_LAYOUT_KEY))
      return layout if len(layout) == 4 else None

   def get_saved(self):
      return self.settings.get_value(self.key) or ""

   # The entry Cinnamon ships for this corner (always disabled).
   def default_entry(self):
      default = self.cinnamon.get_default_value(HOT_CORNER_LAYOUT_KEY)
      entries = default.unpack() if default else []
      return entries[self.corner] if len(entries) == 4 else "expo:false:0"

   def on_layout_changed(self, *args):
      self.refresh()

   def refresh(self):
      layout = self.get_layout()
      if layout is None:
         self.set_sensitive(False)
         return
      self.set_sensitive(True)
      current = layout[self.corner]
      saved = self.get_saved()

      if _is_cube_corner(current):
         action = _parse_corner(current)[0]
         active = 1 + CUBE_CORNER_IDS.index(action)
         other = _describe_corner(saved) if saved else _("Off")
      else:
         # Not a cube corner (any more): whatever Cinnamon has there is the "other" entry.
         if saved:
            self.settings.set_value(self.key, "")
         active = 0
         other = _describe_corner(current)

      self.updating = True
      self.model.clear()
      self.model.append(["", other])
      for action, label in CUBE_CORNER_ACTIONS:
         self.model.append([action, label])
      self.combo.set_active(active)
      self.updating = False

   def on_combo_changed(self, combo):
      if self.updating:
         return
      it = combo.get_active_iter()
      layout = self.get_layout()
      if it is None or layout is None:
         return
      choice = self.model[it][0]
      current = layout[self.corner]
      is_cube = _is_cube_corner(current)

      if choice:
         if not is_cube:
            # Remember what Cinnamon had here, so it can be put back.
            self.settings.set_value(self.key, current)
         delay = _parse_corner(current)[2]
         if delay <= 0:
            delay = DEFAULT_CUBE_CORNER_DELAY
         layout[self.corner] = "%s:true:%d" % (choice, delay)
      else:
         if not is_cube:
            return
         saved = self.get_saved()
         layout[self.corner] = saved if saved else self.default_entry()
         self.settings.set_value(self.key, "")

      self.cinnamon.set_strv(HOT_CORNER_LAYOUT_KEY, layout)


# A row with a label and a button that opens a page of Cinnamon's System Settings. The
# "module" key is the cinnamon-settings module name (e.g. "hotcorner" or "workspaces"),
# "button" is the button's text. Runs cinnamon-settings directly, so it also works while
# the extension is disabled.
class SettingsLauncher(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.module = info["module"]

      self.label = Gtk.Label("", xalign=0.0)
      self.label.set_markup(info["description"])
      self.label.set_alignment(0.0, 0.5)
      self.label.set_line_wrap(True)
      self.pack_start(self.label, True, True, 0)

      self.button = Gtk.Button.new_with_label(info.get("button", _("Open")))
      self.button.set_valign(Gtk.Align.CENTER)
      self.button.connect("clicked", self.on_clicked)
      self.pack_end(self.button, False, False, 0)

      if "tooltip" in info:
         self.label.set_tooltip_markup(info["tooltip"])
         self.button.set_tooltip_markup(info["tooltip"])

   def on_clicked(self, *args):
      try:
         Gio.Subprocess.new(["cinnamon-settings", self.module], Gio.SubprocessFlags.NONE)
      except GLib.Error as error:
         print(f"{UUID}: could not open cinnamon-settings {self.module}: {error.message}")
