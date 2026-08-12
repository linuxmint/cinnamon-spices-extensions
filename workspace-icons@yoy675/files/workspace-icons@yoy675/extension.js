const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const ModalDialog = imports.ui.modalDialog;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

class WorkspaceDesktopExtension {
    constructor() {
        this._workspaceManager = global.screen;
        this._signalId = null;
    }

    enable() {
        log('Workspace Desktop extension enabled');
        
        // Listen for workspace changes
        this._signalId = this._workspaceManager.connect(
            'workspace-switched',
            this._onWorkspaceChanged.bind(this)
        );
        
        // Run on initial workspace
        this._onWorkspaceChanged();
    }

    disable() {
        log('Workspace Desktop extension disabling: merging files back to ~/Desktop...');
        if (this._signalId) {
            this._workspaceManager.disconnect(this._signalId);
            this._signalId = null;
        }
        // Merge workspace subfolders back into main ~/Desktop and clean up
        this._mergeWorkspacesBack();
        log('Workspace Desktop extension disabled');
    }

    _onWorkspaceChanged() {
        const activeWorkspace = this._workspaceManager.get_active_workspace();
        const workspaceIndex = activeWorkspace.index();
        
        log(`Workspace changed to: ${workspaceIndex}`);
        this._runOnWorkspaceChange(workspaceIndex);
    }

    _runOnWorkspaceChange(workspaceIndex) {
        try {
            const homeDir = GLib.get_home_dir();
            const desktopBaseDir = `${homeDir}/Desktop`;
            const workspaceDir = `${desktopBaseDir}/workspace${workspaceIndex}`;

            // 1. Create workspace directory if missing
            this._ensureDirectoryExists(workspaceDir);

            // 2. Copy existing root Desktop files into the workspace folder (if empty or on initial run)
            this._copyRootDesktopFilesToWorkspace(desktopBaseDir, workspaceDir);

            // 3. Update XDG Desktop directory target
            this._updateXdgDesktopDir(workspaceDir);

            // 4. Refresh desktop icons
            this._refreshDesktopIcons();

        } catch (e) {
            logError(e, 'Error in workspace change handler');
        }
    }

    _ensureDirectoryExists(path) {
        const file = Gio.file_new_for_path(path);
        if (!file.query_exists(null)) {
            try {
                file.make_directory_with_parents(null);
                log(`Created directory: ${path}`);
            } catch (e) {
                logError(e, `Failed to create directory: ${path}`);
            }
        }
    }

    _copyRootDesktopFilesToWorkspace(desktopPath, workspacePath) {
        const desktopDir = Gio.File.new_for_path(desktopPath);
        const wsDir = Gio.File.new_for_path(workspacePath);

        if (!desktopDir.query_exists(null)) return;

        try {
            const enumerator = desktopDir.enumerate_children(
                'standard::*',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();

                // Skip workspace folders to avoid recursive copying
                if (name.match(/^workspace\d+$/)) continue;

                const srcFile = desktopDir.get_child(name);
                const destFile = wsDir.get_child(name);

                // Copy only if file/folder doesn't already exist in the target workspace
                if (!destFile.query_exists(null)) {
                    try {
                        srcFile.copy(destFile, Gio.FileCopyFlags.NONE, null, null);
                        log(`Copied ${name} -> ${workspacePath}`);
                    } catch (err) {
                        logError(err, `Failed copying ${name} to workspace`);
                    }
                }
            }
        } catch (e) {
            logError(e, 'Error reading root Desktop folder');
        }
    }

    _mergeWorkspacesBack() {
        const homeDir = GLib.get_home_dir();
        const mainDesktopPath = `${homeDir}/Desktop`;
        const desktopDir = Gio.File.new_for_path(mainDesktopPath);

        if (desktopDir.query_exists(null)) {
            try {
                const enumerator = desktopDir.enumerate_children(
                    'standard::*',
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );

                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    const name = info.get_name();

                    // Find workspace directories
                    if (name.match(/^workspace\d+$/)) {
                        const wsDir = desktopDir.get_child(name);
                        
                        // Move contents out of workspace folder into ~/Desktop
                        this._emptyDirectoryToDestination(wsDir, desktopDir);
                        
                        // Delete the now-empty workspace folder
                        try {
                            wsDir.delete(null);
                            log(`Deleted directory: ${name}`);
                        } catch (err) {
                            logError(err, `Could not remove folder ${name}`);
                        }
                    }
                }
            } catch (e) {
                logError(e, 'Error restoring workspace files to ~/Desktop');
            }
        }

        // Reset XDG user directory back to original ~/Desktop
        this._updateXdgDesktopDir(mainDesktopPath);
        this._refreshDesktopIcons();
    }

    _emptyDirectoryToDestination(srcDir, destDir) {
        if (!srcDir.query_exists(null)) return;

        try {
            const enumerator = srcDir.enumerate_children(
                'standard::*',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const srcFile = srcDir.get_child(name);
                const destFile = destDir.get_child(name);

                try {
                    // Overwrite standard files if duplicates exist, or skip if needed
                    srcFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                    log(`Merged ${name} back to ~/Desktop`);
                } catch (e) {
                    logError(e, `Failed to move ${name} back to ~/Desktop`);
                }
            }
        } catch (e) {
            logError(e, 'Error iterating directory contents during merge');
        }
    }

    _updateXdgDesktopDir(path) {
        try {
            // SECURITY FIX: Use spawn_async with argument array instead of spawn_command_line_async
            // to prevent command injection attacks
            const argv = ['xdg-user-dirs-update', '--set', 'DESKTOP', path];
            let exitStatus = 0;
            GLib.spawn_sync(
                null,  // working directory
                argv,  // argument array
                null,  // environment
                GLib.SpawnFlags.SEARCH_PATH,
                null   // child setup
            );
            log(`Updated DESKTOP to: ${path}`);
        } catch (e) {
            logError(e, 'Failed to update XDG Desktop directory');
        }
    }

    _refreshDesktopIcons() {
        const desktopSession = GLib.getenv('XDG_CURRENT_DESKTOP') || 'Cinnamon';
        
        try {
            if (desktopSession.includes('Cinnamon')) {
                // SECURITY FIX: Use spawn_async with argument array
                this._spawnCommand(['nemo-desktop', '-q']);
                Mainloop.timeout_add(100, () => {
                    this._spawnCommand(['nemo-desktop']);
                    return false;
                });
            }
        } catch (e) {
            logError(e, 'Failed to refresh desktop icons');
        }
    }

    _spawnCommand(argv) {
        try {
            // SECURITY FIX: Use array-based spawning to avoid command injection
            GLib.spawn_async(
                null,  // working directory
                argv,  // argument array (not a single command string)
                null,  // environment
                GLib.SpawnFlags.SEARCH_PATH,
                null   // child setup
            );
        } catch (e) {
            logError(e, `Failed to spawn command: ${argv.join(' ')}`);
        }
    }
}

let extension;

function init(metadata) {
    // Required entry point called when extension is loaded
}

function enable() {
    extension = new WorkspaceDesktopExtension();
    extension.enable();
}

function disable() {
    if (extension) {
        extension.disable();
        extension = null;
    }
}
