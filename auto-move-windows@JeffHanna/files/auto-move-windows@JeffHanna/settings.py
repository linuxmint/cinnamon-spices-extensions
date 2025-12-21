#!/usr/bin/python3
# Custom settings widget for auto-move-windows extension

import json
from gi.repository import Gtk, Gdk, GLib
from SettingsWidgets import SettingsWidget

class RuleListWidget(SettingsWidget):
    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)
        self.key = key
        self.settings = settings
        self.info = info

        # Main container
        self.set_orientation(Gtk.Orientation.VERTICAL)
        self.set_spacing(10)

        # Instructions label
        label = Gtk.Label()
        label.set_markup("<b>Window Rules</b>\nClick 'Add' to create a new rule, or select a rule and click 'Edit' to modify it.")
        label.set_line_wrap(True)
        label.set_halign(Gtk.Align.START)
        self.pack_start(label, False, False, 0)

        # ScrolledWindow for the TreeView
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_shadow_type(Gtk.ShadowType.IN)
        scrolled.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        scrolled.set_min_content_height(200)

        # TreeView setup
        self.store = Gtk.ListStore(str, str, int, int, int, int, int, bool, bool, bool)
        self.treeview = Gtk.TreeView(model=self.store)
        self.treeview.set_headers_visible(True)

        # Define columns
        columns_def = [
            ("WM_CLASS", 0),
            ("Match By", 1),
            ("Workspace", 2),
            ("X", 3),
            ("Y", 4),
            ("Width", 5),
            ("Height", 6),
            ("Max", 7),
            ("Max V", 8),
            ("First", 9)
        ]

        for title, col_id in columns_def:
            if col_id <= 6:  # Text columns
                renderer = Gtk.CellRendererText()
                column = Gtk.TreeViewColumn(title, renderer, text=col_id)
            else:  # Boolean columns
                renderer = Gtk.CellRendererToggle()
                column = Gtk.TreeViewColumn(title, renderer, active=col_id)
            column.set_resizable(True)
            self.treeview.append_column(column)

        scrolled.add(self.treeview)
        self.pack_start(scrolled, True, True, 0)

        # Button box
        button_box = Gtk.ButtonBox(orientation=Gtk.Orientation.HORIZONTAL)
        button_box.set_layout(Gtk.ButtonBoxStyle.START)
        button_box.set_spacing(5)

        add_button = Gtk.Button.new_with_label("Add")
        add_button.connect("clicked", self.on_add_clicked)
        button_box.pack_start(add_button, False, False, 0)

        edit_button = Gtk.Button.new_with_label("Edit")
        edit_button.connect("clicked", self.on_edit_clicked)
        button_box.pack_start(edit_button, False, False, 0)

        remove_button = Gtk.Button.new_with_label("Remove")
        remove_button.connect("clicked", self.on_remove_clicked)
        button_box.pack_start(remove_button, False, False, 0)

        self.pack_start(button_box, False, False, 0)

        # Initialize snapshot variable
        self.last_loaded_data = ""

        # Load existing data (this will also update last_loaded_data)
        self.load_data()

        # Set up periodic check for external changes (e.g., from import)
        GLib.timeout_add_seconds(1, self.check_for_external_changes)

    def check_for_external_changes(self):
        """Check if settings changed externally (e.g., via import) and reload if needed."""
        try:
            current_data = json.dumps(self.settings.get_value(self.key))
            if current_data != self.last_loaded_data:
                # Settings changed externally, reload the display
                self.load_data()
                self.last_loaded_data = current_data
        except:
            pass  # Ignore errors during polling

        return True  # Continue polling

    def load_data(self):
        self.store.clear()
        rules = self.settings.get_value(self.key)
        if not rules:
            rules = []

        for rule in rules:
            self.store.append([
                rule.get('wmClass', ''),
                rule.get('matchField', 'wmClass'),
                rule.get('workspace', 0),
                rule.get('x', 0),
                rule.get('y', 0),
                rule.get('width', 0),
                rule.get('height', 0),
                rule.get('maximized', False),
                rule.get('maximizeVertically', False),
                rule.get('firstOnly', False)
            ])

        # Update snapshot after loading
        self.last_loaded_data = json.dumps(rules)

    def save_data(self):
        rules = []
        for row in self.store:
            rule = {
                'wmClass': row[0],
                'matchField': row[1],
                'workspace': row[2],
                'x': row[3],
                'y': row[4],
                'width': row[5],
                'height': row[6],
                'maximized': row[7],
                'maximizeVertically': row[8],
                'firstOnly': row[9]
            }
            rules.append(rule)

        self.settings.set_value(self.key, rules)
        # Update snapshot to prevent unnecessary reload
        self.last_loaded_data = json.dumps(rules)

    def on_add_clicked(self, button):
        dialog = RuleEditDialog(self.get_toplevel(), None, show_add_another=True)

        while True:
            response = dialog.run()
            if response == Gtk.ResponseType.OK or response == 1:  # 1 is our custom "Add Another" response
                rule_data = dialog.get_rule_data()
                self.store.append(rule_data)
                self.save_data()

                if response == 1:  # Add Another clicked
                    dialog.reset_fields()
                else:  # OK clicked
                    break
            else:  # Cancel clicked
                break

        dialog.destroy()

    def on_edit_clicked(self, button):
        selection = self.treeview.get_selection()
        model, tree_iter = selection.get_selected()
        if tree_iter:
            current_data = list(model[tree_iter])
            dialog = RuleEditDialog(self.get_toplevel(), current_data)
            response = dialog.run()
            if response == Gtk.ResponseType.OK:
                rule_data = dialog.get_rule_data()
                for i, value in enumerate(rule_data):
                    model[tree_iter][i] = value
                self.save_data()
            dialog.destroy()

    def on_remove_clicked(self, button):
        selection = self.treeview.get_selection()
        model, tree_iter = selection.get_selected()
        if tree_iter:
            model.remove(tree_iter)
            self.save_data()


class RuleEditDialog(Gtk.Dialog):
    def __init__(self, parent, initial_data, show_add_another=False):
        Gtk.Dialog.__init__(self, "Edit Rule", parent, Gtk.DialogFlags.MODAL)
        self.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL)
        if show_add_another:
            self.add_button("Add Another", 1)  # Custom response ID
        self.add_button(Gtk.STOCK_OK, Gtk.ResponseType.OK)

        self.set_default_size(400, 400)

        box = self.get_content_area()
        box.set_spacing(10)
        box.set_border_width(10)

        grid = Gtk.Grid()
        grid.set_column_spacing(10)
        grid.set_row_spacing(10)

        # Create input fields
        self.wmclass_entry = Gtk.Entry()
        self.matchfield_combo = Gtk.ComboBoxText()
        self.matchfield_combo.append_text("wmClass")
        self.matchfield_combo.append_text("title")

        self.workspace_spin = Gtk.SpinButton.new_with_range(0, 20, 1)
        self.x_spin = Gtk.SpinButton.new_with_range(-10000, 10000, 1)
        self.y_spin = Gtk.SpinButton.new_with_range(-10000, 10000, 1)
        self.width_spin = Gtk.SpinButton.new_with_range(0, 10000, 1)
        self.height_spin = Gtk.SpinButton.new_with_range(0, 10000, 1)

        self.maximized_check = Gtk.CheckButton()
        self.maxvert_check = Gtk.CheckButton()
        self.firstonly_check = Gtk.CheckButton()

        # Populate with initial data if editing
        if initial_data:
            self.wmclass_entry.set_text(initial_data[0])
            self.matchfield_combo.set_active(0 if initial_data[1] == "wmClass" else 1)
            self.workspace_spin.set_value(initial_data[2])
            self.x_spin.set_value(initial_data[3])
            self.y_spin.set_value(initial_data[4])
            self.width_spin.set_value(initial_data[5])
            self.height_spin.set_value(initial_data[6])
            self.maximized_check.set_active(initial_data[7])
            self.maxvert_check.set_active(initial_data[8])
            self.firstonly_check.set_active(initial_data[9])
        else:
            # Set defaults for new rules
            self.matchfield_combo.set_active(0)
            self.workspace_spin.set_value(0)
            self.x_spin.set_value(0)
            self.y_spin.set_value(0)
            self.width_spin.set_value(0)
            self.height_spin.set_value(0)

        # Add to grid
        row = 0
        labels_and_widgets = [
            ("WM_CLASS / Title:", self.wmclass_entry),
            ("Match By:", self.matchfield_combo),
            ("Workspace:", self.workspace_spin),
            ("X Position:", self.x_spin),
            ("Y Position:", self.y_spin),
            ("Width:", self.width_spin),
            ("Height:", self.height_spin),
            ("Maximized:", self.maximized_check),
            ("Maximize Vertically:", self.maxvert_check),
            ("First Instance Only:", self.firstonly_check)
        ]

        for label_text, widget in labels_and_widgets:
            label = Gtk.Label(label=label_text)
            label.set_halign(Gtk.Align.END)
            grid.attach(label, 0, row, 1, 1)
            grid.attach(widget, 1, row, 1, 1)
            widget.set_hexpand(True)
            row += 1

        box.pack_start(grid, True, True, 0)
        self.show_all()

    def get_rule_data(self):
        return [
            self.wmclass_entry.get_text(),
            self.matchfield_combo.get_active_text(),
            int(self.workspace_spin.get_value()),
            int(self.x_spin.get_value()),
            int(self.y_spin.get_value()),
            int(self.width_spin.get_value()),
            int(self.height_spin.get_value()),
            self.maximized_check.get_active(),
            self.maxvert_check.get_active(),
            self.firstonly_check.get_active()
        ]

    def reset_fields(self):
        """Reset all fields to default values for adding another rule."""
        self.wmclass_entry.set_text("")
        self.matchfield_combo.set_active(0)
        self.workspace_spin.set_value(0)
        self.x_spin.set_value(0)
        self.y_spin.set_value(0)
        self.width_spin.set_value(0)
        self.height_spin.set_value(0)
        self.maximized_check.set_active(False)
        self.maxvert_check.set_active(False)
        self.firstonly_check.set_active(False)


class WorkaroundAppsWidget(SettingsWidget):
    """Widget for managing the list of apps that need the workspace-switching workaround."""
    
    def __init__(self, info, key, settings):
        SettingsWidget.__init__(self)
        self.key = key
        self.settings = settings
        self.info = info

        # Main container
        self.set_orientation(Gtk.Orientation.VERTICAL)
        self.set_spacing(10)

        # Instructions label
        label = Gtk.Label()
        label.set_markup("<b>Apps Needing Workspace-Switching Workaround</b>\nAdd WM_CLASS patterns for apps with positioning issues (use 'xprop WM_CLASS').")
        label.set_line_wrap(True)
        label.set_halign(Gtk.Align.START)
        self.pack_start(label, False, False, 0)

        # ScrolledWindow for the TreeView
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_shadow_type(Gtk.ShadowType.IN)
        scrolled.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
        scrolled.set_min_content_height(80)

        # TreeView setup
        self.store = Gtk.ListStore(str)
        self.treeview = Gtk.TreeView(model=self.store)
        self.treeview.set_headers_visible(True)

        # App name column
        renderer = Gtk.CellRendererText()
        column = Gtk.TreeViewColumn("App WM_CLASS Pattern", renderer, text=0)
        column.set_resizable(True)
        self.treeview.append_column(column)

        scrolled.add(self.treeview)
        self.pack_start(scrolled, True, True, 0)

        # Button box
        button_box = Gtk.ButtonBox(orientation=Gtk.Orientation.HORIZONTAL)
        button_box.set_layout(Gtk.ButtonBoxStyle.START)
        button_box.set_spacing(5)

        add_button = Gtk.Button.new_with_label("Add")
        add_button.connect("clicked", self.on_add_clicked)
        button_box.pack_start(add_button, False, False, 0)

        edit_button = Gtk.Button.new_with_label("Edit")
        edit_button.connect("clicked", self.on_edit_clicked)
        button_box.pack_start(edit_button, False, False, 0)

        remove_button = Gtk.Button.new_with_label("Remove")
        remove_button.connect("clicked", self.on_remove_clicked)
        button_box.pack_start(remove_button, False, False, 0)

        self.pack_start(button_box, False, False, 0)

        # Load existing data
        self.load_data()

    def load_data(self):
        """Load the apps list from settings."""
        self.store.clear()
        try:
            apps_json = self.settings.get_value(self.key)
            apps = json.loads(apps_json)
            for app in apps:
                self.store.append([app])
        except (json.JSONDecodeError, TypeError):
            # If parsing fails, use default
            self.store.append(["terminal"])
            self.save_data()

    def save_data(self):
        """Save the apps list to settings."""
        apps = []
        for row in self.store:
            app = row[0].strip()
            if app:  # Only add non-empty entries
                apps.append(app)
        
        apps_json = json.dumps(apps)
        self.settings.set_value(self.key, apps_json)

    def on_add_clicked(self, button):
        """Add a new app to the whitelist."""
        dialog = Gtk.Dialog("Add App", self.get_toplevel(), Gtk.DialogFlags.MODAL)
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL)
        dialog.add_button(Gtk.STOCK_OK, Gtk.ResponseType.OK)
        dialog.set_default_size(300, 100)

        box = dialog.get_content_area()
        box.set_spacing(10)
        box.set_border_width(10)

        label = Gtk.Label(label="App WM_CLASS pattern (e.g., 'terminal', 'kitty'):")
        label.set_halign(Gtk.Align.START)
        box.pack_start(label, False, False, 0)

        entry = Gtk.Entry()
        box.pack_start(entry, False, False, 0)

        dialog.show_all()
        response = dialog.run()

        if response == Gtk.ResponseType.OK:
            app_name = entry.get_text().strip()
            if app_name:
                self.store.append([app_name])
                self.save_data()

        dialog.destroy()

    def on_edit_clicked(self, button):
        """Edit the selected app pattern."""
        selection = self.treeview.get_selection()
        model, tree_iter = selection.get_selected()
        
        if not tree_iter:
            return

        current_value = model[tree_iter][0]

        dialog = Gtk.Dialog("Edit App", self.get_toplevel(), Gtk.DialogFlags.MODAL)
        dialog.add_button(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL)
        dialog.add_button(Gtk.STOCK_OK, Gtk.ResponseType.OK)
        dialog.set_default_size(300, 100)

        box = dialog.get_content_area()
        box.set_spacing(10)
        box.set_border_width(10)

        label = Gtk.Label(label="App WM_CLASS pattern:")
        label.set_halign(Gtk.Align.START)
        box.pack_start(label, False, False, 0)

        entry = Gtk.Entry()
        entry.set_text(current_value)
        box.pack_start(entry, False, False, 0)

        dialog.show_all()
        response = dialog.run()

        if response == Gtk.ResponseType.OK:
            app_name = entry.get_text().strip()
            if app_name:
                model[tree_iter][0] = app_name
                self.save_data()

        dialog.destroy()

    def on_remove_clicked(self, button):
        """Remove the selected app from the whitelist."""
        selection = self.treeview.get_selection()
        model, tree_iter = selection.get_selected()
        
        if tree_iter:
            model.remove(tree_iter)
            self.save_data()
