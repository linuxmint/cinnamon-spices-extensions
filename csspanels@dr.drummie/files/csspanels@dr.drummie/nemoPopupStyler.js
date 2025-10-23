const St = imports.gi.St;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const StylerBase = require("./stylerBase");

/**
 * Nemo Popup Styler handles popup menu transparency and blur effects for Nemo desktop
 * Integrates with existing popup styler for desktop context menus
 */
class NemoPopupStyler extends StylerBase {
    /**
     * Initialize Nemo Popup Styler
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        super(extension, "NemoPopupStyler");
        this.stageConnection = null;
        this.isEnabled = false;
    }

    /**
     * Enable Nemo popup styling
     */
    enable() {
        super.enable();
        if (!this.extension.enableDesktopContextStyling || this.isEnabled) return;

        try {
            this.debugLog("Enabling Nemo popup styling...");

            // Setup desktop right-click detection
            this.setupDesktopRightClickDetection();

            this.isEnabled = true;
            this.debugLog("Nemo popup styling enabled");
        } catch (e) {
            this.debugLog("Failed to enable Nemo popup styling:", e);
        }
    }

    /**
     * Disable Nemo popup styling
     */
    disable() {
        if (!this.isEnabled) {
            this.debugLog("NemoPopupStyler: Already disabled");
            return;
        }

        try {
            this.cleanupDesktopRightClickDetection();
            this.isEnabled = false; // Set flag early
            this.debugLog("NemoPopupStyler: Disable cleanup completed");
        } catch (e) {
            this.debugLog("Error disabling Nemo popup styling:", e);
        }
        super.disable();
    }

    /**
     * Refresh Nemo popup styles on settings change
     */
    refresh() {
        super.refresh();
        if (this.isEnabled) {
            // Re-setup detection if needed
            this.cleanupDesktopRightClickDetection();
            this.setupDesktopRightClickDetection();
            this.debugLog("Nemo popup styling refreshed");
        }
    }

    /**
     * Setup desktop right-click detection
     */
    setupDesktopRightClickDetection() {
        if (this.stageConnection) return;

        this.stageConnection = global.stage.connect("button-press-event", (actor, event) => {
            // Check if it's a right-click (button 3)
            if (event.get_button() === 3) {
                this.handleDesktopRightClick(actor, event);
            }
        });

        this.debugLog("Desktop right-click detection setup");
    }

    /**
     * Cleanup desktop right-click detection
     */
    cleanupDesktopRightClickDetection() {
        if (this.stageConnection) {
            global.stage.disconnect(this.stageConnection);
            this.stageConnection = null;
            this.debugLog("Desktop right-click detection cleaned up");
        }
    }

    /**
     * Handle desktop right-click event
     * @param {Clutter.Actor} actor - The actor that received the event
     * @param {Clutter.Event} event - The button press event
     */
    handleDesktopRightClick(actor, event) {
        // Check if the click is on desktop area
        if (this.isDesktopArea(actor)) {
            this.debugLog("Desktop right-click detected - popup menu should be styled by popupStyler");

            // The popupStyler monkey patch should handle the styling automatically
            // No additional action needed here as popupStyler intercepts all popup menus
        }
    }

    /**
     * Check if the actor is in desktop area
     * @param {Clutter.Actor} actor - The actor to check
     * @returns {boolean} True if actor is in desktop area
     */
    isDesktopArea(actor) {
        if (!actor) return false;

        // Check if actor is the desktop window or its children
        let current = actor;
        let depth = 0;
        const MAX_DEPTH = 5;

        while (current && depth < MAX_DEPTH) {
            this.extension.cssManager.logActorDetails(current, depth);

            if (current === global.stage) {
                this.debugLog("Current actor is global.stage:", current);
                // Click on stage - likely desktop
                return true;
            }

            // Check for desktop-related style classes
            if (current.get_style_class_name) {
                let styleClasses = current.get_style_class_name();
                this.debugLog("Checking style classes for current actor:", current, "classes:", styleClasses);
                if (
                    styleClasses &&
                    (styleClasses.includes("desktop") ||
                        styleClasses.includes("nemo-desktop") ||
                        styleClasses.includes("nautilus-desktop") ||
                        styleClasses.includes("caja-desktop"))
                ) {
                    return true;
                }
            }

            current = current.get_parent();
            depth++;
        }

        return false;
    }
}

module.exports = NemoPopupStyler;
