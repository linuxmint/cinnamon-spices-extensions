# Tilo

Windows 11 style snap layouts for Cinnamon.

![](screenshot.png)

## Snap layouts

Drag a window toward the middle of the top edge. A hint drops down, expands into
the layout bar as you keep going, and highlights the zone under your pointer,
both on the thumbnail and full size on the screen. Let go to place the window.

`Super+Z` opens the same picker without dragging.

## Draw your own zones

`Super+Shift+Z`. The screen becomes one zone. Click it to cut it side by side,
Ctrl+click to stack, right click to remove one. Enter saves the result as a
layout and it joins the built-in ones in the picker.

Layouts are stored as a split tree, so zones cannot overlap, drift off screen,
or leave a hole.

## Neighbours resize together

Drag the border between two tiled windows and both follow.

## Save an arrangement

`Super+G` saves what is on screen and puts it back later, matching the saved
slots against the windows you already have open, by application and then by
title. It restores into existing windows rather than launching new ones.

## Keyboard

| Shortcut | |
| --- | --- |
| `Super+Ctrl+Left` | Left half |
| `Super+Ctrl+Right` | Right half |
| `Super+Ctrl+Up` | Top half |
| `Super+Ctrl+Down` | Bottom half |
| `Super+Ctrl+Enter` | Fill the screen |
| `Super+Ctrl+C` | Center |
| `Super+Z` | Layout picker |
| `Super+Shift+Z` | Zone editor |
| `Super+G` | Saved arrangements |

All rebindable in the extension settings, along with gaps and the distance from
the top edge that reveals the bar. The drag trigger has an off switch.

The defaults only use combinations that were free: `Super+arrows` belongs to
Cinnamon's own snap and Tilo leaves it alone.

## It does not touch your settings

Tilo does not write to `org.cinnamon.*`. Its own settings live in its own
schema, it never enables itself, and if a future option takes over a key that
belongs to Cinnamon it records the old value first and restores it when you turn
the option off or remove the extension.

## Known limits

Applications that declare resize increments, GNOME Terminal being the usual one,
round their own size down to whole character cells. Tilo places them at the
exact corner of the zone and the leftover, up to about 14px, falls to the bottom
right. No window manager can override this.

X11 only, which is what Cinnamon 6.4 runs.

## Links

Source code and issue tracker: https://github.com/JeffreyGbeho/tilo
