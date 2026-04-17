const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const { HOVER } = require("./constants");
const { ThemeUtils } = require("./themeUtils");

/**
 * Manages hover color overrides for Cinnamon panel and popup elements using
 * GObject property notification ('notify::hover') instead of enter/leave events.
 *
 * CSS :hover loaded via St.Theme.load_stylesheet() loses against theme rules in Cinnamon
 * 6.6.7 (same priority pool, theme wins on equal specificity). Instead, we watch the
 * 'notify::hover' property on each actor: actor.hover stays true even when the pointer
 * moves into child actors, eliminating false leave/enter transitions on container widgets.
 * Inline background-color overrides with !important are applied/removed on hover state change.
 *
 * Actor hierarchy handled:
 * - Standard applets: direct applet-box child of panel zone, track_hover=true, _applet backlink
 * - Menu applet (panel-button): uses 'panel-button' CSS class, _delegate backlink (not _applet)
 * - Window list / grouped-window-list: outer actor has track_hover=false; real hover
 *   targets (window-list-item-box / grouped-window-list-item-box) are two levels deep.
 *   actor-added watcher picks up items as windows open.
 * - XApp status area: outer actor has _applet but icons are added async via D-Bus monitor.
 *   actor-added watcher on manager_container picks up XAppStatusIcon.actor children.
 * - Legacy systray: foreign X windows, no usable notify::hover — skipped intentionally.
 */
class HoverStyleManager {
    /**
     * @param {Object} extension - Main extension instance (CSSPanelsExtension)
     */
    constructor(extension) {
        this.extension = extension;
        this._connections = [];
    }

    /**
     * Enable hover styling: attach event hooks to all panel applets.
     * Must be called after panelStyler.safeEnable() so applet actors are in the tree.
     */
    enable() {
        this.extension.debugLog("HoverStyleManager: enabling");
        try {
            this._attachPanelHooks();
        } catch (e) {
            this.extension.debugLog("HoverStyleManager: error in enable: " + e.message + "\n" + e.stack);
        }
    }

    /**
     * Disable hover styling: disconnect all event handlers and restore original inline styles.
     */
    disable() {
        this.extension.debugLog("HoverStyleManager: disabling, removing " + this._connections.length + " connections");
        for (const conn of this._connections) {
            try {
                if (conn.actor && conn.addedId) conn.actor.disconnect(conn.addedId);
                if (conn.actor && conn.removedId) conn.actor.disconnect(conn.removedId);
                if (conn.actor && conn.hoverId) conn.actor.disconnect(conn.hoverId);
                if (conn.actor && conn.pressId) conn.actor.disconnect(conn.pressId);
                if (conn.actor && conn.releaseId) conn.actor.disconnect(conn.releaseId);
                if (conn.actor && conn.pseudoId) conn.actor.disconnect(conn.pseudoId);
                if (!conn.isContainerWatch && conn.actor && conn.baseStyle !== undefined) {
                    conn.actor.set_style(conn.baseStyle || null);
                }
            } catch (e) {
                this.extension.debugLog("HoverStyleManager: error disconnecting: " + e.message);
            }
        }
        this._connections = [];
    }

    /**
     * Refresh hover hooks when panel color or settings change.
     */
    refresh() {
        this.extension.debugLog("HoverStyleManager: refreshing");
        this.disable();
        this.enable();
    }

    /**
     * Attach notify::hover listeners to all panel applet boxes.
     *
     * Routing per zone child:
     * - Window-list containers: recurse to find item-box actors + actor-added watcher
     * - XApp status containers: actor-added watcher on manager_container for async icon load
     * - Standard applets (applet-box or _applet): hook outer actor directly
     * - Panel-button actors (_delegate): hook directly (menu@cinnamon.org)
     */
    _attachPanelHooks() {
        const panels = this._getAllPanels();
        let hookCount = 0;

        for (const panel of panels) {
            const zones = [panel._leftBox, panel._centerBox, panel._rightBox].filter(Boolean);

            // Watch for applets added after enable() (e.g. menu@cinnamon.org loads late)
            for (const zone of zones) {
                const addedId = zone.connect('actor-added', (container, newActor) => {
                    this._processZoneChild(newActor);
                });
                this._connections.push({ actor: zone, addedId, removedId: null, hoverId: null, baseStyle: null, isContainerWatch: true });
            }

            for (const zone of zones) {
                const children = zone.get_children ? zone.get_children() : [];
                for (const child of children) {
                    hookCount += this._processZoneChild(child);
                }
            }
        }

        this.extension.debugLog("HoverStyleManager: hooked " + hookCount + " panel applet actors");
    }

    /**
     * Process a single direct child of a panel zone.
     * Routes to the appropriate hook strategy based on actor type.
     *
     * @param {St.Widget} child - Direct child of a panel zone box
     * @returns {number} Number of actors hooked
     */
    _processZoneChild(child) {
        if (!child) return 0;

        if (this._isWindowListContainer(child)) {
            return this._hookWindowListContainer(child);
        }

        if (this._isXAppStatusContainer(child)) {
            return this._hookXAppStatusContainer(child);
        }

        if (this._isAppletActor(child)) {
            this._hookActor(child);
            return 1;
        }

        return 0;
    }

    /**
     * Check if actor is a window-list or grouped-window-list container.
     * These replace the applet-box class name and set track_hover=false on the outer actor.
     *
     * @param {St.Widget} actor
     * @returns {boolean}
     */
    _isWindowListContainer(actor) {
        if (!actor) return false;
        return actor.has_style_class_name && (
            actor.has_style_class_name('grouped-window-list-box') ||
            actor.has_style_class_name('window-list-box')
        );
    }

    /**
     * Check if actor is the xapp-status container applet.
     * CinnamonXAppStatusApplet removes 'applet-box' from its outer actor and adds
     * XAppStatusIcon children asynchronously via D-Bus monitor after construction.
     *
     * @param {St.Widget} actor
     * @returns {boolean}
     */
    _isXAppStatusContainer(actor) {
        if (!actor || !actor.get_style_class_name) return false;
        const cls = actor.get_style_class_name() || '';
        return cls.includes('xapp-status-cinnamon-org-applet');
    }

    /**
     * Check if an actor is a hookable panel applet actor.
     * Accepts: applet-box class, _applet backlink, or _delegate backlink (menu applet uses panel-button class).
     *
     * @param {St.Widget} actor - Actor to test
     * @returns {boolean} True if actor is a hookable applet actor
     */
    _isAppletActor(actor) {
        if (!actor) return false;
        if (actor._applet) return true;
        if (actor._delegate) return true;
        return actor.has_style_class_name && actor.has_style_class_name('applet-box');
    }

    /**
     * Hook all currently-present XAppStatusIcon children and watch for async additions.
     * XApp icons are added dynamically via D-Bus after applet construction, so we must
     * watch actor-added on the manager_container to catch them.
     *
     * @param {St.Widget} outerActor - The xapp-status outer applet actor
     * @returns {number} Number of icon actors hooked immediately
     */
    _hookXAppStatusContainer(outerActor) {
        let count = 0;

        const managerContainer = this._findManagerContainer(outerActor);
        if (!managerContainer) {
            this.extension.debugLog("HoverStyleManager: xapp-status: no manager_container found");
            return 0;
        }

        const hookIfXAppIcon = (actor) => {
            if (actor && actor.has_style_class_name &&
                actor.has_style_class_name('applet-box') &&
                actor.get_track_hover && actor.get_track_hover()) {
                this._hookActor(actor);
                count++;
            }
        };

        const children = managerContainer.get_children ? managerContainer.get_children() : [];
        for (const child of children) {
            hookIfXAppIcon(child);
        }

        const addedId = managerContainer.connect('actor-added', (container, newActor) => {
            hookIfXAppIcon(newActor);
        });

        const removedId = managerContainer.connect('actor-removed', (container, removedActor) => {
            this._unhookActor(removedActor);
        });

        this._connections.push({ actor: managerContainer, addedId, removedId, hoverId: null, baseStyle: null, isContainerWatch: true });

        return count;
    }

    /**
     * Find the manager_container child of an xapp-status outer actor.
     * The outer actor contains exactly one St.BoxLayout manager_container.
     *
     * @param {St.Widget} outerActor
     * @returns {St.Widget|null}
     */
    _findManagerContainer(outerActor) {
        if (!outerActor || !outerActor.get_children) return null;
        const children = outerActor.get_children();
        for (const child of children) {
            const type = child.get_theme_node ? child.constructor.name : null;
            if (child.get_children) return child;
        }
        return null;
    }

    /**
     * Hook individual item children of a window-list or grouped-window-list container.
     * Item actors are two levels deep (container -> workspace/manager -> item-box).
     * Watches actor-added on the container to hook items as windows open/close.
     *
     * @param {St.Widget} containerActor - The window-list-box or grouped-window-list-box actor
     * @returns {number} Number of item actors hooked
     */
    _hookWindowListContainer(containerActor) {
        let count = 0;

        const recurseForItems = (actor, depth) => {
            if (depth > 3 || !actor) return;
            if (this._isWindowListItem(actor)) {
                this._hookActor(actor);
                count++;
                return;
            }
            const children = actor.get_children ? actor.get_children() : [];
            for (const child of children) {
                recurseForItems(child, depth + 1);
            }
        };

        const children = containerActor.get_children ? containerActor.get_children() : [];
        for (const child of children) {
            recurseForItems(child, 0);
        }

        const addedId = containerActor.connect('actor-added', (container, newActor) => {
            // Recurse to catch items at any nesting level, same as initial traversal
            recurseForItems(newActor, 0);
        });

        const removedId = containerActor.connect('actor-removed', (container, removedActor) => {
            this._unhookActor(removedActor);
        });

        this._connections.push({ actor: containerActor, addedId, removedId, hoverId: null, baseStyle: null, isContainerWatch: true });

        return count;
    }

    /**
     * Check if actor is an individual window list item button.
     *
     * @param {St.Widget} actor
     * @returns {boolean}
     */
    _isWindowListItem(actor) {
        if (!actor) return false;
        return actor.has_style_class_name && (
            actor.has_style_class_name('grouped-window-list-item-box') ||
            actor.has_style_class_name('window-list-item-box')
        );
    }

    /**
     * Disconnect hover hooks from a specific actor and restore its base style.
     * Used when a window closes and its button actor is removed from the tree.
     *
     * @param {St.Widget} actor - Actor to unhook
     */
    _unhookActor(actor) {
        const idx = this._connections.findIndex(c => c.actor === actor && !c.isContainerWatch);
        if (idx === -1) return;
        const conn = this._connections[idx];
        try {
            if (conn.hoverId) actor.disconnect(conn.hoverId);
            if (conn.pressId) actor.disconnect(conn.pressId);
            if (conn.releaseId) actor.disconnect(conn.releaseId);
            if (conn.baseStyle !== undefined) actor.set_style(conn.baseStyle || null);
        } catch (e) {
            this.extension.debugLog("HoverStyleManager: error unhooking actor: " + e.message);
        }
        this._connections.splice(idx, 1);
    }

    /**
     * Hook popup menu items when a popup menu opens.
     * Called externally by popupStyler after menu actors are created.
     * Also recurses into popup-sub-menu containers for dropdown items.
     *
     * @param {St.Widget} menuActor - The popup menu's main actor
     */
    hookPopupMenu(menuActor) {
        if (!menuActor) return;
        this._hookMenuItemsInActor(menuActor, 0, menuActor);
    }

    /**
     * Reset the active (checked) visual state of the actor that opened a popup menu.
     * Called by PopupStyler when a menu closes so the applet button returns to its base style.
     * Deferred to idle to let Cinnamon finish removing the 'checked' pseudo-class first.
     *
     * @param {St.Widget} actor - The sourceActor (applet button) that triggered the menu
     */
    resetActorActiveState(actor) {
        if (!actor) return;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            try {
                const conn = this._connections.find(c => c.actor === actor && !c.isContainerWatch);
                if (conn && !actor.hover) {
                    actor.set_style(conn.baseStyle || null);
                }
            } catch (e) {
                this.extension.debugLog("HoverStyleManager: resetActorActiveState error: " + e.message);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Disconnect hover hooks from all popup-menu-item actors within a menu.
     * Called by PopupStyler when a menu closes.
     * Also cleans up any ScrollView container watchers registered for this menu.
     *
     * @param {St.Widget} menuActor - The popup menu's main actor
     */
    unhookPopupMenu(menuActor) {
        if (!menuActor) return;
        this._unhookMenuItemsInActor(menuActor, 0);
        const toRemove = this._connections.filter(c => c.isContainerWatch && c.menuActor === menuActor);
        for (const conn of toRemove) {
            try {
                if (conn.addedId) conn.actor.disconnect(conn.addedId);
            } catch (e) {
                this.extension.debugLog("HoverStyleManager: error disconnecting ScrollView watcher: " + e.message);
            }
        }
        this._connections = this._connections.filter(c => !(c.isContainerWatch && c.menuActor === menuActor));
    }

    /**
     * Recursively find and hook popup-menu-item actors within a container.
     * Descends into popup-sub-menu containers to hook dropdown items as well.
     *
     * @param {St.Widget} actor - Container actor to search
     * @param {number} depth - Current recursion depth
     * @param {St.Widget} [menuActor] - Root menu actor (used to tag container watchers for cleanup)
     */
    _hookMenuItemsInActor(actor, depth, menuActor) {
        if (depth > 8 || !actor) return;
        if (actor.has_style_class_name && actor.has_style_class_name('popup-menu-item')) {
            this._hookActor(actor, true);
            const children = actor.get_children ? actor.get_children() : [];
            for (const child of children) {
                this._hookMenuItemsInActor(child, depth + 1, menuActor);
            }
            return;
        }
        // St.ScrollView (popup-sub-menu) wraps content via get_child() bin, not get_children()
        if (actor.has_style_class_name && actor.has_style_class_name('popup-sub-menu')) {
            this._traverseScrollViewContent(actor, depth, menuActor);
            return;
        }
        const children = actor.get_children ? actor.get_children() : [];
        for (const child of children) {
            this._hookMenuItemsInActor(child, depth + 1, menuActor);
        }
    }

    /**
     * Traverse St.ScrollView content to reach popup-menu-item actors.
     * ScrollView exposes content via get_child() (bin) → get_child() (box), not get_children().
     * Registers an actor-added watcher tagged with menuActor for cleanup on menu close.
     *
     * @param {St.ScrollView} scrollView - The popup-sub-menu ScrollView actor
     * @param {number} depth - Current recursion depth
     * @param {St.Widget} [menuActor] - Root menu actor (used to tag watcher for cleanup)
     */
    _traverseScrollViewContent(scrollView, depth, menuActor) {
        try {
            const bin = scrollView.get_child ? scrollView.get_child() : null;
            if (!bin) return;
            const box = bin.get_child ? bin.get_child() : null;
            const container = box || bin;
            const children = container.get_children ? container.get_children() : [];
            for (const child of children) {
                this._hookMenuItemsInActor(child, depth + 1, menuActor);
            }
            // Watch for items added after initial traversal; tagged with menuActor for cleanup
            const addedId = container.connect('actor-added', (c, newActor) => {
                this._hookMenuItemsInActor(newActor, depth + 1, menuActor);
            });
            this._connections.push({ actor: container, addedId, removedId: null, hoverId: null, baseStyle: null, isContainerWatch: true, menuActor: menuActor || null });
        } catch (e) {
            this.extension.debugLog("HoverStyleManager: ScrollView traversal error: " + e.message);
        }
    }

    /**
     * Recursively find and unhook popup-menu-item actors within a container.
     *
     * @param {St.Widget} actor - Container actor to search
     * @param {number} depth - Current recursion depth
     */
    _unhookMenuItemsInActor(actor, depth) {
        if (depth > 8 || !actor) return;
        if (actor.has_style_class_name && actor.has_style_class_name('popup-menu-item')) {
            this._unhookActor(actor);
        }
        const children = actor.get_children ? actor.get_children() : [];
        for (const child of children) {
            this._unhookMenuItemsInActor(child, depth + 1);
        }
    }

    /**
     * Attach hover/active listeners to a single actor for hover color override.
     * Saves current inline style as baseline so it is restored when hover ends.
     * Watches 'notify::style-pseudo-class' to detect when applet popup closes
     * ('checked' pseudo-class removed by Cinnamon) and restore base style.
     * No-ops if this actor is already hooked (prevents duplicate signals on refresh).
     *
     * @param {St.Widget} actor - Actor to hook
     * @param {boolean} [isMenuItem=false] - True if actor is a popup menu item
     */
    _hookActor(actor, isMenuItem = false) {
        // Guard: skip if already hooked to prevent duplicate signal connections on refresh
        if (this._connections.some(c => c.actor === actor && !c.isContainerWatch)) {
            return;
        }

        const baseStyle = actor.get_style ? (actor.get_style() || null) : null;

        /** Returns true if the applet's popup is currently open (Cinnamon sets 'checked'). */
        const isChecked = () => !!(actor.has_style_pseudo_class && actor.has_style_pseudo_class('checked'));

        const hoverHandler = () => {
            try {
                if (actor.hover) {
                    actor.set_style(this._mergeHoverStyle(baseStyle || '', this._getHoverColor(isMenuItem)));
                } else if (!isChecked()) {
                    actor.set_style(baseStyle);
                }
            } catch (e) {
                this.extension.debugLog("HoverStyleManager: hover handler error: " + e.message);
            }
        };

        const pressHandler = () => {
            try {
                actor.set_style(this._mergeHoverStyle(baseStyle || '', this._getActiveColor(isMenuItem)));
            } catch (e) {
                this.extension.debugLog("HoverStyleManager: press handler error: " + e.message);
            }
        };

        const releaseHandler = () => {
            try {
                if (actor.hover || isChecked()) {
                    actor.set_style(this._mergeHoverStyle(baseStyle || '', this._getHoverColor(isMenuItem)));
                } else {
                    actor.set_style(baseStyle);
                }
            } catch (e) {
                this.extension.debugLog("HoverStyleManager: release handler error: " + e.message);
            }
        };

        // Fires when Cinnamon adds/removes 'checked' pseudo-class (applet popup open/close).
        // Deferred to idle to ensure Cinnamon has finished updating pseudo-class state.
        const pseudoHandler = () => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                try {
                    if (!actor.hover && !isChecked()) {
                        actor.set_style(baseStyle);
                    }
                } catch (e) {
                    this.extension.debugLog("HoverStyleManager: pseudo handler error: " + e.message);
                }
                return GLib.SOURCE_REMOVE;
            });
        };

        const hoverId = actor.connect('notify::hover', hoverHandler);
        const pressId = actor.connect('button-press-event', pressHandler);
        const releaseId = actor.connect('button-release-event', releaseHandler);
        const pseudoId = actor.connect('notify::style-pseudo-class', pseudoHandler);

        this._connections.push({ actor, hoverId, pressId, releaseId, pseudoId, baseStyle, isContainerWatch: false });
    }

    /**
     * Inject background-color into an existing inline style string,
     * replacing any existing background-color declaration.
     *
     * @param {string} existingStyle - Current inline style string
     * @param {string} hoverColor - CSS color value to apply
     * @returns {string} New inline style string with hover color applied
     */
    _mergeHoverStyle(existingStyle, hoverColor) {
        const cleaned = existingStyle.replace(/background-color\s*:[^;]+;?/g, '').trim();
        const sep = cleaned.length > 0 && !cleaned.endsWith(';') ? '; ' : (cleaned.length > 0 ? ' ' : '');
        return cleaned + sep + "background-color: " + hoverColor + " !important;";
    }

    /**
     * Get the hover color derived from the current panel base color.
     * For menu items the base color alpha is ignored so the highlight is computed
     * from the RGB components only, producing a visible contrast on dark backgrounds.
     *
     * @param {boolean} isMenuItem - Whether the color is for a popup menu item
     * @returns {string} CSS rgba() color string
     */
    _getHoverColor(isMenuItem) {
        const bgColor = isMenuItem
            ? this.extension.themeDetector.getEffectivePopupColor()
            : this.extension.themeDetector.getPanelBaseColor();
        // For menu items strip the alpha so highlight is computed on opaque RGB only.
        // Panel base colors often have low alpha (e.g. rgba(2,18,33,0.3)) which causes
        // the auto-highlight algorithm to produce a nearly transparent result.
        const r = bgColor.r;
        const g = bgColor.g;
        const b = bgColor.b;
        const highlightRgb = ThemeUtils.getAutoHighlightColor(
            [r, g, b],
            isMenuItem ? HOVER.HOVER_INTENSITY * 1.5 : HOVER.HOVER_INTENSITY
        );
        return ThemeUtils.rgbaToCss(highlightRgb[0], highlightRgb[1], highlightRgb[2], HOVER.HOVER_ALPHA);
    }

    /**
     * Get the active (click) color, more intense than hover color.
     *
     * @param {boolean} isMenuItem - Whether the color is for a popup menu item
     * @returns {string} CSS rgba() color string
     */
    _getActiveColor(isMenuItem) {
        const bgColor = isMenuItem
            ? this.extension.themeDetector.getEffectivePopupColor()
            : this.extension.themeDetector.getPanelBaseColor();
        const highlightRgb = ThemeUtils.getAutoHighlightColor(
            [bgColor.r, bgColor.g, bgColor.b],
            HOVER.ACTIVE_INTENSITY
        );
        return ThemeUtils.rgbaToCss(highlightRgb[0], highlightRgb[1], highlightRgb[2], HOVER.HOVER_ALPHA);
    }

    /**
     * Get all active Cinnamon panels.
     *
     * @returns {Array} Array of panel objects
     */
    _getAllPanels() {
        const panels = [];
        if (Main.panel && Main.panel.actor) panels.push(Main.panel);
        if (Main.panel2 && Main.panel2.actor) panels.push(Main.panel2);
        return panels;
    }
}

module.exports = HoverStyleManager;
