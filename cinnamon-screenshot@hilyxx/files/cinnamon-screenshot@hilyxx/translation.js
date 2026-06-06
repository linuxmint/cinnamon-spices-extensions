const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

let currentUUID = null;

// Initialize gettext with the provided UUID
function initTranslation(uuid) {
    currentUUID = uuid;
    Gettext.bindtextdomain(uuid, GLib.get_home_dir() + '/.local/share/locale');
}

function _(str) {
    if (currentUUID) {
        const customTranslation = Gettext.dgettext(currentUUID, str);
        if (customTranslation != str) {
            return customTranslation;
        }
    }
    return Gettext.gettext(str);
} 
