### 0.6.1

* The picker animation no longer drops frames. Measured on the running desktop,
  the mean frame interval during the gesture went from 50ms with 131ms stalls to
  9.1ms with nothing over 18ms, which is within half a millisecond of not
  running the extension at all.

### 0.6.0

* The tab grows into the picker rather than cross-fading, so the two read as one
  object at two sizes. Motion follows the cubic bezier curves Microsoft
  publishes for Fluent, not a named approximation of them.
* Opening and closing both wait for the pointer to mean it, so brushing past the
  tab no longer opens it and a moment of wobble no longer closes it.
* Every coordinate in the overlay is an integer, and neighbouring zones share
  their boundary exactly, so nothing is resampled and no seam is a pixel wider
  than its neighbour.

### 0.5.1

* Touching the layout tab opens the picker. It previously only responded within
  24px of the screen edge, which is less than the height of the tab itself, so
  hovering the thing did nothing.

### 0.5.0

* The layout tab now appears as soon as a window is picked up, anywhere on
  screen, rather than only once the pointer nears the top edge. The feature was
  invisible to anyone who did not already know it was there.

### 0.4.0

* Snap bar when dragging a window to the top of the screen, and the same picker
  on `Super+Z`
* Zone editor on `Super+Shift+Z`, with custom layouts saved between sessions
* Dragging the border between two tiled windows resizes both
* Saved arrangements on `Super+G`, restored onto windows already open
* Keyboard placement for halves, fill and center, all rebindable
* Configurable gaps, off by default
