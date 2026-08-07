// Implemented based on the Dual Kawase Blur method described in SIGGRAPH 2015 by Marius Bjørge
// Optimized for Cinnamon by stacking progressive multi-pass shader effects

const GObject  = imports.gi.GObject;
const St       = imports.gi.St;
const Clutter  = imports.gi.Clutter;
const GLib     = imports.gi.GLib;

const UUID = "BlurCinnamon@klangman";

const DEFAULT_PARAMS = {
    radius: 0, brightness: 1,
    width: 0, height: 0, 
    pass_index: 0, total_passes: 1, chained_effect: null
};

var DualFilteringBlurEffect =
    new GObject.registerClass({
        GTypeName: `DualFilteringBlurEffect_${Math.floor(Math.random() * 100000) + 1}`,
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
            'chained_effect': GObject.ParamSpec.object(
                `chained_effect`,
                `Chained Effect`,
                `Chained Effect`,
                GObject.ParamFlags.READWRITE,
                GObject.Object,
            ),
        }
    }, class DualFilteringBlurEffect extends Clutter.ShaderEffect {
        constructor(params) {
            super(params);

            this.pass_index = params?.pass_index ?? 0;
            this.total_passes = params?.total_passes ?? 1;
            this._sub_effects = []; 

            // Determines Downsample vs Upsample based on the midpoint of the pyramid
            let is_downsample = (this.pass_index <= Math.floor(this.total_passes / 2));
            let shader_file = is_downsample ? 'dual_filtering_down.glsl' : 'dual_filtering_up.glsl';

            this._source = this.get_shader_source(shader_file);
            if (this._source)
                this.set_shader_source(this._source);

            this.radius = params?.radius ?? 0;
            this.brightness = params?.brightness ?? 1;
            this.width = params?.width ?? 0;
            this.height = params?.height ?? 0;
            this.chained_effect = params?.chained_effect ?? null;

            // Fetches the scale factor safely
            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            this._update_uniforms(theme_context.scale_factor);
            this.set_enabled(this.radius > 0.);
            this.set_uniform_value('brightness', parseFloat(this.brightness - 1e-6));
            this.set_uniform_value('width', parseFloat(this.width + 3.0 - 1e-6));
            this.set_uniform_value('height', parseFloat(this.height + 3.0 - 1e-6));
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

                if (this._sub_effects) {
                    const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                    this._update_uniforms(scale_factor);
                    this.set_enabled(this.radius > 0.);

                    this._sub_effects.forEach(effect => { effect.radius = value; });
                }
            }
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

        get chained_effect() {
            return this._chained_effect;
        }

        set chained_effect(value) {
            this._chained_effect = value;
        }

        _update_uniforms(scale_factor) {
            // Treat the UI radius as an intensity percentage 
            let effective_radius = Math.min(this.radius, 100.0); 
            let base_offset = effective_radius * 0.08;

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
                    this._update_uniforms(St.ThemeContext.get_for_stage(global.stage).scale_factor);
                });
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
                    });
                }
                this._sub_effects = [];

                if (actor !== null && actor !== undefined) {
                    let total_depth = 7;

                    this.total_passes = total_depth;
                    this.chained_effect = this; 

                    for (let i = 1; i < total_depth; i++) {
                        let new_pass = new DualFilteringBlurEffect({ 
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
