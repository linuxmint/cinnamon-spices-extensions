/*****************************************************************

             This extension has been developped by
            vibou and forked to cinnamon by shuairan

           With the help of the gnome-shell community

******************************************************************/

import { KEYCONTROL, SETTINGS_ANIMATION, SETTINGS_AUTO_CLOSE, TooltipKeys, TOOLTIPS } from "./constants";
import { objHasKey } from "./utils";

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

let status: boolean;
let grids: Record<string, Grid>;
let monitors: imports.ui.layout.Monitor[];
let area: imports.gi.St.BoxLayout;
let focusMetaWindow: imports.gi.Meta.Window | null = null;
let focusMetaWindowConnections: Record<string, any> = {};
let focusMetaWindowPrivateConnections: Record<string, any> = {};
let tracker: imports.gi.Cinnamon.WindowTracker;
let gridSettingsButton: GridSettingsButton[] = [];
let toggleSettingListener: ToggleSettingsButtonListener;
export interface Preferences {
  hotkey: string;
  lastGridRows: number;
  lastGridCols: number;
  animation: boolean;
  autoclose: boolean;
  gridbutton1x: number;
  gridbutton1y: number;
  gridbutton2x: number;
  gridbutton2y: number;
  gridbutton3x: number;
  gridbutton3y: number;
  gridbutton4x: number;
  gridbutton4y: number;
  nbRows: number;
  nbCols: number;
}

const preferences: Preferences = {} as Preferences;
let settings: imports.ui.settings.ExtensionSettings;

const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const UUID = 'gTile@shuairan';
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');

export const _ = (str: string) => {
  let customTranslation = Gettext.dgettext(UUID, str);
  if (customTranslation != str) {
    return customTranslation;
  }
  return Gettext.gettext(str);
}


const isFinalized = (obj: any) => {
  return obj && GObject.Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
}

/*****************************************************************
                            SETTINGS
*****************************************************************/
/*INIT SETTINGS HERE TO ADD OR REMOVE SETTINGS BUTTON*/
/*new GridSettingsButton(LABEL, NBCOL, NBROW) */
const initSettings = () => {
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

const updateSettings = () => {
  toggleSettingListener._updateToggle();
}

const initGridSettings = () => {
  let basestr = 'gridbutton';
  for (let i = 1; i <= 4; i++) {
    let sgbx = basestr + i + 'x';
    let sgby = basestr + i + 'y';
    let gbx = settings.getValue(sgbx);
    let gby = settings.getValue(sgby);
    gridSettingsButton.push(new GridSettingsButton(gbx + 'x' + gby, gbx, gby));
  }
}

const updateGridSettings = () => {
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
export const init = () => { }

export const enable = () => {
  try {
    status = false;
    monitors = Main.layoutManager.monitors;
    tracker = Cinnamon.WindowTracker.get_default();

    area = new St.BoxLayout({ style_class: 'grid-preview' });
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
  catch(e) {
    global.logError(e);
    global.logError(e?.stack)
  }
}

export const disable = () => {
  // Key Bindings
  disableHotkey();

  destroyGrids();
  resetFocusMetaWindow();
}

const enableHotkey = () => {
  disableHotkey();
  Main.keybindingManager.addHotKey('gTile', preferences.hotkey, toggleTiling);
}

const disableHotkey = () => {
  Main.keybindingManager.removeHotKey('gTile');
}

const reinitalize = () => {
  monitors = Main.layoutManager.monitors;
  destroyGrids();
  initGrids();
}

const resetFocusMetaWindow = () => {
  if (focusMetaWindowConnections.length > 0) {
    for (var idx in focusMetaWindowConnections) {
      focusMetaWindow?.disconnect(focusMetaWindowConnections[idx]);
    }
  }

  if (focusMetaWindowPrivateConnections.length > 0) {
    let actor = focusMetaWindow?.get_compositor_private();
    if (actor) {
      for (let idx in focusMetaWindowPrivateConnections) {
        actor.disconnect(focusMetaWindowPrivateConnections[idx]);
      }
    }
  }

  focusMetaWindow = null;
  focusMetaWindowConnections = [];
  focusMetaWindowPrivateConnections = [];
}

const initGrids = () => {
  grids = {};
  for (let monitorIdx in monitors) {
    let monitor = monitors[monitorIdx];
    let grid = new Grid(parseInt(monitorIdx), monitor, 'gTile', preferences.nbCols, preferences.nbRows);
    let key = getMonitorKey(monitor);
    grids[key] = grid;

    Main.layoutManager.addChrome(grid.actor, { visibleInFullscreen: true });
    grid.actor.set_opacity(0);
    grid.hide(true);
    //@ts-ignore
    grid.connect(
      'hide-tiling',
      hideTiling
    );
  }
}

const destroyGrids = () => {
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

const refreshGrids = () => {
  //global.log("RefreshGrids");
  for (let gridIdx in grids) {
    let grid = grids[gridIdx];
    grid.refresh();
  }

  Main.layoutManager["_chrome"].updateRegions();
}

const moveGrids = () => {
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

const updateRegions = () => {
  Main.layoutManager["_chrome"].updateRegions();
  refreshGrids();
  for (let idx in grids) {
    let grid = grids[idx];
    grid.elementsDelegate?.reset();
  }
}

const reset_window = (metaWindow: imports.gi.Meta.Window | null) => {
  metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
  metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
  metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
  /**
   * TODO: Check if functions exist
   */
  metaWindow?.tile(Meta.WindowTileType.NONE, false);
}

const _getInvisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
  // TODO: Check if functions exist
  let outerRect = metaWindow.get_outer_rect();
  let inputRect = metaWindow.get_input_rect();
  let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];

  return [borderX, borderY];
}

const _getVisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
  // TODO: Check if functions exist
  let clientRect = metaWindow.get_rect();
  let outerRect = metaWindow.get_outer_rect();

  let borderX = outerRect.width - clientRect.width;
  let borderY = outerRect.height - clientRect.height;

  return [borderX, borderY];
}

const move_maximize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number) => {
  if (metaWindow == null)
    return;

  let [borderX, borderY] = _getInvisibleBorderPadding(metaWindow);

  x = x - borderX;
  y = y - borderY;

  metaWindow.move_frame(true, x, y);
  metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
}

const move_resize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number, width: number, height: number) => {
  if (metaWindow == null)
    return;

  let [vBorderX, vBorderY] = _getVisibleBorderPadding(metaWindow);

  width = width - vBorderX;
  height = height - vBorderY;

  //TODO: Check if exists
  metaWindow.resize(true, width, height);
  metaWindow.move_frame(true, x, y);
}

const getPanelHeight = (panel: imports.ui.panel.Panel) => {
  return panel.height
    || panel.actor.get_height();  // fallback for old versions of Cinnamon
}

const getUsableScreenArea = (monitor: imports.ui.layout.Monitor) => {
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

const getNotFocusedWindowsOfMonitor = (monitor: imports.ui.layout.Monitor) => {
  return Main.getTabList().filter(function (w) {
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

    // TODO: Check if exists
    return focusMetaWindow !== w && w.get_wm_class() != null;
  });
}

const _onFocus = () => {
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
  // TODO: Check if exists
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

const showTiling = () => {
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

const hideTiling = () => {
  for (let gridIdx in grids) {
    let grid = grids[gridIdx];
    grid.elementsDelegate.reset();
    grid.hide(false);
  }

  area.visible = false;

  resetFocusMetaWindow();

  status = false;

  Main.layoutManager["_chrome"].updateRegions();
}

const toggleTiling = () => {
  if (status) {
    hideTiling();
  } else {
    showTiling();
  }
  return status;
}

const getMonitorKey = (monitor: imports.ui.layout.Monitor) => {
  return monitor.x + ':' + monitor.width + ':' + monitor.y + ':' + monitor.height;
}

const getFocusApp = () => {
  return global.display.focus_window;
}

const isPrimaryMonitor = (monitor: imports.ui.layout.Monitor) => {
  return Main.layoutManager.primaryMonitor === monitor;
}

/*****************************************************************
                            PROTOTYPES
*****************************************************************/


class TopBar {
  actor: imports.gi.St.BoxLayout;
  private _title: string;
  private _stlabel: imports.gi.St.Label;
  private _iconBin: imports.gi.St.Bin;
  private _closeButton: imports.gi.St.Button;
  private _icon?: imports.gi.Clutter.Actor;

  constructor(title: string) {
    this.actor = new St.BoxLayout({ style_class: 'top-box' });
    this._title = title;
    this._stlabel = new St.Label({ style_class: 'grid-title', text: this._title });
    this._iconBin = new St.Bin({ x_fill: false, y_fill: true });
    this._closeButton = new St.Button({ style_class: 'close-button' });

    this._closeButton.connect(
      'button-release-event',
      this._onCloseButtonClicked
    );

    this.actor.add(this._iconBin);
    this.actor.add(this._stlabel, { x_fill: true, expand: true });
    this.actor.add(this._closeButton, { x_fill: false, expand: false });
  }

  public _set_title(title: string) {
    this._title = title;
    this._stlabel.text = this._title;
  }

  public _set_app(app: imports.gi.Cinnamon.CinnamonApp, title: string) {
    this._title = app.get_name() + ' - ' + title;
    this._stlabel.text = this._title;
    this._icon = app.create_icon_texture(24);

    this._iconBin.set_size(24, 24);
    // TODO: proper null check
    this._iconBin.set_child(<imports.gi.St.Icon>this._icon);
  }

  private _onCloseButtonClicked = () => {
    toggleTiling();
  }
}

class ToggleSettingsButtonListener {
  actors: ToggleSettingsButton[] = [];

  constructor() { }

  public addActor(actor: ToggleSettingsButton) {
    // @ts-ignore
    actor.connect(
      'update-toggle',
      this._updateToggle
    );
    this.actors.push(actor);
  }

  public _updateToggle = () => {
    for (let actorIdx in this.actors) {
      let actor = this.actors[actorIdx];
      // @ts-ignore
      actor._update();
    }
  }
};

class ToggleSettingsButton {
  text: string;
  actor: imports.gi.St.Button;
  icon: imports.gi.St.BoxLayout;
  property: TooltipKeys | keyof Preferences

  private _tooltip?: imports.ui.tooltips.Tooltip;

  constructor(text: string, property: keyof Preferences | TooltipKeys) {
    this.text = text;
    this.actor = new St.Button({
      style_class: 'settings-button',
      reactive: true,
      can_focus: true,
      track_hover: true,
      label: this.text
    });
    this.icon = new St.BoxLayout({ style_class: this.text + '-icon', reactive: true, can_focus: true, track_hover: true });
    this.actor.set_child(this.icon);
    this.property = property;
    this._update();
    this.actor.connect(
      'button-press-event',
      this._onButtonPress
    );
    //@ts-ignore
    this.connect(
      'update-toggle',
      this._update
    );

    if (objHasKey(TOOLTIPS, property)) {
      this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[property]);
    }
  }

  private _update = () => {
    if (objHasKey(preferences, this.property)) {
      this.actor.add_style_pseudo_class('activate');
    } else {
      this.actor.remove_style_pseudo_class('activate');
    }
  }

  private _onButtonPress = () => {
    if (!objHasKey(preferences, this.property))
      return;

    // @ts-ignore
    preferences[this.property] = !preferences[this.property];
    // @ts-ignore
    this.emit('update-toggle');
  }
};

Signals.addSignalMethods(ToggleSettingsButton.prototype);

class ActionButton {
  grid: Grid;
  actor: imports.gi.St.Button;
  icon: imports.gi.St.BoxLayout;

  private _tooltip?: imports.ui.tooltips.Tooltip;

  constructor(grid: Grid, classname: TooltipKeys) {
    this.grid = grid;
    this.actor = new St.Button({
      style_class: 'settings-button',
      reactive: true,
      can_focus: true,
      track_hover: true
    });

    this.icon = new St.BoxLayout({ style_class: classname, reactive: true, can_focus: true, track_hover: true });
    this.actor.add_actor(this.icon);
    this.actor.connect(
      'button-press-event',
      this._onButtonPress
    );

    if (TOOLTIPS[classname]) {
      this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[classname]);
    }
  }

  protected _onButtonPress = () => {
    // @ts-ignore
    this.emit('button-press-event');
  }
};

Signals.addSignalMethods(ActionButton.prototype);

class AutoTileMainAndList extends ActionButton {
  classname: string;

  constructor(grid: Grid) {
    super(grid, 'action-main-list');
    this.classname = 'action-main-list';
    // @ts-ignore
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => {
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

    //@ts-ignore
    this.emit('resize-done');
  }
};

Signals.addSignalMethods(AutoTileMainAndList.prototype);

class AutoTileTwoList extends ActionButton {
  classname: string;

  constructor(grid: Grid) {
    super(grid, 'action-two-list');
    this.classname = 'action-two-list';
    // @ts-ignore
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => {
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

    // @ts-ignore
    this.emit('resize-done');
  }
};

Signals.addSignalMethods(AutoTileTwoList.prototype);

class ActionScale extends ActionButton {
  classname: string;

  constructor(grid: Grid) {
    // @ts-ignore
    super(grid, 'action-scale')
    this.classname = 'action-scale';

    // @ts-ignore
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => { }
}

export class GridSettingsButton {
  cols: number;
  rows: number;
  text: string;
  actor: imports.gi.St.Button;
  label: imports.gi.St.Label;

  constructor(text: string, cols: number, rows: number) {
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
      this._onButtonPress
    );
  }

  private _onButtonPress = () => {
    preferences.nbCols = this.cols;
    preferences.nbRows = this.rows;
    refreshGrids();
  }
}

export class Grid {
  tableWidth = 220;
  tableHeight = 200;
  borderwidth = 2;
  bindFns = {};
  rowKey = -1;
  colKey = -1;

  actor: imports.gi.St.BoxLayout;
  topbar: TopBar;
  bottombar: imports.gi.St.Table;
  veryBottomBar: imports.gi.St.Table;
  table: imports.gi.St.Table;

  monitor: imports.ui.layout.Monitor;
  monitor_idx: number;
  rows: number;
  title: string;
  cols: number;

  isEntered = false;

  x: number;
  y: number;
  interceptHide = false;

  normalScaleY: number;
  normalScaleX: number;

  elementsDelegate!: GridElementDelegate;
  elements!: GridElement[][];
  keyElement?: GridElement | null;

  constructor(monitor_idx: number, monitor: imports.ui.layout.Monitor, title: string, cols: number, rows: number) {
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
      this._onMouseEnter
    );
    this.actor.connect(
      'leave-event',
      this._onMouseLeave
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

    this.actor.add(this.topbar.actor, { x_fill: true });
    this.actor.add(this.table, { x_fill: false });
    this.actor.add(this.bottombar, { x_fill: true });
    this.actor.add(this.veryBottomBar, { x_fill: true });

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
      this.veryBottomBar.add(toggle.actor, { row: 0, col: 0, x_fill: false, y_fill: false });
      toggleSettingListener.addActor(toggle);

      toggle = new ToggleSettingsButton('auto-close', SETTINGS_AUTO_CLOSE);
      toggle.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(toggle.actor, { row: 0, col: 1, x_fill: false, y_fill: false });
      toggleSettingListener.addActor(toggle);

      let action = new AutoTileMainAndList(this);
      action.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(action.actor, { row: 0, col: 2, x_fill: false, y_fill: false });

      // @ts-ignore
      action.connect(
        'resize-done',
        this._onResize
      );

      let actionTwo = new AutoTileTwoList(this);
      actionTwo.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(actionTwo.actor, { row: 0, col: 3, x_fill: false, y_fill: false });

      //@ts-ignore
      actionTwo.connect(
        'resize-done',
        this._onResize
      );
    }

    this.x = 0;
    this.y = 0;

    this.interceptHide = false;

    this._displayElements();

    this.normalScaleY = this.actor.scale_y;
    this.normalScaleX = this.actor.scale_x;
  }

  public _initGridSettingsButtons = () => {
    // TODO: Check if exists
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
      this.bottombar.add(button.actor, { row: rowNum, col: colNum, x_fill: false, y_fill: false });
      button.actor.connect(
        'notify::hover',
        this._onSettingsButton
      );
      colNum++;
    }
  }

  private _displayElements = () => {
    this.elements = [];

    let width = this.tableWidth / this.cols - 2 * this.borderwidth;
    let height = this.tableHeight / this.rows - 2 * this.borderwidth;

    this.elementsDelegate = new GridElementDelegate();
    // @ts-ignore
    this.elementsDelegate.connect(
      'resize-done',
      this._onResize
    );
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (c === 0) {
          this.elements[r] = [];
        }

        let element = new GridElement(this.monitor, width, height, c, r);

        this.elements[r][c] = element;
        // @ts-ignore
        element.actor._delegate = this.elementsDelegate;
        this.table.add(element.actor, { row: r, col: c, x_fill: false, y_fill: false });
        element.show();
      }
    }
  }

  public refresh = () => {
    this.table.destroy_all_children();
    this.cols = preferences.nbCols;
    this.rows = preferences.nbRows;
    this._displayElements();
  }

  public set_position(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.actor.set_position(x, y);
  }

  public show() {
    this.interceptHide = true;
    this.elementsDelegate.reset();
    let time = preferences.animation ? 0.3 : 0;

    // TODO: Test if exists
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
  }

  public hide(immediate: boolean) {
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
  }

  private _onHideComplete = () => {
    if (!this.interceptHide && this.actor) {
      Main.layoutManager.removeChrome(this.actor);
    }

    Main.layoutManager["_chrome"].updateRegions();
  }

  private _onShowComplete = () => {
    Main.layoutManager["_chrome"].updateRegions();
  }

  private _onResize = () => {
    refreshGrids();
    if (preferences.autoclose) {
      // @ts-ignore
      this.emit('hide-tiling');
    }
  }

  private _onMouseEnter = () => {
    if (!this.isEntered) {
      this.elementsDelegate.reset();
      this.isEntered = true;
    }
  }

  private _onMouseLeave = () => {
    let [x, y, mask] = global.get_pointer();
    if ((this.elementsDelegate && (x <= this.actor.x || x >= this.actor.x + this.actor.width)) || (y <= this.actor.y || y >= this.actor.y + this.tableHeight)) {
      this.isEntered = false;
      this.elementsDelegate.reset();

      refreshGrids();
    }
  }

  private _globalKeyPressEvent = (actor: imports.gi.Clutter.Actor, event: imports.gi.Clutter.Event) => {
    // TODO: Check if exists
    if (event.get_key_symbol() === Clutter.Escape) {
      hideTiling();
      return true;
    }
    return false;
  }

  private _onSettingsButton = () => {
    this.elementsDelegate.reset();
  }

  private _bindKeyControls = () => {
    Main.keybindingManager.addHotKey('gTile-close', 'Escape', toggleTiling);
    Main.keybindingManager.addHotKey('gTile-tile1', 'space', this._keyTile);
    Main.keybindingManager.addHotKey('gTile-tile2', 'Return', this._keyTile);
    for (let index in KEYCONTROL) {
      if (objHasKey(KEYCONTROL, index)) {
        let key = KEYCONTROL[index];
        let type = index;
        Main.keybindingManager.addHotKey(
          type,
          key,
          () => this._onKeyPressEvent(type, key)
        );
      }
    }
  }

  private _removeKeyControls = () => {
    this.rowKey = -1;
    this.colKey = -1;
    Main.keybindingManager.removeHotKey('gTile-close');
    Main.keybindingManager.removeHotKey('gTile-tile1');
    Main.keybindingManager.removeHotKey('gTile-tile2');
    for (let type in KEYCONTROL) {
      Main.keybindingManager.removeHotKey(type);
    }
  }

  private _onKeyPressEvent = (type: string, key?: string) => {
    let modifier = type.indexOf('meta', type.length - 4) !== -1;

    if (modifier && this.keyElement) {
      if (!this.elementsDelegate.activated) {
        this.keyElement._onButtonPress();
      }
    } else if (this.keyElement) {
      this.elementsDelegate.reset();
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
  }

  private _keyTile = () => {
    if (this.keyElement) {
      this.keyElement._onButtonPress();
      this.keyElement._onButtonPress();
      this.colKey = -1;
      this.rowKey = -1;
    }
  }

  private _keyTileSwitch = () => {
    let key = getMonitorKey(this.monitor);

    let candidate: Grid | null = null;
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
  }

  private _destroy = () => {
    for (let r in this.elements) {
      for (let c in this.elements[r]) {
        this.elements[r][c]._destroy();
      }
    }

    this.elementsDelegate._destroy();
    // TODO: Check if needed
    // @ts-ignore
    this.topbar._destroy();
    this._removeKeyControls();
    // @ts-ignore
    this.monitor = null;
    // @ts-ignore
    this.rows = null;
    // @ts-ignore
    this.title = null;
    // @ts-ignore
    this.cols = null;
  }
};

Signals.addSignalMethods(Grid.prototype);

export class GridElementDelegate {
  activated = false;
  first: GridElement | null = null;
  last: GridElement | null = null;
  currentElement: GridElement | null = null;
  activatedActors: GridElement[] | null = null;

  constructor() { }

  private _allSelected = () => {
    return this.activatedActors?.length === (preferences.nbCols * preferences.nbRows);
  }

  public _onButtonPress(gridElement: GridElement) {
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
      // TODO: check this
      // @ts-ignore
      [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(this.first, gridElement);

      if (this._allSelected()) {
        move_maximize_window(focusMetaWindow, areaX, areaY);
      } else {
        move_resize_window(focusMetaWindow, areaX, areaY, areaWidth, areaHeight);
      }

      this._resizeDone();
    }
  }

  private _resizeDone = () => {
    // @ts-ignore
    this.emit('resize-done');
  }

  public reset = () => {
    this._resetGrid();

    this.activated = false;
    this.first = null;
    this.last = null;
    this.currentElement = null;
  }

  private _resetGrid = () => {
    this._hideArea();
    if (this.currentElement) {
      this.currentElement._deactivate();
    }

    if (this.activatedActors != null) {
      for (let index = 0; index < this.activatedActors.length; index++) {
        this.activatedActors[index]._deactivate();
      }
    }
    this.activatedActors = [];
  }

  private _getVarFromGridElement = (fromGridElement: GridElement, toGridElement: GridElement) => {
    let maxX = fromGridElement.coordx >= toGridElement.coordx ? fromGridElement.coordx : toGridElement.coordx;
    let minX = fromGridElement.coordx <= toGridElement.coordx ? fromGridElement.coordx : toGridElement.coordx;

    let maxY = fromGridElement.coordy >= toGridElement.coordy ? fromGridElement.coordy : toGridElement.coordy;
    let minY = fromGridElement.coordy <= toGridElement.coordy ? fromGridElement.coordy : toGridElement.coordy;

    return [minX, maxX, minY, maxY];
  }

  public refreshGrid = (fromGridElement: GridElement, toGridElement: GridElement) => {
    this._resetGrid();
    let minX, maxX, minY, maxY;
    [minX, maxX, minY, maxY] = this._getVarFromGridElement(fromGridElement, toGridElement);

    let key = getMonitorKey(fromGridElement.monitor);
    let grid = grids[key];
    for (let r = minY; r <= maxY; r++) {
      for (let c = minX; c <= maxX; c++) {
        let element = grid?.elements[r][c];
        element._activate();
        this.activatedActors?.push(element);
      }
    }

    this._displayArea(fromGridElement, toGridElement);
  }

  private _computeAreaPositionSize = (fromGridElement: GridElement, toGridElement: GridElement) => {
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
  }

  private _displayArea = (fromGridElement: GridElement, toGridElement: GridElement) => {
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
  }

  private _hideArea = () => {
    area.remove_style_pseudo_class('activate');
  }

  private _onHoverChanged = (gridElement: GridElement) => {
    if (this.activated) {
      if (this.first != null)
        this.refreshGrid(this.first, gridElement);
    } else {
      if (this.currentElement) this.currentElement._deactivate();

      this.currentElement = gridElement;
      this._displayArea(this.currentElement, this.currentElement);
      this.currentElement._activate();
    }
  }

  public _destroy = () => {
    // @ts-ignore
    this.activated = null;
    this.first = null;
    this.last = null;
    this.currentElement = null;
    this.activatedActors = null;
  }
};

Signals.addSignalMethods(GridElementDelegate.prototype);

export class GridElement {
  actor: imports.gi.St.Button;
  monitor: imports.ui.layout.Monitor;
  coordx: number;
  coordy: number;
  width: number;
  height: number;
  active: boolean;


  constructor(monitor: imports.ui.layout.Monitor, width: number, height: number, coordx: number, coordy: number) {
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
      this._onButtonPress
    );
    this.actor.connect(
      'notify::hover',
      this._onHoverChanged
    );

    this.active = false;
  }

  public show = () => {
    this.actor.opacity = 255;
    this.actor.visible = true;
  }

  public hide = () => {
    this.actor.opacity = 0;
    this.actor.visible = false;
  }

  public _onButtonPress = () => {
    // @ts-ignore
    this.actor._delegate._onButtonPress(this);
  }

  public _onHoverChanged = () => {
    if (!this.actor || isFinalized(this.actor)) return;
    // @ts-ignore
    this.actor._delegate._onHoverChanged(this);
  }

  public _activate = () => {
    if (!this.actor || isFinalized(this.actor)) return;
    this.actor.add_style_pseudo_class('activate');
  }

  public _deactivate = () => {
    if (!this.actor || isFinalized(this.actor)) return;
    this.actor.remove_style_pseudo_class('activate');
  }

  public _clean = () => {
    Main.uiGroup.remove_actor(area);
  }

  public _destroy = () => {
    // @ts-ignore
    this.monitor = null;
    // @ts-ignore
    this.coordx = null;
    // @ts-ignore
    this.coordy = null;
    // @ts-ignore
    this.width = null;
    // @ts-ignore
    this.height = null;
    // @ts-ignore
    this.active = null;
  }
}
