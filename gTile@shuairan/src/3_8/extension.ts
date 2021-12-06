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
  private visible = false;
  private readonly tracker = Cinnamon.WindowTracker.get_default();
  private monitors = Main.layoutManager.monitors;
  private focusMetaWindowConnections: number[] = [];
  private focusMetaWindowPrivateConnections: number[] = [];

  public readonly area = new St.BoxLayout({ style_class: 'grid-preview' });

  private focusMetaWindow: imports.gi.Meta.Window | null = null;
  public get FocusMetaWindow() {
    return this.focusMetaWindow;
  }

  private grid!: Grid;
  public get Grid() {
    return this.grid;
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

  public destroy() {
    this.disableHotkey();
    this.destroyGrids();
    this.resetFocusMetaWindow();
  }

  public enableHotkey = () => {
    this.disableHotkey();
    Main.keybindingManager.addHotKey('gTile', preferences.hotkey, this.toggleTiling);
  }

  public refreshGrids = () => {
    //global.log("RefreshGrids");
    this.grid?.refresh();

    Main.layoutManager["_chrome"].updateRegions();
  }

  public getNotFocusedWindowsOfMonitor = (monitor: imports.ui.layout.Monitor) => {
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

  public hideTiling = () => {
    this.grid.elementsDelegate.reset();
    this.grid.hide(false);

    this.area.visible = false;

    this.resetFocusMetaWindow();

    this.visible = false;

    Main.layoutManager["_chrome"].updateRegions();
  }

  public toggleTiling = () => {
    if (this.visible) {
      this.hideTiling();
    } else {
      this.showTiling();
    }
    return this.visible;
  }

  private initGrids() {
    this.grid = new Grid(Main.layoutManager.primaryMonitor.index, Main.layoutManager.primaryMonitor, 'gTile', preferences.nbCols, preferences.nbRows);

    Main.layoutManager.addChrome(this.grid.actor, { visibleInFullscreen: true });
    this.grid.actor.set_opacity(0);
    this.grid.hide(true);
    this.grid.connect(
      'hide-tiling',
      this.hideTiling
    );
  }

  private destroyGrids = () => {
    if (typeof this.grid != 'undefined') {
      this.grid.hide(true);
      Main.layoutManager.removeChrome(this.grid.actor);
    }
  }

  private disableHotkey = () => {
    Main.keybindingManager.removeHotKey('gTile');
  }

  private reinitalize = () => {
    this.monitors = Main.layoutManager.monitors;
    this.destroyGrids();
    this.initGrids();
  }

  private resetFocusMetaWindow = () => {
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

  private moveGrids = () => {
    if (!this.visible) {
      return;
    }

    let window = this.focusMetaWindow;
    if (!window) return;
      let grid = this.grid;
      let pos_x;
      let pos_y;

      let monitor = grid.monitor;
      global.log(window.get_monitor(), grid.monitor_idx);
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

  private updateRegions = () => {
    Main.layoutManager["_chrome"].updateRegions();
    this.refreshGrids();
    this.grid.elementsDelegate?.reset();
  }

  private _onFocus = () => {
    let window = getFocusApp();
    if (!window) {
      this.resetFocusMetaWindow();
      this.grid.topbar._set_title('gTile');
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

    if (app) this.grid.topbar._set_app(app, title);
    else this.grid.topbar._set_title(title);
    this.moveGrids();
  }

  public MoveToMonitor = async (current: imports.ui.layout.Monitor, newMonitor: imports.ui.layout.Monitor) => {
    if (current.index == newMonitor.index)
      return;

    global.log(newMonitor.x, newMonitor.y, newMonitor.width, newMonitor.height);
    this.grid.SwitchToMonitor(newMonitor);
    this.grid.set_position(Math.floor(newMonitor.x - newMonitor.width / 2), Math.floor(newMonitor.y - newMonitor.height / 2));
    this.moveGrids();
  }

  private showTiling = () => {
    this.focusMetaWindow = getFocusApp();
    let wm_type = this.focusMetaWindow.get_window_type();
    let layer = this.focusMetaWindow.get_layer();

    this.area.visible = true;
    if (this.focusMetaWindow && wm_type !== 1 && layer > 0) {
        let grid = this.grid;

        let window = getFocusApp();
        grid.SwitchToMonitor(this.monitors.find(x => x.index == window.get_monitor()) ?? Main.layoutManager.primaryMonitor);
        let pos_x;
        let pos_y;

        pos_x = window.get_outer_rect().width / 2 + window.get_outer_rect().x;
        pos_y = window.get_outer_rect().height / 2 + window.get_outer_rect().y;

        grid.set_position(Math.floor(pos_x - grid.actor.width / 2), Math.floor(pos_y - grid.actor.height / 2));

        grid.show();

      this._onFocus();
      this.visible = true;
    }

    this.moveGrids();
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