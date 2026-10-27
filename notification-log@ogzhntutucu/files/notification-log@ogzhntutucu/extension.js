// Cinnamon keeps notification history only in memory. Every notification, whether it
// came over D-Bus (notificationDaemon.js) or from Cinnamon itself (Main.notify,
// network agent, applets), goes through MessageTray.Source.prototype.notify(), which
// emits the signal MessageTray._onNotify queues it from, before the "display
// notifications" switch or do-not-disturb is checked. _onNotify itself cannot be
// wrapped: MessageTray.add() binds it per source with Lang.bind.
// This extension wraps Source.notify and appends one JSON line per notification to
// ~/.local/state/notifications/YYYY-MM.jsonl. Logging never blocks or breaks the
// original call: writes are async and every step is guarded.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const MessageTray = imports.ui.messageTray;
const Settings = imports.ui.settings;

const LOG_DIR = GLib.build_filenamev([GLib.get_user_state_dir(), 'notifications']);
const URGENCY = ['low', 'normal', 'high', 'critical'];
const PRUNE_INTERVAL = 6 * 60 * 60; // seconds

let settings = null;
let originalNotify = null;
let originalUpdate = null;
let seen = null;
let pending = [];
let writing = false;
let pruneId = 0;

function sourceNames(source) {
    let names = [source.initialTitle, source.title];
    if (source.app) {
        names.push(source.app.get_id().replace(/\.desktop$/, ''));
        names.push(source.app.get_name());
    }
    return names.filter(n => n).map(n => n.toLowerCase());
}

// A rule matches the sender's names, or the body: browser notifications all come from
// the browser, so a site (for example "mail.proton.me") is only visible in the body.
// Returns null, or whether the title is hidden too (messengers put the sender there).
function hiddenRule(notification) {
    let names = sourceNames(notification.source);
    let body = (notification._logBody || '').toLowerCase();
    let apps = settings.getValue('hidden-apps') || [];
    let matched = apps.filter(a => {
        let key = a.enabled && a.app ? a.app.trim().toLowerCase() : '';
        return key && (names.some(n => n.includes(key)) || body.includes(key));
    });
    if (matched.length == 0)
        return null;
    return { hideTitle: matched.some(a => a['hide-title'] !== false) };
}

function makeRecord(notification) {
    let source = notification.source;
    let update = seen.has(notification);
    seen.add(notification);
    let record = {
        time: GLib.DateTime.new_now_local().format_iso8601(),
        source: source.title || null,
        app: source.app ? source.app.get_id() : null,
        // Daemon sources carry the sender's pid; Cinnamon's own sources do not
        pid: source.pid || null,
        internal: !(source.pid || source.initialTitle),
        title: notification.title || '',
        body: notification._logBody || '',
        urgency: URGENCY[notification.urgency] || String(notification.urgency),
        transient: !!notification.isTransient,
        update: update
    };
    let rule = hiddenRule(notification);
    if (rule) {
        record.body = '[hidden]';
        if (rule.hideTitle)
            record.title = '[hidden]';
        record.hidden = true;
    }
    return record;
}

function logFile() {
    let name = GLib.DateTime.new_now_local().format('%Y-%m') + '.jsonl';
    return Gio.File.new_for_path(GLib.build_filenamev([LOG_DIR, name]));
}

function flush() {
    if (writing || pending.length == 0)
        return;
    writing = true;
    let bytes = new GLib.Bytes(new TextEncoder().encode(pending.join('')));
    pending = [];
    let done = (error) => {
        if (error)
            global.logError('notification-log: ' + error);
        writing = false;
        flush();
    };
    logFile().append_to_async(Gio.FileCreateFlags.PRIVATE, GLib.PRIORITY_LOW, null, (file, res) => {
        let stream;
        try {
            stream = file.append_to_finish(res);
        } catch (e) {
            return done(e);
        }
        stream.write_bytes_async(bytes, GLib.PRIORITY_LOW, null, (s, r) => {
            let error = null;
            try {
                s.write_bytes_finish(r);
            } catch (e) {
                error = e;
            }
            s.close_async(GLib.PRIORITY_LOW, null, (s2, r2) => {
                try { s2.close_finish(r2); } catch (e) { error = error || e; }
                done(error);
            });
        });
    });
}

// Monthly files are deleted once the whole month is older than the retention period
function prune() {
    try {
        let days = settings.getValue('retention-days');
        if (!days || days <= 0)
            return GLib.SOURCE_CONTINUE;
        let cutoff = GLib.DateTime.new_now_local().add_days(-days).format('%Y-%m');
        let dir = Gio.File.new_for_path(LOG_DIR);
        let children = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = children.next_file(null)) != null) {
            let m = info.get_name().match(/^(\d{4}-\d{2})\.jsonl$/);
            if (m && m[1] < cutoff)
                dir.get_child(info.get_name()).delete(null);
        }
        children.close(null);
    } catch (e) {
        global.logError('notification-log: prune: ' + e);
    }
    return GLib.SOURCE_CONTINUE;
}

function patchedNotify(notification) {
    try {
        pending.push(JSON.stringify(makeRecord(notification)) + '\n');
        flush();
    } catch (e) {
        global.logError('notification-log: ' + e);
    }
    return originalNotify.apply(this, arguments);
}

// The body only lives inside the label actor after update(), so keep the plain text
function patchedUpdate(title, body, params) {
    try {
        this._logBody = typeof body === 'string' ? body : '';
    } catch (e) {}
    return originalUpdate.apply(this, arguments);
}

function init(metadata) {
    settings = new Settings.ExtensionSettings(this, metadata.uuid);
}

function enable() {
    GLib.mkdir_with_parents(LOG_DIR, 0o700);
    seen = new WeakSet();
    originalUpdate = MessageTray.Notification.prototype.update;
    MessageTray.Notification.prototype.update = patchedUpdate;
    originalNotify = MessageTray.Source.prototype.notify;
    MessageTray.Source.prototype.notify = patchedNotify;
    prune();
    pruneId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, PRUNE_INTERVAL, prune);
}

function disable() {
    if (originalNotify) {
        MessageTray.Source.prototype.notify = originalNotify;
        originalNotify = null;
    }
    if (originalUpdate) {
        MessageTray.Notification.prototype.update = originalUpdate;
        originalUpdate = null;
    }
    if (pruneId) {
        GLib.source_remove(pruneId);
        pruneId = 0;
    }
}
