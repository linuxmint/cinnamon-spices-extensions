const St = imports.gi.St;
const Main = imports.ui.main;
const StylerBase = require("./stylerBase");
const { TIMING, SIZE, STYLING, CSS_CLASSES, SIGNALS, ACTIONS } = require("./constants");

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
     * Disable OSD styling and restore original OSD show method
     */
    disable() {
        if (this.originalShow) {
            const OSDWindow = this._findOSDWindow();
            if (OSDWindow && OSDWindow.show === this._patchedShowBound) {
                OSDWindow.show = this.originalShow;
            }
            this.originalShow = null;
            this._patchedShowBound = null;
        }
        this.restoreAllOSDs();
        super.disable();
    }

    /**
     * Find OSD Window object from multiple possible import paths
     * @returns {Object|null} OSD Window object or null if not found
     * @private
     */
    _findOSDWindow() {
        // Array of possible OSD Window paths in order of preference
        const osdPaths = [
            () => imports.ui.osdWindow.OSDWindow,
            () => imports.ui.osdWindow,
            () => Main.osdWindowManager,
            () => Main.osdWindow,
        ];

        for (const pathFn of osdPaths) {
            try {
                const osdWindow = pathFn();
                if (osdWindow && typeof osdWindow.show === "function") {
                    this.debugLog(`Found OSD Window via: ${pathFn.toString()}`);
                    return osdWindow;
                }
            } catch (e) {
                // Silent fail - try next path
            }
        }

        this.debugLog("OSDWindow not found in any known path");
        return null;
    }

    /**
     * Apply monkeypatch to OSD manager for OSD styling
     */
    applyMonkeyPatch() {
        try {
            const OSDWindow = this._findOSDWindow();

            if (OSDWindow) {
                this.originalShow = OSDWindow.show;
                // Store bound function reference to enable idempotent restore
                this._patchedShowBound = this._patchedShow.bind(this);
                OSDWindow.show = this._patchedShowBound;
                this.debugLog("OSD monkeypatch applied successfully");
            } else {
                this.debugLog("OSDWindow not found, using monitoring fallback");
                this.setupOSDMonitoring();
            }
        } catch (e) {
            this.debugLog("Failed to apply OSD monkeypatch:", e.message);
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
        // CRITICAL: When monkey-patched, 'this' in the ORIGINAL method context is the OSDWindow object
        // We need to preserve that context when calling originalShow
        // But 'this' in _patchedShow is bound to OSDStyler (via .bind(this) in applyMonkeyPatch)

        // Store reference to OSDStyler (bound 'this')
        const styler = this;

        // Get the actual OSDWindow object - it's passed as the context when show() is called
        // We need to find it via the known paths
        const OSDWindow = styler._findOSDWindow();

        // Call original show with proper OSDWindow context
        const result = styler.originalShow.call(OSDWindow, monitorIndex, icon, label, level);

        // Apply styles to the OSDWindow object (not styler!)
        styler.applyOSDStyles(OSDWindow);

        return result;
    }

    /**
     * Apply styles to OSD
     * @param {Object} osd - OSD object
     */
    applyOSDStyles(osd) {
        if (!osd || !osd.actor) return;

        const actor = osd.actor;

        // Get effective popup color and apply OSD-specific darkening for better contrast
        let osdColor = this.extension.themeDetector.getEffectivePopupColor();
        osdColor = {
            r: Math.max(osdColor.r - STYLING.COLOR_DARKEN_AMOUNT, 0),
            g: Math.max(osdColor.g - STYLING.COLOR_DARKEN_AMOUNT, 0),
            b: Math.max(osdColor.b - STYLING.COLOR_DARKEN_AMOUNT, 0),
        };

        // Build configuration object for template generation
        const config = {
            backgroundColor: `rgba(${osdColor.r}, ${osdColor.g}, ${osdColor.b}, ${this.extension.menuOpacity})`,
            opacity: this.extension.blurOpacity,
            borderRadius: this.getAdjustedBorderRadius("osd"),
            blurRadius: this.getAdjustedBlurRadius("osd"),
            blurSaturate: this.extension.blurSaturate,
            blurContrast: this.extension.blurContrast,
            blurBrightness: this.extension.blurBrightness,
            borderColor: this.extension.blurBorderColor,
            borderWidth: Math.max(this.extension.blurBorderWidth, 2),
            transition: "all 0.2s ease",
        };

        // Generate and apply CSS via template manager
        const osdCSS = this.extension.blurTemplateManager.generateOSDCSS(config);
        actor.set_style(osdCSS);
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
            // Restore monkey-patched OSD show method
            if (this.originalShow) {
                const OSDWindow = this._findOSDWindow();
                if (OSDWindow) {
                    OSDWindow.show = this.originalShow;
                    this.debugLog("OSD monkey patch restored");
                }
                this.originalShow = null;
            }

            this.restoreAllOSDs();
            this.styledOSDs.clear();
            this.originalOSDStyles.clear();
            this.monitoredElements.clear();
            this.debugLog("OSDStyler: Disable cleanup completed");
        } catch (e) {
            this.debugLog("Error disabling OSD styler:", e);
        }
        super.disable(); // Automatic signal cleanup via GlobalSignalsHandler
    }

    /**
     * Setup CSS-based monitoring for OSD elements
     */
    setupOSDMonitoring() {
        this.debugLog("Setting up CSS-based OSD monitoring");

        // Monitor global stage for new OSD elements - use GlobalSignalsHandler
        if (global.stage) {
            this.addConnection(global.stage, SIGNALS.ACTOR_ADDED, (stage, actor) => {
                if (this.isOSDElementByCSS(actor) && !this.styledOSDs.has(actor)) {
                    this.debugLog("Detected new OSD via CSS monitoring");
                    imports.mainloop.timeout_add(TIMING.DEBOUNCE_SHORT, () => {
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
                return (
                    width >= SIZE.OSD_MIN_WIDTH &&
                    width <= SIZE.OSD_MAX_WIDTH &&
                    height >= SIZE.OSD_MIN_HEIGHT &&
                    height <= SIZE.OSD_MAX_HEIGHT
                );
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
            // Monitor for media keys that trigger OSDs - use GlobalSignalsHandler
            if (global.display) {
                this.lastKeyTrigger = 0; // Debounce timestamp
                this.addConnection(
                    global.display,
                    SIGNALS.ACCELERATOR_ACTIVATED,
                    (display, action, deviceId, timestamp) => {
                        // Check if this is a volume or brightness key
                        if (action && (action.includes(ACTIONS.VOLUME) || action.includes(ACTIONS.BRIGHTNESS))) {
                            const now = Date.now();
                            if (now - this.lastKeyTrigger > TIMING.KEY_TRIGGER_THROTTLE) {
                                // Debounce
                                this.lastKeyTrigger = now;
                                this.debugLog(`Media key detected: ${action}`);
                                // Trigger CSS-based search only if needed, without periodic repeat
                                this.findAndStyleOSDsByCSS();
                            }
                        }
                    }
                );
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

            // Get effective popup color and apply OSD-specific darkening for better contrast
            let osdColor = this.extension.themeDetector.getEffectivePopupColor();
            osdColor = {
                r: Math.max(osdColor.r - STYLING.COLOR_DARKEN_AMOUNT, 0),
                g: Math.max(osdColor.g - STYLING.COLOR_DARKEN_AMOUNT, 0),
                b: Math.max(osdColor.b - STYLING.COLOR_DARKEN_AMOUNT, 0),
            };

            // Build configuration object for template generation
            const config = {
                backgroundColor: `rgba(${osdColor.r}, ${osdColor.g}, ${osdColor.b}, ${this.extension.menuOpacity})`,
                opacity: this.extension.blurOpacity,
                borderRadius: this.getAdjustedBorderRadius("osd"),
                blurRadius: this.getAdjustedBlurRadius("osd"),
                blurSaturate: this.extension.blurSaturate,
                blurContrast: this.extension.blurContrast,
                blurBrightness: this.extension.blurBrightness,
                borderColor: this.extension.blurBorderColor,
                borderWidth: Math.max(this.extension.blurBorderWidth, 2),
                transition: "all 0.2s ease",
            };

            // Generate CSS via template manager
            const osdCSS = this.extension.blurTemplateManager.generateOSDCSS(config);
            actor.set_style(osdCSS);

            this.debugLog("Applying OSD styles via template generation");

            // Mark as styled to avoid re-styling
            this.styledOSDs.add(actor);

            this.debugLog(`Successfully styled ${type} OSD`);
        } catch (e) {
            this.debugLog(`Error styling OSD element ${type}:`, e);
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
        element.remove_style_class_name(CSS_CLASSES.OSD_BLUR);
        element.remove_style_class_name(CSS_CLASSES.FALLBACK_BLUR);
        element.remove_style_class_name(CSS_CLASSES.CUSTOM_PROFILE);

        // Clear any cached styling reference
        this.styledOSDs.delete(element);
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
