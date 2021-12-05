import { Preferences, preferences } from "../config";
import { TooltipKeys, TOOLTIPS } from "../constants";
import { addSignals, objHasKey, SignalOverload } from "../utils";
const St = imports.gi.St;
const Tooltips = imports.ui.tooltips;

export interface ToggleSettingsButton extends SignalOverload<'update-toggle'> {}

@addSignals
export class ToggleSettingsButton {
  text: string;
  actor: imports.gi.St.Button;
  icon: imports.gi.St.BoxLayout;
  property: TooltipKeys | keyof Preferences

  private _tooltip?: imports.ui.tooltips.Tooltip;

  constructor(text: string, property: keyof Preferences | TooltipKeys) {
    this.text = text;
    this.actor = new St.Button({
      //style_class: 'settings-button',
      reactive: true,
      can_focus: true,
      track_hover: true,
      label: this.text
    });
    this.icon = new St.BoxLayout({ style_class: this.text + '-icon', reactive: true, can_focus: true, track_hover: true });
    this.actor.set_child(this.icon);
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