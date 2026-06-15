const Main = imports.ui.main;
const BaseAppSwitcher = imports.ui.appSwitcher.appSwitcher;

const CustomSwitcherModule = require("./classic_switcher_windows_style");

let enabled = false;
let _originalCreateAppSwitcher = null;
let _previousStyle = null;

function init() {}

function enable() {
  if (enabled) return;

  if (!CustomSwitcherModule || !CustomSwitcherModule.WindowsClassicSwitcher) {
    Main.notify("Windows Alt+Tab", "Could not load the switcher.");
    return;
  }

  // --- Alt+Tab estilo Windows ---
  if (!_originalCreateAppSwitcher) {
    _originalCreateAppSwitcher = Main.wm._createAppSwitcher;
  }

  Main.wm._createAppSwitcher = function (binding) {
    if (BaseAppSwitcher.getWindowsForBinding(binding).length === 0) return;

    if (global.settings.get_string("alttab-switcher-style") === "windows") {
      new CustomSwitcherModule.WindowsClassicSwitcher(binding);
      return;
    }

    _originalCreateAppSwitcher.call(this, binding);
  };

  _previousStyle = global.settings.get_string("alttab-switcher-style");
  global.settings.set_string("alttab-switcher-style", "windows");

  enabled = true;
}

function disable() {
  if (!enabled) return;

  if (_originalCreateAppSwitcher) {
    Main.wm._createAppSwitcher = _originalCreateAppSwitcher;
  }

  if (
    _previousStyle !== null &&
    global.settings.get_string("alttab-switcher-style") === "windows"
  ) {
    global.settings.set_string("alttab-switcher-style", _previousStyle);
  }

  enabled = false;

  Main.notify("Windows Alt+Tab", "Windows-style switcher disabled.");
}
