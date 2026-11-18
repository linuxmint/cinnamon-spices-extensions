// Coloured border around the focused window.

const St = imports.gi.St;
const Me = imports.ui.extension.getCurrentExtension();
const U = Me.imports.lib.utils;

var WindowBorder = class WindowBorder {
    constructor(controller) {
        this._c = controller;
        this._win = null;
        this._winSignals = new U.SignalTracker();
        this._signals = new U.SignalTracker();
        this.actor = new St.Bin({ style_class: 'tiling-window-border', reactive: false, visible: false });
        global.window_group.add_child(this.actor);
        this._signals.connect(global.display, 'notify::focus-window', () => this._track(global.display.focus_window));
        this._signals.connect(global.display, 'restacked', () => this._restack());
        this._signals.connect(global.workspace_manager, 'active-workspace-changed', () => this._track(global.display.focus_window));
        this.updateStyle();
        this._track(global.display.focus_window);
    }

    updateStyle() {
        const s = this._c.settings;
        const width = s.get('window-border-width');
        const radius = s.get('window-border-radius');
        let style = `border-width: ${width}px; border-radius: ${radius}px;`;
        if (s.get('window-use-custom-border-color'))
            style += ` border-color: ${s.get('window-border-color')};`;
        this.actor.set_style(style);
        this._update();
    }

    _track(win) {
        this._winSignals.disconnectAll();
        this._win = null;
        if (!win || !U.isTileable(win)) {
            this.actor.hide();
            return;
        }
        this._win = win;
        for (const sig of ['position-changed', 'size-changed', 'notify::minimized', 'notify::fullscreen', 'notify::maximized-horizontally', 'notify::maximized-vertically', 'workspace-changed'])
            this._winSignals.connect(win, sig, () => this._update());
        this._winSignals.connect(win, 'unmanaged', () => this._track(null));
        this._update();
    }

    _restack() {
        const wa = this._win ? U.windowActor(this._win) : null;
        if (!wa || wa.get_parent() !== this.actor.get_parent())
            return;
        try {
            global.window_group.set_child_above_sibling(this.actor, wa);
        } catch (e) { /* ignore */ }
    }

    _update() {
        const win = this._win;
        if (!win || win.minimized || win.is_fullscreen() || U.isMaximized(win) ||
            !win.located_on_workspace(global.workspace_manager.get_active_workspace())) {
            this.actor.hide();
            return;
        }
        const r = U.frameRect(win);
        const w = Math.round(this._c.settings.get('window-border-width') * U.scaleFactor());
        this.actor.set_position(r.x - w, r.y - w);
        this.actor.set_size(r.width + w * 2, r.height + w * 2);
        this.actor.show();
        this._restack();
    }

    destroy() {
        this._winSignals.disconnectAll();
        this._signals.disconnectAll();
        this.actor.destroy();
    }
};
