// Cinnamon port by Kevin Langman 2024

// SPDX-License-Identifier: GPL-3.0-or-later

'use strict';

const Clutter = imports.gi.Clutter;
const GLib    = imports.gi.GLib;
const Meta    = imports.gi.Meta;
const Main    = imports.ui.main;

// A raise of a window of the same family (see _family()) within this many microseconds of
// the last one is the same raise (Muffin raising the parent and the dialog separately, a
// second restack, ...).
const SAME_RAISE_US = 100 * 1000;

// The modules this file needs are handed in by extension.js through setModules(): the
// file is shared by the Cinnamon 6.2 code (old module loader) and the 6.7.6+ code
// (native importer), so it doesn't import them itself.
let Layers = null;
function setModules(modules) {
  ({Layers} = modules);
}

//////////////////////////////////////////////////////////////////////////////////////////
// Raise effects: played when a window that is visible but partly covered by other      //
// windows is raised (click, activation, focus-follows-mouse with auto-raise, ...).     //
//                                                                                      //
// The effect never touches the raised window. Instead a "cover" actor, the size of the //
// raised window's frame and stacked above all windows, holds clones of the windows     //
// that used to cover it (in their old stacking order), plus clones of anything still  //
// above it. At the first frame the screen therefore looks exactly as it did before the //
// raise. The effect's shader runs on the cover in its hide (close) direction, so as    //
// the covering content disappears, the raised window shows through. Wherever nothing   //
// covered the window the cover is transparent, so only the covered parts animate.      //
//                                                                                      //
// RaiseWatcher only decides *when* a raise happened and *which* windows the raised     //
// window passed over. extension.js decides which effect to play and runs it.           //
//////////////////////////////////////////////////////////////////////////////////////////

// Only these windows get a raise effect. Covering windows can be of any type except the
// desktop.
const RAISE_TYPES = [
  Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG,
  Meta.WindowType.UTILITY
];

// px around the raised window's frame that its shadow (and any border drawn outside the
// frame) can reach. Server-side shadows are painted outside the window actor's allocation,
// so the actor's own size isn't enough. Same margin as LayeredEffect.js uses.
const SHADOW_MARGIN = 64;

// The area the raised window can draw on, frame plus shadow, clamped to the stage.
function outerRect(mw) {
  const f = mw.get_frame_rect();
  const x1 = Math.max(0, f.x - SHADOW_MARGIN);
  const y1 = Math.max(0, f.y - SHADOW_MARGIN);
  const x2 = Math.min(global.stage.width,  f.x + f.width  + SHADOW_MARGIN);
  const y2 = Math.min(global.stage.height, f.y + f.height + SHADOW_MARGIN);
  return {x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1)};
}

// The parts of rect `r` outside rect `cut` (all {x, y, width, height}), as up to four rects.
function subtractRect(r, cut) {
  const x1 = Math.max(r.x, cut.x), y1 = Math.max(r.y, cut.y);
  const x2 = Math.min(r.x + r.width, cut.x + cut.width);
  const y2 = Math.min(r.y + r.height, cut.y + cut.height);
  if (x1 >= x2 || y1 >= y2) return [r];  // no overlap
  const out = [];
  const add = (x, y, w, h) => { if (w > 0 && h > 0) out.push({x, y, width: w, height: h}); };
  add(r.x, r.y, r.width, y1 - r.y);                          // above the cut
  add(r.x, y2, r.width, r.y + r.height - y2);                // below it
  add(r.x, y1, x1 - r.x, y2 - y1);                           // left of it
  add(x2, y1, r.x + r.width - x2, y2 - y1);                  // right of it
  return out;
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

var RaiseWatcher = class RaiseWatcher {

  // onRaise(entries): one entry per window of the raised family that needs an effect,
  // bottom to top: {window, coverers, above}. coverers are the windows that window was
  // below and is now above (old stacking order, bottom to top); above are the windows
  // still above it. Both are limited to windows that overlap its frame or shadow.
  // onReset(): any running raise effect should stop (workspace switch, ...).
  constructor(onRaise, onReset) {
    this._onRaise  = onRaise;
    this._lastRoot = null;   // root window of the last raise, and when it happened
    this._lastTime = 0;
    this._onReset  = onReset;
    this._stack    = [];
    this._raisedIds = new Map();  // MetaWindow -> 'raised' handler id
    this._handlers = [];          // [object, handler id]
    this._enabled  = false;
    this._haveRaisedSignal = true;
  }

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    const display = global.display;
    const wm      = global.workspace_manager;

    for (const actor of global.get_window_actors()) {
      this._watchWindow(actor.get_meta_window());
    }
    this._handlers.push([display, display.connect('window-created', (d, mw) => this._watchWindow(mw))]);
    this._handlers.push([display, display.connect('restacked', () => this._onRestacked())]);
    this._handlers.push([wm, wm.connect('active-workspace-changed', () => {
      this._stack = this._visibleStack();
      this._onReset();
    })]);

    this._stack = this._visibleStack();
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    for (const [obj, id] of this._handlers) {
      try { obj.disconnect(id); } catch (e) { /* already gone */ }
    }
    this._handlers = [];
    for (const [mw, id] of this._raisedIds) {
      try { mw.disconnect(id); } catch (e) { /* already gone */ }
    }
    this._raisedIds.clear();
    this._stack = [];
  }

  // The visible windows of the active workspace, bottom to top. Minimized windows and
  // windows on other workspaces are left out, so raising one of those (unminimize,
  // workspace switch, a new window) never looks like a "raise from below".
  //
  // Decided by the window actors (Cinnamon hides the actors of windows on other workspaces),
  // not by get_workspace(): some windows, e.g. a Java application's modal dialog, don't
  // report the active workspace although they are on it, and a window missing here is
  // never cloned into the cover (the parent then shows where the dialog should be).
  _visibleStack() {
    const windows = [];
    for (const actor of global.get_window_actors()) {
      if (!actor.visible || actor.is_destroyed?.()) continue;
      const w = actor.get_meta_window();
      if (!w || w.minimized || w.get_window_type() === Meta.WindowType.DESKTOP) continue;
      windows.push(w);
    }
    return global.display.sort_windows_by_stacking(windows);
  }

  _watchWindow(mw) {
    if (!mw || this._raisedIds.has(mw) || !this._haveRaisedSignal) return;
    try {
      // Muffin emits 'raised' from meta_window_raise(), right after the stack changed but
      // long before the window actors are restacked and painted.
      const id = mw.connect('raised', () => this._onWindowRaised(mw));
      this._raisedIds.set(mw, id);
      mw.connect('unmanaged', () => this._raisedIds.delete(mw));
    } catch (e) {
      // No 'raised' signal in this Muffin: fall back to watching the top window in
      // _onRestacked().
      this._haveRaisedSignal = false;
    }
  }

  _onWindowRaised(mw) {
    const old = this._stack;
    const now = this._visibleStack();
    this._stack = now;
    this._evaluate(mw, old, now);
  }

  _onRestacked() {
    const old = this._stack;
    const now = this._visibleStack();
    this._stack = now;
    if (!this._haveRaisedSignal && now.length > 0) {
      const top = now[now.length - 1];
      if (old.length > 0 && old[old.length - 1] !== top) {
        this._evaluate(top, old, now);
      }
    }
  }

  // The root ancestor of `mw` (following transient-for) and all its transients, i.e. a
  // window with its (modal) dialogs. Muffin raises them together: meta_window_raise() raises
  // the root ancestor first and then the window, and transients always stay above their
  // parent. But 'raised' only fires for the window asked to raise.
  _family(mw) {
    let root = mw;
    for (let parent = root.get_transient_for(); parent && parent !== root;
         parent = root.get_transient_for()) {
      root = parent;
    }
    const family = [root];
    try {
      root.foreach_transient((w) => {
        family.push(w);
        return true;
      });
    } catch (e) {
      // No foreach_transient(): just the raised window and its ancestors.
      if (!family.includes(mw)) family.push(mw);
    }
    return {root, family};
  }

  _evaluate(mw, old, now) {
    if (!RAISE_TYPES.includes(mw.get_window_type())) return;
    // The overview / expo show clones of the windows; raising there isn't "from below".
    if ((Main.expo && Main.expo.visible) || (Main.overview && Main.overview.visible)) return;

    const {root, family} = this._family(mw);

    // The same raise reported twice (e.g. for the parent and for its dialog).
    const time = GLib.get_monotonic_time();
    if (root === this._lastRoot && time - this._lastTime < SAME_RAISE_US) return;

    const members = new Set(family);
    const entries = [];
    // Bottom to top, so a dialog's cover goes above its parent's (see createCover()).
    for (const w of now.filter(w => members.has(w))) {
      if (!RAISE_TYPES.includes(w.get_window_type())) continue;
      const oldIdx = old.indexOf(w);
      const newIdx = now.indexOf(w);
      if (oldIdx < 0) continue;  // wasn't visible before (a dialog opening right now, ...)

      // The windows it passed over. Its own family doesn't count: a parent was always below
      // its dialog, and the dialog's own cover takes care of the dialog's area.
      const frame    = w.get_frame_rect();
      const outer    = outerRect(w);
      const nowBelow = new Set(now.slice(0, newIdx));
      const passed   = old.slice(oldIdx + 1).filter(o => nowBelow.has(o) && !members.has(o));

      // Only a window that actually covered part of the frame triggers the effect. Windows
      // that were only under its shadow are included too, so the shadow can fade in over
      // them (see createCover()).
      if (!passed.some(o => intersects(o.get_frame_rect(), frame))) continue;

      entries.push({
        window: w,
        coverers: passed.filter(o => intersects(o.get_frame_rect(), outer)),
        above: now.slice(newIdx + 1).filter(o => intersects(o.get_frame_rect(), outer))
      });
    }
    if (entries.length === 0) return;

    this._lastRoot = root;
    this._lastTime = time;
    this._onRaise(entries);
  }
};

// Builds the cover actor for a raise effect: clipped to the raised window's frame, with
// clones of the windows that covered it and of the windows still above it, stacked right
// above the window group (see insertAboveWindows() in LayeredEffect.js).
// Returns {group, target, ring}. The group covers the raised window and its shadow
// (outerRect()). Bottom to top:
//   ring   = four strips around the frame, the shadow area, holding clones of the windows the
//            raised window passed over. No shader: extension.js fades its opacity, so the
//            raised window's shadow and border fade in instead of appearing at once.
//   target = the frame, holding the same clones. The effect's shader goes here.
//   top    = clones of the windows still above the raised window, over the whole group, so
//            neither the effect nor the fade ever touches them.
// Destroy `group` at the end.
// exclude: stage rects the ring must leave alone. When a window and its dialogs are raised
// together, each gets a cover, stacked bottom to top; a dialog's ring would otherwise lie
// over its parent's frame, where the parent's own cover is animating, and show the windows
// that covered it there unaffected by the effect.
var createCover = function(metaWindow, coverers, above, exclude = []) {
  const f = metaWindow.get_frame_rect();
  const o = outerRect(metaWindow);
  const layer = (x, y, width, height) => new Clutter.Actor(
    {x, y, width: Math.max(1, width), height: Math.max(1, height),
     clip_to_allocation: true, reactive: false});

  const group  = layer(o.x, o.y, o.width, o.height);
  const ring   = new Clutter.Actor({x: 0, y: 0, width: o.width, height: o.height, reactive: false});
  // The ring is faded with its opacity. Painted directly, that opacity is passed on to every
  // clone, so each window is drawn translucent and its own shadow (painted under the whole
  // window) and the windows below it show through: a modal dialog's large shadow then shows
  // as a dark rectangle the size of the dialog. Rendered offscreen first, the clones are
  // drawn opaque and only the finished image is faded.
  ring.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
  const target = layer(f.x - o.x, f.y - o.y, f.width, f.height);
  const top    = layer(0, 0, o.width, o.height);
  group.add_child(ring);
  group.add_child(target);
  group.add_child(top);

  // Clones of `windows` in `layer`, whose top-left is at ox, oy on the stage.
  const addClones = (l, windows, ox, oy) => {
    for (const w of windows) {
      const wa = w.get_compositor_private();
      if (wa) Layers.addWindowClone(l, wa, ox, oy);
    }
  };

  // The strips, in stage coordinates: above, below, left and right of the frame.
  const fx2 = f.x + f.width, fy2 = f.y + f.height;
  const ox2 = o.x + o.width, oy2 = o.y + o.height;
  const strips = [
    {x: o.x, y: o.y, width: o.width,    height: f.y - o.y},
    {x: o.x, y: fy2, width: o.width,    height: oy2 - fy2},
    {x: o.x, y: f.y, width: f.x - o.x,  height: f.height},
    {x: fx2, y: f.y, width: ox2 - fx2,  height: f.height}
  ];
  let pieces = strips.filter(r => r.width > 0 && r.height > 0);  // none at a screen edge
  for (const cut of exclude) {
    pieces = pieces.flatMap(r => subtractRect(r, cut));
  }
  for (const r of pieces) {
    const strip = layer(r.x - o.x, r.y - o.y, r.width, r.height);
    addClones(strip, coverers, r.x, r.y);
    ring.add_child(strip);
  }

  addClones(target, coverers, f.x, f.y);
  addClones(top, above, o.x, o.y);

  // Shader.beginAnimation() measures the "window" it animates through actor.meta_window.
  // The target is exactly the raised window's frame, so padding is 0 and the
  // fullscreen / maximized flags are the raised window's.
  target.meta_window = metaWindow;
  Layers.insertAboveWindows([group]);
  return {group, target, ring};
};
