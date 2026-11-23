# Force Quit from Panel

Adds a **Force quit** item to the right-click menu of apps in the default
**Grouped window list** panel applet.

When an app freezes and ignores Alt+F4 or the window's close button, right-click it
on the panel and choose **Force quit**. Apps with several open windows get
**Force quit all**.

The item kills the app's process immediately (SIGKILL), the same way Cinnamon's own
"Application is not responding → Force Quit" dialog does. Unsaved work in that app
is lost, and no confirmation is asked.

## Notes

- Works with the *Grouped window list* applet only (the default Linux Mint panel
  applet), on every panel it is placed on.

## Tip: show running apps on every monitor's panel

If you have a panel on each monitor, right-click the window list on each panel →
*Configure...* → set **Show windows from other monitors** to **From all monitors**.
