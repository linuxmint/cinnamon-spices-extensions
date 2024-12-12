const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;

const CINNAMON_VERSION = GLib.getenv('CINNAMON_VERSION');

const LEVEL_ANIMATION_TIME = 0.1;
const FADE_TIME = 0.1;
let HIDE_TIMEOUT = 1500;

function version_exceeds(version, min_version) {
    let our_version = version.split(".");
    let cmp_version = min_version.split(".");
    let i;

    for (i = 0; i < our_version.length && i < cmp_version.length; i++) {
        let our_part = parseInt(our_version[i]);
        let cmp_part = parseInt(cmp_version[i]);

        if (isNaN(our_part) || isNaN(cmp_part)) {
            return false;
        }

        if (our_part < cmp_part) {
            return false;
        } else
        if (our_part > cmp_part) {
            return true;
        }
    }

    if (our_version.length < cmp_version.length) {
        return false;
    } else {
        return true;
    }
}

// Removal of the percentage in the Cinnamon media OSD, from Cinnamon 6.4.
// See https://github.com/linuxmint/mint22.1-beta/issues/4#issuecomment-2535973291
let PERCENT_SYMBOL = " %";
if (version_exceeds(CINNAMON_VERSION, "6.4"))
    PERCENT_SYMBOL = "";

const OSD_SIZE = 110;

let extension_settings = null;
let should_customize_this_osd = false;

function convertGdkIndex(monitorIndex) {
    let screen = Gdk.Screen.get_default();
    let rect = screen.get_monitor_geometry(monitorIndex);
    let cx = rect.x + rect.width / 2;
    let cy = rect.y + rect.height / 2;
    for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
        let monitor = Main.layoutManager.monitors[i];
        if (cx >= monitor.x && cx < monitor.x + monitor.width &&
            cy >= monitor.y && cy < monitor.y + monitor.height)
            monitorIndex = i;
    }

    return monitorIndex;
};

function LevelBar() {
    this._init();
}

LevelBar.prototype = {
    _init: function () {
        this._level = 0;

        this.initial = true;

        this.actor = new St.Bin({
            style_class: 'level',
            x_align: St.Align.START,
            y_fill: true,
            important: true
        });
        this._bar = new St.Widget({
            style_class: 'level-bar',
            important: true
        });

        this.stored_actor_width = 0;
        this.max_bar_width = 0;

        this.actor.set_child(this._bar);
    },

    get level() {
        return this._level;
    },

    set level(value) {
        this._level = Math.max(0, Math.min(value, 100));

        /* Track our actor's width - if it changes, we can be certain some setting
         * or the theme changed.  Make sure we update it, as well as figure out our
         * level bar's allocation.
         */
        if (this.initial || (this.stored_actor_width != this.actor.width)) {
            this.initial = false;

            this.stored_actor_width = this.actor.width;

            let box = this.actor.get_theme_node().get_content_box(this.actor.get_allocation_box());

            this.max_bar_width = box.x2 - box.x1;
        }

        let newWidth = this.max_bar_width * (this._level / 100);

        if (newWidth != this._bar.width) {
            this._bar.width = newWidth;
        }
    },

    setLevelBarHeight: function (sizeMultiplier) {
        let themeNode = this.actor.get_theme_node();
        let height = themeNode.get_height();
        let newHeight = Math.floor(height * sizeMultiplier);
        this.actor.set_height(newHeight);
    }
};

function OsdWindow(monitorIndex) {
    this._init(monitorIndex);
}

OsdWindow.prototype = {
    _init: function (monitorIndex) {
        this._popupSize = 0;

        this._osdSettings = new Gio.Settings({ schema_id: "org.cinnamon" });
        this._osdSettings.connect("changed::show-media-keys-osd", Lang.bind(this, this._onOsdSettingsChanged));

        this._monitorIndex = monitorIndex;

        this.actor = new St.BoxLayout({
            style_class: 'osd-window',
            vertical: true,
            important: true
        });

        this._icon = new St.Icon();
        this.actor.add(this._icon, { expand: false });

        this._level = new LevelBar();
        this.actor.add(this._level.actor, { expand: true });

        this._label = new St.Label();
        this._label.style = 'font-size: 1.2em; text-align: center;'
        this.actor.add(this._label);

        this._hideTimeoutId = 0;
        this._reset();

        Main.layoutManager.connect('monitors-changed', Lang.bind(this, this._monitorsChanged));
        this._onOsdSettingsChanged();

        Main.uiGroup.add_child(this.actor);
    },

    setIcon: function (icon) {
        this._icon.gicon = icon;
    },

    setLevel: function (level) {
        if (level != undefined) {
            this._label.set_text(""+ level + PERCENT_SYMBOL);
            this._label.visible = this._level.actor.visible = true;

            if (this.actor.visible)
                Tweener.addTween(this._level,
                    {
                        level: level,
                        time: LEVEL_ANIMATION_TIME,
                        transition: 'easeOutQuad'
                    });
            else
                this._level.level = level;
        } else {
            this._label.set_text("");
            this._label.visible = this._level.actor.visible = false;
        }
    },

    show: function () {
        let monitor = Main.layoutManager.monitors[this._monitorIndex];

        if (should_customize_this_osd) {
            // showing volume or brightness osd, update osd design
            let osd_width = this._popupSize * extension_settings.osd_width;
            let osd_height = this._popupSize * extension_settings.osd_height;
            let icon_size = osd_height * (extension_settings.icon_size / 100);
            let level_bar_size = osd_height * (extension_settings.level_bar_size / 100);
            let label_size = osd_height * (extension_settings.label_size / 100);

            this.actor.set_size(osd_width, osd_height);
            this.actor.vertical = false;
            this.actor.translation_y = ((monitor.height * (extension_settings.osd_position_y / 100)) + monitor.y) - (osd_height / 2);
            this.actor.translation_x = ((monitor.width * (extension_settings.osd_position_x / 100)) + monitor.x) - (osd_width / 2);
            if (extension_settings.osd_window_overwrite_css) {
                // user prefered to use their own custom css
                this.actor.style = "padding: 0px;" + extension_settings.osd_window_css;
            } else {
                this.actor.style = `border-radius: ${extension_settings.osd_border_radius}px; padding: 0px;`;
            }

            this._icon.set_icon_size(icon_size);
            if (extension_settings.icon_overwrite_css) {
                this._icon.style = extension_settings.icon_css;
            } else {
                this._icon.style = `margin: ${(osd_height - icon_size) / 2}px 0px; margin-left: 10px; padding: 0px;`
            }

            if (extension_settings.level_bar_overwrite_css) {
                this._level.actor.style = extension_settings.level_bar_background_css;
                this._level._bar.style = extension_settings.level_bar_foreground_css;
            } else {
                this._level.actor.style = `margin: ${(osd_height - level_bar_size) / 2}px 0; border-radius: ${extension_settings.level_bar_border_radius}px;`;
                this._level._bar.style = `border-radius: ${extension_settings.level_bar_border_radius}px;`;
            }

            if (extension_settings.label_show) {
                if (extension_settings.label_overwrite_css) {
                    this._label.style = extension_settings.label_css;
                } else {
                    this._label.style = `text-align: left; font-size: ${label_size}px; margin: ${((osd_height - label_size) / 2) + parseFloat(extension_settings.label_vertical_align_correction)}px 0 0 0; min-width: ${label_size * 3.3}px; padding: 0;`;
                }
            } else {
                // hide label
                // Note: Keep "text-align". I don't know why but it breaks other OSDs' label position if we dont use it here.
                this._label.style = "text-align: left; font-size: 0px; margin: 0px;";
            }

            // colors
            if (extension_settings.osd_window_overwrite_colors) {
                this.actor.style += `border-color: ${extension_settings.osd_window_border_color}; background-color: ${extension_settings.osd_window_background_color};`;
            }
            if (extension_settings.icon_overwrite_colors) {
                this._icon.style += `color: ${extension_settings.icon_color};`;
            }
            if (extension_settings.level_bar_overwrite_colors) {
                this._level.actor.style += `background-color: ${extension_settings.level_bar_background_color};`;
                this._level._bar.style += `background-color: ${extension_settings.level_bar_foreground_color};`;
            }
            if (extension_settings.label_overwrite_colors && extension_settings.label_show) {
                this._label.style += `color: ${extension_settings.label_color};`;
            }

        } else {
            // use default design
            let scaleFactor = global.ui_scale;

            this.actor.vertical = true;
            this.actor.style = "padding: 20px;";
            this.actor.set_size(this._popupSize, this._popupSize);
            this.actor.translation_y = (monitor.height + monitor.y) - (this._popupSize + (50 * scaleFactor));
            this.actor.translation_x = ((monitor.width / 2) + monitor.x) - (this._popupSize / 2);

            this._icon.set_icon_size(this._popupSize / (2 * scaleFactor));
            this._icon.style = "";

            this._level.actor.style = "margin: 0;";
            this._level._bar.style = "";

            this._label.style = "font-size: 1.2em; text-align: center;";

            this.actor.vertical = true;
            this._icon.icon_size = this._popupSize / (2 * scaleFactor);
            this.actor.set_size(this._popupSize, this._popupSize);
            this.actor.translation_y = (monitor.height + monitor.y) - (this._popupSize + (50 * scaleFactor));
            this.actor.translation_x = ((monitor.width / 2) + monitor.x) - (this._popupSize / 2);
        }

        if (this._osdBaseSize == undefined)
            return;

        if (!this._icon.gicon)
            return;

        if (!this.actor.visible) {
            Meta.disable_unredirect_for_screen(global.screen);
            this._level.setLevelBarHeight(this._sizeMultiplier);
            this.actor.show();
            this.actor.opacity = 0;
            this.actor.raise_top();

            Tweener.addTween(this.actor,
                {
                    opacity: 255,
                    time: FADE_TIME,
                    transition: 'easeOutQuad'
                });
        }

        if (this._hideTimeoutId)
            Mainloop.source_remove(this._hideTimeoutId);
        this._hideTimeoutId = Mainloop.timeout_add(HIDE_TIMEOUT, Lang.bind(this, this._hide));
    },

    cancel: function () {
        if (!this._hideTimeoutId)
            return;

        Mainloop.source_remove(this._hideTimeoutId);
        this._hide();
    },

    _hide: function () {
        this._hideTimeoutId = 0;
        Tweener.addTween(this.actor,
            {
                opacity: 0,
                time: FADE_TIME,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function () {
                    this._reset();
                    Meta.enable_unredirect_for_screen(global.screen);
                })
            });
    },

    _reset: function () {
        this.actor.hide();
        this.setLevel();
    },

    _monitorsChanged: function () {
        let monitor = Main.layoutManager.monitors[this._monitorIndex];
        if (monitor) {
            let scaleW = monitor.width / 640.0;
            let scaleH = monitor.height / 480.0;
            let scale = Math.min(scaleW, scaleH);
            this._popupSize = this._osdBaseSize * Math.max(1, scale);

            let scaleFactor = global.ui_scale;
            this._icon.icon_size = this._popupSize / (2 * scaleFactor);
            this.actor.set_size(this._popupSize, this._popupSize);
            this.actor.translation_y = (monitor.height + monitor.y) - (this._popupSize + (50 * scaleFactor));
            this.actor.translation_x = ((monitor.width / 2) + monitor.x) - (this._popupSize / 2);
        }
    },

    _onOsdSettingsChanged: function () {
        let currentSize = this._osdSettings.get_value("show-media-keys-osd");
        if (typeof(currentSize) == "boolean") { // Cinnamon 6+
            if (currentSize) {
                this._sizeMultiplier = 0.85;
                this._osdBaseSize = Math.floor(OSD_SIZE * this._sizeMultiplier);
            } else {
                this._osdBaseSize = null;
            }
        } else {
            switch (currentSize) {
                case "disabled":
                    this._osdBaseSize = null;
                    break;
                case "small":
                    this._sizeMultiplier = 0.7;
                    this._osdBaseSize = Math.floor(OSD_SIZE * this._sizeMultiplier);
                    break;
                case "large":
                    this._sizeMultiplier = 1.0;
                    this._osdBaseSize = OSD_SIZE;
                    break;
                default:
                    this._sizeMultiplier = 0.85;
                    this._osdBaseSize = Math.floor(OSD_SIZE * this._sizeMultiplier);
            }
        }

        this._monitorsChanged();
    }
};

function OsdWindowManager(preferences) {
    extension_settings = preferences;
    HIDE_TIMEOUT = extension_settings.osd_hide_timeout;
    this._init();
}

OsdWindowManager.prototype = {
    _init: function () {
        this._osdWindows = [];

        Main.layoutManager.connect('monitors-changed',
            Lang.bind(this, this._monitorsChanged));
        this._monitorsChanged();
    },

    _monitorsChanged: function () {
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            if (this._osdWindows[i] == undefined)
                this._osdWindows[i] = new OsdWindow(i);
        }

        for (let i = Main.layoutManager.monitors.length; i < this._osdWindows.length; i++) {
            this._osdWindows[i].actor.destroy();
            this._osdWindows[i] = null;
        }

        this._osdWindows.length = Main.layoutManager.monitors.length;
    },

    _showOsdWindow: function (monitorIndex, icon, level) {
        if ((icon.names[0].includes("audio-volume-") && extension_settings.selected_volume_as_horizontal) ||
            (icon.names[0].includes("display-brightness-symbolic") && extension_settings.selected_brightness_as_horizontal) ||
            (icon.names[0].includes("microphone-sensitivity-") && extension_settings.selected_mic_as_horizontal)
        ) {
            should_customize_this_osd = true;
        } else {
            should_customize_this_osd = false;
        }
        this._osdWindows[monitorIndex].setIcon(icon);
        this._osdWindows[monitorIndex].setLevel(level);
        this._osdWindows[monitorIndex].show();
    },

    show: function (monitorIndex, icon, level, convertIndex) {
        if (monitorIndex != -1) {
            if (convertIndex)
                monitorIndex = convertGdkIndex(monitorIndex);
            for (let i = 0; i < this._osdWindows.length; i++) {
                if (i == monitorIndex)
                    this._showOsdWindow(i, icon, level);
                else
                    this._osdWindows[i].cancel();
            }
        } else {
            for (let i = 0; i < this._osdWindows.length; i++)
                this._showOsdWindow(i, icon, level);
        }
    },

    hideAll: function () {
        for (let i = 0; i < this._osdWindows.length; i++)
            this._osdWindows[i].cancel();
    }
};
