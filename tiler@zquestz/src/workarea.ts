/**
 * Works out how much of a monitor windows may actually be tiled into.
 *
 * Plain arithmetic on rectangles: the work area comes in already measured,
 * and what comes out is what is left of it.
 */

import type { Rect } from "./geometry.ts";

/** Pixels held back on each side of a monitor, on top of the work area. */
export interface Reserved {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Whether any space is actually being held back on a monitor. */
export function hasReserved(reserved: Reserved | null): boolean {
  if (!reserved) {
    return false;
  }

  return (
    reserved.top > 0 ||
    reserved.bottom > 0 ||
    reserved.left > 0 ||
    reserved.right > 0
  );
}

/**
 * The area available for tiling: the work area of a monitor, minus the space
 * the user reserved. Pass null for `reserved` to use the work area as it
 * stands.
 *
 * The work area already excludes panels and any dock that reserves space for
 * itself. Reserved space is for the ones that do not.
 */
export function getUsableArea(workArea: Rect, reserved: Reserved | null): Rect {
  const left = workArea.x + (reserved?.left ?? 0);
  const top = workArea.y + (reserved?.top ?? 0);
  const right = workArea.x + workArea.width - (reserved?.right ?? 0);
  const bottom = workArea.y + workArea.height - (reserved?.bottom ?? 0);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
