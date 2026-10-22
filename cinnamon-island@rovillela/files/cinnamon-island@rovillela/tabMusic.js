const { Cinnamon, Clutter, Gio, GLib, Pango, St } = imports.gi;
const { _, scrollStep, COLORS, css, makeDot } = require('./util');
const { Slider } = require('./slider');

function formatTime(microseconds) {
    let seconds = Math.floor(microseconds / 1e6);
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

// Style that sets the album cover as the background of a widget (null if there
// is no cover).
function coverStyle(path) {
    if (!path)
        return null;
    let uri = GLib.filename_to_uri(path, null).replace(/"/g, '%22');
    return 'background-image: url("' + uri + '"); background-size: cover;';
}

const SPOTIFY_DESKTOP = 'spotify.desktop';
// Identifier of the pill that opens Spotify when it is closed.
const OPEN_SPOTIFY = 'open-spotify';
// After opening Spotify, how long the island watches for its window in order
// to minimise it.
const MINIMIZE_WATCH_MS = 20000;

function findSpotify() {
    return Cinnamon.AppSystem.get_default().lookup_app(SPOTIFY_DESKTOP);
}

// Colour of the progress bar according to the program playing (the word is
// looked up in the player name). The others get the blue of sound.
const PROGRAM_COLORS = [
    ['spotify', [105, 215, 149]],
    ['firefox', [242, 150, 96]],
    ['chrom', [111, 176, 242]],
    ['brave', [242, 150, 96]],
    ['vlc', [242, 160, 70]],
    ['rhythmbox', [242, 208, 107]],
];
// The program volume goes up to 150%, as in the mixer.
const APP_VOLUME_MAX = 1.5;

function programColor(playerId, playerName) {
    let text = ((playerId || '') + ' ' + (playerName || '')).toLowerCase();
    let match = PROGRAM_COLORS.find(([word]) => text.indexOf(word) >= 0);
    return match ? match[1] : COLORS.blue;
}

// Word that identifies the program: "org.mpris.MediaPlayer2.spotify" ->
// "spotify".
function programKey(playerId) {
    return ((playerId || '').split('.')[3] || '').toLowerCase();
}

const LYRICS_TICK_MS = 200;
// How much the island stretches down to show the lyrics.
const LYRICS_HEIGHT = 128;
// Lyric lines on display: the current one in the middle, with two before and
// two after.
const LYRIC_LINES = 5;

class MusicTab {
    // `enableLyrics` turns the lyrics lookup on in the preferences.
    // `onHeightChanged` tells the island when the tab starts needing more (or
    // less) height; the extra height is in `extraHeight`.
    constructor(engine, enableLyrics, onHeightChanged) {
        this._enableLyrics = enableLyrics;
        this._onHeightChanged = onHeightChanged;
        this.extraHeight = 0;
        this._lyrics = null;
        this._showLyrics = false;
        this._lyricsTimer = 0;
        this._positionAt = 0;
        this._engine = engine;
        this._state = null;

        this.actor = new St.BoxLayout({ style_class: 'island-media', vertical: true, x_expand: true, y_expand: true });
        this._playersKey = '';

        // With more than one player open, a button for each shows on top.
        // Scrolling the mouse over them switches player.
        this._players = new St.BoxLayout({
            style_class: 'island-outputs island-wheel',
            x_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
        });
        this._players.connect('scroll-event', (actor, event) => this._onPlayersScroll(event));
        this.actor.add_child(this._players);

        this._row = new St.BoxLayout({
            style_class: 'island-music',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.actor.add_child(this._row);

        this._empty = new St.Label({
            style_class: 'island-empty',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._row.add_child(this._empty);

        // Volume of the program that is playing, upright, to the left of the
        // cover: the number on top, the bar and the icon below (clicking it
        // mutes). It uses the channel of the program in the mixer (yellow); if
        // the program has no channel right now, it changes the master volume
        // (blue).
        this._volumeBox = new St.BoxLayout({
            style_class: 'island-media-volume',
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._volumeValue = new St.Label({ style_class: 'island-channel-value', x_align: Clutter.ActorAlign.CENTER });
        this._volumeSlider = new Slider({ vertical: true, color: COLORS.amber });
        this._volumeSlider.actor.x_align = Clutter.ActorAlign.CENTER;
        this._volumeDragging = false;
        this._volumeSlider.connect('drag-begin', () => { this._volumeDragging = true; });
        this._volumeSlider.connect('drag-end', () => { this._volumeDragging = false; });
        this._volumeSlider.connect('value-changed', (slider, value) => this._setVolume(value));
        this._volumeIcon = new St.Icon({ icon_size: 14 });
        this._volumeMute = new St.Button({ style_class: 'island-button-app', child: this._volumeIcon });
        this._volumeMute.set_x_align(Clutter.ActorAlign.CENTER);
        this._volumeMute.connect('clicked', () => this._toggleMute());
        this._volumeBox.add_child(this._volumeValue);
        this._volumeBox.add_child(this._volumeSlider.actor);
        this._volumeBox.add_child(this._volumeMute);
        this._row.add_child(this._volumeBox);

        this._cover = new St.Widget({
            style_class: 'island-cover',
            layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._coverIcon = new St.Icon({ icon_name: 'audio-x-generic-symbolic', icon_size: 36 });
        this._cover.add_child(this._coverIcon);
        this._row.add_child(this._cover);

        this._info = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'island-music-info',
        });
        this._title = new St.Label({ style_class: 'island-title' });
        this._artist = new St.Label({ style_class: 'island-text' });
        for (let label of [this._title, this._artist])
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        // Shows only when the tab displays the last song, with no player open.
        this._lastTag = new St.Label({ style_class: 'island-time' });
        this._info.add_child(this._lastTag);
        // Where the music comes from: icon and name of the program.
        this._sourceIcon = new St.Icon({ icon_size: 13 });
        this._sourceName = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        let sourceBox = new St.BoxLayout({ style_class: 'island-output-box' });
        sourceBox.add_child(this._sourceIcon);
        sourceBox.add_child(this._sourceName);
        this._source = new St.Widget({ style_class: 'island-source', layout_manager: new Clutter.BinLayout() });
        this._source.add_child(sourceBox);
        this._source.set_x_align(Clutter.ActorAlign.START);
        this._info.add_child(this._source);
        this._info.add_child(this._title);
        this._info.add_child(this._artist);
        // The next song, on players that report the queue.
        this._upNext = new St.Label({ style_class: 'island-time', visible: false });
        this._upNext.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._info.add_child(this._upNext);

        this._progressRow = new St.BoxLayout({ style_class: 'island-progress-row' });
        this._elapsed = new St.Label({ style_class: 'island-time', y_align: Clutter.ActorAlign.CENTER });
        this._total = new St.Label({ style_class: 'island-time', y_align: Clutter.ActorAlign.CENTER });
        this._progress = new St.DrawingArea({ style_class: 'island-progress', x_expand: true, reactive: true });
        this._progress.connect('repaint', area => this._drawProgress(area));
        this._progress.connect('button-release-event', (actor, event) => this._onSeek(event));
        this._progressRow.add_child(this._elapsed);
        this._progressRow.add_child(this._progress);
        this._progressRow.add_child(this._total);
        this._info.add_child(this._progressRow);
        this._row.add_child(this._info);

        this._controls = new St.BoxLayout({ style_class: 'island-controls', y_align: Clutter.ActorAlign.CENTER });
        this._previous = this._button('media-skip-backward-symbolic', 'Previous');
        this._playPause = this._button('media-playback-start-symbolic', 'PlayPause', () => {
            // With no player open, the play button opens Spotify and resumes.
            if (this._state && !this._state.available) {
                this._resume();
                return true;
            }
            return false;
        });
        this._playPause.add_style_class_name('island-button-main');
        this._next = this._button('media-skip-forward-symbolic', 'Next');
        // Turns the lyrics view on and off.
        this._lyricsToggle = new St.Button({ style_class: 'island-output', label: _("Lyrics") });
        this._lyricsToggle.connect('clicked', () => {
            this._showLyrics = !this._showLyrics;
            this.update(this._state);
        });
        this._lyricsToggle.set_y_align(Clutter.ActorAlign.CENTER);
        this._controls.add_child(this._lyricsToggle);
        this._row.add_child(this._controls);

        // Lyrics: shows the line being sung, with two before and two after. It
        // does not live inside the tab: the island places it in a strip below
        // the tab buttons (`extraActor`) and stretches down to make that room,
        // without touching anything above.
        this._lyricsBox = new St.BoxLayout({
            vertical: true,
            style_class: 'island-lyric',
            x_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.extraActor = this._lyricsBox;
        this._lyricLines = [];
        let middle = (LYRIC_LINES - 1) / 2;
        for (let i = 0; i < LYRIC_LINES; i++) {
            // The further from the current line, the more faded.
            let distance = Math.abs(i - middle);
            let line = new St.Label({
                style_class: distance === 0 ? 'island-lyric-current'
                    : distance === 1 ? 'island-lyric-near' : 'island-lyric-far',
                x_align: Clutter.ActorAlign.CENTER,
            });
            line.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this._lyricsBox.add_child(line);
            this._lyricLines.push(line);
        }
        this._lyricsHint = new St.Label({ style_class: 'island-text', x_align: Clutter.ActorAlign.CENTER });
        this._lyricsHint.clutter_text.line_wrap = true;
        this._lyricsHint.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._lyricsBox.add_child(this._lyricsHint);
        this._consent = new St.Button({ style_class: 'island-output', label: _("Turn on lyrics") });
        this._consent.set_x_align(Clutter.ActorAlign.CENTER);
        this._consent.connect('clicked', () => this._enableLyrics());
        this._lyricsBox.add_child(this._consent);

        this.update(null);
    }

    // `intercept`, when present, may handle the click instead of the command.
    _button(iconName, method, intercept = null) {
        let button = new St.Button({
            style_class: 'island-button',
            child: new St.Icon({ icon_name: iconName, icon_size: 18 }),
        });
        button.connect('clicked', () => {
            if (!intercept || !intercept())
                this._engine.call('Music', method);
        });
        this._controls.add_child(button);
        return button;
    }

    update(state) {
        this._state = state;
        let playing = !!(state && state.available);
        // No player open, but Spotify is installed: the tab offers to resume
        // the last song (or just to open Spotify, if no song is remembered
        // yet).
        let canResume = !!state && !playing && !!findSpotify();
        this._empty.visible = !playing && !canResume;
        this._empty.text = state ? _("Nothing playing") : _("The Cinnamon Island engine is not running");
        for (let actor of [this._cover, this._info, this._controls])
            actor.visible = playing || canResume;
        this._lastTag.visible = canResume;
        this._source.visible = playing;
        this._volumeBox.visible = playing;
        this._previous.visible = this._next.visible = playing;
        this._lyricsToggle.visible = playing && this._lyricsOffered();
        this._positionAt = GLib.get_monotonic_time();
        if (!playing) {
            this._upNext.visible = false;
            this._setExtraHeight(0);
            this._syncLyricsTimer();
        }
        this._updatePlayers(playing ? state : null);
        if (canResume) {
            let last = state.last;
            let style = last ? coverStyle(last.art) : null;
            this._cover.set_style(style);
            this._coverIcon.visible = !style;
            this._lastTag.text = state.resuming ? _("Opening Spotify…")
                : last ? _("Last played on Spotify") : _("Nothing playing");
            this._title.text = last ? last.title : _("Open Spotify");
            this._artist.text = last ? last.artist : '';
            this._progressRow.visible = false;
            this._playPause.child.icon_name = 'media-playback-start-symbolic';
            this._playPause.reactive = !state.resuming;
            this._playPause.opacity = state.resuming ? 110 : 255;
            return;
        }
        this._playPause.opacity = 255;
        if (!playing)
            return;

        let style = coverStyle(state.art);
        this._cover.set_style(style);
        this._coverIcon.visible = !style;

        this._title.text = state.title || state.player;
        this._artist.text = state.artist || '';
        this._artist.visible = !!state.artist;

        let key = programKey(state.player_id);
        this._sourceName.text = state.player;
        this._sourceIcon.gicon = new Gio.ThemedIcon({ names: [key, key + '-symbolic', 'audio-x-generic-symbolic'] });
        this._progressColor = programColor(state.player_id, state.player);
        this._syncVolume();

        // With lyrics on, the island stretches and the lyrics show below.
        let lyrics = this._lyricsShown();
        if (lyrics)
            this._lyricsToggle.add_style_pseudo_class('checked');
        else
            this._lyricsToggle.remove_style_pseudo_class('checked');
        this._setExtraHeight(lyrics ? LYRICS_HEIGHT : 0);
        this._upNext.visible = !!state.next;
        if (state.next) {
            this._upNext.text = _("Up next: %s").replace('%s',
                state.next.artist ? state.next.title + ' · ' + state.next.artist : state.next.title);
        }
        this._renderLyrics();
        this._syncLyricsTimer();

        this._progressRow.visible = state.length > 0;
        this._elapsed.text = formatTime(Math.min(state.position, state.length));
        this._total.text = formatTime(state.length);
        this._progress.queue_repaint();

        this._playPause.child.icon_name = state.status === 'Playing'
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._playPause.reactive = state.can_play_pause;
        this._previous.reactive = state.can_previous;
        this._next.reactive = state.can_next;
        this._previous.opacity = state.can_previous ? 255 : 80;
        this._next.opacity = state.can_next ? 255 : 80;
    }

    // Opens Spotify, asks the engine to send play once it is ready, and
    // minimises its window as soon as it appears.
    _resume() {
        let app = findSpotify();
        if (!app)
            return;
        this._engine.call('Music', 'ResumeWhenReady');
        this._watchSpotifyWindow();
        try {
            app.open_new_window(-1);
        } catch (e) {
            global.logError('Cinnamon Island: could not open Spotify: ' + e);
        }
    }

    _watchSpotifyWindow() {
        this._stopWatching();
        this._windowId = global.display.connect('window-created', (display, window) => {
            // Spotify only reports whose window it is a moment after creating
            // it; hence the several attempts.
            let tries = 0;
            let check = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                tries++;
                let name = (window.get_wm_class() || '') + ' ' + (window.get_title() || '');
                if (/spotify/i.test(name)) {
                    window.minimize();
                    this._stopWatching();
                    return GLib.SOURCE_REMOVE;
                }
                return tries < 12 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
            });
            this._checks.push(check);
        });
        this._checks = [];
        this._watchTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MINIMIZE_WATCH_MS, () => {
            this._watchTimer = 0;
            this._stopWatching();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopWatching() {
        if (this._windowId) {
            global.display.disconnect(this._windowId);
            this._windowId = 0;
        }
        if (this._watchTimer) {
            GLib.source_remove(this._watchTimer);
            this._watchTimer = 0;
        }
    }

    destroy() {
        this._stopWatching();
        if (this._lyricsTimer)
            GLib.source_remove(this._lyricsTimer);
        this._lyricsTimer = 0;
    }

    _onPlayersScroll(event) {
        let step = scrollStep(event);
        let state = this._state;
        if (step && state && state.available) {
            let index = state.players.findIndex(p => p.id === state.player_id) + step;
            if (index >= 0 && index < state.players.length) {
                this._engine.call('Music', 'SelectPlayer',
                    new GLib.Variant('(s)', [state.players[index].id]));
            }
        }
        return Clutter.EVENT_STOP;
    }

    _updatePlayers(state) {
        let players = state ? state.players.slice() : [];
        // With Spotify closed, it gets a pill of its own next to the other
        // players: clicking it opens Spotify and resumes the music.
        let spotifyOpen = players.some(p => /spotify/i.test(p.id));
        if (players.length > 0 && !spotifyOpen && findSpotify())
            players.push({ id: OPEN_SPOTIFY, name: 'Spotify', status: 'Closed' });
        if (players.length < 2)
            players = [];
        this._players.visible = players.length > 0;
        let key = JSON.stringify(players.map(p => [p.id, p.name]));
        if (key !== this._playersKey) {
            this._playersKey = key;
            this._players.destroy_all_children();
            for (let player of players) {
                let box = new St.BoxLayout({ style_class: 'island-output-box' });
                // The green dot marks the player that is playing.
                let icon = makeDot(COLORS.green);
                let label = new St.Label({ text: player.name, y_align: Clutter.ActorAlign.CENTER });
                box.add_child(icon);
                box.add_child(label);
                let button = new St.Button({ style_class: 'island-output', child: box });
                button._playerId = player.id;
                button._icon = icon;
                button.connect('clicked', () => {
                    if (player.id === OPEN_SPOTIFY)
                        this._resume();
                    else
                        this._engine.call('Music', 'SelectPlayer', new GLib.Variant('(s)', [player.id]));
                });
                this._players.add_child(button);
            }
        }
        for (let button of this._players.get_children()) {
            let player = players.find(p => p.id === button._playerId);
            button._icon.visible = !!player && player.status === 'Playing';
            if (state && button._playerId === state.player_id)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
    }

    _setExtraHeight(height) {
        if (height === this.extraHeight)
            return;
        this.extraHeight = height;
        this._onHeightChanged();
    }

    // Lyrics state, from the engine.
    updateLyrics(lyrics) {
        this._lyrics = lyrics;
        this._renderLyrics();
    }

    // Position of the song right now, in milliseconds: the last one the engine
    // reported plus the time elapsed since, if it is playing.
    _positionMs() {
        let state = this._state;
        if (!state || !state.available)
            return 0;
        let ms = state.position / 1000;
        if (state.status === 'Playing')
            ms += (GLib.get_monotonic_time() - this._positionAt) / 1000;
        return ms;
    }

    // The engine says whether the current player can have lyrics at all (what
    // plays in a browser cannot).
    _lyricsOffered() {
        return !!this._state && this._state.available && this._state.lyrics !== false;
    }

    // The lyrics strip is open: the person turned it on and the current
    // player offers lyrics. The choice is kept, so going back from a browser
    // to a music player opens the lyrics again.
    _lyricsShown() {
        return this._showLyrics && this._lyricsOffered();
    }

    _renderLyrics() {
        if (!this._lyricsShown())
            return;
        let lyrics = this._lyrics;
        let ok = !!lyrics && lyrics.status === 'ok' && lyrics.lines.length > 0;
        for (let line of this._lyricLines)
            line.visible = ok;
        this._lyricsHint.visible = !ok;
        this._consent.visible = !!lyrics && !lyrics.enabled;
        if (!ok) {
            if (!lyrics)
                this._lyricsHint.text = '';
            else if (!lyrics.enabled)
                this._lyricsHint.text = _("To find lyrics, Cinnamon Island sends the song's title and artist to lrclib.net.");
            else if (lyrics.status === 'loading')
                this._lyricsHint.text = _("Looking for the lyrics…");
            else if (lyrics.status === 'error')
                this._lyricsHint.text = _("Couldn't load the lyrics");
            else
                this._lyricsHint.text = _("No synced lyrics for this one");
            return;
        }

        // The current line is the last one whose time has already passed.
        let now = this._positionMs();
        let index = -1;
        for (let i = 0; i < lyrics.lines.length && lyrics.lines[i][0] <= now; i++)
            index = i;
        let text = i => (i >= 0 && i < lyrics.lines.length ? lyrics.lines[i][1] : '') || (i === index ? '♪' : '');
        let middle = (LYRIC_LINES - 1) / 2;
        this._lyricLines.forEach((line, i) => { line.text = text(index + i - middle); });
    }

    // While the lyrics are on display and the music plays, the current line is
    // checked several times per second.
    _syncLyricsTimer() {
        let state = this._state;
        let needed = this._lyricsShown() && !!state && state.available && state.status === 'Playing' &&
            !!this._lyrics && this._lyrics.status === 'ok';
        if (needed && !this._lyricsTimer) {
            this._lyricsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LYRICS_TICK_MS, () => {
                if (this.actor.mapped)
                    this._renderLyrics();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!needed && this._lyricsTimer) {
            GLib.source_remove(this._lyricsTimer);
            this._lyricsTimer = 0;
        }
    }

    _drawProgress(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();
        let state = this._state;
        let fraction = state && state.length > 0 ? Math.min(1, state.position / state.length) : 0;
        let thickness = 4;
        let y = Math.round((height - thickness) / 2);

        let bar = (w, color, alpha) => {
            if (w < thickness)
                return;
            let r = thickness / 2;
            cr.setSourceRGBA(color[0] / 255, color[1] / 255, color[2] / 255, alpha);
            cr.newSubPath();
            cr.arc(r, y + r, r, Math.PI / 2, Math.PI * 1.5);
            cr.arc(w - r, y + r, r, Math.PI * 1.5, Math.PI / 2);
            cr.closePath();
            cr.fill();
        };
        bar(width, [255, 255, 255], 0.2);
        bar(width * fraction, this._progressColor || COLORS.blue, 1);
        cr.$dispose();
    }

    // State of the Volume tab, where the program volume comes from.
    updateVolume(volume) {
        this._volume = volume;
        this._syncVolume();
    }

    // The mixer channel that belongs to the current player, if any.
    _appChannel() {
        let state = this._state;
        let volume = this._volume;
        if (!state || !state.available || !volume || !volume.apps)
            return null;
        let key = programKey(state.player_id);
        let name = (state.player || '').toLowerCase();
        return volume.apps.find(app => {
            let text = (app.name + ' ' + app.icon).toLowerCase();
            return (key && text.indexOf(key) >= 0) || (name && text.indexOf(name) >= 0);
        }) || null;
    }

    _syncVolume() {
        let volume = this._volume;
        if (!volume || !volume.available)
            return;
        let app = this._appChannel();
        let level = app ? app.volume : volume.volume;
        let muted = app ? app.muted : volume.muted;
        let max = app ? APP_VOLUME_MAX : 1;
        let color = app ? COLORS.amber : COLORS.blue;
        this._volumeMax = max;
        this._volumeSlider.setColor(color);
        this._volumeSlider.mark = app ? 1 / max : null;
        this._volumeSlider.setDimmed(muted);
        this._volumeIcon.icon_name = muted ? 'audio-volume-muted-symbolic' : 'audio-volume-high-symbolic';
        this._volumeIcon.set_style('color: ' + css(muted ? COLORS.rose : color) + ';');
        if (this._volumeDragging)
            return;
        this._volumeSlider.setValue(Math.min(1, level / max));
        this._volumeValue.text = String(Math.round(level * 100));
    }

    _setVolume(value) {
        let level = value * (this._volumeMax || 1);
        this._volumeValue.text = String(Math.round(level * 100));
        let app = this._appChannel();
        if (app)
            this._engine.call('Volume', 'SetAppVolume', new GLib.Variant('(ud)', [app.id, level]));
        else
            this._engine.call('Volume', 'SetVolume', new GLib.Variant('(d)', [level]));
    }

    _toggleMute() {
        let app = this._appChannel();
        if (app)
            this._engine.call('Volume', 'SetAppMuted', new GLib.Variant('(ub)', [app.id, !app.muted]));
        else if (this._volume)
            this._engine.call('Volume', 'SetMuted', new GLib.Variant('(b)', [!this._volume.muted]));
    }

    _onSeek(event) {
        let state = this._state;
        if (!state || !state.can_seek)
            return Clutter.EVENT_PROPAGATE;
        let [x] = event.get_coords();
        let [ok, localX] = this._progress.transform_stage_point(x, 0);
        let fraction = Math.max(0, Math.min(1, localX / this._progress.width));
        this._engine.call('Music', 'Seek', new GLib.Variant('(x)', [Math.round(fraction * state.length)]));
        return Clutter.EVENT_STOP;
    }
}

module.exports = { MusicTab, coverStyle };
