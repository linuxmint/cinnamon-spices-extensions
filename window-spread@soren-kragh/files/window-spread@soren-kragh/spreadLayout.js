/* ==========================================================================
   SPREAD LAYOUT ENGINE
   ==========================================================================
   Computes where window thumbnails go in a "show all windows" spread.

   This file is self-contained: plain JavaScript, no DOM, no browser APIs, no
   dependencies. It is the only copy of the engine: the Cinnamon extension uses it
   directly, and the lab page (lab/window-spread-lab.html) loads this same file.

   Loading
     Cinnamon extension: on 6.8 and later through
       `imports.ui.extension.getCurrentExtension().imports.spreadLayout.SpreadLayout`
       (GJS's native importer exposes the top-level `var SpreadLayout`); on 6.0-6.6
       through Cinnamon's CommonJS-style loader (the export at the end of this file).
     Browser: <script src=".../spreadLayout.js">; defines the global `SpreadLayout`.
     Web Worker: the lab rebuilds the engine from `createSpreadLayout.toString()`.
     Node (tests): loaded as a CommonJS module, through the same export.

   Public API
     SpreadLayout.DEFAULTS
         All default settings ("knobs"), grouped as common / scoring / one group per
         algorithm. See section 1 below; this is the place to change defaults.
     SpreadLayout.ALGORITHMS
         ["optimizer", "push", "rows", "grid"]
     SpreadLayout.settings(algorithm, overrides?)
         Settings object for one algorithm: common + scoring + that algorithm's defaults,
         then `overrides` on top. For "optimizer" it also contains pushStart and rowsStart:
         the settings of the push-apart and ordered-rows layouts it can start from
         (defaults: DEFAULTS.push and DEFAULTS.rows).
     SpreadLayout.compute(windows, monitor, algorithm, settings?)
         windows    [{ id, x, y, w, h }]  real window frames: finite numbers, sizes
                    above 0. ids must be unique numbers; other fields are ignored.
         monitor    { x, y, w, h }  the area the spread may use, typically one monitor's
                    work area (without panels), in the same coordinates as the windows.
         algorithm  one of SpreadLayout.ALGORITHMS.
         settings   flat object as returned by SpreadLayout.settings(); omitted = defaults.
         returns    { targets: [{ id, x, y, w, h, scale }],   one per window: where its
                                                             thumbnail goes; scale = w / real w
                      score:   { total, size, sizes, movement, relations, overlap },  lower is better
                      info:    diagnostics, see compute() below }
     SpreadLayout.createCache()
         Optional helper that remembers the last layout per "slot" (for example one slot per
         monitor and workspace) and reuses it when nothing relevant has changed:
           const cache = SpreadLayout.createCache();
           cache.compute(windows, monitor, algorithm, settings, slot)  -> same as compute(),
                       plus `cached: true` when the previous layout of that slot was reused
           cache.forget(slot), cache.clear()
         Reused only on an exact match of the windows (ids and frames), the monitor area, the
         algorithm and the engine settings. The order of `windows` never matters, so changes
         in stacking or focus keep using the cached layout.
     SpreadLayout.score(targets, windows, monitor, settings)
         Score any layout (lower is better), with the same parts as above. With `centered`,
         compute() scores its layout before the final centering, so scoring its targets
         here can give a different (usually worse) movement part.
     SpreadLayout.random(seed)
         The engine's deterministic random generator (returns a function giving [0, 1)).
         Exposed for generating reproducible test data.

   Minimized windows
     Pass them like any other window, with their normal (unminimized) frame. The engine has no
     notion of minimized state, so minimizing or restoring a window never changes the layout.

   Guarantees
     - Only window positions and sizes are read. Stacking order and focus history are
       never used: windows are processed in an order derived from geometry alone.
     - Deterministic: the same input and settings always give the same result, and
       the same layout (moved along) wherever the monitor is (for whole-pixel
       coordinates, as window frames are).
     - Thumbnails never overlap, keep at least `gap` px between them, plus
       `extraGapX` side by side or `extraGapY` one above the other (unless the gaps
       leave no room on the monitor; see DEVELOPMENT.md section 4), and stay inside
       the monitor area minus `margin`.
     - The optimizer never scores worse than the push-apart and ordered-rows
       layouts, when given the same settings as those algorithms (pushStart /
       rowsStart; gap filling, if on, comes after this comparison).
     - Input it can't lay out (a non-finite number, a window or work area of size 0, a
       setting outside its allowed values, see LIMITS) makes compute() throw instead of
       returning an unusable layout.

   Not done here (left to the caller)
     - Animation, drawing, input handling, multi-monitor assignment.
     - A time budget: effort is a fixed number of descent steps (`optimizer.steps`), set
       by the user; see DEVELOPMENT.md 5.9.
   ========================================================================== */
// All engine code lives inside this factory function, so that it can also be handed to
// Web Workers as text (createSpreadLayout.toString()) without keeping a second copy.
function createSpreadLayout() {
"use strict";

/* --------------------------------------------------------------------------
   1. SETTINGS (the knobs)
   Change defaults here. Every value can also be overridden per call through
   SpreadLayout.settings(algorithm, overrides).
   -------------------------------------------------------------------------- */
const DEFAULTS = {
  // Used by every algorithm.
  common: {
    margin: 8,         // px of empty border kept inside the monitor area
    gap: 4,            // px minimum gap between thumbnails
    extraGapX: 0,      // px added to the gap between thumbnails side by side, and
    extraGapY: 0,      // between thumbnails one above the other (for the caller's decorations)
    fidelity: 0.8,       // relative sizes: 1 = exact, 0 = all thumbnails same area, 0.5 = area ratios square-rooted
    maxScale: 0.9,     // largest thumbnail scale; 1 = never bigger than the real window
    centered: false,   // true: as a last step, move the finished arrangement as a whole to the center
    fill: false,       // afterwards, grow thumbnails into free space (makes sizes uneven)
    maxGrowth: 1.5,    // fill: maximum growth factor per thumbnail
  },
  // What a good layout is: the weights of the score's cost terms (lower score is better). Used
  // by the optimizer's search and safeguard, the polish step, and the score compute() and
  // score() report. For comparing layouts only their balance matters; the optimizer's descent
  // also weighs them against its own overlap weight (rising from 3 to 300, GD_MU_*), so
  // scaling all of them changes its results. The comments give each weight as the
  // settings window presents it, as a reward for a quality (wSizes, which only the lab offers,
  // in the same style); in the score, its term is the cost of falling short of it.
  scoring: {
    wSize: 3,          // "Thumbnail size": reward for bigger thumbnails
    wSizes: 5,         // "Keep sizes" (lab only): reward for relative sizes as size fidelity sets them
    wPlace: 2,         // "Stay in place": reward for thumbnails staying near their real window
    wRelations: 1,     // "Keep relations": reward for windows keeping how they sit relative to each other
    relationsMethod: "direction", // relations measured as "order" (left/right, above/below) or "direction" (angles)
    neighborFocus: 0.5, // direction mode only: 0 = all pairs count equally, 1 = nearby pairs matter most
  },
  // Optimizer (gradient descent from several starts).
  optimizer: {
    steps: 1000,       // descent steps in total, shared by all starts (the effort / time knob);
                       // in one step every window moves and every pair is checked
    starts: 4,         // parallel starts racing each other
    checkpoint: 0.2,   // point of the schedule (0..1) where the first weak starts are dropped
    firstStep: 0.3,    // first step size (x average window size): how far windows may jump early on
    seed: 1,           // random seed for shaking starts whose kind is taken (with "mixed": beyond the four kinds)
    dropWeakStarts: true, // drop the worse half of the starts at each checkpoint
    polish: true,      // greedy final polish
    startFrom: "mixed", // "push" | "rows" | "grid" | "none" (real positions) | "mixed" (one kind per start)
    // pushStart, rowsStart: settings of the push-apart and ordered-rows layouts the optimizer can
    // start from. Filled in by settings() from DEFAULTS.push and DEFAULTS.rows; pass the same
    // values as those algorithms use, so the optimizer is guaranteed to do at least as well.
  },
  // Push apart.
  push: {
    passes: 1000,      // maximum push-apart passes
    strength: 0.3,     // push strength per pass (fraction of the overlap)
    matchShape: 0.5,   // bias pushes toward the screen's shape (0 = straight apart)
    polish: true,      // greedy final polish
  },
  // Ordered rows.
  rows: {
    rows: 0,           // number of rows; 0 = choose automatically
  },
  // Equal grid. No settings of its own: each window always goes in the cell nearest to it.
  grid: {},
};

/* --------------------------------------------------------------------------
   2. INTERNAL CONSTANTS
   Fixed details of the algorithms. Not meant as user settings; changing them
   changes behavior in ways the lab has not been tuned for.
   -------------------------------------------------------------------------- */
const INTERNAL = {
  // Push apart (resolve)
  PUSH_NUDGE: 0.5,                                   // px added to every push so progress never stalls
  START_RESOLVE: { passes: 1000, strength: 0.5 },   // overlap removal for the optimizer's rows / grid starts
  CLEANUP: { passes: 2000, strength: 0.5 },         // final overlap removal
  // Gap handling: the gap must be chosen in unscaled units before the final scale is known.
  DENSITY_GUESS: 0.5,                                // expected share of the screen covered, for the first gap guess
  DENSITY_SEARCH: 0.7,                               // the same for the optimizer's search, which packs tighter
  GAP_ROUNDS: 100,                                   // max rounds of widening the gap until it is right
  GAP_OVERSHOOT: 1.003,                              // widen slightly more than needed, to converge quickly
  // Seeds used only to break exact ties (windows with identical centers)
  SEED_TIES: 12345, SEED_CLEANUP: 1, SEED_GAP: 7,
  // Optimizer
  START_KINDS: ["push", "rows", "grid", "none"],     // rotation used by startFrom "mixed"
  // Descent
  GD_STEP_END: 0.0005,                               // last step size (x avg window size); the first is S.firstStep
  GD_MU_START: 3, GD_MU_END: 300,                    // overlap weight during the descent (W_OVERLAP: the search score's)
  GD_SMOOTH: 0.02, GD_SMOOTH_WH: 0.02,               // softness of the box's sides (x avg size) and of width vs height
  GD_SMOOTH_CAP: 0.02,                               // softness of the size term's corner at the max scale (ln scale)
  GD_NEAR: 0.1,                                      // relations' gradient capped below this distance (x avg size)
  GD_B1: 0.9, GD_B2: 0.999,                          // Adam: decay of the gradient's running mean and mean square
  GD_SHAKE: 0.3,                                     // starts whose kind is taken: shaken by this (x avg size)
  START_SEED_A: 7919, START_SEED_B: 104729,          // per-start random seeds: seed * A + start * B
  // Scoring
  W_OVERLAP: 40,                                     // overlap part of the score: 0 unless thumbnails still overlap
                                                     // (polish, safeguard, the search's final pick when weak starts
                                                     // aren't dropped); the descent itself uses GD_MU_*
  W_REL: 4, W_DISTORT: 2,                            // internal scale of the relations and size-distortion terms
  NEAR: 0.1,                                         // direction mode: "nearby" distance, fraction of the screen diagonal
  // Polish
  POLISH_PASSES: 60, POLISH_FIRST_STEP: 0.5, POLISH_MIN_STEP: 1, // passes; first step (x avg size); smallest step px
  // Fill gaps
  FILL_BISECT: 24,                                   // bisection steps when growing a thumbnail
};

/* --------------------------------------------------------------------------
   3. SMALL HELPERS
   -------------------------------------------------------------------------- */
// Deterministic pseudo-random generator (mulberry32). Returns a function giving [0, 1).
function random(seed) {
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Thumbnail rectangle from its center; ow/oh carry the real window size along.
const rectC = (id, cx, cy, w, h, ow, oh) => ({ id, x: cx - w / 2, y: cy - h / 2, w, h, ow, oh });
// Bounding box of center-based rectangles {x, y, w, h}.
function bounds(R) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of R) {
    x1 = Math.min(x1, r.x - r.w / 2); y1 = Math.min(y1, r.y - r.h / 2);
    x2 = Math.max(x2, r.x + r.w / 2); y2 = Math.max(y2, r.y + r.h / 2);
  }
  return { x1, y1, x2, y2 };
}
// Overlap area of center-based rectangles i and j, given center and size arrays.
function overlapArea(X, Y, W, H, i, j) {
  const ox = (W[i] + W[j]) / 2 - Math.abs(X[i] - X[j]), oy = (H[i] + H[j]) / 2 - Math.abs(Y[i] - Y[j]);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

// Optimal assignment (Hungarian method, O(n^3)): for an n×n cost matrix, returns colOf[row]
// such that the sum of cost[row][colOf[row]] is as small as possible. Deterministic.
function assignOptimal(cost) {
  const n = cost.length, INF = Infinity;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1), way = new Int32Array(n + 1); // p[col] = row (1-based), 0 = free
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF), used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const colOf = new Array(n);
  for (let j = 1; j <= n; j++) colOf[p[j] - 1] = j - 1;
  return colOf;
}

/* --------------------------------------------------------------------------
   4. SHARED PREPARATION
   -------------------------------------------------------------------------- */
// Canonical processing order, derived only from geometry: center y, center x, width,
// height, then id for exact duplicates. Stacking order is never read.
function canonical(ws) {
  return ws.slice().sort((a, b) =>
    (a.y + a.h / 2) - (b.y + b.h / 2) || (a.x + a.w / 2) - (b.x + b.w / 2) || a.w - b.w || a.h - b.h || a.id - b.id);
}
// Per window: real size (ow, oh), real center (cx, cy), size-fidelity factor f and the
// "layout size" (lw, lh) = real size * f, in which all uniform-scale algorithms work.
function prep(ws, S) {
  const items = canonical(ws).map(w => ({ id: w.id, ow: w.w, oh: w.h, cx: w.x + w.w / 2, cy: w.y + w.h / 2 }));
  const amax = Math.max(...items.map(i => i.ow * i.oh));
  for (const it of items) {
    it.f = Math.pow(amax / (it.ow * it.oh), (1 - S.fidelity) / 2);
    it.lw = it.ow * it.f; it.lh = it.oh * it.f;
  }
  return items;
}
// The usable area: monitor minus margin. Center and diagonal are the monitor's.
function workArea(monitor, margin) {
  return {
    x: monitor.x + margin, y: monitor.y + margin, w: monitor.w - 2 * margin, h: monitor.h - 2 * margin,
    cx: monitor.x + monitor.w / 2, cy: monitor.y + monitor.h / 2, diag: Math.hypot(monitor.w, monitor.h),
  };
}
// The gaps in px: x between thumbnails side by side, y one above the other.
function gaps(S) {
  return { x: S.gap + (S.extraGapX || 0), y: S.gap + (S.extraGapY || 0) };
}
// First guess of the gaps in layout units (the final scale is not known yet), for
// thumbnails expected to cover `density` of the work area: the padding { x, y }
// added to the layout sizes.
function estPad(items, S, A, density = INTERNAL.DENSITY_GUESS) {
  const sum = items.reduce((s, i) => s + i.lw * i.lh, 0);
  const est = Math.min(1, Math.sqrt(A.w * A.h * density / sum));
  const g = gaps(S);
  return { x: g.x / est, y: g.y / est };
}

/* --------------------------------------------------------------------------
   5. PUSH-APART PRIMITIVES
   Layout-space rectangles R: { x, y } = center, { w, h } = layout size + padding
   { x, y } (the gaps in layout units, "pad").
   -------------------------------------------------------------------------- */
// Push overlapping pairs apart until nothing overlaps (or maxPasses passes), each push
// `strength` of the overlap. `matchShape` biases pushes toward the work area's shape.
// Returns the number of passes used.
function resolve(R, maxPasses, strength, matchShape, A, rng) {
  const target = A.w / A.h;
  let it = 0;
  for (; it < maxPasses; it++) {
    let bx = 1, by = 1;
    if (matchShape > 0) {
      const b = bounds(R), ratio = target / ((b.x2 - b.x1) / (b.y2 - b.y1));
      if (ratio > 1) bx = Math.pow(ratio, matchShape); else by = Math.pow(1 / ratio, matchShape);
    }
    let moved = false;
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i], c = R[j];
      let dx = c.x - a.x, dy = c.y - a.y;
      const ox = (a.w + c.w) / 2 - Math.abs(dx), oy = (a.h + c.h) / 2 - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) { const g = rng() * Math.PI * 2; dx = Math.cos(g); dy = Math.sin(g); }
      dx *= bx; dy *= by;
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      // distance along (dx, dy) that separates the pair
      const need = Math.min(Math.abs(dx) > 1e-9 ? ox / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? oy / Math.abs(dy) : Infinity);
      const amt = (strength * need + INTERNAL.PUSH_NUDGE) / 2;
      a.x -= dx * amt; a.y -= dy * amt; c.x += dx * amt; c.y += dy * amt;
    }
    if (!moved) break;
  }
  return it;
}
// If the real final scale is larger than first guessed, the on-screen gaps would be too
// small: widen the padding (pad, updated) to what the real scale needs and push apart
// again.
function enforceGap(items, R, pad, A, S) {
  // Overlaps left when the push-apart hit its pass limit (none otherwise: then this
  // returns at once)
  resolve(R, INTERNAL.CLEANUP.passes, INTERNAL.CLEANUP.strength, 0, A, random(INTERNAL.SEED_GAP));
  const g = gaps(S);
  for (let k = 0; k < INTERNAL.GAP_ROUNDS; k++) {
    const b = bounds(R), s = Math.min(A.w / (b.x2 - b.x1 - pad.x), A.h / (b.y2 - b.y1 - pad.y));
    const needX = g.x / s, needY = g.y / s;
    if (needX <= pad.x * 1.0001 + 1e-9 && needY <= pad.y * 1.0001 + 1e-9) break;
    pad.x = needX * INTERNAL.GAP_OVERSHOOT; pad.y = needY * INTERNAL.GAP_OVERSHOOT;
    items.forEach((it, i) => { R[i].w = it.lw + pad.x; R[i].h = it.lh + pad.y; });
    resolve(R, INTERNAL.CLEANUP.passes, INTERNAL.CLEANUP.strength, 0, A, random(INTERNAL.SEED_GAP));
  }
}
// Scale the arrangement uniformly so the windows (not their padding) fill the work area,
// centered. Returns thumbnail rectangles.
function finalize(items, R, pad, A, S) {
  const b = bounds(R);
  const s = Math.min(A.w / (b.x2 - b.x1 - pad.x), A.h / (b.y2 - b.y1 - pad.y));
  const bcx = (b.x1 + b.x2) / 2, bcy = (b.y1 + b.y2) / 2;
  return items.map((it, i) => {
    const sc = Math.min(s * it.f, S.maxScale);
    return rectC(it.id, A.cx + (R[i].x - bcx) * s, A.cy + (R[i].y - bcy) * s, it.ow * sc, it.oh * sc, it.ow, it.oh);
  });
}

/* --------------------------------------------------------------------------
   6. SCORING
   One score for any finished layout; lower is better. Shared by all algorithms,
   the optimizer's search (in layout units) and the polish step.
   -------------------------------------------------------------------------- */
// Direction method: penalty of a pair with weight wt and real direction (unit
// vector ux, uy) that now points along (ndx, ndy): 0 if the same, wt if
// opposite.
const dirPen = (wt, ux, uy, ndx, ndy) => {
  const d = Math.sqrt(ndx * ndx + ndy * ndy);
  return d < 1e-6 ? wt * 0.5 : wt * (1 - (ux * ndx + uy * ndy) / d) / 2;
};
// Relations term, shared by the scorer and the optimizer. O* = real centers and
// sizes, NW/NH = current sizes (thumbnail or layout sizes). Returns
// pen(X, Y, i, j) for current centers X, Y, and the normalizer relNorm (sum of
// pair weights). Direction method (rows: true): the pair values also come as
// n×n row arrays, for hot loops to read directly. For window i and another
// window j, at k = i * n + j, RW[k] is the pair's weight and (RUX[k], RUY[k])
// the real unit direction from i to j; dirPen takes them with (ndx, ndy) =
// center of j minus center of i.
function makeRelations(OX, OY, OW, OH, NW, NH, S, diag) {
  const n = OX.length, order = S.relationsMethod === "order", relOn = S.wRelations > 0;
  const rows = relOn && !order;
  const pairs = order ? new Array(n * n) : null;
  const RW = rows ? new Float64Array(n * n) : null;
  const RUX = rows ? new Float64Array(n * n) : null;
  const RUY = rows ? new Float64Array(n * n) : null;
  let relNorm = 0;
  if (relOn) {
    const near = INTERNAL.NEAR * diag;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const odx = OX[j] - OX[i], ody = OY[j] - OY[i], d = Math.sqrt(odx * odx + ody * ody);
      if (order) {
        // Confidence that the pair is side by side (cx) or one above the other (cy): how clearly
        // they are separated along that axis, times how much the pair is oriented along it
        // (cos² / sin² of the angle between them). Two windows far apart at almost the same
        // height are side by side, not "above" each other, so their vertical order barely counts.
        const pr = { sx: Math.sign(odx), sy: Math.sign(ody) };
        const hx = d > 1e-6 ? (odx * odx) / (d * d) : 0, hy = d > 1e-6 ? (ody * ody) / (d * d) : 0;
        pr.cx = Math.min(1, Math.abs(odx) / ((OW[i] + OW[j]) / 4)) * hx;
        pr.cy = Math.min(1, Math.abs(ody) / ((OH[i] + OH[j]) / 4)) * hy;
        pr.nx = (NW[i] + NW[j]) / 4; pr.ny = (NH[i] + NH[j]) / 4;
        pr.wt = pr.cx + pr.cy;
        relNorm += pr.wt; pairs[i * n + j] = pr;
      } else {
        const ux = d > 1e-6 ? odx / d : 0, uy = d > 1e-6 ? ody / d : 0;
        const wt = d > 1e-6 ? Math.pow(near / (d + near), 4 * S.neighborFocus) : 0;
        const a = i * n + j, b = j * n + i;
        RW[a] = RW[b] = wt;
        RUX[a] = ux; RUX[b] = -ux;
        RUY[a] = uy; RUY[b] = -uy;
        relNorm += wt;
      }
    }
  }
  const pen = (X, Y, p, q) => {
    if (!order) {
      const k = p * n + q, wt = RW[k];
      return wt ? dirPen(wt, RUX[k], RUY[k], X[q] - X[p], Y[q] - Y[p]) : 0;
    }
    const i = p < q ? p : q, j = p < q ? q : p, pr = pairs[i * n + j];
    if (!pr.wt) return 0;
    // 0 while the order is kept, up to the pair's weight once clearly flipped
    const ndx = X[j] - X[i], ndy = Y[j] - Y[i];
    return (
      pr.cx * clamp(-pr.sx * ndx / pr.nx, 0, 1) +
      pr.cy * clamp(-pr.sy * ndy / pr.ny, 0, 1)
    );
  };
  return { relOn, relNorm, pen, rows, RW, RUX, RUY, pairs };
}
// Scorer for thumbnails T (sizes fixed): parts(X, Y) for full scores, plus the
// pieces the polish evaluates itself (real centers OX/OY, relations, and the
// weights kDisp, kRel, kOv of the movement, relations and overlap terms).
function makeScorer(T, ws, S, A) {
  const by = new Map(ws.map(w => [w.id, w])), n = T.length, O = T.map(t => by.get(t.id));
  const amax = Math.max(...O.map(w => w.w * w.h));
  const f = O.map(w => Math.pow(amax / (w.w * w.h), (1 - S.fidelity) / 2));
  const OX = O.map(w => w.x + w.w / 2), OY = O.map(w => w.y + w.h / 2);
  const Wt = T.map(t => t.w), Ht = T.map(t => t.h);
  const sumA = T.reduce((q, t) => q + t.w * t.h, 0) || 1;
  // Log scale of each thumbnail, after removing the intended size-fidelity
  // factor. A thumbnail held at maxScale counts as large as the largest one
  // that isn't (as maxScale if all are): the limit, not the layout, keeps it
  // from its intended size, so it costs neither size nor evenness.
  const lr = O.map((w, i) => Math.log(Wt[i] / w.w / f[i]));
  const capped = O.map((w, i) => Wt[i] / w.w >= S.maxScale * (1 - 1e-9));
  let top = -Infinity;
  for (let i = 0; i < n; i++) if (!capped[i]) top = Math.max(top, lr[i]);
  if (top === -Infinity) top = Math.log(S.maxScale);
  for (let i = 0; i < n; i++) if (capped[i]) lr[i] = Math.max(lr[i], top);
  // size: mean -ln(scale)
  let size = 0;
  for (let i = 0; i < n; i++) size -= Math.min(lr[i], Math.log(S.maxScale));
  size /= Math.max(1, n);
  // size distortion: mean absolute deviation of the log scale; 0 when all share one scale
  const lmean = lr.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const distortion = lr.reduce((a, v) => a + Math.abs(v - lmean), 0) / Math.max(1, n);
  const rel = makeRelations(OX, OY, O.map(w => w.w), O.map(w => w.h), Wt, Ht, S, A.diag);
  const dist = (X, Y, i) => { const dx = X[i] - OX[i], dy = Y[i] - OY[i]; return Math.sqrt(dx * dx + dy * dy); };
  const kDisp = S.wPlace * 2 / Math.max(1, n) / A.diag;
  const kRel = rel.relNorm > 0 ? S.wRelations * INTERNAL.W_REL / rel.relNorm : 0;
  const kOv = INTERNAL.W_OVERLAP / sumA;
  function parts(X, Y) {
    let d = 0, r = 0, o = 0;
    for (let i = 0; i < n; i++) {
      d += dist(X, Y, i);
      for (let j = i + 1; j < n; j++) { if (rel.relOn) r += rel.pen(X, Y, i, j); o += overlapArea(X, Y, Wt, Ht, i, j); }
    }
    const p = { size: S.wSize * size, sizes: S.wSizes * INTERNAL.W_DISTORT * distortion, movement: kDisp * d, relations: kRel * r, overlap: kOv * o };
    p.total = p.size + p.sizes + p.movement + p.relations + p.overlap;
    return p;
  }
  return { parts, Wt, Ht, n, OX, OY, rel, kDisp, kRel, kOv };
}
function scoreLayout(T, ws, S, A) {
  return makeScorer(T, ws, S, A).parts(T.map(t => t.x + t.w / 2), T.map(t => t.y + t.h / 2));
}

/* --------------------------------------------------------------------------
   7. ALGORITHMS
   Each takes (windows, settings, work area, info) and returns thumbnail rectangles
   { id, x, y, w, h, ow, oh }. `info` collects diagnostics.
   -------------------------------------------------------------------------- */
// Equal grid: equal cells, each window shrunk to fit its own cell (scales windows unevenly;
// ignores size fidelity). Each window goes in the cell nearest to it: the assignment with the
// smallest total distance between windows' real centers and their cells' centers (Hungarian
// method), so the arrangement follows where windows are, never the stacking order.
function layoutGrid(ws, S, A) {
  const items = prep(ws, { ...S, fidelity: 1 });
  const n = items.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), g = gaps(S);
  // Gaps between cells; where the gap settings leave no room for the cells, the gaps
  // shrink to take half the width (or height).
  const gx = A.w - g.x * (cols - 1) > 0 ? g.x : A.w / 2 / (cols - 1);
  const gy = A.h - g.y * (rows - 1) > 0 ? g.y : A.h / 2 / (rows - 1);
  const cw = (A.w - gx * (cols - 1)) / cols, ch = (A.h - gy * (rows - 1)) / rows;
  // cell centers, row by row; the last row is centered if it isn't full
  const cells = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
    const off = (cols - inRow) * (cw + gx) / 2;
    cells.push({ x: A.x + off + c * (cw + gx) + cw / 2, y: A.y + r * (ch + gy) + ch / 2 });
  }
  const cellOf = assignOptimal(items.map(it => cells.map(c => Math.hypot(it.cx - c.x, it.cy - c.y))));
  return items.map((it, k) => {
    const cell = cells[cellOf[k]], sc = Math.min(cw / it.ow, ch / it.oh, S.maxScale);
    return rectC(it.id, cell.x, cell.y, it.ow * sc, it.oh * sc, it.ow, it.oh);
  });
}

// Push apart: start at the real positions, push overlapping pairs apart,
// scale the whole arrangement uniformly to fit.
function layoutPush(ws, S, A, info) {
  const items = prep(ws, S), pad = estPad(items, S, A);
  const R = items.map(it => ({ x: it.cx, y: it.cy, w: it.lw + pad.x, h: it.lh + pad.y }));
  const it = resolve(R, S.passes, S.strength, S.matchShape, A, random(INTERNAL.SEED_TIES));
  info.passes = it; info.hitLimit = it >= S.passes;
  enforceGap(items, R, pad, A, S);
  return finalize(items, R, pad, A, S);
}

// Ordered rows: rows top to bottom by vertical position, left to right within a row;
// the row count giving the largest uniform scale wins (or S.rows if set).
function layoutRows(ws, S, A) {
  const items = prep(ws, S), n = items.length, g = gaps(S), gx = g.x, gy = g.y;
  const byY = items.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx || a.id - b.id);
  const total = byY.reduce((s, i) => s + i.lw, 0);
  // r rows, filled in reading order; s = the scale at which they fit
  const tryRows = r => {
    const buckets = Array.from({ length: r }, () => []);
    let acc = 0;
    for (const it of byY) { const mid = acc + it.lw / 2; acc += it.lw; buckets[Math.min(r - 1, Math.floor(mid / (total / r)))].push(it); }
    const rows = buckets.filter(b => b.length).map(b => b.sort((a, c) => a.cx - c.cx || a.id - c.id));
    let s = Infinity, sumH = 0;
    for (const row of rows) {
      s = Math.min(s, (A.w - gx * (row.length - 1)) / row.reduce((q, i) => q + i.lw, 0));
      sumH += Math.max(...row.map(i => i.lh));
    }
    s = Math.min(s, (A.h - gy * (rows.length - 1)) / sumH);
    return { s, rows };
  };
  const fixed = S.rows | 0;
  let best = fixed > 0 ? tryRows(Math.min(fixed, n)) : null;
  if (!best || !(best.s > 0)) { // automatic, also when the fixed row count leaves no room
    best = null;
    for (let r = 1; r <= n; r++) {
      const t = tryRows(r);
      if (!best || t.s > best.s + 1e-9) best = t;
    }
  }
  if (!(best.s > 0)) throw new Error("ordered rows: the gaps leave no room for the windows");
  const { s, rows } = best, out = [];
  const H = rows.reduce((q, row) => q + Math.max(...row.map(i => i.lh)) * s, 0) + gy * (rows.length - 1);
  let y = A.cy - H / 2;
  for (const row of rows) {
    const rh = Math.max(...row.map(i => i.lh)) * s;
    const rw = row.reduce((q, i) => q + i.lw * s, 0) + gx * (row.length - 1);
    let x = A.cx - rw / 2;
    for (const it of row) {
      const sc = Math.min(s * it.f, S.maxScale);
      out.push(rectC(it.id, x + it.lw * s / 2, y + rh / 2, it.ow * sc, it.oh * sc, it.ow, it.oh));
      x += it.lw * s + gx;
    }
    y += rh + gy;
  }
  return out;
}

// Optimizer: gradient descent over window centers in layout units (one shared
// scale, exact relative sizes), on a smoothed search score. The overlap
// penalty starts weak and grows, so the arrangement first contracts through
// overlaps and then separates. Several starts race; at checkpoints the worse
// half is dropped.
function layoutOptimizer(ws, S, A, info, shared) {
  // R0: real positions, padded as push apart pads them (the starting layouts are built
  // with these boxes, so the push-apart start is exactly the push-apart algorithm's).
  // The search itself pads less: it packs tighter, so its scale and gap come out larger.
  const items = prep(ws, S), n = items.length, padStart = estPad(items, S, A);
  const R0 = items.map(it => ({ x: it.cx, y: it.cy, w: it.lw + padStart.x, h: it.lh + padStart.y }));
  if (n < 2) return finalize(items, R0, padStart, A, S);
  const pad = estPad(items, S, A, INTERNAL.DENSITY_SEARCH);

  // Starting points. "none" = real (overlapping) positions; "push" = push-apart with the
  // push-apart algorithm's settings (S.pushStart); "rows" / "grid" = those layouts' centers
  // with their overall scale undone, then overlaps resolved (true-size windows can be too
  // big for grid cells). The push-apart and ordered-rows layouts are also handed
  // to the safeguard (`shared`), which would otherwise compute them again.
  const startCache = {};
  const startPos = kind => {
    if (startCache[kind]) return startCache[kind];
    const R = R0.map(r => ({ ...r })), push = S.pushStart, P = INTERNAL.START_RESOLVE;
    if (kind === "push") { // = the push-apart algorithm's first step
      const rng = random(INTERNAL.SEED_TIES);
      resolve(R, push.passes, push.strength, push.matchShape, A, rng);
      shared.push = { items, R: R.map(r => ({ ...r })), pad: { ...padStart } };
    } else if (kind === "rows" || kind === "grid") {
      let T;
      try {
        T = kind === "rows" ? layoutRows(ws, { ...S, rows: S.rowsStart.rows }, A) : layoutGrid(ws, S, A);
      } catch (e) { // no room for ordered rows: start from the push-apart layout instead
        return (startCache[kind] = startPos("push"));
      }
      if (kind === "rows") shared.rows = T;
      const byId = new Map(T.map(t => [t.id, t]));
      let ls = 0;
      for (const it of items) ls += Math.log(byId.get(it.id).w / it.lw);
      const s0 = Math.exp(ls / n);
      items.forEach((it, i) => { const t = byId.get(it.id); R[i].x = (t.x + t.w / 2) / s0; R[i].y = (t.y + t.h / 2) / s0; });
      resolve(R, P.passes, P.strength, 0, A, random(INTERNAL.SEED_TIES));
    }
    return (startCache[kind] = { X: Float64Array.from(R, r => r.x), Y: Float64Array.from(R, r => r.y) });
  };
  const KINDS = INTERNAL.START_KINDS;
  const kindOf = c => S.startFrom === "mixed" ? KINDS[c % KINDS.length] : (S.startFrom || "push");

  const W = Float64Array.from(items, it => it.lw + pad.x), H = Float64Array.from(items, it => it.lh + pad.y);
  const OX = Float64Array.from(items, it => it.cx), OY = Float64Array.from(items, it => it.cy);
  let sumA = 0, avg = 0;
  for (let i = 0; i < n; i++) { sumA += W[i] * H[i]; avg += Math.sqrt(W[i] * H[i]) / n; }
  const rel = makeRelations(OX, OY, items.map(it => it.ow), items.map(it => it.oh), items.map(it => it.lw), items.map(it => it.lh), S, A.diag);
  const relOn = rel.relOn, relPen = rel.pen, pairs = rel.pairs;
  const relRows = rel.rows, RW = rel.RW, RUX = rel.RUX, RUY = rel.RUY;
  const kDisp = S.wPlace * 2 / n / A.diag;
  const kRel = rel.relNorm > 0 ? S.wRelations * INTERNAL.W_REL / rel.relNorm : 0;
  let mOX = 0, mOY = 0;
  for (let i = 0; i < n; i++) { mOX += OX[i] / n; mOY += OY[i] / n; }

  // The size terms of the score at shared scale s: -ln(min(s, maxScale)) x
  // wSize (thumbnails held at the maximum scale count as their intended size,
  // so the sizes term is 0 for one shared scale).
  const lnMax = Math.log(S.maxScale);
  const sizeCost = s => -Math.min(Math.log(s), lnMax) * S.wSize;
  // The same, with its corner rounded over GD_SMOOTH_CAP in ln s, for the
  // descent: returns the value and sets sizeSlope = d(value) / d(ln s).
  const tauC = INTERNAL.GD_SMOOTH_CAP;
  let sizeSlope = 0;
  const sizeCostSmooth = ls => {
    // soft min(ln s, lnMax) = ln s - tauC * softplus((ln s - lnMax) / tauC)
    const z = (ls - lnMax) / tauC;
    const sp = z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
    sizeSlope = -S.wSize / (1 + Math.exp(z));
    return -(ls - tauC * sp) * S.wSize;
  };

  // Arrangement placed as the pipeline will place it (before any final
  // centering): scaled by s about the center of the box (x1, y1, x2, y2), then
  // moved toward the real windows as far as the work area allows. Thumbnail i
  // lands at px + (X[i] - bcx) * s, which is also base + (X[i] - ref) * s with ref =
  // mean(X) while the move is free (mode 0), the box's left side + pad.x / 2
  // when held at the work area's left (1), or its right side - pad.x / 2 when
  // held at the right (2). Same for y.
  const place = {
    px: 0, py: 0, bcx: 0, bcy: 0, modeX: 0, modeY: 0, refX: 0, refY: 0
  };
  const placeAt = (X, Y, x1, y1, x2, y2, s) => {
    const bcx = (x1 + x2) / 2, bcy = (y1 + y2) / 2;
    place.bcx = bcx; place.bcy = bcy;
    let mX = 0, mY = 0;
    for (let i = 0; i < n; i++) { mX += X[i]; mY += Y[i]; }
    mX /= n; mY /= n;
    const mx = mOX - (mX - bcx) * s, my = mOY - (mY - bcy) * s;
    const hw = (x2 - x1 - pad.x) * s / 2, hh = (y2 - y1 - pad.y) * s / 2;
    const lx = A.x + hw, hx = A.x + A.w - hw;
    const ly = A.y + hh, hy = A.y + A.h - hh;
    place.px = clamp(mx, lx, hx); place.py = clamp(my, ly, hy);
    place.modeX = mx < lx ? 1 : mx > hx ? 2 : 0;
    place.modeY = my < ly ? 1 : my > hy ? 2 : 0;
    const mdX = place.modeX, mdY = place.modeY;
    place.refX = mdX === 0 ? mX : mdX === 1 ? x1 + pad.x / 2 : x2 - pad.x / 2;
    place.refY = mdY === 0 ? mY : mdY === 1 ? y1 + pad.y / 2 : y2 - pad.y / 2;
  };

  // The search score: scoreLayout() computed in layout units (exact while no
  // thumbnail is held at the max scale; with some held, the room to move toward
  // the real windows is a little underestimated), plus an overlap term between
  // the padded boxes, so it also counts gaps that are too small. Picks the winner
  // among the starts that finish when weak starts aren't dropped.
  const searchScore = (X, Y) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < n; i++) {
      const hw = W[i] / 2, hh = H[i] / 2;
      if (X[i] - hw < x1) x1 = X[i] - hw; if (X[i] + hw > x2) x2 = X[i] + hw;
      if (Y[i] - hh < y1) y1 = Y[i] - hh; if (Y[i] + hh > y2) y2 = Y[i] + hh;
    }
    const s = Math.min(A.w / (x2 - x1 - pad.x), A.h / (y2 - y1 - pad.y));
    placeAt(X, Y, x1, y1, x2, y2, s);
    let d = 0, o = 0, r = 0;
    for (let i = 0; i < n; i++) {
      const dx = place.px + (X[i] - place.bcx) * s - OX[i];
      const dy = place.py + (Y[i] - place.bcy) * s - OY[i];
      d += Math.sqrt(dx * dx + dy * dy);
      for (let j = i + 1; j < n; j++) {
        o += overlapArea(X, Y, W, H, i, j);
        if (relOn) r += relPen(X, Y, i, j);
      }
    }
    return (
      sizeCost(s) + kDisp * d +
      INTERNAL.W_OVERLAP * o / sumA + kRel * r
    );
  };

  // The smoothed search score and its gradient (into gX, gY), with overlap
  // weight mu (ramped up during the descent). Differences from the search score:
  // for the scale, the box's sides are soft maxima (log-sum-exp over GD_SMOOTH x
  // the average size), and so is the choice between its width and height; the
  // size term's corner at the max scale is rounded (GD_SMOOTH_CAP). The placement
  // toward the real windows uses the hard box.
  const gX = new Float64Array(n), gY = new Float64Array(n);
  const e1 = new Float64Array(n), e2 = new Float64Array(n);
  const e3 = new Float64Array(n), e4 = new Float64Array(n);
  const u1 = new Float64Array(n), u2 = new Float64Array(n);
  const tau = INTERNAL.GD_SMOOTH * avg, tauWH = INTERNAL.GD_SMOOTH_WH;
  const near = INTERNAL.GD_NEAR * avg;
  const gradient = (X, Y, mu) => {
    gX.fill(0); gY.fill(0);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    let i1 = 0, i2 = 0, j1 = 0, j2 = 0; // which windows set the box's sides
    for (let i = 0; i < n; i++) {
      const hw = W[i] / 2, hh = H[i] / 2;
      if (X[i] - hw < x1) { x1 = X[i] - hw; i1 = i; }
      if (X[i] + hw > x2) { x2 = X[i] + hw; i2 = i; }
      if (Y[i] - hh < y1) { y1 = Y[i] - hh; j1 = i; }
      if (Y[i] + hh > y2) { y2 = Y[i] + hh; j2 = i; }
    }
    // the box's width bw and height bh (soft), the scale s =
    // exp(-softmax(la, lb)), and wa: how much the width sets the scale
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    for (let i = 0; i < n; i++) {
      s1 += (e1[i] = Math.exp((X[i] + W[i] / 2 - x2) / tau));
      s2 += (e2[i] = Math.exp((x1 - X[i] + W[i] / 2) / tau));
      s3 += (e3[i] = Math.exp((Y[i] + H[i] / 2 - y2) / tau));
      s4 += (e4[i] = Math.exp((y1 - Y[i] + H[i] / 2) / tau));
    }
    const bw = x2 - x1 + tau * Math.log(s1 * s2) - pad.x;
    const bh = y2 - y1 + tau * Math.log(s3 * s4) - pad.y;
    const la = Math.log(bw / A.w), lb = Math.log(bh / A.h);
    const lm = Math.max(la, lb);
    const ea = Math.exp((la - lm) / tauWH), eb = Math.exp((lb - lm) / tauWH);
    const smax = lm + tauWH * Math.log(ea + eb), wa = ea / (ea + eb);
    const s = Math.exp(-smax);
    // movement: each thumbnail's distance from its real window
    placeAt(X, Y, x1, y1, x2, y2, s);
    const rX = place.refX, rY = place.refY;
    let d = 0, ux = 0, uy = 0, dS = 0;
    for (let i = 0; i < n; i++) {
      const dx = place.px + (X[i] - place.bcx) * s - OX[i];
      const dy = place.py + (Y[i] - place.bcy) * s - OY[i];
      const di = Math.sqrt(dx * dx + dy * dy), u = di > 1e-9 ? 1 / di : 0;
      d += di;
      u1[i] = dx * u; u2[i] = dy * u; ux += u1[i]; uy += u2[i];
      dS += u1[i] * (X[i] - rX) + u2[i] * (Y[i] - rY); // d(d) / d(s)
    }
    const kd = kDisp * s;
    for (let i = 0; i < n; i++) { gX[i] += kd * u1[i]; gY[i] += kd * u2[i]; }
    // ... and through ref
    const mxm = place.modeX, mym = place.modeY;
    if (mxm === 0) for (let i = 0; i < n; i++) gX[i] -= kd * ux / n;
    if (mxm === 1) gX[i1] -= kd * ux;
    if (mxm === 2) gX[i2] -= kd * ux;
    if (mym === 0) for (let i = 0; i < n; i++) gY[i] -= kd * uy / n;
    if (mym === 1) gY[j1] -= kd * uy;
    if (mym === 2) gY[j2] -= kd * uy;
    // size, and movement through the scale: d(score) / d(bw), d(score) / d(bh)
    // (d(ln s) / d(ln bw) = -wa, d(ln s) / d(ln bh) = -(1 - wa))
    const f = kDisp * d + sizeCostSmooth(-smax), dlns = -sizeSlope - kd * dS;
    const kw = dlns * wa / bw, kh = dlns * (1 - wa) / bh;
    for (let i = 0; i < n; i++) {
      gX[i] += kw * (e1[i] / s1 - e2[i] / s2);
      gY[i] += kh * (e3[i] / s3 - e4[i] / s4);
    }
    // overlaps and relations, per pair
    const kOv = mu / sumA;
    let o = 0, r = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = X[j] - X[i], dy = Y[j] - Y[i];
      const ox = (W[i] + W[j]) / 2 - Math.abs(dx);
      const oy = (H[i] + H[j]) / 2 - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        o += ox * oy;
        const gx = dx < 0 ? -kOv * oy : kOv * oy;
        const gy = dy < 0 ? -kOv * ox : kOv * ox;
        gX[i] += gx; gX[j] -= gx; gY[i] += gy; gY[j] -= gy;
      }
      if (relRows) { // = dirPen(), and its gradient
        const k = i * n + j, wt = RW[k];
        if (!wt) continue;
        const rx = RUX[k], ry = RUY[k], dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < 1e-6) { r += wt * 0.5; continue; }
        const cs = (rx * dx + ry * dy) / dd;
        r += wt * (1 - cs) / 2;
        // the gradient grows as 1 / distance; capped for (nearly) coinciding
        // windows, where the overlap gradient matters anyway
        const c = -kRel * wt / 2 / Math.max(dd, near);
        const gx = c * (rx - cs * dx / dd), gy = c * (ry - cs * dy / dd);
        gX[j] += gx; gY[j] += gy; gX[i] -= gx; gY[i] -= gy;
      } else if (relOn) { // order method: piecewise linear, see makeRelations
        const pr = pairs[i * n + j];
        if (!pr.wt) continue;
        const vx = -pr.sx * dx / pr.nx, vy = -pr.sy * dy / pr.ny;
        r += pr.cx * clamp(vx, 0, 1) + pr.cy * clamp(vy, 0, 1);
        if (vx > 0 && vx < 1) {
          const gx = -kRel * pr.cx * pr.sx / pr.nx;
          gX[j] += gx; gX[i] -= gx;
        }
        if (vy > 0 && vy < 1) {
          const gy = -kRel * pr.cy * pr.sy / pr.ny;
          gY[j] += gy; gY[i] -= gy;
        }
      }
    }
    return f + kOv * o + kRel * r;
  };

  // One start: positions and the state of its descent (Adam: per-coordinate
  // step sizes from running averages of the gradient and its square).
  const kindsUsed = S.startFrom === "mixed" ? KINDS.length : 1;
  const makeStart = c => {
    const kind = kindOf(c), sp = startPos(kind);
    const st = {
      c, kind, X: sp.X.slice(), Y: sp.Y.slice(), t: 0, f: Infinity,
      mX: new Float64Array(n), mY: new Float64Array(n),
      vX: new Float64Array(n), vY: new Float64Array(n), b1t: 1, b2t: 1,
    };
    if (c >= kindsUsed) { // its kind was taken by an earlier start: shaken
      const rng = random(
        (S.seed * INTERNAL.START_SEED_A + c * INTERNAL.START_SEED_B) | 0
      );
      const sig = INTERNAL.GD_SHAKE * avg;
      for (let i = 0; i < n; i++) {
        // normal random numbers (Box-Muller)
        const m = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12)));
        const a = 2 * Math.PI * rng();
        st.X[i] += m * Math.cos(a) * sig; st.Y[i] += m * Math.sin(a) * sig;
      }
    }
    return st;
  };
  // Descend until step `until` of a schedule of L steps: step size from
  // lr0 down to lr1, overlap weight from mu0 up to mu1, both geometric.
  const B1 = INTERNAL.GD_B1, B2 = INTERNAL.GD_B2;
  const lr0 = S.firstStep * avg, lr1 = INTERNAL.GD_STEP_END * avg;
  const mu0 = INTERNAL.GD_MU_START, mu1 = INTERNAL.GD_MU_END;
  const descend = (st, until, L) => {
    const X = st.X, Y = st.Y, mX = st.mX, mY = st.mY, vX = st.vX, vY = st.vY;
    for (; st.t < until; st.t++) {
      const fr = st.t / L;
      const lr = lr0 * Math.pow(lr1 / lr0, fr);
      const mu = mu0 * Math.pow(mu1 / mu0, fr);
      st.f = gradient(X, Y, mu);
      st.b1t *= B1; st.b2t *= B2;
      const c1 = lr / (1 - st.b1t), c2 = 1 / (1 - st.b2t);
      for (let i = 0; i < n; i++) {
        const gx = gX[i], gy = gY[i];
        mX[i] = B1 * mX[i] + (1 - B1) * gx;
        mY[i] = B1 * mY[i] + (1 - B1) * gy;
        vX[i] = B2 * vX[i] + (1 - B2) * gx * gx;
        vY[i] = B2 * vY[i] + (1 - B2) * gy * gy;
        X[i] -= c1 * mX[i] / (Math.sqrt(vX[i] * c2) + 1e-30);
        Y[i] -= c1 * mY[i] / (Math.sqrt(vY[i] * c2) + 1e-30);
      }
    }
  };

  // Race. counts = starts alive per round; checkpoints q at fractions of the schedule
  // (first at S.checkpoint, then evenly to the end); at a checkpoint the starts are
  // compared by their smoothed score, all at the same overlap weight. L is chosen so the
  // total number of descent steps equals S.steps.
  const K = Math.max(1, Math.round(S.starts));
  const counts = [K];
  if (S.dropWeakStarts) while (counts[counts.length - 1] > 1) counts.push(Math.ceil(counts[counts.length - 1] / 2));
  const rounds = counts.length;
  const q = counts.map((_, r) => rounds === 1 ? 1 : S.checkpoint + (1 - S.checkpoint) * r / (rounds - 1));
  q[rounds - 1] = 1;
  const share = counts.reduce((s, k, r) => s + k * (q[r] - (r ? q[r - 1] : 0)), 0);
  const L = Math.max(1, Math.round(S.steps / share));
  const starts = Array.from({ length: K }, (_, c) => makeStart(c));
  let alive = starts.slice();
  for (let r = 0; r < rounds; r++) {
    const until = Math.round(q[r] * L);
    for (const st of alive) descend(st, until, L);
    if (r + 1 < rounds) {
      alive.sort((a, b) => a.f - b.f || a.c - b.c);
      alive = alive.slice(0, counts[r + 1]);
    }
  }
  let win = alive[0];
  if (alive.length > 1) { // without dropping weak starts: the best finished start wins
    let best = Infinity;
    for (const st of alive) {
      const sc = searchScore(st.X, st.Y);
      if (sc < best) { best = sc; win = st; }
    }
  }

  const R = items.map((it, i) => ({ x: win.X[i], y: win.Y[i], w: W[i], h: H[i] }));
  resolve(R, INTERNAL.CLEANUP.passes, INTERNAL.CLEANUP.strength, 0, A, random(INTERNAL.SEED_CLEANUP)); // no overlap may remain
  enforceGap(items, R, pad, A, S);
  info.starts = K; info.winningStart = win.c + 1; info.winningKind = win.kind;
  info.startsPerRound = counts; info.stepsPerStart = L;
  return finalize(items, R, pad, A, S);
}

const ALGORITHMS = {
  //        run function    uniformScale: one scale for all windows   polishable: may use the polish step
  optimizer: { run: layoutOptimizer, uniformScale: true, polishable: true },
  push:    { run: layoutPush,    uniformScale: true,  polishable: true },
  rows:    { run: layoutRows,    uniformScale: true,  polishable: false },
  grid:    { run: layoutGrid,    uniformScale: false, polishable: false },
};

/* --------------------------------------------------------------------------
   8. POST-STEPS (applied by compute() after the algorithm)
   -------------------------------------------------------------------------- */
// Move the finished arrangement as a whole toward the real window positions, as far as the
// work area allows. Sizes and shape are unchanged.
function placeNearReal(T, ws, A) {
  const by = new Map(ws.map(w => [w.id, w]));
  let mx = 0, my = 0, x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const t of T) {
    const w = by.get(t.id);
    mx += (w.x + w.w / 2) - (t.x + t.w / 2); my += (w.y + w.h / 2) - (t.y + t.h / 2);
    x1 = Math.min(x1, t.x); y1 = Math.min(y1, t.y); x2 = Math.max(x2, t.x + t.w); y2 = Math.max(y2, t.y + t.h);
  }
  const dx = clamp(mx / T.length, A.x - x1, A.x + A.w - x2), dy = clamp(my / T.length, A.y - y1, A.y + A.h - y2);
  return T.map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
}

// Move the finished arrangement as a whole so it is centered in the work area:
// equal margins left and right, and top and bottom. Sizes and shape are
// unchanged.
function centerLayout(T, A) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const t of T) {
    x1 = Math.min(x1, t.x); y1 = Math.min(y1, t.y);
    x2 = Math.max(x2, t.x + t.w); y2 = Math.max(y2, t.y + t.h);
  }
  const dx = A.cx - (x1 + x2) / 2, dy = A.cy - (y1 + y2) / 2;
  return T.map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
}

// Greedy polish: small moves in 8 directions with shrinking steps, kept only if
// they lower the score. A thumbnail only moves into free space: never closer to
// a neighbor than the gaps (or than it already was), never outside the work
// area. Where the two gaps differ, separations are measured between thumbnails
// widened (or heightened) by the difference, and held to the smaller gap; a
// pair already closer than that (the gaps leave no room) may get no closer in
// the real separation either, so it can't come to overlap.
//
// Only the score terms involving the moving thumbnail change, so a move is
// judged by local() of that thumbnail before and after. The work is kept small
// without changing any result (it is exactly that of checking every move
// against every other thumbnail):
// * local() at the current position is computed once, not per candidate move.
// * Only neighbors within reach of the step (near list) can block or overlap.
// * Overlap terms are exactly 0 while nothing overlaps, and skipped then.
// * A thumbnail whose last scan found nothing is skipped until another moves.
function polishLayout(T, ws, S, A) {
  const sc = makeScorer(T, ws, S, A), n = sc.n, G = gaps(S);
  const g = Math.min(G.x, G.y), ex = G.x - g, ey = G.y - g;
  if (n < 1) return { T, moved: 0, gain: 0 };
  const Wt = Float64Array.from(sc.Wt), Ht = Float64Array.from(sc.Ht);
  const X = Float64Array.from(T, t => t.x + t.w / 2);
  const Y = Float64Array.from(T, t => t.y + t.h / 2);
  const OX = sc.OX, OY = sc.OY, kDisp = sc.kDisp, kRel = sc.kRel, kOv = sc.kOv;
  const rel = sc.rel, relOn = rel.relOn, rows = rel.rows;
  const RW = rel.RW, RUX = rel.RUX, RUY = rel.RUY;
  const ax1 = A.x - 0.5, ax2 = A.x + A.w + 0.5;
  const ay1 = A.y - 0.5, ay2 = A.y + A.h + 0.5;
  const avg = sc.Wt.reduce((q, w, i) => q + Math.sqrt(w * Ht[i]), 0) / n;
  const step0 = avg * INTERNAL.POLISH_FIRST_STEP;
  // Separation of thumbnail i at (x, y) from thumbnail j: the larger of the two
  // axis gaps, less ex and ey; negative when they overlap (or come closer than
  // ex and ey).
  const sep = (i, j, x, y) => Math.max(
    Math.abs(x - X[j]) - (Wt[i] + Wt[j]) / 2 - ex,
    Math.abs(y - Y[j]) - (Ht[i] + Ht[j]) / 2 - ey
  );
  // The real separation (without ex and ey); at least sep.
  const apart = (i, j, x, y) => Math.max(
    Math.abs(x - X[j]) - (Wt[i] + Wt[j]) / 2,
    Math.abs(y - Y[j]) - (Ht[i] + Ht[j]) / 2
  );
  // Some pair may overlap (separation below 0: only if overlap removal hit its
  // limit or the gaps leave no room). While false, every overlap term is
  // exactly 0.
  let anyOv = false;
  for (let i = 0; i < n && !anyOv; i++) for (let j = i + 1; j < n; j++) {
    if (sep(i, j, X[i], Y[i]) < 0) { anyOv = true; break; }
  }
  // Score terms involving thumbnail i, with i at (x, y); the same sum, in the
  // same order, as the full score (the skipped terms are exactly 0). full:
  // include the overlap terms.
  const local = (i, x, y, full) => {
    const dx = x - OX[i], dy = y - OY[i];
    let v = kDisp * Math.sqrt(dx * dx + dy * dy);
    if (rows && !full) {
      for (let j = 0, k = i * n; j < n; j++, k++) {
        const wt = RW[k];
        if (wt) v += kRel * dirPen(wt, RUX[k], RUY[k], X[j] - x, Y[j] - y);
      }
    } else if (relOn || full) {
      const px = X[i], py = Y[i];
      X[i] = x; Y[i] = y;
      for (let j = 0; j < n; j++) if (j !== i) {
        if (relOn) v += kRel * rel.pen(X, Y, i, j);
        if (full) v += kOv * overlapArea(X, Y, Wt, Ht, i, j);
      }
      X[i] = px; Y[i] = py;
    }
    return v;
  };
  // Near list of thumbnail i: the neighbors a move of up to step0 could bring
  // closer than allowed, nearest first, with their current separation (nearS)
  // and the separation a move must keep (nearT; nearR: the real separation, for
  // pairs closer than 0). A neighbor whose separation is at least g + step stays
  // farther than g after any move of that step, so it can neither block the
  // move nor overlap.
  const REACH = 1e-3; // px of safety margin on that reach
  const nearJ = new Int32Array(n);
  const nearS = new Float64Array(n), nearT = new Float64Array(n);
  const nearR = new Float64Array(n);
  let nearN = 0;
  const findNear = i => {
    nearN = 0;
    const lim = g + step0 + REACH;
    for (let j = 0; j < n; j++) if (j !== i) {
      const s = sep(i, j, X[i], Y[i]);
      if (s >= lim) continue;
      let k = nearN++;
      for (; k > 0 && nearS[k - 1] > s; k--) {
        nearJ[k] = nearJ[k - 1];
        nearS[k] = nearS[k - 1];
        nearT[k] = nearT[k - 1];
        nearR[k] = nearR[k - 1];
      }
      nearJ[k] = j; nearS[k] = s; nearT[k] = Math.min(g, s) - 1e-6;
      nearR[k] = s < 0 ? Math.min(0, apart(i, j, X[i], Y[i])) - 1e-6 : 0;
    }
  };
  const DX = [1, -1, 0, 0, .7071, .7071, -.7071, -.7071];
  const DY = [0, 0, 1, -1, .7071, -.7071, .7071, -.7071];
  // idleAt[i]: value of `moved` when thumbnail i was last scanned without
  // moving. While nothing has moved since, a new scan would find nothing again.
  const idleAt = new Int32Array(n).fill(-1);
  let moved = 0, gain = 0;
  for (let pass = 0; pass < INTERNAL.POLISH_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      if (idleAt[i] === moved) continue;
      const moved0 = moved, hw = Wt[i] / 2, hh = Ht[i] / 2;
      let before = 0, haveBefore = false;
      findNear(i);
      for (let step = step0; step >= INTERNAL.POLISH_MIN_STEP; step /= 2) {
        const lim = g + step + REACH;
        for (let d = 0; d < 8; d++) {
          const nx = X[i] + DX[d] * step, ny = Y[i] + DY[d] * step;
          if (nx - hw < ax1 || nx + hw > ax2) continue;
          if (ny - hh < ay1 || ny + hh > ay2) continue;
          let fits = true, minSep = Infinity;
          for (let k = 0; k < nearN && nearS[k] < lim; k++) {
            const s = sep(i, nearJ[k], nx, ny);
            if (s < nearT[k]) { fits = false; break; }
            if (s < 0 && apart(i, nearJ[k], nx, ny) < nearR[k]) { fits = false; break; }
            if (s < minSep) minSep = s;
          }
          if (!fits) continue;
          if (!haveBefore) {
            before = local(i, X[i], Y[i], anyOv);
            haveBefore = true;
          }
          const after = local(i, nx, ny, anyOv || minSep < 0);
          const dl = after - before;
          if (dl < -1e-9) {
            X[i] = nx; Y[i] = ny; gain -= dl; moved++; improved = true;
            before = after;
            if (minSep < 0) anyOv = true;
            findNear(i);
          }
        }
      }
      if (moved === moved0) idleAt[i] = moved;
    }
    if (!improved) break;
  }
  return {
    T: T.map((t, i) => ({ ...t, x: X[i] - Wt[i] / 2, y: Y[i] - Ht[i] / 2 })),
    moved,
    gain
  };
}

// Optimizer safeguard: build the push-apart and ordered-rows layouts (with their
// own settings, S.pushStart / S.rowsStart; whether or not the search started
// from them), finish them with the same post-steps, and keep whatever scores
// best. A candidate is polished if either the optimizer or that algorithm
// polishes, and polishing only ever lowers a score, so the optimizer is never
// worse than those algorithms. The grid is not a candidate: its uneven scaling
// is not something the optimizer may produce.
//
// Where the search built these layouts as starting points, they come from it
// (`shared`), identical to building them here. A candidate's polish is skipped
// when even its best possible polished score could not win (polishLowerBound):
// the same outcome as polishing it and losing.
function optimizerSafeguard(T, ws, S, A, info, shared) {
  let best = T, bestScore = scoreLayout(T, ws, S, A).total, from = null;
  for (const k of ["push", "rows"]) {
    let C;
    if (k === "rows") {
      try {
        C = shared.rows || layoutRows(ws, { ...S, rows: S.rowsStart.rows }, A);
      } catch (e) { continue; } // no room for ordered rows: nothing to compare with
    } else if (shared.push) { // the push-apart algorithm's remaining steps
      const p = shared.push;
      enforceGap(p.items, p.R, p.pad, A, S);
      C = finalize(p.items, p.R, p.pad, A, S);
    } else {
      const P = S.pushStart;
      C = layoutPush(
        ws,
        { ...S, passes: P.passes, strength: P.strength, matchShape: P.matchShape },
        A,
        {}
      );
    }
    C = placeNearReal(C, ws, A);
    if (S.polish || (k === "push" && S.pushStart.polish)) {
      // cannot win, polished or not
      if (polishLowerBound(C, ws, S, A) >= bestScore + 1e-9) continue;
      C = polishLayout(C, ws, S, A).T;
    }
    const sc = scoreLayout(C, ws, S, A).total;
    if (sc < bestScore - 1e-12) { best = C; bestScore = sc; from = k; }
  }
  info.keptStart = from; // null: the search's own result was best
  return best;
}

// A score that polishing C can never get below. The polish doesn't change
// sizes, so the size terms stay as they are; the relations and overlap terms
// are at least 0 (up to rounding, far below the caller's 1e-9 margin); and the
// movement term is at least what pairs of thumbnails that would be too close at
// their real positions force on them:
// * The polish never brings two thumbnails closer than min(g, their
//   separation in C), less 1e-6 px per move (its tolerance), with separations
//   measured as the polish does (g the smaller gap, the thumbnails widened or
//   heightened by the difference); `slack` covers the most moves it can make.
// * For a pair to stay that far apart, the distances of the two from their real
//   positions must add up to at least m (the shortfall along the axis that is
//   cheaper to fix).
// * Over pairs that share no thumbnail these add up; they are picked largest m
//   first.
function polishLowerBound(C, ws, S, A) {
  const sc = makeScorer(C, ws, S, A), n = sc.n, OX = sc.OX, OY = sc.OY;
  const X = C.map(t => t.x + t.w / 2), Y = C.map(t => t.y + t.h / 2);
  const p = sc.parts(X, Y);
  const avg = C.reduce((q, t) => q + Math.sqrt(t.w * t.h), 0) / Math.max(1, n);
  let steps = 0;
  const minStep = INTERNAL.POLISH_MIN_STEP;
  for (let s = avg * INTERNAL.POLISH_FIRST_STEP; s >= minStep; s /= 2) steps++;
  const slack = 1e-6 * INTERNAL.POLISH_PASSES * n * steps * 8 + 1e-3;
  // separations as the polish measures them
  const G = gaps(S), g = Math.min(G.x, G.y), ex = G.x - g, ey = G.y - g;
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = (C[i].w + C[j].w) / 2 + ex, b = (C[i].h + C[j].h) / 2 + ey;
    const s0 = Math.max(Math.abs(X[i] - X[j]) - a, Math.abs(Y[i] - Y[j]) - b);
    const r = Math.min(g, s0) - slack;
    const m = Math.min(
      a + r - Math.abs(OX[i] - OX[j]),
      b + r - Math.abs(OY[i] - OY[j])
    );
    if (m > 0) pairs.push([m, i, j]);
  }
  pairs.sort((u, v) => v[0] - u[0] || u[1] - v[1] || u[2] - v[2]);
  const taken = new Uint8Array(n);
  let move = 0;
  for (const [m, i, j] of pairs) {
    if (taken[i] || taken[j]) continue;
    taken[i] = taken[j] = 1; move += m;
  }
  return p.size + p.sizes + sc.kDisp * move;
}

// Optional: let each thumbnail (smallest first) grow into free space, up to S.maxGrowth.
function fillGaps(T, S, A) {
  const g = gaps(S), gx = g.x, gy = g.y;
  const order = T.map((_, i) => i).sort((a, b) => T[a].w * T[a].h - T[b].w * T[b].h || T[a].y - T[b].y || T[a].x - T[b].x);
  const hits = (r, i) => {
    if (r.x < A.x - 0.5 || r.y < A.y - 0.5 || r.x + r.w > A.x + A.w + 0.5 || r.y + r.h > A.y + A.h + 0.5) return true;
    for (let j = 0; j < T.length; j++) {
      if (j === i) continue;
      const o = T[j];
      if (r.x < o.x + o.w + gx && o.x < r.x + r.w + gx && r.y < o.y + o.h + gy && o.y < r.y + r.h + gy) return true;
    }
    return false;
  };
  for (const i of order) {
    const t = T[i], cur = t.w / t.ow, maxG = Math.min(S.maxGrowth, S.maxScale / cur);
    if (maxG <= 1) continue;
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    let lo = 1, hi = maxG;
    const at = k => rectC(t.id, cx, cy, t.w * k, t.h * k, t.ow, t.oh);
    if (!hits(at(hi), i)) lo = hi;
    else for (let k = 0; k < INTERNAL.FILL_BISECT; k++) { const mid = (lo + hi) / 2; if (hits(at(mid), i)) hi = mid; else lo = mid; }
    T[i] = at(lo);
  }
  return T;
}

/* --------------------------------------------------------------------------
   9. PUBLIC API
   -------------------------------------------------------------------------- */
// Allowed values of the settings (numbers: [lowest, highest], with the lowest
// excluded where it is marked true). compute() refuses others: they would give
// unusable layouts or NaN.
const LIMITS = {
  margin: [0, Infinity], gap: [0, Infinity], extraGapX: [0, Infinity], extraGapY: [0, Infinity],
  fidelity: [0, 1],
  maxScale: [0, Infinity, true], maxGrowth: [1, Infinity],
  wSize: [0, Infinity], wSizes: [0, Infinity], wPlace: [0, Infinity],
  wRelations: [0, Infinity], neighborFocus: [0, 1],
  relationsMethod: ["order", "direction"],
  steps: [1, Infinity], starts: [1, Infinity], checkpoint: [0, 1, true],
  firstStep: [0, Infinity, true], seed: [-Infinity, Infinity],
  startFrom: ["push", "rows", "grid", "none", "mixed"],
  passes: [0, Infinity], strength: [0, Infinity, true], matchShape: [0, Infinity],
  rows: [0, Infinity],
};
function checkSettings(S, where) {
  for (const k of Object.keys(S)) {
    const lim = LIMITS[k], v = S[k];
    if (!lim) continue;
    const ok =
      typeof lim[0] === "string"
      ? lim.indexOf(v) >= 0
      : Number.isFinite(v) && v >= lim[0] && v <= lim[1] && !(lim[2] && v === lim[0]);
    if (!ok) {
      const shown = typeof v === "string" ? JSON.stringify(v) : String(v);
      throw new Error("unusable setting: " + where + k + " = " + shown);
    }
  }
}

function settings(algorithm, overrides) {
  if (!ALGORITHMS[algorithm]) throw new Error("Unknown spread algorithm: " + algorithm);
  const S = { ...DEFAULTS.common, ...DEFAULTS.scoring, ...DEFAULTS[algorithm] };
  if (algorithm === "optimizer") {
    const p = DEFAULTS.push;
    S.pushStart = { passes: p.passes, strength: p.strength, matchShape: p.matchShape, polish: p.polish };
    S.rowsStart = { rows: DEFAULTS.rows.rows };
  }
  return { ...S, ...(overrides || {}) };
}

// The full pipeline: algorithm, placement toward the real windows, polish, optimizer
// safeguard, gap filling, score, centering (when asked for).
// info (diagnostics, present when relevant):
//   push:     passes, hitLimit
//   optimizer: starts, winningStart (1-based), winningKind, startsPerRound, stepsPerStart,
//             keptStart (null, or the starting layout kept by the safeguard)
//   polish:   polishMoves, polishGain
function compute(windows, monitor, algorithm, S) {
  const algo = ALGORITHMS[algorithm];
  if (!algo) throw new Error("Unknown spread algorithm: " + algorithm);
  S = S || settings(algorithm);
  if (algorithm === "optimizer" && (!S.pushStart || !S.rowsStart)) S = settings(algorithm, S); // fill in start settings
  checkSettings(S, "");
  if (S.pushStart) checkSettings(S.pushStart, "pushStart.");
  if (S.rowsStart) checkSettings(S.rowsStart, "rowsStart.");
  const A0 = workArea(monitor, S.margin), info = {};
  // Input nothing can be laid out from (and that could make the algorithms misbehave)
  if (![A0.x, A0.y, A0.w, A0.h].every(Number.isFinite) || !(A0.w > 0) || !(A0.h > 0))
    throw new Error("no usable area: monitor " + JSON.stringify(monitor) + ", margin " + S.margin);
  for (const w of windows) {
    if (![w.id, w.x, w.y, w.w, w.h].every(Number.isFinite) || !(w.w > 0) || !(w.h > 0)) {
      throw new Error(
        "unusable window frame: " + JSON.stringify({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h })
      );
    }
  }
  if (!windows.length) return { targets: [], score: null, info };
  // Laid out relative to the monitor's corner, so the result is the same wherever the
  // monitor is (rounding would otherwise differ, and the optimizer can amplify that).
  const ox = monitor.x, oy = monitor.y;
  const ws = windows.map(w => ({ id: w.id, x: w.x - ox, y: w.y - oy, w: w.w, h: w.h }));
  const A = workArea({ x: 0, y: 0, w: monitor.w, h: monitor.h }, S.margin);
  const shared = {}; // what the optimizer hands on to its safeguard
  let T = algo.run(ws, S, A, info, shared);
  if (algo.uniformScale) T = placeNearReal(T, ws, A);
  if (algo.polishable && S.polish) {
    const r = polishLayout(T, ws, S, A);
    T = r.T; info.polishMoves = r.moved; info.polishGain = r.gain;
  }
  if (algorithm === "optimizer") T = optimizerSafeguard(T, ws, S, A, info, shared);
  if (algo.uniformScale && S.fill) T = fillGaps(T, S, A);
  // Centering is only a final move of the finished layout, like a change of
  // viewpoint: nothing before it, the score included, depends on it.
  const sc = scoreLayout(T, ws, S, A);
  if (algo.uniformScale && S.centered) T = centerLayout(T, A);
  return {
    targets: T.map(t => ({ id: t.id, x: t.x + ox, y: t.y + oy, w: t.w, h: t.h, scale: t.w / t.ow })),
    score: sc,
    info,
  };
}

function score(targets, windows, monitor, S) {
  if (!targets.length) return null;
  return scoreLayout(targets, windows, S, workArea(monitor, S.margin));
}

// Canonical text for any value: object keys sorted, so the order things were built in never
// matters. Used for cache keys.
function stableText(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableText).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stableText(v[k])).join(",") + "}";
}
// Everything a layout depends on, as one string. Windows are sorted by id (never taken in the
// given order, which may follow stacking); settings are limited to the keys the engine uses.
function cacheKey(windows, monitor, algorithm, S) {
  const ws = windows.map(w => [String(w.id), w.x, w.y, w.w, w.h])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const used = {};
  for (const k of Object.keys(settings(algorithm))) used[k] = S[k];
  return stableText([algorithm, [monitor.x, monitor.y, monitor.w, monitor.h], ws, used]);
}
function copyResult(r, cached) {
  return { targets: r.targets.map(t => ({ ...t })), score: r.score && { ...r.score }, info: { ...r.info }, cached };
}
function createCache() {
  const slots = new Map(); // slot -> { key, result }
  return {
    compute(windows, monitor, algorithm, S, slot = "default") {
      if (!ALGORITHMS[algorithm]) throw new Error("Unknown spread algorithm: " + algorithm);
      S = S ? settings(algorithm, S) : settings(algorithm); // fill in anything not given, as compute() does
      const key = cacheKey(windows, monitor, algorithm, S), entry = slots.get(slot);
      if (entry && entry.key === key) return copyResult(entry.result, true);
      const result = compute(windows, monitor, algorithm, S);
      slots.set(slot, { key, result: copyResult(result, false) });
      return copyResult(result, false);
    },
    forget(slot) { slots.delete(slot); },
    clear() { slots.clear(); },
  };
}

const deepFreeze = o => { Object.values(o).forEach(v => typeof v === "object" && v && deepFreeze(v)); return Object.freeze(o); };
return Object.freeze({
  DEFAULTS: deepFreeze(DEFAULTS),
  ALGORITHMS: Object.freeze(Object.keys(ALGORITHMS)),
  settings, compute, createCache, score, random,
});
}
var SpreadLayout = createSpreadLayout();
// CommonJS-style export, only for Cinnamon 6.0-6.6 and Node (6.8 uses the `var` above)
if (typeof module !== "undefined" && module.exports) module.exports = SpreadLayout;
