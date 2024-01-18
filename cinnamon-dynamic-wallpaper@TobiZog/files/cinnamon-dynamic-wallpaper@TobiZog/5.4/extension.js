/**
 * @name	Cinnamon-Dynamic-Wallpaper
 * @alias 	TobiZog
 * @since	2023-05-17
 * 
 * @description Main application file
 */

/******************** Imports ********************/

const Util = imports.misc.util;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const { find_program_in_path } = imports.gi.GLib;
const Gio = imports.gi.Gio;
const MessageTray = imports.ui.messageTray;
const St = imports.gi.St;
const Main = imports.ui.main;



/******************** Constants ********************/

const UUID = "cinnamon-dynamic-wallpaper@TobiZog";
const APPNAME = "Cinnamon Dynamic Wallpaper"
const DIRECTORY = imports.ui.extensionSystem.extensionMeta[UUID];
const PATH = DIRECTORY.path;


/******************** Global Variables ********************/

// The extension object
let extension;

// Time and date of the last location update
let lastLocationUpdate = -1

// Loop state
let looping = true


/******************** Objects ********************/

function CinnamonDynamicWallpaperExtension(uuid) {
	this._init(uuid);
}


CinnamonDynamicWallpaperExtension.prototype = {

	/******************** Lifecycle ********************/

	/**
	 * Initialization
	 * 
	 * @param {string} uuid 	Universally Unique Identifier
	 */
	_init: function(uuid) { 
		this.settings = new Settings.ExtensionSettings(this, uuid);

		// Check for the first startup
		if (this.settings.getValue("first_start")) {

			// Welcome notification
			this.showNotification("Welcome to Cinnamon Dynamic Wallpaper", 
				"Check the preferences to choose a dynamic wallpaper", true)

			// Hide the notification on system restart
			this.settings.setValue("first_start", false)
			this.settings.setValue("source_folder", DIRECTORY["path"] + "/images/included_image_sets/lakeside/")
		}

		// Start the main loop, checks in fixed time periods the 
		this._loop()
	},


	/**
	 * Binding the settings objects
	 * 
	 * @param {string} ui_name 	Name of preference in settings-schema.json
	 * @param {string} js_name 	Name of preference in JavaScript
	 * @param {Function} func 	Function to call on change
	 */
	bindSettings: function (ui_name, js_name, func = this.on_settings_changed) {
		this.settings.bindProperty(
			Settings.BindingDirection.IN,
			ui_name,
			js_name,
			func
		)
	},


	/**
	 * Main loop
	 */
	_loop: function () {
		if (looping) {
			try {
				Util.spawnCommandLine("/usr/bin/env python3 " + DIRECTORY.path + "/loop.py")
			} catch(e) {
				this.showNotification("Error!", 
					"Cinnamon Dynamic Wallpaper got an error while running the loop script. Please create an issue on GitHub.")
			}

			// Refresh every 60 seconds
			Mainloop.timeout_add_seconds(60, Lang.bind(this, this._loop));
		}
	},


	showNotification(title, text, showOpenSettings = false) {
		let source = new MessageTray.Source(this.uuid);

		// Parameter
		let params = {
			icon: new St.Icon({
				icon_name: "icon",
				icon_type: St.IconType.FULLCOLOR,
				icon_size: source.ICON_SIZE
			})
		};
		// The notification itself
		let notification = new MessageTray.Notification(source, title, text, params);

		// Display the "Open settings" button, if showOpenSettings
		if (showOpenSettings) {
			notification.addButton("open-settings", _("Open settings"));

			notification.connect("action-invoked", () =>
				Util.spawnCommandLine("/usr/bin/env python3 " +
					DIRECTORY.path + "/preferences.py"));
		}

		// Put all together
		Main.messageTray.add(source);

		// Display it
		source.notify(notification);
	}
}



/******************** Lifecycle ********************/

/**
 * Lifecycle function on initialization
 * 
 * @param {*} extensionMeta 	Metadata of the extension
 */
function init(extensionMeta) {
	extension = new CinnamonDynamicWallpaperExtension(extensionMeta.uuid);
}


/**
 * Lifecycle function on enable
 * 
 * @returns The extension object
 */
function enable() {
	// Check for necessary software
	if (!find_program_in_path('heif-convert')) {
		Util.spawnCommandLine("apturl apt://libheif-examples");
	}

	return extension;
}


/**
 * Lifecycle function on disable
 */
function disable() {
	looping = false
}
