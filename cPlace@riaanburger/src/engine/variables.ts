// The variables column a list page shows under its preview: a heading, and
// a framed spin per number the page keeps in the settings store, each
// writing through the store as it changes.

import { _ } from "../i18n";
import type { EngineSettings } from "./settings";
import { framedSpin, heading } from "./widgets";

const St = imports.gi.St;

/** One number a page keeps in the settings store, and the bounds and
 * granularities of the framed spin that edits it. */
export interface NumberVariable {
    key: string;
    /** The row's name, or a way to read it for a name that follows another
     * setting, as the cascade's climb says up or down by its corner. */
    name: string | (() => string);
    fallback: number;
    min: number;
    max: number;
    steps: number[];
    /** The value the spin shows for what the store holds, where the page
     * reads a stored value as something else; as stored by default. */
    shown?: ((stored: number) => number) | undefined;
}

/** A variables column, and a way to name its rows again once a setting
 * their names follow has changed. */
export interface VariablesColumn {
    actor: imports.gi.St.BoxLayout;
    rename(): void;
}

function nameOf(number: NumberVariable): string {
    return typeof number.name === "string" ? number.name : number.name();
}

/** A heading and a framed spin per number, each writing through the store
 * and telling the page, which redraws its preview. */
export function variablesColumn(
    store: EngineSettings,
    numbers: NumberVariable[],
    changed: () => void,
): VariablesColumn {
    const column = new St.BoxLayout({
        vertical: true,
        style_class: "cplace-column",
    });
    column.add_child(heading(_("Variables")));
    const labels = numbers.map((number) => {
        const row = variableRow(store, number, changed);
        column.add_child(row.actor);
        return row.label;
    });
    column.connect("notify::mapped", () => {
        if (column.mapped) {
            alignNames(labels);
        }
    });
    return {
        actor: column,
        rename: () => {
            numbers.forEach((number, index) => {
                labels[index]?.set_text(nameOf(number));
            });
            alignNames(labels);
        },
    };
}

/** Every name as wide as the widest, so the spins line up whatever the
 * language makes of the names; a width is only known once styled. */
function alignNames(labels: imports.gi.St.Label[]): void {
    for (const label of labels) {
        label.set_width(-1);
    }
    const widest = Math.max(
        ...labels.map((label) => label.get_preferred_width(-1)[1] ?? 0),
    );
    for (const label of labels) {
        label.set_width(widest);
    }
}

/** One number's row: its name, then its framed spin. */
function variableRow(
    store: EngineSettings,
    number: NumberVariable,
    changed: () => void,
): { actor: imports.gi.St.BoxLayout; label: imports.gi.St.Label } {
    const row = new St.BoxLayout({
        vertical: false,
        style_class: "cplace-variable-row",
    });
    const label = new St.Label({
        text: nameOf(number),
        style_class: "cplace-variable-name",
    });
    row.add_child(label);
    const stored = store.number(number.key, number.fallback);
    row.add_child(
        framedSpin({
            value: number.shown?.(stored) ?? stored,
            min: number.min,
            max: number.max,
            steps: number.steps,
            onChange: (value) => {
                store.write(number.key, value);
                changed();
            },
        }),
    );
    return { actor: row, label };
}
