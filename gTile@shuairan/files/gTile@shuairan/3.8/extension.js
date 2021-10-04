const { gtile } = require('./gTile');

/**
 * called when extension is loaded
 */
function init(extensionMeta) {
    //extensionMeta holds your metadata.json info
    gtile.init();
}

/**
 * called when extension is loaded
 */
function enable() {
    gtile.enable();
}

/**
 * called when extension gets disabled
 */
function disable() {
    gtile.disable();
}