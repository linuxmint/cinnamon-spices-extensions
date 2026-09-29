// A recording found again among the live windows: the engine's half of
// Recorded, beside the pure matching in recordings.ts and the page that
// draws what it finds. The workspace's windows are gathered, minimised ones
// too, in stacking order, matched to the recording's entries by application
// and title, and handed to the arrangement Recorded with their recorded
// frames, which it puts each found window back at.

import type {
    ArrangementWindow,
    Rectangle,
    WindowTarget,
} from "../arrangement";
import { recorded } from "../arrangements/recorded";
import { frameOf, gather, windowAppId } from "./gather";
import type { RecordedEntry, Recording } from "./recordings";
import { matchRecording } from "./recordings";

type MetaWindow = imports.gi.Meta.Window;

/** A recording found among the showing windows: what putting it back
 * would apply, and the entries with no window to go to. */
export interface Recall {
    workArea: Rectangle;
    targets: WindowTarget[];
    liveWindows: MetaWindow[];
    missing: RecordedEntry[];
    total: number;
}

/** Find a recording's windows among the workspace's, minimised ones too,
 * in stacking order, and put each found one at its recorded frame. A
 * window the tracker cannot name belongs to no application, so no entry
 * finds it. */
export function recallOf(recording: Recording): Recall {
    const gathered = gather({ includeMinimised: true });
    const found = matchRecording(
        recording.entries,
        gathered.liveWindows.map((window) => ({
            app: windowAppId(window) ?? "",
            title: window.get_title(),
        })),
    );
    const windows: ArrangementWindow[] = [];
    const frames: Rectangle[] = [];
    const liveWindows: MetaWindow[] = [];
    const missing: RecordedEntry[] = [];
    recording.entries.forEach((entry, entryIndex) => {
        const index = found[entryIndex] ?? null;
        const live = index === null ? undefined : gathered.liveWindows[index];
        if (live === undefined) {
            missing.push(entry);
            return;
        }
        windows.push({ id: liveWindows.length, frame: frameOf(live) });
        liveWindows.push(live);
        frames.push(entry.frame);
    });
    return {
        workArea: gathered.workArea,
        targets: recorded({
            workArea: gathered.workArea,
            workAreas: gathered.workAreas,
            windows,
            settings: { frames },
        }),
        liveWindows,
        missing,
        total: recording.entries.length,
    };
}
