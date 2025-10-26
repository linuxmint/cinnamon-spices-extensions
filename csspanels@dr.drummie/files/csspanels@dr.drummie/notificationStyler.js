const St = imports.gi.St;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const StylerBase = require("./stylerBase");

/**
 * Notification Styler handles popup notification transparency and blur effects
 * Intercepts notifications that appear as floating banners on screen
 */
class NotificationStyler extends StylerBase {
    constructor(extension) {
        super(extension, "NotificationStyler");
        this.originalNotificationStyles = new Map();
        this.activeNotifications = new Set();

        // Monkey patch targets for popup notifications
        this.originalShowNotification = null;
        this.originalHideNotification = null;
        this.originalUpdateShowingNotification = null;

        // Connection handlers
        this.connections = [];

        // Debug tracking
        this.debugMode = true;
        this.notificationTracker = new Map();
    }

    /**
     * Enable notification styling by monkey patching MessageTray
     */
    enable() {
        super.enable();
        if (!this.extension.enableNotificationStyling) {
            this.debugLog("Notification styling disabled in settings");
            return;
        }

        try {
            this.applyMessageTrayPatches();
            this.monitorExistingNotifications();
            this.debugLog("Notification styler enabled - targeting popup notifications");
        } catch (e) {
            this.debugLog("Error enabling notification styler:", e);
            this.setupFallbackMonitoring();
        }
    }

    /**
     * Apply monkey patches to MessageTray for intercepting popup notifications
     */
    applyMessageTrayPatches() {
        // Patch the main notification display method
        if (Main.messageTray && Main.messageTray._showNotification) {
            this.originalShowNotification = Main.messageTray._showNotification;
            Main.messageTray._showNotification = this._patchedShowNotification.bind(this);
            this.debugLog("Patched MessageTray._showNotification");
        }

        // Patch notification banner creation if available
        if (MessageTray.NotificationBanner && MessageTray.NotificationBanner.prototype._init) {
            this.originalBannerInit = MessageTray.NotificationBanner.prototype._init;
            MessageTray.NotificationBanner.prototype._init = this._patchedBannerInit.bind(this);
            this.debugLog("Patched NotificationBanner._init");
        }

        // Alternative: Patch notification display in different Cinnamon versions
        if (Main.messageTray && Main.messageTray.showNotification) {
            this.originalShowNotificationAlt = Main.messageTray.showNotification;
            Main.messageTray.showNotification = this._patchedShowNotificationAlt.bind(this);
            this.debugLog("Patched MessageTray.showNotification (alternative)");
        }
    }

    /**
     * Handle notification received signal (primary method)
     * @param {Object} messageTray - Message tray instance
     * @param {Object} notification - Notification object
     */
    _patchedShowNotification() {
        // Call original method first
        const result = this.originalShowNotification.apply(Main.messageTray, arguments);

        // Style the notification that was just shown
        this.styleCurrentNotification();

        return result;
    }

    /**
     * Patched NotificationBanner._init - intercepts banner creation
     */
    _patchedBannerInit(notification) {
        // Call original constructor
        const result = this.originalBannerInit.apply(this, arguments);

        // Style this banner
        this.styleNotificationBanner(this);

        return result;
    }

    /**
     * Alternative patched showNotification for different Cinnamon versions
     */
    _patchedShowNotificationAlt(notification) {
        const result = this.originalShowNotificationAlt.apply(Main.messageTray, arguments);

        // Style with slight delay to ensure DOM is ready
        imports.mainloop.timeout_add(50, () => {
            this.styleCurrentNotification();
            return false;
        });

        return result;
    }

    /**
     * Style the currently displayed notification
     */
    styleCurrentNotification() {
        try {
            // Check for notification banner (most common case)
            if (Main.messageTray._banner && Main.messageTray._banner.actor) {
                this.styleNotificationElement(Main.messageTray._banner.actor, "notification-banner");
            }

            // Check for notification container
            if (Main.messageTray._notificationContainer) {
                this.styleNotificationElement(Main.messageTray._notificationContainer, "notification-container");
            }

            // Check for notification widget
            if (Main.messageTray._notificationWidget) {
                this.styleNotificationElement(Main.messageTray._notificationWidget, "notification-widget");
            }

            // Fallback: search for notification elements by class
            this.findAndStylePopupNotifications();
        } catch (e) {
            this.debugLog("Error styling current notification:", e);
        }
    }

    /**
     * Style a notification banner specifically
     * @param {Object} banner - NotificationBanner instance
     */
    styleNotificationBanner(banner) {
        if (!banner || !banner.actor) return;

        this.debugLog("Styling notification banner");
        this.styleNotificationElement(banner.actor, "banner");

        // Also style any child containers
        if (banner.bodyLabel && banner.bodyLabel.get_parent()) {
            this.styleNotificationElement(banner.bodyLabel.get_parent(), "banner-body");
        }

        if (banner.titleLabel && banner.titleLabel.get_parent()) {
            this.styleNotificationElement(banner.titleLabel.get_parent(), "banner-title");
        }
    }

    /**
     * Find popup notifications by searching for CSS classes instead of position
     */
    findAndStylePopupNotifications() {
        this.debugLog("Searching for popup notifications by CSS");

        let totalFound = 0;

        // Search only global.stage with CSS filtering - works for all positions
        if (global.stage) {
            this.debugLog("Searching for notification CSS classes...");
            totalFound = this.searchForNotificationsByClass(global.stage, 0);
        }

        this.debugLog(`CSS-based search found ${totalFound} notifications`);
    }

    /**
     * Search for notifications by CSS class names - position agnostic
     * @param {Clutter.Actor} actor - Actor to search
     * @param {number} depth - Current search depth
     */
    searchForNotificationsByClass(actor, depth = 0) {
        if (!actor || depth > 6) return 0; // Limited but sufficient depth

        let foundCount = 0;

        try {
            const styleClass = (actor.get_style_class_name && actor.get_style_class_name()) || "";
            const name = (actor.get_name && actor.get_name()) || "";

            // Look for notification-specific CSS classes
            const notificationClasses = [
                "notification",
                "banner",
                "multi-line-notification",
                "notification-banner",
                "popup-message",
            ];

            const hasNotificationClass = notificationClasses.some(
                (cls) => styleClass.includes(cls) || name.includes(cls)
            );

            if (hasNotificationClass && this.isValidNotificationSize(actor)) {
                foundCount++;
                this.styleNotificationElement(actor, "css-found-notification");
                this.debugLog(`Found notification by CSS: ${styleClass}`);
                return foundCount; // Don't search children
            }

            // Search children
            if (actor.get_children) {
                actor.get_children().forEach((child) => {
                    foundCount += this.searchForNotificationsByClass(child, depth + 1);
                });
            }
        } catch (e) {
            // Silent fail
        }

        return foundCount;
    }

    /**
     * Check if element has valid notification dimensions
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if valid size
     */
    isValidNotificationSize(actor) {
        if (!actor) return false;

        try {
            const width = actor.get_width ? actor.get_width() : 0;
            const height = actor.get_height ? actor.get_height() : 0;

            // Reasonable notification dimensions - not too small/large
            return width > 50 && height > 30 && width < 800 && height < 400;
        } catch (e) {
            return false;
        }
    }

    /**
     * Recursively search for notification actors
     * @param {Clutter.Actor} actor - Actor to search
     * @param {number} depth - Current search depth
     */
    searchForNotificationActors(actor, depth = 0) {
        if (!actor || depth > 8) return; // Limit search depth

        try {
            // Check if this looks like a notification
            if (this.isPopupNotification(actor)) {
                this.styleNotificationElement(actor, "found-popup-notification");
                return; // Don't search children of notifications
            }

            // Search children
            if (actor.get_children) {
                actor.get_children().forEach((child) => {
                    this.searchForNotificationActors(child, depth + 1);
                });
            }
        } catch (e) {
            // Silent fail for individual actors
        }
    }

    /**
     * Check if an actor is a popup notification
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if this appears to be a popup notification
     */
    isPopupNotification(actor) {
        if (!actor) return false;

        // Skip wrapper elements - we want to style their content instead
        if (this.isNotificationWrapper(actor)) {
            return false;
        }

        // Prefer content elements that have wrapper parents
        if (this.hasNotificationWrapperParent(actor)) {
            return true;
        }

        // Skip system tray and notification applet elements
        if (this.isSystemElement(actor)) {
            return false;
        }

        try {
            const styleClass = (actor.get_style_class_name && actor.get_style_class_name()) || "";
            const name = (actor.get_name && actor.get_name()) || "";

            // Skip notification applet elements (in panel)
            if (
                styleClass.includes("notification-applet") ||
                styleClass.includes("applet-box") ||
                name.includes("applet")
            ) {
                return false;
            }

            // Check for notification-specific classes and names
            const notificationIndicators = [
                "notification",
                "message-tray",
                "banner",
                "popup-message",
                "osd-notification",
            ];

            const hasNotificationClass = notificationIndicators.some(
                (indicator) => styleClass.includes(indicator) || name.includes(indicator)
            );

            if (hasNotificationClass) return true;

            // Check position and size characteristics of popup notifications
            if (actor.get_width && actor.get_height && actor.get_x && actor.get_y) {
                const width = actor.get_width();
                const height = actor.get_height();
                const x = actor.get_x();
                const y = actor.get_y();

                // Typical notification dimensions and positioning
                const isNotificationSize = width > 150 && width < 700 && height > 50 && height < 400;

                // Only consider elements positioned as floating notifications
                // Must be positioned away from panel (not at 0,0) and in notification area
                const isFloatingPosition = x > 0 && y > 0;
                const isTopRight = x > global.screen_width - 700 && y > 5 && y < 300;
                const isTopCenter = x > global.screen_width / 4 && x < (3 * global.screen_width) / 4 && y < 200;

                return isNotificationSize && (isTopRight || isTopCenter);
            }

            return false;
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if actor is a system element that should not be styled
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if this is a system element
     */
    isSystemElement(actor) {
        if (!actor) return false;

        try {
            // Check if element is child of panel
            let parent = actor.get_parent();
            while (parent) {
                const parentClass = (parent.get_style_class_name && parent.get_style_class_name()) || "";
                if (
                    parentClass.includes("panel") ||
                    parentClass.includes("panelRight") ||
                    parentClass.includes("panelLeft")
                ) {
                    return true;
                }
                parent = parent.get_parent();
            }
        } catch (e) {
            // Silent fail
        }
        return false;
    }

    /**
     * Check if actor is a notification wrapper element
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if this is a notification wrapper
     */
    isNotificationWrapper(actor) {
        if (!actor) return false;

        try {
            const styleClass = (actor.get_style_class_name && actor.get_style_class_name()) || "";

            // Look for wrapper classes that control notification layout
            const wrapperIndicators = ["notification-applet-padding", "notification-container", "notification-wrapper"];

            return wrapperIndicators.some((indicator) => styleClass.includes(indicator));
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if wrapper element has visible notification content
     * @param {Clutter.Actor} actor - Wrapper actor to check
     * @returns {boolean} True if wrapper contains notification content
     */
    hasVisibleNotificationContent(actor) {
        if (!actor || !actor.get_children) return false;

        try {
            const children = actor.get_children();
            return children.some((child) => {
                const styleClass = (child.get_style_class_name && child.get_style_class_name()) || "";
                return styleClass.includes("notification") || styleClass.includes("multi-line");
            });
        } catch (e) {
            return false;
        }
    }

    /**
     * Check if actor has a notification wrapper as parent
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if parent is a notification wrapper
     */
    hasNotificationWrapperParent(actor) {
        if (!actor) return false;

        const parent = actor.get_parent ? actor.get_parent() : null;
        return parent && this.isNotificationWrapper(parent);
    }

    /**
     * Apply styling to a notification element
     * @param {Clutter.Actor} element - Notification element to style
     * @param {string} type - Type for logging
     */
    styleNotificationElement(element, type) {
        if (!element || this.originalNotificationStyles.has(element)) {
            return; // Already styled or invalid
        }

        try {
            this.debugLog(`Styling popup notification: ${type}`);

            // Save original styling
            const originalData = {
                style: element.get_style() || "",
                styleClasses: element.get_style_class_name() || "",
                opacity: element.get_opacity(),
            };

            this.originalNotificationStyles.set(element, originalData);
            this.activeNotifications.add(element);

            // Get template and colors
            const template = this.extension.blurTemplateManager.getTemplate(
                this.extension.settings.getValue("blur-template")
            );

            if (!template) {
                this.debugLog("No blur template available");
                return;
            }

            // Apply CSS classes for fallback support
            element.add_style_class_name("transparency-notification-blur");
            element.add_style_class_name("profile-custom");

            if (!this.extension.cssManager.hasBackdropFilter) {
                element.add_style_class_name("transparency-fallback-blur");
            }

            // Apply enhanced notification styling using base class method
            const panelColor = this.extension.themeDetector.getPanelBaseColor();
            const notificationColor = this.getNotificationColor(panelColor);

            // Apply common blur styling with notification-specific additional styles
            const additionalStyles = `
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.1) !important;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                overflow: hidden !important;
            `;

            this.applyCommonBlurStyling(
                element,
                notificationColor,
                this.extension.menuOpacity,
                this.getAdjustedBlurRadius("notification"),
                this.getAdjustedBorderRadius("notification"),
                this.extension.blurBorderColor || "rgba(255,255,255,0.1)",
                this.extension.blurBorderWidth || 1,
                "notification",
                additionalStyles
            );

            this.trackNotificationDimensions(element, type, "after-styling");

            // Monitor for notification removal
            this.monitorNotificationRemoval(element);

            this.debugLog(`Successfully styled popup notification: ${type}`);
        } catch (e) {
            this.debugLog(`Error styling notification ${type}: ${e.message || e}`);
            if (e.stack) {
                this.debugLog(e.stack);
            }
        }
    }

    /**
     * Track notification dimensions and properties for debugging
     * @param {Clutter.Actor} element - Element to track
     * @param {string} type - Type identifier
     * @param {string} phase - Tracking phase
     */
    trackNotificationDimensions(element, type, phase) {
        if (!this.debugMode || !element) return;

        try {
            const elementId = element.toString();
            const timestamp = Date.now();

            // Simplified logging - only track start of tracking phase
            this.debugLog(`Tracking notification: ${type} (${phase})`);

            // Keep minimal tracking data for lifecycle logging
            const trackingData = {
                elementId,
                type,
                phase,
                timestamp,
            };

            if (!this.notificationTracker.has(elementId)) {
                this.notificationTracker.set(elementId, []);
            }
            this.notificationTracker.get(elementId).push(trackingData);
        } catch (e) {
            this.debugLog(`Error tracking notification dimensions: ${e}`);
        }
    }

    /**
     * Monitor when a notification is removed to clean up
     * @param {Clutter.Actor} element - Element to monitor
     */
    monitorNotificationRemoval(element) {
        if (!element.connect) return;

        const destroyConnection = element.connect("destroy", () => {
            this.originalNotificationStyles.delete(element);
            this.activeNotifications.delete(element);
            this.debugLog("Cleaned up destroyed notification");
            this.logNotificationLifecycle(element);
        });

        // Also monitor parent removal
        const parent = element.get_parent();
        if (parent && parent.connect) {
            const parentDestroyConnection = parent.connect("destroy", () => {
                this.originalNotificationStyles.delete(element);
                this.activeNotifications.delete(element);
            });
        }
    }

    /**
     * Log complete lifecycle of a notification for analysis
     * @param {Clutter.Actor} element - Element that was destroyed
     */
    logNotificationLifecycle(element) {
        if (!this.debugMode) return;

        const elementId = element.toString();
        const lifecycleData = this.notificationTracker.get(elementId);

        if (lifecycleData && lifecycleData.length > 0) {
            this.debugLog(`Notification lifecycle complete: ${lifecycleData.length} phases tracked`);

            this.notificationTracker.delete(elementId);
        }
    }

    /**
     * Get notification color based on settings
     * @param {Object} panelColor - Base panel color
     * @returns {Object} RGB color object
     */
    getNotificationColor(panelColor) {
        if (this.extension.overridePopupColor) {
            return this.extension.themeDetector.parseColorString(this.extension.chooseOverridePopupColor);
        } else if (this.extension.overridePanelColor) {
            return this.extension.themeDetector.parseColorString(this.extension.chooseOverridePanelColor);
        } else {
            // Slightly brighter than panel for better visibility
            return {
                r: Math.min(panelColor.r + 25, 255),
                g: Math.min(panelColor.g + 25, 255),
                b: Math.min(panelColor.b + 25, 255),
            };
        }
    }

    /**
     * Setup fallback monitoring using stage events
     */
    setupFallbackMonitoring() {
        this.debugLog("Setting up fallback notification monitoring");

        if (global.stage) {
            const stageConnection = global.stage.connect("actor-added", (stage, actor) => {
                if (this.isPopupNotification(actor)) {
                    this.debugLog("Detected notification via stage monitoring");
                    // Delay styling to allow full initialization
                    imports.mainloop.timeout_add(100, () => {
                        this.styleNotificationElement(actor, "stage-detected");
                        return false;
                    });
                }
            });

            this.connections.push({ object: global.stage, id: stageConnection });
        }
    }

    /**
     * Monitor existing notifications that might already be displayed
     */
    monitorExistingNotifications() {
        // Style any currently visible notifications
        imports.mainloop.timeout_add(100, () => {
            this.findAndStylePopupNotifications();
            return false;
        });
    }

    /**
     * Disable notification styling and restore originals
     */
    disable() {
        this.debugMode = false; // Disable debug logging immediately
        this.debugLog("NotificationStyler: Starting disable cleanup");

        try {
            this.restoreAllNotifications();
            this.restoreMonkeyPatches();
            this.cleanupConnections();
            this.notificationTracker.clear(); // Clear tracking data
            this.debugLog("NotificationStyler: Disable cleanup completed");
        } catch (error) {
            this.debugLog("NotificationStyler: Error during disable:", error);
        }
        super.disable();
    }

    /**
     * Restore all monkey patches
     */
    restoreMonkeyPatches() {
        if (this.originalShowNotification && Main.messageTray) {
            Main.messageTray._showNotification = this.originalShowNotification;
            this.originalShowNotification = null;
        }

        if (this.originalBannerInit && MessageTray.NotificationBanner) {
            MessageTray.NotificationBanner.prototype._init = this.originalBannerInit;
            this.originalBannerInit = null;
        }

        if (this.originalShowNotificationAlt && Main.messageTray) {
            Main.messageTray.showNotification = this.originalShowNotificationAlt;
            this.originalShowNotificationAlt = null;
        }
    }

    /**
     * Restore all styled notifications
     */
    restoreAllNotifications() {
        this.originalNotificationStyles.forEach((originalData, element) => {
            try {
                this.restoreNotificationElement(element, originalData);
            } catch (e) {
                this.debugLog("Error restoring notification:", e);
            }
        });

        this.originalNotificationStyles.clear();
        this.activeNotifications.clear();
    }

    /**
     * Restore a single notification element
     * @param {Clutter.Actor} element - Element to restore
     * @param {Object} originalData - Original styling data
     */
    restoreNotificationElement(element, originalData) {
        if (!element) return;

        element.set_style(originalData.style);
        element.set_style_class_name(originalData.styleClasses);
        element.set_opacity(originalData.opacity);

        // Remove our custom classes
        const classesToRemove = ["transparency-notification-blur", "transparency-fallback-blur", "profile-custom"];

        classesToRemove.forEach((cls) => {
            element.remove_style_class_name(cls);
        });
    }

    /**
     * Cleanup all connections
     */
    cleanupConnections() {
        this.connections.forEach((conn) => {
            if (conn.object && conn.id) {
                this.debugLog("NotificationStyler: Disconnecting connection");
                conn.object.disconnect(conn.id);
            }
        });
        this.connections = [];
    }
}

module.exports = NotificationStyler;
