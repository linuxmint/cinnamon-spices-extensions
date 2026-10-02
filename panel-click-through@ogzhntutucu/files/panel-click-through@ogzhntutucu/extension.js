// While a popup menu is open, Cinnamon closes it on any outside click and
// swallows the click (popupMenu.js, PopupMenuManager._onEventCapture).
// This extension lets clicks on a panel through: the menu closes and the
// panel receives the click as well.

const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;

let originalCapture = null;

function isOnPanel(src) {
    return Main.panelManager.getPanels().some(p => p && p.actor && p.actor.contains(src));
}

function patchedCapture(actor, event) {
    if (this.grabbed &&
        event.type() == Clutter.EventType.BUTTON_PRESS &&
        !this._eventIsOnActiveMenu(event)) {
        let src = event.get_source();
        // Clicking the menu's own button should only close it, not reopen it
        let onOwnButton = this._menus.some(m => m.sourceActor && m.sourceActor.contains(src));
        if (src && !src.is_finalized() && !onOwnButton && isOnPanel(src)) {
            this._closeMenu();
            return Clutter.EVENT_PROPAGATE;
        }
    }
    return originalCapture.call(this, actor, event);
}

function init(metadata) {}

function enable() {
    originalCapture = PopupMenu.PopupMenuManager.prototype._onEventCapture;
    PopupMenu.PopupMenuManager.prototype._onEventCapture = patchedCapture;
}

function disable() {
    if (originalCapture) {
        PopupMenu.PopupMenuManager.prototype._onEventCapture = originalCapture;
        originalCapture = null;
    }
}
