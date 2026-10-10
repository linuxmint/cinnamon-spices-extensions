// Contract tests for the cascade: input in, expected targets out, no desktop.
// Every expected number here was worked out by hand from the rule, anchor
// plus so many offsets, before the function first ran, so a disagreement
// between hand and function is a finding rather than a diff to paste over.
// The rule is set out beside the function, in src/arrangements/cascade.ts.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import type { ArrangementWindow, Rectangle } from "../src/arrangement";
import type { CascadeSettings } from "../src/arrangements/cascade";
import { cascade } from "../src/arrangements/cascade";

// The cascade reads no current frame, so the fixtures carry a placeholder.
function windowsWithIds(ids: number[]): ArrangementWindow[] {
    return ids.map((id) => ({
        id,
        frame: { x: 0, y: 0, width: 1, height: 1 },
    }));
}

// The work area of the desktop the golden layout was measured on, read from
// _NET_WORKAREA on 23 September 2026: a 3840 by 2160 monitor with a 36-pixel
// panel at the bottom. The settings are the measured layout's own, which
// were the defaults until the defaults took half the work area.
const goldenWorkArea: Rectangle = { x: 0, y: 0, width: 3840, height: 2124 };
const goldenSettings: CascadeSettings = {
    windowWidth: 1900,
    windowHeight: 1100,
    offsetAcross: 95,
    offsetUp: 70,
    marginAcross: 10,
    marginUp: 10,
    corner: "bottom-left",
    spread: false,
};

// Hand derivation. The anchor is (10, 2124 - 10 - 1100) = (10, 1014). The
// climb fits floor((1014 - 10) / 70) = 14 steps, so a column holds fifteen
// slots. The march fits floor((3840 - 10 - 1900 - 10) / 95) = 20 steps, so a
// cycle holds twenty-one slots and eighteen windows never restart it. Slot i
// therefore stands at (10 + 95 i, 1014 - 70 (i mod 15)).
const goldenSlots = [
    [10, 1014],
    [105, 944],
    [200, 874],
    [295, 804],
    [390, 734],
    [485, 664],
    [580, 594],
    [675, 524],
    [770, 454],
    [865, 384],
    [960, 314],
    [1055, 244],
    [1150, 174],
    [1245, 104],
    [1340, 34],
    [1435, 1014], // The column wraps: the climb restarts, the march does not.
    [1530, 944],
    [1625, 874],
] as const;

test("the golden eighteen climbs from the anchor, wraps at fifteen, and keeps its order", () => {
    const ids = Array.from({ length: 18 }, (_, i) => 200 + i);
    const targets = cascade({
        workArea: goldenWorkArea,
        windows: windowsWithIds(ids),
        settings: goldenSettings,
    });
    deepEqual(
        targets,
        goldenSlots.map(([x, y], i) => ({
            id: 200 + i,
            frame: { x, y, width: 1900, height: 1100 },
        })),
    );
});

test("an empty window list produces an empty target list", () => {
    const targets = cascade({
        workArea: goldenWorkArea,
        windows: [],
        settings: goldenSettings,
    });
    deepEqual(targets, []);
});

// A synthetic work area small enough to reach both wraps: 100-square windows
// at a 50 offset in 400 by 300, with a non-zero origin so an arrangement that
// assumes one fails here. The anchor is (30, 230). The climb fits
// floor(180 / 50) = 3 steps, so a column holds four slots; the march fits
// floor(280 / 50) = 5 steps, so a cycle holds six and the seventh window
// restarts the cascade from the anchor.
test("the climb wraps within the cycle, and the right edge restarts the cascade", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3, 4, 5, 6, 7, 8]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [30, 230],
            [80, 180],
            [130, 130],
            [180, 80],
            [230, 230], // The column wraps: the climb restarts, the march does not.
            [280, 180],
            [30, 230], // The march would cross the right edge: the cascade restarts.
            [80, 180],
        ],
    );
});

// The corner option mirrors the rule. From the top right the anchor is
// (3840 - 10 - 1900, 10) = (1930, 10), the march runs left and the climb
// runs down; the budgets match the golden case by symmetry, fifteen slots a
// column and twenty-one a cycle. Slot i stands at
// (1930 - 95 i, 10 + 70 (i mod 15)); sixteen windows wrap the climb once
// and never restart the march.
test("the top-right corner mirrors the cascade, wrapping its climb downward", () => {
    const ids = Array.from({ length: 16 }, (_, i) => i);
    const targets = cascade({
        workArea: goldenWorkArea,
        windows: windowsWithIds(ids),
        settings: { ...goldenSettings, corner: "top-right" },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [1930, 10],
            [1835, 80],
            [1740, 150],
            [1645, 220],
            [1550, 290],
            [1455, 360],
            [1360, 430],
            [1265, 500],
            [1170, 570],
            [1075, 640],
            [980, 710],
            [885, 780],
            [790, 850],
            [695, 920],
            [600, 990],
            [505, 10], // The column wraps: the climb restarts, the march does not.
        ],
    );
});

// Spread offsets in the small work area: the march budget is 290 and the
// climb budget 190, so window i of eight stands round(290 i / 7) across and
// round(190 i / 7) up from (30, 230), one straight diagonal with no wrap
// where the fixed case wrapped at the fifth window. The last stands exactly
// in the far corner, 290 and 190 from the anchor, its right edge on the
// work area's at 420 and its top on the work area's at 40.
test("spread offsets span one diagonal and never wrap", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3, 4, 5, 6, 7, 8]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: true,
        },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [30, 230],
            [71, 203],
            [113, 176],
            [154, 149],
            [196, 121],
            [237, 94],
            [279, 67],
            [320, 40],
        ],
    );
});

// Spread shares the whole budget however few the windows: three windows
// share it, 290 / 2 = 145 across and 190 / 2 = 95 up, so the last one sits
// in the far corner.
test("spread offsets carry three windows corner to corner", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: true,
        },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [30, 230],
            [175, 135],
            [320, 40],
        ],
    );
});

// Twenty-one windows 380 wide share a march of only 400 - 10 - 380 = 10
// pixels: window i stands round(10 i / 20) across and round(190 i / 20)
// up, half a pixel a window across, where one step floored to 0 would pile
// them all on the anchor. The anchor is (10, 190), the climb budget
// 300 - 10 - 100 = 190, so the second window stands at (11, 180), 0.5 and
// 9.5 rounding up, and the last at (20, 0), the far corner.
test("spread carries more windows than the march has pixels, the climb keeping them apart", () => {
    const ids = Array.from({ length: 21 }, (_, i) => i);
    const targets = cascade({
        workArea: { x: 0, y: 0, width: 400, height: 300 },
        windows: windowsWithIds(ids),
        settings: {
            windowWidth: 380,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: true,
        },
    });
    const corners = targets.map((target) => [target.frame.x, target.frame.y]);
    deepEqual(corners[0], [10, 190]);
    deepEqual(corners[1], [11, 180]);
    deepEqual(corners[20], [20, 0]);
    deepEqual(new Set(corners.map(([, y]) => y)).size, 21);
});

// With both budgets short, neighbours share a spot. The window leaves 10
// pixels each way, so the anchor is (10, 10) and window i moves
// round(10 i / 20) = round(i / 2) along both axes: windows 1 and 2 both
// stand at (11, 9), the last at (20, 0), and 21 windows take 11 spots.
test("spread piles neighbours when both axes have fewer pixels than windows", () => {
    const ids = Array.from({ length: 21 }, (_, i) => i);
    const targets = cascade({
        workArea: { x: 0, y: 0, width: 400, height: 300 },
        windows: windowsWithIds(ids),
        settings: {
            windowWidth: 380,
            windowHeight: 280,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: true,
        },
    });
    const corners = targets.map((target) => [target.frame.x, target.frame.y]);
    deepEqual(corners[0], [10, 10]);
    deepEqual(corners[1], [11, 9]);
    deepEqual(corners[2], [11, 9]);
    deepEqual(corners[20], [20, 0]);
    deepEqual(new Set(corners.map(([x, y]) => `${x},${y}`)).size, 11);
});

// A lone window stands on the anchor, as does every window on an axis whose
// budget is spent: a window as wide as the room less its margin leaves the
// march nothing, so three windows share x = 10 and climb 0, 45 and 90 from
// the anchor at y = 300 - 10 - 200 = 90.
test("spread keeps a lone window, and a spent axis, on the anchor", () => {
    const settings = {
        windowWidth: 390,
        windowHeight: 200,
        offsetAcross: 50,
        offsetUp: 50,
        marginAcross: 10,
        marginUp: 10,
        corner: "bottom-left" as const,
        spread: true,
    };
    const workArea = { x: 0, y: 0, width: 400, height: 300 };
    const lone = cascade({ workArea, windows: windowsWithIds([7]), settings });
    deepEqual(lone[0]?.frame, { x: 10, y: 90, width: 390, height: 200 });
    const three = cascade({
        workArea,
        windows: windowsWithIds([1, 2, 3]),
        settings,
    });
    deepEqual(
        three.map((target) => [target.frame.x, target.frame.y]),
        [
            [10, 90],
            [10, 45],
            [10, 0],
        ],
    );
});

// The margins belong to the anchor's two edges only, so margins of 40 in
// the small work area leave the climb 300 - 40 - 100 = 160, three steps and
// a column of four, where a margin on both edges would have allowed two
// steps; the march has 400 - 40 - 100 = 260, five steps. The anchor is
// (60, 200).
test("the margin keeps only the anchor's two edges", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3, 4, 5]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 40,
            marginUp: 40,
            corner: "bottom-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [60, 200],
            [110, 150],
            [160, 100],
            [210, 50],
            [260, 200], // The column wraps: the climb restarts, the march does not.
        ],
    );
});

// Negative margins pull the anchor past its edges: at -30 both the anchor is
// (-10, 270), the climb has 300 + 30 - 100 = 230, four steps, and the first
// window would run 30 past the left edge and 30 below the bottom. It is
// trimmed to the work area instead, 70 wide and 70 tall at (20, 270); the
// rest fit whole.
test("a negative margin pulls the cascade down and trims what would leave the work area", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3, 4, 5]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: -30,
            marginUp: -30,
            corner: "bottom-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => target.frame),
        [
            { x: 20, y: 270, width: 70, height: 70 },
            { x: 40, y: 220, width: 100, height: 100 },
            { x: 90, y: 170, width: 100, height: 100 },
            { x: 140, y: 120, width: 100, height: 100 },
            { x: 190, y: 70, width: 100, height: 100 },
        ],
    );
});

// The two margins are independent: 40 across and -30 up puts the anchor at
// (60, 270), the first window trimmed to 70 tall at the bottom edge and full
// width, the climb with 300 + 30 - 100 = 230 of room.
test("the across and up margins set their own edges", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: 40,
            marginUp: -30,
            corner: "bottom-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => target.frame),
        [
            { x: 60, y: 270, width: 100, height: 70 },
            { x: 110, y: 220, width: 100, height: 100 },
            { x: 160, y: 170, width: 100, height: 100 },
        ],
    );
});

// The mirror from the top left: the anchor at (-10, 10) sits past the left
// and top edges, so the first window is trimmed from those sides and keeps
// its far edges, 70 by 70 at (20, 40).
test("a negative margin from a top corner trims the top and left instead", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 50,
            marginAcross: -30,
            marginUp: -30,
            corner: "top-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => target.frame),
        [
            { x: 20, y: 40, width: 70, height: 70 },
            { x: 40, y: 60, width: 100, height: 100 },
            { x: 90, y: 110, width: 100, height: 100 },
        ],
    );
});

// A zero across offset, the zero up offset's mirror: the march goes
// nowhere, so the cycle never ends, and the windows climb in one column at
// the anchor's x. The climb fits floor(190 / 50) = 3 steps, a column of
// four, so the fifth window wraps back to the anchor's height.
test("a zero across offset climbs in one column without marching", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3, 4, 5, 6]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 0,
            offsetUp: 50,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [30, 230],
            [30, 180],
            [30, 130],
            [30, 80],
            [30, 230], // The column wraps: the climb restarts, as ever.
            [30, 180],
        ],
    );
});

// A zero up offset, so tall windows need not climb: the column holds one
// slot, so every window keeps the anchor's height and the cascade marches
// straight across.
test("a zero up offset marches across without climbing", () => {
    const targets = cascade({
        workArea: { x: 20, y: 40, width: 400, height: 300 },
        windows: windowsWithIds([1, 2, 3, 4]),
        settings: {
            windowWidth: 100,
            windowHeight: 100,
            offsetAcross: 50,
            offsetUp: 0,
            marginAcross: 10,
            marginUp: 10,
            corner: "bottom-left",
            spread: false,
        },
    });
    deepEqual(
        targets.map((target) => [target.frame.x, target.frame.y]),
        [
            [30, 230],
            [80, 230],
            [130, 230],
            [180, 230],
        ],
    );
});

// A window larger than the work area in both directions leaves every budget
// negative, so both counts clamp to one and every window stacks on the
// anchor, (10, 800 - 10 - 1100) = (10, -310); since nothing leaves the work
// area, each is then trimmed to it, 990 by 790 at (10, 0).
test("windows larger than the work area stack on the anchor, trimmed to the room", () => {
    const targets = cascade({
        workArea: { x: 0, y: 0, width: 1000, height: 800 },
        windows: windowsWithIds([1, 2, 3]),
        settings: goldenSettings,
    });
    deepEqual(
        targets.map((target) => target.frame),
        [
            { x: 10, y: 0, width: 990, height: 790 },
            { x: 10, y: 0, width: 990, height: 790 },
            { x: 10, y: 0, width: 990, height: 790 },
        ],
    );
});
