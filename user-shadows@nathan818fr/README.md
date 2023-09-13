# [User Shadows - A Cinnamon extension][repo]

A Cinnamon extension to customize window shadows.

![Screenshot](./screenshot.png?raw=true)

## Installation

### Cinnamon Spices

Download it [from Cinnamon Spices][spices] or search for _"User Shadows"_ in
your Cinnamon extension settings.

### From source

To download the source and install it, execute the following as a normal user:

```bash
git clone https://github.com/nathan818fr/cinnamon-user-shadows.git
cd cinnamon-user-shadows
npm run install-extension
```

## Issues

If you find any bug, you can report on the [Github issues page][issues].

## Contributing

Contributions are welcome. Please submit pull requests [to the extension
repository][repo] (**not** the Spices repository, which is only a distribution
channel).<br/> It is recommended to open an issue before introducing new
features to discuss them.

## FAQ

### • Can I change the color of the shadow?

No. The APIs required to do that are not exposed to cinnamon extensions.

### • The shadow of some windows is not modified, what to do?

This extension only applies to windows rendered by the cinnamon window manager
(a.k.a. Muffin). It is likely that you are dealing with
[Gtk CSD windows](https://en.wikipedia.org/wiki/Client-side_decoration), whose
shadow is defined by the Gtk theme you are using.

[repo]: https://github.com/nathan818fr/cinnamon-user-shadows
[commits]: https://github.com/nathan818fr/cinnamon-user-shadows/commits/main
[issues]: https://github.com/nathan818fr/cinnamon-user-shadows/issues
[spices]: https://cinnamon-spices.linuxmint.com/extensions/view/88
