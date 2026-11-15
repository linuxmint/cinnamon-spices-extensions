# Modal Layout Switch

Lets you switch keyboard layouts **while the Cinnamon main menu or a system
password (polkit) dialog is open**.

## The problem

If you switch layouts with an XKB toggle option, for example **Alt+Space**,
Caps Lock or Alt+Shift, it works everywhere except:

- the Cinnamon main menu (search field);
- the system authentication dialog ("Authentication required");
- other Cinnamon modal dialogs.

Cinnamon (Muffin) catches the `ISO_Next_Group` key itself and switches the
input source in response. While a modal grab is active, Muffin skips
keybinding processing, so nothing happens.

## How it works

While a modal is open, the extension listens for `ISO_Next_Group` (next
layout) and `ISO_Prev_Group` (previous layout) key presses and switches the
input source through Cinnamon's input source manager. When no modal is open,
it does nothing, so layouts never switch twice.

## Requirements

Layout switching must be configured as an XKB option:
*System Settings → Keyboard → Layouts → Options → Switching to another layout*.

Shortcuts set in *Keyboard → Shortcuts* ("Switch to next layout") are not
covered, because they don't produce `ISO_Next_Group`.

## Limitations

The lock screen (`cinnamon-screensaver`) is a separate process, so the
extension doesn't affect it.
