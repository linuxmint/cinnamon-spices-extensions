const Settings = imports.ui.settings;

let uuid, settings;

function init(meta) {
    uuid = meta.uuid;
}

function enable() {
    globalThis.log(`[${uuid}]: This extension is not compatible with this version of Cinnamon.`);
    settings = new Settings.ExtensionSettings({}, uuid);
}

function disable() {
    if (settings) {
        settings.finalize();
        settings = null;
    }
}
