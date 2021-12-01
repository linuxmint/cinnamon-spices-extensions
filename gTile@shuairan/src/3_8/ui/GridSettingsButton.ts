import { preferences } from "../config";
import { app } from "../extension";

const St = imports.gi.St;

export class GridSettingsButton {
    cols: number;
    rows: number;
    text: string;
    actor: imports.gi.St.Button;
    label: imports.gi.St.Label;
  
    constructor(text: string, cols: number, rows: number) {
      this.cols = cols;
      this.rows = rows;
      this.text = text;
  
      this.actor = new St.Button({
        style_class: 'settings-button',
        reactive: true,
        can_focus: true,
        track_hover: true
      });
  
      this.label = new St.Label({
        style_class: 'settings-label',
        reactive: true, can_focus: true,
        track_hover: true,
        text: this.text
      });
  
      this.actor.add_actor(this.label);
  
      this.actor.connect(
        'button-press-event',
        this._onButtonPress
      );
    }
  
    private _onButtonPress = () => {
      preferences.nbCols = this.cols;
      preferences.nbRows = this.rows;
      app.refreshGrids();
      return false;
    }
  }