const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;

const OsdWithNumbers = require('./osdWithNumber');

class MyExtension {
    constructor(meta) {
        this._meta = meta;
    }

    enable() {
        Main.osdWindowManager = new OsdWithNumbers.OsdWindowManager();
    }

    disable() {
        Main.osdWindowManager = new OsdWindow.OsdWindowManager();
    }
}

let extension = null;

function enable() {
    try {
        extension.enable();
    } catch (err) {
        extension.disable();
        throw err;
    }
}

function disable() {
    try {
        extension.disable();
    } catch (err) {
        global.logError(err);
    } finally {
        extension = null;
    }
}

function init(metadata) {
    extension = new MyExtension(metadata);
}
