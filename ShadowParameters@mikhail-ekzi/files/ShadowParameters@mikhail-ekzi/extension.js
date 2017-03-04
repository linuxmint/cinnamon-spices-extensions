/*jshint esversion: 6 */
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const Cinnamon = imports.gi.Cinnamon;

let shadow_factory = Meta.ShadowFactory.get_default();
let shadow_classes = ["normal", "dialog", "modal_dialog", "utility", "border", "menu", "popup-menu", "dropdown-menu", "attached"];


function create_params(r) {
    return new Meta.ShadowParams({"radius": r[0], "top_fade": r[1], "x_offset": r[2], "y_offset": r[3], "opacity": r[4]});
}

function backup_settings(){
    let user_settings = {};
    user_settings.focused = {};
    user_settings.unfocused = {};

    for (var shadow of shadow_classes){
        f_obj = shadow_factory.get_params(shadow, true);
        u_obj = shadow_factory.get_params(shadow, false);
        user_settings.focused[shadow] = [f_obj.radius,f_obj.top_fade,f_obj.x_offset,f_obj.y_offset,f_obj.opacity];
        user_settings.unfocused[shadow] = [u_obj.radius,u_obj.top_fade,u_obj.x_offset,u_obj.y_offset,u_obj.opacity];
    }
    settings.prefs.default = user_settings;
    settings.prefs.save();
    return true;
}


function activate_preset(preset, overwrite_active = true) {
    if (preset in settings.prefs)
    {
        let focused = settings.prefs[preset].focused;
        let unfocused = settings.prefs[preset].unfocused;
        let focused_params = [], unfocused_params = [];

        for (var record in focused)
        {
            shadow_factory.set_params(record, true, create_params(focused[record]));
        }
        for (var record in unfocused)
        {
            shadow_factory.set_params(record, false, create_params(unfocused[record]));
        }
        if (overwrite_active)
        	settings.current_active = preset;
    }
}

function restart_cinnamon() {
    global.reexec_self();
}

function SettingsHandler(uuid) {
    this._init(uuid);
}


SettingsHandler.prototype = {
    _init: function(uuid) {
    this.settings = new Settings.ExtensionSettings(this, uuid);
    this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "first_launch" , "first_launch", function(){});
    this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, "current_active" , "current_active", function(){});
    this.settings.bindProperty(Settings.BindingDirection.IN, "preset" , "preset", this._launch);
    this.settings.bindProperty(Settings.BindingDirection.IN, "prefs" , "prefs", this._launch);
    },
    _launch: function() {
        activate_preset(this.preset);
    },
    _destroy: function() {
        this.settings.unbindProperty('first_launch');
        this.settings.unbindProperty('current_active');
        this.settings.unbindProperty('preset');
        this.settings.unbindProperty('prefs');
        this.settings = null;
        delete this.settings;
    }
};

const Callbacks = {
    restart_cinnamon: function() {
        global.reexec_self();
    },
    apply_changes: function() {
        activate_preset(settings.current_active);
    }
};

function init(meta)
{
    settings = new SettingsHandler(meta.uuid);
   
    if (settings.first_launch) 
    {
        backup_settings()
        settings.first_launch = false
    }
}

function enable() {
    activate_preset(settings.current_active);

    return Callbacks;
}

function disable() {
    activate_preset('default', false);

    settings._destroy();
}
