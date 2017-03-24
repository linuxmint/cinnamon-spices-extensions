## Extension status

- Extension ready to be translated.
- Extension [published on the Spices repository](https://github.com/linuxmint/cinnamon-spices-extensions/pull/26) to be reviewed on **March 18, 2017**.

The Multi Translator extension is an extension ported from a gnome-shell extension called [Text Translator](https://github.com/gufoe/text-translator) by [gufoe](https://github.com/gufoe).

## Differences with the original extension

* [x] Removed instant translation and auto-speak options to avoid translation service *abuse*.
* [x] Themable interface.
* [x] ~Migrated to Cinnamon's native settings system.~ Came back to a custom settings window.
* [x] Unified all .js files into just one.
* [x] Obvious needed changes like changing all gnome-shell APIs usage to Cinnamon's, changed the use of JavaScript classes to prototypes, etc.

## Dependencies

**If one or more of these dependencies are missing in your system, you will not be able to use this extension.**

- **xsel** command: XSel is a command-line program for getting and setting the contents of the X selection.
- **trans** command: Command provided by the package translate-shell. Is a simple command line interface for several translation providers (Google Translate, Yandex Translate, Bing Translator and Apertium) which allows you to translate strings in your terminal.
    - Check translate-shell [dependencies](https://github.com/soimort/translate-shell#dependencies) and [recommended dependencies](https://github.com/soimort/translate-shell#recommended-dependencies).

**Note:** The translate-shell package available on Ubuntu 16.04.x/Linux Mint 18.x repositories is outdated and broken. It can be installed anyway so it will also install its dependencies. But updating to the latest version should be done as described bellow.

## How to install latest version of translate-shell

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

## Extension usage

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

## Tested environments

* [x] ![Cinnamon 2.8](https://odyseus.github.io/CinnamonTools/lib/badges/cinn-2.8.svg) ![Linux Mint 17.3](https://odyseus.github.io/CinnamonTools/lib/badges/lm-17.3.svg)
* [x] ![Cinnamon 3.0](https://odyseus.github.io/CinnamonTools/lib/badges/cinn-3.0.svg) ![Linux Mint 18](https://odyseus.github.io/CinnamonTools/lib/badges/lm-18.svg)
* [x] ![Cinnamon 3.2](https://odyseus.github.io/CinnamonTools/lib/badges/cinn-3.2.svg) ![Linux Mint 18.1](https://odyseus.github.io/CinnamonTools/lib/badges/lm-18.1.svg)

**Note on Cinnamon 2.8.x:** All issues on this version of Cinnamon are as fixed as they going to get. It's a complete nightmare working on this version of Cinnamon, so I simply gave up trying to fix the unfixable. My guess is that Cinnamon 2.8.x uses an *ultra-antique* version of GTK3 (3.10), and all APIs available on this version of GTK3 behave totally different than the APIs found on current versions of GTK3. Throughout the extension code it can be seen how I'm forced to use totally different Clutter elements depending on the version of Cinnamon that is used.

### Known issues

- Up until now, all known issues are aesthetics.
    1. ~~In Cinnamon 2.8.x, on small screen resolutions (1024x768), some elements at the bottom of the translation dialog are rendered outside the dialog itself. **Workaround:** Set the dialog to occupy more screen percentage (90% width and 70% height for example).~~ Fixed.
    2. ~~In Cinnamon 2.8.x, none of the elements inside the translation dialog are aligned how they are supposed to. **Workaround:** None. Working on it.~~ Fixed.
    3. ~~In Cinnamon 2.8.x, when some of the elements that auto-hide themselves are hidden/shown, all the elements inside the dialog start *dancing*. **Workaround:** None. Might be related to point **2**. Working on it.~~ Fixed.
    4. ~~In Cinnamon 3.0.x and 3.2.x, on small screen resolutions (1024x768) and using the Mint-Y theme, an element at the bottom of the translation dialog that doesn't belong to the dialog is rendered outside the dialog itself (Might be similar to point **1**). **Workaround:** Have no idea. Must be a bug with the Mint-Y themes family or it is visible simply because the Mint-Y themes set the background color for the **modal-dialog-button-box** class. The element displayed outside the dialog isn't even added by this extension, it's a button container that should be invisible if empty. But with the Mint-Y theme is visible even when empty.~~ Fixed.

## ToDo

### Multi Translator extension ToDo list:

* [x] **Test extension on all currently supported versions of Cinnamon**
* [x] **Switch back to a custom settings window** Cinnamon's native settings system is very practical, but it's also very limited. There are certain settings that can be modified in the gnome-shell extension (the extension Multi Translator is based on) that aren't possible to modify using Cinnamon's native settings system. So, I will give a try to a custom one.
* [x] **Add the possibility to select a custom theme**
* [x] **Add "Service provided by Service provider name" notice** This is needed to comply with the terms of use for the translation services.
* [x] **Implement a mechanism to check for dependencies**
* [x] **Provide alternate methods in case translate-shell breaks or doesn't exists (manually configurable or automatic)**
    - There are a total of 3 translation services that doesn't require translate-shell. For now, this should suffice.
* [x] **Add more translation providers that doesn't require the use of translate-shell**
    - Added another Google Translate method that makes use of the mechanism used by the Google Translate Chrome extension.
    - Added **Transltr** service. The only translation service on the face of the earth with a public API and that makes no use of API keys. Lets enjoy it while it lasts (LOL).
* [x] **Create the translation template**
* [x] **Add more translation providers:** At least as much as translate-shell supports.
* [x] **Add Yandex API keys configuration**
* [x] **Make Yandex API keys usage random**
* [x] **Implement translation history**
* [x] **Keep looking for a way to reload the themes without the need to restart Cinnamon** Keep in mind the comment block in extension.js>TranslatorExtension>_loadTheme().
* [x] **Create the dark Linux Mint theme**
* [x] **Add translation mechanism**
* [x] ~**Change all synchronous functions to asynchronous**~ Abandoned idea.
* [x] ~**Create a mechanism to display statistics**~ Abandoned idea.

### Images

##### Dialog translation images

![Translation dialog](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-001-trans-dialog.png)

[Source language selection](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-002-souce-lang-selection.png) - [Target language selection](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-003-target-lang-selection.png) - [Translation provider selection](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-004-trans-provider-selection.png) - [Main menu](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-005-main-menu.png) - [Quick help](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-006-quick-help.png)

##### Settings window image

![MultiTranslatorExtension-options](https://odyseus.github.io/CinnamonTools/lib/img/MultiTranslatorExtension-options.gif)

## Issue reports

**Issue reporters should adjunct the output of the following commands.**
**Check the content of the log files for sensible information BEFORE running the commands!!!**

`inxi -xxxSc0 -! 31`
`pastebin ~/.cinnamon/glass.log`
`pastebin ~/.xsession-errors`

**References to anyone that could be interested in testing the extension.**

@buzz @copecu @fortalezense @maladro1t @NikoKrause @pizzadude @Radek71 @sphh
