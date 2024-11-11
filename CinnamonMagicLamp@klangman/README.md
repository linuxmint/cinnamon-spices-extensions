# CinnamonMagicLamp

A compiz like magic lamp effect for the Cinnamon desktop based on hermes83's Gnome extension (https://github.com/hermes83/compiz-alike-magic-lamp-effect). **Please see Feedback section below to report issues, DO NOT open issues on hermes83's Gnome extension github**

This Cinnamon extension will create a Magic Lamp minimize and unminimize effect

## Requirements

Cinnamon 5.6.8 (Mint 21.1) or better.

To properly animate in relation to the window-list icon, you need to be using a window-list applet that sets the icon geometry. Otherwise the animation will animate from/to the middle of the monitor on the Cinnamon panel edge rather than an animation specific to the window and it's window-list icon. The pre-installed "Window list" and "Grouped window list" applets work fine as does "Cassia Window list" (version 2.3.2 or better). CobiWindowList does not currently set icon geometry.

This extension requires no other packages other than what is included in a default installation of Mint 21.1 or better.

## Known issues

For some reason the Steam client does not support window cloning when minimized, therefore the "minimize" effect will show a blank/black window rather than the correct window contents. I have not seen any other applications show this behaviour.

## Installation

1. Right click on the cinnamon panel and click "System Settings"
2. Click on the "Extensions" icon under the "Preferences" category
3. Click the "Download" tab and then click the "Magic Lamp Effect" entry
4. Click the "Install" button on the right and then return to the "Manage" tab
6. Select the new "Magic Lamp Effect" entry and then click the "+" button at the bottom of the window
7. Use the "gears" icon next to the "Magic Lamp Effect" entry to open the setting window and setup the preferred behaviour

## Feedback

Please leave a comment here on cinnamon-spices.linuxmint.com or you can create an issue on my "Cinnamon Magic Lamp" development GitHub repository if you encounter any issues with this extension:

https://github.com/klangman/CinnamonMagicLamp

This is where I develop new features and test out any new ideas I have before pushing to cinnamon-spices.

If you use this extension please let me know by "liking" it here and on my Github repository, that way I will be encouraged to continue working on the project.

Icon based on an icon by Nikita Golubev (https://www.flaticon.com/free-icon/magic-lamp_1065505)
