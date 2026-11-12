const { Clutter, Gio, GLib, St } = imports.gi;
const { _, COLORS, css } = require('./util');

// "Keep awake" durations the button cycles through on each click, in minutes
// (0 = until turned off); after the last one, it turns off.
const AWAKE_STEPS = [30, 60, 120, 0];

function formatRemaining(seconds) {
    if (seconds < 0)
        return _("Until turned off");
    let minutes = Math.max(1, Math.ceil(seconds / 60));
    if (minutes < 60)
        return _("%d min").replace('%d', minutes);
    return Math.floor(minutes / 60) + ' h ' + (minutes % 60 < 10 ? '0' : '') + (minutes % 60);
}

// A large button of the tab: icon on top, name and a detail line.
class Tile {
    constructor(iconNames, title, onClick) {
        this._icon = new St.Icon({
            gicon: new Gio.ThemedIcon({ names: iconNames.concat(['applications-utilities-symbolic']) }),
            icon_size: 22,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({ style_class: 'island-tool-name', text: title, x_align: Clutter.ActorAlign.CENTER });
        this._detail = new St.Label({ style_class: 'island-tool-detail', x_align: Clutter.ActorAlign.CENTER });
        let box = new St.BoxLayout({ vertical: true, style_class: 'island-tool-box' });
        box.add_child(this._icon);
        box.add_child(this._title);
        box.add_child(this._detail);
        this.actor = new St.Button({ style_class: 'island-tool', child: box, x_expand: true, x_fill: true });
        this.actor.connect('clicked', () => onClick());
    }

    set(detail, color = null, active = false) {
        this._detail.text = detail;
        this._icon.set_style(color ? 'color: ' + css(color) + ';' : null);
        if (active)
            this.actor.add_style_pseudo_class('checked');
        else
            this.actor.remove_style_pseudo_class('checked');
    }
}

// Quick actions. `actions` comes from the island: `pickColor()` enters colour
// picker mode, `runHidden(fn)` closes the island before calling `fn` (so it
// stays out of screenshots) and `toggleCamera()` opens or closes the camera
// mirror.
class ToolsTab {
    constructor(engine, actions) {
        this._engine = engine;
        this._state = null;

        this.actor = new St.BoxLayout({ style_class: 'island-tools', x_expand: true, y_expand: true });

        this._empty = new St.Label({
            style_class: 'island-empty',
            text: _("The Cinnamon Island engine is not running"),
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._empty);

        this._awake = new Tile(['my-caffeine-on-symbolic', 'preferences-desktop-screensaver-symbolic'],
            _("Keep awake"), () => this._cycleAwake());
        this._color = new Tile(['color-select-symbolic'], _("Color picker"), () => actions.pickColor());
        this._area = new Tile(['screenshooter-symbolic', 'camera-photo-symbolic'], _("Capture area"),
            () => actions.runHidden(() => engine.call('Tools', 'Screenshot', new GLib.Variant('(b)', [true]))));
        this._screen = new Tile(['view-fullscreen-symbolic', 'camera-photo-symbolic'], _("Capture screen"),
            () => actions.runHidden(() => engine.call('Tools', 'Screenshot', new GLib.Variant('(b)', [false]))));
        this._text = new Tile(['insert-text-symbolic', 'font-x-generic-symbolic'], _("Copy text"),
            () => {
                if (this._state && this._state.ocr_available)
                    actions.runHidden(() => engine.call('Tools', 'CopyScreenText'));
            });
        this._camera = new Tile(['camera-web-symbolic', 'camera-photo-symbolic'], _("Camera"),
            () => actions.toggleCamera());
        this._tiles = [this._awake, this._color, this._area, this._screen, this._text, this._camera];
        for (let tile of this._tiles) {
            tile.actor.y_align = St.Align.MIDDLE;
            tile.actor.set_y_align(Clutter.ActorAlign.CENTER);
            this.actor.add_child(tile.actor);
        }

        this._color.set(_("Copies the color code"));
        this._area.set(_("Goes to Files"));
        this._screen.set(_("Goes to Files"));
        this.update(null);
    }

    // Each click moves to the next duration; after the last one, it turns off.
    _cycleAwake() {
        let state = this._state;
        if (!state)
            return;
        // The current step comes from what the engine says is on, not from a
        // count kept here.
        let next = state.awake ? AWAKE_STEPS.indexOf(state.awake_minutes) + 1 : 0;
        if (state.awake && (next === 0 || next >= AWAKE_STEPS.length)) {
            this._engine.call('Tools', 'StopAwake');
            return;
        }
        this._engine.call('Tools', 'KeepAwake', new GLib.Variant('(d)', [AWAKE_STEPS[next]]));
    }

    update(state) {
        this._state = state;
        this._empty.visible = !state;
        for (let tile of this._tiles)
            tile.actor.visible = !!state;
        if (!state)
            return;
        this._awake.set(state.awake ? formatRemaining(state.awake_remaining) : _("Off"),
            state.awake ? COLORS.amber : null, state.awake);
        this._text.set(state.ocr_available ? _("From an area of the screen") : _("Needs tesseract-ocr"));
        this._text.actor.opacity = state.ocr_available ? 255 : 120;
        this._camera.set(state.camera ? _("On · click to close") : _("Mirror below the island"),
            state.camera ? COLORS.amber : null, !!state.camera);
    }
}

module.exports = { ToolsTab, formatRemaining };
