/**
 * @name	Cinnamon-Dynamic-Wallpaper
 * @alias 	TobiZog
 * @since	2023-08-25
 * 
 * @description Handles communications with the user (notifications, logs)
 */

/******************** Imports ********************/

const St = imports.gi.St;
const Main = imports.ui.main;
const Util = imports.misc.util;
const MessageTray = imports.ui.messageTray;




/******************** Functions ********************/

/**
 * Displaying a desktop notification
 * 
 * @param {string} title 				The Title in the notification
 * @param {string} text 				The text in the notification
 * @param {boolean} showOpenSettings 	Display the "Open settings" button in the notification, 
 * 										defaults to false
 */
function showNotification(title, text, showOpenSettings = false) {
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
			Util.spawnCommandLine("xlet-settings extension " + UUID));
	}

	// Put all together
	Main.messageTray.add(source);

	// Display it
	source.notify(notification);
}


/**
 * Adding a message to the logs
 * 
 * @param {string} logMsg New log message to add
 */
function createLogs(tvLogs, logMsg) {
	/**
	 * Pad a number with leading zeros
	 * 
	 * @param {number} num Number to format
	 * @param {number} size Final string length
	 * 
	 * @returns String with defined length
	 */
	function pad(num, size) {
		var s = "00" + num
		return s.substring(s.length - size)
	}

	// Estimate date and time
	let date = new Date()
	let formattedDate = pad(date.getHours(), 2) + ":" + pad(date.getMinutes(), 2) + ":" + pad(date.getSeconds(), 2)

	// Add the the logs
	return formattedDate + "\t" + logMsg + "\n" + tvLogs
}