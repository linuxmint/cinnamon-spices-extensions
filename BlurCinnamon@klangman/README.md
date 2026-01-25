# Blur Cinnamon

A Cinnamon extension to Blur, Dim, Colorize, Desaturate and make transparent parts of the Cinnamon Desktop.

Cinnamon components you can apply effects to (currently):

1. The Overview
2. The Expo
3. The Panels
4. Applet popup menus (i.e Menu menu, Calendar, etc.)  **(#)**
5. The Desktop background image **(#)**
6. Desktop Notification popups **(#)**
7. The panel tooltip popups **(#)**
8. The Coverflow and Timeline 3D Alt-Tab switchers (not the Cinnamon default Alt-Tab switcher!)
9. Application window backgrounds **(#)**
10. Desklet backgrounds **(#)**

**(#)** Note: The Blur Cinnamon effects for the (#) marked Cinnamon components above are disabled by default. They can be enabled in the Blur Cinnamon configuration window. Some effects will override your theme settings to force transparency.

Blurring can also be disabled if you just want a transparent or semi-transparent effect without blurring for Panels, Applet popup menu or the Expo.

## Features

- Gaussian blur algorithm (borrowed from the Gnome extension Blur-my-Shell) with a user configurable intensity
- Simple blur algorithm (the Cinnamon built-in algorithm) which I would only recommend for very old computers
- Dimming overlay with user configurable color and intensity (fully-transparent to a solid color)
- Makes the components transparent (when needed) so that the desktop background image effects are visible
- Allows you to adjust the color saturation of the Cinnamon components. You can reduced saturation all the way down to gray scale
- Uses a rounded corner effect to match your themes rounded corner settings, and provides manual rounded corner setting for application window effects so you can match the rounded corner of the application windows you choose to blur. This does NOT round window corners, it only allows the blurred background to match the rounding of it's window
- Ability to changes the opacity of application windows so application window blur effects are visible under the window
- Option to add a backlight effect to the focused window using a background image blur effect spilling over the focused windows borders
- You can use general settings across all Cinnamon components or use unique settings for each component type
- Allows you to apply custom CSS code to panels to achieve a number of custom panel effects like rounded corners, borders, changing the panel width, etc. Careful though, you can mess up your panels, but remember everything will go back to normal if you simply remove any Custom CSS settings you added to Blur Cinnamon.

## Requirements

This extension requires Cinnamon 6.0 or better (i.e Mint 21.3 or better).

If you have installed any of the following Cinnamon extensions, you should **disable** them **before** enabling Blur Cinnamon:

- Transparent panels
- Transparent panels reloaded
- Blur Overview

Using any of the above with Blur Cinnamon may have some odd side effects that would require a Cinnamon restart to resolve.

Cinnamon 6.6:  There are a few issues I need to work on for 22.3 (Cinnamon 6.6). The new menu should have the left panel changed to be transparant and the Cinnamon theme uses margins that cause Blur Cinnamon menu effects to spill over the popup's borders. I'll work on this for version 1.7.1

## Limitations

1. The Applet popup menu effects are intended to be used with the Cinnamon (6.4) theme or the Mint-Y dark desktop themes. The effects might work will with some other themes but I have not tested them so the effects might not work out just right. You can try the Mint-Y light themes but it might be hard to read the menu items without some playing around with the settings and the background image. Blur Cinnamon Popup-menu effects are disabled by default.
2. The Applet popup-menu effects works for all the applets that I have tested except "Cinnamenu". Cinnamenu is preventing other code from receiving the "open-state-changed" event which BlurCinnamon uses to know when to apply popup-menu theme setting and when to resize and show the blur background element. This issue is fixed in the latest Cinnamenu from [Fredcw GitHub](https://github.com/fredcw/Cinnamenu) but you will need to manually fix the current Cinnamon Spices version of Cinnamenu (see [here](https://github.com/linuxmint/cinnamon-spices-extensions/issues/873))
3. Currently, any windows that are positioned such that they overlap with a panel or an popup-menu will not be visible beneath blurred panel/popup-menu as you might expect with a transparent panel/menu. This is because the blur effect is applied to a user interface element that floats above all windows just like the panel floats above the windows. At some point I hope to look into allowing the blur element to appear below all windows rather than above and make the a optional behavior setting.
4. If you disable effects for any Cinnamon component under the General tab of the setting dialog while any "Use unique effect settings" options are enabled under the other tabs, the components "effect setting" options under the other tabs will still be visible, but changing those setting will have no effect until you re-enable the component under the General tab. Ideally those effect setting would only be visible when the component is enabled under the general tab but Cinnamon setting support is a bit limited in this way.
5. This extension currently does not work under Wayland, it only works under X11. The extension automatically detects Wayland and disables most of the features of the extension.

## Installation

- Right click on the cinnamon panel and click "System Settings"
- Click on the "Extensions" icon under the "Preferences" category
- Click the "Download" tab and then click the "Blur Cinnamon" entry
- Click the "Install" button on the right and then return to the "Manage" tab
- Select the new "Blur Cinnamon" entry and then click the "+" button at the bottom of the window
- Use the "gears" icon next to the "Blur Cinnamon" entry to open the setting window and setup the preferred behavior



## Custom Panel CSS Examples:

The following examples of CSS code can be applied to panels to achieve a custom panel effect.

| Effect                          | Custom CSS string                               |
| ------------------------------- | ----------------------------------------------- |
| Grey Borders                    | border-width: 1px; border-color: rgb(70,70,70); |
| Shrink a horizontal panel width | margin-left: 100px; margin-right: 100px;        |
| Shrink a vertical panel height  | margin-top: 100px; margin-bottom: 100px;        |
| Rounded the corners of a panel  | border-radius: 20px;                            |

You can combine and modify the above as desired and add the result to the "Custom CSS" entry under the Panels settings. The "Enable advanced options to apply unique settings for each panel" option needs to be enabled see the panels table. Edit/add the appropriate table entry for the panel you wish to effect to modify the "Custom CSS" entry. Typos and syntax errors will typically result in the panel effects reverting to default, but other issue could result. You can always undue your effects by deleting the contents of the "Custom CSS" field in the table.

## Feedback

Please leave a comment here on cinnamon-spices.linuxmint.com or you can create an issue on my [Github](https://github.com/klangman/BlurCinnamon) to give me feedback, make a suggestion or to report any issues you find.

If you like this Cinnamon extension, please give it a "star" here any maybe on my [Github](https://github.com/klangman/BlurCinnamon) repository as well to encourage me to continue working on the project. Thanks!

## Credits

Some code was borrowed from the [BlurOverview](https://cinnamon-spices.linuxmint.com/extensions/view/72) Extension by nailfarmer.

The Gaussian and rounded corner effect code was borrowed from the Gnome [Blur my shell](https://github.com/aunetx/blur-my-shell) extension by [Aurélien Hamy](https://github.com/aunetx).

The Blur Cinnamon icon was generated by Google Gemini
