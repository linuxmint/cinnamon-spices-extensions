// Choosing an area of the screen by grid cells on a page's preview, the
// way the grid page chooses a window's cells: the layout's cells drawn
// faintly beneath the preview's slots, the chosen area outlined above
// them, and two clicks to choose, the outline following the pointer
// between them. Choosing redraws nothing but the outline until the second
// click, so no cell is rebuilt under the pointer while it moves. The page
// decides what the area is for; the columns page tiles its windows in it.

import type { Rectangle } from "../arrangement";
import type { CellSpan } from "../arrangements/grid";
import { cellArea } from "../arrangements/grid";
import type { Area } from "./areas";
import type { Cell } from "./grid-cells";
import { cellSpan, snappedCells } from "./grid-cells";
import type { GridLayout } from "./grid-layouts";
import { addCellButtons, cellEdges } from "./grid-view";
import type { PreviewView } from "./preview";

const St = imports.gi.St;

export class AreaPicker {
    private anchor: Cell = { column: 0, row: 0 };
    /** A first click has anchored a corner and the pointer drags the far
     * one until the second click chooses. */
    private pointing = false;
    private outline: imports.gi.St.Bin | null = null;
    private edges: { xs: number[]; ys: number[] } | null = null;

    constructor(
        private area: Area,
        private readonly chosen: (area: Area) => void,
    ) {}

    current(): Area {
        return this.area;
    }

    /** A preset's area, or the settings' own, replacing the current one. */
    set(area: Area): void {
        this.area = area;
        this.pointing = false;
    }

    /** Another layout, keeping the area as nearly as its cells allow. */
    relayout(layout: GridLayout, workArea: Rectangle): void {
        const covered = cellArea(workArea, {
            columns: this.area.layout.columns,
            rows: this.area.layout.rows,
            cells: this.area.cells,
        });
        this.set({
            layout,
            cells: snappedCells(workArea, layout.columns, layout.rows, covered),
        });
    }

    /** The cells, beneath the slots, where the clicks land. */
    beneath(canvas: imports.gi.Clutter.Actor, view: PreviewView): void {
        const layout = this.area.layout;
        this.edges = cellEdges(view.workArea, layout, view.toX, view.toY);
        addCellButtons(canvas, {
            edges: this.edges,
            layout,
            styleClass: "cplace-area-cell",
            events: {
                click: (cell) => {
                    this.click(cell);
                },
                hover: (cell) => {
                    this.hover(cell);
                },
            },
        });
    }

    /** The chosen area's outline, above the slots. */
    above(canvas: imports.gi.Clutter.Actor): void {
        this.outline = new St.Bin({ style_class: "cplace-area-outline" });
        canvas.add_child(this.outline);
        this.frame(this.area.cells);
    }

    private click(cell: Cell): void {
        if (!this.pointing) {
            this.anchor = cell;
            this.pointing = true;
            this.frame(cellSpan(cell, cell));
            return;
        }
        this.pointing = false;
        this.area = {
            layout: this.area.layout,
            cells: cellSpan(this.anchor, cell),
        };
        this.chosen(this.area);
    }

    private hover(cell: Cell): void {
        if (this.pointing) {
            this.frame(cellSpan(this.anchor, cell));
        }
    }

    /** The outline around a run of cells, on the canvas's pixels. */
    private frame(cells: CellSpan): void {
        if (this.outline === null || this.edges === null) {
            return;
        }
        const { xs, ys } = this.edges;
        const left = xs[cells.left] ?? 0;
        const top = ys[cells.top] ?? 0;
        this.outline.set_position(left, top);
        this.outline.set_size(
            Math.max(2, (xs[cells.right + 1] ?? left) - left),
            Math.max(2, (ys[cells.bottom + 1] ?? top) - top),
        );
    }
}
