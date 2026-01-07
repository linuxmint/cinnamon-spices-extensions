
### 1.0
 * Initial release

### 1.1
 * Improve multi-monitor support with automatic panel reinitialization on display changes
 * Fix width calculation using proper preferred width methods, added override for width calculation for Grouped Window List as applet's width doesn't update on window close
 * Reduce CPU usage by skipping style checks on hidden panels, increasing polling intervals, and removing redundant animation callbacks
 * Fix auto-hide toggle logic and panel visibility issues
 * Add dynamic window tracking for better panel updates
 * Improve signal cleanup to prevent memory leaks
 * Add more valid children of panel to show panel on hover, including Grouped Windows List children
 
### 1.2
 * Add support for centering all panel orientations, including left and right panels
 * Add support for panel-speciifc settings, move settings from global to per-panel level
 * Add toggleable indicator showing a navigation-like bar over the dock trigger area
 * Reduce UI stutter from location offset
 * Fix more auto-hide toggle logic and panel visibility issues
 * Add option to zoom in/enlarge panel children on hover
 * Correct tooltips lasting longer than auto-hidden panel
 * Correct global panel theme inheritance
 * Add support for user-configurable minimum dock width