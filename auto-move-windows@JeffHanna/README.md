Auto Move Windows
=================

This Cinnamon spice automatically moves and resizes newly opened application windows according to per-application rules.

Configuration
-------------
Rules are stored in the extension settings under the key `app-rules` as a JSON array of objects.

Each rule object has this shape (fields are optional unless noted):

- `wmClass` (string, required): the window class returned by `metaWindow.get_wm_class()` (e.g. "Firefox").
- `workspace` (integer, optional): 0-based workspace index to move the window to.
- `x`, `y` (integer, optional): top-left coordinates where the window should be placed.
- `width`, `height` (integer, optional): desired width/height in pixels.
- `firstOnly` (boolean, optional): if `true`, the extension only acts on the first instance of the app; subsequent windows are ignored until that window closes.

Example `app-rules` JSON:

[
  {
    "wmClass": "Firefox",
    "workspace": 1,
    "x": 50,
    "y": 50,
    "width": 1200,
    "height": 800,
    "firstOnly": false
  },
  {
    "wmClass": "Gnome-terminal",
    "workspace": 2,
    "width": 1000,
    "height": 700,
    "firstOnly": true
  }
]

Editing rules
-------------
- You can edit the JSON directly via dconf/gsettings or use the Preferences UI (Add "Preferences" for the extension in Cinnamon Settings -> Extensions). This spice ships a simple preferences editor that allows editing the `app-rules` JSON.

Notes
-----
- The extension matches windows by `wmClass`. Some applications report varying WM_CLASS; if rules don't match, check the application's WM_CLASS (e.g. with `xprop WM_CLASS`).
- Workspace indices are 0-based.

License
-------
MIT
