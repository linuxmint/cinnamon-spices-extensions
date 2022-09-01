/*****************************************************************

             This extension has been developped by
            vibou and forked to cinnamon by shuairan

           With the help of the gnome-shell community

******************************************************************/

import { App } from "../base/app";
import { Platform } from "../base/types";
import { get_tab_list, get_window_center, move_maximize_window, move_resize_window, reset_window, subscribe_to_focused_window_changes, unsubscribe_from_focused_window_changes } from "./utils";

/*****************************************************************
                         CONST & VARS
*****************************************************************/
let metadata: any;

let app: App;
const platform: Platform = {
  move_maximize_window: move_maximize_window,
  move_resize_window: move_resize_window,
  reset_window: reset_window,
  get_window_center: get_window_center,
  subscribe_to_focused_window_changes: subscribe_to_focused_window_changes,
  unsubscribe_from_focused_window_changes: unsubscribe_from_focused_window_changes,
  get_tab_list: get_tab_list
}

/*****************************************************************
                            FUNCTIONS
*****************************************************************/
export const init = (meta: any) => {
  metadata = meta;
  imports.gi.Gtk.IconTheme.get_default().append_search_path(metadata.path + "/../icons");
}

export const enable = () => {
  app = new App(platform);
}

export const disable = () => {
  // Key Bindings
  app.destroy();
}