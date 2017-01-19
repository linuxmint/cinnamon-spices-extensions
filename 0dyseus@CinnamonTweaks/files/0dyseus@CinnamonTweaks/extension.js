const Lang = imports.lang;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const AppletManager = imports.ui.appletManager;
const DeskletManager = imports.ui.deskletManager;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const Extension = imports.ui.extension;
const Cinnamon = imports.gi.Cinnamon;
const CINNAMON_VERSION = GLib.getenv("CINNAMON_VERSION");
const Applet = imports.ui.applet;
const Desklet = imports.ui.desklet;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const DESKTOP_SCHEMA = 'org.cinnamon.desktop.interface';
const CURSOR_SIZE_KEY = 'cursor-size';
const Tooltips = imports.ui.tooltips;
const St = imports.gi.St;
const DND = imports.ui.dnd;
const FileUtils = imports.misc.fileUtils;

let $,
    HotCornerPatched,
    settings,
    metadata,
    allowEnabling = false;

function _(aStr) {
    let customTrans = Gettext.dgettext(metadata.uuid, aStr);
    if (customTrans != aStr) {
        return customTrans;
    }
    return Gettext.gettext(aStr);
}

let IDS = {
    DTD: 0, // CT_DropToDesktopPatch toggle ID.
    PPMM: 0, // CT_PopupMenuManagerPatch toggle ID.
    TTP: 0, // CT_TooltipsPatch toggle ID.
    HCP: 0, // CT_HotCornersPatch toggle ID.
    MTP: 0, // CT_MessageTrayPatch toggle ID.
    DMP: 0, // CT_DeskletManagerPatch toggle ID.
    AMP: 0, // CT_AppletManagerPatch toogle ID.
    WDAE: 0, // CT_WindowDemandsAttentionBehavior toogle ID.
    EXEC_WDAE: 0, // CT_WindowDemandsAttentionBehavior execution ID.
    CONNECTION_WDAE: 0, // CT_WindowDemandsAttentionBehavior connection ID.
};

/**
 * Container for old attributes and functions for later restore.
 */
let STG = {
    PPMM: {},
    TTP: {},
    HCP: {},
    MTP: {},
    AMP: {},
    DMP: {}
};

function dealWithRejection(aTweakDescription) {
    Main.warningNotify(_(metadata.name), _(aTweakDescription) + "\n" +
        _("Tweak ativation aborted!!!") + "\n" +
        _("Your Cinnamon version may not be compatible!!!"));
}

function togglePatch(aPatch, aID, aEnabledPref) {
    try {
        aPatch.disable();
        if (IDS[aID] > 0) {
            Mainloop.source_remove(IDS[aID]);
            IDS[aID] = 0;
        }

        if (!aEnabledPref)
            return;

        IDS[aID] = Mainloop.timeout_add(1000, Lang.bind(aPatch, function() {
            aPatch.enable();
            IDS[aID] = 0;
            return false;
        }));
    } catch (aErr) {
        global.logError(aErr);
    }
}

function informAndDisable() {
    try {
        let msg = _("Extension ativation aborted!!!") + "\n" +
            _("Your Cinnamon version may not be compatible!!!") + "\n" +
            _("Minimum Cinnamon version allowed: 2.8.6");
        global.logError(msg);
        Main.criticalNotify(_(metadata.name), msg);
    } finally {
        let enabledExtensions = global.settings.get_strv("enabled-extensions");
        Extension.unloadExtension(metadata.uuid, Extension.Type.EXTENSION);
        enabledExtensions.splice(enabledExtensions.indexOf(metadata.uuid), 1);
        global.settings.set_strv("enabled-extensions", enabledExtensions);
    }
}

const CT_AppletManagerPatch = {
    enable: function() {
        if (settings.pref_applets_add_open_folder_item_to_context ||
            settings.pref_applets_add_edit_file_item_to_context) {
            STG.AMP.finalizeContextMenu = $.injectToFunction(Applet.Applet.prototype, "finalizeContextMenu", function() {
                let menuItems = this._applet_context_menu._getMenuItems();
                let itemsLength = menuItems.length;
                if (itemsLength > 0) {
                    let getPosition = Lang.bind(this, function(aPos) {
                        let pos;
                        switch (Number(aPos)) {
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

                    if (settings.pref_applets_add_open_folder_item_to_context &&
                        !this.context_menu_item_custom_open_folder) {
                        let position = getPosition(settings.pref_applets_add_open_folder_item_to_context_placement);
                        this.context_menu_item_custom_open_folder = new PopupMenu.PopupIconMenuItem(
                            _("Open applet folder"),
                            "folder",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_open_folder.connect("activate",
                            Lang.bind(this, function() {
                                Util.spawnCommandLine("xdg-open " + this._meta["path"]);
                            }));
                        this._applet_context_menu.addMenuItem(this.context_menu_item_custom_open_folder, position);
                    }

                    if (settings.pref_applets_add_edit_file_item_to_context &&
                        !this.context_menu_item_custom_edit_file) {
                        let position = getPosition(settings.pref_applets_add_edit_file_item_to_context_placement);
                        this.context_menu_item_custom_edit_file = new PopupMenu.PopupIconMenuItem(
                            _("Edit applet main file"),
                            "text-editor",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_edit_file.connect("activate",
                            Lang.bind(this, function() {
                                Util.spawnCommandLine("xdg-open " + this._meta["path"] + "/applet.js");
                            }));
                        this._applet_context_menu.addMenuItem(this.context_menu_item_custom_edit_file, position);
                    }
                }
            });
        }

        if (settings.pref_applets_ask_confirmation_applet_removal) {
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
                                    global.settings.set_strv('enabled-applets', newEnabledApplets);
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
                        .format(AppletManager.get_object_for_uuid(uuid, applet_id)._meta.name, applet_id),
                        _("OK"),
                        _("Cancel")).open();
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
        togglePatch(CT_AppletManagerPatch, "AMP", settings.pref_applets_tweaks_enabled);
    }
};

const CT_DeskletManagerPatch = {
    enable: function() {
        if (settings.pref_desklets_add_open_folder_item_to_context ||
            settings.pref_desklets_add_edit_file_item_to_context) {
            STG.DMP.finalizeContextMenu = $.injectToFunction(Desklet.Desklet.prototype, "finalizeContextMenu", function() {
                let menuItems = this._menu._getMenuItems();
                let itemsLength = menuItems.length;
                if (itemsLength > 0) {
                    let getPosition = Lang.bind(this, function(aPos) {
                        let pos;
                        switch (Number(aPos)) {
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

                    if (settings.pref_desklets_add_open_folder_item_to_context &&
                        this.context_menu_item_custom_open_folder) {
                        let position = getPosition(settings.pref_desklets_add_open_folder_item_to_context_placement);
                        this.context_menu_item_custom_open_folder = new PopupMenu.PopupIconMenuItem(
                            _("Open desklet folder"),
                            "folder",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_open_folder.connect("activate", Lang.bind(this, function() {
                            Util.spawnCommandLine("xdg-open " + this._meta["path"]);
                        }));
                        this._menu.addMenuItem(this.context_menu_item_custom_open_folder, position);
                    }

                    if (settings.pref_desklets_add_edit_file_item_to_context &&
                        !this.context_menu_item_custom_edit_file) {
                        let position = getPosition(settings.pref_desklets_add_edit_file_item_to_context_placement);
                        this.context_menu_item_custom_edit_file = new PopupMenu.PopupIconMenuItem(
                            _("Edit desklet main file"),
                            "text-editor",
                            St.IconType.SYMBOLIC);
                        this.context_menu_item_custom_edit_file.connect("activate", Lang.bind(this, function() {
                            Util.spawnCommandLine("xdg-open " + this._meta["path"] + "/desklet.js");
                        }));
                        this._menu.addMenuItem(this.context_menu_item_custom_edit_file, position);
                    }
                }
            });
        }

        if (settings.pref_desklets_ask_confirmation_desklet_removal) {
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
                            if (uuid == elements[0] && desklet_id == elements[1]) list.splice(i, 1);
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
                        .format(DeskletManager.get_object_for_uuid(uuid, desklet_id)._meta.name, desklet_id),
                        _("OK"),
                        _("Cancel")).open();
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
        togglePatch(CT_DeskletManagerPatch, "DMP", settings.pref_desklets_tweaks_enabled);
    }
};

const CT_MessageTrayPatch = {
    enable: function() {
        let mt = Main.messageTray;
        let position = settings.pref_notifications_position; // true = bottom, false = top
        let distanceFromPanel = Number(settings.pref_notifications_distance_from_panel);
        let ANIMATION_TIME = settings.pref_notifications_enable_animation ? 0.2 : 0.001;
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

            this._tween(this._notificationBin, '_notificationState', State.HIDDEN, {
                y: (position ?
                    Main.layoutManager.primaryMonitor.height :
                    Main.layoutManager.primaryMonitor.y),
                opacity: 0,
                time: ANIMATION_TIME,
                transition: 'easeOutQuad',
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
            this._notificationClickedId = this._notification.connect('done-displaying',
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

            let margin = this._notification._table.get_theme_node().get_length('margin-from-right-edge-of-screen');
            if (settings.pref_notifications_right_margin !== 0)
                margin = settings.pref_notifications_right_margin;
            this._notificationBin.x = monitor.x + monitor.width - this._notification._table.width - margin;
            Main.soundManager.play('notification');
            this._notificationBin.show();

            this._updateShowingNotification();

            let [x, y, mods] = global.get_pointer();
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
                this._tween(this._notificationBin, '_notificationState', State.SHOWN, {
                    y: newY,
                    time: ANIMATION_TIME,
                    transition: 'easeOutQuad'
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
        togglePatch(CT_MessageTrayPatch, "MTP", settings.pref_notifications_enable_tweaks);
    }
};

const SHORTCUT_ID = "cinnamon-tweaks-window-demands-attention-shortcut";

const WindowDemandsAttentionClass = new Lang.Class({
    Name: "Window Demands Attention",

    _init: function() {
        if (settings.pref_win_demands_attention_activation_mode === "hotkey") {
            this._windows = [];
            IDS.CONNECTION_WDAE = global.display.connect(
                "window-demands-attention",
                Lang.bind(this, this._on_window_demands_attention)
            );
        } else if (settings.pref_win_demands_attention_activation_mode === "force") {
            this._tracker = Cinnamon.WindowTracker.get_default();
            this._handlerid = global.display.connect("window-demands-attention",
                Lang.bind(this, this._on_window_demands_attention));
        }
    },

    _on_window_demands_attention: function(aDisplay, aWin) {
        switch (settings.pref_win_demands_attention_activation_mode) {
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
            SHORTCUT_ID,
            settings.pref_win_demands_attention_keyboard_shortcut,
            Lang.bind(this, this._activate_last_window));
    },

    _remove_keybindings: function() {
        Main.keybindingManager.removeHotKey(SHORTCUT_ID);
    },

    enable: function() {
        if (settings.pref_win_demands_attention_activation_mode === "hotkey")
            this._add_keybindings();
    },

    _destroy: function() {
        try {
            global.display.disconnect(this._handlerid);
        } catch (aErr) {}

        try {
            global.display.disconnect(IDS.CONNECTION_WDAE);
        } catch (aErr) {}

        IDS.CONNECTION_WDAE = 0;
        this._windows = null;
        this._remove_keybindings();
    }
});

const CT_WindowDemandsAttentionBehavior = {
    enable: function() {
        try {
            if (IDS.EXEC_WDAE > 0)
                this.disable();
        } finally {
            IDS.EXEC_WDAE = new WindowDemandsAttentionClass();
            IDS.EXEC_WDAE.enable();
        }
    },

    disable: function() {
        if (IDS.EXEC_WDAE > 0) {
            IDS.EXEC_WDAE._destroy();
            IDS.EXEC_WDAE = 0;
        }
    },

    toggle: function() {
        togglePatch(CT_WindowDemandsAttentionBehavior,
            "WDAE",
            settings.pref_win_demands_attention_activation_mode !== "none");
    }
};

const CT_HotCornersPatch = {
    enable: function() {
        if (this.shouldEnable()) {
            STG.HCP = Main.layoutManager.hotCornerManager;
            delete Main.layoutManager.hotCornerManager;
            Main.layoutManager.hotCornerManager = new HotCornerPatched.HotCornerManager({
                0: settings.pref_hotcorners_delay_top_left,
                1: settings.pref_hotcorners_delay_top_right,
                2: settings.pref_hotcorners_delay_bottom_left,
                3: settings.pref_hotcorners_delay_bottom_right
            });
            Main.layoutManager._updateHotCorners();
            global.settings.connect("changed::overview-corner", Lang.bind(this, this.toggle));
        } else
            dealWithRejection();
    },

    disable: function() {
        if (STG.HCP) {
            Main.layoutManager.hotCornerManager = STG.HCP;
            delete STG.HCP;
        }
    },

    toggle: function() {
        togglePatch(CT_HotCornersPatch, "HCP", settings.pref_hotcorners_tweaks_enabled);
    },

    shouldEnable: function() {
        return $.versionCompare(CINNAMON_VERSION, "3.0.7") <= 0;
    }
};

const CT_TooltipsPatch = {
    enable: function() {
        if (this.shouldEnable("delay")) {
            if (settings.pref_tooltips_delay !== 300) {
                STG.TTP._onMotionEvent = Tooltips.TooltipBase._onMotionEvent;
                Tooltips.TooltipBase.prototype["_onMotionEvent"] = function(actor, event) {
                    if (this._showTimer) {
                        Mainloop.source_remove(this._showTimer);
                        this._showTimer = null;
                    }

                    if (!this.visible) {
                        this._showTimer = Mainloop.timeout_add(settings.pref_tooltips_delay,
                            Lang.bind(this, this._onTimerComplete));
                        this.mousePosition = event.get_coords();
                    }
                };

                STG.TTP._onEnterEvent = Tooltips.TooltipBase._onEnterEvent;
                Tooltips.TooltipBase.prototype["_onEnterEvent"] = function(actor, event) {
                    if (!this._showTimer) {
                        this._showTimer = Mainloop.timeout_add(settings.pref_tooltips_delay,
                            Lang.bind(this, this._onTimerComplete));
                        this.mousePosition = event.get_coords();
                    }
                };
            }
        }

        if (this.shouldEnable("positioning")) {
            if (settings.pref_tooltips_alignment) {
                this.desktop_settings = new Gio.Settings({
                    schema_id: DESKTOP_SCHEMA
                });

                STG.TTP.show = Tooltips.Tooltip.show;
                Tooltips.Tooltip.prototype["show"] = function() {
                    if (this._tooltip.get_text() === "")
                        return;

                    let tooltipWidth = this._tooltip.get_allocation_box().x2 -
                        this._tooltip.get_allocation_box().x1;

                    let monitor = Main.layoutManager.findMonitorForActor(this.item);

                    let cursorSize = CT_TooltipsPatch.desktop_settings.get_int(CURSOR_SIZE_KEY);
                    let tooltipTop = this.mousePosition[1] + (cursorSize / 1.5);
                    var tooltipLeft = this.mousePosition[0] + (cursorSize / 2);

                    tooltipLeft = Math.max(tooltipLeft, monitor.x);
                    tooltipLeft = Math.min(tooltipLeft, monitor.x + monitor.width - tooltipWidth);

                    this._tooltip.set_position(tooltipLeft, tooltipTop);

                    this._tooltip.show();
                    this._tooltip.raise_top();
                    this.visible = true;
                };
            }
        } else
            dealWithRejection();
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
        if (STG.TTP.show) {
            Tooltips.Tooltip.prototype["show"] = STG.TTP.show;
            delete STG.TTP.show;
        }
    },

    toggle: function() {
        togglePatch(CT_TooltipsPatch, "TTP", settings.pref_tooltips_tweaks_enabled);
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

        if (settings.pref_popup_menu_manager_applets_menus_behavior > 0) {
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

        if (settings.pref_popup_menu_manager_applets_menus_behavior === 1) {
            if (!Main.CT_PopupMenuManagerPatch_allAppletsMenus)
                Main.CT_PopupMenuManagerPatch_allAppletsMenus = [];

            STG.PPMM.addMenu = PopupMenu.PopupMenuManager.prototype["addMenu"];
            PopupMenu.PopupMenuManager.prototype["addMenu"] = function(menu, position) {
                this._signals.connect(menu, 'open-state-changed', this._onMenuOpenState);
                this._signals.connect(menu, 'child-menu-added', this._onChildMenuAdded);
                this._signals.connect(menu, 'child-menu-removed', this._onChildMenuRemoved);
                this._signals.connect(menu, 'destroy', this._onMenuDestroy);

                let source = menu.sourceActor;

                if (source) {
                    this._signals.connect(source, 'enter-event', function() {
                        this._onMenuSourceEnter(menu);
                    });
                    this._signals.connect(source, 'key-focus-in', function() {
                        this._onMenuSourceEnter(menu);
                    });
                    this._signals.connect(source, 'leave-event', Lang.bind(this, this._onMenuSourceExit));

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

                    if (this._open_menu_id > 0) {
                        Mainloop.source_remove(this._open_menu_id);
                        this._open_menu_id = 0;
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
            PopupMenu.PopupMenuManager.prototype["_onMenuSourceExit"] = function() {
                if (this._open_menu_id > 0) {
                    Mainloop.source_remove(this._open_menu_id);
                    this._open_menu_id = 0;
                }
            };
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
        if (STG.PPMM._onMenuSourceEnter) {
            PopupMenu.PopupMenuManager.prototype["_onMenuSourceEnter"] = STG.PPMM._onMenuSourceEnter;
            delete STG.PPMM._onMenuSourceEnter;
        }
        if (PopupMenu.PopupMenuManager.prototype["_onMenuSourceExit"]) {
            delete PopupMenu.PopupMenuManager.prototype["_onMenuSourceExit"];
        }
    },

    toggle: function() {
        togglePatch(CT_PopupMenuManagerPatch, "PPMM", settings.pref_popup_menu_manager_tweaks_enabled);
    }
};

const CT_NemoDesktopAreaClass = new Lang.Class({
    Name: "CT_NemoDesktopAreaClass",

    _init: function() {
        this.actor = global.stage;
        if (!this.actor.hasOwnProperty("_delegate"))
            this.actor._delegate = this;
    },

    acceptDrop: function(source, actor, x, y, time) {
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

    handleDragOver: function(source, actor, x, y, time) {
        let app = source.app;
        if (app === null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;
        let backgroundActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
        if (backgroundActor != global.window_group)
            return DND.DragMotionResult.NO_DROP;
        return DND.DragMotionResult.COPY_DROP;
    }
});

const CT_DropToDesktopPatch = {
    enable: function() {
        if (!Main.layoutManager.CT_DropToDesktopPatch_desktop &&
            settings.pref_desktop_tweaks_allow_drop_to_desktop)
            Main.layoutManager.CT_DropToDesktopPatch_desktop = new CT_NemoDesktopAreaClass();
    },

    disable: function() {
        if (Main.layoutManager.CT_DropToDesktopPatch_desktop)
            delete Main.layoutManager.CT_DropToDesktopPatch_desktop;
    },

    toggle: function() {
        togglePatch(CT_DropToDesktopPatch, "DTD", settings.pref_desktop_tweaks_enabled);
    }
};

/**
 * [Template]
 */
// const CT_Patch = {
// 	enable: function() {
// 		//
// 	},
//
// 	disable: function() {
// 		//
// 	},
//
// 	toggle: function() {
// 		togglePatch(CT_Patch, "Key from IDS object", settings.pref_that_enables_this_patch);
// 	}
// };

function SettingsHandler(aUUID) {
    this._init(aUUID);
}

SettingsHandler.prototype = {
    __proto__: Settings.ExtensionSettings.prototype,

    _init: function(aUUID) {
        this.settings = new Settings.ExtensionSettings(this, aUUID);
        let settingsArray = [
            ["pref_desktop_tweaks_enabled", CT_DropToDesktopPatch.toggle],
            ["pref_desktop_tweaks_allow_drop_to_desktop", CT_DropToDesktopPatch.toggle],
            ["pref_popup_menu_manager_tweaks_enabled", CT_PopupMenuManagerPatch.toggle],
            ["pref_popup_menu_manager_applets_menus_behavior", CT_PopupMenuManagerPatch.toggle],
            ["pref_applets_tweaks_enabled", CT_AppletManagerPatch.toggle],
            ["pref_applets_ask_confirmation_applet_removal", CT_AppletManagerPatch.toggle],
            ["pref_applets_add_open_folder_item_to_context", CT_AppletManagerPatch.toggle],
            ["pref_applets_add_edit_file_item_to_context", CT_AppletManagerPatch.toggle],
            ["pref_applets_add_open_folder_item_to_context_placement", CT_AppletManagerPatch.toggle],
            ["pref_applets_add_edit_file_item_to_context_placement", CT_AppletManagerPatch.toggle],
            ["pref_desklets_tweaks_enabled", CT_DeskletManagerPatch.toggle],
            ["pref_desklets_ask_confirmation_desklet_removal", CT_DeskletManagerPatch.toggle],
            ["pref_desklets_add_open_folder_item_to_context", CT_DeskletManagerPatch.toggle],
            ["pref_desklets_add_edit_file_item_to_context", CT_DeskletManagerPatch.toggle],
            ["pref_desklets_add_open_folder_item_to_context_placement", CT_DeskletManagerPatch.toggle],
            ["pref_desklets_add_edit_file_item_to_context_placement", CT_DeskletManagerPatch.toggle],
            ["pref_notifications_enable_tweaks", CT_MessageTrayPatch.toggle],
            ["pref_notifications_enable_animation", CT_MessageTrayPatch.toggle],
            ["pref_notifications_position", CT_MessageTrayPatch.toggle],
            ["pref_notifications_distance_from_panel", CT_MessageTrayPatch.toggle],
            ["pref_notifications_right_margin", CT_MessageTrayPatch.toggle],
            ["pref_win_demands_attention_activation_mode", CT_WindowDemandsAttentionBehavior.toggle],
            ["pref_win_demands_attention_keyboard_shortcut", CT_WindowDemandsAttentionBehavior.toggle],
            ["pref_hotcorners_tweaks_enabled", CT_HotCornersPatch.toggle],
            ["pref_hotcorners_delay_top_left", CT_HotCornersPatch.toggle],
            ["pref_hotcorners_delay_top_right", CT_HotCornersPatch.toggle],
            ["pref_hotcorners_delay_bottom_left", CT_HotCornersPatch.toggle],
            ["pref_hotcorners_delay_bottom_right", CT_HotCornersPatch.toggle],
            ["pref_tooltips_tweaks_enabled", CT_TooltipsPatch.toggle],
            ["pref_tooltips_alignment", CT_TooltipsPatch.toggle],
            ["pref_tooltips_delay", CT_TooltipsPatch.toggle],
            ["pref_initial_load", null],
        ];
        let bindingDirection = Settings.BindingDirection.BIDIRECTIONAL || null;
        let bindingType = this.settings.hasOwnProperty("bind");
        for (let [property_name, callback] of settingsArray) {
            if (bindingType)
                this.settings.bind(property_name, property_name, callback);
            else
                this.settings.bindProperty(bindingDirection, property_name,
                    property_name, callback, null);
        }
    }
};

/**
 * Called when extension is loaded
 */
function init(aExtensionMeta) {
    metadata = aExtensionMeta;
    settings = new SettingsHandler(metadata.uuid);
    Gettext.bindtextdomain(metadata.uuid, GLib.get_home_dir() + "/.local/share/locale");

    let extensionImports = imports.ui.extensionSystem.extensions[metadata.uuid];
    $ = extensionImports.extensionModules;
    HotCornerPatched = extensionImports.hotCornerPatched;

    try {
        allowEnabling = $.versionCompare(CINNAMON_VERSION, "2.8.6") >= 0;
    } catch (aErr) {
        global.logError(aErr.message);
        allowEnabling = false;
    }
}

/**
 * Called when extension is loaded
 */
function enable() {
    // DO NOT allow to enable extension if it isn't installed on a proper Cinnamon version.
    if (allowEnabling) {
        try {
            if (settings.pref_applets_tweaks_enabled)
                CT_AppletManagerPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_desklets_tweaks_enabled)
                CT_DeskletManagerPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_notifications_enable_tweaks)
                CT_MessageTrayPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_win_demands_attention_activation_mode !== "none")
                CT_WindowDemandsAttentionBehavior.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_hotcorners_tweaks_enabled)
                CT_HotCornersPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_tooltips_tweaks_enabled)
                CT_TooltipsPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_popup_menu_manager_tweaks_enabled)
                CT_PopupMenuManagerPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        try {
            if (settings.pref_desktop_tweaks_enabled)
                CT_DropToDesktopPatch.enable();
        } catch (aErr) {
            global.logError(aErr.message);
        }

        let msg = [
            _("If you updated this extension from an older version, <b>you must check its settings window</b>."),
            _("Some preferences may have been changed to their default values."),
            _("This message will not be displayed again.")
        ];

        if (!settings.pref_initial_load) {
            Mainloop.timeout_add(5000, function() {
                Util.spawnCommandLine("notify-send --icon=dialog-information \"" + _(metadata.name) +
                    "\" \"" + msg.join(" ") + "\" -u critical");
                settings.pref_initial_load = true;
            });
        }
    } else
        informAndDisable();
}

/**
 * Called when extension gets disabled
 */
function disable() {
    CT_AppletManagerPatch.disable();
    CT_DeskletManagerPatch.disable();
    CT_MessageTrayPatch.disable();
    CT_WindowDemandsAttentionBehavior.disable();
    CT_HotCornersPatch.disable();
    CT_TooltipsPatch.disable();
    CT_PopupMenuManagerPatch.disable();
    CT_DropToDesktopPatch.disable();
}
