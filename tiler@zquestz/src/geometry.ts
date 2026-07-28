/**
 * Pure geometry helpers: turning grid cell ranges into screen rectangles.
 *
 * Nothing in here touches Cinnamon or Muffin, which keeps the placement math
 * easy to reason about on its own.
 */

/** A rectangle in absolute screen coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How a grid is divided up. Each entry is the size of one track relative to
 * the others, so [1, 2, 1] is three columns whose middle one is twice the
 * width of its neighbours, and [1, 1, 1] is three equal ones.
 */
export interface GridSize {
  cols: number[];
  rows: number[];
}

/**
 * An inclusive range of grid cells, in cell coordinates. A single cell has
 * colEnd === col and rowEnd === row.
 */
export interface CellRange {
  col: number;
  row: number;
  colEnd: number;
  rowEnd: number;
}

/** A single cell of a grid, in cell coordinates. */
export interface Cell {
  col: number;
  row: number;
}

/** How much room something takes up, without saying where it is. */
export interface Size {
  width: number;
  height: number;
}

/**
 * A range being chosen, as the two corners that describe it. The anchor is
 * the corner that stays where it was put; the focus is the one that moves.
 */
export interface Selection {
  anchor: Cell;
  focus: Cell;
}

/** The way a selection is asked to move. */
export type Direction = "up" | "down" | "left" | "right";

/** Spacing applied when a cell range is converted to a rectangle. */
export interface Gaps {
  /** Space left between two windows tiled next to each other. */
  window: number;
  /** Space left between a window and the edge of the usable area. */
  edge: number;
}

/**
 * The share of a run that may be given up to spacing. Gaps asking for more
 * than this are reduced to fit, so that windows keep a usable size on small
 * screens and dense grids.
 */
const MAX_GAP_SHARE = 0.25;

/**
 * Falls back to zero for anything that is not a usable number. Settings are
 * stored as JSON that users can edit by hand, so a value that never went
 * through the settings widgets can arrive here as anything at all.
 */
function toFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * The sizes of one axis of a grid, with anything unusable left out. An axis
 * with nothing usable left is one track filling the whole run, which is the
 * least surprising thing to show for a grid that could not be read.
 */
export function tracks(spans: number[]): number[] {
  const usable = Array.isArray(spans)
    ? spans.filter((span) => Number.isFinite(span) && span > 0)
    : [];

  return usable.length > 0 ? usable : [1];
}

/** How many tracks an axis is divided into. */
export function trackCount(spans: number[]): number {
  return tracks(spans).length;
}

/** The size of every track before the given one, added up. */
function spanBefore(spans: number[], index: number): number {
  let total = 0;
  for (let i = 0; i < index && i < spans.length; i++) {
    total += spans[i];
  }

  return total;
}

/** The size of every track added up. */
function spanTotal(spans: number[]): number {
  return spanBefore(spans, spans.length);
}

/** Clamps a cell index to a grid of `count` tracks. */
function clampIndex(value: number, count: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(value), count - 1));
}

/**
 * Puts a cell range into canonical form: corners in ascending order, clamped
 * to the grid. Ranges are built by dragging a selection, so the cell it ends
 * on is often above or to the left of the one it started on.
 */
export function normalizeRange(grid: GridSize, range: CellRange): CellRange {
  const cols = trackCount(grid.cols);
  const rows = trackCount(grid.rows);

  // Each corner is clamped on its own before they are put in order, so one
  // unusable corner cannot drag a perfectly good one along with it.
  const col = clampIndex(range.col, cols);
  const colEnd = clampIndex(range.colEnd, cols);
  const row = clampIndex(range.row, rows);
  const rowEnd = clampIndex(range.rowEnd, rows);

  return {
    col: Math.min(col, colEnd),
    colEnd: Math.max(col, colEnd),
    row: Math.min(row, rowEnd),
    rowEnd: Math.max(row, rowEnd),
  };
}

/** Clamps a gap to the space available for it. */
function clampGap(gap: number, budget: number): number {
  return Math.max(0, Math.min(gap, Math.floor(budget)));
}

/** The edge gap a run can afford, shared between its two edges. */
function fitEdgeGap(length: number, gap: number): number {
  return clampGap(gap, (length * MAX_GAP_SHARE) / 2);
}

/**
 * The gap a run can afford between each of its `count` tracks. An axis of
 * one track draws no gaps, so it has no opinion: it hands the asked-for gap
 * back rather than answering zero, which would drag the axis that does draw
 * gaps down to nothing with it.
 */
function fitTrackGap(length: number, count: number, gap: number): number {
  if (count <= 1) {
    return gap;
  }

  return clampGap(gap, (length * MAX_GAP_SHARE) / (count - 1));
}

/**
 * Returns the offset of the nth track boundary within a run divided into
 * tracks of the given sizes, separated by `gap` pixels.
 *
 * The gaps come out of the run first, and what is left is shared out in
 * proportion to the sizes. Boundaries are worked out from the index rather
 * than accumulated, so rounding never drifts: the tracks always add up to
 * exactly `length`, and every gap is exactly `gap` pixels wide.
 */
function trackBoundary(
  length: number,
  spans: number[],
  gap: number,
  index: number,
): number {
  const shared = length - gap * (spans.length - 1);

  return Math.round(
    (spanBefore(spans, index) * shared) / spanTotal(spans) + index * gap,
  );
}

/**
 * How wide or tall each track of an axis comes out, once the gaps between
 * them have been taken out of the run and the rest shared by size.
 *
 * The sizes and the gaps between them add up to exactly `length`, so long as
 * there is a pixel to spare for every track. There is no answer when there is
 * not, and a track a pixel wide is a better one than a track of nothing, so
 * that is what is given.
 */
export function trackSizes(
  length: number,
  spans: number[],
  gap: number,
): number[] {
  const sizes = tracks(spans);

  return sizes.map((_, index) =>
    Math.max(
      1,
      trackBoundary(length, sizes, gap, index + 1) -
        gap -
        trackBoundary(length, sizes, gap, index),
    ),
  );
}

/**
 * Converts a range of grid cells into the rectangle a window should occupy.
 *
 * Windows tiled side by side end up exactly `gaps.window` pixels apart, and
 * windows along the border of the area sit exactly `gaps.edge` pixels from it,
 * unless the area is too small to afford that much spacing.
 *
 * The range may name its corners in any order, so a selection can be passed
 * straight through in the order it was dragged.
 */
export function cellRangeToRect(
  area: Rect,
  grid: GridSize,
  range: CellRange,
  gaps: Gaps,
): Rect {
  const cols = tracks(grid.cols);
  const rows = tracks(grid.rows);
  const cells = normalizeRange({ cols, rows }, range);

  // Window geometry is measured in whole pixels, so everything entering the
  // calculation is made an integer here. Extents and gaps round down so that
  // tidying up an input can only ever shrink the area, never overrun it.
  const bounds: Rect = {
    x: Math.round(toFinite(area.x)),
    y: Math.round(toFinite(area.y)),
    width: Math.max(0, Math.floor(toFinite(area.width))),
    height: Math.max(0, Math.floor(toFinite(area.height))),
  };
  const windowGap = Math.max(0, Math.floor(toFinite(gaps.window)));
  const edgeGap = Math.max(0, Math.floor(toFinite(gaps.edge)));

  // Spacing is limited to what the area can afford, and the tighter of the two
  // axes decides, so that gaps stay square. Without this, a gap larger than the
  // area could place windows outside it entirely.
  const edge = Math.min(
    fitEdgeGap(bounds.width, edgeGap),
    fitEdgeGap(bounds.height, edgeGap),
  );

  const region: Rect = {
    x: bounds.x + edge,
    y: bounds.y + edge,
    width: Math.max(1, bounds.width - edge * 2),
    height: Math.max(1, bounds.height - edge * 2),
  };

  const gap = Math.min(
    fitTrackGap(region.width, cols.length, windowGap),
    fitTrackGap(region.height, rows.length, windowGap),
  );

  const left = trackBoundary(region.width, cols, gap, cells.col);
  const right = trackBoundary(region.width, cols, gap, cells.colEnd + 1);
  const top = trackBoundary(region.height, rows, gap, cells.row);
  const bottom = trackBoundary(region.height, rows, gap, cells.rowEnd + 1);

  return {
    x: region.x + left,
    y: region.y + top,
    width: Math.max(1, right - gap - left),
    height: Math.max(1, bottom - gap - top),
  };
}

/** Keeps a value within a range, tolerating a range that is back to front. */
function clamp(value: number, lowest: number, highest: number): number {
  return Math.max(lowest, Math.min(value, Math.max(lowest, highest)));
}

/**
 * Places something of `size` in the middle of `target`, moved as little as
 * necessary to keep it inside `bounds`. Used to put the grid over the screen
 * or over the window being tiled without any of it ending up out of reach.
 */
export function centerOn(size: Size, target: Rect, bounds: Rect): Rect {
  const width = Math.min(
    Math.max(1, Math.round(toFinite(size.width))),
    Math.max(1, Math.round(toFinite(bounds.width))),
  );
  const height = Math.min(
    Math.max(1, Math.round(toFinite(size.height))),
    Math.max(1, Math.round(toFinite(bounds.height))),
  );

  const left = toFinite(bounds.x);
  const top = toFinite(bounds.y);
  const centredX = toFinite(target.x) + (toFinite(target.width) - width) / 2;
  const centredY = toFinite(target.y) + (toFinite(target.height) - height) / 2;

  return {
    x: Math.round(clamp(centredX, left, left + toFinite(bounds.width) - width)),
    y: Math.round(clamp(centredY, top, top + toFinite(bounds.height) - height)),
    width,
    height,
  };
}

/**
 * Which track of an axis an offset along that axis falls in, judged against
 * the tracks as they are drawn: the space between two tracks belongs half to
 * each, so a point in a gutter reads as the nearer of its neighbours.
 */
function trackAt(
  offset: number,
  length: number,
  spans: number[],
  spacing: number,
): number {
  const point = toFinite(offset);
  if (!Number.isFinite(offset)) {
    return 0;
  }

  const gap = Math.max(0, toFinite(spacing));
  const sizes = trackSizes(length, spans, gap);

  let edge = 0;
  for (let i = 0; i < sizes.length - 1; i++) {
    // The start of the next track; the gutter before it splits down its
    // middle.
    edge += sizes[i] + gap;
    if (point < edge - gap / 2) {
      return i;
    }
  }

  return sizes.length - 1;
}

/**
 * The cell of `grid` that a point falls in, given the box the grid occupies
 * and the spacing its cells are drawn with. Boundaries follow the drawn
 * cells, with each gutter shared evenly between its neighbours. Points
 * outside the box give the nearest cell, so a pointer that strays off the
 * edge still reads as the row or column it is beside.
 */
export function cellAt(
  x: number,
  y: number,
  box: Rect,
  grid: GridSize,
  spacing = 0,
): Cell {
  const cols = tracks(grid.cols);
  const rows = tracks(grid.rows);
  const width = Math.max(1, toFinite(box.width));
  const height = Math.max(1, toFinite(box.height));

  return {
    col: trackAt(toFinite(x) - toFinite(box.x), width, cols, spacing),
    row: trackAt(toFinite(y) - toFinite(box.y), height, rows, spacing),
  };
}

/** The two corners of a selection, as a range. */
export function selectionRange(selection: Selection): CellRange {
  return {
    col: selection.anchor.col,
    row: selection.anchor.row,
    colEnd: selection.focus.col,
    rowEnd: selection.focus.row,
  };
}

/** How far each direction moves, in cells. */
const STEPS: Record<Direction, Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

/**
 * Moves a selection one cell.
 *
 * Extending leaves the anchor where it is, so the range grows or shrinks
 * against it. Otherwise the anchor comes along, which walks a single cell
 * around the grid. With nothing selected yet, either lands on the first cell,
 * so the first key press has something to show for itself.
 */
export function moveFocus(
  selection: Selection | null,
  direction: Direction,
  grid: GridSize,
  extend: boolean,
): Selection {
  const cols = trackCount(grid.cols);
  const rows = trackCount(grid.rows);

  if (!selection) {
    const first = { col: 0, row: 0 };

    return { anchor: first, focus: first };
  }

  const step = STEPS[direction];
  const focus = {
    col: clampIndex(selection.focus.col + step.col, cols),
    row: clampIndex(selection.focus.row + step.row, rows),
  };

  return { anchor: extend ? selection.anchor : focus, focus };
}

/** Whether a cell range covers every cell of the grid. */
export function coversFullGrid(grid: GridSize, range: CellRange): boolean {
  const cells = normalizeRange(grid, range);

  return (
    cells.col === 0 &&
    cells.row === 0 &&
    cells.colEnd === trackCount(grid.cols) - 1 &&
    cells.rowEnd === trackCount(grid.rows) - 1
  );
}
