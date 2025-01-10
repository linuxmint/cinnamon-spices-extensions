# Changelog

## 2.0.5

- 2nd attempt to fix a bug that occurs when a windows workspace can't be determined
- Make windows that are 'visible on all workspaces' also visible on all cube faces
- Release the key press/release event listeners when the cube is destroyed

## 2.0.4

- Fix a bug that occurs when a windows workspace can't be determined
- Use panel APIs to show/hide panels rather than using Clutter APIs against the panels actor (for better compatibility with the Blur Cinnamon extension)

## 2.0.3

- Fix issues when running under Cinnamon 6.4

## 2.0.2

- Added APIs used by the "Smart Panel" applet so it can use Desktop Cube in more cases
- Fixed a case where the Cube was used under the Expo (using the Left/Right arrow keys when the Expo was open). Using the Cube in this case was visually awkward and unnecessary so I disabled using Cube for this scenario
- Fixes issues when attempting to move a window to an adjacent workspace (Shift+Ctrl+Alt+Left/Right) for a window that is visible on all workspaces

## 2.0.1

- Allow Desktop Cube to work with the "Smart Panel" applet

## 2.0.0

* Added ability to use Cube effect when changing the workspace via the "Workspace Switcher" applet
* Added ability to use Cube effect when changing the workspace by activating a window on a different workspace
* Added ability to use Cube effect when using the workspace "Direct Navigation" hotkeys
* Enabled showing the desktop icons during the Cube effect
* Allow the Cube to queue up hotkey press actions rather than ignoring hotkey presses during the Cube animation
* Changed the "Animation duration" option to be a number of seconds (0.1 to 4 seconds)
* Changed the Pullaway setting to be a "Cube size" as a percentage of the screen size
* Added button to the Cube config which will launch the keyboard setting dialog as a convenient access to setting workspace related hotkeys
* The Cube rotation and the scale down to the target Cube size effects will now run in parallel, this saves animation time and makes the animation look smoother. As a side effect, the easing for the scale down action is now hard-coded to "easeNone" and the user defined "Scale effect" is used only for the "Unscale" action. This is assuming there is a need to scale at all, ie. the Cube size is not 100%, in the "Cube size is 100%" case the easing will still apply.
* The "Rotate easing" effect is now only applied to the ending of the rotate when there is no 2nd rotation that is need and there is no immediate unscaling needed. Likewise, easing is only applied at the start of the rotate when there is no scaling needed (i.e only when hot-keys are used a 2nd time while holding the modifier keys). This makes the whole animation smoother particularly when Bounce/Back/Elastic easing is used.
* Added a button to the Desktop Cube setting dialog under the "Effect Easing" section which will open the easing information website

## 1.1.0

* Fixed the "not animating" issue under Mint 21+
* Fixed the under cube background not dimming issue
* Removed some xsession_errors debugging messages

## 1.0.2

* Added an option to remove the panels from the animation effect
* Fix the Effect Setting options that were broken when the "tween" option widget was removed starting with cinnamon 5.4
* Allow Cinnamon to play the workspace switch sound if it is enabled
* Note: All changed from here on will only be for the Cinnamon 5.4+ version
* Change info.json author to me, since there is currently no maintainer

## 1.0.1

* Updated for Cinnamon 5.4+ (tested on latest as well 6.2.9)
* Added README and CHANGELOG files

## 1.0.0

* Versions prior to 1.0.1 had no version numbering
