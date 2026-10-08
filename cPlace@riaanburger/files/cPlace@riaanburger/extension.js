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

// src/engine/apply.ts
var lastApplied = [];
function place(window, frame) {
  window.move_resize_frame(true, frame.x, frame.y, frame.width, frame.height);
  window.move_frame(true, frame.x, frame.y);
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
function move(window, frame, keep = () => {
}) {
  const kept = {
    window,
    frame: frameOf(window),
    maximised: window.get_maximized(),
    fullscreen: window.is_fullscreen(),
    minimised: window.minimized
  };
  keep(kept);
  if (kept.fullscreen) {
    window.unmake_fullscreen();
  }
  if (kept.maximised !== 0) {
    window.unmaximize(kept.maximised);
  }
  kept.frame = frameOf(window);
  place(window, frame);
  if (kept.minimised) {
    window.unminimize();
  }
  return kept;
}
function putBack(kept) {
  const window = kept.window;
  if (window.is_fullscreen()) {
    window.unmake_fullscreen();
  }
  const maximised = window.get_maximized();
  if (maximised !== 0) {
    window.unmaximize(maximised);
  }
  place(window, kept.frame);
  if (kept.maximised !== 0) {
    window.maximize(kept.maximised);
  }
  if (kept.fullscreen) {
    window.make_fullscreen();
  }
  if (kept.minimised) {
    window.minimize();
  } else if (window.minimized) {
    window.unminimize();
  }
}
function managedWindows() {
  return new Set(
    global.display.list_windows(imports.gi.Meta.ListWindowsFlags.DEFAULT)
  );
}
function apply(targets, liveWindows) {
  const managed = managedWindows();
  const kept = [];
  for (const target of targets) {
    const window = liveWindows[target.id];
    if (window === void 0 || !managed.has(window)) {
      continue;
    }
    passOverFault(window, "arranged", () => {
      move(window, target.frame, (entry) => kept.push(entry));
      window.raise();
    });
  }
  if (kept.length > 0) {
    lastApplied = kept;
  }
}
function passOverFault(window, what, part) {
  try {
    part();
    return true;
  } catch (error) {
    global.logError(
      `cPlace: "${window.get_title()}" was not ${what}: ${String(error)}`
    );
    return false;
  }
}
function forgetUndo() {
  lastApplied = [];
}
function undo() {
  const kept = lastApplied;
  lastApplied = [];
  const managed = managedWindows();
  let restored = 0;
  for (const entry of kept) {
    if (managed.has(entry.window) && passOverFault(entry.window, "put back", () => putBack(entry))) {
      restored += 1;
    }
  }
  return restored > 0;
}

// src/engine/digit-row.ts
function rowDigit(code) {
  const digit = code - 9;
  return digit >= 1 && digit <= 9 ? digit : 0;
}

// src/engine/chooser-keys.ts
var Clutter = imports.gi.Clutter;
function presetDigit(symbol) {
  for (const zero of [Clutter.KEY_0, Clutter.KEY_KP_0]) {
    const digit = symbol - zero;
    if (digit >= 1 && digit <= 9) {
      return digit;
    }
  }
  return 0;
}
function isEnter(symbol) {
  return symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter;
}
function enterAction(focus, leftToControl) {
  if (leftToControl) {
    return "left to the control";
  }
  return focus instanceof Clutter.Text ? "commit, then apply" : "apply";
}
function captureEnter(event, host) {
  if (event.type() !== Clutter.EventType.KEY_PRESS || !isEnter(event.get_key_symbol())) {
    return false;
  }
  const action = host.action();
  if (action === "left to the control") {
    return false;
  }
  if (action === "commit, then apply") {
    host.commit();
  }
  host.apply();
  return true;
}
function keyOf(event) {
  const real = event;
  const state = real.get_state();
  return {
    symbol: real.get_key_symbol(),
    code: real.get_key_code(),
    modifiers: {
      control: (state & Clutter.ModifierType.CONTROL_MASK) !== 0,
      shift: (state & Clutter.ModifierType.SHIFT_MASK) !== 0
    }
  };
}
function routeKey(key, route) {
  return deleteKey(key.symbol, route) || shellKey(key, route) || route.selectLetter(key.symbol) || route.page(key.symbol, key.modifiers);
}
function deleteKey(symbol, route) {
  if (symbol !== Clutter.KEY_Delete && symbol !== Clutter.KEY_KP_Delete) {
    route.disarm();
    return false;
  }
  return route.deletePreset();
}
function shellKey(key, route) {
  if (key.symbol === Clutter.KEY_Escape) {
    route.close();
    return true;
  }
  if (key.symbol === Clutter.KEY_u) {
    route.undo();
    return true;
  }
  const digit = presetDigit(key.symbol) || rowDigit(key.code);
  if (digit === 0) {
    return false;
  }
  if (key.modifiers.control) {
    route.savePreset(digit);
  } else {
    route.runPreset(digit);
  }
  return true;
}

// src/i18n.ts
var english = {
  one: (text) => text,
  counted: (one, many, count) => count === 1 ? one : many
};
var lookup = english;
function bindTranslations(uuid) {
  const Gettext = imports.gettext;
  Gettext.bindtextdomain(
    uuid,
    `${imports.gi.GLib.get_home_dir()}/.local/share/locale`
  );
  lookup = {
    one: (text) => {
      const own = Gettext.dgettext(uuid, text);
      return own !== text ? own : Gettext.gettext(text);
    },
    counted: (one, many, count) => Gettext.dngettext(uuid, one, many, count)
  };
}
function unbindTranslations() {
  lookup = english;
}
function _(text) {
  return lookup.one(text);
}
function ngettext(one, many, count) {
  return lookup.counted(one, many, count);
}
function fill(phrase, values) {
  return phrase.replace(/\{(\w+)\}/g, (token, name) => {
    const value = values[name];
    return value === void 0 ? token : String(value);
  });
}
function listed(...phrases) {
  return phrases.filter((phrase) => phrase !== "").join(", ");
}

// src/engine/presets.ts
function parsePresets(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  const store = {};
  if (!isRecord(parsed)) {
    return store;
  }
  for (const [arrangementKey, slots] of Object.entries(parsed)) {
    if (!isRecord(slots)) {
      continue;
    }
    const kept = {};
    for (const [digit, variables] of Object.entries(slots)) {
      if (/^[1-9]$/.test(digit) && isRecord(variables)) {
        kept[digit] = variables;
      }
    }
    store[arrangementKey] = kept;
  }
  return store;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function withPreset(store, arrangementKey, digit, variables) {
  const slots = { ...store[arrangementKey], [String(digit)]: variables };
  return { ...store, [arrangementKey]: slots };
}
function withoutPreset(store, arrangementKey, digit) {
  const slots = { ...store[arrangementKey] };
  delete slots[String(digit)];
  const rest = { ...store };
  delete rest[arrangementKey];
  return Object.keys(slots).length === 0 ? rest : { ...rest, [arrangementKey]: slots };
}

// src/engine/preset-column.ts
var St = imports.gi.St;
var PresetColumn = class {
  constructor(settings, events) {
    this.settings = settings;
    this.events = events;
    this.actor = new St.BoxLayout({
      vertical: true,
      style_class: "cplace-column"
    });
  }
  settings;
  events;
  actor;
  page = null;
  rows = [];
  armed = null;
  pointed = null;
  /** A page's presets as rows, built afresh. */
  show(page) {
    this.page = page;
    this.armed = null;
    this.pointed = null;
    this.rows = [];
    this.actor.destroy_all_children();
    const slots = this.settings.presetStore()[page.key] ?? {};
    for (const digit of Object.keys(slots).sort()) {
      const variables = slots[digit];
      if (variables !== void 0) {
        this.rows.push(this.addRow(Number(digit), variables));
      }
    }
    if (this.rows.length === 0) {
      this.actor.add_child(
        new St.Label({
          text: _("None saved; Ctrl+digit saves one."),
          style_class: "cplace-hint"
        })
      );
    }
  }
  /** Delete, pressed with a row focused: arms the row, or deletes its
   * preset when it is armed already. False when no row has the focus. */
  deleteKey() {
    const focus = global.stage.get_key_focus();
    const row = this.rows.find((candidate) => candidate.button === focus);
    if (row === void 0) {
      return false;
    }
    this.press(row);
    return true;
  }
  /** Whether an actor is one of the rows, which keep Enter as a click. */
  holds(actor) {
    return this.rows.some((row) => row.button === actor);
  }
  /** Anything but a deletion puts an armed row back. */
  disarm() {
    const row = this.armed;
    if (row !== null) {
      this.armed = null;
      this.label(row);
    }
  }
  /** The key focus on a preset's row, for the development handle. */
  focusRow(digit) {
    const row = this.rows.find((candidate) => candidate.digit === digit);
    row?.button.grab_key_focus();
    return row !== void 0;
  }
  /** A preset drawn as if its row were pointed at, or none given zero,
   * for the development handle. */
  pointAt(digit) {
    const row = this.rows.find((candidate) => candidate.digit === digit);
    this.pointed = row ?? null;
    this.page?.previewPreset?.(row?.variables ?? null);
    return row !== void 0;
  }
  addRow(digit, variables) {
    const line = new St.BoxLayout({
      vertical: false,
      style_class: "cplace-preset-line",
      reactive: true,
      track_hover: true
    });
    const button = new St.Button({
      style_class: "cplace-preset-row",
      can_focus: true,
      x_expand: true,
      x_align: St.Align.START
    });
    const remove = new St.Button({
      style_class: "cplace-preset-delete",
      can_focus: false,
      child: new St.Icon({
        icon_name: "window-close",
        icon_type: St.IconType.SYMBOLIC,
        icon_size: 12
      })
    });
    const row = { digit, variables, line, button };
    this.label(row);
    this.listen(row, remove);
    line.add_child(button);
    line.add_child(remove);
    this.actor.add_child(line);
    return row;
  }
  /** A row's clicks, its pointing, and what disarms it: the pointer
   * leaving the whole line, or the focus leaving the row. */
  listen(row, remove) {
    const { line, button, digit } = row;
    button.connect("clicked", () => {
      if (this.armed === row) {
        this.disarm();
      } else {
        this.disarm();
        this.events.run(digit);
      }
    });
    remove.connect("clicked", () => {
      this.press(row);
    });
    line.connect("notify::hover", () => {
      this.point();
      if (!line.hover && !button.has_key_focus() && this.armed === row) {
        this.disarm();
      }
    });
    button.connect("key-focus-in", () => {
      this.point();
    });
    button.connect("key-focus-out", () => {
      this.point();
      if (this.armed === row) {
        this.disarm();
      }
    });
  }
  /** The page draws the row under the pointer, else the row with the
   * focus, and what it drew before once neither is: a pointer leaving one
   * row hands the drawing back to the focused one. */
  point() {
    const shown = this.rows.find((row) => row.line.hover) ?? this.rows.find((row) => row.button.has_key_focus()) ?? null;
    if (shown === this.pointed) {
      return;
    }
    this.pointed = shown;
    this.page?.previewPreset?.(shown?.variables ?? null);
  }
  /** The first press arms a row; the second deletes its preset. */
  press(row) {
    if (this.armed !== row) {
      this.disarm();
      this.armed = row;
      this.label(row);
      return;
    }
    const page = this.page;
    if (page === null) {
      return;
    }
    const hadFocus = row.button.has_key_focus();
    this.settings.writePresetStore(
      withoutPreset(this.settings.presetStore(), page.key, row.digit)
    );
    if (this.pointed === row) {
      page.previewPreset?.(null);
    }
    this.show(page);
    if (hadFocus) {
      this.events.refocus();
    }
  }
  label(row) {
    const armed = this.armed === row;
    row.button.set_label(
      armed ? fill(_("Delete preset {digit}?"), { digit: row.digit }) : `${row.digit}   ${this.page?.describe(row.variables) ?? ""}`
    );
    if (armed) {
      row.button.add_style_class_name("cplace-preset-armed");
    } else {
      row.button.remove_style_class_name("cplace-preset-armed");
    }
  }
};

// src/engine/spin-step.ts
function nextStep(value, step, direction, bounds) {
  const size = step > 0 ? step : 1;
  const next = direction > 0 ? Math.floor(value / size) * size + size : Math.ceil(value / size) * size - size;
  return Math.min(bounds.max, Math.max(bounds.min, next));
}

// src/engine/widgets.ts
var St2 = imports.gi.St;
function heading(text) {
  return new St2.Label({ text, style_class: "cplace-heading" });
}
function replaceChild(bin2, child) {
  const old = bin2.get_child();
  bin2.set_child(child);
  if (old !== null && old !== child) {
    old.destroy();
  }
}
function bounded(spec, value) {
  return Math.min(spec.max, Math.max(spec.min, value));
}
function numberEntry(spec, styleClass, shown, commit) {
  const entry = new St2.Entry({
    text: String(spec.value),
    style_class: styleClass
  });
  const parseAndCommit = () => {
    const text = entry.get_text().trim();
    const typed = parseInt(text, 10);
    if (Number.isNaN(typed) || text === String(shown())) {
      entry.set_text(String(shown()));
      return;
    }
    commit(bounded(spec, typed));
  };
  entry.clutter_text.connect("activate", parseAndCommit);
  entry.clutter_text.connect("key-focus-out", parseAndCommit);
  return entry;
}
function stepPicker(steps) {
  const frame = new St2.BoxLayout({
    vertical: false,
    style_class: "cplace-steps"
  });
  let active = steps[0] ?? 1;
  const buttons = steps.map((step) => {
    const button = new St2.Button({
      style_class: "cplace-step",
      can_focus: true,
      x_align: St2.Align.MIDDLE,
      child: new St2.Label({ text: String(step) })
    });
    button.connect("clicked", () => {
      active = step;
      for (const candidate of buttons) {
        candidate.remove_style_class_name("cplace-step-active");
      }
      button.add_style_class_name("cplace-step-active");
    });
    frame.add_child(button);
    return button;
  });
  buttons[0]?.add_style_class_name("cplace-step-active");
  return { actor: frame, step: () => active };
}
function litOnFocus(frame, entry) {
  entry.clutter_text.connect("key-focus-in", () => {
    frame.add_style_pseudo_class("focus");
  });
  entry.clutter_text.connect("key-focus-out", () => {
    frame.remove_style_pseudo_class("focus");
  });
}
function framedSpin(spec) {
  const row = new St2.BoxLayout({
    vertical: false,
    style_class: "cplace-variable-row"
  });
  const frame = new St2.BoxLayout({
    vertical: false,
    style_class: "cplace-spin"
  });
  let current = spec.value;
  const apply2 = (value) => {
    current = value;
    entry.set_text(String(value));
    spec.onChange(value);
  };
  const picker = spec.steps.length > 1 ? stepPicker(spec.steps) : null;
  const step = () => picker?.step() ?? spec.steps[0] ?? 1;
  const entry = numberEntry(spec, "cplace-spin-entry", () => current, apply2);
  litOnFocus(frame, entry);
  frame.add_child(
    spinButton(
      "list-remove",
      "cplace-spin-minus",
      () => apply2(nextStep(current, step(), -1, spec))
    )
  );
  frame.add_child(entry);
  frame.add_child(
    spinButton(
      "list-add",
      "cplace-spin-plus",
      () => apply2(nextStep(current, step(), 1, spec))
    )
  );
  row.add_child(frame);
  if (picker !== null) {
    row.add_child(picker.actor);
  }
  return row;
}
function compactTick(actor) {
  const container = actor.get_child();
  if (container === null) {
    return;
  }
  container.set_style(
    "min-height: 1.5em; height: 1.5em; padding-top: 0; spacing: 0.6em;"
  );
  const [mark, label] = container.get_children();
  if (mark !== void 0) {
    mark.set_style(
      "width: 1.5em; height: 1.5em; background-size: contain;"
    );
  }
  if (label !== void 0) {
    const radio = actor.has_style_class_name("radiobutton");
    label.set_style(
      radio ? "padding-top: 0.15em; font-size: 1em;" : "padding-top: 0; font-size: 1em;"
    );
  }
}
function spinButton(iconName, sideClass, onClick) {
  const button = new St2.Button({
    style_class: `cplace-spin-button ${sideClass}`,
    can_focus: true,
    child: new St2.Icon({
      icon_name: iconName,
      icon_type: St2.IconType.SYMBOLIC,
      icon_size: 12
    })
  });
  button.connect("clicked", onClick);
  return button;
}

// src/engine/chooser-parts.ts
var St3 = imports.gi.St;
var RadioButtons = imports.ui.radioButton;
var NAME = "cPlace";
function pageSizes(content) {
  const node = content.get_theme_node();
  return {
    page: node.get_length("-cplace-page-width"),
    preview: node.get_length("-cplace-preview-width")
  };
}
function hintLabel() {
  const label = new St3.Label({ style_class: "cplace-hint" });
  label.clutter_text.line_wrap = true;
  label.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.NONE;
  return label;
}
function shellHeader(onClose) {
  const actor = new St3.BoxLayout({ vertical: false });
  actor.add_child(heading(NAME));
  actor.add_child(new St3.Bin({ x_expand: true }));
  const closeButton = new St3.Button({
    style_class: "cplace-close-button",
    can_focus: true,
    child: new St3.Icon({
      icon_name: "window-close",
      icon_type: St3.IconType.SYMBOLIC,
      icon_size: 16
    })
  });
  closeButton.connect("clicked", () => {
    onClose();
  });
  actor.add_child(closeButton);
  return { actor, closeButton };
}
function arrangementChoice(pages, onChoose) {
  const actor = new St3.BoxLayout({
    vertical: true,
    style_class: "cplace-column"
  });
  actor.add_child(heading(_("Arrangement")));
  const group = new RadioButtons.RadioButtonGroup();
  for (const page of pages) {
    group.addButton(page.key, `${page.name}  (${page.letter})`);
  }
  for (const child of group.actor.get_children()) {
    child.add_style_class_name("cplace-radio");
    compactTick(child);
    widenToLabel(child);
  }
  group.connect("radio-changed", (_group, buttonId) => {
    const index = pages.findIndex((page) => page.key === buttonId);
    if (index >= 0) {
      onChoose(index);
    }
  });
  actor.add_child(group.actor);
  return { actor, group };
}
function widenToLabel(button) {
  const container = button.get_child();
  const label = container?.get_children()[1];
  if (container === null || label === void 0) {
    return;
  }
  container.connect("get-preferred-width", (_owner, _forHeight, alloc) => {
    const [min, natural] = label.get_preferred_width(-1);
    alloc.min_size = 2 * alloc.min_size + (min ?? 0);
    alloc.natural_size = 2 * alloc.natural_size + (natural ?? 0);
  });
}
function presetsColumn(settings, events) {
  const actor = new St3.BoxLayout({
    vertical: true,
    style_class: "cplace-column"
  });
  actor.add_child(heading(_("Presets")));
  const presets = new PresetColumn(settings, events);
  actor.add_child(presets.actor);
  return { actor, presets };
}

// src/engine/gather.ts
function windowAppId(window) {
  const app = imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(window);
  return app !== null ? app.get_id() : null;
}
function windowAppName(window) {
  const app = imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(window);
  return app !== null ? app.get_name() : null;
}
function appName(id) {
  const app = imports.gi.Cinnamon.AppSystem.get_default().lookup_app(id);
  return app !== null ? app.get_name() : id;
}
function inScope(window, scope) {
  if (window.window_type !== imports.gi.Meta.WindowType.NORMAL) {
    return false;
  }
  return !window.minimized || scope.includeMinimised;
}
function frameOf2(window) {
  const frame = window.get_frame_rect();
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height
  };
}
var heldMonitor = null;
function arrangementMonitor() {
  return focusedWindow()?.get_monitor() ?? global.display.get_current_monitor();
}
function holdMonitor(monitor) {
  heldMonitor = monitor;
}
function currentMonitor() {
  return heldMonitor ?? arrangementMonitor();
}
function monitorCount() {
  return global.display.get_n_monitors();
}
function workAreaOf(monitor) {
  const area = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor);
  return { x: area.x, y: area.y, width: area.width, height: area.height };
}
function currentWorkArea() {
  return workAreaOf(currentMonitor());
}
function allWorkAreas() {
  return Array.from(
    { length: monitorCount() },
    (_2, monitor) => workAreaOf(monitor)
  );
}
function desktopArea() {
  const areas = allWorkAreas();
  const left = Math.min(...areas.map((area) => area.x));
  const top = Math.min(...areas.map((area) => area.y));
  const right = Math.max(...areas.map((area) => area.x + area.width));
  const bottom = Math.max(...areas.map((area) => area.y + area.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
function placeName() {
  return monitorCount() > 1 ? fill(_("Monitor {number}"), { number: currentMonitor() + 1 }) : "";
}
function focusedWindow() {
  const window = global.display.focus_window;
  if (window === null || !inScope(window, { includeMinimised: false })) {
    return null;
  }
  const workspace = global.workspace_manager.get_active_workspace();
  return window.located_on_workspace(workspace) ? window : null;
}
function gather(scope) {
  const workspace = global.workspace_manager.get_active_workspace();
  const stacked = global.display.sort_windows_by_stacking(
    workspace.list_windows().filter((window) => inScope(window, scope))
  );
  const monitor = currentMonitor();
  return {
    workArea: workAreaOf(monitor),
    workAreas: allWorkAreas(),
    windows: stacked.map((window, index) => ({
      id: index,
      frame: frameOf2(window)
    })),
    liveWindows: stacked,
    here: stacked.map((window) => window.get_monitor() === monitor)
  };
}

// src/engine/fitting.ts
function canPlace(dialog) {
  const constraint = dialog._monitorConstraint;
  return typeof constraint?.index === "number";
}
function placeOn(dialog, monitor) {
  const constraint = dialog._monitorConstraint;
  if (constraint !== void 0 && typeof constraint.index === "number") {
    constraint.index = monitor;
  }
}
function naturalHeight(actor) {
  const [, natural] = actor.get_preferred_height(-1);
  return natural ?? 0;
}
function roomHere() {
  return global.workspace_manager.get_active_workspace().get_work_area_for_monitor(currentMonitor()).height;
}
function excessOver(dialog, room) {
  const [, width] = dialog.get_preferred_width(-1);
  const [, natural] = dialog.get_preferred_height(width ?? -1);
  return Math.max(0, Math.ceil((natural ?? 0) - room));
}
function widthForHeight(workArea, height) {
  return Math.max(1, Math.floor(height * workArea.width / workArea.height));
}
function narrowerBy(workArea, width, over) {
  const tall = Math.round(workArea.height * width / workArea.width);
  return widthForHeight(workArea, tall - over);
}
function fitBeside(parts, excess, giveBack) {
  if (excess <= 0) {
    return;
  }
  const body = naturalHeight(parts.body);
  const beside = naturalHeight(parts.right);
  parts.list.fitHeight(Math.max(beside, body - excess));
  const over = excess - (body - naturalHeight(parts.body));
  if (over > 0) {
    giveBack(over);
    parts.list.fitHeight(naturalHeight(parts.right));
  }
}

// src/engine/palette.ts
function complement(colour) {
  const high = Math.max(colour.red, colour.green, colour.blue);
  const low = Math.min(colour.red, colour.green, colour.blue);
  return {
    red: high + low - colour.red,
    green: high + low - colour.green,
    blue: high + low - colour.blue,
    alpha: colour.alpha
  };
}
function css(colour) {
  const alpha = (colour.alpha / 255).toFixed(4);
  return `rgba(${colour.red}, ${colour.green}, ${colour.blue}, ${alpha})`;
}
function invisible(paint) {
  return paint.fill.alpha === 0 && paint.border.alpha === 0;
}
function seen(paint, text) {
  return invisible(paint) ? { ...paint, border: text } : paint;
}
var transparent = { red: 0, green: 0, blue: 0, alpha: 0 };
function firstDrawn(...colours) {
  return colours.find((colour) => colour.alpha > 0) ?? colours[colours.length - 1] ?? transparent;
}
function same(left, right) {
  return css(left) === css(right);
}
function edgeOf(paint) {
  return paint.border.alpha > 0 || paint.fill.alpha === 0 ? paint.border : { ...paint.fill, alpha: 255 };
}
function shapes(theme) {
  return {
    landing: seen(theme.landing, theme.text),
    landingStrong: seen(theme.landingStrong, theme.text),
    screen: seen(theme.screen, theme.text),
    window: seen(theme.window, theme.text),
    activeWindow: seen(theme.activeWindow, theme.text)
  };
}
function controls(theme, drawn) {
  const rowFill = firstDrawn(
    theme.rowHover.fill,
    theme.buttonHover.fill,
    drawn.landing.fill
  );
  const rowHover = { ...theme.rowHover, fill: rowFill };
  return {
    ...theme,
    dim: firstDrawn(theme.dim, theme.text),
    rowHover,
    buttonHover: {
      ...theme.buttonHover,
      fill: firstDrawn(theme.buttonHover.fill, rowFill)
    },
    entry: {
      ...theme.entry,
      border: firstDrawn(theme.entry.border, drawn.screen.border)
    },
    entryFocus: {
      ...theme.entryFocus,
      border: firstDrawn(theme.entryFocus.border, drawn.landing.border)
    },
    destructive: theme.destructive.fill.alpha === 0 ? rowHover : theme.destructive,
    cellHover: same(drawn.activeWindow.fill, drawn.window.fill) ? rowFill : drawn.activeWindow.fill
  };
}
function prepared(theme) {
  const drawn = shapes(theme);
  const turned = (paint) => ({
    fill: complement(paint.fill),
    border: complement(paint.border),
    text: paint.text
  });
  return {
    ...controls(theme, drawn),
    ...drawn,
    end: turned(drawn.landing),
    endStrong: turned(drawn.landingStrong),
    landingEdge: edgeOf(drawn.landing),
    windowEdge: edgeOf(drawn.window)
  };
}

// src/engine/colour-rules.ts
function rowRules(colours) {
  const onRow = [
    ["background-color", colours.rowHover.fill],
    ["color", colours.rowHover.text]
  ];
  const armed = ".cplace-preset-row.cplace-preset-armed";
  return [
    [".cplace-preset-row:hover, .cplace-preset-row:focus", onRow],
    [".cplace-preset-delete", [["color", colours.dim]]],
    [".cplace-preset-delete:hover", onRow],
    [`${armed}, ${armed}:hover, ${armed}:focus`, [
      ["background-color", colours.destructive.fill],
      ["color", colours.destructive.text]
    ]],
    [".cplace-end-toggle", [["color", colours.dim]]],
    [".cplace-end-toggle:hover, .cplace-end-toggle:focus", onRow],
    [".cplace-end-toggle:checked", [
      ["background-color", colours.endStrong.fill],
      ["color", colours.text]
    ]]
  ];
}
function inputRules(colours) {
  return [
    [".cplace-spin", [
      ["background-color", colours.entry.fill],
      ["border-color", colours.entry.border]
    ]],
    [".cplace-spin:focus", [["border-color", colours.entryFocus.border]]],
    [".cplace-spin-button, .cplace-step, .cplace-layout-button", [
      ["background-color", colours.button.fill],
      ["border-color", colours.button.border],
      ["color", colours.button.text]
    ]],
    [".cplace-spin-button:hover, .cplace-step:hover, .cplace-layout-button:hover", [
      ["background-color", colours.buttonHover.fill],
      ["color", colours.buttonHover.text]
    ]],
    // After the buttons' own border, which a separator overrides: the
    // theme's faint line, the small screen's edge.
    [".cplace-spin-minus, .cplace-spin-plus", [
      ["border-color", colours.screen.border]
    ]],
    [".cplace-step-active, .cplace-layout-button-active", [
      ["background-color", colours.landing.fill],
      ["border-color", colours.landing.border]
    ]]
  ];
}
function screenRules(colours) {
  const asWindow = (paint) => [
    ["background-color", paint.fill],
    ["border-color", paint.border]
  ];
  return [
    [".cplace-preview-screen", asWindow(colours.screen)],
    [".cplace-preview-slot", asWindow(colours.landing)],
    // The slots sent to the end stand on top of the pile, so they take
    // the stronger fill the theme gives its snap preview, turned, to
    // read over the slots beneath them.
    [".cplace-preview-slot-end", [
      ["background-color", colours.endStrong.fill],
      ["border-color", colours.end.border]
    ]],
    [".cplace-end-mark", [["color", colours.text]]],
    [".cplace-preview-missing", [["border-color", colours.landingEdge]]],
    [".cplace-corner", [["border-color", colours.dim]]],
    [".cplace-corner:hover, .cplace-corner:focus", [
      ["border-color", colours.text]
    ]],
    [".cplace-corner-active", [["border-color", colours.landingEdge]]],
    [".cplace-grid-cell, .cplace-grid-ghost", asWindow(colours.window)],
    [".cplace-grid-cell:hover", [
      ["background-color", colours.cellHover]
    ]],
    [".cplace-grid-cell-selected", asWindow(colours.landing)],
    [".cplace-grid-cell-selected:hover", [
      ["background-color", colours.landingStrong.fill]
    ]],
    [".cplace-grid-cell-head", [["border-color", colours.text]]],
    [".cplace-area-cell", [["border-color", colours.windowEdge]]],
    [".cplace-area-cell:hover", [
      ["background-color", colours.cellHover]
    ]],
    [".cplace-area-outline", [["border-color", colours.landingEdge]]]
  ];
}
function fingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function colourSheet(theme) {
  const colours = prepared(theme);
  const rules = [
    ...rowRules(colours),
    ...inputRules(colours),
    ...screenRules(colours)
  ];
  const scope = `cplace-colours-${fingerprint(JSON.stringify(rules))}`;
  const text = rules.map(([selector, declarations]) => {
    const scoped = selector.split(", ").map((one) => `.${scope} ${one}`).join(", ");
    const body = declarations.map(([property, colour]) => `    ${property}: ${css(colour)};`).join("\n");
    return `${scoped} {
${body}
}
`;
  }).join("\n");
  return { scope, rules: text };
}

// src/engine/theme-colours.ts
var St4 = imports.gi.St;
var bin = (style, pseudo) => ({
  make: St4.Bin,
  style,
  pseudo
});
function rgba(colour) {
  return {
    red: colour.red,
    green: colour.green,
    blue: colour.blue,
    alpha: colour.alpha
  };
}
function probed(chain, read) {
  let outer = null;
  let inner = null;
  for (const link of chain) {
    const actor = new link.make({ style_class: link.style });
    if (link.pseudo !== void 0) {
      actor.add_style_pseudo_class(link.pseudo);
    }
    if (inner === null) {
      outer = actor;
    } else if (inner instanceof St4.Bin) {
      inner.set_child(actor);
    } else {
      inner.add_child(actor);
    }
    inner = actor;
  }
  if (outer === null || inner === null) {
    throw new Error("a theme probe needs at least one actor");
  }
  outer.hide();
  imports.ui.main.uiGroup.add_child(outer);
  try {
    return read(inner.get_theme_node());
  } finally {
    outer.destroy();
  }
}
function paintOf(chain) {
  return probed(chain, (node) => ({
    fill: rgba(node.get_background_color()),
    border: rgba(node.get_border_color(St4.Side.TOP)),
    text: rgba(node.get_foreground_color())
  }));
}
function graphWindow(state) {
  const chain = [bin("workspace-graph"), bin("workspace"), bin("windows")];
  return probed(chain, (node) => {
    const custom = (name) => {
      const [found, colour] = node.lookup_color(name, false);
      return found ? rgba(colour) : { red: 0, green: 0, blue: 0, alpha: 0 };
    };
    return {
      fill: custom(`-${state}-window-background`),
      border: custom(`-${state}-window-border`),
      text: rgba(node.get_foreground_color())
    };
  });
}
function readThemeColours() {
  const dialogButton = (pseudo) => [
    bin("dialog"),
    { make: St4.Button, style: "dialog-button", pseudo }
  ];
  const menuItem = (pseudo) => [
    bin("popup-menu"),
    bin("popup-menu-content"),
    { make: St4.BoxLayout, style: "popup-menu-item", pseudo }
  ];
  const entry = (pseudo) => [
    { make: St4.Entry, style: "run-dialog-entry", pseudo }
  ];
  return {
    text: paintOf([bin("dialog"), bin("dialog-content-box")]).text,
    dim: paintOf(menuItem("insensitive")).text,
    landing: paintOf([bin("tile-preview")]),
    landingStrong: paintOf([bin("tile-preview snap")]),
    screen: paintOf([bin("workspace-graph"), bin("workspace")]),
    window: graphWindow("inactive"),
    activeWindow: graphWindow("active"),
    button: paintOf(dialogButton()),
    buttonHover: paintOf(dialogButton("hover")),
    entry: paintOf(entry()),
    entryFocus: paintOf(entry("focus")),
    rowHover: paintOf(menuItem("active")),
    destructive: paintOf(dialogButton("destructive-action"))
  };
}

// src/engine/theme-sheet.ts
var Gio = imports.gi.Gio;
var GLib = imports.gi.GLib;
var St5 = imports.gi.St;
function themeContext() {
  return St5.ThemeContext.get_for_stage(global.stage);
}
function sheetFile(scope) {
  return Gio.File.new_for_path(
    GLib.build_filenamev([
      GLib.get_user_runtime_dir(),
      "cplace",
      `${scope}.css`
    ])
  );
}
function deleteSheet(file) {
  file.delete_async(GLib.PRIORITY_DEFAULT, null, () => {
    file.get_parent()?.delete_async(GLib.PRIORITY_DEFAULT, null, null);
  });
}
function writeSheet(file, rules, written) {
  const bytes = GLib.Bytes.new(rules);
  const write = () => {
    file.replace_contents_bytes_async(
      bytes,
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null,
      (_file, result) => {
        try {
          file.replace_contents_finish(result);
        } catch (error) {
          global.logError(
            `cPlace: the colour sheet: ${String(error)}`
          );
          return;
        }
        written();
      }
    );
  };
  file.get_parent()?.make_directory_async(GLib.PRIORITY_DEFAULT, null, write);
}
var ThemeSheet = class {
  constructor(rulesNow) {
    this.rulesNow = rulesNow;
  }
  rulesNow;
  /** The sheet St has read, and the theme it went into. */
  loaded = null;
  /** Counts the writes begun, so a write that finishes after a later one
   * began, or after the sheet was removed, loads nothing. */
  generation = 0;
  /** The sheet the latest write is for, null once removed. */
  latest = null;
  changedId = 0;
  /** The rules written now, and again whenever the theme changes. */
  follow() {
    this.prepare();
    this.changedId = themeContext().connect("changed", () => {
      this.prepare();
    });
  }
  /** The class for the rules in the theme now, or null while none are:
   * just after a theme change, until the new sheet is read. */
  scope() {
    const loaded = this.loaded;
    return loaded !== null && loaded.theme === themeContext().get_theme() ? loaded.scope : null;
  }
  /** No longer following the theme, the rules out of it, and the sheet
   * off the disk, as disabling the extension leaves it. */
  remove() {
    if (this.changedId !== 0) {
      themeContext().disconnect(this.changedId);
      this.changedId = 0;
    }
    this.generation += 1;
    this.latest = null;
    this.unload();
  }
  prepare() {
    let sheet;
    try {
      sheet = this.rulesNow();
    } catch (error) {
      global.logError(`cPlace: the theme's colours: ${String(error)}`);
      return;
    }
    const theme = themeContext().get_theme();
    if (this.loaded?.scope === sheet.scope && this.loaded.theme === theme) {
      return;
    }
    this.generation += 1;
    const generation = this.generation;
    const file = sheetFile(sheet.scope);
    this.latest = file;
    writeSheet(file, sheet.rules, () => {
      if (generation === this.generation && theme === themeContext().get_theme()) {
        this.load(theme, file, sheet.scope);
      } else if (this.latest === null || !this.latest.equal(file)) {
        deleteSheet(file);
      }
    });
  }
  /** The new sheet into the theme, in place of the one before. A sheet
   * St can't read leaves the chooser in the theme's plain colours. */
  load(theme, file, scope) {
    const path = file.get_path() ?? "";
    const before = this.loaded;
    if (before !== null && !before.file.equal(file)) {
      this.unload();
    } else if (before !== null && before.theme === theme) {
      return;
    }
    try {
      theme.load_stylesheet(path);
      this.loaded = { theme, file, scope };
    } catch (error) {
      global.logError(`cPlace: the colour sheet: ${String(error)}`);
    }
  }
  /** Out of the theme, if the theme is the one it went into, and deleted. */
  unload() {
    const loaded = this.loaded;
    if (loaded === null) {
      return;
    }
    if (loaded.theme === themeContext().get_theme()) {
      loaded.theme.unload_stylesheet(loaded.file.get_path() ?? "");
    }
    deleteSheet(loaded.file);
    this.loaded = null;
  }
};

// src/engine/chooser.ts
var Clutter2 = imports.gi.Clutter;
var St6 = imports.gi.St;
var ModalDialog = imports.ui.modalDialog;
function handled(taken) {
  return taken ? Clutter2.EVENT_STOP : Clutter2.EVENT_PROPAGATE;
}
var Chooser = class {
  constructor(pages, settings, applyTargets, undoLast) {
    this.pages = pages;
    this.settings = settings;
    this.applyTargets = applyTargets;
    this.undoLast = undoLast;
    this.sheet.follow();
  }
  pages;
  settings;
  applyTargets;
  undoLast;
  dialog = null;
  radioGroup = null;
  presets = null;
  contentBin = null;
  hintLabel = null;
  closeButton = null;
  selected = 0;
  sheet = new ThemeSheet(
    () => colourSheet(readThemeColours())
  );
  sizes = { page: 0, preview: 0 };
  /** A work area's height the development handle pretends, to show a
   * smaller screen on this one; null for the real one. */
  pretendHeight = null;
  /** True once the dialog shows: before that its measure leaves out the
   * button row and its own padding, so a page is fitted only after. */
  shown = false;
  /** The monitor the chooser opens on and arranges on, while it is
   * open. */
  monitor = 0;
  isOpen() {
    return this.dialog !== null;
  }
  toggle() {
    if (this.dialog === null) {
      this.open();
    } else {
      this.close();
    }
  }
  /** Opens on the arrangement last chosen, or on the one a key names,
   * which the development handle uses to reach each page, as it may
   * pretend the work area's height. */
  open(key, pretendHeight) {
    if (this.dialog !== null || this.pages.length === 0) {
      return;
    }
    const named = this.pages.findIndex((page2) => page2.key === key);
    if (named >= 0) {
      this.selected = named;
    }
    this.pretendHeight = pretendHeight ?? null;
    const dialog = this.built();
    if (!dialog.open(global.get_current_time())) {
      this.forget();
      dialog.destroy();
      return;
    }
    placeOn(dialog, this.monitor);
    this.shown = true;
    const page = this.page();
    if (page !== void 0) {
      this.fit(page);
    }
    this.listen(dialog.contentLayout);
  }
  /** The dialog in the theme's colours, built whole. The colour rules
   * were written when the extension started or the theme last changed;
   * until they are in the theme the dialog takes its plain colours. */
  built() {
    const dialog = new ModalDialog.ModalDialog();
    this.dialog = dialog;
    this.monitor = canPlace(dialog) ? arrangementMonitor() : global.display.get_current_monitor();
    holdMonitor(this.monitor);
    const scope = this.sheet.scope();
    if (scope !== null) {
      dialog.contentLayout.add_style_class_name(scope);
    }
    this.buildShell(dialog);
    return dialog;
  }
  /** The shell's keys, routed as each is pressed, and Enter taken on its
   * way down. */
  listen(content) {
    content.grab_key_focus();
    content.connect("key-press-event", (_owner, event) => {
      const { symbol, code, modifiers } = keyOf(event);
      return handled(this.key(symbol, modifiers, code));
    });
    content.connect(
      "captured-event",
      (_owner, event) => handled(captureEnter(event, {
        action: () => this.enterAction(),
        commit: () => content.grab_key_focus(),
        apply: () => this.applySelected()
      }))
    );
  }
  close() {
    const dialog = this.dialog;
    if (dialog === null) {
      return;
    }
    this.forget();
    dialog.close(global.get_current_time());
  }
  /** Closed, with the colour rules taken out of the theme, as disabling
   * the extension leaves it. */
  dispose() {
    this.close();
    this.sheet.remove();
  }
  /** The shell lets go of the dialog and of what it built into it, and
   * the page shown of what it built. */
  forget() {
    this.page()?.release();
    holdMonitor(null);
    this.shown = false;
    this.dialog = null;
    this.radioGroup = null;
    this.presets = null;
    this.contentBin = null;
    this.hintLabel = null;
    this.closeButton = null;
  }
  /** The development handle's way in, and no one else's. */
  insides() {
    return {
      layout: this.layout(),
      presets: this.presets,
      enter: this.dialog === null ? null : this.enterAction(),
      key: (symbol, modifiers) => this.key(symbol, modifiers),
      save: (digit) => this.savePreset(digit),
      plan: () => this.page()?.apply() ?? null
    };
  }
  /** The visible dialog: the layout the typing keeps private, which is
   * public at runtime in Cinnamon 6.6 and private, as _dialogLayout, in
   * 5.4. */
  layout() {
    if (this.dialog === null) {
      return null;
    }
    const dialog = this.dialog;
    return dialog.dialogLayout ?? dialog._dialogLayout ?? null;
  }
  // ------------------------------------------------------------- shell --
  /** Built once per open. The arrangement last chosen is selected once
   * the whole shell stands, buttons and all, so the page that fills the
   * content fits the dialog as it will open. */
  buildShell(dialog) {
    const content = dialog.contentLayout;
    content.add_style_class_name("cplace-content");
    this.sizes = pageSizes(content);
    const header = shellHeader(() => this.close());
    this.closeButton = header.closeButton;
    content.add_child(header.actor);
    this.contentBin = new St6.Bin({ x_align: St6.Align.START });
    this.hintLabel = hintLabel();
    content.add_child(this.buildArrangementsRow());
    content.add_child(this.contentBin);
    content.add_child(this.hintLabel);
    dialog.setButtons([
      { label: _("Apply"), action: () => this.applySelected() },
      { label: _("Undo"), action: () => this.undoAndClose() },
      { label: _("Cancel"), action: () => this.close() }
    ]);
    const remembered = this.pages[this.selected] ?? this.pages[0];
    this.radioGroup?.setActive(remembered?.key ?? "");
  }
  /** The choice of arrangement and the chosen one's presets, side by
   * side above the page. */
  buildArrangementsRow() {
    const row = new St6.BoxLayout({
      vertical: false,
      style_class: "cplace-arrangements-row"
    });
    const choice = arrangementChoice(
      this.pages,
      (index) => this.select(index)
    );
    this.radioGroup = choice.group;
    row.add_child(choice.actor);
    const column = presetsColumn(this.settings, {
      run: (digit) => this.runPreset(digit),
      refocus: () => this.dialog?.contentLayout.grab_key_focus()
    });
    this.presets = column.presets;
    row.add_child(column.actor);
    return row;
  }
  /** Selecting an arrangement hands the content to its page, built
   * afresh, then its presets, which the page describes and may draw, and
   * its hint; then the page fits the dialog to the screen. */
  select(index) {
    const page = this.pages[index];
    if (page === void 0) {
      return;
    }
    this.page()?.release();
    this.selected = index;
    const content = page.build({
      apply: () => this.applySelected(),
      sizes: this.sizes
    });
    if (this.contentBin !== null) {
      replaceChild(this.contentBin, content);
    }
    this.presets?.show(page);
    this.hintLabel?.set_text(
      `${page.hint()} ${_("U undoes the last one.")}`
    );
    this.fit(page);
  }
  /** A dialog standing taller than the room has the page give back the
   * difference, once the dialog shows and can be measured whole. */
  fit(page) {
    const layout = this.layout();
    if (this.shown && layout !== null) {
      page.fit?.(excessOver(layout, this.pretendHeight ?? roomHere()));
    }
  }
  page() {
    return this.pages[this.selected];
  }
  // ----------------------------------------------------------- actions --
  applySelected() {
    const result = this.page()?.apply() ?? null;
    if (result === null) {
      return;
    }
    this.close();
    this.applyTargets(result.targets, result.liveWindows);
  }
  /** Undo puts back the frames the last apply moved, then leaves. */
  undoAndClose() {
    this.close();
    this.undoLast();
  }
  /** A digit applies at once: the ask happened at Super+Z, and the page
   * was showing what the digit meant before it was pressed. */
  runPreset(digit) {
    const page = this.page();
    if (page === void 0) {
      return;
    }
    const variables = this.settings.presetStore()[page.key]?.[String(digit)];
    if (variables === void 0) {
      return;
    }
    page.restore(variables);
    this.applySelected();
  }
  savePreset(digit) {
    const page = this.page();
    if (page === void 0) {
      return;
    }
    const store = withPreset(
      this.settings.presetStore(),
      page.key,
      digit,
      page.snapshot()
    );
    this.settings.writePresetStore(store);
    this.presets?.show(page);
  }
  // -------------------------------------------------------------- keys --
  /** A key by the symbol it types and, for the digits, by its place on
   * the keyboard as well; the development handle sends no place. */
  key(symbol, modifiers, code = 0) {
    return routeKey({ symbol, code, modifiers }, this.keyRoute());
  }
  /** The shell's actions, lent to the route a key takes. */
  keyRoute() {
    return {
      close: () => this.close(),
      undo: () => this.undoAndClose(),
      runPreset: (digit) => this.runPreset(digit),
      savePreset: (digit) => this.savePreset(digit),
      deletePreset: () => this.presets?.deleteKey() === true,
      disarm: () => this.presets?.disarm(),
      selectLetter: (symbol) => this.selectLetter(symbol),
      page: (symbol, modifiers) => this.page()?.onKey(symbol, modifiers) ?? false
    };
  }
  /** A page's letter selects its arrangement. */
  selectLetter(symbol) {
    const index = this.pages.findIndex(
      (page) => symbol === page.letter.charCodeAt(0)
    );
    if (index < 0) {
      return false;
    }
    this.radioGroup?.setActive(this.pages[index]?.key ?? "");
    return true;
  }
  /** Enter is left to a preset's row, which runs its preset, and to the
   * close button, which closes. */
  enterAction() {
    const focus = global.stage.get_key_focus();
    return enterAction(
      focus,
      focus === this.closeButton || this.presets?.holds(focus) === true
    );
  }
};

// src/arrangements/trim.ts
function trimmed(workArea, frame) {
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const left = Math.min(Math.max(workArea.x, frame.x), right - 1);
  const top = Math.min(Math.max(workArea.y, frame.y), bottom - 1);
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.min(frame.x + frame.width, right) - left),
    height: Math.max(1, Math.min(frame.y + frame.height, bottom) - top)
  };
}
function overlap(left, right) {
  const across = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const down = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return Math.max(0, across) * Math.max(0, down);
}
function homeArea(areas, frame) {
  let best = null;
  let most = 0;
  for (const area of areas) {
    const shared = overlap(area, frame);
    if (shared > most) {
      best = area;
      most = shared;
    }
  }
  return best;
}
function movedInto(workArea, frame) {
  const along = (start, size, from, room) => Math.max(from, Math.min(start, from + room - size));
  return trimmed(workArea, {
    x: along(frame.x, frame.width, workArea.x, workArea.width),
    y: along(frame.y, frame.height, workArea.y, workArea.height),
    width: frame.width,
    height: frame.height
  });
}

// src/arrangements/cascade.ts
function cascade(input) {
  const { workArea, windows, settings } = input;
  const { fromRight, fromTop } = sidesOf(settings.corner);
  const marchBudget = workArea.width - settings.marginAcross - settings.windowWidth;
  const climbBudget = workArea.height - settings.marginUp - settings.windowHeight;
  const travel = settings.spread ? spreadTravel(marchBudget, climbBudget, windows.length) : fixedTravel(marchBudget, climbBudget, settings);
  const origin = anchor(workArea, settings);
  return windows.map((window, index) => {
    const { march, climb } = travel(index);
    return {
      id: window.id,
      frame: trimmed(workArea, {
        x: origin.x + march * (fromRight ? -1 : 1),
        y: origin.y - climb * (fromTop ? -1 : 1),
        width: settings.windowWidth,
        height: settings.windowHeight
      })
    };
  });
}
function fixedTravel(marchBudget, climbBudget, settings) {
  const across = settings.offsetAcross;
  const up = settings.offsetUp;
  const slotsPerColumn = 1 + stepsThatFit(climbBudget, up);
  const slotsPerCycle = across <= 0 ? Infinity : 1 + stepsThatFit(marchBudget, across);
  return (index) => {
    const slot = index % slotsPerCycle;
    return { march: slot * across, climb: slot % slotsPerColumn * up };
  };
}
function spreadTravel(marchBudget, climbBudget, count) {
  const share = (budget, index) => count <= 1 || budget <= 0 ? 0 : Math.round(budget * index / (count - 1));
  return (index) => ({
    march: share(marchBudget, index),
    climb: share(climbBudget, index)
  });
}
function sidesOf(corner) {
  return {
    fromRight: corner === "bottom-right" || corner === "top-right",
    fromTop: corner === "top-left" || corner === "top-right"
  };
}
function anchor(workArea, settings) {
  const { fromRight, fromTop } = sidesOf(settings.corner);
  return {
    x: fromRight ? workArea.x + workArea.width - settings.marginAcross - settings.windowWidth : workArea.x + settings.marginAcross,
    y: fromTop ? workArea.y + settings.marginUp : workArea.y + workArea.height - settings.marginUp - settings.windowHeight
  };
}
function stepsThatFit(budget, step) {
  if (budget <= 0 || step <= 0) {
    return 0;
  }
  return Math.floor(budget / step);
}

// src/engine/logical.ts
function logical(pixels) {
  return Math.round(pixels / global.ui_scale);
}
function logicalRoom() {
  const room = currentWorkArea();
  return {
    width: Math.floor(room.width / global.ui_scale),
    height: Math.floor(room.height / global.ui_scale)
  };
}
function toDevice(values, lengths, scale = global.ui_scale) {
  const device = { ...values };
  for (const length of lengths) {
    const value = device[length];
    if (typeof value === "number") {
      device[length] = value * scale;
    }
  }
  return device;
}

// src/engine/preview.ts
var Clutter3 = imports.gi.Clutter;
var St7 = imports.gi.St;
function buildPreview(workArea, targets, layers, width) {
  const column = new St7.BoxLayout({ vertical: true });
  if (width > 0) {
    const view = previewView(workArea, width);
    const canvas = screenCanvas(view);
    layers.beneath(canvas, view);
    for (const target of targets) {
      canvas.add_child(slotFor(target, view, layers.atEnd?.(target.id)));
    }
    layers.above(canvas, view);
    column.add_child(canvas);
  }
  column.add_child(caption(workArea, targets.length, layers));
  return column;
}
function previewView(workArea, width) {
  const scale = width / workArea.width;
  return {
    width,
    height: Math.max(1, Math.round(workArea.height * scale)),
    workArea,
    toX: (x) => Math.round((x - workArea.x) * scale),
    toY: (y) => Math.round((y - workArea.y) * scale)
  };
}
function screenCanvas(view) {
  const canvas = new Clutter3.Actor();
  canvas.set_size(view.width, view.height);
  canvas.set_clip_to_allocation(true);
  const screen = new St7.Bin({ style_class: "cplace-preview-screen" });
  screen.set_position(0, 0);
  screen.set_size(view.width, view.height);
  canvas.add_child(screen);
  return canvas;
}
function slotFor(target, view, atEnd) {
  const { x, y, width, height } = target.frame;
  const slot = new St7.Bin({
    style_class: atEnd === true ? "cplace-preview-slot cplace-preview-slot-end" : "cplace-preview-slot"
  });
  if (atEnd === true) {
    slot.set_child(
      new St7.Icon({
        icon_name: "go-last",
        icon_type: St7.IconType.SYMBOLIC,
        style_class: "cplace-end-mark"
      })
    );
    slot.set_clip_to_allocation(true);
  }
  slot.set_position(view.toX(x), view.toY(y));
  slot.set_size(
    Math.max(2, view.toX(x + width) - view.toX(x)),
    Math.max(2, view.toY(y + height) - view.toY(y))
  );
  return slot;
}
function caption(workArea, count, layers) {
  const windows = layers.windows ?? fill(ngettext("{count} window", "{count} windows", count), { count });
  const size = fill(_("{width} \xD7 {height}"), {
    width: logical(workArea.width),
    height: logical(workArea.height)
  });
  return new St7.Label({
    text: listed(layers.place ?? "", size, windows, layers.note),
    style_class: "cplace-preview-caption"
  });
}
function addHandles(canvas, handles) {
  for (const place2 of handles.places) {
    const classes = [handles.family, `${handles.family}-${place2.id}`];
    if (place2.id === handles.active) {
      classes.push(`${handles.family}-active`);
    }
    const button = new St7.Button({
      style_class: classes.join(" "),
      can_focus: true
    });
    button.set_position(place2.x, place2.y);
    button.connect("clicked", () => {
      handles.onPick(place2.id);
    });
    canvas.add_child(button);
  }
}

// src/engine/variables.ts
var St8 = imports.gi.St;
function nameOf(number) {
  return typeof number.name === "string" ? number.name : number.name();
}
function variablesColumn(store, numbers2, changed) {
  const column = new St8.BoxLayout({
    vertical: true,
    style_class: "cplace-column"
  });
  column.add_child(heading(_("Variables")));
  const labels = numbers2.map((number) => {
    const row = variableRow(store, number, changed);
    column.add_child(row.actor);
    return row.label;
  });
  column.connect("notify::mapped", () => {
    if (column.mapped) {
      alignNames(labels);
    }
  });
  return {
    actor: column,
    rename: () => {
      numbers2.forEach((number, index) => {
        labels[index]?.set_text(nameOf(number));
      });
      alignNames(labels);
    }
  };
}
function alignNames(labels) {
  for (const label of labels) {
    label.set_width(-1);
  }
  const widest = Math.max(
    ...labels.map((label) => label.get_preferred_width(-1)[1] ?? 0)
  );
  for (const label of labels) {
    label.set_width(widest);
  }
}
function variableRow(store, number, changed) {
  const row = new St8.BoxLayout({
    vertical: false,
    style_class: "cplace-variable-row"
  });
  const label = new St8.Label({
    text: nameOf(number),
    style_class: "cplace-variable-name"
  });
  row.add_child(label);
  const stored = store.number(number.key, number.fallback);
  row.add_child(
    framedSpin({
      value: number.shown?.(stored) ?? stored,
      min: number.min,
      max: number.max,
      steps: number.steps,
      onChange: (value) => {
        store.write(number.key, value);
        changed();
      }
    })
  );
  return { actor: row, label };
}

// src/engine/ordering.ts
function compareTitles(left, right) {
  return left.localeCompare(right, void 0, { sensitivity: "base" });
}
function ordered(windows, rules) {
  const last = new Set(rules.last);
  const title = (i) => windows[i]?.title ?? "";
  const atEnd = (i) => last.has(windows[i]?.app ?? "");
  const byTitle2 = windows.map((_2, i) => i).sort((a, b) => compareTitles(title(a), title(b)));
  const order = [
    ...byTitle2.filter((i) => !atEnd(i)),
    ...byTitle2.filter((i) => atEnd(i))
  ];
  if (rules.focusedFirst) {
    const lead = order.findIndex((i) => windows[i]?.focused === true);
    if (lead > 0) {
      order.unshift(...order.splice(lead, 1));
    }
  }
  return order;
}

// src/engine/ticks.ts
var Ticks = class {
  appTicks = {};
  windows = [];
  ticks = [];
  /** Every window gathered since the scope was last set, by its key, with
   * the tick it had when a gathering last left it, so that a window the
   * minimised toggle hides and shows again comes back as it went. */
  remembered = /* @__PURE__ */ new Map();
  /** The window the focus rule left unticked, by its index, so that its
   * untick does not read as its application's being unticked. */
  ruledOut = null;
  /** The applications whose windows arrive ticked. */
  constructor(appIds) {
    this.setApps(appIds);
  }
  /** The ticked applications, replacing any before, as a preset's scope
   * sets them. The windows are forgotten with the ticks they had, so the
   * next gathering ticks every window as its application now is. */
  setApps(appIds) {
    this.appTicks = {};
    for (const id of appIds) {
      this.appTicks[id] = true;
    }
    this.windows = [];
    this.ticks = [];
    this.remembered.clear();
    this.ruledOut = null;
  }
  /** The applications whose own ticks are on. */
  apps() {
    return Object.keys(this.appTicks).filter(
      (id) => this.appTicks[id] === true
    );
  }
  /** A new gathering of windows, such as the minimised toggle makes. A
   * window gathered before keeps its tick, and the focus rule's mark,
   * found again by its key wherever the gathering puts it; a window new
   * to the list is ticked as its application is. */
  gather(windows) {
    this.windows.forEach((window, index) => {
      this.remembered.set(window.key, {
        appId: window.appId,
        here: window.here,
        ticked: this.ticks[index] === true
      });
    });
    const ruledOutKey = this.ruledOut === null ? null : this.windows[this.ruledOut]?.key ?? null;
    this.ticks = windows.map(
      (window) => this.remembered.get(window.key)?.ticked ?? this.seeded(window)
    );
    const ruledOut = windows.findIndex(
      (window) => window.key === ruledOutKey
    );
    this.ruledOut = ruledOut < 0 ? null : ruledOut;
    this.windows = windows;
  }
  /** A page's focus rule on the window at an index: left out, it is
   * unticked whatever its application's tick; let in, it takes its
   * application's tick. */
  rule(index, leftOut) {
    this.ruledOut = leftOut ? index : null;
    const window = this.windows[index];
    this.ticks[index] = !leftOut && window !== void 0 && this.seeded(window);
  }
  /** An application's tick ticks all its windows on the monitor arranged
   * on but the one the focus rule leaves out, which only its own tick
   * ticks, and the windows a gathering has left out for now as well.
   * Returns the indices whose tick it set. */
  tickApp(appId, ticked) {
    this.appTicks[appId] = ticked;
    for (const window of this.remembered.values()) {
      if (window.here && window.appId === appId) {
        window.ticked = ticked;
      }
    }
    const set = [];
    this.windows.forEach((window, index) => {
      if (ticked && index === this.ruledOut) {
        return;
      }
      if (window.here && window.appId === appId) {
        this.ticks[index] = ticked;
        set.push(index);
      }
    });
    return set;
  }
  /** A window's own tick, which ticks its application's when it
   * completes the set. Returns the application and whether all its
   * windows on the monitor arranged on are now ticked, or null for a
   * window with no application or on another monitor. */
  tickWindow(index, ticked) {
    this.ticks[index] = ticked;
    if (index === this.ruledOut) {
      this.ruledOut = null;
    }
    const tickedWindow = this.windows[index];
    const appId = tickedWindow?.appId ?? null;
    if (appId === null || tickedWindow?.here !== true) {
      return null;
    }
    const allTicked = this.windows.every(
      (window, other) => window.appId !== appId || !window.here || this.ticks[other] === true || other === this.ruledOut
    );
    this.appTicks[appId] = allTicked;
    return { appId, allTicked };
  }
  isTicked(index) {
    return this.ticks[index] === true;
  }
  isAppTicked(appId) {
    return this.appTicks[appId] === true;
  }
  /** A window's tick as its application's has it, which on another
   * monitor is none. */
  seeded(window) {
    return window.here && window.appId !== null ? this.appTicks[window.appId] ?? false : false;
  }
};

// src/engine/window-choice.ts
function byTitle(left, right) {
  return compareTitles(left.get_title(), right.get_title());
}
var WindowChoice = class {
  /** The seeds are the applications that arrive ticked; every other
   * application lists unticked, one tick away. */
  constructor(seeds, focus, sendsToEnd) {
    this.focus = focus;
    this.sendsToEnd = sendsToEnd;
    this.ticks = new Ticks(seeds);
    this.regather();
    this.applyFocusRule();
  }
  focus;
  sendsToEnd;
  includeMinimised = false;
  gathered = null;
  /** The ticks, by the gathered windows' indices. */
  ticks;
  /** The applications whose windows go to the end. */
  lastApps = /* @__PURE__ */ new Set();
  get minimisedIncluded() {
    return this.includeMinimised;
  }
  /** The minimised toggle widens or narrows what is gathered. */
  includeMinimisedWindows(included) {
    this.includeMinimised = included;
    this.regather();
  }
  scope() {
    return {
      appIds: this.ticks.apps(),
      includeMinimised: this.includeMinimised,
      lastAppIds: this.sendsToEnd ? [...this.lastApps] : void 0
    };
  }
  /** A preset's scope replaces the ticks wholesale, and the marks too
   * when it carries them. */
  setScope(scope) {
    this.includeMinimised = scope.includeMinimised;
    this.ticks.setApps(scope.appIds);
    if (this.sendsToEnd && scope.lastAppIds !== void 0) {
      this.lastApps = new Set(scope.lastAppIds);
    }
    this.regather();
    this.applyFocusRule();
  }
  /** The ticked subset, re-indexed, in the order the page's rules give:
   * exactly what applying hands the arrangement and what a preview draws.
   * In stacking order instead, bottom to top, it is what a recording
   * keeps. */
  ticked(order = "titles") {
    if (this.gathered === null) {
      return null;
    }
    const gathered = this.gathered;
    const pairs = [];
    gathered.liveWindows.forEach((live, i) => {
      const frame = gathered.windows[i]?.frame;
      if (this.ticks.isTicked(i) && frame !== void 0) {
        pairs.push({ live, frame });
      }
    });
    const sequence = order === "titles" ? this.inOrder(pairs) : pairs;
    return {
      workArea: gathered.workArea,
      workAreas: gathered.workAreas,
      windows: sequence.map((pair, i) => ({ id: i, frame: pair.frame })),
      liveWindows: sequence.map((pair) => pair.live),
      atEnd: sequence.map(
        (pair) => this.lastApps.has(windowAppId(pair.live) ?? "")
      )
    };
  }
  /** Ticked windows in the order the page's rules give them. */
  inOrder(pairs) {
    const focused = this.focus.focusedFirst ? focusedWindow() : null;
    return ordered(
      pairs.map((pair) => ({
        title: pair.live.get_title(),
        app: windowAppId(pair.live) ?? "",
        focused: pair.live === focused
      })),
      { last: [...this.lastApps], focusedFirst: this.focus.focusedFirst }
    ).flatMap((i) => pairs[i] ?? []);
  }
  /** Every application's windows are gathered; the ticks decide which
   * take part, a window gathered before keeping its own. */
  regather() {
    this.gathered = gather({ includeMinimised: this.includeMinimised });
    const here = this.gathered.here;
    this.ticks.gather(
      this.gathered.liveWindows.map((window, i) => ({
        key: window.get_stable_sequence(),
        appId: windowAppId(window),
        here: here[i] === true
      }))
    );
  }
  /** The page's focus rule again, after what it reads has changed, as a
   * columns area does when chosen. Returns the focused window's gathered
   * index, whose tick the rule has set, or null when there is no rule or
   * no focused window in the list. */
  applyFocusRule() {
    const leavesOut = this.focus.leavesOut;
    const gathered = this.gathered;
    const focused = focusedWindow();
    if (leavesOut === void 0 || gathered === null || focused === null) {
      return null;
    }
    const index = gathered.liveWindows.indexOf(focused);
    const frame = gathered.windows[index]?.frame;
    if (frame === void 0) {
      return null;
    }
    this.ticks.rule(index, leavesOut(frame));
    return index;
  }
  /** An application's tick, which ticks all its windows but the one the
   * focus rule leaves out. Returns the gathered indices it set. */
  tickApp(appId, ticked) {
    return this.ticks.tickApp(appId, ticked);
  }
  /** A window's own tick, which ticks its application's when it completes
   * the set; null for a window the tracker cannot attribute. */
  tickWindow(gatheredIndex, ticked) {
    return this.ticks.tickWindow(gatheredIndex, ticked);
  }
  isTicked(gatheredIndex) {
    return this.ticks.isTicked(gatheredIndex);
  }
  isAppTicked(appId) {
    return this.ticks.isAppTicked(appId);
  }
  isSentToEnd(appId) {
    return this.lastApps.has(appId);
  }
  sendToEnd(appId, sent) {
    if (sent) {
      this.lastApps.add(appId);
    } else {
      this.lastApps.delete(appId);
    }
  }
  windowAt(gatheredIndex) {
    return this.gathered?.liveWindows[gatheredIndex];
  }
  /** True for the focused window on a page that leads with it. */
  leadsWith(window) {
    return this.focus.focusedFirst && window === focusedWindow();
  }
  /** Every application with a window on the monitor arranged on, named
   * by the tracker and sorted by name, its windows in title order; a
   * window the tracker cannot attribute has no group and stays out of
   * participation. */
  groups() {
    const gathered = this.gathered;
    if (gathered === null) {
      return [];
    }
    const byApp = /* @__PURE__ */ new Map();
    gathered.liveWindows.forEach((window, i) => {
      const appId = windowAppId(window);
      if (appId === null || gathered.here[i] !== true) {
        return;
      }
      const group = byApp.get(appId) ?? {
        appId,
        name: windowAppName(window) ?? appId,
        indices: []
      };
      group.indices.push(i);
      byApp.set(appId, group);
    });
    const windowOf = (i) => gathered.liveWindows[i];
    return [...byApp.values()].sort((a, b) => a.name.localeCompare(b.name)).map((group) => ({
      ...group,
      indices: group.indices.sort((a, b) => {
        const left = windowOf(a);
        const right = windowOf(b);
        return left === void 0 || right === void 0 ? 0 : byTitle(left, right);
      })
    }));
  }
  /** The windows on each other monitor, by monitor, each row by its
   * application's name and then its title; a window the tracker cannot
   * attribute stays out here too. */
  elsewhere() {
    const gathered = this.gathered;
    if (gathered === null) {
      return [];
    }
    const byMonitor = /* @__PURE__ */ new Map();
    gathered.liveWindows.forEach((window, index) => {
      if (gathered.here[index] === true || windowAppId(window) === null) {
        return;
      }
      const monitor = window.get_monitor();
      const rows = byMonitor.get(monitor) ?? [];
      rows.push({ index, appName: windowAppName(window) ?? "" });
      byMonitor.set(monitor, rows);
    });
    const titleOf = (index) => gathered.liveWindows[index]?.get_title() ?? "";
    return [...byMonitor.entries()].sort(([left], [right]) => left - right).map(([monitor, rows]) => ({
      monitor,
      rows: rows.sort(
        (a, b) => a.appName.localeCompare(b.appName) || compareTitles(titleOf(a.index), titleOf(b.index))
      )
    }));
  }
};

// src/engine/window-list.ts
var St9 = imports.gi.St;
var CheckBoxes = imports.ui.checkBox;
var WindowList = class {
  /** The seeds are the applications that arrive ticked. The focus rules
   * are the page's, none by default, and so is the toggle that sends an
   * application to the end, which the list offers only when asked. */
  constructor(seeds, onChange, focus = { focusedFirst: false }, sendsToEnd = false) {
    this.onChange = onChange;
    this.choice = new WindowChoice(seeds, focus, sendsToEnd);
    this.actor = new St9.BoxLayout({
      vertical: true,
      style_class: "cplace-windows-block"
    });
    this.headingLabel = heading(_("Windows"));
    this.actor.add_child(this.headingLabel);
    this.scroll = new St9.ScrollView({
      hscrollbar_policy: St9.PolicyType.NEVER
    });
    this.column = new St9.BoxLayout({
      vertical: true,
      style_class: "cplace-column"
    });
    this.scroll.add_actor(this.column);
    this.actor.add_child(this.scroll);
    this.rebuild();
  }
  onChange;
  actor;
  headingLabel;
  scroll;
  column;
  choice;
  appBoxes = /* @__PURE__ */ new Map();
  windowBoxes = /* @__PURE__ */ new Map();
  /** The height the page fitted the list to, past which it scrolls; null
   * until the page has fitted it. */
  tallest = null;
  scope() {
    return this.choice.scope();
  }
  setScope(scope) {
    this.choice.setScope(scope);
    this.rebuild();
  }
  ticked(order = "titles") {
    return this.choice.ticked(order);
  }
  /** The page's focus rule again, after what it reads has changed, as a
   * columns area does when chosen; the focused window's box follows. */
  refocus() {
    const index = this.choice.applyFocusRule();
    if (index !== null) {
      this.windowBoxes.get(index)?.setToggleState(this.choice.isTicked(index));
    }
  }
  /** The list stands no taller than this, heading and all, and scrolls
   * past it; a list that fits keeps its own height. The page sets it only
   * when the dialog would stand taller than the screen. */
  fitHeight(height) {
    this.tallest = height;
    this.applyTallest();
  }
  applyTallest() {
    if (this.tallest === null) {
      this.scroll.set_height(-1);
      return;
    }
    const [, headingHeight] = this.headingLabel.get_preferred_height(-1);
    const [, rows] = this.column.get_preferred_height(-1);
    const room = this.tallest - (headingHeight ?? 0);
    this.scroll.set_height((rows ?? 0) > room ? room : -1);
  }
  rebuild() {
    this.column.destroy_all_children();
    this.appBoxes.clear();
    this.windowBoxes.clear();
    this.addMinimisedRow();
    for (const group of this.choice.groups()) {
      this.addGroup(group);
    }
    for (const group of this.choice.elsewhere()) {
      this.addMonitor(group);
    }
    this.applyTallest();
  }
  /** The scope toggle sits above the windows it widens. */
  addMinimisedRow() {
    this.addTickRow(
      _("Include minimised windows"),
      this.choice.minimisedIncluded,
      "",
      (ticked) => {
        this.choice.includeMinimisedWindows(ticked);
        this.rebuild();
        this.onChange();
      }
    );
  }
  /** An application's row, then a row for each of its windows. */
  addGroup(group) {
    this.appBoxes.set(
      group.appId,
      this.addAppRow(group.appId, group.name, group.indices.length)
    );
    for (const gatheredIndex of group.indices) {
      const window = this.choice.windowAt(gatheredIndex);
      if (window === void 0) {
        continue;
      }
      const windowBox = this.addTickRow(
        this.rowText(window),
        this.choice.isTicked(gatheredIndex),
        "cplace-indent",
        (ticked) => this.tickWindow(gatheredIndex, ticked)
      );
      this.windowBoxes.set(gatheredIndex, windowBox);
    }
  }
  /** Another monitor's name, counted from one, then a row for each of
   * its windows, named by application and title. */
  addMonitor(group) {
    this.column.add_child(heading(fill(_("Monitor {number}"), { number: group.monitor + 1 })));
    for (const row of group.rows) {
      const window = this.choice.windowAt(row.index);
      if (window === void 0) {
        continue;
      }
      const windowBox = this.addTickRow(
        fill(_("{application}: {title}"), {
          application: row.appName,
          title: window.get_title()
        }),
        this.choice.isTicked(row.index),
        "cplace-indent",
        (ticked) => this.tickWindow(row.index, ticked)
      );
      this.windowBoxes.set(row.index, windowBox);
    }
  }
  tickApp(appId, ticked) {
    for (const gatheredIndex of this.choice.tickApp(appId, ticked)) {
      this.windowBoxes.get(gatheredIndex)?.setToggleState(ticked);
    }
    this.onChange();
  }
  tickWindow(gatheredIndex, ticked) {
    const app = this.choice.tickWindow(gatheredIndex, ticked);
    if (app !== null) {
      this.appBoxes.get(app.appId)?.setToggleState(app.allTicked);
    }
    this.onChange();
  }
  /** A window's row: its title, and a mark on the focused window where
   * the page leads with it. */
  rowText(window) {
    const title = window.get_title();
    return this.choice.leadsWith(window) ? fill(_("{title}  (focused)"), { title }) : title;
  }
  /** An application's row: its tick, named with its window count, and,
   * on a page that offers it, the toggle at the row's end that sends the
   * application's windows to the end. */
  addAppRow(appId, name, count) {
    const box = this.tickBox(
      fill(_("{application} ({count})"), { application: name, count }),
      this.choice.isAppTicked(appId),
      (ticked) => this.tickApp(appId, ticked)
    );
    if (!this.choice.sendsToEnd) {
      this.column.add_child(box.actor);
      return box;
    }
    const row = new St9.BoxLayout({ vertical: false });
    box.actor.x_expand = true;
    row.add_child(box.actor);
    row.add_child(this.endToggle(appId, name));
    this.column.add_child(row);
    return box;
  }
  /** The toggle that sends an application's windows to the end, lit
   * while it does. */
  endToggle(appId, name) {
    const toggle = new St9.Button({
      style_class: "cplace-end-toggle",
      accessible_name: fill(_("Send {application} to the end"), {
        application: name
      }),
      toggle_mode: true,
      can_focus: true,
      checked: this.choice.isSentToEnd(appId),
      child: new St9.Icon({
        icon_name: "go-last",
        icon_type: St9.IconType.SYMBOLIC,
        icon_size: 12
      })
    });
    toggle.connect("clicked", () => {
      this.choice.sendToEnd(appId, toggle.checked);
      this.onChange();
    });
    return toggle;
  }
  addTickRow(text, ticked, extraClass, onToggle) {
    const box = this.tickBox(text, ticked, onToggle);
    if (extraClass === "") {
      this.column.add_child(box.actor);
    } else {
      const wrapper = new St9.Bin({
        style_class: extraClass,
        x_align: St9.Align.START,
        child: box.actor
      });
      this.column.add_child(wrapper);
    }
    return box;
  }
  tickBox(text, ticked, onToggle) {
    const box = new CheckBoxes.CheckBox(text, {}, ticked);
    box.actor.add_style_class_name("cplace-check");
    compactTick(box.actor);
    box.getLabelActor().clutter_text.set_ellipsize(
      imports.gi.Pango.EllipsizeMode.END
    );
    box.actor.connect("clicked", () => {
      onToggle(box.actor.checked);
    });
    return box;
  }
};

// src/engine/pages/list-body.ts
var St10 = imports.gi.St;
var ListBody = class {
  constructor(list, previewWidth, beside = {}) {
    this.list = list;
    this.width = previewWidth;
    this.least = previewWidth / 4;
    this.actor = new St10.BoxLayout({
      vertical: false,
      style_class: "cplace-body"
    });
    this.actor.add_child(list.actor);
    this.right = new St10.BoxLayout({
      vertical: true,
      style_class: "cplace-right"
    });
    if (beside.above !== void 0) {
      this.right.add_child(beside.above);
    }
    this.previewBin = new St10.Bin();
    this.right.add_child(this.previewBin);
    this.below = beside.below;
    if (this.below !== void 0) {
      this.right.add_child(this.below);
    }
    this.actor.add_child(this.right);
  }
  list;
  actor;
  right;
  previewBin;
  below;
  /** The stylesheet's width for the preview, less whatever fitting the
   * dialog to the screen has taken back; 0 once it is left out. */
  width;
  /** The least width a preview is drawn at, a quarter of the
   * stylesheet's, which follows the desktop's font; narrower, it is too
   * small to read. */
  least;
  /** The width the preview is drawn at now. */
  get previewWidth() {
    return this.width;
  }
  showPreview(preview) {
    replaceChild(this.previewBin, preview);
  }
  /** New controls under the preview in place of the old, which go, as a
   * restored preset's values need when the chooser stays open after it. */
  showBelow(below) {
    if (this.below === void 0) {
      this.right.add_child(below);
    } else {
      this.right.replace_child(this.below, below);
      this.below.destroy();
    }
    this.below = below;
  }
  /** A dialog standing over the screen takes the difference from the
   * list, which scrolls, and then from the preview, which the page
   * redraws at the narrower width, or without its picture once that is
   * too small to read. */
  fit(excess, redraw) {
    fitBeside(
      { list: this.list, body: this.actor, right: this.right },
      excess,
      (over) => {
        const width = narrowerBy(currentWorkArea(), this.width, over);
        this.width = width < this.least ? 0 : width;
        redraw();
      }
    );
  }
};

// src/engine/pages/list-page.ts
function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : void 0;
}
var ListPage = class {
  constructor(store, order) {
    this.store = store;
    this.order = order;
  }
  store;
  order;
  body = null;
  build(host) {
    const list = new WindowList(
      this.store.participantIds(),
      () => {
        this.refreshPreview();
      },
      {
        focusedFirst: this.order.focusedFirst,
        leavesOut: this.leavesFocusedOut?.bind(this)
      },
      this.order.sendsToEnd
    );
    this.body = new ListBody(list, host.sizes.preview, {
      above: this.aboveThePreview?.(),
      below: this.buildControls()
    });
    this.refreshPreview();
    return this.body.actor;
  }
  release() {
    this.body = null;
  }
  /** The ticked windows arranged, or nothing with none ticked, so Apply
   * leaves the chooser open as it does on a page with nothing to place. */
  apply() {
    const ticked = this.body?.list.ticked() ?? null;
    if (ticked === null || ticked.windows.length === 0) {
      return null;
    }
    return {
      targets: this.arrangement({
        workArea: this.within(ticked.workArea),
        workAreas: ticked.workAreas,
        windows: ticked.windows,
        settings: this.settings()
      }),
      liveWindows: ticked.liveWindows
    };
  }
  /** A dialog standing over the screen takes the difference from the
   * list, which scrolls, and then from the preview. */
  fit(excess) {
    this.body?.fit(excess, () => {
      this.refreshPreview();
    });
  }
  onKey() {
    return false;
  }
  hint() {
    return _(
      "Tab moves focus and Space toggles. Digits run presets, Ctrl+digit saves one. Escape changes nothing."
    );
  }
  /** A preset holds the variables and the list's scope, never windows:
   * the applications, the minimised toggle, and the applications sent to
   * the end on a page that offers it. */
  snapshot() {
    const scope = this.body?.list.scope() ?? {
      appIds: this.store.participantIds(),
      includeMinimised: false
    };
    const values = this.presetValues?.() ?? this.settings();
    return {
      ...values,
      appIds: scope.appIds,
      includeMinimised: scope.includeMinimised,
      ...this.order.sendsToEnd ? { lastAppIds: scope.lastAppIds ?? [] } : {}
    };
  }
  /** A preset's variables and scope, any it doesn't carry left as they
   * are. The controls are built again from the values restored, since a
   * preset whose applications have no window ticked leaves the chooser
   * open on them. */
  restore(variables) {
    this.restoreVariables(variables);
    this.body?.showBelow(this.buildControls());
    const list = this.body?.list;
    if (list !== void 0) {
      const current = list.scope();
      const minimised = variables["includeMinimised"];
      list.setScope({
        appIds: stringList(variables["appIds"]) ?? current.appIds,
        includeMinimised: typeof minimised === "boolean" ? minimised : current.includeMinimised,
        lastAppIds: stringList(variables["lastAppIds"])
      });
    }
    this.refreshPreview();
  }
  /** A heading and a framed spin per number, each writing through the
   * store and redrawing the preview as it changes. */
  variablesColumn(numbers2) {
    return variablesColumn(this.store, numbers2, () => {
      this.refreshPreview();
    });
  }
  /** The preview draws exactly what apply would do over the whole work
   * area, the page's layers beneath and above and its note in the
   * caption. */
  refreshPreview() {
    const body = this.body;
    const ticked = body?.list.ticked() ?? null;
    if (body === null || ticked === null) {
      return;
    }
    const area = this.within(ticked.workArea);
    const targets = this.arrangement({
      workArea: area,
      workAreas: ticked.workAreas,
      windows: ticked.windows,
      settings: this.settings()
    });
    body.showPreview(
      buildPreview(
        ticked.workArea,
        targets,
        {
          beneath: (canvas, view) => {
            this.beneath?.(canvas, view);
          },
          above: (canvas, view) => {
            this.above?.(canvas, view);
          },
          note: this.note(targets, area),
          place: placeName(),
          atEnd: (id) => ticked.atEnd[id] === true
        },
        body.previewWidth
      )
    );
  }
  /** The focus rule again, once what it reads has changed. */
  refocus() {
    this.body?.list.refocus();
  }
  within(workArea) {
    return this.areaWithin?.(workArea) ?? workArea;
  }
};

// src/engine/pages/cascade.ts
var CheckBoxes2 = imports.ui.checkBox;
var corners = [
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right"
];
var CORNER_KEY = "cascade-corner";
var SPREAD_KEY = "cascade-spread";
var FIRST_CORNER = "top-left";
function bracket() {
  return { side: 18 * global.ui_scale, inset: 3 * global.ui_scale };
}
function sideOr(stored, extent) {
  return stored > 0 ? stored : Math.floor(extent / 2);
}
var numbers = [
  { key: "cascade-window-width", field: "windowWidth", name: () => _("width"), fallback: 0, min: 100, max: 1e4, steps: [1, 10, 100] },
  { key: "cascade-window-height", field: "windowHeight", name: () => _("height"), fallback: 0, min: 100, max: 1e4, steps: [1, 10, 100] },
  { key: "cascade-offset-across", field: "offsetAcross", name: () => _("across"), fallback: 95, min: 0, max: 2e3, steps: [1, 5, 10] },
  { key: "cascade-offset-up", field: "offsetUp", name: () => _("up"), fallback: 70, min: 0, max: 2e3, steps: [1, 5, 10] },
  { key: "cascade-margin-across", field: "marginAcross", name: () => _("margin across"), fallback: 10, min: -3e3, max: 1e3, steps: [1, 10, 100] },
  { key: "cascade-margin-up", field: "marginUp", name: () => _("margin up"), fallback: 10, min: -3e3, max: 1e3, steps: [1, 10, 100] }
];
function asCorner(value) {
  return corners.includes(value) ? value : FIRST_CORNER;
}
function climbsDown(corner) {
  return corner === "top-left" || corner === "top-right";
}
var CascadePage = class extends ListPage {
  key = "cascade";
  letter = "c";
  name = _("Cascade");
  arrangement = cascade;
  /** Names the variables' rows again, once the corner has moved. */
  renameVariables = null;
  constructor(store) {
    super(store, { focusedFirst: false, sendsToEnd: true });
  }
  release() {
    this.renameVariables = null;
    super.release();
  }
  hint() {
    return _(
      "The arrow on an application's row sends its windows to the end. Tab moves focus and Space toggles. Digits run presets, Ctrl+digit saves one."
    );
  }
  /** The size and the offsets, then any application sent to the end. */
  describe(variables) {
    const shown = (field) => {
      const value = variables[field];
      return typeof value === "number" ? String(value) : "?";
    };
    const last = (stringList(variables["lastAppIds"]) ?? []).map(appName);
    return listed(
      fill(_("{width} \xD7 {height}"), {
        width: shown("windowWidth"),
        height: shown("windowHeight")
      }),
      `${shown("offsetAcross")}/${shown("offsetUp")}`,
      last.length === 0 ? "" : fill(_("{applications} last"), {
        applications: last.join(", ")
      })
    );
  }
  /** The settings in device pixels, as the arrangement works. */
  settings() {
    return toDevice(
      this.logicalSettings(),
      numbers.map((number) => number.field)
    );
  }
  /** A preset keeps the lengths as the chooser shows them. */
  presetValues() {
    return this.logicalSettings();
  }
  /** The settings as stored, in logical pixels, a side left unset
   * resolved to half the work area's. */
  logicalSettings() {
    const stored = (field) => {
      const number = numbers.find((entry) => entry.field === field);
      return number === void 0 ? 0 : this.store.number(number.key, number.fallback);
    };
    const room = logicalRoom();
    return {
      windowWidth: sideOr(stored("windowWidth"), room.width),
      windowHeight: sideOr(stored("windowHeight"), room.height),
      offsetAcross: stored("offsetAcross"),
      offsetUp: stored("offsetUp"),
      marginAcross: stored("marginAcross"),
      marginUp: stored("marginUp"),
      corner: this.corner(),
      spread: this.store.flag(SPREAD_KEY, false)
    };
  }
  /** The variables and, under them, the spread tick. The window sides
   * stop at the work area's own size, so no spin sets a size the screen
   * cannot show and no screen is capped at another's, and a side left
   * unset shows the pixels half the work area comes to. */
  buildControls() {
    const room = logicalRoom();
    const sides = {
      windowWidth: room.width,
      windowHeight: room.height
    };
    const variables = this.variablesColumn(
      numbers.map((number) => {
        const extent = sides[number.field];
        return {
          ...number,
          name: this.rowName(number),
          max: Math.min(number.max, extent ?? number.max),
          shown: extent === void 0 ? void 0 : (stored) => sideOr(stored, extent)
        };
      })
    );
    this.renameVariables = variables.rename;
    const column = variables.actor;
    const spreadTick = new CheckBoxes2.CheckBox(
      _("Spread the windows across the work area"),
      {},
      this.settings().spread
    );
    spreadTick.actor.add_style_class_name("cplace-check");
    compactTick(spreadTick.actor);
    spreadTick.actor.connect("clicked", () => {
      this.store.write(SPREAD_KEY, spreadTick.actor.checked);
      this.refreshPreview();
    });
    column.add_child(spreadTick.actor);
    return column;
  }
  restoreVariables(values) {
    for (const number of numbers) {
      const value = values[number.field];
      if (typeof value === "number") {
        this.store.write(number.key, value);
      }
    }
    if (typeof values["corner"] === "string") {
      this.store.write(CORNER_KEY, asCorner(values["corner"]));
    }
    if (typeof values["spread"] === "boolean") {
      this.store.write(SPREAD_KEY, values["spread"]);
    }
  }
  /** One bracket per corner of the screen, two sides of a square hugging
   * the frame's own corner, the starting corner lit. */
  above(canvas, view) {
    const { side, inset: inset2 } = bracket();
    const far = view.width - side - inset2;
    const low = view.height - side - inset2;
    addHandles(canvas, {
      family: "cplace-corner",
      places: [
        { id: "top-left", x: inset2, y: inset2 },
        { id: "top-right", x: far, y: inset2 },
        { id: "bottom-left", x: inset2, y: low },
        { id: "bottom-right", x: far, y: low }
      ],
      active: this.settings().corner,
      onPick: (corner) => {
        this.store.write(CORNER_KEY, corner);
        this.renameVariables?.();
        this.refreshPreview();
      }
    });
  }
  /** The step between the first two targets, measured from what will be
   * applied rather than from any setting, so a spread reads as one, in
   * logical pixels as the variables are. */
  note(targets) {
    const [first, second] = targets;
    if (first === void 0 || second === void 0) {
      return "";
    }
    const across = logical(Math.abs(second.frame.x - first.frame.x));
    const climb = logical(Math.abs(second.frame.y - first.frame.y));
    return fill(
      climbsDown(this.corner()) ? _("step {across} across, {climb} down") : _("step {across} across, {climb} up"),
      { across, climb }
    );
  }
  corner() {
    return asCorner(this.store.text(CORNER_KEY, FIRST_CORNER));
  }
  /** A row's name, the climb's two following the corner. */
  rowName(number) {
    const down = () => climbsDown(this.corner());
    if (number.field === "offsetUp") {
      return () => down() ? _("down") : _("up");
    }
    return number.field === "marginUp" ? () => down() ? _("margin down") : _("margin up") : number.name;
  }
};
function cascadePage(store) {
  return new CascadePage(store);
}

// src/arrangements/spans.ts
function weight(span) {
  return Number.isFinite(span) && span > 0 ? span : 1;
}
function spanEdges(start, length, spans) {
  const weights = spans.length > 0 ? spans.map(weight) : [1];
  const total = weights.reduce((sum, each) => sum + each, 0);
  const edges = [start];
  let running = 0;
  weights.forEach((each, index) => {
    running += each;
    const last = index === weights.length - 1;
    edges.push(
      last ? start + length : start + Math.round(length * running / total)
    );
  });
  return edges;
}
function equalSpans(count) {
  return Array.from({ length: Math.max(1, count) }, () => 1);
}
function piece(edges, first, last = first) {
  const final = Math.max(0, edges.length - 2);
  const from = clampIndex(Math.min(first, last), final);
  const to = clampIndex(Math.max(first, last), final);
  const start = edges[from] ?? 0;
  return { start, size: (edges[to + 1] ?? start) - start };
}
function clampIndex(index, final) {
  return Number.isFinite(index) ? Math.min(final, Math.max(0, Math.floor(index))) : 0;
}

// src/arrangements/columns.ts
function columns(input) {
  const { workArea, windows, settings } = input;
  const count = Number.isFinite(settings.count) ? Math.max(1, Math.floor(settings.count)) : 1;
  const rowCount = Math.ceil(windows.length / count);
  const across = spanEdges(workArea.x, workArea.width, equalSpans(count));
  const down = spanEdges(workArea.y, workArea.height, equalSpans(rowCount));
  return windows.map((window, index) => {
    const column = piece(across, index % count);
    const row = piece(down, Math.floor(index / count));
    return {
      id: window.id,
      frame: {
        x: column.start,
        y: row.start,
        width: column.size,
        height: row.size
      }
    };
  });
}

// src/arrangements/grid.ts
function cellArea(workArea, settings) {
  const across = piece(
    spanEdges(workArea.x, workArea.width, settings.columns),
    settings.cells.left,
    settings.cells.right
  );
  const down = piece(
    spanEdges(workArea.y, workArea.height, settings.rows),
    settings.cells.top,
    settings.cells.bottom
  );
  return {
    x: across.start,
    y: down.start,
    width: across.size,
    height: down.size
  };
}
function grid(input) {
  const frame = cellArea(input.workArea, input.settings);
  return input.windows.map((window) => ({
    id: window.id,
    frame: { ...frame }
  }));
}

// src/engine/grid-cells.ts
function cellSpan(anchor2, head) {
  return {
    left: Math.min(anchor2.column, head.column),
    top: Math.min(anchor2.row, head.row),
    right: Math.max(anchor2.column, head.column),
    bottom: Math.max(anchor2.row, head.row)
  };
}
function stepped(cell, direction, columns2, rows) {
  const column = direction === "left" ? cell.column - 1 : direction === "right" ? cell.column + 1 : cell.column;
  const row = direction === "up" ? cell.row - 1 : direction === "down" ? cell.row + 1 : cell.row;
  return {
    column: Math.min(columns2 - 1, Math.max(0, column)),
    row: Math.min(rows - 1, Math.max(0, row))
  };
}
function snappedCells(workArea, columns2, rows, frame) {
  const [left, right] = snappedRun(
    spanEdges(workArea.x, workArea.width, columns2),
    frame.x,
    frame.x + frame.width
  );
  const [top, bottom] = snappedRun(
    spanEdges(workArea.y, workArea.height, rows),
    frame.y,
    frame.y + frame.height
  );
  return { left, top, right, bottom };
}
function snappedRun(edges, start, end) {
  const first = nearest(edges.slice(0, -1), start);
  const last = nearest(edges.slice(1), end);
  if (last >= first) {
    return [first, last];
  }
  const centre = pieceAt(edges, (start + end) / 2);
  return [centre, centre];
}
function nearest(values, target) {
  let best = 0;
  values.forEach((value, index) => {
    if (Math.abs(value - target) < Math.abs((values[best] ?? 0) - target)) {
      best = index;
    }
  });
  return best;
}
function pieceAt(edges, point) {
  const pieces = edges.length - 1;
  for (let index = 0; index < pieces - 1; index += 1) {
    if (point < (edges[index + 1] ?? 0)) {
      return index;
    }
  }
  return Math.max(0, pieces - 1);
}

// src/engine/grid-layouts.ts
var MOST_SPANS = 20;
var DECIMAL = /^\d+(\.\d+)?$/;
function parseSpans(text) {
  if (typeof text !== "string") {
    return null;
  }
  const parts = text.split(/[\s,]+/).filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > MOST_SPANS) {
    return null;
  }
  if (!parts.every((part) => DECIMAL.test(part))) {
    return null;
  }
  const spans = parts.map(Number);
  return spans.every((span) => span > 0) ? spans : null;
}
function layoutLabel(name, columns2, rows) {
  const trimmed2 = name.trim();
  return trimmed2 !== "" ? trimmed2 : `${columns2.length} \xD7 ${rows.length}`;
}
function parseLayouts(rows) {
  const layouts = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const fields = row;
    const columns2 = parseSpans(fields["columns"]);
    const rowSpans = parseSpans(fields["rows"]);
    if (columns2 === null || rowSpans === null) {
      continue;
    }
    const name = typeof fields["name"] === "string" ? fields["name"] : "";
    layouts.push({
      label: layoutLabel(name, columns2, rowSpans),
      columns: columns2,
      rows: rowSpans
    });
  }
  return layouts;
}
var fallbackLayouts = [
  { label: "2 \xD7 2", columns: [1, 1], rows: [1, 1] },
  { label: "3 \xD7 2", columns: [1, 2, 1], rows: [1, 1] },
  { label: "4 \xD7 4", columns: [1, 1, 1, 1], rows: [1, 1, 1, 1] },
  {
    label: "6 \xD7 6",
    columns: [1, 1, 1, 1, 1, 1],
    rows: [1, 1, 1, 1, 1, 1]
  }
];
var GRID_LAYOUTS_KEY = "grid-layouts";
function layoutsOr(rows) {
  const layouts = parseLayouts(rows);
  return layouts.length > 0 ? layouts : fallbackLayouts;
}
function sameSpans(left, right) {
  return left.length === right.length && left.every((span, index) => span === right[index]);
}

// src/engine/grid-view.ts
var Clutter4 = imports.gi.Clutter;
var St11 = imports.gi.St;
function border() {
  return 2 * global.ui_scale;
}
function inset() {
  return global.ui_scale;
}
var GridView = class {
  actor;
  cells;
  /** The screen is the work area drawn at a width. The ghost is the
   * window's current frame, drawn behind the cells so the move reads as a
   * move; null draws none. */
  constructor(screenAt, layout, ghost, events) {
    const { workArea, width } = screenAt;
    const height = Math.max(
      1,
      Math.round(workArea.height * width / workArea.width)
    );
    this.actor = new Clutter4.Actor();
    this.actor.set_size(width, height);
    this.actor.set_clip_to_allocation(true);
    const screen = new St11.Bin({ style_class: "cplace-preview-screen" });
    screen.set_size(width, height);
    this.actor.add_child(screen);
    const frame = border();
    const scaleX = (width - 2 * frame) / workArea.width;
    const scaleY = (height - 2 * frame) / workArea.height;
    const toX = (x) => frame + Math.round((x - workArea.x) * scaleX);
    const toY = (y) => frame + Math.round((y - workArea.y) * scaleY);
    if (ghost !== null) {
      this.addGhost(ghost, toX, toY);
    }
    this.cells = addCellButtons(this.actor, {
      edges: cellEdges(workArea, layout, toX, toY),
      layout,
      styleClass: "cplace-grid-cell",
      events
    });
  }
  /** Light the chosen cells, and mark the cursor among them. */
  paint(span, head) {
    for (const { cell, button } of this.cells) {
      const chosen = cell.column >= span.left && cell.column <= span.right && cell.row >= span.top && cell.row <= span.bottom;
      const cursor = cell.column === head.column && cell.row === head.row;
      setClass(button, "cplace-grid-cell-selected", chosen);
      setClass(button, "cplace-grid-cell-head", cursor);
    }
  }
  addGhost(frame, toX, toY) {
    const left = toX(frame.x);
    const top = toY(frame.y);
    const ghost = new St11.Bin({ style_class: "cplace-grid-ghost" });
    ghost.set_position(left, top);
    ghost.set_size(
      Math.max(2, toX(frame.x + frame.width) - left),
      Math.max(2, toY(frame.y + frame.height) - top)
    );
    this.actor.add_child(ghost);
  }
};
function setClass(widget, styleClass, on) {
  if (on) {
    widget.add_style_class_name(styleClass);
  } else {
    widget.remove_style_class_name(styleClass);
  }
}
function cellEdges(workArea, layout, toX, toY) {
  return {
    xs: spanEdges(workArea.x, workArea.width, layout.columns).map(toX),
    ys: spanEdges(workArea.y, workArea.height, layout.rows).map(toY)
  };
}
function addCellButtons(canvas, layer) {
  const cells = [];
  layer.layout.rows.forEach((_row, row) => {
    layer.layout.columns.forEach((_column, column) => {
      const cell = { column, row };
      const button = cellButton(cell, layer);
      canvas.add_child(button);
      cells.push({ cell, button });
    });
  });
  return cells;
}
function cellButton(cell, layer) {
  const { xs, ys } = layer.edges;
  const left = xs[cell.column] ?? 0;
  const top = ys[cell.row] ?? 0;
  const right = xs[cell.column + 1] ?? left;
  const bottom = ys[cell.row + 1] ?? top;
  const button = new St11.Button({
    style_class: layer.styleClass,
    reactive: true,
    track_hover: true,
    can_focus: false
  });
  const gap = inset();
  button.set_position(left + gap, top + gap);
  button.set_size(
    Math.max(1, right - left - 2 * gap),
    Math.max(1, bottom - top - 2 * gap)
  );
  button.connect("clicked", () => {
    layer.events.click(cell);
  });
  button.connect("notify::hover", () => {
    if (button.hover) {
      layer.events.hover(cell);
    }
  });
  return button;
}
function fillLayoutButtons(row, layouts, active, pick) {
  row.destroy_all_children();
  layouts.forEach((layout, index) => {
    const button = new St11.Button({
      label: layout.label,
      style_class: "cplace-layout-button",
      can_focus: true
    });
    if (sameSpans(layout.columns, active.columns) && sameSpans(layout.rows, active.rows)) {
      button.add_style_class_name("cplace-layout-button-active");
    }
    button.connect("clicked", () => {
      pick(index);
    });
    row.add_child(button);
  });
}

// src/engine/area-picker.ts
var St12 = imports.gi.St;
var AreaPicker = class {
  constructor(area, chosen) {
    this.area = area;
    this.chosen = chosen;
  }
  area;
  chosen;
  anchor = { column: 0, row: 0 };
  /** A first click has anchored a corner and the pointer drags the far
   * one until the second click chooses. */
  pointing = false;
  outline = null;
  edges = null;
  current() {
    return this.area;
  }
  /** A preset's area, or the settings' own, replacing the current one. */
  set(area) {
    this.area = area;
    this.pointing = false;
  }
  /** Another layout, keeping the area as nearly as its cells allow. */
  relayout(layout, workArea) {
    const covered = cellArea(workArea, {
      columns: this.area.layout.columns,
      rows: this.area.layout.rows,
      cells: this.area.cells
    });
    this.set({
      layout,
      cells: snappedCells(workArea, layout.columns, layout.rows, covered)
    });
  }
  /** The cells, beneath the slots, where the clicks land. */
  beneath(canvas, view) {
    const layout = this.area.layout;
    this.edges = cellEdges(view.workArea, layout, view.toX, view.toY);
    addCellButtons(canvas, {
      edges: this.edges,
      layout,
      styleClass: "cplace-area-cell",
      events: {
        click: (cell) => {
          this.click(cell);
        },
        hover: (cell) => {
          this.hover(cell);
        }
      }
    });
  }
  /** The chosen area's outline, above the slots. */
  above(canvas) {
    this.outline = new St12.Bin({ style_class: "cplace-area-outline" });
    canvas.add_child(this.outline);
    this.frame(this.area.cells);
  }
  click(cell) {
    if (!this.pointing) {
      this.anchor = cell;
      this.pointing = true;
      this.frame(cellSpan(cell, cell));
      return;
    }
    this.pointing = false;
    this.area = {
      layout: this.area.layout,
      cells: cellSpan(this.anchor, cell)
    };
    this.chosen(this.area);
  }
  hover(cell) {
    if (this.pointing) {
      this.frame(cellSpan(this.anchor, cell));
    }
  }
  /** The outline around a run of cells, on the canvas's pixels. */
  frame(cells) {
    if (this.outline === null || this.edges === null) {
      return;
    }
    const { xs, ys } = this.edges;
    const left = xs[cells.left] ?? 0;
    const top = ys[cells.top] ?? 0;
    this.outline.set_position(left, top);
    this.outline.set_size(
      Math.max(2, (xs[cells.right + 1] ?? left) - left),
      Math.max(2, (ys[cells.bottom + 1] ?? top) - top)
    );
  }
};

// src/engine/grid-presets.ts
function presetSpans(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (value.length > MOST_SPANS) {
    return null;
  }
  return value.every((span) => typeof span === "number" && span > 0) ? value : null;
}
function presetCells(variables) {
  const { left, top, right, bottom } = variables;
  return typeof left === "number" && typeof top === "number" && typeof right === "number" && typeof bottom === "number" ? { left, top, right, bottom } : null;
}
function presetLabel(variables) {
  const named = variables["layout"];
  if (typeof named === "string") {
    return named;
  }
  return layoutLabel(
    "",
    presetSpans(variables["columns"]) ?? [],
    presetSpans(variables["rows"]) ?? []
  );
}
function run(first, last) {
  const low = Math.min(first, last) + 1;
  const high = Math.max(first, last) + 1;
  return low === high ? `${low}` : `${low}\u2013${high}`;
}
function describeGridPreset(variables) {
  const label = presetLabel(variables);
  const cells = presetCells(variables);
  if (cells === null) {
    return label;
  }
  const one = cells.left === cells.right && cells.top === cells.bottom;
  const where = {
    across: run(cells.left, cells.right),
    down: run(cells.top, cells.bottom)
  };
  return listed(
    label,
    fill(
      one ? _("cell {across} across, {down} down") : _("cells {across} across, {down} down"),
      where
    )
  );
}

// src/engine/areas.ts
function wholeArea(layout) {
  return {
    layout,
    cells: {
      left: 0,
      top: 0,
      right: layout.columns.length - 1,
      bottom: layout.rows.length - 1
    }
  };
}
function isWholeArea(area) {
  const whole = wholeArea(area.layout).cells;
  const cells = area.cells;
  return Math.min(cells.left, cells.right) === whole.left && Math.min(cells.top, cells.bottom) === whole.top && Math.max(cells.left, cells.right) === whole.right && Math.max(cells.top, cells.bottom) === whole.bottom;
}
function areaValue(area) {
  return {
    layout: area.layout.label,
    columns: [...area.layout.columns],
    rows: [...area.layout.rows],
    ...area.cells
  };
}
function areaFrom(value, layouts) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const stored = value;
  const columns2 = presetSpans(stored["columns"]);
  const rows = presetSpans(stored["rows"]);
  const cells = presetCells(stored);
  if (columns2 === null || rows === null || cells === null) {
    return null;
  }
  const layout = layouts.find(
    (known) => sameSpans(known.columns, columns2) && sameSpans(known.rows, rows)
  ) ?? { label: presetLabel(stored), columns: columns2, rows };
  const column = (index) => Math.min(columns2.length - 1, Math.max(0, Math.floor(index)));
  const row = (index) => Math.min(rows.length - 1, Math.max(0, Math.floor(index)));
  return {
    layout,
    cells: {
      left: column(Math.min(cells.left, cells.right)),
      top: row(Math.min(cells.top, cells.bottom)),
      right: column(Math.max(cells.left, cells.right)),
      bottom: row(Math.max(cells.top, cells.bottom))
    }
  };
}
function whollyOutside(frame, area) {
  return frame.x + frame.width <= area.x || area.x + area.width <= frame.x || frame.y + frame.height <= area.y || area.y + area.height <= frame.y;
}

// src/engine/pages/columns.ts
var St13 = imports.gi.St;
var columnCount = {
  key: "columns-count",
  name: () => _("columns"),
  fallback: 2,
  min: 1,
  max: 6,
  steps: [1]
};
var AREA_KEY = "columns-area";
var ColumnsPage = class extends ListPage {
  key = "columns";
  letter = "n";
  name = _("Columns");
  arrangement = columns;
  layouts = [];
  picker = null;
  layoutRow = null;
  constructor(store) {
    super(store, { focusedFirst: true, sendsToEnd: false });
  }
  build(host) {
    this.layouts = layoutsOr(this.store.list(GRID_LAYOUTS_KEY));
    this.picker = new AreaPicker(this.storedArea(), (area) => {
      this.keep(area);
    });
    return super.build(host);
  }
  release() {
    this.picker = null;
    this.layoutRow = null;
    super.release();
  }
  hint() {
    return _(
      "Two clicks on the preview choose the area. Tab moves focus, Space toggles, Ctrl+digit saves a preset."
    );
  }
  /** A columns preset holds the area beside the count and the scope. */
  snapshot() {
    const area = this.picker?.current();
    return area === void 0 ? super.snapshot() : { ...super.snapshot(), area: areaValue(area) };
  }
  describe(variables) {
    const count = variables["count"];
    if (typeof count !== "number") {
      return "?";
    }
    const area = areaFrom(variables["area"], this.layouts);
    return area === null || isWholeArea(area) ? fill(ngettext("{count} column", "{count} columns", count), {
      count
    }) : fill(
      ngettext(
        "{count} column in {area}",
        "{count} columns in {area}",
        count
      ),
      { count, area: describeGridPreset(areaValue(area)) }
    );
  }
  /** The count as stored, held to the spin's bounds, so a count edited
   * into the settings file by hand cannot ask for a million columns. */
  settings() {
    const count = this.store.number(columnCount.key, columnCount.fallback);
    return {
      count: Math.min(columnCount.max, Math.max(columnCount.min, count))
    };
  }
  buildControls() {
    return this.variablesColumn([columnCount]).actor;
  }
  restoreVariables(values) {
    if (typeof values["count"] === "number") {
      this.store.write(columnCount.key, values["count"]);
    }
    const area = areaFrom(values["area"], this.layouts);
    if (area !== null) {
      this.picker?.set(area);
      this.store.write(AREA_KEY, areaValue(area));
      this.relight();
    }
  }
  /** The area's heading and its layouts, above the preview. */
  aboveThePreview() {
    const column = new St13.BoxLayout({
      vertical: true,
      style_class: "cplace-column"
    });
    column.add_child(heading(_("Area")));
    this.layoutRow = new St13.BoxLayout({
      vertical: false,
      style_class: "cplace-layouts"
    });
    column.add_child(this.layoutRow);
    this.relight();
    return column;
  }
  areaWithin(workArea) {
    const area = this.picker?.current();
    return area === void 0 ? workArea : cellArea(workArea, {
      columns: area.layout.columns,
      rows: area.layout.rows,
      cells: area.cells
    });
  }
  /** The main window the grid placed beside the area lies wholly outside
   * it, and stays out of the columns unless ticked by hand. */
  leavesFocusedOut(frame) {
    return whollyOutside(frame, this.areaWithin(currentWorkArea()));
  }
  beneath(canvas, view) {
    this.picker?.beneath(canvas, view);
  }
  above(canvas) {
    this.picker?.above(canvas);
  }
  /** The rows the windows take, and the area when it is not the whole
   * work area, both measured from what will be applied. */
  note(targets, area) {
    const rows = new Set(targets.map((target) => target.frame.y)).size;
    const whole = this.picker === null || isWholeArea(this.picker.current());
    const values = {
      count: rows,
      width: logical(area.width),
      height: logical(area.height),
      x: logical(area.x),
      y: logical(area.y)
    };
    return whole ? fill(ngettext("{count} row", "{count} rows", rows), values) : fill(
      ngettext(
        "{count} row in {width} \xD7 {height} at {x}, {y}",
        "{count} rows in {width} \xD7 {height} at {x}, {y}",
        rows
      ),
      values
    );
  }
  /** The area the settings hold, or the whole work area in the first of
   * the grid's layouts when they hold none. */
  storedArea() {
    const first = this.layouts[0] ?? {
      label: "1 \xD7 1",
      columns: [1],
      rows: [1]
    };
    return areaFrom(this.store.raw(AREA_KEY), this.layouts) ?? wholeArea(first);
  }
  keep(area) {
    this.store.write(AREA_KEY, areaValue(area));
    this.refocus();
    this.relight();
    this.refreshPreview();
  }
  /** The layout buttons, the area's own lit; picking one keeps the area
   * as nearly as the new layout's cells allow. */
  relight() {
    const picker = this.picker;
    if (this.layoutRow === null || picker === null) {
      return;
    }
    fillLayoutButtons(
      this.layoutRow,
      this.layouts,
      picker.current().layout,
      (index) => {
        const layout = this.layouts[index];
        if (layout !== void 0) {
          picker.relayout(layout, currentWorkArea());
          this.keep(picker.current());
        }
      }
    );
  }
};
function columnsPage(store) {
  return new ColumnsPage(store);
}

// src/engine/pages/window-header.ts
var Cinnamon = imports.gi.Cinnamon;
var Pango = imports.gi.Pango;
var St14 = imports.gi.St;
var ICON_SIZE = 20;
function windowHeader(window, width) {
  const row = new St14.BoxLayout({
    vertical: false,
    style_class: "cplace-window-header"
  });
  row.set_width(width);
  if (window === null) {
    row.add_child(new St14.Label({ text: _("No focused window to place.") }));
    return row;
  }
  const app = Cinnamon.WindowTracker.get_default().get_window_app(window);
  if (app !== null) {
    row.add_child(app.create_icon_texture(ICON_SIZE));
  }
  const appName2 = windowAppName(window);
  const title = window.get_title();
  const label = new St14.Label({
    text: appName2 === null ? title : fill(_("{title} \u2013 {application}"), {
      title,
      application: appName2
    }),
    y_align: imports.gi.Clutter.ActorAlign.CENTER
  });
  label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
  row.add_child(label);
  return row;
}

// src/engine/pages/grid.ts
var Clutter5 = imports.gi.Clutter;
var St15 = imports.gi.St;
var LAST_KEY = "grid-last-layout";
var arrowDirections = /* @__PURE__ */ new Map([
  [Clutter5.KEY_Left, "left"],
  [Clutter5.KEY_Right, "right"],
  [Clutter5.KEY_Up, "up"],
  [Clutter5.KEY_Down, "down"],
  [Clutter5.KEY_KP_Left, "left"],
  [Clutter5.KEY_KP_Right, "right"],
  [Clutter5.KEY_KP_Up, "up"],
  [Clutter5.KEY_KP_Down, "down"]
]);
var GridPage = class {
  constructor(store) {
    this.store = store;
  }
  store;
  key = "grid";
  letter = "g";
  name = _("Grid");
  layouts = fallbackLayouts;
  layout = { label: "1 \xD7 1", columns: [1], rows: [1] };
  window = null;
  workArea = { x: 0, y: 0, width: 1, height: 1 };
  anchor = { column: 0, row: 0 };
  head = { column: 0, row: 0 };
  /** A first click has anchored the rectangle and the pointer drags its
   * far corner until the second click places the window. */
  pointing = false;
  host = null;
  /** The page's width from the stylesheet, less whatever fitting the
   * dialog to the screen has taken back. */
  gridWidth = 1;
  view = null;
  viewBin = null;
  layoutRow = null;
  caption = null;
  build(host) {
    this.host = host;
    this.gridWidth = host.sizes.page;
    this.window = focusedWindow();
    this.workArea = currentWorkArea();
    this.layouts = layoutsOr(this.store.list(GRID_LAYOUTS_KEY));
    this.useLayout(this.store.number(LAST_KEY, 0));
    const page = new St15.BoxLayout({
      vertical: true,
      style_class: "cplace-column cplace-grid-page"
    });
    page.add_child(heading(_("Window")));
    page.add_child(windowHeader(this.window, host.sizes.page));
    page.add_child(heading(_("Layout")));
    this.layoutRow = new St15.BoxLayout({
      vertical: false,
      style_class: "cplace-layouts"
    });
    page.add_child(this.layoutRow);
    this.viewBin = new St15.Bin({ x_align: St15.Align.START });
    page.add_child(this.viewBin);
    this.caption = new St15.Label({ style_class: "cplace-preview-caption" });
    page.add_child(this.caption);
    this.redraw();
    return page;
  }
  release() {
    this.window = null;
    this.host = null;
    this.pointing = false;
    this.view = null;
    this.viewBin = null;
    this.layoutRow = null;
    this.caption = null;
  }
  /** The focused window into the chosen cells; nothing without one. */
  apply() {
    if (this.window === null) {
      return null;
    }
    return {
      targets: grid({
        workArea: this.workArea,
        workAreas: allWorkAreas(),
        windows: [{ id: 0, frame: frameOf2(this.window) }],
        settings: this.settings()
      }),
      liveWindows: [this.window]
    };
  }
  /** Whatever the dialog stands over the screen comes out of the grid's
   * height, the width following in the work area's proportions. */
  fit(excess) {
    if (excess <= 0 || this.view === null) {
      return;
    }
    const tall = this.view.actor.height - excess;
    this.gridWidth = Math.min(
      this.gridWidth,
      widthForHeight(this.workArea, tall)
    );
    this.redraw();
  }
  onKey(symbol, modifiers) {
    const direction = arrowDirections.get(symbol);
    if (direction !== void 0) {
      this.move(direction, modifiers.shift);
      return true;
    }
    if (symbol === Clutter5.KEY_space) {
      this.host?.apply();
      return true;
    }
    return false;
  }
  hint() {
    return _(
      "Two clicks place the window; arrows move, Shift grows, Enter places. Ctrl+digit saves a preset."
    );
  }
  /** A grid preset is the layout and the cells, never the window. */
  snapshot() {
    return {
      layout: this.layout.label,
      columns: [...this.layout.columns],
      rows: [...this.layout.rows],
      ...cellSpan(this.anchor, this.head)
    };
  }
  restore(variables) {
    const columns2 = presetSpans(variables["columns"]);
    const rows = presetSpans(variables["rows"]);
    if (columns2 !== null && rows !== null) {
      this.adoptLayout(presetLabel(variables), columns2, rows);
    }
    const cells = presetCells(variables);
    if (cells !== null) {
      this.anchor = this.inside({ column: cells.left, row: cells.top });
      this.head = this.inside({ column: cells.right, row: cells.bottom });
    }
    this.pointing = false;
    if (this.viewBin !== null) {
      this.redraw();
    }
  }
  describe(variables) {
    return describeGridPreset(variables);
  }
  settings() {
    return {
      columns: this.layout.columns,
      rows: this.layout.rows,
      cells: cellSpan(this.anchor, this.head)
    };
  }
  /** The layout at an index, the selection starting over on the cells
   * the window covers in it. */
  useLayout(index) {
    const clamped = Math.min(
      this.layouts.length - 1,
      Math.max(0, Math.floor(index))
    );
    this.layout = this.layouts[clamped] ?? this.layout;
    const span = this.window === null ? { left: 0, top: 0, right: 0, bottom: 0 } : snappedCells(
      this.workArea,
      this.layout.columns,
      this.layout.rows,
      frameOf2(this.window)
    );
    this.anchor = { column: span.left, row: span.top };
    this.head = { column: span.right, row: span.bottom };
    this.pointing = false;
  }
  /** A preset's layout: the matching one from the settings, lit on its
   * button and remembered, or the preset's own when none matches. */
  adoptLayout(label, columns2, rows) {
    const index = this.layouts.findIndex(
      (layout) => sameSpans(layout.columns, columns2) && sameSpans(layout.rows, rows)
    );
    const known = this.layouts[index];
    if (known !== void 0) {
      this.layout = known;
      this.store.write(LAST_KEY, index);
      return;
    }
    this.layout = { label, columns: columns2, rows };
  }
  inside(cell) {
    return {
      column: Math.min(
        this.layout.columns.length - 1,
        Math.max(0, Math.floor(cell.column))
      ),
      row: Math.min(
        this.layout.rows.length - 1,
        Math.max(0, Math.floor(cell.row))
      )
    };
  }
  move(direction, grow) {
    this.head = stepped(
      this.head,
      direction,
      this.layout.columns.length,
      this.layout.rows.length
    );
    if (!grow) {
      this.anchor = this.head;
    }
    this.pointing = false;
    this.repaint();
  }
  /** The first click anchors a corner; the second places the window. */
  onClick(cell) {
    if (!this.pointing) {
      this.anchor = cell;
      this.head = cell;
      this.pointing = true;
      this.repaint();
      return;
    }
    this.head = cell;
    this.pointing = false;
    this.repaint();
    this.host?.apply();
  }
  /** Between the clicks the far corner follows the pointer. */
  onHover(cell) {
    if (this.pointing) {
      this.head = cell;
      this.repaint();
    }
  }
  /** The layout buttons and the grid, built afresh for a layout. */
  redraw() {
    this.rebuildLayoutButtons();
    this.view = new GridView(
      { workArea: this.workArea, width: this.gridWidth },
      this.layout,
      this.window === null ? null : frameOf2(this.window),
      {
        click: (cell) => {
          this.onClick(cell);
        },
        hover: (cell) => {
          this.onHover(cell);
        }
      }
    );
    if (this.viewBin !== null) {
      replaceChild(this.viewBin, this.view.actor);
    }
    this.repaint();
  }
  rebuildLayoutButtons() {
    if (this.layoutRow === null) {
      return;
    }
    fillLayoutButtons(
      this.layoutRow,
      this.layouts,
      this.layout,
      (index) => {
        this.store.write(LAST_KEY, index);
        this.useLayout(index);
        this.redraw();
      }
    );
  }
  /** Light the chosen cells and say where the window will land. */
  repaint() {
    this.view?.paint(cellSpan(this.anchor, this.head), this.head);
    if (this.caption === null) {
      return;
    }
    const frame = cellArea(this.workArea, this.settings());
    const area = this.workArea;
    this.caption.set_text(
      listed(
        placeName(),
        fill(_("{width} \xD7 {height}"), {
          width: logical(area.width),
          height: logical(area.height)
        }),
        fill(_("target {width} \xD7 {height} at {x}, {y}"), {
          width: logical(frame.width),
          height: logical(frame.height),
          x: logical(frame.x),
          y: logical(frame.y)
        })
      )
    );
  }
};
function gridPage(store) {
  return new GridPage(store);
}

// src/arrangements/recorded.ts
function placed(areas, workArea, frame) {
  const home = homeArea(areas, frame);
  return home === null ? movedInto(workArea, frame) : trimmed(home, frame);
}
function recorded(input) {
  const { workArea, windows, settings } = input;
  const areas = input.workAreas ?? [workArea];
  return windows.flatMap((window, index) => {
    const frame = settings.frames[index];
    return frame === void 0 ? [] : [{ id: window.id, frame: placed(areas, workArea, frame) }];
  });
}

// src/engine/recordings.ts
function matchRecording(entries, windows) {
  const claimed = /* @__PURE__ */ new Set();
  const claim = (entry, byTitle3) => {
    const index = windows.findIndex(
      (window, i) => !claimed.has(i) && window.app === entry.app && (!byTitle3 || window.title === entry.title)
    );
    if (index < 0) {
      return null;
    }
    claimed.add(index);
    return index;
  };
  const byTitle2 = entries.map((entry) => claim(entry, true));
  return byTitle2.map((index, entryIndex) => {
    const entry = entries[entryIndex];
    return index !== null || entry === void 0 ? index : claim(entry, false);
  });
}
function recordingFrom(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const stored = value;
  const entries = stored["entries"];
  if (!Array.isArray(entries)) {
    return null;
  }
  const made = stored["made"];
  return {
    entries: entries.flatMap((entry) => {
      const parsed = entryFrom(entry);
      return parsed === null ? [] : [parsed];
    }),
    made: typeof made === "string" ? made : ""
  };
}
function entryFrom(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const stored = value;
  const app = stored["app"];
  const title = stored["title"];
  const frame = frameFrom(stored["frame"]);
  if (typeof app !== "string" || app === "" || typeof title !== "string") {
    return null;
  }
  return frame === null ? null : { app, title, frame };
}
function frameFrom(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const stored = value;
  const [x, y, width, height] = ["x", "y", "width", "height"].map(
    (field) => stored[field]
  );
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) {
    return null;
  }
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
function describeRecording(recording) {
  const count = recording.entries.length;
  return listed(
    fill(ngettext("{count} window", "{count} windows", count), { count }),
    recording.made
  );
}
function madeAt(date) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:` + two(date.getMinutes());
}

// src/engine/recall.ts
function recallOf(recording) {
  const gathered = gather({ includeMinimised: true });
  const found = matchRecording(
    recording.entries,
    gathered.liveWindows.map((window) => ({
      app: windowAppId(window) ?? "",
      title: window.get_title()
    }))
  );
  const windows = [];
  const frames = [];
  const liveWindows = [];
  const missing = [];
  recording.entries.forEach((entry, entryIndex) => {
    const index = found[entryIndex] ?? null;
    const live = index === null ? void 0 : gathered.liveWindows[index];
    if (live === void 0) {
      missing.push(entry);
      return;
    }
    windows.push({ id: liveWindows.length, frame: frameOf2(live) });
    liveWindows.push(live);
    frames.push(entry.frame);
  });
  return {
    workArea: gathered.workArea,
    targets: recorded({
      workArea: gathered.workArea,
      workAreas: gathered.workAreas,
      windows,
      settings: { frames }
    }),
    liveWindows,
    missing,
    total: recording.entries.length
  };
}

// src/engine/pages/recorded.ts
var St16 = imports.gi.St;
function drawnOver(workArea) {
  return monitorCount() > 1 ? { area: desktopArea(), place: _("All monitors") } : { area: workArea, place: "" };
}
function outlineMissing(canvas, view, missing) {
  for (const entry of missing) {
    const frame = trimmed(view.workArea, entry.frame);
    const outline = new St16.Bin({ style_class: "cplace-preview-missing" });
    outline.set_position(view.toX(frame.x), view.toY(frame.y));
    outline.set_size(
      Math.max(2, view.toX(frame.x + frame.width) - view.toX(frame.x)),
      Math.max(2, view.toY(frame.y + frame.height) - view.toY(frame.y))
    );
    canvas.add_child(outline);
  }
}
var RecordedPage = class {
  constructor(store) {
    this.store = store;
  }
  store;
  key = "recorded";
  letter = "r";
  name = _("Recorded");
  body = null;
  /** The recording a digit restored, for the apply that follows it. */
  restored = null;
  /** The recording whose row is pointed at or focused. */
  pointed = null;
  build(host) {
    this.restored = null;
    this.pointed = null;
    const list = new WindowList(this.store.participantIds(), () => {
      this.refreshPreview();
    });
    this.body = new ListBody(list, host.sizes.preview);
    this.refreshPreview();
    return this.body.actor;
  }
  release() {
    this.body = null;
    this.restored = null;
    this.pointed = null;
  }
  /** A dialog standing over the screen takes the difference from the
   * list, which scrolls, and then from the preview. */
  fit(excess) {
    this.body?.fit(excess, () => {
      this.refreshPreview();
    });
  }
  /** Put back the recording a digit restored, or the one pointed at. */
  apply() {
    const recording = this.restored ?? this.pointed;
    this.restored = null;
    if (recording === null) {
      return null;
    }
    const recall = recallOf(recording);
    return recall.targets.length === 0 ? null : { targets: recall.targets, liveWindows: recall.liveWindows };
  }
  onKey() {
    return false;
  }
  hint() {
    return _(
      "Ctrl+digit records the ticked windows and the digit puts them back. Point at a recording to see it; \xD7 or Delete removes one."
    );
  }
  /** A recording of the ticked windows as they stand, bottom to top. */
  snapshot() {
    const ticked = this.body?.list.ticked("stacking") ?? null;
    const entries = [];
    for (const window of ticked?.liveWindows ?? []) {
      const app = windowAppId(window);
      if (app !== null) {
        entries.push({
          app,
          title: window.get_title(),
          frame: frameOf2(window)
        });
      }
    }
    return { entries, made: madeAt(/* @__PURE__ */ new Date()) };
  }
  restore(variables) {
    this.restored = recordingFrom(variables);
  }
  describe(variables) {
    const recording = recordingFrom(variables);
    return recording === null ? "?" : describeRecording(recording);
  }
  previewPreset(variables) {
    this.pointed = variables === null ? null : recordingFrom(variables);
    this.refreshPreview();
  }
  refreshPreview() {
    const body = this.body;
    if (body === null) {
      return;
    }
    const preview = this.pointed === null ? this.standingPreview(body) : this.recallPreview(this.pointed, body.previewWidth);
    if (preview !== null) {
      body.showPreview(preview);
    }
  }
  /** A recording's found windows at their recorded frames, and its
   * missing entries outlined. */
  recallPreview(recording, width) {
    const recall = recallOf(recording);
    const drawn = drawnOver(recall.workArea);
    return buildPreview(
      drawn.area,
      recall.targets,
      {
        beneath: () => void 0,
        above: (canvas, view) => {
          outlineMissing(canvas, view, recall.missing);
        },
        note: "",
        place: drawn.place,
        windows: fill(
          ngettext(
            "{found} of {total} window found",
            "{found} of {total} windows found",
            recall.total
          ),
          { found: recall.targets.length, total: recall.total }
        )
      },
      width
    );
  }
  /** The ticked windows where they stand, as a recording would keep
   * them. */
  standingPreview(body) {
    const ticked = body.list.ticked("stacking");
    if (ticked === null) {
      return null;
    }
    const drawn = drawnOver(ticked.workArea);
    return buildPreview(
      drawn.area,
      ticked.windows.map((window) => ({
        id: window.id,
        frame: window.frame
      })),
      {
        beneath: () => void 0,
        above: () => void 0,
        note: _("as Ctrl+digit records them"),
        place: drawn.place
      },
      body.previewWidth
    );
  }
};
function recordedPage(store) {
  return new RecordedPage(store);
}

// src/engine/settings.ts
var ExtensionSettings = imports.ui.settings.ExtensionSettings;
var EngineSettings = class {
  participants = "";
  placeHotkey = "<Super>z";
  presets = "{}";
  settings;
  constructor(uuid, onHotkeyChange) {
    this.settings = new ExtensionSettings(this, uuid);
    this.settings.bind("participants", "participants");
    this.settings.bind("place-hotkey", "placeHotkey", onHotkeyChange);
    this.settings.bind("presets", "presets");
  }
  /** A page's number, or its fallback when the store holds anything
   * else; the values read live, so a write is visible at once. */
  number(key, fallback) {
    const value = this.settings.getValue(key);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
  text(key, fallback) {
    const value = this.settings.getValue(key);
    return typeof value === "string" ? value : fallback;
  }
  flag(key, fallback) {
    const value = this.settings.getValue(key);
    return typeof value === "boolean" ? value : fallback;
  }
  /** A page's list: the rows a list setting holds, each a plain object
   * keyed by the column ids its schema declares; empty when the store
   * holds anything else. */
  list(key) {
    const value = this.settings.getValue(key);
    return Array.isArray(value) ? value : [];
  }
  /** A page's write, into the store the settings dialogue binds as well,
   * so the chooser and the dialogue never disagree. */
  write(key, value) {
    this.settings.setValue(key, value);
  }
  /** Whatever the store holds under a key, for the development handle. */
  raw(key) {
    return this.settings.getValue(key);
  }
  presetStore() {
    return parsePresets(this.presets);
  }
  writePresetStore(store) {
    this.settings.setValue("presets", JSON.stringify(store));
  }
  /** The applications that arrive ticked: the participants setting's,
   * or, while it names none, the focused window's, the one the user is
   * likeliest to be arranging. */
  participantIds() {
    const named = this.participants.split(",").map((id) => id.trim()).filter((id) => id.length > 0);
    if (named.length > 0) {
      return named;
    }
    const focused = focusedWindow();
    const app = focused === null ? null : windowAppId(focused);
    return app === null ? [] : [app];
  }
  finalize() {
    this.settings.finalize();
  }
};

// src/extension.ts
var UUID = "cPlace@riaanburger";
var HOTKEY_ID = "cPlace-place";
var engineSettings = null;
var chooser = null;
var hotkeyRegistered = false;
function registerHotkey() {
  if (engineSettings === null) {
    return;
  }
  if (hotkeyRegistered) {
    imports.ui.main.keybindingManager.removeHotKey(HOTKEY_ID);
  }
  imports.ui.main.keybindingManager.addHotKey(
    HOTKEY_ID,
    engineSettings.placeHotkey,
    () => {
      chooser?.toggle();
    }
  );
  hotkeyRegistered = true;
}
function init() {
  global.log(`${UUID}: init`);
}
function enable() {
  bindTranslations(UUID);
  engineSettings = new EngineSettings(UUID, () => {
    registerHotkey();
  });
  chooser = new Chooser(
    [
      cascadePage(engineSettings),
      columnsPage(engineSettings),
      gridPage(engineSettings),
      recordedPage(engineSettings)
    ],
    engineSettings,
    (targets, liveWindows) => {
      apply(targets, liveWindows);
    },
    () => {
      undo();
    }
  );
  registerHotkey();
  if (false) {
    registerDevHandle(chooser, engineSettings);
  }
  global.log(
    `${UUID}: enabled, ${engineSettings.placeHotkey} opens the chooser`
  );
}
function disable() {
  if (hotkeyRegistered) {
    imports.ui.main.keybindingManager.removeHotKey(HOTKEY_ID);
    hotkeyRegistered = false;
  }
  if (chooser !== null) {
    chooser.dispose();
    chooser = null;
  }
  if (engineSettings !== null) {
    engineSettings.finalize();
    engineSettings = null;
  }
  if (false) {
    removeDevHandle();
  }
  forgetUndo();
  unbindTranslations();
  global.log(`${UUID}: disabled`);
}
