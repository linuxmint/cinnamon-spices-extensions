import test from "node:test";
import assert from "node:assert/strict";

import { autotileRects } from "../src/autotile.ts";
import {
  cellAt,
  cellRangeToRect,
  trackCount,
  trackSizes,
} from "../src/geometry.ts";
import type { Gaps, GridSize, Rect } from "../src/geometry.ts";

/**
 * The laws of the geometry, checked over the whole space of inputs rather
 * than at hand-picked examples. The single-row gap bug survived every
 * example-based test because every example had two of everything; these
 * sweeps exist so that no shape of grid, area or gap is beyond the tests
 * just because nobody thought to write its example.
 */

const SPAN_SHAPES: number[][] = [
  [1],
  [1, 1],
  [2, 1],
  [1, 2, 1],
  [1, 1.5],
  [1, 1, 1, 1],
  [4, 1, 1],
  new Array(8).fill(1),
  new Array(16).fill(1),
];

const AREAS: Rect[] = [
  { x: 0, y: 0, width: 2560, height: 1400 },
  { x: 0, y: 0, width: 1366, height: 728 },
  { x: 2560, y: -200, width: 1920, height: 1040 },
  { x: 0, y: 0, width: 251, height: 251 },
  { x: 7, y: 13, width: 1003, height: 997 },
];

const WINDOW_GAPS = [0, 1, 4, 10, 37, 100];
const EDGE_GAPS = [0, 1, 10, 50];

const cellRect = (
  area: Rect,
  grid: GridSize,
  gaps: Gaps,
  col: number,
  row: number,
): Rect =>
  cellRangeToRect(area, grid, { col, row, colEnd: col, rowEnd: row }, gaps);

function forEveryCase(
  visit: (area: Rect, grid: GridSize, gaps: Gaps) => void,
): number {
  let cases = 0;

  for (const area of AREAS) {
    for (const cols of SPAN_SHAPES) {
      for (const rows of SPAN_SHAPES) {
        for (const window of WINDOW_GAPS) {
          for (const edge of EDGE_GAPS) {
            visit(area, { cols, rows }, { window, edge });
            cases++;
          }
        }
      }
    }
  }

  return cases;
}

test("every cell of every grid obeys the laws", () => {
  const cases = forEveryCase((area, grid, gaps) => {
    const cols = trackCount(grid.cols);
    const rows = trackCount(grid.rows);
    const name = `${cols}x${rows} in ${area.width}x${area.height} gaps ${gaps.window}/${gaps.edge}`;

    // The full matrix of single-cell rectangles.
    const rects: Rect[][] = [];
    for (let row = 0; row < rows; row++) {
      const line: Rect[] = [];
      for (let col = 0; col < cols; col++) {
        line.push(cellRect(area, grid, gaps, col, row));
      }
      rects.push(line);
    }

    const horizontal: number[] = [];
    const vertical: number[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const rect = rects[row][col];

        // Contained, whole pixels, never empty.
        assert.ok(rect.x >= area.x && rect.y >= area.y, name);
        assert.ok(rect.x + rect.width <= area.x + area.width, name);
        assert.ok(rect.y + rect.height <= area.y + area.height, name);
        for (const value of [rect.x, rect.y, rect.width, rect.height]) {
          assert.ok(Number.isInteger(value) && Number.isFinite(value), name);
        }
        assert.ok(rect.width >= 1 && rect.height >= 1, name);

        // Rows align as rows, columns as columns.
        assert.equal(rect.y, rects[row][0].y, name);
        assert.equal(rect.height, rects[row][0].height, name);
        assert.equal(rect.x, rects[0][col].x, name);
        assert.equal(rect.width, rects[0][col].width, name);

        if (col > 0) {
          horizontal.push(
            rect.x - (rects[row][col - 1].x + rects[row][col - 1].width),
          );
        }
        if (row > 0) {
          vertical.push(
            rect.y - (rects[row - 1][col].y + rects[row - 1][col].height),
          );
        }
      }
    }

    // Neighbours never overlap, and every gap on a side is the same gap.
    const applied = [...horizontal, ...vertical];
    for (const gap of applied) {
      assert.ok(gap >= 0, `${name}: neighbours overlap`);
      assert.equal(gap, applied[0], `${name}: gaps differ`);
      assert.ok(gap <= gaps.window, `${name}: gap exceeds what was asked`);
    }

    // The law the single-row bug broke: when a gap is asked for and every
    // axis that draws gaps has room to afford it, the gap must survive.
    // An axis of one track draws no gaps and must not veto the others.
    if (applied.length > 0 && gaps.window >= 1) {
      const roomy =
        (cols <= 1 || area.width >= 4 * (cols - 1) + cols) &&
        (rows <= 1 || area.height >= 4 * (rows - 1) + rows);
      if (roomy) {
        assert.ok(applied[0] >= 1, `${name}: the gap was talked away`);
      }
    }

    // Edge insets are uniform on all four sides and never exceed the ask.
    const first = rects[0][0];
    const last = rects[rows - 1][cols - 1];
    const insets = [
      first.x - area.x,
      first.y - area.y,
      area.x + area.width - (last.x + last.width),
      area.y + area.height - (last.y + last.height),
    ];
    for (const inset of insets) {
      assert.equal(inset, insets[0], `${name}: edge insets differ`);
      assert.ok(inset <= gaps.edge, `${name}: inset exceeds what was asked`);
    }

    // A range spans exactly from its first cell to its last.
    const range = cellRangeToRect(
      area,
      grid,
      { col: 0, row: 0, colEnd: cols - 1, rowEnd: rows - 1 },
      gaps,
    );
    assert.equal(range.x, first.x, name);
    assert.equal(range.y, first.y, name);
    assert.equal(range.x + range.width, last.x + last.width, name);
    assert.equal(range.y + range.height, last.y + last.height, name);
  });

  assert.ok(cases > 5000, `swept ${cases} cases`);
});

test("every auto-tile arrangement obeys the laws", () => {
  let cases = 0;

  for (const area of AREAS) {
    for (const mode of [
      "main-left",
      "main-right",
      "equal-left",
      "equal-right",
    ] as const) {
      for (let count = 1; count <= 13; count++) {
        for (const window of WINDOW_GAPS) {
          for (const edge of EDGE_GAPS) {
            const gaps = { window, edge };
            const name = `${mode} x${count} in ${area.width}x${area.height} gaps ${window}/${edge}`;
            const rects = autotileRects(mode, count, area, gaps);
            cases++;

            assert.equal(rects.length, count, name);

            for (const rect of rects) {
              assert.ok(rect.x >= area.x && rect.y >= area.y, name);
              assert.ok(rect.x + rect.width <= area.x + area.width, name);
              assert.ok(rect.y + rect.height <= area.y + area.height, name);
              assert.ok(rect.width >= 1 && rect.height >= 1, name);
            }

            // No window may cover any part of another, whatever the mode,
            // count, or spacing.
            for (let a = 0; a < rects.length; a++) {
              for (let b = a + 1; b < rects.length; b++) {
                const one = rects[a];
                const two = rects[b];
                const apart =
                  one.x + one.width <= two.x ||
                  two.x + two.width <= one.x ||
                  one.y + one.height <= two.y ||
                  two.y + two.height <= one.y;

                assert.ok(apart, `${name}: windows ${a} and ${b} overlap`);
              }
            }

            // The founding law, asserted for sweeps as well: the clear air
            // between side-by-side windows is one uniform gap, never wider
            // than asked, and it survives whenever the area can afford it.
            const separations: number[] = [];
            for (const one of rects) {
              for (const two of rects) {
                const besides =
                  one.x + one.width <= two.x &&
                  one.y < two.y + two.height &&
                  two.y < one.y + one.height;
                if (!besides) {
                  continue;
                }

                // Neighbours only: with cells cut inside cells, two windows
                // can face each other across a third, and the air between
                // them then belongs to that one, not to a gap.
                const left = one.x + one.width;
                const right = two.x;
                const top = Math.max(one.y, two.y);
                const bottom = Math.min(one.y + one.height, two.y + two.height);
                const between = rects.some(
                  (r) =>
                    r !== one &&
                    r !== two &&
                    r.x < right &&
                    r.x + r.width > left &&
                    r.y < bottom &&
                    r.y + r.height > top,
                );
                if (!between) {
                  separations.push(right - left);
                }
              }
            }

            // A cell can only afford the full gap when it is at least four
            // times as long as the gap along the side being cut, so
            // uniformity is only owed while the smallest cell has that room.
            // The ceiling holds regardless.
            const smallest = Math.min(
              ...rects.map((r) => Math.min(r.width, r.height)),
            );
            for (const gap of separations) {
              assert.ok(gap <= window, `${name}: side gap exceeds the ask`);
              if (smallest >= 4 * window) {
                assert.equal(gap, separations[0], `${name}: side gaps differ`);
              }
            }
            if (count >= 2 && window >= 1) {
              assert.ok(
                separations.length > 0,
                `${name}: no side-by-side neighbours`,
              );
              // Room for the cuts to keep pixel cells and gaps even after
              // the edge insets have taken their share.
              if (smallest >= 4) {
                assert.ok(
                  separations[0] >= 1,
                  `${name}: the sweep's gap was talked away`,
                );
              }
            }
          }
        }
      }
    }
  }

  assert.ok(cases > 4000, `swept ${cases} cases`);
});

test("the centre of every drawn cell hit-tests as itself", () => {
  // The law that binds the drawing to the pointer: however the tracks are
  // shaped and spaced, a click in the middle of a cell means that cell.
  let cases = 0;

  for (const cols of SPAN_SHAPES) {
    for (const rows of SPAN_SHAPES) {
      for (const spacing of [0, 2, 4, 8]) {
        const box: Rect = { x: 40, y: 60, width: 640, height: 360 };
        const grid = { cols, rows };
        const widths = trackSizes(box.width, cols, spacing);
        const heights = trackSizes(box.height, rows, spacing);

        let y = box.y;
        for (let row = 0; row < heights.length; row++) {
          let x = box.x;
          for (let col = 0; col < widths.length; col++) {
            const hit = cellAt(
              x + widths[col] / 2,
              y + heights[row] / 2,
              box,
              grid,
              spacing,
            );

            assert.deepEqual(
              hit,
              { col, row },
              `${widths.length}x${heights.length} spacing ${spacing} cell ${col},${row}`,
            );
            cases++;
            x += widths[col] + spacing;
          }
          y += heights[row] + spacing;
        }
      }
    }
  }

  assert.ok(cases > 5000, `swept ${cases} centres`);
});
