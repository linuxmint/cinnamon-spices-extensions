// Gathering the arrangement's input from the live desktop, and nothing
// else: the monitor an arrangement uses and its work area from Muffin
// rather than the monitor's own size, every monitor's work area beside it,
// every normal window on the current workspace ordered bottom to top by
// stacking, on whichever monitor it stands, their frames as they stand, and
// the focused window for the pages that act on it. The id handed to the
// arrangement is the window's index here, engine-owned and per-call; apply
// maps it back. The settings are the page's business, not this module's.

import type { ArrangementWindow, Rectangle } from "../arrangement";
import { _, fill } from "../i18n";

type MetaWindow = imports.gi.Meta.Window;

/** The gathering scope: whether minimised windows join. Applications are no
 * gate here: every application's windows are gathered and listed, and the
 * ticks decide participation, since an application's id is known only once
 * one of its windows reports it. */
export interface Scope {
    includeMinimised: boolean;
}

/** What is gathered: the work area of the monitor arranged on and every
 * monitor's, the windows, and for each whether it stands on that monitor. */
export interface Gathered {
    workArea: Rectangle;
    workAreas: Rectangle[];
    windows: ArrangementWindow[];
    liveWindows: MetaWindow[];
    here: boolean[];
}

/** The application id a window belongs to, through the window tracker
 * rather than class strings; null while the tracker does not know it. An
 * id depends on how the application was installed: VS Code, for one, can
 * report com.microsoft.VSCode.desktop where its launcher is code.desktop,
 * which is why ids are read from windows, never assumed. */
export function windowAppId(window: MetaWindow): string | null {
    const app =
        imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(window);
    return app !== null ? app.get_id() : null;
}

/** The application's display name for a window, from the same tracker; null
 * while the tracker does not know it. */
export function windowAppName(window: MetaWindow): string | null {
    const app =
        imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(window);
    return app !== null ? app.get_name() : null;
}

/** An application's display name from its id, or the id itself when the
 * system doesn't know it, for naming an application a preset keeps. */
export function appName(id: string): string {
    const app = imports.gi.Cinnamon.AppSystem.get_default().lookup_app(id);
    return app !== null ? app.get_name() : id;
}

/** A window is in scope when it is a normal window, and not minimised
 * unless the scope asks for minimised windows too. */
function inScope(window: MetaWindow, scope: Scope): boolean {
    if (window.window_type !== imports.gi.Meta.WindowType.NORMAL) {
        return false;
    }
    return !window.minimized || scope.includeMinimised;
}

/** A window's frame as it stands, in our rectangle's terms. */
export function frameOf(window: MetaWindow): Rectangle {
    const frame = window.get_frame_rect();
    return {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
    };
}

/** The monitor the chooser holds from the moment it builds until it closes,
 * so that its pages, its fitting and the dialog agree on one monitor while
 * the pointer moves; null while it is closed. */
let heldMonitor: number | null = null;

/** The monitor an arrangement uses: the focused window's, where the user
 * was working, or with nothing focused the pointer's, where Cinnamon opens
 * its dialogs. */
export function arrangementMonitor(): number {
    return focusedWindow()?.get_monitor() ?? global.display.get_current_monitor();
}

/** The chooser holds a monitor as it builds, and lets go as it closes. */
export function holdMonitor(monitor: number | null): void {
    heldMonitor = monitor;
}

/** The monitor held, or the one an arrangement would use now. */
export function currentMonitor(): number {
    return heldMonitor ?? arrangementMonitor();
}

/** How many monitors the desktop has. */
export function monitorCount(): number {
    return global.display.get_n_monitors();
}

/** A monitor's work area on the active workspace: the space the panels
 * leave free on it. */
function workAreaOf(monitor: number): Rectangle {
    const area = global.workspace_manager
        .get_active_workspace()
        .get_work_area_for_monitor(monitor);
    return { x: area.x, y: area.y, width: area.width, height: area.height };
}

/** The work area of the monitor an arrangement uses. */
export function currentWorkArea(): Rectangle {
    return workAreaOf(currentMonitor());
}

/** Every monitor's work area, in Muffin's order. */
export function allWorkAreas(): Rectangle[] {
    return Array.from({ length: monitorCount() }, (_, monitor) =>
        workAreaOf(monitor),
    );
}

/** The smallest rectangle holding every monitor's work area: the whole
 * desktop, as a recording keeps it. */
export function desktopArea(): Rectangle {
    const areas = allWorkAreas();
    const left = Math.min(...areas.map((area) => area.x));
    const top = Math.min(...areas.map((area) => area.y));
    const right = Math.max(...areas.map((area) => area.x + area.width));
    const bottom = Math.max(...areas.map((area) => area.y + area.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** How a preview names where it draws, before its size: nothing on a
 * desktop of one monitor, the monitor's number counted from one on more. */
export function placeName(): string {
    return monitorCount() > 1
        ? fill(_("Monitor {number}"), { number: currentMonitor() + 1 })
        : "";
}

/** The focused window when it is a normal, unminimised window on the
 * active workspace, and null otherwise. Muffin keeps reporting the client
 * window as focused while a modal dialog is up, so a page may read it as it
 * builds. */
export function focusedWindow(): MetaWindow | null {
    // The typing promises a window; with nothing focused the runtime
    // hands back null.
    const window = global.display.focus_window as MetaWindow | null;
    if (window === null || !inScope(window, { includeMinimised: false })) {
        return null;
    }
    const workspace = global.workspace_manager.get_active_workspace();
    return window.located_on_workspace(workspace) ? window : null;
}

export function gather(scope: Scope): Gathered {
    const workspace = global.workspace_manager.get_active_workspace();
    const stacked = global.display.sort_windows_by_stacking(
        workspace.list_windows().filter((window) => inScope(window, scope)),
    );
    const monitor = currentMonitor();
    return {
        workArea: workAreaOf(monitor),
        workAreas: allWorkAreas(),
        windows: stacked.map((window, index) => ({
            id: index,
            frame: frameOf(window),
        })),
        liveWindows: stacked,
        here: stacked.map((window) => window.get_monitor() === monitor),
    };
}
