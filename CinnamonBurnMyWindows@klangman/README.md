# CinnamonBurnMyWindows

Window open and close effects for the Cinnamon desktop

This is a Cinnamon port of the Gnome extension Burn-my-Windows which can be found here: 

https://github.com/Schneegans/Burn-My-Windows

**Please go to the above link and support their project since this is merely a port of their fine work!**
**But DO NOT use this Github link to report issues. See Feedback section below**

## Requirements

Cinnamon 6.2 (Mint 22) or better. 

This extension needs the Cinnamon.GLSLEffect class which is only available in Cinnamon 6.2.

## Known issues

In the setting configure window under the "Effect Settings" tab, when changing the "Show setting for effect" drop-down to select a different effect, sometimes the contents under the "Effect Specific Settings" title will not properly update. Because of this, only a subset of the available options are visible. I believe this is a Cinnamon bug. You can force Cinnamon to properly redraw the options by selecting the "General" tab then returning to the "Effect Settings" tab again. After that, the complete set of "Effect Specific Settings" should be visible.

When closing the Steam Client "setting" window the 'close window effect' does not show the windows contents, resulting in the closing effect to show where the window had existed but otherwise has no negative effect.

Starting VirtualBox shows a full screen animation of both the Open and Close effect even when the window is opening. I assume this is caused by some weirdness with how VirtualBox was written.

The Doom open effect seems to finish animating at a noticeably lower position than where the window is actually located. This results in the sudden jump up after the animation is completed. When used as a close effect it works correctly.

All open window effects seem to animate in a location that is one pixel off the windows real location. This causes a very small (nearly unnoticeable) jump of the window after the animation has finished. The only exception is "Doom", which as stated above has a more pronounced jump.

The window shadows are not part of the animation and therefore they suddenly appear or disappear right after or before the animation.

### Currently these effects are working in Cinnamon:

- Apparition
- Doom
- Energize A
- Energize B
- Fire
- Focus
- Glide
- Glitch
- Hexagon
- Incinerate
- Pixelate
- Pixel Wheel
- Pixel Wipe
- Portal
- TV Effect
- TV Glitch
- Wisps

### Effects currently disabled:

Because Cinnamon is missing a required API, the following effects are disabled. I am hoping to find a way around this issue:

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
