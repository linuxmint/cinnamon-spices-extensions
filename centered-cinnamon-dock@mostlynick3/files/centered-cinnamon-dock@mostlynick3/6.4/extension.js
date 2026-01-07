const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const ModalDialog = imports.ui.modalDialog;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const UUID = "centered-cinnamon-dock@mostlynick3";
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(str) {
    return Gettext.dgettext(UUID, str);
}

let globalSettings;
let panelStates = {};
let sizeCheckTimeout;
let pointerWatcher;
let workspaceSignal;
let actorAddedSignal;
let editModeSignal;
let displayStateSignal;
let isInEditMode = false;
let windowCreatedSignal;
let isTransitioningWorkspace = false;
let panelMenuItems = {};
let panelAddedSignal;

const SCHEMA_VERSION = 2;

class PanelSettingsDialog {
    constructor(panel) {
        this._init(panel);
    }
    
    _init(panel) {
        this.panel = panel;
        this.panelId = getPanelIdentifier(panel);
        this.location = getPanelLocation(panel);
        this.settings = getPanelSettings(this.panelId);
        
        this._createDialog();
    }
    
    _createDialog() {
        let monitor = Main.layoutManager.findMonitorForActor(this.panel.actor);
        let monitorIndex = monitor ? Main.layoutManager.monitors.indexOf(monitor) : 0;
        
        let maxWidth = Math.floor(monitor.width * 0.5);
        let maxHeight = Math.floor(monitor.height * 0.6);
        
        this.dialog = new ModalDialog.ModalDialog();
        
        let locationName;
        if (this.location === "bottom") {
            locationName = _("Bottom Panel (Monitor %d)").replace("%d", monitorIndex);
        } else if (this.location === "top") {
            locationName = _("Top Panel (Monitor %d)").replace("%d", monitorIndex);
        } else if (this.location === "left") {
            locationName = _("Left Panel (Monitor %d)").replace("%d", monitorIndex);
        } else if (this.location === "right") {
            locationName = _("Right Panel (Monitor %d)").replace("%d", monitorIndex);
        }
        
        let title = new St.Label({
            text: _("Centered Dock Settings") + "\n" + locationName,
            style: 'font-size: 14pt; font-weight: bold; padding: 10px;'
        });
        this.dialog.contentLayout.add(title);
        
        let scrollView = new St.ScrollView({
            style: `max-height: ${maxHeight}px; max-width: ${maxWidth}px; min-width: 500px; padding: 10px;`,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC
        });
        
        this.contentBox = new St.BoxLayout({
            vertical: true,
            style: 'padding: 10px; spacing: 10px;'
        });
        
        scrollView.add_actor(this.contentBox);
        this.dialog.contentLayout.add(scrollView);
        
        this._buildSettings();
        
        this.dialog.setButtons([
            {
                label: _('Cancel'),
                action: this._onCancel.bind(this),
                key: Clutter.KEY_Escape
            },
            {
                label: _('Apply'),
                action: this._onApply.bind(this)
            },
            {
                label: _('OK'),
                action: this._onOK.bind(this),
                key: Clutter.KEY_Return
            }
        ]);
    }

    _buildSettings() {
        this._addHeader(_('General'));
        
        this.enabledSwitch = this._addSwitch(
            _('Enable Centered Dock for this panel'),
            this.settings.enabled
        );
        
        this._addSeparator();
        
        this.heightOffsetSlider = this._addSlider(
            _('Height offset (negative = up, positive = down)'),
            this.settings.heightOffset,
            -500,
            500,
            1
        );
        
        this.noWindowShiftSwitch = this._addSwitch(
            _("Don't shift windows (disable panel struts)"),
            this.settings.noWindowShift
        );
        
        this.animationTimeSlider = this._addSlider(
            _('Fade animation duration (ms)'),
            this.settings.animationTime,
            0,
            1000,
            50
        );
        
        this._addHeader(_('Appearance'));
        
        this.transparencySlider = this._addSlider(
            _('Transparency (%)'),
            this.settings.transparency,
            0,
            100,
            5
        );
        
        this.minWidthSlider = this._addSlider(
            _('Minimum dock width'),
            this.settings.minWidth || 0,
            0,
            2000,
            50
        );
        
        this.zoomEnabledSwitch = this._addSwitch(
            _('Enable zoom effect on hover'),
            this.settings.zoomEnabled
        );
        
        this.zoomFactorSlider = this._addSlider(
            _('Zoom scale factor'),
            this.settings.zoomFactor,
            1.0,
            2.0,
            0.1
        );
        
        this._addHeader(_('Auto-hide Behavior'));
        
        this.autoHideSwitch = this._addSwitch(
            _('Auto-hide dock when focusing apps'),
            this.settings.autoHide
        );
        
        this.showOnNoFocusSwitch = this._addSwitch(
            _('Show dock when no window is focused'),
            this.settings.showOnNoFocus
        );
        
        this.hideDelaySlider = this._addSlider(
            _('Delay before auto-hiding (ms)'),
            this.settings.hideDelay,
            0,
            5000,
            100
        );
        
        this.hoverPixelsSlider = this._addSlider(
            _('Height of trigger zone to show panel (px)'),
            this.settings.hoverPixels,
            1,
            100,
            1
        );
        
        this.showIndicatorSwitch = this._addSwitch(
            _('Show indicator of dock location in trigger zone'),
            this.settings.showIndicator
        );
        
        this.indicatorColorButton = this._addColorButton(
            _('Indicator color'),
            this.settings.indicatorColor
        );
    }

    _addHeader(text) {
        let header = new St.Label({
            text: text,
            style: 'font-size: 12pt; font-weight: bold; padding-top: 15px; padding-bottom: 10px; color: #4a90d9;'
        });
        this.contentBox.add(header, {
            x_fill: true,
            x_align: St.Align.START,
            y_fill: false,
            y_align: St.Align.START
        });
    }
    
    _addSeparator() {
        let separator = new St.Widget({
            style: 'height: 1px; background-color: #333333;',
            height: 1
        });
        this.contentBox.add(separator, {
            x_fill: true,
            y_fill: false
        });
    }
    
    _addSwitch(labelText, initialValue) {
        let box = new St.BoxLayout({
            style: 'padding: 8px 5px;',
            vertical: false
        });
        
        let label = new St.Label({
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER
        });

        let labelBin = new St.Bin({
            child: label,
            x_align: St.Align.START,
            style: 'padding-right: 20px;'
        });

        let switchWidget = new St.Button({
            style: 'width: 50px; height: 30px; background-color: ' + (initialValue ? '#4a90d9' : '#666666') + '; border-radius: 15px;',
            toggle_mode: true,
            checked: initialValue
        });

        switchWidget.connect('clicked', function() {
            switchWidget.set_style('width: 50px; height: 30px; background-color: ' + (switchWidget.checked ? '#4a90d9' : '#666666') + '; border-radius: 15px;');
        });

        let switchBin = new St.Bin({
            child: switchWidget,
            x_align: St.Align.END,
            style: 'padding-right: 10px;'
        });

        box.add(labelBin, { expand: true });
        box.add(switchBin, { expand: false });
        
        this.contentBox.add(box, {
            x_fill: true,
            y_fill: false
        
        });
        return switchWidget;
    }
    
    _addSlider(labelText, initialValue, min, max, step) {
        let box = new St.BoxLayout({
            style: 'padding: 8px 20px 8px 5px;',
            vertical: true
        });
        
        let topBox = new St.BoxLayout({
            vertical: false
        });
        
        let label = new St.Label({
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        let valueLabel = new St.Label({
            text: initialValue.toFixed(step < 1 ? 1 : 0),
            style: 'min-width: 50px; text-align: right;',
            y_align: Clutter.ActorAlign.CENTER
        });
        
        let valueBin = new St.Bin({
            child: valueLabel,
            x_align: St.Align.END,
            style: 'padding-right: 10px;'
        });
        
        topBox.add(label, { expand: true });
        topBox.add(valueBin, { expand: false });
        
        let sliderBox = new St.BoxLayout({
            style: 'padding-top: 5px;'
        });
        
        let slider = new St.DrawingArea({
            style: 'height: 20px;',
            reactive: true,
            height: 20
        });
        
        slider._min = min;
        slider._max = max;
        slider._step = step;
        slider._value = initialValue;
        slider._valueLabel = valueLabel;
        slider._dragging = false;
        
        slider.connect('repaint', () => {
            this._drawSlider(slider);
        });
        
        slider.connect('button-press-event', (actor, event) => {
            slider._dragging = true;
            this._updateSliderValue(slider, event);
            return Clutter.EVENT_STOP;
        });
        
        slider.connect('button-release-event', () => {
            slider._dragging = false;
            return Clutter.EVENT_STOP;
        });
        
        slider.connect('motion-event', (actor, event) => {
            if (slider._dragging) {
                this._updateSliderValue(slider, event);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        slider.connect('scroll-event', (actor, event) => {
            let direction = event.get_scroll_direction();
            if (direction == Clutter.ScrollDirection.UP) {
                slider._value = Math.min(slider._max, slider._value + slider._step);
            } else if (direction == Clutter.ScrollDirection.DOWN) {
                slider._value = Math.max(slider._min, slider._value - slider._step);
            }
            slider._valueLabel.set_text(slider._value.toFixed(step < 1 ? 1 : 0));
            slider.queue_repaint();
            return Clutter.EVENT_STOP;
        });
        
        sliderBox.add(slider, { expand: true });
        
        box.add(topBox, { x_fill: true, y_fill: false });
        box.add(sliderBox, { x_fill: true, y_fill: false });
        
        this.contentBox.add(box, {
            x_fill: true,
            y_fill: false
        });
        
        return slider;
    }
    
    _drawSlider(slider) {
        let cr = slider.get_context();
        let [width, height] = slider.get_surface_size();
        let radius = height / 2;
        
        cr.setSourceRGBA(0.3, 0.3, 0.3, 1.0);
        cr.rectangle(radius, height / 2 - 2, width - 2 * radius, 4);
        cr.fill();
        
        let percent = (slider._value - slider._min) / (slider._max - slider._min);
        let fillWidth = (width - 2 * radius) * percent;
        cr.setSourceRGBA(0.3, 0.6, 0.9, 1.0);
        cr.rectangle(radius, height / 2 - 2, fillWidth, 4);
        cr.fill();
        
        let handleX = radius + fillWidth;
        cr.setSourceRGBA(0.9, 0.9, 0.9, 1.0);
        cr.arc(handleX, height / 2, radius - 2, 0, 2 * Math.PI);
        cr.fill();
        
        cr.$dispose();
    }
    
    _updateSliderValue(slider, event) {
        let [x, y] = event.get_coords();
        let [ok, lx, ly] = slider.transform_stage_point(x, y);
        
        if (!ok) return;
        
        let width = slider.width;
        let radius = slider.height / 2;
        let usableWidth = width - 2 * radius;
        let clickX = Math.max(0, Math.min(usableWidth, lx - radius));
        
        let percent = clickX / usableWidth;
        let rawValue = slider._min + (slider._max - slider._min) * percent;
        slider._value = Math.round(rawValue / slider._step) * slider._step;
        slider._value = Math.max(slider._min, Math.min(slider._max, slider._value));
        
        slider._valueLabel.set_text(slider._value.toFixed(slider._step < 1 ? 1 : 0));
        slider.queue_repaint();
    }

    _addColorButton(labelText, initialColor) {
        let box = new St.BoxLayout({
            style: 'padding: 8px 20px 8px 5px;',
            vertical: true
        });
        
        let topBox = new St.BoxLayout({
            vertical: false
        });
        
        let label = new St.Label({
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        topBox.add(label, { expand: true });
        
        let previewBox = new St.Bin({
            style: 'width: 40px; height: 40px; border: 2px solid #666; border-radius: 4px; background-color: ' + this._rgbaToHex(initialColor) + ';',
            x_align: St.Align.END
        });
        
        topBox.add(previewBox, { expand: false });
        
        box.add(topBox, { x_fill: true, y_fill: false });
        
        let hexBox = new St.BoxLayout({
            style: 'padding-top: 10px;',
            vertical: false
        });
        
        let hexLabel = new St.Label({
            text: _('Hex color:'),
            y_align: Clutter.ActorAlign.CENTER,
            style: 'padding-right: 10px;'
        });
        
        let hexEntry = new St.Entry({
            text: this._rgbaToHex(initialColor),
            style: 'width: 180px; background-color: #1a1a1a; border: 2px solid #4a90d9; border-radius: 4px; padding: 6px 10px; color: #ffffff; font-family: monospace;',
            hint_text: _('Type hex color')
        });
        
        let colorPicker = {
            selectedColor: initialColor,
            previewBox: previewBox,
            hexEntry: hexEntry,
            _hexToRgba: function(hex) {
                let r = parseInt(hex.substr(1, 2), 16);
                let g = parseInt(hex.substr(3, 2), 16);
                let b = parseInt(hex.substr(5, 2), 16);
                return 'rgba(' + r + ', ' + g + ', ' + b + ', 1.0)';
            }
        };
        
        hexEntry.clutter_text.connect('text-changed', function() {
            let hexText = hexEntry.get_text().trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(hexText)) {
                colorPicker.selectedColor = colorPicker._hexToRgba(hexText);
                previewBox.set_style('width: 40px; height: 40px; border: 2px solid #666; border-radius: 4px; background-color: ' + hexText + ';');
            }
        });
        
        hexBox.add(hexLabel, { expand: false });
        hexBox.add(hexEntry, { expand: true });
        
        box.add(hexBox, { x_fill: true, y_fill: false });
        
        let colorGrid = new St.BoxLayout({
            style: 'padding-top: 10px; spacing: 5px;',
            vertical: true
        });
        
        let stockColors = [
            ['#000000', '#1a1a1a', '#333333', '#4d4d4d', '#666666'],
            ['#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#2ecc71'],
            ['#3498db', '#9b59b6', '#1abc9c', '#16a085', '#27ae60']
        ];
        
        stockColors.forEach(row => {
            let rowBox = new St.BoxLayout({
                style: 'spacing: 5px;'
            });
            
            row.forEach(color => {
                let colorBtn = new St.Button({
                    style: 'width: 80px; height: 40px; background-color: ' + color + '; border-radius: 4px; border: 2px solid #666;'
                });
                
                colorBtn.connect('clicked', function() {
                    colorPicker.selectedColor = colorPicker._hexToRgba(color);
                    previewBox.set_style('width: 40px; height: 40px; border: 2px solid #666; border-radius: 4px; background-color: ' + color + ';');
                    hexEntry.set_text(color);
                });
                
                rowBox.add(colorBtn, { expand: true });
            });
            
            colorGrid.add(rowBox, { x_fill: true, y_fill: false });
        });
        
        box.add(colorGrid, { x_fill: true, y_fill: false });
        
        this.contentBox.add(box, {
            x_fill: true,
            y_fill: false
        });
        
        return colorPicker;
    }

    _rgbaToHex(rgba) {
        let match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return '#1e1e1e';
        
        let r = parseInt(match[1]).toString(16).padStart(2, '0');
        let g = parseInt(match[2]).toString(16).padStart(2, '0');
        let b = parseInt(match[3]).toString(16).padStart(2, '0');
        
        return '#' + r + g + b;
    }

    _gatherSettings() {
        return {
            enabled: this.enabledSwitch.checked,
            transparency: this.transparencySlider._value,
            heightOffset: this.heightOffsetSlider._value,
            autoHide: this.autoHideSwitch.checked,
            hoverPixels: this.hoverPixelsSlider._value,
            noWindowShift: this.noWindowShiftSwitch.checked,
            animationTime: this.animationTimeSlider._value,
            showOnNoFocus: this.showOnNoFocusSwitch.checked,
            zoomFactor: this.zoomFactorSlider._value,
            zoomEnabled: this.zoomEnabledSwitch.checked,
            indicatorColor: this.indicatorColorButton.selectedColor,
            showIndicator: this.showIndicatorSwitch.checked,
            hideDelay: this.hideDelaySlider._value,
            minWidth: this.minWidthSlider._value
        };
    }
    
    _onCancel() {
        this.dialog.close();
    }
    
    _onApply() {
        let newSettings = this._gatherSettings();
        savePanelSettings(this.panelId, newSettings);
        
        cleanupAllPanels();
        Mainloop.timeout_add(100, function() {
            initializePanels();
            addPanelMenuItems();
            return false;
        });
    }
    
    _onOK() {
        this._onApply();
        this.dialog.close();
    }
    
    open() {
        this.dialog.open();
    }
}

function init(metadata) {
}

function enable() {
    globalSettings = new Settings.ExtensionSettings(this, "centered-cinnamon-dock@mostlynick3");
    
    migrateSettings();
    
    isInEditMode = global.settings.get_boolean("panel-edit-mode");
    
    editModeSignal = global.settings.connect("changed::panel-edit-mode", function() {
        let newEditMode = global.settings.get_boolean("panel-edit-mode");
        if (newEditMode !== isInEditMode) {
            isInEditMode = newEditMode;
            handleEditModeChange();
        }
    });
    
    displayStateSignal = Main.layoutManager.connect('monitors-changed', function() {
        if (isInEditMode) return;
        
        disableAutoHide();
        panelStates = {};
        
        Mainloop.idle_add(function() {
            initializePanels();
            return false;
        });
    });
    
    panelAddedSignal = Main.panelManager.connect('panel-added', function(manager, panel) {
        addPanelMenuItem(panel);
        if (shouldApplyToPanel(panel)) {
            initPanel(panel);
        }
    });
    
    addPanelMenuItems();
    
    initializePanels();
}
function migrateSettings() {
    let version = globalSettings.getValue("schema-version");
    
    if (version < SCHEMA_VERSION) {
        try {
            let oldPanelMode = globalSettings.getValue("panel-mode-old");
            let oldEnabledPanels = globalSettings.getValue("enabled-panels-old");
            
            if (oldPanelMode && oldPanelMode !== "") {
                Main.panelManager.panels.forEach(panel => {
                    let panelId = getPanelIdentifier(panel);
                    let shouldEnable = false;
                    
                    if (oldPanelMode === "custom-selection") {
                        shouldEnable = oldEnabledPanels.includes(panelId);
                    } else {
                        let location = getPanelLocation(panel);
                        if (oldPanelMode === "main") {
                            shouldEnable = panel === Main.panel;
                        } else if (oldPanelMode === "bottom") {
                            shouldEnable = location === "bottom";
                        } else if (oldPanelMode === "top") {
                            shouldEnable = location === "top";
                        } else if (oldPanelMode === "both") {
                            shouldEnable = location === "bottom" || location === "top";
                        }
                    }
                    
                    if (shouldEnable) {
                        let panelSettings = getPanelSettings(panelId);
                        panelSettings.enabled = true;
                        savePanelSettings(panelId, panelSettings);
                    }
                });
                
                globalSettings.setValue("panel-mode-old", "");
                globalSettings.setValue("enabled-panels-old", "");
            }
        } catch(e) {
        }
        
        globalSettings.setValue("schema-version", SCHEMA_VERSION);
    }
}

function getPanelSettings(panelId) {
    let allSettings = globalSettings.getValue("panel-settings");
    
    if (allSettings[panelId]) {
        return allSettings[panelId];
    }
    
    return {
        enabled: false,
        transparency: 85,
        heightOffset: -8,
        autoHide: true,
        hoverPixels: 8,
        noWindowShift: true,
        animationTime: 500,
        showOnNoFocus: true,
        zoomFactor: 1.3,
        zoomEnabled: true,
        indicatorColor: "rgba(30, 30, 30, 1.0)",
        showIndicator: true,
        hideDelay: 2000,
        minWidth: 50
    };
}

function savePanelSettings(panelId, settings) {
    let allSettings = globalSettings.getValue("panel-settings");
    allSettings[panelId] = settings;
    globalSettings.setValue("panel-settings", allSettings);
}

function addPanelMenuItems() {
    Main.panelManager.panels.forEach(panel => {
        addPanelMenuItem(panel);
    });
}

function addPanelMenuItem(panel) {
    if (!panel._context_menu) return;
    
    let separator = new PopupMenu.PopupSeparatorMenuItem();
    panel._context_menu.addMenuItem(separator);
    
    let menuItem = new PopupMenu.PopupMenuItem(_("Centered Dock Settings"));
    menuItem.connect('activate', function() {
        openPanelSettingsDialog(panel);
    });
    panel._context_menu.addMenuItem(menuItem);
    
    if (!panelMenuItems[panel.panelId]) {
        panelMenuItems[panel.panelId] = [];
    }
    panelMenuItems[panel.panelId].push(separator);
    panelMenuItems[panel.panelId].push(menuItem);
}

function removePanelMenuItems() {
    for (let panelId in panelMenuItems) {
        let items = panelMenuItems[panelId];
        items.forEach(item => {
            try {
                item.destroy();
            } catch(e) {}
        });
    }
    panelMenuItems = {};
}

function openPanelSettingsDialog(panel) {
    try {
        let dialog = new PanelSettingsDialog(panel);
        dialog.open();
    } catch(e) {
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
                panel.actor.set_scale(1.0, 1.0);
                panel.actor.set_style('');
                panel.actor.y = state.originalY;
                panel.actor.x = state.originalX;
                panel.actor.opacity = 255;
                panel.actor.show();
                Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: true });
                
                cleanupAppletZoom(panel);
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
                state.originalX = panel.actor.x;
            }
        }
    });
    
    Mainloop.timeout_add(150, function() {
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                let state = panelStates[panel.panelId];
                if (state) {
                    state.lastWidth = 0;
                    state.lastHeight = 0;
                    checkAndApplyStyle(panel, true);
                    setupAppletZoom(panel);
                    
                    if (state.wasHidden && getPanelSetting(panel, "autoHide")) {
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

function initializePanels() {
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel)) {
            if (!panelStates[panel.panelId]) {
                initPanel(panel);
            }
            panel.actor.show();
            panel.actor.opacity = 255;
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
                if (state) {
                    Tweener.removeTweens(panel.actor);
                    if (state.indicator) {
                        Tweener.removeTweens(state.indicator);
                        destroyIndicator(panel);
                    }
                    if (state.hideDelayTimeout) {
                        Mainloop.source_remove(state.hideDelayTimeout);
                        state.hideDelayTimeout = null;
                    }
                    if (state.animationTimer) {
                        Mainloop.source_remove(state.animationTimer);
                        state.animationTimer = null;
                    }
                    
                    state.isHidden = false;
                    state.isHiding = false;
                    state.isShowing = false;
                    panel.actor.opacity = 0;
                    panel.actor.show();
                    
                    checkAndApplyStyle(panel, true);
                }
            }
        });
        
        Mainloop.timeout_add(100, function() {
            Main.panelManager.panels.forEach(panel => {
                if (shouldApplyToPanel(panel) && getPanelSetting(panel, "autoHide")) {
                    hidePanel(panel);
                }
            });
            return false;
        });
    });

    windowCreatedSignal = global.display.connect('window-created', function(display, win) {
        if (isInEditMode) return;
        
        win.connect('unmanaged', function() {
            if (isInEditMode) return;
            Main.panelManager.panels.forEach(panel => {
                if (shouldApplyToPanel(panel)) {
                    checkAndApplyStyle(panel, true);
                }
            });
        });
        
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                checkAndApplyStyle(panel, true);
            }
        });
    });
    
    Mainloop.timeout_add(100, function() {
        if (!isInEditMode) {
            Main.panelManager.panels.forEach(panel => {
                if (shouldApplyToPanel(panel)) {
                    checkAndApplyStyle(panel);
                    setupAppletZoom(panel);
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

function handleEditModeChange() {
    if (isInEditMode) {
        enterEditMode();
    } else {
        exitEditMode();
    }
}

function getPanelIdentifier(panel) {
    let monitor = Main.layoutManager.findMonitorForActor(panel.actor);
    let monitorIndex = monitor ? Main.layoutManager.monitors.indexOf(monitor) : 0;
    let location = getPanelLocation(panel);
    return `monitor${monitorIndex}_${location}`;
}

function shouldApplyToPanel(panel) {
    let panelId = getPanelIdentifier(panel);
    let settings = getPanelSettings(panelId);
    return settings.enabled;
}

function getPanelSetting(panel, key) {
    let panelId = getPanelIdentifier(panel);
    let settings = getPanelSettings(panelId);
    return settings[key];
}

function initPanel(panel) {
    panelStates[panel.panelId] = {
        originalY: panel.actor.y,
        originalX: panel.actor.x,
        lastWidth: 0,
        lastHeight: 0,
        trackedMenus: [],
        isHidden: false,
        location: getPanelLocation(panel),
        savedOpacity: 255,
        wasHidden: false,
        styleSignal: null,
        showSignal: null,
        zoomEnterId: null,
        zoomLeaveId: null,
        indicator: null,
        hideDelayTimeout: null,
        animationTimer: null,
        isAnimating: false,
        allocateId: null,
        originalAllocate: null,
        allocationId: null,
        previousPadding: 20
    };
    
    let state = panelStates[panel.panelId];
    
    if (getPanelSetting(panel, "noWindowShift")) {
        Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: false });
    }
    
    state.allocationId = panel.actor.connect('notify::allocation', function() {
        let heightOffset = getPanelSetting(panel, "heightOffset");
        if (state.location === "bottom" || state.location === "top") {
            let adjustedOffset = state.location === 'top' ? -heightOffset : heightOffset;
            let targetY = state.originalY + adjustedOffset;
            if (panel.actor.y !== targetY) {
                panel.actor.y = targetY;
            }
        } else {
            let adjustedOffset = state.location === 'left' ? -heightOffset : heightOffset;
            let targetX = state.originalX + adjustedOffset;
            if (panel.actor.x !== targetX) {
                panel.actor.x = targetX;
            }
        }
    });
    
    state.styleSignal = panel.actor.connect('style-changed', function() {
        if (isInEditMode) return;
        
        let state = panelStates[panel.panelId];
        if (state && state.isAnimating) return;
        
        Mainloop.timeout_add(10, function() {
            applyStyle(panel);
            return false;
        });
    });
    
    state.showSignal = panel.actor.connect('show', function() {
        if (isInEditMode) return;
        
        let state = panelStates[panel.panelId];
        if (state && state.isHidden && getPanelSetting(panel, "autoHide")) {
            panel.actor.hide();
            state.isHidden = false;
        }
    });
}

function cleanupAllPanels() {
    disableAutoHide();

    if (displayStateSignal) {
        Main.layoutManager.disconnect(displayStateSignal);
        displayStateSignal = null;
    }

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
    
    if (windowCreatedSignal) {
        global.display.disconnect(windowCreatedSignal);
        windowCreatedSignal = null;
    }
    
    if (panelAddedSignal) {
        Main.panelManager.disconnect(panelAddedSignal);
        panelAddedSignal = null;
    }
    
    Main.panelManager.panels.forEach(panel => {
        let state = panelStates[panel.panelId];
        
        Tweener.removeTweens(panel.actor);
        
        if (state) {
            destroyIndicator(panel);
            
            if (state.hideDelayTimeout) {
                Mainloop.source_remove(state.hideDelayTimeout);
                state.hideDelayTimeout = null;
            }
            
            if (state.animationTimer) {
                Mainloop.source_remove(state.animationTimer);
                state.animationTimer = null;
            }
            
            if (state.styleSignal !== null && state.styleSignal !== undefined) {
                try {
                    panel.actor.disconnect(state.styleSignal);
                } catch(e) {}
                state.styleSignal = null;
            }

            if (state.showSignal !== null && state.showSignal !== undefined) {
                try {
                    panel.actor.disconnect(state.showSignal);
                } catch(e) {}
                state.showSignal = null;
            }
            
            if (state.allocateId !== null && state.allocateId !== undefined) {
                try {
                    panel.actor.disconnect(state.allocateId);
                } catch(e) {}
                state.allocateId = null;
            }
            
            if (state.allocationId !== null && state.allocationId !== undefined) {
                try {
                    panel.actor.disconnect(state.allocationId);
                } catch(e) {}
                state.allocationId = null;
            }
            
            cleanupAppletZoom(panel);
            
            panel.actor.y = state.originalY;
        }
        
        panel.actor.set_scale(1.0, 1.0);
        panel.actor.set_style('');
        panel.actor.opacity = 255;
        panel.actor.show();
        Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: true });
    });
    
    removePanelMenuItems();
    
    panelStates = {};
}

function setupAppletZoom(panel) {
    if (isInEditMode) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    cleanupAppletZoom(panel);
    
    if (!getPanelSetting(panel, "zoomEnabled")) return;
    
    state.zoomEnterId = panel.actor.connect('enter-event', function(actor, event) {
        let target = event.get_source();
        if (target && target !== panel.actor && !isLayoutContainer(target)) {
            zoomApplet(panel, target, true);
        }
    });
    
    state.zoomLeaveId = panel.actor.connect('leave-event', function(actor, event) {
        let target = event.get_source();
        if (target && target !== panel.actor) {
            zoomApplet(panel, target, false);
        }
    });
}

function isLayoutContainer(actor) {
    let actorType = actor.toString();
    
    if (actorType.includes('StBoxLayout') || 
        actorType.includes('St.BoxLayout') ||
        actorType.includes('StBin') ||
        actorType.includes('ClutterActor') ||
        actorType.includes('St.Bin')) {
        return true;
    }
    
    return false;
}

function cleanupAppletZoom(panel) {
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    if (state.zoomEnterId) {
        try {
            panel.actor.disconnect(state.zoomEnterId);
        } catch(e) {}
        state.zoomEnterId = null;
    }
    
    if (state.zoomLeaveId) {
        try {
            panel.actor.disconnect(state.zoomLeaveId);
        } catch(e) {}
        state.zoomLeaveId = null;
    }
}

function zoomApplet(panel, actor, zoomIn) {
    if (isInEditMode) return;
    
    Tweener.removeTweens(actor);
    
    actor.set_pivot_point(0.5, 0.5);
    
    let zoomFactor = getPanelSetting(panel, "zoomFactor") || 1.3;
    let targetScale = zoomIn ? zoomFactor : 1.0;
    
    Tweener.addTween(actor, {
        scale_x: targetScale,
        scale_y: targetScale,
        time: 0.15,
        transition: 'easeOutQuad'
    });
}

function resetAllAppletZoom(panel) {
    let boxes = [panel._leftBox, panel._centerBox, panel._rightBox];
    
    boxes.forEach(box => {
        let children = box.get_children();
        children.forEach(child => {
            Tweener.removeTweens(child);
            child.set_pivot_point(0.5, 0.5);
            child.set_scale(1.0, 1.0);
        });
    });
}

function applyZoomToActor(actor, scale) {
    Tweener.removeTweens(actor);
    
    actor.set_pivot_point(0.5, 0.5);
    
    Tweener.addTween(actor, {
        scale_x: scale,
        scale_y: scale,
        time: 0.1,
        transition: 'easeOutQuad'
    });
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
             actor.has_style_class_name('popup-menu-item') ||
             actor.has_style_class_name('item-box'))) {

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
    let hoverPixels = getPanelSetting(panel, "hoverPixels");
    let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
    
    if (state.location === "bottom" || state.location === "top") {
        let triggerWidth = Math.max(state.lastWidth, minPanelWidth);
        let panelLeft = monitor.x + (monitor.width - triggerWidth) / 2;
        let panelRight = panelLeft + triggerWidth;
        
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
    } else if (state.location === "left" || state.location === "right") {
        let panelTop = monitor.y + (monitor.height - state.lastHeight) / 2;
        let panelBottom = panelTop + state.lastHeight;
        
        if (y < panelTop || y > panelBottom) {
            return false;
        }
        
        if (state.location === "left") {
            return x >= monitor.x && 
                   x <= monitor.x + hoverPixels;
        } else if (state.location === "right") {
            return x >= monitor.x + monitor.width - hoverPixels && 
                   x <= monitor.x + monitor.width;
        }
    }
    
    return false;
}

function toggleAutoHide() {
    disableAutoHide();
    
    let anyAutoHide = false;
    Main.panelManager.panels.forEach(panel => {
        if (shouldApplyToPanel(panel) && getPanelSetting(panel, "autoHide")) {
            anyAutoHide = true;
        }
    });
    
    if (anyAutoHide) {
        enableAutoHide();
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

function enableAutoHide(indicatorStatus) {
    disableAutoHide(indicatorStatus);
    
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        let state = panelStates[panel.panelId];
        if (!state) return;
        
        state.hideDelayTimeout = null;
    });
    
    pointerWatcher = Mainloop.timeout_add(100, function() {
        if (isInEditMode) return true;
        
        let [x, y, mods] = global.get_pointer();
        
        Main.panelManager.panels.forEach(panel => {
            if (!shouldApplyToPanel(panel)) return;
            if (!getPanelSetting(panel, "autoHide")) return;
            
            let state = panelStates[panel.panelId];
            if (!state) return;
            
            if (state.isHidden && !state.isShowing && !state.isHiding) {
                if (!panel.actor.visible) {
                    panel.actor.show();
                }
                if (panel.actor.opacity !== 0) {
                    panel.actor.opacity = 0;
                }
                
                if (state.location === "bottom" || state.location === "top") {
                    let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
                    let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
                    let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
                    let contentWidth = leftWidth + centerWidth + rightWidth;
                    let panelPadding = 20;
                    let newWidth = Math.max(contentWidth + (panelPadding * 2), 200);
                    
                    if (newWidth !== state.lastWidth) {
                        state.lastWidth = newWidth;
                        if (state.indicator && getPanelSetting(panel, "showIndicator")) {
                            updateIndicator(panel);
                        }
                    }
                } else if (state.location === "left" || state.location === "right") {
                    let [minHeight, leftHeight] = panel._leftBox.get_preferred_height(-1);
                    let [minHeight2, centerHeight] = panel._centerBox.get_preferred_height(-1);
                    let [minHeight3, rightHeight] = panel._rightBox.get_preferred_height(-1);
                    let contentHeight = Math.max(leftHeight, centerHeight, rightHeight);
                    let panelPadding = 20;
                    let newHeight = Math.max(contentHeight + (panelPadding * 2), 40);
                    
                    if (newHeight !== state.lastHeight) {
                        state.lastHeight = newHeight;
                        if (state.indicator && getPanelSetting(panel, "showIndicator")) {
                            updateIndicator(panel);
                        }
                    }
                }
                
                if (getPanelSetting(panel, "showIndicator") && !state.indicator) {
                    createIndicator(panel);
                }
            }
            
            let menusActive = hasActiveMenus(panel);
            let mouseOverTriggerZone = isMouseInTriggerZone(panel, x, y);
            
            let focusWindow = global.display.focus_window;
            let hasNormalWindow = focusWindow && focusWindow.window_type === Meta.WindowType.NORMAL;
            let showOnNoFocus = getPanelSetting(panel, "showOnNoFocus");
            let shouldShowOnNoFocus = !hasNormalWindow && showOnNoFocus;
            
            let shouldShow = menusActive || mouseOverTriggerZone || shouldShowOnNoFocus;
            
            if (!state.isHidden) {
                let mouseOverDockOrMenus = isMouseOverDockOrMenus(panel);
                shouldShow = shouldShow || mouseOverDockOrMenus;
            } else if (state.isHiding) {
                if (isMouseOverDockOrMenus(panel)) {
                    shouldShow = true;
                }
            }
            
            if (shouldShow && state.isHidden) {
                if (state.hideDelayTimeout) {
                    Mainloop.source_remove(state.hideDelayTimeout);
                    state.hideDelayTimeout = null;
                }
                showPanel(panel);
            } else if (!shouldShow && !state.isHidden) {
                if (!state.hideDelayTimeout) {
                    let hideDelay = getPanelSetting(panel, "hideDelay");
                    state.hideDelayTimeout = Mainloop.timeout_add(hideDelay, function() {
                        state.hideDelayTimeout = null;
                        hidePanel(panel);
                        return false;
                    });
                }
            } else if (shouldShow && !state.isHidden && state.hideDelayTimeout) {
                Mainloop.source_remove(state.hideDelayTimeout);
                state.hideDelayTimeout = null;
            }
        });
        
        return true;
    });
}

function createIndicator(panel) {
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    if (state.indicator) {
        destroyIndicator(panel);
    }
    
    let monitor = getMonitorGeometry(panel);
    let hoverPixels = getPanelSetting(panel, "hoverPixels");
    let transparency = getPanelSetting(panel, "transparency") / 100.0;
    let indicatorColor = getPanelSetting(panel, "indicatorColor");
    
    let indicator = new St.BoxLayout({
        style_class: 'dock-indicator',
        reactive: false
    });
    
    let indicatorWidth, indicatorHeight, indicatorX, indicatorY;
    
    if (state.location === "bottom" || state.location === "top") {
        let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
        indicatorWidth = Math.max(state.lastWidth, minPanelWidth);
        indicatorHeight = hoverPixels;
        indicatorX = monitor.x + (monitor.width - indicatorWidth) / 2;
        
        if (state.location === "bottom") {
            indicatorY = monitor.y + monitor.height - hoverPixels;
        } else {
            indicatorY = monitor.y;
        }
    } else if (state.location === "left" || state.location === "right") {
        indicatorWidth = hoverPixels;
        indicatorHeight = state.lastHeight;
        indicatorY = monitor.y + (monitor.height - indicatorHeight) / 2;
        
        if (state.location === "left") {
            indicatorX = state.originalX;
        } else {
            indicatorX = state.originalX + panel.actor.width - hoverPixels;
        }
    }
    
    indicator.set_position(indicatorX, indicatorY);
    indicator.set_size(indicatorWidth, indicatorHeight);
    
    let colorWithTransparency = indicatorColor.replace(/[\d.]+\)$/, transparency + ')');
    
    indicator.set_style(
        'background-color: ' + colorWithTransparency + ';' +
        'border-radius: 12px;'
    );
    
    Main.layoutManager.addChrome(indicator, {
        affectsStruts: false,
        affectsInputRegion: false
    });
    
    state.indicator = indicator;
    state.indicatorOriginalX = indicatorX;
    state.indicatorOriginalY = indicatorY;
}

function updateIndicator(panel) {
    let state = panelStates[panel.panelId];
    if (!state || !state.indicator) return;
    
    let monitor = getMonitorGeometry(panel);
    let hoverPixels = getPanelSetting(panel, "hoverPixels");
    let transparency = getPanelSetting(panel, "transparency") / 100.0;
    let indicatorColor = getPanelSetting(panel, "indicatorColor");
    
    let indicatorWidth, indicatorHeight, indicatorX, indicatorY;
    
    if (state.location === "bottom" || state.location === "top") {
        let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
        indicatorWidth = Math.max(state.lastWidth, minPanelWidth);
        indicatorHeight = hoverPixels;
        indicatorX = monitor.x + (monitor.width - indicatorWidth) / 2;
        
        if (state.location === "bottom") {
            indicatorY = monitor.y + monitor.height - hoverPixels;
        } else {
            indicatorY = monitor.y;
        }
        
        state.indicator.set_position(indicatorX, indicatorY);
        
        Tweener.removeTweens(state.indicator);
        
        Tweener.addTween(state.indicator, {
            width: indicatorWidth,
            time: 0.2,
            transition: 'easeOutQuad',
            onUpdate: function() {
                let currentWidth = state.indicator.width;
                let newX = monitor.x + (monitor.width - currentWidth) / 2;
                state.indicator.x = newX;
            }
        });
    } else if (state.location === "left" || state.location === "right") {
        indicatorWidth = hoverPixels;
        indicatorHeight = state.lastHeight;
        indicatorY = monitor.y + (monitor.height - indicatorHeight) / 2;
        
        if (state.location === "left") {
            indicatorX = state.originalX;
        } else {
            indicatorX = state.originalX + panel.actor.width - hoverPixels;
        }
        
        state.indicator.set_position(indicatorX, indicatorY);
        
        Tweener.removeTweens(state.indicator);
        
        Tweener.addTween(state.indicator, {
            height: indicatorHeight,
            time: 0.2,
            transition: 'easeOutQuad',
            onUpdate: function() {
                let currentHeight = state.indicator.height;
                let newY = monitor.y + (monitor.height - currentHeight) / 2;
                state.indicator.y = newY;
            }
        });
    }
    
    let colorWithTransparency = indicatorColor.replace(/[\d.]+\)$/, transparency + ')');
    
    state.indicator.set_style(
        'background-color: ' + colorWithTransparency + ';' +
        'border-radius: 12px;'
    );
    
    state.indicatorOriginalX = indicatorX;
    state.indicatorOriginalY = indicatorY;
}

function destroyIndicator(panel) {
    let state = panelStates[panel.panelId];
    if (!state || !state.indicator) return;
    
    Main.layoutManager.removeChrome(state.indicator);
    state.indicator.destroy();
    state.indicator = null;
}

function showPanel(panel) {
    if (isInEditMode) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    if (state.location === "left" || state.location === "right") {        
        [panel._leftBox, panel._centerBox, panel._rightBox].forEach((box, boxIndex) => {
            let boxName = ["leftBox", "centerBox", "rightBox"][boxIndex];
            let [minW, natW] = box.get_preferred_width(-1);
            let [minH, natH] = box.get_preferred_height(-1);
            
            let children = box.get_children();
            children.forEach((child, childIndex) => {
                let [childMinW, childNatW] = child.get_preferred_width(-1);
                let [childMinH, childNatH] = child.get_preferred_height(-1);
            });
        });
    }
    
    if (state.hideDelayTimeout) {
        Mainloop.source_remove(state.hideDelayTimeout);
        state.hideDelayTimeout = null;
    }
    
    if (state.animationTimer) {
        Mainloop.source_remove(state.animationTimer);
        state.animationTimer = null;
    }
    
    state.isHidden = false;
    state.isHiding = false;
    state.isShowing = true;
    state.lastCheckState = true;
    
    panel.actor.set_scale(1.0, 1.0);
    panel.actor.show();
    panel.actor.raise_top();
    
    resetAllAppletZoom(panel);
    
    checkAndApplyStyle(panel);
    
    let animTime = getPanelSetting(panel, "animationTime");
    let startTime = Date.now();
    let startOpacity = panel.actor.opacity;
    
    if (state.indicator) {
        let monitor = getMonitorGeometry(panel);
        let heightOffset = getPanelSetting(panel, "heightOffset");
        let panelCenterPos;
        
        if (state.location === "bottom" || state.location === "top") {
            let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
            panelCenterPos = state.originalY + (panel.actor.height / 2) + adjustedOffset;
            
            let indicatorStartY = state.indicator.y;
            let indicatorStartOpacity = state.indicator.opacity;
            
            state.animationTimer = Mainloop.timeout_add(16, function() {
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / animTime, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                panel.actor.opacity = startOpacity + (255 - startOpacity) * eased;
                state.indicator.opacity = indicatorStartOpacity + (0 - indicatorStartOpacity) * eased;
                state.indicator.y = indicatorStartY + (panelCenterPos - indicatorStartY) * eased;
                
                if (progress >= 1.0) {
                    panel.actor.opacity = 255;
                    state.indicator.opacity = 0;
                    state.indicator.y = panelCenterPos;
                    state.animationTimer = null;
                    state.isShowing = false;
                    return false;
                }
                return true;
            });
        } else if (state.location === "left" || state.location === "right") {
            let adjustedOffset = state.location === "left" ? -heightOffset : heightOffset;
            panelCenterPos = state.originalX + (panel.actor.width / 2) + adjustedOffset;
            
            let indicatorStartX = state.indicator.x;
            let indicatorStartOpacity = state.indicator.opacity;
            
            state.animationTimer = Mainloop.timeout_add(16, function() {
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / animTime, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                panel.actor.opacity = startOpacity + (255 - startOpacity) * eased;
                state.indicator.opacity = indicatorStartOpacity + (0 - indicatorStartOpacity) * eased;
                state.indicator.x = indicatorStartX + (panelCenterPos - indicatorStartX) * eased;
                
                if (progress >= 1.0) {
                    panel.actor.opacity = 255;
                    state.indicator.opacity = 0;
                    state.indicator.x = panelCenterPos;
                    state.animationTimer = null;
                    state.isShowing = false;
                    return false;
                }
                return true;
            });
        }
    } else {
        state.animationTimer = Mainloop.timeout_add(16, function() {
            let elapsed = Date.now() - startTime;
            let progress = Math.min(elapsed / animTime, 1.0);
            let eased = 1 - Math.pow(1 - progress, 3);
            
            panel.actor.opacity = startOpacity + (255 - startOpacity) * eased;
            
            if (progress >= 1.0) {
                panel.actor.opacity = 255;
                state.animationTimer = null;
                state.isShowing = false;
                return false;
            }
            return true;
        });
    }
}

function hidePanel(panel) {
    if (isInEditMode) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    if (state.isHidden || state.isHiding) return;
    
    if (hasActiveMenus(panel)) {
        return;
    }
    
    function hideTooltips(actor) {
        if (actor.toString().includes('StLabel "Tooltip"') && actor.visible) {
            actor.hide();
        }
        if (actor.get_children) {
            actor.get_children().forEach(child => hideTooltips(child));
        }
    }
    hideTooltips(global.stage);
    
    resetAllAppletZoom(panel);
    
    if (state.animationTimer) {
        Mainloop.source_remove(state.animationTimer);
        state.animationTimer = null;
    }
    
    state.isHiding = true;
    state.isShowing = false;
    state.lastCheckState = false;
    
    if (state.location === "bottom" || state.location === "top") {
        let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
        let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
        let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
        let contentWidth = leftWidth + centerWidth + rightWidth;
        let panelPadding = 20;
        state.lastWidth = Math.max(contentWidth + (panelPadding * 2), 200);
    } else if (state.location === "left" || state.location === "right") {
        let [minHeight, leftHeight] = panel._leftBox.get_preferred_height(-1);
        let [minHeight2, centerHeight] = panel._centerBox.get_preferred_height(-1);
        let [minHeight3, rightHeight] = panel._rightBox.get_preferred_height(-1);
        let contentHeight = Math.max(leftHeight, centerHeight, rightHeight);
        let panelPadding = 20;
        state.lastHeight = Math.max(contentHeight + (panelPadding * 2), 40);
    }
    
    let animTime = getPanelSetting(panel, "animationTime");
    let startTime = Date.now();
    let startOpacity = panel.actor.opacity;
    
    if (getPanelSetting(panel, "showIndicator")) {
        let monitor = getMonitorGeometry(panel);
        let heightOffset = getPanelSetting(panel, "heightOffset");
        let panelCenterPos;
        
        if (state.location === "bottom" || state.location === "top") {
            let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
            panelCenterPos = state.originalY + (panel.actor.height / 2) + adjustedOffset;
            
            if (!state.indicator) {
                createIndicator(panel);
                state.indicator.opacity = 0;
                state.indicator.y = panelCenterPos;
            } else {
                updateIndicator(panel);
                state.indicator.opacity = 0;
                state.indicator.y = panelCenterPos;
            }
            
            let indicatorStartY = state.indicator.y;
            let indicatorStartOpacity = state.indicator.opacity;
            
            state.animationTimer = Mainloop.timeout_add(16, function() {
                if (hasActiveMenus(panel) || isMouseOverDockOrMenus(panel)) {
                    state.animationTimer = null;
                    state.isHiding = false;
                    state.isHidden = false;
                    showPanel(panel);
                    return false;
                }
                
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / animTime, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                panel.actor.opacity = startOpacity + (0 - startOpacity) * eased;
                state.indicator.opacity = indicatorStartOpacity + (255 - indicatorStartOpacity) * eased;
                state.indicator.y = indicatorStartY + (state.indicatorOriginalY - indicatorStartY) * eased;
                
                if (progress >= 1.0) {
                    panel.actor.opacity = 0;
                    state.indicator.opacity = 255;
                    state.indicator.y = state.indicatorOriginalY;
                    state.isHidden = true;
                    state.isHiding = false;
                    if (!hasActiveMenus(panel)) {
                        panel.actor.set_scale(0.0, 0.0);
                    } else {
                        state.isHidden = false;
                        showPanel(panel);
                    }
                    state.animationTimer = null;
                    return false;
                }
                return true;
            });
        } else if (state.location === "left" || state.location === "right") {
            let adjustedOffset = state.location === "left" ? -heightOffset : heightOffset;
            panelCenterPos = state.originalX + (panel.actor.width / 2) + adjustedOffset;
            
            if (!state.indicator) {
                createIndicator(panel);
                state.indicator.opacity = 0;
                state.indicator.x = panelCenterPos;
            } else {
                updateIndicator(panel);
                state.indicator.opacity = 0;
                state.indicator.x = panelCenterPos;
            }
            
            let indicatorStartX = state.indicator.x;
            let indicatorStartOpacity = state.indicator.opacity;
            
            state.animationTimer = Mainloop.timeout_add(16, function() {
                if (hasActiveMenus(panel) || isMouseOverDockOrMenus(panel)) {
                    state.animationTimer = null;
                    state.isHiding = false;
                    state.isHidden = false;
                    showPanel(panel);
                    return false;
                }
                
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / animTime, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                panel.actor.opacity = startOpacity + (0 - startOpacity) * eased;
                state.indicator.opacity = indicatorStartOpacity + (255 - indicatorStartOpacity) * eased;
                state.indicator.x = indicatorStartX + (state.indicatorOriginalX - indicatorStartX) * eased;
                
                if (progress >= 1.0) {
                    panel.actor.opacity = 0;
                    state.indicator.opacity = 255;
                    state.indicator.x = state.indicatorOriginalX;
                    state.isHidden = true;
                    state.isHiding = false;
                    if (!hasActiveMenus(panel)) {
                        panel.actor.set_scale(0.0, 0.0);
                    } else {
                        state.isHidden = false;
                        showPanel(panel);
                    }
                    state.animationTimer = null;
                    return false;
                }
                return true;
            });
        }
    } else {
        state.animationTimer = Mainloop.timeout_add(16, function() {
            if (hasActiveMenus(panel) || isMouseOverDockOrMenus(panel)) {
                state.animationTimer = null;
                state.isHiding = false;
                state.isHidden = false;
                showPanel(panel);
                return false;
            }
            
            let elapsed = Date.now() - startTime;
            let progress = Math.min(elapsed / animTime, 1.0);
            let eased = 1 - Math.pow(1 - progress, 3);
            
            panel.actor.opacity = startOpacity + (0 - startOpacity) * eased;
            
            if (progress >= 1.0) {
                panel.actor.opacity = 0;
                state.isHidden = true;
                state.isHiding = false;
                if (!hasActiveMenus(panel)) {
                    panel.actor.set_scale(0.0, 0.0);
                } else {
                    state.isHidden = false;
                    showPanel(panel);
                }
                state.animationTimer = null;
                return false;
            }
            return true;
        });
    }
}

function disableAutoHide(indicatorStatus) {
    if (pointerWatcher) {
        Mainloop.source_remove(pointerWatcher);
        pointerWatcher = null;
    }
    
    if (indicatorStatus === "keepIndicators") {
        Main.panelManager.panels.forEach(panel => {
            let state = panelStates[panel.panelId];
            if (state) {
                Tweener.removeTweens(panel.actor);
            }
        });
    } else {
        Main.panelManager.panels.forEach(panel => {
            let state = panelStates[panel.panelId];
            if (state) {
                destroyIndicator(panel);
                Tweener.removeTweens(panel.actor);
                panel.actor.opacity = 255;
                panel.actor.show();
                state.isHidden = false;
            }
        });
    }
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
    if (isInEditMode || isTransitioningWorkspace) return true;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    let heightOffset = getPanelSetting(panel, "heightOffset");
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
    sizeCheckTimeout = Mainloop.timeout_add(500, function() {
        if (isInEditMode || isTransitioningWorkspace) return true;
        
        Main.panelManager.panels.forEach(panel => {
            if (shouldApplyToPanel(panel)) {
                let state = panelStates[panel.panelId];
                if (state) {
                    if (!state.isHidden && (panel.actor.scale_x === 0.0 || panel.actor.scale_y === 0.0)) {
                        global.log(`[CenteredDock] INCONSISTENT STATE DETECTED for panel ${panel.panelId}: isHidden=${state.isHidden}, scale=${panel.actor.scale_x},${panel.actor.scale_y}, opacity=${panel.actor.opacity}, isHiding=${state.isHiding}, isShowing=${state.isShowing}`);
                        showPanel(panel);
                    }
                    
                    if (!state.isHidden) {
                        checkAndApplyStyle(panel, true);
                    }
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
    
    [panel._leftBox, panel._centerBox, panel._rightBox].forEach(box => {
        box.get_children().forEach(child => {
            if (child._applet && child._applet._updateApplet) {
                child._applet._updateApplet();
            }
            if (child._applet && child._applet.on_panel_height_changed) {
                child._applet.on_panel_height_changed();
            }
            if (child.actor) {
                child.actor.queue_relayout();
            }
        });
    });
    
    let panelPadding = 20;
    let newWidth, newHeight;
    
    if (state.location === "bottom" || state.location === "top") {
        let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
        let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
        let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
        
        let contentWidth = leftWidth + centerWidth + rightWidth;
        let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
        newWidth = Math.max(contentWidth + (panelPadding * 2), minPanelWidth, 200);
        newHeight = state.lastHeight;
    } else if (state.location === "left" || state.location === "right") {
        let [minHeight, leftHeight] = panel._leftBox.get_preferred_height(-1);
        let [minHeight2, centerHeight] = panel._centerBox.get_preferred_height(-1);
        let [minHeight3, rightHeight] = panel._rightBox.get_preferred_height(-1);
        
        let contentHeight = leftHeight + centerHeight + rightHeight;
        
        let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
        let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
        let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
        
        let contentWidth = Math.max(leftWidth, centerWidth, rightWidth);
        
        newHeight = Math.max(contentHeight + (panelPadding * 2), 40);
        newWidth = Math.max(contentWidth + (panelPadding * 2), 40);
    }

    if ((newWidth !== state.lastWidth || newHeight !== state.lastHeight || forceApply) && !state.isAnimating) {
        state.lastWidth = newWidth;
        state.lastHeight = newHeight;
        applyStyle(panel, forceApply);
        
        if (state.indicator && getPanelSetting(panel, "showIndicator")) {
            updateIndicator(panel);
        }
    }
}

function applyStyle(panel, forceApply) {
    if (isInEditMode && !forceApply) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    let transparency = getPanelSetting(panel, "transparency") / 100.0;
    let heightOffset = getPanelSetting(panel, "heightOffset");
    let monitor = getMonitorGeometry(panel);
    
    let savedOpacity = state.isHidden ? 0 : panel.actor.opacity;
    
    let panelPadding = 20;
    
    if (state.location === "bottom" || state.location === "top") {
        let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
        
        let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
        let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
        let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
        let contentWidth = leftWidth + centerWidth + rightWidth;
        
        let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
        let actualContentWidth = contentWidth + (panelPadding * 2);
        let desiredWidth = Math.max(actualContentWidth, minPanelWidth);
        
        let extraPadding = 0;
        if (minPanelWidth > actualContentWidth) {
            extraPadding = Math.floor((minPanelWidth - actualContentWidth) / 2);
        }
        
        let totalPadding = panelPadding + extraPadding;
        let desiredMargin = (monitor.width - desiredWidth) / 2;
        
        let sizeDiff = Math.abs(state.previousWidth - desiredWidth);
        let paddingDiff = Math.abs((state.previousPadding || panelPadding) - totalPadding);
        
        if ((sizeDiff > 5 || paddingDiff > 5) && !state.isHiding && !state.isShowing && state.previousWidth > 0) {
            state.isAnimating = true;
            let startMargin = (monitor.width - state.previousWidth) / 2;
            let endMargin = desiredMargin;
            let startPadding = state.previousPadding || panelPadding;
            let endPadding = totalPadding;
            let startTime = Date.now();
            let duration = 200;
            
            if (state.marginAnimationTimer) {
                Mainloop.source_remove(state.marginAnimationTimer);
            }
            
            state.marginAnimationTimer = Mainloop.timeout_add(16, function() {
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / duration, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                let currentMargin = startMargin + (endMargin - startMargin) * eased;
                let currentPadding = Math.floor(startPadding + (endPadding - startPadding) * eased);
                
                panel.actor.set_style(
                    'border-radius: 12px;' +
                    'padding: 0px ' + currentPadding + 'px;' +
                    'margin-left: ' + currentMargin + 'px;' +
                    'margin-right: ' + currentMargin + 'px;' +
                    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);' +
                    'opacity: ' + transparency + ';'
                );
                panel.actor.opacity = savedOpacity;
                
                let targetY = state.originalY + adjustedOffset;
                if (panel.actor.y !== targetY) {
                    panel.actor.y = targetY;
                }
                if (panel.actor.x !== state.originalX) {
                    panel.actor.x = state.originalX;
                }
                panel.actor.fixed_position_set = true;
                
                if (progress >= 1.0) {
                    state.marginAnimationTimer = null;
                    state.previousWidth = desiredWidth;
                    state.previousPadding = totalPadding;
                    state.isAnimating = false;
                    return false;
                }
                return true;
            });
        } else {
            panel.actor.set_style(
                'border-radius: 12px;' +
                'padding: 0px ' + totalPadding + 'px;' +
                'margin-left: ' + desiredMargin + 'px;' +
                'margin-right: ' + desiredMargin + 'px;' +
                'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);' +
                'opacity: ' + transparency + ';'
            );
            panel.actor.opacity = savedOpacity;
            state.previousWidth = desiredWidth;
            state.previousPadding = totalPadding;
        }
        
        let targetY = state.originalY + adjustedOffset;
        if (panel.actor.y !== targetY) {
            panel.actor.y = targetY;
        }
        if (panel.actor.x !== state.originalX) {
            panel.actor.x = state.originalX;
        }
        panel.actor.fixed_position_set = true;
    } else if (state.location === "left" || state.location === "right") {
        let adjustedOffset = state.location === "left" ? -heightOffset : heightOffset;
        
        let usableHeight = monitor.height;
        let usableTopOffset = 0;
        
        Main.panelManager.panels.forEach(otherPanel => {
            if (otherPanel === panel) return;
            let otherLocation = getPanelLocation(otherPanel);
            let otherMonitor = Main.layoutManager.findMonitorForActor(otherPanel.actor);
            let thisMonitor = Main.layoutManager.findMonitorForActor(panel.actor);
            if (!otherMonitor || !thisMonitor || otherMonitor !== thisMonitor) return;
            
            let otherPanelId = getPanelIdentifier(otherPanel);
            let otherSettings = getPanelSettings(otherPanelId);
            
            if (otherLocation === "top") {
                usableTopOffset = otherPanel.actor.height;
                usableHeight -= otherPanel.actor.height;
            } else if (otherLocation === "bottom") {
                usableHeight -= otherPanel.actor.height;
            }
        });
        
        let desiredMargin = (usableHeight - state.lastHeight) / 2;
        
        let sizeDiff = Math.abs(state.previousHeight - state.lastHeight);
        
        if (sizeDiff > 5 && !state.isHiding && !state.isShowing && state.previousHeight > 0) {
            state.isAnimating = true;
            let startMargin = (usableHeight - state.previousHeight) / 2;
            let endMargin = desiredMargin;
            let startTime = Date.now();
            let duration = 200;
            
            if (state.marginAnimationTimer) {
                Mainloop.source_remove(state.marginAnimationTimer);
            }
            
            state.marginAnimationTimer = Mainloop.timeout_add(16, function() {
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / duration, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                let currentMargin = startMargin + (endMargin - startMargin) * eased;
                
                panel.actor.set_style(
                    'border-radius: 12px;' +
                    'padding: ' + panelPadding + 'px 0px;' +
                    'margin-top: ' + (currentMargin + usableTopOffset) + 'px;' +
                    'margin-bottom: ' + currentMargin + 'px;' +
                    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);' +
                    'opacity: ' + transparency + ';'
                );
                panel.actor.opacity = savedOpacity;
                
                let targetX = state.originalX + adjustedOffset;
                if (panel.actor.x !== targetX) {
                    panel.actor.x = targetX;
                }
                if (panel.actor.y !== state.originalY) {
                    panel.actor.y = state.originalY;
                }
                panel.actor.fixed_position_set = true;
                
                if (progress >= 1.0) {
                    state.marginAnimationTimer = null;
                    state.previousHeight = state.lastHeight;
                    state.isAnimating = false;
                    return false;
                }
                return true;
            });
        } else {
            panel.actor.set_style(
                'border-radius: 12px;' +
                'padding: ' + panelPadding + 'px 0px;' +
                'margin-top: ' + (desiredMargin + usableTopOffset) + 'px;' +
                'margin-bottom: ' + desiredMargin + 'px;' +
                'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);' +
                'opacity: ' + transparency + ';'
            );
            panel.actor.opacity = savedOpacity;
            state.previousHeight = state.lastHeight;
        }
        
        let targetX = state.originalX + adjustedOffset;
        if (panel.actor.x !== targetX) {
            panel.actor.x = targetX;
        }
        if (panel.actor.y !== state.originalY) {
            panel.actor.y = state.originalY;
        }
        panel.actor.fixed_position_set = true;
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

function disable() {
    cleanupAllPanels();
    if (globalSettings) {
        globalSettings.finalize();
        globalSettings = null;
    }
}