const Lang = imports.lang;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const HOTKEY = "<Ctrl><Alt>i::"

const InvertScreenEffect = new Lang.Class({
	Name: 'InvertScreenEffect',
	Extends: Clutter.ShaderEffect,

	vfunc_get_static_shader_source: function() {
		return ' \
			uniform sampler2D tex; \
			void main() { \
				vec4 color = texture2D(tex, cogl_tex_coord_in[0].st); \
				if(color.a > 0.0) { \
					color.rgb /= color.a; \
				} \
				color.rgb = vec3(1.0, 1.0, 1.0) - color.rgb; \
				color.rgb *= color.a; \
				cogl_color_out = color * cogl_color_in; \
			} \
		';
	},

	vfunc_paint_target: function(...args) {
		this.set_uniform_value("tex", 0);
		this.parent(...args);
	}
});

function init() { }
function disable() { Main.keybindingManager.removeHotKey("invert-colors-kb"); }
function enable() {
	Main.keybindingManager.addHotKey(
		"invert-colors-kb",
		HOTKEY,
		function() {
            if(Main.uiGroup.get_effect('invert-screen-color')) {
			    Main.uiGroup.remove_effect_by_name('invert-screen-color');
		    }
		    else {
			    let effect = new InvertScreenEffect();
			    Main.uiGroup.add_effect_with_name('invert-screen-color', effect);
			}
		}
	)
}
