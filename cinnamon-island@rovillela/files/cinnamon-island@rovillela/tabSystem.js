const { Clutter, St } = imports.gi;
const { _, COLORS, css } = require('./util');

// How many readings fit in the graph (the same number as in the engine).
const HISTORY = 45;

function formatBytes(bytes) {
    let units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return (bytes >= 100 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)) + ' ' + units[i];
}

// The colour shows the level: green up to 60%, yellow up to 85% and rose above
// that.
function levelColor(fraction) {
    return fraction >= 0.85 ? COLORS.rose : fraction >= 0.6 ? COLORS.amber : COLORS.green;
}

function formatMinutes(minutes) {
    let hours = Math.floor(minutes / 60);
    let rest = String(minutes % 60).padStart(2, '0');
    return hours > 0 ? hours + ' h ' + rest : minutes + ' min';
}

// A card with a title, a large value, a detail line and, below, a drawing:
// 'bar' is a 0 to 100% bar and 'graph' is the graph of the latest readings.
class Gauge {
    constructor(title, kind) {
        this.actor = new St.BoxLayout({ style_class: 'island-gauge', vertical: true, x_expand: true });
        this.actor.add_child(new St.Label({ style_class: 'island-gauge-title', text: title }));
        this._value = new St.Label({ style_class: 'island-gauge-value' });
        this.actor.add_child(this._value);
        this._detail = new St.Label({ style_class: 'island-time' });
        this.actor.add_child(this._detail);
        this._kind = kind;
        this._fraction = 0;
        this._history = [];
        this._key = '';
        if (kind) {
            this._area = new St.DrawingArea({
                style_class: kind === 'graph' ? 'island-gauge-graph' : 'island-gauge-bar',
                x_expand: true,
            });
            this._area.connect('repaint', area => kind === 'graph' ? this._drawGraph(area) : this._drawBar(area));
            this.actor.add_child(this._area);
        }
    }

    // `history` holds the past readings (graph only) and `top` is the value
    // that takes the full height; without `top`, the graph scales to the
    // highest value.
    set(value, detail, fraction, history = null, top = null) {
        this._value.text = value;
        this._detail.text = detail || '';
        if (!this._area)
            return;
        let key = fraction + '|' + (history ? history.join(',') : '');
        if (key === this._key)
            return;
        this._key = key;
        this._fraction = fraction;
        this._history = history || [];
        this._top = top;
        this._area.queue_repaint();
    }

    _drawBar(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let thickness = 4;
        let y = Math.round((height - thickness) / 2);
        let r = thickness / 2;
        let bar = (w, red, green, blue, alpha) => {
            if (w < thickness)
                return;
            cr.setSourceRGBA(red, green, blue, alpha);
            cr.newSubPath();
            cr.arc(r, y + r, r, Math.PI / 2, Math.PI * 1.5);
            cr.arc(w - r, y + r, r, Math.PI * 1.5, Math.PI / 2);
            cr.closePath();
            cr.fill();
        };
        bar(width, 1, 1, 1, 0.2);
        let f = Math.max(0, Math.min(1, this._fraction));
        let color = levelColor(f);
        bar(width * f, color[0] / 255, color[1] / 255, color[2] / 255, 1);
        cr.$dispose();
    }

    // The graph moves left to right; the newest reading sits against the right
    // edge, even while the history is still short.
    _drawGraph(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let values = this._history;
        let slots = Math.max(HISTORY - 1, 1);
        let top = this._top || Math.max(1, ...values);
        // Without `top` the line is neutral (network); with it, it takes the
        // colour of the level.
        let color = this._top ? levelColor(Math.max(0, Math.min(1, this._fraction))) : [255, 255, 255];
        let [red, green, blue] = color.map(c => c / 255);

        cr.setSourceRGBA(1, 1, 1, 0.12);
        cr.rectangle(0, height - 1, width, 1);
        cr.fill();
        if (values.length > 1) {
            let step = width / slots;
            let x0 = width - (values.length - 1) * step;
            let point = i => [x0 + i * step, 1 + (height - 3) * (1 - Math.min(1, values[i] / top))];
            cr.moveTo(...point(0));
            for (let i = 1; i < values.length; i++)
                cr.lineTo(...point(i));
            cr.setSourceRGBA(red, green, blue, this._top ? 1 : 0.75);
            cr.setLineWidth(1.5);
            cr.strokePreserve();
            cr.lineTo(width, height - 1);
            cr.lineTo(x0, height - 1);
            cr.closePath();
            cr.setSourceRGBA(red, green, blue, 0.16);
            cr.fill();
        }
        cr.$dispose();
    }
}

// Disk size as printed on the box: in powers of 1000 and without decimals.
function formatDiskSize(bytes) {
    let gb = bytes / 1e9;
    return gb >= 950 ? Math.round(gb / 100) / 10 + ' TB' : Math.round(gb) + ' GB';
}

// The disks card: one row per physical disk, with kind and size, free space
// and a bar. For a disk with no mounted partition the system does not know the
// used space, so the row only says it is not mounted.
class DiskCard {
    constructor() {
        this.actor = new St.BoxLayout({ style_class: 'island-gauge island-disks', vertical: true, x_expand: true });
        this._key = '';
    }

    set(disks) {
        let key = JSON.stringify(disks);
        if (key === this._key)
            return;
        this._key = key;
        this.actor.destroy_all_children();
        this.actor.add_child(new St.Label({ style_class: 'island-gauge-title', text: _("Disk") }));
        for (let disk of disks) {
            let kind = disk.kind === 'hdd' ? _("HDD") : disk.kind === 'usb' ? _("USB") : _("SSD");
            // The name on one line and the free space on the next: side by
            // side they do not fit the width of the card.
            this.actor.add_child(new St.Label({
                style_class: 'island-disk-name',
                text: kind + ' ' + formatDiskSize(disk.size),
            }));
            this.actor.add_child(new St.Label({
                style_class: 'island-disk-free',
                text: disk.mounted ? _("%s free").replace('%s', formatBytes(disk.free)) : _("not mounted"),
            }));

            let fraction = disk.mounted && disk.total ? disk.used / disk.total : 0;
            let bar = new St.Widget({ style_class: 'island-disk-track', x_expand: true, layout_manager: new Clutter.BinLayout() });
            if (disk.mounted) {
                let fill = new St.Widget({
                    style_class: 'island-disk-level',
                    style: 'background-color: ' + css(levelColor(fraction)) + ';',
                    x_align: Clutter.ActorAlign.START,
                });
                bar.connect('notify::width', () => fill.set_width(Math.max(3, Math.round(bar.width * fraction))));
                bar.add_child(fill);
            }
            this.actor.add_child(bar);
        }
    }
}

class SystemTab {
    constructor(engine) {
        this.actor = new St.BoxLayout({ style_class: 'island-system', x_expand: true, y_expand: true });
        // Cards of equal width: without this they change size on every
        // reading, depending on the text of each.
        this.actor.layout_manager.homogeneous = true;

        this._empty = new St.Label({
            style_class: 'island-empty',
            text: _("The Cinnamon Island engine is not running"),
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._empty);

        this._cpu = new Gauge(_("CPU"), 'graph');
        this._memory = new Gauge(_("Memory"), 'graph');
        this._gpu = new Gauge(_("Graphics"), 'graph');
        this._disk = new DiskCard();
        this._network = new Gauge(_("Network"), 'graph');
        // A speed is a longer text than a percentage.
        this._network._value.add_style_class_name('island-gauge-value-long');
        this._battery = new Gauge(_("Battery"), 'bar');
        this._gauges = [this._cpu, this._memory, this._gpu, this._disk, this._network, this._battery];
        for (let gauge of this._gauges) {
            gauge.actor.y_align = Clutter.ActorAlign.CENTER;
            this.actor.add_child(gauge.actor);
        }
        this.update(null);
    }

    update(state) {
        this._empty.visible = !state;
        for (let gauge of this._gauges)
            gauge.actor.visible = !!state;
        if (!state)
            return;
        let disks = state.disks || [];
        this._gpu.actor.visible = !!state.gpu;
        this._disk.actor.visible = disks.length > 0;
        this._battery.actor.visible = !!state.battery;
        // With the tab hidden there is nothing to redraw.
        if (!this.actor.mapped)
            return;

        let history = state.history || {};
        let degrees = value => value === null || value === undefined ? '' : value + ' °C';

        this._cpu.set(state.cpu + '%', degrees(state.temperature), state.cpu / 100, history.cpu, 100);

        let fraction = state.memory_total ? state.memory_used / state.memory_total : 0;
        this._memory.set(Math.round(fraction * 100) + '%',
            formatBytes(state.memory_used) + ' / ' + formatBytes(state.memory_total), fraction, history.memory, 100);

        if (state.gpu) {
            let parts = [degrees(state.gpu.temperature)];
            // Only the video memory in use: with the total next to it the text
            // does not fit.
            if (state.gpu.memory_total)
                parts.push(formatBytes(state.gpu.memory_used));
            this._gpu.set(state.gpu.usage + '%', parts.filter(p => p).join(' · '),
                state.gpu.usage / 100, history.gpu, 100);
        }

        this._disk.set(disks);

        this._network.set('↓ ' + formatBytes(state.download) + '/s', '↑ ' + formatBytes(state.upload) + '/s',
            0, history.download);

        if (state.battery) {
            let battery = state.battery;
            let detail = battery.status === 'charging' ? _("Charging")
                : battery.status === 'discharging' ? _("On battery") : _("Plugged in");
            if (battery.minutes)
                detail = formatMinutes(battery.minutes) + (battery.status === 'charging' ? ' ↑' : '');
            // For the battery the level is reversed: full is good, empty is
            // the alert.
            this._battery.set(battery.percent + '%', detail, 1 - battery.percent / 100);
        }
    }
}

module.exports = { SystemTab };
