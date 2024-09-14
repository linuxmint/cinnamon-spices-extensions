/* applet.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
'use strict';

const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Gettext = imports.gettext;
const ByteArray = imports.byteArray;
const { Atspi, GLib, Gio } = imports.gi;
const { ClickAnimationFactory } = require("./clickAnimations.js");
const { Debouncer } = require("./helpers.js");
const { UUID, PAUSE_EFFECTS_KEY } = require("./constants.js");


Gettext.bindtextdomain(UUID, `${GLib.get_home_dir()}/.local/share/locale`);


function _(text) {
	let localized = Gettext.dgettext(UUID, text);
	return localized != text ? localized : window._(text);
}


const ClickType = {
    LEFT: "left_click",
    MIDDLE: "middle_click",
    RIGHT: "right_click",
	PAUSE: "pause_bind",
};

const PAUSE_OFF_COLOR = "#E5E4E2";
const PAUSE_ON_COLOR = "#71797E";

class MouseClickEffects {
	constructor(metadata) {
		this.metadata = metadata;
		this.app_icons_dir = `${metadata.path}/../icons`;
		this.settings = this._setup_settings(this.metadata.uuid);
		this.data_dir = this._init_data_dir(this.metadata.uuid);

		Atspi.init();

		this.listener = Atspi.EventListener.new(this.on_mouse_click.bind(this));
		this.click_animator = ClickAnimationFactory.createForMode(this.animation_mode);
		this.display_click = (new Debouncer()).debounce(this.animate_click.bind(this), 2);

		this.colored_icon_store = {};
		this.enabled = false;
	}

    _init_data_dir(uuid) {
		let data_dir = `${GLib.get_user_cache_dir()}/${uuid}`;

		if (GLib.mkdir_with_parents(`${data_dir}/icons`, 0o777) < 0) {
			global.logError(`Failed to create cache dir at ${data_dir}`);
			throw new Error(`Failed to create cache dir at ${data_dir}`);
		}

		return data_dir;
	}

	_setup_settings(uuid) {
		let settings = new Settings.ExtensionSettings(this, uuid);

		let bindings = [
			{
				key: "animation-time",
				value: "animation_time",
				cb: null,
			},
			{
				key: "icon-mode",
				value: "icon_mode",
				cb: this.update_colored_icons,
			},
			{
				key: "size",
				value: "size",
				cb: null,
			},
			{
				key: "left-click-effect-enabled",
				value: "left_click_effect_enabled",
				cb: null,
			},
			{
				key: "right-click-effect-enabled",
				value: "right_click_effect_enabled",
				cb: null,
			},
			{
				key: "middle-click-effect-enabled",
				value: "middle_click_effect_enabled",
				cb: null,
			},
			{
				key: "pause-animation-effects-enabled",
				value: "pause_animation_effects_enabled",
				cb: null,
			},
			{
				key: "left-click-color",
				value: "left_click_color",
				cb: this.update_colored_icons,
			},
			{
				key: "middle-click-color",
				value: "middle_click_color",
				cb: this.update_colored_icons,
			},
			{
				key: "right-click-color",
				value: "right_click_color",
				cb: this.update_colored_icons,
			},
			{
				key: "general-opacity",
				value: "general_opacity",
				cb: null,
			},
			{
				key: "animation-mode",
				value: "animation_mode",
				cb: this.update_animation_mode,
			},
			{
				key: "pause-effects-binding",
				value: "pause_effects_binding",
				cb: this.set_keybindings,
			},
			{
				key: "deactivate-in-fullscreen",
				value: "deactivate_in_fullscreen",
				cb: null,
			},
		]

        bindings.forEach(
			b => settings.bind(
                b.key, b.value, b.cb ? (...args) => b.cb.call(this, ...args) : null,
            )
		);

        return settings;
	}

	enable() {
		this.update_colored_icons();
		this.set_keybindings();
		this.set_active(true);
	}

	unset_keybindings() {
		Main.keybindingManager.removeHotKey(PAUSE_EFFECTS_KEY);
	}

	set_keybindings() {
		this.unset_keybindings();
        Main.keybindingManager.addHotKey(
			PAUSE_EFFECTS_KEY,
			this.pause_effects_binding,
            this.on_pause_toggled.bind(this),
		);
    }

	on_pause_toggled() {
		this.set_active(!this.enabled);

		if (this.pause_animation_effects_enabled) {
			let color = this.enabled ? PAUSE_OFF_COLOR : PAUSE_ON_COLOR;
			this.display_click(ClickType.PAUSE, color);
		}
	}

	update_animation_mode() {
		if (!this.click_animator || this.click_animator.mode != this.animation_mode)
			this.click_animator = ClickAnimationFactory.createForMode(this.animation_mode);
	}

    get_colored_icon(mode, click_type, color) {
        const name = `${mode}_${click_type}_${color}`;

		if (this.colored_icon_store[name])
			return this.colored_icon_store[name];

		const path = `${this.data_dir}/icons/${name}.svg`;

        if (GLib.file_test(path, GLib.FileTest.IS_REGULAR)) {
			this.colored_icon_store[name] = Gio.icon_new_for_string(path);
			return this.colored_icon_store[name];
		}

        return null;
	}

	disable() {
		this.destroy();
	}

	destroy() {
		this.set_active(false);
		this.unset_keybindings();
		this.settings.finalize();
		this.colored_icon_store = null;
		this.display_click = null;
		this.click_animator = null;
	}

	update_colored_icons() {
		this.create_icon_data(ClickType.PAUSE, PAUSE_ON_COLOR);
		this.create_icon_data(ClickType.PAUSE, PAUSE_OFF_COLOR);
		this.create_icon_data(ClickType.LEFT, this.left_click_color);
		this.create_icon_data(ClickType.MIDDLE, this.middle_click_color);
		this.create_icon_data(ClickType.RIGHT, this.right_click_color);
	}

	set_active(enabled) {
		this.enabled = enabled;

		this.listener.deregister('mouse');
		if (enabled) this.listener.register('mouse');

		global.log(UUID, `Click effects ${enabled ? "activated" : "deactivated"}!`);
	}

	create_icon_data(click_type, color) {
		if (this.get_colored_icon(this.icon_mode, click_type, color))
			return true;

        let source = Gio.File.new_for_path(`${this.app_icons_dir}/${this.icon_mode}.svg`);
		let [l_success, contents] = source.load_contents(null);

		contents = ByteArray.toString(contents);
		// Replace to new color
		contents = contents.replace('fill="#000000"', `fill="${color}"`);

		// Save content to cache dir
        const name = `${this.icon_mode}_${click_type}_${color}`;
		let dest = Gio.File.new_for_path(`${this.data_dir}/icons/${name}.svg`);

		if (!dest.query_exists(null)) dest.create(Gio.FileCreateFlags.NONE, null);

		let [r_success, tag] = dest.replace_contents(contents, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
		return r_success;
	}

	animate_click(click_type, color) {
		if (global.display.focus_window.is_fullscreen() && this.deactivate_in_fullscreen) {
			// global.log(UUID, "Click effects not displayed due to being disabled for fullscreen focused windows");
			return;
		}

		this.update_animation_mode();
		let icon = this.get_colored_icon(this.icon_mode, click_type, color);

		if (icon) {
			let options = { opacity: this.general_opacity, icon_size: this.size, timeout: this.animation_time };
			this.click_animator.animateClick(icon, options);
		} else {
			global.logError(`${UUID}: Couldn't get Click Icon (mode = ${this.icon_mode}, type = ${click_type}, color = ${color})`)
		}
	}

	on_mouse_click(event) {
		switch (event.type) {
			case 'mouse:button:1p':
				if (this.left_click_effect_enabled)
					this.display_click(ClickType.LEFT, this.left_click_color);
				break;
			case 'mouse:button:2p':
				if (this.middle_click_effect_enabled)
					this.display_click(ClickType.MIDDLE, this.middle_click_color);
				break;
			case 'mouse:button:3p':
				if (this.right_click_effect_enabled)
					this.display_click(ClickType.RIGHT, this.right_click_color);
				break;
		}
	}
}


let extension = null;

function enable() {
    extension.enable();
}

function disable() {
    extension.disable();
    extension = null;
}

function init(metadata) {
    if (!extension) extension = new MouseClickEffects(metadata);
}