# Changelog

## 1.0.0

Initial release.

- Rounds the corners of every window by clipping the window actor with a fragment shader, so
  windows which draw their own decorations are rounded too.
- Optional hairline border, coloured from the window's own edge material rather than a fixed
  colour.
- Optional drop shadow drawn behind each window, following the rounded corners.
- Optional rounding of maximized windows. Fullscreen windows are never rounded.
