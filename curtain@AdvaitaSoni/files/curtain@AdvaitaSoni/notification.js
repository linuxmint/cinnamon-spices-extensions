const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const Expo = imports.ui.expo;
const AppSwitcher3D = imports.ui.appSwitcher.appSwitcher3D;
const Settings = imports.ui.settings;
const SignalManager = imports.misc.signalManager;
const Panel = imports.ui.panel;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const AppletManager = imports.ui.appletManager;
const Lang = imports.lang;
const UPowerGlib = imports.gi.UPowerGlib;
const MessageTray = imports.ui.messageTray;
const Util = imports.misc.util;
const Tooltips = imports.ui.tooltips;
const WindowMenu = imports.ui.windowMenu;
const Cinnamon = imports.gi.Cinnamon;
const DeskletManager = imports.ui.deskletManager;
const { NAME, UUID } = require("./constants")

function sendNotification(intro, msg) {
    let source = new MessageTray.Source(NAME);
    let notification = new MessageTray.Notification(source, _(intro),
        _(msg), { icon: new St.Icon({ icon_name: "curtain", icon_type: St.IconType.FULLCOLOR, icon_size: source.ICON_SIZE }) })
    Main.messageTray.add(source);
    notification.addButton("curtain-settings", _("Settings"));
    notification.connect("action-invoked", (self, id) => {
        if (id === "curtain-settings") {
            Util.spawnCommandLineAsync("xlet-settings extension " + UUID);
        }
    });
    notification.setUrgency(MessageTray.Urgency.CRITICAL);
    source.notify(notification);
}

function toggledExtensionStateNotification(state) {
    sendNotification("Curtain", `Extension ${state == true ? "Enabled" : "Disabled"}!`)
}