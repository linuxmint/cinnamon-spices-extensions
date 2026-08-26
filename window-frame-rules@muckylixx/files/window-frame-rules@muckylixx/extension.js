const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;

const UUID = "window-frame-rules@muckylixx";
const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), "window-frame-rules"]);
const CONFIG_FILE = GLib.build_filenamev([CONFIG_DIR, "config.json"]);

const DEFAULT_CONFIG = {
    general: {
        frame_width: 4,
        corner_radius: 7,
        offset_left: 4,
        offset_right: 1,
        offset_top: 1,
        offset_bottom: 1,
        active_opacity: 100,
        inactive_opacity: 48,
        glow_enabled: true,
        glow_radius: 5,
        include_maximized: true,
        include_fullscreen: false,
        debug: false
    },
    fallback: {
        enabled: false,
        active_color: "#FFE65C",
        inactive_color: "#5E5726"
    },
    rules: []
};

let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let configMonitor = null;
let configMonitorId = 0;
let windowCreatedId = 0;
let focusChangedId = 0;
let trackedActors = new Map();
let loadSerial = 0;

function logDebug(message) {
    if (config.general && config.general.debug)
        global.log(`[Window Frame Rules] ${message}`);
}

function clamp(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return minimum;
    return Math.max(minimum, Math.min(maximum, number));
}

function mergedConfig(candidate) {
    const result = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (!candidate || typeof candidate !== "object")
        return result;

    if (candidate.general && typeof candidate.general === "object")
        Object.assign(result.general, candidate.general);
    if (candidate.fallback && typeof candidate.fallback === "object")
        Object.assign(result.fallback, candidate.fallback);
    if (Array.isArray(candidate.rules))
        result.rules = candidate.rules.filter(rule => rule && typeof rule === "object");

    return result;
}

function loadConfigAsync() {
    const serial = ++loadSerial;
    const file = Gio.File.new_for_path(CONFIG_FILE);

    file.load_contents_async(null, (source, result) => {
        if (serial !== loadSerial)
            return;
        try {
            const [, contents] = source.load_contents_finish(result);
            const text = imports.byteArray.toString(contents);
            config = mergedConfig(JSON.parse(text));
            logDebug(`Loaded ${config.rules.length} rules.`);
        } catch (error) {
            config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            global.logError(`[Window Frame Rules] Could not load ${CONFIG_FILE}: ${error}`);
        }
        rescanWindows();
    });
}

function setupConfigMonitor() {
    try {
        const file = Gio.File.new_for_path(CONFIG_FILE);
        configMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
        configMonitorId = configMonitor.connect("changed", (_monitor, _file, _other, eventType) => {
            if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                eventType === Gio.FileMonitorEvent.CREATED ||
                eventType === Gio.FileMonitorEvent.MOVED_IN)
                loadConfigAsync();
        });
    } catch (error) {
        global.logError(`[Window Frame Rules] Config monitor failed: ${error}`);
    }
}

function windowTypeName(metaWindow) {
    const type = metaWindow.get_window_type();
    if (type === Meta.WindowType.NORMAL) return "normal";
    if (type === Meta.WindowType.DIALOG) return "dialog";
    if (type === Meta.WindowType.MODAL_DIALOG) return "modal_dialog";
    if (type === Meta.WindowType.UTILITY) return "utility";
    if (type === Meta.WindowType.MENU) return "menu";
    if (type === Meta.WindowType.TOOLBAR) return "toolbar";
    if (type === Meta.WindowType.SPLASHSCREEN) return "splashscreen";
    return "other";
}

function contains(haystack, needle) {
    if (!needle)
        return true;
    return String(haystack || "").toLowerCase().includes(String(needle).toLowerCase());
}

function exact(haystack, needle) {
    if (!needle)
        return true;
    return String(haystack || "").toLowerCase() === String(needle).toLowerCase();
}

function ruleMatches(rule, metaWindow) {
    if (rule.enabled === false)
        return false;

    const title = metaWindow.get_title() || "";
    const wmClass = metaWindow.get_wm_class() || "";
    const wmInstance = metaWindow.get_wm_class_instance() || "";
    const typeName = windowTypeName(metaWindow);

    if (!contains(title, rule.title_contains)) return false;
    if (!contains(wmClass, rule.class_contains)) return false;
    if (!contains(wmInstance, rule.instance_contains)) return false;
    if (!exact(title, rule.title_exact)) return false;
    if (!exact(wmClass, rule.class_exact)) return false;

    if (Array.isArray(rule.window_types) && rule.window_types.length > 0 &&
        !rule.window_types.includes(typeName))
        return false;

    return true;
}

function matchingRule(metaWindow) {
    const rules = config.rules
        .filter(rule => ruleMatches(rule, metaWindow))
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    return rules.length > 0 ? rules[0] : null;
}

function styleFor(metaWindow, focused) {
    const rule = matchingRule(metaWindow);
    if (!rule && !(config.fallback && config.fallback.enabled))
        return null;

    const source = rule || config.fallback;
    const general = config.general || DEFAULT_CONFIG.general;

    const width = clamp(source.frame_width ?? general.frame_width, 1, 40);
    const radius = clamp(source.corner_radius ?? general.corner_radius, 0, 80);
    const color = focused
        ? (source.active_color || "#00DDFF")
        : (source.inactive_color || source.active_color || "#145363");
    const opacityPercent = focused
        ? clamp(source.active_opacity ?? general.active_opacity, 0, 100)
        : clamp(source.inactive_opacity ?? general.inactive_opacity, 0, 100);
    const glowEnabled = source.glow_enabled ?? general.glow_enabled;
    const glowRadius = clamp(source.glow_radius ?? general.glow_radius, 0, 50);
    const glow = glowEnabled && glowRadius > 0
        ? `box-shadow: inset 0 0 ${glowRadius}px ${color};`
        : "box-shadow: none;";

    return {
        width,
        radius,
        opacity: Math.round(opacityPercent * 2.55),
        css: `border: ${width}px solid ${color}; border-radius: ${radius}px; background-color: transparent; ${glow}`,
        rule
    };
}

function offsetsFor(rule) {
    const general = config.general || DEFAULT_CONFIG.general;
    return {
        left: clamp(rule?.offset_left ?? general.offset_left, -50, 50),
        right: clamp(rule?.offset_right ?? general.offset_right, -50, 50),
        top: clamp(rule?.offset_top ?? general.offset_top, -50, 50),
        bottom: clamp(rule?.offset_bottom ?? general.offset_bottom, -50, 50)
    };
}

function shouldSuppress(metaWindow) {
    const general = config.general || DEFAULT_CONFIG.general;
    if (!general.include_fullscreen && metaWindow.is_fullscreen())
        return true;
    if (!general.include_maximized && metaWindow.get_maximized() !== Meta.MaximizeFlags.NONE)
        return true;
    return false;
}

function updateFrame(actor) {
    const tracked = trackedActors.get(actor);
    if (!tracked)
        return;

    const {frame, metaWindow} = tracked;
    const focused = global.display.focus_window === metaWindow;
    const style = styleFor(metaWindow, focused);

    if (!style || shouldSuppress(metaWindow)) {
        frame.hide();
        return;
    }

    const rect = metaWindow.get_frame_rect();
    const [actorX, actorY] = actor.get_position();
    const offsets = offsetsFor(style.rule);

    const x = rect.x - actorX - offsets.left;
    const y = rect.y - actorY - offsets.top;
    const width = Math.max(1, rect.width + offsets.left + offsets.right);
    const height = Math.max(1, rect.height + offsets.top + offsets.bottom);

    frame.set_position(x, y);
    frame.set_size(width, height);
    frame.set_style(style.css);
    frame.opacity = style.opacity;
    frame.show();
}

function updateAllFrames() {
    for (const actor of trackedActors.keys())
        updateFrame(actor);
}

function removeFrame(actor) {
    const tracked = trackedActors.get(actor);
    if (!tracked)
        return;

    for (const id of tracked.actorSignals) {
        try { actor.disconnect(id); } catch (_error) {}
    }
    for (const id of tracked.windowSignals) {
        try { tracked.metaWindow.disconnect(id); } catch (_error) {}
    }
    try { tracked.frame.destroy(); } catch (_error) {}
    trackedActors.delete(actor);
}

function addFrame(actor) {
    if (!actor || trackedActors.has(actor))
        return;

    const metaWindow = actor.get_meta_window();
    if (!metaWindow)
        return;

    const frame = new St.Widget({
        style_class: "window-frame-rules-frame",
        reactive: false,
        can_focus: false,
        track_hover: false
    });

    actor.add_child(frame);
    actor.set_child_above_sibling(frame, null);

    const actorSignals = [
        actor.connect("notify::width", () => updateFrame(actor)),
        actor.connect("notify::height", () => updateFrame(actor)),
        actor.connect("notify::x", () => updateFrame(actor)),
        actor.connect("notify::y", () => updateFrame(actor)),
        actor.connect("destroy", () => removeFrame(actor))
    ];

    const windowSignals = [
        metaWindow.connect("notify::title", () => updateFrame(actor)),
        metaWindow.connect("notify::maximized-horizontally", () => updateFrame(actor)),
        metaWindow.connect("notify::maximized-vertically", () => updateFrame(actor)),
        metaWindow.connect("notify::fullscreen", () => updateFrame(actor))
    ];

    trackedActors.set(actor, {frame, metaWindow, actorSignals, windowSignals});
    updateFrame(actor);
}

function rescanWindows() {
    const actors = global.get_window_actors();
    for (const actor of actors)
        addFrame(actor);
    updateAllFrames();
}

function init(_metadata) {}

function enable() {
    loadConfigAsync();
    setupConfigMonitor();
    rescanWindows();

    windowCreatedId = global.display.connect("window-created", (_display, metaWindow) => {
        const actor = metaWindow.get_compositor_private();
        if (actor)
            addFrame(actor);
    });

    focusChangedId = global.display.connect("notify::focus-window", updateAllFrames);
}

function disable() {
    if (windowCreatedId) {
        global.display.disconnect(windowCreatedId);
        windowCreatedId = 0;
    }
    if (focusChangedId) {
        global.display.disconnect(focusChangedId);
        focusChangedId = 0;
    }
    if (configMonitor && configMonitorId) {
        try { configMonitor.disconnect(configMonitorId); } catch (_error) {}
        configMonitorId = 0;
    }
    if (configMonitor) {
        try { configMonitor.cancel(); } catch (_error) {}
        configMonitor = null;
    }
    for (const actor of Array.from(trackedActors.keys()))
        removeFrame(actor);
    trackedActors.clear();
}
