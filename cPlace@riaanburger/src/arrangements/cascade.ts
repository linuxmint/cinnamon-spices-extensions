// The cascade: every window at one size, each displaced a fixed offset
// along the diagonal from the one before it, so a sliver of every window
// stays visible and any of them can be raised with the mouse. The wrap
// rule, and the corner, spread and margin rules, are set out beside the
// settings and the function below.

import type {
    ArrangementInput,
    Rectangle,
    WindowTarget,
} from "../arrangement";
import { trimmed } from "./trim";

/** The corner the cascade starts from. Bottom corners climb up, top
 * corners climb down; left corners march right, right corners march left. */
export type CascadeCorner =
    | "bottom-left"
    | "bottom-right"
    | "top-left"
    | "top-right";

/** The cascade's knobs. The engine owns storage, defaults and the settings
 * dialogue; this module only consumes values. */
export interface CascadeSettings {
    windowWidth: number;
    windowHeight: number;
    /** The march's step, away from the corner's side edge. */
    offsetAcross: number;
    /** The climb's step, away from the corner's top or bottom edge: up from
     * a bottom corner, down from a top one. */
    offsetUp: number;
    /** The anchor's distance from the corner's side edge and from its top
     * or bottom edge, nothing on the far edges. Negative pulls the anchor
     * past an edge, and the windows that would leave the work area are
     * trimmed to it. */
    marginAcross: number;
    marginUp: number;
    corner: CascadeCorner;
    /** Spread: both offsets are the budget shared over the steps between
     * the windows, so the list spans the work area corner to corner and
     * never wraps. */
    spread: boolean;
}

/** Slot `i` stands `i` offsets along the diagonal from the chosen corner's
 * anchor. With fixed offsets the wrap restarts the climb, not the march:
 * when the next slot would cross the far horizontal edge, only the height
 * returns to the anchor's, so every window keeps its sliver, and when the
 * march itself would cross the far vertical edge, the whole cascade
 * restarts from the anchor. Spread offsets never wrap. No window leaves
 * the work area: whatever would, through a negative margin or a size
 * larger than the room, is trimmed to the edge it would cross, so the
 * lowest windows of a bottom cascade pulled below the screen are simply
 * shorter than the rest. The output is the input order unchanged, one
 * target per window. */
export function cascade(
    input: ArrangementInput<CascadeSettings>,
): WindowTarget[] {
    const { workArea, windows, settings } = input;
    const { fromRight, fromTop } = sidesOf(settings.corner);
    // How far the march and the climb may travel from the anchor before
    // crossing the far edge.
    const marchBudget =
        workArea.width - settings.marginAcross - settings.windowWidth;
    const climbBudget =
        workArea.height - settings.marginUp - settings.windowHeight;
    const travel = settings.spread
        ? spreadTravel(marchBudget, climbBudget, windows.length)
        : fixedTravel(marchBudget, climbBudget, settings);
    const origin = anchor(workArea, settings);

    return windows.map((window, index) => {
        const { march, climb } = travel(index);
        return {
            id: window.id,
            frame: trimmed(workArea, {
                x: origin.x + march * (fromRight ? -1 : 1),
                y: origin.y - climb * (fromTop ? -1 : 1),
                width: settings.windowWidth,
                height: settings.windowHeight,
            }),
        };
    });
}

/** How far the window at an index stands from the anchor, along the march
 * and along the climb. */
type Travel = (index: number) => { march: number; climb: number };

/** Fixed offsets. A negative budget holds its axis to one slot, so windows
 * taller than the room march at the anchor's height, and windows wider
 * than it pile on the anchor. A zero across offset goes nowhere, so it
 * never ends a cycle and the windows climb in one column, wrapping, as a
 * zero up offset marches them along one row. */
function fixedTravel(
    marchBudget: number,
    climbBudget: number,
    settings: CascadeSettings,
): Travel {
    const across = settings.offsetAcross;
    const up = settings.offsetUp;
    const slotsPerColumn = 1 + stepsThatFit(climbBudget, up);
    const slotsPerCycle =
        across <= 0 ? Infinity : 1 + stepsThatFit(marchBudget, across);
    return (index) => {
        const slot = index % slotsPerCycle;
        return { march: slot * across, climb: (slot % slotsPerColumn) * up };
    };
}

/** Spread: each window at its own share of the room, rounded to a whole
 * pixel on its own rather than stepped by one rounded share, so the list
 * runs from the anchor to the far corner exactly and never wraps. Windows
 * stand apart while either axis has a pixel for each; with more windows than
 * pixels on both, neighbours share a spot. A lone window, or a spent budget,
 * stands on the anchor. */
function spreadTravel(
    marchBudget: number,
    climbBudget: number,
    count: number,
): Travel {
    const share = (budget: number, index: number): number =>
        count <= 1 || budget <= 0
            ? 0
            : Math.round((budget * index) / (count - 1));
    return (index) => ({
        march: share(marchBudget, index),
        climb: share(climbBudget, index),
    });
}

/** Which sides of the work area the corner touches. */
function sidesOf(corner: CascadeCorner): {
    fromRight: boolean;
    fromTop: boolean;
} {
    return {
        fromRight: corner === "bottom-right" || corner === "top-right",
        fromTop: corner === "top-left" || corner === "top-right",
    };
}

/** The anchor, where the first window's frame starts: the chosen corner
 * of the work area, moved in by the margins, less the window's own size on
 * the far sides. */
function anchor(
    workArea: Rectangle,
    settings: CascadeSettings,
): { x: number; y: number } {
    const { fromRight, fromTop } = sidesOf(settings.corner);
    return {
        x: fromRight
            ? workArea.x +
              workArea.width -
              settings.marginAcross -
              settings.windowWidth
            : workArea.x + settings.marginAcross,
        y: fromTop
            ? workArea.y + settings.marginUp
            : workArea.y +
              workArea.height -
              settings.marginUp -
              settings.windowHeight,
    };
}

/** Whole steps of `step` that fit inside `budget`; none when either is
 * absent, never a division by zero. */
function stepsThatFit(budget: number, step: number): number {
    if (budget <= 0 || step <= 0) {
        return 0;
    }
    return Math.floor(budget / step);
}
