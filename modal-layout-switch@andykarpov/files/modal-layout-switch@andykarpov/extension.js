// Modal Layout Switch - Cinnamon extension
//
// Cinnamon (Muffin) handles the XKB group-toggle option (grp:*) itself and
// switches input sources on ISO_Next_Group. While a modal grab is active
// (main menu, polkit password dialog, other ModalDialogs) Muffin does not
// process keybindings, so the layout cannot be changed. This extension
// listens for ISO_Next_Group / ISO_Prev_Group on the stage while a modal is
// active and switches the input source itself.

const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const KeyboardManager = imports.ui.keyboardManager;

let _handlerId = 0;

function _switchInputSource(reverse) {
    const manager = KeyboardManager.getInputSourceManager();
    const count = manager.numInputSources;
    if (count < 2)
        return;

    const current = manager.currentSource ? manager.currentSource.index : 0;
    const next = (current + (reverse ? count - 1 : 1)) % count;
    manager.activateInputSourceIndex(next);
}

function _onCapturedEvent(actor, event) {
    if (Main.modalCount === 0 || event.type() !== Clutter.EventType.KEY_PRESS)
        return Clutter.EVENT_PROPAGATE;

    const sym = event.get_key_symbol();
    if (sym === Clutter.KEY_ISO_Next_Group)
        _switchInputSource(false);
    else if (sym === Clutter.KEY_ISO_Prev_Group)
        _switchInputSource(true);
    else
        return Clutter.EVENT_PROPAGATE;

    return Clutter.EVENT_STOP;
}

function init(metadata) {}

function enable() {
    // Guard against a handler left over from a previous load of the module.
    if (global.stage._modalLayoutSwitchId)
        global.stage.disconnect(global.stage._modalLayoutSwitchId);
    _handlerId = global.stage.connect('captured-event', _onCapturedEvent);
    global.stage._modalLayoutSwitchId = _handlerId;
}

function disable() {
    if (_handlerId) {
        global.stage.disconnect(_handlerId);
        _handlerId = 0;
        global.stage._modalLayoutSwitchId = 0;
    }
}
