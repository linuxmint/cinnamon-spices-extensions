# [Back to Monitor - A Cinnamon extension][repo]

A Cinnamon extension to move windows back to their original location when (re-)connecting a monitor.

![Screenshot](./screenshot.png?raw=true)

## Features

-   Remember window locations based on monitor connection (can be switched on/off)
-   Minimize windows when a monitor is disconnected (can be switched on/off)

The goal of this extension is **only** to operate on windows that are moved automatically when a monitor is disconnected.<br/>
It is therefore not possible (and will never be) to create/save/restore layouts on demand.

## Installation

### Cinnamon Spices

Download it [from Cinnamon Spices][spices] or search for _"Back to Monitor"_ in your Cinnamon extension settings.

### From source

To download the source and install it, execute the following as a normal user:

```bash
git clone git@github.com:nathan818fr/cinnamon-back-to-monitor.git
cd cinnamon-back-to-monitor
npm run install-extension
```

## Issues

If you find any bug, you can report on the [Github issues page][issues].

## Contributing

Contributions are welcome. Please submit pull requests [to the extension repository][repo] (**not** the Spices repository, which is only a distribution channel).<br/>
It is recommended to open an issue before introducing new features to discuss them.

## FAQ

### • Tiled/snapped windows are not restored correctly

The required APIs are not exposed to cinnamon extensions.<br/>
Therefore, tiled/snapped windows can only be restored to the predefined dimensions.

### • Fullscreen windows are not restored

Before Cinnamon 5.4, the required APIs were not exposed to cinnamon extensions.<br/>
In this case, the fullscreen windows will be ignored.

With Cinnamon 5.4 and above, the fullscreen windows will be restored correctly!

### • The "Always on Visible Workspace" option is not restored

The required APIs are not exposed to cinnamon extensions.<br/>
Therefore, windows that had this option enabled will not keep it. Instead, they will be moved to the last workspace where they were present.

[repo]: https://github.com/nathan818fr/cinnamon-back-to-monitor
[commits]: https://github.com/nathan818fr/cinnamon-back-to-monitor/commits/main
[issues]: https://github.com/nathan818fr/cinnamon-back-to-monitor/issues
[spices]: https://cinnamon-spices.linuxmint.com/extensions/view/89
