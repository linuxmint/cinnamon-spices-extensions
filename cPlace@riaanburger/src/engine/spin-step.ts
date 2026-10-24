// Where a press of a spin's plus or minus takes its number: to the next
// multiple of the step in the direction pressed, held to the spin's bounds.
// A number on a multiple moves by the whole step, and one between multiples
// moves to the nearer multiple on the side pressed, so a granularity of 10
// or 100 keeps the number on round figures: 95 goes up to 100, not 105 or
// 110, and 1460 down to 1400. Pure, so the arithmetic is tested without a
// desktop.

/** The number a press takes a spin to: up is +1, down is -1. */
export function nextStep(
    value: number,
    step: number,
    direction: 1 | -1,
    bounds: { min: number; max: number },
): number {
    const size = step > 0 ? step : 1;
    const next =
        direction > 0
            ? Math.floor(value / size) * size + size
            : Math.ceil(value / size) * size - size;
    return Math.min(bounds.max, Math.max(bounds.min, next));
}
