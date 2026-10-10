// The arrangement contract: what an arrangement receives, what it returns,
// and what it may never do. Types only, no behaviour.
// docs/contributing/the-arrangement-contract.md explains why each part is
// as it is.
//
// An arrangement is a pure function: no state between calls, no live window
// objects, no clock, no randomness, and nothing content-shaped to read. Same
// input, same output, every time.

/** A rectangle in the screen's coordinates, the ones the work area itself is
 * given in, so a frame at the work area's top-left corner has the work
 * area's x and y; x and y are its top-left corner. */
export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A participating window. The id is an opaque token the engine maps back to
 * a live window: compare it, return it, read nothing into it. The frame is
 * the one the window currently occupies. */
export interface ArrangementWindow {
    id: number;
    frame: Rectangle;
}

/** Everything an arrangement receives. The work area is the space panels
 * leave free, not the monitor. The windows come in the order the engine
 * means them to stack, bottom to top, which is the order to deal them in:
 * by title, with the focused window first on a page that leads with it.
 * Every one of them participates, and no arrangement filters. The settings
 * are the arrangement's own, as plain data.
 *
 * On a desktop of more than one monitor the work area is one monitor's, the
 * one the arrangement uses, and the work areas are every monitor's, that
 * one among them. The engine always gives them; an arrangement that places
 * windows within its work area, as most do, never reads them, and one that
 * reads them takes their absence, as in a test that leaves them out, to
 * mean the work area alone. */
export interface ArrangementInput<Settings> {
    workArea: Rectangle;
    workAreas?: Rectangle[];
    windows: ArrangementWindow[];
    settings: Settings;
}

/** One instruction to the engine: put the window with this id in this
 * frame. */
export interface WindowTarget {
    id: number;
    frame: Rectangle;
}

/** An arrangement: from a described situation to a list of targets. The list
 * order is the target stacking order, bottom to top. Omitting a window means
 * leave it alone. The engine applies targets as given and discards any id
 * that was not in the input. A target reaching outside the work area is the
 * arrangement's bug, since the engine never corrects one; trim.ts cuts a
 * frame back to the work area for an arrangement whose rule can overshoot. */
export type Arrangement<Settings> = (
    input: ArrangementInput<Settings>,
) => WindowTarget[];
