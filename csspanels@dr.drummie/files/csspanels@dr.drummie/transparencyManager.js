const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

/**
 * Transparency Manager handles panel styling and transparency effects
 * Manages all panel appearance with blur effects and opacity
 */
class TransparencyManager {
    /**
     * Initialize Transparency Manager
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.originalPanelStyles = {}; //Should contain more panels now
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
     * Get all available panels in the system
     * @returns {Array} Array of all panel actors with their IDs
     */
    getAllPanels() {
        let panels = [];

        // We keep the existing logic for the main panels (1 and 2)
        if (Main.panel && Main.panel.actor) {
            panels.push({
                id: "main",
                actor: Main.panel.actor,
                panel: Main.panel,
            });
            this.extension.debugLog("Found main panel");
        }

        if (Main.panel2 && Main.panel2.actor) {
            panels.push({
                id: "panel2",
                actor: Main.panel2.actor,
                panel: Main.panel2,
            });
            this.extension.debugLog("Found panel2");
        }

        // Search for additional panels in Main.panelManager or other Main properties
        try {
            // Check Main.panelManager if it exists (newer versions of Cinnamon)
            if (Main.panelManager && Main.panelManager.panels) {
                for (let panelId in Main.panelManager.panels) {
                    let panel = Main.panelManager.panels[panelId];
                    if (panel && panel.actor) {
                        // Check if it has already been added
                        let exists = panels.some((p) => p.actor === panel.actor);
                        if (!exists) {
                            panels.push({
                                id: `managed_${panelId}`,
                                actor: panel.actor,
                                panel: panel,
                            });
                            this.extension.debugLog(`Found managed panel: ${panelId}`);
                        }
                    }
                }
            }

            // Alternative approach - check all Main objects that start with 'panel'
            for (let key in Main) {
                if (key.startsWith("panel") && key !== "panel" && key !== "panel2" && Main[key] && Main[key].actor) {
                    // Check if it has already been added
                    let exists = panels.some((p) => p.actor === Main[key].actor);
                    if (!exists) {
                        panels.push({
                            id: key,
                            actor: Main[key].actor,
                            panel: Main[key],
                        });
                        this.extension.debugLog(`Found additional panel: ${key}`);
                    }
                }
            }
        } catch (e) {
            this.extension.debugLog("Error finding additional panels:", e);
        }

        this.extension.debugLog(`Total panels found: ${panels.length}`);
        return panels;
    }

    /**
     * Save original panel styles for restoration
     */
    saveOriginalStyles() {
        try {
            this.extension.debugLog("Saving original styles for all panels");

            // Get all panels and save their original styles
            let allPanels = this.getAllPanels();

            allPanels.forEach((panelInfo) => {
                if (panelInfo.actor) {
                    this.originalPanelStyles[panelInfo.id] = {
                        style: panelInfo.actor.get_style(),
                        backgroundColor: panelInfo.actor.get_background_color(),
                        styleClasses: panelInfo.actor.get_style_class_name(),
                    };
                    this.extension.debugLog(`Saved original styles for panel: ${panelInfo.id}`);
                }
            });

            this.extension.debugLog("All original styles saved");
        } catch (e) {
            this.extension.debugLog("Error saving original styles:", e);
        }
    }

    /**
     * Restore panels to their original styling
     */
    restoreOriginalStyles() {
        try {
            // Scan for all panels for cleanup
            let allPanels = this.getAllPanels();

            // Restore all panels from saved styles
            for (let panelId in this.originalPanelStyles) {
                let original = this.originalPanelStyles[panelId];

                // Try to find the panel again
                let panelActor = this.findPanelActorById(panelId);

                if (panelActor && original) {
                    panelActor.set_style(original.style || "");
                    if (original.backgroundColor) {
                        panelActor.set_background_color(original.backgroundColor);
                    } else {
                        panelActor.set_background_color(null);
                    }

                    if (original.styleClasses) {
                        panelActor.set_style_class_name(original.styleClasses);
                    }

                    // Remove our style classes
                    this.removeStyleClasses(panelActor);

                    this.extension.debugLog(`Restored original styles for panel: ${panelId}`);
                }
            }

            // Additional cleanup for any panels that were added after initial save
            allPanels.forEach((panelInfo) => {
                if (panelInfo.actor && !this.originalPanelStyles[panelInfo.id]) {
                    // Panel added after initial save - clean our styles
                    this.removeStyleClasses(panelInfo.actor);
                    panelInfo.actor.set_style("");
                    this.extension.debugLog(`Cleaned styles from additional panel: ${panelInfo.id}`);
                }
            });

            // Force theme refresh
            try {
                if (Main.themeManager && Main.themeManager._changeTheme) {
                    Main.themeManager._changeTheme();
                }
            } catch (e) {
                // Ignore errors during theme refresh
            }

            this.extension.debugLog("All original styles restored");
        } catch (e) {
            this.extension.debugLog("Error restoring original styles:", e);
        }
    }

    /**
     * Find panel actor by saved ID
     * @param {string} panelId - Saved panel ID
     * @returns {Clutter.Actor|null} Panel actor or null
     */
    findPanelActorById(panelId) {
        // Try to find the panel based on the ID
        if (panelId === "main" && Main.panel && Main.panel.actor) {
            return Main.panel.actor;
        }
        if (panelId === "panel2" && Main.panel2 && Main.panel2.actor) {
            return Main.panel2.actor;
        }

        // For other panels, try rescanning
        let allPanels = this.getAllPanels();
        let found = allPanels.find((p) => p.id === panelId);
        return found ? found.actor : null;
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
            this.extension.debugLog("Applying panel styles to all panels");
            this.extension.cssManager.updateAllVariables();

            // Get all panels and apply styles
            let allPanels = this.getAllPanels();
            allPanels.forEach((panelInfo, index) => {
                // FIX ATTEMPT: Skip hidden panels to avoid Monitor Constraint errors
                // seems that it is Cinnamon bug for auto-hidden panels
                if (!panelInfo.actor || !panelInfo.actor.visible) {
                    this.extension.debugLog(`Skipping hidden panel: ${panelInfo.id}`);
                    return;
                }

                this.extension.debugLog(`Applying styles to panel ${index + 1} (${panelInfo.id})`);
                this.applyPanelStyleToActor(panelInfo.actor);
            });

            this.extension.debugLog(`Panel styling applied successfully to ${allPanels.length} panels`);
        } catch (e) {
            this.extension.debugLog("Error applying panel styles:", e);
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
