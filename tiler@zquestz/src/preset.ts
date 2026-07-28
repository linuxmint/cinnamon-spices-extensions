/**
 * The grids the user has set up, and the shorthand they are written in.
 *
 * A layout is written as columns, then rows: `3x2` is three columns and two
 * rows, all the same size. Sizes can be given one by one instead, so
 * `1,2,1 x 1,1` is three columns whose middle one is twice the width of its
 * neighbours. The two halves are independent, so `3 x 1,2` is three equal
 * columns above a row twice the height of the one over it.
 *
 * Nothing here touches Cinnamon, so a layout can be read and checked without
 * a desktop to read it on.
 */

import { tracks } from "./geometry.ts";
import type { GridSize } from "./geometry.ts";

/** How many grids there are to set up and choose between. */
export const GRID_COUNT = 4;

/**
 * As many tracks as one axis may be cut into. Sixteen is far past anything
 * useful for tiling, and low enough that the grid can always be drawn: the
 * space between tracks would otherwise take up more room than a short
 * miniature has, on the widest screens.
 */
const MAX_TRACKS = 16;

/** A grid the user can choose, as it appears on the strip. */
export interface Preset {
  grid: GridSize;
  /** What the strip calls it. */
  label: string;
  /** What hovering it says, or nothing when the user has not said. */
  tooltip: string;
}

/**
 * A count of equal tracks, as a list of sizes. Anything that is not a usable
 * count becomes one track: settings can hold whatever a hand-edited file put
 * in them, and asking for an array of NaN entries is an error rather than an
 * empty one.
 */
function equalTracks(count: number): number[] {
  const wanted = Number.isFinite(count)
    ? Math.max(1, Math.min(MAX_TRACKS, Math.floor(count)))
    : 1;

  return new Array(wanted).fill(1);
}

/** Reads one side of a layout: either a count, or the sizes themselves. */
function parseAxis(text: string): number[] | null {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0 || parts.length > MAX_TRACKS) {
    return null;
  }

  const sizes = parts.map(Number);
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    return null;
  }

  // On its own a number says how many equal tracks to make, so that the
  // everyday `3x2` means what anyone would expect it to.
  if (sizes.length === 1) {
    const count = sizes[0];
    if (!Number.isInteger(count) || count > MAX_TRACKS) {
      return null;
    }

    return equalTracks(count);
  }

  return sizes;
}

/**
 * Reads a layout, or nothing at all if it cannot be read. Spacing and case
 * are ignored, so `3x2`, `3 X 2` and ` 3 x 2 ` are the same layout.
 */
export function parseLayout(text: string): GridSize | null {
  if (typeof text !== "string") {
    return null;
  }

  const halves = text.toLowerCase().split("x");
  if (halves.length !== 2) {
    return null;
  }

  const cols = parseAxis(halves[0]);
  const rows = parseAxis(halves[1]);
  if (!cols || !rows) {
    return null;
  }

  return { cols, rows };
}

/** Writes a grid of equal tracks the short way, as `3x2`. */
export function uniformLayout(cols: number, rows: number): string {
  return `${equalTracks(cols).length}x${equalTracks(rows).length}`;
}

/**
 * Writes a grid out in full, naming every track size. The write half of the
 * layout language: nothing on screen uses it yet, but the tests hold it and
 * parseLayout together, so the format cannot drift from what is read.
 */
export function layoutText(grid: GridSize): string {
  return `${tracks(grid.cols).join(",")} x ${tracks(grid.rows).join(",")}`;
}

/**
 * Builds a preset from what the user set.
 *
 * The layout has the last word, and the two numbers are what Tiler falls back
 * on when it cannot be read: a grid the user chose themselves, rather than
 * something picked out of the air.
 */
export function toPreset(
  cols: number,
  rows: number,
  layout: string,
  name: string,
  tooltip: string,
): Preset {
  const asked = parseLayout(layout);
  const grid = asked ?? { cols: equalTracks(cols), rows: equalTracks(rows) };

  return {
    grid,
    label:
      typeof name === "string" && name.trim().length > 0
        ? name.trim()
        : `${tracks(grid.cols).length}x${tracks(grid.rows).length}`,
    tooltip: typeof tooltip === "string" ? tooltip.trim() : "",
  };
}
