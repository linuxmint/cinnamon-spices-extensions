const GLib = imports.gi.GLib;
const Cogl = imports.gi.Cogl;

const UUID = "BlurCinnamon@klangman";

// In use for the effects, to prevent boilerplate code
function setup_params(outer_this, params) {
    // setup each parameter, either with the given or the default value
    for (const params_name in outer_this.constructor.default_params) {
        outer_this["_" + params_name] = null;
        outer_this[params_name] = params_name in params ?
            params[params_name] :
            outer_this.constructor.default_params[params_name];
    }
}

function get_shader_source(shader_filename) {
    let file_name = GLib.get_user_data_dir() + '/cinnamon/extensions/' + UUID + "/6.0/" + shader_filename;
    let [ok, content] = GLib.file_get_contents(file_name);
    return (new TextDecoder().decode(content));
}

// Muffin's ClutterOffscreenEffect sizes its texture from the actor's paint volume, but always
// sets the offscreen framebuffer's viewport to the size of the *stage*
// (clutter_offscreen_effect_pre_paint()). GL clips everything outside the viewport, so when
// the actor is about as wide (or tall) as the screen, e.g. a screen-wide window whose surface
// also holds a client-side shadow, the part of the texture past the stage size is never drawn
// and the right (or bottom) side of the effect disappears.
// Call this right after the parent pre_paint(): it widens the viewport around its centre by a
// whole number of pixels on each side and scales the projection's x and y down to match, so
// every actor pixel still lands on the same texture pixel, but the whole texture is covered.
let viewportErrorLogged = false;

// get_framebuffer() pins the offscreen framebuffer (and its texture) in VRAM until the JS garbage
// collector frees its wrapper (see extendOffscreenViewport()). When we had to fetch it, ask for a
// collection once the activity settles, or every FB_GC_MAX_DELAY_MS while it doesn't (a long resize of a
// window hanging off a screen edge makes a new texture every frame). A collection sweeps all of
// Cinnamon's JS and can take long enough to drop a frame, so it never runs on a fixed timer, only after
// we actually fetched a framebuffer. It runs from a main-loop source, never inside a paint.
const FB_GC_SETTLE_MS = 1000;
const FB_GC_MAX_DELAY_MS = 3000;
let fbGcTimeoutId = 0;
let fbGcPendingSince = 0;
let fbGcForced = false;

function scheduleFramebufferGC() {
    let now = GLib.get_monotonic_time() / 1000;
    if (!fbGcPendingSince)
        fbGcPendingSince = now;
    if (fbGcTimeoutId) {
        if (fbGcForced)
            return;   // already due as soon as the main loop gets to it
        GLib.source_remove(fbGcTimeoutId);
    }
    fbGcForced = (now - fbGcPendingSince >= FB_GC_MAX_DELAY_MS);
    fbGcTimeoutId = GLib.timeout_add(GLib.PRIORITY_LOW, fbGcForced ? 0 : FB_GC_SETTLE_MS, () => {
        fbGcTimeoutId = 0;
        fbGcPendingSince = 0;
        fbGcForced = false;
        imports.system.gc();
        return GLib.SOURCE_REMOVE;
    });
}

// Drop a pending collection, for disable()
function cancelFramebufferGC() {
    if (fbGcTimeoutId) {
        GLib.source_remove(fbGcTimeoutId);
        fbGcTimeoutId = 0;
    }
    fbGcPendingSince = 0;
    fbGcForced = false;
}

// True if the actor's paint box (what ClutterOffscreenEffect sizes its texture from) is inside the stage,
// in which case extendOffscreenViewport() has nothing to do.
function actorInsideStage(actor) {
    let stage = actor.get_stage();
    if (!stage)
        return false;
    let [ok, box] = actor.get_paint_box();
    if (!ok)
        return false;
    // Round outwards like the offscreen effect does. Touching the stage edge exactly is still inside: a blur
    // viewport clamped to the stage (a window over a panel at the screen edge) must take this early return.
    return Math.floor(box.x1) >= 0 && Math.floor(box.y1) >= 0 &&
           Math.ceil(box.x2) <= stage.width && Math.ceil(box.y2) <= stage.height;
}
function viewportExtension(start, size, fbSize) {
    // Pixels to add on each side so that [start - e, start + size + e] covers [0, fbSize]
    return Math.max(0, Math.ceil(start), Math.ceil(fbSize - (start + size)));
}
//
// actor (optional, the effect's actor): when its paint box lies inside the stage there is nothing to
// extend, so return without touching the framebuffer. That matters for memory, not just speed:
// get_framebuffer() hands JS a wrapper that keeps the offscreen framebuffer - and the texture it renders
// into - alive until the JS garbage collector runs. While the actor's size changes every frame (dragging
// a blurred window along a screen edge or over a panel, where the blur's expanded rect gets clamped to the
// stage; resizing a window) ClutterOffscreenEffect makes a new texture each frame, and every one of them
// stayed pinned in VRAM by its wrapper until the next GC, so VRAM climbed during the drag and only fell
// some time after it stopped.
function extendOffscreenViewport(paintContext, actor = null) {
    try {
        if (actor && actorInsideStage(actor))
            return;
        let fb = paintContext.get_framebuffer();
        scheduleFramebufferGC();
        let [vx, vy, vw, vh] = fb.get_viewport4fv();
        if (!(vw > 0 && vh > 0))
            return;
        let ex = viewportExtension(vx, vw, fb.get_width());
        let ey = viewportExtension(vy, vh, fb.get_height());
        if (ex === 0 && ey === 0)
            return;
        let newWidth = vw + 2 * ex, newHeight = vh + 2 * ey;
        // projection' = scale(vw / newWidth, vh / newHeight) * projection (scales NDC x/y)
        let projection = fb.get_projection_matrix();
        let scale = projection.copy();
        scale.init_identity();
        scale.scale(vw / newWidth, vh / newHeight, 1);
        let result = projection.copy();
        result.multiply(scale, projection);
        fb.set_projection_matrix(result);
        fb.set_viewport(vx - ex, vy - ey, newWidth, newHeight);
    } catch (e) {
        if (!viewportErrorLogged) {
            viewportErrorLogged = true;
            logError(e, "BlurCinnamon: couldn't extend the offscreen viewport");
        }
    }
}
