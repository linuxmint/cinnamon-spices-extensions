/**
 * ThemeUtils - Color mathematics and theme analysis utilities
 *
 * Provides advanced color manipulation, WCAG contrast calculations,
 * HSP perceived brightness detection, and theme color analysis.
 *
 * Adapted from GNOME Shell 43.9 ThemeUtils for Cinnamon compatibility
 *
 * @module themeUtils
 */

const { THEME_UTILS } = require("./constants");

/**
 * Theme utilities class with static methods for color operations
 */
class ThemeUtils {
    // ===== COLOR MATHEMATICS =====

    /**
     * Calculate HSP (Highly Sensitive Poo) perceived brightness
     * Uses human eye sensitivity weighting for accurate brightness perception
     *
     * @param {number|Array} r - Red value (0-255) or [r,g,b] array
     * @param {number} g - Green value (0-255)
     * @param {number} b - Blue value (0-255)
     * @returns {number} HSP brightness value (0-255)
     *
     * @example
     * ThemeUtils.getHSP(46, 52, 64);      // Returns ~52.8
     * ThemeUtils.getHSP([255, 255, 255]); // Returns 255
     */
    static getHSP(r, g, b) {
        if (Array.isArray(r)) {
            [r, g, b] = r.map((c) => parseInt(c));
        }
        // HSP equation for perceived brightness
        // Red: 29.9%, Green: 58.7%, Blue: 11.4% (human eye sensitivity)
        return Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    }

    /**
     * Determine if background is dark based on HSP threshold
     *
     * @param {number|Array} r - Red value (0-255) or [r,g,b] array
     * @param {number} g - Green value (0-255)
     * @param {number} b - Blue value (0-255)
     * @returns {boolean} True if background is dark
     *
     * @example
     * ThemeUtils.getBgDark(46, 52, 64);   // Returns true (dark theme)
     * ThemeUtils.getBgDark(245, 246, 247); // Returns false (light theme)
     */
    static getBgDark(r, g, b) {
        let hsp = this.getHSP(r, g, b);
        return hsp <= THEME_UTILS.HSP_DARK_THRESHOLD;
    }

    /**
     * Mix two colors by a factor
     *
     * @param {number} startColor - Start color component (0-255)
     * @param {number} endColor - End color component (0-255)
     * @param {number} factor - Mix factor (0 to 1)
     * @returns {number} Mixed color component (0-255)
     *
     * @example
     * ThemeUtils.colorMix(0, 255, 0.5);   // Returns 128
     * ThemeUtils.colorMix(100, 200, 0.25); // Returns 125
     */
    static colorMix(startColor, endColor, factor) {
        let color = startColor + factor * (endColor - startColor);
        return Math.max(0, Math.min(255, parseInt(color)));
    }

    /**
     * Create lighter/darker shade of color
     *
     * @param {Array} color - [r, g, b] array
     * @param {number} factor - Shade factor (+ve = lighter, -ve = darker, range: -1 to 1)
     * @returns {Array} Shaded color [r, g, b]
     *
     * @example
     * ThemeUtils.colorShade([46, 52, 64], 0.3);  // Lighten by 30%
     * ThemeUtils.colorShade([200, 200, 200], -0.5); // Darken by 50%
     */
    static colorShade(color, factor) {
        const [r, g, b] = color.map((c) => parseInt(c));

        if (factor > 0) {
            // Lighten: mix with white
            return [this.colorMix(r, 255, factor), this.colorMix(g, 255, factor), this.colorMix(b, 255, factor)];
        } else {
            // Darken: reduce intensity
            const darkFactor = 1 + factor; // Convert to 0-1 range
            return [Math.round(r * darkFactor), Math.round(g * darkFactor), Math.round(b * darkFactor)];
        }
    }

    /**
     * Calculate WCAG 2.0 contrast ratio between two colors
     *
     * @param {Array} color1 - First color [r, g, b]
     * @param {Array} color2 - Second color [r, g, b]
     * @returns {number} Contrast ratio (1 to 21)
     *
     * @example
     * ThemeUtils.contrastRatio([0, 0, 0], [255, 255, 255]); // Returns 21 (max contrast)
     * ThemeUtils.contrastRatio([128, 128, 128], [130, 130, 130]); // Returns ~1.01
     */
    static contrastRatio(color1, color2) {
        const relativeLuminance = (color) => {
            const [r, g, b] = color.map((val) => {
                val /= 255;
                return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const luminance1 = relativeLuminance(color1);
        const luminance2 = relativeLuminance(color2);
        const lighter = Math.max(luminance1, luminance2);
        const darker = Math.min(luminance1, luminance2);

        return (lighter + 0.05) / (darker + 0.05);
    }

    /**
     * Generate automatic foreground color based on background
     * Returns white text for dark backgrounds, black text for light backgrounds
     *
     * @param {Array} bgColor - Background color [r, g, b]
     * @param {number} alpha - Alpha channel (0-1, default: 1.0)
     * @returns {Array} Foreground color [r, g, b, a]
     *
     * @example
     * ThemeUtils.getAutoFgColor([46, 52, 64]);     // Returns [250, 250, 250, 1.0]
     * ThemeUtils.getAutoFgColor([245, 246, 247]);  // Returns [5, 5, 5, 1.0]
     */
    static getAutoFgColor(bgColor, alpha = 1.0) {
        const [r, g, b] = bgColor.map((c) => parseInt(c));
        const isDark = this.getBgDark(r, g, b);

        if (isDark) {
            return [250, 250, 250, alpha]; // Light text on dark bg
        } else {
            return [5, 5, 5, alpha]; // Dark text on light bg
        }
    }

    /**
     * Generate automatic highlight/hover color for menu items
     * Lightens dark backgrounds, darkens light backgrounds
     *
     * @param {Array} bgColor - Background color [r, g, b]
     * @param {number} intensity - Intensity of highlight (0-1, default: from constants)
     * @returns {Array} Highlight color [r, g, b]
     *
     * @example
     * ThemeUtils.getAutoHighlightColor([46, 52, 64]);     // Returns lighter shade
     * ThemeUtils.getAutoHighlightColor([245, 246, 247], 0.2); // Returns darker shade
     */
    static getAutoHighlightColor(bgColor, intensity = null) {
        // Use constant default if not provided
        if (intensity === null) {
            intensity = THEME_UTILS.AUTO_HIGHLIGHT_INTENSITY;
        }

        const [r, g, b] = bgColor.map((c) => parseInt(c));
        const isDark = this.getBgDark(r, g, b);

        if (isDark) {
            // Lighten dark backgrounds
            return this.colorShade([r, g, b], intensity);
        } else {
            // Darken light backgrounds
            return this.colorShade([r, g, b], -intensity);
        }
    }

    // ===== COLOR FORMAT CONVERSIONS =====

    /**
     * Convert RGB to hex string
     *
     * @param {number|Array} r - Red (0-255) or [r,g,b] array
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {string} Hex color string (#RRGGBB)
     *
     * @example
     * ThemeUtils.rgbToHex(46, 52, 64);    // Returns "#2e3440"
     * ThemeUtils.rgbToHex([255, 255, 255]); // Returns "#ffffff"
     */
    static rgbToHex(r, g, b) {
        if (Array.isArray(r)) {
            [r, g, b] = r.map((c) => parseInt(c));
        }
        return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }

    /**
     * Convert hex to RGB array
     *
     * @param {string} hex - Hex color string (#RRGGBB or #RGB)
     * @returns {Array|null} [r, g, b] array or null if invalid
     *
     * @example
     * ThemeUtils.hexToRgb("#2e3440"); // Returns [46, 52, 64]
     * ThemeUtils.hexToRgb("#fff");    // Returns [255, 255, 255]
     */
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : null;
    }

    /**
     * Parse CSS rgba string to array
     *
     * @param {string} rgbaStr - CSS rgba string
     * @returns {Array|null} [r, g, b, a] array or null if invalid
     *
     * @example
     * ThemeUtils.parseRgbaString("rgba(46, 52, 64, 0.8)"); // Returns [46, 52, 64, 0.8]
     * ThemeUtils.parseRgbaString("rgb(255, 255, 255)");    // Returns [255, 255, 255, 1.0]
     */
    static parseRgbaString(rgbaStr) {
        const match = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return null;

        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), match[4] ? parseFloat(match[4]) : 1.0];
    }

    /**
     * Create CSS rgba string with clamped RGB values
     *
     * @param {number|Array} r - Red (0-255) or [r,g,b] or [r,g,b,a] array
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @param {number} a - Alpha (0-1, default: 1.0)
     * @returns {string} CSS rgba string
     *
     * @example
     * ThemeUtils.rgbaToCss(46, 52, 64, 0.8);      // Returns "rgba(46, 52, 64, 0.8)"
     * ThemeUtils.rgbaToCss([255, 255, 255]);      // Returns "rgba(255, 255, 255, 1)"
     * ThemeUtils.rgbaToCss([200, 200, 200, 0.5]); // Returns "rgba(200, 200, 200, 0.5)"
     */
    static rgbaToCss(r, g, b, a = 1.0) {
        if (Array.isArray(r)) {
            if (r.length === 4) {
                [r, g, b, a] = r;
            } else {
                [r, g, b] = r;
            }
        }
        // Clamp RGB values to valid 0-255 range
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
        // Clamp alpha to 0-1 range
        a = Math.max(0, Math.min(1, a));

        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    /**
     * Unified color parser - handles hex, rgb(), rgba(), and array formats
     *
     * @param {string|Array} input - Color in any supported format
     * @returns {Object|null} {r, g, b, a, format} or null if invalid
     *
     * @example
     * ThemeUtils.parseColor("#2e3440");              // {r:46, g:52, b:64, a:1.0, format:'hex'}
     * ThemeUtils.parseColor("rgba(46, 52, 64, 0.8)"); // {r:46, g:52, b:64, a:0.8, format:'css'}
     * ThemeUtils.parseColor([46, 52, 64]);           // {r:46, g:52, b:64, a:1.0, format:'array'}
     */
    static parseColor(input) {
        // Handle null/undefined
        if (!input) return null;

        // Array input [r, g, b] or [r, g, b, a]
        if (Array.isArray(input)) {
            if (input.length < 3) return null;
            return {
                r: parseInt(input[0]),
                g: parseInt(input[1]),
                b: parseInt(input[2]),
                a: input[3] !== undefined ? parseFloat(input[3]) : 1.0,
                format: "array",
            };
        }

        // String input
        if (typeof input !== "string") return null;

        // Hex format #RRGGBB or #RGB
        if (input.startsWith("#")) {
            const rgb = this.hexToRgb(input);
            return rgb
                ? {
                      r: rgb[0],
                      g: rgb[1],
                      b: rgb[2],
                      a: 1.0,
                      format: "hex",
                  }
                : null;
        }

        // RGBA/RGB format
        const rgbaMatch = input.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
        if (rgbaMatch) {
            return {
                r: parseInt(rgbaMatch[1]),
                g: parseInt(rgbaMatch[2]),
                b: parseInt(rgbaMatch[3]),
                a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0,
                format: "css",
            };
        }

        return null;
    }

    /**
     * Convert color to requested output format
     *
     * @param {string|Array} input - Color in any format
     * @param {string} outputFormat - 'hex', 'css', 'array', 'object'
     * @param {number} alphaOverride - Optional alpha override (0.0-1.0)
     * @returns {string|Array|Object|null} Color in requested format
     *
     * @example
     * ThemeUtils.convertColor("#2e3440", "css");              // "rgba(46, 52, 64, 1)"
     * ThemeUtils.convertColor([46, 52, 64], "hex");           // "#2e3440"
     * ThemeUtils.convertColor("rgba(46, 52, 64, 0.8)", "array"); // [46, 52, 64, 0.8]
     */
    static convertColor(input, outputFormat = "css", alphaOverride = null) {
        const parsed = this.parseColor(input);
        if (!parsed) return null;

        const finalAlpha = alphaOverride !== null ? alphaOverride : parsed.a;

        switch (outputFormat) {
            case "hex":
                // Hex doesn't support alpha
                return this.rgbToHex(parsed.r, parsed.g, parsed.b);

            case "css":
                return this.rgbaToCss(parsed.r, parsed.g, parsed.b, finalAlpha);

            case "array":
                return [parsed.r, parsed.g, parsed.b, finalAlpha];

            case "object":
                return { r: parsed.r, g: parsed.g, b: parsed.b, a: finalAlpha };

            default:
                return null;
        }
    }

    /**
     * Validate if color string/array is valid
     *
     * @param {string|Array} color - Color to validate
     * @returns {boolean} True if valid color format
     *
     * @example
     * ThemeUtils.isValidColor("#2e3440");              // true
     * ThemeUtils.isValidColor("rgba(46, 52, 64, 0.8)"); // true
     * ThemeUtils.isValidColor("invalid");              // false
     */
    static isValidColor(color) {
        return this.parseColor(color) !== null;
    }

    // ===== VALIDATION UTILITIES =====

    /**
     * Validate color contrast meets WCAG guidelines
     *
     * @param {Array} fgColor - Foreground color [r, g, b]
     * @param {Array} bgColor - Background color [r, g, b]
     * @param {string} level - WCAG level ('AA', 'AA_LARGE', 'AAA', 'AAA_LARGE')
     * @returns {boolean} True if contrast meets requirement
     *
     * @example
     * ThemeUtils.validateContrast([0, 0, 0], [255, 255, 255], 'AA');     // true (21:1)
     * ThemeUtils.validateContrast([128, 128, 128], [130, 130, 130], 'AA'); // false (~1:1)
     */
    static validateContrast(fgColor, bgColor, level = "AA") {
        const ratio = this.contrastRatio(fgColor, bgColor);
        const minRatio = THEME_UTILS.MIN_CONTRAST_RATIO[level] || THEME_UTILS.MIN_CONTRAST_RATIO.AA;
        return ratio >= minRatio;
    }

    /**
     * Ensure minimum contrast by adjusting foreground color
     * Iteratively lightens/darkens foreground until minimum contrast is met
     *
     * @param {Array} fgColor - Foreground color [r, g, b]
     * @param {Array} bgColor - Background color [r, g, b]
     * @param {number} minRatio - Minimum contrast ratio (default: WCAG AA)
     * @returns {Array} Adjusted foreground color [r, g, b]
     *
     * @example
     * ThemeUtils.ensureContrast([100, 100, 100], [120, 120, 120], 4.5); // Returns adjusted color
     */
    static ensureContrast(fgColor, bgColor, minRatio = null) {
        // Use constant default if not provided
        if (minRatio === null) {
            minRatio = THEME_UTILS.MIN_CONTRAST_RATIO.AA;
        }

        let adjustedFg = [...fgColor];
        let ratio = this.contrastRatio(adjustedFg, bgColor);

        if (ratio >= minRatio) return adjustedFg;

        const isDarkBg = this.getBgDark(...bgColor);
        const direction = isDarkBg ? 1 : -1; // Lighten on dark, darken on light

        for (
            let adjustment = THEME_UTILS.CONTRAST_ADJUSTMENT_STEP;
            adjustment <= 1;
            adjustment += THEME_UTILS.CONTRAST_ADJUSTMENT_STEP
        ) {
            adjustedFg = this.colorShade(fgColor, direction * adjustment);
            ratio = this.contrastRatio(adjustedFg, bgColor);

            if (ratio >= minRatio) return adjustedFg;
        }

        // Fallback to high contrast
        return isDarkBg ? [255, 255, 255] : [0, 0, 0];
    }

    /**
     * Generate complementary color (opposite on color wheel)
     *
     * @param {Array|string} color - Color [r, g, b] or hex string
     * @returns {Array} Complementary color [r, g, b]
     *
     * @example
     * ThemeUtils.getComplementaryColor([46, 52, 64]); // Returns [209, 203, 191]
     * ThemeUtils.getComplementaryColor("#2e3440");    // Returns [209, 203, 191]
     */
    static getComplementaryColor(color) {
        const [r, g, b] = Array.isArray(color) ? color : this.hexToRgb(color);
        return [255 - r, 255 - g, 255 - b];
    }

    // ===== HSL CONVERSIONS =====

    /**
     * Convert RGB to HSL color space
     *
     * @param {number|Array} r - Red (0-255) or [r,g,b] array
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {Array} [h, s, l] where h is 0-360, s and l are 0-100
     *
     * @example
     * ThemeUtils.rgbToHsl(46, 52, 64);    // Returns [220, 16.4, 21.6]
     * ThemeUtils.rgbToHsl([255, 0, 0]);   // Returns [0, 100, 50]
     */
    static rgbToHsl(r, g, b) {
        if (Array.isArray(r)) {
            [r, g, b] = r;
        }

        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h,
            s,
            l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r:
                    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                    break;
                case g:
                    h = ((b - r) / d + 2) / 6;
                    break;
                case b:
                    h = ((r - g) / d + 4) / 6;
                    break;
            }
        }

        return [h * 360, s * 100, l * 100];
    }

    /**
     * Convert HSL to RGB color space
     *
     * @param {number|Array} h - Hue (0-360) or [h,s,l] array
     * @param {number} s - Saturation (0-100)
     * @param {number} l - Lightness (0-100)
     * @returns {Array} [r, g, b] where each is 0-255
     *
     * @example
     * ThemeUtils.hslToRgb(220, 16.4, 21.6); // Returns [46, 52, 64]
     * ThemeUtils.hslToRgb([0, 100, 50]);    // Returns [255, 0, 0]
     */
    static hslToRgb(h, s, l) {
        if (Array.isArray(h)) {
            [h, s, l] = h;
        }

        h /= 360;
        s /= 100;
        l /= 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    /**
     * Validate if color is suitable for accent color usage
     * Rejects grey/white/black colors, prefers saturated colors
     *
     * @param {number|Array} r - Red (0-255) or [r,g,b] array
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {Object} {isValid: boolean, reason: string}
     *
     * @example
     * ThemeUtils.isValidAccent(255, 100, 50);  // {isValid: true, reason: "Valid accent..."}
     * ThemeUtils.isValidAccent(200, 200, 200); // {isValid: false, reason: "Too desaturated..."}
     */
    static isValidAccent(r, g, b) {
        if (Array.isArray(r)) {
            [r, g, b] = r;
        }

        // Convert to HSL for proper color analysis
        const hsl = this.rgbToHsl(r, g, b);
        const h = hsl[0]; // Hue (0-360)
        const s = hsl[1]; // Saturation (0-100)
        const l = hsl[2]; // Lightness (0-100)

        // Rule 1: Reject colors with very low saturation (grey/white detection)
        if (s < 15) {
            return {
                isValid: false,
                reason: `Too desaturated (S:${s.toFixed(1)}% < 15%) - likely grey/white`,
            };
        }

        // Rule 2: Reject very dark colors (black detection)
        if (l < 25) {
            return {
                isValid: false,
                reason: `Too dark (L:${l.toFixed(1)}% < 25%) - likely black`,
            };
        }

        // Rule 3: Reject very light colors (white detection)
        if (l > 90) {
            return {
                isValid: false,
                reason: `Too light (L:${l.toFixed(1)}% > 90%) - likely white`,
            };
        }

        // Valid accent color
        return {
            isValid: true,
            reason: `Valid accent (H:${h.toFixed(0)}° S:${s.toFixed(1)}% L:${l.toFixed(1)}%)`,
        };
    }

    /**
     * Enhance pastel colors for dark themes
     * Increases saturation and reduces lightness to make colors more vibrant
     *
     * @param {Array} rgb - [r, g, b] array
     * @param {number} saturationBoost - Saturation increase (0-1, default: 0.3)
     * @param {number} lightnessReduction - Lightness reduction (0-1, default: 0.25)
     * @returns {Array} Enhanced [r, g, b] array
     *
     * @example
     * ThemeUtils.enhancePastelColor([200, 180, 220]);        // Returns more vibrant version
     * ThemeUtils.enhancePastelColor([220, 200, 230], 0.4, 0.3); // Stronger enhancement
     */
    static enhancePastelColor(rgb, saturationBoost = 0.3, lightnessReduction = 0.25) {
        const [r, g, b] = rgb;
        const [h, s, l] = this.rgbToHsl(r, g, b);

        // Only enhance if lightness is high (pastel) and saturation is moderate
        if (l > 65 && s > 20) {
            // Boost saturation (but cap at 100)
            const newS = Math.min(100, s + saturationBoost * 100);

            // Reduce lightness to make color more vivid
            const newL = Math.max(35, l - lightnessReduction * 100);

            return this.hslToRgb(h, newS, newL);
        }

        // Return original if not pastel
        return [r, g, b];
    }

    /**
     * Smart color palette generator
     * Generates lighter and darker shades of a base color
     *
     * @param {Array|string} baseColor - Base color [r, g, b] or hex string
     * @param {number} count - Number of colors to generate (default: 5)
     * @returns {Array} Array of color arrays [[r,g,b], [r,g,b], ...]
     *
     * @example
     * ThemeUtils.generateColorPalette([46, 52, 64], 5);
     * // Returns 5 shades: darkest → base → lightest
     */
    static generateColorPalette(baseColor, count = 5) {
        const [r, g, b] = Array.isArray(baseColor) ? baseColor : this.hexToRgb(baseColor);
        const palette = [];

        for (let i = 0; i < count; i++) {
            const factor = (i - Math.floor(count / 2)) * 0.2;
            palette.push(this.colorShade([r, g, b], factor));
        }

        return palette;
    }
}

// Export as Cinnamon module
module.exports = { ThemeUtils };
