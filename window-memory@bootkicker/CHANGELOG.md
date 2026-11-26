# Changelog

## 0.4.2

### Changed
- On Cinnamon 6.8 the extension loads its modules with Cinnamon's native module loader, so no deprecation warning is logged. It works the same as before on Cinnamon 6.0 to 6.6.
- The README no longer describes release archives: install from the Cinnamon Spices store or from source.

### Fixed
- Faster loading of the saved windows when there are many.

## 0.4.1

### Added
- Window Memory now stops itself and says so once when it cannot work safely (a required Cinnamon function is missing, it cannot start, too many errors, or Cinnamon restarts repeatedly), and stays off until its Enable switch is turned off and on.
- A second tab in the settings window, "Startup apps": it lists the Startup Applications entries with a switch and a Remove button, adds an application by clicking its window ("Pick a window to start at login": a normal application is added at once with Undo, any other window opens a pre-filled form), and opens Startup Applications to add or edit by hand. It works on X11 and, experimentally, on Cinnamon's Wayland session, and is translated in all 24 languages.

### Fixed
- On Wayland (experimental), windows of native Wayland applications are now remembered and restored: their application id arrives a moment after the window is announced, and the extension now waits for it instead of ignoring the window.
- A window saved in an X11 session is found again in a Wayland session, and the other way round, for applications whose class differs between the two (gnome-terminal, LibreOffice, Meld, Drawing, Thunderbird, Firefox, BleachBit, Ghostty, and the KDE applications Kate, KWrite, Dolphin, Konsole, Okular, Ark, Gwenview, KCalc, Konqueror and Discover): a small built-in list of equivalent keys.
- Learned mapping: each saved window also records its application's desktop file id and whether it was an X11 or a native Wayland window. When nothing matches a window's key, the place saved by the same application as the other kind of window is used. It never applies between windows of the same kind, so an X11 session behaves as before.
- On Wayland (experimental): a window restored maximized is placed at the origin of its monitor's work area instead of hanging over the monitor's edge; a window saved maximized and minimized is maximized when it is un-minimized; the saved monitor is kept when Muffin's placement takes a new window to another one (with size and position not remembered); a dialog of a native Wayland application (a normal window with a parent) is treated as a dialog.
- On Wayland (experimental): a window of a native Wayland application that was restored maximized returns to its saved place, not to the window manager's default place, when you un-maximize it. Its maximize now waits until the window has been put at its saved place.
- A window saved maximized and minimized is maximized again when it is restored from the taskbar, if the window manager dropped the maximize while it was minimized before its first show (seen with xterm on X11).
- Import backup counts the remembered windows it really restores: entries the extension cannot use, pop-ups and repeated ids are left out of the count, and a repeated id no longer collapses two entries into one.
- Import backup reports a failure when the restored windows cannot be saved, instead of saying that they were restored.
- With "Also remember dialog windows" on, a dialog and the main window of an application no longer take each other's saved place: each entry records its window type.
- A window's saved monitor is kept when that monitor is unplugged, even when Muffin numbers the remaining monitors again and one of them takes its index. The window opens on its saved monitor again once it is plugged back in.
- Forget all no longer remembers its own dialog when "Also remember dialog windows" is on, so a repeated Forget all reports no windows.
- `metadata.json` names the project home page, so Cinnamon no longer logs a missing "url".

### Changed
- New extension icon: the original dashed ghost window and white and blue live window, with a thin green viewfinder around the live window (128 by 128, the whole artwork scaled to 95.5% to make room for the brackets).
- The red button of the settings window reads "Forget all remembered windows (Cannot be undone, Esc to cancel)": the button first asks, and Escape closes the question. The label is translated in all 24 languages.
- The pick button of the settings window is labelled "Pick a window to never remember (Click it, Esc or right-click to cancel)", so its purpose is clear at a glance, and it now sits below the never-remember list. The label and tooltip are translated in all 24 languages.
- Both "Pick a window" buttons now show a hint box at the top of the screen while you choose ("Esc or right-click to cancel"), and the window under the pointer is highlighted with a teal overlay and border, with its WM class shown in a small orange label. A right-click cancels, like Escape.
- The never-remember list has an "Enabled" checkbox column: an unchecked entry stays in the list but is ignored, so its application is remembered again. Entries saved by earlier versions count as enabled, and picking a window of an unchecked entry checks it again.
- "Maximum remembered windows" is now a compact "Max windows" field at the right end of the never-remember list's button row (default 500).
- The second tab of the settings window is named "Startup apps" (it was "Restore apps at login").
- The "Pick a window to start at login" button has the same crosshair icon as the "Pick a window to never remember" button.
- The text at the top of the "Startup apps" tab now says that Window Memory puts the windows back in place unless the application is enabled in the never-remember list. It is translated in all 24 languages.
- On a Wayland session the Version row of the settings window shows a short dimmed note, "Wayland (experimental)", after the word "Version"; its tooltip explains it. An X11 session shows the row as before.
- The "Match windows by" tooltip explains each option in plain words, and the "Pick a window" tooltip now starts with "Click here, then click the window ...". The tooltip of the never-remember list ends by pointing to the "Pick a window" button, which adds entries automatically.
- The commit link in the Version row of the settings window is shown in square brackets: `0.4.1 [1a2b3c4]`.
- The translation template is named after the extension (`window-memory@bootkicker.pot`), and the texts of the backup buttons' tooltips are found by the template tool of Cinnamon and the Spices store, so that a template made by it keeps their translations.

## 0.4.0

### Added
- Translations: the extension follows the language of your session. Catalan, Croatian, Danish, Dutch, Basque, Finnish, French, German, Hungarian, Italian, Japanese, Korean, Polish, Portuguese (European and Brazilian), Romanian, Russian, Simplified and Traditional Chinese, Spanish, Swedish, Turkish, Ukrainian and Vietnamese. If something reads wrong in your language, please open an issue.
- A "Report an issue" link in the Version row of the settings window, an issue template, and a guide to reporting issues.

### Changed
- "Remember minimized state" has a tooltip, and the "Match windows by" tooltip says that an entry that was not minimized is preferred when minimized state is remembered.

## 0.3.0

### Added
- Back up and restore: two buttons in the settings, "Export backup…" and "Import backup…", save every setting, the never-remember list and the remembered windows to one file, and restore them from it.
- Confirmations: the Forget-all button asks first (Cancel, or the close button, keeps the windows), then says in a dialog how many were forgotten, or that there is nothing to forget. The Forget-the-focused-window shortcut shows a notification that names the application.

### Changed
- The Forget-all button has a red warning icon and the Pick-a-window border, and the never-remember list is shorter.

## 0.2.0

### Added
- Remember minimized state: a new switch, on by default, restores a window that was minimized when the application was closed. Cinnamon plays its minimize sound when the window reopens minimized; this is intended, as it tells you that something was minimized.

## 0.1.0
- Automatically remembers size, position, monitor, workspace and maximized state per application.
- Settings for each remembered property, excluded applications, dialogs, title matching, entry limit.
- Keybinding and button to forget a window or everything.
