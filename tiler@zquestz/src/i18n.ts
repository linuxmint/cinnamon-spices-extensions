/**
 * Translation of the strings Tiler draws itself.
 *
 * Settings and metadata are translated by Cinnamon, but anything written on
 * an actor is Tiler's own job. Translators work against the template in po/,
 * and Cinnamon's installer (harvester.py, since commit 7d315875) compiles the
 * translations into the locale directory under the user data directory, so
 * the domain is bound there. Cinnamon 6.x installed to ~/.local/share/locale
 * outright, which is the same place unless XDG_DATA_HOME points elsewhere.
 */

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

let domain = "";

/** Points the translation domain at this extension. Called once, at load. */
export function initTranslations(uuid: string): void {
  domain = uuid;
  Gettext.bindtextdomain(
    uuid,
    GLib.build_filenamev([GLib.get_user_data_dir(), "locale"]),
  );
}

/** The given text in the user's language, or as written when there is none. */
export function _(text: string): string {
  return domain ? Gettext.dgettext(domain, text) : text;
}
