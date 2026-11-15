// The development handle: a session drives the chooser through Cinnamon's
// DBus Eval rather than through any user gesture. Registered on enable,
// removed on disable, reached as global.cPlaceDev, and kept to this one
// module so a release can leave it out. Nothing on it moves a real window:
// the key probe refuses every key that applies, runs or saves a preset, or
// undoes; the plan probe reports what Apply would do without doing it, and
// the Enter probe what Enter would do; the save probe writes a preset as
// Ctrl and a digit would, and the point probe draws one as pointing at its
// row would; and the placement probes reach only a throwaway window titled
// cplace-probe, moving it as apply and undo move a window while keeping
// their own record, so the last apply's undo is never spent on the probe.

import type { Kept } from "./engine/apply";
import { move, putBack } from "./engine/apply";
import { actorTree } from "./engine/actor-tree";
import type { Chooser } from "./engine/chooser";
import { presetDigit } from "./engine/chooser-keys";
import type { EngineSettings } from "./engine/settings";

interface DevHandle {
    /** Open on a page, fitted to a work area of the height given, to show
     * a smaller screen on this one, or to the real one. */
    openChooser: (key?: string, pretendHeight?: number) => void;
    closeChooser: () => void;
    chooserRectangle: () => number[];
    chooserProbe: () => string;
    chooserKey: (symbol: number, shift?: boolean) => boolean;
    chooserPlan: () => string;
    chooserSave: (digit: number) => void;
    chooserPoint: (digit: number) => boolean;
    chooserFocusPreset: (digit: number) => boolean;
    chooserEnter: () => string;
    readSetting: (key: string) => string;
    writeSetting: (
        key: string,
        value: number | string | boolean | object,
    ) => void;
    placeProbe: (x: number, y: number, width: number, height: number) => string;
    unplaceProbe: () => string;
    probeState: () => string;
    probeInto: (state: string) => string;
}
/** Cinnamon's global object, where the handle is a property cPlace adds,
 * which the typings don't declare; only this module sets or removes it.
 * Reached through a function, as is Clutter below, so that a release build,
 * which never registers the handle, carries nothing of this module. */
function devGlobal(): { cPlaceDev?: DevHandle } {
    return global as unknown as { cPlaceDev?: DevHandle };
}

/** The probe window, found by its title; any other window is out of the
 * placement probes' reach. */
function findProbe(): imports.gi.Meta.Window | undefined {
    return global.workspace_manager
        .get_active_workspace()
        .list_windows()
        .find((window) => window.get_title() === "cplace-probe");
}

/** Where the probe is and in which states, as JSON. */
function probeState(): string {
    const probe = findProbe();
    if (probe === undefined) {
        return "no probe window";
    }
    const frame = probe.get_frame_rect();
    return JSON.stringify({
        frame: [frame.x, frame.y, frame.width, frame.height],
        maximised: probe.get_maximized(),
        fullscreen: probe.is_fullscreen(),
        minimised: probe.minimized,
    });
}

/** The probe's own undo record, apart from the last apply's. */
let probeKept: Kept | null = null;

/** Move the probe exactly as apply moves a real window, and report where
 * it landed. */
function placeProbe(
    x: number,
    y: number,
    width: number,
    height: number,
): string {
    const probe = findProbe();
    if (probe === undefined) {
        return "no probe window";
    }
    probeKept = move(probe, { x, y, width, height });
    const frame = probe.get_frame_rect();
    return JSON.stringify([frame.x, frame.y, frame.width, frame.height]);
}

/** Put the probe back exactly as undo puts back a real window. */
function unplaceProbe(): string {
    if (probeKept === null) {
        return "nothing placed";
    }
    putBack(probeKept);
    probeKept = null;
    return probeState();
}

/** Put the probe into a state an apply takes a window out of, fullscreen,
 * maximised both ways or minimised, or take it out of all three as a user
 * would. */
function probeInto(state: string): string {
    const probe = findProbe();
    if (probe === undefined) {
        return "no probe window";
    }
    if (state === "fullscreen") {
        probe.make_fullscreen();
    } else if (state === "maximised") {
        probe.maximize(imports.gi.Meta.MaximizeFlags.BOTH);
    } else if (state === "minimised") {
        probe.minimize();
    } else if (state === "normal") {
        probe.unmake_fullscreen();
        probe.unmaximize(imports.gi.Meta.MaximizeFlags.BOTH);
        probe.unminimize();
    }
    return probeState();
}

/** The open dialog's on-screen rectangle, for a screenshot of it alone. */
function chooserRectangle(chooser: Chooser): number[] {
    const layout = chooser.insides().layout;
    if (layout === null) {
        return [0, 0, 0, 0];
    }
    const [x, y] = layout.get_transformed_position();
    const [width, height] = layout.get_transformed_size();
    return [
        Math.round(x ?? 0),
        Math.round(y ?? 0),
        Math.round(width ?? 0),
        Math.round(height ?? 0),
    ];
}

/** A key as the shell takes it, refusing every key that applies, runs or
 * saves a preset, or undoes: Space, Enter, the digits and u. */
function chooserKey(chooser: Chooser, symbol: number, shift: boolean): boolean {
    const Clutter = imports.gi.Clutter;
    const refused = [
        Clutter.KEY_space,
        Clutter.KEY_Return,
        Clutter.KEY_KP_Enter,
        Clutter.KEY_u,
    ];
    if (refused.includes(symbol) || presetDigit(symbol) !== 0) {
        return false;
    }
    return chooser.insides().key(symbol, { control: false, shift });
}

/** What Apply would do now, as titles and frames, without doing it. */
function chooserPlan(chooser: Chooser): string {
    const result = chooser.insides().plan();
    if (result === null) {
        return JSON.stringify([]);
    }
    return JSON.stringify(
        result.targets.map((target) => ({
            title: result.liveWindows[target.id]?.get_title() ?? "?",
            ...target.frame,
        })),
    );
}

/** The handle's calls, bound to the live chooser and settings. */
function devHandle(chooser: Chooser, settings: EngineSettings): DevHandle {
    return {
        openChooser: (key, pretendHeight) => chooser.open(key, pretendHeight),
        closeChooser: () => chooser.close(),
        chooserRectangle: () => chooserRectangle(chooser),
        chooserProbe: () => {
            const layout = chooser.insides().layout;
            return layout === null ? "no chooser open" : actorTree(layout);
        },
        chooserKey: (symbol, shift = false) => chooserKey(chooser, symbol, shift),
        chooserPlan: () => chooserPlan(chooser),
        chooserSave: (digit) => {
            chooser.insides().save(digit);
        },
        chooserPoint: (digit) =>
            chooser.insides().presets?.pointAt(digit) ?? false,
        chooserFocusPreset: (digit) =>
            chooser.insides().presets?.focusRow(digit) ?? false,
        chooserEnter: () => chooser.insides().enter ?? "no chooser open",
        readSetting: (key) => JSON.stringify(settings.raw(key) ?? null),
        writeSetting: (key, value) => {
            settings.write(key, value);
        },
        placeProbe,
        unplaceProbe,
        probeState,
        probeInto,
    };
}

export function registerDevHandle(
    chooser: Chooser,
    settings: EngineSettings,
): void {
    devGlobal().cPlaceDev = devHandle(chooser, settings);
}

export function removeDevHandle(): void {
    delete devGlobal().cPlaceDev;
    probeKept = null;
}
