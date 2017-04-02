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
const Meta = imports.gi.Meta;
const Cinnamon = imports.gi.Cinnamon;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const FileUtils = imports.misc.fileUtils;
const DND = imports.ui.dnd;

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
    last: 0,
    bfr_about: 3,
    bfr_conf: 2,
    bfr_rem: 1

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
    WINDOW_AUTO_MOVE_TWEAKS_ENABLED: "window-auto-move-tweaks-enabled",
    WINDOW_AUTO_MOVE_APPLICATION_LIST: "window-auto-move-application-list",
    MAXIMUS_ENABLE_TWEAK: "maximus-enable-tweak",
    MAXIMUS_UNDECORATE_HALF_MAXIMIZED: "maximus-undecorate-half-maximized",
    MAXIMUS_UNDECORATE_TILED: "maximus-undecorate-tiled",
    MAXIMUS_IS_BLACKLIST: "maximus-is-blacklist",
    MAXIMUS_APP_LIST: "maximus-app-list",
    MAXIMUS_ENABLE_LOGGING: "maximus-enable-logging",
    MAXIMUS_APPLY_SETTINGS: "maximus-apply-settings",
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
        _("Tweak activation aborted!!!") + "\n" +
        _("Your Cinnamon version may not be compatible!!!"));
}

function informAndDisable() {
    try {
        let msg = [
            _("Extension activation aborted!!!"),
            _("Your Cinnamon version may not be compatible!!!"),
            _("Minimum Cinnamon version allowed: 2.8.6")
        ];
        global.logError(msg);
        Main.criticalNotify(_(ExtensionMeta.name), msg.join("\n"));
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

const CT_NemoDesktopAreaClass = new Lang.Class({
    Name: "CT_NemoDesktopAreaClass",

    _init: function() {
        this.actor = global.stage;
        if (!this.actor.hasOwnProperty("_delegate"))
            this.actor._delegate = this;
    },

    acceptDrop: function(source, actor, x, y, time) { // jshint ignore:line
        let app = source.app;

        if (app === null || app.is_window_backed())
            return false;

        let backgroundActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (backgroundActor != global.window_group)
            return false;

        let file = Gio.file_new_for_path(app.get_app_info().get_filename());
        let fPath = FileUtils.getUserDesktopDir() + "/" + app.get_id();
        let destFile = Gio.file_new_for_path(fPath);

        try {
            file.copy(destFile, 0, null, function() {});
            if (FileUtils.hasOwnProperty("changeModeGFile"))
                FileUtils.changeModeGFile(destFile, 755);
            else
                Util.spawnCommandLine('chmod +x "' + fPath + '"');
        } catch (aErr) {
            global.log(aErr);
            return false;
        }

        return true;
    },

    handleDragOver: function(source, actor, x, y, time) { // jshint ignore:line
        let app = source.app;

        if (app === null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        let backgroundActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (backgroundActor != global.window_group)
            return DND.DragMotionResult.NO_DROP;

        return DND.DragMotionResult.COPY_DROP;
    }
});

function CT_MyCheckWorkspaces() {
    if (!this.dynamicWorkspaces)
        return false;

    let emptyWorkspaces = new Array(this._workspaces.length);

    let a = 0,
        aLen = this._workspaces.length;
    for (; a < aLen; a++) {
        let lastRemoved = this._workspaces[a]._lastRemovedWindow;
        if ((lastRemoved &&
                (lastRemoved.get_window_type() == Meta.WindowType.SPLASHSCREEN ||
                    lastRemoved.get_window_type() == Meta.WindowType.DIALOG ||
                    lastRemoved.get_window_type() == Meta.WindowType.MODAL_DIALOG)) ||
            this._workspaces[a]._keepAliveId)
            emptyWorkspaces[a] = false;
        else
            emptyWorkspaces[a] = true;
    }

    let sequences = Cinnamon.WindowTracker.get_default().get_startup_sequences();
    let b = 0,
        bLen = sequences.length;
    for (; b < bLen; b++) {
        let index = sequences[b].get_workspace();
        if (index >= 0 && index <= global.screen.n_workspaces)
            emptyWorkspaces[index] = false;
    }

    let windows = global.get_window_actors();
    let c = 0,
        cLen = windows.length;
    for (; c < cLen; c++) {
        let winActor = windows[c];
        let win = winActor.meta_window;
        if (win.is_on_all_workspaces())
            continue;

        let workspaceIndex = win.get_workspace().index();
        emptyWorkspaces[workspaceIndex] = false;
    }

    // If we don't have an empty workspace at the end, add one
    if (!emptyWorkspaces[emptyWorkspaces.length - 1]) {
        global.screen.append_new_workspace(false, global.get_current_time());
        emptyWorkspaces.push(false);
    }

    let activeWorkspaceIndex = global.screen.get_active_workspace_index();
    let removingCurrentWorkspace = (emptyWorkspaces[activeWorkspaceIndex] &&
        activeWorkspaceIndex < emptyWorkspaces.length - 1);

    emptyWorkspaces[activeWorkspaceIndex] = false;

    if (removingCurrentWorkspace) {
        // "Merge" the empty workspace we are removing with the one at the end
        this.wm.blockAnimations();
    }

    // Delete other empty workspaces; do it from the end to avoid index changes
    let i;
    for (i = emptyWorkspaces.length - 2; i >= 0; i--) {
        if (emptyWorkspaces[i])
            global.screen.remove_workspace(this._workspaces[i], global.get_current_time());
        else
            break;
    }

    if (removingCurrentWorkspace) {
        global.screen.get_workspace_by_index(global.screen.n_workspaces - 1).activate(global.get_current_time());
        this.wm.unblockAnimations();
    }

    this._checkWorkspacesId = 0;
    return false;
}

const CT_WindowMoverClass = new Lang.Class({
    Name: "CT_WindowMoverClass",

    _init: function() {
        this._settings = Settings;
        this._windowTracker = Cinnamon.WindowTracker.get_default();

        let display = global.screen.get_display();
        // Connect after so the handler from CinnamonWindowTracker has already run
        this._windowCreatedId = display.connect_after("window-created",
            Lang.bind(this, this._findAndMove));
    },

    destroy: function() {
        if (this._windowCreatedId) {
            global.screen.get_display().disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }
    },

    _ensureAtLeastWorkspaces: function(num, window) {
        for (let j = global.screen.n_workspaces; j <= num; j++) {
            window.change_workspace_by_index(j - 1, false);
            global.screen.append_new_workspace(false, 0);
        }
    },

    _findAndMove: function(display, window, noRecurse) {
        if (window.skip_taskbar)
            return;

        let spaces = this._settings.get_strv(P.WINDOW_AUTO_MOVE_APPLICATION_LIST);

        let app = this._windowTracker.get_window_app(window);
        if (!app) {
            if (!noRecurse) {
                // window is not tracked yet
                Mainloop.idle_add(function() {
                    this._findAndMove(display, window, true);
                    return false;
                });
            } else {
                // It's just freaking annoying!!!
                // global.logWarning(_("Cannot find application for window"));
            }
            return;
        }

        let app_id = app.get_id();
        let j = 0,
            jLen = spaces.length;
        for (; j < jLen; j++) {
            let apps_to_space = spaces[j].split(":");
            // Match application id
            if (apps_to_space[0] == app_id) {
                let workspace_num = parseInt(apps_to_space[1]) - 1;

                if (workspace_num >= global.screen.n_workspaces)
                    this._ensureAtLeastWorkspaces(workspace_num, window);

                window.change_workspace_by_index(workspace_num, false, global.get_current_time());
            }
        }
    }
});

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

const CT_MaximusNGClass = new Lang.Class({
    Name: "CT_MaximusNGClass",

    maxID: 0,
    minID: 0,
    tileID: 0,
    changeWorkspaceID: 0,
    grabID: 0,
    workspaces: [],
    oldFullscreenPref: null,
    onetime: 0,
    app_list: [],
    is_blacklist: false,

    /* This is not used but is kept in case that Cinnamon's developers regain their senses
     * and re-add a feature to muffin that should have never been removed in the first place.
     */
    use_set_hide_titlebar: false,

    _init: function() {
        this._settings = Settings;
        Meta.MaximizeFlags.BOTH = (Meta.MaximizeFlags.VERTICAL | Meta.MaximizeFlags.HORIZONTAL);
    },

    log: function(message) {
        if (this._settings.get_boolean(P.MAXIMUS_ENABLE_LOGGING))
            global.log("[" + _(ExtensionMeta.name) + "][Maximus] " + message);
    },

    /**
     * Guesses the X ID of a window.
     *
     * It is often in the window's title, being `"0x%x %10s".format(XID, window.title)`.
     * (See `mutter/src/core/window-props.c`).
     *
     * If we couldn't find it there, we use `win`'s actor, `win.get_compositor_private()`.
     * The actor's `x-window` property is the X ID of the window *actor*'s frame
     * (as opposed to the window itself).
     *
     * However, the child window of the window actor is the window itself, so by
     * using `xwininfo -children -id [actor's XID]` we can attempt to deduce the
     * window's X ID.
     *
     * It is not always foolproof, but works good enough for now.
     *
     * @param {Meta.Window} win - the window to guess the XID of. You wil get better
     * success if the window's actor (`win.get_compositor_private()`) exists.
     */
    guessWindowXID: function(win) {
        let id = null;
        /* If window title has non-utf8 characters, get_description() complains
         * "Failed to convert UTF-8 string to JS string: Invalid byte sequence in conversion input",
         * event though get_title() works.
         */
        try {
            id = win.get_description().match(/0x[0-9a-f]+/);

            if (id) {
                id = id[0];
                return id;
            }
        } catch (err) {}

        // Use xwininfo, take first child.
        let act = win.get_compositor_private();

        if (act) {
            id = GLib.spawn_command_line_sync("xwininfo -children -id 0x%x".format(act["x-window"]));
            if (id[0]) {
                let str = id[1].toString();

                /* The X ID of the window is the one preceding the target window's title.
                 * This is to handle cases where the window has no frame and so
                 * act['x-window'] is actually the X ID we want, not the child.
                 */
                let regexp = new RegExp('(0x[0-9a-f]+) +"%s"'.format(win.title));
                id = str.match(regexp);

                if (id)
                    return id[1];

                // Otherwise, just grab the child and hope for the best
                id = str.split(/child(?:ren)?:/)[1].match(/0x[0-9a-f]+/);

                if (id)
                    return id[0];
            }
        }
        this.log("Could not find XID for window with title %s".format(win.title));
        return null;
    },

    /**
     * Undecorates a window.
     *
     * If I use set_decorations(0) from within the GNOME shell extension (i.e.
     *  from within the compositor process), the window dies.
     * If I use the same code but use `gjs` to run it, the window undecorates
     *  properly.
     *
     * Hence I have to make some sort of external call to do the undecoration.
     * I could use 'gjs' on a javascript file (and I'm pretty sure this is installed
     *  with GNOME-shell too), but I decided to use a system call to xprop and set
     *  the window's `_MOTIF_WM_HINTS` property to ask for undecoration.
     *
     * We can use xprop using the window's title to identify the window, but
     *  prefer to use the window's X ID (in case the title changes, or there are
     *  multiple windows with the same title).
     *
     * The Meta.Window object does *not* have a way to access a window's XID.
     * However, the window's description seems to have it.
     * Alternatively, a window's actor's 'x-window' property returns the XID
     *  of the window *frame*, and so if we parse `xwininfo -children -id [frame_id]`
     *  we can extract the child XID being the one we want.
     *
     * See here for xprop usage for undecoration:
     * http://xrunhprof.wordpress.com/2009/04/13/removing-decorations-in-metacity/
     *
     * @param {Meta.Window} win - window to undecorate.
     */
    undecorate: function(win) {
        let id = this.guessWindowXID(win);
        // Undecorate with xprop
        let cmd = ["xprop", "-id", id,
            "-f", "_MOTIF_WM_HINTS", "32c",
            "-set", "_MOTIF_WM_HINTS",
            "0x2, 0x0, 0x0, 0x0, 0x0"
        ];

        /* _MOTIF_WM_HINTS: see MwmUtil.h from OpenMotif source (cvs.openmotif.org),
         *  or rudimentary documentation here:
         * http://odl.sysworks.biz/disk$cddoc04sep11/decw$book/d3b0aa63.p264.decw$book
         *
         * Struct { flags, functions, decorations, input_mode, status }.
         * Flags: what the hints are for. (functions, decorations, input mode and/or status).
         * Functions: minimize, maximize, close, ...
         * Decorations: title, border, all, none, ...
         * Input Mode: modeless, application modal, system model, ..
         * Status: tearoff window.
         */

        // Fallback: if couldn't get id for some reason, use the window's name
        if (!id) {
            cmd[1] = "-name";
            cmd[2] = win.get_title();
        }

        this.log(cmd.join(" "));
        Util.spawn(cmd);
        /* #25: when undecorating a Qt app (texmaker, keepassx) somehow focus is lost.
         * However, is there a use case where this would happen legitimately?
         * For some reaons the Qt apps seem to take a while to be refocused.
         */
        Meta.later_add(Meta.LaterType.IDLE, function() {
            if (win.focus) {
                win.focus(global.get_current_time());
            } else {
                win.activate(global.get_current_time());
            }
        });
    },

    /**
     * Decorates a window by setting its `_MOTIF_WM_HINTS` property to ask for
     * decoration.
     *
     * @param {Meta.Window} win - window to undecorate.
     */
    decorate: function(win) {
        let id = this.guessWindowXID(win);
        // Decorate with xprop: 1 == DECOR_ALL
        let cmd = ["xprop", "-id", id,
            "-f", "_MOTIF_WM_HINTS", "32c",
            "-set", "_MOTIF_WM_HINTS",
            "0x2, 0x0, 0x1, 0x0, 0x0"
        ];

        // Fallback: if couldn't get id for some reason, use the window's name
        if (!id) {
            cmd[1] = "-name";
            cmd[2] = win.get_title();
        }

        this.log(cmd.join(" "));
        Util.spawn(cmd);

        /* #25: when undecorating a Qt app (texmaker, keepassx) somehow focus is lost.
         * However, is there a use case where this would happen legitimately?
         * For some reaons the Qt apps seem to take a while to be refocused.
         */
        Meta.later_add(Meta.LaterType.IDLE, function() {
            if (win.focus) {
                win.focus(global.get_current_time());
            } else {
                win.activate(global.get_current_time());
            }
        });
    },

    /**
     * Tells the window manager to hide the titlebar on maximised windows.
     * TODO: GNOME 3.2?
     *
     * Note - no checking of blacklists etc is done in the function. You should do
     * it prior to calling the function (same with {@link decorate} and {@link undecorate}).
     *
     * Does this by setting the _GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED hint - means
     * I can do it once and forget about it, rather than tracking maximize/unmaximize
     * events.
     *
     * **Caveat**: doesn't work with Ubuntu's Ambiance and Radiance window themes -
     * my guess is they don't respect or implement this property.
     *
     * @param {Meta.Window} win - window to set the HIDE_TITLEBAR_WHEN_MAXIMIZED property of.
     * @param {boolean} hide - whether to hide the titlebar or not.
     * @param {boolean} [stopAdding] - if `win` does not have an actor and we couldn't
     * find the window's XID, we try one more time to detect the XID, unless this
     * is `true`. Internal use.
     */
    setHideTitlebar: function(win, hide, stopAdding) {
        this.log("setHideTitlebar: " + win.get_title() + ": " + hide + (stopAdding ? " (2)" : ""));
        let id = this.guessWindowXID(win);

        /* Newly-created windows are added to the workspace before
         * the compositor knows about them: get_compositor_private() is null.
         * Additionally things like .get_maximized() aren't properly done yet.
         * (see workspace.js _doAddWindow)
         */
        let self = this;
        if (!id && !win.get_compositor_private() && !stopAdding) {
            Mainloop.idle_add(function() {
                self.setHideTitlebar(null, win, true);
                return false;
            });
            return;
        }

        /* Undecorate with xprop. Use _GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED.
         * See (eg) mutter/src/window-props.c
         */
        let cmd = ["xprop", "-id", id,
            "-f", "_GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED", "32c",
            "-set", "_GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED",
            (hide ? "0x1" : "0x0")
        ];

        // Fallback: if couldn't get id for some reason, use the window's name
        if (!id) {
            cmd[1] = "-name";
            cmd[2] = win.get_title();
        }

        this.log(cmd.join(" "));
        Util.spawn(cmd);
    },

    /**
     * Returns whether we should affect `win`'s decoration at all.
     *
     * If the window was originally undecorated we do not do anything with it
     *  (decorate or undecorate),
     *
     * Also if it's in the blacklist, or if it's NOT in the whitelist, we don't
     * do anything with it.
     *
     * @returns {boolean} whether the window is originally decorated and not in
     * the blacklist (or in the whitelist).
     */
    shouldAffect: function(win) {
        if (!win._maximusDecoratedOriginal)
            return false;

        let app = Cinnamon.WindowTracker.get_default().get_window_app(win);
        let appid = (app ? app.get_id() : -1);
        let inList = this.app_list.length > 0 && this.app_list.indexOf(appid) >= 0;

        return !((this.is_blacklist && inList) || (!this.is_blacklist && !inList));
    },

    /**
     * Checks if `win` should be undecorated, based *purely* off its maximised
     * state (doesn't incorporate blacklist).
     *
     * If it's fully-maximized or half-maximised and undecorateHalfMaximised is true,
     * this returns true.
     *
     * Use with `shouldAffect` to get a full check..
     */
    shouldBeUndecorated: function(win) {
        let max = win.get_maximized();
        return (max === Meta.MaximizeFlags.BOTH ||
            (this._settings.get_boolean(P.MAXIMUS_UNDECORATE_HALF_MAXIMIZED) && max > 0));
    },

    /**
     * Checks if `win` is fully maximised, or half-maximised + undecorateHalfMaximised.
     * If so, undecorates the window.
     */
    possiblyUndecorate: function(win) {
        if (this.shouldBeUndecorated(win)) {
            if (!win.get_compositor_private()) {
                let self = this;
                Mainloop.idle_add(function() {
                    self.undecorate(win);
                    return false;
                });
            } else {
                this.undecorate(win);
            }
        }
    },

    /**
     * Checks if `win` is fully maximised, or half-maximised + undecorateHalfMaximised.
     * If *NOT*, redecorates the window.
     */
    possiblyRedecorate: function(win) {
        if (!this.shouldBeUndecorated(win)) {
            if (!win.get_compositor_private()) {
                let self = this;
                Mainloop.idle_add(function() {
                    self.decorate(win);
                    return false;
                });
            } else {
                this.decorate(win);
            }
        }
    },

    /**
     * Called when a window is maximized, including half-maximization.
     *
     * If the window is not in the blacklist (or is in the whitelist), we undecorate
     * it.
     *
     * @param {Meta.WindowActor} actor - the window actor for the maximized window.
     * It is expected to be maximized (in at least one direction) already - we will
     * not check before undecorating.
     */
    onMaximise: function(shellwm, actor) {
        if (!actor)
            return;

        let win = actor.get_meta_window();

        if (!this.shouldAffect(win))
            return;

        let max = win.get_maximized();
        this.log("onMaximise: " + win.get_title() + " [" + win.get_wm_class() + "]");

        /* If this is a partial maximization, and we do not wish to undecorate
         * half-maximized or tiled windows, make sure the window is decorated.
         */
        if (max !== Meta.MaximizeFlags.BOTH &&
            ((!this._settings.get_boolean(P.MAXIMUS_UNDECORATE_HALF_MAXIMIZED) && win.tile_type === 0) ||
                (!this._settings.get_boolean(P.MAXIMUS_UNDECORATE_TILED) && win.tile_type > 0))) {
            this.decorate(win);
            return;
        }

        this.undecorate(win);
    },

    /**
     * Called when a window is unmaximized.
     *
     * If the window is not in the blacklist (or is in the whitelist), we decorate
     * it.
     *
     * @param {Meta.WindowActor} actor - the window actor for the unmaximized window.
     * It is expected to be unmaximized - we will not check before decorating.
     */
    onUnmaximise: function(shellwm, actor) {
        if (!actor)
            return;

        let win = actor.meta_window;

        if (!this.shouldAffect(win))
            return;

        this.log("onUnmaximise: " + win.get_title());

        /* If the user is unmaximizing by dragging, we wait to decorate until they
         * have dropped the window, so that we don't force the user to drop
         * the window prematurely with the redecorate (which stops the grab).
         *
         * This is only necessary if USE_SET_HIDE_TITLEBAR is `false` (otherwise
         * this is not an issue).
         */
        if (!this.use_set_hide_titlebar && global.display.get_grab_op() === Meta.GrabOp.MOVING) {
            if (this.grabID > 0) {
                global.display.disconnect(this.grabID);
                this.grabID = 0;
            }

            this.grabID = global.display.connect("grab-op-end", Lang.bind(this, function() {
                this.possiblyRedecorate(win);
                global.display.disconnect(this.grabID);
                this.grabID = 0;
            }));
        } else {
            this.decorate(win);
        }
    },

    /**
     * Callback for a window's 'notify::maximized-horizontally' and
     * 'notify::maximized-vertically' signals.
     *
     * If the window is half-maximised we force it to show its titlebar.
     * Otherwise we set it to hide if it is maximized.
     *
     * Only used if using the SET_HIDE_TITLEBAR method AND we wish half-maximized
     * windows to be *decorated* (the GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED atom will
     * hide the titlebar of half-maximized windows too).
     *
     * @param {Meta.Window} win - the window whose maximized-horizontally or
     * maximized-vertically properties has changed.
     *
     * @see onWindowAdded
     */
    onWindowChangesMaximiseState: function(win) {
        if ((win.maximized_horizontally && !win.maximized_vertically) ||
            (!win.maximized_horizontally && win.maximized_vertically)) {
            this.setHideTitlebar(win, false);
            this.decorate(win);
        } else {
            this.setHideTitlebar(win, true);
        }
    },

    /**
     * Callback when a window is added in any of the workspaces.
     * This includes a window switching to another workspace.
     *
     * If it is a window we already know about, we do nothing.
     *
     * Otherwise, we:
     *
     * * record the window as on we know about.
     * * store whether the window was initially decorated (e.g. Chrome windows aren't usually).
     * * if using the SET_HIDE_TITLEBAR method, we:
     *  + set the GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED atom on the window.
     *  + if we wish to keep half-maximised windows decorated, we connect up some signals
     *    to ensure that half-maximised windows remain decorated (the GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED
     *    atom will automatically undecorated half-maximised windows).
     *    See {@link onWindowChangesMaximiseState}.
     * * otherwise (not using SET_HIDE_TITLEBAR):
     *  + if the window is maximized, we undecorate it (see {@link undecorate});
     *  + if the window is half-maximized and we wish to undecorate half-maximised
     *    windows, we also undecorate it.
     *
     * @param {Meta.Window} win - the window that was added.
     *
     * @see undecorate
     */
    onWindowAdded: function(ws, win) {
        if (win._maximusDecoratedOriginal)
            return;

        /* Newly-created windows are added to the workspace before
         * the compositor knows about them: get_compositor_private() is null.
         * Additionally things like .get_maximized() aren't properly done yet.
         * (see workspace.js _doAddWindow)
         */
        win._maximusDecoratedOriginal = Boolean(win.decorated);
        this.log("onWindowAdded: " + win.get_title() + " initially decorated? " +
            win._maximusDecoratedOriginal);

        if (!this.shouldAffect(win))
            return;

        // With set_hide_titlebar, set the window hint when the window is added and
        // there is no further need to listen to maximize/unmaximize on the window.
        if (this.use_set_hide_titlebar) {
            this.setHideTitlebar(win, true);
            if (this.shouldBeUndecorated(win)) {
                win.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
                Mainloop.idle_add(function() {
                    win.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
                    return false;
                });
            }

            if (!this._settings.get_boolean(P.MAXIMUS_UNDECORATE_HALF_MAXIMIZED)) {
                win._maxHStateId = win.connect("notify::maximized-horizontally",
                    Lang.bind(this, this.onWindowChangesMaximiseState));
                win._maxVStateId = win.connect("notify::maximized-vertically",
                    Lang.bind(this, this.onWindowChangesMaximiseState));

                if (win.get_maximized())
                    this.onWindowChangesMaximiseState(win);
            }
        } else {
            // If it is added initially maximized, we undecorate it.
            this.possiblyUndecorate(win);
        }
    },

    /**
     * Callback whenever the number of workspaces changes.
     *
     * We ensure that we are listening to the 'window-added' signal on each of
     * the workspaces.
     *
     * @see onWindowAdded
     */
    onChangeNWorkspaces: function() {
        let ws;
        let i = this.workspaces.length;

        if (i > 0) {
            while (i--) {
                if (this.workspaces[i]._MaximusWindowAddedId)
                    this.workspaces[i].disconnect(this.workspaces[i]._MaximusWindowAddedId);
            }
        }

        this.workspaces = [];
        i = global.screen.n_workspaces;

        while (i--) {
            ws = global.screen.get_workspace_by_index(i);
            this.workspaces.push(ws);
            /* we need to add a Mainloop.idle_add, or else in onWindowAdded the
             * window's maximized state is not correct yet.
             */
            ws._MaximusWindowAddedId = ws.connect("window-added", Lang.bind(this, function(ws, win) {
                let self = this;
                Mainloop.idle_add(function() {
                    self.onWindowAdded(ws, win);
                    return false;
                });
            }));
        }
    },

    // Start listening to events and undecorate already-existing windows.
    startUndecorating: function() {
        this.is_blacklist = this._settings.get_boolean(P.MAXIMUS_IS_BLACKLIST);
        this.app_list = this._settings.get_strv(P.MAXIMUS_APP_LIST);

        // Connect events
        this.changeWorkspaceID = global.screen.connect("notify::n-workspaces",
            Lang.bind(this, this.onChangeNWorkspaces));

        // If we are not using the set_hide_titlebar hint, we must listen to maximize and unmaximize events.
        if (!this.use_set_hide_titlebar) {
            this.maxID = global.window_manager.connect("maximize",
                Lang.bind(this, this.onMaximise));
            this.minID = global.window_manager.connect("unmaximize",
                Lang.bind(this, this.onUnmaximise));

            if (this._settings.get_boolean(P.MAXIMUS_UNDECORATE_TILED))
                this.tileID = global.window_manager.connect("tile",
                    Lang.bind(this, this.onMaximise));

            /* This is needed to prevent Metacity from interpreting an attempted drag
             * of an undecorated window as a fullscreen request. Otherwise thunderbird
             * (in particular) has no way to get out of fullscreen, resulting in the user
             * being stuck there.
             * See issue #6
             * https://bitbucket.org/mathematicalcoffee/maximus-gnome-shell-extension/issue/6
             *
             * Once we can properly set the window's hide_titlebar_when_maximized property
             * this will no loner be necessary.
             */
            this.oldFullscreenPref = Meta.prefs_get_force_fullscreen();
            Meta.prefs_set_force_fullscreen(false);
        }

        /* Odyseus note.
         *
         * Use of self = this instead of Lang.bind(this, function) on functions
         * that have a return value.
         */
        let self = this;
        /* Go through already-maximised windows & undecorate.
         * This needs a delay as the window list is not yet loaded
         *  when the extension is loaded.
         * Also, connect up the 'window-added' event.
         * Note that we do not connect this before the onMaximise loop
         *  because when one restarts the gnome-shell, window-added gets
         *  fired for every currently-existing window, and then
         *  these windows will have onMaximise called twice on them.
         */
        this.onetime = Mainloop.idle_add(function() {
            let winList = global.get_window_actors().map(function(w) {
                return w.meta_window;
            });
            let i = winList.length;

            while (i--) {
                let win = winList[i];
                if (win.window_type === Meta.WindowType.DESKTOP) {
                    continue;
                }
                self.onWindowAdded(null, win);
            }

            self.onChangeNWorkspaces();
            return false;
        });
    },

    stopUndecorating: function() {
        if (this.maxID > 0)
            global.window_manager.disconnect(this.maxID);

        if (this.minID > 0)
            global.window_manager.disconnect(this.minID);

        if (this.tileID > 0)
            global.window_manager.disconnect(this.tileID);

        if (this.changeWorkspaceID > 0)
            global.window_manager.disconnect(this.changeWorkspaceID);

        if (this.grabID > 0)
            global.display.disconnect(this.grabID);

        this.maxID = 0;
        this.minID = 0;
        this.tileID = 0;
        this.changeWorkspaceID = 0;
        this.grabID = 0;
        let a = this.workspaces.length;

        if (a > 0) {
            while (a--) {
                if (this.workspaces[a]._MaximusWindowAddedId) {
                    this.workspaces[a].disconnect(this.workspaces[a]._MaximusWindowAddedId);
                    delete this.workspaces[a]._MaximusWindowAddedId;
                }
            }
        }

        this.workspaces = [];

        if (this.onetime > 0) {
            Mainloop.source_remove(this.onetime);
            this.onetime = 0;
        }

        let winList = global.get_window_actors().map(function(w) {
            return w.meta_window;
        });
        let b = winList.length;

        if (b > 0) {
            while (b--) {
                let win = winList[b];

                if (win.window_type === Meta.WindowType.DESKTOP)
                    continue;

                this.log("stopUndecorating: " + win.title);

                if (win._maximusDecoratedOriginal) {
                    if (this.use_set_hide_titlebar) {
                        this.setHideTitlebar(win, false);
                        if (win._maxHStateId) {
                            win.disconnect(win._maxHStateId);
                            delete win._maxHStateId;
                        }

                        if (win._maxVStateId) {
                            win.disconnect(win._maxVStateId);
                            delete win._maxVStateId;
                        }
                    }

                    this.decorate(win);
                }

                delete win._maximusDecoratedOriginal;
            }
        }

        if (this.oldFullscreenPref !== null) {
            Meta.prefs_set_force_fullscreen(this.oldFullscreenPref);
            this.oldFullscreenPref = null;
        }
    }
});

/*
exported SHADOW_VALUES,
         dealWithRejection,
         informAndDisable,
         CTX_ITM_POS,
         Settings,
         injectToFunction,
         removeInjection,
         versionCompare,
         CT_NemoDesktopAreaClass,
         CT_MyCheckWorkspaces,
         CT_WindowMoverClass,
         CT_MaximusNGClass
*/
