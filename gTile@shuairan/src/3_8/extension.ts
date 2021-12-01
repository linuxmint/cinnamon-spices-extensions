/*****************************************************************

             This extension has been developped by
            vibou and forked to cinnamon by shuairan

           With the help of the gnome-shell community

******************************************************************/

import { initSettings, preferences } from "./config";
import { Grid } from "./ui/Grid";
import { getFocusApp, getMonitorKey } from "./utils";

/*****************************************************************
                         CONST & VARS
*****************************************************************/
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

class App {
  private status = false;
  private readonly tracker = Cinnamon.WindowTracker.get_default();
  private monitors = Main.layoutManager.monitors;
  private focusMetaWindowConnections: number[] = [];
  private focusMetaWindowPrivateConnections: number[] = [];

  public readonly area = new St.BoxLayout({ style_class: 'grid-preview' });

  private focusMetaWindow: imports.gi.Meta.Window | null = null;
  public get FocusMetaWindow() {
    return this.focusMetaWindow;
  }

  private grids: Record<string, Grid> = {};
  public get Grids() {
    return this.grids;
  }

  constructor() {
    try {
      Main.uiGroup.add_actor(this.area);

      initSettings();
      this.initGrids();

      this.enableHotkey();

      this.tracker.connect(
        "notify::focus_app",
        this._onFocus
      );
      global.screen.connect(
        'monitors-changed',
        this.reinitalize
      );
      //global.log("KEY BINDNGS");
    }
    catch (e) {
      global.logError(e);
      global.logError(e?.stack)
    }
  }

  initGrids() {
    this.grids = {};
    for (let monitorIdx in this.monitors) {
      let monitor = this.monitors[monitorIdx];
      let grid = new Grid(parseInt(monitorIdx), monitor, 'gTile', preferences.nbCols, preferences.nbRows);
      let key = getMonitorKey(monitor);
      this.grids[key] = grid;

      Main.layoutManager.addChrome(grid.actor, { visibleInFullscreen: true });
      grid.actor.set_opacity(0);
      grid.hide(true);
      grid.connect(
        'hide-tiling',
        this.hideTiling
      );
    }
  }

  destroyGrids = () => {
    for (let monitorIdx in this.monitors) {
      let monitor = this.monitors[monitorIdx];
      let key = getMonitorKey(monitor);
      let grid = this.grids[key];
      if (typeof grid != 'undefined') {
        grid.hide(true);
        Main.layoutManager.removeChrome(grid.actor);
      }
    }
  }

  disableHotkey = () => {
    Main.keybindingManager.removeHotKey('gTile');
  }

  reinitalize = () => {
    this.monitors = Main.layoutManager.monitors;
    this.destroyGrids();
    this.initGrids();
  }

  enableHotkey = () => {
    this.disableHotkey();
    Main.keybindingManager.addHotKey('gTile', preferences.hotkey, this.toggleTiling);
  }

  resetFocusMetaWindow = () => {
    if (this.focusMetaWindowConnections.length > 0) {
      for (var idx in this.focusMetaWindowConnections) {
        this.focusMetaWindow?.disconnect(this.focusMetaWindowConnections[idx]);
      }
    }
  
    if (this.focusMetaWindowPrivateConnections.length > 0) {
      let actor = this.focusMetaWindow?.get_compositor_private();
      if (actor) {
        for (let idx in this.focusMetaWindowPrivateConnections) {
          actor.disconnect(this.focusMetaWindowPrivateConnections[idx]);
        }
      }
    }
  
    this.focusMetaWindow = null;
    this.focusMetaWindowConnections = [];
    this.focusMetaWindowPrivateConnections = [];
  }

  refreshGrids = () => {
    //global.log("RefreshGrids");
    for (let gridIdx in this.grids) {
      let grid = this.grids[gridIdx];
      grid.refresh();
    }
  
    Main.layoutManager["_chrome"].updateRegions();
  }

  moveGrids = () => {
    if (!this.status) {
      return;
    }
  
    let window = this.focusMetaWindow;
    if (!window) return;
    for (let gridIdx in this.grids) {
      let grid = this.grids[gridIdx];
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
        onComplete: this.updateRegions
      });
    }
  }
  
  updateRegions = () => {
    Main.layoutManager["_chrome"].updateRegions();
    this.refreshGrids();
    for (let idx in this.grids) {
      let grid = this.grids[idx];
      grid.elementsDelegate?.reset();
    }
  }

  getNotFocusedWindowsOfMonitor = (monitor: imports.ui.layout.Monitor) => {
    return Main.getTabList().filter((w) => {
      let app = this.tracker.get_window_app(w);
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
  
      return this.focusMetaWindow !== w && w.get_wm_class() != null;
    });
  }
  
  _onFocus = () => {
    let window = getFocusApp();
    if (!window) {
      this.resetFocusMetaWindow();
      for (let gridIdx in this.grids) {
        let grid = this.grids[gridIdx];
        grid.topbar._set_title('gTile');
      }
      return;
    }
  
    this.resetFocusMetaWindow();
  
    this.focusMetaWindow = window;
  
    let actor = this.focusMetaWindow.get_compositor_private();
    if (actor) {
      this.focusMetaWindowPrivateConnections.push(
        actor.connect(
          'size-changed',
          this.moveGrids
        )
      );
      this.focusMetaWindowPrivateConnections.push(
        actor.connect(
          'position-changed',
          this.moveGrids
        )
      );
    }
  
    let app = this.tracker.get_window_app(this.focusMetaWindow);
    let title = this.focusMetaWindow.get_title();
  
    for (let monitorIdx in this.monitors) {
      let monitor = this.monitors[monitorIdx];
      let key = getMonitorKey(monitor);
      let grid = this.grids[key];
      if (app) grid.topbar._set_app(app, title);
      else grid.topbar._set_title(title);
    }
    this.moveGrids();
  }
  
  showTiling = () => {
    this.focusMetaWindow = getFocusApp();
    let wm_type = this.focusMetaWindow.get_window_type();
    let layer = this.focusMetaWindow.get_layer();
  
    this.area.visible = true;
    if (this.focusMetaWindow && wm_type !== 1 && layer > 0) {
      for (let monitorIdx in this.monitors) {
        let monitor = this.monitors[monitorIdx];
        let key = getMonitorKey(monitor);
        let grid = this.grids[key];
  
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
  
      this._onFocus();
      this.status = true;
    }
  
    this.moveGrids();
  }
  
  hideTiling = () => {
    for (let gridIdx in this.grids) {
      let grid = this.grids[gridIdx];
      grid.elementsDelegate.reset();
      grid.hide(false);
    }
  
    this.area.visible = false;
  
    this.resetFocusMetaWindow();
  
    this.status = false;
  
    Main.layoutManager["_chrome"].updateRegions();
  }
  
  toggleTiling = () => {
    if (this.status) {
      this.hideTiling();
    } else {
      this.showTiling();
    }
    return this.status;
  }

  destroy() {
    this.disableHotkey();
    this.destroyGrids();
    this.resetFocusMetaWindow();
  }
  
}

export let app: App = new App();

/*****************************************************************
                            FUNCTIONS
*****************************************************************/
export const init = () => { }

export const enable = () => {
  app = new App();
}

export const disable = () => {
  // Key Bindings
  app.destroy();
}