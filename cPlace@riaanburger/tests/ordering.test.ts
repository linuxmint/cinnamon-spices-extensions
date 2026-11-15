// Tests for the order the ticked windows cross the contract in: titles,
// applications sent to the end, and the focused window leading. Each case
// is worked by hand, the expected order written as the titles it gives.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import type { Orderable } from "../src/engine/ordering";
import { ordered } from "../src/engine/ordering";

function window(title: string, app: string, focused = false): Orderable {
    return { title, app, focused };
}

/** The titles in the order given, which reads better than indices. */
function titles(
    windows: Orderable[],
    last: string[],
    focusedFirst = false,
): string[] {
    return ordered(windows, { last, focusedFirst }).map(
        (i) => windows[i]?.title ?? "?",
    );
}

const desk = [
    window("Notes", "code"),
    window("GitHub", "firefox"),
    window("cPlace", "code"),
    window("Docs", "firefox"),
    window("Email", "code"),
    window("bash", "terminal"),
];

test("with no rules the order is the titles', case and accent insensitive", () => {
    deepEqual(titles(desk, []), [
        "bash",
        "cPlace",
        "Docs",
        "Email",
        "GitHub",
        "Notes",
    ]);
    deepEqual(
        titles(
            [window("éclair", "a"), window("Echo", "a"), window("ear", "a")],
            [],
        ),
        ["ear", "Echo", "éclair"],
    );
});

test("titles alike but for case and accent tie, keeping the order they came in", () => {
    deepEqual(
        titles(
            [window("Résumé", "a"), window("resume", "b"), window("RESUME", "c")],
            [],
        ),
        ["Résumé", "resume", "RESUME"],
    );
    deepEqual(
        titles([window("resume", "a"), window("Résumé", "b")], []),
        ["resume", "Résumé"],
    );
});

test("an application sent to the end follows every other window, in title order", () => {
    deepEqual(titles(desk, ["firefox"]), [
        "bash",
        "cPlace",
        "Email",
        "Notes",
        "Docs",
        "GitHub",
    ]);
});

test("two applications sent to the end share it in one title order", () => {
    deepEqual(titles(desk, ["firefox", "terminal"]), [
        "cPlace",
        "Email",
        "Notes",
        "bash",
        "Docs",
        "GitHub",
    ]);
});

test("sending an application with no window here, or every one, keeps the titles' order", () => {
    const plain = titles(desk, []);
    deepEqual(titles(desk, ["nautilus"]), plain);
    deepEqual(titles(desk, ["code", "firefox", "terminal"]), plain);
});

test("the focused window leads when the rules ask, and only then", () => {
    const focused = desk.map((entry) =>
        entry.title === "GitHub" ? { ...entry, focused: true } : entry,
    );
    deepEqual(titles(focused, [], true), [
        "GitHub",
        "bash",
        "cPlace",
        "Docs",
        "Email",
        "Notes",
    ]);
    deepEqual(titles(focused, []), titles(desk, []));
    deepEqual(titles(desk, [], true), titles(desk, []));
});

test("no windows give no order", () => {
    deepEqual(ordered([], { last: ["firefox"], focusedFirst: true }), []);
});
