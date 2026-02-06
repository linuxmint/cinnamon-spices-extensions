# Changelog

## 1.7.2

* Added a panel settings option to "Brighten" (dim=0 and saturation=100) a panel when the mouse is hovering over a panel (disabled by default)
* Fixed an issue where the 6.6 Menu sidebar was not maintaining its transparency after changing the "Maximum sidebar width" menu option.
* Fixed an issue with the standard cinnamon minimize animation when a window has a blurred background applied.

## 1.7.1

* Added a "Transparent" option to Panels/Menus/Tooltips/Notifications setting. This will provide a true transparent option where whatever is below the effected element will be visible (no blurring, not saturation). For panels this is no different to the Transparent Panels extension.
* Added a "Default window settings" row to the Windows effect table. When this row is enabled, all windows will have effects applied, except application windows that match some other row in the table, in which case that rows settings will apply (a disabled row will cause the window to have no effects applied despite the "Default window settings" row being enabled).
* Added code to improve the Cinnamon 6.6 Menu effects (sidebar transparency).
* Added code to improve the Cinnamon 6.6 "Cinnamon" theme support (might also help with other themes that use CSS padding).
* Added a "Custom CSS" option to the "Advanced" panel setting table. Using this option, users who know CSS can apply options to control the panels like shrinking the panel to be less then the screen width, adding rounded corners, adding borders, etc.
* Another attempt to improve the performance of opening menus after the 1st time any particular menu is opened.
* Fixed some blurring artifacts seen when restoring a minimized window while using the "Focused window backlight effect".

## 1.7.0

* Added the ability to apply effects to Desklet backgrounds.
* Significant configuration GUI redesign to use fewer tabs. Adding a new tab for Desklets would start to cause an unreasonable GUI window width.
* Fixed the rounded corner effect so that it produces a much smoother edge.
* Improved how the blurred panel animates when hiding or showing a panel.
* Fix for Notification and Windows not getting updated when changing generic settings
* Added an "About" tab to the configuration GUI
* Modified the Icon so that it does not have a white border
* Added a hack fix for panels with custom CSS sizes
* Fix a naming conflict with the rounded corner effect during upgrading the extension.
* Added options to use generic settings when using the panel specific settings option
* Some improved configuration GUI option names and tooltips

## 1.6.1

* Fixed a 1.6.0 regression where the dimming of desktop effects are not removed after disabiling the desktop effects on the general page in the config window.
* Added support for rounded cinnamon panels, but currently to enable rounded corners in Cinnamon panels you need to manually edit your cinnamon.css file.

## 1.6.0

* Added the ability to apply effects to application window backgrounds
* Allows to you adjust the opacity of application windows so that the Blur Cinnamon application window effects can be seen below any window
* Added a rounded corner effect which allows for rounded corners on the Blur Cinnamon effects when Popup Menus, Notifications, Tooltips and Application Windows are using rounded corners. Blur Cinnamon no longer overrides the rounded corner  settings that your theme defines for Menus, Notifications and Tooltips
* Added the ability to set a dimming color to the desktop background image
* Added an optional backlight effect to the focused window using the blur effect, allowing it to spill over the focused windows borders giving a backlight type effect. This is effect is disabled by default
* Added the ability to apply effects to titlebar context popup menus
* Added options so you can select which type of popup menus will have effects applied (applet popups, panel menus, titlebar menus)
* Fixed a bug where the blur intensity slider control for some components was only shown when the expo blur type was set to Gaussian
* Improve Popup Menu size tracking so that the blurred actor better follows the animated open/close effects

## 1.5.2

* When the theme override option is disabled, restore the theme's menu settings
* Fix an issue with Alt-Tab support after the extension is reloaded (after an update) or disabled
* Fix a typo in Notifications settings tab (Sent -> Send)

## 1.5.1

* Fix 1.5.0 regression, a missing function left out of the 1.5.0 merge into the spices repo

## 1.5.0

* Added effects to the Coverflow and Timeline Alt-Tab switchers (enabled by default)
* Added the ability to apply effects to the Notification popups (disabled by default)
* Added the ability to apply effects to the Panel Tooltip popups (disabled by default)
* Added a welcome Notification popup with a button to open the configuration window
* Added a panel option to restore the default (solid) look of the panel(s) when a window is maximized (thanks to [decsny](https://github.com/decsny) for some code)
* Fixed an issue where a blurred element remains visible after a menu is closed (thanks to [SpeeQz1](https://github.com/SpeeQz1) for the bug report)
* Fixed an issue where some signals are not disconnected when disabling the extension
* Rewrote some parts of the code to make it easier to maintain and reduce code duplication
* Improved popup menu performance in general, particularly when re-opening menus for a second time

## 1.4.2

* Fixed a typo in the code that prevented the effects from being removed from the desktop background image after disabling the extension (thanks to OthorWight for finding the issue).
* Fixed an issue where the Desktop Background was blurred on startup even when the "Only apply effect settings if the desktop is not in focus" option was enabled (thanks to AxeldeWater for spotting the issue).
* The Cinnamenu not blurring issue is is fixed [here](https://github.com/fredcw/Cinnamenu), see this [issue](https://github.com/linuxmint/cinnamon-spices-extensions/issues/873) to fix the Cinnamon Spices version

## 1.4.1

* Fix for the main menu's favorite box fading from a solid color into it's blurred state on open (Mint-Y theme)
* Take into account the popup-menu box margins when applying blurring so that blurring can be properly sized for the popup-menu (Orchis-Dark theme)
* Fix a typo in the setting window
* Properly free popup-menu blur elements
* Improve the transition of panels when disabling/enabling (i.e entering/exiting Overview) so that the panel does change in brightness suddenly
* Prevent errors under wayland (but the blur effects are still not working under wayland)

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
