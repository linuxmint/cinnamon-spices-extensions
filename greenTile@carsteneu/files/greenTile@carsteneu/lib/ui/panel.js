/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Preset panel frame (open/close/position/drag/toggle/rebuild) and view 1 (the
 * preset card grid). lib/ui requires lib/model and PANEL_ESC_NAME from
 * lib/runtime/hotkeys; the tiling functions reach the UI through the explicit
 * frozen ops facade on the App (app.ops).
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
const { GAP_MAX, GAP_STEP, gapValue } = XLET.lib.model.gap;
const { PANEL_MIN, panelSizeParse, panelSizeSet, panelSizeClamp } = XLET.lib.model['panel-size'];
const { themeToggleTarget } = XLET.lib.model.theme;
const { fillStacks } = XLET.lib.model.fill;
const { gridLayout, gridScale, gridRows } = XLET.lib.model.grid;
const { PANEL_ESC_NAME } = XLET.lib.runtime.hotkeys;
const { windowTileable } = XLET.lib.tiling.windows;
const { panelThumb, panelMiddle } = XLET.lib.ui.draw;
const { editorOpen, editorOpenNew, editorBack, editorBody } = XLET.lib.ui.editor;
const { _ } = XLET.lib.ui.i18n;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

// Preset panel — view 1 (selection list) and, further below, view 2 (editor);
// design tokens from the approved HTML mockup (docs/superpowers/specs/2026-09-28-preset-ui-design.md).
// Thumbnail = the rule a click would apply right now (current window count);
// fallback: the smallest rule, so an empty workspace still shows the base layout.
/**
 * @param {AppFacade} app
 * @returns {number}
 */
var panelWindowCount = (app) => {
    const Main = imports.ui.main;
    const { focusWindow, collectWindows } = app.ops;
    const focused = focusWindow();
    if (!focused) {
        return 0;
    }
    const monitor = Main.layoutManager.monitors[focused.get_monitor()];
    // Same admissibility as the retile's hasFocus (lib/tiling/retile.js): an
    // inadmissible focused window (app-less, classless) is a window a click
    // counts for nobody, so the thumbnail and the editor's rule pick must not
    // count it either.
    return collectWindows(app, monitor, focused).length
        + ((!app.excl.isExcluded(focused) && windowTileable(focused)) ? 1 : 0);
};
// Card visual tokens: the padding between the card edge and the preview, and the
// preview height. Keep PRESET_CARD_PAD in sync with .gk-card-box in
// stylesheet.css and the row/column spacing with PRESET_CARD_GAP in
// lib/model/grid.js.
const PRESET_CARD_PAD = 8;
const PRESET_CARD_THUMB_H = 58;
// Fixed horizontal chrome inside a card that the preview does not get: the 1px
// .gk-card border on both sides, the .gk-card-stripe and both paddings. It is a
// CSS length, so the panel scales it by the session's theme scale factor (the
// model's PRESET_CARD_CHROME is the same number; the panel-card test pins the
// agreement). The preview height stays scale-1: heights are not part of the fix.
const PRESET_CARD_CHROME_W = 2 + 3 + 2 * PRESET_CARD_PAD;
/**
 * One preset card: a large layout preview (the rule a click would apply right
 * now) above the name, an always-visible edit pencil and, while this preset is
 * assigned here, a state-coloured stripe with a check and an unassign ✕. The
 * assigned look is toggled in place by setAssigned, so applying a preset does
 * not rebuild (and jump) the open panel. Edit opens the editor only; the ✕ only
 * clears the assignment — neither applies or deletes the preset.
 * @param {AppFacade} app
 * @param {Preset} preset
 * @param {number} n
 * @param {number} width card width in px
 * @param {number} chrome scaled horizontal card chrome in px the preview does not get
 * @param {(preset: Preset) => void} onApply
 * @param {() => void} onUnassign
 * @returns {{ preset: Preset, actor: AnyRecord, setAssigned: (assigned: boolean) => void, setWidth: (width: number) => void }}
 */
const panelCard = (app, preset, n, width, chrome, onApply, onUnassign) => {
    const St = imports.gi.St;
    const Tooltips = imports.ui.tooltips;
    const { rulesPick } = app.ops;
    // can_focus is the keyboard path to a preset: a focused St.Button activates on
    // Enter/Space on its own, and the card carries a focus look of its own
    // (stylesheet .gk-card:focus), separate from hover.
    const card = new St.Button({ style_class: 'gk-card', reactive: true, can_focus: true, track_hover: true });
    const outer = new St.BoxLayout({ x_expand: true });
    // State stripe as its own actor down the left edge — St draws per-side border
    // colours unreliably, so the stripe is a sibling of the box; shown while this
    // preset is assigned here.
    const stripe = new St.Bin({ style_class: 'gk-card-stripe' });
    outer.add(stripe, { x_fill: false, y_fill: true });
    const box = new St.BoxLayout({ vertical: true, style_class: 'gk-card-box', x_expand: true });
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    card.set_child(outer);
    // Edit pencil top-right, always visible (never hover-only); the expanding
    // spacer pushes it to the edge.
    const top = new St.BoxLayout({ style_class: 'gk-card-top' });
    top.add(new St.Bin(), { expand: true, x_fill: true, y_fill: false });
    const edit = new St.Button({ label: '✎', style_class: 'gk-icon-btn gk-card-edit', track_hover: true });
    new Tooltips.Tooltip(edit, _("Edit preset"));
    edit.connect('clicked', () => editorOpen(app, preset));
    top.add(edit, panelMiddle());
    box.add(top);
    const picked = rulesPick(preset.rules, n);
    const rep = picked || preset.rules.reduce((/** @type {Rule | null} */ best, /** @type {Rule} */ rule) => (!best || rule.min < best.min ? rule : best), /** @type {Rule | null} */ (null));
    // A matching rule is shown filled to the window count, exactly as a click tiles it;
    // an empty workspace falls back to the smallest rule, with its own cell counts.
    const thumbStacks = rep && rep.stacks.length ? (picked ? fillStacks(rep.stacks, n) : rep.stacks) : [1];
    // The spans are cut to the same filled column count, so the card still shows
    // exactly the widths a click tiles.
    const thumbSpans = rep && rep.spans ? rep.spans.slice(0, thumbStacks.length) : null;
    const thumb = panelThumb(app, thumbStacks, { width: Math.max(1, width - chrome), height: PRESET_CARD_THUMB_H, gap: 3, vgap: 3, radius: 3, spans: thumbSpans });
    box.add(thumb, { x_fill: false, y_fill: false, x_align: St.Align.MIDDLE });
    const name = new St.Label({ text: preset.name, style_class: 'gk-name' });
    name.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.END;
    box.add(name, { x_fill: true, y_fill: false });
    // Assigned row: built always, shown by setAssigned. Its ✕ clears only this
    // workspace's assignment (never the preset) and must not apply via the card.
    const stateRow = new St.BoxLayout({ style_class: 'gk-card-state' });
    stateRow.add(new St.Label({ text: '✓ ' + _("Assigned"), style_class: 'gk-sub' }), { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    const un = new St.Button({ label: '✕', style_class: 'gk-icon-btn gk-card-unassign', track_hover: true });
    new Tooltips.Tooltip(un, _("Remove assignment"));
    un.connect('clicked', () => onUnassign());
    stateRow.add(un, panelMiddle());
    box.add(stateRow);
    card.connect('clicked', () => onApply(preset));
    /** @param {boolean} value */
    const setAssigned = (value) => {
        stripe.visible = value;
        stateRow.visible = value;
        card.style_class = 'gk-card' + (value ? ' gk-card-assigned' : '');
    };
    // Cards are resized in place when the panel width changes inside one column
    // band: the preview follows the card instead of being clipped.
    /** @param {number} value */
    const setWidth = (value) => {
        card.set_width(value);
        thumb.set_width(Math.max(1, value - chrome));
        thumb.queue_repaint();
    };
    setWidth(width);
    setAssigned(false);
    return { preset, actor: card, setAssigned, setWidth };
};
// "Gap between windows  − 8 px +" in the list view. Each click stores the value and,
// when automatic tiling is on for this workspace, retiles it shortly after (debounced,
// so fast repeated clicks tile once), so the new gap shows live.
/**
 * @param {AppFacade} app
 * @param {{ sync: () => void }} [resetCtl] receives the sync hook a card click uses to take
 *   the button away once the sizes it would reset are gone
 */
const panelGapRow = (app, resetCtl) => {
    const St = imports.gi.St;
    const { focusMonitorIndex, gap, layoutFor, retileMonitor } = app.ops;
    const row = new St.BoxLayout({ style_class: 'gk-gap-row' });
    row.add(new St.Label({ text: _("Gap between windows"), style_class: 'gk-gap-label' }), { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    const minus = new St.Button({ label: '−', style_class: 'gk-gap-btn', track_hover: true });
    const value = new St.Label({ style_class: 'gk-gap-value' });
    const plus = new St.Button({ label: '+', style_class: 'gk-gap-btn', track_hover: true });
    /** @param {number} px */
    const show = (px) => {
        value.text = _("%d px").format(px);
        minus.reactive = px > 0;
        minus.opacity = px > 0 ? 255 : 90;
        plus.reactive = px < GAP_MAX;
        plus.opacity = px < GAP_MAX ? 255 : 90;
    };
    /** @param {number} delta */
    const change = (delta) => {
        const next = gapValue(gap(app) + delta);
        app.config.settings.setValue(SETTINGS_KEYS.windowGap, next);
        show(next);
        app.auto.scheduleMonitor(app, focusMonitorIndex(), 150);
    };
    minus.connect('clicked', () => change(-GAP_STEP));
    plus.connect('clicked', () => change(GAP_STEP));
    // "Reset sizes": only when borders were moved on this monitor + workspace (lib/model/split.js);
    // clears them for every window count and retiles; the rebuild hides the button again.
    const monitorIndex = focusMonitorIndex();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (app.split.any(app, monitorIndex, wsIndex)) {
        const reset = new St.Button({ label: _("Reset sizes"), style_class: 'gk-reset-btn', track_hover: true });
        reset.connect('clicked', () => {
            app.split.reset(app, monitorIndex, wsIndex);
            if (layoutFor(app, monitorIndex, wsIndex).auto) {
                retileMonitor(app, monitorIndex, null);
            }
            panelRebuild(app);
        });
        row.add(reset, { y_fill: false, y_align: St.Align.MIDDLE });
        // A card click resets the same sizes, so the button has to leave the row — in
        // place, without a rebuild that would move the scroll position. One-way on purpose:
        // the row is only built when the panel opens, so sizes made afterwards (a hotkey
        // resize with the panel still open) bring the button back on the next open, not
        // into the open panel.
        if (resetCtl) {
            let gone = false;
            resetCtl.sync = () => {
                if (!gone && !app.split.any(app, monitorIndex, wsIndex)) {
                    gone = true;
                    reset.destroy();
                }
            };
        }
    }
    row.add(minus, { y_fill: false, y_align: St.Align.MIDDLE });
    row.add(value, { y_fill: false, y_align: St.Align.MIDDLE });
    row.add(plus, { y_fill: false, y_align: St.Align.MIDDLE });
    show(gap(app));
    return row;
};
/** @param {AppFacade} app */
var panelRebuild = (app) => {
    if (!app.panel.actor) {
        return;
    }
    const view = app.panel.view;
    const draft = app.panel.draft;
    app.panel.close();
    app.panel.view = view;
    app.panel.draft = draft;
    panelOpen(app);
};
/** @param {AppFacade} app */
const panelOpen = (app) => {
    const St = imports.gi.St;
    const Clutter = imports.gi.Clutter;
    const Util = imports.misc.util;
    const Tooltips = imports.ui.tooltips;
    const Main = imports.ui.main;
    const GLib = imports.gi.GLib;
    const UUID = 'greenTile@carsteneu';
    // The theme context's scale factor multiplies every CSS px our grid constants
    // model (HiDPI and fractional UI scaling); the JS geometry has to follow it or
    // the card row outgrows the panel and St paints the children past the panel's
    // background. Read once per open — a theme-set rebuilds an open panel
    // (lib/runtime/theme.js), so the value cannot go stale within one open.
    const themeScale = (() => {
        try {
            return gridScale(St.ThemeContext.get_for_stage(global.stage).scale_factor);
        }
        catch (_e) {
            return 1;
        }
    })();
    const cardChrome = Math.ceil(PRESET_CARD_CHROME_W * themeScale);
    const { focusMonitorIndex, focusWindow, layoutFor, layoutSet, retileMonitor, presetsRead } = app.ops;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monitorIndex = focusMonitorIndex();
    const draft = app.panel.view === 'editor' ? app.panel.draft : null;
    const panel = new St.BoxLayout({ vertical: true, style_class: app.theme.panelClass() + (draft ? '' : ' gk-panel-list'), reactive: true, can_focus: true });
    const header = new St.BoxLayout({ style_class: 'gk-panel-header', reactive: true });
    let titleText = _("Presets — workspace %d · %s").format(wsIndex + 1, app.monitors.labels[monitorIndex] || '');
    if (draft) {
        titleText = draft.isNew ? _("Create preset") : _("Edit %s").format(draft.name);
    }
    const title = new St.Label({ text: titleText, style_class: 'gk-title' });
    header.add(title, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    // Both are assigned further below and update the open panel in place: a card
    // click keeps the panel (scroll and focus) as it is instead of rebuilding it.
    /** @type {() => void} */
    let syncAuto = () => { };
    /** @type {(panelWidth: number) => void} */
    let refill = () => { };
    // Filled in by panelGapRow: hides the Reset-sizes button once a card click reset the
    // sizes it would have acted on.
    /** @type {{ sync: () => void }} */
    const resetCtl = { sync: () => { } };
    if (draft) {
        const backBtn = new St.Button({ label: '← ' + _("Back"), style_class: 'gk-back', track_hover: true });
        backBtn.connect('clicked', () => editorBack(app));
        header.add(backBtn);
    }
    else {
        // Automatic tiling state of this monitor and workspace (Super+Ctrl+A / Super+Ctrl+D),
        // shown and switchable here; turning it on tiles right away, like Super+Ctrl+A.
        const autoOn = layoutFor(app, monitorIndex, wsIndex).auto;
        const autoBtn = new St.Button({
            label: autoOn ? _("Auto: on") : _("Auto: off"),
            style_class: 'gk-auto' + (autoOn ? ' gk-auto-on' : ''),
            track_hover: true,
        });
        syncAuto = () => {
            const on = layoutFor(app, monitorIndex, wsIndex).auto;
            autoBtn.label = on ? _("Auto: on") : _("Auto: off");
            autoBtn.style_class = 'gk-auto' + (on ? ' gk-auto-on' : '');
        };
        autoBtn.connect('clicked', () => {
            if (layoutFor(app, monitorIndex, wsIndex).auto) {
                app.auto.deactivate(app);
            }
            else {
                app.auto.activate(app);
            }
            panelRebuild(app);
        });
        header.add(autoBtn, { y_fill: false, y_align: St.Align.MIDDLE });
        // Theme toggle: one click switches between light and dark; "Follow system" is
        // selectable again in the settings dialog. The glyph shows the theme a click
        // switches TO (moon in light mode, like most desktop apps do).
        const themeShown = app.theme.theme;
        const themeBtn = new St.Button({
            label: themeShown === 'light' ? '☾' : '☀',
            style_class: 'gk-close gk-theme',
            track_hover: true,
        });
        new Tooltips.Tooltip(themeBtn, themeShown === 'light' ? _("Dark theme") : _("Light theme"));
        themeBtn.connect('clicked', () => {
            app.config.settings.setValue(SETTINGS_KEYS.panelTheme, themeToggleTarget(app.theme.theme));
            // Cinnamon's XletSettings.setValue only saves the settings file — the
            // IN bind callback does not fire on programmatic changes, so the panel
            // re-theme and rebuild happen here. The guard swallows stray clicks
            // that follow the rebuild, like the Back button does.
            app.panel.guard();
            app.theme.changed();
        });
        header.add(themeBtn);
        // ⚙ opens the extension's settings dialog on its first page; the same dialog
        // Cinnamon opens from the Extensions manager.
        const settingsBtn = new St.Button({ label: '⚙', style_class: 'gk-close gk-settings', track_hover: true });
        settingsBtn.connect('clicked', () => {
            app.panel.close();
            Util.spawn(['xlet-settings', 'extension', UUID, '-t', '0']);
        });
        header.add(settingsBtn);
        const closeBtn = new St.Button({ label: '✕', style_class: 'gk-close', track_hover: true });
        closeBtn.connect('clicked', () => app.panel.close());
        header.add(closeBtn);
    }
    panel.add(header);
    // Drag the panel by hand: the WHOLE title bar is a handle (except the button).
    // Recipe from Cinnamon's dnd.js (_grabEvents/_ungrabEvents); it needs BOTH parts:
    //   Main.pushModal(panel)  → X delivers all events to Cinnamon, even over native windows
    //   device.grab(panel)     → Clutter routes them to the panel, not to the actor under the pointer
    // Either one alone loses motion/release as soon as the pointer leaves the panel.
    /** @type {{ dx: number, dy: number, device: AnyRecord } | null} */
    let drag = null;
    // Resize state (grip in the bottom right corner); set up further below, once the
    // stretching part (card area or painter) exists. Declared here for the handlers.
    /** @type {{ device: AnyRecord, gx: number, gy: number, w: number, h: number, last: any, max: { w: number, h: number } } | null} */
    let resize = null;
    /** @type {(event: AnyRecord) => void} */
    let onResizeMotion = () => { };
    /** @type {() => void} */
    let endResize = () => { };
    const endDrag = () => {
        if (!drag) {
            return;
        }
        drag.device.ungrab();
        try {
            Main.popModal(panel);
        } catch (_e) {
            // modal already popped (main.js pops it on actor destroy)
        }
        drag = null;
        app.panel.dragging = false;
        const [px, py] = panel.get_position();
        app.session.panelSaved = { x: Math.round(px), y: Math.round(py) };
        global.log('greenTile panel moved to ' + Math.round(px) + ',' + Math.round(py));
    };
    /** @param {AnyRecord} a @param {AnyRecord} event */
    const onDragMotion = (a, event) => {
        if (resize) {
            onResizeMotion(event);
            return Clutter.EVENT_STOP;
        }
        if (!drag) {
            return Clutter.EVENT_PROPAGATE;
        }
        const [gx, gy] = event.get_coords();
        panel.set_position(Math.round(gx - drag.dx), Math.round(gy - drag.dy));
        return Clutter.EVENT_STOP;
    };
    const onDragRelease = () => {
        if (resize) {
            endResize();
            return Clutter.EVENT_STOP;
        }
        if (!drag) {
            return Clutter.EVENT_PROPAGATE;
        }
        endDrag();
        return Clutter.EVENT_STOP;
    };
    header.connect('button-press-event', (/** @type {AnyRecord} */ a, /** @type {AnyRecord} */ event) => {
        const src = event.get_source();
        if (src !== header && src !== title) {
            return Clutter.EVENT_PROPAGATE;
        }
        const [gx, gy] = event.get_coords();
        const [px, py] = panel.get_position();
        if (isNaN(px) || isNaN(py)) {
            return Clutter.EVENT_PROPAGATE;
        }
        endDrag();
        if (!Main.pushModal(panel)) {
            return Clutter.EVENT_PROPAGATE;
        }
        const device = event.get_device();
        device.grab(panel);
        app.panel.dragging = true;
        drag = { dx: gx - px, dy: gy - py, device };
        return Clutter.EVENT_STOP;
    });
    panel.connect('motion-event', onDragMotion);
    panel.connect('button-release-event', onDragRelease);
    panel.connect('destroy', () => {
        endDrag();
        endResize();
    });
    // Double-click guard: right after a switch between list and editor, mouse buttons
    // on the panel are swallowed in the capture phase, before any button, card or the
    // painter sees them (a double-click on Save would otherwise apply the card
    // under the pointer; one on ✎ would paint into the editor).
    panel.connect('captured-event', (/** @type {AnyRecord} */ a, /** @type {AnyRecord} */ event) => {
        const type = event.type();
        if ((type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.BUTTON_RELEASE)
            && GLib.get_monotonic_time() < app.panel.guardUntil) {
                return Clutter.EVENT_STOP;
            }
        return Clutter.EVENT_PROPAGATE;
    });
    /** @type {any} */
    let rowsBox = null;
    let scroll = null;
    let editor = null;
    // The stored size (and the view) are resolved before the stretching part
    // exists: the card grid has to know the panel width to pick its column count.
    const sizeView = draft ? 'editor' : 'list';
    const sizeMin = PANEL_MIN[sizeView];
    const storedSize = panelSizeParse(app.config.settings.getValue(SETTINGS_KEYS.panelSize))[sizeView];
    // Footer: the list's hint and, in both views, the resize grip in the corner.
    const footer = new St.BoxLayout({ style_class: 'gk-footer' });
    const grip = new St.Label({ text: '◢', style_class: 'gk-grip', reactive: true, track_hover: true });
    if (draft) {
        editor = editorBody(app);
        panel.add(editor.actor);
    }
    else {
        const presets = presetsRead(app);
        const n = panelWindowCount(app);
        rowsBox = new St.BoxLayout({ vertical: true, style_class: 'gk-cards' });
        // Equal-width cards in as many columns as the panel width holds. refill()
        // rebuilds the rows when the COLUMN count changes (panel resize) and only
        // resizes the cards when the width alone changes, so a plain apply never
        // touches the scroll position and a grip drag does not thrash the tree.
        /** @type {Array<{ preset: Preset, actor: AnyRecord, setAssigned: (a: boolean) => void, setWidth: (w: number) => void }>} */
        const cards = [];
        let lastCols = 0;
        let lastCardW = 0;
        /** @param {Preset} preset */
        const assignedHere = (preset) => {
            const assigned = layoutFor(app, monitorIndex, wsIndex).preset;
            return assigned != null && assigned.id === preset.id;
        };
        const syncCards = () => {
            for (const card of cards) {
                card.setAssigned(assignedHere(card.preset));
            }
        };
        // A card click assigns the preset AND turns automatic tiling on, then
        // retiles — the old row click exactly. The retained auto command for this
        // target is superseded by the assignment (a refused write supersedes
        // nothing); a paused monitor/workspace is switched on again.
        /** @param {Preset} preset */
        const applyPreset = (preset) => {
            const assigned = layoutSet(app, monitorIndex, wsIndex, { preset: preset.id });
            if (assigned) {
                global.log('greenTile preset "' + preset.name + '" assigned ws' + wsIndex);
                app.session.dropIntent(app, monitorIndex, wsIndex);
            }
            if (!layoutFor(app, monitorIndex, wsIndex).auto) {
                layoutSet(app, monitorIndex, wsIndex, { auto: true });
            }
            // The click is the user's latest input, so it BINDS: this workspace's dragged
            // shapes and moved borders are cleared — exactly what Reset sizes does — so the
            // clicked preset's own layout is what the single retile below places and no
            // stored size overrides the click. Gated on the accepted assignment (a refused
            // write supersedes nothing) and done before the retile (nothing stale is placed
            // first, and one retile is enough). Split.reset also drops the debounced pending
            // borders of this workspace, which would otherwise come back half a second later.
            if (assigned && app.split.any(app, monitorIndex, wsIndex)) {
                app.split.reset(app, monitorIndex, wsIndex);
                resetCtl.sync();
            }
            retileMonitor(app, monitorIndex, focusWindow());
            // The panel stays open so several presets can be tried in a row; the
            // assigned look moves in place, without a rebuild that would jump.
            // The card grows by the assigned row, so the scroll fit is re-run.
            syncCards();
            syncAuto();
            fitScroll();
        };
        // The ✕ clears only this workspace's assignment — never the preset. The entry
        // may hold nothing but the preset (auto is derived from it), so dropping it can
        // drop Auto as well: the header and the scroll fit follow, exactly as after a
        // full rebuild before.
        const unassign = () => {
            layoutSet(app, monitorIndex, wsIndex, { preset: null });
            global.log('greenTile preset unassigned ws' + wsIndex);
            syncCards();
            syncAuto();
            fitScroll();
        };
        refill = (panelWidth) => {
            const layout = gridLayout(panelWidth, themeScale);
            const cols = layout.columns;
            const cardW = layout.cardWidth;
            if (cols === lastCols && cardW === lastCardW) {
                return;
            }
            if (cols === lastCols) {
                // Same rows, new width: resize in place. A grip drag moves by single
                // pixels — rebuilding the actor tree per motion event would thrash it.
                lastCardW = cardW;
                for (const card of cards) {
                    card.setWidth(cardW);
                }
                return;
            }
            lastCols = cols;
            lastCardW = cardW;
            rowsBox.destroy_all_children();
            cards.length = 0;
            if (presets.length === 0) {
                rowsBox.add(new St.Label({ text: _("No presets yet."), style_class: 'gk-muted' }));
                return;
            }
            for (const rowPresets of gridRows(presets, cols)) {
                const row = new St.BoxLayout({ style_class: 'gk-card-row', x_expand: true });
                for (const preset of rowPresets) {
                    const card = panelCard(app, preset, n, cardW, cardChrome, applyPreset, unassign);
                    cards.push(card);
                    row.add(card.actor, { x_fill: false, y_fill: true });
                }
                rowsBox.add(row);
            }
            syncCards();
        };
        refill(storedSize ? storedSize.w : PANEL_MIN.list.w);
        // Truthful preview context, shared by all cards: the layout each card draws
        // is the one a click would apply for THIS window count. An empty workspace
        // falls back to the base layout, so the line then says so instead of "0".
        // Two singular/plural msgids: the project's gettext binding has no
        // ngettext, and a single "%d windows" would read "1 windows".
        const preview = n === 1 ? _("Preview for %d window").format(n)
            : (n > 0 ? _("Preview for %d windows").format(n) : _("No windows open — base layout"));
        panel.add(new St.Label({ text: preview, style_class: 'gk-preview' }));
        // vscrollbar starts as NEVER: with AUTOMATIC, Cinnamon's St reserves the bar's 21px
        // even when there is nothing to scroll (cards end too far from the right edge). The bar
        // is switched on in the allocation handler once the list exceeds LIST_MAX.
        scroll = new St.ScrollView({
            style_class: 'gk-scroll',
            reactive: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
        });
        scroll.add_actor(rowsBox);
        panel.add(scroll);
        panel.add(panelGapRow(app, resetCtl));
        const plus = new St.Button({ label: '＋ ' + _("New preset"), style_class: 'gk-plus', x_fill: true, track_hover: true });
        plus.connect('clicked', () => editorOpenNew(app));
        panel.add(plus);
        const hint = new St.Label({ text: _("Click a card to apply it to this workspace and tile right away"), style_class: 'gk-hint' });
        footer.add(hint, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    }
    // expand: in the editor there is no hint before the grip, it must still sit right.
    footer.add(grip, { expand: true, x_fill: false, y_fill: false, x_align: St.Align.END, y_align: St.Align.END });
    panel.add(footer);
    Main.layoutManager.addChrome(panel);
    app.panel.actor = panel;
    // Monitors come and go (external display plugged in or out). A saved position
    // whose title bar is on no current monitor would open the panel off screen, so it
    // is dropped and the panel is centred again. Probe point: title bar at list width.
    const monitors = Main.layoutManager.monitors;
    const monitorAt = (/** @type {number} */ x, /** @type {number} */ y) => monitors.find((/** @type {AnyRecord} */ m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) || null;
    const focusMonitor = () => {
        const focused = global.display.focus_window;
        return (focused && monitors[focused.get_monitor()]) || monitors[Main.layoutManager.primaryIndex] || monitors[0];
    };
    if (app.session.panelSaved && !monitorAt(app.session.panelSaved.x + 300, app.session.panelSaved.y + 20)) {
        global.log('greenTile panel position ' + app.session.panelSaved.x + ',' + app.session.panelSaved.y + ' is on no monitor, centring again');
        app.session.panelSaved = null;
    }
    // Keep the position across rebuilds (workspace switches, focus changes, view changes)
    app.panel.positioned = app.session.panelSaved != null;
    if (app.session.panelSaved) {
        panel.set_position(app.session.panelSaved.x, app.session.panelSaved.y);
    }
    // Resize with the grip in the bottom right corner, same grab recipe as the title-bar
    // drag (pushModal + device.grab). Width = panel width, height = the part that
    // stretches (list: card area, editor: painter; the rules column stays fixed).
    // Stored per view in SETTINGS_KEYS.panelSize, limited to the room on the panel's monitor.
    const stretch = draft ? (/** @type {AnyRecord} */ (editor)).painter : scroll;
    const panelMonitor = () => {
        const [px, py] = panel.get_position();
        return monitorAt(px + 300, py + 20) || focusMonitor();
    };
    // The list's scrollbar only when the cards do not fit (AUTOMATIC reserves its width
    // even when there is nothing to scroll, see below).
    const fitScroll = () => {
        if (!scroll) {
            return;
        }
        const [, natural] = rowsBox.get_preferred_height(-1);
        const policy = natural > scroll.get_height() + 1 ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
        if (scroll.vscrollbar_policy !== policy) {
            scroll.vscrollbar_policy = policy;
        }
    };
    if (storedSize) {
        const m = (app.session.panelSaved && monitorAt(app.session.panelSaved.x + 300, app.session.panelSaved.y + 20)) || focusMonitor();
        const width = Math.max(Math.min(storedSize.w, m.width), sizeMin.w);
        panel.set_width(width);
        stretch.set_height(Math.max(storedSize.h, sizeMin.h));
        // Card width follows the width actually used (the stored width clamped to
        // this monitor): the initial refill in the list branch used the raw stored
        // width, so a clamped-down panel corrects the column count and the card
        // width here.
        refill(width);
    }
    grip.connect('enter-event', () => global.set_cursor(imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT));
    grip.connect('leave-event', () => {
        if (!resize) {
            global.unset_cursor();
        }
    });
    grip.connect('button-press-event', (/** @type {AnyRecord} */ a, /** @type {AnyRecord} */ event) => {
        if (event.get_button() !== 1) {
            return Clutter.EVENT_PROPAGATE;
        }
        const [gx, gy] = event.get_coords();
        const [px, py] = panel.get_position();
        if (isNaN(px) || isNaN(py)) {
            return Clutter.EVENT_PROPAGATE;
        }
        endDrag();
        endResize();
        if (!Main.pushModal(panel)) {
            return Clutter.EVENT_PROPAGATE;
        }
        const device = event.get_device();
        device.grab(panel);
        app.panel.dragging = true;
        // From now on the user sets the list height: LIST_MAX must not cap it (it
        // measures the rows box, which the scroll view stretches to its own height).
        scrollCapped = true;
        const [pw, ph] = panel.get_size();
        const sh = stretch.get_height();
        const m = panelMonitor();
        resize = {
            device, gx, gy, w: pw, h: sh, last: null,
            max: { w: m.x + m.width - px, h: sh + (m.y + m.height - (py + ph)) },
        };
        global.set_cursor(imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT);
        return Clutter.EVENT_STOP;
    });
    onResizeMotion = (event) => {
        // onDragMotion guards `if (resize)` before calling here: the state exists.
        const rs = /** @type {{ device: AnyRecord, gx: number, gy: number, w: number, h: number, last: any, max: { w: number, h: number } }} */ (resize);
        const [gx, gy] = event.get_coords();
        const s = panelSizeClamp({ w: rs.w + gx - rs.gx, h: rs.h + gy - rs.gy }, sizeMin, rs.max);
        panel.set_width(s.w);
        stretch.set_height(s.h);
        // Widening/narrowing the panel moves the column count and the card width;
        // refill only rebuilds the rows when the count crosses and just resizes the
        // cards otherwise, so a drag does not thrash the actor tree per motion event.
        refill(s.w);
        fitScroll();
        rs.last = s;
    };
    endResize = () => {
        if (!resize) {
            return;
        }
        const r = resize;
        resize = null;
        r.device.ungrab();
        try {
            Main.popModal(panel);
        }
        catch (_e) {
            // modal already popped (main.js pops it on actor destroy)
        }
        global.unset_cursor();
        app.panel.dragging = false;
        if (r.last) {
            app.config.settings.setValue(SETTINGS_KEYS.panelSize, panelSizeSet(app.config.settings.getValue(SETTINGS_KEYS.panelSize), sizeView, r.last));
            global.log('greenTile panel ' + sizeView + ' resized to ' + r.last.w + 'x' + r.last.h);
        }
    };
    // LIST_MAX measured live: a two-row card block (cards ≈ 138 px, gap 14 px) is
    // roughly 290 px, so LIST_MAX caps the list shorter than two full rows and the
    // scrollbar appears once a third row would not fit.
    const LIST_MAX = 320;
    // With a stored size the list height is the user's, not LIST_MAX.
    let scrollCapped = storedSize != null;
    let clamped = false;
    let fitted = storedSize == null;
    panel.connect('notify::allocation', () => {
        // Allocation notifications can still arrive after close (destroy);
        // without this guard the centring would run on a dying actor.
        if (app.panel.actor !== panel) {
            return;
        }
        if (!fitted) {
            // A size stored on a bigger monitor (5K) can be taller than this one
            // (laptop): shrink the stretching part once, the position clamp follows.
            fitted = true;
            const box = panel.get_allocation_box();
            const excess = (box.y2 - box.y1) - panelMonitor().height;
            if (excess > 0) {
                stretch.set_height(Math.max(stretch.get_height() - excess, sizeMin.h));
            }
            fitScroll();
        }
        if (!app.panel.positioned) {
            app.panel.positioned = true;
            clamped = true;
            const monitor = focusMonitor();
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const cx = monitor.x + Math.max(monitor.width - width, 0) / 2;
            const cy = monitor.y + Math.max(monitor.height - height, 0) / 2.5;
            panel.set_position(Math.round(cx), Math.round(cy));
            app.session.panelSaved = { x: Math.round(cx), y: Math.round(cy) };
        }
        if (!clamped && !app.panel.dragging) {
            // Keep the whole panel inside the monitor its title bar is on: a panel dragged
            // near the right edge would stick out, and a smaller monitor after a display
            // change has the same effect. Both views are 600 px wide; probe at the centre.
            clamped = true;
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const [px, py] = panel.get_position();
            const monitor = monitorAt(px + 300, py + 20) || focusMonitor();
            const nx = Math.min(Math.max(px, monitor.x), monitor.x + Math.max(monitor.width - width, 0));
            const ny = Math.min(Math.max(py, monitor.y), monitor.y + Math.max(monitor.height - height, 0));
            if (nx !== px || ny !== py) {
                panel.set_position(Math.round(nx), Math.round(ny));
                app.session.panelSaved = { x: Math.round(nx), y: Math.round(ny) };
                global.log('greenTile panel clamped to ' + Math.round(nx) + ',' + Math.round(ny));
            }
        }
        if (scroll && !scrollCapped) {
            const rb = rowsBox.get_allocation_box();
            if (rb.y2 - rb.y1 > LIST_MAX) {
                scrollCapped = true;
                scroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
                scroll.set_height(LIST_MAX);
            }
        }
    });
    // The list follows the desktop: a workspace switch re-renders it (title,
    // assignment, thumbnail window count). The editor is never rebuilt by these
    // signals, it would lose the draft.
    // Meta.WorkspaceManager emits "workspace-switched" (windowManager.js:435).
    // A rebuild during an active drag would kill the grab, so it is skipped then.
    const onWorkspaceSwitched = () => {
        if (app.panel.view === 'editor') {
            return;
        }
        if (app.panel.dragging) {
            global.log('greenTile rebuild suppressed (drag)');
        }
        else {
            panelRebuild(app);
        }
    };
    app.panel.sig.push({ obj: global.workspace_manager, id: global.workspace_manager.connect('workspace-switched', onWorkspaceSwitched) });
    // Clicking outside closes the panel, in both views, without a grab: the click
    // still acts on whatever it hit. Chrome surfaces (Cinnamon's panels, menus,
    // other extensions' overlays) deliver Clutter events — close when the pressed
    // actor is not the panel or one of its children. This needs the CAPTURE phase:
    // applet buttons handle their button presses with EVENT_STOP, so a plain
    // stage button-press listener never sees them; captured-event passes every
    // event on its way down, before the actor under the pointer. With the editor's
    // modal active the stage input is FULLSCREEN (main.js pushModal), so EVERY
    // outside click arrives here; in list mode clicks on windows and the desktop
    // go to the clients instead — they close the panel through the focus change
    // below.
    app.panel.sig.push({
        obj: global.stage,
        id: global.stage.connect('captured-event', (/** @type {AnyRecord} */ stage, /** @type {AnyRecord} */ event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS) {
                return Clutter.EVENT_PROPAGATE;
            }
            if (app.panel.dragging) {
                return Clutter.EVENT_PROPAGATE;
            }
            const src = event.get_source();
            if (src && app.panel.actor && app.panel.actor.contains(src)) {
                return Clutter.EVENT_PROPAGATE;
            }
            global.log('greenTile panel closed by outside click');
            app.panel.close();
            return Clutter.EVENT_PROPAGATE;
        }),
    });
    // A click into a window or on the desktop (Nemo) never becomes a stage event
    // in list mode, but it changes the focus: that closes the panel too, the
    // editor included (its draft is dropped, as with Esc and Back). Any other
    // focus change — a window opening, an app demanding attention — closes it as
    // well; that is the price of the passive approach. Suppressed during a drag,
    // which would otherwise lose its grab.
    app.panel.sig.push({
        obj: global.display,
        id: global.display.connect('notify::focus-window', () => {
            if (app.panel.dragging) {
                global.log('greenTile close suppressed (drag)');
                return;
            }
            global.log('greenTile panel closed by focus change');
            app.panel.close();
        }),
    });
    // No monitors-changed handler here: on a display change enable() recreates the whole
    // App, which closes the panel; the saved-position check above covers the next open.
    panel.connect('key-press-event', (/** @type {AnyRecord} */ a, /** @type {AnyRecord} */ event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            if (app.panel.view === 'editor') {
                editorBack(app);
            }
            else {
                app.panel.close();
            }
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    // The list has no modal (it must not block the desktop), so it never gets key
    // events itself. Escape is therefore grabbed as a hotkey while the list is open
    // (same way the classic grid binds its Escape); released in app.panel.close().
    // Side effect: while the list is open, applications do not receive Escape.
    if (!draft) {
        Main.keybindingManager.addHotKey(PANEL_ESC_NAME, 'Escape', () => app.panel.close());
        app.panel.escBound = true;
    }
    global.log('greenTile panel open' + (draft ? ' (editor)' : ''));
    if (editor) {
        // The name entry needs the keyboard; a chrome actor only gets key events while
        // Cinnamon holds a modal grab. The modal sits on the editor body, NOT on the panel:
        // popModal restores the key focus only for the topmost record, so the drag
        // (pushModal(panel)) and the painter stroke (pushModal(area)) must stay separate
        // records that hand the focus back to the entry. Destroying the panel pops it.
        if (Main.pushModal(editor.actor)) {
            editor.entry.grab_key_focus();
        }
        else {
            global.log('greenTile editor: pushModal failed, the name entry gets no keyboard');
        }
    }
    else {
        panel.grab_key_focus();
    }
};
/** @param {AppFacade} app */
var panelToggle = (app) => {
    if (app.panel.actor) {
        app.panel.close();
    }
    else {
        panelOpen(app);
    }
};
