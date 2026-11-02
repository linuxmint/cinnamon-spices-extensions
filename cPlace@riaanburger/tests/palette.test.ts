// Tests for the chooser's colours: the second colour turned from the
// accent, the form St reads colours back from, and the rules written from a
// theme's colours, which may use no colour the theme did not give. The
// accents are the ones Mint-Y-Aqua, Cinnamon's default theme and Mint-Y-Grey
// draw their snap preview in, and each complement is worked by hand: every
// channel reflected between the largest and the smallest.

import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";

import type { Paint, Rgba, ThemeColours } from "../src/engine/palette";
import { colourSheet } from "../src/engine/colour-rules";
import { complement, css } from "../src/engine/palette";

function rgba(red: number, green: number, blue: number, alpha = 255): Rgba {
    return { red, green, blue, alpha };
}

const transparent = rgba(0, 0, 0, 0);

function paint(fill: Rgba, border: Rgba, text: Rgba): Paint {
    return { fill, border, text };
}

/** A dark theme with an aqua accent, every colour a different one so a
 * rule shows which it took. */
function aquaTheme(): ThemeColours {
    const text = rgba(225, 225, 225);
    return {
        text,
        dim: rgba(225, 225, 225, 128),
        landing: paint(rgba(31, 158, 222, 76), rgba(31, 158, 222), text),
        landingStrong: paint(rgba(31, 158, 222, 153), rgba(31, 158, 222), text),
        screen: paint(rgba(34, 34, 38), rgba(225, 225, 225, 51), text),
        window: paint(rgba(255, 255, 255, 25), rgba(255, 255, 255, 38), text),
        activeWindow: paint(
            rgba(255, 255, 255, 76),
            rgba(255, 255, 255, 89),
            text,
        ),
        button: paint(rgba(48, 48, 54), rgba(48, 48, 55), text),
        buttonHover: paint(rgba(73, 73, 81), rgba(48, 48, 56), text),
        entry: paint(rgba(48, 48, 57), rgba(48, 48, 58), rgba(211, 211, 211)),
        entryFocus: paint(rgba(48, 48, 59), rgba(31, 158, 222), text),
        rowHover: paint(rgba(48, 48, 60), transparent, rgba(255, 255, 255)),
        destructive: paint(rgba(192, 28, 40), rgba(192, 28, 41), text),
    };
}

/** The declarations of the rule whose selector list begins with this
 * selector under the sheet's scope, whole: followed by its brace or by the
 * next in the list. */
function rule(theme: ThemeColours, selector: string): string {
    const { scope, rules } = colourSheet(theme);
    const scoped = `.${scope} ${selector}`;
    const escaped = scoped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const start = rules.search(new RegExp(`(^|\\n)${escaped}[ ,]`));
    ok(start >= 0, `no rule for ${selector}`);
    return rules.slice(start, rules.indexOf("}", start));
}

test("the complement turns Mint-Y-Aqua's accent to its orange", () => {
    deepEqual(complement(rgba(31, 158, 222)), rgba(222, 95, 31));
});

test("the complement of Cinnamon's default blue keeps its lightness", () => {
    deepEqual(complement(rgba(120, 174, 237, 51)), rgba(237, 183, 120, 51));
});

test("a grey's complement is still a grey, and black and white are their own", () => {
    deepEqual(complement(rgba(112, 115, 122)), rgba(122, 119, 112));
    deepEqual(complement(rgba(0, 0, 0)), rgba(0, 0, 0));
    deepEqual(complement(rgba(255, 255, 255)), rgba(255, 255, 255));
});

test("a colour is written with its opacity to four places", () => {
    equal(css(rgba(31, 158, 222, 76)), "rgba(31, 158, 222, 0.2980)");
    equal(css(rgba(0, 0, 0, 0)), "rgba(0, 0, 0, 0.0000)");
});

test("the slots take the snap preview's colours, the end its complement", () => {
    const theme = aquaTheme();
    const slot = rule(theme, ".cplace-preview-slot");
    ok(slot.includes("background-color: rgba(31, 158, 222, 0.2980)"));
    ok(slot.includes("border-color: rgba(31, 158, 222, 1.0000)"));
    const end = rule(theme, ".cplace-preview-slot-end");
    ok(end.includes("background-color: rgba(222, 95, 31, 0.6000)"));
    ok(end.includes("border-color: rgba(222, 95, 31, 1.0000)"));
    const lit = rule(theme, ".cplace-end-toggle:checked");
    ok(lit.includes("background-color: rgba(222, 95, 31, 0.6000)"));
});

test("an armed row takes the destructive button's colours", () => {
    const armed = rule(aquaTheme(), ".cplace-preset-row.cplace-preset-armed");
    ok(armed.includes("background-color: rgba(192, 28, 40, 1.0000)"));
    ok(armed.includes("color: rgba(225, 225, 225, 1.0000)"));
});

test("a theme with no snap preview has its slots outlined in its text", () => {
    const theme = aquaTheme();
    theme.landing = paint(transparent, transparent, theme.text);
    const slot = rule(theme, ".cplace-preview-slot");
    ok(slot.includes("border-color: rgba(225, 225, 225, 1.0000)"));
});

test("a snap preview with a fill and no border outlines in its fill, made solid", () => {
    const theme = aquaTheme();
    theme.landing = paint(rgba(31, 158, 222, 76), transparent, theme.text);
    for (const selector of [
        ".cplace-area-outline",
        ".cplace-preview-missing",
        ".cplace-corner-active",
    ]) {
        const edge = rule(theme, selector);
        ok(edge.includes("border-color: rgba(31, 158, 222, 1.0000)"), selector);
    }
});

test("a theme with no dimmed text dims nothing", () => {
    const theme = aquaTheme();
    theme.dim = transparent;
    const corner = rule(theme, ".cplace-corner");
    ok(corner.includes("border-color: rgba(225, 225, 225, 1.0000)"));
});

test("every colour the rules write is the theme's or turned from it", () => {
    const theme = aquaTheme();
    const given: Rgba[] = [theme.text, theme.dim];
    const values: (Rgba | Paint)[] = Object.values(theme);
    for (const value of values) {
        if ("fill" in value) {
            given.push(value.fill, value.border, value.text);
        }
    }
    const turned = [theme.landing, theme.landingStrong].flatMap((shape) => [
        complement(shape.fill),
        complement(shape.border),
    ]);
    const allowed = new Set([...given, ...turned].map(css));
    const written = colourSheet(theme).rules.match(/rgba\([^)]*\)/g) ?? [];
    ok(written.length > 30);
    for (const colour of written) {
        ok(allowed.has(colour), `${colour} is no colour of the theme's`);
    }
});

test("every rule sits under a scope named for its colours", () => {
    const aqua = colourSheet(aquaTheme());
    const selectors = aqua.rules
        .split("\n")
        .filter((line) => line.endsWith("{"))
        .flatMap((line) => line.slice(0, -2).split(", "));
    ok(selectors.length > 30);
    for (const selector of selectors) {
        ok(selector.startsWith(`.${aqua.scope} .cplace-`), selector);
    }
    equal(colourSheet(aquaTheme()).scope, aqua.scope);
    const other = aquaTheme();
    other.landing = paint(rgba(12, 117, 222, 76), rgba(12, 117, 222), other.text);
    ok(colourSheet(other).scope !== aqua.scope);
});

test("a theme whose hovers are gradients highlights rows with its accent", () => {
    const theme = aquaTheme();
    theme.rowHover = paint(transparent, transparent, theme.text);
    theme.buttonHover = paint(transparent, transparent, theme.text);
    const row = rule(theme, ".cplace-preset-row:hover");
    ok(row.includes("background-color: rgba(31, 158, 222, 0.2980)"));
    const step = rule(theme, ".cplace-spin-button:hover");
    ok(step.includes("background-color: rgba(31, 158, 222, 0.2980)"));
});

test("a theme with no destructive colour arms a row in its highlight", () => {
    const theme = aquaTheme();
    theme.destructive = paint(transparent, transparent, theme.text);
    const armed = rule(theme, ".cplace-preset-row.cplace-preset-armed");
    ok(armed.includes("background-color: rgba(48, 48, 60, 1.0000)"));
});

test("a theme whose entries show no focus lights the spin in its accent", () => {
    const theme = aquaTheme();
    theme.entryFocus = paint(transparent, transparent, theme.text);
    theme.entry = paint(transparent, transparent, theme.text);
    const focused = rule(theme, ".cplace-spin:focus");
    ok(focused.includes("border-color: rgba(31, 158, 222, 1.0000)"));
    const frame = rule(theme, ".cplace-spin");
    ok(frame.includes("border-color: rgba(225, 225, 225, 0.2000)"));
});

test("a grid cell lights with the row's highlight where windows never do", () => {
    const theme = aquaTheme();
    theme.activeWindow = theme.window;
    const cell = rule(theme, ".cplace-grid-cell:hover");
    ok(cell.includes("background-color: rgba(48, 48, 60, 1.0000)"));
});
