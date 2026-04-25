const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const { VERSION, STYLING } = require("./constants");

/**
 * CSS Manager handles all CSS variable management and styling system
 * Manages CSS custom properties and browser capability detection
 */
class CSSManager {
    /**
     * Initialize CSS Manager
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.cssVariables = new Map();
        this.hasBackdropFilter = false;
        this.hasAdvancedFilters = false;
    }

    /**
     * Initialize the CSS system with capability detection
     */
    initialize() {
        this.extension.debugLog("Initializing CSS system...");

        this.hasBackdropFilter = this.detectBackdropFilterSupport();
        this.hasAdvancedFilters = this.detectAdvancedFilterSupport();

        this.extension.debugLog(`Backdrop filter support: ${this.hasBackdropFilter}`);
        this.extension.debugLog(`Advanced filters support: ${this.hasAdvancedFilters}`);

        if (!this.hasBackdropFilter) {
            this.extension.debugLog("Using fallback blur simulation");
            this.enableFallbackMode();
        }

        this.updateAllVariables();
        this.extension.debugLog("CSS system initialized successfully");
    }

    /**
     * Detect basic backdrop-filter support
     * @returns {boolean} True if backdrop-filter is supported
     */
    detectBackdropFilterSupport() {
        try {
            if (typeof CSS !== "undefined" && CSS.supports) {
                let basicSupport =
                    CSS.supports("backdrop-filter", "blur(10px)") ||
                    CSS.supports("-webkit-backdrop-filter", "blur(10px)");

                this.extension.debugLog(`CSS.supports backdrop-filter: ${basicSupport}`);
                if (basicSupport) return true;
            }

            return this.manualBackdropFilterTest();
        } catch (e) {
            this.extension.debugLog("Error detecting backdrop-filter support:", e.message);
            return this.manualBackdropFilterTest();
        }
    }

    /**
     * Manual test for backdrop-filter support
     * @returns {boolean} True if backdrop-filter works
     */
    manualBackdropFilterTest() {
        try {
            let testElement = new St.Bin({
                style: "backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px);",
            });

            let computedStyle = testElement.get_style();
            let hasBackdrop =
                computedStyle &&
                (computedStyle.indexOf("backdrop-filter") !== -1 ||
                    computedStyle.indexOf("-webkit-backdrop-filter") !== -1);

            testElement.destroy();

            this.extension.debugLog(`Manual backdrop-filter test result: ${hasBackdrop}`);
            return hasBackdrop;
        } catch (e) {
            this.extension.debugLog("Manual backdrop-filter test failed:", e);

            // Final fallback - assume modern Cinnamon versions support it
            let cinnamonVersion = this.getCinnamonVersion();
            let supportsBackdrop = cinnamonVersion >= VERSION.CINNAMON_MIN_BACKDROP_FILTER;

            this.extension.debugLog(`Fallback: Cinnamon ${cinnamonVersion} backdrop support: ${supportsBackdrop}`);
            return supportsBackdrop;
        }
    }

    /**
     * Get current Cinnamon version
     * @returns {number} Cinnamon version number
     */
    getCinnamonVersion() {
        try {
            if (typeof imports.misc.config !== "undefined") {
                let version = imports.misc.config.PACKAGE_VERSION;
                return parseFloat(version);
            }

            if (Main.cinnamonVersion) {
                return parseFloat(Main.cinnamonVersion);
            }

            return VERSION.CINNAMON_DEFAULT_VERSION;
        } catch (e) {
            this.extension.debugLog("Could not detect Cinnamon version:", e.message);
            return VERSION.CINNAMON_DEFAULT_VERSION;
        }
    }
    /**
     * Detect advanced backdrop-filter support
     * @returns {boolean} True if advanced filters are supported
     */
    detectAdvancedFilterSupport() {
        if (!this.hasBackdropFilter) return false;

        try {
            if (typeof CSS !== "undefined" && CSS.supports) {
                let advancedSupport =
                    CSS.supports("backdrop-filter", `blur(10px) saturate(${STYLING.FILTER_SATURATE_MULTIPLIER}%)`) &&
                    CSS.supports("backdrop-filter", `contrast(${STYLING.FILTER_CONTRAST_MULTIPLIER}%)`) &&
                    CSS.supports("backdrop-filter", `brightness(${STYLING.FILTER_BRIGHTNESS_MULTIPLIER}%)`);

                if (advancedSupport) {
                    this.extension.debugLog("Advanced backdrop-filter effects are supported");
                    return true;
                }

                this.extension.debugLog("Advanced filter CSS.supports failed, using backdrop-filter fallback");
                return this.hasBackdropFilter;
            }
        } catch (e) {
            this.extension.debugLog("Error detecting advanced filter support:", e.message);
        }

        return this.hasBackdropFilter;
    }

    /**
     * Enable fallback mode for systems without backdrop-filter support
     */
    enableFallbackMode() {
        this.setCSSVariable("fallback-mode", "true");
    }

    /**
     * Set a CSS custom property (variable) dynamically
     * @param {string} name - The CSS variable name (without -- prefix)
     * @param {string} value - The CSS variable value
     */
    setCSSVariable(name, value) {
        try {
            // document.documentElement is not a real DOM in GJS; this is a no-op in Cinnamon
            if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.style.setProperty(`--${name}`, value);
            }

            // _gtkThemeNode is a private Cinnamon API; guard ensures graceful fallback if absent
            try {
                if (Main.themeManager && Main.themeManager._gtkThemeNode) {
                    Main.themeManager._gtkThemeNode.set_property(`--${name}`, value);
                }
            } catch (e) {
                // Silent fail for theme manager - not critical
            }

            this.cssVariables.set(name, value);
        } catch (e) {
            this.extension.debugLog("Failed to set CSS variable:", e.message);
        }
    }

    /**
     * Update all CSS variables based on current settings
     */
    updateAllVariables() {
        try {
            let panelColor = this.extension.themeDetector.getPanelBaseColor();
            let effectiveBorderRadius = this.getEffectiveBorderRadius();

            // Panel variables
            this.setCSSVariable("panel-radius", `${this.extension.applyPanelRadius ? effectiveBorderRadius : 0}px`);
            this.setCSSVariable("panel-opacity", this.extension.panelOpacity.toString());
            this.setCSSVariable("panel-bg-rgb", `${panelColor.r}, ${panelColor.g}, ${panelColor.b}`);

            // Blur variables
            this.setCSSVariable("blur-radius", `${this.extension.blurRadius}px`);
            this.setCSSVariable("blur-saturate", this.extension.blurSaturate.toString());
            this.setCSSVariable("blur-contrast", this.extension.blurContrast.toString());
            this.setCSSVariable("blur-brightness", this.extension.blurBrightness.toString());
            this.setCSSVariable("blur-background", this.extension.blurBackground);
            this.setCSSVariable("blur-border-color", this.extension.blurBorderColor);
            this.setCSSVariable("blur-border-width", `${this.extension.blurBorderWidth}px`);
            this.setCSSVariable("blur-transition", `${Math.round(this.extension.blurTransition * 1000)}ms`);

            // Menu variables
            this.setCSSVariable("menu-radius", `${effectiveBorderRadius}px`);
            this.setCSSVariable("menu-opacity", this.extension.menuOpacity.toString());

            // Determine popup/menu color based on override settings
            let menuColor = this.extension.themeDetector.getEffectivePopupColor();
            this.setCSSVariable("menu-bg-rgb", `${menuColor.r}, ${menuColor.g}, ${menuColor.b}`);

            // Auto-generate highlight color for menu hover effects
            let highlightColor = this.extension.themeDetector.getAutoHighlightColor(0.3);
            this.setCSSVariable("menu-highlight-color", highlightColor);

            // Performance and capability variables
            this.setCSSVariable("advanced-filters", this.hasAdvancedFilters ? "true" : "false");
        } catch (e) {
            this.extension.debugLog("Error updating CSS variables:", e);
        }
    }

    /**
     * Get effective border radius (auto-detected or manual)
     * @returns {number} Effective border radius in pixels
     */
    getEffectiveBorderRadius() {
        let effectiveBorderRadius = this.extension.borderRadius;

        if (this.extension.autoDetectRadius) {
            let detectedRadius = this.extension.themeDetector.detectThemeBorderRadius();
            if (detectedRadius !== this.extension.borderRadius && detectedRadius > 0) {
                effectiveBorderRadius = detectedRadius;
                this.extension.debugLog(`Using auto-detected border-radius: ${effectiveBorderRadius}px`);
            }
        }

        return effectiveBorderRadius;
    }

    /**
     * Get adaptive blur radius based on background content
     * @returns {number} Optimized blur radius
     */
    getAdaptiveBlurRadius() {
        let baseRadius = this.extension.blurRadius;
        let panelColor = this.extension.themeDetector.getPanelBaseColor();

        let brightness = (panelColor.r + panelColor.g + panelColor.b) / 3;

        if (brightness > STYLING.BRIGHTNESS_THRESHOLD_LIGHT) {
            return Math.min(baseRadius * STYLING.ADAPTIVE_BLUR_MULTIPLIER_LIGHT, STYLING.ADAPTIVE_BLUR_MAX);
        } else if (brightness < STYLING.BRIGHTNESS_THRESHOLD_DARK) {
            return Math.max(baseRadius * STYLING.ADAPTIVE_BLUR_MULTIPLIER_DARK, STYLING.ADAPTIVE_BLUR_MIN);
        }

        return baseRadius;
    }

    /**
     * Cleanup the CSS system by clearing variables
     */
    cleanup() {
        try {
            this.cssVariables.forEach((value, name) => {
                if (typeof document !== "undefined" && document.documentElement) {
                    document.documentElement.style.removeProperty(`--${name}`);
                }
            });

            this.cssVariables.clear();
            this.extension.debugLog("CSS system cleaned up");
        } catch (e) {
            this.extension.debugLog("Error cleaning up CSS system:", e);
        }
    }

    /**
     * Log detailed information about a Clutter actor for debugging purposes
     * @param {Clutter.Actor} actor - The actor to inspect
     * @param {number} depth - Current depth in the actor hierarchy
     */
    logActorDetails(actor, depth) {
        if (!actor) return;

        this.extension.debugLog(
            "Actor details - name:",
            actor.name,
            "type:",
            actor.constructor.name,
            "parent:",
            actor.get_parent ? actor.get_parent() : null,
            "depth:",
            depth
        );
    }

    /**
     * Debug utility: Inspect element structure and CSS properties
     * @param {Clutter.Actor} element - Element to inspect
     * @param {string} elementName - Name for logging purposes
     * @param {number} maxDepth - Maximum depth to traverse (default: 3)
     */
    inspectElement(element, elementName = "Element", maxDepth = 3) {
        this.extension.debugLog(`=== INSPECTING ${elementName} ===`);
        this._inspectElementRecursive(element, 0, maxDepth);
        this.extension.debugLog(`=== END INSPECTION ${elementName} ===`);
    }

    /**
     * Recursive element inspection helper
     * @param {Clutter.Actor} element - Current element
     * @param {number} depth - Current depth level
     * @param {number} maxDepth - Maximum depth to traverse
     */
    _inspectElementRecursive(element, depth, maxDepth) {
        if (!element || depth > maxDepth) return;

        const indent = "  ".repeat(depth);
        const elementType = element.constructor.name;
        const visible = element.visible ? "visible" : "hidden";

        try {
            // Basic element info
            this.extension.debugLog(`${indent}${elementType} (${visible})`);

            // CSS classes if available
            if (element.get_style_class_name) {
                const styleClasses = element.get_style_class_name();
                if (styleClasses) {
                    this.extension.debugLog(`${indent}  CSS classes: ${styleClasses}`);
                }
            }

            // Current style if available
            if (element.get_style) {
                const style = element.get_style();
                if (style) {
                    this.extension.debugLog(
                        `${indent}  Style: ${style.substring(0, 100)}${style.length > 100 ? "..." : ""}`
                    );
                }
            }

            // Size and position
            if (element.width !== undefined && element.height !== undefined) {
                this.extension.debugLog(`${indent}  Size: ${element.width}x${element.height}`);
            }

            // Children count
            if (element.get_children) {
                const children = element.get_children();
                this.extension.debugLog(`${indent}  Children: ${children.length}`);

                // Recurse into children
                children.forEach((child, index) => {
                    this.extension.debugLog(`${indent}  Child ${index}:`);
                    this._inspectElementRecursive(child, depth + 1, maxDepth);
                });
            }
        } catch (e) {
            this.extension.debugLog(`${indent}Error inspecting element: ${e}`);
        }
    }

    // ===== THEMEUTILS INTEGRATION - NEW METHODS =====

    /**
     * Update highlight color CSS variable for menu hover effects
     * Allows manual override of auto-generated highlight color
     *
     * @param {string} cssColor - CSS rgba string (e.g., "rgba(255, 255, 255, 0.15)")
     */
    updateHighlightColor(cssColor) {
        if (!cssColor) {
            this.extension.debugLog("Warning: updateHighlightColor called with empty color");
            return;
        }

        this.extension.debugLog(`Manually updating highlight color: ${cssColor}`);
        this.setCSSVariable("menu-highlight-color", cssColor);
    }

    /**
     * Reset highlight color to auto-generated value
     * Useful after manual override
     *
     * @param {number} intensity - Highlight intensity (0-1, default: 0.3)
     */
    resetHighlightColor(intensity = 0.3) {
        const highlightColor = this.extension.themeDetector.getAutoHighlightColor(intensity);
        this.extension.debugLog(`Resetting highlight color to auto: ${highlightColor}`);
        this.setCSSVariable("menu-highlight-color", highlightColor);
    }

}

module.exports = CSSManager;
