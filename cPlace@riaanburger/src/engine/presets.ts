// Presets: a numbered grip on an arrangement, holding whatever its page
// snapshots, its variables and its scope, never window ticks, because
// windows are transient and a preset that names them rots. A recording is
// the one preset that names its windows, by application and title, and
// recordings.ts says how it finds them again. The store is one JSON string
// in the settings store, keyed by arrangement, then by digit.

import type { PresetVariables } from "./page";

/** Preset slots per arrangement key, digits "1" to "9". */
export type PresetStore = Record<string, Record<string, PresetVariables>>;

/** The store as its text holds it, keeping only what is shaped as a store:
 * arrangements holding objects, and presets that are objects under the
 * digits 1 to 9. Anything else is dropped rather than left to break the
 * chooser, and text that is not JSON at all reads as an empty store. */
export function parsePresets(json: string): PresetStore {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return {};
    }
    const store: PresetStore = {};
    if (!isRecord(parsed)) {
        return store;
    }
    for (const [arrangementKey, slots] of Object.entries(parsed)) {
        if (!isRecord(slots)) {
            continue;
        }
        const kept: Record<string, PresetVariables> = {};
        for (const [digit, variables] of Object.entries(slots)) {
            if (/^[1-9]$/.test(digit) && isRecord(variables)) {
                kept[digit] = variables;
            }
        }
        store[arrangementKey] = kept;
    }
    return store;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The store with a preset saved into an arrangement's digit, replacing any
 * preset already there. */
export function withPreset(
    store: PresetStore,
    arrangementKey: string,
    digit: number,
    variables: PresetVariables,
): PresetStore {
    const slots = { ...store[arrangementKey], [String(digit)]: variables };
    return { ...store, [arrangementKey]: slots };
}

/** The store without one preset; an arrangement left with none drops out
 * of the store, and a digit with no preset changes nothing. */
export function withoutPreset(
    store: PresetStore,
    arrangementKey: string,
    digit: number,
): PresetStore {
    const slots = { ...store[arrangementKey] };
    delete slots[String(digit)];
    const rest = { ...store };
    delete rest[arrangementKey];
    return Object.keys(slots).length === 0
        ? rest
        : { ...rest, [arrangementKey]: slots };
}
