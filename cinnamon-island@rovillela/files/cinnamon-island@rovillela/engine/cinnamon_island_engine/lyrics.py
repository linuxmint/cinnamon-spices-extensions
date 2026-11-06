"""Synced lyrics of the song that is playing, from LRCLIB (lrclib.net).

The lookup sends the title, artist, album and length of the song to a service
on the internet; so it only happens after the person turns the option on, and
never for what plays in browsers (video titles are not songs and must not leave
the machine).
"""
import hashlib
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

from gi.repository import GLib

from .net import download
from .service import Service

MAX_DOWNLOAD = 2 * 1024 * 1024

API = 'https://lrclib.net/api/'
CACHE = os.path.join(GLib.get_user_cache_dir(), 'cinnamon-island', 'lyrics')
CONFIG_FILE = os.path.join(GLib.get_user_config_dir(), 'cinnamon-island', 'lyrics.json')
LINE = re.compile(r'\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)')


def parse_lrc(text):
    """Converts lyrics in LRC format into [[milliseconds, text], ...]."""
    lines = []
    for raw in (text or '').split('\n'):
        match = LINE.match(raw.strip())
        if match:
            ms = int((int(match.group(1)) * 60 + float(match.group(2))) * 1000)
            lines.append([ms, match.group(3).strip()])
    lines.sort(key=lambda line: line[0])
    return lines


def _get(path, params):
    url = API + path + '?' + urllib.parse.urlencode(params)
    return json.loads(download(url, MAX_DOWNLOAD).decode('utf-8', 'replace'))


def fetch_lyrics(title, artist, album, seconds):
    """Returns the synced lines of the song, or [] if there are none."""
    params = {'track_name': title, 'artist_name': artist}
    exact = dict(params)
    if album:
        exact['album_name'] = album
    if seconds:
        exact['duration'] = seconds
    try:
        lines = parse_lrc(_get('get', exact).get('syncedLyrics'))
        if lines:
            return lines
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    # No exact match (different album or length): try the open search.
    for result in _get('search', params)[:5]:
        lines = parse_lrc(result.get('syncedLyrics'))
        if lines:
            return lines
    return []


class Lyrics(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Lyrics'
    METHODS = {'SetEnabled': 'b'}

    def __init__(self, connection):
        super().__init__(connection)
        self._enabled = False
        try:
            with open(CONFIG_FILE) as file:
                self._enabled = bool(json.load(file).get('enabled'))
        except (OSError, ValueError):
            pass
        self._track = None   # (title, artist, album, seconds) or None
        self._status = 'idle'
        self._lines = []
        self._publish()

    def _publish(self):
        self.set_state({
            'enabled': self._enabled,
            # idle: nothing playing that has lyrics; loading; ok; none; error
            'status': self._status,
            'lines': self._lines,
        })

    def set_track(self, track):
        """The Music tab reports the current song (or None)."""
        if track == self._track:
            return
        self._track = track
        self._load()

    def _load(self):
        track = self._track
        self._lines = []
        if not track or not self._enabled:
            self._status = 'idle'
            self._publish()
            return
        cache = os.path.join(CACHE, hashlib.sha1('\x1f'.join(map(str, track)).encode()).hexdigest() + '.json')
        try:
            with open(cache) as file:
                self._lines = json.load(file)
            self._status = 'ok' if self._lines else 'none'
            self._publish()
            return
        except (OSError, ValueError):
            pass
        self._status = 'loading'
        self._publish()

        def work():
            try:
                lines = fetch_lyrics(*track)
            except Exception:
                lines = None
            GLib.idle_add(done, lines)

        def done(lines):
            if track != self._track:
                return False
            if lines is None:
                self._status = 'error'
            else:
                self._lines = lines
                self._status = 'ok' if lines else 'none'
                try:
                    os.makedirs(CACHE, exist_ok=True)
                    with open(cache, 'w') as file:
                        json.dump(lines, file)
                except OSError:
                    pass
            self._publish()
            return False
        threading.Thread(target=work, daemon=True).start()

    def do_SetEnabled(self, enabled):
        if enabled == self._enabled:
            return
        self._enabled = enabled
        try:
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            with open(CONFIG_FILE, 'w') as file:
                json.dump({'enabled': enabled}, file)
        except OSError:
            pass
        self._load()
