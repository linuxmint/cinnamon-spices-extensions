/*
* Transparent panels - Cinnamon desktop extension
* Transparentize your panels when there are no any maximized windows
* Copyright (C) 2016  Germán Franco Dorca
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const Meta = imports.gi.Meta;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager;

const WINDOW_FLAGS_MAXIMIZED = (Meta.MaximizeFlags.VERTICAL | Meta.MaximizeFlags.HORIZONTAL);
const ANIMATIONS_DURATION = 200;

function log(msg) {
	global.log('transparent-panels@germanfr: ' + msg);
}

function MyExtension(meta) {
	this._init(meta);
}

MyExtension.prototype = {

	_init: function (meta) {
		this._meta = meta;
		this._signals = null;
		this.transparent = false;

		this.settings = new Settings.ExtensionSettings(this, meta.uuid);
		this._settings_bind_property('transparency-type', 'transparency_type', this.onSettingsUpdated);
		this._classname = this.transparency_type ? this.transparency_type : 'panel-transparent-gradient';
		this._settings_bind_property('opacify', 'opacify');
	},

	enable: function () {
		this._signals = new SignalManager.SignalManager(this);
		this._signals.connect(global.window_manager, 'maximize', this._onWindowAppeared);
		this._signals.connect(global.window_manager, 'map', this._onWindowAppeared);

		this._signals.connect(global.window_manager, 'minimize', this.onWindowsStateChange);
		this._signals.connect(global.window_manager, 'unmaximize', this.onWindowsStateChange);
		this._signals.connect(global.screen, 'window-removed', this.onWindowsStateChange);
		this._signals.connect(global.window_manager, 'switch-workspace', this.onWindowsStateChange);

		this._makePanelsTransparent();
		this._detectWindows();
	},

	disable: function () {
		this._signals.disconnectAllSignals();
		this._signals = null;

		this.settings.finalize();
		this.settings = null;

		this._makePanelsOpaque();
	},

	_detectWindows: function () {
		let windows = global.display.list_windows(0);
		if (windows.length == 0) {
			this._signals.connect(global.display, 'window-created', this._onWindowAddedStartup);
			this._signals.connect(global.display, 'notify::focus-window', this._disconnectStartupEvents);
		} else {
			windows.forEach(function (win) {
				this._onWindowAddedStartup(global.display, win);
			}, this);
		}
	},

	_onDesktopFocused: function (desktop) {
		if (desktop.get_window_type() !== Meta.WindowType.DESKTOP)
			return;

		this._makePanelsTransparent();

		// Listen to focus on other windows until it happens
		// to avoid unnecessary overhead
		this._signals.connect(global.display, 'notify::focus-window',
			function onUnfocus (display) {
				if (desktop === display.get_focus_window())
					return;
				this._signals.disconnect('notify::focus-window', display, onUnfocus);
				this.onWindowsStateChange();
			});
	},

	_onWindowAddedStartup: function (display, win) {
		if (win.get_window_type() === Meta.WindowType.DESKTOP) {
			this._signals.connect(win, 'focus', this._onDesktopFocused);
		} else if (this._isWindowMaximized(win)) {
			this._makePanelsOpaque();
		}
	},

	_disconnectStartupEvents: function () {
		this._signals.disconnect('window-created', global.display, this._onWindowAddedStartup);
		this._signals.disconnect('notify::focus-window', global.display, this._disconnectStartupEvents);
	},

	_onWindowAppeared: function (wm, win) {
		let metawin = win.get_meta_window();
		if (this._isWindowMaximized(metawin)) {
			this._makePanelsOpaque();
		}
	},

	onWindowsStateChange: function () {
		if (this._checkAnyWindowMaximized()) {
			this._makePanelsOpaque();
		} else {
			this._makePanelsTransparent();
		}
	},

	_checkAnyWindowMaximized: function () {
		let workspace = global.screen.get_active_workspace();
		let windows = workspace.list_windows();

		for(let i=0, n_wins = windows.length; i < n_wins; ++i) {
			if (this._isWindowMaximized(windows[i])) {
				return true;
			}
		}
		return false;
	},

	_isWindowMaximized: function (win) {
		return !win.minimized &&
			(win.get_maximized() & WINDOW_FLAGS_MAXIMIZED) === WINDOW_FLAGS_MAXIMIZED &&
			win.get_window_type() !== Meta.WindowType.DESKTOP;
	},

	_makePanelsTransparent: function () {
		if (this.transparent)
			return;

		if (this.opacify) {
			Main.getPanels().forEach(function (panel) {
				this._setBackgroundOpacity(panel, 0);
				panel.actor.add_style_class_name(this._classname);
			}, this);
		} else {
			Main.getPanels().forEach(function (panel) {
				panel.actor.add_style_class_name(this._classname);
			}, this);
		}
		this.transparent = true;
	},

	_makePanelsOpaque: function () {
		if (this.transparent) {
			if (this.opacify) {
				Main.getPanels().forEach(function (panel) {
					this._setBackgroundOpacity(panel, 255);
					panel.actor.remove_style_class_name(this._classname);
				}, this);
			} else {
				Main.getPanels().forEach(function (panel) {
					panel.actor.remove_style_class_name(this._classname);
				}, this);
			}

			this.transparent = false;
		}
	},

	_setBackgroundOpacity: function (panel, alpha) {
		let p_actor = panel.actor;
		let color = p_actor.get_background_color();
		color.alpha = alpha;
		p_actor.save_easing_state();
		p_actor.set_easing_duration(ANIMATIONS_DURATION);
		p_actor.set_background_color(color);
		p_actor.restore_easing_state();
	},

	onSettingsUpdated: function () {
		// Remove old classes
		this.transparent = true;
		this._makePanelsOpaque();

		if (this.transparency_type) {
			this._classname = this.transparency_type;
		}
		this.onWindowsStateChange();
	},

	// Keep backwards compatibility with 3.0.x for now
	// but keep working if bindProperty was removed.
	// To be removed soon
	_settings_bind_property: function (key, applet_prop, callback) {
		if (this.settings.bind) {
			this.settings.bind(key, applet_prop, callback, null);
		} else {
			this.settings.bindProperty( Settings.BindingDirection.BIDIRECTIONAL,
				key, applet_prop, callback, null);
		}
	}
};


let extension = null;

function enable() {
	try {
		extension.enable();
	} catch (err) {
		extension.disable();
		throw err;
	}
}

function disable() {
	try {
		extension.disable();
	} catch(err) {
		global.logError(err);
	} finally {
		extension = null;
	}
}

function init(metadata) {
	if (extension === null)
		extension = new MyExtension(metadata);
}
