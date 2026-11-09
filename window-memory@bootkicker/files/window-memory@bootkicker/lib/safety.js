// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Pure logic for "stop when it cannot work safely": the limits, the record of why
// the extension stopped, the error budget and the restart-loop test. No file or
// Cinnamon access here; the extension reads and writes safety.json itself.

var LIMITS = { errorLimit: 20, errorWindowSeconds: 300, loopStarts: 3, loopGapSeconds: 120 };

var REASONS = {
    MISSING_CALL: 'missing-call',
    START_FAILED: 'start-failed',
    TOO_MANY_ERRORS: 'too-many-errors',
    RESTART_LOOP: 'restart-loop',
};

// Enough to judge a loop (LIMITS.loopStarts) with room to spare, small enough to stay tiny.
const MAX_STARTS = 10;

function emptySafety() {
    return { stopped: null, starts: [] };
}

function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function cleanStopped(raw) {
    if (!isObject(raw) || typeof raw.reason !== 'string') return null;
    if (!Object.values(REASONS).includes(raw.reason)) return null;
    return {
        reason: raw.reason,
        at: Number.isFinite(raw.at) ? raw.at : 0,
        cinnamon: typeof raw.cinnamon === 'string' ? raw.cinnamon : '',
        muffin: typeof raw.muffin === 'string' ? raw.muffin : '',
        // Anything unexpected falls back to the safe default: wait for a session switch.
        resume: raw.resume === 'file' ? 'file' : 'switch',
    };
}

// The file may be missing, half-written or edited by hand: never throw, never trust.
function parseSafety(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        return emptySafety();
    }
    if (!isObject(raw)) return emptySafety();
    const starts = Array.isArray(raw.starts)
        ? raw.starts
            .filter(s => isObject(s) && Number.isFinite(s.at) && typeof s.session === 'string')
            .map(s => ({ at: s.at, session: s.session }))
            .slice(-MAX_STARTS)
        : [];
    return { stopped: cleanStopped(raw.stopped), starts };
}

function serializeSafety(safety) {
    return JSON.stringify(safety) + '\n';
}

// Counts errors in a sliding window; record() says whether the limit is reached.
// A time exactly windowSeconds old is already outside the window.
function createErrorBudget(limit, windowSeconds) {
    let times = [];
    return {
        record(nowSeconds) {
            times = times.filter(t => nowSeconds - t < windowSeconds);
            times.push(nowSeconds);
            return times.length >= limit;
        },
        reset() {
            times = [];
        },
    };
}

function recordStart(safety, at, session) {
    return {
        stopped: safety.stopped,
        starts: safety.starts.concat([{ at, session }]).slice(-MAX_STARTS),
    };
}

// The current start is the last entry. A loop is several starts of one login
// session, each shortly after the one before; a logout in between (another
// session) breaks it. An empty session id (unknown) matches any session. A clock that went backwards between two
// starts (a negative gap) says nothing about how quickly they followed each other, so it breaks the chain too.
function isRestartLoop(safety, loopStarts, gapSeconds) {
    const recent = safety.starts.slice(-loopStarts);
    if (recent.length < loopStarts) return false;
    const known = new Set(recent.map(s => s.session).filter(s => s !== ''));
    if (known.size > 1) return false;
    for (let i = 1; i < recent.length; i++) {
        const gap = recent[i].at - recent[i - 1].at;
        if (gap < 0 || gap > gapSeconds) return false;
    }
    return true;
}

function stopRecord(reason, at, cinnamon, muffin, resume) {
    return { reason, at, cinnamon, muffin, resume };
}

function stopSafety(safety, record) {
    return { stopped: record, starts: safety.starts };
}

// After the extension disabled itself cleanly the start history no longer says anything.
function afterCleanDisable(safety) {
    return { stopped: safety.stopped, starts: [] };
}

function resumeSafety() {
    return emptySafety();
}
