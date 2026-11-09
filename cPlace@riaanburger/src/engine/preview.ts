// The preview: the arrangement's targets drawn small. It draws exactly what
// it is given and computes nothing itself, so it cannot disagree with what
// applying does; the page hands it the same targets it would apply. The
// frame is drawn as a screen in the work area's own proportions, captioned
// with its size. A page may draw on it too, beneath the slots, where the
// columns page lays the cells its area is chosen from, and above them,
// where the cascade's corner brackets and the columns area's outline sit,
// and may add a note to the caption. Its width is the page's to give, from
// the stylesheet's size or fitted to the screen, a width of 0 leaving the
// picture out and the caption alone, and its colours are the theme's, by
// palette.ts. Every number a caption shows is in the desktop's logical
// pixels, as the chooser's variables are, so on a desktop scaled to 2 a
// screen of 3840 by 2160 reads as the 1920 by 1080 it looks.

import type { Rectangle, WindowTarget } from "../arrangement";
import { _, fill, listed, ngettext } from "../i18n";
import { logical } from "./logical";

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

/** The preview's screen and how the work area maps onto it, so whatever a
 * page draws lines up with the slots to the pixel. */
export interface PreviewView {
    width: number;
    height: number;
    workArea: Rectangle;
    toX: (x: number) => number;
    toY: (y: number) => number;
}

/** What a page adds: a layer beneath the slots, one above them, and a note
 * for the caption, a phrase of its own or nothing, whose count of windows a
 * page may also give in its own words, as it may name the place drawn
 * before its size, such as the monitor. A page that sends applications to the end names the targets that
 * went there, whose slots take a second shade. */
export interface PreviewLayers {
    beneath: (canvas: imports.gi.Clutter.Actor, view: PreviewView) => void;
    above: (canvas: imports.gi.Clutter.Actor, view: PreviewView) => void;
    note: string;
    place?: string | undefined;
    windows?: string | undefined;
    atEnd?: ((id: number) => boolean) | undefined;
}

/** Build the miniature: the work area as a screen, the page's lower layer,
 * every target as a rectangle drawn in list order so stacking reads as it
 * will land, then the page's upper layer, and the caption beneath; at a
 * width of 0, the caption alone. The caller swaps the whole actor on every
 * change. */
export function buildPreview(
    workArea: Rectangle,
    targets: WindowTarget[],
    layers: PreviewLayers,
    width: number,
): imports.gi.St.BoxLayout {
    const column = new St.BoxLayout({ vertical: true });
    if (width > 0) {
        const view = previewView(workArea, width);
        const canvas = screenCanvas(view);
        layers.beneath(canvas, view);
        for (const target of targets) {
            canvas.add_child(slotFor(target, view, layers.atEnd?.(target.id)));
        }
        layers.above(canvas, view);
        column.add_child(canvas);
    }
    column.add_child(caption(workArea, targets.length, layers));
    return column;
}

/** How the work area maps onto the preview's screen. Each slot runs
 * between its rounded edges rather than a rounded position plus a rounded
 * size, so tiles that share an edge on the desktop share one here, never a
 * pixel's gap or overlap between them. */
function previewView(workArea: Rectangle, width: number): PreviewView {
    const scale = width / workArea.width;
    return {
        width,
        height: Math.max(1, Math.round(workArea.height * scale)),
        workArea,
        toX: (x) => Math.round((x - workArea.x) * scale),
        toY: (y) => Math.round((y - workArea.y) * scale),
    };
}

/** The canvas the preview draws on, the screen at its back. Nothing the
 * arrangements emit leaves the work area, but one that did would be cut at
 * the screen's edge here, as on the desktop. */
function screenCanvas(view: PreviewView): imports.gi.Clutter.Actor {
    const canvas = new Clutter.Actor();
    canvas.set_size(view.width, view.height);
    canvas.set_clip_to_allocation(true);
    const screen = new St.Bin({ style_class: "cplace-preview-screen" });
    screen.set_position(0, 0);
    screen.set_size(view.width, view.height);
    canvas.add_child(screen);
    return canvas;
}

/** A target's slot. One sent to the end takes the second colour and the
 * arrow its application's row sends it with, so the end still reads where
 * the colour cannot: on a grey theme, whose accent has no hue to turn, and
 * to anyone who cannot tell the two colours apart. */
function slotFor(
    target: WindowTarget,
    view: PreviewView,
    atEnd: boolean | undefined,
): imports.gi.St.Bin {
    const { x, y, width, height } = target.frame;
    const slot = new St.Bin({
        style_class:
            atEnd === true
                ? "cplace-preview-slot cplace-preview-slot-end"
                : "cplace-preview-slot",
    });
    if (atEnd === true) {
        slot.set_child(
            new St.Icon({
                icon_name: "go-last",
                icon_type: St.IconType.SYMBOLIC,
                style_class: "cplace-end-mark",
            }),
        );
        slot.set_clip_to_allocation(true);
    }
    slot.set_position(view.toX(x), view.toY(y));
    slot.set_size(
        Math.max(2, view.toX(x + width) - view.toX(x)),
        Math.max(2, view.toY(y + height) - view.toY(y)),
    );
    return slot;
}

/** The place drawn, the work area's size, the count of windows in the
 * page's words or the preview's own, and the page's note, listed. */
function caption(
    workArea: Rectangle,
    count: number,
    layers: PreviewLayers,
): imports.gi.St.Label {
    const windows =
        layers.windows ??
        fill(ngettext("{count} window", "{count} windows", count), { count });
    const size = fill(_("{width} × {height}"), {
        width: logical(workArea.width),
        height: logical(workArea.height),
    });
    return new St.Label({
        text: listed(layers.place ?? "", size, windows, layers.note),
        style_class: "cplace-preview-caption",
    });
}

/** Handles drawn over the preview's screen: a family of classes, where
 * each handle sits, which one is lit, and what picking one does. */
export interface Handles<Id extends string> {
    family: string;
    places: { id: Id; x: number; y: number }[];
    active: Id;
    onPick: (id: Id) => void;
}

/** Focusable handles over the screen, added last so they sit on top of the
 * slots. Each wears its family's class and its own, the lit one the
 * family's active class too; which sides of it are drawn is the
 * stylesheet's business. */
export function addHandles<Id extends string>(
    canvas: imports.gi.Clutter.Actor,
    handles: Handles<Id>,
): void {
    for (const place of handles.places) {
        const classes = [handles.family, `${handles.family}-${place.id}`];
        if (place.id === handles.active) {
            classes.push(`${handles.family}-active`);
        }
        const button = new St.Button({
            style_class: classes.join(" "),
            can_focus: true,
        });
        button.set_position(place.x, place.y);
        button.connect("clicked", () => {
            handles.onPick(place.id);
        });
        canvas.add_child(button);
    }
}
