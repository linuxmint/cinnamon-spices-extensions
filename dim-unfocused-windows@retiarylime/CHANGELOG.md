# Changelog

All notable changes to the Dim Unfocused Windows extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0] - 2025-10-21

### Added
- Initial release of Dim Unfocused Windows extension
- Automatic dimming of unfocused windows
- Configurable opacity settings (10-95%)
- Smooth animation transitions with configurable duration (0-1000ms)
- Multiple animation easing options (linear, quad, cubic variants)
- Smart window filtering:
  - Option to exclude dialog windows
  - Option to include/exclude minimized windows
  - Automatic exclusion of system windows (desktop, dock, notifications, etc.)
- Settings panel with organized sections
- Keyboard shortcut for toggling dimming on/off (Super+Shift+D)
- Enhanced window state tracking with minimize/unminimize event handling
- Support for Cinnamon 4.0 through 6.2
- Proper state management and cleanup
- Signal management for performance optimization
- Window state tracking with original opacity preservation

### Technical Features
- Uses native Cinnamon APIs for window management
- Implements proper extension lifecycle (init, enable, disable)
- Memory efficient with automatic cleanup
- Compatible with existing window management extensions
- Follows Cinnamon extension development best practices

### Documentation
- Comprehensive README with installation and usage instructions
- Inline code documentation
- Troubleshooting guide
- Technical implementation details