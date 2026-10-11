# Workspace Icons

workspace-icons@yoy675 — Switch desktop folders and icons when changing Cinnamon workspaces.

## Description

This Cinnamon extension lets you present a different Desktop folder (and therefore different desktop icons) per workspace. When changing workspaces, the extension updates the XDG Desktop directory to point to a workspace-specific folder, and refreshes the Cinnamon desktop to show the icons from that folder.

## Features

- Per-workspace Desktop folder handling (creates ~/Desktop/workspace0, workspace1, ...)
- Copies existing Desktop contents into workspace folders on first use to give each workspace a starting set of icons
- Restores/merges workspace contents back into ~/Desktop when the extension is disabled
- Refreshes desktop icons (but not desklets) when workspace changes
- The system remembers the placing of each icon per workspace, but desklets will not change placing between workspaces.

## Requirements

- Cinnamon desktop (tested on Cinnamon 5.x and 6.x)
- GLib/Gio provided by the Cinnamon runtime
- `xdg-user-dirs-update` package (usually pre-installed on most distributions)
- Nemo desktop support (Cinnamon's default file manager)

## Installation

1. Copy the extension folder into your local Cinnamon extensions directory:

```bash
mkdir -p ~/.local/share/cinnamon/extensions
cp -r "workspace-icons@yoy675" ~/.local/share/cinnamon/extensions/
```

2. Restart Cinnamon (log out and in, or run) (not needed in my experience):

```bash
cinnamon --replace &
```

3. Enable the extension using the Extensions settings panel in Cinnamon.

## Configuration

This extension does not currently expose a graphical preferences dialog. Configuration is simple filesystem-based behavior:

- Per-workspace folders are automatically created under `~/Desktop` as `workspace0`, `workspace1`, etc.
- Each workspace shows the contents of its corresponding folder
- If you want different initial icons per workspace, seed those folders with files or symlinks before switching to that workspace

## Usage

1. After installation and enabling, switch between workspaces
2. Observe that the Desktop icons change to the workspace-specific folder contents
3. Add or remove files from the `~/Desktop/workspaceN` folders to customize icons per workspace
4. When disabling the extension, it will merge files back from each `workspaceN` folder into `~/Desktop` and remove the workspace folders

## Known Issues

- File conflicts: If the same filename exists in multiple workspace folders, the extension attempts to overwrite by default when disabling. Back up important files in `~/Desktop/workspaceN` folders before disabling.
- Desktop refresh: The extension changes the XDG Desktop directory using `xdg-user-dirs-update`. Some distributions may handle this differently; test carefully on your system.
- This extension is currently Cinnamon-specific and only refreshes Nemo desktop icons.

## Security

This extension has been updated to use secure command execution methods to prevent command injection vulnerabilities. All external commands are spawned using GLib.spawn_async with argument arrays rather than shell command strings.

## Changelog

- 1.0 — Initial submission
  - Fixed command injection vulnerability by using GLib.spawn_async with argument arrays
  - Scoped extension to Cinnamon-specific operations (removed GNOME/XFCE/LXDE support)
  - Improved error handling and logging

## Credits

Author: yoy675 — https://github.com/yoy675

## License

This project is licensed under AGPL-3.0. See the top-level LICENSE file for details.
