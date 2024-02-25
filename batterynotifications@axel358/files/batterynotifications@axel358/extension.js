const Main = imports.ui.main;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;
const MessageTray = imports.ui.messageTray;
const St = imports.gi.St;
const ModalDialog = imports.ui.modalDialog;
const Util = imports.misc.util;

const DBusName = "org.freedesktop.UPower";
const BatteryPath = "/org/freedesktop/UPower/devices/battery_BAT0";
const DeviceInterface =
  '<node> \
  <interface name="org.freedesktop.UPower.Device"> \
    <property name="Percentage" type="d" access="read" /> \
  </interface> \
</node>';
const UPowerPath = "/org/freedesktop/UPower";
const UPowerInterface =
  '<node> \
  <interface name="org.freedesktop.UPower"> \
    <property name="OnBattery" type="b" access="read" /> \
  </interface> \
</node>';

class BatteryNotificationsExtension {
  constructor(uuid) {
    this._uuid = uuid;
    this._source = null;
    this._notification = null;
    this._low_shown = false;
    this._complete_shown = false;
    this.settings = new Settings.ExtensionSettings(this, uuid);
    this.settings.bind(
      "complete-value",
      "complete_value",
      this.on_settings_changed
    );
    this.settings.bind("low-value", "low_value", this.on_settings_changed);

    const DeviceProxy = Gio.DBusProxy.makeProxyWrapper(DeviceInterface);
    this.device_proxy = null;
    const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerInterface);
    this.upower_proxy = null;

    try {
      this.device_proxy = DeviceProxy(Gio.DBus.system, DBusName, BatteryPath);
      this.device_proxy.connect(
        "g-properties-changed",
        Lang.bind(this, this.device_props_changed)
      );
      this.upower_proxy = UPowerProxy(Gio.DBus.system, DBusName, UPowerPath);
      this.upower_proxy.connect(
        "g-properties-changed",
        Lang.bind(this, this.upower_props_changed)
      );
      this.on_battery = this.upower_proxy.OnBattery;
      this.update();
    } catch (e) {
      this._notify("Cinnamon Battery Notifications", e);
      this.disable();
    }
  }

  device_props_changed(proxy, changed_props, invalidated_props) {
    let prop_names = changed_props.deep_unpack();
    if ("Percentage" in prop_names) {
      this.update();
    }
  }

  upower_props_changed() {
    //Listen for power connecting/disconnecting
    this.on_battery = this.upower_proxy.OnBattery;
    //Reset the values and update so that the dialogs get shown again if neccessary
    this._low_shown = !this.on_battery;
    this._complete_shown = this.on_battery;
    this.update();
  }

  on_settings_changed() {}

  enable() {
    //From transparent-panels@germanfr
    if (this.settings.getValue("first-launch")) {
      this.settings.setValue("first-launch", false);
      this._create_notification(
        _("Extension enabled"),
        _("Open extension settings to configure")
      );
      this._notification.addButton(0, _("Extension settings"));
      this._notification.connect("action-invoked", () => this._open_settings());
      this._source.notify(this._notification);
    }
  }

  _open_settings() {
    Util.spawnCommandLine("xlet-settings extension " + this._uuid);
  }

  update() {
    this.percentage = this.device_proxy.Percentage;
    if (this.on_battery) {
      if (this.percentage <= this.low_value && !this._low_shown) {
        this.show_battery_low_dialog();
        this._low_shown = true;
      }
    } else {
      if (this.percentage >= this.complete_value && !this._complete_shown) {
        this.show_charge_complete_dialog();
        this._complete_shown = true;
      }
    }
  }

  disable() {
    this.settings.finalize();
    this.settings = null;
  }

  show_battery_low_dialog() {
    let dialog = new ModalDialog.ModalDialog();
    dialog.contentLayout.add(
      new St.Label({
        text: _("Battery low"),
        style_class: "confirm-dialog-title",
        important: true,
      })
    );
    dialog.contentLayout.add(
      new St.Label({
        text: _(
          `Battery has reached the specified minimum charge value (${this.low_value}%)`
        ),
      })
    );
    dialog.setButtons([
      {
        label: _("Suspend"),
        action: () => {
          dialog.destroy();
          this._suspend();
        },
      },
      {
        label: _("Shutdown"),
        action: () => {
          dialog.destroy();
          this._shutdown();
        },
      },
      {
        label: _("Close"),
        action: () => {
          dialog.destroy();
        },
      },
    ]);
    dialog.open();
  }

  show_charge_complete_dialog() {
    let dialog = new ModalDialog.ModalDialog();
    dialog.contentLayout.add(
      new St.Label({
        text: _("Charge complete"),
        style_class: "confirm-dialog-title",
        important: true,
      })
    );
    dialog.contentLayout.add(
      new St.Label({
        text: _(
          `Battery has reached the specified maximum charge value (${this.complete_value}%)`
        ),
      })
    );
    dialog.setButtons([
      {
        label: _("OK"),
        action: () => {
          dialog.destroy();
        },
      },
    ]);
    dialog.open();
  }

  _ensure_source() {
    if (!this._source) {
      this._source = new MessageTray.Source("Cinnamon Battery Notifications");
      this._source.connect("destroy", () => {
        this._source = null;
      });
      if (Main.messageTray) Main.messageTray.add(this._source);
    }
  }

  _create_notification(title, text) {
    if (this._notification) this._notification.destroy();

    this._ensure_source();

    let icon = new St.Icon({
      icon_name: "battery-notifications",
      icon_type: St.IconType.SYMBOLIC,
      icon_size: this._source.ICON_SIZE,
    });
    this._notification = new MessageTray.Notification(
      this._source,
      title,
      text,
      { icon: icon }
    );
    this._notification.setTransient(true);
    //this._notification.setUrgency(3)
    this._notification.connect("destroy", function () {
      this._notification = null;
    });
  }

  _suspend() {
    Util.spawnCommandLine("systemctl suspend");
  }

  _shutdown() {
    Util.spawnCommandLine("systemctl poweroff");
  }
}

let extension = null;

function init(metadata) {
  extension = new BatteryNotificationsExtension(metadata.uuid);
}

function enable() {
  extension.enable();
}

function disable() {
  extension.disable();
  extension = null;
}
