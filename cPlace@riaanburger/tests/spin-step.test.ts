// Tests for where a spin's plus and minus take its number: the next
// multiple of the step in the direction pressed, held to the bounds. Every
// expected number was worked out by hand before the function first ran.

import { test } from "node:test";
import { equal } from "node:assert/strict";

import { nextStep } from "../src/engine/spin-step";

const wide = { min: -3000, max: 10000 };

test("a number on a multiple moves by the whole step", () => {
    equal(nextStep(90, 10, 1, wide), 100);
    equal(nextStep(90, 10, -1, wide), 80);
    equal(nextStep(1500, 100, 1, wide), 1600);
});

test("a number between multiples moves to the nearer one on the side pressed", () => {
    // floor(9.5) = 9, so up is 100; ceil(9.5) = 10, so down is 90.
    equal(nextStep(95, 10, 1, wide), 100);
    equal(nextStep(95, 10, -1, wide), 90);
    // 94 was taken down to 80 when the step was added and then rounded.
    equal(nextStep(94, 10, -1, wide), 90);
    // 1460 was taken up to 1600 the same way.
    equal(nextStep(1460, 100, 1, wide), 1500);
    equal(nextStep(1460, 100, -1, wide), 1400);
});

test("negative numbers step to their multiples as positive ones do", () => {
    // floor(-0.5) = -1, so up from -5 is -10 + 10 = 0; ceil(-0.5) = 0, so
    // down is -10.
    equal(nextStep(-5, 10, 1, wide), 0);
    equal(nextStep(-5, 10, -1, wide), -10);
});

test("a step of one moves by one, and the bounds hold", () => {
    equal(nextStep(7, 1, 1, wide), 8);
    equal(nextStep(7, 1, -1, wide), 6);
    equal(nextStep(95, 10, 1, { min: 0, max: 96 }), 96);
    equal(nextStep(3, 10, -1, { min: 0, max: 300 }), 0);
});
