// Shared helpers: geometry, monitors, pointer, window filters, animation.

const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Gettext = imports.gettext;

var EPS = 0.002;
var UUID = 'cinnamon-tiling@zelimir86';

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + '/locale');

function _(text) {
    return Gettext.dgettext(UUID, text);
}

function log(msg) {
    global.log(`[${UUID}] ${msg}`);
}

function logError(e, msg) {
    global.logError(`[${UUID}] ${msg || ''} ${e && e.message ? e.message : e}\n${e && e.stack ? e.stack : ''}`);
}

function rect(x, y, width, height) {
    return { x, y, width, height };
}

function toRect(r) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function contains(r, x, y) {
    return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

function union(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
        x, y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
}

function intersectArea(a, b) {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return (w > 0 && h > 0) ? w * h : 0;
}

function center(r) {
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function rectsClose(a, b, posTol = 12, sizeTol = 48) {
    if (!a || !b)
        return false;
    return Math.abs(a.x - b.x) <= posTol && Math.abs(a.y - b.y) <= posTol &&
        Math.abs(a.width - b.width) <= sizeTol && Math.abs(a.height - b.height) <= sizeTol;
}

function scaleFactor() {
    try {
        return St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    } catch (e) {
        return global.ui_scale || 1;
    }
}

function monitors() {
    return Main.layoutManager.monitors;
}

function monitorAt(x, y) {
    const mons = monitors();
    for (let i = 0; i < mons.length; i++) {
        if (contains(mons[i], x, y))
            return i;
    }
    return Main.layoutManager.primaryIndex;
}

function monitorGeometry(index) {
    const m = monitors()[index] || Main.layoutManager.primaryMonitor;
    return { x: m.x, y: m.y, width: m.width, height: m.height };
}

function workArea(monitorIndex, workspace) {
    const ws = workspace || global.workspace_manager.get_active_workspace();
    return toRect(ws.get_work_area_for_monitor(monitorIndex));
}

function pointer() {
    const [x, y, mods] = global.get_pointer();
    return { x, y, mods };
}

function modifierPressed(mods, key) {
    const M = Clutter.ModifierType;
    switch (key) {
    case 'ctrl':
        return (mods & M.CONTROL_MASK) !== 0;
    case 'alt':
        return (mods & M.MOD1_MASK) !== 0;
    case 'super':
        return (mods & (M.SUPER_MASK | M.MOD4_MASK)) !== 0;
    case 'shift':
        return (mods & M.SHIFT_MASK) !== 0;
    default:
        return false;
    }
}

function isTileable(win) {
    if (!win)
        return false;
    try {
        if (win.get_window_type() !== Meta.WindowType.NORMAL)
            return false;
        if (win.is_skip_taskbar())
            return false;
        if (win.is_attached_dialog())
            return false;
        if (win.get_transient_for())
            return false;
        // Muffin reports maximized/fullscreen windows as not resizable, so only
        // trust allows_resize() for windows in their normal state.
        const special = win.get_maximized() !== 0 || win.is_fullscreen();
        if (!special && typeof win.allows_resize === 'function' && !win.allows_resize())
            return false;
        return true;
    } catch (e) {
        return false;
    }
}

function frameRect(win) {
    return toRect(win.get_frame_rect());
}

function isMaximized(win) {
    return win.get_maximized() === Meta.MaximizeFlags.BOTH;
}

// Normal windows on a workspace, topmost first.
function workspaceWindows(workspace) {
    const ws = workspace || global.workspace_manager.get_active_workspace();
    let wins = global.display.get_tab_list(Meta.TabList.NORMAL, ws);
    return wins.filter(w => isTileable(w));
}

function stackingOrder(wins) {
    try {
        return global.display.sort_windows_by_stacking(wins);
    } catch (e) {
        return wins;
    }
}

function windowActor(win) {
    try {
        return win.get_compositor_private();
    } catch (e) {
        return null;
    }
}

// Animate an actor if it supports Clutter easing, otherwise set the final values.
function ease(actor, props) {
    const duration = props.duration || 0;
    if (duration > 0 && typeof actor.ease === 'function') {
        actor.remove_all_transitions();
        actor.ease(Object.assign({ mode: Clutter.AnimationMode.EASE_OUT_QUAD }, props));
        return;
    }
    const onComplete = props.onComplete;
    for (const k of ['x', 'y', 'width', 'height', 'opacity', 'scale_x', 'scale_y', 'translation_x', 'translation_y']) {
        if (k in props)
            actor[k] = props[k];
    }
    if (onComplete)
        onComplete();
}

// Every one-shot main loop source is tracked here so disable() can cancel
// whatever is still pending (see clearAllSources()).
var _sources = new Set();

function _oneShot(add, label, fn) {
    let id = 0;
    id = add(() => {
        _sources.delete(id);
        try {
            fn();
        } catch (e) {
            logError(e, label);
        }
        return GLib.SOURCE_REMOVE;
    });
    _sources.add(id);
    return id;
}

function idle(fn) {
    return _oneShot(cb => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, cb), 'idle callback', fn);
}

function timeout(ms, fn) {
    return _oneShot(cb => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, cb), 'timeout callback', fn);
}

// Repeating source; runs until removed with removeSource().
function interval(ms, fn) {
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        try {
            fn();
        } catch (e) {
            logError(e, 'interval callback');
        }
        return GLib.SOURCE_CONTINUE;
    });
    _sources.add(id);
    return id;
}

// Remove a source created with idle()/timeout()/interval(); returns 0 to reset the caller's id.
function removeSource(id) {
    if (id && _sources.has(id)) {
        _sources.delete(id);
        GLib.source_remove(id);
    }
    return 0;
}

function clearAllSources() {
    for (const id of _sources)
        GLib.source_remove(id);
    _sources.clear();
}

// Tracks GObject signal connections so they can be dropped in one call.
var SignalTracker = class SignalTracker {
    constructor() {
        this._conns = [];
    }

    connect(obj, signal, cb) {
        const id = obj.connect(signal, cb);
        this._conns.push([obj, id]);
        return id;
    }

    disconnectObject(obj) {
        this._conns = this._conns.filter(([o, id]) => {
            if (o !== obj)
                return true;
            try {
                o.disconnect(id);
            } catch (e) { /* already gone */ }
            return false;
        });
    }

    disconnectAll() {
        for (const [o, id] of this._conns) {
            try {
                o.disconnect(id);
            } catch (e) { /* already gone */ }
        }
        this._conns = [];
    }
};
