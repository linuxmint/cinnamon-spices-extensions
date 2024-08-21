# Changelog

## 1.0.3

* Fix the panels showing up in an incorrect location when animating (or when holing Ctrl+Alt after a workspace switch), but I still see occasional panel painting issues.
* Added a new setting option to disable showing the panels when animating (as a way to avoid any panel animation issues you might be having)
* Changed the workspace switch OSD to only show after the animation so that there is no odd OSD artifacts while animating
* Changed author to myself since the extension has no maintainer currently

## 1.0.2

* Ask Cinnamon to play the workspace switch sound (if it's enabled) when switching workspaces
* Free some connections and properly destroy some actors to avoid error messages in .xsession-errors
* Remove some debugging messages that were polluting the .xsession-errors file
* Note: Most changes from now on are only for the Cinnamon 5.4+ version to avoid breaking the older releases which I am not testing

## 1.0.1

* Updated for Cinnamon 5.4+ (tested on latest as well 6.2.9)
* Added README and CHANGELOG files

## 1.0.0

* Versions prior to 1.0.1 had no version numbering
