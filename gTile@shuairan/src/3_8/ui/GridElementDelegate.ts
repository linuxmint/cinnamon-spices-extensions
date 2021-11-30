import { area, focusMetaWindow, getMonitorKey, getUsableScreenArea, grids, move_maximize_window, move_resize_window, preferences, reset_window } from "../extension";
import { addSignals, SignalOverload } from "../utils";
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

  constructor() { }

  private _allSelected = () => {
    return this.activatedActors?.length === (preferences.nbCols * preferences.nbRows);
  }

  public _onButtonPress(gridElement: GridElement) {
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
      reset_window(focusMetaWindow);

      let areaWidth, areaHeight, areaX, areaY;
      // First is never null here?
      [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(<GridElement>this.first, gridElement);

      if (this._allSelected()) {
        move_maximize_window(focusMetaWindow, areaX, areaY);
      } else {
        move_resize_window(focusMetaWindow, areaX, areaY, areaWidth, areaHeight);
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

    let key = getMonitorKey(fromGridElement.monitor);
    let grid = grids[key];
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
    let nbRows = preferences.nbRows;
    let nbCols = preferences.nbCols;

    let monitor = fromGridElement.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);

    let areaWidth = (screenWidth / nbCols) * (maxX - minX + 1);
    let areaHeight = (screenHeight / nbRows) * (maxY - minY + 1);
    let areaX = screenX + minX * (screenWidth / nbCols);
    let areaY = screenY + minY * (screenHeight / nbRows);

    return [areaX, areaY, areaWidth, areaHeight];
  }

  private _displayArea = (fromGridElement: GridElement, toGridElement: GridElement) => {
    let areaWidth, areaHeight, areaX, areaY;
    [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(fromGridElement, toGridElement);

    area.add_style_pseudo_class('activate');

    if (preferences.animation) {
      Tweener.addTween(area, {
        time: 0.2,
        x: areaX,
        y: areaY,
        width: areaWidth,
        height: areaHeight,
        transition: 'easeOutQuad'
      });
    } else {
      area.width = areaWidth;
      area.height = areaHeight;
      area.x = areaX;
      area.y = areaY;
    }
  }

  private _hideArea = () => {
    area.remove_style_pseudo_class('activate');
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
  }
};