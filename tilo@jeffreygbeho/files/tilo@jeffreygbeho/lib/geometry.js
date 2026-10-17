/* tilo - rectangle arithmetic. Never touches a window. */

const Logger = require('./lib/logger');

/*
 * The real work area of the monitor holding the window: screen resolution MINUS
 * the panels. Never use raw monitor geometry, or windows end up underneath the
 * panel.
 */
function workAreaFor(window) {
    const workspace = window.get_workspace();
    const monitor = window.get_monitor();
    const area = workspace.get_work_area_for_monitor(monitor);
    return { x: area.x, y: area.y, width: area.width, height: area.height };
}

function inset(rect, amount) {
    return {
        x: rect.x + amount,
        y: rect.y + amount,
        width: Math.max(1, rect.width - 2 * amount),
        height: Math.max(1, rect.height - 2 * amount)
    };
}

/*
 * Resolves a fractional zone [fx, fy, fw, fh] (values in 0..1) into pixels.
 *
 * Gap model: every zone shrinks by innerGap/2 on all four sides, so two adjacent
 * zones leave exactly innerGap between them. We compensate at the screen edge so
 * the outer margin ends up being exactly outerGap.
 */
function resolveZone(fraction, workArea, innerGap, outerGap) {
    const [fx, fy, fw, fh] = fraction;
    const half = innerGap / 2;
    const pad = Math.max(0, outerGap - half);
    const usable = inset(workArea, pad);

    /*
     * Round the EDGES, never the size. Rounding position and width separately
     * lets two neighbours disagree about where their shared boundary is, which
     * shows up as a 1px overlap (or a 1px seam) between tiled windows.
     */
    const left   = Math.round(usable.x + fx * usable.width + half);
    const top    = Math.round(usable.y + fy * usable.height + half);
    const right  = Math.round(usable.x + (fx + fw) * usable.width - half);
    const bottom = Math.round(usable.y + (fy + fh) * usable.height - half);

    return {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top)
    };
}

function contains(rect, px, py) {
    return px >= rect.x && px < rect.x + rect.width &&
           py >= rect.y && py < rect.y + rect.height;
}

function equals(a, b, tolerance = 0) {
    return Math.abs(a.x - b.x) <= tolerance &&
           Math.abs(a.y - b.y) <= tolerance &&
           Math.abs(a.width - b.width) <= tolerance &&
           Math.abs(a.height - b.height) <= tolerance;
}

function describe(rect) {
    return `${rect.width}x${rect.height}+${rect.x}+${rect.y}`;
}

module.exports = { workAreaFor, inset, resolveZone, contains, equals, describe };
