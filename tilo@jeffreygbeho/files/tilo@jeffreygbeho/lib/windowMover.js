/* tilo - safe window placement. Decides HOW to place, never WHERE. */

const Meta = require('gi.Meta');
const Mainloop = require('mainloop');
const Geometry = require('./lib/geometry');
const Logger = require('./lib/logger');

/* Position must land exactly; a couple of pixels covers rounding. */
const POSITION_TOLERANCE = 2;

/*
 * The latest target requested per window. A re-assert that is no longer the
 * current target must not fire: otherwise a stale one overwrites a newer
 * placement (press left then right quickly and the window snaps back left).
 */
const pending = new Map();

/*
 * Is this window a tiling candidate?
 * We exclude aggressively rather than produce a broken layout.
 */
function isTileable(window) {
    if (!window) return false;
    try {
        if (window.get_window_type() !== Meta.WindowType.NORMAL) return false;
        if (window.is_skip_taskbar()) return false;
        if (window.is_fullscreen()) return false;
        if (!window.allows_move()) return false;
        /*
         * A maximized window reports allows_resize() === false in Muffin: it only
         * becomes resizable once unmaximized, which place() does first. Testing it
         * here would silently reject every maximized window - i.e. most windows.
         */
        if (!window.get_maximized() && !window.allows_resize()) return false;
        return true;
    } catch (e) {
        Logger.error('isTileable failed', e);
        return false;
    }
}

function focusedTileableWindow() {
    const window = global.display.get_focus_window();
    if (!isTileable(window)) {
        Logger.debug('No tileable window focused');
        return null;
    }
    return window;
}

/*
 * THE CSD TRAP - the core of the problem.
 *
 * Modern GTK apps (Nemo, Chrome, Firefox) draw their own title bar and carry an
 * invisible shadow border around the window.
 *   get_buffer_rect() includes that shadow  -> visible 10-20 px misalignment
 *   get_frame_rect()  excludes it           -> what the user actually sees
 *
 * We work in frame coordinates ONLY, in both directions.
 */
function frameRect(window) {
    const rect = window.get_frame_rect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/*
 * Placement takes TWO calls, and the second is not redundant.
 *
 * A window that declares resize increments (terminals are the common case)
 * makes Muffin's constraint engine adjust the requested size - and when it
 * does, the move half of move_resize_frame() is dropped. The window ends up
 * the right size at its old position, which reads to the user as "the shortcut
 * resizes but never moves".
 *
 * Measured on GNOME Terminal, 1920x1040 target from 600,400:
 *   move_resize_frame alone       -> 1918x1037 at +600+400   (position ignored)
 *   move_resize_frame + move_frame -> 1918x1037 at +0+0      (correct)
 *
 * move_frame() carries no size, so nothing can be adjusted and nothing is
 * dropped. It is a no-op for windows that placed correctly the first time.
 */
function moveResize(window, target) {
    window.move_resize_frame(true, target.x, target.y, target.width, target.height);
    window.move_frame(true, target.x, target.y);
}

function place(window, target) {
    if (!isTileable(window)) return false;

    try {
        /* A maximized window ignores move_resize_frame: unmaximize first. */
        if (window.get_maximized()) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        pending.set(window, target);
        moveResize(window, target);

        /*
         * Some apps (GTK CSD, Electron) settle asynchronously and ignore the
         * first request. We re-assert ONCE on the next idle, never in a loop:
         * a loop would turn into a fight with the application.
         */
        Mainloop.idle_add(() => {
            try {
                /* Superseded by a newer placement: do nothing. */
                if (pending.get(window) !== target) return false;
                pending.delete(window);

                const actual = frameRect(window);
                /*
                 * Only the POSITION is re-asserted. A window with resize
                 * increments (terminals) legitimately rounds its size down and
                 * will never match exactly - re-asserting that forever would be
                 * a fight we cannot win.
                 */
                const misplaced = Math.abs(actual.x - target.x) > POSITION_TOLERANCE ||
                                  Math.abs(actual.y - target.y) > POSITION_TOLERANCE;
                if (misplaced) {
                    Logger.debug(`Re-asserting: got ${Geometry.describe(actual)}, ` +
                                 `wanted ${Geometry.describe(target)}`);
                    window.move_frame(true, target.x, target.y);
                }
            } catch (e) {
                Logger.error('Re-assert failed', e);
            }
            return false; /* do not repeat */
        });

        Logger.debug(`Placed "${window.get_title()}" at ${Geometry.describe(target)}`);
        return true;
    } catch (e) {
        Logger.error('Placement failed', e);
        return false;
    }
}

/* Called from disable(): never keep references to windows after unload. */
function reset() {
    pending.clear();
}

module.exports = { isTileable, focusedTileableWindow, frameRect, place, reset };
