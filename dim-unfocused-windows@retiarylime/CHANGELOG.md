# Changelog

All notable changes to the Dim Unfocused Windows extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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