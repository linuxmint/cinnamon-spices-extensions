// The rules that give the chooser's classes the theme's colours, as a
// stylesheet of their own, which theme-sheet.ts loads beside
// stylesheet.css; stylesheet.css holds sizes alone. palette.ts readies the
// colours and this module places them.

import type { Paint, Prepared, Rgba, ThemeColours } from "./palette";
import { css, prepared } from "./palette";

type Rule = [selector: string, declarations: [string, Rgba][]];

/** The rules for the chooser's rows and the marks on them. */
function rowRules(colours: Prepared): Rule[] {
    const onRow: [string, Rgba][] = [
        ["background-color", colours.rowHover.fill],
        ["color", colours.rowHover.text],
    ];
    const armed = ".cplace-preset-row.cplace-preset-armed";
    return [
        [".cplace-preset-row:hover, .cplace-preset-row:focus", onRow],
        [".cplace-preset-delete", [["color", colours.dim]]],
        [".cplace-preset-delete:hover", onRow],
        [`${armed}, ${armed}:hover, ${armed}:focus`, [
            ["background-color", colours.destructive.fill],
            ["color", colours.destructive.text],
        ]],
        [".cplace-end-toggle", [["color", colours.dim]]],
        [".cplace-end-toggle:hover, .cplace-end-toggle:focus", onRow],
        [".cplace-end-toggle:checked", [
            ["background-color", colours.endStrong.fill],
            ["color", colours.text],
        ]],
    ];
}

/** The rules for the chooser's inputs: the spins and the buttons. */
function inputRules(colours: Prepared): Rule[] {
    return [
        [".cplace-spin", [
            ["background-color", colours.entry.fill],
            ["border-color", colours.entry.border],
        ]],
        [".cplace-spin:focus", [["border-color", colours.entryFocus.border]]],
        [".cplace-spin-button, .cplace-step, .cplace-layout-button", [
            ["background-color", colours.button.fill],
            ["border-color", colours.button.border],
            ["color", colours.button.text],
        ]],
        [".cplace-spin-button:hover, .cplace-step:hover, .cplace-layout-button:hover", [
            ["background-color", colours.buttonHover.fill],
            ["color", colours.buttonHover.text],
        ]],
        // After the buttons' own border, which a separator overrides: the
        // theme's faint line, the small screen's edge.
        [".cplace-spin-minus, .cplace-spin-plus", [
            ["border-color", colours.screen.border],
        ]],
        [".cplace-step-active, .cplace-layout-button-active", [
            ["background-color", colours.landing.fill],
            ["border-color", colours.landing.border],
        ]],
    ];
}

/** The rules for what the chooser draws of the screen: the preview, the
 * grid and the handles on them. */
function screenRules(colours: Prepared): Rule[] {
    const asWindow = (paint: Paint): [string, Rgba][] => [
        ["background-color", paint.fill],
        ["border-color", paint.border],
    ];
    return [
        [".cplace-preview-screen", asWindow(colours.screen)],
        [".cplace-preview-slot", asWindow(colours.landing)],
        // The slots sent to the end stand on top of the pile, so they take
        // the stronger fill the theme gives its snap preview, turned, to
        // read over the slots beneath them.
        [".cplace-preview-slot-end", [
            ["background-color", colours.endStrong.fill],
            ["border-color", colours.end.border],
        ]],
        [".cplace-end-mark", [["color", colours.text]]],
        [".cplace-preview-missing", [["border-color", colours.landingEdge]]],
        [".cplace-corner", [["border-color", colours.dim]]],
        [".cplace-corner:hover, .cplace-corner:focus", [
            ["border-color", colours.text],
        ]],
        [".cplace-corner-active", [["border-color", colours.landingEdge]]],
        [".cplace-grid-cell, .cplace-grid-ghost", asWindow(colours.window)],
        [".cplace-grid-cell:hover", [
            ["background-color", colours.cellHover],
        ]],
        [".cplace-grid-cell-selected", asWindow(colours.landing)],
        [".cplace-grid-cell-selected:hover", [
            ["background-color", colours.landingStrong.fill],
        ]],
        [".cplace-grid-cell-head", [["border-color", colours.text]]],
        [".cplace-area-cell", [["border-color", colours.windowEdge]]],
        [".cplace-area-cell:hover", [
            ["background-color", colours.cellHover],
        ]],
        [".cplace-area-outline", [["border-color", colours.landingEdge]]],
    ];
}

/** A short name for a text, the same for the same text: FNV-1a over its
 * characters. */
function fingerprint(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** The stylesheet of the chooser's colours, every one the theme's own or
 * turned from it, and the class that scopes it. The class is named for
 * the colours and the chooser's content wears it: St keeps a computed
 * style for an element and its ancestors' classes, and loading a sheet
 * does not forget it, so colours changed within one theme would otherwise
 * meet the styles St kept for the last ones. */
export function colourSheet(theme: ThemeColours): {
    scope: string;
    rules: string;
} {
    const colours = prepared(theme);
    const rules = [
        ...rowRules(colours),
        ...inputRules(colours),
        ...screenRules(colours),
    ];
    const scope = `cplace-colours-${fingerprint(JSON.stringify(rules))}`;
    const text = rules
        .map(([selector, declarations]) => {
            const scoped = selector
                .split(", ")
                .map((one) => `.${scope} ${one}`)
                .join(", ");
            const body = declarations
                .map(([property, colour]) => `    ${property}: ${css(colour)};`)
                .join("\n");
            return `${scoped} {\n${body}\n}\n`;
        })
        .join("\n");
    return { scope, rules: text };
}
