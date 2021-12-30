import { app } from "../extension";
import { isFinalized } from "../utils";
import { GridElementDelegate } from "./GridElementDelegate";
const Main = imports.ui.main;
const St = imports.gi.St;

export class GridElement {
    actor: imports.gi.St.Button;
    monitor: imports.ui.layout.Monitor;
    coordx: number;
    coordy: number;
    width: number;
    height: number;
    active: boolean;
    delegate: GridElementDelegate;

    constructor(monitor: imports.ui.layout.Monitor, width: number, height: number, coordx: number, coordy: number, delegate: GridElementDelegate) {
        this.actor = new St.Button({
            style_class: 'table-element',
            width: width,
            height: height,
            reactive: true,
            can_focus: true,
            track_hover: true
        });

        this.actor.visible = false;
        this.actor.opacity = 0;
        this.monitor = monitor;
        this.coordx = coordx;
        this.coordy = coordy;
        this.width = width;
        this.height = height;
        this.delegate = delegate;

        this.actor.connect(
            'button-press-event',
            this._onButtonPress
        );
        this.actor.connect(
            'notify::hover',
            this._onHoverChanged
        );

        this.active = false;
    }

    public show = () => {
        this.actor.opacity = 255;
        this.actor.visible = true;
    }

    public hide = () => {
        this.actor.opacity = 0;
        this.actor.visible = false;
    }

    public _onButtonPress = () => {
        this.delegate._onButtonPress(this);
        return false;
    }

    public _onHoverChanged = () => {
        if (!this.actor || isFinalized(this.actor)) return;

        this.delegate._onHoverChanged(this);
        return false;
    }

    public _activate = () => {
        if (!this.actor || isFinalized(this.actor)) return;
        this.actor.add_style_pseudo_class('activate');
    }

    public _deactivate = () => {
        if (!this.actor || isFinalized(this.actor)) return;
        this.actor.remove_style_pseudo_class('activate');
    }

    public _clean = () => {
        Main.uiGroup.remove_actor(app.area);
    }

    public _destroy = () => {
        // @ts-ignore
        this.monitor = null;
        // @ts-ignore
        this.coordx = null;
        // @ts-ignore
        this.coordy = null;
        // @ts-ignore
        this.width = null;
        // @ts-ignore
        this.height = null;
        // @ts-ignore
        this.active = null;
    }
}