#!/usr/bin/python3

import random
import math
import gi
import re

import JsonSettingsWidgets
from JsonSettingsWidgets import *
from gi.repository import Gio, Gtk, Gdk, GLib

OPERATIONS = ['<=', '>=', '<', '>', '!=', '=']

OPERATIONS_MAP = {'<': operator.lt, '<=': operator.le, '>': operator.gt, '>=': operator.ge, '!=': operator.ne, '=': operator.eq}

def is_number(s):
   try:
      float(s)  # Try converting to a float
      return True
   except ValueError:
      return False

def get_value(settings, string):
   if settings.has_key(string):
      value = settings.get_value(string)
   elif is_number(string):
      value = float(string);
   elif string.lower() == 'true':
      value = True
   elif string.lower() == "false":
      value = False
   else:
      value = string
   return value;

def customRevealerInit(self, settings, key):
   super(JSONSettingsRevealer, self).__init__()
   self.settings = settings

   # Split the dependencies into a list of keys, operations and constants
   expression = re.split(r'(!=|<=|>=|[<>=&|])', key)
   # Remove any blank entries and any whitespace within entries
   self.expression = [item.strip() for item in expression if item.strip()]
   # Listen to any keys found in the expression
   for element in expression:
      element = element.strip()
      if element[0] == '!':
         element = element[1:]
      if settings.has_key(element):
         #print( f"listening for changes to key \"{element}\"" )
         self.settings.listen(element, self.key_changed)

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
   # Go through the expression to evaluate all the elements except "and" and "or"s
   for idx, element in enumerate(self.expression):
      if element == '&' or element == '|':
         evaluate.append( element )
      elif element in OPERATIONS:  # ... x op y ...
         lhs = get_value(self.settings, self.expression[idx-1])
         if idx+1 < count and self.expression[idx+1] != '&' and self.expression[idx+1] != '|':
            rhs = get_value(self.settings, self.expression[idx+1])
         else: # We were not provided with a valid rhs, set rhs to False
            rhs = False
         #print( f"operation: {self.expression[idx-1]}/{lhs} {OPERATIONS_MAP[element]} {self.expression[idx+1]}/{rhs}" )
         evaluate.append( OPERATIONS_MAP[element](lhs, rhs) )
      elif element[0] == '!':      # ... !key ...
         key = element[1:]
         if self.settings.has_key(key):
            value = self.settings.get_value(key)
            evaluate.append( not value )
         else:
            print( f"Error in json: \"{key}\" is not a valid key" )
      elif (idx == 0 or self.expression[idx-1] not in OPERATIONS) and (idx == count-1 or self.expression[idx+1] not in OPERATIONS):  #  ... [&/|] key [&/|] ...
         if self.settings.has_key(self.expression[idx]):
            value = self.settings.get_value(element)
            evaluate.append( value == True )
         else:
            print( f"Error in json: \"{self.expression[idx]}\" is not a valid key" )
   #print( f"After compare: {evaluate}" )
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
   #print( f"Showing widget: {evaluate[0]}" )
   self.set_reveal_child(evaluate[0])


class LabelWithTooltip(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"])

      self.label.set_alignment(0.0, 0.5)
      self.label.set_line_wrap(True)
      self.pack_start(self.label, True, True, 0)
      if "tooltip" in info:
         self.label.set_tooltip_text(info["tooltip"])

# An About page Widget with an image and a centered label that supports markup
class About(SettingsWidget):
   def __init__(self, info, key, settings):
      SettingsWidget.__init__(self)
      self.key = key
      self.settings = settings
      self.info = info

      UUID = "BlurCinnamon@klangman"
      extensions_path  = GLib.get_home_dir() + "/.local/share/cinnamon/extensions/"

      self.box = Gtk.Box(spacing=10,orientation=Gtk.Orientation.VERTICAL,margin_start=20, margin_end=20, margin_top=20, margin_left=20, margin_right=20)
      self.label = Gtk.Label("", xalign=0.5, justify=Gtk.Justification.CENTER, expand=True)
      self.label.set_markup(info["description"].replace("ext-version", settings.get_value("ext-version")))
      self.image = Gtk.Image.new_from_file(extensions_path + UUID + info["icon"])
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

        # Monkey patch the JSONSettingsRevealer to use our custom methods which allows for "and" and "or" dependency operations
        # This is the earliest point in the xlet-setting program that I can find to do this patching. Hopefully it's early enough!
        # It does mean that we need to have a "CompactScale" instance without dependencies before any widgets with dependencies
        if JsonSettingsWidgets.JSONSettingsRevealer.__init__ != customRevealerInit:
           print( "Monkey patching JSONSettingsRevealer methods" )
           JsonSettingsWidgets.JSONSettingsRevealer.__init__ = customRevealerInit
           JsonSettingsWidgets.JSONSettingsRevealer.key_changed = customRevealerKeyChanged

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
