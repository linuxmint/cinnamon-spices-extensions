// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const GLib = imports.gi.GLib;

const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const WindowUtils = imports.misc.windowUtils;

const ICON_SIZES = [32, 40, 48, 56, 64, 72, 80, 96];
const MAX_TITLE = 48;

function shorten(text) {
    if (!text)
        return '';
    return text.length > MAX_TITLE ? `${text.substr(0, MAX_TITLE - 1)}…` : text;
}

function addSeparator(menu) {
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
}

function addHeader(menu, text) {
    const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
    item.actor.add_style_class_name('aura-dock-menu-header');
    menu.addMenuItem(item);
    return item;
}

/**
 * Shared base for the dock popup menus.
 *
 * Cinnamon anchors bottom menus to the screen edge, which is right for panel
 * menus but wrong for a floating dock; the menu would cover the dock. This
 * override attaches the menu to the dock actor itself, on the side facing the
 * screen interior.
 */
var DockPopupMenu = class DockPopupMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, controller) {
        super(sourceActor, controller.arrowSide);
        this.controller = controller;
        this._repositionId = 0;

        // Cinnamon 6 does not parent popup menus anywhere by itself.
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
    }

    /**
     * Menu contents can change height after Cinnamon has positioned the menu
     * (inline submenus expanding, a window list being rebuilt on open), and the
     * built-in allocation handler sometimes repositions with a stale preferred
     * size. Nudge the menu once the new layout has settled so it keeps hugging
     * the dock instead of covering it.
     */
    _repositionSoon() {
        if (this._repositionId)
            return;

        this._repositionId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
            this._repositionId = 0;
            if (this.isOpen) {
                const [xPos, yPos] = this._calculatePosition();
                this.actor.set_position(xPos, yPos);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._repositionId) {
            GLib.source_remove(this._repositionId);
            this._repositionId = 0;
        }
        super.destroy();
    }

    _calculatePosition() {
        if (!this.actor.visible)
            this.box.show();

        const sourceBox = Cinnamon.util_get_transformed_allocation(this.sourceActor);
        const [, , natWidth, natHeight] = this.actor.get_preferred_size();
        const monitor = Main.layoutManager.findMonitorForActor(this.sourceActor);
        const x1 = monitor.x;
        const x2 = x1 + monitor.width;
        const y1 = monitor.y;
        const y2 = y1 + monitor.height;

        const position = this.controller.position;
        let xPos, yPos;

        if (position === 'top' || position === 'bottom') {
            xPos = sourceBox.x1 + (sourceBox.x2 - sourceBox.x1) / 2 - natWidth / 2;

            if (position === 'bottom') {
                // Dock at the bottom: open upwards, out of the dock.
                this.sideFlipped = true;
                yPos = sourceBox.y1 - natHeight;
                if (yPos < y1) {
                    this.sideFlipped = false;
                    yPos = sourceBox.y2;
                }
            } else {
                // Dock at the top: open downwards.
                this.sideFlipped = false;
                yPos = sourceBox.y2;
                if (yPos + natHeight > y2) {
                    this.sideFlipped = true;
                    yPos = sourceBox.y1 - natHeight;
                }
            }
        } else {
            yPos = sourceBox.y1 + (sourceBox.y2 - sourceBox.y1) / 2 - natHeight / 2;

            if (position === 'right') {
                // Dock on the right: open towards the left.
                this.sideFlipped = true;
                xPos = sourceBox.x1 - natWidth;
                if (xPos < x1) {
                    this.sideFlipped = false;
                    xPos = sourceBox.x2;
                }
            } else {
                // Dock on the left: open towards the right.
                this.sideFlipped = false;
                xPos = sourceBox.x2;
                if (xPos + natWidth > x2) {
                    this.sideFlipped = true;
                    xPos = sourceBox.x1 - natWidth;
                }
            }
        }

        // Never leave the monitor.
        xPos = Math.max(x1, Math.min(xPos, x2 - natWidth));
        yPos = Math.max(y1, Math.min(yPos, y2 - natHeight));
        return [xPos, yPos];
    }
};

/**
 * Right click menu of a single dock icon: window list, launch and pinning.
 */
var AppMenu = class AppMenu extends DockPopupMenu {
    constructor(icon) {
        super(icon.actor, icon.controller);
        this.icon = icon;
        this.actor.add_style_class_name('aura-dock-menu');

        this.connect('open-state-changed', (menu, open) => {
            if (open) {
                this.rebuild();
                this._repositionSoon();
            }
        });
    }

    iconChanged() {
        if (this.isOpen) {
            this.rebuild();
            this._repositionSoon();
        }
    }

    rebuild() {
        this.removeAll();

        const icon = this.icon;
        const app = icon.app;
        const windows = icon.windows;
        const favorites = AppFavorites.getAppFavorites();

        addHeader(this, app.get_name());

        if (windows.length) {
            addSeparator(this);

            windows.forEach((win, idx) => {
                const targetWindow = win;
                const item = new PopupMenu.PopupMenuItem(shorten(targetWindow.get_title() || app.get_name()), { activate: false });
                item._targetWindow = targetWindow;
                item.label.add_style_class_name('aura-dock-window-title');
                item.setSensitive(true);
                item.actor._targetWindow = targetWindow;

                try {
                    const clones = WindowUtils.createWindowClone(targetWindow, 160, 120, false, false);
                    if (clones && clones.length) {
                        const clone = clones[0].actor;
                        clone.reactive = false;

                        const thumbBin = new St.Bin({
                            style_class: 'aura-dock-thumb',
                            width: 149,
                            height: 120
                        });
                        thumbBin.set_child(clone);
                        thumbBin.reactive = true;
                        thumbBin._targetWindow = targetWindow;
                        thumbBin.connect('button-release-event', (a, e) => {
                            if (e.get_button() === 1) {
                                const w = a._targetWindow;
                                if (w) {
                                    w.unminimize();
                                    w.activate(global.get_current_time());
                                }
                                this.close();
                                return Clutter.EVENT_STOP;
                            }
                            return Clutter.EVENT_PROPAGATE;
                        });
                        item.addActor(thumbBin, { span: 0, position: 0 });
                    }
                } catch (e) {
                }

                item.actor.connect('button-release-event', (actor, e) => {
                    if (e.get_button() === 1) {
                        const w = actor._targetWindow;
                        if (w) {
                            w.unminimize();
                            w.activate(global.get_current_time());
                        }
                        this.close();
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                });

                const close = new St.Button({
                    style_class: 'aura-dock-close',
                    child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 18 }),
                    reactive: true
                });
                close.set_style('min-width: 28px; min-height: 28px; padding: 4px; border-radius: 99px; background-color: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15);');
                close.connect('notify::hover', () => {
                    if (close.hover)
                        close.set_style('min-width: 28px; min-height: 28px; padding: 4px; border-radius: 99px; background-color: rgba(255,80,80,0.9); border: 1px solid rgba(255,255,255,0.15);');
                    else
                        close.set_style('min-width: 28px; min-height: 28px; padding: 4px; border-radius: 99px; background-color: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15);');
                });
                close.connect('clicked', () => {
                    targetWindow.delete(global.get_current_time());
                    this.close();
                });
                item.addActor(close, { span: 0, position: 1 });

                this.addMenuItem(item);
            });
        }

        addSeparator(this);

        this.addAction('New window', () => {
            icon.launch();
            this.close();
        });

        const isFavorite = favorites.isFavorite(icon.id);
        this.addAction(isFavorite ? 'Remove from favorites' : 'Add to favorites', () => {
            if (isFavorite)
                favorites.removeFavorite(icon.id);
            else
                favorites.addFavorite(icon.id);
            this.close();
        });

        if (windows.length > 1) {
            this.addAction('Close all windows', () => {
                windows.slice().forEach(w => w.delete(global.get_current_time()));
                this.close();
            });
        }
    }

    addAction(label, callback) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', callback);
        this.addMenuItem(item);
        return item;
    }
};

/**
 * Right click menu of the dock itself: all settings that matter day to day.
 */
var DockMenu = class DockMenu extends DockPopupMenu {
    constructor(controller) {
        super(controller.dockActor, controller);
        this.actor.add_style_class_name('aura-dock-menu');

        this._choices = new Map();
        this._switches = new Map();
        this._slider = null;
        this._sliderLabel = null;
        this._sliderInfo = null;
        this._repositionId = 0;

        // Build the menu once. Rebuilding it from an open-state-changed handler
        // leaves the nested submenus with a stale allocation in Cinnamon 6, so
        // values are refreshed in place when the menu opens instead.
        this._build();

        this.connect('open-state-changed', (menu, open) => {
            if (open)
                this.refresh();
        });
    }

    _build() {
        addHeader(this, 'Aura Dock');
        addSeparator(this);

        this.addChoice('Position', 'dock-position', () => this.controller.dockPosition, [
            ['bottom', 'Bottom'],
            ['top', 'Top'],
            ['left', 'Left'],
            ['right', 'Right']
        ]);

        this.addChoice('Icon size', 'icon-size', () => this._nearestIconSize(),
            ICON_SIZES.map(size => [size, `${size} px`]));

        this.addChoice('Autohide', 'autohide-mode', () => this.controller.autohideMode, [
            ['intelligent', 'Intelligent'],
            ['always', 'Always'],
            ['never', 'Never']
        ]);

        this.addChoice('Monitor', 'monitor', () => this.controller.monitorMode, [
            ['primary', 'Primary monitor'],
            ['secondary', 'Secondary monitor'],
            ['all', 'All monitors']
        ]);

        this.addChoice('Click action', 'click-action', () => this.controller.clickAction, [
            ['minimize', 'Minimize / focus'],
            ['cycle', 'Cycle through windows'],
            ['preview', 'Show window previews']
        ]);

        addSeparator(this);

        this.addSwitch('Only current workspace', 'isolate-workspaces',
            () => this.controller.isolateWorkspaces);
        this.addSwitch('Animate icons on hover', 'animate-hover',
            () => this.controller.animateHover);
        this.addSwitch('Show tooltips', 'show-tooltips',
            () => this.controller.showTooltips);

        addSeparator(this);

        this.addSlider('Background opacity', 'background-opacity',
            () => this.controller.backgroundOpacity, 0, 100, '%');
    }

    _nearestIconSize() {
        const size = this.controller.iconSize;
        return ICON_SIZES.reduce((best, candidate) => {
            return Math.abs(candidate - size) < Math.abs(best - size) ? candidate : best;
        }, ICON_SIZES[0]);
    }

    refresh() {
        for (const entry of this._choices.values()) {
            const current = entry.get();
            for (const [optionValue, item] of entry.items)
                item.setShowDot(optionValue === current);
        }

        for (const entry of this._switches.values())
            entry.item.setToggleState(entry.get());

        if (this._slider && this._sliderInfo) {
            const { get, label, min, max, suffix } = this._sliderInfo;
            const value = get();
            this._slider.setValue((value - min) / (max - min));
            this._sliderLabel.set_text(`${label}: ${Math.round(value)}${suffix}`);
        }
    }

    addChoice(label, key, get, options) {
        const submenu = new PopupMenu.PopupSubMenuMenuItem(label);
        const items = [];

        submenu.menu.connect('open-state-changed', () => this._repositionSoon());

        for (const [optionValue, optionLabel] of options) {
            const item = new PopupMenu.PopupMenuItem(optionLabel);
            item.connect('activate', () => {
                this.controller.setSetting(key, optionValue);
                this.close();
            });

            submenu.menu.addMenuItem(item);
            items.push([optionValue, item]);
        }

        this.addMenuItem(submenu);
        this._choices.set(key, { get, items });
    }

    addSwitch(label, key, get) {
        const item = new PopupMenu.PopupSwitchMenuItem(label, get());
        item.connect('toggled', (actor, state) => {
            this.controller.setSetting(key, state);
        });
        this.addMenuItem(item);
        this._switches.set(key, { item, get });
        return item;
    }

    addSlider(label, key, get, min, max, suffix) {
        // A PopupSliderMenuItem is a single horizontal row, so the label gets
        // its own non-interactive row right above the slider.
        const text = new PopupMenu.PopupMenuItem('', { reactive: false });
        text.label.set_text(`${label}: ${Math.round(get())}${suffix}`);
        text.actor.add_style_class_name('aura-dock-slider-label');
        this.addMenuItem(text);

        const item = new PopupMenu.PopupSliderMenuItem((get() - min) / (max - min));
        item.connect('value-changed', (actor, sliderValue) => {
            const actual = Math.round(min + sliderValue * (max - min));
            text.label.set_text(`${label}: ${actual}${suffix}`);
            this.controller.setSetting(key, actual);
        });

        this.addMenuItem(item);
        this._slider = item;
        this._sliderLabel = text.label;
        this._sliderInfo = { get, label, min, max, suffix };
        return item;
    }
};

var MenuFactory = {
    createAppMenu(icon) {
        return new AppMenu(icon);
    },

    createDockMenu(controller) {
        return new DockMenu(controller);
    }
};
