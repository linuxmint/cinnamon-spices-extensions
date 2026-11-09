// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function sameMonitor(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function toRelative(rect, monitor) {
    return { x: rect.x - monitor.x, y: rect.y - monitor.y, w: rect.w, h: rect.h };
}

function toAbsolute(rel, monitor) {
    return { x: monitor.x + rel.x, y: monitor.y + rel.y, w: rel.w, h: rel.h };
}

// Shrinks the rect to the area size if needed, then moves it fully inside.
function clampRect(rect, area) {
    const w = Math.min(rect.w, area.w);
    const h = Math.min(rect.h, area.h);
    const x = Math.min(Math.max(rect.x, area.x), area.x + area.w - w);
    const y = Math.min(Math.max(rect.y, area.y), area.y + area.h - h);
    return { x: x, y: y, w: w, h: h };
}

// Order: exact geometry match, same index, primary, first monitor.
function chooseMonitor(monitors, saved) {
    if (!monitors || monitors.length === 0) return null;
    if (saved) {
        const exact = monitors.find(m => sameMonitor(m, saved));
        if (exact) return exact;
        const byIndex = monitors.find(m => m.index === saved.index);
        if (byIndex) return byIndex;
    }
    return monitors.find(m => m.primary) || monitors[0];
}

// True when the saved monitor is still in the layout: a monitor with its geometry, or the one with its index at its
// origin (the resolution changed). The index alone is not enough: Muffin numbers the monitors again after an unplug, so
// the index of a monitor that is gone can belong to another monitor.
function isConnected(monitors, saved) {
    if (!saved || !monitors) return false;
    return monitors.some(m => sameMonitor(m, saved) || (m.index === saved.index && m.x === saved.x && m.y === saved.y));
}
