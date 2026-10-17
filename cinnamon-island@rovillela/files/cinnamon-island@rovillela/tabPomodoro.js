const { Clutter, GLib, St } = imports.gi;
const { _, COLORS } = require('./util');
const { Ruler } = require('./ruler');

// Colour of each phase: rose for focus, light green for breaks.
const PHASE_COLORS = {
    focus: COLORS.rose,
    short_break: COLORS.green,
    long_break: COLORS.green,
};

function phaseColor(phase) {
    return PHASE_COLORS[phase] || PHASE_COLORS.focus;
}

function formatClock(seconds) {
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

class PomodoroTab {
    // `editing` receives { begin(), end() }: the island has to grab the
    // keyboard while the person types the task and release it right after.
    // `adjust(phase, delta)` changes the length of a phase in the preferences,
    // one step up or down; `setMinutes(phase, minutes)` sets it.
    constructor(engine, editing, adjust, setMinutes) {
        this._engine = engine;
        this._editing = editing;
        this._adjust = adjust;
        this._setMinutes = setMinutes;
        this._state = null;
        this._isEditing = false;

        this.actor = new St.BoxLayout({ style_class: 'island-pomodoro', x_expand: true, y_expand: true });

        this._empty = new St.Label({
            style_class: 'island-empty',
            text: _("The Cinnamon Island engine is not running"),
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._empty);

        // Clock and phase name.
        this._clockBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'island-clock-box' });
        this._clock = new St.Label({ style_class: 'island-clock' });
        this._phase = new St.Label({ style_class: 'island-phase', y_align: Clutter.ActorAlign.CENTER, x_expand: true });
        this._clockBox.add_child(this._clock);

        // Below the clock: the phase name and the less and more time buttons.
        let phaseRow = new St.BoxLayout({ style_class: 'island-phase-row' });
        phaseRow.add_child(this._phase);
        for (let [iconName, direction] of [['list-remove-symbolic', -1], ['list-add-symbolic', 1]]) {
            let button = new St.Button({
                style_class: 'island-button-small',
                child: new St.Icon({ icon_name: iconName, icon_size: 12 }),
            });
            button.connect('clicked', () => {
                if (this._state)
                    this._adjust(this._state.phase, direction);
            });
            phaseRow.add_child(button);
        }
        this._clockBox.add_child(phaseRow);
        this.actor.add_child(this._clockBox);

        // In the middle: the current task, the ruler of the phase and, below,
        // the cycle dots with the statistics.
        this._middle = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'island-pomodoro-middle',
        });
        this._task = new St.Entry({
            style_class: 'island-task',
            hint_text: _("What are you working on?"),
            can_focus: true,
            x_expand: true,
        });
        // The click reaches the text inside the field, not the field; hence
        // the capture, which sees the events of the children.
        this._task.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
                this._beginEdit();
            return Clutter.EVENT_PROPAGATE;
        });
        this._task.clutter_text.connect('activate', () => this._endEdit(true));
        this._task.clutter_text.connect('key-press-event', (actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this._endEdit(false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._middle.add_child(this._task);

        // The ruler shows and sets the minutes of the phase on screen, in its
        // colour; with the clock running, it follows what is left.
        this._ruler = new Ruler(minutes => {
            if (this._state)
                this._setMinutes(this._state.phase, minutes);
        }, phaseColor('focus'));
        this._ruler.actor.add_style_class_name('island-ruler-low');
        this._middle.add_child(this._ruler.actor);

        let infoRow = new St.BoxLayout({ style_class: 'island-pomodoro-info' });
        this._dots = new St.DrawingArea({ style_class: 'island-cycles', y_align: Clutter.ActorAlign.CENTER });
        this._dots.connect('repaint', area => this._drawDots(area));
        this._stats = new St.Label({ style_class: 'island-time', y_align: Clutter.ActorAlign.CENTER });
        infoRow.add_child(this._dots);
        infoRow.add_child(this._stats);
        this._middle.add_child(infoRow);
        this.actor.add_child(this._middle);

        this._controls = new St.BoxLayout({ style_class: 'island-controls', y_align: Clutter.ActorAlign.CENTER });
        this._reset = this._button('view-refresh-symbolic', () => this._engine.call('Pomodoro', 'Reset'));
        this._startPause = this._button('media-playback-start-symbolic', () =>
            this._engine.call('Pomodoro', this._state && this._state.running ? 'Pause' : 'Start'));
        this._startPause.add_style_class_name('island-button-main');
        this._skip = this._button('media-skip-forward-symbolic', () => this._engine.call('Pomodoro', 'Skip'));
        this.actor.add_child(this._controls);

        this.update(null);
    }

    _button(iconName, callback) {
        let button = new St.Button({
            style_class: 'island-button',
            child: new St.Icon({ icon_name: iconName, icon_size: 18 }),
        });
        button.connect('clicked', callback);
        this._controls.add_child(button);
        return button;
    }

    update(state) {
        this._state = state;
        this._empty.visible = !state;
        for (let actor of [this._clockBox, this._middle, this._controls])
            actor.visible = !!state;
        if (!state)
            return;

        let color = 'rgb(' + phaseColor(state.phase).join(',') + ')';
        this._clock.text = formatClock(state.remaining);
        this._clock.set_style(state.active ? 'color: ' + color + ';' : null);
        this._phase.text = {
            focus: _("Focus"),
            short_break: _("Short break"),
            long_break: _("Long break"),
        }[state.phase];
        this._phase.set_style('color: ' + color + ';');

        if (!this._isEditing)
            this._task.set_text(state.task);
        this._stats.text = _("Today: %d · This week: %d").replace('%d', state.today).replace('%d', state.week);
        this._dots.set_width(state.cycles * 14);
        this._dots.queue_repaint();

        this._ruler.setColor(phaseColor(state.phase));
        if (!this._ruler.dragging) {
            let seconds = state.running || state.active ? state.remaining : state.duration;
            this._ruler.show(Math.ceil(seconds / 60), !state.running);
        }

        // Skipping only makes sense during a break ("I have rested, I want to
        // get back to focus").
        this._skip.visible = state.phase !== 'focus';
        this._startPause.child.icon_name = state.running
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
    }

    // One dot per focus round until the long break; completed ones are filled.
    _drawDots(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let state = this._state;
        if (state) {
            let [r, g, b] = phaseColor('focus');
            for (let i = 0; i < state.cycles; i++) {
                if (i < state.cycle)
                    cr.setSourceRGBA(r / 255, g / 255, b / 255, 1);
                else
                    cr.setSourceRGBA(1, 1, 1, 0.25);
                cr.arc(4 + i * 14, height / 2, 4, 0, 2 * Math.PI);
                cr.fill();
            }
        }
        cr.$dispose();
    }

    _beginEdit() {
        if (this._isEditing)
            return Clutter.EVENT_PROPAGATE;
        if (!this._editing.begin(() => this._endEdit(true)))
            return Clutter.EVENT_PROPAGATE;
        this._isEditing = true;
        this._task.grab_key_focus();
        return Clutter.EVENT_PROPAGATE;
    }

    // Ends the editing of the task; `save` false discards what was typed.
    _endEdit(save) {
        if (!this._isEditing)
            return;
        this._isEditing = false;
        this._editing.end();
        if (save)
            this._engine.call('Pomodoro', 'SetTask', new GLib.Variant('(s)', [this._task.get_text()]));
        else if (this._state)
            this._task.set_text(this._state.task);
    }
}

module.exports = { PomodoroTab, phaseColor, formatClock };
