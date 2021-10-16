const {BackToMonitorExtension} = require('src/extension');
const {globalLogger: logger} = require('src/logger');

let extensionInstance;

function init(meta) {
    logger.setUUID(meta.uuid);
    extensionInstance = new BackToMonitorExtension(meta);
}

function enable() {
    try {
        extensionInstance.enable();
    } catch (err) {
        disable();
        throw err;
    }
}

function disable() {
    if (extensionInstance) {
        try {
            extensionInstance.disable();
        } catch (err) {
            global.logError(err);
        } finally {
            extensionInstance = undefined;
        }
    }
}
