/*
* Watermark - Cinnamon desktop extension
* Place a watermark on the desktop
* Copyright (C) 2018  Germán Franco Dorca
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

const Clutter = imports.gi.Clutter;
const Cogl = imports.gi.Cogl;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Main = imports.ui.main;
const { PanelLoc } = imports.ui.panel;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const St = imports.gi.St;
const Util = imports.misc.util;

const ERROR_ICON_NAME = 'face-sad-symbolic';
const DEFAULT_ICON_SIZE = 128;

function MyExtension(meta) {
	this._init(meta);
}

MyExtension.prototype = {

	_init: function (meta) {
		this.meta = meta;
		this.watermarks = [];
		this._signals = new SignalManager.SignalManager(null)
	},

	enable: function() {
		this.settings = new Settings.ExtensionSettings(this, this.meta.uuid);
		this.settings.bind('path-name', 'path_name', this.on_settings_updated);
		this.settings.bind('alpha', 'alpha', this.on_settings_updated);
		this.settings.bind('invert', 'invert', this.on_settings_updated);
		this.settings.bind('position-x', 'position_x', this.on_desktop_size_changed);
		this.settings.bind('position-y', 'position_y', this.on_desktop_size_changed);
		this.settings.bind('margin-x', 'margin_x', this.on_desktop_size_changed);
		this.settings.bind('margin-y', 'margin_y', this.on_desktop_size_changed);
		this.settings.bind('use-custom-size', 'use_custom_size', this.on_settings_updated);
		this.settings.bind('size', 'size', this.on_settings_updated);

		this._signals.connect(global.screen, 'monitors-changed', () => {
			this._clear_watermarks();
			this._init_watermarks();
		});

		let on_desktop_size_changed = this.on_desktop_size_changed.bind(this);
		for (let prop of ['enabled', 'height', 'resizable', 'autohide']) {
			this._signals.connect(global.settings, 'changed::panels-'+prop, on_desktop_size_changed);
		}

		if(this.settings.getValue('first-launch')) {
			this.settings.setValue('first-launch', false);
			this._detect_os();
		}

		this._init_watermarks();
	},

	_init_watermarks: function() {
		for(let i = global.screen.get_n_monitors()-1; i >= 0; i--) {
			let monitor = Main.layoutManager.monitors[i];
			this.watermarks.push(new Watermark(monitor, this));
		}
	},

	_clear_watermarks: function() {
		for(let wm of this.watermarks) {
			wm.destroy();
		}
		this.watermarks = [];
	},

	disable: function() {
		this._clear_watermarks();
		this._signals.disconnectAll();
	},

	on_desktop_size_changed: function () {
		for (let wm of this.watermarks)
			wm.update_position();
	},

	on_settings_updated: function() {
		for(let wm of this.watermarks)
			wm.update();
	},

	_detect_os: function() {
		let cmd = [this.meta.path + '/os-detection.sh', this.meta.path + '/icons'];
		Util.spawn(['chmod', 'u+x', cmd[0]]); // Cinnamon < 3.8
		Util.spawn_async(cmd, os_name => {
			if(os_name) {
				this.path_name = os_name;
				this.on_settings_updated();
			}
		});
	}
};

function Watermark(monitor, manager) {
	this._init(monitor, manager);
}

Watermark.prototype = {
	_init: function(monitor, manager) {
		this.manager = manager;
		this.monitor = monitor;

		this.actor = new St.Bin();
		this.watermark = null;

		global.background_actor.add_actor(this.actor);

		/* Position can't be calculated until size is set, and that is async */
		this.actor.connect('queue-redraw', () => this.update_position());
		this.update();
	},

	update: function() {
		if(this.watermark) {
			this.watermark.destroy();
		}
		this.watermark = this.get_watermark(this.manager.path_name, this.manager.size * global.ui_scale);
		this.actor.set_child(this.watermark);

		this.actor.set_opacity(this.manager.alpha * 255 / 100);
		this.actor.style = this.manager.invert ? 'color: black' : 'color: white';
	},

	get_desktop_geometry: function() {
		let { x, y, width, height} = this.monitor;

		let margin_x = this.manager.margin_x;
		let margin_y = this.manager.margin_y;
		x += margin_x;
		y += margin_y;
		width -= 2 * margin_x;
		height -= 2 * margin_y;

		for (let panel of Main.getPanels()) {
			if (!panel || panel.monitorIndex !== this.monitor.index)
				continue;

			if (panel._autohideSettings == "true")
				continue;

			switch (panel.panelPosition) {
				case PanelLoc.top:
					y += panel.actor.height;
				case PanelLoc.bottom:
					height -= panel.actor.height;
					break;
				case PanelLoc.left:
					x += panel.actor.width;
				case PanelLoc.right:
					width -= panel.actor.width;
					break;
			}
		}
		return { x, y, width, height };
	},

	update_position: function() {
		let desktop = this.get_desktop_geometry();
		let box;

		box = this.manager.position_x === 50 ? this.monitor : desktop;
		let x = box.x + (box.width - this.actor.width) * this.manager.position_x / 100;
		box = this.manager.position_y === 50 ? this.monitor : desktop;
		let y = box.y + (box.height - this.actor.height) * this.manager.position_y / 100;

		this.actor.set_position(Math.floor(x), Math.floor(y));
	},

	get_watermark: function(path_name, size) {
		if(GLib.file_test(path_name, GLib.FileTest.IS_REGULAR)) {
			let image = this.get_image(path_name, size);
			if(image) return image;
		}

		let xlet_path = this.manager.meta.path + '/icons/' + path_name.toLowerCase().replace(' ', '-') + '.svg';
		if(GLib.file_test(xlet_path, GLib.FileTest.IS_REGULAR)) {
			let image = this.get_image(xlet_path, size);
			if(image) return image;
		}

		let icon_name = path_name.endsWith('-symbolic') ? path_name : path_name + '-symbolic';
		if(Gtk.IconTheme.get_default().has_icon(icon_name)) { // Icon name
			let icon_size = this.manager.use_custom_size ? size : DEFAULT_ICON_SIZE;
			return new St.Icon({ icon_name, icon_size, icon_type: St.IconType.SYMBOLIC });
		}

		global.logError(this.manager.meta.uuid + ": watermark file not found (" + path_name + ")");
		return new St.Icon({ icon_name: ERROR_ICON_NAME, icon_size: DEFAULT_ICON_SIZE, icon_type: St.IconType.SYMBOLIC });
	},

	get_image: function(path, size) {
		let pixbuf;
		try {
			if(this.manager.use_custom_size)
				pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(path, size, size);
			else
				pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
		} catch(e) {
			return null;
		}

		let image = new Clutter.Image();
		image.set_data(this.manager.invert ? this.invert_pixels(pixbuf) : pixbuf.get_pixels(),
		               pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
		               pixbuf.get_width(),
		               pixbuf.get_height(),
		               pixbuf.get_rowstride());

		return new Clutter.Actor({ content: image,
		                           width: pixbuf.get_width(),
		                           height: pixbuf.get_height() });
	},

	invert_pixels: function(pixbuf) {
		let pixels = pixbuf.get_pixels();
		let bps = pixbuf.get_has_alpha() ? 4 : 3;

		for(let i = 0; i < pixels.length; i+=bps) {
			pixels[i]   = 0xff - pixels[i];
			pixels[i+1] = 0xff - pixels[i+1];
			pixels[i+2] = 0xff - pixels[i+2];
		}
		return pixels;
	},

	destroy: function() {
		this.actor.destroy();
		this.actor = null;
		this.manager = null;
	}
};

let extension = null;
function enable() {
	extension.enable();
}

function disable() {
	extension.disable();
	extension = null;
}

function init(metadata) {
	if(!extension) {
		extension = new MyExtension(metadata);
	}
}
