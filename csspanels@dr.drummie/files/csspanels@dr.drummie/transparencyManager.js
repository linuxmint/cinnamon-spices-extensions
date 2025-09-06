const St = imports.gi.St;
const Main = imports.ui.main;

/**
 * Transparency Manager handles panel styling and transparency effects
 * Manages the main panel appearance with blur effects and opacity
 */
class TransparencyManager {
    /**
     * Initialize Transparency Manager
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.originalPanelStyles = {};
    }

    /**
     * Enable transparency management
     */
    enable() {
        this.saveOriginalStyles();
        this.applyPanelStyles();
    }

    /**
     * Disable transparency management and restore original styles
     */
    disable() {
        this.restoreOriginalStyles();
    }

    /**
     * Save original panel styles for restoration
     */
    saveOriginalStyles() {
        try {
            this.extension.debugLog("Saving original styles");

            if (Main.panel.actor) {
                this.originalPanelStyles.panel = {
                    style: Main.panel.actor.get_style(),
                    backgroundColor: Main.panel.actor.get_background_color(),
                    styleClasses: Main.panel.actor.get_style_class_name(),
                };
            }

            if (Main.panel2 && Main.panel2.actor) {
                this.originalPanelStyles.panel2 = {
                    style: Main.panel2.actor.get_style(),
                    backgroundColor: Main.panel2.actor.get_background_color(),
                    styleClasses: Main.panel2.actor.get_style_class_name(),
                };
            }

            this.extension.debugLog("Original styles saved");
        } catch (e) {
            this.extension.debugLog("Error saving original styles:", e);
        }
    }

    /**
     * Restore panels to their original styling
     */
    restoreOriginalStyles() {
        try {
            if (Main.panel.actor && this.originalPanelStyles.panel) {
                let original = this.originalPanelStyles.panel;

                Main.panel.actor.set_style(original.style || "");
                if (original.backgroundColor) {
                    Main.panel.actor.set_background_color(original.backgroundColor);
                } else {
                    Main.panel.actor.set_background_color(null);
                }
                if (original.styleClasses) Main.panel.actor.set_style_class_name(original.styleClasses);

                // Remove our style classes
                this.removeStyleClasses(Main.panel.actor);
            }

            if (Main.panel2 && Main.panel2.actor && this.originalPanelStyles.panel2) {
                let original = this.originalPanelStyles.panel2;

                Main.panel2.actor.set_style(original.style || "");
                if (original.backgroundColor) {
                    Main.panel2.actor.set_background_color(original.backgroundColor);
                } else {
                    Main.panel2.actor.set_background_color(null);
                }
                if (original.styleClasses) Main.panel2.actor.set_style_class_name(original.styleClasses);

                // Remove our style classes
                this.removeStyleClasses(Main.panel2.actor);
            }

            // Force theme refresh
            try {
                if (Main.themeManager && Main.themeManager._changeTheme) {
                    Main.themeManager._changeTheme();
                }
            } catch (e) {
                // Ignore errors during theme refresh
            }

            this.extension.debugLog("Original styles restored");
        } catch (e) {
            this.extension.debugLog("Error restoring original styles:", e);
        }
    }

    /**
     * Remove our style classes from an actor
     * @param {Clutter.Actor} actor - Actor to clean up
     */
    removeStyleClasses(actor) {
        const classesToRemove = [
            "transparency-panel-blur",
            "blur-double",
            "blur-triple",
            "blur-enhanced",
            "transparency-glass-effect",
            "transparency-fallback-blur",
        ];

        classesToRemove.forEach((className) => {
            actor.remove_style_class_name(className);
        });
    }

    /**
     * Apply transparency and blur effects to all panels
     */
    applyPanelStyles() {
        try {
            this.extension.debugLog("Applying panel styles");
            this.extension.cssManager.updateAllVariables();

            // Apply styling to both panels
            this.applyPanelStyleToActor(Main.panel.actor);
            if (Main.panel2 && Main.panel2.actor) {
                this.applyPanelStyleToActor(Main.panel2.actor);
            }

            this.extension.debugLog("Panel styling applied successfully");
        } catch (e) {
            this.extension.debugLog("Error applying panel style:", e);
        }
    }

    /**
     * Apply styling to a specific panel actor
     * @param {Clutter.Actor} actor - The panel actor to style
     */
    applyPanelStyleToActor(actor) {
        if (!actor) return;

        // Use override color if enabled, otherwise restore original and detect fresh
        let panelColor;
        if (this.extension.overridePanelColor) {
            panelColor = this.extension.themeDetector.parseColorString(this.extension.chooseOverridePanelColor);
        } else {
            // Temporarily restore original styles completely to get clean detection
            this.restoreOriginalStyles();
            // Force cache invalidation to ensure fresh detection
            this.extension.themeDetector.invalidateCache();
            panelColor = this.extension.themeDetector.getPanelBaseColor();
            this.extension.debugLog(
                `Fresh detected color after restore: rgb(${panelColor.r}, ${panelColor.g}, ${panelColor.b})`
            );
        }

        let effectiveBorderRadius = this.extension.cssManager.getEffectiveBorderRadius();
        let radius = this.extension.applyPanelRadius ? effectiveBorderRadius : 0;

        this.extension.debugLog("Applying blur effects to panel actor");

        // Add CSS blur class for advanced backdrop-filter effects
        actor.add_style_class_name("transparency-panel-blur");
        actor.add_style_class_name("profile-custom");

        // Add fallback class if backdrop-filter is not supported
        if (!this.extension.cssManager.hasBackdropFilter) {
            actor.add_style_class_name("transparency-fallback-blur");
        }

        // Add advanced filter effects if supported
        if (this.extension.cssManager.hasAdvancedFilters) {
            actor.add_style_class_name("blur-enhanced");
        }

        // Apply inline styles directly
        let backdropFilter = `blur(${this.extension.blurRadius}px) saturate(${this.extension.blurSaturate}) contrast(${this.extension.blurContrast}) brightness(${this.extension.blurBrightness})`;

        let panelStyle = `
            background-color: rgba(${panelColor.r}, ${panelColor.g}, ${panelColor.b}, ${this.extension.panelOpacity}) !important;
            backdrop-filter: ${backdropFilter} !important;
            -webkit-backdrop-filter: ${backdropFilter} !important;
            opacity: ${this.extension.blurOpacity} !important;
            border-radius: ${radius}px !important;
            border: ${this.extension.blurBorderWidth}px solid ${this.extension.blurBorderColor} !important;
        `;

        actor.set_style(panelStyle);
    }
}

module.exports = TransparencyManager;
