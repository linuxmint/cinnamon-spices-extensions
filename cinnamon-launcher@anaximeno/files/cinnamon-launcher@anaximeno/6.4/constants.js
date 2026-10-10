var UUID = "cinnamon-launcher@anaximeno";
var HOTKEY_ID = "cinnamon-launcher-open";

var BASE_DIALOG_WIDTH = 680;
var BASE_ICON_SIZE = 28;

var SEARCH_DEBOUNCE_MS = 90;

var HOTKEY_DEBOUNCE_MS = 250;

// Covers the visible viewport plus a scroll buffer; the rest fills on idle.
var INITIAL_ROW_FILL_COUNT = 24;
var ROW_FILL_CHUNK_SIZE = 32;

var ROW_ANIMATION_STEP_MS = 12;
var ROW_ANIMATION_MAX_DELAY_MS = 120;
var ROW_ANIMATION_DURATION_MS = 140;

module.exports = {
    UUID,
    HOTKEY_ID,
    BASE_DIALOG_WIDTH,
    BASE_ICON_SIZE,
    SEARCH_DEBOUNCE_MS,
    HOTKEY_DEBOUNCE_MS,
    INITIAL_ROW_FILL_COUNT,
    ROW_FILL_CHUNK_SIZE,
    ROW_ANIMATION_STEP_MS,
    ROW_ANIMATION_MAX_DELAY_MS,
    ROW_ANIMATION_DURATION_MS,
};
