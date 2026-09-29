// Trimming a frame to the work area: every side that would cross an edge is
// cut back to it, and nothing is left thinner than a pixel. The cascade
// trims what a negative margin or an outsized window would push off the
// screen, and Recorded trims a recording made before the work area changed,
// so neither ever places a window outside the work area, which the
// contract counts a bug. On a desktop of more than one monitor, Recorded
// trims each frame to the work area it mostly stands in, which is its own
// monitor's, and moves one that stands in none, whose monitor has gone,
// into the work area arranged in at its own size.

import type { Rectangle } from "../arrangement";

/** The frame cut to the work area on every side it would cross. */
export function trimmed(workArea: Rectangle, frame: Rectangle): Rectangle {
    const right = workArea.x + workArea.width;
    const bottom = workArea.y + workArea.height;
    const left = Math.min(Math.max(workArea.x, frame.x), right - 1);
    const top = Math.min(Math.max(workArea.y, frame.y), bottom - 1);
    return {
        x: left,
        y: top,
        width: Math.max(1, Math.min(frame.x + frame.width, right) - left),
        height: Math.max(1, Math.min(frame.y + frame.height, bottom) - top),
    };
}

/** The pixels two rectangles share. */
function overlap(left: Rectangle, right: Rectangle): number {
    const across =
        Math.min(left.x + left.width, right.x + right.width) -
        Math.max(left.x, right.x);
    const down =
        Math.min(left.y + left.height, right.y + right.height) -
        Math.max(left.y, right.y);
    return Math.max(0, across) * Math.max(0, down);
}

/** The work area holding most of the frame, the first of them on a tie,
 * or null when none holds any of it, as when the monitor it was on has
 * gone. */
export function homeArea(
    areas: readonly Rectangle[],
    frame: Rectangle,
): Rectangle | null {
    let best: Rectangle | null = null;
    let most = 0;
    for (const area of areas) {
        const shared = overlap(area, frame);
        if (shared > most) {
            best = area;
            most = shared;
        }
    }
    return best;
}

/** The frame moved, at its own size, the least way that puts it inside the
 * work area, and trimmed where it is larger. */
export function movedInto(workArea: Rectangle, frame: Rectangle): Rectangle {
    const along = (start: number, size: number, from: number, room: number) =>
        Math.max(from, Math.min(start, from + room - size));
    return trimmed(workArea, {
        x: along(frame.x, frame.width, workArea.x, workArea.width),
        y: along(frame.y, frame.height, workArea.y, workArea.height),
        width: frame.width,
        height: frame.height,
    });
}
