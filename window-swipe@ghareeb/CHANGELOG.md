# Changelog

All notable changes to Window Swipe are documented here. Window Swipe follows
[Semantic Versioning](https://semver.org/):

- **PATCH** (1.0.1): bug fixes only.
- **MINOR** (1.1.0): new features that keep existing settings working.
- **MAJOR** (2.0.0): changes that are not backwards compatible.

## [1.0.0] - 2026-10-12

First public release.

### Features
- Three- and four-finger horizontal touchpad swipes slide between the windows of the current
  workspace, following the fingers and drawn as an overlay; real windows never move.
- Velocity-matched glide on release: no jump at release, no overshoot, and fast flicks finish at
  the speed they were released.
- Rapid, overlapping swipes take over the moving windows from their current position and speed.
- Window order follows the Plank dock while Plank is running (first enabled dock). Apps that are
  not pinned follow in opening order. The fallback is window opening order.
- Minimized, maximized and fullscreen windows and the desktop are supported, with edge
  resistance at both ends of the list.
- Native Cinnamon settings window (System Settings → Extensions → gear):
  - Animation: Responsive, Relaxed, Calm (default), Gentle.
  - Touchpad sensitivity: Balanced (default), Sensitive, Less sensitive, Flick-friendly, Deliberate.
  - Navigation: Plank dock order (default) or window opening order; three and four fingers
    (default), three only or four only.
  - Changes apply from the next swipe without a restart. Reset to defaults is available, and
    invalid values fall back to the defaults.
- Gestures the extension doesn't use keep their Cinnamon action; disabling the extension
  restores Cinnamon's gesture handling.

### Known limitations
- Within one swipe the slide cannot pass the starting window to the window on the other side
  (Touchégg locks a swipe's direction when it starts).
- Tested on Cinnamon 6.6 (Linux Mint 22.3, X11) with Touchégg 2.0.16 on a single monitor.

### Development history
Before this release, Window Swipe went through private development builds with internal numbers
(0.8 to 1.2.0). Those builds were never published, and their numbers are unrelated to public
releases. 1.0.0 is the first public version.

[1.0.0]: https://github.com/m7ghareeb/window-swipe/releases/tag/v1.0.0
