const St = imports.gi.St;
const Main = imports.ui.main;

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
        this.connections = [];
        this.activeElements = new Map();
    }

    /**
     * Enable the styler - to be overridden by subclasses
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
        this.cleanupConnections();
        this.cleanupActiveElements();
        this.debugLog("Styler disabled");
    }

    /**
     * Refresh the styler - to be overridden by subclasses
     */
    refresh() {
        if (!this.isEnabled) return;
        this.debugLog("Styler refreshed");
    }

    /**
     * Cleanup connections
     */
    cleanupConnections() {
        this.connections.forEach((conn) => {
            if (conn.object && conn.id) {
                conn.object.disconnect(conn.id);
            }
        });
        this.connections = [];
    }

    /**
     * Cleanup active elements
     */
    cleanupActiveElements() {
        this.activeElements.clear();
    }

    /**
     * Add connection for cleanup
     * @param {Object} object - Object with disconnect method
     * @param {number} id - Connection ID
     */
    addConnection(object, id) {
        this.connections.push({ object, id });
    }

    /**
     * Debug logging with styler prefix
     * @param {...any} args - Arguments to log
     */
    debugLog(...args) {
        if (!this.extension.isEnabled && !args[0]?.includes("Disabling")) return;
        if (!this.extension.debugLogging) return; // Only log when debug logging is enabled
        const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS format
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
            element.add_style_class_name("transparency-fade-out");

            // Use GLib timeout for fade duration
            const timeoutId = imports.gi.GLib.timeout_add(
                imports.gi.GLib.PRIORITY_DEFAULT,
                150, // 150ms fade duration
                () => {
                    try {
                        // Remove fade class and execute callback
                        element.remove_style_class_name("transparency-fade-out");
                        element.remove_style_class_name("transparency-persistent-overlay");
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
        element.add_style_class_name("profile-custom");

        if (!this.extension.cssManager.hasBackdropFilter) {
            element.add_style_class_name("transparency-fallback-blur");
        }
    }

    /**
     * Remove common CSS classes for blur styling
     * @param {Clutter.Actor} element - Element to clean
     * @param {string} elementType - Type identifier (e.g., 'menu', 'notification')
     */
    removeCommonBlurClasses(element, elementType) {
        element.remove_style_class_name(`transparency-${elementType}-blur`);
        element.remove_style_class_name("transparency-fallback-blur");
        element.remove_style_class_name("profile-custom");
    }

    /**
     * Apply common blur styling properties to element
     * @param {Clutter.Actor} element - Element to style
     * @param {Object} color - RGB color object {r, g, b}
     * @param {number} opacity - Opacity value
     * @param {number} blurRadius - Blur radius
     * @param {number} borderRadius - Border radius
     * @param {string} borderColor - Border color
     * @param {number} borderWidth - Border width
     * @param {string} elementType - Type identifier for classes
     * @param {string} additionalStyles - Additional CSS styles to append
     */
    applyCommonBlurStyling(
        element,
        color,
        opacity,
        blurRadius,
        borderRadius,
        borderColor,
        borderWidth,
        elementType,
        additionalStyles = ""
    ) {
        const backdropFilter = this.calculateBackdropFilter(
            blurRadius,
            this.extension.blurSaturate,
            this.extension.blurContrast,
            this.extension.blurBrightness
        );

        const style = `
            background-color: rgba(${color.r}, ${color.g}, ${color.b}, ${opacity}) !important;
            backdrop-filter: ${backdropFilter} !important;
            -webkit-backdrop-filter: ${backdropFilter} !important;
            opacity: ${this.extension.blurOpacity} !important;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
            border-radius: ${borderRadius}px !important;
            border: ${borderWidth}px solid ${borderColor} !important;
            ${additionalStyles}
        `;

        this.applyCommonBlurClasses(element, elementType);
        element.set_style(style);
    }

    /**
     * Get adjusted blur radius for different element types
     * @param {string} elementType - Type of element ('menu', 'notification', 'osd', 'tooltip')
     * @returns {number} Adjusted blur radius
     */
    getAdjustedBlurRadius(elementType) {
        const baseRadius = this.extension.blurRadius;
        const multipliers = {
            menu: 0.9,
            notification: 1.0,
            osd: 1.3,
            tooltip: 0.7,
            alttab: 1.0,
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
            menu: 1.0,
            notification: 1.0,
            osd: 1.5,
            tooltip: 0.8,
            alttab: 1.0,
        };
        return Math.round(baseRadius * (multipliers[elementType] || 1.0));
    }
}

module.exports = StylerBase;
