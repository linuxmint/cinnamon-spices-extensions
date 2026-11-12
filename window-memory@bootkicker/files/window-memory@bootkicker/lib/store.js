// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const VERSION = 1;
// Brave and Chrome pop-ups (see isEligible in identity.js): never remembered, so an entry saved for one by an earlier version is dropped on load.
const POPUP_ROLE = 'pop-up';

function emptyState() {
    return { version: VERSION, windows: [] };
}

function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
}

// obj must be an object with a finite number in every one of fields.
function hasFiniteFields(obj, fields) {
    return !!obj && typeof obj === 'object' && fields.every(f => isFiniteNumber(obj[f]));
}

// Restore acts on rel, monitor, maximized, minimized and workspace, so a malformed value in any of them
// (a string "false", a rel without w/h) would misbehave later. Drop such entries on load. minimized alone may be
// absent: an entry saved before that field existed has none, and parseState loads it as not minimized.
function isValidEntry(e) {
    return !!e && typeof e === 'object' &&
        typeof e.id === 'string' && typeof e.key === 'string' &&
        isFiniteNumber(e.lastSeen) &&
        (e.rel === null || hasFiniteFields(e.rel, ['x', 'y', 'w', 'h'])) &&
        (e.monitor === null || hasFiniteFields(e.monitor, ['index', 'x', 'y', 'w', 'h'])) &&
        typeof e.maximized === 'boolean' &&
        (e.minimized === undefined || typeof e.minimized === 'boolean') &&
        (e.workspace === null || isFiniteNumber(e.workspace));
}

// The learned mapping adds two optional fields: appId, the desktop file id of the window's application (a string or null) and
// client, 'wayland' or 'x11' (or null). An entry without them stays as it is; a wrong value is removed, so that it reads as absent.
function dropBadOptionalFields(e) {
    const out = Object.assign({}, e);
    if ('appId' in out && !(out.appId === null || (typeof out.appId === 'string' && out.appId !== ''))) delete out.appId;
    if ('client' in out && !(out.client === null || out.client === 'wayland' || out.client === 'x11')) delete out.client;
    return out;
}

// Keys saved by the first version were wmClass|instance|role. The role is no longer part of the
// key (see windowKey), so a key of three parts or more is rebuilt from the stored class and instance, trimmed and
// lowercased as windowKey does. That keeps a '|' inside either one from splitting the key in the wrong place. An
// entry without those fields keeps the first two parts of its saved key. A key of two parts or fewer is already in
// the current form (wmClass|instance) and is returned as it is.
function normalizeKey(e) {
    const firstBar = e.key.indexOf('|');
    if (firstBar === -1 || e.key.indexOf('|', firstBar + 1) === -1) return e.key;
    if (typeof e.wmClass === 'string' && e.wmClass.trim() !== '' && typeof e.instance === 'string')
        return e.wmClass.trim().toLowerCase() + '|' + e.instance.trim().toLowerCase();
    return e.key.split('|').slice(0, 2).join('|');
}

// Corrupt or unknown input yields an empty state with recovered = true.
function parseState(text) {
    let data = null;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return { state: emptyState(), recovered: true };
    }
    if (!data || typeof data !== 'object' || data.version !== VERSION || !Array.isArray(data.windows))
        return { state: emptyState(), recovered: true };
    const seen = new Set();
    const windows = data.windows
        .filter(isValidEntry)
        .filter(e => e.role !== POPUP_ROLE)
        .filter(e => { // one entry per id: the first
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
        })
        .map(e => Object.assign({}, e, { key: normalizeKey(e), minimized: e.minimized === true }))
        .map(dropBadOptionalFields);
    return { state: { version: VERSION, windows: windows }, recovered: false };
}

function serializeState(state) {
    return JSON.stringify(state) + '\n';
}

function entriesForKey(state, key) {
    return state.windows
        .filter(e => e.key === key)
        .sort((a, b) => b.lastSeen - a.lastSeen);
}

// The entries of any of the keys, newest first (a window saved in the other session has another key: Identity.equivalentKeys).
function entriesForKeys(state, keys) {
    return state.windows
        .filter(e => keys.includes(e.key))
        .sort((a, b) => b.lastSeen - a.lastSeen);
}

function upsertEntry(state, entry) {
    const others = state.windows.filter(e => e.id !== entry.id);
    return { version: VERSION, windows: others.concat([entry]) };
}

function removeEntry(state, id) {
    return { version: VERSION, windows: state.windows.filter(e => e.id !== id) };
}

function pruneState(state, max) {
    if (state.windows.length <= max) return state;
    const kept = state.windows.slice().sort((a, b) => b.lastSeen - a.lastSeen).slice(0, max);
    return { version: VERSION, windows: kept };
}

// rnd returns a number in [0, 1).
function newEntryId(now, rnd) {
    return Math.floor(now).toString(36) + '-' + Math.floor(rnd() * 1e9).toString(36);
}

// io = {read(path) -> string | null, write(path, text), rename(from, to)}
function loadState(io, path, now) {
    const text = io.read(path);
    if (text === null) return { state: emptyState(), recovered: false };
    const result = parseState(text);
    if (result.recovered) {
        try {
            io.rename(path, path + '.bad-' + Math.floor(now));
        } catch (e) {
            // Keep going: the state starts fresh either way.
        }
    }
    return result;
}

// Write-then-rename keeps the previous file intact if the write fails.
function saveState(io, path, state) {
    const tmp = path + '.tmp';
    io.write(tmp, serializeState(state));
    io.rename(tmp, path);
}
