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

const _getVisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
    let clientRect = metaWindow.get_rect();
    let outerRect = metaWindow.get_outer_rect();

    let borderX = outerRect.width - clientRect.width;
    let borderY = outerRect.height - clientRect.height;

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
    if (metaWindow == null)
        return;

    let [vBorderX, vBorderY] = _getVisibleBorderPadding(metaWindow);

    width = width - vBorderX;
    height = height - vBorderY;

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

export const getFocusApp = () => {
    return global.display.focus_window;
}

const isPrimaryMonitor = (monitor: imports.ui.layout.Monitor) => {
    return Main.layoutManager.primaryMonitor === monitor;
}