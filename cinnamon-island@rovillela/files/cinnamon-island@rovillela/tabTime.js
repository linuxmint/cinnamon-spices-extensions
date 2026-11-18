const { Clutter, Gio, GLib, St } = imports.gi;
const { _, COLORS, css, scrollStep, rollSwitch, resetRoll } = require('./util');
const { PomodoroTab, formatClock } = require('./tabPomodoro');
const { Ruler } = require('./ruler');

// Hours only show when the time goes over one hour.
function formatLong(seconds) {
    if (seconds < 3600)
        return formatClock(seconds);
    let hours = Math.floor(seconds / 3600);
    return hours + ':' + formatClock(seconds % 3600);
}

function iconButton(iconName, callback, main = false) {
    let button = new St.Button({
        style_class: main ? 'island-button island-button-main' : 'island-button',
        child: new St.Icon({ icon_name: iconName, icon_size: 18 }),
    });
    button.connect('clicked', callback);
    return button;
}

// Timer: counts down from a chosen time and alerts at the end.
class TimerView {
    constructor(engine) {
        this._engine = engine;
        this._state = null;
        this.actor = new St.BoxLayout({ style_class: 'island-pomodoro', x_expand: true, y_expand: true });

        let clockBox = new St.BoxLayout({ vertical: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'island-clock-box' });
        // Scrolling the mouse over the time changes the minutes one by one.
        this._clock = new St.Label({ style_class: 'island-clock island-wheel', reactive: true, track_hover: true });
        this._clock.connect('scroll-event', (actor, event) => {
            this._changeMinutes(-scrollStep(event));
            return Clutter.EVENT_STOP;
        });
        clockBox.add_child(this._clock);
        let row = new St.BoxLayout({ style_class: 'island-phase-row' });
        this._label = new St.Label({ style_class: 'island-phase', y_align: Clutter.ActorAlign.CENTER, x_expand: true });
        row.add_child(this._label);
        for (let [iconName, direction] of [['list-remove-symbolic', -1], ['list-add-symbolic', 1]]) {
            let button = new St.Button({
                style_class: 'island-button-small',
                child: new St.Icon({ icon_name: iconName, icon_size: 12 }),
            });
            button.connect('clicked', () => this._changeMinutes(direction));
            row.add_child(button);
        }
        clockBox.add_child(row);
        this.actor.add_child(clockBox);

        // Ruler to pick the minutes by dragging.
        this._ruler = new Ruler(minutes => this._setMinutes(minutes), COLORS.amber);
        this._ruler.actor.y_align = Clutter.ActorAlign.CENTER;
        this.actor.add_child(this._ruler.actor);

        let controls = new St.BoxLayout({ style_class: 'island-controls', y_align: Clutter.ActorAlign.CENTER });
        controls.add_child(iconButton('view-refresh-symbolic', () => engine.call('Timer', 'Reset')));
        this._startPause = iconButton('media-playback-start-symbolic', () => {
            let state = this._state;
            if (!state)
                return;
            // While the end alert is ringing, the main button dismisses it.
            engine.call('Timer', state.ringing ? 'Reset' : state.running ? 'Pause' : 'Start');
        }, true);
        controls.add_child(this._startPause);
        this.actor.add_child(controls);
    }

    _setMinutes(minutes) {
        this._engine.call('Timer', 'SetMinutes', new GLib.Variant('(d)', [minutes]));
    }

    _changeMinutes(direction) {
        let state = this._state;
        if (!state || state.running || !direction)
            return;
        let minutes = Math.round(state.duration / 60) + direction;
        this._setMinutes(Math.max(1, Math.min(600, minutes)));
    }

    update(state) {
        this._state = state;
        if (!state)
            return;
        let active = state.running || state.ringing;
        this._clock.text = formatLong(state.remaining);
        this._clock.set_style(active ? 'color: ' + css(state.ringing ? COLORS.rose : COLORS.amber) + ';' : null);
        this._label.text = state.ringing ? _("Time's up") : _("Timer");
        this._label.set_style('color: ' + css(state.ringing ? COLORS.rose : COLORS.amber) + ';');
        this._startPause.child.icon_name = state.ringing ? 'object-select-symbolic'
            : state.running ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        // Stopped, the ruler shows the chosen time and lets it be changed;
        // running, it follows what is left.
        if (!this._ruler.dragging) {
            let seconds = state.running ? state.remaining : state.ringing ? 0 : state.duration;
            this._ruler.show(Math.ceil(seconds / 60), !state.running && !state.ringing);
        }
    }
}

// Stopwatch: counts up.
class StopwatchView {
    constructor(engine) {
        this._state = null;
        // The number sits in the centre of the tab, large; the buttons, at the
        // right end.
        this.actor = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true });

        let clockBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._clock = new St.Label({ style_class: 'island-clock-large', x_align: Clutter.ActorAlign.CENTER });
        this._label = new St.Label({ style_class: 'island-phase', text: _("Stopwatch"), x_align: Clutter.ActorAlign.CENTER });
        clockBox.add_child(this._clock);
        clockBox.add_child(this._label);
        this.actor.add_child(clockBox);

        let controls = new St.BoxLayout({
            style_class: 'island-controls',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        controls.add_child(iconButton('view-refresh-symbolic', () => engine.call('Timer', 'StopwatchReset')));
        this._startPause = iconButton('media-playback-start-symbolic', () =>
            engine.call('Timer', this._state && this._state.stopwatch_running ? 'StopwatchPause' : 'StopwatchStart'), true);
        controls.add_child(this._startPause);
        this.actor.add_child(controls);
    }

    update(state) {
        this._state = state;
        if (!state)
            return;
        this._clock.text = formatLong(state.stopwatch);
        this._clock.set_style(state.stopwatch_running ? 'color: ' + css(COLORS.blue) + ';' : null);
        this._label.set_style('color: ' + css(COLORS.blue) + ';');
        this._startPause.child.icon_name = state.stopwatch_running
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
    }
}

// The time tab: Pomodoro, timer and stopwatch, one at a time, with three
// buttons to switch.
class TimeTab {
    constructor(engine, editing, adjust, setMinutes) {
        // The three modes are stacked on the left; the chosen mode takes the
        // rest of the tab.
        this.actor = new St.BoxLayout({ style_class: 'island-time-tab', x_expand: true, y_expand: true });

        this._modes = new St.BoxLayout({
            style_class: 'island-modes island-wheel',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        // Scrolling the mouse over the three buttons switches between them.
        this._modes.connect('scroll-event', (actor, event) => {
            // It wraps around too: from the last mode to the first.
            let names = Object.keys(this._views);
            let step = scrollStep(event);
            if (step)
                this.setMode(names[(names.indexOf(this._mode) + step + names.length) % names.length], step);
            return Clutter.EVENT_STOP;
        });
        this.actor.add_child(this._modes);

        this._stack = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true });
        this.actor.add_child(this._stack);

        this._pomodoro = new PomodoroTab(engine, editing, adjust, setMinutes);
        this._timer = new TimerView(engine);
        this._stopwatch = new StopwatchView(engine);
        this._views = {};
        this._add('pomodoro', _("Pomodoro"), 'appointment-soon-symbolic', this._pomodoro);
        this._add('timer', _("Timer"), 'timer-symbolic', this._timer);
        this._add('stopwatch', _("Stopwatch"), 'stopwatch-symbolic', this._stopwatch);
        this.setMode('pomodoro');
    }

    _add(name, title, iconName, view) {
        let box = new St.BoxLayout({ style_class: 'island-output-box' });
        box.add_child(new St.Icon({
            gicon: new Gio.ThemedIcon({ names: [iconName, 'alarm-symbolic'] }),
            icon_size: 13,
        }));
        box.add_child(new St.Label({ text: title, y_align: Clutter.ActorAlign.CENTER }));
        let button = new St.Button({ style_class: 'island-output-row', child: box, x_align: St.Align.START });
        button.set_x_align(Clutter.ActorAlign.FILL);
        button.connect('clicked', () => this.setMode(name));
        this._modes.add_child(button);
        this._stack.add_child(view.actor);
        this._views[name] = { button, view };
    }

    setMode(name, direction = null) {
        let names = Object.keys(this._views);
        let previous = this._views[this._mode];
        if (direction === null)
            direction = names.indexOf(name) >= names.indexOf(this._mode) ? 1 : -1;
        this._mode = name;
        // Only the two modes involved in the switch are visible; it rolls like
        // the tab switch.
        for (let key in this._views) {
            let view = this._views[key].view;
            if (key !== name && this._views[key] !== previous) {
                resetRoll(view.actor);
                view.actor.visible = false;
            }
        }
        rollSwitch(previous ? previous.view.actor : null, this._views[name].view.actor, direction,
            this.actor.mapped && !!previous);
        for (let key in this._views) {
            let { button } = this._views[key];
            if (key === name)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
    }

    // Pomodoro state (the tab is registered with it).
    update(state) {
        this._pomodoro.update(state);
    }

    // State of the timer and the stopwatch.
    updateTimer(state) {
        this._timer.update(state);
        this._stopwatch.update(state);
    }
}

module.exports = { TimeTab, formatLong };
