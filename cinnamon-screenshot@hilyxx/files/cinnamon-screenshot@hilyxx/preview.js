// === IMPORTS & CONSTANTS ===
const { St, Clutter, Gio, GLib, GdkPixbuf } = imports.gi;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;
const Layout = imports.ui.layout;
const ExtensionSystem = imports.ui.extensionSystem;

const { _ } = require('./translation');
const { ScreenshotEditDialog } = require('./editOverlay');

const UUID = 'cinnamon-screenshot@hilyxx';
const EXTENSION_DIR = ExtensionSystem.extensionMeta[UUID].path;

const ICONS_PATH = EXTENSION_DIR + '/icons/';
const scriptPath = EXTENSION_DIR + '/lib/gtk-filechooser.py';

const previewTempFileCache = {};

const BTN_TOOL = 30;

function getPicturesDir() {
    return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)
        || GLib.get_home_dir();
}

function queryInfoAsync(file, attributes) {
    return new Promise((resolve, reject) => {
        try {
            file.query_info_async(
                attributes,
                Gio.FileQueryInfoFlags.NONE,
                0,
                null,
                (source, res) => {
                    try {
                        const info = source.query_info_finish(res);
                        resolve(info);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

// === MAIN PREVIEW DIALOG CLASS ===
var ScreenshotPreviewDialog;
if (typeof ScreenshotPreviewDialog !== 'function') {
    ScreenshotPreviewDialog = GObject.registerClass({
        GTypeName: `ScreenshotPreviewDialog_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    }, class ScreenshotPreviewDialog extends St.Widget {
        
        _init(filepath, onSave, onOptionSelected, showBackButton = false, editState = null) {
            cleanupOldPreviewTempFiles();
            
            // Giant background covering all screens
            super._init({ 
                reactive: true,
                x: 0, y: 0,
                width: global.stage.width,
                height: global.stage.height,
                style_class: 'custom-fullscreen-bg'
            });

            // Block clicks below
            this.connect('button-press-event', () => Clutter.EVENT_STOP);
            this.connect('scroll-event', () => Clutter.EVENT_STOP);

            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;

            // Find the active monitor
            const [mouseX, mouseY] = global.get_pointer();
            let monitors = Main.layoutManager.monitors;
            let currentMonitor = monitors[0];
            for (let i = 0; i < monitors.length; i++) {
                if (mouseX >= monitors[i].x && mouseX < monitors[i].x + monitors[i].width &&
                    mouseY >= monitors[i].y && mouseY < monitors[i].y + monitors[i].height) {
                    currentMonitor = monitors[i];
                    break;
                }
            }

            // Centered container for the active monitor
            const monitorBox = new St.Widget({
                x: currentMonitor.x, y: currentMonitor.y,
                width: currentMonitor.width, height: currentMonitor.height,
                layout_manager: new Clutter.BinLayout()
            });
            this.add_child(monitorBox);

            const centerWrapper = new St.BoxLayout({
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'preview'
            });
            monitorBox.add_child(centerWrapper);

            // Container vertical principal
            const contentLayout = new St.BoxLayout({ vertical: true });
            centerWrapper.add_child(contentLayout);

            // Properties
            this._filepath = filepath;
            this._onSave = onSave;
            this._onOptionSelected = onOptionSelected;
            this._originalOnOptionSelected = onOptionSelected;
            this._showBackButton = showBackButton;
            this._editState = editState;
            this._tooltip = null;
            this._tooltipTimeoutId = null;

            // UI Dimensions
            const modalWidth = 390 * scale;
            const modalHeight = 230 * scale;
            const maxW = 380 * scale;
            const maxH = 220 * scale;
            const entryWidth = modalWidth - 10 * scale; 

            // Main layout boxes
            const previewMainBox = new St.BoxLayout({ vertical: true, style_class: 'preview-content' });
            previewMainBox.set_width(modalWidth);
            previewMainBox.set_height(modalHeight);

            const buttonMainBox = new St.BoxLayout({ vertical: true, style_class: 'preview-content' });

            // Preview image container
            const previewContainer = new St.BoxLayout({ vertical: true, y_expand: true });
            previewContainer.set_x_align(Clutter.ActorAlign.CENTER);
            previewContainer.set_y_align(Clutter.ActorAlign.CENTER);

            let imgWidth = 400, imgHeight = 300;
            let previewW = maxW, previewH = maxH;
            try {
                let origPixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
                imgWidth = origPixbuf.get_width();
                imgHeight = origPixbuf.get_height();
                const ratio = Math.min(maxW / imgWidth, maxH / imgHeight, 1);
                previewW = Math.round(imgWidth * ratio);
                previewH = Math.round(imgHeight * ratio);
            } catch (e) {
                global.log('CS: error reading image preview dimensions: ' + e);
            }
            const tempPath = getOrCreatePreviewTempFile(filepath, previewW, previewH);
            const texture = St.TextureCache.get_default().load_uri_async('file://' + tempPath, previewW, previewH);

            let image = new St.Bin({ style_class: 'preview-image' });
            image.set_width(previewW);
            image.set_height(previewH);
            image.set_x_align(Clutter.ActorAlign.CENTER);
            image.set_y_align(Clutter.ActorAlign.CENTER);
            image.set_child(texture);
            previewContainer.add_child(image);

            const dimensionLabel = new St.Label({
                text: `${imgWidth} x ${imgHeight} px`,
                style_class: 'preview-dimensions-label'
            });
            dimensionLabel.set_x_align(Clutter.ActorAlign.CENTER);
            dimensionLabel.set_y_align(Clutter.ActorAlign.START);
            dimensionLabel.set_width(modalWidth / 1.25);

            // Tools (Edit & Clipboard)
            const editButton = new St.Button({ style_class: 'preview-tool-btn' });
            const editIcon = new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'edit-symbolic.svg') }),
                icon_size: (scale <= 1) ? 24 : Math.floor(BTN_TOOL * scale * 0.4),
                style_class: 'preview-tool-icon'
            });
            editButton.set_child(editIcon);
            editButton.set_size(BTN_TOOL * scale, BTN_TOOL * scale);
            editButton.connect('clicked', () => {
                // Capture variables BEFORE closing the preview
                const currentFilepath = this._filepath;
                const currentOnSave = this._onSave;
                const currentOnOptionSelected = this._originalOnOptionSelected;
                const currentShowBackButton = this._showBackButton;
                const currentEditState = this._editState;

                this.close(); // Destroy the preview window

                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                    const overlay = new ScreenshotEditDialog(
                        currentFilepath, 
                        (newEditState) => {
                            showScreenshotPreview(currentFilepath, currentOnSave, currentOnOptionSelected, currentShowBackButton, newEditState);
                        }, 
                        currentEditState, 
                        null, // DO NOT PASS 'this' (it is destroyed!)
                        currentShowBackButton, 
                        currentOnOptionSelected 
                    );
                    overlay.open();
                    return GLib.SOURCE_REMOVE;
                });
            });

            const clipboardButton = new St.Button({ style_class: 'preview-tool-btn' });
            const clipboardIcon = new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'capture-clipboard-symbolic.svg') }),
                icon_size: (scale <= 1) ? 24 : Math.floor(BTN_TOOL * scale * 0.4),
                style_class: 'preview-tool-icon'
            });
            clipboardButton.set_child(clipboardIcon);
            clipboardButton.set_size(BTN_TOOL * scale, BTN_TOOL * scale);
            this._clipboardIcon = clipboardIcon;
            clipboardButton.connect('clicked', () => this._copyToClipboard());

            // Tooltips
            this._tooltip = new St.Label({ style_class: 'global-tooltip', text: '', visible: false });
            this.add_child(this._tooltip);
            this._tooltipTimeoutId = null;

            const attachTooltip = (btn, text) => {
                btn.connect('enter-event', () => {
                    if (this._tooltipTimeoutId) { GLib.source_remove(this._tooltipTimeoutId); this._tooltipTimeoutId = null; }
                    this._tooltipTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
                        const [x, y] = global.get_pointer();
                        if (this._tooltip) {
                            this._tooltip.set_text(text);
                            this._tooltip.set_position(x + 10, y + 10);
                            this._tooltip.show();
                        }
                        this._tooltipTimeoutId = null;
                        return GLib.SOURCE_REMOVE;
                    });
                });
                btn.connect('leave-event', () => {
                    if (this._tooltipTimeoutId) { GLib.source_remove(this._tooltipTimeoutId); this._tooltipTimeoutId = null; }
                    if (this._tooltip) this._tooltip.hide();
                });
            };
            attachTooltip(editButton, _('Edit image'));
            attachTooltip(clipboardButton, _('Copy to clipboard'));

            // Cancel Tooltip global
            this._cancelTooltip = () => {
                if (this._tooltipTimeoutId) { GLib.source_remove(this._tooltipTimeoutId); this._tooltipTimeoutId = null; }
                if (this._tooltip) this._tooltip.hide();
            };
            this._globalButtonReleaseId = global.stage.connect('button-release-event', () => this._cancelTooltip());

            // Entry and Save/Cancel buttons
            const basename = GLib.path_get_basename(filepath);
            this._entry = new St.Entry({ text: basename, style_class: 'entry preview-entry' });
            this._entry.set_x_align(Clutter.ActorAlign.CENTER);
            this._entry.set_width(entryWidth);

            const saveButton = new St.Button({ label: _('Save as...'), style_class: 'dialog-button preview-save-btn', can_focus: true });
            saveButton.set_width(entryWidth);
            saveButton.connect('clicked', () => this._openFileChooser());

            let backButton = null;
            if (this._showBackButton) {
                backButton = new St.Button({ label: _('Back'), style_class: 'dialog-button preview-back-btn', can_focus: true });
                backButton.set_width(entryWidth / 2);
                backButton.connect('clicked', () => {
                    this._deleteTempFile();
                    if (this._onOptionSelected) this._onOptionSelected();
                    this.close();
                });
            }

            const cancelButtonWidth = this._showBackButton ? (entryWidth / 2) : entryWidth;
            const cancelButton = new St.Button({ label: _('Cancel'), style_class: 'dialog-button preview-cancel-btn', can_focus: true });
            cancelButton.set_width(cancelButtonWidth);
            if (backButton) cancelButton.add_style_class_name('preview-cancel-with-back-btn');
            cancelButton.connect('clicked', () => { this._deleteTempFile(); this.close(); });

            const backCancelBox = new St.BoxLayout({ vertical: false });
            backCancelBox.set_x_align(Clutter.ActorAlign.CENTER);
            if (backButton) backCancelBox.add_child(backButton);
            backCancelBox.add_child(cancelButton);

            const clipboardBox = new St.BoxLayout({ vertical: false, style_class: 'preview-clipboard-box' });
            clipboardBox.set_x_align(Clutter.ActorAlign.CENTER);
            clipboardBox.add_child(editButton);
            clipboardBox.add_child(dimensionLabel);
            clipboardBox.add_child(clipboardButton);

            const buttonsContainer = new St.BoxLayout({ vertical: true, style_class: 'preview-buttons-box' });
            buttonsContainer.set_x_align(Clutter.ActorAlign.CENTER);
            buttonsContainer.add_child(clipboardBox);
            buttonsContainer.add_child(this._entry);
            buttonsContainer.add_child(saveButton);
            buttonsContainer.add_child(backCancelBox);

            buttonMainBox.add_child(buttonsContainer);
            previewMainBox.add_child(previewContainer);
            
            contentLayout.add_child(previewMainBox);
            contentLayout.add_child(buttonMainBox);

            this.connect('key-press-event', (actor, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {
                    this.close();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
        }

        _openFileChooser() {
            let defaultName = '';
            try {
                if (this._entry && typeof this._entry.get_text === 'function')
                    defaultName = this._entry.get_text();
            } catch (e) {
                global.log('CS: error accessing _entry: ' + e);
            }

            // Security: validate filename
            const invalidChars = new RegExp('[\\\\/:*?"<>|]', 'g');
            if (!defaultName || defaultName.trim().length === 0) {
                Main.notifyError(_('Invalid filename'), _('Filename cannot be empty.'));
                return; 
            }
            if (invalidChars.test(defaultName)) {
                Main.notifyError(_('Invalid filename'), _('Filename contains forbidden characters: \\ / : * ? " < > |'));
                return;
            }
            if (!/\.(png)$/i.test(defaultName)) {
                Main.notifyError(_('Invalid filename'), _('Filename must end with .png'));
                return;
            }

            // Capture variables before destruction
            const currentFilepath = this._filepath;
            const currentOnSave = this._onSave;
            const currentOnOptionSelected = this._originalOnOptionSelected;
            const currentShowBackButton = this._showBackButton;
            const currentEditState = this._editState;

            // Immediate close (object destruction)
            this.close();

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                // Wrapper asynchrone IIFE
                (async () => {
                    const picturesDir = getPicturesDir();
                    const file = Gio.File.new_for_path(scriptPath);
                    
                    try {
                        await queryInfoAsync(file, 'standard::type');
                    } catch (e) {
                        if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                            Main.notifyError(_('Script gtk-filechooser.py not available'), _('Unable to open file chooser.'));
                            showScreenshotPreview(currentFilepath, currentOnSave, currentOnOptionSelected, currentShowBackButton, currentEditState);
                            return;
                        }
                    }

                    const argv = [
                        'python3', scriptPath,
                        '--title', _('Save as...'),
                        '--filename', defaultName,
                        '--directory', picturesDir,
                        '--filter', _('Images'),
                        '--save-button', _('Save'),
                        '--cancel-button', _('Cancel')
                    ];

                    const proc = new Gio.Subprocess({
                        argv: argv,
                        flags: Gio.SubprocessFlags.STDOUT_PIPE
                    });
                    proc.init(null);

                    proc.communicate_utf8_async(null, null, (proc, res) => {
                        try {
                            const [, stdout] = proc.communicate_utf8_finish(res);
                            const filename = stdout.trim();
                            
                            if (filename) {
                                try {
                                    const sourceFile = Gio.File.new_for_path(currentFilepath);
                                    const destFile = Gio.File.new_for_path(filename);
                                    sourceFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                                    if (currentOnSave) currentOnSave(filename, currentEditState);
                                                                  
                                } catch (e) {
                                    global.log('CS: error while saving screenshot: ' + e);
                                }
                            } else {
                                // Cancelled by user: reopening preview interface
                                showScreenshotPreview(currentFilepath, currentOnSave, currentOnOptionSelected, currentShowBackButton, currentEditState);
                            }
                        } catch (e) {
                            global.log('CS: error gtk-filechooser.py: ' + e);
                            showScreenshotPreview(currentFilepath, currentOnSave, currentOnOptionSelected, currentShowBackButton, currentEditState);
                        }
                    });
                })().catch(err => global.logError('CS Error in _openFileChooser: ' + err));
                
                return GLib.SOURCE_REMOVE; 
            });
        }

        _deleteTempFile() {
            // Delete the temporary file if it exists
            try {
                if (GLib.file_test(this._filepath, GLib.FileTest.EXISTS)) {
                    GLib.unlink(this._filepath);
                }
            } catch (e) {
                global.log('CS: error deleting temp file: ' + e);
            }
        }

        // === CLIPBOARD COPY LOGIC ===
        _copyToClipboard() {
            try {
                const clipboard = St.Clipboard.get_default();
                const file = Gio.File.new_for_path(this._filepath);
                const [success, contents] = file.load_contents(null);
                if (!success) throw new Error('Failed to read image file');
                clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', contents);
                // Change icon to green on success
                if (this._clipboardIcon) {
                    const successIcon = new Gio.FileIcon({
                        file: Gio.File.new_for_path(ICONS_PATH + 'success-clipboard-symbolic.svg')
                    });
                    this._clipboardIcon.set_gicon(successIcon);
                    this._clipboardIcon.set_style('color: #4caf50;');
                }
                // Restore icon after 1s
                if (this._clipboardIcon) {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        const normalIcon = new Gio.FileIcon({
                            file: Gio.File.new_for_path(ICONS_PATH + 'capture-clipboard-symbolic.svg')
                        });
                        this._clipboardIcon.set_gicon(normalIcon);
                        this._clipboardIcon.set_style('color: white;');
                        return GLib.SOURCE_REMOVE;
                    });
                }
            } catch (e) {
                global.log('CS: error copying to clipboard: ' + e);
                Main.notifyError(_('Copy failed'), _('Unable to copy image to clipboard.'));
            }
        }

        // === OPEN/CLOSE DIALOG & TOOLTIP CLEANUP ===
        open() {
            Main.uiGroup.add_child(this);
            Main.pushModal(this);
            global.stage.set_key_focus(this);
        }

        close(returnedEditState = null) {
            cleanupOldPreviewTempFiles();
            this._destroyTooltip();
            if (this._onSave) {
                this._onSave(null, returnedEditState || this._editState);
            }
            
            Main.popModal(this);
            if (this.get_parent()) {
                this.get_parent().remove_child(this);
            }
            this.destroy();
        }

        _destroyTooltip() {
            if (this._tooltipTimeoutId) {
                GLib.source_remove(this._tooltipTimeoutId);
                this._tooltipTimeoutId = null;
            }
            if (this._tooltip) {
                this._tooltip.hide();
                this._tooltip.destroy();
                this._tooltip = null;
            }
            if (this._globalButtonReleaseId) {
                global.stage.disconnect(this._globalButtonReleaseId);
                this._globalButtonReleaseId = null;
            }
        }
    });
}

// === DIALOG INSTANCE MANAGEMENT ===
let _currentDialog = null;

// === PNG READABILITY CHECK ===
function isPngReadableAsync(filepath) {
    return (async () => {
        try {
            const file = Gio.File.new_for_path(filepath);
            const info = await queryInfoAsync(file, 'standard::size');
            const size = info.get_attribute_uint64('standard::size');

            if (size === 0) return false;
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
            return !!pixbuf;
        } catch (e) {
            return false;
        }
    })();
}

// === MAIN ENTRY POINT: SHOW PREVIEW DIALOG ===
function showScreenshotPreview(filepath, onSave, onOptionSelected, showBackButton = false, editState = null) {
    if (_currentDialog) {
        _currentDialog.close();
        _currentDialog = null;
    }
    
    const createDialog = () => {
        _currentDialog = new ScreenshotPreviewDialog(filepath, (savedPath, returnedEditState) => {
            _currentDialog = null;
            onSave(savedPath, returnedEditState);
        }, onOptionSelected, showBackButton, editState);
        _currentDialog.open();
    };
    
    let elapsed = 0;
    const interval = 75;
    const maxWait = 1500;
    let dialogPrepared = false;
    
    const waitForReadable = () => {
        (async () => {
            const isReadable = await isPngReadableAsync(filepath);
            if (isReadable || elapsed >= maxWait) {
                if (elapsed >= maxWait) {
                    global.log('CS: PNG not readable after delay, trying preview anyway');
                }
                createDialog();
            } else {
                elapsed += interval;
                
                // Prepare the dialog in parallel after 100ms
                if (!dialogPrepared && elapsed >= 100) {
                    dialogPrepared = true;
                    // Preload the image in the background
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
                        // asynchrone IIFE for the pre-load
                        (async () => {
                            try {
                                const cacheKey = getCacheKey(filepath);
                                if (!previewTempFileCache[cacheKey]) {
                                    // Pre-create the preview file
                                    const file = Gio.File.new_for_path(filepath);
                                    const info = await queryInfoAsync(file, 'standard::size');
                                    const size = info.get_attribute_uint64('standard::size');
                                    if (size > 0) {
                                        // Pre-create the preview cache
                                        getOrCreatePreviewTempFile(filepath, 380, 220);
                                    }
                                }
                            } catch (e) {
                            }
                        })().catch(err => global.logError('CS Error in preload: ' + err));
                        
                        return GLib.SOURCE_REMOVE;
                    });
                }
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, waitForReadable);
            }
        })().catch(err => {
            global.logError('CS Error in waitForReadable: ' + err);
        });
        
        return GLib.SOURCE_REMOVE;
    };
    waitForReadable();
}

// === UTILITY FUNCTIONS FOR PREVIEW CACHE ===
function getCacheKey(filepath) {
    try {
        const file = Gio.File.new_for_path(filepath);
        const info = file.query_info('time::modified,standard::size', 0, null);
        const mtime = info.get_attribute_uint64('time::modified');
        const size = info.get_attribute_uint64('standard::size');
        return filepath + '_' + mtime + '_' + size;
    } catch (e) {
        return filepath + '_0';
    }
}

function getOrCreatePreviewTempFile(filepath, previewW, previewH) {
    const cacheKey = getCacheKey(filepath);
    if (previewTempFileCache[cacheKey]) return previewTempFileCache[cacheKey];
    try {
        // Quick check before full loading
        const file = Gio.File.new_for_path(filepath);
        const info = file.query_info('standard::size', 0, null);
        const size = info.get_attribute_uint64('standard::size');
        if (size === 0) return filepath;
        
        let origPixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
        let scaled = origPixbuf.scale_simple(previewW, previewH, GdkPixbuf.InterpType.BILINEAR);
        const tmpPath = `/tmp/cinnamon-screenshot-preview_${GLib.get_real_time()}_${Math.floor(Math.random()*10000)}.png`;
        scaled.savev(tmpPath, 'png', [], []);
        previewTempFileCache[cacheKey] = tmpPath;
        return tmpPath;
        } catch (e) {
            if (!e.matches || !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                global.log('CS: error creating preview temp file: ' + e);
            }
            return filepath; // fallback
        }
}

function cleanupOldPreviewTempFiles() {
    try {
        const dir = Gio.File.new_for_path('/tmp');
        const files = [];
        const enumerator = dir.enumerate_children('standard::name,time::modified', 0, null);
        let info;
        let count = 0;
        const maxFiles = 5;
        
        while ((info = enumerator.next_file(null)) !== null && count < maxFiles) {
            const name = info.get_name();
            if (name.startsWith('cinnamon-screenshot-preview_') && name.endsWith('.png')) {
                files.push({
                    path: '/tmp/' + name,
                    mtime: info.get_attribute_uint64('time::modified')
                });
                count++;
            }
        }
        enumerator.close(null);
        
        if (files.length > 1) {
            files.sort((a, b) => b.mtime - a.mtime);
            // Keep only the most recent file
            for (let i = 1; i < files.length; i++) {
                try { GLib.unlink(files[i].path); } catch (e) {}
            }
        }
    } catch (e) {
        global.log('CS: error cleaning up preview temp files: ' + e);
    }
}
