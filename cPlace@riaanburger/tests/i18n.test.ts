// Tests for the helpers that put a translated phrase together: its named
// tokens put in, and phrases listed with commas.

import { test } from "node:test";
import { equal } from "node:assert/strict";

import { fill, listed } from "../src/i18n";

test("each named token is put in, wherever the phrase puts it", () => {
    equal(
        fill("{title} – {application}", {
            title: "Garden plan",
            application: "Text Editor",
        }),
        "Garden plan – Text Editor",
    );
    equal(fill("{width} × {height} × {width}", { width: 4, height: 3 }), "4 × 3 × 4");
});

test("a token with no value stays as written", () => {
    equal(fill("step {across} across", {}), "step {across} across");
});

test("phrases are listed with commas, an empty one left out", () => {
    equal(listed("", "1920 × 1040", "3 windows", ""), "1920 × 1040, 3 windows");
    equal(listed(), "");
});
