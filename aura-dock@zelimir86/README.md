# Aura Dock

A Cinnamon panel replacement in the style of GNOME **Dash to Dock**: a
floating dock with pinned and running applications, autohide, drag-to-reorder,
right-click menus, indicators, and a quick settings menu.

Built for **Linux Mint 27 (Cinnamon 6.7)** on **Wayland** (also works under
X11). It runs as a Cinnamon extension (an applet would be the only
alternative, but an extension can place a chrome actor at the work-area edge and
react to window changes directly).

## Features

- Pinned **favorites** (shared with the Cinnamon panel/menu favourites).
- Running-application indicators (segmented line under the icon, one segment
  per window, up to 4).
- Left-click activates/focuses/minimizes; middle-click opens a new window.
- Right-click an icon for window list, New window, pin/unpin, Close all.
- Right-click the dock for a quick settings menu (position, icon size,
  autohide, click action, workspace isolation, hover animation, tooltips,
  background opacity).
- Autohide: **Intelligent** (hides when a window overlaps), **Always**,
  **Never**.
- Drag and drop to reorder pinned and running icons.
- Multi-monitor aware (docks on the primary monitor).
- Position on any screen edge; respects the panel on the same edge.

## Requirements

- Linux Mint 27 with Cinnamon 6.x (`cinnamon-version` 5.4–6.12).
- `cinnamon-screenshot` (optional, for your own screenshots).

## Install

```sh
cd aura-dock
./install.sh
```

The script installs into `~/.local/share/cinnamon/extensions/aura-dock@zelimir86`
and enables the extension. **Log out and back in** (or restart Cinnamon) once
for the first install.

### Reload while developing

```sh
./install.sh --reload
```

toggles the extension off and on, so changes are picked up live. JS errors go to
`~/.xsession-errors` (grep `aura-dock`).

### Uninstall

```sh
./uninstall.sh
```

Disables the extension and removes its files; your settings JSON is kept.

## Usage

- Left-click: focus/raise the application (or minimize if it is already
  focused). Middle-click: new window. Right-click: window menu.
- Right-click on empty dock space: quick settings.
- Drag an icon to reorder. Drag a running app into the pinned group to pin it.
- Hover the thin strip at the screen edge to bring the dock back when hidden.

## Settings

Settings are stored in
`~/.config/cinnamon/spices/aura-dock@zelimir86/aura-dock@zelimir86.json`.
The full schema lives in `settings-schema.json`:

| Key | Default | Description |
| --- | --- | --- |
| `dock-position` | `bottom` | Screen edge the dock is attached to. |
| `icon-size` | `48` | Icon size in pixels (24–96). |
| `autohide-mode` | `intelligent` | `intelligent` / `always` / `never`. |
| `autohide-delay` | `350` ms | Pointer-leave delay before hiding. |
| `background-opacity` | `85` % | Opacity of the dock background. |
| `click-action` | `minimize` | `minimize` / `cycle` through windows. |
| `middle-click-action` | `new-window` | `new-window` / `nothing`. |
| `isolate-workspaces` | `false` | Only show windows from the current workspace. |
| `show-all-monitors` | `true` | Include windows from other monitors. |
| `monitor` | `primary` | Which monitor hosts the dock: `primary` / `secondary` / `all`. |
| `animate-hover` | `true` | Animate icons on hover. |
| `show-tooltips` | `true` | Show application tooltips. |
| `edge-margin` | `0` | Gap from the screen edge. |
| `reveal-size` | `4` | Thickness of the autohide trigger strip. |

## Theming

Visuals are driven by `stylesheet.css` (`.aura-dock`, `.aura-dock-icon`,
`.aura-dock-indicator`, `.aura-dock-indicator-segment`, `.aura-dock-trigger`,
`.aura-dock-menu`). Edit the file in
the installed extension directory and reload with `./install.sh --reload`.

## Debugging

The extension publishes itself as `global.auraDock` (useful from Looking Glass
or via `dbus-send ... org.Cinnamon.Eval`), e.g.:

```sh
dbus-send --session --print-reply --dest=org.Cinnamon /org/Cinnamon \
  org.Cinnamon.Eval string:'global.auraDock._dockMenu.toggle()'
```

## Limitations

- Window thumbnails require the window to have been composited at least once;
  very recently created windows may show a text-only row until the next menu
  open.
- Hover-reveal cannot be exercised without a real pointer on Wayland; the
  autohide state machine is otherwise covered by the settings.

## Acknowledgements

This extension was designed and implemented with the assistance of an **AI
coding agent** (Beam, running inside OpenCode). All code, documentation and the
iterative debugging (live Wayland testing, menu layout fixes, autohide edge
cases, multi-monitor hotplug, etc.) were produced collaboratively between the
maintainer and the AI agent.

## License

MIT.
