// The grid page's selection, as plain data: a cursor cell the arrows move,
// an anchor it grows from, and the cells a window's frame already covers,
// which is where the grid opens so that Enter at once snaps the window to
// the grid. Pure, so every rule here is tested without a desktop.

import type { Rectangle } from "../arrangement";
import type { CellSpan } from "../arrangements/grid";
import { spanEdges } from "../arrangements/spans";

/** One cell, zero-based. */
export interface Cell {
    column: number;
    row: number;
}

export type Direction = "left" | "right" | "up" | "down";

/** The rectangle of cells between two corners, whichever way round. */
export function cellSpan(anchor: Cell, head: Cell): CellSpan {
    return {
        left: Math.min(anchor.column, head.column),
        top: Math.min(anchor.row, head.row),
        right: Math.max(anchor.column, head.column),
        bottom: Math.max(anchor.row, head.row),
    };
}

/** One cell further in a direction, stopping at the grid's edge. */
export function stepped(
    cell: Cell,
    direction: Direction,
    columns: number,
    rows: number,
): Cell {
    const column =
        direction === "left"
            ? cell.column - 1
            : direction === "right"
              ? cell.column + 1
              : cell.column;
    const row =
        direction === "up"
            ? cell.row - 1
            : direction === "down"
              ? cell.row + 1
              : cell.row;
    return {
        column: Math.min(columns - 1, Math.max(0, column)),
        row: Math.min(rows - 1, Math.max(0, row)),
    };
}

/** The cells a frame covers: each of its edges snapped to the nearest cell
 * edge, and a frame narrower than any cell taking the cell under its
 * centre. */
export function snappedCells(
    workArea: Rectangle,
    columns: number[],
    rows: number[],
    frame: Rectangle,
): CellSpan {
    const [left, right] = snappedRun(
        spanEdges(workArea.x, workArea.width, columns),
        frame.x,
        frame.x + frame.width,
    );
    const [top, bottom] = snappedRun(
        spanEdges(workArea.y, workArea.height, rows),
        frame.y,
        frame.y + frame.height,
    );
    return { left, top, right, bottom };
}

/** On one axis: the piece whose start is nearest the frame's start, and
 * the piece whose end is nearest the frame's end. */
function snappedRun(
    edges: number[],
    start: number,
    end: number,
): [number, number] {
    const first = nearest(edges.slice(0, -1), start);
    const last = nearest(edges.slice(1), end);
    if (last >= first) {
        return [first, last];
    }
    const centre = pieceAt(edges, (start + end) / 2);
    return [centre, centre];
}

/** The index of the value nearest a target, the lower on a tie. */
function nearest(values: number[], target: number): number {
    let best = 0;
    values.forEach((value, index) => {
        if (Math.abs(value - target) < Math.abs((values[best] ?? 0) - target)) {
            best = index;
        }
    });
    return best;
}

/** The piece a point falls in, the first or the last beyond either end. */
function pieceAt(edges: number[], point: number): number {
    const pieces = edges.length - 1;
    for (let index = 0; index < pieces - 1; index += 1) {
        if (point < (edges[index + 1] ?? 0)) {
            return index;
        }
    }
    return Math.max(0, pieces - 1);
}
