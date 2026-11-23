# Dynamic Tiler 🚀

English | [Русский](README.ru.md)

**Dynamic Tiler** is a configurable, intent-aware tiling extension for the Cinnamon Desktop Environment. It blends the flexibility of floating desktops with the productivity of tiling window managers. By combining a decoupled, test-backed TypeScript engine with a native GJS (Gnome JavaScript) Cinnamon extension, it provides predictable keyboard layout shifts, fluid mouse dragging with real-time visual previews, and a transaction history to easily revert layout changes.

Instead of forcing your windows into a rigid, static layout that breaks under normal desktop use, Dynamic Tiler is designed to adapt to your daily workflow. It shifts, squeezes, and restores layouts dynamically, offering the efficiency of tiling while maintaining the forgiving feel of a traditional desktop.

---

## 📌 Table of Contents
* [📖 The Story & Motivation](#-the-story--motivation)
* [🚀 Getting Started](#-getting-started)
* [⌨️ User Guide: Hotkeys & Workflows](#-user-guide-hotkeys--workflows)
* [🖱️ User Guide: Mouse Interactions](#-user-guide-mouse-interactions)
* [⚙️ Configuration & Customization](#-configuration--customization)
* [🏗️ Under the Hood: Modular Engine (For Developers)](#-under-the-hood-modular-engine-for-developers)
* [⚡ Under the Hood: Advanced Mathematical Solvers (For Developers)](#-under-the-hood-advanced-mathematical-solvers-for-developers)
* [🧑‍💻 QA & Code Testing (For Developers)](#-qa--code-testing-for-developers)
* [📈 Project Status & How to Help](#-project-status--how-to-help)

---

## 📖 The Story & Motivation

Most developers and power users love the core idea of tiling window managers: zero wasted screen space, hands-on-keyboard efficiency, and clean window alignment. However, in practice, full tiling window managers (such as i3, dwm, or bspwm) often bring frustrating drawbacks:
* Simple floating windows—like quick dialog boxes, color pickers, or popups—get stretched into giant columns, ruining the layout.
* Mouse interaction is either ignored or feels clunky.
* A single accidental window drag or resize can permanently ruin a carefully arranged workspace.
* Configuring and porting workflows between different desktop environments is often a tedious manual process.

Dynamic Tiler was built to address these frustrations directly. The project started as a crude, CLI-driven X11 experiment that triggered layout shifts using external command-line utilities (`wmctrl`, `xdotool`). While the math worked, spawning multiple external processes on every keypress caused a noticeable lag (~150ms+). 

To make the interaction feel instantaneous and smooth, we restructured the codebase:
1. **Engine Decoupling:** We isolated the tiling mathematics and layout solvers into a pure TypeScript engine, completely free of any operating system or window-manager APIs.
2. **Native Cinnamon Integration:** We integrated this engine inside a native Cinnamon Spice extension, executing directly within Mutter/Muffin’s rendering thread. This eliminated the process-spawning overhead, dropping response times to around **8–12ms**.
3. **UX-Driven Focus:** Over multiple development iterations, we added defensive safeguards such as transactional history rollback, elastic resizes, pointer hysteresis to prevent preview flickering, and axis-carving heuristics.

Today, Dynamic Tiler is a practical window-management tool focused on providing a fluid, predictable everyday experience.

---

## 🚀 Getting Started

### 📋 Requirements
* Linux Mint / Cinnamon Desktop Environment (running on X11).
* Node.js and npm.
* For the legacy CLI only: `wmctrl`, `xdotool`, `x11-utils`, and `x11-xserver-utils`.

Install package requirements on Ubuntu / Linux Mint:
```bash
sudo apt update
sudo apt install nodejs npm wmctrl xdotool x11-utils x11-xserver-utils
```

### 📦 Installation
1. Clone this repository.
2. Install dependencies and verify that the engine is ready:
   ```bash
   npm install
   npm test
   ```
3. Compile and install the extension directly into your local directory:
   ```bash
   npm run build:extension
   ```
   *(This bundles the source code using `esbuild` and installs the extension directly into `~/.local/share/cinnamon/extensions/dynamic-tiler@bnku/`)*
4. Restart Cinnamon (`Alt + F2`, type `r`, press `Enter`), or open the **Cinnamon Extensions** application and toggle **Dynamic Tiler** on.

---

## ⌨️ User Guide: Hotkeys & Workflows

Dynamic Tiler's keyboard shortcuts are designed to feel intuitive and responsive. Below is an explanation of what each keybinding option in the settings does and how it behaves in practice.

### Keyboard & Mouse Shortcuts (Configurable Settings)

| Action | Default Keybinding | Interface Setting Key | Engine Result / UX Feel |
| :--- | :--- | :--- | :--- |
| **Tile Left** | `Super + Left` | `keybinding-tile-left` | Expand or snap window leftwards, sliding neighbors. |
| **Tile Right** | `Super + Right` | `keybinding-tile-right` | Expand or snap window rightwards, sliding neighbors. |
| **Tile Up** | `Super + Up` | `keybinding-tile-up` | Expand or snap window upwards, sliding neighbors. |
| **Tile Down** | `Super + Down` | `keybinding-tile-down` | Expand or snap window downwards, sliding neighbors. |
| **Shift Left** | `Ctrl + Super + Left` | `keybinding-shift-left` | Immediately shift window to the leftmost edge. |
| **Shift Right** | `Ctrl + Super + Right` | `keybinding-shift-right` | Immediately shift window to the rightmost edge. |
| **Shift Up** | `Ctrl + Super + Up` | `keybinding-shift-up` | Immediately shift window to the topmost edge. |
| **Shift Down** | `Ctrl + Super + Down` | `keybinding-shift-down` | Immediately shift window to the bottommost edge. |
| **Restore Window** | `Super + BackSpace` | `keybinding-restore` | Exit the grid and restore the original floating bounds. |
| **Drag & Snap Modifier** | `Ctrl` (holds during drag) | `dnd-modifier-key` | Snaps a dragged window into the grid with visual overlays. |
| **Window Swap Modifier** | `Ctrl + Shift` (holds during drag) | `dnd-swap-modifier-key` | Swaps two windows' physical coordinates (green overlay). |

### How the Hotkeys Feel in Practice

* **Tile Left / Right / Up / Down:** 
  - If the active window is floating, pressing these keys instantly snaps it to that half of the screen.
  - If the window is already tiled, pressing the same direction key will grow its boundary by grid steps, pushing its neighbors to the side. 
  - If the window hits the screen edge, it will compress its neighbors down to their minimum size (`minColumnSpan`/`minRowSpan`). If they cannot compress any further, the active window will start shrinking from the *opposite* side, letting the neighboring window expand. This prevents layout locks and feels like the window is sliding across a tracks system.
* **Shift Left / Right / Up / Down:** 
  - This acts as a rapid relocation gesture. Instead of resizing step-by-step, it instantly sends the focused window to the outermost half of the grid in that direction. It is perfect for quickly throwing a terminal or chat app to a peripheral screen edge.
* **Restore Window:** 
  - This is your quick escape hatch. If you need to temporarily use a window in a floating state, pressing this key instantly pulls it out of the grid. Simultaneously, the engine detects the empty space and collapses the vacant slot, causing the surrounding windows to expand and fill the void seamlessly.

---

## 🖱️ User Guide: Mouse Interactions

Dynamic Tiler offers an organic mouse-dragging layout workflow that snaps into the grid.

* **Grid Snapping:** Hold your configured DnD modifier (default is `Ctrl` key while dragging, configured as `<Control>d` in settings) and drag a window. You'll see transparent blue preview overlays guiding you to snap zones.
* **Stack Insertion:** Drag a window between two tiled windows in a vertical or horizontal column. The visual guide will indicate that a new middle row/column is opening.
* **Corridor Slide:** Drag a window to a boundary side. Adjacent windows will shift to provide an insertion corridor.
* **Explicit Swap:** Hold `Control + Shift` (default, configured as `<Control><Shift>d`) while dragging a window over another. The target window will highlight with a green frame. Drop the window to trade their physical coordinates.
* **Floating Extraction:** Drag a tiled window out of its grid slot. The gap left behind will visually outline itself, collapsing automatically once your cursor moves more than `80px` from the starting point.

---

## ⚙️ Configuration & Customization

The native configuration panel in Cinnamon's Extensions settings is split into four pages:

1. **Layout:**
   * **Gaps:** Adjust window spacing in pixels (e.g., `8px` for a clean gaps aesthetic).
   * **Enable Previews:** Toggle real-time overlay previews.
   * **Grid Columns / Rows:** Customize the default grid density (e.g., `12 x 6` or `8 x 6`).
   * **Monitor Profiles & Overrides:** Set different grid counts for horizontal, vertical, or ultrawide displays, or write explicit manual overrides (e.g., `0:24x12, 1:6x12`).
   * **Minimum Column / Row Spans:** Set the smallest grid size a window can shrink to.
2. **Drag & Drop:**
   * Toggle mouse snapping and bind the trigger modifier (e.g., `<Shift>d`).
   * Enable/disable window swapping and configure its modifier (e.g., `<Control><Shift>d`).
3. **Keyboard:**
   * Bind hotkeys for directional tiling, edge shifting, and layout restoration.
4. **Diagnostics:**
   * Toggle debug logging to write detailed trace data to `~/.xsession-errors`.

---

## 🏗️ Under the Hood: Modular Engine (For Developers)

The codebase is organized around a small, platform-agnostic TypeScript engine. The layout math lives separately from the Cinnamon/X11 integration, while adapters handle window-manager APIs, configuration, caching, and shell-specific details.

Because the core layout math is entirely platform-agnostic, the engine itself can be ported to other environments (such as GNOME Shell, KDE KWin, or wlroots-based Wayland compositors) by implementing new infrastructure adapters.

### Module Responsibilities:
* **`GridSpans.ts`**: Handles the logical coordinate scales and index ranges for the active grid.
* **`GeometryConverter.ts`**: Converts physical pixel boundaries into grid index spans, adjusting for gaps, title bars, and monitor-specific workareas.
* **`InitialLayout.ts`**: Locates vacant screen zones when a new window is opened, placing it neatly at an edge or adjacent to an active window.
* **`ChainBlockDetector.ts`**: Evaluates layout boundaries using the **Chain Block Detection** algorithm to see if a group of touching windows has room to slide or compress.
* **`ChainTransitions.ts`**: Solves proportional shifts. When a window expands, adjacent windows are gently pushed; they only compress when the layout hits a screen boundary, maintaining their relative proportions.
* **`DragTiling.ts`**: Handles mouse interactions, including Drag-and-Drop layouts, swap gestures, and the transaction journal.

---

## ⚡ Under the Hood: Advanced Mathematical Solvers (For Developers)

### 1. Elastic Resizing & Accordion Spring
When you attempt to grow a window with keyboard shortcuts, Dynamic Tiler uses an elastic spring model:
* **Accordion Push:** Growing a window pushes its adjacent neighbors in that direction.
* **Symmetrical Memory Fallbacks:** If a window is trapped (e.g., its left neighbors are already pushed against the screen edge and compressed to their minimum allowed span), pressing the expand shortcut (`Super + Left`) will softly shrink the window from the *right* side instead, allowing the right neighbor to expand. This prevents the layout from locking up and keeps the keyboard interaction predictable.

### 2. Temporal Correction Memory (Keyboard Undo)
If you resize a window in the wrong direction and immediately press the opposite direction shortcut, the engine detects this as an **Undo request** and restores the window’s exact previous geometry. 
* If you pause for about **2.5 seconds**, the shortcut resumes its normal behavior (modifying the opposite boundary of the window).

### 3. Transaction-Backed Mouse Snapping & Safe Extraction
Drag-and-Drop is often unpredictable in traditional tiling layouts. Dynamic Tiler addresses this through transaction tracking:
* **Safe Extraction & Reversion:** If you drag a tiled window out of the grid to float it, the engine checks its transaction journal (`DragTransactionSnapshot` containing `beforeStates`, `afterStates`, and affected windows). Instead of leaving an awkward gap or stretching adjacent windows arbitrarily, it tries to **revert affected neighbors** to their exact pre-tiled geometry. If the surrounding layout was changed in the meantime, it falls back to a clean vacancy collapse (`collapseVacancy`).

### 4. Advanced Mouse Mechanics
* **Cursor-Centered Snapping:** The drag target is calculated relative to where your mouse cursor is pointing and the preferred size of the dragged window, rather than the window's top-left corner. We use jitter-filtering session memory to prevent layout previews from jumping wildly due to minor hand movements.
* **Axis Carving Scoring:** When you drag a window over another, the solver scores both horizontal and vertical candidates by calculating **minimal area loss**. Dropping near the top/bottom edges carves a vertical slot; dropping on the sides carves a horizontal slot. This prevents wide windows (like a browser) from being crushed into narrow strips when you drop a utility window nearby.
* **Corridor Edge Sliding:** If you drag a window to the outer edge of a tight row, the solver slides the entire row inward, compressing a wide neighbor if possible, to open up a clean slot at the screen edge.
* **Explicit Swap Mode:** Holding the configured Swap modifier (default `<Control><Shift>d`) while dragging enables Swap Mode. Instead of pushing windows aside, the dragged window and target window trade positions. A **green bounding border** clearly indicates that the windows will swap.
* **Accidental Release Shield:** If you let go of the modifier within 80 pixels of where you started dragging, the engine cancels the drag instead of extracting the window, preventing accidental floating states.

---

## 🧑‍💻 QA & Code Testing (For Developers)

Dynamic Tiler ensures reliability through a comprehensive test harness that evaluates layout edge cases:

* **UX Logic Tests (`tests/usecase.test.ts`)**: Validates keyboard behaviors, including correction memory, restore states, and physical dimension detection.
* **Engine Integration Tests (`tests/engine.test.ts`)**: Houses a suite of specs (approx. 100 KB) verifying:
  * Proportional accordion compressions and corridor edge sliding.
  * Pointer-centered DND target calculations.
  * Transaction history journaling and multi-window restoration.
  * Property-style fuzzed permutation tests that check layout boundaries across hundreds of random layout rearrangements to prevent overlaps or engine crashes.

### Useful Developer Commands:
```bash
# Run the test suite
npm test

# Build the Cinnamon Extension local bundle
npm run build:extension

# Build the legacy command-line tool (dist/cli.js)
npm run build:cli
```

---

## 📈 Project Status & How to Help

Dynamic Tiler is currently in a **very early stage of development**. However, it is actively used and tested by the developer on a daily basis as a primary window-management workflow. This ensures that the user experience (UX) will continue to evolve, stabilize, and improve in the future.

You can directly support the project's development by **submitting bug reports and layout suggestions**. Your real-world feedback on edge cases, multi-monitor setups, and daily usage is what helps make this tool more robust and reliable for everyone.

To learn how to enable diagnostics, capture debug logs, and submit a high-quality, reproducible bug report, please read our [Contributing Guidelines](CONTRIBUTING.md).

### 🏆 Completed in Recent Iterations:
* Decoupled layout math into a pure TypeScript engine.
* Implemented axis-carving scoring to resolve wide/narrow window collisions logically.
* Added transaction journaling to rollback neighbor geometries when a window is floated.
* Created cursor-centered mouse snapping and hysteresis filters to eliminate preview stutter.
* Added modifier-driven explicit window swaps with visual green previews.

### 🗺️ Next Milestones:
* **Global Layout Scoring:** Evaluating the density and total "cost" of the entire layout to make better decisions during complex multi-window relocations.
* **Wayland Portability Research:** Studying how to take our decoupled TypeScript core and run it natively inside Wayland environments (such as Mutter Wayland or KDE KWin).
* **Non-Intrusive Status Indicators:** Displaying subtle, temporary hints on preview borders (like `Minimum Width`) to make engine layout decisions transparent.

---

*Dynamic Tiler is built for users who want the speed of a keyboard layout manager without losing the fluid usability of a mouse-driven desktop. Try it, customize it, and let us know what you think!* 🌟
