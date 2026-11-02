// Tests for the grid page's pure half: parsing the layouts setting, moving
// the cursor, snapping a window's frame to the cells it covers, and the
// preset row's wording. No desktop; every expected value was worked out by
// hand first.

import { test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";

import type { Rectangle } from "../src/arrangement";
import { cellSpan, snappedCells, stepped } from "../src/engine/grid-cells";
import { parseLayouts, parseSpans } from "../src/engine/grid-layouts";
import { describeGridPreset, presetSpans } from "../src/engine/grid-presets";
import {
    areaFrom,
    areaValue,
    isWholeArea,
    wholeArea,
    whollyOutside,
} from "../src/engine/areas";

const goldenWorkArea: Rectangle = { x: 0, y: 0, width: 3840, height: 2124 };
const fourByFour = [1, 1, 1, 1];

test("spans parse from numbers between spaces or commas", () => {
    deepEqual(parseSpans("1 2 1"), [1, 2, 1]);
    deepEqual(parseSpans(" 1, 1.5 ,1 "), [1, 1.5, 1]);
});

test("spans that are empty, wordy, zero, negative or past twenty do not parse", () => {
    equal(parseSpans(""), null);
    equal(parseSpans("1 x 2"), null);
    equal(parseSpans("0 1"), null);
    equal(parseSpans("-1 1"), null);
    equal(parseSpans("1e2"), null);
    equal(parseSpans(Array.from({ length: 21 }, () => "1").join(" ")), null);
    equal(parseSpans(3), null);
});

test("layouts keep the rows that parse, named or labelled by their counts", () => {
    deepEqual(
        parseLayouts([
            { name: "", columns: "1 2 1", rows: "1 1" },
            { name: "Halves", columns: "1 1", rows: "1" },
            { name: "Broken", columns: "1 q", rows: "1" },
            "not a row",
        ]),
        [
            { label: "3 × 2", columns: [1, 2, 1], rows: [1, 1] },
            { label: "Halves", columns: [1, 1], rows: [1] },
        ],
    );
});

test("the cursor steps one cell and stops at the edges", () => {
    deepEqual(stepped({ column: 0, row: 0 }, "left", 4, 4), {
        column: 0,
        row: 0,
    });
    deepEqual(stepped({ column: 3, row: 2 }, "right", 4, 4), {
        column: 3,
        row: 2,
    });
    deepEqual(stepped({ column: 1, row: 2 }, "down", 4, 4), {
        column: 1,
        row: 3,
    });
    deepEqual(stepped({ column: 1, row: 2 }, "up", 4, 4), {
        column: 1,
        row: 1,
    });
});

test("the cells between two corners come out in order", () => {
    deepEqual(cellSpan({ column: 3, row: 0 }, { column: 1, row: 2 }), {
        left: 1,
        top: 0,
        right: 3,
        bottom: 2,
    });
});

// On a 4 by 4 over the golden work area the column edges are 0, 960, 1920,
// 2880, 3840 and the row edges 0, 531, 1062, 1593, 2124. A frame from 100
// to 1900 across and 50 to 1050 down snaps its start to 0 and its ends to
// 1920 and 1062: two columns, two rows.
test("a window snaps to the cells whose edges lie nearest its own", () => {
    deepEqual(
        snappedCells(goldenWorkArea, fourByFour, fourByFour, {
            x: 100,
            y: 50,
            width: 1800,
            height: 1000,
        }),
        { left: 0, top: 0, right: 1, bottom: 1 },
    );
});

// A 100-pixel window at 1000, 600 is nearer a single edge than a cell's
// width on both axes, so it takes the cell under its centre, 1050, 650:
// column 1, row 1.
test("a window smaller than a cell takes the cell under its centre", () => {
    deepEqual(
        snappedCells(goldenWorkArea, fourByFour, fourByFour, {
            x: 1000,
            y: 600,
            width: 100,
            height: 100,
        }),
        { left: 1, top: 1, right: 1, bottom: 1 },
    );
});

test("a window filling the work area covers every cell", () => {
    deepEqual(
        snappedCells(goldenWorkArea, fourByFour, fourByFour, goldenWorkArea),
        { left: 0, top: 0, right: 3, bottom: 3 },
    );
});

test("a grid preset's row names the layout, then the cells one-based", () => {
    equal(
        describeGridPreset({
            layout: "3 × 2",
            columns: [1, 2, 1],
            rows: [1, 1],
            left: 0,
            top: 0,
            right: 1,
            bottom: 0,
        }),
        "3 × 2, cells 1–2 across, 1 down",
    );
    equal(
        describeGridPreset({
            columns: [1, 1, 1, 1],
            rows: [1, 1, 1, 1],
            left: 2,
            top: 3,
            right: 2,
            bottom: 3,
        }),
        "4 × 4, cell 3 across, 4 down",
    );
    equal(describeGridPreset({ layout: "Halves" }), "Halves");
});

test("a preset's spans past twenty do not read, as a layout's do not", () => {
    equal(presetSpans(Array.from({ length: 21 }, () => 1)), null);
    deepEqual(presetSpans([1, 2, 1]), [1, 2, 1]);
    equal(presetSpans([1, 0]), null);
});

const layouts = [
    { label: "5 × 5", columns: [1, 1, 1, 1, 1], rows: [1, 1, 1.5, 1, 1] },
    { label: "3 × 2", columns: [1, 2, 1], rows: [1, 1] },
];

test("an area stored as a grid preset reads back matched to its layout", () => {
    const stored = areaValue({
        layout: { label: "old name", columns: [1, 2, 1], rows: [1, 1] },
        cells: { left: 1, top: 0, right: 2, bottom: 1 },
    });
    deepEqual(areaFrom(stored, layouts), {
        layout: layouts[1],
        cells: { left: 1, top: 0, right: 2, bottom: 1 },
    });
});

test("an area's cells come back in order and inside its layout", () => {
    deepEqual(
        areaFrom(
            {
                columns: [1, 1],
                rows: [1, 1],
                left: 5,
                top: 1,
                right: 0,
                bottom: -2,
            },
            layouts,
        ),
        {
            layout: { label: "2 × 2", columns: [1, 1], rows: [1, 1] },
            cells: { left: 0, top: 0, right: 1, bottom: 1 },
        },
    );
});

test("nothing stored, or junk, reads as no area", () => {
    equal(areaFrom(null, layouts), null);
    equal(areaFrom({ columns: "1 1", rows: [1], left: 0 }, layouts), null);
});

test("every cell of a layout is the whole work area, and fewer are not", () => {
    const first = layouts[0];
    if (first === undefined) {
        throw new Error("fixture");
    }
    equal(isWholeArea(wholeArea(first)), true);
    equal(
        isWholeArea({
            layout: first,
            cells: { left: 0, top: 0, right: 4, bottom: 3 },
        }),
        false,
    );
});

// On the golden work area a 5 by 5 cuts at 768, 1536, 2304 and 3072 across.
// The grid puts the main window in the first two columns, 0 to 1536, and
// Columns fills the other three, 1536 to 3840: the two share an edge and no
// pixel, so the main window lies wholly outside the area.
test("the main window beside a columns area lies wholly outside it", () => {
    const area = { x: 1536, y: 0, width: 2304, height: 2124 };
    equal(whollyOutside({ x: 0, y: 0, width: 1536, height: 2124 }, area), true);
    // A window on a monitor to the right starts where the area ends.
    equal(
        whollyOutside({ x: 3840, y: 0, width: 1920, height: 1080 }, area),
        true,
    );
});

test("a window reaching into a columns area by a pixel is not outside it", () => {
    const area = { x: 1536, y: 0, width: 2304, height: 2124 };
    equal(
        whollyOutside({ x: 0, y: 0, width: 1537, height: 2124 }, area),
        false,
    );
    equal(
        whollyOutside({ x: 1000, y: 200, width: 1200, height: 800 }, area),
        false,
    );
    equal(
        whollyOutside({ x: 2000, y: 100, width: 800, height: 600 }, area),
        false,
    );
});
