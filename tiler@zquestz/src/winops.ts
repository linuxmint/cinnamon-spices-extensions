/**
 * Every question Tiler asks the window manager, and every instruction it
 * gives, is here. The rest of the extension deals in plain rectangles.
 */

import type { Rect } from "./geometry.ts";

const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;

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

  // allows_resize() reports whether the window can be resized in the state it
  // is in, and a maximized window cannot be. Tiler clears that state before
  // placing a window, so the question that matters is whether the window can
  // be resized at all.
  if (!window.resizeable) {
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

  const seen: Record<number, boolean> = {};
  const windows: MetaWindow[] = [];
  for (const window of all) {
    // The list can rarely name a window twice.
    const sequence = window.get_stable_sequence();
    if (seen[sequence]) {
      continue;
    }
    seen[sequence] = true;

    if (window.minimized) {
      continue;
    }
    if (window.get_monitor() !== monitorIndex) {
      continue;
    }
    if (!isTileableType(window.get_window_type(), filter)) {
      continue;
    }
    if (!window.resizeable) {
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

/** Whether a monitor is the primary one. */
export function isPrimaryMonitor(monitorIndex: number): boolean {
  return monitorIndex === Main.layoutManager.primaryIndex;
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
