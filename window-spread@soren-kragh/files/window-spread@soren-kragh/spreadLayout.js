// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

// Spread layout engine: computes where window thumbnails go when all windows
// are shown at once.
//
// Plain JavaScript without dependencies, used as is by the extension, the lab
// (lab/window-spread-lab.html) and the tests. Cinnamon 6.8 reads the top-level
// `var SpreadLayout`; Cinnamon 6.0-6.6 and Node use the CommonJS-style export
// at the end. The pipeline and the guarantees are described in DEVELOPMENT.md
// (sections 3 and 4) at https://github.com/soren-kragh/window-spread.
//
// The public API, SpreadLayout: compute(), settings(), createCache() and
// score() (documented in section 9), random() (section 3), DEFAULTS (all
// default settings, section 1) and ALGORITHMS: ['optimizer', 'push', 'rows',
// 'grid'].
//
// Short names used throughout:
//     windows the real windows, { id, x, y, w, h }
//     S       the settings, from settings()
//     A       the work area, from workArea()
//     items   the windows as prepared by prep(), in canonical order
//     R       layout rectangles: center x, y and padded size w, h (section 5)
//     pad     the padding { x, y } in R: the gaps in layout units
//     T, C    thumbnail rectangles, { id, x, y, w, h, ow, oh }, by corner
//     X, Y    arrays of thumbnail centers

// The whole engine lives inside this function, so the lab can hand its text
// (createSpreadLayout.toString()) to Web Workers.
function createSpreadLayout() {
    'use strict';

    // 1. Settings -------------------------------------------------------------
    // The defaults. Every value can be overridden per call, through
    // SpreadLayout.settings(algorithm, overrides).

    const DEFAULTS = {
        // Used by every algorithm.
        common: {
            // px of empty border inside the monitor area
            margin: 8,
            // px, the smallest gap between thumbnails
            gap: 4,
            // px added to the gap between thumbnails side by side (X) and one
            // above the other (Y), for the caller's decorations
            extraGapX: 0,
            extraGapY: 0,
            // relative sizes: 1 = exact, 0 = all thumbnails the same area,
            // 0.5 = area ratios square-rooted
            fidelity: 0.8,
            // the largest thumbnail scale; 1 = never above real size
            maxScale: 0.9,
            // at the very end, move the finished arrangement to the center (not
            // for the equal grid)
            centered: false,
            // after the layout, grow thumbnails into free space (makes sizes
            // uneven; not for the equal grid)
            fill: false,
            // fill: the largest growth factor per thumbnail
            maxGrowth: 1.5,
        },

        // The score's weights. The score is a cost, lower is better. Each
        // weight is described as the settings window shows it, as a reward for
        // a quality; its term in the score is the cost of missing that quality.
        // Scaling all weights doesn't change which layout scores best, but it
        // does change the optimizer's results, since its descent weighs them
        // against its own overlap weight (GD_MU_*).
        scoring: {
            // "Thumbnail size": reward for bigger thumbnails
            wSize: 3,
            // "Keep sizes" (lab only): reward for relative sizes as `fidelity`
            // sets them
            wSizes: 5,
            // "Stay in place": reward for thumbnails staying near their real
            // window
            wPlace: 2,
            // "Keep relations": reward for windows keeping their positions
            // relative to each other
            wRelations: 1,
            // relations measured as 'order' (left/right, above/below) or
            // 'direction' (angles)
            relationsMethod: 'direction',
            // direction only: 0 = all pairs count the same, 1 = nearby pairs
            // matter most
            neighborFocus: 0.5,
        },

        // Optimizer: gradient descent from several starts.
        optimizer: {
            // descent steps in total, shared by all starts (the effort); in one
            // step every window moves and every pair is checked
            steps: 1000,
            // the number of starts, racing each other
            starts: 4,
            // where in the schedule (0..1) the first weak starts are dropped
            checkpoint: 0.2,
            // the first step size, times the average window size
            firstStep: 0.3,
            // random seed for shaking starts that repeat a kind
            seed: 1,
            // drop the worse half of the starts at each checkpoint
            dropWeakStarts: true,
            // greedy final polish
            polish: true,
            // 'push', 'rows', 'grid', 'none' (real positions) or 'mixed' (one
            // kind per start)
            startFrom: 'mixed',
            // settings() adds pushStart and rowsStart: the settings of the
            // push-apart and ordered-rows layouts the optimizer may start from.
            // With the same values as those algorithms use, the optimizer never
            // does worse than they do.
        },

        // Push apart.
        push: {
            // the maximum number of push-apart passes
            passes: 1000,
            // push per pass, as a fraction of the overlap
            strength: 0.3,
            // bias the pushes toward the screen's shape (0 = straight apart)
            matchShape: 0.5,
            // greedy final polish
            polish: true,
        },

        // Ordered rows.
        rows: {
            // the number of rows; 0 = automatic
            rows: 0,
        },

        // Equal grid: no settings; each window goes in the cell nearest to it.
        grid: {},
    };

    // 2. Internal constants ---------------------------------------------------
    // Fixed details of the algorithms, not settings: the defaults were tuned
    // with these values.

    const INTERNAL = {
        // Push apart: px added to every push so progress never stalls
        PUSH_NUDGE: 0.5,
        // overlap removal for the optimizer's rows and grid starts
        START_RESOLVE: { passes: 1000, strength: 0.5 },
        // final overlap removal, before and between the gap rounds
        CLEANUP: { passes: 2000, strength: 0.5 },

        // Gaps are chosen in layout units, before the final scale is known. The
        // first guess assumes the thumbnails cover DENSITY_GUESS of the screen
        // (DENSITY_SEARCH in the optimizer's search, which packs tighter); then
        // up to GAP_ROUNDS rounds widen them to GAP_OVERSHOOT times what is
        // needed, slightly more so it converges quickly.
        DENSITY_GUESS: 0.5,
        DENSITY_SEARCH: 0.7,
        GAP_ROUNDS: 100,
        GAP_OVERSHOOT: 1.003,

        // random seeds, used only to break exact ties (identical centers)
        SEED_TIES: 12345,
        SEED_CLEANUP: 1,
        SEED_GAP: 7,

        // Optimizer: the kinds of starts that startFrom 'mixed' cycles through
        START_KINDS: ['push', 'rows', 'grid', 'none'],
        // the last step size, times the average window size (the first is
        // S.firstStep)
        GD_STEP_END: 0.0005,
        // the overlap weight during the descent, rising from start to end
        GD_MU_START: 3,
        GD_MU_END: 300,
        // softness of the box's sides (times the average size), of width vs
        // height, and of the size term's corner at the max scale (in ln scale)
        GD_SMOOTH: 0.02,
        GD_SMOOTH_WH: 0.02,
        GD_SMOOTH_CAP: 0.02,
        // the relations' gradient is capped below this distance (times the
        // average size)
        GD_NEAR: 0.1,
        // Adam: decay of the gradient's running mean and mean square
        GD_B1: 0.9,
        GD_B2: 0.999,
        // starts that repeat an earlier start's kind are shaken by this (times
        // the average size)
        GD_SHAKE: 0.3,
        // per-start random seeds: seed * A + start * B
        START_SEED_A: 7919,
        START_SEED_B: 104729,

        // Score: the overlap term, 0 unless thumbnails still overlap (the
        // descent uses GD_MU_* instead)
        W_OVERLAP: 40,
        // internal scale of the relations and size-distortion terms
        W_REL: 4,
        W_DISTORT: 2,
        // direction: the "nearby" distance, as a share of the screen diagonal
        NEAR: 0.1,

        // Polish: passes, the first step (times the average size), the smallest
        // step (px)
        POLISH_PASSES: 60,
        POLISH_FIRST_STEP: 0.5,
        POLISH_MIN_STEP: 1,

        // Fill gaps: bisection steps when growing a thumbnail
        FILL_BISECT: 24,
    };

    // 3. Small helpers --------------------------------------------------------

    /**
     * random:
     * @seed: an integer
     *
     * The engine's deterministic random generator (mulberry32). Public, for
     * reproducible test data.
     *
     * Returns: a function giving numbers in [0, 1)
     */
    function random(seed) {
        let a = seed | 0;
        return function() {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // A thumbnail rectangle from its center; ow, oh carry the real window size.
    const rectC = (id, cx, cy, w, h, ow, oh) => ({
        id, x: cx - w / 2, y: cy - h / 2, w, h, ow, oh,
    });

    // The bounding box { x1, y1, x2, y2 } of center-based rectangles R.
    function bounds(R) {
        let x1 = Infinity;
        let y1 = Infinity;
        let x2 = -Infinity;
        let y2 = -Infinity;
        for (const r of R) {
            x1 = Math.min(x1, r.x - r.w / 2);
            y1 = Math.min(y1, r.y - r.h / 2);
            x2 = Math.max(x2, r.x + r.w / 2);
            y2 = Math.max(y2, r.y + r.h / 2);
        }
        return { x1, y1, x2, y2 };
    }

    // Overlap area of center-based rectangles i and j, from arrays of centers
    // and sizes.
    function overlapArea(X, Y, W, H, i, j) {
        const ox = (W[i] + W[j]) / 2 - Math.abs(X[i] - X[j]);
        const oy = (H[i] + H[j]) / 2 - Math.abs(Y[i] - Y[j]);
        return ox > 0 && oy > 0 ? ox * oy : 0;
    }

    // Optimal assignment (Hungarian method, O(n^3)): for an n x n cost matrix,
    // returns colOf[row] such that the sum of cost[row][colOf[row]] is as small
    // as possible. Deterministic.
    function assignOptimal(cost) {
        const n = cost.length;
        const INF = Infinity;
        // u, v: row and column potentials; p[col] = row (from 1), 0 = free;
        // way[col]: the previous column on the augmenting path
        const u = new Float64Array(n + 1);
        const v = new Float64Array(n + 1);
        const p = new Int32Array(n + 1);
        const way = new Int32Array(n + 1);

        for (let i = 1; i <= n; i++) {
            // grow an augmenting path from row i until it reaches a free column
            p[0] = i;
            let j0 = 0;
            const minv = new Float64Array(n + 1).fill(INF);
            const used = new Uint8Array(n + 1);
            do {
                used[j0] = 1;
                const i0 = p[j0];
                let delta = INF;
                let j1 = 0;
                for (let j = 1; j <= n; j++) {
                    if (!used[j]) {
                        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                        if (cur < minv[j]) {
                            minv[j] = cur;
                            way[j] = j0;
                        }
                        if (minv[j] < delta) {
                            delta = minv[j];
                            j1 = j;
                        }
                    }
                }
                for (let j = 0; j <= n; j++) {
                    if (used[j]) {
                        u[p[j]] += delta;
                        v[j] -= delta;
                    } else {
                        minv[j] -= delta;
                    }
                }
                j0 = j1;
            } while (p[j0] !== 0);

            // flip the augmenting path
            do {
                const j1 = way[j0];
                p[j0] = p[j1];
                j0 = j1;
            } while (j0);
        }

        const colOf = new Array(n);
        for (let j = 1; j <= n; j++)
            colOf[p[j] - 1] = j - 1;
        return colOf;
    }

    // 4. Shared preparation ---------------------------------------------------

    // The processing order, by geometry alone: center y, center x, width,
    // height, then id. Stacking order is never read.
    function canonical(windows) {
        return windows.slice().sort((a, b) =>
            a.y + a.h / 2 - (b.y + b.h / 2) ||
            a.x + a.w / 2 - (b.x + b.w / 2) ||
            a.w - b.w ||
            a.h - b.h ||
            a.id - b.id);
    }

    // Per window: the real size (ow, oh), real center (cx, cy), size-fidelity
    // factor f, and the layout size (lw, lh) = real size * f, which all
    // uniform-scale algorithms work in. f is 1 for the largest window; below
    // fidelity 1, smaller ones grow toward its area.
    function prep(windows, S) {
        const items = canonical(windows).map(w => ({
            id: w.id,
            ow: w.w,
            oh: w.h,
            cx: w.x + w.w / 2,
            cy: w.y + w.h / 2,
        }));
        const amax = Math.max(...items.map(it => it.ow * it.oh));
        for (const it of items) {
            it.f = Math.pow(amax / (it.ow * it.oh), (1 - S.fidelity) / 2);
            it.lw = it.ow * it.f;
            it.lh = it.oh * it.f;
        }
        return items;
    }

    // The usable area: the monitor minus the margin, with the monitor's center
    // and diagonal.
    function workArea(monitor, margin) {
        return {
            x: monitor.x + margin,
            y: monitor.y + margin,
            w: monitor.w - 2 * margin,
            h: monitor.h - 2 * margin,
            cx: monitor.x + monitor.w / 2,
            cy: monitor.y + monitor.h / 2,
            diag: Math.hypot(monitor.w, monitor.h),
        };
    }

    // The gaps in px: x between thumbnails side by side, y one above the other.
    function gaps(S) {
        return { x: S.gap + (S.extraGapX || 0), y: S.gap + (S.extraGapY || 0) };
    }

    // Returns the padding { x, y } to add to the layout sizes: a first guess of
    // the gaps in layout units, assuming the thumbnails cover `density` of the
    // work area (the final scale isn't known yet).
    function estPad(items, S, A, density = INTERNAL.DENSITY_GUESS) {
        const sum = items.reduce((s, it) => s + it.lw * it.lh, 0);
        const est = Math.min(1, Math.sqrt(A.w * A.h * density / sum));
        const g = gaps(S);
        return { x: g.x / est, y: g.y / est };
    }

    // 5. Push-apart primitives ------------------------------------------------
    // These work on layout rectangles R: x, y is the center, and w, h the
    // layout size plus the padding `pad` (the gaps in layout units).

    // Push overlapping pairs apart until nothing overlaps (or maxPasses
    // passes), each push `strength` of the overlap. `matchShape` biases pushes
    // toward the work area's shape. Moves R in place and returns the number of
    // passes used.
    function resolve(R, maxPasses, strength, matchShape, A, rng) {
        const target = A.w / A.h;
        let pass = 0;
        for (; pass < maxPasses; pass++) {
            let bx = 1;
            let by = 1;
            if (matchShape > 0) {
                const b = bounds(R);
                const ratio = target / ((b.x2 - b.x1) / (b.y2 - b.y1));
                if (ratio > 1)
                    bx = Math.pow(ratio, matchShape);
                else
                    by = Math.pow(1 / ratio, matchShape);
            }
            let moved = false;
            for (let i = 0; i < R.length; i++) {
                for (let j = i + 1; j < R.length; j++) {
                    const a = R[i];
                    const c = R[j];
                    let dx = c.x - a.x;
                    let dy = c.y - a.y;
                    const ox = (a.w + c.w) / 2 - Math.abs(dx);
                    const oy = (a.h + c.h) / 2 - Math.abs(dy);
                    if (ox <= 0 || oy <= 0)
                        continue;

                    moved = true;
                    // same center: a random direction
                    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
                        const g = rng() * Math.PI * 2;
                        dx = Math.cos(g);
                        dy = Math.sin(g);
                    }
                    // stretch toward the work area's shape
                    dx *= bx;
                    dy *= by;
                    const len = Math.hypot(dx, dy);
                    dx /= len;
                    dy /= len;

                    // the distance along (dx, dy) that separates the pair
                    const need = Math.min(
                        Math.abs(dx) > 1e-9 ? ox / Math.abs(dx) : Infinity,
                        Math.abs(dy) > 1e-9 ? oy / Math.abs(dy) : Infinity
                    );
                    // each of the two moves half
                    const amt = (strength * need + INTERNAL.PUSH_NUDGE) / 2;
                    a.x -= dx * amt;
                    a.y -= dy * amt;
                    c.x += dx * amt;
                    c.y += dy * amt;
                }
            }
            if (!moved)
                break;
        }
        return pass;
    }

    // If the real final scale is larger than first guessed, the gaps on screen
    // would be too small: widen `pad` (in place) to what the real scale needs,
    // resize R to match, and push apart again.
    function enforceGap(items, R, pad, A, S) {
        // first clear any overlap left by a push-apart that hit its pass limit
        resolve(R, INTERNAL.CLEANUP.passes, INTERNAL.CLEANUP.strength, 0, A,
            random(INTERNAL.SEED_GAP));

        const g = gaps(S);
        for (let k = 0; k < INTERNAL.GAP_ROUNDS; k++) {
            const b = bounds(R);
            const s = Math.min(A.w / (b.x2 - b.x1 - pad.x), A.h / (b.y2 - b.y1 - pad.y));
            const needX = g.x / s;
            const needY = g.y / s;
            // wide enough, to within rounding
            if (needX <= pad.x * 1.0001 + 1e-9 && needY <= pad.y * 1.0001 + 1e-9)
                break;
            pad.x = needX * INTERNAL.GAP_OVERSHOOT;
            pad.y = needY * INTERNAL.GAP_OVERSHOOT;
            items.forEach((it, i) => {
                R[i].w = it.lw + pad.x;
                R[i].h = it.lh + pad.y;
            });
            resolve(R, INTERNAL.CLEANUP.passes, INTERNAL.CLEANUP.strength, 0, A,
                random(INTERNAL.SEED_GAP));
        }
    }

    // Scale the arrangement uniformly so the windows (not their padding) fill
    // the work area, centered. Returns thumbnail rectangles.
    function finalize(items, R, pad, A, S) {
        const b = bounds(R);
        const s = Math.min(A.w / (b.x2 - b.x1 - pad.x), A.h / (b.y2 - b.y1 - pad.y));
        const bcx = (b.x1 + b.x2) / 2;
        const bcy = (b.y1 + b.y2) / 2;
        return items.map((it, i) => {
            const scale = Math.min(s * it.f, S.maxScale);
            return rectC(it.id, A.cx + (R[i].x - bcx) * s, A.cy + (R[i].y - bcy) * s,
                it.ow * scale, it.oh * scale, it.ow, it.oh);
        });
    }

    // 6. Scoring --------------------------------------------------------------
    // One score for any finished layout, lower is better. All algorithms, the
    // optimizer's search (in layout units) and the polish use it.

    // Direction method: the cost of a pair with weight wt whose real direction
    // is the unit vector (ux, uy) and which now points along (ndx, ndy): 0 for
    // the same direction, wt for the opposite, wt / 2 if the centers coincide.
    const dirPen = (wt, ux, uy, ndx, ndy) => {
        const d = Math.sqrt(ndx * ndx + ndy * ndy);
        return d < 1e-6 ? wt * 0.5 : wt * (1 - (ux * ndx + uy * ndy) / d) / 2;
    };

    // The relations term, shared by the scorer and the optimizer. OX, OY, OW,
    // OH are the real centers and sizes, NW, NH the current sizes (of
    // thumbnails, or in layout units). Returns pen(X, Y, i, j), a pair's cost
    // at centers X, Y, and relNorm, the sum of the pair weights.
    //
    // With the direction method (dirArrays: true), the pairs are also given as
    // n x n arrays for the hot loops: at k = i * n + j, RW[k] is the weight of
    // the pair (i, j) and (RUX[k], RUY[k]) the real direction from i to j.
    function makeRelations(OX, OY, OW, OH, NW, NH, S, diag) {
        const n = OX.length;
        const order = S.relationsMethod === 'order';
        const relOn = S.wRelations > 0;
        const dirArrays = relOn && !order;
        const pairs = order ? new Array(n * n) : null;
        const RW = dirArrays ? new Float64Array(n * n) : null;
        const RUX = dirArrays ? new Float64Array(n * n) : null;
        const RUY = dirArrays ? new Float64Array(n * n) : null;
        let relNorm = 0;
        if (relOn) {
            const near = INTERNAL.NEAR * diag;
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const odx = OX[j] - OX[i];
                    const ody = OY[j] - OY[i];
                    const d = Math.sqrt(odx * odx + ody * ody);
                    if (order) {
                        // How sure it is that the pair is side by side (cx) or
                        // one above the other (cy): how clearly they are apart
                        // along that axis, times how much the pair is oriented
                        // along it (cos² or sin² of its angle). Two windows far
                        // apart at almost the same height are side by side, so
                        // their vertical order barely counts.
                        const pr = { sx: Math.sign(odx), sy: Math.sign(ody) };
                        const hx = d > 1e-6 ? odx * odx / (d * d) : 0;
                        const hy = d > 1e-6 ? ody * ody / (d * d) : 0;
                        pr.cx = Math.min(1, Math.abs(odx) / ((OW[i] + OW[j]) / 4)) * hx;
                        pr.cy = Math.min(1, Math.abs(ody) / ((OH[i] + OH[j]) / 4)) * hy;
                        pr.nx = (NW[i] + NW[j]) / 4;
                        pr.ny = (NH[i] + NH[j]) / 4;
                        pr.wt = pr.cx + pr.cy;
                        relNorm += pr.wt;
                        pairs[i * n + j] = pr;
                    } else {
                        const ux = d > 1e-6 ? odx / d : 0;
                        const uy = d > 1e-6 ? ody / d : 0;
                        const wt = d > 1e-6
                            ? Math.pow(near / (d + near), 4 * S.neighborFocus)
                            : 0;
                        const a = i * n + j;
                        const b = j * n + i;
                        RW[a] = RW[b] = wt;
                        RUX[a] = ux;
                        RUX[b] = -ux;
                        RUY[a] = uy;
                        RUY[b] = -uy;
                        relNorm += wt;
                    }
                }
            }
        }

        const pen = (X, Y, p, q) => {
            if (!order) {
                const k = p * n + q;
                const wt = RW[k];
                return wt ? dirPen(wt, RUX[k], RUY[k], X[q] - X[p], Y[q] - Y[p]) : 0;
            }
            const i = p < q ? p : q;
            const j = p < q ? q : p;
            const pr = pairs[i * n + j];
            if (!pr.wt)
                return 0;

            // 0 while the order is kept, up to the pair's weight once it is
            // clearly flipped
            const ndx = X[j] - X[i];
            const ndy = Y[j] - Y[i];
            return pr.cx * clamp(-pr.sx * ndx / pr.nx, 0, 1) +
                   pr.cy * clamp(-pr.sy * ndy / pr.ny, 0, 1);
        };

        return { relOn, relNorm, pen, dirArrays, RW, RUX, RUY, pairs };
    }

    // A scorer for thumbnails T (with fixed sizes): parts(X, Y) gives the full
    // score at centers X, Y. Also returns the pieces the polish uses itself:
    // the real centers OX/OY, the relations, and the weights kDisp, kRel and
    // kOv of the movement, relations and overlap terms.
    function makeScorer(T, windows, S, A) {
        const by = new Map(windows.map(w => [w.id, w]));
        const n = T.length;
        const O = T.map(t => by.get(t.id));
        const amax = Math.max(...O.map(w => w.w * w.h));
        const f = O.map(w => Math.pow(amax / (w.w * w.h), (1 - S.fidelity) / 2));
        const OX = O.map(w => w.x + w.w / 2);
        const OY = O.map(w => w.y + w.h / 2);
        const Wt = T.map(t => t.w);
        const Ht = T.map(t => t.h);
        const sumA = T.reduce((q, t) => q + t.w * t.h, 0) || 1;

        // The log scale of each thumbnail relative to its intended size (the
        // size-fidelity factor taken out). A thumbnail held back by maxScale
        // counts as large as the largest one that isn't (or as maxScale if all
        // are): the limit keeps it small, not the layout, so neither the size
        // nor the distortion term should charge for it.
        const lr = O.map((w, i) => Math.log(Wt[i] / w.w / f[i]));
        const capped = O.map((w, i) => Wt[i] / w.w >= S.maxScale * (1 - 1e-9));
        let top = -Infinity;
        for (let i = 0; i < n; i++) {
            if (!capped[i])
                top = Math.max(top, lr[i]);
        }
        if (top === -Infinity)
            top = Math.log(S.maxScale);
        for (let i = 0; i < n; i++) {
            if (capped[i])
                lr[i] = Math.max(lr[i], top);
        }

        // size: mean -ln(scale)
        let size = 0;
        for (let i = 0; i < n; i++)
            size -= Math.min(lr[i], Math.log(S.maxScale));
        size /= Math.max(1, n);

        // size distortion: the mean absolute deviation of the log scale, 0 when
        // all share one scale
        const lmean = lr.reduce((a, b) => a + b, 0) / Math.max(1, n);
        const distortion =
            lr.reduce((a, v) => a + Math.abs(v - lmean), 0) / Math.max(1, n);

        const rel = makeRelations(OX, OY, O.map(w => w.w), O.map(w => w.h),
            Wt, Ht, S, A.diag);

        const dist = (X, Y, i) => {
            const dx = X[i] - OX[i];
            const dy = Y[i] - OY[i];
            return Math.sqrt(dx * dx + dy * dy);
        };
        const kDisp = S.wPlace * 2 / Math.max(1, n) / A.diag;
        const kRel = rel.relNorm > 0 ? S.wRelations * INTERNAL.W_REL / rel.relNorm : 0;
        const kOv = INTERNAL.W_OVERLAP / sumA;

        function parts(X, Y) {
            let d = 0;
            let r = 0;
            let o = 0;
            for (let i = 0; i < n; i++) {
                d += dist(X, Y, i);
                for (let j = i + 1; j < n; j++) {
                    if (rel.relOn)
                        r += rel.pen(X, Y, i, j);
                    o += overlapArea(X, Y, Wt, Ht, i, j);
                }
            }
            const p = {
                size: S.wSize * size,
                sizes: S.wSizes * INTERNAL.W_DISTORT * distortion,
                movement: kDisp * d,
                relations: kRel * r,
                overlap: kOv * o,
            };
            p.total = p.size + p.sizes + p.movement + p.relations + p.overlap;
            return p;
        }

        return { parts, Wt, Ht, n, OX, OY, rel, kDisp, kRel, kOv };
    }

    // The score of finished thumbnails T.
    function scoreLayout(T, windows, S, A) {
        return makeScorer(T, windows, S, A).parts(T.map(t => t.x + t.w / 2),
                                             T.map(t => t.y + t.h / 2));
    }

    // 7. Algorithms -----------------------------------------------------------
    // Each is called with (windows, S, A, info), where info collects
    // diagnostics, and returns thumbnail rectangles { id, x, y, w, h, ow, oh }.

    // Equal grid: equal cells, each window shrunk to fit its own (so windows
    // are scaled unevenly, and size fidelity is ignored). Windows are assigned
    // to cells so the total distance from their real centers to their cells'
    // centers is smallest (Hungarian method).
    function layoutGrid(windows, S, A) {
        const items = prep(windows, { ...S, fidelity: 1 });
        const n = items.length;
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const g = gaps(S);

        // The gaps between cells. If they leave no room for the cells, all gaps
        // together take half the width (or height) instead.
        const gx = A.w - g.x * (cols - 1) > 0 ? g.x : A.w / 2 / (cols - 1);
        const gy = A.h - g.y * (rows - 1) > 0 ? g.y : A.h / 2 / (rows - 1);
        const cw = (A.w - gx * (cols - 1)) / cols;
        const ch = (A.h - gy * (rows - 1)) / rows;

        // the cells' centers, row by row; a partial last row is centered
        const cells = [];
        for (let i = 0; i < n; i++) {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const inRow = Math.min(cols, n - r * cols);
            const off = (cols - inRow) * (cw + gx) / 2;
            cells.push({
                x: A.x + off + c * (cw + gx) + cw / 2,
                y: A.y + r * (ch + gy) + ch / 2,
            });
        }

        const cellOf = assignOptimal(
            items.map(it => cells.map(c => Math.hypot(it.cx - c.x, it.cy - c.y))));

        return items.map((it, k) => {
            const cell = cells[cellOf[k]];
            const scale = Math.min(cw / it.ow, ch / it.oh, S.maxScale);
            return rectC(it.id, cell.x, cell.y, it.ow * scale, it.oh * scale,
                it.ow, it.oh);
        });
    }

    // Push apart: start at the real positions, push overlapping pairs apart,
    // and scale the whole arrangement uniformly to fit.
    function layoutPush(windows, S, A, info) {
        const items = prep(windows, S);
        const pad = estPad(items, S, A);
        const R = items.map(it => ({
            x: it.cx, y: it.cy, w: it.lw + pad.x, h: it.lh + pad.y,
        }));
        const passes = resolve(R, S.passes, S.strength, S.matchShape, A,
            random(INTERNAL.SEED_TIES));
        info.passes = passes;
        info.hitLimit = passes >= S.passes;
        enforceGap(items, R, pad, A, S);
        return finalize(items, R, pad, A, S);
    }

    // Ordered rows: rows from top to bottom by vertical position, left to right
    // within a row. The row count giving the largest scale wins (or S.rows, if
    // set).
    function layoutRows(windows, S, A) {
        const items = prep(windows, S);
        const n = items.length;
        const g = gaps(S);
        const gx = g.x;
        const gy = g.y;
        const byY = items.slice().sort((a, b) =>
            a.cy - b.cy || a.cx - b.cx || a.id - b.id);
        const total = byY.reduce((s, it) => s + it.lw, 0);

        // r rows, filled in reading order; s = the scale at which they fit
        const tryRows = r => {
            const buckets = Array.from({ length: r }, () => []);
            // Each row gets an equal share of the windows' total layout width;
            // a window goes in the row whose share holds its middle.
            let acc = 0;
            for (const it of byY) {
                const mid = acc + it.lw / 2;
                acc += it.lw;
                buckets[Math.min(r - 1, Math.floor(mid / (total / r)))].push(it);
            }
            const rows = buckets
                .filter(b => b.length)
                .map(b => b.sort((a, c) => a.cx - c.cx || a.id - c.id));

            let s = Infinity;
            let sumH = 0;
            for (const row of rows) {
                s = Math.min(s,
                    (A.w - gx * (row.length - 1)) / row.reduce((q, it) => q + it.lw, 0));
                sumH += Math.max(...row.map(it => it.lh));
            }
            s = Math.min(s, (A.h - gy * (rows.length - 1)) / sumH);
            return { s, rows };
        };

        // S.rows, if set, fixes the row count. Otherwise, or if that count
        // leaves no room, every count is tried and the largest scale wins.
        const fixed = S.rows | 0;
        let best = fixed > 0 ? tryRows(Math.min(fixed, n)) : null;
        if (!best || !(best.s > 0)) {
            best = null;
            for (let r = 1; r <= n; r++) {
                const t = tryRows(r);
                if (!best || t.s > best.s + 1e-9)
                    best = t;
            }
        }
        if (!(best.s > 0))
            throw new Error('ordered rows: the gaps leave no room for the windows');

        const { s, rows } = best;
        const out = [];
        const H = rows.reduce((q, row) => q + Math.max(...row.map(it => it.lh)) * s, 0) +
            gy * (rows.length - 1);
        let y = A.cy - H / 2;
        for (const row of rows) {
            const rh = Math.max(...row.map(it => it.lh)) * s;
            const rw = row.reduce((q, it) => q + it.lw * s, 0) + gx * (row.length - 1);
            let x = A.cx - rw / 2;
            for (const it of row) {
                const scale = Math.min(s * it.f, S.maxScale);
                out.push(rectC(it.id, x + it.lw * s / 2, y + rh / 2,
                    it.ow * scale, it.oh * scale, it.ow, it.oh));
                x += it.lw * s + gx;
            }
            y += rh + gy;
        }
        return out;
    }

    // The optimizer's starting points, as startPos(kind) gives them (each kind
    // computed once):
    // * 'none': the real (overlapping) positions
    // * 'push': push apart, with its own settings (S.pushStart)
    // * 'rows', 'grid': those layouts' centers with their overall scale
    //   undone, then overlaps resolved (true-size windows can be too big
    //   for grid cells)
    // The push-apart and ordered-rows layouts are handed on to the
    // safeguard (`shared`), which would otherwise compute them again.
    function makeStartPositions(windows, S, A, items, R0, padStart, shared) {
        const n = items.length;
        const startCache = {};
        const startPos = kind => {
            if (startCache[kind])
                return startCache[kind];
            const R = R0.map(r => ({ ...r }));
            const push = S.pushStart;
            const P = INTERNAL.START_RESOLVE;
            // for 'none', R stays R0
            if (kind === 'push') {
                // the push-apart algorithm's first step
                const rng = random(INTERNAL.SEED_TIES);
                resolve(R, push.passes, push.strength, push.matchShape, A, rng);
                shared.push = { items, R: R.map(r => ({ ...r })), pad: { ...padStart } };
            } else if (kind === 'rows' || kind === 'grid') {
                let T;
                try {
                    T = kind === 'rows'
                        ? layoutRows(windows, { ...S, rows: S.rowsStart.rows }, A)
                        : layoutGrid(windows, S, A);
                } catch (e) {
                    // no room for ordered rows: start from push apart instead
                    return (startCache[kind] = startPos('push'));
                }
                if (kind === 'rows')
                    shared.rows = T;
                const byId = new Map(T.map(t => [t.id, t]));
                let ls = 0;
                for (const it of items)
                    ls += Math.log(byId.get(it.id).w / it.lw);
                const s0 = Math.exp(ls / n);
                items.forEach((it, i) => {
                    const t = byId.get(it.id);
                    R[i].x = (t.x + t.w / 2) / s0;
                    R[i].y = (t.y + t.h / 2) / s0;
                });
                resolve(R, P.passes, P.strength, 0, A, random(INTERNAL.SEED_TIES));
            }
            return (startCache[kind] = {
                X: Float64Array.from(R, r => r.x),
                Y: Float64Array.from(R, r => r.y),
            });
        };
        return startPos;
    }

    // The optimizer's objective, for the layout prepared in `items` with the
    // padding `pad`: searchScore(X, Y), and gradient(X, Y, mu), which returns
    // the smoothed score and leaves its gradient in gX, gY. Also returns the
    // padded sizes W, H and their average size avg.
    function makeSearch(items, pad, S, A) {
        const n = items.length;

        // In layout units: W, H the padded sizes, OX, OY the real centers, sumA
        // the total padded area, avg the mean of sqrt(W * H).
        const W = Float64Array.from(items, it => it.lw + pad.x);
        const H = Float64Array.from(items, it => it.lh + pad.y);
        const OX = Float64Array.from(items, it => it.cx);
        const OY = Float64Array.from(items, it => it.cy);
        let sumA = 0;
        let avg = 0;
        for (let i = 0; i < n; i++) {
            sumA += W[i] * H[i];
            avg += Math.sqrt(W[i] * H[i]) / n;
        }

        // the relations term (see makeRelations()), unpacked for the hot loops
        const rel = makeRelations(OX, OY,
            items.map(it => it.ow), items.map(it => it.oh),
            items.map(it => it.lw), items.map(it => it.lh), S, A.diag);
        const relOn = rel.relOn;
        const relPen = rel.pen;
        const pairs = rel.pairs;
        const dirArrays = rel.dirArrays;
        const RW = rel.RW;
        const RUX = rel.RUX;
        const RUY = rel.RUY;

        // the weights of the movement and relations terms, as in makeScorer()
        const kDisp = S.wPlace * 2 / n / A.diag;
        const kRel = rel.relNorm > 0 ? S.wRelations * INTERNAL.W_REL / rel.relNorm : 0;

        // the mean real center
        let mOX = 0;
        let mOY = 0;
        for (let i = 0; i < n; i++) {
            mOX += OX[i] / n;
            mOY += OY[i] / n;
        }

        // The size cost at the shared scale s: -wSize * ln(min(s, maxScale)).
        // The distortion term is always 0 here: one shared scale, and
        // thumbnails held at maxScale count as their intended size.
        const lnMax = Math.log(S.maxScale);
        const sizeCost = s => -Math.min(Math.log(s), lnMax) * S.wSize;

        // The same, with its corner rounded over GD_SMOOTH_CAP in ln s, for the
        // descent: returns the value and sets sizeSlope = d(value) / d(ln s).
        const tauC = INTERNAL.GD_SMOOTH_CAP;
        let sizeSlope = 0;
        const sizeCostSmooth = ls => {
            // soft min(ln s, lnMax)
            //     = ln s - tauC * softplus((ln s - lnMax) / tauC),
            // with softplus(z) = ln(1 + e^z) written so exp() can't overflow
            const z = (ls - lnMax) / tauC;
            const sp = z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
            sizeSlope = -S.wSize / (1 + Math.exp(z));
            return -(ls - tauC * sp) * S.wSize;
        };

        // Places the arrangement as the pipeline will (before any final
        // centering), leaving the result in `place`: scaled by s about the
        // center of the box (x1, y1, x2, y2), then moved toward the real
        // windows as far as the work area allows. Thumbnail i lands at
        //     px + (X[i] - bcx) * s = base + (X[i] - ref) * s,
        // where base doesn't depend on X (for x: mOX, A.x or A.x + A.w), and
        // ref is
        // * mean(X) while the move is free (mode 0)
        // * the box's left side + pad.x / 2 when held at the left (mode 1)
        // * its right side - pad.x / 2 when held at the right (mode 2)
        // The same for y.
        const place = {
            px: 0, py: 0, bcx: 0, bcy: 0, modeX: 0, modeY: 0, refX: 0, refY: 0,
        };
        const placeAt = (X, Y, x1, y1, x2, y2, s) => {
            const bcx = (x1 + x2) / 2;
            const bcy = (y1 + y2) / 2;
            place.bcx = bcx;
            place.bcy = bcy;

            let mX = 0;
            let mY = 0;
            for (let i = 0; i < n; i++) {
                mX += X[i];
                mY += Y[i];
            }
            mX /= n;
            mY /= n;

            const mx = mOX - (mX - bcx) * s;
            const my = mOY - (mY - bcy) * s;
            const hw = (x2 - x1 - pad.x) * s / 2;
            const hh = (y2 - y1 - pad.y) * s / 2;
            const lx = A.x + hw;
            const hx = A.x + A.w - hw;
            const ly = A.y + hh;
            const hy = A.y + A.h - hh;

            place.px = clamp(mx, lx, hx);
            place.py = clamp(my, ly, hy);
            place.modeX = mx < lx ? 1 : mx > hx ? 2 : 0;
            place.modeY = my < ly ? 1 : my > hy ? 2 : 0;
            const mdX = place.modeX;
            const mdY = place.modeY;
            place.refX = mdX === 0 ? mX : mdX === 1 ? x1 + pad.x / 2 : x2 - pad.x / 2;
            place.refY = mdY === 0 ? mY : mdY === 1 ? y1 + pad.y / 2 : y2 - pad.y / 2;
        };

        // The search score: scoreLayout() in layout units, plus an overlap term
        // between the padded boxes, so too-small gaps count too. Exact unless
        // some thumbnail is held at maxScale; then the room to move toward the
        // real windows is slightly underestimated. Used to pick the winner when
        // weak starts aren't dropped.
        const searchScore = (X, Y) => {
            let x1 = Infinity;
            let y1 = Infinity;
            let x2 = -Infinity;
            let y2 = -Infinity;
            for (let i = 0; i < n; i++) {
                const hw = W[i] / 2;
                const hh = H[i] / 2;
                if (X[i] - hw < x1)
                    x1 = X[i] - hw;
                if (X[i] + hw > x2)
                    x2 = X[i] + hw;
                if (Y[i] - hh < y1)
                    y1 = Y[i] - hh;
                if (Y[i] + hh > y2)
                    y2 = Y[i] + hh;
            }
            const s = Math.min(A.w / (x2 - x1 - pad.x), A.h / (y2 - y1 - pad.y));
            placeAt(X, Y, x1, y1, x2, y2, s);

            let d = 0;
            let o = 0;
            let r = 0;
            for (let i = 0; i < n; i++) {
                const dx = place.px + (X[i] - place.bcx) * s - OX[i];
                const dy = place.py + (Y[i] - place.bcy) * s - OY[i];
                d += Math.sqrt(dx * dx + dy * dy);
                for (let j = i + 1; j < n; j++) {
                    o += overlapArea(X, Y, W, H, i, j);
                    if (relOn)
                        r += relPen(X, Y, i, j);
                }
            }
            return sizeCost(s) + kDisp * d + INTERNAL.W_OVERLAP * o / sumA + kRel * r;
        };

        // The smoothed search score at overlap weight mu (raised during the
        // descent); its gradient goes to gX, gY. Unlike searchScore(), the
        // box's sides are soft maxima (log-sum-exp, width GD_SMOOTH times the
        // average size), the scale is a soft max over width and height
        // (GD_SMOOTH_WH), and the size cost's corner at maxScale is rounded
        // (GD_SMOOTH_CAP). Placement still uses the hard box.
        const gX = new Float64Array(n);
        const gY = new Float64Array(n);
        // scratch, refilled by each call: the soft-max weights of the box's
        // right, left, bottom and top sides (e1..e4), and each thumbnail's unit
        // direction away from its real window (u1, u2)
        const e1 = new Float64Array(n);
        const e2 = new Float64Array(n);
        const e3 = new Float64Array(n);
        const e4 = new Float64Array(n);
        const u1 = new Float64Array(n);
        const u2 = new Float64Array(n);
        const tau = INTERNAL.GD_SMOOTH * avg;
        const tauWH = INTERNAL.GD_SMOOTH_WH;
        const near = INTERNAL.GD_NEAR * avg;

        const gradient = (X, Y, mu) => {
            gX.fill(0);
            gY.fill(0);

            // the box, and which windows set its sides
            let x1 = Infinity;
            let y1 = Infinity;
            let x2 = -Infinity;
            let y2 = -Infinity;
            let i1 = 0;
            let i2 = 0;
            let j1 = 0;
            let j2 = 0;
            for (let i = 0; i < n; i++) {
                const hw = W[i] / 2;
                const hh = H[i] / 2;
                if (X[i] - hw < x1) {
                    x1 = X[i] - hw;
                    i1 = i;
                }
                if (X[i] + hw > x2) {
                    x2 = X[i] + hw;
                    i2 = i;
                }
                if (Y[i] - hh < y1) {
                    y1 = Y[i] - hh;
                    j1 = i;
                }
                if (Y[i] + hh > y2) {
                    y2 = Y[i] + hh;
                    j2 = i;
                }
            }

            // the box's width bw and height bh (soft), the scale
            // s = exp(-softmax(la, lb)), and wa: how much the width sets it
            let s1 = 0;
            let s2 = 0;
            let s3 = 0;
            let s4 = 0;
            for (let i = 0; i < n; i++) {
                s1 += e1[i] = Math.exp((X[i] + W[i] / 2 - x2) / tau);
                s2 += e2[i] = Math.exp((x1 - X[i] + W[i] / 2) / tau);
                s3 += e3[i] = Math.exp((Y[i] + H[i] / 2 - y2) / tau);
                s4 += e4[i] = Math.exp((y1 - Y[i] + H[i] / 2) / tau);
            }
            const bw = x2 - x1 + tau * Math.log(s1 * s2) - pad.x;
            const bh = y2 - y1 + tau * Math.log(s3 * s4) - pad.y;
            const la = Math.log(bw / A.w);
            const lb = Math.log(bh / A.h);
            const lm = Math.max(la, lb);
            const ea = Math.exp((la - lm) / tauWH);
            const eb = Math.exp((lb - lm) / tauWH);
            const smax = lm + tauWH * Math.log(ea + eb);
            const wa = ea / (ea + eb);
            const s = Math.exp(-smax);

            // movement: each thumbnail's distance from its real window
            placeAt(X, Y, x1, y1, x2, y2, s);
            const rX = place.refX;
            const rY = place.refY;
            let d = 0;
            let ux = 0;
            let uy = 0;
            let dS = 0;
            for (let i = 0; i < n; i++) {
                const dx = place.px + (X[i] - place.bcx) * s - OX[i];
                const dy = place.py + (Y[i] - place.bcy) * s - OY[i];
                const di = Math.sqrt(dx * dx + dy * dy);
                const u = di > 1e-9 ? 1 / di : 0;
                d += di;
                u1[i] = dx * u;
                u2[i] = dy * u;
                ux += u1[i];
                uy += u2[i];
                // d(d) / d(s)
                dS += u1[i] * (X[i] - rX) + u2[i] * (Y[i] - rY);
            }
            const kd = kDisp * s;
            for (let i = 0; i < n; i++) {
                gX[i] += kd * u1[i];
                gY[i] += kd * u2[i];
            }

            // movement through ref, which is the mean of X (mode 0) or follows
            // the window that sets the held side of the box (modes 1 and 2)
            const mxm = place.modeX;
            const mym = place.modeY;
            if (mxm === 0) {
                for (let i = 0; i < n; i++)
                    gX[i] -= kd * ux / n;
            }
            if (mxm === 1)
                gX[i1] -= kd * ux;
            if (mxm === 2)
                gX[i2] -= kd * ux;
            if (mym === 0) {
                for (let i = 0; i < n; i++)
                    gY[i] -= kd * uy / n;
            }
            if (mym === 1)
                gY[j1] -= kd * uy;
            if (mym === 2)
                gY[j2] -= kd * uy;

            // Size, and movement through the scale: dlns = -d(score) / d(ln s).
            // With d(ln s) / d(ln bw) = -wa and d(ln s) / d(ln bh) = -(1 - wa),
            // kw and kh are d(score) / d(bw) and d(score) / d(bh).
            // sizeCostSmooth() sets sizeSlope, so it must run first.
            const f = kDisp * d + sizeCostSmooth(-smax);
            const dlns = -sizeSlope - kd * dS;
            const kw = dlns * wa / bw;
            const kh = dlns * (1 - wa) / bh;
            for (let i = 0; i < n; i++) {
                gX[i] += kw * (e1[i] / s1 - e2[i] / s2);
                gY[i] += kh * (e3[i] / s3 - e4[i] / s4);
            }

            // overlaps and relations, per pair
            const kOv = mu / sumA;
            let o = 0;
            let r = 0;
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const dx = X[j] - X[i];
                    const dy = Y[j] - Y[i];
                    const ox = (W[i] + W[j]) / 2 - Math.abs(dx);
                    const oy = (H[i] + H[j]) / 2 - Math.abs(dy);
                    if (ox > 0 && oy > 0) {
                        o += ox * oy;
                        const gx = dx < 0 ? -kOv * oy : kOv * oy;
                        const gy = dy < 0 ? -kOv * ox : kOv * ox;
                        gX[i] += gx;
                        gX[j] -= gx;
                        gY[i] += gy;
                        gY[j] -= gy;
                    }

                    if (dirArrays) {
                        // the direction method: dirPen(), and its gradient
                        const k = i * n + j;
                        const wt = RW[k];
                        if (!wt)
                            continue;
                        const rx = RUX[k];
                        const ry = RUY[k];
                        const dd = Math.sqrt(dx * dx + dy * dy);
                        if (dd < 1e-6) {
                            r += wt * 0.5;
                            continue;
                        }
                        const cs = (rx * dx + ry * dy) / dd;
                        r += wt * (1 - cs) / 2;

                        // The gradient grows as 1 / distance; it is capped for
                        // (nearly) coinciding windows, where the overlap
                        // gradient matters anyway.
                        const c = -kRel * wt / 2 / Math.max(dd, near);
                        const gx = c * (rx - cs * dx / dd);
                        const gy = c * (ry - cs * dy / dd);
                        gX[j] += gx;
                        gY[j] += gy;
                        gX[i] -= gx;
                        gY[i] -= gy;
                    } else if (relOn) {
                        // the order method: piecewise linear (makeRelations())
                        const pr = pairs[i * n + j];
                        if (!pr.wt)
                            continue;
                        const vx = -pr.sx * dx / pr.nx;
                        const vy = -pr.sy * dy / pr.ny;
                        r += pr.cx * clamp(vx, 0, 1) + pr.cy * clamp(vy, 0, 1);
                        if (vx > 0 && vx < 1) {
                            const gx = -kRel * pr.cx * pr.sx / pr.nx;
                            gX[j] += gx;
                            gX[i] -= gx;
                        }
                        if (vy > 0 && vy < 1) {
                            const gy = -kRel * pr.cy * pr.sy / pr.ny;
                            gY[j] += gy;
                            gY[i] -= gy;
                        }
                    }
                }
            }
            return f + kOv * o + kRel * r;
        };

        return { W, H, avg, gX, gY, searchScore, gradient };
    }

    // Optimizer: gradient descent over the window centers in layout units (one
    // shared scale, exact relative sizes), on a smoothed search score. The
    // overlap cost starts low and grows, so the arrangement first contracts
    // through overlaps and then separates. Several starts race; at checkpoints
    // the worse half is dropped. The starts come from makeStartPositions(), the
    // score and its gradient from makeSearch().
    function layoutOptimizer(windows, S, A, info, shared) {
        // R0 is the real positions with push apart's padding, so the 'push'
        // start is exactly the push-apart algorithm's.
        const items = prep(windows, S);
        const n = items.length;
        const padStart = estPad(items, S, A);
        const R0 = items.map(it => ({
            x: it.cx, y: it.cy, w: it.lw + padStart.x, h: it.lh + padStart.y,
        }));
        if (n < 2)
            return finalize(items, R0, padStart, A, S);

        // The search pads less, so it packs tighter and its scale and gaps come
        // out larger.
        const pad = estPad(items, S, A, INTERNAL.DENSITY_SEARCH);

        const startPos = makeStartPositions(windows, S, A, items, R0, padStart, shared);

        const KINDS = INTERNAL.START_KINDS;
        const kindOf = c =>
            S.startFrom === 'mixed' ? KINDS[c % KINDS.length] : (S.startFrom || 'push');

        const { W, H, avg, gX, gY, searchScore, gradient } =
            makeSearch(items, pad, S, A);

        // Starts beyond the first kindsUsed repeat a kind and are shaken.
        const kindsUsed = S.startFrom === 'mixed' ? KINDS.length : 1;

        // One start: c its number, X, Y its positions, t the steps taken, f its
        // smoothed score (at the start of the last step), and its Adam state:
        // the running averages of the gradient and its square, and B1, B2 to
        // the power t.
        const makeStart = c => {
            const kind = kindOf(c);
            const sp = startPos(kind);
            const st = {
                c, kind, X: sp.X.slice(), Y: sp.Y.slice(), t: 0, f: Infinity,
                mX: new Float64Array(n), mY: new Float64Array(n),
                vX: new Float64Array(n), vY: new Float64Array(n),
                b1t: 1, b2t: 1,
            };
            if (c >= kindsUsed) {
                // an earlier start already used this kind: shake this one
                const rng = random(
                    (S.seed * INTERNAL.START_SEED_A + c * INTERNAL.START_SEED_B) | 0
                );
                const sig = INTERNAL.GD_SHAKE * avg;
                for (let i = 0; i < n; i++) {
                    // normal random numbers (Box-Muller)
                    const m = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12)));
                    const a = 2 * Math.PI * rng();
                    st.X[i] += m * Math.cos(a) * sig;
                    st.Y[i] += m * Math.sin(a) * sig;
                }
            }
            return st;
        };

        // Descend until step `until` of a schedule of L steps: the step size
        // goes from lr0 down to lr1, the overlap weight from mu0 up to mu1,
        // both geometrically.
        const B1 = INTERNAL.GD_B1;
        const B2 = INTERNAL.GD_B2;
        const lr0 = S.firstStep * avg;
        const lr1 = INTERNAL.GD_STEP_END * avg;
        const mu0 = INTERNAL.GD_MU_START;
        const mu1 = INTERNAL.GD_MU_END;
        const descend = (st, until, L) => {
            const X = st.X;
            const Y = st.Y;
            const mX = st.mX;
            const mY = st.mY;
            const vX = st.vX;
            const vY = st.vY;

            for (; st.t < until; st.t++) {
                const fr = st.t / L;
                const lr = lr0 * Math.pow(lr1 / lr0, fr);
                const mu = mu0 * Math.pow(mu1 / mu0, fr);
                st.f = gradient(X, Y, mu);
                st.b1t *= B1;
                st.b2t *= B2;
                const c1 = lr / (1 - st.b1t);
                const c2 = 1 / (1 - st.b2t);
                for (let i = 0; i < n; i++) {
                    const gx = gX[i];
                    const gy = gY[i];
                    mX[i] = B1 * mX[i] + (1 - B1) * gx;
                    mY[i] = B1 * mY[i] + (1 - B1) * gy;
                    vX[i] = B2 * vX[i] + (1 - B2) * gx * gx;
                    vY[i] = B2 * vY[i] + (1 - B2) * gy * gy;
                    X[i] -= c1 * mX[i] / (Math.sqrt(vX[i] * c2) + 1e-30);
                    Y[i] -= c1 * mY[i] / (Math.sqrt(vY[i] * c2) + 1e-30);
                }
            }
        };

        // The race. counts[r] starts run in round r, which ends at fraction
        // q[r] of the L-step schedule (the first at S.checkpoint, the rest
        // evenly up to 1). At each checkpoint the starts are ranked by their
        // smoothed score, all at the same overlap weight. L makes the steps of
        // all starts add up to S.steps.
        const K = Math.max(1, Math.round(S.starts));
        const counts = [K];
        if (S.dropWeakStarts) {
            while (counts[counts.length - 1] > 1)
                counts.push(Math.ceil(counts[counts.length - 1] / 2));
        }
        const rounds = counts.length;
        const q = counts.map((_, r) =>
            rounds === 1 ? 1 : S.checkpoint + (1 - S.checkpoint) * r / (rounds - 1));
        q[rounds - 1] = 1;
        const share = counts.reduce((s, k, r) => s + k * (q[r] - (r ? q[r - 1] : 0)), 0);
        const L = Math.max(1, Math.round(S.steps / share));

        const starts = Array.from({ length: K }, (_, c) => makeStart(c));
        let alive = starts.slice();
        for (let r = 0; r < rounds; r++) {
            const until = Math.round(q[r] * L);
            for (const st of alive)
                descend(st, until, L);
            if (r + 1 < rounds) {
                // best first; ties keep the lower start number
                alive.sort((a, b) => a.f - b.f || a.c - b.c);
                alive = alive.slice(0, counts[r + 1]);
            }
        }

        let win = alive[0];
        if (alive.length > 1) {
            // without dropping weak starts: the best finished start wins
            let best = Infinity;
            for (const st of alive) {
                const value = searchScore(st.X, st.Y);
                if (value < best) {
                    best = value;
                    win = st;
                }
            }
        }

        // no overlap may remain
        const R = items.map((it, i) => ({ x: win.X[i], y: win.Y[i], w: W[i], h: H[i] }));
        resolve(R, INTERNAL.CLEANUP.passes, INTERNAL.CLEANUP.strength, 0, A,
            random(INTERNAL.SEED_CLEANUP));
        enforceGap(items, R, pad, A, S);

        info.starts = K;
        info.winningStart = win.c + 1;
        info.winningKind = win.kind;
        info.startsPerRound = counts;
        info.stepsPerStart = L;
        return finalize(items, R, pad, A, S);
    }

    // uniformScale: one scale for all windows (compute() then places, fills and
    // centers the result); polishable: the polish step may run.
    const ALGORITHMS = {
        optimizer: { run: layoutOptimizer, uniformScale: true, polishable: true },
        push: { run: layoutPush, uniformScale: true, polishable: true },
        rows: { run: layoutRows, uniformScale: true, polishable: false },
        grid: { run: layoutGrid, uniformScale: false, polishable: false },
    };

    // 8. Post-steps -----------------------------------------------------------
    // Applied by compute() after the algorithm.

    // Move the finished arrangement as a whole by the mean offset of the real
    // window centers from the thumbnail centers, within the work area.
    function placeNearReal(T, windows, A) {
        const by = new Map(windows.map(w => [w.id, w]));
        let mx = 0;
        let my = 0;
        let x1 = Infinity;
        let y1 = Infinity;
        let x2 = -Infinity;
        let y2 = -Infinity;
        for (const t of T) {
            const w = by.get(t.id);
            mx += w.x + w.w / 2 - (t.x + t.w / 2);
            my += w.y + w.h / 2 - (t.y + t.h / 2);
            x1 = Math.min(x1, t.x);
            y1 = Math.min(y1, t.y);
            x2 = Math.max(x2, t.x + t.w);
            y2 = Math.max(y2, t.y + t.h);
        }
        const dx = clamp(mx / T.length, A.x - x1, A.x + A.w - x2);
        const dy = clamp(my / T.length, A.y - y1, A.y + A.h - y2);
        return T.map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
    }

    // Move the finished arrangement as a whole to the center of the work area.
    function centerLayout(T, A) {
        let x1 = Infinity;
        let y1 = Infinity;
        let x2 = -Infinity;
        let y2 = -Infinity;
        for (const t of T) {
            x1 = Math.min(x1, t.x);
            y1 = Math.min(y1, t.y);
            x2 = Math.max(x2, t.x + t.w);
            y2 = Math.max(y2, t.y + t.h);
        }
        const dx = A.cx - (x1 + x2) / 2;
        const dy = A.cy - (y1 + y2) / 2;
        return T.map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
    }

    // Greedy polish: small moves in 8 directions with shrinking steps, kept
    // only if they lower the score. A thumbnail only moves into free space:
    // never closer to a neighbor than the gaps (or than it already was), never
    // outside the work area. Where the two gaps differ, separations are
    // measured between thumbnails made wider (or taller) by the difference, and
    // held to the smaller gap. A pair already closer than that (the gaps leave
    // no room) may get no closer in the real separation either, so it can't
    // come to overlap.
    //
    // Only the terms involving the moving thumbnail change, so a move is judged
    // by local() before and after. The near list, anyOv and idleAt only skip
    // work; the result is the same as checking every move against every
    // thumbnail.
    function polishLayout(T, windows, S, A) {
        const scorer = makeScorer(T, windows, S, A);
        const n = scorer.n;
        const G = gaps(S);
        const g = Math.min(G.x, G.y);
        const ex = G.x - g;
        const ey = G.y - g;
        if (n < 1)
            return { T, moved: 0, gain: 0 };

        // the thumbnails' sizes (fixed) and centers (moved by the polish)
        const Wt = Float64Array.from(scorer.Wt);
        const Ht = Float64Array.from(scorer.Ht);
        const X = Float64Array.from(T, t => t.x + t.w / 2);
        const Y = Float64Array.from(T, t => t.y + t.h / 2);

        const OX = scorer.OX;
        const OY = scorer.OY;
        const kDisp = scorer.kDisp;
        const kRel = scorer.kRel;
        const kOv = scorer.kOv;
        const rel = scorer.rel;
        const relOn = rel.relOn;
        const dirArrays = rel.dirArrays;
        const RW = rel.RW;
        const RUX = rel.RUX;
        const RUY = rel.RUY;

        // the work area, with 0.5 px of tolerance
        const ax1 = A.x - 0.5;
        const ax2 = A.x + A.w + 0.5;
        const ay1 = A.y - 0.5;
        const ay2 = A.y + A.h + 0.5;

        const avg = scorer.Wt.reduce((q, w, i) => q + Math.sqrt(w * Ht[i]), 0) / n;
        const step0 = avg * INTERNAL.POLISH_FIRST_STEP;

        // The separation of thumbnail i at (x, y) from thumbnail j: the larger
        // of the x gap less ex and the y gap less ey; below 0 when they overlap
        // (or come closer than ex and ey).
        const sep = (i, j, x, y) => Math.max(
            Math.abs(x - X[j]) - (Wt[i] + Wt[j]) / 2 - ex,
            Math.abs(y - Y[j]) - (Ht[i] + Ht[j]) / 2 - ey
        );

        // the real separation (without ex and ey); at least sep
        const apart = (i, j, x, y) => Math.max(
            Math.abs(x - X[j]) - (Wt[i] + Wt[j]) / 2,
            Math.abs(y - Y[j]) - (Ht[i] + Ht[j]) / 2
        );

        // True if some pair has sep < 0, which only happens when overlap
        // removal hit its limit or the gaps leave no room. While false, every
        // overlap term is exactly 0.
        let anyOv = false;
        for (let i = 0; i < n && !anyOv; i++) {
            for (let j = i + 1; j < n; j++) {
                if (sep(i, j, X[i], Y[i]) < 0) {
                    anyOv = true;
                    break;
                }
            }
        }

        // The score terms involving thumbnail i, with i at (x, y), summed in
        // the same order as the full score (the skipped terms are exactly 0).
        // With full, the overlap terms are included.
        const local = (i, x, y, full) => {
            const dx = x - OX[i];
            const dy = y - OY[i];
            let v = kDisp * Math.sqrt(dx * dx + dy * dy);
            if (dirArrays && !full) {
                for (let j = 0, k = i * n; j < n; j++, k++) {
                    const wt = RW[k];
                    if (wt)
                        v += kRel * dirPen(wt, RUX[k], RUY[k], X[j] - x, Y[j] - y);
                }
            } else if (relOn || full) {
                // rel.pen() and overlapArea() read i's center from X, Y: put it
                // at (x, y) for the sum, then back
                const px = X[i];
                const py = Y[i];
                X[i] = x;
                Y[i] = y;
                for (let j = 0; j < n; j++) {
                    if (j !== i) {
                        if (relOn)
                            v += kRel * rel.pen(X, Y, i, j);
                        if (full)
                            v += kOv * overlapArea(X, Y, Wt, Ht, i, j);
                    }
                }
                X[i] = px;
                Y[i] = py;
            }
            return v;
        };

        // findNear(i) collects the neighbors a move of up to step0 could bring
        // too close, sorted by their current sep (nearS). nearT is the sep a
        // move must keep, and nearR the real separation it must keep, for pairs
        // already at sep < 0. A neighbor at sep >= g + step is still beyond g
        // after any move of that step, so it can't block the move or overlap.
        // REACH is a small px margin on that.
        const REACH = 1e-3;
        const nearJ = new Int32Array(n);
        const nearS = new Float64Array(n);
        const nearT = new Float64Array(n);
        const nearR = new Float64Array(n);
        let nearN = 0;
        const findNear = i => {
            nearN = 0;
            const lim = g + step0 + REACH;
            for (let j = 0; j < n; j++) {
                if (j !== i) {
                    const s = sep(i, j, X[i], Y[i]);
                    if (s >= lim)
                        continue;

                    // insertion sort: shift farther entries up one slot
                    let k = nearN++;
                    for (; k > 0 && nearS[k - 1] > s; k--) {
                        nearJ[k] = nearJ[k - 1];
                        nearS[k] = nearS[k - 1];
                        nearT[k] = nearT[k - 1];
                        nearR[k] = nearR[k - 1];
                    }
                    // 1e-6 px: the polish's tolerance for rounding
                    nearJ[k] = j;
                    nearS[k] = s;
                    nearT[k] = Math.min(g, s) - 1e-6;
                    nearR[k] = s < 0 ? Math.min(0, apart(i, j, X[i], Y[i])) - 1e-6 : 0;
                }
            }
        };

        // the 8 directions: right, left, down, up, then the diagonals
        // (0.7071 = 1 / sqrt(2))
        const DX = [1, -1, 0, 0, 0.7071, 0.7071, -0.7071, -0.7071];
        const DY = [0, 0, 1, -1, 0.7071, -0.7071, 0.7071, -0.7071];

        // idleAt[i]: the value of `moved` when thumbnail i was last scanned
        // without moving. While nothing has moved since, a new scan would find
        // nothing again.
        const idleAt = new Int32Array(n).fill(-1);
        let moved = 0;
        let gain = 0;
        for (let pass = 0; pass < INTERNAL.POLISH_PASSES; pass++) {
            let improved = false;
            for (let i = 0; i < n; i++) {
                if (idleAt[i] === moved)
                    continue;
                const moved0 = moved;
                const hw = Wt[i] / 2;
                const hh = Ht[i] / 2;
                let before = 0;
                let haveBefore = false;
                findNear(i);

                for (let step = step0; step >= INTERNAL.POLISH_MIN_STEP; step /= 2) {
                    const lim = g + step + REACH;
                    for (let d = 0; d < 8; d++) {
                        const nx = X[i] + DX[d] * step;
                        const ny = Y[i] + DY[d] * step;
                        if (nx - hw < ax1 || nx + hw > ax2)
                            continue;
                        if (ny - hh < ay1 || ny + hh > ay2)
                            continue;

                        // keep clear of the near neighbors within reach of this
                        // step (the list is sorted by distance)
                        let fits = true;
                        let minSep = Infinity;
                        for (let k = 0; k < nearN && nearS[k] < lim; k++) {
                            const s = sep(i, nearJ[k], nx, ny);
                            if (s < nearT[k]) {
                                fits = false;
                                break;
                            }
                            if (s < 0 && apart(i, nearJ[k], nx, ny) < nearR[k]) {
                                fits = false;
                                break;
                            }
                            if (s < minSep)
                                minSep = s;
                        }
                        if (!fits)
                            continue;

                        // keep the move only if it lowers the score beyond
                        // rounding
                        if (!haveBefore) {
                            before = local(i, X[i], Y[i], anyOv);
                            haveBefore = true;
                        }
                        const after = local(i, nx, ny, anyOv || minSep < 0);
                        const dl = after - before;
                        if (dl < -1e-9) {
                            X[i] = nx;
                            Y[i] = ny;
                            gain -= dl;
                            moved++;
                            improved = true;
                            before = after;
                            if (minSep < 0)
                                anyOv = true;
                            findNear(i);
                        }
                    }
                }
                if (moved === moved0)
                    idleAt[i] = moved;
            }
            if (!improved)
                break;
        }
        return {
            T: T.map((t, i) => ({ ...t, x: X[i] - Wt[i] / 2, y: Y[i] - Ht[i] / 2 })),
            moved,
            gain,
        };
    }

    // The optimizer's safeguard: build the push-apart and ordered-rows layouts
    // (with their own settings, S.pushStart and S.rowsStart), finish them with
    // the same post-steps, and keep whatever scores best. A candidate is
    // polished if either the optimizer or that algorithm polishes, and
    // polishing only ever lowers a score, so the optimizer is never worse than
    // those algorithms. The grid isn't a candidate: the optimizer must not
    // scale windows unevenly.
    //
    // Where the search started from these layouts, they come from it
    // (`shared`), identical to building them here. A candidate's polish is
    // skipped when even its best possible polished score couldn't win
    // (polishLowerBound()): the same outcome as polishing it and losing.
    function optimizerSafeguard(T, windows, S, A, info, shared) {
        let best = T;
        let bestScore = scoreLayout(T, windows, S, A).total;
        let from = null;
        for (const k of ['push', 'rows']) {
            let C;
            if (k === 'rows') {
                try {
                    C = shared.rows ||
                        layoutRows(windows, { ...S, rows: S.rowsStart.rows }, A);
                } catch (e) {
                    // no room for ordered rows: nothing to compare with
                    continue;
                }
            } else if (shared.push) {
                // the push-apart algorithm's remaining steps
                const p = shared.push;
                enforceGap(p.items, p.R, p.pad, A, S);
                C = finalize(p.items, p.R, p.pad, A, S);
            } else {
                // its own settings; its diagnostics aren't kept
                const P = S.pushStart;
                C = layoutPush(windows, {
                    ...S,
                    passes: P.passes,
                    strength: P.strength,
                    matchShape: P.matchShape,
                }, A, {});
            }

            C = placeNearReal(C, windows, A);
            if (S.polish || (k === 'push' && S.pushStart.polish)) {
                // can't win, polished or not
                if (polishLowerBound(C, windows, S, A) >= bestScore + 1e-9)
                    continue;
                C = polishLayout(C, windows, S, A).T;
            }
            // only a clear win (beyond rounding) replaces the current best
            const total = scoreLayout(C, windows, S, A).total;
            if (total < bestScore - 1e-12) {
                best = C;
                bestScore = total;
                from = k;
            }
        }

        // null: the search's own result was best
        info.keptStart = from;
        return best;
    }

    // A score that polishing C can never get below. The polish doesn't change
    // sizes, so the size terms stay as they are; the relations and overlap
    // terms are at least 0 (up to rounding, far below the caller's 1e-9
    // margin); and the movement term is at least what pairs of thumbnails that
    // would be too close at their real positions force on them:
    // * The polish never brings two thumbnails closer than min(g, their
    //   separation in C), less 1e-6 px per move (its tolerance), with
    //   separations measured as polishLayout()'s sep(). `slack` covers the most
    //   moves it can make.
    // * For a pair to stay that far apart, the distances of the two from their
    //   real positions must add up to at least m (the shortfall along the axis
    //   that is cheaper to fix).
    // * Over pairs that share no thumbnail these add up; they are picked
    //   largest m first.
    function polishLowerBound(C, windows, S, A) {
        const scorer = makeScorer(C, windows, S, A);
        const n = scorer.n;
        const OX = scorer.OX;
        const OY = scorer.OY;
        const X = C.map(t => t.x + t.w / 2);
        const Y = C.map(t => t.y + t.h / 2);
        const p = scorer.parts(X, Y);
        const avg = C.reduce((q, t) => q + Math.sqrt(t.w * t.h), 0) / Math.max(1, n);

        // the number of step sizes the polish tries
        let steps = 0;
        const minStep = INTERNAL.POLISH_MIN_STEP;
        for (let s = avg * INTERNAL.POLISH_FIRST_STEP; s >= minStep; s /= 2)
            steps++;
        const slack = 1e-6 * INTERNAL.POLISH_PASSES * n * steps * 8 + 1e-3;

        // separations as the polish measures them
        const G = gaps(S);
        const g = Math.min(G.x, G.y);
        const ex = G.x - g;
        const ey = G.y - g;
        const pairs = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                // a, b: the center distances (plus ex, ey) at which the pair
                // touches along x and y
                const a = (C[i].w + C[j].w) / 2 + ex;
                const b = (C[i].h + C[j].h) / 2 + ey;
                const s0 = Math.max(Math.abs(X[i] - X[j]) - a, Math.abs(Y[i] - Y[j]) - b);
                const r = Math.min(g, s0) - slack;
                const m = Math.min(
                    a + r - Math.abs(OX[i] - OX[j]),
                    b + r - Math.abs(OY[i] - OY[j])
                );
                if (m > 0)
                    pairs.push([m, i, j]);
            }
        }

        // largest m first; ties by index, so the result never depends on the
        // sort's stability
        pairs.sort((u, v) => v[0] - u[0] || u[1] - v[1] || u[2] - v[2]);
        const taken = new Uint8Array(n);
        let move = 0;
        for (const [m, i, j] of pairs) {
            if (taken[i] || taken[j])
                continue;
            taken[i] = taken[j] = 1;
            move += m;
        }
        return p.size + p.sizes + scorer.kDisp * move;
    }

    // Gap filling: each thumbnail, smallest first, grows into free space, up to
    // S.maxGrowth. Changes T in place and returns it.
    function fillGaps(T, S, A) {
        const g = gaps(S);
        const gx = g.x;
        const gy = g.y;
        // smallest first; equal sizes top to bottom, then left to right
        const order = T.map((_, i) => i).sort((a, b) =>
            T[a].w * T[a].h - T[b].w * T[b].h ||
            T[a].y - T[b].y ||
            T[a].x - T[b].x);

        // whether r, as the new rectangle of thumbnail i, leaves the work area
        // (with 0.5 px of tolerance) or comes closer than the gaps to another
        const hits = (r, i) => {
            if (r.x < A.x - 0.5 || r.y < A.y - 0.5 ||
                r.x + r.w > A.x + A.w + 0.5 || r.y + r.h > A.y + A.h + 0.5) {
                return true;
            }
            for (let j = 0; j < T.length; j++) {
                if (j === i)
                    continue;
                const o = T[j];
                if (r.x < o.x + o.w + gx && o.x < r.x + r.w + gx &&
                    r.y < o.y + o.h + gy && o.y < r.y + r.h + gy) {
                    return true;
                }
            }
            return false;
        };

        for (const i of order) {
            const t = T[i];
            const cur = t.w / t.ow;
            const maxG = Math.min(S.maxGrowth, S.maxScale / cur);
            if (maxG <= 1)
                continue;
            const cx = t.x + t.w / 2;
            const cy = t.y + t.h / 2;
            let lo = 1;
            let hi = maxG;
            const at = k => rectC(t.id, cx, cy, t.w * k, t.h * k, t.ow, t.oh);
            // all of it if it fits, else bisect between 1 (fits) and maxG
            if (!hits(at(hi), i)) {
                lo = hi;
            } else {
                for (let k = 0; k < INTERNAL.FILL_BISECT; k++) {
                    const mid = (lo + hi) / 2;
                    if (hits(at(mid), i))
                        hi = mid;
                    else
                        lo = mid;
                }
            }
            T[i] = at(lo);
        }
        return T;
    }

    // 9. Public API -----------------------------------------------------------

    // The allowed values of the settings: a list of strings, or [min, max] for
    // numbers, with a third element true to exclude min. compute() refuses
    // others, which would give unusable layouts or NaN.
    const LIMITS = {
        margin: [0, Infinity],
        gap: [0, Infinity],
        extraGapX: [0, Infinity],
        extraGapY: [0, Infinity],
        fidelity: [0, 1],
        maxScale: [0, Infinity, true],
        maxGrowth: [1, Infinity],
        wSize: [0, Infinity],
        wSizes: [0, Infinity],
        wPlace: [0, Infinity],
        wRelations: [0, Infinity],
        neighborFocus: [0, 1],
        relationsMethod: ['order', 'direction'],
        steps: [1, Infinity],
        starts: [1, Infinity],
        checkpoint: [0, 1, true],
        firstStep: [0, Infinity, true],
        seed: [-Infinity, Infinity],
        startFrom: ['push', 'rows', 'grid', 'none', 'mixed'],
        passes: [0, Infinity],
        strength: [0, Infinity, true],
        matchShape: [0, Infinity],
        rows: [0, Infinity],
    };

    // Throws if a setting in S is outside LIMITS; `where` prefixes its name in
    // the message (e.g. 'pushStart.').
    function checkSettings(S, where) {
        for (const k of Object.keys(S)) {
            const lim = LIMITS[k];
            const v = S[k];
            if (!lim)
                continue;
            const ok = typeof lim[0] === 'string'
                ? lim.indexOf(v) >= 0
                : Number.isFinite(v) &&
                  v >= lim[0] &&
                  v <= lim[1] &&
                  !(lim[2] && v === lim[0]);
            if (!ok) {
                const shown = typeof v === 'string' ? JSON.stringify(v) : String(v);
                throw new Error('unusable setting: ' + where + k + ' = ' + shown);
            }
        }
    }

    /**
     * settings:
     * @algorithm: one of ALGORITHMS
     * @overrides: (optional) settings to change
     *
     * Returns: the settings of one algorithm: DEFAULTS.common,
     * DEFAULTS.scoring and the algorithm's own, with @overrides on top. For
     * the optimizer also pushStart and rowsStart, the settings of the layouts
     * it starts from (each also filled in from the defaults where @overrides
     * leaves something out).
     */
    function settings(algorithm, overrides) {
        if (!ALGORITHMS[algorithm])
            throw new Error('Unknown spread algorithm: ' + algorithm);
        const S = { ...DEFAULTS.common, ...DEFAULTS.scoring, ...DEFAULTS[algorithm] };
        if (algorithm === 'optimizer') {
            // the optimizer's starts: push apart and ordered rows, with those
            // algorithms' defaults
            const p = DEFAULTS.push;
            S.pushStart = {
                passes: p.passes,
                strength: p.strength,
                matchShape: p.matchShape,
                polish: p.polish,
            };
            S.rowsStart = { rows: DEFAULTS.rows.rows };
        }
        const all = { ...S, ...(overrides || {}) };
        if (algorithm === 'optimizer') {
            all.pushStart = { ...S.pushStart, ...all.pushStart };
            all.rowsStart = { ...S.rowsStart, ...all.rowsStart };
        }
        return all;
    }

    /**
     * compute:
     * @windows: the real window frames, [{ id, x, y, w, h }]: finite, sizes
     * above 0, unique numeric ids. Minimized windows are passed with their
     * normal frame.
     * @monitor: the area to use, { x, y, w, h }, in the same coordinates
     * @algorithm: one of ALGORITHMS
     * @S: (optional) the settings, as settings() gives them; anything left
     * out is taken from the defaults
     *
     * Runs the full pipeline: the algorithm, placement toward the real
     * windows, polish, the optimizer's safeguard, gap filling, the score, and
     * centering (if asked for).
     *
     * Returns: { targets, score, info }, where targets are the thumbnails,
     * [{ id, x, y, w, h, scale }], one per window, scale being w / the real
     * width; score is { total, size, sizes, movement, relations, overlap },
     * lower is better; and info holds diagnostics, where they apply:
     *   push        passes, hitLimit
     *   optimizer   starts, winningStart (from 1), winningKind,
     *               startsPerRound, stepsPerStart, keptStart (null, or the
     *               layout the safeguard kept)
     *   polish      polishMoves, polishGain
     * Throws on input it can't lay out, and on settings outside LIMITS.
     */
    function compute(windows, monitor, algorithm, S) {
        const algo = ALGORITHMS[algorithm];
        if (!algo)
            throw new Error('Unknown spread algorithm: ' + algorithm);
        // Fill in anything not given: a setting left out would otherwise turn
        // into NaN, and the equal grid's cell assignment never finishes on NaN.
        S = settings(algorithm, S);
        checkSettings(S, '');
        if (S.pushStart)
            checkSettings(S.pushStart, 'pushStart.');
        if (S.rowsStart)
            checkSettings(S.rowsStart, 'rowsStart.');

        // Reject input that can't be laid out; it could make the algorithms
        // misbehave.
        const A0 = workArea(monitor, S.margin);
        const info = {};
        if (![A0.x, A0.y, A0.w, A0.h].every(Number.isFinite) ||
            !(A0.w > 0) || !(A0.h > 0)) {
            throw new Error('no usable area: monitor ' + JSON.stringify(monitor) +
                ', margin ' + S.margin);
        }
        for (const w of windows) {
            if (![w.id, w.x, w.y, w.w, w.h].every(Number.isFinite) ||
                !(w.w > 0) || !(w.h > 0)) {
                throw new Error('unusable window frame: ' +
                    JSON.stringify({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }));
            }
        }
        if (!windows.length)
            return { targets: [], score: null, info };

        // Laid out relative to the monitor's corner, so the result is the same
        // wherever the monitor is (rounding would otherwise differ, and the
        // optimizer can amplify that).
        const ox = monitor.x;
        const oy = monitor.y;
        const shifted = windows.map(w => ({
            id: w.id, x: w.x - ox, y: w.y - oy, w: w.w, h: w.h,
        }));
        const A = workArea({ x: 0, y: 0, w: monitor.w, h: monitor.h }, S.margin);

        // what the optimizer hands on to its safeguard
        const shared = {};
        let T = algo.run(shifted, S, A, info, shared);
        if (algo.uniformScale)
            T = placeNearReal(T, shifted, A);
        if (algo.polishable && S.polish) {
            const r = polishLayout(T, shifted, S, A);
            T = r.T;
            info.polishMoves = r.moved;
            info.polishGain = r.gain;
        }
        if (algorithm === 'optimizer')
            T = optimizerSafeguard(T, shifted, S, A, info, shared);
        if (algo.uniformScale && S.fill)
            T = fillGaps(T, S, A);

        // Score before centering: centering is a final shift only, and nothing
        // (the score included) depends on it.
        const layoutScore = scoreLayout(T, shifted, S, A);
        if (algo.uniformScale && S.centered)
            T = centerLayout(T, A);

        // back in the caller's coordinates
        return {
            targets: T.map(t => ({
                id: t.id, x: t.x + ox, y: t.y + oy, w: t.w, h: t.h, scale: t.w / t.ow,
            })),
            score: layoutScore,
            info,
        };
    }

    /**
     * score:
     * @targets: thumbnails, as compute() returns them
     * @windows: the real window frames
     * @monitor: the area used
     * @S: the settings (anything left out is taken from the defaults)
     *
     * Scores any layout as compute() does. With `centered`, compute() scores
     * its layout before centering it, so this can differ for its targets.
     *
     * Returns: { total, size, sizes, movement, relations, overlap }, or null
     * without targets
     */
    function score(targets, windows, monitor, S) {
        if (!targets.length)
            return null;
        // anything not given, from the defaults
        S = { ...DEFAULTS.common, ...DEFAULTS.scoring, ...S };

        return scoreLayout(targets, windows, S, workArea(monitor, S.margin));
    }

    // JSON text for any value, with object keys sorted, so key insertion order
    // doesn't matter. Used for cache keys.
    function stableText(v) {
        if (v === null || typeof v !== 'object')
            return JSON.stringify(v);
        if (Array.isArray(v))
            return '[' + v.map(stableText).join(',') + ']';
        return '{' + Object.keys(v).sort()
            .map(k => JSON.stringify(k) + ':' + stableText(v[k]))
            .join(',') + '}';
    }

    // Everything a layout depends on, as one string. The windows are sorted by
    // id (the given order may follow stacking), and only the settings the
    // engine uses count.
    function cacheKey(windows, monitor, algorithm, S) {
        const entries = windows
            .map(w => [String(w.id), w.x, w.y, w.w, w.h])
            .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        const used = {};
        for (const k of Object.keys(settings(algorithm)))
            used[k] = S[k];
        return stableText(
            [algorithm, [monitor.x, monitor.y, monitor.w, monitor.h], entries, used]
        );
    }

    // A copy of result r that the caller may change without changing the cache.
    function copyResult(r, cached) {
        return {
            targets: r.targets.map(t => ({ ...t })),
            score: r.score && { ...r.score },
            info: { ...r.info },
            cached,
        };
    }

    /**
     * createCache:
     *
     * Returns: a cache, { compute(windows, monitor, algorithm, settings,
     * slot), forget(slot), clear() }. Its compute() is compute(), but reuses
     * the slot's last result, marked `cached: true`, when the windows (in any
     * order), the monitor, the algorithm and the settings are all the same.
     */
    function createCache() {
        // slot -> { key, result }
        const slots = new Map();
        return {
            compute(windows, monitor, algorithm, S, slot = 'default') {
                if (!ALGORITHMS[algorithm])
                    throw new Error('Unknown spread algorithm: ' + algorithm);
                // fill in anything not given, as compute() does
                S = S ? settings(algorithm, S) : settings(algorithm);
                const key = cacheKey(windows, monitor, algorithm, S);
                const entry = slots.get(slot);
                if (entry && entry.key === key)
                    return copyResult(entry.result, true);
                const result = compute(windows, monitor, algorithm, S);
                slots.set(slot, { key, result: copyResult(result, false) });
                return copyResult(result, false);
            },
            forget(slot) {
                slots.delete(slot);
            },
            clear() {
                slots.clear();
            },
        };
    }

    // Freezes o and every object in it.
    const deepFreeze = o => {
        Object.values(o).forEach(v => typeof v === 'object' && v && deepFreeze(v));
        return Object.freeze(o);
    };

    // the public API

    return Object.freeze({
        DEFAULTS: deepFreeze(DEFAULTS),
        ALGORITHMS: Object.freeze(Object.keys(ALGORITHMS)),
        settings, compute, createCache, score, random,
    });
}

var SpreadLayout = createSpreadLayout();

// For Cinnamon 6.0-6.6 and Node (Cinnamon 6.8 reads the `var` above).
if (typeof module !== 'undefined' && module.exports) module.exports = SpreadLayout;

