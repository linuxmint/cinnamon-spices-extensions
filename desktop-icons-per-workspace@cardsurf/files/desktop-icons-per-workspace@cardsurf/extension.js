const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;
const ModalDialog = imports.ui.modalDialog;
const uuid = "desktop-icons-per-workspace@cardsurf";

let ShellUtils;
if (typeof require !== 'undefined') {
    ShellUtils = require('./shellUtils');
} else {
    const ExtensionDirectory = imports.ui.extensionSystem.extensions[uuid];
    ShellUtils = ExtensionDirectory.shellUtils;
}





function MyExtension(metadata, orientation, panel_height, instance_id) {
    this._init(metadata, orientation, panel_height, instance_id);
};

MyExtension.prototype = {

    _init: function(metadata, orientation, panel_height, instance_id) {

        this.is_running = false;
        this.is_workspace_switch = false;
        this.switch_workspace_handler = -1;
        this.workspace_index = global.screen.get_active_workspace_index();
        this.update_csv_script = '';
        this.update_icons_script = '';
        this.refresh_desktop_script = '';

        this.settings = new Settings.ExtensionSettings(this, metadata.uuid);
        this.is_dialog_shown = false;
        this.refresh_delay_start = 3000;
        this.refresh_delay_switch = 500;
        this.save_every = 0;

        this._init_scripts();
        this._init_filepaths();
        this._bind_settings();
        this._show_dialog();
    },

    _init_scripts: function() {
        try {
            let directory = this._get_scripts_directory();
            let error = this._grant_executable_permission(directory);
            if(error.length > 0) {
                global.log(uuid + " error while granting executable permission to scripts: " + error);
            }
        }
        catch(exception) {
            global.log(uuid + " error while initializing scripts: " + exception);
        }
    },

    _get_scripts_directory: function() {
        let path = this._get_extension_directory();
        path += "scripts/"
        return path;
    },

    _get_extension_directory: function() {
        let directory = this._get_desktop_directory();
        directory += "/.local/share/cinnamon/extensions/" + uuid + "/";
        return directory;
    },

    _get_desktop_directory: function() {
        let directory = GLib.get_home_dir();
        return directory;
    },

    _grant_executable_permission: function(directory_path) {
        let process = new ShellUtils.ShellOutputProcess(['chmod', '-R', '755', directory_path]);
        let error = process.spawn_sync_and_get_error();
        return error;
    },

    _init_filepaths: function () {
        let directory = this._get_scripts_directory();
        this.update_csv_script = directory + "update_csv.sh";
        this.update_icons_script = directory + "update_icons.sh";
        this.refresh_desktop_script = directory + "refresh_desktop.sh";
    },

    _bind_settings: function () {
        for(let [binding, property_name, callback] of [
                [Settings.BindingDirection.BIDIRECTIONAL, "is_dialog_shown", null],
                [Settings.BindingDirection.IN, "refresh_delay_start", null],
                [Settings.BindingDirection.IN, "refresh_delay_switch", null],
                [Settings.BindingDirection.IN, "save_every", null] ]){
                this.settings.bindProperty(binding, property_name, property_name, callback, null);
        }
    },

    _show_dialog: function() {
        this.is_dialog_shown = this.settings.getValue("is_dialog_shown");
        if(!this.is_dialog_shown) {
            this._show_dialog_restart();
            this.is_dialog_shown = true;
            this.settings.setValue("is_dialog_shown", this.is_dialog_shown);
        }
    },

    _show_dialog_restart: function() {
        let dialog_message = uuid + "\n\n" +
                             "If desktop icons are not visible then restart Cinnamon with: Ctrl+Alt+Esc";
        let dialog = new ModalDialog.NotifyDialog(dialog_message);
        dialog.open();
    },

    enable: function()
    {
        this.is_running = true;
        this._update_icons();
        this._refresh_desktop_start();
        this._connect_signals();
        this._run();
    },

    _update_icons: function () {
        let process = new ShellUtils.ShellOutputProcess([this.update_icons_script, this._get_workspace_index_one()]);
        let error = process.spawn_sync_and_get_error();
        if(error.length > 0) {
            let error_message = "Error while updating dekstop icons: " + error;
            this._log_process_error(error_message, process.command_argv);
        }
    },

    _get_workspace_index_one: function () {
        let index = (this.workspace_index + 1).toString();
        return index;
    },

    _log_process_error: function(error_message, argv) {
        let text = error_message + ". Command line arguments: " + argv;
        global.log(text);
    },

    _refresh_desktop_start: function () {
        Mainloop.timeout_add(this.refresh_delay_start, Lang.bind(this, this._refresh_desktop_switch));
    },

    _refresh_desktop_switch: function () {
        let process = new ShellUtils.ShellOutputProcess([this.refresh_desktop_script,
                                                         this._get_refresh_delay_switch()]);
        process.spawn_async();
    },

    _get_refresh_delay_switch: function () {
        let seconds = this._get_seconds(this.refresh_delay_switch);
        return seconds;
    },

    _get_seconds: function (milliseconds) {
        let seconds = 0.001 * milliseconds;
        seconds = seconds.toFixed(3);
        return seconds;
    },

    _connect_signals: function() {
        try {
            this.switch_workspace_handler = global.window_manager.connect('switch-workspace',
                                                                          Lang.bind(this, this.on_workspace_switched));
        }
        catch(e) {
            global.log("Error while connecting signals: " + e);
        }
    },

    on_workspace_switched: function(actor, event) {
         try {
            this.is_workspace_switch = true;
            this.update_workspace_switched();
         }
         finally {
            this.is_workspace_switch = false;
         }
    },

    update_workspace_switched: function() {
         this._update_csv();
         this.workspace_index = global.screen.get_active_workspace_index();
         this._update_icons();
         this._refresh_desktop_switch();
    },

    _update_csv: function () {
        let process = new ShellUtils.ShellOutputProcess([this.update_csv_script, this._get_workspace_index_one()]);
        let error = process.spawn_sync_and_get_error();
        if(error.length > 0) {
            let error_message = "Error while updating dekstop icons information in CSV file: " + error;
            this._log_process_error(error_message, process.command_argv);
        }
    },

    disable: function()
    {
        this.is_running = false;
        this._disconnect_signals();
        this._update_csv();
    },

    _disconnect_signals: function() {
        try {
            global.window_manager.disconnect(this.switch_workspace_handler);
        }
        catch(e) {
            global.log("Error while disconnecting signals: " + e);
        }
    },








    _run: function () {
        this._run_update_csv_running();
    },

    _run_update_csv_running: function () {
        if(this.is_running) {
            this._run_update_csv();
        }
    },

    _run_update_csv: function () {
        if(this.save_every > 0) {
            this._update_csv_no_workspace_switched();
            Mainloop.timeout_add(this.save_every * 1000, Lang.bind(this, this._run_update_csv_running));
        }
        else {
            Mainloop.timeout_add(10000, Lang.bind(this, this._run_update_csv_running));
        }
    },

    _update_csv_no_workspace_switched: function() {
         if(!this.is_workspace_switch) {
             this._update_csv();
         }
    },

};





let extension = null;
function init(metadata) { extension = new MyExtension(metadata); }
function enable() { extension.enable(); }
function disable() { extension.disable(); }

