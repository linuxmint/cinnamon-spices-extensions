# Transparent panels - A Cinnamon extension

Transparentize your panels when there are no any maximized windows

[![Screenshot](screenshot.png)][repo]

## Themes supported
Transparent panels supports every theme in principle, but there are some themes that may not fit well. For such cases, the authors (or users) of the theme may override the `panel-transparent` class in their `cinnamon.css`, which can be enabled in the extension preferences.

## Installation
### Cinnamon Spices
Download it [from here][spices] or search for _"Transparent panels"_ in your Cinnamon extension settings.
### From source
To download the source and install it, execute the following as a normal user (you will need [git](https://git-scm.com/)).
``` bash
$ git clone --depth 1 https://github.com/germanfr/cinnamon-transparent-panels.git
$ cd cinnamon-transparent-panels/ && ./install.sh
```
The above will download the source from GitHub and it will be copied to your `~/.local/share/cinnamon/extensions/` folder. If you don't have git installed, you can download a zip [from here](https://github.com/germanfr/cinnamon-transparent-panels/archive/master.zip). Run `./install.sh` from the folder extracted from the zip.

## Changelog
See the list of changes on GitHub:  [https://github.com/germanfr/cinnamon-transparent-panels...][commits]

### License
This extension is free software and it's licensed under GPL3.
You should have received an unobfuscated copy of the source code. If you don't, you can get it on [https://github.com/germanfr/cinnamon-transparent-panels][repo]

```
Transparent panels - Cinnamon desktop extension
Transparentize your panels when there are no any maximized windows
Copyright (C) 2016  Germán Franco Dorca

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
```

[repo]: https://github.com/germanfr/cinnamon-transparent-panels
[commits]: https://github.com/germanfr/cinnamon-transparent-panels/commits/master
[spices]: https://cinnamon-spices.linuxmint.com/extensions/view/42
