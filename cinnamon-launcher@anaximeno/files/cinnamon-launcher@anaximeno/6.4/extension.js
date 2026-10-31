const { LauncherDialog } = require('./launcher.js');

let uuid = null;
let dialog = null;

function init(metadata) {
    uuid = metadata.uuid;
}

function enable() {
    dialog = new LauncherDialog(uuid);
    dialog.enable();
}

function disable() {
    dialog.destroy();
    dialog = null;
}
