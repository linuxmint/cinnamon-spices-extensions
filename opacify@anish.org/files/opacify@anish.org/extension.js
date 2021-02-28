/*const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;*/
const Clutter = imports.gi.Clutter;
const Settings = imports.ui.settings;
const Tweener = imports.ui.tweener;
const Meta = imports.gi.Meta;

let beginGrabOpId;
let endGrabOpId;
let settings;

function init(metadata)
{
    settings = new SettingsHandler(metadata.uuid);
}

function SettingsHandler(uuid) {
    this._init(uuid);
}

SettingsHandler.prototype = {
    _init: function(uuid) {
	this.settings = new Settings.ExtensionSettings(this, uuid);
	this.settings.bindProperty(Settings.BindingDirection.IN, "opacity", "opacity", function(){});
	this.settings.bindProperty(Settings.BindingDirection.IN, "beginTime", "beginTime", function(){});
	this.settings.bindProperty(Settings.BindingDirection.IN, "beginEffect", "beginEffect", function(){});
	this.settings.bindProperty(Settings.BindingDirection.IN, "endTime", "endTime", function(){});
	this.settings.bindProperty(Settings.BindingDirection.IN, "endEffect", "endEffect", function(){});
    }
}

function onBeginGrabOp(display, screen, window, op) { 
    let actor = window.get_compositor_private(); 
    if (!actor) { return; }
    if ((op == Meta.GrabOp.MOVING) || (op == Meta.GrabOp.KEYBOARD_MOVING) || 
        (op == Meta.GrabOp.RESIZING_E) || (op == Meta.GrabOp.RESIZING_N) || 
        (op == Meta.GrabOp.RESIZING_NE) || (op == Meta.GrabOp.RESIZING_NW) ||
        (op == Meta.GrabOp.RESIZING_S) || (op == Meta.GrabOp.RESIZING_SE) ||
        (op == Meta.GrabOp.RESIZING_SW) || (op == Meta.GrabOp.RESIZING_W) ||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_E) || (op == Meta.GrabOp.KEYBOARD_RESIZING_N) ||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_NE) || (op == Meta.GrabOp.KEYBOARD_RESIZING_NW) ||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_S) || (op == Meta.GrabOp.KEYBOARD_RESIZING_SE) || 
        (op == Meta.GrabOp.KEYBOARD_RESIZING_SW) || (op == Meta.GrabOp.KEYBOARD_RESIZING_W)||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN))
    { 
        Tweener.addTween(actor, { 
        opacity: settings.opacity, 
        time: settings.beginTime/1000, 
        transition: settings.beginEffect }); 
    } 
}

function onEndGrabOp(display, screen, window, op) { 
    let actor = window.get_compositor_private(); 
    if (!actor) { return; }
    //if ((op == Meta.GrabOp.MOVING) || (op == Meta.GrabOp.KEYBOARD_MOVING)) 
    if ((op == Meta.GrabOp.MOVING) || (op == Meta.GrabOp.KEYBOARD_MOVING) || 
        (op == Meta.GrabOp.RESIZING_E) || (op == Meta.GrabOp.RESIZING_N) || 
        (op == Meta.GrabOp.RESIZING_NE) || (op == Meta.GrabOp.RESIZING_NW) ||
        (op == Meta.GrabOp.RESIZING_S) || (op == Meta.GrabOp.RESIZING_SE) ||
        (op == Meta.GrabOp.RESIZING_SW) || (op == Meta.GrabOp.RESIZING_W) ||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_E) || (op == Meta.GrabOp.KEYBOARD_RESIZING_N) ||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_NE) || (op == Meta.GrabOp.KEYBOARD_RESIZING_NW) ||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_S) || (op == Meta.GrabOp.KEYBOARD_RESIZING_SE) || 
        (op == Meta.GrabOp.KEYBOARD_RESIZING_SW) || (op == Meta.GrabOp.KEYBOARD_RESIZING_W)||
        (op == Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN))
    { 
        Tweener.addTween(actor, { 
        opacity: 255, 
        time: settings.endTime/1000, 
        transition: settings.endEffect }); 
    } 
}

/*
function onBeginGrabOp(display, screen, window, op) {
    let compositor = window.get_compositor_private();
	Tweener.addTween(compositor, { 
		opacity: settings.opacity,
		time: settings.beginTime/1000,
		transition: settings.beginEffect
    });
}
*/

/*
function onEndGrabOp(display, screen, window, op) {
    let compositor = window.get_compositor_private();
	Tweener.addTween(compositor, { 
		opacity: 255,
		time: settings.endTime/1000,
		transition: settings.endEffect
    });
}
*/

function enable() 
{
	beginGrabOpId = global.display.connect('grab-op-begin', onBeginGrabOp);
	endGrabOpId = global.display.connect('grab-op-end', onEndGrabOp);
}

function disable() 
{
    global.display.disconnect(beginGrabOpId);
    global.display.disconnect(endGrabOpId);
}
