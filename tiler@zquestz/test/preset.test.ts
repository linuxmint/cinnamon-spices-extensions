import test from "node:test";
import assert from "node:assert/strict";

import {
  layoutText,
  parseLayout,
  toPreset,
  uniformLayout,
} from "../src/preset.ts";

test("reads a count on each side as that many equal tracks", () => {
  assert.deepEqual(parseLayout("3x2"), { cols: [1, 1, 1], rows: [1, 1] });
  assert.deepEqual(parseLayout("1x1"), { cols: [1], rows: [1] });
  assert.deepEqual(parseLayout("6x6"), {
    cols: [1, 1, 1, 1, 1, 1],
    rows: [1, 1, 1, 1, 1, 1],
  });
});

test("reads sizes given one by one", () => {
  assert.deepEqual(parseLayout("1,2,1 x 1,1"), {
    cols: [1, 2, 1],
    rows: [1, 1],
  });
});

test("lets each side be written its own way", () => {
  assert.deepEqual(parseLayout("3 x 1,2"), { cols: [1, 1, 1], rows: [1, 2] });
  assert.deepEqual(parseLayout("1,2 x 2"), { cols: [1, 2], rows: [1, 1] });
});

test("does not mind spacing or capitals", () => {
  const expected = { cols: [1, 1, 1], rows: [1, 1] };

  assert.deepEqual(parseLayout("3x2"), expected);
  assert.deepEqual(parseLayout("  3  X  2  "), expected);
  assert.deepEqual(parseLayout("3X2"), expected);
  assert.deepEqual(parseLayout("1, 1 , 1 x 1 ,1"), expected);
});

test("takes sizes that are not whole numbers", () => {
  assert.deepEqual(parseLayout("1,1.5 x 1"), { cols: [1, 1.5], rows: [1] });
  assert.deepEqual(parseLayout("1,1.618 x 1"), {
    cols: [1, 1.618],
    rows: [1],
  });
});

test("refuses a layout it cannot make sense of", () => {
  for (const bad of [
    "",
    "3",
    "3x",
    "x2",
    "3x2x1",
    "banana",
    "3 x two",
    "0x2",
    "3x0",
    "-1x2",
    "1,-2,1 x 1",
    "1,0,1 x 1",
    "1.5x2",
    "999x2",
    "17x2",
    "2x17",
    "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1 x 1",
  ]) {
    assert.equal(parseLayout(bad), null, JSON.stringify(bad));
  }
});

test("refuses anything that is not text at all", () => {
  assert.equal(parseLayout(undefined as unknown as string), null);
  assert.equal(parseLayout(7 as unknown as string), null);
});

test("writes a grid of equal tracks the short way", () => {
  assert.equal(uniformLayout(3, 2), "3x2");
  assert.equal(uniformLayout(1, 1), "1x1");
  assert.equal(uniformLayout(0, -4), "1x1", "never less than one track");
  assert.equal(uniformLayout(2.7, 2.2), "2x2", "whole tracks only");
});

test("writes a grid out in full", () => {
  assert.equal(layoutText({ cols: [1, 2, 1], rows: [1, 1] }), "1,2,1 x 1,1");
  assert.equal(layoutText({ cols: [1], rows: [1] }), "1 x 1");
});

test("what it writes, it can read again", () => {
  for (const grid of [
    { cols: [1, 1, 1], rows: [1, 1] },
    { cols: [1, 2, 1], rows: [1, 1] },
    { cols: [1, 1.5], rows: [2, 1] },
  ]) {
    assert.deepEqual(parseLayout(layoutText(grid)), grid);
  }
});

test("a preset takes its grid from the layout", () => {
  const preset = toPreset(3, 2, "1,2,1 x 1,1", "", "");

  assert.deepEqual(preset.grid, { cols: [1, 2, 1], rows: [1, 1] });
});

test("a layout that cannot be read falls back on the numbers", () => {
  const preset = toPreset(3, 2, "banana", "", "");

  assert.deepEqual(preset.grid, { cols: [1, 1, 1], rows: [1, 1] });
  assert.equal(preset.label, "3x2");
});

test("an empty layout falls back on the numbers too", () => {
  assert.deepEqual(toPreset(4, 4, "", "", "").grid, {
    cols: [1, 1, 1, 1],
    rows: [1, 1, 1, 1],
  });
});

test("a preset is named after its size unless it is given a name", () => {
  assert.equal(toPreset(3, 2, "3x2", "", "").label, "3x2");
  assert.equal(toPreset(3, 2, "1,2,1 x 1,1", "", "").label, "3x2");
  assert.equal(toPreset(3, 2, "3x2", "Dev", "").label, "Dev");
  assert.equal(toPreset(3, 2, "3x2", "   ", "").label, "3x2", "blank is no name");
  assert.equal(toPreset(3, 2, "3x2", "  Dev  ", "").label, "Dev", "tidied up");
});

test("a preset says nothing on hover unless it is given something to say", () => {
  assert.equal(toPreset(3, 2, "3x2", "", "").tooltip, "");
  assert.equal(toPreset(3, 2, "3x2", "", "editor and terminal").tooltip,
    "editor and terminal");
  assert.equal(toPreset(3, 2, "3x2", "", "   ").tooltip, "");
});

test("a preset survives settings of the wrong kind entirely", () => {
  const preset = toPreset(
    NaN,
    undefined as unknown as number,
    null as unknown as string,
    42 as unknown as string,
    {} as unknown as string,
  );

  assert.deepEqual(preset.grid, { cols: [1], rows: [1] });
  assert.equal(preset.label, "1x1");
  assert.equal(preset.tooltip, "");
});
