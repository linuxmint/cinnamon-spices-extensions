let extensionInstance;

function init(meta) {
    const {globalLogger: logger} = require('src/logger');
    logger.setUUID(meta.uuid);

    const {BackToMonitorExtension} = require('src/extension');
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
