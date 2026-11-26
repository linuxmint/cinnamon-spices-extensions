// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Pure logic for "Pick a window": which window a click landed on, and how its class joins the excluded list.

function normalizeClass(name) {
    return String(name === null || name === undefined ? '' : name).trim().toLowerCase();
}

// The same rules identity.isEligible applies to a normal window (lib files do not import each other):
// type 'normal' only, a WM_CLASS, and not the role 'pop-up' that Brave and Chrome give their pop-up windows.
const POPUP_ROLE = 'pop-up';

function isPickable(c) {
    return c.type === 'normal' && normalizeClass(c.wmClass) !== '' && c.role !== POPUP_ROLE;
}

// The left and top edges belong to the window, the right and bottom edges do not.
function contains(rect, x, y) {
    return !!rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

// windows: [{rect: {x, y, w, h}, wmClass, type, role, stack}], where a higher stack is nearer the top.
// Finds the topmost window that contains the point, whatever it is, and only then checks that it can be picked. A
// window that cannot (desktop, dock, dialog, menu, no class, pop-up) is what the user clicked, so the result is null:
// the click never passes through it to the window below.
function topWindowAt(windows, x, y) {
    let top = null;
    (windows || []).forEach(c => {
        if (!c || !contains(c.rect, x, y)) return;
        if (top === null || c.stack > top.stack) top = c;
    });
    return top !== null && isPickable(top) ? top : null;
}

// Whether a row of `list` already excludes wmClass, by the rule that excludes windows (identity.isEligible): a
// non-empty row that, ignoring case and padding, is part of the class.
function isCovered(list, wmClass) {
    const cls = normalizeClass(wmClass);
    if (cls === '') return false;
    return (list || []).some(item => {
        const pattern = normalizeClass(item);
        return pattern !== '' && cls.indexOf(pattern) !== -1;
    });
}

// A new list: every row of `list` exactly as it is, then wmClass (trimmed, in its own case) unless it is empty or a
// row covers it already.
function addToList(list, wmClass) {
    const out = (list || []).slice();
    if (normalizeClass(wmClass) !== '' && !isCovered(out, wmClass)) out.push(String(wmClass).trim());
    return out;
}

// The rows of the excluded-apps list, [{enabled, wmclass}], after a pick of wmClass: {rows, changed}. A row with no
// `enabled` (saved before the column existed) counts as enabled; only enabled rows exclude windows.
// - An enabled row covers the class (isCovered): the same rows, unchanged.
// - Else a disabled row is the class itself (ignoring case and padding): a new list where that row is a copy with
//   enabled true. A disabled row that is only part of the class is not checked again: it would exclude more.
// - Else the rows and a new row {enabled: true, wmclass: <the class, trimmed>}.
// Every other row is the very same object; an empty class changes nothing.
function excludeRows(rows, wmClass) {
    const cls = normalizeClass(wmClass);
    if (cls === '') return { rows: rows, changed: false };
    const list = rows || [];
    const isOn = row => !(row && row.enabled === false);
    const textOf = row => (row && row.wmclass) || '';
    if (isCovered(list.filter(isOn).map(textOf), wmClass)) return { rows: rows, changed: false };
    const off = list.findIndex(row => !isOn(row) && normalizeClass(textOf(row)) === cls);
    if (off !== -1) {
        const out = list.slice();
        out[off] = Object.assign({}, list[off], { enabled: true });
        return { rows: out, changed: true };
    }
    return { rows: list.concat([{ enabled: true, wmclass: String(wmClass).trim() }]), changed: true };
}
