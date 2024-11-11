# Changelog

## 0.9.5

* Added a new "Focus" effect by Justin Garza

## 0.9.4

* Fixed an issue that could interfere with other Cinnamon effects by returning true from Cinnamon's _shouldAnimate(). Some effects like Restore and Manximize might occur even when they were disabled in the Cinnamon Effects setting application. Also some BurnMyWindows effect could happen on events other than window open/close events (but I didn't ever see this occur myself).

## 0.9.3

* Fix Randomized effects so that when the Doom effect is enabled under "Random Effects" it can actually be randomly selected for use

## 0.9.2

* Added application specific effect settings that override the default effects setting when a specific application window is opened/closed
* Added a "none" options to the effect drop-down lists which will perform no effect and allow the cinnamon default effect to apply
* Added a button in the General configuration tab which will add an "Application Specific Settings" table entry for the application of the window that last had the focused.

## 0.9.1

* Initial version committed to cinnamon spices
