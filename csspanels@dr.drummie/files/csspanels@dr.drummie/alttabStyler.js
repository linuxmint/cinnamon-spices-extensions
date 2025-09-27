const St = imports.gi.St;
const Main = imports.ui.main;
const AppSwitcher = imports.ui.appSwitcher.appSwitcher;
const { ClassicSwitcher } = imports.ui.appSwitcher.classicSwitcher;
const AppSwitcher3D = imports.ui.appSwitcher.appSwitcher3D;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const StylerBase = require("./stylerBase");

/**
 * AltTab Styler handles Alt-Tab switcher transparency and blur effects
 * Uses monkey patching to intercept Alt-Tab switcher display and apply CSS styling
 */
class AltTabStyler extends StylerBase {
    constructor(extension) {
        super(extension, "AltTabStyler");
        this.activeSwitchers = new Map();
        this.activeThumbnails = new Map();

        // Debouncing for window title styling optimization
        this.titleStylingTimeout = null;

        // Store original methods
        this.originalAppSwitcherShow = null;
        this.originalAppSwitcherHide = null;
        this.originalClassicSwitcherShow = null;
        this.originalClassicSwitcherHide = null;
        this.originalAppSwitcher3DInit = null;
        this.originalAppSwitcher3DHide = null;

        // Store thumbnail-related methods for ClassicSwitcher
        this.originalClassicSwitcherCreateThumbnails = null;
        this.originalClassicSwitcherDestroyThumbnails = null;
        this.originalClassicSwitcherShowWindowPreview = null;
        this.originalClassicSwitcherClearPreview = null;

        // Store AppSwitcher3D methods
        this.originalAppSwitcher3DSetCurrentWindow = null;
    }

    /**
     * Enable Alt-Tab styling using monkey patching approach
     */
    enable() {
        super.enable();

        try {
            const settings = new Gio.Settings({ schema: "org.cinnamon" });
            const switcherStyle = settings.get_string("alttab-switcher-style");
            this.debugLog("Current Alt-Tab switcher style:", switcherStyle);

            // Monkey patch different switcher types based on detected style
            this.monkeyPatchSwitchers(switcherStyle);
        } catch (e) {
            this.debugLog("Error reading Alt-Tab switcher style:", e);
            // Fallback to patching all switcher types
            this.monkeyPatchSwitchers("unknown");
        }

        this.debugLog("AltTab styler enabled with event-driven approach");
    }

    /**
     * Monkey patch switcher classes based on switcher style
     */
    monkeyPatchSwitchers(switcherStyle) {
        // Patch AppSwitcher3D (for coverflow/timeline styles)
        if (AppSwitcher3D && AppSwitcher3D.AppSwitcher3D) {
            this.patchAppSwitcher3D();
        }

        // Patch ClassicSwitcher (for classic/icons style)
        if (ClassicSwitcher) {
            this.patchClassicSwitcher();
        }

        // Patch general AppSwitcher if available
        if (AppSwitcher && AppSwitcher.AppSwitcher) {
            this.patchAppSwitcher();
        }
    }

    /**
     * Patch AppSwitcher3D init and hide methods
     */
    patchAppSwitcher3D() {
        // Store original methods
        this.originalAppSwitcher3DInit = AppSwitcher3D.AppSwitcher3D.prototype._init;
        this.originalAppSwitcher3DHide = AppSwitcher3D.AppSwitcher3D.prototype._hide;
        this.originalAppSwitcher3DSetCurrentWindow = AppSwitcher3D.AppSwitcher3D.prototype._setCurrentWindow;

        // Create reference to this for use in patched methods
        const stylerInstance = this;

        // Patch _init method
        AppSwitcher3D.AppSwitcher3D.prototype._init = function (...params) {
            // Call original init
            stylerInstance.originalAppSwitcher3DInit.apply(this, params);

            // Apply styling
            if (this._background && this.actor) {
                stylerInstance.debugLog("AppSwitcher3D initialized, applying styles");
                stylerInstance.styleSwitcher({ actor: this.actor }, true); // Use panel background
                stylerInstance.activeSwitchers.set(this.actor, {
                    style: this.actor.get_style(),
                    styleClasses: this.actor.get_style_class_name(),
                    switcherInstance: this,
                });
            }
        };

        // Patch hide method
        AppSwitcher3D.AppSwitcher3D.prototype._hide = function (...params) {
            // Clean up styling before hiding
            if (this.actor && stylerInstance.activeSwitchers.has(this.actor)) {
                stylerInstance.debugLog("AppSwitcher3D hiding, cleaning up styles");
                const originalData = stylerInstance.activeSwitchers.get(this.actor);
                stylerInstance.restoreSwitcherStyle(this.actor, originalData);
                stylerInstance.activeSwitchers.delete(this.actor);
            }

            // Call original hide
            stylerInstance.originalAppSwitcher3DHide.apply(this, params);
        };

        // Patch _setCurrentWindow method to style window title
        AppSwitcher3D.AppSwitcher3D.prototype._setCurrentWindow = function (...params) {
            // Call original method
            stylerInstance.originalAppSwitcher3DSetCurrentWindow.apply(this, params);

            // Style the newly created window title
            if (this._windowTitle) {
                stylerInstance.debugLog("AppSwitcher3D window title created, applying styling");
                stylerInstance.styleWindowTitle(this._windowTitle, this);
            }
        };
    }

    /**
     * Find switcher-list element within a switcher actor
     * @param {Object} actor - The switcher actor to search in
     * @returns {Object|null} The switcher-list element or null
     */
    findSwitcherList(actor) {
        function search(currentActor) {
            if (currentActor && currentActor.get_style_class_name) {
                const className = currentActor.get_style_class_name();
                if (className && className.includes("switcher-list") && !className.includes("switcher-list-item")) {
                    return currentActor;
                }
            }
            if (currentActor && currentActor.get_children) {
                for (let child of currentActor.get_children()) {
                    let found = search(child);
                    if (found) return found;
                }
            }
            return null;
        }
        return search(actor);
    }

    /**
     * Patch ClassicSwitcher show and hide methods
     */
    patchClassicSwitcher() {
        // Store original methods
        this.originalClassicSwitcherShow = ClassicSwitcher.prototype._show;
        this.originalClassicSwitcherHide = ClassicSwitcher.prototype._hide;

        // Store thumbnail-related methods (working approach)
        this.originalClassicSwitcherCreateThumbnails = ClassicSwitcher.prototype._createThumbnails;
        this.originalClassicSwitcherDestroyThumbnails = ClassicSwitcher.prototype._destroyThumbnails;

        const stylerInstance = this;

        // Patch show method
        ClassicSwitcher.prototype._show = function (...params) {
            // Call original show
            stylerInstance.originalClassicSwitcherShow.apply(this, params);

            // Find and style the switcher-list element instead of the whole actor
            if (this.actor) {
                const switcherList = stylerInstance.findSwitcherList(this.actor);
                if (switcherList) {
                    stylerInstance.debugLog("ClassicSwitcher shown, applying styles to switcher-list");
                    stylerInstance.styleSwitcher({ actor: switcherList });
                    stylerInstance.activeSwitchers.set(switcherList, {
                        style: switcherList.get_style(),
                        styleClasses: switcherList.get_style_class_name(),
                        switcherInstance: this,
                    });
                } else {
                    stylerInstance.debugLog("ClassicSwitcher: switcher-list not found, skipping styling");
                }
            }
        };

        // Patch hide method
        ClassicSwitcher.prototype._hide = function (...params) {
            // Clean up styling before hiding
            if (this.actor) {
                const switcherList = stylerInstance.findSwitcherList(this.actor);
                if (switcherList && stylerInstance.activeSwitchers.has(switcherList)) {
                    stylerInstance.debugLog("ClassicSwitcher hiding, cleaning up styles from switcher-list");
                    const originalData = stylerInstance.activeSwitchers.get(switcherList);
                    stylerInstance.restoreSwitcherStyle(switcherList, originalData);
                    stylerInstance.activeSwitchers.delete(switcherList);
                }
            }

            // Call original hide
            stylerInstance.originalClassicSwitcherHide.apply(this, params);
        };

        // Patch _createThumbnails method (working approach)
        ClassicSwitcher.prototype._createThumbnails = function (...params) {
            // Call original method
            stylerInstance.originalClassicSwitcherCreateThumbnails.apply(this, params);

            // Style the newly created thumbnails
            if (this._thumbnails && this._thumbnails.actor) {
                stylerInstance.debugLog("Thumbnails created, applying styling");
                stylerInstance.styleThumbnails(this._thumbnails.actor, this);
            }
        };

        // Patch _destroyThumbnails method (working approach)
        ClassicSwitcher.prototype._destroyThumbnails = function (...params) {
            // Clean up thumbnail styling before destroying
            if (this._thumbnails && this._thumbnails.actor) {
                stylerInstance.cleanupThumbnails(this._thumbnails.actor);
            }

            // Call original method
            stylerInstance.originalClassicSwitcherDestroyThumbnails.apply(this, params);
        };
    }

    /**
     * Patch general AppSwitcher if needed
     */
    patchAppSwitcher() {
        if (!AppSwitcher.AppSwitcher.prototype._show || !AppSwitcher.AppSwitcher.prototype._hide) {
            return; // Methods don't exist
        }

        // Store original methods
        this.originalAppSwitcherShow = AppSwitcher.AppSwitcher.prototype._show;
        this.originalAppSwitcherHide = AppSwitcher.AppSwitcher.prototype._hide;

        const stylerInstance = this;

        // Patch show method
        AppSwitcher.AppSwitcher.prototype._show = function (...params) {
            // Call original show
            stylerInstance.originalAppSwitcherShow.apply(this, params);

            // Apply styling
            if (this.actor) {
                stylerInstance.debugLog("AppSwitcher shown, applying styles");
                stylerInstance.styleSwitcher({ actor: this.actor });
                stylerInstance.activeSwitchers.set(this.actor, {
                    style: this.actor.get_style(),
                    styleClasses: this.actor.get_style_class_name(),
                    switcherInstance: this,
                });
            }
        };

        // Patch hide method
        AppSwitcher.AppSwitcher.prototype._hide = function (...params) {
            // Clean up styling before hiding
            if (this.actor && stylerInstance.activeSwitchers.has(this.actor)) {
                stylerInstance.debugLog("AppSwitcher hiding, cleaning up styles");
                const originalData = stylerInstance.activeSwitchers.get(this.actor);
                stylerInstance.restoreSwitcherStyle(this.actor, originalData);
                stylerInstance.activeSwitchers.delete(this.actor);
            }

            // Call original hide
            stylerInstance.originalAppSwitcherHide.apply(this, params);
        };
    }

    /**
     * Disable Alt-Tab styling and restore original methods
     */
    disable() {
        this.debugLog("AltTabStyler: Starting disable cleanup");

        // Clear debounce timeout
        if (this.titleStylingTimeout) {
            imports.mainloop.source_remove(this.titleStylingTimeout);
            this.titleStylingTimeout = null;
        }

        // Clean up all active switchers
        this.activeSwitchers.forEach((originalData, switcherActor) => {
            try {
                this.restoreSwitcherStyle(switcherActor, originalData);
            } catch (e) {
                this.debugLog("Error restoring switcher during disable:", e);
            }
        });
        this.activeSwitchers.clear();

        // Restore original methods
        this.restoreOriginalMethods();

        // Clean up all active thumbnails
        this.activeThumbnails.forEach((originalData, thumbnailElement) => {
            try {
                this.restoreThumbnailStyle(thumbnailElement, originalData);
            } catch (e) {
                this.debugLog("Error restoring thumbnail during disable:", e);
            }
        });
        this.activeThumbnails.clear();

        this.debugLog("AltTabStyler: Disable cleanup completed");
        super.disable();
    }

    /**
     * Restore all original methods
     */
    restoreOriginalMethods() {
        // Restore AppSwitcher3D methods
        if (this.originalAppSwitcher3DInit && AppSwitcher3D && AppSwitcher3D.AppSwitcher3D) {
            AppSwitcher3D.AppSwitcher3D.prototype._init = this.originalAppSwitcher3DInit;
            AppSwitcher3D.AppSwitcher3D.prototype._hide = this.originalAppSwitcher3DHide;
            if (this.originalAppSwitcher3DSetCurrentWindow) {
                AppSwitcher3D.AppSwitcher3D.prototype._setCurrentWindow = this.originalAppSwitcher3DSetCurrentWindow;
            }
        }

        // Restore ClassicSwitcher methods
        if (this.originalClassicSwitcherShow && ClassicSwitcher) {
            ClassicSwitcher.prototype._show = this.originalClassicSwitcherShow;
            ClassicSwitcher.prototype._hide = this.originalClassicSwitcherHide;

            // Restore working thumbnail methods
            if (this.originalClassicSwitcherCreateThumbnails) {
                ClassicSwitcher.prototype._createThumbnails = this.originalClassicSwitcherCreateThumbnails;
            }
            if (this.originalClassicSwitcherDestroyThumbnails) {
                ClassicSwitcher.prototype._destroyThumbnails = this.originalClassicSwitcherDestroyThumbnails;
            }
        }

        // Restore AppSwitcher methods
        if (this.originalAppSwitcherShow && AppSwitcher && AppSwitcher.AppSwitcher) {
            AppSwitcher.AppSwitcher.prototype._show = this.originalAppSwitcherShow;
            AppSwitcher.AppSwitcher.prototype._hide = this.originalAppSwitcherHide;
        }
    }

    /**
     * Apply styles to switcher with configurable background type
     * @param {Object} switcher - The switcher object containing actor
     * @param {boolean} isPanel - If true, uses panel color/opacity; if false, uses menu color/opacity
     */
    styleSwitcher(switcher, isPanel = false) {
        if (!switcher || !switcher.actor) {
            this.debugLog("Invalid switcher or actor");
            return;
        }

        try {
            let panelColor = this.extension.themeDetector.getPanelBaseColor();
            let switcherColor, effectiveOpacity;

            if (isPanel) {
                // Use panel color and panel opacity for background
                switcherColor = panelColor;
                effectiveOpacity = this.extension.panelOpacity;
            } else {
                // Use menu color and menu opacity for better readability
                switcherColor = this.extension.cssManager.getMenuColor(panelColor);
                effectiveOpacity = this.extension.menuOpacity;
            }

            // Apply common blur styling with Alt-Tab-specific additional styles
            const additionalStyles = `
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
                padding: 12px !important;
            `;

            this.applyCommonBlurStyling(
                switcher.actor,
                switcherColor,
                effectiveOpacity,
                this.getAdjustedBlurRadius("alttab"),
                isPanel ? 1.0 : this.getAdjustedBorderRadius("alttab"),
                this.extension.blurBorderColor,
                this.extension.blurBorderWidth,
                "alttab",
                additionalStyles
            );

            this.debugLog("Alt-Tab switcher styled successfully");
        } catch (e) {
            this.debugLog("Error styling switcher:", e);
        }
    }

    /**
     * Restore original switcher styling (existing method remains the same)
     */
    restoreSwitcherStyle(switcherActor, originalData) {
        try {
            if (switcherActor) {
                switcherActor.set_style(originalData.style || "");
                if (originalData.styleClasses) {
                    switcherActor.set_style_class_name(originalData.styleClasses);
                }

                // Remove our style classes
                switcherActor.remove_style_class_name("transparency-alttab-blur");
                switcherActor.remove_style_class_name("transparency-fallback-blur");
                switcherActor.remove_style_class_name("profile-custom");
            }
        } catch (e) {
            this.debugLog("Error restoring switcher style:", e);
        }
    }

    /**
     * Refresh all currently active switchers (simplified since we're event-driven now)
     */
    refreshActiveSwitchers() {
        try {
            this.debugLog(`Refreshing ${this.activeSwitchers.size} active switchers`);
            this.activeSwitchers.forEach((originalData, switcherActor) => {
                if (switcherActor && switcherActor.visible) {
                    this.styleSwitcher({ actor: switcherActor });
                }
            });
        } catch (e) {
            this.debugLog("Error refreshing active switchers:", e);
        }
    }

    /**
     * Check if a switcher should be styled
     * @param {Object} switcher - The switcher to check
     * @returns {boolean} True if switcher should be styled
     */
    shouldStyleSwitcher(switcher) {
        // Style all Alt-Tab switchers for now - can be extended with filtering logic
        return switcher && switcher.actor;
    }

    /**
     * Cleanup a switcher element when it's no longer visible
     * @param {Object} switcher - The switcher to cleanup
     */
    cleanupSwitcher(switcher) {
        if (!switcher || !switcher.actor) return;

        const element = switcher.actor;
        if (this.activeSwitchers.has(element)) {
            this.debugLog(`Cleaning up switcher: ${element.get_style_class_name()}`);
            const originalData = this.activeSwitchers.get(element);
            this.restoreSwitcherStyle(element, originalData);

            // Clear cleanup timeout if exists
            if (originalData.cleanupTimeout) {
                Mainloop.source_remove(originalData.cleanupTimeout);
            }

            this.activeSwitchers.delete(element);
        }
    }

    /**
     * Style thumbnail elements using working approach from old implementation
     * @param {Object} thumbnailActor - The thumbnail container actor
     * @param {Object} switcherInstance - The ClassicSwitcher instance
     */
    styleThumbnails(thumbnailActor, switcherInstance) {
        if (!thumbnailActor) return;

        try {
            // Find all thumbnail elements using the working approach
            const thumbnailElements = this.findThumbnailElements(thumbnailActor);
            thumbnailElements.forEach((element) => {
                this.applyThumbnailStyling(element);
                this.activeThumbnails.set(element, {
                    style: element.get_style(),
                    styleClasses: element.get_style_class_name(),
                    switcherInstance: switcherInstance,
                });
            });

            this.debugLog(`Styled ${thumbnailElements.length} thumbnail elements`);
        } catch (e) {
            this.debugLog("Error styling thumbnails:", e);
        }
    }

    /**
     * Find thumbnail elements using working approach
     * @param {Object} thumbnailActor - The thumbnail container
     * @returns {Array} Array of thumbnail elements
     */
    findThumbnailElements(thumbnailActor) {
        const thumbnails = [];

        function searchForThumbnails(actor) {
            if (actor && actor.get_style_class_name) {
                const className = actor.get_style_class_name();
                // Target the preview container (switcher-list-item-container) instead of thumbnail
                if (className && className.includes("switcher-list") && !className.includes("switcher-list-item")) {
                    thumbnails.push(actor);
                    return; // Don't search children once we find the container
                }
            }
            if (actor && actor.get_children) {
                actor.get_children().forEach(searchForThumbnails);
            }
        }

        if (thumbnailActor) {
            searchForThumbnails(thumbnailActor);
        }

        return thumbnails;
    }

    /**
     * Apply styling to preview container element using existing applyCommonBlurStyling
     * @param {Object} previewContainer - The preview container element to style
     */
    applyThumbnailStyling(previewContainer) {
        if (!previewContainer) return;

        try {
            let panelColor = this.extension.themeDetector.getPanelBaseColor();
            let previewColor = this.extension.cssManager.getMenuColor(panelColor);

            const additionalStyles = `
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
                margin: 4px !important;
                padding: 8px !important;
            `;

            this.applyCommonBlurStyling(
                previewContainer,
                previewColor,
                this.extension.menuOpacity,
                this.getAdjustedBlurRadius("alttab"),
                this.getAdjustedBorderRadius("alttab"),
                this.extension.blurBorderColor,
                this.extension.blurBorderWidth,
                "alttab", // Uses 'transparency-alttab-blur' class
                additionalStyles
            );

            this.debugLog("Preview container styled successfully");
        } catch (e) {
            this.debugLog("Error styling preview container:", e);
        }
    }

    /**
     * Clean up styling for thumbnails
     * @param {Object} thumbnailActor - The thumbnail actor to cleanup
     */
    cleanupThumbnails(thumbnailActor) {
        if (!thumbnailActor) return;

        const thumbnailElements = this.findThumbnailElements(thumbnailActor);
        thumbnailElements.forEach((element) => {
            if (this.activeThumbnails.has(element)) {
                const originalData = this.activeThumbnails.get(element);
                this.restoreThumbnailStyle(element, originalData);
                this.activeThumbnails.delete(element);
            }
        });
        this.debugLog(`Cleaned up ${thumbnailElements.length} thumbnail elements`);
    }

    /**
     * Restore original thumbnail styling
     * @param {Object} thumbnailElement - The thumbnail element
     * @param {Object} originalData - Original styling data
     */
    restoreThumbnailStyle(thumbnailElement, originalData) {
        try {
            if (thumbnailElement) {
                thumbnailElement.set_style(originalData.style || "");
                if (originalData.styleClasses) {
                    thumbnailElement.set_style_class_name(originalData.styleClasses);
                }

                // Remove style classes added by applyCommonBlurStyling
                thumbnailElement.remove_style_class_name("transparency-alttab-blur");
                thumbnailElement.remove_style_class_name("transparency-fallback-blur");
                thumbnailElement.remove_style_class_name("profile-custom");
            }
        } catch (e) {
            this.debugLog("Error restoring thumbnail style:", e);
        }
    }

    /**
     * Style AppSwitcher3D window title label
     * @param {St.Label} windowTitle - The window title label to style
     * @param {Object} switcherInstance - The AppSwitcher3D instance
     */
    styleWindowTitle(windowTitle, switcherInstance) {
        if (!windowTitle) return;

        // Clear previous timeout if exists
        if (this.titleStylingTimeout) {
            imports.mainloop.source_remove(this.titleStylingTimeout);
        }

        // Debounce the styling operation
        this.titleStylingTimeout = imports.mainloop.timeout_add(50, () => {
            this.performWindowTitleStyling(windowTitle, switcherInstance);
            this.titleStylingTimeout = null;
            return false;
        });
    }

    /**
     * Perform the actual window title styling (extracted for debouncing)
     * @param {St.Label} windowTitle - The window title label to style
     * @param {Object} switcherInstance - The AppSwitcher3D instance
     */
    performWindowTitleStyling(windowTitle, switcherInstance) {
        if (!windowTitle) return;

        try {
            let panelColor = this.extension.themeDetector.getPanelBaseColor();
            // Always use menu color and opacity for window title (better readability)
            let titleColor = this.extension.cssManager.getMenuColor(panelColor);
            let titleOpacity = this.extension.menuOpacity;

            const additionalStyles = `
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
                margin: 8px !important;
                padding: 12px 16px !important;
            `;

            this.applyCommonBlurStyling(
                windowTitle,
                titleColor,
                titleOpacity,
                this.getAdjustedBlurRadius("alttab"),
                this.getAdjustedBorderRadius("alttab"),
                this.extension.blurBorderColor,
                this.extension.blurBorderWidth,
                "alttab", // Uses 'transparency-alttab-blur' class
                additionalStyles
            );

            // Store for cleanup
            this.activeThumbnails.set(windowTitle, {
                style: windowTitle.get_style(),
                styleClasses: windowTitle.get_style_class_name(),
                switcherInstance: switcherInstance,
            });

            this.debugLog("AppSwitcher3D window title styled successfully");
        } catch (e) {
            this.debugLog("Error styling window title:", e);
        }
    }
}

module.exports = AltTabStyler;
