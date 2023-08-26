/* Cinnamon Extension: Cinnamon-Maximus v0.4.0
 * Release Date: 2020.07.17
 *
 * Author:
 * - Fatih Mete <fatihmete@live.com>
 *
 * Other contributors:
 * - Anton Danilov <littlesmilingcloud@gmail.com>
 *
 * This extension adopted for cinnamon, maximus-gnome-shell-extension
 * https://bitbucket.org/mathematicalcoffee/maximus-gnome-shell-extension/overview
 *
 * Maximus v2.1
 * Amy Chan <mathematical.coffee@gmail.com>
 * Other contributors:
 * - Michael Kirk
 * May-- 2012.
 *
 * This extension attempts to emulate the Maximus package[1] that
 * Ubuntu Netbook Remix had, back when people still used that.
 *
 * Basically whenever a window is maximized, its window decorations (title
 * bar, etc) are hidden so as to space a bit of vertical screen real-estate.
 *
 * This may sound petty, but believe me, on a 10" netbook it's fantastic!
 * The only information lost is the title of the window, and in GNOME-shell
 * you already have the current application's name in the top bar and can
 * even get the window's title with the StatusTitleBar extension[2].
 *
 * Note that since the title bar for the window is gone when it's maximized,
 * you might find it difficult to unmaximize the window.
 * In this case, I recommend either the Window Options shell extension[3] which
 * adds the minimize/restore/maximize/etc window menu to your title bar (NOTE:
 * I wrote that, so it's a shameless plug),  OR
 * refresh your memory on your system's keyboard shortcut for unmaximizing a window
 * (for me it's Ctrl + Super + Down to unmaximize, Ctrl + Super + Up to maximize).
 *
 * Small idiosyncracies:
 * Note - these are simple enough for me to implement so if enough people let
 * me know that they want this behaviour, I'll do it.
 *
 * * the original Maximus also maximized all windows on startup.
 *   This doesn't (it was annoying).
 *
 * Help! It didn't work/I found a bug!
 * 1. Make sure you can *reproduce* the bug reliably.
 * 2. Do 'Ctrl + F2' and 'lg' and see if there are any errors produced by Maximus,
 *    both in the 'Errors' window *and* the 'Extensions' > 'Maximus' > 'Show Errors'
 *    tab (the 'Show Errors' is in GNOME 3.4+ only I think).
 * 3. Disable all your extensions except Maximus and see if you can still reproduce
 *    the bug. If so, mention this.
 * 4. If you can't reproduce th bug with all extensions but Maximus disabled, then
 *    gradually enable your extensions one-by-one until you work out which one(s)
 *    together cause the bug, and mention these.
 * 5. Open a new issue at [4].
 * 6. Include how you can reproduce the bug and any relevant information from 2--4.
 * 7. Also include:
 * - your version of the extension (in metadata.json)
 * - list of all your installed extensions (including disabled ones, as
 *   this is no guarantee they won't interfere with other extensions)
 * - your version of GNOME-shell (gnome-shell --version).
 * 8. I'll try get back to you with a fix.
 * (Brownie points: open a terminal, do `gnome-shell --replace` and reproduce the
 *  bug. Include any errors that pop up in this terminal.)
 *
 *
 * Note:
 * It's actually possible to get the undecorate-on-maximize behaviour without
 * needing this extension. See the link [5] and in particular, the bit on editing
 * your metacity theme metacity-theme-3.xml. ("Method 2: editing the theme").
 *
 * References:
 * [1]:https://launchpad.net/maximus
 * [2]:https://extensions.gnome.org/extension/59/status-title-bar/
 * [3]:https://bitbucket.org/mathematicalcoffee/window-options-gnome-shell-extension
 * [4]:https://bitbucket.org/mathematicalcoffee/maximus-gnome-shell-extension/issues
 * [5]:http://www.webupd8.org/2011/05/how-to-remove-maximized-windows.html
 *
 */

/*** Code proper, don't edit anything below **/
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Cinnamon = imports.gi.Cinnamon;
const Util = imports.misc.util;
const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
/*
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Prefs = Me.imports.prefs;
*/
const uuid = "cinnamon-maximus@fmete";

Meta.MaximizeFlags.BOTH = (Meta.MaximizeFlags.VERTICAL | Meta.MaximizeFlags.HORIZONTAL);

let changeNWorkspacesEventID = 0;
let grabEventID = 0;
let idleTimerID = 0;
let maximizeEventID = 0;
let minimizeEventID = 0;
let sizeChangeEventID = 0;
let tileEventID = 0;

let workspaces = [];

let oldFullscreenPref = null;
let settings = null;

let commaRegexp = new RegExp(/,/, "g");

let useAutoUndecorList = false;
let autoUndecorAppsRegexp;

let useIgnoreList = false;
let ignoreAppsRegexp;

/** Logging helper function
 *
 * Writes the log message with additional prefix depends on settings.
 * If the log message should be write unconditionally, just pass `true`
 * in the second parameter.
 */
function logMessage(message, alwaysLog = false) {
    if (alwaysLog || settings.enableLogs) {
        global.log(`[maximus] ${message}`);
    }
}

function logError(error, alwaysLog = false) {
    if (alwaysLog || settings.enableLogs) {
        global.logError(error);
    }
}

/** Guesses the X ID of a window.
 *
 * This method used get_xwindow() previously, which is not available anymore
 * (see https://discourse.gnome.org/t/get-window-id-of-a-window-object-window-get-xwindow-doesnt-exist/10956)
 * Now X ID is retrieved from get_description() instead.
 */
function guessWindowXID(win) {
    let id = null;
    try {
        id = win.get_description();
        if (id && id.indexOf('0x') === 0)
            return parseInt(id, 16);
    } catch (err) {
        logError(err);
    }
    // debugging for when people find bugs.. always logging this message.
    logMessage(`Could not find XID for window with title '${win.title}'`, true);
    return null;
}

/** Decorates/Undecorates a window.
 *
 * If I use set_decorations(0) from within the GNOME shell extension (i.e.
 *  from within the compositor process), the window dies.
 * If I use the same code but use `gjs` to run it, the window undecorates
 *  properly.
 *
 * Hence I have to make some sort of external call to do the undecoration.
 * I could use 'gjs' on a javascript file (and I'm pretty sure this is installed
 *  with GNOME-shell too), but I decided to use a system call to xprop and set
 *  the window's `_MOTIF_WM_HINTS` property to ask for undecoration.
 *
 * We can use xprop using the window's title to identify the window, but
 *  prefer to use the window's X ID (in case the title changes, or there are
 *  multiple windows with the same title).
 *
 * See here for xprop usage for undecoration:
 * http://xrunhprof.wordpress.com/2009/04/13/removing-decorations-in-metacity/
 *
 * @param {Meta.Window} win - window to undecorate.
 */
function setDecorated(win, decorated) {
    /* Undecorate with xprop
     * 1 == DECOR_ALL
     */
    let id = guessWindowXID(win),
        cmd = [ "xprop",
                "-id", "0x%x".format(id),
                "-f", "_MOTIF_WM_HINTS", "32c",
                "-set", "_MOTIF_WM_HINTS",
                ( decorated ? "0x2, 0x0, 0x1, 0x0, 0x0" : "0x2, 0x0, 0x2, 0x0, 0x0" )
        ];

    /* _MOTIF_WM_HINTS: see MwmUtil.h from OpenMotif source (cvs.openmotif.org),
     *  or rudimentary documentation here:
     * http://odl.sysworks.biz/disk$cddoc04sep11/decw$book/d3b0aa63.p264.decw$book
     *
     * Struct { flags, functions, decorations, input_mode, status }.
     * Flags: what the hints are for. (functions, decorations, input mode and/or status).
     * Functions: minimize, maximize, close, ...
     * Decorations: title, border, all, none, ...
     * Input Mode: modeless, application modal, system model, ..
     * Status: tearoff window.
     */

    // fallback: if couldn't get id for some reason, use the window's name
    if (!id) {
        cmd[1] = "-name";
        cmd[2] = win.title;
    }
    logMessage(cmd.join(" "));
    Util.spawn(cmd);
    // #25: when undecorating a Qt app (texmaker, keepassx) somehow focus is lost.
    // However, is there a use case where this would happen legitimately?
    // For some reaons the Qt apps seem to take a while to be refocused.
    if (settings.keepQTAppsFocus) {
        Meta.later_add(Meta.LaterType.IDLE, function () {
            if (win.focus) {
                win.focus(global.get_current_time());
            } else {
                win.activate(global.get_current_time());
            }
        });
    }
}

/** Returns whether we should affect `win`'s decoration at all.
 *
 * If the window was originally undecorated we do not do anything with it
 *  (decorate or undecorate),
 *
 * Also if it's in the blacklist we don't do anything with it.
 *
 * @returns {boolean} whether the window is originally decorated and not in
 * the blacklist.
 */
function shouldAffect(win) {

    let verdict = true;

    if (!win._maximusDecoratedOriginal) {
        verdict = false;
    }

    if (isHalfMaximized(win) && settings.undecorateTile === false) {
        verdict = false;
    }

    if (useIgnoreList && ignoreAppsRegexp) {
        let activeAppName = win.get_wm_class();
        if (activeAppName) {
            let ignoredFlag = ignoreAppsRegexp.test(activeAppName);
            logMessage(`app name = ${activeAppName} ignored = ${ignoredFlag}`);
            verdict = !ignoredFlag;
        }
    }

    return verdict;
}

/** Checks if `win` should be undecorated, based *purely* off its maximized
 * state (doesn't incorporate blacklist).
 *
 * If it's fully-maximized this returns true.
 *
 * Use with `shouldAffect` to get a full check..
 */
function isFullyMaximized(win) {
    let max = win.get_maximized();
    return ((max === Meta.MaximizeFlags.BOTH));
}

/** Checks if `win` is half-maximized (only vertically or horizontally)
 *
 */
function isHalfMaximized(win) {
    let max = win.get_maximized();
    return ((max === Meta.MaximizeFlags.VERTICAL) || (max === Meta.MaximizeFlags.HORIZONTAL));
}

/** Checks if `win` is fully maximized.
 * If so, undecorates the window. */
function possiblyUndecorate(win) {
    if (isFullyMaximized(win)) {
        if (!win.get_compositor_private()) {
            Mainloop.idle_add(function () {
                setDecorated(win, false);
                return false; // define as one-time event
            });
        } else {
            setDecorated(win, false);
        }
    }
}

/** Checks if `win` is fully maximized.
 * If *NOT*, redecorates the window. */
function possiblyRedecorate(win) {
    if (!isFullyMaximized(win)) {
        if (!win.get_compositor_private()) {
            Mainloop.idle_add(function () {
                setDecorated(win, true);
                return false; // define as one-time event
            });
        } else {
            setDecorated(win, true);
        }
    }
}

/**** Callbacks ****/

/** Recent versions of Cinnamon use this function
 */
function onSizeChange(shellwm, actor, change) {
    if (change === Meta.SizeChange.MAXIMIZE) {
        onMaximize(shellwm, actor);
    }
    if (change === Meta.SizeChange.UNMAXIMIZE) {
        onUnmaximize(shellwm, actor);
    }
    if (!!Meta.SizeChange.TILE && change === Meta.SizeChange.TILE) {
        onMaximize(shellwm, actor);
    }
}

/** Called when a window is maximized, including half-maximization.
 *
 * If the window is not in the blacklist (or is in the whitelist), we undecorate
 * it.
 *
 * @param {Meta.WindowActor} actor - the window actor for the maximized window.
 * It is expected to be maximized (in at least one direction) already - we will
 * not check before undecorating.
 */
function onMaximize(shellwm, actor) {
    if (!actor) {
        return;
    }
    let win = actor.get_meta_window();
    if (!shouldAffect(win)) {
        return;
    }
    // note: window is maximized by this point.
    logMessage(`onMaximize: ${win.title} [${win.get_wm_class()}]`);
    setDecorated(win, false);
}

/** Called when a window is unmaximized.
 *
 * If the window is not in the blacklist (or is in the whitelist), we decorate
 * it.
 * If the window has been undecorated by hotkey, we keep it undecorated.
 *
 * @param {Meta.WindowActor} actor - the window actor for the unmaximized window.
 * It is expected to be unmaximized - we will not check before decorating.
 */
function onUnmaximize(shellwm, actor) {

    if (!actor) {
        return;
    }
    let win = actor.meta_window;
    if (!shouldAffect(win) || win._maximusUndecorated === true) {
        return;
    }
    logMessage(`onUnmaximize: ${win.title} [${win.get_wm_class()}]`);
    // if the user is unmaximizing by dragging, we wait to decorate until they
    // have dropped the window, so that we don't force the user to drop
    // the window prematurely with the redecorate (which stops the grab).
    if (global.display.get_grab_op() === Meta.GrabOp.MOVING) {
        if (grabEventID) {
            // shouldn't happen, but oh well.
            global.display.disconnect(grabEventID);
            grabEventID = 0;
        }
        grabEventID = global.display.connect("grab-op-end", function () {
            if (settings.undecorateTile && (win.tile_type == Meta.WindowTileType.TILED || win.tile_type == Meta.WindowTileType.SNAPPED)) {
                return;
            } else {
                possiblyRedecorate(win);
                global.display.disconnect(grabEventID);
                grabEventID = 0;
            }
        });
    } else {
        setDecorated(win, true);
    }
}

/** Callback when a window is added in any of the workspaces.
 * This includes a window switching to another workspace.
 *
 * If it is a window we already know about, we do nothing.
 *
 * Otherwise, we:
 *
 * * record the window as on we know about.
 * * store whether the window was initially decorated (e.g. Chrome windows aren't usually).
 *  + if the window is maximized, we undecorate it (see {@link undecorate});
 *
 * @param {Meta.Window} win - the window that was added.
 *
 * @see undecorate
 */
function onWindowAdded(ws, win) {
    // if the window is simply switching workspaces, it will trigger a
    // window-added signal. We don't want to reprocess it then because we already
    // have.
    logMessage(
        `onWindowAdded:
            ${win.title}/${win.get_wm_class()}
            initially decorated? ${win._maximusDecoratedOriginal}`
    );

    if (settings.undecorateAll && !ignoreAppsRegexp.test(win.get_wm_class())) {
        setDecorated(win, false);
    } else if (useAutoUndecorList && autoUndecorAppsRegexp.test(win.get_wm_class())) {
        setDecorated(win, false);
        win._maximusUndecorated = true;
    } else {
        if (win._maximusDecoratedOriginal !== undefined) {
            return;
        }

        /* Newly-created windows are added to the workspace before
         * the compositor knows about them: get_compositor_private() is null.
         * Additionally things like .get_maximized() aren't properly done yet.
         * (see workspace.js _doAddWindow)
         */
        win._maximusDecoratedOriginal = win.decorated !== false || false;

        if (!shouldAffect(win)) {
            return;
        }

        // if it is added initially maximized, we undecorate it.
        possiblyUndecorate(win);
    }
}

/** Callback whenever the number of workspaces changes.
 *
 * We ensure that we are listening to the 'window-added' signal on each f
 * the workspaces.
 *
 * @see onWindowAdded
 */
function onChangeNWorkspaces() {
    let ws,
        i = workspaces.length;
    while (i--) {
        workspaces[i].disconnect(workspaces[i]._MaximusWindowAddedId);
    }

    workspaces = [];
    i = global.screen.n_workspaces;
    while (i--) {
        ws = global.screen.get_workspace_by_index(i);
        workspaces.push(ws);
        // we need to add a Mainloop.idle_add, or else in onWindowAdded the
        // window's maximized state is not correct yet.
        // ws._MaximusWindowAddedId = ws.connect('window-added', onWindowAdded);
        ws._MaximusWindowAddedId = ws.connect("window-added", function (ws, win) {
            Mainloop.idle_add(function () { onWindowAdded(ws, win); return false; })
        });
    }
}

/** Start listening to events and undecorate already-existing windows. */
function startUndecorating() {
    logMessage("startUndecorating", true);
    // cache some variables for convenience
    useIgnoreList = settings.useIgnoreList;
    let ignoreRegexpStr = settings.ignoreAppsList.replace(commaRegexp, "|");
    if (useIgnoreList && ignoreRegexpStr) {
        try {
            ignoreAppsRegexp = new RegExp(ignoreRegexpStr, "i");
            logMessage(`ignore list regexp '${ignoreRegexpStr}' has been compiled successfully`);
        } catch(e) {
            logMessage(`exception on ignore list regexp '${ignoreRegexpStr}' compile: ${e.message}`, true);
            useIgnoreList = false;
        }
    } else {
        useIgnoreList = false;
    }

    logMessage(`ignore list enabled = ${useIgnoreList}`);

    useAutoUndecorList = settings.useAutoUndecorList;
    let autoUndecorRegexpStr = settings.autoUndecorAppsList.replace(commaRegexp, "|");
    if (useAutoUndecorList && autoUndecorRegexpStr) {
        try {
            autoUndecorAppsRegexp = new RegExp(autoUndecorRegexpStr, "iu");
            logMessage(`auto undecor regexp '${autoUndecorRegexpStr}' has been compiled successfully`);
        } catch(e) {
            logMessage(`exception on auto undecor regexp '${autoUndecorRegexpStr}' compile: ${e.message}`, true);
            useAutoUndecorList = false;
        }
    } else {
        useAutoUndecorList = false;
    }

    logMessage(`auto undecorate enabled = ${useAutoUndecorList}`);

    if (settings.onlyManual == false) {
        /* Connect events */
        changeNWorkspacesEventID = global.screen.connect("notify::n-workspaces", onChangeNWorkspaces);
        try {
            // Cinnamon 5.4 requires using size-change instead of maximize and unmaximize
            sizeChangeEventID = global.window_manager.connect("size-change", onSizeChange);
        } catch (e) {
            if (e.message === "No signal 'size-change' on object 'CinnamonWM'") {
                // we must listen to maximize and unmaximize events when size-change is not available (Cinnamon versions older than 5.4)
                maximizeEventID = global.window_manager.connect("maximize", onMaximize);
                minimizeEventID = global.window_manager.connect("unmaximize", onUnmaximize);
            } else {
                throw e;
            }
        }
        if (settings.undecorateTile == true) {
            try {
                tileEventID = global.window_manager.connect("tile", onMaximize);
            } catch (e) {
                logMessage(`ignoring exception on connecting to tile signal`);
            }
        }
    }
    /* this is needed to prevent Metacity from interpreting an attempted drag
     * of an undecorated window as a fullscreen request. Otherwise thunderbird
     * (in particular) has no way to get out of fullscreen, resulting in the user
     * being stuck there.
     * See issue #6
     * https://bitbucket.org/mathematicalcoffee/maximus-gnome-shell-extension/issue/6
     *
     * Once we can properly set the window's hide_titlebar_when_maximized property
     * this will no loner be necessary.
     */
    oldFullscreenPref = Meta.prefs_get_force_fullscreen();
    Meta.prefs_set_force_fullscreen(false);


    /* Go through already-maximized windows & undecorate.
     * This needs a delay as the window list is not yet loaded
     *  when the extension is loaded.
     * Also, connect up the 'window-added' event.
     * Note that we do not connect this before the onMaximize loop
     *  because when one restarts the gnome-shell, window-added gets
     *  fired for every currently-existing window, and then
     *  these windows will have onMaximize called twice on them.
     */
    idleTimerID = Mainloop.idle_add(function () {
        let winList = global.get_window_actors().map(function (w) { return w.meta_window; }),
            i       = winList.length;
        while (i--) {
            let win = winList[i];
            if (win.window_type === Meta.WindowType.DESKTOP) {
                continue;
            }
            if (settings.onlyManual == false) {
                onWindowAdded(null, win);
            }
        }
        if (settings.onlyManual == false) {
            onChangeNWorkspaces();
        }
        idleTimerID = 0;
        return false; // define as one-time event
    });
}

/** Stop listening to events, restore all windows back to their original
 * decoration state. */
function stopUndecorating() {
    if (maximizeEventID) global.window_manager.disconnect(maximizeEventID);
    if (minimizeEventID) global.window_manager.disconnect(minimizeEventID);
    if (sizeChangeEventID) global.window_manager.disconnect(sizeChangeEventID);
    if (tileEventID) global.window_manager.disconnect(tileEventID);
    if (changeNWorkspacesEventID) global.screen.disconnect(changeNWorkspacesEventID);
    if (grabEventID) global.display.disconnect(grabEventID);
    maximizeEventID = 0;
    minimizeEventID = 0;
    sizeChangeEventID = 0;
    tileEventID = 0;
    changeNWorkspacesEventID = 0;
    grabEventID = 0;

    /* disconnect window-added from workspaces */
    let i = workspaces.length;
    while (i--) {
        workspaces[i].disconnect(workspaces[i]._MaximusWindowAddedId);
        delete workspaces[i]._MaximusWindowAddedId;
    }
    workspaces = [];

    /* redecorate undecorated windows we screwed with */
    if (idleTimerID) {
        Mainloop.source_remove(idleTimerID);
        idleTimerID = 0;
    }
    let winList = global.get_window_actors().map(function (w) { return w.meta_window; });
    let j = winList.length;
    while (j--) {
        let win = winList[j];
        if (win.window_type === Meta.WindowType.DESKTOP) {
            continue;
        }

        logMessage(`stopUndecorating: ${win.title}`);
        // if it wasn't decorated originally, we haven't done anything to it so
        // don't need to undo anything.
        if (win._maximusDecoratedOriginal || win._maximusUndecorated) {
            setDecorated(win, true);
        }
        delete win._maximusDecoratedOriginal;
        delete win._maximusUndecorated;
    }

    if (oldFullscreenPref !== null) {
        /* restore old meta force fullscreen pref */
        Meta.prefs_set_force_fullscreen(oldFullscreenPref);
        oldFullscreenPref = null;
    }
}

function toggleDecorActiveWindow() {
    let win = global.display.focus_window;
    if (win) {
        if (win._maximusUndecorated !== true) {
            logMessage(`undecorate: win ${win.title} _maximusDecoratedState: ${win._maximusUndecorated}`);
            setDecorated(win, false);
            win._maximusUndecorated = true;
        } else {
            logMessage(`decorate: win ${win.title} _maximusDecoratedState: ${win._maximusUndecorated}`);
            setDecorated(win, true);
            win._maximusUndecorated = false;
        }
    } else {
        logMessage("active window not found!", true);
    }
    return true;
}

function enableHotkey() {
    disableHotkey();
    if (settings.useHotkey) {
        Main.keybindingManager.addHotKey('toggleDecor', settings.hotkey, toggleDecorActiveWindow);
    }
}

function disableHotkey() {
    Main.keybindingManager.removeHotKey('toggleDecor');
}

function init(metadata)
{
    settings = new SettingsHandler(metadata.uuid);
}

function SettingsHandler(uuid) {
    this._init(uuid);
}

SettingsHandler.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "onlyManual", "onlyManual", function(){
                stopUndecorating();
                enableHotkey();
                startUndecorating();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "useHotkey", "useHotkey", function(){
                enableHotkey();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "hotkey", "hotkey", function(){
                enableHotkey();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "undecorateTile", "undecorateTile", function(){
                stopUndecorating();
                startUndecorating();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "undecorateAll", "undecorateAll", function(){
                stopUndecorating();
                startUndecorating();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "useIgnoreList", "useIgnoreList", function(){
                stopUndecorating();
                startUndecorating();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "ignoreAppsList", "ignoreAppsList", function(){
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "useAutoUndecorList", "useAutoUndecorList", function(){
                stopUndecorating();
                startUndecorating();
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "autoUndecorAppsList", "autoUndecorAppsList", function(){
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "keepQTAppsFocus", "keepQTAppsFocus", function(){
            });

        this.settings.bindProperty(Settings.BindingDirection.IN,
            "enableLogs", "enableLogs", function(){
            });
    }
}

function enable() {
    startUndecorating();
    enableHotkey();
}

function disable() {
    disableHotkey();
    stopUndecorating();
}
