const St = imports.gi.St;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

// Import refactored modules
const TransparencyManager = require("./transparencyManager");
const PopupStyler = require("./popupStyler");
const NotificationStyler = require("./notificationStyler");
const OSDStyler = require("./osdStyler");
const SystemIndicator = require("./systemIndicator");
const ThemeDetector = require("./themeDetector");
const CSSManager = require("./cssManager");
const BlurTemplateManager = require("./blurTemplateManager");

/**
 * Main extension instance
 * @type {TransparencyControl}
 */
let transparencyExtension = null;

/**
 * Main class that handles panel and menu transparency/blur effects
 * This extension provides:
 * - Panel transparency control
 * - Menu transparency control
 * - Notification transparency control (new)
 * - OSD transparency control (new)
 * - Border radius customization
 * - Blur effects with customizable intensity
 * - System tray indicator for quick access
 * - Theme color auto-detection
 * - CSS-based implementation for better performance
 */
class TransparencyControl {
    /**
     * Constructor initializes all extension settings and default values
     * @param {Object} metadata - Extension metadata from metadata.json
     */
    constructor(metadata) {
        this.metadata = metadata;
        this._ = this.setupLocalization(metadata);
        this.setupSettings();
        this.initializeComponents();

        // ADD: Initialize panel monitoring variables
        this._panelCheckTimeout = null;
        this.panelsEnabledConnection = null;

        this.debugLog("TransparencyControl initialized successfully");
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

        // Blur effect settings
        this.bindBlurSettings();

        // System settings
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "show-indicator",
            "showIndicator",
            this.onIndicatorVisibilityChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "hide-tray-icon",
            "hideTrayIcon",
            this.onHideTrayIconChanged.bind(this)
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "debug-logging",
            "debugLogging",
            this.onDebugLoggingChanged.bind(this)
        );
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
            "blur-border-width",
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
        if (this.panelOpacity === undefined) this.panelOpacity = 0.4;
        if (this.menuOpacity === undefined) this.menuOpacity = 0.5;
        if (this.borderRadius === undefined) this.borderRadius = 15;
        if (this.autoDetectRadius === undefined) this.autoDetectRadius = true;
        if (this.applyPanelRadius === undefined) this.applyPanelRadius = true;

        // Color override defaults
        if (this.overridePanelColor === undefined) this.overridePanelColor = false;
        if (this.chooseOverridePanelColor === undefined) this.chooseOverridePanelColor = "rgba(46, 52, 64, 0.8)";
        if (this.overridePopupColor === undefined) this.overridePopupColor = false;
        if (this.chooseOverridePopupColor === undefined) this.chooseOverridePopupColor = "rgba(255, 255, 255, 0.9)";

        // NEW: Notification and OSD defaults
        if (this.enableNotificationStyling === undefined) this.enableNotificationStyling = false;
        if (this.enableOSDStyling === undefined) this.enableOSDStyling = false;

        // System defaults
        if (this.showIndicator === undefined) this.showIndicator = true;
        if (this.hideTrayIcon === undefined) this.hideTrayIcon = false;
        if (this.debugLogging === undefined) this.debugLogging = false;

        // Blur defaults
        this.initializeBlurDefaults();
    }

    /**
     * Initialize blur effect default values
     */
    initializeBlurDefaults() {
        if (this.blurRadius === undefined) this.blurRadius = 20;
        if (this.blurSaturate === undefined) this.blurSaturate = 1.0;
        if (this.blurContrast === undefined) this.blurContrast = 0.9;
        if (this.blurBrightness === undefined) this.blurBrightness = 0.9;
        if (this.blurBackground === undefined) this.blurBackground = "rgba(255, 255, 255, 0.3)";
        if (this.blurBorderColor === undefined) this.blurBorderColor = "rgba(255, 255, 255, 0.3)";
        if (this.blurBorderWidth === undefined) this.blurBorderWidth = 1;
        if (this.blurTransition === undefined) this.blurTransition = 0.3;
        if (this.blurOpacity === undefined) this.blurOpacity = 0.8;
        if (this.blurTemplate === undefined) this.blurTemplate = "foggy-glass-dark";
    }

    /**
     * Initialize all component modules
     */
    initializeComponents() {
        this.cssManager = new CSSManager(this);
        this.themeDetector = new ThemeDetector(this);
        this.blurTemplateManager = new BlurTemplateManager(this);
        this.transparencyManager = new TransparencyManager(this);
        this.popupStyler = new PopupStyler(this);
        this.notificationStyler = new NotificationStyler(this);
        this.osdStyler = new OSDStyler(this);
        this.systemIndicator = new SystemIndicator(this);
    }

    /**
     * Debug logging function - only logs when debug logging is enabled
     * @param {string} message - The message to log
     * @param {any} data - Optional data to log
     */
    debugLog(message, data = null) {
        if (this.debugLogging) global.log(`[CSSPanels] ${message}`, data || "");
    }

    /**
     * Schedule refresh for all panels with a short delay
     * Prevents multiple rapid refresh calls
     */
    scheduleRefreshPanels() {
        imports.mainloop.timeout_add(50, () => {
            this.checkForNewPanels();
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
                this.panelsEnabledConnection = global.settings.connect("changed::panels-enabled", () => {
                    this.debugLog("Panels-enabled setting changed - checking for new panels");
                    this.checkForNewPanels();
                });
                this.debugLog("Using global.settings panels-enabled signal for monitoring");
                return; // No need for polling if we have the signal
            }

            // Fallback to longer polling interval (10 seconds)
            this._panelCheckTimeout = imports.mainloop.timeout_add(10000, () => {
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
            let currentPanels = this.transparencyManager.getAllPanels();
            let knownPanels = Object.keys(this.transparencyManager.originalPanelStyles);

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
                imports.mainloop.timeout_add(100, () => {
                    this.transparencyManager.applyPanelStyles();
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

            // Cleanup global.settings connection if it exists
            if (this.panelsEnabledConnection && global.settings) {
                global.settings.disconnect(this.panelsEnabledConnection);
                this.panelsEnabledConnection = null;
            }

            this.debugLog("Panel monitoring cleanup completed");
        } catch (e) {
            this.debugLog("Error cleaning up panel monitoring:", e);
        }
    }
    /**
     * Enable the extension and apply all styling
     */
    enable() {
        this.debugLog("Enabling extension...");
        try {
            this.cssManager.initialize();
            this.themeDetector.setup();
            this.transparencyManager.enable();
            this.popupStyler.enable();

            // Enable notification and OSD styling if enabled
            if (this.enableNotificationStyling) {
                this.notificationStyler.enable();
            }

            if (this.enableOSDStyling) {
                this.osdStyler.enable();
            }

            // Create system indicator if enabled
            if (this.showIndicator && !this.hideTrayIcon) {
                this.systemIndicator.create();
            }

            // Setup panel monitoring
            this.setupPanelMonitoring();

            this.forceSettingsUpdate();
            this.debugLog("Extension enabled successfully");
        } catch (error) {
            this.debugLog("Error during enable:", error);
            global.logError("[CSSPanels] Enable failed: " + error.message);
        }

        // Return callbacks for external access
        return {
            resetBlurToDefaults: () => {
                global.log("[CSSPanels] External resetBlurToDefaults called");
                this._resetBlurToDefaults();
            },
        };
    }

    /**
     * Disable the extension and restore original appearance
     */
    disable() {
        this.debugLog("Disabling extension...");
        try {
            // Cleanup panel monitoring first
            this.cleanupPanelMonitoring();

            this.transparencyManager.disable();
            this.popupStyler.disable();
            this.notificationStyler.disable(); // NEW
            this.osdStyler.disable(); // NEW
            this.systemIndicator.destroy();
            this.themeDetector.cleanup();
            this.cssManager.cleanup();
            this.debugLog("Extension disabled successfully");
        } catch (error) {
            this.debugLog("Error during disable:", error);
            global.logError("[CSSPanels] Disable failed: " + error.message);
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
    refreshAllActiveStyles() {
        this.debugLog("Refreshing all active styled elements");
        // Update CSS variables for all components
        this.cssManager.updateAllVariables();
        this.popupStyler.refreshActiveMenus();
        if (this.enableOSDStyling) {
            this.osdStyler.refreshAllOSDs();
        }
        if (this.enableNotificationStyling) {
            // this.notificationStyler.refreshActiveNotifications();
        }
    }

    // === SETTINGS CALLBACKS ===
    onPanelOpacityChanged() {
        this.debugLog(`Panel opacity changed to: ${this.panelOpacity}`);
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();
    }

    onMenuOpacityChanged() {
        this.debugLog(`Menu opacity changed to: ${this.menuOpacity}`);
        this.cssManager.updateAllVariables();
        // Refresh OSD elements with new border radius
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onBorderRadiusChanged() {
        this.debugLog(`Border radius changed to: ${this.borderRadius}px`);
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();

        // Refresh OSD elements with new border radius
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onAutoDetectRadiusChanged() {
        this.debugLog(`Auto-detect radius changed to: ${this.autoDetectRadius}`);
        this.themeDetector.invalidateCache();
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();

        // Refresh OSD elements when auto-detect changes
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onPanelRadiusChanged() {
        this.debugLog(`Apply panel radius changed to: ${this.applyPanelRadius}`);
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();

        // Refresh OSD elements when panel radius setting changes
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onOverridePanelColorChanged() {
        this.debugLog(`Override panel color changed to: ${this.overridePanelColor}`);
        this.themeDetector.invalidateCache();
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();
        this.popupStyler.refreshActiveMenus();

        // Refresh OSD elements with new panel color
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onChooseOverridePanelColorChanged() {
        this.debugLog(`Choose override panel color changed to: ${this.chooseOverridePanelColor}`);
        this.themeDetector.invalidateCache();
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();
        this.popupStyler.refreshActiveMenus();

        // Refresh OSD elements with new panel color value
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onOverridePopupColorChanged() {
        this.debugLog(`Override popup color changed to: ${this.overridePopupColor}`);
        this.themeDetector.invalidateCache();
        this.refreshAllActiveStyles();
        // Ensure OSD gets popup color overrides
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onChooseOverridePopupColorChanged() {
        this.debugLog(`Choose override popup color changed to: ${this.chooseOverridePopupColor}`);
        this.themeDetector.invalidateCache();
        this.refreshAllActiveStyles();
        // Ensure OSD gets new popup color value
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    // Notification styling callbacks
    onNotificationStylingChanged() {
        this.debugLog(`Notification styling changed to: ${this.enableNotificationStyling}`);
        if (this.enableNotificationStyling) {
            this.notificationStyler.enable();
        } else {
            this.notificationStyler.disable();
        }
    }

    // OSD styling callbacks
    onOSDStylingChanged() {
        this.debugLog(`OSD styling changed to: ${this.enableOSDStyling}`);
        if (this.enableOSDStyling) {
            this.osdStyler.enable();
        } else {
            // Force immediate cleanup of all styled OSDs before disabling
            this.osdStyler.restoreAllOSDs();
            this.osdStyler.disable();
            // Additional cleanup with timeout to ensure complete restoration
            imports.mainloop.timeout_add(100, () => {
                this.osdStyler.restoreAllOSDs();
                return false;
            });
        }
    }

    onBlurSettingsChanged() {
        this.debugLog("Blur settings changed");
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();
        this.refreshAllActiveStyles();
    }

    onBlurOpacityChanged() {
        this.debugLog(`Blur opacity changed to: ${this.blurOpacity}`);
        this.transparencyManager.applyPanelStyles();
        this.scheduleRefreshPanels();
    }

    onBlurTemplateChanged() {
        this.debugLog(`Blur template changed to: ${this.blurTemplate}`);
        // Template is used in reset function
        // Refresh OSD styles when template changes
        if (this.enableOSDStyling && this.osdStyler) {
            this.osdStyler.refreshAllOSDs();
        }
    }

    onIndicatorVisibilityChanged() {
        this.debugLog(`Show indicator changed to: ${this.showIndicator}`);
        if (this.showIndicator && !this.hideTrayIcon) {
            this.systemIndicator.create();
        } else {
            this.systemIndicator.destroy();
        }
    }

    onHideTrayIconChanged() {
        this.debugLog(`Hide tray icon changed to: ${this.hideTrayIcon}`);
        if (this.hideTrayIcon) {
            this.systemIndicator.destroy();
        } else if (this.showIndicator) {
            this.systemIndicator.create();
        }
    }

    onDebugLoggingChanged() {
        this.debugLog(`Debug logging changed to: ${this.debugLogging}`);
        // debugLog checks this value automatically
    }
}

// === EXTENSION LIFECYCLE FUNCTIONS ===

/**
 * Extension initialization function - called when extension is loaded
 * @param {Object} metadata - Extension metadata from metadata.json
 */
function init(metadata) {
    try {
        transparencyExtension = new TransparencyControl(metadata);
        global.log("[CSSPanels] Extension initialized");
    } catch (error) {
        global.logError("[CSSPanels] Failed to initialize: " + error.message);
    }
}

/**
 * Extension enable function - called when extension becomes active
 */
function enable() {
    try {
        if (transparencyExtension) {
            return transparencyExtension.enable();
        } else {
            global.logError("[CSSPanels] Cannot enable: extension not initialized");
        }
    } catch (error) {
        global.logError("[CSSPanels] Failed to enable: " + error.message);
    }
}

/**
 * Extension disable function - called when extension is deactivated
 */
function disable() {
    try {
        if (transparencyExtension) {
            transparencyExtension.disable();
            transparencyExtension = null;
        }
    } catch (error) {
        global.logError("[CSSPanels] Failed to disable: " + error.message);
    }
}
