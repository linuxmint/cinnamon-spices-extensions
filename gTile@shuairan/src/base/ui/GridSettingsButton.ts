import { Column, Config, Row } from "../config";
import { App } from "../app";

const St = imports.gi.St;

export class GridSettingsButton {
    cols: Column[];
    rows: Row[];
    text: string;
    actor: imports.gi.St.Button;
    label: imports.gi.St.Label;
    private settings: Config;
    private app: App;
  
    constructor(app: App, settings: Config, text: string, cols: Column[], rows: Row[]) {
      this.app = app;
      this.settings = settings;
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
  
    public _onButtonPress = () => {
      this.settings.SetGridConfig(this.cols, this.rows);
      this.app.RefreshGrid();
      return false;
    }
  }