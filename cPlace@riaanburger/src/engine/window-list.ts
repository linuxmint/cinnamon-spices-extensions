// The window list: every application's windows on the workspace, grouped
// and tickable, with the minimised toggle above them, drawn from the choice
// window-choice.ts keeps. Windows on the monitor arranged on are grouped
// under their applications; beneath them, windows on each other monitor are
// listed under the monitor's name, unticked until ticked one by one. A page that arranges a chosen set of windows uses
// it; a page that acts on the focused window need not. Where the page leads
// with the focused window, the list marks it so the reason is on screen,
// and a page may ask for a toggle on each application's row that sends its
// windows to the end, as the cascade does. Built on the shell's CheckBox
// with the compacted marks.

import type {
    AppGroup,
    FocusRules,
    ListScope,
    MonitorGroup,
    TickedWindows,
} from "./window-choice";
import { _, fill } from "../i18n";
import { WindowChoice } from "./window-choice";
import { compactTick, heading } from "./widgets";

const St = imports.gi.St;
const CheckBoxes = imports.ui.checkBox;

type MetaWindow = imports.gi.Meta.Window;
type CheckBox = imports.ui.checkBox.CheckBox;

export class WindowList {
    readonly actor: imports.gi.St.BoxLayout;

    private readonly headingLabel: imports.gi.St.Label;
    private readonly scroll: imports.gi.St.ScrollView;
    private readonly column: imports.gi.St.BoxLayout;
    private readonly choice: WindowChoice;
    private readonly appBoxes = new Map<string, CheckBox>();
    private readonly windowBoxes = new Map<number, CheckBox>();
    /** The height the page fitted the list to, past which it scrolls; null
     * until the page has fitted it. */
    private tallest: number | null = null;

    /** The seeds are the applications that arrive ticked. The focus rules
     * are the page's, none by default, and so is the toggle that sends an
     * application to the end, which the list offers only when asked. */
    constructor(
        seeds: string[],
        private readonly onChange: () => void,
        focus: FocusRules = { focusedFirst: false },
        sendsToEnd = false,
    ) {
        this.choice = new WindowChoice(seeds, focus, sendsToEnd);
        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: "cplace-windows-block",
        });
        this.headingLabel = heading(_("Windows"));
        this.actor.add_child(this.headingLabel);
        this.scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
        });
        this.column = new St.BoxLayout({
            vertical: true,
            style_class: "cplace-column",
        });
        this.scroll.add_actor(this.column);
        this.actor.add_child(this.scroll);
        this.rebuild();
    }

    scope(): ListScope {
        return this.choice.scope();
    }

    setScope(scope: ListScope): void {
        this.choice.setScope(scope);
        this.rebuild();
    }

    ticked(order: "titles" | "stacking" = "titles"): TickedWindows | null {
        return this.choice.ticked(order);
    }

    /** The page's focus rule again, after what it reads has changed, as a
     * columns area does when chosen; the focused window's box follows. */
    refocus(): void {
        const index = this.choice.applyFocusRule();
        if (index !== null) {
            this.windowBoxes
                .get(index)
                ?.setToggleState(this.choice.isTicked(index));
        }
    }

    /** The list stands no taller than this, heading and all, and scrolls
     * past it; a list that fits keeps its own height. The page sets it only
     * when the dialog would stand taller than the screen. */
    fitHeight(height: number): void {
        this.tallest = height;
        this.applyTallest();
    }

    private applyTallest(): void {
        if (this.tallest === null) {
            this.scroll.set_height(-1);
            return;
        }
        const [, headingHeight] = this.headingLabel.get_preferred_height(-1);
        const [, rows] = this.column.get_preferred_height(-1);
        const room = this.tallest - (headingHeight ?? 0);
        this.scroll.set_height((rows ?? 0) > room ? room : -1);
    }

    private rebuild(): void {
        this.column.destroy_all_children();
        this.appBoxes.clear();
        this.windowBoxes.clear();
        this.addMinimisedRow();
        for (const group of this.choice.groups()) {
            this.addGroup(group);
        }
        for (const group of this.choice.elsewhere()) {
            this.addMonitor(group);
        }
        this.applyTallest();
    }

    /** The scope toggle sits above the windows it widens. */
    private addMinimisedRow(): void {
        this.addTickRow(
            _("Include minimised windows"),
            this.choice.minimisedIncluded,
            "",
            (ticked) => {
                this.choice.includeMinimisedWindows(ticked);
                this.rebuild();
                this.onChange();
            },
        );
    }

    /** An application's row, then a row for each of its windows. */
    private addGroup(group: AppGroup): void {
        this.appBoxes.set(
            group.appId,
            this.addAppRow(group.appId, group.name, group.indices.length),
        );
        for (const gatheredIndex of group.indices) {
            const window = this.choice.windowAt(gatheredIndex);
            if (window === undefined) {
                continue;
            }
            const windowBox = this.addTickRow(
                this.rowText(window),
                this.choice.isTicked(gatheredIndex),
                "cplace-indent",
                (ticked) => this.tickWindow(gatheredIndex, ticked),
            );
            this.windowBoxes.set(gatheredIndex, windowBox);
        }
    }

    /** Another monitor's name, counted from one, then a row for each of
     * its windows, named by application and title. */
    private addMonitor(group: MonitorGroup): void {
        this.column.add_child(heading(fill(_("Monitor {number}"), { number: group.monitor + 1 })));
        for (const row of group.rows) {
            const window = this.choice.windowAt(row.index);
            if (window === undefined) {
                continue;
            }
            const windowBox = this.addTickRow(
                fill(_("{application}: {title}"), {
                    application: row.appName,
                    title: window.get_title(),
                }),
                this.choice.isTicked(row.index),
                "cplace-indent",
                (ticked) => this.tickWindow(row.index, ticked),
            );
            this.windowBoxes.set(row.index, windowBox);
        }
    }

    private tickApp(appId: string, ticked: boolean): void {
        for (const gatheredIndex of this.choice.tickApp(appId, ticked)) {
            this.windowBoxes.get(gatheredIndex)?.setToggleState(ticked);
        }
        this.onChange();
    }

    private tickWindow(gatheredIndex: number, ticked: boolean): void {
        const app = this.choice.tickWindow(gatheredIndex, ticked);
        if (app !== null) {
            this.appBoxes.get(app.appId)?.setToggleState(app.allTicked);
        }
        this.onChange();
    }

    /** A window's row: its title, and a mark on the focused window where
     * the page leads with it. */
    private rowText(window: MetaWindow): string {
        const title = window.get_title();
        return this.choice.leadsWith(window)
            ? fill(_("{title}  (focused)"), { title })
            : title;
    }

    /** An application's row: its tick, named with its window count, and,
     * on a page that offers it, the toggle at the row's end that sends the
     * application's windows to the end. */
    private addAppRow(appId: string, name: string, count: number): CheckBox {
        const box = this.tickBox(
            fill(_("{application} ({count})"), { application: name, count }),
            this.choice.isAppTicked(appId),
            (ticked) => this.tickApp(appId, ticked),
        );
        if (!this.choice.sendsToEnd) {
            this.column.add_child(box.actor);
            return box;
        }
        const row = new St.BoxLayout({ vertical: false });
        box.actor.x_expand = true;
        row.add_child(box.actor);
        row.add_child(this.endToggle(appId, name));
        this.column.add_child(row);
        return box;
    }

    /** The toggle that sends an application's windows to the end, lit
     * while it does. */
    private endToggle(appId: string, name: string): imports.gi.St.Button {
        const toggle = new St.Button({
            style_class: "cplace-end-toggle",
            accessible_name: fill(_("Send {application} to the end"), {
                application: name,
            }),
            toggle_mode: true,
            can_focus: true,
            checked: this.choice.isSentToEnd(appId),
            child: new St.Icon({
                icon_name: "go-last",
                icon_type: St.IconType.SYMBOLIC,
                icon_size: 12,
            }),
        });
        toggle.connect("clicked", () => {
            this.choice.sendToEnd(appId, toggle.checked);
            this.onChange();
        });
        return toggle;
    }

    private addTickRow(
        text: string,
        ticked: boolean,
        extraClass: string,
        onToggle: (ticked: boolean) => void,
    ): CheckBox {
        const box = this.tickBox(text, ticked, onToggle);
        if (extraClass === "") {
            this.column.add_child(box.actor);
        } else {
            const wrapper = new St.Bin({
                style_class: extraClass,
                x_align: St.Align.START,
                child: box.actor,
            });
            this.column.add_child(wrapper);
        }
        return box;
    }

    private tickBox(
        text: string,
        ticked: boolean,
        onToggle: (ticked: boolean) => void,
    ): CheckBox {
        const box = new CheckBoxes.CheckBox(text, {}, ticked);
        box.actor.add_style_class_name("cplace-check");
        compactTick(box.actor);
        // A long title ends in an ellipsis at the list's own width, which
        // follows the font, rather than at a count of characters.
        box.getLabelActor().clutter_text.set_ellipsize(
            imports.gi.Pango.EllipsizeMode.END,
        );
        box.actor.connect("clicked", () => {
            onToggle(box.actor.checked);
        });
        return box;
    }
}
