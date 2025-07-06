# CinnamonBurnMyWindows

Window open, close, minimize and unminimize effects for the Cinnamon desktop

This is a Cinnamon port of the Gnome extension Burn-my-Windows which can be found here: 

https://github.com/Schneegans/Burn-My-Windows

Also includes a port of the Gnome Magic Lamp effect which can be found here:

https://github.com/hermes83/compiz-alike-magic-lamp-effect

**Please go to the above links and support their projects since this is merely a port of their fine work!**
**But DO NOT use these Github links to report issues. See Feedback section below**

## Requirements

Cinnamon 6.2 (Mint 22) or better. 

This extension needs the Cinnamon.GLSLEffect class which is only available in Cinnamon 6.2 or better.

## Known issues

1. When closing the Steam Client "setting" window the 'close window effect' does not show the windows contents, resulting in the closing effect to show where the window had existed but otherwise has no negative effect.
2. When running VirtualBox, some actions (like restarting Cinnamon or changing panel hide settings) will show a full screen animation of both the Open and Close effect. I assume this is caused by some weirdness with how VirtualBox was written. The problem can be avoided by using two "Application specific settings" list entries to disable open/close animations for the "VirtualBox" and "VirtualBoxVM" WM_CLASS names (entered under the "Application" entry box). New installs of this extension will have these entries by default, but installs that are upgraded to the latest version will need to manually enter these app rules to avoid the issues.
3. The Doom open effect seems to finish animating at a noticeably lower position than where the window is actually located. This results in the sudden jump up after the animation is completed. When used as a close effect it works correctly. There is a Doom effect option called "Y offset fix for open/unminimize events" which allows you to manually fix this issue while I look for a proper fix that works for everyone.
4. The window shadows are not part of the animation and therefore they suddenly appear or disappear right after or before the animation.
5. After upgrading to 0.9.8 the Fire effect setting and the effects included in the randomized sets will be reset to default.
6. After upgrading to 1.0.1 the Fire and Mushroom preset selections will be reset to default.

### Currently these effects are working in Cinnamon:

- Apparition
- Aura Glow
- Doom
- Energize A
- Energize B
- Fire
- Focus
- Glide
- Glitch
- Hexagon
- Incinerate
- Magic Lamp
- Mushroom
- Pixelate
- Pixel Wheel
- Pixel Wipe
- Portal
- RGB Warp
- Team Rocket
- TV Effect
- TV Glitch
- Wisps

### Effects currently disabled:

Because Cinnamon is missing a required API, the following effects are disabled. I am hoping I can enable these effect when Cinnamon 6.6 is available later this year:

- Broken Glass
- Matrix
- PaintBrush
- Snap Of Disintegration
- TRex Attack

## Installation

1. Right click on the cinnamon panel and click "System Settings"
2. Click on the "Extensions" icon under the "Preferences" category
3. Click the "Download" tab and then click the "Burn My Windows" entry
4. Click the "Install" button on the right and then return to the "Manage" tab
5. Select the new "Burn My Windows" entry and then click the "+" button at the bottom of the window
6. Use the "gears" icon next to the "Burn My Windows" entry to open the setting window and setup the preferred behaviour

## Feedback

Please leave a comment here on cinnamon-spices.linuxmint.com or you can create an issue on my Github (https://github.com/klangman/CinnamonBurnMyWindows) to give me feedback or to report any issues you find. 
**Please DO NOT open any issues against the original Gnome project. Open issues only on my Github or on cinnamon-spices so I can check if the issue has anything to do with my changes to support Cinnamon**

If you like this extension, please consider making a donation to the author of the original Gnome extension which makes up the vast majority of the code for this Cinnamon extension. Donation links can be found on his Github page:

https://github.com/Schneegans/Burn-My-Windows

If you want to help others find this Cinnamon extension, consider staring it here and on my Github page so that more people might learn of it's existence. The more stars it gets the more encouragement I'll have to continue working on it.
Thanks!

## Credits

Ported to Cinnamon by Kevin Langman

https://github.com/klangman/CinnamonBurnMyWindows

Based on the Burn-My-Windows code by Schneegans and contributors

https://github.com/Schneegans/Burn-My-Windows

The Magic Lamp Effect is based on code by hermes83

https://github.com/hermes83/compiz-alike-magic-lamp-effect
