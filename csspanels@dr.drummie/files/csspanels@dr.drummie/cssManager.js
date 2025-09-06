const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

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
                let basicSupport = CSS.supports("backdrop-filter", "blur(10px)") ||
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
                style: "backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px);"
            });
            
            let computedStyle = testElement.get_style();
            let hasBackdrop = computedStyle && 
                (computedStyle.indexOf("backdrop-filter") !== -1 ||
                 computedStyle.indexOf("-webkit-backdrop-filter") !== -1);
            
            testElement.destroy();
            
            this.extension.debugLog(`Manual backdrop-filter test result: ${hasBackdrop}`);
            return hasBackdrop;
        } catch (e) {
            this.extension.debugLog("Manual backdrop-filter test failed:", e);
            
            // Final fallback - assume modern Cinnamon versions support it
            let cinnamonVersion = this.getCinnamonVersion();
            let supportsBackdrop = cinnamonVersion >= 5.0;
            
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
            
            return 6.0;
        } catch (e) {
            this.extension.debugLog("Could not detect Cinnamon version:", e.message);
            return 6.0;
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
                let advancedSupport = CSS.supports("backdrop-filter", "blur(10px) saturate(150%)") &&
                                    CSS.supports("backdrop-filter", "contrast(120%)") &&
                                    CSS.supports("backdrop-filter", "brightness(110%)");
                
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
            if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.style.setProperty(`--${name}`, value);
            }
            
            // Try to set on Cinnamon's theme manager
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
            let menuColor = this.getMenuColor(panelColor);
            this.setCSSVariable("menu-bg-rgb", `${menuColor.r}, ${menuColor.g}, ${menuColor.b}`);
            
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
     * Get menu color based on override settings
     * @param {Object} panelColor - Panel color object
     * @returns {Object} Menu color object
     */
    getMenuColor(panelColor) {
        if (this.extension.overridePopupColor) {
            this.extension.debugLog("Using popup override color:", this.extension.chooseOverridePopupColor);
            return this.extension.themeDetector.parseColorString(this.extension.chooseOverridePopupColor);
        } else if (this.extension.overridePanelColor) {
            this.extension.debugLog("Using panel override color for popups:", this.extension.chooseOverridePanelColor);
            return this.extension.themeDetector.parseColorString(this.extension.chooseOverridePanelColor);
        } else {
            this.extension.debugLog("Propagating detected panel color to popups");
            return panelColor;
        }
    }

    /**
     * Get adaptive blur radius based on background content
     * @returns {number} Optimized blur radius
     */
    getAdaptiveBlurRadius() {
        let baseRadius = this.extension.blurRadius;
        let panelColor = this.extension.themeDetector.getPanelBaseColor();
        
        let brightness = (panelColor.r + panelColor.g + panelColor.b) / 3;
        
        if (brightness > 150) {
            return Math.min(baseRadius * 1.3, 25);
        } else if (brightness < 80) {
            return Math.max(baseRadius * 0.8, 5);
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
}

module.exports = CSSManager;