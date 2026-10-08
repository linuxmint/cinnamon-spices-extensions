// The page: what an arrangement brings to the chooser, which is everything
// below the choice of arrangement. The contract keeps every arrangement a
// pure function and has the engine own the UI on its behalf; a page is the
// shape of that ownership. The chooser is a shell, the dialog, the
// arrangement radios with their presets, Apply, Escape and the key
// sequences, and it shows whatever the selected page builds: the cascade's
// page lists windows to tick beside a preview and its variables, and the
// grid's page is a grid and nothing else. Each page is its arrangement's
// own, so a new arrangement brings the page its gesture needs rather than
// inheriting another's. Pages live in src/engine/pages.

import type { WindowTarget } from "../arrangement";

type MetaWindow = imports.gi.Meta.Window;

/** A preset's content: whatever the page snapshots, as plain JSON. */
export type PresetVariables = Record<string, unknown>;

/** The chooser's sizes in pixels, read from the stylesheet's own lengths,
 * which are set in the font's size, so they follow the desktop's font and
 * its scale. */
export interface PageSizes {
    /** The page's width, which the grid's page takes whole, so switching
     * arrangements leaves the dialog's width alone. */
    page: number;
    /** The preview's width, before any fitting to the screen. */
    preview: number;
}

/** What the shell lends a page while it is shown: a way to apply at once,
 * as the grid's second click does, exactly as Enter would, and its sizes. */
export interface PageHost {
    apply(): void;
    readonly sizes: PageSizes;
}

/** The modifiers held with a key the shell passes on. */
export interface KeyModifiers {
    control: boolean;
    shift: boolean;
}

export interface ArrangementPage {
    /** The preset store's key and the prefix of the page's settings keys,
     * each of which settings-schema.json must declare. */
    readonly key: string;
    /** The letter that selects the arrangement in the chooser: one
     * lowercase letter, used by no other page, and never u, which the shell
     * keeps for undo. The shell takes a page's letter before any page sees
     * the key, so a page cannot use another page's letter for itself. */
    readonly letter: string;
    /** The arrangement's name on its radio in the chooser. */
    readonly name: string;
    /** The page's whole content, built afresh each time the arrangement is
     * selected; the page keeps whatever state the content holds until
     * apply. */
    build(host: PageHost): imports.gi.Clutter.Actor;
    /** Let go of what build made and the windows it found, as the shell
     * asks when the content is replaced or the chooser closes; what the
     * page remembers as plain values stays for its next build. */
    release(): void;
    /** What applying does: the targets and the live windows they belong
     * to, in the order the contract wants, or null when there is nothing
     * to apply. */
    apply(): { targets: WindowTarget[]; liveWindows: MetaWindow[] } | null;
    /** A key the shell did not take; true when the page handled it. */
    onKey(symbol: number, modifiers: KeyModifiers): boolean;
    /** The line under the content, in the page's own words. */
    hint(): string;
    /** A preset of this arrangement: what it saves, how it is restored, and
     * one line naming it for the preset row. A preset saved before a value
     * existed leaves that value as it is. */
    snapshot(): PresetVariables;
    restore(variables: PresetVariables): void;
    describe(variables: PresetVariables): string;
    /** Draw a preset while its row is pointed at or focused, and, given
     * null, what the page drew before. A page with no way to draw its
     * presets leaves this out. */
    previewPreset?(variables: PresetVariables | null): void;
    /** Once built into the dialog: the pixels by which the dialog stands
     * taller than the screen's work area, none when it fits, for the page
     * to give back from what it draws. */
    fit?(excess: number): void;
}
