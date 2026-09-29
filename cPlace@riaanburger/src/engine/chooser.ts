// The chooser, a shell: a ModalDialog with the arrangement radios and their
// presets above whatever the selected arrangement's page builds, the page's
// own hint beneath, and Apply, Undo and Cancel. It is built from Cinnamon's
// own parts, so the theme draws it as it draws Cinnamon's dialogs, and it
// knows no window list, no preview and no variable, only the dialog, the
// choice, the presets, Apply, Escape and the key sequences, so that a new
// arrangement brings its own page. Its widgets are made in chooser-parts.ts
// and what its keys mean is decided in chooser-keys.ts; this module wires
// them and does what they ask. It opens on the monitor an arrangement uses,
// the focused window's, and holds it until it closes, so every page arranges
// there. Focus moves the way St moves it. Its sizes
// live in stylesheet.css, and its colours in rules read from the theme each
// time it opens, which colour-rules.ts writes.

import type { WindowTarget } from "../arrangement";
import { _ } from "../i18n";
import type { EnterAction, KeyRoute } from "./chooser-keys";
import { captureEnter, enterAction, keyOf, routeKey } from "./chooser-keys";
import {
    arrangementChoice,
    hintLabel,
    pageSizes,
    presetsColumn,
    shellHeader,
} from "./chooser-parts";
import { canPlace, excessOver, placeOn, roomHere } from "./fitting";
import { arrangementMonitor, holdMonitor } from "./gather";
import type { ArrangementPage, KeyModifiers, PageSizes } from "./page";
import { colourSheet } from "./colour-rules";
import type { PresetColumn } from "./preset-column";
import { withPreset } from "./presets";
import type { EngineSettings } from "./settings";
import { readThemeColours } from "./theme-colours";
import { ThemeSheet } from "./theme-sheet";
import { replaceChild } from "./widgets";

const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const ModalDialog = imports.ui.modalDialog;

/** Clutter's own answer for an event a handler took or left. */
function handled(taken: boolean): boolean {
    return taken ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
}

type MetaWindow = imports.gi.Meta.Window;

/** What the development handle reaches inside the chooser, and no more. */
export interface ChooserInsides {
    /** The visible dialog, null while the chooser is closed. */
    layout: imports.gi.St.Widget | null;
    presets: PresetColumn | null;
    /** What Enter would do with the key focus where it is, null while the
     * chooser is closed. */
    enter: EnterAction | null;
    /** A key as the shell takes it. */
    key(symbol: number, modifiers: KeyModifiers): boolean;
    /** Save the shown page's preset as Ctrl and the digit would. */
    save(digit: number): void;
    /** What Apply would hand on now, without handing it on. */
    plan(): { targets: WindowTarget[]; liveWindows: MetaWindow[] } | null;
}

export class Chooser {
    private dialog: imports.ui.modalDialog.ModalDialog | null = null;
    private radioGroup: imports.ui.radioButton.RadioButtonGroup | null = null;
    private presets: PresetColumn | null = null;
    private contentBin: imports.gi.St.Bin | null = null;
    private hintLabel: imports.gi.St.Label | null = null;
    private closeButton: imports.gi.St.Button | null = null;
    private selected = 0;
    private readonly sheet = new ThemeSheet(() =>
        colourSheet(readThemeColours()),
    );
    private sizes: PageSizes = { page: 0, preview: 0 };
    /** A work area's height the development handle pretends, to show a
     * smaller screen on this one; null for the real one. */
    private pretendHeight: number | null = null;
    /** True once the dialog shows: before that its measure leaves out the
     * button row and its own padding, so a page is fitted only after. */
    private shown = false;
    /** The monitor the chooser opens on and arranges on, while it is
     * open. */
    private monitor = 0;

    constructor(
        private readonly pages: ArrangementPage[],
        private readonly settings: EngineSettings,
        private readonly applyTargets: (
            targets: WindowTarget[],
            liveWindows: MetaWindow[],
        ) => void,
        private readonly undoLast: () => void,
    ) {
        this.sheet.follow();
    }

    isOpen(): boolean {
        return this.dialog !== null;
    }

    toggle(): void {
        if (this.dialog === null) {
            this.open();
        } else {
            this.close();
        }
    }

    /** Opens on the arrangement last chosen, or on the one a key names,
     * which the development handle uses to reach each page, as it may
     * pretend the work area's height. */
    open(key?: string, pretendHeight?: number): void {
        if (this.dialog !== null || this.pages.length === 0) {
            return;
        }
        const named = this.pages.findIndex((page) => page.key === key);
        if (named >= 0) {
            this.selected = named;
        }
        this.pretendHeight = pretendHeight ?? null;
        const dialog = this.built();
        // A dialog can't take the keyboard while a menu or the window
        // switcher holds it, and one that never showed is never destroyed
        // by closing, so it is let go of here instead.
        if (!dialog.open(global.get_current_time())) {
            this.forget();
            dialog.destroy();
            return;
        }
        placeOn(dialog, this.monitor);
        this.shown = true;
        const page = this.page();
        if (page !== undefined) {
            this.fit(page);
        }
        this.listen(dialog.contentLayout);
    }

    /** The dialog in the theme's colours, built whole. The colour rules
     * were written when the extension started or the theme last changed;
     * until they are in the theme the dialog takes its plain colours. */
    private built(): imports.ui.modalDialog.ModalDialog {
        const dialog = new ModalDialog.ModalDialog();
        this.dialog = dialog;
        // The monitor is held before the pages build, since they read its
        // work area. Where the dialog can't be moved, it opens on the
        // pointer's monitor, and the arrangement follows it there.
        this.monitor = canPlace(dialog)
            ? arrangementMonitor()
            : global.display.get_current_monitor();
        holdMonitor(this.monitor);
        const scope = this.sheet.scope();
        if (scope !== null) {
            dialog.contentLayout.add_style_class_name(scope);
        }
        this.buildShell(dialog);
        return dialog;
    }

    /** The shell's keys, routed as each is pressed, and Enter taken on its
     * way down. */
    private listen(content: imports.gi.St.BoxLayout): void {
        content.grab_key_focus();
        content.connect("key-press-event", (_owner, event) => {
            const { symbol, code, modifiers } = keyOf(event);
            return handled(this.key(symbol, modifiers, code));
        });
        content.connect("captured-event", (_owner, event) =>
            handled(captureEnter(event, {
                action: () => this.enterAction(),
                commit: () => content.grab_key_focus(),
                apply: () => this.applySelected(),
            })),
        );
    }

    close(): void {
        const dialog = this.dialog;
        if (dialog === null) {
            return;
        }
        this.forget();
        dialog.close(global.get_current_time());
    }

    /** Closed, with the colour rules taken out of the theme, as disabling
     * the extension leaves it. */
    dispose(): void {
        this.close();
        this.sheet.remove();
    }

    /** The shell lets go of the dialog and of what it built into it, and
     * the page shown of what it built. */
    private forget(): void {
        this.page()?.release();
        holdMonitor(null);
        this.shown = false;
        this.dialog = null;
        this.radioGroup = null;
        this.presets = null;
        this.contentBin = null;
        this.hintLabel = null;
        this.closeButton = null;
    }

    /** The development handle's way in, and no one else's. */
    insides(): ChooserInsides {
        return {
            layout: this.layout(),
            presets: this.presets,
            enter: this.dialog === null ? null : this.enterAction(),
            key: (symbol, modifiers) => this.key(symbol, modifiers),
            save: (digit) => this.savePreset(digit),
            plan: () => this.page()?.apply() ?? null,
        };
    }

    /** The visible dialog: the layout the typing keeps private, which is
     * public at runtime in Cinnamon 6.6 and private, as _dialogLayout, in
     * 5.4. */
    private layout(): imports.gi.St.Widget | null {
        if (this.dialog === null) {
            return null;
        }
        const dialog = this.dialog as unknown as {
            dialogLayout?: imports.gi.St.Widget;
            _dialogLayout?: imports.gi.St.Widget;
        };
        return dialog.dialogLayout ?? dialog._dialogLayout ?? null;
    }

    // ------------------------------------------------------------- shell --

    /** Built once per open. The arrangement last chosen is selected once
     * the whole shell stands, buttons and all, so the page that fills the
     * content fits the dialog as it will open. */
    private buildShell(dialog: imports.ui.modalDialog.ModalDialog): void {
        const content = dialog.contentLayout;
        // Add to the theme's dialog-content-box class, never replace it:
        // its padding is what keeps the content off the button row.
        content.add_style_class_name("cplace-content");
        this.sizes = pageSizes(content);
        const header = shellHeader(() => this.close());
        this.closeButton = header.closeButton;
        content.add_child(header.actor);
        this.contentBin = new St.Bin({ x_align: St.Align.START });
        this.hintLabel = hintLabel();
        content.add_child(this.buildArrangementsRow());
        content.add_child(this.contentBin);
        content.add_child(this.hintLabel);

        dialog.setButtons([
            { label: _("Apply"), action: () => this.applySelected() },
            { label: _("Undo"), action: () => this.undoAndClose() },
            { label: _("Cancel"), action: () => this.close() },
        ]);
        // The shell reopens on the arrangement last chosen, so placing
        // windows in turn does not respell the letter each time; the
        // letters still switch.
        const remembered = this.pages[this.selected] ?? this.pages[0];
        this.radioGroup?.setActive(remembered?.key ?? "");
    }

    /** The choice of arrangement and the chosen one's presets, side by
     * side above the page. */
    private buildArrangementsRow(): imports.gi.St.BoxLayout {
        const row = new St.BoxLayout({
            vertical: false,
            style_class: "cplace-arrangements-row",
        });
        const choice = arrangementChoice(this.pages, (index) =>
            this.select(index),
        );
        this.radioGroup = choice.group;
        row.add_child(choice.actor);
        const column = presetsColumn(this.settings, {
            run: (digit) => this.runPreset(digit),
            refocus: () => this.dialog?.contentLayout.grab_key_focus(),
        });
        this.presets = column.presets;
        row.add_child(column.actor);
        return row;
    }

    /** Selecting an arrangement hands the content to its page, built
     * afresh, then its presets, which the page describes and may draw, and
     * its hint; then the page fits the dialog to the screen. */
    private select(index: number): void {
        const page = this.pages[index];
        if (page === undefined) {
            return;
        }
        this.page()?.release();
        this.selected = index;
        const content = page.build({
            apply: () => this.applySelected(),
            sizes: this.sizes,
        });
        if (this.contentBin !== null) {
            replaceChild(this.contentBin, content);
        }
        this.presets?.show(page);
        this.hintLabel?.set_text(
            `${page.hint()} ${_("U undoes the last one.")}`,
        );
        this.fit(page);
    }

    /** A dialog standing taller than the room has the page give back the
     * difference, once the dialog shows and can be measured whole. */
    private fit(page: ArrangementPage): void {
        const layout = this.layout();
        if (this.shown && layout !== null) {
            page.fit?.(excessOver(layout, this.pretendHeight ?? roomHere()));
        }
    }

    private page(): ArrangementPage | undefined {
        return this.pages[this.selected];
    }

    // ----------------------------------------------------------- actions --

    private applySelected(): void {
        const result = this.page()?.apply() ?? null;
        if (result === null) {
            return;
        }
        this.close();
        this.applyTargets(result.targets, result.liveWindows);
    }

    /** Undo puts back the frames the last apply moved, then leaves. */
    private undoAndClose(): void {
        this.close();
        this.undoLast();
    }

    /** A digit applies at once: the ask happened at Super+Z, and the page
     * was showing what the digit meant before it was pressed. */
    private runPreset(digit: number): void {
        const page = this.page();
        if (page === undefined) {
            return;
        }
        const variables =
            this.settings.presetStore()[page.key]?.[String(digit)];
        if (variables === undefined) {
            return;
        }
        page.restore(variables);
        this.applySelected();
    }

    private savePreset(digit: number): void {
        const page = this.page();
        if (page === undefined) {
            return;
        }
        const store = withPreset(
            this.settings.presetStore(),
            page.key,
            digit,
            page.snapshot(),
        );
        this.settings.writePresetStore(store);
        this.presets?.show(page);
    }

    // -------------------------------------------------------------- keys --

    /** A key by the symbol it types and, for the digits, by its place on
     * the keyboard as well; the development handle sends no place. */
    private key(symbol: number, modifiers: KeyModifiers, code = 0): boolean {
        return routeKey({ symbol, code, modifiers }, this.keyRoute());
    }

    /** The shell's actions, lent to the route a key takes. */
    private keyRoute(): KeyRoute {
        return {
            close: () => this.close(),
            undo: () => this.undoAndClose(),
            runPreset: (digit) => this.runPreset(digit),
            savePreset: (digit) => this.savePreset(digit),
            deletePreset: () => this.presets?.deleteKey() === true,
            disarm: () => this.presets?.disarm(),
            selectLetter: (symbol) => this.selectLetter(symbol),
            page: (symbol, modifiers) =>
                this.page()?.onKey(symbol, modifiers) ?? false,
        };
    }

    /** A page's letter selects its arrangement. */
    private selectLetter(symbol: number): boolean {
        const index = this.pages.findIndex(
            (page) => symbol === page.letter.charCodeAt(0),
        );
        if (index < 0) {
            return false;
        }
        this.radioGroup?.setActive(this.pages[index]?.key ?? "");
        return true;
    }

    /** Enter is left to a preset's row, which runs its preset, and to the
     * close button, which closes. */
    private enterAction(): EnterAction {
        const focus = global.stage.get_key_focus();
        return enterAction(
            focus,
            focus === this.closeButton || this.presets?.holds(focus) === true,
        );
    }
}
