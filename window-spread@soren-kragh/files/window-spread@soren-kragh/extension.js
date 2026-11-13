/* ==========================================================================
   WINDOW SPREAD: Cinnamon extension (6.0 to 6.8)
   ==========================================================================
   Replaces the window arrangement of Cinnamon's "Show all windows" view (Scale),
   and of the windows inside each workspace in "Show all workspaces" (Expo), with
   the layout engine in spreadLayout.js. Everything else about the views stays
   Cinnamon's own: animations, window titles, close buttons, clicking a window.

   How it hooks in (verified against Cinnamon 6.0.5, js/ui/workspace.js)
     The Scale view has one WorkspaceMonitor per monitor and workspace. Its
     positionWindows() asks _computeAllWindowSlots(n) for one "slot" per window
     (slot i for the i-th window in its list) and fits each window into its slot
     with _computeWindowLayout(). Cinnamon's own version ignores window positions
     and fills a grid in stacking order.
     This extension replaces two methods of WorkspaceMonitor while enabled:
       _computeAllWindowSlots  returns, for each window, a slot exactly the size of
                               its thumbnail from the engine plus Cinnamon's
                               decorations (close button, title), so Cinnamon's own
                               fitting code puts the thumbnail exactly there.
       selectAnotherWindow     arrow keys move to the nearest thumbnail in that
                               direction instead of along grid columns.
     Both fall back to Cinnamon's original code if anything goes wrong, so the view
     keeps working even if this extension fails, and both use the original when Show all
     windows is switched off in the settings.

   Cinnamon versions: written for 6.0 and checked against the source of 6.0 to 6.8. In
   6.8, WorkspaceMonitor became a class and extensions are loaded by GJS's native
   importer; the methods used here and their slot format are unchanged.

   Show all workspaces (Expo), js/ui/expoThumbnail.js
     Each workspace thumbnail is an ExpoWorkspaceThumbnail; its overviewModeOn() arranges
     that workspace's windows (on hover, window changes, or for all thumbnails at once),
     with the grid calculation written inline. So this extension replaces the whole
     method with a version that does the same steps (hide windows that don't belong,
     refresh clones, size app icons, animate) with positions from the engine. Its own
     settings (algorithm, margin, gap, size fidelity, max scale, centering, gap filling
     and its maximum growth) apply; it can be switched off separately. With both views
     switched off, Cinnamon behaves exactly as without the extension.
     overviewModeOff() (back to real positions) is unchanged.

   Lifecycle (called by Cinnamon): init(metadata) once when loaded; enable() when
   switched on (and at each login while on); disable() when switched off.
   ========================================================================== */

const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const ExpoThumbnail = imports.ui.expoThumbnail;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

// Load the engine (spreadLayout.js in this folder).
//   Cinnamon 6.8 and later: extensions are loaded by GJS's native importer, and local files
//   are reached through Extension.getCurrentExtension().imports (require() still works there
//   but is deprecated and logs a warning).
//   Cinnamon 6.0-6.6: getCurrentExtension() doesn't exist; Cinnamon's loader provides require().
function loadEngine() {
  const ExtensionModule = imports.ui.extension;
  if (ExtensionModule && typeof ExtensionModule.getCurrentExtension === "function") {
    const me = ExtensionModule.getCurrentExtension();
    if (me && me.imports && me.imports.spreadLayout && me.imports.spreadLayout.SpreadLayout)
      return me.imports.spreadLayout.SpreadLayout;
  }
  return require('./spreadLayout');
}
const SpreadLayout = loadEngine();

const LOG_PREFIX = "[window-spread] ";

// Values from Cinnamon's expoThumbnail.js (identical in 6.0 to 6.8; module-level constants there
// aren't exported, so they are repeated here; the tests compare them with Cinnamon's source).
const EXPO_REARRANGE_TIME_ON = 100; // ms, REARRANGE_TIME_ON
const EXPO_ICON_OFFSET = -5;        // ICON_OFFSET: on-screen offset of the app icon badge from a window's corner
const EXPO_ICON_SCALE = 0.25;       // app icon scale factor in overviewModeOn ("0.25/...")

// Settings dialog key -> engine settings group and key, and optionally a unit: the engine
// value is the dialog value times the unit (the effort: 1 = 100 descent steps).
// The engine's DEFAULTS are the reference for default values; settings-schema.json is
// generated from them. Engine settings not listed here keep their DEFAULTS value, e.g.
// scoring.wSizes ("Keep sizes": it never changes a layout in the extension) and push.passes
// (only a safety limit: push apart stops when nothing overlaps, long before it); the
// polish of the optimizer and push apart is always on (it clearly improves both).
const SETTINGS_MAP = [
  ["margin", "common", "margin"], ["gap", "common", "gap"], ["fidelity", "common", "fidelity"],
  ["max-scale", "common", "maxScale"], ["centered", "common", "centered"], ["fill", "common", "fill"],
  ["max-growth", "common", "maxGrowth"],
  ["w-size", "scoring", "wSize"], ["w-place", "scoring", "wPlace"],
  ["w-relations", "scoring", "wRelations"], ["relations-method", "scoring", "relationsMethod"],
  ["neighbor-focus", "scoring", "neighborFocus"],
  ["optimizer-effort", "optimizer", "steps", 100],
  ["push-strength", "push", "strength"], ["push-match-shape", "push", "matchShape"],
  ["rows-count", "rows", "rows"],
];
// Show all workspaces has its own copies of the layout settings (defaults from the same engine
// DEFAULTS); margin and gap are separate settings with Cinnamon's own Expo gap as default.
const EXPO_SETTINGS_MAP = [
  ["expo-fidelity", "common", "fidelity"], ["expo-max-scale", "common", "maxScale"],
  ["expo-centered", "common", "centered"], ["expo-fill", "common", "fill"], ["expo-max-growth", "common", "maxGrowth"],
];

let extensionMeta = null;   // metadata.json, given to init()
let settings = null;        // Cinnamon settings object for this extension
let cache = null;           // engine layout cache: last layout per monitor and workspace
let originals = null;       // Cinnamon's original methods, restored by disable()
let reportedOnce = false;   // decorations already logged this session
let thumbCenters = new WeakMap(); // window clone -> its thumbnail center, for keyboard navigation
let errorsLogged = new Set(); // failures already logged since enable()

// Algorithm names as the settings window shows them, for the log.
const ALGORITHM_NAMES = {
  optimizer: "Optimizer", push: "Push apart", rows: "Ordered rows", grid: "Equal grid"
};
const windowCount = n => n + (n === 1 ? " window" : " windows");

function log(msg) { global.log(LOG_PREFIX + msg); }
function logError(msg, e) { global.logError(LOG_PREFIX + msg + (e ? ": " + e + (e.stack ? "\n" + e.stack : "") : "")); }
// A failure in a replaced method would repeat on every hover or key press; log each
// distinct one only the first time (until the extension is enabled again).
function logFailure(msg, e) {
  const key = msg + ": " + e;
  if (errorsLogged.has(key)) return;
  errorsLogged.add(key);
  logError(msg + " (repeats of this aren't logged)", e);
}

// The engine's targets for `windows`, checked: one per window, at finite positions with
// positive sizes. Anything else throws, so the caller falls back to Cinnamon's own layout
// instead of handing Cinnamon an unusable one.
function checkedTargets(res, windows) {
  const byId = new Map(res.targets.map(t => [t.id, t]));
  for (const w of windows) {
    const t = byId.get(w.id);
    const ok = t && [t.x, t.y, t.w, t.h].every(Number.isFinite) && t.w > 0 && t.h > 0;
    if (!ok) throw new Error("the engine returned an unusable layout");
  }
  return byId;
}
// Forget the thumbnail centers of a WorkspaceMonitor's windows (its layout came from
// Cinnamon, so keyboard navigation must be Cinnamon's too).
function forgetCenters(mon) {
  for (const c of mon._windows || []) thumbCenters.delete(c);
}

// Current settings as engine settings, for the algorithm chosen in `algorithmKey`
// ("algorithm" for Show all windows, "expo-algorithm" for Show all workspaces), with
// `overrides` on top (Expo's own margin and gap).
function readConfig(algorithmKey, overrides) {
  // The engine's defaults, with the settings window's values on top (not every engine
  // setting is in the window, e.g. push.passes, used below for the optimizer's start).
  const groups = {};
  for (const g of Object.keys(SpreadLayout.DEFAULTS)) groups[g] = Object.assign({}, SpreadLayout.DEFAULTS[g]);
  for (const [key, group, engineKey, unit] of SETTINGS_MAP) {
    const v = settings.getValue(key);
    groups[group][engineKey] = unit ? v * unit : v;
  }
  groups.common.maxScale = Math.min(1, groups.common.maxScale); // Cinnamon caps thumbnails at real size
  // The optimizer starts from the push-apart and ordered-rows layouts with their own settings.
  const p = groups.push;
  groups.optimizer.pushStart = { passes: p.passes, strength: p.strength, matchShape: p.matchShape, polish: p.polish };
  groups.optimizer.rowsStart = { rows: groups.rows.rows };
  let algorithm = settings.getValue(algorithmKey || "algorithm");
  if (SpreadLayout.ALGORITHMS.indexOf(algorithm) < 0) algorithm = "optimizer";
  return {
    algorithm,
    useCache: settings.getValue("use-cache"),
    debug: settings.getValue("debug-log"),
    S: SpreadLayout.settings(algorithm, Object.assign({}, groups.common, groups.scoring, groups[algorithm], overrides || {})),
  };
}

// Replacement for WorkspaceMonitor._computeAllWindowSlots(n). `mon` is the WorkspaceMonitor.
// Returns one slot per window in mon._windows order, or null to use Cinnamon's original
// (also when Show all windows is switched off in the settings).
function computeSlots(mon, n) {
  if (!settings.getValue("scale-enabled")) return null; // switched off: Cinnamon's own grid
  if (n <= 0) return [];
  const clones = mon._windows;
  if (!clones || clones.length !== n) return null;

  // Room Cinnamon reserves around each thumbnail: close button overhang above and at the
  // sides, window title below (WindowOverlay.chromeHeights / chromeWidths).
  const overlay = clones[0].overlay;
  const [top, bottom] = overlay ? overlay.chromeHeights() : [0, 0];
  const [left, right] = overlay ? overlay.chromeWidths() : [0, 0];

  const cfg = readConfig("algorithm");
  // Gaps between thumbnails = the user's gap + the decorations of both neighbors: the
  // close buttons' overhang side by side, close button and title one above the other.
  const S = Object.assign({}, cfg.S, { extraGapX: left + right, extraGapY: top + bottom });
  // The engine lays out the thumbnails themselves; keep their decorations on screen too.
  const area = { x: mon._x + left, y: mon._y + top, w: mon._width - left - right, h: mon._height - top - bottom };
  // Window frames and stable ids. Minimized windows report their normal frame and are
  // laid out like any other; the engine never sees stacking order or minimized state.
  const windows = clones.map(c => {
    const r = c.metaWindow.get_frame_rect();
    return { id: c.metaWindow.get_stable_sequence(), x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const slotKey = mon.monitorIndex + "/" + (mon.metaWorkspace ? mon.metaWorkspace.index() : "all");

  const t0 = GLib.get_monotonic_time();
  const res = cfg.useCache
    ? cache.compute(windows, area, cfg.algorithm, S, slotKey)
    : SpreadLayout.compute(windows, area, cfg.algorithm, S);
  const ms = (GLib.get_monotonic_time() - t0) / 1000;

  // Convert each thumbnail to Cinnamon's slot format: [xCenter, yCenter, xFraction, yFraction]
  // relative to the monitor area inside Cinnamon's margin (see _getSlotGeometry). The slot is
  // the thumbnail plus its decorations, so _computeWindowLayout places the thumbnail exactly.
  const m = mon._margin, AX = mon._x + m, AY = mon._y + m, AW = mon._width - 2 * m, AH = mon._height - 2 * m;
  const byId = checkedTargets(res, windows);
  const widths = [];
  const slots = clones.map(c => {
    const t = byId.get(c.metaWindow.get_stable_sequence());
    const sx = t.x - left, sy = t.y - top, sw = t.w + left + right, sh = t.h + top + bottom;
    widths.push(t.w);
    return [(sx + sw / 2 - AX) / AW, (sy + sh / 2 - AY) / AH, sw / AW, sh / AH];
  });
  // For keyboard navigation, once the layout is known to be usable.
  clones.forEach(c => {
    const t = byId.get(c.metaWindow.get_stable_sequence());
    thumbCenters.set(c, [t.x + t.w / 2, t.y + t.h / 2]);
  });
  // Cinnamon limits every window title to the same width, _slotWidth, centered under its
  // thumbnail. Use the smallest thumbnail width plus the gap side by side, so no title can
  // reach into a neighbor's space, but at most twice the room at the screen's edges (margin
  // + decorations), so no title reaches past them (long titles under big thumbnails are
  // shortened a little more than strictly necessary).
  const spare = Math.min(S.gap + S.extraGapX, 2 * (S.margin + Math.min(left, right)));
  mon._slotWidth = Math.floor(Math.min(...widths) + spare);

  if (cfg.debug) {
    // Note: opening the view lays out every workspace at once, starting with workspace 0.
    const minimized = clones.filter(c => c.metaWindow.minimized);
    log(`${describeSlot(mon)}: ${windowCount(n)} (${minimized.length} minimized), ` +
      `${ALGORITHM_NAMES[cfg.algorithm]}, ` +
      `${res.cached ? "reused cached layout" : "computed"} in ${ms.toFixed(1)} ms, score ${res.score.total.toFixed(3)}`);
    for (const c of minimized) {
      const r = c.metaWindow.get_frame_rect();
      log(`  minimized window "${c.metaWindow.get_title()}": frame ${r.x},${r.y} ${r.width}x${r.height}`);
    }
    if (!reportedOnce) { // doesn't change during a session
      reportedOnce = true;
      log(`decorations around thumbnails: top ${top}, bottom ${bottom}, left ${left}, right ${right} px; ` +
        `effective gaps ${S.gap + S.extraGapX} px side by side, ${S.gap + S.extraGapY} px ` +
        `one above the other; monitor area ${mon._x},${mon._y} ${mon._width}x${mon._height}`);
    }
  }
  return slots;
}

// For the log: Cinnamon's internal indexes (counted from 0) plus the workspace name as shown
// on screen (custom name, or "Workspace N" with N = index + 1). Monitors have no reliable
// visible name, so only their index is given.
function describeSlot(mon) {
  if (!mon.metaWorkspace) return `monitor index ${mon.monitorIndex}, all workspaces`;
  const index = mon.metaWorkspace.index();
  let name = "";
  try { name = Main.getWorkspaceName(index); } catch (e) { /* name is optional */ }
  return `monitor index ${mon.monitorIndex}, workspace index ${index}` + (name ? ` ("${name}")` : "");
}

// Replacement for WorkspaceMonitor.selectAnotherWindow(symbol): arrow keys move to the
// nearest thumbnail in that direction. Returns null to use Cinnamon's original (other keys).
function selectInDirection(mon, symbol) {
  const dirs = {};
  dirs[Clutter.KEY_Left] = [-1, 0]; dirs[Clutter.KEY_Right] = [1, 0];
  dirs[Clutter.KEY_Up] = [0, -1]; dirs[Clutter.KEY_Down] = [0, 1];
  const dir = dirs[symbol];
  const clones = mon._windows;
  if (!settings.getValue("scale-enabled")) return null; // switched off: Cinnamon's own navigation
  if (!dir || !clones || !clones.length || clones.some(c => !thumbCenters.has(c))) return null;
  const cur = thumbCenters.get(clones[Math.max(0, Math.min(clones.length - 1, mon._kbWindowIndex))]);
  let best = -1, bestScore = Infinity;
  clones.forEach((c, i) => {
    const center = thumbCenters.get(c), dx = center[0] - cur[0], dy = center[1] - cur[1];
    const ahead = dx * dir[0] + dy * dir[1];            // distance in the arrow's direction
    const aside = Math.abs(dx * dir[1] - dy * dir[0]);  // distance sideways
    if (ahead <= 1 || aside > 2 * ahead) return;        // must be ahead, within about 63 degrees
    const score = ahead + 2 * aside;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best < 0) return false; // nothing in that direction: not handled (no wrap-around)
  mon.selectIndex(best);
  return true;
}

// Replacement for ExpoWorkspaceThumbnail.overviewModeOn(), called with the thumbnail as `thumb`.
// Mirrors Cinnamon's own method (same steps, same animations, same icon sizing), but takes
// positions from the engine instead of its stacking-ordered grid. Returns false to let
// Cinnamon's original run instead (Expo arrangement switched off in the settings).
// Version differences, detected here: Cinnamon 6.0-6.6 keep the clone's actor in
// `window.actor` and the thumbnail scale in `box.scale`; in 6.8 the clone is the actor and
// the scale is `box.thumbnail_scale`.
function expoOverviewModeOn(thumb) {
  if (!settings.getValue("expo-enabled")) return false;
  const boxScale = thumb.box.thumbnail_scale !== undefined ? thumb.box.thumbnail_scale : thumb.box.scale;
  if (!boxScale) return true; // as Cinnamon's: nothing to do yet
  // App icon badges overlap each window's top-left corner and stick out EXPO_ICON_OFFSET screen
  // pixels beyond it; in the workspace's full-size coordinates that is |EXPO_ICON_OFFSET| / boxScale.
  // Like the Scale view's titles and close buttons, this room is added to the margin (left and
  // top) and to the gap (the same both ways: a badge sticks out to the left and up), so the
  // settings measure the space between a badge and the next window.
  const badgeOverhang = -EXPO_ICON_OFFSET / boxScale;
  const own = { margin: settings.getValue("expo-margin"), gap: settings.getValue("expo-gap") + badgeOverhang };
  for (const [key, , engineKey] of EXPO_SETTINGS_MAP) own[engineKey] = settings.getValue(key);
  own.maxScale = Math.min(1, own.maxScale); // Cinnamon caps thumbnails at real size
  const cfg = readConfig("expo-algorithm", own);
  thumb.overviewMode = true;
  thumb.resetCloneHover();
  const actorOf = w => w.actor || w;
  const duration = Main.animations_enabled ? EXPO_REARRANGE_TIME_ON : 0;

  // Which windows belong in the overview, and one layout per monitor over that monitor's
  // full area (as in Cinnamon). All layouts are computed and checked before anything moves,
  // so a failure falls back to Cinnamon's method with nothing half done.
  const shown = thumb.windows.filter(window => thumb.isOverviewWindow(window.metaWindow));
  const plans = [];
  Main.layoutManager.monitors.forEach((monitor, monitorIndex) => {
    const mine = shown.filter(w => w.metaWindow.get_monitor() === monitorIndex);
    if (!mine.length) return;
    const frames = new Map();
    const windows = mine.map(w => {
      const r = w.metaWindow.get_frame_rect();
      frames.set(w, r);
      return { id: w.metaWindow.get_stable_sequence(), x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const area = { x: monitor.x + badgeOverhang, y: monitor.y + badgeOverhang,
      w: monitor.width - badgeOverhang, h: monitor.height - badgeOverhang };
    const wsIndex = thumb.metaWorkspace ? thumb.metaWorkspace.index() : "all";
    const slotKey = "expo/" + monitorIndex + "/" + wsIndex;
    const t0 = GLib.get_monotonic_time();
    const res = cfg.useCache ? cache.compute(windows, area, cfg.algorithm, cfg.S, slotKey)
      : SpreadLayout.compute(windows, area, cfg.algorithm, cfg.S);
    const ms = (GLib.get_monotonic_time() - t0) / 1000;
    plans.push({ monitorIndex, mine, frames, res, ms, byId: checkedTargets(res, windows) });
  });

  // Windows that don't belong in the overview shrink away and hide (as in Cinnamon).
  thumb.windows.forEach(window => {
    if (shown.indexOf(window) >= 0) return;
    actorOf(window).ease({ scale_x: 0, scale_y: 0, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onComplete: () => actorOf(window).hide() });
  });

  for (const { monitorIndex, mine, frames, res, ms, byId } of plans) {
    mine.forEach(window => {
      if (window.inDrag) return;
      window.refreshClone(true);
      window.showUrgencyState();
      // The engine places the visible frame; Cinnamon positions the window actor, which also
      // covers invisible borders. Convert using the offset between the two rectangles.
      const f = frames.get(window), t = byId.get(window.metaWindow.get_stable_sequence()), real = window.realWindow;
      const scale = t.w / f.width;
      const x = t.x - (f.x - real.x) * scale, y = t.y - (f.y - real.y) * scale;
      // App icon badge: same on-screen size for every window and the same offset from the
      // window's corner, as in Cinnamon. Cinnamon anchors it to the actor's corner, which is
      // fine for its grid (actors spaced apart) but here would put the badge out in the
      // invisible borders, far from the visible window. So it's anchored to the visible
      // frame's corner, in the actor's own (unscaled) coordinates.
      window.icon.raise_top();
      const iconScale = EXPO_ICON_SCALE / boxScale / scale;
      window.icon.set_scale(iconScale, iconScale);
      const iconOffset = EXPO_ICON_OFFSET / boxScale / scale;
      window.icon.set_position((f.x - real.x) + iconOffset, (f.y - real.y) + iconOffset);
      actorOf(window).ease({ x, y, scale_x: scale, scale_y: scale, opacity: 255, duration,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => { actorOf(window).show(); window.icon.show(); } });
    });

    if (cfg.debug) {
      const name = describeSlot({ monitorIndex, metaWorkspace: thumb.metaWorkspace });
      log(`expo, ${name}: ${windowCount(mine.length)}, ${ALGORITHM_NAMES[cfg.algorithm]}, ` +
        `${res.cached ? "reused cached layout" : "computed"} in ${ms.toFixed(1)} ms, score ${res.score.total.toFixed(3)}`);
    }
  }
  return true;
}

function init(metadata) {
  extensionMeta = metadata;
}

function enable() {
  // enabled again without disable(), or after a failed enable(): start from a clean state
  if (originals || settings) disable();
  settings = new Settings.ExtensionSettings({}, extensionMeta.uuid);
  cache = SpreadLayout.createCache();
  thumbCenters = new WeakMap();
  reportedOnce = false;
  errorsLogged = new Set();
  const debug = settings.getValue("debug-log"); // read before anything is patched

  // Each replacement keeps its own reference to Cinnamon's original, so it still works if
  // something holds on to it after disable().
  const proto = Workspace.WorkspaceMonitor.prototype;
  const expoProto = ExpoThumbnail.ExpoWorkspaceThumbnail.prototype;
  const orig = { computeAllWindowSlots: proto._computeAllWindowSlots, selectAnotherWindow: proto.selectAnotherWindow,
    expoOverviewModeOn: expoProto.overviewModeOn };
  proto._computeAllWindowSlots = function (numberOfWindows) {
    try {
      const slots = computeSlots(this, numberOfWindows);
      if (slots) return slots;
    } catch (e) {
      logFailure("layout failed, using Cinnamon's grid instead", e);
    }
    forgetCenters(this);
    return orig.computeAllWindowSlots.call(this, numberOfWindows);
  };
  proto.selectAnotherWindow = function (symbol) {
    try {
      const handled = selectInDirection(this, symbol);
      if (handled !== null) return handled;
    } catch (e) {
      logFailure("keyboard navigation failed, using Cinnamon's instead", e);
    }
    return orig.selectAnotherWindow.call(this, symbol);
  };
  expoProto.overviewModeOn = function () {
    try {
      if (expoOverviewModeOn(this)) return;
    } catch (e) {
      logFailure("Expo layout failed, using Cinnamon's grid instead", e);
    }
    return orig.expoOverviewModeOn.apply(this, arguments);
  };
  originals = orig;
  if (debug) log("enabled");
}

function disable() {
  if (originals) {
    const proto = Workspace.WorkspaceMonitor.prototype;
    proto._computeAllWindowSlots = originals.computeAllWindowSlots;
    proto.selectAnotherWindow = originals.selectAnotherWindow;
    ExpoThumbnail.ExpoWorkspaceThumbnail.prototype.overviewModeOn = originals.expoOverviewModeOn;
    originals = null;
  }
  if (settings) {
    let debug = false;
    try { debug = settings.getValue("debug-log"); } catch (e) { /* only for the log line */ }
    if (debug) log("disabled");
    settings.finalize();
    settings = null;
  }
  cache = null;
}
