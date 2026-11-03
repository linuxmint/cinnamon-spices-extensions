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
const MessageTray = imports.ui.messageTray;
const Settings = imports.ui.settings;
const DND = imports.ui.dnd;
const Gettext = imports.gettext;
const ByteArray = imports.byteArray;
const { GLib, Gio, St } = imports.gi;
const { ClickAnimationFactory, ClickAnimationModes } = require("./clickAnimations.js");
const { Debouncer, logInfo, logError, IdleMonitor } = require("./helpers.js");
const { UUID, PAUSE_EFFECTS_KEY, CLICK_DEBOUNCE_MS } = require("./constants.js");
const { MouseMovementTracker } = require("./mouseMovementTracker.js");
const { MouseClickListener } = require("./mouseClickListener.js");

Gettext.bindtextdomain(UUID, `${GLib.get_user_data_dir()}/locale`);

const CLICK_EFFECTS_UNSUPPORTED_NOTIFIED_KEY = "click-effects-unsupported-notified";

const ClickType = Object.freeze({
	LEFT: "left_click",
	MIDDLE: "middle_click",
	RIGHT: "right_click",
	PAUSE_ON: "pause_on",
	PAUSE_OFF: "pause_off",
	MOUSE_IDLE: "mouse_idle",
	MOUSE_MOV: "mouse_mov",
});

function _(text) {
	let localized = Gettext.dgettext(UUID, text);
	return localized != text ? localized : window._(text);
}


class MouseClickEffects {
	constructor(metadata) {
		this.metadata = metadata;
		this.app_icons_dir = `${metadata.path}/../icons`;
		this.pause_icon_path = `${this.app_icons_dir}/extra/pause.svg`;
		this.settings = this._setup_settings(this.metadata.uuid);
		this.colored_icon_store = {};
		this._pause_icon = null;

		this.click_animator = ClickAnimationFactory.createForMode(this.animation_mode);

		this.mouse_click_listener = null;
		this.mouse_movement_tracker = null;

		this.idle_monitor = null;
		this._idle_listener_id = 0;
		this._idle_animation_source_id = 0;

		this._enable_on_drag_end = false;
		this._destroyed = false;
		DND.addDragMonitor(this);

		this.enabled = false;
		this.set_active(false);
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
				cb: async () => {
					await this.update_colored_icons();
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
				cb: null,
			},
			{
				key: "idle-animation-period",
				value: "idle_animation_period",
				cb: this.handle_idle_watcher_property_updated,
			},
			{
				key: "idle-animation-delay",
				value: "idle_animation_delay",
				cb: this.handle_idle_watcher_property_updated,
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
				cb: () => this.set_active(this.enabled),
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
				cb: async () => {
					await this.update_colored_icons();
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

	get effects_blocked_by_fullscreen() {
		return this.deactivate_in_fullscreen &&
			global.display.focus_window &&
			global.display.focus_window.is_fullscreen();
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

	async enable() {
		// icons are loaded asynchronously now, so we need to wait before
		// activating effects that need them.
		await this.update_colored_icons();

		if (this._destroyed)
			return;

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
		if (!this.click_animator || this.click_animator.mode != this.animation_mode) {
			this.click_animator = ClickAnimationFactory.createForMode(this.animation_mode);
		}
	}

	get_icon_cache_key(mode, click_type, color) {
		let safe_mode = String(mode).replace(/[^a-zA-Z0-9._-]/g, "_");
		let safe_click_type = String(click_type).replace(/[^a-zA-Z0-9._-]/g, "_");
		let safe_color = String(color).replace(/[^a-zA-Z0-9._-]/g, "_");
		return `${safe_mode}_${safe_click_type}_${safe_color}`;
	}

	get_click_icon(mode, click_type, color) {
		return this.colored_icon_store[this.get_icon_cache_key(mode, click_type, color)] || null;
	}

	get_pause_icon() {
		if (!this._pause_icon)
			this._pause_icon = Gio.icon_new_for_string(this.pause_icon_path);

		return this._pause_icon;
	}

	disable() {
		this.destroy();
	}

	destroy() {
		this._destroyed = true;
		DND.removeDragMonitor(this);
		this.set_active(false);
		this.unset_keybindings();
		this.settings.finalize();
		this.colored_icon_store = null;
		this._pause_icon = null;
		this.display_click = null;
		this.click_animator = null;
	}

	_notify_once_if_click_effects_unsupported() {
		if (this.mouse_click_listener.active ||
			this.settings.getValue(CLICK_EFFECTS_UNSUPPORTED_NOTIFIED_KEY))
			return;

		this.settings.setValue(CLICK_EFFECTS_UNSUPPORTED_NOTIFIED_KEY, true);
		this._notify(_("Click effects aren't available on Wayland in this version of Cinnamon, " +
			"they require Cinnamon 6.8 or later. The remaining effects will continue to work."));
	}

	_notify(message) {
		let source = new MessageTray.Source(this.metadata.name);
		let icon = new St.Icon({
			gicon: Gio.icon_new_for_string(`${this.metadata.path}/../icon.png`),
			icon_size: source.ICON_SIZE,
		});
		let notification = new MessageTray.Notification(source, this.metadata.name, message, { icon });
		Main.messageTray.add(source);
		source.notify(notification);
	}

	update_colored_icons() {
		return Promise.all([
			this.create_icon_data(ClickType.LEFT, this.left_click_color),
			this.create_icon_data(ClickType.MIDDLE, this.middle_click_color),
			this.create_icon_data(ClickType.RIGHT, this.right_click_color),
			this.create_icon_data(ClickType.MOUSE_IDLE, this.mouse_idle_watcher_color),
			this.create_icon_data(ClickType.MOUSE_MOV, this.mouse_movement_color),
		]);
	}

	handle_mouse_movement_tracker_property_updated = (new Debouncer()).debounce(() => {
		this._stop_mouse_movement_tracker();

		if (this.enabled)
			this._start_mouse_movement_tracker();
	}, 300);

	handle_idle_watcher_property_updated = (new Debouncer()).debounce(() => {
		this._stop_idle_monitor();

		if (this.enabled)
			this._start_idle_monitor();
	}, 300);

	_start_mouse_click_listener() {
		if (!this.left_click_effect_enabled && !this.right_click_effect_enabled && !this.middle_click_effect_enabled)
			return;

		this.mouse_click_listener = new MouseClickListener(this._dispatch_click.bind(this));
		this.mouse_click_listener.start();

		// notify at least once in case of click effects not supported yet (expects Cinnamon 6.8+)
		this._notify_once_if_click_effects_unsupported();
	}

	_start_mouse_movement_tracker() {
		if (!this.mouse_movement_tracker_enabled || this.mouse_movement_tracker)
			return;

		this.mouse_movement_tracker = new MouseMovementTracker(this, {
			icon: this.get_click_icon(this.icon_mode, ClickType.MOUSE_MOV, this.mouse_movement_color),
			opacity: this.general_opacity,
			persist: this.mouse_movement_tracker_persist_on_stopped_enabled,
			size: this.size,
		});
		this.mouse_movement_tracker.start();
	}

	_stop_mouse_click_listener() {
		if (!this.mouse_click_listener)
			return;

		this.mouse_click_listener.destroy();
		this.mouse_click_listener = null;
	}

	_stop_mouse_movement_tracker() {
		if (!this.mouse_movement_tracker)
			return;

		this.mouse_movement_tracker.stop();
		this.mouse_movement_tracker = null;
	}

	_start_idle_monitor() {
		if (!this.mouse_idle_watcher_enabled || this.idle_monitor)
			return;

		this.idle_monitor = new IdleMonitor(this._get_idle_delay_ms());
		this._idle_listener_id = this.idle_monitor.add_idle_listener(this._handle_idle_state_changed.bind(this));

		if (this.idle_monitor.idle)
			this._start_idle_animation_loop();
	}

	_get_idle_delay_ms() {
		let delay_minutes = this.idle_animation_delay;

		if (delay_minutes > 120)
			delay_minutes = 10;

		delay_minutes = Math.max(1, Math.min(120, delay_minutes));
		return delay_minutes * 60 * 1000;
	}

	_stop_idle_monitor() {
		this._stop_idle_animation_loop();

		if (!this.idle_monitor)
			return;

		if (this._idle_listener_id) {
			this.idle_monitor.remove_idle_listener(this._idle_listener_id);
			this._idle_listener_id = 0;
		}

		this.idle_monitor.destroy();
		this.idle_monitor = null;
	}

	_handle_idle_state_changed(is_idle) {
		if (is_idle) {
			this._start_idle_animation_loop();
		} else {
			this._stop_idle_animation_loop();
		}
	}

	_start_idle_animation_loop() {
		if (this._idle_animation_source_id)
			return;

		this.display_idle_animation();

		let period = Math.max(100, this.idle_animation_period);
		this._idle_animation_source_id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, period, () => {
			this.display_idle_animation();
			return GLib.SOURCE_CONTINUE;
		});
		GLib.Source.set_name_by_id(this._idle_animation_source_id, '[cinnamon mouse-click-effects] MouseClickEffects._start_idle_animation_loop');
	}

	_stop_idle_animation_loop() {
		if (!this._idle_animation_source_id)
			return;

		GLib.source_remove(this._idle_animation_source_id);
		this._idle_animation_source_id = 0;
	}

	set_active(enabled) {
		this.enabled = enabled;

		this._stop_mouse_click_listener();
		this._stop_mouse_movement_tracker();
		this._stop_idle_monitor();

		if (enabled) {
			this._start_mouse_click_listener();
			this._start_mouse_movement_tracker();
			this._start_idle_monitor();
			logInfo("activated");
		} else {
			logInfo("deactivated");
		}
	}

	create_icon_data(click_type, color) {
		let key = this.get_icon_cache_key(this.icon_mode, click_type, color);
		if (this.colored_icon_store[key])
			return Promise.resolve();

		let icon_mode = this.icon_mode;
		let source = Gio.File.new_for_path(`${this.app_icons_dir}/${icon_mode}.svg`);

		// always resolves (never rejects), so a single failed icon doesn't block activation
		return new Promise(resolve => {
			source.load_contents_async(null, (src, result) => {
				let contents;
				try {
					[, contents] = src.load_contents_finish(result);
				} catch (e) {
					logError(`failed to read icon source for ${icon_mode}: ${e}`);
					resolve();
					return;
				}

				// the extension may have been disabled while the icon was loading
				if (this.colored_icon_store) {
					contents = ByteArray.toString(contents).replace('fill="#000000"', `fill="${color}"`);
					this.colored_icon_store[key] = Gio.BytesIcon.new(new GLib.Bytes(contents));
				}

				resolve();
			});
		});
	}

	display_click = (new Debouncer()).debounce((...args) => {
		if (this.effects_blocked_by_fullscreen) {
			logInfo("Click effects not displayed due to being disabled for fullscreen focused windows");
			return;
		}
		this.animate_click(...args);
	}, CLICK_DEBOUNCE_MS);

	display_idle_animation() {
		if (!this.enabled || !this.mouse_idle_watcher_enabled || this.effects_blocked_by_fullscreen)
			return;

		this.animate_idle();
	}

	animate_click(click_type, color) {
		this.update_animation_mode();

		let icon = null;
		let animator = this.click_animator;

		if (click_type === ClickType.PAUSE_ON) {
			icon = this.get_pause_icon();
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

	animate_idle() {
		let icon = this.get_click_icon(this.icon_mode, ClickType.MOUSE_IDLE, this.mouse_idle_watcher_color);

		if (icon) {
			ClickAnimationFactory.createForMode(this.idle_animation_mode).animateClick(icon, {
				opacity: this.general_opacity,
				icon_size: this.size,
				timeout: this.animation_time,
			});
		} else {
			logError(`Couldn't get Idle Icon (mode = ${this.icon_mode}, color = ${this.mouse_idle_watcher_color})`)
		}
	}

	_dispatch_click(button) {
		switch (button) {
			case 1:
				if (this.left_click_effect_enabled)
					this.display_click(ClickType.LEFT, this.left_click_color);
				break;
			case 2:
				if (this.middle_click_effect_enabled)
					this.display_click(ClickType.MIDDLE, this.middle_click_color);
				break;
			case 3:
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
