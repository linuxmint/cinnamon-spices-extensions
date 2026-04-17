const St = imports.gi.St;
const Main = imports.ui.main;
const Util = imports.misc.util;
const Tooltips = imports.ui.tooltips;
const { SYSTEM_INDICATOR, STYLING, SIZE } = require("./constants");

/**
 * System Indicator handles the system tray indicator
 * Provides quick access to extension settings
 */
class SystemIndicator {
    /**
     * Initialize System Indicator
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        this.extension = extension;
        this.indicator = null;
        this.tooltip = null;
    }

    /**
     * Create the system tray indicator
     */
    create() {
        if (this.indicator) return;

        try {
            this.extension.debugLog("Creating system tray indicator...");

            // Create a button container for the indicator
            this.indicator = new St.Button({
                style_class: "panel-button",
                reactive: true,
                track_hover: true,
                can_focus: true,
                style: SYSTEM_INDICATOR.PADDING_STYLE,
            });

            // Create icon for the button
            let icon = new St.Icon({
                icon_name: SYSTEM_INDICATOR.ICON_NAME,
                icon_size: SIZE.SYSTEM_INDICATOR_ICON_SIZE,
                style_class: "system-status-icon",
            });

            // Add icon to the button
            this.indicator.set_child(icon);

            // Add click handler to open extension settings
            this.indicator.connect("button-press-event", (actor, event) => {
                const button = event.get_button();
                if (button === 1) {
                    // Left click - open extensions manager
                    this.extension.debugLog("Indicator clicked - opening Extensions Manager");
                    Util.spawnCommandLine("cinnamon-settings extensions");
                }
            });

            // Add hover effects
            this.indicator.connect("enter-event", () => {
                icon.opacity = STYLING.ICON_OPACITY_HOVER; // Full opacity on hover
            });

            this.indicator.connect("leave-event", () => {
                icon.opacity = STYLING.ICON_OPACITY_NORMAL; // Slightly transparent normally
            });

            // Add to system tray using Cinnamon panel API
            if (Main.panel && Main.panel._rightBox) {
                Main.panel._rightBox.insert_child_at_index(this.indicator, 0);
                this.extension.debugLog("Indicator added to panel using _rightBox");

                // Create tooltip with custom positioning for top panel
                this.tooltip = new Tooltips.Tooltip(this.indicator, this.extension.metadata.name || "CSS Panels");
                this.extension.debugLog("SystemIndicator: Tooltip created, type:", typeof this.tooltip);

                // Force tooltip to position above the panel
                if (this.tooltip && this.tooltip._tooltip) {
                // Store original show method on instance for explicit restore in destroy()
                this._originalTooltipShow = this.tooltip.show.bind(this.tooltip);
                this.tooltip.show = () => {
                    this._originalTooltipShow();
                        // Position tooltip above the indicator
                        let [x, y] = this.indicator.get_transformed_position();
                        let [width, height] = this.indicator.get_size();
                        this.tooltip._tooltip.set_position(
                            x + width / 2 - this.tooltip._tooltip.get_width() / 2,
                            y - this.tooltip._tooltip.get_height() - SYSTEM_INDICATOR.TOOLTIP_OFFSET
                        );
                    };
                }

                this.extension.debugLog("Tooltip created successfully");
            } else {
                throw new Error("No suitable method found for adding indicator");
            }

            this.extension.debugLog("System tray indicator created successfully");
        } catch (e) {
            this.extension.debugLog("Error creating indicator:", e.message);
            global.logError("[CSSPanels] Error in createIndicator: " + e.message);
            this.indicator = null;
        }
    }

    /**
     * Destroy the system tray indicator
     */
    destroy() {
        try {
            if (!this.indicator) {
                this.extension.debugLog("destroyIndicator: No indicator to destroy");
                return;
            }

            // Clean up tooltip
            if (this.tooltip) {
                try {
                    if (this._originalTooltipShow) {
                        this.tooltip.show = this._originalTooltipShow;
                        this._originalTooltipShow = null;
                    }
                    this.tooltip.destroy();
                    this.tooltip = null;
                    this.extension.debugLog("Tooltip destroyed successfully");
                } catch (tooltipError) {
                    this.extension.debugLog("Error destroying tooltip:", tooltipError.message);
                }
            }

            // Remove from panel
            if (Main.panel && Main.panel._rightBox) {
                try {
                    Main.panel._rightBox.remove_child(this.indicator);
                    this.extension.debugLog("Indicator removed from panel successfully");
                } catch (removeError) {
                    this.extension.debugLog("Error removing indicator from panel:", removeError.message);
                }
            }

            // Clean up the indicator
            this.indicator = null;
            this.extension.debugLog("System tray indicator destroyed successfully");
        } catch (e) {
            this.extension.debugLog("Error destroying indicator:", e.message || e.toString());
            global.logError("[CSSPanels] Error in destroyIndicator: " + e.message);
            this.indicator = null;
        }
    }
}

module.exports = SystemIndicator;
