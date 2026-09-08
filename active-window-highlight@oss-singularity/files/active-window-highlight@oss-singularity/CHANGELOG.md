# Changelog

## 2.0.1 — 2026-09-08

- Use the focused Cinnamon settings screenshot as the official Spices/Store
  preview and keep the public packaging source reproducible.

## 2.0.0 — 2026-09-08

- Keep the top highlight bar visible for fully maximized windows while hiding
  the frame, so maximized content is not surrounded by a 1 px outline.
- Keep true fullscreen windows fully unobstructed and add a setting to switch
  the top corners between rounded and square, with a working top-corner radius
  control in the native settings dialog. The default radius is 8 px to match
  the active Mint-Y Cinnamon window theme, and the default frame opacity is
  80%. The radius field stays visible but is disabled when square corners are
  selected.
- Keep the configured frame edge visible when a focused window is docked against
  a Cinnamon panel without lifting the complete highlight above the Shell.

## 1.2.0 — 2026-08-24

- Use English as the default language throughout the native settings dialog.
- Add automated repository checks and refresh the public project presentation.

## 1.1.1 — 2026-08-23

- Keep the highlight directly above its focused window instead of above every
  application window, so Always-on-top windows correctly cover it.
- Follow Muffin restacking changes while the focused window stays unchanged.

## 1.1.0 — 2026-08-11

- Add a configurable four-sided highlight for all supported window toolkits.
- Default the frame to 1 px.
- Draw one border instead of four edge actors, with configurable top rounding
  and Cinnamon-style square bottom corners.
- Put highlight actors below Cinnamon menus and panels, fixing menu overlap.
- Preserve the Active Window Indicator top-bar design and settings.
