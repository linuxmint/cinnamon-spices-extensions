//    "Smart Panel" extension for Cinnamon.
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

const Cvc = imports.gi.Cvc;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const Meta = imports.gi.Meta
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Tooltips = imports.ui.tooltips;
const Util = imports.misc.util;
const Cinnamon = imports.gi.Cinnamon;
const Gio = imports.gi.Gio
const ExtensionSystem = imports.ui.extensionSystem;

const CoverflowSwitcher = imports.ui.appSwitcher.coverflowSwitcher;
const TimelineSwitcher = imports.ui.appSwitcher.timelineSwitcher;
const ClassicSwitcher = imports.ui.appSwitcher.classicSwitcher;
const AppSwitcher = imports.ui.appSwitcher.appSwitcher;

const {
  _sourceIds,
  timeout_add_seconds,
  timeout_add,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  source_exists,
  source_remove,
  remove_all_sources
} = require("./mainloopTools");


let newSmartPanelExt = null;

function SmartPanelExt(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

SmartPanelExt.prototype = {
    _init: function(metadata, orientation, panel_height, instanceId) {

        this._control = null;
        this.settings = new Settings.ExtensionSettings(this, "smart-panel@mohammad-sn");
        this.settings.bind("scroll-action"     , "scrl_action", this._onScrollActionChanged);
        this.settings.bind("sep-scroll-action" , "sep_acts", this._onScrollSettingsChanged);
        this.settings.bind("scroll-action-up"  , "scrl_up_action",   null);
        this.settings.bind("scroll-action-down", "scrl_down_action", null);
        this.settings.bind("dblclck-action"    , "dblclck_action",   null);
        this.settings.bind("mdlclck-action"    , "mdlclck_action",   null);
        this.settings.bind("use-gestures"      , "use_gestures",     null);
        this.settings.bind("to-left-action"    , "to_left",  null);
        this.settings.bind("to-right-action"   , "to_right", null);
        this.settings.bind("vert-out-action"   , "vert_out", null);
        this.settings.bind("cc1-action"        , "cc1",      null);
        this.settings.bind("cc2-action"        , "cc2",      null);
        this.settings.bind("cc3-action"        , "cc3",      null);
        this.settings.bind("prev-fast-scroll"  , "no_fast_scroll",   null);
        this.settings.setValue("show-osd", global.settings.get_boolean('workspace-osd-visible'));
        this.settings.bind("show-osd"       , "show_osd",   this._onShowOSDChanged, null);
        this.settings.bind("scroll-delay"      , "scroll_delay",     null);
        this.settings.bind("appswitcher-style" , "switcher_style",   null);
        this.settings.bind("appswitcher-scope" , "switcher_scope",   null);
        this.settings.bind("scope-modified"    , "switcher_modified", null);
        this.settings.bind("appswitcher-modifier", "switcher_modifier", null);
        this._onShowOSDChanged();
        global.settings.connect("changed::workspace-osd-visible", () => { this.show_osd = global.settings.get_boolean('workspace-osd-visible') });

        this.cwm_settings = new Gio.Settings({ schema: "org.cinnamon.desktop.wm.preferences" });

        // schema location has changed around 5.4, do a try catch for maximum compatibility
        try {
            this.mos_settings = new Gio.Settings({ schema: "org.cinnamon.settings-daemon.peripherals.mouse" });
        }
        catch(e) {
            if (e.message == "GSettings schema org.cinnamon.settings-daemon.peripherals.mouse not found") {
                this.mos_settings = new Gio.Settings({ schema: "org.cinnamon.desktop.peripherals.mouse" });
            }
        }

        this.muf_settings = new Gio.Settings({ schema: "org.cinnamon.muffin" });

        //this._panel = Main.panel._centerBox;
        this._panel = Main.panel.actor;

        this._lastScroll = Date.now();
        this.dblb = false;
        this.dblb_T = this.mos_settings.get_int('double-click');
    },

    _onShowOSDChanged : function() {
        global.settings.set_boolean('workspace-osd-visible', this.show_osd);
    },

    _onScrollActionChanged : function() {
        if (this.scrl_action != "none") this.sep_acts = false;
    },

    _onScrollSettingsChanged : function() {
        if (this.sep_acts == true ) this.scrl_action = "none";
    },

    disable: function() {
        this.is_disabled = true;
        if (this._control != null)
            this._control.close();
        remove_all_sources();
        // FIXME: These lines make Cinnamon unstable!
        //~ if (this.sr != null) this._panel.disconnect(this.sr);
        //~ if (this.en != null) this._panel.disconnect(this.en);
        //~ if (this.lv != null) this._panel.disconnect(this.lv);
        //~ if (this.bp != null) this._panel.disconnect(this.bp);
        //~ if (this.br != null) this._panel.disconnect(this.br);
    },

    enable: function() {
        this._panel.reactive = true;
        this.is_disabled = false;
        //~ this.sr = this._panel.connect('scroll-event'        , Lang.bind(this, this._onScroll));
        //~ this.en = this._panel.connect('enter-event'         , Lang.bind(this, this._onEntered));
        //~ this.lv = this._panel.connect('leave-event'         , Lang.bind(this, this._onLeave));
        //~ this.bp = this._panel.connect('button-press-event'  , Lang.bind(this, this._onButtonPress));
        //~ this.br = this._panel.connect('button-release-event', Lang.bind(this, this._onButtonRelease));
        this.sr = this._panel.connect('scroll-event'        , (actor, event) => { this._onScroll(actor, event) });
        this.en = this._panel.connect('enter-event'         , (actor, event) => { this._onEntered(actor, event) });
        this.lv = this._panel.connect('leave-event'         , (actor, event) => { this._onLeave(actor, event) });
        this.bp = this._panel.connect('button-press-event'  , (actor, event) => { this._onButtonPress(actor, event) });
        this.br = this._panel.connect('button-release-event', (actor, event) => { this._onButtonRelease(actor, event) });
    },

    _onEntered : function(actor, event) {
        if (this.is_disabled || this.checkEventSource(actor, event)) return Clutter.EVENT_PROPAGATE;
        this.p = false
        return;
    },

    _onLeave : function(actor, event) {
        if (this.is_disabled || this.checkEventSource(actor, event)) return Clutter.EVENT_PROPAGATE;
        if (this.p && this.use_gestures) {
            let v = Math.abs(global.get_pointer()[0] - this.ppos[0]) < 33;
            let e = Math.abs(global.get_pointer()[1] - this.ppos[1]) > this._panel.get_height() - 2;
            if (v && e) this.Do(this.vert_out);
        }
        this.p = false;
        return;
    },

    _onButtonPress : function(actor, event) {
        if (this.is_disabled || this.checkEventSource(actor, event)) return Clutter.EVENT_PROPAGATE;
        let button = event.get_button();
        if (button == 1) {
            this.p = true;
            this.ppos = global.get_pointer();
            if (this.dblb) {
                this.p = false;
                this.Do(this.dblclck_action);
            }
            else{
                this.dblb = true;
                timeout_add(this.dblb_T, () => { this.dblb = false; });
            }
        }
        else if (button == 2) {
            this.Do(this.mdlclck_action);
        }
        return;
    },

    _onButtonRelease : function(actor, event) {
        if (this.is_disabled || this.checkEventSource(actor, event)) return Clutter.EVENT_PROPAGATE;
        if (this.p && this.use_gestures) {
            let v = global.get_pointer()[0] - this.ppos[0];
            if (v > 22) this.Do(this.to_right);
            else if (v < -22) this.Do(this.to_left);
        }
        this.p = false;
        return;
    },

    _onScroll : function(actor, event) {
        if (this.is_disabled || this.checkEventSource(actor, event)) return Clutter.EVENT_PROPAGATE;
        let currentTime = Date.now();
        let direction = event.get_scroll_direction();

        if (direction === Clutter.ScrollDirection.SMOOTH) {
            return Clutter.EVENT_PROPAGATE;
        }

        if (this.sep_acts) {
            if (direction == Clutter.ScrollDirection.UP) this.Do(this.scrl_up_action);
            else if (direction == Clutter.ScrollDirection.DOWN) this.Do(this.scrl_down_action);
        }
        else{
            let scrollDirection;
            switch (direction) {
                case Clutter.ScrollDirection.UP :
                    scrollDirection = 1;
                    break;
                case Clutter.ScrollDirection.DOWN :
                    scrollDirection = -1;
                    break;
                default:
                    return Clutter.EVENT_PROPAGATE;
            }
            if (this.scrl_action == 'adjust_opacity') {
                let min_opacity = this.cwm_settings.get_int("min-window-opacity") * 255 / 100;
                let m = 50;
                m = global.window_group.get_opacity() + m * scrollDirection;
                if (m < min_opacity) m = min_opacity;
                if (m > 255) m = 255;
                global.window_group.set_opacity(m);
            }
            else if (this.scrl_action == 'adjust_volume') {
                if (this._control == null) {
                    this._control = new Cvc.MixerControl({ name: 'Smart Panel Volume Control' });
                    this._control.open();
                }
                if (this._control.get_state() == Cvc.MixerControlState.READY) {
                    let v = 5 * scrollDirection;
                    global.log("Volume: " + v.toString());
                    this._output = this._control.get_default_sink();
                    let currentVolume = this._output.volume;
                    let prev_muted = this._output.is_muted;
                    let max_norm = this._control.get_vol_max_norm();
                    this._output.volume = Math.min(Math.max(0, currentVolume + max_norm * v / 100), max_norm * 1.5);
                    this._output.push_volume();
                }
                else {
                    global.log("this._control NOT READY");
                }
            }
            else if (this.scrl_action == 'desktop') {
                if (Main.panel.bottomPosition) scrollDirection = -scrollDirection;
//                global.screen.show_desktop(global.get_current_time());
//                if (scrollDirection < 0)
//                    global.screen.toggle_desktop(global.get_current_time());
                if (scrollDirection == 1) GLib.spawn_command_line_async('wmctrl -k on');
                else if (scrollDirection == -1) GLib.spawn_command_line_async('wmctrl -k off');
            }
            else{
                let limit = this._lastScroll + this.scroll_delay;
                if (this.no_fast_scroll && currentTime < limit && currentTime >= this._lastScroll) { }
                else if (this.scrl_action == 'switch_workspace') {
                    this._updateWorkspaceSwitcherExt();
                    // If we didn't find the workspace switcher extension APIs, check if we have older versions of DesktopCube or Flipper
                    if (!this.workspaceSwitcherExt && ExtensionSystem.runningExtensions.indexOf('DesktopCube@yare') > -1 ) {
                        //~ global.log("DesktopCube@yare DETECTED!!!");
                        if (!this.DesktopCube) {
                            //~ global.log("ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension']: "+Object.keys(ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension']));
                            this.DesktopCube = ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension'];
                        }
                        let binding = [];
                        binding.get_mask = function(){ return 0x0; };
                        if (scrollDirection == 1) binding.get_name = function(){ return 'switch-to-workspace-left'; };
                        else if (scrollDirection == -1) binding.get_name = function(){ return 'switch-to-workspace-right'; };
                        let cube = new this.DesktopCube.Cube(null, null, binding);
                        if (cube.isAnimating) {
                            cube.destroy_requested = true;
                        } else {
                            cube.destroy_requested = true;
                            cube.onDestroy();
                        }
                    }
                    else
                    if (!this.workspaceSwitcherExt && ExtensionSystem.runningExtensions.indexOf('Flipper@connerdev') > -1) {
                        //~ global.log("Flipper@connerdev DETECTED!!!");
                        if (!this.Flipper) {
                           this.Flipper = ExtensionSystem.extensions['Flipper@connerdev']['5.4']['extension'];
                        }
                        let binding = [];
                        binding.get_mask = function(){ return 0x0; };
                        if (scrollDirection == 1) binding.get_name = function(){ return 'switch-to-workspace-left'; };
                        else if (scrollDirection == -1) binding.get_name = function(){ return 'switch-to-workspace-right'; };
                        let flipper = new this.Flipper.Flipper(null, null, binding);
                        if (flipper.is_animating) {
                            flipper.destroy_requested = true;
                        } else {
                            flipper.destroy_requested = true;
                            flipper.onDestroy();
                        }
                    }
                    else{
                        let activeWsIndex = global.screen.get_active_workspace_index();
                        let reqWsInex = activeWsIndex - scrollDirection;
                        let last = global.screen.get_n_workspaces() - 1;
                        let first = 0;
                        let flast = last;
                        if (this.muf_settings.get_boolean("workspace-cycle")){
                            first = last;
                            flast = 0;
                        }
                        if (reqWsInex < 0) reqWsInex = first;
                        else if (reqWsInex > last) reqWsInex = flast;
                        let reqWs = global.screen.get_workspace_by_index(reqWsInex);
                        if (this.workspaceSwitcherExt) {
                           this.workspaceSwitcherExt.ExtSwitchToWorkspace(reqWs);
                        } else {
                           reqWs.activate(global.get_current_time());
                        }
                    }
                }
                else if (this.scrl_action == 'switch-windows') {
                    let current = 0;
                    let vis_windows = new Array();
                    this.window_list = global.screen.get_active_workspace().list_windows();
                    for (let i = 0; i < this.window_list.length; i++) {
                        if (!this.window_list[i].is_skip_taskbar()) {
                            vis_windows.push(i);
                        }
                    }
                    let num_windows = vis_windows.length;
                    for (let i = 0; i < num_windows; i++) {
                        if (this.window_list[vis_windows[i]].has_focus()) {
                            current = i;
                            break;
                        }
                    }
                    let target = current - scrollDirection;
                    if (target < 0 ) target = num_windows - 1;
                    if (target > num_windows - 1 ) target = 0;
                    Main.activateWindow(this.window_list[vis_windows[target]], global.get_current_time());
                }
            }
        }
        this._lastScroll = currentTime;
        return;
    },

    checkEventSource : function(actor, event) {
        let source = event.get_source();
        let clr = (source != Main.panel._centerBox || source != Main.panel._leftBox || source != Main.panel._rightBox);
        let not_ours = (source != actor && clr);
        return not_ours;
    },

    Do : function(action) {
        let activeWs = 0, reqWs = 0;
        switch (action) {
            case 'expo' :
                if (!Main.expo.animationInProgress) Main.expo.toggle();
                break;
            case 'overview' :
                if (!Main.overview.animationInProgress){
                    Main.overview.toggle();
//                    Main.panelManager.enablePanels();
                }
                break;
            case 'desktop' :
                let currentTime = Date.now();
                   if (currentTime < this.last_sd_req + this.scroll_delay && currentTime > this.last_sd_req) {
                       this.last_sd_req = currentTime;
                       return;
                   }
                global.screen.toggle_desktop(global.get_current_time());
                this.last_sd_req = currentTime;
                break;
            case 'cc1' :
                Util.spawnCommandLine(this.cc1);
                break;
            case 'cc2' :
                Util.spawnCommandLine(this.cc2);
                break;
            case 'cc3' :
                Util.spawnCommandLine(this.cc3);
                break;
            case 'leftWS' :
                activeWs = global.screen.get_active_workspace();
                reqWs = activeWs.get_neighbor(Meta.MotionDirection.LEFT);
                break;
            case 'rightWS' :
                activeWs = global.screen.get_active_workspace();
                reqWs = activeWs.get_neighbor(Meta.MotionDirection.RIGHT);
                break;
            case 'firstWS' :
                reqWs = global.screen.get_workspace_by_index(0);
                break;
            case 'lastWS' :
                let n = global.screen.get_n_workspaces() - 1;
                reqWs = global.screen.get_workspace_by_index(n);
                break;
            case 'appswitcher' :
                    this.get_name = Lang.bind(this, function(){
                        if (eval(this.switcher_modifier) & global.get_pointer()[2]) return this.switcher_modified;
                        else return this.switcher_scope;
                        });
                    this.get_mask = function(){ return  0xFFFF; }
                    let style = this.switcher_style;
                    if (style == 'default') style = global.settings.get_string("alttab-switcher-style");
                    if (style == 'coverflow'){
                        if (!this._switcherIsRuning) new myCoverflowSwitcher(this);
                        this._switcherIsRuning = true;
                        let delay = global.settings.get_int("alttab-switcher-delay");
                        //~ timeout_add(delay, Lang.bind(this, function(){ this._switcherIsRuning = false; }));
                        timeout_add(delay, () => { this._switcherIsRuning = false; });
                    }
                    else if (style == 'timeline'){
                        if (!this._switcherIsRuning) new myTimelineSwitcher(this);
                        this._switcherIsRuning = true;
                        let delay = global.settings.get_int("alttab-switcher-delay");
                        //~ timeout_add(delay, Lang.bind(this, function(){ this._switcherIsRuning = false; }));
                        timeout_add(delay, () => { this._switcherIsRuning = false; });
                    }
                    else {
                        new myClassicSwitcher(this);
                    }

                break;
        }
        if (reqWs) {
           this._updateWorkspaceSwitcherExt();
           if (this.workspaceSwitcherExt) {
              this.workspaceSwitcherExt.ExtSwitchToWorkspace(reqWs);
           } else {
              reqWs.activate(global.get_current_time());
           }
        }
    },

    _updateWorkspaceSwitcherExt : function() {
       // Check if one of the workspace switcher extensions are installed or if the state has changed since we last checked
       if (ExtensionSystem.runningExtensions.indexOf('DesktopCube@yare') > -1 ) {
          if (!this.workspaceSwitcherExt || this.workspaceSwitcherExt !== ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension']) {
             this.workspaceSwitcherExt = ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension'];
          }
       } else if (ExtensionSystem.runningExtensions.indexOf('Flipper@connerdev') > -1) {
          if (!this.workspaceSwitcherExt || this.workspaceSwitcherExt !== ExtensionSystem.extensions['Flipper@connerdev']['5.4']['extension']) {
             this.workspaceSwitcherExt = ExtensionSystem.extensions['Flipper@connerdev']['5.4']['extension'];
          }
       }
       // Make sure the switcher extension has the required API to allow us to change to any arbitrary workspace
       if (this.workspaceSwitcherExt && typeof this.workspaceSwitcherExt.ExtSwitchToWorkspace !== "function")
       {
          this.workspaceSwitcherExt =  null;
       }
    },
}

function myClassicSwitcher() {
    this._init.apply(this, arguments);
}

myClassicSwitcher.prototype = {
    __proto__: ClassicSwitcher.ClassicSwitcher.prototype,

    _init: function() {
        AppSwitcher.AppSwitcher.prototype._init.apply(this, arguments);

        this.actor = new Cinnamon.GenericContainer({ name: 'altTabPopup',
                                                  reactive: true,
                                                  visible: false });

        this._thumbnailTimeoutId = 0;
        this.thumbnailsVisible = false;
        this._displayPreviewTimeoutId = 0;

        Main.uiGroup.add_actor(this.actor);

        if (!this._setupModal())
            return;

        let styleSettings = this._binding.switcher_style;
        if (styleSettings == 'default') styleSettings = global.settings.get_string("alttab-switcher-style");
        let features = styleSettings.split('+');
        this._iconsEnabled = features.indexOf('icons') !== -1;
        this._previewEnabled = features.indexOf('preview') !== -1;
        this._thumbnailsEnabled = features.indexOf('thumbnails') !== -1;
        if (!this._iconsEnabled && !this._previewEnabled && !this._thumbnailsEnabled)
            this._iconsEnabled = true;

        this._showThumbnails = this._thumbnailsEnabled && !this._iconsEnabled;
        this._showArrows = this._thumbnailsEnabled && this._iconsEnabled;

        this._updateList(0);

        //~ this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        //~ this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        //~ this.actor.connect('allocate', Lang.bind(this, this._allocate));
        this.actor.connect('get-preferred-width', () => { this._getPreferredWidth() });
        this.actor.connect('get-preferred-height', () => { this._getPreferredHeight() });
        this.actor.connect('allocate', () => { this._allocate() });

        // Need to force an allocation so we can figure out whether we
        // need to scroll when selecting
        this.actor.opacity = 0;
        this.actor.show();
        this.actor.get_allocation_box();
    },

    _setupModal: function() {
        this._haveModal = Main.pushModal(this.actor);
        if (!this._haveModal)
            this._activateSelected();
        else {
            this._disableHover();

            //~ this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
            //~ this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));
            //~ this.actor.connect('scroll-event', Lang.bind(this, this._scrollEvent));
            //~ this.actor.connect('button-press-event', Lang.bind(this, this.owndestroy));
            this.actor.connect('key-press-event', () => { this._keyPressEvent() });
            this.actor.connect('key-release-event', () => { this._keyReleaseEvent() });
            this.actor.connect('scroll-event', () => { this._scrollEvent() });
            this.actor.connect('button-press-event', () => { this.owndestroy() });
            let delay = global.settings.get_int("alttab-switcher-delay");
            this._initialDelayTimeoutId = timeout_add(delay, () => { this._show() });
            this._currentIndex--;
        }
        return this._haveModal;
    },

    _keyReleaseEvent: function(actor, event) {
            let key = event.get_key_symbol();
            if (key == Clutter.KEY_Right || key == Clutter.KEY_Left) return true;
            if (this._initialDelayTimeoutId !== 0)
                this._currentIndex = (this._currentIndex + 1) % this._windows.length;
            this._activateSelected();
        return true;
    },

    owndestroy: function() {
        this._activateSelected();
    },
}

function myTimelineSwitcher() {
    this._init.apply(this, arguments);
}

myTimelineSwitcher.prototype = {
    __proto__: TimelineSwitcher.TimelineSwitcher.prototype,

    _init: function() {
        TimelineSwitcher.TimelineSwitcher.prototype._init.apply(this, arguments);
    },

    _setupModal: function() {
        this._haveModal = Main.pushModal(this.actor);
        if (!this._haveModal)
            this._activateSelected();
        else {
            this._disableHover();

            //~ this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
            //~ this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));
            //~ this.actor.connect('scroll-event', Lang.bind(this, this._scrollEvent));
            //~ this.actor.connect('button-press-event', Lang.bind(this, this.owndestroy));
            this.actor.connect('key-press-event', () => { this._keyPressEvent() });
            this.actor.connect('key-release-event', () => { this._keyReleaseEvent() });
            this.actor.connect('scroll-event', () => { this._scrollEvent() });
            this.actor.connect('button-press-event', () => { this.owndestroy() });
            let delay = global.settings.get_int("alttab-switcher-delay");
            this._initialDelayTimeoutId = timeout_add(delay, () => { this._show() });
            this._currentIndex--;
        }
        return this._haveModal;
    },

    _keyReleaseEvent: function(actor, event) {
            let key = event.get_key_symbol();
            if (key == Clutter.KEY_Right || key == Clutter.KEY_Left) return true;
            if (this._initialDelayTimeoutId !== 0)
                this._currentIndex = (this._currentIndex + 1) % this._windows.length;
            this._activateSelected();
        return true;
    },

    owndestroy: function() {
        this._activateSelected();
    },
}


function myCoverflowSwitcher() {
    this._init.apply(this, arguments);
}

myCoverflowSwitcher.prototype = {
    __proto__: CoverflowSwitcher.CoverflowSwitcher.prototype,

    _init: function() {
        CoverflowSwitcher.CoverflowSwitcher.prototype._init.apply(this, arguments);
    },

    _setupModal: function() {
        this._haveModal = Main.pushModal(this.actor);
        if (!this._haveModal)
            this._activateSelected();
        else {
            this._disableHover();

            //~ this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEvent));
            //~ this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));
            //~ this.actor.connect('scroll-event', Lang.bind(this, this._scrollEvent));
            //~ this.actor.connect('button-press-event', Lang.bind(this, this.owndestroy));
            this.actor.connect('key-press-event', () => { this._keyPressEvent() });
            this.actor.connect('key-release-event', () => { this._keyReleaseEvent() });
            this.actor.connect('scroll-event', () => { this._scrollEvent() });
            this.actor.connect('button-press-event', () => { this.owndestroy() });
            let delay = global.settings.get_int("alttab-switcher-delay");
            this._initialDelayTimeoutId = timeout_add(delay, () => { this._show() });
            this._currentIndex--;
        }
        return this._haveModal;
    },

    _keyReleaseEvent: function(actor, event) {
            let key = event.get_key_symbol();
            if (key == Clutter.KEY_Right || key == Clutter.KEY_Left) return true;
            if (this._initialDelayTimeoutId !== 0)
                this._currentIndex = (this._currentIndex + 1) % this._windows.length;
            this._activateSelected();
        return true;
    },

    owndestroy: function() {
        this._activateSelected();
    },
}

function init(metadata) { newSmartPanelExt = new SmartPanelExt(metadata); }
function enable() { newSmartPanelExt.enable(); }
function disable() { newSmartPanelExt.disable(); }

