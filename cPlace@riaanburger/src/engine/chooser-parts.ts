// The chooser's parts: the widgets the shell is built from, each made here
// and wired by the chooser, which keeps what they do. Cinnamon's own radio
// buttons choose the arrangement, with the compacted marks, each made to
// ask for its label's width as well as its mark's.

import { _ } from "../i18n";
import type { ArrangementPage, PageSizes } from "./page";
import type { PresetColumnEvents } from "./preset-column";
import { PresetColumn } from "./preset-column";
import type { EngineSettings } from "./settings";
import { compactTick, heading } from "./widgets";

const St = imports.gi.St;
const RadioButtons = imports.ui.radioButton;
const NAME = "cPlace";

/** The sizes the stylesheet sets on the content, in pixels: St turns the
 * font-sized lengths into pixels at the desktop's font and scale. */
export function pageSizes(content: imports.gi.St.Widget): PageSizes {
    const node = content.get_theme_node();
    return {
        page: node.get_length("-cplace-page-width"),
        preview: node.get_length("-cplace-preview-width"),
    };
}

/** A page's hint wraps rather than being cut short, and adds no width to a
 * dialog that sizes itself to its content's minimum. */
export function hintLabel(): imports.gi.St.Label {
    const label = new St.Label({ style_class: "cplace-hint" });
    label.clutter_text.line_wrap = true;
    label.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.NONE;
    return label;
}

/** The dialog's title, and its close button at the far end. */
export function shellHeader(onClose: () => void): {
    actor: imports.gi.St.BoxLayout;
    closeButton: imports.gi.St.Button;
} {
    const actor = new St.BoxLayout({ vertical: false });
    // The extension's name, which stays as it is in every language.
    actor.add_child(heading(NAME));
    actor.add_child(new St.Bin({ x_expand: true }));
    const closeButton = new St.Button({
        style_class: "cplace-close-button",
        can_focus: true,
        child: new St.Icon({
            icon_name: "window-close",
            icon_type: St.IconType.SYMBOLIC,
            icon_size: 16,
        }),
    });
    closeButton.connect("clicked", () => {
        onClose();
    });
    actor.add_child(closeButton);
    return { actor, closeButton };
}

/** A radio for each arrangement, named with its letter; choosing one hands
 * its index on. */
export function arrangementChoice(
    pages: ArrangementPage[],
    onChoose: (index: number) => void,
): {
    actor: imports.gi.St.BoxLayout;
    group: imports.ui.radioButton.RadioButtonGroup;
} {
    const actor = new St.BoxLayout({
        vertical: true,
        style_class: "cplace-column",
    });
    actor.add_child(heading(_("Arrangement")));
    const group = new RadioButtons.RadioButtonGroup();
    for (const page of pages) {
        group.addButton(page.key, `${page.name}  (${page.letter})`);
    }
    for (const child of group.actor.get_children()) {
        // The children are the group's own St.Buttons; the list is typed as
        // bare actors.
        (child as imports.gi.St.Widget).add_style_class_name("cplace-radio");
        compactTick(child as imports.gi.St.Button);
        widenToLabel(child as imports.gi.St.Button);
    }
    group.connect("radio-changed", (_group, buttonId) => {
        const index = pages.findIndex((page) => page.key === buttonId);
        if (index >= 0) {
            onChoose(index);
        }
    });
    actor.add_child(group.actor);
    return { actor, group };
}

/** A radio button that asks for room enough to show its label whole.
 * Cinnamon's radio container, in radioButton.js, answers a width request
 * with its mark's width and its spacing alone, leaving out the label, and
 * then gives the label the row's width less the mark and the spacing
 * twice over: its right edge is set at the row's width less the label's
 * left edge. So a column of radios is only as wide as whatever else is in
 * it, and a label longer than what is left is cut off, as the
 * arrangements' were at a scale of 2. The container's own handler runs
 * first, having been connected when it was made, and this one asks for
 * the label's width and the mark and spacing a second time; should
 * Cinnamon mend its allocation, the column keeps a little room over. */
function widenToLabel(button: imports.gi.St.Button): void {
    const container =
        button.get_child() as imports.gi.Cinnamon.GenericContainer | null;
    const label = container?.get_children()[1];
    if (container === null || label === undefined) {
        return;
    }
    container.connect("get-preferred-width", (_owner, _forHeight, alloc) => {
        const [min, natural] = label.get_preferred_width(-1);
        alloc.min_size = 2 * alloc.min_size + (min ?? 0);
        alloc.natural_size = 2 * alloc.natural_size + (natural ?? 0);
    });
}

/** The column of the chosen arrangement's presets. */
export function presetsColumn(
    settings: EngineSettings,
    events: PresetColumnEvents,
): { actor: imports.gi.St.BoxLayout; presets: PresetColumn } {
    const actor = new St.BoxLayout({
        vertical: true,
        style_class: "cplace-column",
    });
    actor.add_child(heading(_("Presets")));
    const presets = new PresetColumn(settings, events);
    actor.add_child(presets.actor);
    return { actor, presets };
}
