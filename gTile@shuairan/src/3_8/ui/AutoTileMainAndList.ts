import { app } from "../extension";
import { addSignals, getUsableScreenArea, move_resize_window, reset_window, SignalOverload } from "../utils";
import { ActionButton } from "./ActionButton";
import { Grid } from "./Grid";

@addSignals
export class AutoTileMainAndList extends ActionButton<"resize-done"> {
  classname: string;

  constructor(grid: Grid) {
    super(grid, 'action-main-list', 'action-main-list');
    this.classname = 'action-main-list';
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => {
    if (!app.FocusMetaWindow) return false;

    reset_window(app.FocusMetaWindow);

    let monitor = this.grid.monitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = app.GetNotFocusedWindowsOfMonitor(monitor);

    move_resize_window(app.FocusMetaWindow, screenX, screenY, screenWidth / 2, screenHeight);

    let winHeight = screenHeight / windows.length;
    let countWin = 0;

    for (let windowIdx in windows) {
      let metaWindow = windows[windowIdx];

      let newOffset = countWin * winHeight;

      reset_window(metaWindow);

      move_resize_window(metaWindow, screenX + screenWidth / 2, screenY + newOffset, screenWidth / 2, winHeight);
      countWin++;
    }

    this.emit('resize-done');
    return false;
  }
};