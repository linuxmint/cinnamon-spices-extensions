import { gridSettingsButton, preferences } from "../config";
import { KEYCONTROL, SETTINGS_ANIMATION, SETTINGS_AUTO_CLOSE } from "../constants";
import { app } from "../extension";
import { addSignals, getAdjacentMonitor, getMonitorKey, objHasKey, SignalOverload } from "../utils";
import { AutoTileMainAndList } from "./AutoTileMainAndList";
import { AutoTileTwoList } from "./AutoTileTwoList";
import { GridElement } from "./GridElement";
import { GridElementDelegate } from "./GridElementDelegate";
import { GridSettingsButton } from "./GridSettingsButton";
import { ToggleSettingsButton } from "./ToggleSettingsButton";
import { TopBar } from "./TopBar";

const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const { Side } = imports.gi.Meta;

export interface Grid extends SignalOverload<"hide-tiling"> {

}

@addSignals
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
  toggleSettingButtons: ToggleSettingsButton[] = [];

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

      let toggle = new ToggleSettingsButton('animation', SETTINGS_ANIMATION);
      toggle.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(toggle.actor, { row: 0, col: 0, x_fill: false, y_fill: false });
      this.toggleSettingButtons.push(toggle);

      toggle = new ToggleSettingsButton('auto-close', SETTINGS_AUTO_CLOSE);
      toggle.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(toggle.actor, { row: 0, col: 1, x_fill: false, y_fill: false });
      this.toggleSettingButtons.push(toggle);

      let action = new AutoTileMainAndList(this);
      action.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(action.actor, { row: 0, col: 2, x_fill: false, y_fill: false });

      action.connect('resize-done',
        this._onResize
      );

      let actionTwo = new AutoTileTwoList(this);
      actionTwo.actor.width = this.tableWidth / nbTotalSettings - this.borderwidth * 2;
      this.veryBottomBar.add(actionTwo.actor, { row: 0, col: 3, x_fill: false, y_fill: false });

      actionTwo.connect('resize-done',
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

  public SwitchToMonitor(monitor: imports.ui.layout.Monitor) {
    this.monitor = monitor;
    this.monitor_idx = monitor.index;

    for (const row of this.elements) {
      for (const element of row) {
        element.monitor = this.monitor;
      }
    }
  }

  public UpdateSettingsButtons() {
    for (const button of this.toggleSettingButtons) {
      button["_update"]();
    }
  }

  public _initGridSettingsButtons = () => {
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
    this.elementsDelegate.connect(
      'resize-done',
      this._onResize
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

  public async show() {
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
          onComplete: () => { resolve(); this._onShowComplete()}
        });
      })
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
    app.refreshGrids();
    if (preferences.autoclose) {
      this.emit('hide-tiling');
    }
  }

  private _onMouseEnter = () => {
    if (!this.isEntered) {
      this.elementsDelegate.reset();
      this.isEntered = true;
    }
    return false;
  }

  private _onMouseLeave = () => {
    let [x, y, mask] = global.get_pointer();
    if ((this.elementsDelegate && (x <= this.actor.x || x >= this.actor.x + this.actor.width)) || (y <= this.actor.y || y >= this.actor.y + this.tableHeight + this.topbar.actor.height)) {
      this.isEntered = false;
      this.elementsDelegate.reset();

      app.refreshGrids();
    }
    return false;
  }

  private _globalKeyPressEvent = (actor: imports.gi.Clutter.Actor, event: imports.gi.Clutter.Event) => {
    if (event.get_key_symbol() === Clutter.Escape) {
      app.hideTiling();
      return true;
    }
    return false;
  }

  private _onSettingsButton = () => {
    this.elementsDelegate.reset();
  }

  private _bindKeyControls = () => {
    Main.keybindingManager.addHotKey('gTile-close', 'Escape', app.toggleTiling);
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

  private _onKeyPressEvent = (type: keyof typeof KEYCONTROL, key?: string) => {
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
      case 'gTile-k-left-alt':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.LEFT));
        break;
      case 'gTile-k-right-alt':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.RIGHT));
        break;
      case 'gTile-k-up-alt':
        this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.TOP));
        break;
      case 'gTile-k-down-alt':
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

  private MoveToMonitor = (monitor?: imports.ui.layout.Monitor) => {
    let key = monitor ? getMonitorKey(monitor) : getMonitorKey(this.monitor);
    let currentKey = getMonitorKey(this.monitor);

    // Same monitor, abort
    if (key == currentKey)
      return;

    app.MoveToMonitor(this.monitor, monitor ?? this.monitor);
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