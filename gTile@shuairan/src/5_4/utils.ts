const Meta = imports.gi.Meta;
const Main = imports.ui.main;

export const reset_window = (metaWindow: imports.gi.Meta.Window | null) => {
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
    // metaWindow?.tile(Meta.TileMode.NONE, false);
}

const _getInvisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
    let outerRect = metaWindow.get_frame_rect();
    let inputRect = metaWindow.get_buffer_rect();
    let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];

    return [borderX, borderY];
}

export const move_maximize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number) => {
    if (metaWindow == null)
        return;

    //TODO: See if this is still needed
    let [borderX, borderY] = _getInvisibleBorderPadding(metaWindow);

    x = x - borderX;
    y = y - borderY;

    metaWindow.move_frame(true, x, y);
    metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
}

export const move_resize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number, width: number, height: number) => {
    if (!metaWindow)
        return;

    // Fix for client-decorated window positioning by @mtwebster
    // See here for more info
    // https://github.com/linuxmint/cinnamon-spices-extensions/commit/fda3a2b0c6adfc79ba65c6bd9a174795223523b9

    // TODO: See if this is still needed
    // let clientRect = metaWindow.get_buffer_rect();
    // let outerRect = metaWindow.get_frame_rect();

    // let client_deco = clientRect.width > outerRect.width &&
    //     clientRect.height > outerRect.height;

    // if (client_deco) {
    //     x -= outerRect.x - clientRect.x;
    //     y -= outerRect.y - clientRect.y;
    //     width += (clientRect.width - outerRect.width);
    //     height += (clientRect.height - outerRect.height);
    // } else {
    //     width -= (outerRect.width - clientRect.width);
    //     height -= (outerRect.height - clientRect.height);
    // }

    metaWindow.move_resize_frame(true, x, y, width, height);
    metaWindow.move_frame(true, x, y); // forces move for windows like terminal that only resize from above command
}

export const get_window_center = (window: imports.gi.Meta.Window): [pos_x: number, pos_y: number] => {
    const pos_x = window.get_frame_rect().width / 2 + window.get_frame_rect().x;
    const pos_y = window.get_frame_rect().height / 2 + window.get_frame_rect().y;

    return [pos_x, pos_y];
}

export const subscribe_to_focused_window_changes = (window: imports.gi.Meta.Window, callback: () => void): number[] => {
    const connections: number[] = [];
    let actor = window.get_compositor_private();
    if (actor) {
        connections.push(
            window.connect(
                'size-changed',
                callback
            )
        );
        connections.push(
            window.connect(
                'position-changed',
                callback
            )
        );
    }

    return connections;
};

export const unsubscribe_from_focused_window_changes = (window: imports.gi.Meta.Window, ...signals: number[]): void => {
    for (const idx of signals) {
        window.disconnect(idx);
    }
};

export const get_tab_list = (): imports.gi.Meta.Window[] => {
    // Main.getTabList has a bug in 5.4+ so we can't rely on it
    // https://github.com/linuxmint/cinnamon/pull/11131
    let screen = global.screen;
    let display = screen.get_display();
    let workspace = screen.get_active_workspace();

    let windows = []; // the array to return

    let allwindows = display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
    let registry: Record<number, boolean> = {}; // to avoid duplicates

    for (let i = 0; i < allwindows.length; ++i) {
        let window = allwindows[i];
        if (Main.isInteresting(window)) {
            let seqno = window.get_stable_sequence();
            if (!registry[seqno]) {
                windows.push(window);
                registry[seqno] = true; // there may be duplicates in the list (rare)
            }
        }
    }
    return windows;
}