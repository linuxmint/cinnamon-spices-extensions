/*
 * tilo - translation.
 *
 * Strings live in English in the source and come back translated at runtime.
 * The two install routes put the catalogues in different places: the Spices
 * installer writes into the user's locale directory, the .deb into the system
 * one. Bind the user directory explicitly and fall back to the system lookup,
 * so the same build works either way.
 */

const GLib = require('gi.GLib');
const Gettext = require('gettext');

const UUID = 'tilo@jeffreygbeho';

/* get_user_data_dir() honours XDG_DATA_HOME. Building the path from the home
   directory plus a fixed suffix would not, and would put the catalogue
   somewhere gettext is not looking on a system that sets it. */
Gettext.bindtextdomain(UUID, GLib.build_filenamev([GLib.get_user_data_dir(), 'locale']));

function _(text) {
    const fromXlet = Gettext.dgettext(UUID, text);
    if (fromXlet !== text) return fromXlet;
    return Gettext.gettext(text);
}

module.exports = { _, UUID };
