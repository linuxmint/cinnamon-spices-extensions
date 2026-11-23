# Workspace Dots

Transforms the Cinnamon Workspace Switcher into small dots, with a wider pill indicating the active workspace.

The extension is standalone and works with any Cinnamon theme.

## Features

- Minimal dot-style workspace indicators.
- A wider pill highlights the active workspace.
- Light, Dark, and Custom color modes.
- Custom colors for inactive dots, hover states, and the active workspace.
- Works independently of your Cinnamon theme.

## Installation

1. If you have an older version installed, remove the existing `Workspace-Switcher-Dots@PrathamTawar` extension folder.
2. Copy the `Workspace-Switcher-Dots@PrathamTawar` folder into `~/.local/share/cinnamon/extensions/`.
3. Open **System Settings → Extensions**.
4. Select **Workspace Switcher Dots** and click the **+** button to enable it.
5. Open the Workspace Switcher applet settings and set **Display → Simple buttons**.

## Applying Changes

After enabling the extension or changing its settings, you need to reload Cinnamon for the changes to take effect.

- **Restart Cinnamon:** Press `Alt` + `F2`, type `r`, and press `Enter` (X11 sessions only).
- **Restart Cinnamon (alternative):** Press `Ctrl` + `Alt` + `Esc` to restart Cinnamon's shell.
- **Log out and log back in:** Use this if the other methods don't work.

## Settings

Open **System Settings → Extensions**, select **Workspace Switcher Dots**, and click the gear icon to configure the extension.

### Display modes

- **Light:** White dots, intended for dark panels.
- **Dark:** Dark gray dots, intended for light panels.
- **Custom:** Choose your own colors.

### Custom colors

Custom colors are used only when **Custom** mode is selected.

1. Inactive workspace dot color.
2. Inactive workspace dot hover color.
3. Active workspace pill color.

Light and Dark modes use the following accent colors:

- **Hover:** `#727fff`
- **Active workspace:** `#3f51ff`

## Compatibility

- Supports horizontal Cinnamon panels only.
- Requires the Cinnamon Workspace Switcher applet configured to use **Simple buttons**.

## Notes

- The extension generates its stylesheet in `~/.cache/workspace-dots@local/` and loads it when the extension starts. Therefore, `stylesheet.css` is not included in the extension directory.
- If you previously added custom `workspace-button` rules to your Cinnamon theme, remove them to prevent styling conflicts.

## License

GNU General Public License v3.0 (GPL-3.0), subject to the licensing requirements of the official Cinnamon Spices repository.
