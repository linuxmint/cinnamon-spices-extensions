import test from "node:test";
import assert from "node:assert/strict";

import { autotileRects } from "../src/autotile.ts";
import type { Gaps, Rect } from "../src/geometry.ts";

/** Numbers chosen so halves, thirds and quarters all come out whole. */
const AREA: Rect = { x: 0, y: 0, width: 1200, height: 900 };
const NONE: Gaps = { window: 0, edge: 0 };

const inside = (rect: Rect, area: Rect): boolean =>
  rect.x >= area.x &&
  rect.y >= area.y &&
  rect.x + rect.width <= area.x + area.width &&
  rect.y + rect.height <= area.y + area.height;

test("no windows means no rectangles", () => {
  assert.deepEqual(autotileRects("main-left", 0, AREA, NONE), []);
  assert.deepEqual(autotileRects("equal-left", -3, AREA, NONE), []);
  assert.deepEqual(autotileRects("main-right", NaN, AREA, NONE), []);
});

test("one window is given the whole area, whatever the arrangement", () => {
  for (const mode of ["main-left", "main-right", "equal-left", "equal-right"] as const) {
    assert.deepEqual(autotileRects(mode, 1, AREA, NONE), [AREA]);
  }
});

test("tile left puts the leader on the left at full height", () => {
  const [main, top, bottom] = autotileRects("main-left", 3, AREA, NONE);

  assert.deepEqual(main, { x: 0, y: 0, width: 600, height: 900 });
  assert.deepEqual(top, { x: 600, y: 0, width: 600, height: 450 });
  assert.deepEqual(bottom, { x: 600, y: 450, width: 600, height: 450 });
});

test("tile right is the mirror of tile left", () => {
  const left = autotileRects("main-left", 4, AREA, NONE);
  const right = autotileRects("main-right", 4, AREA, NONE);

  left.forEach((rect, index) => {
    const mirrored = right[index];

    assert.equal(mirrored.width, rect.width);
    assert.equal(mirrored.y, rect.y);
    assert.equal(mirrored.height, rect.height);
    assert.equal(
      mirrored.x,
      AREA.x + AREA.width - rect.width - (rect.x - AREA.x),
      `window ${index} sits mirrored`,
    );
  });
});

test("the stack splits its side evenly, however many windows", () => {
  const rects = autotileRects("main-left", 6, AREA, NONE);
  const stack = rects.slice(1);

  assert.equal(stack.length, 5);
  for (const rect of stack) {
    assert.equal(rect.height, 180, "each of five stacked windows gets a fifth");
    assert.equal(rect.x, 600);
  }
  assert.equal(
    stack[stack.length - 1].y + stack[stack.length - 1].height,
    900,
    "the stack reaches the bottom",
  );
});

test("an even count shares out as a full lattice", () => {
  const rects = autotileRects("equal-left", 4, AREA, NONE);

  assert.deepEqual(rects[0], { x: 0, y: 0, width: 600, height: 450 }, "leader");
  assert.deepEqual(rects[1], { x: 600, y: 0, width: 600, height: 450 });
  assert.deepEqual(rects[2], { x: 600, y: 450, width: 600, height: 450 });
  assert.deepEqual(rects[3], { x: 0, y: 450, width: 600, height: 450 });
});

test("an odd count gives the spare cell to the leader", () => {
  const rects = autotileRects("equal-left", 5, AREA, NONE);

  assert.deepEqual(rects[0], { x: 0, y: 0, width: 600, height: 600 }, "leader");
  assert.deepEqual(rects[1], { x: 600, y: 0, width: 600, height: 300 });
  assert.deepEqual(rects[2], { x: 600, y: 300, width: 600, height: 300 });
  assert.deepEqual(rects[3], { x: 600, y: 600, width: 600, height: 300 });
  assert.deepEqual(rects[4], { x: 0, y: 600, width: 600, height: 300 });

  assert.equal(
    rects[0].height,
    rects[1].height * 2,
    "the leader is exactly two cells tall",
  );
});

test("three windows in equal agree with tile left", () => {
  assert.deepEqual(
    autotileRects("equal-left", 3, AREA, NONE),
    autotileRects("main-left", 3, AREA, NONE),
  );
});

test("seven windows wrap the two oldest back under the leader", () => {
  const rects = autotileRects("equal-left", 7, AREA, NONE);
  const height = rects[1].height;

  assert.equal(rects.length, 7);
  assert.equal(rects[0].height, height * 2, "leader doubled");
  for (const index of [1, 2, 3, 4]) {
    assert.equal(rects[index].x, 600, `window ${index} in the right column`);
  }
  assert.deepEqual(
    { x: rects[5].x, y: rects[5].y },
    { x: 0, y: height * 2 },
    "sixth window sits under the leader",
  );
  assert.deepEqual(
    { x: rects[6].x, y: rects[6].y },
    { x: 0, y: height * 3 },
    "seventh below that",
  );
});

test("gaps apply to a sweep the way they apply to the grid", () => {
  const gaps: Gaps = { window: 10, edge: 20 };
  const [main, top, bottom] = autotileRects("main-left", 3, AREA, gaps);

  assert.equal(main.x, 20, "edge gap on the left");
  assert.equal(top.x - (main.x + main.width), 10, "gap between the columns");
  assert.equal(bottom.y - (top.y + top.height), 10, "gap inside the stack");
  assert.equal(
    AREA.width - (top.x + top.width),
    20,
    "edge gap on the right",
  );
});

test("every rectangle stays inside the area", () => {
  for (const mode of ["main-left", "main-right", "equal-left", "equal-right"] as const) {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 10, 13]) {
      for (const gaps of [NONE, { window: 10, edge: 20 }]) {
        for (const rect of autotileRects(mode, count, AREA, gaps)) {
          assert.ok(
            inside(rect, AREA),
            `${mode} with ${count} windows, gaps ${gaps.window}`,
          );
        }
      }
    }
  }
});

test("hands back as many rectangles as there are windows", () => {
  for (const mode of ["main-left", "main-right", "equal-left", "equal-right"] as const) {
    for (const count of [1, 2, 3, 8, 9]) {
      assert.equal(autotileRects(mode, count, AREA, NONE).length, count);
    }
  }
});

test("equal right is the mirror of equal left", () => {
  for (const count of [2, 3, 5, 7, 8]) {
    const led = autotileRects("equal-left", count, AREA, NONE);
    const mirrored = autotileRects("equal-right", count, AREA, NONE);

    led.forEach((rect, index) => {
      const twin = mirrored[index];

      assert.equal(twin.width, rect.width);
      assert.equal(twin.y, rect.y);
      assert.equal(twin.height, rect.height);
      assert.equal(
        twin.x,
        AREA.x + AREA.width - rect.width - (rect.x - AREA.x),
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

test("equal right leads from the top right", () => {
  const rects = autotileRects("equal-right", 5, AREA, NONE);

  assert.deepEqual(rects[0], { x: 600, y: 0, width: 600, height: 600 });
  assert.deepEqual(rects[1], { x: 0, y: 0, width: 600, height: 300 });
  assert.deepEqual(rects[4], { x: 600, y: 600, width: 600, height: 300 });
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
