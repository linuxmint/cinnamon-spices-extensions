#!/usr/bin/python3

import os
import gettext
import json
from JsonSettingsWidgets import *
from gi.repository import Gtk

try:
    gettext.install('user-shadows@nathan818fr', os.environ['HOME'] + '/.local/share/locale')
except Exception as err:
    print(err)


EXPORT_SCHEMA = 'user-shadows@nathan818fr'
EXPORT_VERSION = 1

PARAMS_TITLES = {
    "radius": _('Radius'),
    "topFade": _('Top Fade'),
    "xOffset": _('X Offset'),
    "yOffset": _('Y Offset'),
    "opacity": _('Opacity'),
}


class CustomClassesWidget(SettingsWidget):
    def __init__(self, info, __key, settings):
        SettingsWidget.__init__(self)

        self.info = info
        self.settings_key = 'customClasses'
        self.settings = settings

        # Load extension variables (transmitted by extension.js)
        evars = settings.get_value('_extensionVars')
        self.shadow_class_names = evars['classNames']
        self.shadow_states = evars['states']
        self.shadow_states_len = len(self.shadow_states)
        self.shadow_params = evars['params']
        self.shadow_params_len = len(self.shadow_params)
        self.presets = evars['presets']

        # Define TreeView columns
        self.columns = [{
            'title': _('Class Name'),
            'type': str,
        }, {
            'title': _('State'),
            'type': str,
        }]
        for param_name, param_props in self.shadow_params.items():
            self.columns.append({
                'title': PARAMS_TITLES[param_name],
                'type': int,
                'param_props': param_props,
            })

        # Setup UI
        self.set_orientation(Gtk.Orientation.VERTICAL)
        self.set_spacing(0)
        self.set_margin_left(0)
        self.set_margin_right(0)
        self.set_border_width(0)

        # - Insert TreeView widget, to view & edit shadow classes
        tv = Gtk.TreeView()
        tv_store_types = [object]
        for column_index, column in enumerate(self.columns):
            tv_store_types.append(column['type'])

            tv_renderer = Gtk.CellRendererText()
            tv_column = Gtk.TreeViewColumn(column['title'], tv_renderer)
            tv_column.add_attribute(tv_renderer, 'text', column_index + 1)
            tv_column.set_resizable(True)
            if 'param_props' not in column:
                tv_column.set_expand(True)
                tv_column.set_alignment(0)
                tv_renderer.set_alignment(0, 0.5)
            else:
                tv_column.set_alignment(0.5)
                tv_renderer.set_alignment(1, 0.5)
                tv_renderer.set_property('editable', True)
                tv_renderer.connect('edited', self.on_tree_view_edited, column_index)
            tv.append_column(tv_column)
        self.tv_store = Gtk.ListStore(*tv_store_types)
        tv.set_model(self.tv_store)

        scrollbox = Gtk.ScrolledWindow()
        scrollbox.set_size_request(-1, 360)
        scrollbox.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        scrollbox.add(tv)
        self.pack_start(scrollbox, True, True, 0)

        # - Insert footer actions
        footer = Gtk.Box()
        self.pack_start(footer, True, True, 0)

        footer_left = Gtk.Box()
        footer_left.set_border_width(5)
        footer_left.set_spacing(5)
        footer.pack_start(footer_left, True, True, 0)

        footer_right = Gtk.Box()
        footer_right.set_border_width(5)
        footer_left.set_spacing(5)
        footer.pack_start(footer_right, False, False, 0)

        import_button = Gtk.Button(_('Import'))
        import_button.connect('clicked', self.on_import_clicked)
        footer_left.add(import_button)

        export_button = Gtk.Button(_('Export'))
        export_button.connect('clicked', self.on_export_clicked)
        footer_left.add(export_button)

        set_button = Gtk.Button(_('Set from...'))
        set_button.connect('button-press-event', self.on_set_from_press)
        footer_right.add(set_button)

        set_button_menu = Gtk.Menu()
        for preset in self.presets.keys():
            menu_item = Gtk.MenuItem(self.get_preset_name(preset))
            menu_item.show()
            menu_item.connect('activate', self.on_set_from_activate, preset)
            set_button_menu.append(menu_item)
        self.set_button_menu = set_button_menu

        # - Load shadow classes values
        self.set_shadow_classes(settings.get_value('customClasses'))

    def on_tree_view_edited(self, widget, path, text, column_index):
        column = self.columns[column_index]
        try:
            value = int(text)
        except ValueError:
            return
        self.tv_store[path][column_index + 1] = self.normalize_shadow_param(value, column['param_props'])
        self.apply_settings()

    def on_import_clicked(self, button):
        file_path = self.run_file_chooser(False)
        if file_path is not None:
            try:
                print('Import custom classes from "' + file_path + '"...')
                with open(file_path, 'r', encoding='utf-8') as file:
                    export = json.load(file)
                if safe_get(export, '_schema') != EXPORT_SCHEMA:
                    raise Exception('This file is not a configuration for the cinnamon User Shadows extension')
                if safe_get(export, '_version') != EXPORT_VERSION:
                    raise Exception('The configuration version is not supported')
                self.set_shadow_classes(safe_get(export, 'classes'))
                self.apply_settings()
                print('Done!')
            except Exception as err:
                self.show_error(err)

    def on_export_clicked(self, button):
        file_path = self.run_file_chooser(True)
        if file_path is not None:
            try:
                print('Export custom classes to "' + file_path + '"...')
                with open(file_path, 'w', encoding='utf-8') as file:
                    file.write(json.dumps({
                        '_comment': 'Configuration for the cinnamon User Shadows extension',
                        '_schema': EXPORT_SCHEMA,
                        '_version': EXPORT_VERSION,
                        'classes': self.get_shadow_classes()
                    }, indent='  '))
                print('Done!')
            except Exception as err:
                self.show_error(err)

    def run_file_chooser(self, save):
        dialog = Gtk.FileChooserDialog(
            _('Choose where to save your configuration') if save else _('Choose a configuration to load'), None,
            Gtk.FileChooserAction.SAVE if save else Gtk.FileChooserAction.OPEN,
            (Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL, Gtk.STOCK_SAVE if save else Gtk.STOCK_OPEN, Gtk.ResponseType.OK))
        json_filter = Gtk.FileFilter()
        json_filter.set_name('*.json')
        json_filter.add_pattern('*.json')
        dialog.add_filter(json_filter)
        all_filter = Gtk.FileFilter()
        all_filter.set_name('*')
        all_filter.add_pattern('*')
        dialog.add_filter(all_filter)
        if (save):
            dialog.set_current_name('user_shadows.json')
        try:
            if dialog.run() == Gtk.ResponseType.OK:
                return dialog.get_filename()
            else:
                return None
        finally:
            dialog.destroy()

    def on_set_from_press(self, widget, event):
        self.set_button_menu.popup_at_widget(widget, Gdk.Gravity.NORTH_EAST, Gdk.Gravity.NORTH_WEST, event)

    def on_set_from_activate(self, menu_item, preset):
        self.set_shadow_classes(safe_get(self.presets, preset))
        self.apply_settings()

    def apply_settings(self):
        self.settings.set_value(self.settings_key, self.get_shadow_classes())

    def set_shadow_classes(self, shadow_classes):
        self.tv_store.clear()
        for class_name in self.shadow_class_names:
            for state_name, state_index in self.shadow_states.items():
                params = safe_get(shadow_classes, class_name, state_index)
                fallback_params = safe_get(self.presets, 'default', class_name, state_index)
                tv_entry = [{'class_name': class_name, 'state_index': state_index}]

                tv_entry.append(class_name)
                tv_entry.append(state_name)
                for column in self.columns:
                    if 'param_props' in column:
                        value = safe_get(params, column['param_props']['index'])
                        if value is None:
                            value = safe_get(fallback_params, column['param_props']['index'])
                        value = self.normalize_shadow_param(value, column['param_props'])
                        tv_entry.append(value)

                self.tv_store.append(tv_entry)

    def get_shadow_classes(self):
        shadow_classes = {}
        for class_name in self.shadow_class_names:
            shadow_classes[class_name] = [
                self.get_shadow_params(class_name, 0),  # focused
                self.get_shadow_params(class_name, 1),  # unfocused
            ]
        return shadow_classes

    def get_shadow_params(self, class_name, state_index):
        for tv_entry in self.tv_store:
            if class_name == tv_entry[0]['class_name'] and state_index == tv_entry[0]['state_index']:
                params = [None] * self.shadow_params_len
                for column_index, column in enumerate(self.columns):
                    if 'param_props' in column:
                        params[column['param_props']['index']] = tv_entry[column_index + 1]
                return params
        return None

    def normalize_shadow_param(self, value, param_props):
        if value is None:
            value = 0
        value = max(value, param_props['min'])
        value = min(value, param_props['max'])
        return value

    def get_preset_name(self, preset):
        presets_options = safe_get(self.settings.settings, 'preset', 'options')
        if isinstance(presets_options, dict):
            for k, v in presets_options.items():
                if preset == v:
                    return _(k)
        return preset

    def show_error(self, err):
        print(err)
        dialog = Gtk.MessageDialog(None, Gtk.DialogFlags.MODAL, Gtk.MessageType.ERROR, Gtk.ButtonsType.OK, err)
        try:
            dialog.run()
        finally:
            dialog.destroy()


def safe_get(obj, *keys):
    for key in keys:
        if not isinstance(obj, dict) and not isinstance(obj, list):
            return None
        try:
            obj = obj[key]
        except (KeyError, IndexError, TypeError):
            return None
    return obj
