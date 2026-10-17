const { Gio, GLib } = imports.gi;
const Signals = imports.signals;

const BUS_NAME = 'org.cinnamonisland.Engine';
const OBJECT_PATH = '/org/cinnamonisland/Engine';
const TABS = ['Music', 'Volume', 'Pomodoro', 'Files', 'Notes', 'Clipboard', 'System', 'Weather', 'Notices', 'Lyrics', 'Timer', 'Tools', 'Inbox'];

// Client of the Python engine. Keeps the last state of each tab in `state`
// (null while the engine is not running), emits 'changed' with the tab name
// and 'connected' when the engine shows up.
class EngineClient {
    // `extensionDir` is the extension folder. If no engine is running, the
    // client starts one: directly, when the extension ships with the engine
    // inside it (engine/ folder, as in the Cinnamon store package), or by
    // asking systemd to start the user service, in the other installs.
    constructor(extensionDir) {
        this._bundledEngine = extensionDir + '/engine';
        this._process = null;
        this.state = {};
        this.connected = false;
        this._bus = Gio.DBus.session;
        this._subscriptions = [];

        for (let tab of TABS) {
            this.state[tab] = null;
            this._subscriptions.push(this._bus.signal_subscribe(
                BUS_NAME, BUS_NAME + '.' + tab, 'StateChanged', OBJECT_PATH, null,
                Gio.DBusSignalFlags.NONE,
                (connection, sender, path, iface, signal, parameters) =>
                    this._setState(tab, parameters.deep_unpack()[0])));
        }

        // Sound levels arrive through their own signal, several times per
        // second; they become the 'levels' event.
        this._subscriptions.push(this._bus.signal_subscribe(
            BUS_NAME, BUS_NAME + '.Music', 'Levels', OBJECT_PATH, null,
            Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal, parameters) =>
                this.emit('levels', parameters.deep_unpack()[0])));

        // The wheel turned over the file shelf arrives through the engine
        // (there the mouse goes to its invisible window).
        this._subscriptions.push(this._bus.signal_subscribe(
            BUS_NAME, BUS_NAME + '.Files', 'Scrolled', OBJECT_PATH, null,
            Gio.DBusSignalFlags.NONE,
            (connection, sender, path, iface, signal, parameters) =>
                this.emit('shelf-scrolled', parameters.deep_unpack()[0])));

        this._watchId = Gio.bus_watch_name(
            Gio.BusType.SESSION, BUS_NAME, Gio.BusNameWatcherFlags.NONE,
            () => this._onAppeared(), () => this._onVanished());
    }

    _setState(tab, json) {
        try {
            this.state[tab] = JSON.parse(json);
        } catch (e) {
            global.logError('Cinnamon Island: invalid state for tab ' + tab + ': ' + e);
            return;
        }
        this.emit('changed', tab);
    }

    _onAppeared() {
        this.connected = true;
        this._startRequested = false;
        this.emit('connected');
        for (let tab of TABS) {
            this._bus.call(
                BUS_NAME, OBJECT_PATH, BUS_NAME + '.' + tab, 'GetState', null,
                new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, -1, null,
                (bus, result) => {
                    try {
                        this._setState(tab, bus.call_finish(result).deep_unpack()[0]);
                    } catch (e) {
                        global.logError('Cinnamon Island: failed to read tab ' + tab + ': ' + e);
                    }
                });
        }
    }

    _startEngine() {
        if (this._process || this._startRequested || this._checking)
            return;
        // Is the engine shipped inside the extension? (Asked without blocking.)
        this._checking = true;
        let main = Gio.File.new_for_path(this._bundledEngine + '/cinnamon_island_engine/__main__.py');
        main.query_info_async('standard::type', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (file, result) => {
            this._checking = false;
            let bundled = true;
            try {
                file.query_info_finish(result);
            } catch (e) {
                bundled = false;
            }
            if (!this._destroyed && !this.connected)
                this._launchEngine(bundled);
        });
    }

    _launchEngine(bundled) {
        if (this._process || this._startRequested)
            return;
        if (!bundled) {
            // The service does not start by itself at login: the Cinnamon
            // session does not activate the systemd graphical-session.target.
            // The island is what starts the engine, when it loads.
            this._startRequested = true;
            try {
                Gio.Subprocess.new(['systemctl', '--user', 'start', 'cinnamon-island-engine.service'], Gio.SubprocessFlags.NONE);
            } catch (e) {
                global.logError('Cinnamon Island: could not start the engine service: ' + e);
            }
            return;
        }
        try {
            let launcher = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.NONE });
            launcher.setenv('PYTHONPATH', this._bundledEngine, true);
            // Without this, Python would also look for modules in the folder
            // it was started from (the home folder), ahead of the system ones.
            launcher.setenv('PYTHONSAFEPATH', '1', true);
            this._process = launcher.spawnv(['python3', '-m', 'cinnamon_island_engine']);
        } catch (e) {
            global.logError('Cinnamon Island: could not start the engine: ' + e);
        }
    }

    _onVanished() {
        this.connected = false;
        this._startEngine();
        for (let tab of TABS) {
            this.state[tab] = null;
            this.emit('changed', tab);
        }
    }

    // Sends a command to an engine tab, e.g.: call('Volume', 'SetVolume', new
    // GLib.Variant('(d)', [0.5])).
    call(tab, method, parameters = null) {
        if (!this.connected)
            return;
        this._bus.call(
            BUS_NAME, OBJECT_PATH, BUS_NAME + '.' + tab, method, parameters, null,
            Gio.DBusCallFlags.NONE, -1, null,
            (bus, result) => {
                try {
                    bus.call_finish(result);
                } catch (e) {
                    global.logError('Cinnamon Island: ' + tab + '.' + method + ' failed: ' + e);
                }
            });
    }

    destroy() {
        this._destroyed = true;
        // An engine started by the extension ends together with it.
        if (this._process) {
            this._process.send_signal(15);
            this._process = null;
        }
        Gio.bus_unwatch_name(this._watchId);
        for (let id of this._subscriptions)
            this._bus.signal_unsubscribe(id);
    }
}
Signals.addSignalMethods(EngineClient.prototype);

module.exports = { EngineClient };
