# Cinnamon Island

A dynamic island for the Cinnamon desktop: a glass notch on the screen edge that expands into tabs on hover.

## Tabs

- **Volume**: a mixer with the audio outputs, master volume, microphone and one bar per program
- **Media**: controls what is playing (any MPRIS player), with optional synced lyrics
- **Clock**: Pomodoro with task and statistics, timer and stopwatch
- **Agenda**: the month and the upcoming events, read from an iCal link
- **Notes**: a block of text that saves itself
- **Clipboard**: history of what was copied (kept in memory only)
- **Files**: a drag-and-drop shelf
- **Weather**: forecast for up to five cities, from Open-Meteo
- **System**: CPU, memory, graphics card, disks, network and battery, with graphs
- **Tools**: keep the screen awake, colour picker, screenshots, copy text from the screen and a camera mirror
- **Notifications** (off by default): an inbox for the system notifications

While closed, the island shows the album cover and wave bars of the music, the time of the clock, the countdown to the next event and short notices.

## Requirements

- Cinnamon 6.0 or newer, in an X11 session
- Python 3.9+ with PyGObject and GTK 3, and `pulseaudio-utils` (all already installed on Linux Mint)

Optional packages from your distribution, each for one feature: `python3-dateutil` (recurring events), `gnome-screenshot` (screenshots), `tesseract-ocr` (copy text from the screen), `gstreamer1.0-plugins-good` and `gstreamer1.0-gtk3` (camera mirror).

## How it works

The extension only draws. A small engine written in Python, shipped inside the extension, reads the system and talks to the extension over D-Bus; the extension starts it when it loads and stops it when it is disabled.

## Privacy

No account and no usage data. The only connections are to Open-Meteo (weather), to the calendar link you provide, to the address of an album cover when the player reports one, and to LRCLIB for lyrics, which is off until you turn it on. The clipboard history and the notification inbox are never written to disk.

## Usage

- Hover over the island to open it; Super+I opens and pins it, and then the arrow and number keys switch tabs.
- The mouse wheel switches tabs, or changes the control under the pointer.
- The pin keeps the island open; the gear opens the settings.
- The interface is available in English and Brazilian Portuguese.
