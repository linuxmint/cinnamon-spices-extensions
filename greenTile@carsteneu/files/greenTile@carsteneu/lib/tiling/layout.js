/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Layout resolution: per-workspace preset rules (stored in extension settings),
 * the automatic grid shapes and the dragged-shape override — the single place
 * that answers "which layout tiles n windows here".
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { layoutsParse, layoutsEntry, layoutsShapes, layoutsSet, layoutResolve } = XLET.lib.model.layouts;
const { fillStacks, autoRows, autoNarrowStacks } = XLET.lib.model.fill;
const { singleMode, singleActive, singleBase } = XLET.lib.model.single;
const { gapValue } = XLET.lib.model.gap;
const { usableArea } = XLET.lib.tiling.screen;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];
const { editorCols, editorRows, editorMinFloor, editorMinCeiling } = XLET.lib.model.editor;

// Layout of the automatic grid for n windows. Below 2100 px monitor width, 4+ uniform
// columns get too narrow: 3 fixed columns with balanced stacks instead (kind "cols",
// autoNarrowStacks). Otherwise one row with one column per window up to 6, then
// the windows are spread evenly over full-width rows (kind "rows", autoRows).
/**
 * @param {CinnamonMonitor} monitor
 * @param {number} n
 * @returns {DragLayout}
 */
var autoShape = (monitor, n) => (monitor.width < 2100 && n > 3)
    ? { kind: 'cols', shape: autoNarrowStacks(n) }
    : { kind: 'rows', shape: autoRows(n) };
// Per-workspace preset tiling: rules by window count, stored in extension settings
// (survives spice reinstalls — settings live in ~/.config/cinnamon/spices).
// Preset = {"id","name","rules":[{"min":2,"stacks":[1,1]},...]}; assignment map
// wsIndex -> preset id. Rule choice: last rule with min <= window count.
/**
 * A rule read from the corruptible settings data: thresholds clamp into the
 * editor range, stack values into the editor grid, rules without a finite
 * threshold drop. Optional column spans read as typed when they carry one usable
 * value per painted column and stay within the painter grid, otherwise the field
 * is ignored (the columns span one grid column each). Returns null for rules past
 * repair.
 * @param {any} rule
 * @returns {Rule | null}
 */
const ruleClean = (rule) => {
    if (!rule || typeof rule !== 'object') {
        return null;
    }
    const min = Math.floor(Number(rule.min));
    if (!Number.isFinite(min)) {
        return null;
    }
    const stacks = Array.isArray(rule.stacks)
        ? rule.stacks.slice(0, editorCols).map((/** @type {any} */ s) => {
            const v = Math.floor(Number(s));
            return Number.isFinite(v) && v >= 1 ? Math.min(v, editorRows) : 1;
        })
        : [];
    /** @type {Rule} */
    const clean = { min: Math.min(Math.max(min, editorMinFloor), editorMinCeiling), stacks };
    const spans = stacks.length !== 0 && Array.isArray(rule.spans) && rule.spans.length === stacks.length
        ? rule.spans.map((/** @type {any} */ s) => {
            const v = Math.floor(Number(s));
            return Number.isFinite(v) && v >= 1 ? v : 1;
        })
        : null;
    if (spans && spans.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) <= editorCols) {
        clean.spans = spans;
    }
    return clean;
};
/**
 * A preset read from the corruptible settings data: only entries with an id
 * survive (the assignment map keys on it), names and rules read as typed.
 * Returns null for entries beyond repair.
 * @param {any} preset
 * @returns {Preset | null}
 */
const presetClean = (preset) => {
    if (!preset || typeof preset !== 'object' || typeof preset.id !== 'string' || !preset.id) {
        return null;
    }
    return {
        id: preset.id,
        name: typeof preset.name === 'string' ? preset.name : '',
        rules: Array.isArray(preset.rules) ? preset.rules.map(ruleClean).filter((/** @type {Rule | null} */ r) => r !== null) : [],
    };
};
/**
 * Presets validate at read time — corrupt settings data (external edit,
 * backup restore) can no longer throw exceptions or hang computations, and
 * the file is never rewritten as a side effect of reading (preset writes
 * stay editor-driven).
 * @param {AppFacade} app
 * @returns {Preset[]}
 */
var presetsRead = (app) => {
    try {
        const v = JSON.parse(app.config.settings.getValue(SETTINGS_KEYS.presets) || '[]');
        return Array.isArray(v) ? v.map(presetClean).filter((/** @type {Preset | null} */ p) => p !== null) : [];
    }
    catch (_e) {
        return [];
    }
};
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @returns {{ preset: Preset | null, auto: boolean }}
 */
var layoutFor = (app, monitorIndex, wsIndex) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex]) {
        return { preset: null, auto: false };
    }
    const presets = presetsRead(app);
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    const entry = layoutsEntry(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), presets.map((p) => p.id));
    return {
        preset: entry.preset ? presets.find((p) => p.id === entry.preset) || null : null,
        auto: entry.auto,
    };
};
// Whether automatic tiling may run for this monitor + workspace: the registry must
// address the monitor and its stored layout must have auto on, and a RETAINED pause
// outranks the stored setting — the user's last command must not be overwritten by an
// automatic retile or swap before it can be written. Observational: it reads the
// stored layout and the retained queue only — no settings write, no intent
// consumption, no scheduling, no window effect. The retile and the swap share it.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {{ preset: Preset | null, auto: boolean }} [layout] the layoutFor decision,
 *   passed by a caller that already read it (shares one snapshot with its branch)
 * @returns {boolean}
 */
var autoAllowed = (app, monitorIndex, wsIndex, layout = layoutFor(app, monitorIndex, wsIndex)) => {
    if (!app.monitors.ready || !imports.ui.main.layoutManager.monitors[monitorIndex]) {
        return false;
    }
    return layout.auto && !app.session.holdsPause(app, monitorIndex, wsIndex);
};
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {{}} patch
 * @returns {boolean} whether the patch was written (false when the monitor key is
 *   not resolvable yet or the layouts setting is corrupt and must not be replaced)
 */
var layoutSet = (app, monitorIndex, wsIndex, patch) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex]) {
        return false;
    }
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    // Corrupt layouts are treated as empty on read; nothing is written (and the
    // old string is not silently replaced) until the setting itself is fixed.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
            global.log('greenTile layouts setting is corrupt, not writing it');
        }
        return false;
    }
    const next = layoutsSet(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), patch);
    app.config.settings.setValue(SETTINGS_KEYS.layouts, JSON.stringify(next));
    return true;
};
/**
 * @param {AppFacade} app
 * @param {Preset[]} presets
 */
var presetsWrite = (app, presets) => {
    app.config.settings.setValue(SETTINGS_KEYS.presets, JSON.stringify(presets));
};
/**
 * @param {Rule[]} rules
 * @param {number} n
 * @returns {Rule | null}
 */
var rulesPick = (rules, n) => {
    let match = null;
    for (const rule of rules) {
        if (n >= rule.min) {
            match = rule;
        }
    }
    return match;
};
// Layout greenTile tiles for n windows on this monitor and the given workspace: the
// preset rule filled to n (fillStacks), or the automatic grid — with a stored
// dragged shape (lib/model/drop.js) winning over both. null when nothing is tiled.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {number} n
 * @returns {DragLayout | null}
 */
var layoutShapeWs = (app, monitorIndex, wsIndex, n) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    const mode = singleMode(app.config.settings.getValue(SETTINGS_KEYS.singleWindowMode));
    const single = singleActive(mode, n);
    if (!monitor || (n < 2 && !single)) {
        return null;
    }
    const layoutState = layoutFor(app, monitorIndex, wsIndex);
    // Paused monitor-workspaces (auto off) accept no placement at all: swap and the
    // dnd preview/placement routes read their shape here, free OS drags stay untouched.
    if (!layoutState.auto) {
        return null;
    }
    // The lone-window layout for the mode (fill = full area, center = the golden
    // frame); only reached for n = 1, where the guard above let it through.
    const lone = () => singleBase(mode, usableArea(monitor), gapValue(app.config.settings.getValue(SETTINGS_KEYS.windowGap)));
    /** @type {DragLayout | null} */
    let base = null;
    if (layoutState.preset) {
        const rule = rulesPick(layoutState.preset.rules, n);
        if (rule && rule.stacks && rule.stacks.length !== 0) {
            const shape = fillStacks(rule.stacks, n);
            base = { kind: 'cols', shape: shape, rule: rule, preset: layoutState.preset };
            // Painted columns stretch to the whole monitor, so the rule's spans ARE the
            // starting widths of the layout; cut to the filled column count — columns
            // only ever drop from the right (fillStacks).
            if (rule.spans) {
                base.weights = rule.spans.slice(0, shape.length);
            }
        }
        else if (single) {
            // No rule applies to a lone window: the user's single-window mode decides.
            base = lone();
        }
        else {
            return null;
        }
    } else if (layoutState.auto) {
        // Automatic tiling without a preset: a centered lone window still centers,
        // every other count keeps the automatic grid.
        base = (single && mode === 'center') ? lone() : autoShape(monitor, n);
    }
    if (!base) {
        return null;
    }
    // A dragged shape for this monitor + workspace + window count wins over the
    // preset rule / auto grid; corrupt layouts read as empty ({}), so nothing stored.
    const ref = app.split.ref(app, monitorIndex, wsIndex, n);
    if (!ref) {
        return base;
    }
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    const dragged = layoutsShapes(layouts, ref.mkey, ref.wskey)[ref.n];
    // A resize of a one-off column arrangement explicitly retains its orientation.
    // Same-kind minimum regrouping still starts nominally; presets and dragged shapes
    // remain authoritative, and automatic adaptations never create manual intent.
    const manual = !base.preset ? app.split.manual(app, monitorIndex, wsIndex, n) : null;
    const resolved = layoutResolve(layoutResolve(base, manual && manual.kind !== base.kind ? manual : null, n), dragged, n);
    // The spans describe the PRESET's own shape: a stored dragged shape replaces that
    // shape, and its starting widths are the equal division again. layoutResolve only
    // ever returns base itself or a fresh mix of base and the dragged shape, so any
    // other object here is a replaced shape (its transient `area` goes with it).
    if (resolved && resolved !== base) {
        delete resolved.weights;
        delete resolved.area;
    }
    return resolved;
};
// Layout for the active workspace.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} n
 * @returns {DragLayout | null}
 */
var layoutShape = (app, monitorIndex, n) => layoutShapeWs(app, monitorIndex, global.workspace_manager.get_active_workspace().index(), n);
