/* GENERATED FILE - built from src/ by npm run build. Do not edit. */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  disable: () => disable,
  enable: () => enable,
  init: () => init
});
module.exports = __toCommonJS(extension_exports);

// src/coerce.ts
function toFinite(value) {
  return Number.isFinite(value) ? value : 0;
}
function toSize(value) {
  return Math.max(0, toFinite(value));
}
function toBoolean(value) {
  return value === true;
}
function toKeybinding(value) {
  return typeof value === "string" ? value : "";
}

// src/geometry.ts
var MAX_GAP_SHARE = 0.25;
function tracks(spans) {
  const usable = Array.isArray(spans) ? spans.filter((span) => Number.isFinite(span) && span > 0) : [];
  return usable.length > 0 ? usable : [1];
}
function trackCount(spans) {
  return tracks(spans).length;
}
function spanBefore(spans, index) {
  let total = 0;
  for (let i = 0; i < index && i < spans.length; i++) {
    total += spans[i];
  }
  return total;
}
function spanTotal(spans) {
  return spanBefore(spans, spans.length);
}
function clampIndex(value, count) {
  return Math.max(0, Math.min(Math.floor(toFinite(value)), count - 1));
}
function normalizeRange(grid, range) {
  const cols = trackCount(grid.cols);
  const rows = trackCount(grid.rows);
  const col = clampIndex(range.col, cols);
  const colEnd = clampIndex(range.colEnd, cols);
  const row = clampIndex(range.row, rows);
  const rowEnd = clampIndex(range.rowEnd, rows);
  return {
    col: Math.min(col, colEnd),
    colEnd: Math.max(col, colEnd),
    row: Math.min(row, rowEnd),
    rowEnd: Math.max(row, rowEnd)
  };
}
function clampGap(gap, budget) {
  return Math.max(0, Math.min(gap, Math.floor(budget)));
}
function fitEdgeGap(length, gap) {
  return clampGap(gap, length * MAX_GAP_SHARE / 2);
}
function fitTrackGap(length, count, gap) {
  if (count <= 1) {
    return gap;
  }
  return clampGap(gap, length * MAX_GAP_SHARE / (count - 1));
}
function trackBoundary(length, spans, gap, index) {
  const shared = length - gap * (spans.length - 1);
  return Math.round(
    spanBefore(spans, index) * shared / spanTotal(spans) + index * gap
  );
}
function trackSizes(length, spans, gap) {
  const sizes = tracks(spans);
  return sizes.map(
    (_2, index) => Math.max(
      1,
      trackBoundary(length, sizes, gap, index + 1) - gap - trackBoundary(length, sizes, gap, index)
    )
  );
}
function cellRangeToRect(area, grid, range, gaps) {
  const cols = tracks(grid.cols);
  const rows = tracks(grid.rows);
  const cells = normalizeRange({ cols, rows }, range);
  const bounds = {
    x: Math.round(toFinite(area.x)),
    y: Math.round(toFinite(area.y)),
    width: Math.max(0, Math.floor(toFinite(area.width))),
    height: Math.max(0, Math.floor(toFinite(area.height)))
  };
  const windowGap = Math.max(0, Math.floor(toFinite(gaps.window)));
  const edgeGap = Math.max(0, Math.floor(toFinite(gaps.edge)));
  const edge = Math.min(
    fitEdgeGap(bounds.width, edgeGap),
    fitEdgeGap(bounds.height, edgeGap)
  );
  const region = {
    x: bounds.x + edge,
    y: bounds.y + edge,
    width: Math.max(1, bounds.width - edge * 2),
    height: Math.max(1, bounds.height - edge * 2)
  };
  const gap = Math.min(
    fitTrackGap(region.width, cols.length, windowGap),
    fitTrackGap(region.height, rows.length, windowGap)
  );
  const left = trackBoundary(region.width, cols, gap, cells.col);
  const right = trackBoundary(region.width, cols, gap, cells.colEnd + 1);
  const top = trackBoundary(region.height, rows, gap, cells.row);
  const bottom = trackBoundary(region.height, rows, gap, cells.rowEnd + 1);
  return {
    x: region.x + left,
    y: region.y + top,
    width: Math.max(1, right - gap - left),
    height: Math.max(1, bottom - gap - top)
  };
}
function clamp(value, lowest, highest) {
  return Math.max(lowest, Math.min(value, Math.max(lowest, highest)));
}
function centerOn(size, target, bounds) {
  const width = Math.min(
    Math.max(1, Math.round(toFinite(size.width))),
    Math.max(1, Math.round(toFinite(bounds.width)))
  );
  const height = Math.min(
    Math.max(1, Math.round(toFinite(size.height))),
    Math.max(1, Math.round(toFinite(bounds.height)))
  );
  const left = toFinite(bounds.x);
  const top = toFinite(bounds.y);
  const centredX = toFinite(target.x) + (toFinite(target.width) - width) / 2;
  const centredY = toFinite(target.y) + (toFinite(target.height) - height) / 2;
  return {
    x: Math.round(clamp(centredX, left, left + toFinite(bounds.width) - width)),
    y: Math.round(clamp(centredY, top, top + toFinite(bounds.height) - height)),
    width,
    height
  };
}
function trackAt(offset, length, spans, spacing) {
  const point = toFinite(offset);
  const gap = Math.max(0, toFinite(spacing));
  const sizes = trackSizes(length, spans, gap);
  let edge = 0;
  for (let i = 0; i < sizes.length - 1; i++) {
    edge += sizes[i] + gap;
    if (point < edge - gap / 2) {
      return i;
    }
  }
  return sizes.length - 1;
}
function cellAt(x, y, box, grid, spacing = 0) {
  const cols = tracks(grid.cols);
  const rows = tracks(grid.rows);
  const width = Math.max(1, toFinite(box.width));
  const height = Math.max(1, toFinite(box.height));
  return {
    col: trackAt(toFinite(x) - toFinite(box.x), width, cols, spacing),
    row: trackAt(toFinite(y) - toFinite(box.y), height, rows, spacing)
  };
}
function selectionRange(selection) {
  return {
    col: selection.anchor.col,
    row: selection.anchor.row,
    colEnd: selection.focus.col,
    rowEnd: selection.focus.row
  };
}
var STEPS = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 }
};
function moveFocus(selection, direction, grid, extend) {
  const cols = trackCount(grid.cols);
  const rows = trackCount(grid.rows);
  if (!selection) {
    const first = { col: 0, row: 0 };
    return { anchor: first, focus: first };
  }
  const step = STEPS[direction];
  const focus = {
    col: clampIndex(selection.focus.col + step.col, cols),
    row: clampIndex(selection.focus.row + step.row, rows)
  };
  return { anchor: extend ? selection.anchor : focus, focus };
}
function sameRect(one, two) {
  return toFinite(one.x) === toFinite(two.x) && toFinite(one.y) === toFinite(two.y) && toFinite(one.width) === toFinite(two.width) && toFinite(one.height) === toFinite(two.height);
}
function coversFullGrid(grid, range) {
  const cells = normalizeRange(grid, range);
  return cells.col === 0 && cells.row === 0 && cells.colEnd === trackCount(grid.cols) - 1 && cells.rowEnd === trackCount(grid.rows) - 1;
}

// src/autotile.ts
function columns(rows) {
  return { cols: [1, 1], rows: new Array(Math.max(1, rows)).fill(1) };
}
function cell(col, row, colEnd = col, rowEnd = row) {
  return { col, row, colEnd, rowEnd };
}
function mainAndStack(side, count, area, gaps) {
  const stacked = count - 1;
  const grid = columns(stacked);
  const mainCol = side === "left" ? 0 : 1;
  const stackCol = 1 - mainCol;
  const rects = [
    cellRangeToRect(area, grid, cell(mainCol, 0, mainCol, stacked - 1), gaps)
  ];
  for (let row = 0; row < stacked; row++) {
    rects.push(cellRangeToRect(area, grid, cell(stackCol, row), gaps));
  }
  return rects;
}
function equal(side, count, area, gaps) {
  const rows = Math.ceil(count / 2);
  const grid = columns(rows);
  const leadRows = count % 2 === 1 ? 2 : 1;
  const leadCol = side === "left" ? 0 : 1;
  const farCol = 1 - leadCol;
  const rects = [
    cellRangeToRect(area, grid, cell(leadCol, 0, leadCol, leadRows - 1), gaps)
  ];
  let placed = 1;
  for (let row = 0; row < rows && placed < count; row++, placed++) {
    rects.push(cellRangeToRect(area, grid, cell(farCol, row), gaps));
  }
  for (let row = leadRows; row < rows && placed < count; row++, placed++) {
    rects.push(cellRangeToRect(area, grid, cell(leadCol, row), gaps));
  }
  return rects;
}
function autotileRects(mode, count, area, gaps) {
  const wanted = Math.floor(toFinite(count));
  if (wanted <= 0) {
    return [];
  }
  if (wanted === 1) {
    return [cellRangeToRect(area, { cols: [1], rows: [1] }, cell(0, 0), gaps)];
  }
  const side = mode.endsWith("left") ? "left" : "right";
  return mode.startsWith("equal") ? equal(side, wanted, area, gaps) : mainAndStack(side, wanted, area, gaps);
}

// src/preset.ts
var GRID_COUNT = 4;
var MAX_TRACKS = 16;
function equalTracks(count) {
  const wanted = Math.max(1, Math.min(MAX_TRACKS, Math.floor(toFinite(count))));
  return new Array(wanted).fill(1);
}
function parseAxis(text) {
  const parts = text.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > MAX_TRACKS) {
    return null;
  }
  const sizes = parts.map(Number);
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) {
    return null;
  }
  if (sizes.length === 1) {
    const count = sizes[0];
    if (!Number.isInteger(count) || count > MAX_TRACKS) {
      return null;
    }
    return equalTracks(count);
  }
  return sizes;
}
function parseLayout(text) {
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
function uniformLayout(cols, rows) {
  return `${equalTracks(cols).length}x${equalTracks(rows).length}`;
}
function toPreset(cols, rows, layout, name, tooltip) {
  const asked = parseLayout(layout);
  const grid = asked ?? { cols: equalTracks(cols), rows: equalTracks(rows) };
  return {
    grid,
    label: typeof name === "string" && name.trim().length > 0 ? name.trim() : `${tracks(grid.cols).length}x${tracks(grid.rows).length}`,
    tooltip: typeof tooltip === "string" ? tooltip.trim() : ""
  };
}

// src/config.ts
var Settings = imports.ui.settings;
var Config = class {
  /**
   * @param uuid the extension uuid, used to find the settings schema
   * @param onHotkeyChanged called whenever the configured hotkey changes
   * @param onUsePushTileChanged called when Cinnamon's tiling shortcuts are
   *   taken over or handed back
   */
  constructor(uuid2, onHotkeyChanged, onUsePushTileChanged) {
    // Binding replaces each of these with an accessor onto the stored setting.
    // The values assigned here are the fallbacks Tiler runs with if a binding
    // fails, which Cinnamon does report but does not treat as fatal. They are
    // readonly because the accessors Cinnamon installs also write: assigning to
    // one of these fields would silently rewrite the user's settings.
    this.rawHotkey = "";
    this.rawUsePushTile = true;
    this.rawCenterOnWindow = false;
    this.rawTileDialogs = false;
    this.rawTileToolboxes = false;
    this.rawShowAutotile = true;
    this.rawWindowGap = 0;
    this.rawEdgeGap = 0;
    this.rawReservedScope = "all";
    this.rawReservedTop = 0;
    this.rawReservedBottom = 0;
    this.rawReservedLeft = 0;
    this.rawReservedRight = 0;
    this.settings = new Settings.ExtensionSettings(this, uuid2);
    this.settings.bind("hotkey", "rawHotkey", onHotkeyChanged);
    this.settings.bind("use-push-tile", "rawUsePushTile", onUsePushTileChanged);
    this.settings.bind("center-on-window", "rawCenterOnWindow");
    this.settings.bind("tile-dialogs", "rawTileDialogs");
    this.settings.bind("tile-toolboxes", "rawTileToolboxes");
    this.settings.bind("show-autotile", "rawShowAutotile");
    this.settings.bind("window-gap", "rawWindowGap");
    this.settings.bind("edge-gap", "rawEdgeGap");
    this.settings.bind("reserved-scope", "rawReservedScope");
    this.settings.bind("reserved-top", "rawReservedTop");
    this.settings.bind("reserved-bottom", "rawReservedBottom");
    this.settings.bind("reserved-left", "rawReservedLeft");
    this.settings.bind("reserved-right", "rawReservedRight");
    for (let i = 1; i <= GRID_COUNT; i++) {
      const rewrite = () => this.rewriteLayout(i);
      this.settings.bind(`grid-${i}-cols`, `rawGrid${i}Cols`, rewrite);
      this.settings.bind(`grid-${i}-rows`, `rawGrid${i}Rows`, rewrite);
    }
  }
  /** Puts the layout back in step with the numbers above it. */
  rewriteLayout(index) {
    this.settings.setValue(
      `grid-${index}-layout`,
      uniformLayout(
        this.settings.getValue(`grid-${index}-cols`),
        this.settings.getValue(`grid-${index}-rows`)
      )
    );
  }
  /**
   * Which grid was last picked. Kept so that opening Tiler gives back the
   * grid it was left showing rather than starting over every time.
   */
  get lastGrid() {
    const stored = this.settings.getValue("last-grid");
    const index = Math.floor(toFinite(stored));
    return index >= 0 && index < GRID_COUNT ? index : 0;
  }
  set lastGrid(index) {
    this.settings.setValue("last-grid", index);
  }
  /** The grids the user has set up, in the order they appear. */
  get presets() {
    const presets = [];
    for (let i = 1; i <= GRID_COUNT; i++) {
      presets.push(
        toPreset(
          this.settings.getValue(`grid-${i}-cols`),
          this.settings.getValue(`grid-${i}-rows`),
          this.settings.getValue(`grid-${i}-layout`),
          this.settings.getValue(`grid-${i}-name`),
          this.settings.getValue(`grid-${i}-tooltip`)
        )
      );
    }
    return presets;
  }
  get hotkey() {
    return toKeybinding(this.rawHotkey);
  }
  get reservedScope() {
    return this.rawReservedScope === "primary" ? "primary" : "all";
  }
  /** Whether Cinnamon's own tiling shortcuts are placed Tiler's way. */
  get usePushTile() {
    return toBoolean(this.rawUsePushTile);
  }
  get showAutotile() {
    return toBoolean(this.rawShowAutotile);
  }
  get centerOnWindow() {
    return toBoolean(this.rawCenterOnWindow);
  }
  get windowFilter() {
    return {
      dialogs: toBoolean(this.rawTileDialogs),
      toolboxes: toBoolean(this.rawTileToolboxes)
    };
  }
  get gaps() {
    return {
      window: toSize(this.rawWindowGap),
      edge: toSize(this.rawEdgeGap)
    };
  }
  get reserved() {
    return {
      top: toSize(this.rawReservedTop),
      bottom: toSize(this.rawReservedBottom),
      left: toSize(this.rawReservedLeft),
      right: toSize(this.rawReservedRight)
    };
  }
  destroy() {
    this.settings.finalize();
  }
};

// src/i18n.ts
var Gettext = imports.gettext;
var GLib = imports.gi.GLib;
var domain = "";
function initTranslations(uuid2) {
  domain = uuid2;
  Gettext.bindtextdomain(uuid2, GLib.get_home_dir() + "/.local/share/locale");
}
function _(text) {
  return domain ? Gettext.dgettext(domain, text) : text;
}

// src/theme.ts
var Gtk = imports.gi.Gtk;
var GObject = imports.gi.GObject;
var FALLBACK = {
  surface: { red: 40, green: 42, blue: 48 },
  text: { red: 235, green: 237, blue: 240 },
  accent: { red: 74, green: 144, blue: 217 },
  onAccent: { red: 255, green: 255, blue: 255 }
};
function windowColours() {
  try {
    const context = new Gtk.StyleContext();
    const path = new Gtk.WidgetPath();
    path.append_type(GObject.type_from_name("GtkWindow"));
    context.set_path(path);
    const read = (name, fallback) => {
      const [found, colour] = context.lookup_color(name);
      if (!found) {
        return fallback;
      }
      return {
        red: Math.round(colour.red * 255),
        green: Math.round(colour.green * 255),
        blue: Math.round(colour.blue * 255)
      };
    };
    return {
      surface: read("theme_bg_color", FALLBACK.surface),
      text: read("theme_fg_color", FALLBACK.text),
      accent: read("theme_selected_bg_color", FALLBACK.accent),
      onAccent: read("theme_selected_fg_color", FALLBACK.onAccent)
    };
  } catch {
    return FALLBACK;
  }
}
function rgba(colour, alpha) {
  return `rgba(${colour.red}, ${colour.green}, ${colour.blue}, ${alpha})`;
}

// src/pushtile.ts
var PUSH_GRID = { cols: [1, 1], rows: [1, 1] };
var ASKED = {
  left: "left",
  right: "right",
  up: "top",
  down: "bottom"
};
var NEXT = {
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
  lrc: { left: "bottom", right: "lrc", top: "right", bottom: "lrc" }
};
var RANGES = {
  none: null,
  left: { col: 0, row: 0, colEnd: 0, rowEnd: 1 },
  right: { col: 1, row: 0, colEnd: 1, rowEnd: 1 },
  top: { col: 0, row: 0, colEnd: 1, rowEnd: 0 },
  bottom: { col: 0, row: 1, colEnd: 1, rowEnd: 1 },
  ulc: { col: 0, row: 0, colEnd: 0, rowEnd: 0 },
  llc: { col: 0, row: 1, colEnd: 0, rowEnd: 1 },
  urc: { col: 1, row: 0, colEnd: 1, rowEnd: 0 },
  lrc: { col: 1, row: 1, colEnd: 1, rowEnd: 1 },
  maximized: { col: 0, row: 0, colEnd: 1, rowEnd: 1 }
};
var MUFFIN_MODES = [
  "none",
  "left",
  "right",
  "ulc",
  "llc",
  "urc",
  "lrc",
  "top",
  "bottom",
  "maximized"
];
function nextTileMode(direction, current) {
  const asked = ASKED[direction];
  const rules = NEXT[current];
  return asked && rules ? rules[asked] : current;
}
function tileModeRange(mode) {
  const range = RANGES[mode];
  return range ? { ...range } : null;
}
function tileModeOf(muffinTileMode) {
  const index = Math.trunc(Number(muffinTileMode));
  return MUFFIN_MODES[index] ?? "none";
}
function readPushState(maximized, frame, noted, managerMode) {
  if (maximized) {
    return { mode: "maximized", standing: noted !== null };
  }
  if (noted && sameRect(frame, noted.placed)) {
    return { mode: noted.mode, standing: true };
  }
  return { mode: managerMode, standing: false };
}

// src/winops.ts
var Cinnamon = imports.gi.Cinnamon;
var Main = imports.ui.main;
var Meta = imports.gi.Meta;
function isTileableType(type, filter) {
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
function isResizeable(window) {
  return !!window.resizeable;
}
function getTargetWindow(filter) {
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
function listTileableWindows(filter, monitorIndex) {
  const workspace = global.workspace_manager.get_active_workspace();
  const all = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
  const seen = /* @__PURE__ */ new Set();
  const windows = [];
  for (const window of all) {
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
function monitorOf(window) {
  return window.get_monitor();
}
function isMaximized(window) {
  return !!window.get_maximized();
}
function tileModeOfWindow(window) {
  const mode = window.tile_mode;
  return tileModeOf(typeof mode === "number" ? mode : 0);
}
function titleOf(window) {
  return window.get_title() || "";
}
function appOf(window) {
  return Cinnamon.WindowTracker.get_default().get_window_app(window) || null;
}
function frameOf(window) {
  const frame = window.get_frame_rect();
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height
  };
}
function isPrimaryMonitor(monitorIndex) {
  return monitorIndex === Main.layoutManager.primaryIndex;
}
function monitorBounds(monitorIndex) {
  const monitor = Main.layoutManager.monitors[monitorIndex];
  if (!monitor) {
    return null;
  }
  return {
    x: monitor.x,
    y: monitor.y,
    width: monitor.width,
    height: monitor.height
  };
}
function workAreaOf(window, monitorIndex) {
  const area = window.get_work_area_for_monitor(monitorIndex);
  if (!area) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}
function release(window) {
  if (window.is_fullscreen()) {
    window.unmake_fullscreen();
  }
  if (window.get_maximized()) {
    window.unmaximize(Meta.MaximizeFlags.BOTH);
  }
}
function releaseWindow(window) {
  release(window);
}
function tile(window, rect, maximize) {
  release(window);
  if (maximize) {
    window.move_frame(true, rect.x, rect.y);
    window.maximize(Meta.MaximizeFlags.BOTH);
    return;
  }
  window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
  window.move_frame(true, rect.x, rect.y);
}
var PUSH_KEYS = [
  { name: "push-tile-left", direction: "left" },
  { name: "push-tile-right", direction: "right" },
  { name: "push-tile-up", direction: "up" },
  { name: "push-tile-down", direction: "down" }
];
function takePushTileKeys(onPush) {
  for (const { name, direction } of PUSH_KEYS) {
    Meta.keybindings_set_custom_handler(name, (_display, window) => {
      onPush(direction, window ?? null);
    });
  }
}
function releasePushTileKeys() {
  for (const { name } of PUSH_KEYS) {
    Meta.keybindings_set_custom_handler(name, null);
  }
}

// src/overlay.ts
var Main2 = imports.ui.main;
var St = imports.gi.St;
var Pango = imports.gi.Pango;
var Tooltips = imports.ui.tooltips;
var PANEL_WIDTH = 320;
var CELL_SPACING = 4;
var HEADER_ICON = 16;
var DEFAULT_SHAPE = 9 / 16;
var MIN_CHIP = 1;
var PRIMARY_BUTTON = 1;
var BORDER = {
  panel: 1,
  cell: 1,
  preview: 2
};
var OPACITY = {
  panelBorder: 0.25,
  cellFill: 0.15,
  cellBorder: 0.25,
  chipHoverFill: 0.3,
  chosenFill: 0.75,
  chosenBorder: 0.95,
  previewFill: 0.22,
  previewBorder: 0.85,
  text: 0.85,
  textBright: 0.95
};
var KEYS = [
  { name: "tiler-close", binding: "Escape", act: { kind: "close" } },
  // "::" separates alternative bindings for one action, as Cinnamon writes
  // its own shortcuts.
  {
    name: "tiler-commit",
    binding: "Return::KP_Enter::space",
    act: { kind: "tile" }
  },
  { name: "tiler-up", binding: "Up", act: { kind: "move", to: "up" } },
  { name: "tiler-down", binding: "Down", act: { kind: "move", to: "down" } },
  { name: "tiler-left", binding: "Left", act: { kind: "move", to: "left" } },
  { name: "tiler-right", binding: "Right", act: { kind: "move", to: "right" } },
  {
    name: "tiler-grow-up",
    binding: "<Shift>Up",
    act: { kind: "grow", to: "up" }
  },
  {
    name: "tiler-grow-down",
    binding: "<Shift>Down",
    act: { kind: "grow", to: "down" }
  },
  {
    name: "tiler-grow-left",
    binding: "<Shift>Left",
    act: { kind: "grow", to: "left" }
  },
  {
    name: "tiler-grow-right",
    binding: "<Shift>Right",
    act: { kind: "grow", to: "right" }
  },
  // One number key per grid, so that however many grids there are, there is
  // a key for each of them.
  ...Array.from({ length: GRID_COUNT }, (_unused, index) => ({
    name: `tiler-grid-${index + 1}`,
    binding: `${index + 1}`,
    act: { kind: "choose", grid: index }
  }))
];
var AUTOTILE_KEYS = [
  {
    name: "tiler-auto-main-left",
    binding: "l",
    act: { kind: "autotile", mode: "main-left" }
  },
  {
    name: "tiler-auto-main-right",
    binding: "r",
    act: { kind: "autotile", mode: "main-right" }
  },
  {
    name: "tiler-auto-equal-left",
    binding: "<Shift>l",
    act: { kind: "autotile", mode: "equal-left" }
  },
  {
    name: "tiler-auto-equal-right",
    binding: "<Shift>r",
    act: { kind: "autotile", mode: "equal-right" }
  }
];
function measure(value) {
  return toFinite(value);
}
function covers(range, col, row) {
  return range !== null && col >= range.col && col <= range.colEnd && row >= range.row && row <= range.rowEnd;
}
var Overlay = class {
  constructor(options) {
    this.chips = [];
    /** Every cell of the grid, by row then column, so they can be lit up. */
    this.cells = [];
    /** Which cells are lit at the moment, so only the changes are redrawn. */
    this.lit = null;
    /** What is currently chosen, by either hand, or null when nothing is. */
    this.selection = null;
    /** Whether the pointer is holding a selection open. */
    this.dragging = false;
    /**
     * The cell the pointer was last seen over. Movement is only a choice when
     * it carries the pointer from one cell to another, so this is what it gets
     * compared against rather than whatever happens to be selected.
     */
    this.pointerCell = null;
    this.closed = false;
    this.onPress = (_actor, event) => {
      if (event.get_button() !== PRIMARY_BUTTON) {
        return false;
      }
      if (!this.overGrid(event)) {
        return true;
      }
      const cell2 = this.cellUnder(event);
      this.pointerCell = cell2;
      this.dragging = true;
      this.choose({ anchor: cell2, focus: cell2 });
      return true;
    };
    this.onMotion = (_actor, event) => {
      if (!this.dragging && !this.overGrid(event)) {
        if (this.pointerCell) {
          this.pointerCell = null;
          this.chooseNothing();
        }
        return true;
      }
      const cell2 = this.cellUnder(event);
      const seen = this.pointerCell;
      this.pointerCell = cell2;
      if (this.selection && (!seen || seen.col === cell2.col && seen.row === cell2.row)) {
        return true;
      }
      this.reachTo(cell2);
      return true;
    };
    this.onRelease = (_actor, event) => {
      if (!this.dragging || event.get_button() !== PRIMARY_BUTTON) {
        return false;
      }
      this.reachTo(this.cellUnder(event));
      this.dragging = false;
      if (this.selection) {
        this.options.onTile(selectionRange(this.selection));
      }
      return true;
    };
    this.onLeave = () => {
      if (this.dragging) {
        return true;
      }
      this.pointerCell = null;
      this.chooseNothing();
      return true;
    };
    this.options = options;
    this.chosen = options.chosen;
    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    const spacing = Math.max(1, Math.round(CELL_SPACING * scale));
    this.scale = scale;
    this.spacing = spacing;
    const colours = windowColours();
    this.inactiveCellStyle = `background-color: ${rgba(colours.text, OPACITY.cellFill)}; border: ${BORDER.cell}px solid ${rgba(colours.text, OPACITY.cellBorder)};`;
    this.activeCellStyle = `background-color: ${rgba(colours.accent, OPACITY.chosenFill)}; border: ${BORDER.cell}px solid ${rgba(colours.accent, OPACITY.chosenBorder)};`;
    this.chipStyle = `background-color: ${rgba(colours.text, OPACITY.cellFill)}; border: ${BORDER.cell}px solid ${rgba(colours.text, OPACITY.cellBorder)}; color: ${rgba(colours.text, OPACITY.text)};`;
    this.hoverChipStyle = `background-color: ${rgba(colours.text, OPACITY.chipHoverFill)}; border: ${BORDER.cell}px solid ${rgba(colours.text, OPACITY.cellBorder)}; color: ${rgba(colours.text, OPACITY.textBright)};`;
    this.chosenChipStyle = `background-color: ${rgba(colours.accent, OPACITY.chosenFill)}; border: ${BORDER.cell}px solid ${rgba(colours.accent, OPACITY.chosenBorder)}; color: ${rgba(colours.onAccent, 1)};`;
    this.elsewhere = new St.Widget({ reactive: true });
    this.elsewhere.set_position(0, 0);
    this.elsewhere.set_size(global.screen_width, global.screen_height);
    this.elsewhere.connect("button-press-event", () => {
      options.onClose();
      return true;
    });
    this.preview = new St.Widget({ style_class: "tiler-preview" });
    this.preview.set_style(
      `background-color: ${rgba(colours.accent, OPACITY.previewFill)}; border: ${BORDER.preview}px solid ${rgba(colours.accent, OPACITY.previewBorder)};`
    );
    this.preview.hide();
    this.header = this.buildHeader(colours.text);
    this.grid = this.buildGrid();
    this.strip = this.buildStrip();
    this.actions = options.autotile ? this.buildActions() : null;
    this.panel = new St.BoxLayout({
      style_class: "tiler-panel",
      vertical: true,
      reactive: true
    });
    this.panel.set_style(
      `background-color: ${rgba(colours.surface, 1)}; border: ${BORDER.panel}px solid ${rgba(colours.text, OPACITY.panelBorder)};`
    );
    this.panel.add_child(this.header);
    this.panel.add_child(this.grid);
    this.panel.add_child(this.strip);
    if (this.actions) {
      this.panel.add_child(this.actions);
    }
    Main2.layoutManager.addChrome(this.elsewhere, { visibleInFullscreen: true });
    Main2.layoutManager.addChrome(this.preview, { visibleInFullscreen: true });
    Main2.layoutManager.addChrome(this.panel, { visibleInFullscreen: true });
    this.place();
    this.listen();
    for (const key of this.keys()) {
      Main2.keybindingManager.addHotKey(
        key.name,
        key.binding,
        () => this.onKey(key.act)
      );
    }
  }
  /** The keys this overlay answers to, given what it is showing. */
  keys() {
    return this.options.autotile ? [...KEYS, ...AUTOTILE_KEYS] : KEYS;
  }
  /** Takes the overlay off screen and releases everything it holds. */
  destroy() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const key of this.keys()) {
      Main2.keybindingManager.removeHotKey(key.name);
    }
    Main2.layoutManager.removeChrome(this.panel);
    Main2.layoutManager.removeChrome(this.preview);
    Main2.layoutManager.removeChrome(this.elsewhere);
    this.panel.destroy();
    this.preview.destroy();
    this.elsewhere.destroy();
  }
  /** The one width the panel's rows agree on: grid, chips and header alike. */
  panelWidth() {
    return Math.round(PANEL_WIDTH * this.scale);
  }
  /**
   * Builds the grid, sized so that it has the same shape as the area being
   * tiled into. A grid that looks like the screen is easier to aim at.
   */
  buildGrid() {
    const { area } = this.options;
    const { spacing } = this;
    const grid = this.currentGrid();
    const cols = trackCount(grid.cols);
    const rows = trackCount(grid.rows);
    const width = this.panelWidth();
    const shape = area.width > 0 ? area.height / area.width : DEFAULT_SHAPE;
    const height = Math.round(width * shape);
    const colSizes = trackSizes(width, grid.cols, spacing);
    const rowSizes = trackSizes(height, grid.rows, spacing);
    const table = new St.BoxLayout({ vertical: true });
    table.set_style(`spacing: ${spacing}px;`);
    this.cells = [];
    for (let row = 0; row < rows; row++) {
      const line = new St.BoxLayout();
      line.set_style(`spacing: ${spacing}px;`);
      const built = [];
      for (let col = 0; col < cols; col++) {
        const cell2 = new St.Widget({ style_class: "tiler-cell" });
        cell2.set_style(this.inactiveCellStyle);
        cell2.set_size(colSizes[col], rowSizes[row]);
        line.add_child(cell2);
        built.push(cell2);
      }
      this.cells.push(built);
      table.add_child(line);
    }
    return table;
  }
  /** The grid currently on show. */
  currentGrid() {
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
  buildHeader(text) {
    const header = new St.BoxLayout({
      style_class: "tiler-header",
      reactive: true
    });
    header.set_style(`spacing: ${this.spacing * 2}px;`);
    header.set_width(this.panelWidth());
    header.connect("button-press-event", () => true);
    header.connect("button-release-event", () => true);
    const app2 = appOf(this.options.window);
    if (app2) {
      header.add_child(
        app2.create_icon_texture_for_window(
          Math.round(HEADER_ICON * this.scale),
          this.options.window
        )
      );
    }
    const title = new St.Label({ text: titleOf(this.options.window) });
    title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    title.set_style(`color: ${rgba(text, OPACITY.text)};`);
    header.add_child(title);
    return header;
  }
  /** How wide each of `count` chips comes out across the panel. */
  chipWidth(count) {
    const width = this.panelWidth();
    return Math.max(
      MIN_CHIP,
      Math.round((width - this.spacing * (count - 1)) / count)
    );
  }
  /**
   * A chip: a small labelled button, as both rows under the grid draw them.
   * A label too long for its chip is cut rather than allowed to stretch the
   * row, with the tooltip there to say the whole of it.
   */
  makeChip(label, width, tooltip) {
    const text = new St.Label({ text: label });
    text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    const chip = new St.Button({
      style_class: "tiler-chip",
      reactive: true,
      track_hover: true
    });
    chip.set_child(text);
    chip.set_width(width);
    if (tooltip) {
      new Tooltips.Tooltip(chip, tooltip);
    }
    return chip;
  }
  /** Builds the strip of grids to pick from. */
  buildStrip() {
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
  buildActions() {
    const row = new St.BoxLayout({ style_class: "tiler-actions" });
    row.set_style(`spacing: ${this.spacing}px;`);
    const arrangements = [
      {
        label: _("Main Left"),
        tooltip: _(
          "The focused window fills the left half, and the rest stack on the right."
        ),
        mode: "main-left"
      },
      {
        label: _("Main Right"),
        tooltip: _(
          "The focused window fills the right half, and the rest stack on the left."
        ),
        mode: "main-right"
      },
      {
        label: _("Equal Left"),
        tooltip: _(
          "Every window shares two equal columns, led from the top left."
        ),
        mode: "equal-left"
      },
      {
        label: _("Equal Right"),
        tooltip: _(
          "Every window shares two equal columns, led from the top right."
        ),
        mode: "equal-right"
      }
    ];
    const each = this.chipWidth(arrangements.length);
    for (const arrangement of arrangements) {
      const chip = this.makeChip(arrangement.label, each, arrangement.tooltip);
      chip.set_style(this.chipStyle);
      chip.connect(
        "notify::hover",
        () => chip.set_style(chip.hover ? this.hoverChipStyle : this.chipStyle)
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
  dressChip(index) {
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
  dressChips() {
    this.chips.forEach((_chip, index) => this.dressChip(index));
  }
  /**
   * Shows a different grid, in place. The choice is dropped along with the
   * old grid: cells of the one do not answer to cells of the other.
   */
  choosePreset(index) {
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
    this.panel.insert_child_below(this.grid, this.strip);
    this.dressChips();
    this.place();
  }
  /** Centres the grid over whatever it was told to sit on. */
  place() {
    const [, preferredWidth] = this.panel.get_preferred_width(-1);
    const width = measure(preferredWidth);
    const [, preferredHeight] = this.panel.get_preferred_height(width);
    const box = centerOn(
      { width, height: measure(preferredHeight) },
      this.options.anchor,
      this.options.bounds
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
  listen() {
    this.panel.connect("button-press-event", this.onPress);
    this.panel.connect("motion-event", this.onMotion);
    this.panel.connect("button-release-event", this.onRelease);
    this.panel.connect("leave-event", this.onLeave);
  }
  /** The box the grid occupies on screen, for turning points into cells. */
  gridBox() {
    const [x, y] = this.grid.get_transformed_position();
    const [width, height] = this.grid.get_transformed_size();
    return {
      x: measure(x),
      y: measure(y),
      width: measure(width),
      height: measure(height)
    };
  }
  /** Whether a point is over the grid itself rather than elsewhere. */
  overGrid(event) {
    const [x, y] = event.get_coords();
    const box = this.gridBox();
    return x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height;
  }
  cellUnder(event) {
    const [x, y] = event.get_coords();
    return cellAt(x, y, this.gridBox(), this.currentGrid(), this.spacing);
  }
  /** Chooses a range, and shows what choosing it would do. */
  choose(selection) {
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
  chooseNothing() {
    this.selection = null;
    this.preview.hide();
    this.highlight(null);
  }
  /** Moves the pointer end of the selection to a cell. */
  reachTo(cell2) {
    const current = this.selection;
    const anchor = this.dragging && current ? current.anchor : cell2;
    this.choose({ anchor, focus: cell2 });
  }
  onKey(act) {
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
        this.dragging = false;
        this.choose(
          moveFocus(
            this.selection,
            act.to,
            this.currentGrid(),
            act.kind === "grow"
          )
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
  highlight(range) {
    const chosen = range ? normalizeRange(this.currentGrid(), range) : null;
    const before = this.lit;
    this.lit = chosen;
    this.cells.forEach((line, row) => {
      line.forEach((cell2, col) => {
        const now = covers(chosen, col, row);
        if (now === covers(before, col, row)) {
          return;
        }
        cell2.set_style(now ? this.activeCellStyle : this.inactiveCellStyle);
      });
    });
  }
};

// src/workarea.ts
function hasReserved(reserved) {
  if (!reserved) {
    return false;
  }
  return reserved.top > 0 || reserved.bottom > 0 || reserved.left > 0 || reserved.right > 0;
}
function getUsableArea(workArea, reserved) {
  const left = workArea.x + (reserved?.left ?? 0);
  const top = workArea.y + (reserved?.top ?? 0);
  const right = workArea.x + workArea.width - (reserved?.right ?? 0);
  const bottom = workArea.y + workArea.height - (reserved?.bottom ?? 0);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

// src/app.ts
var Main3 = imports.ui.main;
var SignalManager = imports.misc.signalManager;
var HOTKEY_NAME = "tiler-tile";
var UNBOUND = "::";
var MIN_TILE_AREA = 250;
var App = class {
  constructor(uuid2) {
    this.signals = new SignalManager.SignalManager(null);
    this.hotkeyRegistered = false;
    this.pushTileHeld = false;
    this.session = null;
    // Keyed by the window, so a window that closes takes its note with it.
    this.pushed = /* @__PURE__ */ new WeakMap();
    /**
     * Takes Cinnamon's tiling shortcuts over, or gives them back, to match the
     * setting. Held is tracked so that handing them back is only ever done from
     * having taken them, whatever order the settings arrive in.
     */
    this.syncPushTileKeys = () => {
      if (!this.config.usePushTile) {
        this.releasePushTile();
        return;
      }
      if (!this.pushTileHeld) {
        takePushTileKeys(this.onPush);
        this.pushTileHeld = true;
      }
    };
    this.registerHotkey = () => {
      this.removeHotkey();
      const binding = this.config.hotkey;
      if (!binding || binding === UNBOUND) {
        return;
      }
      this.hotkeyRegistered = Main3.keybindingManager.addHotKey(
        HOTKEY_NAME,
        binding,
        this.onHotkey
      );
    };
    /**
     * Takes note of a different grid being picked. The session carries it so
     * that what gets tiled is the grid that was on screen, and so that closing
     * can write down where the user left off.
     */
    this.onChoose = (index) => {
      const session = this.session;
      if (!session) {
        return;
      }
      const preset = session.presets[index];
      if (!preset) {
        return;
      }
      session.chosen = index;
      session.grid = preset.grid;
    };
    /** Takes the grid off screen, if it is up. */
    this.closeOverlay = () => {
      if (!this.session) {
        return;
      }
      const { overlay, chosen } = this.session;
      this.session = null;
      overlay.destroy();
      this.config.lastGrid = chosen;
    };
    this.onHotkey = () => {
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
        onClose: this.closeOverlay
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
        overlay
      };
    };
    /**
     * Rearranges every window the filter admits, all at once. The windows are
     * gathered fresh, since some may have come or gone while the grid was up,
     * but they are placed into the area and spacing this session was opened
     * with, like any other placement. The grid's own window leads when it is
     * still among them; otherwise the most recent one does.
     */
    this.onAutotile = (mode) => {
      const session = this.takeSession();
      if (!session) {
        return;
      }
      const windows = listTileableWindows(
        this.config.windowFilter,
        session.monitorIndex
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
      const fillsArea = this.fillsWholeArea(
        windows.length === 1,
        session.gaps,
        session.reserved
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
    this.onPush = (direction, window) => {
      if (!window || !isResizeable(window)) {
        return;
      }
      this.closeOverlay();
      const noted = this.pushed.get(window) ?? null;
      const { mode: current, standing } = readPushState(
        isMaximized(window),
        frameOf(window),
        noted,
        tileModeOfWindow(window)
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
      if (!record) {
        releaseWindow(window);
      }
      const saved = record?.saved ?? frameOf(window);
      const gaps = this.config.gaps;
      const rect = cellRangeToRect(area, PUSH_GRID, range, gaps);
      const fillsArea = this.fillsWholeArea(next === "maximized", gaps, reserved);
      this.placeWindow(window, rect, fillsArea);
      this.pushed.set(window, { mode: next, saved, placed: frameOf(window) });
    };
    this.onTile = (range) => {
      const session = this.takeSession();
      if (!session) {
        return;
      }
      const window = getTargetWindow(this.config.windowFilter);
      if (window !== session.window) {
        return;
      }
      const { gaps, grid } = session;
      const rect = cellRangeToRect(session.area, grid, range, gaps);
      const fillsArea = this.fillsWholeArea(
        coversFullGrid(grid, range),
        gaps,
        session.reserved
      );
      this.placeWindow(window, rect, fillsArea);
    };
    this.config = new Config(uuid2, this.registerHotkey, this.syncPushTileKeys);
    this.registerHotkey();
    this.syncPushTileKeys();
    this.signals.connect(
      Main3.layoutManager,
      "monitors-changed",
      this.closeOverlay
    );
  }
  destroy() {
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
  placeWindow(window, rect, maximize) {
    tile(window, rect, maximize);
    this.pushed.delete(window);
  }
  releasePushTile() {
    if (!this.pushTileHeld) {
      return;
    }
    releasePushTileKeys();
    this.pushTileHeld = false;
  }
  removeHotkey() {
    if (!this.hotkeyRegistered) {
      return;
    }
    Main3.keybindingManager.removeHotKey(HOTKEY_NAME);
    this.hotkeyRegistered = false;
  }
  /** Reserved space for a monitor, or null when the scope excludes it. */
  reservedFor(monitorIndex) {
    if (this.config.reservedScope === "primary" && !isPrimaryMonitor(monitorIndex)) {
      return null;
    }
    return this.config.reserved;
  }
  /**
   * The area a window may be tiled into on its monitor, with the reserved
   * space that shaped it, or null when that leaves too little to tile into.
   */
  usableAreaFor(window) {
    const monitorIndex = monitorOf(window);
    const reserved = this.reservedFor(monitorIndex);
    const area = getUsableArea(workAreaOf(window, monitorIndex), reserved);
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
  fillsWholeArea(covers2, gaps, reserved) {
    return covers2 && gaps.edge === 0 && !hasReserved(reserved);
  }
  /** Ends the session and hands back what it was: how every commit begins. */
  takeSession() {
    const session = this.session;
    this.closeOverlay();
    return session;
  }
};

// src/extension.ts
/*
 * @license
 * Tiler - Grid-based window tiling for Cinnamon
 * Copyright (C) 2026 Josh Ellithorpe
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or (at your
 * option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program. If not, see <https://www.gnu.org/licenses/>.
 */
var app = null;
var uuid = "";
function init(meta) {
  uuid = meta.uuid;
  initTranslations(uuid);
}
function enable() {
  if (app) {
    return;
  }
  app = new App(uuid);
}
function disable() {
  if (app) {
    app.destroy();
    app = null;
  }
}
