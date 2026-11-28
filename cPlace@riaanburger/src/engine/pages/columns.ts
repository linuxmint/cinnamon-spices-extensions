// The columns page: the window list to tick, the focused window leading it
// into the first cell, the preview, the count, and the area the columns
// fill, chosen on the preview by grid cells as the grid page chooses a
// window's, the whole work area until one is chosen. An area makes a main
// and stack two steps: the grid places the main window, and columns stack
// the rest beside it. A focused window lying wholly outside the area is
// that main window, so it arrives unticked. The arrangement stays pure in
// src/arrangements/columns.ts and is handed the area as the rectangle it
// fills.

import type { Rectangle, WindowTarget } from "../../arrangement";
import type { ColumnsSettings } from "../../arrangements/columns";
import { columns } from "../../arrangements/columns";
import { _, fill, ngettext } from "../../i18n";
import { cellArea } from "../../arrangements/grid";
import { AreaPicker } from "../area-picker";
import type { Area } from "../areas";
import {
    areaFrom,
    areaValue,
    isWholeArea,
    wholeArea,
    whollyOutside,
} from "../areas";
import { currentWorkArea } from "../gather";
import type { GridLayout } from "../grid-layouts";
import { GRID_LAYOUTS_KEY, layoutsOr } from "../grid-layouts";
import { describeGridPreset } from "../grid-presets";
import { fillLayoutButtons } from "../grid-view";
import type { ArrangementPage, PageHost, PresetVariables } from "../page";
import type { PreviewView } from "../preview";
import { logical } from "../logical";
import type { EngineSettings } from "../settings";
import type { NumberVariable } from "../variables";
import { heading } from "../widgets";
import { ListPage } from "./list-page";

const St = imports.gi.St;

const columnCount: NumberVariable = {
    key: "columns-count",
    name: () => _("columns"),
    fallback: 2,
    min: 1,
    max: 6,
    steps: [1],
};
const AREA_KEY = "columns-area";

class ColumnsPage extends ListPage<ColumnsSettings> {
    readonly key = "columns";
    readonly letter = "n";
    readonly name = _("Columns");
    protected readonly arrangement = columns;

    private layouts: GridLayout[] = [];
    private picker: AreaPicker | null = null;
    private layoutRow: imports.gi.St.BoxLayout | null = null;

    constructor(store: EngineSettings) {
        super(store, { focusedFirst: true, sendsToEnd: false });
    }

    override build(host: PageHost): imports.gi.Clutter.Actor {
        this.layouts = layoutsOr(this.store.list(GRID_LAYOUTS_KEY));
        this.picker = new AreaPicker(this.storedArea(), (area) => {
            this.keep(area);
        });
        return super.build(host);
    }

    override release(): void {
        this.picker = null;
        this.layoutRow = null;
        super.release();
    }

    override hint(): string {
        return _(
            "Two clicks on the preview choose the area. Tab moves focus, " +
                "Space toggles, Ctrl+digit saves a preset.",
        );
    }

    /** A columns preset holds the area beside the count and the scope. */
    override snapshot(): PresetVariables {
        const area = this.picker?.current();
        return area === undefined
            ? super.snapshot()
            : { ...super.snapshot(), area: areaValue(area) };
    }

    describe(variables: PresetVariables): string {
        const count = variables["count"];
        if (typeof count !== "number") {
            return "?";
        }
        const area = areaFrom(variables["area"], this.layouts);
        return area === null || isWholeArea(area)
            ? fill(ngettext("{count} column", "{count} columns", count), {
                  count,
              })
            : fill(
                  ngettext(
                      "{count} column in {area}",
                      "{count} columns in {area}",
                      count,
                  ),
                  { count, area: describeGridPreset(areaValue(area)) },
              );
    }

    /** The count as stored, held to the spin's bounds, so a count edited
     * into the settings file by hand cannot ask for a million columns. */
    protected settings(): ColumnsSettings {
        const count = this.store.number(columnCount.key, columnCount.fallback);
        return {
            count: Math.min(columnCount.max, Math.max(columnCount.min, count)),
        };
    }

    protected buildControls(): imports.gi.St.BoxLayout {
        return this.variablesColumn([columnCount]).actor;
    }

    protected restoreVariables(values: PresetVariables): void {
        if (typeof values["count"] === "number") {
            this.store.write(columnCount.key, values["count"]);
        }
        const area = areaFrom(values["area"], this.layouts);
        if (area !== null) {
            this.picker?.set(area);
            this.store.write(AREA_KEY, areaValue(area));
            this.relight();
        }
    }

    /** The area's heading and its layouts, above the preview. */
    protected override aboveThePreview(): imports.gi.Clutter.Actor {
        const column = new St.BoxLayout({
            vertical: true,
            style_class: "cplace-column",
        });
        column.add_child(heading(_("Area")));
        this.layoutRow = new St.BoxLayout({
            vertical: false,
            style_class: "cplace-layouts",
        });
        column.add_child(this.layoutRow);
        this.relight();
        return column;
    }

    protected override areaWithin(workArea: Rectangle): Rectangle {
        const area = this.picker?.current();
        return area === undefined
            ? workArea
            : cellArea(workArea, {
                  columns: area.layout.columns,
                  rows: area.layout.rows,
                  cells: area.cells,
              });
    }

    /** The main window the grid placed beside the area lies wholly outside
     * it, and stays out of the columns unless ticked by hand. */
    protected override leavesFocusedOut(frame: Rectangle): boolean {
        return whollyOutside(frame, this.areaWithin(currentWorkArea()));
    }

    protected override beneath(
        canvas: imports.gi.Clutter.Actor,
        view: PreviewView,
    ): void {
        this.picker?.beneath(canvas, view);
    }

    protected override above(canvas: imports.gi.Clutter.Actor): void {
        this.picker?.above(canvas);
    }

    /** The rows the windows take, and the area when it is not the whole
     * work area, both measured from what will be applied. */
    protected note(targets: WindowTarget[], area: Rectangle): string {
        const rows = new Set(targets.map((target) => target.frame.y)).size;
        const whole = this.picker === null || isWholeArea(this.picker.current());
        const values = {
            count: rows,
            width: logical(area.width),
            height: logical(area.height),
            x: logical(area.x),
            y: logical(area.y),
        };
        return whole
            ? fill(ngettext("{count} row", "{count} rows", rows), values)
            : fill(
                  ngettext(
                      "{count} row in {width} × {height} at {x}, {y}",
                      "{count} rows in {width} × {height} at {x}, {y}",
                      rows,
                  ),
                  values,
              );
    }

    /** The area the settings hold, or the whole work area in the first of
     * the grid's layouts when they hold none. */
    private storedArea(): Area {
        const first = this.layouts[0] ?? {
            label: "1 × 1",
            columns: [1],
            rows: [1],
        };
        return (
            areaFrom(this.store.raw(AREA_KEY), this.layouts) ?? wholeArea(first)
        );
    }

    private keep(area: Area): void {
        this.store.write(AREA_KEY, areaValue(area));
        this.refocus();
        this.relight();
        this.refreshPreview();
    }

    /** The layout buttons, the area's own lit; picking one keeps the area
     * as nearly as the new layout's cells allow. */
    private relight(): void {
        const picker = this.picker;
        if (this.layoutRow === null || picker === null) {
            return;
        }
        fillLayoutButtons(
            this.layoutRow,
            this.layouts,
            picker.current().layout,
            (index) => {
                const layout = this.layouts[index];
                if (layout !== undefined) {
                    picker.relayout(layout, currentWorkArea());
                    this.keep(picker.current());
                }
            },
        );
    }
}

export function columnsPage(store: EngineSettings): ArrangementPage {
    return new ColumnsPage(store);
}
