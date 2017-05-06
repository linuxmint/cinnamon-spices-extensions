
# Hilfe für die Erweiterung Multi-Übersetzer

### WICHTIG!!!
Niemals irgendeine der Dateien löschen, die sich in dem Ordner dieser Erweiterung befinden. Es könnte das Funktionieren dieser Erweiterung beeinträchtigen.

***

<h2 style="color:red;">Fehlerberichte, Feature-Anfragen und Beiträge</h2>
<span style="color:red;">
Wenn jemand einen Fehler melden will, eine Feature-Anfrage hat oder einen Beitrag leisten möchte, dann soll er dies bitte auf der <a href="https://github.com/Odyseus/CinnamonTools">GitHub-Seite dieser Erweiterung</a> tun.
</span>

***

### Abhängigkeiten

**Wenn eine oder mehrere dieser Abhängigkeiten auf dem Rechner fehlen, kann diese Erweiterung nicht verwendet werden.**

- **xsel** Befehl: XSel ist ein Befehlszeilenprogramm, das der Verwaltung der Zwischenablage(n), sprich des X11-Clipboards, dient.
- **trans** Befehl: Ein Befehl, der durch das Paket translate-shell zur Verfügung gestellt wird. Es ist eine einfache Befehlszeilenschnittstelle für mehrere Übersetzungsdienstleister (Google Übersetzer, Yandex Übersetzer, Bing Übersetzer und Apertium), welche das Übersetzen von Zeichenfolgen im Terminal ermöglicht.
    - Überprüfe [Abhängigkeiten](https://github.com/soimort/translate-shell#dependencies) und [empfohlene Abhängigkeiten](https://github.com/soimort/translate-shell#recommended-dependencies) für translate-shell.

**Bemerkung:** Das Paket translate-shell in den Ubuntu 16.04.x/Linux Mint 18.x-Repositories ist veraltet und defekt. Es kann trotzdem installiert werden, so dass auch die Abhängigkeiten installiert werden. Aber das Aktualisieren auf die neueste Version sollte wie unten beschrieben durchgeführt werden.

### Wie man die neueste Version von translate-shell installiert

#### Möglichkeit 1. Direkter Download

Diese Methode wird nur das trans-Skript an die angegebenen Orte installieren.

Nur für den aktuellen Benutzer. Der Pfad **~/.local/bin** muss existieren.
```shell
$ wget -O ~/.local/bin/trans git.io/trans && chmod ugo+rx ~/.local/bin/trans
```

Für alle Benutzer ohne Überschreiben der installierten Version.
```shell
$ sudo wget -O /usr/local/bin/trans git.io/trans && sudo chmod ugo+rx /usr/local/bin/trans
```

#### Möglichkeit 2. Von Git - [Mehr Details](https://github.com/soimort/translate-shell/blob/develop/README.md#option-3-from-git-recommended-for-seasoned-hackers)

Diese Methode wird nicht nur das trans-Skript installieren, sondern auch dessen Man-Pages (Hilfe- und Dokumentationsseiten). Weitere Informationen finden Sie im obigen Link.

```shell
$ git clone https://github.com/soimort/translate-shell
$ cd translate-shell
$ make
$ sudo make install
```

***

### Benutzung der Erweiterung

Nach der Installation und Aktivierung stehen folgende Tasaturkürzel zur Verfügung.

#### Globale Tastaturkürzel (konfigurierbar in den Einstellungen der Erweiterung)

- **<kbd>Super</kbd> + <kbd>T</kbd>:** Den Übersetzer-Dialog öffnen.
- **<kbd>Super</kbd> + <kbd>&#8679;</kbd> + <kbd>T</kbd>:** Übersetzer-Dialog öffnen und den Text aus der Zwischenablage übersetzen.
- **<kbd>Super</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd>:** Übersetzer-Dialog öffnen und primäre Auswahl übersetzen.

#### Auf dem Übersetzer-Dialog verfügbare Tastaturkürzel

- **<kbd>Strg</kbd> + <kbd>&#8629;</kbd>:** Text übersetzen.
- **<kbd>&#8679;</kbd> + <kbd>&#8629;</kbd>:** Text-Übersetzung erzwingen. Ignoriert den Übersetzungsverlauf.
- **<kbd>Strg</kbd> + <kbd>&#8679;</kbd> + <kbd>C</kbd>:** Text in die Zwischenablage kopieren.
- **<kbd>Strg</kbd> + <kbd>S</kbd>:** Sprachen vertauschen.
- **<kbd>Strg</kbd> + <kbd>D</kbd>:** Sprache auf den Standard zurücksetzen.
- **<kbd>Esc</kbd>:** Dialog schließen.

***

### Einstellungsfenster der Erweiterung

In den Einstellungen dieser Erweiterung können alle Optionen importiert, exportiert und/oder auf ihre Standardwerte zurückgesetzt werden.

- Um diese Aktionen durchführen zu können, muss das Einstellungsschema auf dem Rechner installiert sein. Dies geschieht automatisch, wenn die Erweiterung vom Cinnamon-Erweiterungsmanager installiert wird. Wenn die Erweiterung jedoch manuell installiert wurde, muss das Einstellungsschema auch manuell installiert werden. Dies wird erreicht, indem man einfach zum Ordner dieser Erweiterung geht und den folgenden Befehl ausführt:
    - Befehl zum Installieren des Einstellungsschemas: `./settings.py install-schema`
    - Befehl zum Deinstallieren des Einstellungsschemas: `./settings.py remove-schema`
- Zum Importieren/Exportieren der Einstellungen, muss der Befehl **dconf** auf dem Rechner verfügbar sein.

***

### Übersetzungen von Applets/Desklets/Erweiterungen (auch bekannt als Xlets)

- Wenn diese Xlet aus den Systemeinstellungen von Cinnamon installiert wurde, sind alle Übersetzungen dieses Xlets automatisch installiert worden.
- Wenn dieses Xlet manuell installiert wurde, können die Übersetzungen installiert werden, indem das Skript namens **localizations.sh** von einem Terminal ausgeführt wird, das im Ordner des Xlets geöffnet ist.
- Wenn keine Übersetzung dieses Xlets in Ihrer Sprachen vorhanden ist, können Sie eine Übersetzung erstellen, indem Sie [dieser Anleitung](https://github.com/Odyseus/CinnamonTools/wiki/Xlet-localization) folgen und die .po Datei an mich senden.
    - Wenn Sie einen GitHub-Account haben:
        - Sie können ein Pull Request mit der neuen Lokalisierungdatei erstellen.
        - Wenn Sie das Repository nicht klonen möchten, erstellen Sie einfach ein [Gist](https://gist.github.com/) und senden mir den Link.
    - Wenn Sie keinen GitHub-Account haben/wollen:
        - Sie können mir ein [Pastebin](http://pastebin.com/) (or similar service) auf meinen [Mint Forums Account](https://forums.linuxmint.com/memberlist.php?mode=viewprofile&u=164858) senden.
- Wenn der Quelltext (in Englisch) und/oder meine Übersetzung auf Spanisch Fehler/Inkonsistenzen hat, können Sie mir diese melden.