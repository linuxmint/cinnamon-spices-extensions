// Fitting the chooser to the screen it opens on. The chooser opens on the
// monitor an arrangement uses, and measures the dialog once a page is built
// into it, and a page that stands it taller than the work area gives the
// difference back from what it draws: the list pages from their preview,
// the grid's page from its grid. Nothing here is a size of its own; each is
// measured from the layout or turned from the work area's proportions.

import type { Rectangle } from "../arrangement";
import { currentMonitor } from "./gather";
import type { WindowList } from "./window-list";

/** The monitor constraint Cinnamon's modal dialog keeps its background
 * on, which the typing leaves out; it sets the index to the pointer's
 * monitor each time the dialog opens. */
interface Placeable {
    _monitorConstraint?: { index?: unknown };
}

/** True when the dialog can be moved to a monitor of cPlace's choosing:
 * when Cinnamon's dialog still keeps the constraint this reaches. */
export function canPlace(dialog: imports.ui.modalDialog.ModalDialog): boolean {
    const constraint = (dialog as unknown as Placeable)._monitorConstraint;
    return typeof constraint?.index === "number";
}

/** The open dialog moved to a monitor, where it can be. */
export function placeOn(
    dialog: imports.ui.modalDialog.ModalDialog,
    monitor: number,
): void {
    const constraint = (dialog as unknown as Placeable)._monitorConstraint;
    if (constraint !== undefined && typeof constraint.index === "number") {
        constraint.index = monitor;
    }
}

/** An actor's natural height as its layout would give it now. */
function naturalHeight(actor: imports.gi.Clutter.Actor): number {
    const [, natural] = actor.get_preferred_height(-1);
    return natural ?? 0;
}

/** The height a dialog may stand: the work area of the monitor it opens
 * on, which Cinnamon centres a modal dialog within. */
export function roomHere(): number {
    return global.workspace_manager
        .get_active_workspace()
        .get_work_area_for_monitor(currentMonitor())
        .height;
}

/** The pixels by which a dialog stands taller than the room; none when
 * it fits. It is measured at its own width, where a page's hint wraps as
 * it will stand. */
export function excessOver(
    dialog: imports.gi.Clutter.Actor,
    room: number,
): number {
    const [, width] = dialog.get_preferred_width(-1);
    const [, natural] = dialog.get_preferred_height(width ?? -1);
    return Math.max(0, Math.ceil((natural ?? 0) - room));
}

/** The width at which a work area drawn small stands this tall. */
export function widthForHeight(workArea: Rectangle, height: number): number {
    return Math.max(1, Math.floor((height * workArea.width) / workArea.height));
}

/** The width of a work area drawn small once it gives up this much of
 * its height. */
export function narrowerBy(
    workArea: Rectangle,
    width: number,
    over: number,
): number {
    const tall = Math.round((workArea.height * width) / workArea.width);
    return widthForHeight(workArea, tall - over);
}

/** A list page's parts: the window list, the column beside it, and the
 * body holding both. */
export interface ListBeside {
    list: WindowList;
    body: imports.gi.St.BoxLayout;
    right: imports.gi.St.BoxLayout;
}

/** A list page that fits keeps its list whole. One that stands over the
 * screen gives back from its list first, which scrolls and so loses
 * nothing, though never below the column beside it; whatever is still over
 * is handed to the page to give back from its preview, and the list
 * follows the column down. */
export function fitBeside(
    parts: ListBeside,
    excess: number,
    giveBack: (over: number) => void,
): void {
    if (excess <= 0) {
        return;
    }
    const body = naturalHeight(parts.body);
    const beside = naturalHeight(parts.right);
    parts.list.fitHeight(Math.max(beside, body - excess));
    const over = excess - (body - naturalHeight(parts.body));
    if (over > 0) {
        giveBack(over);
        parts.list.fitHeight(naturalHeight(parts.right));
    }
}
