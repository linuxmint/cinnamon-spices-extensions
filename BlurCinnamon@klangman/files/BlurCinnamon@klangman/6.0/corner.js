// borrowed from Blur-my-shell / Aurélien Hamy
// modified for Cinnamon by Kevin Langman 2025

const GObject  = imports.gi.GObject;
const St       = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Utils    = require("./utils.js");
const Clutter  = imports.gi.Clutter;
const Gio      = imports.gi.Gio;
const GLib     = imports.gi.GLib;

const EffectBase = (typeof global === 'undefined') ? null : require("./effect_base").EffectBase;

const SHADER_FILENAME = 'corner.glsl';
// The uuid passed to the first CornerEffect, for get_effect_source()
let shaderUuid = null;
const DEFAULT_PARAMS = {
    radius: 12, width: 0, height: 0,
    corners_top: true, corners_bottom: true,
    clip: [0, 0, -1, -1]
};

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
        GTypeName: `CornerEffect_${Math.floor(Math.random() * 100000) + 1}`,
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
        constructor(uuid, params) {
            shaderUuid = uuid;
            super(params);

            this._clip_x0 = null;
            this._clip_y0 = null;
            this._clip_width = null;
            this._clip_height = null;

            this._radius = params.radius ?? DEFAULT_PARAMS.radius;
            this._width = (params.width) ? params.width : DEFAULT_PARAMS.width;
            this._height = (params.height) ? params.height : DEFAULT_PARAMS.height;
            // corners_top/corners_bottom are booleans, so `params.corners_top ? ... : default`
            // silently discarded an explicit `false` (a falsy value indistinguishable from "not
            // provided" under that pattern) and fell back to DEFAULT_PARAMS's `true`. Check for
            // undefined instead, so an explicit false is respected.
            this._corners_top = (params.corners_top !== undefined) ? params.corners_top : DEFAULT_PARAMS.corners_top;
            this._corners_bottom = (params.corners_bottom !== undefined) ? params.corners_bottom : DEFAULT_PARAMS.corners_bottom;
            this._clip = (params.clip) ? params.clip : DEFAULT_PARAMS.clip;

            // Safe fetch of the current scale factor 
            this.update_radius();
        }

        get_effect_source() {
            return loadShaderResource(shaderUuid, SHADER_FILENAME);
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

                this.set_uniform_value('width', parseFloat(this._width + 3.0 - 1e-6));
                this.update_radius();
            }
        }

        get height() {
            return this._height;
        }

        set height(value) {
            if (this._height !== value) {
                this._height = value;

                this.set_uniform_value('height', parseFloat(this._height + 3.0 - 1e-6));
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
            this.set_uniform_value('clip_width', parseFloat(this._clip_width + 3 - 1e-6));
            this.set_uniform_value('clip_height', parseFloat(this._clip_height + 3 - 1e-6));
            this.update_radius();
        }

        set_viewport_clip(value) {
            if (!Array.isArray(value) || value.length !== 4 ||
                !Number.isFinite(value[0]) || !Number.isFinite(value[1]) ||
                !Number.isFinite(value[2]) || !Number.isFinite(value[3]) ||
                value[2] <= 0 || value[3] <= 0) {
              
                this._clip_x0 = this._clip_y0 = this._clip_width = this._clip_height = 0;

                // Puts the mask outside the texture
                this.set_uniform_value('clip_x0', -1.000001);
                this.set_uniform_value('clip_y0', -1.000001);
                this.set_uniform_value('clip_width', 1e-6);
                this.set_uniform_value('clip_height', 1e-6);
                this.update_radius();
                return;
            }
            [this._clip_x0, this._clip_y0, this._clip_width, this._clip_height] = value;
            this.set_uniform_value('clip_x0', parseFloat(this._clip_x0 + 2 - 1e-6));
            this.set_uniform_value('clip_y0', parseFloat(this._clip_y0 + 2 - 1e-6));
            this.set_uniform_value('clip_width', parseFloat(Math.max(1e-6, this._clip_width - 1e-6)));
            this.set_uniform_value('clip_height', parseFloat(Math.max(1e-6, this._clip_height - 1e-6)));
            this.update_radius();
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

            if (this._actor_connection_clip_rect_id) {
                let old_actor = this.get_actor();
                old_actor?.disconnect(this._actor_connection_clip_rect_id);
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

                this.clip = actor.has_clip ? actor.get_clip() : [0, 0, -10, -10];
                this._actor_connection_clip_rect_id = actor.connect('notify::clip-rect', _ => {
                    this.clip = actor.has_clip ? actor.get_clip() : [0, 0, -10, -10];
                });

                this._scale_connection_id = St.ThemeContext.get_for_stage(global.stage).connect('notify::scale-factor', () => {
                    this.update_radius();
                });
            } else {
                this._actor_connection_size_id = null;
                this._actor_connection_clip_rect_id = null;
            }

            super.vfunc_set_actor(actor);
        }
    });
