const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const StylerBase = require("./stylerBase");
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const { TIMING, STYLING, COLORS } = require("./constants");
const { GlobalSignalsHandler } = require("./signalHandler");

// Import refactored modules
const PanelStyler = require("./panelStyler");
const PopupStyler = require("./popupStyler");
const NotificationStyler = require("./notificationStyler");
const OSDStyler = require("./osdStyler");
const NemoPopupStyler = require("./nemoPopupStyler");
const TooltipStyler = require("./tooltipStyler");
const AltTabStyler = require("./alttabStyler");
const DeskletStyler = require("./deskletStyler");
const SystemIndicator = require("./systemIndicator");
const ThemeDetector = require("./themeDetector");
const CSSManager = require("./cssManager");
const BlurTemplateManager = require("./blurTemplateManager");
const WallpaperMonitor = require("./wallpaperMonitor");
const HoverStyleManager = require("./hoverStyleManager");

/**
 * Main extension instance
 * @type {CSSPanelsExtension}
 */
let cssPanelsExtension = null;

/**
 * Main extension class for CSS Panels transparency control
 * Manages all transparency and blur effects for Cinnamon panels and UI elements
 */
class CSSPanelsExtension {
    /**
     * Constructor initializes all extension settings and default values
     * @param {Object} metadata - Extension metadata from metadata.json
     */
    constructor(metadata) {
        this.metadata = metadata;
        this._ = this.setupLocalization(metadata);
        this.setupSettings();
        this.initializeComponents();

        // Initialize panel monitoring variables
        this._panelCheckTimeout = null;
        this._debounceTimeout = null;

        // Initialize global signals handler for extension-level connections
        this._signalsHandler = new GlobalSignalsHandler();

        this.debugLog("CSSPanelsExtension initialized successfully");
    }

    /**
     * Setup localization support
     * @param {Object} metadata - Extension metadata
     * @returns {Function} Translation function
     */
    setupLocalization(metadata) {
        Gettext.bindtextdomain(metadata.uuid, metadata.path + "/po");
        return function (str) {
            return Gettext.dgettext(metadata.uuid, str) || str;
        };
    }

    /**
     * Initialize settings with proper bindings
     */
    setupSettings() {
        this.settings = new Settings.ExtensionSettings(this, this.metadata.uuid);
        this.bindSettings();
        this.initializeDefaults();
    }

    /**
     * Bind all settings to their respective callbacks
     */
    bindSettings() {
        // Basic transparency settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "panel-opacity",
            "panelOpacity",
            this.onPanelOpacityChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "menu-opacity",
            "menuOpacity",
            this.onMenuOpacityChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "border-radius",
            "borderRadius",
            this.onBorderRadiusChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "auto-detect-radius",
            "autoDetectRadius",
            this.onAutoDetectRadiusChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "apply-panel-radius",
            "applyPanelRadius",
            this.onPanelRadiusChanged.bind(this)
        );

        // Color override settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "override-panel-color",
            "overridePanelColor",
            this.onOverridePanelColorChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "choose-override-panel-color",
            "chooseOverridePanelColor",
            this.onChooseOverridePanelColorChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "override-popup-color",
            "overridePopupColor",
            this.onOverridePopupColorChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "choose-override-popup-color",
            "chooseOverridePopupColor",
            this.onChooseOverridePopupColorChanged.bind(this)
        );

        // Notification and OSD settings (NEW)
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-notification-styling",
            "enableNotificationStyling",
            this.onNotificationStylingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-osd-styling",
            "enableOSDStyling",
            this.onOSDStylingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-tooltip-styling",
            "enableTooltipStyling",
            this.onTooltipStylingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-alttab-styling",
            "enableAltTabStyling",
            this.onAltTabStylingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-desktop-context-styling",
            "enableDesktopContextStyling",
            this.onDesktopContextStylingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-desklet-styling",
            "enableDeskletStyling",
            this.onDeskletStylingChanged.bind(this)
        );

        // Blur effect settings
        this.bindBlurSettings();

        // System settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "hide-tray-icon",
            "hideTrayIcon",
            this.onHideTrayIconChanged.bind(this)
        );
        this.settings.bindProperty(Settings.BindingDirection.IN, "debug-logging", "debugLogging", (value) => {
            global.logWarning(`[CSSPanels] Debug logging changed to: ${value}`);
            this.onDebugLoggingChanged();
        });

        // Phase 2.5B - Accent color detection settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "auto-apply-accent-on-theme-change",
            "autoApplyAccentOnThemeChange",
            this.onAutoApplyAccentChanged.bind(this)
        );

        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "accent-shadow-color",
            "accentShadowColor",
            null // Reserved for future use (Phase 2.5C+)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "shadow-spread",
            "shadowSpread",
            this.onBlurSettingsChanged.bind(this) // Phase 2.5D - Trigger UI refresh on change
        );

        // Glow effect settings (inset/outset/none)
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "glow-mode",
            "glowMode",
            this.onGlowSettingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "glow-blur",
            "glowBlur",
            this.onGlowSettingChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "glow-intensity",
            "glowIntensity",
            this.onGlowSettingChanged.bind(this)
        );

        // Phase 2.5C - Wallpaper detection settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "enable-wallpaper-detection",
            "enableWallpaperDetection",
            this.onWallpaperDetectionChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "full-auto-mode",
            "fullAutoMode",
            this.onFullAutoModeChanged.bind(this)
        );
        // Wallpaper extraction mode settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "wallpaper-color-strategy", "wallpaperColorStrategy", null);
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "dark-light-override",  "darkLightOverride",  null);
    }

    /**
     * Bind all blur-related settings
     */
    bindBlurSettings() {
        const blurSettings = [
            "blur-radius",
            "blur-saturate",
            "blur-contrast",
            "blur-brightness",
            "blur-background",
            "blur-border-color",
            "blur-transition",
            "blur-opacity",
            "blur-template",
        ];

        blurSettings.forEach((setting) => {
            const property = setting.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
            const callback =
                setting === "blur-opacity"
                    ? this.onBlurOpacityChanged.bind(this)
                    : setting === "blur-template"
                    ? this.onBlurTemplateChanged.bind(this)
                    : this.onBlurSettingsChanged.bind(this);
            this.settings.bindProperty(Settings.BindingDirection.IN, setting, property, callback);
        });
    }

    /**
     * Initialize default values for all settings
     */
    initializeDefaults() {
        // Basic transparency defaults
        if (this.panelOpacity === undefined) this.panelOpacity = STYLING.DEFAULT_PANEL_OPACITY;
        if (this.menuOpacity === undefined) this.menuOpacity = STYLING.DEFAULT_MENU_OPACITY;
        if (this.borderRadius === undefined) this.borderRadius = STYLING.DEFAULT_BORDER_RADIUS;
        if (this.autoDetectRadius === undefined) this.autoDetectRadius = true;
        if (this.applyPanelRadius === undefined) this.applyPanelRadius = true;

        // Color override defaults
        if (this.overridePanelColor === undefined) this.overridePanelColor = false;
        if (this.chooseOverridePanelColor === undefined) this.chooseOverridePanelColor = COLORS.DEFAULT_PANEL_COLOR;
        if (this.overridePopupColor === undefined) this.overridePopupColor = false;
        if (this.chooseOverridePopupColor === undefined) this.chooseOverridePopupColor = COLORS.DEFAULT_POPUP_COLOR;

        // NEW: Notification and OSD defaults
        if (this.enableNotificationStyling === undefined) this.enableNotificationStyling = false;
        if (this.enableOSDStyling === undefined) this.enableOSDStyling = false;
        if (this.enableTooltipStyling === undefined) this.enableTooltipStyling = true;
        if (this.enableAltTabStyling === undefined) this.enableAltTabStyling = false;
        if (this.enableDesktopContextStyling === undefined) this.enableDesktopContextStyling = false;
        if (this.enableDeskletStyling === undefined) this.enableDeskletStyling = false;

        // System defaults
        if (this.hideTrayIcon === undefined) this.hideTrayIcon = true;
        if (this.debugLogging === undefined) this.debugLogging = false;

        // Blur defaults
        this.initializeBlurDefaults();
    }

    /**
     * Initialize blur effect default values
     */
    initializeBlurDefaults() {
        if (this.blurRadius === undefined) this.blurRadius = STYLING.DEFAULT_BLUR_RADIUS;
        if (this.blurSaturate === undefined) this.blurSaturate = COLORS.DEFAULT_BLUR_SATURATE;
        if (this.blurContrast === undefined) this.blurContrast = COLORS.DEFAULT_BLUR_CONTRAST;
        if (this.blurBrightness === undefined) this.blurBrightness = COLORS.DEFAULT_BLUR_BRIGHTNESS;
        if (this.blurBackground === undefined) this.blurBackground = COLORS.DEFAULT_BLUR_BACKGROUND;
        if (this.blurBorderColor === undefined) this.blurBorderColor = COLORS.DEFAULT_BLUR_BORDER_COLOR;
        if (this.blurBorderWidth === undefined) this.blurBorderWidth = COLORS.DEFAULT_BLUR_BORDER_WIDTH;
        if (this.blurTransition === undefined) this.blurTransition = TIMING.TRANSITION_CSS_DEFAULT;
        if (this.blurOpacity === undefined) this.blurOpacity = COLORS.DEFAULT_BLUR_OPACITY;
        if (this.blurTemplate === undefined) this.blurTemplate = COLORS.DEFAULT_BLUR_TEMPLATE;
    }

    /**
     * Initialize all component modules
     */
    initializeComponents() {
        this.cssManager = new CSSManager(this);
        this.themeDetector = new ThemeDetector(this);
        this.blurTemplateManager = new BlurTemplateManager(this);
        this.wallpaperMonitor = new WallpaperMonitor(this); // Phase 2.5C
        this.panelStyler = new PanelStyler(this);
        this.popupStyler = new PopupStyler(this);
        this.notificationStyler = new NotificationStyler(this);
        this.osdStyler = new OSDStyler(this);
        this.nemoPopupStyler = new NemoPopupStyler(this);
        this.tooltipStyler = new TooltipStyler(this);
        this.altTabStyler = new AltTabStyler(this);
        this.deskletStyler = new DeskletStyler(this);
        this.systemIndicator = new SystemIndicator(this);
        this.hoverStyleManager = new HoverStyleManager(this);
        this.panelMonitoringTimeout = null;
        this.panelMonitoringConnection = null;
        this.isEnabled = false;
    }

    /**
     * Debug logging function - only logs when debug logging is enabled
     * @param {string} message - The message to log
     * @param {any} data - Optional data to log
     */
    debugLog(message, data = null) {
        // Allow logging during disable/cleanup phase
        const isCleanupMessage =
            message.includes("Disabling") ||
            message.includes("Cleaning") ||
            message.includes("Restored") ||
            message.includes("disabled") ||
            message.includes("cleanup");

        if (!this.isEnabled && !isCleanupMessage) return; // Suppress logs when disabled, except cleanup messages
        if (this.debugLogging) {
            const timestamp = new Date().toISOString().slice(11, 19);
            if (data) {
                global.logError(`[CSSPanels] [${timestamp}] ${message}`, data);
            } else {
                global.logError(`[CSSPanels] [${timestamp}] ${message}`);
            }
        }
    }
    /**
     * Schedule refresh for all panels with a short delay
     * Prevents multiple rapid refresh calls
     */
    scheduleRefreshPanels() {
        if (this._scheduleRefreshTimeout) {
            imports.mainloop.source_remove(this._scheduleRefreshTimeout);
        }
        this._scheduleRefreshTimeout = imports.mainloop.timeout_add(TIMING.DEBOUNCE_SHORT, () => {
            this.checkForNewPanels();
            this._scheduleRefreshTimeout = null;
            return false;
        });
    }

    /**
     * Setup periodic panel monitoring
     */
    setupPanelMonitoring() {
        try {
            this.debugLog("Setting up panel monitoring...");

            // Use global.settings signal if available for tracking added/removed panels
            if (global.settings && typeof global.settings.connect === "function") {
                this._signalsHandler.add([
                    global.settings,
                    "changed::panels-enabled",
                    () => {
                        this.debugLog("Panels-enabled setting changed - checking for new panels");
                        // Implement debouncing to prevent frequent calls
                        if (this._debounceTimeout) {
                            imports.mainloop.source_remove(this._debounceTimeout);
                        }
                        this._debounceTimeout = imports.mainloop.timeout_add(TIMING.DEBOUNCE_PANEL_MONITORING, () => {
                            this.checkForNewPanels();
                            this._debounceTimeout = null;
                            return false;
                        });
                    },
                ]);
                this.debugLog("Using global.settings panels-enabled signal for monitoring");
                return; // No need for polling if we have the signal
            }

            // Fallback to longer polling interval (10 seconds)
            this._panelCheckTimeout = imports.mainloop.timeout_add(TIMING.POLL_PANELS_LONG, () => {
                this.checkForNewPanels();
                return true; // Continue the timeout
            });

            this.debugLog("Panel monitoring setup completed with polling");
        } catch (e) {
            this.debugLog("Error setting up panel monitoring:", e);
        }
    }

    /**
     * Check for new panels and apply styles if found
     */
    checkForNewPanels() {
        try {
            let currentPanels = this.panelStyler.getAllPanels();
            let knownPanels = Object.keys(this.panelStyler.originalPanelStyles);

            // Check for any new panels
            let newPanelsFound = false;
            currentPanels.forEach((panelInfo) => {
                if (!knownPanels.includes(panelInfo.id)) {
                    this.debugLog(`New panel detected: ${panelInfo.id}`);
                    newPanelsFound = true;
                }
            });

            // If new panels are found, reapply styles
            if (newPanelsFound) {
                this.debugLog("Applying styles to new panels...");
                this._newPanelApplyTimeout = imports.mainloop.timeout_add(TIMING.DEBOUNCE_MEDIUM, () => {
                    this.panelStyler.applyPanelStyles();
                    this._newPanelApplyTimeout = null;
                    return false;
                });
            }
        } catch (e) {
            this.debugLog("Error checking for new panels:", e);
        }
    }

    /**
     * Cleanup panel monitoring resources
     */
    cleanupPanelMonitoring() {
        try {
            this.debugLog("Cleaning up panel monitoring...");

            if (this._panelCheckTimeout) {
                imports.mainloop.source_remove(this._panelCheckTimeout);
                this._panelCheckTimeout = null;
                this.debugLog("Removed panel check timeout");
            }

            // Cleanup debounce timeout if exists
            if (this._debounceTimeout) {
                imports.mainloop.source_remove(this._debounceTimeout);
                this._debounceTimeout = null;
            }

            // Signal handler cleanup is automatic via destroy()
            this.debugLog("Panel monitoring cleanup completed");
        } catch (e) {
            this.debugLog("Error cleaning up panel monitoring:", e);
        }
    }
    /**
     * Enable the extension and apply all styling
     */
    enable() {
        this.isEnabled = true; // Set flag early to prevent premature callback execution

        // Log extension startup info
        const enabledFeatures = [];
        if (this.enableTooltipStyling) enabledFeatures.push("Tooltip");
        if (this.enableAltTabStyling) enabledFeatures.push("Alt-Tab");
        if (this.enableNotificationStyling) enabledFeatures.push("Notification");
        if (this.enableOSDStyling) enabledFeatures.push("OSD");
        if (this.enableDesktopContextStyling) enabledFeatures.push("Desktop Context");
        if (this.enableDeskletStyling) enabledFeatures.push("Desklet");

        global.logWarning(
            `[CSSPanels] Extension started - Theme: ${
                this.themeDetector.currentTheme || "Unknown"
            }, Enabled features: Panel, Popup${enabledFeatures.length > 0 ? ", " + enabledFeatures.join(", ") : ""}`
        );

        this.debugLog("Enabling extension...");
        try {
            this.cssManager.initialize();
            this.themeDetector.setup();

            // NEW UNIFIED FLOW: Detect all theme properties and apply based on switches
            const detectedThemeData = this.themeDetector.redetectAllThemeData();
            this.applyDetectedThemeData(detectedThemeData);

            this.cssManager.updateAllVariables(); // Update CSS variables after theme detection
            this.panelStyler.safeEnable();
            this.popupStyler.safeEnable();
            this.hoverStyleManager.enable(); // Attach hover hooks after panel applets are in tree

            // Enable tooltip styling if enabled
            if (this.enableTooltipStyling) {
                this.tooltipStyler.safeEnable();
            }

            // Enable alttab styling if enabled
            if (this.enableAltTabStyling) {
                this.altTabStyler.safeEnable();
            }

            // Enable notification and OSD styling if enabled
            if (this.enableNotificationStyling) {
                this.notificationStyler.safeEnable();
            }

            if (this.enableOSDStyling) {
                this.osdStyler.safeEnable();
            }

            if (this.enableDesktopContextStyling) {
                this.nemoPopupStyler.safeEnable();
            }

            if (this.enableDeskletStyling) {
                this.deskletStyler.safeEnable();
            }

            // Enable wallpaper monitoring if enabled (Phase 2.5C)
            if (this.enableWallpaperDetection) {
                this.wallpaperMonitor.enable();
            }

            // Create system indicator if enabled
            if (!this.hideTrayIcon) {
                this.systemIndicator.create();
            }

            // Setup panel monitoring
            this.setupPanelMonitoring();

            // Note: Theme properties already detected and applied above via redetectAllThemeData()
            // No need for additional accent detection here

            this.forceSettingsUpdate();
            this.debugLog("Extension enabled successfully");
        } catch (error) {
            this.debugLog("Error during enable:", error);
            global.logError("[CSSPanels] Error in enable: " + error.message);
        }

        // Return callbacks for external access
        // Return callbacks for external access
        return {
            resetBlurToDefaults: () => {
                global.logWarning("[CSSPanels] External resetBlurToDefaults called");
                this._resetBlurToDefaults();
            },
            applyDetectedAccent: () => {
                global.logWarning("[CSSPanels] External applyDetectedAccent called");
                const detectedThemeData = this.themeDetector.redetectAllThemeData();
                this.applyDetectedThemeData(detectedThemeData);
                // Button always populates pickers with accent shadow regardless of auto-apply toggle.
                // redetectAllThemeData() skips accent when auto-apply is OFF, so detect explicitly.
                let accentVariants = detectedThemeData.accentColor.variants;
                if (!accentVariants) {
                    const accentColor = this.themeDetector.detectThemeAccentColor();
                    if (accentColor) {
                        accentVariants = this.themeDetector.generateAccentSystem(
                            accentColor,
                            detectedThemeData.isDarkMode
                        );
                    }
                }
                if (accentVariants) {
                    // Apply accent to blur effects (border, tint, shadow settings).
                    // applyDetectedThemeData() skipped this step because shouldApply is false;
                    // button always applies regardless of auto-apply toggle.
                    this.applyAccentSystemToBlurEffects(accentVariants);
                    this.settings.setValue("choose-override-panel-color", accentVariants.shadow);
                    this.settings.setValue("choose-override-popup-color", accentVariants.shadow);
                    this.debugLog(`  ✓ override pickers set to accent shadow: ${accentVariants.shadow}`);
                }
                // Disable wallpaper detection (theme accent takes priority)
                if (this.enableWallpaperDetection) {
                    this.settings.setValue("enable-wallpaper-detection", false);
                }
                // Enable panel override so accent shadow is immediately visible
                if (!this.overridePanelColor) {
                    this.settings.setValue("override-panel-color", true);
                }
                // Programmatic settings.setValue() does not trigger IN-bound callbacks;
                // explicitly refresh all visual styles to reflect the newly written values.
                if (accentVariants) {
                    this.cssManager.updateAllVariables();
                    this.panelStyler.applyPanelStyles();
                    this.scheduleRefreshPanels();
                    this.refreshAllActiveStyles();
                }
            },
            extractWallpaperColors: () => {
                global.logWarning("[CSSPanels] External extractWallpaperColors called");
                this.extractWallpaperColors();
            },
        };
    }

    /**
     * Disable the extension and restore original appearance
     */
    disable() {
        this.isEnabled = false; // Set flag immediately to prevent settings callbacks

        this.debugLog("Disabling extension... Starting cleanup");
        try {
            // Disable all stylers in reverse order to avoid dependencies
            // Each styler gets its own try/catch to ensure cleanup continues on failure
            this.debugLog("Disabling all stylers...");

            // Unload hover stylesheet first (removes from St theme before stylers run)
            if (this.hoverStyleManager) {
                try {
                    this.hoverStyleManager.disable();
                } catch (e) {
                    this.debugLog(`Error disabling hoverStyleManager: ${e.message}`);
                }
            }

            const stylers = [
                ['deskletStyler', this.deskletStyler],
                ['altTabStyler', this.altTabStyler],
                ['tooltipStyler', this.tooltipStyler],
                ['osdStyler', this.osdStyler],
                ['notificationStyler', this.notificationStyler],
                ['nemoPopupStyler', this.nemoPopupStyler],
                ['popupStyler', this.popupStyler],
                ['panelStyler', this.panelStyler],
            ];
            for (const [name, styler] of stylers) {
                try {
                    styler.disable();
                } catch (e) {
                    this.debugLog(`Error disabling ${name}: ${e.message}`);
                    global.logError(`[CSSPanels] Error disabling ${name}: ${e.message}`);
                }
            }

            // Disable wallpaper monitoring (Phase 2.5C)
            if (this.wallpaperMonitor) {
                try {
                    this.wallpaperMonitor.disable();
                } catch (e) {
                    this.debugLog(`Error disabling wallpaperMonitor: ${e.message}`);
                }
            }

            this.debugLog("All stylers disabled");

            // Cleanup monitoring and connections AFTER stylers
            this.debugLog("Cleaning up monitoring and connections...");
            this.cleanupPanelMonitoring();
            this.clearAllTimeouts();

            // Cleanup system components
            this.debugLog("Cleaning up system components...");
            this.systemIndicator.destroy();
            this.themeDetector.cleanup();
            this.cssManager.cleanup();

            // Cleanup blur template cache to free memory
            this.blurTemplateManager.cleanup();

            // Cleanup extension-level signal handler
            const signalCount = this._signalsHandler.getSignalCount();
            this._signalsHandler.destroy();
            this.debugLog(`Cleaned up ${signalCount} extension signals`);

            // Finalize settings: unregisters from settingsManager, removes all bindings and signals
            if (this.settings) {
                this.settings.finalize();
                this.settings = null;
            }

            this.debugLog("Extension disabled successfully - all resources cleaned");
        } catch (error) {
            this.debugLog("Error during disable:", error);
            global.logError("[CSSPanels] Error in disable: " + error.message);
            // Don't call forceCleanupAllResources again - already in progress
        }
    }

    /**
     * Force update all settings to UI
     */
    forceSettingsUpdate() {
        this.onPanelOpacityChanged();
        this.onMenuOpacityChanged();
        this.onBorderRadiusChanged();
        this.onBlurSettingsChanged();
        this.cssManager.updateAllVariables();
    }

    /**
     * Clear all known timeouts and intervals
     */
    clearAllTimeouts() {
        try {
            // Clear all tracked timeouts
            const timeouts = [
                '_scheduleRefreshTimeout',
                '_newPanelApplyTimeout',
                '_osdCleanupTimeout',
                '_tooltipCleanupTimeout',
            ];
            for (const key of timeouts) {
                if (this[key]) {
                    imports.mainloop.source_remove(this[key]);
                    this[key] = null;
                }
            }
            this.debugLog("Clearing timeouts...");
        } catch (e) {
            this.debugLog("Error clearing timeouts:", e);
        }
    }

    /**
     * Reset blur settings to selected template defaults
     */
    _resetBlurToDefaults() {
        this.debugLog("Applying selected blur template");
        // Implementation moved to BlurTemplateManager for better organization
        this.blurTemplateManager.applyTemplate(this.blurTemplate);
        // Refresh OSD styles with new template settings
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    /**
     * Refresh all active styled elements with current settings
     * Centralized method to update all components when settings change
     */
    /**
     * Refresh all active styled elements (popups, tooltips, OSD, etc.)
     * IMPORTANT: This is called AFTER cssManager and panelStyler have already been updated
     * Do NOT refresh panel or CSS variables again to avoid duplicate work
     */
    refreshAllActiveStyles() {
        this.debugLog("Refreshing all active styled elements (excluding panel - already updated)");

        // NOTE: Do NOT call cssManager.updateAllVariables() - already done by caller
        // NOTE: Do NOT call panelStyler.applyPanelStyles() - already done by caller

        // Refresh hover/active color override stylesheet with new colors
        this.hoverStyleManager.refresh();

        // Refresh other UI elements
        this.popupStyler.refreshActiveMenus();
        if (this.enableTooltipStyling) {
            this.tooltipStyler.refreshActiveTooltips();
        }
        if (this.enableAltTabStyling) {
            this.altTabStyler.refreshActiveSwitchers();
        }
        if (this.enableOSDStyling) {
            this.osdStyler.refreshAllOSDs();
        }
        if (this.enableNotificationStyling) {
            // this.notificationStyler.refreshActiveNotifications();
        }
        if (this.enableDesktopContextStyling) {
            this.nemoPopupStyler.refresh();
        }
        if (this.enableDeskletStyling && this.deskletStyler) {
            this.deskletStyler.refreshAllDesklets();
        }
    }

    // === SETTINGS CALLBACKS ===
    onPanelOpacityChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Panel opacity changed to: ${this.panelOpacity}`);
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();
    }

    onMenuOpacityChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Menu opacity changed to: ${this.menuOpacity}`);
        this.cssManager.updateAllVariables();
        // Refresh OSD elements with new border radius
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onBorderRadiusChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Border radius changed to: ${this.borderRadius}px`);
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();

        // Refresh OSD elements with new border radius
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onAutoDetectRadiusChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Auto-detect radius changed to: ${this.autoDetectRadius}`);
        this.themeDetector.invalidateCache();
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();

        // Refresh OSD elements when auto-detect changes
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onPanelRadiusChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Apply panel radius changed to: ${this.applyPanelRadius}`);
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();

        // Refresh OSD elements when panel radius setting changes
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onOverridePanelColorChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Override panel color changed to: ${this.overridePanelColor}`);
        this.themeDetector.invalidateCache();
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();
        this.popupStyler.refreshActiveMenus();
        this.hoverStyleManager.refresh();
        if (this.enableTooltipStyling) {
            this.tooltipStyler.refreshActiveTooltips();
        }

        // Refresh OSD elements with new panel color
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onChooseOverridePanelColorChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Choose override panel color changed to: ${this.chooseOverridePanelColor}`);
        this.themeDetector.invalidateCache();
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();
        this.popupStyler.refreshActiveMenus();
        this.hoverStyleManager.refresh();
        if (this.enableTooltipStyling) {
            this.tooltipStyler.refreshActiveTooltips();
        }

        // Refresh OSD elements with new panel color value
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onOverridePopupColorChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Override popup color changed to: ${this.overridePopupColor}`);
        this.themeDetector.invalidateCache();
        this.cssManager.updateAllVariables(); // Update CSS first
        this.refreshAllActiveStyles();
        // Ensure OSD gets popup color overrides
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onChooseOverridePopupColorChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Choose override popup color changed to: ${this.chooseOverridePopupColor}`);
        this.themeDetector.invalidateCache();
        this.cssManager.updateAllVariables(); // Update CSS first
        this.refreshAllActiveStyles();
        // Ensure OSD gets new popup color value
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onNotificationStylingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Notification styling changed to: ${this.enableNotificationStyling}`);
        if (this.enableNotificationStyling) {
            this.notificationStyler.safeEnable();
        } else {
            this.notificationStyler.disable();
        }
    }

    onOSDStylingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`OSD styling changed to: ${this.enableOSDStyling}`);
        if (this.enableOSDStyling) {
            this.osdStyler.safeEnable();
        } else {
            // Force immediate cleanup of all styled OSDs before disabling
            this.osdStyler.restoreAllOSDs();
            this.osdStyler.disable();
            // Additional cleanup with timeout to ensure complete restoration
            if (this._osdCleanupTimeout) {
                imports.mainloop.source_remove(this._osdCleanupTimeout);
            }
            this._osdCleanupTimeout = imports.mainloop.timeout_add(TIMING.DEBOUNCE_MEDIUM, () => {
                this.osdStyler.restoreAllOSDs();
                this._osdCleanupTimeout = null;
                return false;
            });
        }
    }

    onTooltipStylingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Tooltip styling changed to: ${this.enableTooltipStyling}`);
        if (this.enableTooltipStyling) {
            this.tooltipStyler.safeEnable();
        } else {
            // Force immediate cleanup of all styled tooltips before disabling
            this.tooltipStyler.cleanupActiveTooltips();
            this.tooltipStyler.disable();
            // Additional cleanup with timeout to ensure complete restoration
            if (this._tooltipCleanupTimeout) {
                imports.mainloop.source_remove(this._tooltipCleanupTimeout);
            }
            this._tooltipCleanupTimeout = imports.mainloop.timeout_add(TIMING.DEBOUNCE_MEDIUM, () => {
                this.tooltipStyler.cleanupActiveTooltips();
                this._tooltipCleanupTimeout = null;
                return false;
            });
        }
    }

    onAltTabStylingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`AltTab styling changed to: ${this.enableAltTabStyling}`);
        if (this.enableAltTabStyling) {
            this.altTabStyler.safeEnable();
        } else {
            this.altTabStyler.disable();
        }
    }

    /**
     * Handle wallpaper detection setting change (Phase 2.5C)
     * Automatically enables panel/popup color overrides when detection is turned on,
     * and disables full-auto-mode when detection is turned off.
     */
    onWallpaperDetectionChanged() {
        if (!this.isEnabled) return;
        this.debugLog(`Wallpaper detection changed to: ${this.enableWallpaperDetection}`);

        if (this.enableWallpaperDetection) {
            // Auto-enable panel color override so extracted colors apply to panel
            if (!this.overridePanelColor) {
                this.settings.setValue("override-panel-color", true);
            }
            this.wallpaperMonitor.enable();
        } else {
            // Turn off full-auto-mode when detection is disabled (dependency hides it)
            if (this.fullAutoMode) {
                this.settings.setValue("full-auto-mode", false);
            }
            this.wallpaperMonitor.disable();
        }
    }

    /**
     * Handle full auto mode setting change (Phase 2.5C)
     * When enabled, wallpaper changes will also update blur/accent color settings.
     * When disabled, only panel and popup colors are updated on wallpaper change.
     */
    onFullAutoModeChanged() {
        if (!this.isEnabled) return;
        this.debugLog(`Full auto mode changed to: ${this.fullAutoMode}`);
    }

    /**
     * Manual wallpaper color extraction callback (Phase 2.5C)
     * Called when user clicks "Extract colors from wallpaper" button
     */
    extractWallpaperColors() {
        this.debugLog("🔘 Manual wallpaper extraction requested");

        if (!this.wallpaperMonitor) {
            this.debugLog("❌ WallpaperMonitor not initialized");
            Main.notifyError("CSS Panels", "Wallpaper monitor not available");
            return;
        }

        const success = this.wallpaperMonitor.manualExtract(this.fullAutoMode);

        if (!success) {
            Main.notifyError("CSS Panels", "No wallpaper detected or extraction in progress");
        } else {
            this.debugLog("✅ Manual extraction triggered successfully");
            // Phase 3 will add actual extraction notification
        }
    }

    onBlurSettingsChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog("Blur settings changed");
        this.cssManager.updateAllVariables(); // Update CSS first
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();
        this.refreshAllActiveStyles();
    }

    /**
     * Handle glow setting changes
     * Refreshes panels to apply new glow configuration
     */
    onGlowSettingChanged() {
        if (!this.isEnabled) return;
        this.debugLog(`Glow settings changed - mode: ${this.glowMode}`);

        // Clear cache to force CSS regeneration
        if (this.blurTemplateManager) {
            this.blurTemplateManager.clearCache();
            this.debugLog("Template cache cleared after glow change");
        }

        if (this.panelStyler && !this.panelStyler._enableFailed) {
            this.panelStyler.refresh();
        }
    }

    onBlurOpacityChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Blur opacity changed to: ${this.blurOpacity}`);
        this.panelStyler.applyPanelStyles();
        this.scheduleRefreshPanels();
    }

    onBlurTemplateChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Blur template changed to: ${this.blurTemplate}`);
        // Template is used in reset function
        // Refresh OSD styles when template changes
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onHideTrayIconChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Hide tray icon changed to: ${this.hideTrayIcon}`);
        if (this.hideTrayIcon) {
            this.systemIndicator.destroy();
        } else {
            this.systemIndicator.create();
        }
    }

    onDebugLoggingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        // this.debugLog(`Debug logging changed to: ${this.debugLogging}`);
        // debugLog checks this value automatically
    }

    onDesktopContextStylingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Desktop context styling changed to: ${this.enableDesktopContextStyling}`);
        if (this.enableDesktopContextStyling) {
            this.nemoPopupStyler.safeEnable();
        } else {
            this.nemoPopupStyler.disable();
        }
    }

    onDeskletStylingChanged() {
        if (!this.isEnabled) return; // Prevent execution when disabled
        this.debugLog(`Desklet styling changed to: ${this.enableDeskletStyling}`);
        if (this.enableDeskletStyling) {
            this.deskletStyler.safeEnable();
        } else {
            this.deskletStyler.restoreAllDesklets();
            this.deskletStyler.disable();
        }
    }

    // === PHASE 2.5B - ACCENT COLOR CALLBACKS ===

    /**
     * Callback when auto-apply-accent-on-theme-change toggle changes
     * When enabled: automatically detect and apply accent colors on theme changes
     * When disabled: user must manually click button to apply accent colors
     */
    onAutoApplyAccentChanged() {
        if (!this.isEnabled) return;
        this.debugLog(
            `Auto-apply accent on theme change ${
                this.autoApplyAccentOnThemeChange ? "ENABLED" : "DISABLED"
            }`
        );

        if (this.autoApplyAccentOnThemeChange) {
            // Apply accent colors immediately when enabled using unified flow
            this.debugLog("Applying accent colors immediately via unified detection flow");
            const detectedThemeData = this.themeDetector.redetectAllThemeData();
            this.applyDetectedThemeData(detectedThemeData);
        } else {
            this.debugLog("Auto-apply disabled, colors preserved until manual apply");
            // Do NOT restore default colors - keep current colors
            // User can manually apply or keep their custom colors
        }
    }

    /**
     * Apply detected theme data from themeDetector.redetectAllThemeData()
     * This is the MAIN entry point called from themeDetector's theme-set callback
     *
     * @param {Object} detectedData - Structured object from redetectAllThemeData()
     * {
     *   borderRadius: {detected: number, shouldApply: boolean},
     *   accentColor: {detected: string, shouldApply: boolean, variants: object},
     *   panelColor: {detected: string, shouldApply: boolean},
     *   popupColor: {detected: string, shouldApply: boolean},
     *   isDarkMode: boolean
     * }
     */
    applyDetectedThemeData(detectedData) {
        this.debugLog("=".repeat(60));
        this.debugLog("► APPLYING DETECTED THEME DATA...");

        let appliedCount = 0;

        // 1. Apply border-radius if auto-detect enabled
        if (detectedData.borderRadius.shouldApply) {
            this.settings.setValue("border-radius", detectedData.borderRadius.detected);
            this.debugLog(`  ✓ border-radius: ${detectedData.borderRadius.detected}px (applied)`);
            appliedCount++;
        } else {
            this.debugLog(`  ⊗ border-radius: skipped (auto-detect disabled)`);
        }

        // 2. Apply accent colors if auto-apply enabled
        if (detectedData.accentColor.shouldApply && detectedData.accentColor.variants) {
            this.applyAccentSystemToBlurEffects(detectedData.accentColor.variants);
            this.debugLog(`  ✓ accent colors: ${detectedData.accentColor.detected} (applied with variants)`);
            appliedCount++;
        } else {
            this.debugLog(`  ⊗ accent colors: skipped (auto-apply disabled)`);
        }

        // 3. PANEL BASE COLOR DECISION
        // Panel base color always comes from detected theme color.
        // Accent variants (border, tint, shadow) are applied separately via applyAccentSystemToBlurEffects.
        // accent.shadow is a box-shadow color (deep dark, low alpha) — not suitable as panel background.
        const panelBaseColor = detectedData.panelColor.detected;
        this.themeDetector.currentPanelBaseColor = panelBaseColor; // Update stored base

        if (detectedData.accentColor.shouldApply) {
            this.debugLog(`  ✓ panel-color: ${panelBaseColor} (from theme - accent applied separately)`);
        } else {
            this.debugLog(`  ✓ panel-color: ${panelBaseColor} (from theme - auto-apply OFF)`);
        }

        // Write accent shadow to picker when accent is available; else write theme base color.
        // Guard: if user override is ON and auto-apply is OFF, preserve the user's chosen color.
        // Note: picker alpha is ignored by cssManager (panel-bg-rgb uses r,g,b only).
        if (detectedData.accentColor.shouldApply || !this.overridePanelColor) {
            const pickerPanelColor = (detectedData.accentColor.shouldApply && detectedData.accentColor.variants)
                ? detectedData.accentColor.variants.shadow
                : panelBaseColor;
            this.settings.setValue("choose-override-panel-color", pickerPanelColor);
            this.debugLog(`  ✓ panel picker: ${pickerPanelColor} (${detectedData.accentColor.shouldApply ? "accent shadow" : "theme base"})`);
        } else {
            this.debugLog(`  ⊗ panel picker: preserved (user override active, auto-apply OFF)`);
        }
        appliedCount++;

        // 4. POPUP COLOR: always update picker with detected theme color.
        // Override switch is never auto-enabled — user controls it explicitly.
        // Picker stays in sync so the correct color is ready whenever user enables override.
        const pickerPopupColor = (detectedData.accentColor.shouldApply && detectedData.accentColor.variants)
            ? detectedData.accentColor.variants.shadow
            : this.themeDetector.getCurrentPanelColor();
        this.settings.setValue("choose-override-popup-color", pickerPopupColor);
        this.debugLog(`  ✓ popup picker: ${pickerPopupColor} (${detectedData.accentColor.shouldApply ? "accent shadow" : "inherited from panel"})`);
        appliedCount++;

        // 5. Coordinated refresh ONCE at the end
        this.debugLog("► Refreshing all UI elements (coordinated single pass)...");
        this.cssManager.updateAllVariables();
        this.panelStyler.applyPanelStyles();
        this.refreshAllActiveStyles(); // Popups, tooltips, OSD, etc.

        this.debugLog(
            `✓ Theme application complete: ${appliedCount}/4 properties applied (mode: ${
                detectedData.isDarkMode ? "DARK" : "LIGHT"
            })`
        );
        this.debugLog("=".repeat(60));
    }

    /**
     * Detect accent color from theme and generate complete accent system
     * This is a DATA SOURCE function - it only populates color picker values in settings.
     * Similar to blur template apply - uses settings.setValue() to update UI.
     *
     * Flow:
     * 1. Detect base accent from theme CSS (switch:checked or theme_selected_bg_color)
     * 2. Generate accent variants (border, tint, shadow)
     * 3. Populate color pickers: blur-border-color, blur-background, accent-shadow-color
     * 4. User can manually adjust these values or let auto-apply mode handle it
     */
    detectAndApplyAccentColors() {
        this.debugLog("Detecting and applying theme accent colors...");

        // Detect dark/light mode FIRST
        const isDarkMode = this.themeDetector.isDarkModePreferred();
        this.debugLog(`Theme mode: ${isDarkMode ? "DARK" : "LIGHT"}`);

        // Detect base accent from theme
        const accentColor = this.themeDetector.detectThemeAccentColor();

        if (!accentColor) {
            this.debugLog("No accent color found in theme, using defaults");
            // Use default Nord frost colors
            const defaultAccent = { r: 136, g: 192, b: 208 };
            const accentSystem = this.themeDetector.generateAccentSystem(defaultAccent, isDarkMode);
            this.applyAccentSystemToBlurEffects(accentSystem);
            return;
        }

        // Generate complete accent system (accent, border, tint, shadow) with explicit isDarkMode
        const accentSystem = this.themeDetector.generateAccentSystem(accentColor, isDarkMode);

        if (accentSystem) {
            // Apply to blur effects
            this.applyAccentSystemToBlurEffects(accentSystem);
            this.debugLog("Accent colors detected and applied successfully");
        }
    }

    /**
     * Apply accent system colors to blur effect settings
     * IMPORTANT: This function ONLY sets values in settings (like blur template apply).
     * It does NOT directly style elements - settings callbacks handle that.
     *
     * Mapping:
     * - accent → detected-accent-color (preview/reference field)
     * - border → blur-border-color (actual border color used in styling)
     * - tint → blur-background (actual background tint used in styling)
     * - shadow → accent-shadow-color (reserved for Phase 2.5C+)
     *
     * @param {Object} accentSystem - {accent, border, tint, shadow} in CSS rgba format
     */
    applyAccentSystemToBlurEffects(accentSystem) {
        this.debugLog("Applying accent system to blur effects (settings only)");

        // Update detected-accent-color for preview (no actual effect)
        //this.settings.setValue("detected-accent-color", accentSystem.accent);

        // Apply border color (accent-border-color → blur-border-color)
        this.settings.setValue("blur-border-color", accentSystem.border);

        // Apply tint color (accent-tint-color → blur-background)
        this.settings.setValue("blur-background", accentSystem.tint);

        // Store shadow color for future use
        this.settings.setValue("accent-shadow-color", accentSystem.shadow);

        //this.debugLog(`  → detected-accent-color: ${accentSystem.accent} (preview)`);
        this.debugLog(`  → blur-border-color: ${accentSystem.border}`);
        this.debugLog(`  → blur-background: ${accentSystem.tint}`);
        this.debugLog(`  → accent-shadow-color: ${accentSystem.shadow}`);

        // NOTE: Panel base color decision is handled by applyDetectedThemeData()
        // Do NOT apply shadow color here - parent method decides based on switches
        // NOTE: Do NOT refresh here - parent method (applyDetectedThemeData) handles coordinated refresh
    }
}

// === EXTENSION LIFECYCLE FUNCTIONS ===

/**
 * Extension initialization function - called when extension is loaded
 * @param {Object} metadata - Extension metadata from metadata.json
 */
function init(metadata) {
    try {
        cssPanelsExtension = new CSSPanelsExtension(metadata);
        global.logWarning("[CSSPanels] Extension initialized");
    } catch (error) {
        global.logError("[CSSPanels] Error in init: " + error.message);
    }
}

/**
 * Extension enable function - called when extension becomes active
 */
function enable() {
    try {
        if (cssPanelsExtension) {
            return cssPanelsExtension.enable();
        } else {
            global.logError("[CSSPanels] Cannot enable: extension not initialized");
        }
    } catch (error) {
        global.logError("[CSSPanels] Error in enable: " + error.message);
    }
}

/**
 * Extension disable function - called when extension is deactivated
 */
function disable() {
    try {
        if (cssPanelsExtension) {
            cssPanelsExtension.disable();
            cssPanelsExtension = null;
        }
    } catch (error) {
        global.logError("[CSSPanels] Error in disable: " + error.message);
    }
}
