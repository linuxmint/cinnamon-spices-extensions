/**
 * The edge where values from outside become values Tiler can rely on.
 *
 * Settings live in a JSON file users can edit by hand, so a value that never
 * passed through the settings widgets may be of any type at all, and the
 * window manager answers some questions with no answer. Everything arriving
 * from either goes through one of these first, so the rest of Tiler works
 * only with values of the type they claim to be.
 */

/** Falls back to zero for anything that is not a usable number. */
export function toFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * A measurement in pixels, which can never be negative. The settings widgets
 * enforce their own minimum, but a file edited by hand does not go near them,
 * and a negative size would grow the area it was meant to shrink.
 */
export function toSize(value: number): number {
  return Math.max(0, toFinite(value));
}

/**
 * Only a real boolean counts as on. A hand-edited settings file can hold the
 * string "false", which JavaScript would otherwise treat as true.
 */
export function toBoolean(value: boolean): boolean {
  return value === true;
}

/** Anything that is not a string is no keybinding at all. */
export function toKeybinding(value: string): string {
  return typeof value === "string" ? value : "";
}
