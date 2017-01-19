/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Cinnamon = imports.gi.Cinnamon;
const Lang = imports.lang;
const Signals = imports.signals;
const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const BoxPointer = imports.ui.boxpointer;
const Params = imports.misc.params;

const Gettext = imports.gettext.domain('cinnamon-extensions');
const _ = Gettext.gettext;

// Settings
const DOCK_SETTINGS_SCHEMA = 'org.cinnamon.extensions.cinnadock';
const DOCK_APPS_KEY = 'cinnadock-apps'
const DOCK_POSITION_KEY = 'position';
const DOCK_SIZE_KEY = 'size';
const DOCK_HIDE_KEY = 'autohide';
const DOCK_EFFECTHIDE_KEY = 'hide-effect';
const DOCK_AUTOHIDE_ANIMATION_TIME_KEY = 'hide-effect-duration';

// Keep enums in sync with GSettings schemas
const PositionMode = {
    LEFT: 0,
    RIGHT: 1,
    TOP: 2,
    BOTTOM: 3
};

const AutoHideEffect = {
    RESIZE: 0,
    RESCALE: 1
};

let position = PositionMode.RIGHT;
let dockicon_size = 48;
let hideable = true;
let hideDock = true;
let hideEffect = AutoHideEffect.RESIZE;
let autohide_animation_time = 0.3;

/*********************************/
/****start of resize functions****/
/*********************************/
function hideDock_size () {
    if (hideable){
       let monitor = Main.layoutManager.primaryMonitor;
       let height = 0;
       let width = 0;
       let position_x = 0;
       let position_y = 0;

       Tweener.addTween(this,{
              _item_size: 1,
              time: autohide_animation_time,
              transition: 'easeOutQuad',
              onUpdate: function () {
                switch (position) { 
                        case PositionMode.TOP:
                                height = this._item_size + 4*this._spacing;
                                width = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                position_x=monitor.x + (monitor.width-width)/2;
                                position_y=monitor.y - 2*this._spacing;
                                        break;
                        case PositionMode.BOTTOM:
                                height = this._item_size + 4*this._spacing;
                                width = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                position_x=monitor.x + (monitor.width-width)/2;
                                position_y=monitor.y + (monitor.height-this._item_size-2*this._spacing);
                                        break;
                        case PositionMode.LEFT:
                                height = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                width = this._item_size + 4*this._spacing;
                                position_x = monitor.x - 2*this._spacing;
                                position_y = monitor.y + (monitor.height-height)/2;
                                        break;
                        case PositionMode.RIGHT:
                        default:
                                height = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                width = this._item_size + 4*this._spacing;
                                position_x=monitor.x + (monitor.width-this._item_size-2*this._spacing);
                                position_y=monitor.y + (monitor.height-height)/2;
                }
                this.actor.set_position (position_x,position_y);
                this.actor.set_size(width,height);
                // Force the layout manager to update the input region
                Main.layoutManager._chrome.updateRegions()
             },
       });
       hideDock=true;
    }
}

function showDock_size () {
        let monitor = Main.layoutManager.primaryMonitor;
        let height = 0;
        let width = 0;
        let position_x = 0;
        let position_y = 0;

     Tweener.addTween(this,{
             _item_size: dockicon_size,
             time: autohide_animation_time,
             transition: 'easeOutQuad',
             onUpdate: function () {
                switch (position) { 
                        case PositionMode.TOP:
                                height = this._item_size + 4*this._spacing;
                                width = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                position_x=monitor.x + (monitor.width-width)/2;
                                position_y=monitor.y - 2*this._spacing;
                                        break;
                        case PositionMode.BOTTOM:
                                height = this._item_size + 4*this._spacing;
                                width = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                position_x=monitor.x + (monitor.width-width)/2;
                                position_y=monitor.y + (monitor.height-this._item_size-2*this._spacing);
                                        break;
                        case PositionMode.LEFT:
                                height = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                width = this._item_size + 4*this._spacing;
                                position_x = monitor.x - 2*this._spacing;
                                position_y = monitor.y + (monitor.height-height)/2;
                                        break;
                        case PositionMode.RIGHT:
                        default:
                                height = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                width = this._item_size + 4*this._spacing;
                                position_x=monitor.x + (monitor.width-this._item_size-2*this._spacing);
                                position_y=monitor.y + (monitor.height-height)/2;
                }
                this.actor.set_position (position_x,position_y);
                this.actor.set_size(width,height);
                // Force the layout manager to update the input region
                Main.layoutManager._chrome.updateRegions()
             },
     });
     hideDock=false;
}

function initShowDock_size () {
        this._item_size=1;
        this._showDock();
}

function showEffectAddItem_size () {
        let monitor = Main.layoutManager.primaryMonitor;
        let height = 0;
        let width = 0;
        let position_x = 0;
        let position_y = 0;

        switch (position) { 
                        case PositionMode.TOP:
                                height = this._item_size + 4*this._spacing;
                                width = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                position_x=monitor.x + (monitor.width-width)/2;
                                position_y=monitor.y - 2*this._spacing;
                                        break;
                        case PositionMode.BOTTOM:
                                height = this._item_size + 4*this._spacing;
                                width = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                position_x=monitor.x + (monitor.width-width)/2;
                                position_y=monitor.y + (monitor.height-this._item_size-2*this._spacing);
                                        break;
                        case PositionMode.LEFT:
                                height = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                width = this._item_size + 4*this._spacing;
                                position_x = monitor.x - 2*this._spacing;
                                position_y = monitor.y + (monitor.height-height)/2;
                                        break;
                        case PositionMode.RIGHT:
                        default:
                                height = (this._nicons)*(this._item_size + this._spacing) + 2*this._spacing;
                                width = this._item_size + 4*this._spacing;
                                position_x=monitor.x + (monitor.width-this._item_size-2*this._spacing);
                                position_y=monitor.y + (monitor.height-height)/2;
                }
        
        Tweener.addTween(this.actor, {
                x: position_x,
                y: position_y,
                height: height,
                width: width,
                time: autohide_animation_time,
                transition: 'easeOutQuad',
                onUpdate: function() {
                    // Force the layout manager to update the input region
                    Main.layoutManager._chrome.updateRegions()
                }
        });
}
/*** end of resize functions ***/

/**********************************/
/****start of rescale functions****/
/**********************************/
function hideDock_scale () {
       this._item_size = dockicon_size;
       let monitor = Main.layoutManager.primaryMonitor;
       let position_x = 0;
       let position_y = 0;
       let height = 0;
       let width = 0;

       switch (position) {
            case PositionMode.TOP:
                width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                height = this._item_size + 4*this._spacing;
                position_x=monitor.x + (monitor.width-width)/2;
                position_y=monitor.y;
                break;
            case PositionMode.BOTTOM:
                width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                height = this._item_size + 4*this._spacing;
                position_x=monitor.x + (monitor.width-width)/2;
                position_y=monitor.y + monitor.height-1;
                break;
            case PositionMode.LEFT:
                height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                width = this._item_size + 4*this._spacing;                
                position_x=monitor.x;
                position_y=monitor.y + (monitor.height-height)/2;
                break;
            case PositionMode.RIGHT:
            default:
                height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                width = this._item_size + 4*this._spacing;
                position_x = monitor.x + monitor.width-1;
                position_y = monitor.y + (monitor.height-height)/2;
        }

        if (hideable) {
          switch (position) {
                case PositionMode.TOP:
                case PositionMode.BOTTOM:
                  Tweener.addTween(this.actor,{
                       x: position_x,
                       y: position_y,
                       height:height,
                       width: width,
                       scale_y: 0.025,
                       time: autohide_animation_time,
                       transition: 'easeOutQuad',
                       onUpdate: function() {
                           Main.layoutManager._chrome.updateRegions()
                       }
                  });
                break;
                case PositionMode.TOP:
                case PositionMode.BOTTOM:
                default:
                  Tweener.addTween(this.actor,{
                       x: position_x,
                       y: position_y,
                       height:height,
                       width: width,
                       scale_x: 0.025,
                       time: autohide_animation_time,
                       transition: 'easeOutQuad',
                       onUpdate: function() {
                           Main.layoutManager._chrome.updateRegions()
                       }
                  });
          }
          hideDock=true;
        }
}

function showDock_scale () {
        this._item_size = dockicon_size;
        let monitor = Main.layoutManager.primaryMonitor;
        let height = 0;
        let width = 0;   
        let position_x = 0;
        let position_y = 0;
        
        switch (position) {
            case PositionMode.TOP:
                width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                height = this._item_size + 4*this._spacing;
                position_x = monitor.x + (monitor.width-width)/2;
                position_y = monitor.y-2*this._spacing;
                break;
            case PositionMode.BOTTOM:
                width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                height = this._item_size + 4*this._spacing;
                position_x = monitor.x + (monitor.width-width)/2;
                position_y = monitor.y + (monitor.height-this._item_size-2*this._spacing);
                break;
            case PositionMode.LEFT:
                height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                width = this._item_size + 4*this._spacing;
                position_x = monitor.x-2*this._spacing;
                position_y = monitor.y + (monitor.height-height)/2;
                break;
            case PositionMode.RIGHT:
            default:
                height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                width = this._item_size + 4*this._spacing;
                position_x = monitor.x + (monitor.width-this._item_size-2*this._spacing);
                position_y = monitor.y + (monitor.height-height)/2;
        }
        Tweener.addTween(this.actor, {
                x: monitor.x + position_x,
                //x: position_x,
                y: monitor.y + position_y,
                height: height,
                width: width,
                scale_x: 1,
                scale_y: 1,
                time: autohide_animation_time,
                transition: 'easeOutQuad',
                onUpdate: function() {
                    // Force the layout manager to update the input region
                    Main.layoutManager._chrome.updateRegions()
                }
        });
        hideDock=false;
}

function initShowDock_scale () {
        this._item_size = dockicon_size;
        let monitor = Main.layoutManager.primaryMonitor;
        let height = 0;
        let width = 0;
        let position_x = 0;
        let position_y = 0;

        switch (position) {
                case PositionMode.TOP:
                        this.actor.y = 0;        
                        width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                        height = this._item_size + 4*this._spacing;
                        position_x = monitor.x + (monitor.width-width)/2;
                        position_y = monitor.y-2*this._spacing;
                        break;                
                case PositionMode.BOTTOM:
                        this.actor.y = monitor.height-1;        
                        width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                        height = this._item_size + 4*this._spacing;
                        position_x = monitor.x + (monitor.width-width)/2;
                        position_y = monitor.y + (monitor.height-this._item_size-2*this._spacing);
                        break;
                case PositionMode.LEFT:
                        this.actor.x = 0;        
                        height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                        width = this._item_size + 4*this._spacing;
                        position_x = monitor.x-2*this._spacing;
                        position_y = monitor.y + (monitor.height-height)/2;
                        break;
                case PositionMode.RIGHT:
                default:
                        this.actor.x = monitor.width-1;
                        height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                        width = this._item_size + 4*this._spacing;
                        position_x = monitor.x + (monitor.width-this._item_size-2*this._spacing);
                        position_y = monitor.y + (monitor.height-height)/2;
        }

        this.actor.set_scale (0,0);
        this.actor.set_size (width,height);

           // effect of creation of the dock
           Tweener.addTween(this.actor, {
               x: position_x,
               y: position_y,
               height: height,
               width: width, 
               time: autohide_animation_time * 3,
               transition: 'easeOutQuad',
               onUpdate: function() {
                   // Force the layout manager to update the input region
                   Main.layoutManager._chrome.updateRegions()
               }
           });
              
        Tweener.addTween(this.actor,{
           scale_x: 1,
           scale_y: 1,
           time: autohide_animation_time * 3,
           transition: 'easeOutQuad',
           onUpdate: function() {
               // Force the layout manager to update the input region
               Main.layoutManager._chrome.updateRegions()
           }
        });
        hideDock=false;
}

function showEffectAddItem_scale () {
        this._item_size = dockicon_size;
        let monitor = Main.layoutManager.primaryMonitor;
        let height = 0;
        let width = 0;   
        let position_x = 0;
        let position_y = 0;
        
        switch (position) {
            case PositionMode.TOP:
                width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                height = this._item_size + 4*this._spacing;
                position_x = monitor.x + (monitor.width-width)/2;
                position_y = monitor.y-2*this._spacing;
                break;
            case PositionMode.BOTTOM:
                width = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;                
                height = this._item_size + 4*this._spacing;
                position_x = monitor.x + (monitor.width-width)/2;
                position_y = monitor.y + (monitor.height-this._item_size-2*this._spacing);
                break;
            case PositionMode.LEFT:
                height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                width = this._item_size + 4*this._spacing;
                position_x = monitor.x-2*this._spacing;
                position_y = monitor.y + (monitor.height-height)/2;
                break;
            case PositionMode.RIGHT:
            default:
                height = this._nicons*(this._item_size + this._spacing) + 2*this._spacing;
                width = this._item_size + 4*this._spacing;
                position_x = monitor.x + (monitor.width-this._item_size-2*this._spacing);
                position_y = monitor.y + (monitor.height-height)/2;
        }

        Tweener.addTween(this.actor, {
                x: position_x,
                y: position_y,
                height: height,
                width: width,
                time: autohide_animation_time,
                transition: 'easeOutQuad',
                onUpdate: function() {
                    // Force the layout manager to update the input region
                    Main.layoutManager._chrome.updateRegions()
                }
        });
}
/*** end of rescale functions ***/

function Dock() {
    this._init();
}

Dock.prototype = {
    _init : function() {

        //Load Settings
        this._settings = new Gio.Settings({ schema: DOCK_SETTINGS_SCHEMA });
        position = this._settings.get_enum(DOCK_POSITION_KEY);
        dockicon_size = this._settings.get_int(DOCK_SIZE_KEY);
        hideDock = hideable = this._settings.get_boolean(DOCK_HIDE_KEY);
        hideEffect = this._settings.get_enum(DOCK_EFFECTHIDE_KEY);
        autohide_animation_time = this._settings.get_double(DOCK_AUTOHIDE_ANIMATION_TIME_KEY);

        this._spacing = 4;
        this._item_size = dockicon_size;
        this._nicons = 0;

        this._selectFunctionsHide();
        
        this.actor = new St.BoxLayout({ name: 'cinnadock', reactive: true });
        if (position == PositionMode.LEFT || position == PositionMode.RIGHT) 
            this.actor.set_vertical(true);
        
        this._grid = new Cinnamon.GenericContainer();
        this.actor.add(this._grid, { expand: true, x_align: St.Align.START, y_align: St.Align.START }); 
        
        this.actor.connect('style-changed', Lang.bind(this, this._onStyleChanged));

        this._grid.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this._grid.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this._grid.connect('allocate', Lang.bind(this, this._allocate));

        this._workId = Main.initializeDeferredWork(this.actor, Lang.bind(this, this._redisplay));

        //for 'app-state-changed' handling in order to limit number of unneeded refreshes
        this._appsNative;
        this._appsAppended; 

        this._appSystem = Cinnamon.AppSystem.get_default();
        this._appStateChangedId = this._appSystem.connect('app-state-changed', Lang.bind(this, this._onAppStateChanged));

        this._overviewShowingId = Main.overview.connect('showing', Lang.bind(this, function() {
            this.actor.hide();
        }));
        this._overviewHiddenId = Main.overview.connect('hidden', Lang.bind(this, function() {
            this.actor.show();
        }));

        //this triggers _redisplay()
        Main.layoutManager.addChrome(this.actor);

        //dock settings submenu on middle mouse click
        this._menu = new DockMenu(this, this.getPopupMenuOrientation());
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuManager.addMenu(this._menu);
        this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));

        this._settings.connect('changed::'+DOCK_POSITION_KEY, Lang.bind(this, function (){
                if (!this._settings)
                    return;

                position = this._settings.get_enum(DOCK_POSITION_KEY);
                
                let primary = Main.layoutManager.primaryMonitor;

                switch (position) {
                case PositionMode.TOP:
                case PositionMode.BOTTOM:                
                        this.actor.x=primary.x;
                        break;
                case PositionMode.LEFT:
                case PositionMode.RIGHT:                
                default:
                        this.actor.y=primary.y;
                }
                this._redisplay();
        }));

        this._settings.connect('changed::'+DOCK_SIZE_KEY, Lang.bind(this, function (){
                if (!this._settings)
                    return;

                dockicon_size = this._settings.get_int(DOCK_SIZE_KEY);
                this._redisplay();
        }));

        this._settings.connect('changed::'+DOCK_HIDE_KEY, Lang.bind(this, function (){
                if (!this._settings)
                    return;

                hideable = this._settings.get_boolean(DOCK_HIDE_KEY);
                if (hideable){
                        hideDock=false;
                        this._hideDock();
                } else {
                        hideDock=true;
                        this._showDock();
                }
                this._menu.refreshHideable();
        }));

        this._settings.connect('changed::'+DOCK_EFFECTHIDE_KEY, Lang.bind(this, function () {
                if (!this._settings)
                    return;

                hideEffect = this._settings.get_enum(DOCK_EFFECTHIDE_KEY);
                //this.actor.y=0;

                switch (hideEffect) {
                        case AutoHideEffect.RESCALE:
                           this._item_size=dockicon_size;
                           break;
                        case AutoHideEffect.RESIZE:
                           this.actor.set_scale(1,1);
                }
                //this.actor.disconnect(leave_event);
                //this.actor.disconnect(enter_event);

                //this._selectFunctionsHide();

                //leave_event = this.actor.connect('leave-event', Lang.bind(this, this._hideDock));
                //enter_event = this.actor.connect('enter-event', Lang.bind(this, this._showDock));
                this._redisplay();
        }));

        this._settings.connect('changed::'+DOCK_AUTOHIDE_ANIMATION_TIME_KEY, Lang.bind(this,function (){
                if (!this._settings)
                    return;

                autohide_animation_time = this._settings.get_double(DOCK_AUTOHIDE_ANIMATION_TIME_KEY);
        }));

        this.actor.connect('leave-event', Lang.bind(this, this._hideDock));
        this.actor.connect('enter-event', Lang.bind(this, this._showDock));
        
        
    },

    _onButtonPress: function(actor, event) {
        if (event.get_button() == 2) {
                this._disableHideDock();
                this._menu.toggle();
        }
        return true;
    },

    destroy: function() {
        if (this._appStateChangedId) {
            this._appSystem.disconnect(this._appStateChangedId);
            this._appStateChangedId = 0;
        }

        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }

        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }

        this.actor.destroy();

        // Break reference cycles
        this._settings = null;
        this._appSystem = null;

        this._menu = null;
        this._menuManager = null;
    },
    
    // fuctions hide
    _restoreHideDock: function() {
        hideable = this._settings.get_boolean(DOCK_HIDE_KEY);
    },

    _disableHideDock: function() {
        hideable = false;
    },

    _selectFunctionsHide: function () {
        switch (hideEffect) {
        case AutoHideEffect.RESCALE:
            this._hideDock = hideDock_scale;
            this._showDock = showDock_scale;
            this._initShowDock = initShowDock_scale;
            this._showEffectAddItem = showEffectAddItem_scale;
            break;
        case AutoHideEffect.RESIZE:
        default:
            this._hideDock = hideDock_size;
            this._showDock = showDock_size;
            this._initShowDock = initShowDock_size;
            this._showEffectAddItem = showEffectAddItem_size;
        }
    },

    _appIdListToHash: function(apps) {
        let ids = {};
        for (let i = 0; i < apps.length; i++)
            ids[apps[i].get_id()] = apps[i];
        return ids;
    },

    _onAppStateChanged: function() {
        if (typeof this._appsNative == "undefined") return; //dock _redisplay hasnt yet ran

        //we aim to keep refreshing (_queueRedisplay()) minimal
        let running = this._appSystem.get_running();
        let runningAppended = [];
        for (let i = 0; i < running.length; i++) {
            let runningId = running[i].get_id();
            if (runningId in this._appsNative) { 
                //dont refresh - let DockIcon handle changes
            } else {
                //keep track of apps appended to dock, open/close any of them should trigger refresh
                runningAppended.push(runningId);
            }
        }
        //only refresh when application which appends to dock either opens or closes
        if (runningAppended.length != this._appsAppended.length) { 
                this._queueRedisplay();
        }
    },

    _queueRedisplay: function () {
        Main.queueDeferredWork(this._workId);
    },

    _redisplay: function () {
        this.removeAll();
        this._appsNative = {};
        this._appsAppended = [];

        let appSys = Cinnamon.AppSystem.get_default();
        let ids = this._settings.get_strv(DOCK_APPS_KEY);
        let apps = ids.map(function (id) {
                let app = appSys.lookup_app(id);
                if (!app) app = appSys.lookup_settings_app(id);
                return app;
            }).filter(function (app) {
                return app != null;
            });
        let favorites = {};
        for (let i = 0; i < apps.length; i++) {
            let app = apps[i];
            favorites[app.get_id()] = app;
        }
  
        let running = appSys.get_running();
        let runningIds = this._appIdListToHash(running);

        let icons = 0;

        let nFavorites = 0;
        for (let id in favorites) {
            let app = favorites[id];
            let display = new DockIcon(app,this, true); //true: already pinned to dock
            this.addItem(display.actor);
            this._appsNative[app.get_id()] = 0; //only keys are of interest 
            nFavorites++;
            icons++;
        }

        for (let i = running.length-1; i >= 0; i--) {
            let app = running[i];
            if (app.get_id() in favorites)
                continue;
            let display = new DockIcon(app,this, false); //false: can be pinned to dock if needed
            icons++;
            this.addItem(display.actor);
            this._appsAppended.push(app.get_id()); 
        }
        
        this._nicons=icons;

        let primary = Main.layoutManager.primaryMonitor;
        switch (position) {
        case PositionMode.TOP:
        case PositionMode.BOTTOM:
                if (this.actor.x != primary.x) {
                        if (hideable && hideDock) {
                                this._hideDock();
                        } else {
                           if (dockicon_size == this._item_size) {
                                // only add/delete icon
                                this._showEffectAddItem();
                            } else {
                                // change size icon
                                this._showDock();
                            }
                        }
                } else { //dock starts for a first time or position changed
                    this._initShowDock();
                    if (hideable) { this._hideDock(); }
                }
                break;
        case PositionMode.LEFT:
        case PositionMode.RIGHT:
        default:
                if (this.actor.y != primary.y) {
                        if (hideable && hideDock) {
                                this._hideDock();
                        } else {
                           if (dockicon_size == this._item_size) {
                                // only add/delete icon
                                this._showEffectAddItem();
                            } else {
                                // change size icon
                                this._showDock();
                            }
                        }
                } else { //dock starts for a first time or position changed
                    this._initShowDock();
                    if (hideable) { this._hideDock(); }
                }
        }

        this._menu.refreshPositionSubMenu();
    },

    _getPreferredWidth: function (grid, forHeight, alloc) {
        switch (position) {
          case PositionMode.TOP:
          case PositionMode.BOTTOM:
                let children = this._grid.get_children();
                let nCols = children.length;
                let totalSpacing = Math.max(0, nCols - 1) * this._spacing;
                let width = nCols * this._item_size + totalSpacing;
                alloc.min_size = width;
                alloc.natural_size = width;                
                break;
          case PositionMode.LEFT:
          case PositionMode.RIGHT:
          default:
                alloc.min_size = this._item_size;
                alloc.natural_size = this._item_size + this._spacing;
        }
    },

    _getPreferredHeight: function (grid, forWidth, alloc) {
        switch (position) {
          case PositionMode.TOP:
          case PositionMode.BOTTOM:
                alloc.min_size = this._item_size;
                alloc.natural_size = this._item_size + this._spacing;
                break;
          case PositionMode.LEFT:
          case PositionMode.RIGHT:
          default:         
                let children = this._grid.get_children();
                let nRows = children.length;
                let totalSpacing = Math.max(0, nRows - 1) * this._spacing;
                let height = nRows * this._item_size + totalSpacing;
                alloc.min_size = height;
                alloc.natural_size = height;
        }
    },

    _allocate: function (grid, box, flags) {
        let children = this._grid.get_children();
        let x = 0;
        let y = 0;
        switch (position) {
                case (PositionMode.TOP):
                        x = box.x1 + this._spacing;                        
                        y = box.y1 + 2*this._spacing;
                        for (let i = 0; i < children.length; i++) {
                            let childBox = new Clutter.ActorBox();
                            childBox.x1 = x;
                            childBox.y1 = y;
                            childBox.x2 = childBox.x1 + this._item_size;
                            childBox.y2 = childBox.y1 + this._item_size;
                            children[i].allocate(childBox, flags);
                            x += this._item_size + this._spacing;
                        }
                        break;
                case (PositionMode.BOTTOM):
                        x = box.x1 + this._spacing;                        
                        y = box.y1 + this._spacing;
                        for (let i = 0; i < children.length; i++) {
                            let childBox = new Clutter.ActorBox();
                            childBox.x1 = x;
                            childBox.y1 = y;
                            childBox.x2 = childBox.x1 + this._item_size;
                            childBox.y2 = childBox.y1 + this._item_size;
                            children[i].allocate(childBox, flags);
                            x += this._item_size + this._spacing;
                        }
                        break;
                case (PositionMode.LEFT):
                        x = box.x1 + 2*this._spacing;
                        y = box.y1 + this._spacing;

                        for (let i = 0; i < children.length; i++) {
                            let childBox = new Clutter.ActorBox();
                            childBox.x1 = x;
                            childBox.y1 = y;
                            childBox.x2 = childBox.x1 + this._item_size;
                            childBox.y2 = childBox.y1 + this._item_size;
                            children[i].allocate(childBox, flags);
                            y += this._item_size + this._spacing;
                        }
                        break;
                case (PositionMode.RIGHT):
                default:        
                        x = box.x1 + this._spacing;
                        y = box.y1 + this._spacing;

                        for (let i = 0; i < children.length; i++) {
                            let childBox = new Clutter.ActorBox();
                            childBox.x1 = x;
                            childBox.y1 = y;
                            childBox.x2 = childBox.x1 + this._item_size;
                            childBox.y2 = childBox.y1 + this._item_size;
                            children[i].allocate(childBox, flags);
                            y += this._item_size + this._spacing;
                        }
        }
    },


    _onStyleChanged: function() {
        let themeNode = this.actor.get_theme_node();
        let [success, len] = themeNode.get_length('spacing', false);
        if (success)
            this._spacing = len;
        [success, len] = themeNode.get_length('-cinnamon-grid-item-size', false);
        if (success)
            this._item_size = len;
        this._grid.queue_relayout();
    },

    removeAll: function () {
        this._grid.get_children().forEach(Lang.bind(this, function (child) {
            child.destroy();
        }));
    },

    addItem: function(actor) {
        this._grid.add_actor(actor);
    },

    getPopupMenuOrientation: function() {
    //orientation 0 is down, 1 is left, 2 top, 3 right
        let orientation = 1; //assuming default dock is on RIGHT, bubble should popup on LEFT
        switch (position) {
                case (PositionMode.TOP):
                        orientation = 0;
                        break;
                case (PositionMode.BOTTOM):
                        orientation = 2;
                        break;
                case (PositionMode.LEFT):
                        orientation = 3;
                        break;
                //case (PositionMode.RIGHT):
                //default:
                //        orientation = 1;
        }
    return orientation;
    }
};
Signals.addSignalMethods(Dock.prototype);

/* start of right-click menu for dock */
function DockPopupMenu() {
    this._init.apply(this, arguments); //see PopupMenu
}

//override open/close of PopupMenu
DockPopupMenu.prototype = {
    __proto__: PopupMenu.PopupMenu.prototype,

    setArrowSide: function(side) {
        this._boxPointer._arrowSide = side;
    },

    open: function(animate) {
        if (this.isOpen)
            return;

        this.isOpen = true;
        
        this._boxPointer.setPosition(this.sourceActor, this._arrowAlignment);
        this._boxPointer.show(animate);

        //this.actor.raise_top();
	this.emit('open-state-changed', true);
    },

    close: function(animate) {
	if (!this.isOpen)
            return;
            
        if (this._activeMenuItem)
            this._activeMenuItem.setActive(false);

        this._boxPointer.hide(animate);
        
        //need to reset hide flag on dock when ESC is hit
        //we either deal with dock or dockicon but both references dock by dockRef
        this._dockRef._restoreHideDock();

        this.isOpen = false;
        this.emit('open-state-changed', false);
    }
};

//Dock related menu, handle docks settings, currently changes to 'Hideable' and 'Position'
//can be extended to add hide effect change, duration etc
function DockMenu(dock, orientation) {
        this._init(dock, orientation);
}

DockMenu.prototype = {
    __proto__: DockPopupMenu.prototype,
    
    _init: function(dock, orientation) {
        this._dockRef = dock;
                
        DockPopupMenu.prototype._init.call(this, dock.actor, 0.0, orientation, 0);
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        
        //we dont know if dconf-editor is used to set flag or this submenu itself
        //so start undefined and call refreshHideable to pick correct hideable flag
        this.hideableSwitch; 
        this.refreshHideable();
        this.addMenuItem(this.hideableSwitch);
        this.hideableSwitch.connect('activate', Lang.bind(this, this._onHideableChange));

        this.positionSubMenu = new PopupMenu.PopupSubMenuMenuItem(_("Position"));
        this.refreshPositionSubMenu();
        this.addMenuItem(this.positionSubMenu); 
    },

    _onHideableChange: function(actor, event) {
        this._dockRef._settings.set_boolean(DOCK_HIDE_KEY, !hideable);
        return true;
    },

    refreshHideable: function() {
        this.hideableSwitch = new PopupMenu.PopupSwitchMenuItem(_("Autohide"), hideable); 
    },

    refreshPositionSubMenu: function() {
        this.positionSubMenu.menu.removeAll();
        for (let key in PositionMode) {
          let positionItem = new PopupMenu.PopupMenuItem(key.toLowerCase());
          if (PositionMode[key] == position) {
                positionItem.setShowDot(true);
          }
          //can be a problem calling below from outside what 'this' would be then???
          positionItem.connect("activate", Lang.bind(this, function (actor, event) {
            //position text is inside StLabel object wrapped in GenericContainer
            let selectedPosition = event.get_source().get_children_list().shift().get_text().toUpperCase();
            this._dockRef._settings.set_enum(DOCK_POSITION_KEY, PositionMode[selectedPosition]);
          }));
          this.positionSubMenu.menu.addMenuItem(positionItem);
        }
        //likely dock is repositioned, need to adjust arrow for settings submenu
        this.setArrowSide(this._dockRef.getPopupMenuOrientation());
    }
};

//DockIcon related menu, currently 'Pin to dock', 'Remove' 
//can be extended to add Close app etc       
function DockIconMenu(dockIcon, orientation) {
        this._init(dockIcon, orientation);
}

DockIconMenu.prototype = {
    __proto__: DockPopupMenu.prototype,
    
    _init: function(dockIcon, orientation) {
        this._dockRef = dockIcon._dock;        
        this._dockIcon = dockIcon;
        
        DockPopupMenu.prototype._init.call(this, dockIcon.actor, 0.0, orientation, 0);
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
        
        if (this._dockIcon._isPinned) {
            //already pinned, we cannot pin it again but we may wish to remove it
            this.removeItem = new PopupMenu.PopupMenuItem(_('Remove'));
            this.addMenuItem(this.removeItem);
            this.removeItem.connect('activate', Lang.bind(this, this._onRemove));
        } else {
            this.addItem = new PopupMenu.PopupMenuItem(_('Pin to dock'));
            this.addMenuItem(this.addItem);
            this.addItem.connect('activate', Lang.bind(this, this._onPinToDock));
        }        
        
    },

    _onPinToDock: function(actor, event) {
        let appid = this._dockIcon.app.get_id();
        let ids = this._dockIcon._dock._settings.get_strv(DOCK_APPS_KEY);        
        ids.push(appid);
        this._dockIcon._dock._settings.set_strv(DOCK_APPS_KEY, ids);
        this._dockIcon._dock._queueRedisplay();        
    },

    _onRemove: function(actor, event) {
        let appid = this._dockIcon.app.get_id();
        let ids = this._dockIcon._dock._settings.get_strv(DOCK_APPS_KEY);        
        let i = ids.indexOf(appid);
        if (i>=0) {
                ids.splice(i,1);
                this._dockIcon._dock._settings.set_strv(DOCK_APPS_KEY, ids);
                this._dockIcon._dock._queueRedisplay();        
        }
    }
};

function DockIcon(app, dock, isPinned) {
    this._init(app, dock, isPinned);
}

DockIcon.prototype = {
    _init : function(app, dock, isPinned) {
        this.app = app;
        this._dock=dock;
        
        //right-click menu will be able to activate/deactivate 'Pin to dock' based on below
        this._isPinned = isPinned;

        this.actor = new St.Button({ style_class: 'dock-app',
                                     reactive: true,
                                     x_fill: true,
                                     y_fill: true });
        this.actor._delegate = this;
        this.actor.set_size(dockicon_size, dockicon_size);

        this._icon = this.app.create_icon_texture(dockicon_size);
        this.actor.set_child(this._icon);

        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menu = new DockIconMenu(this, this._dock.getPopupMenuOrientation());
        this._menuManager.addMenu(this._menu);

        this._has_focus = false;

        this.actor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        let tracker = Cinnamon.WindowTracker.get_default();
        tracker.connect('notify::focus-app', Lang.bind(this, this._onStateChanged));
        this._stateChangedId = this.app.connect('notify::state',
                                             Lang.bind(this, this._onStateChanged));
        this._onStateChanged();
    },

    _onDestroy: function() {
        if (this._stateChangedId > 0)
            this.app.disconnect(this._stateChangedId);
        this._stateChangedId = 0;
        //also destroy menu created from this icon if it happens to be opened
        //otherwise popModal (ungrab) will throw exception because:
        //there will be a popup menu without a parent (dockicon)
        //hitting ESC will try to popModal (ungrab) focus on menu and give it back to parent (dockicon)
        //but parent is already removed by dock._redisplay removeAll()
        this._menu.emit('destroy');
    },

    _onStateChanged: function() {
        let tracker = Cinnamon.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (this.app.state != Cinnamon.AppState.STOPPED) {
            this.actor.add_style_class_name('running');
            if (this.app == focusedApp) {
                this.actor.add_style_class_name('focused');
            } else {
                this.actor.remove_style_class_name('focused');
            }
        } else {
            this.actor.remove_style_class_name('focused');
            this.actor.remove_style_class_name('running');
        }
    },

    _onButtonPress: function(actor, event) {
        //if dock settings menu is open then close it first no matter what button
        if (this._dock._menu.isOpen) {
                this._dock._menu.toggle();
                return true;
        }

        if (this._menu.isOpen) { 
                this._menu.toggle();
                return true;
        }

        let button = event.get_button();
        if (button == 1) {
                this._onActivate(Clutter.get_current_event());
                return true;
        } else if (button == 3) {
                this._dock._disableHideDock();
                this._menu.toggle();
                return true;
        }
        return false;
     },

    getId: function() {
        return this.app.get_id();
    },

    _getRunning: function() {
        return this.app.state != Cinnamon.AppState.STOPPED;
    },

    _onActivate: function (event) {
        this.emit('launching');
        let modifiers = Cinnamon.get_event_state(event);

        if (modifiers & Clutter.ModifierType.CONTROL_MASK
            && this.app.state == Cinnamon.AppState.RUNNING) {
            let current_workspace = global.screen.get_active_workspace().index();
            this.app.open_new_window(current_workspace);
        } else {
            let tracker = Cinnamon.WindowTracker.get_default();
            let focusedApp = tracker.focus_app;

            if (this.app == focusedApp) {
                let windows = this.app.get_windows();
                let current_workspace = global.screen.get_active_workspace();
                for (let i = 0; i < windows.length; i++) {
                    let w = windows[i];
                    if (w.get_workspace() == current_workspace)
                        w.minimize();
                }
            } else {
                this.app.activate(-1);
            }
        }
        //Main.overview.hide();
    }

};
Signals.addSignalMethods(DockIcon.prototype);

function init(extensionMeta) {
    imports.gettext.bindtextdomain('cinnamon-extensions', extensionMeta.localedir);
}

let dock;

function enable() {
    dock = new Dock();
}

function disable() {
    dock.destroy();
    dock = null;
}
