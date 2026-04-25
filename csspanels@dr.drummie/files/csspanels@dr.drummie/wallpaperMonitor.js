const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const { TIMING, SETTINGS_KEYS, WALLPAPER_COLORS, DEFAULT_COLORS } = require("./constants");
const { ThemeUtils } = require("./themeUtils");
const { GlobalSignalsHandler } = require("./signalHandler");

/**
 * WallpaperMonitor - Foundation for Phase 3 ColorPalette integration
 *
 * Detects wallpaper changes and prepares for color extraction.
 * Phase 2.5C: Detection, logging, and infrastructure only
 * Phase 3: Actual ColorPalette extraction implementation
 *
 * Features:
 * - Wallpaper change detection via org.cinnamon.desktop.background
 * - Debouncing to prevent rapid-fire triggers
 * - File hash checking to avoid duplicate processing
 * - Dark/Light mode detection for context-aware extraction
 * - Manual extraction trigger support
 */
class WallpaperMonitor {
    /**
     * Initialize wallpaper monitor
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this._enabled = false;

        // State tracking
        this._wallpaperPath = null;
        this._lastHash = null;
        this._extractionInProgress = false;
        this._colorPalette = null; // Lazy-initialized persistent ColorPalette instance

        // Signal management
        this._signalsHandler = new GlobalSignalsHandler();
        this._backgroundSettings = null;

        // Debouncing
        this._debounceTimeout = null;

        this.debugLog("WallpaperMonitor initialized");
    }

    /**
     * Enable wallpaper monitoring
     */
    enable() {
        if (this._enabled) {
            this.debugLog("Already enabled");
            return;
        }

        try {
            // Initialize background settings
            this._backgroundSettings = new Gio.Settings({
                schema_id: "org.cinnamon.desktop.background",
            });

            // Connect to wallpaper change signal
            this._signalsHandler.add([
                this._backgroundSettings,
                "changed::picture-uri",
                this._onWallpaperChanged.bind(this),
            ]);

            this._enabled = true;

            // Log initial wallpaper
            const initialPath = this._getCurrentWallpaperPath();
            this.debugLog(`Wallpaper monitoring enabled - Current: ${initialPath || "none"}`);

            // Initial hash calculation
            if (initialPath) {
                this._wallpaperPath = initialPath;
                this._calculateHash(initialPath).then(hash => {
                    this._lastHash = hash;
                    this.debugLog(`Initial wallpaper hash: ${this._lastHash}`);
                }).catch(e => this.debugLog(`Error calculating initial wallpaper hash: ${e.message}`));
            }
        } catch (e) {
            this.debugLog(`Error enabling wallpaper monitor: ${e.message}`);
            global.logError(`[CSSPanels] [WallpaperMonitor] Error: ${e.message}\n${e.stack}`);
            this._enabled = false;
        }
    }
    /**
     * Disable wallpaper monitoring
     */
    disable() {
        if (!this._enabled) {
            return;
        }

        try {
            // Clear debounce timeout
            if (this._debounceTimeout) {
                GLib.source_remove(this._debounceTimeout);
                this._debounceTimeout = null;
            }

            // Disconnect all signals
            this._signalsHandler.destroy();

            // Clear background settings reference
            this._backgroundSettings = null;

            // Reset state
            this._wallpaperPath = null;
            this._lastHash = null;
            this._extractionInProgress = false;
            this._colorPalette = null;
            this._enabled = false;

            this.debugLog("Wallpaper monitoring disabled");
        } catch (e) {
            this.debugLog(`Error disabling wallpaper monitor: ${e.message}`);
        }
    }

    /**
     * Handle wallpaper change signal
     * @private
     */
    _onWallpaperChanged() {
        // Clear existing debounce timeout
        if (this._debounceTimeout) {
            GLib.source_remove(this._debounceTimeout);
        }

        // Debounce wallpaper changes (prevent rapid-fire triggers)
        this._debounceTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMING.WALLPAPER_DEBOUNCE || 1000, () => {
            this._processWallpaperChange().catch(e => this.debugLog(`Error processing wallpaper change: ${e.message}`));
            this._debounceTimeout = null;
            return GLib.SOURCE_REMOVE;
        });

        this.debugLog("Wallpaper change detected (debouncing...)");
    }

    /**
     * Process wallpaper change after debounce
     * @private
     */
    async _processWallpaperChange() {
        try {
            const newPath = this._getCurrentWallpaperPath();

            if (!newPath) {
                this.debugLog("⚠️  No wallpaper path detected");
                return;
            }

            // Calculate hash for new wallpaper
            const newHash = await this._calculateHash(newPath);

            // Check if wallpaper actually changed
            // Guard: skip only when both hashes are non-null AND path matches —
            // if hash is null (file unreadable) we should NOT silently skip retries.
            if (newHash !== null && newHash === this._lastHash && newPath === this._wallpaperPath) {
                this.debugLog("⏭️  Same wallpaper (hash match), skipping extraction");
                return;
            }

            // Update state
            const oldPath = this._wallpaperPath;

            // Log change
            this.debugLog(`🖼️  Wallpaper changed:`);
            this.debugLog(`   Old: ${oldPath || "none"}`);
            this.debugLog(`   New: ${newPath}`);
            this.debugLog(`   Hash: ${newHash}`);

            // Detect dark/light mode
            const isDarkMode = this._detectDarkMode();
            this.debugLog(`🌓 Current mode: ${isDarkMode ? "DARK" : "LIGHT"}`);

            // Trigger extraction (if enabled)
            if (this.extension.enableWallpaperDetection) {
                this._triggerExtraction(newPath, isDarkMode, this.extension.fullAutoMode);
            } else {
                this.debugLog("Wallpaper detection disabled, skipping extraction");
            }
        } catch (e) {
            this.debugLog(`Error processing wallpaper change: ${e.message}`);
        }
    }

    /**
     * Trigger color extraction from wallpaper image and apply to settings
     * Lazy-loads ColorPalette module to avoid blocking initialization.
     * Extracts panel color, accent variants, and secondary popup color.
     *
     * @param {string} wallpaperPath - Path to wallpaper file (plain path, not URI)
     * @param {boolean} isDarkMode - Whether dark mode is active
     * @param {boolean} fullAuto - When true, also updates blur/accent color settings
     * @private
     */
    _triggerExtraction(wallpaperPath, isDarkMode, fullAuto = false) {
        if (this._extractionInProgress) {
            this.debugLog("Extraction already in progress, skipping");
            return;
        }

        this._extractionInProgress = true;
        this.debugLog(`Color extraction started - Path: ${wallpaperPath}, Mode: ${isDarkMode ? "DARK" : "LIGHT"}`);

        try {
            const { ColorPalette } = require("./colorPalette");
            if (!this._colorPalette) {
                this._colorPalette = new ColorPalette(this.extension);
            }
            const cp = this._colorPalette;

            // Load pixbuf once — both tone extraction and palette analysis share the same image data
            let sharedPixbuf;
            try {
                // GdkPixbuf.new_from_file_at_scale is synchronous but acceptable here:
                // - only invoked on user-triggered wallpaper extraction, not in the event loop
                // - GdkPixbuf has no stable async API in GJS/Cinnamon context
                sharedPixbuf = imports.gi.GdkPixbuf.Pixbuf.new_from_file_at_scale(
                    wallpaperPath, WALLPAPER_COLORS.COLOR_ANALYSIS_MAX_DIMENSION, WALLPAPER_COLORS.COLOR_ANALYSIS_MAX_DIMENSION, true
                );
            } catch (loadErr) {
                this.debugLog(`Failed to load pixbuf: ${loadErr.message}`);
                sharedPixbuf = null;
            }
            this.debugLog(`Pixbuf loaded once for dual-analysis (path: ${wallpaperPath})`);

            const strategy = this.extension.wallpaperColorStrategy || 'default';

            if (strategy === 'contrast') {
                // === CONTRAST STRATEGY: polar tones ===

                // STEP 1: Panel color — polar extreme (darkest/lightest pixels)
                const dominantRgb = sharedPixbuf
                    ? cp.extractPolarTone(sharedPixbuf, isDarkMode)
                    : cp.extractPolarToneFromPath(wallpaperPath, isDarkMode);
                const shadeFactor = isDarkMode
                    ? WALLPAPER_COLORS.CONTRAST_SHADE_DARK
                    : WALLPAPER_COLORS.CONTRAST_SHADE_LIGHT;
                const panelRgb = ThemeUtils.colorShade(dominantRgb, shadeFactor);
                const panelOpacity = this._getPanelOpacity();
                const panelCss = ThemeUtils.rgbaToCss(panelRgb[0], panelRgb[1], panelRgb[2], panelOpacity);
                this.extension.settings.setValue('choose-override-panel-color', panelCss);
                this.debugLog(`Panel color set (contrast): ${panelCss}`);

                // STEP 2: Palette from opposite end for accent/popup
                // Invert preferLight: dark mode → prefer light palette for accent contrast
                const preferLight = isDarkMode;
                const palette = sharedPixbuf
                    ? cp.extractFromPixbuf(sharedPixbuf, 8, preferLight)
                    : cp.extractColorsFromImage(wallpaperPath, 8, preferLight);
                this.debugLog(`Palette extracted (contrast): ${palette ? palette.length : 0} colors`);

                // Dispose shared pixbuf
                if (sharedPixbuf) {
                    try { sharedPixbuf.run_dispose(); } catch (e) { /* ignore */ }
                }

                // STEP 3: Accent system (identical to default flow)
                const accentRgbArr = palette && palette.length > 0
                    ? cp.getBestAccentColor(palette)
                    : [DEFAULT_COLORS.DEFAULT_ACCENT.r, DEFAULT_COLORS.DEFAULT_ACCENT.g, DEFAULT_COLORS.DEFAULT_ACCENT.b];

                const accentColor = { r: accentRgbArr[0], g: accentRgbArr[1], b: accentRgbArr[2] };
                let accentForSystem = accentColor;

                if (this.extension.themeDetector && this.extension.themeDetector.validateAccentColor) {
                    const validation = this.extension.themeDetector.validateAccentColor(accentColor);
                    if (!validation.isValid) {
                        const isTooLight = validation.reason && validation.reason.includes('Too light');
                        const isDesaturated = validation.reason && validation.reason.includes('Too desaturated');
                        if (!isTooLight && !isDesaturated) {
                            const hsl = ThemeUtils.rgbToHsl(accentColor.r, accentColor.g, accentColor.b);
                            const boosted = ThemeUtils.hslToRgb(hsl[0], hsl[1], WALLPAPER_COLORS.ACCENT_BOOST_TARGET_LIGHTNESS);
                            const revalidation = this.extension.themeDetector.validateAccentColor(
                                { r: boosted[0], g: boosted[1], b: boosted[2] }
                            );
                            if (revalidation.isValid) {
                                this.debugLog(`Accent brightened (contrast) rgb(${accentColor.r},${accentColor.g},${accentColor.b}) → rgb(${boosted[0]},${boosted[1]},${boosted[2]})`);
                                accentForSystem = { r: boosted[0], g: boosted[1], b: boosted[2] };
                            } else {
                                this.debugLog(`Accent still invalid after boost (contrast) (${revalidation.reason}), using default`);
                                accentForSystem = DEFAULT_COLORS.DEFAULT_ACCENT;
                            }
                        } else {
                            this.debugLog(`Accent invalid (contrast) (${validation.reason}), using default`);
                            accentForSystem = DEFAULT_COLORS.DEFAULT_ACCENT;
                        }
                    }
                }

                if (this.extension.themeDetector && this.extension.themeDetector.generateAccentSystem) {
                    const accentVariants = this.extension.themeDetector.generateAccentSystem(accentForSystem, isDarkMode);
                    if (accentVariants && fullAuto) {
                        this.extension.settings.setValue('blur-border-color', accentVariants.border);
                        this.extension.settings.setValue('blur-background', accentVariants.tint);
                        this.extension.settings.setValue('accent-shadow-color', accentVariants.shadow);
                        this.debugLog(`Accent system applied (contrast, full-auto): border=${accentVariants.border}`);
                    }
                }

                // STEP 4: Popup color matches panel — same polar tone, menu opacity
                const menuOpacity = this._getMenuOpacity();
                const secondaryCss = ThemeUtils.rgbaToCss(panelRgb[0], panelRgb[1], panelRgb[2], menuOpacity);
                this.extension.settings.setValue('choose-override-popup-color', secondaryCss);
                this.debugLog(`Popup color set (contrast, panel-match): ${secondaryCss}`);

            } else {
                // === DEFAULT STRATEGY: existing weighted average flow ===

                // === STEP 1: Panel color — weighted average of ALL pixels (no saturation filter) ===
                const dominantRgb = sharedPixbuf
                    ? cp.analyzePixbufForTone(sharedPixbuf, isDarkMode)
                    : cp.extractDominantTone(wallpaperPath, isDarkMode);
                const shadeFactor = isDarkMode
                    ? WALLPAPER_COLORS.PANEL_SHADE_DARK
                    : WALLPAPER_COLORS.PANEL_SHADE_LIGHT;
                const panelRgb = ThemeUtils.colorShade(dominantRgb, shadeFactor);
                const panelOpacity = this._getPanelOpacity();
                const panelCss = ThemeUtils.rgbaToCss(panelRgb[0], panelRgb[1], panelRgb[2], panelOpacity);
                this.extension.settings.setValue('choose-override-panel-color', panelCss);
                this.debugLog(`Panel color set: ${panelCss}`);

                // === STEP 2: Saturated palette — for accent/tint/glow colors only ===
                const preferLight = !isDarkMode;
                const palette = sharedPixbuf
                    ? cp.extractFromPixbuf(sharedPixbuf, 8, preferLight)
                    : cp.extractColorsFromImage(wallpaperPath, 8, preferLight);
                this.debugLog(`Palette extracted: ${palette ? palette.length : 0} colors`);

                // Dispose shared pixbuf now that both analyses are complete
                if (sharedPixbuf) {
                    try { sharedPixbuf.run_dispose(); } catch (e) { /* ignore */ }
                }

                // === STEP 3: Accent system (border, tint, shadow) ===
                // Only apply when full-auto is active — leaves visual effects page untouched
                // when full-auto experimental mode is disabled.
                const accentRgbArr = palette && palette.length > 0
                    ? cp.getBestAccentColor(palette)
                    : [DEFAULT_COLORS.DEFAULT_ACCENT.r, DEFAULT_COLORS.DEFAULT_ACCENT.g, DEFAULT_COLORS.DEFAULT_ACCENT.b];

                const accentColor = { r: accentRgbArr[0], g: accentRgbArr[1], b: accentRgbArr[2] };
                let accentForSystem = accentColor;

                if (this.extension.themeDetector && this.extension.themeDetector.validateAccentColor) {
                    const validation = this.extension.themeDetector.validateAccentColor(accentColor);
                    if (!validation.isValid) {
                        // If the color is too dark (not too light or desaturated), attempt to
                        // brighten it to a usable lightness before falling back to a generic default.
                        // This keeps the accent tonally tied to the wallpaper palette.
                        const isTooLight = validation.reason && validation.reason.includes('Too light');
                        const isDesaturated = validation.reason && validation.reason.includes('Too desaturated');
                        if (!isTooLight && !isDesaturated) {
                            // Boost lightness to 38% — enough to pass L>=25% threshold, not washed out
                            const hsl = ThemeUtils.rgbToHsl(accentColor.r, accentColor.g, accentColor.b);
                            const boosted = ThemeUtils.hslToRgb(hsl[0], hsl[1], WALLPAPER_COLORS.ACCENT_BOOST_TARGET_LIGHTNESS);
                            const revalidation = this.extension.themeDetector.validateAccentColor(
                                { r: boosted[0], g: boosted[1], b: boosted[2] }
                            );
                            if (revalidation.isValid) {
                                this.debugLog(
                                    `Accent brightened L:${hsl[2].toFixed(1)}%→${WALLPAPER_COLORS.ACCENT_BOOST_TARGET_LIGHTNESS}% ` +
                                    `rgb(${accentColor.r},${accentColor.g},${accentColor.b}) → ` +
                                    `rgb(${boosted[0]},${boosted[1]},${boosted[2]})`
                                );
                                accentForSystem = { r: boosted[0], g: boosted[1], b: boosted[2] };
                            } else {
                                this.debugLog(`Accent still invalid after boost (${revalidation.reason}), using default`);
                                accentForSystem = DEFAULT_COLORS.DEFAULT_ACCENT;
                            }
                        } else {
                            this.debugLog(`Accent invalid (${validation.reason}), using default`);
                            accentForSystem = DEFAULT_COLORS.DEFAULT_ACCENT;
                        }
                    }
                }

                if (this.extension.themeDetector && this.extension.themeDetector.generateAccentSystem) {
                    const accentVariants = this.extension.themeDetector.generateAccentSystem(accentForSystem, isDarkMode);
                    if (accentVariants && fullAuto) {
                        this.extension.settings.setValue('blur-border-color', accentVariants.border);
                        this.extension.settings.setValue('blur-background', accentVariants.tint);
                        this.extension.settings.setValue('accent-shadow-color', accentVariants.shadow);
                        this.debugLog(`Accent system applied (full-auto): border=${accentVariants.border}`);
                    }
                }

                // === STEP 4: Secondary color for popup background ===
                const secondaryRgb = palette && palette.length > 0
                    ? cp.getSecondaryColor(palette, dominantRgb, isDarkMode)
                    : dominantRgb;
                const menuOpacity = this._getMenuOpacity();
                const secondaryCss = ThemeUtils.rgbaToCss(secondaryRgb[0], secondaryRgb[1], secondaryRgb[2], menuOpacity);
                this.extension.settings.setValue('choose-override-popup-color', secondaryCss);
                this.debugLog(`Popup color set: ${secondaryCss}`);
            }

            this.debugLog("Color extraction completed successfully");

            // Activate panel override so extracted color applies to panel.
            // settings.setValue() does not fire the bindProperty IN callbacks for the color
            // pickers — the switch must be enabled explicitly to propagate the new color.
            // Popup override is intentionally NOT auto-enabled — user controls it explicitly.
            this.extension.settings.setValue('override-panel-color', true);

            this._wallpaperPath = wallpaperPath;
            this._calculateHash(wallpaperPath).then(hash => { this._lastHash = hash; })
                .catch(e => this.debugLog(`Error calculating wallpaper hash: ${e.message}`));

            // settings.setValue() does not trigger bindProperty IN callbacks — manual refresh required
            this._forceRefreshAfterExtraction();
        } catch (e) {
            this.debugLog(`Error during color extraction: ${e.message}`);
            global.logError(`[CSSPanels] [WallpaperMonitor] Extraction error: ${e.message}\n${e.stack}`);
        } finally {
            this._extractionInProgress = false;
        }
    }

    /**
     * Force full UI refresh after color extraction.
     * settings.setValue() bypasses bindProperty IN callbacks, so panel/popup styles
     * must be manually refreshed to reflect the new picker values.
     * @private
     */
    _forceRefreshAfterExtraction() {
        try {
            const ext = this.extension;

            if (ext.themeDetector && ext.themeDetector.invalidateCache) {
                ext.themeDetector.invalidateCache();
            }

            if (ext.cssManager && ext.cssManager.updateAllVariables) {
                ext.cssManager.updateAllVariables();
            }

            if (ext.panelStyler && ext.panelStyler.applyPanelStyles) {
                ext.panelStyler.applyPanelStyles();
                this.debugLog("Panel styles refreshed");
            }

            if (ext.refreshAllActiveStyles) {
                ext.refreshAllActiveStyles();
                this.debugLog("All active styles refreshed");
            }

            this.debugLog("Post-extraction UI refresh completed");
        } catch (e) {
            this.debugLog(`Error during post-extraction refresh: ${e.message}`);
        }
    }

    /**
     * Get panel opacity from extension settings
     * @returns {number} Opacity value (0.0-1.0), default 0.6
     * @private
     */
    _getPanelOpacity() {
        try {
            return this.extension.panelOpacity || 0.6;
        } catch (e) {
            return 0.6;
        }
    }

    /**
     * Get menu opacity from extension settings
     * @returns {number} Opacity value (0.0-1.0), default 0.8
     * @private
     */
    _getMenuOpacity() {
        try {
            return this.extension.menuOpacity || 0.8;
        } catch (e) {
            return 0.8;
        }
    }

    /**
     * Manual extraction trigger (called from settings button)
     * Works even when wallpaper detection is disabled — reads the wallpaper path
     * on-demand from org.cinnamon.desktop.background settings.
     *
     * @param {boolean} fullAuto - When true, also updates blur/accent color settings
     * @returns {boolean} True if extraction was triggered successfully
     */
    manualExtract(fullAuto = false) {
        this.debugLog("🔘 Manual extraction triggered");

        if (this._extractionInProgress) {
            this.debugLog("⏳ Extraction already in progress");
            return false;
        }

        // Always read current wallpaper from GSettings — cache may be stale when
        // detection is disabled (no signal updates) and user changed the wallpaper.
        // Fall back to cached path only if GSettings read fails.
        let wallpaperPath = this._resolveCurrentWallpaperPath();
        if (!wallpaperPath) {
            wallpaperPath = this._wallpaperPath;
        }

        if (!wallpaperPath) {
            this.debugLog("❌ No wallpaper path available");
            return false;
        }

        const isDarkMode = this._detectDarkMode();
        this._triggerExtraction(wallpaperPath, isDarkMode, fullAuto);

        return true;
    }

    /**
     * Resolve the current wallpaper path without requiring the monitor to be enabled.
     * Opens a temporary Gio.Settings instance if _backgroundSettings is not active.
     *
     * @returns {string|null} Plain file path or null if unavailable
     * @private
     */
    _resolveCurrentWallpaperPath() {
        try {
            const settings = this._backgroundSettings || new Gio.Settings({
                schema_id: "org.cinnamon.desktop.background",
            });
            const uri = settings.get_string("picture-uri");
            if (!uri) return null;

            const file = Gio.File.new_for_uri(uri);
            return file.get_path();
        } catch (e) {
            this.debugLog(`Error resolving wallpaper path: ${e.message}`);
            return null;
        }
    }

    /**
     * Get current wallpaper path from settings
     * @returns {string|null} Wallpaper file path or null
     * @private
     */
    _getCurrentWallpaperPath() {
        if (!this._backgroundSettings) {
            return null;
        }

        try {
            const uri = this._backgroundSettings.get_string("picture-uri");
            if (!uri) {
                return null;
            }

            // Use Gio.File for proper URI decoding (handles %20, UTF-8 paths, etc.)
            const file = Gio.File.new_for_uri(uri);
            return file.get_path();
        } catch (e) {
            this.debugLog(`Error getting wallpaper path: ${e.message}`);
            return null;
        }
    }

    /**
     * Calculate simple hash for file (to detect changes)
     * @param {string} filePath - Path to file
     * @returns {Promise<string|null>} Hash string or null
     * @private
     */
    _calculateHash(filePath) {
        return new Promise((resolve) => {
            const file = Gio.File.new_for_path(filePath);
            file.query_info_async(
                "standard::size,time::modified",
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null,
                (source, result) => {
                    try {
                        const info = source.query_info_finish(result);
                        const size = info.get_size();
                        const mtime = info.get_modification_time().tv_sec;
                        resolve(`${size}_${mtime}`);
                    } catch (e) {
                        this.debugLog(`Error calculating hash: ${e.message}`);
                        resolve(null);
                    }
                }
            );
        });
    }

    /**
     * Detect if dark mode is active
     * Uses ThemeDetector's comprehensive 3-tier detection logic:
     *   1. Theme name suffix (-Dark/-Light)
     *   2. GTK theme name patterns
     *   3. HSP brightness analysis (fallback)
     *
     * @returns {boolean} True if dark mode is active
     * @private
     */
    _detectDarkMode() {
        // Tone override: explicit setting takes priority over auto-detection
        const toneMode = this.extension.darkLightOverride || 'auto';
        if (toneMode === 'dark')  return true;
        if (toneMode === 'light') return false;
        // 'auto' falls through to existing isDarkModePreferred() logic below

        try {
            // Use ThemeDetector's robust dark mode detection (3-tier priority)
            if (this.extension.themeDetector && this.extension.themeDetector.isDarkModePreferred) {
                return this.extension.themeDetector.isDarkModePreferred();
            }

            // Fallback: Check GTK theme name for -Dark suffix (if ThemeDetector unavailable)
            const themeName = this.extension.themeDetector?.getCurrentThemeName?.() || "";
            const isDarkTheme = themeName.includes("-Dark") || themeName.includes("-dark");

            return isDarkTheme;
        } catch (e) {
            this.debugLog(`Error detecting dark mode: ${e.message}`);
            return false; // Default to light mode
        }
    }

    /**
     * Debug logging helper
     * @param {string} message - Message to log
     * @private
     */
    debugLog(message) {
        if (this.extension.debugLog) {
            this.extension.debugLog(`[WallpaperMonitor] ${message}`);
        }
    }
}

module.exports = WallpaperMonitor;
