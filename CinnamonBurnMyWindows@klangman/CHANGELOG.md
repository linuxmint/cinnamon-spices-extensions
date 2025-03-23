# Changelog

## 0.9.9b

* Fix broken version 0.9.9, I forgot to copy over some changes from my dev branch for 0.9.9

## 0.9.9

* Added a "Reset to default" button for each effect under the "Effect Settings" tab. 
* Added an "Open effect preview window" button to "Effect Settings" tab. It opens a preview window to test out the currently selected effect in the "Show setting for effect" drop down list.
* Added a custom "scale" widget that puts the label, scale, and number in a line to save GUI space. It also "marks" the default value for the setting.
* Fixed the issue where some setting under the "Effect Settings" were not appearing properly after changing the "Show settings for effect" drop-down. It turns out that adding a common element at the end of the effect settings somehow makes the issue disappear. So I didn't really "fix" anything but adding the "Open effect preview window" button at the bottom of the effect settings section has the added benefit of avoiding the issue.
* Added a custom "About page" widget to improve the look of the about tab and changed the URLs to clickable links. Also added a "Report an issue" link and the version number to the about tab.
* Added buttons to set or clear all the random set check boxes.
* Added BMW Gnome version changes to add a random color option to the Fire effect, also added a "Nuclear" preset.
* Added an Doom setting option to manually adjust the target location for the Doom open effect so that people can work-around the Doom effect issue while I work on finding a proper fix.

## 0.9.8

* Added new effects from the Gnome version (Aura Glow, Mushroom, RGB Warp, Team Rocket)
* Added Magic Lap effect based on hermes83/compiz-alike-magic-lamp-effect (same as CinnamonMagicLamp)
* Added the ability to apply effects to the minimize & unminimize events
* Fixed an issue where the window was jumping a pixel to the right post open animation (finally!)
* Added Fire effect presets (5 pre-configured fire setups)
* Changed the Random Effects tab to use a standard List widget
* Moved the Application Specific settings options to it's own tab
* Added a custom color selection widget to save configurator GUI space
* Use WM_CLASS when adding a app specific setting if no app can be found
* Improvements to the Focus effect (from Gnome version)
* Added an "About" tab with credits to the various authors

## 0.9.7

- Added options in the configuration that allows you to define which effects will be used (if any) for dialog windows (i.e. a file open dialog). This allows you to use a more subtle or shorter running effect (i.e focus or glide) for all the dialog windows which are typically opened/closed more frequently.
- Added support for using WM_CLASS names in the "application specific settings" table in the config.
- Added two default "application specific settings" table entries for "VirtualBox" and "VirtualBoxVM. This addresses the Virtualbox issue described in the readme.md

## 0.9.6

* Enabled the "Fire" effect
* Apply a visual fix to "Incinerate" that was fixed in the Gnome extension recently
* Reordered the code to make it a bit easier to maintain

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
