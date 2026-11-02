// The choice behind the window list: every application's windows on the
// workspace, which of them are ticked, by application and one by one, what
// the page's focus rule says of the focused window, and which applications
// go to the end. Windows on the monitor arranged on are grouped by
// application; windows on other monitors are kept apart, by monitor, each
// ticked only by its own tick. The list draws it and ordering.ts orders what it hands on.
// The ticked set comes out re-indexed and in alphabetical title order, so
// a preset lays out the same picture each time, and that order is the slot
// order and the stacking order. A page that asks for it gets the focused
// window first, where its tiling begins. A page may also have the focused
// window arrive unticked by a rule of its own, as columns does for one lying
// wholly outside its area.

import type { ArrangementWindow, Rectangle } from "../arrangement";
import type { Gathered } from "./gather";
import {
    focusedWindow,
    gather,
    windowAppId,
    windowAppName,
} from "./gather";
import { compareTitles, ordered } from "./ordering";
import { Ticks } from "./ticks";

type MetaWindow = imports.gi.Meta.Window;

/** What a preset keeps of the list: the ticked applications, the
 * minimised toggle, and on a page that offers it the applications sent to
 * the end, which a preset saved before them leaves as they are. */
export interface ListScope {
    appIds: string[];
    includeMinimised: boolean;
    lastAppIds?: string[] | undefined;
}

/** How a page's list treats the focused window. */
export interface FocusRules {
    /** The focused window, when ticked, leads the ticked set. */
    focusedFirst: boolean;
    /** True when the focused window, standing at this frame, arrives
     * unticked; its application's tick is not changed by it. */
    leavesOut?: ((frame: Rectangle) => boolean) | undefined;
}

/** An application with windows: its id, its name as the tracker gives
 * it, and its windows' gathered indices in title order. */
export interface AppGroup {
    appId: string;
    name: string;
    indices: number[];
}

/** The windows on another monitor: its index, and each window's gathered
 * index and application's name, by application and then title. */
export interface MonitorGroup {
    monitor: number;
    rows: { index: number; appName: string }[];
}

/** The ticked windows as applying hands them on, with which of them were
 * sent to the end. */
export interface TickedWindows {
    workArea: Rectangle;
    workAreas: Rectangle[];
    windows: ArrangementWindow[];
    liveWindows: MetaWindow[];
    atEnd: boolean[];
}

/** Two windows in title order, as the order puts them. */
function byTitle(left: MetaWindow, right: MetaWindow): number {
    return compareTitles(left.get_title(), right.get_title());
}

export class WindowChoice {
    private includeMinimised = false;
    private gathered: Gathered | null = null;
    /** The ticks, by the gathered windows' indices. */
    private readonly ticks: Ticks;
    /** The applications whose windows go to the end. */
    private lastApps = new Set<string>();

    /** The seeds are the applications that arrive ticked; every other
     * application lists unticked, one tick away. */
    constructor(
        seeds: string[],
        private readonly focus: FocusRules,
        readonly sendsToEnd: boolean,
    ) {
        this.ticks = new Ticks(seeds);
        this.regather();
        this.applyFocusRule();
    }

    get minimisedIncluded(): boolean {
        return this.includeMinimised;
    }

    /** The minimised toggle widens or narrows what is gathered. */
    includeMinimisedWindows(included: boolean): void {
        this.includeMinimised = included;
        this.regather();
    }

    scope(): ListScope {
        return {
            appIds: this.ticks.apps(),
            includeMinimised: this.includeMinimised,
            lastAppIds: this.sendsToEnd ? [...this.lastApps] : undefined,
        };
    }

    /** A preset's scope replaces the ticks wholesale, and the marks too
     * when it carries them. */
    setScope(scope: ListScope): void {
        this.includeMinimised = scope.includeMinimised;
        this.ticks.setApps(scope.appIds);
        if (this.sendsToEnd && scope.lastAppIds !== undefined) {
            this.lastApps = new Set(scope.lastAppIds);
        }
        this.regather();
        this.applyFocusRule();
    }

    /** The ticked subset, re-indexed, in the order the page's rules give:
     * exactly what applying hands the arrangement and what a preview draws.
     * In stacking order instead, bottom to top, it is what a recording
     * keeps. */
    ticked(order: "titles" | "stacking" = "titles"): TickedWindows | null {
        if (this.gathered === null) {
            return null;
        }
        const gathered = this.gathered;
        const pairs: { live: MetaWindow; frame: Rectangle }[] = [];
        gathered.liveWindows.forEach((live, i) => {
            const frame = gathered.windows[i]?.frame;
            if (this.ticks.isTicked(i) && frame !== undefined) {
                pairs.push({ live, frame });
            }
        });
        const sequence = order === "titles" ? this.inOrder(pairs) : pairs;
        return {
            workArea: gathered.workArea,
            workAreas: gathered.workAreas,
            windows: sequence.map((pair, i) => ({ id: i, frame: pair.frame })),
            liveWindows: sequence.map((pair) => pair.live),
            atEnd: sequence.map((pair) =>
                this.lastApps.has(windowAppId(pair.live) ?? ""),
            ),
        };
    }

    /** Ticked windows in the order the page's rules give them. */
    private inOrder<Pair extends { live: MetaWindow }>(pairs: Pair[]): Pair[] {
        const focused = this.focus.focusedFirst ? focusedWindow() : null;
        return ordered(
            pairs.map((pair) => ({
                title: pair.live.get_title(),
                app: windowAppId(pair.live) ?? "",
                focused: pair.live === focused,
            })),
            { last: [...this.lastApps], focusedFirst: this.focus.focusedFirst },
        ).flatMap((i) => pairs[i] ?? []);
    }

    /** Every application's windows are gathered; the ticks decide which
     * take part, a window gathered before keeping its own. */
    private regather(): void {
        this.gathered = gather({ includeMinimised: this.includeMinimised });
        const here = this.gathered.here;
        this.ticks.gather(
            this.gathered.liveWindows.map((window, i) => ({
                key: window.get_stable_sequence(),
                appId: windowAppId(window),
                here: here[i] === true,
            })),
        );
    }

    /** The page's focus rule again, after what it reads has changed, as a
     * columns area does when chosen. Returns the focused window's gathered
     * index, whose tick the rule has set, or null when there is no rule or
     * no focused window in the list. */
    applyFocusRule(): number | null {
        const leavesOut = this.focus.leavesOut;
        const gathered = this.gathered;
        const focused = focusedWindow();
        if (leavesOut === undefined || gathered === null || focused === null) {
            return null;
        }
        const index = gathered.liveWindows.indexOf(focused);
        const frame = gathered.windows[index]?.frame;
        if (frame === undefined) {
            return null;
        }
        this.ticks.rule(index, leavesOut(frame));
        return index;
    }

    /** An application's tick, which ticks all its windows but the one the
     * focus rule leaves out. Returns the gathered indices it set. */
    tickApp(appId: string, ticked: boolean): number[] {
        return this.ticks.tickApp(appId, ticked);
    }

    /** A window's own tick, which ticks its application's when it completes
     * the set; null for a window the tracker cannot attribute. */
    tickWindow(
        gatheredIndex: number,
        ticked: boolean,
    ): { appId: string; allTicked: boolean } | null {
        return this.ticks.tickWindow(gatheredIndex, ticked);
    }

    isTicked(gatheredIndex: number): boolean {
        return this.ticks.isTicked(gatheredIndex);
    }

    isAppTicked(appId: string): boolean {
        return this.ticks.isAppTicked(appId);
    }

    isSentToEnd(appId: string): boolean {
        return this.lastApps.has(appId);
    }

    sendToEnd(appId: string, sent: boolean): void {
        if (sent) {
            this.lastApps.add(appId);
        } else {
            this.lastApps.delete(appId);
        }
    }

    windowAt(gatheredIndex: number): MetaWindow | undefined {
        return this.gathered?.liveWindows[gatheredIndex];
    }

    /** True for the focused window on a page that leads with it. */
    leadsWith(window: MetaWindow): boolean {
        return this.focus.focusedFirst && window === focusedWindow();
    }

    /** Every application with a window on the monitor arranged on, named
     * by the tracker and sorted by name, its windows in title order; a
     * window the tracker cannot attribute has no group and stays out of
     * participation. */
    groups(): AppGroup[] {
        const gathered = this.gathered;
        if (gathered === null) {
            return [];
        }
        const byApp = new Map<string, AppGroup>();
        gathered.liveWindows.forEach((window, i) => {
            const appId = windowAppId(window);
            if (appId === null || gathered.here[i] !== true) {
                return;
            }
            const group = byApp.get(appId) ?? {
                appId,
                name: windowAppName(window) ?? appId,
                indices: [],
            };
            group.indices.push(i);
            byApp.set(appId, group);
        });
        const windowOf = (i: number): MetaWindow | undefined =>
            gathered.liveWindows[i];
        return [...byApp.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((group) => ({
                ...group,
                indices: group.indices.sort((a, b) => {
                    const left = windowOf(a);
                    const right = windowOf(b);
                    return left === undefined || right === undefined
                        ? 0
                        : byTitle(left, right);
                }),
            }));
    }

    /** The windows on each other monitor, by monitor, each row by its
     * application's name and then its title; a window the tracker cannot
     * attribute stays out here too. */
    elsewhere(): MonitorGroup[] {
        const gathered = this.gathered;
        if (gathered === null) {
            return [];
        }
        const byMonitor = new Map<number, MonitorGroup["rows"]>();
        gathered.liveWindows.forEach((window, index) => {
            if (gathered.here[index] === true || windowAppId(window) === null) {
                return;
            }
            const monitor = window.get_monitor();
            const rows = byMonitor.get(monitor) ?? [];
            rows.push({ index, appName: windowAppName(window) ?? "" });
            byMonitor.set(monitor, rows);
        });
        const titleOf = (index: number): string =>
            gathered.liveWindows[index]?.get_title() ?? "";
        return [...byMonitor.entries()]
            .sort(([left], [right]) => left - right)
            .map(([monitor, rows]) => ({
                monitor,
                rows: rows.sort(
                    (a, b) =>
                        a.appName.localeCompare(b.appName) ||
                        compareTitles(titleOf(a.index), titleOf(b.index)),
                ),
            }));
    }
}
