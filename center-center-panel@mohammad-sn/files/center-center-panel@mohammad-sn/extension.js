//    "Center Center Panel" extension for Cinnamon.
//    Copyright (C) 2015  Mohammad S. Nasrabadi <mohammad@azeribalasi.com>

//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.

//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.

//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;

let newCenterPanelExt = null;

function CenterPanelExt(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

CenterPanelExt.prototype = {
    _init: function(metadata, orientation, panel_height, instanceId) {
        
        this.settings = new Settings.ExtensionSettings(this, "center-center-panel@mohammad-sn");
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-width", "maxWidthPercent", this.settingsChanged, null);

        this._panel = Main.panel._centerBox;

        this.pw = Main.panel.actor.get_width();
        this.maxWidth = this.maxWidthPercent * this.pw / 100;
        this.srl = null;
        this.srr = null;
        this.rw = 0;
        this.lw = 0;
    },

    disable: function() {
        Main.panel.actor.disconnect(this.pcm);
        
        Main.panel._leftBox.disconnect(this.srl);
        Main.panel._rightBox.disconnect(this.srr);
        this._panel.set_margin_right(0);
        this._panel.set_margin_left(0);
        this.settings.finalize();
    },

    enable: function() {
        this.pcm = Main.panel.actor.connect('button-press-event', Lang.bind(this, this._onButtonPressEvent));
        this.srl = Main.panel._leftBox.connect('allocation-changed', Lang.bind(this, this._do));
        this.srr = Main.panel._rightBox.connect('allocation-changed', Lang.bind(this, this._do));
        this._do();
    },

    settingsChanged: function() {
        this.maxWidth = this.maxWidthPercent * this.pw / 100;
        this._do();
    },

    _do : function(actor, event) {
        this.lw = Main.panel._leftBox.get_width();
        this.rw = Main.panel._rightBox.get_width();
        if (this.lw > this.maxWidth || this.rw > this.maxWidth) { this._panel.set_margin_left(0); this._panel.set_margin_right(0); return; } //FIXME:birden?!
        this.nm = this.lw - this.rw;
        if (this.nm > 0) { this._panel.set_margin_right(this.nm); this._panel.set_margin_left(0); }
        else if (this.nm < 0) { this._panel.set_margin_left(-this.nm); this._panel.set_margin_right(0); }
        else { this._panel.set_margin_left(0); this._panel.set_margin_right(0); }
    },

    _onButtonPressEvent: function (actor, event) {

        if (event.get_button()==1){
            if (Main.panel._context_menu.isOpen) {
                Main.panel._context_menu.toggle();
            }
        }
        if (event.get_button()==3){
            let [x, y] = event.get_coords();
            let rm = this.nm > 0 ? this.nm : 0;
            let lm = this.nm < 0 ? -this.nm : 0;
            let xmaxr = (this.pw - this.rw);
            let xminr = (this.pw - this.rw - rm);
            let xminl = (this.lw);
            let xmaxl = (this.lw + lm);
            if ((x < xmaxr && x >= xminr) || (x >= xminl && x < xmaxl)){
                Main.panel._context_menu.toggle();
                if (!Main.panel._context_menu.isOpen) {
                    return;
                }
                x -= Main.panel._context_menu._boxPointer._arrowOrigin;

                let monitor = Main.layoutManager.findMonitorForActor(Main.panel._context_menu._boxPointer.actor);

                let mywidth = Main.panel._context_menu._boxPointer.actor.get_allocation_box().x2-Main.panel._context_menu._boxPointer.actor.get_allocation_box().x1;//Width of menu

                if (x + mywidth - monitor.x > monitor.width) {
                    x  = monitor.width + monitor.x - mywidth;
                }
                if (x < monitor.x) {
                    x = monitor.x;
                }
                Main.panel._context_menu._boxPointer._xpos = Math.round(x);
                Main.panel._context_menu._boxPointer._xPosition = Main.panel._context_menu._boxPointer._xpos;
                Main.panel._context_menu._boxPointer._shiftActor();
            }
        }
        return;
    },
}

function init(metadata) { newCenterPanelExt = new CenterPanelExt(metadata); }
function enable() { newCenterPanelExt.enable(); }
function disable() { newCenterPanelExt.disable(); }

