const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Applet = imports.ui.applet;
const Panel = imports.ui.panel;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const StylerBase = require("./stylerBase");
const { TRAVERSAL, CSS_CLASSES, TIMING, STYLING, DEFAULT_COLORS } = require("./constants");

const APPMENU_SIDEBAR_SEARCH_DEPTH = 5;

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
        this.originalPopupSubMenuOpen = null;
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
            this.originalPopupMenuOpen = PopupMenu.PopupMenu.prototype.open;
            this.originalPopupSubMenuOpen = PopupMenu.PopupSubMenu.prototype.open;
            let self = this;

            // Store patched function references to enable idempotent restore
            this._patchedPopupMenuOpen = function (animate) {
                self.debugLog("Intercepted popup menu open event");
                if (self.shouldStyleMenu(this)) {
                    self.stylePopupMenu(this);
                }
                self.originalPopupMenuOpen.call(this, animate);
            };
            this._patchedPopupSubMenuOpen = function (animate) {
                self.debugLog("Intercepted popup sub-menu open event");
                if (self.shouldStyleMenu(this)) {
                    self.stylePopupMenu(this);
                }
                self.originalPopupSubMenuOpen.call(this, animate);
            };

            PopupMenu.PopupMenu.prototype.open = this._patchedPopupMenuOpen;
            PopupMenu.PopupSubMenu.prototype.open = this._patchedPopupSubMenuOpen;

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
        const MAX_DEPTH = TRAVERSAL.MAX_DEPTH_PANEL;

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
                    (styleClasses.includes(CSS_CLASSES.PANEL) ||
                        styleClasses.includes(CSS_CLASSES.PANEL_BUTTON) ||
                        styleClasses.includes(CSS_CLASSES.APPLET_BOX))
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
                    sidebarActor: null,
                    sidebarStyle: null,
                };

                const sidebarActor = this._findAppMenuSidebar(menu.actor);
                if (sidebarActor) {
                    originalData.sidebarActor = sidebarActor;
                    originalData.sidebarStyle = sidebarActor.get_style();
                }

                this.activePopupMenus.set(menu, originalData);

                // Connect to close signals for cleanup
                this.setupMenuCloseHandlers(menu);
            }

            let menuColor = this.extension.themeDetector.getEffectivePopupColor();

            this.extension.cssManager.updateAllVariables();

            // Build configuration object for template generation
            const isSubMenu = menu instanceof PopupMenu.PopupSubMenu;
            // Detect attached orientation for main menus; submenus always get uniform radius
            const attachedOrientation = (!isSubMenu && menu._orientation !== undefined && menu._orientation !== null)
                ? menu._orientation
                : null;
            const baseRadius = this.getAdjustedBorderRadius("menu");
            const config = {
                backgroundColor: `rgba(${menuColor.r}, ${menuColor.g}, ${menuColor.b}, ${this.extension.menuOpacity})`,
                opacity: this.extension.blurOpacity,
                borderRadius: baseRadius,
                borderRadiusCSS: this.getAttachedBorderRadiusCSS(baseRadius, attachedOrientation),
                blurRadius: this.getAdjustedBlurRadius("menu"),
                blurSaturate: this.extension.blurSaturate,
                blurContrast: this.extension.blurContrast,
                blurBrightness: this.extension.blurBrightness,
                borderColor: this.extension.blurBorderColor,
                borderWidth: this.extension.blurBorderWidth,
                transition: this.extension.blurTransition,
                shadowMode: isSubMenu ? 'sides' : undefined,
            };

            // Generate CSS via template manager
            const popupCSS = this.extension.blurTemplateManager.generatePopupCSS(config);
            this.debugLog("Applying popup menu styles via template generation");

            // Apply to both box and actor
            if (menu.box) {
                menu.box.set_style(popupCSS);
            }
            // Allow side shadows to bleed outside sub-menu container bounds; symmetric margins for balanced appearance
            const shadowSpread = this.extension.settings.getValue("shadow-spread") || 0.4;
            const sideMargin = Math.round(shadowSpread * STYLING.SHADOW_BASE_MULTIPLIER) + STYLING.SUBMENU_MARGIN_OFFSET;
            const actorCSS = isSubMenu ? popupCSS + ` margin-right: ${sideMargin}px; margin-left: ${sideMargin}px;` : popupCSS;
            menu.actor.set_style(actorCSS);

            // Wire hover hooks on popup-menu-item actors for our custom hover color
            if (this.extension.hoverStyleManager) {
                this.extension.hoverStyleManager.hookPopupMenu(menu.actor);
            }

            const storedData = this.activePopupMenus.get(menu);
            if (storedData && storedData.sidebarActor) {
                this._styleAppMenuSidebar(storedData.sidebarActor).catch(e =>
                    this.debugLog(`Error styling appmenu sidebar: ${e.message}`)
                );
            }
        } catch (e) {
            this.debugLog("Error styling popup menu:", e);
        }
    }

    /**
     * Apply style to menu elements (box and actor) - DEPRECATED, kept for compatibility
     * Now handled directly in stylePopupMenu()
     * @param {Object} menu - The popup menu
     * @param {string} style - The CSS style to apply
     */
    applyStyleToMenuElements(menu, style) {
        if (menu.box) {
            menu.box.set_style(style);
        }

        menu.actor.set_style(style);
    }

    /**
     * Setup close handlers for proper menu cleanup
     * @param {Object} menu - The popup menu
     */
    setupMenuCloseHandlers(menu) {
        if (!menu._transparencyCloseConnection) {
            // Track connection for automatic cleanup
            this.addConnection(menu, "menu-animated-closed", () => {
                this.cleanupPopupMenu(menu);
            });
            menu._transparencyCloseConnection = true; // Mark as connected
        }

        if (!menu._transparencyStateConnection) {
            // Track connection for automatic cleanup
            this.addConnection(menu, "open-state-changed", (menu, open) => {
                if (!open) {
                    this.cleanupPopupMenu(menu);
                }
            });
            menu._transparencyStateConnection = true; // Mark as connected
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

                // Disconnect hover hooks from this menu's items
                if (this.extension.hoverStyleManager) {
                    this.extension.hoverStyleManager.unhookPopupMenu(menu.actor);
                    // Reset active state on the applet button that opened this menu
                    if (menu.sourceActor) {
                        this.extension.hoverStyleManager.resetActorActiveState(menu.sourceActor);
                    }
                }
                this.activePopupMenus.delete(menu);
            }
            // No need to manually disconnect - just reset flags
            if (menu._transparencyCloseConnection) {
                menu._transparencyCloseConnection = null;
            }

            if (menu._transparencyStateConnection) {
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

            if (originalData.sidebarActor) {
                originalData.sidebarActor.set_style(originalData.sidebarStyle || "");
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
                // Only restore if our patch is still active (guard against other extensions patching after us)
                if (PopupMenu.PopupMenu.prototype.open === this._patchedPopupMenuOpen) {
                    PopupMenu.PopupMenu.prototype.open = this.originalPopupMenuOpen;
                }
                this.originalPopupMenuOpen = null;
                this._patchedPopupMenuOpen = null;
            }
            if (this.originalPopupSubMenuOpen) {
                if (PopupMenu.PopupSubMenu.prototype.open === this._patchedPopupSubMenuOpen) {
                    PopupMenu.PopupSubMenu.prototype.open = this.originalPopupSubMenuOpen;
                }
                this.originalPopupSubMenuOpen = null;
                this._patchedPopupSubMenuOpen = null;
            }
            this.debugLog("Popup menu monkey patch restored");
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
                    this.stylePopupMenu(menu);
                }
            });
        } catch (e) {
            this.debugLog("Error refreshing active popup menus:", e);
        }
    }

    /**
     * Find the appmenu-sidebar actor within a menu actor tree.
     * Performs a BFS up to APPMENU_SIDEBAR_SEARCH_DEPTH levels deep.
     * Only runs when the menu root actor has the appmenu-background class
     * (i.e. menu@cinnamon.org).
     * @param {Clutter.Actor} menuActor - Root actor of the popup menu
     * @returns {Clutter.Actor|null} The sidebar actor, or null if not found
     */
    _findAppMenuSidebar(menuActor) {
        if (!menuActor || !menuActor.get_style_class_name) return null;

        const rootClass = menuActor.get_style_class_name() || "";
        this.debugLog(`_findAppMenuSidebar: root actor class="${rootClass}"`);

        if (!rootClass.includes(CSS_CLASSES.APPMENU_BACKGROUND)) return null;

        this.debugLog("_findAppMenuSidebar: appmenu-background matched, starting BFS");

        const queue = [[menuActor, 0]];
        while (queue.length > 0) {
            const [actor, depth] = queue.shift();
            if (depth > APPMENU_SIDEBAR_SEARCH_DEPTH) continue;

            if (!actor || !actor.get_style_class_name) continue;
            const cls = actor.get_style_class_name() || "";
            this.debugLog(`_findAppMenuSidebar: depth=${depth} class="${cls}"`);

            if (cls.includes(CSS_CLASSES.APPMENU_SIDEBAR) && actor !== menuActor) {
                this.debugLog(`_findAppMenuSidebar: FOUND sidebar at depth=${depth}`);
                return actor;
            }

            if (actor.get_children) {
                for (const child of actor.get_children()) {
                    queue.push([child, depth + 1]);
                }
            }
        }
        this.debugLog("_findAppMenuSidebar: sidebar NOT found after full BFS");
        return null;
    }

    /**
     * Apply GTK theme sidebar color and glow effects to the appmenu-sidebar actor.
     * Reads color directly from cinnamon.css to bypass the unstable getPanelBaseColor()
     * blackbox. Preserves max-width inline style set by the applet's _sidebarToggle().
     * @param {Clutter.Actor} sidebarActor - The appmenu-sidebar actor
     */
    async _styleAppMenuSidebar(sidebarActor) {
        if (!sidebarActor) return;
        try {
            // Sidebar color mode: when user opts-in, sidebar matches popup override color;
            // otherwise it reads the Cinnamon theme color (grey for dark, white for light).
            const useSidebarStyling = this.extension.settings.getValue(
                "enable-appmenu-sidebar-styling"
            );
            const panelColor = useSidebarStyling
                ? this.extension.themeDetector.getEffectivePopupColor()
                : await this._getAppMenuSidebarThemeColor();
            const bgColor = `rgba(${panelColor.r}, ${panelColor.g}, ${panelColor.b}, ${this.extension.menuOpacity})`;
            this.debugLog(`_styleAppMenuSidebar: panel base color r=${panelColor.r} g=${panelColor.g} b=${panelColor.b}`);

            // Build config matching popup config, but with panel base color
            const baseRadius = this.getAdjustedBorderRadius("menu");
            const config = {
                backgroundColor: bgColor,
                opacity: this.extension.blurOpacity,
                borderRadius: baseRadius,
                borderRadiusCSS: `${baseRadius}px 0 0 ${baseRadius}px`,
                blurRadius: this.getAdjustedBlurRadius("menu"),
                blurSaturate: this.extension.blurSaturate,
                blurContrast: this.extension.blurContrast,
                blurBrightness: this.extension.blurBrightness,
                borderColor: this.extension.blurBorderColor,
                borderWidth: this.extension.blurBorderWidth,
                transition: this.extension.blurTransition,
            };

            // Preserve applet-set max-width (toggled by _sidebarToggle)
            const existing = sidebarActor.get_style() || "";
            const maxWidthMatch = existing.match(/max-width\s*:\s*[^;]+;?/);
            const maxWidthPart = maxWidthMatch ? maxWidthMatch[0].replace(/;?\s*$/, "") + "; " : "";

            const sidebarCSS = this.extension.blurTemplateManager.generatePopupCSS(config);
            this.debugLog(`_styleAppMenuSidebar: applying CSS with theme color and glow effects`);
            sidebarActor.set_style(`${maxWidthPart}${sidebarCSS}`);
        } catch (e) {
            this.debugLog("Error styling appmenu sidebar:", e);
        }
    }

    /**
     * Read the appmenu-sidebar background-color directly from the active Cinnamon
     * theme's cinnamon.css file. Stable alternative to getPanelBaseColor() blackbox.
     * Falls back to MINT_Y_DARK_FALLBACK if parsing fails.
     * @returns {Promise<{r: number, g: number, b: number}>} RGB color object
     */
    async _getAppMenuSidebarThemeColor() {
        // When tone mode is explicitly forced, skip CSS reading and use constant directly.
        // CSS parsing reflects the active theme regardless of force override, so we must
        // bypass it to honour the user's explicit dark/light intent.
        const toneMode = this.extension.darkLightOverride || 'auto';
        if (toneMode !== 'auto') {
            const isDark = this.extension.themeDetector.isDarkModePreferred();
            this.debugLog(`_getAppMenuSidebarThemeColor: forced ${isDark ? 'dark (MINT_Y_DARK_FALLBACK)' : 'light (SIDEBAR_LIGHT_FALLBACK)'} (toneMode=${toneMode})`);
            return isDark ? DEFAULT_COLORS.MINT_Y_DARK_FALLBACK : DEFAULT_COLORS.SIDEBAR_LIGHT_FALLBACK;
        }

        try {
            const themeName = this.extension.themeDetector.getActiveGtkTheme();
            const themePaths = [
                `${GLib.get_home_dir()}/.local/share/themes/${themeName}`,
                `${GLib.get_home_dir()}/.themes/${themeName}`,
                `/usr/share/themes/${themeName}`,
                `/usr/local/share/themes/${themeName}`,
            ];

            for (const themePath of themePaths) {
                const cssPath = `${themePath}/cinnamon/cinnamon.css`;
                const cssFile = Gio.File.new_for_path(cssPath);

                const contents = await new Promise((resolve) => {
                    cssFile.load_contents_async(null, (source, result) => {
                        try {
                            const [success, data] = source.load_contents_finish(result);
                            resolve(success ? data : null);
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });

                if (!contents) continue;

                const cssText = new TextDecoder().decode(contents);
                const match = cssText.match(/\.appmenu-sidebar\s*\{[^}]*background-color\s*:\s*(#[0-9a-fA-F]{6})/);
                if (match) {
                    const hex = match[1].slice(1);
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    this.debugLog(`_getAppMenuSidebarThemeColor: found ${match[1]} in cinnamon.css`);
                    return { r, g, b };
                }
            }
        } catch (e) {
            this.debugLog(`_getAppMenuSidebarThemeColor: error reading theme CSS: ${e}`);
        }

        const isDark = this.extension.themeDetector.isDarkModePreferred();
        this.debugLog(`_getAppMenuSidebarThemeColor: fallback to ${isDark ? "MINT_Y_DARK_FALLBACK" : "SIDEBAR_LIGHT_FALLBACK"}`);
        return isDark ? DEFAULT_COLORS.MINT_Y_DARK_FALLBACK : DEFAULT_COLORS.SIDEBAR_LIGHT_FALLBACK;
    }
}

module.exports = PopupStyler;
