/**
 * The colours Tiler draws with, read from the theme in use.
 *
 * Every theme states these outright, and states them together, so the text
 * colour is one that genuinely reads on the surface colour and the colour
 * written on a selection is the one the rest of the desktop writes there.
 * That is worth more than it sounds: the same colours as written in
 * Cinnamon's own stylesheets are in places stale or missing, and pairing
 * them can give a window that cannot be read.
 *
 * Outlines are drawn in the text colour, faintly, rather than in the theme's
 * own `borders`. That colour is meant for lines between widgets inside a
 * window, where it sits against the window's own fill; against a wallpaper
 * it is often too close to the surface it is drawn on to be seen at all.
 *
 * There is likewise no colour for a button, since themes draw those through
 * their stylesheets rather than naming them, so an unpicked chip on the
 * strip is drawn to Tiler's own recipe as well.
 */

const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

export interface Colour {
  red: number;
  green: number;
  blue: number;
}

/** The colours the grid is drawn from. */
export interface Palette {
  /** What a window is filled with. */
  surface: Colour;
  /** What is written on a window, and so what shows up against it. */
  text: Colour;
  /** What a window marks a selection with. */
  accent: Colour;
  /** What is written on top of that mark. */
  onAccent: Colour;
}

/**
 * Used only when there is no theme to ask, which should not happen on a
 * running desktop. Neutral rather than an attempt to match anything.
 */
const FALLBACK: Palette = {
  surface: { red: 40, green: 42, blue: 48 },
  text: { red: 235, green: 237, blue: 240 },
  accent: { red: 74, green: 144, blue: 217 },
  onAccent: { red: 255, green: 255, blue: 255 },
};

/** The colours the current theme paints its windows with. */
export function windowColours(): Palette {
  try {
    const context = new Gtk.StyleContext();
    const path = new Gtk.WidgetPath();
    path.append_type(GObject.type_from_name("GtkWindow"));
    context.set_path(path);

    const read = (name: string, fallback: Colour): Colour => {
      const [found, colour] = context.lookup_color(name);
      if (!found) {
        return fallback;
      }

      // Gdk states its colours as fractions rather than bytes.
      return {
        red: Math.round(colour.red * 255),
        green: Math.round(colour.green * 255),
        blue: Math.round(colour.blue * 255),
      };
    };

    return {
      surface: read("theme_bg_color", FALLBACK.surface),
      text: read("theme_fg_color", FALLBACK.text),
      accent: read("theme_selected_bg_color", FALLBACK.accent),
      onAccent: read("theme_selected_fg_color", FALLBACK.onAccent),
    };
  } catch (error) {
    return FALLBACK;
  }
}

/** A colour as St wants it written in a style. */
export function rgba(colour: Colour, alpha: number): string {
  return `rgba(${colour.red}, ${colour.green}, ${colour.blue}, ${alpha})`;
}
