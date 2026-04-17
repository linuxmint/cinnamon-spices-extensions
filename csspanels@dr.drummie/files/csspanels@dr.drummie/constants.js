/**
 * Constants for CSS Panels Extension
 * Central repository for all magic numbers and strings used across the extension
 */

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Timing constants for delays, debouncing, and polling intervals
 * @type {Object}
 */
const TIMING = {
    // Mainloop timeout delays (milliseconds)
    DEBOUNCE_SHORT: 50, // Used for: Quick UI updates, tooltip styling, OSD styling, panel refresh
    DEBOUNCE_MEDIUM: 100, // Used for: Panel style application, tooltip cleanup, OSD cleanup
    DEBOUNCE_LONG: 200, // Used for: Panel size change detection (radius detection)
    DEBOUNCE_PANEL_MONITORING: 500, // Used for: Panel monitoring debouncing on settings change
    KEY_TRIGGER_THROTTLE: 500, // Used for: OSD key event throttling (volume/brightness)

    // Polling intervals (milliseconds)
    POLL_PANELS_LONG: 10000, // Used for: Fallback panel monitoring when signal not available

    // Cache timeouts (milliseconds)
    CACHE_PANEL_CHECK: 5000, // Used for: Panel reference caching in panelStyler
    CACHE_THEME_PROPERTIES: 30000, // Used for: Theme properties caching in themeDetector

    // Transition durations (seconds)
    TRANSITION_CSS_DEFAULT: 0.3, // Used for: Default CSS transition timing
    FADE_OUT_DURATION: 150, // Used for: Element fade-out animation (milliseconds)

    // Wallpaper monitoring (Phase 2.5C)
    WALLPAPER_DEBOUNCE: 1000, // Used for: Debouncing wallpaper change detection to prevent rapid-fire triggers
};

// ============================================================================
// DEPTH AND TRAVERSAL LIMITS
// ============================================================================

/**
 * Maximum traversal depths for DOM/actor tree searches
 * Prevents infinite loops and excessive recursion
 * @type {Object}
 */
const TRAVERSAL = {
    MAX_DEPTH_PANEL: 10, // Used for: Checking if element is in panel (popupStyler, tooltipStyler)
    MAX_DEPTH_DESKTOP: 5, // Used for: Desktop area detection in nemoPopupStyler
    MAX_DEPTH_NOTIFICATION: 8, // Used for: Notification actor tree search depth limit
};

// ============================================================================
// SIZE CONSTRAINTS
// ============================================================================

/**
 * Size constraints for element detection and validation
 * @type {Object}
 */
const SIZE = {
    // OSD element size detection (pixels)
    OSD_MIN_WIDTH: 50, // Minimum width for OSD element detection
    OSD_MAX_WIDTH: 800, // Maximum width for OSD element detection
    OSD_MIN_HEIGHT: 20, // Minimum height for OSD element detection
    OSD_MAX_HEIGHT: 400, // Maximum height for OSD element detection

    // Notification element size detection (pixels)
    NOTIFICATION_MIN_WIDTH_BASIC: 50, // Basic notification minimum width check
    NOTIFICATION_MIN_HEIGHT_BASIC: 30, // Basic notification minimum height check
    NOTIFICATION_MAX_WIDTH_BASIC: 800, // Basic notification maximum width check
    NOTIFICATION_MAX_HEIGHT_BASIC: 400, // Basic notification maximum height check
    NOTIFICATION_MIN_WIDTH: 150, // Typical notification minimum width
    NOTIFICATION_MAX_WIDTH: 700, // Typical notification maximum width
    NOTIFICATION_MIN_HEIGHT: 50, // Typical notification minimum height
    NOTIFICATION_MAX_HEIGHT: 400, // Typical notification maximum height

    // Icon sizes (pixels)
    SYSTEM_INDICATOR_ICON_SIZE: 16, // System tray indicator icon size
};

// ============================================================================
// STYLING VALUES
// ============================================================================

/**
 * Styling values for blur effects, opacity, and visual properties
 * @type {Object}
 */
const STYLING = {
    // Default blur settings
    DEFAULT_BLUR_RADIUS: 20, // Default blur radius in pixels
    DEFAULT_PANEL_OPACITY: 0.4, // Default panel opacity (0-1)
    DEFAULT_MENU_OPACITY: 0.5, // Default menu/popup opacity (0-1)
    DEFAULT_BORDER_RADIUS: 15, // Default border radius in pixels

    // Blur adjustments
    BLUR_ADJUSTMENT_MENU: 0.9, // Blur radius multiplier for menu elements
    BLUR_ADJUSTMENT_OSD: 1.0, // Blur radius multiplier for OSD elements
    BLUR_ADJUSTMENT_TOOLTIP: 0.7, // Blur radius multiplier for tooltip elements
    BLUR_ADJUSTMENT_ALTTAB: 1.0, // Blur radius multiplier for Alt-Tab switcher

    // Border radius adjustments
    BORDER_ADJUSTMENT_MENU: 1.0, // Border radius multiplier for menu elements
    BORDER_ADJUSTMENT_OSD: 1.0, // Border radius multiplier for OSD elements
    BORDER_ADJUSTMENT_TOOLTIP: 0.8, // Border radius multiplier for tooltip elements
    BORDER_ADJUSTMENT_ALTTAB: 1.0, // Border radius multiplier for Alt-Tab switcher

    // Color adjustments
    COLOR_DARKEN_AMOUNT: 10, // RGB value reduction for darkening colors (used in OSD)

    // Opacity values
    ICON_OPACITY_NORMAL: 200, // Normal icon opacity (0-255) for system indicator
    ICON_OPACITY_HOVER: 255, // Hover icon opacity (0-255) for system indicator

    // Phase 2.5D: Dynamic Shadow System (replaces hardcoded values above)
    SHADOW_BASE_MULTIPLIER: 30, // Base shadow blur multiplier (shadowSpread * 30 = blur in px)
    SHADOW_INSET_MULTIPLIER: 1.25, // Inset glow blur multiplier (25% stronger than outer)
    SHADOW_VERTICAL_OFFSET: 3, // Vertical offset for outer shadow (px)
    SUBMENU_MARGIN_OFFSET: 3, // Additional symmetric margin for sub-menu sides (px)

    // Shadow blur ratio multipliers for element types (Phase 2.5D)
    SHADOW_BLUR_MULTIPLIERS: {
        panel: 1.0, // Primary element - full shadow (e.g., 12px @ 0.4 spread)
        popup: 0.8, // Secondary elements - reduced shadow (e.g., 9.6px @ 0.4)
        notification: 1.2, // Notifications - enhanced shadow (e.g., 14.4px @ 0.4)
        osd: 0.9, // OSD elements - slightly reduced (e.g., 10.8px @ 0.4)
        tooltip: 0.7, // Tooltips - subtle shadow (e.g., 8.4px @ 0.4)
        alttab: 1.1, // Alt-Tab switcher - prominent shadow (e.g., 13.2px @ 0.4)
    },

    // Alt-Tab specific shadows
    ALTTAB_SHADOW_BLUR: 24, // Alt-Tab switcher shadow blur radius
    ALTTAB_THUMBNAIL_SHADOW_BLUR: 16, // Alt-Tab thumbnail shadow blur radius
    ALTTAB_TITLE_SHADOW_BLUR: 16, // Alt-Tab window title shadow blur radius
    ALTTAB_TITLE_SHADOW_OPACITY: 0.3, // Alt-Tab window title shadow opacity

    // Notification specific shadows
    NOTIFICATION_SHADOW_OUTER_BLUR: 48, // Notification outer shadow blur radius
    NOTIFICATION_SHADOW_OUTER_OFFSET: 12, // Notification outer shadow vertical offset
    NOTIFICATION_SHADOW_OUTER_OPACITY: 0.4, // Notification outer shadow opacity
    NOTIFICATION_SHADOW_INNER_BLUR: 12, // Notification secondary shadow blur radius
    NOTIFICATION_SHADOW_INNER_OFFSET: 4, // Notification secondary shadow vertical offset
    NOTIFICATION_SHADOW_INNER_OPACITY: 0.2, // Notification secondary shadow opacity
    NOTIFICATION_SHADOW_HIGHLIGHT_OFFSET: 2, // Notification inset highlight offset
    NOTIFICATION_SHADOW_HIGHLIGHT_OPACITY: 0.1, // Notification inset highlight opacity
    NOTIFICATION_TRANSITION_DURATION: 0.3, // Notification transition duration (seconds)
    NOTIFICATION_TRANSITION_CUBIC_BEZIER: "cubic-bezier(0.4, 0, 0.2, 1)", // Notification easing function

    // Notification positioning constraints
    NOTIFICATION_POSITION_TOP_OFFSET: 5, // Minimum Y position for top notifications
    NOTIFICATION_POSITION_TOP_RIGHT_MAX_Y: 300, // Maximum Y for top-right notifications
    NOTIFICATION_POSITION_TOP_CENTER_MAX_Y: 200, // Maximum Y for top-center notifications

    // Adaptive blur brightness thresholds
    BRIGHTNESS_THRESHOLD_LIGHT: 150, // RGB brightness threshold for light backgrounds
    BRIGHTNESS_THRESHOLD_DARK: 80, // RGB brightness threshold for dark backgrounds
    ADAPTIVE_BLUR_MULTIPLIER_LIGHT: 1.3, // Blur multiplier for light backgrounds
    ADAPTIVE_BLUR_MULTIPLIER_DARK: 0.8, // Blur multiplier for dark backgrounds
    ADAPTIVE_BLUR_MAX: 25, // Maximum adaptive blur radius
    ADAPTIVE_BLUR_MIN: 5, // Minimum adaptive blur radius

    // CSS filter values for advanced effects
    FILTER_SATURATE_MULTIPLIER: 150, // Saturation percentage for CSS.supports test
    FILTER_CONTRAST_MULTIPLIER: 120, // Contrast percentage for CSS.supports test
    FILTER_BRIGHTNESS_MULTIPLIER: 110, // Brightness percentage for CSS.supports test

    // Phase 2.5E: Independent Inset Glow System (11. studenoga 2025.)
    // User-controlled inset glow independent of physical borders
    // Inspired by savjs/index.html demo full customization
    INSET_GLOW_DEFAULT_ENABLED: false, // Default: OFF (user opts-in)
    INSET_GLOW_BLUR_MIN: 4, // Minimum glow blur (4px)
    INSET_GLOW_BLUR_MAX: 40, // Maximum glow blur (40px - matches demo)
    INSET_GLOW_BLUR_DEFAULT: 20, // Default blur size (20px - balanced)
    INSET_GLOW_BORDER_MULTIPLIER: 4, // borderWidth × 4 = adaptive minimum
    INSET_GLOW_INTENSITY_MIN: 0.05, // Minimum intensity (very subtle)
    INSET_GLOW_INTENSITY_MAX: 0.5, // Maximum intensity (strong)
    INSET_GLOW_INTENSITY_DEFAULT: 0.15, // Default intensity (matches demo)
    INSET_GLOW_FALLBACK_COLOR: "rgba(255, 255, 255", // Fallback when no color set
};

// ============================================================================
// VERSION CONSTANTS
// ============================================================================

/**
 * Version thresholds for feature detection
 * @type {Object}
 */
const VERSION = {
    CINNAMON_MIN_BACKDROP_FILTER: 5.0, // Minimum Cinnamon version assumed to support backdrop-filter
    CINNAMON_DEFAULT_VERSION: 6.0, // Default Cinnamon version for fallback detection
};

// ============================================================================
// CSS CLASS NAMES
// ============================================================================

/**
 * CSS class names used for styling throughout the extension
 * @type {Object}
 */
const CSS_CLASSES = {
    // Base styling classes
    FADE_OUT: "transparency-fade-out", // Used for: Fade-out animation on element removal
    PERSISTENT_OVERLAY: "transparency-persistent-overlay", // Used for: Persistent overlay effects
    CUSTOM_PROFILE: "profile-custom", // Used for: Custom profile styling
    FALLBACK_BLUR: "transparency-fallback-blur", // Used for: Fallback blur when backdrop-filter not supported

    // Component-specific classes
    TOOLTIP_BLUR: "transparency-tooltip-blur", // Used for: Tooltip blur effect
    OSD_BLUR: "osd-blur", // Used for: OSD blur effect
    ALTTAB_BLUR: "transparency-alttab-blur", // Used for: Alt-Tab switcher blur effect
    NOTIFICATION_BLUR: "transparency-notification-blur", // Used for: Notification blur effect

    // Panel classes (for detection)
    PANEL: "panel", // Used for: Panel element detection
    PANEL_BUTTON: "panel-button", // Used for: Panel button detection
    APPLET_BOX: "applet-box", // Used for: Applet container detection

    // Switcher classes (for detection)
    SWITCHER_LIST: "switcher-list", // Used for: Alt-Tab switcher list detection
    SWITCHER_LIST_ITEM: "switcher-list-item", // Used for: Alt-Tab switcher item detection (to exclude)

    // Desktop classes (for detection)
    DESKTOP: "desktop", // Used for: Desktop element detection
    NEMO_DESKTOP: "nemo-desktop", // Used for: Nemo file manager desktop detection
    NAUTILUS_DESKTOP: "nautilus-desktop", // Used for: Nautilus file manager desktop detection
    CAJA_DESKTOP: "caja-desktop", // Used for: Caja file manager desktop detection

    // Tooltip class (for detection)
    TOOLTIP: "tooltip", // Used for: Tooltip element detection

    // menu@cinnamon.org applet classes (for sidebar detection and styling)
    APPMENU_SIDEBAR: "appmenu-sidebar", // Used for: Left sidebar in menu@cinnamon.org applet
    APPMENU_MAIN_BOX: "appmenu-main-box", // Used for: Main horizontal container in menu@cinnamon.org
    APPMENU_BACKGROUND: "appmenu-background", // Used for: Root menu actor class in menu@cinnamon.org
};

// ============================================================================
// SIGNAL AND EVENT NAMES
// ============================================================================

/**
 * Signal and event names for Cinnamon/GTK connections
 * @type {Object}
 */
const SIGNALS = {
    ACTOR_ADDED: "actor-added", // Used for: Stage monitoring for new actors (OSD, tooltip)
    BUTTON_PRESS_EVENT: "button-press-event", // Used for: Desktop right-click detection
    THEME_CHANGED: "theme-changed", // Used for: Theme change monitoring
    ALLOCATION_CHANGED: "allocation-changed", // Used for: Panel size change monitoring
    PANELS_ENABLED_CHANGED: "changed::panels-enabled", // Used for: Panel configuration change monitoring
    ACCELERATOR_ACTIVATED: "accelerator-activated", // Used for: Keyboard shortcut monitoring (OSD)
};

// ============================================================================
// SETTINGS KEYS
// ============================================================================

/**
 * Settings schema keys from settings-schema.json
 * @type {Object}
 */
const SETTINGS_KEYS = {
    // Basic transparency
    PANEL_OPACITY: "panel-opacity",
    MENU_OPACITY: "menu-opacity",
    BORDER_RADIUS: "border-radius",
    AUTO_DETECT_RADIUS: "auto-detect-radius",
    APPLY_PANEL_RADIUS: "apply-panel-radius",

    // Color overrides
    OVERRIDE_PANEL_COLOR: "override-panel-color",
    CHOOSE_OVERRIDE_PANEL_COLOR: "choose-override-panel-color",
    OVERRIDE_POPUP_COLOR: "override-popup-color",
    CHOOSE_OVERRIDE_POPUP_COLOR: "choose-override-popup-color",

    // Feature toggles
    ENABLE_NOTIFICATION_STYLING: "enable-notification-styling",
    ENABLE_OSD_STYLING: "enable-osd-styling",
    ENABLE_TOOLTIP_STYLING: "enable-tooltip-styling",
    ENABLE_ALTTAB_STYLING: "enable-alttab-styling",
    ENABLE_DESKTOP_CONTEXT_STYLING: "enable-desktop-context-styling",

    // System
    HIDE_TRAY_ICON: "hide-tray-icon",
    DEBUG_LOGGING: "debug-logging",

    // Blur settings
    BLUR_RADIUS: "blur-radius",
    BLUR_SATURATE: "blur-saturate",
    BLUR_CONTRAST: "blur-contrast",
    BLUR_BRIGHTNESS: "blur-brightness",
    BLUR_BACKGROUND: "blur-background",
    BLUR_BORDER_COLOR: "blur-border-color",
    BLUR_BORDER_WIDTH: "blur-border-width",
    BLUR_TRANSITION: "blur-transition",
    BLUR_OPACITY: "blur-opacity",
    BLUR_TEMPLATE: "blur-template",

    // Cinnamon system settings
    ALTTAB_SWITCHER_STYLE: "alttab-switcher-style", // Cinnamon org.cinnamon schema setting
};

// ============================================================================
// ACTOR ACTION NAMES
// ============================================================================

/**
 * Action names for Cinnamon actor events
 * @type {Object}
 */
const ACTIONS = {
    VOLUME: "volume", // Used for: Volume change OSD detection
    BRIGHTNESS: "brightness", // Used for: Brightness change OSD detection
};

// ============================================================================
// DEFAULT COLOR VALUES
// ============================================================================

/**
 * Default color values used throughout the extension
 * @type {Object}
 */
const COLORS = {
    // Panel defaults
    DEFAULT_PANEL_COLOR: "rgba(46, 52, 64, 0.8)", // Default panel color override
    DEFAULT_POPUP_COLOR: "rgba(255, 255, 255, 0.9)", // Default popup color override

    // Blur template default
    DEFAULT_BLUR_TEMPLATE: "frosted-glass-dark", // Default blur template name

    // Default blur parameters
    DEFAULT_BLUR_SATURATE: 1.0, // Default saturation multiplier
    DEFAULT_BLUR_CONTRAST: 0.9, // Default contrast multiplier
    DEFAULT_BLUR_BRIGHTNESS: 0.9, // Default brightness multiplier
    DEFAULT_BLUR_BACKGROUND: "rgba(255, 255, 255, 0.3)", // Default background overlay color
    DEFAULT_BLUR_BORDER_COLOR: "rgba(255, 255, 255, 0.3)", // Default border color
    DEFAULT_BLUR_BORDER_WIDTH: 0, // Default border width (pixels) - DEPRECATED: glow effect replaces borders
    DEFAULT_BLUR_OPACITY: 0.8, // Default blur layer opacity

    // Fallback colors
     FALLBACK_BORDER_COLOR: "rgba(255, 255, 255, 0.1)", // Fallback border when setting undefined
};

// ============================================================================
// DEFAULT COLORS (magic numbers)
// ============================================================================

/**
 * Hardcoded color values that appear throughout the codebase
 * These are the magic numbers that should ideally be imported from here
 * @type {Object}
 */
const DEFAULT_COLORS = {
    // Text colors for auto-generated foreground (themeUtils.js lines 145, 147)
    FOREGROUND_LIGHT: [250, 250, 250], // Light text on dark background
    FOREGROUND_DARK: [5, 5, 5],        // Dark text on light background
    HIGH_CONTRAST_WHITE: [255, 255, 255], // High contrast white
    HIGH_CONTRAST_BLACK: [0, 0, 0],      // High contrast black

    // Fallback colors (themeDetector.js)
    FALLBACK_GREY: { r: 128, g: 128, b: 128 },     // Generic fallback
    FALLBACK_DARK: { r: 50, g: 50, b: 50 },         // Dark fallback
    MINT_Y_DARK_FALLBACK: { r: 46, g: 46, b: 51 },  // Mint-Y-Dark panel
    NORD_PANEL_COLOR: { r: 46, g: 52, b: 64 },      // Nord theme panel
    DEFAULT_ACCENT: { r: 136, g: 192, b: 208 },     // Default accent color from extension.js

    // Notification color adjustment (notificationStyler.js line 479)
    NOTIFICATION_LIGHTEN_AMOUNT: 10, // RGB increment for notification lightening
};

// ============================================================================
// THEME UTILS COLOR MATHEMATICS
// ============================================================================

/**
 * Constants for color mathematics and theme detection
 * Used by ThemeUtils module for advanced color operations
 * @type {Object}
 */
const THEME_UTILS = {
    // HSP brightness thresholds
    HSP_DARK_THRESHOLD: 127.5, // Threshold for dark/light theme detection (0-255)

    // Auto-generated color intensities
    AUTO_HIGHLIGHT_INTENSITY: 0.3, // Default intensity for auto-highlight colors (0-1)

    // WCAG contrast ratios
    MIN_CONTRAST_RATIO: {
        AA: 4.5, // WCAG AA standard (normal text)
        AA_LARGE: 3.0, // WCAG AA for large text
        AAA: 7.0, // WCAG AAA standard (enhanced)
        AAA_LARGE: 4.5, // WCAG AAA for large text
    },

    // Contrast adjustment parameters
    CONTRAST_ADJUSTMENT_STEP: 0.05, // Step size for contrast adjustment iterations (0-1)
};

// ============================================================================
// SYSTEM INDICATOR
// ============================================================================

/**
 * System indicator constants
 * @type {Object}
 */
const SYSTEM_INDICATOR = {
    ICON_NAME: "applications-graphics-symbolic", // Icon used for system tray indicator
    PADDING_STYLE: "padding-left: 5px; padding-right: 5px;", // Inline style for indicator button
    TOOLTIP_OFFSET: 5, // Vertical offset for tooltip positioning (pixels)
};

// ============================================================================
// TIMESTAMP FORMATTING
// ============================================================================

/**
 * Timestamp formatting constants
 * @type {Object}
 */
const TIMESTAMP = {
    ISO_TIME_START: 11, // Start index for HH:MM:SS in ISO string
    ISO_TIME_END: 19, // End index for HH:MM:SS in ISO string
};

// ============================================================================
// HOVER / ACTIVE COLOR OVERRIDE
// ============================================================================

/**
 * Constants for hover and active (click) color override on panel/popup elements
 * Used by HoverStyleManager to generate a dynamic CSS stylesheet with concrete rgba values
 * @type {Object}
 */
const HOVER = {
    // Intensity passed to getAutoHighlightColor() for hover state (subtle)
    HOVER_INTENSITY: 0.3,
    // Intensity passed to getAutoHighlightColor() for active/click state (more visible)
    ACTIVE_INTENSITY: 0.5,
    // Alpha for inline set_style() hover color override
    HOVER_ALPHA: 0.5,
    // Filename of the dynamically generated hover CSS file (placed next to stylesheet.css)
    HOVER_STYLESHEET_FILENAME: 'hover-override.css',
    // CSS selectors for panel elements that use native CSS :hover pseudo-class
    PANEL_HOVER_SELECTORS: [
        '.applet-box',
        '.panel-launchers .launcher',
        '.window-list-item-box',
        '.grouped-window-list-item-box',
        '.workspace-button',
        '.workspace-button:outlined',
    ],
    // CSS selectors for popup menu items (Cinnamon maps hover → :active via JS)
    POPUP_HOVER_SELECTORS: [
        '.popup-menu-item',
        '.popup-sub-menu .popup-menu-item',
        '.popup-alternating-menu-item',
    ],
    // CSS selectors for miscellaneous UI elements with hover states
    MISC_HOVER_SELECTORS: [
        '.notification-icon-button',
        '.notification-button',
        '.sound-player StButton',
    ],
    // Special panel dummy selector that uses :entered pseudo-class (set via JS in panel.js)
    PANEL_ENTERED_SELECTOR: '.panel-dummy:entered',
};

// ============================================================================
// WALLPAPER COLOR EXTRACTION
// ============================================================================

/**
 * Constants for wallpaper color extraction and palette analysis
 * Phase 3: ColorPalette integration
 * @type {Object}
 */
const WALLPAPER_COLORS = {
    // Image analysis settings
    COLOR_ANALYSIS_MAX_DIMENSION: 800,      // Max px for pixbuf resize (memory management)
    COLOR_ANALYSIS_TARGET_SAMPLES: 10000,   // Target pixel sample count
    COLOR_MIN_SATURATION_DELTA: 30,         // Min RGB delta to avoid grayscale pixels
    COLOR_QUANTIZATION_STEP: 16,            // Quantization step for color clustering

    // Popup secondary color validation
    POPUP_MIN_CONTRAST_RATIO: 3.0,          // Min contrast ratio before fallback
    POPUP_SHADE_FALLBACK_DARK: 0.20,        // colorShade factor for dark theme fallback
    POPUP_SHADE_FALLBACK_LIGHT: -0.20,      // colorShade factor for light theme fallback

    // Brightness thresholds per theme mode (HSP range for accepted pixels)
    BRIGHTNESS_THRESHOLDS: {
        dark:  { min: 30,  max: 180 },      // Prefer darker tones for dark themes
        light: { min: 80,  max: 230 },      // Prefer lighter tones for light themes
    },

    // Dark/Light shade adjustment for dominant (panel) color
    PANEL_SHADE_DARK: 0.15,                 // Lighten dominant 15% for dark theme
    PANEL_SHADE_LIGHT: -0.10,               // Darken dominant 10% for light theme

    // Target HSL lightness (%) when boosting a too-dark accent to pass validation threshold
    ACCENT_BOOST_TARGET_LIGHTNESS: 38,
};

// ============================================================================
// EXPORT MODULE
// ============================================================================

module.exports = {
    TIMING,
    TRAVERSAL,
    SIZE,
    STYLING,
    VERSION,
    CSS_CLASSES,
    SIGNALS,
    SETTINGS_KEYS,
    ACTIONS,
    COLORS,
    DEFAULT_COLORS,
    THEME_UTILS,
    SYSTEM_INDICATOR,
    TIMESTAMP,
    HOVER,
    WALLPAPER_COLORS,
};
