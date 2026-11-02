// The grid drawn small for the grid's page: the work area as a screen in
// its own proportions, a ghost of the window's current frame behind, and
// one button per cell a little apart from its neighbours. It draws and it
// reports clicks and hovers; the page keeps the selection and says what to
// light. Its width is the page's to give: the list pages' own, so switching
// arrangements does not resize the dialog, or less where the screen is
// short. The chooser sizes itself to its content's minimum width, and a
// grid at the preview's width left every label on the page cut short.

import type { Rectangle } from "../arrangement";
import type { CellSpan } from "../arrangements/grid";
import { spanEdges } from "../arrangements/spans";
import type { Cell } from "./grid-cells";
import type { GridLayout } from "./grid-layouts";
import { sameSpans } from "./grid-layouts";

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

/** The screen frame's border, the stylesheet's 2 pixels at the desktop's
 * scale, which St applies to the stylesheet; the cells lie inside it. */
function border(): number {
    return 2 * global.ui_scale;
}

/** Each cell stands this far inside its share of the screen, so
 * neighbours sit twice this apart. */
function inset(): number {
    return global.ui_scale;
}

export interface GridViewEvents {
    click: (cell: Cell) => void;
    hover: (cell: Cell) => void;
}

export class GridView {
    readonly actor: imports.gi.Clutter.Actor;
    private readonly cells: { cell: Cell; button: imports.gi.St.Button }[];

    /** The screen is the work area drawn at a width. The ghost is the
     * window's current frame, drawn behind the cells so the move reads as a
     * move; null draws none. */
    constructor(
        screenAt: { workArea: Rectangle; width: number },
        layout: { columns: number[]; rows: number[] },
        ghost: Rectangle | null,
        events: GridViewEvents,
    ) {
        const { workArea, width } = screenAt;
        const height = Math.max(
            1,
            Math.round((workArea.height * width) / workArea.width),
        );
        this.actor = new Clutter.Actor();
        this.actor.set_size(width, height);
        this.actor.set_clip_to_allocation(true);
        const screen = new St.Bin({ style_class: "cplace-preview-screen" });
        screen.set_size(width, height);
        this.actor.add_child(screen);

        const frame = border();
        const scaleX = (width - 2 * frame) / workArea.width;
        const scaleY = (height - 2 * frame) / workArea.height;
        const toX = (x: number): number =>
            frame + Math.round((x - workArea.x) * scaleX);
        const toY = (y: number): number =>
            frame + Math.round((y - workArea.y) * scaleY);

        if (ghost !== null) {
            this.addGhost(ghost, toX, toY);
        }
        this.cells = addCellButtons(this.actor, {
            edges: cellEdges(workArea, layout, toX, toY),
            layout,
            styleClass: "cplace-grid-cell",
            events,
        });
    }

    /** Light the chosen cells, and mark the cursor among them. */
    paint(span: CellSpan, head: Cell): void {
        for (const { cell, button } of this.cells) {
            const chosen =
                cell.column >= span.left &&
                cell.column <= span.right &&
                cell.row >= span.top &&
                cell.row <= span.bottom;
            const cursor = cell.column === head.column && cell.row === head.row;
            setClass(button, "cplace-grid-cell-selected", chosen);
            setClass(button, "cplace-grid-cell-head", cursor);
        }
    }

    private addGhost(
        frame: Rectangle,
        toX: (x: number) => number,
        toY: (y: number) => number,
    ): void {
        const left = toX(frame.x);
        const top = toY(frame.y);
        const ghost = new St.Bin({ style_class: "cplace-grid-ghost" });
        ghost.set_position(left, top);
        ghost.set_size(
            Math.max(2, toX(frame.x + frame.width) - left),
            Math.max(2, toY(frame.y + frame.height) - top),
        );
        this.actor.add_child(ghost);
    }
}

function setClass(
    widget: imports.gi.St.Widget,
    styleClass: string,
    on: boolean,
): void {
    if (on) {
        widget.add_style_class_name(styleClass);
    } else {
        widget.remove_style_class_name(styleClass);
    }
}

/** A layout's cell edges in a canvas's own coordinates. */
export function cellEdges(
    workArea: Rectangle,
    layout: { columns: number[]; rows: number[] },
    toX: (x: number) => number,
    toY: (y: number) => number,
): { xs: number[]; ys: number[] } {
    return {
        xs: spanEdges(workArea.x, workArea.width, layout.columns).map(toX),
        ys: spanEdges(workArea.y, workArea.height, layout.rows).map(toY),
    };
}

/** Where a layer of cells goes and what it reports. */
export interface CellLayer {
    edges: { xs: number[]; ys: number[] };
    layout: { columns: number[]; rows: number[] };
    styleClass: string;
    events: GridViewEvents;
}

/** One button per cell, a little inside its share, reporting its clicks
 * and the pointer's arrival. Cells take no key focus: a grid of cells in
 * the Tab order would bury every button after it. */
export function addCellButtons(
    canvas: imports.gi.Clutter.Actor,
    layer: CellLayer,
): { cell: Cell; button: imports.gi.St.Button }[] {
    const cells: { cell: Cell; button: imports.gi.St.Button }[] = [];
    layer.layout.rows.forEach((_row, row) => {
        layer.layout.columns.forEach((_column, column) => {
            const cell = { column, row };
            const button = cellButton(cell, layer);
            canvas.add_child(button);
            cells.push({ cell, button });
        });
    });
    return cells;
}

function cellButton(cell: Cell, layer: CellLayer): imports.gi.St.Button {
    const { xs, ys } = layer.edges;
    const left = xs[cell.column] ?? 0;
    const top = ys[cell.row] ?? 0;
    const right = xs[cell.column + 1] ?? left;
    const bottom = ys[cell.row + 1] ?? top;
    const button = new St.Button({
        style_class: layer.styleClass,
        reactive: true,
        track_hover: true,
        can_focus: false,
    });
    const gap = inset();
    button.set_position(left + gap, top + gap);
    button.set_size(
        Math.max(1, right - left - 2 * gap),
        Math.max(1, bottom - top - 2 * gap),
    );
    button.connect("clicked", () => {
        layer.events.click(cell);
    });
    button.connect("notify::hover", () => {
        if (button.hover) {
            layer.events.hover(cell);
        }
    });
    return button;
}

/** The layouts as a row of buttons, the one in use lit, matched by its
 * spans so a stored layout lights its button too; picking one hands back
 * its index. */
export function fillLayoutButtons(
    row: imports.gi.St.BoxLayout,
    layouts: GridLayout[],
    active: GridLayout,
    pick: (index: number) => void,
): void {
    row.destroy_all_children();
    layouts.forEach((layout, index) => {
        const button = new St.Button({
            label: layout.label,
            style_class: "cplace-layout-button",
            can_focus: true,
        });
        if (
            sameSpans(layout.columns, active.columns) &&
            sameSpans(layout.rows, active.rows)
        ) {
            button.add_style_class_name("cplace-layout-button-active");
        }
        button.connect("clicked", () => {
            pick(index);
        });
        row.add_child(button);
    });
}
