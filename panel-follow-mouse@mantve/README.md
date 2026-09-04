# Panel Follow Mouse

Moves a Cinnamon panel to the monitor you hold the cursor against.

## Usage

Hold the cursor against the panel-position edge of a monitor that doesn't
have the panel (bottom edge for a bottom panel, left edge for a left panel,
and so on). After the configured hold time the panel moves there; moving
away before that cancels the switch.

Seams between monitors are never blocked or triggered, so moving between
screens always behaves normally. Edge triggering is suspended on a monitor
while an app is fullscreen there.

## Settings

- **Panel ID** - which panel follows the mouse. The Detect button fills it
  in automatically.
- **Hold time** - how long the cursor must stay against the edge.

## Limitations

The panel is only summoned by holding its own edge. With vertically stacked
monitors and a bottom panel, the upper monitor's bottom edge is the seam, so
it has no trigger spot. Per-monitor panel heights (`panels-height`) are not
moved along with the panel.
