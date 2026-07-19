// === IMPORTS & CONSTANTS ===
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const ExtensionSystem = imports.ui.extensionSystem;
const { _ } = require('./translation');

const Overlay = { showOverlay };

const UUID = 'cinnamon-screenshot@hilyxx';

const EXTENSION_DIR = ExtensionSystem.extensionMeta[UUID].path;
const ICONS_PATH = EXTENSION_DIR + '/icons/';

const BTN_POINTER = 32;
const BTN_TIMER_W = 34, BTN_TIMER_H = 16;

let overlayWidget = null;
let timerValue = 0;

// === MAIN OVERLAY FUNCTION ===
function showOverlay(onOptionSelected, mousePointerVisible, saveCallback) {
    if (overlayWidget) return;

    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor || 1;
    let currentMousePointerVisible = mousePointerVisible !== undefined ? mousePointerVisible : true;

    // Giant background covering all screens
    overlayWidget = new St.Widget({
        reactive: true,
        x: 0, y: 0,
        width: global.stage.width,
        height: global.stage.height,
        style_class: 'custom-fullscreen-bg'
    });

    // Block clicks below
    overlayWidget.connect('button-press-event', () => Clutter.EVENT_STOP);
    overlayWidget.connect('button-release-event', () => Clutter.EVENT_STOP);
    overlayWidget.connect('scroll-event', () => Clutter.EVENT_STOP);

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

    // Container aligned to the active monitor with BinLayout to center its content
    const monitorBox = new St.Widget({
        x: currentMonitor.x,
        y: currentMonitor.y,
        width: currentMonitor.width,
        height: currentMonitor.height,
        layout_manager: new Clutter.BinLayout()
    });
    overlayWidget.add_child(monitorBox);

    // Centered wrapper for the content box
    const centerWrapper = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER
    });
    monitorBox.add_child(centerWrapper);

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
    
    centerWrapper.add_child(contentBox);

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
            const selectedTimer = timerValue;            
            hideOverlay();
            
            if (buttonInfo.mode) {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                    onOptionSelected(buttonInfo.mode, selectedTimer, currentMousePointerVisible);
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

        if (buttonInfo.label === _("Close")) {
            const mousePointerRow = new St.BoxLayout({ vertical: false, style_class: 'overlay-mouse-pointer-row' });
            const mousePointerLabel = new St.Label({ text: _("Mouse Pointer :"), style_class: 'overlay-mouse-pointer-label' });

            const mousePointerButton = new St.Button({ style_class: 'overlay-mouse-pointer-toggle', x_expand: false });
            mousePointerButton.set_size(BTN_POINTER * scale, BTN_POINTER * scale);
            
            const pointerIconFile = new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'pointer-symbolic.svg') });
            const noPointerIconFile = new Gio.FileIcon({ file: Gio.File.new_for_path(ICONS_PATH + 'no-pointer-symbolic.svg') });  
            const mouseIconSize = 24;
            const mousePointerIcon = new St.Icon({ 
                gicon: currentMousePointerVisible ? pointerIconFile : noPointerIconFile,
                icon_size: (scale <= 1) ? mouseIconSize : Math.floor(BTN_POINTER * scale * 0.4)
            });
            mousePointerButton.set_child(mousePointerIcon);
            
            if (currentMousePointerVisible) {
                mousePointerIcon.set_style('color: #4caf50;');
            } else {
                mousePointerIcon.set_style('color: rgba(135,135,135,0.87);');
            }
            
            mousePointerButton.connect('clicked', () => {
                currentMousePointerVisible = !currentMousePointerVisible;
                if (saveCallback) saveCallback(currentMousePointerVisible);
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
                if (timerValue > 0) { timerValue--; valueLabel.set_text(timerValue.toString()); }
            });
            plusButton.connect('clicked', () => {
                if (timerValue < 60) { timerValue++; valueLabel.set_text(timerValue.toString()); }
            });
            resetButton.connect('clicked', () => {
                timerValue = 0; valueLabel.set_text(timerValue.toString());
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

    // Escape key
    overlayWidget.connect('key-press-event', (actor, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            hideOverlay();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });

    Main.uiGroup.add_child(overlayWidget);
    Main.pushModal(overlayWidget);
    global.stage.set_key_focus(overlayWidget);
}

function hideOverlay() {
    if (overlayWidget) {
        Main.popModal(overlayWidget);
        if (overlayWidget.get_parent()) {
            overlayWidget.get_parent().remove_child(overlayWidget);
        }
        overlayWidget.destroy();
        overlayWidget = null;
        timerValue = 0;
    }
}
