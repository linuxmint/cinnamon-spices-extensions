### 2.20

* Split codebase after Cinnamon version 5.4 because of breaking changes and fix breakages.

### 2.1.0

* Change Settings and Grid so they can be initialized from inside the app itself.
* Add support for uneven rows and columns

### 2.0.0

#### Structural

* Using Typescript (WIP, should enable stricter type checking)
* Uses webpack for build (was not necessary, but I didn't want to bother with fixing recursive imports)
* Enables multiversion support (I won't modify anything under Cinnamon version 3.8)
* Factor ui elements out into their own files

#### Enhancements

* UI facelift (using symbolic icons)
* Port enhancement from cinTile where grid is only show on the monitor the focused window is on
* Resolves [#299](https://github.com/linuxmint/cinnamon-spices-extensions/issues/299) - Port fix for sizing issues with windows with client headers
* Resolves [#367](https://github.com/linuxmint/cinnamon-spices-extensions/issues/367)
* Resolves [#336](https://github.com/linuxmint/cinnamon-spices-extensions/issues/336)
* Resolves [#191](https://github.com/linuxmint/cinnamon-spices-extensions/issues/191) - Add Support for move windows between monitors (essentially move the singular grid ui from window to window.) Animations are a still weird as grids come in from the top left, always.
* Add Keybindings Legend to settings for current available keybindings

### 1.0.0

  * Added compatibility for Cinnamon 3.8+.

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