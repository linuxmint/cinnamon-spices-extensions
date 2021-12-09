const { gtile } = require('./gTile');

/**
 * called when extension is loaded
 */
function init(metadata) {
    //extensionMeta holds your metadata.json info
    gtile.init(metadata);
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