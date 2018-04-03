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
const Settings = imports.ui.settings;
const St = imports.gi.St;

const ERROR_ICON_NAME = 'face-sad-symbolic';
const DEFAULT_ICON_SIZE = 128;

function MyExtension(meta) {
	this._init(meta);
}

MyExtension.prototype = {

	_init: function (meta) {
		this.meta = meta;
		this.watermarks = [];
	},

	enable: function() {
		this.settings = new Settings.ExtensionSettings(this, this.meta.uuid);
		this.settings.bind('path-name', 'path_name', this.on_settings_updated);
		this.settings.bind('alpha', 'alpha', this.on_settings_updated);
		this.settings.bind('position-x', 'position_x', this.on_settings_updated);
		this.settings.bind('position-y', 'position_y', this.on_settings_updated);
		this.settings.bind('use-custom-size', 'use_custom_size', this.on_settings_updated);
		this.settings.bind('size', 'size', this.on_settings_updated);

		this.monitorsChangedId = global.screen.connect('monitors-changed', () => {
			this._clear_watermarks();
			this._init_watermarks();
		});

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
	},

	on_settings_updated: function() {
		for(let wm of this.watermarks)
			wm.update();
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
		this.actor.style = 'color: white;';
		this.watermark = null;

		global.bottom_window_group.insert_child_at_index(this.actor, 0);

		/* Position can't be calculated until size is set, and that is async */
		this.actor.connect('queue-redraw', () => this.update_position());
		this.update();
	},

	update: function() {
		if(this.watermark) {
			this.watermark.destroy();
		}
		this.watermark = this.get_watermark(this.manager.path_name, this.manager.size);
		this.actor.set_child(this.watermark);

		this.actor.set_opacity(this.manager.alpha * 255 / 100);
	},

	update_position: function() {
		let x = this.monitor.x + (this.monitor.width - this.actor.width) * this.manager.position_x / 100;
		let y = this.monitor.y + (this.monitor.height - this.actor.height) * this.manager.position_y / 100;
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
		image.set_data(pixbuf.get_pixels(),
		               pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
		               pixbuf.get_width(),
		               pixbuf.get_height(),
		               pixbuf.get_rowstride());

		return new Clutter.Actor({ content: image,
		                           width: pixbuf.get_width(),
		                           height: pixbuf.get_height() });
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
