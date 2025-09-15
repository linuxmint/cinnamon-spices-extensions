# CSS Panels

A Cinnamon extension for dynamic control of panel and popups transparency and blur effects, providing modern glass "morphism" aesthetics.

## Features

- **Panel Transparency**: Adjust the opacity of the main panel (taskbar) with real-time preview.
- **Menu Transparency**: Control transparency of popup menus for a frosted glass effect.
- **Blur Effects**: Customize blur radius, saturation, contrast, brightness, and more for visual effects.
- **Border Radius**: Apply rounded corners to panels and menus with auto-detection from themes.
- **Tint Overlay**: Add color tints to blur effects for personalized appearance.
- **Use Styles for Notifications and OSD-s**: Optional propagation of popup panel settings to notification banner and OSD.
- **System Tray Indicator**: Quick access icon for settings, with options to hide it when you are done with experimenting.
- **Theme Integration**: Automatic detection of theme border radius for seamless integration (to some extent).
- **Debug Logging**: Enable detailed logging for troubleshooting.

## Installation

### From Cinnamon Extensions

1. Open **Cinnamon Settings** > **Extensions**.
2. Search for "CSS Panels" and install.

### Manual Installation

1. Download the extension ZIP from the releases page.
2. Extract to `~/.local/share/cinnamon/extensions/csspanels@dr.drummie`.
3. Restart Cinnamon (Alt+F2, type `r`, Enter) or log out/in.
4. Enable the extension in **Cinnamon Settings** > **Extensions**.

## Usage

- Access settings via **Cinnamon Settings** > **Extensions** > **CSS Panels**.
- Use the system tray icon for accessing settings and presets.
- Apply css blur templates for instant effects.

## Settings Overview

### Basic Transparency Controls

- **Panel Opacity**: Adjust main panel transparency (0-100%).
- **Menu Opacity**: Adjust popup menu transparency (0-100%).
- **Override Panel Color**: Enable custom panel background color instead of theme detection.
- **Choose Override Panel Color**: Select custom panel color when override is enabled.
- **Override Popup Color**: Enable separate custom color for popup menus.
- **Choose Override Popup Color**: Select custom popup color when override is enabled.

### Blur Effects

- **Blur Radius**: Intensity of blur (0-50px).
- **Saturation Multiplier**: Color vibrancy (0.0-2.0).
- **Contrast Multiplier**: Light/dark difference (0.0-2.0).
- **Brightness Multiplier**: Overall lightness (0.0-2.0).
- **Blur Opacity**: Transparency of blur layer (0.0-1.0).
- **Blur Transition Duration**: Animation speed (0.0-2.0s).
- **Background Color/Tint**: Semi-transparent overlay color.
- **Border Color**: Color of blur borders.
- **Border Width**: Thickness of borders (0-5px).

### Border Radius

- **Apply Border Radius to Main Panel**: Enable rounded corners.
- **Auto-Detect Theme Border Radius**: Match theme settings.
- **Border Radius**: Fallback value (0-20px).

### Color Override Logic

- **Auto Detection Mode**: When both override switches are disabled, the panel color is detected from the current theme and propagated to popup menus for a consistent appearance.
- **Panel Override Mode**: When "Override Panel Color" is enabled, the selected panel color is applied to the main panel and — unless a popup override is enabled — to popup menus as well.
- **Popup Override Mode**: When "Override Popup Color" is enabled, popup menus use their own custom color while the panel uses either the panel override color or the auto-detected theme color.
- **Immediate Application**: Changes to override switches or color pickers apply immediately to the panel and any active popup menus (no Cinnamon restart required).

### Advanced Settings

- **Blur Template**: Select preset templates (e.g., Frosted Glass, Wet Glass).
- **Apply Selected Template**: Reset settings to template values.
- **Style Notifications**: Propagate popup panel visual appearance to notification banner.
- **Style OSD-s**: Propagate popup panel visual appearance to OSD (Caps Lock, Num Lock, Brightness, Volume, ..).
- **Enable Debug Logging**: For troubleshooting.
- **Show System Tray Indicator**: Toggle tray icon.

## Compatibility

- **Cinnamon Version**: 6.0, 6.2, 6.4
- **Linux Mint**: 21.x, 22.x
- **Multiversion**: Yes

## Troubleshooting and known issues

- OSD styling is made "in advance", so if you switch your "theme" and OSD isn't styled properly, try to change csspanels border-radius setting.
- If effects don't apply, check theme compatibility.
- If Border Radius is not detected or valid, set it manually. 
- Enable debug logging and check `journalctl -f` for errors (or use LG).
- Reset settings if issues persist.
- Don't expect "miracles", it is only css with limited options
- Experiment - you could use color chooser to select desired color and transparency from existing elements on the screen.

## Contributing

- Report issues on GitHub.
- Check translations and suggest better ones.

## License

This extension is licensed under the GPL-3.0 License.

## Credits

- Based on BlurCinnamon@klangman.
- Icon downloaded from <a href="https://www.flaticon.com/free-icons/post-production" title="post-production icons">Post-production icons created by Smashicons - Flaticon</a>

---

**Note**: This extension may have limited impact on original Mint X, L and Y themes as they define their own "rules". Tested with Fluent GTK themes for best results.

Version: 1.8.8 | Last Edited: 2025-09-06
