const ModalDialog = imports.ui.modalDialog;
const { St, Clutter, Gio, GLib, GdkPixbuf } = imports.gi;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;
const { _ } = require('./translation');

const Preview = { showScreenshotPreview };

function getPicturesDir() {
    return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)
        || GLib.get_home_dir() + '/Pictures';
}

var ScreenshotPreviewDialog = GObject.registerClass(
class ScreenshotPreviewDialog extends ModalDialog.ModalDialog {
    constructor(filepath, onSave, onOptionSelected, showBackButton = false) {
        super({ styleClass: 'preview' });

        this._filepath = filepath;
        this._onSave = onSave;
        this._onOptionSelected = onOptionSelected;
        this._showBackButton = showBackButton;
        this._tooltip = null;
        this._tooltipTimeoutId = null;

        // Size constants
        const modalWidth = 390;
        const modalHeight = 230;
        const maxW = 380;
        const maxH = 220;
        const entryWidth = modalWidth - 10; // visual margin

        this.set_width(modalWidth);
        this.set_height(modalHeight);

        let previewMainBox = new St.BoxLayout({ vertical: true, style_class: 'preview-content' });
        previewMainBox.set_width(modalWidth);
        previewMainBox.set_height(modalHeight);

        let buttonMainBox = new St.BoxLayout({ vertical: true, style_class: 'preview-content' });

        // Centered preview container
        let previewContainer = new St.BoxLayout({ vertical: true, y_expand: true });
        previewContainer.set_x_align(Clutter.ActorAlign.CENTER);
        previewContainer.set_y_align(Clutter.ActorAlign.CENTER);

        // Dynamic calculation of the image size
        let imgWidth = 400, imgHeight = 300;
        try {
            let pixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
            imgWidth = pixbuf.get_width();
            imgHeight = pixbuf.get_height();
        } catch (e) {
            global.log('cinnamon-screenshot: error reading image preview dimensions: ' + e);
        }
        let ratio = Math.min(maxW / imgWidth, maxH / imgHeight, 1);
        let previewW = Math.round(imgWidth * ratio);
        let previewH = Math.round(imgHeight * ratio);
        let texture = St.TextureCache.get_default().load_uri_async('file://' + filepath, previewW, previewH);
        let image = new St.Bin({ child: texture, style_class: 'preview-image' });
        image.set_width(previewW);
        image.set_height(previewH);
        image.set_x_align(Clutter.ActorAlign.CENTER);
        image.set_y_align(Clutter.ActorAlign.CENTER);
                
        previewContainer.add_child(image);
        
        // Picture size label
        let dimensionLabel = new St.Label({
            text: `${imgWidth} x ${imgHeight} px`,
            style_class: 'preview-dimensions-label'
        });
        dimensionLabel.set_x_align(Clutter.ActorAlign.CENTER);
        dimensionLabel.set_y_align(Clutter.ActorAlign.START);
        dimensionLabel.set_width(modalWidth / 1.25);

        // Clipboard Button
        let clipboardButton = new St.Button({ style_class: 'preview-clipboard-btn' });
        let clipboardIcon = new St.Icon({
            icon_name: 'capture-clipboard-symbolic',
            icon_size: 16,
            style_class: 'preview-clipboard-icon'
        });
        clipboardButton.set_child(clipboardIcon);
        clipboardButton.set_size(30, 30);
        this._clipboardIcon = clipboardIcon;
        clipboardButton.connect('clicked', () => {
            this._copyToClipboard();
        });

        // Tooltip
        this._tooltip = new St.Label({
            style_class: 'preview-tooltip',
            text: _('Copy to clipboard'),
            visible: false
        });
        global.stage.add_child(this._tooltip);
        this._tooltipTimeoutId = null;

        clipboardButton.connect('enter-event', (actor, event) => {
            // Cancel any previous timeout
            if (this._tooltipTimeoutId) {
                GLib.source_remove(this._tooltipTimeoutId);
                this._tooltipTimeoutId = null;
            }
            this._tooltipTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
                // Check that the button is still mapped, the mouse is over it, and no mouse button is pressed
                let [x, y, mods] = global.get_pointer();
                let actorAtPointer = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
                let isOverButton = false;
                while (actorAtPointer) {
                    if (actorAtPointer === clipboardButton) {
                        isOverButton = true;
                        break;
                    }
                    actorAtPointer = actorAtPointer.get_parent && actorAtPointer.get_parent();
                }
                // If the mouse is no longer over the button or a mouse button is pressed, do not show the tooltip
                if (isOverButton && !(mods & Clutter.ModifierType.BUTTON1_MASK) && this._tooltip) {
                    this._tooltip.set_position(x + 10, y + 10);
                    this._tooltip.show();
                }
                this._tooltipTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        });
        clipboardButton.connect('leave-event', () => {
            if (this._tooltipTimeoutId) {
                GLib.source_remove(this._tooltipTimeoutId);
                this._tooltipTimeoutId = null;
            }
            if (this._tooltip) this._tooltip.hide();
        });
        clipboardButton.connect('button-press-event', () => {
            if (this._tooltipTimeoutId) {
                GLib.source_remove(this._tooltipTimeoutId);
                this._tooltipTimeoutId = null;
            }
            if (this._tooltip) this._tooltip.hide();
        });

        // Cancel tooltip on global mouse button release
        this._cancelTooltip = () => {
            if (this._tooltipTimeoutId) {
                GLib.source_remove(this._tooltipTimeoutId);
                this._tooltipTimeoutId = null;
            }
            if (this._tooltip) this._tooltip.hide();
        };
        this._globalButtonReleaseId = global.stage.connect('button-release-event', () => {
            this._cancelTooltip();
        });

        // Text field
        let basename = GLib.path_get_basename(filepath);
        this._entry = new St.Entry({ text: basename, style_class: 'entry preview-entry' });
        this._entry.set_x_align(Clutter.ActorAlign.CENTER);
        this._entry.set_width(entryWidth);

        // Buttons
        let saveButton = new St.Button({
            label: _('Save as...'),
            style_class: 'dialog-button preview-save-btn'
        });
        saveButton.set_width(entryWidth);
        saveButton.connect('clicked', () => {
            this._openFileChooser();
        });

        let backButton = null;
        if (this._showBackButton) {
            backButton = new St.Button({
                label: _('Back'),
                style_class: 'dialog-button preview-back-btn'
            });
            backButton.set_width(entryWidth / 2);
            backButton.connect('clicked', () => {
                this._deleteTempFile();
                this.close();
                // Call the callback to return to overlay
                if (this._onOptionSelected) {
                    this._onOptionSelected();
                }
            });
        }

        let cancelButtonWidth = this._showBackButton ? (entryWidth / 2) : entryWidth;
        let cancelButton = new St.Button({
            label: _('Cancel'),
            style_class: 'dialog-button preview-cancel-btn'
        });
        cancelButton.set_width(cancelButtonWidth);
        if (backButton) {
            cancelButton.add_style_class_name('preview-cancel-with-back-btn');
        }
        cancelButton.connect('clicked', () => {
            this._deleteTempFile();
            this.close();
        });

        // Horizontal box for back and cancel buttons
        let backCancelBox = new St.BoxLayout({ vertical: false });
        backCancelBox.set_x_align(Clutter.ActorAlign.CENTER);
        backCancelBox.set_y_align(Clutter.ActorAlign.CENTER);
        
        if (backButton) {
            backCancelBox.add_child(backButton);
        }
        backCancelBox.add_child(cancelButton);
          
        // Horizontal box for dimensionLabel and clipboardButton
        let clipboardBox = new St.BoxLayout({ vertical: false, style_class: 'preview-clipboard-box' });
        clipboardBox.set_x_align(Clutter.ActorAlign.END);
        clipboardBox.set_y_align(Clutter.ActorAlign.START);

        clipboardBox.add_child(dimensionLabel);       
        clipboardBox.add_child(clipboardButton);

        // Vertical container for all widgets
        let buttonsContainer = new St.BoxLayout({ vertical: true, style_class: 'preview-buttons-box' });
        buttonsContainer.set_x_align(Clutter.ActorAlign.CENTER);
        buttonsContainer.set_y_align(Clutter.ActorAlign.START);

        buttonsContainer.add_child(clipboardBox);
        buttonsContainer.add_child(this._entry);
        buttonsContainer.add_child(saveButton);
        buttonsContainer.add_child(backCancelBox);

        // Add all in the contentLayout        
        buttonMainBox.add_child(buttonsContainer);
        previewMainBox.add_child(previewContainer);
        this.contentLayout.add_child(previewMainBox);
        this.contentLayout.add_child(buttonMainBox);
    }

    _openFileChooser() {
        this.close();
        let defaultName = this._entry.get_text();
        let picturesDir = getPicturesDir();
        let zenityPath = GLib.find_program_in_path('zenity');
        if (!zenityPath) {
            Main.notifyError(_('Zenity not available'), _('Unable to open file chooser.'));
            this._deleteTempFile();
            return;
        }
        let argv = [
            'zenity', '--file-selection', '--save',
            '--confirm-overwrite', '--filename', picturesDir + '/' + defaultName
        ];
        let proc = new Gio.Subprocess({
            argv: argv,
            flags: Gio.SubprocessFlags.STDOUT_PIPE
        });
        proc.init(null);
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [, stdout] = proc.communicate_utf8_finish(res);
                let filename = stdout.trim();
                if (filename) {
                    this._saveTo(filename);
                } else {
                    // Relaunch the preview properly
                    showScreenshotPreview(this._filepath, this._onSave, this._onOptionSelected, this._showBackButton);
                }
            } catch (e) {
                // Cancel or error: relaunch preview
                showScreenshotPreview(this._filepath, this._onSave, this._onOptionSelected, this._showBackButton);
            }
        });
    }

    _saveTo(destPath) {
        try {
            let file = Gio.File.new_for_path(this._filepath);
            let dest = Gio.File.new_for_path(destPath);
            file.move(dest, Gio.FileCopyFlags.OVERWRITE, null, null);
            this._onSave(destPath);
        } catch (e) {
            global.log(_('Error while saving screenshot: ') + e);
        }
        this.close();
    }

    _deleteTempFile() {
        // Delete the temporary file if it exists
        try {
            if (GLib.file_test(this._filepath, GLib.FileTest.EXISTS)) {
                GLib.unlink(this._filepath);
            }
        } catch (e) {
            global.log(_('Error deleting temp file: ') + e);
        }
    }

    _copyToClipboard() {
        try {
            let clipboard = St.Clipboard.get_default();
            let file = Gio.File.new_for_path(this._filepath);
            let [success, contents] = file.load_contents(null);
            if (!success) throw new Error('Failed to read image file');
            clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', contents);
            // Change icon to green on success
            if (this._clipboardIcon) {
                this._clipboardIcon.set_icon_name('succes-clipboard-symbolic');
                this._clipboardIcon.set_style('color: #4caf50;');
            }
            // Restore icon after 1s
            if (this._clipboardIcon) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                    this._clipboardIcon.set_icon_name('capture-clipboard-symbolic');
                    this._clipboardIcon.set_style('color: white;');
                    return GLib.SOURCE_REMOVE;
                });
            }
        } catch (e) {
            global.log(_('Error copying to clipboard: ') + e);
            Main.notifyError(_('Copy failed'), _('Unable to copy image to clipboard.'));
        }
    }

    close() {
        this._destroyTooltip();
        super.close();
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

let _currentDialog = null;

// Check that the PNG file is readable
function isPngReadable(filepath) {
    try {
        let pixbuf = GdkPixbuf.Pixbuf.new_from_file(filepath);
        return !!pixbuf;
    } catch (e) {
        return false;
    }
}

function showScreenshotPreview(filepath, onSave, onOptionSelected, showBackButton = false) {
    global.log('cinnamon-screenshot: showScreenshotPreview called with ' + filepath);
    if (_currentDialog) {
        _currentDialog.close();
        _currentDialog = null;
    }
    
    let createDialog = () => {
        _currentDialog = new ScreenshotPreviewDialog(filepath, (savedPath) => {
            global.log('cinnamon-screenshot: preview closed, final path = ' + savedPath);
            _currentDialog = null;
            onSave(savedPath);
        }, onOptionSelected, showBackButton);
        _currentDialog.open();
    };
    
    // Wait until the file is readable
    let elapsed = 0;
    let interval = 200;
    let maxWait = 2000;
    let waitForReadable = () => {
        if (isPngReadable(filepath) || elapsed >= maxWait) {
            if (elapsed >= maxWait) {
                global.log('cinnamon-screenshot: PNG not readable after delay, trying preview anyway');
            }
            createDialog();
        } else {
            elapsed += interval;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, waitForReadable);
        }
        return GLib.SOURCE_REMOVE;
    };
    waitForReadable();
}
