// The extension is inert until the optional applet registers a client.
const DisplayScaleExtension = require("./adjustments");
let extension = null;

function init(metadata) {
}

function enable() {
    if (extension)
        extension.destroy();
    extension = new DisplayScaleExtension();
    return extension;
}

function disable() {
    if (extension)
        extension.destroy();
    extension = null;
}
