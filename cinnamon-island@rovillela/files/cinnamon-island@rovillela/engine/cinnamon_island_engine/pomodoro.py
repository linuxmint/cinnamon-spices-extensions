"""Pomodoro tab: focus and break cycles, current task and statistics."""
import datetime
import json
import os
import time

from gi.repository import Gio, GLib

from .service import Service

CONFIG_FILE = os.path.join(GLib.get_user_config_dir(), 'cinnamon-island', 'pomodoro.json')
DATA_FILE = os.path.join(GLib.get_user_data_dir(), 'cinnamon-island', 'pomodoro.json')
# The cycle in progress, so the engine can resume it after a restart.
SESSION_FILE = os.path.join(GLib.get_user_data_dir(), 'cinnamon-island', 'pomodoro-session.json')

DEFAULT_CONFIG = {
    'focus_minutes': 25,
    'short_break_minutes': 5,
    'long_break_minutes': 15,
    'cycles': 4,  # focus rounds until the long break
    'pause_music': True,
    'sound': True,
    'sound_file': '/usr/share/sounds/freedesktop/stereo/complete.oga',
    'sound_repeat': 3,  # how many times in a row the sound plays
}

FOCUS, SHORT_BREAK, LONG_BREAK = 'focus', 'short_break', 'long_break'


def _load(path, default):
    try:
        with open(path) as file:
            data = json.load(file)
        return data if isinstance(data, dict) else default
    except (OSError, ValueError):
        return default


def _save(path, data):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path + '.tmp', 'w') as file:
            json.dump(data, file, indent=2)
        os.replace(path + '.tmp', path)
    except OSError:
        pass


class Pomodoro(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Pomodoro'
    METHODS = {'Start': '', 'Pause': '', 'Reset': '', 'Skip': '', 'SetTask': 's', 'Configure': 's'}

    def __init__(self, connection, music):
        super().__init__(connection)
        self._music = music
        self._config = dict(DEFAULT_CONFIG, **_load(CONFIG_FILE, {}))
        self._data = _load(DATA_FILE, {})
        self._data.setdefault('days', {})
        self._data.setdefault('task', '')

        self._phase = FOCUS
        self._active = False     # there is a session in progress (even if paused)
        self._running = False
        self._remaining = self._duration(FOCUS)  # seconds, while stopped
        self._end = 0            # monotonic clock at the end of the phase, while running
        self._cycle = 0          # focus rounds completed since the last long break
        self._alert = 0          # goes up by 1 at the end of each phase; front ends flash when it changes
        self._paused_music = False
        self._generation = 0
        self._end_wall = 0       # wall clock (time.time) at the end of the phase, while running
        self._session = None     # what is written in SESSION_FILE
        self._restore_session()
        self._publish()

    # --- saved session
    # ---------------------------------------------------------

    def _restore_session(self):
        """Resumes the cycle that was in progress when the engine stopped."""
        session = _load(SESSION_FILE, {})
        if not session.get('active') or session.get('phase') not in (FOCUS, SHORT_BREAK, LONG_BREAK):
            return
        self._session = session
        self._phase = session['phase']
        self._active = True
        self._cycle = int(session.get('cycle', 0))
        self._paused_music = bool(session.get('paused_music', False))
        if session.get('running'):
            # Time kept running while the engine was stopped; if the phase
            # ended in the meantime, it finishes as soon as the engine is back.
            self._remaining = max(1, int(round(float(session.get('end', 0)) - time.time())))
            self._set_running(True)
        else:
            self._remaining = max(1, int(session.get('remaining', self._duration(self._phase))))

    def _save_session(self):
        """Writes the cycle in progress, only when something actually changed."""
        session = {
            'active': self._active,
            'phase': self._phase,
            'running': self._running,
            'cycle': self._cycle,
            'paused_music': self._paused_music,
            'remaining': None if self._running else self._remaining,
            'end': self._end_wall if self._running else None,
        }
        if session != self._session:
            self._session = session
            _save(SESSION_FILE, session)

    # --- clock -------------------------------------------------------------

    def _duration(self, phase):
        minutes = self._config[phase + '_minutes']
        return max(1, int(round(float(minutes) * 60)))

    def _left(self):
        if self._running:
            return max(0, int(round((self._end - GLib.get_monotonic_time()) / 1e6)))
        return self._remaining

    def _set_running(self, running):
        if running == self._running:
            return
        # Every time the clock starts or stops, the generation changes; a tick
        # from an old generation ends itself.
        self._generation += 1
        if running:
            self._end = GLib.get_monotonic_time() + self._remaining * 1e6
            self._end_wall = round(time.time() + self._remaining)
            GLib.timeout_add(250, self._on_tick, self._generation)
        else:
            self._remaining = self._left()
        self._running = running

    def _on_tick(self, generation):
        if generation != self._generation:
            return GLib.SOURCE_REMOVE
        if GLib.get_monotonic_time() >= self._end:
            self._finish_phase(completed=True)
            return GLib.SOURCE_REMOVE
        self._publish()
        return GLib.SOURCE_CONTINUE

    def _finish_phase(self, completed):
        """Moves on to the next phase. `completed` is false when the person
        skipped.
        """
        was_focus = self._phase == FOCUS
        self._set_running(False)

        if was_focus:
            if completed:
                today = datetime.date.today().isoformat()
                self._data['days'][today] = self._data['days'].get(today, 0) + 1
                _save(DATA_FILE, self._data)
            self._cycle += 1
            self._phase = LONG_BREAK if self._cycle >= int(self._config['cycles']) else SHORT_BREAK
        else:
            if self._phase == LONG_BREAK:
                self._cycle = 0
            self._phase = FOCUS
        self._remaining = self._duration(self._phase)

        if completed:
            self._alert += 1
            self._play_sound()
            if was_focus and self._config['pause_music']:
                self._paused_music = self._music.pause_if_playing() or self._paused_music

        # The break starts by itself; the next focus round waits for the person
        # to start it.
        if was_focus:
            self._set_running(True)
        self._publish()

    def play_sound(self):
        """The alert sound, with the Pomodoro preferences; the timer uses it too."""
        self._play_sound()

    def _play_sound(self):
        path = self._config.get('sound_file')
        if not self._config['sound'] or not path or not os.path.exists(path):
            return
        self._play_times(path, max(1, min(10, int(self._config['sound_repeat']))))

    def _play_times(self, path, times):
        """Plays the sound `times` times, one after the other."""
        try:
            player = Gio.Subprocess.new(['paplay', path], Gio.SubprocessFlags.NONE)
        except GLib.Error:
            return
        if times > 1:
            player.wait_async(None, lambda *a: self._play_times(path, times - 1))

    # --- state -------------------------------------------------------------

    def _publish(self):
        self._save_session()
        today = datetime.date.today()
        week = today.isocalendar()[:2]
        days = self._data['days']
        week_total = 0
        for day, count in days.items():
            try:
                if datetime.date.fromisoformat(day).isocalendar()[:2] == week:
                    week_total += count
            except ValueError:
                pass
        self.set_state({
            'phase': self._phase,
            'active': self._active,
            'running': self._running,
            'remaining': self._left(),
            'duration': self._duration(self._phase),
            'cycle': self._cycle,
            'cycles': int(self._config['cycles']),
            'task': self._data['task'],
            'today': days.get(today.isoformat(), 0),
            'week': week_total,
            'alert': self._alert,
        })

    # --- commands ----------------------------------------------------------

    def do_Start(self):
        self._active = True
        if self._phase == FOCUS and self._paused_music:
            self._paused_music = False
            self._music.play()
        self._set_running(True)
        self._publish()

    def do_Pause(self):
        self._set_running(False)
        self._publish()

    def do_Reset(self):
        self._set_running(False)
        self._active = False
        self._phase = FOCUS
        self._cycle = 0
        self._paused_music = False
        self._remaining = self._duration(FOCUS)
        self._publish()

    def do_Skip(self):
        self._active = True
        self._finish_phase(completed=False)

    def do_SetTask(self, task):
        self._data['task'] = task.strip()
        _save(DATA_FILE, self._data)
        self._publish()

    def do_Configure(self, text):
        """Receives the preferences as JSON; only known keys are accepted."""
        changes = json.loads(text)
        before = self._duration(self._phase)
        for key, value in changes.items():
            if key in DEFAULT_CONFIG and isinstance(value, type(DEFAULT_CONFIG[key])) or (
                    key.endswith('_minutes') and isinstance(value, (int, float))):
                self._config[key] = value
        _save(CONFIG_FILE, self._config)
        # If the length of the current phase changed, the time left changes
        # with it, even with the clock running.
        delta = self._duration(self._phase) - before
        if delta:
            if self._running:
                self._end = max(self._end + delta * 1e6, GLib.get_monotonic_time() + 1e6)
                self._end_wall = round(time.time() + (self._end - GLib.get_monotonic_time()) / 1e6)
            else:
                self._remaining = max(1, self._remaining + delta)
        self._publish()
