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
      this._closeButton = new St.Button({
        style:"padding:0;",
        opacity: 128,
        child: new St.Icon({
          icon_type: St.IconType.SYMBOLIC,
          icon_size: 24,
          icon_name: "window-close"
        })
      });

      this._closeButton.connect('notify::hover', () => { this._closeButton.opacity = this._closeButton.hover ? 255 : 128; });
  
      this._closeButton.connect(
        'button-release-event',
        this._onCloseButtonClicked
      );
  
      this.actor.add(this._iconBin);
      this.actor.add(this._stlabel, { x_fill: true, expand: true, y_align: St.Align.MIDDLE, y_fill: true });
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
      this._iconBin.set_child(this._icon);
    }
  
    private _onCloseButtonClicked = () => {
      app.ToggleUI();
      return false;
    }
  }