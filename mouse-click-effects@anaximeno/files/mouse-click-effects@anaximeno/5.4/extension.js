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
const DND = imports.ui.dnd;
const Gettext = imports.gettext;
const ByteArray = imports.byteArray;
const { Atspi, GLib, Gio } = imports.gi;
const { ClickAnimationFactory, ClickAnimationModes } = require("./clickAnimations.js");
const { Debouncer, logInfo, logError } = require("./helpers.js");
const { UUID, PAUSE_EFFECTS_KEY, CLICK_DEBOUNCE_MS, POINTER_WATCH_MS, IDLE_TIME } = require("./constants.js");
const { IdleMonitor } = require("./idleMonitor.js");
const { MouseMovementTracker } = require("./mouseMovementTracker.js");

Gettext.bindtextdomain(UUID, `${GLib.get_home_dir()}/.local/share/locale`);


function _(text) {
	let localized = Gettext.dgettext(UUID, text);
	return localized != text ? localized : window._(text);
}


const ClickType = Object.freeze({
	LEFT: "left_click",
	MIDDLE: "middle_click",
	RIGHT: "right_click",
	PAUSE_ON: "pause_on",
	PAUSE_OFF: "pause_off",
	MOUSE_IDLE: "mouse_idle",
	MOUSE_MOV: "mouse_mov",
});


class MouseClickEffects {
	constructor(metadata) {
		this.metadata = metadata;
		this.app_icons_dir = `${metadata.path}/../icons`;
		this.pause_icon_path = `${this.app_icons_dir}/extra/pause.svg`;
		this.settings = this._setup_settings(this.metadata.uuid);
		this.data_dir = this._init_data_dir(this.metadata.uuid);
		this.colored_icon_store = {};

		this.clickAnimator = ClickAnimationFactory.createForMode(this.animation_mode);

		this.listener = Atspi.EventListener.new(this.on_mouse_click.bind(this));
		this.idleMonitor = null;

		this.mouse_movement_tracker = null;

		this._enable_on_drag_end = false;
		DND.addDragMonitor(this);

		this.enabled = false;
		this.set_active(false);
	}

	_init_data_dir(uuid) {
		let data_dir = `${GLib.get_user_cache_dir()}/${uuid}`;

		if (GLib.mkdir_with_parents(`${data_dir}/icons`, 0o777) < 0) {
			logError(`Failed to create cache dir at ${data_dir}`);
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
				cb: () => {
					this.update_colored_icons();
					this.handle_mouse_movement_tracker_property_updated();
				},
			},
			{
				key: "size",
				value: "size",
				cb: () => {
					this.handle_mouse_movement_tracker_property_updated();
				},
			},
			{
				key: "idle-animation-mode",
				value: "idle_animation_mode",
				cb: null, // TODO
			},
			{
				key: "idle-animation-period",
				value: "idle_animation_period",
				cb: null, // TODO
			},
			{
				key: "idle-animation-delay",
				value: "idle_animation_delay",
				cb: null, // TODO
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
				key: "mouse-movement-tracker-enabled",
				value: "mouse_movement_tracker_enabled",
				cb: () => this.set_active(this.enabled),
			},
			{
				key: "mouse-movement-tracker-persist-on-stopped-enabled",
				value: "mouse_movement_tracker_persist_on_stopped_enabled",
				cb: this.handle_mouse_movement_tracker_property_updated.bind(this),
			},
			{
				key: "mouse-idle-watcher-enabled",
				value: "mouse_idle_watcher_enabled",
				cb: null, // TODO
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
				key: "mouse-movement-color",
				value: "mouse_movement_color",
				cb: () => {
					this.update_colored_icons();
					this.handle_mouse_movement_tracker_property_updated();
				},
			},
			{
				key: "mouse-idle-watcher-color",
				value: "mouse_idle_watcher_color",
				cb: this.update_colored_icons,
			},
			{
				key: "general-opacity",
				value: "general_opacity",
				cb: () => {
					this.handle_mouse_movement_tracker_property_updated();
				},
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
		];

		bindings.forEach(b => settings.bind(
			b.key,
			b.value,
			b.cb ? (...args) => b.cb.call(this, ...args) : null,
		));

		return settings;
	}

	dragMotion = ((event) => {
		if (this.enabled) {
			this._enable_on_drag_end = true;
			this.set_active(false);
		}
	}).bind(this);

	dragDrop = ((event) => {
		if (this._enable_on_drag_end) {
			this._enable_on_drag_end = false;
			this.set_active(true);
		}
	}).bind(this);

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
			this.display_click(this.enabled ? ClickType.PAUSE_OFF : ClickType.PAUSE_ON);
		}
	}

	update_animation_mode() {
		if (!this.clickAnimator || this.clickAnimator.mode != this.animation_mode) {
			this.clickAnimator = ClickAnimationFactory.createForMode(this.animation_mode);
		}
	}

	get_click_icon(mode, click_type, color) {
		let name = `${mode}_${click_type}_${color}.svg`;
		let path = `${this.data_dir}/icons/${name}`;
		return this.get_icon_cached(path);
	}

	get_icon_cached(path) {
		if (this.colored_icon_store[path])
			return this.colored_icon_store[path];

		if (GLib.file_test(path, GLib.FileTest.IS_REGULAR)) {
			this.colored_icon_store[path] = Gio.icon_new_for_string(path);
			return this.colored_icon_store[path];
		}

		return null;
	}

	disable() {
		this.destroy();
	}

	destroy() {
		DND.removeDragMonitor(this);
		this.set_active(false);
		this.unset_keybindings();
		this.settings.finalize();
		this.colored_icon_store = null;
		this.display_click = null;
		this.clickAnimator = null;
	}

	update_colored_icons() {
		this.create_icon_data(ClickType.LEFT, this.left_click_color);
		this.create_icon_data(ClickType.MIDDLE, this.middle_click_color);
		this.create_icon_data(ClickType.RIGHT, this.right_click_color);
		this.create_icon_data(ClickType.MOUSE_IDLE, this.mouse_idle_watcher_color);
		this.create_icon_data(ClickType.MOUSE_MOV, this.mouse_movement_color);
	}

	handle_mouse_movement_tracker_property_updated = (new Debouncer()).debounce(() => {
		if (this.mouse_movement_tracker) {
			this.mouse_movement_tracker.stop();
			this.mouse_movement_tracker = null;
		}
		if (this.mouse_movement_tracker_enabled) {
			this.mouse_movement_tracker = new MouseMovementTracker(this, {
				icon: this.get_click_icon(this.icon_mode, ClickType.MOUSE_MOV, this.mouse_movement_color),
				opacity: this.general_opacity,
				persist: this.mouse_movement_tracker_persist_on_stopped_enabled,
				size: this.size,
			});
			this.mouse_movement_tracker.start();
		}
	}, 300);

	set_active(enabled) {
		this.enabled = enabled;

		this.listener.deregister('mouse');
		if (this.mouse_movement_tracker) {
			this.mouse_movement_tracker.stop();
			this.mouse_movement_tracker = null;
		}
		if (this.idleMonitor) {
			this.idleMonitor.stop();
			this.idleMonitor = null;
		}

		if (enabled) {
			this.listener.register('mouse');

			if (this.mouse_movement_tracker_enabled) {
				this.mouse_movement_tracker = new MouseMovementTracker(this, {
					icon: this.get_click_icon(this.icon_mode, ClickType.MOUSE_MOV, this.mouse_movement_color),
					opacity: this.general_opacity,
					persist: this.mouse_movement_tracker_persist_on_stopped_enabled,
					size: this.size,
				});
				this.mouse_movement_tracker.start();
			}

			// TODO
			// if (this.mouse_idle_watcher_enabled) {
			// 	// XXX: only enable according w respective settings
			// 	this.idleMonitor = new IdleMonitor({
			// 		idle_delay: IDLE_TIME,
			// 		on_idle: this.on_idle_handler,
			// 		on_active: this.on_active_handler,
			// 		on_finish: this.on_finish_handler,
			// 	});
			// 	this.idleMonitor.start();
			// }

			logInfo("activated");
		} else {
			logInfo("deactivated");
		}
	}

	create_icon_data(click_type, color) {
		if (this.get_click_icon(this.icon_mode, click_type, color))
			return true;

		let source = Gio.File.new_for_path(`${this.app_icons_dir}/${this.icon_mode}.svg`);
		let [l_success, contents] = source.load_contents(null);

		contents = ByteArray.toString(contents);
		contents = contents.replace('fill="#000000"', `fill="${color}"`);

		let name = `${this.icon_mode}_${click_type}_${color}.svg`;
		let path = `${this.data_dir}/icons/${name}`;
		let dest = Gio.File.new_for_path(path);

		if (!dest.query_exists(null))
			dest.create(Gio.FileCreateFlags.NONE, null);

		let [r_success, tag] = dest.replace_contents(contents, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

		if (r_success) logInfo(`created colored icon cache for ${name}`);

		return r_success;
	}

	display_click = (new Debouncer()).debounce((...args) => {
		if (this.deactivate_in_fullscreen && global.display.focus_window && global.display.focus_window.is_fullscreen()) {
			logInfo("Click effects not displayed due to being disabled for fullscreen focused windows");
			return;
		}
		this.animate_click(...args);
	}, CLICK_DEBOUNCE_MS);

	animate_click(click_type, color) {
		this.update_animation_mode();

		let icon = null;
		let animator = this.clickAnimator;

		if (click_type === ClickType.PAUSE_ON) {
			icon = this.get_icon_cached(this.pause_icon_path);
			animator = ClickAnimationFactory.createForMode(ClickAnimationModes.BLINK);
		} else if (click_type === ClickType.PAUSE_OFF) {
			icon = this.get_click_icon(this.icon_mode, ClickType.LEFT, this.left_click_color);
			animator = ClickAnimationFactory.createForMode(ClickAnimationModes.BLINK);
		} else if (color != null) {
			icon = this.get_click_icon(this.icon_mode, click_type, color);
		}

		if (icon) {
			animator.animateClick(icon, {
				opacity: this.general_opacity,
				icon_size: this.size,
				timeout: this.animation_time,
			});
		} else {
			logError(`Couldn't get Click Icon (mode = ${this.icon_mode}, type = ${click_type}, color = ${color})`)
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
	if (!extension) {
		Atspi.init();
		extension = new MouseClickEffects(metadata);
	};
}