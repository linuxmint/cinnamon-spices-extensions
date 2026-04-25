/* signalHandler.js
 *
 * Global Signal Management for CSSPanels Extension
 * Pattern adapted from zorin-taskbar@zorinos.com/utils.js (BasicHandler)
 * Compatible with Cinnamon 6.0+ (Linux Mint 22.1+)
 *
 * Provides centralized signal connection tracking to prevent memory leaks
 * and ensure proper cleanup on extension disable.
 */

/**
 * GlobalSignalsHandler - Centralized signal connection management
 *
 * Handles signal connections with automatic tracking and cleanup.
 * Prevents memory leaks by ensuring all signals are properly disconnected.
 *
 * Usage:
 *   this._signalsHandler = new GlobalSignalsHandler();
 *
 *   // Add single signal
 *   this._signalsHandler.add(
 *       [object, 'signal-name', callback]
 *   );
 *
 *   // Add multiple signals to same object
 *   this._signalsHandler.add(
 *       [object, ['signal-1', 'signal-2'], callback]
 *   );
 *
 *   // Add many signals at once
 *   this._signalsHandler.add(
 *       [obj1, 'signal-a', callbackA],
 *       [obj2, 'signal-b', callbackB],
 *       [obj3, ['signal-c', 'signal-d'], callbackC]
 *   );
 *
 *   // Cleanup - disconnect all tracked signals
 *   this._signalsHandler.destroy();
 *
 * @class GlobalSignalsHandler
 */
class GlobalSignalsHandler {
    /**
     * Create new signal handler with empty signal tracking
     */
    constructor() {
        /**
         * Array of tracked signal connections
         * Each entry: { object: GObject, signalId: number }
         * @private
         */
        this._signals = [];
    }

    /**
     * Add signal connections to tracking
     *
     * Accepts variable number of signal definitions. Each definition is an array:
     * - [object, signalName, callback] - Single signal
     * - [object, [signalNames...], callback] - Multiple signals to same callback
     *
     * All connections are automatically tracked for cleanup in destroy().
     *
     * @param {...Array} signals - Variable number of signal definitions to add
     *
     * @example
     *   // Single signal
     *   handler.add([settings, 'changed', this._onChanged.bind(this)]);
     *
     *   // Multiple signals to same object
     *   handler.add([settings, ['changed::key1', 'changed::key2'], callback]);
     *
     *   // Multiple entries at once
     *   handler.add(
     *       [obj1, 'signal1', cb1],
     *       [obj2, 'signal2', cb2]
     *   );
     */
    add(...signals) {
        signals.forEach((entry) => {
            let object = entry[0];
            let signalNames = entry[1];
            let callback = entry[2];

            // Validate entry structure
            if (!object || !signalNames || !callback) {
                global.logWarning(
                    "[CSSPanels:GlobalSignalsHandler] Invalid signal entry - missing object, signal, or callback"
                );
                return;
            }

            // Ensure signalNames is array (support both single string and array)
            if (!Array.isArray(signalNames)) {
                signalNames = [signalNames];
            }

            // Connect each signal and track connection ID
            signalNames.forEach((signal) => {
                try {
                    let signalId = object.connect(signal, callback);
                    this._signals.push({ object, signalId });
                } catch (e) {
                    // Silent failure for missing signals
                    // This allows connecting to optional signals without throwing
                    global.logError(
                        `[CSSPanels:GlobalSignalsHandler] Error in signal connection '${signal}': ${e.message}\n${e.stack || ""}`
                    );
                }
            });
        });
    }

    /**
     * Remove specific signal connection from tracking
     *
     * Disconnects the signal and removes it from internal tracking array.
     *
     * @param {GObject.Object} object - Object that emitted the signal
     * @param {number} signalId - Signal connection ID to remove
     */
    remove(object, signalId) {
        const index = this._signals.findIndex((s) => s.object === object && s.signalId === signalId);
        if (index !== -1) {
            try {
                if (object && signalId) {
                    object.disconnect(signalId);
                }
            } catch (e) {
                // Object may already be destroyed - safe to ignore
                global.logWarning(
                    "[CSSPanels:GlobalSignalsHandler] Failed to disconnect signal (object may be destroyed)"
                );
            }
            this._signals.splice(index, 1);
        }
    }

    /**
     * Remove all signals from specific object
     *
     * Useful when destroying a specific component while keeping others active.
     *
     * @param {GObject.Object} object - Object to disconnect all signals from
     */
    removeAll(object) {
        const toRemove = this._signals.filter((s) => s.object === object);
        toRemove.forEach(({ signalId }) => this.remove(object, signalId));
    }

    /**
     * Disconnect all tracked signals and clear tracking
     *
     * MUST be called in disable() method to prevent memory leaks!
     *
     * This method ensures proper cleanup by disconnecting all tracked signals,
     * even if objects are already destroyed. Handles edge cases gracefully.
     */
    destroy() {
        this._signals.forEach(({ object, signalId }) => {
            try {
                if (object && signalId) {
                    object.disconnect(signalId);
                }
            } catch (e) {
                // Object may already be destroyed during Cinnamon shutdown
                // This is expected and safe to ignore
            }
        });
        this._signals = [];
    }

    /**
     * Check if handler has any tracked signals
     *
     * Useful for debugging and testing to verify cleanup was successful.
     *
     * @returns {boolean} True if signals are tracked, false if empty
     */
    hasSignals() {
        return this._signals.length > 0;
    }

    /**
     * Get count of tracked signals
     *
     * Debug method to monitor signal accumulation and verify cleanup.
     * Expected to be 0 after destroy() is called.
     *
     * @returns {number} Number of tracked signal connections
     */
    getSignalCount() {
        return this._signals.length;
    }
}

// Export for Cinnamon
module.exports = { GlobalSignalsHandler };
