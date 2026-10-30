/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * split model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Movable borders of a filled layout, stored as fractions (setting layouts, field
// "splits", keyed by window count). kind "cols": columns (major, along x) with stacked
// cells (minor, along y) — presets and the narrow auto grid; kind "rows": rows (major,
// along y) with cells side by side (minor, along x) — the wide auto grid. A split is
// { kind, shape, major: [fractions], minor: [[fractions] per column/row] }.

/** Minimum width/height of a cell between two movable borders, in px. */
var SPLIT_MIN_PX = 120;
/** Maximum extra px a resize hotkey gains per detected key repeat. */
var SPLIT_STEP_MAX = 64;
/**
 * Equal split for a shape: every part gets the same fraction. Column weights turn the
 * major fractions into weights[i] / sum(weights) when they carry one positive finite
 * entry per part (the preset column spans); omitted or unusable weights keep the equal
 * division, so a layout without them does not move by a pixel.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {readonly any[]} [weights] relative width of every major part
 * @returns {Split}
 */
var splitEqual = (kind, shape, weights) => {
    const usable = !!weights && weights.length === shape.length
        && weights.every((/** @type {any} */ w) => typeof w === 'number' && Number.isFinite(w) && w > 0);
    const sum = usable ? /** @type {number[]} */ (weights).reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) : shape.length;
    // A finite sum too: two huge finite weights overflow to Infinity and would turn
    // every fraction into 0.
    const weighted = usable && Number.isFinite(sum);
    return {
        kind: kind,
        shape: shape.slice(),
        major: shape.map((/** @type {number} */ _k, /** @type {number} */ i) =>
            (weighted ? /** @type {number[]} */ (weights)[i] / sum : 1 / shape.length)),
        minor: shape.map((k) => Array.from({ length: k }, () => 1 / k)),
    };
};
/**
 * Normalised copy of the fractions when they are len positive finite numbers summing
 * to ~1, otherwise null.
 * @param {any} parts raw stored fractions, validated here
 * @param {number} len expected part count
 * @returns {number[] | null}
 */
var splitNorm = (parts, len) => {
    if (!Array.isArray(parts) || parts.length !== len) {
        return null;
    }
    if (!parts.every((/** @type {number} */ v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
        return null;
    }
    const sum = parts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.02) {
        return null;
    }
    return parts.map((v) => v / sum);
};
/**
 * Normalised copy of a stored split when it fits (kind, shape), otherwise null.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {any} split raw stored split, validated here
 * @returns {Split | null}
 */
var splitValid = (kind, shape, split) => {
    if (split == null || typeof split !== 'object' || split.kind !== kind) {
        return null;
    }
    if (!Array.isArray(split.shape) || split.shape.length !== shape.length || split.shape.some((/** @type {number} */ v, /** @type {number} */ i) => v !== shape[i])) {
        return null;
    }
    const major = splitNorm(split.major, shape.length);
    if (!major || !Array.isArray(split.minor) || split.minor.length !== shape.length) {
        return null;
    }
    const minor = [];
    for (let i = 0; i < shape.length; i++) {
        const parts = splitNorm(split.minor[i], shape[i]);
        if (!parts) {
            return null;
        }
        minor.push(parts);
    }
    return { kind: kind, shape: shape.slice(), major: major, minor: minor };
};
/**
 * Positions and sizes of n parts along one axis. Without fractions this is the
 * equal division (start + i * len / n), so layouts without a split do not move
 * by a pixel.
 * @param {number[] | null} fractions
 * @param {number} n
 * @param {number} start
 * @param {number} len
 * @returns {Array<[number, number]>} [start, size] per part
 */
var splitParts = (fractions, n, start, len) => {
    /** @type {Array<[number, number]>} */
    const out = [];
    if (!fractions) {
        const size = len / n;
        for (let i = 0; i < n; i++) {
            out.push([start + i * size, size]);
        }
        return out;
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const from = start + len * acc;
        acc += fractions[i];
        const to = i === n - 1 ? start + len : start + len * acc;
        out.push([from, to - from]);
    }
    return out;
};
/**
 * Cell rectangles in placement order: cols column by column, top to bottom; rows row by
 * row, left to right.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {Rect} area
 * @returns {Rect[]}
 */
var splitRects = (kind, shape, split, area) => {
    const [ax, ay, aw, ah] = area;
    /** @type {Rect[]} */
    const rects = [];
    const cols = kind === 'cols';
    const major = splitParts(split ? split.major : null, shape.length, cols ? ax : ay, cols ? aw : ah);
    for (let i = 0; i < shape.length; i++) {
        const minor = splitParts(split ? split.minor[i] : null, shape[i], cols ? ay : ax, cols ? ah : aw);
        for (const [pos, size] of minor) {
            rects.push(cols ? [major[i][0], pos, major[i][1], size] : [pos, major[i][0], size, major[i][1]]);
        }
    }
    return rects;
};
/**
 * Index of the cell whose centre lies nearest to the frame centre (placement order).
 * @param {Rect[]} rects
 * @param {Rect} frame
 * @returns {number} index or -1
 */
var splitCellAt = (rects, frame) => {
    const cx = frame[0] + frame[2] / 2;
    const cy = frame[1] + frame[3] / 2;
    let best = -1;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
        const dx = r[0] + r[2] / 2 - cx;
        const dy = r[1] + r[3] / 2 - cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    });
    return best;
};
/**
 * Which stored border an edge of cell idx is: the border between part b and b + 1 of
 * split.major or split.minor[i] — or null when the edge lies on the monitor border.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {number} idx cell index in placement order
 * @param {string} edge 'left' | 'right' | 'top' | 'bottom'
 * @returns {EdgeRef | null}
 */
var splitEdgeRef = (kind, shape, idx, edge) => {
    let i = 0;
    let j = idx;
    while (i < shape.length && j >= shape[i]) {
        j -= shape[i];
        i++;
    }
    if (idx < 0 || i >= shape.length) {
        return null;
    }
    const vertical = edge === 'left' || edge === 'right';
    const after = edge === 'right' || edge === 'bottom';
    if (!vertical && edge !== 'top' && edge !== 'bottom') {
        return null;
    }
    const onMajor = (kind === 'cols') === vertical;
    const index = onMajor ? i : j;
    const count = onMajor ? shape.length : shape[i];
    const b = after ? index : index - 1;
    if (b < 0 || b >= count - 1) {
        return null;
    }
    return { list: onMajor ? 'major' : 'minor', i: i, b: b };
};
/**
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {number} idx
 * @param {string} edge
 * @returns {boolean}
 */
var splitHasEdge = (kind, shape, idx, edge) => splitEdgeRef(kind, shape, idx, edge) !== null;
/**
 * Start/length pair of a split axis in screen coordinates.
 * @param {'cols'|'rows'} kind
 * @param {'major'|'minor'} list
 * @param {Rect} area
 * @returns {[number, number]}
 */
var splitAxis = (kind, list, area) => {
    const alongX = (kind === 'cols') === (list === 'major');
    return alongX ? [area[0], area[2]] : [area[1], area[3]];
};
/**
 * Screen coordinate of the stored border an edge of cell idx belongs to.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {number} idx
 * @param {string} edge
 * @param {Rect} area
 * @returns {number | null}
 */
var splitBorderPos = (kind, shape, split, idx, edge, area) => {
    const ref = splitEdgeRef(kind, shape, idx, edge);
    if (!ref) {
        return null;
    }
    const s = split || splitEqual(kind, shape);
    const parts = ref.list === 'major' ? s.major : s.minor[ref.i];
    const [start, len] = splitAxis(kind, ref.list, area);
    const cells = splitParts(split ? parts : null, parts.length, start, len);
    return cells[ref.b][0] + cells[ref.b][1];
};
/**
 * New split with the given edge of cell idx moved to pos (screen coordinate). Only the
 * two parts next to the border change; both keep at least minPx. null when the edge has
 * no neighbour or the two parts have no room for two minimum sizes.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {number} idx
 * @param {string} edge
 * @param {number} pos
 * @param {Rect} area
 * @param {number | number[]} minPx minimum of a part after the move, per side (a
 *   scalar applies to both)
 * @returns {Split | null}
 */
var splitMove = (kind, shape, split, idx, edge, pos, area, minPx) => {
    const ref = splitEdgeRef(kind, shape, idx, edge);
    if (!ref) {
        return null;
    }
    const lo = Array.isArray(minPx) ? minPx[0] : minPx;
    const hi = Array.isArray(minPx) ? minPx[1] : minPx;
    const next = split ? JSON.parse(JSON.stringify(split)) : splitEqual(kind, shape);
    const parts = ref.list === 'major' ? next.major : next.minor[ref.i];
    const [start, len] = splitAxis(kind, ref.list, area);
    let before = 0;
    for (let k = 0; k < ref.b; k++) {
        before += parts[k];
    }
    const p0 = start + len * before;
    const p2 = start + len * (before + parts[ref.b] + parts[ref.b + 1]);
    if (p2 - p0 < lo + hi) {
        return null;
    }
    const at = Math.min(Math.max(pos, p0 + lo), p2 - hi);
    parts[ref.b] = (at - p0) / len;
    parts[ref.b + 1] = (p2 - at) / len;
    return next;
};
/**
 * Hotkey action -> the edge to move and the direction (+1 = towards right/bottom).
 * The cell grows or shrinks at its right/bottom border; the last cell in that direction
 * uses its left/top border instead.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {number} idx
 * @param {string} action 'wider' | 'narrower' | 'taller' | 'shorter'
 * @returns {{ edge: string, sign: number } | null}
 */
var splitKeyTarget = (kind, shape, idx, action) => {
    const options = /** @type {Array<[string, number]> | undefined} */ ({
        wider: [['right', 1], ['left', -1]],
        narrower: [['right', -1], ['left', 1]],
        taller: [['bottom', 1], ['top', -1]],
        shorter: [['bottom', -1], ['top', 1]],
    }[action]);
    if (!options) {
        return null;
    }
    for (const [edge, sign] of options) {
        if (splitHasEdge(kind, shape, idx, edge)) {
            return { edge: edge, sign: sign };
        }
    }
    return null;
};
/**
 * Step size for a resize hotkey. Cinnamon calls the hotkey again on key auto-repeat but
 * reports no release: a call of the same action within `threshold` ms (keyboard repeat
 * delay + margin) is a repeat and grows the step by 1 px up to SPLIT_STEP_MAX.
 * @param {AccelState | null} state
 * @param {string} action
 * @param {number} now
 * @param {number} threshold
 * @returns {{ step: number, state: AccelState }}
 */
var splitAccel = (state, action, now, threshold) => {
    const repeat = state != null && state.action === action && now - state.last <= threshold;
    const step = repeat ? Math.min(SPLIT_STEP_MAX, state.step + 1) : 1;
    return { step: step, state: { action: action, last: now, step: step } };
};
/**
 * Muffin grab op name (e.g. RESIZING_NE) -> window edges that move (corners move two).
 * @param {string} name
 * @returns {string[]}
 */
var splitOpEdges = (name) => {
    const found = /RESIZING_([NS]?)([EW]?)$/.exec(String(name || ''));
    if (!found) {
        return [];
    }
    const edges = [];
    if (found[1]) {
        edges.push(found[1] === 'N' ? 'top' : 'bottom');
    }
    if (found[2]) {
        edges.push(found[2] === 'W' ? 'left' : 'right');
    }
    return edges;
};
/**
 * Edges that moved between the frame at grab start and at release (fallback when the
 * grab op does not name a direction, e.g. KEYBOARD_RESIZING_UNKNOWN). 1 px is noise.
 * @param {Rect} from
 * @param {Rect} to
 * @returns {string[]}
 */
var splitFrameEdges = (from, to) => {
    const edges = [];
    const moved = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) >= 2;
    if (moved(from[1], to[1])) {
        edges.push('top');
    }
    if (moved(from[1] + from[3], to[1] + to[3])) {
        edges.push('bottom');
    }
    if (moved(from[0], to[0])) {
        edges.push('left');
    }
    if (moved(from[0] + from[2], to[0] + to[2])) {
        edges.push('right');
    }
    return edges;
};
/**
 * Effective geometry of one axis: raises every FINAL (post gapCell) part size to
 * minPx where feasible, otherwise distributes all remaining pixels as equal shares
 * (largest remainder). Nothing changes when the axis already keeps minPx — the
 * fractions of the caller are returned untouched (null). A non-positive or
 * non-finite axis has no room and is declined (null): the fraction division at the
 * end would produce non-finite values for a zero-length axis. When even 1 px per
 * part no longer fits after the gaps the equal division of the raw axis is returned
 * (a defined other split): valid fractions, finite geometry inside the area, but no
 * promise of minPx — the unattainable minimum is never faked by fractions above 1
 * or negative raw cells.
 * @param {number[] | null} fractions fractions of one axis (null = equal division)
 * @param {number} count
 * @param {number} start first px of the axis
 * @param {number} len px length of the axis
 * @param {number} gap window gap
 * @param {number | number[]} minPx promised minimum of a FINAL frame size, per part
 *   (a scalar applies to every part)
 * @param {[number, number]} [reference] full gap-reference axis when only part is occupied
 * @param {number} [softFloor] target floor; hard evidence wins when the post-gap budget cannot afford it
 * @returns {number[] | null} corrected fractions, or null when nothing changes
 */
const splitClampAxis = (fractions, count, start, len, gap, minPx, reference, softFloor) => {
    if (!Number.isFinite(start) || !Number.isFinite(len) || len <= 0) {
        return null;
    }
    let mins = Array.isArray(minPx) ? minPx : Array.from({ length: count }, () => minPx);
    const lead = Math.floor(gap / 2);
    const trail = gap - lead;
    const parts = splitParts(fractions, count, start, len);
    const loss = parts.map((p, i) => reference
        ? (Math.abs(Math.round(p[0]) - Math.round(reference[0])) >= 1 ? lead : 0)
            + (Math.abs(Math.round(p[0] + p[1]) - Math.round(reference[0]) - Math.round(reference[1])) >= 1 ? trail : 0)
        : (i === 0 ? 0 : lead) + (i === count - 1 ? 0 : trail));
    const fin = parts.map((p, i) => Math.round(p[0] + p[1]) - Math.round(p[0]) - loss[i]);
    const avail = fin.reduce((a, b) => a + b, 0);
    // With no refusal retain the legacy floor, even on a nominal tight grid.
    if (softFloor !== undefined && (mins.every((v) => v === 0)
        || mins.reduce((a, v) => a + Math.max(v, softFloor), 0) <= avail)) {
        mins = mins.map((v) => Math.max(v, softFloor));
    }
    if (fin.every((f, i) => f >= mins[i])) {
        return null;
    }
    const want = mins.reduce((a, b) => a + b, 0);
    /** @type {number[]} */
    const next = [];
    if (avail < want) {
        if (avail < count) {
            // less than one pixel per part after the gaps: no arrangement can keep
            // minPx, and any shortfall shares would need fractions summing past 1 or
            // negative raw cells. Return the equal division of the raw axis instead —
            // valid and finite, the unattainable minimum is simply not promised.
            return Array.from({ length: count }, () => 1 / count);
        }
        // not enough for every part at minPx: equal shares for all (fair shortfall),
        // the px remainder goes to the first parts — deterministic, keeps tiling.
        // avail is the exact telescoped sum of the fin values, an integer: every
        // share is >= 1 here, so all parts stay nonnegative.
        const base = Math.floor(avail / count);
        const rem = avail - base * count;
        next.push(...fin.map((_f, i) => base + (i < rem ? 1 : 0)));
    }
    else {
        // raise the parts below their minimum, financed proportionally by the parts
        // above theirs
        const need = fin.map((f, i) => Math.max(0, mins[i] - f));
        const surplus = fin.map((f, i) => Math.max(0, f - mins[i]));
        const totalNeed = need.reduce((a, b) => a + b, 0);
        const totalSurplus = surplus.reduce((a, b) => a + b, 0);
        const give = need.map((n, i) => (n > 0 ? 0 : Math.floor(totalNeed * surplus[i] / totalSurplus)));
        let given = give.reduce((a, b) => a + b, 0);
        /** @param {number} i */
        const fracGive = (i) => totalNeed * surplus[i] / totalSurplus - Math.floor(totalNeed * surplus[i] / totalSurplus);
        const order = fin.map((_f, i) => i).sort((a, b) =>
            (fracGive(b) - fracGive(a)) || (surplus[b] - surplus[a]) || (a - b));
        while (given < totalNeed) {
            for (const i of order) {
                if (given >= totalNeed) {
                    break;
                }
                if (give[i] < surplus[i]) {
                    give[i] += 1;
                    given += 1;
                }
            }
        }
        next.push(...fin.map((f, i) => f - give[i] + need[i]));
    }
    // pre-gap widths -> fractions; the edges (first from, last to) stay on the axis bounds.
    // When a part boundary lands on a half-pixel (or the axis is non-integer) the
    // telescoped budget sum(next) + sum(loss) drifts from len, so the raw shares can sum
    // to e.g. 1.008 or 0.98. Scale them so the fractions always sum to exactly 1.
    const fracs = next.map((f, i) => (f + loss[i]) / len);
    const total = fracs.reduce((a, b) => a + b, 0);
    return total === 1 ? fracs : fracs.map((f) => f / total);
};

/**
 * Corrected copy of a stored split whose final (post gapCell) frames would fall
 * below minPx: legacy narrow borders, a raised gap or a shrunken usable area.
 * Stored and pending split values stay untouched — mounting this is the caller's
 * read-time view. Only when no axis needs a correction the input is passed through
 * unchanged (same reference, null for a null split).
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split stored or pending split (read-only)
 * @param {Rect} area usable area the layout is placed in
 * @param {number} gap window gap
 * @param {number} minPx promised minimum of a FINAL frame
 * @returns {Split | null}
 */
var splitMinimal = (kind, shape, split, area, gap, minPx) => {
    return splitClamp(kind, shape, split, area, gap,
        shape.map(() => minPx), shape.map((k) => Array.from({ length: k }, () => minPx)));
};
/**
 * Assemble both axes once, sharing the final-frame clamp between soft legacy floors
 * and per-window hard evidence. Passed fractions stay untouched when no axis changes.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {Rect} area
 * @param {number} gap
 * @param {number[]} majorMins
 * @param {number[][]} minorMins
 * @param {Rect} [gapArea] full gap reference when area is only the occupied extent
 * @param {number} [softFloor] target floor when minima are hard per-window evidence
 * @returns {Split | null}
 */
const splitClamp = (kind, shape, split, area, gap, majorMins, minorMins, gapArea, softFloor) => {
    const major = splitClampAxis(split ? split.major : null, shape.length, ...splitAxis(kind, 'major', area),
        gap, majorMins, gapArea ? splitAxis(kind, 'major', gapArea) : undefined, softFloor);
    const minor = shape.map((k, i) => splitClampAxis(split ? split.minor[i] : null, k, ...splitAxis(kind, 'minor', area),
        gap, minorMins[i], gapArea ? splitAxis(kind, 'minor', gapArea) : undefined, softFloor));
    if (major === null && minor.every((m) => m === null)) {
        return split;
    }
    const equal = splitEqual(kind, shape);
    return {
        kind: kind,
        shape: shape.slice(),
        major: major || (split ? split.major.slice() : equal.major),
        minor: shape.map((k, i) => minor[i] || (split ? split.minor[i].slice() : equal.minor[i])),
    };
};

/**
 * Per-part minimum sizes of a shape: cell minima arrive in placement order
 * (major parts first, their stacks inside), a part's major minimum is the largest
 * of its cells' extents on the major axis (a shared column width / row height),
 * the minor minima stay per cell. `cols`: major along x, minor along y.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Array<{w: number, h: number}>} mins
 * @returns {{ major: number[], minor: number[][] }}
 */
var splitMinSizes = (kind, shape, mins) => {
    const cols = kind === 'cols';
    const major = [];
    const minor = [];
    let idx = 0;
    for (const k of shape) {
        const slice = mins.slice(idx, idx + k);
        idx += k;
        major.push(Math.max.apply(null, slice.map((/** @type {{w: number, h: number}} */ m) => (cols ? m.w : m.h))));
        minor.push(slice.map((/** @type {{w: number, h: number}} */ m) => (cols ? m.h : m.w)));
    }
    return { major: major, minor: minor };
};
/**
 * A shape of the same kind that can hold the cell minima: the nominal shape when it
 * fits, otherwise the same kind regrouped — fewest major parts first in the direction
 * that reduces horizontal adjacency, and within a part count the smallest major length.
 * Exact and compact: `suf[k][i]` is the smallest major length covering windows i..n-1
 * with exactly k parts, so the search is O(n^2) entries with an O(n) transition, and
 * `nxt` keeps the boundary the DP chose so one backtrack yields the arrangement. No
 * enumeration and no node cap. The nominal shape comes back when nothing fits — the
 * caller stays best-effort and never fakes a fit.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Array<{w: number, h: number}>} mins
 * @param {number} width usable width
 * @param {number} height usable height
 * @param {number} gap
 * @returns {number[]}
 */
var splitFitShape = (kind, shape, mins, width, height, gap) => {
    const n = mins.length;
    if (n !== shape.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0)) {
        return shape.slice();
    }
    // Nothing was refused: the nominal shape is the answer, and deciding anything here
    // would regroup a tight grid that no application objected to (the gap budget alone
    // is not evidence of a minimum).
    if (mins.every((m) => m.w === 0 && m.h === 0)) {
        return shape.slice();
    }
    const cols = kind === 'cols';
    const majorLen = cols ? width : height;
    const minorLen = cols ? height : width;
    const majorMin = mins.map((/** @type {{w: number, h: number}} */ m) => (cols ? m.w : m.h));
    const minorMin = mins.map((/** @type {{w: number, h: number}} */ m) => (cols ? m.h : m.w));
    const minorSum = [0];
    for (let i = 0; i < n; i++) {
        minorSum.push(/** @type {number} */ (minorSum[i]) + minorMin[i]);
    }
    // one major part spans consecutive windows [from, to): the largest major minimum of
    // its cells, and the SUM of their minor minima plus the inner gaps
    /** @param {number} from @param {number} to @returns {boolean} */
    const minorFits = (from, to) => /** @type {number} */ (minorSum[to]) - /** @type {number} */ (minorSum[from])
        + (to - from - 1) * gap <= minorLen;
    // the nominal shape first: its own grouping, checked part by part
    let at = 0;
    let used = 0;
    for (const size of shape) {
        if (!minorFits(at, at + size)) {
            used = Infinity;
            break;
        }
        used += Math.max.apply(null, majorMin.slice(at, at + size)) + (at > 0 ? gap : 0);
        at += size;
    }
    if (used <= majorLen) {
        return shape.slice();
    }
    // Part counts outward from the nominal one, in the direction that reduces horizontal
    // adjacency: for 'cols' the columns are the major parts, so fewer of them stack more;
    // for 'rows' a row's cells are side by side, so more rows do.
    const nominal = shape.length;
    const counts = Array.from({ length: n }, (_v, i) => i + 1);
    const order = cols ? counts.slice(0, nominal).reverse().concat(counts.slice(nominal))
        : counts.slice(nominal - 1).concat(counts.slice(0, nominal - 1).reverse());
    const suf = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(Infinity));
    /** @type {number[][]} */
    const nxt = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
    // how far the chosen part size sits from the balanced one — the tie-break, so equal
    // lengths keep the even grouping ([2,2]) instead of an arbitrary lopsided one ([1,3])
    suf[0][n] = 0;
    for (let k = 1; k <= n; k++) {
        for (let i = n - k; i >= 0; i--) {
            const ideal = (n - i) / k;
            let bestOff = Infinity;
            let maxMajor = 0;
            for (let j = i + 1; j <= n - (k - 1); j++) {
                // Include every interval member, even when this suffix cannot be used.
                maxMajor = Math.max(maxMajor, majorMin[j - 1]);
                if (suf[k - 1][j] === Infinity || !minorFits(i, j)) {
                    continue;
                }
                const total = maxMajor + (k > 1 ? gap : 0) + suf[k - 1][j];
                const off = Math.abs((j - i) - ideal);
                if (total < suf[k][i] || (total === suf[k][i] && off < bestOff)) {
                    suf[k][i] = total;
                    nxt[k][i] = j;
                    bestOff = off;
                }
            }
        }
    }
    for (const parts of order) {
        if (suf[parts][0] > majorLen) {
            continue;
        }
        /** @type {number[]} */
        const out = [];
        let from = 0;
        for (let k = parts; k >= 1; k--) {
            const to = nxt[k][from];
            if (to <= from) {
                out.length = 0;
                break;
            }
            out.push(to - from);
            from = to;
        }
        if (from === n) {
            return out;
        }
    }
    return shape.slice();
};
/**
 * Effective arrangement for the cell minima of an ordered window list: the stored
 * split raised to the per-cell minima, and — when the nominal shape cannot hold
 * them — the same kind with fewer horizontally adjacent windows. Pure: the stored
 * split and the settings are never touched. An unchanged shape whose axes need no
 * raising returns the passed read-time split untouched (null when there is none).
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Array<{w: number, h: number}>} mins per-cell minima in placement order
 * @param {Rect} area
 * @param {number} gap
 * @param {number} minPx floor every cell keeps even without an observed minimum
 * @param {Split | null} base the read-time split of the EFFECTIVE shape (the caller
 *   validates it against that shape; a base for another shape is ignored)
 * @param {number[]} [knownShape] already selected by a runtime validating stored intent
 * @param {Rect} [gapArea] full gap reference when area is only the occupied extent
 * @returns {{ kind: 'cols'|'rows', shape: number[], split: Split | null }}
 */
var splitFit = (kind, shape, mins, area, gap, minPx, base, knownShape, gapArea) => {
    // A cell-minima list that does not match the shape cannot be attributed to its
    // cells: leave the nominal arrangement untouched instead of inventing minima.
    if (mins.length !== shape.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0)) {
        return { kind: kind, shape: shape.slice(), split: base };
    }
    const fitted = knownShape || splitFitShape(kind, shape, mins, area[2], area[3], gap);
    const same = fitted.length === shape.length && fitted.every((v, i) => v === shape[i]);
    // The base applies to the effective shape it was stored/validated for.
    const usable = same && base
        ? base
        : (base && base.shape.length === fitted.length && base.shape.every((v, i) => v === fitted[i]) ? base : null);
    const parts = splitMinSizes(kind, fitted, mins);
    // The minima are FINAL FRAME sizes and splitClampAxis compares them against the
    // finished (post-gap) sizes of the parts. The greenTile floor is a SOFT target: it
    // applies only while the axis can afford it for EVERY part. Where it cannot — three
    // cells of which two need 900 and the axis is 1920, say — the hard application
    // minima are what matter, and keeping the floor would make the clamp equal-share and
    // drop every minimum, overlapping windows that a feasible arrangement exists for.
    return {
        kind: kind,
        shape: fitted,
        split: splitClamp(kind, fitted, usable, area, gap, parts.major, parts.minor, gapArea, minPx)
            || (same ? base : splitEqual(kind, fitted)),
    };
};

/**
 * Reading order for a retile. rects[i] = [x, y, w, h] of window i; returns the indices in
 * placement order. Windows are grouped along the major axis (x for columns, y for rows)
 * by overlap: a window joins the current group when it overlaps the group's first window
 * by at least half the smaller extent. Groups follow each other by centre, inside a group
 * by the other axis. Tiled windows of one column (row) always share a group, whatever the
 * borders, so unequal splits and a dragged edge never move a window to another cell.
 * @param {Rect[]} rects
 * @param {boolean} columnMajor
 * @returns {number[]}
 */
var sortOrder = (rects, columnMajor) => {
    const p = columnMajor ? 0 : 1;
    const s = 1 - p;
    const items = rects.map((r, i) => ({ i: i, r: r, c: r[p] + r[p + 2] / 2 }));
    items.sort((a, b) => (a.c - b.c) || (a.r[s] - b.r[s]) || (a.i - b.i));
    /** @type {Array<{ anchor: Rect, items: SortItem[] }> } */
    const groups = [];
    for (const it of items) {
        const g = groups[groups.length - 1];
        if (g) {
            const a = g.anchor;
            const overlap = Math.min(a[p] + a[p + 2], it.r[p] + it.r[p + 2]) - Math.max(a[p], it.r[p]);
            if (overlap > 0 && overlap >= 0.5 * Math.min(a[p + 2], it.r[p + 2])) {
                g.items.push(it);
                continue;
            }
        }
        groups.push({ anchor: it.r, items: [it] });
    }
    const order = [];
    for (const g of groups) {
        g.items.sort((a, b) => (a.r[s] - b.r[s]) || (a.r[p] - b.r[p]) || (a.i - b.i));
        for (const it of g.items) {
            order.push(it.i);
        }
    }
    return order;
};
