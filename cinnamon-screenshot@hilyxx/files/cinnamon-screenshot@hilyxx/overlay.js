// === IMPORTS & CONSTANTS ===
const ModalDialog = imports.ui.modalDialog;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const { _ } = require('./translation');

const Overlay = { showOverlay };
const ICONS_PATH = __meta.path + '/icons/';

const BTN_POINTER = 32;
const BTN_TIMER_W = 34, BTN_TIMER_H = 16;

let dialog = null;
let timerValue = 0; // default value

// === MAIN OVERLAY FUNCTION ===
function showOverlay(onOptionSelected, mousePointerVisible, saveCallback) {
    if (dialog) return;

    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    dialog = new ModalDialog.ModalDialog({ styleClass: 'overlay', destroyOnClose: true, cinnamonReactive: true });
    dialog.connect('closed', () => {
        dialog = null;
        timerValue = 0;
    });
    // Use the passed mouse pointer visibility state
    let currentMousePointerVisible = mousePointerVisible !== undefined ? mousePointerVisible : true;

    // === MAIN CONTENT BOX ===
    const contentBox = new St.BoxLayout({ vertical: true, style_class: 'overlay-content-box' });
    const cameraIconSize = 34;
    const cameraIcon = new St.Icon({
        gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'screenshot-symbolic.svg') }),
        style_class: 'overlay-camera-icon',
        icon_size: (scale <= 1) ? cameraIconSize : Math.floor(cameraIconSize * scale * 0.5)
    });
    contentBox.add_child(cameraIcon);

    const label = new St.Label({ text: 'Cinnamon-Screenshot', style_class: 'overlay-title-label' });
    contentBox.add_child(label);
    dialog.contentLayout.add_child(contentBox);

    // === CREATE MAIN OVERLAY UI ===
    const buttons = [
        { label: _("Full Screen"), mode: 'full', styleClass: 'overlay-custom-button' },
        { label: _("Active Window"), mode: 'window', styleClass: 'overlay-custom-button' },
        { label: _("Selection"), mode: 'selection', styleClass: 'overlay-custom-button' },
        { label: _("Close"), mode: null, styleClass: 'overlay-custom-button close' }
    ];

    const buttonBox = new St.BoxLayout({ vertical: true, style_class: 'overlay-button-box' });
    contentBox.add(buttonBox, { y_align: St.Align.END, y_fill: false });

    for (const buttonInfo of buttons) {
        const button = new St.Button({
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
                    onOptionSelected(buttonInfo.mode, timerValue, currentMousePointerVisible);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

        if (buttonInfo.label === _("Close")) {
            const mousePointerRow = new St.BoxLayout({ vertical: false, style_class: 'overlay-mouse-pointer-row' });
            const mousePointerLabel = new St.Label({ text: _("Mouse Pointer :"), style_class: 'overlay-mouse-pointer-label' });

            const mousePointerButton = new St.Button({ style_class: 'overlay-mouse-pointer-toggle', x_expand: false });
            mousePointerButton.set_size(BTN_POINTER * scale, BTN_POINTER * scale);
            
            const pointerIconFile = new Gio.FileIcon({
                file: Gio.File.new_for_path(ICONS_PATH + 'pointer-symbolic.svg')
            });
            const noPointerIconFile = new Gio.FileIcon({
                file: Gio.File.new_for_path(ICONS_PATH + 'no-pointer-symbolic.svg')
            });  
            const mouseIconSize = 24;
            const mousePointerIcon = new St.Icon({ 
                gicon: currentMousePointerVisible ? pointerIconFile : noPointerIconFile,
                icon_size: (scale <= 1) ? mouseIconSize : Math.floor(BTN_POINTER * scale * 0.4)
            });
            mousePointerButton.set_child(mousePointerIcon);
            
            // Set initial color based on state
            if (currentMousePointerVisible) {
                mousePointerIcon.set_style('color: #4caf50;');
            } else {
                mousePointerIcon.set_style('color: rgba(135,135,135,0.87);');
            }
            
            mousePointerButton.connect('clicked', () => {
                currentMousePointerVisible = !currentMousePointerVisible;
                // Save to settings
                if (saveCallback) {
                    saveCallback(currentMousePointerVisible);
                }
                if (currentMousePointerVisible) {
                    mousePointerIcon.set_gicon(pointerIconFile);
                    mousePointerIcon.set_style('color: #4caf50;');
                } else {
                    mousePointerIcon.set_gicon(noPointerIconFile);
                    mousePointerIcon.set_style('color: rgba(135,135,135,0.87);');
                }
            });

            mousePointerRow.add_child(mousePointerLabel);
            mousePointerRow.add_child(mousePointerButton);
            buttonBox.add_child(mousePointerRow);
        }

        buttonBox.add_child(button);

        if (buttonInfo.label === _("Selection")) {
            const timerRow = new St.BoxLayout({ vertical: false, style_class: 'overlay-timer-row' });
            const timerLabel = new St.Label({ text: _("Timer (s) :"), style_class: 'overlay-timer-label' });
            const timerIconSize = 18;

            const minusButton = new St.Button({ style_class: 'overlay-timer-minus', x_expand: false });
            minusButton.set_size(BTN_TIMER_W * scale, BTN_TIMER_H * scale);

            const minusIcon = new St.Icon({ 
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'timer-decrease-symbolic.svg') }),
                icon_size: (scale <= 1) ? timerIconSize : Math.floor(Math.min(BTN_TIMER_W * scale, BTN_TIMER_H * scale) * 0.6)
            });
            minusButton.set_child(minusIcon);

            const plusButton = new St.Button({ style_class: 'overlay-timer-plus', x_expand: false });
            plusButton.set_size(BTN_TIMER_W * scale, BTN_TIMER_H * scale);

            const plusIcon = new St.Icon({ 
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'timer-increase-symbolic.svg') }),
                icon_size: (scale <= 1) ? timerIconSize : Math.floor(Math.min(BTN_TIMER_W * scale, BTN_TIMER_H * scale) * 0.6)
            });
            plusButton.set_child(plusIcon);
            
            const separator = new St.BoxLayout({ vertical: true, style_class: 'overlay-timer-separator' });
            
            const resetButton = new St.Button({ style_class: 'overlay-timer-reset', x_expand: false });
            resetButton.set_size(BTN_TIMER_W * scale, BTN_TIMER_H * scale);

            const resetIcon = new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'timer-reset-symbolic.svg') }),
                icon_size: (scale <= 1) ? timerIconSize : Math.floor(Math.min(BTN_TIMER_W * scale, BTN_TIMER_H * scale) * 0.6)
            });
            resetButton.set_child(resetIcon);

            const valueLabel = new St.Label({ text: timerValue.toString(), style_class: 'overlay-timer-value' });

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
            timerRow.add_child(separator);
            timerRow.add_child(resetButton);
            buttonBox.add_child(timerRow);
        }
    }

    dialog.connect('key-press-event', (event) => {
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
