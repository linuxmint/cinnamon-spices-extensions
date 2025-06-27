const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const messageTray = imports.ui.messageTray;
const St = imports.gi.St;
const { _ } = require('./translation');

const Screenshot = { takeScreenshot };

let timerOverlayLabel = null;
let timerOverlayTimeoutId = null;

function showTimerOverlay(seconds, onFinish) {
    if (timerOverlayLabel) {
        global.stage.remove_child(timerOverlayLabel);
        timerOverlayLabel.destroy();
        timerOverlayLabel = null;
    }
    timerOverlayLabel = new St.Label({
        text: `${seconds}`,
        style_class: 'overlay-timer-overlay-label'
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

function takeScreenshot(type, timer, mouse, callback) {
    if (!GLib.find_program_in_path('gnome-screenshot')) {
        let source = new messageTray.SystemNotificationSource();
        Main.messageTray.add(source);
        let notification = new messageTray.Notification(
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

    function launchCapture(skipTimer) {
        let tmpDir = GLib.get_tmp_dir();
        let filename = tmpDir + '/Capture_' + Date.now() + '.png';
        let args = ['gnome-screenshot'];

        if (type === 'window') args.push('-w');
        else if (type === 'selection') args.push('-a');
        // Only add -d for selection, or if skipTimer is false
        if (type === 'selection' && timer && timer > 0) {
            args.push('-d');
            args.push(timer.toString());
        }
        args.push('-f');
        args.push(filename);

        global.log('cinnamon-screenshot: using gnome-screenshot: ' + args.join(' '));
        let delay = (type === 'window') ? 350 : 0;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            try {
                GLib.spawn_command_line_async(args.join(' '));
                if (type === 'selection') {
                    let elapsed = 0;
                    let interval = 200;
                    let maxWait = (timer && timer > 0) ? (timer * 1000 + 20000) : 20000;
                    let waitForFile = () => {
                        if (GLib.file_test(filename, GLib.FileTest.EXISTS)) {
                            callback(filename);
                        } else if (elapsed >= maxWait) {
                            global.log('cinnamon-screenshot: file not found after capture, no preview');
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
                    let elapsed = 0;
                    let interval = 200;
                    let maxWait = (timer && timer > 0) ? (timer * 1000 + 10000) : 10000;
                    let waitForFile = () => {
                        if (GLib.file_test(filename, GLib.FileTest.EXISTS)) {
                            callback(filename);
                        } else if (elapsed >= maxWait) {
                            global.log('cinnamon-screenshot: file not found after capture, no preview');
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
                global.log('cinnamon-screenshot: error with gnome-screenshot: ' + e);
                callback(null);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    if ((type === 'full' || type === 'window') && timer && timer > 0) {
        showTimerOverlay(timer, () => launchCapture(true));
    } else {
        launchCapture(false);
    }
}

