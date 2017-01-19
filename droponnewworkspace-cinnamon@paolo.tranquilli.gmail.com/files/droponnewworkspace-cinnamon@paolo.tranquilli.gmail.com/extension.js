const Main = imports.ui.main;

let _oldDelegate;

function init() {
    _oldDelegate = Main.expo._addWorkspaceButton._delegate;
}

function enable() {
    let button = Main.expo._addWorkspaceButton;
    button._delegate = button._delegate || {};
    button._delegate.handleDragOver = function(source, actor, x, y, time) {
        return DND.DragMotionResult.CONTINUE;
    };
    button._delegate.acceptDrop = function(source, actor, x, y, time) {
        if (source.realWindow) {
            let win = source.realWindow;
            let metaWindow = win.get_meta_window();
            if (!Main._addWorkspace()) {
                return false;
            }
            metaWindow.change_workspace_by_index(Main.nWorks - 1,
                                                 false, // create workspace
                                                 time);
            return true;
        }
        return false;
    };
}

function disable() {
    Main._addWorkspaceButton._delegate = _oldDelegate;
}
