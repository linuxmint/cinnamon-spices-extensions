/**
 * Every question Tiler asks the window manager, and every instruction it
 * gives, is here. The rest of the extension deals in plain rectangles and
 * names.
 */

import type { Direction, Rect } from "./geometry.ts";
import { tileModeOf } from "./pushtile.ts";
import type { TileMode } from "./pushtile.ts";

const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

export type MetaWindow = imports.gi.Meta.Window;

/** The kinds of window Tiler is allowed to place, beyond ordinary ones. */
export interface WindowFilter {
  /** Include dialog windows. */
  dialogs: boolean;
  /** Include toolboxes and floating palettes. */
  toolboxes: boolean;
}

/**
 * Whether a window of this kind should be tiled. Everything absent from the
 * list below, such as menus, tooltips and splash screens, is never tiled.
 */
function isTileableType(
  type: imports.gi.Meta.WindowType,
  filter: WindowFilter,
): boolean {
  switch (type) {
    case Meta.WindowType.NORMAL:
      return true;
    case Meta.WindowType.DIALOG:
    case Meta.WindowType.MODAL_DIALOG:
      return filter.dialogs;
    case Meta.WindowType.UTILITY:
      return filter.toolboxes;
    default:
      return false;
  }
}

/**
 * Whether a window can be resized at all.
 *
 * allows_resize() reports whether the window can be resized in the state it
 * is in, and a maximized window cannot be. Tiler clears that state before
 * placing a window, so the question that matters is whether the window
 * could ever be resized.
 */
export function isResizeable(window: MetaWindow): boolean {
  return !!window.resizeable;
}

/**
 * Returns the window Tiler should act on, or null when the focused window is
 * not one that can sensibly be tiled: a kind of window the user has not asked
 * for, or a window that cannot be resized at all.
 */
export function getTargetWindow(filter: WindowFilter): MetaWindow | null {
  const window = global.display.get_focus_window();
  if (!window) {
    return null;
  }

  if (!isTileableType(window.get_window_type(), filter)) {
    return null;
  }

  if (!isResizeable(window)) {
    return null;
  }

  return window;
}

/**
 * The windows an all-at-once arrangement should pick up, most recently used
 * first: every window on the active workspace and the given monitor that the
 * filter admits and that could actually be placed. Minimized windows are
 * left in peace; windows buried under others are included, since digging
 * those out is much of what arranging everything is for.
 */
export function listTileableWindows(
  filter: WindowFilter,
  monitorIndex: number,
): MetaWindow[] {
  const workspace = global.workspace_manager.get_active_workspace();
  const all = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);

  const seen = new Set<number>();
  const windows: MetaWindow[] = [];
  for (const window of all) {
    // The list can rarely name a window twice.
    const sequence = window.get_stable_sequence();
    if (seen.has(sequence)) {
      continue;
    }
    seen.add(sequence);

    if (window.minimized) {
      continue;
    }
    if (window.get_monitor() !== monitorIndex) {
      continue;
    }
    if (!isTileableType(window.get_window_type(), filter)) {
      continue;
    }
    if (!isResizeable(window)) {
      continue;
    }

    windows.push(window);
  }

  return windows;
}

/** Which monitor a window is currently on. */
export function monitorOf(window: MetaWindow): number {
  return window.get_monitor();
}

/** Whether the window manager is holding a window maximized. */
export function isMaximized(window: MetaWindow): boolean {
  return !!window.get_maximized();
}

/**
 * Where the window manager itself believes a window is tiled. Windows it
 * tiled, by a drag to a screen edge, carry a position here that Tiler knows
 * nothing about otherwise.
 */
export function tileModeOfWindow(window: MetaWindow): TileMode {
  const mode = window.tile_mode;

  return tileModeOf(typeof mode === "number" ? mode : 0);
}

/** What a window calls itself, for saying which window a grid will move. */
export function titleOf(window: MetaWindow): string {
  return window.get_title() || "";
}

/** The application a window belongs to, or null for one that has none. */
export function appOf(window: MetaWindow): imports.gi.Cinnamon.App | null {
  return Cinnamon.WindowTracker.get_default().get_window_app(window) || null;
}

/** Where a window currently sits, decorations included. */
export function frameOf(window: MetaWindow): Rect {
  const frame = window.get_frame_rect();

  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

/** Whether a monitor is the primary one. */
export function isPrimaryMonitor(monitorIndex: number): boolean {
  return monitorIndex === Main.layoutManager.primaryIndex;
}

/** How much the display scales what is drawn on it, for sizing in pixels. */
export function displayScale(): number {
  return St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
}

/** The whole of a monitor, or nothing if there is no such monitor. */
export function monitorBounds(monitorIndex: number): Rect | null {
  const monitor = Main.layoutManager.monitors[monitorIndex];
  if (!monitor) {
    return null;
  }

  return {
    x: monitor.x,
    y: monitor.y,
    width: monitor.width,
    height: monitor.height,
  };
}

/**
 * The part of a monitor left over once everything that reserves space has
 * had its share: panels, docks, and anything else that sets a strut. This is
 * also the area a window fills when it is maximized.
 *
 * It is asked of a window because the answer belongs to the workspace that
 * window is on.
 */
export function workAreaOf(window: MetaWindow, monitorIndex: number): Rect {
  const area = window.get_work_area_for_monitor(monitorIndex);
  if (!area) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return { x: area.x, y: area.y, width: area.width, height: area.height };
}

/**
 * Clears the states that hold a window at a fixed size. Fullscreen and
 * maximized windows keep their geometry whatever they are asked to do, so
 * both have to go before the window can be placed.
 *
 * Windows snapped to a screen edge by Cinnamon are covered by unmaximizing
 * them. There is no explicit way to undo the snap: meta_window_tile() is not
 * exported to extensions, and Meta.Window has no untile() to call instead.
 */
function release(window: MetaWindow): void {
  if (window.is_fullscreen()) {
    window.unmake_fullscreen();
  }

  // An unmaximized window reports no maximize flags at all.
  if (window.get_maximized()) {
    window.unmaximize(Meta.MaximizeFlags.BOTH);
  }
}

/**
 * Lets a window out of whatever is holding it at a fixed size, without
 * placing it anywhere. A window the window manager tiled or maximized has a
 * size of its own remembered, and this is what returns it to that size.
 */
export function releaseWindow(window: MetaWindow): void {
  release(window);
}

/**
 * Places a window into `rect`.
 *
 * When `maximize` is set the window is moved into the area and then properly
 * maximized, so it keeps its maximized state instead of merely covering the
 * screen. Muffin maximizes to the work area it computes for the monitor,
 * which subtracts panels but nothing else, so only ask for it when `rect` is
 * that whole area.
 */
export function tile(window: MetaWindow, rect: Rect, maximize: boolean): void {
  release(window);

  if (maximize) {
    window.move_frame(true, rect.x, rect.y);
    window.maximize(Meta.MaximizeFlags.BOTH);
    return;
  }

  window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);

  // Some windows, terminals in particular, only settle at the new position
  // once they have been resized, so ask a second time.
  window.move_frame(true, rect.x, rect.y);
}

/** Takes a window out of the way, for one that could not be tiled. */
export function minimizeWindow(window: MetaWindow): void {
  window.minimize();
}

/**
 * Lifts a window above the others. Used for windows gathered into a pile or
 * a cascade, which are of no use where they cannot be seen.
 */
export function raiseWindow(window: MetaWindow): void {
  window.raise();
}

/** Cinnamon's own tiling shortcuts, and the way each one pushes a window. */
const PUSH_KEYS: Array<{ name: string; direction: Direction }> = [
  { name: "push-tile-left", direction: "left" },
  { name: "push-tile-right", direction: "right" },
  { name: "push-tile-up", direction: "up" },
  { name: "push-tile-down", direction: "down" },
];

/**
 * Answers Cinnamon's tiling shortcuts with `onPush` rather than leaving them
 * to the window manager.
 *
 * What is replaced is the handler, not the shortcut: whichever keys the user
 * has these bound to go on working, a rebinding is picked up without Tiler
 * being told, and nothing in their settings is written to. The window comes
 * from the window manager, which passes the focused one because these
 * shortcuts are declared as acting on a window.
 */
export function takePushTileKeys(
  onPush: (direction: Direction, window: MetaWindow | null) => void,
): void {
  for (const { name, direction } of PUSH_KEYS) {
    Meta.keybindings_set_custom_handler(name, (_display, window) => {
      onPush(direction, window ?? null);
    });
  }
}

/**
 * Hands the shortcuts back. The window manager keeps its own handler beside
 * any replacement and returns to it the moment the replacement is cleared, so
 * this leaves the keys behaving exactly as they did before Tiler was enabled.
 *
 * A replacement can only be cleared, never read, so if some other extension
 * had replaced these first, this returns them to the window manager rather
 * than to that extension. There is nothing in the API to do better with;
 * Cinnamon replaces handlers of its own on the same terms.
 */
export function releasePushTileKeys(): void {
  for (const { name } of PUSH_KEYS) {
    Meta.keybindings_set_custom_handler(name, null);
  }
}
