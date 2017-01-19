

const AltTab = imports.ui.altTab;
const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Lang = imports.lang;
const St = imports.gi.St;
const Gdk = imports.gi.Gdk;
const IconGrid = imports.ui.iconGrid;
const Tweener = imports.ui.tweener;

const MODES = {
    native: function() {
            Main.wm._startAppSwitcher();
    },
    workspace_thumbnails: function() {
            new AltTabPopupW().show();
    }
};

const thumbnailEnabled = true;

function AltTabPopupW() {
    this._init();
}

AltTabPopupW.prototype = {
    __proto__ : AltTab.AltTabPopup.prototype,

    show : function(backward, switch_group, mask) {
        let apps = get_running_apps();

        if (!apps.length)
            return false;

        if (!Main.pushModal(this.actor))
            return false;
        this._haveModal = true;

        this.actor.connect('key-press-event', Lang.bind(this, this._keyPressEventLocal));
        this.actor.connect('key-release-event', Lang.bind(this, this._keyReleaseEvent));

        this.actor.connect('button-press-event', Lang.bind(this, this._clickedOutside));
        this.actor.connect('scroll-event', Lang.bind(this, this._onScroll));

        this._appSwitcher = new WindowSwitcher(apps, this);
        this.actor.add_actor(this._appSwitcher.actor);
        this._appSwitcher.connect('item-activated', Lang.bind(this, this._appActivated));
        this._appSwitcher.connect('item-entered', Lang.bind(this, this._appEntered));

        this._appIcons = this._appSwitcher.icons;
        
        this.actor.opacity = 0;
        this.actor.show();
        this.actor.get_allocation_box();

        // Make the initial selection
        if (switch_group) {
            if (backward) {
                this._select(0, this._appIcons[0].cachedWindows.length - 1);
            } else {
                if (this._appIcons[0].cachedWindows.length > 1)
                    this._select(0, 1);
                else
                    this._select(0, 0);
            }
        } else if (this._appIcons.length == 1) {
            this._select(0);
        } else if (backward) {
            this._select(this._appIcons.length - 1);
        } else {
            this._select(1);
        }

        // There's a race condition; if the user released Alt before
        // we got the grab, then we won't be notified. (See
        // https://bugzilla.gnome.org/show_bug.cgi?id=596695 for
        // details.) So we check now. (Have to do this after updating
        // selection.)
        let [x, y, mods] = global.get_pointer();
        if (!(mods & Gdk.ModifierType.MOD1_MASK)) {
            this._finish();
            return false;
        }

        this.actor.opacity = 0;
        this.actor.show();
        
        Tweener.addTween(this.actor, {
            opacity: 255,
            time: 0.2,
            transition: 'easeOutQuad'
        });
                         
        // We delay showing the popup so that fast Alt+Tab users aren't
        // disturbed by the popup briefly flashing.
        this._initialDelayTimeoutId = Mainloop.timeout_add(POPUP_DELAY_TIMEOUT,
                                                           Lang.bind(this, function () {
                                                               this.actor.opacity = 255;
                                                               this._initialDelayTimeoutId = 0;
                                                           }));

        return true;
    },


    _finish : function() {
        let app = this._appIcons[this._currentApp];
        Main.activateWindow(app.cachedWindows[0]);
        this.destroy();
    },
    
    _keyPressEventLocal : function(actor, event) {
        let keysym = event.get_key_symbol();

        if (keysym == Clutter.Down) {
            return false;
        }
        
        this._keyPressEvent(actor,event);
    },

    _keyReleaseEvent : function(actor, event) {
        let [x, y, mods] = global.get_pointer();
        let state = mods & Gdk.ModifierType.MOD1_MASK;

        if (state == 0)
            this._finish();

        return true;
    }

};

function AppIcon(app, window) {
    this._init(app, window);
}

AppIcon.prototype = {
    __proto__ : AltTab.AppIcon.prototype,

    _init: function(app, window) {
        this.app = app;

        let windowMutter = null;
        
        // Create a window thumbnail
        if (thumbnailEnabled) {
            if (windowMutter = window.get_compositor_private()) {

                let iconSize = 32;
                let iconOverlap = 3;
                
                let texture = windowMutter.get_texture();
                let [width, height] = texture.get_size();
                let scale = Math.min(1.0, 155 / height, 155 / width);
                
                let iconLeft = width * scale - (iconSize - iconOverlap);
                let iconTop = height * scale - (iconSize - iconOverlap);
                
                this._thumbnail = new Clutter.Clone ({
                    source: texture,
                    reactive: true,
                    width: width * scale,
                    height: height * scale
                });
                
                this._thumbnailIcon = this.app.create_icon_texture(iconSize);
                this._thumbnailIcon.set_position(iconLeft, iconTop);
            }
        } else {
            this._thumbnail = null;
        }


        this.cachedWindows = [];
        this.cachedWindows.push(window);

        this._iconBin = new St.Bin({ x_fill: true, y_fill: true });
        this.actor = new St.BoxLayout({ style_class: 'alt-tab-app', vertical: true });
        
        if (this._thumbnail == null) {
            this.actor.add(this._iconBin, { x_fill: false, y_fill: false });
        } else {
            this.actor.add(this._thumbnail);
            this.actor.add(this._thumbnailIcon);
            this.actor.thumbWidth = this._thumbnailIcon.get_position()[0];
        }
        
        this.icon = null;
                
        let title = window.get_title();
        if (title) {
            this.label = new St.Label({ text: title });
            let bin = new St.Bin({ x_align: St.Align.MIDDLE });
            bin.add_actor(this.label);
            this.actor.add(bin);
        }
        else {
            this.label = new St.Label({ text: this.app.get_name() });
            this.actor.add(this.label, { x_fill: false });
        }
    }
};

function WindowSwitcher(apps, altTabPopup) {
    this._init(apps, altTabPopup);
}

WindowSwitcher.prototype = {
    __proto__ : AltTab.AppSwitcher.prototype,

    _init : function(apps, altTabPopup) {
        AltTab.SwitcherList.prototype._init.call(this, true);

        // Construct the AppIcons, sort by time, add to the popup
        let activeWorkspace = global.screen.get_active_workspace();
        let workspaceIcons = [];
        let otherIcons = [];
        for (let i = 0; i < apps.length; i++) {
            // Cache the window list now; we don't handle dynamic changes here,
            // and we don't want to be continually retrieving it
            let windows = apps[i].get_windows();

            for(let j = 0; j < windows.length; j++) {
                let appIcon = new AppIcon(apps[i], windows[j]);
                if (this._isWindowOnWorkspace(windows[j], activeWorkspace)) {
                  workspaceIcons.push(appIcon);
                } else {
                    if (thumbnailEnabled == false) {
                        otherIcons.push(appIcon);
                    }
                }
            }
        }

        workspaceIcons.sort(Lang.bind(this, this._sortAppIcon));
        otherIcons.sort(Lang.bind(this, this._sortAppIcon));

        if(otherIcons.length > 0) {
            let mostRecentOtherIcon = otherIcons[0];
            otherIcons = [];
            otherIcons.push(mostRecentOtherIcon);
        }

        this.icons = [];
        this._arrows = [];

        if (thumbnailEnabled) {
            this.iconGrid = new IconGrid.IconGrid({ xAlign: St.Align.MIDDLE });
            
            this._scrollableRight = false;
            this._heightIsSet = false;
            this._clipBin.child = this.iconGrid.actor;
            
            this.iconGrid.actor.set_style_class_name('icon-grid-thumb');

            this.actor.add_actor(this.iconGrid.actor);
            this.actor.set_style_class_name('switcher-list-thumb');
            
            this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeightThumb));
            this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidthThumb));
        }

        for (let i = 0; i < workspaceIcons.length; i++)
            if (thumbnailEnabled) {
                this._addThumbnail(workspaceIcons[i]);
            } else {
                this._addIcon(workspaceIcons[i]);
            }

        if (thumbnailEnabled) {
            if (workspaceIcons.length > 0 && otherIcons.length > 0)
                this.addSeparator();
            for (let i = 0; i < otherIcons.length; i++)
                    this._addIcon(otherIcons[i]);
        }


        this._curApp = -1;
        this._iconSize = 0;
        this._altTabPopup = altTabPopup;
        this._mouseTimeOutId = 0;
    },

    _addThumbnail: function(appIcon) {
        this.icons.push(appIcon);
        this.addItemThumb(appIcon.actor, appIcon.label);
        
        // The arrow is not used, but the native AltTab extension expects it to exist.
        let arrow = new St.DrawingArea({ style_class: 'switcher-arrow' });
        this._list.add_actor(arrow);
        this._arrows.push(arrow);
        arrow.hide();
    },

    addItemThumb : function(item, label) {
        let bbox = new St.Button({ style_class: 'item-box', reactive: true });
        
        bbox.set_child(item);
        bbox.item_actor = item;
        bbox.label_actor = label;

        this.iconGrid.addItem(bbox);

        this._items.push(bbox);
    },

    _getPreferredWidthThumb: function() {
        let columnLimit = Math.floor(global.screen_width / this.iconGrid._item_size);
        
        // Adjust the label-width of the St.Button to prevent stretching of the Thumbnail.
        // Only if the label is longer than the thumbnail, otherwise it will mess up text-alignment.
        this.iconGrid._getVisibleChildren().forEach(Lang.bind(this, function (child) {
            if (child.item_actor.thumbWidth < child.label_actor.get_width()) {
                child.label_actor.set_width(child.item_actor.thumbWidth);
            }
        }));
        
        this.iconGrid._colLimit = columnLimit;
    },

    _getPreferredHeightThumb: function() {
        let maxThumbHeight = 0;
        let backgoundPadding = 40;
        
        let columnLimit = Math.floor(global.screen_width / this.iconGrid._item_size);
        let nRows = Math.ceil(this.iconGrid._getVisibleChildren().length / columnLimit);
        
        // Prevent height twitching.
        if (this._heightIsSet) {
            return;
        }
        this._heightIsSet = true;

        global.log(nRows);

        // Get the maximum thumbnail height so we can adjust the background actor accordingly
        this.iconGrid._getVisibleChildren().forEach(Lang.bind(this, function (child) {
            if (child.item_actor.get_height() > maxThumbHeight) {
                maxThumbHeight = child.item_actor.get_height();
            }
        }));
        
        this.actor.set_height((maxThumbHeight + backgoundPadding) * nRows);
    },

    _isWindowOnWorkspace: function(w, workspace) {
            if (w.get_workspace() == workspace)
                return true;
        return false;
    },

    _sortAppIcon : function(appIcon1, appIcon2) {
        let t1 = appIcon1.cachedWindows[0].get_user_time();
        let t2 = appIcon2.cachedWindows[0].get_user_time();
        if (t2 > t1) return 1;
        else return -1;
    }
};

function get_running_apps() {
    let metaWorkspace = global.screen.get_active_workspace();
    let windows = metaWorkspace.list_windows();
    let tracker = Cinnamon.WindowTracker.get_default();
    
    var apps = new Array();
    
    for (let i = 0; i < windows.length; i++) {
        let metaWindow = windows[i];
        
        if (metaWindow && tracker.is_window_interesting(metaWindow)) {
            let app = tracker.get_window_app(windows[i]);
            
            if (apps.indexOf(app) == -1) {
                apps.push(app);
            }
        }
    }
    
    return apps;
}

function doAltTab(shellwm, binding, window, backwards) {
    MODES['workspace_thumbnails'](binding, backwards);
}

function init() {
    global.log('init');
}

function enable() {
    Main.wm.setKeybindingHandler('switch_windows', doAltTab);
    Main.wm.setKeybindingHandler('switch_group', doAltTab);
    Main.wm.setKeybindingHandler('switch_windows_backward', doAltTab);
    Main.wm.setKeybindingHandler('switch_group_backward', doAltTab);
}

function disable() {
    Main.wm.setKeybindingHandler('switch_windows', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Main.wm.setKeybindingHandler('switch_group', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Main.wm.setKeybindingHandler('switch_windows_backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
    Main.wm.setKeybindingHandler('switch_group_backward', Lang.bind(Main.wm, Main.wm._startAppSwitcher));
}
