// The grid: a window into a rectangle of cells. gTile's own gesture, with
// the choosing left to the engine's page and only its result crossing the
// contract: the layout's spans and the chosen cells are the settings, and
// every window given lands in the same frame. Picking cells for one window
// is an interactive gesture, but it needs no contract of its own: the
// picking is the page's, and what crosses the contract is a list of windows
// and settings like any other arrangement's. Uneven spans cut at whole
// pixels, so the cells tile exactly.

import type { ArrangementInput, Rectangle, WindowTarget } from "../arrangement";
import { piece, spanEdges } from "./spans";

/** A rectangle of cells, zero-based and inclusive: the first and last
 * column, the first and last row. Either pair may come in either order. */
export interface CellSpan {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** The grid's knobs: the layout as spans, a column twice as wide as its
 * neighbours carrying twice their span, and the cells chosen in it. */
export interface GridSettings {
    columns: number[];
    rows: number[];
    cells: CellSpan;
}

/** The rectangle the chosen cells cover in a work area, the cells put in
 * order and clamped into the layout. The grid lands its windows here, and
 * the columns page hands it to columns as the area to tile. */
export function cellArea(
    workArea: Rectangle,
    settings: GridSettings,
): Rectangle {
    const across = piece(
        spanEdges(workArea.x, workArea.width, settings.columns),
        settings.cells.left,
        settings.cells.right,
    );
    const down = piece(
        spanEdges(workArea.y, workArea.height, settings.rows),
        settings.cells.top,
        settings.cells.bottom,
    );
    return {
        x: across.start,
        y: down.start,
        width: across.size,
        height: down.size,
    };
}

/** The chosen cells' rectangle as the frame of every window given. */
export function grid(input: ArrangementInput<GridSettings>): WindowTarget[] {
    const frame = cellArea(input.workArea, input.settings);
    return input.windows.map((window) => ({
        id: window.id,
        frame: { ...frame },
    }));
}
