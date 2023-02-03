import { Column, Config, Row } from "../config";
import { KEYCONTROL, SETTINGS_ANIMATION, SETTINGS_AUTO_CLOSE } from "../constants";
import { addSignals, getAdjacentMonitor, GetMonitorAspectRatio, getMonitorKey, objHasKey, SignalOverload } from "../utils";
import { AutoTileMainAndList } from "./AutoTileMainAndList";
import { AutoTileTwoList } from "./AutoTileTwoList";
import { GridElement } from "./GridElement";
import { GridElementDelegate } from "./GridElementDelegate";
import { GridSettingsButton } from "./GridSettingsButton";
import { ToggleSettingsButton } from "./ToggleSettingsButton";
import { TopBar } from "./TopBar";
import { App } from "../app";

const { BoxLayout, Table, Bin } = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const { Side } = imports.gi.Meta;
const { Color } = imports.gi.Clutter;

export interface Grid extends SignalOverload<"hide-tiling"> {

}

@addSignals
export class Grid {
  tableWidth = 220;
  tableHeight = 200;
  panelBorderOffset = 40;
  borderwidth = 2;
  rowKey = -1;
  colKey = -1;

  actor: imports.gi.St.BoxLayout;
  topbar: TopBar;
  bottombar: imports.gi.St.Table;
  veryBottomBar: imports.gi.St.Table;
  table: imports.gi.St.BoxLayout;

  monitor: imports.ui.layout.Monitor;
  rows: Row[];
  title: string;
  cols: Column[];

  isEntered = false;

  x: number;
  y: number;
  interceptHide = false;

  normalScaleY: number;
  normalScaleX: number;

  elementsDelegate!: GridElementDelegate;
  elementsDelegateSignals: number[] = [];
  elements!: GridElement[][];
  keyElement?: GridElement | null;
  toggleSettingButtons: ToggleSettingsButton[] = [];

  app: App;
  panelWidth: number;

  constructor(app: App, monitor: imports.ui.layout.Monitor, title: string, cols: Column[], rows: Row[]) {
    this.app = app;
    this.tableHeight = 200;
    this.tableWidth = 220;
    this.panelBorderOffset = 40;
    this.panelWidth = (this.tableWidth + this.panelBorderOffset);
    this.borderwidth = 2;

    this.actor = new BoxLayout({
      vertical: true,
      style_class: 'grid-panel',
      reactive: true,
      can_focus: true,
      track_hover: true,
      width: this.panelWidth
    });


    this.actor.connect(
      'enter-event',
      this.OnMouseEnter
    );
    this.actor.connect(
      'leave-event',
      this.OnMouseLeave
    );

    this.topbar = new TopBar(this.app, title);

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

    this.table = new BoxLayout({
      style_class: 'table',
      can_focus: true,
      track_hover: true,
      reactive: true,
      vertical: true,
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

    let toggle = new ToggleSettingsButton(this.app.config, 'animation', SETTINGS_ANIMATION, "animation_black-symbolic");
    this.veryBottomBar.add(toggle.actor, { row: 0, col: 0, x_fill: false, y_fill: false });
    this.toggleSettingButtons.push(toggle);

    toggle = new ToggleSettingsButton(this.app.config, 'auto-close', SETTINGS_AUTO_CLOSE, "auto_close_black-symbolic");
    this.veryBottomBar.add(toggle.actor, { row: 0, col: 1, x_fill: false, y_fill: false });
    this.toggleSettingButtons.push(toggle);

    let action = new AutoTileMainAndList(this.app);
    this.veryBottomBar.add(action.actor, { row: 0, col: 2, x_fill: false, y_fill: false });

    action.connect('resize-done',
      this.OnResize
    );

    let actionTwo = new AutoTileTwoList(this.app);
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

  private GetTableUnits(width: number, height: number): [widthUnit: number, heightUnit: number] {
    const rowSpans = this.rows.map(r => r.span).reduce((p, c) => p+= c);
    const colSpans = this.cols.map(r => r.span).reduce((p, c) => p+= c);

    const widthUnit = width / colSpans - (2 * this.borderwidth);
    const heightUnit = height / rowSpans - (2 * this.borderwidth);

    return [Math.round(widthUnit), Math.round(heightUnit)];
  }

  public GetTableSize(): [width: number, height: number] {
    // Calculate new ui width and height in case we are moving to a different monitor
    // We retain the size and the aspect ratio of the new monitor 
    const aspect = GetMonitorAspectRatio(this.monitor);
    if (!this.app.config.aspectRatio) 
        return [220, 200];
    
    const newTableWidth = (aspect.widthIsLonger) ? 200 * aspect.ratio : 200;
    const newTableHeight = (aspect.widthIsLonger) ? 200 : 200 * aspect.ratio;

    return [newTableWidth, newTableHeight];
  }

  public AdjustTableSize = (width: number, height: number) => {
    this.tableWidth = width;
    this.tableHeight = height;
    this.panelWidth = (this.tableWidth + this.panelBorderOffset);
    const time = this.app.config.AnimationTime;
    Tweener.addTween(this.table, {
      time: time,
      width: width,
      height: height,
      transition: 'easeOutQuad',
    });
    Tweener.addTween(this.actor, {
      time: time,
      width: this.panelWidth,
      transition: 'easeOutQuad',
    });

    const [widthUnit, heightUnit] = this.GetTableUnits(width, height);

    for (let index = 0; index < this.elements.length; index++) {
      const row = this.elements[index];
      for (let j = 0; j < row.length; j++) {
        const element = row[j];
        const finalWidth = widthUnit * this.cols[j].span;
        const finalHeight = heightUnit * this.rows[index].span;
        Tweener.addTween(element.actor, {
          time: time,
          width: finalWidth,
          height: finalHeight,
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

    for (let index = 0; index < this.app.config.gridSettingsButton.length; index++) {
      if (colNum >= 4) {
        colNum = 0;
        rowNum += 2;
      }

      let button = this.app.config.gridSettingsButton[index];
      button = new GridSettingsButton(this.app, this.app.config, button.text, button.cols, button.rows);
      this.bottombar.add(button.actor, { row: rowNum, col: colNum, x_fill: false, y_fill: false });
      button.actor.connect(
        'notify::hover',
        () => this.elementsDelegate.reset()
      );
      colNum++;
    }
  }

  private Reset() {
    this.colKey = -1;
    this.rowKey = -1;
    this.keyElement = null;
    this.elementsDelegate.reset();
  }

  /**
   * Rebuilds Grid Elements, for example if nXn buttons sere clicked.
   */
  public RefreshGridElements = () => {
    this.table.destroy_all_children();
    this.cols = this.app.config.nbCols;
    this.rows = this.app.config.nbRows;
    // New grid is smaller than currently selected element, Reset selection
    if (this.cols.length <= this.colKey || this.rows.length <= this.colKey)
      this.Reset();

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
    let time = this.app.config.animation ? 0.3 : 0;

    Main.layoutManager.removeChrome(this.actor);
    Main.layoutManager.addChrome(this.actor);
    this.actor.scale_y = 0;
    if (time > 0) {
      await new Promise<void>((resolve) => {
        Tweener.addTween(this.actor, {
          time: time,
          opacity: 255,
          transition: 'easeOutQuad',
          scale_y: this.normalScaleY,
          onStart: () => this.actor.visible = true,
          onComplete: () => { resolve(); this.OnShowComplete() }
        });
      })
    } else {
      this.actor.opacity = 255;
      this.actor.visible = true;
      this.actor.scale_y = this.normalScaleY;
    }

    this.interceptHide = false;
  }

  public Hide(immediate: boolean) {
    this.Reset();
    let time = this.app.config.animation && !immediate ? 0.3 : 0;
    if (time > 0) {
      Tweener.addTween(this.actor, {
        time: time,
        opacity: 0,
        scale_y: 0,
        transition: 'easeOutQuad',
        onComplete: () => { this.actor.visible = false; this.OnHideComplete();}
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
    const [widthUnit, heightUnit] = this.GetTableUnits(this.tableWidth, this.tableHeight);

    this.elementsDelegateSignals.forEach(element => {
      this.elementsDelegate?.disconnect(element)
    });

    this.elementsDelegate?._destroy();
    this.elementsDelegate = new GridElementDelegate(this.app);
    this.elementsDelegateSignals = [];
    this.elementsDelegateSignals.push(this.elementsDelegate.connect(
      'resize-done',
      this.OnResize
    ));
    for (let r = 0; r < this.rows.length; r++) {
      const row = new BoxLayout();
      for (let c = 0; c < this.cols.length; c++) {
        if (c === 0) {
          this.elements[r] = [];
        }

        const finalWidth = widthUnit * this.cols[c].span;
        const finalHeight = heightUnit * this.rows[r].span;

        let element = new GridElement(this.app, this.monitor, this, finalWidth, finalHeight, c, r, this.elementsDelegate);
        this.elements[r][c] = element;
        // bin for better positioning for artificial margin
        const bin = new Bin();
        bin.add_actor(element.actor);
        row.add(bin, {expand: true});
      }
      this.table.add(row, {expand: true});
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
    this.app.RefreshGrid();
    if (this.app.config.autoclose) {
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
  public OnKeyPressEvent = (type: keyof typeof KEYCONTROL, key?: string) => {
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
        this.keyElement._onButtonPress(false);
      }
    } else if (this.keyElement) {
      this.elementsDelegate.reset();
    }

    switch (type) {
      case 'gTile-k-right':
      case 'gTile-k-right-meta':
        this.colKey = Math.min(this.colKey + 1, this.cols.length - 1);
        this.rowKey = this.rowKey === -1 ? 0 : this.rowKey; //leave initial state
        break;
      case 'gTile-k-left':
      case 'gTile-k-left-meta':
        // Nothing is selected yet and trying to got further left, abort
        if (this.colKey == -1)
          return;
        this.colKey = Math.max(0, this.colKey - 1);
        break;
      case 'gTile-k-up':
      case 'gTile-k-up-meta':
        // Nothing is selected yet and trying to got further up, abort
        if (this.rowKey == -1)
          return;
        this.rowKey = Math.max(0, this.rowKey - 1);
        break;
      case 'gTile-k-down':
      case 'gTile-k-down-meta':
        this.rowKey = Math.min(this.rowKey + 1, this.rows.length - 1);
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
        this.app.config.gridSettingsButton?.[0]?._onButtonPress();
        break;
      case 'gTile-k-second-grid':
        this.app.config.gridSettingsButton?.[1]?._onButtonPress();
        break;
      case 'gTile-k-third-grid':
        this.app.config.gridSettingsButton?.[2]?._onButtonPress();
        break;
      case 'gTile-k-fourth-grid':
        this.app.config.gridSettingsButton?.[3]?._onButtonPress();
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

  /**`
   * Commits to tiling the focused window.
   */
  public BeginTiling = () => {
    if (this.keyElement) {
      this.keyElement._onButtonPress(true);
      this.Reset();
    }
  }

  /**
   * Requests the app to move to a different monitor
   * @param monitor can be null, if so the current monitor will be used (for nothing)
   * @returns 
   */
  private MoveToMonitor = (monitor?: imports.ui.layout.Monitor) => {
    monitor = monitor ? monitor : this.app.CurrentMonitor;

    // Same monitor, abort
    if (monitor.index == this.app.CurrentMonitor.index)
      return;

    this.app.MoveToMonitor(this.app.CurrentMonitor, monitor ?? this.app.CurrentMonitor);
  }

  public destroy = (): void => {
    for (let r in this.elements) {
      for (let c in this.elements[r]) {
        this.elements[r][c]._destroy();
      }
    }

    this.elementsDelegate._destroy();
    // TODO: Check if needed
    // @ts-ignore
    this.topbar._destroy();
    this.Reset();
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