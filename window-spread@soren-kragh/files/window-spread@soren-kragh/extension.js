// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

// Window Spread: lays out the windows in Cinnamon's "Show all windows" (Scale)
// and in each workspace of "Show all workspaces" (Expo) by their real
// positions and sizes, using the engine in spreadLayout.js. The rest of both
// views is left to Cinnamon.
//
// While enabled, it replaces three Cinnamon methods:
//   WorkspaceMonitor._computeAllWindowSlots (js/ui/workspace.js)
//   WorkspaceMonitor.selectAnotherWindow (arrow keys)
//   ExpoWorkspaceThumbnail.overviewModeOn (js/ui/expoThumbnail.js)
// Each falls back to Cinnamon's original if it throws, or while its view is
// switched off in the settings. Written for Cinnamon 6.0 to 6.8; design notes
// are in DEVELOPMENT.md at https://github.com/soren-kragh/window-spread.

const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const ExpoThumbnail = imports.ui.expoThumbnail;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

// Load the engine (spreadLayout.js in this folder). Cinnamon 6.8 loads
// extensions with GJS's native importer, which reaches local files through
// getCurrentExtension().imports. Cinnamon 6.0-6.6 don't have
// getCurrentExtension() and only offer CommonJS-style loading (which 6.8
// still supports, with a deprecation warning).
function loadEngine() {
    const ExtensionModule = imports.ui.extension;
    if (ExtensionModule && typeof ExtensionModule.getCurrentExtension === 'function') {
        const me = ExtensionModule.getCurrentExtension();
        if (me && me.imports && me.imports.spreadLayout &&
            me.imports.spreadLayout.SpreadLayout) {
            return me.imports.spreadLayout.SpreadLayout;
        }
    }
    return require('./spreadLayout');
}

const SpreadLayout = loadEngine();

const LOG_PREFIX = '[window-spread] ';

// Copied from Cinnamon's expoThumbnail.js, which doesn't export them (the
// tests check them against its source). REARRANGE_TIME_ON is in ms,
// ICON_OFFSET in screen px from a window's corner; the icon scale is a
// literal in its overviewModeOn().
const EXPO_REARRANGE_TIME_ON = 100;
const EXPO_ICON_OFFSET = -5;
const EXPO_ICON_SCALE = 0.25;

// Settings dialog key -> engine settings group and key, and optionally a unit
// (engine value = dialog value times the unit; effort 1 = 100 descent steps).
// Default values come from the engine's DEFAULTS, which settings-schema.json
// is generated from. Engine settings not listed keep their default.
const SETTINGS_MAP = [
    ['margin', 'common', 'margin'],
    ['gap', 'common', 'gap'],
    ['fidelity', 'common', 'fidelity'],
    ['max-scale', 'common', 'maxScale'],
    ['centered', 'common', 'centered'],
    ['fill', 'common', 'fill'],
    ['max-growth', 'common', 'maxGrowth'],
    ['w-size', 'scoring', 'wSize'],
    ['w-place', 'scoring', 'wPlace'],
    ['w-relations', 'scoring', 'wRelations'],
    ['relations-method', 'scoring', 'relationsMethod'],
    ['neighbor-focus', 'scoring', 'neighborFocus'],
    ['optimizer-effort', 'optimizer', 'steps', 100],
    ['push-strength', 'push', 'strength'],
    ['push-match-shape', 'push', 'matchShape'],
    ['rows-count', 'rows', 'rows'],
];

// Show all workspaces has its own copies of these (its margin and gap are
// read separately).
const EXPO_SETTINGS_MAP = [
    ['expo-fidelity', 'common', 'fidelity'],
    ['expo-max-scale', 'common', 'maxScale'],
    ['expo-centered', 'common', 'centered'],
    ['expo-fill', 'common', 'fill'],
    ['expo-max-growth', 'common', 'maxGrowth'],
];

let extensionMeta = null;
let settings = null;
let cache = null;
// Cinnamon's original methods, restored by disable()
let originals = null;
// whether the decorations were logged yet
let reportedOnce = false;
// window clone -> its thumbnail's center, for keyboard navigation
let thumbCenters = new WeakMap();
// failures logged since enable()
let errorsLogged = new Set();

// Algorithm names as the settings window shows them, for the log.
const ALGORITHM_NAMES = {
    optimizer: 'Optimizer',
    push: 'Push apart',
    rows: 'Ordered rows',
    grid: 'Equal grid',
};

const windowCount = n => n + (n === 1 ? ' window' : ' windows');

function log(msg) {
    global.log(LOG_PREFIX + msg);
}

function logError(msg, e) {
    global.logError(LOG_PREFIX + msg +
        (e ? ': ' + e + (e.stack ? '\n' + e.stack : '') : ''));
}

// A failure in a replaced method would repeat on every hover or key press, so
// each distinct one is logged once (until the extension is enabled again).
function logFailure(msg, e) {
    const key = msg + ': ' + e;
    if (errorsLogged.has(key))
        return;
    errorsLogged.add(key);
    logError(msg + " (repeats of this aren't logged)", e);
}

// Returns the engine's targets by window id. Throws unless every window got a
// target with finite numbers and a size above 0; the caller then falls back to
// Cinnamon.
function checkedTargets(res, windows) {
    const byId = new Map(res.targets.map(t => [t.id, t]));
    for (const w of windows) {
        const t = byId.get(w.id);
        const ok = t && [t.x, t.y, t.w, t.h].every(Number.isFinite) && t.w > 0 && t.h > 0;
        if (!ok)
            throw new Error('the engine returned an unusable layout');
    }
    return byId;
}

// After a fallback the layout is Cinnamon's, so keyboard navigation is too.
function forgetCenters(mon) {
    for (const c of mon._windows || [])
        thumbCenters.delete(c);
}

// Builds the engine settings from the current settings. `algorithmKey` is the
// setting that picks the algorithm ('algorithm' or 'expo-algorithm');
// `overrides` (Expo's own settings) go on top.
function readConfig(algorithmKey, overrides) {
    const groups = {};
    for (const g of Object.keys(SpreadLayout.DEFAULTS))
        groups[g] = Object.assign({}, SpreadLayout.DEFAULTS[g]);
    for (const [key, group, engineKey, unit] of SETTINGS_MAP) {
        const v = settings.getValue(key);
        groups[group][engineKey] = unit ? v * unit : v;
    }

    // Cinnamon caps thumbnails at real size
    groups.common.maxScale = Math.min(1, groups.common.maxScale);

    // The optimizer starts from the push-apart and ordered-rows layouts, with
    // their settings.
    const p = groups.push;
    groups.optimizer.pushStart = {
        passes: p.passes,
        strength: p.strength,
        matchShape: p.matchShape,
        polish: p.polish,
    };
    groups.optimizer.rowsStart = { rows: groups.rows.rows };

    let algorithm = settings.getValue(algorithmKey || 'algorithm');
    if (SpreadLayout.ALGORITHMS.indexOf(algorithm) < 0)
        algorithm = 'optimizer';

    return {
        algorithm,
        useCache: settings.getValue('use-cache'),
        debug: settings.getValue('debug-log'),
        S: SpreadLayout.settings(algorithm,
            Object.assign({}, groups.common, groups.scoring, groups[algorithm],
                overrides || {})),
    };
}

/**
 * computeSlots:
 * @mon: the WorkspaceMonitor
 * @n: the number of windows
 *
 * Replaces WorkspaceMonitor._computeAllWindowSlots(n).
 *
 * Returns: one slot per window in mon._windows order, or null to use
 * Cinnamon's original
 */
function computeSlots(mon, n) {
    if (!settings.getValue('scale-enabled'))
        return null;
    if (n <= 0) return [];
    const clones = mon._windows;
    if (!clones || clones.length !== n)
        return null;

    // Room Cinnamon reserves around each thumbnail: the close button above and
    // at the sides, the title below.
    const overlay = clones[0].overlay;
    const [top, bottom] = overlay ? overlay.chromeHeights() : [0, 0];
    const [left, right] = overlay ? overlay.chromeWidths() : [0, 0];

    const cfg = readConfig('algorithm');

    // Between two thumbnails go the gap and both their decorations.
    const S = Object.assign({}, cfg.S, {
        extraGapX: left + right,
        extraGapY: top + bottom,
    });

    // The decorations must stay on screen too.
    const area = {
        x: mon._x + left,
        y: mon._y + top,
        w: mon._width - left - right,
        h: mon._height - top - bottom,
    };

    // Minimized windows report their normal frame and are laid out like any
    // other.
    const windows = clones.map(c => {
        const r = c.metaWindow.get_frame_rect();
        return {
            id: c.metaWindow.get_stable_sequence(),
            x: r.x, y: r.y, w: r.width, h: r.height,
        };
    });
    const slotKey = mon.monitorIndex + '/' +
        (mon.metaWorkspace ? mon.metaWorkspace.index() : 'all');

    const t0 = GLib.get_monotonic_time();
    const res = cfg.useCache
        ? cache.compute(windows, area, cfg.algorithm, S, slotKey)
        : SpreadLayout.compute(windows, area, cfg.algorithm, S);
    const ms = (GLib.get_monotonic_time() - t0) / 1000;

    // Cinnamon's slots are [xCenter, yCenter, xFraction, yFraction], relative
    // to the monitor inside Cinnamon's margin (see _getSlotGeometry). A slot of
    // the thumbnail plus its decorations makes _computeWindowLayout() put the
    // thumbnail exactly there.
    const m = mon._margin;
    const AX = mon._x + m;
    const AY = mon._y + m;
    const AW = mon._width - 2 * m;
    const AH = mon._height - 2 * m;
    const byId = checkedTargets(res, windows);
    const widths = [];
    const slots = clones.map(c => {
        const t = byId.get(c.metaWindow.get_stable_sequence());
        const sx = t.x - left;
        const sy = t.y - top;
        const sw = t.w + left + right;
        const sh = t.h + top + bottom;
        widths.push(t.w);
        return [(sx + sw / 2 - AX) / AW, (sy + sh / 2 - AY) / AH, sw / AW, sh / AH];
    });

    clones.forEach(c => {
        const t = byId.get(c.metaWindow.get_stable_sequence());
        thumbCenters.set(c, [t.x + t.w / 2, t.y + t.h / 2]);
    });

    // Cinnamon gives every title the same maximum width, _slotWidth. Use the
    // smallest thumbnail plus the gap, which keeps titles off their neighbors,
    // but no more than twice the room at the screen's edges, or titles there
    // could run off the screen.
    const spare = Math.min(S.gap + S.extraGapX, 2 * (S.margin + Math.min(left, right)));
    mon._slotWidth = Math.floor(Math.min(...widths) + spare);

    if (cfg.debug) {
        const minimized = clones.filter(c => c.metaWindow.minimized);
        log(`${describeSlot(mon)}: ` +
            `${windowCount(n)} (${minimized.length} minimized), ` +
            `${ALGORITHM_NAMES[cfg.algorithm]}, ` +
            `${res.cached ? 'reused cached layout' : 'computed'} ` +
            `in ${ms.toFixed(1)} ms, ` +
            `score ${res.score.total.toFixed(3)}`);
        for (const c of minimized) {
            const r = c.metaWindow.get_frame_rect();
            log(`  minimized window "${c.metaWindow.get_title()}": ` +
                `frame ${r.x},${r.y} ${r.width}x${r.height}`);
        }

        // the decorations don't change during a session
        if (!reportedOnce) {
            reportedOnce = true;
            log(`decorations around thumbnails: ` +
                `top ${top}, bottom ${bottom}, left ${left}, right ${right} px; ` +
                `effective gaps ${S.gap + S.extraGapX} px side by side, ` +
                `${S.gap + S.extraGapY} px one above the other; ` +
                `monitor area ${mon._x},${mon._y} ${mon._width}x${mon._height}`);
        }
    }

    return slots;
}

// For the log: Cinnamon's indexes (from 0), plus the workspace's name as shown
// on screen.
function describeSlot(mon) {
    if (!mon.metaWorkspace)
        return `monitor index ${mon.monitorIndex}, all workspaces`;
    const index = mon.metaWorkspace.index();
    let name = '';
    try {
        name = Main.getWorkspaceName(index);
    } catch (e) {
        // the name is optional
    }
    return `monitor index ${mon.monitorIndex}, workspace index ${index}` +
        (name ? ` ("${name}")` : '');
}

/**
 * selectInDirection:
 * @mon: the WorkspaceMonitor
 * @symbol: the key pressed
 *
 * Replaces WorkspaceMonitor.selectAnotherWindow(symbol): arrow keys move to
 * the nearest thumbnail in that direction.
 *
 * Returns: whether the key was handled, or null to use Cinnamon's original
 */
function selectInDirection(mon, symbol) {
    const dirs = {};
    dirs[Clutter.KEY_Left] = [-1, 0];
    dirs[Clutter.KEY_Right] = [1, 0];
    dirs[Clutter.KEY_Up] = [0, -1];
    dirs[Clutter.KEY_Down] = [0, 1];

    const dir = dirs[symbol];
    const clones = mon._windows;
    if (!settings.getValue('scale-enabled'))
        return null;
    if (!dir || !clones || !clones.length || clones.some(c => !thumbCenters.has(c)))
        return null;

    const cur = thumbCenters.get(
        clones[Math.max(0, Math.min(clones.length - 1, mon._kbWindowIndex))]);
    let best = -1;
    let bestScore = Infinity;
    clones.forEach((c, i) => {
        // Candidates lie ahead, within about 63 degrees of the arrow's
        // direction; the nearest wins, sideways distance counting double.
        const center = thumbCenters.get(c);
        const dx = center[0] - cur[0];
        const dy = center[1] - cur[1];
        const ahead = dx * dir[0] + dy * dir[1];
        const aside = Math.abs(dx * dir[1] - dy * dir[0]);
        if (ahead <= 1 || aside > 2 * ahead)
            return;
        const score = ahead + 2 * aside;
        if (score < bestScore) {
            bestScore = score;
            best = i;
        }
    });

    // nothing in that direction: no wrap-around
    if (best < 0)
        return false;
    mon.selectIndex(best);
    return true;
}

/**
 * expoOverviewModeOn:
 * @thumb: the ExpoWorkspaceThumbnail
 *
 * Replaces ExpoWorkspaceThumbnail.overviewModeOn(). Cinnamon's method computes
 * its grid inline, with no hook for the positions, so this repeats its steps
 * with positions from the engine (the tests flag any change to Cinnamon's
 * version).
 *
 * Cinnamon 6.0-6.6 keep the clone's actor in `window.actor` and the scale in
 * `box.scale`; in 6.8 the clone is the actor and the scale is
 * `box.thumbnail_scale`.
 *
 * Returns: false to run Cinnamon's original instead
 */
function expoOverviewModeOn(thumb) {

    if (!settings.getValue('expo-enabled'))
        return false;
    const boxScale = thumb.box.thumbnail_scale !== undefined
        ? thumb.box.thumbnail_scale
        : thumb.box.scale;

    // not sized yet; Cinnamon returns here too
    if (!boxScale)
        return true;

    // The app icon badges stick out EXPO_ICON_OFFSET screen px to the left of
    // and above each window. That room is added to the margin and the gap, so
    // the settings measure the space between a badge and the next window.
    const badgeOverhang = -EXPO_ICON_OFFSET / boxScale;
    const own = {
        margin: settings.getValue('expo-margin'),
        gap: settings.getValue('expo-gap') + badgeOverhang,
    };
    for (const [key, , engineKey] of EXPO_SETTINGS_MAP)
        own[engineKey] = settings.getValue(key);

    // Cinnamon caps thumbnails at real size
    own.maxScale = Math.min(1, own.maxScale);
    const cfg = readConfig('expo-algorithm', own);

    thumb.overviewMode = true;
    thumb.resetCloneHover();
    const actorOf = w => w.actor || w;
    const duration = Main.animations_enabled ? EXPO_REARRANGE_TIME_ON : 0;

    // One layout per monitor, over its full area (as in Cinnamon). All are
    // computed and checked before anything moves, so a failure falls back to
    // Cinnamon's method with nothing half done.
    const shown = thumb.windows.filter(window =>
        thumb.isOverviewWindow(window.metaWindow));
    const plans = [];
    Main.layoutManager.monitors.forEach((monitor, monitorIndex) => {
        const mine = shown.filter(w => w.metaWindow.get_monitor() === monitorIndex);
        if (!mine.length)
            return;

        const frames = new Map();
        const windows = mine.map(w => {
            const r = w.metaWindow.get_frame_rect();
            frames.set(w, r);
            return {
                id: w.metaWindow.get_stable_sequence(),
                x: r.x, y: r.y, w: r.width, h: r.height,
            };
        });

        const area = {
            x: monitor.x + badgeOverhang,
            y: monitor.y + badgeOverhang,
            w: monitor.width - badgeOverhang,
            h: monitor.height - badgeOverhang,
        };

        const wsIndex = thumb.metaWorkspace ? thumb.metaWorkspace.index() : 'all';
        const slotKey = 'expo/' + monitorIndex + '/' + wsIndex;
        const t0 = GLib.get_monotonic_time();
        const res = cfg.useCache
            ? cache.compute(windows, area, cfg.algorithm, cfg.S, slotKey)
            : SpreadLayout.compute(windows, area, cfg.algorithm, cfg.S);
        const ms = (GLib.get_monotonic_time() - t0) / 1000;

        plans.push({
            monitorIndex,
            mine,
            frames,
            res,
            ms,
            byId: checkedTargets(res, windows),
        });
    });

    // Windows that don't belong in the overview shrink away (as in Cinnamon).
    thumb.windows.forEach(window => {
        if (shown.indexOf(window) >= 0)
            return;
        actorOf(window).ease({
            scale_x: 0,
            scale_y: 0,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => actorOf(window).hide(),
        });
    });

    for (const { monitorIndex, mine, frames, res, ms, byId } of plans) {
        mine.forEach(window => {
            if (window.inDrag)
                return;
            window.refreshClone(true);
            window.showUrgencyState();

            // The engine places the visible frame, but Cinnamon positions the
            // window's actor, which includes invisible borders.
            const f = frames.get(window);
            const t = byId.get(window.metaWindow.get_stable_sequence());
            const real = window.realWindow;
            const scale = t.w / f.width;
            const x = t.x - (f.x - real.x) * scale;
            const y = t.y - (f.y - real.y) * scale;

            // The app icon badge: same size and offset as in Cinnamon, but
            // anchored to the visible frame's corner instead of the actor's
            // (which can be far out in the invisible borders).
            window.icon.raise_top();
            const iconScale = EXPO_ICON_SCALE / boxScale / scale;
            window.icon.set_scale(iconScale, iconScale);
            const iconOffset = EXPO_ICON_OFFSET / boxScale / scale;
            window.icon.set_position(f.x - real.x + iconOffset,
                f.y - real.y + iconOffset);

            actorOf(window).ease({
                x,
                y,
                scale_x: scale,
                scale_y: scale,
                opacity: 255,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    actorOf(window).show();
                    window.icon.show();
                },
            });
        });

        if (cfg.debug) {
            const name = describeSlot({
                monitorIndex, metaWorkspace: thumb.metaWorkspace,
            });
            log(`expo, ${name}: ${windowCount(mine.length)}, ` +
                `${ALGORITHM_NAMES[cfg.algorithm]}, ` +
                `${res.cached ? 'reused cached layout' : 'computed'} ` +
                `in ${ms.toFixed(1)} ms, ` +
                `score ${res.score.total.toFixed(3)}`);
        }
    }
    return true;
}

function init(metadata) {
    extensionMeta = metadata;
}

function enable() {
    // enabled again without disable(), or after a failed enable()
    if (originals || settings)
        disable();
    settings = new Settings.ExtensionSettings({}, extensionMeta.uuid);
    cache = SpreadLayout.createCache();
    thumbCenters = new WeakMap();
    reportedOnce = false;
    errorsLogged = new Set();
    const debug = settings.getValue('debug-log');

    // Each replacement keeps its own reference to the original, so it still
    // works if something holds on to it after disable().
    const proto = Workspace.WorkspaceMonitor.prototype;
    const expoProto = ExpoThumbnail.ExpoWorkspaceThumbnail.prototype;
    const orig = {
        computeAllWindowSlots: proto._computeAllWindowSlots,
        selectAnotherWindow: proto.selectAnotherWindow,
        expoOverviewModeOn: expoProto.overviewModeOn,
    };

    proto._computeAllWindowSlots = function(numberOfWindows) {
        try {
            const slots = computeSlots(this, numberOfWindows);
            if (slots)
                return slots;
        } catch (e) {
            logFailure("layout failed, using Cinnamon's grid instead", e);
        }
        forgetCenters(this);
        return orig.computeAllWindowSlots.call(this, numberOfWindows);
    };

    proto.selectAnotherWindow = function(symbol) {
        try {
            const handled = selectInDirection(this, symbol);
            if (handled !== null)
                return handled;
        } catch (e) {
            logFailure("keyboard navigation failed, using Cinnamon's instead", e);
        }
        return orig.selectAnotherWindow.call(this, symbol);
    };

    expoProto.overviewModeOn = function() {
        try {
            if (expoOverviewModeOn(this))
                return;
        } catch (e) {
            logFailure("Expo layout failed, using Cinnamon's grid instead", e);
        }
        return orig.expoOverviewModeOn.apply(this, arguments);
    };

    originals = orig;
    if (debug)
        log('enabled');
}

function disable() {
    if (originals) {
        const proto = Workspace.WorkspaceMonitor.prototype;
        proto._computeAllWindowSlots = originals.computeAllWindowSlots;
        proto.selectAnotherWindow = originals.selectAnotherWindow;
        ExpoThumbnail.ExpoWorkspaceThumbnail.prototype.overviewModeOn =
            originals.expoOverviewModeOn;
        originals = null;
    }
    if (settings) {
        let debug = false;
        try {
            debug = settings.getValue('debug-log');
        } catch (e) {
            // only for the log line
        }
        if (debug)
            log('disabled');
        settings.finalize();
        settings = null;
    }
    cache = null;
}
