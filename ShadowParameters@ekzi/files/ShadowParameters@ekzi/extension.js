const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const Cinnamon = imports.gi.Cinnamon;

let shadow_factory = Meta.ShadowFactory.get_default();
let shadow_classes = ["normal", "dialog", "modal_dialog", "utility", "border", "menu", "popup-menu", "dropdown-menu", "attached"];
let folder_path

function readprefs(path) {
    let dir = Gio.file_new_for_path(path);
    let prefsFile = dir.get_child('prefs.json');
    if (!prefsFile.query_exists(null)) {
        global.log('No prefs.json found');
        return null;
    }
    let prefsContent;
    try {
        prefsContent = Cinnamon.get_file_contents_utf8_sync(prefsFile.get_path());
    } catch (e) {
        global.log('Failed to load prefs.json: ' + e);
        return null;
    }
    return JSON.parse(prefsContent);
}

function writeprefs(path,data) {
    let dir = Gio.file_new_for_path(path);
    let prefsFile = dir.get_child('prefs_backup.json');
    let f = Gio.file_new_for_path(path + '/prefs_backup.json');
    let raw = f.replace(null, false, Gio.FileCreateFlags.NONE, null);
    let out = Gio.BufferedOutputStream.new_sized(raw, 4096);
    Cinnamon.write_string_to_stream(out, JSON.stringify(data, null, 2));
    out.close(null);
}

function create_params(r) {
    return new Meta.ShadowParams({"radius": r[0], "top_fade": r[1], "x_offset": r[2], "y_offset": r[3], "opacity": r[4]});
}

function backup_settings(file_name){
    let backup = {}
    backup.default = {}
    backup.default.focused = {}
    backup.default.unfocused = {}

    for (shadow of shadow_classes){
        f_obj = shadow_factory.get_params(shadow, true);
        u_obj = shadow_factory.get_params(shadow, false);
        backup.default.focused[shadow] = [f_obj['radius'],f_obj['top_fade'],f_obj['x_offset'],f_obj['y_offset'],f_obj['opacity']]
        backup.default.unfocused[shadow] = [u_obj['radius'],u_obj['top_fade'],u_obj['x_offset'],u_obj['y_offset'],u_obj['opacity']]
    }
    writeprefs(file_name, backup)
    return true;
}


function activate_preset(preset) {
    if (preset in prefs)
    {
        let focused = prefs[preset].focused
        let unfocused = prefs[preset].unfocused
        let focused_params = [], unfocused_params = [];

        for (record in focused)
        {
            shadow_factory.set_params(record, true, create_params(focused[record]));
        }
        for (record in unfocused)
        {
            shadow_factory.set_params(record, false, create_params(unfocused[record]));
        }
        settings.current_active = preset
    }
}

function SettingsHandler(uuid) {
    this._init(uuid);
}

function restart_cinnamon() {
    global.reexec_self();
}

SettingsHandler.prototype = {
    _init: function(uuid) {
    this.settings = new Settings.ExtensionSettings(this, uuid);
    this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "first_launch" , "first_launch", function(){});
    this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "current_active" , "current_active", function(){});
    this.settings.bindProperty(Settings.BindingDirection.IN, "preset" , "preset", this._launch);
    },
    _launch: function() {
        activate_preset(this.preset)
    },
    _destroy: function() {
        this.settings.unbindProperty('first_launch')
        this.settings.unbindProperty('current_active')
        this.settings.unbindProperty('preset')
        this.settings = null;
        delete this.settings;
    }
}

const Callbacks = {
    restart_cinnamon: function() {
        global.reexec_self();
    },
    apply_changes: function() {
        prefs = readprefs(folder_path);
        activate_preset(settings.current_active)
    }
};

function init(meta)
{
    folder_path = meta.path

    prefs = readprefs(folder_path);
    settings = new SettingsHandler(meta.uuid);
    if (settings.first_run) 
    {
        backup_settings(folder_path)
        settings.first_run = false
    }
}

function enable() {
    activate_preset(settings.current_active)

    return Callbacks
}

function disable() {
    backed_up = settings.current_active
    activate_preset('default')
    settings.current_active = backed_up

    settings._destroy()
}