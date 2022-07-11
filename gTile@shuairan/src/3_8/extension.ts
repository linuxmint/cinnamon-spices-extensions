/*****************************************************************

             This extension has been developped by
            vibou and forked to cinnamon by shuairan

           With the help of the gnome-shell community

******************************************************************/

import { App } from "../base/app";

/*****************************************************************
                         CONST & VARS
*****************************************************************/
let metadata: any;

let app: App;

/*****************************************************************
                            FUNCTIONS
*****************************************************************/
export const init = (meta: any) => {
  metadata = meta;
  imports.gi.Gtk.IconTheme.get_default().append_search_path(metadata.path + "/../icons");
}

export const enable = () => {
  app = new App();
}

export const disable = () => {
  // Key Bindings
  app.destroy();
}