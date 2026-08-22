import test from "node:test";
import assert from "node:assert/strict";

import { getUsableArea, hasReserved } from "../src/workarea.ts";
import type { Reserved } from "../src/workarea.ts";
import type { Rect } from "../src/geometry.ts";

/** The work area of a 2560x1440 screen with a 40 pixel panel at the bottom. */
const WORK_AREA: Rect = { x: 0, y: 0, width: 2560, height: 1400 };

const reserve = (sides: Partial<Reserved>): Reserved => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  ...sides,
});

test("uses the work area as it stands when nothing is reserved", () => {
  assert.deepEqual(getUsableArea(WORK_AREA, null), WORK_AREA);
  assert.deepEqual(getUsableArea(WORK_AREA, reserve({})), WORK_AREA);
});

test("holds back space on the side it was asked to", () => {
  assert.deepEqual(getUsableArea(WORK_AREA, reserve({ top: 100 })), {
    x: 0,
    y: 100,
    width: 2560,
    height: 1300,
  });
  assert.deepEqual(getUsableArea(WORK_AREA, reserve({ bottom: 150 })), {
    x: 0,
    y: 0,
    width: 2560,
    height: 1250,
  });
  assert.deepEqual(getUsableArea(WORK_AREA, reserve({ left: 60 })), {
    x: 60,
    y: 0,
    width: 2500,
    height: 1400,
  });
  assert.deepEqual(getUsableArea(WORK_AREA, reserve({ right: 60 })), {
    x: 0,
    y: 0,
    width: 2500,
    height: 1400,
  });
});

test("holds back space on several sides at once", () => {
  const usable = getUsableArea(
    WORK_AREA,
    reserve({ top: 30, bottom: 150, left: 20, right: 10 }),
  );

  assert.deepEqual(usable, { x: 20, y: 30, width: 2530, height: 1220 });
});

test("keeps working on a monitor that does not start at the origin", () => {
  const second: Rect = { x: 2560, y: -240, width: 1920, height: 1080 };
  const usable = getUsableArea(second, reserve({ top: 40, left: 40 }));

  assert.deepEqual(usable, { x: 2600, y: -200, width: 1880, height: 1040 });
});

test("never reports a negative size, however much is reserved", () => {
  const small: Rect = { x: 0, y: 0, width: 800, height: 600 };
  const usable = getUsableArea(
    small,
    reserve({ top: 500, bottom: 500, left: 900, right: 900 }),
  );

  assert.equal(usable.width, 0);
  assert.equal(usable.height, 0);
});

test("has nothing to offer when the work area is empty", () => {
  const nothing: Rect = { x: 0, y: 0, width: 0, height: 0 };

  assert.deepEqual(getUsableArea(nothing, reserve({ top: 10 })), {
    x: 0,
    y: 10,
    width: 0,
    height: 0,
  });
});

test("knows whether any space is being held back", () => {
  assert.equal(hasReserved(null), false, "scope excludes this monitor");
  assert.equal(hasReserved(reserve({})), false, "nothing set");
  assert.equal(hasReserved(reserve({ top: 1 })), true);
  assert.equal(hasReserved(reserve({ bottom: 150 })), true);
  assert.equal(hasReserved(reserve({ left: 60 })), true);
  assert.equal(hasReserved(reserve({ right: 60 })), true);
});
