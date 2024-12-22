
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const ExtensionSystem = imports.ui.extensionSystem;

let workspaceScroller;

/**
 * Area positions enum
 */
const AreaPosition = {
    Top: 1,
    Bottom: 2,
    Left: 4,
    Right: 8,
    TopLeft: 5,
    BottomLeft: 6,
    TopRight: 9,
    BottomRight: 10,
};

/**
 * Area actions enum
 */
const Action = {
    None: 0,
    Left: 1,
    Right: 2,
    Expo: 4
};

/**
 * Scroll action area
 * ==================
 */
function Area(x, y, dx, dy, actionUp, actionDown) {
    this._init(x, y, dx, dy, actionUp, actionDown);
}

function getWorkspaceSwitcherExt() {
   let workspaceSwitcherExt;
   // Check if one of the workspace switcher extensions are installed or if the state has changed since we last checked
   if (ExtensionSystem.runningExtensions.indexOf('DesktopCube@yare') > -1 ) {
      workspaceSwitcherExt = ExtensionSystem.extensions['DesktopCube@yare']['5.4']['extension'];
   } else if (ExtensionSystem.runningExtensions.indexOf('Flipper@connerdev') > -1) {
      workspaceSwitcherExt = ExtensionSystem.extensions['Flipper@connerdev']['5.4']['extension'];
   }
   // Make sure the switcher extension has the required API to allow us to change to any arbitrary workspace
   if (workspaceSwitcherExt && typeof workspaceSwitcherExt.ExtSwitchToWorkspace !== "function") {
      workspaceSwitcherExt =  null;
   }
   return workspaceSwitcherExt
}


/**
 * Initialize scroll action area
 */
Area.prototype._init = function (x, y, dx, dy, actionUp, actionDown) {
    this.button = new St.Button();

    this.button.set_position(x + (dx < 0 ? dx : 0), y + (dy < 0 ? dy : 0));
    this.button.set_width(Math.abs(dx));
    this.button.set_height(Math.abs(dy));
    this.button.opacity = 0;

    this.button.connect('scroll-event', this.onScroll.bind(this));

    Main.layoutManager.addChrome(this.button, { visibleInFullscreen: true });

    this.actionUp = actionUp;
    this.actionDown = actionDown;
};

/**
 * Area's scroll handler
 */
Area.prototype.onScroll = function (actor, event) {
    var scrollDirection = event.get_scroll_direction();

    if (scrollDirection === Clutter.ScrollDirection.SMOOTH) {
        return Clutter.EVENT_PROPAGATE;
    }

    let direction = scrollDirection,
        action = direction ? this.actionDown : this.actionUp;

    switch (action) {
        case Action.Left: this.slide(-1); break;
        case Action.Right: this.slide(1); break;
        case Action.Expo: this.showExpo(); break;
    }
}

/**
 * Slides to another workspace
 */
Area.prototype.slide = function (shift) {
    let index = global.screen.get_active_workspace_index() + shift,
        workspace = global.screen.get_workspace_by_index(index);

    if (workspace != null) {
        let workspaceSwitcherExt = (workspaceScroller.settings.settings.getValue("useSwitcherExtension"))?getWorkspaceSwitcherExt():null;
        if (workspaceSwitcherExt) {
           workspaceSwitcherExt.ExtSwitchToWorkspace(workspace);
        } else {
           workspace.activate(global.get_current_time());
        }
    }
}

/**
 * Show sexpo
 */
Area.prototype.showExpo = function () {
    if (!Main.expo.animationInProgress) {
        Main.expo.show();
    }
}

/**
 * Destroy area
 */
Area.prototype.destroy = function () {
    this.button.destroy();
}


/**
 * Settings  Handler
 * =================
 */
function SettingsHandler(uuid, callback, context) {
    let names = ['cornerSize'];

    for (let position in AreaPosition) {
        if (!position) continue;

        names.push(position);
        names.push(position + 'Up');
        names.push(position + 'Down');
    }

    this._init(uuid, names, callback, context);
}

/**
 * Initialize settings handler
 */
SettingsHandler.prototype._init = function (uuid, names, callback, context) {
    this.settings = new Settings.ExtensionSettings(this, uuid);

    let onChange = callback.bind(context);

    for (let index = 0, length = names.length; index < length; index++) {
        let name = names[index];

        this.settings.bindProperty(Settings.BindingDirection.IN, name, name, onChange);
    }
}


/**
 * Main workspace scroller extension class
 */
function Extension(metadata) {
    this._init(metadata);
}

/**
 * Initialize extension
 */
Extension.prototype._init = function (metadata) {
    this.metadata = metadata;
    this.areas = [];

    this.settings = new SettingsHandler(metadata.uuid, this.update, this);
}

/**
 * Verifies that the position to the left, right, top, bottom
 */
Extension.prototype.isEdgePosition = function(position) {
    return !(position & (position - 1));
}

/**
 * Creates scroll action areas 
 */
Extension.prototype.createAreas = function () {
    this.areas = [];

    let monitor = Main.layoutManager.primaryMonitor;
    let cornerSize = this.settings.cornerSize || 10;

    for (let name in AreaPosition) {

        if (!name) continue;

        let actionUp = Action[this.settings[name + 'Up']];
        let actionDown = Action[this.settings[name + 'Down']];

        if (this.settings[name] && (actionUp || actionDown)) {
            let position = AreaPosition[name],
                x = 0,
                y = 0,
                dx = 1,
                dy = 1,
                dx2, dy2;

            if (this.isEdgePosition(position)) {
                if (position & (AreaPosition.Top | AreaPosition.Bottom)) {
                    x = cornerSize;
                    dx = monitor.width - cornerSize * 2;

                    if (position & AreaPosition.Bottom) {
                        y = monitor.height;
                        dy = -1;
                    }
                }

                if (position & (AreaPosition.Left | AreaPosition.Right)) {
                    y = cornerSize;
                    dy = monitor.height - cornerSize * 2;

                    if (position & AreaPosition.Right) {
                        x = monitor.width;
                        dx = -1;
                    }
                }
            } else {
                dx2 = dy2 = cornerSize;

                if (position & AreaPosition.Bottom) {
                    y = monitor.height;
                    dy *= -1;
                    dy2 *= -1;
                }

                if (position & AreaPosition.Right) {
                    x = monitor.width;
                    dx *= -1;
                    dx2 *= -1;
                }
            }

            this.areas.push(new Area(x, y, dx, dy, actionUp, actionDown));

            if (dx2 && dy2) {
                this.areas.push(new Area(x, y, dx2, dy2, actionUp, actionDown));
            }
        }
    }
}

/**
 * Removes scroll action areas 
 */
Extension.prototype.clearAreas = function () {
    if (this.areas) {
        for (let index = 0, length = this.areas.length; index < length; index++) {
            this.areas[index].destroy();
        }

        this.areas = [];
    }
}

/**
 * Updates extension
 */
Extension.prototype.update = function () {
    this.clearAreas();
    this.createAreas();
}

/**
 * Enables extension
 */
Extension.prototype.enable = function () {
    this.createAreas();
}

/**
 * Disables extension
 */
Extension.prototype.disable = function () {
    this.clearAreas();
}

/**
 * Called when extension is loaded
 */
function init(metadata) {
    workspaceScroller = new Extension(metadata);
}

/**
 * Called when extension is loaded
 */
function enable() {
    workspaceScroller.enable();
}

/**
 * Called when extension gets disabled
 */
function disable() {
    workspaceScroller.disable();
}
