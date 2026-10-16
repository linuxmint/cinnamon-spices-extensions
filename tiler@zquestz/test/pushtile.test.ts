import test from "node:test";
import assert from "node:assert/strict";

import {
  PUSH_GRID,
  nextTileMode,
  readPushState,
  tileModeOf,
  tileModeRange,
} from "../src/pushtile.ts";
import type { PushNote, TileMode } from "../src/pushtile.ts";
import { cellRangeToRect, trackCount } from "../src/geometry.ts";
import type { Direction, Gaps, Rect } from "../src/geometry.ts";

const MODES: TileMode[] = [
  "none",
  "left",
  "right",
  "top",
  "bottom",
  "ulc",
  "llc",
  "urc",
  "lrc",
  "maximized",
];

const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];

test("an untiled window goes to the half it was pushed toward", () => {
  assert.equal(nextTileMode("left", "none"), "left");
  assert.equal(nextTileMode("right", "none"), "right");
  assert.equal(nextTileMode("up", "none"), "top");
  assert.equal(nextTileMode("down", "none"), "bottom");
});

test("pushing back across the screen lets a tiled window go", () => {
  assert.equal(nextTileMode("right", "left"), "none");
  assert.equal(nextTileMode("left", "right"), "none");
  assert.equal(nextTileMode("down", "top"), "none");
  assert.equal(nextTileMode("up", "bottom"), "none");
});

test("pushing along a half takes the corner", () => {
  assert.equal(nextTileMode("up", "left"), "ulc");
  assert.equal(nextTileMode("down", "left"), "llc");
  assert.equal(nextTileMode("up", "right"), "urc");
  assert.equal(nextTileMode("down", "right"), "lrc");
  assert.equal(nextTileMode("left", "top"), "ulc");
  assert.equal(nextTileMode("right", "top"), "urc");
  assert.equal(nextTileMode("left", "bottom"), "llc");
  assert.equal(nextTileMode("right", "bottom"), "lrc");
});

test("pushing into an edge a window already sits against holds it there", () => {
  assert.equal(nextTileMode("left", "left"), "left");
  assert.equal(nextTileMode("right", "right"), "right");
  assert.equal(nextTileMode("down", "bottom"), "bottom");
  assert.equal(nextTileMode("left", "ulc"), "ulc");
  assert.equal(nextTileMode("up", "ulc"), "ulc");
  assert.equal(nextTileMode("left", "llc"), "llc");
  assert.equal(nextTileMode("down", "llc"), "llc");
  assert.equal(nextTileMode("right", "urc"), "urc");
  assert.equal(nextTileMode("up", "urc"), "urc");
  assert.equal(nextTileMode("right", "lrc"), "lrc");
  assert.equal(nextTileMode("down", "lrc"), "lrc");
});

test("a corner steps back out to the half it came from", () => {
  assert.equal(nextTileMode("down", "ulc"), "left");
  assert.equal(nextTileMode("right", "ulc"), "top");
  assert.equal(nextTileMode("up", "llc"), "left");
  assert.equal(nextTileMode("right", "llc"), "bottom");
  assert.equal(nextTileMode("down", "urc"), "right");
  assert.equal(nextTileMode("left", "urc"), "top");
  assert.equal(nextTileMode("up", "lrc"), "right");
  assert.equal(nextTileMode("left", "lrc"), "bottom");
});

test("the top half grows into a maximized window", () => {
  assert.equal(nextTileMode("up", "top"), "maximized");
});

test("a maximized window pushed down gives the top half", () => {
  // Surprising, and deliberate: this is what the shortcut has always done,
  // and the point of the feature is that it keeps doing it.
  assert.equal(nextTileMode("down", "maximized"), "top");
});

test("a maximized window pushed sideways takes that half", () => {
  assert.equal(nextTileMode("left", "maximized"), "left");
  assert.equal(nextTileMode("right", "maximized"), "right");
  assert.equal(nextTileMode("up", "maximized"), "top");
});

test("the example from the window manager's own documentation", () => {
  // "if window is left-tiled, and the direction is UP, the window will be
  // upper-left corner tiled. If the direction is RIGHT, it will be untiled."
  assert.equal(nextTileMode("up", "left"), "ulc");
  assert.equal(nextTileMode("right", "left"), "none");
});

test("every push from every position lands somewhere known", () => {
  for (const mode of MODES) {
    for (const direction of DIRECTIONS) {
      const next = nextTileMode(direction, mode);

      assert.ok(MODES.includes(next), `${mode} pushed ${direction} → ${next}`);
    }
  }
});

test("an unrecognized position is left alone", () => {
  const strange = "sideways" as TileMode;

  for (const direction of DIRECTIONS) {
    assert.equal(nextTileMode(direction, strange), strange);
  }
});

test("letting a window go is a restore rather than a placement", () => {
  assert.equal(tileModeRange("none"), null);
});

test("every other position covers cells of the two by two grid", () => {
  const cols = trackCount(PUSH_GRID.cols);
  const rows = trackCount(PUSH_GRID.rows);

  assert.deepEqual([cols, rows], [2, 2]);

  for (const mode of MODES.filter((m) => m !== "none")) {
    const range = tileModeRange(mode);

    assert.ok(range, `${mode} has a range`);
    assert.ok(range.col >= 0 && range.colEnd < cols, mode);
    assert.ok(range.row >= 0 && range.rowEnd < rows, mode);
    assert.ok(range.col <= range.colEnd && range.row <= range.rowEnd, mode);
  }
});

test("the ranges are the halves and corners they are named after", () => {
  const area: Rect = { x: 0, y: 0, width: 1000, height: 800 };
  const none: Gaps = { window: 0, edge: 0 };
  const rectOf = (mode: TileMode): Rect =>
    cellRangeToRect(area, PUSH_GRID, tileModeRange(mode)!, none);

  assert.deepEqual(rectOf("left"), { x: 0, y: 0, width: 500, height: 800 });
  assert.deepEqual(rectOf("right"), { x: 500, y: 0, width: 500, height: 800 });
  assert.deepEqual(rectOf("top"), { x: 0, y: 0, width: 1000, height: 400 });
  assert.deepEqual(rectOf("bottom"), {
    x: 0,
    y: 400,
    width: 1000,
    height: 400,
  });
  assert.deepEqual(rectOf("ulc"), { x: 0, y: 0, width: 500, height: 400 });
  assert.deepEqual(rectOf("urc"), { x: 500, y: 0, width: 500, height: 400 });
  assert.deepEqual(rectOf("llc"), { x: 0, y: 400, width: 500, height: 400 });
  assert.deepEqual(rectOf("lrc"), { x: 500, y: 400, width: 500, height: 400 });
  assert.deepEqual(rectOf("maximized"), area);
});

test("gaps and reserved space reach a pushed window like any other", () => {
  // The whole reason for the feature: the same conversion, so the same gaps.
  const area: Rect = { x: 100, y: 50, width: 1000, height: 800 };
  const gaps: Gaps = { window: 10, edge: 20 };
  const left = cellRangeToRect(area, PUSH_GRID, tileModeRange("left")!, gaps);
  const right = cellRangeToRect(area, PUSH_GRID, tileModeRange("right")!, gaps);

  assert.equal(left.x, 120, "edge gap on the left");
  assert.equal(right.x - (left.x + left.width), 10, "gap between the halves");
  assert.equal(
    area.x + area.width - (right.x + right.width),
    20,
    "edge gap on the right",
  );
  assert.equal(left.y, 70, "edge gap on the top");
});

test("a corner is exactly the overlap of the two halves it sits in", () => {
  const area: Rect = { x: 0, y: 0, width: 1200, height: 900 };
  const gaps: Gaps = { window: 12, edge: 8 };
  const rectOf = (mode: TileMode): Rect =>
    cellRangeToRect(area, PUSH_GRID, tileModeRange(mode)!, gaps);

  const left = rectOf("left");
  const top = rectOf("top");
  const ulc = rectOf("ulc");

  assert.equal(ulc.x, left.x, "shares the left half's edge");
  assert.equal(ulc.width, left.width, "and its width");
  assert.equal(ulc.y, top.y, "shares the top half's edge");
  assert.equal(ulc.height, top.height, "and its height");
});

test("the window manager's own numbering is read back correctly", () => {
  assert.equal(tileModeOf(0), "none");
  assert.equal(tileModeOf(1), "left");
  assert.equal(tileModeOf(2), "right");
  assert.equal(tileModeOf(3), "ulc");
  assert.equal(tileModeOf(4), "llc");
  assert.equal(tileModeOf(5), "urc");
  assert.equal(tileModeOf(6), "lrc");
  assert.equal(tileModeOf(7), "top");
  assert.equal(tileModeOf(8), "bottom");
  assert.equal(tileModeOf(9), "maximized");
});

test("a tile mode we do not know counts as untiled", () => {
  for (const value of [-1, 10, 99, NaN, Infinity]) {
    assert.equal(tileModeOf(value), "none", `${value}`);
  }
});

test("the ranges handed out cannot be altered from outside", () => {
  const first = tileModeRange("left")!;
  first.colEnd = 1;

  assert.equal(tileModeRange("left")!.colEnd, 0, "the table is unharmed");
});

const PLACED: Rect = { x: 20, y: 20, width: 500, height: 800 };
const MOVED: Rect = { x: 300, y: 100, width: 640, height: 480 };
const note = (mode: TileMode): PushNote => ({ mode, placed: { ...PLACED } });

test("a note stands while the window is where the note put it", () => {
  const state = readPushState(false, { ...PLACED }, note("left"), "none");

  assert.deepEqual(state, { mode: "left", standing: true });
});

test("a moved window is no longer what its note described", () => {
  // Nothing needs to have witnessed the move: the manager's own unmaximize
  // and move-to keys, a script, another extension. Where the window is now
  // is the only evidence needed.
  const state = readPushState(false, MOVED, note("left"), "none");

  assert.deepEqual(state, { mode: "none", standing: false });
});

test("unmaximizing behind Tiler's back falls back to the manager", () => {
  // Super+Up twice truly maximizes and notes it. Alt+F5 is still the
  // manager's key: the window restores, the flags clear, and the note no
  // longer matches the frame. The next push must start from what the
  // manager says, not from a maximize that is no longer there.
  const state = readPushState(false, MOVED, note("maximized"), "none");

  assert.deepEqual(state, { mode: "none", standing: false });
});

test("a gapped maximize is still maximized to the shortcuts", () => {
  // With gaps or reserved space the whole screen is a plain placement, not
  // a flagged maximize, so it must be recognised by the note alone.
  const state = readPushState(false, { ...PLACED }, note("maximized"), "none");

  assert.deepEqual(state, { mode: "maximized", standing: true });
});

test("the maximize flags outrank both the note and the manager", () => {
  assert.equal(
    readPushState(true, MOVED, note("left"), "none").mode,
    "maximized",
  );
  assert.equal(readPushState(true, MOVED, null, "left").mode, "maximized");
});

test("a maximized window keeps its note standing for the size it saved", () => {
  // The note's position is bypassed while the flags speak, but dropping it
  // would lose the size the cycle started from.
  const state = readPushState(true, MOVED, note("left"), "none");

  assert.equal(state.standing, true);
});

test("with no note the manager's memory answers", () => {
  assert.deepEqual(readPushState(false, MOVED, null, "right"), {
    mode: "right",
    standing: false,
  });
  assert.deepEqual(readPushState(false, MOVED, null, "none"), {
    mode: "none",
    standing: false,
  });
});
