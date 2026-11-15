// Reusable chooser controls: the framed spin, after the spinner in
// Cinnamon's System Settings, with a picker on its right for the step each
// press takes, and the compacted tick marks. Built from St so the desktop
// theme draws them.

import { nextStep } from "./spin-step";

const St = imports.gi.St;

export interface NumberSpec {
    value: number;
    min: number;
    max: number;
    /** The granularities the picker offers; the first is the default. */
    steps: number[];
    onChange: (value: number) => void;
}

/** A section's heading in the chooser. */
export function heading(text: string): imports.gi.St.Label {
    return new St.Label({ text, style_class: "cplace-heading" });
}

/** A bin's child replaced, the old one destroyed: St's set_child only
 * unparents it, which would leave every preview a tick redraws, and its
 * signal handlers, to the garbage collector. */
export function replaceChild(
    bin: imports.gi.St.Bin,
    child: imports.gi.Clutter.Actor,
): void {
    const old = bin.get_child();
    bin.set_child(child);
    if (old !== null && old !== child) {
        old.destroy();
    }
}

/** A typed number held to the spin's bounds. */
function bounded(spec: NumberSpec, value: number): number {
    return Math.min(spec.max, Math.max(spec.min, value));
}

/** The spin's number field. A typed number commits on Enter or on leaving
 * the field; a field left showing its value, or emptied, commits nothing
 * and shows its value again, so tabbing through one never rewrites what
 * the store holds, such as a side stored as 0 for half the work area. */
function numberEntry(
    spec: NumberSpec,
    styleClass: string,
    shown: () => number,
    commit: (value: number) => void,
): imports.gi.St.Entry {
    const entry = new St.Entry({
        text: String(spec.value),
        style_class: styleClass,
    });
    const parseAndCommit = (): void => {
        const text = entry.get_text().trim();
        const typed = parseInt(text, 10);
        // The text is compared, not its number, so a stored 95.5 the field
        // shows as it is does not commit as 95 when the field is left.
        if (Number.isNaN(typed) || text === String(shown())) {
            entry.set_text(String(shown()));
            return;
        }
        commit(bounded(spec, typed));
    };
    entry.clutter_text.connect("activate", parseAndCommit);
    entry.clutter_text.connect("key-focus-out", parseAndCommit);
    return entry;
}

/** A segmented step picker: one small toggle per granularity, exclusive,
 * reporting the active step through step(). Callers hand it whatever
 * granularities suit their value. */
function stepPicker(steps: number[]): {
    actor: imports.gi.St.BoxLayout;
    step: () => number;
} {
    const frame = new St.BoxLayout({
        vertical: false,
        style_class: "cplace-steps",
    });
    let active = steps[0] ?? 1;
    const buttons = steps.map((step) => {
        const button = new St.Button({
            style_class: "cplace-step",
            can_focus: true,
            x_align: St.Align.MIDDLE,
            child: new St.Label({ text: String(step) }),
        });
        button.connect("clicked", () => {
            active = step;
            for (const candidate of buttons) {
                candidate.remove_style_class_name("cplace-step-active");
            }
            button.add_style_class_name("cplace-step-active");
        });
        frame.add_child(button);
        return button;
    });
    buttons[0]?.add_style_class_name("cplace-step-active");
    return { actor: frame, step: () => active };
}

/** The frame wears the theme's focus border while its number field has
 * the key focus, as the theme's own entries do. */
function litOnFocus(
    frame: imports.gi.St.Widget,
    entry: imports.gi.St.Entry,
): void {
    entry.clutter_text.connect("key-focus-in", () => {
        frame.add_style_pseudo_class("focus");
    });
    entry.clutter_text.connect("key-focus-out", () => {
        frame.remove_style_pseudo_class("focus");
    });
}

/** The General page's spinner drawn with St: stepper buttons around a
 * borderless entry inside one frame, the step picker on its right. One
 * granularity is no choice, so it gets no picker. */
export function framedSpin(spec: NumberSpec): imports.gi.St.BoxLayout {
    const row = new St.BoxLayout({
        vertical: false,
        style_class: "cplace-variable-row",
    });
    const frame = new St.BoxLayout({
        vertical: false,
        style_class: "cplace-spin",
    });
    let current = spec.value;
    const apply = (value: number): void => {
        current = value;
        entry.set_text(String(value));
        spec.onChange(value);
    };
    const picker = spec.steps.length > 1 ? stepPicker(spec.steps) : null;
    const step = (): number => picker?.step() ?? spec.steps[0] ?? 1;
    const entry = numberEntry(spec, "cplace-spin-entry", () => current, apply);
    litOnFocus(frame, entry);
    frame.add_child(
        spinButton("list-remove", "cplace-spin-minus", () =>
            apply(nextStep(current, step(), -1, spec)),
        ),
    );
    frame.add_child(entry);
    frame.add_child(
        spinButton("list-add", "cplace-spin-plus", () =>
            apply(nextStep(current, step(), 1, spec)),
        ),
    );
    row.add_child(frame);
    if (picker !== null) {
        row.add_child(picker.actor);
    }
    return row;
}

/** Compact a CheckBox or RadioButton actor and true up its mark. A theme
 * may fix the inner container's height with a top pad, as Mint-Y does at 30
 * and 26 pixels, pin the mark svg at its natural 16 pixels by omitting
 * background-size, and give a radio's label its own top pad and a smaller
 * font while the radio container top-aligns its mark; a same-specificity
 * rule from an extension stylesheet loses to the theme's own, so every
 * correction is set on the actors directly. Mark and container share one
 * height, so a top-aligned mark is a centred one, and that height is the
 * least the container takes, so a list given less room than its rows
 * scrolls rather than squeezing them: St's box layout shrinks its children
 * toward their minimum before it overflows. Every size is in ems, so a row
 * grows with the desktop's font: 1.5em is the 20 pixels a 10-point font
 * gives at 96 dots to the inch, and a larger font would otherwise have its
 * text cut off below. */
export function compactTick(actor: imports.gi.St.Button): void {
    const container = actor.get_child();
    if (container === null) {
        return;
    }
    (container as imports.gi.St.Widget).set_style(
        "min-height: 1.5em; height: 1.5em; padding-top: 0; spacing: 0.6em;",
    );
    const [mark, label] = container.get_children();
    if (mark !== undefined) {
        (mark as imports.gi.St.Widget).set_style(
            "width: 1.5em; height: 1.5em; background-size: contain;",
        );
    }
    if (label !== undefined) {
        // A radio's container hands its label the full row height and the
        // text draws its ink one pixel higher there than in a checkbox's
        // centred label; the measured pixel comes back as padding, plus one
        // more, which seats the round mark level with its text to the eye.
        const radio = actor.has_style_class_name("radiobutton");
        (label as imports.gi.St.Widget).set_style(
            radio
                ? "padding-top: 0.15em; font-size: 1em;"
                : "padding-top: 0; font-size: 1em;",
        );
    }
}

/** Symbolic icons rather than "−" and "+" text: the two glyphs disagree with
 * each other by a pixel vertically in the font's own metrics, so no padding
 * centres both, while the icons are drawn centred by design. */
function spinButton(
    iconName: string,
    sideClass: string,
    onClick: () => void,
): imports.gi.St.Button {
    const button = new St.Button({
        style_class: `cplace-spin-button ${sideClass}`,
        can_focus: true,
        child: new St.Icon({
            icon_name: iconName,
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 12,
        }),
    });
    button.connect("clicked", onClick);
    return button;
}
