// Based on and thanks to:
// https://github.com/linuxmint/cinnamon-spices-applets/tree/master/color-blind-filters%40rcalixte
// https://github.com/linuxmint/cinnamon-spices-extensions/tree/master/rnbdsh%40negateWindow

// Invert screen/window colors with user defined keyboard shortcuts

const Lang = imports.lang;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;
const UUID = "invertscreencolors@ilijaculap";

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
function disable() {
	// Remove keybindings on disable
	Main.keybindingManager.removeHotKey("invert-colors-fs-kb");
	Main.keybindingManager.removeHotKey("invert-colors-wd-kb");
}
function enable() {
	// Import settings
    var settings = new Settings.ExtensionSettings(this, UUID);

	// Bind settings buttons
    settings.bindProperty(Settings.BindingDirection.IN, 'kb-shortcut-fs', 'kb-shortcut-fs', enable, null);
    settings.bindProperty(Settings.BindingDirection.IN, 'kb-shortcut-wd', 'kb-shortcut-wd', enable, null);

	// Assign hotkeys from settings
    var HOTKEY_FS = settings.getValue("kb-shortcut-fs");
    var HOTKEY_WD = settings.getValue("kb-shortcut-wd");

    // Invert colors on whole screen
	Main.keybindingManager.addHotKey(
		"invert-colors-fs-kb",
		HOTKEY_FS,
		function() {
            if(Main.uiGroup.get_effect('invert-screen-color')) {
			    Main.uiGroup.remove_effect_by_name('invert-screen-color');
		    }
		    else {
			    let effect_fs = new InvertScreenEffect();
			    Main.uiGroup.add_effect_with_name('invert-screen-color', effect_fs);
			}
		}
	)

	// Invert colors for active window
	Main.keybindingManager.addHotKey(
		"invert-colors-wd-kb",
		HOTKEY_WD,
		function() {
				global.get_window_actors().forEach(function(actor) {
				let meta_window = actor.get_meta_window();
					if(meta_window.has_focus()) {
						if(actor.get_effect('invert-window-color')) {
			    			actor.remove_effect_by_name('invert-window-color');
		    			}
		    			else {
			    			let effect_wd = new InvertScreenEffect();
			    			actor.add_effect_with_name('invert-window-color', effect_wd);
						}
					}
				}
			)
		}
	)
}

