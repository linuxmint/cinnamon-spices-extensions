# Active Window Highlight

![Active Window Highlight Cinnamon settings](screenshot.png)

A clear, toolkit-independent focus indicator for Cinnamon. It draws an
animated top marker and configurable frame around the focused window at the
compositor level, including GTK, Qt, Wine and other window toolkits.

This is the `2.0.1` public-release payload for the OSS Singularity project.

## Features

- Animated gradient marker above the focused window.
- Configurable four-sided frame with color, width, opacity and top-corner
  radius.
- Rounded top corners by default, with a switch for square corners. The radius
  field remains visible but is disabled while square corners are selected.
- Fully maximized windows keep the top marker while the frame is hidden.
- True fullscreen and minimized windows are left unobstructed.
- Native Cinnamon settings; no daemon, web service or telemetry.

## Requirements

Cinnamon 5.8 or newer is declared in `metadata.json`.

## Source and license

Source: [oss-singularity/cinnamon-active-window-highlight](https://github.com/oss-singularity/cinnamon-active-window-highlight)

Licensed under GPL-2.0-or-later. Attribution for the predecessor top-marker
design is included in `ATTRIBUTION.md`.
