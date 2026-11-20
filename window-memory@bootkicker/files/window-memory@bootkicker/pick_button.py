# SPDX-License-Identifier: GPL-3.0-or-later
# Window Memory: the "Pick a window" row of the settings dialog.
# A custom widget in place of the plain schema button: a crosshair icon before the
# label, and a border in the theme's selection colour. It does what the plain button
# does: it asks Cinnamon to run the extension callback named in the schema.
#
# cinnamon-settings builds it for a schema item of type "custom"
# (xlet-settings.py:474-491, called at :457) as PickWindowButton(item, key, settings),
# where item is the schema entry, key is "pick-window" and settings is the
# JSONSettingsHandler of the instance. The result has to be a SettingsWidget (:460-461).

import gettext
import os
import sys

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gio, GLib, Gtk
# SettingsWidget is the class cinnamon-settings checks with isinstance (bin/SettingsWidgets.py:10
# re-exports it). SettingsPage is the container it puts every row of the schema in
# (xlet-settings.py:432-433 builds it, :472 adds each row; xapp/SettingsWidgets.py:122).
from xapp.SettingsWidgets import SettingsPage, SettingsWidget

UUID = 'window-memory@bootkicker'

# The texts the user reads are translated in the domain of the uuid, from the .mo files that the
# Spices installer compiles into ~/.local/share/locale (bin/Spices.py:733-737), the folder
# cinnamon-settings looks in first (xlet-settings.py:67-75). Each custom file has its own copy of
# these lines: cinnamon-settings loads each one on its own. The log lines (warn) stay in English.
_TRANSLATIONS = gettext.translation(UUID, os.path.join(GLib.get_home_dir(), '.local', 'share', 'locale'), fallback=True)


def _(text):
    return _TRANSLATIONS.gettext(text)


# The schema key of the "Enable Window Memory" switch. While it is off, this button and every
# other row of the page are greyed out (see _follow_enabled and _grey_out_other_rows), except
# a row with the attribute always_sensitive (the "Version" row, version_info.py).
ENABLED_KEY = 'enabled'

# The schema key of the never-remember list, the stock list type of cinnamon-settings
# (bin/TreeListWidgets.py, class List). Once the page is shown it is made shorter (see _shorten_list).
LIST_KEY = 'excluded-apps'

# The list is made this fraction of the height it has when the page is first shown (200 px, the
# stock list's default). This constant is the only place in the extension. The width is not
# touched. It must change together with the project's tests and manual test list, which say two
# thirds too.
LIST_HEIGHT_FACTOR = 2.0 / 3.0

# The schema key of the most windows the extension remembers. It is not a row of the page: once the
# page is shown, a compact spin button for it is put at the right end of the never-remember list's
# toolbar, the row of its + - edit up down buttons (see _add_max_windows). The range and the step are
# the schema's "min", "max" and "step" of the key (tests/pick-button.test.js checks they are equal).
MAX_ENTRIES_KEY = 'max-entries'
MAX_ENTRIES_MIN = 10
MAX_ENTRIES_MAX = 5000
MAX_ENTRIES_STEP = 10

# The column header of a list (the "Never remember these applications" title) is a separate
# button inside the Gtk.TreeView. It gets the insensitive state like the rest of the list,
# but the stock Mint and GTK themes draw it the same as when enabled (Mint-X only slightly
# lighter). Half opacity, only while disabled, dims it about as much as the disabled labels
# of the other rows. The enabled look is untouched: the rule never matches then.
HEADER_CSS_CLASS = 'window-memory-header'
HEADER_CSS = ('.%s:disabled { opacity: 0.5; }' % HEADER_CSS_CLASS).encode('utf-8')

# Mint-Y and Mint-Y-Yaru inherit Adwaita, which ships this icon, so lookup_icon finds it there
# and users see the Adwaita icon. The character below is only for an icon theme chain
# without it. The Ubuntu font has no U+2316, so GTK takes the glyph from a fallback font
# (FreeSerif or Symbola, if one is installed).
ICON_NAME = 'find-location-symbolic'
FALLBACK_GLYPH = '⌖'  # POSITION INDICATOR, a crosshair

# How long cinnamon-settings waits for Cinnamon, in milliseconds, before the click gives up.
CALL_TIMEOUT_MS = 5000

# @theme_selected_bg_color is the selection colour of Adwaita-based themes, Mint-Y
# included (orange, #ff7139, in Mint-Y-Dark-Orange). A name the theme does not define is
# not a CSS error: the colour is looked up when the widget is styled, and the border is
# then drawn in the text colour (the same pixels as `currentColor`).
# The border is 1px, as wide as the theme's own button border. box-shadow: none removes the
# outer shadow some themes (Mint-X, Adwaita, HighContrast) give buttons: it is a 1px darker
# line on each side, outside our border. The focus outline is left alone, so keyboard focus
# stays visible.
# Both only while the button is not disabled (GTK 3.20+ accepts :not(:disabled)). The
# button is disabled while "Enable Window Memory" is off, and then it is the theme's own
# disabled button: a selection-coloured border there would make it look clickable.
CSS_CLASS = 'window-memory-pick'
CSS = ('.%s:not(:disabled) { border: 1px solid @theme_selected_bg_color; box-shadow: none; }'
       % CSS_CLASS).encode('utf-8')


def warn(message):
    print('window-memory: ' + message, file=sys.stderr)


class PickWindowButton(SettingsWidget):
    # An exception raised in __init__ stops cinnamon-settings from building the whole page:
    # create_custom_widget calls the class outside any try (xlet-settings.py:491), and its
    # callers have none either (:457, :413). So keep __init__ defensive: what depends on the
    # theme or on GTK is wrapped in try, logged, and given a plain fallback.
    def __init__(self, info, key, settings):
        super(PickWindowButton, self).__init__()
        self.key = key
        self.settings = settings
        self.callback = str(info['callback'])
        self.uuid = UUID
        # A single-instance xlet such as an extension has one settings file named after
        # its uuid, and the handler's instance_id is that file name (xlet-settings.py:307-308,
        # :328). The plain button sends the same value (:409, :453).
        self.instance_id = str(getattr(settings, 'instance_id', None) or UUID)
        self.label = info['description']
        self._proxy = None
        self._page_done = False

        self.content_widget = Gtk.Button()
        self.content_widget.connect('clicked', self._on_clicked)

        row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        row.set_halign(Gtk.Align.CENTER)
        text = self.label
        try:
            has_icon = self._theme_has_icon()
        except Exception as e:
            warn('could not look up the %s icon: %s' % (ICON_NAME, e))
            has_icon = False
        if has_icon:
            row.pack_start(Gtk.Image.new_from_icon_name(ICON_NAME, Gtk.IconSize.BUTTON), False, False, 0)
        else:
            text = FALLBACK_GLYPH + ' ' + text
        row.pack_start(Gtk.Label(label=text), False, False, 0)
        self.content_widget.add(row)

        try:
            self._apply_border()
        except Exception as e:
            warn('could not style the button border: %s' % e)
        self.pack_start(self.content_widget, True, True, 0)

        if info.get('tooltip'):
            self.set_tooltip_text(info['tooltip'])

        try:
            self._follow_enabled()
        except Exception as e:
            # Fails open: the button stays usable, as it was before it followed the switch.
            warn('could not follow the "%s" setting: %s' % (ENABLED_KEY, e))

    def _follow_enabled(self):
        # Grey out the whole row, and block its click, while "Enable Window Memory" is off.
        # The "dependency" key of a schema item cannot do this: it hides the row instead
        # (JSONSettingsRevealer, a Gtk.Revealer, bin/JsonSettingsWidgets.py:229-270).
        # settings is the instance's JSONSettingsHandler. Its bind() sets the property to the
        # key's current value at once (bin/JsonSettingsWidgets.py:70-71, with GET) and again
        # on every later change: the switch being flipped (:108-118), set_value (:90-92), the
        # settings file changing on disk (:134-142). It is the call the stock widgets make in
        # JSONSettingsBackend.attach (:283). GET only: the widget never writes the key back.
        self.settings.bind(ENABLED_KEY, self, 'sensitive', Gio.SettingsBindFlags.GET)
        # The other rows cannot be reached from the schema, so this widget does it for them
        # once the page is shown (see _on_map).
        self.connect('map', self._on_map)

    def _on_map(self, *args):
        # Once: when the page is first shown. By then cinnamon-settings has added every row,
        # because it builds the whole page before showing it (xlet-settings.py:431-472).
        # The page pass has three steps. They do not depend on each other, so one failing does not
        # stop the others.
        if self._page_done:
            return
        self._page_done = True
        try:
            self._grey_out_other_rows()
        except Exception as e:
            # Fails open: the rows stay usable, as before.
            warn('could not grey out the other settings: %s' % e)
        try:
            self._shorten_list()
        except Exception as e:
            # Fails open: the list keeps the height the stock list gave it.
            warn('could not shorten the %s list: %s' % (LIST_KEY, e))
        try:
            self._add_max_windows()
        except Exception as e:
            # Fails to nothing: no spin button, and the extension keeps reading max-entries from the
            # settings file (500 unless it was changed before).
            warn('could not add the Max windows spin button to the %s list: %s' % (LIST_KEY, e))

    def _page_rows(self):
        # The rows of the settings page this button is on: every SettingsWidget below the
        # SettingsPage (xapp/SettingsWidgets.py:122), this button included.
        page = self.get_parent()
        while page is not None and not isinstance(page, SettingsPage):
            page = page.get_parent()
        if page is None:
            raise RuntimeError('the button is not on a settings page')
        return self._descendants(page, SettingsWidget)

    def _grey_out_other_rows(self):
        # Bind every other row of the page to the same key, the way _follow_enabled binds this
        # one. A row is a SettingsWidget: the JSON widgets (set up by json_settings_factory,
        # which also sets .key, bin/JsonSettingsWidgets.py:315-318), the custom widgets (this
        # one, the forget-all row in forget_button.py, which relies on this pass to be greyed
        # out, and the version row) and any plain schema button (XLETSettingsButton, a Button,
        # xlet-settings.py:57). Their children (a list's tree and its five tool buttons, a
        # keybinding's two buttons) follow the row because GTK passes insensitivity down to
        # children.
        rows = self._page_rows()
        # The switch itself must stay usable, or it could never be turned back on. If it
        # cannot be told apart from the others, grey nothing out.
        if not any(getattr(row, 'key', None) == ENABLED_KEY for row in rows):
            raise RuntimeError('the "%s" switch is not on the page' % ENABLED_KEY)
        for row in rows:
            # A row that says it is always_sensitive is left alone too: the "Version" row
            # (version_info.py) shows information, not a setting, and its commit link should
            # keep working. The attribute is how a row asks for this; there is no list of keys here.
            if row is self or getattr(row, 'key', None) == ENABLED_KEY or getattr(row, 'always_sensitive', False):
                continue
            try:
                self.settings.bind(ENABLED_KEY, row, 'sensitive', Gio.SettingsBindFlags.GET)
                for tree in self._descendants(row, Gtk.TreeView):
                    self._dim_headers_when_disabled(tree)
            except Exception as e:
                warn('could not grey out %s: %s' % (getattr(row, 'key', type(row).__name__), e))

    def _shorten_list(self):
        # The never-remember list is the stock list of cinnamon-settings (bin/TreeListWidgets.py,
        # class List). It puts its Gtk.TreeView in a Gtk.ScrolledWindow and gives that window its
        # height with set_size_request(-1, height) (:119-120): 200, unless the schema item says
        # "height". So the height can be read now, without waiting for a size allocation, and the
        # same call changes it. Only the height is replaced. The width request (-1: whatever width
        # the page gives) and the scroll policy are left as they are, so the list is as wide as
        # before and still scrolls. A list that has no height request of its own is left alone.
        windows = self._descendants(self._list_row(), Gtk.ScrolledWindow)
        if len(windows) != 1:
            raise RuntimeError('the "%s" row holds %d scrolled windows, not one' % (LIST_KEY, len(windows)))
        width, height = windows[0].get_size_request()
        if height <= 0:
            raise RuntimeError('its scrolled window has no height request to take a share of (%d)' % height)
        windows[0].set_size_request(width, int(round(height * LIST_HEIGHT_FACTOR)))

    def _list_row(self):
        # The row of the never-remember list on this button's page.
        lists = [row for row in self._page_rows() if getattr(row, 'key', None) == LIST_KEY]
        if len(lists) != 1:
            raise RuntimeError('%d rows have the key "%s", not one' % (len(lists), LIST_KEY))
        return lists[0]

    def _add_max_windows(self):
        # The stock list packs a Gtk.Toolbar below its scrolled window and inserts its five tool
        # buttons at 0 to 4 (bin/TreeListWidgets.py, List.__init__, show_buttons). Two items are
        # added after them: an invisible separator that takes the free width (set_draw(False),
        # set_expand(True): the toolbar gives an expanding item the width left over), which pushes
        # the second one, a tool item with the label and the spin button, to the right end. The
        # items live inside the list row, so they are greyed out with it while "Enable Window
        # Memory" is off (_grey_out_other_rows binds the row; GTK passes insensitivity down).
        toolbars = self._descendants(self._list_row(), Gtk.Toolbar)
        if len(toolbars) != 1:
            raise RuntimeError('the "%s" row holds %d toolbars, not one' % (LIST_KEY, len(toolbars)))
        spin = Gtk.SpinButton()
        # The range comes before the binding: bind() sets the value at once, and a spin button
        # without a range would clamp it to 0 and write that back to the key.
        spin.set_range(MAX_ENTRIES_MIN, MAX_ENTRIES_MAX)
        spin.set_increments(MAX_ENTRIES_STEP, MAX_ENTRIES_STEP)
        spin.set_digits(0)
        spin.set_numeric(True)
        # JSONSettingsHandler.bind (bin/JsonSettingsWidgets.py, bind) turns DEFAULT into GET | SET:
        # GET sets "value" from the key now and on every later change (set_value, the file changing
        # on disk); SET connects notify::value and writes the key (object_value_changed ->
        # set_value, which writes only a value that differs). "value" is a double, so map_set gives
        # the key the whole number the schema default is (500, not 500.0). If bind raises (a page
        # without the key), nothing has been added to the toolbar yet.
        self.settings.bind(MAX_ENTRIES_KEY, spin, 'value', Gio.SettingsBindFlags.DEFAULT,
                           map_set=lambda value: int(round(value)))
        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        box.pack_start(Gtk.Label(label=_('Max windows')), False, False, 0)
        box.pack_start(spin, False, False, 0)
        # On the box, which fills the tool item: Gtk.ToolItem.set_tooltip_text puts the text on its
        # child anyway (gtk_tool_item_set_tooltip_text), and only on one that is already there.
        box.set_tooltip_text(_('Maximum remembered windows. The least recently seen windows are dropped first.'))
        item = Gtk.ToolItem()
        item.add(box)
        gap = Gtk.SeparatorToolItem()
        gap.set_draw(False)
        gap.set_expand(True)
        toolbars[0].insert(gap, -1)
        toolbars[0].insert(item, -1)
        # No overflow arrow: a custom tool item has no menu proxy, so on a narrow toolbar the spin
        # button would vanish behind the arrow. Without the arrow the toolbar asks for the width of
        # all its items instead.
        toolbars[0].set_show_arrow(False)
        gap.show()
        item.show_all()

    @staticmethod
    def _descendants(widget, kind):
        # The widgets of class kind at or below widget, without looking inside a match.
        # get_children() gives a container's own children only, which is all that is needed here.
        if isinstance(widget, kind):
            return [widget]
        found = []
        if isinstance(widget, Gtk.Container):
            for child in widget.get_children():
                found.extend(PickWindowButton._descendants(child, kind))
        return found

    @staticmethod
    def _dim_headers_when_disabled(tree):
        provider = Gtk.CssProvider()
        provider.load_from_data(HEADER_CSS)
        for column in tree.get_columns():
            context = column.get_button().get_style_context()
            context.add_class(HEADER_CSS_CLASS)
            # Added to the header button only, and above the theme, as for the pick button.
            context.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

    @staticmethod
    def _theme_has_icon():
        # lookup_icon rather than has_icon: it also searches the legacy icon folders
        # (linuxmint/cinnamon#13270). 16 px is the size of Gtk.IconSize.BUTTON.
        theme = Gtk.IconTheme.get_default()
        return theme is not None and theme.lookup_icon(ICON_NAME, 16, 0) is not None

    def _apply_border(self):
        provider = Gtk.CssProvider()
        try:
            provider.load_from_data(CSS)
        except GLib.Error as e:
            warn('the button border CSS was rejected: %s' % e.message)
            return
        context = self.content_widget.get_style_context()
        context.add_class(CSS_CLASS)
        # Added to this button only, and above the theme (which is at THEME priority).
        context.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

    def _get_proxy(self):
        # The proxy xlet-settings.py makes for its own buttons (:162-163, :35) is a module
        # global of that script; this builds the same one: same bus, name, path, interface.
        if self._proxy is None:
            # No property cache and no signal subscriptions: the proxy only makes one call.
            flags = Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES | Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS
            self._proxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SESSION, flags, None,
                'org.Cinnamon', '/org/Cinnamon', 'org.Cinnamon', None)
        return self._proxy

    def _on_clicked(self, *args):
        # The same call as XLETSettingsButton.on_activated (xlet-settings.py:65).
        # Cinnamon runs the callback on the object enable() returned
        # (ui/cinnamonDBus.js:359-363, :296-310).
        # The timeout keeps a Cinnamon that does not answer from freezing the settings window
        # for the 25 s D-Bus default (the call is synchronous, as the plain button's is).
        try:
            self._get_proxy().activateCallback('(sss)', self.callback, self.uuid, self.instance_id,
                                               timeout=CALL_TIMEOUT_MS)
        except GLib.Error as e:
            warn('could not run %s in Cinnamon: %s' % (self.callback, e.message))
