import { Config } from "./config";
import { Grid } from "./ui/Grid";
import { IApp, Platform } from "./types";
import { getFocusApp, GetMonitorAspectRatio, getMonitorKey } from "./utils";

/*****************************************************************
                         CONST & VARS
*****************************************************************/
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
let metadata: any;

export class App implements IApp {
  private visible = false;
  public readonly tracker = Cinnamon.WindowTracker.get_default();
  public readonly platform: Platform;
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

  public readonly config: Config;

  constructor(platform: Platform) {
      this.platform = platform;
      Main.uiGroup.add_actor(this.area);
      this.config = new Config(this);
      this.InitGrid();
      this.tracker.connect("notify::focus-app", this.OnFocusedWindowChanged);
      global.screen.connect('monitors-changed', this.ReInitialize);
  }

  public destroy() {
    this.config.destroy();
    this.DestroyGrid();
    this.ResetFocusedWindow();
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

      const [pos_x, pos_y] = this.platform.get_window_center(window);

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
    this.grid = new Grid(this, Main.layoutManager.primaryMonitor, 'gTile', this.config.nbCols, this.config.nbRows);

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
    if (!window) 
      return;
    
    let grid = this.grid;
    // Calculate new ui width and height in case we are moving to a different monitor
    // We retain the size and the aspect ratio of the new monitor 
    const aspect = GetMonitorAspectRatio(grid.monitor);
    const newTableWidth = (aspect.widthIsLonger) ? 200 * aspect.ratio : 200;
    const newTableHeight = (aspect.widthIsLonger) ? 200 : 200 * aspect.ratio;
    const gridWidth = grid.actor.width + (newTableWidth - grid.table.width);
    const gridHeight = grid.actor.height + (newTableHeight - grid.table.height);


    let pos_x: number;
    let pos_y: number;

    // Get center of where we want to be
    let monitor = grid.monitor;
    let isGridMonitor = window.get_monitor() === grid.monitor.index;
    if (isGridMonitor) {
      [pos_x, pos_y] = this.platform.get_window_center(window);
    } else {
      pos_x = monitor.x + monitor.width / 2;
      pos_y = monitor.y + monitor.height / 2;
    }

    // Offset by UI and window sizes
    pos_x = Math.floor(pos_x - gridWidth / 2);
    pos_y = Math.floor(pos_y - gridHeight / 2);

    if (isGridMonitor) {
      pos_x = pos_x < monitor.x ? monitor.x : pos_x;
      pos_x = pos_x + gridWidth > monitor.width + monitor.x ? monitor.x + monitor.width - gridWidth : pos_x;
      pos_y = pos_y < monitor.y ? monitor.y : pos_y;
      pos_y = pos_y + gridHeight > monitor.height + monitor.y ? monitor.y + monitor.height - gridHeight : pos_y;
    }

    let time = this.config.animation ? 0.3 : 0.1;   

    grid.AdjustTableSize(time, newTableWidth, newTableHeight);

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