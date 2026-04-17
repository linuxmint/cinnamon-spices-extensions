const St = imports.gi.St;
const Main = imports.ui.main;
const { TIMESTAMP, CSS_CLASSES, STYLING, TIMING } = require("./constants");
const { GlobalSignalsHandler } = require("./signalHandler");

/**
 * Base class for all styler modules providing common functionality
 * Implements Strategy Pattern for consistent enable/disable/refresh behavior
 */
class StylerBase {
    /**
     * Initialize base styler
     * @param {Object} extension - Reference to main extension instance
     * @param {string} stylerName - Name of the styler for debug logging
     */
    constructor(extension, stylerName) {
        this.extension = extension;
        this.stylerName = stylerName;
        this.isEnabled = false;
        this._signalsHandler = new GlobalSignalsHandler();
        this.activeElements = new Map();
        this._enableFailed = false; // Track enable failure state
    }

    /**
     * Safe enable wrapper with automatic rollback on failure
     * Wraps enable() with error boundary and user notification
     *
     * @returns {boolean} True if enable succeeded, false otherwise
     */
    safeEnable() {
        try {
            this.enable();
            this._enableFailed = false;
            return true;
        } catch (error) {
            this._enableFailed = true;
            this.debugLog(`CRITICAL: Enable failed for ${this.stylerName}:`, error.message);

            // Attempt automatic rollback
            try {
                this.disable();
                this.debugLog(`Rollback successful for ${this.stylerName}`);
            } catch (rollbackError) {
                this.debugLog(`Rollback failed for ${this.stylerName}:`, rollbackError.message);
            }

            // Notify user of failure
            this._notifyError(`Failed to enable ${this.stylerName}`, error.message);
            return false;
        }
    }

    /**
     * Enable the styler - to be overridden by subclasses
     * NOTE: Use safeEnable() to call this with error boundary protection
     */
    enable() {
        this.isEnabled = true;
        this.debugLog("Styler enabled");
    }

    /**
     * Disable the styler - to be overridden by subclasses
     */
    disable() {
        this.isEnabled = false;
        this._signalsHandler.destroy();
        this.cleanupActiveElements();
        this.debugLog("Styler disabled");
    }

    /**
     * Notify user of critical error
     *
     * @param {string} title - Error title
     * @param {string} message - Error message
     * @private
     */
    _notifyError(title, message) {
        try {
            // Use Cinnamon's notification system if available
            if (Main.notifyError) {
                Main.notifyError(title, message);
            } else {
                // Fallback to global log
                global.logError(`[CSSPanels] Error in ${title}: ${message}`);
            }
        } catch (e) {
            // Silent fail - already in error state
            global.log(`[CSSPanels] Error notification failed: ${e.message}`);
        }
    }

    /**
     * Refresh the styler - to be overridden by subclasses
     */
    refresh() {
        if (!this.isEnabled) return;
        this.debugLog("Styler refreshed");
    }

    /**
     * Cleanup active elements - remove all tracked timeout IDs and clear map
     */
    cleanupActiveElements() {
        this.activeElements.forEach((data) => {
            if (data.fadeTimeout) {
                imports.gi.GLib.source_remove(data.fadeTimeout);
            }
        });
        this.activeElements.clear();
    }

    /**
     * Add signal connection for automatic cleanup
     *
     * Wrapper method for GlobalSignalsHandler.add() to maintain compatibility
     * with existing code patterns while providing cleaner API.
     *
     * @param {GObject.Object} object - Object to connect signal to
     * @param {string|Array} signal - Signal name(s) to connect
     * @param {Function} callback - Callback function (should be bound if needed)
     *
     * @example
     *   // Single signal
     *   this.addConnection(settings, 'changed::key', this._onChanged.bind(this));
     *
     *   // Multiple signals
     *   this.addConnection(menu, ['open-state-changed', 'destroy'], this._onMenuEvent.bind(this));
     */
    addConnection(object, signal, callback) {
        this._signalsHandler.add([object, signal, callback]);
    }

    /**
     * Get count of tracked signals for debugging
     *
     * @returns {number} Number of active signal connections
     */
    getSignalCount() {
        return this._signalsHandler.getSignalCount();
    }

    /**
     * Debug logging with styler prefix
     * @param {...any} args - Arguments to log
     */
    debugLog(...args) {
        // Allow logging during disable/cleanup phase
        const isCleanupMessage =
            args[0]?.includes("Disabling") ||
            args[0]?.includes("Cleaning") ||
            args[0]?.includes("Restored") ||
            args[0]?.includes("disabled") ||
            args[0]?.includes("cleanup");

        if (!this.extension.isEnabled && !isCleanupMessage) return;
        if (!this.extension.debugLogging) return; // Only log when debug logging is enabled
        const timestamp = new Date().toISOString().slice(TIMESTAMP.ISO_TIME_START, TIMESTAMP.ISO_TIME_END);
        global.log(`[CSSPanels] [${this.stylerName}] [${timestamp}] ${args.join(" ")}`);
    }

    /**
     * Check if element should be styled - to be overridden by subclasses
     * @param {Clutter.Actor} element - Element to check
     * @returns {boolean} True if should be styled
     */
    shouldStyleElement(element) {
        return false; // Default implementation
    }

    /**
     * Apply style to element - to be overridden by subclasses
     * @param {Clutter.Actor} element - Element to style
     */
    applyStyleToElement(element) {
        // Default implementation - subclasses should override
    }

    /**
     * Restore original style - to be overridden by subclasses
     * @param {Clutter.Actor} element - Element to restore
     * @param {Object} originalData - Original styling data
     */
    restoreElementStyle(element, originalData) {
        // Default implementation - subclasses should override
    }

    /**
     * Apply fade-out effect before removing styling to prevent flicker
     * @param {Clutter.Actor} element - Element to fade out
     * @param {Function} callback - Callback to execute after fade
     */
    fadeOutStyling(element, callback) {
        if (!element || !element.get_stage) {
            return callback && callback();
        }

        try {
            // Add fade-out class for smooth transition
            element.add_style_class_name(CSS_CLASSES.FADE_OUT);

            // Use GLib timeout for fade duration
            const timeoutId = imports.gi.GLib.timeout_add(
                imports.gi.GLib.PRIORITY_DEFAULT,
                TIMING.FADE_OUT_DURATION, // Fade-out animation duration
                () => {
                    try {
                        // Remove fade class and execute callback
                        element.remove_style_class_name(CSS_CLASSES.FADE_OUT);
                        element.remove_style_class_name(CSS_CLASSES.PERSISTENT_OVERLAY);
                        callback && callback();
                    } catch (e) {
                        this.debugLog("Error in fade-out callback:", e);
                        callback && callback(); // Ensure callback runs even on error
                    }
                    return false; // Remove timeout
                }
            );

            // Store timeout for cleanup if needed
            this.activeElements.set(element, { fadeTimeout: timeoutId });
        } catch (e) {
            this.debugLog("Error applying fade-out:", e);
            callback && callback(); // Fallback to immediate callback
        }
    }

    /**
     * Restore element styling with optional fade-out for anti-flicker
     * @param {Clutter.Actor} element - Element to restore
     * @param {boolean} useFadeOut - Whether to use fade-out transition
     * @param {Function} restoreFunction - Function to call for actual restore
     */
    restoreElementWithFade(element, useFadeOut, restoreFunction) {
        if (!element) {
            return restoreFunction && restoreFunction();
        }

        if (useFadeOut && element.get_stage()) {
            // Use fade-out to prevent flicker
            this.fadeOutStyling(element, () => {
                restoreFunction && restoreFunction();
            });
        } else {
            // Immediate restore
            restoreFunction && restoreFunction();
        }
    }

    /**
     * Calculate backdrop-filter string for blur effects
     * @param {number} blurRadius - Base blur radius
     * @param {number} saturate - Saturation multiplier
     * @param {number} contrast - Contrast multiplier
     * @param {number} brightness - Brightness multiplier
     * @returns {string} Backdrop-filter CSS string
     */
    calculateBackdropFilter(blurRadius, saturate = 1.0, contrast = 1.0, brightness = 1.0) {
        return `blur(${blurRadius}px) saturate(${saturate}) contrast(${contrast}) brightness(${brightness})`;
    }

    /**
     * Apply common CSS classes for blur styling
     * @param {Clutter.Actor} element - Element to style
     * @param {string} elementType - Type identifier (e.g., 'menu', 'notification')
     */
    applyCommonBlurClasses(element, elementType) {
        element.add_style_class_name(`transparency-${elementType}-blur`);
        element.add_style_class_name(CSS_CLASSES.CUSTOM_PROFILE);

        if (!this.extension.cssManager.hasBackdropFilter) {
            element.add_style_class_name(CSS_CLASSES.FALLBACK_BLUR);
        }
    }

    /**
     * Remove common CSS classes for blur styling
     * @param {Clutter.Actor} element - Element to clean
     * @param {string} elementType - Type identifier (e.g., 'menu', 'notification')
     */
    removeCommonBlurClasses(element, elementType) {
        element.remove_style_class_name(`transparency-${elementType}-blur`);
        element.remove_style_class_name(CSS_CLASSES.FALLBACK_BLUR);
        element.remove_style_class_name(CSS_CLASSES.CUSTOM_PROFILE);
    }

    /**
     * Get adjusted blur radius for different element types
     * @param {string} elementType - Type of element ('menu', 'notification', 'osd', 'tooltip')
     * @returns {number} Adjusted blur radius
     */
    getAdjustedBlurRadius(elementType) {
        const baseRadius = this.extension.blurRadius;
        const multipliers = {
            menu: STYLING.BLUR_ADJUSTMENT_MENU,
            notification: STYLING.BLUR_ADJUSTMENT_OSD,
            osd: STYLING.BLUR_ADJUSTMENT_OSD,
            tooltip: STYLING.BLUR_ADJUSTMENT_TOOLTIP,
            alttab: STYLING.BLUR_ADJUSTMENT_ALTTAB,
        };
        return Math.round(baseRadius * (multipliers[elementType] || 1.0));
    }

    /**
     * Get adjusted border radius for different element types
     * @param {string} elementType - Type of element
     * @returns {number} Adjusted border radius
     */
    getAdjustedBorderRadius(elementType) {
        const baseRadius = this.extension.borderRadius;
        const multipliers = {
            menu: STYLING.BORDER_ADJUSTMENT_MENU,
            notification: STYLING.BORDER_ADJUSTMENT_OSD,
            osd: STYLING.BORDER_ADJUSTMENT_OSD,
            tooltip: STYLING.BORDER_ADJUSTMENT_TOOLTIP,
            alttab: STYLING.BORDER_ADJUSTMENT_ALTTAB,
        };
        return Math.round(baseRadius * (multipliers[elementType] || 1.0));
    }

    /**
     * Generate border-radius CSS value string for attached popup menus.
     * Returns a 4-value CSS string with 0px on the side touching the panel.
     * @param {number} baseRadius - Base border radius in pixels
     * @param {number|null} orientation - St.Side enum value (0=TOP,1=BOTTOM,2=LEFT,3=RIGHT), or null for uniform
     * @returns {string} CSS border-radius value, e.g. "0 0 8px 8px" or "8px"
     */
    getAttachedBorderRadiusCSS(baseRadius, orientation) {
        const r = `${baseRadius}px`;
        const z = "0";

        // Map St.Side to CSS border-radius: top-left top-right bottom-right bottom-left
        // Empirically verified from logs: 0=TOP, 1=RIGHT, 2=BOTTOM, 3=LEFT
        const radiusMap = {
            0: `${z} ${z} ${r} ${r}`,    // TOP: top corners flat (touching top panel)
            1: `${r} ${z} ${z} ${r}`,    // RIGHT: right corners flat (touching right panel)
            2: `${r} ${r} ${z} ${z}`,    // BOTTOM: bottom corners flat (touching bottom panel)
            3: `${z} ${r} ${r} ${z}`,    // LEFT: left corners flat (touching left panel)
        };

        // Return mapped value or uniform fallback
        return (orientation !== null && orientation !== undefined && radiusMap[orientation] !== undefined)
            ? radiusMap[orientation]
            : r;
    }
}

module.exports = StylerBase;
