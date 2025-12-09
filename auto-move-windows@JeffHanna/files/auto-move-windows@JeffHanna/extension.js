//!/usr/bin/cjs
/* Auto Move Windows
 * Move and resize newly opened application windows according to per-app rules.
 *
 * Runtime contract (short):
 * - Inputs: extension settings key `app-rules` (array of rule objects). Each rule is expected to include
 *   a `wmClass` string and optional `workspace`, `x`, `y`, `width`, `height`, `maximized`, `maximizeVertically`, `firstOnly` fields.
 * - Behavior: when a new MetaWindow is added, find the matching rule (case-insensitive by WM_CLASS)
 *   and, if found, optionally switch workspace and move/resize/maximize the window.
 * - Error modes: malformed or missing rules are skipped; exceptions are caught and logged via global.logError.
 *
 * Rule object example:
 * { wmClass: "Firefox", workspace: 1, x: 100, y: 50, width: 1200, height: 800, firstOnly: true }
 * { wmClass: "Chrome", workspace: 0, maximized: true, firstOnly: false }
 * { wmClass: "Terminal", workspace: 1, x: 0, width: 1920, maximizeVertically: true }
 * Notes:
 * - WM_CLASS matching is performed case-insensitively by doing a substring match
 *   (the rule's wmClass lowercased must appear anywhere inside the window's WM_CLASS).
 * - `firstOnly: true` - Only the first window instance is placed on the assigned workspace (initial placement only).
 * - `firstOnly: false` - All window instances are placed on the assigned workspace with continuous enforcement.
 *   The window will be automatically moved back if it's moved to a different workspace.
 * - `maximized` takes precedence over all geometry settings - if true, the window is fully maximized.
 * - `maximizeVertically` maximizes height only; requires `width` to be set, and `height` is ignored.
 */

const Main = imports.ui.main;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;

let extensionInstance = null;

class AutoMoveWindows {
    /**
     * Create a new AutoMoveWindows instance.
     *
     * @param {Object} metadata - Extension metadata provided by Cinnamon (contains uuid and other info).
     *
     * Instance fields created:
     *  - this._meta: metadata object
     *  - this._settings: Settings.ExtensionSettings instance (populated in enable)
     *  - this._signals: SignalManager instance (populated in enable)
     *  - this._firstAppliedMap: Map to track rules with firstOnly semantics
     */
    constructor(metadata) {
        this._meta = metadata;
        this._settings = null;
        this._signals = null;
        this._firstAppliedMap = new Map();
        this._managedWindows = new Map();
    }


    /**
     * Enable the extension runtime behavior.
     *
     * Initializes settings binding and signal hooks used to monitor new and removed windows.
     * This method is called by the top-level enable() wrapper when the extension is activated.
     */
    enable() {
        this._settings = new Settings.ExtensionSettings(this, this._meta.uuid);
        this._signals = new SignalManager.SignalManager(null);
        this._signals.connect(global.screen, 'window-added', this._onWindowAdded, this);
        this._signals.connect(global.screen, 'window-removed', this._onWindowRemoved, this);

        // Capture this context for settings change handler
        const self = this;

        // Clear tracking maps whenever settings change to allow rules to be re-evaluated
        this._settings.connect('changed::app-rules', () => {
            try {
                self._firstAppliedMap.clear();
                self._managedWindows.clear();
                // Re-process all existing windows with new rules
                self._processExistingWindows();
            } catch (e) {
                global.logError('[auto-move-windows] Error in settings change handler: ' + e);
            }
        });

        // Process existing windows to enable continuous enforcement for already-open windows
        this._processExistingWindows();
    }


    /**
     * Process all existing windows to set up continuous workspace enforcement.
     *
     * This is called when the extension is enabled or when settings change, to ensure
     * that windows matching rules with firstOnly=false are tracked for continuous enforcement.
     */
    _processExistingWindows() {
        try {
            if (!this._settings || !this._signals) {
                return;
            }

            const windows = global.display.list_windows(0);
            const rules = (this._settings.getValue('app-rules') || []).map(r => {
                if (r && r.wmClass) {
                    let copy = Object.assign({}, r);
                    copy._wmClassLower = String(r.wmClass).trim().toLowerCase();
                    return copy;
                }
                return r;
            });

            for (let metaWindow of windows) {
                if (!metaWindow)
                    continue;

                const wmClass = metaWindow.get_wm_class && metaWindow.get_wm_class();
                if (!wmClass)
                    continue;

                const type = metaWindow.get_window_type();
                if (type === Meta.WindowType.DESKTOP || type === Meta.WindowType.DOCK || type === Meta.WindowType.SPLASHSCREEN)
                    continue;

                const wmLower = String(wmClass).toLowerCase();
                const titleLower = String(metaWindow.get_title && metaWindow.get_title() || '').toLowerCase();

                // Find matching rule
                const rule = rules.find(r => {
                    if (!r || !r._wmClassLower)
                        return false;
                    const field = (r.matchField || 'wmClass');
                    switch (field) {
                        case 'title':
                            return titleLower.indexOf(r._wmClassLower) !== -1;
                        case 'wmClass':
                        default:
                            return wmLower.indexOf(r._wmClassLower) !== -1;
                    }
                });

                if (rule) {
                    // If firstOnly is true, register this window so subsequent instances are ignored
                    if (rule.firstOnly) {
                        const ruleKey = rule._wmClassLower;
                        if (!this._firstAppliedMap.has(ruleKey)) {
                            this._firstAppliedMap.set(ruleKey, metaWindow);
                        }
                    }
                }

                if (rule && !rule.firstOnly && Number.isInteger(rule.workspace) && rule.workspace >= 0) {
                    // Move window to correct workspace if it's not already there
                    const currentWorkspace = metaWindow.get_workspace();
                    const currentIndex = currentWorkspace ? currentWorkspace.index() : -1;

                    if (currentIndex !== rule.workspace) {
                        if (metaWindow.change_workspace_by_index) {
                            metaWindow.change_workspace_by_index(rule.workspace, false);
                        } else if (metaWindow.change_workspace) {
                            const ws = global.workspace_manager.get_workspace_by_index(rule.workspace);
                            if (ws)
                                metaWindow.change_workspace(ws);
                        }
                    }

                    // Enable continuous enforcement for this window
                    this._managedWindows.set(metaWindow, {
                        workspace: rule.workspace,
                        wmClass: rule.wmClass
                    });

                    // Connect to workspace-changed signal
                    this._signals.connect(metaWindow, 'workspace-changed',
                        this._onWindowWorkspaceChanged.bind(this, metaWindow));
                }
            }
        } catch (e) {
            global.logError('[auto-move-windows] Error processing existing windows: ' + e);
        }
    }


    /**
     * Disable the extension runtime behavior.
     *
     * Disconnects any registered signals and clears runtime state. Called when the extension
     * is being disabled or reloaded.
     */
    disable() {
        // Clear maps first to prevent handlers from accessing them during cleanup
        if (this._firstAppliedMap) {
            this._firstAppliedMap.clear();
        }
        if (this._managedWindows) {
            this._managedWindows.clear();
        }

        if (this._signals) {
            this._signals.disconnectAllSignals();
            this._signals = null;
        }
        if (this._settings) {
            this._settings = null;
        }
    }


    /**
     * Handler for the `window-added` signal.
     *
     * When a new window is mapped, this method loads the current `app-rules` from settings,
     * normalizes rule matching fields, and applies the first matching rule (if any) to the
     * window by switching workspace, moving/resizing, or maximizing according to the rule.
     *
     * @param {object} screen - the Screen object that emitted the signal
     * @param {Meta.Window} metaWindow - the newly added MetaWindow
     * @param {number} monitorIndex - monitor index where the window appeared
     */
    _onWindowAdded(screen, metaWindow, monitorIndex) {
        if (!metaWindow)
            return;

        const wmClass = metaWindow.get_wm_class && metaWindow.get_wm_class();
        if (!wmClass)
            return;

        const type = metaWindow.get_window_type();
        if (type === Meta.WindowType.DESKTOP || type === Meta.WindowType.DOCK || type === Meta.WindowType.SPLASHSCREEN)
            return;

        const rules = (this._settings.getValue('app-rules') || []).map(r => {
            if (r && r.wmClass) {
                let copy = Object.assign({}, r);
                copy._wmClassLower = String(r.wmClass).trim().toLowerCase();
                return copy;
            }
            return r;
        });
        const wmLower = String(wmClass).toLowerCase();
        const titleLower = String(metaWindow.get_title && metaWindow.get_title() || '').toLowerCase();

        const rule = rules.find(r => {
            if (!r || !r._wmClassLower)
                return false;
            const field = (r.matchField || 'wmClass');
            switch (field) {
                case 'title':
                    return titleLower.indexOf(r._wmClassLower) !== -1;
                case 'wmClass':
                default:
                    return wmLower.indexOf(r._wmClassLower) !== -1;
            }
        });
        if (!rule)
            return;

        if (rule.firstOnly) {
            const ruleKey = rule._wmClassLower;
            if (this._firstAppliedMap.has(ruleKey))
                return;
        }

        // Capture this context for use in timeout callback
        const self = this;

        // Wait a short time so the window has been fully mapped and its frame exists
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            // Register window in firstOnly map after processing starts
            if (rule.firstOnly) {
                const ruleKey = rule._wmClassLower;
                self._firstAppliedMap.set(ruleKey, metaWindow);
            }

            if (Number.isInteger(rule.workspace) && rule.workspace >= 0) {
                if (metaWindow.change_workspace_by_index) {
                    metaWindow.change_workspace_by_index(rule.workspace, false);
                } else if (metaWindow.change_workspace) {
                    const ws = global.workspace_manager.get_workspace_by_index(rule.workspace);
                    if (ws)
                        metaWindow.change_workspace(ws);
                }

                // If firstOnly is false, enable continuous workspace enforcement
                if (!rule.firstOnly) {
                    self._managedWindows.set(metaWindow, {
                        workspace: rule.workspace,
                        wmClass: rule.wmClass
                    });

                    // Connect to workspace-changed signal for this window
                    self._signals.connect(metaWindow, 'workspace-changed',
                        self._onWindowWorkspaceChanged.bind(self, metaWindow));
                }
            }

            if (rule.maximized === true) {
                try {
                    metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
                } catch (e) {
                    global.logError(e);
                }
            } else if (rule.maximizeVertically === true && Number.isFinite(rule.width) && rule.width > 0) {
                try {
                    const x = Number.isFinite(rule.x) ? rule.x : 0;
                    const width = Math.max(1, rule.width);

                    try { metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL); } catch (e) {}
                    try { metaWindow.tile(Meta.TileMode.NONE, false); } catch (e) {}

                    if (metaWindow.move_resize_frame) {
                        const currentRect = metaWindow.get_frame_rect();
                        metaWindow.move_resize_frame(true, x, currentRect.y, width, currentRect.height);
                    }

                    metaWindow.maximize(Meta.MaximizeFlags.VERTICAL);
                } catch (e) {
                    global.logError(e);
                }
            } else {
                const hasGeom = Number.isFinite(rule.width) && rule.width > 0 && Number.isFinite(rule.height) && rule.height > 0;
                if (hasGeom) {
                    const x = Number.isFinite(rule.x) ? rule.x : 0;
                    const y = Number.isFinite(rule.y) ? rule.y : 0;
                    const width = Math.max(1, rule.width);
                    const height = Math.max(1, rule.height);

                    if (metaWindow.move_resize_frame) {
                        try { metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL); } catch (e) {}
                        try { metaWindow.tile(Meta.TileMode.NONE, false); } catch (e) {}
                        metaWindow.move_resize_frame(true, x, y, width, height);
                    }
                }
            }

            return GLib.SOURCE_REMOVE;
        });
    }


    /**
     * Handler for the `workspace-changed` signal on managed windows.
     *
     * When a window with continuous enforcement changes workspace, this moves it back
     * to its assigned workspace.
     *
     * @param {Meta.Window} metaWindow - the MetaWindow that changed workspace
     */
    _onWindowWorkspaceChanged(metaWindow) {
        try {
            if (!metaWindow)
                return;

            // Check if map still exists (extension might be disabling)
            if (!this._managedWindows)
                return;

            if (!this._managedWindows.has(metaWindow))
                return;

            const windowInfo = this._managedWindows.get(metaWindow);
            const currentWorkspace = metaWindow.get_workspace();
            const targetWorkspace = global.workspace_manager.get_workspace_by_index(windowInfo.workspace);

            // If window moved to wrong workspace, move it back
            if (currentWorkspace && targetWorkspace && currentWorkspace !== targetWorkspace) {
                try {
                    global.log('[auto-move-windows] Enforcing workspace ' + windowInfo.workspace +
                               ' for ' + windowInfo.wmClass);
                    if (metaWindow.change_workspace_by_index) {
                        metaWindow.change_workspace_by_index(windowInfo.workspace, false);
                    } else if (metaWindow.change_workspace) {
                        metaWindow.change_workspace(targetWorkspace);
                    }
                } catch (e) {
                    global.logError('[auto-move-windows] Error enforcing workspace: ' + e);
                }
            }
        } catch (e) {
            global.logError('[auto-move-windows] Error in workspace-changed handler: ' + e);
        }
    }


    /**
     * Handler for the `window-removed` signal.
     *
     * Frees any `firstOnly` locks that referenced the removed window so future windows
     * matching the same rule may be handled. Also removes continuous workspace enforcement.
     *
     * @param {object} screen - the Screen object that emitted the signal
     * @param {Meta.Window} metaWindow - the removed MetaWindow
     * @param {number} monitorIndex - monitor index where the window was removed
     */
    _onWindowRemoved(screen, metaWindow, monitorIndex) {
        try {
            if (!metaWindow)
                return;

            // Check if maps still exist (extension might be disabling)
            if (!this._firstAppliedMap || !this._managedWindows)
                return;

            // Remove from firstOnly tracking
            for (let [key, tracked] of this._firstAppliedMap) {
                if (tracked === metaWindow) {
                    this._firstAppliedMap.delete(key);
                }
            }

            // Remove from continuous enforcement tracking
            if (this._managedWindows.has(metaWindow)) {
                this._managedWindows.delete(metaWindow);
            }
        } catch (e) {
            global.logError('[auto-move-windows] Error in window-removed handler: ' + e);
        }
    }
}



function init(metadata) {
    extensionInstance = new AutoMoveWindows(metadata);
}


function enable() {
    try {
        extensionInstance.enable();
    } catch (e) {
        global.logError(e);
        disable();
        throw e;
    }
}


function disable() {
    try {
        if (extensionInstance)
            extensionInstance.disable();
    } catch (e) {
        global.logError(e);
    } finally {
        extensionInstance = null;
    }
}
