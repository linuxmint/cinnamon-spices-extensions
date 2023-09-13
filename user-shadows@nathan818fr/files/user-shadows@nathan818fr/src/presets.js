const {SHADOW_CLASS_NAMES} = require('src/constants');

function getPresets() {
    return {
        // (radius is set to 1 because 0 cause crash, but opacity is set to 0 so nothing is drawn)
        'no-shadow': all([1, 0, 0, 0, 0], [1, 0, 0, 0, 0]),

        'arc-theme-dark': {
            normal: [
                [7, -1, 0, 7, 89],
                [4, -1, 0, 4, 89],
            ],
            dialog: [
                [7, -1, 0, 7, 89],
                [4, -1, 0, 4, 89],
            ],
            modal_dialog: [
                [7, -1, 0, 7, 89],
                [4, -1, 0, 4, 89],
            ],
            border: [
                [7, -1, 0, 7, 89],
                [4, -1, 0, 4, 89],
            ],
        },
        'arc-theme-light': {
            normal: [
                [7, -1, 0, 7, 51],
                [4, -1, 0, 4, 51],
            ],
            dialog: [
                [7, -1, 0, 7, 51],
                [4, -1, 0, 4, 51],
            ],
            modal_dialog: [
                [7, -1, 0, 7, 51],
                [4, -1, 0, 4, 51],
            ],
            border: [
                [7, -1, 0, 7, 51],
                [4, -1, 0, 4, 51],
            ],
        },

        // TODO: Add Windows 10, mac OS, etc
    };
}

function all(focused, unfocused) {
    const ret = {};
    for (const className of SHADOW_CLASS_NAMES) {
        ret[className] = [focused, unfocused];
    }
    return ret;
}

module.exports = {getPresets};
