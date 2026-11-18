"""Timer and stopwatch, which share the tab with the Pomodoro."""
from gi.repository import GLib

from .service import Service

# After the timer ends, the sound repeats until the person dismisses it, for at
# most this long.
RING_INTERVAL_S = 15
RING_LIMIT_S = 300
MAX_MINUTES = 600


class Timer(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Timer'
    METHODS = {
        'SetMinutes': 'd',
        'Start': '',
        'Pause': '',
        'Reset': '',
        'StopwatchStart': '',
        'StopwatchPause': '',
        'StopwatchReset': '',
    }

    def __init__(self, connection, play_sound):
        super().__init__(connection)
        self._play_sound = play_sound
        self._duration = 5 * 60      # seconds chosen
        self._remaining = self._duration
        self._end = 0                # monotonic clock at the end, while running
        self._running = False
        self._ringing = False
        self._rings = 0              # goes up by 1 when time is up; front ends flash
        self._ring_until = 0
        self._ring_timer = 0
        self._sw_running = False
        self._sw_elapsed = 0.0       # seconds accumulated while stopped
        self._sw_start = 0           # monotonic clock of when it resumed
        self._ticking = False
        self._publish()

    # --- clock -------------------------------------------------------------

    @staticmethod
    def _now():
        return GLib.get_monotonic_time() / 1e6

    def _left(self):
        if self._running:
            return max(0, int(round(self._end - self._now())))
        return self._remaining

    def _stopwatch(self):
        elapsed = self._sw_elapsed
        if self._sw_running:
            elapsed += self._now() - self._sw_start
        return int(elapsed)

    def _ensure_tick(self):
        if not self._ticking and (self._running or self._sw_running):
            self._ticking = True
            GLib.timeout_add(250, self._on_tick)

    def _on_tick(self):
        if self._running and self._now() >= self._end:
            self._finish()
        self._publish()
        if self._running or self._sw_running:
            return GLib.SOURCE_CONTINUE
        self._ticking = False
        return GLib.SOURCE_REMOVE

    def _finish(self):
        self._running = False
        self._remaining = 0
        self._ringing = True
        self._rings += 1
        self._ring_until = self._now() + RING_LIMIT_S
        self._play_sound()
        if not self._ring_timer:
            self._ring_timer = GLib.timeout_add_seconds(RING_INTERVAL_S, self._on_ring)

    def _on_ring(self):
        if not self._ringing or self._now() >= self._ring_until:
            self._stop_ringing()
            self._publish()
            return GLib.SOURCE_REMOVE
        self._play_sound()
        return GLib.SOURCE_CONTINUE

    def _stop_ringing(self):
        self._ringing = False
        if self._ring_timer:
            GLib.source_remove(self._ring_timer)
            self._ring_timer = 0
        if self._remaining == 0:
            self._remaining = self._duration

    def _publish(self):
        self.set_state({
            'duration': self._duration,
            'remaining': self._left(),
            'running': self._running,
            'ringing': self._ringing,
            'rings': self._rings,
            'stopwatch': self._stopwatch(),
            'stopwatch_running': self._sw_running,
        })

    # --- commands ----------------------------------------------------------

    def do_SetMinutes(self, minutes):
        """Sets the duration; only allowed while the timer is stopped."""
        if self._running:
            return
        self._stop_ringing()
        self._duration = int(round(max(1 / 60, min(MAX_MINUTES, minutes)) * 60))
        self._remaining = self._duration
        self._publish()

    def do_Start(self):
        if self._running:
            return
        self._stop_ringing()
        self._end = self._now() + self._remaining
        self._running = True
        self._ensure_tick()
        self._publish()

    def do_Pause(self):
        if self._running:
            self._remaining = self._left()
            self._running = False
        self._publish()

    def do_Reset(self):
        """Goes back to the chosen time; also dismisses the end alert."""
        self._running = False
        self._ringing = False
        self._stop_ringing()
        self._remaining = self._duration
        self._publish()

    def do_StopwatchStart(self):
        if not self._sw_running:
            self._sw_start = self._now()
            self._sw_running = True
            self._ensure_tick()
        self._publish()

    def do_StopwatchPause(self):
        if self._sw_running:
            self._sw_elapsed += self._now() - self._sw_start
            self._sw_running = False
        self._publish()

    def do_StopwatchReset(self):
        self._sw_running = False
        self._sw_elapsed = 0.0
        self._publish()
