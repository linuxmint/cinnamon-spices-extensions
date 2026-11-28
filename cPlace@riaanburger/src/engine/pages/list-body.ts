// The body the pages that tick windows share: the window list on the left,
// and on the right a column holding the preview, with whatever a page puts
// above and below it. The cascade's and Columns' pages build on it through
// list-page.ts, and the Recorded page directly, so the three lay out and fit
// to the screen alike. On a screen too short for it, the preview is left
// out and its caption kept.

import type { WindowList } from "../window-list";
import { fitBeside, narrowerBy } from "../fitting";
import { currentWorkArea } from "../gather";
import { replaceChild } from "../widgets";

const St = imports.gi.St;

type Actor = imports.gi.Clutter.Actor;

/** What a page puts in the right-hand column around its preview. */
export interface BesideThePreview {
    above?: Actor | undefined;
    below?: Actor | undefined;
}

export class ListBody {
    readonly actor: imports.gi.St.BoxLayout;
    readonly right: imports.gi.St.BoxLayout;
    private readonly previewBin: imports.gi.St.Bin;
    private below: Actor | undefined;
    /** The stylesheet's width for the preview, less whatever fitting the
     * dialog to the screen has taken back; 0 once it is left out. */
    private width: number;
    /** The least width a preview is drawn at, a quarter of the
     * stylesheet's, which follows the desktop's font; narrower, it is too
     * small to read. */
    private readonly least: number;

    constructor(
        readonly list: WindowList,
        previewWidth: number,
        beside: BesideThePreview = {},
    ) {
        this.width = previewWidth;
        this.least = previewWidth / 4;
        // The tall thing sits beside the stacked things: the window list on
        // the left, the preview and the page's controls on the right.
        this.actor = new St.BoxLayout({
            vertical: false,
            style_class: "cplace-body",
        });
        this.actor.add_child(list.actor);
        this.right = new St.BoxLayout({
            vertical: true,
            style_class: "cplace-right",
        });
        if (beside.above !== undefined) {
            this.right.add_child(beside.above);
        }
        this.previewBin = new St.Bin();
        this.right.add_child(this.previewBin);
        this.below = beside.below;
        if (this.below !== undefined) {
            this.right.add_child(this.below);
        }
        this.actor.add_child(this.right);
    }

    /** The width the preview is drawn at now. */
    get previewWidth(): number {
        return this.width;
    }

    showPreview(preview: Actor): void {
        replaceChild(this.previewBin, preview);
    }

    /** New controls under the preview in place of the old, which go, as a
     * restored preset's values need when the chooser stays open after it. */
    showBelow(below: Actor): void {
        if (this.below === undefined) {
            this.right.add_child(below);
        } else {
            this.right.replace_child(this.below, below);
            this.below.destroy();
        }
        this.below = below;
    }

    /** A dialog standing over the screen takes the difference from the
     * list, which scrolls, and then from the preview, which the page
     * redraws at the narrower width, or without its picture once that is
     * too small to read. */
    fit(excess: number, redraw: () => void): void {
        fitBeside(
            { list: this.list, body: this.actor, right: this.right },
            excess,
            (over) => {
                const width = narrowerBy(currentWorkArea(), this.width, over);
                this.width = width < this.least ? 0 : width;
                redraw();
            },
        );
    }
}
