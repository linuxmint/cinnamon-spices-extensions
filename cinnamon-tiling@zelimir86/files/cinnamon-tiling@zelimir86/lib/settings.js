// Thin wrapper around Cinnamon's xlet settings.

const Settings = imports.ui.settings;

var SettingsWrapper = class SettingsWrapper {
    constructor(uuid) {
        this._settings = new Settings.ExtensionSettings(this, uuid);
        this._ids = [];
    }

    get(key) {
        return this._settings.getValue(key);
    }

    // Deep copy, for generic (JSON) values that are mutated before saving.
    getCopy(key) {
        const v = this.get(key);
        return v === undefined || v === null ? v : JSON.parse(JSON.stringify(v));
    }

    set(key, value) {
        this._settings.setValue(key, value);
    }

    connect(key, cb) {
        const id = this._settings.connect(`changed::${key}`, () => cb(this.get(key)));
        this._ids.push(id);
        return id;
    }

    destroy() {
        for (const id of this._ids) {
            try {
                this._settings.disconnect(id);
            } catch (e) { /* ignore */ }
        }
        this._ids = [];
        try {
            if (this._settings.finalize)
                this._settings.finalize();
        } catch (e) { /* ignore */ }
    }
};
