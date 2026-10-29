# Window Swipe

Swipe horizontally with three or four fingers on the touchpad to slide between the windows of
the current workspace. The window follows your fingers, glides into place with momentum when
you lift them, and rapid swipes continue smoothly from wherever the previous one is.

*The screenshot is an illustration rendered from Window Swipe's own animation logic on a demo
scene, not a screen capture.*

## Features

- Smooth, macOS-inspired animation that starts at your fingers' speed, with no jump and no overshoot.
- Three- and four-finger swipes; rapid swipes take over the moving windows.
- Animation profiles: Responsive, Relaxed, Calm (default), Gentle.
- Switching sensitivity: Balanced (default), Sensitive, Less sensitive, Flick-friendly, Deliberate.
- Window order follows the Plank dock, falling back to opening order without Plank.
- Minimized, maximized and fullscreen windows and the desktop are included.
- Native settings window; changes apply from the next swipe, with no restart.

## Requirements

- Cinnamon 6.6 (tested on Linux Mint 22.3, X11) and Touchégg (installed with Linux Mint).
- In **System Settings → Gestures → Settings**, turn on **Enable gestures** (it is off by default).
- On the **Swipe** tab, **Left** and **Right** with three and four fingers must each have an
  action, not *Disabled*. Cinnamon's defaults already assign actions to them. Any action will do:
  Cinnamon only passes on gestures that have one, and Window Swipe takes these swipes over while
  it is enabled.

## Settings

Click the gear next to Window Swipe in **System Settings → Extensions**. Choose the animation
profile, the switching sensitivity, the window order (Plank dock or opening order) and the
fingers to use. **More options (…) → Reset to defaults** restores Calm and Balanced.

The sensitivity presets only decide what a swipe does when you lift your fingers. They don't
change how far your fingers travel; Touchégg and the touchpad driver set that.

## Known limitations

- Within one swipe you can move toward a window and back, but not past the starting window to the
  other side: Touchégg fixes a swipe's direction when it starts. Lift your fingers and swipe again.
- Only the current workspace and the monitor of the starting window are included.
- Tested on Cinnamon 6.6 (X11) with a single monitor.

## More information

Documentation, source code, issues and contributions:
<https://github.com/m7ghareeb/window-swipe>

Created by Mohamed Ghareeb ([@m7ghareeb](https://github.com/m7ghareeb)). License: GPL-3.0-or-later.
