// This code is copied from Blur My Shell (https://github.com/aunetx/blur-my-shell) Aurélien Hamy
// Modified for Cinnamon by Kevin Langman

const GObject = imports.gi.GObject;

const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const UUID = "BlurCinnamon@klangman";

const SHADER_FILENAME = 'gaussian_blur.glsl';
const DEFAULT_PARAMS = {
    radius: 30, brightness: .6,
    width: 0, height: 0, direction: 0, chained_effect: null
};


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
    }, class GaussianBlurEffect extends Clutter.ShaderEffect {
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

            // set shader source
            this._source = this.get_shader_source(SHADER_FILENAME);
            if (this._source)
                this.set_shader_source(this._source);

            const theme_context = St.ThemeContext.get_for_stage(global.stage);
            theme_context.connect(
                'notify::scale-factor', () => {
                this.set_uniform_value('sigma', parseFloat(this.radius * theme_context.scale_factor / 2 - 1e-6) );
                }
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

            if (this.direction == 0) {
                if (this.chained_effect)
                    this.chained_effect.get_actor()?.remove_effect(this.chained_effect);
                else
                    this.chained_effect = new GaussianBlurEffect({
                        radius: this.radius,
                        brightness: this.brightness,
                        width: this.width,
                        height: this.height,
                        direction: 1
                    });
                if (actor !== null)
                    actor.add_effect(this.chained_effect);
            }
        }

        vfunc_paint_target(...params) {
            this.set_uniform_value("dir", this.direction);

            super.vfunc_paint_target(...params);
        }
    });