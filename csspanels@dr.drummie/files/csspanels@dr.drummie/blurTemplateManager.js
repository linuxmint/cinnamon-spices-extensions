/**
 * Blur Template Manager handles blur effect templates
 * Provides predefined blur templates for easy styling
 * Generates inline CSS strings for direct actor.set_style() injection
 */
class BlurTemplateManager {
    /**
     * Initialize Blur Template Manager
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.templates = this.initializeTemplates();

        // Template cache for performance (LRU cache)
        this._templateCache = new Map();
        this._cacheOrder = []; // Track access order for LRU
        this._maxCacheSize = 50;
        this._cacheHits = 0;
        this._cacheMisses = 0;
    }

    /**
     * Initialize all blur templates
     * @returns {Object} Map of template names to their settings
     */
    initializeTemplates() {
        return {
            // Frosted Glass group
            "frosted-glass": {
                blurRadius: 15,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(255, 255, 255, 0.2)",
                blurBorderColor: "rgba(255, 255, 255, 0.4)",
                blurBorderWidth: 0,
                blurTransition: 0.5,
                blurOpacity: 0.9,
            },
            "frosted-glass-dark": {
                blurRadius: 22,
                blurSaturate: 0.95,
                blurContrast: 0.75,
                blurBrightness: 0.65,
                blurBackground: "rgba(0, 0, 0, 0.3)",
                blurBorderColor: "rgba(255, 255, 255, 0.15)",
                
                blurTransition: 0.3,
                blurOpacity: 0.8,
            },
            "frosted-glass-orange-light": {
                blurRadius: 18,
                blurSaturate: 1.4,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(255, 165, 0, 0.15)",
                blurBorderColor: "rgba(255, 140, 0, 0.3)",
                blurTransition: 0.4,
                blurOpacity: 0.88,
            },
            "frosted-glass-orange-dark": {
                blurRadius: 24,
                blurSaturate: 0.9,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(255, 69, 0, 0.2)",
                blurBorderColor: "rgba(255, 140, 0, 0.15)",
                
                blurTransition: 0.5,
                blurOpacity: 0.8,
            },
            "frosted-glass-blue-light": {
                blurRadius: 18,
                blurSaturate: 1.4,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(0, 123, 255, 0.15)",
                blurBorderColor: "rgba(0, 86, 179, 0.3)",
                
                blurTransition: 0.4,
                blurOpacity: 0.88,
            },
            "frosted-glass-blue-dark": {
                blurRadius: 24,
                blurSaturate: 0.9,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(0, 51, 160, 0.2)",
                blurBorderColor: "rgba(0, 86, 179, 0.15)",
                
                blurTransition: 0.5,
                blurOpacity: 0.8,
            },
            "frosted-glass-green-light": {
                blurRadius: 18,
                blurSaturate: 1.4,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(40, 167, 69, 0.15)",
                blurBorderColor: "rgba(21, 87, 36, 0.3)",
                
                blurTransition: 0.4,
                blurOpacity: 0.88,
            },
            "frosted-glass-green-dark": {
                blurRadius: 24,
                blurSaturate: 0.9,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(21, 87, 36, 0.2)",
                blurBorderColor: "rgba(21, 87, 36, 0.15)",
                
                blurTransition: 0.5,
                blurOpacity: 0.8,
            },
            "frosted-glass-purple-light": {
                blurRadius: 18,
                blurSaturate: 1.4,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(102, 51, 153, 0.15)",
                blurBorderColor: "rgba(75, 0, 130, 0.3)",
                
                blurTransition: 0.4,
                blurOpacity: 0.88,
            },
            "frosted-glass-purple-dark": {
                blurRadius: 24,
                blurSaturate: 0.9,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(75, 0, 130, 0.2)",
                blurBorderColor: "rgba(75, 0, 130, 0.15)",
                
                blurTransition: 0.5,
                blurOpacity: 0.8,
            },
            "frosted-glass-red-light": {
                blurRadius: 18,
                blurSaturate: 1.4,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(220, 53, 69, 0.15)",
                blurBorderColor: "rgba(176, 42, 55, 0.3)",
                
                blurTransition: 0.4,
                blurOpacity: 0.88,
            },
            "frosted-glass-red-dark": {
                blurRadius: 24,
                blurSaturate: 0.9,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(176, 42, 55, 0.2)",
                blurBorderColor: "rgba(176, 42, 55, 0.15)",
                
                blurTransition: 0.5,
                blurOpacity: 0.8,
            },
            "frosted-glass-pink-light": {
                blurRadius: 18,
                blurSaturate: 1.4,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(255, 105, 180, 0.15)",
                blurBorderColor: "rgba(255, 20, 147, 0.3)",
                
                blurTransition: 0.4,
                blurOpacity: 0.88,
            },
            "frosted-glass-pink-dark": {
                blurRadius: 24,
                blurSaturate: 0.9,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(255, 20, 147, 0.2)",
                blurBorderColor: "rgba(255, 20, 147, 0.15)",
                
                blurTransition: 0.5,
                blurOpacity: 0.8,
            },
            // Wet Glass group
            "wet-glass": {
                blurRadius: 25,
                blurSaturate: 1.5,
                blurContrast: 1.2,
                blurBrightness: 1.1,
                blurBackground: "rgba(255, 255, 255, 0.1)",
                blurBorderColor: "rgba(255, 255, 255, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.8,
            },
            "wet-glass-dark": {
                blurRadius: 28,
                blurSaturate: 0.9,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(0, 0, 0, 0.4)",
                blurBorderColor: "rgba(255, 255, 255, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            "wet-glass-orange-light": {
                blurRadius: 26,
                blurSaturate: 1.6,
                blurContrast: 1.3,
                blurBrightness: 1.2,
                blurBackground: "rgba(255, 165, 0, 0.1)",
                blurBorderColor: "rgba(255, 140, 0, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.85,
            },
            "wet-glass-orange-dark": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(255, 69, 0, 0.4)",
                blurBorderColor: "rgba(255, 140, 0, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            "wet-glass-blue-light": {
                blurRadius: 26,
                blurSaturate: 1.6,
                blurContrast: 1.3,
                blurBrightness: 1.2,
                blurBackground: "rgba(0, 123, 255, 0.1)",
                blurBorderColor: "rgba(0, 86, 179, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.85,
            },
            "wet-glass-blue-dark": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(0, 51, 160, 0.4)",
                blurBorderColor: "rgba(0, 86, 179, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            "wet-glass-green-light": {
                blurRadius: 26,
                blurSaturate: 1.6,
                blurContrast: 1.3,
                blurBrightness: 1.2,
                blurBackground: "rgba(40, 167, 69, 0.1)",
                blurBorderColor: "rgba(21, 87, 36, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.85,
            },
            "wet-glass-green-dark": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(21, 87, 36, 0.4)",
                blurBorderColor: "rgba(21, 87, 36, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            "wet-glass-purple-light": {
                blurRadius: 26,
                blurSaturate: 1.6,
                blurContrast: 1.3,
                blurBrightness: 1.2,
                blurBackground: "rgba(102, 51, 153, 0.1)",
                blurBorderColor: "rgba(75, 0, 130, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.85,
            },
            "wet-glass-purple-dark": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(75, 0, 130, 0.4)",
                blurBorderColor: "rgba(75, 0, 130, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            "wet-glass-red-light": {
                blurRadius: 26,
                blurSaturate: 1.6,
                blurContrast: 1.3,
                blurBrightness: 1.2,
                blurBackground: "rgba(220, 53, 69, 0.1)",
                blurBorderColor: "rgba(176, 42, 55, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.85,
            },
            "wet-glass-red-dark": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(176, 42, 55, 0.4)",
                blurBorderColor: "rgba(176, 42, 55, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            "wet-glass-pink-light": {
                blurRadius: 26,
                blurSaturate: 1.6,
                blurContrast: 1.3,
                blurBrightness: 1.2,
                blurBackground: "rgba(255, 105, 180, 0.1)",
                blurBorderColor: "rgba(255, 20, 147, 0.2)",
                
                blurTransition: 0.3,
                blurOpacity: 0.85,
            },
            "wet-glass-pink-dark": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.7,
                blurBrightness: 0.6,
                blurBackground: "rgba(255, 20, 147, 0.4)",
                blurBorderColor: "rgba(255, 20, 147, 0.1)",
                
                blurTransition: 0.4,
                blurOpacity: 0.7,
            },
            // Foggy Glass group
            "foggy-glass": {
                blurRadius: 30,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(255, 255, 255, 0.4)",
                blurBorderColor: "rgba(255, 255, 255, 0.3)",
                
                blurTransition: 1.0,
                blurOpacity: 0.7,
            },
            "foggy-glass-dark": {
                blurRadius: 35,
                blurSaturate: 0.7,
                blurContrast: 0.6,
                blurBrightness: 0.5,
                blurBackground: "rgba(0, 0, 0, 0.5)",
                blurBorderColor: "rgba(255, 255, 255, 0.05)",
                
                blurTransition: 1.2,
                blurOpacity: 0.6,
            },
            "foggy-glass-orange-light": {
                blurRadius: 32,
                blurSaturate: 1.0,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(255, 165, 0, 0.25)",
                blurBorderColor: "rgba(255, 140, 0, 0.25)",
                
                blurTransition: 0.8,
                blurOpacity: 0.75,
            },
            "foggy-glass-orange-dark": {
                blurRadius: 37,
                blurSaturate: 0.6,
                blurContrast: 0.5,
                blurBrightness: 0.4,
                blurBackground: "rgba(255, 69, 0, 0.4)",
                blurBorderColor: "rgba(255, 140, 0, 0.05)",
                
                blurTransition: 1.0,
                blurOpacity: 0.6,
            },
            "foggy-glass-blue-light": {
                blurRadius: 32,
                blurSaturate: 1.0,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(0, 123, 255, 0.25)",
                blurBorderColor: "rgba(0, 86, 179, 0.25)",
                
                blurTransition: 0.8,
                blurOpacity: 0.75,
            },
            "foggy-glass-blue-dark": {
                blurRadius: 37,
                blurSaturate: 0.6,
                blurContrast: 0.5,
                blurBrightness: 0.4,
                blurBackground: "rgba(0, 51, 160, 0.4)",
                blurBorderColor: "rgba(0, 86, 179, 0.05)",
                
                blurTransition: 1.0,
                blurOpacity: 0.6,
            },
            "foggy-glass-green-light": {
                blurRadius: 32,
                blurSaturate: 1.0,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(40, 167, 69, 0.25)",
                blurBorderColor: "rgba(21, 87, 36, 0.25)",
                
                blurTransition: 0.8,
                blurOpacity: 0.75,
            },
            "foggy-glass-green-dark": {
                blurRadius: 37,
                blurSaturate: 0.6,
                blurContrast: 0.5,
                blurBrightness: 0.4,
                blurBackground: "rgba(21, 87, 36, 0.4)",
                blurBorderColor: "rgba(21, 87, 36, 0.05)",
                
                blurTransition: 1.0,
                blurOpacity: 0.6,
            },
            "foggy-glass-purple-light": {
                blurRadius: 32,
                blurSaturate: 1.0,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(102, 51, 153, 0.25)",
                blurBorderColor: "rgba(75, 0, 130, 0.25)",
                
                blurTransition: 0.8,
                blurOpacity: 0.75,
            },
            "foggy-glass-purple-dark": {
                blurRadius: 37,
                blurSaturate: 0.6,
                blurContrast: 0.5,
                blurBrightness: 0.4,
                blurBackground: "rgba(75, 0, 130, 0.4)",
                blurBorderColor: "rgba(75, 0, 130, 0.05)",
                
                blurTransition: 1.0,
                blurOpacity: 0.6,
            },
            "foggy-glass-red-light": {
                blurRadius: 32,
                blurSaturate: 1.0,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(220, 53, 69, 0.25)",
                blurBorderColor: "rgba(176, 42, 55, 0.25)",
                
                blurTransition: 0.8,
                blurOpacity: 0.75,
            },
            "foggy-glass-red-dark": {
                blurRadius: 37,
                blurSaturate: 0.6,
                blurContrast: 0.5,
                blurBrightness: 0.4,
                blurBackground: "rgba(176, 42, 55, 0.4)",
                blurBorderColor: "rgba(176, 42, 55, 0.05)",
                
                blurTransition: 1.0,
                blurOpacity: 0.6,
            },
            "foggy-glass-pink-light": {
                blurRadius: 32,
                blurSaturate: 1.0,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(255, 105, 180, 0.25)",
                blurBorderColor: "rgba(255, 20, 147, 0.25)",
                
                blurTransition: 0.8,
                blurOpacity: 0.75,
            },
            "foggy-glass-pink-dark": {
                blurRadius: 37,
                blurSaturate: 0.6,
                blurContrast: 0.5,
                blurBrightness: 0.4,
                blurBackground: "rgba(255, 20, 147, 0.4)",
                blurBorderColor: "rgba(255, 20, 147, 0.05)",
                
                blurTransition: 1.0,
                blurOpacity: 0.6,
            },
            // Clear Crystal group
            "clear-crystal": {
                blurRadius: 10,
                blurSaturate: 1.0,
                blurContrast: 1.0,
                blurBrightness: 1.0,
                blurBackground: "rgba(255, 255, 255, 0.0)",
                blurBorderColor: "rgba(255, 255, 255, 0.5)",
                
                blurTransition: 0.2,
                blurOpacity: 1.0,
            },
            "clear-crystal-dark": {
                blurRadius: 12,
                blurSaturate: 0.9,
                blurContrast: 0.9,
                blurBrightness: 0.8,
                blurBackground: "rgba(0, 0, 0, 0.0)",
                blurBorderColor: "rgba(255, 255, 255, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
            "clear-crystal-orange-light": {
                blurRadius: 12,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(255, 165, 0, 0.0)",
                blurBorderColor: "rgba(255, 140, 0, 0.4)",
                
                blurTransition: 0.2,
                blurOpacity: 0.95,
            },
            "clear-crystal-orange-dark": {
                blurRadius: 14,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(255, 69, 0, 0.0)",
                blurBorderColor: "rgba(255, 140, 0, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
            "clear-crystal-blue-light": {
                blurRadius: 12,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(0, 123, 255, 0.0)",
                blurBorderColor: "rgba(0, 86, 179, 0.4)",
                
                blurTransition: 0.2,
                blurOpacity: 0.95,
            },
            "clear-crystal-blue-dark": {
                blurRadius: 14,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(0, 51, 160, 0.0)",
                blurBorderColor: "rgba(0, 86, 179, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
            "clear-crystal-green-light": {
                blurRadius: 12,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(40, 167, 69, 0.0)",
                blurBorderColor: "rgba(21, 87, 36, 0.4)",
                
                blurTransition: 0.2,
                blurOpacity: 0.95,
            },
            "clear-crystal-green-dark": {
                blurRadius: 14,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(21, 87, 36, 0.0)",
                blurBorderColor: "rgba(21, 87, 36, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
            "clear-crystal-purple-light": {
                blurRadius: 12,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(102, 51, 153, 0.0)",
                blurBorderColor: "rgba(75, 0, 130, 0.4)",
                
                blurTransition: 0.2,
                blurOpacity: 0.95,
            },
            "clear-crystal-purple-dark": {
                blurRadius: 14,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(75, 0, 130, 0.0)",
                blurBorderColor: "rgba(75, 0, 130, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
            "clear-crystal-red-light": {
                blurRadius: 12,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(220, 53, 69, 0.0)",
                blurBorderColor: "rgba(176, 42, 55, 0.4)",
                
                blurTransition: 0.2,
                blurOpacity: 0.95,
            },
            "clear-crystal-red-dark": {
                blurRadius: 14,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(176, 42, 55, 0.0)",
                blurBorderColor: "rgba(176, 42, 55, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
            "clear-crystal-pink-light": {
                blurRadius: 12,
                blurSaturate: 1.2,
                blurContrast: 1.1,
                blurBrightness: 1.0,
                blurBackground: "rgba(255, 105, 180, 0.0)",
                blurBorderColor: "rgba(255, 20, 147, 0.4)",
                
                blurTransition: 0.2,
                blurOpacity: 0.95,
            },
            "clear-crystal-pink-dark": {
                blurRadius: 14,
                blurSaturate: 0.8,
                blurContrast: 0.8,
                blurBrightness: 0.7,
                blurBackground: "rgba(255, 20, 147, 0.0)",
                blurBorderColor: "rgba(255, 20, 147, 0.2)",
                
                blurTransition: 0.2,
                blurOpacity: 0.9,
            },
        };
    }

    // ===== CSS GENERATION METHODS =====

    /**
     * Generate backdrop-filter CSS string
     * @param {number} radius - Blur radius in pixels
     * @param {number} saturate - Saturation multiplier (0.0-2.0)
     * @param {number} contrast - Contrast multiplier (0.0-2.0)
     * @param {number} brightness - Brightness multiplier (0.0-2.0)
     * @returns {string} Backdrop-filter CSS or empty string if disabled
     */
    getBackdropFilter(radius, saturate, contrast, brightness) {
        if (radius <= 0 || !this.extension.cssManager.hasBackdropFilter) {
            return "";
        }

        return `backdrop-filter: blur(${radius}px) saturate(${saturate}) contrast(${contrast}) brightness(${brightness});`;
    }

    /**
     * Generate dynamic shadow CSS with independent inset glow system (Phase 2.5E)
     * Supports both user-controlled inset glow (panels) and formula-based inset (other elements)
     *
     * @param {string} elementType - Type of element ('panel', 'popup', 'notification', 'osd', 'tooltip', 'alttab')
     * @param {number} borderWidth - Border width in pixels (affects adaptive minimum for panels)
     * @param {Object|null} insetGlowConfig - Inset glow configuration object (null = Phase 2.5D fallback)
     * @returns {string} Complete box-shadow CSS rule
     *
     * @example
     * // Panel with Phase 2.5E inset glow
     * _generateShadowCSS('panel', 2, { enabled: true })
     * // Uses enable-inset-glow setting + user blur/intensity/color
     *
     * @example
     * // Popup with Phase 2.5D formula-based inset
     * _generateShadowCSS('popup', 2, null)
     * // Uses formula-based inset when borderWidth > 0
     */
    _generateShadowCSS(elementType, borderWidth, glowConfig = null, shadowMode = 'normal') {
        const { STYLING } = require("./constants");

        // Get shadow settings
        const shadowSpread = this.extension.settings.getValue("shadow-spread");
        const shadowColor = this.extension.settings.getValue("accent-shadow-color");

        // Calculate outer shadow
        const baseBlur = Math.round(shadowSpread * STYLING.SHADOW_BASE_MULTIPLIER);
        const multiplier = STYLING.SHADOW_BLUR_MULTIPLIERS[elementType] || 1.0;
        const outerBlur = Math.round(baseBlur * multiplier);

        // Get glow mode (new setting: inset/outset/none)
        const glowMode = this.extension.settings.getValue("glow-mode") || "none";

        // Check if glow is enabled for this element
        const shouldApplyGlow = glowMode !== "none";

        this.extension.debugLog(
            `[GlowMode] _generateShadowCSS: elementType=${elementType}, ` +
                `glowMode=${glowMode}, shouldApply=${shouldApplyGlow}`
        );

        // Start with outer shadow; 'sides' mode uses lateral offsets only (no top/bottom bleed)
        const shadowValue = shadowMode === 'sides'
            ? `${outerBlur}px 0 ${outerBlur}px ${shadowColor}, -${outerBlur}px 0 ${outerBlur}px ${shadowColor}`
            : `0 ${STYLING.SHADOW_VERTICAL_OFFSET}px ${outerBlur}px ${shadowColor}`;
        let css = `box-shadow: ${shadowValue}`;
        let glowEffect = "";

        // Apply glow effect if enabled; skip on sub-menus (sides mode) to avoid center glow artifact
        if (shouldApplyGlow && shadowMode !== 'sides') {
            let glowBlur = this.extension.settings.getValue("glow-blur") || STYLING.INSET_GLOW_BLUR_DEFAULT;
            const glowIntensity = this.extension.settings.getValue("glow-intensity") || STYLING.INSET_GLOW_INTENSITY_DEFAULT;

            // Clamp to valid range
            glowBlur = Math.max(Math.min(glowBlur, STYLING.INSET_GLOW_BLUR_MAX), STYLING.INSET_GLOW_BLUR_MIN);

            // Get glow color from blur-border-color
            let glowColorSetting = this.extension.settings.getValue("blur-border-color");

            // Smart fallback chain
            if (!glowColorSetting || glowColorSetting === "rgba(255, 255, 255, 1.0)") {
                const isDarkMode = this.extension.themeDetector.isDarkModePreferred();
                const blurBorderColor = this.extension.settings.getValue("blur-border-color");
                const blurBackground = this.extension.settings.getValue("blur-background");

                // Priority 1: Use accent border color
                if (blurBorderColor && blurBorderColor !== "rgba(255, 255, 255, 0.3)") {
                    glowColorSetting = blurBorderColor;
                }
                // Priority 2: Use tint layer background
                else if (blurBackground && blurBackground !== "rgba(255, 255, 255, 0.3)") {
                    glowColorSetting = blurBackground;
                }
                // Priority 3: Theme-appropriate fallback
                else {
                    glowColorSetting = isDarkMode
                        ? "rgba(255, 255, 255, 1.0)"
                        : "rgba(0, 0, 0, 1.0)";
                }
            }

            // Parse glow color and apply intensity
            let glowRgba;
            if (glowColorSetting && (glowColorSetting.includes("rgb(") || glowColorSetting.includes("rgba("))) {
                if (glowColorSetting.includes("rgba(")) {
                    glowRgba = glowColorSetting.replace(/[\d.]+\)$/g, `${glowIntensity})`);
                } else if (glowColorSetting.includes("rgb(")) {
                    glowRgba = glowColorSetting.replace(/\)$/, `, ${glowIntensity})`).replace("rgb(", "rgba(");
                }
            } else {
                glowRgba = `${STYLING.INSET_GLOW_FALLBACK_COLOR}, ${glowIntensity})`;
                this.extension.debugLog(`[GlowMode] Color parsing failed, using fallback`);
            }

            // Apply glow based on mode
            if (glowMode === "inset") {
                glowEffect = `, inset 0 0 ${glowBlur}px ${glowRgba}`;
                this.extension.debugLog(
                    `[GlowMode] Inset glow for ${elementType}: blur=${glowBlur}px, intensity=${glowIntensity}`
                );
            } else if (glowMode === "outset") {
                // Outer glow - shadow extends outward from the element
                glowEffect = `, 0 0 ${glowBlur}px ${glowRgba}`;
                this.extension.debugLog(
                    `[GlowMode] Outset glow for ${elementType}: blur=${glowBlur}px, intensity=${glowIntensity}`
                );
            }
        }

        css += glowEffect + " !important;";

        this.extension.debugLog(
            `Shadow generated for ${elementType}: outer=${outerBlur}px, ` +
                `glow=${glowEffect ? "yes" : "none"}, spread=${shadowSpread}`
        );

        return css;
    }

    /**
     * Generate complete panel CSS for single-actor approach (Phase 2.5E)
     * Combines background, blur, border, and shadow with independent inset glow system
     * @param {Object} config - Configuration object
     * @param {string} config.backgroundColor - Background color (rgba string)
     * @param {number} config.borderRadius - Border radius in pixels
     * @param {number} config.blurRadius - Blur radius
     * @param {number} config.blurSaturate - Saturation multiplier
     * @param {number} config.blurContrast - Contrast multiplier
     * @param {number} config.blurBrightness - Brightness multiplier
     * @param {string} config.borderColor - Border color (rgba string)
     * @param {number} config.borderWidth - Border width in pixels
     * @param {number} config.transition - Transition duration in seconds
     * @returns {string} Complete inline CSS string
     * @since Phase 2.5E
     */
    generatePanelCSS(config) {
        return this._generateElementCSS("panel", config, false);
    }

    /**
     * Generate panel shadow layer CSS (outer shadow only)
     * Used for multi-actor panel system where shadow is on separate layer
     * @param {Object} config - Configuration object
     * @param {number} config.borderRadius - Border radius in pixels
     * @param {number} config.borderWidth - Border width (determines shadow type)
     * @param {number} config.transition - Transition duration in seconds
     * @returns {string} Inline CSS string for shadow layer
     */
    generatePanelShadowLayerCSS(config) {
        const cacheKey = `panel_shadow_${config.borderRadius}_${config.borderWidth}_${config.transition}`;

        if (this._templateCache.has(cacheKey)) {
            this._cacheHits++;
            this._updateCacheAccess(cacheKey);
            return this._templateCache.get(cacheKey);
        }

        this._cacheMisses++;

        const { STYLING } = require("./constants");

        // Get user settings
        const shadowSpread = this.extension.settings.getValue("shadow-spread");
        const shadowColor = this.extension.settings.getValue("accent-shadow-color");

        // Calculate shadow blur (outer shadow only, no inset glow)
        const baseBlur = Math.round(shadowSpread * STYLING.SHADOW_BASE_MULTIPLIER);
        const multiplier = STYLING.SHADOW_BLUR_MULTIPLIERS.panel || 1.0;
        const outerBlur = Math.round(baseBlur * multiplier);

        // Build shadow layer CSS
        let css = `
            background-color: transparent;
            border-radius: ${config.borderRadius}px;
            box-shadow: 0 ${STYLING.SHADOW_VERTICAL_OFFSET}px ${outerBlur}px ${shadowColor} !important;
            transition: all ${config.transition}s ease;
            contain: layout style paint;
            transform: translateZ(0);
        `;

        this._addToCache(cacheKey, css);
        return css;
    }

    /**
     * Generate panel background layer CSS (background + blur + border + inset glow)
     * Used for multi-actor panel system where background is on separate layer
     * @param {Object} config - Configuration object (same structure as generatePanelCSS)
     * @returns {string} Inline CSS string for background layer
     */
    generatePanelBackgroundLayerCSS(config) {
        const cacheKey = `panel_bg_${config.backgroundColor}_${config.opacity}_${config.borderRadius}_${config.blurRadius}_${config.blurSaturate}_${config.blurContrast}_${config.blurBrightness}_${config.borderColor}_${config.borderWidth}_${config.transition}`;

        if (this._templateCache.has(cacheKey)) {
            this._cacheHits++;
            this._updateCacheAccess(cacheKey);
            return this._templateCache.get(cacheKey);
        }

        this._cacheMisses++;

        const { STYLING } = require("./constants");

        // Generate backdrop-filter
        const backdropFilter = this.getBackdropFilter(
            config.blurRadius,
            config.blurSaturate,
            config.blurContrast,
            config.blurBrightness
        );

        // Build background layer CSS
        let css = `
            background-color: ${config.backgroundColor};
            border-radius: ${config.borderRadius}px;
            ${backdropFilter}
            transition: all ${config.transition}s ease;
        `;

        // Add border if width > 0
        if (config.borderWidth > 0) {
            css += `border: ${config.borderWidth}px solid ${config.borderColor};`;

            // Add inset glow for glossy effect (only when border present)
            const shadowSpread = this.extension.settings.getValue("shadow-spread");
            const baseBlur = Math.round(shadowSpread * STYLING.SHADOW_BASE_MULTIPLIER);
            const multiplier = STYLING.SHADOW_BLUR_MULTIPLIERS.panel || 1.0;
            const outerBlur = Math.round(baseBlur * multiplier);
            const insetBlur = Math.round(outerBlur * STYLING.SHADOW_INSET_MULTIPLIER);
            const insetGlowColor = this.extension.blurBackground;

            css += `box-shadow: inset 0 0 ${insetBlur}px ${insetGlowColor} !important;`;
        }

        // Performance optimizations
        css += `
            contain: layout style paint;
            will-change: backdrop-filter, background-color;
            transform: translateZ(0);
        `;

        this._addToCache(cacheKey, css);
        return css;
    }

    /**
     * Generate popup menu CSS with blur effects
     * @param {Object} config - Configuration object (same structure as generatePanelCSS)
     * @returns {string} Complete inline CSS string
     */
    generatePopupCSS(config) {
        return this._generateElementCSS("popup", config, true);
    }

    /**
     * Generate notification CSS with blur effects
     * @param {Object} config - Configuration object
     * @returns {string} Complete inline CSS string
     */
    generateNotificationCSS(config) {
        return this._generateElementCSS("notification", config, true);
    }

    /**
     * Generate OSD (On-Screen Display) CSS with blur effects
     * @param {Object} config - Configuration object
     * @returns {string} Complete inline CSS string
     */
    generateOSDCSS(config) {
        return this._generateElementCSS("osd", config, true);
    }

    /**
     * Generate tooltip CSS with blur effects
     * @param {Object} config - Configuration object
     * @returns {string} Complete inline CSS string
     */
    generateTooltipCSS(config) {
        return this._generateElementCSS("tooltip", config, true);
    }

    /**
     * Generate Alt-Tab switcher CSS with blur effects
     * @param {Object} config - Configuration object
     * @returns {string} Complete inline CSS string
     */
    generateAltTabCSS(config) {
        return this._generateElementCSS("alttab", config, true);
    }

    // ===== CACHE MANAGEMENT METHODS =====

    /**
     * Add CSS to cache with LRU eviction
     * @param {string} key - Cache key
     * @param {string} css - CSS string to cache
     */
    _addToCache(key, css) {
        // Evict oldest entry if cache is full
        if (this._templateCache.size >= this._maxCacheSize) {
            const oldestKey = this._cacheOrder.shift();
            this._templateCache.delete(oldestKey);
        }

        this._templateCache.set(key, css);
        this._cacheOrder.push(key);
    }

    /**
     * Update cache access order (move to end = most recently used)
     * @param {string} key - Cache key that was accessed
     */
    _updateCacheAccess(key) {
        const index = this._cacheOrder.indexOf(key);
        if (index > -1) {
            this._cacheOrder.splice(index, 1);
            this._cacheOrder.push(key);
        }
    }

    /**
     * Clear template cache (call on theme/wallpaper changes)
     */
    clearCache() {
        this._templateCache.clear();
        this._cacheOrder = [];
        this._cacheHits = 0;
        this._cacheMisses = 0;
        this.extension.debugLog("Template cache cleared");
    }

    /**
     * Get cache statistics for debugging
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        const total = this._cacheHits + this._cacheMisses;
        const hitRate = total > 0 ? ((this._cacheHits / total) * 100).toFixed(1) : 0;

        return {
            size: this._templateCache.size,
            maxSize: this._maxCacheSize,
            hits: this._cacheHits,
            misses: this._cacheMisses,
            hitRate: hitRate + "%",
        };
    }

    /**
     * Log cache statistics
     */
    logCacheStats() {
        const stats = this.getCacheStats();
        this.extension.debugLog(
            `Template cache stats: ${stats.size}/${stats.maxSize} entries, ${stats.hits} hits, ${stats.misses} misses, ${stats.hitRate} hit rate`
        );
    }

    /**
     * Base method for generating element CSS with blur effects
     * Consolidates common logic from generatePanelCSS, generatePopupCSS, generateNotificationCSS, generateOSDCSS, generateTooltipCSS, generateAltTabCSS
     * @param {string} elementType - Element type ('panel'|'popup'|'notification'|'osd'|'tooltip'|'alttab')
     * @param {Object} config - Configuration object with backgroundColor, opacity, borderRadius, blurRadius, etc.
     * @param {boolean} includeOpacityInCacheKey - Whether to include opacity in cache key (panel=false, others=true)
     * @returns {string} Complete inline CSS string
     * @private
     */
    _generateElementCSS(elementType, config, includeOpacityInCacheKey) {
        // Get glow mode setting (new: inset/outset/none)
        const glowMode = this.extension.settings.getValue("glow-mode") || "none";
        const glowEnabled = glowMode !== "none";
        
        // Build glow config for all elements when glow is enabled
        const glowConfig = glowEnabled
            ? {
                  mode: glowMode,
                  blur: this.extension.settings.getValue("glow-blur"),
                  intensity: this.extension.settings.getValue("glow-intensity"),
                  color: this.extension.settings.getValue("blur-border-color"),
              }
            : null;

        // Generate cache key with prefix and optional opacity
        const glowKey = glowConfig ? `_glow_${glowMode}_${glowConfig.blur}_${glowConfig.intensity}` : "_noglow";
        const opacityKey = includeOpacityInCacheKey ? `_${config.opacity}` : "";
        const borderWidthKey = `_${config.borderWidth}`;
        const shadowModeKey = config.shadowMode ? `_${config.shadowMode}` : "";
        // Use borderRadiusCSS key if available; replace spaces to keep key clean
        const borderRadiusKey = config.borderRadiusCSS !== undefined
            ? config.borderRadiusCSS.replace(/\s/g, '_')
            : String(config.borderRadius);
        const cacheKey = `${elementType}_${config.backgroundColor}${opacityKey}_${borderRadiusKey}_${config.blurRadius}_${config.blurSaturate}_${config.blurContrast}_${config.blurBrightness}_${config.borderColor}${borderWidthKey}_${config.transition}${glowKey}${shadowModeKey}`;

        if (this._templateCache.has(cacheKey)) {
            this._cacheHits++;
            this._updateCacheAccess(cacheKey);
            return this._templateCache.get(cacheKey);
        }

        this._cacheMisses++;

        // Generate backdrop-filter
        const backdropFilter = this.getBackdropFilter(
            config.blurRadius,
            config.blurSaturate,
            config.blurContrast,
            config.blurBrightness
        );

        const shadowCSS = this._generateShadowCSS(elementType, config.borderWidth, glowConfig, config.shadowMode || 'normal');

        // Determine border-radius CSS value: use precomputed string or generate from number
        const borderRadiusValue = config.borderRadiusCSS !== undefined
            ? config.borderRadiusCSS
            : `${config.borderRadius}px`;

        // Build CSS string
        let css = `
            background-color: ${config.backgroundColor};
            border-radius: ${borderRadiusValue};
            ${backdropFilter}
            ${shadowCSS}
            transition: all ${config.transition}s ease;
        `;

        // Border is now deprecated - only add if explicitly needed for non-panel elements
        // and only if borderWidth > 0 (which should be rare with hardcoded 0 default)
        if (elementType !== "panel" && config.borderWidth > 0) {
            css += `border: ${config.borderWidth}px solid ${config.borderColor};`;
        }

        // Add panel-specific CSS (performance optimizations)
        if (elementType === "panel") {
            css += `
                contain: layout style paint;
                will-change: backdrop-filter, background-color;
                transform: translateZ(0);
            `;
        }

        // Add popup-specific CSS
        if (elementType === "popup") {
            css += `
                contain: layout style paint;
                will-change: backdrop-filter, background-color;
            `;
        }

        this._addToCache(cacheKey, css);
        return css;
    }

    // ===== TEMPLATE SYSTEM METHODS =====

    /**
     * Apply a template to the extension settings
     * @param {string} templateName - Name of the template to apply
     */
    applyTemplate(templateName) {
        this.extension.debugLog(`Applying blur template: ${templateName}`);

        const selectedTemplate = this.templates[templateName];
        if (!selectedTemplate) {
            this.extension.debugLog(`Invalid template selected: ${templateName}`);
            return;
        }

        try {
            // Apply template values to settings
            Object.keys(selectedTemplate).forEach((key) => {
                const settingKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
                this.extension.settings.setValue(settingKey, selectedTemplate[key]);
            });

            this.extension.debugLog(`Blur template ${templateName} applied successfully`);

            // Update CSS variables to apply changes immediately
            this.extension.cssManager.updateAllVariables();
            this.extension.panelStyler.applyPanelStyles();
        } catch (e) {
            this.extension.debugLog("Error applying blur template:", e);
        }
    }

    /**
     * Get list of available templates
     * @returns {Array} Array of template names
     */
    getAvailableTemplates() {
        return Object.keys(this.templates);
    }

    /**
     * Get template configuration
     * @param {string} templateName - Name of the template
     * @returns {Object|null} Template configuration or null if not found
     */
    getTemplate(templateName) {
        return this.templates[templateName] || null;
    }

    /**
     * Cleanup cache and reset statistics

     * Should be called when extension is disabled to free memory
     */
    cleanup() {
        this.extension.debugLog(
            `Clearing template cache (${this._templateCache.size} entries, ` +
                `${this._cacheHits} hits, ${this._cacheMisses} misses, ` +
                `hit rate: ${this._getCacheHitRate()}%)`
        );

        this._templateCache.clear();
        this._cacheOrder = [];
        this._cacheHits = 0;
        this._cacheMisses = 0;

        this.extension.debugLog("Template cache cleanup complete");
    }

    /**
     * Get cache hit rate for debugging
     * @returns {string} Hit rate percentage
     * @private
     */
    _getCacheHitRate() {
        const total = this._cacheHits + this._cacheMisses;
        if (total === 0) return "0.0";
        return ((this._cacheHits / total) * 100).toFixed(1);
    }
}

module.exports = BlurTemplateManager;
