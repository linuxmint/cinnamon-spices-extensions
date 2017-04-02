const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;

const LAST_WINDOW_GRACE_TIME = 1000;

const WorkspaceTracker = new Lang.Class({
    Name: "WorkspaceTracker",

    _init: function(wm) {
        this._wm = wm;

        this._workspaces = [];
        this._checkWorkspacesId = 0;

        this._pauseWorkspaceCheck = false;

        let tracker = Cinnamon.WindowTracker.get_default();
        tracker.connect("startup-sequence-changed", Lang.bind(this, this._queueCheckWorkspaces));

        global.screen.connect("notify::n-workspaces", Lang.bind(this, this._nWorkspacesChanged));
        global.window_manager.connect("switch-workspace", Lang.bind(this, this._queueCheckWorkspaces));

        global.screen.connect("window-entered-monitor", Lang.bind(this, this._windowEnteredMonitor));
        global.screen.connect("window-left-monitor", Lang.bind(this, this._windowLeftMonitor));
        global.screen.connect("restacked", Lang.bind(this, this._windowsRestacked));

        this._workspaceSettings = this._getWorkspaceSettings();
        this._workspaceSettings.connect("changed::dynamic-workspaces", Lang.bind(this, this._queueCheckWorkspaces));

        this._nWorkspacesChanged();
    },

    _getWorkspaceSettings: function() {
        // let settings = global.get_overrides_settings();
        // if (settings &&
        //     settings.settings_schema.list_keys().indexOf("dynamic-workspaces") > -1)
        //     return settings;
        return new Gio.Settings({
            schema_id: "org.cinnamon.muffin"
        });
    },

    blockUpdates: function() {
        this._pauseWorkspaceCheck = true;
    },

    unblockUpdates: function() {
        this._pauseWorkspaceCheck = false;
    },

    _checkWorkspaces: function() {
        let i;
        let emptyWorkspaces = [];

        if (!Meta.prefs_get_dynamic_workspaces()) {
            this._checkWorkspacesId = 0;
            return false;
        }

        // Update workspaces only if Dynamic Workspace Management has not been paused by some other function
        if (this._pauseWorkspaceCheck)
            return true;

        for (i = 0; i < this._workspaces.length; i++) {
            let lastRemoved = this._workspaces[i]._lastRemovedWindow;
            if ((lastRemoved &&
                    (lastRemoved.get_window_type() == Meta.WindowType.SPLASHSCREEN ||
                        lastRemoved.get_window_type() == Meta.WindowType.DIALOG ||
                        lastRemoved.get_window_type() == Meta.WindowType.MODAL_DIALOG)) ||
                this._workspaces[i]._keepAliveId)
                emptyWorkspaces[i] = false;
            else
                emptyWorkspaces[i] = true;
        }

        let sequences = Cinnamon.WindowTracker.get_default().get_startup_sequences();
        for (i = 0; i < sequences.length; i++) {
            let index = sequences[i].get_workspace();
            if (index >= 0 && index <= global.screen.n_workspaces)
                emptyWorkspaces[index] = false;
        }

        let windows = global.get_window_actors();
        for (i = 0; i < windows.length; i++) {
            let actor = windows[i];
            let win = actor.get_meta_window();

            if (win.is_on_all_workspaces())
                continue;

            let workspaceIndex = win.get_workspace().index();
            emptyWorkspaces[workspaceIndex] = false;
        }

        // If we don't have an empty workspace at the end, add one
        if (!emptyWorkspaces[emptyWorkspaces.length - 1]) {
            global.screen.append_new_workspace(false, global.get_current_time());
            emptyWorkspaces.push(false);
        }

        let activeWorkspaceIndex = global.screen.get_active_workspace_index();
        emptyWorkspaces[activeWorkspaceIndex] = false;

        // Delete other empty workspaces; do it from the end to avoid index changes
        for (i = emptyWorkspaces.length - 2; i >= 0; i--) {
            if (emptyWorkspaces[i])
                global.screen.remove_workspace(this._workspaces[i], global.get_current_time());
        }

        this._checkWorkspacesId = 0;
        return false;
    },

    keepWorkspaceAlive: function(workspace, duration) {
        if (workspace._keepAliveId)
            Mainloop.source_remove(workspace._keepAliveId);

        workspace._keepAliveId = Mainloop.timeout_add(duration, Lang.bind(this, function() {
            workspace._keepAliveId = 0;
            this._queueCheckWorkspaces();
            return GLib.SOURCE_REMOVE;
        }));
        GLib.Source.set_name_by_id(workspace._keepAliveId, "[Cinnamon Tweaks] this._queueCheckWorkspaces");
    },

    _windowRemoved: function(workspace, window) {
        workspace._lastRemovedWindow = window;
        this._queueCheckWorkspaces();
        let id = Mainloop.timeout_add(LAST_WINDOW_GRACE_TIME, Lang.bind(this, function() {
            if (workspace._lastRemovedWindow == window) {
                workspace._lastRemovedWindow = null;
                this._queueCheckWorkspaces();
            }
            return GLib.SOURCE_REMOVE;
        }));
        GLib.Source.set_name_by_id(id, "[Cinnamon Tweaks] this._queueCheckWorkspaces");
    },

    _windowLeftMonitor: function(metaScreen, monitorIndex, metaWin) { // jshint ignore:line
        // If the window left the primary monitor, that
        // might make that workspace empty
        if (monitorIndex == Main.layoutManager.primaryIndex)
            this._queueCheckWorkspaces();
    },

    _windowEnteredMonitor: function(metaScreen, monitorIndex, metaWin) { // jshint ignore:line
        // If the window entered the primary monitor, that
        // might make that workspace non-empty
        if (monitorIndex == Main.layoutManager.primaryIndex)
            this._queueCheckWorkspaces();
    },

    _windowsRestacked: function() {
        // Figure out where the pointer is in case we lost track of
        // it during a grab. (In particular, if a trayicon popup menu
        // is dismissed, see if we need to close the message tray.)
        global.sync_pointer();
    },

    _queueCheckWorkspaces: function() {
        if (this._checkWorkspacesId === 0)
            this._checkWorkspacesId = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, this._checkWorkspaces));
    },

    _nWorkspacesChanged: function() {
        let oldNumWorkspaces = this._workspaces.length;
        let newNumWorkspaces = global.screen.n_workspaces;

        if (oldNumWorkspaces == newNumWorkspaces)
            return false;

        let lostWorkspaces = []; // jshint ignore:line
        if (newNumWorkspaces > oldNumWorkspaces) {
            let w;

            // Assume workspaces are only added at the end
            for (w = oldNumWorkspaces; w < newNumWorkspaces; w++)
                this._workspaces[w] = global.screen.get_workspace_by_index(w);

            for (w = oldNumWorkspaces; w < newNumWorkspaces; w++) {
                let workspace = this._workspaces[w];
                workspace._windowAddedId = workspace.connect("window-added", Lang.bind(this, this._queueCheckWorkspaces));
                workspace._windowRemovedId = workspace.connect("window-removed", Lang.bind(this, this._windowRemoved));
            }

        } else {
            // Assume workspaces are only removed sequentially
            // (e.g. 2,3,4 - not 2,4,7)
            let removedIndex;
            let removedNum = oldNumWorkspaces - newNumWorkspaces;
            for (let w = 0; w < oldNumWorkspaces; w++) {
                let workspace = global.screen.get_workspace_by_index(w);
                if (this._workspaces[w] != workspace) {
                    removedIndex = w;
                    break;
                }
            }

            let lostWorkspaces = this._workspaces.splice(removedIndex, removedNum);
            lostWorkspaces.forEach(function(workspace) {
                workspace.disconnect(workspace._windowAddedId);
                workspace.disconnect(workspace._windowRemovedId);
            });
        }

        this._queueCheckWorkspaces();

        return false;
    }
});

/*
exported WorkspaceTracker
*/
