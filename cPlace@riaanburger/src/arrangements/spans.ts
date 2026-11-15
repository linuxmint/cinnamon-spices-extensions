// Cutting a length into spans at whole pixels, shared by the tilings. Each
// edge falls at the whole pixel nearest the exact cut, so the pieces tile
// the length with no gap and no overlap, each within a pixel of its exact
// share, and the last ends on the far edge. Pure, like every arrangement.

/** A span that is not a positive finite number counts as one, so a bad
 * value narrows nothing to zero and divides nothing by zero. */
function weight(span: number): number {
    return Number.isFinite(span) && span > 0 ? span : 1;
}

/** The edges of the spans laid from start across length, one more edge
 * than there are spans, each span taking its share of the whole. No spans
 * at all count as one. */
export function spanEdges(
    start: number,
    length: number,
    spans: number[],
): number[] {
    const weights = spans.length > 0 ? spans.map(weight) : [1];
    const total = weights.reduce((sum, each) => sum + each, 0);
    const edges = [start];
    let running = 0;
    weights.forEach((each, index) => {
        running += each;
        const last = index === weights.length - 1;
        edges.push(
            last
                ? start + length
                : start + Math.round((length * running) / total),
        );
    });
    return edges;
}

/** Spans of one each, `count` of them. */
export function equalSpans(count: number): number[] {
    return Array.from({ length: Math.max(1, count) }, () => 1);
}

/** Where a run of pieces starts and how long it is, from piece `first` to
 * piece `last` inclusive, both clamped into the pieces the edges make. */
export function piece(
    edges: number[],
    first: number,
    last = first,
): { start: number; size: number } {
    const final = Math.max(0, edges.length - 2);
    const from = clampIndex(Math.min(first, last), final);
    const to = clampIndex(Math.max(first, last), final);
    const start = edges[from] ?? 0;
    return { start, size: (edges[to + 1] ?? start) - start };
}

function clampIndex(index: number, final: number): number {
    return Number.isFinite(index)
        ? Math.min(final, Math.max(0, Math.floor(index)))
        : 0;
}
