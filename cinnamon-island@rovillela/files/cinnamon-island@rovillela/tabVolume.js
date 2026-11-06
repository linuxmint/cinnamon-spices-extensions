const { Clutter, Gio, GLib, Pango, St } = imports.gi;
const { _, scrollStep, COLORS, css, makeDot } = require('./util');
const { Slider } = require('./slider');

function volumeIcon(volume, muted) {
    if (muted || volume <= 0)
        return 'audio-volume-muted-symbolic';
    if (volume < 0.34)
        return 'audio-volume-low-symbolic';
    if (volume < 0.67)
        return 'audio-volume-medium-symbolic';
    return 'audio-volume-high-symbolic';
}

const OUTPUT_ICONS = {
    display: 'video-display-symbolic',
    headphones: 'audio-headphones-symbolic',
    digital: 'audio-card-symbolic',
    speakers: 'audio-speakers-symbolic',
};

// Short name of an output: the device name when the engine found one,
// otherwise a generic name for the kind.
function outputLabel(output) {
    if (output.short)
        return output.short;
    return {
        display: _("Display"),
        headphones: _("Headphones"),
        digital: _("Digital output"),
    }[output.kind] || _("Speakers");
}

// Vendors that show in front of the name of some programs and only take up
// room: "Mozilla Firefox" becomes "Firefox".
const VENDORS = /^(mozilla|google|microsoft|gnome|kde|the)\s+/i;
const CHANNEL_NAME_CHARS = 8;
const APP_CHANNELS = 4;

function shortAppName(name) {
    let short = (name || '').trim();
    while (VENDORS.test(short) && short.replace(VENDORS, '').length > 0)
        short = short.replace(VENDORS, '');
    if (short.length > CHANNEL_NAME_CHARS)
        short = short.slice(0, CHANNEL_NAME_CHARS - 1).trimEnd() + '…';
    return short;
}

// A mixer channel: the percentage on top, the upright bar in the middle and,
// below, the icon with the name. Clicking the icon or the name mutes the
// channel.
class Channel {
    // `max` is the volume that corresponds to the full bar (1 = 100%).
    constructor(color, max, onVolume, onMute) {
        this._color = color;
        this._max = max;
        this._dragging = false;
        this.actor = new St.BoxLayout({ style_class: 'island-channel', vertical: true });

        this._percent = new St.Label({ style_class: 'island-channel-value', x_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(this._percent);

        this._slider = new Slider({ vertical: true, color });
        if (max > 1)
            this._slider.mark = 1 / max;
        this._slider.actor.x_align = Clutter.ActorAlign.CENTER;
        this._slider.connect('drag-begin', () => { this._dragging = true; });
        this._slider.connect('drag-end', () => { this._dragging = false; });
        this._slider.connect('value-changed', (slider, value) => {
            this._percent.text = String(Math.round(value * this._max * 100));
            onVolume(value * this._max);
        });
        this.actor.add_child(this._slider.actor);

        this._icon = new St.Icon({ icon_size: 13 });
        this._name = new St.Label({ style_class: 'island-channel-name', y_align: Clutter.ActorAlign.CENTER });
        let label = new St.BoxLayout({ style_class: 'island-channel-label' });
        label.add_child(this._icon);
        label.add_child(this._name);
        this._mute = new St.Button({ style_class: 'island-button-app', child: label });
        this._mute.connect('clicked', () => onMute());
        this.actor.add_child(this._mute);
    }

    // `icon` is an icon name or a Gio.Icon; `tint` says whether it takes the
    // colour of the channel (program icons keep their own colours).
    update(volume, muted, icon, name, tint) {
        if (typeof icon === 'string')
            this._icon.icon_name = icon;
        else
            this._icon.gicon = icon;
        this._icon.set_style(muted ? 'color: ' + css(COLORS.rose) + ';'
            : tint ? 'color: ' + css(this._color) + ';' : null);
        this._icon.opacity = muted && !tint ? 100 : 255;
        this._name.text = name;
        this._name.opacity = muted ? 130 : 255;
        this._slider.setDimmed(muted);
        // While the person drags, the control owns the value; the echo from
        // the engine would arrive late and make the control "jump".
        if (this._dragging)
            return;
        this._slider.setValue(Math.min(1, volume / this._max));
        this._percent.text = String(Math.round(volume * 100));
    }
}

// The Volume tab is a mixer: on the left the audio outputs, stacked; then the
// master channel (blue) and the microphone (green); and, after a dash, one
// channel per program that is playing sound (yellow).
class VolumeTab {
    constructor(engine) {
        this._engine = engine;
        this._state = null;
        this._outputsKey = '';
        this._appOffset = 0;

        this.actor = new St.BoxLayout({ style_class: 'island-volume', x_expand: true, y_expand: true });

        this._empty = new St.Label({
            style_class: 'island-empty',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._empty);

        // Outputs, one per row. Scrolling the mouse over them switches output.
        this._outputsColumn = new St.BoxLayout({
            style_class: 'island-outputs-column island-wheel',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._outputsColumn.connect('scroll-event', (actor, event) => {
            let step = scrollStep(event);
            let state = this._state;
            if (step && state && state.available) {
                let index = state.outputs.findIndex(o => o.name === state.output) + step;
                if (index >= 0 && index < state.outputs.length) {
                    engine.call('Volume', 'SetOutput',
                        new GLib.Variant('(s)', [state.outputs[index].name]));
                }
            }
            return Clutter.EVENT_STOP;
        });
        this._outputsColumn.add_child(new St.Label({ style_class: 'island-column-title', text: _("Output") }));
        this._outputs = new St.BoxLayout({ style_class: 'island-outputs-list', vertical: true });
        this._outputsColumn.add_child(this._outputs);
        this.actor.add_child(this._outputsColumn);

        this._divider = new St.Widget({ style_class: 'island-dash' });
        this.actor.add_child(this._divider);

        // The mixer: master, microphone, a dash and the programs.
        this._mixer = new St.BoxLayout({
            style_class: 'island-mixer',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._mixer);

        this._output = new Channel(COLORS.blue, 1,
            value => engine.call('Volume', 'SetVolume', new GLib.Variant('(d)', [value])),
            () => engine.call('Volume', 'SetMuted', new GLib.Variant('(b)', [!this._state.muted])));
        this._mixer.add_child(this._output.actor);

        this._mic = new Channel(COLORS.green, 1,
            value => engine.call('Volume', 'SetMicVolume', new GLib.Variant('(d)', [value])),
            () => engine.call('Volume', 'SetMicMuted', new GLib.Variant('(b)', [!this._state.mic_muted])));
        this._mixer.add_child(this._mic.actor);

        this._appsDivider = new St.Widget({ style_class: 'island-dash' });
        this._mixer.add_child(this._appsDivider);

        // Programs: a few fit; with more, the wheel over the names scrolls the
        // list (over a bar, the wheel changes its volume).
        this._apps = new St.BoxLayout({ style_class: 'island-mixer', reactive: true });
        this._apps.connect('scroll-event', (actor, event) => {
            let count = this._state ? this._state.apps.length : 0;
            // With no more programs to show, the wheel moves on and switches
            // tabs.
            let offset = Math.max(0, Math.min(count - APP_CHANNELS, this._appOffset + scrollStep(event)));
            // At the start or the end of the list, the wheel switches tabs.
            if (offset === this._appOffset)
                return Clutter.EVENT_PROPAGATE;
            this._appOffset = offset;
            this.update(this._state);
            return Clutter.EVENT_STOP;
        });
        this._appChannels = [];
        for (let i = 0; i < APP_CHANNELS; i++) {
            let slot = { app: null };
            slot.channel = new Channel(COLORS.amber, 1.5,
                value => {
                    if (slot.app)
                        engine.call('Volume', 'SetAppVolume', new GLib.Variant('(ud)', [slot.app.id, value]));
                },
                () => {
                    if (slot.app)
                        engine.call('Volume', 'SetAppMuted', new GLib.Variant('(ub)', [slot.app.id, !slot.app.muted]));
                });
            this._apps.add_child(slot.channel.actor);
            this._appChannels.push(slot);
        }
        this._mixer.add_child(this._apps);

        this.update(null);
    }

    update(state) {
        this._state = state;
        let available = !!(state && state.available);
        this._empty.visible = !available;
        this._empty.text = state ? _("No audio output found") : _("The Cinnamon Island engine is not running");
        for (let actor of [this._outputsColumn, this._divider, this._mixer])
            actor.visible = available;
        if (!available)
            return;

        this._output.update(state.volume, state.muted, volumeIcon(state.volume, state.muted), _("Master"), true);
        this._mic.actor.visible = state.mic_available;
        this._mic.update(state.mic_volume, state.mic_muted, state.mic_muted
            ? 'microphone-sensitivity-muted-symbolic' : 'microphone-sensitivity-high-symbolic', _("Mic"), true);
        this._updateOutputs(state);

        let apps = state.apps || [];
        this._appsDivider.visible = this._apps.visible = apps.length > 0;
        this._appOffset = Math.max(0, Math.min(this._appOffset, apps.length - APP_CHANNELS));
        this._appChannels.forEach((slot, i) => {
            let app = apps[this._appOffset + i];
            slot.app = app || null;
            slot.channel.actor.visible = !!app;
            if (app) {
                // The icon of the program, with fallbacks in case the theme
                // has none.
                let icon = new Gio.ThemedIcon({
                    names: [app.icon, app.icon.toLowerCase(), 'audio-x-generic-symbolic'].filter(n => n),
                });
                slot.channel.update(app.volume, app.muted, icon, shortAppName(app.name), false);
            }
        });
    }

    // One button per audio output, one below the other; the one in use is
    // highlighted and has the green dot.
    _updateOutputs(state) {
        let key = JSON.stringify(state.outputs);
        if (key !== this._outputsKey) {
            this._outputsKey = key;
            this._outputs.destroy_all_children();
            for (let output of state.outputs) {
                let box = new St.BoxLayout({ style_class: 'island-output-box' });
                let dot = makeDot(COLORS.green);
                box.add_child(dot);
                box.add_child(new St.Icon({ icon_name: OUTPUT_ICONS[output.kind] || OUTPUT_ICONS.speakers, icon_size: 14 }));
                let label = new St.Label({ text: outputLabel(output), y_align: Clutter.ActorAlign.CENTER });
                label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                box.add_child(label);
                let button = new St.Button({ style_class: 'island-output-row', child: box, x_align: St.Align.START });
                button.set_x_align(Clutter.ActorAlign.FILL);
                button._outputName = output.name;
                button._dot = dot;
                button.connect('clicked', () =>
                    this._engine.call('Volume', 'SetOutput', new GLib.Variant('(s)', [output.name])));
                this._outputs.add_child(button);
            }
        }
        for (let button of this._outputs.get_children()) {
            let active = button._outputName === state.output;
            // The dot only shows on the output in use, but keeps its room on
            // the others so the names stay aligned.
            button._dot.opacity = active ? 255 : 0;
            if (active)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
    }
}

module.exports = { VolumeTab, volumeIcon, OUTPUT_ICONS, outputLabel };
