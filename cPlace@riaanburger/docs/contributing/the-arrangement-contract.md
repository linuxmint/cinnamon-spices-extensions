
# The Arrangement Contract

cPlace is split into two parts. An arrangement works out where each window
should go, and returns that as a list of positions. The engine does everything
else: it finds the windows, shows the chooser, keeps the settings, and moves the
windows to the positions the arrangement returned.

The contract is what passes between the two, the types in `src/arrangement.ts`.
This document explains each part of it and why it is as it is, so read it before
writing an arrangement of your own. [Writing an
Arrangement](writing-an-arrangement.md) then walks through building one.


## An Arrangement Is a Pure Function

An arrangement takes an `ArrangementInput` and returns a list of `WindowTarget`.
It keeps no state between calls, holds no live window, reads no clock, draws no
random number, and knows nothing of what a window shows. The same input gives
the same targets every time.

Three things in cPlace rest on that. A test is a table: input in, expected
targets out, run under Node with no desktop, which is how every arrangement in
`src/arrangements/` is tested. The chooser's preview is the same call as Apply,
made with the same input, so what the preview draws is what Apply does. And a
preset holds settings and the applications to tick, never windows, so running
one is a fresh call with the windows open now; there is no stored layout to go
stale when a window closes.


## What an Arrangement Receives

`workArea` is the part of the monitor the panels leave free. Rectangles are in
the screen's coordinates, the ones the work area itself is given in, so a frame
in the work area's top-left corner has the work area's `x` and `y`, and an
arrangement adds them to whatever it works out from zero.

On a desktop of more than one monitor, `workArea` is one monitor's: the one the
focused window stands on, where the chooser opens. `workAreas` holds every
monitor's work area, that one among them, in the screen's coordinates too. An
arrangement that places windows within its work area, as most do, never reads
it. Recorded reads it, because it puts each window back on the monitor it was
recorded on. The engine always gives it, and an arrangement that reads it takes
its absence, in a test that leaves it out, to mean `workArea` alone.

`windows` holds a numeric id and the frame each window occupies now. The id is
an opaque token the engine maps back to a live window: compare it and return it,
and read nothing into it. The windows arrive in the order the engine means them
to stack, bottom to top, which is also the order to deal them into slots in. The
chooser orders them by title, ignoring case and accents, and a page may have the
focused window lead or send an application's windows to the end. Every window
given takes part: the user chose them by ticking them, so an arrangement doesn't
filter.

`settings` are the arrangement's own, as plain data. The page resolves anything
relative before the call, such as a stored width of 0 meaning half the work
area, so the arrangement works in pixels.


## What an Arrangement Returns

One `WindowTarget` per window it places: the window's id and the frame to put it
in. The list's order is the stacking order, bottom to top. The engine applies
the targets in that order, taking each window out of fullscreen or maximised,
moving it, showing it if it was minimised, and raising it, so the last target
ends on top. A window with no target is left where it is, and a target whose id
wasn't in the input is discarded.

A target reaching outside the work area is the arrangement's bug, since the
engine never corrects a frame. An arrangement whose rule can overshoot, such as
the cascade with a negative margin, cuts its frames back with `trimmed` from
`src/arrangements/trim.ts`.


## Whole Pixels

Frames are whole pixels, so an arrangement that shares a length out has to
decide where the leftover pixels go. The tilings cut at edges rather than at
sizes: `spanEdges` in `src/arrangements/spans.ts` puts each edge at the whole
pixel nearest the exact cut, and each piece runs from one edge to the next. The
pieces then fill the length with no gap and no overlap, each within a pixel of
its share, and the last ends on the far edge. Use it for any split, even or
weighted; rounding each size on its own leaves gaps or overlaps that add up
across a row.

A single leftover pixel, such as when centring an odd width, is the
arrangement's own choice. Make it once and say in the module's opening comment
which way it goes.


## One Window at a Time

The grid places the focused window into cells the user picks by clicking, which
looks like a different kind of arrangement. It fits the same contract: the
picking is the page's, and what crosses the contract is a list of windows and,
as settings, the cells chosen. An arrangement driven by a gesture of its own
brings a page for that gesture and keeps its arithmetic pure in the same way.


## Settings Outlive a Release

Once people have installed cPlace, their settings file and their presets are a
format their desktops depend on. When a new version's schema loads, Cinnamon
keeps the value of every key both versions declare and drops the rest, so a key
added is safe, and a key renamed, removed or given a new meaning loses or
misreads what somebody set. The same holds for the presets, which are JSON
stored in a setting, and for the variables each page puts into them.

So from version 1.0.0, a key or a preset's variable is never renamed, removed or
given a new meaning without code that carries the old value over when cPlace
loads. Add a key rather than change one, and give it a default that leaves
behaviour as it was. A pull request that changes the format without the code
that carries it over will be asked for it.
