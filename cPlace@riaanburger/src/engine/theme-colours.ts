// Reading the theme's colours. Cinnamon's St has no accent colour of its
// own, but any actor on the stage reports the colours its theme gives it,
// which is how Cinnamon's own sliders and workspace switcher read theirs.
// So each colour the chooser needs is read off a hidden actor carrying the
// theme's own class for the same job, inside the ancestors the theme's
// rules expect, and the actors are destroyed as soon as they are read.

import type { Paint, Rgba, ThemeColours } from "./palette";

const St = imports.gi.St;

type Probe = {
    make: new (params: { style_class: string }) => imports.gi.St.Widget;
    style: string;
    pseudo?: string | undefined;
};

const bin = (style: string, pseudo?: string): Probe => ({
    make: St.Bin,
    style,
    pseudo,
});

function rgba(colour: imports.gi.Clutter.Color): Rgba {
    return {
        red: colour.red,
        green: colour.green,
        blue: colour.blue,
        alpha: colour.alpha,
    };
}

/** The theme node of the innermost of a chain of hidden actors, handed to
 * read before the chain is destroyed. */
function probed<Found>(
    chain: Probe[],
    read: (node: imports.gi.St.ThemeNode) => Found,
): Found {
    let outer: imports.gi.St.Widget | null = null;
    let inner: imports.gi.St.Widget | null = null;
    for (const link of chain) {
        const actor = new link.make({ style_class: link.style });
        if (link.pseudo !== undefined) {
            actor.add_style_pseudo_class(link.pseudo);
        }
        if (inner === null) {
            outer = actor;
        } else if (inner instanceof St.Bin) {
            inner.set_child(actor);
        } else {
            inner.add_child(actor);
        }
        inner = actor;
    }
    if (outer === null || inner === null) {
        throw new Error("a theme probe needs at least one actor");
    }
    outer.hide();
    imports.ui.main.uiGroup.add_child(outer);
    try {
        return read(inner.get_theme_node());
    } finally {
        outer.destroy();
    }
}

/** The fill, the top border and the text a chain's last actor is drawn
 * with. */
function paintOf(chain: Probe[]): Paint {
    return probed(chain, (node) => ({
        fill: rgba(node.get_background_color()),
        border: rgba(node.get_border_color(St.Side.TOP)),
        text: rgba(node.get_foreground_color()),
    }));
}

/** A window as the workspace switcher draws one, from the custom colours
 * the theme sets for it; a colour the theme leaves out is transparent. */
function graphWindow(state: "active" | "inactive"): Paint {
    const chain = [bin("workspace-graph"), bin("workspace"), bin("windows")];
    return probed(chain, (node) => {
        const custom = (name: string): Rgba => {
            const [found, colour] = node.lookup_color(name, false);
            return found
                ? rgba(colour)
                : { red: 0, green: 0, blue: 0, alpha: 0 };
        };
        return {
            fill: custom(`-${state}-window-background`),
            border: custom(`-${state}-window-border`),
            text: rgba(node.get_foreground_color()),
        };
    });
}

/** The theme's colours for every job the chooser has, read now. */
export function readThemeColours(): ThemeColours {
    const dialogButton = (pseudo?: string): Probe[] => [
        bin("dialog"),
        { make: St.Button, style: "dialog-button", pseudo },
    ];
    const menuItem = (pseudo: string): Probe[] => [
        bin("popup-menu"),
        bin("popup-menu-content"),
        { make: St.BoxLayout, style: "popup-menu-item", pseudo },
    ];
    const entry = (pseudo?: string): Probe[] => [
        { make: St.Entry, style: "run-dialog-entry", pseudo },
    ];
    return {
        text: paintOf([bin("dialog"), bin("dialog-content-box")]).text,
        dim: paintOf(menuItem("insensitive")).text,
        landing: paintOf([bin("tile-preview")]),
        landingStrong: paintOf([bin("tile-preview snap")]),
        screen: paintOf([bin("workspace-graph"), bin("workspace")]),
        window: graphWindow("inactive"),
        activeWindow: graphWindow("active"),
        button: paintOf(dialogButton()),
        buttonHover: paintOf(dialogButton("hover")),
        entry: paintOf(entry()),
        entryFocus: paintOf(entry("focus")),
        rowHover: paintOf(menuItem("active")),
        destructive: paintOf(dialogButton("destructive-action")),
    };
}
