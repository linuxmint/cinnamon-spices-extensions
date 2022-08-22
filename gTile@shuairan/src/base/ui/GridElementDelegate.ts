import { Config } from "../config";
import { App } from "../app";
import { addSignals, getMonitorKey, getUsableScreenArea, SignalOverload } from "../utils";
import { GridElement } from "./GridElement";
const Tweener = imports.ui.tweener;

export interface GridElementDelegate extends SignalOverload<"resize-done"> {}

@addSignals
export class GridElementDelegate {
  activated = false;
  first: GridElement | null = null;
  last: GridElement | null = null;
  currentElement: GridElement | null = null;
  activatedActors: GridElement[] | null = null;

  private settings: Config;
  private app: App;

  constructor(app: App) {
    this.app = app;
    this.settings = this.app.config;
  }

  private _allSelected = () => {
    return this.activatedActors?.length === (this.settings.nbCols.length * this.settings.nbRows.length);
  }

  public _onButtonPress(gridElement: GridElement, final: boolean) {
    if (final)
    {
      this.activated = true;
      if (this.first == null) {
        this.first = gridElement;
        this.activatedActors = [];
        this.activatedActors.push(gridElement);
        gridElement.actor.add_style_pseudo_class('activate');
        gridElement.active = true;
      }
    }
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
      this.app.platform.reset_window(this.app.FocusMetaWindow);

      let areaWidth, areaHeight, areaX, areaY;
      // First is never null here?
      [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(<GridElement>this.first, gridElement);

      if (this._allSelected()) {
        this.app.platform.move_maximize_window(this.app.FocusMetaWindow, areaX, areaY);
      } else {
        this.app.platform.move_resize_window(this.app.FocusMetaWindow, areaX, areaY, areaWidth, areaHeight);
      }

      this._resizeDone();
    }
  }

  private _resizeDone = () => {
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

    let grid = this.app.Grid;
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
    let nbRows = this.settings.nbRows;
    let nbCols = this.settings.nbCols;

    let monitor = fromGridElement.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);

    const widthUnit = screenWidth / nbCols.map(r => r.span).reduce((p, c) => p+=c);
    const heightUnit = screenHeight / nbRows.map(r => r.span).reduce((p, c) => p+=c);

    let areaWidth = 0;
    for (let index = minX; index <= maxX; index++) {
      const element = nbCols[index];
      areaWidth+= element.span * widthUnit;
    }

    let areaHeight = 0;
    for (let index = minY; index <= maxY; index++) {
      const element = nbRows[index];
      areaHeight+= element.span * heightUnit;
    }

    let areaX = screenX;
    for (let index = 0; index < minX; index++) {
      const element = nbCols[index];
      areaX+= element.span * widthUnit;
    }

    let areaY = screenY;
    for (let index = 0; index < minY; index++) {
      const element = nbRows[index];
      areaY+= element.span * heightUnit;
    }

    return [areaX, areaY, areaWidth, areaHeight];
  }

  private _displayArea = (fromGridElement: GridElement, toGridElement: GridElement) => {
    let areaWidth, areaHeight, areaX, areaY;
    [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(fromGridElement, toGridElement);

    this.app.area.add_style_pseudo_class('activate');

    if (this.settings.animation) {
      Tweener.addTween(this.app.area, {
        time: 0.2,
        x: areaX,
        y: areaY,
        width: areaWidth,
        height: areaHeight,
        transition: 'easeOutQuad'
      });
    } else {
      this.app.area.width = areaWidth;
      this.app.area.height = areaHeight;
      this.app.area.x = areaX;
      this.app.area.y = areaY;
    }
  }

  private _hideArea = () => {
    this.app.area.remove_style_pseudo_class('activate');
  }

  public _onHoverChanged = (gridElement: GridElement) => {
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
    this._hideArea();
  }
};