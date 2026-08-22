/**
 * Ties the pieces together: owns the settings, the hotkey, and the tiling
 * action they drive.
 */

import { autotileRects } from "./autotile.ts";
import type { AutotileMode } from "./autotile.ts";
import { Config } from "./config.ts";
import { cellRangeToRect, coversFullGrid } from "./geometry.ts";
import type { CellRange, Direction, Gaps, GridSize, Rect } from "./geometry.ts";
import type { Preset } from "./preset.ts";
import { Overlay } from "./overlay.ts";
import {
  PUSH_GRID,
  nextTileMode,
  readPushState,
  tileModeRange,
} from "./pushtile.ts";
import type { PushNote } from "./pushtile.ts";
import { getUsableArea, hasReserved } from "./workarea.ts";
import type { Reserved } from "./workarea.ts";
import {
  frameOf,
  getTargetWindow,
  isMaximized,
  isPrimaryMonitor,
  isResizeable,
  listTileableWindows,
  monitorBounds,
  monitorOf,
  releasePushTileKeys,
  releaseWindow,
  takePushTileKeys,
  tile,
  tileModeOfWindow,
  workAreaOf,
} from "./winops.ts";
import type { MetaWindow } from "./winops.ts";

const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;

/** Identifier the keybinding is registered under. */
const HOTKEY_NAME = "tiler-tile";

/**
 * An unset keybinding. Cinnamon stores a cleared shortcut as a pair of empty
 * alternatives rather than an empty string.
 */
const UNBOUND = "::";

/**
 * The smallest usable area, on either axis, that is still worth tiling into.
 * Reserved space is applied exactly as configured, so it is possible to leave
 * a monitor with almost nothing to tile; rather than shrink windows to
 * something unusable, Tiler does nothing at all.
 */
const MIN_TILE_AREA = 250;

/**
 * What Tiler is working on while the grid is up.
 *
 * Everything the placement depends on is settled when the grid opens and read
 * back from here afterwards. Asking the settings again at the end would let
 * the window land somewhere other than where the preview said it would.
 */
interface Session {
  window: MetaWindow;
  monitorIndex: number;
  area: Rect;
  reserved: Reserved | null;
  gaps: Gaps;
  presets: Preset[];
  grid: GridSize;
  chosen: number;
  overlay: Overlay;
}

/**
 * Where Cinnamon's tiling shortcuts have put a window, and the size it had
 * before they first moved it.
 *
 * The window manager records a position of its own, but only for windows it
 * placed itself, and it will not be told about Tiler's placements: its
 * tile-mode cannot be written to, and the call that would set it is not
 * available to extensions. So Tiler keeps its own note, which is also the
 * only way to describe positions the manager has no name for.
 *
 * `placed` is the frame the window actually got, read back after the
 * placement, so windows that adjust what they are given (terminals snapping
 * to their character grid) are recorded as they came out. It is what says
 * whether the note can still be believed: a window that is not where the
 * note put it has been moved by something since, and the note is dropped
 * rather than trusted.
 */
interface Pushed extends PushNote {
  saved: Rect;
}

export class App {
  private readonly config: Config;
  private readonly signals = new SignalManager.SignalManager(null);
  private hotkeyRegistered = false;
  private pushTileHeld = false;
  private session: Session | null = null;

  // Keyed by the window, so a window that closes takes its note with it.
  private readonly pushed = new WeakMap<MetaWindow, Pushed>();

  constructor(uuid: string) {
    this.config = new Config(uuid, this.registerHotkey, this.syncPushTileKeys);
    this.registerHotkey();
    this.syncPushTileKeys();

    // A grid is only good for the screen it was measured against, and there
    // is no sense guessing what the user wants once that screen has changed
    // underneath them. They can ask for a new one.
    this.signals.connect(
      Main.layoutManager,
      "monitors-changed",
      this.closeOverlay,
    );
  }

  public destroy(): void {
    this.signals.disconnectAllSignals();
    this.closeOverlay();
    this.removeHotkey();
    this.releasePushTile();
    this.config.destroy();
  }

  /**
   * Places a window, and forgets whatever Cinnamon's tiling shortcuts had
   * noted about it.
   *
   * Every placement Tiler makes goes through here, so that a window put
   * somewhere by the grid, or by an all-at-once arrangement, starts those
   * shortcuts afresh rather than carrying on from a position it is no longer
   * in. A grid selection has no name among those positions to be translated
   * into: only halves and corners do, and grids are whatever the user made
   * them.
   */
  private placeWindow(window: MetaWindow, rect: Rect, maximize: boolean): void {
    tile(window, rect, maximize);
    this.pushed.delete(window);
  }

  /**
   * Takes Cinnamon's tiling shortcuts over, or gives them back, to match the
   * setting. Held is tracked so that handing them back is only ever done from
   * having taken them, whatever order the settings arrive in.
   */
  private syncPushTileKeys = (): void => {
    if (!this.config.usePushTile) {
      this.releasePushTile();
      return;
    }

    if (!this.pushTileHeld) {
      takePushTileKeys(this.onPush);
      this.pushTileHeld = true;
    }
  };

  private releasePushTile(): void {
    if (!this.pushTileHeld) {
      return;
    }

    releasePushTileKeys();
    this.pushTileHeld = false;
  }

  private registerHotkey = (): void => {
    this.removeHotkey();

    const binding = this.config.hotkey;
    if (!binding || binding === UNBOUND) {
      return;
    }

    // Cinnamon rejects bindings it cannot parse, so only remember the
    // registration if it actually took.
    this.hotkeyRegistered = Main.keybindingManager.addHotKey(
      HOTKEY_NAME,
      binding,
      this.onHotkey,
    );
  };

  private removeHotkey(): void {
    if (!this.hotkeyRegistered) {
      return;
    }

    Main.keybindingManager.removeHotKey(HOTKEY_NAME);
    this.hotkeyRegistered = false;
  }

  /** Reserved space for a monitor, or null when the scope excludes it. */
  private reservedFor(monitorIndex: number): Reserved | null {
    if (
      this.config.reservedScope === "primary" &&
      !isPrimaryMonitor(monitorIndex)
    ) {
      return null;
    }

    return this.config.reserved;
  }

  /**
   * The area a window may be tiled into on its monitor, with the reserved
   * space that shaped it, or null when that leaves too little to tile into.
   */
  private usableAreaFor(window: MetaWindow): {
    monitorIndex: number;
    reserved: Reserved | null;
    area: Rect;
  } | null {
    const monitorIndex = monitorOf(window);
    const reserved = this.reservedFor(monitorIndex);
    const area = getUsableArea(workAreaOf(window, monitorIndex), reserved);

    // Negated so that a width or height that is not a number fails the test
    // rather than slipping through it.
    if (!(area.width >= MIN_TILE_AREA) || !(area.height >= MIN_TILE_AREA)) {
      return null;
    }

    return { monitorIndex, reserved, area };
  }

  /**
   * Whether a placement that covers everything should be a real maximize, so
   * the window keeps its maximized state rather than merely filling the
   * screen. Muffin maximizes to its own idea of the work area, which accounts
   * for panels but knows nothing about Tiler's spacing, so it is only asked
   * for when nothing is held back from the edges.
   */
  private fillsWholeArea(
    covers: boolean,
    gaps: Gaps,
    reserved: Reserved | null,
  ): boolean {
    return covers && gaps.edge === 0 && !hasReserved(reserved);
  }

  /** Ends the session and hands back what it was: how every commit begins. */
  private takeSession(): Session | null {
    const session = this.session;
    this.closeOverlay();

    return session;
  }

  /**
   * Takes note of a different grid being picked. The session carries it so
   * that what gets tiled is the grid that was on screen, and so that closing
   * can write down where the user left off.
   */
  private onChoose = (index: number): void => {
    const session = this.session;
    if (!session) {
      return;
    }

    // Read from the grids this session was opened with, not from the
    // settings as they stand now. They are what the overlay is drawing, and
    // the window has to land where the drawing said it would.
    const preset = session.presets[index];
    if (!preset) {
      return;
    }

    session.chosen = index;
    session.grid = preset.grid;
  };

  /** Takes the grid off screen, if it is up. */
  private closeOverlay = (): void => {
    if (!this.session) {
      return;
    }

    const { overlay, chosen } = this.session;
    this.session = null;
    overlay.destroy();

    // Which grid was settled on is written down once the user has finished
    // with it. Writing on every press would put the settings file to disk
    // again for each grid they looked through on the way.
    this.config.lastGrid = chosen;
  };

  private onHotkey = (): void => {
    // Pressing the hotkey again puts the grid away rather than opening a
    // second one.
    if (this.session) {
      this.closeOverlay();
      return;
    }

    const window = getTargetWindow(this.config.windowFilter);
    if (!window) {
      return;
    }

    const usable = this.usableAreaFor(window);
    if (!usable) {
      return;
    }
    const { monitorIndex, reserved, area } = usable;

    const bounds = monitorBounds(monitorIndex) ?? area;

    const gaps = this.config.gaps;
    const presets = this.config.presets;
    const chosen = this.config.lastGrid;
    const overlay = new Overlay({
      window,
      area,
      bounds,
      anchor: this.config.centerOnWindow ? frameOf(window) : bounds,
      gaps,
      presets,
      chosen,
      autotile: this.config.showAutotile,
      onTile: this.onTile,
      onChoose: this.onChoose,
      onAutotile: this.onAutotile,
      onClose: this.closeOverlay,
    });

    const grid = presets[chosen].grid;
    this.session = {
      window,
      monitorIndex,
      area,
      reserved,
      gaps,
      presets,
      grid,
      chosen,
      overlay,
    };
  };

  /**
   * Rearranges every window the filter admits, all at once. The windows are
   * gathered fresh, since some may have come or gone while the grid was up,
   * but they are placed into the area and spacing this session was opened
   * with, like any other placement. The grid's own window leads when it is
   * still among them; otherwise the most recent one does.
   */
  private onAutotile = (mode: AutotileMode): void => {
    const session = this.takeSession();
    if (!session) {
      return;
    }

    const windows = listTileableWindows(
      this.config.windowFilter,
      session.monitorIndex,
    );
    if (windows.length === 0) {
      return;
    }

    const lead = windows.indexOf(session.window);
    if (lead > 0) {
      windows.splice(lead, 1);
      windows.unshift(session.window);
    }

    const rects = autotileRects(mode, windows.length, session.area, session.gaps);

    // A lone window filling the whole area is the maximize case.
    const fillsArea = this.fillsWholeArea(
      windows.length === 1,
      session.gaps,
      session.reserved,
    );

    windows.forEach((window, index) => {
      this.placeWindow(window, rects[index], fillsArea);
    });
  };

  /**
   * One of Cinnamon's tiling shortcuts, answered Tiler's way.
   *
   * The window goes exactly where the shortcut has always sent it, since the
   * rules in `pushtile.ts` are the window manager's own, but it is placed
   * through the same conversion the grid uses, so it keeps clear of reserved
   * space and leaves the configured gap beside its neighbours.
   */
  private onPush = (direction: Direction, window: MetaWindow | null): void => {
    if (!window || !isResizeable(window)) {
      return;
    }

    // The grid is drawn for where a window was, so it has nothing left to say
    // once one of these has moved it.
    this.closeOverlay();

    // Where to carry on from: the window's own maximized state first, as the
    // window manager decides it, then Tiler's note if the window is still
    // where the note put it, then whatever the manager remembers, so a window
    // tiled by a drag carries on from there. A note that no longer stands is
    // dropped along with the size it saved: it described a life this window
    // has moved on from.
    const noted = this.pushed.get(window) ?? null;
    const { mode: current, standing } = readPushState(
      isMaximized(window),
      frameOf(window),
      noted,
      tileModeOfWindow(window),
    );
    if (noted && !standing) {
      this.pushed.delete(window);
    }
    const record = standing ? noted : null;

    const next = nextTileMode(direction, current);
    if (next === current) {
      return;
    }

    if (next === "none") {
      // Tiler restores the size it wrote down; without a note of its own the
      // window manager has one, and letting the window go is what asks for it.
      if (record) {
        this.placeWindow(window, record.saved, false);
      } else {
        releaseWindow(window);
      }

      return;
    }

    const range = tileModeRange(next);
    if (!range) {
      return;
    }

    const usable = this.usableAreaFor(window);
    if (!usable) {
      return;
    }
    const { reserved, area } = usable;

    // The size to come back to is the one the window had before any of this
    // started. Letting it go first is what recovers that size from the window
    // manager, and nothing is drawn between there and the placement below.
    if (!record) {
      releaseWindow(window);
    }
    const saved = record?.saved ?? frameOf(window);

    const gaps = this.config.gaps;
    const rect = cellRangeToRect(area, PUSH_GRID, range, gaps);
    const fillsArea = this.fillsWholeArea(next === "maximized", gaps, reserved);

    this.placeWindow(window, rect, fillsArea);
    // The frame is read back rather than assumed: what the window took is
    // what a later push must find it still holding.
    this.pushed.set(window, { mode: next, saved, placed: frameOf(window) });
  };

  private onTile = (range: CellRange): void => {
    const session = this.takeSession();
    if (!session) {
      return;
    }

    // Only the window this grid was opened for gets tiled. If the focus has
    // moved on, whether because that window closed or because the user
    // switched away, the measurements behind the preview belong to a window
    // that is no longer the one that would move, so do nothing.
    const window = getTargetWindow(this.config.windowFilter);
    if (window !== session.window) {
      return;
    }

    const { gaps, grid } = session;
    const rect = cellRangeToRect(session.area, grid, range, gaps);
    const fillsArea = this.fillsWholeArea(
      coversFullGrid(grid, range),
      gaps,
      session.reserved,
    );

    this.placeWindow(window, rect, fillsArea);
  };
}
