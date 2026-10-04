// === CONSTANTS ===
const St = imports.gi.St;
const Main = imports.ui.main;
const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Util = imports.misc.util;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const DND = imports.ui.dnd;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gettext = imports.gettext;

let UUID;
let EXTENSION_DIR;
let dock;

const SETTINGS_APP_ID = 'cinnamon-settings.desktop';

// === UI CONSTANTS ===
const UI_DOCK_MARGIN = 10;
const UI_SCREEN_MARGIN = 20;
const UI_ICON_CSS_SPACE = 20;
const UI_SEP_CSS_SPACE = 30;
const UI_HOVER_ZONE = 10;
const UI_ANIM_SLIDE = 20;

// === INITIALIZATION ===
function _(str) {
    return Gettext.dgettext(UUID, str);
}

function init(metadata) {
    UUID = metadata.uuid;
    EXTENSION_DIR = metadata.path;
    Gettext.bindtextdomain(UUID, GLib.get_user_data_dir() + '/locale');
    //global.log(`[${UUID}] Extension initialized.`);
}

function enable() { 
    try {
        dock = new DashDock(); 
        global.log(`[${UUID}] Dock enabled successfully.`);
    } catch (e) {
        global.logError(`[${UUID}] Failed to enable dock: ${e}`);
    }
}

function disable() { 
    if (dock) { 
        dock.destroy(); 
        dock = null; 
        global.log(`[${UUID}] Dock disabled.`);
    } 
}

function getDraggedAppId(source) {
    if (!source) return null;
    if (source.appId) return source.appId;
    if (source.app && typeof source.app.get_id === 'function') return source.app.get_id();
    if (typeof source.get_app_id === 'function') return source.get_app_id();
    return null;
}

// === CLASSES ===
class DockAppList {
    constructor(settings) {
        this.settings = settings; 
        this.dockPosition = this.settings.getValue('dock-position');
        let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';

        this.actor = new St.BoxLayout({ 
            name: 'dock-app-list', 
            reactive: true,
            vertical: isVert
        });
        
        this.appSystem = Cinnamon.AppSystem.get_default();
        this.buttons = new Map();
        this.iconSize = this.settings.getValue('icon-size');

        this.runningOrder = [];

        this._stateChangedId = this.appSystem.connect('app-state-changed', () => this._updateAppList());
        this._favoritesChangedId = this.settings.connect('changed::pinned-apps', () => this._updateAppList());
        this._installedChangedId = this.appSystem.connect('installed-changed', () => this._updateAppList());
        this._windowCreatedId = global.display.connect('window-created', () => this._updateAppList());
        this._focusWindowId = global.display.connect('notify::focus-window', () => this._updateFocusState());

        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._scaleChangedId = themeContext.connect('notify::scale-factor', () => {
            this._updateAppList(true); 
        });

        this._badgeLoopId = Mainloop.timeout_add(1000, () => {
            this._updateBadges();
            this._updateProgress();
            return true;
        });

        this.onSizeChanged = null;
        this._updateAppList();
    }

    _getPinnedApps() {
        let favs = this.settings.getValue('pinned-apps');
        if (Array.isArray(favs)) return favs;
        if (typeof favs === 'string') {
            return favs.replace(/[\[\]"']/g, '').split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        return [];
    }

    setIconSize(newSize) {
        this.iconSize = newSize;
        this._updateAppList(true);
    }

    setPosition(newPosition) {
        this.dockPosition = newPosition;
        let isVert = newPosition === 'left' || newPosition === 'right';
        this.actor.set_vertical(isVert);
        
        let sepElements = this.buttons.get('dock-separator');
        if (sepElements && sepElements.button) {
            let sepStyle = isVert ? 'width: 30px; height: 2px; margin: 6px 0px;' : 'width: 2px; height: 30px; margin: 0px 6px;';
            sepElements.button.get_child().set_style(sepStyle);
        }

        this._updateAppList(true);
    }

    reorderApp(sourceId, targetId, position = 'before') {
        let favs = this._getPinnedApps();
        favs = favs.filter(id => id !== sourceId);
        
        if (position === 'end') favs.push(sourceId);
        else if (position === 'start') favs.unshift(sourceId);
        else if (targetId) {
            let targetIndex = favs.indexOf(targetId);
            if (targetIndex !== -1) favs.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, sourceId);
            else favs.push(sourceId);
        }
        this.settings.setValue('pinned-apps', favs);
        this._updateAppList(true);
    }

    _matchAppToWindow(targetAppId, runningApp, window) {
        if (!targetAppId || !runningApp) return false;

        let runningAppId = runningApp.get_id();
        let wmClass = window ? (window.get_wm_class() || '').toLowerCase() : '';
        
        // 1. Exact match of the system ID
        if (runningAppId === targetAppId) return true;

        // 2. Hard-coded exceptions (e.g., Cinnamon settings)
        if (targetAppId === SETTINGS_APP_ID && wmClass.includes('cinnamon-settings')) return true;

        let lowerTargetId = targetAppId.toLowerCase();
        
        // 3. Exact match to the .desktop file
        if (lowerTargetId === wmClass + '.desktop') return true;
        
        // 4. Standardized match (without hyphens or the file extension)
        let cleanTarget = lowerTargetId.replace('.desktop', '').replace(/-/g, '');
        let cleanWm = wmClass.replace(/-/g, '');
        if (cleanTarget === cleanWm) return true;

        // 5. Last-resort heuristic (Flatpaks)
        let packageWord = cleanTarget.split('.').pop();
        if (cleanWm.length > 2 && cleanTarget.length > 2) {
            if (packageWord === cleanWm || cleanTarget.endsWith('.' + cleanWm)) return true;
            
            if (cleanTarget.includes(cleanWm) || cleanWm.includes(cleanTarget)) return true;
        }

        return false;
    }

     /*
     * Reliably retrieves the .desktop file to extract Quicklists/Actions (e.g., Flatpaks).
     * 
     * 1: Native Cinnamon Object - Best for pinned Flatpaks where ID paths are non-standard.
     * 2: Standard Gio Lookup - Fallback for standard system packages.
     * 3: Fuzzy Match Fallback - Cinnamon's tracker often fails if an app is hidden 
     *         from the menu (NoDisplay=true, e.g., File Roller) or if a running window's 
     *         wm_class differs from its package name. This scans all apps, stripping 
     *         dashes and casing to force a match.
     */
    _getDesktopAppInfo(app, appId, wmClassLower) {
        if (app && typeof app.get_app_info === 'function') {
            let nativeInfo = app.get_app_info();
            if (nativeInfo && typeof nativeInfo.list_actions === 'function') {
                return { info: nativeInfo, fuzzy: false };
            }
        }

        let info = Gio.DesktopAppInfo.new(appId);
        if (info) return { info: info, fuzzy: false };

        let allApps = Gio.AppInfo.get_all();
        let cleanWm = wmClassLower.replace(/-/g, '');
        let cleanAppId = appId.toLowerCase().replace('.desktop', '').replace(/-/g, '');
        
        let exactMatch = null;
        let partialMatch = null;

        for (let appInfo of allApps) {
            let id = appInfo.get_id();
            if (!id) continue;
            
            let lowerId = id.toLowerCase();
            let cleanId = lowerId.replace('.desktop', '').replace(/-/g, ''); 
            
            if (cleanWm && (cleanId === cleanWm || lowerId === wmClassLower + '.desktop')) {
                exactMatch = appInfo; break;
            }
            if (cleanId === cleanAppId || lowerId === appId.toLowerCase()) {
                exactMatch = appInfo; break;
            }
            
            let packageWord = cleanId.split('.').pop(); 
            if (packageWord && packageWord.length > 0) {
                if (cleanWm && (packageWord === cleanWm || cleanId.endsWith('.' + cleanWm))) partialMatch = appInfo; 
                if (packageWord === cleanAppId || cleanId.endsWith('.' + cleanAppId)) partialMatch = appInfo; 
            }
        }
        
        let matchInfo = exactMatch || partialMatch;
        if (matchInfo && matchInfo.get_id()) {
            info = Gio.DesktopAppInfo.new(matchInfo.get_id());
            if (info) return { info: info, fuzzy: true };
        }

        return { info: null, fuzzy: false };
    }

    _getAppWindows(appId) {
        let collectedWindows = [];
        
        let app = this.appSystem.lookup_app(appId);
        if (app) {
            for (let w of app.get_windows()) collectedWindows.push(w);
        }

        let runningApps = this.appSystem.get_running();

        for (let rApp of runningApps) {
            let rWins = rApp.get_windows();
            if (rWins.length === 0) continue;

            if (this._matchAppToWindow(appId, rApp, rWins[0])) {
                for (let w of rWins) {
                    if (!collectedWindows.includes(w)) {
                        collectedWindows.push(w);
                    }
                }
            }
        }
        return collectedWindows;
    }

    _updateAppList(forceRebuild = false) {
        if (forceRebuild) {
            this._pendingForceRebuild = true;
        }

        if (this._updateAppListTimeoutId > 0) {
            return;
        }

        this._updateAppListTimeoutId = Mainloop.timeout_add(50, () => {
            this._updateAppListTimeoutId = 0;
            
            // Perform the actual rendering by compiling the requests
            if (this.actor) {
                this._renderAppList(this._pendingForceRebuild);
            }
            
            this._pendingForceRebuild = false;
            
            return false;
        });
    }

    _renderAppList(forceRebuild = false) {
        try {
            let favIds = this._getPinnedApps();
            let allRunningApps = this.appSystem.get_running();
            
            let appData = [];
            let newIds = [];
            let validFavIds = [];
            
            for (let id of favIds) {
                let app = this.appSystem.lookup_app(id);
                if (app) {
                    appData.push({ isSeparator: false, app: app, id: id });
                    newIds.push(id);
                    validFavIds.push(id);
                } else if (id === SETTINGS_APP_ID) {
                    appData.push({ isSeparator: false, app: null, id: id });
                    newIds.push(id);
                    validFavIds.push(id);
                }
            }
            
            let tempUnpinnedApps = [];
            let tempUnpinnedIds = []; // Memory array to prevent duplicate icons from multi-process apps

            for (let app of allRunningApps) {
                let id = app.get_id();
                let windows = app.get_windows();
                let wmClass = windows.length > 0 ? (windows[0].get_wm_class() || '').toLowerCase() : '';
                
                if (wmClass.includes('cinnamon-settings')) {
                    id = SETTINGS_APP_ID;
                }
                
                let isAlreadyHandled = false;
                for (let favId of validFavIds) { 
                    if (windows.length > 0 && this._matchAppToWindow(favId, app, windows[0])) {
                        isAlreadyHandled = true;
                        break;
                    }
                }
                
                if (newIds.includes(id) || tempUnpinnedIds.includes(id) || isAlreadyHandled) continue;
                
                let hasWindows = windows.length > 0;
                let isStarting = app.get_state() === Cinnamon.AppState.STARTING;
                if (hasWindows || isStarting) {
                    tempUnpinnedApps.push({ isSeparator: false, app: app, id: id });
                    tempUnpinnedIds.push(id);
                }
            }
            
            this.runningOrder = this.runningOrder.filter(orderId => 
                tempUnpinnedApps.some(item => item.id === orderId)
            );

            for (let item of tempUnpinnedApps) {
                if (!this.runningOrder.includes(item.id)) {
                    this.runningOrder.push(item.id);
                }
            }

            let unpinnedApps = tempUnpinnedApps.sort((a, b) => {
                return this.runningOrder.indexOf(a.id) - this.runningOrder.indexOf(b.id);
            });

            if (this.settings.getValue('show-separators') && appData.length > 0 && unpinnedApps.length > 0) {
                appData.push({ isSeparator: true, id: 'dock-separator' });
                newIds.push('dock-separator');
            }

            for (let item of unpinnedApps) {
                appData.push(item);
                newIds.push(item.id);
            }

            let appDataCount = 0;
            let sepCount = 0;
            for (let d of appData) {
                if (d.isSeparator) sepCount++;
                else appDataCount++;
            }

            let usePrimary = this.settings.getValue('use-primary-monitor');
            let rawIndexList = this.settings.getValue('monitor-index');
            let mIndex = parseInt(rawIndexList, 10);
            let targetIndex = (usePrimary || isNaN(mIndex) || mIndex >= Main.layoutManager.monitors.length || mIndex < 0) 
                ? Main.layoutManager.primaryIndex 
                : mIndex;
                
            let monitor = Main.layoutManager.monitors[targetIndex];
            
            let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
            let availableSpace = isVert ? monitor.height : monitor.width;
            
            let showSettings = this.settings.getValue('show-settings-icon');
            let showTrash = this.settings.getValue('show-trash');
            let showSeparators = this.settings.getValue('show-separators');
            let isFullWidth = this.settings.getValue('full-width');
            
            // Count the actual total number of elements in the dock
            let sysIcons = (showSettings ? 1 : 0) + (showTrash ? 1 : 0);
            let totalIcons = appDataCount + sysIcons;
            let totalSeps = sepCount + (showSettings && showSeparators ? 1 : 0) + (showTrash && showSeparators ? 1 : 0);

            let screenMargin = isFullWidth ? 0 : UI_SCREEN_MARGIN;
            
            let sf = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;

            let fixedSpace = screenMargin + (totalIcons * UI_ICON_CSS_SPACE * sf) + (totalSeps * UI_SEP_CSS_SPACE * sf);

            // Dynamically scale icon size to prevent overflow by calculating available
            // screen space minus fixed UI elements and margins.            
            let baseSize = this.settings.getValue('icon-size');
            this.currentIconSize = baseSize;
            
            if (totalIcons > 0) {
                let maxAllowedSize = (availableSpace - fixedSpace) / totalIcons;
                
                let trueMaxAllowed = maxAllowedSize / sf;
                
                if (trueMaxAllowed < baseSize) {
                    this.currentIconSize = Math.max(16, Math.floor(trueMaxAllowed));
                }
            }

            let currentIds = Array.from(this.buttons.keys());
            
            let sizeChanged = this._lastIconSize !== this.currentIconSize;
            this._lastIconSize = this.currentIconSize;

            let hasChanged = forceRebuild || sizeChanged || currentIds.length !== newIds.length || currentIds.some((id, index) => id !== newIds[index]);

            if (hasChanged) {
            let animEnabled = this.settings.getValue('enable-animations');
            
            let idsToRemove = currentIds.filter(id => {
                let elements = this.buttons.get(id);
                return !newIds.includes(id) && elements && elements.button && !elements.button._isDying;
            });

            if (animEnabled && idsToRemove.length > 0 && !sizeChanged) {
                let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
                
                for (let id of idsToRemove) {
                    let elements = this.buttons.get(id);
                    if (elements && elements.button) {
                        elements.button._isDying = true;
                        
                        elements.button.set_style('min-width: 0px; min-height: 0px; margin: 0px; padding: 0px;');
                        
                        let easeProps = { 
                            duration: 100, 
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD 
                        };
                        
                        if (isVert) easeProps.height = 0;
                        else easeProps.width = 0;
                        
                        if (id === 'dock-separator') {
                            let child = elements.button.get_child();
                            if (child) child.opacity = 0;
                        } else {
                            elements.button.set_pivot_point(0.5, 0.5);
                            easeProps.opacity = 0;
                            easeProps.scale_x = 0;
                            easeProps.scale_y = 0;
                        }
                        
                        elements.button.ease(easeProps);
                    }
                }
                
                if (this._removeAnimTimeoutId) {
                    Mainloop.source_remove(this._removeAnimTimeoutId);
                }
                
                this._removeAnimTimeoutId = Mainloop.timeout_add(250, () => {
                    this._removeAnimTimeoutId = 0;
                    if (this.actor) {
                        this._updateAppList(true);
                    }
                    return false; 
                });
                
                return;
            }

                this.actor.destroy_all_children();
                this.buttons.clear();
                
                for (let data of appData) {
                     if (data.isSeparator) {
                        let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
                        let sepStyle = isVert ? 'width: 30px; height: 2px; margin: 6px 0px;' : 'width: 2px; height: 30px; margin: 0px 6px;';
                        
                        let sep = new St.Widget({ style_class: 'dock-separator', style: sepStyle });
                        let sepBin = new St.Bin({ child: sep, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE });
                        
                        this.actor.add_actor(sepBin);
                        this.buttons.set(data.id, { button: sepBin, indicator: new St.Widget() });                       
                    } else {
                        let app = data.app;
                        let appId = data.id;
                        let isNewApp = !currentIds.includes(appId);
                        
                        let elements = this._createAppButton(app, appId);
                        this.buttons.set(appId, elements);
                        
                      let animEnabled = this.settings.getValue('enable-animations');
                      let spawnAnimType = this.settings.getValue('spawn-animation-type');

                      if ((isNewApp && animEnabled && !forceRebuild) || sizeChanged) {
                          elements.button.opacity = 0; 
                          
                          if (!sizeChanged && spawnAnimType === 'slide') {
                              if (this.dockPosition === 'top') elements.button.translation_y = -UI_ANIM_SLIDE;
                              else if (this.dockPosition === 'bottom') elements.button.translation_y = UI_ANIM_SLIDE;
                              else if (this.dockPosition === 'left') elements.button.translation_x = -UI_ANIM_SLIDE;
                              else if (this.dockPosition === 'right') elements.button.translation_x = UI_ANIM_SLIDE;
                          } else {
                              elements.button.set_pivot_point(0.5, 0.5);
                              elements.button.set_scale(0.5, 0.5);
                          }
                      }
                      
                      this.actor.add_actor(elements.button);
                      
                      if ((isNewApp && animEnabled && !forceRebuild) || sizeChanged) {
                          if (!sizeChanged && spawnAnimType === 'slide') {
                              elements.button.ease({
                                  opacity: 255, translation_x: 0, translation_y: 0,
                                  duration: 350, mode: Clutter.AnimationMode.EASE_OUT_QUAD
                              });
                          } else { // bounce
                              elements.button.ease({
                                  opacity: 255,
                                  duration: 450,
                                  mode: Clutter.AnimationMode.EASE_OUT_QUAD
                              });
                              elements.button.ease({
                                  scale_x: 1,
                                  scale_y: 1,
                                  duration: 450,
                                  mode: Clutter.AnimationMode.EASE_OUT_BACK
                              });
                          }
                      }
                    }
                }
                // Force parent dock to recenter
                if (this.onSizeChanged) this.onSizeChanged();
            }
            this._updateFocusState();

        } catch (e) {
            global.logError(`[${UUID}] Error updating app list: ${e}`);
        }
    }

    _createAppButton(app, forcedAppId) {
        let appId = forcedAppId || (app ? app.get_id() : '');

        let windows = this._getAppWindows(appId);
        let wmClass = windows.length > 0 ? (windows[0].get_wm_class() || '') : '';
        let wmClassLower = wmClass.toLowerCase();

        let { info: desktopAppInfo, fuzzy: usedFuzzyMatch } = this._getDesktopAppInfo(app, appId, wmClassLower);

        let appName = app ? app.get_name() : '';
        if (appId === SETTINGS_APP_ID) {
            appName = _("System Settings");
        } else if (desktopAppInfo) {
            appName = desktopAppInfo.get_name() || appName; 
        }
        if (!appName) appName = "Application";

        let tooltipLabel = new St.Label({ style_class: 'dash-dock-tooltip', text: appName });
        Main.uiGroup.add_actor(tooltipLabel);
        tooltipLabel.hide();

        let tooltipTimer = 0;
        
        let button = new St.Button({ 
            style_class: 'dock-app-button', 
            reactive: true, 
            track_hover: true,
            style: 'padding: 0px 4px; margin: 0px 3px;'
        });
        
        let sf = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
        let scaledIconSize = Math.round(this.currentIconSize * sf);

        let icon = null; 
        let gicon = desktopAppInfo ? desktopAppInfo.get_icon() : null;

        if (appId === SETTINGS_APP_ID) {
            icon = new St.Icon({ icon_name: 'preferences-desktop', icon_size: scaledIconSize, icon_type: St.IconType.FULLCOLOR });
        } else if (usedFuzzyMatch && gicon) {
            icon = new St.Icon({ gicon: gicon, icon_size: scaledIconSize, icon_type: St.IconType.FULLCOLOR });
        } else if (app) {
            icon = app.create_icon_texture(scaledIconSize);
        } 
        if (!icon && wmClassLower.length > 0) {
            icon = new St.Icon({ icon_name: wmClassLower, icon_size: scaledIconSize, icon_type: St.IconType.FULLCOLOR });
        } 
        if (!icon) {
            icon = new St.Icon({ icon_name: 'application-default-icon', icon_size: scaledIconSize, icon_type: St.IconType.FULLCOLOR });
        }

        let iconWrapper = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        iconWrapper.set_size(scaledIconSize, scaledIconSize);

        icon.set_x_align(Clutter.ActorAlign.CENTER);
        icon.set_y_align(Clutter.ActorAlign.CENTER);
        iconWrapper.add_actor(icon);

        let progressContainer = new St.Bin({
            width: scaledIconSize,
            height: scaledIconSize,
            x_fill: true, y_fill: false, y_align: St.Align.END
        });
        progressContainer.translation_y = Math.round(6 * sf);

        let progressTrack = new St.Widget({ style_class: 'dock-progress-track' });
        progressTrack.hide();
        let progressFill = new St.Widget({ style_class: 'dock-progress-fill' });
        progressTrack.add_actor(progressFill);
        progressContainer.set_child(progressTrack);
        iconWrapper.add_actor(progressContainer);

        let badgeBaseSize = Math.max(16, Math.round(this.currentIconSize * 0.35));
        let dynamicFontSize = Math.max(8, Math.round(this.currentIconSize / 5.5));
        
        let badgeLabel = new St.Label({
            text: '',
            style: `font-size: ${dynamicFontSize}pt;`
        });
        badgeLabel.set_x_align(Clutter.ActorAlign.CENTER);
        badgeLabel.set_y_align(Clutter.ActorAlign.CENTER);

        let badgeBin = new St.Bin({
            style_class: 'dock-app-badge',
            child: badgeLabel,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE,
            style: `
                height: ${badgeBaseSize}px;
                min-width: ${badgeBaseSize}px;   
                border-radius: 99px;
            `
        });

        badgeBin.hide();
        badgeBin.set_x_align(Clutter.ActorAlign.END);
        badgeBin.set_y_align(Clutter.ActorAlign.START);
        
        badgeBin.translation_x = Math.round(scaledIconSize * 0.35);
        badgeBin.translation_y = -Math.round(scaledIconSize * 0.35);

        badgeBin.set_text = (text) => badgeLabel.set_text(text);
        iconWrapper.add_actor(badgeBin);

        let paddedBin = new St.Bin({ 
            child: iconWrapper,
            x_align: St.Align.MIDDLE, 
            y_align: St.Align.MIDDLE,
            style: 'padding: 9px 0px;'
        });

        let indicator = new St.Widget({ style_class: 'dock-app-indicator' });
        let indicatorBin = new St.Bin({
            child: indicator,
            width: scaledIconSize,
            height: scaledIconSize + Math.round(18 * sf),
            x_align: St.Align.MIDDLE,
            y_align: this.dockPosition === 'top' ? St.Align.START : St.Align.END
        });

        let container = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        container.add_actor(paddedBin);
        container.add_actor(indicatorBin);
        button.set_child(container);

        button._delegate = {
            appId: appId,
            getDragActor: () => new Clutter.Clone({ source: icon }),
            getDragActorSource: () => icon,
            
            handleDragOver: (source, dragActor, x, y) => {
                let dragId = getDraggedAppId(source);
                if (dragId && dragId !== appId) {
                    button.remove_style_class_name('dock-drag-hover-left');
                    button.remove_style_class_name('dock-drag-hover-right');
                    button.remove_style_class_name('dock-drag-hover-top');
                    button.remove_style_class_name('dock-drag-hover-bottom');
                    
                    let isVert = (this.dockPosition === 'left' || this.dockPosition === 'right');
                    let isBefore = isVert ? (y < button.height / 2) : (x < button.width / 2);

                    if (isVert) {
                        button.add_style_class_name(isBefore ? 'dock-drag-hover-top' : 'dock-drag-hover-bottom');
                    } else {
                        button.add_style_class_name(isBefore ? 'dock-drag-hover-left' : 'dock-drag-hover-right');
                    }

                    return DND.DragMotionResult.MOVE_DROP;
                }
                return DND.DragMotionResult.NO_DROP;
            },
            
            handleDragOut: () => {
                button.remove_style_class_name('dock-drag-hover-left');
                button.remove_style_class_name('dock-drag-hover-right');
                button.remove_style_class_name('dock-drag-hover-top');
                button.remove_style_class_name('dock-drag-hover-bottom');
            },
            
            acceptDrop: (source, dragActor, x, y) => {
                button.remove_style_class_name('dock-drag-hover-left');
                button.remove_style_class_name('dock-drag-hover-right');
                button.remove_style_class_name('dock-drag-hover-top');
                button.remove_style_class_name('dock-drag-hover-bottom');
                
                let dragId = getDraggedAppId(source);
                if (dragId && dragId !== appId) {
                    let isVert = (this.dockPosition === 'left' || this.dockPosition === 'right');
                    let isBefore = isVert ? (y < button.height / 2) : (x < button.width / 2);
                    
                    this.reorderApp(dragId, appId, isBefore ? 'before' : 'after');
                    return true;
                }
                return false;
            }
        };
        DND.makeDraggable(button);

        button.connect('enter-event', () => {
            if (!this.settings.getValue('show-tooltips') || (menu && menu.isOpen)) return;
            
            if (tooltipTimer) Mainloop.source_remove(tooltipTimer);
            tooltipTimer = Mainloop.timeout_add(300, () => {
                tooltipTimer = 0;
                
                if (menu && menu.isOpen) return false;

                let [x, y] = button.get_transformed_position();
                if (isNaN(x) || isNaN(y)) return false;
                
                tooltipLabel.show();
                tooltipLabel.raise_top(); 

                let bW = button.get_width();
                let bH = button.get_height();
                let [, natW] = tooltipLabel.get_preferred_width(-1);
                let [, natH] = tooltipLabel.get_preferred_height(natW);
                
                let dockActor = this.actor.get_parent() || this.actor;
                let [dockX, dockY] = dockActor.get_transformed_position();
                let dockW = dockActor.get_width();
                let dockH = dockActor.get_height();
                let tx, ty;
                
                if (this.dockPosition === 'left' || this.dockPosition === 'right') {
                    ty = Math.round(y + (bH / 2) - (natH / 2));
                    tx = Math.round(this.dockPosition === 'left' ? dockX + dockW + 2 : dockX - natW - 2);
                } else {
                    tx = Math.round(x + (bW / 2) - (natW / 2));
                    ty = Math.round(this.dockPosition === 'top' ? dockY + dockH + 2 : dockY - natH - 2);
                }
                tooltipLabel.set_position(tx, ty);
                return false;
            });
        });

        button.connect('leave-event', () => {
            if (tooltipTimer) { Mainloop.source_remove(tooltipTimer); tooltipTimer = 0; }
            tooltipLabel.hide();
        });

        let btnMenuManager = new PopupMenu.PopupMenuManager(this);
        let menu = null;

        button.connect('destroy', () => {
            if (tooltipTimer) Mainloop.source_remove(tooltipTimer);
            tooltipLabel.destroy();
            if (menu) {
                btnMenuManager.removeMenu(menu);
                menu.destroy();
            }
        });

        button.connect('clicked', () => { 
            if (tooltipTimer) { Mainloop.source_remove(tooltipTimer); tooltipTimer = 0; }
            tooltipLabel.hide();
            if (menu) menu.close(); 

            let animEnabled = this.settings.getValue('enable-animations');
            let clickAnimType = this.settings.getValue('click-animation-type');

            if (animEnabled && clickAnimType === 'bounce') {
                button.remove_all_transitions();
                button.set_pivot_point(0.5, 0.5);
                
                button.ease({
                    scale_x: 0.8,
                    scale_y: 0.8,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        button.ease({
                            scale_x: 1,
                            scale_y: 1,
                            duration: 350,
                            mode: Clutter.AnimationMode.EASE_OUT_BACK
                        });
                    }
                });
            }

            this._onAppClicked(appId, button);
        });
        
        button.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 3) { 
                if (tooltipTimer) { Mainloop.source_remove(tooltipTimer); tooltipTimer = 0; }
                tooltipLabel.hide();
                
                if (menu) {
                    btnMenuManager.removeMenu(menu);
                    menu.destroy();
                    menu = null;
                }

                let side;
                if (this.dockPosition === 'top') side = St.Side.TOP;
                else if (this.dockPosition === 'bottom') side = St.Side.BOTTOM;
                else if (this.dockPosition === 'left') side = St.Side.LEFT;
                else if (this.dockPosition === 'right') side = St.Side.RIGHT;

                menu = new PopupMenu.PopupMenu(button, 0.5, side);
                menu.actor.add_style_class_name('menu');
                btnMenuManager.addMenu(menu);
                Main.uiGroup.add_actor(menu.actor);
                menu.actor.hide();

                let elements = this.buttons.get(appId);
                if (elements) elements.menu = menu;

                let windows = this._getAppWindows(appId);
                let isStarting = app ? (app.get_state() === Cinnamon.AppState.STARTING) : false;
                let directWindowsCount = app ? app.get_windows().length : 0;
                let isRunning = windows.length > 0 || directWindowsCount > 0 || isStarting;

                if (windows.length >= 2) {
                    for (let win of windows) {
                        let winTitle = win.get_title() || appName;
                        if (winTitle.length > 40) winTitle = winTitle.substring(0, 37) + "...";

                        let winItem = new PopupMenu.PopupBaseMenuItem({ reactive: true });
                        let box = new St.BoxLayout({ vertical: false, x_expand: true });
                        
                        let titleLabel = new St.Label({ text: winTitle, y_align: Clutter.ActorAlign.CENTER });
                        titleLabel.x_expand = true;
                        
                        let closeIcon = new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 16, icon_type: St.IconType.SYMBOLIC });
                        let closeButton = new St.Button({ 
                            child: closeIcon, 
                            reactive: true, 
                            style_class: 'dock-window-close-button' 
                        });
                        
                        closeButton.connect('clicked', () => {
                            let currentWindows = this._getAppWindows(appId);
                            
                            if (currentWindows.includes(win)) {
                                win.delete(global.get_current_time());
                            }
                            
                            menu.close();
                        });

                        box.add_actor(titleLabel);
                        box.add_actor(closeButton);
                        winItem.addActor(box, { expand: true });

                        winItem.connect('activate', () => {
                            let currentWindows = this._getAppWindows(appId);
                            
                            if (currentWindows.includes(win)) {
                                Main.activateWindow(win);
                            }
                            
                            menu.close();
                        });

                        menu.addMenuItem(winItem);
                    }
                    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                }

                let hasActions = false;
                if (desktopAppInfo) {
                    let actions = desktopAppInfo.list_actions();
                    if (actions && actions.length > 0) {
                        hasActions = true;
                        for (let action of actions) {
                            let actionName = desktopAppInfo.get_action_name(action);
                            let actionItem = new PopupMenu.PopupMenuItem(actionName);
                            actionItem.connect('activate', () => {
                                desktopAppInfo.launch_action(action, null);
                                menu.close();
                            });
                            menu.addMenuItem(actionItem);
                        }
                        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    }
                }

                // Scripts must not be pinned except for some scripts such as cinnamon-settings.py
                let isRawScript = appId && appId.match(/\.(py|sh|c|cpp|rb|js|php|pl|java|go)$/i) !== null;
                let isFlatpakOrDesktop = appId && (appId.endsWith('.desktop') || appId.split('.').length > 2);
                let canPin = desktopAppInfo !== null || appId === SETTINGS_APP_ID || (isFlatpakOrDesktop && !isRawScript);

                if (canPin) {
                    let favs = this._getPinnedApps();
                    let isPinned = favs.includes(appId);
                    
                    let pinItem = new PopupMenu.PopupMenuItem(isPinned ? _("Unpin from dock") : _("Pin to dock"));
                    pinItem.connect('activate', () => {
                        let currentFavs = this._getPinnedApps();
                        if (isPinned) {
                            currentFavs = currentFavs.filter(id => id !== appId);
                        } else {
                            currentFavs.push(appId);
                        }
                        this.settings.setValue('pinned-apps', currentFavs);
                        this._updateAppList(true);

                        menu.close();
                    });
                    menu.addMenuItem(pinItem);
                }

                if (isRunning) {
                    if (canPin || hasActions || windows.length >= 2) {
                        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    }
                    let itemClose = new PopupMenu.PopupMenuItem(_("Quit"));
                    itemClose.connect('activate', () => {
                        let wins = this._getAppWindows(appId);
                        for (let w of wins) w.delete(global.get_current_time());
                        menu.close();
                    });
                    menu.addMenuItem(itemClose);
                }

                menu.connect('open-state-changed', (m, open) => {
                    if (open) {
                        let [x, y] = button.get_transformed_position();
                        if (isNaN(x) || isNaN(y)) return;
                        
                        let bW = button.get_width();
                        let bH = button.get_height();
                        
                        let [, natW] = menu.actor.get_preferred_width(-1);
                        let [, natH] = menu.actor.get_preferred_height(natW);

                        let dockActor = this.actor.get_parent() || this.actor;
                        let [dockX, dockY] = dockActor.get_transformed_position();
                        let dockW = dockActor.get_width();
                        let dockH = dockActor.get_height();
                        let menuX, menuY;
                        
                        if (this.dockPosition === 'left' || this.dockPosition === 'right') {
                            menuY = Math.round(y + (bH / 2) - (natH / 2));
                            menuX = Math.round(this.dockPosition === 'left' ? dockX + dockW + 2 : dockX - natW - 2);
                        } else {
                            menuX = Math.round(x + (bW / 2) - (natW / 2));
                            menuY = Math.round(this.dockPosition === 'top' ? dockY + dockH + 2 : dockY - natH - 2);
                        }
                        menu.actor.set_position(menuX, menuY);
                    }
                });

                menu.toggle(); 
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Scroll-to-cycle or Scroll-to-minimize
        button._lastScrollTime = 0;

        button.connect('scroll-event', (actor, event) => {
            let currentTime = Date.now();
            if (currentTime - button._lastScrollTime < 200) {
                return Clutter.EVENT_STOP;
            }

            let windows = this._getAppWindows(appId);
            let currentWorkspace = global.workspace_manager.get_active_workspace();
            if (!currentWorkspace) return Clutter.EVENT_PROPAGATE;
            windows = windows.filter(w => w.get_workspace() === currentWorkspace || w.is_on_all_workspaces());

            if (windows.length === 0) return Clutter.EVENT_PROPAGATE;

            let direction = event.get_scroll_direction();
            if (direction === Clutter.ScrollDirection.SMOOTH) {
                let [dx, dy] = event.get_scroll_delta();
                if (dy > 0.1) direction = Clutter.ScrollDirection.DOWN;
                else if (dy < -0.1) direction = Clutter.ScrollDirection.UP;
                else return Clutter.EVENT_PROPAGATE;
            }

            button._lastScrollTime = currentTime;

            let scrollAction = this.settings.getValue('scroll-action') || 'cycle';

            // 1: minimize mode
            if (scrollAction === 'minimize') {
                let targetWin = windows.find(w => w.has_focus()) || windows[0];
                
                if (direction === Clutter.ScrollDirection.UP) {
                    Main.activateWindow(targetWin, global.get_current_time());
                } else if (direction === Clutter.ScrollDirection.DOWN) {
                    if (targetWin.has_focus()) {
                        targetWin.minimize();
                    } else {
                        Main.activateWindow(targetWin, global.get_current_time());
                    }
                }
                return Clutter.EVENT_STOP;
            }

                // 2: Cycle mode
                if (scrollAction === 'cycle') {                
                let activeWindow = global.display.focus_window;
                let currentIndex = windows.indexOf(activeWindow);
                let nextIndex = 0;

                if (direction === Clutter.ScrollDirection.UP) {
                    nextIndex = (currentIndex + 1) % windows.length;
                } else if (direction === Clutter.ScrollDirection.DOWN) {
                    nextIndex = (currentIndex <= 0) ? (windows.length - 1) : (currentIndex - 1);
                } else {
                    return Clutter.EVENT_PROPAGATE;
                }

                Main.activateWindow(windows[nextIndex], global.get_current_time());
                return Clutter.EVENT_STOP;
            }
            
            return Clutter.EVENT_PROPAGATE;
        });

        return { 
            button: button, 
            indicator: indicator, 
            menu: menu, 
            badge: badgeBin,
            progressTrack: progressTrack,
            progressFill: progressFill
        };
    }

    _updateFocusState() {
        let focusedWindow = global.display.focus_window;

        for (let [appId, elements] of this.buttons.entries()) {
            let app = this.appSystem.lookup_app(appId);
            
            elements.indicator.remove_style_class_name('dock-app-indicator-running');
            elements.indicator.remove_style_class_name('dock-app-indicator-focused');

            let windows = this._getAppWindows(appId);
            let isStarting = app ? (app.get_state() === Cinnamon.AppState.STARTING) : false;
            let isRunning = windows.length > 0 || isStarting;
            
            if (isRunning) {
                let isFocused = windows.some(win => win === focusedWindow);
                
                // The dot is only displayed if there is no progress bar
                if (!elements.currentProgress || elements.currentProgress === 0) {
                    elements.indicator.show();
                    if (isFocused) {
                        elements.indicator.add_style_class_name('dock-app-indicator-focused');
                    } else {
                        elements.indicator.add_style_class_name('dock-app-indicator-running');
                    }
                } else {
                    elements.indicator.hide();
                }

                if (windows.length > 0 && elements.button.get_stage()) {
                    let [x, y] = elements.button.get_transformed_position();
                    if (isNaN(x) || isNaN(y)) continue;

                    let rect = new Meta.Rectangle();
                    rect.x = Math.round(x);
                    rect.y = Math.round(y);
                    rect.width = Math.round(elements.button.get_width());
                    rect.height = Math.round(elements.button.get_height());
                    
                    for (let win of windows) {
                        win.set_icon_geometry(rect);
                    }
                }
            }
        }

        let tracker = Cinnamon.WindowTracker.get_default();
        if (tracker.focus_app && typeof tracker.focus_app.get_id === 'function') {
            this._clearAppNotifications(tracker.focus_app.get_id());
        }
    }

    _updateProgress() {
        let runningApps = Cinnamon.AppSystem.get_default().get_running();

        for (let elements of this.buttons.values()) {
            if (elements.progressTrack) elements.currentProgress = 0;
        }

        for (let app of runningApps) {
            let appProgress = 0;
            
            for (let window of app.get_windows()) {
                let wp = (typeof window.get_progress === 'function') ? window.get_progress() : (window.progress || 0);
                if (wp > appProgress) appProgress = wp;
            }

            if (appProgress === 0) continue;

            let sAppId = app.get_id().toLowerCase();
            for (let [appId, elements] of this.buttons.entries()) {
                let safeAppId = appId.toLowerCase().replace('.desktop', '');
                if (sAppId === appId.toLowerCase() || sAppId.includes(safeAppId)) {
                    elements.currentProgress = appProgress;
                }
            }
        }

        for (let elements of this.buttons.values()) {
            if (!elements.progressTrack || !elements.progressFill) continue;

            if (elements.currentProgress > 0) {
                let totalWidth = elements.progressTrack.width || 48;
                let ratio = elements.currentProgress > 1.0 ? (elements.currentProgress / 100.0) : elements.currentProgress;
                
                elements.progressFill.width = totalWidth * ratio;
                
                if (!elements.progressTrack.visible) elements.progressTrack.show();
                
                if (elements.indicator && elements.indicator.visible) {
                    elements.indicator.hide();
                }
            } else {
                if (elements.progressTrack.visible) {
                    elements.progressTrack.hide();
                    if (typeof this._updateFocusState === 'function') {
                        this._updateFocusState();
                    }
                }
            }
        }
    }

    _updateBadges() {
     /**
     * Workaround for a known Cinnamon NotificationDaemon issue 
     * where applications (especially Flatpaks) sharing the 'xdg-desktop-portal' are 
     * incorrectly grouped together under the first app that sends a notification.
     * 
     * To prevent apps from "stealing" each other's badges, it cross-references Cinnamon's 
     * grouped `_sources` array with the raw, pre-grouped `_notifications` dictionary. 
     * This allows us to extract the true `desktop-entry` hint or raw app name of each 
     * individual notification before the system merges and overwrites their identities.
     */

        if (!Main.notificationDaemon || !Main.notificationDaemon._sources) return;
        let appSystem = Cinnamon.AppSystem.get_default();
        let dockApps = [];
        
        for (let [appId, elements] of this.buttons.entries()) {
            if (elements.badge) elements.rawBadgeCount = 0;
            
            let cleanId = appId.toLowerCase().replace('.desktop', '');
            let sysApp = appSystem.lookup_app(appId);
            
            dockApps.push({
                appId: appId,
                cleanId: cleanId,
                packageWord: cleanId.split('.').pop(),
                sysName: sysApp ? sysApp.get_name().toLowerCase() : ''
            });
        }

        let rawNotifications = Main.notificationDaemon._notifications ? Object.values(Main.notificationDaemon._notifications) : [];

        for (let source of Main.notificationDaemon._sources) {
            if (!source || !Array.isArray(source.notifications)) continue;

            let sourceAppId = (source.app && typeof source.app.get_id === 'function') ? source.app.get_id().toLowerCase().replace('.desktop', '') : '';
            let sourceTitle = (source.title || '').toLowerCase();

            for (let notif of source.notifications) {
                let ndata = rawNotifications.find(n => n.notification === notif) || {};
                
                let rawHint = (ndata.hints && ndata.hints['desktop-entry']) ? ndata.hints['desktop-entry'].toString().toLowerCase() : '';
                let rawAppName = (ndata.appName || '').toLowerCase();
                let notifTitle = (notif.title || '').toLowerCase();
                let notifBody = (notif._bodyUrlHighlighter && notif._bodyUrlHighlighter._text) ? notif._bodyUrlHighlighter._text.toLowerCase() : '';

                let targetAppId = null;

                for (let dockApp of dockApps) {
                    let { cleanId, packageWord, sysName } = dockApp;

                    if (rawHint && (rawHint.includes(packageWord) || cleanId.includes(rawHint))) {
                        targetAppId = dockApp.appId; break;
                    }
                    if (rawAppName && rawAppName !== 'xdg-desktop-portal' && rawAppName !== 'notify-send') {
                        if (rawAppName.includes(packageWord) || cleanId.includes(rawAppName) || (sysName && rawAppName.includes(sysName))) {
                            targetAppId = dockApp.appId; break;
                        }
                    }
                    if (notifTitle && (notifTitle.includes(packageWord) || (sysName && notifTitle.includes(sysName)))) {
                        targetAppId = dockApp.appId; break;
                    }
                    if (notifBody && (notifBody.includes(packageWord) || (sysName && notifBody.includes(sysName)))) {
                        targetAppId = dockApp.appId; break;
                    }
                }

                if (!targetAppId) {
                    for (let dockApp of dockApps) {
                        let { cleanId, packageWord } = dockApp;
                        if (sourceAppId && (sourceAppId.includes(packageWord) || cleanId.includes(sourceAppId))) {
                            targetAppId = dockApp.appId; break;
                        } else if (sourceTitle && (sourceTitle.includes(packageWord) || cleanId.includes(sourceTitle))) {
                            targetAppId = dockApp.appId; break;
                        }
                    }
                }

                if (targetAppId) {
                    let elements = this.buttons.get(targetAppId);
                    if (elements && elements.badge) elements.rawBadgeCount++;
                }
            }
        }

        for (let [appId, elements] of this.buttons.entries()) {
            if (!elements.badge) continue;
            
            elements.ignoredCount = elements.ignoredCount || 0;
            if (elements.ignoredCount > elements.rawBadgeCount) {
                elements.ignoredCount = elements.rawBadgeCount;
            }

            elements.badgeCount = elements.rawBadgeCount - elements.ignoredCount;
            
            if (elements.badgeCount > 0) {
                elements.badge.set_text(elements.badgeCount.toString());
                if (!elements.badge.visible) elements.badge.show();
            } else {
                if (elements.badge.visible) elements.badge.hide();
            }
        }
    }

    _clearAppNotifications(targetAppId) {
        if (!targetAppId) return;
        
        let safeTargetId = targetAppId.toLowerCase().replace('.desktop', '');

        for (let [appId, elements] of this.buttons.entries()) {
            let safeAppId = appId.toLowerCase().replace('.desktop', '');
            
            if (safeAppId === safeTargetId || appId.toLowerCase() === targetAppId.toLowerCase()) {
                if (elements.rawBadgeCount !== undefined) {
                    elements.ignoredCount = elements.rawBadgeCount;
                }
            }
        }
        
        this._updateBadges();
    }

    _onAppClicked(appId, button) {
        let windows = this._getAppWindows(appId);

        // Calculate the button’s position and assign it to the windows for the minimize animation
        if (button && windows.length > 0) {
            let [x, y] = button.get_transformed_position();

            if (!isNaN(x) && !isNaN(y)) {
                let rect = new Meta.Rectangle();
                rect.x = Math.round(x);
                rect.y = Math.round(y);
                rect.width = Math.round(button.get_width());
                rect.height = Math.round(button.get_height());

                for (let win of windows) {
                    win.set_icon_geometry(rect);
                }
            }
        }

        if (windows.length > 0) {
            let hasFocus = windows.some(win => win.has_focus());

            if (hasFocus) {
                for (let win of windows) {
                    win.minimize();
                }
            } else {
                for (let i = windows.length - 1; i >= 0; i--) {
                    Main.activateWindow(windows[i]);
                }
            }
        } else {
            let app = this.appSystem.lookup_app(appId);
            if (app) {
                app.open_new_window(-1);
            } else if (appId === SETTINGS_APP_ID) {
                Util.spawn(['cinnamon-settings']);
            }
        }
    }

    isAnyMenuOpen() {
        for (let [appId, elements] of this.buttons.entries()) {
            if (elements.menu && elements.menu.isOpen) {
                return true;
            }
        }
        return false;
    }

    destroy() {
        if (this._stateChangedId) this.appSystem.disconnect(this._stateChangedId);
        if (this._favoritesChangedId) this.settings.disconnect(this._favoritesChangedId);
        if (this._focusWindowId) global.display.disconnect(this._focusWindowId);
        if (this._windowCreatedId) global.display.disconnect(this._windowCreatedId);
        if (this._scaleChangedId) St.ThemeContext.get_for_stage(global.stage).disconnect(this._scaleChangedId);

        if (this._installedChangedId) {
            this.appSystem.disconnect(this._installedChangedId);
            this._installedChangedId = 0;
        }

        if (this._removeAnimTimeoutId) {
            Mainloop.source_remove(this._removeAnimTimeoutId);
            this._removeAnimTimeoutId = 0;
        }

        if (this._badgeLoopId) {
            Mainloop.source_remove(this._badgeLoopId);
            this._badgeLoopId = 0;
        }

        if (this._updateAppListTimeoutId) {
            Mainloop.source_remove(this._updateAppListTimeoutId);
            this._updateAppListTimeoutId = 0;
        }

        this.actor.destroy();
    }
}

class DashDock {
    constructor() {
        this.actor = new St.BoxLayout({
            name: 'dash-dock',
            style_class: 'dash-dock-container',
            reactive: true,
            track_hover: true
        });
        this.actor.opacity = 0; // Start transparent to prevent brief top-left flicker before first idle layout

        this.strutActor = new St.Widget({ reactive: false });
        
        this.wrapper = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            clip_to_allocation: true, 
            reactive: false           
        });
        this.wrapper.add_actor(this.actor);

        Main.layoutManager.addChrome(this.wrapper, { 
            affectsStruts: false,
            affectsInputRegion: true
        });
        
        this.settings = new Settings.ExtensionSettings(this, UUID);
        this.menuManager = new PopupMenu.PopupMenuManager(this);

        this.dockPosition = this.settings.getValue('dock-position');
        this.actor.set_vertical(this.dockPosition === 'left' || this.dockPosition === 'right');
        
        this.leftSpacer = new St.Widget();
        this.rightSpacer = new St.Widget();
        this.actor.add_actor(this.leftSpacer);

        this._buildSettingsButton();
        this._buildTrashButton();

        this.appList = new DockAppList(this.settings);
        this.actor.add_actor(this.appList.actor);
        this.actor.add_actor(this.trashSeparatorBin);
        this.actor.add_actor(this.trashButton);
        this.actor.add_actor(this.rightSpacer);

        // Enable global drag and drop targeting the dock background
        this.actor._delegate = {
            handleDragOver: (source) => {
                let dragId = getDraggedAppId(source);
                return dragId ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.NO_DROP;
            },
            acceptDrop: (source, dragActor, x) => {
                let dragId = getDraggedAppId(source);
                if (dragId) {
                    if (x < this.actor.width / 2) this.appList.reorderApp(dragId, null, 'start');
                    else this.appList.reorderApp(dragId, null, 'end');
                    return true;
                }
                return false;
            }
        };

        this.appList.onSizeChanged = () => { 
            this._isBooting = false; 
            this._updatePosition(); 
        };

        this.isHidden = false;
        this._isBooting = true;
        this._grabInProgress = false;
        this._hideTimeoutId = 0;
        this._showTimeoutId = 0;

       // Configuration sub-methods
        this._bindSettings();
        this._buildDockMenu();
        this._connectSignals();

        // Initial setup calls
        this._updateSettingsIcon(); 
        this._onHideSettingsChanged();
        this._updateAppearance(); 
        this._updateTrashVisibility();
    }

    _buildSettingsButton() {
        this.settingsButton = new St.Button({ 
            style_class: 'dock-app-button', 
            reactive: true, 
            track_hover: true,
            style: 'padding: 0px 4px; margin: 0px 3px;'
        });
        
        let btnContainer = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this.settingsButton.set_child(btnContainer);

        let iconFile = Gio.File.new_for_path(EXTENSION_DIR + '/icon/dock-settings.svg');
        let customGicon = new Gio.FileIcon({ file: iconFile });

        this.settingsIcon = new St.Icon({
            gicon: customGicon,
            icon_size: this.settings.getValue('icon-size'),
            icon_type: St.IconType.FULLCOLOR
        });
        
        let iconBin = new St.Bin({ 
            child: this.settingsIcon, 
            x_align: St.Align.MIDDLE, 
            y_align: St.Align.MIDDLE,
            x_expand: true,
            y_expand: true,
            style: 'padding: 9px 0px;'
        });
        btnContainer.add_actor(iconBin);

        this.settingsButton.connect('clicked', () => { Util.spawn(['xlet-settings', 'extension', UUID]); });
        
        this.settingsSeparatorBin = new St.Bin({
            child: new St.Widget({ style_class: 'dock-separator' }),
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE,
        });
    }

    _hideTrashTooltip() {
        if (this.trashTimer) { 
            Mainloop.source_remove(this.trashTimer); 
            this.trashTimer = 0; 
        }
        if (this.trashTooltip) {
            this.trashTooltip.hide();
        }
    }

    _buildTrashButton() {
        this.trashSeparatorBin = new St.Bin({ 
            child: new St.Widget({ style_class: 'dock-separator' }),
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE 
        });
        
        this.trashButton = new St.Button({ 
            style_class: 'dock-app-button', 
            reactive: true, 
            track_hover: true,
            y_expand: false,
            style: 'padding: 0px 4px; margin: 0px 3px;'
        });
        
        let trashContainer = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this.trashButton.set_child(trashContainer);

        this.trashIcon = new St.Icon({
            icon_name: 'user-trash',
            icon_size: this.settings.getValue('icon-size'),
            icon_type: St.IconType.FULLCOLOR
        });
        
        let trashIconBin = new St.Bin({ 
            child: this.trashIcon, 
            x_align: St.Align.MIDDLE, 
            y_align: St.Align.MIDDLE,
            x_expand: true,
            y_expand: true,
            style: 'padding: 9px 0px;'
        });
        trashContainer.add_actor(trashIconBin);

        this._trashFile = Gio.File.new_for_uri('trash:///');
        this._trashMonitor = this._trashFile.monitor_directory(0, null);
        this._trashTimeoutId = 0;
        
        this._trashMonitorId = this._trashMonitor.connect('changed', () => {
            if (this._trashTimeoutId > 0) return;
            this._trashTimeoutId = Mainloop.timeout_add(250, () => {
                this._trashTimeoutId = 0;
                this._updateTrashState();
                return false;
            });
        });
        
        this._updateTrashState();

        this.trashTooltip = new St.Label({ style_class: 'dash-dock-tooltip', text: _("Trash") });
        Main.uiGroup.add_actor(this.trashTooltip);
        this.trashTooltip.hide();
        this.trashTimer = 0;

        this.trashButton.connect('enter-event', () => {
            if (!this.settings.getValue('show-tooltips')) return;
            if (this.trashTimer) Mainloop.source_remove(this.trashTimer);
            this.trashTimer = Mainloop.timeout_add(300, () => {
                this.trashTimer = 0;

                let [x, y] = this.trashButton.get_transformed_position();
                if (isNaN(x) || isNaN(y)) return false;

                this.trashTooltip.show();
                this.trashTooltip.raise_top();
                
                let bW = this.trashButton.get_width();
                let bH = this.trashButton.get_height();
                let [, natW] = this.trashTooltip.get_preferred_width(-1);
                let [, natH] = this.trashTooltip.get_preferred_height(natW);
                
                let [dockX, dockY] = this.actor.get_transformed_position();
                let dockW = this.actor.get_width();
                let dockH = this.actor.get_height();
                let tx, ty;
                
                if (this.dockPosition === 'left' || this.dockPosition === 'right') {
                    ty = Math.round(y + (bH / 2) - (natH / 2));
                    tx = Math.round(this.dockPosition === 'left' ? dockX + dockW + 2 : dockX - natW - 2);
                } else {
                    tx = Math.round(x + (bW / 2) - (natW / 2));
                    ty = Math.round(this.dockPosition === 'top' ? dockY + dockH + 2 : dockY - natH - 2);
                }
                this.trashTooltip.set_position(tx, ty);
                return false;
            });
        });

        this.trashButton.connect('leave-event', () => this._hideTrashTooltip());
        this.trashButton.connect('clicked', () => {
            this._hideTrashTooltip();
            
            let animEnabled = this.settings.getValue('enable-animations');
            let clickAnimType = this.settings.getValue('click-animation-type');

            if (animEnabled && clickAnimType === 'bounce') {
                this.trashButton.remove_all_transitions();
                this.trashButton.set_pivot_point(0.5, 0.5);
                
                this.trashButton.ease({
                    scale_x: 0.8,
                    scale_y: 0.8,
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        this.trashButton.ease({
                            scale_x: 1,
                            scale_y: 1,
                            duration: 350,
                            mode: Clutter.AnimationMode.EASE_OUT_BACK
                        });
                    }
                });
            }

            Gio.AppInfo.launch_default_for_uri('trash:///', null);
        });

        this.trashMenuManager = new PopupMenu.PopupMenuManager(this);
        let trashSide;
        if (this.dockPosition === 'top') trashSide = St.Side.TOP;
        else if (this.dockPosition === 'bottom') trashSide = St.Side.BOTTOM;
        else if (this.dockPosition === 'left') trashSide = St.Side.LEFT;
        else if (this.dockPosition === 'right') trashSide = St.Side.RIGHT;
        
        this.trashMenu = new PopupMenu.PopupMenu(this.trashButton, 0.5, trashSide);
        this.trashMenu.actor.add_style_class_name('menu');
        
        this.trashMenuManager.addMenu(this.trashMenu);
        Main.uiGroup.add_actor(this.trashMenu.actor);
        this.trashMenu.actor.hide();

        let emptyTrashItem = new PopupMenu.PopupMenuItem(_("Empty Trash"));
        emptyTrashItem.connect('activate', () => {
            Util.spawn(['gio', 'trash', '--empty']);
            this.trashMenu.close();
        });
        this.trashMenu.addMenuItem(emptyTrashItem);

        this.trashMenu.connect('open-state-changed', (m, open) => {
            if (open) {
                this._hideTrashTooltip();
                let [x, y] = this.trashButton.get_transformed_position();
                if (isNaN(x) || isNaN(y)) return;
                let bW = this.trashButton.get_width();
                let bH = this.trashButton.get_height();
                let [, natW] = this.trashMenu.actor.get_preferred_width(-1);
                let [, natH] = this.trashMenu.actor.get_preferred_height(natW);
                
                let [dockX, dockY] = this.actor.get_transformed_position();
                let dockW = this.actor.get_width();
                let dockH = this.actor.get_height();
                let menuX, menuY;
                
                if (this.dockPosition === 'left' || this.dockPosition === 'right') {
                    menuY = Math.round(y + (bH / 2) - (natH / 2));
                    menuX = Math.round(this.dockPosition === 'left' ? dockX + dockW + 2 : dockX - natW - 2);
                } else {
                    menuX = Math.round(x + (bW / 2) - (natW / 2));
                    menuY = Math.round(this.dockPosition === 'top' ? dockY + dockH + 2 : dockY - natH - 2);
                }
                this.trashMenu.actor.set_position(menuX, menuY);
            }
        });

        this.trashButton.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 3) {
                this._hideTrashTooltip();
                if (this.trashMenu && this.trashIcon.get_icon_name() === 'user-trash-full') {
                    this.trashMenu.toggle();
                }
                return Clutter.EVENT_STOP; 
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _bindSettings() {
        this.settings.bindProperty(Settings.BindingDirection.IN, 'hide-enabled', 'hideEnabled', this._onHideSettingsChanged.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'hide-mode', 'hideMode', this._updateVisibility.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'show-settings-icon', 'showSettingsIcon', this._updateSettingsIcon.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'icon-size', 'iconSize', this._updateSettingsIconSize.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'bg-color', 'bgColor', this._updateAppearance.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'bg-opacity', 'bgOpacity', this._updateAppearance.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'border-radius', 'borderRadius', this._updateAppearance.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'dock-position', 'dockPosition', this._onPositionSettingsChanged.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'dock-alignment', 'dockAlignment', this._updatePosition.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'full-width', 'fullWidth', this._onFullWidthChanged.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'show-delay', 'showDelay', () => {}, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'show-tooltips', 'showTooltips', this._onShowTooltipsChanged.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'show-trash', 'showTrash', this._updateTrashVisibility.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'show-separators', 'showSeparators', this._onShowSeparatorsChanged.bind(this), null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'use-primary-monitor', 'usePrimaryMonitor', this._onMonitorSettingsChanged.bind(this), null);
        this.settings.connect('changed::monitor-index', this._onMonitorSettingsChanged.bind(this));
    }

    _connectSignals() {
        // Intercept right-clicks explicitly targeting the dock area
        this.actor.connect('button-release-event', (actor, event) => {
            if (event.get_button() === 3) {
                let [x, y] = event.get_coords();
                let [dockX, dockY] = this.actor.get_transformed_position();
                let dockW = this.actor.get_width();
                let dockH = this.actor.get_height();
                
                if (x >= dockX - UI_HOVER_ZONE && x <= dockX + dockW + UI_HOVER_ZONE && 
                    y >= dockY - UI_HOVER_ZONE && y <= dockY + dockH + UI_HOVER_ZONE) {

                    this.dockMenu.toggle();
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        this.actor.connect('enter-event', () => { this._updateVisibility(); });
        this.actor.connect('leave-event', () => { this._updateVisibility(); });

        this._windowSignals = [];
        const connectDisplay = (sig, cb) => this._windowSignals.push({ obj: global.display, id: global.display.connect(sig, cb) });
        const connectWM = (sig, cb) => this._windowSignals.push({ obj: global.window_manager, id: global.window_manager.connect(sig, cb) });

        this._inOverview = false;
        this._shellSignals = [];
        const connectShell = (obj, sig, cb) => this._shellSignals.push({ obj: obj, id: obj.connect(sig, cb) });

       // Hide the dock (wrapper included) in overview and expo mode
        connectShell(Main.overview, 'showing', () => { this._inOverview = true; this.wrapper.hide(); });
        connectShell(Main.overview, 'hiding', () => { this._inOverview = false; this.wrapper.show(); this._updateVisibility(); });
        connectShell(Main.expo, 'showing', () => { this._inOverview = true; this.wrapper.hide(); });
        connectShell(Main.expo, 'hiding', () => { this._inOverview = false; this.wrapper.show(); this._updateVisibility(); });

        connectWM('switch-workspace', () => this._updateVisibility());
        connectDisplay('restacked', () => this._updateVisibility());
        connectDisplay('workareas-changed', () => this._updatePosition());
        connectDisplay('window-entered-monitor', () => this._updateVisibility());
        connectDisplay('window-left-monitor', () => this._updateVisibility());
        connectDisplay('grab-op-begin', () => { this._grabInProgress = true; });
        connectDisplay('grab-op-end', () => { this._grabInProgress = false; this._updateVisibility(); });

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._onMonitorSettingsChanged();
        });

        // Hide the dock momentarily during theme changes to avoid dock glitches
        this._themeChanging = false;
        this._themeTimeoutId = 0;

        this._themeSetId = Main.themeManager.connect('theme-set', () => {
            if (this.actor) {
                this.actor.opacity = 0; 
                this._themeChanging = true;
            }

            if (this._themeTimeoutId) {
                Mainloop.source_remove(this._themeTimeoutId);
            }
            
            this._themeTimeoutId = Mainloop.timeout_add(150, () => {
                this._themeTimeoutId = 0;
                if (this.actor && this.appList && this.appList.actor) {
                    this._themeChanging = false;
                    this._updateAppearance(); 
                    this.appList.actor.queue_relayout();
                    this._updatePosition();
                }
                return false;
            });
        });
        
        // Polling loop for active autohide
        this._visibilityLoopId = Mainloop.timeout_add(250, () => {
            if (this.hideEnabled) this._updateVisibility();
            return true;
        });

        // Track actual physical size changes to prevent dock displacement during icon resizing
        this._lastAllocW = 0;
        this._lastAllocH = 0;
        this._allocationIdleId = 0;

        this._allocationId = this.actor.connect('notify::allocation', () => {
            if (!this.actor || this._isUpdatingPosition) return;
        
            let box = this.actor.get_allocation_box();
            let w = Math.round(box.x2 - box.x1);
            let h = Math.round(box.y2 - box.y1);
        
            if (this._lastAllocW !== w || this._lastAllocH !== h) {
                this._lastAllocW = w;
                this._lastAllocH = h;

                if (this._allocationIdleId) {
                    Mainloop.source_remove(this._allocationIdleId);
                }
            
                this._allocationIdleId = Mainloop.idle_add(() => {
                    this._allocationIdleId = 0;
                    if (this.actor) this._updatePosition();
                    return false;
                });
            }
        });
    }

    _updateTrashState() {
        if (!this.trashIcon) return;
        
        this._trashFile.query_info_async(
            'trash::item-count',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
            (file, res) => {
                try {
                    let info = file.query_info_finish(res);
                    let count = info.get_attribute_uint32('trash::item-count');
                    
                    if (this.trashIcon) {
                        this.trashIcon.set_icon_name(count > 0 ? 'user-trash-full' : 'user-trash');
                    }
                } catch (e) {
                    if (this.trashIcon) {
                        this.trashIcon.set_icon_name('user-trash');
                    }
                }
            }
        );
    }

    _updateTrashVisibility() {
        if (this.showTrash) {
            if (!this.trashButton.visible) {
                this.trashButton.remove_all_transitions();
                this.trashButton.show();
                
                let animEnabled = this.settings.getValue('enable-animations');
                let spawnAnimType = this.settings.getValue('spawn-animation-type');

                if (animEnabled) {
                    this.trashButton.opacity = 0;
                    
                    if (spawnAnimType === 'slide') {
                        if (this.dockPosition === 'top') this.trashButton.translation_y = -UI_ANIM_SLIDE;
                        else if (this.dockPosition === 'bottom') this.trashButton.translation_y = UI_ANIM_SLIDE;
                        else if (this.dockPosition === 'left') this.trashButton.translation_x = -UI_ANIM_SLIDE;
                        else if (this.dockPosition === 'right') this.trashButton.translation_x = UI_ANIM_SLIDE;
                        
                        this.trashButton.ease({
                            opacity: 255,
                            translation_x: 0,
                            translation_y: 0,
                            duration: 350,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD
                        });
                    } else {
                        // Bounce
                        this.trashButton.set_pivot_point(0.5, 0.5);
                        this.trashButton.set_scale(0.5, 0.5);
                        
                        this.trashButton.ease({ opacity: 255, duration: 450, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                        this.trashButton.ease({ scale_x: 1, scale_y: 1, duration: 450, mode: Clutter.AnimationMode.EASE_OUT_BACK });
                    }
                } else {
                    // no animation
                    this.trashButton.opacity = 255;
                    this.trashButton.set_scale(1, 1);
                    this.trashButton.translation_x = 0;
                    this.trashButton.translation_y = 0;
                }
            }
        } else {
            this.trashButton.remove_all_transitions();
            this.trashButton.hide();
        }
        
        this._updateSeparatorsVisibility(); 
        if (this.appList) this.appList._updateAppList(true);
    }

    _updateSeparatorsVisibility() {
        let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
        let sepStyle = isVert ? 'width: 30px; height: 2px; margin: 6px 0px;' : 'width: 2px; height: 30px; margin: 0px 6px;';

        if (this.settingsSeparatorBin && this.settingsSeparatorBin.get_child()) {
            this.settingsSeparatorBin.get_child().set_style(sepStyle);
        }
        if (this.trashSeparatorBin && this.trashSeparatorBin.get_child()) {
            this.trashSeparatorBin.get_child().set_style(sepStyle);
        }
        if (this.showSettingsIcon && this.showSeparators) {
            this.settingsSeparatorBin.show();
        } else {
            this.settingsSeparatorBin.hide();
        }
        if (this.showTrash && this.showSeparators) {
            this.trashSeparatorBin.show();
        } else {
            this.trashSeparatorBin.hide();
        }

        this.actor.queue_relayout();
        this._updatePosition();
    }

    _onShowSeparatorsChanged() {
        this.appList._updateAppList(true);
        this._updateSeparatorsVisibility();
    }

    _onFullWidthChanged() {
        this._updatePosition();
        this._updateAppearance();
    }

    _onShowTooltipsChanged() {
        if (this.appList) {
            this.appList._updateAppList(true);
        }
    }

    _buildDockMenu() {
        if (this.dockMenu) {
            this.menuManager.removeMenu(this.dockMenu);
            this.dockMenu.destroy();
        }
        
        let side;
        if (this.dockPosition === 'top') side = St.Side.TOP;
        else if (this.dockPosition === 'bottom') side = St.Side.BOTTOM;
        else if (this.dockPosition === 'left') side = St.Side.LEFT;
        else if (this.dockPosition === 'right') side = St.Side.RIGHT;

        this.dockMenu = new PopupMenu.PopupMenu(this.actor, 0.5, side);
        this.dockMenu.actor.add_style_class_name('menu');
        this.menuManager.addMenu(this.dockMenu);
        Main.uiGroup.add_actor(this.dockMenu.actor);
        this.dockMenu.actor.hide();

        let settingsItem = new PopupMenu.PopupMenuItem(_("Dock settings"));
        settingsItem.connect('activate', () => {
            Util.spawn(['xlet-settings', 'extension', UUID]);
            this.dockMenu.close();
        });
        this.dockMenu.addMenuItem(settingsItem);

        this.dockMenu.connect('open-state-changed', (m, open) => {
            if (open) {
                let [x, y] = this.actor.get_transformed_position();
                if (isNaN(x) || isNaN(y)) return;
                let dW = this.actor.get_width();
                let dH = this.actor.get_height();
                let [, natW] = this.dockMenu.actor.get_preferred_width(-1);
                let [, natH] = this.dockMenu.actor.get_preferred_height(natW);
                
                let menuX, menuY;
                if (this.dockPosition === 'left' || this.dockPosition === 'right') {
                    menuY = Math.round(y + (dH / 2) - (natH / 2));
                    menuX = Math.round(this.dockPosition === 'left' ? x + dW + 2 : x - natW - 2);
                } else {
                    menuX = Math.round(x + (dW / 2) - (natW / 2));
                    menuY = Math.round(this.dockPosition === 'top' ? y + dH + 2 : y - natH - 2);
                }
                this.dockMenu.actor.set_position(menuX, menuY);
            }
        });
    }

    _onPositionSettingsChanged() {
        let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
        this.actor.set_vertical(isVert);

        this.appList.setPosition(this.dockPosition);
        this._buildDockMenu();
        this._updateSeparatorsVisibility();
    }

    _onMonitorSettingsChanged() {
        if (this._monitorTimeoutId) {
            Mainloop.source_remove(this._monitorTimeoutId);
        }
        
        this._monitorTimeoutId = Mainloop.timeout_add(100, () => {
            this._monitorTimeoutId = 0;
            
            if (this.appList) {
                this.appList.setIconSize(this.settings.getValue('icon-size'));
            }
            return false;
        });
    } 

    _updateAppearance() {
        if (!this.actor) return;
        let color = this.bgColor || "rgba(30, 30, 30, 1)";
        let r = 30, g = 30, b = 30;

        // Parse hex/rgba to extract RGB components for luminance math
        if (color.startsWith('#')) {
            let hex = color.replace('#', '');
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            if (hex.length >= 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
        } else {
            let match = color.match(/\d+/g);
            if (match && match.length >= 3) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        }

        let alpha = this.bgOpacity / 100;
        let radius = this.fullWidth ? 0 : (this.borderRadius || 0);

        let baseLuminance = (299 * r + 587 * g + 114 * b) / 1000;
        
        // Remove the border when the opacity is set to 0
        let borderAlphaDark = alpha === 0 ? 0 : 0.11;
        let borderAlphaLight = alpha === 0 ? 0 : 0.095;
        let borderColor = baseLuminance > 120 ? `rgba(0, 0, 0, ${borderAlphaDark})` : `rgba(255, 255, 255, ${borderAlphaLight})`;

        this.actor.set_style(`background-color: rgba(${r}, ${g}, ${b}, ${alpha}); border-radius: ${radius}px; border-color: ${borderColor};`);

        // Smart contrast: ITU-R perceived luminance threshold
        let perceivedLuminance = baseLuminance * alpha;
        
        if (perceivedLuminance > 110) {
            this.actor.add_style_class_name('dash-dock-light');
        } else {
            this.actor.remove_style_class_name('dash-dock-light');
        }
    }

    _updateSettingsIcon() {
        if (!this.settingsButton) return;
        if (this.settingsButton.get_parent() === this.actor) {
            this.actor.remove_actor(this.settingsButton);
            this.actor.remove_actor(this.settingsSeparatorBin);
        }
        if (this.showSettingsIcon) {
            this.actor.insert_child_at_index(this.settingsButton, 1);
            this.actor.insert_child_at_index(this.settingsSeparatorBin, 2);
        }
        this._updateSeparatorsVisibility();
        if (this.appList) this.appList._updateAppList(true);
    }

    _updateSettingsIconSize() {
        if (this._resizeTimeoutId) {
            Mainloop.source_remove(this._resizeTimeoutId);
            this._resizeTimeoutId = 0;
        }

        this._resizeTimeoutId = Mainloop.timeout_add(150, () => {
            this._resizeTimeoutId = 0;
            
            if (this.appList) {
                this.appList.setIconSize(this.iconSize);
            }
            
            return false;
        });
    }

   _onHideSettingsChanged() {
        if (!this.actor) return;

        // Update positions before applying the strut to avoid 0x0 size errors and Cinnamon crash
        this._updatePosition();

        if (!this.hideEnabled) {
            if (this.strutActor) {
                Main.layoutManager.removeChrome(this.strutActor);
                Main.layoutManager.addChrome(this.strutActor, { 
                    affectsStruts: true,
                    affectsInputRegion: false
                });
            }
            if (this._hideTimeoutId > 0) {
                Mainloop.source_remove(this._hideTimeoutId);
                this._hideTimeoutId = 0;
            }
            this._showDock();
        } else {
            if (this.strutActor) {
                Main.layoutManager.removeChrome(this.strutActor);
            }
            this._updateVisibility();
        }

        this._updateZIndex();
    }

    _updatePosition() {
        if (!this.actor || !this.wrapper) return;
        if (this._isUpdatingPosition) return;
        this._isUpdatingPosition = true;

        if (this.appList && this.appList.currentIconSize) {
          let dynSize = this.appList.currentIconSize;
          let systemIconsResized = false;
          
          if (this.settingsIcon && this.settingsIcon.get_icon_size() !== dynSize) {
              this.settingsIcon.set_icon_size(dynSize);
              systemIconsResized = true;
          }
          if (this.trashIcon && this.trashIcon.get_icon_size() !== dynSize) {
              this.trashIcon.set_icon_size(dynSize);
              systemIconsResized = true;
          }

          if (systemIconsResized) {
              let bounceIcon = (btn) => {
                  if (!btn) return;
                  btn.set_pivot_point(0.5, 0.5);
                  btn.set_scale(0.5, 0.5);
                  btn.ease({ scale_x: 1, scale_y: 1, duration: 450, mode: Clutter.AnimationMode.EASE_OUT_BACK });
              };
              bounceIcon(this.settingsButton);
              bounceIcon(this.trashButton);
          }
      }
        
        // Multi screens
        let targetIndex;
        let totalMonitors = Main.layoutManager.monitors.length;

        if (this.usePrimaryMonitor) {
            targetIndex = Main.layoutManager.primaryIndex;
        } else {
            let rawIndex = this.settings.getValue('monitor-index');
            targetIndex = parseInt(rawIndex, 10);
            
            if (isNaN(targetIndex) || targetIndex >= totalMonitors || targetIndex < 0) {
                targetIndex = Main.layoutManager.primaryIndex;
            }
        }

        let monitor = Main.layoutManager.monitors[targetIndex];
        let activeWorkspace = global.workspace_manager.get_active_workspace();
        let workArea = activeWorkspace ? activeWorkspace.get_work_area_for_monitor(targetIndex) : monitor;

        let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
        let alignment = this.dockAlignment || 'center';

        try {
            if (this.fullWidth) {
                this.actor.add_style_class_name('dash-dock-full-width');
                
                this.leftSpacer.set_width(-1);
                this.leftSpacer.set_height(-1);
                this.rightSpacer.set_width(-1);
                this.rightSpacer.set_height(-1);

                if (alignment === 'start') {
                    this.leftSpacer.x_expand = false;
                    this.leftSpacer.y_expand = false;
                    this.rightSpacer.x_expand = true;
                    this.rightSpacer.y_expand = true;
                } else if (alignment === 'end') {
                    this.leftSpacer.x_expand = true;
                    this.leftSpacer.y_expand = true;
                    this.rightSpacer.x_expand = false;
                    this.rightSpacer.y_expand = false;
                } else { // center
                    this.leftSpacer.x_expand = true;
                    this.leftSpacer.y_expand = true;
                    this.rightSpacer.x_expand = true;
                    this.rightSpacer.y_expand = true;
                }

                if (isVert) {
                    this.actor.set_width(-1);
                    this.actor.set_height(workArea.height);
                } else {
                    this.actor.set_height(-1);
                    this.actor.set_width(workArea.width);
                }
            } else {
                this.actor.remove_style_class_name('dash-dock-full-width');
                this.actor.set_width(-1);
                this.actor.set_height(-1);
                
                this.leftSpacer.x_expand = false;
                this.leftSpacer.y_expand = false;
                this.rightSpacer.x_expand = false;
                this.rightSpacer.y_expand = false;
                
                this.leftSpacer.set_width(0);
                this.leftSpacer.set_height(0);
                this.rightSpacer.set_width(0);
                this.rightSpacer.set_height(0);
            }

            let [, natW] = this.actor.get_preferred_width(-1);
            let [, natH] = this.actor.get_preferred_height(-1);
            
            let dockW = this.fullWidth && !isVert ? workArea.width : natW;
            let dockH = this.fullWidth && isVert ? workArea.height : natH;
            
            let margin = this.fullWidth ? 0 : UI_DOCK_MARGIN;
            let orthoMargin = this.fullWidth ? 0 : UI_DOCK_MARGIN;
            
            let finalX = 0;
            
            if (isVert) {
                if (this.dockPosition === 'left') {
                    finalX = monitor.x + margin;
                } else {
                    finalX = monitor.x + monitor.width - dockW - margin;
                }
            } else {
                if (alignment === 'start') {
                    finalX = workArea.x + orthoMargin;
                } else if (alignment === 'end') {
                    finalX = workArea.x + workArea.width - dockW - orthoMargin;
                } else { // center
                    finalX = workArea.x + (workArea.width / 2) - (dockW / 2);
                }
            }

            let finalY = 0;
            
            if (!isVert) {
                if (this.dockPosition === 'top') {
                    finalY = monitor.y + margin;
                } else {
                    finalY = monitor.y + monitor.height - dockH - margin;
                }
            } else {
                if (alignment === 'start') {
                    finalY = workArea.y + orthoMargin;
                } else if (alignment === 'end') {
                    finalY = workArea.y + workArea.height - dockH - orthoMargin;
                } else { // center
                    finalY = workArea.y + (workArea.height / 2) - (dockH / 2);
                }
            }

            finalX = Math.round(finalX);
            finalY = Math.round(finalY);
            
            this.visibleX = finalX;
            this.visibleY = finalY;

            
            // The wrapper settles into the calculated position
            this.wrapper.set_position(finalX, finalY);
            this.wrapper.set_size(dockW, dockH);
            
            let clipX = 0;
            let clipY = 0;
            let clipW = dockW;
            let clipH = dockH;

            if (isVert) {
                if (this.dockPosition === 'left') {
                    clipX -= margin;
                    clipW += margin;
                } else if (this.dockPosition === 'right') {
                    clipW += margin;
                }
            } else {
                if (this.dockPosition === 'top') {
                    clipY -= margin;
                    clipH += margin;
                } else if (this.dockPosition === 'bottom') {
                    clipH += margin;
                }
            }
            
            this.wrapper.set_clip(clipX, clipY, clipW, clipH);

            if (this.strutActor) {
                if (isVert) {
                    let strutW = dockW + margin;
                    let strutX = 0;
                    
                    if (this.dockPosition === 'left') {
                        strutX = monitor.x;
                    } else {
                        strutX = monitor.x + monitor.width - strutW;
                    }
                    
                    this.strutActor.set_position(strutX, workArea.y);
                    this.strutActor.set_size(strutW, workArea.height);
                } else {
                    let strutH = dockH + margin; 
                    let strutY = 0;
                    
                    if (this.dockPosition === 'top') {
                        strutY = monitor.y;
                    } else {
                        strutY = monitor.y + monitor.height - strutH;
                    }
                    
                    this.strutActor.set_position(workArea.x, strutY);
                    this.strutActor.set_size(workArea.width, strutH);
                }
            }

            if (this.actor.opacity === 0 && !this._themeChanging && !this.isHidden && !this._isBooting) {
                this.actor.opacity = 255;
            }
            
        } catch (e) {
            global.logError(`[${UUID}] Error calculating dock position: ${e}`);
        } finally {
            this._isUpdatingPosition = false;
        }
    }

    // Updates the dock visibility based on auto-hide settings and window overlap.
    _updateVisibility() {
        if (this._inOverview) return;
        if (!this.hideEnabled || this._grabInProgress) return;
        if (!this.actor) return;

        let rawIndexVis = this.settings.getValue('monitor-index');
        let mIndexVis = parseInt(rawIndexVis, 10);
        let targetIndex = (this.usePrimaryMonitor || isNaN(mIndexVis) || mIndexVis >= Main.layoutManager.monitors.length || mIndexVis < 0) 
            ? Main.layoutManager.primaryIndex 
            : mIndexVis;
        let monitor = Main.layoutManager.monitors[targetIndex];

        let [mouseX, mouseY] = global.get_pointer();
        let [dockX, dockY] = this.actor.get_transformed_position();
        
        let isHoveringDock = (mouseX >= dockX - UI_HOVER_ZONE && mouseX <= dockX + this.actor.width + UI_HOVER_ZONE && 
                              mouseY >= dockY - UI_HOVER_ZONE && mouseY <= dockY + this.actor.height + UI_HOVER_ZONE);
        
        let isHoveringEdge = false;
        
        let isMouseOnTargetMonitor = (
            mouseX >= monitor.x - UI_HOVER_ZONE && mouseX <= monitor.x + monitor.width + UI_HOVER_ZONE &&
            mouseY >= monitor.y - UI_HOVER_ZONE && mouseY <= monitor.y + monitor.height + UI_HOVER_ZONE
        );

        if (isMouseOnTargetMonitor) {
            if (this.dockPosition === 'top') isHoveringEdge = (mouseY <= monitor.y + UI_HOVER_ZONE);
            else if (this.dockPosition === 'bottom') isHoveringEdge = (mouseY >= monitor.y + monitor.height - UI_HOVER_ZONE);
            else if (this.dockPosition === 'left') isHoveringEdge = (mouseX <= monitor.x + UI_HOVER_ZONE);
            else if (this.dockPosition === 'right') isHoveringEdge = (mouseX >= monitor.x + monitor.width - UI_HOVER_ZONE);
        }

        let isHovered = isHoveringDock || isHoveringEdge;

        let dockMenuOpen = this.menuManager && this.menuManager._activeMenu;
        let appMenuOpen = this.appList && this.appList.isAnyMenuOpen && this.appList.isAnyMenuOpen();
        
        if (isHovered || dockMenuOpen || appMenuOpen) {
            if (this._hideTimeoutId > 0) {
                Mainloop.source_remove(this._hideTimeoutId);
                this._hideTimeoutId = 0;
            }

            if (this.isHidden && this._showTimeoutId === 0) {
                if (this.showDelay > 0) {
                    this._showTimeoutId = Mainloop.timeout_add(this.showDelay, () => {
                        this._showTimeoutId = 0;
                        this._showDock();
                        return false; 
                    });
                } else {
                    this._showDock();
                }
            } else if (!this.isHidden) {
                this._showDock();
            }
            return;
        }

        if (this._showTimeoutId > 0) {
            Mainloop.source_remove(this._showTimeoutId);
            this._showTimeoutId = 0;
        }

        if (this.hideMode === 'auto') {
            this._queueHideDock();
        } else if (this.hideMode === 'intelli') {
            if (this._checkOverlap()) {
                this._queueHideDock();
            } else {
                this._showDock();
            }
        }
    }

    _queueHideDock() {
        if (this.isHidden) return;
        if (this._hideTimeoutId > 0) return;

        this._hideTimeoutId = Mainloop.timeout_add(350, () => {
            this._hideTimeoutId = 0;
            this._hideDock();
            return false; 
        });
    }

    _checkOverlap() {
        let dockW = this.actor.width;
        let dockH = this.actor.height;
        if (dockW === 0 || dockH === 0) return false;

        let isVert = this.dockPosition === 'left' || this.dockPosition === 'right';
        let [actualX, actualY] = this.actor.get_transformed_position();
        
         // On the axis along which the dock slides to hide, we check for a collision with its theoretical visible position.
        // On the axis along which it does not move, we retain its actual coordinate (which respects Start/Center/End).
        let dockX = isVert ? this.visibleX : actualX;
        let dockY = isVert ? actualY : this.visibleY;

        if (dockX === undefined) dockX = actualX;
        if (dockY === undefined) dockY = actualY;

        let activeWorkspace = global.workspace_manager.get_active_workspace();
        if (!activeWorkspace) return false;
        let windows = activeWorkspace.list_windows();

        let rawIndexOver = this.settings.getValue('monitor-index');
        let mIndexOver = parseInt(rawIndexOver, 10);
        let targetIndex = (this.usePrimaryMonitor || isNaN(mIndexOver) || mIndexOver >= Main.layoutManager.monitors.length || mIndexOver < 0) 
            ? Main.layoutManager.primaryIndex 
            : mIndexOver;

        for (let win of windows) {
            if (win.minimized) continue; 
            if (win.get_window_type() === Meta.WindowType.DESKTOP || win.get_window_type() === Meta.WindowType.DOCK) continue;
            if (win.get_monitor() !== targetIndex) continue;

            let rect = win.get_frame_rect();
            
            if (rect.x < dockX + dockW && rect.x + rect.width > dockX &&
                rect.y < dockY + dockH && rect.y + rect.height > dockY) {
                return true;
            }
        }
        return false;
    }

    // Ensures the dock and its strut barrier remain safely below Cinnamon panels and popup menus in the z-axis stacking order.
    _updateZIndex() {
        if (!this.wrapper || !this.wrapper.get_parent()) return;
        
        let parent = this.wrapper.get_parent();
        let children = parent.get_children();
        let targetActor = null;
        
        for (let child of children) {
            if (child === this.wrapper || child === this.strutActor) continue;
            
            let isPanel = (child.name === 'panelBox' || child.name === 'panel');
            let isMenu = false;
            
            if (typeof child.has_style_class_name === 'function') {
                isMenu = child.has_style_class_name('menu') || 
                         child.has_style_class_name('popup-menu') ||
                         child.has_style_class_name('panel');
            }
            
            if (isPanel || isMenu) {
                targetActor = child;
                break; 
            }
        }
        
        if (targetActor) {
            parent.set_child_below_sibling(this.wrapper, targetActor);
        }
        
        if (this.strutActor && this.strutActor.get_parent() === parent) {
            parent.set_child_below_sibling(this.strutActor, this.wrapper);
        }
    }

    _showDock() {
        if (this._hideTimeoutId > 0) {
            Mainloop.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }

        if (!this.isHidden) return;
        this.isHidden = false;

        Main.layoutManager.removeChrome(this.wrapper);
        Main.layoutManager.addChrome(this.wrapper, { affectsStruts: false, affectsInputRegion: true });
        this._updateZIndex();

        this.actor.reactive = true;
        
        this.actor.ease({ 
            duration: 200, 
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            translation_x: 0,
            translation_y: 0
        });
    }

    _hideDock() {
        if (this.isHidden) return;
        this.isHidden = true;

        this.actor.reactive = false;

        Main.layoutManager.removeChrome(this.wrapper);
        Main.layoutManager.addChrome(this.wrapper, { affectsStruts: false, affectsInputRegion: false });
        this._updateZIndex();
        
        let tweenProps = { duration: 150, mode: Clutter.AnimationMode.EASE_OUT_QUAD };
        let margin = this.fullWidth ? 0 : UI_DOCK_MARGIN;
        
        if (this.dockPosition === 'left') tweenProps.translation_x = -(this.actor.width + margin);
        else if (this.dockPosition === 'right') tweenProps.translation_x = (this.actor.width + margin);
        else if (this.dockPosition === 'top') tweenProps.translation_y = -(this.actor.height + margin);
        else if (this.dockPosition === 'bottom') tweenProps.translation_y = (this.actor.height + margin);
        
        this.actor.ease(tweenProps);
    }

    destroy() {
        if (this.trashTimer) {
            Mainloop.source_remove(this.trashTimer);
            this.trashTimer = 0;
        }
        if (this.trashTooltip) {
            this.trashTooltip.destroy();
        }

        if (this._trashTimeoutId) {
            Mainloop.source_remove(this._trashTimeoutId);
            this._trashTimeoutId = 0;
        }
        if (this._trashMonitor) {
            if (this._trashMonitorId) {
                this._trashMonitor.disconnect(this._trashMonitorId);
            }
            this._trashMonitor.cancel();
            this._trashMonitor = null;
            this._trashMonitorId = 0;
        }

        if (this._allocationId) {
            this.actor.disconnect(this._allocationId);
            this._allocationId = 0;
        }

        if (this._resizeTimeoutId) Mainloop.source_remove(this._resizeTimeoutId);
        if (this._hideTimeoutId) Mainloop.source_remove(this._hideTimeoutId);
        if (this._showTimeoutId) Mainloop.source_remove(this._showTimeoutId);
        if (this._visibilityLoopId) Mainloop.source_remove(this._visibilityLoopId);
        if (this._monitorsChangedId) Main.layoutManager.disconnect(this._monitorsChangedId);
        if (this._themeSetId) Main.themeManager.disconnect(this._themeSetId);

        if (this._monitorTimeoutId) {
            Mainloop.source_remove(this._monitorTimeoutId);
            this._monitorTimeoutId = 0;
        }

        if (this._themeTimeoutId) {
            Mainloop.source_remove(this._themeTimeoutId);
            this._themeTimeoutId = 0;
        }

        if (this._allocationIdleId) {
            Mainloop.source_remove(this._allocationIdleId);
            this._allocationIdleId = 0;
        }
       
        if (this._windowSignals) {
            for (let signal of this._windowSignals) {
                signal.obj.disconnect(signal.id);
            }
        }

        if (this._shellSignals) {
            for (let signal of this._shellSignals) {
                signal.obj.disconnect(signal.id);
            }
        }
        
        if (this.dockMenu) this.dockMenu.destroy();
        if (this.appList) this.appList.destroy();

        if (this.trashMenu) {
            this.trashMenu.destroy();
        }

        if (this.strutActor) {
            Main.layoutManager.removeChrome(this.strutActor);
            this.strutActor.destroy();
            this.strutActor = null;
        }
        
        if (this.wrapper) {
            this.actor.remove_all_transitions();
            Main.layoutManager.removeChrome(this.wrapper);
            this.wrapper.destroy();
            this.wrapper = null;
            this.actor = null;
        }

        if (this.settings) {
            this.settings.finalize();
            this.settings = null;
        }
    }
}
