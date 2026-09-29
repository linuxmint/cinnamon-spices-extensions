// The chooser's colour rules as a stylesheet of their own, loaded into the
// theme beside stylesheet.css, which holds sizes alone. The rules are
// written ahead of any opening, once when the extension starts and again
// each time the theme changes, and written asynchronously, so opening the
// chooser touches no disk. They go to the user's runtime directory under
// the name of the class that scopes them, which colour-rules.ts takes from
// their text, because St keeps a stylesheet's parse by its path, so changed
// rules need a new name to be read afresh. A theme change replaces St's
// theme, which the sheet is loaded into afresh.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;

/** A sheet's rules, and the class the chooser's content wears for them. */
export interface ColourSheet {
    scope: string;
    rules: string;
}

function themeContext(): imports.gi.St.ThemeContext {
    return St.ThemeContext.get_for_stage(global.stage);
}

function sheetFile(scope: string): imports.gi.Gio.File {
    return Gio.File.new_for_path(
        GLib.build_filenamev([
            GLib.get_user_runtime_dir(),
            "cplace",
            `${scope}.css`,
        ]),
    );
}

/** A file, and then its folder once no file is left in it, deleted in the
 * background; a folder still holding a file stays. */
function deleteSheet(file: imports.gi.Gio.File): void {
    file.delete_async(GLib.PRIORITY_DEFAULT, null, () => {
        file.get_parent()?.delete_async(GLib.PRIORITY_DEFAULT, null, null);
    });
}

/** The rules written to the file in the background, its folder made first
 * if it isn't there, and then the callback, unless the write failed. */
function writeSheet(
    file: imports.gi.Gio.File,
    rules: string,
    written: () => void,
): void {
    // GJS writes a string handed to a byte array as UTF-8; the typing asks
    // for the bytes.
    const bytes = GLib.Bytes.new(rules as unknown as number[]);
    const write = (): void => {
        file.replace_contents_bytes_async(
            bytes,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
            (_file, result) => {
                try {
                    file.replace_contents_finish(result);
                } catch (error) {
                    global.logError(
                        `cPlace: the colour sheet: ${String(error)}`,
                    );
                    return;
                }
                written();
            },
        );
    };
    // A folder that is there already fails the make, harmlessly.
    file.get_parent()?.make_directory_async(GLib.PRIORITY_DEFAULT, null, write);
}

export class ThemeSheet {
    /** The sheet St has read, and the theme it went into. */
    private loaded: {
        theme: imports.gi.St.Theme;
        file: imports.gi.Gio.File;
        scope: string;
    } | null = null;
    /** Counts the writes begun, so a write that finishes after a later one
     * began, or after the sheet was removed, loads nothing. */
    private generation = 0;
    /** The sheet the latest write is for, null once removed. */
    private latest: imports.gi.Gio.File | null = null;
    private changedId = 0;

    constructor(private readonly rulesNow: () => ColourSheet) {}

    /** The rules written now, and again whenever the theme changes. */
    follow(): void {
        this.prepare();
        this.changedId = themeContext().connect("changed", () => {
            this.prepare();
        });
    }

    /** The class for the rules in the theme now, or null while none are:
     * just after a theme change, until the new sheet is read. */
    scope(): string | null {
        const loaded = this.loaded;
        return loaded !== null && loaded.theme === themeContext().get_theme()
            ? loaded.scope
            : null;
    }

    /** No longer following the theme, the rules out of it, and the sheet
     * off the disk, as disabling the extension leaves it. */
    remove(): void {
        if (this.changedId !== 0) {
            themeContext().disconnect(this.changedId);
            this.changedId = 0;
        }
        this.generation += 1;
        this.latest = null;
        this.unload();
    }

    private prepare(): void {
        let sheet: ColourSheet;
        try {
            sheet = this.rulesNow();
        } catch (error) {
            global.logError(`cPlace: the theme's colours: ${String(error)}`);
            return;
        }
        const theme = themeContext().get_theme();
        // The context also signals a change when any sheet is loaded into
        // the theme, this one included, which leaves the rules as they are.
        if (this.loaded?.scope === sheet.scope && this.loaded.theme === theme) {
            return;
        }
        this.generation += 1;
        const generation = this.generation;
        const file = sheetFile(sheet.scope);
        this.latest = file;
        writeSheet(file, sheet.rules, () => {
            if (
                generation === this.generation &&
                theme === themeContext().get_theme()
            ) {
                this.load(theme, file, sheet.scope);
            } else if (this.latest === null || !this.latest.equal(file)) {
                // Overtaken by a later write, or by the removal.
                deleteSheet(file);
            }
        });
    }

    /** The new sheet into the theme, in place of the one before. A sheet
     * St can't read leaves the chooser in the theme's plain colours. */
    private load(
        theme: imports.gi.St.Theme,
        file: imports.gi.Gio.File,
        scope: string,
    ): void {
        const path = file.get_path() ?? "";
        const before = this.loaded;
        if (before !== null && !before.file.equal(file)) {
            this.unload();
        } else if (before !== null && before.theme === theme) {
            return;
        }
        try {
            theme.load_stylesheet(path);
            this.loaded = { theme, file, scope };
        } catch (error) {
            global.logError(`cPlace: the colour sheet: ${String(error)}`);
        }
    }

    /** Out of the theme, if the theme is the one it went into, and deleted. */
    private unload(): void {
        const loaded = this.loaded;
        if (loaded === null) {
            return;
        }
        if (loaded.theme === themeContext().get_theme()) {
            loaded.theme.unload_stylesheet(loaded.file.get_path() ?? "");
        }
        deleteSheet(loaded.file);
        this.loaded = null;
    }
}
