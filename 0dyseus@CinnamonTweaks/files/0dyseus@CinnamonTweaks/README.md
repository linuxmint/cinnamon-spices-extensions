## Cinnamon Tweaks extension description

This extension adds some options to modify the default behaviour of certain Cinnamon features.

## Compatibility

- ![Cinnamon 2.8](https://odyseus.github.io/CinnamonTools/lib/MyBadges/Cinnamon-2.8.svg) ![Linux Mint 17.3](https://odyseus.github.io/CinnamonTools/lib/MyBadges/Linux_Mint-17.3.svg)
- ![Cinnamon 3.0](https://odyseus.github.io/CinnamonTools/lib/MyBadges/Cinnamon-3.0.svg) ![Linux Mint 18](https://odyseus.github.io/CinnamonTools/lib/MyBadges/Linux_Mint-18.svg)
- ![Cinnamon 3.2](https://odyseus.github.io/CinnamonTools/lib/MyBadges/Cinnamon-3.2.svg) ![Linux Mint 18.1](https://odyseus.github.io/CinnamonTools/lib/MyBadges/Linux_Mint-18.1.svg)

<span style="color:red;font-size:large;">
**Important note:** Do not try to install and force compatibility for any other version of Cinnamon older than 2.8.6. As a protection mechanism, the extension will auto-disable itself.
</span>

## Features/Options
For detailed explanation of each option, see the **HELP.md** file inside this extension folder.

- **Applets/Desklets tweaks:** confirmation dialogs can be added to applet/desklet removal to avoid accidental removal. New items can be added to applets/desklets context menus (**Open applet/desklet folder** and **Edit applet/desklet main file**).
- **Notifications tweaks:** allows changing the notification popups to the bottom of the screen and change its top/bottom/right margins.
- **Window focus tweaks:** allows the activation of windows demanding attention with a keyboard shortcut or forced.
- **Hot corners tweaks:** allows to set a hover activation delay in milliseconds for each hot corner. This tweak is only available for Cinnamon versions lower than 3.2 (Cinnamon 3.2.x already has hot corners delay activation).
- **Tooltips tweaks:** allows to tweak the position and show delay of Cinnamon's UI tooltips. The position of the tooltip is only available for Cinnamon versions lower than 3.2 (Cinnamon 3.2.x already has the position of the tooltips changed).
- **Desktop tweaks:** Allows to drag applications from the menu or from the launchers applets into the desktop.
- **Popup menus tweaks:** Allows to change the behaviour of the applets menus.

<h2 style="color:red;"> Bug report and feature request</h2>
<span style="color:red;">
Spices comments system is absolutely useless to report bugs with any king of legibility. In addition, there is no notifications system for new comments. So, if anyone has bugs to report or a feature request, do so on this xlet GitHub page. Just click the **Website** button next to the **Download** button.
</span>

## Contributors
- **[lestcape](https://github.com/lestcape):** He is the brain behind the popup menus and desktop tweaks.
- **[Radek71](https://github.com/Radek71):** Czech localization.

## Change Log

##### 1.06
- Added Czech localization. Thanks to [Radek71](https://github.com/Radek71).

##### 1.05
- Added popup menus tweaks. Allows to change the behaviour of the applets menus. Thanks to **[lestcape](https://github.com/lestcape)**.
- Added desktop tweaks. Allows to drag applications from the menu or from the launchers applets into the desktop. Thanks to **[lestcape](https://github.com/lestcape)**.

##### 1.04
- Fixed duplication of context menu items after moving an applet in panel edit mode.

##### 1.03
- Added **Tooltips** tweaks (affect only Cinnamon's UI tooltips).
    - The tooltips can have a custom show delay (system default is 300 milliseconds).
    - The tooltips position can be moved to be aligned to the bottom right corner of the mouse cursor, avoiding the cursor to overlap the tooltip text. This tweak is available only for Cinnamon versions older than 3.2.
- Added the posibility to display 2 new menu items to the context menu for applets/desklets.
    - **Open applet/desklet folder:** this context menu item will open the folder belonging to the applet/desklet with the default file manager.
    - **Edit applet/desklet main file:** this context menu item will open the applet's main file (applet.js) or the desklet's main file (desklet.js) with the default text editor.

##### 1.02
- Added **Hot Corners** tweaks (hover activation delay).

##### 1.01
- Refactored extension code to allow easy updates/maintenance.
- Added support for localizations. If someone wants to contribute with translations, the Help.md file inside this extension folder has some pointers on how to do it.
- Re-enabled show/hide animation for notifications on the bottom. Now the animation plays in the right directions.
- Now the distance from panel can be set for notifiations shown at the bottom and at the top.
- Added option to disable notifications animation.
- Added option to customize the notification right margin.
- Merged functionality from [Window demands attention behavior](https://cinnamon-spices.linuxmint.com/extensions/view/40) extension.

##### 1.00
- Initial release.
