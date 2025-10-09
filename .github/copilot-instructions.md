This repository contains the Cinnamon "spices" (extensions) collection. The goal of these instructions is to help AI coding agents become productive quickly by describing the repository layout, developer workflows, and recurring patterns.

Key points (quick):
- Each spice is a top-level directory named by its UUID (for example `auto-move-windows@JeffHanna`).
- The runtime content for Cinnamon lives under `UUID/files/UUID/` (e.g. `auto-move-windows@JeffHanna/files/auto-move-windows@JeffHanna/extension.js`).
- Metadata for Cinnamon is in `UUID/files/UUID/metadata.json`. Repository-level metadata (author/license) is in `UUID/info.json`.
- Validation and local testing scripts at the repo root are the authoritative commands you should use: `./validate-spice UUID` and `./test-spice UUID`.

What to change and why:
- Prefer editing files inside the spice directory (top-level UUID files) and the runtime `files/UUID/` bundle in parallel so the zip produced by the site remains consistent.
- When adding or changing behavior that runs in Cinnamon, update `files/UUID/extension.js` and `files/UUID/metadata.json` together.

Developer workflows (concrete commands):
- Validate a spice before proposing changes:
  - ./validate-spice UUID
- Copy a spice for local Cinnamon testing (recommended):
  - ./test-spice UUID
  - To skip validation (only for rapid experiments): `./test-spice -s UUID`
  - Remove all dev-test copies: `./test-spice -r`
- Update translations and test `.po` files with: `./cinnamon-spices-makepot UUID --install`

Conventions and patterns to follow (examples):
- Keep `UUID/files/` directory containing only the `UUID` directory. The test and validation tooling assumes this layout (see top-level `README.md`).
- Use `metadata.json` fields for compatibility ranges. Example: `files/auto-move-windows@JeffHanna/metadata.json` contains `"cinnamon-version": ["4.0", "5.6"]`.
- Author/maintainer identity is authoritative in `UUID/info.json` (used during PR review to determine review rules).

Common extension JS patterns you will see (and how to modify safely):
- Basic extension skeleton (init/enable/disable) — example: `auto-move-windows@JeffHanna/files/…/extension.js`.
  - Preserve the `init(metadata)`, `enable()`, and `disable()` entrypoints; Cinnamon expects those to exist.
  - Use `imports.ui.main`, `imports.ui.settings`, and `imports.gi` for interacting with Cinnamon and GNOME/Gjs APIs.

Testing and CI hints:
- The repository includes a `Validate spices` GitHub Action. Keep changes compatible with `validate-spice` (this script enforces the file layout and basic sanity checks).
- Avoid adding heavy native build steps; spices are interpreted JS/CSS resources packaged as ZIPs.

When editing multiple spices:
- Make minimal, scoped changes. If a PR modifies multiple authors' spices, reviewers will check that the author field in each `UUID/info.json` matches the PR author (top-level README.md policy).

Examples to reference when implementing changes:
- Layout and runtime code: `auto-move-windows@JeffHanna/files/auto-move-windows@JeffHanna/extension.js`
- Spice metadata: `auto-move-windows@JeffHanna/files/auto-move-windows@JeffHanna/metadata.json` and `auto-move-windows@JeffHanna/info.json`
- Root-level tooling: `validate-spice`, `test-spice`, and `cinnamon-spices-makepot` (see `README.md` for usage)

Do NOT assume:
- System-wide package installation. Testing is done by copying into Cinnamon via `test-spice` rather than installing packages. Don't write instructions requiring distro packaging unless the spice already contains packaging files.

If you need more context or the project maintainer's intent, prefer referencing top-level `README.md` and the `UUID/info.json` file for that spice.

If you update this file, keep it short (20-50 lines) and concrete; maintainers prefer actionable instructions over broad best-practices.

Ask the maintainer which spices are actively maintained before proposing cross-spice refactors. The `author` property in each `UUID/info.json` is the canonical source.
