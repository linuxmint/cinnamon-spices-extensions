"""Levels of the sound being played, for the wave bars of the island.

Records what goes to the default audio output (its "monitor") with `parec`, in
low quality, and computes the strength of four frequency bands, from bass to
treble. Nothing is stored or leaves the machine: of each little chunk of sound
only four numbers remain.
"""
import array
import cmath
import math

from gi.repository import Gio, GLib

RATE = 8000        # samples per second; enough to tell bass from treble
WINDOW = 512       # samples per measurement: about 16 measurements per second
# Limits of the four bands, in Hz.
BANDS = ((60, 250), (250, 700), (700, 1800), (1800, 3900))
# How much of the recent peak each band "forgets" per measurement; levels are
# relative to that peak, so the bars move with loud or quiet sound.
PEAK_DECAY = 0.985
SILENCE = 40.0


def _fft(values):
    """A simple Fourier transform (the size must be a power of 2)."""
    n = len(values)
    if n == 1:
        return values
    even = _fft(values[0::2])
    odd = _fft(values[1::2])
    result = [0] * n
    for k in range(n // 2):
        twist = cmath.exp(-2j * math.pi * k / n) * odd[k]
        result[k] = even[k] + twist
        result[k + n // 2] = even[k] - twist
    return result


_HANN = [0.5 - 0.5 * math.cos(2 * math.pi * i / (WINDOW - 1)) for i in range(WINDOW)]


def band_levels(samples):
    """Strength of each band in a block of WINDOW samples (raw values)."""
    spectrum = _fft([s * w for s, w in zip(samples, _HANN)])
    levels = []
    for low, high in BANDS:
        first = max(1, int(low * WINDOW / RATE))
        last = min(WINDOW // 2, int(high * WINDOW / RATE))
        power = sum(abs(spectrum[i]) ** 2 for i in range(first, last))
        levels.append(math.sqrt(power / max(1, last - first)) / WINDOW)
    return levels


class Spectrum:
    """Starts and stops the capture; calls `on_levels` with four levels from 0 to
    1.
    """

    def __init__(self, on_levels):
        self._on_levels = on_levels
        self._process = None
        self._buffer = b''
        self._peaks = [SILENCE] * len(BANDS)

    @property
    def running(self):
        return self._process is not None

    def start(self):
        if self._process:
            return
        try:
            self._process = Gio.Subprocess.new(
                ['parec', '--device=@DEFAULT_MONITOR@', '--format=s16le', '--rate=%d' % RATE,
                 '--channels=1', '--latency-msec=40', '--client-name=Cinnamon Island'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
        except GLib.Error:
            self._process = None
            return
        self._buffer = b''
        self._read(self._process)

    def stop(self):
        if self._process:
            self._process.force_exit()
            self._process = None

    def _read(self, process):
        process.get_stdout_pipe().read_bytes_async(
            WINDOW * 2, GLib.PRIORITY_DEFAULT, None, self._on_bytes, process)

    def _on_bytes(self, stream, result, process):
        try:
            data = stream.read_bytes_finish(result).get_data()
        except GLib.Error:
            data = b''
        if process is not self._process:
            return  # the capture was stopped while this read was waiting
        if not data:
            self._process = None
            return
        self._buffer += data
        size = WINDOW * 2
        while len(self._buffer) >= size:
            block, self._buffer = self._buffer[:size], self._buffer[size:]
            # If measurements fall behind, only the most recent one matters.
            if len(self._buffer) < size:
                samples = array.array('h')
                samples.frombytes(block)
                self._emit(band_levels(samples))
        self._read(process)

    def _emit(self, raw):
        levels = []
        for i, value in enumerate(raw):
            self._peaks[i] = max(value, self._peaks[i] * PEAK_DECAY, SILENCE)
            levels.append(round(min(1.0, value / self._peaks[i]), 3))
        self._on_levels(levels)
