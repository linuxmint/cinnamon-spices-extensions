# Changelog

## 1.1.0

- Cinnamon's tiling shortcuts, `<Super>` with an arrow key, now place windows
  with Tiler's gaps and reserved space. They behave exactly as they always
  have otherwise, and can be left to Cinnamon from the settings.
- Translations are read from the locale directory under the user data
  directory, where Cinnamon's installer now puts them, so they follow
  `XDG_DATA_HOME`.
- Auto-tile arrangements grow by halving the largest cell rather than adding
  rows, so cells stay even and keep the shape of the screen however many
  windows there are.
- Auto-tile gives a window that cannot shrink into its cell a larger one.
- A window an arrangement has no room for can be left where it is, minimized,
  centered, or cascaded, from a new setting.

## 1.0.0

- Initial version of Tiler.
