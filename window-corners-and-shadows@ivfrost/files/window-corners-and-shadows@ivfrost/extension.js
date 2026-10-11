/**
 * Window Corners and Shadows
 *
 * Rounds every window by attaching a fragment-shader effect to its window
 * actor. Because the shader clips the actor itself, this also rounds windows
 * that paint their own decorations (GTK/GNOME headerbar apps, browsers) - the
 * Muffin/Metacity window theme can only round windows the window manager
 * decorates itself. A drop shadow can be drawn behind each window as well, on a
 * widget of its own, so that it follows the rounded corners.
 *
 * The effect is put on a window when it should be clipped and taken off when it
 * should not - maximized, fullscreen - while the signals that decide that stay
 * connected for as long as the window is tracked, so unmaximizing brings the
 * corners back.
 *
 * Everything the shaders need is handed over as uniforms: an effect is built
 * once per window and thereafter only given numbers, so a window moving,
 * resizing, taking focus or crossing a workspace boundary costs a handful of
 * floats. Writing the geometry into the shader source instead - which is what
 * this used to do - means compiling and re-attaching a fresh effect on every
 * one of those changes, which is both slow and, for the reason set out at
 * repointCorner(), visibly wrong.
 */

const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const St = imports.gi.St;

const EFFECT_NAME = 'rounded-corners-shader';
const SHADER_FILE = 'corner.glsl';

// The shadow the extension draws itself, behind each window. It is a widget of
// its own rather than part of the window's effect, because it has to be painted
// behind the window and outside it, and the window's effect only gets to see
// the window.
const SHADOW_EFFECT_NAME = 'rounded-window-shadow';
const SHADOW_SHADER_FILE = 'shadow.glsl';

// Room left around the window inside the shadow's widget for the shadow to fade
// out in. The widest layer fades over 38px and is pushed down 12, so this has
// to clear both or the shadow would be cut off square at the widget's edge.
const SHADOW_PADDING = 56;

// How heavy the shadow is when the window has focus, and when it does not.
const SHADOW_FOCUSED = 1.0;
const SHADOW_UNFOCUSED = 0.7;

// Window types worth rounding. Everything else - desktop, docks, menus,
// tooltips, popups, splash screens - is deliberately left alone.
const ROUNDED_TYPES = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.UTILITY,
];

// Bound to settings-schema.json through ExtensionSettings below.
const state = {
    radius: 12,
    round_maximized: false,
    border_width: 1,
    custom_shadow: true,
};

let settings = null;

// {declarations, code} for each shader, as Cogl snippets want them. Null when
// the file could not be read.
let cornerShader = null;
let shadowShader = null;

// actor -> {win, ids, shadow} - so the connections and the shadow actor can be
// undone on destroy/disable.
const tracked = new Map();
let globalIds = [];

// Every shadow actor that is meant to be there. Kept as the actors are made
// rather than worked out from `tracked` afterwards: a shadow is inserted into
// the window group before the entry that will own it mentions it, and anything
// that sweeps in between - a restack, which inserting an actor can cause -
// would otherwise throw away the shadow that is being created.
const liveShadows = new Set();

// True while the workspaces are sliding, when the shadows are held back.
let switching = false;
let switchSettleId = 0;
let switchTickId = 0;
let driftCheckId = 0;

/**
 * Read a shader and split it the way add_glsl_snippet wants it.
 *
 * A Cogl snippet is not a whole shader: everything above main() is spliced into
 * the generated shader's global scope - uniforms and helper functions - and the
 * body of main() is run at the end of the generated fragment shader, once Cogl
 * has already sampled the actor. So the two halves are wanted separately, and
 * the file is written as a normal-looking shader that is split on the way in.
 */
function readShader(name) {
    const [ok, bytes] = GLib.file_get_contents(__dirname + '/' + name);
    if (!ok)
        throw new Error('could not read ' + name);

    const source = new TextDecoder().decode(bytes);

    // Anchored to the start of a line so a mention of main() in a comment
    // cannot be mistaken for the definition.
    const at = source.search(/^void\s+main\s*\([^)]*\)/m);
    if (at === -1)
        throw new Error('no main() in ' + name);

    const declarations = source.slice(0, at).trim();

    const open = source.indexOf('{', at);
    const close = source.lastIndexOf('}');
    if (open === -1 || close < open)
        throw new Error('unterminated main() in ' + name);

    return {declarations, code: source.slice(open + 1, close).trim()};
}

/**
 * The effect that rounds a window.
 *
 * Uniform locations are looked up once, on the pipeline this instance paints
 * with, and kept: the lookup is the expensive part of setting a uniform, and
 * these are set on every frame a window is moving.
 */
const CornerEffect = GObject.registerClass({
    // A fresh name each time the file is evaluated - the same trick
    // BlurCinnamon uses. Without it, re-enabling the extension throws "type name
    // already registered", because the old class is still registered with GObject.
    GTypeName: 'RwcCornerEffect_' + Math.floor(Math.random() * 1000000),
}, class CornerEffect extends Cinnamon.GLSLEffect {
    _init(params) {
        super._init(params);

        this._bounds = this.get_uniform_location('bounds');
        this._fboOrigin = this.get_uniform_location('fboOrigin');
        this._fboSize = this.get_uniform_location('fboSize');
        this._radius = this.get_uniform_location('radius');
        this._borderWidth = this.get_uniform_location('borderWidth');
        this._shadowDepth = this.get_uniform_location('shadowDepth');
        this._clipOwnShadow = this.get_uniform_location('clipOwnShadow');
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cinnamon.SnippetHook.FRAGMENT,
                              cornerShader.declarations, cornerShader.code,
                              false);
    }

    /**
     * Re-point the shader at the buffer it is about to paint through.
     *
     * See repointCorner(): the buffer's size is not stable, it is not announced,
     * and this is the only moment at which it is knowable rather than guessed.
     */
    vfunc_paint_target(paint_context) {
        if (this.actor)
            repointCorner(this.actor, this);
        super.vfunc_paint_target(paint_context);
    }

    /**
     * Point the effect at a window.
     *
     * `frame` is the window's rectangle and `buffer` the offscreen rectangle
     * Clutter renders it into, both on the stage in pixels; the shader needs
     * both to know where the window sits inside the texture it is handed.
     */
    setGeometry(frame, buffer, shadowDepth, clipOwnShadow) {
        this.set_uniform_float(this._bounds, 4,
            [frame.x, frame.y, frame.x + frame.width, frame.y + frame.height]);
        this.set_uniform_float(this._fboOrigin, 2, [buffer.x, buffer.y]);
        this.set_uniform_float(this._fboSize, 2, [buffer.width, buffer.height]);
        this.set_uniform_float(this._radius, 1, [state.radius]);
        this.set_uniform_float(this._borderWidth, 1, [state.border_width]);
        this.set_uniform_float(this._shadowDepth, 1, [shadowDepth]);
        this.set_uniform_float(this._clipOwnShadow, 1, [clipOwnShadow]);
    }
});

/** The effect that draws a window's shadow, on the widget behind it. */
const ShadowEffect = GObject.registerClass({
    GTypeName: 'RwcShadowEffect_' + Math.floor(Math.random() * 1000000),
}, class ShadowEffect extends Cinnamon.GLSLEffect {
    _init(params) {
        super._init(params);

        this._boxSize = this.get_uniform_location('boxSize');
        this._windowRect = this.get_uniform_location('windowRect');
        this._radius = this.get_uniform_location('cornerRadius');
        this._strength = this.get_uniform_location('shadowStrength');
    }

    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cinnamon.SnippetHook.FRAGMENT,
                              shadowShader.declarations, shadowShader.code,
                              false);
    }

    setGeometry(boxWidth, boxHeight, rect, radius, strength) {
        this.set_uniform_float(this._boxSize, 2, [boxWidth, boxHeight]);
        this.set_uniform_float(this._windowRect, 4, rect);
        this.set_uniform_float(this._radius, 1, [radius]);
        this.set_uniform_float(this._strength, 1, [strength]);
    }
});

function init() {
    try {
        cornerShader = readShader(SHADER_FILE);
    } catch (e) {
        global.logError('[rounded-corners] ' + e);
        cornerShader = null;
    }

    // A missing shadow shader is not fatal: the windows just keep the shadows
    // their own toolkits drew.
    try {
        shadowShader = readShader(SHADOW_SHADER_FILE);
    } catch (e) {
        global.logError('[rounded-corners] ' + e);
        shadowShader = null;
    }
}

/**
 * Destroy any shadow actors already in the window group.
 *
 * They can only be left over from an earlier run of this extension - a reload
 * that did not get to clean up, or a disable that was interrupted - and they do
 * not go away on their own: an orphaned shadow carries on being painted, as a
 * halo around a window that is not there. Sweeping them on the way in is what
 * keeps a reload from stacking another set on top of the last.
 *
 * Only run on the way in and the way out. It walks the entire stage - every
 * panel, applet and widget, not just windows, which is close to two thousand
 * actors here - and it used to run on every restack as well, which is every
 * raise, every focus change and every window opening.
 */
function sweepStrayShadows() {
    let swept = 0;

    // Walked rather than listed: a shadow lives in whichever container its
    // window does, and those hang off the window group rather than being it.
    const walk = (node) => {
        let children;
        try {
            children = node.get_children();
        } catch (e) {
            return;
        }
        for (const child of children) {
            try {
                if (child.get_effect(SHADOW_EFFECT_NAME)) {
                    if (!liveShadows.has(child)) {
                        // Destroyed, not tidied first: dropping the constraints
                        // by hand can throw - a constraint pointing at a window
                        // actor that has already gone does - and then the actor
                        // is never destroyed at all, which is how a stray
                        // survives being swept, and the sweep after it too.
                        // Destroying takes the constraints with it.
                        child.destroy();
                        swept++;
                    }
                    continue;
                }
            } catch (e) {
                // Already gone, or not ours to touch.
            }
            walk(child);
        }
    };
    // From the stage, not the window group: a stray can only be somewhere the
    // extension has put one, but it might have been put in a container that
    // hangs off the stage rather than off the window group - which is where an
    // earlier version of this left them.
    walk(global.stage);

    return swept;
}

function enable() {
    if (!cornerShader)
        return;

    const swept = sweepStrayShadows();
    if (swept > 0)
        global.log('[rounded-corners] swept ' + swept + ' stray shadow actor(s)');

    settings = new Settings.ExtensionSettings(state, __meta.uuid);
    settings.bind('radius', 'radius', refresh);
    settings.bind('round-maximized', 'round_maximized', refresh);
    settings.bind('border-width', 'border_width', refresh);
    settings.bind('custom-shadow', 'custom_shadow', refresh);

    // Windows that are already open.
    for (const actor of global.get_window_actors())
        track(actor);

    // Windows opened (or re-mapped, e.g. unminimized) from now on.
    globalIds.push([
        global.window_manager,
        global.window_manager.connect('map', (_wm, actor) => track(actor)),
    ]);
    globalIds.push([
        global.window_manager,
        global.window_manager.connect('destroy', (_wm, actor) => untrack(actor)),
    ]);

    driftCheckId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, driftCheck);

    // Raising a window reorders the compositor's actors, and the shadows are
    // not among them, so they end up in the wrong place in the order - above
    // windows they should be behind, darkening them. Re-asserting on every
    // restack keeps each shadow directly behind its own window.
    globalIds.push([
        global.display,
        global.display.connect('restacked', () => restackShadows()),
    ]);

    // The shadows are deliberately left alone while the workspaces slide. This
    // used to take them all away for the animation and put them back when it
    // was over, on the assumption that a slide moves the container holding the
    // windows rather than the windows themselves - which would leave each
    // shadow standing where its window used to be. That is not what happens
    // here: window actors are children of the window group, and the slide moves
    // them directly, so the constraints that place each shadow follow it. All
    // hiding them achieved was making them blink out and redraw on every
    // switch, as if the extension had just been re-enabled.
    globalIds.push([
        global.window_manager,
        global.window_manager.connect('switch-workspace', () => {
            // Still arms the per-frame pass that keeps the corner effects
            // pointed at their windows through the slide. The shadows need no
            // such help: their constraints follow the actors, which the slide
            // moves directly.
            switching = true;
            keepUpDuringSwitch();

            if (switchSettleId)
                GLib.source_remove(switchSettleId);
            switchSettleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                switchSettleId = 0;
                switching = false;

                // One pass each, from where the windows have actually come to
                // rest. This used to drop every cached shader source and
                // rebuild the lot, which compiled a shader per window inside a
                // single frame - the stall at the end of a workspace switch.
                refresh();
                return GLib.SOURCE_REMOVE;
            });
        }),
    ]);
}

/**
 * Re-point the corner effects every frame while the workspaces are sliding.
 *
 * A slide does not move the window actors: it moves the container that holds
 * them, so the actors' own positions never change and no signal announces that
 * anything happened. What the shader is given is stage coordinates, though, and
 * the actor's *transformed* position does follow the slide - so without this the
 * border is drawn where the window was a moment ago for the length of the whole
 * animation, and then snaps. A few floats per window per frame is affordable
 * now; the shader recompile it would have cost before is not.
 *
 * Re-arms itself until the switch settles.
 */
function keepUpDuringSwitch() {
    switchTickId = 0;
    if (!switching)
        return;

    for (const actor of global.get_window_actors()) {
        if (actor.visible)
            updateCorner(actor);
    }

    switchTickId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, keepUpDuringSwitch);
}

/**
 * Put every shadow back directly behind the window it belongs to, and clear
 * away any that no longer have one.
 *
 * The clearing matters as much as the ordering: a shadow whose window has gone
 * keeps painting, and being larger than the window it belonged to it darkens
 * whatever is underneath - another window, most visibly. A window going away
 * normally restacks, so this is a prompt enough place to notice.
 */
function restackShadows() {
    for (const [actor, entry] of Array.from(tracked)) {
        // A window that went away before this extension could connect to its
        // actor never announced its own destroy, and would otherwise keep its
        // entry - and its shadow - for as long as Cinnamon runs. An actor with
        // no parent is one that has gone: windows on other workspaces are
        // hidden, not unparented.
        if (!actor.get_parent()) {
            untrack(actor);
            continue;
        }
        // Rebuilt rather than placed if it is no longer bound to this actor: a
        // shadow whose constraints have been dropped is nothing by nothing and
        // can never be placed again.
        if (entry.shadow && !shadowFollows(entry.shadow, actor))
            destroyShadow(entry);

        if (entry.shadow && entry.shadow.visible)
            placeShadow(actor, entry.shadow);
    }
}

function disable() {
    // Each actor is released on its own: one that has already gone - a window
    // that was destroyed while we were not looking - must not stop the rest
    // from being cleaned up, or its shadow would be left painted.
    for (const actor of Array.from(tracked.keys())) {
        try {
            untrack(actor);
        } catch (e) {
            global.logError('[rounded-corners] untrack failed: ' + e);
        }
    }
    tracked.clear();

    // Whatever the loop above could not reach.
    sweepStrayShadows();

    for (const [obj, id] of globalIds) {
        try {
            obj.disconnect(id);
        } catch (e) {
            // Already gone.
        }
    }
    globalIds = [];

    if (switchSettleId) {
        GLib.source_remove(switchSettleId);
        switchSettleId = 0;
    }

    if (switchTickId) {
        Meta.later_remove(switchTickId);
        switchTickId = 0;
    }

    if (driftCheckId) {
        GLib.source_remove(driftCheckId);
        driftCheckId = 0;
    }
    switching = false;

    if (settings) {
        if (typeof settings.finalize === 'function')
            settings.finalize();
        else if (typeof settings.destroy === 'function')
            settings.destroy();
        settings = null;
    }
}

/**
 * Start tracking a window actor: connect the signals that can change how it
 * should be rounded, then bring it up to date. Safe to call repeatedly.
 */
function track(actor) {
    if (!actor)
        return;

    const win = actor.meta_window;
    if (!win)
        return;

    if (!tracked.has(actor)) {
        const ids = [];

        // The actor resizes (and its shadow padding shifts) as the window is
        // moved and resized, which moves the visible rect inside it.
        ids.push([actor, actor.connect('notify::size', () => scheduleUpdate(actor))]);
        ids.push([actor, actor.connect('notify::position', () => scheduleUpdate(actor))]);

        // The actor's own destroy, which is where Cinnamon's window manager
        // listens for windows going away. The window manager's own 'destroy'
        // signal does not carry the actor, so a window closed without this
        // leaves its entry - and its shadow - behind for good.
        ids.push([actor, actor.connect('destroy', () => untrack(actor))]);

        // The shadow actor is placed and sized by constraints, which follow the
        // window but not a transform applied to it. So while the window is
        // being scaled - the minimize animation, expo - or hidden, the shadow
        // is taken away rather than left standing at its full size behind a
        // window that is no longer there.
        for (const prop of ['notify::scale-x', 'notify::scale-y', 'notify::visible']) {
            try {
                ids.push([actor, actor.connect(prop, () => scheduleUpdate(actor))]);
            } catch (e) {
                // Property not present; the window would just keep its shadow
                // through that animation.
            }
        }

        for (const prop of [
            'notify::fullscreen',
            'notify::maximized-horizontally',
            'notify::maximized-vertically',
            // Muffin gives a focused window a larger shadow than an unfocused
            // one, and the shadow is part of the paint volume the offscreen
            // buffer is sized from - so the buffer, and with it the mapping
            // from texture coordinates to the window, changes the moment focus
            // does, on a window that has not moved at all. Without this the
            // stroke keeps the focused geometry and slides inwards as soon as
            // the window is no longer focused.
            'notify::appears-focused',
            'size-changed',
            'position-changed',
        ]) {
            try {
                ids.push([win, win.connect(prop, () => scheduleUpdate(actor))]);
            } catch (e) {
                // Property not present in this Muffin version; not fatal,
                // the actor size signal still covers most state changes.
            }
        }

        tracked.set(actor, {win, ids, shadow: null});
    }

    scheduleUpdate(actor);
}

function untrack(actor) {
    if (!actor)
        return;

    if (actor._rwcSettleId) {
        GLib.source_remove(actor._rwcSettleId);
        actor._rwcSettleId = 0;
    }

    if (actor._rwcUpdateId) {
        Meta.later_remove(actor._rwcUpdateId);
        actor._rwcUpdateId = 0;
    }

    const entry = tracked.get(actor);
    if (entry) {
        for (const [obj, id] of entry.ids) {
            try {
                obj.disconnect(id);
            } catch (e) {
                // Object already destroyed.
            }
        }
        destroyShadow(entry);
        tracked.delete(actor);
    }

    removeEffect(actor);
}

/**
 * Create the actor this window's shadow is drawn on.
 *
 * It sits behind the window in the window group, and its geometry is bound to
 * the window actor's - four constraints, one per coordinate - so it follows the
 * window around, onto other workspaces and through everything else, without the
 * extension having to chase move and resize signals for it.
 *
 * It carries a background because an actor with nothing painted on it has no
 * effect applied to it at all. The background is never seen: the shadow shader
 * writes the fragment itself, alpha included, so where the shadow is not, the
 * actor paints nothing.
 */
function createShadow(actor) {
    if (!shadowShader)
        return null;

    const shadow = new St.Widget({reactive: false, style: 'background: black;'});
    liveShadows.add(shadow);

    // The effect goes on before anything is set on it. A uniform set on an
    // effect that is not on an actor yet does not reach the shader, so the
    // attach has to come first and the geometry after.
    shadow.add_effect_with_name(SHADOW_EFFECT_NAME, new ShadowEffect());

    // Parented into the window group, behind the window. Not to the window's own
    // container: a workspace container allocates only the windows in it, so a
    // widget parented there is never allocated and collapses to nothing. The
    // constraints below work in the coordinates of the actor's parent either
    // way, and a window on the active workspace has the same coordinates in
    // both, because its container sits at the origin.
    placeShadow(actor, shadow);

    for (let i = 0; i < 4; i++)
        shadow.add_constraint(new Clutter.BindConstraint({source: actor, coordinate: i, offset: 0}));

    return shadow;
}

function destroyShadow(entry) {
    if (!entry.shadow)
        return;

    // Straight to destroy: a constraint whose source has already gone throws
    // when it is removed by hand, which would skip the destroy below and leave
    // the actor painted. Destroying takes the constraints with it.
    liveShadows.delete(entry.shadow);
    try {
        entry.shadow.destroy();
    } catch (e) {
        global.logError('[rounded-corners] could not destroy a shadow: ' + e);
    }
    entry.shadow = null;
}

/** Whether a shadow is still bound to this window actor. */
function shadowFollows(shadow, actor) {
    try {
        const constraints = shadow.get_constraints();
        if (constraints.length !== 4)
            return false;
        for (const constraint of constraints) {
            if (constraint.source !== actor)
                return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Put a shadow in the window group, directly behind its window.
 *
 * Does nothing when the shadow is already in the right place. That matters more
 * than it looks: this runs for every window on every restack, and moving an
 * actor within its container is itself a restack - so an unconditional
 * re-insert would feed the restack handler it is called from.
 */
function placeShadow(actor, shadow) {
    try {
        const group = global.windowGroup;

        if (shadow.get_parent() !== group) {
            group.insert_child_below(shadow, actor);
            return;
        }

        const children = group.get_children();
        const at = children.indexOf(actor);
        if (at > 0 && children[at - 1] === shadow)
            return;

        group.set_child_below_sibling(shadow, actor);
    } catch (e) {
        // Not fatal: the shadow is simply painted in the wrong place or order.
    }
}

/**
 * Bring a window's shadow up to date, or take it away.
 *
 * Only ever sets uniforms; the effect itself is built once, with the widget.
 */
function updateShadow(actor, entry, frame, roundable) {
    const win = entry.win;

    // A window that is scaled or hidden - minimizing, in the expo view - is not
    // where its shadow would be drawn: the shadow sits square under the window's
    // own geometry, and the constraints that place it do not follow a transform.
    const transformed = Math.abs(actor.scale_x - 1) > 0.01 ||
                        Math.abs(actor.scale_y - 1) > 0.01;

    const wanted = roundable && state.custom_shadow &&
                   !win.minimized && actor.visible && !transformed;

    // The actor this entry was made for may be gone. Muffin replaces a window's
    // actor when the window moves between workspaces, and the constraints a
    // shadow holds on that actor are dropped with it - leaving a shadow that is
    // nothing by nothing, that can never be placed again, and that a sweep is
    // right to leave alone because the entry still claims it. Drop the entry
    // with the actor, and rebuild the shadow if this one no longer follows it.
    if (!actor.get_parent()) {
        untrack(actor);
        return;
    }
    if (entry.shadow && !shadowFollows(entry.shadow, actor))
        destroyShadow(entry);

    if (!entry.shadow) {
        if (!wanted)
            return;
        entry.shadow = createShadow(actor);
        if (!entry.shadow)
            return;                    // no shadow shader available
    }

    if (!wanted) {
        entry.shadow.visible = false;
        return;
    }

    const boxWidth = frame.width + 2 * SHADOW_PADDING;
    const boxHeight = frame.height + 2 * SHADOW_PADDING;

    // The widget covers the window plus the padding, so its offsets are the
    // window's frame expressed relative to the actor's own allocation. That is
    // the window's shadow padding, and it is taken from the two rects rather
    // than from the actor's position, because on another workspace the actor is
    // positioned by that workspace's layout while both rects are not - so the
    // difference between them stays the "inside the actor" offset it should be.
    const buffer = win.get_buffer_rect();
    const offsets = [
        (frame.x - buffer.x) - SHADOW_PADDING,
        (frame.y - buffer.y) - SHADOW_PADDING,
        boxWidth - actor.width,
        boxHeight - actor.height,
    ];
    const constraints = entry.shadow.get_constraints();
    for (let i = 0; i < 4 && i < constraints.length; i++) {
        if (constraints[i] instanceof Clutter.BindConstraint)
            constraints[i].offset = offsets[i];
    }

    entry.shadow.visible = true;

    const effect = entry.shadow.get_effect(SHADOW_EFFECT_NAME);
    if (effect) {
        effect.setGeometry(
            boxWidth, boxHeight,
            [SHADOW_PADDING, SHADOW_PADDING,
             SHADOW_PADDING + frame.width, SHADOW_PADDING + frame.height],
            state.radius,
            win.appears_focused ? SHADOW_FOCUSED : SHADOW_UNFOCUSED);
    }

    // Re-assert where it lives and where it sits. The window may have moved to
    // another workspace, and the containers get restacked whenever windows are
    // raised, so the shadow drifts both out of the right parent and out of its
    // place directly behind the window. placeShadow() is a no-op when it is
    // already right, so this costs a comparison rather than a restack.
    placeShadow(actor, entry.shadow);
}

/**
 * Bring a window's effect up to date: now, again before the next frame is
 * painted, and once more shortly afterwards.
 *
 * The pass that happens **now** is the one that matters most, and it is not an
 * optimisation to be traded away. The offscreen buffer the shader reads is
 * sized from the window's paint volume, and that changes on things that do not
 * move the window at all - focus above all, because Muffin gives a focused
 * window a larger shadow. Deferring even to the next frame's before-redraw
 * leaves the shader mapping texture coordinates through the size the buffer
 * used to be, and since that mapping is what places the corner, the corner
 * lurches for exactly one frame and then settles. Measured on a client-side-
 * decorated window, which has the largest shadow to begin with: 23964 of 32000
 * pixels in the crop changed in that one frame when the update was deferred,
 * and 11 when it was not.
 *
 * The before-redraw pass then re-reads once the frame's other work is done, and
 * the delayed pass catches geometry that was still moving when it was read -
 * while a window is being dragged or resized its frame rect and its actor
 * allocation are briefly out of step, and bounds read at that moment do not
 * line up with the window. Both are a handful of floats now, where any of this
 * used to mean rebuilding a shader.
 */
function scheduleUpdate(actor) {
    update(actor);

    if (!actor._rwcUpdateId) {
        actor._rwcUpdateId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
            actor._rwcUpdateId = 0;
            update(actor);
        });
    }

    if (actor._rwcSettleId)
        return;

    actor._rwcSettleId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        actor._rwcSettleId = 0;
        update(actor);
        return GLib.SOURCE_REMOVE;
    });
}

function update(actor) {
    const win = actor.meta_window;
    if (!win)
        return;

    const roundable = ROUNDED_TYPES.indexOf(win.get_window_type()) !== -1 && shouldClip(win);
    const windowRect = win.get_frame_rect();

    // The shadow is dealt with first and on every path, so that a window that
    // stops being rounded - maximized, minimized - also stops casting the
    // shadow the extension drew for it. It is given the rects as Meta reports
    // them, because that is where the offsets between them come from.
    const entry = tracked.get(actor);
    if (entry)
        updateShadow(actor, entry, windowRect, roundable);

    updateCorner(actor, win, roundable, windowRect);
}

/**
 * Work out what a window's corner effect should be pointed at, or null if the
 * window should not be clipped at all.
 *
 * What the shader is given is where the window is on screen right now. Both
 * rects Meta reports are relative to the monitor and neither follows a
 * workspace slide - the actor is what moves - so the frame is placed where the
 * actor currently is, by its own offset inside it. Without this the window's
 * rectangle and the buffer it is measured against drift apart while the
 * workspaces slide and the border is drawn somewhere else.
 */
function cornerGeometry(actor, win, roundable, windowRect) {
    if (!win)
        win = actor.meta_window;
    if (!win)
        return null;

    if (roundable === undefined)
        roundable = ROUNDED_TYPES.indexOf(win.get_window_type()) !== -1 && shouldClip(win);
    if (!roundable)
        return null;

    if (!windowRect)
        windowRect = win.get_frame_rect();

    const [actorX, actorY] = actor.get_transformed_position();
    const bufferRect = win.get_buffer_rect();
    const frame = {
        x: actorX + (windowRect.x - bufferRect.x),
        y: actorY + (windowRect.y - bufferRect.y),
        width: windowRect.width,
        height: windowRect.height,
    };
    const buffer = effectBuffer(actor, actorX, actorY);

    // A window parked on another workspace is positioned by that workspace's
    // layout, while its frame rect stays relative to the monitor, so the two
    // describe different places and the buffer comes out somewhere arbitrary.
    // Such a window is not on screen: leave it alone rather than drawing a
    // border across whatever the geometry happens to land on.
    if (buffer.x > frame.x || buffer.y > frame.y ||
        buffer.x + buffer.width < frame.x + frame.width ||
        buffer.y + buffer.height < frame.y + frame.height)
        return null;

    // Room for the window's shadow, measured from the frame out to the edge of
    // the buffer. The shader needs it to put the shadow back into the corners
    // it cuts away.
    const shadowDepth = Math.max(0, Math.min(
        frame.x - buffer.x,
        frame.y - buffer.y,
        buffer.x + buffer.width - (frame.x + frame.width),
        buffer.y + buffer.height - (frame.y + frame.height),
    ));

    // With a shadow of the extension's own behind the window, the window's own
    // is dropped: two shadows would double up, and the window's own is square
    // where the window is rounded, so its corners would show through the very
    // corners being rounded. Without one, it is kept, and put back into the
    // corners the clip cuts away.
    const custom = state.custom_shadow && shadowShader ? 1 : 0;

    return {frame, buffer, shadowDepth: custom ? 0 : shadowDepth, custom};
}

/** Point a window's corner effect at where the window is now, attaching it if needed. */
function updateCorner(actor, win, roundable, windowRect) {
    const geometry = cornerGeometry(actor, win, roundable, windowRect);
    const effect = actor.get_effect(EFFECT_NAME);

    if (!geometry) {
        if (effect)
            removeEffect(actor);
        return;
    }

    let target = effect;
    if (!target) {
        target = new CornerEffect();
        // Attached before its uniforms go in: a value set on an effect that is
        // not yet on an actor does not reach the shader.
        actor.add_effect_with_name(EFFECT_NAME, target);
    }

    target.setGeometry(geometry.frame, geometry.buffer,
                       geometry.shadowDepth, geometry.custom);
}

/**
 * Point a window's corner effect at where the window is *right now*, from inside
 * that window's own paint.
 *
 * `fboOrigin` and `fboSize` are how the shader turns a texture coordinate into a
 * screen position, so they have to describe the buffer Clutter allocated for
 * *this* paint. That buffer is sized from the window's paint volume, and a
 * client-side-decorated window's volume is not stable: Muffin gives a focused
 * window a larger shadow, and a window that draws its own decorations - Nemo,
 * System Settings, anything GTK - carries shadow margins of its own and so gets
 * a Muffin shadow on top of them. Measured on System Settings: the frame rect
 * and the buffer rect do not move at all across a focus change, but the paint
 * volume goes 642x442 <-> 654x454. A plain window is 700x700 either way, which
 * is why only these flicker.
 *
 * Twelve pixels of buffer size is twelve pixels of clip: the window is cut
 * through the size the buffer used to be, so its edge jumps inwards for a frame
 * and back. Nothing announces the change - the focus signal arrives first and
 * the volume catches up a frame later - so working it out in an update handler
 * is a race however early that handler runs. Doing it here is not a race: this
 * is the paint whose buffer it is.
 *
 * Uniforms only. Creating or removing an effect from inside its own paint is not
 * something to do, and the update path has already decided whether this window
 * should have one.
 */
function repointCorner(actor, effect) {
    const geometry = cornerGeometry(actor);
    if (geometry)
        effect.setGeometry(geometry.frame, geometry.buffer,
                           geometry.shadowDepth, geometry.custom);
}

/**
 * The rectangle Clutter renders the actor into for this effect, on the stage.
 *
 * The shader never sees the window's own pixels: Clutter paints the actor into
 * an offscreen buffer and runs the shader over that, so the texture coordinate
 * is normalised over the buffer rather than over the window. Clutter sizes the
 * buffer from the actor's paint volume - which is the window *plus its shadow*,
 * and so is a good deal larger than the window for any window that casts a
 * shadow - and anchors it at the actor's position.
 *
 * That buffer is what makes the mapping in the shader, and it is reproducible:
 * Clutter's _clutter_actor_box_enlarge_for_effects() rounds the size to whole
 * pixels, pulls the far edge out to the next pixel plus three quarters of one,
 * and then places the near edge relative to the far one so that the buffer
 * keeps a stable size as the window moves. The far edge, then, is the actor's
 * position plus the paint volume's size.
 *
 * A null paint volume means Clutter would fall back to the allocation, so the
 * allocation is what we use too. Being a pixel or two out here is harmless:
 * before this was worked out the error ran to tens of pixels.
 */
function effectBuffer(actor, actorX, actorY) {
    const volume = actor.get_paint_volume();
    const width = volume ? volume.get_width() : actor.width;
    const height = volume ? volume.get_height() : actor.height;

    const w = Math.round(width);
    const h = Math.round(height);
    const x2 = Math.ceil(actorX + width + 0.75);
    const y2 = Math.ceil(actorY + height + 0.75);

    return {x: x2 - w - 3, y: y2 - h - 3, width: w + 3, height: h + 3};
}

/**
 * Rebuild any effect whose window has moved without saying so.
 *
 * Windows move in ways nothing announces: sliding a workspace to one side
 * carries its windows along by moving what holds them rather than the actors,
 * and an expo or a minimise animation transforms them. In neither case does the
 * window actor's own position change, so no signal arrives and the effect keeps
 * the geometry it was built with - which is what leaves a window rounded
 * against the wrong rectangle, or not rounded at all, after a workspace switch.
 * Comparing where a window is now with where it was at the last look catches
 * every one of those, for the cost of a subtraction per window twice a second.
 */
function driftCheck() {
    for (const [actor, entry] of Array.from(tracked)) {
        if (!actor.get_parent()) {
            untrack(actor);
            continue;
        }

        const [x, y] = actor.get_transformed_position();
        const pv = actor.get_paint_volume();
        const pvw = pv ? Math.round(pv.get_width()) : -1;
        const pvh = pv ? Math.round(pv.get_height()) : -1;

        const seen = actor._rwcSeen;
        const moved = !seen ||
            Math.abs(x - seen.x) > 0.5 || Math.abs(y - seen.y) > 0.5 ||
            actor.width !== seen.w || actor.height !== seen.h ||
            pvw !== seen.pvw || pvh !== seen.pvh;

        actor._rwcSeen = {x, y, w: actor.width, h: actor.height, pvw, pvh};

        if (moved)
            scheduleUpdate(actor);
    }
    return GLib.SOURCE_CONTINUE;
}

function removeEffect(actor) {
    const effect = actor.get_effect(EFFECT_NAME);
    if (effect)
        actor.remove_effect(effect);
}

/** Re-apply to every window, e.g. after a setting changed. */
function refresh() {
    for (const actor of global.get_window_actors())
        track(actor);
}

/**
 * Fullscreen windows fill the screen, so rounding them would cut into the
 * display. Maximized windows are square by convention, but that is a
 * preference, hence the setting.
 */
function shouldClip(win) {
    if (win.is_fullscreen())
        return false;

    const maximized = win.maximized_horizontally && win.maximized_vertically;
    return state.round_maximized || !maximized;
}
