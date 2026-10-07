# Notification Filter

Cinnamon extension that controls desktop notifications from selected applications.

## Features

Three modes for apps in your list:

| Mode | Behavior |
|------|----------|
| **Hide completely** | Notification never appears (app still gets a normal reply) |
| **Show without sound** | Popup is shown, no sound, duration same as system settings |
| **Show without sound, don't keep in history** | Same as above + not saved in the notification applet history |

Matching is case-insensitive and supports both **exact** and **substring** matches on application name or notification title.

## How to find the app name

1. Enable **Log application names of notifications** in the extension settings
2. Press `Alt+F2`, type `lg`, press Enter
3. Open the **Log** tab
4. Trigger a notification from the unwanted app
5. Look for a line like:
   ```
   notification-filter@nort: notification from app 'AppName', summary 'Title'
   ```
6. Copy the app name or title into the list in settings

## Installation

### From Cinnamon Spices (recommended)

System Settings → Extensions → Download → search **Notification Filter** → Install → Enable  
Then restart Cinnamon (`Ctrl+Alt+Esc`).

### Manual

Copy the `notification-filter@nort` folder to:
```
~/.local/share/cinnamon/extensions/
```
Restart Cinnamon and enable the extension in System Settings → Extensions.

Russian translations are included. If the UI stays in English, copy the `.mo` file:
```bash
mkdir -p ~/.local/share/locale/ru/LC_MESSAGES
cp ~/.local/share/cinnamon/extensions/notification-filter@nort/locale/ru/LC_MESSAGES/notification-filter@nort.mo \
   ~/.local/share/locale/ru/LC_MESSAGES/
```

## Settings

- **Action for listed applications** — choose hide / silent / silent+no history
- **Applications (name or title)** — one per line (or comma / semicolon separated)
- **Log application names** — write every notification to Looking Glass (Log tab)

## Compatibility

Cinnamon 5.8 – 7.0

## Author

nort

## License

GPL-3.0-or-later
