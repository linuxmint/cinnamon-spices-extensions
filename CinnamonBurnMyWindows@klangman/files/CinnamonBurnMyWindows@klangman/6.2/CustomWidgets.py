#!/usr/bin/python3

import os
import random
import math
import gi
import re

import JsonSettingsWidgets
from JsonSettingsWidgets import *
from gi.repository import Gio, Gtk, Gdk, GLib

gi.require_version('GSound', '1.0')
from gi.repository import GSound

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
   super(JSONSettingsRevealer, self).__init__()
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

      UUID = "CinnamonBurnMyWindows@klangman"
      extensions_path  = GLib.get_home_dir() + "/.local/share/cinnamon/extensions/"

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
         newList.append( {"name": element["name"], "open": True, "close": True, "minimize": True, "unminimize": True} )
      self.settings.set_value("random-include", newList)

   def _on_clear_button_clicked(self, *args):
      lst = self.settings.get_value("random-include")
      newList = []
      for element in lst:
         newList.append( {"name": element["name"], "open": False, "close": False, "minimize": False, "unminimize": False} )
      self.settings.set_value("random-include", newList)

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
