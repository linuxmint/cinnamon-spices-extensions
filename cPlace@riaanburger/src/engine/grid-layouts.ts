// The grid's layouts as the settings store keeps them: rows of a name and
// two lines of spans typed as numbers, "1 2 1" for a wide middle column.
// Pure, so the parsing is tested without a desktop. A row that does not
// parse is skipped rather than fatal, so one row mistyped in the settings
// dialogue leaves the others usable, and a store with no good row falls
// back to gTile's own four so the grid always has a layout to show.

/** A layout ready to draw: its label and its spans. */
export interface GridLayout {
    label: string;
    columns: number[];
    rows: number[];
}

/** gTile's cap on the cells a side, kept so a typo cannot draw a hundred
 * slivers; a preset's spans keep it too. */
export const MOST_SPANS = 20;

/** A plain decimal: no signs, exponents or hexadecimal. */
const DECIMAL = /^\d+(\.\d+)?$/;

/** Spans typed as positive numbers between spaces or commas; null for
 * anything else, so one bad number spoils its row rather than being
 * guessed at. */
export function parseSpans(text: unknown): number[] | null {
    if (typeof text !== "string") {
        return null;
    }
    const parts = text.split(/[\s,]+/).filter((part) => part.length > 0);
    if (parts.length === 0 || parts.length > MOST_SPANS) {
        return null;
    }
    if (!parts.every((part) => DECIMAL.test(part))) {
        return null;
    }
    const spans = parts.map(Number);
    return spans.every((span) => span > 0) ? spans : null;
}

/** The name when one is set, else the counts, "3 × 2". A preset stores the
 * label, so the counts, which hold no words, are left untranslated rather
 * than stored in whichever language was running. */
export function layoutLabel(
    name: string,
    columns: number[],
    rows: number[],
): string {
    const trimmed = name.trim();
    return trimmed !== "" ? trimmed : `${columns.length} × ${rows.length}`;
}

/** Every row that parses, in order. */
export function parseLayouts(rows: unknown[]): GridLayout[] {
    const layouts: GridLayout[] = [];
    for (const row of rows) {
        if (typeof row !== "object" || row === null) {
            continue;
        }
        const fields = row as Record<string, unknown>;
        const columns = parseSpans(fields["columns"]);
        const rowSpans = parseSpans(fields["rows"]);
        if (columns === null || rowSpans === null) {
            continue;
        }
        const name = typeof fields["name"] === "string" ? fields["name"] : "";
        layouts.push({
            label: layoutLabel(name, columns, rowSpans),
            columns,
            rows: rowSpans,
        });
    }
    return layouts;
}

/** gTile's four defaults, the schema's own, for a store with none that
 * parse. */
export const fallbackLayouts: GridLayout[] = [
    { label: "2 × 2", columns: [1, 1], rows: [1, 1] },
    { label: "3 × 2", columns: [1, 2, 1], rows: [1, 1] },
    { label: "4 × 4", columns: [1, 1, 1, 1], rows: [1, 1, 1, 1] },
    {
        label: "6 × 6",
        columns: [1, 1, 1, 1, 1, 1],
        rows: [1, 1, 1, 1, 1, 1],
    },
];

/** The settings key the grid's layouts live under, shared by every page
 * that chooses by grid cells. */
export const GRID_LAYOUTS_KEY = "grid-layouts";

/** The layouts that parse, or gTile's four when none does, so a page
 * choosing by cells always has a layout to show. */
export function layoutsOr(rows: unknown[]): GridLayout[] {
    const layouts = parseLayouts(rows);
    return layouts.length > 0 ? layouts : fallbackLayouts;
}

/** Two span lists alike number for number. */
export function sameSpans(left: number[], right: number[]): boolean {
    return (
        left.length === right.length &&
        left.every((span, index) => span === right[index])
    );
}
