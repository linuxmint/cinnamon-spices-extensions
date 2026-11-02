// The chooser's colours, every one of them the theme's. theme-colours.ts
// reads them off the theme's own classes each time the chooser opens; this
// module readies them, falling back from one of the theme's colours to
// another where a theme leaves one out, and colour-rules.ts writes them into
// the rules for cPlace's classes. The one colour no theme class carries is
// the second one, for the windows sent to the end, and it is the complement
// of the theme's accent.

/** A colour as St reports it, each channel from 0 to 255. */
export interface Rgba {
    red: number;
    green: number;
    blue: number;
    alpha: number;
}

/** A fill, its border and the text drawn on it. */
export interface Paint {
    fill: Rgba;
    border: Rgba;
    text: Rgba;
}

/** The theme's colours for the chooser's jobs, each read off the theme
 * class that does the same job. */
export interface ThemeColours {
    /** The dialog's own text. */
    text: Rgba;
    /** A menu's dimmed text, `.popup-menu-item:insensitive`. */
    dim: Rgba;
    /** Where a window lands: the snap preview, `.tile-preview`, and its
     * stronger fill, `.tile-preview.snap`. */
    landing: Paint;
    landingStrong: Paint;
    /** The workspace switcher's small screen, `.workspace-graph .workspace`,
     * and the windows it draws inside, inactive and active. */
    screen: Paint;
    window: Paint;
    activeWindow: Paint;
    /** A dialog's button, `.dialog .dialog-button`, and under the pointer. */
    button: Paint;
    buttonHover: Paint;
    /** The Run dialog's entry, `.run-dialog-entry`, and with the focus. */
    entry: Paint;
    entryFocus: Paint;
    /** A menu's highlighted row, `.popup-menu-item:active`. */
    rowHover: Paint;
    /** A dialog's destructive button, `:destructive-action`. */
    destructive: Paint;
}

/** The hue turned half way round the colour wheel, with the lightness,
 * the saturation and the opacity kept. For RGB that is each channel
 * reflected between the largest and the smallest, which leaves both where
 * they were: a grey, with no hue to turn, is its own complement. */
export function complement(colour: Rgba): Rgba {
    const high = Math.max(colour.red, colour.green, colour.blue);
    const low = Math.min(colour.red, colour.green, colour.blue);
    return {
        red: high + low - colour.red,
        green: high + low - colour.green,
        blue: high + low - colour.blue,
        alpha: colour.alpha,
    };
}

/** A colour as CSS writes it, the opacity to four places, which St reads
 * back to the same channel. */
export function css(colour: Rgba): string {
    const alpha = (colour.alpha / 255).toFixed(4);
    return `rgba(${colour.red}, ${colour.green}, ${colour.blue}, ${alpha})`;
}

function invisible(paint: Paint): boolean {
    return paint.fill.alpha === 0 && paint.border.alpha === 0;
}

/** A shape the theme draws in nothing at all, as a theme without the
 * class would, is outlined in the dialog's text instead, so the chooser
 * never draws a slot or a cell that cannot be seen. */
function seen(paint: Paint, text: Rgba): Paint {
    return invisible(paint) ? { ...paint, border: text } : paint;
}

const transparent: Rgba = { red: 0, green: 0, blue: 0, alpha: 0 };

/** The first of these the theme draws at all, the last when it draws
 * none: each fallback is another of the theme's own colours. */
function firstDrawn(...colours: Rgba[]): Rgba {
    return (
        colours.find((colour) => colour.alpha > 0) ??
        colours[colours.length - 1] ??
        transparent
    );
}

function same(left: Rgba, right: Rgba): boolean {
    return css(left) === css(right);
}

/** The colour a drawing made of a border alone takes: the shape's border,
 * or, where the theme draws the shape with a fill and no border, the fill
 * made solid, so an outline never vanishes while its shape shows. */
function edgeOf(paint: Paint): Rgba {
    return paint.border.alpha > 0 || paint.fill.alpha === 0
        ? paint.border
        : { ...paint.fill, alpha: 255 };
}

/** The colours as the rules use them. */
export type Prepared = ThemeColours & {
    end: Paint;
    endStrong: Paint;
    cellHover: Rgba;
    /** The edges of drawings made of a border alone: where a window lands,
     * and a window on the small screen. */
    landingEdge: Rgba;
    windowEdge: Rgba;
};

/** Every shape visible: the slots, the screen and the windows on it. */
function shapes(theme: ThemeColours): Pick<
    ThemeColours,
    "landing" | "landingStrong" | "screen" | "window" | "activeWindow"
> {
    return {
        landing: seen(theme.landing, theme.text),
        landingStrong: seen(theme.landingStrong, theme.text),
        screen: seen(theme.screen, theme.text),
        window: seen(theme.window, theme.text),
        activeWindow: seen(theme.activeWindow, theme.text),
    };
}

/** The controls' colours where a theme leaves one out. A hover a theme
 * draws with a gradient, which St reports as no colour, takes the other
 * hover or the landing's fill; an armed row in a theme with no destructive
 * colour keeps the row's own highlight, its question saying what it asks;
 * the spin's frame falls back to the screen's hairline and its focus to
 * the accent; and a grid cell under the pointer takes the row's highlight
 * where the theme draws its windows alike, active or not. */
function controls(
    theme: ThemeColours,
    drawn: ReturnType<typeof shapes>,
): Omit<
    Prepared,
    | keyof ReturnType<typeof shapes>
    | "end"
    | "endStrong"
    | "landingEdge"
    | "windowEdge"
> {
    const rowFill = firstDrawn(
        theme.rowHover.fill,
        theme.buttonHover.fill,
        drawn.landing.fill,
    );
    const rowHover = { ...theme.rowHover, fill: rowFill };
    return {
        ...theme,
        dim: firstDrawn(theme.dim, theme.text),
        rowHover,
        buttonHover: {
            ...theme.buttonHover,
            fill: firstDrawn(theme.buttonHover.fill, rowFill),
        },
        entry: {
            ...theme.entry,
            border: firstDrawn(theme.entry.border, drawn.screen.border),
        },
        entryFocus: {
            ...theme.entryFocus,
            border: firstDrawn(theme.entryFocus.border, drawn.landing.border),
        },
        destructive:
            theme.destructive.fill.alpha === 0 ? rowHover : theme.destructive,
        cellHover: same(drawn.activeWindow.fill, drawn.window.fill)
            ? rowFill
            : drawn.activeWindow.fill,
    };
}

/** The colours as the rules use them: every shape visible, every control
 * coloured, and the second colour turned from the landing's. */
export function prepared(theme: ThemeColours): Prepared {
    const drawn = shapes(theme);
    const turned = (paint: Paint): Paint => ({
        fill: complement(paint.fill),
        border: complement(paint.border),
        text: paint.text,
    });
    return {
        ...controls(theme, drawn),
        ...drawn,
        end: turned(drawn.landing),
        endStrong: turned(drawn.landingStrong),
        landingEdge: edgeOf(drawn.landing),
        windowEdge: edgeOf(drawn.window),
    };
}
