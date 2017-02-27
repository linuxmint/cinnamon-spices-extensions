
# Help for Cinnamon Tweaks extension

### IMPORTANT!!!
Never delete any of the files found inside this extension folder. It might break this extension functionality.

***

### Extension options details

#### Applets/Desklets tweaks
- **Ask for confirmation on applet/desklet removal:** Intead of directly remove the applet/desklet from the context menus, it will ask for confirmation. This option doesn't affect the removal of applets/desklets from the Applets/Desklets manager in Cinnamon settings (there will be no confirmation).
- **Display "Open applet/desklet folder" on context menu for applets/desklets** and **Display "Edit applet/desklet main file" on context menu for applets/desklet:** These options will add new menu items to the applets/desklets context menus. The place where this items will be located is chosen by the option **Where to place the menu item?**.

#### Notifications tweaks
- **Enable notifications open/close animation:** Crystal clear.
- **Notifications position:** Notifications can be displayed at the top-right of screen (system default) or at the bottom-right of screen.
- **Distance from panel:**
    - **For notifications displayed at the top-right of screen:** this is the distance between the bottom border of the top panel (if no top panel, from the top of the screen) to the top border of the notification popup.
    - **For notifications displayed at the bottom-right of screen:** this is the distance between the top border of the bottom panel (if no bottom panel, from the bottom of the screen) to the bottom border of the notification popup.
- **Notification popup right margin:** By default, the right margin of the notification popup is defined by the currently used theme. This option, set to any value other than 0 (zero), allows to set a custom right margin, ignoring the defined by the theme.

#### Window Focus tweaks
Some windows that demands attention will not gain focus regardless of the settings combination on Cinnamon settings. THis option will allow you to correct that.

- **The activation of windows demanding attention...:**
    - **...is handled by the system:** Crystal clear.
    - **...is immediate:** will force windows demanding attention to be focused immediately.
    - **...is performed with a keyboard shortcut:** will focus windows demanding attention with a keyboard shortcut.
- **Keyboard shortcut::** Crystal clear.

#### Hot Corners tweaks
This tweak is only available for Cinnamon versions lower than 3.2. Cinnamon 3.2.x already has hot corners delay activation.

- **Top left hot corner activation delay:** Crystal clear.
- **Top right hot corner activation delay:** Crystal clear.
- **Bottom left hot corner activation delay:** Crystal clear.
- **Bottom right hot corner activation delay:** Crystal clear.

#### Tooltips tweaks
- **Avoid mouse pointers overlapping tooltips:** Tooltips on Cinnamon's UI are aligned to the top-left corner of the mouse pointer. This leads to having tooltips overlapped by the mouse pointer. This tweak aligns the tooltip to the bottom-right corner of the mouse pointer (approximately), reducing the possibility of the mouse pointer to overlap the tooltip. This tweak is only available for Cinnamon versions lower than 3.2. Cinnamon 3.2.x already has the position of the tooltips changed.
- **Tooltips show delay:** Crystal clear.

#### Desktop tweaks
- **Enable applications drop to the Desktop:** This tweak enables the ability to drag and drop applications from the menu applet and from the panel launchers applet into the desktop.

#### Popup menus tweaks
- **Panel menus behavior:**
This setting affects only the behavior of menus that belongs to applets placed on any panel.

- **Emulate Gnome Shell behavior:** When a menu is open on Genome Shell, and then the mouse cursor is moved to another button on the top panel, the menu of the hovered buttons will automatically open without the need to click on them. With this option enabled, that same behavior can be reproduced on Cinnamon.
- **Don't eat clicks:** By default, when one opens an applet's menu on Cinnamon and then click on another applet to open its menu, the first click is used to close the first opened menu, and then another click has to be performed to open the menu of the second applet. With this option enabled, one can directly open the menu of any applet even if another applet has its menu open.

***

### Extension localization

- If this extension was installed from Cinnamon Settings, all of this extension's localizations were automatically installed.
- If this extension was installed manually and not trough Cinnamon Settings, localizations can be installed by executing the script called **localizations.sh** from a terminal opened inside the extension's folder.
- If this extension has no locale available for your language, you could create it by following [these instructions](https://github.com/Odyseus/CinnamonTools/wiki/Xlet-localization) and send the .po file to me.
    - If you have a GitHub account:
        - You could send a pull request with the new locale file.
        - If you don't want to clone the repository, just create a Gist and send me the link.
    - If you don't have/want a GitHub account:
        - You can send me a [Pastebin](http://pastebin.com/) (or similar service) to my [Mint Forums account](https://forums.linuxmint.com/memberlist.php?mode=viewprofile&u=164858).
- If the source text (in English) and/or my translation to Spanish has errors/inconsistencies, feel free to report them.

### Bug reports, feature requests and contributions

If anyone has bugs to report, a feature request or a contribution, do so on [this xlet GitHub page](https://github.com/Odyseus/CinnamonTools).
