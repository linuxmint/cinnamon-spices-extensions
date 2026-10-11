const { Gio, GLib, St, Clutter, Meta } = imports.gi;
const Main = imports.ui.main;
const Settings = imports.ui.settings;

let borderManager = null;

function init(metadata) {
    borderManager = new BorderManager(metadata.uuid);
}

function enable() {
    borderManager.enable();
}

function disable() {
    borderManager.disable();
}

class BorderManager {
    constructor(uuid) {
        this._uuid = uuid;
        this._borders = new Map();
        this._displaySignals = [];
        this._settings = null;
        this._workspaceSwitchId = 0;

        this.borderColor = '#444444';
        this.borderWidth = 3;
        this.borderRadius = 12;
        this.hideOnMaximized = false;
    }

    enable() {
        this._initSettings();

        this._displaySignals.push(
            global.display.connect('window-created',
                (d, w) => { this._onWindowCreated(w); })
        );

        this._displaySignals.push(
            global.display.connect('notify::focus-window',
                () => { this._updateAllBorders(); })
        );

        this._workspaceSwitchId = global.workspace_manager.connect('workspace-switched',
            () => {
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._refreshAllBorders();
                    return GLib.SOURCE_REMOVE;
                });
            }
        );

        let actors = Meta.get_window_actors(global.display);
        actors.forEach(actor => this._addBorder(actor.meta_window));
    }

    disable() {
        this._removeAllBorders();

        if (this._workspaceSwitchId) {
            try { global.workspace_manager.disconnect(this._workspaceSwitchId); } catch (e) {}
            this._workspaceSwitchId = 0;
        }

        this._displaySignals.forEach(id => {
            try { global.display.disconnect(id); } catch (e) {}
        });
        this._displaySignals = [];

        if (this._settings) {
            this._settings.finalize();
            this._settings = null;
        }
    }

    _initSettings() {
        this._settings = new Settings.ExtensionSettings(this, this._uuid);
        this._settings.bind('border-color', 'borderColor', () => this._updateStyles());
        this._settings.bind('border-width', 'borderWidth', () => this._updateStyles());
        this._settings.bind('border-radius', 'borderRadius', () => this._updateStyles());
        this._settings.bind('hide-on-maximized', 'hideOnMaximized', () => this._updateAllBorders());
    }

    _onWindowCreated(metaWindow) {
        let type = metaWindow.get_window_type();
        if (type === Meta.WindowType.NORMAL ||
            type === Meta.WindowType.DIALOG ||
            type === Meta.WindowType.MODAL_DIALOG) {
            this._addBorder(metaWindow);
        }
    }

    _addBorder(metaWindow, retryCount = 0) {
        if (this._borders.has(metaWindow)) return;

        let actor = metaWindow.get_compositor_private();
        if (!actor || !actor.get_parent()) {
            if (retryCount < 20) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    this._addBorder(metaWindow, retryCount + 1);
                    return GLib.SOURCE_REMOVE;
                });
            }
            return;
        }

        let frameRect = metaWindow.get_frame_rect();
        if (frameRect.width === 0 || frameRect.height === 0) return;

        let border = new St.Widget({
            reactive: false,
            track_hover: false,
            x: frameRect.x - this.borderWidth,
            y: frameRect.y - this.borderWidth,
            width: frameRect.width + this.borderWidth * 2,
            height: frameRect.height + this.borderWidth * 2
        });

        this._setBorderStyle(border);

        let parent = actor.get_parent();
        parent.insert_child_below(border, actor);

        let connections = [
            { obj: metaWindow, id: metaWindow.connect('position-changed',
                () => { this._updateBorder(metaWindow); }) },
            { obj: metaWindow, id: metaWindow.connect('size-changed',
                () => { this._updateBorder(metaWindow); }) },
            { obj: metaWindow, id: metaWindow.connect('notify::minimized',
                () => { this._updateBorder(metaWindow); }) },
            { obj: metaWindow, id: metaWindow.connect('notify::fullscreen',
                () => { this._updateBorder(metaWindow); }) },
            { obj: metaWindow, id: metaWindow.connect('notify::workspace',
                () => { this._updateBorder(metaWindow); }) },
            { obj: metaWindow, id: metaWindow.connect('unmanaging',
                () => { this._destroyBorder(metaWindow); }) }
        ];

        if (typeof actor.connect === 'function') {
            connections.push(
                { obj: actor, id: actor.connect('notify::visible',
                    () => { this._updateBorder(metaWindow); }) }
            );
        }

        this._borders.set(metaWindow, { border, connections, actor });
        this._updateBorder(metaWindow);
    }

    _setBorderStyle(border) {
        border.set_style(
            'background-color: transparent; ' +
            'border: ' + this.borderWidth + 'px solid ' + this.borderColor + '; ' +
            'border-radius: ' + this.borderRadius + 'px; ' +
            'box-shadow: none;'
        );
    }

    _updateBorder(metaWindow) {
        let info = this._borders.get(metaWindow);
        if (!info) return;

        if (metaWindow.minimized || metaWindow.fullscreen ||
            (this.hideOnMaximized &&
             (metaWindow.maximized_horizontally || metaWindow.maximized_vertically))) {
            info.border.hide();
            return;
        }

        if (metaWindow.is_hidden()) {
            info.border.hide();
            return;
        }

        let actor = metaWindow.get_compositor_private();
        if (!actor || !actor.visible) {
            info.border.hide();
            return;
        }

        let frameRect = metaWindow.get_frame_rect();
        if (frameRect.width === 0 || frameRect.height === 0) {
            info.border.hide();
            return;
        }

        info.border.set_position(
            frameRect.x - this.borderWidth,
            frameRect.y - this.borderWidth
        );
        info.border.set_size(
            frameRect.width + this.borderWidth * 2,
            frameRect.height + this.borderWidth * 2
        );
        info.border.show();
    }

    _destroyBorder(metaWindow) {
        let info = this._borders.get(metaWindow);
        if (!info) return;

        info.connections.forEach(c => {
            try { c.obj.disconnect(c.id); } catch (e) {}
        });

        try { info.border.destroy(); } catch (e) {}
        this._borders.delete(metaWindow);
    }

    _refreshAllBorders() {
        let actors = Meta.get_window_actors(global.display);
        let seen = new Set();

        actors.forEach(actor => {
            let mw = actor.meta_window;
            if (!mw) return;
            seen.add(mw);

            let info = this._borders.get(mw);
            if (info) {
                if (actor !== info.actor) {
                    info.connections = info.connections.filter(c => {
                        if (c.obj === info.actor) {
                            try { info.actor.disconnect(c.id); } catch (e) {}
                            return false;
                        }
                        return true;
                    });
                    if (typeof actor.connect === 'function') {
                        info.connections.push(
                            { obj: actor, id: actor.connect('notify::visible',
                                () => { this._updateBorder(mw); }) }
                        );
                    }
                    info.actor = actor;
                }

                let parent = actor.get_parent();
                let curParent = info.border.get_parent();
                if (parent && curParent !== parent) {
                    if (curParent) {
                        try { curParent.remove_child(info.border); } catch (e) {}
                    }
                    try { parent.insert_child_below(info.border, actor); } catch (e) {}
                }
                this._updateBorder(mw);
            } else {
                this._addBorder(mw);
            }
        });

        this._borders.forEach((info, mw) => {
            if (!seen.has(mw)) {
                this._destroyBorder(mw);
            }
        });
    }

    _updateStyles() {
        this._borders.forEach(info => {
            this._setBorderStyle(info.border);
        });
        this._updateAllBorders();
    }

    _updateAllBorders() {
        this._borders.forEach((info, metaWindow) => {
            this._updateBorder(metaWindow);
        });
    }

    _removeAllBorders() {
        this._borders.forEach((info, metaWindow) => {
            info.connections.forEach(c => {
                try { c.obj.disconnect(c.id); } catch (e) {}
            });
            try { info.border.destroy(); } catch (e) {}
        });
        this._borders.clear();
    }
}
