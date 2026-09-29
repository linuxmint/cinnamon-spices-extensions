
# Writing an Arrangement

An arrangement is one rule for where windows go in cPlace, such as the cascade
or the grid. Each sits in the chooser beside the others, with its own letter,
settings and presets, and cPlace does the rest, from listing the windows to
moving them.

This guide is for a developer who wants to add one. It takes you from an empty
file to an arrangement that works in the chooser and is ready to send, by
building a small example, Centred, in full. Centred puts every ticked window at
one size in the middle of the screen, piled in the order given with the last on
top. Its rule is a few lines of arithmetic, so most of each step is what any
arrangement needs. Work through the sections in order, and swap Centred's rule
for your own as you go.

The arrangement, its tests, its page and its settings, as shown here, are what
`tools/check.sh docs` compiles and tests, so what you copy matches the rest of
cPlace as it stands.

You'll need to read TypeScript, and have a Cinnamon desktop to try the result
on. Read [The Arrangement Contract](the-arrangement-contract.md) first. It is
short, and it explains the rules this guide follows without restating them: what
an arrangement is given, what it returns, and why it may not touch a window
itself.


## What an Arrangement Touches

An arrangement is six changes, three of them new files:

- `src/arrangements/centred.ts`, the arrangement, a pure function.
- `tests/centred.test.ts`, its tests.
- `src/engine/pages/centred.ts`, its page in the chooser.
- `src/settings-schema.json`, which declares every setting the page keeps.
- `src/extension.ts`, which adds the page to the chooser.
- `README.md`, which tells users each arrangement, its letter and its settings.


## Write the Arrangement

The arrangement imports nothing from Cinnamon, only the contract's types and,
here, the trimming helper, since a size larger than the work area would
otherwise put a window past its edges. Its settings are an interface of plain
numbers, and it works in pixels. It places windows within `workArea`, which on a
desktop of more than one monitor is the monitor the chooser opened on, so it
leaves the input's `workAreas`, every monitor's, unread.

<!-- example: src/arrangements/centred.ts -->

```ts
// Centred: every window at one size, centred in the work area and piled in
// the order given, the last on top. An odd pixel left over puts the window a
// pixel nearer the top-left, and a size larger than the work area is trimmed
// to it, so no window leaves the work area.

import type { ArrangementInput, WindowTarget } from "../arrangement";
import { trimmed } from "./trim";

export interface CentredSettings {
    width: number;
    height: number;
}

export function centred(
    input: ArrangementInput<CentredSettings>,
): WindowTarget[] {
    const { workArea, windows, settings } = input;
    const frame = trimmed(workArea, {
        x: workArea.x + Math.floor((workArea.width - settings.width) / 2),
        y: workArea.y + Math.floor((workArea.height - settings.height) / 2),
        width: settings.width,
        height: settings.height,
    });
    return windows.map((window) => ({ id: window.id, frame: { ...frame } }));
}
```


## Test It

A test is a table: an input, and the targets you worked out by hand before
running the function, so that a disagreement is a finding rather than a number
to paste in. The tests run under Node's own test runner, with no desktop. The
assertions available are the ones `types/node-test.d.ts` declares; declare
another there to use it.

<!-- example: tests/centred.test.ts -->

```ts
// Contract tests for Centred: input in, expected targets out, no desktop.
// Every expected number was worked out by hand before the function ran.

import { test } from "node:test";
import { deepEqual } from "node:assert/strict";

import type { ArrangementWindow, Rectangle } from "../src/arrangement";
import { centred } from "../src/arrangements/centred";

const workArea: Rectangle = { x: 0, y: 40, width: 1920, height: 1040 };

function windows(ids: number[]): ArrangementWindow[] {
    return ids.map((id) => ({
        id,
        frame: { x: 0, y: 0, width: 1, height: 1 },
    }));
}

test("every window takes the one centred frame, in the order given", () => {
    deepEqual(
        centred({
            workArea,
            windows: windows([3, 1, 2]),
            settings: { width: 1200, height: 800 },
        }),
        [3, 1, 2].map((id) => ({
            id,
            frame: { x: 360, y: 160, width: 1200, height: 800 },
        })),
    );
});

test("a size larger than the work area is trimmed to it", () => {
    deepEqual(
        centred({
            workArea,
            windows: windows([1]),
            settings: { width: 2000, height: 800 },
        }),
        [{ id: 1, frame: { x: 0, y: 160, width: 1920, height: 800 } }],
    );
});
```


## Give It a Page

A page is what the chooser shows below the choice of arrangement. There are two
ways to make one.

- Extend `ListPage` from `src/engine/pages/list-page.ts`, as the cascade and
  Columns do. It builds the list of windows to tick, the preview, and the column
  of variables beneath the preview, and it applies, previews and keeps presets
  for you.
- Implement `ArrangementPage` from `src/engine/page.ts` directly, as the grid
  does, for an arrangement with a gesture of its own, such as the grid's two
  clicks on its cells.

A list page names its arrangement and supplies what differs between
arrangements:

- `key`, which names the page's presets and begins each of its settings' keys.
- `letter`, the key that selects the arrangement in the chooser: one lowercase
  letter no other page uses, and never `u`, which undoes. The chooser takes a
  page's letter before any page sees the key. Each page's `letter` is in its
  module in `src/engine/pages/`, so `grep -n 'letter =' src/engine/pages/*.ts`
  lists the letters taken.
- `settings()`, which reads the page's settings and resolves them to pixels. A
  user can edit the settings file by hand, so hold a value that has bounds to
  them here, as Columns holds its count to its spin's.
- `buildControls()`, the column beneath the preview.
- `restoreVariables()`, which writes a preset's values back.
- `note()`, a phrase the preview adds to its caption after the work area's size
  and the count of windows, which the caption lists with commas, or nothing.
- `describe()`, the line naming a preset on its row.

A preset saves what `settings()` returns, with the applications ticked, never
the windows themselves.

Every word the page shows goes through `_()` from `src/i18n.ts`, or `ngettext()`
where it counts something, so that translators can reach it. Write each as a
whole phrase, with any number or name in it as a named token that `fill()` puts
in, as `fill(_("{width} × {height}"), { width, height })` does, since a
translator may need to move it. `tools/check.sh lint` fails on a bare string in
a label, a heading, a hint or a page's name. A module's variables are made when
cPlace loads, before it reads its translations, so give a variable's name as a
function, `name: () => _("width")`.

The constructor's second argument says how the list orders the windows beyond
their titles. With `focusedFirst` the focused window leads, so Columns puts it
in the first cell. With `sendsToEnd` each application's row gets an arrow that
sends its windows after all the others, so the cascade puts them on top. A page
uses one or neither, and Centred uses neither, so its pile stands in title
order.

<!-- example: src/engine/pages/centred.ts -->

```ts
// Centred's page: the window list to tick, the preview, and the width and
// height, each a spin that writes through the settings store. ListPage
// builds the rest and keeps the presets.

import type { WindowTarget } from "../../arrangement";
import type { CentredSettings } from "../../arrangements/centred";
import { centred } from "../../arrangements/centred";
import { currentWorkArea } from "../gather";
import type { ArrangementPage, PresetVariables } from "../page";
import { _, fill } from "../../i18n";
import type { EngineSettings } from "../settings";
import type { NumberVariable } from "../variables";
import { ListPage } from "./list-page";

// A stored side of 0 means half the work area's, so a first pile fits any
// screen, and the spin shows the pixels that comes to.
const width: NumberVariable = { key: "centred-width", name: () => _("width"), fallback: 0, min: 100, max: 10000, steps: [1, 10, 100] };
const height: NumberVariable = { key: "centred-height", name: () => _("height"), fallback: 0, min: 100, max: 10000, steps: [1, 10, 100] };

function sideOr(stored: number, extent: number): number {
    return stored > 0 ? stored : Math.floor(extent / 2);
}

class CentredPage extends ListPage<CentredSettings> {
    readonly key = "centred";
    readonly letter = "e";
    readonly name = _("Centred");
    protected readonly arrangement = centred;

    constructor(store: EngineSettings) {
        super(store, { focusedFirst: false, sendsToEnd: false });
    }

    describe(variables: PresetVariables): string {
        const { width: across, height: down } = variables;
        return typeof across === "number" && typeof down === "number"
            ? fill(_("{width} × {height}"), { width: across, height: down })
            : "?";
    }

    protected settings(): CentredSettings {
        const room = currentWorkArea();
        return {
            width: sideOr(this.store.number(width.key, 0), room.width),
            height: sideOr(this.store.number(height.key, 0), room.height),
        };
    }

    protected buildControls(): imports.gi.St.BoxLayout {
        const room = currentWorkArea();
        return this.variablesColumn([
            { ...width, shown: (stored) => sideOr(stored, room.width) },
            { ...height, shown: (stored) => sideOr(stored, room.height) },
        ]).actor;
    }

    protected restoreVariables(values: PresetVariables): void {
        if (typeof values["width"] === "number") {
            this.store.write(width.key, values["width"]);
        }
        if (typeof values["height"] === "number") {
            this.store.write(height.key, values["height"]);
        }
    }

    protected note(targets: WindowTarget[]): string {
        const frame = targets[0]?.frame;
        return frame === undefined
            ? ""
            : fill(_("each {width} × {height}"), {
                  width: frame.width,
                  height: frame.height,
              });
    }
}

export function centredPage(store: EngineSettings): ArrangementPage {
    return new CentredPage(store);
}
```

A page can't be tested under Node, because it builds Cinnamon's widgets and
reads the desktop as it loads. Keep whatever can be decided without a desktop in
the arrangement, or in a module that imports nothing from Cinnamon, and test it
there; the page itself is tried in Cinnamon, as the last section describes.


## Declare Its Settings

Every key a page reads or writes has to be declared in
`src/settings-schema.json`. Cinnamon answers a read of an undeclared key with
nothing, so the page quietly gets its fallback, and it drops a write to one,
logging only that the key wasn't found. The header gives the arrangement a
section in cPlace's settings dialogue.

<!-- example-merge: src/settings-schema.json -->

```json
{
    "centred-header": {
        "type": "header",
        "description": "Centred"
    },
    "centred-width": {
        "type": "spinbutton",
        "default": 0,
        "min": 0,
        "max": 10000,
        "step": 10,
        "units": "px",
        "description": "Width of every centred window; 0 for half the work area's"
    },
    "centred-height": {
        "type": "spinbutton",
        "default": 0,
        "min": 0,
        "max": 10000,
        "step": 10,
        "units": "px",
        "description": "Height of every centred window; 0 for half the work area's"
    }
}
```

Place the entries beside the other arrangements' sections, before the chooser's
own. When cPlace next loads with a changed schema, Cinnamon upgrades the user's
settings file, keeping the value of every key both versions declare. So once a
key has been released, its name and meaning are fixed, as [Settings Outlive a
Release](the-arrangement-contract.md#settings-outlive-a-release) explains.


## Add It to the Chooser

In `src/extension.ts`, import the page's factory and add it to the list of pages
the chooser is given. The list's order is the order of the chooser's arrangement
buttons.

```ts
import { centredPage } from "./engine/pages/centred";
```

```ts
            recordedPage(engineSettings),
            centredPage(engineSettings),
```


## Check and Try It

`tools/check.sh all` type-checks and builds the extension, runs the tests,
reports the lint, and checks these documents. Its readability limits are
warnings, which point out a file grown past the size most files stop at and fail
nothing. Run it before you change anything to see the warnings that stand
already; a new arrangement should add none.

To try the page in Cinnamon, build the development tree and link it into the
folder Cinnamon loads extensions from, then turn cPlace on under System
Settings, Extensions:

```sh
tools/build.sh
ln -s "$PWD/build/cPlace@riaanburger" ~/.local/share/cinnamon/extensions/
```

After each rebuild, restart Cinnamon with Alt+F2, then `r` and Enter, which
works in an X11 session. `Super+Z` opens the chooser, and `e` selects Centred.
Anything cPlace logs is in `~/.xsession-errors`, and in the log tab of Looking
Glass, which Alt+F2 then `lg` opens.

The development build registers a handle on Cinnamon's global object,
`global.cPlaceDev`, for driving the chooser from Looking Glass while working on
it. `tools/build.sh --release` builds without it, into `files/`, the folder the
Spices install from.


## Send It

cPlace is published through Linux Mint's Spices, and its source lives there too,
in the `cPlace@riaanburger` folder of the `cinnamon-spices-extensions`
repository on GitHub, beside the built extension in `files/`. An arrangement
reaches other people as a pull request to that repository:

1. Fork the repository on GitHub, clone your fork, and work in its
   `cPlace@riaanburger` folder, running `npm install` there.
2. Make your changes, and run `tools/check.sh all` until it passes.
3. Run `tools/build.sh --release`, which rebuilds `files/cPlace@riaanburger/`,
   so that what the Spices install matches your source. If you added or changed
   any words, run `tools/makepot.sh` too, which writes the translation template
   the build check compares.
4. Commit the source and `files/` together, and open a pull request against the
   repository's `master` branch, saying what the arrangement does and which
   letter it takes.

Mint's reviewers hold a pull request that changes how a spice works until its
author has approved it, so cPlace's author reviews yours before it is merged.
Keep it to one arrangement, or one change, so that it can be read in one
sitting.
