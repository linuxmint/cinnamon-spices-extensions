const ModalDialog = imports.ui.modalDialog;
const { St, Clutter, Gio, GLib, GdkPixbuf } = imports.gi;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;

const Preview = { showScreenshotPreview };

function getPicturesDir() {
    return GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES)
        || GLib.get_home_dir() + '/Pictures';
}

var ScreenshotPreviewDialog = GObject.registerClass(
class ScreenshotPreviewDialog extends ModalDialog.ModalDialog {
    constructor(filepath, onSave) {
        super({ styleClass: 'preview' });

        this._filepath = filepath;
        this._onSave = onSave;

        // Size constants
        const modalWidth = 400;
        const modalHeight = 240;
        const maxW = 380;
        const maxH = 220;
        const entryWidth = modalWidth - 20; // visual margin

        this.set_width(modalWidth);
        this.set_height(modalHeight);

        let previewMainBox = new St.BoxLayout({ vertical: true, style_class: 'screenshot-preview-content' });
        previewMainBox.set_width(modalWidth);
        previewMainBox.set_height(modalHeight);

        let buttonMainBox = new St.BoxLayout({ vertical: true, style_class: 'screenshot-preview-content' });

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
        let image = new St.Bin({ child: texture, style_class: 'screenshot-preview-image' });
        image.set_width(previewW);
        image.set_height(previewH);
        image.set_x_align(Clutter.ActorAlign.CENTER);
        image.set_y_align(Clutter.ActorAlign.CENTER);
        previewContainer.add_child(image);

        // Add picture size label
        let dimensionLabel = new St.Label({
            text: `${imgWidth} x ${imgHeight} px`,
            style_class: 'screenshot-preview-dimensions-label'
        });
        dimensionLabel.set_x_align(Clutter.ActorAlign.CENTER);
        dimensionLabel.set_y_align(Clutter.ActorAlign.START);

        // Text field for the name
        let basename = GLib.path_get_basename(filepath);
        this._entry = new St.Entry({ text: basename, style_class: 'entry screenshot-preview-entry' });
        this._entry.set_x_align(Clutter.ActorAlign.CENTER);
        this._entry.set_width(entryWidth);

        let saveButton = new St.Button({
            label: _('Save as...'),
            style_class: 'dialog-button screenshot-preview-save-btn'
        });
        saveButton.set_width(entryWidth);
        saveButton.connect('clicked', () => {
            this._openFileChooser();
        });

        let cancelButton = new St.Button({
            label: _('Cancel'),
            style_class: 'dialog-button screenshot-preview-cancel-btn'
        });
        cancelButton.set_width(entryWidth);
        cancelButton.connect('clicked', () => {
            this._deleteTempFile();
            this.close();
        });

        // Vertical container for entry + buttons
        let buttonsBox = new St.BoxLayout({ vertical: true, style_class: 'screenshot-preview-buttons' });
        buttonsBox.set_x_align(Clutter.ActorAlign.CENTER);
        buttonsBox.set_y_align(Clutter.ActorAlign.START);
        buttonsBox.add_child(dimensionLabel);
        buttonsBox.add_child(this._entry);
        buttonsBox.add_child(saveButton);
        buttonsBox.add_child(cancelButton);
        buttonMainBox.add_child(buttonsBox);

        // Add all in the contentLayout
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
                    showScreenshotPreview(this._filepath, this._onSave);
                }
            } catch (e) {
                // Cancel or error: relaunch preview
                showScreenshotPreview(this._filepath, this._onSave);
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

function showScreenshotPreview(filepath, onSave) {
    global.log('cinnamon-screenshot: showScreenshotPreview called with ' + filepath);
    if (_currentDialog) {
        _currentDialog.close();
        _currentDialog = null;
    }
    // Wait until the file is readable
    let elapsed = 0;
    let interval = 200;
    let maxWait = 2000;
    let waitForReadable = () => {
        if (isPngReadable(filepath)) {
            _currentDialog = new ScreenshotPreviewDialog(filepath, (savedPath) => {
                global.log('cinnamon-screenshot: preview closed, final path = ' + savedPath);
                _currentDialog = null;
                onSave(savedPath);
            });
            _currentDialog.open();
        } else if (elapsed >= maxWait) {
            global.log('cinnamon-screenshot: PNG not readable after delay, trying preview anyway');
            _currentDialog = new ScreenshotPreviewDialog(filepath, (savedPath) => {
                global.log('cinnamon-screenshot: preview closed, final path = ' + savedPath);
                _currentDialog = null;
                onSave(savedPath);
            });
            _currentDialog.open();
        } else {
            elapsed += interval;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, waitForReadable);
        }
        return GLib.SOURCE_REMOVE;
    };
    waitForReadable();
}

