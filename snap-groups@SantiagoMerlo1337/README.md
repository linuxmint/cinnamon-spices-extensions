# Snap Groups

Windows 11 style **Snap Groups** for Cinnamon's Alt+Tab.

When you snap windows side by side (Super+Arrow keys or by dragging them to a
screen edge), they form a group. Alt+Tab then shows an extra entry for that
group, with a live preview of its layout:

- Pick the **group entry** to bring back all of its windows at once.
- Pick a **single window** to bring back only that window, as usual.

## How groups are formed

A group is made of windows that are snapped (half or quarter tiles) on the
same monitor and workspace and do not overlap each other. Maximized windows
are not part of groups. Un-snapping a window removes it from its group.

If an older snapped window is hidden behind a newer one in the same slot, only
the most recently used one belongs to the group.

## Alt+Tab behavior

- Each group appears as one block: the group entry followed by its windows.
- Windows are ordered by focus history (most recently focused first), so the
  window you are using is always first.
- When you are inside a group, the whole group counts as the current item:
  a quick Alt+Tab takes you to the previous window outside the group, and a
  quick Alt+Tab from that window takes you back to the group.
- Restoring a group also works after "Show desktop" (Super+D): the group's
  windows come back and the rest stay hidden.

## Compatibility

- Works with the classic Alt+Tab styles: Icons, Thumbnails, Icons and
  thumbnails, Icons and window preview, and Window preview.
- The Coverflow and Timeline (3D) styles are left untouched: no group entry is
  added there.
- The "switch between windows of the same app" shortcut is left untouched.
- Tested on Cinnamon 6.6. The Alt+Tab internals it relies on are the same in
  Cinnamon 6.0, 6.2 and 6.4.

## Translations

Available in English, Spanish, Brazilian Portuguese, French, German and
Italian. New translations and corrections are welcome: copy the `.pot`
template in `files/snap-groups@SantiagoMerlo1337/po/` to `<language>.po`,
translate it, and open a pull request.

## Notes

This extension changes Cinnamon's Alt+Tab switcher at runtime. Disabling the
extension restores the original behavior immediately.
