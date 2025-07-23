// === IMPORTS & CONSTANTS ===
const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const messageTray = imports.ui.messageTray;
const St = imports.gi.St;
const { _ } = require('./translation');
const { isPngReadable } = require('./preview');

const Screenshot = { takeScreenshot };

// === TIMER OVERLAY STATE ===
let timerOverlayLabel = null;
let timerOverlayTimeoutId = null;

// === TIMER OVERLAY DISPLAY ===
function showTimerOverlay(seconds, onFinish) {
    if (timerOverlayLabel) {
        global.stage.remove_child(timerOverlayLabel);
        timerOverlayLabel.destroy();
        timerOverlayLabel = null;
    }
    timerOverlayLabel = new St.Label({
        text: `${seconds}`,
        style_class: 'screenshot-timer-overlay-label'
    });
    timerOverlayLabel.set_x_align(St.Align.MIDDLE);
    timerOverlayLabel.set_y_align(St.Align.MIDDLE);
    timerOverlayLabel.set_x_expand(true);
    timerOverlayLabel.set_y_expand(true);
    global.stage.add_child(timerOverlayLabel);
    let remaining = seconds;
    timerOverlayTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        remaining--;
        if (remaining > 0) {
            timerOverlayLabel.set_text(`${remaining}`);
            timerOverlayLabel.queue_redraw();
            return GLib.SOURCE_CONTINUE;
        } else {
            global.stage.remove_child(timerOverlayLabel);
            timerOverlayLabel.destroy();
            timerOverlayLabel = null;
            timerOverlayTimeoutId = null;
            if (onFinish) onFinish();
            return GLib.SOURCE_REMOVE;
        }
    });
}

// === CLEAR TIMER OVERLAY ===
function clearTimerOverlay() {
    if (timerOverlayLabel) {
        global.stage.remove_child(timerOverlayLabel);
        timerOverlayLabel.destroy();
        timerOverlayLabel = null;
    }
    if (timerOverlayTimeoutId) {
        GLib.source_remove(timerOverlayTimeoutId);
        timerOverlayTimeoutId = null;
    }
}

// === MAIN SCREENSHOT LOGIC ===
function takeScreenshot(type, timer, mouse, callback) {
    if (!GLib.find_program_in_path('gnome-screenshot')) {
        const source = new messageTray.SystemNotificationSource();
        Main.messageTray.add(source);
        const notification = new messageTray.Notification(
            source,
            _('Cinnamon-Screenshot extension error'),
            _('"Gnome-screenshot" utility is not installed. Please install it for the extension to work.')
        );
        notification.setResident(true);
        notification.setTransient(false);
        source.notify(notification);
        callback(null);
        return;
    }

    // === CAPTURE LAUNCH FUNCTION ===
    const launchCapture = (skipTimer) => {
        const tmpDir = GLib.get_tmp_dir();
        
        // Generate filename with readable date and time (local time)
        const now = new Date();
        const timestamp = now.getFullYear() + '-' + 
                       String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(now.getDate()).padStart(2, '0') + '_' + 
                       String(now.getHours()).padStart(2, '0') + '-' + 
                       String(now.getMinutes()).padStart(2, '0') + '-' + 
                       String(now.getSeconds()).padStart(2, '0');
        
        const filename = tmpDir + '/Capture_' + timestamp + '.png';
        const args = ['gnome-screenshot'];

        if (type === 'window') args.push('-w');
        else if (type === 'selection') args.push('-a');
        // Only add -d for selection, or if skipTimer is false
        if (type === 'selection' && timer && timer > 0) {
            args.push('-d');
            args.push(timer.toString());
        }
        // Add mouse pointer option
        if (mouse) {
            args.push('--include-pointer');
        }
        args.push('-f');
        args.push(filename);

        global.log('CS: using gnome-screenshot: ' + args.join(' '));
        const delay = (type === 'window') ? 350 : 0;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            try {
                GLib.spawn_command_line_async(args.join(' '));
                if (type === 'selection') {
                    // === WAIT FOR FILE CREATION (SELECTION) ===
                    let elapsed = 0;
                    const interval = 75;
                    const maxWait = (timer && timer > 0) ? (timer * 1000 + 20000) : 20000;
                    const waitForFile = () => {
                        if (isPngReadable(filename)) {
                            callback(filename);
                        } else if (elapsed >= maxWait) {
                            global.log('CS: file not found after capture, no preview');
                            callback(null);
                        } else {
                            elapsed += interval;
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, waitForFile);
                        }
                        return GLib.SOURCE_REMOVE;
                    };
                    if (timer && timer > 0) {
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, timer * 1000, () => {
                            waitForFile();
                            return GLib.SOURCE_REMOVE;
                        });
                    } else {
                        waitForFile();
                    }
                } else {
                    // === WAIT FOR FILE CREATION (FULL/WINDOW) ===
                    let elapsed = 0;
                    const interval = 75;
                    const maxWait = (timer && timer > 0) ? (timer * 1000 + 10000) : 10000;
                    const waitForFile = () => {
                        if (isPngReadable(filename)) {
                            callback(filename);
                        } else if (elapsed >= maxWait) {
                            global.log('CS: file not found after capture, no preview');
                            callback(null);
                        } else {
                            elapsed += interval;
                            GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, waitForFile);
                        }
                        return GLib.SOURCE_REMOVE;
                    };
                    waitForFile();
                }
            } catch (e) {
                global.log('CS: error with gnome-screenshot: ' + e);
                callback(null);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    // === TIMER OVERLAY HANDLING ===
    if ((type === 'full' || type === 'window') && timer && timer > 0) {
        showTimerOverlay(timer, () => launchCapture(true));
    } else {
        launchCapture(false);
    }
}
