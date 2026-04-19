const St = imports.gi.St;
const Main = imports.ui.main;
const StylerBase = require("./stylerBase");
const { TIMING, DEFAULT_COLORS } = require("./constants");

/**
 * Panel Styler handles panel transparency and blur effects
 * Manages all panel appearance with blur effects and opacity
 */
class PanelStyler extends StylerBase {
    /**
     * Initialize Panel Styler
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        super(extension, "PanelStyler");
        this.originalPanelStyles = {}; // Store original panel styles for restoration

        // Performance optimization - cache panel references
        this.panelCache = null;
        this.lastPanelCheck = 0;
        this.panelCacheTimeout = TIMING.CACHE_PANEL_CHECK;

        // Track override state to prevent unnecessary theme reloads
        this._lastOverrideState = null;

        // Map to save original sub-box inline styles for restoration
        this._savedSubBoxStyles = new Map();
    }

    /**
     * Enable panel styling
     */
    enable() {
        super.enable();
        this.saveOriginalStyles();
        this.applyPanelStyles();
    }

    /**
     * Disable panel styling
     */
    disable() {
        this.restoreOriginalStyles();
        super.disable();
    }

    /**
     * Refresh panel styling when settings change
     */
    refresh() {
        super.refresh();
        this.applyPanelStyles();
    }

    /**
     * Get all available panels in the system with caching
     * @returns {Array} Array of all panel actors with their IDs
     */
    getAllPanels() {
        const now = Date.now();

        // Return cached result if still valid
        if (this.panelCache && now - this.lastPanelCheck < this.panelCacheTimeout) {
            return this.panelCache;
        }

        let panels = [];

        // We keep the existing logic for the main panels (1 and 2)
        if (Main.panel && Main.panel.actor) {
            panels.push({
                id: "main",
                actor: Main.panel.actor,
                panel: Main.panel,
            });
            this.debugLog("Found main panel");
        }

        if (Main.panel2 && Main.panel2.actor) {
            panels.push({
                id: "panel2",
                actor: Main.panel2.actor,
                panel: Main.panel2,
            });
            this.debugLog("Found panel2");
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
                            this.debugLog(`Found managed panel: ${panelId}`);
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
                        this.debugLog(`Found additional panel: ${key}`);
                    }
                }
            }
        } catch (e) {
            this.debugLog("Error finding additional panels:", e);
        }

        this.debugLog(`Total panels found: ${panels.length}`);

        // Cache the result
        this.panelCache = panels;
        this.lastPanelCheck = now;

        return panels;
    }

    /**
     * Invalidate panel cache when panels change
     */
    invalidatePanelCache() {
        this.panelCache = null;
        this.lastPanelCheck = 0;

        // Also clear saved original styles on theme change (but NOT during disable)
        // This ensures we get fresh original styles from the new theme
        if (this.isEnabled) {
            this.originalPanelStyles = {};
            this.debugLog("Panel cache AND original styles invalidated (theme change)");
        } else {
            this.debugLog("Panel cache invalidated");
        }
    }
    /**
     * Save original panel styles for restoration
     */
    saveOriginalStyles() {
        try {
            this.debugLog("Saving original styles for all panels");

            // Get all panels and save their original styles
            let allPanels = this.getAllPanels();

            allPanels.forEach((panelInfo) => {
                if (panelInfo.actor) {
                    // GUARD CHECK: Only save if not already saved
                    // This prevents overwriting true originals with our modified styles
                    if (!this.originalPanelStyles[panelInfo.id]) {
                        this.originalPanelStyles[panelInfo.id] = {
                            style: panelInfo.actor.get_style(),
                            backgroundColor: panelInfo.actor.get_background_color(),
                            styleClasses: panelInfo.actor.get_style_class_name(),
                        };
                        this.debugLog(`Saved original styles for panel: ${panelInfo.id}`);
                    } else {
                        this.debugLog(`Panel ${panelInfo.id} already has saved styles - skipping to preserve original`);
                    }
                }
            });

            this.debugLog("All original styles saved");
        } catch (e) {
            this.debugLog("Error saving original styles:", e);
        }
    }

    /**
     * Restore panels to their original styling
     * @param {boolean} skipThemeRefresh - Skip _changeTheme() call when re-applying immediately after (default: false)
     */
    restoreOriginalStyles(skipThemeRefresh = false) {
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

                    this.debugLog(`Restored original styles for panel: ${panelId}`);
                }
            }

            // Additional cleanup for any panels that were added after initial save
            allPanels.forEach((panelInfo) => {
                if (panelInfo.actor && !this.originalPanelStyles[panelInfo.id]) {
                    // Panel added after initial save - clean our styles
                    this.removeStyleClasses(panelInfo.actor);
                    panelInfo.actor.set_style("");
                    this.debugLog(`Cleaned styles from additional panel: ${panelInfo.id}`);
                }
            });

            // Restore panel sub-box backgrounds
            if (this._savedSubBoxStyles && this._savedSubBoxStyles.size > 0) {
                for (const [box, style] of this._savedSubBoxStyles) {
                    try {
                        box.set_style(style);
                    } catch (e) {
                        this.debugLog("PanelStyler: error restoring sub-box style: " + e.message);
                    }
                }
                this._savedSubBoxStyles.clear();
            }

            // Force theme refresh only on actual disable (not during re-apply cycles)
            try {
                if (!skipThemeRefresh && Main.themeManager && Main.themeManager._changeTheme) {
                    Main.themeManager._changeTheme();
                }
            } catch (e) {
                // Ignore errors during theme refresh
            }

            this.debugLog("All original styles restored");
        } catch (e) {
            this.debugLog("Error restoring original styles:", e);
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
            this.debugLog("Applying panel styles to all panels");

            // CRITICAL FIX: Restore original styles FIRST before applying new ones
            // This ensures we start from clean theme state, not our previous modifications
            if (Object.keys(this.originalPanelStyles).length > 0) {
                this.debugLog("Restoring to clean theme state before applying new styles");
                this.restoreOriginalStyles(true); // skip _changeTheme(): re-applying immediately after

                // Clear saved originals so we can save fresh ones
                this.originalPanelStyles = {};
                this._savedSubBoxStyles.clear();
            }

            // Now save the CLEAN original styles from theme
            this.saveOriginalStyles();

            // Update CSS variables with current settings
            this.extension.cssManager.updateAllVariables();

            // Prepare panel color once before applying to all panels
            // Use BLACK BOX pattern: getCurrentPanelColor() handles override logic
            let panelColor;
            if (this.extension.overridePanelColor) {
                // Use safe parser via ThemeDetector for user-provided override color
                panelColor = this.extension.themeDetector._safeParseColor(
                    this.extension.chooseOverridePanelColor,
                    DEFAULT_COLORS.MINT_Y_DARK_FALLBACK,
                    "panel override (panelStyler)"
                );
                this.debugLog("Using override panel color:", this.extension.chooseOverridePanelColor);
            } else {
                // getCurrentPanelColor() returns a CSS string — normalize to {r,g,b} object
                const panelColorRaw = this.extension.themeDetector.getCurrentPanelColor();
                panelColor = this.extension.themeDetector._safeParseColor(
                    panelColorRaw,
                    DEFAULT_COLORS.MINT_Y_DARK_FALLBACK,
                    "panel color (detected)"
                );
                this.debugLog(
                    "Using detected panel color:",
                    `rgb(${panelColor.r}, ${panelColor.g}, ${panelColor.b})`
                );
            }

            // Get all panels and apply styles
            let allPanels = this.getAllPanels();
            allPanels.forEach((panelInfo, index) => {
                if (panelInfo.actor) {
                    this.debugLog(`Applying styles to panel ${index + 1}/${allPanels.length}: ${panelInfo.id}`);
                    this.applyPanelStyleToActor(panelInfo.actor, panelColor);
                    this._clearSubBoxBackgrounds(panelInfo.panel);
                } else {
                    this.debugLog(`Warning: Panel ${panelInfo.id} has no actor`);
                }
            });

            this.debugLog(`Panel styling applied successfully to ${allPanels.length} panels`);
        } catch (e) {
            this.debugLog("Error applying panel styles:", e);
        }
    }

    /**
     * Apply styling to a specific panel actor - SINGLE ACTOR approach
     * Applies CSS directly to panel.actor without creating additional layers
     *
     * @param {Clutter.Actor} actor - The panel actor to style
     * @param {Object} panelColor - The panel color to use (RGB object)
     */
    applyPanelStyleToActor(actor, panelColor) {
        if (!actor) return;

        let effectiveBorderRadius = this.extension.cssManager.getEffectiveBorderRadius();
        let radius = this.extension.applyPanelRadius ? effectiveBorderRadius : 0;

        this.debugLog("Applying DIRECT styling to panel.actor (single-actor approach)");

        // Build configuration object for template generation
        const config = {
            backgroundColor: `rgba(${panelColor.r}, ${panelColor.g}, ${panelColor.b}, ${this.extension.panelOpacity})`,
            borderRadius: radius,
            blurRadius: this.extension.blurRadius,
            blurSaturate: this.extension.blurSaturate,
            blurContrast: this.extension.blurContrast,
            blurBrightness: this.extension.blurBrightness,
            borderColor: this.extension.blurBorderColor,
            borderWidth: this.extension.blurBorderWidth,
            transition: this.extension.blurTransition,
        };

        // Generate CSS and apply DIRECTLY to panel.actor
        const css = this.extension.blurTemplateManager.generatePanelCSS(config);
        actor.set_style(css);

        this.debugLog(`Direct panel styling applied with opacity ${this.extension.panelOpacity}`);
        this.debugLog(`Panel color: rgb(${panelColor.r}, ${panelColor.g}, ${panelColor.b})`);
        this.debugLog(
            `Border: ${this.extension.blurBorderWidth}px, Radius: ${radius}px, Blur: ${this.extension.blurRadius}px`
        );

        // Log cache stats periodically (every 10th call)
        if (Math.random() < 0.1) {
            this.extension.blurTemplateManager.logCacheStats();
        }
    }

    /**
     * Clear background styles on panel sub-boxes to prevent theme bleed-through.
     * Saves originals for restoration on disable.
     * @param {Object} panel - Cinnamon panel object with _leftBox/_centerBox/_rightBox
     */
    _clearSubBoxBackgrounds(panel) {
        if (!panel) return;
        const subBoxes = [panel._leftBox, panel._centerBox, panel._rightBox].filter(Boolean);
        for (const box of subBoxes) {
            if (!this._savedSubBoxStyles.has(box)) {
                this._savedSubBoxStyles.set(box, box.get_style() || null);
            }
            const existingStyle = box.get_style() || '';
            const cleaned = existingStyle
                .replace(/background-color\s*:[^;]+;?/g, '')
                .replace(/background-gradient-direction\s*:[^;]+;?/g, '')
                .replace(/background-gradient-start\s*:[^;]+;?/g, '')
                .replace(/background-gradient-end\s*:[^;]+;?/g, '')
                .replace(/background\s*:[^;]+;?/g, '')
                .trim();
            const sep = cleaned.length > 0 && !cleaned.endsWith(';') ? '; ' : (cleaned.length > 0 ? ' ' : '');
            box.set_style(cleaned + sep + 'background: transparent !important; background-gradient-direction: none !important;');
        }
    }
}

module.exports = PanelStyler;
