#!/usr/bin/python3

import os
import sys
import gi
import gettext

from xapp.SettingsWidgets import SettingsWidget, SettingsLabel
from gi.repository import Gtk, Gdk, GdkPixbuf, GLib, Pango

UUID = "RoundedCorners@klangman"
gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale")

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


# An About page Widget with an optional image and a centered label that supports markup
class About(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      extensions_path  = GLib.get_user_data_dir() + "/cinnamon/extensions/"

      version = ""
      if settings.has_key("ext-version"):
         version = settings.get_value("ext-version") or ""

      self.box = Gtk.Box(spacing=10,orientation=Gtk.Orientation.VERTICAL,margin_start=20, margin_end=20, margin_top=20, margin_left=20, margin_right=20)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(_(info["description"]).replace("ext-version", version))

      # The icon is optional, only show it if the file exists
      if "icon" in info:
         icon_path = extensions_path + UUID + info["icon"]
         if os.path.isfile(icon_path):
            pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(icon_path, width=192, height=192,  preserve_aspect_ratio=True)
            self.image = Gtk.Image.new_from_pixbuf(pixbuf)
            self.box.add(self.image)

      self.box.add(self.label)
      self.pack_start(self.box, True, True, 0)


# A note shown at the top of a settings page: an info icon and a wrapped label that supports markup
class Note(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      icon = Gtk.Image.new_from_icon_name(info.get("icon-name", "dialog-information-symbolic"), Gtk.IconSize.LARGE_TOOLBAR)
      icon.set_valign(Gtk.Align.CENTER)

      self.label = Gtk.Label("", xalign=0, hexpand=True)
      self.label.set_line_wrap(True)
      self.label.set_max_width_chars(60)
      self.label.set_markup(_(info["description"]))

      self.pack_start(icon, False, False, 0)
      self.pack_start(self.label, True, True, 0)
