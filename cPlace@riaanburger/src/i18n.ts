// The words cPlace shows, made translatable. Every string a user reads passes
// through _() or ngettext() as a whole phrase, with any number or name in it
// written as a named token, such as {count}, which fill() puts in, so that a
// translator can move it. The template the Spices' tools write reads the
// bundle for these two calls by name.
//
// Until the extension binds its text domain the words are the English ones,
// which is what the tests read under Node, where there is no Cinnamon.

interface Lookup {
    one(text: string): string;
    counted(one: string, many: string, count: number): string;
}

const english: Lookup = {
    one: (text) => text,
    counted: (one, many, count) => (count === 1 ? one : many),
};

let lookup = english;

/**
 * Reads cPlace's words from its translations, which the Spices install
 * under the user's own locale folder. A word cPlace has no translation for
 * is looked for in Cinnamon's, which holds the common ones, such as Cancel.
 */
export function bindTranslations(uuid: string): void {
    const Gettext = imports.gettext;
    Gettext.bindtextdomain(
        uuid,
        `${imports.gi.GLib.get_home_dir()}/.local/share/locale`,
    );
    lookup = {
        one: (text) => {
            const own = Gettext.dgettext(uuid, text);
            return own !== text ? own : Gettext.gettext(text);
        },
        counted: (one, many, count) =>
            Gettext.dngettext(uuid, one, many, count),
    };
}

/** English again, as when the extension is turned off. */
export function unbindTranslations(): void {
    lookup = english;
}

/** A phrase in the user's language. */
export function _(text: string): string {
    return lookup.one(text);
}

/** A phrase about a count, in the plural form the user's language takes. */
export function ngettext(one: string, many: string, count: number): string {
    return lookup.counted(one, many, count);
}

/** A translated phrase with its named tokens put in; one left unnamed stays. */
export function fill(
    phrase: string,
    values: Record<string, string | number>,
): string {
    return phrase.replace(/\{(\w+)\}/g, (token, name: string) => {
        const value = values[name];
        return value === undefined ? token : String(value);
    });
}

/** Phrases that each stand whole, listed with commas; an empty one is left
 * out, such as a place named only when there is more than one monitor. */
export function listed(...phrases: string[]): string {
    return phrases.filter((phrase) => phrase !== "").join(", ");
}
