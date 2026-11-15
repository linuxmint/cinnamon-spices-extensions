// The window list's ticks, as plain data: which applications are ticked,
// which gathered windows are, and the one window a page's focus rule may
// leave out. An application's tick ticks all its windows on the monitor
// arranged on, and a window's own tick ticks its application's when it
// completes that set. A window on another monitor stands apart: it arrives
// unticked whatever its application, only its own tick brings it over, and
// it never counts towards its application's tick, so that nothing leaves
// its monitor unasked. A tick set by
// hand stays through new gatherings, as the minimised toggle makes, even one
// that leaves its window out for a while, and only a preset's scope replaces
// the ticks wholesale. Pure, so every
// rule here is tested without a desktop; window-choice.ts keeps the live
// windows the indices here stand for.

/** A gathered window as the ticks know it: a key that stays the window's
 * own from one gathering to the next, its application's id, null while
 * the window tracker does not know it, and whether it stands on the monitor
 * arranged on. */
export interface TickedWindow {
    key: number;
    appId: string | null;
    here: boolean;
}

export class Ticks {
    private appTicks: Record<string, boolean> = {};
    private windows: readonly TickedWindow[] = [];
    private ticks: boolean[] = [];
    /** Every window gathered since the scope was last set, by its key, with
     * the tick it had when a gathering last left it, so that a window the
     * minimised toggle hides and shows again comes back as it went. */
    private remembered = new Map<
        number,
        { appId: string | null; here: boolean; ticked: boolean }
    >();
    /** The window the focus rule left unticked, by its index, so that its
     * untick does not read as its application's being unticked. */
    private ruledOut: number | null = null;

    /** The applications whose windows arrive ticked. */
    constructor(appIds: readonly string[]) {
        this.setApps(appIds);
    }

    /** The ticked applications, replacing any before, as a preset's scope
     * sets them. The windows are forgotten with the ticks they had, so the
     * next gathering ticks every window as its application now is. */
    setApps(appIds: readonly string[]): void {
        this.appTicks = {};
        for (const id of appIds) {
            this.appTicks[id] = true;
        }
        this.windows = [];
        this.ticks = [];
        this.remembered.clear();
        this.ruledOut = null;
    }

    /** The applications whose own ticks are on. */
    apps(): string[] {
        return Object.keys(this.appTicks).filter(
            (id) => this.appTicks[id] === true,
        );
    }

    /** A new gathering of windows, such as the minimised toggle makes. A
     * window gathered before keeps its tick, and the focus rule's mark,
     * found again by its key wherever the gathering puts it; a window new
     * to the list is ticked as its application is. */
    gather(windows: readonly TickedWindow[]): void {
        this.windows.forEach((window, index) => {
            this.remembered.set(window.key, {
                appId: window.appId,
                here: window.here,
                ticked: this.ticks[index] === true,
            });
        });
        const ruledOutKey =
            this.ruledOut === null
                ? null
                : (this.windows[this.ruledOut]?.key ?? null);
        this.ticks = windows.map(
            (window) =>
                this.remembered.get(window.key)?.ticked ??
                this.seeded(window),
        );
        const ruledOut = windows.findIndex(
            (window) => window.key === ruledOutKey,
        );
        this.ruledOut = ruledOut < 0 ? null : ruledOut;
        this.windows = windows;
    }

    /** A page's focus rule on the window at an index: left out, it is
     * unticked whatever its application's tick; let in, it takes its
     * application's tick. */
    rule(index: number, leftOut: boolean): void {
        this.ruledOut = leftOut ? index : null;
        const window = this.windows[index];
        this.ticks[index] =
            !leftOut && window !== undefined && this.seeded(window);
    }

    /** An application's tick ticks all its windows on the monitor arranged
     * on but the one the focus rule leaves out, which only its own tick
     * ticks, and the windows a gathering has left out for now as well.
     * Returns the indices whose tick it set. */
    tickApp(appId: string, ticked: boolean): number[] {
        this.appTicks[appId] = ticked;
        for (const window of this.remembered.values()) {
            if (window.here && window.appId === appId) {
                window.ticked = ticked;
            }
        }
        const set: number[] = [];
        this.windows.forEach((window, index) => {
            if (ticked && index === this.ruledOut) {
                return;
            }
            if (window.here && window.appId === appId) {
                this.ticks[index] = ticked;
                set.push(index);
            }
        });
        return set;
    }

    /** A window's own tick, which ticks its application's when it
     * completes the set. Returns the application and whether all its
     * windows on the monitor arranged on are now ticked, or null for a
     * window with no application or on another monitor. */
    tickWindow(
        index: number,
        ticked: boolean,
    ): { appId: string; allTicked: boolean } | null {
        this.ticks[index] = ticked;
        if (index === this.ruledOut) {
            // A hand on the tick overrides the rule until it runs again.
            this.ruledOut = null;
        }
        const tickedWindow = this.windows[index];
        const appId = tickedWindow?.appId ?? null;
        if (appId === null || tickedWindow?.here !== true) {
            return null;
        }
        const allTicked = this.windows.every(
            (window, other) =>
                window.appId !== appId ||
                !window.here ||
                this.ticks[other] === true ||
                other === this.ruledOut,
        );
        this.appTicks[appId] = allTicked;
        return { appId, allTicked };
    }

    isTicked(index: number): boolean {
        return this.ticks[index] === true;
    }

    isAppTicked(appId: string): boolean {
        return this.appTicks[appId] === true;
    }

    /** A window's tick as its application's has it, which on another
     * monitor is none. */
    private seeded(window: TickedWindow): boolean {
        return window.here && window.appId !== null
            ? (this.appTicks[window.appId] ?? false)
            : false;
    }
}
