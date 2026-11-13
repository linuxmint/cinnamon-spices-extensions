// Snap Groups: adds an extra Alt+Tab entry for every group of snapped
// (tiled) windows, like Windows 11. Picking the group entry restores all of
// its windows; picking a single window still restores only that window.

const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const AppSwitcher = imports.ui.appSwitcher.appSwitcher;
const ClassicSwitcher = imports.ui.appSwitcher.classicSwitcher;

// The 3D switchers render windows natively and cannot show a group entry.
const UNSUPPORTED_STYLES = ['coverflow', 'timeline'];
// Switching between windows of the same app is not a place for groups.
const SKIPPED_BINDINGS = ['switch-group', 'switch-group-backward'];
const TITLE_MAX_CHARS = 20;
// Time for Muffin to finish leaving "show desktop" before restoring partners.
const RESTORE_DELAY_MS = 60;

let originals = null;
let focusSignalId = 0;
let focusStamps = new Map();
let focusCounter = 0;
let restoreTimeoutId = 0;

function cancelPendingRestore() {
    if (restoreTimeoutId) {
        GLib.source_remove(restoreTimeoutId);
        restoreTimeoutId = 0;
    }
}

// Half and quarter tiles only; MAXIMIZED and NONE are not part of a group.
function isSnapped(win) {
    const mode = win.tile_mode;
    return mode > Meta.TileMode.NONE && mode < Meta.TileMode.MAXIMIZED;
}

function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
           a.y < b.y + b.height && b.y < a.y + a.height;
}

function canJoin(win, seed, takenRects) {
    const workspace = seed.get_workspace();
    return isSnapped(win) &&
        workspace !== null &&
        win.get_workspace() === workspace &&
        win.get_monitor() === seed.get_monitor() &&
        !takenRects.some(rect => overlaps(win.get_frame_rect(), rect));
}

// `windows` comes sorted by recency, so each group is seeded by its most
// recently used window, and stale tiles hidden behind newer ones (which
// overlap them) are left out.
function buildGroups(windows) {
    const assigned = new Set();
    const groups = [];

    for (const seed of windows) {
        if (assigned.has(seed) || !isSnapped(seed) || !seed.get_workspace())
            continue;

        const members = [seed];
        const rects = [seed.get_frame_rect()];
        for (const win of windows) {
            if (win === seed || assigned.has(win) || !canJoin(win, seed, rects))
                continue;
            members.push(win);
            rects.push(win.get_frame_rect());
        }

        if (members.length > 1) {
            members.forEach(win => assigned.add(win));
            groups.push(new SnapGroupEntry(members));
        }
    }
    return groups;
}

// Stands in for a MetaWindow inside the switcher's window list. It exposes
// just the subset of the MetaWindow API the classic switcher calls; members
// are reported as "transients" so the stock clone helper draws the whole
// layout for thumbnails and previews.
class SnapGroupEntry {
    constructor(members) {
        this.isSnapGroup = true;
        this.members = members;
        this.minimized = false;
        this.title = this.get_title();
    }

    get leader() {
        return this.members[0];
    }

    // Window titles tell apart members of the same app (e.g. two terminals).
    get_title() {
        const tracker = Cinnamon.WindowTracker.get_default();
        return this.members
            .map(win => {
                const app = tracker.get_window_app(win);
                const name = win.get_title() || (app && app.get_name()) || '?';
                return name.length > TITLE_MAX_CHARS
                    ? name.slice(0, TITLE_MAX_CHARS - 1) + '…'
                    : name;
            })
            .join(' + ');
    }

    get_workspace() { return this.leader.get_workspace(); }
    get_monitor() { return this.leader.get_monitor(); }
    get_wm_class() { return null; }
    get_user_time() { return this.leader.get_user_time(); }
    get_compositor_private() { return this.leader.get_compositor_private(); }
    get_buffer_rect() { return this.leader.get_buffer_rect(); }
    get_frame_rect() { return this.leader.get_frame_rect(); }
    has_focus() { return false; }

    foreach_transient(callback) {
        this.members.slice(1)
            .filter(win => win.get_compositor_private())
            .forEach(win => callback(win));
    }

    minimize() {
        this.members.forEach(win => win.minimize());
    }

    // Restores every member, leaving the most recently used one focused.
    // The focus target is activated first: when "show desktop" (Super+D) is
    // on, Muffin leaves that mode by minimizing every other window, so the
    // partners can only be restored after that has happened.
    activate() {
        const alive = this.members.filter(win => win.get_compositor_private());
        if (alive.length === 0)
            return;

        const [focusTarget, ...others] = alive;
        const workspace = focusTarget.get_workspace();
        Main.activateWindow(focusTarget, global.get_current_time(),
            workspace ? workspace.index() : undefined);

        cancelPendingRestore();
        restoreTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RESTORE_DELAY_MS, () => {
            restoreTimeoutId = 0;
            others.filter(win => win.get_compositor_private()).reverse().forEach(win => {
                if (win.minimized)
                    win.unminimize();
                win.raise();
            });
            if (focusTarget.get_compositor_private())
                focusTarget.raise();
            return GLib.SOURCE_REMOVE;
        });
    }
}

function isGroupEntry(item) {
    return item instanceof SnapGroupEntry;
}

function shouldAddGroups(binding) {
    const style = global.settings.get_string('alttab-switcher-style');
    return !UNSUPPORTED_STYLES.includes(style) &&
        !SKIPPED_BINDINGS.includes(binding.get_name());
}

// Cinnamon orders Alt+Tab by _NET_WM_USER_TIME, which some apps (e.g.
// Chromium-based browsers) do not update when they get focus. Ordering by
// our own focus history keeps the focused window first and the rest in
// most-recently-used order.
function onFocusChanged() {
    const win = global.display.focus_window;
    if (win)
        focusStamps.set(win, ++focusCounter);
}

function seedFocusHistory() {
    global.get_window_actors()
        .map(actor => actor.meta_window)
        .sort((a, b) => a.get_user_time() - b.get_user_time())
        .forEach(win => focusStamps.set(win, ++focusCounter));
    onFocusChanged();
}

function pruneFocusHistory() {
    for (const win of focusStamps.keys()) {
        if (!win.get_compositor_private())
            focusStamps.delete(win);
    }
}

function sortByFocusHistory(windows) {
    const minimizedLast = global.settings.get_boolean('alttab-minimized-aware');
    const stamp = win => focusStamps.get(win) || 0;
    return windows.slice().sort((a, b) => {
        if (minimizedLast && a.minimized !== b.minimized)
            return a.minimized ? 1 : -1;
        if (stamp(a) !== stamp(b))
            return stamp(b) - stamp(a);
        return b.get_user_time() - a.get_user_time();
    });
}

// Each group becomes one contiguous block, [group entry, members...], placed
// where its most recent member would be. When the focused window is in a
// group, that whole block comes first (see patchedSwitcherInit).
function withGroupEntries(windows) {
    const groups = buildGroups(windows);
    if (groups.length === 0)
        return windows;

    const groupOf = new Map();
    groups.forEach(group => group.members.forEach(win => groupOf.set(win, group)));

    const result = [];
    const emitted = new Set();
    for (const win of windows) {
        const group = groupOf.get(win);
        if (!group) {
            result.push(win);
        } else if (!emitted.has(group)) {
            emitted.add(group);
            result.push(group, ...group.members);
        }
    }
    return result;
}

// Index of the last item of the block holding the focused window, or -1.
function focusedBlockEnd(items) {
    const focused = global.display.focus_window;
    const start = items.findIndex(item => isGroupEntry(item) && item.members.includes(focused));
    return start < 0 ? -1 : start + items[start].members.length;
}

// Like Windows, the current group counts as a single item: the selection
// starts at the end of its block, so a quick Alt+Tab goes to the previous
// window outside the group.
function patchedSwitcherInit() {
    originals.switcherInit.apply(this, arguments);
    try {
        const end = this._windows ? focusedBlockEnd(this._windows) : -1;
        if (end >= 0)
            this._currentIndex = end;
    } catch (e) {
        global.logError('snap-groups: could not set start item: ' + e);
    }
}

function patchedGetWindowsForBinding(binding) {
    const windows = originals.getWindowsForBinding.apply(this, arguments);
    try {
        if (!shouldAddGroups(binding))
            return windows;
        pruneFocusHistory();
        return withGroupEntries(sortByFocusHistory(windows));
    } catch (e) {
        global.logError('snap-groups: could not build groups: ' + e);
        return windows;
    }
}

function patchedActivateSelected() {
    const item = this._windows ? this._windows[this._currentIndex] : null;
    if (!isGroupEntry(item))
        return originals.activateSelected.apply(this, arguments);

    try {
        item.activate();
    } catch (e) {
        global.logError('snap-groups: could not activate group: ' + e);
    }
    if (!this._destroyed)
        this.destroy();
}

// The stock icon needs a real app; a group always shows its live layout.
function patchedAppIconInit(window, showThumbnail) {
    if (!isGroupEntry(window))
        return originals.appIconInit.apply(this, arguments);

    this.window = window;
    this.showThumbnail = true;
    this.app = null;
    this.icon = null;
    this.actor = new St.BoxLayout({ style_class: 'alt-tab-app', vertical: true });
    this._iconBin = new St.Bin();
    this.actor.add(this._iconBin, { x_fill: false, y_fill: false });

    this.label = new St.Label({ text: window.get_title() });
    const labelBin = new St.Bin({ x_align: St.Align.MIDDLE });
    labelBin.add_actor(this.label);
    this.actor.add(labelBin);
}

function init(metadata) {}

function enable() {
    originals = {
        getWindowsForBinding: AppSwitcher.getWindowsForBinding,
        switcherInit: AppSwitcher.AppSwitcher.prototype._init,
        activateSelected: AppSwitcher.AppSwitcher.prototype._activateSelected,
        appIconInit: ClassicSwitcher.AppIcon.prototype._init,
    };

    AppSwitcher.getWindowsForBinding = patchedGetWindowsForBinding;
    AppSwitcher.AppSwitcher.prototype._init = patchedSwitcherInit;
    AppSwitcher.AppSwitcher.prototype._activateSelected = patchedActivateSelected;
    ClassicSwitcher.AppIcon.prototype._init = patchedAppIconInit;

    seedFocusHistory();
    focusSignalId = global.display.connect('notify::focus-window', onFocusChanged);
}

function disable() {
    cancelPendingRestore();
    if (focusSignalId) {
        global.display.disconnect(focusSignalId);
        focusSignalId = 0;
    }
    focusStamps = new Map();
    focusCounter = 0;

    if (!originals)
        return;

    AppSwitcher.getWindowsForBinding = originals.getWindowsForBinding;
    AppSwitcher.AppSwitcher.prototype._init = originals.switcherInit;
    AppSwitcher.AppSwitcher.prototype._activateSelected = originals.activateSelected;
    ClassicSwitcher.AppIcon.prototype._init = originals.appIconInit;
    originals = null;
}
