// Tests for the window list's ticks: applications ticking their windows,
// windows completing their application's tick, the one window a page's
// focus rule may leave out, and windows on another monitor, which stand
// apart. Every expected tick was worked out by hand
// before the model first ran.

import { test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";

import type { TickedWindow } from "../src/engine/ticks";
import { Ticks } from "../src/engine/ticks";

/** Windows keyed in order, from their applications' ids, all on the
 * monitor arranged on. */
function windows(...appIds: (string | null)[]): TickedWindow[] {
    return appIds.map((appId, key) => ({ key, appId, here: true }));
}

/** Windows keyed in order, each an application's id and whether it stands
 * on the monitor arranged on. */
function placed(...entries: [string, boolean][]): TickedWindow[] {
    return entries.map(([appId, here], key) => ({ key, appId, here }));
}

function ticked(ticks: Ticks, count: number): boolean[] {
    return Array.from({ length: count }, (_, index) => ticks.isTicked(index));
}

test("the seeded applications' windows arrive ticked, the rest unticked", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "firefox", "code", null));
    deepEqual(ticked(ticks, 4), [true, false, true, false]);
    deepEqual(ticks.apps(), ["code"]);
});

test("an application's tick ticks all its windows and nothing else", () => {
    const ticks = new Ticks([]);
    ticks.gather(windows("code", "firefox", "code"));
    deepEqual(ticks.tickApp("code", true), [0, 2]);
    deepEqual(ticked(ticks, 3), [true, false, true]);
    equal(ticks.isAppTicked("code"), true);
    deepEqual(ticks.tickApp("code", false), [0, 2]);
    deepEqual(ticked(ticks, 3), [false, false, false]);
});

test("a window's own tick completes its application's, and an untick breaks it", () => {
    const ticks = new Ticks([]);
    ticks.gather(windows("code", "code"));
    deepEqual(ticks.tickWindow(0, true), { appId: "code", allTicked: false });
    deepEqual(ticks.tickWindow(1, true), { appId: "code", allTicked: true });
    equal(ticks.isAppTicked("code"), true);
    deepEqual(ticks.tickWindow(0, false), { appId: "code", allTicked: false });
    equal(ticks.isAppTicked("code"), false);
});

test("a window with no application ticks alone", () => {
    const ticks = new Ticks([]);
    ticks.gather(windows(null));
    equal(ticks.tickWindow(0, true), null);
    equal(ticks.isTicked(0), true);
});

test("the focus rule leaves a window out, and the application's tick passes it by", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "code"));
    ticks.rule(0, true);
    deepEqual(ticked(ticks, 2), [false, true]);
    deepEqual(ticks.tickApp("code", true), [1]);
    equal(ticks.isTicked(0), false);
    // With the one left out unticked, the application still counts whole.
    deepEqual(ticks.tickWindow(1, true), { appId: "code", allTicked: true });
});

test("a window let back in by the focus rule takes its application's tick", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "firefox"));
    ticks.rule(0, true);
    ticks.rule(0, false);
    ticks.rule(1, false);
    deepEqual(ticked(ticks, 2), [true, false]);
});

test("a hand on the left-out window's tick overrides the rule", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "code"));
    ticks.rule(0, true);
    ticks.tickWindow(0, true);
    ticks.tickApp("code", false);
    deepEqual(ticked(ticks, 2), [false, false]);
    deepEqual(ticks.tickApp("code", true), [0, 1]);
});

test("a preset's applications replace the ticked ones for the next gathering", () => {
    const ticks = new Ticks(["code"]);
    ticks.setApps(["firefox"]);
    ticks.gather(windows("code", "firefox"));
    deepEqual(ticked(ticks, 2), [false, true]);
    deepEqual(ticks.apps(), ["firefox"]);
});

test("a new gathering keeps each window's tick and seeds only the new ones", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "code"));
    ticks.tickWindow(0, false);
    // Minimised windows join, and the stacking puts the first window last.
    ticks.gather([
        { key: 1, appId: "code", here: true },
        { key: 2, appId: "code", here: true },
        { key: 0, appId: "code", here: true },
    ]);
    // Window 1 keeps its tick and window 0 its untick; window 2 is new, and
    // takes its application's tick, which went off with window 0's.
    deepEqual(ticked(ticks, 3), [true, false, false]);
});

test("a preset's scope still replaces the ticks wholesale", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "code"));
    ticks.tickWindow(0, false);
    ticks.setApps(["code"]);
    ticks.gather(windows("code", "code"));
    deepEqual(ticked(ticks, 2), [true, true]);
});

test("the focus rule's mark follows its window into a new gathering", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(windows("code", "code"));
    ticks.rule(0, true);
    ticks.gather([
        { key: 1, appId: "code", here: true },
        { key: 0, appId: "code", here: true },
    ]);
    deepEqual(ticked(ticks, 2), [true, false]);
    // Ticking the application still passes the left-out window by.
    deepEqual(ticks.tickApp("code", true), [0]);
    equal(ticks.isTicked(1), false);
});

test("a window's hand tick comes back with it after a gathering that left it out", () => {
    const ticks = new Ticks([]);
    ticks.gather(windows("code", "code"));
    ticks.tickWindow(1, true);
    // The minimised toggle hides window 1, then shows it again.
    ticks.gather(windows("code"));
    ticks.gather(windows("code", "code"));
    deepEqual(ticked(ticks, 2), [false, true]);
});

test("an application's tick reaches its windows a gathering has left out", () => {
    const ticks = new Ticks([]);
    ticks.gather(windows("code", "code"));
    ticks.tickWindow(1, true);
    ticks.gather(windows("code"));
    ticks.tickApp("code", false);
    ticks.gather(windows("code", "code"));
    deepEqual(ticked(ticks, 2), [false, false]);
});

test("a window on another monitor arrives unticked though its application is seeded", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(placed(["code", true], ["code", false], ["firefox", false]));
    deepEqual(ticked(ticks, 3), [true, false, false]);
    equal(ticks.isAppTicked("code"), true);
});

test("an application's tick passes its windows on another monitor by", () => {
    const ticks = new Ticks([]);
    ticks.gather(placed(["code", true], ["code", false], ["code", true]));
    deepEqual(ticks.tickApp("code", true), [0, 2]);
    deepEqual(ticked(ticks, 3), [true, false, true]);
});

test("a window on another monitor ticks alone and leaves its application's tick be", () => {
    const ticks = new Ticks(["code"]);
    ticks.gather(placed(["code", true], ["code", false]));
    equal(ticks.tickWindow(1, true), null);
    deepEqual(ticked(ticks, 2), [true, true]);
    equal(ticks.isAppTicked("code"), true);
});

test("an application's windows here complete its tick without those elsewhere", () => {
    const ticks = new Ticks([]);
    ticks.gather(placed(["code", true], ["code", false]));
    deepEqual(ticks.tickWindow(0, true), { appId: "code", allTicked: true });
    equal(ticks.isAppTicked("code"), true);
    deepEqual(ticked(ticks, 2), [true, false]);
});

test("a preset's applications tick only the windows on the monitor arranged on", () => {
    const ticks = new Ticks([]);
    ticks.gather(placed(["code", false], ["code", true]));
    ticks.setApps(["code"]);
    ticks.gather(placed(["code", false], ["code", true]));
    deepEqual(ticked(ticks, 2), [false, true]);
});
