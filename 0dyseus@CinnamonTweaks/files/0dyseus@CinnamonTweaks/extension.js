const $ = imports.extension.__init__;
const Settings = $.Settings;
const ExtensionMeta = $.ExtensionMeta;
const _ = $._;

const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Applet = imports.ui.applet;
const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const Tooltips = imports.ui.tooltips;
const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Meta = imports.gi.Meta;

const CINNAMON_VERSION = GLib.getenv("CINNAMON_VERSION");

// Imported only when needed in an attempt to gain performance.
// Not that it's needed, but, the more tweaks I add, the more crap will I need to import.
let HotCornerPatched = null;
let AppletManager = null;
let DeskletManager = null;
let ShadowFactory = null;
let WorkspaceTracker = null;

let allowEnabling = false;

let CONNECTION_IDS = {
    settings_bindings: 0,
    DTD: 0, // CT_DropToDesktopPatch toggle ID.
    PPMM: 0, // CT_PopupMenuManagerPatch toggle ID.
    TTP: 0, // CT_TooltipsPatch toggle ID.
    HCP: 0, // CT_HotCornersPatch toggle ID. Mark for deletion on EOL.
    MTP: 0, // CT_MessageTrayPatch toggle ID.
    DMP: 0, // CT_DeskletManagerPatch toggle ID.
    AMP: 0, // CT_AppletManagerPatch toogle ID.
    WDAE: 0, // CT_WindowDemandsAttentionBehavior toogle ID.
    WDAE_EXEC: 0, // CT_WindowDemandsAttentionBehavior execution ID.
    WDAE_CONNECTION: 0, // CT_WindowDemandsAttentionBehavior connection ID.
    CWS: 0, // CT_CustomWindowShadows toggle ID.
    CWS_EXEC: 0, // CT_CustomWindowShadows execution ID.
    AMW: 0, // CT_AutoMoveWindows toggle ID.
    MAXNG: 0, // CT_MaximusNG toggle ID.
};

// Container for old attributes and functions for later restore.
let STG = {
    PPMM: {},
    TTP: {},
    HCP: {},
    MTP: {},
    AMP: {},
    DMP: {},
    AMW: {},
    MAXNG: {}
};

function bindSettings() {
    CONNECTION_IDS.settings_bindings = Settings.connect(
        "changed",
        Lang.bind(this, function(aObj, aPref) {
            switch (aPref) {
                case $.P.DESKTOP_TWEAKS_ENABLED:
                case $.P.DESKTOP_TWEAKS_ALLOW_DROP_TO_DESKTOP:
                    CT_DropToDesktopPatch.toggle();
                    break;
                case $.P.POPUP_MENU_MANAGER_TWEAKS_ENABLED:
                case $.P.POPUP_MENU_MANAGER_APPLETS_MENUS_BEHAVIOR:
                    CT_PopupMenuManagerPatch.toggle();
                    break;
                case $.P.APPLETS_TWEAKS_ENABLED:
                case $.P.APPLETS_ASK_CONFIRMATION_APPLET_REMOVAL:
                case $.P.APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT:
                case $.P.APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT:
                case $.P.APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT_PLACEMENT:
                case $.P.APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT_PLACEMENT:
                    try {
                        if (!AppletManager)
                            AppletManager = imports.ui.appletManager;
                    } finally {
                        CT_AppletManagerPatch.toggle();
                    }
                    break;
                case $.P.DESKLETS_TWEAKS_ENABLED:
                case $.P.DESKLETS_ASK_CONFIRMATION_DESKLET_REMOVAL:
                case $.P.DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT:
                case $.P.DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT:
                case $.P.DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT_PLACEMENT:
                case $.P.DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT_PLACEMENT:
                    try {
                        if (!DeskletManager)
                            DeskletManager = imports.ui.deskletManager;
                    } finally {
                        CT_DeskletManagerPatch.toggle();
                    }
                    break;
                case $.P.NOTIFICATIONS_ENABLE_TWEAKS:
                case $.P.NOTIFICATIONS_ENABLE_ANIMATION:
                case $.P.NOTIFICATIONS_POSITION:
                case $.P.NOTIFICATIONS_DISTANCE_FROM_PANEL:
                case $.P.NOTIFICATIONS_RIGHT_MARGIN:
                    CT_MessageTrayPatch.toggle();
                    break;
                case $.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE:
                case $.P.WIN_DEMANDS_ATTENTION_KEYBOARD_SHORTCUT:
                    CT_WindowDemandsAttentionBehavior.toggle();
                    break;
                case $.P.HOTCORNERS_TWEAKS_ENABLED:
                case $.P.HOTCORNERS_DELAY_TOP_LEFT:
                case $.P.HOTCORNERS_DELAY_TOP_RIGHT:
                case $.P.HOTCORNERS_DELAY_BOTTOM_LEFT:
                case $.P.HOTCORNERS_DELAY_BOTTOM_RIGHT:
                    try {
                        if (!HotCornerPatched)
                            HotCornerPatched = imports.extension.extra_modules.hotCornerPatched;
                    } finally {
                        CT_HotCornersPatch.toggle(); // Mark for deletion on EOL.
                    }
                    break;
                case $.P.TOOLTIPS_TWEAKS_ENABLED:
                case $.P.TOOLTIPS_ALIGNMENT: // Mark for deletion on EOL.
                case $.P.TOOLTIPS_DELAY:
                    CT_TooltipsPatch.toggle();
                    break;
                case $.P.WINDOW_SHADOWS_TWEAKS_ENABLED:
                case $.P.WINDOW_SHADOWS_PRESET:
                case $.P.WINDOW_SHADOWS_CUSTOM_PRESET:
                    try {
                        if (!ShadowFactory)
                            ShadowFactory = Meta.ShadowFactory.get_default();
                    } finally {
                        CT_CustomWindowShadows.toggle();
                    }
                    break;
                case $.P.WINDOW_AUTO_MOVE_TWEAKS_ENABLED:
                    // case $.P.WINDOW_AUTO_MOVE_APPLICATION_LIST:
                    try {
                        if (!WorkspaceTracker)
                            WorkspaceTracker = imports.extension.extra_modules.WorkspaceTracker;
                    } finally {
                        CT_AutoMoveWindows.toggle();
                    }
                    break;
                    // case $.P.MAXIMUS_ENABLE_TWEAK:
                    // case $.P.MAXIMUS_UNDECORATE_HALF_MAXIMIZED:
                    // case $.P.MAXIMUS_UNDECORATE_TILED:
                    // case $.P.MAXIMUS_IS_BLACKLIST:
                    // case $.P.MAXIMUS_APP_LIST:
                    // case $.P.MAXIMUS_ENABLE_LOGGING:
                    // The following is more of a dummy setting.
                    // I'm using it so I can trigger a JavaScript function from
                    // the Python code on the settings window.
                case $.P.MAXIMUS_APPLY_SETTINGS:
                    CT_MaximusNG.toggle();
                    break;
            }
        })
    );
}

function togglePatch(aPatch, aID, aEnabledPref) {
    try {
        aPatch.disable();
        if (CONNECTION_IDS[aID] > 0) {
            Mainloop.source_remove(CONNECTION_IDS[aID]);
            CONNECTION_IDS[aID] = 0;
        }

        if (!aEnabledPref)
            return;

        CONNECTION_IDS[aID] = Mainloop.timeout_add(1000, Lang.bind(aPatch, function() {
            aPatch.enable();
            CONNECTION_IDS[aID] = 0;
            return false;
        }));
    } catch (aErr) {
        global.logError(aErr);
    }
}

const CT_AppletManagerPatch = {
    enable: function() {
        if (Settings.get_boolean($.P.APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT) ||
            Settings.get_boolean($.P.APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT)) {
            STG.AMP.finalizeContextMenu = $.injectToFunction(Applet.Applet.prototype, "finalizeContextMenu", function() {
                let menuItems = this._applet_context_menu._getMenuItems();
                let itemsLength = menuItems.length;
                if (itemsLength > 0) {
                    let getPosition = Lang.bind(this, function(aPos) {
                        let pos;
                        switch (Number($.CTX_ITM_POS[aPos])) {
                            case 0: // Last place
                                pos = itemsLength;
                                break;
                            case 1: // Before "Remove..."
                                pos = menuItems.indexOf(this.context_menu_item_remove);
                                break;
                            case 2: // Before "Configure..."
                                if (menuItems.indexOf(this.context_menu_item_configure) !== -1)
                                    pos = menuItems.indexOf(this.context_menu_item_configure);
                                else
                                    pos = menuItems.indexOf(this.context_menu_item_remove);
                                break;
                            case 3: // Before "About..."
                                pos = menuItems.indexOf(this.context_menu_item_about);
                                break;
                        }
                        while (pos < 0) {
                            ++pos;
                        }
                        return pos;
                    });

                    if (Settings.get_boolean($.P.APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT) &&
                        !this.context_menu_item_custom_open_folder) {
                        let position = getPosition(Settings.get_string($.P.APPLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT_PLACEMENT));
                        this.context_menu_item_custom_open_folder = new PopupMenu.PopupIconMenuItem(
                            _("Open applet folder"),
                            "folder",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_open_folder.connect("activate",
                            Lang.bind(this, function() {
                                Util.spawnCommandLine("xdg-open " + this._meta["path"]);
                            }));
                        this._applet_context_menu.addMenuItem(
                            this.context_menu_item_custom_open_folder,
                            position
                        );
                    }

                    if (Settings.get_boolean($.P.APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT) &&
                        !this.context_menu_item_custom_edit_file) {
                        let position = getPosition(Settings.get_string($.P.APPLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT_PLACEMENT));
                        this.context_menu_item_custom_edit_file = new PopupMenu.PopupIconMenuItem(
                            _("Edit applet main file"),
                            "text-editor",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_edit_file.connect("activate",
                            Lang.bind(this, function() {
                                Util.spawnCommandLine("xdg-open " + this._meta["path"] + "/applet.js");
                            }));
                        this._applet_context_menu.addMenuItem(
                            this.context_menu_item_custom_edit_file,
                            position
                        );
                    }
                }
            });
        }

        if (Settings.get_boolean($.P.APPLETS_ASK_CONFIRMATION_APPLET_REMOVAL)) {
            let am = AppletManager;
            // Extracted from /usr/share/cinnamon/js/ui/appletManager.js
            // Patch Appletmanager._removeAppletFromPanel to ask for confirmation on applet removal.
            STG.AMP._removeAppletFromPanel = am._removeAppletFromPanel;
            am._removeAppletFromPanel = function(uuid, applet_id) {
                let removeApplet = function() {
                    try {
                        let enabledApplets = am.enabledAppletDefinitions.raw;
                        for (let i = 0; i < enabledApplets.length; i++) {
                            let appletDefinition = am.getAppletDefinition(enabledApplets[i]);
                            if (appletDefinition) {
                                if (uuid == appletDefinition.uuid && applet_id == appletDefinition.applet_id) {
                                    let newEnabledApplets = enabledApplets.slice(0);
                                    newEnabledApplets.splice(i, 1);
                                    global.settings.set_strv("enabled-applets", newEnabledApplets);
                                    break;
                                }
                            }
                        }
                    } catch (aErr) {
                        global.logError(aErr.message);
                    }
                };
                let ctrlKey = Clutter.ModifierType.CONTROL_MASK & global.get_pointer()[2];

                if (ctrlKey)
                    removeApplet();
                else
                    new $.ConfirmationDialog(function() {
                            removeApplet();
                        },
                        "Applet removal",
                        _("Do you want to remove '%s' from your panel?\nInstance ID: %s")
                        .format(AppletManager.get_object_for_uuid(uuid, applet_id)._meta.name, applet_id)
                    ).open();
            };
        }
    },

    disable: function() {
        if (STG.AMP.finalizeContextMenu) {
            $.removeInjection(Applet.Applet.prototype, STG.AMP, "finalizeContextMenu");
        }

        if (STG.AMP._removeAppletFromPanel) {
            AppletManager._removeAppletFromPanel = STG.AMP._removeAppletFromPanel;
            delete STG.AMP._removeAppletFromPanel;
        }
    },

    toggle: function() {
        togglePatch(CT_AppletManagerPatch, "AMP", Settings.get_boolean($.P.APPLETS_TWEAKS_ENABLED));
    }
};

const CT_DeskletManagerPatch = {
    enable: function() {
        if (Settings.get_boolean($.P.DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT) ||
            Settings.get_boolean($.P.DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT)) {
            STG.DMP.finalizeContextMenu = $.injectToFunction(Desklet.Desklet.prototype, "finalizeContextMenu", function() {
                let menuItems = this._menu._getMenuItems();
                let itemsLength = menuItems.length;
                if (itemsLength > 0) {
                    let getPosition = Lang.bind(this, function(aPos) {
                        let pos;
                        switch (Number($.CTX_ITM_POS[aPos])) {
                            case 0: // Last place
                                pos = itemsLength;
                                break;
                            case 1: // Before "Remove..."
                                pos = menuItems.indexOf(this.context_menu_item_remove);
                                break;
                            case 2: // Before "Configure..."
                                if (menuItems.indexOf(this.context_menu_item_configure) !== -1)
                                    pos = menuItems.indexOf(this.context_menu_item_configure);
                                else
                                    pos = menuItems.indexOf(this.context_menu_item_remove);
                                break;
                            case 3: // Before "About..."
                                pos = menuItems.indexOf(this.context_menu_item_about);
                                break;
                        }
                        while (pos < 0) {
                            ++pos;
                        }
                        return pos;
                    });

                    if (Settings.get_boolean($.P.DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT) &&
                        !this.context_menu_item_custom_open_folder) {
                        let position = getPosition(Settings.get_string($.P.DESKLETS_ADD_OPEN_FOLDER_ITEM_TO_CONTEXT_PLACEMENT));
                        global.logError(position);
                        this.context_menu_item_custom_open_folder = new PopupMenu.PopupIconMenuItem(
                            _("Open desklet folder"),
                            "folder",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_open_folder.connect("activate", Lang.bind(this, function() {
                            Util.spawnCommandLine("xdg-open " + this._meta["path"]);
                        }));
                        this._menu.addMenuItem(
                            this.context_menu_item_custom_open_folder,
                            position
                        );
                    }

                    if (Settings.get_boolean($.P.DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT) &&
                        !this.context_menu_item_custom_edit_file) {
                        let position = getPosition(Settings.get_string($.P.DESKLETS_ADD_EDIT_FILE_ITEM_TO_CONTEXT_PLACEMENT));
                        this.context_menu_item_custom_edit_file = new PopupMenu.PopupIconMenuItem(
                            _("Edit desklet main file"),
                            "text-editor",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_edit_file.connect("activate", Lang.bind(this, function() {
                            Util.spawnCommandLine("xdg-open " + this._meta["path"] + "/desklet.js");
                        }));
                        this._menu.addMenuItem(
                            this.context_menu_item_custom_edit_file,
                            position
                        );
                    }
                }
            });
        }

        if (Settings.get_boolean($.P.DESKLETS_ASK_CONFIRMATION_DESKLET_REMOVAL)) {
            let dm = DeskletManager;

            // Extracted from /usr/share/cinnamon/js/ui/deskletManager.js
            // Patch DeskletManager.removeDesklet to ask for confirmation on desklet removal.
            STG.DMP.removeDesklet = dm.removeDesklet;
            dm.removeDesklet = function(uuid, desklet_id) {
                let ENABLED_DESKLETS_KEY = "enabled-desklets";
                let removeDesklet = function() {
                    try {
                        let list = global.settings.get_strv(ENABLED_DESKLETS_KEY);
                        for (let i = 0; i < list.length; i++) {
                            let definition = list[i];
                            let elements = definition.split(":");
                            if (uuid == elements[0] && desklet_id == elements[1])
                                list.splice(i, 1);
                        }
                        global.settings.set_strv(ENABLED_DESKLETS_KEY, list);
                    } catch (aErr) {
                        global.logError(aErr.message);
                    }
                };
                let ctrlKey = Clutter.ModifierType.CONTROL_MASK & global.get_pointer()[2];

                if (ctrlKey)
                    removeDesklet();
                else
                    new $.ConfirmationDialog(function() {
                            removeDesklet();
                        },
                        "Desklet removal",
                        _("Do you want to remove '%s' from your desktop?\nInstance ID: %s")
                        .format(DeskletManager.get_object_for_uuid(uuid, desklet_id)._meta.name, desklet_id)
                    ).open();
            };
        }
    },

    disable: function() {
        if (STG.DMP.finalizeContextMenu) {
            $.removeInjection(Desklet.Desklet.prototype, STG.DMP, "finalizeContextMenu");
        }

        if (STG.DMP.removeDesklet) {
            DeskletManager.removeDesklet = STG.DMP.removeDesklet;
            delete STG.DMP.removeDesklet;
        }
    },

    toggle: function() {
        togglePatch(CT_DeskletManagerPatch, "DMP", Settings.get_boolean($.P.DESKLETS_TWEAKS_ENABLED));
    }
};

const CT_MessageTrayPatch = {
    enable: function() {
        let mt = Main.messageTray;
        let position = Settings.get_string($.P.NOTIFICATIONS_POSITION) === "bottom"; // true = bottom, false = top
        let distanceFromPanel = Number(Settings.get_int($.P.NOTIFICATIONS_DISTANCE_FROM_PANEL));
        let ANIMATION_TIME = Settings.get_boolean($.P.NOTIFICATIONS_ENABLE_ANIMATION) ? 0.2 : 0.001;
        let State = {
            HIDDEN: 0,
            SHOWING: 1,
            SHOWN: 2,
            HIDING: 3
        };

        // Extracted from /usr/share/cinnamon/js/ui/messageTray.js
        // Patch _hideNotification to allow correct animation.
        STG.MTP._hideNotification = mt._hideNotification;
        mt._hideNotification = function() {
            this._focusGrabber.ungrabFocus();
            if (this._notificationExpandedId) {
                this._notification.disconnect(this._notificationExpandedId);
                this._notificationExpandedId = 0;
            }

            this._tween(this._notificationBin, "_notificationState", State.HIDDEN, {
                y: (position ?
                    Main.layoutManager.primaryMonitor.height :
                    Main.layoutManager.primaryMonitor.y),
                opacity: 0,
                time: ANIMATION_TIME,
                transition: "easeOutQuad",
                onComplete: this._hideNotificationCompleted,
                onCompleteScope: this
            });
        };

        // Patch _showNotification to allow correct animation and custom right margin.
        STG.MTP._showNotification = mt._showNotification;
        mt._showNotification = function() {
            this._notificationTimeoutId = 1;
            this._notification = this._notificationQueue.shift();

            if (this._notification.actor._parent_container) {
                this._notification.collapseCompleted();
                this._notification.actor._parent_container.remove_actor(this._notification.actor);
            }

            this._notificationClickedId = this._notification.connect("done-displaying",
                Lang.bind(this, this._escapeTray));
            this._notificationBin.child = this._notification.actor;
            this._notificationBin.opacity = 0;

            let monitor = Main.layoutManager.primaryMonitor;
            let panel = Main.panelManager.getPanel(0, position); // If Cinnamon 3.0.7 stable and older

            if (!panel)
                panel = Main.panelManager.getPanel(0, Number(position ? 1 : 0)); // If Cinnamon 3.0.7 nightly and newer(?)

            let height = 5;

            if (panel)
                height += panel.actor.get_height();
            this._notificationBin.y = position ?
                monitor.height - height / 2 :
                monitor.y + height * 2;

            let margin = this._notification._table.get_theme_node().get_length("margin-from-right-edge-of-screen");

            if (Settings.get_int($.P.NOTIFICATIONS_RIGHT_MARGIN) !== 0)
                margin = Settings.get_int($.P.NOTIFICATIONS_RIGHT_MARGIN);
            this._notificationBin.x = monitor.x + monitor.width - this._notification._table.width - margin;
            Main.soundManager.play("notification");
            this._notificationBin.show();

            this._updateShowingNotification();

            let [x, y, mods] = global.get_pointer(); // jshint ignore:line
            this._showNotificationMouseX = x;
            this._showNotificationMouseY = y;
            this._lastSeenMouseY = y;
        };

        // Patch _onNotificationExpanded to allow correct showing animation and custom top/bottom margins.
        STG.MTP._onNotificationExpanded = mt._onNotificationExpanded;
        mt._onNotificationExpanded = function() {
            let expandedY = this._notification.actor.height - this._notificationBin.height;

            let monitor = Main.layoutManager.primaryMonitor;
            let panel = Main.panelManager.getPanel(0, position); // If Cinnamon 3.0.7 stable and older

            if (!panel)
                panel = Main.panelManager.getPanel(0, Number(position ? 1 : 0)); // If Cinnamon 3.0.7 nightly and newer(?)

            let height = 0;

            if (panel)
                height += panel.actor.get_height();

            let newY = position ?
                monitor.height - this._notificationBin.height - height - distanceFromPanel :
                monitor.y + height + distanceFromPanel;

            if (this._notificationBin.y < expandedY)
                this._notificationBin.y = expandedY;
            else if (this._notification.y != expandedY)
                this._tween(this._notificationBin, "_notificationState", State.SHOWN, {
                    y: newY,
                    time: ANIMATION_TIME,
                    transition: "easeOutQuad"
                });
        };
    },

    disable: function() {
        if (STG.MTP._hideNotification) {
            Main.messageTray._hideNotification = STG.MTP._hideNotification;
            delete STG.MTP._hideNotification;
        }

        if (STG.MTP._showNotification) {
            Main.messageTray._showNotification = STG.MTP._showNotification;
            delete STG.MTP._showNotification;
        }

        if (STG.MTP._onNotificationExpanded) {
            Main.messageTray._onNotificationExpanded = STG.MTP._onNotificationExpanded;
            delete STG.MTP._onNotificationExpanded;
        }
    },

    toggle: function() {
        togglePatch(CT_MessageTrayPatch, "MTP", Settings.get_boolean($.P.NOTIFICATIONS_ENABLE_TWEAKS));
    }
};

const WindowDemandsAttentionClass = new Lang.Class({
    Name: "WindowDemandsAttention",
    wdae_shortcut_id: "cinnamon-tweaks-window-demands-attention-shortcut",

    _init: function() {
        if (Settings.get_string($.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE) === "hotkey") {
            this._windows = [];
            CONNECTION_IDS.WDAE_CONNECTION = global.display.connect(
                "window-demands-attention",
                Lang.bind(this, this._on_window_demands_attention)
            );
        } else if (Settings.get_string($.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE) === "force") {
            this._tracker = Cinnamon.WindowTracker.get_default();
            this._handlerid = global.display.connect("window-demands-attention",
                Lang.bind(this, this._on_window_demands_attention));
        }
    },

    _on_window_demands_attention: function(aDisplay, aWin) {
        switch (Settings.get_string($.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE)) {
            case "hotkey":
                this._windows.push(aWin);
                break;
            case "force":
                Main.activateWindow(aWin);
                break;
        }
    },

    _activate_last_window: function() {
        if (this._windows.length === 0) {
            Main.notify("No windows in the queue.");
            return;
        }

        let last_window = this._windows.pop();
        Main.activateWindow(last_window);
    },

    _add_keybindings: function() {
        Main.keybindingManager.addHotKey(
            this.wdae_shortcut_id,
            Settings.get_strv($.P.WIN_DEMANDS_ATTENTION_KEYBOARD_SHORTCUT),
            Lang.bind(this, this._activate_last_window));
    },

    _remove_keybindings: function() {
        Main.keybindingManager.removeHotKey(this.wdae_shortcut_id);
    },

    enable: function() {
        if (Settings.get_string($.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE) === "hotkey")
            this._add_keybindings();
    },

    _destroy: function() {
        try {
            global.display.disconnect(this._handlerid);
        } catch (aErr) {}

        try {
            global.display.disconnect(CONNECTION_IDS.WDAE_CONNECTION);
        } catch (aErr) {}

        CONNECTION_IDS.WDAE_CONNECTION = 0;
        this._windows = null;
        this._remove_keybindings();
    }
});

const CT_WindowDemandsAttentionBehavior = {
    enable: function() {
        try {
            if (CONNECTION_IDS.WDAE_EXEC > 0)
                this.disable();
        } finally {
            CONNECTION_IDS.WDAE_EXEC = new WindowDemandsAttentionClass();
            CONNECTION_IDS.WDAE_EXEC.enable();
        }
    },

    disable: function() {
        if (CONNECTION_IDS.WDAE_EXEC > 0) {
            CONNECTION_IDS.WDAE_EXEC._destroy();
            CONNECTION_IDS.WDAE_EXEC = 0;
        }
    },

    toggle: function() {
        togglePatch(CT_WindowDemandsAttentionBehavior,
            "WDAE",
            Settings.get_string($.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE) !== "none");
    }
};

// Mark for deletion on EOL.
const CT_HotCornersPatch = {
    enable: function() {

        if (this.shouldEnable()) {
            STG.HCP = Main.layoutManager.hotCornerManager;
            delete Main.layoutManager.hotCornerManager;
            Main.layoutManager.hotCornerManager = new HotCornerPatched.HotCornerManager({
                0: Settings.get_int($.P.HOTCORNERS_DELAY_TOP_LEFT),
                1: Settings.get_int($.P.HOTCORNERS_DELAY_TOP_RIGHT),
                2: Settings.get_int($.P.HOTCORNERS_DELAY_BOTTOM_LEFT),
                3: Settings.get_int($.P.HOTCORNERS_DELAY_BOTTOM_RIGHT)
            });
            Main.layoutManager._updateHotCorners();
            global.settings.connect("changed::overview-corner", Lang.bind(this, this.toggle));
        } else {
            $.dealWithRejection(_("Hotcorners tweaks"));
        }
    },

    disable: function() {
        if (STG.HCP) {
            Main.layoutManager.hotCornerManager = STG.HCP;
            delete STG.HCP;
        }
    },

    toggle: function() {
        togglePatch(CT_HotCornersPatch, "HCP", Settings.get_boolean($.P.HOTCORNERS_TWEAKS_ENABLED));
    },

    shouldEnable: function() {
        return $.versionCompare(CINNAMON_VERSION, "3.0.7") <= 0;
    }
};

const CT_TooltipsPatch = {
    enable: function() {
        if (this.shouldEnable("delay")) {
            if (Settings.get_int($.P.TOOLTIPS_DELAY) !== 300) {
                if ($.versionCompare(CINNAMON_VERSION, "3.0.7") <= 0) {
                    STG.TTP._onMotionEvent = Tooltips.TooltipBase._onMotionEvent;
                    Tooltips.TooltipBase.prototype["_onMotionEvent"] = function(actor, event) {
                        if (this._showTimer) {
                            Mainloop.source_remove(this._showTimer);
                            this._showTimer = null;
                        }

                        if (!this.visible) {
                            this._showTimer = Mainloop.timeout_add(Settings.get_int($.P.TOOLTIPS_DELAY),
                                Lang.bind(this, this._onTimerComplete));
                            this.mousePosition = event.get_coords();
                        }
                    };
                } else if ($.versionCompare(CINNAMON_VERSION, "3.2.0") >= 0) {
                    STG.TTP._onMotionEvent = Tooltips.TooltipBase._onMotionEvent;
                    Tooltips.TooltipBase.prototype["_onMotionEvent"] = function(actor, event) {
                        if (this._showTimer) {
                            Mainloop.source_remove(this._showTimer);
                            this._showTimer = null;
                        }

                        if (this._hideTimer) {
                            Mainloop.source_remove(this._hideTimer);
                            this._hideTimer = null;
                        }

                        if (!this.visible) {
                            this._showTimer = Mainloop.timeout_add(Settings.get_int($.P.TOOLTIPS_DELAY),
                                Lang.bind(this, this._onShowTimerComplete));
                            this.mousePosition = event.get_coords();
                        } else {
                            this._hideTimer = Mainloop.timeout_add(500,
                                Lang.bind(this, this._onHideTimerComplete));
                        }
                    };
                }

                STG.TTP._onEnterEvent = Tooltips.TooltipBase._onEnterEvent;
                Tooltips.TooltipBase.prototype["_onEnterEvent"] = function(actor, event) {
                    if (!this._showTimer) {
                        this._showTimer = Mainloop.timeout_add(Settings.get_int($.P.TOOLTIPS_DELAY),
                            Lang.bind(this, this._onTimerComplete));
                        this.mousePosition = event.get_coords();
                    }
                };
            }
        }

        // Mark for deletion on EOL.
        if (Settings.get_boolean($.P.TOOLTIPS_ALIGNMENT)) {
            if (this.shouldEnable("positioning")) {
                this.desktop_settings = new Gio.Settings({
                    schema_id: "org.cinnamon.desktop.interface"
                });

                STG.TTP.show = Tooltips.Tooltip.show;
                Tooltips.Tooltip.prototype["show"] = function() {
                    if (this._tooltip.get_text() === "")
                        return;

                    let tooltipWidth = this._tooltip.get_allocation_box().x2 -
                        this._tooltip.get_allocation_box().x1;

                    let monitor = Main.layoutManager.findMonitorForActor(this.item);

                    let cursorSize = CT_TooltipsPatch.desktop_settings.get_int("cursor-size");
                    let tooltipTop = this.mousePosition[1] + (cursorSize / 1.5);
                    var tooltipLeft = this.mousePosition[0] + (cursorSize / 2);

                    tooltipLeft = Math.max(tooltipLeft, monitor.x);
                    tooltipLeft = Math.min(tooltipLeft, monitor.x + monitor.width - tooltipWidth);

                    this._tooltip.set_position(tooltipLeft, tooltipTop);

                    this._tooltip.show();
                    this._tooltip.raise_top();
                    this.visible = true;
                };
            } else {
                Settings.set_boolean($.P.TOOLTIPS_ALIGNMENT, false);
                $.dealWithRejection(_("Avoid mouse pointer overlapping tooltips"));
            }
        }
    },

    disable: function() {
        if (STG.TTP._onMotionEvent) {
            Tooltips.TooltipBase.prototype["_onMotionEvent"] = STG.TTP._onMotionEvent;
            delete STG.TTP._onMotionEvent;
        }

        if (STG.TTP._onEnterEvent) {
            Tooltips.Tooltip.prototype["_onEnterEvent"] = STG.TTP._onEnterEvent;
            delete STG.TTP._onEnterEvent;
        }

        // Mark for deletion on EOL.
        if (STG.TTP.show) {
            Tooltips.Tooltip.prototype["show"] = STG.TTP.show;
            delete STG.TTP.show;
        }
    },

    toggle: function() {
        togglePatch(CT_TooltipsPatch, "TTP", Settings.get_boolean($.P.TOOLTIPS_TWEAKS_ENABLED));
    },

    shouldEnable: function(aTweak) {
        switch (aTweak) {
            case "delay":
                return true;
            case "positioning":
                return $.versionCompare(CINNAMON_VERSION, "3.0.7") <= 0;
        }
        return false;
    }
};

const CT_PopupMenuManagerPatch = {
    enable: function() {

        if (Settings.get_string($.P.POPUP_MENU_MANAGER_APPLETS_MENUS_BEHAVIOR) !== "default") {
            STG.PPMM._onEventCapture = PopupMenu.PopupMenuManager.prototype["_onEventCapture"];
            PopupMenu.PopupMenuManager.prototype["_onEventCapture"] = function(actor, event) {
                if (!this.grabbed)
                    return false;

                if (Main.keyboard.shouldTakeEvent(event))
                    return Clutter.EVENT_PROPAGATE;

                if (this._owner.menuEventFilter &&
                    this._owner.menuEventFilter(event))
                    return true;

                if (this._activeMenu !== null && this._activeMenu.passEvents)
                    return false;

                if (this._didPop) {
                    this._didPop = false;
                    return true;
                }

                let activeMenuContains = this._eventIsOnActiveMenu(event);
                let eventType = event.type();

                if (eventType == Clutter.EventType.BUTTON_RELEASE) {
                    if (activeMenuContains) {
                        return false;
                    } else {
                        this._closeMenu();
                        return false;
                    }
                } else if (eventType == Clutter.EventType.BUTTON_PRESS && !activeMenuContains) {
                    this._closeMenu();
                    return false;
                } else if (!this._shouldBlockEvent(event)) {
                    return false;
                }

                return false;
            };
        }

        if (Settings.get_string($.P.POPUP_MENU_MANAGER_APPLETS_MENUS_BEHAVIOR) === "gnome-shell") {
            if (!Main.CT_PopupMenuManagerPatch_allAppletsMenus)
                Main.CT_PopupMenuManagerPatch_allAppletsMenus = [];

            // No need to override, just inject.
            STG.PPMM._init = $.injectToFunction(PopupMenu.PopupMenuManager.prototype, "_init", function(menu) { // jshint ignore:line
                this._open_menu_id = null;
            });

            STG.PPMM.addMenu = PopupMenu.PopupMenuManager.prototype["addMenu"];
            PopupMenu.PopupMenuManager.prototype["addMenu"] = function(menu, position) {
                this._signals.connect(menu, "open-state-changed", this._onMenuOpenState);
                this._signals.connect(menu, "child-menu-added", this._onChildMenuAdded);
                this._signals.connect(menu, "child-menu-removed", this._onChildMenuRemoved);
                this._signals.connect(menu, "destroy", this._onMenuDestroy);

                let source = menu.sourceActor;

                if (source) {
                    this._signals.connect(source, "enter-event", function() {
                        this._onMenuSourceEnter(menu);
                    });
                    this._signals.connect(source, "key-focus-in", function() {
                        this._onMenuSourceEnter(menu);
                    });
                    this._signals.connect(source, "leave-event", Lang.bind(this, this._onMenuSourceExit));

                    if (Main.CT_PopupMenuManagerPatch_allAppletsMenus.indexOf(menu) === -1 &&
                        source._applet &&
                        menu instanceof Applet.AppletPopupMenu)
                        Main.CT_PopupMenuManagerPatch_allAppletsMenus.push(menu);
                }

                if (position === undefined)
                    this._menus.push(menu);
                else
                    this._menus.splice(position, 0, menu);
            };

            // No need to override, just inject.
            STG.PPMM.removeMenu = $.injectToFunction(PopupMenu.PopupMenuManager.prototype, "removeMenu", function(menu) {
                if (Main.CT_PopupMenuManagerPatch_allAppletsMenus.indexOf(menu) !== -1)
                    Main.CT_PopupMenuManagerPatch_allAppletsMenus.splice(Main.CT_PopupMenuManagerPatch_allAppletsMenus.indexOf(menu), 1);
            });

            STG.PPMM._onMenuSourceEnter = PopupMenu.PopupMenuManager.prototype["_onMenuSourceEnter"];
            PopupMenu.PopupMenuManager.prototype["_onMenuSourceEnter"] = function(menu) {
                if (menu.sourceActor && menu.sourceActor._applet && menu instanceof Applet.AppletPopupMenu) {
                    if (menu == this._activeMenu)
                        return false;

                    if (this._open_menu_id) {
                        Mainloop.source_remove(this._open_menu_id);
                        this._open_menu_id = null;
                    }

                    this._open_menu_id = Mainloop.timeout_add(50, Lang.bind(this, function() {
                        let allowToOpen = false;
                        try {
                            for (let i = Main.CT_PopupMenuManagerPatch_allAppletsMenus.length - 1; i >= 0; i--) {
                                if (Main.CT_PopupMenuManagerPatch_allAppletsMenus[i].isOpen) {
                                    allowToOpen = true;
                                    break;
                                }
                            }
                        } finally {
                            allowToOpen && menu.open(true);
                            return false;
                        }
                    }));
                }

                if (!this.grabbed || menu == this._activeMenu)
                    return false;

                if (this._activeMenu && this._activeMenu.isChildMenu(menu))
                    return false;

                if (this._menuStack.indexOf(menu) != -1)
                    return false;

                if (this._menuStack.length > 0 && this._menuStack[0].isChildMenu(menu))
                    return false;

                this._changeMenu(menu);
                return false;
            };

            // Doesn't exists by default. So go ahead and create it.
            PopupMenu.PopupMenuManager.prototype["_onMenuSourceExit"] =
                Lang.bind(PopupMenu.PopupMenuManager.prototype, function() {
                    if (this._open_menu_id) {
                        Mainloop.source_remove(this._open_menu_id);
                        this._open_menu_id = null;
                    }
                });
        }
    },

    disable: function() {
        if (STG.PPMM._onEventCapture) {
            PopupMenu.PopupMenuManager.prototype["_onEventCapture"] = STG.PPMM._onEventCapture;
            delete STG.PPMM._onEventCapture;
        }

        if (STG.PPMM.addMenu) {
            PopupMenu.PopupMenuManager.prototype["addMenu"] = STG.PPMM.addMenu;
            delete STG.PPMM.addMenu;
        }

        if (STG.PPMM.removeMenu) {
            $.removeInjection(PopupMenu.PopupMenuManager.prototype, STG.PPMM, "removeMenu");
        }

        if (STG.PPMM._init) {
            $.removeInjection(PopupMenu.PopupMenuManager.prototype, STG.PPMM, "_init");
        }

        if (STG.PPMM._onMenuSourceEnter) {
            PopupMenu.PopupMenuManager.prototype["_onMenuSourceEnter"] = STG.PPMM._onMenuSourceEnter;
            delete STG.PPMM._onMenuSourceEnter;
        }

        if (PopupMenu.PopupMenuManager.prototype["_onMenuSourceExit"]) {
            delete PopupMenu.PopupMenuManager.prototype["_onMenuSourceExit"];
        }
    },

    toggle: function() {
        togglePatch(CT_PopupMenuManagerPatch, "PPMM", Settings.get_boolean($.P.POPUP_MENU_MANAGER_TWEAKS_ENABLED));
    }
};

const CT_DropToDesktopPatch = {
    enable: function() {
        if (!Main.layoutManager.CT_DropToDesktopPatch_desktop &&
            Settings.get_boolean($.P.DESKTOP_TWEAKS_ALLOW_DROP_TO_DESKTOP))
            Main.layoutManager.CT_DropToDesktopPatch_desktop = new $.CT_NemoDesktopAreaClass();
    },

    disable: function() {
        if (Main.layoutManager.CT_DropToDesktopPatch_desktop)
            delete Main.layoutManager.CT_DropToDesktopPatch_desktop;
    },

    toggle: function() {
        togglePatch(CT_DropToDesktopPatch, "DTD", Settings.get_boolean($.P.DESKTOP_TWEAKS_ENABLED));
    }
};

const CT_CustomWindowShadows = {
    enable: function() {
        this.activate_preset(Settings.get_string($.P.WINDOW_SHADOWS_PRESET));
    },

    disable: function() {
        this.activate_preset("default");
    },

    toggle: function() {
        togglePatch(CT_CustomWindowShadows, "CWS", Settings.get_boolean($.P.WINDOW_SHADOWS_TWEAKS_ENABLED));
    },

    create_params: function(r) {
        return new Meta.ShadowParams({
            "radius": r[0],
            "top_fade": r[1],
            "x_offset": r[2],
            "y_offset": r[3],
            "opacity": r[4]
        });
    },

    activate_preset: function(aPreset) {
        let presets = $.SHADOW_VALUES;

        try {
            if (aPreset === "custom") {
                let customPreset = Settings.get_string($.P.WINDOW_SHADOWS_CUSTOM_PRESET);

                if (customPreset === "") {
                    Settings.set_string($.P.WINDOW_SHADOWS_CUSTOM_PRESET, JSON.stringify(presets.default));
                    customPreset = presets.default;
                }

                presets["custom"] = typeof customPreset === "string" ?
                    JSON.parse(customPreset) :
                    customPreset;
            }
        } catch (aErr) {
            global.logError(aErr);
        } finally {
            if (aPreset in presets) {
                let focused = presets[aPreset].focused;
                let unfocused = presets[aPreset].unfocused;

                for (let record in focused) {
                    ShadowFactory.set_params(record, true, this.create_params(focused[record]));
                }

                for (let record in unfocused) {
                    ShadowFactory.set_params(record, false, this.create_params(unfocused[record]));
                }
            }
        }
    }
};

const CT_AutoMoveWindows = {
    _trackerExists: true,
    _winMover: false,
    enable: function() {
        try {
            if (!Main.wm._workspaceTracker) {
                this._trackerExists = false;
                Main.wm._workspaceTracker = new WorkspaceTracker.WorkspaceTracker();
            }
        } finally {
            try {
                STG.AMW._checkWorkspaces = Main.wm._workspaceTracker._checkWorkspaces;
                Main.wm._workspaceTracker._checkWorkspaces = $.CT_MyCheckWorkspaces;

                this._winMover = new $.CT_WindowMoverClass();
            } catch (aErr) {
                global.logError(aErr);
            }
        }
    },

    disable: function() {
        if (this._winMover)
            this._winMover.destroy();

        if (STG.AMW._checkWorkspaces) {
            Main.wm._workspaceTracker._checkWorkspaces = STG.AMW._checkWorkspaces;
            delete STG.AMW._checkWorkspaces;
        }

        if (!this._trackerExists)
            delete Main.wm._workspaceTracker;
    },

    toggle: function() {
        togglePatch(CT_AutoMoveWindows, "AMW", Settings.get_boolean($.P.WINDOW_AUTO_MOVE_TWEAKS_ENABLED));
    }
};

const CT_MaximusNG = {
    maximus: null,

    enable: function() {
        this.maximus = new $.CT_MaximusNGClass();
        this.maximus.startUndecorating();
    },

    disable: function() {
        if (this.maximus) {
            this.maximus.stopUndecorating();
            this.maximus = null;
        }
    },

    toggle: function() {
        togglePatch(CT_MaximusNG, "MAXNG", Settings.get_boolean($.P.MAXIMUS_ENABLE_TWEAK));
    },
};

// Patch template

/*
const CT_Patch = {
	enable: function() {
		//
	},

	disable: function() {
		//
	},

	toggle: function() {
		togglePatch(CT_Patch, "Key from CONNECTION_IDS object", Settings.get_boolean($.P.PREF_THAT_ENABLES_TWEAK));
	}
};
 */

// Called when extension is loaded
function init() {
    bindSettings();

    try {
        allowEnabling = $.versionCompare(CINNAMON_VERSION, "2.8.6") >= 0;
    } catch (aErr) {
        global.logError(aErr.message);
        allowEnabling = false;
    }
}

// Called when extension is loaded
function enable() {
    // DO NOT allow to enable extension if it isn't installed on a proper Cinnamon version.
    if (allowEnabling) {
        try {
            if (Settings.get_boolean($.P.APPLETS_TWEAKS_ENABLED)) {
                try {
                    if (!AppletManager)
                        AppletManager = imports.ui.appletManager;
                } finally {
                    CT_AppletManagerPatch.enable();
                }
            }
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.DESKLETS_TWEAKS_ENABLED))
                try {
                    if (!DeskletManager)
                        DeskletManager = imports.ui.appletManager;
                } finally {
                    CT_DeskletManagerPatch.enable();
                }
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.NOTIFICATIONS_ENABLE_TWEAKS))
                CT_MessageTrayPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_string($.P.WIN_DEMANDS_ATTENTION_ACTIVATION_MODE) !== "none")
                CT_WindowDemandsAttentionBehavior.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        // Mark for deletion on EOL.
        try {
            if (Settings.get_boolean($.P.HOTCORNERS_TWEAKS_ENABLED)) {
                try {
                    HotCornerPatched = imports.extension.extra_modules.hotCornerPatched;
                } finally {
                    CT_HotCornersPatch.enable();
                }
            }
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.TOOLTIPS_TWEAKS_ENABLED))
                CT_TooltipsPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.POPUP_MENU_MANAGER_TWEAKS_ENABLED))
                CT_PopupMenuManagerPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.DESKTOP_TWEAKS_ENABLED)) {
                CT_DropToDesktopPatch.enable();
            }
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.WINDOW_SHADOWS_TWEAKS_ENABLED)) {
                try {
                    ShadowFactory = Meta.ShadowFactory.get_default();
                } finally {
                    CT_CustomWindowShadows.enable();
                }
            }
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.WINDOW_AUTO_MOVE_TWEAKS_ENABLED)) {
                try {
                    WorkspaceTracker = imports.extension.extra_modules.WorkspaceTracker;
                } finally {
                    CT_AutoMoveWindows.enable();
                }
            }
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (Settings.get_boolean($.P.MAXIMUS_ENABLE_TWEAK))
                CT_MaximusNG.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        if (!Settings.get_boolean($.P.INITIAL_LOAD)) {
            let msg = [
                _("If you updated this extension from an older version, <b>you must check its settings window</b>."),
                _("Some preferences may have been changed to their default values."),
                _("This message will not be displayed again.")
            ];
            let icon = new St.Icon({
                icon_name: "dialog-warning",
                icon_type: St.IconType.FULLCOLOR,
                icon_size: 48
            });
            Mainloop.timeout_add(5000, function() {
                Main.criticalNotify(
                    _(ExtensionMeta.name),
                    msg.join(" "),
                    icon
                );
                Settings.set_boolean($.P.INITIAL_LOAD, true);
            });
        }
    } else {
        if (CONNECTION_IDS.settings_bindings > 0)
            Settings.disconnect(CONNECTION_IDS.settings_bindings);

        $.informAndDisable();
    }
}

// Called when extension gets disabled
function disable() {
    if (CONNECTION_IDS.settings_bindings > 0)
        Settings.disconnect(CONNECTION_IDS.settings_bindings);

    let patches = [
        CT_AppletManagerPatch,
        CT_DeskletManagerPatch,
        CT_MessageTrayPatch,
        CT_WindowDemandsAttentionBehavior,
        CT_HotCornersPatch,
        CT_TooltipsPatch,
        CT_PopupMenuManagerPatch,
        CT_DropToDesktopPatch,
        CT_CustomWindowShadows,
        CT_AutoMoveWindows,
        CT_MaximusNG,
    ];

    for (let i = patches.length - 1; i >= 0; i--) {
        try {
            patches[i].disable();
        } catch (aErr) {
            continue;
        }
    }
}

/*
Notes:
- CT_HotCornersPatch marked for deletion on Cinnamon 2.8 (LM 17.3) end-of-life (EOL).
- CT_TooltipsPatch positioning/alignement: Same as CT_HotCornersPatch.
*/
