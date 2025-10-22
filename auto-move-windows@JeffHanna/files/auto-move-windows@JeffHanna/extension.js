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
 * - `firstOnly` prevents the rule from being applied to more than one window instance. The runtime tracks
 *   the first-applied MetaWindow reference and frees the lock when that window is removed.
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
    constructor(metadata) {
        this._meta = metadata;
        this._settings = null;
        this._signals = null;
        // Map wmClass -> metaWindow for rules with firstOnly=true (so we only act on the first instance)
        // NOTE: keys stored here are lowercased wmClass values (for case-insensitive matching).
        this._firstAppliedMap = new Map();
    }

    enable() {
        this._settings = new Settings.ExtensionSettings(this, this._meta.uuid);
        this._signals = new SignalManager.SignalManager(null);
        // No WindowTracker; matching will be limited to WM_CLASS or title

        // Listen for new windows
        this._signals.connect(global.screen, 'window-added', this._onWindowAdded, this);
        // Listen for window removals so we can free first-instance locks
        this._signals.connect(global.screen, 'window-removed', this._onWindowRemoved, this);

        // Optionally connect to existing windows to track removals (not strictly required)
        // and ensure map is clean if extension is enabled after windows exist.
        let windows = global.display.list_windows(0);
        for (let i = 0; i < windows.length; i++) {
            // no per-window signals needed here
        }
    }

    disable() {
        if (this._signals) {
            this._signals.disconnectAllSignals();
            this._signals = null;
        }
        if (this._settings) {
            this._settings = null;
        }
        this._firstAppliedMap.clear();
    }

    _onWindowAdded(screen, metaWindow, monitorIndex) {
        try {
            if (!metaWindow)
                return;

            // Obtain the WM_CLASS for the window. Not all windows expose this; bail out if missing.
            const wmClass = metaWindow.get_wm_class && metaWindow.get_wm_class();
            if (!wmClass)
                return;

            // Skip special windows
            const type = metaWindow.get_window_type();
            if (type === Meta.WindowType.DESKTOP || type === Meta.WindowType.DOCK || type === Meta.WindowType.SPLASHSCREEN)
                return;

            // Load rules and prepare a lowercased key for case-insensitive matching. We create
            // transient copies (shallow) so we don't mutate the stored settings.
            const rules = (this._settings.getValue('app-rules') || []).map(r => {
                if (r && r.wmClass) {
                    let copy = Object.assign({}, r);
                    // Trim whitespace and normalize to lowercase to avoid mismatch due to stray spaces
                    copy._wmClassLower = String(r.wmClass).trim().toLowerCase();
                    return copy;
                }
                return r;
            });
            const wmLower = String(wmClass).toLowerCase();
            // Compute lowercase title for title-based matching
            const titleLower = String(metaWindow.get_title && metaWindow.get_title() || '').toLowerCase();

            // Lightweight log for visibility (keep logs minimal)
            try { global.log('[auto-move-windows] Window WM_CLASS: ' + String(wmClass) + ' (normalized: ' + wmLower + ')'); } catch (e) {}
            // Match rules by chosen field: 'title' or 'wmClass' (default)
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

            // firstOnly handling: if we've already applied and the tracked window still exists, skip
            // If rule.firstOnly is set, ensure we haven't already applied this rule to another window.
            if (rule.firstOnly) {
                // Key first-instance locks by the rule's normalized substring so different rules with
                // different wmClass patterns don't conflict.
                const ruleKey = rule._wmClassLower;
                if (this._firstAppliedMap.has(ruleKey))
                    return; // skip if another instance for this rule is active
                // Mark first-instance as applied immediately to prevent race conditions
                this._firstAppliedMap.set(ruleKey, metaWindow);
            }

            // Wait a short time so the window has been fully mapped and its frame exists
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                try {
                    // If rule specifies a workspace (non-null, non-undefined, and >= 0)
                    if (Number.isInteger(rule.workspace) && rule.workspace >= 0) {
                        // Change workspace before resize/position
                        if (metaWindow.change_workspace_by_index) {
                            metaWindow.change_workspace_by_index(rule.workspace, false);
                        } else if (metaWindow.change_workspace) {
                            // fallback: get workspace object
                            const ws = global.workspace_manager.get_workspace_by_index(rule.workspace);
                            if (ws)
                                metaWindow.change_workspace(ws);
                        }
                    }

                    // Check if window should be maximized
                    if (rule.maximized === true) {
                        // Maximize the window fully (ignore x, y, width, height if present)
                        try {
                            metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
                        } catch (e) {
                            global.logError(e);
                        }
                    } else if (rule.maximizeVertically === true && Number.isFinite(rule.width)) {
                        // Maximize vertically but respect width (and x if provided)
                        try {
                            const x = Number.isFinite(rule.x) ? rule.x : 0;
                            const width = Math.max(1, rule.width);

                            // First unmaximize and untile
                            try { metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL); } catch (e) {}
                            try { metaWindow.tile(Meta.TileMode.NONE, false); } catch (e) {}

                            // Set the horizontal position and width
                            if (metaWindow.move_resize_frame) {
                                // Get current geometry to preserve y position temporarily
                                const currentRect = metaWindow.get_frame_rect();
                                metaWindow.move_resize_frame(true, x, currentRect.y, width, currentRect.height);
                            }

                            // Then maximize vertically
                            metaWindow.maximize(Meta.MaximizeFlags.VERTICAL);
                        } catch (e) {
                            global.logError(e);
                        }
                    } else {
                        // Apply geometry if provided
                        const hasGeom = Number.isFinite(rule.width) && Number.isFinite(rule.height);
                        if (hasGeom) {
                            const x = Number.isFinite(rule.x) ? rule.x : 0;
                            const y = Number.isFinite(rule.y) ? rule.y : 0;
                            const width = Math.max(1, rule.width);
                            const height = Math.max(1, rule.height);

                            // move_resize_frame is commonly available in Cinnamon extensions
                            if (metaWindow.move_resize_frame) {
                                // attempt to unmaximize/untile first so move works
                                try { metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL); } catch (e) {}
                                try { metaWindow.tile(Meta.TileMode.NONE, false); } catch (e) {}
                                metaWindow.move_resize_frame(true, x, y, width, height);
                            }
                        }
                    }
                } catch (e) {
                    global.logError(e);
                }

                return GLib.SOURCE_REMOVE;
            });
        } catch (e) {
            global.logError(e);
        }
    }

    _onWindowRemoved(screen, metaWindow, monitorIndex) {
        // If the removed window was the one we used to satisfy a firstOnly rule, free the lock
        try {
            if (!metaWindow)
                return;

            // Iterate entries and remove any that reference this metaWindow
            for (let [key, tracked] of this._firstAppliedMap) {
                if (tracked === metaWindow) {
                    this._firstAppliedMap.delete(key);
                }
            }
        } catch (e) {
            global.logError(e);
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
