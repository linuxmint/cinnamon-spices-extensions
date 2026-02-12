const St = imports.gi.St;
const Main = imports.ui.main;
const StylerBase = require("./stylerBase");

/**
 * OSD Styler handles On-Screen Display transparency and blur effects (NEW)
 * Applies glass morphism effects to volume, brightness, and other OSD elements
 */
class OSDStyler extends StylerBase {
    /**
     * Initialize OSD Styler
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        super(extension, "OSDStyler");
        this.originalOSDStyles = new Map();
        this.osdConnections = [];
        this.monitoredElements = new Set();
        this.originalShow = null;
        this.styledOSDs = new Set(); // Cache styled OSDs to avoid re-styling
    }

    /**
     * Apply monkeypatch to OSD manager for OSD styling
     */
    applyMonkeyPatch() {
        try {
            // Try multiple import paths for OSD in Cinnamon 22.1
            let OSDWindow;
            try {
                OSDWindow = imports.ui.osdWindow.OSDWindow;
            } catch (e) {
                try {
                    OSDWindow = imports.ui.osdWindow;
                } catch (e2) {
                    // Fallback to global objects
                    OSDWindow = Main.osdWindowManager || Main.osdWindow;
                }
            }
            if (OSDWindow && typeof OSDWindow.show === "function") {
                this.originalShow = OSDWindow.show;
                OSDWindow.show = this._patchedShow.bind(this);
                this.debugLog("OSD monkeypatch applied successfully");
            } else {
                this.debugLog("OSDWindow not found, using monitoring fallback");
                // Fallback handled in setupOSDMonitoring
            }
        } catch (e) {
            this.debugLog("Failed to apply OSD monkeypatch:", e);
            // Add detailed error logging for debugging
            if (e.message) {
                this.debugLog("Error message:", e.message);
            }
            if (e.stack) {
                this.debugLog("Error stack:", e.stack);
            }
            // Fallback to monitoring
            this.setupOSDMonitoring();
        }
    }

    /**
     * Patched OSD show with custom styling
     * @param {Object} monitorIndex - Monitor index
     * @param {string} icon - OSD icon
     * @param {string} label - OSD label
     * @param {number} level - OSD level
     */
    _patchedShow(monitorIndex, icon, label, level) {
        const result = this.originalShow.call(this, monitorIndex, icon, label, level);
        this.applyOSDStyles(this);
        return result;
    }

    /**
     * Apply styles to OSD
     * @param {Object} osd - OSD object
     */
    applyOSDStyles(osd) {
        if (!osd || !osd.actor) return;

        const actor = osd.actor;
        const template = this.extension.blurTemplateManager.getTemplate(
            this.extension.settings.getValue("blur-template")
        );
        if (!template) return;

        // Apply blur background
        actor.add_style_class_name("osd-blur");
        this.extension.cssManager.updateOSDVariables(actor, template);
    }

    /**
     * Enable OSD styling
     */
    enable() {
        super.enable();
        if (!this.extension.enableOSDStyling) {
            this.debugLog("OSD styling disabled in settings");
            return;
        }

        try {
            this.applyMonkeyPatch();
            this.setupOSDMonitoring();
            // Initial search done in setupOSDMonitoring - avoid duplicate call
            this.debugLog("OSD styler enabled");
        } catch (e) {
            this.debugLog("Error enabling OSD styler:", e);
            // Add detailed error logging for debugging
            if (e.message) {
                this.debugLog("Error message:", e.message);
            }
            if (e.stack) {
                this.debugLog("Error stack:", e.stack);
            }
        }
    }

    /**
     * Disable OSD styling
     */
    disable() {
        this.debugLog("OSDStyler: Starting disable cleanup");
        try {
            this.restoreAllOSDs();
            this.cleanupConnections();
            this.styledOSDs.clear();
            this.originalOSDStyles.clear();
            this.monitoredElements.clear();
            this.debugLog("OSDStyler: Disable cleanup completed");
        } catch (e) {
            this.debugLog("Error disabling OSD styler:", e);
        }
        super.disable();
    }

    /**
     * Setup CSS-based monitoring for OSD elements
     */
    setupOSDMonitoring() {
        this.debugLog("Setting up CSS-based OSD monitoring");

        // Monitor global stage for new OSD elements
        if (global.stage) {
            this.stageConnection = global.stage.connect("actor-added", (stage, actor) => {
                if (this.isOSDElementByCSS(actor) && !this.styledOSDs.has(actor)) {
                    this.debugLog("Detected new OSD via CSS monitoring");
                    imports.mainloop.timeout_add(50, () => {
                        this.styleOSDElement(actor, "css-found-osd");
                        return false;
                    });
                }
            });
        }

        // Initial search for existing OSDs
        this.findAndStyleOSDsByCSS();
    }

    /**
     * Find and style OSD elements using CSS classes (one-time search)
     */
    findAndStyleOSDsByCSS() {
        this.debugLog("Searching for OSD CSS classes...");

        // Search in main UI locations for OSD elements
        const searchLocations = [global.stage, Main.layoutManager.uiGroup, Main.layoutManager.modalDialogGroup];

        let totalFound = 0;
        searchLocations.forEach((location) => {
            if (location) {
                const found = this.searchForOSDActorsByCSS(location, 0);
                totalFound += found;
            }
        });

        this.debugLog(`CSS-based OSD search found ${totalFound} OSDs`);
        // No periodic repeat - elements are styled once
    }

    /**
     * Search for OSD actors using CSS classes
     * @param {Clutter.Actor} actor - Actor to search in
     * @param {number} depth - Current search depth
     * @returns {number} Number of OSDs found
     */
    searchForOSDActorsByCSS(actor, depth = 0) {
        if (!actor || depth > 6) return 0; // Limit search depth

        let foundCount = 0;

        try {
            // Check if this looks like an OSD using CSS classes
            if (this.isOSDElementByCSS(actor)) {
                foundCount++;
                this.styleOSDElement(actor, "css-found-osd");
                this.debugLog(`Found OSD by CSS: ${actor.get_style_class_name()}`);
                return foundCount; // Don't search children of OSDs
            }

            // Search children
            if (actor.get_children) {
                actor.get_children().forEach((child) => {
                    foundCount += this.searchForOSDActorsByCSS(child, depth + 1);
                });
            }
        } catch (e) {
            // Silent fail for individual actors
        }

        return foundCount;
    }

    /**
     * Check if actor is an OSD element using CSS classes
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if OSD element
     */
    isOSDElementByCSS(actor) {
        if (!actor) return false;

        try {
            const styleClass = (actor.get_style_class_name && actor.get_style_class_name()) || "";

            // Use regex for faster CSS class matching
            const wrapperRegex = /(media-keys-osd|info-osd|osd-window|osd-container|osd|on-screen-display)/;
            const contentRegex = /(volume-osd|brightness-osd|popup-slider|sound-slider|level-bar)/;

            const hasWrapperClass = wrapperRegex.test(styleClass);
            const hasContentClass = contentRegex.test(styleClass);

            if (hasWrapperClass || hasContentClass) {
                // Validate dimensions to avoid false positives
                const width = actor.get_width ? actor.get_width() : 0;
                const height = actor.get_height ? actor.get_height() : 0;

                // Reasonable OSD dimensions (relaxed height for wrapper elements)
                return width >= 50 && width <= 800 && height >= 20 && height <= 400;
            }

            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Setup general system key monitoring for OSD triggers
     */
    setupKeyMonitoring() {
        try {
            // Monitor for media keys that trigger OSDs
            if (global.display) {
                this.lastKeyTrigger = 0; // Debounce timestamp
                this.keyConnection = global.display.connect(
                    "accelerator-activated",
                    (display, action, deviceId, timestamp) => {
                        // Check if this is a volume or brightness key
                        if (action && (action.includes("volume") || action.includes("brightness"))) {
                            const now = Date.now();
                            if (now - this.lastKeyTrigger > 500) {
                                // Debounce 500ms
                                this.lastKeyTrigger = now;
                                this.debugLog(`Media key detected: ${action}`);
                                // Trigger CSS-based search only if needed, without periodic repeat
                                this.findAndStyleOSDsByCSS();
                            }
                        }
                    }
                );
                this.osdConnections.push({ obj: global.display, id: this.keyConnection });
            }
        } catch (e) {
            this.debugLog("Could not setup key monitoring:", e);
        }
    }

    /**
     * Apply styling to an OSD element
     * @param {Clutter.Actor|Object} element - OSD element to style
     * @param {string} type - Type of OSD element (for logging)
     */
    styleOSDElement(element, type = "osd") {
        let actor = element.actor || element;

        if (!actor || this.originalOSDStyles.has(actor) || this.styledOSDs.has(actor)) {
            return; // Already styled or invalid
        }

        try {
            this.debugLog(`Styling OSD element: ${type}`);

            // Save original styling
            let originalData = {
                style: actor.get_style(),
                backgroundColor: actor.get_background_color ? actor.get_background_color() : null,
                styleClasses: actor.get_style_class_name(),
                opacity: actor.get_opacity(),
            };

            this.originalOSDStyles.set(actor, originalData);
            this.monitoredElements.add(actor);

            // Get colors for styling
            let panelColor = this.extension.themeDetector.getPanelBaseColor();
            let osdColor = this.getOSDColor(panelColor);

            // Apply common blur styling with OSD-specific additional styles
            const additionalStyles = `
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.15) !important;
                border: ${Math.max(this.extension.blurBorderWidth, 2)}px solid ${
                this.extension.blurBorderColor
            } !important;
                transition: all 0.2s ease !important;
            `;

            this.applyCommonBlurStyling(
                actor,
                osdColor,
                this.extension.menuOpacity,
                this.getAdjustedBlurRadius("osd"),
                this.getAdjustedBorderRadius("osd"),
                this.extension.blurBorderColor,
                Math.max(this.extension.blurBorderWidth, 2),
                "osd",
                additionalStyles
            );

            // Mark as styled to avoid re-styling
            this.styledOSDs.add(actor);

            this.debugLog(`Successfully styled ${type} OSD`);
        } catch (e) {
            this.debugLog(`Error styling OSD element ${type}:`, e);
        }
    }

    /**
     * Get OSD color based on settings and theme
     * @param {Object} panelColor - Current panel color
     * @returns {Object} Color object for OSDs
     */
    getOSDColor(panelColor) {
        // Use popup color settings for OSDs as they are UI overlay elements
        if (this.extension.overridePopupColor) {
            return this.extension.themeDetector.parseColorString(this.extension.chooseOverridePopupColor);
        } else if (this.extension.overridePanelColor) {
            return this.extension.themeDetector.parseColorString(this.extension.chooseOverridePanelColor);
        } else {
            // For OSDs, use a darker version of the panel color for better contrast
            return {
                r: Math.max(panelColor.r - 10, 0),
                g: Math.max(panelColor.g - 10, 0),
                b: Math.max(panelColor.b - 10, 0),
            };
        }
    }

    /**
     * Restore all styled OSDs to their original appearance
     */
    restoreAllOSDs() {
        this.debugLog("Restoring all OSD elements to default Cinnamon styling");

        this.originalOSDStyles.forEach((originalData, element) => {
            try {
                this.restoreOSDElement(element, originalData);
            } catch (e) {
                this.debugLog("Error restoring OSD:", e);
            }
        });

        this.originalOSDStyles.clear();
        this.monitoredElements.clear();
        this.styledOSDs.clear();
    }

    /**
     * Restore original styling to an OSD element
     * @param {Clutter.Actor} element - Element to restore
     * @param {Object} originalData - Original styling data
     */
    restoreOSDElement(element, originalData) {
        if (!element) return;

        // Remove our custom styling completely
        element.set_style("");

        // Reset opacity to default
        element.set_opacity(255);

        // Remove our style classes
        element.remove_style_class_name("transparency-osd-blur");
        element.remove_style_class_name("transparency-fallback-blur");
        element.remove_style_class_name("profile-custom");

        // Clear any cached styling reference
        this.styledOSDs.delete(element);
    }

    /**
     * Clean up all connections and monitoring
     */
    cleanupConnections() {
        // Disconnect stage connection if exists
        if (this.stageConnection && global.stage) {
            this.debugLog("OSDStyler: Disconnecting stage connection");
            global.stage.disconnect(this.stageConnection);
            this.stageConnection = null;
        }

        // Clear styled OSDs cache
        this.styledOSDs.clear();
        this.monitoredElements.clear();
    }

    /**
     * Refresh OSD styling by invalidating cache and forcing re-styling on next display
     * This ensures new settings are applied when OSDs are next shown
     */
    refreshAllOSDs() {
        if (!this.extension.enableOSDStyling) {
            this.debugLog("OSD styling not enabled, skipping refresh");
            return;
        }

        try {
            this.debugLog("Refreshing OSD styling - invalidating cache for next display");

            // Simplified refresh process
            this.styledOSDs.clear();
            this.originalOSDStyles.clear();
            this.findAndStyleOSDsByCSS();
        } catch (e) {
            this.debugLog("Error refreshing OSD elements:", e);
        }
    }
}

module.exports = OSDStyler;
