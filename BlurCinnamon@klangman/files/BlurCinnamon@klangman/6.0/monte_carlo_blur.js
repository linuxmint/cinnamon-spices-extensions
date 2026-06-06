// This code is copied from Blur My Shell (https://github.com/aunetx/blur-my-shell) Aurélien Hamy
// Modified for Cinnamon by Kevin Langman

const GObject = imports.gi.GObject;

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const UUID = "BlurCinnamon@klangman";

const SHADER_FILENAME = 'monte_carlo_blur.glsl';
const DEFAULT_PARAMS = {
    radius: 2., iterations: 5, brightness: .6,
    width: 0, height: 0, use_base_pixel: true,
    prefer_closer_pixels: true
};


const MonteCarloBlurEffect =
    new GObject.registerClass({
        GTypeName: `MonteCarloBlurEffect_${Math.floor(Math.random() * 100000) + 1}`,
        Properties: {
            'radius': GObject.ParamSpec.double(
                `radius`,
                `Radius`,
                `Blur radius`,
                GObject.ParamFlags.READWRITE,
                0.0, 2000.0,
                2.0,
            ),
            'iterations': GObject.ParamSpec.int(
                `iterations`,
                `Iterations`,
                `Blur iterations`,
                GObject.ParamFlags.READWRITE,
                0, 64,
                5,
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
            'use_base_pixel': GObject.ParamSpec.boolean(
                `use_base_pixel`,
                `Use base pixel`,
                `Use base pixel`,
                GObject.ParamFlags.READWRITE,
                true,
            ),
            'prefer_closer_pixels': GObject.ParamSpec.boolean(
                `prefer_closer_pixels`,
                `Prefer closer pixels`,
                `Prefer closer pixels`,
                GObject.ParamFlags.READWRITE,
                true,
            ),
        }
    }, class MonteCarloBlurEffect extends Clutter.ShaderEffect {
        constructor(params) {
            super(params);

            if (params && params.radius != undefined )
               this.radius = params.radius;
            else
               this.radius = 2.0;

            if (params && params.iterations != undefined )
               this.iterations = params.iterations;
            else
               this.iterations = 5;

            if (params && params.brightness != undefined )
               this.brightness = params.brightness;
            else
               this.brightness = 0.6;

            if (params && params.width != undefined )
               this.width = params.width;
            else
               this.width = 0;

            if (params && params.height != undefined )
               this.height = params.height;
            else
               this.height = 0;

            if (params && params.use_base_pixel != undefined )
               this.use_base_pixel = params.use_base_pixel;
            else
               this.use_base_pixel = true;

            if (params && params.prefer_closer_pixels != undefined )
               this.prefer_closer_pixels = params.prefer_closer_pixels;
            else
               this.prefer_closer_pixels = true;

            // set shader source
            this._source = this.get_shader_source(SHADER_FILENAME);
            if (this._source)
                this.set_shader_source(this._source);

            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            theme_context.connect(
                'notify::scale-factor',
                _ => this.set_uniform_value('radius',
                    parseFloat(this._radius * theme_context.scale_factor - 1e-6)
                )
            );
        }

        get_shader_source(shader_filename) {
            let file_name = GLib.get_home_dir() + '/.local/share/cinnamon/extensions/' + UUID + "/6.0/" + shader_filename;
            let [ok, content] = GLib.file_get_contents(file_name);
            return (new TextDecoder().decode(content));
        }

        static get default_params() {
            return DEFAULT_PARAMS;
        }

        get radius() {
            return this._radius*10;
        }

        set radius(value) {
            if (this._radius !== value/10) {
                this._radius = value/10;

                const scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

                this.set_uniform_value('radius', parseFloat(this._radius * scale_factor - 1e-6));
                this.set_enabled(this.radius > 0. && this.iterations > 0);
            }
        }

        get iterations() {
            return this._iterations;
        }

        set iterations(value) {
            if (this._iterations !== value) {
                this._iterations = value;

                this.set_uniform_value('iterations', this._iterations);
                this.set_enabled(this.radius > 0. && this.iterations > 0);
            }
        }

        get brightness() {
            return this._brightness;
        }

        set brightness(value) {
            if (this._brightness !== value) {
                this._brightness = value;

                this.set_uniform_value('brightness', parseFloat(this._brightness - 1e-6));
            }
        }

        get width() {
            return this._width;
        }

        set width(value) {
            if (this._width !== value) {
                this._width = value;

                this.set_uniform_value('width', parseFloat(this._width + 3.0 - 1e-6));
            }
        }

        get height() {
            return this._height;
        }

        set height(value) {
            if (this._height !== value) {
                this._height = value;

                this.set_uniform_value('height', parseFloat(this._height + 3.0 - 1e-6));
            }
        }

        get use_base_pixel() {
            return this._use_base_pixel;
        }

        set use_base_pixel(value) {
            if (this._use_base_pixel !== value) {
                this._use_base_pixel = value;

                this.set_uniform_value('use_base_pixel', this._use_base_pixel ? 1 : 0);
            }
        }

        get prefer_closer_pixels() {
            return this._prefer_closer_pixels;
        }

        set prefer_closer_pixels(value) {
            if (this._prefer_closer_pixels !== value) {
                this._prefer_closer_pixels = value;

                this.set_uniform_value('prefer_closer_pixels', this._prefer_closer_pixels ? 1 : 0);
            }
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
            }
            else
                this._actor_connection_size_id = null;

            super.vfunc_set_actor(actor);
        }
    });