/*
 * ShouldAnimateManager.js
 * Copyright (C) 2024 Kevin Langman <klangman@gmail.com>
 *
 * ShouldAnimateManager is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * ShouldAnimateManager is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>. *
 *
 * The purpose of this module is to coordinate overriding the Main.wm._shouldAnimate()
 * function with more than one extension by "monkey-patching" the function. This class
 * will check if there is an existing override or not, install the override if needed
 * and track handlers.
 *
 * A new entry will need to provide an event to intercept, a handler function and
 * a extension name (uuid). If the event is already being handled by some other extension
 * then the extension name of the current handler will be returned to indicate an error.
 *
 * The handler function can return true or false which will then be returned to the caller
 * of _shouldAnimate(). If the handler would like to allow the original _shouldAnimate()
 * function to run, then the handler should return RUN_ORIGINAL_FUNCTION and the return
 * value from the original function will be returned to the caller.
 *
*/

const Main = imports.ui.main;
const Meta = imports.gi.Meta;

const Events = {
   Minimize:      1,
   Unminimize:    2,
   MapWindow:     4,
   DestroyWindow: 8
}

const RUN_ORIGINAL_FUNCTION = 2

class ShouldAnimateManager {

   constructor(uuid) {
      this._uuid = uuid;
   }

   connect(event, handler) {
      if (Main.wm._shouldAnimateManager) {
         for (let i=0 ; i<Main.wm._shouldAnimateManager.length ; i++) {
            if ((Main.wm._shouldAnimateManager[i].event & event) != 0) {
               return Main.wm._shouldAnimateManager[i].owner;
            }
         }
         log( `Adding new ShouldAnimateManager handler for ${this._uuid} events ${event}` );
         Main.wm._shouldAnimateManager.push( {event: event, handler: handler, owner: this._uuid, override: this.handler} );
      } else {
         log( `Installed ShouldAnimateManager handler for ${this._uuid} events ${event}` );
         Main.wm._shouldAnimateManager = [ {event: event, handler: handler, owner: this._uuid, override: this.handler} ];
         Main.wm._shouldAnimateManager_Original_Function = Main.wm._shouldAnimate;
         Main.wm._shouldAnimate = this.handler;
      }
      return null;
   }

   disconnect(event=null) {
      for (let i=0 ; i<Main.wm._shouldAnimateManager.length ; i++) {
         if (Main.wm._shouldAnimateManager[i].owner == this._uuid && (!event || event == Main.wm._shouldAnimateManager[i].event)) {
            Main.wm._shouldAnimateManager.splice( i, 1 );
            // Setup a new _shouldAnimate override or restore the original if there are no manager entries left.
            if (Main.wm._shouldAnimateManager.length === 0) {
               log( `Removing the last ShouldAnimateManager entry (for ${this._uuid}), reinstalling the original handler function` );
               Main.wm._shouldAnimate = Main.wm._shouldAnimateManager_Original_Function;
               Main.wm._shouldAnimateManager_Original_Function = null;
               Main.wm._shouldAnimateManager = null;
               return;
            } else {
               log( `Removing the ShouldAnimateManager handler for ${this._uuid} and installing the override provided by ${Main.wm._shouldAnimateManager[0].owner}` );
               Main.wm._shouldAnimate = Main.wm._shouldAnimateManager[0].override;
            }
         }
      }
   }

   handler(actor, types) {
      if (actor) {
         const isNormalWindow = actor.meta_window.window_type == Meta.WindowType.NORMAL;
         const isDialogWindow = actor.meta_window.window_type == Meta.WindowType.MODAL_DIALOG || actor.meta_window.window_type == Meta.WindowType.DIALOG;

         if (isNormalWindow || isDialogWindow) {
            let stack = (new Error()).stack;
            let event  = (stack.includes('_minimizeWindow@'  )) ? Events.Minimize      : 0;
            event     += (stack.includes('_unminimizeWindow@')) ? Events.Unminimize    : 0;
            event     += (stack.includes('_mapWindow@'       )) ? Events.MapWindow     : 0;
            event     += (stack.includes('_destroyWindow@'   )) ? Events.DestroyWindow : 0;

            for (let i=0 ; i<Main.wm._shouldAnimateManager.length ; i++) {
               if (event && event === (Main.wm._shouldAnimateManager[i].event & event)) {
                  let ret = Main.wm._shouldAnimateManager[i].handler(actor, types, event);
                  if (ret != RUN_ORIGINAL_FUNCTION) {
                     return ret;
                  }
               }
            }
         }
      }
      return Main.wm._shouldAnimateManager_Original_Function.apply(this, [actor, types]);
   }

}