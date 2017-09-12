const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Settings = imports.ui.settings;

let bindings = [
	"move-to-workspace-11",
	"move-to-workspace-12",
	"switch-to-workspace-11",
	"switch-to-workspace-12"
];

function onSwitch(display, screen, window, binding_o) {
    let current_workspace_index = global.screen.get_active_workspace_index();
	
	let binding = binding_o.get_name();
	
	if (binding == "move-to-workspace-11") {
		Main.wm._shiftWindowToWorkspace(window, Meta.MotionDirection.UP);
	} else if (binding == "move-to-workspace-12") {
		Main.wm._shiftWindowToWorkspace(window, Meta.MotionDirection.DOWN);
	} else if (binding == "switch-to-workspace-11") {
		Main.wm.actionMoveWorkspaceUp();
	} else if (binding == "switch-to-workspace-12") {
		Main.wm.actionMoveWorkspaceDown();
	}
    
	if (current_workspace_index !== global.screen.get_active_workspace_index())
        Main.wm.showWorkspaceOSD();
}

function updateWorkspaces() {
	// This is code from workspace-grid@hernejj's applet.
	let new_ws_count = this.numCols * this.numRows;
	let old_ws_count = global.screen.n_workspaces;
	if (new_ws_count > old_ws_count) {
		for (let i=old_ws_count; i<new_ws_count; i++)
			global.screen.append_new_workspace(false, global.get_current_time());
	}
	else if (new_ws_count < old_ws_count) {
		for (let i=old_ws_count; i>new_ws_count; i--) {
			let ws = global.screen.get_workspace_by_index( global.screen.n_workspaces-1 );
			global.screen.remove_workspace(ws, global.get_current_time());
		}
	}
	global.screen.override_workspace_layout(
		Meta.ScreenCorner.TOPLEFT, false, this.numRows, this.numCols);
}

function init(metadata) {
    let settings = new Settings.ExtensionSettings(this, metadata.uuid);
	settings.bindProperty(Settings.BindingDirection.IN,
		"numCols", "numCols", updateWorkspaces)

	settings.bindProperty(Settings.BindingDirection.IN,
		"numRows", "numRows", updateWorkspaces)
}

function enable() {
	for (let k in bindings) {
		Meta.keybindings_set_custom_handler(bindings[k], Lang.bind(this, onSwitch));
	}

}

function disable() {
}
