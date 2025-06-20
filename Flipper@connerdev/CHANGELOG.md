# Changelog

## 2.0.2

* Added a Disable effect option which will use no workspace switch effect, not even the default Cinnamon workspace switch effect. Since Cinnamon does not offer a way to independently disable the workspace switch effect, with this option you can disable the effect but still allow of the desktop and window effects.
* Fixed the disappearing effect settings problem using a "hack" fix. Adding a permanent empty label field below the effect settings avoids the issue.

## 2.0.1

- Make windows that are 'visible on all workspaces' also visible on the animated workspace clones
- Use panel APIs to show/hide panels rather than using Clutter APIs against the panels actor (for better compatibility with the Blur Cinnamon extension)

## 2.0.0

- Added ability to use Flipper effects when changing the workspace via the "Workspace Switcher" applet
- Added ability to use Flipper effects when changing the workspace by activating a window on a different workspace
- Added ability to use Flipper effects when using the workspace "Direct Navigation" hotkeys
- Implement "Extension Workspace Switching API" used by smart-panel 1.4.2 to switch workspaces using the Flipper effect
- Added a configuration option to control if the "Workspace Switcher" applet will use the Flipper effect
- Added a configuration option to control if switching to a window on a different workspace will use the Flipper effect
- Use independent effect settings so each effect remembers it's own settings
- Added a "Randomized" effect option that will randomly select a effect for each workspace transition initiation
- Added a set of configuration options that allows you to control which effects are in the Randomized set
- Removed the "Include Background" option and hard-coded Cube effect to include a cloned background, all the other effects will see the original desktop background dimmed according to the "Background Dim Amount" setting

## 1.0.6

* Fix "opacity" .xsession-errors messages when using the "Back" or "Elastic" easing options

## 1.0.5

* Changed "dim_factor" to "opacity" since "dim_factor" is no longer defined
* Stop setting "brightness" since it's no longer defined
* Activate the new workspace on a change to avoid focus change errors
* Changed the "Include Background" option default to true

## 1.0.4

* Added a fix to make the animation performance better (smoother).
* Replaced usage of deprecated Actor.scale_center_[x/y] with actor.set_pivot_point().

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
