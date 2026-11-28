// Tests for the digit row read by the place a key sits, so a preset runs
// from the 1 key on a layout that types & there. The codes are the ones
// Clutter reports for the digit row of a standard keyboard.

import { test } from "node:test";
import { equal } from "node:assert/strict";

import { rowDigit } from "../src/engine/digit-row";

test("the row's keys from 1 to 9 name their digits", () => {
    equal(rowDigit(10), 1);
    equal(rowDigit(14), 5);
    equal(rowDigit(18), 9);
});

test("the 0 key, Escape and a key sent with no place name no digit", () => {
    equal(rowDigit(19), 0);
    equal(rowDigit(9), 0);
    equal(rowDigit(0), 0);
});
