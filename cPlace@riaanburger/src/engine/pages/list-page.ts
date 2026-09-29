// The page shape of an arrangement that lists windows to tick, as the
// cascade and Columns do: the window list on the left, and on the right the
// preview over the variables. A page of this shape names its arrangement,
// reads its settings, builds its controls and draws its handles; this class
// builds the page, applies through the list, and keeps presets of the
// variables and the list's scope, never windows. The grid's page has none
// of this and owes it nothing: it places the focused window and lists none.

import type {
    Arrangement,
    Rectangle,
    WindowTarget,
} from "../../arrangement";
import type { ArrangementPage, PageHost, PresetVariables } from "../page";
import type { PreviewView } from "../preview";
import { _ } from "../../i18n";
import { placeName } from "../gather";
import { buildPreview } from "../preview";
import type { EngineSettings } from "../settings";
import type { NumberVariable, VariablesColumn } from "../variables";
import { variablesColumn } from "../variables";
import { WindowList } from "../window-list";
import { ListBody } from "./list-body";

type MetaWindow = imports.gi.Meta.Window;

/** A preset's list of strings, or undefined when it holds none. */
export function stringList(value: unknown): string[] | undefined {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : undefined;
}

/** How a list page orders what it arranges beyond the titles: the focused
 * window first, as Columns rules, or applications sent to the end, as the
 * cascade offers. */
export interface ListOrder {
    focusedFirst: boolean;
    sendsToEnd: boolean;
}

export abstract class ListPage<
    Settings extends object,
> implements ArrangementPage {
    abstract readonly key: string;
    abstract readonly letter: string;
    abstract readonly name: string;

    private body: ListBody | null = null;

    constructor(
        protected readonly store: EngineSettings,
        private readonly order: ListOrder,
    ) {}

    build(host: PageHost): imports.gi.Clutter.Actor {
        const list = new WindowList(
            this.store.participantIds(),
            () => {
                this.refreshPreview();
            },
            {
                focusedFirst: this.order.focusedFirst,
                leavesOut: this.leavesFocusedOut?.bind(this),
            },
            this.order.sendsToEnd,
        );
        this.body = new ListBody(list, host.sizes.preview, {
            above: this.aboveThePreview?.(),
            below: this.buildControls(),
        });
        this.refreshPreview();
        return this.body.actor;
    }

    release(): void {
        this.body = null;
    }

    /** The ticked windows arranged, or nothing with none ticked, so Apply
     * leaves the chooser open as it does on a page with nothing to place. */
    apply(): { targets: WindowTarget[]; liveWindows: MetaWindow[] } | null {
        const ticked = this.body?.list.ticked() ?? null;
        if (ticked === null || ticked.windows.length === 0) {
            return null;
        }
        return {
            targets: this.arrangement({
                workArea: this.within(ticked.workArea),
                workAreas: ticked.workAreas,
                windows: ticked.windows,
                settings: this.settings(),
            }),
            liveWindows: ticked.liveWindows,
        };
    }

    /** A dialog standing over the screen takes the difference from the
     * list, which scrolls, and then from the preview. */
    fit(excess: number): void {
        this.body?.fit(excess, () => {
            this.refreshPreview();
        });
    }

    onKey(): boolean {
        return false;
    }

    hint(): string {
        return _(
            "Tab moves focus and Space toggles. Digits run presets, " +
                "Ctrl+digit saves one. Escape changes nothing.",
        );
    }

    /** A preset holds the variables and the list's scope, never windows:
     * the applications, the minimised toggle, and the applications sent to
     * the end on a page that offers it. */
    snapshot(): PresetVariables {
        const scope = this.body?.list.scope() ?? {
            appIds: this.store.participantIds(),
            includeMinimised: false,
        };
        // The settings are plain data, which is what a preset stores.
        const values: object = this.presetValues?.() ?? this.settings();
        return {
            ...(values as PresetVariables),
            appIds: scope.appIds,
            includeMinimised: scope.includeMinimised,
            ...(this.order.sendsToEnd
                ? { lastAppIds: scope.lastAppIds ?? [] }
                : {}),
        };
    }

    /** A preset's variables and scope, any it doesn't carry left as they
     * are. The controls are built again from the values restored, since a
     * preset whose applications have no window ticked leaves the chooser
     * open on them. */
    restore(variables: PresetVariables): void {
        this.restoreVariables(variables);
        this.body?.showBelow(this.buildControls());
        const list = this.body?.list;
        if (list !== undefined) {
            const current = list.scope();
            const minimised = variables["includeMinimised"];
            list.setScope({
                appIds: stringList(variables["appIds"]) ?? current.appIds,
                includeMinimised:
                    typeof minimised === "boolean"
                        ? minimised
                        : current.includeMinimised,
                lastAppIds: stringList(variables["lastAppIds"]),
            });
        }
        this.refreshPreview();
    }

    abstract describe(variables: PresetVariables): string;

    /** The arrangement's settings as the store holds them now. */
    protected abstract settings(): Settings;

    /** The page's arrangement, held as the contract's type so that the
     * compiler checks it against the contract where the engine meets it. */
    protected abstract readonly arrangement: Arrangement<Settings>;

    /** The column under the preview: the variables and anything else. */
    protected abstract buildControls(): imports.gi.St.BoxLayout;

    /** Writes a preset's variables through the store, leaving any the
     * preset does not carry as they are. */
    protected abstract restoreVariables(variables: PresetVariables): void;

    /** A note for the preview's caption, measured from the targets and the
     * rectangle they were arranged in. */
    protected abstract note(targets: WindowTarget[], area: Rectangle): string;

    /** What a preset keeps of the settings, where it differs from what
     * the arrangement is handed; the settings themselves by default. */
    protected presetValues?(): object;

    /** Anything the page shows above the preview; nothing by default. */
    protected aboveThePreview?(): imports.gi.Clutter.Actor;

    /** True when the focused window, standing at this frame, arrives
     * unticked; never by default. */
    protected leavesFocusedOut?(frame: Rectangle): boolean;

    /** The part of the work area the arrangement fills; all of it by
     * default. The arrangement is handed this rectangle, so it stays blind
     * to how the area was chosen. */
    protected areaWithin?(workArea: Rectangle): Rectangle;

    /** What the page draws beneath the preview's slots; nothing by
     * default. */
    protected beneath?(
        canvas: imports.gi.Clutter.Actor,
        view: PreviewView,
    ): void;

    /** What the page draws above the preview's slots, its handles; nothing
     * by default. */
    protected above?(canvas: imports.gi.Clutter.Actor, view: PreviewView): void;

    /** A heading and a framed spin per number, each writing through the
     * store and redrawing the preview as it changes. */
    protected variablesColumn(numbers: NumberVariable[]): VariablesColumn {
        return variablesColumn(this.store, numbers, () => {
            this.refreshPreview();
        });
    }

    /** The preview draws exactly what apply would do over the whole work
     * area, the page's layers beneath and above and its note in the
     * caption. */
    protected refreshPreview(): void {
        const body = this.body;
        const ticked = body?.list.ticked() ?? null;
        if (body === null || ticked === null) {
            return;
        }
        const area = this.within(ticked.workArea);
        const targets = this.arrangement({
            workArea: area,
            workAreas: ticked.workAreas,
            windows: ticked.windows,
            settings: this.settings(),
        });
        body.showPreview(
            buildPreview(
                ticked.workArea,
                targets,
                {
                    beneath: (canvas, view) => {
                        this.beneath?.(canvas, view);
                    },
                    above: (canvas, view) => {
                        this.above?.(canvas, view);
                    },
                    note: this.note(targets, area),
                    place: placeName(),
                    atEnd: (id) => ticked.atEnd[id] === true,
                },
                body.previewWidth,
            ),
        );
    }

    /** The focus rule again, once what it reads has changed. */
    protected refocus(): void {
        this.body?.list.refocus();
    }

    private within(workArea: Rectangle): Rectangle {
        return this.areaWithin?.(workArea) ?? workArea;
    }
}
