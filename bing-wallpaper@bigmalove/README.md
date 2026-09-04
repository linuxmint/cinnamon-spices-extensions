# Bing Wallpaper

Downloads the Bing image of the day and sets it as your desktop wallpaper. Optionally shows the
title and copyright of the current image as text in the top-right corner of the desktop.

## Features

- Fetches the Bing homepage image every day (4K UHD by default) and applies it as the Cinnamon wallpaper
- Region (China, United States, Japan, Germany, … or follow the system language), resolution and picture aspect are configurable
- Retries automatically when the network is down or not ready yet at login; catches up as soon as the connection is back; honours the system proxy
- Saves the images to `Pictures/BingWallpapers` (configurable) and prunes old ones (only files it created itself)
- Optional image information on the desktop: title, copyright and date drawn as text in the top-right corner, below the panel, behind application windows.
  Text color, text effect (shadow, strong shadow, glow, outline, background block), characters per line and font size are adjustable
- Notification with a thumbnail, the title and the copyright when the wallpaper changes
- Buttons in the settings: refresh now, open the image description on Bing, open the wallpaper folder
- No panel icon: everything is configured in *System Settings → Extensions → Bing Wallpaper → configure*

## Settings

| Option | Notes |
| --- | --- |
| Bing region (market) | *Automatic* follows the system language. Some regions publish a different image of the day |
| Image resolution | 4K UHD by default; falls back to 1920x1200 / 1920x1080 when an image is not available in that size |
| Picture aspect | zoom, scaled, stretched, centered, spanned, mosaic, or keep the current system setting |
| Show a notification when the wallpaper changes | Title, copyright and thumbnail |
| Show image information on the desktop | Text in the top-right corner of the primary monitor; color, effect, characters per line and font size |
| Save wallpapers to | Empty = the `BingWallpapers` folder inside your Pictures folder |
| Number of downloaded images to keep | Default 30. Only files named like `20260904_xxx.jpg` created by this extension are deleted |
| Check for a new image every | Default 60 minutes; a check is a tiny request |
| Do not download on metered connections | Off by default |

## Notes

- Once today's image has been applied, a wallpaper you choose by hand is left alone for the rest of the day; the next new image replaces it. *Refresh now* always re-applies today's image.
- Cinnamon's built-in background slideshow is turned off when the extension applies an image, otherwise the slideshow would override it immediately.
- Logs are prefixed with `[bing-wallpaper@bigmalove]` in `~/.xsession-errors` and in Melange (Alt+F2, `lg`).
- Bing is a trademark of Microsoft. The images are copyrighted by their respective owners and are intended for use as wallpaper only. This extension is not affiliated with Microsoft or Bing.

## Source, issues and translations

Development happens at <https://github.com/bigmalove/cinnamon-bing-wallpaper>. Translations live in `po/`; `zh_CN` is included.
