// This code is copied from Blur My Shell (https://github.com/aunetx/blur-my-shell) Aurélien Hamy
// Modified for Cinnamon by Kevin Langman

const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const Utils = require('./utils.js');
const DualKawaseBlur = require('./dual_kawase_blur');
const EffectBase = require('./effect_base.js');

const SHADER_FILENAME = 'refraction.glsl';

const CLIP_STABILIZE_EPSILON = 1.0;
const MAX_BLUR_RADIUS = 48.0;

const DEFAULT_PARAMS = {
    strength: 0.42,
    blur_radius: 10,
    edge_size: 22,
    falloff: 2.4,
    corner_radius: 22,
    rim_width: 4.8,
    rgb_fringing: 0.08,
    gloss: 0.55,
    webcam_gloss: false,
    webcam_device: '',
    tint: 0.18,
    tint_color: [1.0, 1.0, 1.0, 1.0],
    backdrop_zoom: 1.0,
    shadow: 0.28,
    texture_repeat: 0,
    blur_direction: 0,
    private_pass: 0,
    chained_effect: null,
    width: 0,
    height: 0,
    opacity_factor: 1.0,
    clip: [0, 0, -1, -1]
};

const INTEGRAL_UNIFORMS = new Set([
    'corners_bottom',
    'corners_top',
    'divider',
    'dir',
    'downsampling_mode',
    'factor',
    'iterations',
    'mode',
    'operation',
    'prefer_closer_pixels',
    'straight_corners',
    'use_base_pixel',
]);

function set_uniform(effect, name, value) {
    if (!effect._bms_uniforms)
        effect._bms_uniforms = new Map();

    effect._bms_uniforms.set(name, value);
    effect._bms_uniforms_dirty = true;
    try {
        effect.queue_repaint();
    } catch (e) { }
}

// Position of an actor on the stage from its own and its ancestors' positions. Unlike
// get_transformed_position(), it is current as soon as a position is set, before the next allocation.
function stage_position(actor) {
    let x = 0, y = 0;
    for (let a = actor; a; a = a.get_parent()) {
        x += a.x;
        y += a.y;
    }
    return [x, y];
}

function upload_uniforms(effect) {
    if (!effect._bms_uniforms_dirty || !effect._bms_uniforms || !effect.get_actor?.())
        return;

    for (const [name, value] of effect._bms_uniforms) {
        try {
            effect.set_uniform_value(name, get_shader_value(name, value));
        } catch (e) {
            if (!effect._bms_uniform_warning_shown) {
                effect._bms_uniform_warning_shown = true;
                console.warn(`[Blur my Shell] shader uniform upload failed for ${effect.constructor.name}`, e);
            }
        }
    }

    effect._bms_uniforms_dirty = false;
}

function get_shader_value(name, value) {
    // EffectBase takes plain numbers when built on Cinnamon.GLSLEffect (all uniforms are set as floats)
    if (typeof value !== 'number' || EffectBase.USE_GLSL_EFFECT)
        return value;

    if (INTEGRAL_UNIFORMS.has(name))
        return Math.trunc(value);

    const float_value = new GObject.Value();
    float_value.init(GObject.TYPE_FLOAT);
    float_value.set_float(value);
    return float_value;
}

const RefractionEffect = new GObject.registerClass({
        GTypeName: `RefractionEffect_${Math.floor(Math.random() * 100000) + 1}`,
        Properties: {
            'strength': GObject.ParamSpec.double(
                `strength`,
                `Strength`,
                `Refraction strength`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                0.42,
            ),
            'edge_size': GObject.ParamSpec.double(
                `edge_size`,
                `Edge Size`,
                `Refraction edge size`,
                GObject.ParamFlags.READWRITE,
                1.0, 200.0,
                22.0,
            ),
            'blur_radius': GObject.ParamSpec.double(
                `blur_radius`,
                `Blur Radius`,
                `Internal glass blur radius`,
                GObject.ParamFlags.READWRITE,
                0.0, MAX_BLUR_RADIUS,
                10.0,
            ),
            'falloff': GObject.ParamSpec.double(
                `falloff`,
                `Falloff`,
                `Refraction falloff`,
                GObject.ParamFlags.READWRITE,
                0.25, 8.0,
                2.4,
            ),
            'corner_radius': GObject.ParamSpec.double(
                `corner_radius`,
                `Corner Radius`,
                `Refraction corner radius`,
                GObject.ParamFlags.READWRITE,
                0.0, 200.0,
                22.0,
            ),
            'rim_width': GObject.ParamSpec.double(
                `rim_width`,
                `Rim Width`,
                `Refraction rim width`,
                GObject.ParamFlags.READWRITE,
                1.0, 6.5,
                4.8,
            ),
            'rgb_fringing': GObject.ParamSpec.double(
                `rgb_fringing`,
                `RGB Fringing`,
                `Chromatic offset strength`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                0.08,
            ),
            'gloss': GObject.ParamSpec.double(
                `gloss`,
                `Gloss`,
                `Specular highlight strength`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                0.55,
            ),
            'webcam_gloss': GObject.ParamSpec.boolean(
                `webcam_gloss`,
                `Deprecated Webcam Gloss`,
                `Deprecated compatibility property`,
                GObject.ParamFlags.READWRITE,
                false,
            ),
            'webcam_device': GObject.ParamSpec.string(
                `webcam_device`,
                `Deprecated Webcam Device`,
                `Deprecated compatibility property`,
                GObject.ParamFlags.READWRITE,
                '',
            ),
            'tint': GObject.ParamSpec.double(
                `tint`,
                `Tint`,
                `Glass tint strength`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                0.18,
            ),
            'tint_red': GObject.ParamSpec.double(
                `tint_red`,
                `Tint Red`,
                `Glass tint color red`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                1.0,
            ),
            'tint_green': GObject.ParamSpec.double(
                `tint_green`,
                `Tint Green`,
                `Glass tint color green`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                1.0,
            ),
            'tint_blue': GObject.ParamSpec.double(
                `tint_blue`,
                `Tint Blue`,
                `Glass tint color blue`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                1.0,
            ),
            'tint_alpha': GObject.ParamSpec.double(
                `tint_alpha`,
                `Tint Alpha`,
                `Glass tint color alpha`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                1.0,
            ),
            'backdrop_zoom': GObject.ParamSpec.double(
                `backdrop_zoom`,
                `Backdrop Zoom`,
                `Zoom level of the refracted backdrop`,
                GObject.ParamFlags.READWRITE,
                0.1, 4.0,
                1.0,
            ),
            'shadow': GObject.ParamSpec.double(
                `shadow`,
                `Shadow`,
                `Inner shadow strength`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                0.28,
            ),
            'texture_repeat': GObject.ParamSpec.int(
                `texture_repeat`,
                `Texture Repeat`,
                `Texture repeat behavior`,
                GObject.ParamFlags.READWRITE,
                0, 1,
                0,
            ),
            'blur_direction': GObject.ParamSpec.int(
                `blur_direction`,
                `Blur Direction`,
                `Private Gaussian blur direction`,
                GObject.ParamFlags.READWRITE,
                0, 1,
                0,
            ),
            'private_pass': GObject.ParamSpec.int(
                `private_pass`,
                `Private Pass`,
                `Private Gaussian blur pass`,
                GObject.ParamFlags.READWRITE,
                0, 1,
                0,
            ),
            'chained_effect': GObject.ParamSpec.object(
                `chained_effect`,
                `Chained Effect`,
                `Private chained blur effect`,
                GObject.ParamFlags.READWRITE,
                GObject.Object,
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
            // See corner.js: this is backed by an array setter, but represented
            // as a dummy property so pipeline parameter assignment can reach it.
            'clip': GObject.ParamSpec.double(
                `clip`,
                `Clip`,
                `Clip`,
                GObject.ParamFlags.READWRITE,
                0.0, Number.MAX_SAFE_INTEGER,
                0.0,
            ),
            'opacity_factor': GObject.ParamSpec.double(
                `opacity_factor`,
                `Opacity factor`,
                `Opacity factor`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                1.0,
            ),
        }
    }, class RefractionEffect extends EffectBase.EffectBase {

        constructor(params) {
            const {
                webcam_gloss: _webcam_gloss,
                webcam_device: _webcam_device,
                tint_color: _tint_color,
                ...parent_params
            } = params;
            super({ ...parent_params });
            //utils.initialize_shader_effect(this, SHADER_SOURCE);

            this._clip_x0 = null;
            this._clip_y0 = null;
            this._clip_width = null;
            this._clip_height = null;
            this._stable_clip_x0 = null;
            this._stable_clip_y0 = null;
            this._stable_clip_width = null;
            this._stable_clip_height = null;
            this._stabilize_clip_x = false;
            this._stabilize_clip_y = false;
            this._clip_settle_timeout_id = null;
            this._clip_on_screen = false;
            this._clip_origin = null;
            this._glass_rect = null;

            Utils.setup_params(this, params);

            // Keep the public 0..48 blur-radius API used by extension.js, but
            // let Dual Kawase consume the original 0..100 intensity.
            if (this.private_pass === 0)
                this._ensure_blur_effect();

            this._theme_context = St.ThemeContext.get_for_stage(global.stage);
            this._theme_connection_id = null;
        }

        get_effect_source() {
            return Utils.get_shader_source(SHADER_FILENAME);
        }

        static get default_params() {
            return DEFAULT_PARAMS;
        }

        get strength() {
            return this._strength;
        }

        set strength(value) {
            if (this._strength !== value) {
                this._strength = value;

                this.set_uniform_value('strength', get_shader_value('strength', this._strength));
                this.set_enabled(this.private_pass !== 1 || this.blur_radius > 0.01);
            }
        }

        get edge_size() {
            return this._edge_size;
        }

        set edge_size(value) {
            if (this._edge_size !== value) {
                this._edge_size = value;

                this.update_scaled_uniforms();
            }
        }

        get sample_reach() {
            const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        
            const blur_reach = this.chained_effect?.sample_reach ?? 0;
            const bezel = Math.max(1, this.edge_size * scale_factor);
            const band = Math.max(1, bezel * 0.35 * Math.max(1, this.rim_width));
        
            const strength = Math.max(0, Math.min(1, this.strength));
            const dispersion = Math.max(0, Math.min(20, this.rgb_fringing * 20));
        
            const channel_scale = 1 + 0.02 * dispersion;
            const lens_reach = band * strength * channel_scale;
            const zoom = Math.max(0.01, this.backdrop_zoom - 1e-6);
        
            const actor = this.get_actor();
            const visible = actor?._blurCinnamonSamplingRect ?? actor?._blurCinnamonVisibleRect;
        
            const shape_span = Math.max(
                0,
                visible?.[2] ?? 0,
                visible?.[3] ?? 0,
                this._clip_width ?? 0,
                this._clip_height ?? 0,
                this._stable_clip_width ?? 0,
                this._stable_clip_height ?? 0
            );
        
            const inverse_zoom_delta = 1 / zoom - 1;
            const has_clip = this._clip_width >= 0 && this._clip_height >= 0;
            const has_visible_rect = visible && visible[2] > 0 && visible[3] > 0;
            // The viewport asks for its margin before updating glass_rect. Detect a
            // pending resize as well as a clip that is already being stabilized
            const resize_pending = has_clip && has_visible_rect && (
                Math.abs(visible[2] - this._clip_width) > CLIP_STABILIZE_EPSILON ||
                Math.abs(visible[3] - this._clip_height) > CLIP_STABILIZE_EPSILON
            );
            const needs_conservative_reach = this._stabilize_clip_x || this._stabilize_clip_y || resize_pending || (!has_clip && !has_visible_rect);
            // A stabilized clip can have its centre outside the current visible
            // rect. Preserve the existing bound until that resize settles
            const zoom_reach = needs_conservative_reach
                ? (Math.max(global.stage.width, global.stage.height) + shape_span + 3) *
                    Math.abs(inverse_zoom_delta)
                : (shape_span / 2) * Math.max(0, inverse_zoom_delta) +
                    1.5 * Math.abs(inverse_zoom_delta);

            return blur_reach + lens_reach / zoom + zoom_reach;
        }

        get dual_kawase_radius() {
            return Math.max(0, Math.min(100, this.blur_radius * 100 / MAX_BLUR_RADIUS));
        }

        _ensure_blur_effect() {
            // Replace a blur whose old actor was destroyed under it: reattaching it would log
            // criticals (see effect_base.js)
            if (!this.chained_effect || EffectBase.shouldDiscard(this.chained_effect)) {
                this.chained_effect = new DualKawaseBlur.DualFilteringBlurEffect({
                    radius: this.dual_kawase_radius,
                    brightness: 1,
                    width: this.width,
                    height: this.height
                });
            } else {
                this.chained_effect.radius = this.dual_kawase_radius;
            }
        }

        get blur_radius() {
            return this._blur_radius;
        }

        set blur_radius(value) {
            if (this._blur_radius !== value) {
                this._blur_radius = Math.max(0, Math.min(value, MAX_BLUR_RADIUS));

                this.update_scaled_uniforms();

                if (this.chained_effect)
                    this.chained_effect.radius = this.dual_kawase_radius;
            }
        }

        get falloff() {
            return this._falloff;
        }

        set falloff(value) {
            if (this._falloff !== value) {
                this._falloff = value;

                this.set_uniform_value('falloff', parseFloat(this._falloff - 1e-6));
            }
        }

        get corner_radius() {
            return this._corner_radius;
        }

        set corner_radius(value) {
            if (this._corner_radius !== value) {
                this._corner_radius = value;

                this.update_scaled_uniforms();
            }
        }

        get rim_width() {
            return this._rim_width;
        }

        set rim_width(value) {
            const rim_width = Math.max(1.0, Math.min(value, 6.5));
            if (this._rim_width !== rim_width) {
                this._rim_width = rim_width;

                this.set_uniform_value('rim_width', parseFloat(this._rim_width - 1e-6));
            }
        }

        get rgb_fringing() {
            return this._rgb_fringing;
        }

        set rgb_fringing(value) {
            if (this._rgb_fringing !== value) {
                this._rgb_fringing = value;

                this.set_uniform_value('rgb_fringing', parseFloat(this._rgb_fringing - 1e-6));
            }
        }

        get gloss() {
            return this._gloss;
        }

        set gloss(value) {
            if (this._gloss !== value) {
                this._gloss = value;

                this.set_uniform_value('gloss', parseFloat(this._gloss - 1e-6));
            }
        }

        // Deprecated no-op compatibility properties for old saved pipelines.
        get webcam_gloss() {
            return this._webcam_gloss;
        }

        set webcam_gloss(value) {
            this._webcam_gloss = value;
        }

        get webcam_device() {
            return this._webcam_device;
        }

        set webcam_device(value) {
            this._webcam_device = value ?? '';
        }

        get tint() {
            return this._tint;
        }

        set tint(value) {
            if (this._tint !== value) {
                this._tint = value;

                this.set_uniform_value('tint', parseFloat(this._tint - 1e-6));
            }
        }

        get tint_red() {
            return this._tint_red;
        }

        set tint_red(value) {
            if (this._tint_red !== value) {
                this._tint_red = value;

                this.set_uniform_value('tint_r', parseFloat(this._tint_red - 1e-6));
            }
        }

        get tint_green() {
            return this._tint_green;
        }

        set tint_green(value) {
            if (this._tint_green !== value) {
                this._tint_green = value;

                this.set_uniform_value('tint_g', parseFloat(this._tint_green - 1e-6));
            }
        }

        get tint_blue() {
            return this._tint_blue;
        }

        set tint_blue(value) {
            if (this._tint_blue !== value) {
                this._tint_blue = value;

                this.set_uniform_value('tint_b', parseFloat(this._tint_blue - 1e-6));
            }
        }

        get tint_alpha() {
            return this._tint_alpha;
        }

        set tint_alpha(value) {
            if (this._tint_alpha !== value) {
                this._tint_alpha = value;

                this.set_uniform_value('tint_a', parseFloat(this._tint_alpha - 1e-6));
            }
        }

        get tint_color() {
            return [this.tint_red, this.tint_green, this.tint_blue, this.tint_alpha];
        }

        set tint_color(rgba) {
            const [r, g, b, a] = rgba;
            this.tint_red = r;
            this.tint_green = g;
            this.tint_blue = b;
            this.tint_alpha = a ?? 1.0;
        }

        get backdrop_zoom() {
            return this._backdrop_zoom;
        }

        set backdrop_zoom(value) {
            if (this._backdrop_zoom !== value) {
                this._backdrop_zoom = value;

                this.set_uniform_value('backdrop_zoom', parseFloat(this._backdrop_zoom - 1e-6));
            }
        }

        get shadow() {
            return this._shadow;
        }

        set shadow(value) {
            if (this._shadow !== value) {
                this._shadow = value;

                this.set_uniform_value('shadow', parseFloat(this._shadow - 1e-6));
            }
        }

        get texture_repeat() {
            return this._texture_repeat;
        }

        set texture_repeat(value) {
            if (this._texture_repeat !== value) {
                this._texture_repeat = value;

                this.set_uniform_value('texture_repeat', this._texture_repeat);
            }
        }

        get blur_direction() {
            return this._blur_direction;
        }

        set blur_direction(value) {
            if (this._blur_direction !== value) {
                this._blur_direction = value;

                this.set_uniform_value('blur_direction', this._blur_direction);
            }
        }

        get private_pass() {
            return this._private_pass;
        }

        set private_pass(value) {
            if (this._private_pass !== value) {
                this._private_pass = value;

                this.set_uniform_value('private_pass', this._private_pass);
                if (this._private_pass === 1)
                    this.set_enabled(this.blur_radius > 0.01);
            }
        }

        get chained_effect() {
            return this._chained_effect;
        }

        set chained_effect(value) {
            this._chained_effect = value;
        }

        set(params) {
            // Update supplied values without resetting the owned blur or actor geometry
            for (const name in this.constructor.default_params) {
                if (Object.prototype.hasOwnProperty.call(params, name))
                    this[name] = params[name];
            }
        }

        get width() {
            return this._width;
        }

        set width(value) {
            if (this._width !== value) {
                this._width = value;

                this.set_uniform_value('width', parseFloat(this._width + 3.0 - 1e-6));
                this.update_scaled_uniforms();

                if (this.chained_effect)
                    this.chained_effect.width = value;
            }
        }

        get height() {
            return this._height;
        }

        set height(value) {
            if (this._height !== value) {
                this._height = value;

                this.set_uniform_value('height', parseFloat(this._height + 3.0 - 1e-6));
                this.update_scaled_uniforms();

                if (this.chained_effect)
                    this.chained_effect.height = value;
            }
        }

        get clip() {
            return [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height];
        }

        set clip(value) {
            let previous_clip = this.clip;
            const previous_on_screen = this._clip_on_screen;
            const previous_origin = this._clip_origin;
            [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height] = value;

            // Only smooth a resize of glass that is on screen. A rect set while the actor is hidden (an
            // empty one while a menu opens, or a new surface on a reused background) is not a resize of
            // the rect before it, and stabilizing from it moves the zoom centre and edges once it settles.
            const actor = this.get_actor();
            this._clip_on_screen = !!actor && actor.is_mapped() && this._clip_width > 0 && this._clip_height > 0;
            // The rect is in the actor's own coordinates, and a viewport actor moves when its sampling margin
            // changes (it grows to the whole stage when a resize starts). Compare in the current coordinates,
            // using the actor's position on the stage: a window's viewport is a child of the window actor, so
            // its own x/y also change when only the window moves.
            this._clip_origin = actor ? stage_position(actor) : null;
            if (previous_origin && this._clip_origin) {
                const dx = previous_origin[0] - this._clip_origin[0];
                const dy = previous_origin[1] - this._clip_origin[1];
                previous_clip = [previous_clip[0] + dx, previous_clip[1] + dy, previous_clip[2], previous_clip[3]];
                if (this._stable_clip_x0 !== null) this._stable_clip_x0 += dx;
                if (this._stable_clip_y0 !== null) this._stable_clip_y0 += dy;
            }
            let shader_clip = this._stabilized_clip(previous_on_screen && this._clip_on_screen ? previous_clip : null);

            this.set_uniform_value('clip_x0', parseFloat(shader_clip[0] - 1e-6));
            this.set_uniform_value('clip_y0', parseFloat(shader_clip[1] - 1e-6));
            this.set_uniform_value('clip_width', parseFloat(shader_clip[2] + 3.0 - 1e-6));
            this.set_uniform_value('clip_height', parseFloat(shader_clip[3] + 3.0 - 1e-6));
            this.update_scaled_uniforms();
        }

        // Optional bounds for the glass shape (edges, rim, corners), in actor-local pixels, used instead
        // of the actor's clip. BlurCinnamon's viewport actors have no clip and are larger than the visible
        // area (they include the blur's sampling margin), so without this the glass edge would be drawn out
        // in that margin and then cut away by the corner effect. null goes back to following the actor's clip.
        get glass_rect() {
            return this._glass_rect;
        }

        set glass_rect(rect) {
            const new_rect = rect ? [...rect] : null;
            const old_rect = this._glass_rect;
            if (new_rect === old_rect ||
                (new_rect && old_rect && new_rect.every((v, i) => v === old_rect[i]))) {
                // Unchanged in the actor's coordinates, but the actor may have moved with its window, and
                // the glass with it. Keep its origin current, so the next rect is compared from there.
                const actor = this.get_actor();
                this._clip_origin = actor ? stage_position(actor) : null;
                return;
            }

            this._glass_rect = new_rect;
            const actor = this.get_actor();
            if (new_rect || actor)
                this.clip = this._bounds_for_actor(actor);
        }

        _bounds_for_actor(actor) {
            if (this._glass_rect)
                return this._glass_rect;
            return (actor && actor.has_clip) ? actor.get_clip() : [0, 0, -10, -10];
        }

        get opacity_factor() {
            return this._opacity_factor;
        }

        set opacity_factor(value) {
            if (this._opacity_factor !== value) {
                this._opacity_factor = value;

                set_uniform(this, 'opacity_factor', parseFloat(this._opacity_factor));
                this.set_uniform_value('opacity_factor', parseFloat(this._opacity_factor));
            }
        }

        _stabilized_clip(previous_clip) {
            if (!previous_clip || this._clip_width < 0 || this._clip_height < 0) {
                this._stable_clip_x0 = null;
                this._stable_clip_y0 = null;
                this._stable_clip_width = null;
                this._stable_clip_height = null;
                this._stabilize_clip_x = false;
                this._stabilize_clip_y = false;
                if (this._clip_settle_timeout_id) {
                    GLib.Source.remove(this._clip_settle_timeout_id);
                    this._clip_settle_timeout_id = null;
                }
                return [
                    this._clip_x0,
                    this._clip_y0,
                    this._clip_width,
                    this._clip_height
                ];
            }

            const [previous_x0, previous_y0, previous_width, previous_height] = previous_clip;

            [this._stable_clip_x0, this._stable_clip_width, this._stabilize_clip_x] =
                this._stabilized_clip_axis(
                    this._clip_x0,
                    this._clip_width,
                    previous_x0,
                    previous_width,
                    this._stable_clip_x0,
                    this._stable_clip_width,
                    this._stabilize_clip_x
                );
            [this._stable_clip_y0, this._stable_clip_height, this._stabilize_clip_y] =
                this._stabilized_clip_axis(
                    this._clip_y0,
                    this._clip_height,
                    previous_y0,
                    previous_height,
                    this._stable_clip_y0,
                    this._stable_clip_height,
                    this._stabilize_clip_y
                );

            if (this._clip_settle_timeout_id)
                GLib.Source.remove(this._clip_settle_timeout_id);

            if (!this._stabilize_clip_x && !this._stabilize_clip_y) {
                this._clip_settle_timeout_id = null;
                return [
                    this._stable_clip_x0,
                    this._stable_clip_y0,
                    this._stable_clip_width,
                    this._stable_clip_height
                ];
            }

            this._clip_settle_timeout_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 220, () => {
                this._stable_clip_x0 = this._clip_x0;
                this._stable_clip_y0 = this._clip_y0;
                this._stable_clip_width = this._clip_width;
                this._stable_clip_height = this._clip_height;
                this._stabilize_clip_x = false;
                this._stabilize_clip_y = false;
                this._clip_settle_timeout_id = null;
                this.clip = [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height];
                this.queue_repaint();
                return GLib.SOURCE_REMOVE;
            });

            return [
                this._stable_clip_x0,
                this._stable_clip_y0,
                this._stable_clip_width,
                this._stable_clip_height
            ];
        }

        _stabilized_clip_axis(
            start,
            size,
            previous_start,
            previous_size,
            stable_start,
            stable_size,
            stabilizing
        ) {
            const size_changed =
                previous_size !== null &&
                previous_size >= 0 &&
                Math.abs(size - previous_size) > CLIP_STABILIZE_EPSILON;

            if (!stabilizing && !size_changed)
                return [start, size, false];

            const end = start + size;
            const resolved_stable_start = stable_start ?? previous_start ?? start;
            const resolved_stable_size = stable_size ?? previous_size ?? size;
            const stable_end = resolved_stable_start + resolved_stable_size;
            const resolved_start = Math.min(resolved_stable_start, start);
            const resolved_end = Math.max(stable_end, end);

            return [resolved_start, resolved_end - resolved_start, true];
        }

        update_scaled_uniforms() {
            const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const rect_width =
                this._stable_clip_width ?? (this._clip_width >= 0 ? this._clip_width : this.width);
            const rect_height =
                this._stable_clip_height ?? (this._clip_height >= 0 ? this._clip_height : this.height);
            const max_edge = Math.max(1, Math.min(rect_width, rect_height) / 2);
            const edge_size = Math.min(this.edge_size * scale_factor, max_edge);
            const corner_radius = Math.min(this.corner_radius * scale_factor, max_edge);

            this.set_uniform_value('edge_size', parseFloat(edge_size - 1e-6));
            this.set_uniform_value('corner_radius', parseFloat(corner_radius - 1e-6));
            const blur_radius = Math.min(this.blur_radius, MAX_BLUR_RADIUS) * scale_factor;
            // The backdrop is already blurred by Dual Kawase, bypass the
            // Gaussian loop in sampleGlassBackdrop() in refraction.glsl
            this.set_uniform_value('blur_radius', get_shader_value('blur_radius', 0.0));
            if (this.private_pass === 1)
                this.set_enabled(blur_radius > 0.01);
        }

        _disconnect_theme_signal() {
            if (this._theme_connection_id) {
                this._theme_context.disconnect(this._theme_connection_id);
                this._theme_connection_id = null;
            }
        }

        vfunc_pre_paint(paintContext) {
            if (!super.vfunc_pre_paint(paintContext))
                return false;
            Utils.extendOffscreenViewport(paintContext, this.get_actor());
            return true;
        }

        vfunc_set_actor(actor) {
            this._disconnect_theme_signal();

            if (this.chained_effect)
                this.chained_effect.get_actor()?.remove_effect(this.chained_effect);

            if (this._actor_connection_size_id) {
                let old_actor = this.get_actor();
                old_actor?.disconnect(this._actor_connection_size_id);
            }
            if (this._actor_connection_clip_rect_id) {
                let old_actor = this.get_actor();
                old_actor?.disconnect(this._actor_connection_clip_rect_id);
            }
            if (this._clip_settle_timeout_id) {
                GLib.Source.remove(this._clip_settle_timeout_id);
                this._clip_settle_timeout_id = null;
            }
            if (actor) {
                this.width = actor.width;
                this.height = actor.height;
                this._actor_connection_size_id = actor.connect('notify::size', _ => {
                    this.width = actor.width;
                    this.height = actor.height;
                });

                this.clip = this._bounds_for_actor(actor);
                this._actor_connection_clip_rect_id = actor.connect('notify::clip-rect', _ => {
                    this.clip = this._bounds_for_actor(actor);
                });
            }
            else {
                this._actor_connection_size_id = null;
                this._actor_connection_clip_rect_id = null;
                this._stable_clip_x0 = null;
                this._stable_clip_y0 = null;
                this._stable_clip_width = null;
                this._stable_clip_height = null;
                this._stabilize_clip_x = false;
                this._stabilize_clip_y = false;
            }

            super.vfunc_set_actor(actor);

            if (actor) {
                this.update_scaled_uniforms();
                this._theme_context = St.ThemeContext.get_for_stage(global.stage);
                this._theme_connection_id = this._theme_context.connect('notify::scale-factor', () => this.update_scaled_uniforms());
            }

            if (actor && this.private_pass === 0) {
                this._ensure_blur_effect();
                // Offscreen effects wrap subsequent effects: add the blur
                // after RefractionEffect so glass samples the blurred backdrop.
                actor.add_effect(this.chained_effect);
            }
        }

        vfunc_paint_target(paint_context) {
            upload_uniforms(this);
            this.set_uniform_value('blur_direction', this.blur_direction);
            this.set_uniform_value('private_pass', this.private_pass);

            super.vfunc_paint_target(paint_context);
        }
    });
