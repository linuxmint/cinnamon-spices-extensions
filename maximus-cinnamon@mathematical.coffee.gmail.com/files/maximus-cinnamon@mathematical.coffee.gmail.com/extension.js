/*
 * Maximus v1.3
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

/*** If you want to undecorate half-maximised windows then change this to true. ***/
const undecorateHalfMaximised = false;

/*** Whitelists/blacklists ***/
const BLACKLIST = true; // if it's a white list, change this to FALSE
// apps to blacklist or whitelist. If blacklist, all windows *but* these
// will be undecorated on maximize. If whitelist, *only* these windows will
// be undecorated on maximize.
// You have to add the wmclass to the list. To see this, do Alt+F2 > Windows >
// look at 'wmclass'.
// It is *CASE SENSITIVE*.
const WMLIST = [
    // FOR EXAMPLE to leave terminal & thunderbird windows alone:
    //'Terminal',
    //'Thunderbird'
];

/*** Code proper, don't edit anything below **/
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Util = imports.misc.util;

const Main = imports.ui.main;


let maxID = null;
let minID = null;
let changeWorkspaceID = null;
let workspaces = [];
let onetime = null;
let oldFullscreenPref = null;

function LOG(message) {
    log(message);
}
/* undecorates a window.
 * If I use set_decorations(0) from within the GNOME shell extension (i.e.
 *  from within the compositor process), the window dies.
 * If I use the same code but use `gjs` to run it, the window undecorates
 *  properly.
 *
 * Hence I have to make some sort of external call to do the undecoration.
 * I could use 'gjs' on a javascript file (and I'm pretty sure this is installed
 *  with GNOME-shell too), but I decided to use a system call to xprop.
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
 */
function undecorate(win) {
    /* Undecorate with xprop */
    let id = guessWindowXID(win),
        cmd = ['xprop', '-id', id,
               '-f', '_MOTIF_WM_HINTS', '32c',
               '-set', '_MOTIF_WM_HINTS',
                '0x2, 0x0, 0x0, 0x0, 0x0'];
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
}

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
}
/* setHideTitleBar: tells the window manager to hide the titlebar on
 * maximised windows (GNOME 3.4+).
 *
 * Does this by setting the _GTK_HIDE_TITLEBAR_WHEN_MAXIMIZED hint - means
 * I can do it once and forget about it, rather than tracking maximize/unmaximize
 * events.
 */
function setHideTitlebar(win, hide, stopAdding) {
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

    Util.spawn(cmd);
}

/* NOTE: we prefer to use the window's XID but this is not stored
 * anywhere but in the window's description being [XID (%10s window title)].
 * And I'm not sure I want to rely on that being the case always.
 * (mutter/src/core/window-props.c)
 *
 * If we use the windows' title, `xprop` grabs the "least-focussed" window
 * (bottom of stack I suppose).
 *
 * Can match winow.get_startup_id() to WM_WINDOW_ROLE(STRING)
 * If they're not equal, then try the XID ?
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
            return id ;
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
    return null;
}

/**** Callbacks ****/
/* onMaximise: called when a window is maximised and removes decorations. */
function onMaximise(shellwm, actor) {
    let win = actor.get_meta_window(),
        max = win.get_maximized(),
        inList = WMLIST.length > 0 && WMLIST.indexOf(win.get_wm_class()) >= 0;

    LOG('onMaximise: ' + win.get_title() + ' [' + win.get_wm_class() + ']');
    /* Don't undecorate if it is in the BLACKLIST or not in the whitelist */
    if ((BLACKLIST && inList) || (!BLACKLIST && !inList)) {
        return;
    }

    // do nothing if maximus isn't managing decorations for this window
    if (!win._maximusDecoratedOriginal) {
        return;
    }

    // if this is a partial maximization
    if( max != (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL)) {
        // if we want decorations for partial maximization
        if (!undecorateHalfMaximised) {
            decorate(win);
            return;
        }
    }

    undecorate(win);
}

function onUnmaximise(shellwm, actor) {
    let win = actor.meta_window;
    LOG('onUnmaximise: ' + win.get_title());
    /* don't decorate if it's not meant to be decorated (like chrome with no 'use system title bars') */
    if (!win._maximusDecoratedOriginal) {
        return;
    }
    decorate(win);
    return;
}

function onWindowAdded(ws, win) {
    /* Newly-created windows are added to the workspace before
     * the compositor knows about them: get_compositor_private() is null.
     * Additionally things like .get_maximized() aren't properly done yet.
     * (see workspace.js _doAddWindow)
     */
    win._maximusDecoratedOriginal = win.decorated !== false || false;
    LOG('onWindowAdded: ' + win.get_title());
    if (!win.get_compositor_private()) {
        Mainloop.idle_add(function () {
            onMaximise(null, win.get_compositor_private());
            return false; // define as one-time event
        });
    } else {
        onMaximise(null, win.get_compositor_private());
    }
}

/* Whenever the number of workspaces is changed,
 * listen to an 'add window' event in case it starts
 * maximised.
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
        ws._MaximusWindowAddedId = ws.connect('window-added', onWindowAdded);
    }
}

function init() {
}

function enable() {
    /* Connect events */
    maxID = global.window_manager.connect('maximize', onMaximise);
    minID = global.window_manager.connect('unmaximize', onUnmaximise);
    changeWorkspaceID = global.screen.connect('notify::n-workspaces', onChangeNWorkspaces);

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
            /* store original decorated state to restore after. If undefined, then decorated. */
            winList[i]._maximusDecoratedOriginal = winList[i].decorated !== false || false;
            onMaximise(null, winList[i].get_compositor_private());
        }
        onChangeNWorkspaces();
        return false; // define as one-time event
    });

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

function disable() {
    global.window_manager.disconnect(maxID);
    global.window_manager.disconnect(minID);
    global.window_manager.disconnect(changeWorkspaceID);

    /* disconnect window-added from workspaces */
    let i = workspaces.length;
    while (i--) {
        workspaces[i].disconnect(workspaces[i]._MaximusWindowAddedId);
    }
    workspaces = [];

    /* redecorate undecorated windows we screwed with */
    if (onetime) {
        Mainloop.source_remove(onetime);
        onetime = 0;
    }
    let winList = global.get_window_actors().map(function (w) { return w.meta_window; }),
        i       = winList.length;
    while (i--) {
        if (winList[i].hasOwnProperty('_maximusDecoratedOriginal')) {
            if (!winList[i].decorated && winList[i]._maximusDecoratedOriginal) {
                onUnmaximise(null, winList[i].get_compositor_private());
            }
            delete winList[i]._maximusDecoratedOriginal;
        }
    }

    /* restore old meta force fullscreen pref */
    Meta.prefs_set_force_fullscreen(oldFullscreenPref);
}

