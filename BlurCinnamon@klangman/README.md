# Blur Cinnamon (now with Liquid Glass effect)

A Cinnamon extension to Blur, Tint, Desaturate and make transparent parts of the Cinnamon Desktop.

Cinnamon components you can apply effects to (currently):

1. The Overview
2. The Expo
3. The Panels
4. Applet popup menus (e.g. Menu, Calendar, etc.)  **(#)**
5. The Desktop background image **(#)**
6. Desktop Notification popups **(#)**
7. The panel tooltip popups **(#)**
8. Alt-Tab switchers (both the standard and the 3D switchers)
9. Application window backgrounds **(#)**
10. Desklet backgrounds **(#)**
11. OSD backgrounds **(#) new!**

**(#)** Note: The Blur Cinnamon effects for the (#) marked Cinnamon components above are disabled by default. They can be enabled in the Blur Cinnamon configuration window. Some effects will, by default, override your theme settings to force transparency. This transparency override can be disabled in the Blur Cinnamon setting if you have a transparent theme and would like to have the theme's settings remain.

## Background (Blur) Effect Descriptions

| Effect                   | Description                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| None                     | Will not apply any blurring, but allows you to apply other effects like tint and desaturation.                                                    |
| Transparent              | Makes the component transparent allowing whatever is under it to appear, but no blurring is applied.                                              |
| Transparent to wallpaper | Applies a background to the component showing a copy of the desktop wallpaper, but no blur effect.                                                |
| Simple blur              | The Cinnamon blur effect (it's very subtle).                                                                                                      |
| Gaussian blur            | The Gaussian effect is a good quality smooth blur that can sometimes be GPU/CPU intensive.                                                        |
| Monte Carlo blur         | The Monte Carlo effect is a grainy, frosted-glass style noisy blur.                                                                               |
| Dual Kawase blur         | The Dual Kawase effect is a high quality smooth blur optimized for low-end GPUs.                                                                  |
| Liquid Glass blur        | The Liquid Glass effect is a glossy translucent glass with refracted edges and rim lighting that also uses Dual Kawase for its blur effect.       |
| Static blur              | Applies the blur effect to a desktop wallpaper copy. Looks like X-ray vision to the wallpaper.                                                    |
| Dynamic blur             | Applies the blur effect to a complete desktop clone. Looks as if the blurred component is transparent while blurring everything that is below it. |

Not every effect is offered for every component. The Desktop, Expo and Overview only support static blurs (no dynamic or Liquid Glass), and Transparent is only available for Panels, Menus, Notifications and Tooltips.

## Features

- A Dual Kawase blur algorithm which is efficient on low end GPUs/CPUs.
- Gaussian and Monte Carlo blur algorithms (borrowed from the Gnome extension Blur-my-Shell) with a user configurable intensity
- A Liquid Glass algorithm with refraction and rim effects using Dual Kawase blur
- Simple blur algorithm (the Cinnamon built-in algorithm) which I would only recommend for very old computers
- Tint overlay with user configurable color and intensity (fully-transparent to a solid color)
- Makes the components transparent (when needed) so that the desktop background image effects are visible
- Allows you to adjust the color saturation of the Cinnamon components. You can reduce saturation all the way down to gray scale
- Uses a rounded corner effect to match your theme's rounded corner settings, and provides manual rounded corner setting for application window effects so you can match the rounded corner of the application windows you choose to blur. This does NOT round window corners, it only allows the blurred background to match the rounding of its window
- Ability to change the opacity of application windows so application window blur effects are visible under the window
- Option to add a backlight effect to the focused window using a background image blur effect spilling over the focused window's borders
- You can use general settings across all Cinnamon components or use unique settings for each component type
- Allows you to apply custom CSS code to panels to achieve a number of custom panel effects like rounded corners, borders, changing the panel width, etc. Careful though, you can mess up your panels, but remember everything will go back to normal if you simply remove any Custom CSS settings you added to Blur Cinnamon.
- Support for Video Wallpaper (only tested Hidamari)
- Coordinates with the Rounded Corners extension to match the blurred background with corner rounding by the extension
- Special handling for the Cinnamon Burn-My-Windows extension
- Support for Centered Cinnamon Dock

## Requirements

This extension requires Cinnamon 6.0 or better (i.e. Mint 21.3 or better).

If you have installed any of the following Cinnamon extensions, you should **disable** them **before** enabling Blur Cinnamon:

- Transparent panels
- Transparent panels reloaded
- Blur Overview

Using any of the above with Blur Cinnamon may have some odd side effects that would require a Cinnamon restart to resolve.

## Limitations

1. The Applet popup menu effects are intended to be used with the Cinnamon (6.4) theme or the Mint-Y dark desktop themes. The effects might work well with other themes but I have not tested them so the effects might not work out just right. You can try the Mint-Y light themes but it might be hard to read the menu items without some playing around with the settings and the background image. And don't forget that Blur Cinnamon Popup-menu effects are disabled by default.
2. The Applet popup-menu effects work for all the applets that I have tested except "Cinnamenu". Cinnamenu is preventing other code from receiving the "open-state-changed" event which Blur Cinnamon uses to know when to apply popup-menu theme setting and when to resize and show the blur background element. This issue is fixed in the latest Cinnamenu from [Fredcw GitHub](https://github.com/fredcw/Cinnamenu) but you will need to manually fix the current Cinnamon Spices version of Cinnamenu (see [here](https://github.com/linuxmint/cinnamon-spices-extensions/issues/873))
3. This extension currently has **experimental Wayland support** tested under Cinnamon 6.6 only.

## Installation

- Right click on the Cinnamon panel and click "System Settings"
- Click on the "Extensions" icon under the "Preferences" category
- Click the "Download" tab and then click the "Blur Cinnamon" entry
- Click the "Install" button on the right and then return to the "Manage" tab
- Select the new "Blur Cinnamon" entry and then click the "+" button at the bottom of the window
- Use the "gears" icon next to the "Blur Cinnamon" entry to open the setting window and setup the preferred behavior

## Blurred Application Windows:

Blur Cinnamon can apply a blurred background to just about any window, but no application windows will have effects applied unless the "Application windows" support is enabled on the "General setup" tab of the Blur Cinnamon configuration window **<u>and</u>** the table under the "Component specific settings" for "windows" has been setup to allow specific windows to have effects enabled.  You can use the "Pick a window to blur…" button to add windows to the list of windows to blur.

Even then the **effects will only be visible when the application window is configured to be transparent**.  Many Terminal programs have options in their preferences that allow the Terminal to be transparent.

For windows that can't be configured to have transparent elements, you have the option of **reducing the "Opacity" in Blur Cinnamon setting** for the window, or by using the "Opacity Slider" extension. With a window's Opacity set to less than 100% you will see the Blur Cinnamon effects behind the window.

There is also a "Default window settings" entry in the Blur Cinnamon Windows setting page. With this entry enabled all normal windows will have effects applied. Specific windows can still be excluded by adding table entries for the windows you want to exclude and making sure the Enabled setting for the entry is **NOT** checked.

## Custom Panel CSS Examples:

The following examples of CSS code can be applied to panels to achieve a custom panel effect.

| Effect                          | Custom CSS string                                |
| ------------------------------- | ------------------------------------------------ |
| Grey borders (all around)       | border-width: 1px; border-color: rgb(70,70,70);  |
| Grey top only border            | border-top: 1px; border-color: rgb(70,70,70);    |
| Grey bottom only border         | border-bottom: 1px; border-color: rgb(70,70,70); |
| Shrink a horizontal panel width | margin-left: 100px; margin-right: 100px;         |
| Shrink a vertical panel height  | margin-top: 100px; margin-bottom: 100px;         |
| Round the corners of a panel    | border-radius: 20px;                             |
| Padding for horizontal panels   | padding-left: 10px; padding-right: 10px;         |
| Padding for vertical panels     | padding-top: 10px; padding-bottom: 10px;         |

You can combine and modify the above as desired and add the result to the "Custom CSS" entry within the panels table under the Panels settings. The "Override the generic effect settings for the Panels" and the "Enable advanced options to apply unique settings for each panel" options must be enabled to see the panels table. Edit/add the appropriate table entry for the panel you wish to affect then modify the "Custom CSS" entry. Typos and syntax errors will typically result in the panel effects reverting to default, but other issues could result. You can always undo your effects by deleting the contents of the "Custom CSS" field in the table. Not all CSS options will work, it's limited to the CSS that is supported by Cinnamon and further limited by hard-coded settings used by the Cinnamon panels code.

Here is the CSS setting I use on my bottom panel to get a centered panel with rounded corners and a grey border:

```
padding-left: 10px; padding-right: 10px; border-radius: 20px; border-width: 1px; border-color: rgb(40,40,40); margin-left: 200px; margin-right: 200px;
```

The border radius rounds the corners, the padding adds space on each end of the panel to accommodate the rounded corners better, and the margins shrink the panel so that it does not fill the width of the screen resulting in a centered panel. 

## Window Title Bar Blurring (X11 only)

To enable application window title bar blurring for GTK3 windows when using the Mint-Y theme:

1. Enable the "Blur window title bars" option under the "Component specific settings" tab with the "Windows" component selected.

2. Add the following CSS code into the `~/.config/gtk-3.0/gtk.css` file. Create the file if it does not exist, which will likely be the case.
   
   ```
   /* Make the titlebars semi-transparent, Opacity 0.5 */
   headerbar, .titlebar {
      background-color: rgba(0, 0, 0, 0.5);
      border: none;
      box-shadow: none;
   }
   ```

3. Restart all your GTK3 applications (or just restart Cinnamon: ALT-F2, type r, press Enter)

You can modify the `rgba` values to achieve different colors (e.g. a blue glass look) and/or change the opacity of the title bar. But don't reduce the opacity to `0` or the window title bar controls will also disappear.

Limitations:

1. This only works for GTK3 windows, GTK4 windows will not be affected, and as I understand it they can not be changed to have transparent title bars.

2. The title bar controls (close, minimize, maximize, etc.) will also be made semi-transparent, I was unable to find a way to have solid controls, but maybe someone that knows Cinnamon/GTK3 CSS better than I can make it solid?

3. Applications that draw their own title bars (e.g. Firefox, Chrome, Discord, etc.) will not be affected. In fact Chrome will have a transparent title bar, but Blur Cinnamon is unable to determine the height of the title bar and therefore it is left without blurring effects. For Chrome you can enable the "Use system title bar and borders" option.

4. The CSS code here only works for Mint-Y Application themes. The Mint-X theme does not work, but maybe it could be made to work with different CSS code.

## Feedback

Please leave a comment here on cinnamon-spices.linuxmint.com or you can create an issue on my [Github](https://github.com/klangman/BlurCinnamon) to give me feedback, make a suggestion or to report any issues you find.

If you like this Cinnamon extension, please give it a "star" here and maybe on my [Github](https://github.com/klangman/BlurCinnamon) repository as well to encourage me to continue working on the project. Thanks!

## Credits

Some code was borrowed from the [BlurOverview](https://cinnamon-spices.linuxmint.com/extensions/view/72) Extension by nailfarmer.

The Gaussian, Monte Carlo, Liquid Glass and rounded corner effects code was borrowed from the Gnome [Blur-my-Shell](https://github.com/aunetx/blur-my-shell) extension by [Aurélien Hamy](https://github.com/aunetx).

The Dual Kawase algorithm effect code was written by [Lucas-X-A](https://github.com/Lucas-X-A).

The Blur Cinnamon icon was designed by [Selinaru](https://github.com/Selinaru).

Special thanks to the following people for contributing code to Blur Cinnamon: [Lucas-X-A](https://github.com/Lucas-X-A) and [anthonytheinventor](https://github.com/anthonytheinventor).

Thanks to all who have reported bugs and made suggestions, you have helped make Blur Cinnamon better for everyone!
