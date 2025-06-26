const ModalDialog = imports.ui.modalDialog;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const Overlay = { showOverlay, hideOverlay };

let dialog = null;
let timerValue = 0; // default value

function showOverlay(onOptionSelected) {
    if (dialog) return;

    const buttons = [
        { label: _("Full Screen"), mode: 'full', styleClass: 'overlay-custom-button' },
        { label: _("Active Window"), mode: 'window', styleClass: 'overlay-custom-button' },
        { label: _("Selection"), mode: 'selection', styleClass: 'overlay-custom-button' },
        { label: _("Cancel"), mode: null, styleClass: 'overlay-custom-button cancel-button' }
    ];

    dialog = new ModalDialog.ModalDialog({ styleClass: 'screenshot-overlay', destroyOnClose: true });
    dialog.connect('closed', () => {
        dialog = null;
        timerValue = 0;

    });

    let contentBox = new St.BoxLayout({ vertical: true, style_class: 'overlay-content-box' });

    let cameraIcon = new St.Icon({
        icon_name: 'screenshot-symbolic-symbolic',
        style_class: 'overlay-camera-icon',
        icon_size: 36
    });
    contentBox.add_child(cameraIcon);

    let label = new St.Label({ text: 'Cinnamon-Screenshot', style_class: 'overlay-title-label' });
    contentBox.add_child(label);
    dialog.contentLayout.add_child(contentBox);

    // --- Custom Buttons (vertical) ---
    let buttonBox = new St.BoxLayout({ vertical: true, style_class: 'overlay-button-box' });
    contentBox.add(buttonBox, { y_align: St.Align.END, y_fill: false });

    for (const buttonInfo of buttons) {
        let button = new St.Button({
            style_class: buttonInfo.styleClass,
            reactive: true,
            can_focus: true,
            label: buttonInfo.label,
            x_expand: true
        });
        button.connect('clicked', () => {
            dialog.close();
            if (buttonInfo.mode) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                    onOptionSelected(buttonInfo.mode, timerValue, false);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
        buttonBox.add_child(button);

        if (buttonInfo.label === _("Selection")) {
            let timerRow = new St.BoxLayout({ vertical: false, style_class: 'overlay-timer-row' });
            let timerLabel = new St.Label({ text: _("Timer (s) :"), style_class: 'overlay-timer-label' });
            let minusButton = new St.Button({ style_class: 'overlay-timer-minus', x_expand: false });
            let minusIcon = new St.Icon({ icon_name: 'timer-decrease-symbolic', icon_size: 16 });
            minusButton.set_child(minusIcon);
            let plusButton = new St.Button({ style_class: 'overlay-timer-plus', x_expand: false });
            let plusIcon = new St.Icon({ icon_name: 'timer-increase-symbolic', icon_size: 16 });
            plusButton.set_child(plusIcon);
            let resetButton = new St.Button({ style_class: 'overlay-timer-reset', x_expand: false });
            let resetIcon = new St.Icon({ icon_name: 'timer-reset-symbolic', icon_size: 16 });
            resetButton.set_child(resetIcon);
            let valueLabel = new St.Label({ text: timerValue.toString(), style_class: 'overlay-timer-value' });

            minusButton.connect('clicked', () => {
                if (timerValue > 0) {
                    timerValue--;
                    valueLabel.set_text(timerValue.toString());
                }
            });
            plusButton.connect('clicked', () => {
                if (timerValue < 60) {
                    timerValue++;
                    valueLabel.set_text(timerValue.toString());
                }
            });
            resetButton.connect('clicked', () => {
                timerValue = 0;
                valueLabel.set_text(timerValue.toString());
            });

            timerRow.add_child(timerLabel);
            timerRow.add_child(minusButton);
            timerRow.add_child(valueLabel);
            timerRow.add_child(plusButton);
            timerRow.add_child(resetButton);
            buttonBox.add_child(timerRow);
        }
    }

    dialog.connect('key-press-event', (actor, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            dialog.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    dialog.open();
}

function hideOverlay() {
    if (dialog) {
        dialog.close();
        dialog = null;
        timerValue = 0;

    }
}
