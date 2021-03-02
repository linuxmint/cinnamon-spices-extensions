/*****************************************************************

             This extension has been developped by
            vibou and forked to cinnamon by shuairan

           With the help of the gnome-shell community

******************************************************************/

/*****************************************************************
                         CONST & VARS
*****************************************************************/
const GObject = imports.gi.GObject;
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Signals = imports.signals;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Tooltips = imports.ui.tooltips;
const Settings = imports.ui.settings;
const Panel = imports.ui.panel;

const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const UUID = 'gTile@shuairan';
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

function _(str) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if(customTranslation != str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}

const SETTINGS_AUTO_CLOSE = 'autoclose';
const SETTINGS_ANIMATION = 'animation';

const TOOLTIPS = [];
TOOLTIPS[SETTINGS_AUTO_CLOSE] = _("Auto close");
TOOLTIPS[SETTINGS_ANIMATION] = _("Animations");
TOOLTIPS['action-main-list'] = _("Auto tile main and list");
TOOLTIPS['action-two-list'] = _("Auto tile two lists");

const KEYCONTROL = [];
KEYCONTROL['gTile-k-left'] = 'Left';
KEYCONTROL['gTile-k-right'] = 'Right';
KEYCONTROL['gTile-k-up'] = 'Up';
KEYCONTROL['gTile-k-down'] = 'Down';
let metaKey = '<Shift>';
for (let type in KEYCONTROL) {
  let key = KEYCONTROL[type];
  KEYCONTROL[type + '-meta'] = metaKey + key;
}

let status;
let grids;
let monitors;
let area;
let focusMetaWindow = false;
let focusMetaWindowConnections = [];
let focusMetaWindowPrivateConnections = [];
let tracker;
let gridSettingsButton = [];
let toggleSettingListener;
let preferences = {};
let settings;

const isFinalized = function(obj) {
  return obj && GObject.Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
}

/*****************************************************************
                            SETTINGS
*****************************************************************/
/*INIT SETTINGS HERE TO ADD OR REMOVE SETTINGS BUTTON*/
/*new GridSettingsButton(LABEL, NBCOL, NBROW) */
function initSettings() {
  settings = new Settings.ExtensionSettings(preferences, 'gTile@shuairan');
  //hotkey
  settings.bindProperty(Settings.BindingDirection.IN, 'hotkey', 'hotkey', enableHotkey, null);
  //grid (nbCols and nbRows)
  settings.bindProperty(Settings.BindingDirection.OUT, 'lastGridRows', 'nbCols');
  settings.bindProperty(Settings.BindingDirection.OUT, 'lastGridCols', 'nbRows');

  settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'animation', 'animation', updateSettings, null);
  settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'autoclose', 'autoclose', updateSettings, null);

  let basestr = 'gridbutton';

  initGridSettings();

  for (let i = 1; i <= 4; i++) {
    let sgbx = basestr + i + 'x';
    let sgby = basestr + i + 'y';
    settings.bindProperty(Settings.BindingDirection.IN, sgbx, sgbx, updateGridSettings, null);
    settings.bindProperty(Settings.BindingDirection.IN, sgby, sgby, updateGridSettings, null);
  }
}

function updateSettings() {
  toggleSettingListener._updateToggle();
}

function initGridSettings() {
  let basestr = 'gridbutton';
  for (let i = 1; i <= 4; i++) {
    let sgbx = basestr + i + 'x';
    let sgby = basestr + i + 'y';
    let gbx = settings.getValue(sgbx);
    let gby = settings.getValue(sgby);
    gridSettingsButton.push(new GridSettingsButton(gbx + 'x' + gby, gbx, gby));
  }
}

function updateGridSettings() {
  gridSettingsButton = [];
  initGridSettings();
  for (var gridIdx in grids) {
    let grid = grids[gridIdx];
    grid._initGridSettingsButtons();
  }
}

/*****************************************************************
                            FUNCTIONS
*****************************************************************/
function init() {}

function enable() {
  status = false;
  monitors = Main.layoutManager.monitors;
  tracker = Cinnamon.WindowTracker.get_default();

  area = new St.BoxLayout({style_class: 'grid-preview'});
  Main.uiGroup.add_actor(area);

  initSettings();
  initGrids();

  enableHotkey();

  tracker.connect(
    'notify::focus-app',
    _onFocus
  );
  global.screen.connect(
    'monitors-changed',
    reinitalize
  );
  //global.log("KEY BINDNGS");
}

function disable() {
  // Key Bindings
  disableHotkey();

  destroyGrids();
  resetFocusMetaWindow();
}

function enableHotkey() {
  disableHotkey();
  Main.keybindingManager.addHotKey('gTile', preferences.hotkey, toggleTiling);
}

function disableHotkey() {
  Main.keybindingManager.removeHotKey('gTile');
}

function reinitalize() {
  monitors = Main.layoutManager.monitors;
  destroyGrids();
  initGrids();
}

function resetFocusMetaWindow() {
  if (focusMetaWindowConnections.length > 0) {
    for (var idx in focusMetaWindowConnections) {
      focusMetaWindow.disconnect(focusMetaWindowConnections[idx]);
    }
  }

  if (focusMetaWindowPrivateConnections.length > 0) {
    let actor = focusMetaWindow.get_compositor_private();
    if (actor) {
      for (let idx in focusMetaWindowPrivateConnections) {
        actor.disconnect(focusMetaWindowPrivateConnections[idx]);
      }
    }
  }

  focusMetaWindow = false;
  focusMetaWindowConnections = [];
  focusMetaWindowPrivateConnections = [];
}

function initGrids() {
  grids = {};
  for (let monitorIdx in monitors) {
    let monitor = monitors[monitorIdx];
    let grid = new Grid(parseInt(monitorIdx), monitor, 'gTile', preferences.nbCols, preferences.nbRows);
    let key = getMonitorKey(monitor);
    grids[key] = grid;

    Main.layoutManager.addChrome(grid.actor, {visibleInFullscreen: true});
    grid.actor.set_opacity(0);
    grid.hide(true);
    grid.connect(
      'hide-tiling',
      hideTiling
    );
  }
}

function destroyGrids() {
  for (let monitorIdx in monitors) {
    let monitor = monitors[monitorIdx];
    let key = getMonitorKey(monitor);
    let grid = grids[key];
    if (typeof grid != 'undefined') {
      grid.hide(true);
      Main.layoutManager.removeChrome(grid.actor);
    }
  }
}

function refreshGrids() {
  //global.log("RefreshGrids");
  for (let gridIdx in grids) {
    let grid = grids[gridIdx];
    grid.refresh();
  }

  Main.layoutManager._chrome.updateRegions();
}

function moveGrids() {
  if (!status) {
    return;
  }

  let window = focusMetaWindow;
  if (!window) return;
  for (let gridIdx in grids) {
    let grid = grids[gridIdx];
    let pos_x;
    let pos_y;

    let monitor = grid.monitor;
    let isGridMonitor = window.get_monitor() === grid.monitor_idx;
    if (isGridMonitor) {
      pos_x = window.get_outer_rect().width / 2 + window.get_outer_rect().x;
      pos_y = window.get_outer_rect().height / 2 + window.get_outer_rect().y;
    } else {
      pos_x = monitor.x + monitor.width / 2;
      pos_y = monitor.y + monitor.height / 2;
    }

    pos_x = Math.floor(pos_x - grid.actor.width / 2);
    pos_y = Math.floor(pos_y - grid.actor.height / 2);

    if (isGridMonitor) {
      pos_x = pos_x < monitor.x ? monitor.x : pos_x;
      pos_x = pos_x + grid.actor.width > monitor.width + monitor.x ? monitor.x + monitor.width - grid.actor.width : pos_x;
      pos_y = pos_y < monitor.y ? monitor.y : pos_y;
      pos_y = pos_y + grid.actor.height > monitor.height + monitor.y ? monitor.y + monitor.height - grid.actor.height : pos_y;
    }

    let time = preferences.animation ? 0.3 : 0.1;

    Tweener.addTween(grid.actor, {
      time: time,
      x: pos_x,
      y: pos_y,
      transition: 'easeOutQuad',
      onComplete: updateRegions
    });
  }
}

function updateRegions() {
  Main.layoutManager._chrome.updateRegions();
  refreshGrids();
  for (let idx in grids) {
    let grid = grids[idx];
    grid.elementsDelegate.reset();
  }
}

function reset_window(metaWindow) {
  metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
  metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
  metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
  metaWindow.tile(Meta.WindowTileType.NONE, false);
}

function _getInvisibleBorderPadding(metaWindow) {
  let outerRect = metaWindow.get_outer_rect();
  let inputRect = metaWindow.get_input_rect();
  let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];

  return [borderX, borderY];
}

function _getVisibleBorderPadding(metaWindow) {
  let clientRect = metaWindow.get_rect();
  let outerRect = metaWindow.get_outer_rect();

  let borderX = outerRect.width - clientRect.width;
  let borderY = outerRect.height - clientRect.height;

  return [borderX, borderY];
}

function move_maximize_window(metaWindow, x, y) {
  let [borderX, borderY] = _getInvisibleBorderPadding(metaWindow);

  x = x - borderX;
  y = y - borderY;

  metaWindow.move_frame(true, x, y);
  metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
}

function move_resize_window(metaWindow, x, y, width, height) {
  let [vBorderX, vBorderY] = _getVisibleBorderPadding(metaWindow);

  width = width - vBorderX;
  height = height - vBorderY;

  metaWindow.resize(true, width, height);
  metaWindow.move_frame(true, x, y);
}

function getPanelHeight(panel) {
  return panel.height
      || panel.actor.get_height();  // fallback for old versions of Cinnamon
}

function getUsableScreenArea(monitor) {
  let top = monitor.y;
  let bottom = monitor.y + monitor.height;
  let left = monitor.x;
  let right = monitor.x + monitor.width;

  for (let panel of Main.panelManager.getPanelsInMonitor(monitor.index)) {
    if (!panel.isHideable()) {
      switch (panel.panelPosition) {
        case Panel.PanelLoc.top:
          top += getPanelHeight(panel);
          break;
        case Panel.PanelLoc.bottom:
          bottom -= getPanelHeight(panel);
          break;
        case Panel.PanelLoc.left:
          left += getPanelHeight(panel); // even vertical panels use 'height'
          break;
        case Panel.PanelLoc.right:
          right -= getPanelHeight(panel);
          break;
      }
    }
  }

  let width = right > left ? right - left : 0;
  let height = bottom > top ? bottom - top : 0;
  return [left, top, width, height];
}

function getNotFocusedWindowsOfMonitor(monitor) {
  return Main.getTabList().filter(function(w) {
    let app = tracker.get_window_app(w);
    let w_monitor = Main.layoutManager.monitors[w.get_monitor()];

    if (app == null) {
      return false;
    }
    if (w.minimized) {
      return false;
    }
    if (w_monitor !== monitor) {
      return false;
    }

    return focusMetaWindow !== w && w.get_wm_class() != null;
  });
}

function _onFocus() {
  let window = getFocusApp();
  if (!window) {
    resetFocusMetaWindow();
    for (let gridIdx in grids) {
      let grid = grids[gridIdx];
      grid.topbar._set_title('gTile');
    }
    return;
  }

  resetFocusMetaWindow();

  focusMetaWindow = window;

  let actor = focusMetaWindow.get_compositor_private();
  if (actor) {
    focusMetaWindowPrivateConnections.push(
      actor.connect(
        'size-changed',
        moveGrids
      )
    );
    focusMetaWindowPrivateConnections.push(
      actor.connect(
        'position-changed',
        moveGrids
      )
    );
  }

  let app = tracker.get_window_app(focusMetaWindow);
  let title = focusMetaWindow.get_title();

  for (let monitorIdx in monitors) {
    let monitor = monitors[monitorIdx];
    let key = getMonitorKey(monitor);
    let grid = grids[key];
    if (app) grid.topbar._set_app(app, title);
    else grid.topbar._set_title(title);
  }
  moveGrids();
}

function showTiling() {
  focusMetaWindow = getFocusApp();
  let wm_type = focusMetaWindow.get_window_type();
  let layer = focusMetaWindow.get_layer();

  area.visible = true;
  if (focusMetaWindow && wm_type !== 1 && layer > 0) {
    for (let monitorIdx in monitors) {
      let monitor = monitors[monitorIdx];
      let key = getMonitorKey(monitor);
      let grid = grids[key];

      let window = getFocusApp();
      let pos_x;
      let pos_y;
      if (window.get_monitor() === parseInt(monitorIdx)) {
        pos_x = window.get_outer_rect().width / 2 + window.get_outer_rect().x;
        pos_y = window.get_outer_rect().height / 2 + window.get_outer_rect().y;
      } else {
        pos_x = monitor.x + monitor.width / 2;
        pos_y = monitor.y + monitor.height / 2;
      }

      grid.set_position(Math.floor(pos_x - grid.actor.width / 2), Math.floor(pos_y - grid.actor.height / 2));

      grid.show();
    }

    _onFocus();
    status = true;
  }

  moveGrids();
}

function hideTiling() {
  for (let gridIdx in grids) {
    let grid = grids[gridIdx];
    grid.elementsDelegate.reset();
    grid.hide(false);
  }

  area.visible = false;

  resetFocusMetaWindow();

  status = false;

  Main.layoutManager._chrome.updateRegions();
}

function toggleTiling() {
  if (status) {
    hideTiling();
  } else {
    showTiling();
  }
  return status;
}

function getMonitorKey(monitor) {
  return monitor.x + ':' + monitor.width + ':' + monitor.y + ':' + monitor.height;
}

function getFocusApp() {
  return global.display.focus_window;
}

function isPrimaryMonitor(monitor) {
  return Main.layoutManager.primaryMonitor === monitor;
}

/*****************************************************************
                            PROTOTYPES
*****************************************************************/

function TopBar(title) {
  this._init(title);
}

TopBar.prototype = {
  _init: function(title) {
    this.actor = new St.BoxLayout({style_class: 'top-box'});
    this._title = title;
    this._stlabel = new St.Label({style_class: 'grid-title', text: this._title});
    this._iconBin = new St.Bin({x_fill: false, y_fill: true});
    this._closeButton = new St.Button({style_class: 'close-button'});

    this._closeButton.connect(
      'button-release-event',
      Lang.bind(this, this._onCloseButtonClicked)
    );

    this.actor.add(this._iconBin);
    this.actor.add(this._stlabel, {x_fill: true, expand: true});
    this.actor.add(this._closeButton, {x_fill: false, expand: false});
  },

  _set_title: function(title) {
    this._title = title;
    this._stlabel.text = this._title;
  },

  _set_app: function(app, title) {
    this._title = app.get_name() + ' - ' + title;
    this._stlabel.text = this._title;
    this._icon = app.create_icon_texture(24);

    this._iconBin.set_size(24, 24);
    this._iconBin.child = this._icon;
  },

  _onCloseButtonClicked: function() {
    toggleTiling();
  }
};

function ToggleSettingsButtonListener() {
  this._init();
}

ToggleSettingsButtonListener.prototype = {
  _init: function() {
    this.actors = [];
  },

  addActor: function(actor) {
    actor.connect(
      'update-toggle',
      Lang.bind(this, this._updateToggle)
    );
    this.actors.push(actor);
  },

  _updateToggle: function() {
    for (let actorIdx in this.actors) {
      let actor = this.actors[actorIdx];
      actor._update();
    }
  }
};

function ToggleSettingsButton(text, property) {
  this._init(text, property);
}

ToggleSettingsButton.prototype = {
  _init: function(text, property) {
    this.text = text;
    this.actor = new St.Button({
      style_class: 'settings-button',
      reactive: true,
      can_focus: true,
      track_hover: true,
      label: this.text
    });
    this.icon = new St.BoxLayout({style_class: this.text + '-icon', reactive: true, can_focus: true, track_hover: true});
    this.actor.set_child(this.icon);
    this.property = property;
    this._update();
    this.actor.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );
    this.connect(
      'update-toggle',
      Lang.bind(this, this._update)
    );

    if (TOOLTIPS[property]) {
      this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[property]);
    }
  },

  _update: function() {
    if (preferences[this.property]) {
      this.actor.add_style_pseudo_class('activate');
    } else {
      this.actor.remove_style_pseudo_class('activate');
    }
  },

  _onButtonPress: function() {
    preferences[this.property] = !preferences[this.property];
    this.emit('update-toggle');
  }
};

Signals.addSignalMethods(ToggleSettingsButton.prototype);

function ActionButton(grid, classname) {
  this._init(grid, classname);
}

ActionButton.prototype = {
  _init: function(grid, classname) {
    this.grid = grid;
    this.actor = new St.Button({
      style_class: 'settings-button',
      reactive: true,
      can_focus: true,
      track_hover: true
    });

    this.icon = new St.BoxLayout({style_class: classname, reactive: true, can_focus: true, track_hover: true});
    this.actor.add_actor(this.icon);
    this.actor.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );

    if (TOOLTIPS[classname]) {
      this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[classname]);
    }
  },

  _onButtonPress: function() {
    this.emit('button-press-event');
  }
};

Signals.addSignalMethods(ActionButton.prototype);

function AutoTileMainAndList(grid) {
  this._init(grid, 'action-main-list');
}

AutoTileMainAndList.prototype = {
  __proto__: ActionButton.prototype,

  _init: function(grid, classname) {
    ActionButton.prototype._init.call(this, grid, classname);
    this.classname = classname;
    this.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );
  },

  _onButtonPress: function() {
    if (!focusMetaWindow) return;

    reset_window(focusMetaWindow);

    let monitor = this.grid.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = getNotFocusedWindowsOfMonitor(monitor);

    move_resize_window(focusMetaWindow, screenX, screenY, screenWidth / 2, screenHeight);

    let winHeight = screenHeight / windows.length;
    let countWin = 0;

    for (let windowIdx in windows) {
      let metaWindow = windows[windowIdx];

      let newOffset = countWin * winHeight;

      reset_window(metaWindow);

      move_resize_window(metaWindow, screenX + screenWidth / 2, screenY + newOffset, screenWidth / 2, winHeight);
      countWin++;
    }

    this.emit('resize-done');
  }
};

Signals.addSignalMethods(AutoTileMainAndList.prototype);

function AutoTileTwoList(grid) {
  this._init(grid, 'action-two-list');
}

AutoTileTwoList.prototype = {
  __proto__: ActionButton.prototype,

  _init: function(grid, classname) {
    ActionButton.prototype._init.call(this, grid, classname);
    this.classname = classname;
    this.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );
  },

  _onButtonPress: function() {
    if (!focusMetaWindow) return;

    reset_window(focusMetaWindow);

    let monitor = this.grid.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = getNotFocusedWindowsOfMonitor(monitor);
    let nbWindowOnEachSide = Math.ceil((windows.length + 1) / 2);
    let winHeight = screenHeight / nbWindowOnEachSide;

    let countWin = 0;

    let xOffset = ((countWin % 2) * screenWidth) / 2;
    let yOffset = Math.floor(countWin / 2) * winHeight;

    move_resize_window(focusMetaWindow, screenX + xOffset, screenY + yOffset, screenWidth / 2, winHeight);

    countWin++;

    for (let windowIdx in windows) {
      let metaWindow = windows[windowIdx];

      xOffset = ((countWin % 2) * screenWidth) / 2;
      yOffset = Math.floor(countWin / 2) * winHeight;

      reset_window(metaWindow);

      move_resize_window(metaWindow, screenX + xOffset, screenY + yOffset, screenWidth / 2, winHeight);
      countWin++;
    }

    this.emit('resize-done');
  }
};

Signals.addSignalMethods(AutoTileTwoList.prototype);

function ActionScale(grid) {
  this._init(grid, 'action-scale');
}

ActionScale.prototype = {
  __proto__: ActionButton.prototype,

  _init: function(grid, classname) {
    ActionButton.prototype._init.call(this, grid, classname);
    this.classname = classname;
    this.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );
  },

  _onButtonPress: function() {}
};

function GridSettingsButton(text, cols, rows) {
  this._init(text, cols, rows);
}

GridSettingsButton.prototype = {
  _init: function(text, cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.text = text;

    this.actor = new St.Button({
      style_class: 'settings-button',
      reactive: true,
      can_focus: true,
      track_hover: true
    });

    this.label = new St.Label({
      style_class: 'settings-label',
      reactive: true, can_focus: true,
      track_hover: true,
      text: this.text
    });

    this.actor.add_actor(this.label);

    this.actor.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );
  },

  _onButtonPress: function() {
    preferences.nbCols = this.cols;
    preferences.nbRows = this.rows;
    refreshGrids();
  }
};

function Grid(monitor_idx, screen, title, cols, rows) {
  this._init(monitor_idx, screen, title, cols, rows);
}

Grid.prototype = {
  _init: function(monitor_idx, monitor, title, cols, rows) {
    this.tableWidth = 220;
    this.tableHeight = 200;
    this.borderwidth = 2;
    this.bindFns = {};
    this.rowKey = -1;
    this.colKey = -1;

    this.actor = new St.BoxLayout({
      vertical: true,
      style_class: 'grid-panel',
      reactive: true,
      can_focus: true,
      track_hover: true
    });

    this.actor.connect(
      'enter-event',
      Lang.bind(this, this._onMouseEnter)
    );
    this.actor.connect(
      'leave-event',
      Lang.bind(this, this._onMouseLeave)
    );

    this.topbar = new TopBar(title);

    this.bottombar = new St.Table({
      homogeneous: true,
      style_class: 'bottom-box',
      can_focus: true,
      track_hover: true,
      reactive: true,
      width: this.tableWidth
    });

    this.veryBottomBar = new St.Table({
      homogeneous: true,
      style_class: 'bottom-box',
      can_focus: true,
      track_hover: true,
      reactive: true,
      width: this.tableWidth
    });

    this._initGridSettingsButtons();

    this.table = new St.Table({
      homogeneous: true,
      style_class: 'table',
      can_focus: true,
      track_hover: true,
      reactive: true,
      width: this.tableWidth,
      height: this.tableHeight
    });

    this.actor.add(this.topbar.actor, {x_fill: true});
    this.actor.add(this.table, {x_fill: false});
    this.actor.add(this.bottombar, {x_fill: true});
    this.actor.add(this.veryBottomBar, {x_fill: true});

    this.monitor = monitor;
    this.monitor_idx = monitor_idx;
    this.rows = rows;
    this.title = title;
    this.cols = cols;

    this.isEntered = false;

    if (true) {
      let nbTotalSettings = 4;

      if (!toggleSettingListener) {
        toggleSettingListener = new ToggleSettingsButtonListener();
      }

      let toggle = new ToggleSettingsButton('animation', SETTINGS_ANIMATION);
      toggle.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(toggle.actor, {row: 0, col: 0, x_fill: false, y_fill: false});
      toggleSettingListener.addActor(toggle);

      toggle = new ToggleSettingsButton('auto-close', SETTINGS_AUTO_CLOSE);
      toggle.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(toggle.actor, {row: 0, col: 1, x_fill: false, y_fill: false});
      toggleSettingListener.addActor(toggle);

      let action = new AutoTileMainAndList(this);
      action.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(action.actor, {row: 0, col: 2, x_fill: false, y_fill: false});

      action.connect(
        'resize-done',
        Lang.bind(this, this._onResize)
      );

      action = new AutoTileTwoList(this);
      action.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(action.actor, {row: 0, col: 3, x_fill: false, y_fill: false});

      action.connect(
        'resize-done',
        Lang.bind(this, this._onResize)
      );
    }

    this.x = 0;
    this.y = 0;

    this.interceptHide = false;

    this._displayElements();

    this.normalScaleY = this.actor.scale_y;
    this.normalScaleX = this.actor.scale_x;
  },

  _initGridSettingsButtons: function() {
    this.bottombar.destroy_children();

    let rowNum = 0;
    let colNum = 0;

    for (var index = 0; index < gridSettingsButton.length; index++) {
      if (colNum >= 4) {
        colNum = 0;
        rowNum += 2;
      }

      let button = gridSettingsButton[index];
      button = new GridSettingsButton(button.text, button.cols, button.rows);
      this.bottombar.add(button.actor, {row: rowNum, col: colNum, x_fill: false, y_fill: false});
      button.actor.connect(
        'notify::hover',
        Lang.bind(this, this._onSettingsButton)
      );
      colNum++;
    }
  },

  _displayElements: function() {
    this.elements = [];

    let width = this.tableWidth / this.cols - 2 * this.borderwidth;
    let height = this.tableHeight / this.rows - 2 * this.borderwidth;

    this.elementsDelegate = new GridElementDelegate();
    this.elementsDelegate.connect(
      'resize-done',
      Lang.bind(this, this._onResize)
    );
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (c === 0) {
          this.elements[r] = [];
        }

        let element = new GridElement(this.monitor, width, height, c, r);

        this.elements[r][c] = element;
        element.actor._delegate = this.elementsDelegate;
        this.table.add(element.actor, {row: r, col: c, x_fill: false, y_fill: false});
        element.show();
      }
    }
  },

  refresh: function() {
    this.table.destroy_all_children();
    this.cols = preferences.nbCols;
    this.rows = preferences.nbRows;
    this._displayElements();
  },

  set_position: function(x, y) {
    this.x = x;
    this.y = y;
    this.actor.set_position(x, y);
  },

  show: function() {
    this.interceptHide = true;
    this.elementsDelegate.reset();
    let time = preferences.animation ? 0.3 : 0;

    this.actor.raise_top();
    Main.layoutManager.removeChrome(this.actor);
    Main.layoutManager.addChrome(this.actor);
    this.actor.scale_y = 0;
    if (time > 0) {
      Tweener.addTween(this.actor, {
        time: time,
        opacity: 255,
        visible: true,
        transition: 'easeOutQuad',
        scale_y: this.normalScaleY,
        onComplete: this._onShowComplete
      });
    } else {
      this.actor.opacity = 255;
      this.actor.visible = true;
      this.actor.scale_y = this.normalScaleY;
    }

    this.interceptHide = false;
    this._bindKeyControls();
  },

  hide: function(immediate) {
    this._removeKeyControls();
    this.elementsDelegate.reset();
    let time = preferences.animation && !immediate ? 0.3 : 0;
    if (time > 0) {
      Tweener.addTween(this.actor, {
        time: time,
        opacity: 0,
        visible: false,
        scale_y: 0,
        transition: 'easeOutQuad',
        onComplete: this._onHideComplete
      });
    } else {
      this.actor.opacity = 0;
      this.actor.visible = false;
      this.actor.scale_y = 0;
    }
  },

  _onHideComplete: function() {
    if (!this.interceptHide && this.actor) {
      Main.layoutManager.removeChrome(this.actor);
    }

    Main.layoutManager._chrome.updateRegions();
  },

  _onShowComplete: function() {
    Main.layoutManager._chrome.updateRegions();
  },

  _onResize: function() {
    refreshGrids();
    if (preferences.autoclose) {
      this.emit('hide-tiling');
    }
  },

  _onMouseEnter: function() {
    if (!this.isEntered) {
      this.elementsDelegate.reset();
      this.isEntered = true;
    }
  },

  _onMouseLeave: function() {
    let [x, y, mask] = global.get_pointer();
    if ((this.elementsDelegate && (x <= this.actor.x || x >= this.actor.x + this.actor.width)) || (y <= this.actor.y || y >= this.actor.y + this.tableHeight)) {
      this.isEntered = false;
      this.elementsDelegate.reset();

      refreshGrids();
    }
  },

  _globalKeyPressEvent: function(actor, event) {
    if (event.get_key_symbol() === Clutter.Escape) {
      hideTiling();
      return true;
    }
    return false;
  },

  _onSettingsButton: function() {
    this.elementsDelegate.reset();
  },

  _bindKeyControls: function() {
    Main.keybindingManager.addHotKey('gTile-close', 'Escape', Lang.bind(this, toggleTiling));
    for (let index in KEYCONTROL) {
      let key = KEYCONTROL[index];
      let type = index;
      Main.keybindingManager.addHotKey(
        type,
        key,
        () => this._onKeyPressEvent(type, key)
      );
    }
  },

  _bindKeyControlsTile: function() {
    Main.keybindingManager.addHotKey('gTile-tile1', 'space', Lang.bind(this, this._keyTile));
    Main.keybindingManager.addHotKey('gTile-tile2', 'Return', Lang.bind(this, this._keyTile));
  },

  _removeKeyControls: function() {
    this.rowKey = -1;
    this.colKey = -1;
    Main.keybindingManager.removeHotKey('gTile-close');
    this._removeKeyControlsTile();
    for (let type in KEYCONTROL) {
      Main.keybindingManager.removeHotKey(type);
    }
  },

  _removeKeyControlsTile: function() {
    Main.keybindingManager.removeHotKey('gTile-tile1');
    Main.keybindingManager.removeHotKey('gTile-tile2');
  },

  _onKeyPressEvent: function(type) {
    let modifier = type.indexOf('meta', type.length - 4) !== -1;

    if (modifier && this.keyElement) {
      this._bindKeyControlsTile();
      if (!this.elementsDelegate.activated) {
        this.keyElement._onButtonPress();
      }
    } else if (this.keyElement) {
      this.elementsDelegate.reset();
      this._removeKeyControlsTile();
    }

    switch (type) {
      case 'gTile-k-right':
      case 'gTile-k-right-meta':
        if (this.colKey === this.cols - 1) {
          this._keyTileSwitch();
        }
        this.colKey = Math.min(this.colKey + 1, this.cols - 1);
        this.rowKey = this.rowKey === -1 ? 0 : this.rowKey; //leave initial state
        break;
      case 'gTile-k-left':
      case 'gTile-k-left-meta':
        if (this.colKey === 0) {
          this._keyTileSwitch();
        }
        this.colKey = Math.max(0, this.colKey - 1);
        break;
      case 'gTile-k-up':
      case 'gTile-k-up-meta':
        this.rowKey = Math.max(0, this.rowKey - 1);
        break;
      case 'gTile-k-down':
      case 'gTile-k-down-meta':
        this.rowKey = Math.min(this.rowKey + 1, this.rows - 1);
        this.colKey = this.colKey === -1 ? 0 : this.colKey; //leave initial state
        break;
    }
    this.keyElement = this.elements[this.rowKey] ? this.elements[this.rowKey][this.colKey] : null;
    if (this.keyElement) this.keyElement._onHoverChanged();
  },

  _keyTile: function() {
    if (this.keyElement) {
      this.keyElement._onButtonPress();
      this.colKey = -1;
      this.rowKey = -1;
    }
  },

  _keyTileSwitch: function() {
    let key = getMonitorKey(this.monitor);

    let candidate = false;
    // find other grids //TODO: improve to loop around all grids!
    for (let k in grids) {
      if (k === key) {
        continue;
      }
      candidate = grids[k];
    }
    if (candidate) {
      candidate._bindKeyControls();
    }
  },

  _destroy: function() {
    for (let r in this.elements) {
      for (let c in this.elements[r]) {
        this.elements[r][c]._destroy();
      }
    }

    this.elementsDelegate._destroy();
    this.topbar._destroy();
    this._removeKeyControls();
    this.monitor = null;
    this.rows = null;
    this.title = null;
    this.cols = null;
  }
};

Signals.addSignalMethods(Grid.prototype);

function GridElementDelegate() {
  this._init();
}

GridElementDelegate.prototype = {
  _init: function() {
    this.activated = false;
    this.first = false;
    this.last = false;
    this.currentElement = false;
    this.activatedActors = false;
  },

  _allSelected: function() {
    return this.activatedActors.length === (preferences.nbCols * preferences.nbRows);
  },

  _onButtonPress: function(gridElement) {
    if (!this.activated) {
      this.activated = true;
      this.activatedActors = [];
      this.activatedActors.push(gridElement);
      this.first = gridElement;
      gridElement.actor.add_style_pseudo_class('activate');
      gridElement.active = true;
    } else {
      //Check this.activatedActors if equals to nbCols * nbRows
      //before doing anything with the window it must be unmaximized
      //if so move the window then maximize instead of change size
      //if not move the window and change size
      reset_window(focusMetaWindow);

      let areaWidth, areaHeight, areaX, areaY;
      [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(this.first, gridElement);

      if (this._allSelected()) {
        move_maximize_window(focusMetaWindow, areaX, areaY);
      } else {
        move_resize_window(focusMetaWindow, areaX, areaY, areaWidth, areaHeight);
      }

      this._resizeDone();
    }
  },

  _resizeDone: function() {
    this.emit('resize-done');
  },

  reset: function() {
    this._resetGrid();

    this.activated = false;
    this.first = false;
    this.last = false;
    this.currentElement = false;
  },

  _resetGrid: function() {
    this._hideArea();
    if (this.currentElement) {
      this.currentElement._deactivate();
    }

    for (let act in this.activatedActors) {
      this.activatedActors[act]._deactivate();
    }
    this.activatedActors = [];
  },

  _getVarFromGridElement: function(fromGridElement, toGridElement) {
    let maxX = fromGridElement.coordx >= toGridElement.coordx ? fromGridElement.coordx : toGridElement.coordx;
    let minX = fromGridElement.coordx <= toGridElement.coordx ? fromGridElement.coordx : toGridElement.coordx;

    let maxY = fromGridElement.coordy >= toGridElement.coordy ? fromGridElement.coordy : toGridElement.coordy;
    let minY = fromGridElement.coordy <= toGridElement.coordy ? fromGridElement.coordy : toGridElement.coordy;

    return [minX, maxX, minY, maxY];
  },

  refreshGrid: function(fromGridElement, toGridElement) {
    this._resetGrid();
    let minX, maxX, minY, maxY;
    [minX, maxX, minY, maxY] = this._getVarFromGridElement(fromGridElement, toGridElement);

    let key = getMonitorKey(fromGridElement.monitor);
    let grid = grids[key];
    for (let r = minY; r <= maxY; r++) {
      for (let c = minX; c <= maxX; c++) {
        let element = grid.elements[r][c];
        element._activate();
        this.activatedActors.push(element);
      }
    }

    this._displayArea(fromGridElement, toGridElement);
  },

  _computeAreaPositionSize: function(fromGridElement, toGridElement) {
    let minX, maxX, minY, maxY;
    [minX, maxX, minY, maxY] = this._getVarFromGridElement(fromGridElement, toGridElement);
    let nbRows = preferences.nbRows;
    let nbCols = preferences.nbCols;

    let monitor = fromGridElement.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);

    let areaWidth = (screenWidth / nbCols) * (maxX - minX + 1);
    let areaHeight = (screenHeight / nbRows) * (maxY - minY + 1);
    let areaX = screenX + minX * (screenWidth / nbCols);
    let areaY = screenY + minY * (screenHeight / nbRows);

    return [areaX, areaY, areaWidth, areaHeight];
  },

  _displayArea: function(fromGridElement, toGridElement) {
    let areaWidth, areaHeight, areaX, areaY;
    [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(fromGridElement, toGridElement);

    area.add_style_pseudo_class('activate');

    if (preferences.animation) {
      Tweener.addTween(area, {
        time: 0.2,
        x: areaX,
        y: areaY,
        width: areaWidth,
        height: areaHeight,
        transition: 'easeOutQuad'
      });
    } else {
      area.width = areaWidth;
      area.height = areaHeight;
      area.x = areaX;
      area.y = areaY;
    }
  },

  _hideArea: function() {
    area.remove_style_pseudo_class('activate');
  },

  _onHoverChanged: function(gridElement) {
    if (this.activated) {
      this.refreshGrid(this.first, gridElement);
    } else {
      if (this.currentElement) this.currentElement._deactivate();

      this.currentElement = gridElement;
      this._displayArea(this.currentElement, this.currentElement);
      this.currentElement._activate();
    }
  },

  _destroy: function() {
    this.activated = null;
    this.first = null;
    this.last = null;
    this.currentElement = null;
    this.activatedActors = null;
  }
};

Signals.addSignalMethods(GridElementDelegate.prototype);

function GridElement(monitor, width, height, coordx, coordy) {
  this._init(monitor, width, height, coordx, coordy);
}

GridElement.prototype = {
  _init: function(monitor, width, height, coordx, coordy) {
    this.actor = new St.Button({
      style_class: 'table-element',
      width: width,
      height: height,
      reactive: true,
      can_focus: true,
      track_hover: true
    });

    this.actor.visible = false;
    this.actor.opacity = 0;
    this.monitor = monitor;
    this.coordx = coordx;
    this.coordy = coordy;
    this.width = width;
    this.height = height;

    this.actor.connect(
      'button-press-event',
      Lang.bind(this, this._onButtonPress)
    );
    this.actor.connect(
      'notify::hover',
      Lang.bind(this, this._onHoverChanged)
    );

    this.active = false;
  },

  show: function() {
    this.actor.opacity = 255;
    this.actor.visible = true;
  },

  hide: function() {
    this.actor.opacity = 0;
    this.actor.visible = false;
  },

  _onButtonPress: function() {
    this.actor._delegate._onButtonPress(this);
  },

  _onHoverChanged: function() {
    if (!this.actor || isFinalized(this.actor)) return;
    this.actor._delegate._onHoverChanged(this);
  },

  _activate: function() {
    if (!this.actor || isFinalized(this.actor)) return;
    this.actor.add_style_pseudo_class('activate');
  },

  _deactivate: function() {
    if (!this.actor || isFinalized(this.actor)) return;
    this.actor.remove_style_pseudo_class('activate');
  },

  _clean: function() {
    Main.uiGroup.remove_actor(area);
  },

  _destroy: function() {
    this.monitor = null;
    this.coordx = null;
    this.coordy = null;
    this.width = null;
    this.height = null;
    this.active = null;
  }
};
