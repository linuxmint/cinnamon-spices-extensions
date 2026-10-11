const { Clutter, Gio, GLib, Pango, St } = imports.gi;
const { _, COLORS, css } = require('./util');
const { coverStyle } = require('./tabMusic');
const { volumeIcon } = require('./tabVolume');
const { phaseColor, formatClock } = require('./tabPomodoro');
const { formatLong } = require('./tabTime');
const { formatRemaining } = require('./tabTools');

const WAVE_BARS = 4;
const WAVE_INTERVAL_MS = 66;
const VOLUME_FLASH_MS = 2000;
// With no sound measurement for longer than this, the wave bars go back to
// being decoration only.
const LEVELS_STALE_US = 600000;

function lerpLevel(from, to, amount) {
    return from + (to - from) * amount;
}

const NOTICE_MS = 3500;
// How long a notice lasts when another one is already waiting its turn.
const NOTICE_SHORT_MS = 1400;
// The countdown to the next event shows when it is up to an hour away, and a
// notice goes out at ten minutes.
const COUNTDOWN_WINDOW_MIN = 60;
const EVENT_NOTICE_MIN = 10;
const COUNTDOWN_REFRESH_MS = 20000;

// What the island shows while collapsed.
//
// At rest, two spots: on the left the Pomodoro time, or the countdown to the
// next event, or the album cover (in that order of preference); on the right
// the wave bars, when there is music.
//
// On top of that come the notices, one at a time and for a few seconds: the
// volume bar, a finished download, an accessory that connected, the muted
// microphone. During a text notice the island gets wider (`wide`), and
// `onWideChanged` tells the island to adjust.
class Collapsed {
    // `onChanged` is called whenever what is on display changes.
    constructor(onWideChanged, onChanged) {
        this.actor = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this._onWideChanged = onWideChanged;
        this._onChanged = onChanged;
        this._hoverControls = false;
        this.wide = false;
        this.currentNotice = null;
        this._queue = [];
        this._noticeTimer = 0;
        // Real sound levels (four, from 0 to 1), what the bars show right now,
        // and when the last measurement arrived.
        this._levels = null;
        this._shown = [0.25, 0.25, 0.25, 0.25];
        this._levelsAt = 0;
        this._events = [];
        this._showEvents = true;
        this._announcedEvents = {};
        this._countdownTimer = 0;
        this._playing = false;
        this._active = true;
        this._waveTimer = 0;
        this._flashTimer = 0;
        this._volume = 0;

        this._music = new St.BoxLayout({ style_class: 'island-mini', x_expand: true, y_expand: true, visible: false });
        this._cover = new St.Widget({
            style_class: 'island-mini-cover',
            layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._coverIcon = new St.Icon({ icon_name: 'audio-x-generic-symbolic', icon_size: 12 });
        this._cover.add_child(this._coverIcon);
        this._music.add_child(this._cover);
        this._clock = new St.Label({ style_class: 'island-mini-clock', y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._music.add_child(this._clock);
        this._countdown = new St.BoxLayout({ style_class: 'island-mini-countdown', y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._countdown.add_child(new St.Icon({
            icon_name: 'x-office-calendar-symbolic',
            icon_size: 12,
            style: 'color: ' + css(COLORS.blue) + ';',
        }));
        this._countdownLabel = new St.Label({ style_class: 'island-mini-clock', y_align: Clutter.ActorAlign.CENTER });
        this._countdown.add_child(this._countdownLabel);
        this._music.add_child(this._countdown);
        // "Keep awake" is on: a cup and the time left.
        this._awakeBox = new St.BoxLayout({ style_class: 'island-mini-countdown', y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._awakeBox.add_child(new St.Icon({
            gicon: new Gio.ThemedIcon({ names: ['my-caffeine-on-symbolic', 'preferences-desktop-screensaver-symbolic'] }),
            icon_size: 12,
            style: 'color: ' + css(COLORS.amber) + ';',
        }));
        this._awakeLabel = new St.Label({ style_class: 'island-mini-clock', y_align: Clutter.ActorAlign.CENTER });
        this._awakeBox.add_child(this._awakeLabel);
        this._music.add_child(this._awakeBox);
        this._music.add_child(new St.Widget({ x_expand: true }));
        this._waves = new St.DrawingArea({ style_class: 'island-waves', y_align: Clutter.ActorAlign.CENTER });
        this._waves.connect('repaint', area => this._drawWaves(area));
        this._music.add_child(this._waves);
        // In "open on click" mode, hovering swaps the wave bars for a
        // play/pause button.
        this._playIcon = new St.Icon({ icon_size: 14, y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._music.add_child(this._playIcon);
        this.actor.add_child(this._music);

        this._volumeBox = new St.BoxLayout({ style_class: 'island-mini', x_expand: true, y_expand: true, visible: false });
        this._volumeIcon = new St.Icon({ icon_size: 14, y_align: Clutter.ActorAlign.CENTER });
        this._volumeBar = new St.DrawingArea({ style_class: 'island-mini-volume', x_expand: true });
        this._volumeBar.connect('repaint', area => this._drawVolume(area));
        this._volumeBox.add_child(this._volumeIcon);
        this._volumeBox.add_child(this._volumeBar);
        this.actor.add_child(this._volumeBox);

        this._noticeBox = new St.BoxLayout({ style_class: 'island-mini', x_expand: true, y_expand: true, visible: false });
        this._noticeIcon = new St.Icon({ icon_size: 14, y_align: Clutter.ActorAlign.CENTER });
        this._noticeLabel = new St.Label({ style_class: 'island-mini-notice', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._noticeLabel.clutter_text.ellipsize = Pango.EllipsizeMode.MIDDLE;
        this._noticeBox.add_child(this._noticeIcon);
        this._noticeBox.add_child(this._noticeLabel);
        this.actor.add_child(this._noticeBox);
    }

    // Queues a notice. `notice` has `icon`, `text` and, optionally, `color`
    // (of the icon), `tab` (the tab the island opens if the person hovers
    // during the notice), `onOpen` (what to do in that case) and `key`.
    //
    // Notices with the same `key` are about the same subject (the microphone,
    // the audio output): the new one replaces the old one right away instead
    // of waiting its turn. Without this, toggling the microphone several times
    // left the island showing stale notices one after another.
    showNotice(notice) {
        if (notice.key) {
            this._queue = this._queue.filter(queued => queued.key !== notice.key);
            if (this.currentNotice && this.currentNotice.key === notice.key) {
                this._display(notice);
                return;
            }
        }
        this._queue.push(notice);
        // With another notice on screen, that one is cut short to give way to
        // the new one.
        if (this.currentNotice)
            this._startNoticeTimer(NOTICE_SHORT_MS);
        this._nextNotice();
    }

    _startNoticeTimer(duration) {
        if (this._noticeTimer)
            GLib.source_remove(this._noticeTimer);
        this._noticeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
            this._noticeTimer = 0;
            this._endNotice();
            return GLib.SOURCE_REMOVE;
        });
    }

    _display(notice) {
        this.currentNotice = notice;
        // The icon is a theme name or, for notifications, may be the path of
        // an image.
        if (notice.icon && notice.icon.startsWith('/'))
            this._noticeIcon.gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(notice.icon) });
        else
            this._noticeIcon.gicon = new Gio.ThemedIcon({ names: [notice.icon, 'dialog-information-symbolic'] });
        this._noticeIcon.set_style(notice.color ? 'color: ' + css(notice.color) + ';' : null);
        this._noticeLabel.text = notice.text;
        this._startNoticeTimer(this._queue.length > 0 ? NOTICE_SHORT_MS : NOTICE_MS);
        this._sync();
    }

    _nextNotice() {
        // With the island open the notices wait: nobody would see them.
        if (this.currentNotice || !this._active || this._queue.length === 0)
            return;
        this._display(this._queue.shift());
    }

    _endNotice() {
        if (this._noticeTimer) {
            GLib.source_remove(this._noticeTimer);
            this._noticeTimer = 0;
        }
        this.currentNotice = null;
        this._sync();
        this._nextNotice();
    }

    // The island calls this when it opens because of the mouse: if there was a
    // notice with a tab, it returns the notice (and ends it) so the island
    // goes straight to the subject.
    takeNotice() {
        let notice = this.currentNotice;
        if (notice)
            this._endNotice();
        return notice;
    }

    // With `on`, the collapsed island shows the play/pause button in place of
    // the wave bars (the island turns this on while the mouse is over it, in
    // "open on click" mode).
    setHoverControls(on) {
        if (on !== this._hoverControls) {
            this._hoverControls = on;
            this._sync();
        }
    }

    get hasMusic() {
        return !!this._hasMusic;
    }

    setEventsEnabled(enabled) {
        this._showEvents = enabled;
        this._sync();
    }

    // Receives the engine state that carries the events (the same one as
    // Weather).
    setEvents(state) {
        this._events = state ? state.events.filter(e => !e.all_day) : [];
        if (!this._countdownTimer) {
            this._countdownTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COUNTDOWN_REFRESH_MS, () => {
                this._sync();
                return GLib.SOURCE_CONTINUE;
            });
        }
        this._sync();
    }

    // The next timed event starting within an hour: [event, minutes left], or
    // null.
    _nextEvent() {
        if (!this._showEvents)
            return null;
        let now = Date.now();
        for (let event of this._events) {
            let minutes = Math.ceil((new Date(event.start).getTime() - now) / 60000);
            if (minutes >= 0 && minutes <= COUNTDOWN_WINDOW_MIN)
                return [event, minutes];
        }
        return null;
    }

    setMusic(state) {
        let available = !!(state && state.available && state.status !== 'Stopped');
        this._hasMusic = available;
        this._playing = available && state.status === 'Playing';
        if (available) {
            let style = coverStyle(state.art);
            this._cover.set_style(style);
            this._coverIcon.visible = !style;
        }
        this._sync();
    }

    // Levels of the sound being played, measured by the engine. While they
    // arrive, the wave bars follow the real music.
    setLevels(levels) {
        this._levels = levels;
        this._levelsAt = GLib.get_monotonic_time();
        if (this._active && this._music.visible && this._waves.visible)
            this._waves.queue_repaint();
    }

    setPomodoro(state) {
        this._pomodoro = state && state.active ? state : null;
        this._syncClock();
    }

    // Tools state: shows "keep awake" when no clock or event is taking the
    // spot.
    setAwake(state) {
        this._awake = state && state.awake ? state : null;
        if (this._awake)
            this._awakeLabel.text = this._awake.awake_remaining < 0 ? '∞' : formatRemaining(this._awake.awake_remaining);
        this._sync();
    }

    setTimer(state) {
        this._timer = state;
        this._syncClock();
    }

    // The clock on the left shows a single time, in this order of preference:
    // timer running or ringing, Pomodoro, stopwatch running.
    _syncClock() {
        let timer = this._timer;
        let pomodoro = this._pomodoro;
        let text = null, color = null, dim = false;
        if (timer && (timer.running || timer.ringing)) {
            text = formatLong(timer.remaining);
            color = timer.ringing ? COLORS.rose : COLORS.amber;
        } else if (pomodoro) {
            text = formatClock(pomodoro.remaining);
            color = phaseColor(pomodoro.phase);
            dim = !pomodoro.running;
        } else if (timer && timer.stopwatch_running) {
            text = formatLong(timer.stopwatch);
            color = COLORS.blue;
        }
        this._hasPomodoro = text !== null;
        if (text !== null) {
            this._clock.text = text;
            this._clock.set_style('color: ' + css(color) + ';');
            this._clock.opacity = dim ? 140 : 255;
        }
        this._sync();
    }

    flashVolume(state) {
        this._volume = state.muted ? 0 : Math.min(1, state.volume);
        this._volumeIcon.icon_name = volumeIcon(state.volume, state.muted);
        this._volumeBar.queue_repaint();
        if (this._flashTimer)
            GLib.source_remove(this._flashTimer);
        this._flashTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, VOLUME_FLASH_MS, () => {
            this._flashTimer = 0;
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
        this._sync();
    }

    // The island reports when it is collapsed (true) or open (false), so the
    // wave bars do not keep animating out of sight.
    setActive(active) {
        this._active = active;
        this._sync();
        this._nextNotice();
    }

    _sync() {
        let next = this._nextEvent();
        if (next) {
            let [event, minutes] = next;
            this._countdownLabel.text = minutes === 0 ? _("now") : _("%d min").replace('%d', minutes);
            // A single notice, at ten minutes to go.
            let key = event.start + event.title;
            if (minutes <= EVENT_NOTICE_MIN && !this._announcedEvents[key]) {
                this._announcedEvents[key] = true;
                this.showNotice({
                    icon: 'x-office-calendar-symbolic',
                    color: COLORS.blue,
                    text: event.title + ' · ' + (minutes === 0 ? _("now") : _("in %d min").replace('%d', minutes)),
                    tab: 'Agenda',
                });
            }
        }

        let flashing = this._flashTimer !== 0;
        let noticing = !flashing && !!this.currentNotice;
        this._volumeBox.visible = flashing;
        this._noticeBox.visible = noticing;
        let awake = !!this._awake && !this._hasPomodoro && !next;
        this._music.visible = !flashing && !noticing && (!!this._hasMusic || !!this._hasPomodoro || !!next || awake);
        this._clock.visible = !!this._hasPomodoro;
        this._countdown.visible = !!next && !this._hasPomodoro;
        this._awakeBox.visible = awake;
        this._cover.visible = !!this._hasMusic && !this._hasPomodoro && !next && !awake;
        let controls = this._hoverControls && !!this._hasMusic;
        this._waves.visible = !!this._hasMusic && !controls;
        this._playIcon.visible = controls;
        this._playIcon.icon_name = this._playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        // Is something happening that deserves to be seen even in hidden mode?
        this.busy = flashing || noticing;
        if (this._onChanged)
            this._onChanged();

        if (noticing !== this.wide) {
            this.wide = noticing;
            this._onWideChanged();
        }

        let animate = this._playing && this._active && this._music.visible;
        if (animate && !this._waveTimer) {
            this._waveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, WAVE_INTERVAL_MS, () => {
                this._waves.queue_repaint();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!animate && this._waveTimer) {
            GLib.source_remove(this._waveTimer);
            this._waveTimer = 0;
            this._waves.queue_repaint();
        }
    }

    // The wave bars follow the sound while the engine is measuring (one bar
    // per band, bass to treble). Without a recent measurement they go up and
    // down on their own, as decoration.
    _drawWaves(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let barWidth = 3;
        let gap = (width - WAVE_BARS * barWidth) / (WAVE_BARS - 1);
        let t = GLib.get_monotonic_time() / 1e6;

        let real = this._playing && this._levels &&
            GLib.get_monotonic_time() - this._levelsAt < LEVELS_STALE_US;

        cr.setSourceRGBA(1, 1, 1, 0.9);
        for (let i = 0; i < WAVE_BARS; i++) {
            let target;
            if (real)
                target = 0.2 + 0.8 * Math.pow(this._levels[i] || 0, 0.7);
            else if (this._playing)
                target = 0.35 + 0.65 * Math.abs(Math.sin(t * (3.1 + i * 0.9) + i * 1.7));
            else
                target = 0.25;
            // Rises fast and falls slowly, like a sound meter.
            let shown = this._shown[i];
            shown = target > shown ? lerpLevel(shown, target, 0.75) : lerpLevel(shown, target, 0.3);
            this._shown[i] = shown;
            let level = real ? shown : target;
            let h = Math.max(barWidth, height * level);
            let x = i * (barWidth + gap);
            let y = (height - h) / 2;
            let r = barWidth / 2;
            cr.newSubPath();
            cr.arc(x + r, y + r, r, Math.PI, 0);
            cr.arc(x + r, y + h - r, r, 0, Math.PI);
            cr.closePath();
            cr.fill();
        }
        cr.$dispose();
    }

    _drawVolume(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let thickness = 4;
        let y = Math.round((height - thickness) / 2);
        let r = thickness / 2;
        let bar = (w, alpha) => {
            if (w < thickness)
                return;
            cr.setSourceRGBA(1, 1, 1, alpha);
            cr.newSubPath();
            cr.arc(r, y + r, r, Math.PI / 2, Math.PI * 1.5);
            cr.arc(w - r, y + r, r, Math.PI * 1.5, Math.PI / 2);
            cr.closePath();
            cr.fill();
        };
        bar(width, 0.2);
        bar(width * this._volume, 0.9);
        cr.$dispose();
    }

    destroy() {
        if (this._waveTimer)
            GLib.source_remove(this._waveTimer);
        if (this._flashTimer)
            GLib.source_remove(this._flashTimer);
        for (let id of [this._noticeTimer, this._countdownTimer]) {
            if (id)
                GLib.source_remove(id);
        }
        this._waveTimer = this._flashTimer = this._noticeTimer = this._countdownTimer = 0;
    }
}

module.exports = { Collapsed };
