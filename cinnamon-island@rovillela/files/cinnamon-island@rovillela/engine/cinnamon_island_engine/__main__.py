import signal
import sys

from gi.repository import Gio, GLib

from . import BUS_NAME
from .files import Files
from .notices import Notices
from .weather import Weather
from .tools import Tools
from .lyrics import Lyrics
from .music import Music
from .notes import Notes
from .inbox import Inbox
from .pomodoro import Pomodoro
from .system import System
from .timer import Timer
from .clipboard import Clipboard
from .volume import Volume


def main():
    loop = GLib.MainLoop()
    services = []

    def on_bus_acquired(connection, name):
        lyrics = Lyrics(connection)
        services.append(lyrics)
        music = Music(connection, lyrics)
        services.append(music)
        services.append(Volume(connection))
        pomodoro = Pomodoro(connection, music)
        services.append(pomodoro)
        services.append(Timer(connection, pomodoro.play_sound))
        files = Files(connection)
        services.append(files)
        services.append(Notes(connection, files))
        notices = Notices(connection)
        services.append(notices)
        services.append(Clipboard(connection, notices))
        services.append(Inbox(connection, notices))
        services.append(System(connection))
        services.append(Weather(connection))
        services.append(Tools(connection, notices, files))

    def on_name_lost(connection, name):
        # No D-Bus connection, or another engine is already running.
        print('cinnamon-island-engine: could not acquire the name %s' % name, file=sys.stderr)
        loop.quit()

    Gio.bus_own_name(
        Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE,
        on_bus_acquired, None, on_name_lost)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, loop.quit)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, loop.quit)
    loop.run()


if __name__ == '__main__':
    main()
