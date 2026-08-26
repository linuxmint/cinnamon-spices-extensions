import { Config } from "./config";
import { Grid } from "./ui/Grid";
import { IApp, Platform } from "./types";
import { getFocusApp, GetMonitorAspectRatio, GetMonitorCenter, getMonitorKey, objHasKey } from "./utils";
import { KEYCONTROL } from "./constants";

/*****************************************************************
                         CONST & VARS
*****************************************************************/
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const GLib = imports.gi.GLib;
let metadata: any;

export class App implements IApp {
  private visible = false;
  public readonly tracker = Cinnamon.WindowTracker.get_default();
  public readonly platform: Platform;
  private monitors = Main.layoutManager.monitors;
  private focusMetaWindowConnections: number[] = [];
  private focusMetaWindowPrivateConnections: number[] = [];
  private monitorsChangedId: number;

  public readonly area = new St.BoxLayout({ style_class: 'grid-preview' });

  public get CurrentMonitor() {
    return this.currentMonitor;
  }

  private currentMonitor: imports.ui.layout.Monitor = Main.layoutManager.primaryMonitor;

  private focusMetaWindow: imports.gi.Meta.Window | null = null;
  public get FocusMetaWindow() {
    return this.focusMetaWindow;
  }

  public get CurrentGrid(): Grid {
    const grid = this.grids.find(x => x.monitor.index == this.currentMonitor.index)!;
    return grid;
  }

  public get Grids(): Grid[] {
    return this.grids;
  }
  private grids: Grid[] = [];

  public readonly config: Config;

  constructor(platform: Platform) {
      this.platform = platform;
      Main.uiGroup.add_actor(this.area);
      this.config = new Config(this);
      this.InitGrid();
      this.tracker.connect("notify::focus-app", this.OnFocusedWindowChanged);
      global.screen.connect('monitors-changed', this.ReInitialize);
      // Capture the ID so we can disconnect later
      this.monitorsChangedId = global.screen.connect('monitors-changed', this.ReInitialize);
  }

  public destroy() {
    if (this.monitorsChangedId) {
        global.screen.disconnect(this.monitorsChangedId);
        // @ts-ignore
        this.monitorsChangedId = null;
    }
    this.config.destroy();
    this.DestroyGrid();
    this.ResetFocusedWindow();
  }

  public RefreshGrid = () => {
    for (const grid of this.grids) {
        grid.RefreshGridElements();
    }

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

    if (!this.config.showGridOnAllMonitors)
        this.CurrentGrid.ChangeCurrentMonitor(newMonitor);
    this.currentMonitor = newMonitor;
    this.MoveUIActor();
  }

  private ShowUI = () => {
    this.focusMetaWindow = getFocusApp();
    let wm_type = this.focusMetaWindow.get_window_type();
    let layer = this.focusMetaWindow.get_layer();

    this.area.visible = true;
    const window = this.focusMetaWindow;
    if (window != null && wm_type !== 1 && layer > 0) {
        for (const grid of this.grids) {

            if (!this.config.showGridOnAllMonitors)
                grid.ChangeCurrentMonitor(this.monitors.find(x => x.index == window.get_monitor()) ?? Main.layoutManager.primaryMonitor);

            const [pos_x, pos_y] = (!this.config.useMonitorCenter && grid.monitor.index == this.currentMonitor.index) ?  this.platform.get_window_center(window) : GetMonitorCenter(grid.monitor);

            grid.Show(Math.floor(pos_x - grid.actor.width / 2), Math.floor(pos_y - grid.actor.height / 2));

            this.OnFocusedWindowChanged();
            this.visible = true;
        }
    }

    this.MoveUIActor();
    this.BindKeyControls();
  }

  private HideUI = () => {
    this.RemoveKeyControls();
    for (const grid of this.grids) {
        grid.elementsDelegate.reset();
        grid.Hide(false);
    }

    this.area.visible = false;

    this.ResetFocusedWindow();

    this.visible = false;

    Main.layoutManager["_chrome"].updateRegions();
  }

  private BindKeyControls = () => {
    Main.keybindingManager.addHotKey('gTile-close', 'Escape', this.ToggleUI);
    Main.keybindingManager.addHotKey('gTile-tile1', 'space', () => this.CurrentGrid.BeginTiling());
    Main.keybindingManager.addHotKey('gTile-tile2', 'Return', () => this.CurrentGrid.BeginTiling());
    for (let index in KEYCONTROL) {
      if (objHasKey(KEYCONTROL, index)) {
        let key = KEYCONTROL[index];
        let type = index;
        Main.keybindingManager.addHotKey(
          type,
          key,
          () => this.CurrentGrid.OnKeyPressEvent(type, key)
        );
      }
    }
  }

  private RemoveKeyControls = () => {
    Main.keybindingManager.removeHotKey('gTile-close');
    Main.keybindingManager.removeHotKey('gTile-tile1');
    Main.keybindingManager.removeHotKey('gTile-tile2');
    for (let type in KEYCONTROL) {
      Main.keybindingManager.removeHotKey(type);
    }
  }

  //#region Init

  public ReInitialize = () => {
    this.monitors = Main.layoutManager.monitors;
    this.DestroyGrid();

    /**
     * Fix for Issue #512: Delay re-initialization to ensure the display driver
     * and compositor are ready after a monitor or power state change.
     */
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
      this.InitGrid();
      return GLib.SOURCE_REMOVE;
    });
  }

  public InitGrid() {
    this.currentMonitor = Main.layoutManager.primaryMonitor;
    const monitors = this.config.showGridOnAllMonitors ? this.monitors : [this.currentMonitor];
    this.RemoveKeyControls();
    this.grids = [];
    for (const monitor of monitors) {
        const grid = new Grid(this, monitor, 'gTile', this.config.nbCols, this.config.nbRows);

        Main.layoutManager.addChrome(grid.actor, { visibleInFullscreen: true });
        grid.actor.set_opacity(0);
        grid.Hide(true);
        grid.connect(
          'hide-tiling',
          this.HideUI
        );
        this.grids.push(grid);
    }
  }

  private DestroyGrid = () => {
    this.RemoveKeyControls();
    for (const grid of this.grids) {
      if (typeof grid !== 'undefined' && grid !== null) {
        grid.Hide(true);
        Main.layoutManager.removeChrome(grid.actor);
        // Explicitly destroy the grid instance to clear visual actors
        grid.destroy();
      }
    }
    this.grids = [];

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

    for (const grid of this.Grids) {
        const [newTableWidth, newTableHeight] = grid.GetTableSize();
        const gridWidth = grid.actor.width + (newTableWidth - grid.table.width);
        const gridHeight = grid.actor.height + (newTableHeight - grid.table.height);

        let pos_x: number;
        let pos_y: number;

        // Get center of where we want to be
        let monitor = grid.monitor;
        let isGridMonitor = window.get_monitor() === grid.monitor.index;
        if (isGridMonitor) {
            [pos_x, pos_y] = (!this.config.useMonitorCenter) ? this.platform.get_window_center(window) : GetMonitorCenter(monitor);
            pos_x = pos_x < monitor.x ? monitor.x : pos_x;
            pos_x = pos_x + gridWidth > monitor.width + monitor.x ? monitor.x + monitor.width - gridWidth : pos_x;
            pos_y = pos_y < monitor.y ? monitor.y : pos_y;
            pos_y = pos_y + gridHeight > monitor.height + monitor.y ? monitor.y + monitor.height - gridHeight : pos_y;
        } else {
            [pos_x, pos_y] = GetMonitorCenter(monitor);
        }

        // Offset by UI and window sizes
        pos_x = Math.floor(pos_x - gridWidth / 2);
        pos_y = Math.floor(pos_y - gridHeight / 2);

        grid.AdjustTableSize(newTableWidth, newTableHeight);

        Tweener.addTween(grid.actor, {
            time: this.config.AnimationTime,
            x: pos_x,
            y: pos_y,
            transition: 'easeOutQuad',
            onComplete: this.updateRegions
        });
    }
  }

  private updateRegions = () => {
    Main.layoutManager["_chrome"].updateRegions();
  }

  public OnFocusedWindowChanged = () => {
    let window = getFocusApp();
    if (!window) {
      this.ResetFocusedWindow();
      for (const grid of this.grids) {
        grid.topbar._set_title('gTile');
      }
      return;
    }

    this.ResetFocusedWindow();

    this.focusMetaWindow = window;

    if (!this.config.showGridOnAllMonitors)
        this.CurrentGrid.ChangeCurrentMonitor(this.monitors[this.focusMetaWindow.get_monitor()]);

    this.currentMonitor = this.monitors[this.focusMetaWindow.get_monitor()];

    this.focusMetaWindowPrivateConnections.push(
        ...this.platform.subscribe_to_focused_window_changes(this.focusMetaWindow, this.MoveUIActor)
    );

    let app = this.tracker.get_window_app(this.focusMetaWindow);
    let title = this.focusMetaWindow.get_title();

    if (app) {
        for (const grid of this.grids) {
            grid.topbar._set_app(app, title);
        }
    }
    else {
        for (const grid of this.grids) {
            grid.topbar._set_title(title);
        }
    }
    this.MoveUIActor();
  }

  public OnCenteredToWindowChanged = () => {
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

    if (this.focusMetaWindow != null && this.focusMetaWindowPrivateConnections.length > 0) {
      this.platform.unsubscribe_from_focused_window_changes(this.focusMetaWindow, ...this.focusMetaWindowPrivateConnections);
    }

    this.focusMetaWindow = null;
    this.focusMetaWindowConnections = [];
    this.focusMetaWindowPrivateConnections = [];
  }
}
