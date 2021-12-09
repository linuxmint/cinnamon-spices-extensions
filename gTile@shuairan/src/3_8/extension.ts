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
let metadata: any;

class App {
  private visible = false;
  public readonly tracker = Cinnamon.WindowTracker.get_default();
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
      Main.uiGroup.add_actor(this.area);

      this.tracker.connect("notify::focus-app", this.OnFocusedWindowChanged);
      global.screen.connect('monitors-changed', this.ReInitialize);
  }

  public destroy() {
    this.DisableHotkey();
    this.DestroyGrid();
    this.ResetFocusedWindow();
  }

  public EnableHotkey = () => {
    this.DisableHotkey();
    Main.keybindingManager.addHotKey('gTile', preferences.hotkey, this.ToggleUI);
  }

  private DisableHotkey = () => {
    Main.keybindingManager.removeHotKey('gTile');
  }

  public RefreshGrid = () => {
    this.grid.RefreshGridElements();

    Main.layoutManager["_chrome"].updateRegions();
  }

  public GetNotFocusedWindowsOfMonitor = (monitor: imports.ui.layout.Monitor) => {
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

  public ToggleUI = () => {
    if (this.visible) {
      this.HideUI();
    } else {
      this.ShowUI();
    }
    return this.visible;
  }

  public MoveToMonitor = async (current: imports.ui.layout.Monitor, newMonitor: imports.ui.layout.Monitor) => {
    if (current.index == newMonitor.index)
      return;

    this.grid.ChangeCurrentMonitor(newMonitor);
    this.MoveUIActor();
  }

  private ShowUI = () => {
    this.focusMetaWindow = getFocusApp();
    let wm_type = this.focusMetaWindow.get_window_type();
    let layer = this.focusMetaWindow.get_layer();

    this.area.visible = true;
    if (this.focusMetaWindow && wm_type !== 1 && layer > 0) {
        let grid = this.grid;

        let window = getFocusApp();
        grid.ChangeCurrentMonitor(this.monitors.find(x => x.index == window.get_monitor()) ?? Main.layoutManager.primaryMonitor);

        let pos_x = window.get_outer_rect().width / 2 + window.get_outer_rect().x;
        let pos_y = window.get_outer_rect().height / 2 + window.get_outer_rect().y;

        grid.Show(Math.floor(pos_x - grid.actor.width / 2), Math.floor(pos_y - grid.actor.height / 2));

      this.OnFocusedWindowChanged();
      this.visible = true;
    }

    this.MoveUIActor();
  }

  private HideUI = () => {
    this.grid.elementsDelegate.reset();
    this.grid.Hide(false);

    this.area.visible = false;

    this.ResetFocusedWindow();

    this.visible = false;

    Main.layoutManager["_chrome"].updateRegions();
  }

  //#region Init

  public ReInitialize = () => {
    this.monitors = Main.layoutManager.monitors;
    this.DestroyGrid();
    this.InitGrid();
  }

  public InitGrid() {
    this.grid = new Grid(Main.layoutManager.primaryMonitor.index, Main.layoutManager.primaryMonitor, 'gTile', preferences.nbCols, preferences.nbRows);

    Main.layoutManager.addChrome(this.grid.actor, { visibleInFullscreen: true });
    this.grid.actor.set_opacity(0);
    this.grid.Hide(true);
    this.grid.connect(
      'hide-tiling',
      this.HideUI
    );
  }

  private DestroyGrid = () => {
    if (typeof this.grid != 'undefined') {
      this.grid.Hide(true);
      Main.layoutManager.removeChrome(this.grid.actor);
    }
  }

  //#endregion

  /**
   * Moves the UI to it's desired position based on it's current monitor;
   * @returns 
   */
  private MoveUIActor = () => {
    if (!this.visible) {
      return;
    }

    let window = this.focusMetaWindow;
    if (!window) return;
      let grid = this.grid;
      let pos_x: number;
      let pos_y: number;

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

  private updateRegions = () => {
    Main.layoutManager["_chrome"].updateRegions();
  }

  public OnFocusedWindowChanged = () => {
    let window = getFocusApp();
    if (!window) {
      this.ResetFocusedWindow();
      this.grid.topbar._set_title('gTile');
      return;
    }

    this.ResetFocusedWindow();

    this.focusMetaWindow = window;

    this.grid.ChangeCurrentMonitor(this.monitors[this.focusMetaWindow.get_monitor()]);

    let actor = this.focusMetaWindow.get_compositor_private();
    if (actor) {
      this.focusMetaWindowPrivateConnections.push(
        actor.connect(
          'size-changed',
          this.MoveUIActor
        )
      );
      this.focusMetaWindowPrivateConnections.push(
        actor.connect(
          'position-changed',
          this.MoveUIActor
        )
      );
    }

    let app = this.tracker.get_window_app(this.focusMetaWindow);
    let title = this.focusMetaWindow.get_title();

    if (app) this.grid.topbar._set_app(app, title);
    else this.grid.topbar._set_title(title);
    this.MoveUIActor();
  }


  /**
   * Disconnects from all subscribed events for the Previous Window
   */
   private ResetFocusedWindow = () => {
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
}

export let app: App;

/*****************************************************************
                            FUNCTIONS
*****************************************************************/
export const init = (meta: any) => {
  metadata = meta;
  imports.gi.Gtk.IconTheme.get_default().append_search_path(metadata.path + "/../icons");
}

export const enable = () => {
  app = new App();
  initSettings();
  app.InitGrid();
  app.EnableHotkey();
}

export const disable = () => {
  // Key Bindings
  app.destroy();
}