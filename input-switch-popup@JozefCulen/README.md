# Input Switch Popup

Shows a small popup at your text cursor whenever you switch keyboard layout,
like macOS and Windows do.

- The popup opens just below the text cursor, or next to the mouse pointer
  when the app doesn't report its cursor.
- All your layouts are listed, and a highlight slides to the new one.
- The popup is light with a light Cinnamon theme and dark with a dark one,
  and the highlight uses your theme's accent color.

## Settings

- **Popup position:** text caret (falls back to the mouse pointer) or always
  the mouse pointer
- **Show all layouts:** turn off to show only the new layout
- **Duration** and **font size**

## Cursor position in Firefox, Chrome and Electron apps

GTK apps such as xed and LibreOffice report the text cursor out of the box.
Firefox, Chrome, Chromium and Electron apps (VS Code, Slack…) only do so with
accessibility enabled; otherwise the popup appears at the mouse pointer. To
enable it, run this and restart those apps:

```
gsettings set org.gnome.desktop.interface toolkit-accessibility true
```

Or per app: start Chromium-based apps with `--force-renderer-accessibility`,
and Firefox with the environment variable `GNOME_ACCESSIBILITY=1`.

## Requirements

`python3`, `python3-gi` and `gir1.2-atspi-2.0`, which are installed by default
on Linux Mint.

Source and issues: https://github.com/JozefCulen/cinnamon-input-switch-popup
