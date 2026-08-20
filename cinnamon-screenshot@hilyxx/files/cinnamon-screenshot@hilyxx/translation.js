const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

let currentUUID = null;

// Initialize gettext with the provided UUID
var initTranslation = function(uuid) {
    currentUUID = uuid;
    Gettext.bindtextdomain(uuid, GLib.get_user_data_dir() + '/locale');
}

var _ = function(str) {
    if (currentUUID) {
        const customTranslation = Gettext.dgettext(currentUUID, str);
        if (customTranslation != str) {
            return customTranslation;
        }
    }
    return Gettext.gettext(str);
}
