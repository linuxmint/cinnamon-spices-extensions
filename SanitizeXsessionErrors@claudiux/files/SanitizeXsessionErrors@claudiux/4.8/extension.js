/*
* SanitizeXsessionErrors@claudiux - Cinnamon desktop extension
* Avoid the flooding of ~/.xsession-errors.
* Copyright (C) 2020  claudiux AKA Claude Clerc
*
* THIS EXTENSION IS DISABLED FROM CINNAMON 4.8 BECAUSE
* THE MESSAGES POLLUTING ~/.xsession-errors WERE REMOVED UPSTREAM.
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

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const {
  Icon,
  IconType,
  Widget,
  ScrollView,
  Align
} = imports.gi.St;
const {
  Urgency,
  MessageTray,
  SystemNotificationSource,
  Notification
} = imports.ui.messageTray; //MessageTray

const messageTray = new MessageTray();
const source = new SystemNotificationSource();
messageTray.add(source);

const UUID = "SanitizeXsessionErrors@claudiux";
const ENABLED_EXTENSIONS_KEY = "enabled-extensions";
const HOME_DIR = GLib.get_home_dir();

Gettext.bindtextdomain(UUID, HOME_DIR + "/.local/share/locale");

function _(str, uuid=UUID) {
  var customTrans = Gettext.dgettext(uuid, str);
  if (customTrans !== str && customTrans !== "") return customTrans;
  return Gettext.gettext(str);
}

function MyExtension(metadata) {
  this._init(metadata);
}

MyExtension.prototype = {

  _init: function (metadata) {
    this.metadata = metadata;
    this.uuid = metadata.uuid
  },

  enable: function() {
    let icon = new Icon();
    icon.set_icon_name("sanitizeXsessionErrors");
    icon.set_icon_type(IconType.SYMBOLIC);
    icon.set_icon_size(24);

    let msg = _("Sanitize ~/.xsession-errors");
    let submsg = _("This extension has been disabled because it was no longer needed since Cinnamon 4.8.");

    let notification = new Notification(source, msg, submsg, { icon: icon, silent: false });
    notification.setTransient(false);
    notification.setUrgency(3);

    source.notify(notification);

    let oldList = global.settings.get_strv(ENABLED_EXTENSIONS_KEY);
    let pos = oldList.indexOf(this.uuid);

    if (pos > 0) {
      let newList = [];
      oldList.splice(pos, 1);
      Array.prototype.push.apply(newList, oldList);
      global.settings.set_strv(ENABLED_EXTENSIONS_KEY, newList);
    }
  },

  disable: function() {
    // Nothing to do
  }
};

let extension = null;

function enable() {
  extension.enable();
  disable();
}

function disable() {
  extension.disable();
  extension = null
}

function init(metadata) {
  if(!extension)
    extension = new MyExtension(metadata);
}
