// Input Switch Popup: shows the keyboard layouts near the text caret (or the
// mouse pointer) whenever the input source changes.

const { Clutter, Gio, GLib, Meta, Pango, St } = imports.gi;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const KeyboardManager = imports.ui.keyboardManager;

const CARET_QUERY_TIMEOUT_MS = 150;
const FADE_IN_MS = 80;
const FADE_OUT_MS = 200;
const SLIDE_MS = 180;
const POINTER_OFFSET_X = 16;
const POINTER_OFFSET_Y = 20;
const CARET_GAP = 4;
const MAX_VISIBLE_ITEMS = 5;

let extensionMeta = null;
let popup = null;

// Talks to caret-helper.py, which tracks the focused text widget over AT-SPI.
// AT-SPI calls can block, so they run in that process and never in Cinnamon.
// Protocol: we write "q\n", it answers "caret PID X Y W H" or "none".
class CaretHelper {
    constructor(uuid, path) {
        this._uuid = uuid;
        this._pending = [];
        this._failed = false;
        this._cancellable = new Gio.Cancellable();
        try {
            this._proc = Gio.Subprocess.new(
                ["python3", "-I", path],
                Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE
            );
            this._stdin = this._proc.get_stdin_pipe();
            this._stdout = new Gio.DataInputStream({
                base_stream: this._proc.get_stdout_pipe(),
                close_base_stream: true,
            });
            this._readLine();
        } catch (e) {
            global.logError(`${this._uuid}: could not start caret helper: ${e}`);
            this._proc = null;
            this._fail();
        }
    }

    _readLine() {
        this._stdout.read_line_async(GLib.PRIORITY_DEFAULT, this._cancellable, (stream, res) => {
            let line;
            try {
                [line] = stream.read_line_finish_utf8(res);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    global.logError(`${this._uuid}: caret helper read failed: ${e}`);
                this._fail();
                return;
            }
            if (line === null) {
                global.logWarning(`${this._uuid}: caret helper exited, using the mouse pointer only`);
                this._fail();
                return;
            }
            this._onLine(line);
            this._readLine();
        });
    }

    _onLine(line) {
        let callback = this._pending.shift();
        if (!callback)
            return;
        let parts = line.trim().split(/\s+/);
        if (parts[0] === "caret" && parts.length === 6) {
            let [pid, x, y, width, height] = parts.slice(1).map(Number);
            callback({ pid, x, y, width, height });
        } else {
            callback(null);
        }
    }

    _fail() {
        this._failed = true;
        let pending = this._pending;
        this._pending = [];
        pending.forEach(callback => callback(null));
    }

    // Calls callback(rect) or callback(null) exactly once.
    query(callback) {
        if (this._failed) {
            callback(null);
            return;
        }
        this._pending.push(callback);
        let request = new GLib.Bytes(new TextEncoder().encode("q\n"));
        this._stdin.write_bytes_async(request, GLib.PRIORITY_DEFAULT, this._cancellable, (stream, res) => {
            try {
                stream.write_bytes_finish(res);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    global.logError(`${this._uuid}: caret helper write failed: ${e}`);
                this._fail();
            }
        });
    }

    destroy() {
        this._failed = true;
        this._pending = [];
        this._cancellable.cancel();
        if (this._proc)
            this._proc.force_exit();
        this._proc = this._stdin = this._stdout = null;
    }
}

// Perceived brightness of an 8-bit RGB color, from 0 to 1.
function luminance(red, green, blue) {
    return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

// A row of all input sources with a highlight that slides to the active one.
// With more sources than fit, the row scrolls to keep the active one in view.
class SourceStrip {
    constructor() {
        this.actor = new St.Widget({
            style_class: "isp-popup",
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
            visible: false,
            opacity: 0,
        });
        this._viewport = new St.Widget({ clip_to_allocation: true });
        // Invisible actors styled as a theme slider and a theme menu, used to
        // read the accent and whether the theme is light.
        this._accentProbe = new St.Widget({ style_class: "slider", width: 0, height: 0, opacity: 0 });
        this._menuProbe = new St.Widget({ style_class: "menu", width: 0, height: 0, opacity: 0 });
        this._highlight = new St.Widget({ style_class: "isp-highlight" });
        this._row = new St.BoxLayout({ vertical: false });
        this._viewport.add_child(this._accentProbe);
        this._viewport.add_child(this._menuProbe);
        this._viewport.add_child(this._highlight);
        this._viewport.add_child(this._row);
        this.actor.add_child(this._viewport);

        this._labelsKey = null;
        this._items = [];
        this._itemWidth = 0;
        this._itemHeight = 0;
        this._index = -1;
    }

    setFontSize(px) {
        this.actor.set_style(`font-size: ${px}px;`);
        this._labelsKey = null; // re-measure on next show
    }

    // Uses a light popup when the Cinnamon theme's menus are light, so the
    // popup follows theme changes. Themes without a menu color stay dark.
    updateScheme() {
        let { red, green, blue, alpha } = this._menuProbe.get_theme_node().get_background_color();
        if (alpha > 0 && luminance(red, green, blue) > 0.5)
            this.actor.add_style_class_name("isp-light");
        else
            this.actor.remove_style_class_name("isp-light");
    }

    // Uses the Cinnamon theme's accent (its slider fill color) so the
    // highlight follows theme changes. Themes without one keep the CSS color.
    updateAccent() {
        let [found, color] = this._accentProbe.get_theme_node()
            .lookup_color("-slider-active-background-color", false);
        if (!found) {
            this._highlight.set_style(null);
            this.actor.remove_style_class_name("isp-light-accent");
            return;
        }
        let { red, green, blue } = color;
        this._highlight.set_style(`background-color: rgb(${red}, ${green}, ${blue});`);
        // Light accents need dark text on the highlight.
        if (luminance(red, green, blue) > 0.7)
            this.actor.add_style_class_name("isp-light-accent");
        else
            this.actor.remove_style_class_name("isp-light-accent");
    }

    // Rebuilds the row when the labels change. The actor must be visible,
    // since St only resolves styles (and so text sizes) for mapped actors.
    setLabels(labels) {
        let key = labels.join("\n");
        if (key === this._labelsKey)
            return;
        this._labelsKey = key;
        this._row.destroy_all_children();
        this._items = labels.map(text => {
            let label = new St.Label({
                style_class: "isp-item-label",
                text,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            let item = new St.Bin({ style_class: "isp-item", child: label });
            this._row.add_child(item);
            return item;
        });
        // Equal-width cells keep the slide and scroll math simple.
        this._itemWidth = Math.max(...this._items.map(item => item.get_preferred_width(-1)[1]));
        this._itemHeight = Math.max(...this._items.map(item => item.get_preferred_height(-1)[1]));
        this._items.forEach(item => item.set_size(this._itemWidth, this._itemHeight));
        this._highlight.set_size(this._itemWidth, this._itemHeight);
        this._index = -1;
    }

    _offsets(index) {
        let visible = Math.min(this._items.length, MAX_VISIBLE_ITEMS);
        let maxScroll = (this._items.length - visible) * this._itemWidth;
        let scroll = index * this._itemWidth - (visible - 1) * this._itemWidth / 2;
        scroll = Math.max(0, Math.min(scroll, maxScroll));
        return { highlightX: index * this._itemWidth - scroll, rowX: -scroll };
    }

    // Moves the highlight to `index`. It slides from where it is when the
    // popup is already showing, otherwise from `fromIndex`.
    select(index, fromIndex, showing) {
        let visible = Math.min(this._items.length, MAX_VISIBLE_ITEMS);
        this._viewport.set_size(visible * this._itemWidth, this._itemHeight);
        this._items.forEach((item, i) => {
            if (i === index)
                item.add_style_class_name("isp-item-active");
            else
                item.remove_style_class_name("isp-item-active");
        });

        let start = showing && this._index >= 0 ? this._index : fromIndex;
        let target = this._offsets(index);
        this._highlight.remove_all_transitions();
        this._row.remove_all_transitions();
        if (start >= 0 && start < this._items.length && start !== index) {
            if (!showing) {
                let from = this._offsets(start);
                this._highlight.x = from.highlightX;
                this._row.x = from.rowX;
            }
            let ease = { duration: SLIDE_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC };
            this._highlight.ease({ x: target.highlightX, ...ease });
            this._row.ease({ x: target.rowX, ...ease });
        } else {
            this._highlight.x = target.highlightX;
            this._row.x = target.rowX;
        }
        this._index = index;
    }
}

class InputSwitchPopup {
    constructor(metadata) {
        this._metadata = metadata;
        this._hideTimeoutId = 0;
        this._queryTimeoutId = 0;
        this._serial = 0;
        this._helper = null;

        this._strip = new SourceStrip();
        this._popup = this._strip.actor;
        Main.uiGroup.add_child(this._popup);

        this.settings = new Settings.ExtensionSettings(this, metadata.uuid);
        this.settings.bind("position-mode", "positionMode", this._onPositionModeChanged.bind(this));
        this.settings.bind("show-all", "showAll");
        this.settings.bind("duration-ms", "durationMs");
        this.settings.bind("font-size", "fontSize", this._onFontSizeChanged.bind(this));
        this._onPositionModeChanged();
        this._onFontSizeChanged();

        this._ism = KeyboardManager.getInputSourceManager();
        this._sourceChangedId = this._ism.connect("current-source-changed", this._onSourceChanged.bind(this));
    }

    _onFontSizeChanged() {
        this._strip.setFontSize(this.fontSize);
    }

    _onPositionModeChanged() {
        let wantHelper = this.positionMode === "caret";
        if (wantHelper && !this._helper) {
            let path = GLib.build_filenamev([this._metadata.path, "caret-helper.py"]);
            this._helper = new CaretHelper(this._metadata.uuid, path);
        } else if (!wantHelper && this._helper) {
            this._helper.destroy();
            this._helper = null;
        }
    }

    _onSourceChanged(ism, oldSource) {
        let source = ism.currentSource;
        // oldSource is null on startup and when the source list is reloaded.
        if (!source || !oldSource || oldSource.id === source.id)
            return;

        let sources = [source];
        if (this.showAll) {
            let all = ism.inputSources;
            sources = Object.keys(all).sort((a, b) => a - b).map(key => all[key]);
        }
        let view = {
            labels: sources.map(s => (s.shortName || s.id).toUpperCase()),
            index: sources.findIndex(s => s.id === source.id),
            fromIndex: sources.findIndex(s => s.id === oldSource.id),
        };

        if (!this._helper) {
            this._present(view, null);
            return;
        }

        // Ask for the caret position, falling back to the pointer if the
        // helper is slow. A newer switch supersedes a pending one.
        let serial = ++this._serial;
        let finish = rect => {
            if (serial !== this._serial)
                return;
            this._serial++;
            this._clearQueryTimeout();
            this._present(view, rect);
        };
        this._clearQueryTimeout();
        this._queryTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CARET_QUERY_TIMEOUT_MS, () => {
            this._queryTimeoutId = 0;
            finish(null);
            return GLib.SOURCE_REMOVE;
        });
        this._helper.query(finish);
    }

    // Returns where to put the popup: below the caret if it belongs to the
    // focused window, otherwise next to the pointer. `above` is the bottom
    // edge to use when there is no room below.
    _anchor(rect) {
        let focus = global.display.focus_window;
        if (rect && focus && focus.get_pid() === rect.pid) {
            return {
                x: rect.x - CARET_GAP,
                y: rect.y + rect.height + CARET_GAP,
                above: rect.y - CARET_GAP,
            };
        }
        let [x, y] = global.get_pointer();
        return { x: x + POINTER_OFFSET_X, y: y + POINTER_OFFSET_Y, above: y - CARET_GAP };
    }

    _present({ labels, index, fromIndex }, rect) {
        let wasShowing = this._popup.visible;
        this._popup.remove_all_transitions();
        this._popup.show(); // still transparent; needed before measuring
        this._strip.updateScheme();
        this._strip.updateAccent();
        this._strip.setLabels(labels);
        this._strip.select(index, fromIndex, wasShowing);

        // Keep the popup on the monitor's work area; flip above if needed.
        let [, , width, height] = this._popup.get_preferred_size();
        let { x, y, above } = this._anchor(rect);
        let monitor = global.display.get_monitor_index_for_rect(
            new Meta.Rectangle({ x, y: above, width: 1, height: 1 }));
        let area = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(monitor);
        if (y + height > area.y + area.height)
            y = above - height;
        x = Math.max(area.x, Math.min(x, area.x + area.width - width));
        y = Math.max(area.y, Math.min(y, area.y + area.height - height));

        this._popup.set_position(Math.round(x), Math.round(y));
        Main.uiGroup.set_child_above_sibling(this._popup, null);
        this._popup.ease({
            opacity: 255,
            duration: FADE_IN_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._clearHideTimeout();
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.durationMs, () => {
            this._hideTimeoutId = 0;
            this._popup.ease({
                opacity: 0,
                duration: FADE_OUT_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => this._popup.hide(),
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearHideTimeout() {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }
    }

    _clearQueryTimeout() {
        if (this._queryTimeoutId) {
            GLib.source_remove(this._queryTimeoutId);
            this._queryTimeoutId = 0;
        }
    }

    destroy() {
        this._ism.disconnect(this._sourceChangedId);
        this._clearHideTimeout();
        this._clearQueryTimeout();
        if (this._helper) {
            this._helper.destroy();
            this._helper = null;
        }
        this.settings.finalize();
        this._popup.destroy();
    }
}

function init(metadata) {
    extensionMeta = metadata;
}

function enable() {
    popup = new InputSwitchPopup(extensionMeta);
}

function disable() {
    if (popup) {
        popup.destroy();
        popup = null;
    }
}
