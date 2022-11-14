const UUID = "horizontal-osd@berk-karaal";

const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;
const Settings = imports.ui.settings;

const Self = imports.extensions[UUID];
const CustomOsd = Self.CustomOsd;

let extension_settings = {};

function MyExtension(meta) {
    this._init(meta);
}

MyExtension.prototype = {
    _init: function (meta) {
        this.meta = meta;

        this.settings = new Settings.ExtensionSettings(extension_settings, UUID, meta.uuid);

        // general:
        this.settings.bind("osd-width", "osd_width", this.on_settings_changed);
        this.settings.bind("osd-height", "osd_height", this.on_settings_changed);
        this.settings.bind("osd-border-radius", "osd_border_radius", this.on_settings_changed);
        this.settings.bind("osd-position-x", "osd_position_x", this.on_settings_changed);
        this.settings.bind("osd-position-y", "osd_position_y", this.on_settings_changed);
        this.settings.bind("osd-hide-timeout", "osd_hide_timeout", this.on_settings_changed);

        this.settings.bind("icon-size", "icon_size", this.on_settings_changed);

        this.settings.bind("level-bar-size", "level_bar_size", this.on_settings_changed);
        this.settings.bind("level-bar-border-radius", "level_bar_border_radius", this.on_settings_changed);

        this.settings.bind("label-show", "label_show", this.on_settings_changed);
        this.settings.bind("label-size", "label_size", this.on_settings_changed);
        this.settings.bind("label-vertical-align-correction", "label_vertical_align_correction", this.on_settings_changed);

        // colors:
        this.settings.bind("osd-window-overwrite-colors", "osd_window_overwrite_colors", this.on_settings_changed);
        this.settings.bind("osd-window-border-color", "osd_window_border_color", this.on_settings_changed);
        this.settings.bind("osd-window-background-color", "osd_window_background_color", this.on_settings_changed);

        this.settings.bind("icon-overwrite-colors", "icon_overwrite_colors", this.on_settings_changed);
        this.settings.bind("icon-color", "icon_color", this.on_settings_changed);

        this.settings.bind("level-bar-overwrite-colors", "level_bar_overwrite_colors", this.on_settings_changed);
        this.settings.bind("level-bar-foreground-color", "level_bar_foreground_color", this.on_settings_changed);
        this.settings.bind("level-bar-background-color", "level_bar_background_color", this.on_settings_changed);

        this.settings.bind("label-overwrite-colors", "label_overwrite_colors", this.on_settings_changed);
        this.settings.bind("label-color", "label_color", this.on_settings_changed);

        // advanced:
        this.settings.bind("osd-window-overwrite-css", "osd_window_overwrite_css", this.on_settings_changed);
        this.settings.bind("osd-window-css", "osd_window_css", this.on_settings_changed);

        this.settings.bind("icon-overwrite-css", "icon_overwrite_css", this.on_settings_changed);
        this.settings.bind("icon-css", "icon_css", this.on_settings_changed);

        this.settings.bind("level-bar-overwrite-css", "level_bar_overwrite_css", this.on_settings_changed);
        this.settings.bind("level-bar-background-css", "level_bar_background_css", this.on_settings_changed);
        this.settings.bind("level-bar-foreground-css", "level_bar_foreground_css", this.on_settings_changed);

        this.settings.bind("label-overwrite-css", "label_overwrite_css", this.on_settings_changed);
        this.settings.bind("label-css", "label_css", this.on_settings_changed);

        // select osds:
        this.settings.bind("selected-volume-as-horizontal", "selected_volume_as_horizontal", this.on_settings_changed);
        this.settings.bind("selected-brightness-as-horizontal", "selected_brightness_as_horizontal", this.on_settings_changed);
        this.settings.bind("selected-mic-as-horizontal", "selected_mic_as_horizontal", this.on_settings_changed);

    },

    enable: function () {
        // extension enabled, make system use our custom OsdWindowManager:
        Main.osdWindowManager = new CustomOsd.OsdWindowManager(extension_settings);
    },

    disable: function () {
        // extension disabled, turn back to default OsdWindowManager:
        Main.osdWindowManager = new OsdWindow.OsdWindowManager();
    },

    on_settings_changed: function () {
        // settings changed, update osd with new user preferences:
        Main.osdWindowManager = new CustomOsd.OsdWindowManager(extension_settings);
    },
};


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
    extension = new MyExtension(metadata);
}
