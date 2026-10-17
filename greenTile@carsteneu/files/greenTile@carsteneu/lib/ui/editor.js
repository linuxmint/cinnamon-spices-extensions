/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Preset panel view 2 (the editor). lib/ui requires lib/model and
 * PANEL_ESC_NAME from lib/runtime/hotkeys; the tiling functions reach the UI
 * through the explicit frozen ops facade on the App (app.ops).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

// Cinnamon imports are read lazily inside every function on purpose, like
// lib/runtime's injected deps: a module top-level alias would bind to whatever
// `imports` was live at first load, and the Node tests re-evaluate the entry
// per fresh fake environment against a cached require graph.
const { editorCols, editorRows, editorMinFloor, editorClamp, editorSpans, editorPaint, editorPaintRange, editorRemove, editorMerge, editorSplit, editorSort, editorAddRule, editorDeleteRule, editorStepMin, editorValidate, editorNewId, editorCommit, editorDeletePreset } = XLET.lib.model.editor;
const { layoutsParse, layoutsRemovePreset } = XLET.lib.model.layouts;
const { accentHandleInk } = XLET.lib.model.accent;
const { panelRoundRect, panelRoundRectStroke, panelThumb, panelMiddle } = XLET.lib.ui.draw;
const { _ } = XLET.lib.ui.i18n;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

/**
 * @param {AppFacade} app
 * @param {Preset} preset
 */
var editorOpen = (app, preset) => {
    const { rulesPick, windowCount: panelWindowCount, rebuild: panelRebuild } = app.ops;
    const rules = editorSort((preset.rules || []).map((r) => {
        const stacks = editorClamp(r.stacks || []);
        return { min: r.min, stacks: stacks, spans: editorSpans(r.spans, stacks.length) };
    }));
    if (rules.length === 0) {
        rules.push({ min: editorMinFloor, stacks: [1, 1] });
    }
    // Start on the rule a click in view 1 would apply right now
    const pick = rulesPick(rules, panelWindowCount(app));
    app.panel.draft = { id: preset.id, name: preset.name || '', rules, index: Math.max(rules.indexOf(/** @type {Rule} */ (pick)), 0), isNew: !!preset.isNew };
    app.panel.view = 'editor';
    app.panel.guard();
    panelRebuild(app);
};
/** @param {AppFacade} app */
var editorOpenNew = (app) => {
    const { presetsRead } = app.ops;
    editorOpen(app, { id: editorNewId(presetsRead(app)), name: '', rules: [{ min: editorMinFloor, stacks: [1, 1] }], isNew: true });
};
/** @param {AppFacade} app */
var editorBack = (app) => {
    const { rebuild: panelRebuild } = app.ops;
    app.panel.view = 'list';
    app.panel.draft = null;
    app.panel.guard();
    panelRebuild(app);
};
/**
 * @param {AppFacade} app
 * @param {AnyRecord} errorLabel
 */
const editorSave = (app, errorLabel) => {
    const { presetsRead, presetsWrite, layoutFor, retileMonitor } = app.ops;
    const d = app.panel.draft;
    if (!d) {
        return;
    }
    if (editorValidate(d) === 'name') {
        errorLabel.text = _("Please enter a name.");
        return;
    }
    const preset = { id: d.id, name: d.name.trim(), rules: d.rules.map((/** @type {Rule} */ r) => {
        /** @type {Rule} */
        const rule = { min: r.min, stacks: r.stacks.slice() };
        const spans = editorSpans(r.spans, r.stacks.length);
        // The field stays out of the stored rule while every column spans one grid
        // column: existing presets and the starters read byte-identically.
        if (spans.some((/** @type {number} */ s) => s > 1)) {
            rule.spans = spans;
        }
        return rule;
    }) };
    presetsWrite(app, editorCommit(presetsRead(app), preset));
    global.log('greenTile preset "' + preset.name + '" saved (' + preset.rules.length + ' rules)');
    editorBack(app);
    // Retile each monitor's ACTIVE workspace where the preset is in use AND automatic
    // tiling is on, whichever monitor is focused — inactive workspaces adopt the
    // changed rule on their next retile after a workspace switch. Paused (auto off,
    // see retileMonitor) stay untouched, and a per-drag stored shape (lib/model/drop.js)
    // still shadows the changed rule at placement.
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monCount = imports.ui.main.layoutManager.monitors.length;
    for (let i = 0; i < monCount; i++) {
        const layout = layoutFor(app, i, wsIndex);
        if (layout.preset && layout.preset.id === preset.id && layout.auto) {
            retileMonitor(app, i, null, true, wsIndex);
        }
    }
};
/** @param {AppFacade} app */
const presetsDelete = (app) => {
    const { presetsRead, presetsWrite } = app.ops;
    const d = app.panel.draft;
    if (!d) {
        return;
    }
    presetsWrite(app, editorDeletePreset(presetsRead(app), d.id));
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    // Corrupt layouts stay untouched until the setting is fixed, like layoutSet,
    // which logs the same condition only once.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
            global.log('greenTile layouts setting is corrupt, deleting preset without layout cleanup');
        }
    }
    else {
        app.config.settings.setValue(SETTINGS_KEYS.layouts, JSON.stringify(layoutsRemovePreset(layouts, d.id)));
    }
    global.log('greenTile preset "' + (d.name || d.id) + '" deleted');
    editorBack(app);
};
/**
 * @param {AppFacade} app
 * @param {Rule} rule
 * @param {boolean} active
 * @param {boolean} last
 * @param {() => void} onSelect
 */
const editorRuleRow = (app, rule, active, last, onSelect) => {
    const St = imports.gi.St;
    const row = new St.Button({
        style_class: 'gk-ed-rule' + (active ? ' gk-ed-rule-active' : '') + (last ? ' gk-ed-rule-last' : ''),
        x_fill: true, y_fill: true, track_hover: true, reactive: true,
    });
    const outer = new St.BoxLayout({ x_expand: true });
    if (active) {
        outer.add(new St.Bin({ style_class: 'gk-ed-rule-stripe' }), { x_fill: false, y_fill: true });
    }
    const box = new St.BoxLayout({ style_class: 'gk-ed-rule-box', x_expand: true });
    box.add(new St.Label({ text: _("from %d").format(rule.min), style_class: 'gk-ed-rule-label' }), { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    box.add(panelThumb(app, rule.stacks, { width: 34, height: 18, gap: 2, vgap: 1, radius: 1, color: active ? app.theme.rgb : app.theme.cairo('thumb'), spans: rule.spans || null }), panelMiddle());
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    row.set_child(outer);
    row.connect('clicked', () => onSelect());
    return row;
};
// Painter: 6 columns x 4 rows. Button 1 paints (row under the pointer = windows in the
// column), dragging paints every column passed; button 3 removes the column. A painted
// column stretches over its grid columns (the rule's spans); a handle on the boundary
// between two painted columns merges them, a handle inside a merged column splits one
// grid column off again.
/**
 * @param {AppFacade} app
 * @param {() => Rule} getRule
 * @param {(next: { stacks: number[], spans: number[] }) => void} onChange
 */
const editorPainter = (app, getRule, onChange) => {
    const St = imports.gi.St;
    const Clutter = imports.gi.Clutter;
    const Main = imports.ui.main;
    const frame = new St.Bin({ style_class: 'gk-painter', x_fill: true, y_fill: true });
    const area = new St.DrawingArea({ style_class: 'gk-painter-area', reactive: true, x_expand: true });
    frame.set_child(area);
    const gap = 3;
    /** Width and height of a boundary handle, in px. */
    const HANDLE_W = 5;
    const HANDLE_H = 16;
    /** Line width of the handle rim, in px — thick enough that the rim ink stays
     *  visible where the fill ink disappears into the surface under it. */
    const HANDLE_RIM = 2;
    /**
     * Geometry of the painted columns over a W x H painter: column c starts at grid
     * column sum(spans[0..c)) and is as wide as its grid columns plus the gaps between
     * them. The handles sit on the grid lines — on the line between two painted columns
     * (merge) and on the rightmost line inside a merged column (split).
     * @param {number} W
     * @param {number[]} stacks
     * @param {number[]} spans
     * @returns {{ cw: number, step: number, used: number,
     *   cols: Array<{ x: number, width: number }>,
     *   handles: Array<{ x: number, kind: 'merge' | 'split', col: number }> }}
     */
    const painterLayout = (W, stacks, spans) => {
        const cw = (W - gap * (editorCols - 1)) / editorCols;
        const step = cw + gap;
        /** @type {Array<{ x: number, width: number }>} */
        const cols = [];
        /** @type {Array<{ x: number, kind: 'merge' | 'split', col: number }>} */
        const handles = [];
        let start = 0;
        for (let c = 0; c < stacks.length; c++) {
            cols.push({ x: start * step, width: spans[c] * cw + (spans[c] - 1) * gap });
            if (spans[c] > 1) {
                handles.push({ x: (start + spans[c] - 1) * step - gap / 2, kind: 'split', col: c });
            }
            if (c + 1 < stacks.length) {
                handles.push({ x: (start + spans[c]) * step - gap / 2, kind: 'merge', col: c });
            }
            start += spans[c];
        }
        return { cw: cw, step: step, used: start, cols: cols, handles: handles };
    };
    area.connect('repaint', (/** @type {AnyRecord} */ a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const rule = getRule();
        const spans = editorSpans(rule.spans, rule.stacks.length);
        const lay = painterLayout(W, rule.stacks, spans);
        const accent = app.theme.rgb;
        for (let c = 0; c < lay.cols.length; c++) {
            cr.setSourceRGBA(accent[0] / 255, accent[1] / 255, accent[2] / 255, 0.85);
            const ch = (H - gap * (rule.stacks[c] - 1)) / rule.stacks[c];
            for (let r = 0; r < rule.stacks[c]; r++) {
                panelRoundRect(cr, lay.cols[c].x, r * (ch + gap), lay.cols[c].width, ch, 2);
            }
        }
        for (let g = lay.used; g < editorCols; g++) {
            // empty column: dashed outline in the border colour
            const outline = app.theme.cairo('outline');
            cr.setSourceRGB(outline[0] / 255, outline[1] / 255, outline[2] / 255);
            cr.setLineWidth(1);
            cr.setDash([3, 3], 0);
            cr.rectangle(g * lay.step + 0.5, 0.5, lay.cw - 1, H - 1);
            cr.stroke();
            cr.setDash([], 0);
        }
        if (lay.handles.length) {
            // Each ink pair is picked for the surface its bands actually cover: a merge
            // handle lies in the gap between two painted columns, a split handle inside a
            // merged one. The bands line up with those surfaces because the geometry does:
            // the handle is HANDLE_W wide, the rim eats HANDLE_RIM / 2 per side, so the fill
            // band is HANDLE_W - HANDLE_RIM = gap wide and covers exactly the gap. The old
            // accent at 0.55 disappeared on the accent columns.
            const painter = app.theme.cairo('painter');
            const ink = { merge: accentHandleInk('merge', accent, painter), split: accentHandleInk('split', accent, painter) };
            for (const handle of lay.handles) {
                const colors = ink[handle.kind];
                const hx = handle.x - HANDLE_W / 2;
                const hy = H / 2 - HANDLE_H / 2;
                cr.setSourceRGBA(colors.fill[0] / 255, colors.fill[1] / 255, colors.fill[2] / 255, 1);
                panelRoundRect(cr, hx, hy, HANDLE_W, HANDLE_H, HANDLE_W / 2);
                cr.setSourceRGBA(colors.rim[0] / 255, colors.rim[1] / 255, colors.rim[2] / 255, 1);
                cr.setLineWidth(HANDLE_RIM);
                panelRoundRectStroke(cr, hx, hy, HANDLE_W, HANDLE_H, HANDLE_W / 2);
            }
        }
        cr.$dispose();
    });
    /**
     * Pointer position in the painter: a boundary handle when the pointer is on one,
     * otherwise the painted column under it and its row. `col === stacks.length` is the
     * empty space right of the last painted column (painting there adds one column).
     * @param {AnyRecord} event
     * @returns {{ handle: { x: number, kind: 'merge' | 'split', col: number } } | { col: number, row: number } | null}
     */
    const hitAt = (event) => {
        const [sx, sy] = event.get_coords();
        const [ok, lx, ly] = area.transform_stage_point(sx, sy);
        if (!ok) {
            return null;
        }
        const [w, h] = area.get_size();
        if (w <= 0 || h <= 0) {
            return null;
        }
        const rule = getRule();
        const lay = painterLayout(w, rule.stacks, editorSpans(rule.spans, rule.stacks.length));
        for (const handle of lay.handles) {
            if (Math.abs(lx - handle.x) <= HANDLE_W / 2 + 1 && Math.abs(ly - h / 2) <= HANDLE_H / 2) {
                return { handle: handle };
            }
        }
        let col = rule.stacks.length;
        for (let c = 0; c < lay.cols.length; c++) {
            if (lx < lay.cols[c].x + lay.cols[c].width + gap / 2) {
                col = c;
                break;
            }
        }
        // Right of the last painted column a click adds a column, but only while the
        // painter grid still has a free one: with all six grid columns taken it paints
        // the last column instead. Spans past the sixth are dropped again on read, so
        // an append here would silently lose the merge the user just made.
        if (col === rule.stacks.length && lay.used >= editorCols) {
            col = rule.stacks.length - 1;
        }
        return { col: col, row: Math.floor(ly / (h / editorRows)) };
    };
    /**
     * Paints one row into one column (or over the columns from..to), the spans staying
     * parallel to the stacks: a column the paint appends spans one grid column.
     * @param {Rule} rule
     * @param {number} col
     * @param {number} row
     */
    const paintColumn = (rule, col, row) => {
        const stacks = editorPaint(rule.stacks, col, row);
        return { stacks: stacks, spans: editorSpans(rule.spans, stacks.length) };
    };
    /**
     * @param {Rule} rule
     * @param {number} from
     * @param {number} to
     * @param {number} row
     */
    const paintRange = (rule, from, to, row) => {
        const stacks = editorPaintRange(rule.stacks, from, to, row);
        return { stacks: stacks, spans: editorSpans(rule.spans, stacks.length) };
    };
    /**
     * Right-click removes the whole painted column, its span with it.
     * @param {Rule} rule
     * @param {number} col
     */
    const removeColumn = (rule, col) => {
        const stacks = editorRemove(rule.stacks, col);
        if (stacks.length === rule.stacks.length) {
            return null;
        }
        const spans = editorSpans(rule.spans, rule.stacks.length);
        spans.splice(col, 1);
        return { stacks: stacks, spans: spans };
    };
    /** @type {{ device: AnyRecord, col: number } | null} */
    let stroke = null;
    const endStroke = () => {
        if (!stroke) {
            return;
        }
        const device = stroke.device;
        stroke = null;
        device.ungrab();
        try {
            Main.popModal(area);
        }
        catch (_e) {
            // already popped
        }
    };
    area.connect('button-press-event', (/** @type {AnyRecord} */ a, /** @type {AnyRecord} */ event) => {
        const hit = hitAt(event);
        if (!hit) {
            return Clutter.EVENT_PROPAGATE;
        }
        const button = event.get_button();
        const rule = getRule();
        if ('handle' in hit) {
            if (button !== 1) {
                return Clutter.EVENT_PROPAGATE;
            }
            endStroke();
            const next = hit.handle.kind === 'merge'
                ? editorMerge(rule.stacks, rule.spans, hit.handle.col)
                : editorSplit(rule.stacks, rule.spans, hit.handle.col);
            if (next) {
                onChange(next);
            }
            return Clutter.EVENT_STOP;
        }
        if (button === 3) {
            const removed = removeColumn(rule, hit.col);
            if (removed) {
                onChange(removed);
            }
            return Clutter.EVENT_STOP;
        }
        if (button !== 1) {
            return Clutter.EVENT_PROPAGATE;
        }
        endStroke();
        onChange(paintColumn(rule, hit.col, hit.row));
        // Same recipe as the title-bar drag (pushModal + device.grab): the stroke keeps
        // receiving motion and release when the pointer leaves the painter.
        if (Main.pushModal(area)) {
            const device = event.get_device();
            device.grab(area);
            stroke = { device, col: hit.col };
        }
        return Clutter.EVENT_STOP;
    });
    area.connect('motion-event', (/** @type {AnyRecord} */ a, /** @type {AnyRecord} */ event) => {
        if (!stroke) {
            return Clutter.EVENT_PROPAGATE;
        }
        const hit = hitAt(event);
        if (!hit || 'handle' in hit) {
            return Clutter.EVENT_STOP;
        }
        const rule = getRule();
        if (hit.col === stroke.col) {
            onChange(paintColumn(rule, hit.col, hit.row));
        }
        else {
            onChange(paintRange(rule, stroke.col + Math.sign(hit.col - stroke.col), hit.col, hit.row));
        }
        stroke.col = hit.col;
        return Clutter.EVENT_STOP;
    });
    area.connect('button-release-event', () => {
        if (!stroke) {
            return Clutter.EVENT_PROPAGATE;
        }
        endStroke();
        return Clutter.EVENT_STOP;
    });
    // Connected before any pushModal(area), so it runs before main.js' own destroy
    // handler and pops a valid record (popModal on an unknown actor ends ALL modals).
    area.connect('destroy', () => endStroke());
    return { actor: frame, area };
};
// Preset panel — view 2 (editor): rule list on the left, stepper + painter + name on
// the right (layout and tokens from the approved prototype). The draft
// {id, name, rules (sorted by min), index, isNew} is written to the settings on Save only.
// Cairo can't read the stylesheet: the theme component's accent state (updated by
// changed() before any panel exists) supplies the accent (app.theme.rgb).
/** @param {AppFacade} app */
var editorBody = (app) => {
    // The body is only built while the editor view holds a draft — set by
    // editorOpen/editorOpenNew, cleared only on close/save. The alias keeps that
    // invariant visible to tsc; the callbacks below fire only while it is open.
    const draft = /** @type {AnyRecord} */ (app.panel.draft);
    const St = imports.gi.St;
    const middle = panelMiddle();
    const body = new St.BoxLayout({ style_class: 'gk-ed-body', reactive: true });
    // left column: rules
    const left = new St.BoxLayout({ vertical: true, style_class: 'gk-ed-left' });
    left.add(new St.Label({ text: _("Rules (by window count)").toUpperCase(), style_class: 'gk-ed-label' }));
    const rulesBox = new St.BoxLayout({ vertical: true, style_class: 'gk-ed-rules' });
    left.add(rulesBox);
    const actions = new St.BoxLayout({ style_class: 'gk-ed-actions' });
    const addBtn = new St.Button({ label: '＋ ' + _("Rule"), style_class: 'gk-ed-add', track_hover: true });
    const delBtn = new St.Button({ label: '🗑 ' + _("Delete rule"), style_class: 'gk-ed-del', track_hover: true });
    actions.add(addBtn);
    actions.add(delBtn);
    left.add(actions);
    body.add(left, { x_fill: false, y_fill: false, y_align: St.Align.START });
    // right column: stepper, painter, name, save
    const right = new St.BoxLayout({ vertical: true, style_class: 'gk-ed-right', x_expand: true });
    const stepper = new St.BoxLayout({ style_class: 'gk-stepper' });
    stepper.add(new St.Label({ text: _("Rule applies from").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    const minus = new St.Button({ label: '−', style_class: 'gk-stepper-btn', track_hover: true });
    const value = new St.Label({ style_class: 'gk-stepper-value' });
    const plus = new St.Button({ label: '+', style_class: 'gk-stepper-btn', track_hover: true });
    stepper.add(minus, middle);
    stepper.add(value, middle);
    stepper.add(plus, middle);
    stepper.add(new St.Label({ text: _("windows").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    right.add(stepper);
    right.add(new St.Label({ text: _("Painter").toUpperCase(), style_class: 'gk-ed-label' }));
    let refresh = () => {};
    const painter = editorPainter(
        app,
        () => /** @type {Rule} */ (draft.rules[draft.index]),
        (/** @type {{ stacks: number[], spans: number[] }} */ next) => {
            const dr = draft;
            const rule = dr.rules[dr.index];
            if (next.stacks.join(',') === rule.stacks.join(',')
                && next.spans.join(',') === editorSpans(rule.spans, rule.stacks.length).join(',')) {
                return;
            }
            dr.rules[dr.index] = { min: rule.min, stacks: next.stacks, spans: next.spans };
            refresh();
        });
    right.add(painter.actor);
    const result = new St.Label({ style_class: 'gk-ed-faint' });
    right.add(result);
    const hint = new St.Label({ text: _("Click or drag: the row sets how many windows the column holds. Right-click removes a column."), style_class: 'gk-ed-faint' });
    hint.clutter_text.line_wrap = true;
    hint.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.NONE;
    right.add(hint);
    const nameRow = new St.BoxLayout({ style_class: 'gk-ed-name-row' });
    nameRow.add(new St.Label({ text: _("Name").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    const entry = new St.Entry({ style_class: 'gk-entry', text: draft.name, hint_text: _("Preset name"), can_focus: true, x_expand: true });
    nameRow.add(entry, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    right.add(nameRow);
    const saveRow = new St.BoxLayout({ style_class: 'gk-ed-save-row' });
    const delWrap = new St.BoxLayout();
    const presetDelBtn = new St.Button({ label: '🗑 ' + _("Delete preset"), style_class: 'gk-preset-del', track_hover: true });
    delWrap.add(presetDelBtn);
    const confirmWrap = new St.BoxLayout({ style_class: 'gk-preset-del-row' });
    confirmWrap.add(new St.Label({ text: _("Really delete?"), style_class: 'gk-preset-del-question' }), middle);
    const confirmBtn = new St.Button({ label: _("Delete"), style_class: 'gk-preset-del', track_hover: true });
    confirmWrap.add(confirmBtn, middle);
    const cancelBtn = new St.Button({ label: '✕', style_class: 'gk-preset-del-cancel', track_hover: true });
    confirmWrap.add(cancelBtn, middle);
    const save = new St.Button({ label: _("Save"), style_class: 'gk-save', track_hover: true });
    const error = new St.Label({ text: '', style_class: 'gk-error' });
    // A new, never-saved preset has nothing persistent to delete; Back/Esc is its discard.
    // Save sits left, the destructive delete at the outer right; the expanding error
    // label keeps the two apart.
    saveRow.add(save, middle);
    saveRow.add(error, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    if (!draft.isNew) {
        saveRow.add(delWrap, middle);
        saveRow.add(confirmWrap, middle);
    }
    right.add(saveRow);
    confirmWrap.hide();
    body.add(right, { expand: true, x_fill: true, y_fill: true });
    refresh = () => {
        const dr = draft;
        rulesBox.destroy_all_children();
        dr.rules.forEach((/** @type {Rule} */ rule, /** @type {number} */ i) => {
            rulesBox.add(editorRuleRow(app, rule, i === dr.index, i === dr.rules.length - 1, () => {
                dr.index = i;
                refresh();
            }));
        });
        const rule = dr.rules[dr.index];
        value.text = String(rule.min);
        result.text = _("Result: %s").format('[' + rule.stacks.join(',') + ']');
        const canDelete = dr.rules.length > 1;
        delBtn.reactive = canDelete;
        if (canDelete) {
            delBtn.remove_style_pseudo_class('insensitive');
        }
        else {
            delBtn.add_style_pseudo_class('insensitive');
        }
        painter.area.queue_repaint();
    };
    /** @param {{ rules: Rule[], index: number }} r */
    const apply = (r) => {
        draft.rules = r.rules;
        draft.index = r.index;
        refresh();
    };
    addBtn.connect('clicked', () => apply(editorAddRule(draft.rules)));
    delBtn.connect('clicked', () => apply(editorDeleteRule(draft.rules, draft.index)));
    minus.connect('clicked', () => apply(editorStepMin(draft.rules, draft.index, -1)));
    plus.connect('clicked', () => apply(editorStepMin(draft.rules, draft.index, 1)));
    entry.clutter_text.connect('text-changed', () => {
        draft.name = entry.get_text();
        error.text = '';
    });
    entry.clutter_text.connect('activate', () => editorSave(app, error));
    save.connect('clicked', () => editorSave(app, error));
    presetDelBtn.connect('clicked', () => {
        delWrap.hide();
        confirmWrap.show();
    });
    cancelBtn.connect('clicked', () => {
        confirmWrap.hide();
        delWrap.show();
    });
    confirmBtn.connect('clicked', () => presetsDelete(app));
    refresh();
    return { actor: body, entry, painter: painter.area };
};
