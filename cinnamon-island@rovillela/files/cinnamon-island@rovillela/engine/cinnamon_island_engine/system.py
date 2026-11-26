"""System tab: processor, memory, graphics card, disks, network and battery."""
import glob
import os
import shutil

from gi.repository import Gio, GLib

from .service import Service

INTERVAL_S = 2
# Processor temperature sensors, in order of preference.
CPU_SENSORS = ('k10temp', 'coretemp', 'zenpower', 'cpu_thermal', 'acpitz')
# How many readings the graphs keep (90 seconds, one every 2 s).
HISTORY = 45
# How many readings between disk checks (they change slowly).
DISKS_EVERY = 15
NVIDIA_QUERY = 'utilization.gpu,memory.used,memory.total,temperature.gpu,name'


def _read(path):
    try:
        with open(path) as file:
            return file.read()
    except OSError:
        return ''


class System(Service):
    INTERFACE = 'org.cinnamonisland.Engine.System'

    def __init__(self, connection):
        super().__init__(connection)
        self._cpu = None       # (busy, total) from the previous reading
        self._net = None       # (received, sent, instant) from the previous reading
        self._sensor = self._find_sensor()
        self._history = {'cpu': [], 'memory': [], 'gpu': [], 'download': []}
        self._ticks = 0
        self._disks = []
        self._gpu = None       # last reading of the graphics card
        self._nvidia = None
        self._start_nvidia()
        self._tick()
        GLib.timeout_add_seconds(INTERVAL_S, self._tick)

    @staticmethod
    def _find_sensor():
        sensors = {}
        for directory in glob.glob('/sys/class/hwmon/hwmon*'):
            path = os.path.join(directory, 'temp1_input')
            if os.path.exists(path):
                sensors[_read(os.path.join(directory, 'name')).strip()] = path
        for name in CPU_SENSORS:
            if name in sensors:
                return sensors[name]
        return None

    def _cpu_percent(self):
        fields = [int(v) for v in _read('/proc/stat').split('\n')[0].split()[1:]]
        if not fields:
            return 0
        idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
        current = (sum(fields) - idle, sum(fields))
        previous, self._cpu = self._cpu, current
        if not previous or current[1] == previous[1]:
            return 0
        return round(100 * (current[0] - previous[0]) / (current[1] - previous[1]))

    @staticmethod
    def _memory():
        info = {}
        for line in _read('/proc/meminfo').split('\n'):
            parts = line.split()
            if len(parts) >= 2:
                info[parts[0].rstrip(':')] = int(parts[1]) * 1024
        total = info.get('MemTotal', 0)
        return total - info.get('MemAvailable', 0), total

    def _network(self):
        """Bytes per second received and sent, adding up the real interfaces."""
        received = sent = 0
        for line in _read('/proc/net/dev').split('\n')[2:]:
            name, _, data = line.partition(':')
            fields = data.split()
            if name.strip() in ('', 'lo') or len(fields) < 9:
                continue
            received += int(fields[0])
            sent += int(fields[8])
        now = GLib.get_monotonic_time() / 1e6
        previous, self._net = self._net, (received, sent, now)
        if not previous or now <= previous[2]:
            return 0, 0
        elapsed = now - previous[2]
        return (max(0, round((received - previous[0]) / elapsed)),
                max(0, round((sent - previous[1]) / elapsed)))

    # --- graphics card -----------------------------------------------------

    def _start_nvidia(self):
        """Keeps one nvidia-smi running and printing a line per reading.

        Much lighter than starting the program again every 2 seconds.
        """
        if not shutil.which('nvidia-smi'):
            return
        try:
            self._nvidia = Gio.Subprocess.new(
                ['nvidia-smi', '--query-gpu=' + NVIDIA_QUERY, '--format=csv,noheader,nounits',
                 '-l', str(INTERVAL_S)],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE)
        except GLib.Error:
            self._nvidia = None
            return
        stream = Gio.DataInputStream.new(self._nvidia.get_stdout_pipe())
        stream.read_line_async(GLib.PRIORITY_DEFAULT, None, self._on_nvidia_line)

    def _on_nvidia_line(self, stream, result):
        try:
            line, length = stream.read_line_finish_utf8(result)
        except GLib.Error:
            line = None
        if line is None:
            # The program exited (driver reloaded, for instance): no reading.
            self._nvidia = None
            self._gpu = None
            return
        parts = [part.strip() for part in line.split(',')]
        try:
            self._gpu = {
                'usage': int(float(parts[0])),
                'memory_used': int(float(parts[1])) * 1024 * 1024,
                'memory_total': int(float(parts[2])) * 1024 * 1024,
                'temperature': int(float(parts[3])),
                'name': parts[4],
            }
        except (ValueError, IndexError):
            pass  # with several cards or "[N/A]" fields, the previous reading stays
        stream.read_line_async(GLib.PRIORITY_DEFAULT, None, self._on_nvidia_line)

    @staticmethod
    def _amd_gpu():
        """AMD cards report their usage straight in /sys."""
        for device in sorted(glob.glob('/sys/class/drm/card[0-9]*/device')):
            busy = _read(os.path.join(device, 'gpu_busy_percent')).strip()
            if not busy.isdigit():
                continue
            gpu = {'usage': int(busy), 'memory_used': 0, 'memory_total': 0, 'temperature': None, 'name': ''}
            used = _read(os.path.join(device, 'mem_info_vram_used')).strip()
            total = _read(os.path.join(device, 'mem_info_vram_total')).strip()
            if used.isdigit() and total.isdigit():
                gpu['memory_used'], gpu['memory_total'] = int(used), int(total)
            for path in glob.glob(os.path.join(device, 'hwmon/hwmon*/temp1_input')):
                value = _read(path).strip()
                if value.isdigit():
                    gpu['temperature'] = round(int(value) / 1000)
            return gpu
        return None

    # --- disks and battery ---------------------------------------------------

    @staticmethod
    def _read_disks():
        """The physical disks of the machine (SSD, HDD, USB stick), one per row.

        Used space is only known for mounted partitions: without mounting, the
        system cannot tell how full a partition is. A disk with no mounted
        partition comes with `mounted` false.
        """
        # Mounted partitions: device -> folder. Only /dev/…, so network and
        # cloud folders (which can stall the query) are left out.
        mounts = {}
        for line in _read('/proc/mounts').split('\n'):
            parts = line.split()
            if len(parts) >= 2 and parts[0].startswith('/dev/'):
                mounts.setdefault(os.path.basename(os.path.realpath(parts[0])), parts[1].replace('\\040', ' '))
        disks = []
        for block in sorted(glob.glob('/sys/block/*')):
            name = os.path.basename(block)
            if name.startswith(('loop', 'ram', 'zram', 'dm-', 'md', 'sr', 'nbd')):
                continue
            sectors = _read(os.path.join(block, 'size')).strip()
            if not sectors.isdigit() or int(sectors) == 0:
                continue
            if _read(os.path.join(block, 'removable')).strip() == '1':
                kind = 'usb'
            else:
                kind = 'hdd' if _read(os.path.join(block, 'queue/rotational')).strip() == '1' else 'ssd'
            disk = {'device': name, 'kind': kind, 'size': int(sectors) * 512,
                    'mounted': False, 'system': False, 'total': 0, 'used': 0, 'free': 0}
            # The whole disk or any of its partitions.
            parts = [name] + [os.path.basename(path) for path in glob.glob(os.path.join(block, name + '*'))]
            for part in parts:
                mount = mounts.get(part)
                # The boot partition is tiny and would only confuse.
                if not mount or mount.startswith('/boot'):
                    continue
                try:
                    stat = os.statvfs(mount)
                except OSError:
                    continue
                total = stat.f_blocks * stat.f_frsize
                if total <= 0:
                    continue
                disk['mounted'] = True
                disk['system'] = disk['system'] or mount == '/'
                disk['total'] += total
                disk['used'] += total - stat.f_bfree * stat.f_frsize
                disk['free'] += stat.f_bavail * stat.f_frsize
            disks.append(disk)
        # The system disk first.
        disks.sort(key=lambda disk: not disk['system'])
        return disks[:3]

    @staticmethod
    def _battery():
        for directory in sorted(glob.glob('/sys/class/power_supply/BAT*')):
            capacity = _read(os.path.join(directory, 'capacity')).strip()
            if not capacity.isdigit():
                continue
            status = _read(os.path.join(directory, 'status')).strip().lower()
            battery = {'percent': int(capacity), 'status': status, 'minutes': None}
            # Time left: energy (or charge) divided by the current draw.
            for now, full, rate in (('energy_now', 'energy_full', 'power_now'),
                                    ('charge_now', 'charge_full', 'current_now')):
                values = [_read(os.path.join(directory, name)).strip() for name in (now, full, rate)]
                if all(value.lstrip('-').isdigit() for value in values):
                    current, maximum, flow = (abs(int(value)) for value in values)
                    if flow > 0 and status == 'discharging':
                        battery['minutes'] = round(60 * current / flow)
                    elif flow > 0 and status == 'charging':
                        battery['minutes'] = round(60 * max(0, maximum - current) / flow)
                    break
            return battery
        return None

    def _remember(self, key, value):
        history = self._history[key]
        history.append(value)
        del history[:-HISTORY]

    def _tick(self):
        used, total = self._memory()
        down, up = self._network()
        temperature = None
        if self._sensor:
            try:
                temperature = round(int(_read(self._sensor)) / 1000)
            except ValueError:
                pass
        cpu = self._cpu_percent()
        gpu = self._gpu if self._nvidia else self._amd_gpu()
        if self._ticks % DISKS_EVERY == 0:
            self._disks = self._read_disks()
        self._ticks += 1
        self._remember('cpu', cpu)
        self._remember('memory', round(100 * used / total) if total else 0)
        self._remember('download', down)
        if gpu:
            self._remember('gpu', gpu['usage'])
        self.set_state({
            'cpu': cpu,
            'gpu': gpu,
            'disks': self._disks,
            'battery': self._battery(),
            'history': {key: list(values) for key, values in self._history.items()},
            'memory_used': used,
            'memory_total': total,
            'temperature': temperature,
            'download': down,
            'upload': up,
        })
        return GLib.SOURCE_CONTINUE
