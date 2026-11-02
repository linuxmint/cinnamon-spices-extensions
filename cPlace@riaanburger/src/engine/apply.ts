// Applying targets to live windows, in list order: out of fullscreen and
// out of maximised, then placed, shown if it was minimised, then raised,
// so walking the list bottom to top re-imposes both position and
// stacking. A window the targets omit is untouched, a target naming an
// unknown id is discarded, as the contract rules, and a window closed since
// it was gathered is passed over. Leaving those states is
// not a second guess of the target: Muffin's constrain_fullscreen and
// constrain_maximization hold such a window to its monitor or its work
// area whatever frame it is asked for, so without it the window would sit
// still under every arrangement, and a minimised window placed but left
// minimised leaves its slot empty on the desktop. What each window was is
// kept for one undo, so an arrangement applied by mistake can be put back:
// positions, sizes and the three states come back, stacking does not. A
// window Muffin refuses is logged and passed over, in the apply and in the
// undo, so one window's fault leaves the rest arranged or put back.

import type { Rectangle, WindowTarget } from "../arrangement";

type MetaWindow = imports.gi.Meta.Window;

/** A window as it was before a move, for putting it back. */
export interface Kept {
    window: MetaWindow;
    /** The frame the window returns to out of fullscreen and maximised,
     * read after leaving them, so the states go back on over the frame
     * Muffin keeps for leaving them again. */
    frame: Rectangle;
    /** Muffin's flags as they stood, held as the number they are: zero for
     * a window that was not maximised in either direction, which the enum
     * typing has no name for. */
    maximised: number;
    fullscreen: boolean;
    minimised: boolean;
}

let lastApplied: Kept[] = [];

/** Put a window's frame at a rectangle, top-left first. A terminal asks
 * for its size in whole characters, and when Muffin rounds a user's
 * move-and-resize to them it rebuilds the frame from the window's old
 * rectangle, anchored at the old top-left, so the asked position is lost:
 * constrain_size_increments starts from get_start_rect_for_resize in
 * constraints.c, which is the original rectangle for any user action. A
 * move on its own is exempt from that rounding, so a second, move-only
 * call puts the top-left where it was asked, as gTile's own placement
 * does. Found with GNOME Terminal and the grid on 25 September 2026. */
function place(window: MetaWindow, frame: Rectangle): void {
    window.move_resize_frame(true, frame.x, frame.y, frame.width, frame.height);
    window.move_frame(true, frame.x, frame.y);
}

/** A window's frame as plain numbers. */
function frameOf(window: MetaWindow): Rectangle {
    const frame = window.get_frame_rect();
    return {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
    };
}

/** Move one window to a frame as every arrangement does: out of
 * fullscreen, then out of maximised, then placed, then shown if it was
 * minimised. Muffin moves a window leaving either state to the one frame
 * it saved for both, so the frame read after leaving them is the one to
 * return to. Found with a fullscreen probe window on 26 September 2026,
 * which stayed at the monitor's size under the placement until it left
 * fullscreen first. A minimised window is placed while still hidden, so
 * it appears where it lands rather than where it was. The window is
 * handed to keep before anything changes, so a move Muffin refuses part
 * way still leaves it to be put back. */
export function move(
    window: MetaWindow,
    frame: Rectangle,
    keep: (kept: Kept) => void = () => {},
): Kept {
    const kept: Kept = {
        window,
        frame: frameOf(window),
        maximised: window.get_maximized(),
        fullscreen: window.is_fullscreen(),
        minimised: window.minimized,
    };
    keep(kept);
    if (kept.fullscreen) {
        window.unmake_fullscreen();
    }
    if (kept.maximised !== 0) {
        window.unmaximize(kept.maximised);
    }
    kept.frame = frameOf(window);
    place(window, frame);
    if (kept.minimised) {
        window.unminimize();
    }
    return kept;
}

/** Put a window back as it was kept, the reverse of leaving its states:
 * out of any state entered since the apply, then the frame, then
 * maximised, then fullscreen, then minimised or shown as it was. A state
 * entered since holds the window as the apply found states do, so it is
 * left first or the frame could not land. Maximising saves the frame it
 * finds, so a later unmaximise returns the window to it, and a window
 * minimised last comes back from the panel in the states it had. */
export function putBack(kept: Kept): void {
    const window = kept.window;
    if (window.is_fullscreen()) {
        window.unmake_fullscreen();
    }
    const maximised: number = window.get_maximized();
    if (maximised !== 0) {
        window.unmaximize(maximised);
    }
    place(window, kept.frame);
    if (kept.maximised !== 0) {
        window.maximize(kept.maximised);
    }
    if (kept.fullscreen) {
        window.make_fullscreen();
    }
    if (kept.minimised) {
        window.minimize();
    } else if (window.minimized) {
        window.unminimize();
    }
}

/** The windows Muffin manages now. A window closed since it was gathered
 * is no longer listed, and nothing promises what a move does to one. */
function managedWindows(): Set<MetaWindow> {
    return new Set(
        global.display.list_windows(imports.gi.Meta.ListWindowsFlags.DEFAULT),
    );
}

export function apply(
    targets: WindowTarget[],
    liveWindows: MetaWindow[],
): void {
    const managed = managedWindows();
    const kept: Kept[] = [];
    for (const target of targets) {
        const window = liveWindows[target.id];
        if (window === undefined || !managed.has(window)) {
            continue;
        }
        passOverFault(window, "arranged", () => {
            move(window, target.frame, (entry) => kept.push(entry));
            window.raise();
        });
    }
    // An apply that moved nothing leaves the last one's to undo.
    if (kept.length > 0) {
        lastApplied = kept;
    }
}

/** Run one window's part, logging a fault Muffin raises rather than
 * letting it stop the windows after it. True when the part ran whole. */
function passOverFault(
    window: MetaWindow,
    what: string,
    part: () => void,
): boolean {
    try {
        part();
        return true;
    } catch (error) {
        global.logError(
            `cPlace: "${window.get_title()}" was not ${what}: ${String(error)}`,
        );
        return false;
    }
}

/** Let go of the last apply's record, and the windows it holds, as
 * disabling the extension does. */
export function forgetUndo(): void {
    lastApplied = [];
}

/** Put back every window the last apply moved. One level, spent once
 * used; a window closed since is passed over. True when anything moved. */
export function undo(): boolean {
    const kept = lastApplied;
    lastApplied = [];
    const managed = managedWindows();
    let restored = 0;
    for (const entry of kept) {
        if (
            managed.has(entry.window) &&
            passOverFault(entry.window, "put back", () => putBack(entry))
        ) {
            restored += 1;
        }
    }
    return restored > 0;
}
