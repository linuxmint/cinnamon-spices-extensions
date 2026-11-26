const { Clutter, Gio, GLib, St } = imports.gi;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const { UUID, _, lerp, bindTranslations, setLanguage, scrollStep, COLORS, rollSwitch, resetRoll } = require('./util');
const { EngineClient } = require('./engine');
const { MusicTab } = require('./tabMusic');
const { VolumeTab, OUTPUT_ICONS, outputLabel } = require('./tabVolume');
const { phaseColor } = require('./tabPomodoro');
const { TimeTab } = require('./tabTime');
const { FilesTab } = require('./tabFiles');
const { NotesTab } = require('./tabNotes');
const { ClipboardTab } = require('./tabClipboard');
const { SystemTab } = require('./tabSystem');
const { WeatherTab } = require('./tabWeather');
const { AgendaTab } = require('./tabAgenda');
const { ToolsTab } = require('./tabTools');
const { InboxTab } = require('./tabInbox');
const Cinnamon = imports.gi.Cinnamon;
const DND = imports.ui.dnd;
const Util = imports.misc.util;
const { Collapsed } = require('./collapsed');

const HOTKEY_NAME = 'island-toggle';
// Sound shortcuts: [shortcut name, preference key, engine command].
const SOUND_HOTKEYS = [
    ['island-mic-mute', 'hotkey-mic-mute', 'ToggleMicMute'],
    ['island-next-output', 'hotkey-next-output', 'NextOutput'],
];

// Measurements of the collapsed and expanded notch. "along" is the length of
// the body along the screen edge and "depth" is how far it reaches into the
// screen. "ear" is the radius of the small curve joining the body to the
// screen edge and "radius" is the radius of the two inner corners. The curves
// are small on purpose, in the NotchNook style.
const COLLAPSED = { along: 170, depth: 28, ear: 6, radius: 10 };
const EXPANDED = { along: 700, depth: 175, ear: 12, radius: 24 };
// On the sides the body keeps the same proportions, only coming out sideways.
const EXPANDED_SIDE = { along: 175, depth: 700, ear: 12, radius: 24 };

const BLUR_PASSES = 6;
const TINT = [18, 18, 22];
const OUTLINE_ALPHA = 0.18;

// Pomodoro end-of-phase alert: how long the island flashes, how many times,
// and how long it stays open by itself.
const ALERT_FLASH_MS = 2400;
const ALERT_PULSES = 3;
const ALERT_OPEN_MS = 6000;

// Gap between the open island and the camera mirror.
const CAMERA_GAP = 14;

// Height of the strip that senses the mouse when the island is hidden.
const HIDDEN_STRIP = 5;

// Other names each tab may appear under in the preferences list (so the order
// survives a language change).
const TAB_ALIASES = {
    Music: ['media', 'mídia', 'midia'],
    Pomodoro: ['clock', 'relógio', 'relogio', 'timer'],
    Agenda: ['agenda', 'calendar'],
    Notes: ['notes', 'notas'],
    Clipboard: ['clipboard'],
    Files: ['files', 'arquivos'],
    Weather: ['weather', 'clima'],
    System: ['system', 'sistema'],
    Volume: ['volume'],
    Tools: ['tools', 'ferramentas'],
    Inbox: ['notifications', 'notificações', 'notificacoes', 'inbox'],
};

// Tab orbs: size, width of the strip they take on each side of the island and
// distance from the screen edge.
const ORB_SIZE = 26;
const ORB_GUTTER = 36;
const ORB_TOP = 8;

// How much the collapsed island widens to fit the text of a notice.
const NOTICE_EXTRA_WIDTH = 130;

const POMODORO_SETTINGS = [
    'pomodoro-focus-minutes', 'pomodoro-short-break-minutes', 'pomodoro-long-break-minutes',
    'pomodoro-cycles', 'pomodoro-pause-music', 'pomodoro-sound', 'pomodoro-sound-file',
    'pomodoro-sound-repeat',
];

// After a drag from another program leaves the island, how long it still
// counts as "having something over it".
const DRAG_OVER_MS = 700;
// While someone drags something from another program, the closed island also
// accepts the drag a little around itself (to the sides and below).
const DRAG_REACH = 110;
const DRAG_REACH_DEEP = 22;

const EXPAND_MS = 560;
const COLLAPSE_MS = 340;

// Animation curves. `spring` is a damped spring: it overshoots a little and
// comes back, like something elastic settling.
function spring(t) {
    return 1 - Math.exp(-8 * t) * Math.cos(7 * t) * (1 - t);
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Constant to approximate a quarter circle with a Bézier curve.
const KAPPA = 0.5523;

class Island {
    constructor(dir) {
        // The language has to be set before any text is created.
        this.settings = new Settings.ExtensionSettings(this, UUID);
        // The last open tab; it has to be read before the tabs are created.
        this.settings.bind('last-tab', 'lastTab');
        this.settings.bind('tab-order', 'tabOrder', () => {
            if (this._tabs && this._tabNames)
                this._syncTabs();
        });
        this.settings.bind('language', 'language', () => rebuild());
        // With a language picked in the settings the texts arrive a moment
        // later; the island is then rebuilt with them.
        setLanguage(dir, this.language, () => rebuild());

        this._expanded = false;
        this._pinned = false;
        // The animation has two timelines: the width (along) and the height
        // (depth) do not move together, which gives the "liquid" feel.
        // _progress is the overall progress, used for the content to fade in
        // and out.
        this._progress = 0;
        this._alongProgress = 0;
        this._depthProgress = 0;
        this._timeline = null;
        this._closeTimeoutId = 0;
        this._openTimeoutId = 0;
        this._modalRefs = 0;
        this._keyboardMode = false;
        this._hiddenNow = false;

        this.actor = new St.Widget({
            style_class: 'island',
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
        });

        // Gives access to the island from the actor, for inspection in Looking
        // Glass.
        this.actor._delegate = this;

        // The glass body: the colour and the blur come from the style applied
        // in _applyGlass().
        this._glass = new St.Widget();
        this.actor.add_child(this._glass);

        // The "ears" joining the body to the edge and the outline are drawn by
        // hand, because St can only round corners outwards.
        this._shape = new St.DrawingArea();
        this._shape.connect('repaint', area => this._drawShape(area));
        this.actor.add_child(this._shape);

        // The content always stays at the expanded size, inside a clip the
        // current size of the body, so the text does not reflow during the
        // animation.
        this._contentClip = new St.Widget({
            layout_manager: new Clutter.FixedLayout(),
            clip_to_allocation: true,
        });
        this.actor.add_child(this._contentClip);

        // The chosen tab on top and, below, just its name. Tabs are switched
        // with the orbs on both sides of the island (or with the mouse wheel
        // over the orbs or the name).
        this._content = new St.BoxLayout({ style_class: 'island-content', vertical: true, opacity: 0 });
        this._tabLabel = new St.Label({ style_class: 'island-tab-name', x_expand: true });
        this._tabRow = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, reactive: true });
        this._tabRow.add_child(this._tabLabel);
        this._tabRow.connect('scroll-event', (actor, event) => this._onScroll(event));
        // In the corners of the name row: the pin, which keeps the island open
        // even with the mouse away, and the gear, which opens the settings.
        this._pinButton = this._makeCornerButton('xapp-pin-symbolic', Clutter.ActorAlign.START, () => this._togglePin());
        this._tabRow.add_child(this._pinButton);
        this._tabRow.add_child(this._makeCornerButton('preferences-system-symbolic', Clutter.ActorAlign.END, () => this._openSettings()));
        // The two orb columns sit outside the body of the island, one on each
        // side, and only show while it is open.
        this._orbColumns = [];
        for (let i = 0; i < 2; i++) {
            let column = new St.BoxLayout({ style_class: 'island-orbs', vertical: true, reactive: true, opacity: 0 });
            column.connect('scroll-event', (actor, event) => this._onScroll(event));
            this._orbColumns.push(column);
        }
        this._tabStack = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true });
        // The tab and the buttons live in their own box: that way the extra
        // strip below shows and hides without shifting anything in here.
        this._main = new St.BoxLayout({ style_class: 'island-main', vertical: true, x_expand: true, y_expand: true });
        this._main.add_child(this._tabStack);
        this._main.add_child(this._tabRow);
        this._content.add_child(this._main);
        // Strip below the tab buttons, which only exists when the tab on
        // display asks for extra height (the song lyrics). The island
        // stretches down by exactly the height of this strip, so what is above
        // stays in place.
        this._extraArea = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            clip_to_allocation: true,
            visible: false,
        });
        this._content.add_child(this._extraArea);
        for (let column of this._orbColumns)
            this.actor.add_child(column);
        this._contentClip.add_child(this._content);

        this._engine = new EngineClient(dir);
        this._tabs = {};
        // The tab order follows use: sound, then time and focus, then what the
        // island keeps for you, and finally system information. The last
        // argument, when present, is the engine tab the tab takes its state
        // from (Agenda uses the same state as Weather).
        let editing = {
            begin: onClickOutside => this._beginEditing(onClickOutside),
            end: () => this._endEditing(),
        };
        this._addTab('Volume', _("Volume"), 'audio-volume-high-symbolic', new VolumeTab(this._engine));
        this._addTab('Music', _("Media"), 'audio-x-generic-symbolic', new MusicTab(this._engine, () => {
            this.lyricsEnabled = true;
            this._configureMusic();
        }, () => this._syncExtraDepth()));
        this._addTab('Pomodoro', _("Clock"), 'alarm-symbolic', new TimeTab(this._engine, editing,
            (phase, direction) => this._adjustPomodoro(phase, direction),
            (phase, minutes) => this._setPomodoroMinutes(phase, minutes)));
        this._addTab('Agenda', _("Agenda"), 'x-office-calendar-symbolic', new AgendaTab(() => this._openCalendar()), 'Weather');
        this._addTab('Notes', _("Notes"), 'accessories-text-editor-symbolic', new NotesTab(this._engine, editing, () => this._selectTab('Files')));
        this._addTab('Clipboard', _("Clipboard"), 'edit-paste-symbolic', new ClipboardTab(this._engine));
        this._addTab('Files', _("Files"), 'folder-symbolic', new FilesTab(this._engine));
        this._addTab('Weather', _("Weather"), 'weather-few-clouds-symbolic', new WeatherTab(this._engine, editing,
            (latitude, longitude) => this._openUri('https://open-meteo.com/en/docs?latitude=' + latitude +
                '&longitude=' + longitude + '&timezone=auto&forecast_days=7')));
        this._addTab('Inbox', _("Notifications"), 'preferences-system-notifications-symbolic', new InboxTab(this._engine));
        this._addTab('System', _("System"), 'utilities-system-monitor-symbolic', new SystemTab(this._engine));
        this._addTab('Tools', _("Tools"), 'applications-utilities-symbolic', new ToolsTab(this._engine, {
            pickColor: () => this._startColorPick(),
            runHidden: action => this._runHidden(action),
            toggleCamera: () => this._toggleCamera(),
        }));
        this._syncTabs();

        // What shows while the island is collapsed (cover, wave bars, volume
        // bar).
        this._collapsedExtra = 0;
        // Extra height of the open island, requested by the tab on display
        // (Media stretches to show the lyrics).
        this._expandedExtra = 0;
        this._collapsed = new Collapsed(() => this._animateCollapsedWidth(), () => this._syncHidden());
        this.actor.add_child(this._collapsed.actor);

        this._engineId = this._engine.connect('changed', (engine, tab) => this._onEngineChanged(tab));
        this._levelsId = this._engine.connect('levels', (engine, levels) => this._collapsed.setLevels(levels));
        this._shelfScrollId = this._engine.connect('shelf-scrolled', (engine, step) => this._stepTab(step));
        // Every drag coming from another program passes through here; the
        // island checks by itself whether it is near, without relying on
        // Cinnamon finding the right actor under the mouse.
        this._dragMonitor = {
            dragMotion: (event) => {
                if (event.source === Main.xdndHandler && !this._expanded && this._nearIsland(event.x, event.y))
                    this.handleDragOver(event.source, event.dragActor, event.x, event.y, 0);
                return DND.DragMotionResult.CONTINUE;
            },
        };
        DND.addDragMonitor(this._dragMonitor);
        this._connectedId = this._engine.connect('connected', () => {
            this._configureMusic();
            this._configureClipboard();
            this._configurePomodoro();
            this._configureWeather();
            this._configureNotices();
            // A freshly started engine does not know yet where the shelf is.
            this._shelfKey = '';
            this._queueShelfSync();
        });

        this.settings.bind('position', 'position', () => this._relayout());
        this.settings.bind('hotkey', 'hotkey', () => this._updateHotkey());
        for (let [name, key] of SOUND_HOTKEYS)
            this.settings.bind(key, key.replace(/-/g, '_'), () => this._updateHotkey());
        this.settings.bind('close-delay', 'closeDelay');
        this.settings.bind('open-mode', 'openMode', () => this._onHoverChanged());
        this.settings.bind('open-delay', 'openDelay');
        this.settings.bind('hide-closed', 'hideClosed', () => this._syncHidden());
        this.settings.bind('blur', 'blur', () => this._relayout());
        this.settings.bind('glass-opacity', 'glassOpacity', () => this._relayout());
        this.settings.bind('calendar-url', 'calendarUrl', () => this._configureWeather());
        this.settings.bind('calendar-click', 'calendarClick');
        this.settings.bind('clean-links', 'cleanLinks', () => this._configureClipboard());
        this.settings.bind('lyrics-enabled', 'lyricsEnabled', () => this._configureMusic());
        this.settings.bind('real-waves', 'realWaves', () => this._configureMusic());
        this.settings.bind('notice-downloads', 'noticeDownloads', () => this._configureNotices());
        this.settings.bind('notice-devices', 'noticeDevices', () => this._configureNotices());
        this.settings.bind('notice-events', 'noticeEvents', () => this._configureNotices());
        this.settings.bind('notice-notifications', 'noticeNotifications', () => {
            this._configureNotices();
            this._syncTabs();
        });
        for (let key of POMODORO_SETTINGS)
            this.settings.bind(key, key.replace(/-/g, '_'), () => this._configurePomodoro());

        // The input region of the island is built from invisible pieces,
        // instead of the whole actor, so a "hole" can be opened over the file
        // shelf: there the mouse goes to the invisible window of the engine.
        // With no hole, only the first piece is on and covers the whole
        // island.
        Main.layoutManager.addChrome(this.actor, { visibleInFullscreen: false, affectsInputRegion: false });
        this._inputPieces = [];
        for (let i = 0; i < 4; i++) {
            let piece = new St.Widget({ visible: i === 0 });
            this.actor.add_child(piece);
            Main.layoutManager.trackChrome(piece, { affectsInputRegion: true });
            this._inputPieces.push(piece);
        }
        this._hole = null;
        this._shelfKey = '';

        this._hoverId = this.actor.connect('notify::hover', () => this._onHoverChanged());
        // The wheel switches tabs anywhere on the open island. Controls that
        // use the wheel themselves (bars, ruler, rows of pills) stop the event
        // before it gets here.
        this._scrollId = this.actor.connect('scroll-event', (actor, event) => this._onScroll(event));
        this._clickId = this.actor.connect('button-release-event', (actor, event) => this._onClicked(event));

        // When only a piece of the island is redrawn (a button that changes,
        // the wave bars), the blur of that piece mixes in the surroundings
        // already darkened by the glass and leaves a darker rectangle.
        // Redrawing the whole glass along with it avoids that.
        this._redrawId = this.actor.connect('queue-redraw', (actor, origin) => {
            if (origin !== this._glass)
                this._glass.queue_redraw();
            return false;
        });
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._relayout());

        this._updateHotkey();
        this._relayout();
    }

    _isSide() {
        return this.position === 'left' || this.position === 'right';
    }

    // Measurements of the notch at a point of the animation (0 = collapsed, 1
    // = expanded).
    _metrics(alongProgress, depthProgress) {
        let monitor = Main.layoutManager.primaryMonitor;
        let side = this._isSide();
        let to = side ? EXPANDED_SIDE : EXPANDED;
        let m = {
            along: Math.round(lerp(COLLAPSED.along + this._collapsedExtra, to.along, alongProgress)),
            ear: Math.round(lerp(COLLAPSED.ear, to.ear, alongProgress)),
            depth: Math.round(lerp(COLLAPSED.depth, to.depth + (side ? 0 : this._expandedExtra), depthProgress)),
            radius: Math.round(lerp(COLLAPSED.radius, to.radius, depthProgress)),
        };

        // The orb strip only exists while the island is open.
        m.gutter = Math.round(ORB_GUTTER * Math.max(0, Math.min(1, alongProgress)));
        m.ear = Math.max(1, m.ear);
        m.depth = Math.max(8, Math.min(m.depth, side ? monitor.width : monitor.height));
        m.along = Math.max(40, Math.min(m.along, (side ? monitor.height : monitor.width) - 2 * m.ear - 2 * m.gutter));
        m.radius = Math.max(1, Math.min(m.radius, m.depth, Math.floor(m.along / 2)));
        return m;
    }

    // Positions everything for the current point of the animation. The notch
    // sits against the chosen edge, centred on the primary monitor.
    _relayout() {
        let monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        let m = this._metrics(this._alongProgress, this._depthProgress);
        this._m = m;
        // From end to end: the orb strip, the small curve, the body, the other
        // small curve and the other orb strip.
        let total = m.along + 2 * m.ear + 2 * m.gutter;
        let side = this._isSide();
        let width = side ? m.depth : total;
        let height = side ? total : m.depth;

        let x = monitor.x + Math.round((monitor.width - width) / 2);
        let y = monitor.y + Math.round((monitor.height - height) / 2);
        if (this.position === 'bottom')
            y = monitor.y + monitor.height - height;
        else if (this.position === 'left')
            x = monitor.x;
        else if (this.position === 'right')
            x = monitor.x + monitor.width - width;
        else
            y = monitor.y;

        this.actor.set_position(x, y);
        this.actor.set_size(width, height);
        this._shape.set_size(width, height);

        let [bodyX, bodyY] = side ? [0, m.gutter + m.ear] : [m.gutter + m.ear, 0];
        let [bodyW, bodyH] = side ? [m.depth, m.along] : [m.along, m.depth];
        this._glass.set_position(bodyX, bodyY);
        this._glass.set_size(bodyW, bodyH);
        this._applyGlass();

        let full = this._metrics(1, 1);
        this._contentClip.set_position(bodyX, bodyY);
        this._contentClip.set_size(bodyW, bodyH);
        this._content.set_size(side ? full.depth : full.along, side ? full.along : full.depth);
        this._content.set_position(
            this.position === 'right' ? bodyW - full.depth : 0,
            this.position === 'bottom' ? bodyH - full.depth : 0);
        this._content.opacity = Math.round(255 * Math.max(0, (this._progress - 0.4) / 0.6));
        // The extra strip always has the height the island stretched by, and
        // its content fades in gradually.
        let extraHeight = Math.round(this._expandedExtra);
        this._extraArea.visible = extraHeight > 0;
        this._extraArea.height = extraHeight;
        let extraFull = Math.max(extraHeight, this._extraTarget || 0, this._extraFrom || 0);
        this._extraArea.opacity = extraFull > 0 ? Math.round(255 * Math.pow(extraHeight / extraFull, 2)) : 0;
        this._contentClip.visible = this._progress > 0;

        // The collapsed content disappears right at the start of the
        // expansion. On the sides the collapsed body stands upright and has no
        // width for it.
        let mini = this._collapsed.actor;
        mini.visible = !side && this._progress < 0.35;
        mini.opacity = Math.round(255 * Math.max(0, 1 - this._progress / 0.35));
        let miniWidth = COLLAPSED.along + Math.round(this._collapsedExtra);
        mini.set_position(bodyX + Math.round((bodyW - miniWidth) / 2),
            this.position === 'bottom' ? bodyH - COLLAPSED.depth : 0);
        mini.set_size(miniWidth, COLLAPSED.depth);

        // The orbs sit in the two outer strips and show up at the end of the
        // opening.
        let orbOpacity = Math.round(255 * Math.max(0, Math.min(1, (this._alongProgress - 0.55) / 0.45)));
        this._orbColumns.forEach((column, i) => {
            column.vertical = !side;
            column.visible = orbOpacity > 0;
            column.opacity = orbOpacity;
            let inset = Math.round((ORB_GUTTER - ORB_SIZE) / 2);
            let far = total - m.gutter + inset;
            let along = i === 0 ? inset : far;
            let across = this.position === 'bottom' ? height - ORB_TOP - column.height
                : this.position === 'right' ? width - ORB_TOP - column.width : ORB_TOP;
            column.set_position(side ? across : along, side ? along : across);
        });

        this._shape.queue_repaint();
        this._queueShelfSync();
    }

    _addTab(name, title, iconName, tab, source = name) {
        // The orb of the tab; the icon has fallbacks for incomplete themes.
        let icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ names: [iconName, 'computer-symbolic', 'applications-system-symbolic'] }),
            icon_size: 14,
        });
        let button = new St.Button({ style_class: 'island-orb', child: icon });
        button.set_pivot_point(0.5, 0.5);
        button.connect('clicked', () => this._selectTab(name));
        tab.actor.visible = false;
        this._tabStack.add_child(tab.actor);
        this._tabs[name] = { button, tab, source, title, enabled: true };
    }

    // Reads the tab list from the preferences (order and which ones show).
    // Each row has the tab name, in any language, and whether it shows. Tabs
    // missing from the list go at the end; Volume always shows.
    _readTabOrder() {
        let byTitle = {};
        for (let name in this._tabs) {
            byTitle[name.toLowerCase()] = name;
            byTitle[this._tabs[name].title.toLowerCase()] = name;
            for (let alias of TAB_ALIASES[name] || [])
                byTitle[alias] = name;
        }
        let order = [];
        let rows = Array.isArray(this.tabOrder) ? this.tabOrder : [];
        for (let row of rows) {
            let name = byTitle[String(row.name || '').trim().toLowerCase()];
            if (!name || order.indexOf(name) >= 0)
                continue;
            order.push(name);
            this._tabs[name].enabled = name === 'Volume' || row.enabled !== false;
        }
        for (let name in this._tabs) {
            if (order.indexOf(name) < 0) {
                order.push(name);
                this._tabs[name].enabled = true;
            }
        }
        // Leaves the preferences list complete and in the current language, so
        // the settings window shows the right names.
        let wanted = order.map(name => ({ name: this._tabs[name].title, enabled: this._tabs[name].enabled }));
        if (JSON.stringify(wanted) !== JSON.stringify(rows.map(r => ({ name: r.name, enabled: r.enabled !== false }))))
            this.tabOrder = wanted;
        // The Notifications tab only exists while the option that listens to
        // system notifications is on (it is off by default).
        if (this.noticeNotifications !== true)
            this._tabs.Inbox.enabled = false;
        return order;
    }

    _syncTabs() {
        this._tabNames = this._readTabOrder().filter(name => this._tabs[name].enabled);
        // Splits the orbs of the enabled tabs between the two columns: the
        // first half on the left (or top), the rest on the other side.
        let enabled = this._tabNames;
        let half = Math.ceil(enabled.length / 2);
        for (let column of this._orbColumns)
            column.remove_all_children();
        enabled.forEach((name, i) => this._orbColumns[i < half ? 0 : 1].add_child(this._tabs[name].button));
        // With more than five orbs in a column, they get smaller and closer
        // together to fit the height of the island (in both columns, so the
        // two sides stay equal).
        let crowded = this._orbColumns.some(column => column.get_n_children() > 5);
        for (let column of this._orbColumns) {
            if (crowded)
                column.add_style_class_name('island-orbs-tight');
            else
                column.remove_style_class_name('island-orbs-tight');
        }
        let active = this._tabs[this._activeTab];
        if (!active || !active.enabled) {
            // The first time, open the last tab the person used.
            let last = this._tabs[this.lastTab];
            this._selectTab(!this._activeTab && last && last.enabled ? this.lastTab : 'Volume');
        }
    }

    // Mouse wheel rule: anywhere on the island it switches tabs, except over a
    // control that uses it (a bar changes the value, a row of pills changes
    // the chosen item). Those controls have the `island-wheel` class and light
    // up slightly under the mouse.
    _onScroll(event) {
        this._stepTab(scrollStep(event));
        return Clutter.EVENT_STOP;
    }

    // Goes to the next (+1) or previous (-1) tab. The list wraps around: from
    // the last to the first and back, and the content keeps rolling in the
    // direction of the wheel.
    _stepTab(step) {
        if (!step || !this._expanded)
            return;
        let names = this._tabNames;
        if (names.length < 2)
            return;
        let index = (names.indexOf(this._activeTab) + step + names.length) % names.length;
        this._selectTab(names[index], step);
    }

    // Tells the engine where the file shelf is (or that it is not on display)
    // and opens the hole in the input region. Done at idle time because the
    // position is only valid after Clutter lays out the stage.
    _queueShelfSync() {
        if (this._shelfSyncId)
            return;
        this._shelfSyncId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._shelfSyncId = 0;
            this._syncShelf();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncShelf() {
        let shelf = this._tabs.Files.tab.shelf;
        let rect = null;
        if (this._progress === 1 && this._activeTab === 'Files' && shelf.visible && this._engine.state.Files) {
            let [x, y] = shelf.get_transformed_position();
            let [w, h] = shelf.get_transformed_size();
            if (w > 0 && h > 0)
                rect = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
        }

        // Pieces of the input region: the whole island, or four strips around
        // the hole (top, bottom, left and right).
        let [width, height] = this.actor.get_size();
        let pieces;
        if (this._hiddenNow && !this._isSide()) {
            // While hidden, the island only needs a thin strip at the edge to
            // sense the mouse arriving; the rest stays free for whatever is
            // underneath.
            pieces = [[0, this.position === 'bottom' ? height - HIDDEN_STRIP : 0, width, HIDDEN_STRIP]];
        } else if (rect) {
            let hx = rect[0] - this.actor.x, hy = rect[1] - this.actor.y;
            let [hw, hh] = [rect[2], rect[3]];
            pieces = [
                [0, 0, width, hy],
                [0, hy + hh, width, height - hy - hh],
                [0, hy, hx, hh],
                [hx + hw, hy, width - hx - hw, hh],
            ];
        } else if (this._dragWatchId && !this._expanded) {
            // With a drag in progress, the target grows around the island.
            pieces = [[-DRAG_REACH, -DRAG_REACH_DEEP, width + 2 * DRAG_REACH, height + 2 * DRAG_REACH_DEEP]];
        } else {
            pieces = [[0, 0, width, height]];
        }
        this._inputPieces.forEach((piece, i) => {
            let p = pieces[i];
            piece.visible = !!p && p[2] > 0 && p[3] > 0;
            if (piece.visible) {
                piece.set_position(p[0], p[1]);
                piece.set_size(p[2], p[3]);
            }
        });

        let key = JSON.stringify(rect);
        if (key !== this._shelfKey) {
            this._shelfKey = key;
            this._engine.call('Files', 'SetShelf',
                new GLib.Variant('(iiiib)', rect ? [...rect, true] : [0, 0, 0, 0, false]));
        }
    }

    _nearIsland(x, y) {
        let [left, top] = this.actor.get_transformed_position();
        let [width, height] = this.actor.get_transformed_size();
        return x >= left - DRAG_REACH && x < left + width + DRAG_REACH &&
            y >= top - DRAG_REACH_DEEP && y < top + height + DRAG_REACH_DEEP;
    }

    // The engine reported that a drag started in some program. Until the mouse
    // button is released, the area that accepts the drag is larger than the
    // island.
    _watchDrag() {
        if (this._dragWatchId || !this._tabs.Files.enabled)
            return;
        this._dragWatchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            let mods = global.get_pointer()[2];
            if (mods & Clutter.ModifierType.BUTTON1_MASK)
                return GLib.SOURCE_CONTINUE;
            this._dragWatchId = 0;
            this._syncShelf();
            return GLib.SOURCE_REMOVE;
        });
        this._syncShelf();
    }

    // Cinnamon calls this when something dragged from another program passes
    // over the island: it opens on the Files tab to receive whatever comes.
    handleDragOver(source, actor, x, y, time) {
        if (!this._tabs.Files.enabled)
            return DND.DragMotionResult.CONTINUE;
        this._selectTab('Files');
        this._dragOver = true;
        if (this._dragOverId)
            GLib.source_remove(this._dragOverId);
        this._dragOverId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DRAG_OVER_MS, () => {
            this._dragOverId = 0;
            this._dragOver = false;
            this._onHoverChanged();
            return GLib.SOURCE_REMOVE;
        });
        this._onHoverChanged();
        return DND.DragMotionResult.CONTINUE;
    }

    // The mouse also counts as "over the island" when it is over the invisible
    // shelf window or dragging something over the island.
    _isHovered() {
        let files = this._engine.state.Files;
        return this.actor.hover || this._dragOver || !!(files && files.hover);
    }

    // `direction` (+1 or -1) is the way the content rolls; without it, the tab
    // order decides.
    _selectTab(name, direction = null) {
        if (!this._tabs[name] || !this._tabs[name].enabled)
            return;
        let names = this._tabNames || Object.keys(this._tabs);
        let previous = this._tabs[this._activeTab];
        if (direction === null)
            direction = names.indexOf(name) >= names.indexOf(this._activeTab) ? 1 : -1;
        this._activeTab = name;
        if (name === 'Inbox' && this._expanded)
            this._engine.call('Inbox', 'MarkRead');
        // The island remembers the last open tab, across sessions too.
        if (this.lastTab !== name)
            this.lastTab = name;
        this._syncExtraDepth();
        this._queueShelfSync();
        // Tabs that only update while on display get the current state when
        // opened.
        if (this._refreshId)
            GLib.source_remove(this._refreshId);
        this._refreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._refreshId = 0;
            let entry = this._tabs[name];
            if (entry && this._engine.state[entry.source] !== undefined)
                entry.tab.update(this._engine.state[entry.source]);
            return GLib.SOURCE_REMOVE;
        });
        // The switch rolls like a wheel, in the direction of the mouse wheel.
        // Only the two tabs involved are visible during the movement.
        let entry = this._tabs[name];
        for (let key in this._tabs) {
            let other = this._tabs[key];
            if (other !== entry && other !== previous) {
                resetRoll(other.tab.actor);
                other.tab.actor.visible = false;
            }
            if (key === name)
                other.button.add_style_pseudo_class('checked');
            else
                other.button.remove_style_pseudo_class('checked');
            other.button.ease({
                scale_x: key === name ? 1.14 : 1,
                scale_y: key === name ? 1.14 : 1,
                duration: 220,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
        this._tabLabel.text = entry.title;
        rollSwitch(previous ? previous.tab.actor : null, entry.tab.actor, direction,
            this._expanded && this._progress > 0.5 && !!previous, () => this._queueShelfSync());
    }

    _onEngineChanged(name) {
        let state = this._engine.state[name];
        for (let key in this._tabs) {
            if (this._tabs[key].source === name)
                this._tabs[key].tab.update(state);
        }

        if (name === 'Music') {
            this._collapsed.setMusic(state);
        } else if (name === 'Pomodoro') {
            this._collapsed.setPomodoro(state);
            // The alert counter goes up at the end of each phase (but the
            // first reading does not count).
            let last = this._lastPomodoro;
            this._lastPomodoro = state ? { alert: state.alert, phase: state.phase } : null;
            if (last && state && state.alert !== last.alert) {
                this._tabs.Pomodoro.tab.setMode('pomodoro');
                this._alert(last.phase);
            }
        } else if (name === 'Files') {
            // The counter goes up with each drag that starts (the first
            // reading does not count).
            let drags = state ? state.drags : undefined;
            if (drags !== undefined && this._lastDrags !== undefined && drags !== this._lastDrags)
                this._watchDrag();
            this._lastDrags = drags;
            this._queueShelfSync();
            this._onHoverChanged();
        } else if (name === 'Volume') {
            // Shows the volume bar on the collapsed island when the volume
            // changes (but not on the first reading, nor with the island
            // open).
            let last = this._lastVolume;
            this._lastVolume = state && state.available ? { volume: state.volume, muted: state.muted } : null;
            if (last && this._lastVolume && !this._expanded &&
                (last.volume !== state.volume || last.muted !== state.muted))
                this._collapsed.flashVolume(state);

            this._tabs.Music.tab.updateVolume(state);

            // Switching the audio output also becomes a notice.
            let lastOutput = this._lastOutput;
            this._lastOutput = state && state.available ? state.output : undefined;
            if (lastOutput !== undefined && this._lastOutput !== undefined && lastOutput !== this._lastOutput) {
                let output = state.outputs.find(o => o.name === state.output);
                if (output) {
                    this._collapsed.showNotice({
                        key: 'output',
                        icon: OUTPUT_ICONS[output.kind] || OUTPUT_ICONS.speakers,
                        color: COLORS.green,
                        text: outputLabel(output),
                    });
                }
            }

            // Turning the microphone on or off becomes a notice.
            let lastMic = this._lastMicMuted;
            this._lastMicMuted = state && state.mic_available ? state.mic_muted : undefined;
            if (lastMic !== undefined && this._lastMicMuted !== undefined && lastMic !== this._lastMicMuted) {
                this._collapsed.showNotice(state.mic_muted
                    ? { key: 'mic', icon: 'microphone-sensitivity-muted-symbolic', color: COLORS.rose, text: _("Microphone muted") }
                    : { key: 'mic', icon: 'microphone-sensitivity-high-symbolic', text: _("Microphone on") });
            }
        } else if (name === 'Timer') {
            this._tabs.Pomodoro.tab.updateTimer(state);
            this._collapsed.setTimer(state);
            // The timer ended: the island flashes and opens on it.
            let last = this._lastRings;
            this._lastRings = state ? state.rings : undefined;
            if (last !== undefined && state && state.rings !== last) {
                this._tabs.Pomodoro.tab.setMode('timer');
                this._alert(null, COLORS.amber);
            }
        } else if (name === 'Tools') {
            this._collapsed.setAwake(state);
        } else if (name === 'Lyrics') {
            this._tabs.Music.tab.updateLyrics(state);
        } else if (name === 'Weather') {
            this._collapsed.setEvents(state);
        } else if (name === 'Inbox') {
            // The orb of the tab turns yellow while there is an unseen
            // notification; looking at the tab counts as seeing it.
            let unread = !!state && state.unread > 0;
            if (unread && this._expanded && this._activeTab === 'Inbox') {
                this._engine.call('Inbox', 'MarkRead');
                unread = false;
            }
            let orb = this._tabs.Inbox.button;
            if (unread)
                orb.add_style_class_name('island-orb-unread');
            else
                orb.remove_style_class_name('island-orb-unread');
        } else if (name === 'Notices') {
            // The counter goes up with each engine notice (the first reading
            // does not count).
            let last = this._lastNoticeSeq;
            this._lastNoticeSeq = state ? state.seq : undefined;
            if (last !== undefined && state && state.seq !== last && state.notice)
                this._showEngineNotice(state.notice);
        }
    }

    // Opens an address in the default browser.
    _openUri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context());
        } catch (e) {
            global.logError('Cinnamon Island: could not open ' + uri + ': ' + e);
        }
    }

    // Click on the month or on an event in the Agenda tab: opens Google
    // Calendar in the browser or the default calendar program, according to
    // the preferences.
    _openCalendar() {
        let context = global.create_app_launch_context();
        try {
            if (this.calendarClick === 'app') {
                let app = Gio.AppInfo.get_default_for_type('text/calendar', false);
                if (app)
                    app.launch([], context);
            } else if (this.calendarClick !== 'none') {
                Gio.AppInfo.launch_default_for_uri('https://calendar.google.com/calendar/r', context);
            }
        } catch (e) {
            global.logError('Cinnamon Island: could not open the calendar: ' + e);
        }
    }

    _configureWeather() {
        this._engine.call('Weather', 'Configure', new GLib.Variant('(s)', [JSON.stringify({
            calendar_url: this.calendarUrl || '',
        })]));
    }

    // Sends the Pomodoro preferences to the engine, which is what stores them.
    _configurePomodoro() {
        let config = {};
        for (let key of POMODORO_SETTINGS) {
            let name = key.replace(/-/g, '_');
            config[name.replace(/^pomodoro_/, '')] = this[name];
        }
        this._engine.call('Pomodoro', 'Configure', new GLib.Variant('(s)', [JSON.stringify(config)]));
    }

    // Less and more time buttons of the Pomodoro tab: they change the
    // preference of the phase in question. In focus the step is 5 minutes
    // above 5 and 1 minute from there down (…15, 10, 5, 4, 3, 2, 1); in breaks
    // it is always 1.
    _adjustPomodoro(phase, direction) {
        let key = 'pomodoro-' + phase.replace(/_/g, '-') + '-minutes';
        let name = key.replace(/-/g, '_');
        let current = this[name];
        let value;
        if (phase !== 'focus' || current < 5 || (current === 5 && direction < 0))
            value = current + direction;
        else if (direction > 0)
            value = Math.floor(current / 5) * 5 + 5;
        else
            value = Math.ceil(current / 5) * 5 - 5;
        this._setPomodoroMinutes(phase, value);
    }

    // Sets the minutes of a Pomodoro phase (the ruler of the tab calls this).
    _setPomodoroMinutes(phase, minutes) {
        let name = ('pomodoro-' + phase.replace(/_/g, '-') + '-minutes').replace(/-/g, '_');
        let value = Math.max(1, Math.min(180, Math.round(minutes)));
        if (value === this[name])
            return;
        // Assigning to the bound property saves the preference but does not
        // fire the change callback; so the engine is told by hand.
        this[name] = value;
        this._configurePomodoro();
    }

    // Turns an engine notice (download, accessory, battery) into what the
    // collapsed island shows.
    _showEngineNotice(notice) {
        // Notices that carry something "copied" (a colour, text read from the
        // screen): the island is the one that puts it on the clipboard.
        if (typeof notice.copy === 'string' && notice.copy)
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, notice.copy);
        if (notice.kind === 'download') {
            this._collapsed.showNotice({
                icon: 'folder-download-symbolic',
                color: COLORS.blue,
                text: notice.name,
                tab: 'Files',
                // Hovering during the notice puts the file on the shelf.
                onOpen: () => this._engine.call('Files', 'Add', new GLib.Variant('(s)', [notice.path])),
            });
        } else if (notice.kind === 'notification') {
            // A system notification: the icon of the program and the title.
            this._tabs.Inbox.tab.remember(notice.id, notice.title);
            this._collapsed.showNotice({
                key: 'notification',
                icon: notice.icon,
                text: notice.title,
                tab: notice.stored && this._tabs.Inbox.enabled ? 'Inbox' : null,
            });
        } else if (notice.kind === 'link') {
            this._collapsed.showNotice({
                key: 'link',
                icon: 'edit-clear-all-symbolic',
                color: COLORS.blue,
                text: _("Link cleaned of trackers"),
                tab: 'Clipboard',
            });
        } else if (notice.kind === 'color') {
            // The icon of the notice takes the very colour that was copied.
            let rgb = [1, 3, 5].map(i => parseInt(notice.color.slice(i, i + 2), 16));
            this._collapsed.showNotice({
                key: 'color',
                icon: 'color-select-symbolic',
                color: rgb,
                text: _("%s copied").replace('%s', notice.color),
            });
        } else if (notice.kind === 'screenshot') {
            this._collapsed.showNotice({
                icon: 'camera-photo-symbolic',
                color: COLORS.blue,
                text: notice.name,
                tab: 'Files',
            });
        } else if (notice.kind === 'text') {
            this._collapsed.showNotice({
                key: 'text',
                icon: 'edit-paste-symbolic',
                color: COLORS.green,
                text: _("Text copied (%d characters)").replace('%d', notice.characters),
                tab: 'Clipboard',
            });
        } else if (notice.kind === 'error') {
            this._collapsed.showNotice({
                key: 'error',
                icon: 'dialog-warning-symbolic',
                color: COLORS.rose,
                text: {
                    'ocr-empty': _("No text found in that area"),
                    'ocr-missing': _("Needs tesseract-ocr"),
                    'awake': _("Couldn't keep the screen awake"),
                    'color': _("Couldn't read the color"),
                    'camera': _("Couldn't open the camera"),
                }[notice.reason] || _("Something went wrong"),
            });
        } else if (notice.kind === 'device') {
            let icon = 'bluetooth-active-symbolic';
            if (/audio|head/.test(notice.icon))
                icon = 'audio-headphones-symbolic';
            else if (/gaming/.test(notice.icon))
                icon = 'input-gaming-symbolic';
            else if (/mouse/.test(notice.icon))
                icon = 'input-mouse-symbolic';
            else if (/keyboard/.test(notice.icon))
                icon = 'input-keyboard-symbolic';
            this._collapsed.showNotice({
                icon,
                color: COLORS.green,
                text: _("%s connected").replace('%s', notice.name || _("Device")),
            });
        } else if (notice.kind === 'battery') {
            this._collapsed.showNotice({
                icon: 'battery-caution-symbolic',
                color: COLORS.rose,
                text: _("%s: %d% battery").replace('%s', notice.name || _("Device")).replace('%d', notice.percentage),
            });
        }
    }

    _configureClipboard() {
        this._engine.call('Clipboard', 'SetCleanLinks', new GLib.Variant('(b)', [this.cleanLinks !== false]));
    }

    _configureMusic() {
        this._engine.call('Lyrics', 'SetEnabled', new GLib.Variant('(b)', [this.lyricsEnabled === true]));
        this._engine.call('Music', 'SetVisualizer', new GLib.Variant('(b)', [this.realWaves !== false]));
    }

    _configureNotices() {
        this._collapsed.setEventsEnabled(this.noticeEvents !== false);
        this._engine.call('Notices', 'Configure', new GLib.Variant('(s)', [JSON.stringify({
            downloads: this.noticeDownloads !== false,
            devices: this.noticeDevices !== false,
        })]));
        this._engine.call('Inbox', 'SetEnabled', new GLib.Variant('(b)', [this.noticeNotifications === true]));
    }

    // The open island stretches or shrinks when the tab on display changes
    // height.
    _syncExtraDepth() {
        let entry = this._tabs && this._tabs[this._activeTab];
        let to = entry && entry.tab.extraHeight ? entry.tab.extraHeight : 0;
        if (to === this._extraTarget)
            return;
        this._extraTarget = to;
        // The content of the strip belongs to the tab that asked for the
        // height.
        let extra = to > 0 ? entry.tab.extraActor : null;
        if (extra && extra.get_parent() !== this._extraArea) {
            this._extraArea.remove_all_children();
            this._extraArea.add_child(extra);
        }
        let from = this._expandedExtra;
        this._extraFrom = from;
        if (this._extraTimeline)
            this._extraTimeline.stop();
        let timeline = new Clutter.Timeline({ duration: 380 });
        timeline.connect('new-frame', () => {
            this._expandedExtra = lerp(from, to, easeInOutCubic(timeline.get_progress()));
            this._relayout();
        });
        timeline.connect('completed', () => {
            this._extraTimeline = null;
            this._expandedExtra = to;
            this._relayout();
        });
        this._extraTimeline = timeline;
        timeline.start();
    }

    // The collapsed island gets wider while it shows a text notice.
    _animateCollapsedWidth() {
        let from = this._collapsedExtra;
        let to = this._collapsed.wide ? NOTICE_EXTRA_WIDTH : 0;
        if (this._widthTimeline)
            this._widthTimeline.stop();
        let timeline = new Clutter.Timeline({ duration: 260 });
        timeline.connect('new-frame', () => {
            this._collapsedExtra = lerp(from, to, easeOutCubic(timeline.get_progress()));
            this._relayout();
        });
        timeline.connect('completed', () => {
            this._widthTimeline = null;
            this._collapsedExtra = to;
            this._relayout();
        });
        this._widthTimeline = timeline;
        timeline.start();
    }

    // End of a Pomodoro phase: the island flashes in the colour of the phase
    // that ended and opens by itself on the Pomodoro tab for a few seconds.
    _alert(finishedPhase, color = null) {
        if (!this._tabs.Pomodoro.enabled)
            return;
        this._selectTab('Pomodoro');
        this._flashColor = color || phaseColor(finishedPhase);
        if (this._flashTimeline)
            this._flashTimeline.stop();
        let timeline = new Clutter.Timeline({ duration: ALERT_FLASH_MS });
        timeline.connect('new-frame', () => {
            this._flash = Math.abs(Math.sin(timeline.get_progress() * Math.PI * ALERT_PULSES));
            this._relayout();
        });
        timeline.connect('completed', () => {
            this._flashTimeline = null;
            this._flash = 0;
            this._relayout();
        });
        this._flashTimeline = timeline;
        timeline.start();

        if (!this._expanded) {
            this._setExpanded(true);
            this._closeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ALERT_OPEN_MS, () => {
                this._closeTimeoutId = 0;
                if (!this._isHovered() && !this._pinned && !this._editingCallback)
                    this._setExpanded(false);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // Typing on the island requires grabbing the keyboard (Cinnamon modal).
    // That only happens when the person clicks a text field, and ends with
    // Enter, Esc or a click outside the island.
    _beginEditing(onClickOutside) {
        if (this._editingCallback || !this._grabKeyboard())
            return false;
        this._editingCallback = onClickOutside;
        this._cancelClose();
        return true;
    }

    _endEditing() {
        if (!this._editingCallback)
            return;
        this._editingCallback = null;
        this._releaseKeyboard();
        if (!this._isHovered() && !this._pinned)
            this._onHoverChanged();
    }

    // Glass colour: the base colour, pulled towards the alert colour while
    // flashing.
    _tint() {
        let flash = (this._flash || 0) * 0.55;
        let to = this._flashColor || TINT;
        return TINT.map((v, i) => Math.round(lerp(v, to[i], flash)));
    }

    _tintAlpha() {
        let alpha = Math.max(0, Math.min(100, this.glassOpacity)) / 100;
        return lerp(alpha, Math.max(alpha, 0.85), this._flash || 0);
    }

    // `background-blur` is the property of Cinnamon's St that blurs what is
    // behind the widget while respecting border-radius. The value is the
    // number of blur passes, not a radius in pixels.
    _applyGlass() {
        let r = this._m.radius;
        let radii = {
            top: [0, 0, r, r],
            bottom: [r, r, 0, 0],
            left: [0, r, r, 0],
            right: [r, 0, 0, r],
        }[this.position] || [0, 0, r, r];
        let style = 'background-color: rgba(' + this._tint().join(', ') + ', ' + this._tintAlpha() + ');' +
            ' border-radius: ' + radii.map(v => v + 'px').join(' ') + ';';

        // St builds the corner mask of the blur only once, at the size the
        // widget had at that moment. Removing and re-adding the blur forces
        // the mask to be rebuilt at the new size.
        this._glass.set_style(style);
        if (this.blur)
            this._glass.set_style(style + ' background-blur: ' + BLUR_PASSES + 'px;');
    }

    // Converts a point of the "upright" notch (u along the edge, v into the
    // screen) to actor coordinates on the chosen edge.
    _map(u, v) {
        switch (this.position) {
        case 'bottom':
            return [u, this._m.depth - v];
        case 'left':
            return [v, u];
        case 'right':
            return [this._m.depth - v, u];
        default:
            return [u, v];
        }
    }

    _drawShape(area) {
        let cr = area.get_context();
        let m = this._m;
        let e = m.ear;
        let r = m.radius;
        let total = m.along + 2 * e;
        let d = m.depth;
        // The drawing starts after the orb strip.
        let g = m.gutter;

        let move = (u, v) => cr.moveTo(...this._map(u + g, v));
        let line = (u, v) => cr.lineTo(...this._map(u + g, v));
        let curve = (u1, v1, u2, v2, u3, v3) =>
            cr.curveTo(...this._map(u1 + g, v1), ...this._map(u2 + g, v2), ...this._map(u3 + g, v3));

        // The two small curves joining the body to the edge, in the same
        // colour as the glass.
        let tint = this._tint();
        cr.setSourceRGBA(tint[0] / 255, tint[1] / 255, tint[2] / 255, this._tintAlpha());
        move(0, 0);
        curve(e * KAPPA, 0, e, e * (1 - KAPPA), e, e);
        line(e, 0);
        cr.closePath();
        move(total, 0);
        curve(total - e * KAPPA, 0, total - e, e * (1 - KAPPA), total - e, e);
        line(total - e, 0);
        cr.closePath();
        cr.fill();

        // The outline: leaves the edge, goes down the ear, around the body and
        // back to the edge on the other side. Half a pixel inwards, so the 1px
        // line stays sharp.
        let h = 0.5;
        cr.setSourceRGBA(1, 1, 1, OUTLINE_ALPHA);
        cr.setLineWidth(1);
        move(0, h);
        curve(e * KAPPA, h, e + h, e * (1 - KAPPA), e + h, e);
        line(e + h, d - r);
        curve(e + h, d - r + r * KAPPA, e + r - r * KAPPA, d - h, e + r, d - h);
        line(total - e - r, d - h);
        curve(total - e - r + r * KAPPA, d - h, total - e - h, d - r + r * KAPPA, total - e - h, d - r);
        line(total - e - h, e);
        curve(total - e - h, e * (1 - KAPPA), total - e * KAPPA, h, total, h);
        cr.stroke();

        cr.$dispose();
    }

    _updateHotkey() {
        Main.keybindingManager.removeHotKey(HOTKEY_NAME);
        Main.keybindingManager.addHotKey(HOTKEY_NAME, this.hotkey, () => this._toggle());
        for (let [name, key, method] of SOUND_HOTKEYS) {
            Main.keybindingManager.removeHotKey(name);
            Main.keybindingManager.addHotKey(name, this[key.replace(/-/g, '_')],
                () => this._engine.call('Volume', method));
        }
    }

    _makeCornerButton(iconName, align, action) {
        let button = new St.Button({
            style_class: 'island-button-corner',
            child: new St.Icon({ icon_name: iconName, icon_size: 16 }),
            x_expand: true,
        });
        button.set_x_align(align);
        button.set_y_align(Clutter.ActorAlign.CENTER);
        button.connect('clicked', action);
        return button;
    }

    // The pin: with it on, the island does not close when the mouse leaves (to
    // follow the lyrics of a song, for instance). It does not grab the
    // keyboard.
    _togglePin() {
        this._pinned = !this._pinned;
        this._syncPin();
        if (!this._pinned)
            this._onHoverChanged();
    }

    // The pin stays green while the island is pinned, by the button or by the
    // shortcut.
    _syncPin() {
        if (this._pinned)
            this._pinButton.add_style_pseudo_class('checked');
        else
            this._pinButton.remove_style_pseudo_class('checked');
    }

    _openSettings() {
        this._pinned = false;
        this._setExpanded(false);
        Util.spawn(['xlet-settings', 'extension', UUID]);
    }

    // The shortcut pins the notch open: it only collapses with the shortcut
    // again.
    _toggle() {
        if (this._editingCallback)
            this._editingCallback();
        this._pinned = !this._expanded;
        this._syncPin();
        this._setExpanded(this._pinned);
        // Opened by the shortcut, the island starts obeying the keyboard:
        // arrows switch tabs, numbers go straight to a tab and Esc closes.
        if (this._pinned && !this._keyboardMode && this._grabKeyboard())
            this._keyboardMode = true;
    }

    // The island grabs the keyboard (Cinnamon modal) in two cases: while the
    // person types in a field and while it is open by the shortcut. Both can
    // happen together, so requests are counted and the modal is only released
    // when the last one ends.
    _grabKeyboard() {
        if (this._modalRefs > 0) {
            this._modalRefs++;
            return true;
        }
        if (!Main.pushModal(this.actor))
            return false;
        this._modalRefs = 1;
        this._capturedId = global.stage.connect('captured-event', (stage, event) => this._onCaptured(event));
        return true;
    }

    _releaseKeyboard() {
        if (!this._modalRefs)
            return;
        this._modalRefs--;
        if (this._modalRefs > 0)
            return;
        global.stage.disconnect(this._capturedId);
        this._capturedId = 0;
        Main.popModal(this.actor);
        global.stage.set_key_focus(null);
    }

    // The camera mirror is an engine window; the island only says where it
    // should open: centred, right below the open island.
    _toggleCamera() {
        let monitor = Main.layoutManager.primaryMonitor;
        let full = this._metrics(1, 1);
        let centerX = monitor.x + Math.round(monitor.width / 2);
        let top = monitor.y + (this.position === 'top' ? full.depth + CAMERA_GAP : CAMERA_GAP * 3);
        this._engine.call('Tools', 'ToggleCamera', new GLib.Variant('(ii)', [centerX, top]));
    }

    // Closes the island, waits for it to disappear and only then runs
    // `action`. Used for screenshots, where the open island would be in the
    // picture.
    _runHidden(action) {
        this._pinned = false;
        this._setExpanded(false);
        if (this._hiddenRunId)
            GLib.source_remove(this._hiddenRunId);
        this._hiddenRunId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COLLAPSE_MS + 220, () => {
            this._hiddenRunId = 0;
            action();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Colour picker: the island closes, the pointer becomes a crosshair and
    // the next click anywhere on screen copies the colour from there. Esc
    // cancels.
    _startColorPick() {
        if (this._picking)
            return;
        this._pinned = false;
        this._setExpanded(false);
        if (!this._grabKeyboard())
            return;
        this._picking = true;
        global.set_cursor(Cinnamon.Cursor.CROSSHAIR);
    }

    _endColorPick() {
        if (!this._picking)
            return;
        this._picking = false;
        global.unset_cursor();
        this._releaseKeyboard();
    }

    _onCaptured(event) {
        let type = event.type();
        if (this._picking) {
            if (type === Clutter.EventType.BUTTON_PRESS) {
                let [x, y] = global.get_pointer();
                this._endColorPick();
                this._engine.call('Tools', 'PickColor', new GLib.Variant('(ii)', [x, y]));
                return Clutter.EVENT_STOP;
            }
            if (type === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
                this._endColorPick();
                return Clutter.EVENT_STOP;
            }
            // The rest (mouse movement, button release) goes on as usual.
            return type === Clutter.EventType.BUTTON_RELEASE ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        }
        if (type === Clutter.EventType.BUTTON_PRESS && !this.actor.contains(event.get_source())) {
            // Click outside the island: ends the typing and, if the island was
            // open by the shortcut, closes it.
            if (this._editingCallback)
                this._editingCallback();
            if (this._keyboardMode) {
                this._pinned = false;
                this._setExpanded(false);
            }
            return Clutter.EVENT_PROPAGATE;
        }
        if (type !== Clutter.EventType.KEY_PRESS || this._editingCallback || !this._keyboardMode)
            return Clutter.EVENT_PROPAGATE;

        let key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape) {
            this._pinned = false;
            this._setExpanded(false);
        } else if (key === Clutter.KEY_Down || key === Clutter.KEY_Right || key === Clutter.KEY_Tab) {
            this._stepTab(1);
        } else if (key === Clutter.KEY_Up || key === Clutter.KEY_Left || key === Clutter.KEY_ISO_Left_Tab) {
            this._stepTab(-1);
        } else if (key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
            let clipboard = this._engine.state.Clipboard;
            if (this._activeTab === 'Clipboard' && clipboard) {
                // On the Clipboard tab, the number copies the item at that
                // position and closes the island: just paste next.
                let item = clipboard.items[key - Clutter.KEY_1];
                if (item) {
                    this._engine.call('Clipboard', 'Copy', new GLib.Variant('(u)', [item.id]));
                    this._pinned = false;
                    this._setExpanded(false);
                }
            } else {
                let name = this._tabNames[key - Clutter.KEY_1];
                if (name)
                    this._selectTab(name);
            }
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        return Clutter.EVENT_STOP;
    }

    // In hidden mode, the closed island disappears and only comes back with
    // the mouse over it or when there is a notice to show.
    _syncHidden() {
        if (!this._collapsed)
            return;
        let hidden = this.hideClosed === true && !this._expanded && this._progress === 0 &&
            !this._isHovered() && !this._collapsed.busy;
        if (hidden === this._hiddenNow)
            return;
        this._hiddenNow = hidden;
        this.actor.ease({
            opacity: hidden ? 0 : 255,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._queueShelfSync();
    }

    // Opens the island at the request of the mouse (hover or click). Opening
    // during a notice goes straight to its subject.
    _openFromPointer() {
        this._cancelOpen();
        if (!this._expanded) {
            let notice = this._collapsed.takeNotice();
            if (notice && notice.tab) {
                if (notice.onOpen)
                    notice.onOpen();
                this._selectTab(notice.tab);
            }
        }
        this._setExpanded(true);
    }

    _cancelOpen() {
        if (this._openTimeoutId) {
            GLib.source_remove(this._openTimeoutId);
            this._openTimeoutId = 0;
        }
    }

    // Click on the closed island. In "open on click" mode, the wave bars side
    // is the play/pause button and the rest opens the island; in hover mode,
    // the click only brings the opening forward.
    _onClicked(event) {
        if (this._expanded || this._picking)
            return Clutter.EVENT_PROPAGATE;
        if (this.openMode === 'click' && this._collapsed.hasMusic && !this._collapsed.busy) {
            let [x] = event.get_coords();
            let [left] = this.actor.get_transformed_position();
            if (x - left > this.actor.width * 0.62) {
                this._engine.call('Music', 'PlayPause');
                return Clutter.EVENT_STOP;
            }
        }
        this._openFromPointer();
        return Clutter.EVENT_STOP;
    }

    _onHoverChanged() {
        if (this._picking)
            return;
        this._cancelClose();
        this._syncHidden();
        let hovered = this._isHovered();
        this._collapsed.setHoverControls(hovered && this.openMode === 'click' && !this._expanded);
        if (hovered) {
            // In "open on click" mode, the mouse alone does not open it (but a
            // file dragged over it does, otherwise there would be nowhere to
            // drop).
            if (this._expanded || this._dragOver) {
                this._openFromPointer();
            } else if (this.openMode !== 'click') {
                let delay = Math.max(0, this.openDelay || 0);
                if (delay === 0) {
                    this._openFromPointer();
                } else if (!this._openTimeoutId) {
                    this._openTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        this._openTimeoutId = 0;
                        if (this._isHovered())
                            this._openFromPointer();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        } else if (!this._expanded) {
            this._cancelOpen();
        } else if (!this._pinned && !this._editingCallback) {
            this._closeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(50, this.closeDelay), () => {
                // While the island changes size, Cinnamon sometimes reports
                // that the mouse "left" without it having moved. If the
                // pointer is still over the island, it does not close: it
                // checks again shortly, until the mouse really leaves.
                if (this._pointerInside())
                    return GLib.SOURCE_CONTINUE;
                this._closeTimeoutId = 0;
                this._setExpanded(false);
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _pointerInside() {
        let [x, y] = global.get_pointer();
        // Clutter returns the position with a rounding error (the top comes as
        // 0.0001 instead of 0); without rounding, a mouse against the screen
        // edge would count as outside the island.
        let [left, top] = this.actor.get_transformed_position().map(Math.round);
        let [width, height] = this.actor.get_transformed_size().map(Math.round);
        return x >= left && x < left + width && y >= top && y < top + height;
    }

    _cancelClose() {
        if (this._closeTimeoutId) {
            GLib.source_remove(this._closeTimeoutId);
            this._closeTimeoutId = 0;
        }
    }

    _stopTimeline() {
        if (this._timeline) {
            this._timeline.stop();
            this._timeline = null;
        }
    }

    // The animation is driven by hand (instead of actor.ease) because size,
    // radii, blur and outline have to change together on every frame.
    _setExpanded(expanded) {
        this._cancelClose();
        if (this._expanded === expanded)
            return;
        this._expanded = expanded;
        if (!expanded) {
            this._pinned = false;
            this._syncPin();
            if (this._keyboardMode) {
                this._keyboardMode = false;
                this._releaseKeyboard();
            }
        }
        this._collapsed.setActive(!expanded);
        this._collapsed.setHoverControls(false);
        this._syncHidden();

        this._stopTimeline();
        let from = [this._progress, this._alongProgress, this._depthProgress];
        let to = expanded ? 1 : 0;
        let timeline = new Clutter.Timeline({ duration: expanded ? EXPAND_MS : COLLAPSE_MS });
        timeline.connect('new-frame', () => {
            let t = timeline.get_progress();
            let along, depth;
            if (expanded) {
                // Opening: the width goes ahead and the height "flows" behind,
                // both with a slight bounce at the end.
                along = spring(Math.min(1, t * 1.25));
                depth = spring(t);
            } else {
                // Closing: the height collapses first and the width follows.
                depth = easeOutCubic(Math.min(1, t * 1.2));
                along = easeInOutCubic(t);
            }
            this._progress = lerp(from[0], to, easeOutCubic(t));
            this._alongProgress = lerp(from[1], to, along);
            this._depthProgress = lerp(from[2], to, depth);
            this._relayout();
        });
        timeline.connect('completed', () => {
            this._timeline = null;
            this._progress = this._alongProgress = this._depthProgress = to;
            this._relayout();
            this._syncHidden();
        });
        this._timeline = timeline;
        timeline.start();
    }

    destroy() {
        this._cancelClose();
        this._stopTimeline();
        Main.keybindingManager.removeHotKey(HOTKEY_NAME);
        for (let [name] of SOUND_HOTKEYS)
            Main.keybindingManager.removeHotKey(name);
        Main.layoutManager.disconnect(this._monitorsId);
        if (this._editingCallback)
            this._editingCallback();
        if (this._flashTimeline)
            this._flashTimeline.stop();
        if (this._widthTimeline)
            this._widthTimeline.stop();
        if (this._extraTimeline)
            this._extraTimeline.stop();
        this._engine.disconnect(this._engineId);
        this._engine.disconnect(this._levelsId);
        this._engine.disconnect(this._shelfScrollId);
        this._engine.disconnect(this._connectedId);
        this._engine.destroy();
        this._collapsed.destroy();
        this.actor.disconnect(this._hoverId);
        this.actor.disconnect(this._scrollId);
        this.actor.disconnect(this._clickId);
        this._cancelOpen();
        this._endColorPick();
        while (this._modalRefs > 0)
            this._releaseKeyboard();
        this.actor.disconnect(this._redrawId);
        this.settings.finalize();
        DND.removeDragMonitor(this._dragMonitor);
        for (let id of [this._shelfSyncId, this._dragOverId, this._dragWatchId, this._refreshId, this._hiddenRunId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._engine.call('Files', 'SetShelf', new GLib.Variant('(iiiib)', [0, 0, 0, 0, false]));
        this._tabs.Notes.tab.destroy();
        this._tabs.Weather.tab.destroy();
        this._tabs.Music.tab.destroy();
        this._tabs.Clipboard.tab.destroy();
        this._tabs.Inbox.tab.destroy();
        for (let piece of this._inputPieces)
            Main.layoutManager.untrackChrome(piece);
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }
}

let island = null;
let extensionDir = null;

function init(metadata) {
    extensionDir = metadata.path;
    bindTranslations(extensionDir);
}

function enable() {
    island = new Island(extensionDir);
}

// Rebuilds the whole island; used when the language changes, since texts are
// set when each tab is created.
function rebuild() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        if (island) {
            disable();
            enable();
        }
        return GLib.SOURCE_REMOVE;
    });
}

function disable() {
    if (island) {
        island.destroy();
        island = null;
    }
}
