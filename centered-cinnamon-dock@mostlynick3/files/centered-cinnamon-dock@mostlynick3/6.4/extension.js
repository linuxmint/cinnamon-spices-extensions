const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;

let settings;
let panelStates = {};
let sizeCheckTimeout;
let pointerWatcher;
let workspaceSignal;
let actorAddedSignal;
let editModeSignal;
let isInEditMode = false;

function init(metadata) {
}

function enable() {
    settings = new Settings.ExtensionSettings(this, "centered-cinnamon-dock@mostlynick3");
    
    settings.bind("transparency", "transparency", function() {
        if (!isInEditMode) {
            applyStyleToAll();
        }
    });
    settings.bind("height-offset", "heightOffset", function() {
        if (!isInEditMode) {
            applyStyleToAll();
            updateMenuPositions();
        }
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
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                if (settings.getValue("no-window-shift")) {
                    Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: false });
                } else {
                    Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: true });
                }
            }
        });
    });
    settings.bind("animation-time", "animationTime", function() {
    });
    settings.bind("show-on-no-focus", "showOnNoFocus", function() {
        if (settings.getValue("auto-hide")) {
            disableAutoHide();
            enableAutoHide();
        }
    });
    settings.bind("panel-mode", "panelMode", function() {
        cleanupAllPanels();
        Mainloop.timeout_add(50, function() {
            initializePanels();
            return false;
        });
    });
    
    isInEditMode = global.settings.get_boolean("panel-edit-mode");
    
    editModeSignal = global.settings.connect("changed::panel-edit-mode", function() {
        let newEditMode = global.settings.get_boolean("panel-edit-mode");
        if (newEditMode !== isInEditMode) {
            isInEditMode = newEditMode;
            handleEditModeChange();
        }
    });
    
    initializePanels();
}

function handleEditModeChange() {
    if (isInEditMode) {
        enterEditMode();
    } else {
        exitEditMode();
    }
}

function enterEditMode() {
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel)) {
            let state = panelStates[panel.panelId];
            if (state) {
                state.savedOpacity = panel.actor.opacity;
                state.wasHidden = state.isHidden;
                
                Tweener.removeTweens(panel.actor);
                panel.actor.set_style('');
                panel.actor.y = state.originalY;
                panel.actor.opacity = 255;
                panel.actor.show();
            }
        }
    });
}

function exitEditMode() {
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel)) {
            let state = panelStates[panel.panelId];
            if (state) {
                state.originalY = panel.actor.y;
            }
        }
    });
    
    Mainloop.timeout_add(150, function() {
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                let state = panelStates[panel.panelId];
                if (state) {
                    state.lastWidth = 0;
                    checkAndApplyStyle(panel, true);
                    
                    if (state.wasHidden && settings.getValue("auto-hide")) {
                        Mainloop.timeout_add(100, function() {
                            state.isHidden = false;
                            hidePanel(panel);
                            return false;
                        });
                    }
                }
            }
        });
        return false;
    });
}

function cleanupAllPanels() {
    disableAutoHide();
    
    if (sizeCheckTimeout) {
        Mainloop.source_remove(sizeCheckTimeout);
        sizeCheckTimeout = null;
    }
    
    if (workspaceSignal) {
        global.screen.disconnect(workspaceSignal);
        workspaceSignal = null;
    }
    
    if (actorAddedSignal) {
        global.stage.disconnect(actorAddedSignal);
        actorAddedSignal = null;
    }
    
    if (editModeSignal) {
        global.settings.disconnect(editModeSignal);
        editModeSignal = null;
    }
    
    Main.panelManager.panels.forEach(panel => {
        let state = panelStates[panel.panelId];
        
        if (state) {
            state.menuSignals.forEach(signal => {
                if (signal.obj && signal.id) {
                    try {
                        signal.obj.disconnect(signal.id);
                    } catch(e) {}
                }
            });
            
            Tweener.removeTweens(panel.actor);
            panel.actor.set_style('');
            panel.actor.y = state.originalY;
            panel.actor.opacity = 255;
            panel.actor.show();
            Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: true });
        }
    });
    
    panelStates = {};
}

function initializePanels() {
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel)) {
            initPanel(panel);
        }
    });
    
    actorAddedSignal = global.stage.connect('actor-added', function(stage, actor) {
        if (actor.has_style_class_name && actor.has_style_class_name('popup-menu')) {
            Main.panelManager.panels.forEach(panel => {
                if (shouldApplyToPanel(panel)) {
                    let state = panelStates[panel.panelId];
                    if (state) {
                        state.trackedMenus.push(actor);
                        if (!isInEditMode) {
                            updateMenuPosition(panel, actor);
                        }
                    }
                }
            });
        }
    });
    
    workspaceSignal = global.screen.connect('workspace-switched', function() {
        if (isInEditMode) return;
        
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                let state = panelStates[panel.panelId];
                if (state && !state.isHidden) {
                    Mainloop.timeout_add(200, function() {
                        checkAndApplyStyle(panel);
                        return false;
                    });
                }
            }
        });
    });
    
    Mainloop.timeout_add(100, function() {
        if (!isInEditMode) {
            Main.panelManager.panels.forEach(panel => {
                if (shouldApplyToPanel(panel)) {
                    checkAndApplyStyle(panel);
                }
            });
        }
        startSizeMonitoring();
        toggleAutoHide();
        return false;
    });
}

function getPanelLocation(panel) {
    let monitor = Main.layoutManager.findMonitorForActor(panel.actor);
    if (!monitor) return "unknown";
    
    let panelY = panel.actor.y;
    let panelX = panel.actor.x;
    let panelWidth = panel.actor.width;
    let panelHeight = panel.actor.height;
    
    if (panelY <= monitor.y + 10) {
        return "top";
    } else if (panelY + panelHeight >= monitor.y + monitor.height - 10) {
        return "bottom";
    } else if (panelX <= monitor.x + 10) {
        return "left";
    } else if (panelX + panelWidth >= monitor.x + monitor.width - 10) {
        return "right";
    }
    
    return "unknown";
}

function shouldApplyToPanel(panel) {
    let mode = settings.getValue("panel-mode");
    let location = getPanelLocation(panel);
    
    if (mode === "main") {
        return panel === Main.panel;
    } else if (mode === "bottom") {
        return location === "bottom";
    } else if (mode === "top") {
        return location === "top";
    } else if (mode === "both") {
        return location === "bottom" || location === "top";
    }
    
    return false;
}

function initPanel(panel) {
    panelStates[panel.panelId] = {
        originalY: panel.actor.y,
        lastWidth: 0,
        menuSignals: [],
        trackedMenus: [],
        isHidden: false,
        location: getPanelLocation(panel),
        savedOpacity: 255,
        wasHidden: false
    };
    
    let state = panelStates[panel.panelId];
    
    if (settings.getValue("no-window-shift")) {
        Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: false });
    }
    
    let styleSignal = panel.actor.connect('style-changed', function() {
        if (isInEditMode) return;
        
        Mainloop.timeout_add(10, function() {
            applyStyle(panel);
            return false;
        });
    });
    state.menuSignals.push({ obj: panel.actor, id: styleSignal });
}

function cleanupTrackedMenus(panel) {
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    state.trackedMenus = state.trackedMenus.filter(menu => {
        try {
            return menu && !menu.is_finalized();
        } catch(e) {
            return false;
        }
    });
}

function hasActiveMenus(panel) {
    let state = panelStates[panel.panelId];
    if (!state) return false;
    
    cleanupTrackedMenus(panel);
    
    for (let i = 0; i < state.trackedMenus.length; i++) {
        let menu = state.trackedMenus[i];
        try {
            if (menu.visible) {
                return true;
            }
        } catch(e) {
            continue;
        }
    }
    
    if (panel._menus) {
        for (let i = 0; i < panel._menus._menus.length; i++) {
            let menu = panel._menus._menus[i];
            if (menu.menu && menu.menu.isOpen) {
                return true;
            }
        }
    }
    
    if (panel._leftBox) {
        let boxes = [panel._leftBox, panel._centerBox, panel._rightBox];
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

function isMouseOverDockOrMenus(panel) {
    let [x, y, mods] = global.get_pointer();
    let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
    
    if (!actor) {
        return false;
    }
    
    while (actor) {
        if (actor === panel.actor) {
            return true;
        }
        
        if (actor._delegate && actor._delegate._applet && 
            panel.actor.contains(actor._delegate._applet.actor)) {
            return true;
        }
        
        if (actor.has_style_class_name && 
            (actor.has_style_class_name('popup-menu') || 
             actor.has_style_class_name('menu') ||
             actor.has_style_class_name('popup-menu-content') ||
             actor.has_style_class_name('popup-menu-item'))) {
            
            let parent = actor;
            while (parent) {
                if (parent._delegate && parent._delegate.sourceActor) {
                    let sourceActor = parent._delegate.sourceActor;
                    while (sourceActor) {
                        if (panel.actor.contains(sourceActor)) {
                            return true;
                        }
                        sourceActor = sourceActor.get_parent();
                    }
                    return false;
                }
                parent = parent.get_parent();
            }
            return false;
        }
        
        actor = actor.get_parent();
    }
    
    return false;
}

function isMouseInTriggerZone(panel, x, y) {
    let state = panelStates[panel.panelId];
    if (!state) return false;
    
    let monitor = getMonitorGeometry(panel);
    let hoverPixels = settings.getValue("hover-pixels");
    
    let panelLeft = monitor.x + (monitor.width - state.lastWidth) / 2;
    let panelRight = panelLeft + state.lastWidth;
    
    if (x < panelLeft || x > panelRight) {
        return false;
    }
    
    if (state.location === "bottom") {
        return y >= monitor.y + monitor.height - hoverPixels && 
               y <= monitor.y + monitor.height;
    } else if (state.location === "top") {
        return y >= monitor.y && 
               y <= monitor.y + hoverPixels;
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

function getMonitorGeometry(panel) {
    let panelMonitor = Main.layoutManager.findMonitorForActor(panel.actor);
    if (panelMonitor) {
        return {
            x: panelMonitor.x,
            y: panelMonitor.y,
            width: panelMonitor.width,
            height: panelMonitor.height
        };
    }
    return {
        x: 0,
        y: 0,
        width: global.screen_width,
        height: global.screen_height
    };
}

function enableAutoHide() {
    if (pointerWatcher) {
        return;
    }
    
    pointerWatcher = Mainloop.timeout_add(100, function() {
        if (isInEditMode) return true;
        
        let [x, y, mods] = global.get_pointer();
        
        Main.panelManager.panels.forEach(panel => {
            if (!shouldApplyToPanel(panel)) return;
            
            let state = panelStates[panel.panelId];
            if (!state) return;
            
            let menusActive = hasActiveMenus(panel);
            let mouseOverDockOrMenus = isMouseOverDockOrMenus(panel);
            let mouseOverTriggerZone = isMouseInTriggerZone(panel, x, y);
            
            let focusWindow = global.display.focus_window;
            let hasNormalWindow = focusWindow && focusWindow.window_type === Meta.WindowType.NORMAL;
            let showOnNoFocus = settings.getValue("show-on-no-focus");
            let shouldShowOnNoFocus = !hasNormalWindow && showOnNoFocus;
            
            let shouldShow = menusActive || mouseOverDockOrMenus || mouseOverTriggerZone || shouldShowOnNoFocus;
            
            if (shouldShow && state.isHidden) {
                showPanel(panel);
            } else if (!shouldShow && !state.isHidden) {
                hidePanel(panel);
            }
        });
        
        return true;
    });
}

function hidePanel(panel) {
    if (isInEditMode) return;
    
    let state = panelStates[panel.panelId];
    if (!state || state.isHidden) return;
    
    if (hasActiveMenus(panel)) {
        return;
    }
    
    state.isHidden = true;
    
    let animTime = settings.getValue("animation-time") / 1000.0;
    
    Tweener.removeTweens(panel.actor);
    Tweener.addTween(panel.actor, {
        opacity: 0,
        time: animTime,
        transition: 'easeOutQuad',
        onComplete: function() {
            panel.actor.hide();
            Mainloop.timeout_add(animTime * 1000, function() {
                if (panel.actor.opacity !== 0) {
                    panel.actor.opacity = 0;
                }
                return false;
            });
        }
    });
}

function showPanel(panel) {
    if (isInEditMode) return;
    
    let state = panelStates[panel.panelId];
    if (!state || !state.isHidden) return;
    
    state.isHidden = false;
    
    let animTime = settings.getValue("animation-time") / 1000.0;
    
    Tweener.removeTweens(panel.actor);
    panel.actor.show();
    panel.actor.opacity = 0;
    
    Mainloop.timeout_add(50, function() {
        checkAndApplyStyle(panel);
        Tweener.addTween(panel.actor, {
            opacity: 255,
            time: animTime,
            transition: 'easeOutQuad',
            onComplete: function() {
                Mainloop.timeout_add(animTime * 1000, function() {
                    if (panel.actor.opacity !== 255) {
                        panel.actor.opacity = 255;
                    }
                    return false;
                });
            }
        });
        return false;
    });
}

function disableAutoHide() {
    if (pointerWatcher) {
        Mainloop.source_remove(pointerWatcher);
        pointerWatcher = null;
    }
    
    Main.panelManager.panels.forEach(panel => {
        let state = panelStates[panel.panelId];
        if (state) {
            Tweener.removeTweens(panel.actor);
            panel.actor.opacity = 255;
            panel.actor.show();
            state.isHidden = false;
        }
    });
}

function updateMenuPositions() {
    if (isInEditMode) return;
    
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel)) {
            cleanupTrackedMenus(panel);
            let state = panelStates[panel.panelId];
            if (state) {
                state.trackedMenus.forEach(menu => {
                    updateMenuPosition(panel, menu);
                });
            }
        }
    });
}

function updateMenuPosition(panel, menu) {
    if (isInEditMode) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    let heightOffset = settings.getValue("height-offset");
    let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
    
    Mainloop.timeout_add(1, function() {
        try {
            if (menu && !menu.is_finalized()) {
                menu.y = menu.y + adjustedOffset;
            }
        } catch(e) {
        }
        return false;
    });
}

function startSizeMonitoring() {
    sizeCheckTimeout = Mainloop.timeout_add(100, function() {
        if (isInEditMode) return true;
        
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                let state = panelStates[panel.panelId];
                if (state && !state.isHidden) {
                    checkAndApplyStyle(panel);
                }
            }
        });
        return true;
    });
}

function checkAndApplyStyle(panel, forceApply) {
    if (isInEditMode && !forceApply) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    if (!forceApply && (panel._editMode || (panel.peekDesktop && panel.peekDesktop._editMode))) {
        return;
    }
    
    let contentWidth = 0;
    
    panel._leftBox.get_children().forEach(child => {
        let [minWidth, naturalWidth] = child.get_preferred_width(-1);
        contentWidth += naturalWidth;
    });
    panel._centerBox.get_children().forEach(child => {
        let [minWidth, naturalWidth] = child.get_preferred_width(-1);
        contentWidth += naturalWidth;
    });
    panel._rightBox.get_children().forEach(child => {
        let [minWidth, naturalWidth] = child.get_preferred_width(-1);
        contentWidth += naturalWidth;
    });
    
    let newWidth = Math.max(contentWidth + 10, 200);
    
    if (newWidth !== state.lastWidth || forceApply) {
        state.lastWidth = newWidth;
        applyStyle(panel, forceApply);
    }
}

function applyStyleToAll() {
    if (isInEditMode) return;
    
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel)) {
            applyStyle(panel);
        }
    });
}

function applyStyle(panel, forceApply) {
    if (isInEditMode && !forceApply) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    let transparency = settings.getValue("transparency") / 100.0;
    let heightOffset = settings.getValue("height-offset");
    let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
    let monitor = getMonitorGeometry(panel);
    
    let margin = (monitor.width - state.lastWidth) / 2;
    
    let savedOpacity = panel.actor.opacity;
    
    panel.actor.set_style(
        'background-color: rgba(30, 30, 30, ' + transparency + ');' +
        'border-radius: 12px;' +
        'padding: 0px 20px;' +
        'margin-left: ' + margin + 'px;' +
        'margin-right: ' + margin + 'px;' +
        'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);'
    );
    
    panel.actor.opacity = savedOpacity;
    panel.actor.y = state.originalY + adjustedOffset;
}

function disable() {
    cleanupAllPanels();
    
    if (settings) {
        settings.finalize();
        settings = null;
    }
}
