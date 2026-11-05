// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;

const DND = imports.ui.dnd;
const Extension = imports.ui.extension;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;

const Me = Extension.getCurrentExtension();
const { MenuFactory } = Me.imports.menu;

const HOVER_SCALE = 1.12;
const HOVER_TIME = 140;

/**
 * A single application button inside the dock.
 *
 * The actor is a St.Bin so the whole button (icon + indicator) can carry a
 * hover background, and its _delegate is this object so Cinnamon's drag and
 * drop code can find handleDragOver()/acceptDrop().
 */
var AppIcon = class AppIcon {
    constructor(params) {
        this.controller = params.controller;
        this.app = params.app;
        this.id = params.id;

        this.windows = [];
        this.isFavorite = false;
        this.lastFocused = null;

        this._size = 0;
        this._iconActor = null;
        this._tooltip = null;
        this._menu = null;
        this._hovered = false;
        this._dragHover = false;
        this._indicatorKey = null;

        this.actor = new St.Bin({
            name: 'auraDockIcon',
            style_class: 'aura-dock-icon',
            reactive: true,
            track_hover: true,
            can_focus: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });
        this.actor._delegate = this;

        this._box = new St.BoxLayout({ style_class: 'aura-dock-icon-box' });
        this.actor.set_child(this._box);

        this._iconBin = new St.Bin({
            style_class: 'aura-dock-icon-image',
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });

        this._indicator = new St.BoxLayout({ style_class: 'aura-dock-indicator' });

        this._applyOrientation();

        this.actor.connect('button-release-event', (actor, event) => this._onButtonRelease(actor, event));
        this.actor.connect('scroll-event', (actor, event) => this._onScroll(actor, event));
        this.actor.connect('notify::hover', () => this._onHoverChanged());

        this._draggable = DND.makeDraggable(this.actor, {}, null);
        this._draggable.connect('drag-end', () => this._onDragEnd());
    }

    /* Layout **************************************************************/

    // The dock's main box is horizontal for top/bottom and vertical for
    // left/right. The icon box is always perpendicular to it so the running
    // indicator ends up between the icon and the screen edge.
    _applyOrientation() {
        const dockVertical = this.controller.vertical;
        const before = this.controller.position === 'top' || this.controller.position === 'right';

        if (this._iconBin.get_parent() === this._box)
            this._box.remove_child(this._iconBin);
        if (this._indicator.get_parent() === this._box)
            this._box.remove_child(this._indicator);

        this._box.set_vertical(!dockVertical);
        this._indicator.set_vertical(dockVertical);

        // The indicator is a thin bar that spans the whole icon, split into
        // one segment per open window.
        this._indicator.x_expand = !dockVertical;
        this._indicator.y_expand = dockVertical;

        if (before) {
            this._box.add_child(this._indicator);
            this._box.add_child(this._iconBin);
        } else {
            this._box.add_child(this._iconBin);
            this._box.add_child(this._indicator);
        }

        for (const child of this._indicator.get_children()) {
            child.x_expand = !dockVertical;
            child.y_expand = dockVertical;
        }

        this._indicatorKey = null;
        this._updateIndicator();
    }

    /* Model ***************************************************************/

    update(params) {
        this.app = params.app;
        this.windows = params.windows;
        this.isFavorite = params.isFavorite;

        const focused = this.windows.find(w => w.appears_focused);
        if (focused)
            this.lastFocused = focused;
        else if (this.lastFocused && this.windows.indexOf(this.lastFocused) === -1)
            this.lastFocused = this.windows.length ? this.windows[0] : null;

        this._updateIcon();
        this._updateIndicator();
        this._updateStyle();
        this._updateTooltip();

        if (this._menu)
            this._menu.iconChanged();
    }

    _updateIcon() {
        const size = Math.round(this.controller.iconSize);
        if (this._size === size && this._iconActor)
            return;

        this._size = size;

        if (this._iconActor) {
            this._iconActor.destroy();
            this._iconActor = null;
        }

        try {
            this._iconActor = this.app.create_icon_texture(size);
        } catch (e) {
            this._iconActor = new St.Icon({
                icon_name: 'application-x-executable',
                icon_size: size
            });
        }

        this._iconBin.set_child(this._iconActor);
    }

    _updateIndicator() {
        const count = this.windows.length;
        const focused = this.windows.some(w => w.appears_focused);
        const key = `${count}:${focused ? 1 : 0}`;

        if (key === this._indicatorKey)
            return;
        this._indicatorKey = key;

        this._indicator.destroy_all_children();

        const scale = this.controller.scale;
        const segments = Math.min(Math.max(count, 0), 4);
        const gap = Math.max(1, Math.round(2 * scale));

        this._indicator.spacing = gap;

        const dockVertical = this.controller.vertical;
        const accent = this.controller.accentColor || '#92b372';
        for (let i = 0; i < segments; i++) {
            const seg = new St.Widget({
                style_class: focused ? 'aura-dock-indicator-segment focused' : 'aura-dock-indicator-segment',
                x_expand: !dockVertical,
                y_expand: dockVertical
            });
            seg.set_style('background-color: ' + accent + ';');
            seg.opacity = focused ? 255 : 140;
            this._indicator.add_child(seg);
        }

        this._indicator.visible = segments > 0;
    }

    _updateStyle() {
        const focused = this.windows.some(w => w.appears_focused);
        this._toggleClass('running', this.windows.length > 0);
        this._toggleClass('focused', focused);
        this._toggleClass('favorite', this.isFavorite);
    }

    _toggleClass(name, enabled) {
        const has = this.actor.has_style_class_name(name);
        if (enabled && !has)
            this.actor.add_style_class_name(name);
        else if (!enabled && has)
            this.actor.remove_style_class_name(name);
    }

    _updateTooltip() {
        if (!this.controller.showTooltips) {
            this._destroyTooltip();
            return;
        }

        const name = this.app.get_name();
        if (!this._tooltip) {
            this._tooltip = new Tooltips.Tooltip(this.actor, name);
            // Reduce the theme's oversized padding and anchor the tooltip to
            // the icon instead of the mouse cursor, so it never runs off the
            // screen edge.
            this._tooltip._tooltip.set_style('padding: 4px 8px;');
            const tooltip = this._tooltip;
            const icon = this.actor;
            const controller = this.controller;
            tooltip.show = function() {
                if (tooltip._tooltip.get_text() == "" || !tooltip.mousePosition)
                    return;

                tooltip._tooltip.set_size(-1, -1);
                tooltip._tooltip.show();
                let [minW, minH, prefW, prefH] = tooltip._tooltip.get_preferred_size();
                let tooltipWidth = prefW > 0 ? prefW : (tooltip._tooltip.width || 100);
                let tooltipHeight = prefH > 0 ? prefH : (tooltip._tooltip.height || 20);

                let monitor = Main.layoutManager.findMonitorForActor(icon);
                let iconPos = icon.get_transformed_position();
                let iconW = icon.width;
                let iconH = icon.height;

                let tooltipLeft = iconPos[0] + (iconW - tooltipWidth) / 2;
                let tooltipTop;
                if (controller.position === 'top')
                    tooltipTop = iconPos[1] + iconH + 6;
                else
                    tooltipTop = iconPos[1] - tooltipHeight - 6;

                tooltipLeft = Math.max(tooltipLeft, monitor.x + 4);
                tooltipLeft = Math.min(tooltipLeft, monitor.x + monitor.width - tooltipWidth - 4);
                if (tooltipTop < monitor.y + 4)
                    tooltipTop = monitor.y + 4;
                if (tooltipTop + tooltipHeight > monitor.y + monitor.height - 4)
                    tooltipTop = monitor.y + monitor.height - tooltipHeight - 4;

                tooltip._tooltip.set_position(tooltipLeft, tooltipTop);
                tooltip._tooltip.raise_top();
                tooltip.visible = true;
            };
        } else {
            this._tooltip.set_text(name);
        }
    }

    _destroyTooltip() {
        if (!this._tooltip)
            return;
        try {
            this._tooltip.destroy();
        } catch (e) {
            // Older Cinnamon builds have no destroy() on Tooltip.
        }
        this._tooltip = null;
    }

    /* Interaction *********************************************************/

    _onHoverChanged() {
        const hovered = this.actor.hover;
        if (hovered === this._hovered)
            return;
        this._hovered = hovered;

        if (!this.controller.animateHover)
            return;

        this._iconBin.set_pivot_point(0.5, 0.5);
        const scale = hovered ? HOVER_SCALE : 1.0;
        this._iconBin.ease({
            scale_x: scale,
            scale_y: scale,
            duration: HOVER_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }

    _onButtonRelease(actor, event) {
        const button = event.get_button();

        if (button === 1) {
            this.activate();
            return Clutter.EVENT_STOP;
        }

        if (button === 2) {
            if (this.controller.middleClickAction === 'new-window')
                this.launch();
            return Clutter.EVENT_STOP;
        }

        if (button === 3) {
            // Shift + right click opens the dock settings menu (works anywhere,
            // including on top of an application icon).
            if (event.get_state() & Clutter.ModifierType.SHIFT_MASK) {
                this.controller._dockMenu.toggle();
            } else {
                this._ensureMenu().toggle();
            }
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onScroll(actor, event) {
        if (this.windows.length < 2)
            return Clutter.EVENT_PROPAGATE;

        const direction = event.get_scroll_direction();
        if (direction !== Clutter.ScrollDirection.UP && direction !== Clutter.ScrollDirection.DOWN)
            return Clutter.EVENT_PROPAGATE;

        this.controller.cycleWindows(this, direction === Clutter.ScrollDirection.DOWN ? 1 : -1);
        return Clutter.EVENT_STOP;
    }

    activate() {
        const windows = this.windows;

        if (windows.length === 0) {
            this.launch();
            return;
        }

        // Preview mode: show thumbnails instead of activating/minimizing,
        // but only when there is more than one window to choose from.
        if (this.controller.clickAction === 'preview' && windows.length > 1) {
            this._ensureMenu().toggle();
            return;
        }

        const focused = windows.find(w => w.appears_focused);

        if (!focused) {
            this.controller.activateWindow(this._preferredWindow());
            return;
        }

        if (windows.length > 1 && this.controller.clickAction === 'cycle')
            this.controller.cycleWindows(this, 1);
        else
            windows.forEach(w => { if (!w.minimized) w.minimize(); });
    }

    launch() {
        try {
            this.app.open_new_window(-1);
        } catch (e) {
            logError(e, `Aura Dock: could not launch ${this.id}`);
            return;
        }

        // Bounce animation to acknowledge the launch.
        if (!this.controller.animateHover)
            return;

        this._iconBin.set_pivot_point(0.5, 0.5);
        const baseScale = this._hovered ? HOVER_SCALE : 1.0;
        this._iconBin.ease({
            scale_x: 1.35,
            scale_y: 1.35,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._iconBin.ease({
                    scale_x: baseScale,
                    scale_y: baseScale,
                    duration: 180,
                    mode: Clutter.AnimationMode.EASE_IN_QUAD
                });
            }
        });
    }

    _preferredWindow() {
        if (this.lastFocused && this.windows.indexOf(this.lastFocused) !== -1)
            return this.lastFocused;
        return this.windows[0];
    }

    ensureMenuVisible() {
        return this._menu && this._menu.isOpen;
    }

    _ensureMenu() {
        if (!this._menu) {
            this._menu = MenuFactory.createAppMenu(this);
            this.controller.menuManager.addMenu(this._menu);

            this._menu.connect('open-state-changed', (menu, open) => {
                if (open)
                    this.controller._menusOpen++;
                else
                    this.controller._menusOpen = Math.max(0, this.controller._menusOpen - 1);
                this.controller._queueAutohideCheck();
            });
        }
        return this._menu;
    }

    /* Drag and drop *******************************************************/

    getDragActor() {
        try {
            return this.app.create_icon_texture(this._size || 48);
        } catch (e) {
            return new St.Icon({ icon_name: 'application-x-executable', icon_size: this._size || 48 });
        }
    }

    getDragActorSource() {
        return this.actor;
    }

    handleDragOver(source, dragActor, x, y, time) {
        // Accept applications dragged in from the Cinnamon menu (or any other
        // draggable application source) so they can be pinned to the dock.
        if (!(source instanceof AppIcon)) {
            if (source && source.isDraggableApp && source.app) {
                this._dragHover = true;
                this.actor.add_style_pseudo_class('drop');
                this.controller._showDragPlaceholder();
                return DND.DragMotionResult.COPY_DROP;
            }
            return DND.DragMotionResult.CONTINUE;
        }
        if (source === this)
            return DND.DragMotionResult.CONTINUE;
        if (source.controller !== this.controller || !source.isFavorite)
            return DND.DragMotionResult.CONTINUE;

        if (!this._dragHover) {
            this._dragHover = true;
            this.actor.add_style_pseudo_class('drop');
        }

        return DND.DragMotionResult.MOVE_DROP;
    }

    handleDragOut() {
        if (!this._dragHover)
            return;
        this._dragHover = false;
        this.actor.remove_style_pseudo_class('drop');
    }

    acceptDrop(source, dragActor, x, y, time) {
        this.handleDragOut();

        // Pin an application dragged in from outside the dock.
        if (!(source instanceof AppIcon)) {
            if (source && source.isDraggableApp && source.app) {
                const id = source.app.get_id();
                const favorites = AppFavorites.getAppFavorites();
                if (id && !favorites.isFavorite(id)) {
                    let pos = -1;
                    if (this.isFavorite) {
                        const favs = favorites.getFavorites();
                        pos = favs.indexOf(this.id);
                        if (pos < 0)
                            pos = -1;
                    }
                    favorites.addFavoriteAtPos(id, pos);
                } else if (id && favorites.isFavorite(id) && this.isFavorite) {
                    const favs = favorites.getFavorites();
                    const pos = favs.indexOf(this.id);
                    if (pos >= 0)
                        favorites.moveFavoriteToPos(id, pos);
                }
                this.controller._hideDragPlaceholder();
                return true;
            }
            return false;
        }

        if (source === this)
            return false;

        this.controller.reorderFavorites(source.id, this.id);
        return true;
    }

    _onDragEnd() {
        this.handleDragOut();
    }

    /* Teardown ************************************************************/

    destroy() {
        this._destroyTooltip();

        if (this._menu) {
            try {
                this.controller.menuManager.removeMenu(this._menu);
            } catch (e) {
                // The manager may already be gone during shutdown.
            }
            this._menu.destroy();
            this._menu = null;
        }

        this._draggable = null;
        this.actor.destroy();
    }
};
