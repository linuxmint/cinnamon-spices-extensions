const St = imports.gi.St;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Util = imports.misc.util;
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
