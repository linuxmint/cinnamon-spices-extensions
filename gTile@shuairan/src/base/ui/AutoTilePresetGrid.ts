import { App } from "../app";
import { addSignals } from "../utils";
import { ActionButton } from "./ActionButton";


@addSignals
export class AutoTilePresetGrid extends ActionButton<"resize-done"> {
  classname: string;
  private app: App;

  constructor(app: App) {
    super('action-preset-grid', "auto_tile_preset-symbolic");
    this.app = app;
    this.classname = 'action-preset-grid';
    this.connect(
      'button-press-event',
      this._onButtonPress
    );
  }

  protected override _onButtonPress = () => {
    if (!this.app.FocusMetaWindow)
      return false;

    const grid = this.app.CurrentGrid;
    if (!grid || !grid.elementsDelegate)
      return false;

    const delegate = grid.elementsDelegate;
    const monitor = this.app.CurrentMonitor;
    const others = this.app.GetNotFocusedWindowsOfMonitor(monitor);
    const windows = [this.app.FocusMetaWindow].concat(others);

    let wi = 0;
    for (let r = 0; r < grid.rows.length; r++) {
      for (let c = 0; c < grid.cols.length; c++) {
        if (wi >= windows.length)
          break;
        const el = grid.elements[r][c];
        const [x, y, w, h] = delegate.computeCellBounds(el);
        this.app.platform.reset_window(windows[wi]);
        this.app.platform.move_resize_window(windows[wi], x, y, w, h);
        wi++;
      }
    }

    this.emit('resize-done');
    return false;
  };
}
