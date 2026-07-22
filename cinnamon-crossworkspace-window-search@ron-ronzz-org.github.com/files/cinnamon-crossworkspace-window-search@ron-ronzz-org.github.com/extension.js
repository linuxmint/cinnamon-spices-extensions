// Cross-Workspace Window Search — v0.1.0
// Full-screen global window search across all workspaces for Cinnamon Desktop.
// Invoke with <Super><Ctrl><Alt>Up to search and jump to any open window.

const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;

const HOTKEY_NAME = 'cinnamon-crossworkspace-window-search-toggle';
const HOTKEY_COMBINATION = '<Super><Control><Alt>Up';
const UUID = 'cinnamon-crossworkspace-window-search@ron-ronzz-org.github.com';

// ---------------------------------------------------------------------------
// WindowRow — a single result row in the search list
// ---------------------------------------------------------------------------

var WindowRow = class WindowRow {
    constructor(params) {
        this.metaWindow = params.metaWindow;
        this._onActivate = params.onActivate;

        this.actor = new St.BoxLayout({
            style_class: 'window-search-row',
            reactive: true,
            track_hover: true,
        });
        this.actor._delegate = this;

        const rowBox = new St.BoxLayout({
            style_class: 'window-search-row-box',
            vertical: false,
        });
        this.actor.add_actor(rowBox);

        // App icon
        this.icon = this._createIcon(params.metaWindow, params.app);
        if (this.icon) {
            this.icon.style_class = 'window-search-row-icon';
            rowBox.add_actor(this.icon);
        }

        // Text column: title + subtitle
        const textBox = new St.BoxLayout({
            style_class: 'window-search-row-text-box',
            vertical: true,
            x_expand: true,
        });
        rowBox.add_actor(textBox);

        this.titleLabel = new St.Label({
            style_class: 'window-search-row-title',
            text: params.metaWindow.get_title() || '(untitled)',
        });
        textBox.add_actor(this.titleLabel);

        this.subtitleLabel = new St.Label({
            style_class: 'window-search-row-subtitle',
            text: params.appName || params.wmClass || '',
        });
        textBox.add_actor(this.subtitleLabel);

        // Workspace badge
        this.wsBadge = new St.Label({
            style_class: 'window-search-row-workspace',
            text: 'ws ' + (params.workspaceIndex + 1),
        });
        rowBox.add_actor(this.wsBadge);

        // Connect click event
        this._clickId = this.actor.connect('button-release-event', () => {
            this._onActivate(this.metaWindow);
            return true;
        });
    }

    _createIcon(metaWindow, app) {
        if (app) {
            try {
                return app.create_icon_texture(24);
            } catch (e) {
                // fall through
            }
        }
        // Fallback: default application icon
        return new St.Icon({
            icon_name: 'application-x-executable',
            icon_size: 24,
            icon_type: St.IconType.FULLCOLOR,
        });
    }

    setSelected(selected) {
        if (selected) {
            this.actor.add_style_pseudo_class('selected');
            this.actor.set_style('background-color: rgba(74, 122, 181, 0.35);');
        } else {
            this.actor.remove_style_pseudo_class('selected');
            this.actor.set_style(null);
        }
    }

    destroy() {
        if (this._clickId) {
            this.actor.disconnect(this._clickId);
            this._clickId = null;
        }
        this.actor.destroy();
    }
};

// ---------------------------------------------------------------------------
// WindowSearchExtension — main extension logic
// ---------------------------------------------------------------------------

var WindowSearchExtension = class WindowSearchExtension {
    constructor(metadata) {
        this.metadata = metadata;
        this._enabled = false;
        this._rows = [];
        this._selectedIndex = 0;
        this._keybindingId = 0;
        this._entryKeyPressId = 0;
        this._entryKeyReleaseId = 0;
        this._overlayPressId = 0;
        this._overlayKeyPressId = 0;
    }

    // -----------------------------------------------------------------------
    // Enable / disable
    // -----------------------------------------------------------------------

    enable() {
        if (this._enabled) return;
        this._enabled = true;

        this._tracker = Cinnamon.WindowTracker.get_default();

        // Register global hotkey
        this._keybindingId = Main.keybindingManager.addHotKey(
            HOTKEY_NAME,
            HOTKEY_COMBINATION,
            () => this._toggle()
        );

        // Build UI (hidden initially)
        this._buildUI();
    }

    disable() {
        if (!this._enabled) return;
        this._enabled = false;

        // Unregister hotkey
        if (this._keybindingId) {
            Main.keybindingManager.removeHotKey(HOTKEY_NAME);
            this._keybindingId = 0;
        }

        // Destroy UI
        this._destroyUI();
    }

    // -----------------------------------------------------------------------
    // UI Construction
    // -----------------------------------------------------------------------

    _buildUI() {
        // Full-screen backdrop — St.BoxLayout so child alignment works.
        // Added to uiGroup (above windows) with high z-pos so it's on top.
        this._overlay = new St.BoxLayout({
            style_class: 'window-search-overlay',
            vertical: true,
            reactive: true,
            visible: false,
            width: global.screen_width,
            height: global.screen_height,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.START,
            // Set background inline in case CSS loading has symlink-path issues
            style: 'background-color: rgba(0, 0, 0, 0.55);',
        });

        // Main vertical layout — must not x-expand or centering won't apply
        this._mainBox = new St.BoxLayout({
            style_class: 'window-search-main-box',
            vertical: true,
            x_expand: false,
            y_expand: false,
        });
        this._overlay.add_actor(this._mainBox);

        // Search entry
        this._entry = new St.Entry({
            style_class: 'window-search-entry',
            hint_text: 'Search open windows...',
            can_focus: true,
        });
        this._mainBox.add_actor(this._entry);

        // Scrollable results
        this._resultsScroll = new St.ScrollView({
            style_class: 'window-search-results',
        });
        this._resultsBox = new St.BoxLayout({
            style_class: 'window-search-results-box',
            vertical: true,
        });
        this._resultsScroll.add_actor(this._resultsBox);
        this._mainBox.add_actor(this._resultsScroll);

        // Footer
        this._footer = new St.Label({
            style_class: 'window-search-footer',
            text: '↑↓ Navigate  ↵ Open  ⎋ Close',
        });
        this._mainBox.add_actor(this._footer);

        // Signal: backdrop click closes
        this._overlayPressId = this._overlay.connect('button-press-event', (actor, event) => {
            // Only close if clicking directly on the overlay, not on a child widget
            if (event.get_target() === this._overlay) {
                this._hide();
            }
            return true;
        });

        // Signal: entry key press (navigation)
        this._entryKeyPressId = this._entry.clutter_text.connect('key-press-event',
            (entry, event) => this._onEntryKeyPress(event)
        );

        // Signal: entry key release (filtering)
        this._entryKeyReleaseId = this._entry.clutter_text.connect('key-release-event',
            (entry, event) => this._onEntryKeyRelease(event)
        );

        // Signal: overlay key press — handle Escape here as fallback,
        // and forward all other keys to the entry in case it lost focus
        this._overlayKeyPressId = this._overlay.connect('key-press-event',
            (actor, event) => {
                const key = event.get_key_symbol();
                if (key === Clutter.KEY_Escape) {
                    this._hide();
                    return true;
                }
                // Forward control keys to entry handler if entry missed them
                if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter ||
                    key === Clutter.KEY_Up || key === Clutter.KEY_Down ||
                    key === Clutter.KEY_Page_Up || key === Clutter.KEY_Page_Down ||
                    key === Clutter.KEY_Home || key === Clutter.KEY_End) {
                    return this._onEntryKeyPress(event);
                }
                return false;
            }
        );

        // Add directly to uiGroup (above windows, below panels)
        Main.uiGroup.add_actor(this._overlay);
    }

    _destroyUI() {
        Main.keybindingManager.removeHotKey('window-search-escape');
        try { Main.popModal(this._entry ? this._entry.clutter_text : null); } catch (e) { }
        if (this._overlayPressId && this._overlay) {
            this._overlay.disconnect(this._overlayPressId);
            this._overlayPressId = 0;
        }
        if (this._overlayKeyPressId && this._overlay) {
            this._overlay.disconnect(this._overlayKeyPressId);
            this._overlayKeyPressId = 0;
        }
        if (this._entryKeyPressId && this._entry && this._entry.clutter_text) {
            this._entry.clutter_text.disconnect(this._entryKeyPressId);
            this._entryKeyPressId = 0;
        }
        if (this._entryKeyReleaseId && this._entry && this._entry.clutter_text) {
            this._entry.clutter_text.disconnect(this._entryKeyReleaseId);
            this._entryKeyReleaseId = 0;
        }
        if (this._overlay) {
            Main.uiGroup.remove_actor(this._overlay);
            this._overlay.destroy();
            this._overlay = null;
        }
        this._mainBox = null;
        this._entry = null;
        this._resultsScroll = null;
        this._resultsBox = null;
        this._footer = null;
    }

    // -----------------------------------------------------------------------
    // Show / Hide
    // -----------------------------------------------------------------------

    _toggle() {
        if (this._overlay && this._overlay.visible) {
            this._hide();
        } else {
            this._show();
        }
    }

    _show() {
        if (!this._overlay || this._overlay.visible) return;

        this._populateList();
        this._selectedIndex = 0;
        this._updateSelection();
        this._overlay.show();

        // Register Escape keybinding so it closes regardless of focus
        Main.keybindingManager.addHotKey(
            'window-search-escape',
            'Escape',
            () => this._hide()
        );

        // Push modal with the entry as the focus actor — pushModal internally
        // calls set_key_focus(actor), so passing the entry ensures typed
        // characters land in the search field (not the overlay background).
        Main.pushModal(this._entry.clutter_text, global.get_current_time());
    }

    _hide() {
        if (!this._overlay || !this._overlay.visible) return;

        Main.keybindingManager.removeHotKey('window-search-escape');
        // Must pass same actor as pushModal so popModal restores focus correctly
        Main.popModal(this._entry.clutter_text, global.get_current_time());
        this._entry.set_text('');
        this._overlay.hide();
    }

    // -----------------------------------------------------------------------
    // Window enumeration
    // -----------------------------------------------------------------------

    _populateList() {
        // Clear existing rows
        this._clearRows();

        // Enumerate all windows across all workspaces
        const windows = global.display.list_windows(0);

        for (let i = 0; i < windows.length; i++) {
            const metaWindow = windows[i];

            // Skip windows Cinnamon considers uninteresting (panels, desklets, etc.)
            if (!Main.isInteresting(metaWindow)) continue;
            // Skip windows that are on the skip-taskbar list
            if (metaWindow.is_skip_taskbar()) continue;

            const workspace = metaWindow.get_workspace();
            if (!workspace) continue;

            const workspaceIndex = workspace.index();

            // Get app info for icon and name
            let app = null;
            let appName = '';
            let wmClass = metaWindow.get_wm_class() || '';

            try {
                app = this._tracker.get_window_app(metaWindow);
                if (!app) app = this._tracker.get_app_from_pid(metaWindow.get_pid());
                if (!app) app = this._tracker.get_app_from_pid(metaWindow.get_client_pid());
                if (app) appName = app.get_name();
            } catch (e) {
                // App lookup failed, use wm_class as name
                appName = wmClass;
            }

            const row = new WindowRow({
                metaWindow: metaWindow,
                app: app,
                appName: appName,
                wmClass: wmClass,
                workspaceIndex: workspaceIndex,
                onActivate: (win) => this._activateWindow(win),
            });

            this._rows.push(row);
            this._resultsBox.add_actor(row.actor);
        }

        // Apply current filter
        this._applyFilter();
    }

    // -----------------------------------------------------------------------
    // Filtering
    // -----------------------------------------------------------------------

    _onEntryKeyRelease(event) {
        // Let key-press handler handle navigation keys first
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Up || key === Clutter.KEY_Down ||
            key === Clutter.KEY_Return || key === Clutter.KEY_Escape ||
            key === Clutter.KEY_Page_Up || key === Clutter.KEY_Page_Down ||
            key === Clutter.KEY_Home || key === Clutter.KEY_End) {
            return false;
        }

        this._applyFilter();
        return false;
    }

    _applyFilter() {
        const filterText = this._entry.get_text().toLowerCase();
        let visibleCount = 0;

        for (let i = 0; i < this._rows.length; i++) {
            const row = this._rows[i];
            const title = (row.metaWindow.get_title() || '').toLowerCase();
            const wmClass = (row.metaWindow.get_wm_class() || '').toLowerCase();

            const matches = filterText === '' ||
                title.indexOf(filterText) !== -1 ||
                wmClass.indexOf(filterText) !== -1;

            row.actor.visible = matches;
            if (matches) visibleCount++;
        }

        // Reset selection index and scroll to top
        this._selectedIndex = 0;
        this._updateSelection();
        this._scrollToSelected();

        // Update empty-state message
        if (visibleCount === 0) {
            this._showEmptyState('No windows match "' + this._entry.get_text() + '"');
        } else {
            this._hideEmptyState();
        }
    }

    _showEmptyState(text) {
        if (!this._emptyLabel) {
            this._emptyLabel = new St.Label({
                style_class: 'window-search-empty',
            });
            this._resultsBox.add_actor(this._emptyLabel);
            // Reorder: keep empty label as the only actor when shown
            this._resultsBox.set_child_at_index(this._emptyLabel, 0);
        }
        this._emptyLabel.set_text(text);

        // Hide all rows when showing empty state
        for (let i = 0; i < this._rows.length; i++) {
            this._rows[i].actor.visible = false;
        }
        this._emptyLabel.visible = true;
    }

    _hideEmptyState() {
        if (this._emptyLabel) {
            this._emptyLabel.visible = false;
        }
    }

    // -----------------------------------------------------------------------
    // Keyboard navigation
    // -----------------------------------------------------------------------

    _onEntryKeyPress(event) {
        const key = event.get_key_symbol();

        switch (key) {
            case Clutter.KEY_Down:
                this._selectNext();
                return true;
            case Clutter.KEY_Up:
                this._selectPrevious();
                return true;
            case Clutter.KEY_Return:
            case Clutter.KEY_KP_Enter:
                this._activateSelected();
                return true;
            case Clutter.KEY_Escape:
                this._hide();
                return true;
            case Clutter.KEY_Page_Down:
                this._selectPageDown();
                return true;
            case Clutter.KEY_Page_Up:
                this._selectPageUp();
                return true;
            case Clutter.KEY_Home:
                this._selectFirst();
                return true;
            case Clutter.KEY_End:
                this._selectLast();
                return true;
            default:
                return false; // Let key-release handle filtering
        }
    }

    // -----------------------------------------------------------------------
    // Selection management
    // -----------------------------------------------------------------------

    _getVisibleRows() {
        return this._rows.filter(row => row.actor.visible);
    }

    _updateSelection() {
        const visible = this._getVisibleRows();
        for (let i = 0; i < visible.length; i++) {
            visible[i].setSelected(i === this._selectedIndex);
        }
    }

    _selectNext() {
        const visible = this._getVisibleRows();
        if (visible.length === 0) return;
        this._selectedIndex = Math.min(this._selectedIndex + 1, visible.length - 1);
        this._updateSelection();
        this._scrollToSelected();
    }

    _selectPrevious() {
        const visible = this._getVisibleRows();
        if (visible.length === 0) return;
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this._updateSelection();
        this._scrollToSelected();
    }

    _selectFirst() {
        const visible = this._getVisibleRows();
        if (visible.length === 0) return;
        this._selectedIndex = 0;
        this._updateSelection();
        this._scrollToSelected();
    }

    _selectLast() {
        const visible = this._getVisibleRows();
        if (visible.length === 0) return;
        this._selectedIndex = visible.length - 1;
        this._updateSelection();
        this._scrollToSelected();
    }

    _selectPageDown() {
        const visible = this._getVisibleRows();
        if (visible.length === 0) return;
        const pageSize = Math.max(5, Math.floor(visible.length / 3));
        this._selectedIndex = Math.min(this._selectedIndex + pageSize, visible.length - 1);
        this._updateSelection();
        this._scrollToSelected();
    }

    _selectPageUp() {
        const visible = this._getVisibleRows();
        if (visible.length === 0) return;
        const pageSize = Math.max(5, Math.floor(visible.length / 3));
        this._selectedIndex = Math.max(this._selectedIndex - pageSize, 0);
        this._updateSelection();
        this._scrollToSelected();
    }

    _scrollToSelected() {
        const visible = this._getVisibleRows();
        if (visible.length === 0 || this._selectedIndex >= visible.length) return;

        const selectedActor = visible[this._selectedIndex].actor;
        const vadjust = this._resultsScroll.get_vscroll_bar().get_adjustment();

        if (!vadjust) return;

        const box = selectedActor.get_allocation_box();
        const actorY = box.y1 + this._resultsBox.get_allocation_box().y1;
        const actorHeight = box.y2 - box.y1;
        const currentValue = vadjust.value;
        const pageSize = vadjust.page_size;

        if (actorY < currentValue) {
            vadjust.value = actorY;
        } else if (actorY + actorHeight > currentValue + pageSize) {
            vadjust.value = actorY + actorHeight - pageSize;
        }
    }

    // -----------------------------------------------------------------------
    // Window activation
    // -----------------------------------------------------------------------

    _activateSelected() {
        const visible = this._getVisibleRows();
        if (this._selectedIndex < visible.length) {
            this._activateWindow(visible[this._selectedIndex].metaWindow);
        }
    }

    _activateWindow(metaWindow) {
        if (!metaWindow) return;
        // Hide BEFORE activating — this pops the modal first, then
        // activateWindow can freely switch workspace and focus the target
        this._hide();
        Main.activateWindow(metaWindow, global.get_current_time());
    }

    // -----------------------------------------------------------------------
    // Cleanup helpers
    // -----------------------------------------------------------------------

    _clearRows() {
        for (let i = 0; i < this._rows.length; i++) {
            this._rows[i].destroy();
        }
        this._rows = [];
        this._selectedIndex = 0;

        // Clear the results box (remove all children)
        this._resultsBox.destroy_all_children();
        this._emptyLabel = null;
    }
};

// ---------------------------------------------------------------------------
// Cinnamon extension entry points
// ---------------------------------------------------------------------------

let _instance = null;

function init(metadata) {
    _instance = new WindowSearchExtension(metadata);
}

function enable() {
    if (_instance) _instance.enable();
}

function disable() {
    if (_instance) _instance.disable();
    _instance = null;
}
