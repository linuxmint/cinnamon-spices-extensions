import test from "node:test";
import assert from "node:assert/strict";

import {
  cellAt,
  moveFocus,
  selectionRange,
  trackSizes,
  cellRangeToRect,
  centerOn,
  coversFullGrid,
  normalizeRange,
} from "../src/geometry.ts";
import type {
  CellRange,
  GridSize,
  Rect,
  Selection,
} from "../src/geometry.ts";

/** A 2560x1440 screen with a 40 pixel panel along the bottom. */
const SCREEN: Rect = { x: 0, y: 0, width: 2560, height: 1400 };

const cell = (col: number, row: number): CellRange => ({
  col,
  row,
  colEnd: col,
  rowEnd: row,
});

const span = (
  col: number,
  row: number,
  colEnd: number,
  rowEnd: number,
): CellRange => ({ col, row, colEnd, rowEnd });

const rectOf = (
  area: Rect,
  grid: GridSize,
  range: CellRange,
  windowGap: number,
  edgeGap: number,
): Rect => cellRangeToRect(area, grid, range, { window: windowGap, edge: edgeGap });

test("splits an area into equal cells when there is no spacing", () => {
  const grid = { cols: [1, 1], rows: [1, 1] };

  assert.deepEqual(rectOf(SCREEN, grid, cell(0, 0), 0, 0), {
    x: 0,
    y: 0,
    width: 1280,
    height: 700,
  });
  assert.deepEqual(rectOf(SCREEN, grid, cell(1, 1), 0, 0), {
    x: 1280,
    y: 700,
    width: 1280,
    height: 700,
  });
});

test("a range covering every cell fills the area exactly", () => {
  const rect = rectOf(SCREEN, { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] }, span(0, 0, 5, 5), 10, 0);

  assert.deepEqual(rect, SCREEN);
});

test("leaves exactly the configured gap between neighbouring windows", () => {
  const grid = { cols: [1, 1], rows: [1, 1] };
  const topLeft = rectOf(SCREEN, grid, cell(0, 0), 10, 20);
  const topRight = rectOf(SCREEN, grid, cell(1, 0), 10, 20);
  const bottomLeft = rectOf(SCREEN, grid, cell(0, 1), 10, 20);

  assert.equal(topRight.x - (topLeft.x + topLeft.width), 10, "between columns");
  assert.equal(bottomLeft.y - (topLeft.y + topLeft.height), 10, "between rows");
  assert.equal(topLeft.width, topRight.width, "columns are the same width");
});

test("leaves exactly the configured gap at the edges of the area", () => {
  const grid = { cols: [1, 1], rows: [1, 1] };
  const topLeft = rectOf(SCREEN, grid, cell(0, 0), 10, 20);
  const bottomRight = rectOf(SCREEN, grid, cell(1, 1), 10, 20);

  assert.equal(topLeft.x - SCREEN.x, 20, "left");
  assert.equal(topLeft.y - SCREEN.y, 20, "top");
  assert.equal(
    SCREEN.x + SCREEN.width - (bottomRight.x + bottomRight.width),
    20,
    "right",
  );
  assert.equal(
    SCREEN.y + SCREEN.height - (bottomRight.y + bottomRight.height),
    20,
    "bottom",
  );
});

test("keeps gaps a user could plausibly want", () => {
  // Spacing is only reduced when it cannot fit, so ordinary setups are left
  // alone. A gap that survives is visible as the space between two cells.
  const cases: Array<{ area: Rect; grid: GridSize; gap: number }> = [
    { area: SCREEN, grid: { cols: [1, 1], rows: [1, 1] }, gap: 10 },
    { area: SCREEN, grid: { cols: [1, 1], rows: [1, 1] }, gap: 20 },
    { area: SCREEN, grid: { cols: [1, 1, 1, 1], rows: [1, 1, 1, 1] }, gap: 10 },
    { area: SCREEN, grid: { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] }, gap: 10 },
    { area: { x: 0, y: 0, width: 1920, height: 1040 }, grid: { cols: [1, 1, 1, 1], rows: [1, 1, 1, 1] }, gap: 20 },
    { area: { x: 0, y: 0, width: 3840, height: 2120 }, grid: { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] }, gap: 30 },
  ];

  for (const { area, grid, gap } of cases) {
    const first = rectOf(area, grid, cell(0, 0), gap, 0);
    const second = rectOf(area, grid, cell(1, 0), gap, 0);
    const applied = second.x - (first.x + first.width);

    assert.equal(applied, gap, `${area.width}x${area.height} ${grid.cols.length}x${grid.rows.length} gap ${gap}`);
  }
});

test("reduces spacing that would leave windows nothing to occupy", () => {
  // A quarter of the run is the most that may go to spacing, so a 100 pixel
  // gap across six columns of a 440 pixel area comes down to 22.
  const area: Rect = { x: 0, y: 0, width: 440, height: 400 };
  const grid = { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] };
  const first = rectOf(area, grid, cell(0, 0), 100, 0);
  const second = rectOf(area, grid, cell(1, 0), 100, 0);

  const applied = second.x - (first.x + first.width);
  assert.ok(applied < 100, "the requested gap does not fit");
  assert.ok(applied > 0, "some spacing survives");
  assert.ok(first.width > applied, "windows are wider than the gaps between them");
});

test("applies the same gap horizontally and vertically", () => {
  // Each axis can afford a different amount, and the tighter one decides, so
  // that spacing looks even rather than stretched.
  const area: Rect = { x: 0, y: 0, width: 440, height: 400 };
  const grid = { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] };
  const first = rectOf(area, grid, cell(0, 0), 100, 0);
  const right = rectOf(area, grid, cell(1, 0), 100, 0);
  const below = rectOf(area, grid, cell(0, 1), 100, 0);

  const horizontal = right.x - (first.x + first.width);
  const vertical = below.y - (first.y + first.height);
  assert.equal(horizontal, vertical);
});

test("every cell stays inside the area it was given", () => {
  const areas: Rect[] = [
    SCREEN,
    { x: 0, y: 0, width: 1366, height: 728 },
    { x: 2560, y: -200, width: 1920, height: 1040 },
    { x: 0, y: 0, width: 440, height: 400 },
    { x: 0, y: 0, width: 251, height: 251 },
  ];
  const grids: GridSize[] = [
    { cols: [1], rows: [1] },
    { cols: [1, 1], rows: [1, 1] },
    { cols: [1, 1, 1], rows: [1, 1] },
    { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] },
  ];

  for (const area of areas) {
    for (const grid of grids) {
      for (const gap of [0, 1, 10, 100]) {
        for (const edge of [0, 1, 10, 100]) {
          for (let col = 0; col < grid.cols.length; col++) {
            for (let row = 0; row < grid.rows.length; row++) {
              const rect = rectOf(area, grid, cell(col, row), gap, edge);
              const where = `${area.width}x${area.height} ${grid.cols.length}x${grid.rows.length} gap ${gap} edge ${edge} cell ${col},${row}`;

              assert.ok(rect.x >= area.x, `${where}: past the left edge`);
              assert.ok(rect.y >= area.y, `${where}: past the top edge`);
              assert.ok(
                rect.x + rect.width <= area.x + area.width,
                `${where}: past the right edge`,
              );
              assert.ok(
                rect.y + rect.height <= area.y + area.height,
                `${where}: past the bottom edge`,
              );
              assert.ok(rect.width >= 1 && rect.height >= 1, `${where}: empty`);
            }
          }
        }
      }
    }
  }
});

test("the last cell finishes exactly on the edge of the area", () => {
  for (const grid of [
    { cols: [1, 1], rows: [1, 1] },
    { cols: [1, 1, 1], rows: [1, 1, 1, 1, 1] },
    { cols: [1, 1, 1, 1, 1, 1], rows: [1, 1, 1, 1, 1, 1] },
  ]) {
    for (const gap of [0, 7, 10, 33]) {
      const last = rectOf(SCREEN, grid, cell(grid.cols.length - 1, grid.rows.length - 1), gap, 0);

      assert.equal(last.x + last.width, SCREEN.x + SCREEN.width);
      assert.equal(last.y + last.height, SCREEN.y + SCREEN.height);
    }
  }
});

test("measures every rectangle in whole pixels", () => {
  const awkward: Array<[Rect, number, number]> = [
    [SCREEN, 10.5, 10.5],
    [{ x: 0.4, y: 0.6, width: 2559.7, height: 1399.3 }, 10, 10],
    [{ x: 0, y: 0, width: 2559.7, height: 1399.3 }, 7.9, 3.2],
  ];

  for (const [area, gap, edge] of awkward) {
    const rect = rectOf(area, { cols: [1, 1, 1], rows: [1, 1, 1] }, cell(1, 1), gap, edge);

    for (const [name, value] of Object.entries(rect)) {
      assert.ok(Number.isInteger(value), `${name} is ${value}`);
    }
  }
});

test("survives settings and areas that make no sense", () => {
  const nonsense = [
    { area: SCREEN, gaps: { window: NaN, edge: 10 } },
    { area: SCREEN, gaps: { window: 10, edge: NaN } },
    { area: SCREEN, gaps: { window: "wide" as unknown as number, edge: 10 } },
    { area: SCREEN, gaps: { window: -50, edge: -50 } },
    { area: SCREEN, gaps: { window: Infinity, edge: 10 } },
    { area: { x: NaN, y: 0, width: 2560, height: 1400 }, gaps: { window: 10, edge: 10 } },
    { area: { x: 0, y: 0, width: NaN, height: 1400 }, gaps: { window: 10, edge: 10 } },
    { area: {} as unknown as Rect, gaps: { window: 10, edge: 10 } },
  ];

  for (const { area, gaps } of nonsense) {
    const rect = cellRangeToRect(area, { cols: [1, 1], rows: [1, 1] }, cell(0, 0), gaps);

    for (const [name, value] of Object.entries(rect)) {
      assert.ok(Number.isFinite(value), `${name} is ${value}`);
    }
  }
});

test("survives a grid that could not be parsed", () => {
  for (const grid of [
    { cols: [], rows: [] },
    { cols: [NaN], rows: [NaN] },
    { cols: [-3], rows: [-3] },
    { cols: [2.7], rows: [1.2] },
  ] as GridSize[]) {
    const rect = rectOf(SCREEN, grid, cell(0, 0), 10, 10);

    for (const [name, value] of Object.entries(rect)) {
      assert.ok(Number.isFinite(value), `${name} is ${value}`);
    }
  }
});

test("reads a range from whichever corner it was started in", () => {
  const grid = { cols: [1, 1], rows: [1, 1] };
  const expected = { col: 0, colEnd: 1, row: 0, rowEnd: 1 };

  assert.deepEqual(normalizeRange(grid, span(0, 0, 1, 1)), expected);
  assert.deepEqual(normalizeRange(grid, span(1, 1, 0, 0)), expected);
  assert.deepEqual(normalizeRange(grid, span(1, 0, 0, 1)), expected);
});

test("holds a range inside its grid", () => {
  const grid = { cols: [1, 1], rows: [1, 1] };

  assert.deepEqual(normalizeRange(grid, span(0, 0, 9, 9)), {
    col: 0,
    colEnd: 1,
    row: 0,
    rowEnd: 1,
  });
  assert.deepEqual(normalizeRange(grid, span(-5, -5, 0, 0)), {
    col: 0,
    colEnd: 0,
    row: 0,
    rowEnd: 0,
  });
  assert.deepEqual(normalizeRange(grid, span(0.7, 0.2, 1.9, 1.4)), {
    col: 0,
    colEnd: 1,
    row: 0,
    rowEnd: 1,
  });
});

test("keeps the good half of a half-broken range", () => {
  const grid = { cols: [1, 1, 1, 1], rows: [1, 1, 1, 1] };
  const range = { col: NaN, row: 0, colEnd: 3, rowEnd: 3 } as CellRange;

  assert.deepEqual(normalizeRange(grid, range), {
    col: 0,
    colEnd: 3,
    row: 0,
    rowEnd: 3,
  });
});

test("recognises a full grid however the range was drawn", () => {
  const grid = { cols: [1, 1], rows: [1, 1] };

  assert.equal(coversFullGrid(grid, span(0, 0, 1, 1)), true);
  assert.equal(coversFullGrid(grid, span(1, 1, 0, 0)), true, "drawn backwards");
  assert.equal(coversFullGrid(grid, span(0, 0, 9, 9)), true, "drawn past the edge");
  assert.equal(coversFullGrid(grid, cell(0, 0)), false, "a single cell");
  assert.equal(coversFullGrid(grid, span(0, 0, 1, 0)), false, "one row of two");
});

test("puts the grid in the middle of what it is given", () => {
  const monitor: Rect = { x: 0, y: 0, width: 2560, height: 1440 };
  const box = centerOn({ width: 340, height: 200 }, monitor, monitor);

  assert.deepEqual(box, { x: 1110, y: 620, width: 340, height: 200 });
});

test("centres the grid over a window when asked to", () => {
  const monitor: Rect = { x: 0, y: 0, width: 2560, height: 1440 };
  const window: Rect = { x: 200, y: 100, width: 800, height: 600 };
  const box = centerOn({ width: 340, height: 200 }, window, monitor);

  assert.deepEqual(box, { x: 430, y: 300, width: 340, height: 200 });
});

test("keeps the grid on screen when the window is at an edge", () => {
  const monitor: Rect = { x: 0, y: 0, width: 2560, height: 1440 };

  const offLeft = centerOn(
    { width: 340, height: 200 },
    { x: -400, y: 0, width: 300, height: 200 },
    monitor,
  );
  assert.equal(offLeft.x, 0, "pulled back to the left edge");

  const offRight = centerOn(
    { width: 340, height: 200 },
    { x: 2500, y: 1400, width: 300, height: 200 },
    monitor,
  );
  assert.equal(offRight.x, 2560 - 340, "pulled back to the right edge");
  assert.equal(offRight.y, 1440 - 200, "pulled back to the bottom edge");
});

test("shrinks the grid rather than overflow a small monitor", () => {
  const tiny: Rect = { x: 0, y: 0, width: 200, height: 150 };
  const box = centerOn({ width: 340, height: 200 }, tiny, tiny);

  assert.deepEqual(box, { x: 0, y: 0, width: 200, height: 150 });
});

test("centres the grid on a monitor that is not the first one", () => {
  const second: Rect = { x: 2560, y: -240, width: 1920, height: 1080 };
  const box = centerOn({ width: 340, height: 200 }, second, second);

  assert.deepEqual(box, { x: 3350, y: 200, width: 340, height: 200 });
});

test("works out which cell the pointer is over", () => {
  const box: Rect = { x: 100, y: 50, width: 300, height: 200 };
  const grid = { cols: [1, 1, 1], rows: [1, 1] };

  assert.deepEqual(cellAt(100, 50, box, grid), { col: 0, row: 0 }, "top left");
  assert.deepEqual(cellAt(250, 60, box, grid), { col: 1, row: 0 }, "top middle");
  assert.deepEqual(cellAt(399, 249, box, grid), { col: 2, row: 1 }, "bottom right");
  assert.deepEqual(cellAt(150, 200, box, grid), { col: 0, row: 1 }, "bottom left");
});

test("reads a pointer that has strayed off the grid as the nearest cell", () => {
  const box: Rect = { x: 100, y: 50, width: 300, height: 200 };
  const grid = { cols: [1, 1, 1], rows: [1, 1] };

  assert.deepEqual(cellAt(-500, -500, box, grid), { col: 0, row: 0 });
  assert.deepEqual(cellAt(5000, 5000, box, grid), { col: 2, row: 1 });
  assert.deepEqual(cellAt(NaN, NaN, box, grid), { col: 0, row: 0 });
});

test("survives being asked about a grid with no size", () => {
  const box: Rect = { x: 0, y: 0, width: 0, height: 0 };

  assert.deepEqual(cellAt(10, 10, box, { cols: [], rows: [] }), {
    col: 0,
    row: 0,
  });
});

test("starts at the first cell when nothing is chosen yet", () => {
  const grid = { cols: [1, 1, 1], rows: [1, 1] };
  const first = { anchor: { col: 0, row: 0 }, focus: { col: 0, row: 0 } };

  assert.deepEqual(moveFocus(null, "right", grid, false), first);
  assert.deepEqual(moveFocus(null, "up", grid, true), first, "even extending");
});

test("walks a single cell around the grid", () => {
  const grid = { cols: [1, 1, 1], rows: [1, 1] };
  let sel = moveFocus(null, "right", grid, false);

  sel = moveFocus(sel, "right", grid, false);
  assert.deepEqual(sel, {
    anchor: { col: 1, row: 0 },
    focus: { col: 1, row: 0 },
  });

  sel = moveFocus(sel, "down", grid, false);
  assert.deepEqual(sel, {
    anchor: { col: 1, row: 1 },
    focus: { col: 1, row: 1 },
  });
  assert.deepEqual(
    selectionRange(sel),
    { col: 1, row: 1, colEnd: 1, rowEnd: 1 },
    "one cell",
  );
});

test("grows the range against the corner it started from", () => {
  const grid = { cols: [1, 1, 1], rows: [1, 1] };
  let sel = moveFocus(null, "right", grid, false);

  sel = moveFocus(sel, "right", grid, true);
  sel = moveFocus(sel, "down", grid, true);

  assert.deepEqual(sel.anchor, { col: 0, row: 0 }, "the corner stayed");
  assert.deepEqual(sel.focus, { col: 1, row: 1 });
  assert.deepEqual(selectionRange(sel), {
    col: 0,
    row: 0,
    colEnd: 1,
    rowEnd: 1,
  });
});

test("shrinks a range back down again", () => {
  const grid = { cols: [1, 1, 1], rows: [1, 1] };
  let sel = moveFocus(null, "right", grid, false);
  sel = moveFocus(sel, "right", grid, true);
  sel = moveFocus(sel, "right", grid, true);
  assert.deepEqual(sel.focus, { col: 2, row: 0 }, "grown to the far column");

  sel = moveFocus(sel, "left", grid, true);
  assert.deepEqual(sel.focus, { col: 1, row: 0 });
  assert.deepEqual(sel.anchor, { col: 0, row: 0 });
});

test("collapsing after growing leaves one cell where the focus was", () => {
  const grid = { cols: [1, 1, 1], rows: [1, 1] };
  let sel = moveFocus(null, "right", grid, false);
  sel = moveFocus(sel, "right", grid, true);
  sel = moveFocus(sel, "down", grid, false);

  assert.deepEqual(sel.anchor, sel.focus);
  assert.deepEqual(sel.focus, { col: 1, row: 1 });
});

test("stops at the edges of the grid", () => {
  const grid = { cols: [1, 1, 1], rows: [1, 1] };
  let sel: Selection | null = null;

  for (let i = 0; i < 8; i++) {
    sel = moveFocus(sel, "left", grid, false);
    sel = moveFocus(sel, "up", grid, false);
  }
  assert.deepEqual(sel!.focus, { col: 0, row: 0 }, "top left");

  for (let i = 0; i < 8; i++) {
    sel = moveFocus(sel, "right", grid, false);
    sel = moveFocus(sel, "down", grid, false);
  }
  assert.deepEqual(sel!.focus, { col: 2, row: 1 }, "bottom right");
});

test("keeps a selection inside a grid that makes no sense", () => {
  const sel = moveFocus(
    { anchor: { col: 9, row: 9 }, focus: { col: 9, row: 9 } },
    "right",
    { cols: [NaN], rows: [] } as GridSize,
    true,
  );

  assert.deepEqual(sel.focus, { col: 0, row: 0 });
});

test("gives a track twice the size twice the room", () => {
  const grid = { cols: [1, 2, 1], rows: [1] };
  const first = rectOf(SCREEN, grid, cell(0, 0), 0, 0);
  const middle = rectOf(SCREEN, grid, cell(1, 0), 0, 0);
  const last = rectOf(SCREEN, grid, cell(2, 0), 0, 0);

  assert.equal(middle.width, first.width * 2);
  assert.equal(first.width, last.width);
  assert.equal(first.width + middle.width + last.width, SCREEN.width);
});

test("shares out rows by size as well as columns", () => {
  const grid = { cols: [1], rows: [2, 1] };
  const top = rectOf(SCREEN, grid, cell(0, 0), 0, 0);
  const bottom = rectOf(SCREEN, grid, cell(0, 1), 0, 0);

  // Two thirds of 1400 is not a whole number of pixels, so the sizes come out
  // as near the asked-for ratio as pixels allow. What has to be exact is that
  // they still add up to the whole run.
  assert.ok(Math.abs(top.height - bottom.height * 2) <= 1, "twice as tall");
  assert.equal(top.height + bottom.height, SCREEN.height);
});

test("keeps gaps exact when tracks are different sizes", () => {
  const grid = { cols: [1, 2, 1], rows: [1, 1] };
  const first = rectOf(SCREEN, grid, cell(0, 0), 10, 0);
  const middle = rectOf(SCREEN, grid, cell(1, 0), 10, 0);
  const last = rectOf(SCREEN, grid, cell(2, 0), 10, 0);

  assert.equal(middle.x - (first.x + first.width), 10, "first gap");
  assert.equal(last.x - (middle.x + middle.width), 10, "second gap");
  assert.equal(last.x + last.width, SCREEN.width, "still reaches the edge");
  assert.equal(middle.width, first.width * 2, "sizes hold once gaps are out");
});

test("shares out fractional sizes", () => {
  const grid = { cols: [1, 1.5], rows: [1] };
  const left = rectOf(SCREEN, grid, cell(0, 0), 0, 0);
  const right = rectOf(SCREEN, grid, cell(1, 0), 0, 0);

  assert.equal(right.width, Math.round(left.width * 1.5));
  assert.equal(left.width + right.width, SCREEN.width);
});

test("finds the cell under a pointer when tracks differ in size", () => {
  const box: Rect = { x: 0, y: 0, width: 400, height: 100 };
  const grid = { cols: [1, 2, 1], rows: [1] };

  // The tracks take up 100, 200 and 100 pixels of the box in turn.
  assert.deepEqual(cellAt(50, 50, box, grid), { col: 0, row: 0 });
  assert.deepEqual(cellAt(150, 50, box, grid), { col: 1, row: 0 });
  assert.deepEqual(cellAt(250, 50, box, grid), { col: 1, row: 0 }, "still middle");
  assert.deepEqual(cellAt(350, 50, box, grid), { col: 2, row: 0 });
});

test("treats a grid with no usable sizes as a single cell", () => {
  const grid = { cols: [0, -1], rows: [NaN] };
  const rect = rectOf(SCREEN, grid, cell(0, 0), 0, 0);

  assert.deepEqual(rect, SCREEN);
  assert.deepEqual(cellAt(500, 500, SCREEN, grid), { col: 0, row: 0 });
});

test("drops the unusable sizes and keeps the rest", () => {
  const grid = { cols: [1, 0, 1], rows: [1] };
  const first = rectOf(SCREEN, grid, cell(0, 0), 0, 0);
  const second = rectOf(SCREEN, grid, cell(1, 0), 0, 0);

  assert.equal(first.width, second.width, "two tracks, not three");
  assert.equal(first.width + second.width, SCREEN.width);
});

test("shares a run out among equal tracks", () => {
  assert.deepEqual(trackSizes(300, [1, 1, 1], 0), [100, 100, 100]);
  assert.deepEqual(trackSizes(320, [1, 1, 1], 10), [100, 100, 100]);
});

test("shares a run out by size", () => {
  assert.deepEqual(trackSizes(400, [1, 2, 1], 0), [100, 200, 100]);
  assert.deepEqual(trackSizes(420, [1, 2, 1], 10), [100, 200, 100]);
});

test("the sizes and the gaps between them fill the run exactly", () => {
  for (const spans of [[1], [1, 1], [1, 2, 1], [1, 1.5, 2], [3, 1, 1, 1]]) {
    for (const gap of [0, 4, 17]) {
      for (const length of [300, 321, 1000, 2560]) {
        const sizes = trackSizes(length, spans, gap);
        const used =
          sizes.reduce((a, b) => a + b, 0) + gap * (spans.length - 1);

        assert.equal(used, length, `${spans} gap ${gap} in ${length}`);
      }
    }
  }
});

test("gives every track something, however little there is to share", () => {
  // With less room than tracks there is no sharing that works, and a track a
  // pixel wide beats one of nothing. This is the one case where the sizes add
  // up to more than the run, which is why grids are capped at a size where it
  // cannot come up.
  for (const size of trackSizes(4, [1, 1, 1, 1, 1, 1], 0)) {
    assert.ok(size >= 1, "no track disappears");
  }
});

test("a single row keeps the gap between its columns", () => {
  // An axis with one track has no gaps of its own, and must not talk the
  // other axis out of having any.
  const grid = { cols: [1, 1], rows: [1] };
  const left = rectOf(SCREEN, grid, cell(0, 0), 10, 0);
  const right = rectOf(SCREEN, grid, cell(1, 0), 10, 0);

  assert.equal(right.x - (left.x + left.width), 10);
  assert.equal(left.height, SCREEN.height, "full height, no vertical gap");
});

test("a point in the gutter belongs to the nearer cell", () => {
  // Two equal columns drawn 200px wide with a 4px gutter: the gutter spans
  // 200..204 and splits at 202.
  const box: Rect = { x: 0, y: 0, width: 404, height: 100 };
  const grid = { cols: [1, 1], rows: [1] };

  assert.deepEqual(cellAt(201, 50, box, grid, 4), { col: 0, row: 0 });
  assert.deepEqual(cellAt(203, 50, box, grid, 4), { col: 1, row: 0 });
});

test("a click inside a drawn cell always selects that cell", () => {
  // With lopsided spans the old proportional model put the boundary past the
  // gutter, inside the narrow cell: its first sliver selected the wide one.
  const box: Rect = { x: 0, y: 0, width: 604, height: 100 };
  const grid = { cols: [4, 1, 1], rows: [1] };

  // The wide cell is drawn 0..397; the next cell starts at 401.
  assert.deepEqual(cellAt(401, 50, box, grid, 4), { col: 1, row: 0 }, "first pixel of the narrow cell");
  assert.deepEqual(cellAt(396, 50, box, grid, 4), { col: 0, row: 0 }, "last pixel of the wide cell");
});

test("hit-testing still survives hostile points", () => {
  const box: Rect = { x: 0, y: 0, width: 404, height: 100 };
  const grid = { cols: [1, 1], rows: [1, 1] };

  assert.deepEqual(cellAt(NaN, NaN, box, grid, 4), { col: 0, row: 0 });
  assert.deepEqual(cellAt(-500, 5000, box, grid, 4), { col: 0, row: 1 });
});

test("vertical gutters split down the middle too", () => {
  // Rows go through the same arithmetic as columns; this holds it to that.
  // Two equal rows drawn 200px tall with a 4px gutter spanning 200..204.
  const box: Rect = { x: 0, y: 0, width: 100, height: 404 };
  const grid = { cols: [1], rows: [1, 1] };

  assert.deepEqual(cellAt(50, 201, box, grid, 4), { col: 0, row: 0 });
  assert.deepEqual(cellAt(50, 203, box, grid, 4), { col: 0, row: 1 });
});

test("a click inside a drawn cell selects it on the vertical axis as well", () => {
  const box: Rect = { x: 0, y: 0, width: 100, height: 604 };
  const grid = { cols: [1], rows: [4, 1, 1] };

  // The tall cell is drawn 0..397; the next cell starts at 401.
  assert.deepEqual(cellAt(50, 401, box, grid, 4), { col: 0, row: 1 }, "first pixel of the short cell");
  assert.deepEqual(cellAt(50, 396, box, grid, 4), { col: 0, row: 0 }, "last pixel of the tall cell");
});
