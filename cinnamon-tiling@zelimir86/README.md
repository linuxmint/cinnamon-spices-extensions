# Cinnamon Tiling

Layout based window tiling for Cinnamon, inspired by [Tiling Shell](https://github.com/domferr/tilingshell)
for GNOME.

## Features

* **Tiling system** – hold <kbd>Ctrl</kbd> while dragging a window to show the layout, drop it on a tile.
  Hold <kbd>Alt</kbd> as well to span several tiles. Both keys can be changed.
* **Snap assistant** – drag a window towards the top of the screen, pick a layout and a tile.
* **Layout editor** – click to split a tile left/right, <kbd>Ctrl</kbd>+click to split it top/bottom, right
  click to delete it, drag dividers to resize. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes, <kbd>Enter</kbd> saves,
  <kbd>Esc</kbd> cancels.
* **Panel indicator** – shows the current layout and selects a layout per monitor.
* **Screen edges** – halves on the left/right edge, quarters near the corners, optional maximize at the
  top; an adaptive mode uses the tiles of the current layout instead.
* **Smart resize** – resizing a tiled window resizes its neighbours.
* **Keyboard** – move and span windows across tiles (<kbd>Super</kbd>+arrows by default), focus by
  direction, next/previous tiled window, center, untile, cycle layouts.
* **Windows suggestions** – after tiling a window, pick other windows for the empty tiles.
* **Window menu** – layout buttons and "best tile" actions in the titlebar right-click menu.
* Per-workspace layouts, auto-tiling of new windows, inner/outer gaps, focused window border,
  raise tiled windows together, restore the original size when a window leaves its tile.
* Import/export layouts as JSON, in the same format Tiling Shell uses.

## Changes to Cinnamon settings

While the extension is enabled it turns off Cinnamon's own edge tiling
(`org.cinnamon.muffin edge-tiling`), whose <kbd>Ctrl</kbd> snapping conflicts with the tiling system,
and frees Cinnamon keybindings that use the same keys as the extension's shortcuts
(by default <kbd>Super</kbd>+arrows for `push-tile-*`). The original values are saved and restored when
the extension is disabled. Both can be turned off in the settings.

## Development

Source and issues: https://github.com/zelimir86/cinnamon-tiling

This extension was implemented with the help of [Claude Code](https://claude.com/claude-code),
Anthropic's AI coding assistant. The code was written for this project (it is not ported from Tiling
Shell) and was tested on Cinnamon 6.8.

## License

GPL-2.0-or-later.
