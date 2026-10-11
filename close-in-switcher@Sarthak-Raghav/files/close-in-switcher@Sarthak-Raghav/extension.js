const AppSwitcherMod = imports.ui.appSwitcher.appSwitcher;
const Clutter = imports.gi.Clutter;

let _orig = null;

function init(metadata) {}

function enable() {
    if (!AppSwitcherMod.AppSwitcher ||
        !AppSwitcherMod.AppSwitcher.prototype ||
        !AppSwitcherMod.AppSwitcher.prototype._keyPressEvent) {
        global.logError("close-in-switcher: incompatible Cinnamon version, not enabling");
        return;
    }

    _orig = AppSwitcherMod.AppSwitcher.prototype._keyPressEvent;

    AppSwitcherMod.AppSwitcher.prototype._keyPressEvent = function(actor, event) {
        if (event.get_key_symbol() === Clutter.KEY_Delete) {
            let win = this._windows && this._windows[this._currentIndex];
            if (win) {
                global.log("CloseInSwitcher: closing " + win.get_title());
                win.delete(event.get_time());
            }
            return true;
        }
        return _orig.call(this, actor, event);
    };
}

function disable() {
    if (_orig) {
        AppSwitcherMod.AppSwitcher.prototype._keyPressEvent = _orig;
        _orig = null;
    }
}
