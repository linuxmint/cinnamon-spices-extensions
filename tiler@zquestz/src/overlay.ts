/**
 * The grid Tiler puts on screen, and the preview that goes with it.
 *
 * Every actor in the extension is built here. The grid itself is deliberately
 * small: picking a range means moving the pointer across a few centimetres
 * rather than across the whole screen. What keeps that honest is the preview,
 * which is drawn at full size exactly where the window will land, gaps and
 * reserved space included.
 */

import {
  cellAt,
  cellRangeToRect,
  centerOn,
  moveFocus,
  normalizeRange,
  selectionRange,
  trackCount,
  trackSizes,
} from "./geometry.ts";
import type {
  Cell,
  CellRange,
  Direction,
  Gaps,
  GridSize,
  Rect,
  Selection,
} from "./geometry.ts";
import type { AutotileMode } from "./autotile.ts";
import { _ } from "./i18n.ts";
import { GRID_COUNT } from "./preset.ts";
import type { Preset } from "./preset.ts";
import { rgba, windowColours } from "./theme.ts";
import { appOf, titleOf } from "./winops.ts";
import type { MetaWindow } from "./winops.ts";

const Main = imports.ui.main;
const St = imports.gi.St;
const Pango = imports.gi.Pango;
const Tooltips = imports.ui.tooltips;

/** How wide the grid is drawn, before display scaling. */
const PANEL_WIDTH = 320;

/** The space left between cells of the grid, before display scaling. */
const CELL_SPACING = 4;

/** How large the header draws the window's icon, before display scaling. */
const HEADER_ICON = 16;

/** The shape the grid falls back to when the area has none to take. */
const DEFAULT_SHAPE = 9 / 16;

/** Nothing the grid draws is allowed to disappear entirely. */
const MIN_CELL = 1;

/** The button that chooses. The others are left to mean whatever they mean. */
const PRIMARY_BUTTON = 1;

/** How thick the lines around each part are drawn, in pixels. */
const BORDER = {
  panel: 1,
  cell: 1,
  preview: 2,
};

/**
 * How much of each colour to use. The colours themselves come from the theme;
 * these say how solidly each part of the grid is drawn in them.
 */
const OPACITY = {
  panelBorder: 0.25,
  cellFill: 0.15,
  cellBorder: 0.25,
  chipHoverFill: 0.3,
  chosenFill: 0.75,
  chosenBorder: 0.95,
  previewFill: 0.22,
  previewBorder: 0.85,
};

type KeyAction =
  | { kind: "close" }
  | { kind: "tile" }
  | { kind: "move"; to: Direction }
  | { kind: "grow"; to: Direction }
  | { kind: "choose"; grid: number }
  | { kind: "autotile"; mode: AutotileMode };

/**
 * The keys the grid answers to while it is up, and what each one does. They
 * are taken over when the grid opens and handed back when it closes, so they
 * only mean this while there is a grid to mean it to.
 */
const KEYS: Array<{ name: string; binding: string; act: KeyAction }> = [
  { name: "tiler-close", binding: "Escape", act: { kind: "close" } },
  { name: "tiler-tile-return", binding: "Return", act: { kind: "tile" } },
  { name: "tiler-tile-enter", binding: "KP_Enter", act: { kind: "tile" } },
  { name: "tiler-tile-space", binding: "space", act: { kind: "tile" } },
  { name: "tiler-up", binding: "Up", act: { kind: "move", to: "up" } },
  { name: "tiler-down", binding: "Down", act: { kind: "move", to: "down" } },
  { name: "tiler-left", binding: "Left", act: { kind: "move", to: "left" } },
  { name: "tiler-right", binding: "Right", act: { kind: "move", to: "right" } },
  { name: "tiler-grow-up", binding: "<Shift>Up", act: { kind: "grow", to: "up" } },
  { name: "tiler-grow-down", binding: "<Shift>Down", act: { kind: "grow", to: "down" } },
  { name: "tiler-grow-left", binding: "<Shift>Left", act: { kind: "grow", to: "left" } },
  { name: "tiler-grow-right", binding: "<Shift>Right", act: { kind: "grow", to: "right" } },
  // One number key per grid, so that however many grids there are, there is
  // a key for each of them.
  ...Array.from({ length: GRID_COUNT }, (_unused, index) => ({
    name: `tiler-grid-${index + 1}`,
    binding: `${index + 1}`,
    act: { kind: "choose", grid: index } as KeyAction,
  })),
];

/**
 * The keys for the all-at-once arrangements, kept apart from the rest: they
 * are only taken over when the action row is shown, so that with the row
 * hidden the feature is genuinely absent rather than merely invisible.
 */
const AUTOTILE_KEYS: Array<{ name: string; binding: string; act: KeyAction }> = [
  { name: "tiler-auto-main-left", binding: "l", act: { kind: "autotile", mode: "main-left" } },
  { name: "tiler-auto-main-right", binding: "r", act: { kind: "autotile", mode: "main-right" } },
  { name: "tiler-auto-equal-left", binding: "<Shift>l", act: { kind: "autotile", mode: "equal-left" } },
  { name: "tiler-auto-equal-right", binding: "<Shift>r", act: { kind: "autotile", mode: "equal-right" } },
];

/** Clutter hands back measurements that it may have no answer for. */
function measure(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Whether a cell falls inside a range. */
function covers(range: CellRange | null, col: number, row: number): boolean {
  return (
    range !== null &&
    col >= range.col &&
    col <= range.colEnd &&
    row >= range.row &&
    row <= range.rowEnd
  );
}


export interface OverlayOptions {
  /** The window this grid will move, named in its header. */
  window: MetaWindow;
  /** The part of the monitor windows are tiled into. */
  area: Rect;
  /** The whole monitor, which the grid is kept inside. */
  bounds: Rect;
  /** What the grid is centred over. */
  anchor: Rect;
  gaps: Gaps;
  /** The grids on offer, in the order they appear along the strip. */
  presets: Preset[];
  /** Which of them is showing. */
  chosen: number;
  /** Called with the chosen range when the user commits to one. */
  onTile: (range: CellRange) => void;
  /** Called when a different grid is picked, so it can be remembered. */
  onChoose: (index: number) => void;
  /** Whether to offer the all-at-once arrangements, and what they call. */
  autotile: boolean;
  onAutotile: (mode: AutotileMode) => void;
  /** Called when the overlay dismisses itself. */
  onClose: () => void;
}

export class Overlay {
  private readonly options: OverlayOptions;
  private readonly panel: imports.gi.St.BoxLayout;
  private readonly preview: imports.gi.St.Widget;

  /** The grid on show, replaced whenever a different one is picked. */
  private grid: imports.gi.St.BoxLayout;

  /** Names the window the grid is for. */
  private readonly header: imports.gi.St.BoxLayout;

  /** The strip of grids to pick from, and the chips along it. */
  private readonly strip: imports.gi.St.BoxLayout;
  private readonly chips: imports.gi.St.Button[] = [];

  /** The all-at-once arrangements, when they are offered at all. */
  private readonly actions: imports.gi.St.BoxLayout | null;

  /** Which grid is showing. */
  private chosen: number;

  /** How the drawing is scaled, kept for rebuilding the grid. */
  private readonly scale: number;
  private readonly spacing: number;

  /** Covers everything else, so that a click anywhere else is a dismissal. */
  private readonly elsewhere: imports.gi.St.Widget;

  /** Every cell of the grid, by row then column, so they can be lit up. */
  private cells: imports.gi.St.Widget[][] = [];

  /** Which cells are lit at the moment, so only the changes are redrawn. */
  private lit: CellRange | null = null;

  /** How a cell of the grid is drawn while it is part of the choice. */
  private readonly activeCellStyle: string;

  /** How a chip on the strip is drawn: picked, pointed at, and otherwise. */
  private readonly chosenChipStyle: string;
  private readonly hoverChipStyle: string;
  private readonly chipStyle: string;

  /** How a cell is drawn the rest of the time. */
  private readonly inactiveCellStyle: string;

  /** What is currently chosen, by either hand, or null when nothing is. */
  private selection: Selection | null = null;

  /** Whether the pointer is holding a selection open. */
  private dragging = false;

  /**
   * The cell the pointer was last seen over. Movement is only a choice when
   * it carries the pointer from one cell to another, so this is what it gets
   * compared against rather than whatever happens to be selected.
   */
  private pointerCell: Cell | null = null;
  private closed = false;

  constructor(options: OverlayOptions) {
    this.options = options;
    this.chosen = options.chosen;

    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    const spacing = Math.max(1, Math.round(CELL_SPACING * scale));
    this.scale = scale;
    this.spacing = spacing;

    // The grid is drawn as a window of this theme: filled with the colour of
    // a window, outlined and divided in the colour written on one, and
    // marking the choice in the colour a window marks a selection with.
    const colours = windowColours();
    this.inactiveCellStyle = `background-color: ${rgba(colours.text, OPACITY.cellFill)}; border: ${BORDER.cell}px solid ${rgba(colours.text, OPACITY.cellBorder)};`;
    this.activeCellStyle = `background-color: ${rgba(colours.accent, OPACITY.chosenFill)}; border: ${BORDER.cell}px solid ${rgba(colours.accent, OPACITY.chosenBorder)};`;
    this.chipStyle = `background-color: ${rgba(colours.text, OPACITY.cellFill)}; border: ${BORDER.cell}px solid ${rgba(colours.text, OPACITY.cellBorder)}; color: ${rgba(colours.text, 0.85)};`;
    this.hoverChipStyle = `background-color: ${rgba(colours.text, OPACITY.chipHoverFill)}; border: ${BORDER.cell}px solid ${rgba(colours.text, OPACITY.cellBorder)}; color: ${rgba(colours.text, 0.95)};`;
    this.chosenChipStyle = `background-color: ${rgba(colours.accent, OPACITY.chosenFill)}; border: ${BORDER.cell}px solid ${rgba(colours.accent, OPACITY.chosenBorder)}; color: ${rgba(colours.onAccent, 1)};`;

    // Invisible, reactive, and underneath everything Tiler draws, so that a
    // click that misses the grid puts the grid away instead of reaching
    // whatever happened to be behind it.
    this.elsewhere = new St.Widget({ reactive: true });
    this.elsewhere.set_position(0, 0);
    this.elsewhere.set_size(global.screen_width, global.screen_height);
    this.elsewhere.connect("button-press-event", () => {
      options.onClose();
      return true;
    });

    this.preview = new St.Widget({ style_class: "tiler-preview" });
    this.preview.set_style(
      `background-color: ${rgba(colours.accent, OPACITY.previewFill)}; border: ${BORDER.preview}px solid ${rgba(colours.accent, OPACITY.previewBorder)};`,
    );
    this.preview.hide();

    this.header = this.buildHeader(colours.text);
    this.grid = this.buildGrid();
    this.strip = this.buildStrip();
    this.actions = options.autotile ? this.buildActions() : null;

    this.panel = new St.BoxLayout({
      style_class: "tiler-panel",
      vertical: true,
      reactive: true,
    });
    this.panel.set_style(
      `background-color: ${rgba(colours.surface, 1)}; border: ${BORDER.panel}px solid ${rgba(colours.text, OPACITY.panelBorder)};`,
    );
    this.panel.add_child(this.header);
    this.panel.add_child(this.grid);
    this.panel.add_child(this.strip);
    if (this.actions) {
      this.panel.add_child(this.actions);
    }

    Main.layoutManager.addChrome(this.elsewhere, { visibleInFullscreen: true });
    Main.layoutManager.addChrome(this.preview, { visibleInFullscreen: true });
    Main.layoutManager.addChrome(this.panel, { visibleInFullscreen: true });

    this.place();
    this.listen();

    for (const key of this.keys()) {
      Main.keybindingManager.addHotKey(key.name, key.binding, () =>
        this.onKey(key.act),
      );
    }
  }

  /** The keys this overlay answers to, given what it is showing. */
  private keys(): Array<{ name: string; binding: string; act: KeyAction }> {
    return this.options.autotile ? [...KEYS, ...AUTOTILE_KEYS] : KEYS;
  }

  /** Takes the overlay off screen and releases everything it holds. */
  public destroy(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const key of this.keys()) {
      Main.keybindingManager.removeHotKey(key.name);
    }
    Main.layoutManager.removeChrome(this.panel);
    Main.layoutManager.removeChrome(this.preview);
    Main.layoutManager.removeChrome(this.elsewhere);
    this.panel.destroy();
    this.preview.destroy();
    this.elsewhere.destroy();
  }

  /** The one width the panel's rows agree on: grid, chips and header alike. */
  private panelWidth(): number {
    return Math.round(PANEL_WIDTH * this.scale);
  }

  /**
   * Builds the grid, sized so that it has the same shape as the area being
   * tiled into. A grid that looks like the screen is easier to aim at.
   */
  private buildGrid(): imports.gi.St.BoxLayout {
    const { area } = this.options;
    const { spacing } = this;
    const grid = this.currentGrid();
    const cols = trackCount(grid.cols);
    const rows = trackCount(grid.rows);

    const width = this.panelWidth();
    const shape = area.width > 0 ? area.height / area.width : DEFAULT_SHAPE;
    const height = Math.round(width * shape);

    // The drawing shares out its room the same way the screen does, so a
    // track twice the size of its neighbour is drawn twice as wide.
    const colSizes = trackSizes(width, grid.cols, spacing);
    const rowSizes = trackSizes(height, grid.rows, spacing);

    const table = new St.BoxLayout({ vertical: true });
    table.set_style(`spacing: ${spacing}px;`);
    this.cells = [];

    for (let row = 0; row < rows; row++) {
      const line = new St.BoxLayout();
      line.set_style(`spacing: ${spacing}px;`);
      const built: imports.gi.St.Widget[] = [];

      for (let col = 0; col < cols; col++) {
        const cell = new St.Widget({ style_class: "tiler-cell" });
        cell.set_style(this.inactiveCellStyle);
        cell.set_size(colSizes[col], rowSizes[row]);
        line.add_child(cell);
        built.push(cell);
      }

      this.cells.push(built);
      table.add_child(line);
    }

    return table;
  }

  /** The grid currently on show. */
  private currentGrid(): GridSize {
    const preset = this.options.presets[this.chosen];

    return preset ? preset.grid : { cols: [1], rows: [1] };
  }

  /**
   * Names the window this grid will move: its icon and its title. The grid
   * often opens in the middle of the screen, nowhere near its window, and
   * this is what says which window that is.
   *
   * It swallows clicks: a header is where the eye expects a titlebar, and a
   * press there should not read as reaching for a cell.
   */
  private buildHeader(text: { red: number; green: number; blue: number }): imports.gi.St.BoxLayout {
    const header = new St.BoxLayout({ style_class: "tiler-header", reactive: true });
    header.set_style(`spacing: ${this.spacing * 2}px;`);
    // Held to the panel's width. Ellipsize only cuts a title once the label
    // is denied its natural size; left free, a long title would widen the
    // whole panel rather than truncate.
    header.set_width(this.panelWidth());
    header.connect("button-press-event", () => true);
    header.connect("button-release-event", () => true);

    const app = appOf(this.options.window);
    if (app) {
      header.add_child(
        app.create_icon_texture_for_window(
          Math.round(HEADER_ICON * this.scale),
          this.options.window,
        ),
      );
    }

    const title = new St.Label({ text: titleOf(this.options.window) });
    title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    title.set_style(`color: ${rgba(text, 0.85)};`);
    header.add_child(title);

    return header;
  }

  /** How wide each of `count` chips comes out across the panel. */
  private chipWidth(count: number): number {
    const width = this.panelWidth();

    return Math.max(
      MIN_CELL,
      Math.round((width - this.spacing * (count - 1)) / count),
    );
  }

  /**
   * A chip: a small labelled button, as both rows under the grid draw them.
   * A label too long for its chip is cut rather than allowed to stretch the
   * row, with the tooltip there to say the whole of it.
   */
  private makeChip(
    label: string,
    width: number,
    tooltip: string,
  ): imports.gi.St.Button {
    const text = new St.Label({ text: label });
    text.clutter_text.ellipsize = Pango.EllipsizeMode.END;

    const chip = new St.Button({
      style_class: "tiler-chip",
      reactive: true,
      track_hover: true,
    });
    chip.set_child(text);
    chip.set_width(width);

    if (tooltip) {
      // A tooltip attaches itself to the actor it is given and goes when
      // that actor does, so there is nothing here to keep hold of.
      new Tooltips.Tooltip(chip, tooltip);
    }

    return chip;
  }

  /** Builds the strip of grids to pick from. */
  private buildStrip(): imports.gi.St.BoxLayout {
    const strip = new St.BoxLayout({ style_class: "tiler-strip" });
    strip.set_style(`spacing: ${this.spacing}px;`);

    const presets = this.options.presets;
    const each = this.chipWidth(presets.length);

    presets.forEach((preset, index) => {
      const chip = this.makeChip(preset.label, each, preset.tooltip);
      chip.connect("notify::hover", () => this.dressChip(index));
      chip.connect("clicked", () => {
        this.choosePreset(index);
        return true;
      });

      this.chips.push(chip);
      strip.add_child(chip);
    });

    this.dressChips();

    return strip;
  }

  /**
   * Builds the row of all-at-once arrangements. Unlike the strip above it,
   * these do not switch anything: pressing one rearranges every window on
   * the workspace there and then, so the row sits apart from the strip and
   * each chip explains itself on hover.
   */
  private buildActions(): imports.gi.St.BoxLayout {
    const row = new St.BoxLayout({ style_class: "tiler-actions" });
    row.set_style(`spacing: ${this.spacing}px;`);

    const arrangements: Array<{ label: string; tooltip: string; mode: AutotileMode }> = [
      {
        label: _("Main Left"),
        tooltip: _("The focused window fills the left half, and the rest stack on the right."),
        mode: "main-left",
      },
      {
        label: _("Main Right"),
        tooltip: _("The focused window fills the right half, and the rest stack on the left."),
        mode: "main-right",
      },
      {
        label: _("Equal Left"),
        tooltip: _("Every window shares two equal columns, led from the top left."),
        mode: "equal-left",
      },
      {
        label: _("Equal Right"),
        tooltip: _("Every window shares two equal columns, led from the top right."),
        mode: "equal-right",
      },
    ];

    const each = this.chipWidth(arrangements.length);

    for (const arrangement of arrangements) {
      const chip = this.makeChip(arrangement.label, each, arrangement.tooltip);
      chip.set_style(this.chipStyle);
      chip.connect("notify::hover", () =>
        chip.set_style(chip.hover ? this.hoverChipStyle : this.chipStyle),
      );
      chip.connect("clicked", () => {
        this.options.onAutotile(arrangement.mode);
        return true;
      });

      row.add_child(chip);
    }

    return row;
  }

  /** Draws one chip as picked, pointed at, or neither. */
  private dressChip(index: number): void {
    const chip = this.chips[index];
    if (!chip) {
      return;
    }

    if (index === this.chosen) {
      chip.set_style(this.chosenChipStyle);
      return;
    }

    chip.set_style(chip.hover ? this.hoverChipStyle : this.chipStyle);
  }

  /** Draws the whole strip, for when the grid on show has changed. */
  private dressChips(): void {
    this.chips.forEach((_chip, index) => this.dressChip(index));
  }

  /**
   * Shows a different grid, in place. The choice is dropped along with the
   * old grid: cells of the one do not answer to cells of the other.
   */
  private choosePreset(index: number): void {
    if (index === this.chosen || !this.options.presets[index]) {
      return;
    }

    this.chosen = index;
    this.options.onChoose(index);

    this.chooseNothing();
    this.pointerCell = null;
    this.dragging = false;

    this.panel.remove_child(this.grid);
    this.grid.destroy();
    this.grid = this.buildGrid();
    this.panel.insert_child_at_index(this.grid, 1);

    this.dressChips();
    this.place();
  }

  /** Centres the grid over whatever it was told to sit on. */
  private place(): void {
    const [, preferredWidth] = this.panel.get_preferred_width(-1);
    const width = measure(preferredWidth);
    const [, preferredHeight] = this.panel.get_preferred_height(width);
    const box = centerOn(
      { width, height: measure(preferredHeight) },
      this.options.anchor,
      this.options.bounds,
    );

    this.panel.set_position(box.x, box.y);
  }

  /**
   * Pointer handling belongs to the grid as a whole rather than to each cell,
   * and the cell in question is worked out from where the pointer is. Doing
   * it the other way round does not survive a drag: the cell a press lands on
   * keeps the pointer until release, so the cell a drag ends on would never
   * hear about it.
   *
   * This depends on the cells staying unreactive, which they are by default.
   * Making one reactive would take events away from here and break dragging.
   */
  private listen(): void {
    this.panel.connect("button-press-event", this.onPress);
    this.panel.connect("motion-event", this.onMotion);
    this.panel.connect("button-release-event", this.onRelease);
    this.panel.connect("leave-event", this.onLeave);
  }

  /** The box the grid occupies on screen, for turning points into cells. */
  private gridBox(): Rect {
    const [x, y] = this.grid.get_transformed_position();
    const [width, height] = this.grid.get_transformed_size();

    return {
      x: measure(x),
      y: measure(y),
      width: measure(width),
      height: measure(height),
    };
  }

  /** Whether a point is over the grid itself rather than elsewhere. */
  private overGrid(event: imports.gi.Clutter.Event): boolean {
    const [x, y] = event.get_coords();
    const box = this.gridBox();

    return (
      x >= box.x &&
      y >= box.y &&
      x <= box.x + box.width &&
      y <= box.y + box.height
    );
  }

  private cellUnder(event: imports.gi.Clutter.Event): Cell {
    const [x, y] = event.get_coords();

    return cellAt(x, y, this.gridBox(), this.currentGrid(), this.spacing);
  }

  /** Chooses a range, and shows what choosing it would do. */
  private choose(selection: Selection): void {
    this.selection = selection;

    const { area, gaps } = this.options;
    const range = selectionRange(selection);
    const rect = cellRangeToRect(area, this.currentGrid(), range, gaps);

    this.preview.set_position(rect.x, rect.y);
    this.preview.set_size(rect.width, rect.height);
    this.preview.show();
    this.highlight(range);
  }

  /** Goes back to having chosen nothing. */
  private chooseNothing(): void {
    this.selection = null;
    this.preview.hide();
    this.highlight(null);
  }

  /** Moves the pointer end of the selection to a cell. */
  private reachTo(cell: Cell): void {
    const current = this.selection;
    const anchor = this.dragging && current ? current.anchor : cell;

    this.choose({ anchor, focus: cell });
  }

  private onKey(act: KeyAction): void {
    switch (act.kind) {
      case "close":
        this.options.onClose();
        return;
      case "tile":
        if (this.selection) {
          this.options.onTile(selectionRange(this.selection));
        }
        return;
      case "choose":
        this.choosePreset(act.grid);
        return;
      case "autotile":
        this.options.onAutotile(act.mode);
        return;
      case "move":
      case "grow":
        // A drag and the keyboard should not both be steering at once.
        this.dragging = false;
        this.choose(
          moveFocus(
            this.selection,
            act.to,
            this.currentGrid(),
            act.kind === "grow",
          ),
        );
        return;
    }
  }

  /**
   * Lights up the cells the chosen range covers. The grid stands in for the
   * screen, so it has to answer as directly as the preview does.
   *
   * Restyling a cell makes St work out its appearance again, and a selection
   * being dragged across a dense grid asks for that many times a second, so
   * only the cells that have actually changed are touched.
   */
  private highlight(range: CellRange | null): void {
    const chosen = range ? normalizeRange(this.currentGrid(), range) : null;
    const before = this.lit;
    this.lit = chosen;

    this.cells.forEach((line, row) => {
      line.forEach((cell, col) => {
        const now = covers(chosen, col, row);
        if (now === covers(before, col, row)) {
          return;
        }

        cell.set_style(now ? this.activeCellStyle : this.inactiveCellStyle);
      });
    });
  }

  private onPress = (
    _actor: imports.gi.Clutter.Actor,
    event: imports.gi.Clutter.Event,
  ): boolean => {
    if (event.get_button() !== PRIMARY_BUTTON) {
      return false;
    }

    const cell = this.cellUnder(event);
    this.pointerCell = cell;
    this.dragging = true;
    this.choose({ anchor: cell, focus: cell });

    return true;
  };

  private onMotion = (
    _actor: imports.gi.Clutter.Actor,
    event: imports.gi.Clutter.Event,
  ): boolean => {
    // Points outside the grid read as the cell nearest to them, which is what
    // keeps a drag alive when it strays. Merely pointing at something else in
    // the panel, the strip along the bottom say, is not choosing a cell.
    //
    // Crossing out of the grid puts the hover preview away, once. Motion that
    // was already outside says nothing new, so a choice made with the
    // keyboard while the pointer rests out here survives it.
    if (!this.dragging && !this.overGrid(event)) {
      if (this.pointerCell) {
        this.pointerCell = null;
        this.chooseNothing();
      }

      return true;
    }

    const cell = this.cellUnder(event);
    const seen = this.pointerCell;
    this.pointerCell = cell;

    // Movement only matters when there is a choice it could disturb. A hand
    // resting on the mouse jitters, and the grid often opens underneath the
    // pointer, so a choice already made has to survive both a movement within
    // one cell and the very first movement, which only says where the pointer
    // is. With nothing chosen there is nothing to protect, and any movement
    // is worth answering.
    if (
      this.selection &&
      (!seen || (seen.col === cell.col && seen.row === cell.row))
    ) {
      return true;
    }

    this.reachTo(cell);

    return true;
  };

  private onRelease = (
    _actor: imports.gi.Clutter.Actor,
    event: imports.gi.Clutter.Event,
  ): boolean => {
    // Only a release that finishes a choice this grid started counts. The
    // keyboard clears the drag as it takes over, so a button that comes up
    // afterwards has nothing left to commit.
    if (!this.dragging || event.get_button() !== PRIMARY_BUTTON) {
      return false;
    }

    // A press and release in the same cell is a click, which tiles that one
    // cell. Anywhere else and the pointer was dragged across a range.
    this.reachTo(this.cellUnder(event));
    this.dragging = false;

    if (this.selection) {
      this.options.onTile(selectionRange(this.selection));
    }

    return true;
  };

  private onLeave = (): boolean => {
    // A drag that strays outside the grid is still a drag: the pointer keeps
    // being reported here until the button comes up, and a point outside the
    // grid reads as the cell nearest to it. Only a pointer that leaves
    // without holding anything means the choice is off.
    if (this.dragging) {
      return true;
    }

    // Forgotten along with the choice, so that coming back in over the strip
    // does not read as having just crossed out of the grid.
    this.pointerCell = null;
    this.chooseNothing();

    return true;
  };
}
