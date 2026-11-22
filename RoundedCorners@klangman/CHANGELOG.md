# Changelog

## 1.0.2

* Improved Cinnamon 6.8 support.
* Added colored, gradient and rainbow animated shadows.
* Added border color option to match the theme's accent color.
* Fix the effects on scaled display (thanks to [thebrickmaster626-bit](https://github.com/klangman/CinnamonRoundedCorners/pulls?q=is%3Apr+state%3Aclosed+author%3Athebrickmaster626-bit) for the fix).
* Fix for window size tracking when expanding the window (the issue was particularly visible on left side window resizing).
* Fix an issue when unminimizing an Electron application.
* Fix missed rounding when an XWayland surface attaches late (thanks to [Geequlim](https://github.com/klangman/CinnamonRoundedCorners/pulls?q=is%3Apr+state%3Aclosed+author%3AGeequlim) for the fix).
* Fixed an issue where the windows border and shadow is drawn before the windows first frame is drawn (happens for slow starting applications).

## 1.0.1

* This fixes an issue where the VRAM is consumed at a high rate during resizing a window or when moving a window when it's partly off the screen. If the resize/movement continued for a number of seconds it could lead Cinnamon to becoming unresponsive for quite a time until a GC cycle is started.

## 1.0.0

* Initial version committed to cinnamon spices
