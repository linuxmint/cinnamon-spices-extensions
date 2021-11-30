/*****************************************************************

             This extension has been developped by
            vibou and forked to cinnamon by shuairan

           With the help of the gnome-shell community

******************************************************************/

import { Grid, toggleSettingListener } from "./ui/Grid";
import { GridSettingsButton } from "./ui/GridSettingsButton";

/*****************************************************************
                         CONST & VARS
*****************************************************************/
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Settings = imports.ui.settings;
const Panel = imports.ui.panel;

let status: boolean;
export let grids: Record<string, Grid>;
let monitors: imports.ui.layout.Monitor[];
export let area: imports.gi.St.BoxLayout;
export let focusMetaWindow: imports.gi.Meta.Window | null = null;
let focusMetaWindowConnections: Record<string, any> = {};
let focusMetaWindowPrivateConnections: Record<string, any> = {};
let tracker: imports.gi.Cinnamon.WindowTracker;
export let gridSettingsButton: GridSettingsButton[] = [];


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

export const preferences: Preferences = {} as Preferences;
let settings: imports.ui.settings.ExtensionSettings;

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
  for (const gridIdx in grids) {
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
      "notify::focus_app",
      _onFocus
    );
    global.screen.connect(
      'monitors-changed',
      reinitalize
    );
    //global.log("KEY BINDNGS");
  }
  catch (e) {
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

export const resetFocusMetaWindow = () => {
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

export const refreshGrids = () => {
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

export const reset_window = (metaWindow: imports.gi.Meta.Window | null) => {
  metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
  metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
  metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
  metaWindow?.tile(Meta.TileMode.NONE, false);
}

const _getInvisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
  let outerRect = metaWindow.get_outer_rect();
  let inputRect = metaWindow.get_input_rect();
  let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];

  return [borderX, borderY];
}

const _getVisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
  let clientRect = metaWindow.get_rect();
  let outerRect = metaWindow.get_outer_rect();

  let borderX = outerRect.width - clientRect.width;
  let borderY = outerRect.height - clientRect.height;

  return [borderX, borderY];
}

export const move_maximize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number) => {
  if (metaWindow == null)
    return;

  let [borderX, borderY] = _getInvisibleBorderPadding(metaWindow);

  x = x - borderX;
  y = y - borderY;

  metaWindow.move_frame(true, x, y);
  metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
}

export const move_resize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number, width: number, height: number) => {
  if (metaWindow == null)
    return;

  let [vBorderX, vBorderY] = _getVisibleBorderPadding(metaWindow);

  width = width - vBorderX;
  height = height - vBorderY;

  metaWindow.resize(true, width, height);
  metaWindow.move_frame(true, x, y);
}

const getPanelHeight = (panel: imports.ui.panel.Panel) => {
  return panel.height
    || panel.actor.get_height();  // fallback for old versions of Cinnamon
}

export const getUsableScreenArea = (monitor: imports.ui.layout.Monitor) => {
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

export const getNotFocusedWindowsOfMonitor = (monitor: imports.ui.layout.Monitor) => {
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

export const hideTiling = () => {
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

export const toggleTiling = () => {
  if (status) {
    hideTiling();
  } else {
    showTiling();
  }
  return status;
}

export const getMonitorKey = (monitor: imports.ui.layout.Monitor) => {
  return monitor.x + ':' + monitor.width + ':' + monitor.y + ':' + monitor.height;
}

export const getFocusApp = () => {
  return global.display.focus_window;
}

const isPrimaryMonitor = (monitor: imports.ui.layout.Monitor) => {
  return Main.layoutManager.primaryMonitor === monitor;
}