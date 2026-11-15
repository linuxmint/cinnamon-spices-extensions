// Local ambient declarations augmenting @ci-types/cjs. Anything the package
// is missing or has wrong is declared here, never patched in node_modules;
// the ui classes it leaves empty are declared in cinnamon-ui.d.ts.
//
// Three calls the package types as never returning null do return it, and
// cPlace checks for it: the window tracker knows no application for a window
// it cannot attribute, such as one kept off the taskbar; the app system
// knows none for an id nothing installed carries; and a bin may hold no
// child. Each is declared again here as nullable, which merges into the
// class ahead of the package's own declaration.

declare namespace imports.gi.Cinnamon {
    interface WindowTracker {
        get_window_app(metawin: imports.gi.Meta.Window): App | null;
    }

    interface AppSystem {
        lookup_app(id: string): App | null;
    }
}

declare namespace imports.gi.St {
    interface Bin {
        get_child(): imports.gi.Clutter.Actor | null;
    }
}

// The plural lookup, which the package leaves out of its gettext.
declare namespace imports.gettext {
    function dngettext(
        domain: string,
        one: string,
        many: string,
        count: number,
    ): string;
}
