const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const PopupMenu = imports.ui.popupMenu;
const WindowMenu = imports.ui.windowMenu;

const Sizing = require('./sizing');
const FAMILIES = Sizing.FAMILIES;

const UUID = "sizely@gossardla";
const HOTKEY_CENTER = "sizely-center";

let extension = null;

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + "/locale");

function _(str) {
    const translated = Gettext.dgettext(UUID, str);
    return translated === str ? str : translated;
}

function _log(message) {
    global.log("[" + UUID + "] " + message);
}

function _logError(message, error) {
    global.logError("[" + UUID + "] " + message + ": " + error);
}

class Sizely {
    constructor(uuid) {
        this.uuid = uuid;
        this._origBuildMenu = null;

        this.settings = new Settings.ExtensionSettings(this, uuid);
        this.settings.bind("presets", "presets");
        this.settings.bind("center-keybinding", "centerKeybinding", () => this._bindCenterHotkey());
        this.settings.bind("size-unit", "sizeUnit");
        this.settings.bind("use-submenu", "useSubmenu");
        this.settings.bind("show-center-item", "showCenterItem");
        this.settings.bind("show-in-window-menu", "showInWindowMenu");

        this.settings.bind("show-standard-resolutions", "showStandardResolutions");
        this.settings.bind("standard-center", "standardCenter");
        this.settings.bind("standard-fit-only", "standardFitOnly");
        for (const family of FAMILIES) {
            this.settings.bind("standard-family-" + family.id, "standardFamily_" + family.id);
        }
    }

    enable() {
        this._patchWindowMenu();
        this._bindCenterHotkey();
    }

    disable() {
        this._unpatchWindowMenu();
        Main.keybindingManager.removeHotKey(HOTKEY_CENTER);
        this.settings.finalize();
    }

    _useLogical() {
        return this.sizeUnit !== "physical";
    }

    _patchWindowMenu() {
        if (this._origBuildMenu) {
            return;
        }

        const self = this;
        this._origBuildMenu = WindowMenu.WindowMenu.prototype._buildMenu;

        WindowMenu.WindowMenu.prototype._buildMenu = function(window) {
            self._origBuildMenu.call(this, window);
            try {
                self._injectItems(this, window);
            } catch (e) {
                _logError("Failed to extend the window menu", e);
            }
        };
    }

    _unpatchWindowMenu() {
        if (!this._origBuildMenu) {
            return;
        }
        WindowMenu.WindowMenu.prototype._buildMenu = this._origBuildMenu;
        this._origBuildMenu = null;
    }

    _addAction(menu, target, position, title, callback) {
        const item = new WindowMenu.MnemonicLeftOrnamentedMenuItem(title);
        target.addMenuItem(item, position);
        item.connect("activate", (o, event) => callback(event));
        menu._items.push(item);
        return item;
    }

    _injectItems(menu, window) {
        if (!this.showInWindowMenu) {
            return;
        }
        if (window.get_window_type() === Meta.WindowType.DESKTOP) {
            return;
        }

        const presets = Array.isArray(this.presets) ? this.presets : [];
        if (presets.length === 0 && !this.showCenterItem && !this.showStandardResolutions) {
            return;
        }

        let at = Math.max(0, menu._getMenuItems().length - 2);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), at++);

        if (presets.length > 0) {
            if (this.useSubmenu) {
                const sub = new WindowMenu.MnemonicSubMenuMenuItem(_("_Size"));
                menu.addMenuItem(sub, at++);
                menu._items.push(sub);
                for (const preset of presets) {
                    this._addAction(menu, sub.menu, undefined, this._presetLabel(preset),
                        () => Sizing.resizeWindow(window, preset.width, preset.height,
                            preset.center, this._useLogical()));
                }
            } else {
                for (const preset of presets) {
                    this._addAction(menu, menu, at++, this._presetLabel(preset),
                        () => Sizing.resizeWindow(window, preset.width, preset.height,
                            preset.center, this._useLogical()));
                }
            }
        }

        at = this._injectStandardResolutions(menu, window, at);

        if (this.showCenterItem) {
            const item = this._addAction(menu, menu, at++, _("C_enter on Monitor"),
                () => Sizing.centerWindow(window));
            item.setIcon("view-restore-symbolic");
        }
    }

    _injectStandardResolutions(menu, window, at) {
        if (!this.showStandardResolutions) {
            return at;
        }

        const enabled = FAMILIES.filter(f => this["standardFamily_" + f.id]).map(f => f.id);
        const groups = Sizing.resolutionGroups(window, enabled, this.standardFitOnly, this._useLogical());
        if (groups.length === 0) {
            return at;
        }

        const root = new WindowMenu.MnemonicSubMenuMenuItem(_("Stan_dard Resolutions"));

        groups.forEach((group, index) => {
            if (index > 0) {
                root.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
            const heading = this._addAction(menu, root.menu, undefined, group.label, () => {});
            heading.setSensitive(false);

            for (const [w, h, name] of group.entries) {
                this._addAction(menu, root.menu, undefined, Sizing.entryLabel(w, h, name),
                    () => Sizing.resizeWindow(window, w, h, this.standardCenter, this._useLogical()));
            }
        });

        menu.addMenuItem(root, at++);
        menu._items.push(root);
        return at;
    }

    _presetLabel(preset) {
        if (preset.label && preset.label.trim() !== "") {
            return preset.label;
        }
        return preset.width + " × " + preset.height;
    }

    _bindCenterHotkey() {
        Main.keybindingManager.removeHotKey(HOTKEY_CENTER);
        if (!this.centerKeybinding || this.centerKeybinding === "::") {
            return;
        }
        Main.keybindingManager.addHotKey(HOTKEY_CENTER, this.centerKeybinding,
            () => Sizing.centerWindow(Sizing.targetWindow()));
    }
}

function init(metadata) {
    extension = new Sizely(metadata.uuid);
}

function enable() {
    extension.enable();
}

function disable() {
    extension.disable();
    extension = null;
}
