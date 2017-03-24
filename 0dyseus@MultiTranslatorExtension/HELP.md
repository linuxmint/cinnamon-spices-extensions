
# Help for Multi Translator extension

### IMPORTANT!!!
Never delete any of the files found inside this extension folder. It might break this extension functionality.

***

### Dependencies

**If one or more of these dependencies are missing in your system, you will not be able to use this extension.**

- **xsel** command: XSel is a command-line program for getting and setting the contents of the X selection.
- **trans** command: Command provided by the package translate-shell. Is a simple command line interface for several translation providers (Google Translate, Yandex Translate, Bing Translate and Apertium) which allows you to translate strings in your terminal.
    - Check translate-shell [dependencies](https://github.com/soimort/translate-shell#dependencies) and [recommended dependencies](https://github.com/soimort/translate-shell#recommended-dependencies).

**Note:** The translate-shell package available on Ubuntu 16.04.x/Linux Mint 18.x repositories is outdated and broken. It can be installed anyway so it will also install its dependencies. But updating to the latest version should be done as described bellow.

### How to install latest version of translate-shell

#### Option 1. Direct Download

This method will only install the trans script into the specified locations.

For the current user only. **~/.local/bin** needs to be in your PATH.
```shell
$ wget -O ~/.local/bin/trans git.io/trans && chmod ugo+rx ~/.local/bin/trans
```

For all users without overwriting the installed version.
```shell
$ sudo wget -O /usr/local/bin/trans git.io/trans && sudo chmod ugo+rx /usr/local/bin/trans
```

#### Option 2. From Git - [More details](https://github.com/soimort/translate-shell/blob/develop/README.md#option-3-from-git-recommended-for-seasoned-hackers)

This method will not just install the trans script but also its man pages. Refer to the link above for more installation details.

```shell
$ git clone https://github.com/soimort/translate-shell
$ cd translate-shell
$ make
$ sudo make install
```

***

### Extension usage

Once installed and enabled, the following shortcuts will be available.

#### Global shortcuts (configurable from the extension settings)

- **<kbd>Super</kbd> + <kbd>T</kbd>:** Open translator dialog.
- **<kbd>Super</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>:** Open translator dialog and translate text from clipboard.
- **<kbd>Super</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd>:** Open translator dialog and translate from primary selection.

#### Shortcuts available on the translation dialog

- **<kbd>Ctrl</kbd> + <kbd>Enter</kbd>:** Translate text.
- **<kbd>Shift</kbd> + <kbd>Enter</kbd>:** Force text translation. Ignores translation history.
- **<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>:** Copy translated text to clipboard.
- **<kbd>Ctrl</kbd> + <kbd>S</kbd>:** Swap languages.
- **<kbd>Ctrl</kbd> + <kbd>D</kbd>:** Reset languages to default.
- **<kbd>Escape</kbd>:** Close dialog.

***

### Extension's settings window

From this extension settings window, all options can be imported, exported and/or reseted to their defaults.

- To be able to perform any of these actions, the settings schema needs to be installed in the system. This is done automatically when the extension is installed from the Cinnamon extensions manager. But if the extension was installed manually, the settings schema also needs to be installed manually. This is achieved by simply going to the extension folder and launch the following command:
    - Command to install the settings schema: `./settings.py install-schema`
    - Command to uninstall the settings schema: `./settings.py remove-schema`
- To import/export settings, the **dconf** command needs to be available on the system.

***

### Extension localization

- If this extension was installed from Cinnamon Settings, all of this extension's localizations were automatically installed.
- If this extension was installed manually and not trough Cinnamon Settings, localizations can be installed by executing the script called **localizations.sh** from a terminal opened inside the extension's folder.
- If this extension has no locale available for your language, you could create it by following [these instructions](https://github.com/Odyseus/CinnamonTools/wiki/Xlet-localization) and send the .po file to me.
    - If you have a GitHub account:
        - You could send a pull request with the new locale file.
        - If you don't want to clone the repository, just create a Gist and send me the link.
    - If you don't have/want a GitHub account:
        - You can send me a [Pastebin](http://pastebin.com/) (or similar service) to my [Mint Forums account](https://forums.linuxmint.com/memberlist.php?mode=viewprofile&u=164858).
- If the source text (in English) and/or my translation to Spanish has errors/inconsistencies, feel free to report them.

### Bug reports, feature requests and contributions

If anyone has bugs to report, a feature request or a contribution, do so on [this xlet GitHub page](https://github.com/Odyseus/CinnamonTools).
