/**
 * @name  Cinnamon-Dynamic-Wallpaper
 * @alias TobiZog
 * @since 2023-05-17
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
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;


/******************** Constants ********************/

const UUID = "cinnamon-dynamic-wallpaper@TobiZog";
const APPNAME = "Cinnamon Dynamic Wallpaper"
const DIRECTORY = imports.ui.extensionSystem.extensionMeta[UUID];
const PATH = DIRECTORY.path;


/******************** Global Variables ********************/

// The extension object
let extension;

// Loop state
let looping = true


/******************** Objects ********************/

function CinnamonDynamicWallpaperExtension(uuid) {
	this._init(uuid);
}


function _(str) {
	let customTranslation = Gettext.dgettext(UUID, str);
	if (customTranslation !== str) {
		return customTranslation;
	}
	return Gettext.gettext(str);
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

		Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

		// Check for the first startup
		if (this.settings.getValue("first_start")) {

			// Welcome notification
			this.showNotification(_("Welcome to Cinnamon Dynamic Wallpaper"), 
				_("Check the preferences to choose a dynamic wallpaper"), true)

			// Check for necessary software
			if (!find_program_in_path('convert')) {
				// Run on Ubuntu/Debian based distros with APT package manager
				if(GLib.find_program_in_path("apturl")) {
					Util.spawnCommandLine("apturl apt://imagemagick");
				} else {
					// Notification on other distros
					this.showNotification(_("imagemagick is not installed"), 
					_("Please install the package manually for the full range of functions"), true)
				}
			}

			// Hide the notification on system restart
			this.settings.setValue("first_start", false)
			this.settings.setValue("source_folder", DIRECTORY["path"] + "/res/images/included_image_sets/lakeside/")
		}

		// Start the main loop, checks in fixed time periods
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
				Util.spawnCommandLine("/usr/bin/env python3 " + DIRECTORY.path + "/src/main.py loop")
			} catch(e) {
				this.showNotification(_("Error!"), 
					_("Cinnamon Dynamic Wallpaper got an error while running the loop script. Please create an issue on GitHub."))
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
				Util.spawnCommandLine("/usr/bin/env python3 " + DIRECTORY.path + "/src/main.py"));
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
	return extension;
}


/**
 * Lifecycle function on disable
 */
function disable() {
	looping = false
}
