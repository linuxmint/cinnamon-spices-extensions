// The order the ticked windows cross the contract in, which the contract
// makes both the order an arrangement deals its slots in and the stacking
// order, the last window on top. Titles set it, alphabetically, case and
// accent insensitive, so "Résumé" and "resume" sit together. A page may
// send whole applications to the end, where their windows follow every
// other window in title order among themselves, as the cascade does, or
// have the focused window lead, as Columns does; no page does both. Pure,
// so the order is tested as a table.

/** What the order reads of a window. */
export interface Orderable {
    title: string;
    app: string;
    focused: boolean;
}

/** A page's say in the order. */
export interface OrderRules {
    /** Applications whose windows follow every other window. */
    last: readonly string[];
    /** The focused window leads. */
    focusedFirst: boolean;
}

/** Title order, case and accent insensitive. */
export function compareTitles(left: string, right: string): number {
    return left.localeCompare(right, undefined, { sensitivity: "base" });
}

/** The windows' indices in the order they cross the contract. */
export function ordered(
    windows: readonly Orderable[],
    rules: OrderRules,
): number[] {
    const last = new Set(rules.last);
    const title = (i: number): string => windows[i]?.title ?? "";
    const atEnd = (i: number): boolean => last.has(windows[i]?.app ?? "");
    const byTitle = windows
        .map((_, i) => i)
        .sort((a, b) => compareTitles(title(a), title(b)));
    const order = [
        ...byTitle.filter((i) => !atEnd(i)),
        ...byTitle.filter((i) => atEnd(i)),
    ];
    if (rules.focusedFirst) {
        const lead = order.findIndex((i) => windows[i]?.focused === true);
        if (lead > 0) {
            order.unshift(...order.splice(lead, 1));
        }
    }
    return order;
}
