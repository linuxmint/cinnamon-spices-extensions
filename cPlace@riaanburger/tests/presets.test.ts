// Tests for the preset store: saving a preset into an arrangement's
// digits, deleting one, and reading back a store that is not one.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import { parsePresets, withoutPreset, withPreset } from "../src/engine/presets";

test("a preset is saved into its arrangement's digit, beside the others", () => {
    deepEqual(
        withPreset({ cascade: { "1": { a: 1 } } }, "cascade", 2, { b: 2 }),
        { cascade: { "1": { a: 1 }, "2": { b: 2 } } },
    );
    deepEqual(withPreset({}, "grid", 3, { c: 3 }), { grid: { "3": { c: 3 } } });
});

test("a deleted preset leaves its arrangement's others and every other arrangement", () => {
    deepEqual(
        withoutPreset(
            { cascade: { "1": { a: 1 }, "2": { b: 2 } }, grid: { "1": {} } },
            "cascade",
            1,
        ),
        { cascade: { "2": { b: 2 } }, grid: { "1": {} } },
    );
});

test("an arrangement's last deleted preset takes the arrangement out of the store", () => {
    deepEqual(
        withoutPreset(
            { cascade: { "1": { a: 1 } }, grid: { "1": {} } },
            "cascade",
            1,
        ),
        { grid: { "1": {} } },
    );
});

test("deleting a digit with no preset changes nothing", () => {
    const store = { cascade: { "1": { a: 1 } } };
    deepEqual(withoutPreset(store, "cascade", 5), store);
    deepEqual(withoutPreset(store, "grid", 1), store);
});

test("a store that does not parse reads as empty", () => {
    deepEqual(parsePresets("not json"), {});
    deepEqual(parsePresets("null"), {});
    deepEqual(parsePresets("[1, 2]"), {});
    deepEqual(parsePresets('{"cascade":{}}'), { cascade: {} });
});

test("a store shaped wrong keeps only the presets shaped right", () => {
    deepEqual(
        parsePresets(
            JSON.stringify({
                cascade: { "1": null, "2": { a: 1 }, "0": {}, "10": {}, x: {} },
                grid: 5,
                columns: [{ count: 2 }],
                recorded: { "3": [1], "4": { entries: [] } },
            }),
        ),
        { cascade: { "2": { a: 1 } }, recorded: { "4": { entries: [] } } },
    );
});
