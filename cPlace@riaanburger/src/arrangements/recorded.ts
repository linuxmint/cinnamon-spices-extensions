// Recorded: every window at its own recorded frame. The engine finds the
// windows a recording names, by application and title, and hands them over
// in recorded order with the recorded frames as the settings, so this
// arrangement never sees a title: window i goes to frame i. Each frame is
// trimmed to the work area it mostly stands in, its own monitor's, so a
// recording made before a panel moved still lands on the screen, and a
// frame whose monitor has gone moves, at its own size, into the work area
// arranged in. The output keeps the input order, which is the
// recorded stacking, so a recall puts back the stacking with the frames.

import type { ArrangementInput, Rectangle, WindowTarget } from "../arrangement";
import { homeArea, movedInto, trimmed } from "./trim";

/** Recorded's one knob: a frame for each window given, in the same order. */
export interface RecordedSettings {
    frames: Rectangle[];
}

/** A recorded frame trimmed to the work area it stands in, or moved into
 * the one arranged in when it stands in none. */
function placed(
    areas: readonly Rectangle[],
    workArea: Rectangle,
    frame: Rectangle,
): Rectangle {
    const home = homeArea(areas, frame);
    return home === null ? movedInto(workArea, frame) : trimmed(home, frame);
}

/** Window i at frame i. A window with no frame of its own gets no target,
 * which leaves it where it stands. */
export function recorded(
    input: ArrangementInput<RecordedSettings>,
): WindowTarget[] {
    const { workArea, windows, settings } = input;
    const areas = input.workAreas ?? [workArea];
    return windows.flatMap((window, index) => {
        const frame = settings.frames[index];
        return frame === undefined
            ? []
            : [{ id: window.id, frame: placed(areas, workArea, frame) }];
    });
}
