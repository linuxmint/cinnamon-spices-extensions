const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Cinnamon = imports.gi.Cinnamon;
const Gio = imports.gi.Gio;
const Pango = imports.gi.Pango;
const Gettext = imports.gettext;
const ByteArray = imports.byteArray;

const ModalDialog = imports.ui.modalDialog;
const CinnamonEntry = imports.ui.cinnamonEntry;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const GnomeSession = imports.misc.gnomeSession;
const Util = imports.misc.util;

const {
    UUID,
    HOTKEY_ID,
    BASE_DIALOG_WIDTH,
    BASE_ICON_SIZE,
    SEARCH_DEBOUNCE_MS,
    HOTKEY_DEBOUNCE_MS,
    INITIAL_ROW_FILL_COUNT,
    ROW_FILL_CHUNK_SIZE,
    ROW_ANIMATION_STEP_MS,
    ROW_ANIMATION_MAX_DELAY_MS,
    ROW_ANIMATION_DURATION_MS,
} = require('./constants.js');

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

function normalize(text) {
    if (!text)
        return "";
    return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// global.ui_scale scales explicit JS pixel sizes; CSS-driven sizes already scale automatically.
// scalePercent is the user-configurable "launcher-scale" setting (Small/Medium/Large).
function computeMetrics(scalePercent) {
    let scale = (global.ui_scale || 1) * ((scalePercent || 100) / 100);
    let monitor = Main.layoutManager.primaryMonitor;
    let monitorWidth = monitor ? monitor.width : 1280;

    let width = Math.round(BASE_DIALOG_WIDTH * scale);
    // Never take up more of a small/projector-sized monitor than this.
    width = Math.min(width, Math.round(monitorWidth * 0.92));

    let iconSize = Math.round(BASE_ICON_SIZE * scale);
    let listMaxHeight = Math.round(width / 1.618);

    return { width, iconSize, listMaxHeight };
}

// fzf-style subsequence scoring (rewards runs and word-starts); null if not a subsequence.
function fuzzyMatch(query, text) {
    if (query.length === 0)
        return { score: 0, matches: [] };

    let qi = 0;
    let score = 0;
    let consecutive = 0;
    let prevMatched = false;
    let matches = [];

    for (let ti = 0; ti < text.length && qi < query.length; ti++) {
        if (text[ti] !== query[qi])
            continue;

        let atWordStart = ti === 0 || /[\s\-_./]/.test(text[ti - 1]);

        score += 10;
        if (prevMatched) {
            consecutive++;
            score += 5 * consecutive;
        } else {
            consecutive = 0;
        }
        if (atWordStart)
            score += 15;

        matches.push(ti);
        prevMatched = true;
        qi++;
    }

    if (qi < query.length)
        return null;

    score -= Math.floor(text.length / 10);
    score -= matches[0];

    return { score, matches };
}

function buildHighlightMarkup(title, matches) {
    if (!matches || matches.length === 0)
        return GLib.markup_escape_text(title, -1);

    let matchSet = new Set(matches);
    let out = "";
    for (let i = 0; i < title.length; i++) {
        let ch = GLib.markup_escape_text(title[i], -1);
        out += matchSet.has(i) ? `<b>${ch}</b>` : ch;
    }
    return out;
}

// entry needs .nameNorm/.searchText - the latter a broader haystack for recall beyond name matches.
function matchEntry(query, entry, nameBonus) {
    let m = fuzzyMatch(query, entry.nameNorm);
    if (m)
        return { score: m.score + nameBonus, matches: m.matches };
    if (entry.searchText.includes(query))
        return { score: -1, matches: [] };
    return null;
}

// Same {score, matches} contract as matchEntry, but plain substring matching
// ranked by position - like the Cinnamon Menu applet's own search.
function simpleMatchEntry(query, entry, nameBonus) {
    let idx = entry.nameNorm.indexOf(query);
    if (idx !== -1) {
        let matches = [];
        for (let i = 0; i < query.length; i++)
            matches.push(idx + i);
        return { score: nameBonus - idx, matches };
    }
    if (entry.searchText.includes(query))
        return { score: -1, matches: [] };
    return null;
}

const MATH_CHARS_RE = /^[\d\s+\-*/^%.()]+$/;

function looksLikeMathExpression(raw) {
    let t = raw.trim();
    if (!t || !MATH_CHARS_RE.test(t))
        return false;
    return /\d/.test(t) && /[+\-*/^%]/.test(t);
}

function tokenizeMathExpression(text) {
    let tokens = [];
    let re = /(\d+\.\d+|\d+|[+\-*/^%()])/y;
    let i = 0;
    while (i < text.length) {
        re.lastIndex = i;
        let m = re.exec(text);
        if (!m || m.index !== i)
            return null;
        tokens.push(m[1]);
        i = re.lastIndex;
    }
    return tokens;
}

// Hand-written recursive-descent evaluator; avoids eval()/Function() entirely.
function evaluateMathExpression(rawText) {
    let tokens = tokenizeMathExpression(rawText.replace(/\s+/g, ""));
    if (!tokens || tokens.length === 0)
        return null;

    let pos = { i: 0 };

    function parseExpr() {
        let value = parseTerm();
        while (tokens[pos.i] === "+" || tokens[pos.i] === "-") {
            let op = tokens[pos.i++];
            let rhs = parseTerm();
            value = op === "+" ? value + rhs : value - rhs;
        }
        return value;
    }

    function parseTerm() {
        let value = parseUnary();
        while (tokens[pos.i] === "*" || tokens[pos.i] === "/" || tokens[pos.i] === "%") {
            let op = tokens[pos.i++];
            let rhs = parseUnary();
            if (op === "*") value *= rhs;
            else if (op === "/") value /= rhs;
            else value %= rhs;
        }
        return value;
    }

    function parseUnary() {
        if (tokens[pos.i] === "-") {
            pos.i++;
            return -parseUnary();
        }
        if (tokens[pos.i] === "+") {
            pos.i++;
            return parseUnary();
        }
        return parsePower();
    }

    function parsePower() {
        let base = parsePrimary();
        if (tokens[pos.i] === "^") {
            pos.i++;
            let exp = parseUnary();
            return Math.pow(base, exp);
        }
        return base;
    }

    function parsePrimary() {
        let tok = tokens[pos.i];
        if (tok === undefined)
            throw new Error("unexpected end of expression");
        if (tok === "(") {
            pos.i++;
            let value = parseExpr();
            if (tokens[pos.i] !== ")")
                throw new Error("expected )");
            pos.i++;
            return value;
        }
        if (/^\d/.test(tok)) {
            pos.i++;
            return parseFloat(tok);
        }
        throw new Error(`unexpected token ${tok}`);
    }

    let value;
    try {
        value = parseExpr();
    } catch (e) {
        return null;
    }

    if (pos.i !== tokens.length || !isFinite(value))
        return null;

    return value;
}

function formatMathResult(value) {
    if (Object.is(value, -0))
        value = 0;
    return String(Math.round(value * 1e9) / 1e9);
}

class UsageTracker {
    constructor() {
        this._path = GLib.build_filenamev([GLib.get_user_data_dir(), UUID, "usage.json"]);
        this._data = {};
        this._load();
    }

    _load() {
        let file = Gio.File.new_for_path(this._path);
        file.load_contents_async(null, (source, result) => {
            try {
                let [ok, contents] = source.load_contents_finish(result);
                if (ok)
                    this._data = JSON.parse(ByteArray.toString(contents));
            } catch (e) {
                // Missing on first run, or corrupt - keep the empty default.
            }
        });
    }

    _save() {
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(this._path), 0o755);
            GLib.file_set_contents(this._path, JSON.stringify(this._data));
        } catch (e) {
            log(`cinnamon-launcher: failed to persist usage data: ${e}`);
        }
    }

    recordLaunch(appId) {
        let entry = this._data[appId] || { count: 0, last: 0 };
        entry.count += 1;
        entry.last = Date.now();
        this._data[appId] = entry;
        this._save();
    }

    score(appId) {
        let entry = this._data[appId];
        if (!entry)
            return 0;
        let ageDays = (Date.now() - entry.last) / 86400000;
        let recencyBoost = Math.max(0, 30 - ageDays);
        return entry.count * 3 + recencyBoost;
    }
}

// Matches the Cinnamon menu applet's own system buttons: instant, no confirmation dialog.
function buildSystemActions() {
    let session = null;
    function getSession() {
        if (!session)
            session = new GnomeSession.SessionManager();
        return session;
    }

    return [
        {
            id: "lock-screen",
            name: _("Lock Screen"),
            keywords: normalize(_("lock screen screensaver")),
            iconName: "xsi-lock-screen-symbolic",
            run: () => Main.screensaverController.lockScreen(true),
        },
        {
            id: "log-out",
            name: _("Log Out"),
            keywords: normalize(_("logout sign out leave session")),
            iconName: "xsi-log-out-symbolic",
            run: () => getSession().LogoutRemote(0),
        },
        {
            id: "shut-down",
            name: _("Shut Down"),
            keywords: normalize(_("shutdown power off turn off")),
            iconName: "xsi-shutdown-symbolic",
            run: () => getSession().ShutdownRemote(),
        },
        {
            id: "settings",
            name: _("Open Settings"),
            keywords: normalize(_("preferences control panel")),
            iconName: "preferences-system-symbolic",
            run: () => Util.spawn(["cinnamon-settings"]),
        },
    ];
}

function wireRowInteractions(actor, row) {
    actor.connect("notify::hover", () => {
        if (actor.hover)
            row.hoverEnter();
    });
    actor.connect("button-release-event", () => {
        row.activate();
        return Clutter.EVENT_STOP;
    });
}

// Persistent per app/action; re-filtering only updates title markup, not the actor tree.
// Actors and the icon texture are built on first display, not up front.
class ResultRow {
    constructor(opts) {
        this.kind = opts.kind;
        this.name = opts.name;
        this.nameNorm = normalize(opts.name);
        this.searchText = opts.searchText || this.nameNorm;
        this._opts = opts;
        this._onActivate = opts.onActivate;
        this._onHoverEnter = opts.onHoverEnter || (() => {});

        this.actor = null;
        this.titleLabel = null;
        this.subtitleLabel = null;
        this._matches = null;
        this._highlighted = false;
        this._selected = false;
        this._subtitleVisible = opts.subtitleVisible !== false;
    }

    getActor() {
        if (!this.actor)
            this._build();
        return this.actor;
    }

    _build() {
        let opts = this._opts;

        this.actor = new St.BoxLayout({
            style_class: "cinnamon-launcher-row" + (opts.hero ? " cinnamon-launcher-row-hero" : ""),
            reactive: true,
            track_hover: true,
            width: opts.width,
        });

        let icon = opts.createIcon ? opts.createIcon() : null;
        if (!icon) {
            icon = new St.Icon({
                icon_name: opts.iconName || "application-x-executable",
                icon_size: opts.iconSize,
            });
        }
        this.actor.add_child(new St.Bin({ child: icon, y_align: St.Align.MIDDLE }));

        let textBox = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER });

        this.titleLabel = new St.Label({ text: this.name, style_class: "cinnamon-launcher-row-label" });
        this.titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.titleLabel.clutter_text.line_wrap = false;
        textBox.add_child(this.titleLabel);

        if (opts.subtitle) {
            this.subtitleLabel = new St.Label({ text: opts.subtitle, style_class: "cinnamon-launcher-row-subtitle" });
            this.subtitleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this.subtitleLabel.visible = this._subtitleVisible;
            textBox.add_child(this.subtitleLabel);
        }

        this.actor.add_child(textBox);

        wireRowInteractions(this.actor, this);

        if (this._matches)
            this._applyHighlight();
        if (this._selected)
            this.actor.add_style_pseudo_class("selected");
    }

    _applyHighlight() {
        if (this._matches) {
            this.titleLabel.clutter_text.set_use_markup(true);
            this.titleLabel.clutter_text.set_markup(buildHighlightMarkup(this.name, this._matches));
            this._highlighted = true;
        } else if (this._highlighted) {
            this.titleLabel.clutter_text.set_use_markup(false);
            this.titleLabel.set_text(this.name);
            this._highlighted = false;
        }
    }

    setTitleHighlight(matches) {
        this._matches = (matches && matches.length > 0) ? matches : null;
        if (this.actor)
            this._applyHighlight();
    }

    // Selection sweeps every row on each arrow key; a pseudo-class change
    // invalidates that row's style, so only act on an actual change.
    setSelected(selected) {
        if (this._selected === selected)
            return;
        this._selected = selected;
        if (!this.actor)
            return;
        if (selected)
            this.actor.add_style_pseudo_class("selected");
        else
            this.actor.remove_style_pseudo_class("selected");
    }

    setSubtitleVisible(visible) {
        this._subtitleVisible = visible;
        if (this.subtitleLabel)
            this.subtitleLabel.visible = visible;
    }

    activate() {
        this._onActivate();
    }

    hoverEnter() {
        this._onHoverEnter();
    }

    destroy() {
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}

var LauncherDialog = GObject.registerClass({
    // Random suffix: GObject.registerClass throws if reloaded under the same GType name.
    GTypeName: `LauncherDialog_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
},
class LauncherDialog extends ModalDialog.ModalDialog {
    _init(uuid) {
        super._init({
            styleClass: "cinnamon-launcher-dialog",
            destroyOnClose: false,
        });

        this.buttonLayout.hide();

        this._uuid = uuid;
        this._setupSettings(uuid);

        this._metrics = computeMetrics(this.launcher_scale);
        this._usage = new UsageTracker();

        this._searchEntry = new St.Entry({
            style_class: "cinnamon-launcher-search",
            hint_text: _("Search apps, actions, or type a sum…"),
            can_focus: true,
            width: this._metrics.width,
        });
        CinnamonEntry.addContextMenu(this._searchEntry);

        this._searchClearIcon = new St.Icon({
            style_class: "cinnamon-launcher-search-icon",
            icon_name: "edit-clear-symbolic",
            icon_size: 16,
        });
        this._searchSettingsIcon = new St.Icon({
            style_class: "cinnamon-launcher-search-icon",
            icon_name: "preferences-system-symbolic",
            icon_size: 16,
        });
        this._searchEntry.set_secondary_icon(this._searchSettingsIcon);
        this._searchIconClickedId = this._searchEntry.connect("secondary-icon-clicked", () => {
            if (this._searchEntry.get_text().length > 0) {
                this._searchEntry.set_text("");
            } else {
                Util.spawn(["xlet-settings", "extension", this._uuid]);
                this.close();
            }
        });

        this.contentLayout.add_child(this._searchEntry);

        this._scrollView = new St.ScrollView({
            style_class: "cinnamon-launcher-scrollview",
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            clip_to_allocation: true,
            width: this._metrics.width,
            height: this._metrics.listMaxHeight,
        });
        this._list = new St.BoxLayout({
            style_class: "cinnamon-launcher-list",
            vertical: true,
        });
        this._scrollView.add_actor(this._list);
        this.contentLayout.add_child(this._scrollView);

        this.setInitialKeyFocus(this._searchEntry.clutter_text);

        this._searchEntry.clutter_text.connect("text-changed", this._onSearchChanged.bind(this));
        this._searchEntry.clutter_text.connect("key-press-event", this._onKeyPress.bind(this));

        this._appEntries = [];
        this._actionEntries = buildSystemActions().map(action => this._makeActionEntry(action));
        this._calculatorRow = null;
        this._visibleRows = [];
        this._selectedIndex = -1;
        this._filterTimeoutId = 0;
        this._lastToggleTime = 0;
        this._pendingItems = [];
        this._pendingIndex = 0;
        this._fillIdleId = 0;

        // Deferred to the first open(): enabling shouldn't pay for a list that
        // may never be shown.
        this._appsDirty = true;

        this._appSystem = Cinnamon.AppSystem.get_default();
        this._installedChangedId = this._appSystem.connect("installed-changed", () => {
            this._appsDirty = true;
        });

        this.dialogLayout.set_pivot_point(0.5, 0.5);
        this._updateOpenAndCloseTime();
    }

    _setupSettings(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);

        let bindings = [
            ["open-launcher", "open_launcher", () => this._setKeybinding()],
            ["fuzzy-search", "fuzzy_search", null],
            ["enable-calculator", "enable_calculator", null],
            ["enable-system-actions", "enable_system_actions", null],
            ["show-frequent-apps", "show_frequent_apps", null],
            ["max-frequent-apps", "max_frequent_apps", null],
            ["show-descriptions", "show_descriptions", () => this._updateSubtitleVisibility()],
            ["enable-animations", "enable_animations", () => this._updateOpenAndCloseTime()],
            ["launcher-scale", "launcher_scale", () => this._applyMetrics()],
        ];
        bindings.forEach(([key, prop, cb]) => this.settings.bind(key, prop, cb));
    }

    enable() {
        this._setKeybinding();
    }

    _setKeybinding() {
        Main.keybindingManager.removeHotKey(HOTKEY_ID);
        Main.keybindingManager.addHotKey(HOTKEY_ID, this.open_launcher, () => this.toggle());
    }

    _updateSubtitleVisibility() {
        this._appEntries.forEach(entry => entry.setSubtitleVisible(this.show_descriptions));
        this._actionEntries.forEach(entry => entry.setSubtitleVisible(this.show_descriptions));
    }

    // Ties the base ModalDialog's own fade duration (baseDialog.js) to our animations
    // toggle and to Cinnamon's system-wide "desktop-effects-workspace" setting.
    _updateOpenAndCloseTime() {
        let systemEffectsEnabled = global.settings.get_boolean("desktop-effects-workspace");
        this.openAndCloseTime = (this.enable_animations && systemEffectsEnabled) ? 100 : 0;
    }

    // Action rows bake in an icon size, so rebuild now; app rows refresh lazily via _appsDirty.
    _applyMetrics() {
        this._metrics = computeMetrics(this.launcher_scale);
        this._searchEntry.width = this._metrics.width;
        this._scrollView.width = this._metrics.width;
        this._scrollView.height = this._metrics.listMaxHeight;

        this._actionEntries.forEach(entry => entry.destroy());
        this._actionEntries = buildSystemActions().map(action => this._makeActionEntry(action));
        this._appsDirty = true;
    }

    _easeActor(actor, easeOptions) {
        if (this.enable_animations) {
            actor.ease(easeOptions);
            return;
        }
        if (easeOptions.scale_x !== undefined)
            actor.scale_x = easeOptions.scale_x;
        if (easeOptions.scale_y !== undefined)
            actor.scale_y = easeOptions.scale_y;
        if (easeOptions.opacity !== undefined)
            actor.opacity = easeOptions.opacity;
        if (easeOptions.translation_y !== undefined)
            actor.translation_y = easeOptions.translation_y;
        if (easeOptions.onComplete)
            easeOptions.onComplete();
    }

    toggle() {
        let now = GLib.get_monotonic_time() / 1000;
        if (now - this._lastToggleTime < HOTKEY_DEBOUNCE_MS)
            return;
        this._lastToggleTime = now;

        if (this.state === ModalDialog.State.OPENED || this.state === ModalDialog.State.OPENING) {
            this.close();
            return;
        }

        if (this.enable_animations) {
            this.dialogLayout.scale_x = 0.96;
            this.dialogLayout.scale_y = 0.96;
        }

        if (!this.open(global.get_current_time()))
            return;

        this._easeActor(this.dialogLayout, {
            scale_x: 1,
            scale_y: 1,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        if (this._appsDirty) {
            this._rebuildAppEntries();
            this._appsDirty = false;
        }

        this._searchEntry.set_text("");
        this._cancelPendingFilter();
        this._applyFilter("", true);

        let adjustment = this._scrollView.vscroll ? this._scrollView.vscroll.adjustment : null;
        if (adjustment)
            adjustment.value = 0;
    }

    close(timestamp) {
        this._cancelPendingFilter();
        this._stopFill();
        this._easeActor(this.dialogLayout, {
            scale_x: 0.97,
            scale_y: 0.97,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
        super.close(timestamp);
    }

    _makeAppEntry(app) {
        let name = app.get_name() || "";
        let searchText = normalize([name, app.get_keywords(), app.get_description(), app.get_id()]
            .filter(Boolean).join(" "));
        let description = app.get_description();
        let subtitle = (description && description !== name) ? description : null;
        let iconSize = this._metrics.iconSize;

        let row = new ResultRow({
            kind: "app",
            name,
            searchText,
            subtitle,
            subtitleVisible: this.show_descriptions,
            width: this._metrics.width,
            iconSize,
            createIcon: () => app.create_icon_texture(iconSize),
            onActivate: () => {
                this._usage.recordLaunch(app.get_id());
                app.open_new_window(-1);
                this.close();
            },
            onHoverEnter: () => this._selectRow(row),
        });
        row.app = app;
        return row;
    }

    _makeActionEntry(action) {
        return new ResultRow({
            kind: "action",
            name: action.name,
            searchText: action.keywords,
            subtitle: _("System Action"),
            subtitleVisible: this.show_descriptions,
            width: this._metrics.width,
            iconSize: this._metrics.iconSize,
            iconName: action.iconName,
            onActivate: () => {
                action.run();
                this.close();
            },
            onHoverEnter: () => this._selectRow(row),
        });
    }

    _makeCalculatorRow(rawQuery) {
        if (!looksLikeMathExpression(rawQuery))
            return null;

        let value = evaluateMathExpression(rawQuery);
        if (value === null)
            return null;

        let resultText = formatMathResult(value);

        return new ResultRow({
            kind: "calculator",
            name: resultText,
            hero: true,
            subtitle: rawQuery.trim(),
            width: this._metrics.width,
            iconSize: this._metrics.iconSize,
            iconName: "accessories-calculator-symbolic",
            onActivate: () => {
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, resultText);
                this.close();
            },
            onHoverEnter: () => this._selectRow(row),
        });
    }

    _makeSectionHeader(title) {
        return new St.Label({ text: title, style_class: "cinnamon-launcher-section-header" });
    }

    _rebuildAppEntries() {
        this._appEntries.forEach(entry => entry.destroy());

        let apps = this._appSystem.get_all().filter(app => !app.get_nodisplay());
        apps.sort((a, b) => a.get_name().localeCompare(b.get_name()));

        this._appEntries = apps.map(app => this._makeAppEntry(app));
    }

    _onSearchChanged() {
        let hasText = this._searchEntry.get_text().length > 0;
        this._searchEntry.set_secondary_icon(hasText ? this._searchClearIcon : this._searchSettingsIcon);

        if (this._filterTimeoutId)
            GLib.source_remove(this._filterTimeoutId);

        this._filterTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SEARCH_DEBOUNCE_MS, () => {
            this._filterTimeoutId = 0;
            this._applyFilter(this._searchEntry.get_text());
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelPendingFilter() {
        if (this._filterTimeoutId) {
            GLib.source_remove(this._filterTimeoutId);
            this._filterTimeoutId = 0;
        }
    }

    // So Return/Up/Down act on the latest text, not a stale debounced render.
    _flushPendingFilter() {
        if (!this._filterTimeoutId)
            return;
        this._cancelPendingFilter();
        this._applyFilter(this._searchEntry.get_text());
    }

    _animateRowIn(actor, index) {
        actor.opacity = 0;
        actor.translation_y = 6;
        this._easeActor(actor, {
            opacity: 255,
            translation_y: 0,
            delay: Math.min(index * ROW_ANIMATION_STEP_MS, ROW_ANIMATION_MAX_DELAY_MS),
            duration: ROW_ANIMATION_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _applyFilter(rawQuery, animate = false) {
        this._stopFill();
        this._list.remove_all_children();

        if (this._calculatorRow) {
            this._calculatorRow.destroy();
            this._calculatorRow = null;
        }

        let query = normalize(rawQuery.trim());
        let ordered = [];

        if (query.length === 0) {
            this._appEntries.forEach(entry => entry.setTitleHighlight(null));
            this._actionEntries.forEach(entry => entry.setTitleHighlight(null));

            let frequent = this.show_frequent_apps
                ? this._appEntries
                    .map(entry => ({ entry, score: this._usage.score(entry.app.get_id()) }))
                    .filter(x => x.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, this.max_frequent_apps)
                    .map(x => x.entry)
                : [];
            let frequentSet = new Set(frequent);
            let rest = this._appEntries.filter(entry => !frequentSet.has(entry));

            if (frequent.length > 0 && rest.length > 0) {
                ordered.push({ header: _("Frequently Used") });
                frequent.forEach(entry => ordered.push({ row: entry }));
                ordered.push({ header: _("All Applications") });
                rest.forEach(entry => ordered.push({ row: entry }));
            } else {
                this._appEntries.forEach(entry => ordered.push({ row: entry }));
            }
        } else {
            let matchFn = this.fuzzy_search ? matchEntry : simpleMatchEntry;

            let appMatches = [];
            for (let entry of this._appEntries) {
                let m = matchFn(query, entry, 1000);
                if (m)
                    appMatches.push({ entry, m });
            }
            appMatches.sort((a, b) => b.m.score - a.m.score || a.entry.name.localeCompare(b.entry.name));
            appMatches.forEach(({ entry, m }) => entry.setTitleHighlight(m.matches));

            let unmatchedApps = new Set(this._appEntries);
            appMatches.forEach(({ entry }) => unmatchedApps.delete(entry));
            unmatchedApps.forEach(entry => entry.setTitleHighlight(null));

            let actionMatches = [];
            if (this.enable_system_actions) {
                for (let entry of this._actionEntries) {
                    let m = matchFn(query, entry, 500);
                    if (m)
                        actionMatches.push({ entry, m });
                }
                actionMatches.sort((a, b) => b.m.score - a.m.score);
            }
            actionMatches.forEach(({ entry, m }) => entry.setTitleHighlight(m.matches));

            let unmatchedActions = new Set(this._actionEntries);
            actionMatches.forEach(({ entry }) => unmatchedActions.delete(entry));
            unmatchedActions.forEach(entry => entry.setTitleHighlight(null));

            this._calculatorRow = this.enable_calculator ? this._makeCalculatorRow(rawQuery) : null;
            if (this._calculatorRow)
                ordered.push({ row: this._calculatorRow });

            let showHeaders = appMatches.length > 0 && actionMatches.length > 0;
            if (showHeaders)
                ordered.push({ header: _("Applications") });
            appMatches.forEach(({ entry }) => ordered.push({ row: entry }));
            if (showHeaders)
                ordered.push({ header: _("Actions") });
            actionMatches.forEach(({ entry }) => ordered.push({ row: entry }));
        }

        this._visibleRows = ordered.filter(item => item.row).map(item => item.row);
        this._pendingItems = ordered;
        this._pendingIndex = 0;

        // Only the first batch animates; later rows land past the stagger cap anyway.
        if (this._fillRows(INITIAL_ROW_FILL_COUNT, animate && this.enable_animations))
            this._scheduleFill();

        this._selectedIndex = this._visibleRows.length > 0 ? 0 : -1;
        this._updateSelection();
    }

    // St.BoxLayout has no virtualization: every parented row is laid out whether
    // on screen or not.
    _fillRows(limit, animate) {
        let added = 0;

        while (this._pendingIndex < this._pendingItems.length && added < limit) {
            let item = this._pendingItems[this._pendingIndex++];

            if (item.header) {
                this._list.add_child(this._makeSectionHeader(item.header));
                continue;
            }

            let actor = item.row.getActor();
            this._list.add_child(actor);

            if (animate) {
                this._animateRowIn(actor, added);
            } else {
                actor.remove_all_transitions();
                actor.opacity = 255;
                actor.translation_y = 0;
            }

            added++;
        }

        return this._pendingIndex < this._pendingItems.length;
    }

    _scheduleFill() {
        this._fillIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (this._fillRows(ROW_FILL_CHUNK_SIZE, false))
                return GLib.SOURCE_CONTINUE;
            this._fillIdleId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopFill() {
        if (this._fillIdleId) {
            GLib.source_remove(this._fillIdleId);
            this._fillIdleId = 0;
        }
    }

    _selectRow(row) {
        let index = this._visibleRows.indexOf(row);
        if (index === -1 || index === this._selectedIndex)
            return;
        this._selectedIndex = index;
        this._updateSelection();
    }

    _updateSelection() {
        let selected = this._visibleRows[this._selectedIndex];

        // Nav can outrun the idle fill; the row must be in the list to scroll to it.
        if (selected && !selected.actor) {
            this._stopFill();
            this._fillRows(Infinity, false);
        }

        this._visibleRows.forEach((row, i) => row.setSelected(i === this._selectedIndex));

        if (selected)
            this._ensureRowVisible(selected);
    }

    _ensureRowVisible(row) {
        let adjustment = this._scrollView.vscroll ? this._scrollView.vscroll.adjustment : null;
        if (!adjustment)
            return;

        let box = row.actor.get_allocation_box();
        if (!box || (box.y1 === 0 && box.y2 === 0))
            return;

        let value = adjustment.value;
        let pageSize = adjustment.page_size;

        if (box.y1 < value)
            adjustment.value = box.y1;
        else if (box.y2 > value + pageSize)
            adjustment.value = box.y2 - pageSize;
    }

    _onKeyPress(actor, event) {
        let symbol = event.get_key_symbol();

        if (symbol === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }

        // Our modal grab would otherwise swallow a bare Super tap meant for the main menu.
        if (symbol === Clutter.KEY_Super_L || symbol === Clutter.KEY_Super_R) {
            this.close();
            return Clutter.EVENT_STOP;
        }

        let isNavigationKey = symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter ||
            symbol === Clutter.KEY_ISO_Enter || symbol === Clutter.KEY_Down || symbol === Clutter.KEY_Up;
        if (isNavigationKey)
            this._flushPendingFilter();

        if (this._visibleRows.length === 0)
            return Clutter.EVENT_PROPAGATE;

        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter || symbol === Clutter.KEY_ISO_Enter) {
            let row = this._visibleRows[this._selectedIndex >= 0 ? this._selectedIndex : 0];
            if (row)
                row.activate();
            return Clutter.EVENT_STOP;
        }

        let newIndex = this._selectedIndex;

        if (symbol === Clutter.KEY_Down)
            newIndex = Math.min(this._selectedIndex + 1, this._visibleRows.length - 1);
        else if (symbol === Clutter.KEY_Up)
            newIndex = Math.max(this._selectedIndex - 1, 0);
        else
            return Clutter.EVENT_PROPAGATE;

        if (newIndex !== this._selectedIndex) {
            this._selectedIndex = newIndex;
            this._updateSelection();
        }

        return Clutter.EVENT_STOP;
    }

    destroy() {
        Main.keybindingManager.removeHotKey(HOTKEY_ID);
        this.settings.finalize();
        this._cancelPendingFilter();
        this._stopFill();
        if (this._searchIconClickedId)
            this._searchEntry.disconnect(this._searchIconClickedId);
        this._appSystem.disconnect(this._installedChangedId);
        super.destroy();
    }
});

module.exports = { LauncherDialog };
