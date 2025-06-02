// New Window Settings: Setup newly opened windows based on it's application

// Copyright (c) 2025 Kevin Langman

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Settings      = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Meta          = imports.gi.Meta;

let extension;

class NewWindowSettings {

   constructor(metadata) {
      this.meta = metadata;
   }

   enable() {
      this._settings = new Settings.ExtensionSettings(this, this.meta.uuid);
      this._signalManager = new SignalManager.SignalManager(null);

      // Listen to settings changes for existing windows
      let windows = global.display.list_windows(0);
      for (let i=0 ; i < windows.length ; i++ ){
         this._signalManager.connect(windows[i], 'notify::above', this._updateAutoSave, this);
         this._signalManager.connect(windows[i], 'notify::on-all-workspaces', this._updateAutoSave, this);
      }
      // Listen for windows being added/removed
      this._signalManager.connect(global.screen, "window-added", this._windowAdded, this);
      this._signalManager.connect(global.screen, "window-removed", this._windowRemoved, this);
   }

   disable() {
      this._signalManager.disconnectAllSignals();
   }

   // When new windows are opened, see if we need to apply some changes to the windows settings
   _windowAdded(screen, metaWindow, monitor) {
      let wmClass = metaWindow.get_wm_class();
      let windowType = metaWindow.get_window_type();
      let dialog = (windowType === Meta.WindowType.DIALOG || windowType === Meta.WindowType.MODAL_DIALOG);
      if (!dialog) {
         // Look if the window has any auto saved setting that we can apply
         let autoSave = this._settings.getValue("app-auto-save");
         let saved = autoSave.find( (element) => element.wmClass == wmClass );
         if (saved) {
            if (this._settings.getValue("auto-save-on-all-workspaces") && saved.onAllWorkspaces) {
               metaWindow.stick();
            }
            if (this._settings.getValue("auto-save-above") && saved.above) {
               metaWindow.make_above();
            }
         }
      }
      this._signalManager.connect(metaWindow, "notify::above", this._updateAutoSave, this);
      this._signalManager.connect(metaWindow, "notify::on-all-workspaces", this._updateAutoSave, this);
   }

   // When windows are removed, disconnect signals.
   _windowRemoved(screen, metaWindow, monitor) {
      this._signalManager.disconnect("notify::above", metaWindow);
      this._signalManager.disconnect("notify::on-all-workspaces", metaWindow);
      // When closing a window with onAllWorkspaces set, the setting is removed during the close procedure.
      // So here we look to see if the last modified/removed autoSave entry was for the same window that is now closing.
      // If so, restore the entry because it was not the user who removed the onAllWorkspaces setting.
      if (this.lastEntry && this.lastEntry.metaWindow == metaWindow) {
         //log( "Restoring entry" );
         let autoSave = this._settings.getValue("app-auto-save");
         if (this.lastEntry.modified) {
            autoSave[this.lastEntry.idx].onAllWorkspaces = this.lastEntry.onAllWorkspaces;
         } else {
            let wmClass = metaWindow.get_wm_class();
            autoSave.push( {wmClass: wmClass, above: this.lastEntry.above, onAllWorkspaces: this.lastEntry.onAllWorkspaces} );
         }
         this._settings.setValue("app-auto-save", autoSave.slice());
      }
      if (this.lastEntry) {
         delete this.lastEntry;
      }
   }

   // Called when any of the Auto Save setting are changed for a window
   _updateAutoSave(metaWindow) {
      delete this.lastEntry;
      let windowType = metaWindow.get_window_type();
      let wmClass = metaWindow.get_wm_class();
      if (wmClass && wmClass.length > 0 && windowType !== Meta.WindowType.DIALOG && windowType !== Meta.WindowType.MODAL_DIALOG) {
         let autoSave = this._settings.getValue("app-auto-save");
         let idx = autoSave.findIndex( (element) => element.wmClass == wmClass );
         let save = (metaWindow.above || metaWindow.on_all_workspaces);
         if (idx !== -1) {
            if (autoSave[idx].onAllWorkspaces && !metaWindow.on_all_workspaces) {
               this.lastEntry = {above: autoSave[idx].above, onAllWorkspaces: autoSave[idx].onAllWorkspaces, metaWindow: metaWindow, idx: idx, modified: save};
            }
            if (save) {
               //log( `modifying entry for ${wmClass}` );
               autoSave[idx].above = metaWindow.above;
               autoSave[idx].onAllWorkspaces = metaWindow.on_all_workspaces;
            } else {
               //log( `removing entry for ${wmClass}` );
               autoSave.splice(idx,1);
            }
         } else if (save) {
            //log( `adding new entry for ${wmClass}` );
            autoSave.push( {wmClass: wmClass, above: metaWindow.above, onAllWorkspaces: metaWindow.on_all_workspaces} );
         }
         this._settings.setValue("app-auto-save", autoSave.slice());
      }
   }
}

function init(extensionMeta) {
    extension = new NewWindowSettings(extensionMeta);
}

function enable() {
   if (extension) {
      extension.enable();
   }
}

function disable() {
   if (extension) {
      extension.disable();
   }
}
