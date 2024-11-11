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
  }
}

class AttentionHandler {
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

    let
      programList = settings.programList.toLowerCase().replace(/\s/g, "").split(","),
      wmclass = window.get_wm_class();

    if (wmclass) {
      if (!settings.raiseSome) {
        window.activate(global.get_current_time());
        return;
      }
      else if (programList.includes(wmclass.toLowerCase()) && window.has_focus() === false) {
        window.activate(global.get_current_time());
        return;
      }
      else {
        let ignored_classes = global.settings.get_strv("demands-attention-passthru-wm-classes");

        for (let i = 0; i < ignored_classes.length; i++) {
          if (wmclass.toLowerCase().includes(ignored_classes[i].toLowerCase())) {
            window.activate(global.get_current_time());
            return;
          }
        }
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
