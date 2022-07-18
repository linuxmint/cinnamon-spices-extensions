const Meta = imports.gi.Meta;

export const reset_window = (metaWindow: imports.gi.Meta.Window | null) => {
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
    metaWindow?.tile(Meta.TileMode.NONE, false);
}

const _getInvisibleBorderPadding = (metaWindow: imports.gi.Meta.Window) => {
    let outerRect = metaWindow.get_outer_rect();
    let inputRect = metaWindow.get_input_rect();
    let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];

    return [borderX, borderY];
}

export const move_maximize_window = (metaWindow: imports.gi.Meta.Window | null, x: number, y: number) => {
    if (metaWindow == null)
        return;

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

    let clientRect = metaWindow.get_rect();
    let outerRect = metaWindow.get_outer_rect();

    let client_deco = clientRect.width > outerRect.width &&
        clientRect.height > outerRect.height;

    if (client_deco) {
        x -= outerRect.x - clientRect.x;
        y -= outerRect.y - clientRect.y;
        width += (clientRect.width - outerRect.width);
        height += (clientRect.height - outerRect.height);
    } else {
        width -= (outerRect.width - clientRect.width);
        height -= (outerRect.height - clientRect.height);
    }

    metaWindow.resize(true, width, height);
    metaWindow.move_frame(true, x, y);
}

export const get_window_center = (window: imports.gi.Meta.Window): [pos_x: number, pos_y: number] => {
    const pos_x = window.get_outer_rect().width / 2 + window.get_outer_rect().x;
    const pos_y = window.get_outer_rect().height / 2 + window.get_outer_rect().y;

    return [pos_x, pos_y];
}

export const subscribe_to_focused_window_changes = (window: imports.gi.Meta.Window, callback: () => void): number[] => {
    const connections: number[] = [];
    let actor = window.get_compositor_private();
    if (actor) {
        connections.push(
            actor.connect(
                'size-changed',
                callback
            )
        );
        connections.push(
            actor.connect(
                'position-changed',
                callback
            )
        );
    }

    return connections;
};

export const unsubscribe_from_focused_window_changes = (window: imports.gi.Meta.Window, ...signals: number[]): void => {
    let actor = window.get_compositor_private();

    for (const idx of signals) {
        actor.disconnect(idx);
    }
};