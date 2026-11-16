/*
 * Spatial Scale - spatial layout for the Cinnamon Scale overview
 * Copyright (C) 2026 Peter Thowsen
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Spatial Scale
 *
 * Cinnamon's Scale overview builds a plain square grid of slots and hands them
 * out by array index. That array is ordered by stacking order (see
 * WorkspaceMonitor.syncStacking), which is temporal, not spatial - so a window
 * in the bottom-right of the screen can land in the top-left of the overview.
 *
 * This extension keeps the grid exactly as Cinnamon computes it and only
 * permutes which slot each window receives, choosing the permutation that
 * minimises total distance between where each window really is and where its
 * slot sits. Reading the overview then matches reading the real screen.
 */

const Workspace = imports.ui.workspace;

// Above this window count the O(n^3) assignment stops being worth it, and
// Scale is unusable at that size anyway. Falls back to row banding.
const MAX_WINDOWS_FOR_ASSIGNMENT = 64;

// Guard on the padded matrix size, since the cell grid can exceed the window
// count (a 2x2 grid holds 3 windows).
const MAX_CELLS_FOR_ASSIGNMENT = 80;

// Ties are common: two windows sharing an x land equidistant from the two
// slots in a row, and the solver would break that arbitrarily - swapping them
// vertically for no reason. This nudge is far below any distance difference
// that is visible, so it only ever decides genuine ties.
const TIE_BREAK_WEIGHT = 1e-6;

let originalComputeAllWindowSlots = null;

/**
 * Normalised [0,1] centres of each window within the overview's layout area.
 *
 * Slot centres are already expressed as fractions of that area, so putting
 * windows in the same space makes the two directly comparable.
 */
function normalisedCentres(clones, x, y, width, height) {
    let centres = [];

    for (let i = 0; i < clones.length; i++) {
        let rect = clones[i].metaWindow.get_frame_rect();
        let cx = (rect.x + rect.width / 2 - x) / width;
        let cy = (rect.y + rect.height / 2 - y) / height;

        // Windows can sit partly outside the layout area (off-screen, or
        // overlapping a panel), which would otherwise drag them past the edge
        // slots and distort the whole assignment.
        centres.push({
            cx: Math.max(0, Math.min(1, cx)),
            cy: Math.max(0, Math.min(1, cy))
        });
    }

    return centres;
}

/**
 * Hungarian algorithm (Jonker-Volgenant style, O(n^3)) over a square cost
 * matrix. Returns assignment[row] = column.
 *
 * Uses the standard 1-indexed formulation with potentials u/v; p[j] tracks
 * which row currently owns column j, and way[j] the alternating path back.
 */
function solveAssignment(cost, n) {
    let u = new Array(n + 1).fill(0);
    let v = new Array(n + 1).fill(0);
    let p = new Array(n + 1).fill(0);
    let way = new Array(n + 1).fill(0);

    for (let i = 1; i <= n; i++) {
        p[0] = i;
        let j0 = 0;
        let minv = new Array(n + 1).fill(Infinity);
        let used = new Array(n + 1).fill(false);

        do {
            used[j0] = true;
            let i0 = p[j0];
            let delta = Infinity;
            let j1 = 0;

            for (let j = 1; j <= n; j++) {
                if (used[j])
                    continue;

                let cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
                if (cur < minv[j]) {
                    minv[j] = cur;
                    way[j] = j0;
                }
                if (minv[j] < delta) {
                    delta = minv[j];
                    j1 = j;
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

        do {
            let j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0);
    }

    let assignment = new Array(n);
    for (let j = 1; j <= n; j++)
        assignment[p[j] - 1] = j - 1;

    return assignment;
}

/**
 * Reading-order rank of each window: top-to-bottom, then left-to-right, with
 * the same aspect weighting used for distances so the row/column split matches
 * how the screen actually looks.
 */
function readingOrderRank(centres, aspect) {
    let order = centres.map((c, i) => i);
    order.sort((a, b) => (centres[a].cy - centres[b].cy)
                      || ((centres[a].cx - centres[b].cx) * aspect)
                      || (a - b));

    let rank = new Array(centres.length);
    for (let r = 0; r < order.length; r++)
        rank[order[r]] = r;

    return rank;
}

/**
 * Candidate grid cells, one per row/column position.
 *
 * Cinnamon generates only as many slots as there are windows and re-centres
 * whatever is left over in the last row, which drags a bottom-left window to
 * the middle. Offering every cell instead lets the assignment leave the unused
 * ones empty, so a window keeps the column it actually occupies on screen.
 *
 * Slot fractions are taken from the stock slots rather than recomputed, so the
 * cell sizing stays whatever Cinnamon decided.
 */
function buildCells(slots, gridWidth, gridHeight) {
    let xFraction = slots[0][2];
    let yFraction = slots[0][3];
    let cells = [];

    for (let r = 0; r < gridHeight; r++) {
        for (let c = 0; c < gridWidth; c++) {
            cells.push([(0.5 + c) / gridWidth,
                        (0.5 + r) / gridHeight,
                        xFraction,
                        yFraction]);
        }
    }

    return cells;
}

/**
 * Cell index for each window, minimising total squared travel distance.
 *
 * Horizontal distance is weighted by the layout area's aspect ratio, so on a
 * wide screen a sideways gap costs what it geometrically should rather than
 * being flattened by the [0,1] normalisation.
 *
 * There can be more cells than windows, so the matrix is padded to a square
 * with zero-cost dummy rows; the cells those claim are the ones left empty.
 */
function assignCells(clones, cells, x, y, width, height) {
    let n = clones.length;
    let size = cells.length;
    let centres = normalisedCentres(clones, x, y, width, height);
    let aspect = width / height;

    // Rank each window in reading order, and each cell by its index (cells are
    // generated row-major). Preferring rank-to-rank agreement settles ties the
    // way a person would read the screen.
    let rank = readingOrderRank(centres, aspect);

    let cost = [];
    for (let i = 0; i < size; i++) {
        let row = new Array(size).fill(0);

        if (i < n) {
            for (let s = 0; s < size; s++) {
                let dx = (centres[i].cx - cells[s][0]) * aspect;
                let dy = centres[i].cy - cells[s][1];
                row[s] = dx * dx + dy * dy
                       + TIE_BREAK_WEIGHT * Math.abs(rank[i] - s);
            }
        }

        cost.push(row);
    }

    return solveAssignment(cost, size).slice(0, n);
}

/**
 * Fallback ordering: band windows top-to-bottom into the grid's row sizes,
 * then order each band left-to-right. Returns ordered[slot] = window index.
 */
function bandedOrder(clones, gridWidth, gridHeight, x, y, width, height) {
    let centres = normalisedCentres(clones, x, y, width, height);
    let entries = centres.map((c, i) => ({ index: i, cx: c.cx, cy: c.cy }));

    entries.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));

    let ordered = [];
    let taken = 0;

    for (let row = 0; row < gridHeight; row++) {
        let rowSize = Math.min(gridWidth, entries.length - taken);
        if (rowSize <= 0)
            break;

        let band = entries.slice(taken, taken + rowSize);
        taken += rowSize;

        band.sort((a, b) => (a.cx - b.cx) || (a.cy - b.cy));
        for (let i = 0; i < band.length; i++)
            ordered.push(band[i].index);
    }

    return ordered;
}

function computeAllWindowSlots(numberOfWindows) {
    let slots = originalComputeAllWindowSlots.call(this, numberOfWindows);

    try {
        let clones = this._windows;

        // Bail out to stock behaviour on anything unexpected: a mismatch
        // between the slot count and the clone list means our index mapping
        // would be meaningless.
        if (numberOfWindows < 2 || !clones || clones.length !== numberOfWindows)
            return slots;

        for (let i = 0; i < clones.length; i++) {
            if (!clones[i] || !clones[i].metaWindow)
                return slots;
        }

        let x = this._x, y = this._y;
        let width = this._width, height = this._height;
        if (!(width > 0) || !(height > 0))
            return slots;

        let result = new Array(numberOfWindows);

        let gridWidth = Math.ceil(Math.sqrt(numberOfWindows));
        let gridHeight = Math.ceil(numberOfWindows / gridWidth);
        let cellCount = gridWidth * gridHeight;

        if (numberOfWindows <= MAX_WINDOWS_FOR_ASSIGNMENT &&
            cellCount <= MAX_CELLS_FOR_ASSIGNMENT) {
            let cells = buildCells(slots, gridWidth, gridHeight);
            let assignment = assignCells(clones, cells, x, y, width, height);
            for (let i = 0; i < numberOfWindows; i++) {
                if (assignment[i] === undefined)
                    return slots;
                result[i] = cells[assignment[i]];
            }
        } else {
            let ordered = bandedOrder(clones, gridWidth, gridHeight,
                                      x, y, width, height);
            if (ordered.length !== numberOfWindows)
                return slots;

            // ordered[s] is the window that should occupy slot s, so invert it
            // into the by-window-index array positionWindows expects.
            for (let s = 0; s < ordered.length; s++)
                result[ordered[s]] = slots[s];
        }

        return result;
    } catch (e) {
        global.logError('[spatial-scale] falling back to stock layout: ' + e);
        return slots;
    }
}

function init(metadata) {
}

function enable() {
    if (originalComputeAllWindowSlots)
        return;

    originalComputeAllWindowSlots =
        Workspace.WorkspaceMonitor.prototype._computeAllWindowSlots;
    Workspace.WorkspaceMonitor.prototype._computeAllWindowSlots =
        computeAllWindowSlots;
}

function disable() {
    if (!originalComputeAllWindowSlots)
        return;

    Workspace.WorkspaceMonitor.prototype._computeAllWindowSlots =
        originalComputeAllWindowSlots;
    originalComputeAllWindowSlots = null;
}
