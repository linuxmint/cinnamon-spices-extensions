/**
 * Ties the pieces together: owns the settings, the hotkey, and the tiling
 * action they drive.
 */

import { autotileRects } from "./autotile.ts";
import type { AutotileMode } from "./autotile.ts";
import { Config } from "./config.ts";
import { cellRangeToRect, coversFullGrid } from "./geometry.ts";
import type { CellRange, Gaps, GridSize, Rect } from "./geometry.ts";
import type { Preset } from "./preset.ts";
import { Overlay } from "./overlay.ts";
import { getUsableArea, hasReserved } from "./workarea.ts";
import type { Reserved } from "./workarea.ts";
import {
  frameOf,
  getTargetWindow,
  isPrimaryMonitor,
  listTileableWindows,
  monitorBounds,
  monitorOf,
  tile,
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

export class App {
  private readonly config: Config;
  private readonly signals = new SignalManager.SignalManager(null);
  private hotkeyRegistered = false;
  private session: Session | null = null;

  constructor(uuid: string) {
    this.config = new Config(uuid, this.registerHotkey);
    this.registerHotkey();

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
    this.config.destroy();
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

    const monitorIndex = monitorOf(window);
    const reserved = this.reservedFor(monitorIndex);
    const area = getUsableArea(workAreaOf(window, monitorIndex), reserved);
    // Negated so that a width or height that is not a number fails the test
    // rather than slipping through it.
    if (!(area.width >= MIN_TILE_AREA) || !(area.height >= MIN_TILE_AREA)) {
      return;
    }

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
    const session = this.session;
    this.closeOverlay();

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

    // A lone window filling the whole area is the maximize case, under the
    // same conditions as a full-grid selection.
    const fillsArea =
      windows.length === 1 &&
      session.gaps.edge === 0 &&
      !hasReserved(session.reserved);

    windows.forEach((window, index) => {
      tile(window, rects[index], fillsArea);
    });
  };

  private onTile = (range: CellRange): void => {
    const session = this.session;
    this.closeOverlay();

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

    // Covering the whole area is a real maximize, so the window keeps its
    // maximized state. Muffin maximizes to its own idea of the work area,
    // which accounts for panels but knows nothing about reserved space, so
    // anything held back rules it out.
    const fillsArea =
      coversFullGrid(grid, range) &&
      gaps.edge === 0 &&
      !hasReserved(session.reserved);

    tile(window, rect, fillsArea);
  };
}
