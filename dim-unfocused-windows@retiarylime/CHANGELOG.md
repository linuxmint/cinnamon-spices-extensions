# Changelog

All notable changes to the Dim Unfocused Windows extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.7] - 2025-10-23

### Added
- ✅ **NEW** - Title-based window exclusion with comma-separated pattern matching
- ✅ **NEW** - Enhanced window filtering system for better control over which windows get dimmed
- ✅ **IMPROVED** - Better default exclusions including "Picture in picture" windows
- ✅ **IMPROVED** - More descriptive tooltips for all settings options

### Changed
- 🔄 **ENHANCED** - Improved brightness animation system with smoother transitions
- 🔄 **ENHANCED** - Better window state management and cleanup
- 🔄 **UPDATED** - Default window title exclusions now include common PIP windows
- 🔄 **UPDATED** - Enhanced settings descriptions for better user understanding

### Technical Improvements
- 🎯 **ENHANCED** - More robust window filtering logic with pattern matching
- 🎯 **ENHANCED** - Improved animation timing and brightness effect application
- 🎯 **ENHANCED** - Better error handling and logging for debugging
- 🎯 **ENHANCED** - Optimized window state tracking and memory management

### Verified Working
- ✅ Title-based exclusions working with comma-separated patterns
- ✅ Minimized window exclusion functioning properly
- ✅ Brightness animations smooth and consistent
- ✅ Dialog window exclusion working as expected
- ✅ Real-time settings updates without restart required

## [1.1.0] - 2025-10-22

### Added
- ✅ **NEW** - Separate opacity and brightness controls for independent visual effects
- ✅ **NEW** - Keyboard shortcut to toggle dimming on/off (default: Super+Shift+D)
- ✅ **IMPROVED** - Enhanced dialog window detection and exclusion
- ✅ **IMPROVED** - Simplified settings interface with cleaner organization

### Changed
- 🔄 **BREAKING** - Removed "Enable dimming" checkbox - extension is always active
- 🔄 **BREAKING** - Removed "Dimming method" selection - now applies both opacity and brightness simultaneously
- 🔄 **BREAKING** - Replaced single "dim" slider with separate "opacity" and "brightness" sliders
- 🔄 **BREAKING** - Removed "Dim minimized windows" option for simplified behavior
- 🔄 **UPDATED** - Opacity slider: 0-100% (default 70%) - controls window transparency
- 🔄 **UPDATED** - Brightness slider: 0-100% (default 70%) - controls window darkness/lightness
- 🔄 **UPDATED** - Brightness uses Clutter.BrightnessContrastEffect for true brightness control

### Technical Improvements
- 🎯 **ENHANCED** - Dual visual effects: opacity reduction + brightness darkening
- 🎯 **ENHANCED** - Keybinding system with proper setup/cleanup and conflict handling
- 🎯 **ENHANCED** - Improved window type detection for dialogs and modal windows
- 🎯 **ENHANCED** - Better state management for toggle functionality
- 🎯 **ENHANCED** - More precise brightness control using Clutter effects

### Verified Working
- ✅ Separate opacity and brightness controls working independently
- ✅ Keyboard toggle (Super+Shift+D) enables/disables dimming instantly
- ✅ Dialog windows properly excluded when setting is enabled
- ✅ Smooth animations for both opacity and brightness changes
- ✅ Real-time settings updates without restart required

## [1.0] - 2025-10-21

### Added
- ✅ **WORKING** - Initial release of Dim Unfocused Windows extension
- ✅ **WORKING** - Automatic dimming of unfocused windows (70% opacity / 179/255)
- ✅ **WORKING** - Real-time focus detection and window state management
- ✅ **WORKING** - Smooth animation transitions (300ms easeInOutQuad)
- ✅ **WORKING** - Multi-application support (Terminal, VS Code, Browser, etc.)
- Configurable opacity settings (10-95%) via settings panel
- Multiple animation easing options (linear, quad, cubic variants)
- Smart window filtering:
  - Option to exclude dialog windows
  - Option to include/exclude minimized windows
  - Automatic exclusion of system windows (desktop, dock, notifications, etc.)
- Settings panel with organized sections
- Support for Cinnamon 4.0 through 6.2
- Proper state management and cleanup
- Signal management for performance optimization
- Window state tracking with original opacity preservation

### Technical Features
- Uses native Cinnamon APIs for window management (`global.get_window_actors()`)
- Implements proper extension lifecycle (init, enable, disable)
- Memory efficient with automatic cleanup
- Compatible with existing window management extensions
- Follows Cinnamon extension development best practices
- Robust error handling and fallback to defaults

### Verified Working
- ✅ Focus detection between Terminal, VS Code, Brave browser, Extensions panel
- ✅ Smooth dimming: unfocused windows → 179 opacity (70% visible)
- ✅ Smooth restoration: focused windows → 255 opacity (100% visible)
- ✅ Real-time updates with sub-second response time
- ✅ Proper cleanup on disable

### Documentation
- Comprehensive README with installation and usage instructions
- Inline code documentation with detailed logging
- Troubleshooting guide with working solutions
- Technical implementation details