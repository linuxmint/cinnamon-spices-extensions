const ExtensionUUID = "0dyseus@CinnamonTweaks";
const ExtensionMeta = imports.ui.extensionSystem.extensionMeta[ExtensionUUID];
const ExtensionPath = ExtensionMeta.path;

const Main = imports.ui.main;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const ModalDialog = imports.ui.modalDialog;
const Gio = imports.gi.Gio;
const Extension = imports.ui.extension;
const GioSSS = Gio.SettingsSchemaSource;

Gettext.bindtextdomain(ExtensionUUID, GLib.get_home_dir() + "/.local/share/locale");

function _(aStr) {
    let customTrans = Gettext.dgettext(ExtensionUUID, aStr);

    if (customTrans != aStr)
        return customTrans;

    return Gettext.gettext(aStr);
}

const SETTINGS_SHECMA = "org.cinnamon.extensions.0dyseus@CinnamonTweaks";

const Settings = getSettings();

const CTX_ITM_POS = {
    "last": 0,
    "bfr_about": 3,
    "bfr_conf": 2,
    "bfr_rem": 1

};

// Preferences keys
const P = {
    DESKTOP_TWEAKS_ENABLED: "desktop-tweaks-enabled",
    DESKTOP_TWEAKS_ALLOW_DROP_TO_DESKTOP: "desktop-tweaks-allow-drop-to-desktop",
    POPUP_MENU_MANAGER_TWEAKS_ENABLED: "popup-menu-manager-tweaks-enabled",
    POPUP_MENU_MANAGER_APPLETS_MENUS_BEHAVIOR: "popup-menu-manager-applets-menus-behavior",
    APPLETS_TWEAKS_ENABLED: "applets-tweaks-enabled",
    APPLETS_ASK_CONFIRMATION_APPLET_REMOVAL: "applets-ask-confirmation-applet-removal",
    APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT: "applets-add-open-folder-item-to-context",
    APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT: "applets-add-edit-file-item-to-context",
    APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT_PLACEMENT: "applets-add-open-folder-item-to-context-placement",
    APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT_PLACEMENT: "applets-add-edit-file-item-to-context-placement",
    DESKLETS_TWEAKS_ENABLED: "desklets-tweaks-enabled",
    DESKLETS_ASK_CONFIRMATION_DESKLET_REMOVAL: "desklets-ask-confirmation-desklet-removal",
    DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT: "desklets-add-open-folder-item-to-context",
    DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT: "desklets-add-edit-file-item-to-context",
    DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT_PLACEMENT: "desklets-add-open-folder-item-to-context-placement",
    DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT_PLACEMENT: "desklets-add-edit-file-item-to-context-placement",
    NOTIFICATIONS_ENABLE_TWEAKS: "notifications-enable-tweaks",
    NOTIFICATIONS_ENABLE_ANIMATION: "notifications-enable-animation",
    NOTIFICATIONS_POSITION: "notifications-position",
    NOTIFICATIONS_DISTANCE_FROM_PANEL: "notifications-distance-from-panel",
    NOTIFICATIONS_RIGHT_MARGIN: "notifications-right-margin",
    WIN_DEMANDS_ATTENTION_ACTIVATION_MODE: "win-demands-attention-activation-mode",
    WIN_DEMANDS_ATTENTION_KEYBOARD_SHORTCUT: "win-demands-attention-keyboard-shortcut",
    HOTCORNERS_TWEAKS_ENABLED: "hotcorners-tweaks-enabled",
    HOTCORNERS_DELAY_TOP_LEFT: "hotcorners-delay-top-left",
    HOTCORNERS_DELAY_TOP_RIGHT: "hotcorners-delay-top-right",
    HOTCORNERS_DELAY_BOTTOM_LEFT: "hotcorners-delay-bottom-left",
    HOTCORNERS_DELAY_BOTTOM_RIGHT: "hotcorners-delay-bottom-right",
    TOOLTIPS_TWEAKS_ENABLED: "tooltips-tweaks-enabled",
    TOOLTIPS_ALIGNMENT: "tooltips-alignment",
    TOOLTIPS_DELAY: "tooltips-delay",
    INITIAL_LOAD: "initial-load",
    WINDOW_SHADOWS_TWEAKS_ENABLED: "window-shadows-tweaks-enabled",
    WINDOW_SHADOWS_PRESET: "window-shadows-preset",
    WINDOW_SHADOWS_CUSTOM_PRESET: "window-shadows-custom-preset",
};

const SHADOW_VALUES = {
    "windows_10": {
        "focused": {
            "normal": [3, -1, 0, 3, 128],
            "dialog": [3, -1, 0, 3, 128],
            "modal_dialog": [3, -1, 0, 1, 128],
            "utility": [3, -1, 0, 3, 128],
            "border": [3, -1, 0, 3, 128],
            "menu": [3, -1, 0, 3, 128],
            "popup-menu": [1, 0, 0, 1, 128],
            "dropdown-menu": [1, 10, 0, 1, 128],
            "attached": [1, 0, 0, 1, 128]
        },
        "unfocused": {
            "normal": [3, -1, 0, 3, 128],
            "dialog": [3, -1, 0, 3, 128],
            "modal_dialog": [3, -1, 0, 1, 128],
            "utility": [3, -1, 0, 3, 128],
            "border": [3, -1, 0, 3, 128],
            "menu": [3, -1, 0, 3, 128],
            "popup-menu": [1, 0, 0, 1, 128],
            "dropdown-menu": [1, 10, 0, 1, 128],
            "attached": [1, 0, 0, 1, 128]
        }
    },
    "no_shadows": {
        "focused": {
            "normal": [1, -1, 0, 3, 0],
            "dialog": [1, -1, 0, 3, 0],
            "modal_dialog": [1, -1, 0, 1, 0],
            "utility": [1, -1, 0, 1, 0],
            "border": [1, -1, 0, 3, 0],
            "menu": [1, -1, 0, 3, 0],
            "popup-menu": [1, -1, 0, 1, 0],
            "dropdown-menu": [1, 10, 0, 1, 0],
            "attached": [1, -1, 0, 1, 0]
        },
        "unfocused": {
            "normal": [1, -1, 0, 3, 0],
            "dialog": [1, -1, 0, 3, 0],
            "modal_dialog": [1, -1, 0, 3, 0],
            "utility": [1, -1, 0, 1, 0],
            "border": [1, -1, 0, 3, 0],
            "menu": [1, -1, 0, 0, 0],
            "popup-menu": [1, -1, 0, 1, 0],
            "dropdown-menu": [1, 10, 0, 1, 0],
            "attached": [1, -1, 0, 3, 0]
        }
    },
    "default": {
        "focused": {
            "normal": [6, -1, 0, 3, 255],
            "dialog": [6, -1, 0, 3, 255],
            "modal_dialog": [6, -1, 0, 1, 255],
            "utility": [3, -1, 0, 1, 255],
            "border": [6, -1, 0, 3, 255],
            "menu": [6, -1, 0, 3, 255],
            "popup-menu": [1, -1, 0, 1, 128],
            "dropdown-menu": [1, 10, 0, 1, 128],
            "attached": [6, -1, 0, 1, 255]
        },
        "unfocused": {
            "normal": [3, -1, 0, 3, 128],
            "dialog": [3, -1, 0, 3, 128],
            "modal_dialog": [3, -1, 0, 3, 128],
            "utility": [3, -1, 0, 1, 128],
            "border": [3, -1, 0, 3, 128],
            "menu": [3, -1, 0, 0, 128],
            "popup-menu": [1, -1, 0, 1, 128],
            "dropdown-menu": [1, 10, 0, 1, 128],
            "attached": [3, -1, 0, 3, 128]
        }
    }
};

function getSettings(aSchema) {
    let schema = aSchema || SETTINGS_SHECMA;

    let schemaDir = Gio.file_new_for_path(ExtensionPath + "/schemas");
    let schemaSource;

    if (schemaDir.query_exists(null)) {
        schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
            GioSSS.get_default(),
            false);
    } else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schema, true);

    if (!schemaObj)
        throw new Error(_("Schema %s could not be found for extension %s.")
            .format(schema, ExtensionUUID) + _("Please check your installation."));

    return new Gio.Settings({
        settings_schema: schemaObj
    });
}

function dealWithRejection(aTweakDescription) {
    Main.warningNotify(_(ExtensionMeta.name), _(aTweakDescription) + "\n" +
        _("Tweak ativation aborted!!!") + "\n" +
        _("Your Cinnamon version may not be compatible!!!"));
}

function informAndDisable() {
    try {
        let msg = _("Extension ativation aborted!!!") + "\n" +
            _("Your Cinnamon version may not be compatible!!!") + "\n" +
            _("Minimum Cinnamon version allowed: 2.8.6");
        global.logError(msg);
        Main.criticalNotify(_(ExtensionMeta.name), msg);
    } finally {
        let enabledExtensions = global.settings.get_strv("enabled-extensions");
        Extension.unloadExtension(ExtensionMeta.uuid, Extension.Type.EXTENSION);
        enabledExtensions.splice(enabledExtensions.indexOf(ExtensionMeta.uuid), 1);
        global.settings.set_strv("enabled-extensions", enabledExtensions);
    }
}

function injectToFunction(aParent, aName, aFunc) {
    let origin = aParent[aName];
    aParent[aName] = function() {
        let ret;
        ret = origin.apply(this, arguments);
        if (ret === undefined)
            ret = aFunc.apply(this, arguments);
        return ret;
    };
    return origin;
}

function removeInjection(aStorage, aInjection, aName) {
    if (aInjection[aName] === undefined)
        delete aStorage[aName];
    else
        aStorage[aName] = aInjection[aName];
}

function ConfirmationDialog() {
    this._init.apply(this, arguments);
}

ConfirmationDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function(aCallback, aDialogLabel, aDialogMessage) {
        ModalDialog.ModalDialog.prototype._init.call(this, {
            styleClass: null
        });

        let mainContentBox = new St.BoxLayout({
            style_class: 'polkit-dialog-main-layout',
            vertical: false
        });
        this.contentLayout.add(mainContentBox, {
            x_fill: true,
            y_fill: true
        });

        let messageBox = new St.BoxLayout({
            style_class: 'polkit-dialog-message-layout',
            vertical: true
        });
        mainContentBox.add(messageBox, {
            y_align: St.Align.START
        });

        this._subjectLabel = new St.Label({
            style_class: 'polkit-dialog-headline',
            text: aDialogLabel
        });

        messageBox.add(this._subjectLabel, {
            y_fill: false,
            y_align: St.Align.START
        });

        this._descriptionLabel = new St.Label({
            style_class: 'polkit-dialog-description',
            text: aDialogMessage
        });

        messageBox.add(this._descriptionLabel, {
            y_fill: true,
            y_align: St.Align.START
        });

        this.setButtons([{
            label: _("Cancel"),
            action: Lang.bind(this, function() {
                this.close();
            }),
            key: Clutter.Escape
        }, {
            label: _("OK"),
            action: Lang.bind(this, function() {
                this.close();
                aCallback();
            })
        }]);
    }
};

/**
 * Compares two software version numbers (e.g. "1.7.1" or "1.2b").
 *
 * This function was born in http://stackoverflow.com/a/6832721.
 *
 * @param {string} v1 The first version to be compared.
 * @param {string} v2 The second version to be compared.
 * @param {object} [options] Optional flags that affect comparison behavior:
 * <ul>
 *     <li>
 *         <tt>lexicographical: true</tt> compares each part of the version strings lexicographically instead of
 *         naturally; this allows suffixes such as "b" or "dev" but will cause "1.10" to be considered smaller than
 *         "1.2".
 *     </li>
 *     <li>
 *         <tt>zeroExtend: true</tt> changes the result if one version string has less parts than the other. In
 *         this case the shorter string will be padded with "zero" parts instead of being considered smaller.
 *     </li>
 * </ul>
 * @returns {number|NaN}
 * <ul>
 *    <li>0 if the versions are equal</li>
 *    <li>a negative integer iff v1 < v2</li>
 *    <li>a positive integer iff v1 > v2</li>
 *    <li>NaN if either version string is in the wrong format</li>
 * </ul>
 *
 * @copyright by Jon Papaioannou (["john", "papaioannou"].join(".") + "@gmail.com")
 * @license This function is in the public domain. Do what you want with it, no strings attached.
 */
function versionCompare(v1, v2, options) {
    var lexicographical = options && options.lexicographical,
        zeroExtend = options && options.zeroExtend,
        v1parts = v1.split('.'),
        v2parts = v2.split('.');

    function isValidPart(x) {
        return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
        return NaN;
    }

    if (zeroExtend) {
        while (v1parts.length < v2parts.length) v1parts.push("0");
        while (v2parts.length < v1parts.length) v2parts.push("0");
    }

    if (!lexicographical) {
        v1parts = v1parts.map(Number);
        v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length == i) {
            return 1;
        }

        if (v1parts[i] == v2parts[i]) {
            continue;
        } else if (v1parts[i] > v2parts[i]) {
            return 1;
        } else {
            return -1;
        }
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    return 0;
}

/*
exported SHADOW_VALUES,
         dealWithRejection,
         informAndDisable,
         CTX_ITM_POS,
         P,
         Settings,
         injectToFunction,
         removeInjection,
         versionCompare
*/
