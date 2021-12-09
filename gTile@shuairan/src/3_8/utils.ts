const { Object } = imports.gi.GObject;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const Meta = imports.gi.Meta;
const Panel = imports.ui.panel;
const Main = imports.ui.main;

export const UUID = 'gTile@shuairan';

export const isFinalized = function (obj: any) {
    return obj && Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
}

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');
export function _(str: string) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if (customTranslation != str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}

/**
 * Type guard for key
 * @param obj 
 * @param key 
 * @returns 
 */
export function objHasKey<T>(obj: T, key: PropertyKey): key is keyof T {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

export function addSignals<T extends { new(...args: any[]): {} }>(constructor: T) {
    Signals.addSignalMethods(constructor.prototype);
    return class extends constructor { }
}

export interface SignalOverload<T extends string> {
    connect(signal: T, callback: () => void): void;
    emit(signal: T): void;
}

export const reset_window = (metaWindow: imports.gi.Meta.Window | null) => {
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
    metaWindow?.tile(Meta.TileMode.NONE, false);
}

const _getInvisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
    let outerRect = metaWindow.get_outer_rect();
    let inputRect = metaWindow.get_input_rect();
    let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];

    return [borderX, borderY];
}

export const move_maximize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number) => {
    if (metaWindow == null)
        return;

    let [borderX, borderY] = _getInvisibleBorderPadding(metaWindow);

    x = x - borderX;
    y = y - borderY;

    metaWindow.move_frame(true, x, y);
    metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
}

export const move_resize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number, width: number, height: number) => {
    if (!metaWindow)
        return;

    // Fix for client-decorated window positioning by @mtwebster
    // See here for more info
    // https://github.com/linuxmint/cinnamon-spices-extensions/commit/fda3a2b0c6adfc79ba65c6bd9a174795223523b9

    let clientRect = metaWindow.get_rect();
    let outerRect = metaWindow.get_outer_rect();

    let client_deco = clientRect.width > outerRect.width &&
        clientRect.height > outerRect.height;

    if (client_deco) {
        x -= outerRect.x - clientRect.x;
        y -= outerRect.y - clientRect.y;
        width += (clientRect.width - outerRect.width);
        height += (clientRect.height - outerRect.height);
    } else {
        width -= (outerRect.width - clientRect.width);
        height -= (outerRect.height - clientRect.height);
    }

    metaWindow.resize(true, width, height);
    metaWindow.move_frame(true, x, y);
}

const getPanelHeight = (panel: imports.ui.panel.Panel) => {
    return panel.height
        || panel.actor.get_height();  // fallback for old versions of Cinnamon
}

export const getUsableScreenArea = (monitor: imports.ui.layout.Monitor) => {
    let top = monitor.y;
    let bottom = monitor.y + monitor.height;
    let left = monitor.x;
    let right = monitor.x + monitor.width;

    for (let panel of Main.panelManager.getPanelsInMonitor(monitor.index)) {
        if (!panel.isHideable()) {
            switch (panel.panelPosition) {
                case Panel.PanelLoc.top:
                    top += getPanelHeight(panel);
                    break;
                case Panel.PanelLoc.bottom:
                    bottom -= getPanelHeight(panel);
                    break;
                case Panel.PanelLoc.left:
                    left += getPanelHeight(panel); // even vertical panels use 'height'
                    break;
                case Panel.PanelLoc.right:
                    right -= getPanelHeight(panel);
                    break;
            }
        }
    }

    let width = right > left ? right - left : 0;
    let height = bottom > top ? bottom - top : 0;
    return [left, top, width, height];
}

export const getMonitorKey = (monitor: imports.ui.layout.Monitor) => {
    return monitor.x + ':' + monitor.width + ':' + monitor.y + ':' + monitor.height;
}

export const getAdjacentMonitor = (monitor: imports.ui.layout.Monitor, side: imports.gi.Meta.Side): imports.ui.layout.Monitor => {
    const monitors = Main.layoutManager.monitors;
    const contactsOnSide: [monitor: imports.ui.layout.Monitor, contactSurface: number][] = [];
    for (const mon of monitors) {
        if (isEqual(mon, monitor))
            continue;

        const verticalContact = rangeToContactSurface([mon.y, mon.y + mon.height], [monitor.y, monitor.y + monitor.height]);
        const horizontalContact = rangeToContactSurface([mon.x, mon.x + mon.width], [monitor.x, monitor.x + monitor.width]);
        switch (side) {
            case Meta.Side.LEFT:
                if (monitor.x == mon.x + mon.width)
                    contactsOnSide.push([mon, verticalContact]);
                break;
            case Meta.Side.RIGHT:
                if (monitor.x + monitor.width == mon.x)
                    contactsOnSide.push([mon, verticalContact]);
                break;
            case Meta.Side.TOP:
                if (monitor.y == mon.y + mon.height)
                    contactsOnSide.push([mon, horizontalContact]);
                break;
            case Meta.Side.BOTTOM:
                if (monitor.y + monitor.height == mon.y)
                    contactsOnSide.push([mon, horizontalContact]);
                break;
        }
    }

    if (contactsOnSide.length == 0)
        return monitor;

    // Return the monitor with the most contact
    return contactsOnSide.reduce(
        (max, current) => (current[1] > max[1] ? current : max),
        contactsOnSide[0]
    )[0];

}

function isEqual(monitor1: imports.ui.layout.Monitor, monitor2: imports.ui.layout.Monitor): boolean {
    return (
        monitor1.x == monitor2.x &&
        monitor1.y == monitor2.y &&
        monitor1.height == monitor2.height &&
        monitor1.width == monitor2.width
    );
}

export const getFocusApp = () => {
    return global.display.focus_window;
}

const isPrimaryMonitor = (monitor: imports.ui.layout.Monitor) => {
    return Main.layoutManager.primaryMonitor === monitor;
}

type Range = [start: number, end: number];

function intersection(a: Range, b: Range): Range | null {
    //get the range with the smaller starting point (min) and greater start (max)
    let min: Range = (a[0] < b[0] ? a : b)
    let max: Range = (min == a ? b : a)

    //min ends before max starts -> no intersection
    if (min[1] < max[0])
        return null //the ranges don't intersect

    return [max[0], (min[1] < max[1] ? min[1] : max[1])]
}

function rangeToContactSurface(a: Range, b: Range): number {
    const range = intersection(a, b);
    return range ? range[1] - range[0] : 0;
}

export const GetMonitorAspectRatio = (monitor: imports.ui.layout.Monitor) => {
    const aspectRatio = Math.max(monitor.width, monitor.height) / Math.min(monitor.width, monitor.height);
    return {
        ratio: aspectRatio,
        widthIsLonger: monitor.width > monitor.height
    }
}