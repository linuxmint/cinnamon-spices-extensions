import test from "node:test";
import assert from "node:assert/strict";

import {
  arrange,
  assignCells,
  autotileRects,
  refusesCell,
  settle,
} from "../src/autotile.ts";
import type { Placer } from "../src/autotile.ts";
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
  assert.equal(
    plan.cell[1],
    3,
    "the window that had the half takes the quarter",
  );
  assert.deepEqual(plan.left, []);
});

test("the biggest fitting cell is chosen, not the first", () => {
  const cells: Rect[] = [
    { x: 0, y: 0, width: 600, height: 900 },
    { x: 600, y: 0, width: 600, height: 450 },
    { x: 600, y: 450, width: 400, height: 450 },
    { x: 1000, y: 450, width: 200, height: 450 },
  ];
  const needs: Array<Size | null> = [
    null,
    null,
    null,
    { width: 300, height: 300 },
  ];
  const plan = assignCells(cells, needs);

  assert.equal(
    plan.cell[3],
    1,
    "both the half and the wide quarter fit; the half wins",
  );
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
  assert.equal(
    plan.cell[1],
    2,
    "the displaced window takes the first cell left",
  );
});

test("no cells means no assignment", () => {
  assert.deepEqual(assignCells([], []), { cell: [], left: [] });
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
  assert.equal(
    refusesCell({ ...cell, width: 296 }, cell),
    false,
    "snapped smaller",
  );
  assert.equal(
    refusesCell({ ...cell, width: 301 }, cell),
    true,
    "one pixel wider",
  );
  assert.equal(
    refusesCell({ ...cell, height: 451 }, cell),
    true,
    "one pixel taller",
  );
});

/** A stand-in window, and what it will not do. */
interface Fake {
  name: string;
  /** A size it never goes below. */
  min?: Size | undefined;
  /** A shape it always keeps, width over height. */
  ratio?: number | undefined;
  /** Always comes back wider than asked, whatever it is asked. */
  contrary?: boolean | undefined;
  /** Always comes back one pixel taller than asked: the rounding mpv does. */
  jitter?: boolean | undefined;
}

/**
 * A stand-in for the window manager, answering placements as Muffin does: a
 * window keeping a shape has whichever side moves less adjusted to restore
 * it, which grows one side for a cell of the wrong shape, and a window with
 * a minimum never goes below it. A contrary window stands in for a client
 * that sizes itself with no regard to the request, and a jittery one for a
 * client that rounds its height a pixel past what it was given. Every
 * placement is logged.
 */
function windowManager() {
  const log: Array<{
    window: Fake;
    rect: Rect;
    maximize: boolean;
    frame: Rect;
  }> = [];

  const place: Placer<Fake> = (window, rect, maximize) => {
    let { width, height } = rect;
    if (window.ratio) {
      const byWidth = Math.round(height * window.ratio);
      const byHeight = Math.round(width / window.ratio);
      if (Math.abs(byWidth - width) < Math.abs(byHeight - height)) {
        width = byWidth;
      } else {
        height = byHeight;
      }
    }
    if (window.min) {
      width = Math.max(width, window.min.width);
      height = Math.max(height, window.min.height);
    }
    if (window.contrary) {
      width += 20;
    }
    if (window.jitter) {
      height += 1;
    }

    const frame = { x: rect.x, y: rect.y, width, height };
    log.push({ window, rect, maximize, frame });
    return frame;
  };

  return {
    place,
    log,
    last: (window: Fake) =>
      [...log].reverse().find((entry) => entry.window === window),
    placements: (window: Fake) =>
      log.filter((entry) => entry.window === window).length,
  };
}

const fake = (name: string, extra: Partial<Fake> = {}): Fake => ({
  name,
  ...extra,
});
const SCREEN: Rect = { x: 0, y: 0, width: 2560, height: 1400 };
const SPACED: Gaps = { window: 24, edge: 24 };
const WIDESCREEN = 1920 / 1080;
const inside = (a: Rect, b: Rect): boolean =>
  a.x >= b.x &&
  a.y >= b.y &&
  a.x + a.width <= b.x + b.width &&
  a.y + a.height <= b.y + b.height;
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test("settling a window that fits is a single placement", () => {
  const wm = windowManager();
  const plain = fake("plain");
  const cell = rect(0, 0, 600, 400);

  assert.deepEqual(settle(wm.place, plain, cell, false), cell);
  assert.equal(wm.placements(plain), 1);
});

test("a shape fits a wide cell at full height, flush top left", () => {
  // A landscape cell wider than the window's shape: the largest box of that
  // shape the cell holds is the full height and whatever width follows.
  const wm = windowManager();
  const player = fake("player", { ratio: WIDESCREEN });
  const cell = rect(100, 50, 1244, 664);
  const frame = settle(wm.place, player, cell, false);

  assert.deepEqual(frame, { x: 100, y: 50, width: 1180, height: 664 });
  assert.ok(inside(frame, cell));
  assert.equal(wm.placements(player), 2, "the cell, then the fitting box");
});

test("a tall shape fills a tall cell across", () => {
  // A portrait window in a portrait cell that is taller still: the shape is
  // wider than the cell's, so the box takes the full width and the height
  // follows, leaving the room below.
  const wm = windowManager();
  const player = fake("player", { ratio: 9 / 16 });
  const cell = rect(0, 0, 700, 1400);
  const frame = settle(wm.place, player, cell, false);

  assert.ok(inside(frame, cell), "sits inside the cell");
  assert.equal(frame.width, 700, "filled across");
  assert.equal(wm.placements(player), 2);
});

test("settling reports the overhang of a window that will not fit, for the caller to judge", () => {
  const wm = windowManager();
  const big = fake("big", { min: { width: 900, height: 300 } });
  const frame = settle(wm.place, big, rect(0, 0, 600, 400), false);

  assert.equal(frame.width, 900, "still overhangs, neither side held it");
  assert.ok(wm.placements(big) >= 2);
});

test("settling maximizes on the first placement only", () => {
  const wm = windowManager();
  const player = fake("player", { ratio: WIDESCREEN });
  settle(wm.place, player, rect(0, 0, 1244, 664), true);

  assert.equal(wm.log[0].maximize, true);
  assert.equal(wm.log[1].maximize, false, "a fitted box is never maximized");
});

test("a window that keeps its shape settles into its cell rather than being set aside", () => {
  // The picture-in-picture case: a 16:9 player in a stacked half wider than
  // 16:9 comes back taller than the cell. Placed at its own shape it lands
  // inside, flush with the cell's top left corner.
  const player = fake("player", { ratio: WIDESCREEN });
  const windows = [fake("lead"), fake("other"), player];
  const wm = windowManager();
  const { placed, overflow } = arrange(
    windows,
    "main-left",
    SCREEN,
    SPACED,
    false,
    wm.place,
  );
  const cells = autotileRects("main-left", 3, SCREEN, SPACED);

  assert.deepEqual(overflow, []);
  assert.deepEqual(placed, windows);
  const entry = wm.last(player);
  assert.ok(entry);
  assert.deepEqual(entry.frame, {
    x: cells[2].x,
    y: cells[2].y,
    width: 1180,
    height: 664,
  });
  assert.equal(wm.placements(player), 2, "the cell, then its shape");
});

test("a window that cannot shrink is given a larger cell", () => {
  const wide = fake("wide", { min: { width: 700, height: 500 } });
  const windows = [fake("lead"), fake("a"), fake("b"), wide];
  const wm = windowManager();
  const { overflow } = arrange(
    windows,
    "main-left",
    SCREEN,
    SPACED,
    false,
    wm.place,
  );
  const cells = autotileRects("main-left", 4, SCREEN, SPACED);

  assert.deepEqual(overflow, []);
  const got = wm.last(wide);
  assert.ok(got);
  assert.deepEqual(got.rect, cells[1], "moved up to the half that holds it");
  assert.ok(inside(got.frame, got.rect), "and it fits there");
  const displaced = wm.last(windows[1]);
  assert.ok(displaced);
  assert.deepEqual(
    displaced.rect,
    cells[3],
    "the half's window takes the quarter",
  );
});

test("a window that fits nowhere is set aside and the rest arranged without it", () => {
  const huge = fake("huge", { min: { width: 5000, height: 5000 } });
  const windows = [fake("lead"), fake("other"), huge];
  const wm = windowManager();
  const { placed, overflow } = arrange(
    windows,
    "main-left",
    SCREEN,
    SPACED,
    false,
    wm.place,
  );

  assert.deepEqual(overflow, [huge]);
  assert.deepEqual(placed, [windows[0], windows[1]]);
  const other = wm.last(windows[1]);
  assert.ok(other);
  assert.deepEqual(
    other.rect,
    autotileRects("main-left", 2, SCREEN, SPACED)[1],
    "a clean two-window arrangement",
  );
});

test("the leader is fitted to its shape like any other window", () => {
  // Alone in equal mode it gets the whole area, wider than 16:9, so it comes
  // back taller; offered its shape, it settles in.
  const player = fake("player", { ratio: WIDESCREEN });
  const wm = windowManager();
  const { placed, overflow } = arrange(
    [player],
    "equal-left",
    SCREEN,
    SPACED,
    false,
    wm.place,
  );
  const [whole] = autotileRects("equal-left", 1, SCREEN, SPACED);

  assert.deepEqual(placed, [player]);
  assert.deepEqual(overflow, []);
  assert.equal(wm.placements(player), 2);
  const entry = wm.last(player);
  assert.ok(entry);
  assert.ok(inside(entry.frame, whole), "fits the area at its shape");
});

test("the leader keeps its cell whatever it needs, and nothing is re-planned", () => {
  const stubborn = fake("stubborn", { min: { width: 5000, height: 5000 } });
  const windows = [stubborn, fake("other")];
  const wm = windowManager();
  const { placed, overflow } = arrange(
    windows,
    "main-left",
    SCREEN,
    SPACED,
    false,
    wm.place,
  );

  assert.deepEqual(placed, windows, "still leads");
  assert.deepEqual(overflow, []);
  assert.equal(
    wm.log.length,
    3,
    "one pass: the leader tried twice, the other placed once",
  );
});

test("a lone window is maximized only when asked", () => {
  for (const maximizeAlone of [true, false]) {
    const wm = windowManager();
    arrange([fake("only")], "main-left", SCREEN, NONE, maximizeAlone, wm.place);
    assert.equal(wm.log[0].maximize, maximizeAlone);
  }

  // Company means no maximizing, whatever was asked.
  const wm = windowManager();
  arrange([fake("a"), fake("b")], "main-left", SCREEN, NONE, true, wm.place);
  assert.ok(wm.log.every((entry) => !entry.maximize));
});

test("shrink-to-fit lands a window that overshoots every request inside the cell", () => {
  // A window that always comes back a fixed amount wider than asked is not
  // stuck at a size: shrink-to-fit keeps offering a smaller box until the
  // window lands inside the cell rather than overhanging it.
  const wm = windowManager();
  const offset = fake("offset", { contrary: true });
  const cell = rect(0, 0, 600, 400);
  const frame = settle(wm.place, offset, cell, false);

  assert.ok(!refusesCell(frame, cell), "no overhang");
  assert.ok(inside(frame, cell), "sits inside the cell");
});

test("shrink-to-fit answers a window that lands a pixel taller than asked", () => {
  // The rounding that set mpv aside: a window that comes back one pixel
  // taller than any box it is given overhangs the fit by exactly that, so
  // the shrink has to act on the height overhang, not only the width.
  const wm = windowManager();
  const tall = fake("tall", { jitter: true });
  const cell = rect(0, 0, 600, 400);
  const frame = settle(wm.place, tall, cell, false);

  assert.ok(!refusesCell(frame, cell), "sits inside");
  assert.equal(frame.height, 400, "shrunk to exactly the cell's height");
});

test("a pixel-taller window still fits when its shape matches the cell's", () => {
  // In a cell whose shape the window nearly matches, the largest box of
  // that shape is the cell itself, so the first fitted placement comes back
  // exactly as the probe did. That is not the window refusing to shrink; it
  // has not yet been asked to. The shrink that follows must still happen.
  const wm = windowManager();
  const tall = fake("tall", { jitter: true });
  const cell = rect(0, 0, 300, 900);
  const frame = settle(wm.place, tall, cell, false);

  assert.ok(!refusesCell(frame, cell), "sits inside");
  assert.equal(frame.height, 900);
});

test("settling a window with no shape to fit by stops at the first placement", () => {
  // A frame with no height has no ratio; it is handed back as it came, for
  // the caller to judge, rather than reshaped into nonsense.
  let placements = 0;
  const place: Placer<Fake> = (_window, rect) => {
    placements++;
    return { x: rect.x, y: rect.y, width: 5000, height: 0 };
  };
  const frame = settle(place, fake("flat"), rect(0, 0, 600, 400), false);

  assert.equal(frame.width, 5000, "returned as it came");
  assert.equal(placements, 1, "no fit was attempted");
});

test("settling a window that will never fit gives up after a try, not the whole guard", () => {
  // A minimum one pixel wider than the cell overhangs by a pixel however
  // the box shrinks, so the window comes back the same size every time.
  // That is recognised at once; each placement is a call on the window
  // manager, and there is no sense making sixteen of them.
  const wm = windowManager();
  const stuck = fake("stuck", { min: { width: 601, height: 400 } });
  const cell = rect(0, 0, 600, 400);
  const frame = settle(wm.place, stuck, cell, false);

  assert.ok(refusesCell(frame, cell), "still overhangs");
  assert.ok(wm.placements(stuck) <= 5, `gave up after ${wm.placements(stuck)}`);
});

test("settling a window that outgrows its room stops when the room runs out", () => {
  // Each placement comes back wider than the last, so the room left to try
  // shrinks away. Once it has, there is nothing left to offer, and settling
  // stops there rather than running the guard down on boxes of nothing.
  let last = 0;
  let placements = 0;
  const place: Placer<Fake> = (_window, rect) => {
    placements++;
    last = Math.max(rect.width + 10, last + 10);
    return { x: rect.x, y: rect.y, width: last, height: rect.height };
  };
  const cell = rect(0, 0, 610, 664);
  const frame = settle(place, fake("growing"), cell, false);

  assert.ok(refusesCell(frame, cell), "never fit");
  assert.ok(placements < 18, `stopped after ${placements}, before the guard`);
});

test("shrink-to-fit gives up on a window that will not shrink at all", () => {
  // A hard minimum larger than the cell cannot be shrunk into it: settling
  // returns the overhang for the caller to send to overflow.
  const wm = windowManager();
  const fixed = fake("fixed", { min: { width: 900, height: 900 } });
  const frame = settle(wm.place, fixed, rect(0, 0, 600, 400), false);

  assert.ok(refusesCell(frame, rect(0, 0, 600, 400)), "still overhangs");
});

test("a window that grows on every placement is set aside, not chased", () => {
  // Each placement comes back ten pixels wider than the last, so no size it
  // insists on stays true. It refuses its cell, is given the larger cell its
  // need called for, refuses that too, and by then needs more than any cell
  // holds, so it is set aside: three placing passes, which the leader's
  // placements count.
  const lead = fake("lead");
  const growing = fake("growing");
  const wm = windowManager();
  let last = 0;
  const place: Placer<Fake> = (window, rect, maximize) => {
    if (window !== growing) {
      return wm.place(window, rect, maximize);
    }
    last = Math.max(rect.width + 10, last + 10);
    const frame = { x: rect.x, y: rect.y, width: last, height: rect.height };
    wm.log.push({ window, rect, maximize, frame });
    return frame;
  };
  const { placed, overflow } = arrange(
    [lead, fake("a"), fake("b"), growing],
    "main-left",
    SCREEN,
    SPACED,
    false,
    place,
  );

  assert.deepEqual(overflow, [growing]);
  assert.equal(placed.length, 3);
  assert.equal(
    wm.placements(lead),
    3,
    "refuse, refuse the cell chosen for it, arrange without it",
  );
});

test("windows set aside keep the order they were given", () => {
  const big = { min: { width: 5000, height: 5000 } };
  const [a, b, c, d] = [fake("a"), fake("b", big), fake("c"), fake("d", big)];
  const wm = windowManager();
  const { placed, overflow } = arrange(
    [a, b, c, d],
    "equal-left",
    SCREEN,
    SPACED,
    false,
    wm.place,
  );

  assert.deepEqual(overflow, [b, d]);
  assert.deepEqual(placed, [a, c]);
});

test("every arrangement settles, and every placed window fits its cell", () => {
  // A sweep over windows that will not shrink, will not change shape, or
  // both. The passes always end within their bound, the count always adds
  // up, the leader is never set aside, and the other placed windows end
  // inside the area and clear of one another. A window that only keeps a
  // shape is never set aside: its shape always fits.
  const MINS: Array<Size | undefined> = [
    undefined,
    { width: 50, height: 50 },
    { width: 400, height: 300 },
    { width: 700, height: 500 },
    { width: 1300, height: 700 },
    { width: 5000, height: 5000 },
  ];
  const RATIOS = [undefined, WIDESCREEN, 4 / 3, 1, 9 / 16];
  const AREAS = [SCREEN, AREA, { x: 0, y: 0, width: 900, height: 1600 }];
  const MODES = [
    "main-left",
    "main-right",
    "equal-left",
    "equal-right",
  ] as const;

  // Park-Miller, so the sweep is the same every run.
  let seed = 7;
  const next = (n: number): number => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };

  for (let t = 0; t < 400; t++) {
    const count = 1 + next(8);
    const windows = Array.from({ length: count }, (_, i) =>
      fake(`w${i}`, {
        min: MINS[next(MINS.length)],
        ratio: RATIOS[next(RATIOS.length)],
      }),
    );
    const mode = MODES[next(MODES.length)];
    const area = AREAS[next(AREAS.length)];
    const gaps = next(2) ? SPACED : NONE;
    const wm = windowManager();
    const { placed, overflow } = arrange(
      windows,
      mode,
      area,
      gaps,
      false,
      wm.place,
    );
    const name = `${mode} x${count} in ${area.width}x${area.height}`;

    assert.equal(placed.length + overflow.length, count, name);
    assert.equal(
      placed[0],
      windows[0],
      `${name}: the leader is never set aside`,
    );
    // At most a pass per window learned or set aside, plus the last, and
    // within a pass each window is placed at the cell and then at most
    // seventeen times at its shape.
    assert.ok(
      wm.log.length <= (2 * count + 1) * count * 18,
      `${name}: more placements than the bound allows`,
    );
    const frames = placed.slice(1).map((window) => {
      const entry = wm.last(window);
      assert.ok(entry);
      assert.ok(
        inside(entry.frame, area),
        `${name}: ${window.name} leaves the area`,
      );
      return entry.frame;
    });
    for (let a = 0; a < frames.length; a++) {
      for (let b = a + 1; b < frames.length; b++) {
        assert.ok(!overlaps(frames[a], frames[b]), `${name}: windows overlap`);
      }
    }
    for (const window of overflow) {
      assert.ok(
        window.min,
        `${name}: ${window.name} keeps only a shape yet was set aside`,
      );
    }
  }
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
