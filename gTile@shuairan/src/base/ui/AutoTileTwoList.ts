import { App } from "../app";
import { addSignals, getUsableScreenArea } from "../utils";
import { ActionButton } from "./ActionButton";


@addSignals
export class AutoTileTwoList extends ActionButton<"resize-done"> {
  classname: string;
  private app: App;

  constructor(app: App) {
    super('action-two-list', "auto_tile_1-symbolic");
    this.app = app;
    this.classname = 'action-two-list';
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => {
    if (!this.app.FocusMetaWindow) return false;

    this.app.platform.reset_window(this.app.FocusMetaWindow);

    let monitor = this.app.CurrentMonitor;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = this.app.GetNotFocusedWindowsOfMonitor(monitor);
    let nbWindowOnEachSide = Math.ceil((windows.length + 1) / 2);
    let winHeight = screenHeight / nbWindowOnEachSide;

    let countWin = 0;

    let xOffset = ((countWin % 2) * screenWidth) / 2;
    let yOffset = Math.floor(countWin / 2) * winHeight;

    this.app.platform.move_resize_window(this.app.FocusMetaWindow, screenX + xOffset, screenY + yOffset, screenWidth / 2, winHeight);

    countWin++;

    for (let windowIdx in windows) {
      let metaWindow = windows[windowIdx];

      xOffset = ((countWin % 2) * screenWidth) / 2;
      yOffset = Math.floor(countWin / 2) * winHeight;

      this.app.platform.reset_window(metaWindow);

      this.app.platform.move_resize_window(metaWindow, screenX + xOffset, screenY + yOffset, screenWidth / 2, winHeight);
      countWin++;
    }

    this.emit('resize-done');
    return false;
  }
};