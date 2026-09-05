# Changelog

## 1.1.0

- Cinnamon's tiling shortcuts, `<Super>` with an arrow key, now place windows
  with Tiler's gaps and reserved space. They behave exactly as they always
  have otherwise, and can be left to Cinnamon from the settings.
- Auto-tile arrangements grow by halving the largest cell rather than adding
  rows, so cells stay even and keep the shape of the screen however many
  windows there are. A window that cannot shrink into its cell is given a
  larger one, and windows kept always on top, such as a picture-in-picture
  player, are left floating.
- A new setting says what becomes of a window an arrangement has no room
  for: left where it is, minimized, centered, or cascaded.
- Windows that keep their shape, like video players, are fitted into their
  cell at that shape rather than overhanging it, however they are tiled.
- Translations are read from the locale directory under the user data
  directory, where Cinnamon's installer now puts them, so they follow
  `XDG_DATA_HOME`.

## 1.0.0

- Initial version of Tiler.
