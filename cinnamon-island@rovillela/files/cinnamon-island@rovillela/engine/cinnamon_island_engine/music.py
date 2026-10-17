"""Music tab: follows the MPRIS players and controls the one in use."""
import hashlib
import json
import os
import threading
import urllib.parse
import urllib.request

from gi.repository import Gio, GLib

from .spectrum import Spectrum
from .net import download
from .service import Service

# Size cap for a downloaded album cover.
MAX_ART = 8 * 1024 * 1024

MPRIS_PREFIX = 'org.mpris.MediaPlayer2.'
MPRIS_PATH = '/org/mpris/MediaPlayer2'
PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player'
ROOT_IFACE = 'org.mpris.MediaPlayer2'
PROPS_IFACE = 'org.freedesktop.DBus.Properties'
TRACKLIST_IFACE = 'org.mpris.MediaPlayer2.TrackList'
# Browsers: what plays in them is video, not music; lyrics are not looked up.
BROWSERS = ('firefox', 'chrom', 'brave', 'edge', 'opera', 'vivaldi', 'plasma-browser')

ART_CACHE = os.path.join(GLib.get_user_cache_dir(), 'cinnamon-island', 'covers')
# The last song played on Spotify, to offer "resume" when no player is open.
LAST_FILE = os.path.join(GLib.get_user_data_dir(), 'cinnamon-island', 'last_track.json')
SPOTIFY_NAME = MPRIS_PREFIX + 'spotify'
# After a resume request, how long the engine waits for Spotify to open, and
# how often it repeats "play" (right after opening, Spotify is still loading
# and may ignore the first request).
RESUME_WAIT_S = 30
RESUME_RETRY_S = 2
POSITION_INTERVAL_S = 1


class Player:
    def __init__(self, name, owner):
        self.name = name
        self.owner = owner
        self.props = {}
        self.identity = name[len(MPRIS_PREFIX):].split('.')[0]
        self.has_tracklist = False
        self.position = 0
        # Order in which each player started playing; the highest is the most
        # recent.
        self.last_active = 0


class Music(Service):
    INTERFACE = 'org.cinnamonisland.Engine.Music'
    METHODS = {'PlayPause': '', 'Next': '', 'Previous': '', 'Seek': 'x', 'SelectPlayer': 's',
               'ResumeWhenReady': '', 'SetVisualizer': 'b'}
    # Four levels from 0 to 1 (bass to treble), several times per second.
    SIGNALS = {'Levels': 'ad'}

    def __init__(self, connection, lyrics=None):
        super().__init__(connection)
        self._lyrics = lyrics
        self._visualizer = True
        self._spectrum = Spectrum(lambda levels: self.emit('Levels', 'ad', levels))
        self._queue_key = None   # (player, track) of the queue already read
        self._next = None        # {'title', 'artist'} of the next song, if the player reports it
        self._players = {}
        self._selected = None  # player picked by hand
        self._activity = 0
        self._art = {}  # cover url -> local path ('' while downloading or if it failed)
        self._position_timer = 0
        self._resume_until = 0   # until when the resume request is valid
        self._resume_timer = 0
        self._last = None
        try:
            with open(LAST_FILE) as file:
                last = json.load(file)
            if isinstance(last, dict) and last.get('title'):
                self._last = last
        except (OSError, ValueError):
            pass

        connection.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', None, Gio.DBusSignalFlags.NONE, self._on_name_owner_changed)
        connection.signal_subscribe(
            None, PROPS_IFACE, 'PropertiesChanged', MPRIS_PATH, None,
            Gio.DBusSignalFlags.NONE, self._on_properties_changed)
        connection.signal_subscribe(
            None, PLAYER_IFACE, 'Seeked', MPRIS_PATH, None,
            Gio.DBusSignalFlags.NONE, self._on_seeked)

        names = connection.call_sync(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
            None, GLib.VariantType.new('(as)'), Gio.DBusCallFlags.NONE, -1, None).unpack()[0]
        for name in names:
            if name.startswith(MPRIS_PREFIX):
                self._add_player(name)
        self._update()

    # --- players -----------------------------------------------------------

    def _call(self, player, interface, method, parameters=None, reply=None, callback=None):
        def done(connection, result):
            try:
                value = connection.call_finish(result)
            except GLib.Error:
                return
            if callback:
                callback(value.unpack())
        self._connection.call(
            player.name, MPRIS_PATH, interface, method, parameters,
            GLib.VariantType.new(reply) if reply else None,
            Gio.DBusCallFlags.NONE, -1, None, done)

    def _add_player(self, name):
        try:
            owner = self._connection.call_sync(
                'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetNameOwner',
                GLib.Variant('(s)', (name,)), GLib.VariantType.new('(s)'),
                Gio.DBusCallFlags.NONE, -1, None).unpack()[0]
        except GLib.Error:
            return
        player = Player(name, owner)
        self._players[name] = player
        # The Spotify that just opened at the island's request becomes the
        # player in use, even if another one is playing.
        if name.startswith(SPOTIFY_NAME) and self._resume_until > GLib.get_monotonic_time():
            self._selected = name

        def got_player_props(value):
            self._merge_props(player, value[0])
            self._update()

        def got_identity(value):
            player.identity = value[0]
            self._update()

        def got_tracklist(value):
            player.has_tracklist = bool(value[0])
            self._queue_key = None  # read the queue again now that it is known to exist
            self._update()

        self._call(player, PROPS_IFACE, 'GetAll', GLib.Variant('(s)', (PLAYER_IFACE,)), '(a{sv})', got_player_props)
        self._call(player, PROPS_IFACE, 'Get', GLib.Variant('(ss)', (ROOT_IFACE, 'Identity')), '(v)', got_identity)
        self._call(player, PROPS_IFACE, 'Get', GLib.Variant('(ss)', (ROOT_IFACE, 'HasTrackList')), '(v)', got_tracklist)

    def _merge_props(self, player, props):
        was_playing = player.props.get('PlaybackStatus') == 'Playing'
        player.props.update(props)
        if 'Position' in props:
            player.position = props['Position']
        if player.props.get('PlaybackStatus') == 'Playing' and not was_playing:
            self._activity += 1
            player.last_active = self._activity
            # The manual choice holds while the chosen player plays; if it is
            # stopped and another player starts, the island goes back to
            # following whoever plays.
            chosen = self._players.get(self._selected)
            if chosen and chosen is not player and chosen.props.get('PlaybackStatus') != 'Playing':
                self._selected = None

    def _on_name_owner_changed(self, connection, sender, path, interface, signal, parameters):
        name, old_owner, new_owner = parameters.unpack()
        if not name.startswith(MPRIS_PREFIX):
            return
        self._players.pop(name, None)
        if new_owner:
            self._add_player(name)
        self._update()

    def _player_by_owner(self, owner):
        for player in self._players.values():
            if player.owner == owner:
                return player
        return None

    def _on_properties_changed(self, connection, sender, path, interface, signal, parameters):
        iface, changed, invalidated = parameters.unpack()
        player = self._player_by_owner(sender)
        if not player or iface != PLAYER_IFACE:
            return
        track_changed = 'Metadata' in changed
        self._merge_props(player, changed)
        if track_changed or 'PlaybackStatus' in changed:
            self._refresh_position(player)
        self._update()

    def _on_seeked(self, connection, sender, path, interface, signal, parameters):
        player = self._player_by_owner(sender)
        if player:
            player.position = parameters.unpack()[0]
            self._update()

    def _refresh_position(self, player):
        def got(value):
            player.position = value[0]
            self._update()
        self._call(player, PROPS_IFACE, 'Get', GLib.Variant('(ss)', (PLAYER_IFACE, 'Position')), '(v)', got)

    def _current(self):
        """The player in use: the one picked by hand; otherwise the last one to
        start playing.
        """
        players = [p for p in self._players.values() if p.props]
        if not players:
            return None
        chosen = self._players.get(self._selected)
        if chosen and chosen.props:
            return chosen
        playing = [p for p in players if p.props.get('PlaybackStatus') == 'Playing']
        return max(playing or players, key=lambda p: p.last_active)

    # --- cover -------------------------------------------------------------

    def _art_path(self, url):
        if not url:
            return ''
        if url.startswith('file://'):
            return urllib.parse.unquote(urllib.parse.urlparse(url).path)
        if not url.startswith(('http://', 'https://')):
            return ''
        if url not in self._art:
            self._art[url] = ''
            threading.Thread(target=self._download_art, args=(url,), daemon=True).start()
        return self._art[url]

    def _download_art(self, url):
        path = os.path.join(ART_CACHE, hashlib.sha1(url.encode()).hexdigest())
        try:
            if not os.path.exists(path):
                os.makedirs(ART_CACHE, exist_ok=True)
                data = download(url, MAX_ART, timeout=10)
                with open(path + '.tmp', 'wb') as file:
                    file.write(data)
                os.replace(path + '.tmp', path)
        except OSError:
            return

        def finish():
            self._art[url] = path
            self._update()
        GLib.idle_add(finish)

    # --- state -------------------------------------------------------------

    def _update(self):
        player = self._current()
        self._sync_extras(player)
        if not player:
            self._set_position_timer(False)
            last = self._last
            if last and last.get('art') and not os.path.exists(last['art']):
                last = dict(last, art='')
            self.set_state({
                'available': False,
                'last': last,
                'resuming': self._resume_until > GLib.get_monotonic_time(),
            })
            return

        props = player.props
        metadata = props.get('Metadata', {})
        artist = metadata.get('xesam:artist', [])
        if isinstance(artist, str):
            artist = [artist]
        status = props.get('PlaybackStatus', 'Stopped')
        length = max(0, int(metadata.get('mpris:length', 0) or 0))
        self._set_position_timer(status == 'Playing' and length > 0)
        if player.name.startswith(SPOTIFY_NAME):
            self._remember(metadata, ', '.join(artist))
        self.set_state({
            'available': True,
            'player': player.identity,
            'player_id': player.name,
            'players': [
                {'id': p.name, 'name': p.identity, 'status': p.props.get('PlaybackStatus', 'Stopped')}
                for p in sorted(self._players.values(), key=lambda p: p.name) if p.props],
            'status': status,
            # Browsers play videos, not songs: there are no lyrics to offer.
            'lyrics': not any(b in player.name.lower() for b in BROWSERS),
            'title': metadata.get('xesam:title', ''),
            'artist': ', '.join(artist),
            'album': metadata.get('xesam:album', ''),
            'art': self._art_path(metadata.get('mpris:artUrl', '')),
            'length': length,
            'position': max(0, int(player.position)),
            'can_next': bool(props.get('CanGoNext', False)),
            'can_previous': bool(props.get('CanGoPrevious', False)),
            'can_play_pause': bool(props.get('CanPlay', False) or props.get('CanPause', False)),
            'can_seek': bool(props.get('CanSeek', False)) and length > 0,
            'next': self._next if self._queue_key and self._queue_key[0] == player.name else None,
        })

    def _sync_extras(self, player):
        """Keeps up to date what depends on the current song: wave bars, lyrics
        and queue.
        """
        playing = player is not None and player.props.get('PlaybackStatus') == 'Playing'
        if playing and self._visualizer:
            self._spectrum.start()
        else:
            self._spectrum.stop()

        metadata = player.props.get('Metadata', {}) if player else {}
        if self._lyrics:
            track = None
            artist = metadata.get('xesam:artist', [])
            artist = artist if isinstance(artist, str) else ', '.join(artist)
            title = metadata.get('xesam:title', '')
            browser = player is not None and any(b in player.name.lower() for b in BROWSERS)
            if title and artist and not browser:
                seconds = round(int(metadata.get('mpris:length', 0) or 0) / 1e6)
                track = (title, artist, metadata.get('xesam:album', ''), seconds)
            self._lyrics.set_track(track)

        key = (player.name, str(metadata.get('mpris:trackid', ''))) if player else None
        if key != self._queue_key:
            self._queue_key = key
            self._next = None
            if player and player.has_tracklist:
                self._read_queue(player, key)

    def _read_queue(self, player, key):
        """Reads the next song in the queue, on players that report it (not
        Spotify).
        """
        def got_tracks(value):
            tracks = value[0]
            current = key[1]
            if current not in tracks or tracks.index(current) + 1 >= len(tracks):
                return
            following = tracks[tracks.index(current) + 1]
            self._call(player, TRACKLIST_IFACE, 'GetTracksMetadata',
                       GLib.Variant('(ao)', ([following],)), '(aa{sv})', got_metadata)

        def got_metadata(value):
            if key != self._queue_key or not value[0]:
                return
            metadata = value[0][0]
            artist = metadata.get('xesam:artist', [])
            title = metadata.get('xesam:title') or os.path.basename(
                urllib.parse.unquote(metadata.get('xesam:url', '')))
            if title:
                self._next = {'title': title, 'artist': artist if isinstance(artist, str) else ', '.join(artist)}
                self._update()
        self._call(player, PROPS_IFACE, 'Get', GLib.Variant('(ss)', (TRACKLIST_IFACE, 'Tracks')), '(v)', got_tracks)

    def _remember(self, metadata, artist):
        """Stores the current Spotify song as "the last one"."""
        title = metadata.get('xesam:title', '')
        if not title:
            return
        last = {'title': title, 'artist': artist, 'art': self._art_path(metadata.get('mpris:artUrl', ''))}
        if last == self._last:
            return
        # The cover arrives a moment after the title; never replace a known
        # cover of the same song with nothing.
        if self._last and not last['art'] and (self._last['title'], self._last['artist']) == (title, artist):
            return
        self._last = last
        try:
            os.makedirs(os.path.dirname(LAST_FILE), exist_ok=True)
            with open(LAST_FILE, 'w') as file:
                json.dump(last, file, indent=2)
        except OSError:
            pass

    def _set_position_timer(self, active):
        """Players do not report the position every second; the engine asks while
        something plays.
        """
        if active and not self._position_timer:
            self._position_timer = GLib.timeout_add_seconds(POSITION_INTERVAL_S, self._on_position_tick)
        elif not active and self._position_timer:
            GLib.source_remove(self._position_timer)
            self._position_timer = 0

    def _on_position_tick(self):
        player = self._current()
        if player:
            self._refresh_position(player)
        return GLib.SOURCE_CONTINUE

    # --- commands ----------------------------------------------------------

    def _command(self, method, parameters=None):
        player = self._current()
        if player:
            self._call(player, PLAYER_IFACE, method, parameters)

    def pause_if_playing(self):
        """Pauses whatever is playing. Returns True if something was paused."""
        player = self._current()
        if not player or player.props.get('PlaybackStatus') != 'Playing':
            return False
        self._call(player, PLAYER_IFACE, 'Pause')
        return True

    def play(self):
        self._command('Play')

    def do_SelectPlayer(self, player_id):
        if player_id in self._players:
            self._selected = player_id
            self._refresh_position(self._players[player_id])
            self._update()

    def do_ResumeWhenReady(self):
        """The front end is about to open Spotify; as soon as it appears, tell it
        to play.
        """
        self._resume_until = GLib.get_monotonic_time() + RESUME_WAIT_S * 1e6
        if not self._resume_timer:
            self._resume_timer = GLib.timeout_add_seconds(RESUME_RETRY_S, self._on_resume_tick)
        self._update()

    def _on_resume_tick(self):
        spotify = next((p for p in self._players.values() if p.name.startswith(SPOTIFY_NAME) and p.props), None)
        expired = GLib.get_monotonic_time() >= self._resume_until
        playing = spotify is not None and spotify.props.get('PlaybackStatus') == 'Playing'
        if expired or playing:
            self._resume_until = 0
            self._resume_timer = 0
            self._update()
            return GLib.SOURCE_REMOVE
        if spotify is not None:
            self._call(spotify, PLAYER_IFACE, 'Play')
        return GLib.SOURCE_CONTINUE

    def do_SetVisualizer(self, enabled):
        """Turns the wave bars that follow the real sound on or off."""
        self._visualizer = enabled
        self._update()

    def do_PlayPause(self):
        self._command('PlayPause')

    def do_Next(self):
        self._command('Next')

    def do_Previous(self):
        self._command('Previous')

    def do_Seek(self, position):
        player = self._current()
        if not player:
            return
        track = player.props.get('Metadata', {}).get('mpris:trackid')
        if track:
            self._call(player, PLAYER_IFACE, 'SetPosition', GLib.Variant('(ox)', (track, position)))
