import test from "node:test";
import assert from "node:assert/strict";

import { assignCells, autotileRects, refusesCell } from "../src/autotile.ts";
import type { Gaps, Rect, Size } from "../src/geometry.ts";

/** Numbers chosen so halves, quarters and eighths all come out whole. */
const AREA: Rect = { x: 0, y: 0, width: 1200, height: 900 };
const NONE: Gaps = { window: 0, edge: 0 };

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

test("no windows means no rectangles", () => {
  assert.deepEqual(autotileRects("main-left", 0, AREA, NONE), []);
  assert.deepEqual(autotileRects("equal-left", -3, AREA, NONE), []);
  assert.deepEqual(autotileRects("main-right", NaN, AREA, NONE), []);
  assert.equal(
    autotileRects("main-left", 2.9, AREA, NONE).length,
    2,
    "a count is whole windows",
  );
});

test("one window is given the whole area, whatever the arrangement", () => {
  for (const mode of [
    "main-left",
    "main-right",
    "equal-left",
    "equal-right",
  ] as const) {
    assert.deepEqual(autotileRects(mode, 1, AREA, NONE), [AREA]);
  }
});

test("tile left puts the leader on the left at full height", () => {
  const [main, top, bottom] = autotileRects("main-left", 3, AREA, NONE);

  assert.deepEqual(main, rect(0, 0, 600, 900));
  assert.deepEqual(top, rect(600, 0, 600, 450));
  assert.deepEqual(bottom, rect(600, 450, 600, 450));
});

test("the fourth window cuts a cell instead of adding a row", () => {
  const rects = autotileRects("main-left", 4, AREA, NONE);

  assert.deepEqual(
    rects[1],
    rect(600, 0, 600, 450),
    "the top cell is untouched",
  );
  assert.deepEqual(
    rects[2],
    rect(600, 450, 300, 450),
    "the bottom cell is cut",
  );
  assert.deepEqual(
    rects[3],
    rect(900, 450, 300, 450),
    "and the newcomer takes half",
  );
});

test("cuts fall on the largest cell", () => {
  // With four windows the top cell is the largest one left, so the fifth
  // window cuts that rather than any of the quarters.
  const rects = autotileRects("main-left", 5, AREA, NONE);

  assert.deepEqual(rects[1], rect(600, 0, 300, 450));
  assert.deepEqual(rects[4], rect(900, 0, 300, 450));
  assert.deepEqual(rects[2], rect(600, 450, 300, 450), "quarters untouched");
  assert.deepEqual(rects[3], rect(900, 450, 300, 450));
});

test("among equal cells the most recent one is cut", () => {
  // Four equal cells beside the leader; the newest of them, taller than it
  // is wide, is cut into two rows.
  const rects = autotileRects("main-left", 6, AREA, NONE);

  assert.deepEqual(rects[4], rect(900, 0, 300, 225));
  assert.deepEqual(rects[5], rect(900, 225, 300, 225));
  assert.deepEqual(rects[1], rect(600, 0, 300, 450), "the older cells stand");
});

test("in main the anchor is never cut, however many windows", () => {
  for (let count = 2; count <= 13; count++) {
    assert.deepEqual(
      autotileRects("main-left", count, AREA, NONE)[0],
      rect(0, 0, 600, 900),
      `${count} windows`,
    );
  }
});

test("main takes a whole side even on a tall screen", () => {
  const tall: Rect = { x: 0, y: 0, width: 500, height: 2000 };
  const [main, other] = autotileRects("main-left", 2, tall, NONE);

  assert.deepEqual(main, rect(0, 0, 250, 2000));
  assert.deepEqual(other, rect(250, 0, 250, 2000));
});

test("cuts follow the longer side of the cell", () => {
  // Beside the leader on a wide screen the room is wider than it is tall,
  // so the first cut makes columns rather than rows.
  const wide: Rect = { x: 0, y: 0, width: 2000, height: 500 };
  const [, second, third] = autotileRects("main-left", 3, wide, NONE);

  assert.deepEqual(second, rect(1000, 0, 500, 500));
  assert.deepEqual(third, rect(1500, 0, 500, 500));

  // Equal on a tall screen cuts the whole thing into rows.
  const tall: Rect = { x: 0, y: 0, width: 500, height: 2000 };
  const [top, bottom] = autotileRects("equal-left", 2, tall, NONE);

  assert.deepEqual(top, rect(0, 0, 500, 1000));
  assert.deepEqual(bottom, rect(0, 1000, 500, 1000));
});

test("an even count shares out as a full lattice", () => {
  const rects = autotileRects("equal-left", 4, AREA, NONE);

  assert.deepEqual(rects[0], rect(0, 0, 600, 450), "leader");
  assert.deepEqual(rects[1], rect(600, 0, 600, 450));
  assert.deepEqual(rects[2], rect(600, 450, 600, 450));
  assert.deepEqual(rects[3], rect(0, 450, 600, 450));
});

test("in equal the anchor is cut last among equals, but does take its turn", () => {
  // Three windows: the two halves tie, and the other one is cut.
  assert.deepEqual(
    autotileRects("equal-left", 3, AREA, NONE)[0],
    rect(0, 0, 600, 900),
  );
  // Four windows: the anchor is now the largest cell, and its turn comes.
  assert.deepEqual(
    autotileRects("equal-left", 4, AREA, NONE)[0],
    rect(0, 0, 600, 450),
  );
});

test("equal keeps cutting the largest cell past a lattice", () => {
  const five = autotileRects("equal-left", 5, AREA, NONE);
  assert.deepEqual(
    five[3],
    rect(0, 450, 300, 450),
    "the newest quarter is cut",
  );
  assert.deepEqual(five[4], rect(300, 450, 300, 450));

  const six = autotileRects("equal-left", 6, AREA, NONE);
  assert.deepEqual(
    six[2],
    rect(600, 450, 300, 450),
    "then the newest of the rest",
  );
  assert.deepEqual(six[5], rect(900, 450, 300, 450));
  assert.deepEqual(six[0], rect(0, 0, 600, 450), "the anchor is left alone");
});

test("three windows in equal agree with tile left", () => {
  assert.deepEqual(
    autotileRects("equal-left", 3, AREA, NONE),
    autotileRects("main-left", 3, AREA, NONE),
  );
});

test("tile right is the mirror of tile left", () => {
  for (const count of [2, 3, 4, 5, 6, 9]) {
    const left = autotileRects("main-left", count, AREA, NONE);
    const right = autotileRects("main-right", count, AREA, NONE);

    left.forEach((rect_, index) => {
      const mirrored = right[index];

      assert.equal(mirrored.width, rect_.width);
      assert.equal(mirrored.y, rect_.y);
      assert.equal(mirrored.height, rect_.height);
      assert.equal(
        mirrored.x,
        AREA.x + AREA.width - rect_.width - (rect_.x - AREA.x),
        `window ${index} of ${count} sits mirrored`,
      );
    });
  }
});

test("equal right is the mirror of equal left", () => {
  for (const count of [2, 3, 5, 7, 8]) {
    const led = autotileRects("equal-left", count, AREA, NONE);
    const mirrored = autotileRects("equal-right", count, AREA, NONE);

    led.forEach((rect_, index) => {
      const twin = mirrored[index];

      assert.equal(twin.width, rect_.width);
      assert.equal(twin.y, rect_.y);
      assert.equal(twin.height, rect_.height);
      assert.equal(
        twin.x,
        AREA.x + AREA.width - rect_.width - (rect_.x - AREA.x),
        `window ${index} of ${count} sits mirrored`,
      );
    });
  }
});

test("three windows in equal right agree with main right", () => {
  assert.deepEqual(
    autotileRects("equal-right", 3, AREA, NONE),
    autotileRects("main-right", 3, AREA, NONE),
  );
});

test("gaps apply to a sweep the way they apply to the grid", () => {
  const gaps: Gaps = { window: 10, edge: 20 };
  const [main, top, bottom] = autotileRects("main-left", 3, AREA, gaps);

  assert.equal(main.x, 20, "edge gap on the left");
  assert.equal(top.x - (main.x + main.width), 10, "gap between the columns");
  assert.equal(bottom.y - (top.y + top.height), 10, "gap inside the cut");
  assert.equal(AREA.width - (top.x + top.width), 20, "edge gap on the right");
});

test("a cut leaves the gap between its halves and takes nothing else", () => {
  // The quarters made by the fourth window sit the window gap apart, and
  // still end exactly where the cell they were cut from ended.
  const gaps: Gaps = { window: 10, edge: 20 };
  const rects = autotileRects("main-left", 4, AREA, gaps);
  const [, top, left, right] = rects;

  assert.equal(right.x - (left.x + left.width), 10, "gap between the halves");
  assert.equal(left.x, top.x, "the cut keeps the cell's left edge");
  assert.equal(right.x + right.width, top.x + top.width, "and its right edge");
});

/** The cells of a four-window main arrangement: anchor, a half, two quarters. */
const CELLS: Rect[] = [
  { x: 0, y: 0, width: 600, height: 900 },
  { x: 600, y: 0, width: 600, height: 450 },
  { x: 600, y: 450, width: 300, height: 450 },
  { x: 900, y: 450, width: 300, height: 450 },
];

const needing = (...entries: Array<[number, Size]>): Array<Size | null> => {
  const needs: Array<Size | null> = CELLS.map(() => null);
  for (const [index, need] of entries) {
    needs[index] = need;
  }
  return needs;
};

test("windows keep the cell of their turn while nothing is known", () => {
  assert.deepEqual(assignCells(CELLS, needing()), {
    cell: [0, 1, 2, 3],
    left: [],
  });
});

test("a window that fits its cell keeps it", () => {
  const plan = assignCells(CELLS, needing([2, { width: 200, height: 200 }]));

  assert.deepEqual(plan.cell, [0, 1, 2, 3]);
});

test("a window that will not fit takes the biggest cell that holds it", () => {
  const plan = assignCells(CELLS, needing([3, { width: 500, height: 400 }]));

  assert.equal(plan.cell[3], 1, "the half is the only cell that holds it");
  assert.equal(plan.cell[1], 3, "the window that had the half takes the quarter");
  assert.deepEqual(plan.left, []);
});

test("the biggest fitting cell is chosen, not the first", () => {
  const cells: Rect[] = [
    { x: 0, y: 0, width: 600, height: 900 },
    { x: 600, y: 0, width: 600, height: 450 },
    { x: 600, y: 450, width: 400, height: 450 },
    { x: 1000, y: 450, width: 200, height: 450 },
  ];
  const needs: Array<Size | null> = [null, null, null, { width: 300, height: 300 }];
  const plan = assignCells(cells, needs);

  assert.equal(plan.cell[3], 1, "both the half and the wide quarter fit; the half wins");
  assert.equal(plan.cell[1], 3);
});

test("the largest need is served first", () => {
  // Both need the half; only one can have it, and the smaller need loses.
  const plan = assignCells(
    CELLS,
    needing([2, { width: 400, height: 400 }], [3, { width: 400, height: 300 }]),
  );

  assert.equal(plan.cell[2], 1);
  assert.deepEqual(plan.left, [3]);
  assert.equal(plan.cell[3], -1);
});

test("the largest need has first pick, whoever held the room before", () => {
  // Window 1 sits in the half and fits it; window 3 needs the half more.
  // The half goes to window 3, and window 1, which fits nothing smaller, is
  // the one left out.
  const plan = assignCells(
    CELLS,
    needing([1, { width: 400, height: 400 }], [3, { width: 500, height: 420 }]),
  );

  assert.equal(plan.cell[3], 1, "the larger need takes the half");
  assert.deepEqual(plan.left, [1]);
  assert.equal(plan.cell[2], 2, "the unknown window keeps its own cell");
});

test("a need that outgrows its quarter takes the half, and smaller needs move down", () => {
  // Window 1 sits in the half needing little; window 3 needs more than its
  // quarter. The half goes to the larger need, window 1 takes the biggest
  // quarter that holds it, and the unknown window takes what is left.
  const plan = assignCells(
    CELLS,
    needing([1, { width: 100, height: 100 }], [3, { width: 310, height: 100 }]),
  );

  assert.deepEqual(plan.cell, [0, 2, 3, 1]);
  assert.deepEqual(plan.left, [], "everyone fits");
});

test("the anchor keeps its cell whatever it needs", () => {
  const plan = assignCells(CELLS, needing([0, { width: 5000, height: 5000 }]));

  assert.deepEqual(plan.cell, [0, 1, 2, 3]);
  assert.deepEqual(plan.left, [], "and is never left out");
});

test("a need that fits nowhere is left out and the rest stand", () => {
  const plan = assignCells(CELLS, needing([2, { width: 5000, height: 5000 }]));

  assert.deepEqual(plan.left, [2]);
  assert.deepEqual(plan.cell, [0, 1, -1, 3]);
});

test("a window refuses a cell by overhanging it at all", () => {
  const cell: Rect = { x: 0, y: 0, width: 300, height: 450 };

  assert.equal(refusesCell({ ...cell }, cell), false, "an exact fit");
  assert.equal(refusesCell({ ...cell, width: 296 }, cell), false, "snapped smaller");
  assert.equal(refusesCell({ ...cell, width: 301 }, cell), true, "one pixel wider");
  assert.equal(refusesCell({ ...cell, height: 451 }, cell), true, "one pixel taller");
});

test("two windows still get their gap", () => {
  const gaps: Gaps = { window: 10, edge: 20 };

  for (const mode of ["main-left", "equal-left"] as const) {
    const [main, other] = autotileRects(mode, 2, AREA, gaps);

    assert.equal(main.x, 20, `${mode}: edge gap on the left`);
    assert.equal(
      other.x - (main.x + main.width),
      10,
      `${mode}: gap between the two windows`,
    );
    assert.equal(
      AREA.width - (other.x + other.width),
      20,
      `${mode}: edge gap on the right`,
    );
  }
});
