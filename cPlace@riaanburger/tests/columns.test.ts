// Contract tests for columns: input in, expected targets out, no desktop.
// Every expected number was worked out by hand from the rule before the
// function first ran: window i in column i mod count and row
// floor(i / count), each edge at the nearest whole pixel to its equal
// share. The rule is set out beside the function, in
// src/arrangements/columns.ts.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import type { ArrangementWindow, Rectangle } from "../src/arrangement";
import { columns } from "../src/arrangements/columns";
import { cellArea } from "../src/arrangements/grid";

function windowsWithIds(ids: number[]): ArrangementWindow[] {
    return ids.map((id) => ({
        id,
        frame: { x: 0, y: 0, width: 1, height: 1 },
    }));
}

const goldenWorkArea: Rectangle = { x: 0, y: 0, width: 3840, height: 2124 };

// Five windows in two columns make three rows of 708, dealt across then
// down, the last row holding one window on the left.
test("five windows in two columns deal across and down into three rows", () => {
    const targets = columns({
        workArea: goldenWorkArea,
        windows: windowsWithIds([1, 2, 3, 4, 5]),
        settings: { count: 2 },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 0, y: 0, width: 1920, height: 708 } },
        { id: 2, frame: { x: 1920, y: 0, width: 1920, height: 708 } },
        { id: 3, frame: { x: 0, y: 708, width: 1920, height: 708 } },
        { id: 4, frame: { x: 1920, y: 708, width: 1920, height: 708 } },
        { id: 5, frame: { x: 0, y: 1416, width: 1920, height: 708 } },
    ]);
});

// Thirds of 1000 fall at 333.3 and 666.7, which round to 333 and 667, so
// from an origin of 20 the columns start at 20, 353 and 687 and run 333,
// 334 and 333 wide; four windows take two rows of 400.
test("three columns cut at whole pixels from a non-zero origin", () => {
    const targets = columns({
        workArea: { x: 20, y: 40, width: 1000, height: 800 },
        windows: windowsWithIds([1, 2, 3, 4]),
        settings: { count: 3 },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 20, y: 40, width: 333, height: 400 } },
        { id: 2, frame: { x: 353, y: 40, width: 334, height: 400 } },
        { id: 3, frame: { x: 687, y: 40, width: 333, height: 400 } },
        { id: 4, frame: { x: 20, y: 440, width: 333, height: 400 } },
    ]);
});

test("one column is a plain stack across the whole width", () => {
    const targets = columns({
        workArea: goldenWorkArea,
        windows: windowsWithIds([1, 2, 3]),
        settings: { count: 1 },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 0, y: 0, width: 3840, height: 708 } },
        { id: 2, frame: { x: 0, y: 708, width: 3840, height: 708 } },
        { id: 3, frame: { x: 0, y: 1416, width: 3840, height: 708 } },
    ]);
});

// One window in two columns keeps its column's width at full height, the
// other column empty, as gTile's two lists do.
test("fewer windows than columns leave the columns their width", () => {
    const targets = columns({
        workArea: goldenWorkArea,
        windows: windowsWithIds([9]),
        settings: { count: 2 },
    });
    deepEqual(targets, [
        { id: 9, frame: { x: 0, y: 0, width: 1920, height: 2124 } },
    ]);
});

test("an empty window list produces an empty target list", () => {
    const targets = columns({
        workArea: goldenWorkArea,
        windows: [],
        settings: { count: 2 },
    });
    deepEqual(targets, []);
});

test("a count below one counts as one", () => {
    const targets = columns({
        workArea: goldenWorkArea,
        windows: windowsWithIds([1, 2]),
        settings: { count: 0 },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 0, y: 0, width: 3840, height: 1062 } },
        { id: 2, frame: { x: 0, y: 1062, width: 3840, height: 1062 } },
    ]);
});

// On the 5 by 5 with the tall middle row, columns 2 to 5 and rows 3 to 5
// run from 768 to 3840 across and 772 to 2124 down; two columns halve 3072
// at 1536, and four windows make two rows of 676.
test("two columns fill an area of uneven cells", () => {
    const area = cellArea(goldenWorkArea, {
        columns: [1, 1, 1, 1, 1],
        rows: [1, 1, 1.5, 1, 1],
        cells: { left: 1, top: 2, right: 4, bottom: 4 },
    });
    deepEqual(area, { x: 768, y: 772, width: 3072, height: 1352 });
    const targets = columns({
        workArea: area,
        windows: windowsWithIds([1, 2, 3, 4]),
        settings: { count: 2 },
    });
    deepEqual(targets, [
        { id: 1, frame: { x: 768, y: 772, width: 1536, height: 676 } },
        { id: 2, frame: { x: 2304, y: 772, width: 1536, height: 676 } },
        { id: 3, frame: { x: 768, y: 1448, width: 1536, height: 676 } },
        { id: 4, frame: { x: 2304, y: 1448, width: 1536, height: 676 } },
    ]);
});
