// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
//
// closetab@maxwellmollersten
//
// Adds a Windows-11-style close button to every preview of Cinnamon's stock
// Alt+Tab switcher.
//
// Implementation notes (Cinnamon 6.6 / Linux Mint 22.3):
//
//   Cinnamon's switcher lives in imports.ui.appSwitcher.  The base class
//   AppSwitcher (appSwitcher.js) owns the modal grab, the window list, the key
//   handling and the "a window went away" bookkeeping.  The concrete switcher
//   used by every non-3D style ('icons', 'thumbnails', 'preview' and their
//   combinations) is ClassicSwitcher (classicSwitcher.js), which builds an
//   AppList of AppIcon objects; each AppIcon is wrapped by SwitcherList.addItem
//   in an St.Button with style class 'item-box' - that St.Button *is* the
//   clickable preview.
//
//   There is no extension hook for any of this, and windowManager.js captures
//   the ClassicSwitcher constructor at import time, so subclassing is not an
//   option either.  We therefore monkey-patch a small number of prototype
//   methods, keeping the originals so disable() can put everything back:
//
//     AppSwitcher.prototype._init          - replace the 'map' handler so an
//                                            app's "save your changes?" dialog
//                                            does not dismiss the switcher
//     AppSwitcher.prototype._keyPressEvent - Q closes the selected window
//     AppIcon.prototype._init              - wrap the preview and add the X
//     AppList.prototype._addIcon           - hover + middle-click wiring
//     ClassicSwitcher.prototype._updateList- re-sync hover after a rebuild
//     AppSwitcher.prototype.destroy        - track live switchers and drop our
//                                            idle callback during teardown
//
//   Everything else is left to Cinnamon: AppSwitcher._removeDestroyedWindow()
//   already reacts to the window manager's 'destroy' signal by splicing the
//   window out of the list, fixing up _currentIndex, rebuilding the list and
//   re-selecting - and by destroying the switcher when the last window goes.

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Cinnamon = imports.gi.Cinnamon;
const Mainloop = imports.mainloop;

const AppSwitcherModule = imports.ui.appSwitcher.appSwitcher;
const ClassicSwitcherModule = imports.ui.appSwitcher.classicSwitcher;

const LOG_PREFIX = 'CloseTab: ';
const DEBUG = false;

// Show the X only while the pointer is over its preview.
const SHOW_ON_HOVER_ONLY = true;
// Middle-clicking anywhere on a preview closes that window too.
const MIDDLE_CLICK_CLOSES = true;
// Fade duration for the X appearing/disappearing (ms).
const FADE_TIME = 100;
// Two close requests closer together than this are treated as an accidental
// double click.  The preview list is rebuilt as soon as a window really goes
// away, so without this a double click could hit whichever preview slid under
// the pointer in the meantime.
const CLOSE_COOLDOWN_MS = 250;
// A window mapped by a process we just asked to close, within this many ms, is
// assumed to be its close-confirmation dialog.
const CLOSE_CONFIRM_GRACE_MS = 4000;

// Saved originals; also doubles as the "are we enabled?" flag.
let originals = null;

// pid -> monotonic ms of our most recent close request for that process.
let pendingCloses = new Map();
let lastCloseRequest = 0;

// Switchers created while the extension is enabled. disable() closes any that
// are still open so their external window-manager signals cannot outlive us.
let activeSwitchers = new Set();

// Every idle source we currently have queued, so disable() can cancel them.
// A switcher normally cancels its own through patchedDestroy(); disable() also
// performs a final sweep in case construction failed before normal teardown.
let pendingSyncIds = new Set();

function nowMs() {
    return GLib.get_monotonic_time() / 1000;
}

function debug(message) {
    if (DEBUG)
        global.log(LOG_PREFIX + message);
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

/**
 * closeWindow:
 * @metaWindow: the Meta.Window backing a preview
 *
 * The single close path shared by the X button, the Q key and middle-click.
 *
 * Meta.Window.delete() is the polite ICCCM/EWMH close request - exactly what
 * the titlebar close button and Alt+F4 do - so applications still get to show
 * their "unsaved changes" dialog.  It neither raises nor focuses the window,
 * which is what lets us close a preview without activating it.
 *
 * Returns true if a close request was actually sent.
 */
function closeWindow(metaWindow) {
    if (!metaWindow)
        return false;

    let now = nowMs();
    if (now - lastCloseRequest < CLOSE_COOLDOWN_MS) {
        debug('close request ignored (cooldown)');
        return false;
    }

    if (!metaWindow.can_close()) {
        debug('window does not support being closed: ' + metaWindow.get_title());
        return false;
    }

    lastCloseRequest = now;
    rememberCloseRequest(metaWindow);
    metaWindow.delete(global.get_current_time());
    debug('close requested for: ' + metaWindow.get_title());
    return true;
}

function prunePendingCloses(now) {
    for (let [pid, requestedAt] of pendingCloses) {
        if (now - requestedAt > CLOSE_CONFIRM_GRACE_MS)
            pendingCloses.delete(pid);
    }
}

function rememberCloseRequest(metaWindow) {
    let now = nowMs();
    prunePendingCloses(now);

    let pid = metaWindow.get_pid();
    if (pid > 0)
        pendingCloses.set(pid, now);
}

/**
 * isProbableCloseConfirmation:
 *
 * True when @metaWindow was mapped by a process we asked to close a window in
 * very recently - i.e. it is almost certainly a "Save before closing?" dialog.
 */
function isProbableCloseConfirmation(metaWindow) {
    let now = nowMs();
    prunePendingCloses(now);

    if (!metaWindow)
        return false;

    let pid = metaWindow.get_pid();
    if (pid <= 0)
        return false;

    let requestedAt = pendingCloses.get(pid);
    if (requestedAt === undefined)
        return false;
    return true;
}

// ---------------------------------------------------------------------------
// The close button
// ---------------------------------------------------------------------------

function setCloseButtonShown(button, shown) {
    if (!button || button.is_finalized())
        return;

    button.remove_all_transitions();
    button.ease({
        opacity: shown ? 255 : 0,
        duration: FADE_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD
    });
}

function createCloseButton(metaWindow) {
    let button = new St.Button({
        style_class: 'closetab-button',
        reactive: true,
        can_focus: false,
        track_hover: true
    });
    button.set_child(new St.Label({ style_class: 'closetab-glyph', text: '×' }));

    // Pin to the top-right corner of the preview.  NB: St.Bin (and therefore
    // St.Button) shadows the "x-align"/"y-align" *properties* with StAlign, so
    // Clutter's alignment has to be set through the setters.
    button.x_expand = true;
    button.y_expand = true;
    button.set_x_align(Clutter.ActorAlign.END);
    button.set_y_align(Clutter.ActorAlign.START);
    button.opacity = SHOW_ON_HOVER_ONLY ? 0 : 255;

    // Propagation is already handled for us: St.Button claims button 1 on
    // press, so the event never reaches the 'item-box' St.Button underneath
    // and the window is never activated.  'clicked' is not a Clutter event
    // signal, so there is no return value to give here.
    button.connect('clicked', function () {
        closeWindow(metaWindow);
    });

    return button;
}

// ---------------------------------------------------------------------------
// Patched methods
// ---------------------------------------------------------------------------

/* AppIcon.prototype._init - wrap the stock preview and overlay the X. */
function patchedAppIconInit(window, showThumbnail) {
    originals.appIconInit.call(this, window, showThumbnail);

    let inner = this.actor;
    let wrapper = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        style_class: 'closetab-preview',
        x_expand: true,
        y_expand: true
    });
    wrapper.add_child(inner);

    let closeButton = createCloseButton(window);
    wrapper.add_child(closeButton);

    // Everything downstream (SwitcherList.addItem, ClassicSwitcher._allocate)
    // just uses appIcon.actor, so swapping it for the wrapper is enough.  The
    // BinLayout takes its size from the original box, which keeps the preview
    // dimensions unchanged.
    this.actor = wrapper;
    this.closeButton = closeButton;
}

/* AppList.prototype._addIcon - hover handling and middle-click, on the
 * 'item-box' St.Button that SwitcherList.addItem just created. */
function patchedAddIcon(appIcon) {
    originals.appListAddIcon.call(this, appIcon);

    let bbox = this._items[this._items.length - 1];
    if (!bbox || !appIcon.closeButton)
        return;

    let closeButton = appIcon.closeButton;
    let metaWindow = appIcon.window;

    if (SHOW_ON_HOVER_ONLY) {
        // St keeps 'hover' true while the pointer is over a descendant, so the
        // button stays visible once you move onto it.
        bbox.connect('notify::hover', function () {
            setCloseButtonShown(closeButton, bbox.hover);
        });
    }

    if (MIDDLE_CLICK_CLOSES) {
        // St.Button only claims button 1, so a middle click would otherwise
        // bubble up to the switcher's root actor, which dismisses it.
        bbox.connect('button-press-event', function (actor, event) {
            return event.get_button() === Clutter.BUTTON_MIDDLE
                ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
        bbox.connect('button-release-event', function (actor, event) {
            if (event.get_button() !== Clutter.BUTTON_MIDDLE)
                return Clutter.EVENT_PROPAGATE;
            closeWindow(metaWindow);
            return Clutter.EVENT_STOP;
        });
    }
}

/* ClassicSwitcher.prototype._updateList - the list is torn down and rebuilt in
 * place whenever a window disappears.  If the pointer happens to already sit
 * over one of the brand-new previews there may be no fresh enter-event, so
 * sync the close buttons by hand once the new actors are allocated. */
function patchedUpdateList(direction) {
    originals.updateList.call(this, direction);

    if (!SHOW_ON_HOVER_ONLY || this._destroyed || this._closetabSyncId)
        return;

    let id = Mainloop.idle_add(() => {
        pendingSyncIds.delete(id);
        this._closetabSyncId = 0;
        if (this._destroyed)
            return GLib.SOURCE_REMOVE;
        try {
            let appList = this._appList;
            let icons = appList ? appList.icons : null;
            for (let i = 0; icons && i < icons.length; i++) {
                let bbox = appList._items[i];
                if (bbox && icons[i].closeButton)
                    setCloseButtonShown(icons[i].closeButton, bbox.hover);
            }
        } catch (e) {
            debug('hover sync skipped: ' + e);
        }
        return GLib.SOURCE_REMOVE;
    });
    this._closetabSyncId = id;
    pendingSyncIds.add(id);
}

/**
 * cancelSync:
 *
 * Drops a switcher's queued idle, if it still has one. Checking the set before
 * removing keeps this safe against a source disable() already swept, which
 * would otherwise warn about an unknown source ID.
 */
function cancelSync(switcher) {
    let id = switcher._closetabSyncId;
    if (id && pendingSyncIds.has(id)) {
        Mainloop.source_remove(id);
        pendingSyncIds.delete(id);
    }
    switcher._closetabSyncId = 0;
}

/* AppSwitcher.prototype.destroy - drop instance state before Cinnamon tears
 * down its actors, timers, and external window-manager signal handlers. */
function patchedDestroy() {
    cancelSync(this);
    activeSwitchers.delete(this);
    originals.destroy.call(this);
}

/* AppSwitcher.prototype._init - Cinnamon dismisses the switcher (and activates
 * the selected window) as soon as any window maps.  That would fire the moment
 * an application pops up its close-confirmation dialog, stealing focus from the
 * very dialog we caused.  Re-point the handler at a guarded version. */
function patchedSwitcherInit(binding) {
    originals.switcherInit.apply(this, arguments);

    this._closetabSyncId = 0;
    activeSwitchers.add(this);

    if (this._mcid > 0) {
        this._windowManager.disconnect(this._mcid);
        this._mcid = this._windowManager.connect('map', (wm, actor) => {
            let metaWindow = actor ? actor.meta_window : null;
            if (isProbableCloseConfirmation(metaWindow)) {
                debug('keeping switcher open for close-confirmation dialog');
                return;
            }
            if (this._windows && this._windows.length > 0)
                this._activateSelected();
        });
    }
}

/* AppSwitcher.prototype._keyPressEvent - Q closes the selected window.
 * This only ever runs while the switcher owns the modal grab, so nothing is
 * bound globally. */
function patchedKeyPressEvent(actor, event) {
    if (event) {
        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_q || symbol === Clutter.KEY_Q) {
            let modifiers = Cinnamon.get_event_state(event);
            let unwanted = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.SUPER_MASK;
            if (!(modifiers & unwanted)) {
                this._disableHover();
                if (this._windows && this._windows.length > 0)
                    closeWindow(this._windows[this._currentIndex]);
                return Clutter.EVENT_STOP;
            }
        }
    }
    return originals.keyPressEvent.call(this, actor, event);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function init(metadata) {
    // Nothing to set up; all state is created in enable().
}

function enable() {
    if (originals) {
        global.log(LOG_PREFIX + 'already enabled, ignoring');
        return;
    }

    let AppSwitcher = AppSwitcherModule.AppSwitcher;
    let { ClassicSwitcher, AppIcon, AppList } = ClassicSwitcherModule;

    originals = {
        switcherInit: AppSwitcher.prototype._init,
        destroy: AppSwitcher.prototype.destroy,
        keyPressEvent: AppSwitcher.prototype._keyPressEvent,
        appIconInit: AppIcon.prototype._init,
        appListAddIcon: AppList.prototype._addIcon,
        updateList: ClassicSwitcher.prototype._updateList
    };

    AppSwitcher.prototype._init = patchedSwitcherInit;
    AppSwitcher.prototype.destroy = patchedDestroy;
    AppSwitcher.prototype._keyPressEvent = patchedKeyPressEvent;
    AppIcon.prototype._init = patchedAppIconInit;
    AppList.prototype._addIcon = patchedAddIcon;
    ClassicSwitcher.prototype._updateList = patchedUpdateList;

    let style = global.settings.get_string('alttab-switcher-style');
    if (style === 'coverflow' || style === 'timeline') {
        global.log(LOG_PREFIX + 'switcher style "' + style + '" is 3D; close ' +
                   'buttons need one of the classic styles. Q-to-close still works.');
    }

    global.log(LOG_PREFIX + 'extension enabled (style: ' + style + ')');
}

function disable() {
    if (!originals)
        return;

    let AppSwitcher = AppSwitcherModule.AppSwitcher;
    let { ClassicSwitcher, AppIcon, AppList } = ClassicSwitcherModule;

    // Destroy live switchers while our methods are still installed. Cinnamon's
    // normal destroy path disconnects their external window-manager signals and
    // destroys their actor-owned signal handlers.
    for (let switcher of Array.from(activeSwitchers)) {
        if (!switcher._destroyed)
            switcher.destroy();
    }
    activeSwitchers.clear();

    AppSwitcher.prototype._init = originals.switcherInit;
    AppSwitcher.prototype.destroy = originals.destroy;
    AppSwitcher.prototype._keyPressEvent = originals.keyPressEvent;
    AppIcon.prototype._init = originals.appIconInit;
    AppList.prototype._addIcon = originals.appListAddIcon;
    ClassicSwitcher.prototype._updateList = originals.updateList;

    // A final sweep covers an idle whose switcher failed before completing its
    // normal destroy path.
    for (let id of pendingSyncIds)
        Mainloop.source_remove(id);
    pendingSyncIds.clear();

    originals = null;
    pendingCloses.clear();
    lastCloseRequest = 0;

    // Every other signal and actor this extension creates belonged to one of
    // the switchers destroyed above, so nothing of ours is left running.
    global.log(LOG_PREFIX + 'extension disabled');
}
