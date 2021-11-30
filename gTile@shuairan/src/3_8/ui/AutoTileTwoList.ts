import { focusMetaWindow, getNotFocusedWindowsOfMonitor, getUsableScreenArea, move_resize_window, reset_window } from "../extension";
import { addSignals } from "../utils";
import { ActionButton } from "./ActionButton";
import { Grid } from "./Grid";


@addSignals
export class AutoTileTwoList extends ActionButton<"resize-done"> {
  classname: string;

  constructor(grid: Grid) {
    super(grid, 'action-two-list');
    this.classname = 'action-two-list';
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => {
    if (!focusMetaWindow) return false;

    reset_window(focusMetaWindow);

    let monitor = this.grid.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = getNotFocusedWindowsOfMonitor(monitor);
    let nbWindowOnEachSide = Math.ceil((windows.length + 1) / 2);
    let winHeight = screenHeight / nbWindowOnEachSide;

    let countWin = 0;

    let xOffset = ((countWin % 2) * screenWidth) / 2;
    let yOffset = Math.floor(countWin / 2) * winHeight;

    move_resize_window(focusMetaWindow, screenX + xOffset, screenY + yOffset, screenWidth / 2, winHeight);

    countWin++;

    for (let windowIdx in windows) {
      let metaWindow = windows[windowIdx];

      xOffset = ((countWin % 2) * screenWidth) / 2;
      yOffset = Math.floor(countWin / 2) * winHeight;

      reset_window(metaWindow);

      move_resize_window(metaWindow, screenX + xOffset, screenY + yOffset, screenWidth / 2, winHeight);
      countWin++;
    }

    this.emit('resize-done');
    return false;
  }
};