const SHADOW_CLASS_NAMES = ['normal', 'dialog', 'modal_dialog', 'utility', 'border', 'menu', 'popup-menu', 'dropdown-menu', 'attached'];

const SHADOW_STATES = {
    focused: 0,
    unfocused: 1,
};

const SHADOW_PARAMS = {
    radius: { index: 0, min: 1, max: 1024 },
    topFade: { index: 1, min: -1, max: 1024 },
    xOffset: { index: 2, min: -1024, max: 1024 },
    yOffset: { index: 3, min: -1024, max: 1024 },
    opacity: { index: 4, min: 0, max: 255 },
};

// Fallback shadow classes, corresponding to the latest cinnamon version
// (from: https://github.com/linuxmint/muffin/blob/bc2df248ac7395e86f62fc5d16cd7b9c9cb0f119/src/compositor/meta-shadow-factory.c#L120)
const FALLBACK_SHADOW_CLASSES = {
    // className: [focused[radius, topFade, xOffset, yOffset, opacity], unfocused[...]]
    'normal': [[6, -1, 0, 3, 255], [3, -1, 0, 3, 128]],
    'dialog': [[6, -1, 0, 3, 255], [3, -1, 0, 3, 128]],
    'modal_dialog': [[6, -1, 0, 1, 255], [3, -1, 0, 3, 128]],
    'utility': [[3, -1, 0, 1, 255], [3, -1, 0, 1, 128]],
    'border': [[6, -1, 0, 3, 255], [3, -1, 0, 3, 128]],
    'menu': [[6, -1, 0, 3, 255], [3, -1, 0, 0, 128]],
    'popup-menu': [[1, -1, 0, 1, 128], [1, -1, 0, 1, 128]],
    'dropdown-menu': [[1, 10, 0, 1, 128], [1, 10, 0, 1, 128]],
    'attached': [[6, -1, 0, 1, 255], [3, -1, 0, 3, 128]],
};

module.exports = { SHADOW_CLASS_NAMES, SHADOW_STATES, SHADOW_PARAMS, FALLBACK_SHADOW_CLASSES };
