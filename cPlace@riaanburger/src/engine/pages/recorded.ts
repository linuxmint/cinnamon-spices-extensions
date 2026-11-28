// The Recorded page: the window list to tick on the left, the preview on
// the right, and recordings as its presets. Ctrl with a digit records the
// ticked windows where they stand, in stacking order, and the digit puts
// them back: each window on the workspace, minimised ones too, finds its
// entry by application and title, then by application and stacking order,
// as recordings.ts rules, and a minimised window found is shown as the
// apply places it. Until a recording's row is pointed at or focused,
// the preview draws the ticked windows where they stand, which is what a
// recording would keep; a pointed recording draws its found windows as
// slots at their recorded frames and its missing entries as outlines, and
// Enter puts that one back. A recording keeps frames only, so a window
// recorded maximised comes back at that size but no longer maximised. On a
// desktop of more than one monitor the preview draws them all, since a
// recording keeps windows wherever they stand.

import type { Rectangle, WindowTarget } from "../../arrangement";
import { trimmed } from "../../arrangements/trim";
import { _, fill, ngettext } from "../../i18n";
import { desktopArea, frameOf, monitorCount, windowAppId } from "../gather";
import type { ArrangementPage, PageHost, PresetVariables } from "../page";
import type { PreviewView } from "../preview";
import { buildPreview } from "../preview";
import { recallOf } from "../recall";
import type { RecordedEntry, Recording } from "../recordings";
import { describeRecording, madeAt, recordingFrom } from "../recordings";
import type { EngineSettings } from "../settings";
import { WindowList } from "../window-list";
import { ListBody } from "./list-body";

const St = imports.gi.St;

type MetaWindow = imports.gi.Meta.Window;

/** Where the preview draws: the whole desktop, named so, on more than one
 * monitor, and otherwise the work area given. */
function drawnOver(workArea: Rectangle): { area: Rectangle; place: string } {
    return monitorCount() > 1
        ? { area: desktopArea(), place: _("All monitors") }
        : { area: workArea, place: "" };
}

/** The missing entries' frames, outlined over the preview's slots. */
function outlineMissing(
    canvas: imports.gi.Clutter.Actor,
    view: PreviewView,
    missing: RecordedEntry[],
): void {
    for (const entry of missing) {
        const frame = trimmed(view.workArea, entry.frame);
        const outline = new St.Bin({ style_class: "cplace-preview-missing" });
        outline.set_position(view.toX(frame.x), view.toY(frame.y));
        outline.set_size(
            Math.max(2, view.toX(frame.x + frame.width) - view.toX(frame.x)),
            Math.max(2, view.toY(frame.y + frame.height) - view.toY(frame.y)),
        );
        canvas.add_child(outline);
    }
}

class RecordedPage implements ArrangementPage {
    readonly key = "recorded";
    readonly letter = "r";
    readonly name = _("Recorded");

    private body: ListBody | null = null;
    /** The recording a digit restored, for the apply that follows it. */
    private restored: Recording | null = null;
    /** The recording whose row is pointed at or focused. */
    private pointed: Recording | null = null;

    constructor(private readonly store: EngineSettings) {}

    build(host: PageHost): imports.gi.Clutter.Actor {
        this.restored = null;
        this.pointed = null;
        const list = new WindowList(this.store.participantIds(), () => {
            this.refreshPreview();
        });
        this.body = new ListBody(list, host.sizes.preview);
        this.refreshPreview();
        return this.body.actor;
    }

    release(): void {
        this.body = null;
        this.restored = null;
        this.pointed = null;
    }

    /** A dialog standing over the screen takes the difference from the
     * list, which scrolls, and then from the preview. */
    fit(excess: number): void {
        this.body?.fit(excess, () => {
            this.refreshPreview();
        });
    }

    /** Put back the recording a digit restored, or the one pointed at. */
    apply(): { targets: WindowTarget[]; liveWindows: MetaWindow[] } | null {
        const recording = this.restored ?? this.pointed;
        this.restored = null;
        if (recording === null) {
            return null;
        }
        const recall = recallOf(recording);
        return recall.targets.length === 0
            ? null
            : { targets: recall.targets, liveWindows: recall.liveWindows };
    }

    onKey(): boolean {
        return false;
    }

    hint(): string {
        return _(
            "Ctrl+digit records the ticked windows and the digit puts them " +
                "back. Point at a recording to see it; × or Delete removes one.",
        );
    }

    /** A recording of the ticked windows as they stand, bottom to top. */
    snapshot(): PresetVariables {
        const ticked = this.body?.list.ticked("stacking") ?? null;
        const entries: RecordedEntry[] = [];
        for (const window of ticked?.liveWindows ?? []) {
            const app = windowAppId(window);
            if (app !== null) {
                entries.push({
                    app,
                    title: window.get_title(),
                    frame: frameOf(window),
                });
            }
        }
        return { entries, made: madeAt(new Date()) };
    }

    restore(variables: PresetVariables): void {
        this.restored = recordingFrom(variables);
    }

    describe(variables: PresetVariables): string {
        const recording = recordingFrom(variables);
        return recording === null ? "?" : describeRecording(recording);
    }

    previewPreset(variables: PresetVariables | null): void {
        this.pointed = variables === null ? null : recordingFrom(variables);
        this.refreshPreview();
    }

    private refreshPreview(): void {
        const body = this.body;
        if (body === null) {
            return;
        }
        const preview =
            this.pointed === null
                ? this.standingPreview(body)
                : this.recallPreview(this.pointed, body.previewWidth);
        if (preview !== null) {
            body.showPreview(preview);
        }
    }

    /** A recording's found windows at their recorded frames, and its
     * missing entries outlined. */
    private recallPreview(
        recording: Recording,
        width: number,
    ): imports.gi.St.BoxLayout {
        const recall = recallOf(recording);
        const drawn = drawnOver(recall.workArea);
        return buildPreview(
            drawn.area,
            recall.targets,
            {
                beneath: () => undefined,
                above: (canvas, view) => {
                    outlineMissing(canvas, view, recall.missing);
                },
                note: "",
                place: drawn.place,
                windows: fill(
                    ngettext(
                        "{found} of {total} window found",
                        "{found} of {total} windows found",
                        recall.total,
                    ),
                    { found: recall.targets.length, total: recall.total },
                ),
            },
            width,
        );
    }

    /** The ticked windows where they stand, as a recording would keep
     * them. */
    private standingPreview(body: ListBody): imports.gi.St.BoxLayout | null {
        const ticked = body.list.ticked("stacking");
        if (ticked === null) {
            return null;
        }
        const drawn = drawnOver(ticked.workArea);
        return buildPreview(
            drawn.area,
            ticked.windows.map((window) => ({
                id: window.id,
                frame: window.frame,
            })),
            {
                beneath: () => undefined,
                above: () => undefined,
                note: _("as Ctrl+digit records them"),
                place: drawn.place,
            },
            body.previewWidth,
        );
    }
}

export function recordedPage(store: EngineSettings): ArrangementPage {
    return new RecordedPage(store);
}
