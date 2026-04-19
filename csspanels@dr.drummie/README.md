# CSS Panels

A Cinnamon extension for dynamic control of panels and popups colors and visual effects.

## Features

- **Panel Transparency**: Adjust the opacity of all panels with real-time preview (same panel style applied to all panels).
- **Menu Transparency**: Control transparency of popup menus and some popup-based controls for a consistent visual appearance.
- **Visual Effect Controls**: Customize saturation, contrast, brightness, and opacity multipliers for the transparency layer. Blur radius is configurable and applied where compositor support allows.
- **Border Radius**: Apply rounded corners to panels and menus.
- **Tint Overlay**: Add color tints to the transparency layer for personalized appearance.
- **Glow Effect**: Inset or outset glow at panel/menu edges (three modes: inset, outset, none).
- **Hover & Active Color Override**: Panel applets, taskbar items, and system tray elements use dynamically generated highlight colors derived from the panel color instead of the default theme color.
- **Use Styles for Notifications and OSDs**: Optional propagation of popup panel settings to notification banner and OSD.
- **Use Styles for App Switchers and Tooltips**: Optional propagation of popup panel settings to App Switchers and Tooltips.
- **Start Menu Sidebar Styling**: Optionally apply the popup color to the Cinnamon start menu sidebar (menu@cinnamon.org). Disabled by default — sidebar keeps theme color.
- **Desklet Styling**: Apply transparency, blur, and glow effects to desktop widgets (desklets). Toggle in Advanced settings.
- **Wallpaper Color Extraction**: Automatically extract dominant colors from the current wallpaper and apply them to panel, menus, border, tint, and shadow — live on wallpaper change or via manual button.
- **System Tray Indicator**: Optional quick-access icon for settings (hidden by default — enable in Advanced settings).
- **Theme Integration**: Automatic detection of theme accent colors.
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
- Enable the system tray indicator in Advanced settings for quick access to settings.
- Apply effect presets for instant visual styles.

## Settings Overview

The extension provides comprehensive control over transparency, color theming, and appearance through a multi-page settings interface organized into logical sections.

### Theme Settings Page

**Theme Integration**

- **Auto-apply accent colors on theme change**: Automatically detect and apply accent colors when changing GTK themes.
- **Detect and apply accent from current theme**: Manual button to extract colors from active theme. Also resets any active wallpaper/override color state for a clean theme baseline.
- **Dark/light mode override**: Globally overrides dark/light mode detection for the entire extension — affects sidebar color fallback, accent color generation, and wallpaper extraction tone. `Auto (follow system/theme)` follows the active GTK color scheme and theme name. `Force dark` is recommended for mixed themes (e.g. Mint-Y-Aqua) where the panel is dark but the GTK theme has no -Dark suffix.
- **Border Radius**: Corner rounding for panels and menus (0-12px, default: 6px).
- **Apply Border Radius to Main Panel**: Enable rounded corners on taskbar.

**Wallpaper Colors**

- **Enable wallpaper detection**: Activates wallpaper color extraction. Automatically enables the panel color override so extracted colors apply visually.
- **Wallpaper manages all shell colors (experimental)**: When enabled, every wallpaper change also updates blur/accent settings (border color, background tint, shadow color). Requires wallpaper detection to be active.
- **Extract colors from wallpaper**: Manual button to extract and apply wallpaper colors immediately. If "Wallpaper manages all shell colors" is enabled, also updates border, tint, and shadow colors; otherwise only panel and popup colors are applied.
- **Wallpaper color extraction mode**: Choose the panel color extraction algorithm — `Standard (weighted average)` uses a weighted average of mid-tone pixels (smooth results); `Contrast (polar tones)` samples the darkest or lightest 25% of pixels to produce a color with stronger inherent contrast against the wallpaper (default).

**Effect Templates**

- **Effect Template**: Select preset templates (Frosted Glass, Wet Glass, Foggy Glass, Clear Crystal — each in light/dark variants).
- **Apply selected template**: Button to apply chosen template to all blur settings.

### Appearance Settings Page

**Basic Appearance Controls**

- **Panel Opacity**: Adjust transparency of all panels (10-100%, step 5%).
- **Menu Opacity**: Adjust transparency of popup menus and some popup-based controls (10-100%, step 5%). Note: some Mint theme menus have hardcoded backgrounds that override this.
- **Override Panel Color**: Enable custom panel background color (checkbox).
- **Choose Override Panel Color**: Color picker for custom panel color (requires override enabled).
- **Override Popup Color**: Enable separate custom color for popup menus and popup-based controls (checkbox).
- **Choose Override Popup Color**: Color picker for custom popup color (requires override enabled).

**Glow Effect Controls**

- **Glow Effect Mode**: Three-way control — `Inset` (glow at edges/corners, classic glossy look), `Outset` (glow at center fading outward, ambient glow), `None` (no glow).
- **Glow Blur Size**: Spread/size of the glow (4-40px, spinbutton control).
- **Glow Intensity (Opacity)**: Brightness/visibility of glow (0.05-0.5, spinbutton control).

### Visual Effects Page

**Visual Effect Controls**

- **Blur Radius**: Controls the CSS `blur()` value sent to the compositor (1-50px, default: 22px). Note: actual blur rendering depends on compositor support — on Cinnamon/Muffin this value is accepted but may not visually blur content.
- **Saturation Multiplier**: Color vibrancy (0.4-2.0, default: 0.95).
- **Contrast Multiplier**: Light/dark difference (0.4-2.0, default: 0.75).
- **Brightness Multiplier**: Overall lightness (0.4-2.0, default: 0.65).
- **Background Color/Tint**: Semi-transparent accent tint overlay (color picker). Automatically populated from active GTK theme or wallpaper extraction.
- **Border Color**: Color of element borders (color picker). Also used as glow color fallback. Auto-populated from theme or wallpaper.
- **Transition Duration**: Animation speed for visual effect transitions (0.0-2.0s, default: 0.3s).
- **Effect Layer Opacity**: Transparency of the visual effect layer (0.1-1.0, default: 0.8).
- **Accent Shadow/Glow Color**: Shadow color for box-shadow effects on all elements. Auto-populated from theme or wallpaper.
- **Shadow Spread**: Shadow effect intensity (0.1-1.0, default: 0.4).

### Advanced Settings Page

**Extended UI Styling**

- **Style system notifications**: Apply visual effect styles to notification banners.
- **Style OSD elements**: Apply visual effect styles to On-Screen Display (volume, brightness, Caps Lock, etc.).
- **Style tooltip elements**: Apply visual effect styles to panel item tooltips.
- **Style Alt-Tab switcher elements**: Apply visual effect styles to application switcher.
- **Style start menu sidebar**: Apply the popup color override to the Cinnamon start menu (menu@cinnamon.org) sidebar. When disabled (default), sidebar uses the theme color. Has no effect if the original Cinnamon menu applet is not active.
- **Style desklet elements**: Apply transparency, blur, and glow effects to desktop widgets (desklets).

**System Tray Indicator**

- **Show system tray indicator**: Toggle visibility of tray icon.

**Debugging**

- **Enable debug logging**: Detailed logging for troubleshooting (check `journalctl -f` or Looking Glass).

### Color Override Logic

- **Auto Detection Mode**: When both override switches are disabled, the panel color is detected from the current theme and propagated to popup menus for a consistent appearance.
- **Panel Override Mode**: When "Override Panel Color" is enabled, the selected panel color is applied to the main panel and — unless a popup override is enabled — to popup menus as well.
- **Popup Override Mode**: When "Override Popup Color" is enabled, popup menus use their own custom color while the panel uses either the panel override color or the auto-detected theme color.
- **Immediate Application**: Changes to override switches or color pickers apply immediately to the panel and any active popup menus (no Cinnamon restart required).

### Wallpaper Color System

- **Automatic Extraction**: Enable wallpaper detection to have the extension extract dominant colors from your current wallpaper using `GdkPixbuf` pixel analysis.
- **Smart Color Selection**: The extractor identifies the most prominent dark (panel) and light (popup) tones, plus accent variants for border, tint, and shadow. In **Contrast** mode, the panel color is derived from the polar extreme of the pixel brightness distribution (darkest 25% in dark mode, lightest 25% in light mode), and the popup color matches the panel tone at menu opacity.
- **Full-Auto Mode**: When active, every wallpaper change updates all color settings — panel, popup, border, tint, and shadow — live.
- **Manual Extract**: The "Extract colors from wallpaper" button applies panel and popup colors immediately. Border, tint, and shadow colors are only updated if "Wallpaper manages all shell colors" is also enabled.
- **Data Source Pattern**: Extraction only populates color picker values; actual styling happens through the standard settings callback chain (user can still tweak values manually after extraction).
- **Prerequisite**: Wallpaper detection automatically enables the panel color override when turned on (otherwise extracted panel colors would be ignored). Popup color override is intentionally left off by default — the popup inherits the panel color automatically, and you can enable popup override separately for independent customization.
- **Theme Tip for Full-Auto Mode**: When using full-auto mode, a neutral GTK theme (e.g. Mint-Y-Grey) is recommended. Window title bars, scrollbars, and other native UI elements use the GTK theme accent color and cannot be controlled by this extension — a neutral theme avoids visual clashes with the dynamically extracted wallpaper colors.

### Glow Effect System

- **Independent from Borders**: Glow works WITHOUT physical borders (no icon-shifting artifacts on panels).
- **Smart Color Fallback**: Uses `blur-border-color` → `blur-background` → theme white/black automatically.
- **Three Modes**: Inset (classic glossy), Outset (ambient reverse glow), None.
- **Applies to all elements**: Panel, popup, notification, OSD, tooltip, Alt-Tab switcher, desklets.
- **Live Updates**: Changes apply instantly without Cinnamon restart.

## Compatibility

- **Cinnamon Version**: 6.0, 6.2, 6.4, 6.6
- **Multiversion**: Yes
- **Extension Conflicts**: May conflict with other extensions that modify the same UI elements
  (panels, popup menus, notifications, OSD). Running multiple extensions that monkey-patch
  Cinnamon's popup or panel system simultaneously can cause visual glitches or broken styling.
  Disable conflicting extensions before using CSS Panels.

## Troubleshooting

- If effects don't apply, check theme compatibility.
- If Border Radius is not detected or valid, set it manually.
- Enable debug logging and check `journalctl -f` for errors (or use LG).
- Reset settings if issues persist.
- Actual background blur requires compositor shader support (e.g. BlurCinnamon) — this extension uses CSS effects only (transparency, glow, color). The `blur()` value is passed to the compositor but may not visually render on standard Cinnamon/Muffin.
- Experiment — you could use the color chooser to select desired color and transparency from existing elements on the screen.
- If wallpaper colors seem wrong, try switching to a different wallpaper and back, or use the manual extract button.

## Contributing

- Report issues on GitHub.
- Check translations and suggest better ones.

## License

This extension is licensed under the GPL-3.0 License.

## Credits

- Inspired by BlurCinnamon@klangman. Developed by drdrummie.
- Icon downloaded from <a href="https://www.flaticon.com/free-icons/post-production" title="post-production icons">Post-production icons created by Smashicons - Flaticon</a>

## Technical Details

- **Architecture**: Modular design with Strategy Pattern for component styling
- **Code Organization**: Centralized constants module (`constants.js`) for all magic numbers and strings
- **Monkey Patching**: Non-invasive interception of Cinnamon UI methods
- **Modern CSS**: Generates inline CSS with `backdrop-filter`, `box-shadow`, and color filters. Note: `backdrop-filter` blur is passed to the compositor but may not render on Cinnamon/Muffin — transparency, glow, and color effects work reliably.
- **Wallpaper Extraction**: GdkPixbuf-based pixel sampling and quantization via `colorPalette.js`
- **Advanced Customization**: Advanced users can tweak behavior by editing `constants.js` directly in the extension directory — hover intensities (`HOVER_INTENSITY`, `ACTIVE_INTENSITY`), shadow multipliers, color fallbacks. Changes take effect after reloading the extension. Proceed at your own risk.

---

**Note**: Best results with **Mint-Y** themes. **Mint-X** works well. **Mint-L** works but requires manual color customization — automatic adaptation on theme change is not fully supported yet. Fluent GTK themes are also supported but results may vary.

Version: 2.0.7 | Last Edited: 2026-04-19
