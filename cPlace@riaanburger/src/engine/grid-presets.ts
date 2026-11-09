// What a grid preset holds, read back from the plain JSON the preset store
// keeps: the layout's label and spans and the chosen cells, never the
// window. Pure, so the preset row's wording is tested without a desktop.

import type { CellSpan } from "../arrangements/grid";
import { layoutLabel, MOST_SPANS } from "./grid-layouts";
import { _, fill, listed } from "../i18n";

type PresetVariables = Record<string, unknown>;

/** Spans as a preset stores them: positive numbers, no more of them than
 * a layout may have, or nothing. */
export function presetSpans(value: unknown): number[] | null {
    if (!Array.isArray(value) || value.length === 0) {
        return null;
    }
    if (value.length > MOST_SPANS) {
        return null;
    }
    return value.every((span) => typeof span === "number" && span > 0)
        ? (value as number[])
        : null;
}

/** The cells a preset stores, or nothing. */
export function presetCells(variables: PresetVariables): CellSpan | null {
    const { left, top, right, bottom } = variables;
    return typeof left === "number" &&
        typeof top === "number" &&
        typeof right === "number" &&
        typeof bottom === "number"
        ? { left, top, right, bottom }
        : null;
}

/** The preset's layout label: its stored name, else its counts. */
export function presetLabel(variables: PresetVariables): string {
    const named = variables["layout"];
    if (typeof named === "string") {
        return named;
    }
    return layoutLabel(
        "",
        presetSpans(variables["columns"]) ?? [],
        presetSpans(variables["rows"]) ?? [],
    );
}

/** One-based, as the grid reads: "2" or "1–3". */
function run(first: number, last: number): string {
    const low = Math.min(first, last) + 1;
    const high = Math.max(first, last) + 1;
    return low === high ? `${low}` : `${low}–${high}`;
}

/** The preset row: the layout first, then the cells in the grid's terms,
 * "3 × 2, cells 1–2 across, 1 down". */
export function describeGridPreset(variables: PresetVariables): string {
    const label = presetLabel(variables);
    const cells = presetCells(variables);
    if (cells === null) {
        return label;
    }
    const one = cells.left === cells.right && cells.top === cells.bottom;
    const where = {
        across: run(cells.left, cells.right),
        down: run(cells.top, cells.bottom),
    };
    return listed(
        label,
        fill(
            one
                ? _("cell {across} across, {down} down")
                : _("cells {across} across, {down} down"),
            where,
        ),
    );
}
