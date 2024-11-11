//    "Slider" extension for Cinnamon.
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
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Tweener = imports.ui.tweener;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Settings = imports.ui.settings;
const ExpoThumbnail = imports.ui.expoThumbnail;
const Overview = imports.ui.overview;
const Workspace = imports.ui.workspace;
const Expo = imports.ui.expo;
const Config = imports.misc.config;
const MessageTray = imports.ui.messageTray;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;

const majorVersion = parseInt(Config.PACKAGE_VERSION.split(".")[0]);

const UUID = "slider@mohammad-sn";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(text) {
  let locText = Gettext.dgettext(UUID, text);
  if (locText == text) {
    locText = window._(text);
  }
  return locText;
}

let newSlider = null;
let TIME = 0.5;
let SLIP_FACTOR = 0;
let ANIMATIONEXPO = false;

function sliderEasing(t, b, c, d) {
    let x = t / d;
    return Math.pow(x, 0.08) * (1 - Math.sin(Math.PI / 2 * Math.pow((1 - x), 3.3))) * c + b;
}

let EASING = sliderEasing;

// original source of this function: see https://git.gnome.org/browse/gnome-shell-extensions/tree/extensions/windowsNavigator/extension.js?h=gnome-3-10#n11
function injectToFunction(parent, name, func) {
	let origin = parent[name];
	parent[name] = function() {
		let ret;
		ret = origin.apply(this, arguments);
		/*if (ret === undefined)
		ret = */func.apply(this, arguments);
		return ret;
	}
	return origin;
}

function injectoTFunction(parent, name, func) {
	let origin = parent[name];
	parent[name] = function() {
		let ret;
		func.apply(this, arguments);
		ret = origin.apply(this, arguments);
		return ret;
	}
	return origin;
}

function Slider(metadata) {
    this._init(metadata);
}

Slider.prototype = {
    _init: function(metadata) { 
        this.meta = metadata;
        if (global.window_manager.switchWorkspaceId) this.oid = global.window_manager.switchWorkspaceId;
        else this.oid = this._guessHandlerID();
        
        this.settings = new Settings.ExtensionSettings(this, "slider@mohammad-sn");
        this.settings.bindProperty(Settings.BindingDirection.IN, "animation-duration",  "animation_duration",   this._pass_params, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "animation-effect",    "animation_effect",     this._pass_params, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "slip-factor",         "slip_factor",          this._pass_params, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "zoom-level",          "zoom_level",           this._onBackgroundSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "sliding-background",  "sliding_background",   this._onBackgroundSettingsChanged, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, "vertical-position",   "vertical_position",    this._set_y, null);
    },

    disable: function() {
        if (this.id) {
            global.window_manager.disconnect(this.id);
            global.window_manager.switchWorkspaceId = global.window_manager.connect('switch-workspace', Lang.bind(Main.wm, Main.wm._switchWorkspace));
            if (Main.wm.image) {
                Main.wm.backbin.remove_actor(Main.wm.image);
                Main.wm.image.destroy();
                delete Main.wm.image;
            }
            if (Main.wm.backbin) {
                Main.uiGroup.remove_actor(Main.wm.backbin);
                Main.wm.backbin.destroy();
                delete Main.wm.backbin;
            }
            if (this.bgsettingsId) this.bgsettings.disconnect(this.bgsettingsId);
            if (this.orig_animateVisible) Overview.Overview.prototype['_animateVisible'] = this.orig_animateVisible;
            if (this.orig_animateNotVisible) Overview.Overview.prototype['_animateNotVisible'] = this.orig_animateNotVisible;
            if (this.orig_expo_animateVisible) Expo.Expo.prototype['_animateVisible'] = this.orig_expo_animateVisible;
            if (this.orig_expo_animateNotVisible) Expo.Expo.prototype['_animateNotVisible'] = this.orig_expo_animateNotVisible;
            if (this.orig_init) ExpoThumbnail.ExpoWorkspaceThumbnail.prototype['_init'] = this.orig_init;
            if (this.orig_new_for_screen) Meta.BackgroundActor.new_for_screen = this.orig_new_for_screen;
        }
    },
    
    enable: function() {
        if (majorVersion >= 4) {
            let source = new MessageTray.Source(this.meta.name);
            let notification = new MessageTray.Notification(source, _("ERROR") + ": " + _("Slider was NOT enabled"),
               _("This extension is currently incompatible with your version of Cinnamon."),
               {icon: new St.Icon({icon_name: "dialog-warning", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE })}
               );
            Main.messageTray.add(source);
            source.notify(notification);
            return;
        }
        if (this.oid) {
            global.window_manager.disconnect(this.oid);
            this.id = global.window_manager.connect('switch-workspace', Lang.bind(Main.wm, mySwitcher));
            this.bgsettings = new Gio.Settings({ schema: "org.cinnamon.desktop.background" });
            this.bgsettingsId = this.bgsettings.connect('changed', Lang.bind(this, this._onBackgroundSettingsChanged));
            
            this.orig_animateVisible = injectToFunction(Overview.Overview.prototype, '_animateVisible', function(){ 
                this._desktopBackground.hide();
                Main.wm.backbin.lower(global.overlay_group);
                Tweener.addTween(Main.wm.backbin,
                    { scale_x: 0.918,
                      scale_y: 0.918,
                      x: 0.041 * Main.wm.backbin.width + Main.wm.backbin.x,
                      y: 0.041 * Main.wm.backbin.height + Main.wm.backbin.y,
                      time: 0.25,
                      transition: 'easeOutQuad'
                });
            });
            this.orig_animateNotVisible = injectToFunction(Overview.Overview.prototype, '_animateNotVisible', function(){ 
                let back = Main.uiGroup.get_children()[0];
                Main.wm.backbin.raise(back);
                Tweener.addTween(Main.wm.backbin,
                    { scale_x: 1,
                      scale_y: 1,
                      x: -0.045 * global.screen_width,
                      y: -0.045 * global.screen_height,
                      time: 0.25,
                      transition: 'easeOutQuad'
                });
            });
            this.orig_expo_animateVisible = injectToFunction(Expo.Expo.prototype, '_animateVisible', function(){ 
                this._background.hide();
                let back = Main.uiGroup.get_children()[0];
                this._bigBackground = Clutter.Clone.new(back);
                global.overlay_group.add_actor(this._bigBackground);
                this._bigBackground.lower_bottom();
            });
            this.orig_expo_animateNotVisible = injectToFunction(Expo.Expo.prototype, '_animateNotVisible', function(){ 
                global.overlay_group.remove_actor(this._bigBackground);
                this._bigBackground.destroy();
            });
            this.orig_init = injectToFunction(ExpoThumbnail.ExpoWorkspaceThumbnail.prototype, '_init', function(){ 
                let background = this.background.get_children()[0];
                background.y = Main.wm.image.y + Main.wm.backbin.y;
                let n = global.screen.get_n_workspaces() - 1;
                if (n) background.x = Main.wm.backbin.x + (Main.wm.backbin.width  - Main.wm.image.get_transformed_size()[0]) / n * this.metaWorkspace.index();
            });
            this.orig_new_for_screen = Meta.BackgroundActor.new_for_screen;
            Meta.BackgroundActor.new_for_screen = function(){ 
                let back = Clutter.Clone.new(Main.wm.image);
                back.set_scale(Main.wm.image.scale_x, Main.wm.image.scale_y);
                return back;
            };
            
            this.nget = 0;
            this._pass_params();
            this._onBackgroundSettingsChanged();
        }
        else{
            Util.spawnCommandLine("notify-send -i dialog-warning 'Slider: Somthing went wrong... :(' 'Slider extension failed to initialize! You might be using an incompatible version of Cinnamon. You can disable Slider in System Settings > Extensions.'"); 
        }
    },
    
    _guessHandlerID: function() {
        /* Tries to guess the handler ID for 'switch-workspace' signal connected to Main.wm._switchWorkspace.
         * See '/usr/share/cinnamon/js/ui/{main.js, layout.js, windowManager.js}'.
         * In Cinnamon 2.6.7 third connection made for global.window_manager is connected to Main.wm._switchWorkspace.
         */
        let i = 0, seq = 0, oid = 0;
        let ids = new Array(12);
        while (i < 13) {
            oid++;
            if (GObject.signal_handler_is_connected(global.window_manager, oid)) {
                ids[i] = oid;
                if (i && (ids[i] - ids[i - 1]) < 3) seq++;
                else seq = 0;
                if (seq == 11 && i == 12) return ids[2];
                i++;
            }
        }
        return false;
    },
    
    _onBackgroundSettingsChanged: function() {
        if (this.sliding_background) {
            if (this.nget == 0) {
                this.nget = 1;
                if (Main.wm.image)
                    this.oldimage = Main.wm.image; 
                this.uri = this.bgsettings.get_string("picture-uri");
                Main.wm.image = St.TextureCache.get_default().load_uri_async(this.uri, -1, -1);
                Main.wm.image.ok = false;
                
                this._get_detail_then_set();
            }
        }
        else if (Main.wm.image) {
            Main.wm.image.ok = false;
            Main.uiGroup.remove_actor(Main.wm.image);
            Main.wm.image.destroy();
        }
    },
    
    _get_detail_then_set: function() {
        if (this.nget < 50) {
                let w = Main.wm.image.width;
                if (w == 0) {
                    this.nget++;
                    Mainloop.timeout_add(40, Lang.bind(this, this._get_detail_then_set));
                }
                else{
                    this.image_width = w;
                    this.image_height = Main.wm.image.height;
                    this.set();
                    this._set_y();
                }
        }
        else{
            global.log('Slider: Failed to set wallpaper! :(');
            global.log('Slider: Please try restarting Cinnamon or changing desktop background...')
        }
    },
    
    set: function() {
        if (!Main.wm.backbin) {
            Main.wm.backbin = new St.Group();
            Main.wm.backbin.set_size(global.screen_width * 1.09, global.screen_height * 1.09);
            Main.uiGroup.add_actor(Main.wm.backbin);
            Main.wm.backbin.x = -0.045 * global.screen_width;
            Main.wm.backbin.y = -0.045 * global.screen_height;
        }
        
        let back = Main.uiGroup.get_children()[0];
        let aw = this.zoom_level * Main.wm.backbin.width;
        this.rzoom = aw / this.image_width;
        if (this.rzoom < 1)
            Main.wm.image = St.TextureCache.get_default().load_uri_async(this.uri, aw, -1);
        else if (this.rzoom > 1) 
            Main.wm.image.set_scale(this.rzoom, this.rzoom);
        
        Main.wm.backbin.add_actor(Main.wm.image);
        Main.wm.backbin.raise(back);
        
        let n = global.screen.get_n_workspaces() - 1;
        if (n) Main.wm.image.x = (Main.wm.backbin.width - aw) / n * global.screen.get_active_workspace_index();
        if (this.oldimage) {
            this.oldimage.disconnect(this.oldimage.cId);
            Tweener.addTween(this.oldimage,
                    { opacity: 0,
                      time: 0.4,
                      transition: 'linear',
                      onComplete: Lang.bind(this, function() {
                        Main.uiGroup.remove_actor(this.oldimage);
                        this.oldimage.destroy();
                      })
            });
        }
        this.nget = 0;
        Main.wm.image.ok = true;
//        Main.wm.image.clones = [];
//        Main.wm.image.cId = Main.wm.image.connect('notify::x', function(actor, event){
//            for (let i = 0; i < Main.wm.image.clones.length; i++){
//                if (Main.wm.image.clones[i]._static !== undefined) continue;
//                Main.wm.image.clones[i].x = Main.wm.image.x;
//            }
//        });
    },
    
    _set_y: function() {
        let ah = this.image_height * this.rzoom;
        let sh = Main.wm.backbin.height;
        Main.wm.image.y = (sh - ah) * this.vertical_position;
    },
    
    _pass_params: function() {
        SLIP_FACTOR = this.slip_factor;
        TIME = this.animation_duration / 1000;
        EASING = this.animation_effect;
        if (EASING == "Slider")
            EASING = sliderEasing;
    },
}

function mySwitcher(cinnamonwm, from, to, direction) {
    let xx = -global.screen_width * SLIP_FACTOR;
    if (this.image && this.image.ok) {
        xx = (Main.wm.backbin.width - this.image.get_transformed_size()[0] / Main.wm.backbin.scale_x) / (global.screen.get_n_workspaces() - 1);
        if (!this._shouldAnimate() && !Main.overview._shown) this.image.x = xx * to;

        Tweener.addTween(this.image,
                { x: xx * to,
                  time: TIME,
                  transition: EASING
        });
    }
    
    if (!this._shouldAnimate()) {
        cinnamonwm.completed_switch_workspace();
        return;
    }

    let windows = global.get_window_actors();
    let xDest = xx * (to - from) * (1 + SLIP_FACTOR);
    let nto = 1;

    for (let i = 0; i < windows.length; i++) {
        let window = windows[i];
        if (!window.meta_window.showing_on_its_workspace()) continue;
        
        if ((window.meta_window == this._movingWindow) ||
            ((global.display.get_grab_op() == Meta.GrabOp.MOVING ||
              global.display.get_grab_op() == Meta.GrabOp.KEYBOARD_MOVING)
              && window.meta_window == global.display.get_focus_window())) {
            window.show_all();
            this._movingWindow == undefined;
        }
        else if (window.get_workspace() == from) {
            if(window.current_effect_name){
                Main.wm._endWindowEffect(global.window_manager, window.current_effect_name, window);
            }
            if (window.origX == undefined) {
                if (!Tweener.isTweening(window) || !window.orig_opacity) window.orig_opacity = window.opacity;
                window.origX = window.x;
            }
            Tweener.addTween(window,
                { x: window.origX + xDest,
                  opacity: 0,
                  time: TIME,
                  transition: EASING,
                  onComplete: function() {
                    window.hide();
                    window.set_position(window.origX, window.y);
                    window.origX = undefined;
                    window.opacity = window.orig_opacity;
                    window.set_scale(1, 1);
                }
            });
        } 
        else if (window.get_workspace() == to) {
            let ntoxDest = xDest * (1 + SLIP_FACTOR * nto);
            if (window.origX == undefined) {
                if (!Tweener.isTweening(window) || !window.orig_opacity) window.orig_opacity = window.opacity;
                window.origX = window.x;
                window.set_position(window.origX - ntoxDest, window.y);
            }
            window.opacity = 0;
            Tweener.addTween(window,
                { x: window.origX,
                  opacity: window.orig_opacity,
                  time: TIME,
                  transition: EASING,
                  onComplete: function() {
                    window.origX = undefined;
                  }
            });
            window.show_all();
            if (nto < 4) nto += 1 / nto ;
            else nto = Math.random() + 1;
        }
    }

    Mainloop.timeout_add(TIME * 1000, function() {
        cinnamonwm.completed_switch_workspace();
    });
}

function init(metadata) { newSlider = new Slider(metadata); }
function enable() { newSlider.enable(); }
function disable() { newSlider.disable(); }
