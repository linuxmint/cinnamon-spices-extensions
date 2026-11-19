// Window Cycle Glow
//
// A shortcut (Alt+Esc by default) jumps straight to the next window, in the
// order they were opened, across all workspaces. The window you land on gets a
// soft glowing outline while you're cycling, which fades once you let go of
// the shortcut's modifier keys.

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;

const KEYBINDING_NAME = 'window-cycle-glow';

// The outline is four thin edges, each with a blurred shadow. (One shadow
// around the whole window would be blurred on the CPU at full window size.)
const EDGE_WIDTH = 2;       // px thickness of the colored line
const PADDING = 2;          // px between the window edge and the outline
const GLOW_BLUR = 24;       // px
const GLOW_SPREAD = 3;      // px
const FADE_IN_MS = 120;
const FADE_OUT_MS = 400;
const MIN_VISIBLE_MS = 600; // keep it up at least this long after a jump
const POLL_MS = 50;         // how often to check whether the modifiers are held

let uuid = null;
let settings = null;
let config = {};            // keybinding, borderColor, glowColor (synced from settings)

let glow = null;            // container actor
let edges = null;           // { top, bottom, left, right }
let target = null;          // { actor, destroyId } of the window being outlined
let pollId = 0;
let lastJump = 0;
let heldMask = 0;           // modifiers of the shortcut that triggered the jump

function nowMs() {
    return GLib.get_monotonic_time() / 1000;
}

function edgeStyle() {
    return `background-color: ${config.borderColor};` +
        `box-shadow: 0 0 ${GLOW_BLUR}px ${GLOW_SPREAD}px ${config.glowColor};`;
}

// Taskbar windows on every workspace, in the order they were opened.
function getWindows() {
    return global.display.get_tab_list(Meta.TabList.NORMAL, null)
        .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
}

function cycle(display, window, binding) {
    let windows = getWindows();
    if (windows.length === 0)
        return;

    heldMask = binding ? binding.get_mask() : 0;

    let current = windows.indexOf(global.display.focus_window);
    let next = windows[(current + 1) % windows.length];  // -1 -> first window

    let time = global.get_current_time();
    if (next.is_on_all_workspaces())
        Main.activateWindow(next, time);
    else
        Main.activateWindow(next, time, next.get_workspace().index());

    showGlow(next);
}

function buildGlow() {
    glow = new St.Widget({ reactive: false, opacity: 0, visible: false });
    edges = {};
    for (let side of ['top', 'bottom', 'left', 'right']) {
        edges[side] = new St.Widget({ style: edgeStyle(), reactive: false });
        glow.add_child(edges[side]);
    }
    global.window_group.add_child(glow);
}

function updateStyle() {
    if (!edges)
        return;
    for (let side in edges)
        edges[side].set_style(edgeStyle());
}

function untrack() {
    if (target) {
        target.actor.disconnect(target.destroyId);
        target = null;
    }
    if (glow)
        glow.clear_constraints();
}

function hideNow() {
    if (!glow)
        return;
    glow.remove_all_transitions();
    glow.opacity = 0;
    glow.hide();
    untrack();
}

function showGlow(win) {
    let actor = win.get_compositor_private();
    if (!actor)
        return;
    if (!glow)
        buildGlow();

    untrack();

    // The window actor also covers invisible borders/shadows, so offset from
    // it to the visible frame. Binding to the actor makes the glow follow the
    // window if it slides in from another workspace.
    let frame = win.get_frame_rect();
    let buffer = win.get_buffer_rect();

    // Keep the outline on screen and clear of the panels, so maximized
    // windows get it just inside their edges instead of hidden off-screen.
    let area = win.is_fullscreen()
        ? global.display.get_monitor_geometry(win.get_monitor())
        : win.get_work_area_current_monitor();
    let x1 = Math.max(frame.x - PADDING, area.x);
    let y1 = Math.max(frame.y - PADDING, area.y);
    let x2 = Math.min(frame.x + frame.width + PADDING, area.x + area.width);
    let y2 = Math.min(frame.y + frame.height + PADDING, area.y + area.height);
    let e = EDGE_WIDTH;
    let w = Math.max(x2 - x1, 2 * e);
    let h = Math.max(y2 - y1, 2 * e);

    glow.add_constraint(new Clutter.BindConstraint({
        source: actor, coordinate: Clutter.BindCoordinate.X,
        offset: x1 - buffer.x,
    }));
    glow.add_constraint(new Clutter.BindConstraint({
        source: actor, coordinate: Clutter.BindCoordinate.Y,
        offset: y1 - buffer.y,
    }));
    glow.set_size(w, h);
    edges.top.set_position(0, 0);
    edges.top.set_size(w, e);
    edges.bottom.set_position(0, h - e);
    edges.bottom.set_size(w, e);
    edges.left.set_position(0, e);
    edges.left.set_size(e, h - 2 * e);
    edges.right.set_position(w - e, e);
    edges.right.set_size(e, h - 2 * e);

    target = { actor, destroyId: actor.connect('destroy', () => {
        target = null;
        hideNow();
    }) };

    // Window actors are restacked beneath other children, so this stays on top.
    global.window_group.set_child_above_sibling(glow, null);

    glow.remove_all_transitions();
    glow.show();
    glow.ease({
        opacity: 255,
        duration: FADE_IN_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });

    lastJump = nowMs();
    if (!pollId)
        pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, checkRelease);
}

// Fade out once the shortcut's modifiers are released (and the glow has been
// visible long enough).
function checkRelease() {
    let [, , mods] = global.get_pointer();
    let held = heldMask !== 0 && (mods & heldMask) !== 0;
    if (held || nowMs() - lastJump < MIN_VISIBLE_MS)
        return GLib.SOURCE_CONTINUE;

    pollId = 0;
    if (glow) {
        glow.ease({
            opacity: 0,
            duration: FADE_OUT_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: hideNow,
        });
    }
    return GLib.SOURCE_REMOVE;
}

function bindKey() {
    Main.keybindingManager.removeHotKey(KEYBINDING_NAME);
    Main.keybindingManager.addHotKey(KEYBINDING_NAME, config.keybinding, cycle);
}

function init(metadata) {
    uuid = metadata.uuid;
}

function enable() {
    settings = new Settings.ExtensionSettings(config, uuid);
    settings.bind('keybinding', 'keybinding', bindKey);
    settings.bind('border-color', 'borderColor', updateStyle);
    settings.bind('glow-color', 'glowColor', updateStyle);
    bindKey();
}

function disable() {
    Main.keybindingManager.removeHotKey(KEYBINDING_NAME);
    if (pollId) {
        GLib.source_remove(pollId);
        pollId = 0;
    }
    hideNow();
    if (glow) {
        glow.destroy();
        glow = null;
        edges = null;
    }
    if (settings) {
        settings.finalize();
        settings = null;
    }
}
