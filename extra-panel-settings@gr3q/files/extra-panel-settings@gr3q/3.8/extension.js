const { extraPanelSettings } = require('./extra-panel-settings');

/**
 * called when extension is loaded
 */
function init(metadata) {
    //extensionMeta holds your metadata.json info
    extraPanelSettings.init(metadata);
}

/**
 * called when extension is loaded
 */
function enable() {
    extraPanelSettings.enable();
}

/**
 * called when extension gets disabled
 */
function disable() {
    extraPanelSettings.disable();
}