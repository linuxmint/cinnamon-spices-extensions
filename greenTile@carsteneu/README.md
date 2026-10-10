# greenTile

Window tiling for Cinnamon: presets per monitor and workspace, an auto mode, snap-on-release, draggable borders and keyboard swapping. Requires Cinnamon 6.0.4 or newer; tested on Linux Mint 21.3–22.3 (Cinnamon 6.0.4–6.6) with X11. On Wayland it works in first tests on Linux Mint 22.3 (Cinnamon 6.6); swap, border resize and multi-monitor are not tested there yet. Newer Cinnamon versions are not yet verified.

## Features

- **Presets per monitor and workspace** — rules by window count, e.g. "3 windows = 2 columns", "6 = 2·2·2". Assigned presets reapply when the window count changes.
- **Auto mode** (`Super+Ctrl+A`) — new, closed, minimized and restored windows retile after 300 ms; new windows normally join the end, while an explicit successful drop keeps its chosen position. `Super+Ctrl+D` pauses automatic tiling, snap-on-release and swapping without removing the preset; `Super+Ctrl+Left/Right` can still send the focused window away.
- **Preset panel** (`Super+Ctrl+P`) — apply presets with one click, set the gap between windows (0–48 px), switch auto mode, all on the monitor of the focused window.
- **Preset editor** — paint up to 6 columns × 4 rows, name it, and the preset retiles immediately if it is in use. Delete presets you no longer want.
- **Moving borders** — drag a border or use `Super+Alt+Arrow` for finer control; neighbours follow, and border positions are remembered per window count. The 120 px minimum is a target where space allows, not a guarantee for overloaded layouts or application-enforced minimum sizes.
- **Splitting by drag** — drop a window at the edge zone of a tiled window to stack it, add a column or a row; a preview shows where it lands.
- **Swapping** — `Super+Ctrl+Arrow` swaps the focused window with its neighbour; Left/Right continue across monitors and workspaces, also through untiled or paused ones, which they leave as they are; there the window is only moved over and may lie on top of the windows already there.
- **Focus navigation** — `Super+Arrow` moves the focus, with a short border flash so you can see where it went.
- **Never tile** — a settings list by window class, title or app id (covers flatpaks); `Super+G` floats a single window temporarily.
- **Theming** — light/dark/follow-system panel theme, accent and state colors (follow the Cinnamon theme or custom), animated tiling.

## Hotkeys

| Key | Action |
|---|---|
| `Super+Ctrl+A` / `D` | Auto mode on / off for this monitor and workspace |
| `Super+Ctrl+P` | Open or close the preset panel |
| `Super+Ctrl+3` / `6` | Tile all windows into 3 / 6 equal columns |
| `Super+Ctrl+←/→/↑/↓` | Swap the focused window with its neighbour |
| `Super+←/→/↑/↓` | Move the keyboard focus (auto mode; native edge tiling elsewhere) |
| `Super+Alt+←/→/↓/↑` | Make the focused window narrower / wider / taller / shorter |
| `Super+G` | Float the focused window until pressed again |

All hotkeys can be changed on the **Hotkeys** page of the settings.

## Notes

- Hardware monitor keys use vendor, product and serial, with the connector added when the serial is missing or all zeros. Failed hardware detection uses a separate name-and-size key; its assignments are not automatically joined with the hardware-key assignments.
- After an update, restart Cinnamon on X11 (`Alt+F2` → `r` → Enter, or `Ctrl+Alt+Esc`). Reloading or toggling the extension alone does not activate updated native library modules. Under Wayland, log out and back in instead.
- An external layout reset or import cancels older pending resize writes once Cinnamon reports a changed value. Avoid importing or resetting layouts during an unfinished resize; identical-value imports and notification timing still have limitations.
- greenTile started as a fork of **gTile**; about 98 % of today's code is new, either rewritten or added since. If gTile is still installed, disable it: both extensions claim the same keys.
- On Cinnamon 6.6, avoid other extensions overriding `push-tile-*`: disabling greenTile restores Cinnamon's defaults, not their handlers.
- greenTile is self-contained: no configuration outside the standard xlet settings, no runtime downloads.

## Source and license

Source and bug reports: [github.com/carsteneu/greenTile](https://github.com/carsteneu/greenTile)

GNU General Public License, version 3, like gTile. Original code by vibou and shuairan (gTile), modifications and additions © 2026 carsten_eu.
