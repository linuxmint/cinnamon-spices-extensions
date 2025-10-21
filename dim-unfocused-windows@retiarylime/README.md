# Dim Unfocused Windows

A Cinnamon desktop extension that automatically dims windows when they lose focus, enhancing visual clarity and reducing distractions by making it easier to identify the active window.

## Features

- **Automatic Dimming**: Windows automatically become semi-transparent when they lose focus
- **Smooth Animations**: Configurable transition animations with multiple easing options
- **Customizable Opacity**: Adjust how transparent unfocused windows become (10-95%)
- **Keyboard Toggle**: Quick keyboard shortcut to temporarily disable/enable dimming
- **Smart Filtering**: Option to exclude dialog windows, minimized windows, and system windows
- **Performance Optimized**: Lightweight implementation with minimal system impact

## Settings

### Dimming Settings
- **Opacity of unfocused windows**: Control how transparent unfocused windows become (default: 70%)
- **Animation duration**: Set the speed of the dimming transition (0-1000ms, default: 300ms)
- **Animation type**: Choose from various easing curves for smooth transitions

### Window Filtering
- **Dim minimized windows**: Choose whether minimized windows should be dimmed
- **Exclude dialog windows**: Prevent dimming of dialog boxes, file choosers, and preference windows
- **Toggle keybinding**: Set a keyboard shortcut to quickly enable/disable dimming (default: Super+Shift+D)

## Installation

1. Download the extension from Cinnamon Spices or clone this repository
2. Extract to `~/.local/share/cinnamon/extensions/dim-unfocused-windows@retiarylime/`
3. Enable the extension in Cinnamon Settings → Extensions
4. Configure settings as desired

## Manual Installation for Development

```bash
# Clone or copy the extension to the Cinnamon extensions directory
cp -r dim-unfocused-windows@retiarylime ~/.local/share/cinnamon/extensions/

# Restart Cinnamon (Alt+F2, type 'r', press Enter)
# Or log out and log back in

# Enable the extension
cinnamon-settings extensions
```

## Compatibility

This extension is compatible with Cinnamon versions:
- 4.0, 4.2, 4.4, 4.6, 4.8
- 5.0, 5.2, 5.4, 5.6, 5.8
- 6.0, 6.2

## How It Works

The extension monitors window focus changes using Cinnamon's built-in signals:
- When a window gains focus, all other windows are dimmed
- When a window loses focus, it gets dimmed unless it becomes the new focused window
- Window states are tracked to preserve original opacity values
- Smooth animations provide visual feedback during transitions

## Technical Details

- Uses `Meta.Display` focus signals for window tracking
- Leverages `Clutter.Actor` opacity manipulation for visual effects
- Implements `Tweener` for smooth animations
- Utilizes `Settings.ExtensionSettings` for configuration management
- Follows Cinnamon extension best practices for lifecycle management

## Troubleshooting

**Extension not working after installation:**
- Restart Cinnamon (Alt+F2, type 'r', press Enter)
- Check if the extension is enabled in Settings → Extensions
- Look for error messages in `~/.xsession-errors` or run `journalctl -f` while enabling

**Performance issues:**
- Reduce animation duration in settings
- Disable dimming for minimized windows if you have many open

**Windows getting minimized instead of dimmed:**
- This was fixed in v1.0 - ensure you're using the latest version
- Restart Cinnamon after updating (Alt+F2, type 'r', press Enter)

**Windows not restoring properly:**
- Disable and re-enable the extension
- Check for conflicts with other window management extensions
- Use the keyboard toggle (Super+Shift+D) to reset the extension state

## License

This extension is released under the GNU General Public License v3.0. See the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

## Changelog

### Version 1.0
- Initial release
- Basic dimming functionality
- Configurable opacity and animation settings
- Window filtering options
- Support for Cinnamon 4.0+