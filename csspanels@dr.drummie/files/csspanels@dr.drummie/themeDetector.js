const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

/**
 * Theme Detector handles theme color and border-radius detection
 * Provides auto-detection capabilities for consistent theming
 */
class ThemeDetector {
    /**
     * Initialize Theme Detector
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.cachedPanelColor = null;
        this.cachedMenuColor = null;
        this.cachedBorderRadius = null;
        this.cachedPopupColor = null;
        this.lastThemeCheck = 0;
        this.lastBorderRadiusCheck = 0;
        this.themeChangeId = null;
    }

    /**
     * Setup theme change monitoring
     */
    setup() {
        try {
            if (Main.themeManager) {
                this.themeChangeId = Main.themeManager.connect("theme-changed", () => {
                    this.extension.debugLog("Theme changed, re-detecting settings...");
                    this.invalidateCache();

                    if (this.extension.autoDetectRadius) {
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            this.extension.onAutoDetectRadiusChanged();
                            return false;
                        });
                    }

                    this.extension.cssManager.updateAllVariables();
                    this.extension.transparencyManager.applyPanelStyles();
                });

                this.extension.debugLog("Theme change handler setup successfully");
            }
        } catch (e) {
            this.extension.debugLog("Failed to setup theme change handler:", e);
        }
    }

    /**
     * Invalidate all cached values
     */
    invalidateCache() {
        this.cachedPanelColor = null;
        this.cachedMenuColor = null;
        this.cachedBorderRadius = null;
        this.cachedPopupColor = null;
        this.lastThemeCheck = 0;
        this.lastBorderRadiusCheck = 0;
    }

    /**
     * Cleanup theme change monitoring
     */
    cleanup() {
        if (this.themeChangeId && Main.themeManager) {
            try {
                Main.themeManager.disconnect(this.themeChangeId);
                this.themeChangeId = null;
                this.extension.debugLog("Theme change handler cleaned up");
            } catch (e) {
                this.extension.debugLog("Error cleaning up theme change handler:", e);
            }
        }
    }

    /**
     * Parse color string (rgba or hex) to RGB object
     * @param {string} colorString - Color string in rgba(r,g,b,a) or #hex format
     * @returns {Object} RGB color object with r, g, b properties
     */
    parseColorString(colorString) {
        try {
            // Handle rgba format: rgba(r, g, b, a)
            if (colorString.startsWith("rgba(")) {
                const values = colorString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
                if (values) {
                    return {
                        r: parseInt(values[1]),
                        g: parseInt(values[2]),
                        b: parseInt(values[3]),
                    };
                }
            }

            // Handle rgb format: rgb(r, g, b)
            if (colorString.startsWith("rgb(")) {
                const values = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (values) {
                    return {
                        r: parseInt(values[1]),
                        g: parseInt(values[2]),
                        b: parseInt(values[3]),
                    };
                }
            }

            // Handle hex format: #rrggbb
            if (colorString.startsWith("#")) {
                const hex = colorString.slice(1);
                if (hex.length === 6) {
                    return {
                        r: parseInt(hex.slice(0, 2), 16),
                        g: parseInt(hex.slice(2, 4), 16),
                        b: parseInt(hex.slice(4, 6), 16),
                    };
                }
            }

            this.extension.debugLog("Failed to parse color string:", colorString);
            return { r: 128, g: 128, b: 128 };
        } catch (e) {
            this.extension.debugLog("Error parsing color string:", e);
            return { r: 128, g: 128, b: 128 };
        }
    }

    /**
     * Detect panel base color from current theme
     * @returns {Object} RGB color object with r, g, b properties
     */
    getPanelBaseColor() {
        // Use override color if enabled
        if (this.extension.overridePanelColor) {
            this.extension.debugLog("Using panel override color:", this.extension.chooseOverridePanelColor);
            return this.parseColorString(this.extension.chooseOverridePanelColor);
        }

        // Cache panel color for 2 seconds to avoid redundant detection
        if (this.cachedPanelColor !== null && Date.now() - this.lastThemeCheck < 2000) {
            return this.cachedPanelColor;
        }

        try {
            this.extension.debugLog("Detecting panel base color...");

            if (Main.panel.actor && Main.panel.actor.get_theme_node) {
                let themeNode = Main.panel.actor.get_theme_node();
                let backgroundColor = themeNode.get_background_color();

                if (backgroundColor) {
                    let color = {
                        r: backgroundColor.red,
                        g: backgroundColor.green,
                        b: backgroundColor.blue,
                    };

                    this.extension.debugLog(`Detected panel color: rgb(${color.r}, ${color.g}, ${color.b})`);
                    this.cachedPanelColor = color;
                    this.lastThemeCheck = Date.now();
                    return color;
                }
            }

            // Fallback to dark color for most themes
            this.extension.debugLog("Using fallback panel color: rgb(46, 52, 64)");
            this.cachedPanelColor = { r: 46, g: 52, b: 64 };
            this.lastThemeCheck = Date.now();
            return this.cachedPanelColor;
        } catch (e) {
            this.extension.debugLog("Error detecting panel color:", e);
            this.cachedPanelColor = { r: 46, g: 52, b: 64 };
            this.lastThemeCheck = Date.now();
            return this.cachedPanelColor;
        }
    }

    /**
     * Detect border-radius from current theme by inspecting UI elements
     * @returns {number} Detected border radius in pixels
     */
    detectThemeBorderRadius() {
        // Cache border-radius for 1 second
        if (this.cachedBorderRadius !== null && Date.now() - this.lastBorderRadiusCheck < 1000) {
            return this.cachedBorderRadius;
        }

        try {
            this.extension.debugLog("Detecting theme border-radius...");

            let detectedRadii = [];

            // Check main panel first
            let panelRadius = this.getElementBorderRadius(Main.panel.actor);
            detectedRadii.push(panelRadius);
            if (panelRadius > 0) {
                this.extension.debugLog(`Detected panel border-radius: ${panelRadius}px`);
                this.cachedBorderRadius = panelRadius;
                this.lastBorderRadiusCheck = Date.now();
                return panelRadius;
            }

            // Check popup menus
            let menuRadius = this.getMenuBorderRadius();
            detectedRadii.push(menuRadius);
            if (menuRadius > 0) {
                this.extension.debugLog(`Detected menu border-radius: ${menuRadius}px`);
                this.cachedBorderRadius = menuRadius;
                this.lastBorderRadiusCheck = Date.now();
                return menuRadius;
            }

            // Check notification area
            let notificationRadius = this.getNotificationBorderRadius();
            detectedRadii.push(notificationRadius);
            if (notificationRadius > 0) {
                this.extension.debugLog(`Detected notification border-radius: ${notificationRadius}px`);
                this.cachedBorderRadius = notificationRadius;
                this.lastBorderRadiusCheck = Date.now();
                return notificationRadius;
            }

            // Check if theme is truly flat
            let allZero = detectedRadii.every((radius) => radius === 0);
            if (allZero) {
                this.extension.debugLog("Theme uses flat design, not applying border radius");
                this.cachedBorderRadius = 0;
                this.lastBorderRadiusCheck = Date.now();
                return 0;
            }

            // Use fallback value
            this.extension.debugLog(
                `Detection inconsistency, using fallback border-radius: ${this.extension.borderRadius}px`
            );
            this.cachedBorderRadius = this.extension.borderRadius;
            this.lastBorderRadiusCheck = Date.now();
            return this.cachedBorderRadius;
        } catch (e) {
            this.extension.debugLog("Error detecting theme border-radius:", e);
            this.cachedBorderRadius = this.extension.borderRadius;
            this.lastBorderRadiusCheck = Date.now();
            return this.extension.borderRadius;
        }
    }

    /**
     * Extract border-radius value from a Clutter.Actor element
     * @param {Clutter.Actor} actor - The actor to inspect
     * @returns {number} Border radius in pixels
     */
    getElementBorderRadius(actor) {
        if (!actor || !actor.get_theme_node) return 0;

        try {
            let themeNode = actor.get_theme_node();
            let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
            this.extension.debugLog(`Element border-radius: ${radius}px`);
            return Math.round(radius);
        } catch (e) {
            this.extension.debugLog("Failed to get element border-radius:", e);
            return 0;
        }
    }

    /**
     * Detect border-radius from popup menus
     * @returns {number} Menu border radius in pixels
     */
    getMenuBorderRadius() {
        try {
            this.extension.debugLog("Attempting menu border-radius detection...");

            // Check existing menu elements first
            let menuManager = Main.panel.menuManager;
            if (menuManager && menuManager._menus && menuManager._menus.length > 0) {
                let existingMenu = menuManager._menus[0];
                if (existingMenu && existingMenu.actor) {
                    let radius = this.getElementBorderRadius(existingMenu.actor);
                    if (radius > 0) {
                        this.extension.debugLog(`Found menu radius from menuManager: ${radius}px`);
                        return radius;
                    }
                }
            }

            // Fallback: check panel elements
            if (Main.panel._leftBox && Main.panel._leftBox.get_children().length > 0) {
                let firstButton = Main.panel._leftBox.get_children()[0];
                if (firstButton) {
                    let radius = this.getElementBorderRadius(firstButton);
                    if (radius > 0) {
                        this.extension.debugLog(`Found radius from panel button: ${radius}px`);
                        return radius;
                    }
                }
            }

            this.extension.debugLog("No menu border-radius detected");
            return 0;
        } catch (e) {
            this.extension.debugLog("Menu border-radius detection failed:", e.message);
            return 0;
        }
    }

    /**
     * Detect border-radius from notification area elements
     * @returns {number} Notification border radius in pixels
     */
    getNotificationBorderRadius() {
        try {
            // Check if notification area exists
            if (Main.messageTray && Main.messageTray.actor) {
                return this.getElementBorderRadius(Main.messageTray.actor);
            }

            // Check system indicators
            if (Main.panel.statusArea) {
                for (let indicator in Main.panel.statusArea) {
                    let statusActor = Main.panel.statusArea[indicator];
                    if (statusActor && statusActor.actor) {
                        let radius = this.getElementBorderRadius(statusActor.actor);
                        if (radius > 0) return radius;
                    }
                }
            }

            return 0;
        } catch (e) {
            this.extension.debugLog("Notification border-radius detection failed:", e);
            return 0;
        }
    }
}

module.exports = ThemeDetector;
