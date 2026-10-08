// Tests for turning the chooser's logical pixels into the device pixels an
// arrangement works in. Every expected value was worked out by hand: at a
// scale of 2 each named length doubles and nothing else changes.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import { toDevice } from "../src/engine/logical";

const settings = {
    windowWidth: 960,
    offsetAcross: 95,
    marginUp: -130,
    corner: "top-left",
    spread: false,
};

test("at a scale of 2 the named lengths double, negative ones too", () => {
    deepEqual(
        toDevice(settings, ["windowWidth", "offsetAcross", "marginUp"], 2),
        { ...settings, windowWidth: 1920, offsetAcross: 190, marginUp: -260 },
    );
});

test("at a scale of 1 nothing changes", () => {
    deepEqual(toDevice(settings, ["windowWidth", "offsetAcross"], 1), settings);
});

test("a length not named is left in logical pixels", () => {
    deepEqual(toDevice(settings, ["windowWidth"], 2), {
        ...settings,
        windowWidth: 1920,
    });
});
