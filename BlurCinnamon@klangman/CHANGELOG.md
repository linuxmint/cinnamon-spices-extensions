# Changelog

## 1.4.0

* Added the ability to apply effects to the Desktop background image (you can Dim, Blur and Desaturate, but currently you can't colorize the background image)
* Improved how the blur effect keeps in sync with the size of the the panels
* Always hid the parts of windows that are under the panels, even when no blur effect is need to be more consistent
* Several fixes , minor improvements, optimizations and simplifications to the code

## 1.3.0

* Replaced the Main Menu effects with generic Popup Menu effects which covers the main menu as well as all other Applet popup menus. 
* Added a Saturation option which allow you to desaturate the background overlay (0% grey scale to 100%)

## 1.2.0

* Added the ability (disabled by default) to apply effects to the Main Menu (menu@cinnamon.org)
* Improve the wording of several configuration options to make it more clear what they do

## 1.1.0

- Added the ability to apply different effects for every panel (or disable effects for some panels) based on the panel location and the monitor it is on
- Fixed the blur overlay animation for showing/hiding a panel when the panel is not set to "Always show panel"
- Simplify the settings: always show the dimming color but default to black giving a traditional dimming effect
- Added an option to prevent the extension from modifying the panel setting, so it it will only add a blur effect under the panel. This is useful when using a theme that is already transparent and you want the themes settings to remain

## 1.0.0

* Initial version committed to cinnamon spices
