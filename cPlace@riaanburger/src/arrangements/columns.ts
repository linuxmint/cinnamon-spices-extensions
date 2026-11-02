// Columns: the work area cut into equal columns, the windows dealt across
// them in list order and down as many rows as it takes, every cell the
// same size. gTile's "two lists", with the count made a variable. Five
// windows in two columns make three rows, the last holding one window on
// the left with the right cell empty.

import type { ArrangementInput, WindowTarget } from "../arrangement";
import { equalSpans, piece, spanEdges } from "./spans";

/** Columns' one knob; the engine owns storage and defaults. */
export interface ColumnsSettings {
    /** The number of columns, at least one; one column is a plain stack. */
    count: number;
}

/** Window `i` takes column `i mod count` in row `floor(i / count)`. The
 * output is the input order unchanged, one target per window. */
export function columns(
    input: ArrangementInput<ColumnsSettings>,
): WindowTarget[] {
    const { workArea, windows, settings } = input;
    const count = Number.isFinite(settings.count)
        ? Math.max(1, Math.floor(settings.count))
        : 1;
    const rowCount = Math.ceil(windows.length / count);
    const across = spanEdges(workArea.x, workArea.width, equalSpans(count));
    const down = spanEdges(workArea.y, workArea.height, equalSpans(rowCount));
    return windows.map((window, index) => {
        const column = piece(across, index % count);
        const row = piece(down, Math.floor(index / count));
        return {
            id: window.id,
            frame: {
                x: column.start,
                y: row.start,
                width: column.size,
                height: row.size,
            },
        };
    });
}
