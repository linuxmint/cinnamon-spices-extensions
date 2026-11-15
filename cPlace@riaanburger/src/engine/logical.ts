// The desktop's logical pixels: the ones St draws the chooser in, which a
// desktop scaled to 2 draws with two device pixels each. Every length the
// chooser shows, stores or keeps in a preset is logical, so it looks the
// same on a screen at any scale, and becomes device pixels only where it
// goes to an arrangement, which works in the screen's own.

import { currentWorkArea } from "./gather";

/** Device pixels as the chooser shows them, whole. */
export function logical(pixels: number): number {
    return Math.round(pixels / global.ui_scale);
}

/** The work area's size in logical pixels. */
export function logicalRoom(): { width: number; height: number } {
    const room = currentWorkArea();
    return {
        width: Math.floor(room.width / global.ui_scale),
        height: Math.floor(room.height / global.ui_scale),
    };
}

/** Values with the named lengths turned from logical pixels to device
 * pixels at a scale, the desktop's unless given, the rest as they are. */
export function toDevice<Values extends object>(
    values: Values,
    lengths: readonly (keyof Values)[],
    scale: number = global.ui_scale,
): Values {
    const device = { ...values };
    for (const length of lengths) {
        const value = device[length];
        if (typeof value === "number") {
            device[length] = (value * scale) as Values[typeof length];
        }
    }
    return device;
}
