// Contract tests for the grid: input in, expected targets out, no desktop.
// Every expected number was worked out by hand from the rule before the
// function first ran: each edge at the nearest whole pixel to its span's
// share, the frame from the first chosen cell's start to the last one's
// end. The layouts are ones a gTile user keeps, uneven spans included: a
// wide middle column, and a tall middle row. The rule is set out beside the
// function, in src/arrangements/grid.ts.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import type { ArrangementWindow, Rectangle } from "../src/arrangement";
import { grid } from "../src/arrangements/grid";

function windowsWithIds(ids: number[]): ArrangementWindow[] {
    return ids.map((id) => ({
        id,
        frame: { x: 0, y: 0, width: 1, height: 1 },
    }));
}

const goldenWorkArea: Rectangle = { x: 0, y: 0, width: 3840, height: 2124 };
const fourByFour = [1, 1, 1, 1];

// Spans 1, 2, 1 share 3840 in quarters, so the columns cut at 960 and 2880
// and the wide middle column runs 1920; two rows halve 2124 at 1062.
test("the wide middle column of a 3 by 2 takes twice its neighbours' width", () => {
    const targets = grid({
        workArea: goldenWorkArea,
        windows: windowsWithIds([5]),
        settings: {
            columns: [1, 2, 1],
            rows: [1, 1],
            cells: { left: 1, top: 0, right: 1, bottom: 0 },
        },
    });
    deepEqual(targets, [
        { id: 5, frame: { x: 960, y: 0, width: 1920, height: 1062 } },
    ]);
});

// Rows 1, 1, 1.5, 1, 1 share 2124 in 5.5 parts: the exact cuts at 386.18,
// 772.36, 1351.64 and 1737.82 round to 386, 772, 1352 and 1738, so the
// tall middle row runs 580. Five equal columns cut at 768, 1536, 2304 and
// 3072, so columns two to four run from 768 to 3072.
test("the tall middle row of a 5 by 5 cuts at whole pixels", () => {
    const targets = grid({
        workArea: goldenWorkArea,
        windows: windowsWithIds([1]),
        settings: {
            columns: [1, 1, 1, 1, 1],
            rows: [1, 1, 1.5, 1, 1],
            cells: { left: 1, top: 2, right: 3, bottom: 2 },
        },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 768, y: 772, width: 2304, height: 580 } },
    ]);
});

test("every cell chosen is exactly the work area, whatever its origin", () => {
    const targets = grid({
        workArea: { x: 20, y: 40, width: 1000, height: 800 },
        windows: windowsWithIds([1]),
        settings: {
            columns: fourByFour,
            rows: fourByFour,
            cells: { left: 0, top: 0, right: 3, bottom: 3 },
        },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 20, y: 40, width: 1000, height: 800 } },
    ]);
});

// The corners come in reversed and past the edge: columns 3 back to 1 are
// 960 to 3840, and rows 1 to 9 are held to rows 1 to 3, 531 to 2124. Both
// windows land in the one frame.
test("the cells are put in order and held inside the layout, one frame for every window", () => {
    const targets = grid({
        workArea: goldenWorkArea,
        windows: windowsWithIds([4, 9]),
        settings: {
            columns: fourByFour,
            rows: fourByFour,
            cells: { left: 3, top: 1, right: 1, bottom: 9 },
        },
    });
    deepEqual(targets, [
        { id: 4, frame: { x: 960, y: 531, width: 2880, height: 1593 } },
        { id: 9, frame: { x: 960, y: 531, width: 2880, height: 1593 } },
    ]);
});

test("an empty window list produces an empty target list", () => {
    const targets = grid({
        workArea: goldenWorkArea,
        windows: [],
        settings: {
            columns: fourByFour,
            rows: fourByFour,
            cells: { left: 0, top: 0, right: 0, bottom: 0 },
        },
    });
    deepEqual(targets, []);
});
