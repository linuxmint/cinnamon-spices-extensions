const Meta = imports.gi.Meta;
const St = imports.gi.St;

const { FAMILIES } = require('./resolutions');

function uiScale() {
    if (global.ui_scale > 0) {
        return global.ui_scale;
    }
    const context = St.ThemeContext.get_for_stage(global.stage);
    return context && context.scale_factor > 0 ? context.scale_factor : 1;
}

function scaleValue(value, scale) {
    return Math.max(1, Math.round(value * scale));
}

function targetWindow() {
    return global.display.get_focus_window();
}

function prepare(window) {
    if (!window || window.get_window_type() === Meta.WindowType.DESKTOP) {
        return false;
    }
    if (window.is_fullscreen()) {
        return false;
    }
    if (window.get_maximized() !== 0) {
        window.unmaximize(Meta.MaximizeFlags.BOTH);
    }
    if (window.tile_type !== undefined && window.tile_type !== Meta.WindowTileType.NONE) {
        window.unmaximize(Meta.MaximizeFlags.BOTH);
    }
    return true;
}

function resizeWindow(window, width, height, center, useLogical) {
    if (!prepare(window) || !window.resizeable) {
        return false;
    }

    const area = window.get_work_area_current_monitor();
    const frame = window.get_frame_rect();
    const scale = useLogical ? uiScale() : 1;

    const w = Math.min(scaleValue(width, scale), area.width);
    const h = Math.min(scaleValue(height, scale), area.height);

    let x;
    let y;
    if (center) {
        x = area.x + Math.floor((area.width - w) / 2);
        y = area.y + Math.floor((area.height - h) / 2);
    } else {
        x = Math.max(area.x, Math.min(frame.x, area.x + area.width - w));
        y = Math.max(area.y, Math.min(frame.y, area.y + area.height - h));
    }

    window.move_resize_frame(true, x, y, w, h);
    return true;
}

function centerWindow(window) {
    if (!prepare(window)) {
        return false;
    }

    const area = window.get_work_area_current_monitor();
    const frame = window.get_frame_rect();

    const w = Math.min(frame.width, area.width);
    const h = Math.min(frame.height, area.height);

    window.move_resize_frame(true,
        area.x + Math.floor((area.width - w) / 2),
        area.y + Math.floor((area.height - h) / 2),
        w, h);
    return true;
}

function resolutionGroups(window, enabledIds, fitOnly, useLogical) {
    const area = window.get_work_area_current_monitor();
    const scale = useLogical ? uiScale() : 1;
    const groups = [];

    for (const family of FAMILIES) {
        if (enabledIds.indexOf(family.id) === -1) {
            continue;
        }
        const entries = family.entries.filter(([w, h]) => !fitOnly
            || (scaleValue(w, scale) <= area.width && scaleValue(h, scale) <= area.height));
        if (entries.length > 0) {
            groups.push({ label: family.label, entries: entries });
        }
    }
    return groups;
}

function entryLabel(width, height, name) {
    return width + " × " + height + "   " + name;
}

module.exports = {
    FAMILIES,
    uiScale,
    scaleValue,
    targetWindow,
    resizeWindow,
    centerWindow,
    resolutionGroups,
    entryLabel
};
