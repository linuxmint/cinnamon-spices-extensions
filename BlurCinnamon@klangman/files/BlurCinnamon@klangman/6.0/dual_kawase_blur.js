// Implemented based on the Dual Kawase Blur method described in SIGGRAPH 2015 by Marius Bjørge
// Optimized for Cinnamon by stacking progressive multi-pass shader effects

const GObject  = imports.gi.GObject;
const St       = imports.gi.St;
const Utils    = require("./utils.js");
const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;

const EffectBaseModule = require("./effect_base");
const EffectBase = EffectBaseModule.EffectBase;

const UUID = "BlurCinnamon@klangman";

const SHADER_CACHE = {};

// How many pyramid passes Dual Kawase needs for a given blur radius. The full
// 7-pass pyramid is only needed for large radii; using it unconditionally
// multiplies live Cogl shader programs by 7x per blurred surface regardless
// of how small the blur is, which is what trips Cogl's ">50 shaders/programs"
// warning once more than a handful of surfaces are blurred at once.
function _desiredPassCount(radius) {
    if (radius <= 0)  return 1;
    if (radius <= 12) return 3;
    if (radius <= 35) return 5;
    return 7;
}

// Base sampling offset (per unit of blur radius) for a pyramid of the given depth. The fewer the
// passes, the greater the initial spacing required to maintain the linearity of the blur effect.
function _baseOffsetMultiplier(total_passes) {
    switch (total_passes) {
        case 3:  return 0.18;
        case 5:  return 0.09;
        default: return 0.07;
    }
}

const DEFAULT_PARAMS = {
    radius: 0, brightness: 1,
    width: 0, height: 0, 
    pass_index: 0, total_passes: 1
};

// Pools of released pyramid sub-effects, kept separate by role (downsample vs. upsample) since
// each instance's shader is fixed by its class (DualFilteringBlurEffect or DualFilteringUpEffect,
// see makeEffectClass below) - a downsample-shader instance can only ever
// be reused for another downsample-role slot, never for an upsample one, and vice versa. Reusing
// one avoids the compiled-shader-per-instance cost of constructing a fresh pyramid on every
// blur/unblur cycle, which is what originally drove the "over 50 separate shaders" warnings.
// Each pool is capped at roughly two pyramids' worth of passes (see effect_base.js).
const MAX_POOLED_SUB_EFFECTS = 8;
const DOWNSAMPLE_EFFECT_CACHE = [];
const UPSAMPLE_EFFECT_CACHE = [];

function _acquireSubEffect(is_downsample, params) {
    let cache = is_downsample ? DOWNSAMPLE_EFFECT_CACHE : UPSAMPLE_EFFECT_CACHE;
    if (cache.length > 0) {
        let effect = cache.pop();
        // Set pass_index/total_passes before anything uniform-dependent: _update_uniforms()
        // (forced below) depends on both, and their own setters have no side effects, so order
        // relative to radius/brightness/width/height doesn't matter for those two specifically.
        effect.pass_index = params.pass_index;
        effect.total_passes = params.total_passes;
        effect.radius = params.radius;
        effect.brightness = params.brightness;
        effect.width = params.width;
        effect.height = params.height;
        // Force a recompute of 'offset' regardless of whether any of the property setters above
        // actually changed a value - their own early-exit only re-runs _update_uniforms() when
        // the *value* changes, but 'offset' also depends on pass_index/total_passes, which will
        // essentially always differ from this instance's previous life in the pyramid.
        const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        effect._update_uniforms(scale_factor);
        effect.set_enabled(effect.radius > 0.);
        return effect;
    }
    return is_downsample ? new DualFilteringBlurEffect(params) : new DualFilteringUpEffect(params);
}

function _releaseSubEffect(effect) {
    let cache = (effect instanceof DualFilteringUpEffect) ? UPSAMPLE_EFFECT_CACHE : DOWNSAMPLE_EFFECT_CACHE;
    EffectBaseModule.releaseToPool(cache, effect, MAX_POOLED_SUB_EFFECTS);
}

// Called from the extension's disable(), after the top-level dual kawase pool has been drained
function drainPools() {
    EffectBaseModule.drainPool(DOWNSAMPLE_EFFECT_CACHE);
    EffectBaseModule.drainPool(UPSAMPLE_EFFECT_CACHE);
}

// An effect's shader is set once per class (see effect_base.js), so the downsample and upsample
// passes are two classes made here. DualFilteringBlurEffect, the downsample class, is also the
// first pass of every pyramid, which is the effect the rest of the extension creates and checks for.
function makeEffectClass(kind, shader_file) {
    return new GObject.registerClass({
        GTypeName: `DualFilteringBlurEffect${kind}_${Math.floor(Math.random() * 100000) + 1}`,
        Properties: {
            'radius': GObject.ParamSpec.double(
                `radius`,
                `Radius`,
                `Blur radius`,
                GObject.ParamFlags.READWRITE,
                0.0, 2000.0,
                0.0,
            ),
            'brightness': GObject.ParamSpec.double(
                `brightness`,
                `Brightness`,
                `Blur brightness`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                1.0,
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
            'pass_index': GObject.ParamSpec.int(
                `pass_index`,
                `Pass Index`,
                `Current step in pipeline`,
                GObject.ParamFlags.READWRITE,
                0, 16,
                0,
            ),
            'total_passes': GObject.ParamSpec.int(
                `total_passes`,
                `Total Passes`,
                `Total depth of the blur pyramid`,
                GObject.ParamFlags.READWRITE,
                1, 16,
                1,
            ),
        }
    }, class DualFilteringBlurEffect extends EffectBase {
        constructor(params) {
            super(params);

            this.pass_index = params?.pass_index ?? 0;
            this.total_passes = params?.total_passes ?? 1;
            this._sub_effects = []; 

            this.radius = params?.radius ?? 0;
            this.brightness = params?.brightness ?? 1;
            this.width = params?.width ?? 0;
            this.height = params?.height ?? 0;

            // Fetches the scale factor safely
            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            this._update_uniforms(theme_context.scale_factor);
            this.set_enabled(this.radius > 0.);
            this.set_uniform_value('brightness', parseFloat(this.brightness - 1e-6));
            this.set_uniform_value('width', parseFloat(this.width + 3.0 - 1e-6));
            this.set_uniform_value('height', parseFloat(this.height + 3.0 - 1e-6));
        }

        get_effect_source() {
            return this.get_shader_source(shader_file);
        }

        get_shader_source(shader_filename) {
          if (SHADER_CACHE[shader_filename]) {
            return SHADER_CACHE[shader_filename];
          }

          let file_name = GLib.get_user_data_dir() + '/cinnamon/extensions/' + UUID + "/6.0/" + shader_filename;
          try {
            let [ok, content] = GLib.file_get_contents(file_name);
            if (ok) {
              let decoded_shader = new TextDecoder().decode(content);
              SHADER_CACHE[shader_filename] = decoded_shader;
              return decoded_shader;
            }
          } catch (e) {
            global.logError(`BlurCinnamon: Error loading shader ${shader_filename}: ${e.message}`);
          }
          return null;
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

                if (this._sub_effects) {
                    // If the radius moved into a different pass-count tier,
                    // rebuild the pyramid instead of just re-tuning the
                    // existing passes' uniforms.
                    if (this.pass_index === 0 && _desiredPassCount(value) !== this.total_passes) {
                        let actor = this.get_actor();
                        if (actor) {
                            this.vfunc_set_actor(actor);
                        }
                    }

                    const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                    this._update_uniforms(scale_factor);
                    this.set_enabled(this.radius > 0.);

                    this._sub_effects.forEach(effect => { effect.radius = value; });
                }
            }
        }

        // The furthest distance (in pixels, along one axis) from a pixel that the whole pyramid can sample.
        // Every pass runs at full resolution, so the passes' reaches simply add up: a downsample pass
        // samples out to 0.5 * offset (its diagonal taps) and an upsample pass out to 1.5 * offset (its
        // cross taps), where the offsets follow _update_uniforms().
        get sample_reach() {
            if (this.radius <= 0)
                return 0;
            const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            const total = _desiredPassCount(this.radius);
            const midpoint = Math.floor(total / 2);
            const base = Math.min(this.radius, 100.0) * _baseOffsetMultiplier(total) * scale_factor;
            let reach = 0;
            for (let i = 0; i < total; i++) {
                if (i <= midpoint)
                    reach += 0.5 * base * Math.pow(2.0, i);
                else
                    reach += 1.5 * base * Math.pow(2.0, (total - 1) - i);
            }
            return reach;
        }

        get brightness() {
            return this._brightness;
        }

        set brightness(value) {
            if (this._brightness !== value) {
                this._brightness = value;

                if (this._sub_effects) {
                    this.set_uniform_value('brightness', parseFloat(this._brightness - 1e-6));
                    this._sub_effects.forEach(effect => { effect.brightness = value; });
                }
            }
        }

        get width() {
            return this._width;
        }

        set width(value) {
            if (this._width !== value) {
                this._width = value;

                if (this._sub_effects) {
                    this.set_uniform_value('width', parseFloat(this._width + 3.0 - 1e-6));
                    this._sub_effects.forEach(effect => { effect.width = value; });
                }
            }
        }

        get height() {
            return this._height;
        }

        set height(value) {
            if (this._height !== value) {
                this._height = value;

                if (this._sub_effects) {
                    this.set_uniform_value('height', parseFloat(this._height + 3.0 - 1e-6));
                    this._sub_effects.forEach(effect => { effect.height = value; });
                }
            }
        }

        get pass_index() {
            return this._pass_index;
        }

        set pass_index(value) {
            this._pass_index = value;
        }

        get total_passes() {
            return this._total_passes;
        }

        set total_passes(value) {
            this._total_passes = value;
        }

        _update_uniforms(scale_factor) {
            // Treat the UI radius as an intensity percentage 
            let effective_radius = Math.min(this.radius, 100.0); 
            // The fewer the passes,
            // the greater the initial spacing required to maintain the linearity of the blur effect
            let multiplier = _baseOffsetMultiplier(this.total_passes);
            let base_offset = effective_radius * multiplier;

            // Calculate spatial spread mathematically
            let midpoint = Math.floor(this.total_passes / 2);
            let step_multiplier = 1.0;

            if (this.pass_index <= midpoint) {
                // Downsample: spread increases as we go deeper
                step_multiplier = Math.pow(2.0, this.pass_index);
            } else {
                // Upsample: spread decreases as we come back up
                let up_index = (this.total_passes - 1) - this.pass_index;
                step_multiplier = Math.pow(2.0, up_index);
            }

            let calculated_offset = base_offset * scale_factor * step_multiplier;
            this.set_uniform_value('offset', parseFloat(calculated_offset - 1e-6));
        }

        _update_chain_uniforms() {
            const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

            this._update_uniforms(scale_factor);
            this.queue_repaint();

            for (const effect of this._sub_effects ?? []) {
                effect._update_uniforms(scale_factor);
                effect.queue_repaint();
            }
        }

        vfunc_pre_paint(paintContext) {
            if (!super.vfunc_pre_paint(paintContext))
                return false;
            Utils.extendOffscreenViewport(paintContext, this.get_actor());
            return true;
        }

        vfunc_set_actor(actor) {
            if (this._actor_connection_size_id) {
                let old_actor = this.get_actor();
                old_actor?.disconnect(this._actor_connection_size_id);
            }

            if (this._scale_connection_id) {
                St.ThemeContext.get_for_stage(global.stage).disconnect(this._scale_connection_id);
                this._scale_connection_id = null;
            }

            if (actor) {
                this.width = actor.width;
                this.height = actor.height;
                // Only connect to size/scale signals for the first pass
                if (this.pass_index === 0) {
                    this._actor_connection_size_id = actor.connect('notify::size', _ => {
                        this.width = actor.width;
                        this.height = actor.height;
                    });

                    this._scale_connection_id = St.ThemeContext.get_for_stage(global.stage).connect('notify::scale-factor', () => this._update_chain_uniforms());
                }
            } else {
                this._actor_connection_size_id = null;
            }

            super.vfunc_set_actor(actor);

            if (this.pass_index === 0) {
                if (this._sub_effects) {
                    this._sub_effects.forEach(effect => {
                        try {
                            let current_actor = effect.get_actor();
                            if (current_actor) current_actor.remove_effect(effect);
                        } catch (e) {
                            // Ignores silently if the actor has already been cleaned up by the Cinnamon engine
                        }
                        // Release into the shared pool instead of destroying it, so some other
                        // pyramid can reuse its already-compiled shader later instead of
                        // triggering a fresh compile.
                        try {
                            _releaseSubEffect(effect);
                        } catch (e) {
                            // Ignores silently if the actor has already been cleaned up by the Cinnamon engine
                        }
                    });
                }
                this._sub_effects = [];

                if (actor !== null && actor !== undefined) {
                    let total_depth = _desiredPassCount(this.radius);

                    this.total_passes = total_depth;

                    let midpoint = Math.floor(total_depth / 2);
                    for (let i = 1; i < total_depth; i++) {
                        let is_downsample = (i <= midpoint);
                        let new_pass = _acquireSubEffect(is_downsample, {
                            radius: this.radius, 
                            brightness: this.brightness, 
                            width: this.width, 
                            height: this.height, 
                            pass_index: i,
                            total_passes: total_depth 
                        });

                        this._sub_effects.push(new_pass);
                        actor.add_effect(new_pass);
                    }
                  
                    if (actor)
                        this._update_chain_uniforms();
                }
            }
        }

        vfunc_paint_target(...params) {
            // Identifies the last pass in the pyramid to apply final color grading
            let is_last = (this._sub_effects && this.pass_index === this.total_passes - 1) ? 1 : 0;
            this.set_uniform_value("is_last_pass", is_last);
            super.vfunc_paint_target(...params);
        }
    });
}

var DualFilteringBlurEffect = makeEffectClass('Down', 'dual_filtering_down.glsl');
var DualFilteringUpEffect = makeEffectClass('Up', 'dual_filtering_up.glsl');
