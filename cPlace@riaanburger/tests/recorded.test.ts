// Tests for recorded positions: the identity rule that finds a recording's
// windows again, the arrangement that puts them back, and a recording as
// the preset store keeps it. Every expected value was worked out by hand
// from the rules before the functions first ran: a window first goes to an
// entry of its application with its title, then each application's
// remaining entries take its remaining windows in stacking order, and the
// arrangement puts window i at frame i, trimmed to the work area.

import { test } from "node:test";
import { deepEqual, equal } from "node:assert/strict";

import type { ArrangementWindow, Rectangle } from "../src/arrangement";
import { recorded } from "../src/arrangements/recorded";
import {
    describeRecording,
    madeAt,
    matchRecording,
    recordingFrom,
} from "../src/engine/recordings";

const workArea: Rectangle = { x: 0, y: 0, width: 3840, height: 2124 };

function windowsWithIds(ids: number[]): ArrangementWindow[] {
    return ids.map((id) => ({
        id,
        frame: { x: 0, y: 0, width: 1, height: 1 },
    }));
}

test("windows find the entries with their own titles, whatever the order", () => {
    deepEqual(
        matchRecording(
            [
                { app: "code", title: "one" },
                { app: "code", title: "two" },
            ],
            [
                { app: "code", title: "two" },
                { app: "code", title: "one" },
            ],
        ),
        [1, 0],
    );
});

test("a window whose title changed still goes to its application's entry", () => {
    deepEqual(
        matchRecording(
            [{ app: "firefox", title: "Docs" }],
            [{ app: "firefox", title: "News" }],
        ),
        [0],
    );
});

test("a renamed entry never takes the window another entry names", () => {
    // The first entry's title is gone and the second's is not: the second
    // keeps its window, and the first takes what is left.
    deepEqual(
        matchRecording(
            [
                { app: "code", title: "old" },
                { app: "code", title: "keep" },
            ],
            [
                { app: "code", title: "keep" },
                { app: "code", title: "new" },
            ],
        ),
        [1, 0],
    );
});

test("remaining entries take remaining windows in stacking order", () => {
    deepEqual(
        matchRecording(
            [
                { app: "term", title: "p" },
                { app: "term", title: "q" },
            ],
            [
                { app: "term", title: "r" },
                { app: "term", title: "s" },
            ],
        ),
        [0, 1],
    );
    // Two windows with one title go to the two entries bottom first.
    deepEqual(
        matchRecording(
            [
                { app: "term", title: "bash" },
                { app: "term", title: "bash" },
            ],
            [
                { app: "term", title: "bash" },
                { app: "term", title: "bash" },
            ],
        ),
        [0, 1],
    );
});

test("an entry with no window is left alone, and so is a window with no entry", () => {
    deepEqual(
        matchRecording(
            [
                { app: "code", title: "x" },
                { app: "firefox", title: "y" },
            ],
            [
                { app: "code", title: "z" },
                { app: "code", title: "x" },
            ],
        ),
        [1, null],
    );
});

test("applications never stand in for one another", () => {
    deepEqual(
        matchRecording(
            [{ app: "code", title: "x" }],
            [{ app: "firefox", title: "x" }],
        ),
        [null],
    );
});

test("recorded puts window i at frame i, in the order given", () => {
    const frames: Rectangle[] = [
        { x: 10, y: 20, width: 800, height: 600 },
        { x: 1536, y: 0, width: 2304, height: 1352 },
    ];
    deepEqual(
        recorded({
            workArea,
            windows: windowsWithIds([7, 3]),
            settings: { frames },
        }),
        [
            { id: 7, frame: { x: 10, y: 20, width: 800, height: 600 } },
            { id: 3, frame: { x: 1536, y: 0, width: 2304, height: 1352 } },
        ],
    );
});

test("recorded frames are trimmed to the work area they land in", () => {
    // Recorded before a panel grew: 1800 + 600 reaches 2400, past the
    // bottom at 2124, so 324 is left; and -50 + 400 reaches 350 from the
    // left edge at 0, so 350 is left.
    deepEqual(
        recorded({
            workArea,
            windows: windowsWithIds([0, 1]),
            settings: {
                frames: [
                    { x: 100, y: 1800, width: 800, height: 600 },
                    { x: -50, y: 40, width: 400, height: 300 },
                ],
            },
        }),
        [
            { id: 0, frame: { x: 100, y: 1800, width: 800, height: 324 } },
            { id: 1, frame: { x: 0, y: 40, width: 350, height: 300 } },
        ],
    );
});

test("a window with no frame of its own gets no target", () => {
    deepEqual(
        recorded({
            workArea,
            windows: windowsWithIds([0, 1]),
            settings: { frames: [{ x: 0, y: 0, width: 100, height: 100 }] },
        }),
        [{ id: 0, frame: { x: 0, y: 0, width: 100, height: 100 } }],
    );
});

test("a stored recording reads back, dropping only the entries that do not parse", () => {
    const frame = { x: 1, y: 2, width: 3, height: 4 };
    deepEqual(
        recordingFrom({
            entries: [
                { app: "code", title: "cPlace", frame },
                { app: "", title: "no application", frame },
                { app: "code", title: "no frame" },
                { app: "code", title: "flat", frame: { ...frame, height: 0 } },
                "junk",
            ],
            made: "2026-09-26 14:05",
        }),
        {
            entries: [{ app: "code", title: "cPlace", frame }],
            made: "2026-09-26 14:05",
        },
    );
    equal(recordingFrom("junk"), null);
    equal(recordingFrom({ made: "2026-09-26 14:05" }), null);
    deepEqual(recordingFrom({ entries: [] }), { entries: [], made: "" });
});

test("a recording's row counts its windows and says when it was made", () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 };
    const entry = { app: "code", title: "t", frame };
    equal(
        describeRecording({
            entries: [entry, entry, entry],
            made: "2026-09-26 14:05",
        }),
        "3 windows, 2026-09-26 14:05",
    );
    equal(
        describeRecording({ entries: [entry], made: "2026-09-26 14:05" }),
        "1 window, 2026-09-26 14:05",
    );
    equal(describeRecording({ entries: [], made: "" }), "0 windows");
});

test("the moment a recording is made reads to the minute, zero-padded", () => {
    equal(madeAt(new Date(2026, 8, 26, 14, 5)), "2026-09-26 14:05");
    equal(madeAt(new Date(2026, 0, 2, 3, 4, 59)), "2026-01-02 03:04");
});

// Two monitors side by side, the left one's panel taking 40 pixels, as the
// engine hands them over: the left is the one arranged on.
const left: Rectangle = { x: 0, y: 0, width: 1920, height: 1040 };
const right: Rectangle = { x: 1920, y: 0, width: 1920, height: 1080 };

test("a frame recorded on the other monitor goes back there, not to a sliver", () => {
    // Trimmed to the left alone, 2000 would become 1919, a pixel wide.
    deepEqual(
        recorded({
            workArea: left,
            workAreas: [left, right],
            windows: windowsWithIds([0]),
            settings: { frames: [{ x: 2000, y: 100, width: 800, height: 600 }] },
        }),
        [{ id: 0, frame: { x: 2000, y: 100, width: 800, height: 600 } }],
    );
});

test("a frame across both monitors is trimmed to the one holding most of it", () => {
    // 1500 to 2300: 420 pixels on the left and 380 on the right, so the
    // left keeps it, cut at 1920. 1880 to 1980: 40 on the left and 60 on
    // the right, so the right keeps it, cut from 1920.
    deepEqual(
        recorded({
            workArea: left,
            workAreas: [left, right],
            windows: windowsWithIds([0, 1]),
            settings: {
                frames: [
                    { x: 1500, y: 100, width: 800, height: 600 },
                    { x: 1880, y: 100, width: 100, height: 600 },
                ],
            },
        }),
        [
            { id: 0, frame: { x: 1500, y: 100, width: 420, height: 600 } },
            { id: 1, frame: { x: 1920, y: 100, width: 60, height: 600 } },
        ],
    );
});

test("a frame whose monitor has gone moves onto the one arranged on at its size", () => {
    // Recorded at 2400 on a right monitor since unplugged: 1920 - 800 puts
    // it at 1120, against the left's right edge, 100 down as it was.
    deepEqual(
        recorded({
            workArea: left,
            workAreas: [left],
            windows: windowsWithIds([0]),
            settings: { frames: [{ x: 2400, y: 100, width: 800, height: 600 }] },
        }),
        [{ id: 0, frame: { x: 1120, y: 100, width: 800, height: 600 } }],
    );
});
