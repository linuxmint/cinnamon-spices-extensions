const St = imports.gi.St;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
const StylerBase = require("./stylerBase");
const { TIMING, TRAVERSAL, CSS_CLASSES, SIGNALS } = require("./constants");

/**
 * Tooltip Styler handles tooltip transparency and blur effects
 * Uses CSS-based monitoring to intercept tooltip creation and display
 */
class TooltipStyler extends StylerBase {
    /**
     * Initialize Tooltip Styler
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        super(extension, "TooltipStyler");
        this.activeTooltips = new Map();
        this.originalTooltipShow = null;
        this.originalPanelItemTooltipShow = null;
    }

    /**
     * Enable tooltip styling
     */
    enable() {
        super.enable();
        this.setupTooltipMonkeyPatch(); // Add monkey patch for PanelItemTooltip
        this.setupGeneralTooltipMonkeyPatch(); // Add monkey patch for general Tooltip
        this.setupTooltipMonitoring(); // Add monitoring for existing and future tooltips
        this.debugLog("Tooltip styler enabled");
    }

    /**
     * Disable tooltip styling
     */
    disable() {
        this.debugLog("TooltipStyler: Starting disable cleanup");
        this.restoreTooltipMonkeyPatch(); // Restore PanelItemTooltip monkey patch
        this.restoreGeneralTooltipMonkeyPatch(); // Restore general Tooltip monkey patch

        // Hide all active tooltips before cleanup to ensure proper reset
        this.activeTooltips.forEach((originalData, tooltip) => {
            try {
                if (tooltip && tooltip.hide) {
                    tooltip.hide();
                }
            } catch (e) {
                this.debugLog("Error hiding tooltip during disable:", e);
            }
        });

        this.cleanupActiveTooltips();

        this.debugLog("TooltipStyler: Disable cleanup completed");
        super.disable(); // Automatic signal cleanup via GlobalSignalsHandler
    }

    /**
     * Setup monkey patching for general Tooltip handling
     */
    setupGeneralTooltipMonkeyPatch() {
        try {
            // Store reference to original method
            this.originalTooltipShow = Tooltips.Tooltip.prototype.show;
            let self = this;

            // Store patched function reference to enable idempotent restore
            this._patchedTooltipShow = function () {
                // Call the original method first
                self.originalTooltipShow.call(this);
                if (this._tooltip && this._tooltip.visible) {
                    self.styleTooltip(this);
                }
            };
            Tooltips.Tooltip.prototype.show = this._patchedTooltipShow;

            this.debugLog("General Tooltip monkey patch setup successfully");
        } catch (e) {
            this.debugLog("Error setting up general Tooltip monkey patch:", e);
        }
    }

    /**
     * Setup monkey patching for PanelItemTooltip handling (adapted from BlurTooltips example)
     */
    setupTooltipMonkeyPatch() {
        try {
            // Store reference to original method
            this.originalPanelItemTooltipShow = Tooltips.PanelItemTooltip.prototype.show;
            let self = this;

            // Store patched function reference to enable idempotent restore
            this._patchedPanelItemTooltipShow = function () {
                // Call the original method first
                self.originalPanelItemTooltipShow.call(this);
                if (this._tooltip && this._tooltip.visible) {
                    self.styleTooltip(this);
                }
            };
            Tooltips.PanelItemTooltip.prototype.show = this._patchedPanelItemTooltipShow;

            this.debugLog("PanelItemTooltip monkey patch setup successfully");
        } catch (e) {
            this.debugLog("Error setting up PanelItemTooltip monkey patch:", e);
        }
    }

    /**
     * Check if a tooltip should be styled
     * @param {Object} tooltip - The tooltip to check
     * @returns {boolean} True if tooltip should be styled
     */
    shouldStyleTooltip(tooltip) {
        // Style all tooltips for now - can be extended with filtering logic
        return tooltip && tooltip._tooltip;
    }

    /**
     * Apply styles to tooltip
     * @param {Object} tooltip - The tooltip to style
     */
    styleTooltip(tooltip) {
        if (!tooltip || !tooltip._tooltip) {
            return;
        }

        try {
            if (!this.activeTooltips.has(tooltip)) {
                let originalData = {
                    style: tooltip._tooltip.get_style(),
                    styleClasses: tooltip._tooltip.get_style_class_name(),
                };

                this.activeTooltips.set(tooltip, originalData);

                // Connect to hide signals for cleanup
                this.setupTooltipCloseHandlers(tooltip);
            }

            let tooltipColor = this.extension.themeDetector.getEffectivePopupColor();

            this.extension.cssManager.updateAllVariables();

            // Build configuration object for template generation
            const config = {
                backgroundColor: `rgba(${tooltipColor.r}, ${tooltipColor.g}, ${tooltipColor.b}, ${this.extension.menuOpacity})`,
                opacity: this.extension.blurOpacity,
                borderRadius: this.getAdjustedBorderRadius("tooltip"),
                blurRadius: this.getAdjustedBlurRadius("tooltip"),
                blurSaturate: this.extension.blurSaturate,
                blurContrast: this.extension.blurContrast,
                blurBrightness: this.extension.blurBrightness,
                borderColor: this.extension.blurBorderColor,
                borderWidth: this.extension.blurBorderWidth,
                transition: this.extension.blurTransition,
            };

            // Generate CSS via template manager
            const tooltipCSS = this.extension.blurTemplateManager.generateTooltipCSS(config);
            tooltip._tooltip.set_style(tooltipCSS);

            this.debugLog("Applying tooltip styles via template generation");
        } catch (e) {
            this.debugLog("Error styling tooltip:", e);
        }
    }

    /**
     * Setup close handlers for proper tooltip cleanup
     * @param {Object} tooltip - The tooltip
     */
    setupTooltipCloseHandlers(tooltip) {
        if (!tooltip._transparencyHideConnection) {
            // Override hide method to cleanup (adapted from BlurTooltips example)
            let originalHide = tooltip.hide.bind(tooltip);
            tooltip.hide = () => {
                this.cleanupTooltip(tooltip);
                originalHide();
            };
            tooltip._transparencyHideConnection = true;
        }
    }

    /**
     * Clean up styling for a tooltip
     * @param {Object} tooltip - The tooltip to clean up
     */
    cleanupTooltip(tooltip) {
        try {
            let originalData = this.activeTooltips.get(tooltip);
            if (originalData) {
                this.restoreTooltipStyle(tooltip, originalData);
                this.activeTooltips.delete(tooltip);
            }
        } catch (e) {
            this.debugLog("Error cleaning up tooltip:", e);
        }
    }

    /**
     * Restore original tooltip styling
     * @param {Object} tooltip - The tooltip to restore
     * @param {Object} originalData - The original styling data
     */
    restoreTooltipStyle(tooltip, originalData) {
        try {
            if (tooltip._tooltip) {
                tooltip._tooltip.set_style(originalData.style || "");
                if (originalData.styleClasses) {
                    tooltip._tooltip.set_style_class_name(originalData.styleClasses);
                }

                // Remove our style classes
                tooltip._tooltip.remove_style_class_name(CSS_CLASSES.TOOLTIP_BLUR);
                tooltip._tooltip.remove_style_class_name(CSS_CLASSES.FALLBACK_BLUR);
                tooltip._tooltip.remove_style_class_name(CSS_CLASSES.CUSTOM_PROFILE);
            }
        } catch (e) {
            this.debugLog("Error restoring tooltip style:", e);
        }
    }

    /**
     * Restore original general Tooltip functionality
     */
    restoreGeneralTooltipMonkeyPatch() {
        try {
            if (this.originalTooltipShow) {
                if (Tooltips.Tooltip.prototype.show === this._patchedTooltipShow) {
                    Tooltips.Tooltip.prototype.show = this.originalTooltipShow;
                }
                this.originalTooltipShow = null;
                this._patchedTooltipShow = null;
                this.debugLog("General Tooltip monkey patch restored");
            }
        } catch (e) {
            this.debugLog("Error restoring general Tooltip monkey patch:", e);
        }
    }

    /**
     * Restore original PanelItemTooltip functionality
     */
    restoreTooltipMonkeyPatch() {
        try {
            if (this.originalPanelItemTooltipShow) {
                if (Tooltips.PanelItemTooltip.prototype.show === this._patchedPanelItemTooltipShow) {
                    Tooltips.PanelItemTooltip.prototype.show = this.originalPanelItemTooltipShow;
                }
                this.originalPanelItemTooltipShow = null;
                this._patchedPanelItemTooltipShow = null;
                this.debugLog("PanelItemTooltip monkey patch restored");
            }
        } catch (e) {
            this.debugLog("Error restoring PanelItemTooltip monkey patch:", e);
        }
    }

    /**
     * Clean up all active tooltips
     */
    cleanupActiveTooltips() {
        this.activeTooltips.forEach((originalData, tooltip) => {
            this.restoreTooltipStyle(tooltip, originalData);
        });
        this.activeTooltips.clear();
    }

    /**
     * Refresh all currently active tooltips
     */
    refreshActiveTooltips() {
        try {
            this.debugLog(`Refreshing ${this.activeTooltips.size} active tooltips`);

            this.activeTooltips.forEach((originalData, tooltip) => {
                if (tooltip && tooltip._tooltip && tooltip.visible) {
                    this.styleTooltip(tooltip);
                }
            });
        } catch (e) {
            this.debugLog("Error refreshing active tooltips:", e);
        }
    }

    /**
     * Setup monitoring for existing and future tooltips (adapted from osdStyler)
     */
    setupTooltipMonitoring() {
        this.debugLog("Setting up tooltip monitoring");

        // Monitor global stage for new tooltip elements - use GlobalSignalsHandler
        if (global.stage) {
            this.addConnection(global.stage, SIGNALS.ACTOR_ADDED, (stage, actor) => {
                if (this.isTooltipElement(actor) && !this.activeTooltips.has(actor)) {
                    imports.mainloop.timeout_add(TIMING.DEBOUNCE_SHORT, () => {
                        this.styleTooltip(actor);
                        return false;
                    });
                }
            });
        }

        // Initial search for existing tooltips
        this.findAndStyleExistingTooltips();
    }

    /**
     * Check if actor is a tooltip element
     * @param {Clutter.Actor} actor - Actor to check
     * @returns {boolean} True if tooltip element
     */
    isTooltipByCSS(actor) {
        return actor && actor.has_style_class_name && actor.has_style_class_name(CSS_CLASSES.TOOLTIP);
    }

    /**
     * Find and style existing tooltips that may already be displayed
     */
    findAndStyleExistingTooltips() {
        try {
            let stage = global.stage || Main.uiGroup;
            this.searchForExistingTooltips(stage, 0);
        } catch (e) {
            this.debugLog("Error finding existing tooltips:", e);
        }
    }

    /**
     * Recursively search for existing tooltip actors
     * @param {Clutter.Actor} actor - Actor to search
     * @param {number} depth - Current search depth
     */
    searchForExistingTooltips(actor, depth = 0) {
        if (depth > TRAVERSAL.MAX_DEPTH_PANEL) return;
        if (actor && actor instanceof Tooltips.Tooltip && actor._tooltip && actor.visible) {
            this.styleTooltip(actor);
        }
        if (actor && actor.get_children) {
            actor.get_children().forEach((child) => this.searchForExistingTooltips(child, depth + 1));
        }
    }

    /**
     * Recursively search for existing tooltip actors and force reset
     * @param {Clutter.Actor} actor - Actor to search
     * @param {number} depth - Current search depth
     */
    findPanelItemTooltipsInStage(actor, depth = 0) {
        if (depth > TRAVERSAL.MAX_DEPTH_PANEL) return;
        if (actor && actor instanceof Tooltips.Tooltip && actor._tooltip) {
            try {
                // Force hide and show to reset tooltip state without styling
                if (actor.visible) {
                    actor.hide();
                    imports.mainloop.timeout_add(TIMING.DEBOUNCE_SHORT, () => {
                        actor.show();
                        return false;
                    });
                }
            } catch (e) {
                this.debugLog("Error resetting tooltip:", e);
            }
        }
        if (actor && actor.get_children) {
            actor.get_children().forEach((child) => this.forceTooltipReset(child, depth + 1));
        }
    }
}

module.exports = TooltipStyler;
