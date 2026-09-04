/**
 * The arrangements that tile every window at once.
 *
 * Pure geometry: given how many windows there are and the arrangement asked
 * for, work out the rectangle each one should occupy. The first rectangle
 * always belongs to the leading window, the rest to the others in the order
 * they were given; `assignCells` then says which window ends up in which,
 * once it is known that some cannot shrink to theirs.
 *
 * Every window after the first takes its room by cutting an existing cell in
 * half rather than by adding a row: the largest cell there is, along its
 * longer side. That keeps the cells as even as the count allows and keeps
 * them the shape of the screen, so a wide monitor cuts into columns and a
 * tall one into rows without a mode for either. Main keeps the leading
 * window out of it altogether, so it holds its whole side; equal lets it
 * take its turn, though only once nothing larger is left.
 *
 * Every cut goes through the same conversion the grid uses, so gaps apply to
 * a sweep exactly as they do to a window placed by hand.
 */

import { toFinite } from "./coerce.ts";
import { cellRangeToRect } from "./geometry.ts";
import type { CellRange, Gaps, GridSize, Rect, Size } from "./geometry.ts";

/** The arrangements on offer: two kinds, each led from either side. */
export type AutotileMode =
  "main-left" | "main-right" | "equal-left" | "equal-right";

const WHOLE: GridSize = { cols: [1], rows: [1] };
const SIDE_BY_SIDE: GridSize = { cols: [1, 1], rows: [1] };
const STACKED: GridSize = { cols: [1], rows: [1, 1] };

function cell(col: number, row: number): CellRange {
  return { col, row, colEnd: col, rowEnd: row };
}

function areaOf(size: Size): number {
  return size.width * size.height;
}

function fits(need: Size, rect: Rect): boolean {
  return need.width <= rect.width && need.height <= rect.height;
}

/**
 * Cuts a cell in two, with the window gap between the halves and nothing
 * taken from the cell's own edges: those are either the area's edges, which
 * had their gap when the area was inset, or gaps left by earlier cuts.
 */
function halve(rect: Rect, sideBySide: boolean, gap: number): [Rect, Rect] {
  const grid = sideBySide ? SIDE_BY_SIDE : STACKED;
  const gaps: Gaps = { window: gap, edge: 0 };
  const second = sideBySide ? cell(1, 0) : cell(0, 1);

  return [
    cellRangeToRect(rect, grid, cell(0, 0), gaps),
    cellRangeToRect(rect, grid, second, gaps),
  ];
}

/** Cuts a cell along its longer side. A square is cut side by side. */
function cut(rect: Rect, gap: number): [Rect, Rect] {
  return halve(rect, rect.width >= rect.height, gap);
}

/**
 * The cell to cut next: the largest, and among equals the most recently
 * made, so that the windows arriving last, which are the least recently
 * used, are the ones sharing the smallest room. Cells before `from` are
 * never cut.
 */
function largest(cells: Rect[], from: number): number {
  let pick = from;
  for (let i = from + 1; i < cells.length; i++) {
    if (areaOf(cells[i]) >= areaOf(cells[pick])) {
      pick = i;
    }
  }

  return pick;
}

/** The same cell on the other side of the area. */
function mirror(rect: Rect, area: Rect): Rect {
  return {
    x: area.x + area.width - (rect.x - area.x) - rect.width,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * The rectangles an arrangement gives `count` windows, leading window first.
 * One window alone is given the whole area, less the edge gap, whatever the
 * arrangement.
 */
export function autotileRects(
  mode: AutotileMode,
  count: number,
  area: Rect,
  gaps: Gaps,
): Rect[] {
  const wanted = Math.floor(toFinite(count));
  if (wanted <= 0) {
    return [];
  }

  // The area's own edges get their gap here, once.
  const whole = cellRangeToRect(area, WHOLE, cell(0, 0), gaps);
  if (wanted === 1) {
    return [whole];
  }

  // Main means the leading window takes a whole side, whatever shape the
  // screen is, and is never cut again. Equal starts it off with everything
  // and lets the cuts decide.
  const main = mode.startsWith("main");
  const cells = main ? halve(whole, true, gaps.window) : [whole];
  const immune = main ? 1 : 0;

  while (cells.length < wanted) {
    const at = largest(cells, immune);
    const [kept, made] = cut(cells[at], gaps.window);
    cells[at] = kept;
    cells.push(made);
  }

  return mode.endsWith("right")
    ? cells.map((rect) => mirror(rect, area))
    : cells;
}

/** Which cell each window takes, and the windows no cell could hold. */
export interface Assignment {
  /** The cell each window takes, as an index into the cells given. */
  cell: number[];
  /** The windows, by index, that were left out. Their cell is -1. */
  left: number[];
}

/**
 * Whether a window, placed into a cell, came out too large for it. The
 * window manager only ever hands back a frame larger than asked when a size
 * hint will not let the window go smaller, so any overhang at all is the
 * window refusing the cell. Windows that keep to a character grid come out
 * smaller than asked, never larger, and fit.
 */
export function refusesCell(frame: Rect, rect: Rect): boolean {
  return frame.width > rect.width || frame.height > rect.height;
}

/**
 * Gives each window a cell. A window's need is the smallest size it has
 * been seen to accept, or null while nothing is known.
 *
 * The first window is the anchor and keeps its cell whatever it needs. The
 * windows with a need come next, largest need first: each keeps the cell of
 * its turn when that is still free and holds it, takes the biggest free cell
 * that does otherwise, and is left out when none does. So the largest need
 * always has first pick, whichever window happened to hold the room before.
 * The rest keep the cell of their turn where it is still free, and those
 * whose cell was taken get the first cell left over.
 */
export function assignCells(
  cells: Rect[],
  needs: Array<Size | null>,
): Assignment {
  const cell_ = cells.map(() => -1);
  const free = new Set(cells.map((_, index) => index));
  const left: number[] = [];
  const take = (window: number, at: number): void => {
    cell_[window] = at;
    free.delete(at);
  };
  const biggestFree = (need: Size): number => {
    let best = -1;
    for (const at of free) {
      if (!fits(need, cells[at])) {
        continue;
      }
      if (best < 0 || areaOf(cells[at]) > areaOf(cells[best])) {
        best = at;
      }
    }

    return best;
  };

  if (cells.length === 0) {
    return { cell: cell_, left };
  }
  take(0, 0);

  const constrained = needs
    .flatMap((need, index) => (need && index > 0 ? [{ need, index }] : []))
    .sort((a, b) => areaOf(b.need) - areaOf(a.need) || a.index - b.index);
  for (const { need, index } of constrained) {
    const own = free.has(index) && fits(need, cells[index]);
    const at = own ? index : biggestFree(need);
    if (at < 0) {
      left.push(index);
    } else {
      take(index, at);
    }
  }

  const rest = needs.flatMap((need, index) =>
    need || index === 0 ? [] : [index],
  );
  for (const index of rest) {
    if (free.has(index)) {
      take(index, index);
    }
  }
  for (const index of rest) {
    if (cell_[index] < 0) {
      take(index, Math.min(...free));
    }
  }

  return { cell: cell_, left };
}
