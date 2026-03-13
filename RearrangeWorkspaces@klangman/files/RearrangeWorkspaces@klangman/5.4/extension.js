/*
 * extension.js
 * Copyright (C) 2026 Kevin Langman <klangman@gmail.com>
 *
 * Rearrange Workspaces is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Rearrange Workspaces is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const MessageTray = imports.ui.messageTray;
const St = imports.gi.St;
const Gettext = imports.gettext;

const Direction = {
  Left: 0,
  Right: 1
}

const UUID = "RearrangeWorkspaces@klangman";

Gettext.bindtextdomain(UUID, GLib.get_home_dir() + "/.local/share/locale");

function _(text) {
    return Gettext.dgettext(UUID, text);
}

class RearrangeWorkspaces {
   constructor(metaData){
      this.meta = metaData;

      this.source = new MessageTray.Source(this.meta.name);
      Main.messageTray.add(this.source);
   }

   enable() {
      this.settings = new Settings.ExtensionSettings(this, this.meta.uuid);
      this.signalManager = new SignalManager.SignalManager(null);
      this.signalManager.connect(this.settings, "changed::left-key", this.updateHotkeys, this);
      this.signalManager.connect(this.settings, "changed::right-key", this.updateHotkeys, this);
      this.registerHotkeys();
   }

   disable() {
      this.removeHotkeys();
      this.signalManager.disconnectAllSignals();
   }

   updateHotkeys() {
      this.removeHotkeys();
      this.registerHotkeys();
   }

   getHotkeySequence(name) {
      let str = this.settings.getValue(name);
      if (str && str.length>0 && str != "::") {
         return str;
      }
      return null;
   }

   registerHotkeys() {
      this.leftCombo = this.getHotkeySequence("left-key");
      if (this.leftCombo) {
         Main.keybindingManager.addHotKey("rearrangeworkspaces-left", this.leftCombo, Lang.bind(this, function() {this.performHotkey(Direction.Left)} ));
      }
      this.rightCombo = this.getHotkeySequence("right-key");
      if (this.rightCombo) {
         Main.keybindingManager.addHotKey("rearrangeworkspaces-right" , this.rightCombo, Lang.bind(this, function() {this.performHotkey(Direction.Right)} ));
      }
   }

   removeHotkeys() {
      if (this.leftCombo) {
         Main.keybindingManager.removeHotKey("rearrangeworkspaces-left");
         this.leftCombo = null;
      }
      if (this.rightCombo) {
         Main.keybindingManager.removeHotKey("rearrangeworkspaces-right");
         this.rightCombo = null;
      }
   }

   performHotkey(direction) {
      let numWSs = global.workspace_manager.get_n_workspaces();
      if (numWSs <= 1) return;
      let currentWs = global.workspace_manager.get_active_workspace();
      let wsIdx = global.workspace_manager.get_active_workspace_index();
      let wsName;
      let wsName2;
      let msg;

      if (direction === Direction.Left) {
         if (wsIdx === 0) {
            msg = _("Moved workspace to the left\nWorkspace is now at position %s").format(numWSs);
            for( let i = 1 ; i < numWSs ; i++ ) {
               wsName = this.getWorkspaceName(i-1, i);
               wsName2 =  this.getWorkspaceName(i, i-1);
               Main.setWorkspaceName(i-1, wsName2);
               Main.setWorkspaceName(i, wsName);
               global.workspace_manager.reorder_workspace(currentWs, i);
            }
         } else {
            msg = _("Moved workspace to the left\nWorkspace is now at position %s").format(wsIdx);
            wsName = this.getWorkspaceName(wsIdx, wsIdx-1);
            wsName2 = this.getWorkspaceName(wsIdx-1, wsIdx);
            Main.setWorkspaceName( wsIdx-1, wsName);
            Main.setWorkspaceName(wsIdx, wsName2);
            global.workspace_manager.reorder_workspace(currentWs, wsIdx-1);
         }
      } else if (direction === Direction.Right) {
         if (wsIdx === numWSs-1) {
            msg = _("Moved workspace to the right\nWorkspace is now at position %s").format(1);
            for( let i = numWSs-2 ; i >= 0 ; i-- ) {
               wsName = this.getWorkspaceName(i+1, i);
               wsName2 = this.getWorkspaceName(i, i+1);
               Main.setWorkspaceName(i, wsName);
               Main.setWorkspaceName(i+1, wsName2);
               global.workspace_manager.reorder_workspace(currentWs, i);
            }
         } else {
            msg = _("Moved workspace to the right\nWorkspace is now at position %s").format(wsIdx+2);
            wsName = this.getWorkspaceName(wsIdx, wsIdx+1);
            wsName2 = this.getWorkspaceName(wsIdx+1, wsIdx);
            Main.setWorkspaceName( wsIdx+1, wsName);
            Main.setWorkspaceName(wsIdx, wsName2);
            global.workspace_manager.reorder_workspace(currentWs, wsIdx+1);
         }
      }
      // Send a notification about the change
      if (!this.notification || this.notification._destroyed) {
         this.notification = new MessageTray.Notification(this.source, "", "",
            {icon: new St.Icon({icon_name: "RearrangeWorkspaces", icon_type: St.IconType.FULLCOLOR, icon_size: this.source.ICON_SIZE}), silent: true} );
         this.notification.setTransient(true);
      }

      this.notification.update("Rearrange Workspaces", msg,
         {icon: new St.Icon({icon_name: "RearrangeWorkspaces", icon_type: St.IconType.FULLCOLOR, icon_size: this.source.ICON_SIZE}), silent: true} );
      this.source.notify(this.notification);

      return;
   }

   // Get the workspace name at idx, and return that name, unless the name is the default name
   // (i.e. "Workspace 1") in which case return the default name for the newIdx instead.
   getWorkspaceName(idx, newIdx) {
      let wsName = Main.getWorkspaceName(idx);
      let defaultName = Main._makeDefaultWorkspaceName(idx);
      if (wsName == defaultName) {
         return Main._makeDefaultWorkspaceName(newIdx);
      }
      return wsName;
   }
}

let extension = null;
function enable() {
	extension.enable();
}

function disable() {
	extension.disable();
	extension = null;
}

function init(metadata) {
	if(!extension) {
		extension = new RearrangeWorkspaces(metadata);
	}
}