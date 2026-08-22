/**
 * Cinnamon's own tiling shortcuts, placed Tiler's way.
 *
 * Super with an arrow key already tiles the focused window to half the
 * screen, and pressing again from there walks the corners or lets the window
 * go. What the window manager cannot do is leave gaps between those windows
 * or keep off the space reserved for a dock.
 *
 * The rules below are its rules, transcribed from get_new_tile_mode() in
 * muffin's keybindings.c, so the keys answer exactly as they always have and
 * only the placement changes. Every position is a range of the same two by
 * two grid, which is what lets the ordinary conversion apply gaps and
 * reserved space to a pushed window as it would to any other.
 */

import { sameRect } from "./geometry.ts";
import type { CellRange, Direction, GridSize, Rect } from "./geometry.ts";

/** Where a window sits under these shortcuts. The names are muffin's. */
export type TileMode =
  | "none"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "ulc"
  | "llc"
  | "urc"
  | "lrc"
  | "maximized";

/** The four positions a push can ask for, before the rules have their say. */
type Asked = "left" | "right" | "top" | "bottom";

/** Halves, corners and the whole screen are ranges of these two tracks. */
export const PUSH_GRID: GridSize = { cols: [1, 1], rows: [1, 1] };

/** An arrow names the half it points at. */
const ASKED: Record<Direction, Asked> = {
  left: "left",
  right: "right",
  up: "top",
  down: "bottom",
};

/**
 * What each push does from each position. Pushing at the edge a window
 * already sits against holds it there, pushing back across the screen lets
 * it go, and pushing along a half takes the corner.
 */
const NEXT: Record<TileMode, Record<Asked, TileMode>> = {
  none: { left: "left", right: "right", top: "top", bottom: "bottom" },
  // Down from a maximized window gives the top half, not the window back.
  maximized: { left: "left", right: "right", top: "top", bottom: "top" },
  left: { left: "left", right: "none", top: "ulc", bottom: "llc" },
  right: { left: "none", right: "right", top: "urc", bottom: "lrc" },
  top: { left: "ulc", right: "urc", top: "maximized", bottom: "none" },
  bottom: { left: "llc", right: "lrc", top: "none", bottom: "bottom" },
  ulc: { left: "ulc", right: "top", top: "ulc", bottom: "left" },
  llc: { left: "llc", right: "bottom", top: "left", bottom: "llc" },
  urc: { left: "top", right: "urc", top: "urc", bottom: "right" },
  lrc: { left: "bottom", right: "lrc", top: "right", bottom: "lrc" },
};

/** The cells of the two by two grid each position covers. */
const RANGES: Record<TileMode, CellRange | null> = {
  none: null,
  left: { col: 0, row: 0, colEnd: 0, rowEnd: 1 },
  right: { col: 1, row: 0, colEnd: 1, rowEnd: 1 },
  top: { col: 0, row: 0, colEnd: 1, rowEnd: 0 },
  bottom: { col: 0, row: 1, colEnd: 1, rowEnd: 1 },
  ulc: { col: 0, row: 0, colEnd: 0, rowEnd: 0 },
  llc: { col: 0, row: 1, colEnd: 0, rowEnd: 1 },
  urc: { col: 1, row: 0, colEnd: 1, rowEnd: 0 },
  lrc: { col: 1, row: 1, colEnd: 1, rowEnd: 1 },
  maximized: { col: 0, row: 0, colEnd: 1, rowEnd: 1 },
};

/** The window manager's own numbering, as its tile-mode property reports it. */
const MUFFIN_MODES: TileMode[] = [
  "none",
  "left",
  "right",
  "ulc",
  "llc",
  "urc",
  "lrc",
  "top",
  "bottom",
  "maximized",
];

/**
 * Where a window goes when pushed `direction` from where it is now. A window
 * already where the push would put it stays, which the caller sees as the
 * mode coming back unchanged; anything unrecognized is left alone the same
 * way.
 */
export function nextTileMode(
  direction: Direction,
  current: TileMode,
): TileMode {
  const asked = ASKED[direction];
  const rules = NEXT[current];

  return asked && rules ? rules[asked] : current;
}

/**
 * The cells a position covers, or null for the window being let go, which is
 * a restore rather than a placement.
 */
export function tileModeRange(mode: TileMode): CellRange | null {
  const range = RANGES[mode];

  return range ? { ...range } : null;
}

/**
 * The position the window manager believes a window is in, for windows it
 * tiled itself by a drag to the screen edge. Anything unknown counts as
 * untiled, which starts the cycle from the beginning.
 */
export function tileModeOf(muffinTileMode: number): TileMode {
  const index = Math.trunc(Number(muffinTileMode));

  return MUFFIN_MODES[index] ?? "none";
}

/** A note of where a push left a window: the position, and the frame it got. */
export interface PushNote {
  mode: TileMode;
  placed: Rect;
}

/**
 * The position a push should carry on from, and whether the note that named
 * it still speaks for the window.
 *
 * Maximized is read from the window itself, as the window manager reads it,
 * so a window maximized behind Tiler's back still answers as maximized. The
 * note is only believed while the window is where the note put it: anything
 * may have moved it since without Tiler hearing (the manager's own
 * unmaximize and move-to keys, a script, another extension), and where the
 * window is now is the one thing that says so. A note that no longer stands
 * is the caller's to discard. With no note to go by, the manager's answer is
 * used, so windows it tiled itself carry on from there.
 *
 * A maximized window keeps its note standing even though the frame no longer
 * matches: the note is bypassed while the flags speak, but the size it
 * remembers is still the one to come back to.
 */
export function readPushState(
  maximized: boolean,
  frame: Rect,
  noted: PushNote | null,
  managerMode: TileMode,
): { mode: TileMode; standing: boolean } {
  if (maximized) {
    return { mode: "maximized", standing: noted !== null };
  }

  if (noted && sameRect(frame, noted.placed)) {
    return { mode: noted.mode, standing: true };
  }

  return { mode: managerMode, standing: false };
}
