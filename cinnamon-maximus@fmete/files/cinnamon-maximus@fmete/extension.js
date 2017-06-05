//Cinnamon Extension: Cinnamon-Maximus v0.3.1
//Release Date: 22 Nov 2014
//
//Author: Fatih Mete
//
//          Email: fatihmete@live.com

//This extension adopted for cinnamon, maximus-gnome-shell-extension
//https://bitbucket.org/mathematicalcoffee/maximus-gnome-shell-extension/overview
/*global global, log */ // <-- jshint
/*jshint unused:true */
/*
 * Maximus v2.1
 * Amy Chan <mathematical.coffee@gmail.com>
 * Other contributors:
 * - Michael Kirk
 * May-- 2012.
 *
 * This extension attempts to emulate the Maximus package[1] that
 * Ubuntu Netbook Remix had, back when people still used that.
 *
 * Basically whenever a window is maximised, its window decorations (title
 * bar, etc) are hidden so as to space a bit of vertical screen real-estate.
 *
 * This may sound petty, but believe me, on a 10" netbook it's fantastic!
 * The only information lost is the title of the window, and in GNOME-shell
 * you already have the current application's name in the top bar and can
 * even get the window's title with the StatusTitleBar extension[2].
 *
 * Note that since the title bar for the window is gone when it's maximised,
 * you might find it difficult to unmaximise the window.
 * In this case, I recommend either the Window Options shell extension[3] which
 * adds the minimise/restore/maximise/etc window menu to your title bar (NOTE:
 * I wrote that, so it's a shameless plug),  OR
 * refresh your memory on your system's keyboard shortcut for unmaximising a window
 * (for me it's Ctrl + Super + Down to unmaximise, Ctrl + Super + Up to maximise).
 *
 * Small idiosyncracies:
 * Note - these are simple enough for me to implement so if enough people let
 * me know that they want this behaviour, I'll do it.
 *
 * * the original Maximus also maximised all windows on startup.
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
 * It's actually possible to get the undecorate-on-maximise behaviour without
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

let maxID = null, minID = null, settingsChangedID = null, changeWorkspaceID = null, grabID = null;
let workspaces = [];
let oldFullscreenPref = null;
let settings = null;
let onetime = 0;
let USE_SET_HIDE_TITLEBAR;
let APP_LIST;
let IS_BLACKLIST;



function LOG(message) {
  //  log(message);
}

/** Guesses the X ID of a window.
 *
 * It is often in the window's title, being `"0x%x %10s".format(XID, window.title)`.
 * (See `mutter/src/core/window-props.c`).
 *
 * If we couldn't find it there, we use `win`'s actor, `win.get_compositor_private()`.
 * The actor's `x-window` property is the X ID of the window *actor*'s frame
 * (as opposed to the window itself).
 *
 * However, the child window of the window actor is the window itself, so by
 * using `xwininfo -children -id [actor's XID]` we can attempt to deduce the
 * window's X ID.
 *
 * It is not always foolproof, but works good enough for now.
 *
 * @param {Meta.Window} win - the window to guess the XID of. You wil get better
 * success if the window's actor (`win.get_compositor_private()`) exists.
 */
function guessWindowXID(win) {
    let id = null;
    /* if window title has non-utf8 characters, get_description() complains
     * "Failed to convert UTF-8 string to JS string: Invalid byte sequence in conversion input",
     * event though get_title() works.
     */
    try {
        id = win.get_description().match(/0x[0-9a-f]+/);
        if (id) {
            id = id[0];
            return id;
        }
    } catch (err) {
    }

    // use xwininfo, take first child.
    let act = win.get_compositor_private();
    if (act) {
        id = GLib.spawn_command_line_sync('xwininfo -children -id 0x%x'.format(act['x-window']));
        if (id[0]) {
            let str = id[1].toString();

            /* The X ID of the window is the one preceding the target window's title.
             * This is to handle cases where the window has no frame and so
             * act['x-window'] is actually the X ID we want, not the child.
             */
            let regexp = new RegExp('(0x[0-9a-f]+) +"%s"'.format(win.title));
            id = str.match(regexp);
            if (id) {
                return id[1];
            }

            /* Otherwise, just grab the child and hope for the best */
            id = str.split(/child(?:ren)?:/)[1].match(/0x[0-9a-f]+/);
            if (id) {
                return id[0];
            }
        }
    }
    // debugging for when people find bugs..
    log("[maximus]: Could not find XID for window with title %s".format(win.title));
    return null;
}

/** Undecorates a window.
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
 * The Meta.Window object does *not* have a way to access a window's XID.
 * However, the window's description seems to have it.
 * Alternatively, a window's actor's 'x-window' property returns the XID
 *  of the window *frame*, and so if we parse `xwininfo -children -id [frame_id]`
 *  we can extract the child XID being the one we want.
 *
 * See here for xprop usage for undecoration:
 * http://xrunhprof.wordpress.com/2009/04/13/removing-decorations-in-metacity/
 *
 * @param {Meta.Window} win - window to undecorate.
 */
function undecorate(win) {
    /* Undecorate with xprop */
    let id = guessWindowXID(win),
        cmd = ['xprop', '-id', id,
               '-f', '_MOTIF_WM_HINTS', '32c',
               '-set', '_MOTIF_WM_HINTS',
                '0x2, 0x0, 0x2, 0x0, 0x0'];
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
        cmd[1] = '-name';
        cmd[2] = win.get_title();
    }
    LOG(cmd.join(' '));
    Util.spawn(cmd);
    // #25: when undecorating a Qt app (texmaker, keepassx) somehow focus is lost.
    // However, is there a use case where this would happen legitimately?
    // For some reaons the Qt apps seem to take a while to be refocused.
    Meta.later_add(Meta.LaterType.IDLE, function () {
        if (win.focus) {
            win.focus(global.get_current_time());
        } else {
            win.activate(global.get_current_time());
        }
    });
}

/** Decorates a window by setting its `_MOTIF_WM_HINTS` property to ask for
 * decoration.
 *
 * @param {Meta.Window} win - window to undecorate.
 */
function decorate(win) {
    /* Decorate with xprop: 1 == DECOR_ALL */
    let id = guessWindowXID(win),
        cmd = ['xprop', '-id', id,
               '-f', '_MOTIF_WM_HINTS', '32c',
               '-set', '_MOTIF_WM_HINTS',
                '0x2, 0x0, 0x1, 0x0, 0x0'];
    // fallback: if couldn't get id for some reason, use the window's name
    if (!id) {
        cmd[1] = '-name';
        cmd[2] = win.get_title();
    }
    LOG(cmd.join(' '));
    Util.spawn(cmd);
    // #25: when undecorating a Qt app (texmaker, keepassx) somehow focus is lost.
    // However, is there a use case where this would happen legitimately?
    // For some reaons the Qt apps seem to take a while to be refocused.
    Meta.later_add(Meta.LaterType.IDLE, function () {
        if (win.focus) {
            win.focus(global.get_current_time());
        } else {
            win.activate(global.get_current_time());
        }
    });
}

/** Tells the window manager to hide the titlebar on maximised windows.
 * TODO: GNOME 3.2?
 *
 * Note - no checking of blacklists etc is done in the function. You should do
 * it prior to calling the function (same with {@link decorate} and {@link undecorate}).
 *
 * Does this by setting the _GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED hint - means
 * I can do it once and forget about it, rather than tracking maximize/unmaximize
 * events.
 *
 * **Caveat**: doesn't work with Ubuntu's Ambiance and Radiance window themes -
 * my guess is they don't respect or implement this property.
 *
 * @param {Meta.Window} win - window to set the HIDE_TITLEBAR_WHEN_MAXIMIZED property of.
 * @param {boolean} hide - whether to hide the titlebar or not.
 * @param {boolean} [stopAdding] - if `win` does not have an actor and we couldn't
 * find the window's XID, we try one more time to detect the XID, unless this
 * is `true`. Internal use.
 */
function setHideTitlebar(win, hide, stopAdding) {
    LOG('setHideTitlebar: ' + win.get_title() + ': ' + hide + (stopAdding ? ' (2)' : ''));

    let id = guessWindowXID(win);
    /* Newly-created windows are added to the workspace before
     * the compositor knows about them: get_compositor_private() is null.
     * Additionally things like .get_maximized() aren't properly done yet.
     * (see workspace.js _doAddWindow)
     */
    if (!id && !win.get_compositor_private() && !stopAdding) {
        Mainloop.idle_add(function () {
            setHideTitlebar(null, win, true); // only try once more.
            return false; // define as one-time event
        });
        return;
    }

    /* Undecorate with xprop. Use _GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED.
     * See (eg) mutter/src/window-props.c
     */
    let cmd = ['xprop', '-id', id,
           '-f', '_GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED', '32c',
           '-set', '_GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED',
           (hide ? '0x1' : '0x0')];

    // fallback: if couldn't get id for some reason, use the window's name
    if (!id) {
        cmd[1] = '-name';
        cmd[2] = win.get_title();
    }
    LOG(cmd.join(' '));
    Util.spawn(cmd);
}

/** Returns whether we should affect `win`'s decorationa t all.
 *
 * If the window was originally undecorated we do not do anything with it
 *  (decorate or undecorate),
 *
 * Also if it's in the blacklist, or if it's NOT in the whitelist, we don't
 * do anything with it.
 *
 * @returns {boolean} whether the window is originally decorated and not in
 * the blacklist (or in the whitelist).
 */
function shouldAffect(win) {

    if (!win._maximusDecoratedOriginal) {
	return false;
    }else{

    LOG('blacklist etkin='+IS_BLACKLIST);
    LOG('blacklist ='+APP_LIST);

    	if(IS_BLACKLIST){
	    let app = Cinnamon.WindowTracker.get_default().get_window_app(win);
		appid = (app ? app.get_id() : -1);
		activeApp=appid.split(".");
		appsInList=APP_LIST.split(',');
		LOG('appid='+activeApp[0]);
		//APP_LIST=APP_LIST.split(',');
	inList =appsInList.length > 0 && appsInList.indexOf(activeApp[0]) >= 0;
	LOG(inList);
    return !((IS_BLACKLIST && inList) || (!IS_BLACKLIST && !inList));
    	}else{
    		return true;
    	}
    }

}

/** Checks if `win` should be undecorated, based *purely* off its maximised
 * state (doesn't incorporate blacklist).
 *
 * If it's fully-maximized or half-maximised and undecorateHalfMaximised is true,
 * this returns true.
 *
 * Use with `shouldAffect` to get a full check..
 */
function shouldBeUndecorated(win) {
    let max = win.get_maximized();
    return ((max === Meta.MaximizeFlags.BOTH));
}

/** Checks if `win` is fully maximised, or half-maximised + undecorateHalfMaximised.
 * If so, undecorates the window. */
function possiblyUndecorate(win) {
    if (shouldBeUndecorated(win)) {
        if (!win.get_compositor_private()) {
            Mainloop.idle_add(function () {
                undecorate(win);
                return false; // define as one-time event
            });
        } else {
            undecorate(win);
        }
    }
}

/** Checks if `win` is fully maximised, or half-maximised + undecorateHalfMaximised.
 * If *NOT*, redecorates the window. */
function possiblyRedecorate(win) {
    if (!shouldBeUndecorated(win)) {
        if (!win.get_compositor_private()) {
            Mainloop.idle_add(function () {
                decorate(win);
                return false; // define as one-time event
            });
        } else {
            decorate(win);
        }
    }
}

/**** Callbacks ****/
/** Called when a window is maximized, including half-maximization.
 *
 * If the window is not in the blacklist (or is in the whitelist), we undecorate
 * it.
 *
 * @param {Meta.WindowActor} actor - the window actor for the maximized window.
 * It is expected to be maximized (in at least one direction) already - we will
 * not check before undecorating.
 */
function onMaximise(shellwm, actor) {
    if (!actor) {
        return;
    }
    let win = actor.get_meta_window();
    if (!shouldAffect(win)) {
        return;
    }
    // note: window is maximized by this point.
    let max = win.get_maximized();
    LOG('onMaximise: ' + win.get_title() + ' [' + win.get_wm_class() + ']');
    // if this is a partial maximization, and we do not wish to undecorate
    // half-maximized windows, make sure the window is decorated.
    if (max !== Meta.MaximizeFlags.BOTH) {
        undecorate(win);
        return;
    }
    undecorate(win);
}

/** Called when a window is unmaximized.
 *
 * If the window is not in the blacklist (or is in the whitelist), we decorate
 * it.
 *
 * @param {Meta.WindowActor} actor - the window actor for the unmaximized window.
 * It is expected to be unmaximized - we will not check before decorating.
 */
function onUnmaximise(shellwm, actor) {



    if (!actor) {
        return;
    }
    let win = actor.meta_window;
    if (!shouldAffect(win)) {
        return;
    }
    LOG('onUnmaximise: ' + win.get_title());
    // if the user is unmaximizing by dragging, we wait to decorate until they
    // have dropped the window, so that we don't force the user to drop
    // the window prematurely with the redecorate (which stops the grab).
    //
    // This is only necessary if USE_SET_HIDE_TITLEBAR is `false` (otherwise
    // this is not an issue).
    if (!USE_SET_HIDE_TITLEBAR && global.display.get_grab_op() === Meta.GrabOp.MOVING) {
        if (grabID) {
            // shouldn't happen, but oh well.
            global.display.disconnect(grabID);
            grabID = 0;
        }
        grabID = global.display.connect('grab-op-end', function () {
            if(settings.undecorateTile && (win.tile_type == Meta.WindowTileType.TILED || win.tile_type == Meta.WindowTileType.SNAPPED)){
                  return;
            }else{
		    possiblyRedecorate(win);
		    global.display.disconnect(grabID);
		    grabID = 0;
            }
        });
    } else {
        decorate(win);
    }
}

/** Callback for a window's 'notify::maximized-horizontally' and
 * 'notify::maximized-vertically' signals.
 *
 * If the window is half-maximised we force it to show its titlebar.
 * Otherwise we set it to hide if it is maximized.
 *
 * Only used if using the SET_HIDE_TITLEBAR method AND we wish half-maximized
 * windows to be *decorated* (the GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED atom will
 * hide the titlebar of half-maximized windows too).
 *
 * @param {Meta.Window} win - the window whose maximized-horizontally or
 * maximized-vertically properties has changed.
 *
 * @see onWindowAdded
 */
function onWindowChangesMaximiseState(win) {
    if ((win.maximized_horizontally && !win.maximized_vertically) ||
        (!win.maximized_horizontally && win.maximized_vertically)) {
        setHideTitlebar(win, false);
        decorate(win);
    } else {
        setHideTitlebar(win, true);
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
 * * if using the SET_HIDE_TITLEBAR method, we:
 *  + set the GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED atom on the window.
 *  + if we wish to keep half-maximised windows decorated, we connect up some signals
 *    to ensure that half-maximised windows remain decorated (the GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED
 *    atom will automatically undecorated half-maximised windows).
 *    See {@link onWindowChangesMaximiseState}.
 * * otherwise (not using SET_HIDE_TITLEBAR):
 *  + if the window is maximized, we undecorate it (see {@link undecorate});
 *  + if the window is half-maximized and we wish to undecorate half-maximised
 *    windows, we also undecorate it.
 *
 * @param {Meta.Window} win - the window that was added.
 *
 * @see undecorate
 */
function onWindowAdded(ws, win) {
    // if the window is simply switching workspaces, it will trigger a
    // window-added signal. We don't want to reprocess it then because we already
    // have.
    if(settings.undecorateAll){

    		undecorate(win);

    }else{
	    if (win._maximusDecoratedOriginal !== undefined) {
		return;
	    }

	    /* Newly-created windows are added to the workspace before
	     * the compositor knows about them: get_compositor_private() is null.
	     * Additionally things like .get_maximized() aren't properly done yet.
	     * (see workspace.js _doAddWindow)
	     */
	    win._maximusDecoratedOriginal = win.decorated !== false || false;
	    LOG('onWindowAdded: ' + win.get_title() + ' initially decorated? ' + win._maximusDecoratedOriginal);

	    if (!shouldAffect(win)) {
		return;
	    }

	    // with set_hide_titlebar, set the window hint when the window is added and
	    // there is no further need to listen to maximize/unmaximize on the window.
	    if (USE_SET_HIDE_TITLEBAR) {
		setHideTitlebar(win, true);
		// set_hide_titlebar undecorates half maximized, so if we wish not to we
		// will have to manually redo it ourselves
	    } else {
		// if it is added initially maximized, we undecorate it.
		possiblyUndecorate(win);
	    }

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
        //ws._MaximusWindowAddedId = ws.connect('window-added', onWindowAdded);
        ws._MaximusWindowAddedId = ws.connect('window-added', function (ws, win) {
            Mainloop.idle_add(function () { onWindowAdded(ws, win); return false; })
        });
    }
}

/** Start listening to events and undecorate already-existing windows. */
function startUndecorating() {
    // cache some variables for convenience
    IS_BLACKLIST = settings.blacklist;
    APP_LIST=settings.blacklist_apps;
    USE_SET_HIDE_TITLEBAR = false;
    if (USE_SET_HIDE_TITLEBAR && Meta.prefs_get_theme().match(/^(?:Ambiance|Radiance)$/)) {
        USE_SET_HIDE_TITLEBAR = false;
    }

    /* Connect events */
    changeWorkspaceID = global.screen.connect('notify::n-workspaces', onChangeNWorkspaces);
    // if we are not using the set_hide_titlebar hint, we must listen to maximize and unmaximize events.
    if (!USE_SET_HIDE_TITLEBAR) {

        maxID = global.window_manager.connect('maximize', onMaximise);
        minID = global.window_manager.connect('unmaximize', onUnmaximise);
        if(settings.undecorateTile==true){
        	tileID=global.window_manager.connect('tile', onMaximise);

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
    }

    /* Go through already-maximised windows & undecorate.
     * This needs a delay as the window list is not yet loaded
     *  when the extension is loaded.
     * Also, connect up the 'window-added' event.
     * Note that we do not connect this before the onMaximise loop
     *  because when one restarts the gnome-shell, window-added gets
     *  fired for every currently-existing window, and then
     *  these windows will have onMaximise called twice on them.
     */
    onetime = Mainloop.idle_add(function () {
        let winList = global.get_window_actors().map(function (w) { return w.meta_window; }),
            i       = winList.length;
        while (i--) {
            let win = winList[i];
            if (win.window_type === Meta.WindowType.DESKTOP) {
                continue;
            }
            onWindowAdded(null, win);
        }
        onChangeNWorkspaces();
        return false; // define as one-time event
    });
}

/** Stop listening to events, restore all windows back to their original
 * decoration state. */
function stopUndecorating() {
    if (maxID) global.window_manager.disconnect(maxID);
    if (minID) global.window_manager.disconnect(minID);
    if (tileID) global.window_manager.disconnect(tileID);
    if (changeWorkspaceID) global.window_manager.disconnect(changeWorkspaceID);
    if (grabID) global.display.disconnect(grabID);
    maxID = 0;
    minID = 0;
    tileID=0;
    changeWorkspaceID = 0;
    grabID = 0;

    /* disconnect window-added from workspaces */
    let i = workspaces.length;
    while (i--) {
        workspaces[i].disconnect(workspaces[i]._MaximusWindowAddedId);
        delete workspaces[i]._MaximusWindowAddedId;
    }
    workspaces = [];

    /* redecorate undecorated windows we screwed with */
    if (onetime) {
        Mainloop.source_remove(onetime);
        onetime = 0;
    }
    let winList = global.get_window_actors().map(function (w) { return w.meta_window; });
    let j = winList.length;
    while (j--) {
        let win = winList[j];
        if (win.window_type === Meta.WindowType.DESKTOP) {
            continue;
        }

        LOG('stopUndecorating: ' + win.title);
        // if it wasn't decorated originally, we haven't done anything to it so
        // don't need to undo anything.
        if (win._maximusDecoratedOriginal) {
            if (USE_SET_HIDE_TITLEBAR) {
                setHideTitlebar(win, false);

                if (win._maxHStateId) {
                    win.disconnect(win._maxHStateId);
                    delete win._maxHStateId;
                }

                if (win._maxVStateId) {
                    win.disconnect(win._maxVStateId);
                    delete win._maxVStateId;
                }
            }
            decorate(win);
        }
        delete win._maximusDecoratedOriginal;
    }

    if (oldFullscreenPref !== null) {
        /* restore old meta force fullscreen pref */
        Meta.prefs_set_force_fullscreen(oldFullscreenPref);
        oldFullscreenPref = null;
    }
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
            "blacklist", "blacklist", function(){
                    stopUndecorating();
	            startUndecorating();
            });
        this.settings.bindProperty(Settings.BindingDirection.IN,
            "blacklist_apps", "blacklist_apps", function(){
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
    }
}

function enable() {

    startUndecorating();

    /* Monitor settings changes */
   /* settingsChangedID = settings.connect('changed', function () {
        // redecorate every window and undecorate again according to the
        // new settings.
        stopUndecorating();

        startUndecorating();
    });*/
}

function disable() {
    stopUndecorating();

    /* disconnect settings changes */
    /*
    if (settingsChangedID) {
        settings.disconnect(settingsChangedID);
    }*/
}
