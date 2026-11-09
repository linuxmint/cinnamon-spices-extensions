<p align="center">
  <img src="icon.png" width="96" height="96" alt="Active Window Highlight icon">
</p>

<h1 align="center">Active Window Highlight</h1>

<p align="center">
  A clear, toolkit-independent focus indicator for Cinnamon — with an animated
  top bar, configurable frame and compositor-correct stacking.
</p>

<p align="center">
  <a href="https://github.com/oss-singularity/cinnamon-active-window-highlight/actions/workflows/check.yml"><img alt="Checks" src="https://github.com/oss-singularity/cinnamon-active-window-highlight/actions/workflows/check.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License GPL-2.0-or-later" src="https://img.shields.io/badge/license-GPL--2.0--or--later-6f5bd5"></a>
  <img alt="Cinnamon 5.8 or newer" src="https://img.shields.io/badge/Cinnamon-5.8%2B-75c46b">
  <img alt="Toolkit independent" src="https://img.shields.io/badge/windows-GTK%20%7C%20Qt%20%7C%20Wine-4f7ee8">
</p>

<p align="center"><strong>Make the focused window unmistakable.</strong><br>
Keep your place across GTK, Qt, Wine and every other window on the desktop.</p>

<p align="center">
  <img src=".github/social-preview.png" width="100%"
       alt="Active Window Highlight for Cinnamon — compositor-level focus indicator">
</p>

<p align="center">
  <img src="docs/settings-window-english.png" width="100%"
       alt="Active Window Highlight settings window with configurable top bar and frame options">
</p>

<p align="center"><sub>Configure the highlight live through Cinnamon's native extension settings.</sub></p>

The extension draws at compositor level, so the highlight also works around
Chromium, Qt, Wine and other non-GTK windows.

## Highlights

- A configurable four-sided frame with independently controlled color,
  thickness, opacity and top-corner radius, plus a switch for rounded or
  square top corners.
- An optional animated gradient bar above the focused window.
- Live settings through Cinnamon's native extension dialog.
- Support for normal windows, dialogs, modal dialogs and utility windows.
- Correct Muffin stacking: always-on-top windows and Cinnamon Shell surfaces
  remain above the highlight.

### Highlight detail

![Rounded blue active-window frame and animated top bar](docs/active-window-highlight.png)

The default frame is blue, 1 px wide and 80% opaque. Its top corners use a
configurable 8 px radius, matching the default Mint-Y Cinnamon window theme,
while its bottom corners stay square to match Cinnamon's window shape. Normal
windows, dialogs, modal dialogs and utility
windows are supported. Fully maximized windows keep the top highlight bar
visible while the frame is hidden, so the content is not surrounded by an
unnecessary 1 px outline. True fullscreen and minimized windows are ignored.
The top frame corners are rounded by default and can be switched to square
corners. The radius field remains visible but is disabled while square corners
are active. All appearance options are exposed through Cinnamon's native
extension settings.

Both the bar and frame are stacked immediately above the focused window. Other
windows that Muffin keeps higher — including **Always on Top** windows — remain
above the highlight. Cinnamon's start menu, Expo, overview and other Shell
surfaces remain above it as well. When a window frame touches a Cinnamon panel,
only the overlapping edge segment (1 px by default) is mirrored above that
panel so the panel cannot hide the border; the full highlight is never raised
above the Shell.

> **Screenshot note:** A “current window” capture may omit the animated top bar
> because it is a Cinnamon compositor overlay, not part of the application's
> own window surface. Use an area or full-screen capture when the complete
> highlight should be visible. This only affects screenshots, not the normal
> on-screen display.

## Installation

```bash
git clone https://github.com/oss-singularity/cinnamon-active-window-highlight.git
cd cinnamon-active-window-highlight
./install.sh
```

Then disable and re-enable **Active Window Highlight** in **System Settings →
Extensions**. The installer does not alter enabled extensions or restart
Cinnamon automatically. To install a later version, run `git pull` in the
checkout followed by `./install.sh` again.

Run `./uninstall.sh` to remove the extension files. Disable the extension
before uninstalling it. User settings are deliberately retained.

## Requirements

Cinnamon 5.8 or newer is supported. The extension has no separate runtime
daemon and no toolkit-specific dependency.

## Development

```bash
make check
```

The checks validate JavaScript syntax, compositor-stacking invariants, JSON
schemas and shell scripts. Every push and pull request runs the same validation
in GitHub Actions.

## Origin and license

The animated trapezoid top-bar design and its gradient animation are derived
from **Active Window Indicator** by `fabiodamio`, as distributed in Linux
Mint's `cinnamon-spices-extensions` repository. This project adds the
toolkit-independent four-sided frame, dialog support, a unified settings
schema and corrected Cinnamon UI layering. See `ATTRIBUTION.md`.

Licensed under GPL-2.0-or-later. See `LICENSE`.
