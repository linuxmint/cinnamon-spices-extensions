/**
 * @name	Cinnamon-Dynamic-Wallpaper
 * @alias 	TobiZog
 * @since	2023
 * 
 * @description Functions to estimate the user location
 */

/******************** Imports ********************/

const Soup = imports.gi.Soup;


/******************** Functions ********************/

/**
 * Estimate the location of the user
 * 
 * @returns Location data if succeded or -1 if failed
 */
function estimateLocation() {
	let sessionSync = new Soup.SessionSync();
	let msg = Soup.Message.new('GET', "https://get.geojs.io/v1/ip/geo.json");
	sessionSync.send_message(msg);

	if (msg.status_code == 200) {
		return JSON.parse(msg.response_body.data);
	} else {
		return -1;
	}
}