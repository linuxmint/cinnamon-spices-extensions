#!/usr/bin/python3

import os
import subprocess
import gettext
import sys
import json
import cgi
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gio, Gtk, GObject, GLib, GdkPixbuf

gettext.install("cinnamon", "/usr/share/locale")

CINNAMON_VERSION = GLib.getenv("CINNAMON_VERSION")
HOME = os.path.expanduser("~")
EXTENSION_DIR = os.path.dirname(os.path.abspath(__file__))
EXTENSION_UUID = str(os.path.basename(EXTENSION_DIR))
# NOTE TO SELF
# - Application identifiers must contain only the ASCII characters "A-Z[0-9]_-." and must not begin with a digit.
# - Application identifiers must contain at least one '.' (period) character (and thus at least three elements).
# - Application identifiers must not begin or end with a '.' (period) character.
# - Application identifiers must not contain consecutive '.' (period) characters.
# - Application identifiers must not exceed 255 characters.
# To which I add
# - Application identifiers must not contain a '.' (period) character next to a number. ¬¬
APPLICATION_ID = "org.cinnamon.extensions.odyseus-multi-translator-extension"
SCHEMA_NAME = "org.cinnamon.extensions.0dyseus@MultiTranslatorExtension"
SCHEMA_PATH = "/org/cinnamon/extensions/0dyseus@MultiTranslatorExtension/"
TRANSLATIONS = {}


def _(string):
    # check for a translation for this xlet
    if EXTENSION_UUID not in TRANSLATIONS:
        try:
            TRANSLATIONS[EXTENSION_UUID] = gettext.translation(
                EXTENSION_UUID, HOME + "/.local/share/locale").gettext
        except IOError:
            try:
                TRANSLATIONS[EXTENSION_UUID] = gettext.translation(
                    EXTENSION_UUID, "/usr/share/locale").gettext
            except IOError:
                TRANSLATIONS[EXTENSION_UUID] = None

    # do not translate white spaces
    if not string.strip():
        return string

    if TRANSLATIONS[EXTENSION_UUID]:
        result = TRANSLATIONS[EXTENSION_UUID](string)

        try:
            result = result.decode("utf-8")
        except:
            result = result

        if result != string:
            return result

    return gettext.gettext(string)


EXTENSION_NAME = _("Multi Translator")

LANGUAGES_LIST = {
    "auto": _("Detect language"),
    "af": _("Afrikaans"),
    "am": _("Amharic"),
    "ar": _("Arabic"),
    "az": _("Azerbaijani"),
    "be": _("Belarusian"),
    "bg": _("Bulgarian"),
    "bn": _("Bengali"),
    "bs": _("Bosnian (Y)"),
    "ca": _("Catalan"),
    "ceb": _("Chichewa"),
    "co": _("Corsican"),
    "cs": _("Czech"),
    "cy": _("Welsh"),
    "da": _("Danish"),
    "de": _("German"),
    "el": _("Greek"),
    "en": _("English"),
    "eo": _("Esperanto"),
    "es": _("Spanish"),
    "et": _("Estonian"),
    "eu": _("Basque"),
    "fa": _("Persian"),
    "fi": _("Finnish"),
    "fr": _("French"),
    "fy": _("Frisian"),
    "ga": _("Irish"),
    "gd": _("Scots Gaelic"),
    "gl": _("Galician"),
    "gu": _("Gujarati"),
    "ha": _("Hausa"),
    "haw": _("Hawaiian"),
    "he": _("Hebrew (Y)"),
    "hi": _("Hindi"),
    "hmn": _("Hmong"),
    "hr": _("Croatian"),
    "ht": _("Haitian Creole"),
    "hu": _("Hungarian"),
    "hy": _("Armenian"),
    "id": _("Indonesian"),
    "ig": _("Igbo"),
    "is": _("Icelandic"),
    "it": _("Italian"),
    "iw": _("Hebrew"),
    "ja": _("Japanese"),
    "jw": _("Javanese"),
    "ka": _("Georgian"),
    "kk": _("Kazakh"),
    "km": _("Khmer"),
    "kn": _("Kannada"),
    "ko": _("Korean"),
    "ku": _("Kurdish (Kurmanji)"),
    "ky": _("Kyrgyz"),
    "la": _("Latin"),
    "lb": _("Luxembourgish"),
    "lo": _("Lao"),
    "lt": _("Lithuanian"),
    "lv": _("Latvian"),
    "mg": _("Malagasy"),
    "mi": _("Maori"),
    "mk": _("Macedonian"),
    "ml": _("Malayalam"),
    "mn": _("Mongolian"),
    "mr": _("Marathi"),
    "ms": _("Malay"),
    "mt": _("Maltese"),
    "my": _("Myanmar (Burmese)"),
    "ne": _("Nepali"),
    "nl": _("Dutch"),
    "no": _("Norwegian"),
    "ny": _("Cebuano"),
    "pa": _("Punjabi"),
    "pl": _("Polish"),
    "ps": _("Pashto"),
    "pt": _("Portuguese"),
    "ro": _("Romanian"),
    "ru": _("Russian"),
    "sd": _("Sindhi"),
    "si": _("Sinhala"),
    "sk": _("Slovak"),
    "sl": _("Slovenian"),
    "sm": _("Samoan"),
    "sn": _("Shona"),
    "so": _("Somali"),
    "sq": _("Albanian"),
    "sr": _("Serbian"),
    "st": _("Sesotho"),
    "su": _("Sundanese"),
    "sv": _("Swedish"),
    "sw": _("Swahili"),
    "ta": _("Tamil"),
    "te": _("Telugu"),
    "tg": _("Tajik"),
    "th": _("Thai"),
    "tl": _("Filipino"),
    "tr": _("Turkish"),
    "uk": _("Ukrainian"),
    "ur": _("Urdu"),
    "uz": _("Uzbek"),
    "vi": _("Vietnamese"),
    "xh": _("Xhosa"),
    "yi": _("Yiddish"),
    "yo": _("Yoruba"),
    "zh": _("Chinese (Y)"),
    "zh-CN": _("Chinese Simplified"),
    "zh-TW": _("Chinese Traditional"),
    "zu": _("Zulu")
}

# Doesn't go anywhere
# last-translator
# all-dependencies-met
# languages-stats


MAIN_TAB = {
    "title": _("Global"),
    "sections": [{
        "title": _("Global extension options"),
        "widgets": [{
            "type": "combo",
            "args": {
                "key": "default-translator",
                "label": _("Default translation provider"),
                "tooltip": _("Select the default translation provider.") + "\n" +
                _("Providers marked with (*) require translate-shell package to work.") + "\n" +
                _("See the extended help of this extension for more information."),
                "values": {
                    "Apertium.TS": "Apertium (*)",
                    "Bing.TranslatorTS": "Bing Translator (*)",
                    "Google.TranslateTS": "Google Translate (*)",
                    "Google.Translate": "Google Translate",
                    "Transltr": "Transltr",
                    "Yandex.Translate": "Yandex Translate"
                }
            }
        }, {
            "type": "switch",
            "args": {
                "key": "remember-last-translator",
                "label": _("Remember last translator"),
                "tooltip": _("Remember last used translation provider.")
            }
        }, {
            "type": "switch",
            "args": {
                "key": "keep-source-entry-text-selected",
                "label": _("Keep source entry text selected"),
                "tooltip": _("Keep source entry text selected whenever the translation dialog is opened and the source entry box contains text.")
            }
        }, {
            "type": "switch",
            "args": {
                "key": "show-most-used",
                "label": _("Show most used languages"),
                "tooltip": _("Display a list of most used languages.")
            }
        }, {
            "type": "switch",
            "args": {
                "key": "sync-entries-scrolling",
                "label": _("Synchronize scroll entries"),
                "tooltip": _("Make the source and target entries scroll synchronously.")
            }
        }, {
            "type": "switch",
            "args": {
                "key": "enable-shortcuts",
                "label": _("Enable shortcuts"),
                "tooltip": _("Enable/Disable the use of keyboard shortcuts.")
            }
        }, {
            "type": "keybindings_tree",
            "dep_key": "enable-shortcuts",
            "args": {
                "keybindings": {
                    "open-translator-dialog-keybinding": _("Open translator dialog"),
                    "translate-from-clipboard-keybinding": _("Translate text from clipboard"),
                    "translate-from-selection-keybinding": _("Translate from primary selection")
                }
            }
        }]
    }]
}

TRANSLATORS_TAB = {
    "title": _("Translators"),
    "sections": [{
        "title": _("Set default settings for each available translation service"),
        "widgets": [{
            "type": "translators_prefs_widget",
            "args": {
                "key": "translators-prefs"
            }
        }]
    }]
}

APPEARANCE_TAB = {
    "title": _("Appearance"),
    "sections": [{
        "title": _("Translation dialog appearance"),
        "widgets": [{
            "type": "combo",
            "args": {
                "key": "dialog-theme",
                "label": _("Dialog theme"),
                "tooltip": _("Select a theme for the translation dialog."),
                "values": {
                    "custom": _("Custom"),
                    "default": "Linux Mint (%s)" % _("Default"),
                    "Gnome-shell": "Gnome shell",
                    "Mint-X": "Mint-X",
                    "Mint-X-Aqua": "Mint-X-Aqua",
                    "Mint-X-Blue": "Mint-X-Blue",
                    "Mint-X-Brown": "Mint-X-Brown",
                    "Mint-X-Greybird-Blue": "Mint-X-Greybird-Blue",
                    "Mint-X-Orange": "Mint-X-Orange",
                    "Mint-X-Pink": "Mint-X-Pink",
                    "Mint-X-Purple": "Mint-X-Purple",
                    "Mint-X-Red": "Mint-X-Red",
                    "Mint-X-Sand": "Mint-X-Sand",
                    "Mint-X-Teal": "Mint-X-Teal",
                    "Thunderbolt": "Thunderbolt"
                }
            }
        }, {
            "type": "entry_path",
            "args": {
                "key": "dialog-theme-custom",
                "select_dir": False,
                "label": _("Custom theme"),
                "tooltip": _("Select a custom theme for the translation dialog."),
            }
        }, {
            "type": "spin",
            "args": {
                "key": "font-size",
                "label": _("Font size"),
                "tooltip": _("Select a font size for the source text and target text entries."),
                "min": 8,
                "max": 32,
                "step": 1,
                "units": _("pixels")
            }
        }, {
            "type": "spin",
            "args": {
                "key": "width-percents",
                "label": _("Percentage of screen width"),
                "tooltip": _("What percentage of screen width should the translation dialog fill."),
                "min": 20,
                "max": 100,
                "step": 5,
                "units": _("percentage")
            }
        }, {
            "type": "spin",
            "args": {
                "key": "height-percents",
                "label": _("Percentage of screen height"),
                "tooltip": _("What percentage of screen height should the translation dialog fill."),
                "min": 20,
                "max": 100,
                "step": 5,
                "units": _("percentage")
            }
        }]
    }]
}

HISTORY_TAB = {
    "title": _("History"),
    "sections": [{
        "title": _("Translation history settings"),
        "widgets": [{
            "type": "combo",
            "args": {
                "key": "history-timestamp",
                "label": _("Timestamp for history entries"),
                "tooltip": _("Timestamp format for the translation history entries.\nNote: After changing this setting, only new entries in the translation history will be saved with the new timestamp format. Old entries will still have the previous timestamp format."),
                "values": {
                    "custom": _("Custom"),
                    "iso": "YYYY MM-DD hh:mm:ss (ISO8601)",
                    "eu": "YYYY DD-MM hh:mm:ss (%s)" % _("European")
                }
            }
        }, {
            "type": "entry",
            "args": {
                "key": "history-timestamp-custom",
                "label": _("Custom timestamp"),
                # TO TRANSLATORS: The following strings shouldn't be translated:
                # YYYY, MM, DD, hh, mm and ss.
                "tooltip": _("Choose a custom timestamp for the translation history entries.\nYYYY: year\nMM: month\nDD: day\nhh: hours\nmm: minutes\nss: seconds")
            }
        }, {
            "type": "spin",
            "args": {
                "key": "history-initial-window-width",
                "label": _("History window initial width"),
                "min": 400,
                "max": 2048,
                "step": 50,
                "units": _("pixels")
            }
        }, {
            "type": "spin",
            "args": {
                "key": "history-initial-window-height",
                "label": _("History window initial height"),
                "min": 400,
                "max": 2048,
                "step": 50,
                "units": _("pixels")
            }
        }, {
            "type": "spin",
            "args": {
                "key": "history-width-to-trigger-word-wrap",
                "label": _("Width to trigger word wrap"),
                "tooltip": _("The \"Source text\" and \"Target text\" columns on the history window will wrap its text at the width defined by this setting."),
                "min": 100,
                "max": 1024,
                "step": 10,
                "units": _("pixels")
            }
        }]
    }]
}

ADVANCED_TAB = {
    "title": _("Advanced"),
    "sections": [{
        "title": _("Various advanced options"),
        "widgets": [{
            "type": "textview",
            "args": {
                    "key": "yandex-api-keys",
                    "height": 150,
                    "label": _("Yandex API keys"),
                    "tooltip": _("Enter one API key per line.\nRead the help file found inside this extension folder to know how to get free Yandex API keys.")
            }
        }, {
            "type": "info_label",
            "args": {
                "label": _("This options are only useful for the extension developer."),
                "bold": True,
                "italic": True
            }
        }, {
            "type": "switch",
            "args": {
                "key": "loggin-enabled",
                "label": _("Enable logging"),
                "tooltip": _("It enables the ability to log the output of several functions used by the extension.")
            }
        }, {
            "type": "switch",
            "args": {
                "key": "loggin-save-history-indented",
                "label": _("Indent translation history data"),
                "tooltip": _("It allows to save the translation history data with indentation.")
            }
        }]
    }]
}


class BaseGrid(Gtk.Grid):

    def __init__(self, tooltip="", orientation=Gtk.Orientation.VERTICAL):
        Gtk.Grid.__init__(self)
        self.set_orientation(orientation)
        self.set_tooltip_text(tooltip)

    def set_spacing(self, col, row):
        self.set_column_spacing(col)
        self.set_row_spacing(row)


class SettingsLabel(Gtk.Label):

    def __init__(self, text=None, markup=None):
        Gtk.Label.__init__(self)
        if text:
            self.set_label(text)

        if markup:
            self.set_markup(markup)

        self.set_alignment(0.0, 0.5)
        self.set_line_wrap(True)

    def set_label_text(self, text):
        self.set_label(text)

    def set_label_markup(self, markup):
        self.set_markup(markup)


class SectionContainer(Gtk.Frame):

    def __init__(self, title):
        Gtk.Frame.__init__(self)
        self.set_shadow_type(Gtk.ShadowType.IN)

        self.box = BaseGrid()
        self.box.set_border_width(0)
        self.box.set_property("margin", 0)
        self.box.set_spacing(0, 0)
        self.add(self.box)

        toolbar = Gtk.Toolbar()
        Gtk.StyleContext.add_class(Gtk.Widget.get_style_context(toolbar), "cs-header")

        label = Gtk.Label()
        label.set_markup("<b>%s</b>" % title)
        title_holder = Gtk.ToolItem()
        title_holder.add(label)
        toolbar.add(title_holder)
        self.box.attach(toolbar, 0, 0, 2, 1)

        self.need_separator = False

    def add_row(self, widget, col_pos, row_pos, col_span, row_span):
        list_box = Gtk.ListBox()
        list_box.set_selection_mode(Gtk.SelectionMode.NONE)
        row = Gtk.ListBoxRow()
        row.add(widget)

        if self.need_separator:
            list_box.add(Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL))

        if isinstance(widget, Switch):
            list_box.connect("row-activated", widget.clicked)

        list_box.add(row)

        self.box.attach(list_box, col_pos, row_pos, col_span, row_span)

        self.need_separator = True


class SettingsBox(BaseGrid):

    def __init__(self):
        BaseGrid.__init__(self)
        self.set_border_width(0)
        self.set_spacing(0, 0)
        self.set_property("expand", True)
        self.set_property("margin", 0)

        pages_object = [
            MAIN_TAB,
            TRANSLATORS_TAB,
            APPEARANCE_TAB,
            HISTORY_TAB,
            ADVANCED_TAB
        ]

        stack = Gtk.Stack()
        stack.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT)
        stack.set_transition_duration(150)
        stack.set_property("margin", 0)
        stack.set_property("expand", True)

        page_count = 0
        for page_obj in pages_object:
            # Possibility to hide entire pages
            try:
                if page_obj["compatible"] is False:
                    continue
            except KeyError:  # If "compatible" key isn't set.
                pass

            page = BaseGrid()
            page.set_spacing(15, 15)
            page.set_property("expand", True)
            page.set_property("margin-top", 15)
            page.set_property("margin-left", 15)
            page.set_property("margin-right", 15)
            page.set_border_width(0)

            section_count = 0
            for section_obj in page_obj["sections"]:
                # Possibility to hide entire sections
                try:
                    if section_obj["compatible"] is False:
                        continue
                except KeyError:  # If "compatible" key isn't set.
                    pass

                section_container = SectionContainer(section_obj["title"])

                SECTION_WIDGETS = section_obj["widgets"]

                row_pos = 1
                for i in range(0, len(SECTION_WIDGETS)):
                    section_widget_obj = SECTION_WIDGETS[i]

                    # Possibility to hide individual widgets
                    try:
                        if section_widget_obj["compatible"] is False:
                            continue
                    except KeyError:  # If "compatible" key isn't set.
                        pass

                    widget_obj = getattr(Widgets, section_widget_obj["type"])
                    widget = widget_obj(Widgets(), **section_widget_obj["args"])

                    if (section_widget_obj["type"] is not "keybindings_tree" and
                            section_widget_obj["type"] is not "translators_prefs_widget"):

                        widget.set_border_width(5)
                        widget.set_margin_left(15)
                        widget.set_margin_right(15)

                    try:
                        dep_key = section_widget_obj["dep_key"]

                        if Settings().settings_has_key(dep_key):
                            Settings().get_settings().bind(
                                dep_key, widget, "sensitive", Gio.SettingsBindFlags.GET)
                        else:
                            print(
                                "Ignoring dependency on key '%s': no such key in the schema" % dep_key)
                    except (NameError, KeyError):
                        pass

                    section_container.add_row(widget, 0, i + 1, 1, 1)

                if section_count is not 0:
                    row_pos = len(SECTION_WIDGETS) + row_pos
                else:
                    row_pos = row_pos

                page.attach(section_container, 0, row_pos, 1, 1)
                row_pos += 1
                section_count += 1

            page_count += 1
            stack.add_titled(page, "stack_id_%s" % str(page_count), page_obj["title"])

        stack_switcher = Gtk.StackSwitcher()
        stack_switcher.set_stack(stack)
        stack_switcher.set_halign(Gtk.Align.CENTER)
        stack_switcher.set_homogeneous(False)
        app.toolbar_box.attach(stack_switcher, 1, 0, 1, 1)

        self.attach(stack, 0, 0, 1, 1)

        self.show_all()


class Settings(object):

    ''' Get settings values using gsettings '''

    _settings = None

    def __new__(cls, *p, **k):
        ''' Implementation of the borg pattern
        This way we make sure that all instances share the same state
        and that the schema is read from file only once.
        '''
        if "_the_instance" not in cls.__dict__:
            cls._the_instance = object.__new__(cls)
        return cls._the_instance

    def set_settings(self, schema_name):
        ''' Get settings values from corresponding schema file '''

        # Try to get schema from local installation directory
        schemas_dir = "%s/schemas" % EXTENSION_DIR
        if os.path.isfile("%s/gschemas.compiled" % schemas_dir):
            schema_source = Gio.SettingsSchemaSource.new_from_directory(
                schemas_dir, Gio.SettingsSchemaSource.get_default(), False)
            schema = schema_source.lookup(schema_name, False)
            self._settings = Gio.Settings.new_full(schema, None, None)
        # Schema is installed system-wide
        else:
            self._settings = Gio.Settings.new(schema_name)

    def get_settings(self):
        return self._settings

    def settings_has_key(self, key):
        return key in self.get_settings().list_keys()


class Widgets():

    ''' Build widgets associated with gsettings values '''

    def info_label(self, label, bold=False, italic=True):
        ''' Styled label widget widget '''
        box = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        label_str = cgi.escape(label)

        if bold:
            label_str = "<b>%s</b>" % label_str

        if italic:
            label_str = "<i>%s</i>" % label_str

        label_element = SettingsLabel(label_str)
        label_element.set_use_markup(True)
        label_element.set_property("hexpand", True)
        label_element.set_property("halign", Gtk.Align.START)
        box.attach(label_element, 0, 0, 1, 1)
        return box

    def switch(self, key, label, tooltip=""):
        return Switch(key, label, tooltip)

    def entry_path(self, key, label, select_dir, tooltip=""):
        return FileChooser(key, label, select_dir, tooltip)

    def entry(self, key, label, tooltip=""):
        ''' Entry text widget '''
        box = BaseGrid(tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        label = SettingsLabel(label)
        label.set_property("hexpand", False)
        label.set_property("halign", Gtk.Align.START)
        widget = Gtk.Entry()
        widget.set_property("hexpand", True)
        widget.set_text(Settings().get_settings().get_string(key))
        widget.connect("changed", self._entry_change, key)
        box.attach(label, 0, 0, 1, 1)
        box.attach(widget, 1, 0, 1, 1)
        return box

    def _entry_change(self, widget, key):
        Settings().get_settings().set_string(key, widget.get_text())

    def combo(self, key, label, values, tooltip=""):
        ''' Combo box widget '''
        box = BaseGrid(tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        label = SettingsLabel(label)
        label.set_property("hexpand", True)
        label.set_property("halign", Gtk.Align.START)
        widget = Gtk.ComboBoxText()
        widget.set_property("halign", Gtk.Align.END)

        for command, name in sorted(values.items()):
            widget.append(command, name)

        widget.set_active_id(Settings().get_settings().get_string(key))
        widget.connect("changed", self._combo_change, key)
        box.attach(label, 0, 0, 1, 1)
        box.attach(widget, 1, 0, 1, 1)
        return box

    def _combo_change(self, widget, key):
        Settings().get_settings().set_string(key, widget.get_active_id())

    def slider(self, key, label, min, max, step, tooltip=""):
        ''' Slider widget '''
        box = BaseGrid(tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        label = SettingsLabel(label)
        label.set_property("hexpand", False)
        label.set_property("halign", Gtk.Align.START)
        widget = Gtk.HScale.new_with_range(min, max, step)
        widget.set_value(Settings().get_settings().get_int(key))
        widget.connect("value_changed", self._slider_change, key)
        widget.set_size_request(200, -1)
        widget.set_property("hexpand", True)
        widget.set_property("halign", Gtk.Align.END)
        box.attach(label, 0, 0, 1, 1)
        box.attach(widget, 1, 0, 1, 1)
        return box

    def _slider_change(self, widget, key):
        Settings().get_settings().set_int(key, widget.get_value())

    def spin(self, key, label, min, max, step, units, tooltip=""):
        ''' Spin widget '''
        if units:
            label += " (%s)" % units

        box = BaseGrid(tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        label = SettingsLabel(label)
        label.set_property("hexpand", True)
        label.set_property("halign", Gtk.Align.START)
        widget = Gtk.SpinButton.new_with_range(min, max, step)
        widget.set_value(Settings().get_settings().get_int(key))
        widget.connect("value-changed", self._spin_change, key)
        widget.set_editable(True)
        widget.set_property("halign", Gtk.Align.END)
        box.attach(label, 0, 0, 1, 1)
        box.attach(widget, 1, 0, 1, 1)
        return box

    def _spin_change(self, widget, key):
        Settings().get_settings().set_int(key, widget.get_value())

    def keybindings_tree(self, keybindings):
        ''' Keybinding tree widget '''
        return KeybindingsTreeViewWidget(keybindings)

    def translators_prefs_widget(self, key):
        ''' Translators prefs widget '''
        return TranslatorProvidersWidget(key)

    def textview(self, key, label, height=200, tooltip=""):
        ''' Textview widget '''
        box = BaseGrid(tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        label = SettingsLabel(label)
        label.set_property("hexpand", True)
        label.set_property("halign", Gtk.Align.CENTER)

        scrolledwindow = Gtk.ScrolledWindow(hadjustment=None, vadjustment=None)
        scrolledwindow.set_size_request(width=-1, height=height)
        scrolledwindow.set_policy(hscrollbar_policy=Gtk.PolicyType.AUTOMATIC,
                                  vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
        scrolledwindow.set_shadow_type(type=Gtk.ShadowType.ETCHED_IN)
        widget = Gtk.TextView()
        widget.set_editable(True)
        widget.set_border_width(3)
        widget.set_wrap_mode(wrap_mode=Gtk.WrapMode.NONE)
        text_buffer = widget.get_buffer()
        text_buffer.set_text(Settings().get_settings().get_string(key))
        text_buffer.connect("changed", self._textview_change, key, text_buffer)

        box.attach(label, 0, 0, 1, 1)
        box.attach(scrolledwindow, 0, 1, 1, 1)
        scrolledwindow.add(widget)
        return box

    def _textview_change(self, widget, key, text_buffer):
        start_iter = text_buffer.get_start_iter()
        end_iter = text_buffer.get_end_iter()
        text = text_buffer.get_text(start_iter, end_iter, True)

        Settings().get_settings().set_string(key, text)


class Switch(BaseGrid):

    ''' Switch widget '''

    def __init__(self, key, label, tooltip=""):
        BaseGrid.__init__(self, tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        self.set_spacing(10, 10)

        self.key = key
        self.label = SettingsLabel(label)
        self.label.set_property("hexpand", True)
        self.label.set_property("halign", Gtk.Align.START)
        self.switch = Gtk.Switch()
        self.switch.set_property("halign", Gtk.Align.END)
        self.switch.set_active(Settings().get_settings().get_boolean(key))
        self.switch.connect("notify::active", self._switch_change)
        self.attach(self.label, 0, 0, 1, 1)
        self.attach(self.switch, 1, 0, 1, 1)

    def clicked(self, *args):
        self.switch.set_active(not self.switch.get_active())

    def _switch_change(self, widget, notice):
        Settings().get_settings().set_boolean(self.key, self.switch.get_active())


class FileChooser(BaseGrid):

    ''' FileChooser widget '''

    def __init__(self, key, label, select_dir=False, tooltip=""):
        BaseGrid.__init__(self, tooltip=tooltip, orientation=Gtk.Orientation.HORIZONTAL)
        self.set_spacing(10, 10)

        self._select_dir = select_dir
        self._key = key

        self.label = SettingsLabel(label)
        self.entry = Gtk.Entry()
        self.entry.set_property("hexpand", True)
        self.button = Gtk.Button("")
        self.button.set_image(Gtk.Image().new_from_stock(Gtk.STOCK_OPEN, Gtk.IconSize.BUTTON))
        self.button.get_property("image").show()

        self.attach(self.label, 0, 1, 1, 1)
        self.attach(self.entry, 1, 1, 1, 1)
        self.attach(self.button, 2, 1, 1, 1)

        self.entry.set_text(Settings().get_settings().get_string(self._key))

        self.button.connect("clicked", self.on_button_pressed)
        self.handler = self.entry.connect("changed", self.on_entry_changed)
        self._value_changed_timer = None

    def on_button_pressed(self, widget):
        if self._select_dir:
            mode = Gtk.FileChooserAction.SELECT_FOLDER
            string = _("Select a directory to use")
        else:
            mode = Gtk.FileChooserAction.OPEN
            string = _("Select a file")
        dialog = Gtk.FileChooserDialog(parent=app.window,
                                       title=string,
                                       action=mode,
                                       # TO TRANSLATORS: Could be left blank.
                                       buttons=(_("_Cancel"), Gtk.ResponseType.CANCEL,
                                                # TO TRANSLATORS: Could be left blank.
                                                _("_Open"), Gtk.ResponseType.OK))
        if self._select_dir:
            filt = Gtk.FileFilter()
            filt.set_name(_("Directories"))
            filt.add_custom(Gtk.FileFilterFlags.FILENAME, self.filter_func, None)
            dialog.add_filter(filt)

        dialog.set_filename(Settings().get_settings().get_string(self._key))
        response = dialog.run()

        if response == Gtk.ResponseType.OK:
            filename = dialog.get_filename()
            self.entry.set_text(filename)
            Settings().get_settings().set_string(self._key, filename)

        dialog.destroy()

    def filter_func(chooser, info, data):
        return os.path.isdir(info.filename)

    def on_entry_changed(self, widget):
        if self._value_changed_timer:
            GObject.source_remove(self._value_changed_timer)
        self._value_changed_timer = GObject.timeout_add(300, self.update_from_entry)

    def update_from_entry(self):
        Settings().get_settings().set_string(self._key, self.entry.get_text())
        self._value_changed_timer = None
        return False


class KeybindingsTreeViewWidget(BaseGrid):

    ''' KeybindingsTreeViewWidget tree widget '''

    def __init__(self, keybindings):
        BaseGrid.__init__(self)
        self.set_orientation(Gtk.Orientation.VERTICAL)
        self._keybindings = keybindings

        self._columns = type("", (), {
            "NAME": 0,
            "ACCEL_NAME": 1,
            "MODS": 2,
            "KEY": 3,
        })

        self._store = Gtk.ListStore(str, str, int, int)
        self._tree_view = Gtk.TreeView()
        self._tree_view.props.has_tooltip = True
        self._tree_view.set_hover_selection(True)
        self._tree_view.connect("query-tooltip", self._on_query_tooltip)
        self._tree_view.set_activate_on_single_click(True)
        self._tree_view.set_grid_lines(Gtk.TreeViewGridLines.BOTH)
        self._tree_view.set_property("model", self._store)
        self._tree_view.set_property("hexpand", True)
        self._tree_view.set_property("vexpand", True)
        self._tree_view.set_enable_tree_lines(True)
        self._tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE)

        action_renderer = Gtk.CellRendererText()
        action_renderer.set_property("xpad", 15)
        action_column = Gtk.TreeViewColumn()
        action_column.set_property("title", _("Shortcut action"))
        action_column.set_alignment(0.5)
        action_column.set_property("expand", True)
        action_column.pack_start(action_renderer, True)
        action_column.add_attribute(action_renderer, "text", 1)
        self._tree_view.append_column(action_column)

        keybinding_renderer = Gtk.CellRendererAccel()
        keybinding_renderer.set_property("xpad", 15)
        keybinding_renderer.set_property("editable", True)
        keybinding_renderer.set_property("accel-mode", Gtk.CellRendererAccelMode.GTK)
        keybinding_renderer.connect("accel-edited", self.on_shortcut_key_cell_edited)

        keybinding_column = Gtk.TreeViewColumn()
        keybinding_column.set_property("title", _("Shortcut"))
        keybinding_column.set_alignment(0.5)
        keybinding_column.pack_end(keybinding_renderer, False)
        keybinding_column.add_attribute(keybinding_renderer, "accel-mods", self._columns.MODS)
        keybinding_column.add_attribute(keybinding_renderer, "accel-key", self._columns.KEY)
        self._tree_view.append_column(keybinding_column)

        self.attach(self._tree_view, 0, 0, 1, 1)

        self._refresh()

    def _on_query_tooltip(self, widget, x, y, keyboard_tip, tooltip):
        if not widget.get_tooltip_context(x, y, keyboard_tip):
            return False
        else:
            ctx = widget.get_tooltip_context(x, y, keyboard_tip)
            tooltip.set_text(_("Click to set a new hotkey."))
            widget.set_tooltip_cell(tooltip, ctx.path, widget.get_column(1), None)
            return True

    def on_shortcut_key_cell_edited(self, accel, path, key, mod, hardware_keycode):
        accel_key = Gtk.accelerator_name(key, mod)
        name = self._store[path][self._columns.NAME]
        self._store[path][3] = key
        self._store[path][2] = mod
        Settings().get_settings().set_strv(name, [accel_key])

    def _refresh(self):
        self._store.clear()

        for settings_key in sorted(self._keybindings):
            [key, mods] = Gtk.accelerator_parse(
                Settings().get_settings().get_strv(settings_key)[self._columns.NAME]
            )

            iter = self._store.append()
            self._store.set(iter, [
                self._columns.NAME,
                self._columns.ACCEL_NAME,
                self._columns.MODS,
                self._columns.KEY
            ], [
                settings_key,
                self._keybindings[settings_key],
                mods,
                key
            ])


class TranslatorProvidersWidget(BaseGrid):

    ''' TranslatorProvidersWidget tree widget '''

    def __init__(self, key):
        BaseGrid.__init__(self)
        self.set_orientation(Gtk.Orientation.VERTICAL)
        self.set_row_spacing(0)

        self._pref_key = key
        self._prefs = json.loads(Settings().get_settings().get_string(key))

        names = list(sorted(self._prefs.keys()))

        # translators
        self._translators_combo = self._get_combo(names)
        self._translators_combo.set_property("hexpand", True)
        self._translators_combo.set_active_id(
            Settings().get_settings().get_string("default-translator"))
        self._translators_combo.connect("changed", self._on_translators_combo_changed)
        self.translators_box = self._get_listbox_container()
        self.translators_box_container = self._get_listbox(self.translators_box)
        self.translators_box.attach(self._translators_combo, 0, 0, 2, 1)
        self.attach(self.translators_box_container, 0, 0, 2, 1)

        # default source
        self._source_languages_combo = self._get_combo([])
        label = SettingsLabel()
        label.set_property("label", _("Default source language:"))
        label.set_property("hexpand", True)
        label.set_property("halign", Gtk.Align.START)
        self.source_box = self._get_listbox_container()
        self.source_box_container = self._get_listbox(self.source_box,
                                                      need_separator=True)
        self.source_box.attach(label, 0, 1, 1, 1)
        self.attach(self.source_box_container, 0, 1, 2, 1)

        # default target
        self._target_languages_combo = self._get_combo([])
        label = SettingsLabel()
        label.set_property("label", _("Default target language:"))
        label.set_property("hexpand", True)
        label.set_property("halign", Gtk.Align.START)
        self.target_box = self._get_listbox_container()
        self.target_box_container = self._get_listbox(self.target_box,
                                                      need_separator=True)
        self.target_box.attach(label, 0, 1, 1, 1)
        self.attach(self.target_box_container, 0, 2, 2, 1)

        # remember last lang
        label = SettingsLabel()
        label.set_property("label", _("Remember the last used languages:"))
        label.set_property("hexpand", True)
        label.set_property("halign", Gtk.Align.START)
        self._last_used = Gtk.Switch()
        self._last_used.set_property("halign", Gtk.Align.END)
        self._last_used.set_property("hexpand", False)
        self._last_used.set_property("active", False)
        self._last_used.connect("notify::active", self._notify_active)
        self.remember_last_lang_box = self._get_listbox_container()
        self.remember_last_lang_box_container = self._get_listbox(self.remember_last_lang_box,
                                                                  need_separator=True)
        self.remember_last_lang_box.attach(label, 0, 1, 1, 1)
        self.remember_last_lang_box.attach(self._last_used, 1, 1, 1, 1)
        self.attach(self.remember_last_lang_box_container, 0, 3, 2, 1)

        self._show_settings(Settings().get_settings().get_string("default-translator"))

    def _get_listbox_container(self):
        box = BaseGrid()
        box.set_border_width(5)
        box.set_margin_left(15)
        box.set_margin_right(15)
        box.set_property("hexpand", True)

        return box

    def _get_listbox(self, widget, need_separator=False):
        list_box = Gtk.ListBox()
        list_box.set_selection_mode(Gtk.SelectionMode.NONE)
        row = Gtk.ListBoxRow()
        row.add(widget)

        if need_separator:
            list_box.add(Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL))

        list_box.add(row)

        return list_box

    def _get_combo(self, items):
        combo_box = Gtk.ComboBoxText()

        for i in range(0, len(items)):
            combo_box.insert(-1, items[i], items[i])

        return combo_box

    def _load_default_source(self, languages, active_id):
        self._source_languages_combo.destroy()

        self._source_languages_combo = Gtk.ComboBoxText()
        self._source_languages_combo.connect("changed", self._on_source_languages_combo_changed)

        self._source_languages_combo.insert(-1, "auto", languages["auto"])

        for key in sorted(languages, key=languages.get):
            if key is not "auto":
                self._source_languages_combo.insert(-1, key, languages[key])

        if active_id == -1:
            active_id = list(languages)[0]

        self._source_languages_combo.set_active_id(active_id)

        source_wrap_width = int(round(len(languages) / 17))

        if source_wrap_width > 1:
            self._source_languages_combo.set_wrap_width(source_wrap_width)

        self._source_languages_combo.show()

        self.source_box.attach(self._source_languages_combo, 1, 1, 1, 1)

    def _load_default_target(self, languages, active_id):
        self._target_languages_combo.destroy()

        self._target_languages_combo = Gtk.ComboBoxText()
        self._target_languages_combo.connect("changed", self._on_target_languages_combo_changed)

        for key in sorted(languages, key=languages.get):
            self._target_languages_combo.insert(-1, key, languages[key])

        if active_id == -1:
            active_id = languages[0]

        self._target_languages_combo.set_active_id(active_id)

        target_wrap_width = int(round(len(languages) / 17))

        if target_wrap_width > 1:
            self._target_languages_combo.set_wrap_width(target_wrap_width)

        self._target_languages_combo.show()

        self.target_box.attach(self._target_languages_combo, 1, 1, 1, 1)

    def _show_settings(self, name):
        translator = self._prefs[name]

        source_langs = LANGUAGES_LIST
        self._load_default_source(source_langs, translator["default_source"])

        target_langs = self.get_pairs(translator["default_source"])
        self._load_default_target(target_langs, translator["default_target"])

        self._last_used.set_active(translator["remember_last_lang"])

    def _on_translators_combo_changed(self, combo):
        name = combo.get_active_id()
        self._show_settings(name)

    def _notify_active(self, s, widget):
        active = s.get_active()
        name = self._translators_combo.get_active_id()
        translator = self._prefs[name]
        translator["remember_last_lang"] = active

        self.save_settings()

    def _on_source_languages_combo_changed(self, combo):
        name = self._translators_combo.get_active_id()
        translator = self._prefs[name]
        lang_code = combo.get_active_id()

        if translator is None or translator["default_source"] == lang_code:
            return

        translator["default_source"] = lang_code
        languages = self.get_pairs(lang_code)
        active_id = -1

        if languages[translator["default_target"]] != "undefined":
            active_id = translator["default_target"]

        self._load_default_target(languages, active_id)

        self.save_settings()

    def _on_target_languages_combo_changed(self, combo):
        name = self._translators_combo.get_active_id()
        translator = self._prefs[name]
        lang_code = combo.get_active_id()

        if translator is None or translator["default_target"] == lang_code:
            return

        translator["default_target"] = lang_code

        self.save_settings()

    def save_settings(self):
        prefs = json.dumps(self._prefs)
        Settings().get_settings().set_string(self._pref_key, prefs)

    def get_pairs(self, language):
        temp = {}

        for key in LANGUAGES_LIST:
            if key == "auto":
                continue

            temp[key] = LANGUAGES_LIST[key]

        return temp


class AboutDialog(Gtk.AboutDialog):

    def __init__(self):
        logo = GdkPixbuf.Pixbuf.new_from_file_at_size(
            os.path.join(EXTENSION_DIR, "icon.png"), 64, 64)

        Gtk.AboutDialog.__init__(self, transient_for=app.window)
        data = app.extension_meta

        try:
            contributors_translated = []
            contributors = data["contributors"]

            if isinstance(contributors, str):
                contributors = contributors.split(",")

            for contributor in contributors:
                contributors_translated.append(_(contributor.strip()))

            self.add_credit_section(_("Contributors/Mentions:"),
                                    sorted(contributors_translated, key=self.lowered))
        except:
            pass

        # TO TRANSLATORS:
        # Here goes the name/s of the author/s of the translations.
        # Only e-mail addresses and links to GitHub accounts are allowed. NOTHING MORE.
        self.set_translator_credits(_("translator-credits"))
        self.set_license_type(Gtk.License.GPL_3_0)
        self.set_wrap_license(True)
        self.set_version(data["version"])
        self.set_comments(_(data["description"]))
        self.set_website(data["website"])
        self.set_website_label(_(data["name"]))
        self.set_authors(["Odyseus https://github.com/Odyseus"])
        self.set_logo(logo)
        self.connect("response", self.on_response)

    def lowered(self, item):
        return item.lower()

    def on_response(self, dialog, response):
        self.destroy()


class ExtensionPrefsWindow(Gtk.ApplicationWindow):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)


class ExtensionPrefsApplication(Gtk.Application):

    def __init__(self, *args, **kwargs):
        GLib.set_application_name(EXTENSION_NAME)
        super().__init__(*args,
                         application_id=APPLICATION_ID,
                         flags=Gio.ApplicationFlags.FLAGS_NONE,
                         **kwargs)
        self.application = Gtk.Application()

        self.application.connect("activate", self.do_activate)
        self.application.connect("startup", self.do_startup)

        if os.path.exists("%s/metadata.json" % EXTENSION_DIR):
            raw_data = open("%s/metadata.json" % EXTENSION_DIR).read()

            try:
                self.extension_meta = json.loads(raw_data)
            except:
                self.extension_meta = None
        else:
            self.extension_meta = None

    def do_activate(self):
        self.window.present()

    def do_startup(self):
        Gtk.Application.do_startup(self)
        self._buildUI()

    # The only way I found to get the correct window size when closing the window.
    def on_delete_event(self, widget, data=None):
        [width, height] = self.window.get_size()

        settings = Settings().get_settings()

        if (settings.get_boolean("window-remember-size")):
            settings.set_int("window-width", width)
            settings.set_int("window-height", height)

        return False

    def _buildUI(self):
        self.window = ExtensionPrefsWindow(
            # TO TRANSLATORS: Full sentence:
            # ExtensionName extension preferences
            application=self, title=_("%s extension preferences") % EXTENSION_NAME)

        if (Settings().get_settings().get_boolean("window-remember-size")):
            width = Settings().get_settings().get_int("window-width")
            height = Settings().get_settings().get_int("window-height")
            self.window.set_default_size(width, height)
        else:
            self.window.set_default_size(700, 460)

        self.window.set_position(Gtk.WindowPosition.CENTER)
        self.window.set_size_request(width=-1, height=-1)
        self.window.set_icon_from_file(os.path.join(EXTENSION_DIR, "icon.png"))
        self.window.connect("destroy", self.on_quit)
        self.window.connect("delete_event", self.on_delete_event)

        main_box = BaseGrid()
        main_box.set_spacing(0, 0)
        main_box.set_property("margin", 0)
        self.window.add(main_box)

        toolbar = Gtk.Toolbar()
        toolbar.get_style_context().add_class("primary-toolbar")
        main_box.add(toolbar)

        toolitem = Gtk.ToolItem()
        toolitem.set_expand(True)
        toolbar.add(toolitem)

        self.toolbar_box = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)
        self.toolbar_box.set_spacing(0, 0)
        toolbar_box_scrolledwindow = Gtk.ScrolledWindow(hadjustment=None, vadjustment=None)
        toolbar_box_scrolledwindow.set_policy(hscrollbar_policy=Gtk.PolicyType.AUTOMATIC,
                                              vscrollbar_policy=Gtk.PolicyType.NEVER)
        toolbar_box_scrolledwindow.add(self.toolbar_box)
        toolitem.add(toolbar_box_scrolledwindow)

        dummy_grid_1 = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)
        dummy_grid_1.set_property("hexpand", True)
        self.toolbar_box.attach(dummy_grid_1, 0, 0, 1, 1)

        dummy_grid_2 = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)
        dummy_grid_2.set_property("hexpand", True)
        self.toolbar_box.attach(dummy_grid_2, 2, 0, 1, 1)

        menu_popup = Gtk.Menu()
        menu_popup.set_halign(Gtk.Align.END)
        menu_popup.append(self.createMenuItem(_("Reset settings to defaults"),
                                              self._restore_default_values))
        menu_popup.append(self.createMenuItem(_("Import settings from a file"),
                                              self._import_export_settings, False))
        menu_popup.append(self.createMenuItem(_("Export settings to a file"),
                                              self._import_export_settings, True))
        menu_popup.append(Gtk.SeparatorMenuItem())

        rem_win_size_check = self.createCheckMenuItem(
            _("Remember window size"), key="window-remember-size")

        if rem_win_size_check is not None:
            menu_popup.append(rem_win_size_check)
            menu_popup.append(Gtk.SeparatorMenuItem())

        menu_popup.append(self.createMenuItem(text=_("Help"),
                                              callback=self.open_help_page))
        menu_popup.append(self.createMenuItem(text=_("About"),
                                              callback=self.open_about_dialog))

        menu_popup.show_all()
        menu_button = Gtk.MenuButton()
        menu_button.set_popup(menu_popup)
        menu_button.add(Gtk.Image.new_from_icon_name(
            "open-menu-symbolic", Gtk.IconSize.SMALL_TOOLBAR))
        menu_button.set_tooltip_text(_("Manage settings"))

        self.toolbar_box.attach(menu_button, 3, 0, 1, 1)

        main_boxscrolledwindow = Gtk.ScrolledWindow(hadjustment=None, vadjustment=None)
        main_boxscrolledwindow.set_policy(hscrollbar_policy=Gtk.PolicyType.NEVER,
                                          vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
        main_boxscrolledwindow.set_shadow_type(type=Gtk.ShadowType.ETCHED_IN)
        main_boxscrolledwindow.add(SettingsBox())

        main_box.add(main_boxscrolledwindow)

        self.window.show_all()

    def open_about_dialog(self, widget):
        if app.extension_meta is not None:
            aboutdialog = AboutDialog()
            aboutdialog.run()

    def open_help_page(self, widget):
        subprocess.call(("xdg-open", os.path.join(EXTENSION_DIR, "HELP.html")))

    def createCheckMenuItem(self, text, key=None, *args):
        if Settings().settings_has_key(key) is False:
            return None

        item = Gtk.CheckMenuItem(text)
        item.set_active(Settings().get_settings().get_boolean(key))
        item.connect("activate", self.on_check_menu_item, key)

        return item

    def on_check_menu_item(self, widget, key):
        is_active = widget.get_active()
        Settings().get_settings().set_boolean(key, is_active is True)

    def createMenuItem(self, text, callback, *args):
        item = Gtk.MenuItem(text)

        if (callback is not None):
            item.connect("activate", callback, *args)

        return item

    def _restore_default_values(self, widget):
        dialog = Gtk.MessageDialog(transient_for=app.window,
                                   modal=False,
                                   message_type=Gtk.MessageType.WARNING,
                                   buttons=Gtk.ButtonsType.YES_NO)

        # TO TRANSLATORS: Full sentence:
        # Warning: Trying to reset all ExtensionName settings!!!
        dialog.set_title(_("Warning: Trying to reset all %s settings!!!") % EXTENSION_NAME)

        # TO TRANSLATORS: Full sentence:
        # Reset all ExtensionName settings to default?
        esc = cgi.escape(_("Reset all %s settings to default?") % EXTENSION_NAME)
        dialog.set_markup(esc)
        dialog.show_all()
        response = dialog.run()
        dialog.destroy()

        if response == Gtk.ResponseType.YES:
            os.system("gsettings reset-recursively %s &" % SCHEMA_NAME)
            self.on_quit(self)

    def _import_export_settings(self, widget, export):
        if export:
            mode = Gtk.FileChooserAction.SAVE
            string = _("Select or enter file to export to")
            # TO TRANSLATORS: Could be left blank.
            btns = (_("_Cancel"), Gtk.ResponseType.CANCEL,
                    _("_Save"), Gtk.ResponseType.ACCEPT)
        else:
            mode = Gtk.FileChooserAction.OPEN
            string = _("Select a file to import")
            # TO TRANSLATORS: Could be left blank.
            btns = (_("_Cancel"), Gtk.ResponseType.CANCEL,
                    # TO TRANSLATORS: Could be left blank.
                    _("_Open"), Gtk.ResponseType.OK)

        dialog = Gtk.FileChooserDialog(parent=app.window,
                                       title=string,
                                       action=mode,
                                       buttons=btns)

        if export:
            dialog.set_do_overwrite_confirmation(True)

        filter_text = Gtk.FileFilter()
        filter_text.add_pattern("*.dconf")
        filter_text.set_name(_("DCONF files"))
        dialog.add_filter(filter_text)

        response = dialog.run()

        if export and response == Gtk.ResponseType.ACCEPT:
            filename = dialog.get_filename()

            if ".dconf" not in filename:
                filename = filename + ".dconf"

            os.system("dconf dump %s > %s &" % (SCHEMA_PATH, filename))

        if export is False and response == Gtk.ResponseType.OK:
            filename = dialog.get_filename()
            os.system("dconf load %s < %s" % (SCHEMA_PATH, filename))
            self.on_quit(self)

        dialog.destroy()

    def _restart_shell(self, widget):
        os.system("nohup cinnamon --replace >/dev/null 2>&1&")

    def on_quit(self, action):
        self.quit()


def ui_error_message(msg, detail=None):
    dialog = Gtk.MessageDialog(transient_for=None,
                               modal=True,
                               message_type=Gtk.MessageType.ERROR,
                               buttons=Gtk.ButtonsType.OK)

    try:
        esc = cgi.escape(msg)
    except:
        esc = msg

    dialog.set_markup(esc)
    dialog.show_all()
    dialog.run()
    dialog.destroy()


def install_schema():
    file_path = os.path.join(EXTENSION_DIR, "schemas", SCHEMA_NAME + ".gschema.xml")
    if os.path.exists(file_path):
        # TO TRANSLATORS: Could be left blank.
        sentence = _("Please enter your password to install the required settings schema for %s") % (
            EXTENSION_UUID)

        if os.path.exists("/usr/bin/gksu") and os.path.exists("/usr/share/cinnamon/cinnamon-settings/bin/installSchema.py"):
            launcher = "gksu  --message \"<b>%s</b>\"" % sentence
            tool = "/usr/share/cinnamon/cinnamon-settings/bin/installSchema.py %s" % file_path
            command = "%s %s" % (launcher, tool)
            os.system(command)
        else:
            ui_error_message(
                # TO TRANSLATORS: Could be left blank.
                msg=_("Could not install the settings schema for %s.  You will have to perform this step yourself.") % (EXTENSION_UUID))


def remove_schema():
    file_name = SCHEMA_NAME + ".gschema.xml"
    # TO TRANSLATORS: Could be left blank.
    sentence = _("Please enter your password to remove the settings schema for %s") % (
        EXTENSION_UUID)

    if os.path.exists("/usr/bin/gksu") and os.path.exists("/usr/share/cinnamon/cinnamon-settings/bin/removeSchema.py"):
        launcher = "gksu  --message \"<b>%s</b>\"" % sentence
        tool = "/usr/share/cinnamon/cinnamon-settings/bin/removeSchema.py %s" % (file_name)
        command = "%s %s" % (launcher, tool)
        os.system(command)
    else:
        ui_error_message(
            # TO TRANSLATORS: Could be left blank.
            msg=_("Could not remove the settings schema for %s.  You will have to perform this step yourself.  This is not a critical error.") % (EXTENSION_UUID))


if __name__ == "__main__":
    try:
        arg = sys.argv[1]
    except:
        arg = None

    # I don't think that this is needed.
    # Leaving it because it just don't hurt.
    if arg == "install-schema":
        install_schema()
    elif arg == "remove-schema":
        remove_schema()
    else:
        # Initialize and load gsettings values
        Settings().set_settings(SCHEMA_NAME)

        app = ExtensionPrefsApplication()
        app.run()
