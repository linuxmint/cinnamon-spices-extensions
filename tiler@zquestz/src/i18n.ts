/**
 * Translation of the strings Tiler draws itself.
 *
 * Settings and metadata are translated by Cinnamon, but anything written on
 * an actor is Tiler's own job. Translators work against the template in po/,
 * and Cinnamon installs the compiled translations to this literal path (see
 * Spices.py), so the domain is bound there rather than to XDG_DATA_HOME,
 * which Cinnamon never reads for this.
 */

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

let domain = "";

/** Points the translation domain at this extension. Called once, at load. */
export function initTranslations(uuid: string): void {
  domain = uuid;
  Gettext.bindtextdomain(uuid, GLib.get_home_dir() + "/.local/share/locale");
}

/** The given text in the user's language, or as written when there is none. */
export function _(text: string): string {
  return domain ? Gettext.dgettext(domain, text) : text;
}
