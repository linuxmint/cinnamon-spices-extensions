#!/usr/bin/python3

import math
import os
import subprocess
import gettext
import sys
import json
import cgi
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("Notify", "0.7")
from gi.repository import Gio, Gtk, GObject, GLib, Gdk, Notify, GdkPixbuf
from pkg_resources import parse_version

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
APPLICATION_ID = "org.cinnamon.extensions.odyseus.cinnamon.tweaks"
SCHEMA_NAME = "org.cinnamon.extensions.0dyseus@CinnamonTweaks"
SCHEMA_PATH = "/org/cinnamon/extensions/0dyseus@CinnamonTweaks/"
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


APPLETS_TAB = {
    "title": _("Applets tweaks"),
    "sections": [{
        "title": _("Applets tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                "key": "applets-tweaks-enabled",
                "label": _("Enable Applets tweaks")
            }
        }, {
            "type": "switch",
            "dep_key": "applets-tweaks-enabled",
            "args": {
                "key": "applets-ask-confirmation-applet-removal",
                "label": _("Ask for confirmation on applet removal"),
                "tooltip": _("Display a confirmation dialog on removal.\nKeeping the Ctrl key pressed will bypass the confirmation.")
            }
        }, {
            "type": "switch",
            "dep_key": "applets-tweaks-enabled",
            "args": {
                "key": "applets-add-edit-file-item-to-context",
                "label": "(*) " + _("Display \"Edit applet main file\" on context menu")
            }
        }, {
            "type": "combo",
            "dep_key": "applets-tweaks-enabled",
            "args": {
                "key": "applets-add-edit-file-item-to-context-placement",
                "label": "(*) " + _("Where to place the \"Edit applet main file\" item?"),
                "values": {
                    "last": _("Last item on menu"),
                    "bfr_about": _("Before \"About...\" item"),
                    "bfr_conf": _("Before \"Configure...\" item"),
                    "bfr_rem": _("Before \"Remove...\" item")
                }
            }
        }, {
            "type": "switch",
            "dep_key": "applets-tweaks-enabled",
            "args": {
                "key": "applets-add-open-folder-item-to-context",
                "label": "(*) " + _("Display \"Open applet folder\" on context menu")
            }
        }, {
            "type": "combo",
            "dep_key": "applets-tweaks-enabled",
            "args": {
                "key": "applets-add-open-folder-item-to-context-placement",
                "label": "(*) " + _("Where to place the \"Open applet folder\" item?"),
                "values": {
                    "last": _("Last item on menu"),
                    "bfr_about": _("Before \"About...\" item"),
                    "bfr_conf": _("Before \"Configure...\" item"),
                    "bfr_rem": _("Before \"Remove...\" item")
                }
            }
        }]
    }]
}

DESKLETS_TAB = {
    "title": _("Desklets tweaks"),
    "sections": [{
        "title": _("Desklets tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                "key": "desklets-tweaks-enabled",
                "label": _("Enable Desklets tweaks")
            }
        }, {
            "type": "switch",
            "dep_key": "desklets-tweaks-enabled",
            "args": {
                "key": "desklets-ask-confirmation-desklet-removal",
                "label": _("Ask for confirmation on desklet removal"),
                "tooltip": _("Display a confirmation dialog on removal.\nKeeping the Ctrl key pressed will bypass the confirmation.")
            }
        }, {
            "type": "switch",
            "dep_key": "desklets-tweaks-enabled",
            "args": {
                "key": "desklets-add-edit-file-item-to-context",
                "label": "(*) " + _("Display \"Edit desklet main file\" on context menu")
            }
        }, {
            "type": "combo",
            "dep_key": "desklets-tweaks-enabled",
            "args": {
                "key": "desklets-add-edit-file-item-to-context-placement",
                "label": "(*) " + _("Where to place the \"Edit desklet main file\" item?"),
                "values": {
                    "last": _("Last item on menu"),
                    "bfr_about": _("Before \"About...\" item"),
                    "bfr_conf": _("Before \"Configure...\" item"),
                    "bfr_rem": _("Before \"Remove...\" item")
                }
            }
        }, {
            "type": "switch",
            "dep_key": "desklets-tweaks-enabled",
            "args": {
                "key": "desklets-add-open-folder-item-to-context",
                "label": "(*) " + _("Display \"Open desklet folder\" on context menu")
            }
        }, {
            "type": "combo",
            "dep_key": "desklets-tweaks-enabled",
            "args": {
                "key": "desklets-add-open-folder-item-to-context-placement",
                "label": "(*) " + _("Where to place the \"Open desklet folder\" item?"),
                "values": {
                    "last": _("Last item on menu"),
                    "bfr_about": _("Before \"About...\" item"),
                    "bfr_conf": _("Before \"Configure...\" item"),
                    "bfr_rem": _("Before \"Remove...\" item")
                }
            }
        }]
    }
    ]
}

HOTCORNERS_TAB = {
    "title": _("Hot corners tweaks"),
    "compatible": parse_version(CINNAMON_VERSION) < parse_version("3.2"),
    "sections": [{
        "title": _("Hot corners tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                "key": "hotcorners-tweaks-enabled",
                "label": _("Enable Hot Corners tweaks")
            }
        }, {
            "type": "spin",
            "dep_key": "hotcorners-tweaks-enabled",
            "args": {
                "key": "hotcorners-delay-top-left",
                "label": _("Top left hot corner activation delay"),
                "tooltip": _("Set a delay in milliseconds to activate this hot corner."),
                "min": 0,
                "max": 1000,
                "step": 50,
                "units": _("milliseconds")
            }
        }, {
            "type": "spin",
            "dep_key": "hotcorners-tweaks-enabled",
            "args": {
                "key": "hotcorners-delay-top-right",
                "label": _("Top right hot corner activation delay"),
                "tooltip": _("Set a delay in milliseconds to activate this hot corner."),
                "min": 0,
                "max": 1000,
                "step": 50,
                "units": _("milliseconds")
            }
        }, {
            "type": "spin",
            "dep_key": "hotcorners-tweaks-enabled",
            "args": {
                "key": "hotcorners-delay-bottom-left",
                "label": _("Bottom left hot corner activation delay"),
                "tooltip": _("Set a delay in milliseconds to activate this hot corner."),
                "min": 0,
                "max": 1000,
                "step": 50,
                "units": _("milliseconds")
            }
        }, {
            "type": "spin",
            "dep_key": "hotcorners-tweaks-enabled",
            "args": {
                "key": "hotcorners-delay-bottom-right",
                "label": _("Bottom right hot corner activation delay"),
                "tooltip": _("Set a delay in milliseconds to activate this hot corner."),
                "min": 0,
                "max": 1000,
                "step": 50,
                "units": _("milliseconds")
            }
        }]
    }]
}

DESKTOP_TAB = {
    "title": _("Desktop tweaks"),
    "sections": [{
        "title": _("Desktop area tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                "key": "desktop-tweaks-enabled",
                "label": _("Enable Desktop area tweaks")
            }
        }, {
            "type": "switch",
            "dep_key": "desktop-tweaks-enabled",
            "args": {
                "key": "desktop-tweaks-allow-drop-to-desktop",
                "label": "(*) " + _("Enable applications drop to the Desktop"),
                "tooltip": _("With this option enabled, applications can be dragged from the menu applet and from the panel launchers applet and dropped into the desktop.")
            }
        }]
    }, {
        "title": _("Tooltips tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                "key": "tooltips-tweaks-enabled",
                "label": _("Enable Tooltips tweaks")
            }
        }, {
            "type": "switch",
            "dep_key": "tooltips-tweaks-enabled",
            "compatible": parse_version(CINNAMON_VERSION) < parse_version("3.2"),
            "args": {
                "key": "tooltips-alignment",
                "label": "(*) " + _("Avoid mouse pointer overlapping tooltips"),
                "tooltip": _("Tooltips on Cinnamon's UI are aligned to the top-left corner of the mouse pointer. This leads to having tooltips overlapped by the mouse pointer. This tweak aligns the tooltip to the bottom-right corner of the mouse pointer (approximately), reducing the possibility of the mouse pointer to overlap the tooltip.")
            }
        }, {
            "type": "spin",
            "dep_key": "tooltips-tweaks-enabled",
            "args": {
                "key": "tooltips-delay",
                "label": _("Tooltips show delay"),
                "tooltip": _("Set a delay in milliseconds to display Cinnamon's UI tooltips."),
                "min": 100,
                "max": 1000,
                "step": 50,
                "units": _("milliseconds")
            }
        }]
    }, {
        "title": _("Popup menus tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                    "key": "popup-menu-manager-tweaks-enabled",
                    "label": _("Enable Popup menus tweaks")
            }
        }, {
            "type": "combo",
            "dep_key": "popup-menu-manager-tweaks-enabled",
            "args": {
                "key": "popup-menu-manager-applets-menus-behavior",
                "label": "(*) " + _("Panel menus behavior"),
                "tooltip": _("This setting affects only the behavior of menus that belongs to applets placed on any panel.\n\nEmulate Gnome Shell behavior: When a menu is open on Genome Shell, and then the mouse cursor is moved to another button on the top panel, the menu of the hovered buttons will automatically open without the need to click on them. With this option enabled, that same behavior can be reproduced on Cinnamon.\n\nDon't eat clicks: By default, when one opens an applet's menu on Cinnamon and then click on another applet to open its menu, the first click is used to close the first opened menu, and then another click has to be performed to open the menu of the second applet. With this option enabled, one can directly open the menu of any applet even if another applet has its menu open."),
                "values": {
                    "default": _("Default behavior"),
                    "gnome-shell": _("Emulate Gnome Shell menus"),
                    "do-not-eat": _("Don't \"eat\" clicks")
                }
            }
        }]
    }]
}

NOTIFICATIONS_TAB = {
    "title": _("Notifications tweaks"),
    "sections": [{
        "title": _("Notifications tweaks"),
        "widgets": [{
            "type": "switch",
            "args": {
                    "key": "notifications-enable-tweaks",
                    "label": _("Enable notifications tweaks")
            }
        }, {
            "type": "switch",
            "dep_key": "notifications-enable-tweaks",
            "args": {
                    "key": "notifications-enable-animation",
                    "label": _("Enable notifications open/close animation")
            }
        }, {
            "type": "combo",
            "dep_key": "notifications-enable-tweaks",
            "args": {
                "key": "notifications-position",
                "label": _("Notifications position"),
                "values": {
                    "top": _("Top-right of screen (System default)"),
                    "bottom": _("Bottom-right of screen")
                }
            }
        }, {
            "type": "spin",
            "dep_key": "notifications-enable-tweaks",
            "args": {
                "key": "notifications-distance-from-panel",
                "label": _("Distance from panel"),
                "tooltip": _("For notifications displayed at the top-right of screen: this is the distance between the bottom border of the top panel (if no top panel, from the top of the screen) to the top border of the notification popup.\n\nFor notifications displayed at the bottom-right of screen: this is the distance between the top border of the bottom panel (if no bottom panel, from the bottom of the screen) to the bottom border of the notification popup."),
                "min": 0,
                "max": 512,
                "step": 1,
                "units": _("pixels")
            }
        }, {
            "type": "spin",
            "dep_key": "notifications-enable-tweaks",
            "args": {
                "key": "notifications-right-margin",
                "label": _("Notification popup right margin"),
                "tooltip": _("By default, the right margin of the notification popup is defined by the currently used theme. This option, set to any value other than 0 (zero), allows to set a custom right margin, ignoring the defined by the theme."),
                "min": 0,
                "max": 512,
                "step": 1,
                "units": _("pixels")
            }
        }, {
            "type": "boolean_button",
            "args": {
                    "key": "test-notifications",
                    # TO TRANSLATORS: Could be left blank.
                    "label": _("Display a test notification")
            }
        }]
    }]
}

WINDOWS_TAB = {
    "title": _("Windows tweaks"),
    "sections": [{
        "title": _("Window focus tweaks"),
        "widgets": [{
            "type": "combo",
            "args": {
                "key": "win-demands-attention-activation-mode",
                "label": _("The activation of windows demanding attention..."),
                "values": {
                    "none": _("...is handled by the system"),
                    "force": _("...is immediate"),
                    "hotkey": _("...is performed with a keyboard shortcut")
                }
            }
        }, {
            "type": "keybindings_tree",
            "args": {
                "keybindings": {
                    "win-demands-attention-keyboard-shortcut": _("Activate window demanding attention")
                }
            }
        }]
    }, {
        "title": _("Window shadows tweaks"),
        "warning_message": _("Client side decorated windows aren't affected by this tweak."),
        "widgets": [{
            "type": "switch",
            "args": {
                    "key": "window-shadows-tweaks-enabled",
                    "label": _("Enable window shadows tweaks"),
                    "tooltip": _("This tweak allows us to customize the shadow of all windows.")
            }
        }, {
            "type": "combo",
            "dep_key": "window-shadows-tweaks-enabled",
            "args": {
                "key": "window-shadows-preset",
                "label": _("Shadow presets"),
                "values": {
                    "custom": _("Custom shadows"),
                    "default": _("Default shadows"),
                    "no_shadows": _("No shadows"),
                    "windows_10": _("Windows 10 shadows")
                }
            }
        }, {
            "type": "custom_shadow_setter",
            "dep_key": "window-shadows-tweaks-enabled",
            "args": {
                "key": "window-shadows-custom-preset",
                "label": _("Edit custom shadows values")
            }
        }]
    }, {
        "title": _("Auto move windows"),
        "warning_message": _("Not all applications can be assigned to be moved. Most applications which can open multiple instances of themselves most likely cannot be configured to be automatically moved."),
        "widgets": [{
            "type": "switch",
            "args": {
                    "key": "window-auto-move-tweaks-enabled",
                    "label": _("Enable auto move windows tweak"),
                    "tooltip": _("This tweak enables the ability to set rules to open determined applications on specific workspaces.")
            }
        }, {
            "type": "auto_moved_windows_setter",
            "dep_key": "window-auto-move-tweaks-enabled",
            "args": {
                    "key": "window-auto-move-application-list",
                    "label": _("Define auto move windows rules")
            }
        }]
    }, {
        "title": _("Windows decorations removal"),
        "warning_message": "<b>⚫</b> " + _("This tweak settings are purposely NOT applied in real time. Click the »Apply windows decorations settings« button to save settings.") + "\n" +
        "<b>⚫</b> " + _("Client side decorated windows and WINE applications aren't affected by this tweak.") + "\n" +
        "<b>⚫</b> " + _("Close all windows that belongs to an application that is going to be added to the applications list and before applying the settings of this tweak.") + "\n" +
        "<b>⚫ " +
        _("Read this extension help for more detailed instructions, list of dependencies and known issues.") +
        "</b>",
        "widgets": [{
            "type": "boolean_button",
            "args": {
                    "key": "maximus-apply-settings",
                    "label": _("Apply windows decorations settings")
            }
        }, {
            "type": "switch",
            "args": {
                    "key": "maximus-enable-tweak",
                    "label": _("Enable maximized windows decoration removal")
            }
        }, {
            "type": "switch",
            "dep_key": "maximus-enable-tweak",
            "args": {
                    "key": "maximus-undecorate-half-maximized",
                    "label": _("Undecorate half-maximized windows?")
            }
        }, {
            "type": "switch",
            "dep_key": "maximus-enable-tweak",
            "args": {
                    "key": "maximus-undecorate-tiled",
                    "label": _("Undecorate tiled windows?")
            }
        }, {
            "type": "switch",
            "dep_key": "maximus-enable-tweak",
            "args": {
                    "key": "maximus-is-blacklist",
                    "label": _("Applications list is a blacklist?"),
                    "tooltip": _("If enabled, all applications will have their window decorations removed, except those listed in the list of applications.\n\nIf disabled, only the application from the list of applications will have their decorations removed.")
            }
        }, {
            "type": "switch",
            "dep_key": "maximus-enable-tweak",
            "args": {
                    "key": "maximus-enable-logging",
                    "label": _("Enable logging"),
                    "tooltip": _("For debugging purposes only.")
            }
        }, {
            "type": "maximus_applications_chooser",
            "dep_key": "maximus-enable-tweak",
            "args": {
                    "key": "maximus-app-list",
                    "label": _("Edit applications list")
            }
        }]
    }]
}


def populate_settings_box():
    pages_object = sorted([
        APPLETS_TAB,
        DESKLETS_TAB,
        DESKTOP_TAB,
        HOTCORNERS_TAB,
        NOTIFICATIONS_TAB,
        WINDOWS_TAB,
    ], key=lambda x: x["title"])

    stack = app.window.stack
    stack.set_transition_type(Gtk.StackTransitionType.SLIDE_UP_DOWN)
    stack.set_transition_duration(150)
    stack.set_property("margin", 0)
    stack.set_property("expand", True)

    def _make_items_sidebar(text):
        lbl = Gtk.Label(label=text, xalign=0.0)
        lbl.set_name("row")
        row = Gtk.ListBoxRow()
        row.get_style_context().add_class("cinnamon-tweaks-category")
        row.add(lbl)
        return row

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
        page.set_property("margin-left", 15)
        page.set_property("margin-right", 15)
        page.set_property("margin-bottom", 15)
        page.set_border_width(0)

        section_count = 0
        for section_obj in page_obj["sections"]:
            # Possibility to hide entire sections
            try:
                if section_obj["compatible"] is False:
                    continue
            except KeyError:  # If "compatible" key isn't set.
                pass

            try:
                warning_message = section_obj["warning_message"]
            except KeyError:  # If "warning_message" key isn't set.
                warning_message = None

            section_container = SectionContainer(
                section_obj["title"], warning_message=warning_message)

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

                if section_widget_obj["type"] is not "keybindings_tree":
                    widget.set_border_width(5)
                    widget.set_margin_left(15)
                    widget.set_margin_right(15)

                try:
                    dep_key = section_widget_obj["dep_key"]

                    if Settings().settings_has_key(dep_key):
                        Settings().get_settings().bind(
                            dep_key, widget, "sensitive", Gio.SettingsBindFlags.GET)
                    else:
                        pass
                except (NameError, KeyError):
                    pass

                section_container.add_row(widget, 0, i + 1, 1, 1)

            if section_count is not 0:
                row_pos = len(SECTION_WIDGETS) + row_pos
            else:
                row_pos = row_pos

            page.attach(section_container, 0, row_pos, 2, 1)
            row_pos += 1
            section_count += 1

        scrolledwindow = Gtk.ScrolledWindow(hadjustment=None, vadjustment=None)
        scrolledwindow.set_size_request(width=-1, height=-1)
        scrolledwindow.set_policy(hscrollbar_policy=Gtk.PolicyType.AUTOMATIC,
                                  vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
        scrolledwindow.add(page)
        sidebar_row = _make_items_sidebar(page_obj["title"])
        app.window.sidebar.add(sidebar_row)
        stack.add_named(scrolledwindow, page_obj["title"])


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

    def __init__(self, title, warning_message=None):
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

        dummy = BaseGrid()
        dummy.set_property("hexpand", True)
        dummy.set_property("vexpand", False)
        dummy_holder = Gtk.ToolItem()
        dummy_holder.set_expand(True)
        dummy_holder.add(dummy)
        toolbar.add(dummy_holder)

        if warning_message is not None:
            # Using set_image on button adds an un-removable padding.
            # Setting the image as argument doesn't. ¬¬
            button = Gtk.Button(image=Gtk.Image.new_from_icon_name(
                "dialog-warning-symbolic", Gtk.IconSize.BUTTON))
            button.get_style_context().add_class("cinnamon-tweaks-section-warning-button")
            button.set_relief(Gtk.ReliefStyle.NONE)
            button.set_tooltip_text(_("Warnings related to this specific section"))
            button.connect("clicked", display_warning_message, title, warning_message)
            button_holder = Gtk.ToolItem()
            button_holder.add(button)
            toolbar.add(button_holder)

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


class Settings(object):

    """ Get settings values using gsettings """

    _settings = None

    def __new__(cls, *p, **k):
        """ Implementation of the borg pattern
        This way we make sure that all instances share the same state
        and that the schema is read from file only once.
        """
        if "_the_instance" not in cls.__dict__:
            cls._the_instance = object.__new__(cls)
        return cls._the_instance

    def set_settings(self, schema_name):
        """ Get settings values from corresponding schema file """

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

    """ Build widgets associated with gsettings values """

    def boolean_button(self, key, label, tooltip=""):
        """ Toggle a setting so it can trigger a callback from outside
            the context of this script. """
        box = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)
        box.set_spacing(10, 10)

        button = Gtk.Button(label)
        button.set_property("expand", True)
        button.connect("clicked", self.on_boolean_button_clicked, key)
        box.attach(button, 0, 0, 2, 1)
        return box

    def on_boolean_button_clicked(self, widget, key):
        Settings().get_settings().set_boolean(key, not Settings().get_settings().get_boolean(key))

    def info_label(self, label, bold=False, italic=False):
        """ Styled label widget widget """
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
        """ Entry text widget """
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

    def keybindings_tree(self, keybindings):
        """ Keybinding tree widget """
        return KeybindingsTreeViewWidget(keybindings)

    def custom_shadow_setter(self, key, label):
        """ CustomShadowSetter widget """
        return CustomShadowSetter(key, label)

    def auto_moved_windows_setter(self, key, label):
        """ AutoMovedWindowsSetter widget """
        return AutoMovedWindowsSetter(key, label)

    def maximus_applications_chooser(self, key, label):
        """ MaximusApplicationSetter widget """
        return MaximusApplicationSetter(key, label)

    def combo(self, key, label, values, tooltip=""):
        """ Combo box widget """
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
        """ Slider widget """
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
        """ Spin widget """
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

    def textview(self, key, label, height=200, tooltip=""):
        """ Textview widget """
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

    """ Switch widget """

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

    """ FileChooser widget """

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


class CustomShadowSetter(Gtk.Button):

    """ CustomShadowSetter widget """

    def __init__(self, key, label):
        Gtk.Button.__init__(self, label)
        self.connect("clicked", self.open_custom_shadows_editor)

        self.custom_preset = None
        self._key = key
        self._shadow_classes = sorted([
            "normal",
            "dialog",
            "modal_dialog",
            "utility",
            "border",
            "menu",
            "popup-menu",
            "dropdown-menu",
            "attached"
        ])
        self.default_shadow_values = {
            "focused": {
                "normal": [6, -1, 0, 3, 255],
                "dialog": [6, -1, 0, 3, 255],
                "modal_dialog": [6, -1, 0, 1, 255],
                "utility": [3, -1, 0, 1, 255],
                "border": [6, -1, 0, 3, 255],
                "menu": [6, -1, 0, 3, 255],
                "popup-menu": [1, -1, 0, 1, 128],
                "dropdown-menu": [1, 10, 0, 1, 128],
                "attached": [6, -1, 0, 1, 255]
            },
            "unfocused": {
                "normal": [3, -1, 0, 3, 128],
                "dialog": [3, -1, 0, 3, 128],
                "modal_dialog": [3, -1, 0, 3, 128],
                "utility": [3, -1, 0, 1, 128],
                "border": [3, -1, 0, 3, 128],
                "menu": [3, -1, 0, 0, 128],
                "popup-menu": [1, -1, 0, 1, 128],
                "dropdown-menu": [1, 10, 0, 1, 128],
                "attached": [3, -1, 0, 3, 128]
            }
        }
        self.pages = [
            "focused",
            "unfocused"
        ]
        self.pages_labels = {
            "focused": _("Focused windows"),
            "unfocused": _("Unfocused windows")
        }
        self.shadow_classes_labels = {
            "normal": _("Normal"),
            "dialog": _("Dialog"),
            "modal_dialog": _("Modal dialog"),
            "utility": _("Utility"),
            "border": _("Border"),
            "menu": _("Menu"),
            "popup-menu": _("Popup menu"),
            "dropdown-menu": _("Dropdown menu"),
            "attached": _("Attached"),
        }
        self.shadow_values = [
            "radius",
            "top_fade",
            "x_offset",
            "y_offset",
            "opacity"
        ]
        self.shadow_values_labels = {
            "radius": _("Radius"),
            "top_fade": _("Top fade"),
            "x_offset": _("X offset"),
            "y_offset": _("Y offset"),
            "opacity": _("Opacity")
        }

        self.columns = {
            "LABEL": 0,
            "RADIUS": 1,
            "TOP_FADE": 2,
            "X_OFFSET": 3,
            "Y_OFFSET": 4,
            "OPACITY": 5
        }

    def open_custom_shadows_editor(self, widget):
        try:
            self.custom_preset = json.loads(
                Settings().get_settings().get_string(self._key))
        except:
            Notify.init(APPLICATION_ID)
            self.notify_custom(self)
            return None

        self.dialog = Gtk.Dialog(transient_for=self.get_toplevel(),
                                 title=_("Edit custom shadows values"),
                                 flags=Gtk.DialogFlags.MODAL,
                                 buttons=(_("_Cancel"), Gtk.ResponseType.CANCEL,
                                          _("_Save"), Gtk.ResponseType.OK))

        content_area = self.dialog.get_content_area()
        content_area_grid = BaseGrid()
        content_area.add(content_area_grid)

        self.store = {}
        stack = Gtk.Stack()
        stack.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT)
        stack.set_transition_duration(150)
        stack.set_property("margin", 10)
        stack.set_property("expand", True)

        page_count = 0
        for status in self.pages:
            page = BaseGrid()
            page.set_property("margin", 0)
            page.set_spacing(15, 15)
            page.set_property("expand", True)

            self.store[status] = Gtk.ListStore(str, int, int, int, int, int)
            t_v = Gtk.TreeView()
            t_v.columns_autosize()
            t_v.set_activate_on_single_click(True)
            t_v.set_hover_selection(True)
            t_v.set_property("model", self.store[status])
            t_v.set_grid_lines(Gtk.TreeViewGridLines.BOTH)
            t_v.set_property("expand", True)
            t_v.set_enable_tree_lines(True)
            t_v.get_selection().set_mode(Gtk.SelectionMode.SINGLE)

            page.attach(t_v, 0, 0, 1, 1)

            type_label_renderer = Gtk.CellRendererText()
            type_label_renderer.set_property("weight", 600)
            type_col = Gtk.TreeViewColumn()
            type_col.set_alignment(0.5)
            type_col.set_property("title", _("Window type"))
            type_col.set_property("expand", True)
            type_col.pack_start(type_label_renderer, True)
            type_col.add_attribute(type_label_renderer, "text", 0)
            t_v.append_column(type_col)

            button_box = BaseGrid()
            button_box.set_property("margin", 0)
            button_box.set_spacing(0, 0)
            button_box.set_column_homogeneous(True)

            reset_button = Gtk.Button(_("Reset values"))
            reset_button.set_tooltip_text(
                _("Reset all values on the current view to their defaults."))
            reset_button.connect("clicked", self.reset_values, status)
            button_box.attach(reset_button, 0, 0, 1, 1)

            apply_button = Gtk.Button(_("Apply custom shadow"))
            apply_button.set_tooltip_text(
                _("Save and apply custom shadow values to see its effects in real time."))
            apply_button.connect("clicked", self.save_and_apply)
            button_box.attach(apply_button, 1, 0, 1, 1)

            page.attach(button_box, 0, 1, 1, 1)

            for i in range(0, len(self.shadow_values)):
                spin_renderer = Gtk.CellRendererSpin()
                shadow_value = self.shadow_values[i]

                if shadow_value == "top_fade":
                    adjustment = Gtk.Adjustment(lower=-100, upper=100, step_increment=1)
                elif shadow_value == "opacity":
                    adjustment = Gtk.Adjustment(lower=0, upper=255, step_increment=1)
                elif shadow_value == "radius":
                    adjustment = Gtk.Adjustment(lower=1, upper=255, step_increment=1)
                else:
                    adjustment = Gtk.Adjustment(lower=0, upper=100, step_increment=1)

                spin_renderer.set_property("adjustment", adjustment)
                spin_renderer.set_property("editable", True)
                spin_renderer.connect("edited", self.on_spin_edited, status, i + 1)
                spin_col = Gtk.TreeViewColumn()
                spin_col.set_alignment(0.5)
                spin_col.set_min_width(110)
                spin_col.set_property("title", _(self.shadow_values_labels[shadow_value]))
                spin_col.pack_end(spin_renderer, False)
                spin_col.add_attribute(spin_renderer, "text", i + 1)
                t_v.append_column(spin_col)

            page_count += 1
            stack.add_titled(page, "stack_id_%s" %
                             str(page_count), self.pages_labels[status])

        stack_switcher = Gtk.StackSwitcher()
        stack_switcher.set_stack(stack)
        stack_switcher.set_halign(Gtk.Align.CENTER)
        stack_switcher.set_homogeneous(False)

        content_area_grid.attach(stack_switcher, 0, 0, 1, 1)

        info_label = Widgets().info_label(
            _("Remember to set »Shadow presets« option to »Custom shadows«"),
            bold=True,
            italic=True
        )
        info_label.set_valign(Gtk.Align.END)
        info_label.set_halign(Gtk.Align.CENTER)

        content_area_grid.attach(info_label, 0, 1, 1, 1)

        content_area_grid.attach(stack, 0, 2, 1, 1)

        self._populate()

        content_area.show_all()
        response = self.dialog.run()

        if response == Gtk.ResponseType.OK:
            self.save_and_apply(self)

            self.dialog.destroy()
            return None

        self.dialog.destroy()
        return None

    def notify_custom(self, widget):
        n = Notify.Notification.new(
            _("Cinnamon Tweaks"),
            "<b>" + _("Window shadows tweaks") + "</b>\n" +
            _("Remember to set »Shadow presets« option to »Custom shadows«"),
            "dialog-warning"
        )
        n.show()

    def reset_values(self, widget, status):
        dialog = Gtk.MessageDialog(transient_for=self.dialog,
                                   modal=True,
                                   message_type=Gtk.MessageType.WARNING,
                                   buttons=Gtk.ButtonsType.YES_NO)

        dialog.set_title(_("Warning: Trying to reset custom shadows values!!!"))

        esc = cgi.escape(
            _("Are  you sure that you want to reset the shadows values of the current view to their defaults?"))
        dialog.set_markup(esc)
        dialog.show_all()
        response = dialog.run()
        dialog.destroy()

        if response == Gtk.ResponseType.YES:
            self.custom_preset[status] = self.default_shadow_values[status]

            self.save_and_apply(self)

            self.dialog.destroy()

        return None

    def save_and_apply(self, widget):
        pref_str = None

        try:
            pref_str = json.dumps(self.custom_preset)
        except:
            return False

        if pref_str is not None:
            Settings().get_settings().set_string(self._key, pref_str)

        return True

    def on_spin_edited(self, widget, path, value, status, index):
        """
        I'm forced to do this nonsense because I can't figure out a way to set
        Gtk.SpinButtonUpdatePolicy.IF_VALID policy to CellRendererSpin elements.
        The following condition is for "radius" values. If it's equal to zero, Cinnamon crashes.
        Other shadow values, if set outside their boundaries, do not crash Cinnamon.
        """
        if index == 1 and int(value) <= 0:
            value = 1

        shadow_class = self._shadow_classes[int(path)]

        try:
            self.store[status][path][index] = int(value)
            self.custom_preset[status][shadow_class][index - 1] = int(value)
        except:
            pass

    def _populate(self):
        for status in self.pages:
            self.store[status].clear()

            for shadow_class in self._shadow_classes:
                iter = self.store[status].append()
                values = self.custom_preset[status][shadow_class]
                self.store[status].set(
                    iter,
                    [
                        self.columns["LABEL"],
                        self.columns["RADIUS"],
                        self.columns["TOP_FADE"],
                        self.columns["X_OFFSET"],
                        self.columns["Y_OFFSET"],
                        self.columns["OPACITY"]
                    ],
                    [
                        self.shadow_classes_labels[shadow_class],
                        values[0],
                        values[1],
                        values[2],
                        values[3],
                        values[4],
                    ])


class AppChooserWidget(Gtk.Dialog):

    """
    Provide a dialog to select an application from all those installed.

    The regular Gtk.AppChooserDialog does not seem to provide any way to allow
    selection from all installed applications, so this dialog serves as a replacement.

    Source:
    http://stackoverflow.com/a/41985006
    Can be reused.
    Usage:

    Open application chooser dialog.
    app_chooser = AppChooserWidget()
    applications = app_chooser.run()

    applications is an array/list of Gio.AppInfo objects.

    Launch application:
    applications[index].launch()
    """

    def __init__(self, parent=None, multi_selection=False, show_no_display=True):
        super().__init__(self,
                         title=_("Application Chooser"),
                         transient_for=parent,
                         flags=Gtk.DialogFlags.MODAL)

        self.set_default_size(350, 400)
        self.set_icon_name("gtk-search")
        self.multi_selection = multi_selection
        self.show_no_display = show_no_display

        content_box = self.get_content_area()
        content_box.set_property("margin", 8)
        content_box.set_spacing(8)
        content_box_grid = BaseGrid()
        content_box_grid.set_property("expand", True)
        content_box_grid.set_spacing(0, 5)
        content_box.add(content_box_grid)

        self.button_box = self.get_action_area()
        self.button_box.set_property("margin", 4)

        # Can be programmatically changed if needed.
        self.label = Gtk.Label(_("Choose An Application"))
        content_box_grid.attach(self.label, 0, 0, 1, 1)

        self.list_store = Gtk.ListStore()
        # Switched from [str, str, int] model to the current one because I was
        # having a lot of missing icons for applications.
        self.list_store.set_column_types([GObject.TYPE_STRING, Gio.Icon, GObject.TYPE_INT])

        pixbuf_renderer = Gtk.CellRendererPixbuf()
        text_renderer = Gtk.CellRendererText()
        icon_column = Gtk.TreeViewColumn()
        icon_column.pack_start(pixbuf_renderer, False)
        icon_column.add_attribute(pixbuf_renderer, "gicon", 1)
        text_column = Gtk.TreeViewColumn("text", text_renderer, text=0)

        self.tree_view = Gtk.TreeView()

        if self.multi_selection:
            self.tree_view.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE)
        else:
            self.tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE)

        self.tree_view.set_model(self.list_store)
        self.tree_view.set_headers_visible(False)
        self.tree_view.append_column(icon_column)
        self.tree_view.append_column(text_column)

        scroll_window = Gtk.ScrolledWindow()
        scroll_window.set_property("expand", True)
        scroll_window.set_shadow_type(type=Gtk.ShadowType.IN)
        scroll_window.add(self.tree_view)
        content_box_grid.attach(scroll_window, 0, 1, 1, 1)

        self.ok_button = self.add_button(Gtk.STOCK_OK, Gtk.ResponseType.OK)
        self.ok_button.connect("clicked", self.on_ok)

        self.cancel_button = self.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL)

        self.selected_apps = []
        self.app_list = []

    def populate_app_list(self):
        """Populate the list of applications with all installed applications.

        <strikethrough>Icons are provided by icon-name, however some applications may return a full
        path to a custom icon rather than a themed-icon name, or even no name
        at all. In these cases the generic "gtk-missing-icon" icon is used.</strikethrough>

        Odyseus note: I switched to a Gio.Icon. Simply because that's what Gio.AppInfo provides.
        And the icon is practically guaranteed to show up be it a named icon or a path to an image.

        """

        # I added this filter because there are more that 200 screen savers in Linux Mint. ¬¬
        # They were unnecessarily slowing the heck out the loading of the list of applications.
        # At this point in time, none of the tweaks that makes use of this AppChooserWidget
        # would require to choose a screen saver from the list, so I happily ignore them for now.
        def filter_list(x):
            #  if "screensaver" in str(x.get_id()).lower():
            # I think that is more precise to check the start of the app ID. (?)
            # The following condition filters out all .desktop files that
            # are inside a folder called "screensavers".
            if str(x.get_id()).lower().startswith("screensavers-"):
                return False

            if self.show_no_display:
                return True
            else:
                return not x.get_nodisplay()

        self.app_list = list(filter(filter_list, Gio.AppInfo.get_all()))

        for i in range(0, len(self.app_list)):
            app = self.app_list[i]

            if app.get_nodisplay():
                continue

            gio_icon = app.get_icon()

            if gio_icon:
                app_icon = gio_icon
            else:
                app_icon = Gio.Icon.new_for_string("gtk-missing-icon")

            app_name = app.get_display_name()
            iter = self.list_store.append()
            self.list_store.set(iter,
                                [0, 1, 2],
                                [app_name, app_icon, i])

        self.list_store.set_sort_column_id(0, Gtk.SortType.ASCENDING)

    def run(self):
        """Run the dialog to get a selected application."""
        self.populate_app_list()
        self.show_all()
        super().run()
        self.destroy()
        return self.selected_apps

    def set_label(self, text):
        """Set the label text, \"Choose An Application\" by default."""
        self.label.set_text(text)

    def on_ok(self, button):
        """Get Gio.AppInfo of selected application when user presses OK."""
        selection = self.tree_view.get_selection()
        tree_model, paths = selection.get_selected_rows()

        for path in paths:
            tree_iter = tree_model.get_iter(path)
            app_index = tree_model.get_value(tree_iter, 2)
            self.selected_apps.append(self.app_list[app_index])


class MaximusApplicationSetter(Gtk.Button):

    """ MaximusApplicationSetter widget"""

    def __init__(self, key, label):
        Gtk.Button.__init__(self, label)
        self.connect("clicked", self.open_applications_list)
        self._settings = Settings().get_settings()
        self._key = key
        self.columns = {
            "APPINFO": 0,
            "DISPLAY_NAME": 1,
            "ICON": 2
        }

    def open_applications_list(self, widget):
        dialog = Gtk.Dialog(transient_for=self.get_toplevel(),
                            title=_("Applications list"),
                            flags=Gtk.DialogFlags.MODAL)

        content_area = dialog.get_content_area()
        content_area_grid = BaseGrid()
        content_area_grid.set_spacing(0, 0)
        content_area_grid.set_property("margin", 10)
        content_area.add(content_area_grid)

        self._settings.connect("changed::%s" % self._key, self._refresh)
        self._changedPermitted = False

        self._store = Gtk.ListStore()
        self._store.set_column_types([Gio.AppInfo, GObject.TYPE_STRING, Gio.Icon])

        scrolled = Gtk.ScrolledWindow(hadjustment=None, vadjustment=None)
        scrolled.set_size_request(width=300, height=300)
        scrolled.set_shadow_type(type=Gtk.ShadowType.IN)
        scrolled.set_policy(hscrollbar_policy=Gtk.PolicyType.NEVER,
                            vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
        content_area_grid.attach(scrolled, 0, 0, 1, 1)

        self._treeView = Gtk.TreeView()
        self._treeView.set_property("model", self._store)
        self._treeView.set_property("expand", True)
        self._treeView.get_selection().set_mode(Gtk.SelectionMode.SINGLE)

        appColumn = Gtk.TreeViewColumn()
        appColumn.set_property("title", _("Application"))
        appColumn.set_property("expand", True)
        appColumn.set_sort_column_id(self.columns["DISPLAY_NAME"])
        appColumn.set_sort_indicator(True)

        iconRenderer = Gtk.CellRendererPixbuf()
        appColumn.pack_start(iconRenderer, False)
        appColumn.add_attribute(iconRenderer, "gicon", self.columns["ICON"])
        nameRenderer = Gtk.CellRendererText()
        appColumn.pack_start(nameRenderer, True)
        appColumn.add_attribute(nameRenderer, "text", self.columns["DISPLAY_NAME"])
        self._treeView.append_column(appColumn)

        scrolled.add(self._treeView)

        toolbar = Gtk.Toolbar()
        toolbar.set_icon_size(Gtk.IconSize.SMALL_TOOLBAR)
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR)
        content_area_grid.attach(toolbar, 0, 1, 1, 1)

        newButton = Gtk.ToolButton()
        newButton.set_icon_name("bookmark-new-symbolic")
        newButton.set_label(_("Add Application"))
        newButton.set_is_important(True)
        newButton.connect("clicked", self._addApplication)
        toolbar.add(newButton)

        delButton = Gtk.ToolButton()
        delButton.set_icon_name("edit-delete-symbolic")
        delButton.connect("clicked", self._deleteSelected)
        toolbar.add(delButton)

        selection = self._treeView.get_selection()

        def setDelButtonSensitive(sel):
            delButton.sensitive = sel.count_selected_rows() > 0

        selection.connect("changed", setDelButtonSensitive)
        delButton.sensitive = selection.count_selected_rows() > 0

        self._changedPermitted = True
        self._refresh(self)

        content_area.show_all()
        dialog.run()

        dialog.destroy()
        return None

    def _addApplication(self, widget):
        """ I had to redesign this because Gtk.AppChooserWidget doesn't list even
        half of the applications that are installed in the system!!! ¬¬
        """
        app_chooser = AppChooserWidget(
            parent=self.get_toplevel(),
            multi_selection=True)
        app_chooser.set_label(_("Choose one or more applications (Hold Ctrl key)"))
        appsInfo = app_chooser.run()

        if appsInfo is not None and len(appsInfo) > 0:
            self.on_add_app_dialog_response(appsInfo)

    def _appendItem(self, id):
        currentApplications = self._settings.get_strv(self._key)
        currentApplications.append(str(id))
        self._settings.set_strv(self._key, currentApplications)

    def on_add_app_dialog_response(self, appsInfo):
        if not appsInfo or len(appsInfo) <= 0:
            return

        self._changedPermitted = False

        for a_i in appsInfo:
            self._appendItem(a_i.get_id())

            iter = self._store.append()

            self._store.set(iter, [
                self.columns["APPINFO"],
                self.columns["ICON"],
                self.columns["DISPLAY_NAME"]
            ], [
                a_i,
                a_i.get_icon(),
                a_i.get_display_name()
            ])

        self._changedPermitted = True

    def _deleteSelected(self, widget):
        [model, iter] = self._treeView.get_selection().get_selected()
        # This doesn't work. ¬¬ Is the exact same method returning totally different
        # values in JavaScript and in Python? Who knows!?
        # [any, model, iter] = self._treeView.get_selection().get_selected()

        # if any:
        if iter:
            appInfo = self._store.get_value(iter, self.columns["APPINFO"])

            self._changedPermitted = False
            self._removeItem(appInfo.get_id())
            self._changedPermitted = True
            self._store.remove(iter)

    def _removeItem(self, id):
        currentApplications = self._settings.get_strv(self._key)

        index = currentApplications.index(id)

        if (index < 0):
            return

        # currentApplications.splice(index, 1)
        # I love how Python is designed to be readable. ¬¬
        currentApplications = currentApplications[:index] + currentApplications[index + 1:]
        self._settings.set_strv(self._key, currentApplications)

    def _refresh(self, widget, data=None):
        if not self._changedPermitted:
            # Ignore this notification, model is being modified outside
            return

        self._store.clear()

        currentApplications = self._settings.get_strv(self._key)
        validApplications = []
        for i in range(0, len(currentApplications)):
            id = currentApplications[i]

            # Needed just in case there is an application in the list and then
            # that application is uninstalled.
            # If the application doesn't exists anymore, the first dialog
            # will fail to open.
            try:
                appInfo = Gio.DesktopAppInfo.new(id)
            except:
                appInfo = None

            if not appInfo:
                continue

            validApplications.append(currentApplications[i])

            iter = self._store.append()

            self._store.set(iter, [
                self.columns["APPINFO"],
                self.columns["ICON"],
                self.columns["DISPLAY_NAME"]
            ], [
                appInfo,
                appInfo.get_icon(),
                appInfo.get_display_name()
            ])

        if (len(validApplications) != len(currentApplications)):  # some items were filtered out
            self._settings.set_strv(self._key, validApplications)

        # The following line auto sorts the list at start up!!! Finally!!!
        self._store.set_sort_column_id(self.columns["DISPLAY_NAME"], Gtk.SortType.ASCENDING)


class AutoMovedWindowsSetter(Gtk.Button):

    """ AutoMovedWindowsSetter widget

    This class is based on the pref.js file found on the gnome-shell extension called Auto Move Windows.
    https://github.com/GNOME/gnome-shell-extensions/blob/master/extensions/auto-move-windows/prefs.js
    """

    def __init__(self, key, label):
        Gtk.Button.__init__(self, label)
        self.connect("clicked", self.open_rules_editor)
        self._settings = Settings().get_settings()
        self._key = key
        # compiled in limit of mutter - Original comment
        # Which must mean that the maximum number of workspaces
        # is hard-coded in mutter's/muffin's source code.
        self.max_number_workspaces = 36
        self.columns = {
            "APPINFO": 0,
            "DISPLAY_NAME": 1,
            "ICON": 2,
            "WORKSPACE": 3,
            "ADJUSTMENT": 4
        }

    def open_rules_editor(self, widget):
        dialog = Gtk.Dialog(transient_for=self.get_toplevel(),
                            title=_("Auto move windows rules"),
                            flags=Gtk.DialogFlags.MODAL)

        content_area = dialog.get_content_area()
        content_area_grid = BaseGrid()
        content_area_grid.set_spacing(0, 0)
        content_area_grid.set_property("margin", 10)
        content_area.add(content_area_grid)

        self._settings.connect("changed::window-auto-move-application-list", self._refresh)
        self._changedPermitted = False

        self._store = Gtk.ListStore()
        self._store.set_column_types([Gio.AppInfo, GObject.TYPE_STRING, Gio.Icon, GObject.TYPE_INT,
                                      Gtk.Adjustment])

        scrolled = Gtk.ScrolledWindow(hadjustment=None, vadjustment=None)
        scrolled.set_size_request(width=500, height=300)
        scrolled.set_shadow_type(type=Gtk.ShadowType.IN)
        scrolled.set_policy(hscrollbar_policy=Gtk.PolicyType.NEVER,
                            vscrollbar_policy=Gtk.PolicyType.AUTOMATIC)
        content_area_grid.attach(scrolled, 0, 0, 1, 1)

        self._treeView = Gtk.TreeView()
        self._treeView.set_property("model", self._store)
        self._treeView.set_property("expand", True)
        self._treeView.get_selection().set_mode(Gtk.SelectionMode.SINGLE)

        appColumn = Gtk.TreeViewColumn()
        appColumn.set_property("title", _("Application"))
        appColumn.set_property("expand", True)
        appColumn.set_sort_column_id(self.columns["DISPLAY_NAME"])
        appColumn.set_sort_indicator(True)

        iconRenderer = Gtk.CellRendererPixbuf()
        appColumn.pack_start(iconRenderer, False)
        appColumn.add_attribute(iconRenderer, "gicon", self.columns["ICON"])
        nameRenderer = Gtk.CellRendererText()
        appColumn.pack_start(nameRenderer, True)
        appColumn.add_attribute(nameRenderer, "text", self.columns["DISPLAY_NAME"])
        self._treeView.append_column(appColumn)

        workspaceColumn = Gtk.TreeViewColumn()
        workspaceColumn.set_property("title", _("Workspace"))
        workspaceColumn.set_sort_column_id(self.columns["WORKSPACE"])
        workspaceRenderer = Gtk.CellRendererSpin()
        workspaceRenderer.set_property("editable", True)
        workspaceRenderer.connect("edited", self._workspaceEdited)
        workspaceColumn.pack_start(workspaceRenderer, True)
        workspaceColumn.add_attribute(workspaceRenderer, "adjustment",
                                      self.columns["ADJUSTMENT"])
        workspaceColumn.add_attribute(workspaceRenderer, "text", self.columns["WORKSPACE"])
        self._treeView.append_column(workspaceColumn)

        scrolled.add(self._treeView)

        toolbar = Gtk.Toolbar()
        toolbar.set_icon_size(Gtk.IconSize.SMALL_TOOLBAR)
        toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR)
        content_area_grid.attach(toolbar, 0, 1, 1, 1)

        newButton = Gtk.ToolButton()
        newButton.set_icon_name("bookmark-new-symbolic")
        newButton.set_label(_("Add Rule"))
        newButton.set_is_important(True)
        newButton.connect("clicked", self._createNewRule)
        toolbar.add(newButton)

        delButton = Gtk.ToolButton()
        delButton.set_icon_name("edit-delete-symbolic")
        delButton.connect("clicked", self._deleteSelected)
        toolbar.add(delButton)

        selection = self._treeView.get_selection()

        def setDelButtonSensitive(sel):
            delButton.sensitive = sel.count_selected_rows() > 0

        selection.connect("changed", setDelButtonSensitive)
        delButton.sensitive = selection.count_selected_rows() > 0

        self._changedPermitted = True
        self._refresh(self)

        content_area.show_all()
        dialog.run()

        dialog.destroy()
        return None

    def _createNewRule(self, widget):
        """ I had to redesign this because Gtk.AppChooserWidget doesn't list even
        half of the applications that are installed in the system!!! ¬¬
        """
        app_chooser = AppChooserWidget(
            parent=self.get_toplevel(),
            multi_selection=True)
        app_chooser.set_label(_("Choose one or more applications (Hold Ctrl key)"))
        appsInfo = app_chooser.run()

        if appsInfo is not None and len(appsInfo) > 0:
            self.on_add_app_dialog_response(appsInfo)

    def on_add_app_dialog_response(self, appsInfo):
        if not appsInfo or len(appsInfo) <= 0:
            return

        workspace = 1

        self._changedPermitted = False

        for a_i in appsInfo:
            self._appendItem(a_i.get_id(), workspace)

            iter = self._store.append()
            adj = Gtk.Adjustment(lower=1,
                                 upper=self.max_number_workspaces,
                                 step_increment=1,
                                 value=workspace)

            self._store.set(iter, [
                self.columns["APPINFO"],
                self.columns["ICON"],
                self.columns["DISPLAY_NAME"],
                self.columns["WORKSPACE"],
                self.columns["ADJUSTMENT"]
            ], [
                a_i,
                a_i.get_icon(),
                a_i.get_display_name(),
                workspace,
                adj
            ])

        self._changedPermitted = True

    def _deleteSelected(self, widget):
        [model, iter] = self._treeView.get_selection().get_selected()
        # This doesn't work. ¬¬ Is the exact same method returning totally different
        # values in JavaScript and in Python? Who knows!?
        # [any, model, iter] = self._treeView.get_selection().get_selected()

        # if any:
        if iter:
            appInfo = self._store.get_value(iter, self.columns["APPINFO"])

            self._changedPermitted = False
            self._removeItem(appInfo.get_id())
            self._changedPermitted = True
            self._store.remove(iter)

    def _workspaceEdited(self, renderer, pathString, text):
        try:
            index = int(text)
        except:
            index = text

        if (math.isnan(index) or index < 0):
            index = 1

        path = Gtk.TreePath.new_from_string(pathString)
        iter = self._store.get_iter(path)
        appInfo = self._store.get_value(iter, self.columns["APPINFO"])

        self._changedPermitted = False
        self._changeItem(appInfo.get_id(), index)
        self._store.set_value(iter, self.columns["WORKSPACE"], index)
        self._changedPermitted = True

    def _refresh(self, widget, data=None):
        if not self._changedPermitted:
            # Ignore this notification, model is being modified outside
            return

        self._store.clear()

        currentItems = self._settings.get_strv(self._key)
        validItems = []
        for i in range(0, len(currentItems)):
            [id, workspace] = currentItems[i].split(":")

            # Needed just in case there is an application in the list and then
            # that application is uninstalled.
            # If the application doesn't exists anymore, the first dialog
            # will fail to open.
            try:
                appInfo = Gio.DesktopAppInfo.new(id)
            except:
                appInfo = None

            if not appInfo:
                continue

            validItems.append(currentItems[i])

            iter = self._store.append()
            adj = Gtk.Adjustment(lower=1,
                                 upper=self.max_number_workspaces,
                                 step_increment=1,
                                 value=int(workspace))

            self._store.set(iter, [
                self.columns["APPINFO"],
                self.columns["ICON"],
                self.columns["DISPLAY_NAME"],
                self.columns["WORKSPACE"],
                self.columns["ADJUSTMENT"]
            ], [
                appInfo,
                appInfo.get_icon(),
                appInfo.get_display_name(),
                int(workspace),
                adj
            ])

        if (len(validItems) != len(currentItems)):  # some items were filtered out
            self._settings.set_strv(self._key, validItems)

        # The following line auto sorts the list at start up!!! Finally!!!
        self._store.set_sort_column_id(self.columns["DISPLAY_NAME"], Gtk.SortType.ASCENDING)

    def _checkId(self, id):
        items = self._settings.get_strv(self._key)
        return not any(i.startswith(id + ":") for i in items)

    def _appendItem(self, id, workspace):
        currentItems = self._settings.get_strv(self._key)
        currentItems.append(str(id) + ":" + str(workspace))
        self._settings.set_strv(self._key, currentItems)

    def _removeItem(self, id):
        currentItems = self._settings.get_strv(self._key)

        def get_app_ids_from_array(el):
            return el.split(":")[0]

        array = list(map(get_app_ids_from_array, currentItems))

        index = array.index(id)

        if (index < 0):
            return

        # currentItems.splice(index, 1)
        # I love how Python is designed to be readable. ¬¬
        currentItems = currentItems[:index] + currentItems[index + 1:]
        self._settings.set_strv(self._key, currentItems)

    def _changeItem(self, id, workspace):
        currentItems = self._settings.get_strv(self._key)

        def get_app_ids_from_array(el):
            return el.split(":")[0]

        array = list(map(get_app_ids_from_array, currentItems))

        index = array.index(id)

        if (index < 0):
            currentItems.append(str(id) + ":" + str(workspace))
        else:
            currentItems[index] = str(id) + ":" + str(workspace)

        self._settings.set_strv(self._key, currentItems)


class KeybindingsTreeViewWidget(BaseGrid):

    """ KeybindingsTreeViewWidget tree widget """

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

        self.settings = Settings().get_settings()

        if (self.settings.get_boolean("window-remember-size")):
            width = self.settings.get_int("window-width")
            height = self.settings.get_int("window-height")
            self.set_default_size(width, height)
        else:
            if Gdk.Screen.get_default().get_height() < 800:
                self.maximize()
            else:
                self.set_default_size(800, 500)

        self.set_position(Gtk.WindowPosition.CENTER)
        self.set_icon_from_file(os.path.join(EXTENSION_DIR, "icon.png"))

        main_box = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)

        left_box = self.create_sidebar()
        right_box = self.main_content()

        main_box.attach(left_box, 0, 0, 1, 1)
        main_box.attach(Gtk.Separator(orientation=Gtk.Orientation.VERTICAL), 1, 0, 1, 1)
        main_box.attach(right_box, 2, 0, 1, 1)

        self.load_css()

        self.add(main_box)

    def _on_select_row(self, listbox, row):
        if row:
            group = row.get_child().get_text()
            self.stack.set_visible_child_name(group)

            if self.settings.get_boolean("window-remember-last-category"):
                self.settings.set_int("window-last-category-selected", int(row.get_index()))

    def load_css(self):
        css_provider = Gtk.CssProvider()
        # css_provider.load_from_path(
        #     os.path.join(EXTENSION_DIR, "stylesheet.css"))
        # Loading from data so I don't have to deal with a style sheet file
        # with just a couple of lines of code.
        css_provider.load_from_data(str.encode(
            """
            .cinnamon-tweaks-category:not(:selected):not(:hover),
            .cinnamon-tweaks-categories {
                background-color: @theme_bg_color;
            }
            .cinnamon-tweaks-category {
                font-weight: bold;
                padding: 10px;
            }
            .cinnamon-tweaks-section-warning-button:hover,
            .cinnamon-tweaks-section-warning-button {
                /*-GtkButton-default-border : 0;
                -GtkButton-default-outside-border : 0;
                -GtkButton-inner-border: 0;
                -GtkWidget-focus-line-width : 0;
                -GtkWidget-focus-padding : 0;*/
                padding: 0;
            }
            """
        ))

        screen = Gdk.Screen.get_default()
        context = Gtk.StyleContext()
        context.add_provider_for_screen(screen, css_provider,
                                        Gtk.STYLE_PROVIDER_PRIORITY_USER)

    def main_content(self):
        right_box = BaseGrid(orientation=Gtk.Orientation.VERTICAL)

        self.stack = Gtk.Stack()
        toolbar = self.toolbar()

        right_box.attach(toolbar, 0, 0, 1, 1)
        right_box.attach(self.stack, 0, 1, 1, 1)

        return right_box

    def create_sidebar(self):
        left_box = BaseGrid()
        left_box.set_property("margin", 0)

        self.sidebar = Gtk.ListBox()
        self.sidebar.get_style_context().add_class("cinnamon-tweaks-categories")
        self.sidebar.set_size_request(150, -1)
        self.sidebar.set_property("vexpand", True)
        self.sidebar.connect("row-selected", self._on_select_row)
        self.sidebar.set_header_func(self._list_header_func, None)

        scroll = Gtk.ScrolledWindow()
        scroll.set_policy(Gtk.PolicyType.NEVER,
                          Gtk.PolicyType.AUTOMATIC)
        scroll.add(self.sidebar)

        left_box.attach(scroll, 0, 0, 1, 1)

        return left_box

    def _list_header_func(self, row, before, user_data):
        if before and not row.get_header():
            row.set_header(Gtk.Separator(orientation=Gtk.Orientation.HORIZONTAL))

    def toolbar(self):
        box = BaseGrid(orientation=Gtk.Orientation.HORIZONTAL)
        box.set_property("hexpand", True)
        box.set_property("vexpand", False)
        box.set_property("margin", 15)

        info_label = Widgets().info_label(
            _("Settings marked with (*) needs Cinnamon restart to take effect"),
            bold=True,
            italic=True
        )
        info_label.set_valign(Gtk.Align.CENTER)
        info_label.set_property("hexpand", True)

        menu_popup = Gtk.Menu()
        menu_popup.set_halign(Gtk.Align.END)
        menu_popup.append(self.createMenuItem(text=_("Reset settings to defaults"),
                                              callback=self._restore_default_values))
        menu_popup.append(self.createMenuItem(text=_("Import settings from a file"),
                                              callback=self._import_settings))
        menu_popup.append(self.createMenuItem(text=_("Export settings to a file"),
                                              callback=self._export_settings))
        menu_popup.append(Gtk.SeparatorMenuItem())

        rem_win_size_check = self.createCheckMenuItem(
            _("Remember window size"), key="window-remember-size")

        if rem_win_size_check is not None:
            menu_popup.append(rem_win_size_check)

        rem_last_cat_check = self.createCheckMenuItem(
            _("Remember last category"), key="window-remember-last-category")

        if rem_last_cat_check is not None:
            menu_popup.append(rem_last_cat_check)
            menu_popup.append(Gtk.SeparatorMenuItem())

        menu_popup.append(self.createMenuItem(text=_("Restart Cinnamon"),
                                              callback=self._restart_cinnamon))
        menu_popup.append(Gtk.SeparatorMenuItem())

        menu_popup.append(self.createMenuItem(text=_("Help"),
                                              callback=self.open_help_page))
        menu_popup.append(self.createMenuItem(text=_("About"),
                                              callback=self.open_about_dialog))

        menu_popup.show_all()
        menu_button = Gtk.MenuButton()
        menu_button.set_popup(menu_popup)
        menu_button.add(Gtk.Image.new_from_icon_name("open-menu-symbolic", Gtk.IconSize.MENU))
        menu_button.set_tooltip_text(_("Manage settings"))

        box.attach(info_label, 0, 0, 1, 1)
        box.attach(menu_button, 3, 0, 1, 1)

        return box

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

    # A million thanks to the """geniuses""" ($%&½€#&) at Gnome for
    # deprecating Gtk.ImageMenuItem!!! ¬¬
    def createMenuItem(self, text, callback):
        item = Gtk.MenuItem(text)

        if (callback is not None):
            item.connect("activate", callback)

        return item

    def _restore_default_values(self, widget):
        dialog = Gtk.MessageDialog(transient_for=app.window,
                                   modal=False,
                                   message_type=Gtk.MessageType.WARNING,
                                   buttons=Gtk.ButtonsType.YES_NO)

        dialog.set_title(_("Warning: Trying to reset all Cinnamon Tweaks settings!!!"))

        esc = cgi.escape(_("Reset all Cinnamon Tweaks settings to default?"))
        dialog.set_markup(esc)
        dialog.show_all()
        response = dialog.run()
        dialog.destroy()

        if response == Gtk.ResponseType.YES:
            os.system("gsettings reset-recursively %s &" % SCHEMA_NAME)
            app.on_quit(self)

    def _import_settings(self, widget):
        self._import_export_settings(self, export=False)

    def _export_settings(self, widget):
        self._import_export_settings(self, export=True)

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
            app.on_quit(self)

        dialog.destroy()

    def _restart_cinnamon(self, widget):
        os.system("nohup cinnamon --replace >/dev/null 2>&1&")


class ExtensionPrefsApplication(Gtk.Application):

    def __init__(self, *args, **kwargs):
        GLib.set_application_name(_("Cinnamon Tweaks"))
        super().__init__(*args,
                         application_id=APPLICATION_ID,
                         flags=Gio.ApplicationFlags.FLAGS_NONE,
                         **kwargs)

        if os.path.exists("%s/metadata.json" % EXTENSION_DIR):
            raw_data = open("%s/metadata.json" % EXTENSION_DIR).read()

            try:
                self.extension_meta = json.loads(raw_data)
            except:
                self.extension_meta = None
        else:
            self.extension_meta = None

        self.application = Gtk.Application()
        self.application.connect("activate", self.do_activate)
        self.application.connect("startup", self.do_startup)
        self.settings = Settings().get_settings()

    def do_activate(self, data=None):
        self.window.present()

    def do_startup(self, data=None):
        Gtk.Application.do_startup(self)
        self._buildUI()

    # The only way I found to get the correct window size when closing the window.
    def on_delete_event(self, widget, data=None):
        [width, height] = self.window.get_size()

        if (self.settings.get_boolean("window-remember-size")):
            self.settings.set_int("window-width", width)
            self.settings.set_int("window-height", height)

        return False

    def _buildUI(self):
        self.window = ExtensionPrefsWindow(
            application=self, title=_("Cinnamon Tweaks extension preferences"))

        self.window.connect("destroy", self.on_quit)
        self.window.connect("delete_event", self.on_delete_event)

        populate_settings_box()

        if self.settings.get_boolean("window-remember-last-category"):
            widget = self.window.sidebar.get_row_at_index(
                self.settings.get_int("window-last-category-selected"))
        else:
            widget = self.window.sidebar.get_row_at_index(0)
        self.window.sidebar.select_row(widget)

        self.window.show_all()

    def on_quit(self, action):
        self.quit()


def display_warning_message(widget, title, message):
    dialog = Gtk.MessageDialog(transient_for=app.window,
                               title=title,
                               modal=True,
                               message_type=Gtk.MessageType.WARNING,
                               buttons=Gtk.ButtonsType.OK)

    # try:
    #     esc = cgi.escape(message)
    # except:
    esc = message

    dialog.set_markup(esc)
    dialog.show_all()
    dialog.run()
    dialog.destroy()


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
