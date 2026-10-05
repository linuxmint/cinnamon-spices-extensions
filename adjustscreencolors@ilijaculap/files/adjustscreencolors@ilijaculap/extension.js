// Based on and thanks to:
// https://github.com/linuxmint/cinnamon-spices-applets/tree/master/color-blind-filters%40rcalixte
// https://github.com/linuxmint/cinnamon-spices-extensions/tree/master/rnbdsh%40negateWindow
// https://godotshaders.com/shader/sprites-hsv-and-brightness-contrast-controll/
// https://godotshaders.com/shader/sprites-hsv-and-brightness-contrast-controll/

// Adjust screen/window colors with user defined keyboard shortcuts

const Lang = imports.lang;
const Main = imports.ui.main;
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;
const UUID = "adjustscreencolors@ilijaculap";

var HOTKEY = "";
var SETTINGS = "";
var PROPERTIES = [0.0, 1.0, 1.0, 0.0, 1.0, 1.0];
var AREA = "";

const CorrectColors = new Lang.Class({
	Name: 'CorrectColors',
	Extends: Clutter.ShaderEffect,
	vfunc_get_static_shader_source() { return correctionShader(); },

	vfunc_paint_target: function(...args) {
		
		this.set_uniform_value("tex", 0);
		this.set_uniform_value("hue_shift", PROPERTIES[0]);  
		this.set_uniform_value("saturation_mult", PROPERTIES[1]);
		this.set_uniform_value("value_mult", PROPERTIES[2]);
		this.set_uniform_value("brightness_add", PROPERTIES[3]);
		this.set_uniform_value("contrast_mult", PROPERTIES[4]);
		this.set_uniform_value("gamma", PROPERTIES[5]);
		this.parent(...args);
	}
});

function correctionShader() {
    return `
			// Define variables for texture and correction
			uniform sampler2D tex;
			uniform float hue_shift = 0.0;
			uniform float saturation_mult = 1.0;
			uniform float value_mult = 1.0;
			uniform float brightness_add = 0.0;
			uniform float contrast_mult = 1.0;
			uniform float gamma = 1.0;
           
			void main() {
				vec4 color = texture2D(tex, cogl_tex_coord_in[0].st);
				vec3 color_rgb = color.rgb;
				color_rgb = (color_rgb - 0.5) * contrast_mult + 0.5 + brightness_add;

				// Convert RGB to HSV
				float cMax = max(max(color_rgb.r, color_rgb.g), color_rgb.b);
				float cMin = min(min(color_rgb.r, color_rgb.g), color_rgb.b);
				float delta = cMax - cMin;
				float h = 0.0;
				if(delta < 0.00001) {
					h = 0.0;
				} else if(cMax == color_rgb.r) {
					h = mod(((color_rgb.g - color_rgb.b) / delta), 6.0);
				} else if(cMax == color_rgb.g) {
					h = ((color_rgb.b - color_rgb.r) / delta) + 2.0;
				} else {
					h = ((color_rgb.r - color_rgb.g) / delta) + 4.0;
				}
				h /= 6.0;
				if(h < 0.0) h += 1.0;
				float s = (cMax <= 0.0) ? 0.0 : (delta / cMax);
				float v = cMax;
				vec3 color_hsv = vec3(h, s, v);
				
				// Manipulate HSV,
				color_hsv.x = mod(color_hsv.x + hue_shift, 1.0);
				color_hsv.y *= saturation_mult;
				color_hsv.z *= value_mult;

				// Convert HSV to RGB
				float h2 = color_hsv.x * 6.0;
   				float s2 = color_hsv.y;
    			float v2 = color_hsv.z;
				float c_val = v2 * s2;
				float x2 = c_val * (1.0 - abs(mod(h2, 2.0) - 1.0));
				vec3 rgb;
				
				if (0.0 <= h2 && h2 < 1.0) {
					rgb = vec3(c_val, x2, 0.0);
				} else if (1.0 <= h2 && h2 < 2.0) {
					rgb = vec3(x2, c_val, 0.0);
				} else if (2.0 <= h2 && h2 < 3.0) {
					rgb = vec3(0.0, c_val, x2);
				} else if (3.0 <= h2 && h2 < 4.0) {
					rgb = vec3(0.0, x2, c_val);
				} else if (4.0 <= h2 && h2 < 5.0) {
					rgb = vec3(x2, 0.0, c_val);
				} else if (5.0 <= h2 && h2 < 6.0) {
					rgb = vec3(c_val, 0.0, x2);
				} else {
					rgb = vec3(0.0, 0.0, 0.0);
				}
				float m = v2 - c_val;
				color_rgb = rgb + vec3(m);

				//adjust Gamma
				color_rgb.rgb = pow(color_rgb.rgb, vec3(1.0 / gamma));

				// Output
				cogl_color_out = vec4(color_rgb, color.a);
			}
        `;
}

function _onModeChange() {

	// Remove all filters
	_removeFilter();

	// Get new settings for AREA
	AREA = SETTINGS.getValue("mode");
}

function _onKBChange() {

	// Remove keybindings
	Main.keybindingManager.removeHotKey("correct-colors-kb");

	// Get new hotkey
	HOTKEY = SETTINGS.getValue("kb-shortcut");

	// Add hotkey
	_bindKeys();
}

function _applySettings() {

	// Assign values from settings

	// Hue
	if (SETTINGS.getValue("hue-shift") === 0) {
		PROPERTIES[0] = 0.01;
	}
	else {
		PROPERTIES[0] = SETTINGS.getValue("hue-shift") / 100;
	}

	// Saturation
	PROPERTIES[1] = SETTINGS.getValue("saturation") / 100;
	
	// Value
	PROPERTIES[2] = SETTINGS.getValue("value") / 100;

	// Brightness
	PROPERTIES[3] = (SETTINGS.getValue("brightness") - 100) / 100;

	// Contrast
	PROPERTIES[4] = SETTINGS.getValue("contrast") / 100;

	// Gamma
	PROPERTIES[5] = SETTINGS.getValue("gamma") / 100;

	// Hotkey
	HOTKEY = SETTINGS.getValue("kb-shortcut");

	// Area
	AREA = SETTINGS.getValue("mode");

}

function _bindKeys() {
	// Invert colors on whole screen
	Main.keybindingManager.addHotKey(
		"correct-colors-kb",
		HOTKEY,
		_applyFilter
	)
}

function _removeFilter() {
	
	// Remove full screen filter
	if(Main.uiGroup.get_effect('correct-screen-colors')) {
		Main.uiGroup.remove_effect_by_name('correct-screen-colors');
	}

	// Remove all windows filter
	global.get_window_actors().forEach(function(actor) {
		if(actor.get_effect('correct-window-colors')) {
			actor.remove_effect_by_name('correct-window-colors');
		}
	})
}

function _applyFilter() {

	// Full screen mode
	if(AREA === "fullscreen") {
		if(Main.uiGroup.get_effect('correct-screen-colors')) {
			Main.uiGroup.remove_effect_by_name('correct-screen-colors');
		}
		else {
			let effect_fs = new CorrectColors();
			Main.uiGroup.add_effect_with_name('correct-screen-colors', effect_fs);
		}
	}
	else if(AREA === "windowonly") {
		global.get_window_actors().forEach(function(actor) {
			let meta_window = actor.get_meta_window();
			if(meta_window.has_focus()) {
				if(actor.get_effect('correct-window-colors')) {
					actor.remove_effect_by_name('correct-window-colors');
				}
				else {
					let effect_wd = new CorrectColors();
					actor.add_effect_with_name('correct-window-colors', effect_wd);
				}
			}
		})
	}
}

function _reapplyFilter() {

	// Reapply settings
	_applySettings();
	
	// Full screen mode
	if(AREA === "fullscreen") {
		if(Main.uiGroup.get_effect('correct-screen-colors')) {
			Main.uiGroup.remove_effect_by_name('correct-screen-colors');
			let effect_fs = new CorrectColors();
			Main.uiGroup.add_effect_with_name('correct-screen-colors', effect_fs);
		}
	}
	else if(AREA === "windowonly") {
		global.get_window_actors().forEach(function(actor) {
			let meta_window = actor.get_meta_window();
			if(meta_window.has_focus()) {
				if(actor.get_effect('correct-window-colors')) {
					actor.remove_effect_by_name('correct-window-colors');
					let effect_wd = new CorrectColors();
					actor.add_effect_with_name('correct-window-colors', effect_wd);
				}
			}
		})
	}
}

function init() { }

function disable() {

	// Remove all filters
	_removeFilter();

	// Remove keybindings on disable
	Main.keybindingManager.removeHotKey("correct-colors-kb");
}

function enable() {

	// Import settings
    SETTINGS = new Settings.ExtensionSettings(this, UUID);

	// Bind settings buttons
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'kb-shortcut', 'kb-shortcut', _onKBChange, null);
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'mode', 'mode', _onModeChange, null);
    SETTINGS.bindProperty(Settings.BindingDirection.IN, 'hue-shift', 'hue-shift', _reapplyFilter, null);
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'saturation', 'saturation', _reapplyFilter, null);
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'value', 'value', _reapplyFilter, null);
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'brightness', 'brightness', _reapplyFilter, null);
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'contrast', 'contrast', _reapplyFilter, null);
	SETTINGS.bindProperty(Settings.BindingDirection.IN, 'gamma', 'gamma', _reapplyFilter, null);

	// Apply settings and bind keyboard keys
	_applySettings();
	_bindKeys();

}