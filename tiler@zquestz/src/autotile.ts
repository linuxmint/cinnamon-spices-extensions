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
 *
 * The placing lives here too: `settle` fits one window into a cell and
 * `arrange` places a whole arrangement, both through a placer handed in by
 * the caller, so the whole of it can be tested away from a running desktop.
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

function cellAt(col: number, row: number): CellRange {
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
  const second = sideBySide ? cellAt(1, 0) : cellAt(0, 1);

  return [
    cellRangeToRect(rect, grid, cellAt(0, 0), gaps),
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
  const whole = cellRangeToRect(area, WHOLE, cellAt(0, 0), gaps);
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
  if (cells.length === 0) {
    return { cell: [], left: [] };
  }

  const cell = cells.map(() => -1);
  const free = new Set(cells.map((_, index) => index));
  const left: number[] = [];
  const take = (window: number, at: number): void => {
    cell[window] = at;
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
  // A cell is always free here: only windows with a need are ever left out,
  // so the rest never outnumber the cells left over.
  for (const index of rest) {
    if (cell[index] < 0) {
      take(index, Math.min(...free));
    }
  }

  return { cell, left };
}

/**
 * Whether a window, placed into a rectangle, came out too large for it. Any
 * overhang counts: a window keeping its shape or holding a minimum size
 * comes back larger than asked, and whether it can be made to fit is for
 * `settle` to find out. Windows that keep to a character grid come out
 * smaller than asked, never larger, and fit.
 */
export function refusesCell(frame: Rect, rect: Rect): boolean {
  return frame.width > rect.width || frame.height > rect.height;
}

/**
 * Puts a window at a rectangle, maximizing it instead when asked, and reports
 * the frame the window came back with. The one thing `settle` and `arrange`
 * need of the window manager, handed in so that both can be tested against
 * a stand-in.
 */
export type Placer<W> = (window: W, rect: Rect, maximize: boolean) => Rect;

/**
 * Places a window into a cell so that it sits inside it, or reports that it
 * cannot. The one placement step every way of tiling a window shares.
 *
 * The window is placed at the cell first. One that comes back overhanging
 * keeps a shape, and the largest box of that shape the cell holds is placed
 * instead: full width when the shape is wider than the cell's, full height
 * when it is taller. Rounding the box back to the window's ratio can still
 * land it a pixel past the cell, so the box is then shrunk by whatever the
 * window overhangs and placed again, until the window sits inside or stops
 * getting smaller. A window that will not shrink has a size it insists on,
 * and the frame it insists on is returned still overhanging, for the caller
 * to send to overflow.
 */
export function settle<W>(
  place: Placer<W>,
  window: W,
  cell: Rect,
  maximize: boolean,
): Rect {
  let settled = place(window, cell, maximize);
  if (!refusesCell(settled, cell)) {
    return settled;
  }

  // A frame with no shape to speak of has nothing to fit by.
  const ratio = toFinite(settled.width) / toFinite(settled.height);
  if (!(ratio > 0 && ratio < Infinity)) {
    return settled;
  }

  // A shape converges in a try or two; the count is a guard.
  let room: Size = { width: cell.width, height: cell.height };
  for (let tries = 0; tries < 17; tries++) {
    const width = Math.min(room.width, room.height * ratio);
    const box: Rect = {
      x: cell.x,
      y: cell.y,
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(width / ratio)),
    };

    const previous = settled;
    settled = place(window, box, false);
    if (!refusesCell(settled, cell)) {
      return settled;
    }
    // A window coming back the same size as from a strictly smaller box will
    // not shrink. The first box can be no smaller than the cell it was
    // probed with, so the comparison only means something after that.
    if (
      tries > 0 &&
      settled.width === previous.width &&
      settled.height === previous.height
    ) {
      break;
    }

    room = {
      width: box.width - Math.max(0, settled.width - cell.width),
      height: box.height - Math.max(0, settled.height - cell.height),
    };
    if (room.width < 1 || room.height < 1) {
      break;
    }
  }

  return settled;
}

/** How an arrangement came out. */
export interface Arrangement<W> {
  /** The windows that were placed, leading window first. */
  placed: W[];
  /** The windows no cell could hold, in the order they were given. */
  overflow: W[];
}

/**
 * Places every window into an arrangement, leading window first, finding out
 * as it goes which of them will not go as small as their cell.
 *
 * Nothing says beforehand how small a window will go, so placing it is what
 * finds out: `settle` fits each window into its cell as far as its shape
 * allows. One that will not fit has a size it insists on, and the
 * arrangement is planned again around that, trading it a larger cell for
 * one that will shrink. A window that fits no cell at all is set aside for
 * the caller to deal with; since every refusal calls for a larger cell than
 * the last, that is where any window that keeps refusing ends up. The
 * leading window is fitted like the rest but never set aside: it keeps its
 * cell whatever it needs, so a refusal from it is nothing to plan around.
 *
 * `maximizeAlone` says whether a window left on its own should be maximized
 * outright rather than placed to fill the area, which is the caller's to
 * decide since it depends on the spacing asked for.
 */
export function arrange<W>(
  windows: W[],
  mode: AutotileMode,
  area: Rect,
  gaps: Gaps,
  maximizeAlone: boolean,
  place: Placer<W>,
): Arrangement<W> {
  const needs = new Map<W, Size>();
  let arranged = windows;

  // Each pass either sets a window aside or learns a size that sends it to
  // a larger cell, and there are only so many windows and cells, so twice
  // the count is more passes than can ever be needed. The bound is a guard,
  // not an expectation.
  for (let pass = 0; pass <= windows.length * 2; pass++) {
    const rects = autotileRects(mode, arranged.length, area, gaps);
    const plan = assignCells(
      rects,
      arranged.map((window) => needs.get(window) ?? null),
    );

    if (plan.left.length > 0) {
      const aside = new Set(plan.left.map((index) => arranged[index]));
      arranged = arranged.filter((window) => !aside.has(window));
      continue;
    }

    const maximize = arranged.length === 1 && maximizeAlone;
    let refused = false;
    arranged.forEach((window, index) => {
      const target = rects[plan.cell[index]];
      const frame = settle(place, window, target, maximize);

      // Only a refusal that a larger cell could answer is worth learning:
      // the leader keeps its cell regardless.
      if (index > 0 && refusesCell(frame, target)) {
        needs.set(window, { width: frame.width, height: frame.height });
        refused = true;
      }
    });

    if (!refused) {
      break;
    }
  }

  const kept = new Set(arranged);

  return {
    placed: arranged,
    overflow: windows.filter((window) => !kept.has(window)),
  };
}
