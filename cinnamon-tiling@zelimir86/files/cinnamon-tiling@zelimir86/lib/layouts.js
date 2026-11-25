// Layout model. A layout is { id, tiles: [{x, y, width, height, groups}] } with
// coordinates normalised to 0..1 of a monitor's work area. The JSON format is
// the same one Tiling Shell for GNOME uses, so layout files can be shared.

const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;

const EPS = U.EPS;

var DEFAULT_LAYOUTS = [
    { id: 'Layout 1', tiles: [
        { x: 0, y: 0, width: 0.22, height: 0.5, groups: [] },
        { x: 0, y: 0.5, width: 0.22, height: 0.5, groups: [] },
        { x: 0.22, y: 0, width: 0.56, height: 1, groups: [] },
        { x: 0.78, y: 0, width: 0.22, height: 0.5, groups: [] },
        { x: 0.78, y: 0.5, width: 0.22, height: 0.5, groups: [] },
    ] },
    { id: 'Layout 2', tiles: [
        { x: 0, y: 0, width: 0.22, height: 1, groups: [] },
        { x: 0.22, y: 0, width: 0.56, height: 1, groups: [] },
        { x: 0.78, y: 0, width: 0.22, height: 1, groups: [] },
    ] },
    { id: 'Layout 3', tiles: [
        { x: 0, y: 0, width: 0.33, height: 1, groups: [] },
        { x: 0.33, y: 0, width: 0.67, height: 1, groups: [] },
    ] },
    { id: 'Layout 4', tiles: [
        { x: 0, y: 0, width: 0.67, height: 1, groups: [] },
        { x: 0.67, y: 0, width: 0.33, height: 1, groups: [] },
    ] },
    { id: 'Halves', tiles: [
        { x: 0, y: 0, width: 0.5, height: 1, groups: [] },
        { x: 0.5, y: 0, width: 0.5, height: 1, groups: [] },
    ] },
    { id: 'Grid 2x2', tiles: [
        { x: 0, y: 0, width: 0.5, height: 0.5, groups: [] },
        { x: 0.5, y: 0, width: 0.5, height: 0.5, groups: [] },
        { x: 0, y: 0.5, width: 0.5, height: 0.5, groups: [] },
        { x: 0.5, y: 0.5, width: 0.5, height: 0.5, groups: [] },
    ] },
];

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

function cloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout));
}

function normalizeLayout(raw, fallbackId) {
    if (!raw || !Array.isArray(raw.tiles) || raw.tiles.length === 0)
        return null;
    const tiles = [];
    for (const t of raw.tiles) {
        const x = Number(t.x), y = Number(t.y), w = Number(t.width), h = Number(t.height);
        if (![x, y, w, h].every(Number.isFinite))
            return null;
        if (w <= 0 || h <= 0)
            continue;
        tiles.push({
            x: round4(Math.max(0, x)), y: round4(Math.max(0, y)),
            width: round4(Math.min(1, w)), height: round4(Math.min(1, h)),
            groups: Array.isArray(t.groups) ? t.groups.slice() : [],
        });
    }
    if (tiles.length === 0)
        return null;
    return { id: String(raw.id !== undefined ? raw.id : fallbackId), tiles };
}

function normalizeLayouts(list) {
    if (!Array.isArray(list))
        return [];
    const out = [];
    const ids = new Set();
    list.forEach((raw, i) => {
        const l = normalizeLayout(raw, `Layout ${i + 1}`);
        if (!l)
            return;
        let id = l.id, n = 2;
        while (ids.has(id))
            id = `${l.id} (${n++})`;
        l.id = id;
        ids.add(id);
        out.push(l);
    });
    return out;
}

function uniqueId(layouts, base = 'Layout') {
    const ids = new Set(layouts.map(l => l.id));
    let n = layouts.length + 1;
    while (ids.has(`${base} ${n}`))
        n++;
    return `${base} ${n}`;
}

// Pixel rectangle for a normalised tile inside a work area, with gaps applied.
function tileToRect(tile, wa, innerGap, outerGap) {
    const x0 = wa.x + Math.round(tile.x * wa.width);
    const y0 = wa.y + Math.round(tile.y * wa.height);
    const x1 = wa.x + Math.round((tile.x + tile.width) * wa.width);
    const y1 = wa.y + Math.round((tile.y + tile.height) * wa.height);
    const half = Math.floor(innerGap / 2);
    const left = tile.x <= EPS ? outerGap : half;
    const top = tile.y <= EPS ? outerGap : half;
    const right = tile.x + tile.width >= 1 - EPS ? outerGap : innerGap - half;
    const bottom = tile.y + tile.height >= 1 - EPS ? outerGap : innerGap - half;
    return {
        x: x0 + left,
        y: y0 + top,
        width: Math.max(1, x1 - x0 - left - right),
        height: Math.max(1, y1 - y0 - top - bottom),
    };
}

// Approximate inverse of tileToRect, used after a smart resize.
function rectToTile(r, wa, innerGap, outerGap) {
    const half = innerGap / 2;
    let x0 = r.x - half, y0 = r.y - half, x1 = r.x + r.width + half, y1 = r.y + r.height + half;
    if (Math.abs(r.x - outerGap - wa.x) <= half + 2)
        x0 = wa.x;
    if (Math.abs(r.y - outerGap - wa.y) <= half + 2)
        y0 = wa.y;
    if (Math.abs(r.x + r.width + outerGap - (wa.x + wa.width)) <= half + 2)
        x1 = wa.x + wa.width;
    if (Math.abs(r.y + r.height + outerGap - (wa.y + wa.height)) <= half + 2)
        y1 = wa.y + wa.height;
    return {
        x: round4((x0 - wa.x) / wa.width),
        y: round4((y0 - wa.y) / wa.height),
        width: round4((x1 - x0) / wa.width),
        height: round4((y1 - y0) / wa.height),
        groups: [],
    };
}

function tileContains(t, nx, ny) {
    return nx >= t.x - EPS && nx < t.x + t.width + EPS && ny >= t.y - EPS && ny < t.y + t.height + EPS;
}

function tileIndexAt(layout, nx, ny) {
    for (let i = 0; i < layout.tiles.length; i++) {
        if (tileContains(layout.tiles[i], nx, ny))
            return i;
    }
    return -1;
}

function normUnion(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return {
        x, y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
        groups: [],
    };
}

function normOverlap(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return (w > EPS && h > EPS) ? w * h : 0;
}

// Grow a normalised rect until it is exactly covered by whole tiles.
function expandToTiles(layout, r) {
    let cur = Object.assign({}, r);
    let changed = true;
    while (changed) {
        changed = false;
        for (const t of layout.tiles) {
            if (normOverlap(t, cur) > 0) {
                const u = normUnion(cur, t);
                if (u.x < cur.x - EPS || u.y < cur.y - EPS ||
                    u.x + u.width > cur.x + cur.width + EPS ||
                    u.y + u.height > cur.y + cur.height + EPS) {
                    cur = u;
                    changed = true;
                }
            }
        }
    }
    return cur;
}

function spanTiles(layout, a, b) {
    return expandToTiles(layout, normUnion(a, b));
}

// Closest tile in a direction from a normalised rect; null if none.
function neighborTile(layout, r, dir) {
    let best = null, bestScore = Infinity;
    for (const t of layout.tiles) {
        let dist, overlap;
        if (dir === 'right' || dir === 'left') {
            overlap = Math.min(t.y + t.height, r.y + r.height) - Math.max(t.y, r.y);
            dist = dir === 'right' ? t.x - (r.x + r.width) : r.x - (t.x + t.width);
        } else {
            overlap = Math.min(t.x + t.width, r.x + r.width) - Math.max(t.x, r.x);
            dist = dir === 'down' ? t.y - (r.y + r.height) : r.y - (t.y + t.height);
        }
        if (dist < -EPS || overlap <= EPS)
            continue;
        const score = dist * 10 - overlap;
        if (score < bestScore) {
            bestScore = score;
            best = t;
        }
    }
    return best;
}

function sameTile(a, b) {
    return a && b && Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS &&
        Math.abs(a.width - b.width) < EPS && Math.abs(a.height - b.height) < EPS;
}

// ---- editing operations -------------------------------------------------

var MIN_TILE = 0.04;

function splitTile(layout, index, at, vertical) {
    const t = layout.tiles[index];
    if (!t)
        return false;
    at = round4(at);
    if (vertical) {
        // vertical line: left | right
        if (at - t.x < MIN_TILE || t.x + t.width - at < MIN_TILE)
            return false;
        const a = { x: t.x, y: t.y, width: round4(at - t.x), height: t.height, groups: [] };
        const b = { x: at, y: t.y, width: round4(t.x + t.width - at), height: t.height, groups: [] };
        layout.tiles.splice(index, 1, a, b);
    } else {
        if (at - t.y < MIN_TILE || t.y + t.height - at < MIN_TILE)
            return false;
        const a = { x: t.x, y: t.y, width: t.width, height: round4(at - t.y), groups: [] };
        const b = { x: t.x, y: at, width: t.width, height: round4(t.y + t.height - at), groups: [] };
        layout.tiles.splice(index, 1, a, b);
    }
    return true;
}

function near(a, b) {
    return Math.abs(a - b) < EPS;
}

// Remove a tile and let neighbours on one side absorb its space.
function deleteTile(layout, index) {
    if (layout.tiles.length <= 1)
        return false;
    const t = layout.tiles[index];
    const others = layout.tiles.filter((_, i) => i !== index);
    const sides = [
        { pick: o => near(o.x + o.width, t.x), axis: 'y', apply: o => { o.width = round4(o.width + t.width); } },
        { pick: o => near(o.x, t.x + t.width), axis: 'y', apply: o => { o.x = t.x; o.width = round4(o.width + t.width); } },
        { pick: o => near(o.y + o.height, t.y), axis: 'x', apply: o => { o.height = round4(o.height + t.height); } },
        { pick: o => near(o.y, t.y + t.height), axis: 'x', apply: o => { o.y = t.y; o.height = round4(o.height + t.height); } },
    ];
    for (const side of sides) {
        const start = side.axis === 'y' ? t.y : t.x;
        const len = side.axis === 'y' ? t.height : t.width;
        const cands = others.filter(o => {
            if (!side.pick(o))
                return false;
            const os = side.axis === 'y' ? o.y : o.x;
            const ol = side.axis === 'y' ? o.height : o.width;
            return Math.min(os + ol, start + len) - Math.max(os, start) > EPS;
        });
        if (cands.length === 0)
            continue;
        // Candidates must lie inside the deleted tile's span and cover it exactly.
        let inside = true, total = 0;
        for (const o of cands) {
            const os = side.axis === 'y' ? o.y : o.x;
            const ol = side.axis === 'y' ? o.height : o.width;
            if (os < start - EPS || os + ol > start + len + EPS)
                inside = false;
            total += ol;
        }
        if (!inside || !near(total, len))
            continue;
        cands.forEach(side.apply);
        layout.tiles.splice(index, 1);
        return true;
    }
    return false;
}

// Internal boundaries that can be dragged in the editor. Each slider moves a
// shared edge for every tile connected to it.
function computeSliders(layout) {
    const sliders = [];
    const seen = new Set();
    const tiles = layout.tiles;
    for (const vertical of [true, false]) {
        tiles.forEach((t, i) => {
            const c = vertical ? t.x + t.width : t.y + t.height;
            if (c >= 1 - EPS)
                return;
            const before = new Set([i]);
            const after = new Set();
            let changed = true;
            const s = o => vertical ? o.y : o.x;
            const l = o => vertical ? o.height : o.width;
            const ov = (a, b) => Math.min(s(a) + l(a), s(b) + l(b)) - Math.max(s(a), s(b)) > EPS;
            while (changed) {
                changed = false;
                tiles.forEach((o, j) => {
                    const startEdge = vertical ? o.x : o.y;
                    const endEdge = vertical ? o.x + o.width : o.y + o.height;
                    if (!after.has(j) && near(startEdge, c) && [...before].some(k => ov(tiles[k], o))) {
                        after.add(j);
                        changed = true;
                    }
                    if (!before.has(j) && near(endEdge, c) && [...after].some(k => ov(tiles[k], o))) {
                        before.add(j);
                        changed = true;
                    }
                });
            }
            if (after.size === 0)
                return;
            const key = `${vertical}:${[...before].sort().join(',')}|${[...after].sort().join(',')}`;
            if (seen.has(key))
                return;
            seen.add(key);
            let lo = Infinity, hi = -Infinity;
            for (const k of [...before, ...after]) {
                lo = Math.min(lo, s(tiles[k]));
                hi = Math.max(hi, s(tiles[k]) + l(tiles[k]));
            }
            sliders.push({ vertical, pos: c, before: [...before], after: [...after], start: lo, end: hi });
        });
    }
    return sliders;
}

function moveSlider(layout, slider, newPos) {
    const tiles = layout.tiles;
    let min = -Infinity, max = Infinity;
    for (const k of slider.before) {
        const t = tiles[k];
        min = Math.max(min, (slider.vertical ? t.x : t.y) + MIN_TILE);
    }
    for (const k of slider.after) {
        const t = tiles[k];
        max = Math.min(max, (slider.vertical ? t.x + t.width : t.y + t.height) - MIN_TILE);
    }
    const p = round4(Math.max(min, Math.min(max, newPos)));
    for (const k of slider.before) {
        const t = tiles[k];
        if (slider.vertical)
            t.width = round4(p - t.x);
        else
            t.height = round4(p - t.y);
    }
    for (const k of slider.after) {
        const t = tiles[k];
        if (slider.vertical) {
            t.width = round4(t.x + t.width - p);
            t.x = p;
        } else {
            t.height = round4(t.y + t.height - p);
            t.y = p;
        }
    }
    slider.pos = p;
    return p;
}
