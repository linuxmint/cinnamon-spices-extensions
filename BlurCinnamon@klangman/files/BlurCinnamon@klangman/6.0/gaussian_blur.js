// This code is copied from Blur My Shell (https://github.com/aunetx/blur-my-shell) Aurélien Hamy
// Modified for Cinnamon by Kevin Langman

const GObject = imports.gi.GObject;

const St = imports.gi.St;
const Utils    = require("./utils.js");
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const EffectBaseModule = require("./effect_base");
const EffectBase = EffectBaseModule.EffectBase;

const UUID = "BlurCinnamon@klangman";

const SHADER_FILENAME = 'gaussian_blur.glsl';
const DEFAULT_PARAMS = {
    radius: 30, brightness: .6,
    width: 0, height: 0, direction: 0, chained_effect: null
};

// Pool of released direction=1 "chained" effects, keyed by nothing in particular - any one of
// them can serve any future top-level (direction=0) instance's chained partner, since they're
// all identical in shape and just need their radius/brightness/width/height refreshed. Reusing
// one avoids constructing a fresh GaussianBlurEffect. Capped like BlurBase's gaussian pool (one
// chained effect per top-level effect); see effect_base.js.
const CHAINED_EFFECT_CACHE = [];

function _acquireChainedEffect(params) {
    if (CHAINED_EFFECT_CACHE.length > 0) {
        let effect = CHAINED_EFFECT_CACHE.pop();
        effect.radius = params.radius;
        effect.brightness = params.brightness;
        effect.width = params.width;
        effect.height = params.height;
        return effect;
    }
    return new GaussianBlurEffect({ ...params, direction: 1 });
}

function _releaseChainedEffect(effect) {
    EffectBaseModule.releaseToPool(CHAINED_EFFECT_CACHE, effect);
}

// Called from the extension's disable(), after the top-level gaussian pool has been drained
function drainPools() {
    EffectBaseModule.drainPool(CHAINED_EFFECT_CACHE);
}


const GaussianBlurEffect =
    new GObject.registerClass({
        GTypeName: `GaussianBlurEffect_${Math.floor(Math.random() * 100000) + 1}`,
        Properties: {
            'radius': GObject.ParamSpec.double(
                `radius`,
                `Radius`,
                `Blur radius`,
                GObject.ParamFlags.READWRITE,
                0.0, 2000.0,
                30.0,
            ),
            'brightness': GObject.ParamSpec.double(
                `brightness`,
                `Brightness`,
                `Blur brightness`,
                GObject.ParamFlags.READWRITE,
                0.0, 1.0,
                0.6,
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
            'direction': GObject.ParamSpec.int(
                `direction`,
                `Direction`,
                `Direction`,
                GObject.ParamFlags.READWRITE,
                0, 1,
                0,
            ),
            'chained_effect': GObject.ParamSpec.object(
                `chained_effect`,
                `Chained Effect`,
                `Chained Effect`,
                GObject.ParamFlags.READWRITE,
                GObject.Object,
            ),
        }
    }, class GaussianBlurEffect extends EffectBase {
        constructor(params) {
            super(params);

            if (params && params.radius != undefined )
               this.radius = params.radius;
            else
               this.radius = 30;

            if (params && params.brightness !== undefined)
               this.brightness = params.brightness;
            else
               this.brightness = 0.6;

            if (params && params.width)
               this.width = params.width;
            else
               this.width = 0;

            if (params && params.height)
               this.height = params.height;
            else
               this.height = 0;

            if (params && params.direction)
               this.direction = params.direction;
            else
               this.direction = 0;

            if (params && params.chained_effect)
               this.chained_effect = params.chained_effect;
            else
               this.chained_effect = null;

            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            this.set_uniform_value('sigma', parseFloat(this.radius * theme_context.scale_factor / 2 - 1e-6));
            this.set_enabled(this.radius > 0.);
        }

        get_effect_source() {
            return this.get_shader_source(SHADER_FILENAME);
        }

        get_shader_source(shader_filename) {
            let file_name = GLib.get_user_data_dir() + '/cinnamon/extensions/' + UUID + "/6.0/" + shader_filename;
            let [ok, content] = GLib.file_get_contents(file_name);
            return (new TextDecoder().decode(content));
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

                const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

                // like Clutter, we use the assumption radius = 2*sigma
                this.set_uniform_value('sigma', parseFloat(this._radius * scale_factor / 2 - 1e-6));
                this.set_enabled(this.radius > 0.);

                if (this.chained_effect)
                    this.chained_effect.radius = value;
            }
        }

        // The furthest distance (in pixels, along one axis) from a pixel that gaussian_blur.glsl samples:
        // the loop takes 2*ceil(1.5*sigma) steps out from the centre, i.e. about 3 sigma.
        get sample_reach() {
            if (this._radius <= 0)
                return 0;
            const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            return 2 * Math.ceil(1.5 * (this._radius * scale_factor / 2));
        }

        get brightness() {
            return this._brightness;
        }

        set brightness(value) {
            if (this._brightness !== value) {
                this._brightness = value;

                this.set_uniform_value('brightness', parseFloat(this._brightness - 1e-6));

                if (this.chained_effect)
                    this.chained_effect.brightness = value;
            }
        }

        get width() {
            return this._width;
        }

        set width(value) {
            if (this._width !== value) {
                this._width = value;

                this.set_uniform_value('width', parseFloat(this._width + 3.0 - 1e-6));

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

                if (this.chained_effect)
                    this.chained_effect.height = value;
            }
        }

        get direction() {
            return this._direction;
        }

        set direction(value) {
            if (this._direction !== value)
                this._direction = value;
        }

        get chained_effect() {
            return this._chained_effect;
        }

        set chained_effect(value) {
            this._chained_effect = value;
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
                this._actor_connection_size_id = actor.connect('notify::size', _ => {
                    this.width = actor.width;
                    this.height = actor.height;
                });

                this._scale_connection_id = St.ThemeContext.get_for_stage(global.stage).connect('notify::scale-factor', () => {
                    const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                    this.set_uniform_value('sigma', parseFloat(this._radius * scale_factor / 2 - 1e-6));
                });
            } else {
                this._actor_connection_size_id = null;
            }

            super.vfunc_set_actor(actor);
            
            if (actor) {
               const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
               this.set_uniform_value('sigma', parseFloat(this._radius * scale_factor / 2 - 1e-6));
            }
          
            if (this.direction == 0) {
                if (this.chained_effect) {
                    // Detach the existing chained_effect from its old actor first.
                    try {
                        let current_actor = this.chained_effect.get_actor();
                        if (current_actor) current_actor.remove_effect(this.chained_effect);
                    } catch (e) {}

                    if (actor !== null && actor !== undefined) {
                        // If its old actor was destroyed under it, reattaching it would log
                        // criticals (see effect_base.js), so use a fresh one instead.
                        if (EffectBaseModule.shouldDiscard(this.chained_effect)) {
                            _releaseChainedEffect(this.chained_effect);
                            this.chained_effect = _acquireChainedEffect({
                                radius: this.radius, brightness: this.brightness,
                                width: this.width, height: this.height
                            });
                        }
                        // Reuse the SAME chained_effect instance rather than destroying it and
                        // constructing a fresh one - refresh its properties (going through the
                        // normal setters keeps its own uniforms in sync) and just move it to the
                        // new actor. This is what avoids recompiling its shader program on every
                        // reattachment (e.g. every time a cached top-level effect - see
                        // BlurBase's effect caches in extension.js - gets acquired and reattached
                        // to a different window's actor).
                        this.chained_effect.radius = this.radius;
                        this.chained_effect.brightness = this.brightness;
                        this.chained_effect.width = this.width;
                        this.chained_effect.height = this.height;
                        actor.add_effect(this.chained_effect);
                    } else {
                        // Real teardown (not just a reattachment) - release the chained_effect
                        // into the shared pool instead of discarding it, so some other
                        // GaussianBlurEffect can reuse its already-compiled shader later instead
                        // of triggering a fresh compile.
                        _releaseChainedEffect(this.chained_effect);
                        this.chained_effect = null;
                    }
                } else if (actor !== null && actor !== undefined) {
                    // First attach - acquire one (from the pool if available, otherwise a fresh
                    // instance) rather than always constructing new.
                    this.chained_effect = _acquireChainedEffect({
                        radius: this.radius,
                        brightness: this.brightness,
                        width: this.width,
                        height: this.height
                    });
                    actor.add_effect(this.chained_effect);
                }
            }
        }

        vfunc_paint_target(...params) {
            this.set_uniform_value("dir", this.direction);

            super.vfunc_paint_target(...params);
        }
    });
