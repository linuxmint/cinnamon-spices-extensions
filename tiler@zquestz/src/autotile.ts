/**
 * The arrangements that tile every window at once.
 *
 * Pure geometry: given how many windows there are and the arrangement asked
 * for, work out the rectangle each one should occupy. The first rectangle
 * always belongs to the leading window, the rest to the others in the order
 * they were given. Feeding each rectangle through the same conversion the
 * grid uses means gaps and reserved space apply to a sweep exactly as they
 * do to a window placed by hand.
 */

import { cellRangeToRect } from "./geometry.ts";
import type { CellRange, Gaps, GridSize, Rect } from "./geometry.ts";

/** The arrangements on offer: two kinds, each led from either side. */
export type AutotileMode =
  | "main-left"
  | "main-right"
  | "equal-left"
  | "equal-right";

/** The side an arrangement leads from. */
type Side = "left" | "right";

/** Two columns, cut into the given number of rows. */
function columns(rows: number): GridSize {
  return { cols: [1, 1], rows: new Array(Math.max(1, rows)).fill(1) };
}

function cell(col: number, row: number, colEnd = col, rowEnd = row): CellRange {
  return { col, row, colEnd, rowEnd };
}

/**
 * The leading window fills one side at full height; the rest stack evenly on
 * the other, one row each.
 */
function mainAndStack(
  side: Side,
  count: number,
  area: Rect,
  gaps: Gaps,
): Rect[] {
  const stacked = count - 1;
  const grid = columns(stacked);
  const mainCol = side === "left" ? 0 : 1;
  const stackCol = 1 - mainCol;

  const rects = [
    cellRangeToRect(area, grid, cell(mainCol, 0, mainCol, stacked - 1), gaps),
  ];
  for (let row = 0; row < stacked; row++) {
    rects.push(cellRangeToRect(area, grid, cell(stackCol, row), gaps));
  }

  return rects;
}

/**
 * Every window shares two columns of equal cells. An even count comes out as
 * a full lattice. An odd count has one cell going spare, and it goes to the
 * leading window: the window the sweep was started from sits at the top of
 * its side at double height, which reads as the arrangement having a front.
 *
 * After the leader, windows fill the far column top to bottom and then wrap
 * back under the leader, so the most recently used windows sit highest.
 */
function equal(side: Side, count: number, area: Rect, gaps: Gaps): Rect[] {
  const rows = Math.ceil(count / 2);
  const grid = columns(rows);
  const leadRows = count % 2 === 1 ? 2 : 1;
  const leadCol = side === "left" ? 0 : 1;
  const farCol = 1 - leadCol;

  const rects = [
    cellRangeToRect(area, grid, cell(leadCol, 0, leadCol, leadRows - 1), gaps),
  ];
  let placed = 1;
  for (let row = 0; row < rows && placed < count; row++, placed++) {
    rects.push(cellRangeToRect(area, grid, cell(farCol, row), gaps));
  }
  for (let row = leadRows; row < rows && placed < count; row++, placed++) {
    rects.push(cellRangeToRect(area, grid, cell(leadCol, row), gaps));
  }

  return rects;
}

/**
 * The rectangles an arrangement gives `count` windows, leading window first.
 * One window alone is given the whole area, whatever the arrangement.
 */
export function autotileRects(
  mode: AutotileMode,
  count: number,
  area: Rect,
  gaps: Gaps,
): Rect[] {
  const wanted = Number.isFinite(count) ? Math.floor(count) : 0;
  if (wanted <= 0) {
    return [];
  }

  if (wanted === 1) {
    return [cellRangeToRect(area, { cols: [1], rows: [1] }, cell(0, 0), gaps)];
  }

  const side: Side = mode.endsWith("left") ? "left" : "right";

  return mode.startsWith("equal")
    ? equal(side, wanted, area, gaps)
    : mainAndStack(side, wanted, area, gaps);
}
