# Panel Click-Through

In Cinnamon, while a menu is open (for example the main menu), clicking anywhere
outside it only closes the menu: the click itself is swallowed. To click something
on the panel you have to close the menu first and click again.

This extension makes the panel behave like the Windows taskbar: while a menu is open,
a click on the panel closes the menu **and** reaches the panel. You can switch to a
window in the window list, or open the sound or network applet, with a single click.

- Clicking the menu's own button still just closes the menu.
- Clicking the desktop or a window still just closes the menu, as before.
- Works with auto-hide panels.

## How it works

It wraps `PopupMenuManager._onEventCapture` from `js/ui/popupMenu.js`. If a button
press lands on a panel (and not on the open menu or its own button), the menu is
closed and the event is propagated instead of being consumed. Disabling the extension
restores the original function.

## Tested on

Only tested on Linux Mint 22.3, Cinnamon 6.6.9, with a single bottom panel
(auto-hide on and off) and the default menu applet. Feedback from other setups is welcome.
