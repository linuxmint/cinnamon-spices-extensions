#!/usr/bin/python3

import random
import math
import gi
import re

import sys
import operator
from xapp.SettingsWidgets import SettingsWidget, SettingsLabel
from gi.repository import Gio, Gtk, Gdk, GdkPixbuf, GLib, Pango
import gettext

UUID = "BlurCinnamon@klangman"
gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale")

def _(text):
   return gettext.dgettext(UUID, text)


# ------------------------------------------------------------------------------------------------
# Colour columns for the "list" settings widget
#
# Cinnamon's list widget (TreeListWidgets.List) has no colour column type, so colours would have
# to be typed in as text. This monkey patches the list so that a column with a "color-chooser"
# property in settings-schema.json gets:
#   * a colour swatch in the list, which opens a colour chooser when clicked
#   * a colour button in the list's add/edit dialog
#
#   "color-chooser": true                the column always holds a colour, alpha included
#   "color-chooser": "optional"          the column may also be empty (shown as "Default")
#   "color-chooser": "opaque"            no alpha, always saved as "rgb(r,g,b)" (for columns where
#                                        the extension takes the opacity from somewhere else)
#   "color-chooser": "optional,opaque"   both
#
# Such columns keep "type": "string" in the schema, so if this patch can't be applied (a future
# Cinnamon changes the list widget) the column simply falls back to the stock text entry. The
# stored value is a "rgb(r,g,b)" / "rgba(r,g,b,a)" string either way, so the extension doesn't
# care which UI produced it.
#
# The patch is applied when this module is imported, which xlet-settings does when it builds the
# first "custom" widget. That must happen before the first list using "color-chooser" is built,
# so keep a custom widget ahead of those lists in the layout.
#
# This block is shared by the RoundedCorners and BlurCinnamon extensions, keep the copies in sync.
# ------------------------------------------------------------------------------------------------

FALLBACK_COLOR = "rgba(0,0,0,0.3)"
RESPONSE_USE_DEFAULT = 1

def _loaded_modules(*names):
   # Cinnamon 6.6 and older import their settings modules by bare name ("TreeListWidgets"), newer
   # versions as part of the "bin" package ("bin.TreeListWidgets"). Importing the name Cinnamon
   # didn't use would load a second, unused copy of the module, so only take what's already loaded.
   modules = []
   for name in names:
      module = sys.modules.get(name)
      if module is not None and module not in modules:
         modules.append(module)
   return modules

def _parse_color(value, opaque=False):
   if isinstance(value, str) and value.strip():
      rgba = Gdk.RGBA()
      if rgba.parse(value.strip()):
         if opaque:
            rgba.alpha = 1.0
         return rgba
   return None

def _color_string(rgba, opaque=False):
   if opaque:
      rgba = Gdk.RGBA(red=rgba.red, green=rgba.green, blue=rgba.blue, alpha=1.0)
   return rgba.to_string()   # "rgb(r,g,b)" when the alpha is 1, otherwise "rgba(r,g,b,a)"

def _color_column_flags(value):
   # The "color-chooser" property -> (optional, opaque), or None for a normal column
   if value is True:
      return (False, False)
   if isinstance(value, str) and value.strip():
      tokens = {token.strip() for token in value.split(",")}
      return ("optional" in tokens, "opaque" in tokens)
   return None

def _color_type_name(optional, opaque):
   return ("optional-" if optional else "") + ("opaque-" if opaque else "") + "color"

_swatch_cache = {}

def _swatch_pixbuf(rgba, width=36, height=16):
   # A colour swatch drawn over a checkerboard (so the alpha is visible) with a grey outline that
   # shows up on both light and dark themes. Built from raw bytes so no cairo binding is needed.
   key = (rgba.to_string(), width, height)
   pixbuf = _swatch_cache.get(key)
   if pixbuf is None:
      data = bytearray(width * height * 4)
      a = rgba.alpha
      for y in range(height):
         for x in range(width):
            i = (y * width + x) * 4
            if x == 0 or y == 0 or x == width - 1 or y == height - 1:
               data[i:i+4] = bytes((0x80, 0x80, 0x80, 0xff))
            else:
               check = 0xc8 if ((x // 4) + (y // 4)) % 2 else 0xff
               data[i]   = round(rgba.red   * 255 * a + check * (1 - a))
               data[i+1] = round(rgba.green * 255 * a + check * (1 - a))
               data[i+2] = round(rgba.blue  * 255 * a + check * (1 - a))
               data[i+3] = 0xff
      pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(bytes(data)), GdkPixbuf.Colorspace.RGB,
                                               True, 8, width, height, width * 4)
      _swatch_cache[key] = pixbuf
   return pixbuf


# The widget used for colour columns in the list's add/edit dialog. TreeListWidgets.list_edit_factory()
# wraps it in a class that keeps the value in memory (set_value/get_value) instead of in a setting.
# The optional/opaque variants are generated below as subclasses.
class ListColorChooser(SettingsWidget):
   bind_dir = None
   optional = False
   opaque = False

   def __init__(self, label, size_group=None, dep_key=None, tooltip=""):
      super(ListColorChooser, self).__init__(dep_key=dep_key)
      self.updating = False

      self.label = SettingsLabel(label)
      self.content_widget = Gtk.ColorButton()
      self.content_widget.set_use_alpha(not self.opaque)
      self.content_widget.set_rgba(_parse_color(FALLBACK_COLOR, self.opaque))
      self.pack_start(self.label, False, False, 0)
      self.pack_end(self.content_widget, False, False, 0)

      if self.optional:
         # Off = empty value, i.e. use the default colour. The colour button keeps its colour so
         # turning the switch back on restores it.
         self.custom_switch = Gtk.Switch(valign=Gtk.Align.CENTER)
         self.custom_switch.set_tooltip_text(_("When off, the default colour is used"))
         self.pack_end(self.custom_switch, False, False, 0)

      self.set_tooltip_text(tooltip)
      if size_group:
         self.add_to_size_group(size_group)

   def on_setting_changed(self, *args):
      rgba = _parse_color(self.get_value(), self.opaque)
      self.updating = True
      if rgba is not None:
         self.content_widget.set_rgba(rgba)
      if self.optional:
         self.custom_switch.set_active(rgba is not None)
         self.content_widget.set_sensitive(rgba is not None)
      self.updating = False
      if rgba is None and not self.optional:
         # A missing/invalid colour becomes whatever the button shows, so OK always saves a colour
         self.set_value(_color_string(self.content_widget.get_rgba(), self.opaque))

   def connect_widget_handlers(self, *args):
      self.content_widget.connect("color-set", self.on_my_value_changed)
      if self.optional:
         self.custom_switch.connect("notify::active", self.on_my_value_changed)

   def on_my_value_changed(self, *args):
      if self.updating:
         return
      custom = not self.optional or self.custom_switch.get_active()
      self.content_widget.set_sensitive(custom)
      self.set_value(_color_string(self.content_widget.get_rgba(), self.opaque) if custom else "")

COLOR_CHOOSER_CLASSES = {}
for _optional in (False, True):
   for _opaque in (False, True):
      _name = _color_type_name(_optional, _opaque)
      COLOR_CHOOSER_CLASSES[_name] = type("ListColorChooser_" + _name.replace("-", "_"), (ListColorChooser,),
                                          {"optional": _optional, "opaque": _opaque})


def _render_swatch(column, cell, model, row_iter, data):
   index, opaque = data
   rgba = _parse_color(model[row_iter][index], opaque)
   cell.set_property("pixbuf", _swatch_pixbuf(rgba) if rgba is not None else None)
   cell.set_property("visible", rgba is not None)

def _render_swatch_text(column, cell, model, row_iter, data):
   index, opaque = data
   value = model[row_iter][index]
   if _parse_color(value) is not None:
      cell.set_property("text", "")
      cell.set_property("visible", False)
   else:
      # Empty means "use the default colour". Anything else is a string that doesn't parse (typed in
      # before this patch existed), so show it as is rather than hiding it.
      empty = not (isinstance(value, str) and value.strip())
      cell.set_property("text", _("Default") if empty else value)
      cell.set_property("style", Pango.Style.ITALIC if empty else Pango.Style.NORMAL)
      cell.set_property("visible", True)

def _on_list_button_press(treeview, event, list_widget):
   if event.type != Gdk.EventType.BUTTON_PRESS or event.button != 1:
      return False
   if event.window != treeview.get_bin_window():   # e.g. a click on the column headers
      return False
   if "edit" in getattr(list_widget, "hidden_buttons", []):   # the list doesn't allow editing
      return False
   hit = treeview.get_path_at_pos(int(event.x), int(event.y))
   if hit is None:
      return False
   path, column = hit[0], hit[1]
   index = treeview.get_columns().index(column)
   if index not in list_widget.color_columns:
      return False
   treeview.get_selection().select_path(path)
   row_ref = Gtk.TreeRowReference.new(list_widget.model, path)
   GLib.idle_add(_choose_list_color, list_widget, row_ref, index, column.get_title())
   return True

def _choose_list_color(list_widget, row_ref, index, title):
   if not row_ref.valid():
      return False
   optional, opaque, default = list_widget.color_columns[index]
   model = list_widget.model
   current = _parse_color(model[row_ref.get_path()][index], opaque)

   toplevel = list_widget.get_toplevel()
   dialog = Gtk.ColorChooserDialog(title=title, modal=True,
                                   transient_for=toplevel if isinstance(toplevel, Gtk.Window) else None)
   dialog.set_use_alpha(not opaque)
   dialog.set_rgba(current or _parse_color(default, opaque) or _parse_color(FALLBACK_COLOR, opaque))
   if optional:
      dialog.add_button(_("Use Default"), RESPONSE_USE_DEFAULT)
   response = dialog.run()
   rgba = dialog.get_rgba()
   dialog.destroy()

   if response == Gtk.ResponseType.OK:
      value = _color_string(rgba, opaque)
   elif response == RESPONSE_USE_DEFAULT:
      value = ""
   else:
      return False
   if row_ref.valid() and model[row_ref.get_path()][index] != value:
      model[row_ref.get_path()][index] = value
      list_widget.list_changed()
   return False

def _patch_list_widget():
   modules = _loaded_modules("bin.TreeListWidgets", "TreeListWidgets")
   if not modules:
      print(f"{UUID}: TreeListWidgets is not loaded, list colour columns will be text entries")
   for module in modules:
      List = module.List
      if getattr(List, "color_columns_patched", False):
         continue
      try:
         for name, widget_class in COLOR_CHOOSER_CLASSES.items():
            module.VARIABLE_TYPE_MAP.setdefault(name, str)
            module.CLASS_TYPE_MAP.setdefault(name, widget_class)
      except AttributeError:
         print(f"{UUID}: unexpected TreeListWidgets layout, list colour columns will be text entries")
         continue

      def patched_init(self, *args, _original_init=List.__init__, **kwargs):
         # List.__init__(self, label=None, columns=None, ...); xlet-settings passes keywords
         positional = "columns" not in kwargs and len(args) > 1
         columns = args[1] if positional else kwargs.get("columns")
         color_columns = {}
         if columns:
            new_columns = []
            for index, column_def in enumerate(columns):
               flags = _color_column_flags(column_def.get("color-chooser"))
               if flags is not None:
                  optional, opaque = flags
                  color_columns[index] = (optional, opaque, column_def.get("default"))
                  column_def = dict(column_def, type=_color_type_name(optional, opaque))
               new_columns.append(column_def)
            columns = new_columns
            if positional:
               args = args[:1] + (columns,) + args[2:]
            else:
               kwargs["columns"] = columns

         _original_init(self, *args, **kwargs)

         self.color_columns = color_columns
         for index, (optional, opaque, default) in color_columns.items():
            column = self.content_widget.get_column(index)
            column.clear()
            # Only one of the two is visible at a time, each expands to fill the cell and is centered in it
            swatch = Gtk.CellRendererPixbuf(xalign=0.5)
            text = Gtk.CellRendererText(xalign=0.5)
            column.pack_start(swatch, True)
            column.pack_start(text, True)
            column.set_cell_data_func(swatch, _render_swatch, (index, opaque))
            column.set_cell_data_func(text, _render_swatch_text, (index, opaque))
         if color_columns:
            self.content_widget.connect("button-press-event", _on_list_button_press, self)

      List.__init__ = patched_init
      List.color_columns_patched = True

_patch_list_widget()


OPERATIONS = ['<=', '>=', '<', '>', '!=', '=']

OPERATIONS_MAP = {'<': operator.lt, '<=': operator.le, '>': operator.gt, '>=': operator.ge, '!=': operator.ne, '=': operator.eq}

def is_number(s):
   try:
      float(s)  # Try converting to a float
      return True
   except ValueError:
      return False

def get_constant(settings, string):
   if is_number(string):
      value = float(string);
   elif string.lower() == 'true':
      value = True
   elif string.lower() == "false":
      value = False
   else:
      value = string
   return value

def customRevealerInit(self, settings, key):
   # Not super(JSONSettingsRevealer, ...): this module can't name the class xlet-settings actually uses
   Gtk.Revealer.__init__(self)
   self.settings = settings

   # Split the dependencies into a list of keys, operations and constants
   expression = re.split(r'(!=|<=|>=|[<>=&| ])', key)
   # Remove any blank entries and any whitespace within entries
   self.expression = [item.strip() for item in expression if item.strip()]

   # Listen to any keys found in the expression,
   # expand all compares, decode constants,
   # decode compare operators and check for errors
   key = None
   idx = 0
   count = len(self.expression)
   listening = []
   #print( f"Preparing dependency: {self.expression}" )
   while idx < count:
      element = self.expression[idx]
      if element == '&' or element == '|':
         pass
      elif element in OPERATIONS:  # ... key op constant ...
         self.expression[idx] = OPERATIONS_MAP[element]
         key = self.expression[idx-1]
         if idx+1 < count and self.expression[idx+1] != '&' and self.expression[idx+1] != '|':
            self.expression[idx+1] = get_constant(self.settings, self.expression[idx+1])
         else:
            self.expression.insert(idx+1, False)
            count += 1
         idx += 1
      elif element[0] == '!':      # ... !key ...
         key = element[1:]
         self.expression[idx] = key
         self.expression.insert(idx+1, False)
         self.expression.insert(idx+1, operator.eq)
         idx += 2
         count += 2
      elif idx == count-1 or self.expression[idx+1] == '&' or self.expression[idx+1] == '|':   # standalone key
         key = element
         self.expression.insert(idx+1, True)
         self.expression.insert(idx+1, operator.eq)
         idx += 2
         count += 2
      if key:
         if self.settings.has_key(key):
            if key not in listening:
               self.settings.listen(key, self.key_changed)
               listening.append(key)
         else:
            print( f"Error in json dependency: \"{key}\" is not a valid key" )
         if idx+1 < count and self.expression[idx+1] != '&' and self.expression[idx+1] != '|':
            print( f"Error in json dependency: Unexpected expression \"{self.expression[idx+1]}\"" )
            self.expression = self.expression[:idx+1]  # remove the remaining elements since something is wrong with the syntax
            break
         key = None
      idx += 1

   self.box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
   Gtk.Revealer.add(self, self.box)

   self.set_transition_type(Gtk.RevealerTransitionType.SLIDE_DOWN)
   self.set_transition_duration(150)

   # Fake out a key_changed event so that we have the correct reveal state
   self.key_changed(None, None)


def customRevealerKeyChanged(self, key, value):
   evaluate = []
   count = len(self.expression)
   #print( f"Evaluating expression: {self.expression}" )

   # Go through the expression to evaluate all the compares
   # The init ensures that the list has this format: key op const [ <&/|> key op const ]...
   idx = 0
   while idx < count:
      lhs = self.settings.get_value(self.expression[idx]) #get_value(self.settings, self.expression[idx])
      op  = self.expression[idx+1]
      rhs = self.expression[idx+2]
      evaluate.append( op(lhs, rhs) )
      idx += 3
      if idx < count:
         evaluate.append( self.expression[idx] )
         idx += 1
   #print( f"Post compare evaluation: {evaluate}" )

   # Handle all the "and" operations first in accordance with the logical order of operations
   while "&" in evaluate:
      idx = evaluate.index("&")
      result = (evaluate[idx-1] and evaluate[idx+1])
      evaluate[idx-1:idx+2] = [] ## remove 3 elements: idx-1 through idx+1
      evaluate.insert(idx-1, result);
   #print( f"After evaluating the ands: {evaluate}" )

   # Handle all the "or" operations (there should be nothing but "or" operations at this point)
   while "|" in evaluate:
      idx = evaluate.index("|")
      result = (evaluate[idx-1] or evaluate[idx+1])
      evaluate[idx-1:idx+2] = [] ## remove 3 elements: idx-1 through idx+1
      evaluate.insert(idx-1, result);
   #print( f"After evaluating ors: {evaluate}" )

   # At this point we should only have one entry in the list, the final result
   #print( f"Final result: {evaluate}" )
   self.set_reveal_child(evaluate[0])


# Monkey patch the JSONSettingsRevealer to use our custom methods which allows for "and" and "or" dependency operations.
# xlet-settings imports this module when it builds the first "custom" widget, so the patch is applied then (at the
# bottom of this file). That means a custom widget must come before any widget or section with a dependency.
#
# Cinnamon 6.6 and older import the settings module as "JsonSettingsWidgets", newer versions as
# "bin.JsonSettingsWidgets". Importing the name Cinnamon didn't use would load a second, unused copy of the module
# (and patching that copy does nothing), so patch whichever copies are already loaded.
def patch_revealer():
   for name in ("bin.JsonSettingsWidgets", "JsonSettingsWidgets"):
      module = sys.modules.get(name)
      revealer = getattr(module, "JSONSettingsRevealer", None)
      if revealer is not None and revealer.__init__ is not customRevealerInit:
         print( f"Monkey patching {name}.JSONSettingsRevealer methods" )
         revealer.__init__ = customRevealerInit
         revealer.key_changed = customRevealerKeyChanged

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


# An About page Widget with an image and a centered label that supports markup
class About(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      extensions_path  = GLib.get_user_data_dir() + "/cinnamon/extensions/"

      self.box = Gtk.Box(spacing=10,orientation=Gtk.Orientation.VERTICAL,margin_start=20, margin_end=20, margin_top=20, margin_left=20, margin_right=20)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"].replace("ext-version", settings.get_value("ext-version")))
      pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(extensions_path + UUID + info["icon"], width=192, height=192,  preserve_aspect_ratio=True)
      self.image = Gtk.Image.new_from_pixbuf(pixbuf)
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

        # The patch is normally applied when this module is imported (see patch_revealer()), this is just a safety net
        patch_revealer()

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


patch_revealer()
