export type CustomIcons = 
    "animation_black-symbolic" |
    "auto_close_black-symbolic" |
    "auto_tile_0-symbolic" |
    "auto_tile_1-symbolic";

export interface IApp {
    /** Platform-specific implementations */
    platform: Platform;
}

/** Interface to implement platform (version-specific) code using dependency-injection */
export interface Platform {
    reset_window: (metaWindow: imports.gi.Meta.Window | null) => void;
    move_maximize_window: (metaWindow: imports.gi.Meta.Window | null, x: number, y: number) => void;
    move_resize_window: (metaWindow: imports.gi.Meta.Window | null, x: number, y: number, width: number, height: number) => void;
    get_window_center: (metaWindow: imports.gi.Meta.Window) => [pos_x: number, pos_y: number];
    subscribe_to_focused_window_changes: (window: imports.gi.Meta.Window, callback: () => void) => number[]
    unsubscribe_from_focused_window_changes: (window: imports.gi.Meta.Window, ...signals: number[]) => void
    get_tab_list: () => imports.gi.Meta.Window[];
}