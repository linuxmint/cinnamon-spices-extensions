import { Preferences, preferences } from "../config";
import { TooltipKeys, TOOLTIPS } from "../constants";
import { CustomIcons } from "../types";
import { addSignals, objHasKey, SignalOverload } from "../utils";
const { Icon, IconType, Button } = imports.gi.St;
const Tooltips = imports.ui.tooltips;
const { IconTheme } = imports.gi.Gtk;

export interface ToggleSettingsButton extends SignalOverload<'update-toggle'> {}

@addSignals
export class ToggleSettingsButton {
  text: string;
  actor: imports.gi.St.Button;
  property: TooltipKeys | keyof Preferences

  private _tooltip?: imports.ui.tooltips.Tooltip;

  constructor(text: string, property: keyof Preferences | TooltipKeys, icon: CustomIcons) {
    this.text = text;
    this.actor = new Button({
      style_class: "menu-favorites-button",
      reactive: true,
      can_focus: true,
      track_hover: true,
      child: new Icon({
        icon_name: icon,
        icon_type: IconType.SYMBOLIC,
        icon_size: 24,
      })
    });
    this.property = property;
    this._update();
    this.actor.connect(
      'button-press-event',
      this._onButtonPress
    );
    this.connect(
      'update-toggle',
      this._update
    );

    if (objHasKey(TOOLTIPS, property)) {
      this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[property]);
    }
  }

  private _update = () => {
    if (objHasKey(preferences, this.property)) {
      this.actor.add_style_pseudo_class('activate');
    } else {
      this.actor.remove_style_pseudo_class('activate');
    }
  }

  private _onButtonPress = () => {
    if (!objHasKey(preferences, this.property))
      return false;

    // @ts-ignore
    preferences[this.property] = !preferences[this.property];
    this.emit('update-toggle');
    return false;
  }
};