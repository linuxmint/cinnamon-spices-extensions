# Flipper

Fancy workspace switching extension with 7 different effect animation options: Cube, Deck, Flip, Pop, Rolodex, Slide and Stack!

Each effect has 5 user adjustable settings: Animation duration, Zoom amount, Fade transition, Background dim amount, Transition easing.

You can use your favorite effect or use a random effect chosen from your selection of the 7 effects.

Also has a "Disabled" option which will not only disable all the Flipper effects but also prevents the default Cinnamon workspace switch effect. Great for people who want a super fast workspace switch but don't want to disable all the other Cinnamon desktop and window effects.

## Requirements

Version 2 requires Cinnamon 5.4 (Mint 21) or better

The older Flipper version (with limited features) will be used on older Cinnamon versions.

Tested on: Mint 21 / 21.1 / 21.3 / 22 and Fedora Cinnamon-Spin 40.

## When is the Flipper effect used?

There are a number of ways to switch the current workspace, all of following will be handled by Flipper starting with version 2:

1. The "Switch to left/right workspace" hotkeys (under Keyboard settings, Shortcuts tab, Workspace category) Default hotkey: Ctrl + Alt + Left/Right_Arrow_Keys

2. The "Switch to workspace 1-12" hotkeys (under Keyboard settings, Shortcuts tab, Workspace/Direct Navigation category) Default hotkey: unassigned

3. Using the "Move window to the left/right workspace" hotkeys (under Keyboard settings, Shortcuts tab, Windows/Inter-workspace category) Default hotkey: Shift + Ctrl + Alt + Left/Right_Arrow_Keys

4. Clicking on a workspace button in the "Workspace Switcher" applet (can be disabled in the configuration)

5. When changing the focus to a window on another workspace by using the Window-List or Alt-Tab when they are configured to show windows from other workspaces. (can be disabled in the configuration)

6. When using the "Smart Panel" Applet features that change the workspace (Also plan to change "Desktop Scroller" to use Flipper as well in the near future)

When switching the current workspace using Expo ("workspace selection screen" Default hotkey: Ctrl + Alt + Up_Arrow_Key) the Flipper effects will not be used. This includes clicking on a workspace in the Expo or using the Left/Right arrow keys when the Expo is open.

If you know of other methods of switching the workspace where the Flipper effect is not currently used, please let me know so I can see if I can find a way to enable the Flipper for that path as well.

## Known Issues

1. When using Flipper with two or more Monitors attached, the effects will only appear on the primary display. At some point I plan on adding options to control how Flipper works on multi-monitor setups, but it might be a while before I find the time to work on that.

2. If you enable the "Include Panels" option in the Flipper configuration, the panels will disappear while the effect is in action and then reappear when it is done. This is far from ideal, so I recommend that you leave this option disabled so that the panels remain hidden, only reappearing after returning to the normal desktop.

## Installation

- Right click on the cinnamon panel and click "System Settings"
- Click on the "Extensions" icon under the "Preferences" category
- Click the "Download" tab and then click the "Flipper" entry
- Click the "Install" button on the right and then return to the "Manage" tab
- Select the new "Flipper" entry and then click the "+" button at the bottom of the window
- Use the "gears" icon next to the "Flipper" entry to open the setting window and setup your preferred behavior

## Feedback

Please leave a comment here on cinnamon-spices.linuxmint.com

To report a bug or submit a feature request, open an issue here: [GitHub Spices Repo](https://github.com/linuxmint/cinnamon-spices-extensions/issues/new/choose)
