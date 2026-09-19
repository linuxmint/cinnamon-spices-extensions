const St = imports.gi.St;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;

class StageManagerExtension {
    constructor(meta) {
        this.meta = meta;
        this.stageManagerBox = null;
        this.scrollView = null;
        this.windowList = null;
        this.indicatorUp = null;
        this.indicatorDown = null;
        this.currentFocusWindow = null;
        this.focusHistory = []; // Menyimpan urutan window yang terakhir difokuskan

        this.focusSignalId = 0;
        this.windowCreatedSignalId = 0;
        this.switchWsSignalId = 0;
        this.sizeChangeSignalId = 0;
        this._updateLayoutId = 0;

        this.displayMode = 'hybrid';
        this.maxMacWindows = 5;
        this.stagePosition = 'center';
        this.sidebarWidth = 150;
        this.topPanelHeight = 60;
        this.bottomPanelHeight = 0;
        this.showThumbnail = true;
        this.showTitle = true;
        this.showNavButtons = true;

        this.settings = new Settings.ExtensionSettings(this, this.meta.uuid, this.meta.uuid);
        
        this.settings.bindProperty(Settings.BindingDirection.IN, "display-mode", "displayMode", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "max-mac-windows", "maxMacWindows", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "stage-position", "stagePosition", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "sidebar-width", "sidebarWidth", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "top-panel-height", "topPanelHeight", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "bottom-panel-height", "bottomPanelHeight", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-thumbnail", "showThumbnail", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-title", "showTitle", this.onSettingsChanged.bind(this));
        this.settings.bindProperty(Settings.BindingDirection.IN, "show-nav-buttons", "showNavButtons", this.onSettingsChanged.bind(this));
    }

    onSettingsChanged() {
        if (this.stageManagerBox) {
            this.stageManagerBox.set_width(this.sidebarWidth);
            this.refreshWindows();
        }
    }

    enable() {
        this.stageManagerBox = new St.BoxLayout({
            vertical: true,
            width: this.sidebarWidth,
            reactive: true,
            clip_to_allocation: true
        });

        this.stageManagerBox.set_style(
            "background-color: rgba(25, 25, 25, 0.6); " +
            "border: 1px solid rgba(255, 255, 255, 0.15); " +
            "border-radius: 12px; " +
            "padding: 6px;"
        );

        this.stageManagerBox.connect('scroll-event', (actor, event) => {
            if (this.displayMode === 'mac') return Clutter.EVENT_STOP; // Mac style tidak butuh scroll

            if (!this.scrollView) return;
            let vscroll = this.scrollView.get_vscroll_bar();
            if (vscroll) {
                let adjustment = vscroll.get_adjustment();
                if (adjustment) {
                    let direction = event.get_scroll_direction();
                    let step = 120;
                    let value = adjustment.get_value();
                    let lower = adjustment.get_lower();
                    let upper = Math.max(lower, adjustment.get_upper() - adjustment.get_page_size());
                    
                    let newValue = value;
                    if (direction === Clutter.ScrollDirection.UP) newValue -= step;
                    else if (direction === Clutter.ScrollDirection.DOWN) newValue += step;

                    if (newValue < lower) newValue = lower;
                    if (newValue > upper) newValue = upper;
                    
                    adjustment.set_value(newValue);
                }
            }
            return Clutter.EVENT_STOP;
        });

        this.indicatorUp = new St.Bin({
            child: new St.Icon({ icon_name: 'go-up-symbolic', icon_size: 14 }),
            style: "background-color: rgba(255,255,255,0.06); border-radius: 6px; padding: 3px; margin-bottom: 4px;",
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });

        this.indicatorDown = new St.Bin({
            child: new St.Icon({ icon_name: 'go-down-symbolic', icon_size: 14 }),
            style: "background-color: rgba(255,255,255,0.06); border-radius: 6px; padding: 3px; margin-top: 4px;",
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });

        this.scrollView = new St.ScrollView({
            vscrollbar_policy: St.PolicyType.NEVER,
            hscrollbar_policy: St.PolicyType.NEVER,
            x_expand: true,
            y_expand: true,
            clip_to_allocation: true
        });

        this.windowList = new St.BoxLayout({
            vertical: true
        });

        this.scrollView.add_actor(this.windowList);

        this.stageManagerBox.add_actor(this.indicatorUp);
        this.stageManagerBox.add_actor(this.scrollView);
        this.stageManagerBox.add_actor(this.indicatorDown);

        Main.layoutManager.addChrome(this.stageManagerBox);

        this.focusSignalId = global.display.connect('notify::focus-window', this.checkWindowState.bind(this));
        this.windowCreatedSignalId = global.display.connect('window-created', this.checkWindowState.bind(this));
        this.switchWsSignalId = global.window_manager.connect('switch-workspace', this.checkWindowState.bind(this));

        this.checkWindowState();
    }

    updateStageLayout() {
        if (!this.stageManagerBox || !this.scrollView || !this.windowList) return;

        let monitor = Main.layoutManager.primaryMonitor;
        let maxAvailableHeight = monitor.height - this.topPanelHeight - this.bottomPanelHeight;
        
        let paddingBox = 12;
        let [minListH, natListH] = this.windowList.get_preferred_height(-1);

        let [, natUpH] = this.indicatorUp.get_preferred_height(-1);
        let [, natDownH] = this.indicatorDown.get_preferred_height(-1);
        let indicatorsHeight = natUpH + natDownH + 8;

        let finalStageHeight = maxAvailableHeight;
        let finalScrollHeight = maxAvailableHeight;

        // Jika mode Mac Style, indikator selalu disembunyikan karena sudah dibatasi jumlahnya
        if (this.displayMode === 'mac') {
            this.indicatorUp.hide();
            this.indicatorDown.hide();
            finalStageHeight = natListH + paddingBox;
            finalScrollHeight = natListH;
        } else {
            let fitsWithoutIndicators = (natListH + paddingBox) <= maxAvailableHeight;

            if (fitsWithoutIndicators) {
                this.indicatorUp.hide();
                this.indicatorDown.hide();
                finalStageHeight = natListH + paddingBox;
                finalScrollHeight = natListH; 
            } else {
                if (this.showNavButtons) {
                    this.indicatorUp.show();
                    this.indicatorDown.show();
                    finalStageHeight = maxAvailableHeight;
                    finalScrollHeight = finalStageHeight - indicatorsHeight - paddingBox; 
                } else {
                    this.indicatorUp.hide();
                    this.indicatorDown.hide();
                    finalStageHeight = maxAvailableHeight;
                    finalScrollHeight = finalStageHeight - paddingBox;
                }
            }
        }

        this.scrollView.set_height(finalScrollHeight);
        this.stageManagerBox.set_height(finalStageHeight);

        let yPos = this.topPanelHeight;
        if (this.stagePosition === 'bottom') {
            yPos = monitor.height - this.bottomPanelHeight - finalStageHeight;
        } else if (this.stagePosition === 'center') {
            yPos = this.topPanelHeight + Math.floor((maxAvailableHeight - finalStageHeight) / 2);
        }

        this.stageManagerBox.set_position(0, yPos);
    }

    checkWindowState() {
        let win = global.display.get_focus_window();
        
        if (win !== this.currentFocusWindow) {
            if (this.currentFocusWindow && this.sizeChangeSignalId) {
                this.currentFocusWindow.disconnect(this.sizeChangeSignalId);
                this.sizeChangeSignalId = 0;
            }
            
            this.currentFocusWindow = win;

            // Catat ke histori fokus untuk Mac Style
            if (this.currentFocusWindow) {
                let index = this.focusHistory.indexOf(this.currentFocusWindow);
                if (index > -1) {
                    this.focusHistory.splice(index, 1);
                }
                this.focusHistory.unshift(this.currentFocusWindow);

                this.sizeChangeSignalId = this.currentFocusWindow.connect('size-changed', this.updateSidebarVisibility.bind(this));
            }
        }

        this.updateSidebarVisibility();
        this.refreshWindows();
    }

    updateSidebarVisibility() {
        let workspace = global.workspace_manager.get_active_workspace();
        let windows = workspace.list_windows().filter(w => !w.is_skip_taskbar());

        if (windows.length < 2) {
            this.stageManagerBox.hide();
            return;
        }

        if (this.currentFocusWindow) {
            let isMaximized = (this.currentFocusWindow.get_maximized() === 3);
            let isOnPrimaryMonitor = (this.currentFocusWindow.get_monitor() === Main.layoutManager.primaryIndex);

            if (isMaximized && isOnPrimaryMonitor) {
                this.stageManagerBox.hide();
            } else {
                this.stageManagerBox.show();
            }
        } else {
            this.stageManagerBox.show();
        }
    }

    refreshWindows() {
        if (!this.windowList) return;

        let currentScroll = 0;
        if (this.scrollView) {
            let vscroll = this.scrollView.get_vscroll_bar();
            if (vscroll && vscroll.get_adjustment()) {
                currentScroll = vscroll.get_adjustment().get_value();
            }
        }

        this.windowList.destroy_all_children();

        let workspace = global.workspace_manager.get_active_workspace();
        let activeWindows = workspace.list_windows().filter(w => !w.is_skip_taskbar());

        let windowsToDisplay = [];

        if (this.displayMode === 'mac') {
            // Bersihkan histori dari window yang sudah ditutup
            this.focusHistory = this.focusHistory.filter(w => activeWindows.includes(w));

            // Masukkan window aktif yang belum masuk histori ke paling belakang
            activeWindows.forEach(w => {
                if (!this.focusHistory.includes(w)) {
                    this.focusHistory.push(w);
                }
            });

            // Ambil maksimal sejumlah konfigurasi maxMacWindows
            windowsToDisplay = this.focusHistory.slice(0, this.maxMacWindows);
        } else {
            windowsToDisplay = activeWindows;
        }

        let tracker = Cinnamon.WindowTracker.get_default();

        windowsToDisplay.forEach(win => {
            let itemBox = new St.BoxLayout({
                vertical: true,
                style: "padding: 6px 5px;"
            });

            let headerBox = new St.BoxLayout({
                vertical: false,
                style: "margin-bottom: 6px;"
            });

            let app = tracker.get_window_app(win);
            let iconActor = null;

            if (app) { iconActor = app.create_icon_texture(16); }
            if (!iconActor) {
                iconActor = new St.Icon({ icon_name: 'application-x-executable', icon_size: 16, icon_type: St.IconType.FULLCOLOR });
            }
            iconActor.set_style("margin-right: 6px;");
            headerBox.add_actor(iconActor);

            if (this.showTitle) {
                let title = win.get_title() || "App";
                if (title.length > 10) title = title.substring(0, 10) + "...";

                let titleLabel = new St.Label({
                    text: title,
                    style: "color: white; font-size: 11px; font-weight: bold;"
                });
                titleLabel.set_y_align(Clutter.ActorAlign.CENTER);
                headerBox.add_actor(titleLabel);
            }

            let headerContainer = new St.Bin({
                child: headerBox,
                x_align: St.Align.MIDDLE
            });
            itemBox.add_actor(headerContainer);

            if (this.showThumbnail) {
                let windowActor = win.get_compositor_private();

                if (windowActor) {
                    let rect = win.get_frame_rect();
                    let targetWidth = this.sidebarWidth - 30; 
                    
                    let winWidth = rect.width > 0 ? rect.width : 100;
                    let winHeight = rect.height > 0 ? rect.height : 100;
                    
                    let scale = targetWidth / winWidth;
                    let targetHeight = winHeight * scale;

                    let clone = new Clutter.Clone({
                        source: windowActor,
                        width: targetWidth,
                        height: targetHeight,
                        reactive: false
                    });

                    let imageBin = new St.Bin({
                        child: clone,
                        style: "border-radius: 6px; overflow: hidden; background-color: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);",
                        x_align: St.Align.MIDDLE
                    });
                    
                    let imageContainer = new St.Bin({
                        child: imageBin,
                        x_align: St.Align.MIDDLE
                    });

                    itemBox.add_actor(imageContainer);
                }
            }

            let btn = new St.Button({
                child: itemBox,
                style: "background-color: rgba(255, 255, 255, 0.08); " +
                       "margin-bottom: 8px; " +
                       "border-radius: 8px; " +
                       "transition-duration: 200;",
                can_focus: false
            });

            btn.connect('notify::hover', () => {
                btn.set_style(`background-color: rgba(255, 255, 255, ${btn.hover ? 0.15 : 0.08}); margin-bottom: 8px; border-radius: 8px;`);
            });

            btn.connect('clicked', () => {
                win.activate(global.get_current_time());
            });

            this.windowList.add_actor(btn);
        });

        if (this._updateLayoutId) {
            Mainloop.source_remove(this._updateLayoutId);
        }
        
        this._updateLayoutId = Mainloop.idle_add(() => {
            this.updateStageLayout();
            
            if (this.scrollView && this.displayMode !== 'mac') {
                let vscroll = this.scrollView.get_vscroll_bar();
                if (vscroll && vscroll.get_adjustment()) {
                    vscroll.get_adjustment().set_value(currentScroll);
                }
            }
            
            this._updateLayoutId = 0;
            return false; 
        });
    }

    disable() {
        if (this.focusSignalId) { global.display.disconnect(this.focusSignalId); this.focusSignalId = 0; }
        if (this.windowCreatedSignalId) { global.display.disconnect(this.windowCreatedSignalId); this.windowCreatedSignalId = 0; }
        if (this.switchWsSignalId) { global.window_manager.disconnect(this.switchWsSignalId); this.switchWsSignalId = 0; }
        
        if (this.currentFocusWindow && this.sizeChangeSignalId) {
            this.currentFocusWindow.disconnect(this.sizeChangeSignalId);
            this.sizeChangeSignalId = 0;
        }

        if (this._updateLayoutId) {
            Mainloop.source_remove(this._updateLayoutId);
            this._updateLayoutId = 0;
        }
        
        this.currentFocusWindow = null;
        this.focusHistory = [];

        if (this.stageManagerBox) {
            Main.layoutManager.removeChrome(this.stageManagerBox);
            this.stageManagerBox.destroy();
            this.stageManagerBox = null;
        }
    }
}

let extension;

function init(meta) {
    extension = new StageManagerExtension(meta);
}

function enable() {
    extension.enable();
}

function disable() {
    extension.disable();
}