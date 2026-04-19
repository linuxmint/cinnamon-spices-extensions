const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const DeskletManager = imports.ui.deskletManager;
const StylerBase = require("./stylerBase");
const { TIMING } = require("./constants");

/**
 * Desklet Styler applies CSS transparency/blur/glow effects to desktop widgets (desklets)
 * Uses monkey patching to intercept DeskletManager creation and unload calls
 */
class DeskletStyler extends StylerBase {
    /**
     * Initialize Desklet Styler
     * @param {Object} extension - Reference to main extension instance
     */
    constructor(extension) {
        super(extension, "DeskletStyler");

        // Track styled desklets with their original styles
        this.activeDesklets = new Map();

        // Store original methods for monkey patch restoration
        this.originalCreateDesklets = null;
        this.originalUnloadDesklet = null;

        // Store bound patched methods for idempotent restore
        this._boundPatchedCreate = null;
        this._boundPatchedUnload = null;
    }

    /**
     * Enable desklet styling via monkey patching DeskletManager
     */
    enable() {
        super.enable();

        // Guard: skip if desklet styling is disabled in settings
        if (!this.extension.enableDeskletStyling) return;

        // Save original methods before patching
        this.originalCreateDesklets = DeskletManager._createDesklets;
        this.originalUnloadDesklet = DeskletManager._unloadDesklet;

        // Patch _createDesklets using arrow closure (preserves 'this' reference cleanly)
        this._boundPatchedCreate = (extension, deskletDef) => {
            const desklet = this.originalCreateDesklets.call(DeskletManager, extension, deskletDef);
            if (desklet) {
                // Defer styling briefly to let the desklet actor fully initialize
                Mainloop.timeout_add(TIMING.DEBOUNCE_SHORT, () => {
                    this._styleDesklet(desklet);
                    return false; // Remove timeout (one-shot)
                });
            }
            return desklet;
        };
        DeskletManager._createDesklets = this._boundPatchedCreate;

        // Patch _unloadDesklet to restore styles before desklet is destroyed
        this._boundPatchedUnload = (deskletDef, deleteConfig) => {
            // Find and clean up the desklet before unloading
            if (deskletDef && deskletDef.desklet && deskletDef.desklet.content && this.activeDesklets.has(deskletDef.desklet)) {
                const originalData = this.activeDesklets.get(deskletDef.desklet);
                try {
                    deskletDef.desklet.content.set_style(originalData.style);
                } catch (e) {
                    this.debugLog("Error restoring desklet style on unload:", e);
                }
                this.activeDesklets.delete(deskletDef.desklet);
            }
            return this.originalUnloadDesklet.call(DeskletManager, deskletDef, deleteConfig);
        };
        DeskletManager._unloadDesklet = this._boundPatchedUnload;

        // Style desklets that are already loaded
        try {
            // Access module-level definitions array directly — it holds live desklet instance references.
            // getDefinitions() rebuilds from GSettings and returns fresh objects where def.desklet is null.
            const definitions = DeskletManager.definitions || [];
            definitions.forEach(def => {
                if (def.desklet) {
                    this._styleDesklet(def.desklet);
                }
            });
            this.debugLog(`DeskletStyler enabled, styled ${this.activeDesklets.size} existing desklets`);
        } catch (e) {
            this.debugLog("Error styling existing desklets:", e);
        }
    }

    /**
     * Disable desklet styling and restore all original states
     */
    disable() {
        this.debugLog("DeskletStyler: Starting disable cleanup");

        // Restore _createDesklets idempotently (check we still own the patch)
        if (this.originalCreateDesklets) {
            if (DeskletManager._createDesklets === this._boundPatchedCreate) {
                DeskletManager._createDesklets = this.originalCreateDesklets;
            }
            this.originalCreateDesklets = null;
            this._boundPatchedCreate = null;
        }

        // Restore _unloadDesklet idempotently
        if (this.originalUnloadDesklet) {
            if (DeskletManager._unloadDesklet === this._boundPatchedUnload) {
                DeskletManager._unloadDesklet = this.originalUnloadDesklet;
            }
            this.originalUnloadDesklet = null;
            this._boundPatchedUnload = null;
        }

        // Restore all desklet styles
        this._restoreAllDesklets();

        this.debugLog("DeskletStyler: Disable cleanup completed");
        super.disable();
    }

    /**
     * Refresh all currently styled desklets with updated CSS
     */
    refresh() {
        super.refresh();
        this.refreshAllDesklets();
    }

    /**
     * Apply CSS styling to a single desklet
     * Guards against invalid actors and double-styling
     * @param {Object} desklet - Cinnamon desklet instance with an actor property
     * @private
     */
    _styleDesklet(desklet) {
        if (!desklet || !desklet.actor || !desklet.content) return;

        // Skip if already tracked (already styled)
        if (this.activeDesklets.has(desklet)) return;

        try {
            // Save original inline style of content actor (theme styles via class, not inline)
            const originalStyle = desklet.content.get_style() || "";

            // Store in map before applying so destroy-cleanup can find it
            this.activeDesklets.set(desklet, { style: originalStyle });

            // Connect destroy signal for automatic map cleanup
            this.addConnection(desklet.actor, "destroy", () => {
                this.activeDesklets.delete(desklet);
            });

            // Build color/config from current extension settings
            const deskletColor = this.extension.themeDetector.getEffectivePopupColor();
            const config = {
                backgroundColor: `rgba(${deskletColor.r}, ${deskletColor.g}, ${deskletColor.b}, ${this.extension.menuOpacity})`,
                opacity: this.extension.blurOpacity,
                borderRadius: this.getAdjustedBorderRadius("desklet"),
                blurRadius: this.getAdjustedBlurRadius("desklet"),
                blurSaturate: this.extension.blurSaturate,
                blurContrast: this.extension.blurContrast,
                blurBrightness: this.extension.blurBrightness,
                borderColor: this.extension.blurBorderColor,
                borderWidth: this.extension.blurBorderWidth,
                transition: this.extension.blurTransition,
            };

            // Generate CSS via template manager and apply
            const css = this.extension.blurTemplateManager.generateDeskletCSS(config);
            // Apply to content — carries .desklet class, sits above actor background
            desklet.content.set_style(css);

            this.debugLog("Desklet styled via template generation");
        } catch (e) {
            this.debugLog("Error styling desklet:", e);
            // Remove from map on failure to keep state consistent
            this.activeDesklets.delete(desklet);
        }
    }

    /**
     * Restore all tracked desklets to their original inline styles
     * @private
     */
    _restoreAllDesklets() {
        this.activeDesklets.forEach((originalData, desklet) => {
            try {
                if (desklet && desklet.content) {
                    desklet.content.set_style(originalData.style);
                }
            } catch (e) {
                this.debugLog("Error restoring desklet style:", e);
            }
        });
        this.activeDesklets.clear();
    }

    /**
     * Public alias for _restoreAllDesklets — restores all desklets to original styles
     */
    restoreAllDesklets() {
        this._restoreAllDesklets();
    }

    /**
     * Re-apply current CSS to all tracked desklets (used after settings change)
     * Removes each desklet from the map first so the guard in _styleDesklet passes
     */
    refreshAllDesklets() {
        this.debugLog("refreshing all desklets");

        // Collect desklets to refresh (avoid mutating map while iterating)
        const desklets = [];
        this.activeDesklets.forEach((originalData, desklet) => {
            desklets.push({ desklet, originalStyle: originalData.style });
        });

        desklets.forEach(({ desklet, originalStyle }) => {
            if (!desklet || !desklet.content) return;

            // Delete from map so _styleDesklet guard allows re-styling
            // Preserve the original style value by re-setting it first
            this.activeDesklets.delete(desklet);

            // Restore original before re-styling to keep originalStyle accurate
            try {
                desklet.content.set_style(originalStyle);
            } catch (e) {
                this.debugLog("Error pre-resetting desklet style during refresh:", e);
            }

            // Re-apply updated styling (re-adds to activeDesklets)
            this._styleDesklet(desklet);

            // Recover the true original style (set before the first styling)
            const entry = this.activeDesklets.get(desklet);
            if (entry) {
                entry.style = originalStyle;
            }
        });
    }
}

module.exports = DeskletStyler;
