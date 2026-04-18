const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;
const Settings = imports.ui.settings;

const Osd150 = require('./osd150');
var UUID;
var OSD150_settings = {};

class MyExtension {
    constructor(meta) {
        this._meta = meta;


        this.settings = new Settings.ExtensionSettings(OSD150_settings, UUID, meta.uuid);
        this.settings.bind("OSDxLocation", "xRelocation");
        this.settings.bind("OSDyLocation", "yRelocation");
    }

    enable() {
        Main.osdWindowManager = new Osd150.OsdWindowManager(OSD150_settings);
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
    UUID = metadata.uuid;
    extension = new MyExtension(metadata);
}
