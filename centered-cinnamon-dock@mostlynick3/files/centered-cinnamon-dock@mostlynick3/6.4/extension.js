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
let windowStateChangedSignals = [];

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
            this.settings.enabled || false
        );
        
        this._addSeparator();
        
        this.heightOffsetSlider = this._addSlider(
            _('Height offset (negative = up, positive = down)'),
            this.settings.heightOffset || -8,
            -500,
            500,
            1
        );
        
        this.noWindowShiftSwitch = this._addSwitch(
            _("Don't shift windows (disable panel struts)"),
            this.settings.noWindowShift || false
        );
        
        this.animationTimeSlider = this._addSlider(
            _('Fade animation duration (ms)'),
            this.settings.animationTime || 500,
            0,
            1000,
            50
        );
        
        this._addHeader(_('Appearance'));
        
        this.transparencySlider = this._addSlider(
            _('Transparency (%)'),
            this.settings.transparency || 85,
            0,
            100,
            5
        );
        
        this.minWidthSlider = this._addSlider(
            _('Minimum dock width'),
            this.settings.minWidth || 50,
            50,
            2000,
            50
        );
        
        this.zoomEnabledSwitch = this._addSwitch(
            _('Enable zoom effect on hover'),
            this.settings.zoomEnabled || false
        );
        
        this.zoomFactorSlider = this._addSlider(
            _('Zoom scale factor'),
            this.settings.zoomFactor || 1.3,
            1.0,
            2.0,
            0.1
        );
        
        this._addHeader(_('Auto-hide Behavior'));
        
        let modeLabel = new St.Label({
            text: _('Choose one auto-hide mode (mutually exclusive):'),
            style: 'font-style: italic; padding: 5px 5px 10px 5px; color: #999999; font-size: 10pt;'
        });
        this.contentBox.add(modeLabel, {
            x_fill: true,
            y_fill: false
        });
        
        let hideOnFullscreen = this.settings.hideOnFullscreen || false;
        let autoHide = this.settings.autoHide || false;
        let showOnNoFocus = this.settings.showOnNoFocus || false;
        
        this.autoHideSwitch = this._addSwitch(
            _('Auto-hide dock when focusing apps'),
            autoHide && !hideOnFullscreen
        );
        
        this.showOnNoFocusSwitch = this._addSwitch(
            _('    ↳ Show dock when no window is focused'),
            showOnNoFocus && !hideOnFullscreen
        );
        
        this._addSeparator();
        
        this.hideOnFullscreenSwitch = this._addSwitch(
            _('Show dock unless window covers full screen'),
            hideOnFullscreen
        );
        
        let fullscreenDesc = new St.Label({
            text: _('(Dock visible unless a window covers the full screen)'),
            style: 'font-style: italic; padding: 0px 5px 8px 30px; color: #888888; font-size: 9pt;'
        });
        this.contentBox.add(fullscreenDesc, {
            x_fill: true,
            y_fill: false
        });
        
        this._addSeparator();
        
        let commonSettingsLabel = new St.Label({
            text: _('Auto-hide timing settings:'),
            style: 'font-weight: bold; padding: 10px 5px 5px 5px; font-size: 10pt; color: #4a90d9;'
        });
        this.contentBox.add(commonSettingsLabel, {
            x_fill: true,
            y_fill: false
        });
        
        this.hideDelaySlider = this._addSlider(
            _('Delay before auto-hiding (ms)'),
            this.settings.hideDelay || 2000,
            0,
            5000,
            100
        );
        
        this.hoverPixelsSlider = this._addSlider(
            _('Height of trigger zone to show panel (px)'),
            this.settings.hoverPixels || 8,
            1,
            100,
            1
        );
        
        this._addHeader(_('Auto-hide Indicator'));
        
        this.showIndicatorSwitch = this._addSwitch(
            _('Show indicator of dock location in trigger zone'),
            this.settings.showIndicator || false
        );
        
        this.indicatorColorButton = this._addColorButton(
            _('Indicator color'),
            this.settings.indicatorColor || 'rgba(30, 30, 30, 1.0)'
        );
        
        let self = this;
        
        this.hideOnFullscreenSwitch.connect('clicked', function() {
            if (self.hideOnFullscreenSwitch.checked) {
                self.autoHideSwitch.checked = false;
                self.autoHideSwitch.set_style('width: 50px; height: 30px; background-color: #666666; border-radius: 15px;');
                
                self.showOnNoFocusSwitch.checked = false;
                self.showOnNoFocusSwitch.set_style('width: 50px; height: 30px; background-color: #666666; border-radius: 15px;');
            }
        });
        
        this.showOnNoFocusSwitch.connect('clicked', function() {
            if (self.showOnNoFocusSwitch.checked) {
                self.autoHideSwitch.checked = true;
                self.autoHideSwitch.set_style('width: 50px; height: 30px; background-color: #4a90d9; border-radius: 15px;');
                
                self.hideOnFullscreenSwitch.checked = false;
                self.hideOnFullscreenSwitch.set_style('width: 50px; height: 30px; background-color: #666666; border-radius: 15px;');
            }
        });
        
        this.autoHideSwitch.connect('clicked', function() {
            if (self.autoHideSwitch.checked) {
                self.hideOnFullscreenSwitch.checked = false;
                self.hideOnFullscreenSwitch.set_style('width: 50px; height: 30px; background-color: #666666; border-radius: 15px;');
            } else {
                self.showOnNoFocusSwitch.checked = false;
                self.showOnNoFocusSwitch.set_style('width: 50px; height: 30px; background-color: #666666; border-radius: 15px;');
            }
        });
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
            minWidth: this.minWidthSlider._value,
            hideOnFullscreen: this.hideOnFullscreenSwitch.checked
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
    try {
        globalSettings = new Settings.ExtensionSettings(this, "centered-cinnamon-dock@mostlynick3");
        
        isInEditMode = global.settings.get_boolean("panel-edit-mode");
    } catch(e) {
        return;
    }
    
    editModeSignal = global.settings.connect("changed::panel-edit-mode", function() {
        let newEditMode = global.settings.get_boolean("panel-edit-mode");
        if (newEditMode !== isInEditMode) {
            isInEditMode = newEditMode;
            handleEditModeChange();
        }
    });
    
    displayStateSignal = Main.layoutManager.connect('monitors-changed', function() {
        if (isInEditMode) return;
        
        try {
            Main.panelManager.panels.forEach(panel => {
                if (!shouldApplyToPanel(panel)) return;
                if (!panel || !panel.actor) return;
                
                let state = panelStates[panel.panelId];
                if (state) {
                    state.isHidden = false;
                    state.isHiding = false;
                    state.isShowing = false;
                }
                panel.actor.show();
                panel.actor.opacity = 255;
                panel.actor.set_scale(1.0, 1.0);
            });
            
            disableAutoHide();
            
            Mainloop.timeout_add(200, function() {
                Main.panelManager.panels.forEach(panel => {
                    if (!shouldApplyToPanel(panel)) return;
                    if (!panel || !panel.actor) return;
                    
                    checkAndApplyStyle(panel, true);
                });
                toggleAutoHide();
                return false;
            });
        } catch(e) {}
    });
    
    panelAddedSignal = Main.panelManager.connect('panel-added', function(manager, panel) {
        try {
            addPanelMenuItem(panel);
            if (shouldApplyToPanel(panel)) {
                initPanel(panel);
            }
        } catch(e) {}
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
    try {
        let allSettings = globalSettings.getValue("panel-settings");
        
        if (allSettings[panelId]) {
            return allSettings[panelId];
        }
    } catch(e) {
    }
    
    return {
        enabled: false,
        transparency: 85,
        heightOffset: -8,
        autoHide: false,
        hoverPixels: 8,
        noWindowShift: true,
        animationTime: 500,
        showOnNoFocus: false,
        zoomFactor: 1.3,
        zoomEnabled: true,
        indicatorColor: "rgba(30, 30, 30, 1.0)",
        showIndicator: true,
        hideDelay: 2000,
        minWidth: 50,
        hideOnFullscreen: true
    };
}

function hasMaximizedOrFullscreenWindow(panel) {
    try {
        let monitor = Main.layoutManager.findMonitorForActor(panel.actor);
        if (!monitor) return false;
        
        let workspace = global.screen.get_active_workspace();
        let windows = workspace.list_windows();
        
        for (let i = 0; i < windows.length; i++) {
            let win = windows[i];
            
            if (win.window_type !== Meta.WindowType.NORMAL) continue;
            
            if (win.minimized) continue;
            
            let winMonitor = win.get_monitor();
            let monitorIndex = Main.layoutManager.monitors.indexOf(monitor);
            if (winMonitor !== monitorIndex) continue;
            
            if (win.is_fullscreen()) {
                return true;
            }
            
            if (win.maximized_horizontally && win.maximized_vertically) {
                return true;
            }
        }
        
        return false;
    } catch(e) {
        return false;
    }
}

function savePanelSettings(panelId, settings) {
    try {
        let allSettings = globalSettings.getValue("panel-settings");
        allSettings[panelId] = settings;
        globalSettings.setValue("panel-settings", allSettings);
    } catch(e) {
    }
}

function addPanelMenuItems() {
    try {
        Main.panelManager.panels.forEach(panel => {
            addPanelMenuItem(panel);
        });
    } catch(e) {}
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
        global.log("Error opening dialog: " + e);
        global.log(e.stack);
    }
}

function enterEditMode() {
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state) return;
        
        try {
            state.savedOpacity = panel.actor.opacity;
            state.wasHidden = state.isHidden;
            
            Tweener.removeTweens(panel.actor);
            panel.actor.set_scale(1.0, 1.0);
            panel.actor.set_style('');
            panel.actor.y = state.originalY;
            panel.actor.x = state.originalX;
            panel.actor.opacity = 255;
            panel.actor.show();
            
            if (Main.layoutManager._chrome && Main.layoutManager._chrome.modifyActorParams) {
                Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: true });
            }
            
            cleanupAppletZoom(panel);
        } catch(e) {}
    });
}

function exitEditMode() {
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state) return;
        
        try {
            state.originalY = panel.actor.y;
            state.originalX = panel.actor.x;
        } catch(e) {}
    });
    
    Mainloop.timeout_add(150, function() {
        Main.panelManager.panels.forEach(panel => {
            if (!shouldApplyToPanel(panel)) return;
            if (!panel || !panel.actor) return;
            
            let state = panelStates[panel.panelId];
            if (!state) return;
            
            try {
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
            } catch(e) {}
        });
        return false;
    });
}

function initializePanels() {
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        if (!panel || !panel.actor) return;
        
        if (!panelStates[panel.panelId]) {
            initPanel(panel);
        }
        
        try {
            panel.actor.show();
            panel.actor.opacity = 255;
        } catch(e) {}
    });
    
    actorAddedSignal = global.stage.connect('actor-added', function(stage, actor) {
        try {
            if (actor.has_style_class_name && actor.has_style_class_name('popup-menu')) {
                Main.panelManager.panels.forEach(panel => {
                    if (!shouldApplyToPanel(panel)) return;
                    if (!panel || !panel.actor) return;
                    
                    let state = panelStates[panel.panelId];
                    if (state) {
                        state.trackedMenus.push(actor);
                        if (!isInEditMode) {
                            updateMenuPosition(panel, actor);
                        }
                    }
                });
            }
        } catch(e) {}
    });
    
    workspaceSignal = global.screen.connect('workspace-switched', function() {
        if (isInEditMode) return;
        
        Main.panelManager.panels.forEach(panel => {
            if (!shouldApplyToPanel(panel)) return;
            if (!panel || !panel.actor) return;
            
            let state = panelStates[panel.panelId];
            if (!state) return;
            
            try {
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
            } catch(e) {}
        });
        
        Mainloop.timeout_add(100, function() {
            Main.panelManager.panels.forEach(panel => {
                if (!shouldApplyToPanel(panel) || !panel || !panel.actor) return;
                let autoHide = getPanelSetting(panel, "autoHide");
                let hideOnFullscreen = getPanelSetting(panel, "hideOnFullscreen");
                if (autoHide || hideOnFullscreen) {
                    if (hideOnFullscreen) {
                        if (hasMaximizedOrFullscreenWindow(panel)) {
                            hidePanel(panel);
                        }
                    } else {
                        hidePanel(panel);
                    }
                }
            });
            return false;
        });
    });

    windowCreatedSignal = global.display.connect('window-created', function(display, win) {
        if (isInEditMode) return;
        
        try {
            let stateChangedId = win.connect('notify::fullscreen', function() {
                if (isInEditMode) return;
                
                Main.panelManager.panels.forEach(panel => {
                    if (!shouldApplyToPanel(panel)) return;
                    if (!panel || !panel.actor) return;
                    
                    let hideOnFullscreen = getPanelSetting(panel, "hideOnFullscreen");
                    if (!hideOnFullscreen) return;
                    
                    let state = panelStates[panel.panelId];
                    if (!state) return;
                    
                    Mainloop.timeout_add(50, function() {
                        let isFullscreen = hasMaximizedOrFullscreenWindow(panel);
                        
                        if (isFullscreen && !state.isHidden) {
                            hidePanel(panel);
                        } else if (!isFullscreen && state.isHidden) {
                            showPanel(panel);
                        }
                        return false;
                    });
                });
            });
            
            windowStateChangedSignals.push({ window: win, signalId: stateChangedId });
            
            win.connect('unmanaged', function() {
                if (isInEditMode) return;
                Main.panelManager.panels.forEach(panel => {
                    if (shouldApplyToPanel(panel) && panel && panel.actor) {
                        checkAndApplyStyle(panel, true);
                        
                        let hideOnFullscreen = getPanelSetting(panel, "hideOnFullscreen");
                        if (hideOnFullscreen) {
                            let state = panelStates[panel.panelId];
                            if (state && state.isHidden) {
                                Mainloop.timeout_add(100, function() {
                                    if (!hasMaximizedOrFullscreenWindow(panel)) {
                                        showPanel(panel);
                                    }
                                    return false;
                                });
                            }
                        }
                    }
                });
            });
            
            Main.panelManager.panels.forEach(panel => {
                if (shouldApplyToPanel(panel) && panel && panel.actor) {
                    checkAndApplyStyle(panel, true);
                }
            });
        } catch(e) {}
    });
    
    try {
        let workspace = global.screen.get_active_workspace();
        let windows = workspace.list_windows();
        windows.forEach(win => {
            try {
                let stateChangedId = win.connect('notify::fullscreen', function() {
                    if (isInEditMode) return;
                    
                    Main.panelManager.panels.forEach(panel => {
                        if (!shouldApplyToPanel(panel)) return;
                        if (!panel || !panel.actor) return;
                        
                        let hideOnFullscreen = getPanelSetting(panel, "hideOnFullscreen");
                        if (!hideOnFullscreen) return;
                        
                        let state = panelStates[panel.panelId];
                        if (!state) return;
                        
                        Mainloop.timeout_add(50, function() {
                            let isFullscreen = hasMaximizedOrFullscreenWindow(panel);
                            
                            if (isFullscreen && !state.isHidden) {
                                hidePanel(panel);
                            } else if (!isFullscreen && state.isHidden) {
                                showPanel(panel);
                            }
                            return false;
                        });
                    });
                });
                
                windowStateChangedSignals.push({ window: win, signalId: stateChangedId });
            } catch(e) {}
        });
    } catch(e) {}
    
    Mainloop.timeout_add(100, function() {
        if (!isInEditMode) {
            Main.panelManager.panels.forEach(panel => {
                if (!shouldApplyToPanel(panel)) return;
                if (!panel || !panel.actor) return;
                
                try {
                    checkAndApplyStyle(panel);
                    setupAppletZoom(panel);
                } catch(e) {}
            });
        }
        startSizeMonitoring();
        toggleAutoHide();
        return false;
    });
}

function getPanelLocation(panel) {
    if (!panel || !panel.actor) return "unknown";
    
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
    if (!panel || !panel.actor) return;
    
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
        previousPadding: 20,
        isEnabled: true,
        marginAnimationTimer: null
    };
    
    let state = panelStates[panel.panelId];
    
    try {
        if (getPanelSetting(panel, "noWindowShift")) {
            Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: false });
        }
    } catch(e) {}
    
    state.allocationId = panel.actor.connect('notify::allocation', function() {
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state || !state.isEnabled) return;
        
        try {
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
        } catch(e) {}
    });
    
    state.styleSignal = panel.actor.connect('style-changed', function() {
        if (isInEditMode) return;
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state || !state.isEnabled || state.isAnimating) return;
        
        Mainloop.timeout_add(10, function() {
            if (!panel || !panel.actor) return false;
            
            let state = panelStates[panel.panelId];
            if (state && state.isEnabled) {
                applyStyle(panel);
            }
            return false;
        });
    });
    
    state.showSignal = panel.actor.connect('show', function() {
        if (isInEditMode) return;
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state || !state.isEnabled) return;
        
        if (state.isHidden && getPanelSetting(panel, "autoHide")) {
            panel.actor.hide();
            state.isHidden = false;
        }
    });
}

function cleanupAllPanels() {
    disableAutoHide();

    Main.panelManager.panels.forEach(panel => {
        let state = panelStates[panel.panelId];
        if (state) {
            state.isEnabled = false;
        }
    });

    if (displayStateSignal) {
        try {
            Main.layoutManager.disconnect(displayStateSignal);
        } catch(e) {}
        displayStateSignal = null;
    }

    if (sizeCheckTimeout) {
        Mainloop.source_remove(sizeCheckTimeout);
        sizeCheckTimeout = null;
    }
    
    if (workspaceSignal) {
        try {
            global.screen.disconnect(workspaceSignal);
        } catch(e) {}
        workspaceSignal = null;
    }
    
    if (actorAddedSignal) {
        try {
            global.stage.disconnect(actorAddedSignal);
        } catch(e) {}
        actorAddedSignal = null;
    }
    
    if (editModeSignal) {
        try {
            global.settings.disconnect(editModeSignal);
        } catch(e) {}
        editModeSignal = null;
    }
    
    if (windowCreatedSignal) {
        try {
            global.display.disconnect(windowCreatedSignal);
        } catch(e) {}
        windowCreatedSignal = null;
    }
    
    windowStateChangedSignals.forEach(item => {
        try {
            if (item.window && item.signalId) {
                item.window.disconnect(item.signalId);
            }
        } catch(e) {}
    });
    windowStateChangedSignals = [];
    
    if (panelAddedSignal) {
        try {
            Main.panelManager.disconnect(panelAddedSignal);
        } catch(e) {}
        panelAddedSignal = null;
    }
    
    Main.panelManager.panels.forEach(panel => {
        if (!panel || !panel.actor) return;
        
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
            
            if (state.marginAnimationTimer) {
                Mainloop.source_remove(state.marginAnimationTimer);
                state.marginAnimationTimer = null;
            }
            
            if (state.styleSignal) {
                try {
                    panel.actor.disconnect(state.styleSignal);
                } catch(e) {}
                state.styleSignal = null;
            }

            if (state.showSignal) {
                try {
                    panel.actor.disconnect(state.showSignal);
                } catch(e) {}
                state.showSignal = null;
            }
            
            if (state.allocateId) {
                try {
                    panel.actor.disconnect(state.allocateId);
                } catch(e) {}
                state.allocateId = null;
            }
            
            if (state.allocationId) {
                try {
                    panel.actor.disconnect(state.allocationId);
                } catch(e) {}
                state.allocationId = null;
            }
            
            cleanupAppletZoom(panel);
            
            try {
                panel.actor.y = state.originalY;
                panel.actor.x = state.originalX;
            } catch(e) {}
        }
        
        try {
            panel.actor.set_scale(1.0, 1.0);
            panel.actor.set_style('');
            panel.actor.opacity = 255;
            panel.actor.show();
            
            if (Main.layoutManager._chrome && Main.layoutManager._chrome.modifyActorParams) {
                Main.layoutManager._chrome.modifyActorParams(panel.actor, { affectsStruts: true });
            }
        } catch(e) {}
    });
    
    removePanelMenuItems();
    
    panelStates = {};
}

function setupAppletZoom(panel) {
    if (isInEditMode) return;
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    cleanupAppletZoom(panel);
    
    if (!getPanelSetting(panel, "zoomEnabled")) return;
    
    try {
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
    } catch(e) {
        cleanupAppletZoom(panel);
    }
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
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    if (typeof state.zoomEnterId === 'number') {
        try {
            panel.actor.disconnect(state.zoomEnterId);
        } catch(e) {}
        state.zoomEnterId = null;
    }
    
    if (typeof state.zoomLeaveId === 'number') {
        try {
            panel.actor.disconnect(state.zoomLeaveId);
        } catch(e) {}
        state.zoomLeaveId = null;
    }
}

function zoomApplet(panel, actor, zoomIn) {
    if (isInEditMode) return;
    if (!actor) return;
    
    try {
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
    } catch(e) {}
}

function resetAllAppletZoom(panel) {
    if (!panel) return;
    if (!panel._leftBox || !panel._centerBox || !panel._rightBox) return;
    
    let boxes = [panel._leftBox, panel._centerBox, panel._rightBox];
    
    boxes.forEach(box => {
        try {
            let children = box.get_children();
            children.forEach(child => {
                try {
                    Tweener.removeTweens(child);
                    child.set_pivot_point(0.5, 0.5);
                    child.set_scale(1.0, 1.0);
                } catch(e) {}
            });
        } catch(e) {}
    });
}

function applyZoomToActor(actor, scale) {
    if (!actor) return;
    
    try {
        Tweener.removeTweens(actor);
        
        actor.set_pivot_point(0.5, 0.5);
        
        Tweener.addTween(actor, {
            scale_x: scale,
            scale_y: scale,
            time: 0.1,
            transition: 'easeOutQuad'
        });
    } catch(e) {}
}

function cleanupTrackedMenus(panel) {
    if (!panel) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    try {
        state.trackedMenus = state.trackedMenus.filter(menu => {
            try {
                return menu && !menu.is_finalized();
            } catch(e) {
                return false;
            }
        });
    } catch(e) {
        state.trackedMenus = [];
    }
}

function hasActiveMenus(panel) {
    if (!panel) return false;
    
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
        try {
            for (let i = 0; i < panel._menus._menus.length; i++) {
                let menu = panel._menus._menus[i];
                if (menu.menu && menu.menu.isOpen) {
                    return true;
                }
            }
        } catch(e) {}
    }
    
    if (panel._leftBox && panel._centerBox && panel._rightBox) {
        try {
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
        } catch(e) {}
    }
    
    return false;
}

function isMouseOverDockOrMenus(panel) {
    if (!panel || !panel.actor) return false;
    
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
                        try {
                            if (panel.actor.contains(sourceActor)) {
                                return true;
                            }
                        } catch(e) {
                            return false;
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
    if (!panel || !panel.actor) return false;
    
    let state = panelStates[panel.panelId];
    if (!state) return false;
    
    let monitor = getMonitorGeometry(panel);
    let hoverPixels = getPanelSetting(panel, "hoverPixels");
    let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
    
    if (state.location === "bottom" || state.location === "top") {
        let maxAllowedWidth = monitor.width - 40;
        let triggerWidth = Math.max(state.lastWidth || 200, minPanelWidth);
        triggerWidth = Math.min(triggerWidth, maxAllowedWidth);
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
        let usableHeight = monitor.height;
        Main.panelManager.panels.forEach(otherPanel => {
            if (otherPanel === panel) return;
            if (!otherPanel || !otherPanel.actor) return;
            
            let otherLocation = getPanelLocation(otherPanel);
            let otherMonitor = Main.layoutManager.findMonitorForActor(otherPanel.actor);
            let thisMonitor = Main.layoutManager.findMonitorForActor(panel.actor);
            if (!otherMonitor || !thisMonitor || otherMonitor !== thisMonitor) return;
            
            if (otherLocation === "top") {
                usableHeight -= otherPanel.actor.height;
            } else if (otherLocation === "bottom") {
                usableHeight -= otherPanel.actor.height;
            }
        });
        
        let minPanelHeight = minPanelWidth;
        let actualHeight = state.lastHeight || 200;
        let triggerHeight = Math.max(actualHeight, minPanelHeight);
        let maxAllowedHeight = usableHeight - 40;
        triggerHeight = Math.min(triggerHeight, maxAllowedHeight);
        triggerHeight = Math.max(triggerHeight, 50);
        
        let panelTop = monitor.y + (monitor.height - triggerHeight) / 2;
        let panelBottom = panelTop + triggerHeight;
        
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
        if (shouldApplyToPanel(panel)) {
            let autoHide = getPanelSetting(panel, "autoHide");
            let hideOnFullscreen = getPanelSetting(panel, "hideOnFullscreen");
            if (autoHide || hideOnFullscreen) {
                anyAutoHide = true;
            }
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

function getUsableHeight(panel) {
    let monitor = getMonitorGeometry(panel);
    let usableHeight = monitor.height;
    let usableTopOffset = 0;
    
    Main.panelManager.panels.forEach(otherPanel => {
        if (otherPanel === panel) return;
        if (!otherPanel || !otherPanel.actor) return;
        
        let otherLocation = getPanelLocation(otherPanel);
        let otherMonitor = Main.layoutManager.findMonitorForActor(otherPanel.actor);
        let thisMonitor = Main.layoutManager.findMonitorForActor(panel.actor);
        if (!otherMonitor || !thisMonitor || otherMonitor !== thisMonitor) return;
        
        if (otherLocation === "top") {
            usableTopOffset = otherPanel.actor.height;
            usableHeight -= otherPanel.actor.height;
        } else if (otherLocation === "bottom") {
            usableHeight -= otherPanel.actor.height;
        }
    });
    
    return { usableHeight: usableHeight, usableTopOffset: usableTopOffset };
}

function enableAutoHide(indicatorStatus) {
    disableAutoHide(indicatorStatus);
    
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state) return;
        
        state.hideDelayTimeout = null;
        state.isEnabled = true;
    });
    
    pointerWatcher = Mainloop.timeout_add(100, function() {
        if (isInEditMode) return true;
        
        let hasActivePanels = false;
        Main.panelManager.panels.forEach(panel => {
            let state = panelStates[panel.panelId];
            if (state && state.isEnabled) {
                hasActivePanels = true;
            }
        });
        
        if (!hasActivePanels) {
            pointerWatcher = null;
            return false;
        }
        
        let [x, y, mods] = global.get_pointer();
        
        Main.panelManager.panels.forEach(panel => {
            if (!shouldApplyToPanel(panel)) return;
            
            let autoHide = getPanelSetting(panel, "autoHide");
            let hideOnFullscreen = getPanelSetting(panel, "hideOnFullscreen");
            
            if (!autoHide && !hideOnFullscreen) return;
            if (!panel || !panel.actor) return;
            
            let state = panelStates[panel.panelId];
            if (!state || !state.isEnabled) return;
            
            try {
                if (state.isHidden && !state.isShowing && !state.isHiding) {
                    if (!panel._leftBox || !panel._centerBox || !panel._rightBox) return;
                    
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
                        let newWidth = Math.max(contentWidth + (panelPadding * 2), 50);
                        
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
                let shouldShow = false;
                
                if (hideOnFullscreen) {
                    let isFullscreen = hasMaximizedOrFullscreenWindow(panel);
                    
                    if (isFullscreen) {
                        shouldShow = menusActive || mouseOverTriggerZone;
                    } else {
                        shouldShow = true;
                    }
                } else if (autoHide) {
                    let focusWindow = global.display.focus_window;
                    let hasNormalWindow = focusWindow && focusWindow.window_type === Meta.WindowType.NORMAL;
                    let showOnNoFocus = getPanelSetting(panel, "showOnNoFocus");
                    let shouldShowOnNoFocus = !hasNormalWindow && showOnNoFocus;
                    
                    shouldShow = menusActive || mouseOverTriggerZone || shouldShowOnNoFocus;
                }
                
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
                            let state = panelStates[panel.panelId];
                            if (state && state.isEnabled) {
                                hidePanel(panel);
                            }
                            state.hideDelayTimeout = null;
                            return false;
                        });
                    }
                } else if (shouldShow && !state.isHidden && state.hideDelayTimeout) {
                    Mainloop.source_remove(state.hideDelayTimeout);
                    state.hideDelayTimeout = null;
                }
            } catch(e) {}
        });
        
        return true;
    });
}

function createIndicator(panel) {
    if (!panel || !panel.actor) return;
    
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
    
    try {
        if (state.location === "bottom" || state.location === "top") {
            let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
            let maxAllowedWidth = monitor.width - 40;
            let effectiveWidth = Math.max(state.lastWidth || 200, minPanelWidth);
            effectiveWidth = Math.min(effectiveWidth, maxAllowedWidth);
            indicatorWidth = effectiveWidth;
            indicatorHeight = hoverPixels;
            indicatorX = monitor.x + (monitor.width - indicatorWidth) / 2;
            
            if (state.location === "bottom") {
                indicatorY = monitor.y + monitor.height - hoverPixels;
            } else {
                indicatorY = monitor.y;
            }
        } else if (state.location === "left" || state.location === "right") {
            indicatorWidth = hoverPixels;
            
            let { usableHeight, usableTopOffset } = getUsableHeight(panel);
            
            let minPanelHeight = getPanelSetting(panel, "minWidth") || 0;
            let actualHeight = state.lastHeight || 200;
            let effectiveHeight = Math.max(actualHeight, minPanelHeight);
            let maxAllowedHeight = usableHeight - 40;
            effectiveHeight = Math.min(effectiveHeight, maxAllowedHeight);
            effectiveHeight = Math.max(effectiveHeight, 50);
            indicatorHeight = effectiveHeight;
            indicatorY = monitor.y + usableTopOffset + (usableHeight - indicatorHeight) / 2;
            
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
    } catch(e) {
        if (indicator) {
            try {
                indicator.destroy();
            } catch(e2) {}
        }
    }
}

function updateIndicator(panel) {
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state || !state.indicator) return;
    
    try {
        let monitor = getMonitorGeometry(panel);
        let hoverPixels = getPanelSetting(panel, "hoverPixels");
        let transparency = getPanelSetting(panel, "transparency") / 100.0;
        let indicatorColor = getPanelSetting(panel, "indicatorColor");
        
        let indicatorWidth, indicatorHeight, indicatorX, indicatorY;
        
        if (state.location === "bottom" || state.location === "top") {
            let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
            let maxAllowedWidth = monitor.width - 40;
            let effectiveWidth = Math.max(state.lastWidth || 200, minPanelWidth);
            effectiveWidth = Math.min(effectiveWidth, maxAllowedWidth);
            indicatorWidth = effectiveWidth;
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
                    if (!state || !state.indicator) return;
                    try {
                        let currentWidth = state.indicator.width;
                        let newX = monitor.x + (monitor.width - currentWidth) / 2;
                        state.indicator.x = newX;
                    } catch(e) {}
                }
            });
        } else if (state.location === "left" || state.location === "right") {
            indicatorWidth = hoverPixels;
            
            let { usableHeight, usableTopOffset } = getUsableHeight(panel);
            
            let minPanelHeight = getPanelSetting(panel, "minWidth") || 0;
            let actualHeight = state.lastHeight || 200;
            let effectiveHeight = Math.max(actualHeight, minPanelHeight);
            let maxAllowedHeight = usableHeight - 40;
            effectiveHeight = Math.min(effectiveHeight, maxAllowedHeight);
            effectiveHeight = Math.max(effectiveHeight, 50);
            indicatorHeight = effectiveHeight;
            indicatorY = monitor.y + usableTopOffset + (usableHeight - indicatorHeight) / 2;
            
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
                    if (!state || !state.indicator) return;
                    try {
                        let currentHeight = state.indicator.height;
                        let newY = monitor.y + usableTopOffset + (usableHeight - currentHeight) / 2;
                        state.indicator.y = newY;
                    } catch(e) {}
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
    } catch(e) {}
}

function destroyIndicator(panel) {
    let state = panelStates[panel.panelId];
    if (!state || !state.indicator) return;
    
    try {
        Tweener.removeTweens(state.indicator);
        Main.layoutManager.removeChrome(state.indicator);
        state.indicator.destroy();
    } catch(e) {}
    
    state.indicator = null;
}

function showPanel(panel) {
    if (isInEditMode) return;
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state || !state.isEnabled) return;
    
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
                let state = panelStates[panel.panelId];
                if (!state || !state.isEnabled) return false;
                if (!panel || !panel.actor) return false;
                
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / animTime, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                try {
                    panel.actor.opacity = startOpacity + (255 - startOpacity) * eased;
                    if (state.indicator) {
                        state.indicator.opacity = indicatorStartOpacity + (0 - indicatorStartOpacity) * eased;
                        state.indicator.y = indicatorStartY + (panelCenterPos - indicatorStartY) * eased;
                    }
                } catch(e) {
                    state.animationTimer = null;
                    state.isShowing = false;
                    return false;
                }
                
                if (progress >= 1.0) {
                    try {
                        panel.actor.opacity = 255;
                        if (state.indicator) {
                            state.indicator.opacity = 0;
                            state.indicator.y = panelCenterPos;
                        }
                    } catch(e) {}
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
                let state = panelStates[panel.panelId];
                if (!state || !state.isEnabled) return false;
                if (!panel || !panel.actor) return false;
                
                let elapsed = Date.now() - startTime;
                let progress = Math.min(elapsed / animTime, 1.0);
                let eased = 1 - Math.pow(1 - progress, 3);
                
                try {
                    panel.actor.opacity = startOpacity + (255 - startOpacity) * eased;
                    if (state.indicator) {
                        state.indicator.opacity = indicatorStartOpacity + (0 - indicatorStartOpacity) * eased;
                        state.indicator.x = indicatorStartX + (panelCenterPos - indicatorStartX) * eased;
                    }
                } catch(e) {
                    state.animationTimer = null;
                    state.isShowing = false;
                    return false;
                }
                
                if (progress >= 1.0) {
                    try {
                        panel.actor.opacity = 255;
                        if (state.indicator) {
                            state.indicator.opacity = 0;
                            state.indicator.x = panelCenterPos;
                        }
                    } catch(e) {}
                    state.animationTimer = null;
                    state.isShowing = false;
                    return false;
                }
                return true;
            });
        }
    } else {
        state.animationTimer = Mainloop.timeout_add(16, function() {
            let state = panelStates[panel.panelId];
            if (!state || !state.isEnabled) return false;
            if (!panel || !panel.actor) return false;
            
            let elapsed = Date.now() - startTime;
            let progress = Math.min(elapsed / animTime, 1.0);
            let eased = 1 - Math.pow(1 - progress, 3);
            
            try {
                panel.actor.opacity = startOpacity + (255 - startOpacity) * eased;
            } catch(e) {
                state.animationTimer = null;
                state.isShowing = false;
                return false;
            }
            
            if (progress >= 1.0) {
                try {
                    panel.actor.opacity = 255;
                } catch(e) {}
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
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state || !state.isEnabled) return;
    
    if (state.isHidden || state.isHiding) return;
    
    if (hasActiveMenus(panel)) {
        return;
    }
    
    function hideTooltips(actor) {
        try {
            if (actor.toString().includes('StLabel "Tooltip"') && actor.visible) {
                actor.hide();
            }
            if (actor.get_children) {
                actor.get_children().forEach(child => hideTooltips(child));
            }
        } catch(e) {}
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
    
    try {
        if (!panel._leftBox || !panel._centerBox || !panel._rightBox) return;
        
        if (state.location === "bottom" || state.location === "top") {
            let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
            let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
            let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
            let contentWidth = leftWidth + centerWidth + rightWidth;
            let panelPadding = 20;
            state.lastWidth = Math.max(contentWidth + (panelPadding * 2), 50);
        } else if (state.location === "left" || state.location === "right") {
            let [minHeight, leftHeight] = panel._leftBox.get_preferred_height(-1);
            let [minHeight2, centerHeight] = panel._centerBox.get_preferred_height(-1);
            let [minHeight3, rightHeight] = panel._rightBox.get_preferred_height(-1);
            let contentHeight = Math.max(leftHeight, centerHeight, rightHeight);
            let panelPadding = 20;
            state.lastHeight = Math.max(contentHeight + (panelPadding * 2), 40);
        }
    } catch(e) {
        state.isHiding = false;
        return;
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
                if (state.indicator) {
                    state.indicator.opacity = 0;
                    state.indicator.y = panelCenterPos;
                }
            } else {
                updateIndicator(panel);
                state.indicator.opacity = 0;
                state.indicator.y = panelCenterPos;
            }
            
            let indicatorStartY = state.indicator ? state.indicator.y : panelCenterPos;
            let indicatorStartOpacity = state.indicator ? state.indicator.opacity : 0;
            
            state.animationTimer = Mainloop.timeout_add(16, function() {
                let state = panelStates[panel.panelId];
                if (!state || !state.isEnabled) return false;
                if (!panel || !panel.actor) return false;
                
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
                
                try {
                    panel.actor.opacity = startOpacity + (0 - startOpacity) * eased;
                    if (state.indicator) {
                        state.indicator.opacity = indicatorStartOpacity + (255 - indicatorStartOpacity) * eased;
                        state.indicator.y = indicatorStartY + (state.indicatorOriginalY - indicatorStartY) * eased;
                    }
                } catch(e) {
                    state.animationTimer = null;
                    state.isHiding = false;
                    return false;
                }
                
                if (progress >= 1.0) {
                    try {
                        panel.actor.opacity = 0;
                        if (state.indicator) {
                            state.indicator.opacity = 255;
                            state.indicator.y = state.indicatorOriginalY;
                        }
                        state.isHidden = true;
                        state.isHiding = false;
                        if (!hasActiveMenus(panel)) {
                            panel.actor.set_scale(0.0, 0.0);
                        } else {
                            state.isHidden = false;
                            showPanel(panel);
                        }
                    } catch(e) {}
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
                if (state.indicator) {
                    state.indicator.opacity = 0;
                    state.indicator.x = panelCenterPos;
                }
            } else {
                updateIndicator(panel);
                state.indicator.opacity = 0;
                state.indicator.x = panelCenterPos;
            }
            
            let indicatorStartX = state.indicator ? state.indicator.x : panelCenterPos;
            let indicatorStartOpacity = state.indicator ? state.indicator.opacity : 0;
            
            state.animationTimer = Mainloop.timeout_add(16, function() {
                let state = panelStates[panel.panelId];
                if (!state || !state.isEnabled) return false;
                if (!panel || !panel.actor) return false;
                
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
                
                try {
                    panel.actor.opacity = startOpacity + (0 - startOpacity) * eased;
                    if (state.indicator) {
                        state.indicator.opacity = indicatorStartOpacity + (255 - indicatorStartOpacity) * eased;
                        state.indicator.x = indicatorStartX + (state.indicatorOriginalX - indicatorStartX) * eased;
                    }
                } catch(e) {
                    state.animationTimer = null;
                    state.isHiding = false;
                    return false;
                }
                
                if (progress >= 1.0) {
                    try {
                        panel.actor.opacity = 0;
                        if (state.indicator) {
                            state.indicator.opacity = 255;
                            state.indicator.x = state.indicatorOriginalX;
                        }
                        state.isHidden = true;
                        state.isHiding = false;
                        if (!hasActiveMenus(panel)) {
                            panel.actor.set_scale(0.0, 0.0);
                        } else {
                            state.isHidden = false;
                            showPanel(panel);
                        }
                    } catch(e) {}
                    state.animationTimer = null;
                    return false;
                }
                return true;
            });
        }
    } else {
        state.animationTimer = Mainloop.timeout_add(16, function() {
            let state = panelStates[panel.panelId];
            if (!state || !state.isEnabled) return false;
            if (!panel || !panel.actor) return false;
            
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
            
            try {
                panel.actor.opacity = startOpacity + (0 - startOpacity) * eased;
            } catch(e) {
                state.animationTimer = null;
                state.isHiding = false;
                return false;
            }
            
            if (progress >= 1.0) {
                try {
                    panel.actor.opacity = 0;
                    state.isHidden = true;
                    state.isHiding = false;
                    if (!hasActiveMenus(panel)) {
                        panel.actor.set_scale(0.0, 0.0);
                    } else {
                        state.isHidden = false;
                        showPanel(panel);
                    }
                } catch(e) {}
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
    
    Main.panelManager.panels.forEach(panel => {
        let state = panelStates[panel.panelId];
        if (state) {
            state.isEnabled = false;
            
            if (state.hideDelayTimeout) {
                Mainloop.source_remove(state.hideDelayTimeout);
                state.hideDelayTimeout = null;
            }
            
            if (state.animationTimer) {
                Mainloop.source_remove(state.animationTimer);
                state.animationTimer = null;
            }
            
            if (state.marginAnimationTimer) {
                Mainloop.source_remove(state.marginAnimationTimer);
                state.marginAnimationTimer = null;
            }
            
            Tweener.removeTweens(panel.actor);
            
            if (indicatorStatus !== "keepIndicators") {
                destroyIndicator(panel);
                panel.actor.opacity = 255;
                panel.actor.show();
                state.isHidden = false;
            }
        }
    });
}

function updateMenuPositions() {
    if (isInEditMode) return;
    
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        if (!panel || !panel.actor) return;
        
        let state = panelStates[panel.panelId];
        if (!state) return;
        
        cleanupTrackedMenus(panel);
        
        try {
            state.trackedMenus.forEach(menu => {
                updateMenuPosition(panel, menu);
            });
        } catch(e) {}
    });
}

function updateMenuPosition(panel, menu) {
    if (isInEditMode || isTransitioningWorkspace) return true;
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state) return;
    
    let heightOffset = getPanelSetting(panel, "heightOffset");
    let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
    
    Mainloop.timeout_add(1, function() {
        try {
            if (menu && !menu.is_finalized()) {
                menu.y = menu.y + adjustedOffset;
            }
        } catch(e) {}
        return false;
    });
}

function startSizeMonitoring() {
    sizeCheckTimeout = Mainloop.timeout_add(500, function() {
        if (isInEditMode || isTransitioningWorkspace) return true;
        
        Main.panelManager.panels.forEach(panel => {
            if (!shouldApplyToPanel(panel)) return;
            if (!panel || !panel.actor) return;
            
            let state = panelStates[panel.panelId];
            if (!state || !state.isEnabled) return;
            
            try {
                if (!state.isHidden && (panel.actor.scale_x === 0.0 || panel.actor.scale_y === 0.0)) {
                    showPanel(panel);
                }
                
                if (!state.isHidden) {
                    checkAndApplyStyle(panel, true);
                }
            } catch(e) {}
        });
        return true;
    });
}

function checkAndApplyStyle(panel, forceApply) {
    if (isInEditMode && !forceApply) return;
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state || !state.isEnabled) return;
    
    if (!forceApply && (panel._editMode || (panel.peekDesktop && panel.peekDesktop._editMode))) {
        return;
    }
    
    if (!panel._leftBox || !panel._centerBox || !panel._rightBox) return;
    
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
    
    try {
        if (state.location === "bottom" || state.location === "top") {
            let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
            let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
            let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
            
            let contentWidth = leftWidth + centerWidth + rightWidth;
            let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
            newWidth = Math.max(contentWidth + (panelPadding * 2), minPanelWidth, 50);
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
    } catch(e) {
        return;
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
    if (!panel || !panel.actor) return;
    
    let state = panelStates[panel.panelId];
    if (!state || !state.isEnabled) return;
    
    let transparency = getPanelSetting(panel, "transparency") / 100.0;
    let heightOffset = getPanelSetting(panel, "heightOffset");
    let monitor = getMonitorGeometry(panel);
    
    let savedOpacity = state.isHidden ? 0 : panel.actor.opacity;
    
    let panelPadding = 20;
    
    try {
        if (state.location === "bottom" || state.location === "top") {
            if (!panel._leftBox || !panel._centerBox || !panel._rightBox) return;
            
            let adjustedOffset = state.location === "top" ? -heightOffset : heightOffset;
            
            let [minWidth, leftWidth] = panel._leftBox.get_preferred_width(-1);
            let [minWidth2, centerWidth] = panel._centerBox.get_preferred_width(-1);
            let [minWidth3, rightWidth] = panel._rightBox.get_preferred_width(-1);
            let contentWidth = leftWidth + centerWidth + rightWidth;
            
            let minPanelWidth = getPanelSetting(panel, "minWidth") || 0;
            let actualContentWidth = contentWidth + (panelPadding * 2);
            
            let maxAllowedWidth = monitor.width - 40;
            let desiredWidth = Math.max(actualContentWidth, minPanelWidth);
            desiredWidth = Math.min(desiredWidth, maxAllowedWidth);
            
            let extraPadding = 0;
            if (minPanelWidth > actualContentWidth && minPanelWidth <= maxAllowedWidth) {
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
                    let state = panelStates[panel.panelId];
                    if (!state || !state.isEnabled) return false;
                    if (!panel || !panel.actor) return false;
                    
                    let elapsed = Date.now() - startTime;
                    let progress = Math.min(elapsed / duration, 1.0);
                    let eased = 1 - Math.pow(1 - progress, 3);
                    
                    let currentMargin = startMargin + (endMargin - startMargin) * eased;
                    let currentPadding = Math.floor(startPadding + (endPadding - startPadding) * eased);
                    
                    try {
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
                    } catch(e) {
                        state.marginAnimationTimer = null;
                        state.isAnimating = false;
                        return false;
                    }
                    
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
            
            let { usableHeight, usableTopOffset } = getUsableHeight(panel);
            
            let minPanelHeight = getPanelSetting(panel, "minWidth") || 0;
            let actualHeight = state.lastHeight || 200;
            let desiredHeight = Math.max(actualHeight, minPanelHeight);
            
            let maxAllowedHeight = usableHeight - 40;
            desiredHeight = Math.min(desiredHeight, maxAllowedHeight);
            desiredHeight = Math.max(desiredHeight, 50);
            
            let desiredMargin = (usableHeight - desiredHeight) / 2;
            
            let sizeDiff = Math.abs(state.previousHeight - desiredHeight);
            
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
                    let state = panelStates[panel.panelId];
                    if (!state || !state.isEnabled) return false;
                    if (!panel || !panel.actor) return false;
                    
                    let elapsed = Date.now() - startTime;
                    let progress = Math.min(elapsed / duration, 1.0);
                    let eased = 1 - Math.pow(1 - progress, 3);
                    
                    let currentMargin = startMargin + (endMargin - startMargin) * eased;
                    
                    try {
                        panel.actor.set_style(
                            'border-radius: 12px;' +
                            'padding: ' + panelPadding + 'px 0px;' +
                            'margin-top: ' + currentMargin + 'px;' +
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
                    } catch(e) {
                        state.marginAnimationTimer = null;
                        state.isAnimating = false;
                        return false;
                    }
                    
                    if (progress >= 1.0) {
                        state.marginAnimationTimer = null;
                        state.previousHeight = desiredHeight;
                        state.isAnimating = false;
                        return false;
                    }
                    return true;
                });
            } else {
                panel.actor.set_style(
                    'border-radius: 12px;' +
                    'padding: ' + panelPadding + 'px 0px;' +
                    'margin-top: ' + desiredMargin + 'px;' +
                    'margin-bottom: ' + desiredMargin + 'px;' +
                    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);' +
                    'opacity: ' + transparency + ';'
                );
                panel.actor.opacity = savedOpacity;
                state.previousHeight = desiredHeight;
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
    } catch(e) {}
}

function applyStyleToAll() {
    if (isInEditMode) return;
    
    Main.panelManager.panels.forEach(panel => {
        if (!shouldApplyToPanel(panel)) return;
        if (!panel || !panel.actor) return;
        
        try {
            applyStyle(panel);
        } catch(e) {}
    });
}

function disable() {
    cleanupAllPanels();
    if (globalSettings) {
        globalSettings.finalize();
        globalSettings = null;
    }
}