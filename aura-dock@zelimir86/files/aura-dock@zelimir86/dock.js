// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const AppFavorites = imports.ui.appFavorites;
const DND = imports.ui.dnd;
const Extension = imports.ui.extension;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;

const { SignalManager } = imports.misc.signalManager;

const Me = Extension.getCurrentExtension();
const { AppIcon } = Me.imports.appIcon;
const { MenuFactory } = Me.imports.menu;

const SHOW_TIME = 170;
const HIDE_TIME = 150;
const STARTUP_GRACE = 1200;
const AUTOHIDE_RECHECK = 200;
const DOCK_WIDTH = 6;

/**
 * Owns the dock actor, the reveal strip, the app icons and all settings.
 *
 * The dock is not a panel applet: it is a chrome actor living on the primary
 * monitor, which is how Dash to Dock works on GNOME Shell and what makes
 * autohide, edge positioning and drag reordering possible.
 */
var DockController = class DockController {
    constructor(monitorIndex, meta, recreateCallback) {
        this.meta = meta;
        this.uuid = meta.uuid;
        this.recreateCallback = recreateCallback || null;

        this.signals = new SignalManager(null);

        this._icons = new Map();
        this._order = [];
        this._windowSignals = new Map();

        this._syncId = 0;
        this._hideId = 0;
        this._autohideId = 0;
        this._repositionId = 0;

        this._menusOpen = 0;
        this._hover = false;
        this._hidden = true;
        this._suppressed = false;
        this._destroyed = false;
        this._dragHover = false;
        this._dragPlaceholder = null;
        this._dragPlaceholderTimeout = 0;
        this._shiftRightPressed = false;

        this._monitorIndex = (monitorIndex != null)
            ? monitorIndex
            : (Main.layoutManager ? Main.layoutManager.primaryIndex : 0);
        this._geometry = null;

        this._tracker = Cinnamon.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();

        this._settings = new Settings.ExtensionSettings(this, this.uuid);
        this.monitorMode = 'primary';
        this._lastMonitorMode = 'primary';
        this._bindSettings();
        this.monitorMode = this._settings.getValue('monitor') || 'primary';
        this._lastMonitorMode = this.monitorMode;

        // Follow the GTK theme's accent colour for the running indicator.
        this._gnomeSettings = new Gio.Settings({ schema_id: 'org.cinnamon.desktop.interface' });
        this.accentColor = '#92b372';
        this._gnomeSettings.connect('changed', () => {
            this._resolveAccentColor((color) => {
                if (color !== this.accentColor) {
                    this.accentColor = color;
                    for (const icon of this._icons.values()) {
                        icon._indicatorKey = null;
                        icon._updateIndicator();
                    }
                }
            });
        });
    }

    /* Accessors ***********************************************************/

    get scale() {
        return global.ui_scale || 1;
    }

    get position() {
        return this.dockPosition || 'bottom';
    }

    get vertical() {
        return this.position === 'left' || this.position === 'right';
    }

    get arrowSide() {
        switch (this.position) {
            case 'top':
                return St.Side.TOP;
            case 'left':
                return St.Side.LEFT;
            case 'right':
                return St.Side.RIGHT;
            default:
                return St.Side.BOTTOM;
        }
    }

    get dockActor() {
        return this._dock;
    }

    get menuManager() {
        return this._menuManager;
    }

    /* Lifecycle ***********************************************************/

    _bindSettings() {
        const bindings = [
            ['dock-position', 'dockPosition'],
            ['icon-size', 'iconSize'],
            ['autohide-mode', 'autohideMode'],
            ['autohide-delay', 'autohideDelay'],
            ['background-opacity', 'backgroundOpacity'],
            ['click-action', 'clickAction'],
            ['middle-click-action', 'middleClickAction'],
            ['isolate-workspaces', 'isolateWorkspaces'],
            ['show-all-monitors', 'showAllMonitors'],
            ['animate-hover', 'animateHover'],
            ['show-tooltips', 'showTooltips'],
            ['edge-margin', 'edgeMargin'],
            ['reveal-size', 'revealSize'],
            ['monitor', 'monitorMode']
        ];

        for (const [key, property] of bindings) {
            try {
                this._settings.bind(key, property, () => this._onSettingsChanged());
            } catch (e) {
                global.logError(e, `Aura Dock: could not bind setting ${key}`);
            }
        }
    }

    _resolveDefineColor(text, name) {
        const re = new RegExp('@define-color\\s+' + name + '\\s+([^;]+);');
        const m = text.match(re);
        if (!m)
            return null;
        const value = m[1].trim();
        if (value.startsWith('@'))
            return this._resolveDefineColor(text, value.slice(1));
        return value;
    }

    _resolveAccentColor(callback) {
        try {
            const theme = this._gnomeSettings.get_string('gtk-theme') || 'Mint-L';
            const candidates = [theme, theme.replace(/-Dark$/, ''), 'Mint-L'];
            const tryCandidate = (i) => {
                if (i >= candidates.length) {
                    callback('#92b372');
                    return;
                }
                const candidate = candidates[i];
                const path = GLib.build_filenamev(['/usr/share/themes', candidate, 'gtk-3.0', 'gtk.css']);
                const file = Gio.File.new_for_path(path);
                file.load_contents_async(null, (f, res) => {
                    try {
                        const [ok, bytes] = f.load_contents_finish(res);
                        if (ok) {
                            const text = imports.byteArray.toString(bytes);
                            let color = this._resolveDefineColor(text, 'theme_selected_bg_color');
                            if (!color)
                                color = this._resolveDefineColor(text, 'accent_bg_color');
                            if (!color)
                                color = this._resolveDefineColor(text, 'accent_color');
                            if (color && !color.startsWith('@')) {
                                callback(color);
                                return;
                            }
                        }
                    } catch (e) {
                        // Try next candidate.
                    }
                    tryCandidate(i + 1);
                });
            };
            tryCandidate(0);
        } catch (e) {
            global.logError(e, 'Aura Dock: could not resolve accent colour');
            callback('#92b372');
        }
    }

    enable() {
        this._buildDock();
        this._buildTrigger();

        this._menuManager = new PopupMenu.PopupMenuManager({ actor: this._dock });
        this._dockMenu = MenuFactory.createDockMenu(this);
        this._menuManager.addMenu(this._dockMenu);

        // The PopupMenuManager switches menus when the pointer enters another
        // menu's source actor. For the dock that means merely moving the
        // cursor over the dock (while an app menu is open) would switch to the
        // settings menu, which previously crashed Cinnamon. Disconnect that
        // hover-switching for the dock's own source actor.
        try {
            this._menuManager._signals.disconnect('enter-event', this._dock);
        } catch (e) {
            global.logError(e, 'Aura Dock: could not disconnect enter-event');
        }

        this._dockMenu.connect('open-state-changed', (menu, open) => {
            if (open)
                this._menusOpen++;
            else
                this._menusOpen = Math.max(0, this._menusOpen - 1);
            this._queueAutohideCheck();
        });

        this._connectSignals();
        this._applyDockStyle();
        this._sync(true);

        // Resolve the GTK theme's accent colour asynchronously and apply it to
        // the running indicators.
        this._resolveAccentColor((color) => {
            this.accentColor = color;
            for (const icon of this._icons.values()) {
                icon._indicatorKey = null;
                icon._updateIndicator();
            }
        });

        // Show the dock once on startup, then let autohide take over. Without
        // this a fresh install on a full screen would look like nothing
        // happened.
        this._show(false);

        this._autohideId = Mainloop.timeout_add(STARTUP_GRACE, () => {
            this._autohideId = 0;
            this._updateAutohideState();
            return GLib.SOURCE_REMOVE;
        });

        // Handy from Looking Glass and for scripted testing:
        //   dbus-send ... org.Cinnamon.Eval "global.auraDock._dockMenu.toggle()"
        global.auraDock = this;
    }

    destroy() {
        this._destroyed = true;

        if (global.auraDock === this)
            delete global.auraDock;

        this.signals.disconnectAllSignals();

        for (const id of [this._syncId, this._hideId, this._autohideId, this._repositionId]) {
            if (id)
                Mainloop.source_remove(id);
        }

        for (const [win, ids] of this._windowSignals) {
            for (const id of ids) {
                try {
                    win.disconnect(id);
                } catch (e) {
                    // Window is already gone.
                }
            }
        }
        this._windowSignals.clear();

        for (const icon of Array.from(this._icons.values()))
            icon.destroy();
        this._icons.clear();

        this._hideDragPlaceholder();

        if (this._dockMenu && this._menuManager) {
            try {
                this._menuManager.removeMenu(this._dockMenu);
            } catch (e) {
                // Ignore.
            }
            this._dockMenu.destroy();
            this._dockMenu = null;
        }

        if (this._menuManager) {
            this._menuManager.destroy();
            this._menuManager = null;
        }

        if (this._trigger) {
            try {
                Main.layoutManager.removeChrome(this._trigger);
            } catch (e) {
                // Ignore.
            }
            this._trigger.destroy();
            this._trigger = null;
        }

        if (this._dock) {
            try {
                Main.layoutManager.removeChrome(this._dock);
            } catch (e) {
                // Ignore.
            }
            this._dock.destroy();
            this._dock = null;
        }

        if (this._settings) {
            this._settings.finalize();
            this._settings = null;
        }
    }

    /* Construction ********************************************************/

    _buildDock() {
        this._dock = new St.BoxLayout({
            name: 'auraDock',
            style_class: 'aura-dock',
            reactive: true,
            track_hover: true,
            can_focus: false,
            visible: false,
            opacity: 0
        });
        this._dock._delegate = this;

        Main.layoutManager.addChrome(this._dock, {
            affectsInputRegion: true,
            affectsStruts: false,
            visibleInFullscreen: false,
            addToWindowgroup: false,
            doNotAdd: false
        });

        this._dock.connect('enter-event', () => {
            this._hover = true;
            this._cancelHide();
            this._show(true);
            return Clutter.EVENT_PROPAGATE;
        });

        this._dock.connect('leave-event', () => {
            this._hover = false;
            this._scheduleHide();
            return Clutter.EVENT_PROPAGATE;
        });

        this._dock.connect('button-release-event', (actor, event) => this._onDockButtonRelease(actor, event));
        this._dock.connect('button-press-event', (actor, event) => this._onDockButtonPress(actor, event));
        this._dock.connect('scroll-event', (actor, event) => this._onDockScroll(actor, event));

        // Icon textures load asynchronously, so the dock's natural size is
        // not final right after the first sync. Follow allocation changes so
        // it never ends up half off screen.
        let lastWidth = 0;
        let lastHeight = 0;

        this._dock.connect('notify::allocation', () => {
            const [width, height] = this._dock.get_size();

            if (width === lastWidth && height === lastHeight)
                return;

            lastWidth = width;
            lastHeight = height;
            this._queueReposition();
        });
    }

    _buildTrigger() {
        this._trigger = new St.Widget({
            name: 'auraDockTrigger',
            style_class: 'aura-dock-trigger',
            reactive: true,
            track_hover: true,
            visible: false
        });
        this._trigger._delegate = this;

        Main.layoutManager.addChrome(this._trigger, {
            affectsInputRegion: true,
            affectsStruts: false,
            visibleInFullscreen: false,
            addToWindowgroup: false,
            doNotAdd: false
        });

        this._trigger.connect('enter-event', () => {
            this._show(true);
            return Clutter.EVENT_PROPAGATE;
        });

        this._trigger.connect('leave-event', () => {
            if (!this._hover)
                this._scheduleHide();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _applyDockStyle() {
        const opacity = this._clamp(this.backgroundOpacity ?? 85, 0, 100) / 100;
        this._dock.set_style(`background-color: rgba(20, 20, 27, ${opacity.toFixed(3)});`);
        this._dock.spacing = Math.max(0, Math.round(DOCK_WIDTH * this.scale));
        this._dock.set_vertical(this.vertical);
    }

    _onSettingsChanged() {
        if (this._destroyed)
            return;

        this._applyDockStyle();

        for (const icon of this._icons.values())
            icon._applyOrientation();

        this._sync(true);
        this._queueReposition();

        // Switching the target monitor needs the extension to rebuild its
        // dock instances; do it out of this callback to avoid reentrancy.
        const newMonitorMode = this._settings.getValue('monitor');
        if (newMonitorMode && newMonitorMode !== this._lastMonitorMode) {
            this._lastMonitorMode = newMonitorMode;
            this.monitorMode = newMonitorMode;
            if (this.recreateCallback) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    try { this.recreateCallback(newMonitorMode); } catch (e) { global.logError(e); }
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
    }

    /* Signals *************************************************************/

    _connectSignals() {
        this.signals.connect(global.display, 'window-created', () => {
            this._queueSync();
            this._queueAutohideCheck();
        });

        this.signals.connect(global.display, 'notify::focus-window', () => this._queueSync());
        this.signals.connect(global.display, 'restacked', () => this._queueAutohideCheck());
        this.signals.connect(global.display, 'window-entered-monitor', () => this._queueSync());
        this.signals.connect(global.display, 'window-left-monitor', () => this._queueSync());

        this.signals.connect(global.workspace_manager, 'active-workspace-changed', () => {
            this._queueSync();
            this._queueAutohideCheck();
        });
        this.signals.connect(global.workspace_manager, 'notify::n-workspaces', () => this._queueSync());

        this.signals.connect(Main.layoutManager, 'monitors-changed', () => {
            if (this._monitorIndex >= Main.layoutManager.monitors.length)
                this._monitorIndex = Main.layoutManager.primaryIndex;
            this._queueSync();
        });

        // Panel height / position changes the work area without a
        // monitors-changed signal.
        this.signals.connect(global.settings, 'changed', (settings, key) => {
            if (key.indexOf('panel') !== -1)
                this._queueReposition();
        });

        this.signals.connect(Main.overview, 'showing', () => this._setSuppressed(true));
        this.signals.connect(Main.overview, 'hidden', () => this._setSuppressed(false));
        this.signals.connect(Main.expo, 'showing', () => this._setSuppressed(true));
        this.signals.connect(Main.expo, 'hidden', () => this._setSuppressed(false));

        this.signals.connect(this._favorites, 'changed', () => this._queueSync());
    }

    _setSuppressed(suppressed) {
        if (this._suppressed === suppressed)
            return;
        this._suppressed = suppressed;

        if (suppressed)
            this._hide(false);
        else
            this._updateAutohideState();
    }

    /* Model ***************************************************************/

    _queueSync() {
        if (this._destroyed || this._syncId)
            return;

        this._syncId = Mainloop.idle_add(() => {
            this._syncId = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueReposition() {
        if (this._destroyed || this._repositionId)
            return;

        this._repositionId = Mainloop.idle_add(() => {
            this._repositionId = 0;
            this._reposition();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueAutohideCheck() {
        if (this._destroyed || this._autohideId)
            return;

        this._autohideId = Mainloop.timeout_add(AUTOHIDE_RECHECK, () => {
            this._autohideId = 0;
            this._updateAutohideState();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        if (this._destroyed)
            return;

        this._hideDragPlaceholder();

        if (this._syncId) {
            Mainloop.source_remove(this._syncId);
            this._syncId = 0;
        }

        const favoriteApps = this._favorites.getFavorites();
        const favorites = this._favorites.getFavoriteMap();
        const favoriteIds = new Set(favoriteApps.map(app => app.get_id()));

        const groups = this._collectWindows();

        const desired = [];
        for (const app of favoriteApps)
            desired.push(app.get_id());

        for (const id of this._order) {
            if (!favoriteIds.has(id) && groups.has(id) && desired.indexOf(id) === -1)
                desired.push(id);
        }

        for (const id of groups.keys()) {
            if (desired.indexOf(id) === -1)
                desired.push(id);
        }

        for (const [id, icon] of Array.from(this._icons.entries())) {
            if (desired.indexOf(id) === -1) {
                icon.destroy();
                this._icons.delete(id);
            }
        }

        desired.forEach((id, index) => {
            const group = groups.get(id);
            const app = group ? group.app : favorites[id];

            if (!app)
                return;

            let icon = this._icons.get(id);
            if (!icon) {
                icon = new AppIcon({ controller: this, app, id });
                this._icons.set(id, icon);
                this._dock.add_child(icon.actor);
            }

            icon.update({
                app,
                windows: group ? group.windows : [],
                isFavorite: favoriteIds.has(id)
            });

            if (this._dock.get_child_at_index(index) !== icon.actor)
                this._dock.set_child_at_index(icon.actor, index);
        });

        this._order = desired;

        this._reposition();
        this._updateAutohideState();
    }

    _collectWindows() {
        const groups = new Map();
        const seen = new Set();
        const workspace = global.workspace_manager.get_active_workspace();

        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;

            if (!win || !this._isTracked(win, workspace))
                continue;

            const app = this._tracker.get_window_app(win);
            if (!app)
                continue;

            const id = app.get_id();
            if (!id)
                continue;

            if (!groups.has(id))
                groups.set(id, { app, windows: [] });

            groups.get(id).windows.push(win);
            seen.add(win);
        }

        for (const group of groups.values()) {
            group.windows.sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
        }

        this._updateWindowSignals(seen);

        return groups;
    }

    _isTracked(win, workspace) {
        if (win.get_window_type() !== Meta.WindowType.NORMAL)
            return false;
        if (win.is_skip_taskbar())
            return false;
        if (!this.showAllMonitors && win.get_monitor() !== this._monitorIndex)
            return false;
        if (this.isolateWorkspaces && !win.is_on_all_workspaces() && !win.located_on_workspace(workspace))
            return false;

        return true;
    }

    _updateWindowSignals(seen) {
        for (const [win, ids] of Array.from(this._windowSignals.entries())) {
            if (seen.has(win))
                continue;

            for (const id of ids) {
                try {
                    win.disconnect(id);
                } catch (e) {
                    // Window is gone.
                }
            }
            this._windowSignals.delete(win);
        }

        for (const win of seen) {
            if (this._windowSignals.has(win))
                continue;

            const ids = [];
            ids.push(win.connect('notify::title', () => this._queueSync()));
            ids.push(win.connect('notify::minimized', () => {
                this._queueSync();
                this._queueAutohideCheck();
            }));
            ids.push(win.connect('notify::appears-focused', () => this._queueSync()));
            ids.push(win.connect('notify::workspace', () => this._queueSync()));
            ids.push(win.connect('unmanaged', () => this._queueSync()));
            ids.push(win.connect('size-changed', () => this._queueAutohideCheck()));
            ids.push(win.connect('position-changed', () => this._queueAutohideCheck()));

            this._windowSignals.set(win, ids);
        }
    }

    /* Geometry ************************************************************/

    _area() {
        const index = this._monitorIndex;
        const monitor = Main.layoutManager.monitors[index] || Main.layoutManager.primaryMonitor;

        const area = {
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height
        };

        let work = null;
        try {
            work = global.workspace_manager.get_active_workspace().get_work_area_for_monitor(index);
        } catch (e) {
            work = null;
        }

        if (!work || work.width <= 0 || work.height <= 0)
            return area;

        // If a panel occupies the same edge, sit next to it instead of on
        // top of it. The reveal strip ends up right beside the panel.
        switch (this.position) {
            case 'top':
                if (work.y > monitor.y) {
                    area.y = work.y;
                    area.height = monitor.y + monitor.height - work.y;
                }
                break;

            case 'left':
                if (work.x > monitor.x) {
                    area.x = work.x;
                    area.width = monitor.x + monitor.width - work.x;
                }
                break;

            case 'right':
                if (work.x + work.width < monitor.x + monitor.width)
                    area.width = work.x + work.width - monitor.x;
                break;

            default:
                if (work.y + work.height < monitor.y + monitor.height)
                    area.height = work.y + work.height - monitor.y;
                break;
        }

        return area;
    }

    _dockSize() {
        const [, naturalWidth] = this._dock.get_preferred_width(-1);
        const [, naturalHeight] = this._dock.get_preferred_height(naturalWidth);
        return [naturalWidth, naturalHeight];
    }

    _positions() {
        const area = this._area();
        const [width, height] = this._dockSize();
        const margin = Math.round(this._clamp(this.edgeMargin ?? 0, 0, 48) * this.scale);

        const shown = { x: 0, y: 0 };
        const hidden = { x: 0, y: 0 };

        switch (this.position) {
            case 'top':
                shown.x = area.x + Math.round((area.width - width) / 2);
                shown.y = area.y + margin;
                hidden.x = shown.x;
                hidden.y = area.y - height - margin;
                break;

            case 'left':
                shown.x = area.x + margin;
                shown.y = area.y + Math.round((area.height - height) / 2);
                hidden.x = area.x - width - margin;
                hidden.y = shown.y;
                break;

            case 'right':
                shown.x = area.x + area.width - width - margin;
                shown.y = area.y + Math.round((area.height - height) / 2);
                hidden.x = area.x + area.width - margin;
                hidden.y = shown.y;
                break;

            default:
                shown.x = area.x + Math.round((area.width - width) / 2);
                shown.y = area.y + area.height - height - margin;
                hidden.x = shown.x;
                hidden.y = area.y + area.height - margin;
                break;
        }

        return { shown, hidden, width, height, area };
    }

    _reposition() {
        if (this._destroyed || !this._dock)
            return;

        const p = this._positions();
        if (p.width <= 0 || p.height <= 0)
            return;

        this._geometry = p;

        if (this._hidden || !this._dock.visible)
            this._dock.set_position(p.hidden.x, p.hidden.y);
        else
            this._dock.set_position(p.shown.x, p.shown.y);

        this._positionTrigger(p);
        if (this._trigger)
            this._trigger.set_style(this._hidden ? '' : 'background-color: transparent;');
    }

    _positionTrigger(p) {
        if (!this._trigger)
            return;

        const thickness = Math.max(2, Math.round((this.revealSize ?? 4) * this.scale));
        const margin = Math.round(this._clamp(this.edgeMargin ?? 0, 0, 48) * this.scale);
        const area = p.area;

        // Cover only the gap between the dock and the screen edge, never the
        // dock itself (otherwise the trigger would steal hover from the dock).
        // With no gap, fall back to a thin reveal strip at the screen edge.
        const span = margin > 0 ? margin : thickness;

        let x = 0;
        let y = 0;
        let width = 0;
        let height = 0;

        switch (this.position) {
            case 'top':
                width = p.width;
                height = span;
                x = p.shown.x;
                y = margin > 0 ? area.y : area.y + margin;
                break;

            case 'left':
                width = span;
                height = p.height;
                x = margin > 0 ? area.x : area.x + margin;
                y = p.shown.y;
                break;

            case 'right':
                width = span;
                height = p.height;
                x = margin > 0 ? area.x + area.width - span : area.x + area.width - thickness - margin;
                y = p.shown.y;
                break;

            default:
                width = p.width;
                height = span;
                x = p.shown.x;
                y = margin > 0 ? area.y + area.height - span : area.y + area.height - thickness - margin;
                break;
        }

        this._trigger.set_position(x, y);
        this._trigger.set_size(width, height);
        this._trigger.set_opacity(255);
        this._trigger.visible = !this._suppressed && this.autohideMode !== 'never';
    }

    /* Show and hide *******************************************************/

    _show(animate = true) {
        if (this._destroyed || this._suppressed)
            return;

        this._cancelHide();

        // Keep the trigger in place as an invisible hover zone covering the
        // gap, so the dock does not hide while the pointer is in the gap.
        if (this._trigger) {
            this._trigger.set_style('background-color: transparent;');
            this._trigger.show();
        }

        if (!this._hidden && this._dock.visible)
            return;

        const p = this._positions();
        if (p.width <= 0 || p.height <= 0)
            return;

        const wasVisible = this._dock.visible;
        const geometry = this._geometry = p;

        this._hidden = false;
        this._dock.show();
        this._dock.reactive = true;

        if (!wasVisible) {
            this._dock.set_position(p.hidden.x, p.hidden.y);
            this._dock.set_opacity(0);
        }

        if (animate) {
            this._dock.ease({
                x: geometry.shown.x,
                y: geometry.shown.y,
                opacity: 255,
                duration: wasVisible ? 120 : SHOW_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC
            });
        } else {
            this._dock.set_position(geometry.shown.x, geometry.shown.y);
            this._dock.set_opacity(255);
        }

        this._positionTrigger(geometry);
        if (this._trigger)
            this._trigger.set_style('background-color: transparent;');
        this._nudgeChrome();
    }

    _hide(animate = true) {
        if (this._destroyed)
            return;

        this._cancelHide();

        if (this._hidden && !this._dock.visible) {
            this._positionTrigger(this._positions());
            if (this._trigger)
                this._trigger.set_style('');
            return;
        }

        this._hidden = true;

        const p = this._positions();
        const finish = () => {
            if (this._destroyed || !this._hidden)
                return;

            this._dock.reactive = false;
            this._dock.hide();
            this._dock.set_opacity(255);
            this._positionTrigger(p);
            if (this._trigger)
                this._trigger.set_style('');
            this._nudgeChrome();
        };

        if (animate) {
            this._dock.ease({
                x: p.hidden.x,
                y: p.hidden.y,
                opacity: 0,
                duration: HIDE_TIME,
                mode: Clutter.AnimationMode.EASE_IN_CUBIC,
                onStopped: finish
            });
        } else {
            this._dock.set_position(p.hidden.x, p.hidden.y);
            finish();
        }
    }

    _scheduleHide() {
        if (this._destroyed || this._hideId)
            return;

        const delay = Math.max(0, Math.round(this.autohideDelay ?? 350));

        this._hideId = Mainloop.timeout_add(delay, () => {
            this._hideId = 0;

            if (!this._hover && this._menusOpen === 0 && !this._suppressed) {
                if (this.autohideMode !== 'never' &&
                    (this.autohideMode === 'always' || this._windowOverlapsDock())) {

                    // The dock's leave-event can fire spuriously when the
                    // pointer sits on the screen edge, so double-check the
                    // pointer is actually away from the dock (and its reveal
                    // strip) before hiding. If it is still nearby, reschedule
                    // instead of hiding.
                    try {
                        const [px, py] = global.get_pointer();
                        const p = this._geometry;
                        const tr = this._trigger;
                        let onDockOrTrigger = false;
                        if (p) {
                            if (px >= p.shown.x - 8 && px <= p.shown.x + p.width + 8 &&
                                py >= p.shown.y - 8 && py <= p.shown.y + p.height + 8)
                                onDockOrTrigger = true;
                        }
                        if (!onDockOrTrigger && tr) {
                            const [tx, ty] = tr.get_transformed_position();
                            if (px >= tx - 4 && px <= tx + tr.width + 4 &&
                                py >= ty - 4 && py <= ty + tr.height + 4)
                                onDockOrTrigger = true;
                        }
                        if (onDockOrTrigger) {
                            // Pointer still nearby: reschedule the hide check.
                            this._scheduleHide();
                            return GLib.SOURCE_REMOVE;
                        }
                    } catch (e) {
                        // Fall through to hiding.
                    }

                    this._hide();
                }
            }

            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelHide() {
        if (this._hideId) {
            Mainloop.source_remove(this._hideId);
            this._hideId = 0;
        }
    }

    _updateAutohideState() {
        if (this._destroyed)
            return;

        if (this._suppressed) {
            this._hide(false);
            return;
        }

        if (this.autohideMode === 'never') {
            this._show(false);
            return;
        }

        if (this._hover || this._menusOpen > 0) {
            this._show(false);
            return;
        }

        const shouldHide = this.autohideMode === 'always' || this._windowOverlapsDock();

        if (shouldHide) {
            // Don't hide while the pointer is on the dock or its reveal strip.
            try {
                const [px, py] = global.get_pointer();
                const p = this._geometry;
                const tr = this._trigger;
                let onDockOrTrigger = false;
                if (p) {
                    if (px >= p.shown.x - 8 && px <= p.shown.x + p.width + 8 &&
                        py >= p.shown.y - 8 && py <= p.shown.y + p.height + 8)
                        onDockOrTrigger = true;
                }
                if (!onDockOrTrigger && tr) {
                    const [tx, ty] = tr.get_transformed_position();
                    if (px >= tx - 4 && px <= tx + tr.width + 4 &&
                        py >= ty - 4 && py <= ty + tr.height + 4)
                        onDockOrTrigger = true;
                }
                if (onDockOrTrigger) {
                    this._show(false);
                    return;
                }
            } catch (e) {
                // Fall through.
            }
            this._hide(true);
        } else
            this._show(true);
    }

    _windowOverlapsDock() {
        const p = this._geometry || this._positions();
        if (!p || p.width <= 0)
            return false;

        const rect = {
            x: p.shown.x,
            y: p.shown.y,
            width: p.width,
            height: p.height
        };

        for (const actor of global.get_window_actors()) {
            const win = actor.meta_window;

            if (!win || win.minimized)
                continue;
            if (win.get_window_type() !== Meta.WindowType.NORMAL)
                continue;
            if (win.is_skip_taskbar())
                continue;
            if (win.get_monitor() !== this._monitorIndex)
                continue;

            // Only windows on the current workspace can overlap the dock;
            // windows on other workspaces are out of sight.
            const activeWs = global.workspace_manager.get_active_workspace();
            const winWs = win.get_workspace();
            if (winWs && activeWs && winWs !== activeWs)
                continue;

            const [x, y] = actor.get_transformed_position();
            const [width, height] = actor.get_transformed_size();

            if (x + width > rect.x && x < rect.x + rect.width &&
                y + height > rect.y && y < rect.y + rect.height)
                return true;
        }

        return false;
    }

    /* Interaction *********************************************************/

    _onDockButtonPress(actor, event) {
        // No-op: settings are opened with Shift + right click on an icon.
        return Clutter.EVENT_PROPAGATE;
    }

    _onDockButtonRelease(actor, event) {
        if (event.get_button() !== 3)
            return Clutter.EVENT_PROPAGATE;

        if (this._shiftRightPressed) {
            this._shiftRightPressed = false;
            if (this._menusOpen === 0 || this._dockMenu.isOpen) {
                this._dockMenu.toggle();
                return Clutter.EVENT_STOP;
            }
        }

        this._shiftRightPressed = false;
        return Clutter.EVENT_STOP;
    }

    _onDockScroll(actor, event) {
        const direction = event.get_scroll_direction();

        if (direction === Clutter.ScrollDirection.UP) {
            this._switchWorkspace(-1);
            return Clutter.EVENT_STOP;
        }

        if (direction === Clutter.ScrollDirection.DOWN) {
            this._switchWorkspace(1);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _switchWorkspace(delta) {
        const manager = global.workspace_manager;
        const current = manager.get_active_workspace();
        const direction = delta > 0 ? Meta.MotionDirection.RIGHT : Meta.MotionDirection.LEFT;
        const neighbor = current.get_neighbor(direction);

        if (neighbor && neighbor !== current)
            neighbor.activate(global.get_current_time());
    }

    activateWindow(win) {
        if (!win)
            return;

        if (win.minimized)
            win.unminimize();

        let workspaceIndex;
        const workspace = win.get_workspace();
        if (workspace)
            workspaceIndex = workspace.index();

        Main.activateWindow(win, global.get_current_time(), workspaceIndex);
    }

    cycleWindows(icon, delta) {
        const windows = icon.windows;

        if (windows.length === 0)
            return;

        if (windows.length === 1) {
            this.activateWindow(windows[0]);
            return;
        }

        let index = windows.findIndex(w => w.appears_focused);
        index = index === -1 ? 0 : (index + delta + windows.length) % windows.length;

        this.activateWindow(windows[index]);
    }

    /* Drag and drop (external sources, e.g. the start menu) *****************/

    handleDragOver(source, dragActor, x, y, time) {
        if (source instanceof AppIcon)
            return DND.DragMotionResult.CONTINUE;

        if (source && source.isDraggableApp && source.app) {
            if (!this._dragHover) {
                this._dragHover = true;
                this._dock.add_style_pseudo_class('drop');
            }
            this._showDragPlaceholder();
            return DND.DragMotionResult.COPY_DROP;
        }

        return DND.DragMotionResult.CONTINUE;
    }

    handleDragOut() {
        if (!this._dragHover)
            return;
        this._dragHover = false;
        this._dock.remove_style_pseudo_class('drop');
        this._hideDragPlaceholder();
    }

    acceptDrop(source, dragActor, x, y, time) {
        this.handleDragOut();

        if (source && source.isDraggableApp && source.app) {
            const id = source.app.get_id();
            const favorites = AppFavorites.getAppFavorites();
            if (id && !favorites.isFavorite(id))
                favorites.addFavorite(id);
            this._hideDragPlaceholder();
            return true;
        }

        return false;
    }

    _showDragPlaceholder() {
        if (this._dragPlaceholder)
            return;

        const size = Math.round((this.iconSize || 48) * this.scale);
        const placeholder = new St.BoxLayout({
            style_class: 'aura-dock-drop-placeholder',
            width: size + 12,
            height: size + 12
        });
        const icon = new St.Icon({
            icon_name: 'list-add-symbolic',
            icon_size: Math.round(20 * this.scale)
        });
        placeholder.add_child(icon);
        placeholder.x_align = St.Align.MIDDLE;
        placeholder.y_align = St.Align.MIDDLE;

        this._dock.add_child(placeholder);
        this._dragPlaceholder = placeholder;

        // Safety net: hide the placeholder if a drag is cancelled without a
        // drop while the pointer stays over the dock.
        this._dragPlaceholderTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => {
            this._dragPlaceholderTimeout = 0;
            this._hideDragPlaceholder();
            return GLib.SOURCE_REMOVE;
        });
    }

    _hideDragPlaceholder() {
        if (this._dragPlaceholderTimeout) {
            GLib.source_remove(this._dragPlaceholderTimeout);
            this._dragPlaceholderTimeout = 0;
        }
        if (!this._dragPlaceholder)
            return;
        try { this._dragPlaceholder.destroy(); } catch (e) {}
        this._dragPlaceholder = null;
    }

    reorderFavorites(sourceId, targetId) {
        const ids = this._favorites.getFavorites().map(app => app.get_id());
        const from = ids.indexOf(sourceId);
        const to = ids.indexOf(targetId);

        if (from === -1 || to === -1 || from === to)
            return;

        this._favorites.moveFavoriteToPos(sourceId, to);
    }

    setSetting(key, value) {
        if (!this._settings)
            return;

        this._settings.setValue(key, value);

        // Cinnamon's own setValue() only writes the JSON file; bindings and
        // callbacks are reserved for changes coming from outside (that is how
        // cinnamon-settings talks to xlets). Apply the change ourselves so the
        // in-dock settings menu reacts immediately.
        this._onSettingsChanged();
    }

    _nudgeChrome() {
        // Cinnamon tracks chrome input regions on X11 through allocation
        // changes; on Wayland picking is used instead. Nudging the private
        // helper keeps X11 in sync after an animation.
        try {
            const chrome = Main.layoutManager._chrome;
            if (chrome && chrome._queueUpdateRegions)
                chrome._queueUpdateRegions();
        } catch (e) {
            // Private API changed, not fatal.
        }
    }

    _clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }
};
