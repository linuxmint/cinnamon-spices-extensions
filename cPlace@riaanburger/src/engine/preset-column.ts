// The chooser's preset column: one row per saved preset of the page shown,
// its digit and the page's line for it, with an × at its end. Pointing at a
// row, or moving focus onto it, hands the page that preset to draw, the
// pointed row before the focused one, and leaving both hands it nothing. The × or Delete on a focused row arms the row,
// which then asks, and a second press deletes the preset; anything else
// puts the row back as it was. The settings dialogue cannot show presets,
// since it skips the generic type they are stored as, so this column is
// where they are deleted.

import { _, fill } from "../i18n";
import type { ArrangementPage, PresetVariables } from "./page";
import { withoutPreset } from "./presets";
import type { EngineSettings } from "./settings";

const St = imports.gi.St;

/** What the column asks of the shell. */
export interface PresetColumnEvents {
    /** A row was clicked: run its preset, as its digit would. */
    run: (digit: number) => void;
    /** A deleted row took the key focus with it; the dialog needs it back
     * so that its keys keep working. */
    refocus: () => void;
}

interface Row {
    digit: number;
    variables: PresetVariables;
    /** The whole line, the row and its ×, whose hover covers both. */
    line: imports.gi.St.BoxLayout;
    button: imports.gi.St.Button;
}

export class PresetColumn {
    readonly actor: imports.gi.St.BoxLayout;

    private page: ArrangementPage | null = null;
    private rows: Row[] = [];
    private armed: Row | null = null;
    private pointed: Row | null = null;

    constructor(
        private readonly settings: EngineSettings,
        private readonly events: PresetColumnEvents,
    ) {
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: "cplace-column",
        });
    }

    /** A page's presets as rows, built afresh. */
    show(page: ArrangementPage): void {
        this.page = page;
        this.armed = null;
        this.pointed = null;
        this.rows = [];
        this.actor.destroy_all_children();
        const slots = this.settings.presetStore()[page.key] ?? {};
        for (const digit of Object.keys(slots).sort()) {
            const variables = slots[digit];
            if (variables !== undefined) {
                this.rows.push(this.addRow(Number(digit), variables));
            }
        }
        if (this.rows.length === 0) {
            this.actor.add_child(
                new St.Label({
                    text: _("None saved; Ctrl+digit saves one."),
                    style_class: "cplace-hint",
                }),
            );
        }
    }

    /** Delete, pressed with a row focused: arms the row, or deletes its
     * preset when it is armed already. False when no row has the focus. */
    deleteKey(): boolean {
        const focus = global.stage.get_key_focus();
        const row = this.rows.find((candidate) => candidate.button === focus);
        if (row === undefined) {
            return false;
        }
        this.press(row);
        return true;
    }

    /** Whether an actor is one of the rows, which keep Enter as a click. */
    holds(actor: imports.gi.Clutter.Actor | null): boolean {
        return this.rows.some((row) => row.button === actor);
    }

    /** Anything but a deletion puts an armed row back. */
    disarm(): void {
        const row = this.armed;
        if (row !== null) {
            this.armed = null;
            this.label(row);
        }
    }

    /** The key focus on a preset's row, for the development handle. */
    focusRow(digit: number): boolean {
        const row = this.rows.find((candidate) => candidate.digit === digit);
        row?.button.grab_key_focus();
        return row !== undefined;
    }

    /** A preset drawn as if its row were pointed at, or none given zero,
     * for the development handle. */
    pointAt(digit: number): boolean {
        const row = this.rows.find((candidate) => candidate.digit === digit);
        this.pointed = row ?? null;
        this.page?.previewPreset?.(row?.variables ?? null);
        return row !== undefined;
    }

    private addRow(digit: number, variables: PresetVariables): Row {
        const line = new St.BoxLayout({
            vertical: false,
            style_class: "cplace-preset-line",
            reactive: true,
            track_hover: true,
        });
        const button = new St.Button({
            style_class: "cplace-preset-row",
            can_focus: true,
            x_expand: true,
            x_align: St.Align.START,
        });
        const remove = new St.Button({
            style_class: "cplace-preset-delete",
            can_focus: false,
            child: new St.Icon({
                icon_name: "window-close",
                icon_type: St.IconType.SYMBOLIC,
                icon_size: 12,
            }),
        });
        const row: Row = { digit, variables, line, button };
        this.label(row);
        this.listen(row, remove);
        line.add_child(button);
        line.add_child(remove);
        this.actor.add_child(line);
        return row;
    }

    /** A row's clicks, its pointing, and what disarms it: the pointer
     * leaving the whole line, or the focus leaving the row. */
    private listen(row: Row, remove: imports.gi.St.Button): void {
        const { line, button, digit } = row;
        button.connect("clicked", () => {
            // A click on the armed row's own label means no.
            if (this.armed === row) {
                this.disarm();
            } else {
                this.disarm();
                this.events.run(digit);
            }
        });
        remove.connect("clicked", () => {
            this.press(row);
        });
        line.connect("notify::hover", () => {
            this.point();
            if (!line.hover && !button.has_key_focus() && this.armed === row) {
                this.disarm();
            }
        });
        button.connect("key-focus-in", () => {
            this.point();
        });
        button.connect("key-focus-out", () => {
            this.point();
            if (this.armed === row) {
                this.disarm();
            }
        });
    }

    /** The page draws the row under the pointer, else the row with the
     * focus, and what it drew before once neither is: a pointer leaving one
     * row hands the drawing back to the focused one. */
    private point(): void {
        const shown =
            this.rows.find((row) => row.line.hover) ??
            this.rows.find((row) => row.button.has_key_focus()) ??
            null;
        if (shown === this.pointed) {
            return;
        }
        this.pointed = shown;
        this.page?.previewPreset?.(shown?.variables ?? null);
    }

    /** The first press arms a row; the second deletes its preset. */
    private press(row: Row): void {
        if (this.armed !== row) {
            this.disarm();
            this.armed = row;
            this.label(row);
            return;
        }
        const page = this.page;
        if (page === null) {
            return;
        }
        const hadFocus = row.button.has_key_focus();
        this.settings.writePresetStore(
            withoutPreset(this.settings.presetStore(), page.key, row.digit),
        );
        if (this.pointed === row) {
            page.previewPreset?.(null);
        }
        this.show(page);
        if (hadFocus) {
            this.events.refocus();
        }
    }

    private label(row: Row): void {
        const armed = this.armed === row;
        row.button.set_label(
            armed
                ? fill(_("Delete preset {digit}?"), { digit: row.digit })
                : `${row.digit}   ${this.page?.describe(row.variables) ?? ""}`,
        );
        if (armed) {
            row.button.add_style_class_name("cplace-preset-armed");
        } else {
            row.button.remove_style_class_name("cplace-preset-armed");
        }
    }
}
