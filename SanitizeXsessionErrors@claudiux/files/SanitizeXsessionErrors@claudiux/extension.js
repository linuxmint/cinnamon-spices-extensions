/*
* SanitizeXsessionErrors@claudiux - Cinnamon desktop extension
* Avoid the flooding of ~/.xsession-errors.
* Copyright (C) 2020  claudiux AKA Claude Clerc
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const GLib = imports.gi.GLib;
const Settings = imports.ui.settings;
const Lang = imports.lang;
const Util = imports.misc.util;

const MIN_WORD_LENGTH = 6;
const ENABLED_EXTENSIONS_KEY = "enabled-extensions";
const HOME_DIR = GLib.get_home_dir();
const SCRIPT_DIR = HOME_DIR + "/.local/share/cinnamon/extensions/SanitizeXsessionErrors@claudiux/scripts";

var forbiddenWords = [];

function MyExtension(metadata) {
  this._init(metadata);
}

MyExtension.prototype = {

  _init: function (metadata) {
    this.metadata = metadata;
    this.uuid = metadata.uuid
  },

  enable: function() {
    if (!GLib.log_set_handler) return;

    this.settings = new Settings.ExtensionSettings(this, this.metadata.uuid);
    this.settings.bind('first_launch', 'first_launch', null);
    this.settings.bind('forbidden_words', 'forbidden_words', this.on_settings_updated);

    this.on_settings_updated();

    if (this.first_launch) {
      let oldList = global.settings.get_strv(ENABLED_EXTENSIONS_KEY);
      let pos = oldList.indexOf(this.uuid);
      if (pos > 0) {
        let newList = [this.uuid];
        oldList.splice(pos, 1);
        Array.prototype.push.apply(newList, oldList);
        global.settings.set_strv(ENABLED_EXTENSIONS_KEY, newList);
        this.settings.setValue("first_launch", false)
      }
    }
  },

  _init_handlers: function() {
    // Log handler:
    this.log_handler_ids = [];
    this.log_handler_ids.push(
      GLib.log_set_handler ("GLib", GLib.LogLevelFlags.LEVEL_DEBUG, this.glib_debug_log_handler)
    );

    // Direct all but debug to the default handler:
    this.log_handler_ids.push(
      GLib.log_set_handler( "GLib",
                          ( GLib.LogLevelFlags.LEVEL_MASK | GLib.LogLevelFlags.FLAG_FATAL |
                            GLib.LogLevelFlags.FLAG_RECURSION ) & ~GLib.LogLevelFlags.LEVEL_DEBUG,
                          GLib.log_default_handler
      )
    );
  },

  _remove_handlers: function() {
    if (!this.log_handler_ids) return;

    while (this.log_handler_ids.length > 0)
      GLib.log_remove_handler("GLib", this.log_handler_ids.pop());
  },

  disable: function() {
    if (!GLib.log_set_handler) return;

    this._remove_handlers()
  },

  on_settings_updated: function() {
    forbiddenWords = [];

    for (let element of this.forbidden_words) {
      let word = element["word"].toString();
      let is_forbidden = element["is_forbidden"];

      if (is_forbidden && (word.length >= MIN_WORD_LENGTH)) forbiddenWords.push(word);
    }

    this._remove_handlers();
    this._init_handlers()
  },

  glib_debug_log_handler: function(log_domain, log_level, message, user_data) {
    if (user_data) return;

    for (let forb of forbiddenWords) {
      if (message.startsWith(forb)) return
    }

    // Change level from LEVEL_DEBUG to LEVEL_WARNING to avoid infinite loop.
    GLib.log_default_handler (log_domain, GLib.LogLevelFlags.LEVEL_WARNING, message.trim(), user_data)
  }
};

const Callbacks = {
  on_open_xsession_errors: function() {
    let width = Math.round(global.screen_width / 2).toString();
    let height = global.screen_height.toString();
    let command = "/bin/sh -c '%s/watch-xse.sh %s %s'".format(SCRIPT_DIR, width, height);

    Util.spawnCommandLineAsync(command)
  }
}

let extension = null;

function enable() {
  extension.enable();
  return Callbacks
}

function disable() {
  extension.disable();
  extension = null
}

function init(metadata) {
  if(!extension)
    extension = new MyExtension(metadata);
}
