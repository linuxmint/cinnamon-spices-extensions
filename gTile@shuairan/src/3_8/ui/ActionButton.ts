import { TooltipKeys, TOOLTIPS } from "../constants";
import { addSignals, SignalOverload } from "../utils";
import { Grid } from "./Grid";
const Tooltips = imports.ui.tooltips;
const St = imports.gi.St;

export interface ActionButton<T extends string = ""> extends SignalOverload<T | "button-press-event"> {}

@addSignals
export class ActionButton<T extends string = ""> {
    grid: Grid;
    actor: imports.gi.St.Button;

    private _tooltip?: imports.ui.tooltips.Tooltip;

    constructor(grid: Grid, classname: TooltipKeys, icon: string) {
        this.grid = grid;
        this.actor = new St.Button({
            style_class: "settings-button",
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: new St.Icon({ 
                reactive: true,
                icon_name: icon,
                icon_size: 24,
                icon_type: St.IconType.SYMBOLIC,
                can_focus: true,
                track_hover: true 
            })
        });

        this.actor.connect(
            'button-press-event',
            this._onButtonPress
        );

        if (TOOLTIPS[classname]) {
            this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[classname]);
        }
    }

    protected _onButtonPress = () => {
        this.emit('button-press-event');
        return false;
    }
};