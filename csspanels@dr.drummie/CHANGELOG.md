# Changelog

All notable changes to CSS Panels are documented in this file.

## [2.0.9] - 2026-04-21

### Changed

- System tray indicator left click now opens CSS Panels settings directly (`xlet-settings extension csspanels@dr.drummie`) instead of the generic Extensions Manager (`cinnamon-settings extensions`).
- System tray indicator hover effect now matches panel applets: registered with `HoverStyleManager` on creation, unregistered on destroy — receives the same `background-color !important` highlight as other panel applets. Removed manual `enter-event`/`leave-event` opacity handlers.
- `HoverStyleManager`: new `hookExternalActor(actor)` / `unhookExternalActor(actor)` public API for registering actors outside the standard applet hierarchy. External actors tracked in `_externalActors[]` and automatically re-hooked on `refresh()` cycles.

### Fixed

- `restoreOriginalStyles()` in `panelStyler.js`: added optional skip of `scheduleRefreshPanels()` — avoids an unnecessary panel refresh cycle when invoked from `HoverStyleManager` during cleanup.

## [2.0.8] - 2026-04-19

### Fixed

- Theme detection performance: three-state cache for GTK CSS file read in `themeDetector.js` — avoids repeated synchronous file scan on every `isDarkModePreferred()` call (hot path in CSS generation). Cache invalidated on theme change.
- `global.logError()` call signature in `signalHandler.js`: was called with two arguments; GJS API accepts one — merged into a single string.
- `global.log()` regression from 2.0.7: 8 error/warning call sites in `stylerBase.js` and `extension.js` were logged as error / warning in debug mode - restored to info level.
- Unhandled promise in `wallpaperMonitor.js`: added `.catch()` handler to `_onWallpaperChanged()` fire-and-forget call.
- `hexToRgb()` in `themeUtils.js`: added support for CSS `#RGB` 3-digit shorthand (e.g. `#f08`).
- `restoreOriginalMethods()` in `alttabStyler.js`: added identity guard to prevent accidental loss of an intermediate monkey-patch.

### Documentation

- Known limitation: near-monochrome dark wallpapers (e.g. eclipse images) produce near-black panel color — mathematically correct behavior, documented as low-priority with workaround.

## [2.0.7] - 2026-04-19

### Added

- **Desklet Styling**: Apply transparency, blur, and glow effects to desktop widgets (desklets) — toggle in Advanced settings.
- **Start Menu Sidebar Styling**: Optionally apply the popup color to the Cinnamon start menu sidebar (`menu@cinnamon.org`) — disabled by default, sidebar keeps theme color.
- **Dark/Light Mode Override**: New control to globally override dark/light mode detection — useful for mixed themes (e.g. Mint-Y-Aqua) where the panel is dark but the GTK theme has no `-Dark` suffix.
- **Wallpaper Extraction Mode**: Choose between `Standard (weighted average)` and `Contrast (polar tones)` algorithms for panel color extraction.

### Fixed

- Safe color parsing: extension no longer crashes on invalid or malformed color strings from settings.
- Theme detection race condition: 100ms debounce prevents stale color detection when theme changes fire before GTK CSS is fully loaded.
- Desklet styling: corrected style target from `desklet.actor` to `desklet.content` — background was invisible because the inner container covered it.
- Desklet live toggle: use `DeskletManager.definitions` (live array) instead of `getDefinitions()` — desklet styling now works on every toggle without Cinnamon restart.

## [2.0.3] - 2026-04-17

### Fixed

- Cinnamon Spices CI compliance: removed metadata fields that fail validation
- Settings lifecycle: proper `finalize()` call on extension disable — all bindings and signals cleanly released
- Monkey patch idempotency: `disable()` is now safe to call multiple times (Cinnamon can call it in error/reload scenarios)
- OSD styling: fixed monkey patch that leaked after extension disable (missing `disable()` method)
- System tray tooltip: fixed restore on indicator destroy

## [2.0.2] - 2026-04-16

### Added

- **Wallpaper Color Extraction**: extract dominant colors from the current wallpaper and apply them to panel background, popup menus, border, tint, and shadow
- **Full-Auto Mode** (experimental): every wallpaper change updates all shell colors live
- **Manual Extract Button**: apply wallpaper colors on demand without enabling automatic detection

### Fixed

- Wallpaper extraction: correct pixel sampling using GdkPixbuf rowstride (wrong colors on some images)
- Wallpaper extraction: URI decoding for paths with spaces or special characters
- Wallpaper extraction: manual extraction now works even without active wallpaper monitor
- Shadow color: corrected settings key used during wallpaper extraction
- Secondary color selection: improved contrast-ratio algorithm for popup color (replaces naive palette[1])
- First-run defaults: sensible out-of-box appearance — Frosted Glass template, OSD and App Switcher styling enabled by default

## [2.0.1] - 2026-04-12

### Fixed

- Hover highlight: fixed signal accumulation after repeated open/close cycles on taskbar items
- Settings: "Detect from theme" button no longer requires auto-apply to be enabled
- Wallpaper extraction: fixed hash logic that prevented retry on transient errors

## [2.0.0] - 2026-04-12

### Added

- **Wallpaper Color System**: GdkPixbuf-based extraction of dominant colors, applied to all shell elements
- **Hover & Active Color Override**: panel applets, taskbar items, and system tray use dynamically generated highlight colors derived from the extension's panel color — no more theme color bleed-through
- **Glow Effect Mode**: three-way control — `Inset` (classic glossy), `Outset` (ambient glow), `None`; replaces the old border-width approach with no icon-shifting artifacts
- **Sub-menu lateral shadow**: popup sub-menus styled with lateral shadow only (no top/bottom bleed)
- **Theme Integration**: auto-apply accent colors on GTK theme change; "Detect from theme" button resets wallpaper state for a clean baseline
- **Desktop context menu styling**: optional propagation of popup styles to right-click desktop menus

### Changed

- Settings reorganized into 4 logical pages: **Theme**, **Appearance**, **Visual Effects**, **Advanced**
- Glow controls consolidated: `glow-mode` combobox + `glow-blur` / `glow-intensity` spinbuttons
- Border radius default reduced to 6px; maximum reduced to 12px (values above 12 cause artifacts in most themes)
- Effect templates expanded: Frosted Glass, Wet Glass, Foggy Glass, Clear Crystal — each in light and dark variants

### Fixed

- Extension disable isolation: a failure in one styler no longer blocks cleanup of all others
- Theme change race condition: 100ms debounce prevents stale color detection on rapid theme switches
- OSD monkey patch context: correct `this` binding — OSD styling was broken after refactor

## [1.9.2]

- Added tooltips and app switchers styling.
- Fixed transparency bug when panel color is not overridden.
- Refactored most of the code and improved debug logging for troubleshooting.

## [1.8.9]

- Added support for styling all panels (same style of main panel is applied onto other panels as well).
- Improved debug logging for troubleshooting.

## [1.8.8]

- Initial release with options to style main panel, popups, notifications and OSD's.
