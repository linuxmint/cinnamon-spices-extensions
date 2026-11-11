#!/usr/bin/python3

import os
import random
import math
import gi
import re

import sys
import operator
import gettext
from xapp.SettingsWidgets import SettingsWidget
from gi.repository import Gio, Gtk, Gdk, GLib

gi.require_version('GSound', '1.0')
from gi.repository import GSound

UUID = "CinnamonBurnMyWindows@klangman"
gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale")

# This module used to get "_" from "from JsonSettingsWidgets import *", which no longer works in newer Cinnamon
# versions (see patch_revealer()). Use the extension's translations, falling back to Cinnamon's for the stock
# strings ("_Cancel", "_Open", ...) that the extension doesn't translate itself.
def _(text):
   translated = gettext.dgettext(UUID, text)
   if translated == text:
      translated = gettext.dgettext("cinnamon", text)
   return translated

OPERATIONS = ['<=', '>=', '<', '>', '!=', '=']

OPERATIONS_MAP = {'<': operator.lt, '<=': operator.le, '>': operator.gt, '>=': operator.ge, '!=': operator.ne, '=': operator.eq}

gsound_context = None

def _get_gsound_context() -> GSound.Context:
   global gsound_context
   if gsound_context is None:
      gsound_context = GSound.Context()
      gsound_context.init()
   return gsound_context

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

      extensions_path  = GLib.get_user_data_dir() + "/cinnamon/extensions/"

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
         newList.append( {"name": element["name"], "open": True, "close": True, "minimize": True, "unminimize": True, "raise": True} )
      self.settings.set_value("random-include", newList)

   def _on_clear_button_clicked(self, *args):
      lst = self.settings.get_value("random-include")
      newList = []
      for element in lst:
         newList.append( {"name": element["name"], "open": False, "close": False, "minimize": False, "unminimize": False, "raise": False} )
      self.settings.set_value("random-include", newList)

# The "random-include" list: an effect name column and one check box column per window event.
# Like the stock "list" widget (same "columns" and "height" in settings-schema.json, same value
# format), but a column with an "only-for" entry only shows its check box on the rows whose
# effect name is in that setting's list. The Raise column uses it: "raise-capable-effects" is
# written by extension.js, since only the effects themselves know whether they support raising.
class RandomIncludeList(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info
      self.updating = False

      self.columns = info["columns"]
      self.boolColumns = [c for c in self.columns if c["type"] == "boolean"]
      self.hoverCell = None    # (row index, bool column index) under the mouse pointer, where a plain gear is shown
      self.gearRenderers = {}  # bool column index -> its GearCellRenderer

      # Custom settings gears need the "effect-overrides" key (which older schemas don't have)
      gears = settings.has_key(OVERRIDES_KEY)
      if gears:
         add_icon_search_path()

      # Model: the row's dict (so unknown fields survive), the name, then one bool per box.
      self.store = Gtk.ListStore(*([object, str] + [bool] * len(self.boolColumns)))

      self.view = Gtk.TreeView(model=self.store)
      self.view.set_enable_search(False)

      nameRenderer = Gtk.CellRendererText()
      nameColumn = Gtk.TreeViewColumn(self.columns[0]["title"], nameRenderer, text=1)
      nameColumn.set_expand(True)
      self.view.append_column(nameColumn)

      for i, col in enumerate(self.boolColumns):
         renderer = Gtk.CellRendererToggle()
         renderer.set_activatable(True)
         renderer.connect("toggled", self.on_toggled, i)
         column = Gtk.TreeViewColumn(col["title"], renderer, active=2 + i)
         column.set_alignment(0.5)
         if "only-for" in col:
            column.set_cell_data_func(renderer, self.only_for_data_func, col["only-for"])
         if gears and col["id"] in RANDOM_SCOPE_COLUMNS:
            gear = GearCellRenderer()
            gear.connect("clicked", self.on_gear_clicked, i)
            # The check box and the gear share the column's spare width (both expand): the check box sits at the
            # right of its share and the gear at the left of its share, so they end up side by side in the middle
            # of the column instead of the gear being pushed to the far right.
            renderer.set_alignment(1.0, 0.5)
            gear.set_alignment(0.0, 0.5)
            column.pack_start(gear, True)
            column.set_cell_data_func(gear, self.gear_data_func, i)
            self.gearRenderers[i] = gear
         self.view.append_column(column)

      if gears:
         self.view.connect("motion-notify-event", self.on_motion)
         self.view.connect("leave-notify-event", self.on_leave)
         settings.listen(OVERRIDES_KEY, self.on_only_for_changed)  # Redraw when custom settings change

      scroller = Gtk.ScrolledWindow()
      scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
      scroller.set_shadow_type(Gtk.ShadowType.ETCHED_IN)
      scroller.set_size_request(-1, info.get("height", 300))
      scroller.add(self.view)

      self.listTooltip = info.get("tooltip")
      if self.gearRenderers:
         self.view.set_has_tooltip(True)
         self.view.connect("query-tooltip", self.on_query_tooltip)
      elif self.listTooltip:
         self.view.set_tooltip_text(self.listTooltip)

      self.pack_start(scroller, True, True, 0)

      self.load()
      settings.listen(key, self.on_key_value_changed)
      for col in self.boolColumns:
         if "only-for" in col:
            settings.listen(col["only-for"], self.on_only_for_changed)

   # The names a column's check boxes are limited to.
   def only_for_names(self, onlyForKey):
      try:
         return self.settings.get_value(onlyForKey) or []
      except Exception:
         return []

   def only_for_data_func(self, column, renderer, model, it, onlyForKey):
      renderer.set_visible(model[it][1] in self.only_for_names(onlyForKey))

   def load(self):
      self.store.clear()
      for row in self.settings.get_value(self.key) or []:
         values = [dict(row), row.get("name", "")]
         for col in self.boolColumns:
            values.append(bool(row.get(col["id"], col.get("default", True))))
         self.store.append(values)

   def save(self):
      rows = []
      for r in self.store:
         row = dict(r[0])
         for i, col in enumerate(self.boolColumns):
            row[col["id"]] = r[2 + i]
         rows.append(row)
      self.updating = True
      self.settings.set_value(self.key, rows)
      self.updating = False

   def on_toggled(self, renderer, path, i):
      self.store[path][2 + i] = not self.store[path][2 + i]
      self.save()

   # The list changed elsewhere (Set / Clear buttons, the extension's upgrade pass).
   def on_key_value_changed(self, key, value):
      if not self.updating:
         self.load()

   # Which rows show a check box changed: just redraw.
   def on_only_for_changed(self, key, value):
      self.view.queue_draw()

   # The "effect-overrides" scope for a bool column (i.e. "random-open"), see RANDOM_SCOPE_COLUMNS
   def gear_scope(self, i):
      return "random-" + self.boolColumns[i]["id"]

   # The gear for a row of a column: None (no gear), ICON_CONFIGURE or ICON_CUSTOM.
   # Gears are only shown where the box is ticked. The checked gear (custom settings in use) is always shown,
   # the plain gear only in the cell under the mouse pointer, so the list doesn't fill up with buttons.
   def gear_icon(self, row, i, rowIndex):
      if not row[2 + i]:
         return None
      col = self.boolColumns[i]
      if "only-for" in col and row[1] not in self.only_for_names(col["only-for"]):
         return None
      effectIdx = effect_index(self.settings, row[1])
      if effectIdx is None:
         return None
      if get_override_entry(self.settings, self.gear_scope(i), effectIdx).get("enabled", False):
         return ICON_CUSTOM
      return ICON_CONFIGURE if (rowIndex, i) == self.hoverCell else None

   def gear_data_func(self, column, renderer, model, it, i):
      renderer.set_property("icon-name", self.gear_icon(model[it], i, model.get_path(it).get_indices()[0]))

   # The dialog is opened once GTK is idle: opening (and closing) it while the tree view is still handling the
   # click that activated the gear crashes GTK.
   def on_gear_clicked(self, renderer, path, i):
      row = self.store[path]
      if self.gear_icon(row, i, row.path.get_indices()[0]) is not None:
         GLib.idle_add(self.open_gear_dialog, row[1], i)

   def open_gear_dialog(self, name, i):
      title = f"{_('Randomized')} {_(self.boolColumns[i]['title'].strip())}: {_(name)}"
      dialog = EffectSettingsDialog(self.get_toplevel(), self.settings, self.gear_scope(i), effect_index(self.settings, name), title)
      dialog.run()
      dialog.destroy()
      self.view.queue_draw()
      return GLib.SOURCE_REMOVE

   # The (row index, bool column index) of the check box cell under the pointer, or None
   def cell_at(self, event):
      x, y = int(event.x), int(event.y)
      if event.window != self.view.get_bin_window():
         x, y = self.view.convert_widget_to_bin_window_coords(x, y)
      hit = self.view.get_path_at_pos(x, y)
      if hit:
         i = self.view.get_columns().index(hit[1]) - 1   # The first column is the effect name
         if 0 <= i < len(self.boolColumns):
            return (hit[0].get_indices()[0], i)
      return None

   def on_motion(self, view, event):
      cell = self.cell_at(event)
      if cell != self.hoverCell:
         self.hoverCell = cell
         self.view.queue_draw()
      return False

   def on_leave(self, view, event):
      if self.hoverCell is not None:
         self.hoverCell = None
         self.view.queue_draw()
      return False

   def on_query_tooltip(self, view, x, y, keyboard, tooltip):
      found, x, y, model, path, it = view.get_tooltip_context(x, y, keyboard)   # x, y are now bin window coordinates
      if found and not keyboard:
         hit = view.get_path_at_pos(x, y)
         if hit:
            path, column, cellX, cellY = hit
            for i, gear in self.gearRenderers.items():
               position = column.cell_get_position(gear)   # (start, width), or None if not in this column
               if position and position[0] <= cellX < position[0] + position[1]:
                  icon = self.gear_icon(model[it], i, path.get_indices()[0])
                  if icon is not None:
                     tooltip.set_text(_("Custom settings are in use for this effect") if icon == ICON_CUSTOM
                                      else _("Configure custom settings for this effect"))
                     view.set_tooltip_cell(tooltip, path, column, gear)
                     return True
      if self.listTooltip:
         tooltip.set_text(self.listTooltip)
         return True
      return False

# A copy of SoundFileChooser with an X button to clear the sound file name
class ClearableSoundFileChooser(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      self.label = Gtk.Label(_(info['description']), halign=Gtk.Align.START)  # SettingsLabel(label)
      self.content_widget = Gtk.Box()

      c = self.content_widget.get_style_context()
      c.add_class(Gtk.STYLE_CLASS_LINKED)

      self.file_picker_button = Gtk.Button()
      self.file_picker_button.connect("clicked", self.on_picker_clicked)

      button_content = Gtk.Box(spacing=5)
      self.file_picker_button.add(button_content)

      self.button_label = Gtk.Label()
      button_content.pack_start(Gtk.Image(icon_name="sound"), False, False, 0)
      button_content.pack_start(self.button_label, False, False, 0)

      self.content_widget.pack_start(self.file_picker_button, True, True, 0)

      self.pack_start(self.label, False, False, 0)
      self.pack_end(self.content_widget, False, False, 0)

      self.play_button = Gtk.Button()
      self.play_button.set_image(Gtk.Image.new_from_icon_name("media-playback-start-symbolic", Gtk.IconSize.BUTTON))
      self.play_button.connect("clicked", self.on_play_clicked)
      self.content_widget.pack_start(self.play_button, False, False, 0)

      self.clear_button = Gtk.Button()
      self.clear_button.set_image(Gtk.Image.new_from_icon_name("edit-clear-symbolic", Gtk.IconSize.BUTTON))
      self.clear_button.connect("clicked", self.on_clear_clicked)
      self.content_widget.pack_start(self.clear_button, False, False, 0)

      self.update_button_label(info['value']);

      if "tooltip" in info:
         self.set_tooltip_text(info["tooltip"])

   def on_clear_clicked(self, widget):
      self.button_label.set_label("")
      self.settings.set_value(self.key, "")

   def on_play_clicked(self, widget):
      path = self.settings.get_value(self.key)
      if path != "":
         params = {GSound.ATTR_MEDIA_FILENAME: path, GSound.ATTR_MEDIA_ROLE: "test"}
         _get_gsound_context().play_simple(params)

   def on_picker_clicked(self, widget):
      dialog = Gtk.FileChooserDialog(title=self.label.get_text(),
                                     action=Gtk.FileChooserAction.OPEN,
                                     transient_for=self.get_toplevel(),
                                     buttons=(_("_Cancel"), Gtk.ResponseType.CANCEL,
                                              _("_Open"), Gtk.ResponseType.ACCEPT))

      if os.path.exists(self.settings.get_value(self.key)):
         dialog.set_filename(self.settings.get_value(self.key))
      else:
         dialog.set_current_folder('/usr/share/sounds')

      sound_filter = Gtk.FileFilter()
      sound_filter.add_mime_type("audio/x-wav")
      sound_filter.add_mime_type("audio/x-vorbis+ogg")
      sound_filter.set_name(_("Sound files"))
      dialog.add_filter(sound_filter)

      if dialog.run() == Gtk.ResponseType.ACCEPT:
         name = dialog.get_filename()
         self.settings.set_value(self.key, name)
         self.update_button_label(name)

      dialog.destroy()

   def update_button_label(self, absolute_path):
      if absolute_path != "":
         f = Gio.File.new_for_path(absolute_path)
         self.button_label.set_label(f.get_basename())


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


# ---------------------------------------------------------------------------------------------------------------
# Effect selector with custom (per-selector) effect settings
#
# EffectSelector is a drop-in replacement for the effect "combobox" keys. It adds a configure button beside the
# drop down that opens EffectSettingsDialog, which shows the selected effect's settings (the same rows as on the
# Effects page) with a "Use custom settings" switch:
#   off -> the rows are greyed out and show the global values, which is what the effect will use
#   on  -> the rows can be edited, and the values are saved in the "effect-overrides" key instead of the globals
#
# "effect-overrides" layout:  { "<scope>": { "<effect idx>": { "enabled": bool, "values": { key: value, ... } } } }
# where <scope> is the selector's "scope" property (defaults to the selector's key name). The first time custom
# settings are enabled every one of the effect's current global values is copied into "values" (a snapshot), so
# later changes on the Effects page don't change the custom settings. Turning the switch off only clears "enabled",
# so the custom values come back when it is turned on again.
# ---------------------------------------------------------------------------------------------------------------
import copy
import traceback
from xapp.SettingsWidgets import SettingsPage

OVERRIDES_KEY = "effect-overrides"
EFFECT_SELECTOR_KEY = "effect-selector"
EFFECT_SETTINGS_SECTION = "effect-settings"
NON_EFFECT_IDX = (999, 1000)   # Effect.Randomized.idx, Effect.None.idx in extension.js

# The configure button's icons, from the extension's icons folder. They are symbolic icons, so GTK draws them in the
# theme's text colour. Note: GTK only recolours filled shapes, so these must not use strokes, masks or fixed colours.
ICON_CONFIGURE = "bmw-gear-symbolic"         # the effect uses the global settings
ICON_CUSTOM    = "bmw-gear-check-symbolic"   # the effect uses custom settings

# Add the extension's icons folder to GTK's icon search path (once)
_icon_path_added = False
def add_icon_search_path():
   global _icon_path_added
   if _icon_path_added:
      return
   here = os.path.dirname(os.path.abspath(__file__))
   for folder in (os.path.join(here, "icons"), os.path.join(os.path.dirname(here), "icons")):
      if os.path.isfile(os.path.join(folder, ICON_CONFIGURE + ".svg")):
         Gtk.IconTheme.get_default().append_search_path(folder)
         break
   _icon_path_added = True

# The stock settings widgets by settings type. A copy of XLET_SETTINGS_WIDGETS from xlet-settings.py, which can't
# be imported (it is the settings app's __main__ script).
JSON_WIDGET_CLASSES = {
   "entry"            : "JSONSettingsEntry",
   "textview"         : "JSONSettingsTextView",
   "checkbox"         : "JSONSettingsSwitch",
   "switch"           : "JSONSettingsSwitch",
   "spinbutton"       : "JSONSettingsSpinButton",
   "filechooser"      : "JSONSettingsFileChooser",
   "scale"            : "JSONSettingsRange",
   "radiogroup"       : "JSONSettingsComboBox",
   "combobox"         : "JSONSettingsComboBox",
   "colorchooser"     : "JSONSettingsColorChooser",
   "fontchooser"      : "JSONSettingsFontButton",
   "soundfilechooser" : "JSONSettingsSoundFileChooser",
   "iconfilechooser"  : "JSONSettingsIconChooser",
   "datechooser"      : "JSONSettingsDateChooser",
   "timechooser"      : "JSONSettingsTimeChooser",
   "keybinding"       : "JSONSettingsKeybinding"
}

# The settings module Cinnamon loaded ("JsonSettingsWidgets" in 6.6 and older, "bin.JsonSettingsWidgets" in newer
# versions), see patch_revealer()
def json_settings_module():
   for name in ("bin.JsonSettingsWidgets", "JsonSettingsWidgets"):
      module = sys.modules.get(name)
      if module is not None and hasattr(module, "JSONSettingsRevealer"):
         return module
   return None

# The rows of an effect's settings, in Effects page order, as a list of (key, dependency) where dependency is
# the row's dependency without the "effect-selector=<idx>" term (i.e. "" or something like "fire-presets=0").
# For a raise scope (see RAISE_SCOPES) the effect's duration row is replaced by the raise duration, and the sound
# rows are left out.
# Note: assumes "effect-selector=<idx>" is joined to the rest of the dependency with "&", never "|".
def effect_setting_rows(settings, effect_idx, scope=None):
   data = settings.settings
   term = f"{EFFECT_SELECTOR_KEY}={effect_idx}"
   raising = scope in RAISE_SCOPES
   rows = []
   try:
      keys = data["layout"][EFFECT_SETTINGS_SECTION]["keys"]
   except KeyError:
      return rows
   for key in keys:
      dependency = data.get(key, {}).get("dependency", "")
      terms = [t.strip() for t in dependency.split("&")]
      if term in terms:
         if raising and key.endswith("-animation-time"):
            if RAISE_DURATION_KEY in data:
               rows.append((RAISE_DURATION_KEY, ""))
         elif raising and (key.endswith("-open-sound") or key.endswith("-close-sound")):
            pass
         else:
            rows.append((key, " & ".join(t for t in terms if t != term)))
   return rows

# The keys holding the values shown by the given rows, i.e. the ones a custom settings snapshot needs to contain.
# Besides each row's own key this includes the hidden keys a row's widget works on, which the widget names in its
# properties (i.e. FireColorChooser's "color1".."color5" and ResetToDefault's "keys" list).
def value_keys(settings, rows):
   data = settings.settings
   keys = []
   def add(key):
      if isinstance(key, str) and key not in keys and "value" in data.get(key, {}):
         keys.append(key)
   for key, dependency in rows:
      add(key)
      for prop, value in data[key].items():
         if prop not in ("dependency", "value", "default"):
            for name in (value if isinstance(value, list) else [value]):
               add(name)
   return keys

# The Randomized list columns with custom settings gears, each with its own "effect-overrides" scope
# ("random-open", ...)
RANDOM_SCOPE_COLUMNS = ("open", "close", "minimize", "unminimize", "raise")

# The scopes of raise effects. A raise effect doesn't use the effect's own duration or sounds: it is silent and
# uses the shared "raise-animation-time", which its custom settings can override. So the dialog shows that
# instead of the effect's duration, and no sound rows.
RAISE_SCOPES = ("raise-effect", "power-raise-effect", "random-raise")
RAISE_DURATION_KEY = "raise-animation-time"

# An effect's index from its name (the "effect-selector" options, which the extension keeps up to date)
def effect_index(settings, name):
   try:
      return settings.settings[EFFECT_SELECTOR_KEY]["options"].get(name)
   except (KeyError, AttributeError):
      return None

def get_override_entry(settings, scope, effect_idx):
   if not settings.has_key(OVERRIDES_KEY):
      return {}
   overrides = settings.get_value(OVERRIDES_KEY) or {}
   return overrides.get(scope, {}).get(str(effect_idx), {})


# Looks like a JSONSettingsHandler to the settings widgets, but reads and writes one effect's custom settings in
# the "effect-overrides" key. While the custom settings are disabled it returns the global values and ignores
# writes. Everything else (properties, defaults, the layout) comes from the real settings handler.
class OverrideSettings():
   def __init__(self, base, scope, effect_idx, keys):
      self.base = base
      self.scope = scope
      self.effect = str(effect_idx)
      self.keys = keys
      self.bindings = {}
      self.listeners = {}

   # The settings data (key properties) is shared with the real handler, which may replace it on a reload
   @property
   def settings(self):
      return self.base.settings

   def has_key(self, key):
      return self.base.has_key(key)

   def has_property(self, key, prop):
      return self.base.has_property(key, prop)

   def listen(self, key, callback):
      self.listeners.setdefault(key, []).append(callback)

   def _entry(self):
      return get_override_entry(self.base, self.scope, self.effect)

   def is_enabled(self):
      return bool(self._entry().get("enabled", False))

   def get_property(self, key, prop):
      if prop == "value":
         entry = self._entry()
         values = entry.get("values", {})
         if entry.get("enabled", False) and key in values:
            return values[key]
      return self.base.get_property(key, prop)

   def get_value(self, key):
      return self.get_property(key, "value")

   # Modify a copy of "effect-overrides" and save it. It must be a copy, the real handler's set_value() compares
   # the new value with the stored one and silently does nothing if the stored object was changed in place.
   def _update_entry(self, update):
      store = copy.deepcopy(self.base.get_value(OVERRIDES_KEY) or {})
      entry = store.setdefault(self.scope, {}).setdefault(self.effect, {})
      update(entry)
      self.base.set_value(OVERRIDES_KEY, store)

   def set_value(self, key, value):
      if not self.is_enabled() or value == self.get_value(key):
         return
      self._update_entry(lambda entry: entry.setdefault("values", {}).__setitem__(key, copy.deepcopy(value)))
      self._notify(key, value)

   # Enabling copies the global value of every key that doesn't have a custom value yet. That is all the keys the
   # first time, and only keys added by a newer version of the extension after that.
   def set_enabled(self, enabled):
      def update(entry):
         entry["enabled"] = enabled
         if enabled:
            values = entry.setdefault("values", {})
            for key in self.keys:
               if key not in values:
                  values[key] = copy.deepcopy(self.base.get_value(key))
      self._update_entry(update)
      self._refresh()

   # Replace all the custom values with a fresh copy of the global values
   def copy_global_values(self):
      def update(entry):
         entry["values"] = {key: copy.deepcopy(self.base.get_value(key)) for key in self.keys}
      self._update_entry(update)
      self._refresh()

   # Push the values (custom or global, depending on the switch) to every widget
   def _refresh(self):
      for key in self.keys:
         self._notify(key, self.get_value(key))

   def _notify(self, key, value):
      for info in self.bindings.get(key, []):
         self._set_object_value(info, value)
      for callback in self.listeners.get(key, []):
         callback(key, value)

   # bind() and its helpers work the same way as in JSONSettingsHandler
   def bind(self, key, obj, prop, direction, map_get=None, map_set=None):
      if direction & (Gio.SettingsBindFlags.SET | Gio.SettingsBindFlags.GET) == 0:
         direction |= Gio.SettingsBindFlags.SET | Gio.SettingsBindFlags.GET
      info = {"obj": obj, "prop": prop, "dir": direction, "map_get": map_get, "map_set": map_set}
      self.bindings.setdefault(key, []).append(info)
      if direction & Gio.SettingsBindFlags.GET != 0:
         self._set_object_value(info, self.get_value(key))
      if direction & Gio.SettingsBindFlags.SET != 0:
         info["oid"] = obj.connect("notify::" + prop, self._object_value_changed, key)

   def _object_value_changed(self, obj, pspec, key):
      value = None
      for info in self.bindings[key]:
         if obj == info["obj"]:
            value = info["obj"].get_property(info["prop"])
            if info["map_set"] is not None:
               value = info["map_set"](value)
      for info in self.bindings[key]:
         if obj != info["obj"]:
            self._set_object_value(info, value)
      self.set_value(key, value)

   def _set_object_value(self, info, value):
      if info["dir"] & Gio.SettingsBindFlags.GET == 0:
         return
      with info["obj"].freeze_notify():
         if info["map_get"] is not None:
            value = info["map_get"](value)
         if value is not None and value != info["obj"].get_property(info["prop"]):
            info["obj"].set_property(info["prop"], value)


from gi.repository import GObject

class GearCellRenderer(Gtk.CellRendererPixbuf):
   __gsignals__ = {"clicked": (GObject.SignalFlags.RUN_LAST, None, (str,))}

   def __init__(self):
      Gtk.CellRendererPixbuf.__init__(self)
      self.set_property("mode", Gtk.CellRendererMode.ACTIVATABLE)
      self.set_padding(4, 0)          # The gap between the check box and the gear
      self.set_fixed_size(24, -1)     # 16px icon + padding

   def do_activate(self, event, widget, path, background_area, cell_area, flags):
      self.emit("clicked", path)
      return True


# The custom settings dialog for one effect of one selector
class EffectSettingsDialog(Gtk.Dialog):
   def __init__(self, parent, settings, scope, effect_idx, title):
      Gtk.Dialog.__init__(self, title=title, transient_for=parent, modal=True, destroy_with_parent=True)
      self.add_button(_("Close"), Gtk.ResponseType.CLOSE)
      self.set_default_size(640, 600)

      rows = effect_setting_rows(settings, effect_idx, scope)
      self.proxy = OverrideSettings(settings, scope, effect_idx, value_keys(settings, rows))

      page = SettingsPage()
      page.set_margin_left(20)
      page.set_margin_right(20)

      # The "Use custom settings" switch and the "Copy global settings" button
      section = page.add_section()
      row = SettingsWidget()
      label = Gtk.Label(label=_("Use custom settings"), halign=Gtk.Align.START)
      self.switch = Gtk.Switch(valign=Gtk.Align.CENTER)
      self.switch.set_active(self.proxy.is_enabled())
      self.switch.connect("notify::active", self.on_switch_changed)
      self.copy_button = Gtk.Button(label=_("Copy global settings"), valign=Gtk.Align.CENTER)
      self.copy_button.set_tooltip_text(_("Replace the custom settings with the settings from the Effects page"))
      self.copy_button.connect("clicked", self.on_copy_clicked)
      row.pack_start(label, True, True, 0)
      row.pack_end(self.switch, False, False, 0)
      row.pack_end(self.copy_button, False, False, 0)
      row.set_tooltip_text(_("When off, this effect uses the settings from the Effects page (shown greyed out)"))
      section.add_row(row)

      # The effect's settings, built the same way the settings app builds the Effects page
      self.options = page.add_section(_("Custom Effect Settings"))
      module = json_settings_module()
      for key, dependency in rows:
         widget = self.create_widget(module, key)
         if widget is None:
            continue
         if dependency and module is not None:
            self.options.add_reveal_row(widget, revealer=module.JSONSettingsRevealer(self.proxy, dependency))
         else:
            self.options.add_row(widget)

      scroller = Gtk.ScrolledWindow()
      scroller.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
      scroller.add(page)
      self.get_content_area().pack_start(scroller, True, True, 0)

      self.update_sensitivity()
      self.show_all()

   def create_widget(self, module, key):
      item = dict(self.proxy.settings[key])
      if "value" in item:
         item["value"] = self.proxy.get_value(key)   # Some widgets (i.e. CompactScale) read the initial value from here
      settings_type = item.get("type")
      try:
         if settings_type == "custom":
            widget_class = globals().get(item.get("widget")) if item.get("file") == "CustomWidgets.py" else None
            if widget_class is not None:
               return widget_class(item, key, self.proxy)
         elif settings_type in JSON_WIDGET_CLASSES and module is not None:
            return getattr(module, JSON_WIDGET_CLASSES[settings_type])(key, self.proxy, item)
         # "button" rows call back into the extension, they don't belong in this dialog
      except Exception:
         print( f"EffectSettingsDialog: unable to create the widget for \"{key}\"" )
         traceback.print_exc()
      return None

   def update_sensitivity(self):
      enabled = self.proxy.is_enabled()
      self.options.set_sensitive(enabled)
      self.copy_button.set_sensitive(enabled)

   def on_switch_changed(self, switch, pspec):
      self.proxy.set_enabled(switch.get_active())
      self.update_sensitivity()

   def on_copy_clicked(self, button):
      self.proxy.copy_global_values()


# A combobox for choosing an effect, with a button to configure custom settings for the chosen effect
class EffectSelector(SettingsWidget):
   def __init__(self, info, key, settings):
      # The patch is normally applied when this module is imported (see patch_revealer()), this is just a safety net
      patch_revealer()

      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info
      self.scope = info.get("scope", key)

      self.combo = json_settings_module().JSONSettingsComboBox(key, settings, info)
      self.combo.fill_row()   # No extra margins, this row already has them

      add_icon_search_path()
      self.icon = Gtk.Image.new_from_icon_name(ICON_CONFIGURE, Gtk.IconSize.BUTTON)
      self.button = Gtk.Button(image=self.icon)
      self.button.set_valign(Gtk.Align.CENTER)
      self.button.connect("clicked", self.on_configure_clicked)

      self.pack_start(self.combo, True, True, 0)
      self.pack_end(self.button, False, False, 0)

      settings.listen(key, self.on_settings_changed)
      if settings.has_key(OVERRIDES_KEY):
         settings.listen(OVERRIDES_KEY, self.on_settings_changed)
      self.update_button()

   def effect_name(self, effect_idx):
      for label, value in self.info.get("options", {}).items():
         if value == effect_idx:
            return _(label)
      return str(effect_idx)

   def update_button(self):
      effect_idx = self.settings.get_value(self.key)
      configurable = (self.settings.has_key(OVERRIDES_KEY) and effect_idx not in NON_EFFECT_IDX and
                      len(effect_setting_rows(self.settings, effect_idx, self.scope)) > 0)
      custom = configurable and bool(get_override_entry(self.settings, self.scope, effect_idx).get("enabled", False))
      self.button.set_sensitive(configurable)
      if custom:
         self.icon.set_from_icon_name(ICON_CUSTOM, Gtk.IconSize.BUTTON)
         self.button.set_tooltip_text(_("Custom settings are in use for this effect"))
      else:
         self.icon.set_from_icon_name(ICON_CONFIGURE, Gtk.IconSize.BUTTON)
         self.button.set_tooltip_text(_("Configure custom settings for this effect"))

   def on_settings_changed(self, key, value):
      self.update_button()

   def on_configure_clicked(self, button):
      effect_idx = self.settings.get_value(self.key)
      title = f"{_(self.info.get('description', ''))}: {self.effect_name(effect_idx)}"
      dialog = EffectSettingsDialog(self.get_toplevel(), self.settings, self.scope, effect_idx, title)
      dialog.run()
      dialog.destroy()
      self.update_button()


# The Application Specific Rules table. It replaces Cinnamon's stock list (whose cells can't hold a gear) and is
# edited in place: the Enabled check box, a drop down for each effect and the application name typed into its
# cell, with Add / Remove / Move buttons below. Each effect cell has a custom settings gear, shown the same way as
# in the Randomized list (always when custom settings are in use, otherwise only in the cell under the pointer),
# but not for Randomized or None. The stored rows keep the stock list's fields, so the extension reads them as
# before. Custom settings belong to a rule through an "id" the rule gets the first time its gear is used, so they
# survive renaming the application; their scope is "app-<id>-<event>" (see app_rule_scope()).
import uuid

APP_RULE_EVENTS = ("open", "close", "minimize", "unminimize")

def app_rule_scope(rule_id, event):
   return f"app-{rule_id}-{event}"

class AppRulesList(SettingsWidget):
   # Model columns: the row's dict (so unknown fields, like "id", survive), Enabled, the four effects, Application
   COL_DATA, COL_ENABLED, COL_EFFECT, COL_APP = 0, 1, 2, 6

   def __init__(self, info, key, settings):
      # The patch is normally applied when this module is imported (see patch_revealer()), this is just a safety net
      patch_revealer()

      SettingsWidget.__init__(self)
      self.set_orientation(Gtk.Orientation.VERTICAL)
      self.set_spacing(4)
      self.key = key
      self.settings = settings
      self.info = info
      self.updating = False
      self.hoverCell = None    # (row index, event index) under the mouse pointer, where a plain gear is shown
      self.gearRenderers = {}  # event index -> its GearCellRenderer
      self.columns = {c["id"]: c for c in info.get("columns", [])}
      self.gears = settings.has_key(OVERRIDES_KEY)
      if self.gears:
         add_icon_search_path()

      self.store = Gtk.ListStore(object, bool, int, int, int, int, str)
      self.view = Gtk.TreeView(model=self.store)
      self.view.set_enable_search(False)

      toggle = Gtk.CellRendererToggle()
      toggle.set_activatable(True)
      toggle.connect("toggled", self.on_enabled_toggled)
      column = Gtk.TreeViewColumn(self.title("enabled", _("Enabled")), toggle, active=self.COL_ENABLED)
      self.view.append_column(column)

      for i, event in enumerate(APP_RULE_EVENTS):
         options = Gtk.ListStore(str, int)
         for label, value in self.effect_options(event):
            options.append([label, value])
         combo = Gtk.CellRendererCombo(model=options, text_column=0, has_entry=False, editable=True)
         combo.connect("changed", self.on_effect_changed, i)
         column = Gtk.TreeViewColumn(self.title(event, event.capitalize()))
         column.pack_start(combo, True)
         column.set_cell_data_func(combo, self.effect_data_func, i)
         if self.gears:
            # Clicks on the gear are caught in on_button_press(): with an editable cell (the drop down) in the
            # column, GTK's first click on a row only moves the cursor to it and doesn't activate the gear.
            gear = GearCellRenderer()
            column.pack_start(gear, False)
            column.set_cell_data_func(gear, self.gear_data_func, i)
            self.gearRenderers[i] = gear
         column.set_resizable(True)
         self.view.append_column(column)

      text = Gtk.CellRendererText(editable=True)
      text.connect("edited", self.on_application_edited)
      self.appColumn = Gtk.TreeViewColumn(self.title("application", _("Application")), text, text=self.COL_APP)
      self.appColumn.set_expand(True)
      self.appColumn.set_resizable(True)
      self.view.append_column(self.appColumn)

      scroller = Gtk.ScrolledWindow()
      scroller.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
      scroller.set_shadow_type(Gtk.ShadowType.ETCHED_IN)
      scroller.set_size_request(-1, info.get("height", 200))
      scroller.add(self.view)
      self.pack_start(scroller, True, True, 0)

      # Add / Remove / Move up / Move down
      buttons = Gtk.Box(spacing=0)
      buttons.get_style_context().add_class("linked")
      self.buttons = {}
      for name, icon, tooltip, callback in (
            ("add",    "list-add-symbolic",    _("Add a rule"),                  lambda b: self.on_add()),
            ("remove", "list-remove-symbolic", _("Remove the selected rule"),    lambda b: self.on_remove()),
            ("up",     "go-up-symbolic",       _("Move the selected rule up"),   lambda b: self.on_move(-1)),
            ("down",   "go-down-symbolic",     _("Move the selected rule down"), lambda b: self.on_move(1))):
         button = Gtk.Button.new_from_icon_name(icon, Gtk.IconSize.BUTTON)
         button.set_tooltip_text(tooltip)
         button.connect("clicked", callback)
         buttons.pack_start(button, False, False, 0)
         self.buttons[name] = button
      self.pack_start(buttons, False, False, 0)

      self.listTooltip = info.get("tooltip")
      if self.gears:
         self.view.connect("button-press-event", self.on_button_press)
         self.view.connect("motion-notify-event", self.on_motion)
         self.view.connect("leave-notify-event", self.on_leave)
         self.view.set_has_tooltip(True)
         self.view.connect("query-tooltip", self.on_query_tooltip)
         settings.listen(OVERRIDES_KEY, lambda key, value: self.view.queue_draw())
      elif self.listTooltip:
         self.view.set_tooltip_text(self.listTooltip)

      self.view.get_selection().connect("changed", lambda selection: self.update_buttons())
      self.load()
      settings.listen(key, self.on_key_value_changed)

   def title(self, column_id, fallback):
      return _(self.columns.get(column_id, {}).get("title", fallback)).strip()

   # (label, value) of an effect column's options (kept up to date by the extension, see _syncEffectOptions())
   def effect_options(self, event):
      return list(self.columns.get(event, {}).get("options", {}).items())

   def effect_label(self, event, value):
      for label, v in self.effect_options(event):
         if v == value:
            return _(label)
      return str(value)

   # --- load / save ---------------------------------------------------------------------------------------------
   def default(self, column_id, fallback):
      return self.columns.get(column_id, {}).get("default", fallback)

   def row_values(self, rule):
      values = [dict(rule), bool(rule.get("enabled", self.default("enabled", True)))]
      for event in APP_RULE_EVENTS:
         values.append(int(rule.get(event, self.default(event, NON_EFFECT_IDX[1]))))
      values.append(str(rule.get("application", "")))
      return values

   def load(self):
      self.store.clear()
      for rule in self.settings.get_value(self.key) or []:
         self.store.append(self.row_values(rule))
      self.update_buttons()

   def save(self):
      rules = []
      for r in self.store:
         rule = dict(r[self.COL_DATA])
         rule["enabled"] = r[self.COL_ENABLED]
         for i, event in enumerate(APP_RULE_EVENTS):
            rule[event] = r[self.COL_EFFECT + i]
         rule["application"] = r[self.COL_APP]
         rules.append(rule)
      self.updating = True
      self.settings.set_value(self.key, rules)
      self.updating = False

   # The rules changed elsewhere (i.e. the extension's "Pick a window to add" button)
   def on_key_value_changed(self, key, value):
      if not self.updating:
         self.load()

   # --- editing -------------------------------------------------------------------------------------------------
   def on_enabled_toggled(self, renderer, path):
      self.store[path][self.COL_ENABLED] = not self.store[path][self.COL_ENABLED]
      self.save()

   def effect_data_func(self, column, renderer, model, it, i):
      renderer.set_property("text", self.effect_label(APP_RULE_EVENTS[i], model[it][self.COL_EFFECT + i]))

   def on_effect_changed(self, combo, path, option_iter, i):
      value = combo.get_property("model")[option_iter][1]
      if self.store[path][self.COL_EFFECT + i] != value:
         self.store[path][self.COL_EFFECT + i] = value
         self.save()

   def on_application_edited(self, renderer, path, text):
      text = text.strip()
      if self.store[path][self.COL_APP] != text:
         self.store[path][self.COL_APP] = text
         self.save()

   def selected(self):
      model, it = self.view.get_selection().get_selected()
      return it

   def update_buttons(self):
      it = self.selected()
      index = self.store.get_path(it).get_indices()[0] if it else -1
      self.buttons["remove"].set_sensitive(it is not None)
      self.buttons["up"].set_sensitive(index > 0)
      self.buttons["down"].set_sensitive(0 <= index < len(self.store) - 1)

   # A new (enabled) rule with the columns' defaults, then start typing its application name
   def on_add(self):
      rule = {c: self.default(c, None) for c in self.columns if self.default(c, None) is not None}
      rule["enabled"] = True
      rule["application"] = ""
      it = self.store.append(self.row_values(rule))
      self.save()
      path = self.store.get_path(it)
      self.view.get_selection().select_path(path)
      self.view.set_cursor(path, self.appColumn, True)

   # Remove the selected rule, and its custom settings
   def on_remove(self):
      it = self.selected()
      if it is None:
         return
      rule_id = self.store[it][self.COL_DATA].get("id")
      self.store.remove(it)
      self.save()
      if rule_id and self.gears:
         overrides = self.settings.get_value(OVERRIDES_KEY) or {}
         scopes = [app_rule_scope(rule_id, event) for event in APP_RULE_EVENTS]
         if any(scope in overrides for scope in scopes):
            overrides = copy.deepcopy(overrides)
            for scope in scopes:
               overrides.pop(scope, None)
            self.settings.set_value(OVERRIDES_KEY, overrides)
      self.update_buttons()

   def on_move(self, step):
      it = self.selected()
      if it is None:
         return
      index = self.store.get_path(it).get_indices()[0]
      if 0 <= index + step < len(self.store):
         other = self.store.get_iter(Gtk.TreePath.new_from_indices([index + step]))
         self.store.swap(it, other)
         self.save()
         self.update_buttons()

   # --- custom settings gears -----------------------------------------------------------------------------------
   # The gear for a row's effect: None (no gear), ICON_CONFIGURE or ICON_CUSTOM. Like the Randomized list: the
   # checked gear is always shown, the plain gear only in the cell under the mouse pointer. No gear for Randomized
   # or None, which have no settings of their own.
   def gear_icon(self, rowIndex, i):
      row = self.store[rowIndex]
      value = row[self.COL_EFFECT + i]
      if value in NON_EFFECT_IDX:
         return None
      rule_id = row[self.COL_DATA].get("id")
      if rule_id and get_override_entry(self.settings, app_rule_scope(rule_id, APP_RULE_EVENTS[i]), value).get("enabled", False):
         return ICON_CUSTOM
      return ICON_CONFIGURE if (rowIndex, i) == self.hoverCell else None

   def gear_data_func(self, column, renderer, model, it, i):
      renderer.set_property("icon-name", self.gear_icon(model.get_path(it).get_indices()[0], i))

   # The (row index, event index, path, column, gear renderer) of the shown gear at bin window x, y, or None
   def gear_at(self, x, y):
      hit = self.view.get_path_at_pos(x, y)
      if hit:
         path, column, cellX, cellY = hit
         for i, gear in self.gearRenderers.items():
            position = column.cell_get_position(gear)   # (start, width), or None if not in this column
            if position and position[0] <= cellX < position[0] + position[1]:
               rowIndex = path.get_indices()[0]
               if self.gear_icon(rowIndex, i) is not None:
                  return (rowIndex, i, path, column, gear)
      return None

   # A click on a gear opens its dialog, once GTK is idle: opening (and closing) it while the tree view is still
   # handling the click crashes GTK.
   def on_button_press(self, view, event):
      if event.button == 1 and event.type == Gdk.EventType.BUTTON_PRESS and event.window == view.get_bin_window():
         found = self.gear_at(int(event.x), int(event.y))
         if found:
            GLib.idle_add(self.open_gear_dialog, found[0], found[1])
            return True
      return False

   def open_gear_dialog(self, rowIndex, i):
      row = self.store[rowIndex]
      rule = row[self.COL_DATA]
      if not rule.get("id"):
         # The rule's first custom settings: give it an id for them to belong to
         rule = dict(rule)
         rule["id"] = uuid.uuid4().hex[:12]
         row[self.COL_DATA] = rule
         self.save()
      event = APP_RULE_EVENTS[i]
      value = row[self.COL_EFFECT + i]
      title = f"{row[self.COL_APP] or self.title('application', _('Application'))} {self.title(event, event.capitalize())}: {self.effect_label(event, value)}"
      dialog = EffectSettingsDialog(self.get_toplevel(), self.settings, app_rule_scope(rule["id"], event), value, title)
      dialog.run()
      dialog.destroy()
      self.view.queue_draw()
      return GLib.SOURCE_REMOVE

   # The (row index, event index) of the effect cell under the pointer, or None
   def cell_at(self, event):
      x, y = int(event.x), int(event.y)
      if event.window != self.view.get_bin_window():
         x, y = self.view.convert_widget_to_bin_window_coords(x, y)
      hit = self.view.get_path_at_pos(x, y)
      if hit:
         i = self.view.get_columns().index(hit[1]) - 1   # The first column is Enabled
         if 0 <= i < len(APP_RULE_EVENTS):
            return (hit[0].get_indices()[0], i)
      return None

   def on_motion(self, view, event):
      cell = self.cell_at(event)
      if cell != self.hoverCell:
         self.hoverCell = cell
         self.view.queue_draw()
      return False

   def on_leave(self, view, event):
      if self.hoverCell is not None:
         self.hoverCell = None
         self.view.queue_draw()
      return False

   def on_query_tooltip(self, view, x, y, keyboard, tooltip):
      found, x, y, model, path, it = view.get_tooltip_context(x, y, keyboard)   # x, y are now bin window coordinates
      if found and not keyboard:
         gear = self.gear_at(x, y)
         if gear:
            rowIndex, i, path, column, renderer = gear
            tooltip.set_text(_("Custom settings are in use for this effect") if self.gear_icon(rowIndex, i) == ICON_CUSTOM
                             else _("Configure custom settings for this effect"))
            view.set_tooltip_cell(tooltip, path, column, renderer)
            return True
      if self.listTooltip:
         tooltip.set_text(self.listTooltip)
         return True
      return False

patch_revealer()
