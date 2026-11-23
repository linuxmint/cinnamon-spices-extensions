# Window Frame Rules

![Window Frame Rules screenshot](assets/screenshot.png)

## Deutsch

**Window Frame Rules** ist eine frei konfigurierbare Erweiterung für den Cinnamon-Desktop. Sie versieht Fenster mit deutlich sichtbaren farbigen Rahmen und erleichtert dadurch die schnelle visuelle Orientierung zwischen Anwendungen, Rechnern, SSH-Verbindungen und Arbeitsumgebungen.

Die Regeln können Fenstertitel, Fensterklasse, Instanz und Fenstertyp auswerten. Dadurch kann beispielsweise ein lokales Terminal cyan, Linuxmaid grün, Blackmaid violett und eine Root-Shell orange markiert werden. Die erste passende Regel mit der höchsten Priorität gewinnt. Änderungen am Fenstertitel – etwa beim Wechsel in eine SSH-Sitzung – werden unmittelbar ausgewertet.

### Funktionen

- Frei definierbare und priorisierte Fensterregeln
- Erkennung über Titel, Fensterklasse, Instanz und Fenstertyp
- Getrennte Farben für aktive und inaktive Fenster
- Rahmenbreite frei in Pixeln einstellbar
- Eckenradius, Deckkraft und Leuchteffekt einstellbar
- Linker, rechter, oberer und unterer Versatz separat einstellbar
- Eigene Rahmenbreite und eigener Radius pro Regel möglich
- Maximierte und Vollbildfenster separat ein- oder ausschließbar
- Optionale Standardfarbe für Fenster ohne Regel
- Konfigurationsänderungen werden ohne Neustart übernommen
- Mitgelieferter grafischer Konfigurator

Die Erweiterung verändert weder Anwendungen noch Terminalinhalte. Sie zeichnet den Rahmen auf Ebene des Cinnamon-Fenstermanagers. Das macht sie besonders nützlich für Nutzer, die gleichzeitig mit mehreren lokalen und entfernten Systemen arbeiten und sofort erkennen möchten, in welchem Fenster sie gerade tippen.

### Installation

```bash
unzip window-frame-rules-1.0.0.zip
cd window-frame-rules-1.0.0
./install.sh
```

Danach **Systemeinstellungen → Erweiterungen → Window Frame Rules** aktivieren. Unter X11 kann Cinnamon mit `Alt+F2`, `r`, Enter neu geladen werden.

Konfigurator starten:

```bash
window-frame-rules-config
```

Die Konfiguration liegt in `~/.config/window-frame-rules/config.json`. Vorhandene Konfigurationen bleiben bei Neuinstallationen erhalten.

---

## English

**Window Frame Rules** is a fully configurable extension for the Cinnamon desktop. It adds clearly visible colored frames to windows, making it easier to distinguish applications, computers, SSH sessions and working environments at a glance.

Rules can inspect the window title, window class, instance and window type. A local terminal can therefore use cyan, Linuxmaid green, Blackmaid violet and a root shell orange. The matching rule with the highest priority wins. Window-title changes, including changes caused by entering or leaving an SSH session, are evaluated immediately.

### Features

- Fully configurable prioritized window rules
- Matching by title, window class, instance and window type
- Separate active and inactive colors
- User-defined frame thickness in pixels
- Adjustable corner radius, opacity and glow
- Separate left, right, top and bottom offsets
- Optional per-rule frame width and corner radius
- Separate handling of maximized and fullscreen windows
- Optional fallback frame for unmatched windows
- Configuration changes are applied without restarting Cinnamon
- Included graphical configurator

The extension does not modify applications, terminals or shells. It draws the frame at Cinnamon's window-manager level. It is particularly useful for users who work with several local and remote systems at the same time and need an immediate visual indication of where their keyboard input is going.

### Installation

```bash
unzip window-frame-rules-1.0.0.zip
cd window-frame-rules-1.0.0
./install.sh
```

Then enable **Window Frame Rules** in **System Settings → Extensions**. On X11, Cinnamon can be reloaded with `Alt+F2`, `r`, Enter.

Launch the configurator:

```bash
window-frame-rules-config
```

Configuration is stored in `~/.config/window-frame-rules/config.json`. Existing user configuration is preserved during reinstallations.

## Notes

- Designed and tested for Cinnamon 6.4 on X11.
- The extension performs no network access and runs no shell commands.
- The configurator requires Python 3 and GTK 3 (`python3-gi`).
- License: GPL-3.0-or-later.
