// The line naming the window a page acts on: the application's icon and
// the window's title, as gTile's panel names it, or a plain statement that
// there is none. The line keeps to the page's width, so a long title ends
// in an ellipsis there rather than at a count of characters.

import { _, fill } from "../../i18n";
import { windowAppName } from "../gather";

const Cinnamon = imports.gi.Cinnamon;
const Pango = imports.gi.Pango;
const St = imports.gi.St;

type MetaWindow = imports.gi.Meta.Window;

const ICON_SIZE = 20;

export function windowHeader(
    window: MetaWindow | null,
    width: number,
): imports.gi.St.BoxLayout {
    const row = new St.BoxLayout({
        vertical: false,
        style_class: "cplace-window-header",
    });
    row.set_width(width);
    if (window === null) {
        row.add_child(new St.Label({ text: _("No focused window to place.") }));
        return row;
    }
    const app = Cinnamon.WindowTracker.get_default().get_window_app(window);
    if (app !== null) {
        row.add_child(app.create_icon_texture(ICON_SIZE));
    }
    const appName = windowAppName(window);
    const title = window.get_title();
    const label = new St.Label({
        text:
            appName === null
                ? title
                : fill(_("{title} – {application}"), {
                      title,
                      application: appName,
                  }),
        y_align: imports.gi.Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    row.add_child(label);
    return row;
}
