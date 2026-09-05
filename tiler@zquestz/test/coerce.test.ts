import test from "node:test";
import assert from "node:assert/strict";

import { toBoolean, toFinite, toKeybinding, toSize } from "../src/coerce.ts";

/**
 * These are the boundary the settings file crosses. A settings file is plain
 * JSON on disk that anyone may edit, and an extension that throws can take
 * the session down with it, so what matters here is that nothing gets past
 * as the wrong type, whatever it arrives as.
 */

/** The values a hand-edited or corrupted settings file can realistically hold. */
const HOSTILE: unknown[] = [
  undefined,
  null,
  NaN,
  Infinity,
  -Infinity,
  "",
  "12",
  "wide",
  "false",
  "true",
  0,
  -1,
  {},
  [],
  [1, 2],
  { valueOf: () => 42 },
  () => 12,
  true,
  false,
];

test("a number that is not a number counts as nothing", () => {
  assert.equal(toFinite(NaN), 0);
  assert.equal(toFinite(Infinity), 0);
  assert.equal(toFinite(-Infinity), 0);
  assert.equal(toFinite(undefined as unknown as number), 0);
  assert.equal(toFinite(null as unknown as number), 0);
  assert.equal(
    toFinite("12" as unknown as number),
    0,
    "a string is not a number",
  );
});

test("a number that is a number is left alone", () => {
  for (const value of [0, 1, -1, 12.5, 2560, -0.5]) {
    assert.equal(toFinite(value), value);
  }
});

test("a size is never negative", () => {
  assert.equal(toSize(-1), 0);
  assert.equal(toSize(-2560), 0);
  assert.equal(toSize(-0.5), 0);
});

test("a size keeps what it is given otherwise", () => {
  assert.equal(toSize(0), 0);
  assert.equal(toSize(10), 10);
  assert.equal(
    toSize(12.5),
    12.5,
    "rounding belongs to the geometry, not here",
  );
});

test("a size that makes no sense is nothing rather than something", () => {
  assert.equal(toSize(NaN), 0);
  assert.equal(toSize(Infinity), 0);
  assert.equal(toSize("50" as unknown as number), 0);
});

test("only a real boolean counts as on", () => {
  assert.equal(toBoolean(true), true);
  assert.equal(toBoolean(false), false);
  // The one that matters: a settings file holding the word "false" would
  // otherwise switch a feature on.
  assert.equal(toBoolean("false" as unknown as boolean), false);
  assert.equal(toBoolean("true" as unknown as boolean), false);
  assert.equal(toBoolean(1 as unknown as boolean), false);
  assert.equal(toBoolean(0 as unknown as boolean), false);
  assert.equal(
    toBoolean({} as unknown as boolean),
    false,
    "an object is not on",
  );
  assert.equal(toBoolean([] as unknown as boolean), false, "nor is a list");
});

test("a keybinding that is not text is no keybinding", () => {
  assert.equal(toKeybinding(undefined as unknown as string), "");
  assert.equal(toKeybinding(null as unknown as string), "");
  assert.equal(toKeybinding(12 as unknown as string), "");
  assert.equal(toKeybinding({} as unknown as string), "");
});

test("a keybinding that is text is passed through untouched", () => {
  // Whether it can be parsed is Cinnamon's business; this only settles type.
  for (const value of ["<Super>t", "", "  ", "nonsense"]) {
    assert.equal(toKeybinding(value), value);
  }
});

test("nothing hostile gets past as the wrong type", () => {
  for (const value of HOSTILE) {
    const where = JSON.stringify(value) ?? String(value);

    assert.equal(typeof toFinite(value as number), "number", where);
    assert.ok(Number.isFinite(toFinite(value as number)), where);

    const size = toSize(value as number);
    assert.ok(Number.isFinite(size) && size >= 0, `${where} is a usable size`);

    assert.equal(typeof toBoolean(value as boolean), "boolean", where);
    assert.equal(typeof toKeybinding(value as string), "string", where);
  }
});

test("nothing hostile makes any of them throw", () => {
  for (const value of HOSTILE) {
    assert.doesNotThrow(
      () => {
        toFinite(value as number);
        toSize(value as number);
        toBoolean(value as boolean);
        toKeybinding(value as string);
      },
      JSON.stringify(value) ?? String(value),
    );
  }
});
