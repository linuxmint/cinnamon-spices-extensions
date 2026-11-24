/* SPDX-License-Identifier: MIT */
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Gettext = imports.gettext;
const Applet = imports.ui.applet;
const Dialog = imports.ui.dialog;
const ModalDialog = imports.ui.modalDialog;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const AppletManager = imports.ui.appletManager;
const Settings = imports.ui.settings;

const UUID = 'force-stop@enisn';
const WINDOW_LIST_UUID = 'grouped-window-list@cinnamon.org';

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(text) {
    return Gettext.dgettext(UUID, text);
}

// A plain ModalDialog is dressed up instead of subclassing it: Cinnamon evaluates this file again
// whenever the extension is enabled, and registering the same GObject type a second time fails.
function confirmDialog(title, description, onConfirm) {
    const dialog = new ModalDialog.ModalDialog();
    dialog.contentLayout.add_child(new Dialog.MessageDialogContent({title, description}));
    dialog.addButton({label: _('Cancel'), action: () => dialog.close(), key: Clutter.KEY_Escape});
    dialog.addButton({label: _('Force Stop'), action: () => {
        dialog.close();
        onConfirm();
    }, destructive_action: true});
    return dialog;
}

function windowListGroups() {
    const groups = [];
    for (const definition of AppletManager.definitions || []) {
        const applet = definition && definition.applet;
        if (!applet || applet._uuid !== WINDOW_LIST_UUID) continue;
        for (const workspace of applet.workspaces || [])
            for (const group of (workspace && workspace.appGroups) || [])
                if (group) groups.push(group);
    }
    return groups;
}

// The right-click menu is a private class of the window list, so it is recognised by its shape.
function isWindowListMenu(menu) {
    if (!(menu instanceof Applet.AppletPopupMenu) || !('groupState' in menu)) return false;
    return Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(menu), 'populateMenu');
}

// /proc/<pid> is owned by the user a process runs as. Signals only reach our own processes. The menu
// needs the answer before it opens, and /proc answers from memory, so this lookup stays synchronous.
function processUserId(pid) {
    try {
        return Gio.File.new_for_path(`/proc/${pid}`)
            .query_info('unix::uid', Gio.FileQueryInfoFlags.NONE, null)
            .get_attribute_uint32('unix::uid');
    } catch (error) {
        return -1;
    }
}

const OWN_USER_ID = processUserId('self');
const isOwnProcess = (pid) => OWN_USER_ID >= 0 && processUserId(pid) === OWN_USER_ID;

// Lists the child processes of a process. They can be parented to any of its threads, so the
// "children" file of every thread is read. /proc lives in memory, so this touches no disk.
function childrenOf(pid, callback) {
    const task = Gio.File.new_for_path(`/proc/${pid}/task`);
    task.enumerate_children_async('standard::name', Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT, null, (source, result) => {
            const files = [];
            try {
                const threads = source.enumerate_children_finish(result);
                let info;
                while ((info = threads.next_file(null)) !== null)
                    files.push(task.get_child(info.get_name()).get_child('children'));
                threads.close(null);
            } catch (error) {
                // The process has already exited.
            }

            const children = [];
            let pending = files.length;
            if (pending === 0) {
                callback(children);
                return;
            }
            for (const file of files) {
                file.load_contents_async(null, (file, result) => {
                    try {
                        const contents = file.load_contents_finish(result)[1];
                        for (const child of String.fromCharCode.apply(null, contents).split(' '))
                            if (child) children.push(Number(child));
                    } catch (error) {
                        // A thread that has exited has no children left to stop.
                    }
                    pending--;
                    if (pending === 0) callback(children);
                });
            }
        });
}

// Collects everything a process started, directly or through its descendants.
function descendantsOf(pid, callback) {
    const found = new Set();
    const queue = [pid];
    const visit = () => {
        if (queue.length === 0) {
            callback([...found]);
            return;
        }
        childrenOf(queue.shift(), (children) => {
            for (const child of children) {
                if (found.has(child)) continue;
                found.add(child);
                queue.push(child);
            }
            visit();
        });
    };
    visit();
}

class ForceStop {
    constructor() {
        // Kept for as long as the settings could not be read.
        this.confirm = true;
        this.killChildren = false;
        this._closingMenu = null;
        this._dialog = null;
        this._menuPrototype = null;
    }

    enable() {
        const forceStop = this;
        this._originalAddMenu = PopupMenu.PopupMenuManager.prototype.addMenu;
        this._addMenuWrapper = function(menu, position) {
            forceStop._patch(menu);
            return forceStop._originalAddMenu.call(this, menu, position);
        };
        PopupMenu.PopupMenuManager.prototype.addMenu = this._addMenuWrapper;
        // Menus that already exist never pass through addMenu again.
        for (const group of windowListGroups()) {
            if (group.rightClickMenu) this._patch(group.rightClickMenu);
        }
    }

    disable() {
        if (this._closingMenu) {
            this._closingMenu.menu.disconnect(this._closingMenu.id);
            this._closingMenu = null;
        }
        if (this._dialog) this._dialog.close();
        this._restoreMenuPrototype();
        // Leave other extensions' later changes in place; our wrapper becomes inert.
        if (PopupMenu.PopupMenuManager.prototype.addMenu === this._addMenuWrapper)
            PopupMenu.PopupMenuManager.prototype.addMenu = this._originalAddMenu;
    }

    _patch(menu) {
        if (!isWindowListMenu(menu)) return;
        const prototype = Object.getPrototypeOf(menu);
        if (prototype === this._menuPrototype) return;
        // The window list was reloaded and this menu belongs to its new class.
        this._restoreMenuPrototype();

        const forceStop = this;
        this._originalPopulateMenu = prototype.populateMenu;
        this._menuPrototype = prototype;
        this._populateMenuWrapper = function(...args) {
            const result = forceStop._originalPopulateMenu.apply(this, args);
            try {
                forceStop._addItem(this);
            } catch (error) {
                // Never keep the stock menu from opening because of us.
                global.logError('Force Stop: ' + error.message);
            }
            return result;
        };
        prototype.populateMenu = this._populateMenuWrapper;
    }

    _restoreMenuPrototype() {
        if (this._menuPrototype && this._menuPrototype.populateMenu === this._populateMenuWrapper)
            this._menuPrototype.populateMenu = this._originalPopulateMenu;
        this._menuPrototype = null;
    }

    _addItem(menu) {
        const {lastFocused: metaWindow, metaWindows, appName} = menu.groupState;
        // Like the stock Close item, Force Stop needs a window to act on.
        if (!metaWindow || !metaWindows.length) return;

        const item = new PopupMenu.PopupIconMenuItem(_('Force Stop'), 'process-stop', St.IconType.SYMBOLIC);
        // Without a process of our own to signal there is nothing Force Stop could do.
        item.setSensitive(isOwnProcess(metaWindow.get_pid()));
        item.connect('activate', () => this._afterMenuCloses(menu, () => this._forceStop(metaWindow, appName)));

        // The stock menu ends its window controls with a separator, so keep Force Stop in that block.
        const items = menu._getMenuItems();
        const lastItem = items[items.length - 1];
        menu.addMenuItem(item, lastItem instanceof PopupMenu.PopupSeparatorMenuItem ? items.length - 1 : undefined);
    }

    // A popup menu holds an input grab while it is open. A modal dialog opened on top of it would
    // corrupt Cinnamon's modal stack, so the dialog waits until the menu has closed.
    _afterMenuCloses(menu, callback) {
        if (!menu.isOpen) {
            callback();
            return;
        }
        const id = menu.connect('open-state-changed', (actor, isOpen) => {
            if (isOpen) return;
            this._closingMenu = null;
            menu.disconnect(id);
            callback();
        });
        this._closingMenu = {menu, id};
    }

    _forceStop(metaWindow, appName) {
        const pid = metaWindow.get_pid();
        if (pid <= 0) return;
        if (!this.confirm) {
            this._kill(metaWindow, pid);
            return;
        }
        if (this._dialog) return;
        const what = this.killChildren ?
            _('Process %d and the processes it started will be stopped immediately, together with all of its windows. Unsaved changes will be lost.') :
            _('Process %d will be stopped immediately, together with all of its windows. Unsaved changes will be lost.');
        this._dialog = confirmDialog(_('Force Stop "%s"?').format(appName), what.format(pid),
            () => this._kill(metaWindow, pid));
        this._dialog.connect('closed', () => {
            this._dialog = null;
        });
        this._dialog.open();
    }

    _kill(metaWindow, pid) {
        // Muffin sends SIGKILL to the process that owns the window.
        if (!this.killChildren) {
            metaWindow.kill();
            return;
        }
        // The children have to be found first. Once the application is gone the kernel has
        // reparented them, and the tree can no longer be traced.
        descendantsOf(pid, (children) => {
            // GJS offers no way to signal a process it did not start itself, hence the kill command.
            const pids = [pid, ...children].map(String);
            try {
                Util.trySpawn(['kill', '-9', ...pids]);
            } catch (error) {
                global.logError('Force Stop: ' + error.message);
            }
        });
    }
}

let forceStop = null;
let settings = null;

function init() {}

function enable() {
    forceStop = new ForceStop();
    forceStop.enable();
    settings = new Settings.ExtensionSettings(forceStop, UUID);
    settings.bind('confirm', 'confirm');
    settings.bind('kill-children', 'killChildren');
    return forceStop;
}

function disable() {
    if (forceStop) forceStop.disable();
    if (settings) settings.finalize();
    forceStop = settings = null;
}
