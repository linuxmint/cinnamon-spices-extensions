// borrowed from Blur-my-shell / Aurélien Hamy
// modified for Cinnamon by Kevin Langman 2025

const GObject  = imports.gi.GObject;
const St       = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Clutter  = imports.gi.Clutter;
const Cogl     = imports.gi.Cogl;
const Gio      = imports.gi.Gio;
const GLib     = imports.gi.GLib;

const EffectBaseModule = (typeof global === 'undefined') ? null : require("./effect_base");
const EffectBase = EffectBaseModule ? EffectBaseModule.EffectBase : null;

const SHADER_FILENAME = 'corner.glsl';
const SHADOW_SHADER_FILENAME = 'shadow.glsl';

// Border modes (must match corner.glsl)
var BorderMode = { NONE: 0, AUTO: 1, CUSTOM: 2, MATCH: 3 };
const DEFAULT_BORDER = { mode: BorderMode.NONE, width: 1, contrast: 0.2, color: [0, 0, 0, 0.3] };

// Clutter's offscreen effects don't render into a texture the size of the actor. The
// texture covers the actor's paint volume (in actor coordinates), padded by
// _clutter_actor_box_enlarge_for_effects() (clutter-actor-box.c):
//     x2 = ceil(x2 + 0.75);  x1 = x2 - round(x2 - x1) - 3
// Given the paint volume's extent along one axis (v1..v2), return the texture size and
// where the actor's origin (0) sits inside the texture.
function fboGeometry(v1, v2) {
    let rounded = Math.round(v2 - v1);
    let x2 = Math.ceil(v2 + 0.75);
    let x1 = x2 - rounded - 3;
    return { size: x2 - x1, offset: -x1 + FBO_OFFSET_CORRECTION };
}

// The stock formula above matches what Clutter does on every Cinnamon version (6.0 - 6.6):
// the actor's origin lands 2px into the texture and the texture is size + 3. A Muffin with
// a modified _clutter_actor_box_enlarge_for_effects() (e.g. one that centres the padding)
// puts it elsewhere; adjust here only for that kind of local build.
const FBO_OFFSET_CORRECTION = 0;

// GJS turns a whole JS number into an int GValue, which a float uniform rejects.
// Nudge whole numbers so they are always passed as doubles. (Only needed when EffectBase is
// Clutter.ShaderEffect; with GLSLEffect every uniform is set as a float anyway.)
function asFloat(value) {
    value = Number(value);
    return Number.isInteger(value) ? value + 1e-6 : value;
}
// Muffin's ClutterOffscreenEffect sizes its texture from the actor's paint volume, but always
// sets the offscreen framebuffer's viewport to the size of the *stage*
// (clutter_offscreen_effect_pre_paint()). GL clips everything outside the viewport, so when
// the actor is about as wide (or tall) as the screen, e.g. a screen-wide window whose surface
// also holds a client-side shadow, the part of the texture past the stage size is never drawn
// and the window's right (or bottom) side disappears.
// Call this right after the parent pre_paint(): it widens the viewport around its centre by a
// whole number of pixels on each side and scales the projection's x and y down to match, so
// every actor pixel still lands on the same texture pixel, but the whole texture is covered.
let viewportErrorLogged = false;
function viewportExtension(start, size, fbSize) {
    // Pixels to add on each side so that [start - e, start + size + e] covers [0, fbSize]
    return Math.max(0, Math.ceil(start), Math.ceil(fbSize - (start + size)));
}
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
// in which case extendOffscreenViewport() has nothing to do. Rounded outwards like the offscreen effect;
// touching the stage edge exactly still counts as inside.
function actorInsideStage(actor) {
    let stage = actor.get_stage();
    if (!stage)
        return false;
    let [ok, box] = actor.get_paint_box();
    if (!ok)
        return false;
    return Math.floor(box.x1) >= 0 && Math.floor(box.y1) >= 0 &&
           Math.ceil(box.x2) <= stage.width && Math.ceil(box.y2) <= stage.height;
}
// actor (the effect's actor): when its paint box lies inside the stage there is nothing to extend, so
// return without touching the framebuffer. That matters for memory: get_framebuffer() hands JS a wrapper
// that keeps the offscreen framebuffer - and the texture it renders into - alive until the JS garbage
// collector runs. While a window is being resized ClutterOffscreenEffect makes a new texture every frame,
// and each one stayed pinned in VRAM by its wrapper until the next GC, so VRAM climbed during the resize
// and only fell some time after it stopped.
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
            logError(e, "RoundedCorners: couldn't extend the offscreen viewport");
        }
    }
}
const DEFAULT_PARAMS = {
    radius: 12, width: 0, height: 0,
    corners_top: true, corners_bottom: true,
    clip: [0, 0, -1, -1]
};

// The uuid passed to the first effect constructed, for get_effect_source(), which GLSLEffect calls
// once per class from inside that constructor, before the instance can store anything
let shaderUuid = null;

// This loads a GLSL file from the extension's resources to a JavaScript string. The
// code from "common.glsl" is prepended automatically.
function loadShaderResource(uuid, file_name) {
    let file;
    file = Gio.File.new_for_path( GLib.get_user_data_dir() + '/cinnamon/extensions/' + uuid  + "/6.0/" + file_name );
    let [data, etag] = file.load_bytes(null);
    let code = new TextDecoder().decode(data.get_data());

    // Add a trailing newline. Else the GLSL compiler complains...
    return code + '\n';
}

var CornerEffect = (typeof global === 'undefined') ?
    { default_params: DEFAULT_PARAMS } :
    new GObject.registerClass({
        GTypeName: `RoundedCornerEffect_${Math.floor(Math.random() * 100000) + 1}`,
        Properties: {
            'radius': GObject.ParamSpec.double(
                `radius`,
                `Corner Radius`,
                `Corner Radius`,
                GObject.ParamFlags.READWRITE,
                0, Number.MAX_SAFE_INTEGER,
                12,
            ),
            'width': GObject.ParamSpec.double(
                `width`,
                `Width`,
                `Width`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
            'height': GObject.ParamSpec.double(
                `height`,
                `Height`,
                `Height`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
            'corners_top': GObject.ParamSpec.boolean(
                `corners_top`,
                `Round top corners`,
                `Round top corners`,
                GObject.ParamFlags.READWRITE,
                true,
            ),
            'corners_bottom': GObject.ParamSpec.boolean(
                `corners_bottom`,
                `Round bottom corners`,
                `Round bottom corners`,
                GObject.ParamFlags.READWRITE,
                true,
            ),
            // FIXME this works but it logs an error, because I'm not a double...
            // I don't want to fiddle with GVariants again
            'clip': GObject.ParamSpec.double(
                `clip`,
                `Clip`,
                `Clip`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
        }
    }, class CornerEffect extends EffectBase {
        // params: the GObject properties above (radius, corners_top, ...)
        // border: {mode, width, contrast, color: [r, g, b, a]} (optional, see setBorder())
        constructor(uuid, params, border) {
            shaderUuid = uuid;
            super(params);

            this._clip_x0 = null;
            this._clip_y0 = null;
            this._clip_width = null;
            this._clip_height = null;

            this._radius = (params.radius) ? params.radius : DEFAULT_PARAMS.radius;
            this._width = (params.width) ? params.width : DEFAULT_PARAMS.width;
            this._height = (params.height) ? params.height : DEFAULT_PARAMS.height;
            // Use ?? (not a truthiness test) so that an explicit false is kept
            this._corners_top = params.corners_top ?? DEFAULT_PARAMS.corners_top;
            this._corners_bottom = params.corners_bottom ?? DEFAULT_PARAMS.corners_bottom;
            this._clip = (params.clip) ? params.clip : DEFAULT_PARAMS.clip;

            // Make sure the shader sees the requested corners, whatever the
            // property setters did (or didn't do) during construction
            this.set_uniform_value('corners_top', this._corners_top ? 1 : 0);
            this.set_uniform_value('corners_bottom', this._corners_bottom ? 1 : 0);

            this.setBorder(border);

            //TODO: Get this code working in Cinnamon
            //const theme_context = St.ThemeContext.get_for_stage(global.stage);
            //theme_context.connectObject('notify::scale-factor', _ => this.update_radius(), this);
        }

        get_effect_source() {
            return loadShaderResource(shaderUuid, SHADER_FILENAME);
        }

        // Set the border drawn just inside the rounded edge.
        //   mode:     BorderMode.NONE, AUTO (edge colour with contrast added), CUSTOM (fixed colour)
        //             or MATCH (continue the window's own border colours around the corners)
        //   width:    border width in pixels
        //   contrast: 0..1, used by AUTO
        //   color:    [r, g, b, a] each 0..1, used by CUSTOM
        setBorder(border) {
            let b = Object.assign({}, DEFAULT_BORDER, border || {});
            let color = b.color || DEFAULT_BORDER.color;
            this._border = b;
            this.set_uniform_value('border_mode', Math.round(b.mode));
            this.set_uniform_value('border_width', asFloat(b.width));
            this.set_uniform_value('border_contrast', asFloat(b.contrast));
            this.set_uniform_value('border_r', asFloat(color[0]));
            this.set_uniform_value('border_g', asFloat(color[1]));
            this.set_uniform_value('border_b', asFloat(color[2]));
            this.set_uniform_value('border_a', asFloat(color[3] ?? 1));
        }

        // Work out the offscreen texture's size and where the actor sits in it, from the
        // actor's paint volume (falling back to its size), and pass them to the shader.
        // Call again whenever the actor's size or paint volume may have changed.
        updateTextureGeometry() {
            // The texture is sized from the paint volume as seen by this effect, which
            // only includes effects added *before* it (ShadowPaddingEffect is added after,
            // so it doesn't count). For the surface actor that is its own size.
            let x1 = 0, y1 = 0, x2 = this._width || 0, y2 = this._height || 0;
            let fx = fboGeometry(x1, x2);
            let fy = fboGeometry(y1, y2);
            this._texGeometry = { volume: [x1, y1, x2, y2], width: fx.size, height: fy.size, offsetX: fx.offset, offsetY: fy.offset };
            this.set_uniform_value('tex_width', asFloat(fx.size));
            this.set_uniform_value('tex_height', asFloat(fy.size));
            this.set_uniform_value('tex_offset_x', asFloat(fx.offset));
            this.set_uniform_value('tex_offset_y', asFloat(fy.offset));
        }

        static get default_params() {
            return DEFAULT_PARAMS;
        }

        get radius() {
            return this._radius;
        }

        set radius(value) {
            if (this._radius !== value) {
                this._radius = value;

                this.update_radius();
            }
        }

        update_radius() {
            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            let radius = Math.min(
                this.radius * theme_context.scale_factor,
                this.width / 2, this.height / 2
            );
            if (this._clip_width >= 0 || this._clip_height >= 0)
                radius = Math.min(radius, this._clip_width / 2, this._clip_height / 2);

            this.set_uniform_value('radius', parseFloat(radius - 1e-6));
        }

        get width() {
            return this._width;
        }

        set width(value) {
            if (this._width !== value) {
                this._width = value;

                this.set_uniform_value('width', parseFloat(this._width - 1e-6));
                this.updateTextureGeometry();
                this.update_radius();
            }
        }

        get height() {
            return this._height;
        }

        set height(value) {
            if (this._height !== value) {
                this._height = value;

                this.set_uniform_value('height', parseFloat(this._height - 1e-6));
                this.updateTextureGeometry();
                this.update_radius();
            }
        }

        get corners_top() {
            return this._corners_top;
        }

        set corners_top(value) {
            if (this._corners_top !== value) {
                this._corners_top = value;

                this.set_uniform_value('corners_top', this._corners_top ? 1 : 0);
            }
        }

        get corners_bottom() {
            return this._corners_bottom;
        }

        set corners_bottom(value) {
            if (this._corners_bottom !== value) {
                this._corners_bottom = value;

                this.set_uniform_value('corners_bottom', this._corners_bottom ? 1 : 0);
            }
        }

        get clip() {
            return [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height];
        }

        set clip(value) {
            [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height] = value;
            this.set_uniform_value('clip_x0', parseFloat(this._clip_x0 - 1e-6));
            this.set_uniform_value('clip_y0', parseFloat(this._clip_y0 - 1e-6));
            this.set_uniform_value('clip_width', parseFloat(this._clip_width - 1e-6));
            this.set_uniform_value('clip_height', parseFloat(this._clip_height - 1e-6));
            this.update_radius();
        }

        vfunc_pre_paint(paintContext) {
            if (!super.vfunc_pre_paint(paintContext))
                return false;
            extendOffscreenViewport(paintContext, this.get_actor());
            return true;
        }

        vfunc_set_actor(actor) {
            if (this._actor_connection_size_id) {
                let old_actor = this.get_actor();
                old_actor?.disconnect(this._actor_connection_size_id);
            }

            if (actor) {
                this.width = actor.width;
                this.height = actor.height;
                this._actor_connection_size_id = actor.connect('notify::size', _ => {
                    this.width = actor.width;
                    this.height = actor.height;
                });

                // No clip until the extension sets one (negative size = whole texture)
                this.clip = [0, 0, -10, -10];
            }
            else {
                this._actor_connection_size_id = null;
            }

            super.vfunc_set_actor(actor);
            // get_actor() is only valid after the parent class has stored the actor
            this.updateTextureGeometry();
        }
    });

// Enlarges the surface actor's paint volume to cover the shadow. Muffin's window actor
// includes the surface's paint volume in its own, so this makes Clutter redraw the
// shadow area when the window moves or changes (the shadow actor itself isn't part of
// the window actor's paint volume). Add it to the surface *after* the CornerEffect, so
// it doesn't enlarge the CornerEffect's texture. It doesn't render anything.
var ShadowPaddingEffect = (typeof global === 'undefined') ? null :
    GObject.registerClass({
        GTypeName: `RoundedCornerShadowPadding_${Math.floor(Math.random() * 100000) + 1}`,
    }, class ShadowPaddingEffect extends Clutter.Effect {
        _init(params) {
            super._init(params);
            this._box = null;
        }

        // The area (actor coordinates) that must be painted: x1, y1, x2, y2
        setBox(x1, y1, x2, y2) {
            this._box = [x1, y1, x2, y2];
            this.get_actor()?.queue_redraw();
        }

        vfunc_modify_paint_volume(volume) {
            if (this._box)
                volume.union_box(new Clutter.ActorBox({ x1: this._box[0], y1: this._box[1], x2: this._box[2], y2: this._box[3] }));
            return true;
        }
    });

// Draws the soft shadow of a rounded window. It goes on a plain Clutter.Actor placed
// inside the window actor, below the window surface, sized to cover the shadow; the
// actor's own content is ignored. Its paint volume starts at its own origin, so the
// texture placement is the same well-tested case as CornerEffect's (fboGeometry(0, size)).
var ShadowEffect = (typeof global === 'undefined') ? null :
    GObject.registerClass({
        GTypeName: `RoundedCornerShadowEffect_${Math.floor(Math.random() * 100000) + 1}`,
    }, class ShadowEffect extends EffectBase {
        constructor(uuid) {
            shaderUuid = uuid;
            super();
        }

        get_effect_source() {
            return loadShaderResource(shaderUuid, SHADOW_SHADER_FILENAME);
        }

        vfunc_pre_paint(paintContext) {
            if (!super.vfunc_pre_paint(paintContext))
                return false;
            extendOffscreenViewport(paintContext, this.get_actor());
            return true;
        }

        // width/height: the shadow actor's size
        // rect: the window's rounded rectangle in the shadow actor's pixels [x0, y0, x1, y1]
        // shadow: {size, opacity (0..1), offsetY, radius, top, bottom}
        update(width, height, rect, shadow) {
            let fx = fboGeometry(0, width);
            let fy = fboGeometry(0, height);
            this.set_uniform_value('tex_width', asFloat(fx.size));
            this.set_uniform_value('tex_height', asFloat(fy.size));
            this.set_uniform_value('tex_offset_x', asFloat(fx.offset));
            this.set_uniform_value('tex_offset_y', asFloat(fy.offset));
            this.set_uniform_value('rect_x0', asFloat(rect[0]));
            this.set_uniform_value('rect_y0', asFloat(rect[1]));
            this.set_uniform_value('rect_x1', asFloat(rect[2]));
            this.set_uniform_value('rect_y1', asFloat(rect[3]));
            this.set_uniform_value('radius', asFloat(Math.min(shadow.radius, (rect[2] - rect[0]) / 2, (rect[3] - rect[1]) / 2)));
            this.set_uniform_value('corners_top', shadow.top ? 1 : 0);
            this.set_uniform_value('corners_bottom', shadow.bottom ? 1 : 0);
            this.set_uniform_value('shadow_size', asFloat(shadow.size));
            this.set_uniform_value('shadow_opacity', asFloat(shadow.opacity));
            this.set_uniform_value('shadow_offset_y', asFloat(shadow.offsetY));
            this.set_uniform_value('cutout_inset', asFloat(shadow.cutoutInset || 0));
        }
    });

// Effect pools (see effect_base.js). Windows get their CornerEffect and ShadowEffect from here and
// give them back when they are unrounded, so a Clutter.ShaderEffect (which can never be freed) is
// reused by the next window instead of being leaked.
const cornerEffectPool = [];
const shadowEffectPool = [];

// A CornerEffect for a window: params as for the CornerEffect constructor ({radius, corners_top,
// corners_bottom}), border as for setBorder()
function acquireCornerEffect(uuid, params, border) {
    let effect = EffectBaseModule.takeFromPool(cornerEffectPool);
    if (!effect)
        return new CornerEffect(uuid, params, border);
    effect.radius = params.radius ?? DEFAULT_PARAMS.radius;
    effect.corners_top = params.corners_top ?? DEFAULT_PARAMS.corners_top;
    effect.corners_bottom = params.corners_bottom ?? DEFAULT_PARAMS.corners_bottom;
    effect.setBorder(border);
    return effect;
}

// Detaches the effect from its actor (if still attached) and pools or drops it
function releaseCornerEffect(effect) {
    EffectBaseModule.releaseToPool(cornerEffectPool, effect);
}

// A ShadowEffect; call update() before it is painted
function acquireShadowEffect(uuid) {
    return EffectBaseModule.takeFromPool(shadowEffectPool) || new ShadowEffect(uuid);
}

// Detaches the effect from its actor (if still attached) and pools or drops it. Release it before
// destroying the actor it is on, or it is orphaned and can't be reused (see effect_base.js).
function releaseShadowEffect(effect) {
    EffectBaseModule.releaseToPool(shadowEffectPool, effect);
}

// True if a CornerEffect must be replaced rather than moved to another actor (see effect_base.js)
function shouldReplaceEffect(effect) {
    return EffectBaseModule.shouldDiscard(effect);
}

// Called from the extension's disable(), once every window has been unrounded
function drainPools() {
    EffectBaseModule.drainPool(cornerEffectPool);
    EffectBaseModule.drainPool(shadowEffectPool);
}
