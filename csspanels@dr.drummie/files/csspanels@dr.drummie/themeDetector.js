const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const { TIMING, SIGNALS, DEFAULT_COLORS } = require("./constants");
const { ThemeUtils } = require("./themeUtils");
const { GlobalSignalsHandler } = require("./signalHandler");

/**
 * Theme Detector handles theme color and border-radius detection
 * Provides auto-detection capabilities for consistent theming
 */
class ThemeDetector {
    /**
     * Initialize Theme Detector
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.cachedPanelColor = null;
        this.cachedMenuColor = null;
        this.cachedBorderRadius = null;
        this.cachedPopupColor = null;
        this.currentPanelBaseColor = null; // Track base color after detection (Phase 2.5B+)
        this.lastThemeCheck = 0;
        this.lastBorderRadiusCheck = 0;
        this.currentTheme = null; // Store current theme name

        // Performance optimization - cache detectAllThemeProperties
        this.themePropertiesCache = null;
        this.lastThemePropertiesCheck = 0;
        this.themePropertiesCacheTimeout = TIMING.CACHE_THEME_PROPERTIES;

        // Signal management - Phase 2 GlobalSignalsHandler integration
        this._signalsHandler = new GlobalSignalsHandler();

        // Event-driven monitoring
        this.radiusDetectionTimeout = null;
        this._themeChangeTimeout = null; // Added for theme change race condition fix

        // Theme monitoring (Phase 2.5B) - Keep Gio.Settings references to prevent GC
        this._interfaceSettings = null;
        this._cinnamonInterfaceSettings = null;

        this._printAndSaveCurrentTheme();
    }

    /**
     * Setup theme change monitoring with event-driven approach
     */
    setup() {
        try {
            if (Main.themeManager) {
                // Use GlobalSignalsHandler for automatic cleanup
                this._signalsHandler.add([
                    Main.themeManager,
                    SIGNALS.THEME_CHANGED,
                    () => {
                        this.extension.debugLog("Theme changed signal received, waiting for CSS load...");

                        // CRITICAL FIX: Debounce theme detection to avoid race condition
                        // CSS files need time to load into DOM before we can read colors
                        if (this._themeChangeTimeout) {
                            GLib.source_remove(this._themeChangeTimeout);
                        }

                        this._themeChangeTimeout = GLib.timeout_add(
                            GLib.PRIORITY_DEFAULT,
                            TIMING.DEBOUNCE_MEDIUM, // 100ms delay for CSS to load
                            () => {
                                this.extension.debugLog("CSS loaded, re-detecting theme data...");

                                // NEW: Unified theme re-detection with proper module separation
                                const detectedData = this.redetectAllThemeData();
                                this.extension.applyDetectedThemeData(detectedData);

                                this._themeChangeTimeout = null;
                                return false; // Remove timeout
                            }
                        );
                    },
                ]);

                // Event-driven panel size monitoring for radius detection
                if (Main.panel && Main.panel.actor && this.extension.autoDetectRadius) {
                    this._signalsHandler.add([
                        Main.panel.actor,
                        SIGNALS.ALLOCATION_CHANGED,
                        () => {
                            // Debounce radius detection to avoid excessive calls during resize
                            if (this.radiusDetectionTimeout) {
                                GLib.source_remove(this.radiusDetectionTimeout);
                            }
                            this.radiusDetectionTimeout = GLib.timeout_add(
                                GLib.PRIORITY_DEFAULT,
                                TIMING.DEBOUNCE_LONG,
                                () => {
                                    this.extension.onAutoDetectRadiusChanged();
                                    this.radiusDetectionTimeout = null;
                                    return false;
                                }
                            );
                        },
                    ]);
                    this.extension.debugLog("Panel size change monitoring setup for radius detection");
                }

                this.extension.debugLog("Theme change handler setup successfully");
            }

            // Setup color-scheme monitoring (Phase 2.5B)
            this.setupColorSchemeMonitoring();
        } catch (e) {
            this.extension.debugLog("Failed to setup theme change handler:", e);
        }
        this._printAndSaveCurrentTheme();
    }

    /**
     * Invalidate all cached values
     */
    invalidateCache() {
        this.cachedPanelColor = null;
        this.cachedMenuColor = null;
        this.cachedBorderRadius = null;
        this.cachedPopupColor = null;
        this.lastThemeCheck = 0;
        this.lastBorderRadiusCheck = 0;
    }

    /**
     * Cleanup theme change monitoring and event-driven signals
     */
    cleanup() {
        // Cleanup all signal connections automatically
        this._signalsHandler.destroy();

        // Cleanup radius detection timeout (not a signal, needs manual cleanup)
        if (this.radiusDetectionTimeout) {
            GLib.source_remove(this.radiusDetectionTimeout);
            this.radiusDetectionTimeout = null;
            this.extension.debugLog("Radius detection timeout cleaned up");
        }

        // Cleanup theme change debounce timeout
        if (this._themeChangeTimeout) {
            GLib.source_remove(this._themeChangeTimeout);
            this._themeChangeTimeout = null;
        }

        // Clear Gio.Settings references
        this._interfaceSettings = null;
        this._cinnamonInterfaceSettings = null;

        this.extension.debugLog("ThemeDetector cleanup complete");
    }

    /**
     * Safely parse color string with validation and fallback
     * Wrapper around parseColorString() that validates the result and provides sensible fallbacks.
     * Use this for user-provided color inputs (settings, overrides) where invalid values are possible.
     *
     * @param {string} colorString - Color string to parse (rgba/rgb/hex format)
     * @param {Object} fallback - Fallback color if parsing fails or returns default gray
     * @param {string} context - Context description for debug logging (e.g., "popup color", "panel override")
     * @returns {Object} Parsed color {r, g, b} or fallback
     */
    _safeParseColor(colorString, fallback = DEFAULT_COLORS.FALLBACK_DARK, context = "color") {
        try {
            // Validate input
            if (!colorString || typeof colorString !== "string") {
                this.extension.debugLog(`[SafeParse] Invalid ${context} string (not a string):`, colorString);
                return fallback;
            }

            // Parse color
            const parsed = this.parseColorString(colorString);

            // Validate parsed result
            if (
                !parsed ||
                typeof parsed.r !== "number" ||
                typeof parsed.g !== "number" ||
                typeof parsed.b !== "number"
            ) {
                this.extension.debugLog(`[SafeParse] ${context} parsing returned invalid object:`, parsed);
                return fallback;
            }

            // Check if we got the parseColorString default fallback (128, 128, 128)
            // This indicates parsing failed but didn't throw an error
            if (parsed.r === 128 && parsed.g === 128 && parsed.b === 128) {
                this.extension.debugLog(
                    `[SafeParse] ${context} parsing failed (got default gray), using fallback for input:`,
                    colorString
                );
                return fallback;
            }

            // Valid color parsed successfully
            return parsed;
        } catch (e) {
            this.extension.debugLog(`[SafeParse] Exception parsing ${context}:`, e.message);
            return fallback;
        }
    }

    /**
     * Parse color string (rgba or hex) to RGB object
     * @param {string} colorString - Color string in rgba(r,g,b,a) or #hex format
     * @returns {Object} RGB color object with r, g, b properties
     */
    parseColorString(colorString) {
        try {
            // Handle rgba format: rgba(r, g, b, a)
            if (colorString.startsWith("rgba(")) {
                const values = colorString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
                if (values) {
                    return {
                        r: parseInt(values[1]),
                        g: parseInt(values[2]),
                        b: parseInt(values[3]),
                    };
                }
            }

            // Handle rgb format: rgb(r, g, b)
            if (colorString.startsWith("rgb(")) {
                const values = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (values) {
                    return {
                        r: parseInt(values[1]),
                        g: parseInt(values[2]),
                        b: parseInt(values[3]),
                    };
                }
            }

            // Handle hex format: #rrggbb
            if (colorString.startsWith("#")) {
                const hex = colorString.slice(1);
                if (hex.length === 6) {
                    return {
                        r: parseInt(hex.slice(0, 2), 16),
                        g: parseInt(hex.slice(2, 4), 16),
                        b: parseInt(hex.slice(4, 6), 16),
                    };
                }
            }

            this.extension.debugLog("Failed to parse color string:", colorString);
            return DEFAULT_COLORS.FALLBACK_GREY;
        } catch (e) {
            this.extension.debugLog("Error parsing color string:", e);
            return DEFAULT_COLORS.FALLBACK_GREY;
        }
    }

    /**
     * Detect panel base color from current theme
     * @returns {Object} RGB color object with r, g, b properties (enhanced with HSP metadata)
     */
    getPanelBaseColor() {
        // Use override color if enabled - READ FROM SETTINGS (not cached property!)
        if (this.extension.overridePanelColor) {
            const overrideColorString = this.extension.settings.getValue("choose-override-panel-color");
            this.extension.debugLog("Using panel override color:", overrideColorString);

            // Use safe parser for user-provided color picker value
            const color = this._safeParseColor(
                overrideColorString,
                DEFAULT_COLORS.FALLBACK_DARK,
                "panel color override"
            );

            // Add HSP metadata to override color
            if (!color.hsp) {
                color.hsp = ThemeUtils.getHSP(color.r, color.g, color.b);
                color.isDark = ThemeUtils.getBgDark(color.r, color.g, color.b);
            }

            return color;
        }

        // Cache panel color for 10 seconds to avoid redundant detection
        if (this.cachedPanelColor !== null && Date.now() - this.lastThemeCheck < 10000) {
            return this.cachedPanelColor;
        }

        try {
            this.extension.debugLog("Detecting panel base color...");

            if (Main.panel.actor && Main.panel.actor.get_theme_node) {
                let themeNode = Main.panel.actor.get_theme_node();
                let backgroundColor = themeNode.get_background_color();

                if (backgroundColor) {
                    let color = {
                        r: backgroundColor.red,
                        g: backgroundColor.green,
                        b: backgroundColor.blue,
                    };

                    // Calculate HSP perceived brightness
                    const hsp = ThemeUtils.getHSP(color.r, color.g, color.b);
                    const isDark = ThemeUtils.getBgDark(color.r, color.g, color.b);

                    this.extension.debugLog(`Detected panel color: rgb(${color.r}, ${color.g}, ${color.b})`);
                    this.extension.debugLog(`  → HSP brightness: ${hsp.toFixed(1)} (threshold: 127.5)`);
                    this.extension.debugLog(`  → Is dark theme: ${isDark}`);

                    // Store HSP metadata in color object
                    color.hsp = hsp;
                    color.isDark = isDark;

                    this.cachedPanelColor = color;
                    this.lastThemeCheck = Date.now();
                    return color;
                }
            }

            // Fallback to dark color for most themes
            this.extension.debugLog("Using fallback panel color: rgb(46, 52, 64)");
            this.cachedPanelColor = {
                r: 46,
                g: 52,
                b: 64,
                hsp: ThemeUtils.getHSP(46, 52, 64),
                isDark: true,
            };
            this.lastThemeCheck = Date.now();
            return this.cachedPanelColor;
        } catch (e) {
            this.extension.debugLog("Error detecting panel color:", e);
            this.cachedPanelColor = {
                r: 46,
                g: 52,
                b: 64,
                hsp: ThemeUtils.getHSP(46, 52, 64),
                isDark: true,
            };
            this.lastThemeCheck = Date.now();
            return this.cachedPanelColor;
        }
    }

    /**
     * Detect border-radius from current theme by inspecting UI elements
     * @returns {number} Detected border radius in pixels
     */
    detectThemeBorderRadius() {
        // Cache border-radius for 10 seconds (was 1 second - optimized for frequent calls)
        if (this.cachedBorderRadius !== null && Date.now() - this.lastBorderRadiusCheck < 10000) {
            return this.cachedBorderRadius;
        }

        try {
            this.extension.debugLog("Detecting theme border-radius...");

            let detectedRadii = [];

            // Check main panel first
            let panelRadius = this.getElementBorderRadius(Main.panel.actor);
            detectedRadii.push(panelRadius);
            if (panelRadius > 0) {
                this.extension.debugLog(`Detected panel border-radius: ${panelRadius}px`);
                this.cachedBorderRadius = panelRadius;
                this.lastBorderRadiusCheck = Date.now();
                return panelRadius;
            }

            // Check popup menus
            let menuRadius = this.getMenuBorderRadius();
            detectedRadii.push(menuRadius);
            if (menuRadius > 0) {
                this.extension.debugLog(`Detected menu border-radius: ${menuRadius}px`);
                this.cachedBorderRadius = menuRadius;
                this.lastBorderRadiusCheck = Date.now();
                return menuRadius;
            }

            // Check notification area
            let notificationRadius = this.getNotificationBorderRadius();
            detectedRadii.push(notificationRadius);
            if (notificationRadius > 0) {
                this.extension.debugLog(`Detected notification border-radius: ${notificationRadius}px`);
                this.cachedBorderRadius = notificationRadius;
                this.lastBorderRadiusCheck = Date.now();
                return notificationRadius;
            }

            // Check if theme is truly flat
            let allZero = detectedRadii.every((radius) => radius === 0);
            if (allZero) {
                this.extension.debugLog("Theme uses flat design, not applying border radius");
                this.cachedBorderRadius = 0;
                this.lastBorderRadiusCheck = Date.now();
                return 0;
            }

            // Use fallback value
            this.extension.debugLog(
                `Detection inconsistency, using fallback border-radius: ${this.extension.borderRadius}px`
            );
            this.cachedBorderRadius = this.extension.borderRadius;
            this.lastBorderRadiusCheck = Date.now();
            return this.cachedBorderRadius;
        } catch (e) {
            this.extension.debugLog("Error detecting theme border-radius:", e);
            this.cachedBorderRadius = this.extension.borderRadius;
            this.lastBorderRadiusCheck = Date.now();
            return this.extension.borderRadius;
        }
    }

    /**
     * Extract border-radius value from a Clutter.Actor element
     * @param {Clutter.Actor} actor - The actor to inspect
     * @returns {number} Border radius in pixels
     */
    getElementBorderRadius(actor) {
        if (!actor || !actor.get_theme_node) return 0;

        try {
            let themeNode = actor.get_theme_node();
            let radius = themeNode.get_border_radius(St.Corner.TOPLEFT);
            this.extension.debugLog(`Element border-radius: ${radius}px`);
            return Math.round(radius);
        } catch (e) {
            this.extension.debugLog("Failed to get element border-radius:", e);
            return 0;
        }
    }

    /**
     * Detect border-radius from popup menus
     * @returns {number} Menu border radius in pixels
     */
    getMenuBorderRadius() {
        try {
            this.extension.debugLog("Attempting menu border-radius detection...");

            // Check existing menu elements first
            let menuManager = Main.panel.menuManager;
            if (menuManager && menuManager._menus && menuManager._menus.length > 0) {
                let existingMenu = menuManager._menus[0];
                if (existingMenu && existingMenu.actor) {
                    let radius = this.getElementBorderRadius(existingMenu.actor);
                    if (radius > 0) {
                        this.extension.debugLog(`Found menu radius from menuManager: ${radius}px`);
                        return radius;
                    }
                }
            }

            // Fallback: check panel elements
            if (Main.panel._leftBox && Main.panel._leftBox.get_children().length > 0) {
                let firstButton = Main.panel._leftBox.get_children()[0];
                if (firstButton) {
                    let radius = this.getElementBorderRadius(firstButton);
                    if (radius > 0) {
                        this.extension.debugLog(`Found radius from panel button: ${radius}px`);
                        return radius;
                    }
                }
            }

            this.extension.debugLog("No menu border-radius detected");
            return 0;
        } catch (e) {
            this.extension.debugLog("Menu border-radius detection failed:", e.message);
            return 0;
        }
    }

    /**
     * Detect border-radius from notification area elements
     * @returns {number} Notification border radius in pixels
     */
    getNotificationBorderRadius() {
        try {
            // Check if notification area exists
            if (Main.messageTray && Main.messageTray.actor) {
                return this.getElementBorderRadius(Main.messageTray.actor);
            }

            // Check system indicators
            if (Main.panel.statusArea) {
                for (let indicator in Main.panel.statusArea) {
                    let statusActor = Main.panel.statusArea[indicator];
                    if (statusActor && statusActor.actor) {
                        let radius = this.getElementBorderRadius(statusActor.actor);
                        if (radius > 0) return radius;
                    }
                }
            }

            return 0;
        } catch (e) {
            this.extension.debugLog("Notification border-radius detection failed:", e);
            return 0;
        }
    }

    /**
     * Print and save the current GTK theme name
     */
    _printAndSaveCurrentTheme() {
        try {
            const settings = new Gio.Settings({ schema: "org.cinnamon.desktop.interface" });
            this.currentTheme = settings.get_string("gtk-theme");
            this.extension.debugLog(`Current GTK theme: ${this.currentTheme}`);
        } catch (e) {
            this.extension.debugLog("Error getting current theme:", e);
        }
    }

    /**
     * Centralized detection of all theme properties - caches everything without forcing theme reload
     * Called once in extension.enable() to avoid multiple theme loading
     */
    detectAllThemeProperties() {
        const now = Date.now();

        // Return early if cache is still valid
        if (this.themePropertiesCache && now - this.lastThemePropertiesCheck < this.themePropertiesCacheTimeout) {
            this.extension.debugLog("Using cached theme properties");
            return;
        }

        this.extension.debugLog("Detecting all theme properties at once to avoid multiple theme loads");

        // Detect and cache all properties at once (theme loads automatically when accessing elements)
        this.getPanelBaseColor(); // Caches panelColor
        this.detectThemeBorderRadius(); // Caches borderRadius

        // Cache the detection timestamp
        this.themePropertiesCache = true;
        this.lastThemePropertiesCheck = now;

        this.extension.debugLog("All theme properties detected and cached");
    }

    // ===== THEMEUTILS INTEGRATION - NEW METHODS =====

    /**
     * Generate automatic highlight color for menu items based on panel color
     * Uses ThemeUtils to create appropriate hover/highlight effects
     *
     * @param {number} intensity - Highlight intensity (0-1, default: 0.3)
     * @returns {string} CSS rgba string for highlight color
     */
    getAutoHighlightColor(intensity = 0.3) {
        const bgColor = this.getPanelBaseColor();

        // Generate highlight with specified intensity
        const highlightRgb = ThemeUtils.getAutoHighlightColor([bgColor.r, bgColor.g, bgColor.b], intensity);

        // Convert to CSS with subtle transparency
        const highlightCss = ThemeUtils.rgbaToCss(
            highlightRgb[0],
            highlightRgb[1],
            highlightRgb[2],
            0.15 // Subtle transparency for hover effect
        );

        this.extension.debugLog(`Auto-generated highlight color: ${highlightCss}`);
        this.extension.debugLog(`  → Base: rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`);
        this.extension.debugLog(`  → Intensity: ${(intensity * 100).toFixed(0)}%`);

        return highlightCss;
    }

    /**
     * Ensure minimum WCAG contrast between foreground and background colors
     * Automatically adjusts foreground if contrast is too low
     *
     * @param {Object} fgColor - RGB object {r, g, b}
     * @param {Object} bgColor - RGB object {r, g, b}
     * @param {number} minRatio - Minimum contrast ratio (default: 4.5 for WCAG AA)
     * @returns {Object} Adjusted foreground color {r, g, b}
     */
    ensureTextContrast(fgColor, bgColor, minRatio = 4.5) {
        const fgArray = [fgColor.r, fgColor.g, fgColor.b];
        const bgArray = [bgColor.r, bgColor.g, bgColor.b];

        // Calculate initial contrast
        const initialRatio = ThemeUtils.contrastRatio(fgArray, bgArray);

        // Check if adjustment is needed
        if (initialRatio >= minRatio) {
            this.extension.debugLog(`Text contrast OK: ${initialRatio.toFixed(2)}:1 (min: ${minRatio}:1)`);
            return fgColor;
        }

        this.extension.debugLog(`Text contrast too low: ${initialRatio.toFixed(2)}:1 (min: ${minRatio}:1)`);
        this.extension.debugLog("  → Auto-adjusting foreground color...");

        // Adjust foreground to meet minimum contrast
        const adjusted = ThemeUtils.ensureContrast(fgArray, bgArray, minRatio);
        const finalRatio = ThemeUtils.contrastRatio(adjusted, bgArray);

        const result = {
            r: adjusted[0],
            g: adjusted[1],
            b: adjusted[2],
        };

        this.extension.debugLog(`  → Adjusted to: rgb(${result.r}, ${result.g}, ${result.b})`);
        this.extension.debugLog(`  → New contrast: ${finalRatio.toFixed(2)}:1`);

        return result;
    }

    /**
     * Generate automatic foreground (text) color based on background
     * Returns white for dark backgrounds, black for light backgrounds
     *
     * @param {Object} bgColor - RGB object {r, g, b} (optional, uses panel color if not provided)
     * @param {number} alpha - Alpha channel (0-1, default: 1.0)
     * @returns {Object} Foreground color {r, g, b, a}
     */
    getAutoForegroundColor(bgColor = null, alpha = 1.0) {
        if (!bgColor) {
            bgColor = this.getPanelBaseColor();
        }

        const fgArray = ThemeUtils.getAutoFgColor([bgColor.r, bgColor.g, bgColor.b], alpha);

        const result = {
            r: fgArray[0],
            g: fgArray[1],
            b: fgArray[2],
            a: fgArray[3],
        };

        this.extension.debugLog(`Auto foreground color: rgba(${result.r}, ${result.g}, ${result.b}, ${result.a})`);
        this.extension.debugLog(`  → Background is ${bgColor.isDark ? "dark" : "light"} theme`);

        return result;
    }

    /**
     * Validate if a color is suitable for use as accent color
     * Rejects grey, white, and black colors
     *
     * @param {Object} color - RGB object {r, g, b}
     * @returns {Object} {isValid: boolean, reason: string}
     */
    validateAccentColor(color) {
        const result = ThemeUtils.isValidAccent(color.r, color.g, color.b);

        this.extension.debugLog(`Accent color validation: rgb(${color.r}, ${color.g}, ${color.b})`);
        this.extension.debugLog(`  → ${result.isValid ? "✓" : "✗"} ${result.reason}`);

        return result;
    }

    /**
     * Generate a color palette (lighter and darker shades) from base color
     *
     * @param {Object} baseColor - RGB object {r, g, b} (optional, uses panel color if not provided)
     * @param {number} count - Number of colors to generate (default: 5)
     * @returns {Array} Array of RGB objects [{r, g, b}, {r, g, b}, ...]
     */
    generateColorPalette(baseColor = null, count = 5) {
        if (!baseColor) {
            baseColor = this.getPanelBaseColor();
        }

        const palette = ThemeUtils.generateColorPalette([baseColor.r, baseColor.g, baseColor.b], count);

        // Convert array format to object format
        const result = palette.map((rgb) => ({
            r: rgb[0],
            g: rgb[1],
            b: rgb[2],
        }));

        this.extension.debugLog(
            `Generated ${count}-color palette from rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`
        );

        return result;
    }

    // ===== PHASE 2.5B - THEME ACCENT DETECTION =====

    /**
     * Get system color scheme preference from Quick Settings (Dark/Light mode toggle)
     * @returns {string} 'prefer-dark' | 'prefer-light' | 'default'
     */
    getSystemColorScheme() {
        try {
            const interfaceSettings = new Gio.Settings({
                schema_id: "org.gnome.desktop.interface",
            });
            const scheme = interfaceSettings.get_string("color-scheme");
            this.extension.debugLog(`System color-scheme: ${scheme}`);
            return scheme;
        } catch (e) {
            this.extension.debugLog(`Cannot read color-scheme: ${e}`);
            return "default";
        }
    }

    /**
     * Get active GTK theme name
     * @returns {string} Theme name (e.g., "Mint-Y-Dark")
     */
    getActiveGtkTheme() {
        try {
            const settings = new Gio.Settings({
                schema_id: "org.cinnamon.desktop.interface",
            });
            const themeName = settings.get_string("gtk-theme");
            this.extension.debugLog(`Active GTK theme: ${themeName}`);
            return themeName || "Mint-Y";
        } catch (e) {
            this.extension.debugLog(`Error getting gtk-theme: ${e}`);
            return "Mint-Y";
        }
    }

    /**
     * Determine if dark mode should be preferred
     * PRIORITY: color-scheme setting > gtk-theme suffix > HSP brightness fallback
     *
     * CRITICAL FIX (Phase 2.5B+): FALLBACK 2 now reads panel color from GTK CSS files,
     * not from DOM, to avoid stale color from previous theme switch.
     *
     * @returns {boolean} True if dark mode preferred
     */
    isDarkModePreferred() {
        // PRIMARY: Check system color-scheme preference (Quick Settings toggle)
        const scheme = this.getSystemColorScheme();

        if (scheme === "prefer-dark") {
            this.extension.debugLog("Dark mode: color-scheme = prefer-dark ✓");
            return true;
        }
        if (scheme === "prefer-light") {
            this.extension.debugLog("Dark mode: color-scheme = prefer-light (FALSE)");
            return false;
        }

        // EXTENSION OVERRIDE: User-set dark/light mode override (dark-light-override setting)
        // Applies globally: affects sidebar fallback, accent generation, and wallpaper extraction
        const toneMode = this.extension.darkLightOverride || 'auto';
        if (toneMode === 'dark') {
            this.extension.debugLog("Dark mode: extension override = force dark ✓");
            return true;
        }
        if (toneMode === 'light') {
            this.extension.debugLog("Dark mode: extension override = force light (FALSE)");
            return false;
        }

        // FALLBACK 1: Check gtk-theme suffix or contains -Dark/-Light
        const gtkTheme = this.getActiveGtkTheme();
        this.extension.debugLog(`[isDarkModePreferred] Checking theme name: "${gtkTheme}"`);

        // Check if theme contains -Dark (e.g., "Mint-Y-Dark-Orange", "Adwaita-Dark")
        if (gtkTheme.includes("-Dark") || gtkTheme.includes("-dark")) {
            this.extension.debugLog(`Dark mode: theme contains -Dark (${gtkTheme}) ✓`);
            return true;
        }
        // Check if theme explicitly contains -Light
        if (gtkTheme.includes("-Light") || gtkTheme.includes("-light")) {
            this.extension.debugLog(`Dark mode: theme contains -Light (${gtkTheme}) (FALSE)`);
            return false;
        }

        this.extension.debugLog(`[isDarkModePreferred] No -Dark/-Light in theme name, falling back to HSP`);

        // FALLBACK 2: HSP brightness calculation (read from CSS, NOT DOM!)
        // Try reading panel color from GTK CSS first (accurate), fallback to DOM if needed
        let panelColor = this._detectPanelColorFromGtkCss();

        if (!panelColor) {
            // Last resort: read from DOM (may have stale color)
            this.extension.debugLog(`[isDarkModePreferred] CSS read failed, using DOM (may be stale)`);
            const wasOverride = this.extension.overridePanelColor;
            this.extension.overridePanelColor = false;
            panelColor = this.getPanelBaseColor();
            this.extension.overridePanelColor = wasOverride;
        }

        const isDark = panelColor.isDark; // Already calculated in getPanelBaseColor()
        this.extension.debugLog(
            `Dark mode: HSP fallback (${panelColor.hsp.toFixed(1)}) → ${isDark ? "dark ✓" : "light (FALSE)"}`
        );

        return isDark;
    }

    /**
     * Setup color-scheme and GTK theme monitoring
     * Automatically refreshes accent colors when user changes theme or dark/light mode
     */
    setupColorSchemeMonitoring() {
        try {
            // Monitor org.gnome.desktop.interface for color-scheme (dark/light preference)
            // Store reference to prevent garbage collection
            this._interfaceSettings = new Gio.Settings({
                schema_id: "org.gnome.desktop.interface",
            });

            this._signalsHandler.add([
                this._interfaceSettings,
                "changed::color-scheme",
                () => {
                    const newScheme = this._interfaceSettings.get_string("color-scheme");
                    this.extension.debugLog(`Color scheme changed to: ${newScheme}`);

                    // Invalidate all cached theme properties
                    this.invalidateCache();

                    // NEW UNIFIED FLOW: Detect all theme properties and apply based on switches
                    this.extension.debugLog("Using unified detection flow for color-scheme change...");
                    const detectedThemeData = this.redetectAllThemeData();
                    this.extension.applyDetectedThemeData(detectedThemeData);
                },
            ]);

            // Monitor org.cinnamon.desktop.interface for GTK theme changes
            // Store reference to prevent garbage collection
            this._cinnamonInterfaceSettings = new Gio.Settings({
                schema_id: "org.cinnamon.desktop.interface",
            });

            this._signalsHandler.add([
                this._cinnamonInterfaceSettings,
                "changed::gtk-theme",
                () => {
                    const newTheme = this._cinnamonInterfaceSettings.get_string("gtk-theme");
                    this.extension.debugLog(`GTK theme changed to: ${newTheme}`);

                    // Invalidate all cached theme properties
                    this.invalidateCache();

                    // NEW UNIFIED FLOW: Detect all theme properties and apply based on switches
                    this.extension.debugLog("Using unified detection flow for GTK theme change...");
                    const detectedThemeData = this.redetectAllThemeData();
                    this.extension.applyDetectedThemeData(detectedThemeData);
                },
            ]);

            this.extension.debugLog("Color-scheme and GTK theme monitoring setup successfully");
        } catch (e) {
            this.extension.debugLog(`Failed to setup theme monitoring: ${e}`);
        }
    }

    /**
     * Detect accent color from active GTK theme CSS
     * Searches for accent color patterns in priority order:
     * 1. switch:checked { background-color: #xxxxxx } (most reliable)
     * 2. @define-color theme_selected_bg_color #xxxxxx
     *
     * @returns {Object|null} {r, g, b} or null if no valid accent found
     */
    detectThemeAccentColor() {
        const themeName = this.getActiveGtkTheme();
        this.extension.debugLog(`Detecting accent from theme: ${themeName}`);

        // Theme paths to check (user themes take priority over system themes)
        // Priority order: XDG user > legacy user > system > local system
        const themePaths = [
            `${GLib.get_home_dir()}/.local/share/themes/${themeName}`, // XDG standard (highest priority)
            `${GLib.get_home_dir()}/.themes/${themeName}`, // Legacy location
            `/usr/share/themes/${themeName}`, // System themes
            `/usr/local/share/themes/${themeName}`, // Local system themes
        ];

        for (const themePath of themePaths) {
            const gtkCssPath = `${themePath}/gtk-3.0/gtk.css`;
            const cssFile = Gio.File.new_for_path(gtkCssPath);

            try {
                // Intentional sync load: isDarkModePreferred() is called from blurTemplateManager
                // (CSS generation hot path) requiring a synchronous result. Converting to async
                // would cascade through the entire template generation system. File is only read
                // when theme data is stale; subsequent calls use cached currentPanelBaseColor.
                const [success, contents] = cssFile.load_contents(null);
                if (!success) {
                    this.extension.debugLog(`  → Failed to read: ${gtkCssPath}`);
                    continue;
                }

                const cssText = new TextDecoder().decode(contents);
                this.extension.debugLog(`  → Parsing CSS file: ${gtkCssPath} (${cssText.length} bytes)`);

                // Priority 1: switch:checked { background-color: #xxxxxx }
                this.extension.debugLog(`  → Searching for switch:checked pattern...`);
                const switchMatch = cssText.match(/switch:checked\s*\{[^}]*background-color:\s*#([0-9a-fA-F]{6})/);

                if (switchMatch) {
                    this.extension.debugLog(`  → Found switch:checked match: #${switchMatch[1]}`);
                    try {
                        const hex = switchMatch[1];
                        const color = this._hexToRgb(hex);
                        this.extension.debugLog(`  → Converted to RGB: rgb(${color.r}, ${color.g}, ${color.b})`);
                        this.extension.debugLog(
                            `  → Checking 'this' context: ${typeof this}, has validateAccentColor: ${typeof this
                                .validateAccentColor}`
                        );

                        // Validate accent (reject grey/white/black)
                        const validation = this.validateAccentColor(color);
                        if (validation.isValid) {
                            this.extension.debugLog(
                                `  ✓ Accent from switch:checked: rgb(${color.r}, ${color.g}, ${color.b})`
                            );
                            return color;
                        } else {
                            this.extension.debugLog(`  ✗ Rejected switch:checked - ${validation.reason}`);
                        }
                    } catch (e) {
                        this.extension.debugLog(`  → Error processing switch:checked: ${e}`);
                        this.extension.debugLog(`  → Error stack: ${e.stack}`);
                    }
                } else {
                    this.extension.debugLog(`  → No switch:checked match found`);
                }

                // Priority 2: @define-color theme_selected_bg_color #xxxxxx
                this.extension.debugLog(`  → Searching for theme_selected_bg_color pattern...`);
                const selectedMatch = cssText.match(/@define-color\s+theme_selected_bg_color\s+#([0-9a-fA-F]{6})/);

                if (selectedMatch) {
                    this.extension.debugLog(`  → Found theme_selected_bg_color match: #${selectedMatch[1]}`);
                    try {
                        const hex = selectedMatch[1];
                        const color = this._hexToRgb(hex);
                        this.extension.debugLog(`  → Converted to RGB: rgb(${color.r}, ${color.g}, ${color.b})`);

                        const validation = this.validateAccentColor(color);
                        if (validation.isValid) {
                            this.extension.debugLog(
                                `  ✓ Accent from theme_selected_bg_color: rgb(${color.r}, ${color.g}, ${color.b})`
                            );
                            return color;
                        } else {
                            this.extension.debugLog(`  ✗ Rejected theme_selected_bg_color - ${validation.reason}`);
                        }
                    } catch (e) {
                        this.extension.debugLog(`  → Error processing theme_selected_bg_color: ${e}`);
                    }
                } else {
                    this.extension.debugLog(`  → No theme_selected_bg_color match found`);
                }

                // No valid accent found in this CSS file
                this.extension.debugLog(`  → No valid accent patterns found in ${gtkCssPath}`);
            } catch (e) {
                this.extension.debugLog(`  → Error reading ${gtkCssPath}: ${e}`);
            }
        }

        this.extension.debugLog(`  ✗ No accent color found for theme: ${themeName} (neutral/grey theme)`);
        return null;
    }

    /**
     * Detect panel base color directly from GTK theme CSS files
     * Reads @theme_bg_color definition from gtk.css (PURE theme color, not DOM-applied)
     * @returns {Object|null} {r, g, b, hsp, isDark} or null if not found
     */
    _detectPanelColorFromGtkCss() {
        const themeName = this.getActiveGtkTheme();
        this.extension.debugLog(`Reading panel bg from theme CSS: ${themeName}`);

        const themePaths = [
            `${GLib.get_home_dir()}/.local/share/themes/${themeName}`,
            `${GLib.get_home_dir()}/.themes/${themeName}`,
            `/usr/share/themes/${themeName}`,
            `/usr/local/share/themes/${themeName}`,
        ];

        for (const themePath of themePaths) {
            const gtkCssPath = `${themePath}/gtk-3.0/gtk.css`;
            const cssFile = Gio.File.new_for_path(gtkCssPath);

            try {
                // Intentional sync load: isDarkModePreferred() is called from blurTemplateManager
                // (CSS generation hot path) requiring a synchronous result. Converting to async
                // would cascade through the entire template generation system. File is only read
                // when theme data is stale; subsequent calls use cached currentPanelBaseColor.
                const [success, contents] = cssFile.load_contents(null);
                if (!success) continue;

                const cssText = new TextDecoder().decode(contents);

                // Search for: @define-color theme_bg_color #xxxxxx
                const bgMatch = cssText.match(/@define-color\s+theme_bg_color\s+#([0-9a-fA-F]{6})/);

                if (bgMatch) {
                    const hex = bgMatch[1];
                    const color = this._hexToRgb(hex);

                    // Add HSP metadata
                    color.hsp = ThemeUtils.getHSP(color.r, color.g, color.b);
                    color.isDark = ThemeUtils.getBgDark(color.r, color.g, color.b);

                    this.extension.debugLog(
                        `  ✓ Panel bg from theme_bg_color: rgb(${color.r}, ${color.g}, ${color.b})`
                    );
                    this.extension.debugLog(`  → HSP: ${color.hsp.toFixed(1)}, isDark: ${color.isDark}`);
                    return color;
                }
            } catch (e) {
                this.extension.debugLog(`  → Error reading ${gtkCssPath}: ${e}`);
            }
        }

        this.extension.debugLog(`  ✗ No theme_bg_color found in gtk.css, falling back to DOM detection`);
        return null;
    }

    /**
     * Helper: Convert hex string to RGB object
     * @param {string} hex - Hex color without # (e.g., "ff0000")
     * @returns {Object} {r, g, b}
     */
    _hexToRgb(hex) {
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16),
        };
    }

    /**
     * Generate complete accent color system from base accent color
     * Creates 3 variants optimized for dark/light themes:
     * - accent: Base color (for primary accents)
     * - border: ±15%/10% adjusted (for borders and highlights)
     * - tint: Same as border but with low alpha (for overlays/hovers)
     * - shadow: ±85% adjusted (deep dark or soft light for glows)
     *
     * @param {Object} accentColor - Base accent {r, g, b}
     * @param {boolean} isDarkMode - Optional dark mode override (if not provided, will detect)
     * @returns {Object} {accent, border, tint, shadow} all in CSS rgba() format
     */
    generateAccentSystem(accentColor, isDarkMode = null) {
        if (!accentColor) {
            this.extension.debugLog("No accent color provided, returning null");
            return null;
        }

        // Use provided isDarkMode or detect automatically
        const isDark = isDarkMode !== null ? isDarkMode : this.isDarkModePreferred();
        this.extension.debugLog(`Generating accent system for ${isDark ? "DARK" : "LIGHT"} theme`);
        this.extension.debugLog(`  → Base accent: rgb(${accentColor.r}, ${accentColor.g}, ${accentColor.b})`);

        const accentArray = [accentColor.r, accentColor.g, accentColor.b];

        // Generate variants based on theme mode
        const borderArray = isDark
            ? ThemeUtils.colorShade(accentArray, 0.15) // 15% lighter for dark themes
            : ThemeUtils.colorShade(accentArray, -0.1); // 10% darker for light themes

        const shadowArray = isDark
            ? ThemeUtils.colorShade(accentArray, -0.85) // 85% darker (deep dark)
            : ThemeUtils.colorShade(accentArray, 0.85); // 85% lighter (soft light)

        // Convert to CSS rgba strings with appropriate alpha values
        const result = {
            accent: ThemeUtils.rgbaToCss(accentArray[0], accentArray[1], accentArray[2], 0.8),
            border: ThemeUtils.rgbaToCss(borderArray[0], borderArray[1], borderArray[2], 0.6),
            tint: ThemeUtils.rgbaToCss(borderArray[0], borderArray[1], borderArray[2], 0.15),
            shadow: ThemeUtils.rgbaToCss(shadowArray[0], shadowArray[1], shadowArray[2], 0.3),
        };

        this.extension.debugLog(`Accent system generated:`);
        this.extension.debugLog(`  → accent:  ${result.accent}`);
        this.extension.debugLog(`  → border:  ${result.border}`);
        this.extension.debugLog(`  → tint:    ${result.tint}`);
        this.extension.debugLog(`  → shadow:  ${result.shadow}`);

        return result;
    }

    // ========================================================================
    // THEME RE-DETECTION METHODS (Refactored from extension.js)
    // ========================================================================

    /**
     * Re-detect ALL theme properties on theme change
     * This is the MAIN method called from extension.js theme-set callback
     *
     * CRITICAL FIX (Phase 2.5B+): Detect panel color FIRST to get accurate isDarkMode!
     * Old flow: isDarkMode from DOM → accent system → panel color from CSS
     * New flow: panel color from CSS → isDarkMode from new color → accent system ✓
     *
     * @returns {Object} Detected properties with apply flags
     * {
     *   borderRadius: {detected: number, shouldApply: boolean},
     *   accentColor: {detected: string, shouldApply: boolean, variants: object},
     *   panelColor: {detected: string, shouldApply: boolean},
     *   popupColor: {detected: string, shouldApply: boolean},
     *   isDarkMode: boolean
     * }
     */
    redetectAllThemeData() {
        this.extension.debugLog("Re-detecting all theme properties...");

        // Refresh current theme name before logging detection summary
        this._printAndSaveCurrentTheme();

        // Step 1: Clear cache ONCE at the beginning
        this.invalidateCache();

        // 2. Detect panel color FROM THEME CSS FIRST (to get accurate isDarkMode)
        const detectedPanelColor = this.detectPanelColorFromTheme();
        this.currentPanelBaseColor = detectedPanelColor; // Store original theme panel color
        const shouldApplyPanel = this.shouldApplyPanelColor();
        this.extension.debugLog(`Panel color: ${detectedPanelColor} (apply: ${shouldApplyPanel})`);

        // 3. Detect dark/light mode from NEW panel color (needed for accent generation)
        const isDarkMode = this.isDarkModePreferred();
        this.extension.debugLog(`Dark mode: ${isDarkMode}`);

        // 4. Detect border-radius
        const detectedRadius = this.detectThemeBorderRadius();
        const shouldApplyRadius = this.shouldApplyBorderRadius();
        this.extension.debugLog(`Border radius: ${detectedRadius}px (apply: ${shouldApplyRadius})`);

        // 5. Detect accent color
        let detectedAccent = null;
        let accentVariants = null;
        const shouldApplyAccent = this.shouldApplyAccent();

        if (shouldApplyAccent) {
            detectedAccent = this.detectThemeAccentColor();
            if (detectedAccent) {
                accentVariants = this.generateAccentSystem(detectedAccent, isDarkMode);
                this.extension.debugLog(`Accent color: rgb(${detectedAccent.r}, ${detectedAccent.g}, ${detectedAccent.b}) (apply: true)`);
            }
        } else {
            this.extension.debugLog(`Accent auto-apply disabled (apply: false)`);
        }

        // 6. Determine popup color (inherits from current panel color if override is OFF)
        const shouldApplyPopup = this.shouldApplyPopupColor();
        const detectedPopupColor = shouldApplyPopup ? this.getCurrentPanelColor() : null;
        this.extension.debugLog(`Popup color: ${detectedPopupColor || "N/A"} (apply: ${shouldApplyPopup})`);

        // Log complete detection summary for comparison
        this.extension.debugLog("=".repeat(60));
        this.extension.debugLog("✓ THEME DETECTION SUMMARY:");
        this.extension.debugLog(`  Theme Name:     ${this.currentTheme || "Unknown"}`);
        this.extension.debugLog(`  Theme Mode:     ${isDarkMode ? "DARK" : "LIGHT"}`);
        this.extension.debugLog(
            `  Border Radius:  ${detectedRadius}px ${shouldApplyRadius ? "→ WILL APPLY" : "(skip)"}`
        );
        this.extension.debugLog(
            `  Panel Color:    ${detectedPanelColor} ${shouldApplyPanel ? "→ WILL APPLY" : "(skip)"}`
        );
        this.extension.debugLog(
            `  Popup Color:    ${detectedPopupColor || "N/A"} ${shouldApplyPopup ? "→ WILL APPLY" : "(skip)"}`
        );

        if (shouldApplyAccent && accentVariants) {
            this.extension.debugLog(`  Accent Colors:  → WILL APPLY`);
            this.extension.debugLog(`    • Base:       ${accentVariants.accent}`);
            this.extension.debugLog(`    • Border:     ${accentVariants.border}`);
            this.extension.debugLog(`    • Tint:       ${accentVariants.tint}`);
            this.extension.debugLog(`    • Shadow:     ${accentVariants.shadow}`);
        } else {
            this.extension.debugLog(`  Accent Colors:  (skip - auto-apply disabled)`);
        }
        this.extension.debugLog("=".repeat(60));

        return {
            borderRadius: {
                detected: detectedRadius,
                shouldApply: shouldApplyRadius,
            },
            accentColor: {
                detected: detectedAccent,
                shouldApply: shouldApplyAccent,
                variants: accentVariants,
            },
            panelColor: {
                detected: detectedPanelColor,
                shouldApply: shouldApplyPanel,
            },
            popupColor: {
                detected: detectedPopupColor,
                shouldApply: shouldApplyPopup,
            },
            isDarkMode: isDarkMode,
        };
    }

    /**
     * Check if auto-apply border-radius is enabled
     * @returns {boolean} True if border-radius should be applied from theme
     */
    shouldApplyBorderRadius() {
        return this.extension.settings.getValue("auto-detect-radius");
    }

    /**
     * Check if auto-apply accent is enabled
     * @returns {boolean} True if accent colors should be applied from theme
     */
    shouldApplyAccent() {
        return this.extension.settings.getValue("auto-apply-accent-on-theme-change");
    }

    /**
     * Check if panel color should be applied from theme
     * Panel color applies from theme ONLY if override is OFF
     * @returns {boolean} True if panel should use theme color (not user override)
     */
    shouldApplyPanelColor() {
        return !this.extension.settings.getValue("override-panel-color");
    }

    /**
     * Check if popup color should be applied
     * Logic:
     *  - If popup override is ON → use popup color picker (don't apply from theme)
     *  - If popup override is OFF → inherit from CURRENT panel color
     * @returns {boolean} True if popup should inherit from panel
     */
    shouldApplyPopupColor() {
        return !this.extension.settings.getValue("override-popup-color");
    }

    /**
     * Get CURRENT active panel color as CSS string (BLACK BOX)
     * Returns the effective panel color based on override switch state.
     *
     * LOGIC (Phase 2.5B+ simplified):
     * - If override-panel-color ON: User manual mode → read from picker
     * - If override-panel-color OFF: Auto mode → use stored base color (theme or accent shadow)
     *
     * This BLACK BOX approach eliminates cache invalidation issues and provides
     * consistent behavior for popup color inheritance.
     *
     * @returns {string} CSS color string "rgb(r,g,b)" or "rgba(r,g,b,a)"
     */
    getCurrentPanelColor() {
        if (this.extension.overridePanelColor) {
            // User manual override active - read from picker
            const overrideColor = this.extension.settings.getValue("choose-override-panel-color");
            this.extension.debugLog(`Panel color: ${overrideColor} (from manual override)`);
            return overrideColor;
        } else {
            // Auto mode - use stored base color (set in applyDetectedThemeData)
            const baseColor = this.currentPanelBaseColor || this.detectPanelColorFromTheme();
            this.extension.debugLog(`Panel color: ${baseColor} (from auto-detected base)`);
            return baseColor;
        }
    }

    /**
     * Get effective popup/menu color based on override settings
     *
     * Encapsulates popup color inheritance logic - proper separation of concerns.
     * Replaces deprecated CSSManager.getMenuColor() method.
     *
     * This implements the THREE-MODE LOGIC:
     * 1. Popup override ON → use popup color picker
     * 2. Panel override ON (popup OFF) → use panel color picker
     * 3. Both OFF → use auto-detected theme color
     *
     * @returns {Object} RGB color object {r, g, b}
     */
    getEffectivePopupColor() {
        if (this.extension.overridePopupColor) {
            // Mode 1: User explicitly overrode popup color → use popup color picker
            const popupColorString = this.extension.settings.getValue("choose-override-popup-color");
            this.extension.debugLog("[ThemeDetector] Popup color: using override", popupColorString);

            // Use safe parser for user-provided color picker value
            return this._safeParseColor(
                popupColorString,
                DEFAULT_COLORS.FALLBACK_DARK,
                "popup color override"
            );
        } else {
            // Mode 2 & 3: Popup inherits from CURRENT panel color (theme OR panel override)
            const currentPanelColor = this.getCurrentPanelColor(); // BLACK BOX pattern
            this.extension.debugLog("[ThemeDetector] Popup color: inheriting from panel", currentPanelColor);

            // getCurrentPanelColor returns string → parse safely
            return this._safeParseColor(
                currentPanelColor,
                DEFAULT_COLORS.FALLBACK_DARK,
                "popup inherited panel color"
            );
        }
    }

    /**
     * Detect panel color from current theme (original theme color)
     * CRITICAL FIX (Phase 2.5B+): Read from GTK CSS files, NOT DOM!
     *
     * PROBLEM: Old implementation read Main.panel.actor color from DOM,
     * which returns ALREADY APPLIED color from previous theme switch.
     * This caused dark panel color to persist when switching dark→light.
     *
     * SOLUTION: Read @theme_bg_color from gtk.css files directly.
     * Fallback to DOM detection only if CSS parsing fails.
     *
     * @returns {string} CSS color string "rgb(r,g,b)"
     */
    detectPanelColorFromTheme() {
        // Try reading from GTK CSS first (PURE theme color)
        const cssColor = this._detectPanelColorFromGtkCss();

        if (cssColor) {
            return `rgb(${cssColor.r}, ${cssColor.g}, ${cssColor.b})`;
        }

        // Fallback: Read from DOM (may have stale color from previous switch)
        this.extension.debugLog("  ⚠ Falling back to DOM color detection (may be stale)");

        const wasOverride = this.extension.overridePanelColor;
        this.extension.overridePanelColor = false;

        this.invalidateCache(); // Force fresh detection
        const colorObj = this.getPanelBaseColor(); // Read DOM color

        this.extension.overridePanelColor = wasOverride; // Restore original setting

        return `rgb(${colorObj.r}, ${colorObj.g}, ${colorObj.b})`;
    }
}

module.exports = ThemeDetector;
