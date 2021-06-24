const Extension = require('src/extension');

let extensionInstance;

function init(meta) {
    extensionInstance = new Extension(meta);
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
