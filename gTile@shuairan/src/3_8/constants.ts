import { _ } from "./utils";

export const SETTINGS_AUTO_CLOSE = 'autoclose';
export const SETTINGS_ANIMATION = 'animation';

export type TooltipKeys = typeof SETTINGS_AUTO_CLOSE | typeof SETTINGS_ANIMATION | "action-main-list" | "action-two-list";
export type SettingKeys = 
    "hotkey" |
    "lastGridRows" |
    "lastGridCols" |
    "animation" |
    "autoclose" |
    "gridbutton1x" |
    "gridbutton1y" |
    "gridbutton2x" |
    "gridbutton2y" |
    "gridbutton3x" |
    "gridbutton3y" |
    "gridbutton4x" |
    "gridbutton4y";

export const TOOLTIPS: Record<TooltipKeys, string> = {
  [SETTINGS_AUTO_CLOSE]: _("Auto close"),
  [SETTINGS_ANIMATION]: _("Animations"),
  'action-main-list': _("Auto tile main and list"),
  'action-two-list': _("Auto tile two lists")
};

export const KEYCONTROL = {
  'gTile-k-left': 'Left',
  'gTile-k-right': 'Right',
  'gTile-k-up': 'Up',
  'gTile-k-down': 'Down',
  'gTile-k-left-meta': '<Shift>Left',
  'gTile-k-right-meta': '<Shift>Right',
  'gTile-k-up-meta': '<Shift>Up',
  'gTile-k-down-meta': '<Shift>Down',
  'gTile-k-left-monitor-move': '<Alt>Left',
  'gTile-k-right-monitor-move': '<Alt>Right',
  'gTile-k-up-monitor-move': '<Alt>Up',
  'gTile-k-down-monitor-move': '<Alt>Down',
  'gTile-k-first-grid': '1',
  'gTile-k-second-grid': '2',
  'gTile-k-third-grid': '3',
  'gTile-k-fourth-grid': '4',
};

/*let metaKey = '<Shift>';
for (let type in KEYCONTROL) {
  let key = KEYCONTROL[type];
  KEYCONTROL[type + '-meta'] = metaKey + key;
}*/