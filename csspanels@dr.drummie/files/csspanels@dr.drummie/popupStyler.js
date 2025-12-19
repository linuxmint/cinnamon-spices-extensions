const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Applet = imports.ui.applet;
const Panel = imports.ui.panel;
const StylerBase = require("./stylerBase");

/**
 * Popup Styler handles popup menu transparency and blur effects
 * Uses monkey patching to intercept popup menu creation
 */
class PopupStyler extends StylerBase {
    /**
     * Initialize Popup Styler
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        super(extension, "PopupStyler");
        this.originalPopupMenuOpen = null;
        this.activePopupMenus = new Map();
    }

    /**
     * Enable popup menu styling
     */
    enable() {
        super.enable();
        this.setupPopupMenuMonkeyPatch();
        this.debugLog("Popup styler enabled");
    }

    /**
     * Disable popup menu styling
     */
    disable() {
        this.restorePopupMenuMonkeyPatch();
        this.cleanupActiveMenus();
        this.debugLog("Popup styler disabled");
        super.disable();
    }

    /**
     * Setup monkey patching for popup menu handling
     */
    setupPopupMenuMonkeyPatch() {
        try {
            // Store reference to original method
            this.originalPopupMenuOpen = PopupMenu.PopupMenu.prototype.open;
            let self = this;

            // Override the open method to intercept menu creation
            PopupMenu.PopupMenu.prototype.open = function (animate) {
                //self.extension.debugLog("Monkey patch: Popup menu opened");

                // Check if this is a menu we want to style
                if (self.shouldStyleMenu(this)) {
                    self.stylePopupMenu(this);
                }

                // Call the original method
                self.originalPopupMenuOpen.call(this, animate);
            };

            this.debugLog("Popup menu monkey patch setup successfully");
        } catch (e) {
            this.debugLog("Error setting up popup menu monkey patch:", e);
        }
    }

    /**
     * Check if a menu should be styled
     * @param {Object} menu - The popup menu to check
     * @returns {boolean} True if menu should be styled
     */
    shouldStyleMenu(menu) {
        return (
            menu instanceof Applet.AppletPopupMenu ||
            menu instanceof Applet.AppletContextMenu ||
            menu instanceof Panel.PanelContextMenu ||
            menu instanceof PopupMenu.PopupMenu ||
            menu instanceof PopupMenu.PopupSubMenu ||
            menu.sourceActor === this.extension.systemIndicator.indicator ||
            (menu.sourceActor && menu.sourceActor.get_parent && this.isElementInPanel(menu.sourceActor)) ||
            (menu.actor &&
                menu.actor.get_parent() &&
                menu.actor.get_parent().get_style_class_name &&
                menu.actor.get_parent().get_style_class_name().includes("panel")) ||
            (menu.box && menu.actor)
        );
    }

    /**
     * Check if an element is contained within a panel
     * @param {Clutter.Actor} element - The element to check
     * @returns {boolean} True if element is within a panel
     */
    isElementInPanel(element) {
        if (!element) return false;

        let current = element;
        let depth = 0;
        const MAX_DEPTH = 10;

        while (current && depth < MAX_DEPTH) {
            // Check if current element is a panel
            if (current === Main.panel.actor || (Main.panel2 && current === Main.panel2.actor)) {
                //this.extension.debugLog("Element found in panel at depth:", depth);
                return true;
            }

            // Check style classes
            if (current.get_style_class_name) {
                let styleClasses = current.get_style_class_name();
                if (
                    styleClasses &&
                    (styleClasses.includes("panel") ||
                        styleClasses.includes("panel-button") ||
                        styleClasses.includes("applet-box"))
                ) {
                    //this.extension.debugLog("Element found in panel via style class:", styleClasses);
                    return true;
                }
            }

            current = current.get_parent();
            depth++;
        }

        return false;
    }

    /**
     * Apply styles to popup menus
     * @param {Object} menu - The popup menu to style
     */
    stylePopupMenu(menu) {
        if (!menu || !menu.actor) {
            this.debugLog("stylePopupMenu: Invalid menu or actor");
            return;
        }

        try {
            //this.extension.debugLog("stylePopupMenu: Styling popup menu");

            if (!this.activePopupMenus.has(menu)) {
                let originalData = {
                    boxStyle: menu.box ? menu.box.get_style() : null,
                    actorStyle: menu.actor.get_style(),
                    boxColor: menu.box ? menu.box.get_background_color() : null,
                    boxStyleClasses: menu.box ? menu.box.get_style_class_name() : null,
                    actorStyleClasses: menu.actor.get_style_class_name(),
                };

                this.activePopupMenus.set(menu, originalData);

                // Connect to close signals for cleanup
                this.setupMenuCloseHandlers(menu);
            }

            let panelColor = this.extension.themeDetector.getPanelBaseColor();
            let menuColor = this.extension.cssManager.getMenuColor(panelColor);

            this.extension.cssManager.updateAllVariables();

            // Apply common blur styling using base class method
            if (menu.box) {
                this.applyCommonBlurStyling(
                    menu.box,
                    menuColor,
                    this.extension.menuOpacity,
                    this.getAdjustedBlurRadius("menu"),
                    this.getAdjustedBorderRadius("menu"),
                    this.extension.blurBorderColor,
                    this.extension.blurBorderWidth,
                    "menu"
                );
            }
        } catch (e) {
            this.debugLog("Error styling popup menu:", e);
        }
    }

    /**
     * Apply style to menu elements (box and actor)
     * @param {Object} menu - The popup menu
     * @param {string} style - The CSS style to apply
     */
    applyStyleToMenuElements(menu, style) {
        if (menu.box) {
            menu.box.add_style_class_name("transparency-menu-blur");
            menu.box.add_style_class_name("profile-custom");

            if (!this.extension.cssManager.hasBackdropFilter) {
                menu.box.add_style_class_name("transparency-fallback-blur");
            }

            menu.box.set_style(style);
        }

        menu.actor.add_style_class_name("transparency-menu-blur");
        menu.actor.add_style_class_name("profile-custom");

        if (!this.extension.cssManager.hasBackdropFilter) {
            menu.actor.add_style_class_name("transparency-fallback-blur");
        }

        menu.actor.set_style(style);
    }

    /**
     * Setup close handlers for proper menu cleanup
     * @param {Object} menu - The popup menu
     */
    setupMenuCloseHandlers(menu) {
        if (!menu._transparencyCloseConnection) {
            menu._transparencyCloseConnection = menu.connect("menu-animated-closed", () => {
                this.cleanupPopupMenu(menu);
            });
        }

        if (!menu._transparencyStateConnection) {
            menu._transparencyStateConnection = menu.connect("open-state-changed", (menu, open) => {
                if (!open) {
                    this.cleanupPopupMenu(menu);
                }
            });
        }
    }

    /**
     * Clean up styling for a popup menu
     * @param {Object} menu - The popup menu to clean up
     */
    cleanupPopupMenu(menu) {
        try {
            let originalData = this.activePopupMenus.get(menu);
            if (originalData) {
                // Use fade-out to prevent flicker when restoring original style
                if (menu.box && menu.box.get_stage()) {
                    this.restoreElementWithFade(menu.box, true, () => {
                        this.restorePopupMenuStyle(menu, originalData);
                        this.debugLog("Popup menu restored with fade-out transition");
                    });
                } else {
                    // Fallback to immediate restore if box is not available
                    this.restorePopupMenuStyle(menu, originalData);
                    this.debugLog("Popup menu restored immediately (no stage)");
                }

                this.activePopupMenus.delete(menu);
            }

            // Disconnect our signals
            if (menu._transparencyCloseConnection) {
                menu.disconnect(menu._transparencyCloseConnection);
                menu._transparencyCloseConnection = null;
            }

            if (menu._transparencyStateConnection) {
                menu.disconnect(menu._transparencyStateConnection);
                menu._transparencyStateConnection = null;
            }
        } catch (e) {
            this.debugLog("Error cleaning up popup menu:", e);
        }
    }

    /**
     * Restore original popup menu styling
     * @param {Object} menu - The popup menu to restore
     * @param {Object} originalData - The original styling data
     */
    restorePopupMenuStyle(menu, originalData) {
        try {
            if (menu.box) {
                menu.box.set_style(originalData.boxStyle || "");
                if (originalData.boxColor) {
                    menu.box.set_background_color(originalData.boxColor);
                } else {
                    menu.box.set_background_color(null);
                }
                if (originalData.boxStyleClasses) menu.box.set_style_class_name(originalData.boxStyleClasses);

                // Remove our style classes
                menu.box.remove_style_class_name("transparency-menu-blur");
                menu.box.remove_style_class_name("transparency-fallback-blur");
                menu.box.remove_style_class_name("profile-custom");
            }

            if (menu.actor) {
                menu.actor.set_style(originalData.actorStyle || "");
                if (originalData.actorStyleClasses) menu.actor.set_style_class_name(originalData.actorStyleClasses);

                // Remove our style classes
                menu.actor.remove_style_class_name("transparency-menu-blur");
                menu.actor.remove_style_class_name("transparency-fallback-blur");
                menu.actor.remove_style_class_name("profile-custom");
            }
        } catch (e) {
            this.debugLog("Error restoring popup menu style:", e);
        }
    }

    /**
     * Restore original popup menu functionality
     */
    restorePopupMenuMonkeyPatch() {
        try {
            if (this.originalPopupMenuOpen) {
                PopupMenu.PopupMenu.prototype.open = this.originalPopupMenuOpen;
                this.originalPopupMenuOpen = null;
                this.debugLog("Popup menu monkey patch restored");
            }
        } catch (e) {
            this.debugLog("Error restoring popup menu monkey patch:", e);
        }
    }

    /**
     * Clean up all active menus
     */
    cleanupActiveMenus() {
        this.activePopupMenus.forEach((originalData, menu) => {
            this.restorePopupMenuStyle(menu, originalData);
        });
        this.activePopupMenus.clear();
    }

    /**
     * Refresh popup menu styling when settings change
     */
    refresh() {
        super.refresh();
        this.refreshActiveMenus();
    }

    /**
     * Refresh all currently active popup menus
     */
    refreshActiveMenus() {
        try {
            this.debugLog(`Refreshing ${this.activePopupMenus.size} active popup menus`);

            this.activePopupMenus.forEach((originalData, menu) => {
                if (menu && menu.actor && menu.actor.visible) {
                    //this.debugLog("Re-styling active popup menu");
                    this.stylePopupMenu(menu);
                }
            });
        } catch (e) {
            this.debugLog("Error refreshing active popup menus:", e);
        }
    }
}

module.exports = PopupStyler;
