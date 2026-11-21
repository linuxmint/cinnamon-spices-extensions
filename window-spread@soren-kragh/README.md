# Window Spread

Arranges **Show all windows** (Scale) and the windows inside each workspace in
**Show all workspaces** (Expo) by where your windows really are and how big they
are, instead of in a grid filled in stacking order: a window doesn't jump to
another place just because you focused a different one.

## What you get

* Thumbnails appear near their real windows and keep their relative sizes.
* A choice of layouts for each view: Optimizer (the default), Push apart,
  Ordered rows and Equal grid.
* Arrow keys in Show all windows move to the nearest thumbnail in that
  direction.
* Quick: when nothing has changed, the previous arrangement is reused.
* Minimized windows are shown like any other, at their normal place and size.
* Everything else stays Cinnamon's own: how you open the views, animations,
  titles, close buttons and clicking a window.

## Settings

In System Settings → Extensions, each view has its own tab with an **Enable
Window Spread** switch and its layout options; with both off, Cinnamon behaves
exactly as without the extension. Hover over a setting for an explanation.

## Compatibility

Cinnamon 6.0 to 6.8, on one or several monitors.

## Troubleshooting

Switch on **Write diagnostics to the log** on the General tab, open the view,
and look in Looking Glass (Alt+F2, then `lg`, Log tab) for lines starting with
`[window-spread]`. If a layout fails, the extension falls back to Cinnamon's
own arrangement for that time and logs the error.

## Bug reports and development

Report bugs as an issue in the Cinnamon Spices extensions repository, titled
`window-spread@soren-kragh: ...`. Source, design notes and the test suite:
https://github.com/soren-kragh/window-spread
