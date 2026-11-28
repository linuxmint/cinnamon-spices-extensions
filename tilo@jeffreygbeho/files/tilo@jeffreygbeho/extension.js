/*
 * tilo - modern window tiling for Cinnamon.
 * https://github.com/JeffreyGbeho/tilo
 *
 * See docs/ARCHITECTURE.md for the constraints this design answers.
 */

const Main = require('ui.main');
const Settings = require('ui.settings');
const Clutter = require('gi.Clutter');
const Mainloop = require('mainloop');

const Logger = require('./lib/logger');
const Geometry = require('./lib/geometry');
const WindowMover = require('./lib/windowMover');
const Layouts = require('./lib/layouts');
const ConfigGuard = require('./lib/configGuard');
const { DragWatcher } = require('./lib/dragWatcher');
const { LayoutPicker } = require('./lib/layoutPicker');
const { ZoneEditor } = require('./lib/zoneEditor');
const Tree = require('./lib/layoutTree');
const { TileGroups } = require('./lib/tileGroup');
const { _ } = require('./lib/i18n');
const SavedGroups = require('./lib/savedGroups');
const { GroupSwitcher } = require('./lib/groupSwitcher');
const { HoverIntent } = require('./lib/hoverIntent');

const UUID = 'tilo@jeffreygbeho';

/* Only the middle of the top edge reveals the bar, so dragging a window into a
   top corner still means "corner", as it does everywhere else. */
const CENTER_BAND = 0.3;

/* Poll interval while the picker is summoned by shortcut rather than by drag. */
const KEY_POLL_MS = 16;

/*
 * How long the pointer has to mean it.
 *
 * Opening is the shorter of the two: the hand is already moving, and anything
 * near a third of a second reads as the panel being slow rather than careful.
 * Closing is more forgiving, because a moment of wobble at the edge of the
 * panel is not a decision to leave, and having it snap shut underneath you is
 * far more annoying than having it linger.
 */
const OPEN_INTENT_MS = 170;
const CLOSE_INTENT_MS = 280;

const BINDINGS = [
    { setting: 'kb-left',   position: 'left'   },
    { setting: 'kb-right',  position: 'right'  },
    { setting: 'kb-top',    position: 'top'    },
    { setting: 'kb-bottom', position: 'bottom' },
    { setting: 'kb-fill',   position: 'fill'   },
    { setting: 'kb-center', position: 'center' }
];

class Tilo {
    constructor(meta) {
        this._meta = meta;
        this._settings = null;
        this._registered = [];
        this._picker = null;
        this._editor = null;
        this._groups = null;
        this._switcher = null;
        this._drag = null;
        this._keyPollId = 0;
        this._keyMode = false;
        this._openIntent = null;
        this._closeIntent = null;
        this._enabled = false;
    }

    enable() {
        if (this._enabled) return;

        this._settings = new Settings.ExtensionSettings(this, UUID);
        ['inner-gap', 'outer-gap', 'debug', 'drag-to-top', 'reveal-threshold']
            .forEach(key => this._settings.bind(key, this._propertyFor(key),
                                                () => this._onSettingsChanged()));
        this._settings.bind('custom-layouts', 'customLayouts',
                            () => Layouts.setCustom(this.customLayouts));
        Layouts.setCustom(this.customLayouts);
        this._settings.bind('saved-groups', 'savedGroups', () => {});
        BINDINGS.concat([{ setting: 'kb-picker' }, { setting: 'kb-editor' },
                         { setting: 'kb-groups' }]).forEach(({ setting }) => {
            this._settings.bind(setting, this._propertyFor(setting),
                                () => this._rebindHotkeys());
        });

        Logger.setDebug(this.debugEnabled);

        const gaps = () => ({ inner: this.innerGap, outer: this.outerGap });

        this._picker = new LayoutPicker(gaps);
        this._groups = new TileGroups(gaps);

        this._editor = new ZoneEditor({
            onSave: tree => this._saveLayout(tree),
            onCancel: () => Logger.debug('editor cancelled')
        });

        this._switcher = new GroupSwitcher({
            getGroups: () => SavedGroups.load(this.savedGroups),
            canSave: () => this._snapshot() !== null,
            onRestore: group => this._restoreGroup(group),
            onDelete: group => this._forgetGroup(group),
            onSave: () => this._saveGroup()
        });

        /* Build the overlay now rather than on the first drag: it is around
           sixty actors and a style pass, and that showed up as a stalled frame
           exactly when the user was watching. */
        try {
            this._picker.warmUp(this._currentWorkArea());
        } catch (e) {
            Logger.error('could not pre-build the picker', e);
        }

        this._openIntent = new HoverIntent(OPEN_INTENT_MS, () => this._picker.expand());
        this._closeIntent = new HoverIntent(CLOSE_INTENT_MS, () => this._picker.collapse());

        this._drag = new DragWatcher({
            onDragStart: w => this._onDragStart(w),
            onDragMove: (w, x, y) => this._onDragMove(w, x, y),
            onDragEnd: (w, x, y) => this._onDragEnd(w, x, y),
            onResizeEnd: (w, from, to) => this._onResizeEnd(w, from, to)
        });
        this._drag.enable();

        this._rebindHotkeys();

        this._enabled = true;
        Logger.info(`enabled (v${this._meta.version || '?'})`);
    }

    /*
     * disable() must give everything back. An extension that leaks on disable is
     * exactly what gives window tiling on Linux a bad name.
     */
    disable() {
        this._stopKeyMode();
        this._unbindHotkeys();

        if (this._editor) { this._editor.close(); this._editor = null; }
        if (this._openIntent) { this._openIntent.destroy(); this._openIntent = null; }
        if (this._closeIntent) { this._closeIntent.destroy(); this._closeIntent = null; }
        if (this._switcher) { this._switcher.close(); this._switcher = null; }
        if (this._groups) { this._groups.clear(); this._groups = null; }
        if (this._drag) { this._drag.disable(); this._drag = null; }
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        WindowMover.reset();

        /* Safety net: if a foreign key override was active, hand the user their
           original state back before we leave. */
        ConfigGuard.restoreAll();

        if (this._settings) {
            this._settings.finalize();
            this._settings = null;
        }

        this._enabled = false;
        Logger.info('disabled, state restored');
    }

    _propertyFor(key) {
        /* 'kb-left' -> 'kbLeft', 'drag-to-top' -> 'dragToTop' */
        return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    }

    _onSettingsChanged() {
        Logger.setDebug(this.debugEnabled);
    }

    /* ------------------------------------------------------------- shortcuts */

    _rebindHotkeys() {
        this._unbindHotkeys();

        BINDINGS.forEach(({ setting, position }) => {
            this._register(`tilo-${position}`, this[this._propertyFor(setting)],
                           () => this._snapTo(position));
        });
        this._register('tilo-picker', this.kbPicker, () => this._toggleKeyMode());
        this._register('tilo-editor', this.kbEditor, () => this._toggleEditor());
        this._register('tilo-groups', this.kbGroups, () => this._toggleSwitcher());
    }

    _register(name, combination, callback) {
        if (!combination) return; /* the user cleared this shortcut */
        try {
            Main.keybindingManager.addHotKey(name, combination, callback);
            this._registered.push(name);
        } catch (e) {
            Logger.error(`Could not register ${combination}`, e);
        }
    }

    _unbindHotkeys() {
        this._registered.forEach(name => {
            try { Main.keybindingManager.removeHotKey(name); }
            catch (e) { Logger.error(`Could not remove ${name}`, e); }
        });
        this._registered = [];
    }

    _snapTo(position) {
        const window = WindowMover.focusedTileableWindow();
        if (!window) return;

        const fraction = Layouts.QUICK[position];
        if (!fraction) return;

        const workArea = Geometry.workAreaFor(window);
        WindowMover.place(window,
            Geometry.resolveZone(fraction, workArea, this.innerGap, this.outerGap));
    }

    /* ------------------------------------------------------ drag to the top */

    /*
     * The tab appears as soon as a window is picked up, wherever the pointer
     * is. Waiting until it neared the top edge meant the feature only ever
     * found people who already knew it was there.
     */
    _onDragStart(window) {
        if (!this.dragToTop || !WindowMover.isTileable(window)) return;
        this._picker.showTeaser(Geometry.workAreaFor(window));
    }

    _onDragMove(window, x, y) {
        if (!this._picker.visible) return;

        const workArea = Geometry.workAreaFor(window);
        const depth = y - workArea.y;

        if (this._picker.expanded) {
            this._picker.updatePointer(x, y);
            /* Leaving closes it, but only once the pointer has stayed away. */
            if (this._picker.nearBar(x, y)) this._closeIntent.cancel();
            else this._closeIntent.arm();
            return;
        }

        /*
         * Two ways in. Touching the tab opens it, which is what anyone who sees
         * it will try first. Reaching the top edge anywhere in the middle also
         * opens it, for people who already know the gesture and just throw the
         * window up there.
         *
         * The corners stay out of it, so dragging a window into a top corner
         * still means "corner" as it does everywhere else.
         */
        const centerLeft = workArea.x + workArea.width * CENTER_BAND;
        const centerRight = workArea.x + workArea.width * (1 - CENTER_BAND);
        const atTopEdge = depth <= this.revealThreshold &&
                          x >= centerLeft && x <= centerRight;

        if (this._picker.overTeaser(x, y) || atTopEdge) this._openIntent.arm();
        else this._openIntent.cancel();
    }

    _onDragEnd(window, x, y) {
        this._openIntent.cancel();
        this._closeIntent.cancel();
        const selection = this._picker ? this._picker.hoveredSelection() : null;
        if (this._picker) this._picker.hide();
        if (selection) this._placeInZone(window, selection);
    }

    /*
     * Placing through the picker also records the window as part of that
     * arrangement, which is what lets neighbours resize together and lets the
     * whole set be saved.
     */
    _placeInZone(window, selection) {
        WindowMover.place(window, selection.rect);
        this._groups.assign(window, selection.layout, selection.zoneIndex);
        this._groups.prune();
    }

    _onResizeEnd(window, startRect, endRect) {
        if (!this._groups) return;
        this._groups.prune();
        this._groups.resizeFrom(window, startRect, endRect);
    }

    /* -------------------------------------------------- saved arrangements */

    _toggleSwitcher() {
        if (!this._switcher) return;
        if (this._switcher.open) { this._switcher.close(); return; }
        this._stopKeyMode();
        this._switcher.show(this._currentWorkArea());
    }

    _snapshot() {
        const window = global.display.get_focus_window();
        if (!window || !this._groups) return null;
        this._groups.prune();
        return this._groups.snapshot(window);
    }

    _saveGroup() {
        const snapshot = this._snapshot();
        if (!snapshot) return;

        const existing = SavedGroups.load(this.savedGroups);
        const group = SavedGroups.create(snapshot, `${_('Group')} ${existing.length + 1}`);
        this._settings.setValue('saved-groups', existing.concat([group]));
        Logger.info(`saved "${group.name}" with ${group.windows.length} window(s)`);
    }

    _restoreGroup(group) {
        const workspace = global.workspace_manager.get_active_workspace();
        SavedGroups.restore(group, workspace, this._currentWorkArea(),
                            { inner: this.innerGap, outer: this.outerGap },
                            this._groups);
    }

    _forgetGroup(group) {
        const next = SavedGroups.load(this.savedGroups).filter(g => g.id !== group.id);
        this._settings.setValue('saved-groups', next);
        Logger.info(`forgot "${group.name}"`);
    }

    /* Bound to the button in the settings window. */
    clearSavedGroups() {
        this._settings.setValue('saved-groups', []);
        Logger.info('saved arrangements cleared');
    }

    /* --------------------------------------------------------- zone editor */

    _toggleEditor() {
        if (!this._editor) return;
        if (this._editor.open) { this._editor.close(); return; }

        this._stopKeyMode();
        /* Start from one zone covering the screen, and let the user cut it up.
           A blank canvas needs no explanation; a preset would need undo. */
        this._editor.show(this._currentWorkArea(), Tree.leaf());
    }

    _saveLayout(tree) {
        if (Tree.countZones(tree) < 2) {
            Logger.debug('layout with a single zone discarded');
            return;
        }

        const existing = Layouts.getCustom();
        const layout = {
            id: `custom-${Date.now()}`,
            name: `${_('Custom')} ${existing.length + 1}`,
            tree
        };
        const next = existing.concat([layout]);

        Layouts.setCustom(next);
        this._settings.setValue('custom-layouts', next);
        Logger.info(`saved "${layout.name}" with ${Tree.countZones(tree)} zones`);
    }

    /* Bound to the button in the settings window. */
    clearCustomLayouts() {
        Layouts.setCustom([]);
        this._settings.setValue('custom-layouts', []);
        Logger.info('custom layouts cleared');
    }

    _currentWorkArea() {
        const window = global.display.get_focus_window();
        if (window) return Geometry.workAreaFor(window);
        const monitor = global.display.get_current_monitor();
        const workspace = global.workspace_manager.get_active_workspace();
        const area = workspace.get_work_area_for_monitor(monitor);
        return { x: area.x, y: area.y, width: area.width, height: area.height };
    }

    /* -------------------------------------------------- picker by shortcut */

    _toggleKeyMode() {
        if (this._keyMode) { this._stopKeyMode(); return; }

        const window = WindowMover.focusedTileableWindow();
        if (!window) return;

        this._keyWindow = window;
        this._picker.showExpanded(Geometry.workAreaFor(window));
        this._keyMode = true;

        /*
         * The same polling path as the drag case: the picker never takes input
         * focus, so one code path serves both surfaces.
         */
        this._keyPollId = Mainloop.timeout_add(KEY_POLL_MS, () => {
            if (!this._keyMode) return false;
            const [x, y, mods] = global.get_pointer();
            this._picker.updatePointer(x, y);
            if (mods & Clutter.ModifierType.BUTTON1_MASK) {
                const selection = this._picker.hoveredSelection();
                const window = this._keyWindow;
                this._stopKeyMode();
                if (selection && window) this._placeInZone(window, selection);
                return false;
            }
            return true;
        });
    }

    _stopKeyMode() {
        this._keyMode = false;
        this._keyWindow = null;
        if (this._keyPollId) {
            Mainloop.source_remove(this._keyPollId);
            this._keyPollId = 0;
        }
        if (this._picker) this._picker.hide();
    }
}

let tilo = null;

function init(meta) { tilo = new Tilo(meta); }
function enable() { tilo.enable(); }
function disable() { tilo.disable(); tilo = null; }

module.exports = { init, enable, disable };
