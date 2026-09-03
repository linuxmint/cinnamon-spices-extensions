const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;

class WorkspaceDesktopExtension {
    constructor() {
        this._workspaceManager = global.workspace_manager;
        this._signalId = null;
        this._gsettings = null;
    }

    enable() {
        log('Workspace Desktop extension enabled');
        
        try {
            // Initialize GSettings for workspace configuration
            this._gsettings = new Gio.Settings({
                schema_id: 'org.cinnamon.desktop.wm.preferences'
            });
            
            // Pre-create workspace directories based on num-workspaces setting
            this._preCreateWorkspaceDirectories();
        } catch (e) {
            logError(e, 'Failed to initialize GSettings');
        }
        
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
        if (this._gsettings) {
            this._gsettings = null;
        }
        // Merge workspace subfolders back into main ~/Desktop and clean up
        this._mergeWorkspacesBack();
        log('Workspace Desktop extension disabled');
    }

    _preCreateWorkspaceDirectories() {
        try {
            // Get the number of workspaces from GSettings
            const numWorkspaces = this._gsettings.get_int('num-workspaces');
            const homeDir = GLib.get_home_dir();
            const desktopBaseDir = `${homeDir}/Desktop`;
            
            log(`Creating directories for ${numWorkspaces} workspaces`);
            
            // Pre-create all workspace directories
            for (let i = 0; i < numWorkspaces; i++) {
                const workspaceDir = `${desktopBaseDir}/workspace${i}`;
                this._ensureDirectoryExists(workspaceDir);
                
                // Copy existing root Desktop files into the workspace folder on first creation
                this._copyRootDesktopFilesToWorkspace(desktopBaseDir, workspaceDir);
            }
        } catch (e) {
            logError(e, 'Error pre-creating workspace directories');
        }
    }

    _onWorkspaceChanged() {
        const workspaceIndex = this._workspaceManager.get_active_workspace_index();
        
        log(`Workspace changed to: ${workspaceIndex}`);
        this._runOnWorkspaceChange(workspaceIndex);
    }

    _runOnWorkspaceChange(workspaceIndex) {
        try {
            const homeDir = GLib.get_home_dir();
            const desktopBaseDir = `${homeDir}/Desktop`;
            const workspaceDir = `${desktopBaseDir}/workspace${workspaceIndex}`;

            // 1. Ensure workspace directory exists (in case it was deleted)
            this._ensureDirectoryExists(workspaceDir);

            // 2. Update XDG Desktop directory target
            this._updateXdgDesktopDir(workspaceDir);

            // 3. Refresh desktop icons
            this._refreshDesktopIcons();

        } catch (e) {
            logError(e, 'Error in workspace change handler');
        }
    }

    _ensureDirectoryExists(path) {
        const file = Gio.file_new_for_path(path);
        try {
            file.make_directory_with_parents(null);
            log(`Created directory: ${path}`);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                // Directory already exists, that's fine
                return;
            }
            logError(e, `Failed to create directory: ${path}`);
        }
    }

    _copyRootDesktopFilesToWorkspace(desktopPath, workspacePath) {
        const desktopDir = Gio.File.new_for_path(desktopPath);
        const wsDir = Gio.File.new_for_path(workspacePath);

        try {
            // Try to enumerate the desktop directory directly
            // If it doesn't exist, this will throw and we return early
            const desktopEnumerator = desktopDir.enumerate_children_async(
                'standard::*',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            try {
                // Check if workspace directory is empty
                const wsEnumerator = wsDir.enumerate_children_async(
                    'standard::*',
                    Gio.FileQueryInfoFlags.NONE,
                    null
                );
                
                if (wsEnumerator.next_file(null) !== null) {
                    log(`Workspace directory ${workspacePath} is not empty, skipping initial copy`);
                    return;
                }
            } catch (e) {
                log(`Could not check if workspace directory is empty: ${e.message}`);
            }
    
            // Copy files from desktop
            let info;
            while ((info = desktopEnumerator.next_file(null)) !== null) {
                const name = info.get_name();
                if (name.match(/^workspace\d+$/)) continue;
    
                const srcFile = desktopDir.get_child(name);
                const destFile = wsDir.get_child(name);
    
                try {
                    // Try to copy; if file exists, copy() will throw
                    srcFile.copy(destFile, Gio.FileCopyFlags.NONE, null, null);
                    log(`Copied ${name} -> ${workspacePath}`);
                } catch (err) {
                    // File already exists or other copy error
                    if (!err.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                        logError(err, `Failed copying ${name} to workspace`);
                    }
                }
            }
        } catch (e) {
            // Desktop directory doesn't exist or can't be read
            log(`Desktop directory not accessible: ${e.message}`);
        }

    }

    _mergeWorkspacesBack() {
        const homeDir = GLib.get_home_dir();
        const mainDesktopPath = `${homeDir}/Desktop`;
        const desktopDir = Gio.File.new_for_path(mainDesktopPath);

        try {
            const enumerator = desktopDir.enumerate_children_async(
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
            // Desktop directory doesn't exist or can't be enumerated
            log(`Desktop directory not accessible: ${e.message}`);
        }

        // Reset XDG user directory back to original ~/Desktop
        this._updateXdgDesktopDir(mainDesktopPath);
        this._refreshDesktopIcons();
    }

    _emptyDirectoryToDestination(srcDir, destDir) {
        try {
            const enumerator = srcDir.enumerate_children_async(
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
            // Source directory doesn't exist or can't be enumerated
            log(`Source directory not accessible: ${e.message}`);
        }

    }

    _updateXdgDesktopDir(path) {
        try {
            // SECURITY FIX: Use spawn_async with argument array instead of spawn_command_line_async
            // to prevent command injection attacks
            const argv = ['xdg-user-dirs-update', '--set', 'DESKTOP', path];
            GLib.spawn_async(
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
                Mainloop.timeout_add(50, () => {
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
