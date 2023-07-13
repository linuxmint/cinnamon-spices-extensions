const Soup = imports.gi.Soup;


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