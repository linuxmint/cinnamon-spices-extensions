const ByteArray = imports.byteArray;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const SignalManager = imports.misc.signalManager;
const Signals = imports.signals;
const {globalLogger: logger} = require('src/logger');
const {callSafely, delayQueue} = require('src/utils');

class ScreenWatcher {
    constructor(metaScreen, rrScreen) {
        this._metaScreen = metaScreen;
        this._rrScreen = rrScreen;
    }

    register() {
        this._outputsRect = new Map();
        this._pendingMonitors = new Map();
        this._signalManager = new SignalManager.SignalManager(null);

        this._loading = true;
        try {
            this._signalManager.connect(this._rrScreen, 'changed', this._onRRScreenChanged);
            this._signalManager.connect(
                this._metaScreen,
                'monitors-changed',
                delayQueue(1000, this._onMonitorsChanged)
            );

            this._onRRScreenChanged(this._rrScreen);
        } finally {
            this._loading = false;
        }
    }

    unregister() {
        if (this._signalManager) {
            this._signalManager.disconnectAllSignals();
            this._signalManager = null;
        }
    }

    _onRRScreenChanged = () => {
        // NOTE: Can't use RROutput.get_position because it requires output arguments (not available with CJS).
        // So instead call the xrandr command :'(
        const rrOutputsRect = this._captureRROutputsRect();

        const rrOutputs = this._rrScreen.list_outputs();
        for (const rrOutput of rrOutputs) {
            const name = rrOutput.get_name();
            const rect = rrOutputsRect[name];
            const prevRect = this._outputsRect.get(name);

            if (rect) {
                this._outputsRect.set(name, rect);
                if (!prevRect && !this._loading) {
                    callSafely(() => this._onOutputConnected(name, rect));
                }
            } else if (prevRect) {
                this._outputsRect.delete(name);
                if (!this._loading) {
                    callSafely(() => this._onOutputDisconnected(name, prevRect));
                }
            }
        }
    };

    _onOutputConnected = (name, rect) => {
        const monitorIndex = this._getMonitorIndexAt(rect.x, rect.y);
        logger.log(`Output connected: ${name} (x: ${rect.x}, y: ${rect.y}, index: ${monitorIndex})`);

        const monitorChangeCancelled = this._pendingMonitors.has(name);
        if (monitorChangeCancelled) {
            this._pendingMonitors.delete(name);
        } else {
            this._pendingMonitors.set(name, {connected: true, rect});
        }

        this.emit('output-connected', {outputName: name, monitorRect: rect, monitorIndex, monitorChangeCancelled});
    };

    _onOutputDisconnected = (name, rect) => {
        const monitorIndex = this._getMonitorIndexAt(rect.x, rect.y);
        logger.log(`Output disconnected: ${name} (x: ${rect.x}, y: ${rect.y}, index: ${monitorIndex})`);

        const monitorChangeCancelled = this._pendingMonitors.has(name);
        if (monitorChangeCancelled) {
            this._pendingMonitors.delete(name);
        } else {
            this._pendingMonitors.set(name, {connected: false, rect});
        }

        this.emit('output-disconnected', {outputName: name, monitorRect: rect, monitorIndex, monitorChangeCancelled});
    };

    _onMonitorsChanged = () => {
        try {
            logger.log(
                `Monitors changed (${
                    !this._pendingMonitors.size
                        ? 'no changed outputs'
                        : `changed outputs: ${[...this._pendingMonitors.keys()].join(', ')}`
                })`
            );

            for (const [name, {connected, rect}] of this._pendingMonitors.entries()) {
                if (connected) {
                    callSafely(() => this._onMonitorLoaded(name, rect));
                } else {
                    callSafely(() => this._onMonitorUnloaded(name, rect));
                }
            }
        } finally {
            this._pendingMonitors.clear();
        }
    };

    _onMonitorLoaded = (name, rect) => {
        const monitorIndex = this._getMonitorIndexAt(rect.x, rect.y);
        logger.log(`Monitor loaded: ${name} (x: ${rect.x}, y: ${rect.y}, index: ${monitorIndex})`);

        this.emit('monitor-loaded', {outputName: name, monitorRect: rect, monitorIndex});
    };

    _onMonitorUnloaded = (name, rect) => {
        const monitorIndex = this._getMonitorIndexAt(rect.x, rect.y);
        logger.log(`Monitor unloaded: ${name} (x: ${rect.x}, y: ${rect.y}, index: ${monitorIndex})`);

        this.emit('monitor-unloaded', {outputName: name, monitorRect: rect, monitorIndex});
    };

    _captureRROutputsRect = () => {
        let [, xrandrStdout] = GLib.spawn_command_line_sync('xrandr --current');
        xrandrStdout = xrandrStdout ? ByteArray.toString(xrandrStdout) : '';

        // See xrandr output sources: https://github.com/freedesktop/xorg-xrandr/blob/8969b3c651eaae3e3a2370ec45f4eeae9750111d/xrandr.c#L3697
        const pattern =
            /^([^ ]+) (?:connected|disconnected|unknown connection)(?: primary)? ([0-9]+)x([0-9]+)\+(-?[0-9]+)\+(-?[0-9]+)/gm;
        const ret = {};
        for (const [_, name, width, height, x, y] of xrandrStdout.matchAll(pattern)) {
            ret[name] = {x: parseInt(x), y: parseInt(y), width: parseInt(width), height: parseInt(height)};
        }
        return ret;
    };

    _getMonitorIndexAt = (x, y) => {
        const rect = new Meta.Rectangle();
        rect.x = x;
        rect.y = y;
        rect.width = 1;
        rect.height = 1;
        return this._metaScreen.get_monitor_index_for_rect(rect);
    };
}

Signals.addSignalMethods(ScreenWatcher.prototype);

module.exports = {ScreenWatcher};
