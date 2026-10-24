
# cPlace

cPlace arranges the windows on a Cinnamon desktop. `Super+Z` opens a chooser
listing the windows on the current workspace by application: tick the ones to
arrange, pick an arrangement, watch the preview, and apply. Arrangements you use
often are kept as presets on the digits, one key each.

![The chooser on the cascade, with seven windows ticked and the preview showing
where each will go](https://cinnamon-spices.linuxmint.com/git/extensions/cPlace@riaanburger/docs/screenshots/chooser.png)


## Arrangements

- Cascade puts every window at one size, each offset from the one before along a
  diagonal, so a sliver of every window stays in view and any of them can be
  raised with a click. It starts from the corner you choose, can spread the
  windows across the whole screen, and can send an application's windows to the
  end.
- Columns deals the windows into equal columns, as many rows as it takes. It can
  fill an area picked as grid cells on the preview, leaving the rest of the
  screen for a main window placed with the grid.
- Grid places the focused window into cells picked with two clicks, or with the
  arrow keys, on a layout of your choice; layouts with uneven columns and rows,
  such as a wide middle column, are set in cPlace's settings.
- Recorded remembers where the ticked windows stand and puts them back later,
  finding each window by its application and title.

![Seven windows cascaded from the top-left corner, with the chooser open over
them](https://cinnamon-spices.linuxmint.com/git/extensions/cPlace@riaanburger/docs/screenshots/cascade.png)

![The Columns page, dealing seven windows into two
columns](https://cinnamon-spices.linuxmint.com/git/extensions/cPlace@riaanburger/docs/screenshots/columns.png)

![The Grid page, placing the focused window across four cells of a five by five
layout](https://cinnamon-spices.linuxmint.com/git/extensions/cPlace@riaanburger/docs/screenshots/grid.png)


## The Chooser's Keys

- `c`, `n`, `g`, and `r` choose Cascade, Columns, Grid, and Recorded.
- `Tab` moves between the chooser's parts and `Space` ticks a window or an
  application.
- `Enter` arranges the ticked windows, as Apply does, and `Escape` closes the
  chooser without changing anything.
- `Ctrl` and a digit saves what the chooser shows as a preset on that digit, and
  the digit alone applies it. On the number row a digit key works by its place,
  so a keyboard that needs `Shift` for digits needs none here.
- `Delete`, or the × on a preset's row, asks first by turning the row to the
  theme's warning colour; a second `Delete` removes the preset, and any other
  key keeps it.
- `u` puts back what the last arrangement moved: positions and sizes, and
  whether each window was maximised, fullscreen, or minimised. The stacking
  order stays as the arrangement left it.

On the grid, the arrow keys move the cells, `Shift` and an arrow grows them, and
`Enter` places the window.


## What a Preset Keeps

A preset keeps an arrangement's settings and the applications ticked, never the
windows themselves, so it works with whatever windows are open when you use it.

A recording is the exception. It keeps the title and position of each window it
recorded, and a title can hold a document's name or an email's subject.
Recordings are stored with the rest of cPlace's settings, in this file, and
deleting a recording removes it from there:

- `~/.config/cinnamon/spices/cPlace@riaanburger/cPlace@riaanburger.json`

cPlace never opens a closed window. Recorded puts back the windows that are open
and leaves the rest of the recording as it is.


## Settings

cPlace's settings are under System Settings, Extensions, with the gear beside
cPlace:

- the key that opens the chooser;
- the applications ticked when it opens, by default the focused window's;
- the cascade's window size, offsets, margins and starting corner;
- the number of columns;
- the grid's layouts.

The chooser changes the same settings as you use it.

The chooser takes its colours from your Cinnamon theme and its sizes from your
desktop's font and scale.


## Requirements and Limitations

- Cinnamon 5.4 to 6.6, which is Linux Mint 21 to 22.3, in an X11 session or in
  Cinnamon's Wayland session, which Cinnamon itself still calls experimental.
- More than one monitor. cPlace arranges on the monitor the focused window
  stands on, and the chooser opens there. Windows on other monitors are listed
  apart, under their monitor's name, and are left where they are unless you tick
  them. A recording puts each window back on the monitor it was recorded on.
- The current workspace. The chooser lists and arranges only its windows.


## Installation

In System Settings, open Extensions, choose the Download tab, and find cPlace.
Install it, return to the Manage tab, select cPlace, and turn it on with the +
button. Then press `Super+Z`.


## Working on cPlace

cPlace is written in TypeScript and bundled for Cinnamon with esbuild. After
`npm install`:

- `tools/build.sh` builds the extension into `build/cPlace@riaanburger/`, for
  development, and `tools/build.sh --release` into `files/cPlace@riaanburger/`,
  the folder the Spices install from.
- `tools/check.sh all` checks the types, builds, runs the tests, reports the
  lint, and checks the contributor documentation.

To run your build, link `build/cPlace@riaanburger` into
`~/.local/share/cinnamon/extensions/`, turn cPlace on under System Settings,
Extensions, and restart Cinnamon after each rebuild with Alt+F2, then `r`, in an
X11 session.

```pre
src/               the extension: the arrangements, the engine, the chooser
tests/             tables over the pure functions, run with no desktop
types/             declarations for what @ci-types/cjs leaves out
tools/             the build and the checks
docs/contributing/ the arrangement contract and how to write an arrangement
files/             the release build, as the Spices install it, and its po/
```

To add an arrangement of your own, start with [Writing an
Arrangement](https://github.com/linuxmint/cinnamon-spices-extensions/blob/master/cPlace@riaanburger/docs/contributing/writing-an-arrangement.md), which ends with how
to send it. Translations go in `files/cPlace@riaanburger/po/`, as for any spice.

cPlace's types for Cinnamon's JavaScript come from `@ci-types/cjs`, at
<https://github.com/Gr3q/types-cjs>. The weather and radio applets among the
Spices are written in TypeScript too, and gTile, at
<https://github.com/shuairan/gTile>, is the tiling extension cPlace's grid
learnt from.


## Licence

Copyright 2026 Riaan Burger

cPlace is free software under the GNU General Public License, version 2 or any
later version. The licence is in `LICENSE`.
