
# Help for Cinnamon Tweaks extension

## IMPORTANT!!!
Never delete any of the files found inside this extension folder. It might break this extension functionality.

***

<h2 style="color:red;">Bug reports, feature requests and contributions</h2>
<span style="color:red;">
If anyone has bugs to report, a feature request or a contribution, do so on <a href="https://github.com/Odyseus/CinnamonTools">this xlet GitHub page</a>.
</span>

***

## Extension options details

<span style="color:red;font-weight: bold;font-size: large;">Some tweaks have warnings, dependencies, limitations and or known issues that must be read and understood before a tweak is enabled. No worries, nothing <em>fatal</em> could ever happen.</span>

### Applets/Desklets tweaks
- **Ask for confirmation on applet/desklet removal:** Instead of directly remove the applet/desklet from the context menus, it will ask for confirmation. This option doesn't affect the removal of applets/desklets from the Applets/Desklets manager in Cinnamon settings (there will be no confirmation).
- **Display "Open applet/desklet folder" on context menu for applets/desklets** and **Display "Edit applet/desklet main file" on context menu for applets/desklet:** These options will add new menu items to the applets/desklets context menus. The place where this items will be located is chosen by the option **Where to place the menu item?**.

### Hot Corners tweaks
This tweak is only available for Cinnamon versions lower than 3.2. Cinnamon 3.2.x already has hot corners delay activation.

- **Top left hot corner activation delay:** Crystal clear.
- **Top right hot corner activation delay:** Crystal clear.
- **Bottom left hot corner activation delay:** Crystal clear.
- **Bottom right hot corner activation delay:** Crystal clear.

### Desktop area tweaks
- **Enable applications drop to the Desktop:** This tweak enables the ability to drag and drop applications from the menu applet and from the panel launchers applet into the desktop.

### Popup menus tweaks
**Panel menus behavior**

**Note:** This setting affects only the behavior of menus that belongs to applets placed on any panel.

- **Emulate Gnome Shell behavior:** When a menu is open on Genome Shell, and then the mouse cursor is moved to another button on the top panel, the menu of the hovered buttons will automatically open without the need to click on them. With this option enabled, that same behavior can be reproduced on Cinnamon.
- **Don't eat clicks:** By default, when one opens an applet's menu on Cinnamon and then click on another applet to open its menu, the first click is used to close the first opened menu, and then another click has to be performed to open the menu of the second applet. With this option enabled, one can directly open the menu of any applet even if another applet has its menu open.

### Tooltips tweaks
- **Avoid mouse pointers overlapping tooltips:** Tooltips on Cinnamon's UI are aligned to the top-left corner of the mouse pointer. This leads to having tooltips overlapped by the mouse pointer. This tweak aligns the tooltip to the bottom-right corner of the mouse pointer (approximately), reducing the possibility of the mouse pointer to overlap the tooltip. This tweak is only available for Cinnamon versions lower than 3.2. Cinnamon 3.2.x already has the position of the tooltips changed.
- **Tooltips show delay:** Crystal clear.

### Notifications tweaks
- **Enable notifications open/close animation:** Crystal clear.
- **Notifications position:** Notifications can be displayed at the top-right of screen (system default) or at the bottom-right of screen.
- **Distance from panel:**
    - **For notifications displayed at the top-right of screen:** this is the distance between the bottom border of the top panel (if no top panel, from the top of the screen) to the top border of the notification popup.
    - **For notifications displayed at the bottom-right of screen:** this is the distance between the top border of the bottom panel (if no bottom panel, from the bottom of the screen) to the bottom border of the notification popup.
- **Notification popup right margin:** By default, the right margin of the notification popup is defined by the currently used theme. This option, set to any value other than 0 (zero), allows to set a custom right margin, ignoring the defined by the theme.

### Window Focus tweaks
Tweak based on the gnome-shell extension called [Steal My Focus](https://github.com/v-dimitrov/gnome-shell-extension-stealmyfocus) by [Valentin Dimitrov](https://github.com/v-dimitrov) and another gnome-shell extension called [Window Demands Attention Shortcut](https://github.com/awamper/window-demands-attention-shortcut) by [awamper](https://github.com/awamper).

Some windows that demands attention will not gain focus regardless of the settings combination on Cinnamon settings. This option will allow you to correct that.

- **The activation of windows demanding attention...:**
    - **...is handled by the system:** Crystal clear.
    - **...is immediate:** will force windows demanding attention to be focused immediately.
    - **...is performed with a keyboard shortcut:** will focus windows demanding attention with a keyboard shortcut.
- **Keyboard shortcut::** Set a keyboard shortcut for the option **...is performed with a keyboard shortcut**.

### Window Shadows tweaks
Tweak based on a Cinnamon extension called [Custom Shadows](https://cinnamon-spices.linuxmint.com/extensions/view/43) created by [mikhail-ekzi](https://github.com/mikhail-ekzi). It allows to modify the shadows used by Cinnamon's window manager (Muffin).

**Note:** Client side decorated windows aren't affected by this tweak.

**Shadow presets**
- **Custom shadows**
- **Default shadows**
- **No shadows**
- **Windows 10 shadows**

### Auto move windows
Tweak based on the gnome-shell extension called [Auto Move Windows](https://extensions.gnome.org/extension/16/auto-move-windows/) by [Florian Muellner](https://github.com/fmuellner). It enables the ability to set rules to open determined applications on specific workspaces.

**Note:** If the application that you want to select doesn't show up on the application chooser dialog, read the section on this help file called **Applications not showing up on the applications chooser dialogs**.

### Windows decorations removal
Tweak based on the extension called [Cinnamon Maximus](https://cinnamon-spices.linuxmint.com/extensions/view/29) by [Fatih Mete](https://github.com/fatihmete) with some options from the gnome-shell extension called [Maximus NG](https://github.com/luispabon/maximus-gnome-shell) by [Luis Pabon](https://github.com/luispabon). This tweak allows to remove the windows decorations from maximized/half-maximized/tiled windows.

**Note:** If the application that you want to select doesn't show up on the application chooser dialog, read the section on this help file called **Applications not showing up on the applications chooser dialogs**.

#### Dependencies
This tweak requires two commands available on the system (**xprop** and **xwininfo**) for it to work.
- Debian based distributions: These commands are provided by the **x11-utils** package. Linux Mint already has this package installed.
- Archlinux based distributions: These commands are provided by the **xorg-xprop** and **xorg-xwininfo** packages.
- Fedora based distributions: These commands are provided by the **xorg-x11-utils** package.

#### Warnings
To cut it short, this tweak is buggy as hell. Cinnamon, more specifically **muffin** (the window manager used by Cinnamon), doesn't have a native way to remove windows decorations as **mutter** (the window manager used by Gnome-shell and on which **muffin** is forked from) has. That's why a command line utility (**xprop**) is used to remove them. Until Cinnamon's developers regain their senses and re-add a feature that should have never been removed from **muffin**, we will have to learn to live with all the issues.

- Client side decorated windows and WINE applications aren't affected by this tweak.
- Close all windows that belongs to an application that is going to be added to the applications list and before applying the settings of this tweak.
- As a general rule to avoid issues, before enabling and configuring this tweak, close all windows currently opened, enable and configure this tweak and then log out and log back in.

#### Known issues
- **Invisible windows:** Sometimes, windows of applications that are configured to remove their decorations can become invisible. The application's icon can still be seen in the panel (taskbar) and when clicked to focus its respective window, the invisible window will block the clicks as if it were visible. To fix this, the window needs to be unmaximized (it will become visible again) and then closed. When reopened, the window should behave normally.

- **Applications stuck undecorated:** Some times, an application will get stuck undecorated even after unmaximizing it. Restarting the application will recover its ability to decorate and undecorate itself.

***

## General extension issues

### Applications not showing up on the applications chooser dialogs
The application chooser dialog used by the settings window of this extension lists only those applications that have available .desktop files. Simply because these applications are the only ones that any of the tweaks that require an application ID (**Auto move windows** and **Windows decorations removal**) will recognize and handle.

Following the [Desktop Entry Specification](https://specifications.freedesktop.org/desktop-entry-spec/latest/index.html), one can create a .desktop file for any application that doesn't appear in the applications list.

***

## Extension localization

- If this extension was installed from Cinnamon Settings, all of this extension's localizations were automatically installed.
- If this extension was installed manually and not trough Cinnamon Settings, localizations can be installed by executing the script called **localizations.sh** from a terminal opened inside the extension's folder.
- If this extension has no locale available for your language, you could create it by following [these instructions](https://github.com/Odyseus/CinnamonTools/wiki/Xlet-localization) and send the .po file to me.
    - If you have a GitHub account:
        - You could send a pull request with the new locale file.
        - If you don't want to clone the repository, just create a Gist and send me the link.
    - If you don't have/want a GitHub account:
        - You can send me a [Pastebin](http://pastebin.com/) (or similar service) to my [Mint Forums account](https://forums.linuxmint.com/memberlist.php?mode=viewprofile&u=164858).
- If the source text (in English) and/or my translation to Spanish has errors/inconsistencies, feel free to report them.
