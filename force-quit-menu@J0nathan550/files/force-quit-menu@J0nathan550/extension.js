// Adds a "Force quit" item to the right-click menu of the Grouped window list
// applet, to kill frozen apps from the panel.
//
// Cinnamon caches xlet modules by file path, so requiring the applet's menus.js
// here returns the exact module the running taskbar instances use. Patching its
// menu class prototype affects every panel without forking the applet.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Gettext = imports.gettext;
const PopupMenu = imports.ui.popupMenu;
const AppletManager = imports.ui.appletManager;
const FileUtils = imports.misc.fileUtils;

const UUID = 'force-quit-menu@J0nathan550';
const GWL_UUID = 'grouped-window-list@cinnamon.org';

Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + '/locale');

function _(text) {
    return Gettext.dgettext(UUID, text);
}

let menuProto = null;
let originalPopulateMenu = null;
let ownPid = 0;

function getAppletDir() {
    const meta = AppletManager.appletMeta && AppletManager.appletMeta[GWL_UUID];
    return meta ? meta.path : `/usr/share/cinnamon/applets/${GWL_UUID}`;
}

function forceQuitGroup(groupState) {
    // Snapshot first: killing a window triggers removals from metaWindows.
    const metaWindows = groupState.metaWindows.slice();
    const killedPids = new Set();

    for (const metaWindow of metaWindows) {
        const pid = metaWindow.get_pid();
        if (pid === ownPid) continue; // never take Cinnamon down with it
        if (pid > 0) {
            if (killedPids.has(pid)) continue;
            killedPids.add(pid);
        }
        // SIGKILLs the owning process (PID resolved by the X server), falling
        // back to XKillClient, so it works even when the app is deadlocked.
        metaWindow.kill();
    }
}

function populateMenuWithForceQuit(...args) {
    originalPopulateMenu.apply(this, args);

    const {groupState} = this;
    if (!groupState || !groupState.metaWindows || groupState.metaWindows.length === 0) return;

    const label = groupState.metaWindows.length > 1 ? _('Force quit all') : _('Force quit');
    const item = new PopupMenu.PopupIconMenuItem(label, 'process-stop', St.IconType.SYMBOLIC);
    this.signals.connect(item, 'activate', () => forceQuitGroup(groupState));

    // Place it right after "Close" / "Close all", before the trailing separator.
    const items = this._getMenuItems();
    const last = items[items.length - 1];
    if (last instanceof PopupMenu.PopupSeparatorMenuItem) {
        this.addMenuItem(item, items.length - 1);
    } else {
        this.addMenuItem(item);
    }
}

function init(metadata) {
    ownPid = new Gio.Credentials().get_unix_pid();
}

function enable() {
    const dir = getAppletDir();
    let menus = null;
    try {
        menus = FileUtils.requireModule(`${dir}/menus.js`, dir, null, 'applet');
    } catch (e) {
        global.logError(`[${UUID}] Could not load ${dir}/menus.js: ${e}`);
        return;
    }
    if (!menus || !menus.AppMenuButtonRightClickMenu) {
        global.logError(`[${UUID}] Could not find AppMenuButtonRightClickMenu in ${dir}/menus.js`);
        return;
    }
    menuProto = menus.AppMenuButtonRightClickMenu.prototype;
    originalPopulateMenu = menuProto.populateMenu;
    menuProto.populateMenu = populateMenuWithForceQuit;
}

function disable() {
    if (menuProto && originalPopulateMenu) {
        menuProto.populateMenu = originalPopulateMenu;
    }
    menuProto = null;
    originalPopulateMenu = null;
}
