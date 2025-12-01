const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;

let settings;
let originalY;
let sizeCheckTimeout;
let lastWidth = 0;
let menuSignals = [];
let trackedMenus = [];
let focusSignal;
let pointerWatcher;
let isHidden = false;

function init(metadata) {
}

function enable() {
    settings = new Settings.ExtensionSettings(this, "centered-cinnamon-dock@mostlynick3");
    originalY = Main.panel.actor.y;
    
    if (settings.getValue("no-window-shift")) {
        Main.layoutManager._chrome.modifyActorParams(Main.panel.actor, { affectsStruts: false });
    }
    
    settings.bind("transparency", "transparency", function() {
        applyStyle();
    });
    settings.bind("height-offset", "heightOffset", function() {
        applyStyle();
        updateMenuPositions();
    });
    settings.bind("auto-hide", "autoHide", function() {
        toggleAutoHide();
    });
    settings.bind("hover-pixels", "hoverPixels", function() {
        if (settings.getValue("auto-hide")) {
            disableAutoHide();
            enableAutoHide();
        }
    });
    settings.bind("no-window-shift", "noWindowShift", function() {
        if (settings.getValue("no-window-shift")) {
            Main.layoutManager._chrome.modifyActorParams(Main.panel.actor, { affectsStruts: false });
        } else {
            Main.layoutManager._chrome.modifyActorParams(Main.panel.actor, { affectsStruts: true });
        }
    });
    settings.bind("animation-time", "animationTime", function() {
    });
    settings.bind("show-on-no-focus", "showOnNoFocus", function() {
        if (settings.getValue("auto-hide")) {
            disableAutoHide();
            enableAutoHide();
        }
    });
    
    let panelActor = Main.panel.actor;
    menuSignals.push(panelActor.connect('style-changed', function() {
        Mainloop.timeout_add(10, function() {
            applyStyle();
            return false;
        });
    }));
    
    menuSignals.push(global.stage.connect('actor-added', function(stage, actor) {
        if (actor.has_style_class_name && actor.has_style_class_name('popup-menu')) {
            trackedMenus.push(actor);
            updateMenuPosition(actor);
        }
    }));
    
    startSizeMonitoring();
    toggleAutoHide();
}

function hasActiveMenus() {
    if (trackedMenus.length > 0) {
        for (let i = 0; i < trackedMenus.length; i++) {
            let menu = trackedMenus[i];
            if (menu && !menu.is_finalized() && menu.visible) {
                return true;
            }
        }
    }
    
    if (Main.panel._menus) {
        for (let i = 0; i < Main.panel._menus._menus.length; i++) {
            let menu = Main.panel._menus._menus[i];
            if (menu.menu && menu.menu.isOpen) {
                return true;
            }
        }
    }
    
    if (Main.panel._leftBox) {
        let boxes = [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
        for (let box of boxes) {
            let children = box.get_children();
            for (let child of children) {
                if (child._applet && child._applet.menu && child._applet.menu.isOpen) {
                    return true;
                }
                if (child._delegate && child._delegate.menu && child._delegate.menu.isOpen) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

function toggleAutoHide() {
    if (settings.getValue("auto-hide")) {
        enableAutoHide();
    } else {
        disableAutoHide();
    }
}

function enableAutoHide() {
    focusSignal = global.display.connect('notify::focus-window', function() {
        let [x, y, mods] = global.get_pointer();
        let screenHeight = global.screen_height;
        let screenWidth = global.screen_width;
        let heightOffset = settings.getValue("height-offset");
        let panelHeight = Main.panel.actor.height;
        let panelTop = originalY + heightOffset;
        let panelBottom = panelTop + panelHeight;
        let panelLeft = (screenWidth - lastWidth) / 2;
        let panelRight = panelLeft + lastWidth;
        
        if (y >= panelTop && y <= panelBottom && x >= panelLeft && x <= panelRight) {
            return;
        }
        
        let focusWindow = global.display.focus_window;
        if (focusWindow && focusWindow.window_type === Meta.WindowType.NORMAL) {
            hidePanel();
        } else {
            if (settings.getValue("show-on-no-focus")) {
                showPanel();
            } else {
                hidePanel();
            }
        }
    });
    
    pointerWatcher = Mainloop.timeout_add(100, function() {
        let [x, y, mods] = global.get_pointer();
        let screenHeight = global.screen_height;
        let screenWidth = global.screen_width;
        let hoverPixels = settings.getValue("hover-pixels");
        let heightOffset = settings.getValue("height-offset");
        let panelHeight = Main.panel.actor.height;
        let panelTop = originalY + heightOffset;
        let panelBottom = panelTop + panelHeight;
        
        let panelLeft = (screenWidth - lastWidth) / 2;
        let panelRight = panelLeft + lastWidth;
        
        let menusActive = hasActiveMenus();
        let mouseOverDock = (y >= panelTop && y <= panelBottom && x >= panelLeft && x <= panelRight) ||
                            (y >= screenHeight - hoverPixels && x >= panelLeft && x <= panelRight);
        
        if (menusActive || mouseOverDock) {
            if (isHidden) {
                showPanel();
            }
        } else {
            let focusWindow = global.display.focus_window;
            let onDesktop = !focusWindow || focusWindow.window_type !== Meta.WindowType.NORMAL;
            let showOnNoFocus = settings.getValue("show-on-no-focus");
            
            if (!onDesktop || (onDesktop && !showOnNoFocus)) {
                if (!isHidden) {
                    hidePanel();
                }
            }
        }
        
        return true;
    });
}

function hidePanel() {
    if (!isHidden) {
        if (hasActiveMenus()) {
            return;
        }
        
        let panel = Main.panel.actor;
        let animTime = settings.getValue("animation-time") / 1000.0;
        
        Tweener.removeTweens(panel);
        Tweener.addTween(panel, {
            opacity: 0,
            time: animTime,
            transition: 'easeOutQuad',
            onComplete: function() {
                panel.hide();
                isHidden = true;
            }
        });
    }
}

function showPanel() {
    if (isHidden) {
        let panel = Main.panel.actor;
        let animTime = settings.getValue("animation-time") / 1000.0;
        
        Tweener.removeTweens(panel);
        panel.show();
        panel.opacity = 0;
        isHidden = false;
        
        Mainloop.timeout_add(50, function() {
            checkAndApplyStyle();
            Tweener.addTween(panel, {
                opacity: 255,
                time: animTime,
                transition: 'easeOutQuad'
            });
            return false;
        });
    }
}

function disableAutoHide() {
    if (focusSignal) {
        global.display.disconnect(focusSignal);
        focusSignal = null;
    }
    if (pointerWatcher) {
        Mainloop.source_remove(pointerWatcher);
        pointerWatcher = null;
    }
    
    let panel = Main.panel.actor;
    Tweener.removeTweens(panel);
    panel.opacity = 255;
    panel.show();
    isHidden = false;
}

function updateMenuPositions() {
    trackedMenus.forEach(menu => {
        if (menu && !menu.is_finalized()) {
            updateMenuPosition(menu);
        }
    });
}

function updateMenuPosition(menu) {
    let heightOffset = settings.getValue("height-offset");
    Mainloop.timeout_add(1, function() {
        if (menu && !menu.is_finalized()) {
            menu.y = menu.y + heightOffset;
        }
        return false;
    });
}

function startSizeMonitoring() {
    sizeCheckTimeout = Mainloop.timeout_add(100, function() {
        if (!isHidden) {
            checkAndApplyStyle();
        }
        return true;
    });
}

function checkAndApplyStyle() {
    let contentWidth = 0;
    contentWidth += Main.panel._leftBox.get_children().reduce((sum, child) => sum + child.width, 0);
    contentWidth += Main.panel._centerBox.get_children().reduce((sum, child) => sum + child.width, 0);
    contentWidth += Main.panel._rightBox.get_children().reduce((sum, child) => sum + child.width, 0);
    
    let newWidth = contentWidth + 10;
    
    if (newWidth !== lastWidth) {
        lastWidth = newWidth;
        applyStyle();
    }
}

function applyStyle() {
    let panel = Main.panel.actor;
    let transparency = settings.getValue("transparency") / 100.0;
    let heightOffset = settings.getValue("height-offset");
    let screenWidth = global.screen_width;
    
    let margin = (screenWidth - lastWidth) / 2;
    
    panel.set_style(
        'background-color: rgba(30, 30, 30, ' + transparency + ');' +
        'border-radius: 12px;' +
        'padding: 0px 20px;' +
        'margin-left: ' + margin + 'px;' +
        'margin-right: ' + margin + 'px;' +
        'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);'
    );
    
    panel.y = originalY + heightOffset;
}

function disable() {
    disableAutoHide();
    
    if (sizeCheckTimeout) {
        Mainloop.source_remove(sizeCheckTimeout);
        sizeCheckTimeout = null;
    }
    
    menuSignals.forEach(signal => {
        if (signal.obj) {
            signal.obj.disconnect(signal.id);
        } else {
            Main.panel.actor.disconnect(signal);
        }
    });
    menuSignals = [];
    trackedMenus = [];
    
    if (settings) settings.finalize();
    
    let panel = Main.panel.actor;
    Tweener.removeTweens(panel);
    panel.set_style('');
    panel.y = originalY;
    panel.opacity = 255;
    
    Main.layoutManager._chrome.modifyActorParams(Main.panel.actor, { affectsStruts: true });
}
