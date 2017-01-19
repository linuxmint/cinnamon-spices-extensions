const Cinnamon = imports.gi.Cinnamon;
const Workspace = imports.ui.workspace;
const ExpoThumbnail = imports.ui.expoThumbnail;
const Clutter = imports.gi.Clutter;

let _oldOnClicked;
let _oldOnButtonRelease;


function init() {
    _oldOnClicked = Workspace.WindowClone.prototype._onClicked;
    _oldOnButtonRelease =
        ExpoThumbnail.ExpoWindowClone.prototype._onButtonRelease;
}

function enable() {
    Workspace.WindowClone.prototype._onClicked =
        function(action, actor) {
            this._selected = true;
            if (action.get_button() == 2) {
                this.metaWindow.delete(global.get_current_time());
            } else {
                this.emit('selected', global.get_current_time());
            }
        };
    ExpoThumbnail.ExpoWindowClone.prototype._onButtonRelease =
        function(actor, event) {
            if ((Cinnamon.get_event_state(event) &
                 Clutter.ModifierType.BUTTON1_MASK) ||
                (Cinnamon.get_event_state(event) &
                 Clutter.ModifierType.BUTTON3_MASK)){
                this.emit('selected', event.get_time());
            } else if (Cinnamon.get_event_state(event) &
                       Clutter.ModifierType.BUTTON2_MASK){
                this.metaWindow.delete(global.get_current_time());
            }
            return true;
        };
}

function disable() {
    Workspace.WindowClone.prototype._onClicked = _oldOnClicked;
    ExpoThumbnail.ExpoWindowClone.prototype._onButtonRelease =
        _oldOnButtonRelease;
}
