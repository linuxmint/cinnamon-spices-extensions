/*
 * Notification Filter - Cinnamon extension
 * Modes for selected apps:
 *   silent           – show without sound
 *   silent-transient – show without sound, don't keep in history
 *   hide             – fully drop (app still gets success reply)
 */

const Main = imports.ui.main;
const Settings = imports.ui.settings;
const GLib = imports.gi.GLib;

let filter = null;

class NotificationFilter {
  constructor(uuid) {
    this.uuid = uuid;
    this.blockedApps = "";
    this.logApps = true;
    this.mode = "hide";
    this._counter = 0;
    this._daemon = null;
    this._orig = null;

    this.settings = new Settings.ExtensionSettings(this, uuid);
    this.settings.bindProperty(Settings.BindingDirection.IN, "blockedApps", "blockedApps", null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "logApps", "logApps", null);
    this.settings.bindProperty(Settings.BindingDirection.IN, "mode", "mode", null);
  }

  _blockedList() {
    return String(this.blockedApps).toLowerCase()
      .split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 0);
  }

  _isBlocked(appName, summary) {
    let list = this._blockedList();
    if (list.length === 0)
      return false;

    let app = appName.toLowerCase();
    let sum = summary.toLowerCase();

    if ((app && list.includes(app)) || (sum && list.includes(sum)))
      return true;

    for (let item of list) {
      if ((app && app.indexOf(item) !== -1) || (sum && sum.indexOf(item) !== -1))
        return true;
    }
    return false;
  }

  // Inject hints. Values must stay as GLib.Variant —
  // Cinnamon's NotifyAsync calls .deep_unpack() on each of them.
  _withHints(params, extra) {
    let newParams = params.slice();
    let oldHints = newParams[6] || {};
    let newHints = {};

    // Copy existing hints as-is (they are Variants)
    for (let key in oldHints) {
      if (Object.prototype.hasOwnProperty.call(oldHints, key))
        newHints[key] = oldHints[key];
    }

    // Add / override our hints as Variants
    if (extra.silent)
      newHints["suppress-sound"] = GLib.Variant.new("b", true);
    if (extra.transient)
      newHints["transient"] = GLib.Variant.new("b", true);

    newParams[6] = newHints;
    return newParams;
  }

  enable() {
    this._daemon = Main.notificationDaemon;
    if (!this._daemon || typeof this._daemon.NotifyAsync !== "function") {
      global.logError(this.uuid + ": notification daemon not found, nothing to filter");
      this._daemon = null;
      return;
    }

    this._orig = this._daemon.NotifyAsync;
    let self = this;

    this._daemon.NotifyAsync = function (params, invocation) {
      try {
        // params: [appName, replacesId, icon, summary, body, actions, hints, timeout]
        let appName = String(params[0] || "");
        let summary = String(params[3] || "");

        if (self.logApps)
          global.log(self.uuid + ": notification from app '" + appName + "', summary '" + summary + "'");

        if (self._isBlocked(appName, summary)) {
          let mode = self.mode || "hide";

          if (mode === "hide") {
            // Fully drop – app still receives a normal reply
            let id = (params[1] > 0) ? params[1] : (0x7fff0000 | (self._counter++ & 0xffff));
            invocation.return_value(GLib.Variant.new("(u)", [id]));
            if (self.logApps)
              global.log(self.uuid + ": HIDDEN '" + appName + "'");
            return;
          }

          if (mode === "silent-transient") {
            params = self._withHints(params, { silent: true, transient: true });
            if (self.logApps)
              global.log(self.uuid + ": SILENT+TRANSIENT '" + appName + "'");
          } else {
            // silent
            params = self._withHints(params, { silent: true, transient: false });
            if (self.logApps)
              global.log(self.uuid + ": SILENT '" + appName + "'");
          }
        }
      } catch (e) {
        global.logError(self.uuid + ": " + e);
      }
      return self._orig.call(self._daemon, params, invocation);
    };

    global.log(this.uuid + ": enabled, mode=" + this.mode);
  }

  disable() {
    if (this._daemon && this._orig)
      this._daemon.NotifyAsync = this._orig;
    this._daemon = null;
    this._orig = null;
    try { this.settings.finalize(); } catch (e) {}
    global.log(this.uuid + ": disabled");
  }
}

function init(metadata) {
  filter = new NotificationFilter(metadata.uuid);
}

function enable() {
  filter.enable();
}

function disable() {
  filter.disable();
  filter = null;
}
