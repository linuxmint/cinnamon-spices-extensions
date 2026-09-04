const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gettext = imports.gettext;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const Settings = imports.ui.settings;

let uuid = null;
let boundSettings = {};
let settingsProvider = null;
let cinnamonSettings = null;
let barriers = [];
let panelsChangedId = null;
let monitorsChangedId = null;
let fullscreenChangedId = null;
let enabled = false;

function _(text) {
    return Gettext.dgettext(uuid, text);
}

// -- panels-enabled (gsettings) helpers -------------------------------------

function _parsePanelsEnabled() {
    // panels-enabled stores Xinerama monitor indices; Panel converts to logical
    return Panel.getPanelsEnabledList().map(s => {
        let [id, monitor, position] = s.split(':');
        return { id, monitor: parseInt(monitor), position, raw: s };
    });
}

function _movePanelToMonitor(panelId, newMonitor) {
    let entries = _parsePanelsEnabled();
    let changed = false;
    let updated = entries.map(e => {
        if (e.id === panelId) {
            changed = true;
            return `${e.id}:${newMonitor}:${e.position}`;
        }
        return e.raw;
    });
    if (changed) Panel.setPanelsEnabledList(updated);
}

function _detectPanel(settingsProvider) {
    let entries = _parsePanelsEnabled();
    let candidates = entries.filter(e => ['top', 'bottom', 'left', 'right'].includes(e.position));

    if (candidates.length === 1) {
        settingsProvider.setValue('panel-id', candidates[0].id);
        Main.notify(_('Panel Follow Mouse'), _('Set panel ID to %s (%s, monitor %d).').format(candidates[0].id, candidates[0].position, candidates[0].monitor));
    } else if (candidates.length === 0) {
        Main.notify(_('Panel Follow Mouse'), _('No panels found.'));
    } else {
        let list = candidates.map(e => `${e.id}: ${e.position}, monitor ${e.monitor}`).join('\n');
        Main.notify(_('Panel Follow Mouse'), _('Multiple panels found -- set panel-id manually:\n%s').format(list));
    }
}

// -- barriers ----------------------------------------------------------------

function _destroyBarrierRecord(rec) {
    if (rec.holdTimeoutId) {
        GLib.source_remove(rec.holdTimeoutId);
        rec.holdTimeoutId = null;
    }
    rec.barrier.disconnect(rec.hitId);
    rec.barrier.disconnect(rec.leftId);
    rec.barrier.destroy();
}

function _clearBarriers() {
    barriers.forEach(_destroyBarrierRecord);
    barriers = [];
}

function _onHoldComplete(rec) {
    _movePanelToMonitor(boundSettings.panelId, rec.monitorIndex);
    _rebuildBarriers();
}

function _seamSegments(rect, index, position, monitors) {
    let segments = [];
    for (let j = 0; j < monitors.length; j++) {
        if (j === index) continue;
        let o = monitors[j];
        let a, b;
        switch (position) {
            case 'top':
                if (o.y + o.height !== rect.y) continue;
                a = Math.max(rect.x, o.x);
                b = Math.min(rect.x + rect.width, o.x + o.width);
                break;
            case 'bottom':
                if (o.y !== rect.y + rect.height) continue;
                a = Math.max(rect.x, o.x);
                b = Math.min(rect.x + rect.width, o.x + o.width);
                break;
            case 'left':
                if (o.x + o.width !== rect.x) continue;
                a = Math.max(rect.y, o.y);
                b = Math.min(rect.y + rect.height, o.y + o.height);
                break;
            case 'right':
                if (o.x !== rect.x + rect.width) continue;
                a = Math.max(rect.y, o.y);
                b = Math.min(rect.y + rect.height, o.y + o.height);
                break;
        }
        if (b > a) segments.push({ a, b, other: j });
    }
    return segments;
}

function _outerSegments(rect, position, seams) {
    let start, end;
    if (position === 'top' || position === 'bottom') {
        start = rect.x;
        end = rect.x + rect.width;
    } else {
        start = rect.y;
        end = rect.y + rect.height;
    }
    let outer = [];
    let cur = start;
    for (let s of seams.slice().sort((p, q) => p.a - q.a)) {
        if (s.a > cur) outer.push({ a: cur, b: s.a });
        cur = Math.max(cur, s.b);
    }
    if (cur < end) outer.push({ a: cur, b: end });
    return outer;
}

function _barrierGeometry(position, rect, a, b) {
    switch (position) {
        case 'top':
            return {
                x1: a, y1: rect.y,
                x2: b, y2: rect.y,
                directions: Meta.BarrierDirection.POSITIVE_Y,
            };
        case 'bottom':
            return {
                x1: a, y1: rect.y + rect.height,
                x2: b, y2: rect.y + rect.height,
                directions: Meta.BarrierDirection.NEGATIVE_Y,
            };
        case 'left':
            return {
                x1: rect.x, y1: a,
                x2: rect.x, y2: b,
                directions: Meta.BarrierDirection.POSITIVE_X,
            };
        case 'right':
            return {
                x1: rect.x + rect.width, y1: a,
                x2: rect.x + rect.width, y2: b,
                directions: Meta.BarrierDirection.NEGATIVE_X,
            };
        default:
            return null;
    }
}

function _addBarrier(monitorIndex, geometry) {
    if (!geometry) return false;

    let barrier;
    try {
        barrier = new Meta.Barrier({
            display: global.display,
            x1: geometry.x1, y1: geometry.y1,
            x2: geometry.x2, y2: geometry.y2,
            directions: geometry.directions,
        });
    } catch (e) {
        global.logError(`panel-follow-mouse: barrier creation failed: ${e.message}`);
        return false;
    }

    let rec = { barrier, monitorIndex, holdTimeoutId: null };

    rec.hitId = barrier.connect('hit', () => {
        if (rec.holdTimeoutId) return;
        rec.holdTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, boundSettings.holdMs, () => {
            rec.holdTimeoutId = null;
            _onHoldComplete(rec);
            return GLib.SOURCE_REMOVE;
        });
    });

    rec.leftId = barrier.connect('left', () => {
        if (rec.holdTimeoutId) {
            GLib.source_remove(rec.holdTimeoutId);
            rec.holdTimeoutId = null;
        }
    });

    barriers.push(rec);
    return true;
}

function _rebuildBarriers() {
    _clearBarriers();
    if (!enabled) return;

    let entries = _parsePanelsEnabled();
    let panelEntry = entries.find(e => e.id === boundSettings.panelId);
    if (!panelEntry) return;
    if (!['top', 'bottom', 'left', 'right'].includes(panelEntry.position)) return;

    let monitors = Main.layoutManager.monitors;
    let failed = 0;
    for (let i = 0; i < monitors.length; i++) {
        if (i === panelEntry.monitor) continue;
        if (global.display.get_monitor_in_fullscreen(i)) continue;
        let seams = _seamSegments(monitors[i], i, panelEntry.position, monitors);
        for (let s of _outerSegments(monitors[i], panelEntry.position, seams)) {
            if (!_addBarrier(i, _barrierGeometry(panelEntry.position, monitors[i], s.a, s.b))) failed++;
        }
    }
    if (failed) Main.notify(_('Panel Follow Mouse'), _("Couldn't create %d barrier(s) — another xlet's barrier may be in the way.").format(failed));
}

// -- extension lifecycle -----------------------------------------------------

function init(metadata) {
    uuid = metadata.uuid;
    Gettext.bindtextdomain(uuid, GLib.get_home_dir() + "/.local/share/locale");
    cinnamonSettings = new Gio.Settings({ schema_id: 'org.cinnamon' });

    settingsProvider = new Settings.ExtensionSettings(boundSettings, uuid);
    settingsProvider.bindProperty(Settings.BindingDirection.IN, "panel-id", "panelId", _rebuildBarriers, null);
    settingsProvider.bindProperty(Settings.BindingDirection.IN, "hold-ms", "holdMs", null, null);
}

function enable() {
    enabled = true;
    panelsChangedId = cinnamonSettings.connect('changed::panels-enabled', _rebuildBarriers);
    monitorsChangedId = Main.layoutManager.connect('monitors-changed', _rebuildBarriers);
    fullscreenChangedId = global.display.connect('in-fullscreen-changed', _rebuildBarriers);
    _rebuildBarriers();

    return { _detectPanel: () => _detectPanel(settingsProvider) };
}

function disable() {
    enabled = false;
    _clearBarriers();
    if (panelsChangedId) {
        cinnamonSettings.disconnect(panelsChangedId);
        panelsChangedId = null;
    }
    if (monitorsChangedId) {
        Main.layoutManager.disconnect(monitorsChangedId);
        monitorsChangedId = null;
    }
    if (fullscreenChangedId) {
        global.display.disconnect(fullscreenChangedId);
        fullscreenChangedId = null;
    }
}
