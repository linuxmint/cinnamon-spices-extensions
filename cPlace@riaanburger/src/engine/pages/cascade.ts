// The cascade's page: the window list to tick, the preview with the corner
// brackets, the variables and the spread tick, and what a preset of the
// cascade holds. The arrangement itself stays pure in
// src/arrangements/cascade.ts; this module reads the store and draws the
// cascade's own handles, and the list-and-preview shape is list-page.ts.
// Every length the page shows, stores and keeps in a preset is in the
// desktop's logical pixels, the ones St draws the chooser in, and is
// multiplied by the desktop's scale only where it goes to the arrangement,
// so a length looks the same on a screen at any scale.

import type { WindowTarget } from "../../arrangement";
import type { CascadeCorner, CascadeSettings } from "../../arrangements/cascade";
import { cascade } from "../../arrangements/cascade";
import { _, fill, listed } from "../../i18n";
import { appName } from "../gather";
import type { ArrangementPage, PresetVariables } from "../page";
import type { PreviewView } from "../preview";
import { logical, logicalRoom, toDevice } from "../logical";
import { addHandles } from "../preview";
import type { EngineSettings } from "../settings";
import { compactTick } from "../widgets";
import type { NumberVariable } from "../variables";
import { ListPage, stringList } from "./list-page";

const CheckBoxes = imports.ui.checkBox;

const corners: CascadeCorner[] = [
    "bottom-left",
    "bottom-right",
    "top-left",
    "top-right",
];
const CORNER_KEY = "cascade-corner";
const SPREAD_KEY = "cascade-spread";
/** Where cascades usually start. */
const FIRST_CORNER: CascadeCorner = "top-left";

/** The corner brackets' side, the stylesheet's 18 pixels, and their gap
 * from the screen's edge, both at the desktop's scale, which St applies
 * to the stylesheet. */
function bracket(): { side: number; inset: number } {
    return { side: 18 * global.ui_scale, inset: 3 * global.ui_scale };
}

/** A window's side as stored or, while none is set, half the work
 * area's, which is the proportion the first default had on the screen it
 * was measured on. */
function sideOr(stored: number, extent: number): number {
    return stored > 0 ? stored : Math.floor(extent / 2);
}

type NumberField = Exclude<keyof CascadeSettings, "corner" | "spread">;


// Each number rides a framed spin with granularities matched to its range:
// the window sides span thousands of pixels, the offsets and the margins
// only hundreds. A side of 0 is half the work area's. An offset may be
// zero, a zero up offset marching across without climbing, so tall windows
// need not climb, and a margin may go negative, pulling the anchor past its
// edge while the cascade trims what would leave the screen.
type CascadeNumber = NumberVariable & { field: NumberField; name: () => string };

const numbers: CascadeNumber[] = [
    { key: "cascade-window-width", field: "windowWidth", name: () => _("width"), fallback: 0, min: 100, max: 10000, steps: [1, 10, 100] },
    { key: "cascade-window-height", field: "windowHeight", name: () => _("height"), fallback: 0, min: 100, max: 10000, steps: [1, 10, 100] },
    { key: "cascade-offset-across", field: "offsetAcross", name: () => _("across"), fallback: 95, min: 0, max: 2000, steps: [1, 5, 10] },
    { key: "cascade-offset-up", field: "offsetUp", name: () => _("up"), fallback: 70, min: 0, max: 2000, steps: [1, 5, 10] },
    { key: "cascade-margin-across", field: "marginAcross", name: () => _("margin across"), fallback: 10, min: -3000, max: 1000, steps: [1, 10, 100] },
    { key: "cascade-margin-up", field: "marginUp", name: () => _("margin up"), fallback: 10, min: -3000, max: 1000, steps: [1, 10, 100] },
];

function asCorner(value: string): CascadeCorner {
    return corners.includes(value as CascadeCorner)
        ? (value as CascadeCorner)
        : FIRST_CORNER;
}

/** Whether the cascade climbs down, from a top corner, rather than up from
 * a bottom one, so the rows and the caption say which way it goes; the
 * settings keys keep up, meaning away from the corner's top or bottom edge. */
function climbsDown(corner: CascadeCorner): boolean {
    return corner === "top-left" || corner === "top-right";
}

class CascadePage extends ListPage<CascadeSettings> {
    readonly key = "cascade";
    readonly letter = "c";
    readonly name = _("Cascade");
    protected readonly arrangement = cascade;
    /** Names the variables' rows again, once the corner has moved. */
    private renameVariables: (() => void) | null = null;

    constructor(store: EngineSettings) {
        super(store, { focusedFirst: false, sendsToEnd: true });
    }

    override release(): void {
        this.renameVariables = null;
        super.release();
    }

    override hint(): string {
        return _(
            "The arrow on an application's row sends its windows to the " +
                "end. Tab moves focus and Space toggles. Digits run presets, " +
                "Ctrl+digit saves one.",
        );
    }

    /** The size and the offsets, then any application sent to the end. */
    describe(variables: PresetVariables): string {
        const shown = (field: NumberField): string => {
            const value = variables[field];
            return typeof value === "number" ? String(value) : "?";
        };
        const last = (stringList(variables["lastAppIds"]) ?? []).map(appName);
        return listed(
            fill(_("{width} × {height}"), {
                width: shown("windowWidth"),
                height: shown("windowHeight"),
            }),
            `${shown("offsetAcross")}/${shown("offsetUp")}`,
            last.length === 0
                ? ""
                : fill(_("{applications} last"), {
                      applications: last.join(", "),
                  }),
        );
    }

    /** The settings in device pixels, as the arrangement works. */
    protected settings(): CascadeSettings {
        return toDevice(
            this.logicalSettings(),
            numbers.map((number) => number.field),
        );
    }

    /** A preset keeps the lengths as the chooser shows them. */
    protected override presetValues(): object {
        return this.logicalSettings();
    }

    /** The settings as stored, in logical pixels, a side left unset
     * resolved to half the work area's. */
    private logicalSettings(): CascadeSettings {
        const stored = (field: NumberField): number => {
            const number = numbers.find((entry) => entry.field === field);
            return number === undefined
                ? 0
                : this.store.number(number.key, number.fallback);
        };
        const room = logicalRoom();
        return {
            windowWidth: sideOr(stored("windowWidth"), room.width),
            windowHeight: sideOr(stored("windowHeight"), room.height),
            offsetAcross: stored("offsetAcross"),
            offsetUp: stored("offsetUp"),
            marginAcross: stored("marginAcross"),
            marginUp: stored("marginUp"),
            corner: this.corner(),
            spread: this.store.flag(SPREAD_KEY, false),
        };
    }

    /** The variables and, under them, the spread tick. The window sides
     * stop at the work area's own size, so no spin sets a size the screen
     * cannot show and no screen is capped at another's, and a side left
     * unset shows the pixels half the work area comes to. */
    protected buildControls(): imports.gi.St.BoxLayout {
        const room = logicalRoom();
        const sides: Partial<Record<NumberField, number>> = {
            windowWidth: room.width,
            windowHeight: room.height,
        };
        const variables = this.variablesColumn(
            numbers.map((number) => {
                const extent = sides[number.field];
                return {
                    ...number,
                    name: this.rowName(number),
                    max: Math.min(number.max, extent ?? number.max),
                    shown:
                        extent === undefined
                            ? undefined
                            : (stored: number) => sideOr(stored, extent),
                };
            }),
        );
        this.renameVariables = variables.rename;
        const column = variables.actor;
        const spreadTick = new CheckBoxes.CheckBox(
            _("Spread the windows across the work area"),
            {},
            this.settings().spread,
        );
        spreadTick.actor.add_style_class_name("cplace-check");
        compactTick(spreadTick.actor);
        spreadTick.actor.connect("clicked", () => {
            this.store.write(SPREAD_KEY, spreadTick.actor.checked);
            this.refreshPreview();
        });
        column.add_child(spreadTick.actor);
        return column;
    }

    protected restoreVariables(values: PresetVariables): void {
        for (const number of numbers) {
            const value = values[number.field];
            if (typeof value === "number") {
                this.store.write(number.key, value);
            }
        }
        if (typeof values["corner"] === "string") {
            this.store.write(CORNER_KEY, asCorner(values["corner"]));
        }
        if (typeof values["spread"] === "boolean") {
            this.store.write(SPREAD_KEY, values["spread"]);
        }
    }

    /** One bracket per corner of the screen, two sides of a square hugging
     * the frame's own corner, the starting corner lit. */
    protected override above(
        canvas: imports.gi.Clutter.Actor,
        view: PreviewView,
    ): void {
        const { side, inset } = bracket();
        const far = view.width - side - inset;
        const low = view.height - side - inset;
        addHandles(canvas, {
            family: "cplace-corner",
            places: [
                { id: "top-left", x: inset, y: inset },
                { id: "top-right", x: far, y: inset },
                { id: "bottom-left", x: inset, y: low },
                { id: "bottom-right", x: far, y: low },
            ],
            active: this.settings().corner,
            onPick: (corner: CascadeCorner) => {
                this.store.write(CORNER_KEY, corner);
                this.renameVariables?.();
                this.refreshPreview();
            },
        });
    }

    /** The step between the first two targets, measured from what will be
     * applied rather than from any setting, so a spread reads as one, in
     * logical pixels as the variables are. */
    protected note(targets: WindowTarget[]): string {
        const [first, second] = targets;
        if (first === undefined || second === undefined) {
            return "";
        }
        const across = logical(Math.abs(second.frame.x - first.frame.x));
        const climb = logical(Math.abs(second.frame.y - first.frame.y));
        return fill(
            climbsDown(this.corner())
                ? _("step {across} across, {climb} down")
                : _("step {across} across, {climb} up"),
            { across, climb },
        );
    }

    private corner(): CascadeCorner {
        return asCorner(this.store.text(CORNER_KEY, FIRST_CORNER));
    }

    /** A row's name, the climb's two following the corner. */
    private rowName(number: CascadeNumber): () => string {
        const down = (): boolean => climbsDown(this.corner());
        if (number.field === "offsetUp") {
            return () => (down() ? _("down") : _("up"));
        }
        return number.field === "marginUp"
            ? () => (down() ? _("margin down") : _("margin up"))
            : number.name;
    }
}

export function cascadePage(store: EngineSettings): ArrangementPage {
    return new CascadePage(store);
}
