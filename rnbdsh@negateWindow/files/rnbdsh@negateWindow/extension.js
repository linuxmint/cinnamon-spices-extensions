const Lang = imports.lang;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;

//change this to the key combination you wish
const HOTKEY = "<Super>i::"

//TODO: idea for additional new plugin: invert if overall color average < 50%, onWindowOpen

/* Used as a template: 0dyseus@CinnamonTweaks
Code for inversion shader: https://github.com/maiself/gnome-shell-extension-invert-color; 
Original idea: gnome invert window extention;  https://extensions.gnome.org/extension/1041/invert-window-color/
Coded from 2AM - 5AM, so don't expect too much, but it works
*/

//1:1 copy from gnome invert window
const InvertWindowEffect = new Lang.Class({
	Name: 'InvertWindowEffect',
	Extends: Clutter.ShaderEffect,

	_init: function(params) {
		this.parent(params);
		this.set_shader_source(' \
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
		');
	},

	vfunc_paint_target: function() {
		this.set_uniform_value("tex", 0);
		this.parent();
	}
});

//every extension.js must have init+enable+disable
function init() { }
function disable() { Main.keybindingManager.removeHotKey("super_unique_id_for_negate_window"); }
function enable() {
	Main.keybindingManager.addHotKey(
		"super_unique_id_for_negate_window",
		HOTKEY,
		function() {
				//search all existing windows to find the focussed one
				global.get_window_actors().forEach(function(actor) {
				let meta_window = actor.get_meta_window();
					if(meta_window.has_focus()) {
						
						//then apply our inversion-effect on it.
						let effect = new InvertWindowEffect();
						//we could also disable it, if it is applied 2 times, but inversion cancels each other out.
						//however, doing this 1000 times could cause some load due to stacked shaders
						actor.add_effect_with_name('invert-color', effect);
					}
				}
			)
		}
	)
}
