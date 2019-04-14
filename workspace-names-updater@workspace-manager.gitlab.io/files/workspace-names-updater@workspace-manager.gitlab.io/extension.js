/*This script updates the workspace names if changed in the settings backend*/
const Main = imports.ui.main;

function onWorkspaceNamesSettingChanged() {
    /*Fetches the new names from gsettings and updates the workspaces to match*/
    Main.workspace_names = Main.wmSettings.get_strv("workspace-names");
    Main._trimWorkspaceNames();
}

let signal_binding;

function enable() {
    /*Connects the signal to its handler*/
    signal_binding = Main.wmSettings.connect("changed::workspace-names", onWorkspaceNamesSettingChanged);
}

function disable() {
    /*Disconnects the signal from its handler*/
    Main.wmSettings.disconnect(signal_binding);
}

function init(extensionMeta) {}

