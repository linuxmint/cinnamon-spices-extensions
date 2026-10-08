// An area of the screen chosen by grid cells, as plain data: a layout and
// the cells in it. The columns page tiles its windows inside one, which
// makes a main and stack two steps, the grid placing the main window and
// columns filling the area beside it. An area is stored as a grid preset
// is, the layout's label and spans beside the cells, so it survives edits
// to the layouts list and describes itself in the grid's own words. Pure,
// so it is tested without a desktop.

import type { Rectangle } from "../arrangement";
import type { CellSpan } from "../arrangements/grid";
import type { GridLayout } from "./grid-layouts";
import { sameSpans } from "./grid-layouts";
import { presetCells, presetLabel, presetSpans } from "./grid-presets";

export interface Area {
    layout: GridLayout;
    cells: CellSpan;
}

/** Every cell of a layout: the whole work area. */
export function wholeArea(layout: GridLayout): Area {
    return {
        layout,
        cells: {
            left: 0,
            top: 0,
            right: layout.columns.length - 1,
            bottom: layout.rows.length - 1,
        },
    };
}

export function isWholeArea(area: Area): boolean {
    const whole = wholeArea(area.layout).cells;
    const cells = area.cells;
    return (
        Math.min(cells.left, cells.right) === whole.left &&
        Math.min(cells.top, cells.bottom) === whole.top &&
        Math.max(cells.left, cells.right) === whole.right &&
        Math.max(cells.top, cells.bottom) === whole.bottom
    );
}

/** An area as the settings store and presets keep it. */
export function areaValue(area: Area): Record<string, unknown> {
    return {
        layout: area.layout.label,
        columns: [...area.layout.columns],
        rows: [...area.layout.rows],
        ...area.cells,
    };
}

/** A stored area read back: its layout matched to one of the settings'
 * layouts where the spans agree, so its label stays current, and its cells
 * held inside the layout; null for anything that does not parse. */
export function areaFrom(value: unknown, layouts: GridLayout[]): Area | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const stored = value as Record<string, unknown>;
    const columns = presetSpans(stored["columns"]);
    const rows = presetSpans(stored["rows"]);
    const cells = presetCells(stored);
    if (columns === null || rows === null || cells === null) {
        return null;
    }
    const layout = layouts.find(
        (known) =>
            sameSpans(known.columns, columns) && sameSpans(known.rows, rows),
    ) ?? { label: presetLabel(stored), columns, rows };
    const column = (index: number): number =>
        Math.min(columns.length - 1, Math.max(0, Math.floor(index)));
    const row = (index: number): number =>
        Math.min(rows.length - 1, Math.max(0, Math.floor(index)));
    return {
        layout,
        cells: {
            left: column(Math.min(cells.left, cells.right)),
            top: row(Math.min(cells.top, cells.bottom)),
            right: column(Math.max(cells.left, cells.right)),
            bottom: row(Math.max(cells.top, cells.bottom)),
        },
    };
}

/** True when a frame and an area share no pixel, touching edges included:
 * the main window the grid placed in the cells beside a columns area lies
 * wholly outside it, and so stays out of the columns. */
export function whollyOutside(frame: Rectangle, area: Rectangle): boolean {
    return (
        frame.x + frame.width <= area.x ||
        area.x + area.width <= frame.x ||
        frame.y + frame.height <= area.y ||
        area.y + area.height <= frame.y
    );
}
