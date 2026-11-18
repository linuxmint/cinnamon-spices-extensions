"""Volume tab: audio output, devices and microphone, through pactl.

pactl works with both PipeWire (pipewire-pulse) and PulseAudio. The text output
is parsed instead of the JSON one because the JSON of pactl 16 breaks on
accented device names.
"""
import os
import re
import subprocess

from gi.repository import Gio, GLib

from .service import Service

ENV = dict(os.environ, LC_ALL='C')
REFRESH_DELAY_MS = 40


def _pactl(*args):
    try:
        return subprocess.run(
            ('pactl',) + args, env=ENV, capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return ''


def _classify(field, prop, block):
    """Kind of output (for the icon) and a short name to show on the island.

    Kinds: 'display' (HDMI/DisplayPort), 'headphones', 'digital' (the card's
    S/PDIF) and 'speakers'. The short name is empty when the device has no
    useful name of its own; the front end then shows a generic name for the
    kind.
    """
    port = re.search(r'^\t\t%s: .*\(type: (\w+)' % re.escape(field('Active Port')), block, re.M)
    port_type = port.group(1) if port else ''
    device = prop('device.description') or field('Description')
    bus = prop('device.bus')
    hints = ' '.join((device, prop('device.nick'), prop('device.form_factor'), port_type)).lower()

    if port_type == 'HDMI' or 'hdmi' in prop('device.profile.name'):
        # On HDMI, alsa.name is usually the name of the monitor or TV.
        return 'display', prop('node.nick') or prop('alsa.name') or device
    if bus == 'bluetooth' or re.search(r'head(set|phone)|earphone|earbud|surround', hints):
        return 'headphones', device
    if bus == 'usb':
        return 'speakers', device
    if port_type == 'SPDIF' or 'iec958' in prop('device.profile.name'):
        return 'digital', ''
    return 'speakers', ''


def _parse_devices(text):
    """Parses the output of `pactl list sinks|sources` into a list of devices."""
    devices = []
    for block in re.split(r'^(?:Sink|Source) #\d+\n', text, flags=re.M)[1:]:
        def field(name):
            match = re.search(r'^\t%s: (.*)$' % name, block, re.M)
            return match.group(1).strip() if match else ''
        def prop(name):
            match = re.search(r'^\t\t%s = "(.*)"$' % re.escape(name), block, re.M)
            return match.group(1) if match else ''

        percents = [int(p) for p in re.findall(r'(\d+)%', field('Volume'))]
        kind, short = _classify(field, prop, block)
        devices.append({
            'name': field('Name'),
            'description': field('Description'),
            'kind': kind,
            'short': short,
            'muted': field('Mute') == 'yes',
            'volume': (sum(percents) / len(percents) / 100) if percents else 0,
            'monitor': field('Monitor of Sink') not in ('', 'n/a'),
        })
    return devices


HIDDEN_APPS = ('speech-dispatcher',)

# Above 100% the sound is boosted (and may distort); the limit applies to the
# volume of each application.
MAX_APP_VOLUME = 1.5


def _parse_apps(text):
    """Parses the output of `pactl list sink-inputs`: one item per program
    playing.
    """
    apps = []
    for match in re.finditer(r'^Sink Input #(\d+)\n(.*?)(?=^Sink Input #|\Z)', text, re.M | re.S):
        block = match.group(2)

        def field(name):
            found = re.search(r'^\t%s: (.*)$' % name, block, re.M)
            return found.group(1).strip() if found else ''

        def prop(name):
            found = re.search(r'^\t\t%s = "(.*)"$' % re.escape(name), block, re.M)
            return found.group(1) if found else ''

        percents = [int(p) for p in re.findall(r'(\d+)%', field('Volume'))]
        binary = prop('application.process.binary')
        name = prop('application.name') or binary or prop('media.name') or prop('node.name')
        # System services that open a sound channel without playing anything.
        if name.lower().startswith(HIDDEN_APPS):
            continue
        apps.append({
            'id': int(match.group(1)),
            'name': name,
            'icon': prop('application.icon_name') or binary or prop('node.name'),
            'muted': field('Mute') == 'yes',
            'volume': (sum(percents) / len(percents) / 100) if percents else 0,
        })
    return apps


class Volume(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Volume'
    METHODS = {
        'SetVolume': 'd',
        'SetMuted': 'b',
        'SetOutput': 's',
        'SetMicVolume': 'd',
        'SetMicMuted': 'b',
        'SetAppVolume': 'ud',
        'SetAppMuted': 'ub',
        'ToggleMicMute': '',
        'NextOutput': '',
    }

    def __init__(self, connection):
        super().__init__(connection)
        self._refresh_id = 0
        self._subscribe()
        self._refresh()

    def _subscribe(self):
        """`pactl subscribe` prints a line for every change in the sound server."""
        launcher = Gio.SubprocessLauncher.new(Gio.SubprocessFlags.STDOUT_PIPE)
        launcher.setenv('LC_ALL', 'C', True)
        try:
            self._subscriber = launcher.spawnv(['pactl', 'subscribe'])
        except GLib.Error:
            self._subscriber = None
            return
        self._events = Gio.DataInputStream.new(self._subscriber.get_stdout_pipe())
        self._events.read_line_async(GLib.PRIORITY_DEFAULT, None, self._on_event)

    def _on_event(self, stream, result):
        line, length = stream.read_line_finish_utf8(result)
        if line is None:
            # The sound server crashed or restarted: try again shortly.
            GLib.timeout_add_seconds(2, lambda: self._subscribe() or self._queue_refresh() or False)
            return
        if re.search(r" on (sink|source|sink-input|server|card) #", line):
            self._queue_refresh()
        stream.read_line_async(GLib.PRIORITY_DEFAULT, None, self._on_event)

    def _queue_refresh(self):
        # One volume change produces several events in a row; merge them into
        # one.
        if not self._refresh_id:
            self._refresh_id = GLib.timeout_add(REFRESH_DELAY_MS, self._refresh)

    def _refresh(self):
        self._refresh_id = 0
        info = _pactl('info')

        def default(kind):
            match = re.search(r'^Default %s: (.*)$' % kind, info, re.M)
            return match.group(1).strip() if match else ''

        sinks = _parse_devices(_pactl('list', 'sinks'))
        sources = [s for s in _parse_devices(_pactl('list', 'sources')) if not s['monitor']]
        output = next((s for s in sinks if s['name'] == default('Sink')), None)
        mic = next((s for s in sources if s['name'] == default('Source')), None)

        self.set_state({
            'available': output is not None,
            'volume': output['volume'] if output else 0,
            'muted': output['muted'] if output else False,
            'output': output['name'] if output else '',
            'outputs': [
                {'name': s['name'], 'description': s['description'], 'kind': s['kind'], 'short': s['short']}
                for s in sinks],
            'mic_available': mic is not None,
            'mic_volume': mic['volume'] if mic else 0,
            'mic_muted': mic['muted'] if mic else False,
            'mic_description': mic['description'] if mic else '',
            'apps': _parse_apps(_pactl('list', 'sink-inputs')),
            'max_app_volume': MAX_APP_VOLUME,
        })
        return GLib.SOURCE_REMOVE

    def _run(self, *args):
        try:
            Gio.Subprocess.new(('pactl',) + args, Gio.SubprocessFlags.NONE)
        except GLib.Error:
            pass

    @staticmethod
    def _percent(value):
        return '%d%%' % round(max(0.0, min(1.0, value)) * 100)

    def do_SetVolume(self, value):
        self._run('set-sink-volume', '@DEFAULT_SINK@', self._percent(value))

    def do_SetMuted(self, muted):
        self._run('set-sink-mute', '@DEFAULT_SINK@', '1' if muted else '0')

    def do_SetOutput(self, name):
        if any(o['name'] == name for o in self._state.get('outputs', [])):
            self._run('set-default-sink', name)

    def do_SetMicVolume(self, value):
        self._run('set-source-volume', '@DEFAULT_SOURCE@', self._percent(value))

    def do_SetMicMuted(self, muted):
        self._run('set-source-mute', '@DEFAULT_SOURCE@', '1' if muted else '0')

    def do_SetAppVolume(self, app_id, value):
        percent = '%d%%' % round(max(0.0, min(MAX_APP_VOLUME, value)) * 100)
        self._run('set-sink-input-volume', str(app_id), percent)

    def do_SetAppMuted(self, app_id, muted):
        self._run('set-sink-input-mute', str(app_id), '1' if muted else '0')

    def do_ToggleMicMute(self):
        self._run('set-source-mute', '@DEFAULT_SOURCE@', 'toggle')

    def do_NextOutput(self):
        """Moves to the next audio output, wrapping around at the end."""
        names = [o['name'] for o in self._state.get('outputs', [])]
        if len(names) < 2:
            return
        current = self._state.get('output')
        index = names.index(current) if current in names else -1
        self._run('set-default-sink', names[(index + 1) % len(names)])
