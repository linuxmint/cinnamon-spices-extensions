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

let suntimes = require('./scripts/suntimes')
let location = require('./scripts/location')
let communication = require('./scripts/communication')


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

// The last calculated suntime of the day
let lastDayTime = suntimes.DAYPERIOD.NONE

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

		/** Configuration */
		// Image set
		this.bindSettings("sw_image_stretch", "imageStretch", this.settingsUpdated)

		// Location estimation
		this.bindSettings("sw_auto_location", "autolocation", this.settingsUpdated)
		this.bindSettings("sc_location_refresh_time", "locationRefreshTime", this.settingsUpdated)
		this.bindSettings("etr_last_update", "etrLastUpdate")
		this.bindSettings("etr_latitude", "latitude", this.settingsUpdated)
		this.bindSettings("etr_longitude", "longitude", this.settingsUpdated)

		// Time periods
		this.bindSettings("tv_times", "tvTimes")


		/** Debugging */
		// Logs
		this.bindSettings("tv_logs", "tvLogs")

		
		// Image Configurator
		this.bindSettings("etr_img_morning_twilight", "img_morning_twilight", this.settingsUpdated)
		this.bindSettings("etr_img_sunrise", "img_sunrise", this.settingsUpdated)
		this.bindSettings("etr_img_morning", "img_morning", this.settingsUpdated)
		this.bindSettings("etr_img_noon", "img_noon", this.settingsUpdated)
		this.bindSettings("etr_img_afternoon", "img_afternoon", this.settingsUpdated)
		this.bindSettings("etr_img_evening", "img_evening", this.settingsUpdated)
		this.bindSettings("etr_img_sunset", "img_sunset", this.settingsUpdated)
		this.bindSettings("etr_img_night_twilight", "img_night_twilight", this.settingsUpdated)
		this.bindSettings("etr_img_night", "img_night", this.settingsUpdated)

		this.bindSettings("etr_morning_twilight_times", "img_morning_twilight_times")
		this.bindSettings("etr_sunrise_times", "img_sunrise_times")
		this.bindSettings("etr_morning_times", "img_morning_times")
		this.bindSettings("etr_noon_times", "img_noon_times")
		this.bindSettings("etr_afternoon_times", "img_afternoon_times")
		this.bindSettings("etr_evening_times", "img_evening_times")
		this.bindSettings("etr_sunset_times", "img_sunset_times")
		this.bindSettings("etr_night_twilight_times", "img_night_twilight_times")
		this.bindSettings("etr_night_times", "img_night_times")


		// Check for the first startup
		if (this.settings.getValue("first_start")) {
			this.writeToLogs("First time start")

			// Welcome notification
			communication.showNotification("Welcome to Cinnamon Dynamic Wallpaper", 
				"Check the preferences to choose a dynamic wallpaper", true)

			// Hide the notification on system restart
			this.settings.setValue("first_start", false)

			// Create the folder for the selected images
			Util.spawnCommandLine("mkdir " + DIRECTORY.path + "/images/selected/")

			// Link the default wallpaper to the folder
			for (let i = 1; i <= 9; i++) {
				Util.spawnCommandLine("ln -s " + 
				DIRECTORY.path + "/images/included_image_sets/lakeside/" + i + ".jpg " + 
				DIRECTORY.path + "/images/selected/" + i + ".jpg");
			}
		}

		this.writeToLogs("Initialization completed")

		// Set image initial at desktop wallpaper
		this.setImageToTime()

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
			this.setImageToTime()

			// Update the location, if the user choose "autoLocation" and the timer has expired
			if ((lastLocationUpdate == -1 || 
				lastLocationUpdate.getTime() < new Date().getTime() - this.locationRefreshTime * 60000) && 
				this.autolocation) 
			{
				this.updateLocation()
				lastLocationUpdate = new Date()
			}

			// Refresh every 60 seconds
			Mainloop.timeout_add_seconds(60, Lang.bind(this, this._loop));
			this.writeToLogs("Main loop runs...")
		}
	},


	/******************** Settings handling ********************/

	/**
	 * Handles changes in settings
	 */
	settingsUpdated: function() {
		lastDayTime = suntimes.DAYPERIOD.NONE

		this.updateLocation()
		this.setImageToTime()
	},

	/**
	 * Callback for settings-schema
	 * Opens the external image configurator window
	 */
	openImageConfigurator: function () {
		Util.spawnCommandLine("/usr/bin/env python3 " +
			DIRECTORY.path + "/image-configurator/image-configurator.py");
	},


	/**
	 * Callback for settings-schema
	 * Opens the browser and navigates to the URL of the respository
	 */
	openRepoWebsite: function () {
		Util.spawnCommandLine("xdg-open https://github.com/TobiZog/cinnamon-dynamic-wallpaper");
	},


	/**
	 * Callback for settings-schema
	 * Opens the browser and navigates to the URL of the Cinnamon Spices extension
	 */
	openSpicesWebsite: function () {
		Util.spawnCommandLine("xdg-open https://cinnamon-spices.linuxmint.com/extensions/view/97")
	},


	/**
	 * Callback for settings-schema
	 * Opens the browser and navigates to the GitHub issue page
	 */
	openIssueWebsite: function () {
		Util.spawnCommandLine("xdg-open https://github.com/TobiZog/cinnamon-dynamic-wallpaper/issues/new")
	},


	/******************** Other functions ********************/

	/**
	 * Changes the desktop background image
	 * 
	 * @param {jpg} imageURI 	The new desktop image
	 */
	changeWallpaper: function(imageURI) {
		let gSetting = new Gio.Settings({schema: 'org.cinnamon.desktop.background'});
		gSetting.set_string('picture-uri', imageURI);

		if (this.imageStretch) {
			gSetting.set_string('picture-options', 'spanned')
		}
		else
		{
			gSetting.set_string('picture-options', 'zoom')
		}

		Gio.Settings.sync();
		gSetting.apply();

		this.writeToLogs("Set new image: " + imageURI)
	},


	/**
	 * Estimate the right image based on time period of the day
	 */
	setImageToTime: function() {
		let times = suntimes.calcTimePeriod(this.latitude, this.longitude)
		let now = new Date()

		let timesArray = [
			times["morning_twilight"], times["sunrise"], times["morning"],
			times["noon"], times["afternoon"], times["evening"], 
			times["sunset"], times["night_twilight"], times["night"]
		]

		let imageSet = [
			this.img_morning_twilight, this.img_sunrise, this.img_morning,
			this.img_noon, this.img_afternoon, this.img_evening,
			this.img_sunset, this.img_night_twilight, this.img_night
		]

		for(let i = 0; i < timesArray.length; i++) {
			if(timesArray[i][0] <= now && now <= timesArray[i][1] && i != lastDayTime) {
				this.changeWallpaper("file://" + PATH + "/images/selected/" + imageSet[i])

				lastDayTime = i
				break
			}
		}
		
		function convertToTimeString(time) {
			return time.getHours().toString().padStart(2, "0") + ":" + time.getMinutes().toString().padStart(2, "0")
		}


		this.img_morning_twilight_times = convertToTimeString(timesArray[0][0]) + " - " + convertToTimeString(timesArray[0][1])
		this.img_sunrise_times = convertToTimeString(timesArray[1][0]) + " - " + convertToTimeString(timesArray[1][1])
		this.img_morning_times = convertToTimeString(timesArray[2][0]) + " - " + convertToTimeString(timesArray[2][1])
		this.img_noon_times = convertToTimeString(timesArray[3][0]) + " - " + convertToTimeString(timesArray[3][1])
		this.img_afternoon_times = convertToTimeString(timesArray[4][0]) + " - " + convertToTimeString(timesArray[4][1])
		this.img_evening_times = convertToTimeString(timesArray[5][0]) + " - " + convertToTimeString(timesArray[5][1])
		this.img_sunset_times = convertToTimeString(timesArray[6][0]) + " - " + convertToTimeString(timesArray[6][1])
		this.img_night_twilight_times = convertToTimeString(timesArray[7][0]) + " - " + convertToTimeString(timesArray[7][1])
		this.img_night_times = convertToTimeString(timesArray[8][0]) + " - " + convertToTimeString(timesArray[8][1])

		this.tvTimes = 
			"Morning Twilight:\t\t" + convertToTimeString(timesArray[0][0]) + " - " + convertToTimeString(timesArray[0][1]) +
			"\nSunrise:\t\t\t\t" + convertToTimeString(timesArray[1][0]) + " - " + convertToTimeString(timesArray[1][1]) +
			"\nMorning:\t\t\t" + convertToTimeString(timesArray[2][0]) + " - " + convertToTimeString(timesArray[2][1]) +
			"\nNoon:\t\t\t\t" + convertToTimeString(timesArray[3][0]) + " - " + convertToTimeString(timesArray[3][1]) +
			"\nAfternoon:\t\t\t" + convertToTimeString(timesArray[4][0]) + " - " + convertToTimeString(timesArray[4][1]) +
			"\nEvening:\t\t\t" + convertToTimeString(timesArray[5][0]) + " - " + convertToTimeString(timesArray[5][1]) +
			"\nSunset:\t\t\t\t" + convertToTimeString(timesArray[6][0]) + " - " + convertToTimeString(timesArray[6][1]) +
			"\nNight Twilight:\t\t" + convertToTimeString(timesArray[7][0]) + " - " + convertToTimeString(timesArray[7][1]) +
			"\nNight:\t\t\t\t" + convertToTimeString(timesArray[8][0]) + " - " + convertToTimeString(timesArray[8][1])
	},

	/**
	 * Get the location of the user
	 * Callback for changes in preferences
	 */
	updateLocation: function () {
		// Update the update information
		lastLocationUpdate = new Date()

		if (this.autolocation) {
			let loc = location.estimateLocation()
			this.latitude = loc["latitude"]
			this.longitude = loc["longitude"]

			this.etrLastUpdate = lastLocationUpdate.getHours() + ":" + lastLocationUpdate.getMinutes()
		}

		this.writeToLogs("Location updated")
	},

	/**
	 * Adding text to the logs
	 * 
	 * @param {string} msg New message string
	 */
	writeToLogs: function(msg) {
		this.tvLogs = communication.createLogs(this.tvLogs, msg)
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
