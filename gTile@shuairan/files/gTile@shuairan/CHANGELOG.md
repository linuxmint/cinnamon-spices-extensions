### 1.0.0

  * Fixed for compatibility with modern versions of Cinnamon.

## Original Changelog

### v0.7
  * Cinnamon 2.4
  * put all settings to extension setting screen
  * AutoTile: only tile non-minimized windows
  * AutoTile: improve on multi monitor (only tile windows in current screen)

### v0.6
  * merge some upstream changes from vibou.gTile (V21)
  * exclude some apps with no wm_class. This is a wild guess to find apps which should not be tiled (like Hangouts)
  * hide on escape
	* better multi-monitor support
  * new feature: select and tile by keyboard (move with Arrows, Shift+Arrow to select area, space or enter to tile window)

### v0.5
  * support for latest cinnamon >1.8
  * settings-system is used (configure keyboard shortcut via extension settings)

### v0.3 thx to [dalcde](https://github.com/dalcde)
  * fixed conky-bug
  * changed compatiblity to match all 1.6 releases
  * changed grid color to blue
  * removed panel icon (use applet instead: https://github.com/shuairan/gTile-applet )

### v0.2
  * added support for different panel positions of cinnamon (top,bottom,both)
  * panel icon is now displayed

### v0.1
  * added support for cinnamon
  * fixed small offset