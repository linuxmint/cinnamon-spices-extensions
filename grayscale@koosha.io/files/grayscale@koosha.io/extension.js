// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.


// This is a cinnamon applet, which set's entire workspace to grayscale.

const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Main = imports.ui.main;

function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
      global.log("grayscale@koosha.io: v0.1");

      Applet.Applet.prototype._init.call(
        this, orientation, panel_height, instanceId);

      const color_effect = new Clutter.DesaturateEffect();

      const button = new St.Bin({
        style_class: 'panel-button',
        reactive: true,
        can_focus: true,
        x_fill: true,
        y_fill: false,
        track_hover: true
      });

      const extension_icon = new St.Icon({
        icon_name: 'applications-graphics-symbolic',
        style_class: 'system-status-icon'
      });

      button.set_child(extension_icon);
      button.connect('button-press-event', function() {
        const has =Main.uiGroup.has_effects(color_effect);
        global.log("grayscale@koosha.io: call: " + has);
        if (has)
          Main.uiGroup.remove_effect(color_effect);
        else
          Main.uiGroup.add_effect(color_effect);
      });

      this.metadata = metadata;
      this.button = button;
    },

    on_applet_added_to_panel: function () {
      global.log("grayscale@koosha.io: on_applet_added_to_panel()");
      Main.panel._rightBox.insert_child_at_index(this.button, 0);
    },

    on_applet_removed_from_panel: function() {
      global.log("grayscale@koosha.io: on_applet_removed_from_panel()");
      Main.panel._rightBox.remove_child(this.button);
    },
};

function main(metadata, orientation, panel_height, instanceId) {
    return new MyApplet(metadata, orientation, panel_height, instanceId);
}
