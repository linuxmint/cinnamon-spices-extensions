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

// globally unique strings, set in init()
let tweenOpacity;
let originalOpacity;
// (nerdy note: we could have used the same string for both purposes!
// but that'd be needlessly confusing)

// opacity getter and setter for Tweener
function getWindowOpacity(window, params, extra) {
    return window.get_opacity();
}

function setWindowOpacity(window, value, params, extra) {
    window.set_opacity(value);
}

function init(metadata)
{
    settings = new SettingsHandler(metadata.uuid);
    
    // globally unique strings:
    tweenOpacity = "tween_opacity@" + metadata.uuid;
    originalOpacity = "original_opacity@" + metadata.uuid;
    
    // tell Tweener to call our set/get functions instead of setting opacity directly
    Tweener.registerSpecialProperty(tweenOpacity, getWindowOpacity, setWindowOpacity);
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
    this.settings.bindProperty(Settings.BindingDirection.IN, "opacityKeep", "opacityKeep", function(){});
    }
}

// onStart and onComplete handlers for Tweener
function windowSaveOriginalOpacity() {
    if (!(originalOpacity in this))
        this[originalOpacity] = this.get_opacity();
}

function windowDeleteOriginalOpacity() {
    delete this[originalOpacity];
}

// window grab handler
function onBeginGrabOp(display, screen, window, op) {
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
        // change opacity according to user's preference
        Tweener.addTween(window, { 
            [tweenOpacity]: settings.opacity, 
            time: settings.beginTime/1000, 
            transition: settings.beginEffect,
            onStart: windowSaveOriginalOpacity,
        }); 
    } 
}

// window release handler
function onEndGrabOp(display, screen, window, op) {
    if (!window || !(originalOpacity in window) || settings.opacityKeep === 'true') return; // releasing a window we haven't touched or maintaining the opacity indefinitely
    
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
        // restore opacity to what it was before
        Tweener.addTween(window, { 
            [tweenOpacity]: window[originalOpacity], 
            time: settings.endTime/1000, 
            transition: settings.endEffect,
            onComplete: windowDeleteOriginalOpacity,
        });
    } 
}

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
