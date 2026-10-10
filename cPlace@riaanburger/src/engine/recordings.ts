// Recordings, as plain data: where each ticked window stood when a
// recording was made, and how a recording finds its windows again. A
// recording names its windows by application and title, which the
// arrangement contract keeps out of every arrangement, so the finding is
// the engine's and the arrangement Recorded only ever sees frames. Pure, so
// every rule here is tested without a desktop.
//
// The identity rule: a window first goes to an entry of the same
// application with the same title; then each application's remaining
// entries, in recorded order, take its remaining windows in stacking order;
// an entry left over is left alone, and so is a window left over. A title
// only gives a window its first claim, so a window whose title has changed
// since, a browser showing another tab, still goes back where it was.

import type { Rectangle } from "../arrangement";
import { fill, listed, ngettext } from "../i18n";

/** A window as the identity rule sees it: its application and its title. */
export interface Named {
    app: string;
    title: string;
}

/** One window of a recording, and where it stood. */
export interface RecordedEntry extends Named {
    frame: Rectangle;
}

/** A recording: its windows in stacking order, bottom to top, and when it
 * was made, to the minute, as its row shows it. */
export interface Recording {
    entries: RecordedEntry[];
    made: string;
}

/** For each entry, the index of the window that goes to it, or null when
 * none is left for it. The windows are given in stacking order, bottom to
 * top. */
export function matchRecording(
    entries: Named[],
    windows: Named[],
): (number | null)[] {
    const claimed = new Set<number>();
    const claim = (entry: Named, byTitle: boolean): number | null => {
        const index = windows.findIndex(
            (window, i) =>
                !claimed.has(i) &&
                window.app === entry.app &&
                (!byTitle || window.title === entry.title),
        );
        if (index < 0) {
            return null;
        }
        claimed.add(index);
        return index;
    };
    const byTitle = entries.map((entry) => claim(entry, true));
    return byTitle.map((index, entryIndex) => {
        const entry = entries[entryIndex];
        return index !== null || entry === undefined
            ? index
            : claim(entry, false);
    });
}

/** A stored recording read back; an entry that does not parse is dropped
 * rather than losing the rest, and anything that is not a recording at all
 * reads as null. */
export function recordingFrom(value: unknown): Recording | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const stored = value as Record<string, unknown>;
    const entries = stored["entries"];
    if (!Array.isArray(entries)) {
        return null;
    }
    const made = stored["made"];
    return {
        entries: entries.flatMap((entry) => {
            const parsed = entryFrom(entry);
            return parsed === null ? [] : [parsed];
        }),
        made: typeof made === "string" ? made : "",
    };
}

function entryFrom(value: unknown): RecordedEntry | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const stored = value as Record<string, unknown>;
    const app = stored["app"];
    const title = stored["title"];
    const frame = frameFrom(stored["frame"]);
    if (typeof app !== "string" || app === "" || typeof title !== "string") {
        return null;
    }
    return frame === null ? null : { app, title, frame };
}

function frameFrom(value: unknown): Rectangle | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const stored = value as Record<string, unknown>;
    const [x, y, width, height] = ["x", "y", "width", "height"].map(
        (field) => stored[field],
    );
    const finite = (n: unknown): n is number =>
        typeof n === "number" && Number.isFinite(n);
    if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
        return null;
    }
    return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** A recording's row: how many windows, and when it was made. */
export function describeRecording(recording: Recording): string {
    const count = recording.entries.length;
    return listed(
        fill(ngettext("{count} window", "{count} windows", count), { count }),
        recording.made,
    );
}

/** A moment as a recording's row shows it: the local date and time to the
 * minute, the year first, 2026-09-26 14:05. */
export function madeAt(date: Date): string {
    const two = (n: number): string => String(n).padStart(2, "0");
    return (
        `${date.getFullYear()}-${two(date.getMonth() + 1)}-` +
        `${two(date.getDate())} ${two(date.getHours())}:` +
        two(date.getMinutes())
    );
}
