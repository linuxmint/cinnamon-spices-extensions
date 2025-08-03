// === IMPORTS & CONSTANTS ===
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const Layout = imports.ui.layout;
const Gio = imports.gi.Gio;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gdk = imports.gi.Gdk;
const Cairo = imports.cairo;
const GLib = imports.gi.GLib;
const ModalDialog = imports.ui.modalDialog;
const { GObject } = imports.gi;

const { _ } = require('./translation');
const { getTransitionManager } = require('./transitionEffects');

const ICONS_PATH = __meta.path + '/icons/';
const scriptPath = __meta.path + '/lib/gtk-filechooser.py';

const BTN_TOOLBAR = 40;
const BTN_CLOSE = 44;

// Blur performance constants - DO NOT MODIFY: critical for performance
const MAX_BLUR_AREA_PIXELS = 35000;        // Max area to prevent lag
const MAX_BLUR_PIXELS_PER_ZONE = 900;      // Max pixels per blur zone
const MAX_CACHE_TOTAL_PIXELS = 20000;      // Max total pixels in cache
const MOSAIC_INTENSITY_MIN = 0.15;         // Minimum mosaic effect
const MOSAIC_INTENSITY_RANGE = 0.25;       // Mosaic intensity range
const MOSAIC_BLEND_FACTOR = 0.8;           // Color preservation factor

function getPicturesDir() {
    return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)
        || GLib.get_home_dir() + '/Pictures';
}

// === MAIN EDIT DIALOG CLASS: INITIALIZATION & UI SETUP ===
var ScreenshotEditDialog;
if (typeof ScreenshotEditDialog !== 'function') {
    ScreenshotEditDialog = GObject.registerClass({
        GTypeName: `ScreenshotEditDialog_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    }, class ScreenshotEditDialog extends ModalDialog.ModalDialog {
        _init(filepath, onClose, state = null, preview = null, showBackButton = false, onOptionSelected = null) {
            super._init({ styleClass: 'edit-modal', destroyOnClose: true, cinnamonReactive: false });
            this._scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;

            // Override the monitor constraint to use full screen instead of work area
            this._monitorConstraint = new Layout.MonitorConstraint({ work_area: false });

            this._filepath = filepath;
            this._onClose = onClose;
            this._preview = preview;
            this._editState = state;
            this._showBackButton = showBackButton || false;
            this._onOptionSelected = onOptionSelected;
                
            // Restore state if provided
            this._paths = state && state.paths ? JSON.parse(JSON.stringify(state.paths)) : [];
            this._color = state && state.color ? state.color : [0,0,0];
            this._thickness = state && state.thickness ? state.thickness : 5;
            this._currentTool = state && state.currentTool ? state.currentTool : 'brush';
            
            // Cache for blur zones to avoid recalculation
            this._blurCache = new Map();
            
            // Transition manager
            this._transitionManager = getTransitionManager();
            
            // Modal size
            this.set_width(global.stage.width);
            this.set_height(global.stage.height);

            // Init toolbar
            this._initToolbarButtons();

            // Sync toolbar visual state
            this._setTool(this._currentTool);
            this._setThickness(this._thickness);
            this._setColor(this._color);
            this._attachTooltips();
            this._saveDialog = null;
            this._updateActionBtnStates();

            // Widgets: dynamic container size based on screen
            const boxW = Math.round(global.stage.width * 0.8);
            const boxH = Math.round(global.stage.height * 0.8);
            this._superposeBox = new St.Widget({
                style_class: 'edit-superpose-box',
                width: boxW,
                height: boxH,
                layout_manager: new Clutter.BinLayout()
            });
            this._superposeBox.set_position(
                Math.round((global.stage.width - boxW) / 2),
                Math.round((global.stage.height - boxH) / 2)
            );

            this._mainOverlay = new St.Widget({
                width: global.stage.width,
                height: global.stage.height,
                layout_manager: new Clutter.BinLayout()
            });
            this._mainOverlay.add_child(this._toolbar);
            this._mainOverlay.add_child(this._superposeBox);
            this._mainOverlay.add_child(this._closeBox);
            this.contentLayout.add_child(this._mainOverlay);

            this._tooltip = new St.Label({
                style_class: 'global-tooltip',
                text: '',
                visible: false
            });
            global.stage.add_child(this._tooltip);
            this._tooltipTimeoutId = null;

            // === IMAGE LOADING & CANVAS SETUP ===
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                let imgWidth = 400, imgHeight = 300;
                let pixbuf = null;
                try {
                    pixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
                    imgWidth = pixbuf.get_width();
                    imgHeight = pixbuf.get_height();
                    const maxDim = 4096;
                    if (imgWidth > maxDim || imgHeight > maxDim) {
                        const scale = Math.min(maxDim / imgWidth, maxDim / imgHeight);
                        const newWidth = Math.round(imgWidth * scale);
                        const newHeight = Math.round(imgHeight * scale);
                        pixbuf = pixbuf.scale_simple(newWidth, newHeight, GdkPixbuf.InterpType.BILINEAR);
                        imgWidth = newWidth;
                        imgHeight = newHeight;
                    }
                } catch (e) {
                    this.close();
                    return;
                }
                // Compute the image/container ratio
                const imgRatio = imgWidth / imgHeight;
                const boxRatio = boxW / boxH;
                let displayW, displayH;
                if (imgRatio > boxRatio) {
                    displayW = boxW;
                    displayH = Math.round(boxW / imgRatio);
                } else {
                    displayH = boxH;
                    displayW = Math.round(boxH * imgRatio);
                }
                const texture = St.TextureCache.get_default().load_uri_async('file://' + filepath, displayW, displayH);

                // Create the real image widget only if the texture exists
                if (texture) {
                    this._image = new St.Bin({ child: texture, style_class: 'edit-image' });
                    this._image.set_width(displayW);
                    this._image.set_height(displayH);
                    this._canvasWidth = displayW;
                    this._canvasHeight = displayH;
                }

                // Canvas and drawing actor
                this._drawingCanvas = new Clutter.Canvas();
                this._drawingCanvas.set_size(this._canvasWidth, this._canvasHeight);
                this._drawingActor = new St.Widget({
                    width: this._canvasWidth,
                    height: this._canvasHeight,
                    reactive: true
                });
                this._drawingActor.set_content(this._drawingCanvas);

                // Add image and canvas to superposeBox
                this._superposeBox.add_child(this._image);
                this._superposeBox.add_child(this._drawingActor);
                this._superposeBox.set_width(boxW);
                this._superposeBox.set_height(boxH);
                this._superposeBox.set_position(
                    Math.round((global.stage.width - boxW) / 2),
                    Math.round((global.stage.height - boxH) / 2)
                );

                // Drawing data (always reset for each overlay)
                this._drawing = false;
                this._lastPoint = null;

                // Force redraw of canvas multiple times on opening to avoid artifacts
                this._drawingCanvas.invalidate();
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    this._drawingCanvas.invalidate();
                    return GLib.SOURCE_REMOVE;
                });

                // === INTERACTIONS: Drawing event handling ===
                // Manages mouse interactions for all drawing tools
                const getLocalCoords = (event) => {
                    const [x, y] = event.get_coords();
                    const [actorX, actorY] = this._drawingActor.get_transformed_position();
                    return [x - actorX, y - actorY];
                };

                const startShapeDrawing = (localCoords) => {
                    this._drawing = true;
                    this._shapeStart = localCoords;
                    this._shapeCurrent = localCoords;
                };

                this._drawingActor.connect('button-press-event', (actor, event) => {
                    const localCoords = getLocalCoords(event);

                    if (this._currentTool === 'eraser') {
                        if (this._eraseAtCoords(localCoords)) {
                            return Clutter.EVENT_STOP;
                        }
                    }

                    if (this._currentTool === 'brush') {
                        this._drawing = true;
                        this._lastPoint = localCoords;
                        this._paths.push({ type: 'brush', points: [localCoords], color: this._color, thickness: this._thickness });
                        this._updateActionBtnStates();
                    }

                    if (this._currentTool === 'blur') {
                        startShapeDrawing(localCoords);
                    }

                    if (['rect', 'ellipse', 'arrow'].includes(this._currentTool)) {
                        startShapeDrawing(localCoords);
                    }

                    // Creation of the text input field
                    if (this._currentTool === 'text') {
                        let hitPath = null;
                        let hitIndex = -1;
                        for (let i = this._paths.length - 1; i >= 0; i--) {
                            const path = this._paths[i];
                            if (path.type === 'text') {
                                const { x, y, w, h } = this._getTextClickArea(path);
                                if (
                                    localCoords[0] >= x && localCoords[0] <= x + w &&
                                    localCoords[1] >= y && localCoords[1] <= y + h
                                ) {
                                    hitPath = path;
                                    hitIndex = i;
                                    break;
                                }
                            }
                        }
                        if (hitPath) {
                            this._paths.splice(hitIndex, 1);
                            this._drawingCanvas.invalidate();
                            this._finalizeTextEntries({ validate: true }); // No empty text fields when re-editing
                            const textEntry = this._createTextEntryFromPath(hitPath);
                            this._superposeBox.add_child(textEntry);
                            if (textEntry.grab_key_focus) textEntry.grab_key_focus();
                            this._updateActionBtnStates();
                            return Clutter.EVENT_STOP;
                        }

                        // Call
                        this._finalizeTextEntries({ validate: true });
                        this._newTextEntry(event, localCoords);
                    }
                    return Clutter.EVENT_STOP;
                });
                this._drawingActor.connect('motion-event', (actor, event) => {
                    if (!this._drawing) return Clutter.EVENT_STOP;

                    const localCoords = getLocalCoords(event);
                    if (this._currentTool === 'brush') {
                        if (this._paths.length > 0 && this._paths[this._paths.length - 1].type === 'brush') {
                            this._paths[this._paths.length - 1].points.push(localCoords);
                        }
                        this._lastPoint = localCoords;
                        this._drawingCanvas.invalidate();
                    }

                    // Blur tool and shapes: update current position
                    if (this._currentTool === 'blur' || ['rect', 'ellipse', 'arrow'].includes(this._currentTool)) {
                        this._shapeCurrent = localCoords;
                        this._drawingCanvas.invalidate();
                    }

                    return Clutter.EVENT_STOP;
                });
                this._drawingActor.connect('button-release-event', (actor, event) => {
                    if (!this._drawing) return Clutter.EVENT_STOP;

                    if (this._currentTool === 'brush') {
                        this._drawing = false;
                        this._lastPoint = null;
                    }

                    // Blur tool: end drag, add blur area to _paths
                    if (this._currentTool === 'blur') {
                        this._drawing = false;
                        this._paths.push({ 
                            type: 'blur', 
                            start: this._shapeStart, 
                            end: this._shapeCurrent, 
                            thickness: this._thickness 
                        });
                        this._shapeStart = null;
                        this._shapeCurrent = null;
                        this._drawingCanvas.invalidate();
                        this._updateActionBtnStates();
                    }

                    // Shapes: end drag, add shape to _paths
                    if (['rect', 'ellipse', 'arrow'].includes(this._currentTool)) {
                        this._drawing = false;
                        this._paths.push({ 
                            type: this._currentTool, 
                            start: this._shapeStart, 
                            end: this._shapeCurrent, 
                            color: this._color, 
                            thickness: this._thickness 
                        });
                        this._shapeStart = null;
                        this._shapeCurrent = null;
                        this._drawingCanvas.invalidate();
                        this._updateActionBtnStates();
                    }

                    return Clutter.EVENT_STOP;
                });
                this._drawSignalId = this._drawingCanvas.connect('draw', (canvas, cr, width, height) => {
                    cr.setSourceRGBA(0, 0, 0, 0);
                    cr.setOperator(Cairo.Operator.SOURCE);
                    cr.paint();
                    cr.setOperator(Cairo.Operator.OVER);
                    // Color and thickness based on tool
                    let color = this._color;
                    let thickness = this._thickness;
                    for (let path of this._paths) {
                        this._drawPath(cr, path);
                    }
                    // Shape preview during drawing
                    if (this._drawing && this._shapeStart && this._shapeCurrent && ['rect', 'ellipse', 'arrow', 'blur'].includes(this._currentTool)) {
                        if (this._currentTool !== 'blur') {
                            this._drawPath(cr, {
                                type: this._currentTool,
                                start: this._shapeStart,
                                end: this._shapeCurrent,
                                color: this._color,
                                thickness: this._thickness
                            });
                        } else {
                            // Specific preview for pixelization (blue zone)
                            let x = Math.min(this._shapeStart[0], this._shapeCurrent[0]);
                            let y = Math.min(this._shapeStart[1], this._shapeCurrent[1]);
                            let w = Math.abs(this._shapeCurrent[0] - this._shapeStart[0]);
                            let h = Math.abs(this._shapeCurrent[1] - this._shapeStart[1]);
                            // Semi-transparent background
                            cr.setSourceRGBA(0.2, 0.6, 0.9, 0.18);
                            cr.rectangle(x, y, w, h);
                            cr.fill();
                            // Colored border
                            cr.setSourceRGBA(0.1, 0.5, 0.8, 0.9);
                            cr.setLineWidth(1.5);
                            cr.rectangle(x, y, w, h);
                            cr.stroke();
                        }
                    }
                    return true;
                })
                return GLib.SOURCE_REMOVE;
            });
        }
        // === TOOLBAR: CREATION, STATE, TOOLTIP, BUTTONS ===
        _initToolbarButtons() {
            this._toolbar = new St.BoxLayout({
                vertical: false,
                style_class: 'edit-toolbar',
                x_align: St.Align.START,
                y_align: St.Align.START
            });
            this._toolbar.set_width(860 * this._scale);
            this._toolbar.set_height(54 * this._scale);
            this._toolbar.set_position(30 * this._scale, 30 * this._scale);

            this._toolConfigs = [
                { name: '_brushButton', icon: 'draw-brush.svg', tool: 'brush', tooltip: _('Brush') },
                { name: '_eraserButton', icon: 'draw-eraser.svg', tool: 'eraser', tooltip: _('Eraser') },
                { name: '_arrowButton', icon: 'draw-arrow.svg', tool: 'arrow', tooltip: _('Arrow') },
                { name: '_rectButton', icon: 'draw-rectangle.svg', tool: 'rect', tooltip: _('Rectangle') },
                { name: '_ellipseButton', icon: 'draw-ellipse.svg', tool: 'ellipse', tooltip: _('Ellipse') },
                { name: '_pixelButton', icon: 'draw-pixel.svg', tool: 'blur', tooltip: _('Pixelization') },
                { name: '_textButton', icon: 'draw-text.svg', tool: 'text', tooltip: _('Text') }
            ];
            this._toolConfigs.forEach(config => {
                const toolIconSize = 32;
                const iconSize = (this._scale <= 1) ? toolIconSize : Math.floor(BTN_TOOLBAR * this._scale * 0.4);
                const icon = new St.Icon({
                    gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + config.icon) }),
                    icon_size: iconSize
                });
                const btn = new St.Button({ style_class: 'edit-toolbar-btn' });
                btn.set_child(icon);
                btn.set_size(BTN_TOOLBAR * this._scale, BTN_TOOLBAR * this._scale);
                btn.connect('clicked', () => { this._setTool(config.tool); });
                this._toolbar.add_child(btn);
                this[config.name] = btn;
            });

            const separator = new St.BoxLayout({ vertical: true, style_class: 'edit-toolbar-separator' });
            this._toolbar.add_child(separator);

            // Thicknesses buttons
            this._thicknesses = [5, 9, 15];
            this._thicknessButtons = [];
            const THICKNESS_ICON_SIZES = { 5: 12, 9: 24, 15: 36 };
            for (const t of this._thicknesses) {
                const thickIconSize = THICKNESS_ICON_SIZES[t];
                let clampRatio = 1.0;
                if (t === 15) clampRatio = 0.5;
                if (t === 9) clampRatio = 0.5;
                if (t === 5) clampRatio = 0.5;
                const iconSize = (this._scale <= 1) ? thickIconSize : Math.min(Math.floor(thickIconSize * this._scale * clampRatio));
                const btn = new St.Button({ style_class: 'edit-toolbar-btn thicknesses' });
                const icon = new St.Icon({
                    gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'thickness-symbolic.svg')}),
                    icon_size: iconSize
                });
                btn.set_child(icon);
                btn.set_size(BTN_TOOLBAR * this._scale, BTN_TOOLBAR * this._scale);
                btn.connect('clicked', () => {
                    this._setThickness(t);
                });
                this._toolbar.add_child(btn);
                this._thicknessButtons.push(btn);
            }

            // Colors buttons
            this._colors = [
                [0,0,0],       // black
                [255,255,255], // white
                [255,58,0],    // red
                [22,125,228],  // blue
                [9,140,54],    // green
                [248,222,48]   // yellow
            ];
            this._colorTooltips = [_('Black'), _('White'), _('Red'), _('Blue'), _('Green'), _('Yellow')];
            this._colorButtons = [];
            for (let i = 0; i < this._colors.length; i++) {
                const colorIconSize = 28;
                const iconSize = (this._scale <= 1) ? colorIconSize : Math.floor(BTN_TOOLBAR * this._scale * 0.7);
                const btn = new St.Button({ style_class: 'edit-toolbar-btn colors' });
                const swatch = new St.Icon({
                    gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'color-symbolic.svg')}),
                    icon_size: iconSize,
                    style_class: 'colors-icon'
                });
                btn.set_child(swatch);
                btn.set_size(BTN_TOOLBAR * this._scale, BTN_TOOLBAR * this._scale);
                btn.connect('clicked', () => {
                    this._setColor(this._colors[i]);
                });
                this._toolbar.add_child(btn);
                this._colorButtons.push(btn);
            }

            const spacer = new St.Widget({ style_class: 'edit-toolbar-spacer', width: 24 * this._scale });
            this._toolbar.add_child(spacer);
            
            // Save/cancel buttons
            const saveCancelIconSize = 30;
            const saveIcon = new St.Icon({ 
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'edit-save-symbolic.svg')}),
                icon_size: (this._scale <= 1) ? saveCancelIconSize : Math.floor(BTN_TOOLBAR * this._scale * 0.4)
            });
            this._saveButton = new St.Button({ style_class: 'edit-toolbar-btn' });
            this._saveButton.set_child(saveIcon);
            this._saveButton.set_size(BTN_TOOLBAR * this._scale, BTN_TOOLBAR * this._scale);
            this._saveButton.connect('clicked', () => {
                this.showSaveOptionsDialog();
            });
            this._toolbar.add_child(this._saveButton);
            const cancelIcon = new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'edit-undo-symbolic.svg')}),
                icon_size: (this._scale <= 1) ? saveCancelIconSize : Math.floor(BTN_TOOLBAR * this._scale * 0.4)
            });
            this._cancelDrawButton = new St.Button({ style_class: 'edit-toolbar-btn' });
            this._cancelDrawButton.set_child(cancelIcon);
            this._cancelDrawButton.set_size(BTN_TOOLBAR * this._scale, BTN_TOOLBAR * this._scale);
            this._cancelDrawButton.connect('clicked', () => {
                this._resetDrawing();
            });
            this._toolbar.add_child(this._cancelDrawButton);
            
            // Close button
            this._closeBox = new St.BoxLayout({
                vertical: false,
                style_class: 'edit-close-box'
            });
            this._closeBox.set_width(BTN_CLOSE * this._scale);
            this._closeBox.set_height(BTN_CLOSE * this._scale);
            this._closeBox.set_position(global.stage.width - 100 * this._scale, 0);
            const closeIconSize = 24;
            const closeIcon = new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'window-close-symbolic.svg')}),
                icon_size: (this._scale <= 1) ? closeIconSize : Math.floor(BTN_CLOSE * this._scale * 0.3)
            });
            this._closeButton = new St.Button({
                style_class: 'edit-close-btn'
            });
            this._closeButton.set_child(closeIcon);
            this._closeButton.set_size(BTN_CLOSE * this._scale, BTN_CLOSE * this._scale);
            this._closeButton.connect('clicked', () => this.close());
            this._closeBox.add_child(this._closeButton);
        }

         // Attach all tooltips to the toolbar buttons
        _attachTooltips() {
            const attachTooltip = (btn, text) => {
                btn.connect('enter-event', () => {
                    if (this._tooltipTimeoutId) {
                        GLib.source_remove(this._tooltipTimeoutId);
                        this._tooltipTimeoutId = null;
                    }
                    this._tooltipTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                        const [x, y, mods] = global.get_pointer();
                        let actorAtPointer = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
                        let isOverButton = false;
                        while (actorAtPointer) {
                            if (actorAtPointer === btn) {
                                isOverButton = true;
                                break;
                            }
                            actorAtPointer = actorAtPointer.get_parent && actorAtPointer.get_parent();
                        }
                        if (isOverButton && !(mods & Clutter.ModifierType.BUTTON1_MASK) && this._tooltip) {
                            this._tooltip.set_text(text);
                            this._tooltip.set_position(x + 10, y + 10);
                            this._tooltip.show();
                        }
                        this._tooltipTimeoutId = null;
                        return GLib.SOURCE_REMOVE;
                    });
                });
                btn.connect('leave-event', () => {
                    if (this._tooltipTimeoutId) {
                        GLib.source_remove(this._tooltipTimeoutId);
                        this._tooltipTimeoutId = null;
                    }
                    if (this._tooltip) this._tooltip.hide();
                });
                btn.connect('button-press-event', () => {
                    if (this._tooltipTimeoutId) {
                        GLib.source_remove(this._tooltipTimeoutId);
                        this._tooltipTimeoutId = null;
                    }
                    if (this._tooltip) this._tooltip.hide();
                });
            };
            this._toolConfigs.forEach(config => {
                const btn = this[config.name];
                if (btn) attachTooltip(btn, config.tooltip);
            });
            this._thicknessButtons.forEach((btn, i) => {
                attachTooltip(btn, _('Thickness/size') + " " + this._thicknesses[i]);
            });
            this._colorButtons.forEach((btn, i) => {
                attachTooltip(btn, this._colorTooltips[i]);
            });
            attachTooltip(this._saveButton, _('Save changes to the canvas'));
            attachTooltip(this._cancelDrawButton, _('Cancel all changes'));
            attachTooltip(this._closeButton, _('Close'));

            // Clean up tooltip on close
            this._destroyTooltip = () => {
                if (this._tooltipTimeoutId) {
                    GLib.source_remove(this._tooltipTimeoutId);
                    this._tooltipTimeoutId = null;
                }
                if (this._tooltip) {
                    this._tooltip.hide();
                    this._tooltip.destroy();
                    this._tooltip = null;
                }
            };
            this.connect('destroy', () => this._destroyTooltip());
        }
        
        /** Sets the current drawing tool and updates the UI accordingly */
        _setTool(tool) {
            this._currentTool = tool;
            
            // Clean up empty text input fields and remove focus when changing tools
            if (this._mainOverlay && tool !== 'text') {
                this._finalizeTextEntries({ grabFocus: true });
            }
            
            // Visual feedback on active tool
            const toolMap = { 
                brush: this._brushButton, 
                eraser: this._eraserButton, 
                arrow: this._arrowButton, 
                rect: this._rectButton, 
                ellipse: this._ellipseButton, 
                blur: this._pixelButton, 
                text: this._textButton 
            };
            Object.values(toolMap).forEach(btn => btn && btn.remove_style_pseudo_class('active'));
            toolMap[tool] && toolMap[tool].add_style_pseudo_class('active');
            
            // Update thickness and color states based on tool
            this._setThickness(this._thickness);
            this._setColor(this._color);
        }

        _setThickness(t) {
            this._thickness = t;
            const disableThickness = (this._currentTool === 'eraser');
            
            // Visual feedback on selected button
            this._thicknessButtons.forEach((btn, i) => {
                if (disableThickness) {
                    btn.add_style_class_name('disabled');
                    btn.reactive = false;
                    btn.remove_style_pseudo_class('active');
                } else {
                    btn.remove_style_class_name('disabled');
                    btn.reactive = true;
                    if (this._thicknesses[i] === t) btn.add_style_pseudo_class('active');
                    else btn.remove_style_pseudo_class('active');
                }
            });
            this._applyColorToActiveTextEntries();
        }

        _setColor(c) {
            this._color = c;
            const disableColor = (this._currentTool === 'eraser' || this._currentTool === 'blur');
            
            // Visual feedback on selected button
            this._colorButtons.forEach((btn, i) => {
                const color = this._colors[i];
                let icon = btn.get_child();
                
                if (disableColor) {
                    btn.add_style_class_name('disabled');
                    btn.reactive = false;
                    btn.remove_style_pseudo_class('active');
                    if (icon) icon.set_style('color: rgba(110,110,110,0.45);');
                } else {
                    btn.remove_style_class_name('disabled');
                    btn.reactive = true;
                    if (icon) icon.set_style(`color: rgb(${color[0]},${color[1]},${color[2]});`);
                    if (color[0] === c[0] && color[1] === c[1] && color[2] === c[2]) {
                        btn.add_style_pseudo_class('active');
                    } else {
                        btn.remove_style_pseudo_class('active');
                    }
                }
            });
            this._applyColorToActiveTextEntries();
        }

        /** Update the state of action buttons (save/cancel) based on modifications */
        _updateActionBtnStates() {
            let hasTextEntry = false;         // Check if at least one text input field is open
            if (this._superposeBox) {
                let children = this._superposeBox.get_children();
                hasTextEntry = children.some(child => child.has_style_class_name && child.has_style_class_name('edit-text-entry'));
            }
            const hasModif = this._paths.length > 0 || hasTextEntry;
            [this._saveButton, this._cancelDrawButton].forEach(btn => {
                btn.reactive = hasModif;
                btn.remove_style_pseudo_class('hover'); // Fix visual issue
                if (hasModif) {
                    btn.remove_style_class_name('disabled');
                } else {
                    btn.add_style_class_name('disabled');
                }
            });
        }

        // === TEXT UTILITIES ===
        /**
         * Validates all interactive text fields (St.Entry) into static text,
         * cleans up empty fields, and manages focus if requested.
         * @param {Object} options - validate: true to validate filled fields, false to only clean up empty ones
         *                         - grabFocus: true to return focus to the canvas if a field was removed
         */
        _finalizeTextEntries({ validate = true, grabFocus = false } = {}) {
            if (!this._superposeBox) return;
            let hadTextEntry = false;
            let children = this._superposeBox.get_children();
            for (let i = children.length - 1; i >= 0; i--) {
                let child = children[i];
                if (child.has_style_class_name && child.has_style_class_name('edit-text-entry')) {
                    const value = child.get_text();
                    if (validate && value && value.trim().length > 0) {
                        let [x, y] = child.get_position ? child.get_position() : [0, 0];
                        let entryHeight = child._entryHeight || (child.get_height ? child.get_height() : 32);
                        let baselineY = y + (entryHeight * 0.8);
                        // Convert from box coordinates to canvas coordinates
                        const [canvasX, canvasY] = this._drawingActor.get_transformed_position();
                        const [boxX, boxY] = this._superposeBox.get_transformed_position();
                        const canvasPosX = x - (canvasX - boxX);
                        const canvasPosY = baselineY - (canvasY - boxY);
                        this._paths.push({
                            type: 'text',
                            text: value,
                            position: [canvasPosX, canvasPosY],
                            color: child._textColor || this._color,
                            thickness: child._textThickness || this._thickness,
                            entryHeight: entryHeight
                        });
                        hadTextEntry = true;
                    } else if (!value || value.trim().length === 0) {
                        hadTextEntry = true;
                    }
                    if (child.get_parent) child.get_parent().remove_child(child);
                    child.destroy && child.destroy();
                }
            }
            if (grabFocus && hadTextEntry) {
                global.stage.grab_key_focus();
            }
            if (hadTextEntry && this._drawingCanvas)
                this._drawingCanvas.invalidate();
        }

        /** Creates a new interactive text field at the click position */
        _newTextEntry(event, localCoords) {
            // Pointer position in the canvas coordinate system
            const [stageX, stageY] = event.get_coords();
            const [boxX, boxY] = this._superposeBox.get_transformed_position();
            const [canvasX, canvasY] = this._drawingActor.get_transformed_position();
            let canvasLocalX = stageX - canvasX;
            let canvasLocalY = stageY - canvasY;

            const textEntry = new St.Entry({ text: '', style_class: 'edit-text-entry' });
            textEntry._textColor = this._color;
            textEntry._textThickness = this._thickness;
            textEntry._canvasX = localCoords[0];
            textEntry._canvasY = localCoords[1];
            const r = this._color[0], g = this._color[1], b = this._color[2];
            const fontSize = this._thickness * 5;
            textEntry.set_style(`color: rgb(${r},${g},${b}); font-size: ${fontSize}px;`);
            this._superposeBox.add_child(textEntry);
            const entryHeight = textEntry.get_height ? textEntry.get_height() : 32;
            const entryWidth = textEntry.get_width ? textEntry.get_width() : Math.min(300, this._canvasWidth * 0.4);

            // Limit the position within the canvas coordinate system
            canvasLocalX = Math.max(3, Math.min(canvasLocalX, this._canvasWidth - entryWidth - 3));
            canvasLocalY = Math.max(3, Math.min(canvasLocalY - entryHeight, this._canvasHeight - entryHeight - 3));

            // Convert back to the box coordinate system to place the text field
            const finalX = canvasX - boxX + canvasLocalX;
            const finalY = canvasY - boxY + canvasLocalY;
            textEntry.set_position(finalX, finalY);
            textEntry._entryHeight = entryHeight;
            textEntry._baselineY = canvasLocalY;
            if (textEntry && textEntry.grab_key_focus) {
                textEntry.grab_key_focus();
            }
            textEntry.connect('notify::text', () => {
                this._enforceTextEntryWidthLimit(textEntry);
            });
            this._updateActionBtnStates();
        }

        /** Creates an interactive text field from a static text path (for re-editing) */
        _createTextEntryFromPath(path) {
            const textEntry = new St.Entry({ text: path.text, style_class: 'edit-text-entry' });
            textEntry._textColor = path.color;
            textEntry._textThickness = path.thickness;
            const [canvasX, canvasY] = this._drawingActor.get_transformed_position();
            const [boxX, boxY] = this._superposeBox.get_transformed_position();
            let x = path.position[0] + (canvasX - boxX);
            let y = path.position[1] - path.entryHeight * 0.8 + (canvasY - boxY);
            const r = path.color[0], g = path.color[1], b = path.color[2];
            let fontSize = path.thickness * 5;
            textEntry.set_style(`color: rgb(${r},${g},${b}); font-size: ${fontSize}px;`);
            textEntry.set_position(x, y);
            textEntry.set_height(path.entryHeight);
            textEntry._entryHeight = path.entryHeight;
            textEntry._baselineY = path.position[1];
            textEntry.connect('notify::text', () => {
                this._enforceTextEntryWidthLimit(textEntry);
            });
            return textEntry;
        }

         /** Calculates the clickable area (bounding box) of a static text  */
        _getTextClickArea(path) {
            const ctx = new Cairo.Context(new Cairo.ImageSurface(Cairo.Format.ARGB32, 1, 1));
            ctx.selectFontFace('System-ui', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
            ctx.setFontSize(path.thickness * 5);
            return {
                x: path.position[0],
                y: path.position[1] - path.entryHeight * 0.8,
                w: ctx.textExtents(path.text).width + 8,
                h: path.entryHeight
            };
        }
        
        /** Applies the current color to active text fields */
        _applyColorToActiveTextEntries() {
            if (!this._superposeBox) return;
            let children = this._superposeBox.get_children();
            for (let child of children) {
                if (child.has_style_class_name && child.has_style_class_name('edit-text-entry')) {
                    const r = this._color[0], g = this._color[1], b = this._color[2];
                    const newStyle = `color: rgb(${r},${g},${b}); font-size: ${child._textThickness * 5}px;`;
                    if (child._textColor !== this._color || child.get_style() !== newStyle) {
                        child.set_style(newStyle);
                        child._textColor = this._color;
                    }
                }
            }
        }

        /** Enforce dynamic width and input limit for text entry*/
        _enforceTextEntryWidthLimit(textEntry) {
            const [canvasX, canvasY] = this._drawingActor.get_transformed_position();
            const [boxX, boxY] = this._superposeBox.get_transformed_position();
            let [x, y] = textEntry.get_position();
            let entryHeight = textEntry._entryHeight || (textEntry.get_height ? textEntry.get_height() : 32);
            let canvasLocalX = x - (canvasX - boxX);
            const ctx = new Cairo.Context(new Cairo.ImageSurface(Cairo.Format.ARGB32, 1, 1));
            ctx.selectFontFace('System-ui', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
            ctx.setFontSize(textEntry._textThickness * 5 * this._scale);
            const textWidth = ctx.textExtents(textEntry.get_text()).width + (14 * this._scale);
            const maxWidth = this._canvasWidth - canvasLocalX - (3 * this._scale);
            const minWidth = 82 * this._scale;
            if (textWidth > maxWidth) {
                textEntry.set_text(textEntry.get_text().slice(0, -1));
            }
            textEntry.set_width(Math.max(minWidth, textWidth));
        }

        /**  Draws static text on the canvas */
        _drawText(cr, path, scale = null) {
            this._setupColor(cr, path.color);
            cr.selectFontFace('System-ui', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
            const fontSize = path.thickness * 5 * this._scale;
            cr.setFontSize(fontSize);
            let y = path.position[1];
            cr.moveTo(path.position[0], y);
            cr.showText(path.text);
            cr.newPath();
        }

        // === DIALOGS: SAVE, CONFIRMATION, ETC. ===
        /**
         * Internal helper to show a custom dialog with given title and buttons.
         * @param {string} title
         * @param {Array} buttons - [{label, styleClass, onClick}]
         * @param {number} width
         * @param {number} height
         */
        _showDialogWidget({title, buttons, width = 400, height = 220}) {
            if (this._genericDialog) return;
            this._genericDialog = new St.Widget({
                style_class: 'edit-dialog-widget-bg',
                reactive: true,
                x_expand: true,
                y_expand: true,
                layout_manager: new Clutter.BinLayout()
            });
            this._genericDialog.set_size(global.stage.width, global.stage.height);
            this._genericDialog.set_position(0, 0);

            const dialogBox = new St.BoxLayout({
                vertical: true,
                style_class: 'edit-dialog-widget-box'
            });
            dialogBox.set_width(width * this._scale);
            dialogBox.set_height(height * this._scale);
            dialogBox.set_position(
                Math.round((global.stage.width - width * this._scale * 0.925) / 2),
                Math.round((global.stage.height - height * this._scale) / 2)
            );

            const titleLabel = new St.Label({ text: title, style_class: 'edit-dialog-widget-title' });
            dialogBox.add_child(titleLabel);

            const buttonBox = new St.BoxLayout({ vertical: true, style_class: 'edit-dialog-widget-btnbox' });
            for (let btn of buttons) {
                const stBtn = new St.Button({ label: btn.label, style_class: btn.styleClass || 'edit-dialog-widget-btn' });
                stBtn.connect('clicked', () => {
                    if (this._genericDialog) {
                        global.stage.remove_child(this._genericDialog);
                        this._genericDialog.destroy();
                        this._genericDialog = null;
                    }
                    btn.onClick();
                });
                buttonBox.add_child(stBtn);
            }
            dialogBox.add_child(buttonBox);
            this._genericDialog.add_child(dialogBox);
            global.stage.add_child(this._genericDialog);
        }

        showSaveOptionsDialog() {
            if (this._saveDialog) return;
            // Validate and collect open text input fields
            if (this._superposeBox) {
                let children = this._superposeBox.get_children();
                for (let child of children) {
                    if (child.has_style_class_name && child.has_style_class_name('edit-text-entry')) {
                        const value = child.get_text();
                        if (value && value.trim().length > 0) {
                            let [x, y] = child.get_position ? child.get_position() : [0, 0];
                            const [canvasX, canvasY] = this._drawingActor.get_transformed_position();
                            const [boxX, boxY] = this._superposeBox.get_transformed_position();
                            const offsetX = canvasX - boxX;
                            const offsetY = canvasY - boxY;
                            const canvasPosX = x - offsetX;
                            const canvasPosY = y - offsetY;
                            let color = child._textColor || this._color;
                            let thickness = child._textThickness || this._thickness;
                            let entryHeight = child._entryHeight;
                            this._paths.push({
                                type: 'text',
                                text: value,
                                position: [canvasPosX, canvasPosY + (entryHeight * 0.8)],
                                color: color,
                                thickness: thickness,
                                entryHeight: entryHeight
                            });
                        }
                        this._superposeBox.remove_child(child);
                        child.destroy();
                    }
                }
            }
            this._showDialogWidget({
                title: _('Apply changes?'),
                width: 400,
                height: 280,
                buttons: [
                    {
                        label: _('Merge canvas with image'),
                        onClick: () => this._mergeAndSaveOriginal()
                    },
                    {
                        label: _('Save modified copy as…'),
                        onClick: () => this._saveAsCopy()
                    },
                    {
                        label: _('Cancel'),
                        styleClass: 'edit-dialog-widget-btn cancel',
                        onClick: () => { /* Just close dialog */ }
                    }
                ]
            });
        }

        showCloseConfirmDialog() {
            this._showDialogWidget({
                title: _('Quit without apply changes?'),
                width: 500,
                buttons: [
                    {
                        label: _('Yes'),
                        onClick: () => {
                            this._resetDrawing();
                            if (typeof require === 'function') {
                                try {
                                    const { showScreenshotPreview } = require('./preview');
                                    showScreenshotPreview(this._filepath, () => {}, this._onOptionSelected, this._showBackButton);
                                } catch (e) {
                                    global.log('CS: error returning to preview: ' + e);
                                }
                            }
                            this.close(true);
                        }
                    },
                    {
                        label: _('No'),
                        styleClass: 'edit-dialog-widget-btn cancel',
                        onClick: () => { /* Just close dialog */ }
                    }
                ]
            });
        }

        _mergeAndSaveOriginal() {
            try {
                let pixbuf = GdkPixbuf.Pixbuf.new_from_file(this._filepath);
                let width = pixbuf.get_width();
                let height = pixbuf.get_height();
                let surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
                let cr = new Cairo.Context(surface);
                Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
                cr.paint();
                let scaleX = width / this._canvasWidth;
                let scaleY = height / this._canvasHeight;
                cr.save();
                cr.scale(scaleX, scaleY);
                for (let path of this._paths) {
                    this._drawPath(cr, path, true);
                }
                cr.restore();
                surface.flush();
                let pixbufOut = Gdk.pixbuf_get_from_surface(surface, 0, 0, width, height);
                pixbufOut.savev(this._filepath, 'png', [], []);
            } catch (e) {
                global.log('CS: error during merge/save: ' + e);
                Main.notifyError(_('Error saving'), '' + e);
                return;
            }
            this._resetDrawing();
            this._transitionManager.fadeOut(this, { instant: true, onComplete: () => this._cleanupAndClose(true) });
            if (typeof require === 'function') {
                try {
                    const { showScreenshotPreview } = require('./preview');
                    showScreenshotPreview(this._filepath, () => {}, this._onOptionSelected, this._showBackButton);
                } catch (e) {
                    global.log('CS: error returning to preview: ' + e);
                }
            }
        }

        _saveAsCopy() {
            const picturesDir = getPicturesDir();
            let currentState = this._getCurrentState();
            let filepath = this._filepath;
            let onClose = this._onClose;
            let preview = this._preview;
            // Close edit mode and preview before opening file chooser
            this.close(true, true);
            if (preview) preview.close();
            const file = Gio.File.new_for_path(scriptPath);
            if (!file.query_exists(null)) {
                Main.notifyError(_('Script gtk-filechooser.py not available', "Unable to open file chooser."));
                if (typeof require === 'function') {
                    try {
                        const { showScreenshotPreview } = require('./preview');
                        showScreenshotPreview(filepath, () => {}, this._onOptionSelected, this._showBackButton, currentState);
                    } catch (e) {
                        global.log('CS: error returning to preview: ' + e);
                    }
                }
                return;
            }
            let defaultName = GLib.path_get_basename(filepath);
            let extIndex = defaultName.lastIndexOf('.');
            if (extIndex > 0) {
                defaultName = defaultName.slice(0, extIndex) + '_copy' + defaultName.slice(extIndex);
            } else {
                defaultName = defaultName + '_copy';
            }
            let argv = [
                'python3', scriptPath,
                '--title', _('Save as...'),
                '--filename', defaultName,
                '--directory', picturesDir,
                '--filter', _('Images'),
                '--save-button', _('Save'),
                '--cancel-button', _('Cancel')
            ];
            let proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE
            });
            proc.init(null);
            const reopenPreview = (persistState) => {
                if (typeof require === 'function') {
                    try {
                        const { showScreenshotPreview } = require('./preview');
                        showScreenshotPreview(filepath, () => {}, this._onOptionSelected, this._showBackButton, persistState ? currentState : null);
                    } catch (e) {
                        global.log('CS: error returning to preview: ' + e);
                    }
                }
            };
            proc.communicate_utf8_async(null, null, (proc, res) => {
                try {
                    const [, stdout] = proc.communicate_utf8_finish(res);
                    const destPath = stdout.trim();
                    if (destPath) {
                        try {
                            let pixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
                            let width = pixbuf.get_width();
                            let height = pixbuf.get_height();
                            let surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
                            let cr = new Cairo.Context(surface);
                            Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
                            cr.paint();
                            let scaleX = width / this._canvasWidth;
                            let scaleY = height / this._canvasHeight;
                            cr.save();
                            cr.scale(scaleX, scaleY);
                            for (let path of this._paths) {
                                this._drawPath(cr, path, true);
                            }
                            cr.restore();
                            surface.flush();
                            let pixbufOut = Gdk.pixbuf_get_from_surface(surface, 0, 0, width, height);
                            pixbufOut.savev(destPath, 'png', [], []);
                        } catch (e) {
                            global.log('CS: error during merge/save (Save as): ' + e);
                            Main.notifyError(_('Error saving', '' + e));
                            return reopenPreview(true);
                        }
                        // After saving, return to preview with original image, no persistence
                        return reopenPreview(false);
                    } else {
                        // If cancelled, keep persistence
                        return reopenPreview(true);
                    }
                } catch (e) {
                    global.log('CS: error gtk-filechooser.py: ' + e);
                    // Always reopen the preview with persistence
                    return reopenPreview(true);
                }
            });
        }

        _resetDrawing() {
            this._paths = [];
            this._blurCache.clear(); // Clear blur cache
            if (this._superposeBox) {
                let children = this._superposeBox.get_children();
                for (let child of children) {
                    if (child.has_style_class_name && child.has_style_class_name('edit-text-entry')) {
                        this._superposeBox.remove_child(child);
                        child.destroy();
                    }
                }
            }
            for (let path of this._paths) {
                if (path.type === 'text' && path.surface) {
                    path.surface.$dispose && path.surface.$dispose();
                    path.surface = null;
                }
            }
            if (this._drawingCanvas)
                this._drawingCanvas.invalidate();
            this._updateActionBtnStates();
        }

        _getCurrentState() {
            return {
                paths: JSON.parse(JSON.stringify(this._paths)),
                color: this._color,
                thickness: this._thickness,
                currentTool: this._currentTool,
            };
        }

        // === UTILITY METHODS FOR DRAWING ===
        _setupColor(cr, color) {
            let r = 0, g = 0, b = 0;
            if (Array.isArray(color) && color.length === 3) {
                r = Math.max(0, Math.min(255, color[0] || 0));
                g = Math.max(0, Math.min(255, color[1] || 0));
                b = Math.max(0, Math.min(255, color[2] || 0));
            }
            cr.setSourceRGBA(r/255, g/255, b/255, 1);
        }

        _setupLineStyle(cr, thickness) {
            cr.setLineWidth(thickness);
            cr.setLineCap(1); // round
        }

        _drawBrush(cr, path) {
            this._setupColor(cr, path.color);
            this._setupLineStyle(cr, path.thickness);
            if (path.points.length > 1) {
                cr.moveTo(path.points[0][0], path.points[0][1]);
                for (let i = 1; i < path.points.length; i++) {
                    cr.lineTo(path.points[i][0], path.points[i][1]);
                }
                cr.stroke();
            }
        }

        _drawRectangle(cr, start, end) {
            let x = Math.min(start[0], end[0]);
            let y = Math.min(start[1], end[1]);
            let w = Math.abs(end[0] - start[0]);
            let h = Math.abs(end[1] - start[1]);
            cr.rectangle(x, y, w, h);
            cr.stroke();
        }

        _drawEllipse(cr, start, end) {
            let x = (start[0] + end[0]) / 2;
            let y = (start[1] + end[1]) / 2;
            let rx = Math.abs(end[0] - start[0]) / 2;
            let ry = Math.abs(end[1] - start[1]) / 2;
            cr.save();
            cr.translate(x, y);
            cr.scale(rx || 1, ry || 1);
            cr.arc(0, 0, 1, 0, 2 * Math.PI);
            cr.restore();
            cr.stroke();
        }

        _drawArrow(cr, start, end, thickness) {
            let [x1, y1] = start;
            let [x2, y2] = end;
            let dx = x2 - x1;
            let dy = y2 - y1;
            let len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0) {
                let offset = 8 + thickness * 0.7;
                // Arrival point offset
                let nx = x2 - dx/len * offset;
                let ny = y2 - dy/len * offset;
                // Main line
                cr.moveTo(x1, y1);
                cr.lineTo(nx, ny);
                cr.stroke();
                // Arrow tip (triangle) from nx, ny to x2, y2
                let angle = Math.atan2(y2 - y1, x2 - x1);
                let headlen = 12 + thickness * 2;
                let arrowAngle = Math.PI / 7;
                let hx1 = nx - headlen * Math.cos(angle - arrowAngle);
                let hy1 = ny - headlen * Math.sin(angle - arrowAngle);
                let hx2 = nx - headlen * Math.cos(angle + arrowAngle);
                let hy2 = ny - headlen * Math.sin(angle + arrowAngle);
                cr.setLineCap(1);
                cr.moveTo(x2, y2);
                cr.lineTo(hx1, hy1);
                cr.moveTo(x2, y2);
                cr.lineTo(hx2, hy2);
                cr.stroke();
            }
        }

        _drawBlur(cr, start, end, thickness, useCache = true) {
            let x = Math.min(start[0], end[0]);
            let y = Math.min(start[1], end[1]);
            let w = Math.abs(end[0] - start[0]);
            let h = Math.abs(end[1] - start[1]);

            // Limit size to avoid lag
            if (w * h > MAX_BLUR_AREA_PIXELS) {
                const ratio = Math.sqrt(MAX_BLUR_AREA_PIXELS / (w * h));
                w = Math.floor(w * ratio);
                h = Math.floor(h * ratio);
            }

            let pixelSize = Math.max(4, Math.min(12, thickness * 1.5));
            let rows = Math.ceil(h / pixelSize);
            let cols = Math.ceil(w / pixelSize);

            if (rows * cols > MAX_BLUR_PIXELS_PER_ZONE) {
                const ratio = Math.sqrt(MAX_BLUR_PIXELS_PER_ZONE / (rows * cols));
                const newPixelSize = Math.floor(pixelSize / ratio);
                const newRows = Math.ceil(h / newPixelSize);
                const newCols = Math.ceil(w / newPixelSize);
                if (newRows * newCols <= MAX_BLUR_PIXELS_PER_ZONE) {
                    pixelSize = newPixelSize;
                    rows = newRows;
                    cols = newCols;
                }
            }

            // Create cache key for blur zone
            const cacheKey = `${x}_${y}_${w}_${h}_${pixelSize}_${rows}_${cols}`;
            
            // Check if we have this blur zone cached (only if useCache is true)
            if (useCache && this._blurCache && this._blurCache.has(cacheKey)) {
                const cachedPixels = this._blurCache.get(cacheKey);
                for (let pixel of cachedPixels) {
                    cr.setSourceRGBA(pixel.r, pixel.g, pixel.b, pixel.a);
                    cr.rectangle(pixel.x, pixel.y, pixel.w, pixel.h);
                    cr.fill();
                }
                return;
            }

            // Calculate blur zone and cache it
            let bgPixbuf = null, pixels = null, rowstride = 0, nChannels = 0, bgWidth = 0, bgHeight = 0;
            try {
                bgPixbuf = GdkPixbuf.Pixbuf.new_from_file(this._filepath);
                pixels = bgPixbuf.get_pixels();
                rowstride = bgPixbuf.get_rowstride();
                nChannels = bgPixbuf.get_n_channels();
                bgWidth = bgPixbuf.get_width();
                bgHeight = bgPixbuf.get_height();
            } catch (e) {
                global.log('CS: error loading background for blur: ' + e);
            }

            const cachedPixels = [];
            
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const pixelX = x + col * pixelSize;
                    const pixelY = y + row * pixelSize;

                    // Get background color at pixel center
                    let bgColor = [0.5, 0.5, 0.5, 1];
                    if (bgPixbuf) {
                        const sampleX = Math.floor((pixelX + pixelSize / 2) * bgWidth / this._canvasWidth);
                        const sampleY = Math.floor((pixelY + pixelSize / 2) * bgHeight / this._canvasHeight);
                        if (sampleX >= 0 && sampleX < bgWidth && sampleY >= 0 && sampleY < bgHeight) {
                            const offset = sampleY * rowstride + sampleX * nChannels;
                            if (offset < pixels.length - 2) {
                                const r = pixels[offset] / 255;
                                const g = pixels[offset + 1] / 255;
                                const b = pixels[offset + 2] / 255;
                                bgColor = [r, g, b, 1];
                            }
                        }
                    }

                    // Mosaic effect with background-adaptive colors
                    const hash = ((row + 13) * 92821 ^ (col + 17) * 68917) >>> 0;
                    const intensity = (hash % 100) / 100;
                    const [bgR, bgG, bgB] = bgColor;
                    
                    // Reduced mosaic intensity to preserve more original color
                    const mosaicIntensity = MOSAIC_INTENSITY_MIN + intensity * MOSAIC_INTENSITY_RANGE;
                    const r = bgR * (1 - mosaicIntensity) + bgR * mosaicIntensity * MOSAIC_BLEND_FACTOR;
                    const g = bgG * (1 - mosaicIntensity) + bgG * mosaicIntensity * MOSAIC_BLEND_FACTOR;
                    const b = bgB * (1 - mosaicIntensity) + bgB * mosaicIntensity * MOSAIC_BLEND_FACTOR;

                    // Cache the pixel data (only if useCache is true)
                    if (useCache) {
                        cachedPixels.push({
                            x: pixelX,
                            y: pixelY,
                            w: pixelSize,
                            h: pixelSize,
                            r: r,
                            g: g,
                            b: b,
                            a: 1
                        });
                    }

                    cr.setSourceRGBA(r, g, b, 1);
                    cr.rectangle(pixelX, pixelY, pixelSize, pixelSize);
                    cr.fill();
                }
            }

            // Store in cache (only if useCache is true)
            if (useCache && this._blurCache) {
                // Global pixel limit in cache (all zones combined)
                const totalPixelsNewZone = cachedPixels.length;
                // Calculate current total
                let totalPixels = 0;
                for (let arr of this._blurCache.values()) {
                    totalPixels += arr.length;
                }
                // If the new zone is too large by itself, don't cache it
                if (totalPixelsNewZone > MAX_CACHE_TOTAL_PIXELS) {
                    return;
                }
                // Remove oldest entries until limit is respected
                while (totalPixels + totalPixelsNewZone > MAX_CACHE_TOTAL_PIXELS && this._blurCache.size > 0) {
                    const firstKey = this._blurCache.keys().next().value;
                    const arr = this._blurCache.get(firstKey);
                    totalPixels -= arr.length;
                    this._blurCache.delete(firstKey);
                }
                this._blurCache.set(cacheKey, cachedPixels);
            }
        }

        // === ERASER UTILITIES ===
        _eraseAtCoords(localCoords) {
            // 1. Erase a static text
            for (let i = this._paths.length - 1; i >= 0; i--) {
                let path = this._paths[i];
                if (path.type === 'text') {
                    let { x, y, w, h } = this._getTextClickArea(path);
                    if (
                        localCoords[0] >= x && localCoords[0] <= x + w &&
                        localCoords[1] >= y && localCoords[1] <= y + h
                    ) {
                        this._paths.splice(i, 1);
                        this._drawingCanvas.invalidate();
                        this._updateActionBtnStates();
                        return true;
                    }
                }
            }
            // 2. Erase another shape (brush, rect, etc.)
            const hitIndex = this._findPathAt(localCoords);
            if (hitIndex !== -1) {
                this._paths.splice(hitIndex, 1);
                this._drawingCanvas.invalidate();
                this._updateActionBtnStates();
                return true;
            }
            return false;
        }
        _findPathAt([x, y]) {
            for (let i = this._paths.length - 1; i >= 0; i--) {
                const path = this._paths[i];
                if (this._isPointOnPath([x, y], path)) {
                    return i;
                }
            }
            return -1;
        }
        _isPointOnPath([x, y], path) {
            let tol = 8;
            if (path.type === 'brush' || path.type === 'arrow') {
                tol = 14;
            }
            if (path.type === 'brush') {
                for (let i = 1; i < path.points.length; i++) {
                    if (this._distancePointToSegment([x, y], path.points[i-1], path.points[i]) < tol)
                        return true;
                }          
             } else if (path.type === 'arrow') {
                if (path.start && path.end) {
                    if (this._distancePointToSegment([x, y], path.start, path.end) < tol)
                        return true;
                }
            } else { // or use a simple eraser for ellipse, rect and pixelization
                if (path.start && path.end) {
                    let [x1, y1] = path.start, [x2, y2] = path.end;
                    let minX = Math.min(x1, x2) - tol, maxX = Math.max(x1, x2) + tol;
                    let minY = Math.min(y1, y2) - tol, maxY = Math.max(y1, y2) + tol;
                    if (x >= minX && x <= maxX && y >= minY && y <= maxY)
                        return true;
                }
            }
            return false;
        }
        _distancePointToSegment([px, py], [x1, y1], [x2, y2]) {
            const dx = x2 - x1, dy = y2 - y1;
            if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
            const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy)));
            const projX = x1 + t * dx, projY = y1 + t * dy;
            return Math.hypot(px - projX, py - projY);
        }
        
        // === DRAWING ROUTING ===
        /**
         * Central drawing method for all drawing types (brush, text, shapes, blur).
         * Routes to specific drawing methods based on path.type.
         * @param cr Cairo context for drawing
         * @param path Drawing path object with type and parameters
         * @param scale Scale factor for text rendering
         * @param forSave Whether drawing is for final save (affects blur cache usage)
         */
        _drawPath(cr, path, forSave = false) {
            if (path.type === 'brush') {
                this._drawBrush(cr, path);
            } else if (path.type === 'text') {
                // For save operations, use scale 1 (real size), otherwise use this._scale (display size)
                const textScale = forSave ? 1 : null;
                this._drawText(cr, path, textScale);
            } else if (path.type) {
                // Shape
                if (path.color) {
                    this._setupColor(cr, path.color);
                    this._setupLineStyle(cr, path.thickness);
                }
                if (path.type === 'rect') {
                    this._drawRectangle(cr, path.start, path.end);
                } else if (path.type === 'ellipse') {
                    this._drawEllipse(cr, path.start, path.end);
                } else if (path.type === 'arrow') {
                    this._drawArrow(cr, path.start, path.end, path.thickness);
                } else if (path.type === 'blur') {
                    if (forSave) {
                        this._drawBlur(cr, path.start, path.end, path.thickness, false); // Pass false for useCache
                    } else {
                        this._drawBlur(cr, path.start, path.end, path.thickness, true); // Pass true for useCache
                    }
                }
            }
        }
        
        // === MODAL OPEN/CLOSE === 
        // Overrides the default ModalDialog behavior with custom transitions
        open(timestamp) {
            if (this._transitionManager.isTransitioning()) return false;
            
            // Call parent open method first
            const result = super.open(timestamp);
            if (!result) return false;
            
            // Use transition manager for opening
            this._transitionManager.fadeIn(this);
            
            return true;
        }
        close(suppressOnClose = false, skipPreview = false) {
            if (this._transitionManager.isTransitioning()) return;

            // If there are unsaved changes, show confirmation dialog
            const hasModif = this._saveButton && this._cancelDrawButton &&
                (!this._saveButton.has_style_class_name('disabled') || !this._cancelDrawButton.has_style_class_name('disabled'));

            if (!suppressOnClose && hasModif) {
                this.showCloseConfirmDialog();
                return;
            }

            // Show preview immediately on close, except for 'Save As' where preview must wait for file dialog to finish
            if (this._onClose && !skipPreview) {
                try {
                    const { showScreenshotPreview } = require('./preview');
                    showScreenshotPreview(this._filepath, () => {}, this._onOptionSelected, this._showBackButton);
                } catch (e) {
                    global.log('CS: error returning to preview: ' + e);
                }
            }
            this._transitionManager.fadeOut(this, {
                onComplete: () => {
                    this._cleanupAndClose(true);
                }
            });
        }

         // === CLEANUP AND CLOSE ===
        _cleanupAndClose(suppressOnClose) {
            if (this._drawingCanvas && this._drawSignalId) {
                this._drawingCanvas.disconnect(this._drawSignalId);
                this._drawSignalId = null;
            }
            if (this._drawingActor) {
                if (this._drawingActor.get_parent())
                    this._drawingActor.get_parent().remove_child(this._drawingActor);
                this._drawingActor.destroy();
                this._drawingActor = null;
            }
            if (this._toolbar) {
                if (this._toolbar.get_parent())
                    this._toolbar.get_parent().remove_child(this._toolbar);
                this._toolbar.destroy();
                this._toolbar = null;
            }
            if (this._closeButton) {
                if (this._closeButton.get_parent())
                    this._closeButton.get_parent().remove_child(this._closeButton);
                this._closeButton.destroy();
                this._closeButton = null;
            }
            if (this._image) {
                if (this._image.get_parent())
                    this._image.get_parent().remove_child(this._image);
                this._image.destroy();
                this._image = null;
            }
            if (this._superposeBox) {
                if (this._superposeBox.get_parent())
                    this._superposeBox.get_parent().remove_child(this._superposeBox);
                this._superposeBox.destroy();
                this._superposeBox = null;
            }
            if (this._blurCache) {
                this._blurCache.clear();
                this._blurCache = null;
            }
            // Close modal
            if (!suppressOnClose && typeof this._onClose === 'function') {
                this._onClose(this._getCurrentState());
            }
            super.close();
        }
    });
}
