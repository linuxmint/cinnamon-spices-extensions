/*
 * Bing Wallpaper - Cinnamon extension
 * Copyright (C) 2026 bigmalove
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Downloads the Bing "image of the day" and sets it as the desktop background.
 * Works on Cinnamon 5.4+ (libsoup 2.4 or 3).
 *
 * Lifecycle: init() -> enable() -> ... -> disable()
 * The object returned by enable() exposes the callbacks used by the buttons in
 * settings-schema.json (onRefreshNow, onOpenBingPage, onOpenFolder).
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Pango = imports.gi.Pango;
const Soup = imports.gi.Soup;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Settings = imports.ui.settings;
const ByteArray = imports.byteArray;

const UUID = "bing-wallpaper@bigmalove";

const BING_BASE_URL = "https://www.bing.com";
const ARCHIVE_URL = BING_BASE_URL + "/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) Cinnamon BingWallpaper/1.0";

const BACKGROUND_SCHEMA = "org.cinnamon.desktop.background";
const SLIDESHOW_SCHEMA = "org.cinnamon.desktop.background.slideshow";

// Tried in order when the configured resolution is not available for an image.
const FALLBACK_RESOLUTIONS = ["1920x1200", "1920x1080"];
// Back-off delays (seconds) after consecutive failures.
const RETRY_DELAYS = [30, 60, 120, 300, 600, 1800];
// Notify the user once a failure streak reaches this length.
const FAILURES_BEFORE_NOTIFY = 3;
// Give the desktop a moment to settle after login / enable before the first check.
const STARTUP_DELAY = 5;
// "network-changed" fires in bursts; wait this long before reacting.
const NETWORK_DEBOUNCE = 10;
// Only files matching this pattern (the ones we create) are ever deleted.
const IMAGE_FILE_PATTERN = /^\d{8}_.+\.jpe?g$/i;
// Distance of the desktop image information from the edges of the work area (px).
const OVERLAY_MARGIN = 24;

Gettext.bindtextdomain(UUID, GLib.build_filenamev([GLib.get_user_data_dir(), "locale"]));

function _(str) {
    let translated = Gettext.dgettext(UUID, str);
    return translated !== str ? translated : Gettext.gettext(str);
}

function logInfo(msg) {
    global.log("[" + UUID + "] " + msg);
}

function logWarn(msg) {
    if (typeof global.logWarning === "function")
        global.logWarning("[" + UUID + "] " + msg);
    else
        global.log("[" + UUID + "] WARNING: " + msg);
}

function logError(msg) {
    global.logError("[" + UUID + "] " + msg);
}

function bytesToString(bytes) {
    return ByteArray.toString(ByteArray.fromGBytes(bytes));
}

/**
 * Breaks @text into lines of at most @maxChars characters (code points).
 * Spaces are preferred as break points; words longer than the limit (and
 * CJK text, which has no spaces) are cut hard.
 */
function wrapText(text, maxChars) {
    if (!text)
        return "";
    maxChars = Math.max(4, parseInt(maxChars, 10) || 0);
    let lines = [];
    for (let paragraph of String(text).split("\n")) {
        let line = "";
        for (let word of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
            let chars = Array.from(word);
            if (chars.length > maxChars) {
                if (line) {
                    lines.push(line);
                    line = "";
                }
                while (chars.length > maxChars)
                    lines.push(chars.splice(0, maxChars).join(""));
                line = chars.join("");
                continue;
            }
            let candidate = line ? line + " " + word : word;
            if (Array.from(candidate).length > maxChars) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        lines.push(line);
    }
    return lines.join("\n");
}

/**
 * Minimal async HTTP GET client that hides the libsoup 2 / libsoup 3 differences.
 * Callbacks receive (error, GLib.Bytes).
 */
class HttpClient {
    constructor() {
        this._session = new Soup.Session({ user_agent: USER_AGENT, timeout: 60 });
        if (Soup.MAJOR_VERSION === 2) {
            // libsoup 2 only honours the system proxy when explicitly asked to.
            Soup.Session.prototype.add_feature.call(this._session, new Soup.ProxyResolverDefault());
        }
    }

    get(url, callback) {
        let message = Soup.Message.new("GET", url);
        if (!message) {
            callback(new Error("Invalid URL: " + url));
            return;
        }

        if (Soup.MAJOR_VERSION === 2) {
            this._session.queue_message(message, (session, msg) => {
                if (msg.status_code !== 200) {
                    callback(new Error("HTTP " + msg.status_code + " " + (msg.reason_phrase || "")));
                    return;
                }
                let bytes = msg.response_body_data || msg.response_body.flatten().get_as_bytes();
                callback(null, bytes);
            });
            return;
        }

        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            let bytes;
            try {
                bytes = session.send_and_read_finish(result);
            } catch (e) {
                callback(e);
                return;
            }
            let status = message.get_status();
            if (status !== Soup.Status.OK) {
                callback(new Error("HTTP " + status + " " + (message.get_reason_phrase() || "")));
                return;
            }
            callback(null, bytes);
        });
    }

    abort() {
        this._session.abort();
    }
}

/**
 * Creates @dir and any missing parents without blocking; callback(error).
 * An existing directory is not an error.
 */
function ensureDirectoryAsync(dir, callback) {
    dir.make_directory_async(GLib.PRIORITY_DEFAULT, null, (d, result) => {
        try {
            d.make_directory_finish(result);
            callback(null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                callback(null);
            } else if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) && d.get_parent()) {
                ensureDirectoryAsync(d.get_parent(), (error) => {
                    if (error)
                        callback(error);
                    else
                        ensureDirectoryAsync(d, callback);
                });
            } else {
                callback(e);
            }
        }
    });
}

/** callback(exists) - whether @file currently exists, checked without blocking. */
function fileExistsAsync(file, callback) {
    file.query_info_async("standard::type", Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null,
        (f, result) => {
            let exists = true;
            try {
                f.query_info_finish(result);
            } catch (e) {
                exists = false;
            }
            callback(exists);
        });
}

/**
 * Returns true when @color (a CSS colour string) is dark, so that shadows and
 * outlines can use a contrasting tone.
 */
function isDarkColor(color) {
    try {
        let [ok, parsed] = Clutter.Color.from_string(color || "");
        if (!ok)
            return false;
        let luminance = (0.299 * parsed.red + 0.587 * parsed.green + 0.114 * parsed.blue) / 255;
        return luminance < 0.5;
    } catch (e) {
        return false;
    }
}

/**
 * Describes a text effect: extra copies of the text painted below the real one
 * (each with an offset and its own style), the style of the real text and the
 * style of the surrounding box. Shadows and outlines pick a tone that contrasts
 * with @textColor.
 */
function buildTextEffect(name, textColor) {
    let dark = isDarkColor(textColor);
    let tone = dark ? "255, 255, 255" : "0, 0, 0";
    let rgba = (alpha) => "rgba(" + tone + ", " + alpha + ")";
    let shadowLayer = (alpha, blur) => ({
        dx: 0, dy: 0,
        style: "color: " + rgba(alpha) + "; text-shadow: 0 0 " + blur + "px " + rgba(alpha) + ";"
    });

    switch (name) {
        case "none":
            return { layers: [], main: "", box: "" };
        case "strong-shadow":
            return {
                layers: [shadowLayer(0.9, 4), shadowLayer(0.7, 10)],
                main: "text-shadow: 0 2px 4px " + rgba(0.6) + ";",
                box: ""
            };
        case "glow":
            return {
                layers: [
                    { dx: 0, dy: 0, style: "color: rgba(255, 255, 255, 0.8); text-shadow: 0 0 5px rgba(255, 255, 255, 0.8);" },
                    { dx: 0, dy: 0, style: "color: rgba(255, 255, 255, 0.6); text-shadow: 0 0 10px rgba(255, 255, 255, 0.6);" },
                    { dx: 0, dy: 0, style: "color: rgba(0, 210, 255, 0.4); text-shadow: 0 0 20px rgba(0, 210, 255, 0.4);" }
                ],
                main: "",
                box: ""
            };
        case "outline": {
            let w = 1.5;
            let style = "color: " + rgba(0.85) + ";";
            let layers = [[-w, 0], [w, 0], [0, -w], [0, w], [-w, -w], [w, -w], [-w, w], [w, w]]
                .map(([dx, dy]) => ({ dx: dx, dy: dy, style: style }));
            return { layers: layers, main: "text-shadow: 0 2px 4px " + rgba(0.3) + ";", box: "" };
        }
        case "background":
            return {
                layers: [],
                main: "text-shadow: 0 1px 2px " + rgba(0.3) + ";",
                box: "background-color: " + (dark ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.55)") +
                    "; padding: 8px 12px; border-radius: 8px;"
            };
        case "shadow":
        default:
            return { layers: [], main: "text-shadow: 0 1px 3px " + rgba(0.8) + ";", box: "" };
    }
}

/**
 * A right-aligned, multi-line label that can paint extra copies of its text
 * underneath itself (offset and styled per effect layer) to produce outlines
 * and layered shadows, which plain St CSS cannot express.
 */
class EffectLabel {
    constructor(styleClass) {
        this._styleClass = styleClass;
        this._text = "";
        this._layers = [];
        this.actor = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this._main = this._createLabel();
        this.actor.add_child(this._main);
    }

    _createLabel() {
        let label = new St.Label({ style_class: this._styleClass });
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        label.clutter_text.line_alignment = Pango.Alignment.RIGHT;
        return label;
    }

    setText(text) {
        this._text = text || "";
        this._main.set_text(this._text);
        for (let layer of this._layers)
            layer.set_text(this._text);
    }

    setEffect(layers, mainStyle) {
        for (let layer of this._layers)
            layer.destroy();
        this._layers = [];
        for (let spec of layers) {
            let label = this._createLabel();
            label.set_style(spec.style);
            label.set_translation(spec.dx, spec.dy, 0);
            label.set_text(this._text);
            this.actor.insert_child_below(label, this._main);
            this._layers.push(label);
        }
        this._main.set_style(mainStyle || "");
    }

    setVisible(visible) {
        this.actor.visible = !!visible;
    }

    getText() {
        return this._text;
    }
}

/**
 * Title, copyright and date of the current image drawn as text in the top-right
 * corner of the primary monitor. The actor lives in Cinnamon's desklet layer,
 * i.e. on the desktop below application windows, and never takes input.
 */
class InfoOverlay {
    constructor() {
        // A transparent, non-reactive bin covering the work area; the text block is
        // aligned to its top-right corner so that its width can follow the text.
        this.actor = new St.Bin({
            reactive: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.START
        });
        // The desklet container expects its children to look like desklets.
        this.actor._delegate = { _draggable: { inhibit: true } };

        this._box = new St.BoxLayout({ vertical: true, style_class: "bing-wallpaper-info" });
        this.actor.set_child(this._box);

        this._title = new EffectLabel("bing-wallpaper-info-title");
        this._copyright = new EffectLabel("bing-wallpaper-info-copyright");
        this._date = new EffectLabel("bing-wallpaper-info-date");
        this._labels = [this._title, this._copyright, this._date];
        for (let label of this._labels)
            this._box.add(label.actor, { x_fill: false, x_align: St.Align.END });
        this.actor.hide();

        this._container = Main.deskletContainer ? Main.deskletContainer.actor : Main.uiGroup;
        this._container.add_actor(this.actor);

        this._monitorsChangedId = Main.layoutManager.connect("monitors-changed", () => this.reposition());
        this._workareasChangedId = 0;
        try {
            this._workareasChangedId = global.display.connect("workareas-changed", () => this.reposition());
        } catch (e) {
            // older Cinnamon without this signal: monitors-changed is still handled
        }
        this.reposition();
    }

    setStyle(color, fontSizePt, effectName) {
        color = color || "#ffffff";
        let effect = buildTextEffect(effectName, color);
        let style = "color: " + color + ";";
        if (fontSizePt > 0)
            style += " font-size: " + fontSizePt + "pt;";
        this._box.set_style(style + " " + effect.box);
        for (let label of this._labels)
            label.setEffect(effect.layers, effect.main);
    }

    update(title, copyright, dateLine) {
        this._title.setText(title);
        this._title.setVisible(!!title);
        this._copyright.setText(copyright);
        this._copyright.setVisible(!!copyright);
        this._date.setText(dateLine);
        this._date.setVisible(!!dateLine);

        if (title || copyright) {
            this.actor.show();
            this.reposition();
        } else {
            this.actor.hide();
        }
    }

    reposition() {
        if (!this.actor)
            return;
        let area = this._workArea();
        if (!area)
            return;
        this.actor.set_position(area.x + OVERLAY_MARGIN, area.y + OVERLAY_MARGIN);
        this.actor.set_size(Math.max(1, area.width - 2 * OVERLAY_MARGIN),
            Math.max(1, area.height - 2 * OVERLAY_MARGIN));
    }

    _workArea() {
        let monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return null;
        try {
            let workspace = global.workspace_manager.get_active_workspace();
            let area = workspace.get_work_area_for_monitor(Main.layoutManager.primaryIndex);
            if (area && area.width > 0)
                return area;
        } catch (e) {
            // fall through to the full monitor geometry
        }
        return { x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height };
    }

    destroy() {
        if (this._monitorsChangedId)
            Main.layoutManager.disconnect(this._monitorsChangedId);
        if (this._workareasChangedId)
            global.display.disconnect(this._workareasChangedId);
        this._monitorsChangedId = 0;
        this._workareasChangedId = 0;
        if (this.actor) {
            this.actor.destroy();
            this.actor = null;
        }
    }
}

class BingWallpaperExtension {
    constructor(metadata) {
        this.metadata = metadata;

        this._http = new HttpClient();
        this._background = new Gio.Settings({ schema_id: BACKGROUND_SCHEMA });
        this._networkMonitor = Gio.NetworkMonitor.get_default();
        this._networkSignalId = 0;
        this._timerId = 0;
        this._networkDebounceId = 0;
        this._busy = false;
        this._queued = null;
        this._failures = 0;
        this._lastSuccess = 0;
        this._enabled = false;
        this._overlay = null;
        this._pruning = false;

        this.settings = new Settings.ExtensionSettings(this, UUID);
        this.settings.bind("market", "market", () => this._onSourceChanged());
        this.settings.bind("resolution", "resolution", () => this._onSourceChanged());
        this.settings.bind("picture-options", "pictureOptions", () => this._applyPictureOptions());
        this.settings.bind("notify-on-change", "notifyOnChange");
        this.settings.bind("save-dir", "saveDirSetting", () => this._onSaveDirChanged());
        this.settings.bind("keep-count", "keepCount", () => this._pruneOldImages());
        this.settings.bind("check-interval", "checkInterval", () => this._scheduleCheck());
        this.settings.bind("skip-metered", "skipMetered");
        this.settings.bind("show-info-overlay", "showInfoOverlay", () => this._updateOverlay());
        this.settings.bind("overlay-color", "overlayColor", () => this._updateOverlayStyle());
        this.settings.bind("overlay-effect", "overlayEffect", () => this._updateOverlayStyle());
        this.settings.bind("overlay-font-size", "overlayFontSize", () => this._updateOverlayStyle());
        this.settings.bind("overlay-chars-per-line", "overlayCharsPerLine", () => this._updateOverlay());
        // Persisted state about the image currently in use.
        this.settings.bind("last-date", "lastDate");
        this.settings.bind("last-file", "lastFile");
        this.settings.bind("last-title", "lastTitle");
        this.settings.bind("last-copyright", "lastCopyright");
        this.settings.bind("last-link", "lastLink");
    }

    /* ---------------------------------------------------------------- lifecycle */

    enable() {
        this._enabled = true;
        this._networkSignalId = this._networkMonitor.connect("network-changed",
            (monitor, available) => this._onNetworkChanged(available));
        this._scheduleCheck(STARTUP_DELAY);
        this._updateOverlay();
        logInfo("Enabled (libsoup " + Soup.MAJOR_VERSION + ")");
    }

    disable() {
        this._enabled = false;
        this._clearTimer();
        if (this._networkDebounceId) {
            GLib.source_remove(this._networkDebounceId);
            this._networkDebounceId = 0;
        }
        if (this._networkSignalId) {
            this._networkMonitor.disconnect(this._networkSignalId);
            this._networkSignalId = 0;
        }
        this._http.abort();
        this._busy = false;
        this._queued = null;
        this._destroyOverlay();
        this.settings.finalize();
        logInfo("Disabled");
    }

    /* ------------------------------------------------- settings button callbacks */

    onRefreshNow() {
        this.checkForNewWallpaper({ reapply: true, interactive: true });
    }

    onOpenBingPage() {
        if (!this.lastLink) {
            this._notify(_("Bing Wallpaper"), _("No Bing image has been downloaded yet."));
            return;
        }
        this._openUri(this.lastLink);
    }

    onOpenFolder() {
        let dir;
        try {
            dir = this._saveDirFile();
        } catch (e) {
            logWarn("Could not open the wallpaper folder: " + e.message);
            return;
        }
        ensureDirectoryAsync(dir, (error) => {
            if (error)
                logWarn("Could not create the wallpaper folder: " + error.message);
            this._openUri(dir.get_uri());
        });
    }

    /* ------------------------------------------------------------ scheduling */

    _intervalSeconds() {
        let minutes = parseInt(this.checkInterval, 10);
        if (isNaN(minutes) || minutes < 1)
            minutes = 60;
        return minutes * 60;
    }

    _scheduleCheck(delaySeconds) {
        this._clearTimer();
        if (!this._enabled)
            return;
        if (delaySeconds === undefined)
            delaySeconds = this._intervalSeconds();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delaySeconds, () => {
            this._timerId = 0;
            this.checkForNewWallpaper({});
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _onNetworkChanged(available) {
        if (!available || !this._enabled)
            return;
        if (this._networkDebounceId)
            GLib.source_remove(this._networkDebounceId);
        this._networkDebounceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, NETWORK_DEBOUNCE, () => {
            this._networkDebounceId = 0;
            let ageSeconds = (GLib.get_monotonic_time() - this._lastSuccess) / 1000000;
            if (this._failures > 0 || this._lastSuccess === 0 || ageSeconds > this._intervalSeconds())
                this.checkForNewWallpaper({});
            return GLib.SOURCE_REMOVE;
        });
    }

    _onSourceChanged() {
        if (this._enabled)
            this.checkForNewWallpaper({ reapply: true });
    }

    _onSaveDirChanged() {
        if (this._enabled)
            this.checkForNewWallpaper({});
    }

    /* ---------------------------------------------------------- main routine */

    /**
     * options.reapply     - set the wallpaper even if today's image was already applied
     * options.interactive - triggered by the user: always give feedback via a notification
     */
    checkForNewWallpaper(options) {
        options = options || {};
        if (!this._enabled)
            return;

        if (this._busy) {
            // Merge with whatever is already waiting and run it when the current check ends.
            let queued = this._queued || {};
            this._queued = {
                reapply: !!(queued.reapply || options.reapply),
                interactive: !!(queued.interactive || options.interactive)
            };
            return;
        }

        if (this.skipMetered && !options.interactive && this._networkMonitor.get_network_metered()) {
            logInfo("Metered connection, skipping this check");
            this._scheduleCheck();
            return;
        }

        this._busy = true;
        let market = this._resolveMarket();
        let url = ARCHIVE_URL + encodeURIComponent(market);
        logInfo("Checking " + url);

        this._http.get(url, (error, bytes) => {
            if (error) {
                this._finish(error, options);
                return;
            }
            let info;
            try {
                info = this._parseArchive(bytes);
            } catch (e) {
                this._finish(e, options);
                return;
            }
            this._processImage(info, options);
        });
    }

    _resolveMarket() {
        if (this.market && this.market !== "auto")
            return this.market;
        let names = GLib.get_language_names();
        for (let i = 0; i < names.length; i++) {
            let match = /^([a-z]{2,3})_([A-Z]{2})/.exec(names[i]);
            if (match)
                return match[1] + "-" + match[2];
        }
        return "en-US";
    }

    _parseArchive(bytes) {
        let data = JSON.parse(bytesToString(bytes));
        if (!data || !data.images || !data.images.length)
            throw new Error("Bing returned no image");
        let image = data.images[0];
        if (!image.urlbase || !image.startdate)
            throw new Error("Unexpected Bing response format");

        // urlbase looks like "/th?id=OHR.Westerheversand_ZH-CN0517707643"
        let idMatch = /id=([^&]+)/.exec(image.urlbase);
        let id = idMatch ? idMatch[1] : (image.hsh || "image");
        id = id.replace(/^OHR\./, "").replace(/[^A-Za-z0-9._-]/g, "_");

        return {
            date: String(image.startdate),
            urlbase: image.urlbase,
            id: id,
            title: image.title || "",
            copyright: image.copyright || "",
            link: image.copyrightlink || ""
        };
    }

    _fileNameFor(info) {
        return info.date + "_" + info.id + "_" + this.resolution + ".jpg";
    }

    _processImage(info, options) {
        let dir;
        try {
            dir = this._saveDirFile();
        } catch (e) {
            this._finish(e, options);
            return;
        }
        let file = dir.get_child(this._fileNameFor(info));

        ensureDirectoryAsync(dir, (error) => {
            if (!this._enabled)
                return;
            if (error) {
                this._finish(error, options);
                return;
            }
            fileExistsAsync(file, (exists) => {
                if (!this._enabled)
                    return;
                if (exists) {
                    if (this.lastFile === file.get_path() && !options.reapply) {
                        // Today's image is already in place. If the user picked another wallpaper
                        // by hand in the meantime we leave it alone until a new image arrives.
                        this._finish(null, options, { file: file, info: info, changed: false });
                        return;
                    }
                    let changed = this._applyWallpaper(file, info);
                    this._finish(null, options, { file: file, info: info, changed: changed });
                    return;
                }

                let resolutions = [this.resolution].concat(
                    FALLBACK_RESOLUTIONS.filter((r) => r !== this.resolution));
                this._downloadImage(info, resolutions, file, (downloadError) => {
                    if (!this._enabled)
                        return;
                    if (downloadError) {
                        this._finish(downloadError, options);
                        return;
                    }
                    logInfo("Downloaded " + file.get_path());
                    let changed = this._applyWallpaper(file, info);
                    this._finish(null, options, { file: file, info: info, changed: changed });
                });
            });
        });
    }

    _downloadImage(info, resolutions, file, callback) {
        let resolution = resolutions[0];
        let url = BING_BASE_URL + info.urlbase + "_" + resolution + ".jpg";

        this._http.get(url, (error, bytes) => {
            if (error) {
                if (resolutions.length > 1 && /^HTTP 4\d\d/.test(error.message)) {
                    logWarn("Resolution " + resolution + " not available (" + error.message.trim() + "), trying " + resolutions[1]);
                    this._downloadImage(info, resolutions.slice(1), file, callback);
                    return;
                }
                callback(error);
                return;
            }

            let data = bytes.get_data();
            if (!data || data.length < 1024 || data[0] !== 0xFF || data[1] !== 0xD8) {
                callback(new Error("Downloaded data is not a JPEG image"));
                return;
            }

            // replace_contents writes to a temporary file and renames it, so a
            // half-written image never ends up as the wallpaper.
            file.replace_contents_bytes_async(bytes, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, result) => {
                    try {
                        f.replace_contents_finish(result);
                    } catch (e) {
                        callback(e);
                        return;
                    }
                    callback(null);
                });
        });
    }

    _applyWallpaper(file, info) {
        let uri = file.get_uri();

        // Cinnamon's built-in slideshow would immediately override us.
        try {
            let slideshow = new Gio.Settings({ schema_id: SLIDESHOW_SCHEMA });
            if (slideshow.get_boolean("slideshow-enabled")) {
                slideshow.set_boolean("slideshow-enabled", false);
                logInfo("Turned off the Cinnamon background slideshow");
            }
        } catch (e) {
            // schema not present on this Cinnamon version - nothing to do
        }

        let changed = this._background.get_string("picture-uri") !== uri;
        if (changed)
            this._background.set_string("picture-uri", uri);
        this._applyPictureOptions();

        this.lastDate = info.date;
        this.lastFile = file.get_path();
        this.lastTitle = info.title;
        this.lastCopyright = info.copyright;
        this.lastLink = info.link;
        this._updateOverlay();

        if (changed)
            logInfo("Wallpaper set to " + file.get_path());

        this._pruneOldImages();
        return changed;
    }

    _applyPictureOptions() {
        if (!this.pictureOptions || this.pictureOptions === "keep")
            return;
        try {
            if (this._background.get_string("picture-options") !== this.pictureOptions)
                this._background.set_string("picture-options", this.pictureOptions);
        } catch (e) {
            logWarn("Could not apply picture aspect '" + this.pictureOptions + "': " + e.message);
        }
    }

    _finish(error, options, result) {
        this._busy = false;
        if (!this._enabled)
            return;

        if (error) {
            this._failures++;
            let delay = RETRY_DELAYS[Math.min(this._failures - 1, RETRY_DELAYS.length - 1)];
            delay = Math.min(delay, this._intervalSeconds());
            logWarn("Update failed (" + error.message + "), retrying in " + delay + "s");
            if (options.interactive || this._failures === FAILURES_BEFORE_NOTIFY) {
                this._notify(_("Could not update the Bing wallpaper"),
                    String(error.message).trim() + "\n" + _("It will be retried automatically."));
            }
            this._scheduleCheck(delay);
        } else {
            this._failures = 0;
            this._lastSuccess = GLib.get_monotonic_time();
            if (result)
                this._report(result, options);
            this._scheduleCheck();
        }

        if (this._queued && this._enabled) {
            let queued = this._queued;
            this._queued = null;
            this.checkForNewWallpaper(queued);
        }
    }

    _report(result, options) {
        let info = result.info;
        if (result.changed) {
            if (options.interactive || this.notifyOnChange)
                this._notify(info.title || _("Bing Wallpaper"), info.copyright, result.file);
        } else if (options.interactive) {
            let body = info.title ? info.title + "\n" + info.copyright : info.copyright;
            this._notify(_("The wallpaper is already up to date"), body, result.file);
        }
    }

    /* ----------------------------------------------------------- file handling */

    /** The configured wallpaper folder as a Gio.File (no I/O). Throws if it is not a local path. */
    _saveDirFile() {
        let value = (this.saveDirSetting || "").trim();
        let dir;

        if (!value) {
            let pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) || GLib.get_home_dir();
            dir = Gio.File.new_for_path(GLib.build_filenamev([pictures, "BingWallpapers"]));
        } else if (value.indexOf("://") !== -1) {
            dir = Gio.File.new_for_uri(value);
        } else {
            if (value.charAt(0) === "~")
                value = GLib.get_home_dir() + value.substring(1);
            dir = Gio.File.new_for_path(value);
        }

        if (!dir.get_path())
            throw new Error("The wallpaper folder must be on the local file system: " + value);
        return dir;
    }

    _pruneOldImages() {
        if (this._pruning || !this._enabled)
            return;
        let dir;
        try {
            dir = this._saveDirFile();
        } catch (e) {
            return;
        }
        let keep = parseInt(this.keepCount, 10);
        if (isNaN(keep) || keep < 1)
            keep = 1;

        this._pruning = true;
        let names = [];
        let done = () => { this._pruning = false; };

        dir.enumerate_children_async("standard::name,standard::type", Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_LOW, null, (d, result) => {
                let enumerator;
                try {
                    enumerator = d.enumerate_children_finish(result);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                        logWarn("Could not list the wallpaper folder: " + e.message);
                    done();
                    return;
                }
                let readMore = () => {
                    enumerator.next_files_async(50, GLib.PRIORITY_LOW, null, (en, res) => {
                        let infos;
                        try {
                            infos = en.next_files_finish(res);
                        } catch (e) {
                            logWarn("Could not list the wallpaper folder: " + e.message);
                            infos = [];
                        }
                        if (infos.length === 0) {
                            en.close_async(GLib.PRIORITY_LOW, null, (source, closeResult) => {
                                try {
                                    source.close_finish(closeResult);
                                } catch (e) {
                                    // nothing useful to do
                                }
                            });
                            this._deleteOldImages(dir, names, keep, done);
                            return;
                        }
                        for (let fileInfo of infos) {
                            if (fileInfo.get_file_type() === Gio.FileType.REGULAR &&
                                IMAGE_FILE_PATTERN.test(fileInfo.get_name()))
                                names.push(fileInfo.get_name());
                        }
                        readMore();
                    });
                };
                readMore();
            });
    }

    _deleteOldImages(dir, names, keep, done) {
        // File names start with YYYYMMDD, so sorting puts the oldest first.
        names.sort();
        let current = this.lastFile ? GLib.path_get_basename(this.lastFile) : null;
        let victims = [];
        for (let i = 0; i < names.length && victims.length < names.length - keep; i++) {
            if (names[i] !== current)
                victims.push(names[i]);
        }
        let pending = victims.length;
        if (pending === 0) {
            done();
            return;
        }
        for (let name of victims) {
            dir.get_child(name).delete_async(GLib.PRIORITY_LOW, null, (f, result) => {
                try {
                    f.delete_finish(result);
                    logInfo("Removed old image " + name);
                } catch (e) {
                    logWarn("Could not remove " + name + ": " + e.message);
                }
                if (--pending === 0)
                    done();
            });
        }
    }

    /* ------------------------------------------------------- desktop info card */

    _updateOverlay() {
        if (!this._enabled || !this.showInfoOverlay) {
            this._destroyOverlay();
            return;
        }
        try {
            if (!this._overlay) {
                this._overlay = new InfoOverlay();
                this._updateOverlayStyle();
            }
            let chars = parseInt(this.overlayCharsPerLine, 10);
            if (isNaN(chars) || chars < 4)
                chars = 24;
            let dateText = this._formatDate(this.lastDate);
            let dateLine = dateText ? _("Bing image of the day") + "  ·  " + dateText : _("Bing image of the day");
            this._overlay.update(wrapText(this.lastTitle, chars), wrapText(this.lastCopyright, chars),
                wrapText(dateLine, chars));
        } catch (e) {
            logWarn("Could not show the image information: " + e.message);
        }
    }

    _updateOverlayStyle() {
        if (!this._overlay)
            return;
        let fontSize = parseInt(this.overlayFontSize, 10);
        if (isNaN(fontSize) || fontSize < 0)
            fontSize = 0;
        this._overlay.setStyle(this.overlayColor, fontSize, this.overlayEffect);
    }

    _destroyOverlay() {
        if (this._overlay) {
            this._overlay.destroy();
            this._overlay = null;
        }
    }

    _formatDate(yyyymmdd) {
        let match = /^(\d{4})(\d{2})(\d{2})$/.exec(yyyymmdd || "");
        if (!match)
            return "";
        let iso = match[1] + "-" + match[2] + "-" + match[3];
        try {
            let date = GLib.DateTime.new_local(parseInt(match[1], 10), parseInt(match[2], 10),
                parseInt(match[3], 10), 0, 0, 0);
            return (date && date.format("%x")) || iso;
        } catch (e) {
            return iso;
        }
    }

    /* ------------------------------------------------------------------- misc */

    _openUri(uri) {
        try {
            if (typeof Gio.AppInfo.launch_default_for_uri_async === "function") {
                Gio.AppInfo.launch_default_for_uri_async(uri, null, null, (source, result) => {
                    try {
                        Gio.AppInfo.launch_default_for_uri_finish(result);
                    } catch (e) {
                        logWarn("Could not open " + uri + ": " + e.message);
                    }
                });
            } else {
                Gio.AppInfo.launch_default_for_uri(uri, null);
            }
        } catch (e) {
            logWarn("Could not open " + uri + ": " + e.message);
        }
    }

    _notify(title, body, imageFile) {
        try {
            let source = new MessageTray.Source(_("Bing Wallpaper"));
            let size = source.ICON_SIZE || 48;
            let icon = null;
            if (imageFile) {
                try {
                    icon = St.TextureCache.get_default().load_uri_async(imageFile.get_uri(), size, size);
                } catch (e) {
                    icon = null;
                }
            }
            if (!icon) {
                icon = new St.Icon({
                    icon_name: "preferences-desktop-wallpaper",
                    icon_type: St.IconType.FULLCOLOR,
                    icon_size: size
                });
            }
            let notification = new MessageTray.Notification(source, title, body || "", { icon: icon });
            notification.setTransient(true);
            Main.messageTray.add(source);
            source.notify(notification);
        } catch (e) {
            logWarn("Could not show a notification: " + e.message);
        }
    }
}

/* ------------------------------------------------------------ entry points */

let extensionMeta = null;
let extension = null;

function init(metadata) {
    extensionMeta = metadata;
}

function enable() {
    extension = new BingWallpaperExtension(extensionMeta);
    extension.enable();
    // Returning the instance makes its on* methods available to the settings dialog buttons.
    return extension;
}

function disable() {
    if (extension) {
        extension.disable();
        extension = null;
    }
}
