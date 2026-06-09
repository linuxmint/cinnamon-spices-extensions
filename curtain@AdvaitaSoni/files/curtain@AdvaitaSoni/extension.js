const key = require("./keyhandler");
const Util = imports.misc.util;
const { setEnableChangedCallback } = require("./keyMap")
const { toggledExtensionStateNotification } = require("./notification")
    //------------------------ GLOBAL OBJECTS
let extension;

//------------------------- EXTENSION
class myExtension {
    keyHandler;
    constructor() {
        this.keyHandler = new key.KeyHandler();
        toggledExtensionStateNotification(true)
        setEnableChangedCallback(toggledExtensionStateNotification)
    }
    destroy() {
        toggledExtensionStateNotification(false)
        this.keyHandler.destroy();
        this.keyHandler = null;
    }
}

// -------------------------------SETUP FUNCTIONS
function init(metadata) {
    try {
        extension = new myExtension();
    } catch (e) {
        global.log("error in init function ", e.message);
    }
}

function enable() {
    try {
        if (!extension) extension = new myExtension();
    } catch (e) {
        global.log("error in enable function ", e.message);
    }
    return Callbacks
}

function disable() {
    try {
        extension.destroy();
        extension = null;
    } catch (e) {
        global.log("error in disable function ", e.message);
    }
}

const Callbacks = {
    custom_shortcuts: function() {
        Util.spawnCommandLineAsync("cinnamon-settings keyboard -t shortcuts");
    }
}