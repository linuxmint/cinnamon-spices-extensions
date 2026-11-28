// Preserve the actual font size of text actors inside Cinnamon's panels.
// Measure each original font, including theme/default and explicit applet
// styles, then add a temporary font-size rule. Popup menus are outside this
// actor tree and retain the selected output zoom.

const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const OWN_FONT_RULE = /\/\* display-scale panel font \*\/font-size:\s*[\d.]+(?:px|pt);/g;

class PanelTextCompensation {
    constructor() {
        this._factor = 1;
        this._outputFactor = 1;
        this._active = false;
        this._suspended = false;
        this._frozenOutputFactor = 1;
        this._mode = "output";
        this._fontEnabled = false;
        this._protectMetrics = false;
        this._roots = [];
        this._texts = new Map();
        this._parents = new Map();
        this._references = new WeakMap();
        this._context = null;
        this._contextId = 0;
        this._idleId = 0;
        this._writing = false;
        this._forcePending = false;
    }

    update(panels, factor, enabled, protectMetrics = enabled, mode = "output", outputFactor = 1) {
        if ((!enabled && !protectMetrics) || factor < 1 || (mode === "output" && factor === 1)) {
            this.destroy();
            return;
        }
        const changed = this._suspended || mode !== this._mode || factor !== this._factor || outputFactor !== this._outputFactor || enabled !== this._fontEnabled || protectMetrics !== this._protectMetrics;
        if (this._suspended) {
            for (const record of [...this._parents.values(), ...this._texts.values()])
                delete record.frozenPixels;
        }
        this._suspended = false;
        this._active = true;
        this._mode = mode;
        this._factor = factor;
        this._outputFactor = outputFactor;
        this._fontEnabled = enabled;
        this._protectMetrics = protectMetrics;
        this._roots = panels.map(panel => panel.actor).filter(Boolean);
        if (!this._context && this._roots.length && St.ThemeContext) {
            this._context = St.ThemeContext.get_for_stage(global.stage);
            this._contextId = this._context.connect("changed", () => this._schedule());
        }
        this._scan(changed);
    }

    suspend() {
        if (this._suspended)
            return;
        this._suspended = true;
        this._active = false;
        this._forcePending = false;
        if (this._idleId) {
            Mainloop.source_remove(this._idleId);
            this._idleId = 0;
        }
        if (!this._fontEnabled)
            return;
        this._frozenOutputFactor = this._mode === "hybrid" ? this._outputFactor : 1;
        const backend = Clutter && Clutter.get_default_backend ? Clutter.get_default_backend() : null;
        const resolution = backend ? backend.get_resolution() : 96 * global.ui_scale;
        // Snapshot the currently visible sizes, including inherited fonts,
        // before writing any frozen ancestor. These are temporary pixels,
        // never new baseline references from the native transition.
        const records = [...this._parents.values(), ...this._texts.values()];
        for (const record of records) {
            const font = record.actor.get_theme_node().get_font();
            const size = font.get_size() / (Pango ? Pango.SCALE : 1024);
            record.frozenPixels = (font.get_size_is_absolute() ? size : size * resolution / 72) /
                Math.max(1, global.ui_scale) * this._frozenOutputFactor;
        }
        this.retargetSuspended(this._frozenOutputFactor);
    }

    retargetSuspended(outputFactor) {
        if (!this._suspended || !Number.isFinite(outputFactor) || outputFactor <= 0)
            return;
        this._frozenOutputFactor = outputFactor;
        const writing = this._writing;
        this._writing = true;
        try {
            for (const record of [...this._parents.values(), ...this._texts.values()])
                this._writeFrozenRule(record);
        } finally {
            this._writing = writing;
        }
    }

    _writeFrozenRule(record) {
        if (!Number.isFinite(record.frozenPixels))
            return;
        this._readExternalStyle(record);
        this._writeRule(record, this._rule(record.frozenPixels / this._frozenOutputFactor, "px"));
    }

    _isText(actor) {
        return actor instanceof St.Label || (St.Entry && actor instanceof St.Entry);
    }

    _schedule(force = true) {
        if (this._writing || !this._active)
            return;
        this._forcePending = this._forcePending || force;
        if (this._idleId)
            return;
        this._idleId = Mainloop.idle_add(() => {
            this._idleId = 0;
            const refresh = this._forcePending;
            this._forcePending = false;
            this._scan(refresh);
            return false;
        });
    }

    _track(actor, text) {
        const originalStyle = actor.get_style();
        const record = { actor, ids: [], originalStyle, appliedStyle: originalStyle, rule: "",
            reference: this._references.get(actor) };
        const records = text ? this._texts : this._parents;
        record.ids.push(actor.connect("destroy", () => records.delete(actor)));
        record.ids.push(actor.connect("actor-added", (container, child) => this._added(child)));
        record.ids.push(actor.connect("actor-removed", () => this._schedule(false)));
        record.ids.push(actor.connect("notify::style", () => {
            if (this._writing || actor.get_style() === record.appliedStyle)
                return;
            if (this._suspended) {
                // Keep native zone/color writes, but defer all font measuring.
                const writing = this._writing;
                this._writing = true;
                try {
                    this._writeFrozenRule(record);
                } finally {
                    this._writing = writing;
                }
                return;
            }
            if (!this._active)
                return;
            if (text || this._mode !== "output") {
                if (this._applyOne(record)) {
                    for (const child of actor.get_children())
                        this._added(child, true);
                }
            } else {
                this._readExternalStyle(record);
                record.appliedStyle = record.originalStyle;
                this._schedule();
            }
        }));
        // Do not subscribe to style-changed: it also reports our own font
        // overrides and inherited invalidations, sometimes after _writing
        // has ended. Restoring/reapplying all fonts in response keeps that
        // signal alive indefinitely. These property notifications instead
        // identify actual external CSS input changes; theme/DPI changes
        // are handled once through ThemeContext.
        for (const property of ["style-class", "pseudo-class", "name", "theme", "important"])
            record.ids.push(actor.connect("notify::" + property, () => this._schedule()));
        records.set(actor, record);
        if (text)
            this._protectMetricWidth(record);
        return record;
    }

    _protectMetricWidth(record) {
        if (!this._protectMetrics) {
            if (record.metricText) {
                record.metricText.ellipsize = record.originalEllipsize;
                record.metricText = null;
            }
            return;
        }
        const parent = record.actor.get_parent && record.actor.get_parent();
        const text = record.actor.clutter_text;
        // Combined Monitor's short measurement values must not collapse to
        // an ellipsis when the panel distributes scarce space. Let Clutter
        // request their full natural width; leave window titles and all
        // other panel labels free to shrink as before.
        if (!record.metricText && parent && parent._cm_valueLabel === record.actor && text) {
            record.metricText = text;
            record.originalEllipsize = text.ellipsize;
            text.ellipsize = Pango.EllipsizeMode.NONE;
        }
    }

    _scan(force) {
        const seen = new Set();
        const stack = [...this._roots];
        const changed = [];
        while (stack.length) {
            const actor = stack.pop();
            if (!actor || (actor.is_finalized && actor.is_finalized()))
                continue;
            seen.add(actor);
            if (actor instanceof St.Widget && (!actor.get_stage || actor.get_stage())) {
                if (this._isText(actor)) {
                    const record = this._texts.get(actor);
                    if (!record) {
                        changed.push(this._track(actor, true));
                    } else if (actor.get_style() !== record.appliedStyle) {
                        changed.push(record);
                    }
                    if (record)
                        this._protectMetricWidth(record);
                } else {
                    const record = this._parents.get(actor);
                    if (!record) {
                        const added = this._track(actor, false);
                        if (this._mode !== "output")
                            changed.push(added);
                    } else if (this._mode !== "output" && actor.get_style() !== record.appliedStyle) {
                        changed.push(record);
                    }
                }
            }
            if (actor.get_children)
                stack.push(...actor.get_children());
        }
        for (const records of [this._texts, this._parents]) {
            for (const [actor, record] of records) {
                if (!seen.has(actor)) {
                    this._forget(record, records === this._texts);
                    records.delete(actor);
                }
            }
        }
        if (force)
            this._applyAll();
        else
            changed.forEach(record => this._applyOne(record));
    }

    _added(child, refreshExisting = false) {
        if (this._writing || !this._active)
            return;
        // Handle additions before the next paint. Reordering already tracked
        // metric actors does not reset their font, and does not prune siblings
        // that are temporarily detached during the same update.
        const stack = [child];
        while (stack.length) {
            const actor = stack.pop();
            if (actor instanceof St.Widget && (!actor.get_stage || actor.get_stage())) {
                if (this._isText(actor)) {
                    const existing = this._texts.get(actor);
                    if (!existing)
                        this._applyOne(this._track(actor, true));
                    else if (refreshExisting)
                        this._applyOne(existing);
                } else {
                    const existing = this._parents.get(actor);
                    if (!existing) {
                        const record = this._track(actor, false);
                        if (this._mode !== "output")
                            this._applyOne(record);
                    } else if (refreshExisting && this._mode !== "output") {
                        this._applyOne(existing);
                    }
                }
            }
            if (actor.get_children)
                stack.push(...actor.get_children());
        }
    }

    _fontRule(record) {
        if (!this._fontEnabled)
            return null;
        const font = record.actor.get_theme_node().get_font();
        const size = font.get_size() / (Pango ? Pango.SCALE : 1024);
        const absolute = font.get_size_is_absolute();
        const scale = absolute ? global.ui_scale : 1;
        if (this._mode !== "output") {
            const output = this._mode === "hybrid" ? this._outputFactor : 1;
            const textFactor = this._factor / output;
            const source = this._fontSource(record);
            const theme = this._context && this._context.get_theme ? this._context.get_theme() : null;
            if (Math.abs(textFactor - 1) < 0.000001) {
                const backend = Clutter && Clutter.get_default_backend ? Clutter.get_default_backend() : null;
                const resolution = backend ? backend.get_resolution() : 96 * global.ui_scale;
                record.reference = { source, theme,
                    pixels: (absolute ? size : size * resolution / 72) / global.ui_scale };
                // A method switch temporarily removes every observer/style.
                // Retain 100% references without keeping removed actors alive.
                this._references.set(record.actor, record.reference);
                return output === 1 ? null : this._rule(record.reference.pixels / output, "px");
            }
            // Fonts measured at 100% include stylesheet-only pixel sizes too.
            // Reuse that reference while the actual font specification stays
            // the same; ordinary color updates do not invalidate it.
            const reference = record.reference;
            if (reference && reference.source === source && reference.theme === theme)
                return this._rule(reference.pixels / output, "px");
            // For labels first encountered while enlarged, explicit pixel
            // fonts (including relative descendants) have not grown with DPI.
            if (absolute && this._pixelAnchored(record))
                return this._rule(size / scale / output, "px");
        }
        const compensated = size / scale / this._factor;
        return this._rule(compensated, absolute ? "px" : "pt");
    }

    _rule(compensated, unit) {
        if (!Number.isFinite(compensated) || compensated <= 0)
            return null;
        return "/* display-scale panel font */font-size: " + compensated.toFixed(4) + unit + ";";
    }

    _originalStyle(actor) {
        const record = this._texts.get(actor) || this._parents.get(actor);
        return record ? record.originalStyle || "" : actor.get_style ? actor.get_style() || "" : "";
    }

    _fontSource(record) {
        const styles = [];
        for (let actor = record.actor; actor; actor = actor.get_parent && actor.get_parent()) {
            styles.push((this._originalStyle(actor).match(/(?:^|;)\s*font(?:-[\w-]+)?\s*:[^;]*/g) || []).join(";"));
            // CSS selectors can change a font without changing inline CSS.
            // Include their inputs in the cached 100% font reference.
            for (const getter of ["get_style_class_name", "get_style_pseudo_class", "get_name", "get_important"])
                styles.push(typeof actor[getter] === "function" ? String(actor[getter]()) : "");
        }
        const font = this._context && this._context.get_font ? this._context.get_font() : null;
        if (font && font.to_string)
            styles.push(font.to_string());
        return styles.join("|");
    }

    _pixelAnchored(record) {
        for (let actor = record.actor; actor; actor = actor.get_parent && actor.get_parent()) {
            const declarations = [...this._originalStyle(actor).matchAll(/(?:^|;)\s*font(?:-size)?\s*:\s*([^;]+)/g)];
            if (!declarations.length)
                continue;
            const match = declarations[declarations.length - 1][1].match(/[\d.]+\s*(px|pt|em|%)/);
            if (match && (match[1] === "px" || match[1] === "pt"))
                return match[1] === "px";
        }
        return false;
    }

    _writeRule(record, rule) {
        record.rule = rule || "";
        record.fontState = this._fontState(record);
        const base = record.originalStyle || "";
        const separator = base && !base.trim().endsWith(";") ? ";" : "";
        record.appliedStyle = rule ? base + separator + rule : record.originalStyle;
        record.actor.set_style(record.appliedStyle);
    }

    _fontState(record) {
        return {
            source: this._fontSource(record),
            theme: this._context && this._context.get_theme ? this._context.get_theme() : null,
            mode: this._mode,
            factor: this._factor,
            outputFactor: this._outputFactor,
            uiScale: global.ui_scale,
            enabled: this._fontEnabled
        };
    }

    _applyOne(record) {
        this._readExternalStyle(record);
        const state = this._fontState(record);
        const cached = record.fontState;
        const writing = this._writing;
        this._writing = true;
        const ancestors = [];
        try {
            // Cinnamon rewrites zone font CSS even when only the icon size
            // changed. Applets also replace styles for color/status updates.
            // Reuse the measured rule while its font inputs are unchanged.
            // Removing ancestor overrides to remeasure would invalidate the
            // entire panel tree for every descendant, including icon actors.
            if (cached && Object.keys(state).every(key => cached[key] === state[key])) {
                this._writeRule(record, record.rule);
                return false;
            }
            for (let parent = record.actor.get_parent && record.actor.get_parent(); parent;
                 parent = parent.get_parent && parent.get_parent()) {
                const ancestor = this._texts.get(parent) || this._parents.get(parent);
                if (ancestor && ancestor.rule) {
                    ancestors.push(ancestor);
                    parent.set_style(ancestor.originalStyle);
                }
            }
            record.actor.set_style(record.originalStyle);
            const rule = this._fontRule(record);
            for (const ancestor of ancestors)
                ancestor.actor.set_style(ancestor.appliedStyle);
            this._writeRule(record, rule);
            return true;
        } finally {
            for (const ancestor of ancestors)
                ancestor.actor.set_style(ancestor.appliedStyle);
            this._writing = writing;
        }
    }

    _readExternalStyle(record) {
        const current = record.actor.get_style();
        if (current !== record.appliedStyle) {
            // Also handle an applet that appends to its current inline style.
            // Remove our marked rule before treating that as the new original.
            record.originalStyle = current ? current.replace(OWN_FONT_RULE, "") : current;
        }
    }

    _applyAll() {
        const writing = this._writing;
        this._writing = true;
        try {
            // Restore every original before measuring any font. This prevents
            // nested/relative fonts from being compensated more than once.
            const records = [...this._texts.values(), ...[...this._parents.values()].filter(record => this._mode !== "output" || record.rule)];
            for (const record of records) {
                this._readExternalStyle(record);
                record.actor.set_style(record.originalStyle);
            }
            const updates = [];
            for (const record of records) {
                updates.push({ record, rule: this._mode !== "output" || this._texts.has(record.actor) ? this._fontRule(record) : null });
            }
            for (const { record, rule } of updates) {
                this._writeRule(record, rule);
            }
        } finally {
            this._writing = writing;
        }
    }

    _forget(record, restoreStyle) {
        for (const id of record.ids)
            record.actor.disconnect(id);
        if (restoreStyle || record.rule) {
            if (record.metricText)
                record.metricText.ellipsize = record.originalEllipsize;
            this._readExternalStyle(record);
            record.actor.set_style(record.originalStyle);
        }
    }

    destroy() {
        this._factor = 1;
        this._active = false;
        this._suspended = false;
        this._frozenOutputFactor = 1;
        this._fontEnabled = false;
        this._protectMetrics = false;
        this._forcePending = false;
        if (this._idleId) {
            Mainloop.source_remove(this._idleId);
            this._idleId = 0;
        }
        if (this._contextId) {
            this._context.disconnect(this._contextId);
            this._contextId = 0;
            this._context = null;
        }
        for (const record of this._texts.values())
            this._forget(record, true);
        for (const record of this._parents.values())
            this._forget(record, false);
        this._texts.clear();
        this._parents.clear();
        this._roots = [];
    }
}

module.exports = PanelTextCompensation;
