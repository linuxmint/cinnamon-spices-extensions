const
  Main = imports.ui.main,
  Settings = imports.ui.settings;

let
  settings,
  attentionHandler,
  oldHandler;

class SettingsHandler {
  constructor(uuid) {
    this.settings = new Settings.ExtensionSettings(this, uuid);
    this.settings.bindProperty(Settings.BindingDirection.IN, "raiseSome", "raiseSome", function () { });
    this.settings.bindProperty(Settings.BindingDirection.IN, "programList", "programList", function () { });
    this.settings.bindProperty(Settings.BindingDirection.IN, "excludeList", "excludeList", function () { });
  }
}

class AttentionHandler {
  _parseList(listString) {
    return listString.toLowerCase().replace(/\s/g, "").split(",");
  }

  init() {
    if (Main.windowAttentionHandler._windowDemandsAttentionId) {
      global.display.disconnect(Main.windowAttentionHandler._windowDemandsAttentionId);
      Main.windowAttentionHandler._windowDemandsAttentionId = null;
    }

    if (Main.windowAttentionHandler._windowMarkedUrgentId) {
      global.display.disconnect(Main.windowAttentionHandler._windowMarkedUrgentId);
      Main.windowAttentionHandler._windowMarkedUrgentId = null;
    }

    oldHandler = Main.windowAttentionHandler;

    this._windowDemandsAttentionId = global.display.connect('window-demands-attention', this._onWindowDemandsAttention.bind(this));
    this._windowMarkedUrgentId = global.display.connect('window-marked-urgent', this._onWindowDemandsAttention.bind(this));

    Main.windowAttentionHandler = attentionHandler;
  }

  _onWindowDemandsAttention(display, window) {
    if (!window || window.has_focus() || window.is_skip_taskbar() || !Main.isInteresting(window)) {
      return;
    }

    let wmclass = window.get_wm_class();
    if (!wmclass) {
      return;
    }

    if (settings.raiseSome) {
      // Include mode: only activate windows from programs in the list
      let programList = this._parseList(settings.programList);
      if (programList.includes(wmclass.toLowerCase())) {
        window.activate(global.get_current_time());
        return;
      }
    }
    else {
      // Exclude mode: activate all windows except those in the exclude list
      let excludeList = this._parseList(settings.excludeList);
      if (!excludeList.includes(wmclass.toLowerCase())) {
        window.activate(global.get_current_time());
        return;
      }
    }

    // Fallback: check global ignored classes
    let ignored_classes = global.settings.get_strv("demands-attention-passthru-wm-classes");
    for (let i = 0; i < ignored_classes.length; i++) {
      if (wmclass.toLowerCase().includes(ignored_classes[i].toLowerCase())) {
        window.activate(global.get_current_time());
        return;
      }
    }
  }

  _destroy() {
    global.display.disconnect(this._windowDemandsAttentionId);
    global.display.disconnect(this._windowMarkedUrgentId);
  }

  disable() {
    attentionHandler._destroy();
    attentionHandler = null;

    oldHandler._windowDemandsAttentionId = global.display.connect('window-demands-attention', oldHandler._onWindowDemandsAttention.bind(oldHandler));
    oldHandler._windowMarkedUrgentId = global.display.connect('window-marked-urgent', oldHandler._onWindowDemandsAttention.bind(oldHandler));

    Main.windowAttentionHandler = oldHandler;
  }
}

function init(metadata) {
  settings = new SettingsHandler(metadata.uuid);
  attentionHandler = new AttentionHandler();
}

function disable() {
  attentionHandler.disable();
}

function enable() {
  attentionHandler.init();
}
