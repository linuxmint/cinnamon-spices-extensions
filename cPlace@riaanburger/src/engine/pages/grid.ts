// The grid's page: the focused window named at the top, the layouts on
// buttons, and the grid itself, where two clicks, or the arrows and Enter,
// choose the cells the window lands in. It lists no windows and previews
// nothing beyond the grid, since it follows gTile's gesture, a grid and two
// clicks, rather than the shape of the list pages. The
// grid opens with the cells the window already covers chosen, so Enter at
// once snaps the window to the grid. The arrangement stays pure in
// src/arrangements/grid.ts, and the selection's rules in grid-cells.ts.

import type { Rectangle, WindowTarget } from "../../arrangement";
import type { GridSettings } from "../../arrangements/grid";
import { cellArea, grid } from "../../arrangements/grid";
import { _, fill, listed } from "../../i18n";
import {
    allWorkAreas,
    currentWorkArea,
    focusedWindow,
    frameOf,
    placeName,
} from "../gather";
import type { Cell, Direction } from "../grid-cells";
import { cellSpan, snappedCells, stepped } from "../grid-cells";
import type { GridLayout } from "../grid-layouts";
import {
    fallbackLayouts,
    GRID_LAYOUTS_KEY,
    layoutsOr,
    sameSpans,
} from "../grid-layouts";
import {
    describeGridPreset,
    presetCells,
    presetLabel,
    presetSpans,
} from "../grid-presets";
import { fillLayoutButtons, GridView } from "../grid-view";
import type {
    ArrangementPage,
    KeyModifiers,
    PageHost,
    PresetVariables,
} from "../page";
import { widthForHeight } from "../fitting";
import type { EngineSettings } from "../settings";
import { logical } from "../logical";
import { heading, replaceChild } from "../widgets";
import { windowHeader } from "./window-header";

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

type MetaWindow = imports.gi.Meta.Window;

const LAST_KEY = "grid-last-layout";

const arrowDirections = new Map<number, Direction>([
    [Clutter.KEY_Left, "left"],
    [Clutter.KEY_Right, "right"],
    [Clutter.KEY_Up, "up"],
    [Clutter.KEY_Down, "down"],
    [Clutter.KEY_KP_Left, "left"],
    [Clutter.KEY_KP_Right, "right"],
    [Clutter.KEY_KP_Up, "up"],
    [Clutter.KEY_KP_Down, "down"],
]);

class GridPage implements ArrangementPage {
    readonly key = "grid";
    readonly letter = "g";
    readonly name = _("Grid");

    private layouts: GridLayout[] = fallbackLayouts;
    private layout: GridLayout = { label: "1 × 1", columns: [1], rows: [1] };
    private window: MetaWindow | null = null;
    private workArea: Rectangle = { x: 0, y: 0, width: 1, height: 1 };
    private anchor: Cell = { column: 0, row: 0 };
    private head: Cell = { column: 0, row: 0 };
    /** A first click has anchored the rectangle and the pointer drags its
     * far corner until the second click places the window. */
    private pointing = false;
    private host: PageHost | null = null;
    /** The page's width from the stylesheet, less whatever fitting the
     * dialog to the screen has taken back. */
    private gridWidth = 1;
    private view: GridView | null = null;
    private viewBin: imports.gi.St.Bin | null = null;
    private layoutRow: imports.gi.St.BoxLayout | null = null;
    private caption: imports.gi.St.Label | null = null;

    constructor(private readonly store: EngineSettings) {}

    build(host: PageHost): imports.gi.Clutter.Actor {
        this.host = host;
        this.gridWidth = host.sizes.page;
        this.window = focusedWindow();
        this.workArea = currentWorkArea();
        this.layouts = layoutsOr(this.store.list(GRID_LAYOUTS_KEY));
        this.useLayout(this.store.number(LAST_KEY, 0));

        const page = new St.BoxLayout({
            vertical: true,
            style_class: "cplace-column cplace-grid-page",
        });
        page.add_child(heading(_("Window")));
        page.add_child(windowHeader(this.window, host.sizes.page));
        page.add_child(heading(_("Layout")));
        this.layoutRow = new St.BoxLayout({
            vertical: false,
            style_class: "cplace-layouts",
        });
        page.add_child(this.layoutRow);
        this.viewBin = new St.Bin({ x_align: St.Align.START });
        page.add_child(this.viewBin);
        this.caption = new St.Label({ style_class: "cplace-preview-caption" });
        page.add_child(this.caption);
        this.redraw();
        return page;
    }

    release(): void {
        this.window = null;
        this.host = null;
        this.pointing = false;
        this.view = null;
        this.viewBin = null;
        this.layoutRow = null;
        this.caption = null;
    }

    /** The focused window into the chosen cells; nothing without one. */
    apply(): { targets: WindowTarget[]; liveWindows: MetaWindow[] } | null {
        if (this.window === null) {
            return null;
        }
        return {
            targets: grid({
                workArea: this.workArea,
                workAreas: allWorkAreas(),
                windows: [{ id: 0, frame: frameOf(this.window) }],
                settings: this.settings(),
            }),
            liveWindows: [this.window],
        };
    }

    /** Whatever the dialog stands over the screen comes out of the grid's
     * height, the width following in the work area's proportions. */
    fit(excess: number): void {
        if (excess <= 0 || this.view === null) {
            return;
        }
        const tall = this.view.actor.height - excess;
        this.gridWidth = Math.min(
            this.gridWidth,
            widthForHeight(this.workArea, tall),
        );
        this.redraw();
    }

    onKey(symbol: number, modifiers: KeyModifiers): boolean {
        const direction = arrowDirections.get(symbol);
        if (direction !== undefined) {
            this.move(direction, modifiers.shift);
            return true;
        }
        if (symbol === Clutter.KEY_space) {
            this.host?.apply();
            return true;
        }
        return false;
    }

    hint(): string {
        return _(
            "Two clicks place the window; arrows move, Shift grows, " +
                "Enter places. Ctrl+digit saves a preset.",
        );
    }

    /** A grid preset is the layout and the cells, never the window. */
    snapshot(): PresetVariables {
        return {
            layout: this.layout.label,
            columns: [...this.layout.columns],
            rows: [...this.layout.rows],
            ...cellSpan(this.anchor, this.head),
        };
    }

    restore(variables: PresetVariables): void {
        const columns = presetSpans(variables["columns"]);
        const rows = presetSpans(variables["rows"]);
        if (columns !== null && rows !== null) {
            this.adoptLayout(presetLabel(variables), columns, rows);
        }
        const cells = presetCells(variables);
        if (cells !== null) {
            this.anchor = this.inside({ column: cells.left, row: cells.top });
            this.head = this.inside({ column: cells.right, row: cells.bottom });
        }
        this.pointing = false;
        if (this.viewBin !== null) {
            this.redraw();
        }
    }

    describe(variables: PresetVariables): string {
        return describeGridPreset(variables);
    }

    private settings(): GridSettings {
        return {
            columns: this.layout.columns,
            rows: this.layout.rows,
            cells: cellSpan(this.anchor, this.head),
        };
    }

    /** The layout at an index, the selection starting over on the cells
     * the window covers in it. */
    private useLayout(index: number): void {
        const clamped = Math.min(
            this.layouts.length - 1,
            Math.max(0, Math.floor(index)),
        );
        this.layout = this.layouts[clamped] ?? this.layout;
        const span =
            this.window === null
                ? { left: 0, top: 0, right: 0, bottom: 0 }
                : snappedCells(
                      this.workArea,
                      this.layout.columns,
                      this.layout.rows,
                      frameOf(this.window),
                  );
        this.anchor = { column: span.left, row: span.top };
        this.head = { column: span.right, row: span.bottom };
        this.pointing = false;
    }

    /** A preset's layout: the matching one from the settings, lit on its
     * button and remembered, or the preset's own when none matches. */
    private adoptLayout(
        label: string,
        columns: number[],
        rows: number[],
    ): void {
        const index = this.layouts.findIndex(
            (layout) =>
                sameSpans(layout.columns, columns) &&
                sameSpans(layout.rows, rows),
        );
        const known = this.layouts[index];
        if (known !== undefined) {
            this.layout = known;
            this.store.write(LAST_KEY, index);
            return;
        }
        this.layout = { label, columns, rows };
    }

    private inside(cell: Cell): Cell {
        return {
            column: Math.min(
                this.layout.columns.length - 1,
                Math.max(0, Math.floor(cell.column)),
            ),
            row: Math.min(
                this.layout.rows.length - 1,
                Math.max(0, Math.floor(cell.row)),
            ),
        };
    }

    private move(direction: Direction, grow: boolean): void {
        this.head = stepped(
            this.head,
            direction,
            this.layout.columns.length,
            this.layout.rows.length,
        );
        if (!grow) {
            this.anchor = this.head;
        }
        this.pointing = false;
        this.repaint();
    }

    /** The first click anchors a corner; the second places the window. */
    private onClick(cell: Cell): void {
        if (!this.pointing) {
            this.anchor = cell;
            this.head = cell;
            this.pointing = true;
            this.repaint();
            return;
        }
        this.head = cell;
        this.pointing = false;
        this.repaint();
        this.host?.apply();
    }

    /** Between the clicks the far corner follows the pointer. */
    private onHover(cell: Cell): void {
        if (this.pointing) {
            this.head = cell;
            this.repaint();
        }
    }

    /** The layout buttons and the grid, built afresh for a layout. */
    private redraw(): void {
        this.rebuildLayoutButtons();
        this.view = new GridView(
            { workArea: this.workArea, width: this.gridWidth },
            this.layout,
            this.window === null ? null : frameOf(this.window),
            {
                click: (cell) => {
                    this.onClick(cell);
                },
                hover: (cell) => {
                    this.onHover(cell);
                },
            },
        );
        if (this.viewBin !== null) {
            replaceChild(this.viewBin, this.view.actor);
        }
        this.repaint();
    }

    private rebuildLayoutButtons(): void {
        if (this.layoutRow === null) {
            return;
        }
        fillLayoutButtons(
            this.layoutRow,
            this.layouts,
            this.layout,
            (index) => {
                this.store.write(LAST_KEY, index);
                this.useLayout(index);
                this.redraw();
            },
        );
    }

    /** Light the chosen cells and say where the window will land. */
    private repaint(): void {
        this.view?.paint(cellSpan(this.anchor, this.head), this.head);
        if (this.caption === null) {
            return;
        }
        const frame = cellArea(this.workArea, this.settings());
        const area = this.workArea;
        this.caption.set_text(
            listed(
                placeName(),
                fill(_("{width} × {height}"), {
                    width: logical(area.width),
                    height: logical(area.height),
                }),
                fill(_("target {width} × {height} at {x}, {y}"), {
                    width: logical(frame.width),
                    height: logical(frame.height),
                    x: logical(frame.x),
                    y: logical(frame.y),
                }),
            ),
        );
    }
}

export function gridPage(store: EngineSettings): ArrangementPage {
    return new GridPage(store);
}
