const { Object } = imports.gi.GObject;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

export const UUID = 'gTile@shuairan';

export const isFinalized = function(obj: any) {
    return obj && Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
}

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');
export function _(str: string) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if(customTranslation != str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}

/**
 * Type guard for key
 * @param obj 
 * @param key 
 * @returns 
 */
export function objHasKey<T>(obj: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(obj, key);
}