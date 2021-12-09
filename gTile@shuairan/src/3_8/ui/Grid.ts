import { gridSettingsButton, preferences } from "../config";
import { KEYCONTROL, SETTINGS_ANIMATION, SETTINGS_AUTO_CLOSE } from "../constants";
import { app } from "../extension";
import { addSignals, getAdjacentMonitor, GetMonitorAspectRatio, getMonitorKey, objHasKey, SignalOverload } from "../utils";
import { ActionButton } from "./ActionButton";
import { AutoTileMainAndList } from "./AutoTileMainAndList";
import { AutoTileTwoList } from "./AutoTileTwoList";
import { GridElement } from "./GridElement";
import { GridElementDelegate } from "./GridElementDelegate";
import { GridSettingsButton } from "./GridSettingsButton";
import { ToggleSettingsButton } from "./ToggleSettingsButton";
import { TopBar } from "./TopBar";

const { BoxLayout, Table } = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const { Side } = imports.gi.Meta;

export interface Grid extends SignalOverload<"hide-tiling"> {

}

@addSignals
export class Grid {
  tableWidth = 220;
  tableHeight = 200;
  borderwidth = 2;
  rowKey = -1;
  colKey = -1;

  actor: imports.gi.St.BoxLayout;
  topbar: TopBar;
  bottombar: imports.gi.St.Table;
  veryBottomBar: imports.gi.St.Table;
  table: imports.gi.St.Table;

  monitor: imports.ui.layout.Monitor;
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
  toggleSettingButtons: ToggleSettingsButton[] = [];

  constructor(monitor: imports.ui.layout.Monitor, title: string, cols: number, rows: number) {
    this.tableHeight = 200;
    this.tableWidth = 220;
    this.borderwidth = 2;
    this.rowKey = -1;
    this.colKey = -1;

    this.actor = new BoxLayout({
      vertical: true,
      style_class: 'grid-panel',
      reactive: true,
      can_focus: true,
      track_hover: true
    });


    this.actor.connect(
      'enter-event',
      this.OnMouseEnter
    );
    this.actor.connect(
      'leave-event',
      this.OnMouseLeave
    );

    this.topbar = new TopBar(title);

    this.bottombar = new Table({
      homogeneous: true,
      style_class: 'bottom-box',
      can_focus: true,
      track_hover: true,
      reactive: true,
    });

    this.veryBottomBar = new Table({
      homogeneous: true,
      style_class: 'bottom-box very-bottom-box',
      can_focus: true,
      track_hover: true,
      reactive: true,
    });

    this.RebuildGridSettingsButtons();

    this.table = new Table({
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
    this.actor.add(this.bottombar, { x_fill: false });
    this.actor.add(this.veryBottomBar, { x_fill: false });

    this.monitor = monitor;
    this.rows = rows;
    this.title = title;
    this.cols = cols;

    this.isEntered = false;

    // Build Bottom Bar Buttons

    let toggle = new ToggleSettingsButton('animation', SETTINGS_ANIMATION, "animation_black-symbolic");
    this.veryBottomBar.add(toggle.actor, { row: 0, col: 0, x_fill: false, y_fill: false });
    this.toggleSettingButtons.push(toggle);

    toggle = new ToggleSettingsButton('auto-close', SETTINGS_AUTO_CLOSE, "auto_close_black-symbolic");
    this.veryBottomBar.add(toggle.actor, { row: 0, col: 1, x_fill: false, y_fill: false });
    this.toggleSettingButtons.push(toggle);

    let action = new AutoTileMainAndList(this);
    this.veryBottomBar.add(action.actor, { row: 0, col: 2, x_fill: false, y_fill: false });

    action.connect('resize-done',
      this.OnResize
    );

    let actionTwo = new AutoTileTwoList(this);
    this.veryBottomBar.add(actionTwo.actor, { row: 0, col: 3, x_fill: false, y_fill: false });

    actionTwo.connect('resize-done',
      this.OnResize
    );

    this.x = 0;
    this.y = 0;

    this.interceptHide = false;

    this.RebuildGridElements();

    this.normalScaleY = this.actor.scale_y;
    this.normalScaleX = this.actor.scale_x;
  }

  /**
   * Changes all references to the current monitor to a new one,
   * including GridElements
   * @param monitor 
   */
  public ChangeCurrentMonitor(monitor: imports.ui.layout.Monitor) {
    this.monitor = monitor;

    for (const row of this.elements) {
      for (const element of row) {
        element.monitor = this.monitor;
      }
    }
  }

  public AdjustTableSize = (time: number, width: number, height: number) => {
    this.tableWidth = width;
    this.tableHeight = height;
    Tweener.addTween(this.table, {
      time: time,
      width: width,
      height: height,
      transition: 'easeOutQuad',
    });
    for (const row of this.elements) {
      for (const element of row) {
        Tweener.addTween(element.actor, {
          time: time,
          width: (width / this.cols - 2 * this.borderwidth),
          height: (height / this.rows - 2 * this.borderwidth),
          transition: 'easeOutQuad',
        });
      }
    }
  }

  /**
   * Update ToggleSettingsButtons, for example when 
   * settings was changed for them
   */
  public UpdateSettingsButtons() {
    for (const button of this.toggleSettingButtons) {
      button["_update"]();
    }
  }

  /** Rebuilds Grid Settings Buttons independently from 
   * the rest of the UI. FOr example if config was changed for them.
   */
  public RebuildGridSettingsButtons = () => {
    this.bottombar.destroy_children();

    let rowNum = 0;
    let colNum = 0;

    for (let index = 0; index < gridSettingsButton.length; index++) {
      if (colNum >= 4) {
        colNum = 0;
        rowNum += 2;
      }

      let button = gridSettingsButton[index];
      button = new GridSettingsButton(button.text, button.cols, button.rows);
      this.bottombar.add(button.actor, { row: rowNum, col: colNum, x_fill: false, y_fill: false });
      button.actor.connect(
        'notify::hover',
        () => this.elementsDelegate.reset()
      );
      colNum++;
    }
  }

  /**
   * Rebuilds Grid Elements, for example if nXn buttons sere clicked.
   */
  public RefreshGridElements = () => {
    this.table.destroy_all_children();
    this.cols = preferences.nbCols;
    this.rows = preferences.nbRows;
    this.RebuildGridElements();
  }

  /**
   * Show the Grid UI.
   */
  public async Show(): Promise<void>;
  /**
   * Shows the Grid UI at a specific position.
   * @param x 
   * @param y 
   */
  public async Show(x: number, y: number): Promise<void>;
  public async Show(x?: number, y?: number): Promise<void> {
    if (x != null && y != null)
      this.SetPosition(x, y);

    this.interceptHide = true;
    this.elementsDelegate.reset();
    let time = preferences.animation ? 0.3 : 0;

    this.actor.raise_top();
    Main.layoutManager.removeChrome(this.actor);
    Main.layoutManager.addChrome(this.actor);
    this.actor.scale_y = 0;
    if (time > 0) {
      await new Promise<void>((resolve) => {
        Tweener.addTween(this.actor, {
          time: time,
          opacity: 255,
          visible: true,
          transition: 'easeOutQuad',
          scale_y: this.normalScaleY,
          onComplete: () => { resolve(); this.OnShowComplete() }
        });
      })
    } else {
      this.actor.opacity = 255;
      this.actor.visible = true;
      this.actor.scale_y = this.normalScaleY;
    }

    this.interceptHide = false;
    this.BindKeyControls();
  }

  public Hide(immediate: boolean) {
    this.RemoveKeyControls();
    this.elementsDelegate.reset();
    let time = preferences.animation && !immediate ? 0.3 : 0;
    if (time > 0) {
      Tweener.addTween(this.actor, {
        time: time,
        opacity: 0,
        visible: false,
        scale_y: 0,
        transition: 'easeOutQuad',
        onComplete: this.OnHideComplete
      });
    } else {
      this.actor.opacity = 0;
      this.actor.visible = false;
      this.actor.scale_y = 0;
    }
  }

  /**
   * Rebuilds Grid Elements, called when nXn configs have changed.
   */
  private RebuildGridElements = () => {
    this.elements = [];

    let width = this.tableWidth / this.cols - 2 * this.borderwidth;
    let height = this.tableHeight / this.rows - 2 * this.borderwidth;

    this.elementsDelegate = new GridElementDelegate();
    this.elementsDelegate.connect(
      'resize-done',
      this.OnResize
    );
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (c === 0) {
          this.elements[r] = [];
        }

        let element = new GridElement(this.monitor, width, height, c, r, this.elementsDelegate);
        this.elements[r][c] = element;
        this.table.add(element.actor, { row: r, col: c, x_fill: false, y_fill: false });
        element.show();
      }
    }
  }

  private BindKeyControls = () => {
    Main.keybindingManager.addHotKey('gTile-close', 'Escape', app.ToggleUI);
    Main.keybindingManager.addHotKey('gTile-tile1', 'space', this.BeginTiling);
    Main.keybindingManager.addHotKey('gTile-tile2', 'Return', this.BeginTiling);
    for (let index in KEYCONTROL) {
      if (objHasKey(KEYCONTROL, index)) {
        let key = KEYCONTROL[index];
        let type = index;
        Main.keybindingManager.addHotKey(
          type,
          key,
          () => this.OnKeyPressEvent(type, key)
        );
      }
    }
  }

  private RemoveKeyControls = () => {
    this.rowKey = -1;
    this.colKey = -1;
    Main.keybindingManager.removeHotKey('gTile-close');
    Main.keybindingManager.removeHotKey('gTile-tile1');
    Main.keybindingManager.removeHotKey('gTile-tile2');
    for (let type in KEYCONTROL) {
      Main.keybindingManager.removeHotKey(type);
    }
  }

  //#region Events
  /**
   * Called when Hide animation is complete
   */
  private OnHideComplete = () => {
    if (!this.interceptHide && this.actor) {
      Main.layoutManager.removeChrome(this.actor);
    }

    Main.layoutManager["_chrome"].updateRegions();
  }

  /**
   * Called when Show animation is complete
   */
  private OnShowComplete = () => {
    Main.layoutManager["_chrome"].updateRegions();
  }

  private OnResize = () => {
    app.RefreshGrid();
    if (preferences.autoclose) {
      this.emit('hide-tiling');
    }
  }

  /**
   * Handles when the mouse enters the UI. Resets the Grid Overlay on the monitor.
   * @returns 
   */
  private OnMouseEnter = () => {
    if (!this.isEntered) {
      this.elementsDelegate.reset();
      this.isEntered = true;
    }
    return false;
  }

  /**
   * Handles when the mouse leaves the UI. Resets grid overlay on monitor. 
   * @returns 
   */
  private OnMouseLeave = () => {
    let [x, y, mask] = global.get_pointer();
    if ((this.elementsDelegate && (x <= this.actor.x || x >= this.actor.x + this.actor.width)) || (y <= this.actor.y || y >= this.actor.y + this.tableHeight + this.topbar.actor.height)) {
      this.isEntered = false;
      this.elementsDelegate.reset();
    }
    return false;
  }

  /**
   * Handles KeyPresses for the shown Grid.
   * @param type 
   * @param key 
   */
  private OnKeyPressEvent = (type: keyof typeof KEYCONTROL, key?: string) => {
    let modifier = false;
    switch (type) {
      case 'gTile-k-right-meta':
      case 'gTile-k-left-meta':
      case 'gTile-k-up-meta':
      case 'gTile-k-down-meta':
      case 'gTile-k-right-monitor-move':
      case 'gTile-k-left-monitor-move':
      case 'gTile-k-up-monitor-move':
      case 'gTile-k-down-monitor-move':
        modifier = true;
        break;
    }


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
        this.colKey = Math.min(this.colKey + 1, this.cols - 1);
        this.rowKey = this.rowKey === -1 ? 0 : this.rowKey; //leave initial state
        break;
      case 'gTile-k-left':
      case 'gTile-k-left-meta':
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
      case 'gTile-k-left-monitor-move':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.LEFT));
        break;
      case 'gTile-k-right-monitor-move':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.RIGHT));
        break;
      case 'gTile-k-up-monitor-move':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.TOP));
        break;
      case 'gTile-k-down-monitor-move':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.BOTTOM));
        break;
      case 'gTile-k-first-grid':
        gridSettingsButton?.[0]?._onButtonPress();
        break;
      case 'gTile-k-second-grid':
        gridSettingsButton?.[1]?._onButtonPress();
        break;
      case 'gTile-k-third-grid':
        gridSettingsButton?.[2]?._onButtonPress();
        break;
      case 'gTile-k-fourth-grid':
        gridSettingsButton?.[3]?._onButtonPress();
        break;
    }
    this.keyElement = this.elements[this.rowKey] ? this.elements[this.rowKey][this.colKey] : null;
    if (this.keyElement)
      this.keyElement._onHoverChanged();
  }

  //#endregion

  //#region Utils

  /**
   * Force Set position of current grid, this only really need to be used
   * when the grid is shown from a hidden state 
   */
  private SetPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.actor.set_position(x, y);
  }

  /**
   * Commits to tiling the focused window.
   */
  private BeginTiling = () => {
    if (this.keyElement) {
      this.keyElement._onButtonPress();
      this.colKey = -1;
      this.rowKey = -1;
    }
  }

  /**
   * Requests the app to move to a different monitor
   * @param monitor can be null, if so the current monitor will be used (for nothing)
   * @returns 
   */
  private MoveToMonitor = (monitor?: imports.ui.layout.Monitor) => {
    monitor = monitor ? monitor : this.monitor;

    // Same monitor, abort
    if (monitor.index == this.monitor.index)
      return;

    app.MoveToMonitor(this.monitor, monitor ?? this.monitor);
  }

  public destroy = () => {
    for (let r in this.elements) {
      for (let c in this.elements[r]) {
        this.elements[r][c]._destroy();
      }
    }

    this.elementsDelegate._destroy();
    // TODO: Check if needed
    // @ts-ignore
    this.topbar._destroy();
    this.RemoveKeyControls();
    // @ts-ignore
    this.monitor = null;
    // @ts-ignore
    this.rows = null;
    // @ts-ignore
    this.title = null;
    // @ts-ignore
    this.cols = null;
  }

  //#endregion
};