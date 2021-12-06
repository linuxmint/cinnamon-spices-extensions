import { app } from "../extension";

const St = imports.gi.St;

export class TopBar {
    actor: imports.gi.St.BoxLayout;
    private _title: string;
    private _stlabel: imports.gi.St.Label;
    private _iconBin: imports.gi.St.Bin;
    private _closeButton: imports.gi.St.Button;
    private _icon?: imports.gi.Clutter.Actor;
  
    constructor(title: string) {
      this.actor = new St.BoxLayout({ style_class: 'top-box' });
      this._title = title;
      this._stlabel = new St.Label({ style_class: 'grid-title', text: this._title });
      this._iconBin = new St.Bin({ x_fill: false, y_fill: true });
      this._closeButton = new St.Button({ style_class: 'close-button' });
  
      this._closeButton.connect(
        'button-release-event',
        this._onCloseButtonClicked
      );
  
      this.actor.add(this._iconBin);
      this.actor.add(this._stlabel, { x_fill: true, expand: true });
      this.actor.add(this._closeButton, { x_fill: false, expand: false });
    }
  
    public _set_title(title: string) {
      this._title = title;
      this._stlabel.text = this._title;
    }
  
    public _set_app(app: imports.gi.Cinnamon.App, title: string) {
      this._title = app.get_name() + ' - ' + title;
      this._stlabel.text = this._title;
      this._icon = app.create_icon_texture(24);
  
      this._iconBin.set_size(24, 24);
      // TODO: proper null check
      this._iconBin.set_child(<imports.gi.St.Icon>this._icon);
    }
  
    private _onCloseButtonClicked = () => {
      app.ToggleUI();
      return false;
    }
  }