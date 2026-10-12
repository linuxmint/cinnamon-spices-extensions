// Window Swipe 1.0.0 - Cinnamon extension
// Copyright (C) 2026 Mohamed Ghareeb (GitHub: m7ghareeb)
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under the terms of
// the GNU General Public License as published by the Free Software Foundation, either version 3
// of the License, or (at your option) any later version. It is distributed WITHOUT ANY
// WARRANTY; see the GNU General Public License (LICENSE) for details.
//
// Three- and four-finger horizontal touchpad swipes slide the focused window out and its
// neighbour in, following the finger. Everything is drawn with compositor clones in
// an overlay above the window layer (below the panel); real windows never move and
// focus only changes after the slide is committed. No workspace is touched.
//
// Hook: Cinnamon's gesturesManager builds one action object per gesture through
// imports.ui.gestures.actions.make_action(). We wrap that function and return our own
// action only for 3- and 4-finger LEFT/RIGHT touchpad swipes (instead of, not in addition
// to, whatever those keys are configured to do); every other gesture (including 3-finger
// swipe up -> Scale and 4-finger up/down) still gets Cinnamon's original action. A swipe
// key must have some action configured, or Cinnamon drops the gesture before make_action.
// When no slide can be made, the swipe is ignored rather than handed back to the configured
// command, so those keys never trigger an instant Alt+Tab while the extension is enabled.
// Disabling the extension restores the original function.
//
// The "neighbour" is the adjacent window in Plank dock order (see eligibleWindows).

const { Clutter, GLib, Gio, Meta } = imports.gi;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const Actions = imports.ui.gestures.actions;
const { GestureType, GestureDirection, DeviceType } = imports.ui.gestures.ToucheggTypes;

// Horizontal swipes with these finger counts all drive the same slide (setting 'swipe-fingers').
const FINGER_CHOICES = { '3-and-4': [3, 4], '3': [3], '4': [4] };
const FINGERS_DEFAULT = '3-and-4';
let swipeFingers = FINGER_CHOICES[FINGERS_DEFAULT];
// Window order (setting 'navigation-order'): 'dock' = Plank dock order while Plank runs, 'opening' = opening order.
const ORDER_CHOICES = ['dock', 'opening'];
const ORDER_DEFAULT = 'dock';
let navigationOrder = ORDER_DEFAULT;

// Tuning
const SMOOTHING_MS = 12;          // per-frame follower time constant; 0 = raw events
// Release decision ("flick presets"). These only decide what a finished swipe does; how far
// the fingers must move for a given percentage is set by Touchegg/libinput and is not changed.
//   commit: a release at or past this progress commits, unless the window is heading back
//           below it (progress + velocity * projectSec < commit);
//   below it, a flick commits if velocity >= velocity (progress/s), progress >= minProgress
//   and the projected position progress + velocity * projectSec reaches commit.
// Chosen in the settings window ('flick-profile'); a change applies from the next swipe.
const FLICK_PROFILES = {
    'balanced':       { commit: 0.50, minProgress: 0.15, velocity: 2.5, projectSec: 0.10 },
    // slow drags commit from 40%, flicks a little easier
    'sensitive':      { commit: 0.40, minProgress: 0.12, velocity: 2.0, projectSec: 0.12 },
    // drags need 60%, flicks need to be faster
    'less-sensitive': { commit: 0.60, minProgress: 0.20, velocity: 3.0, projectSec: 0.08 },
    // short quick flicks switch; slow partial drags still cancel at under half
    'flick-friendly': { commit: 0.50, minProgress: 0.08, velocity: 1.6, projectSec: 0.18 },
    // position decides; only a very fast, longer flick switches before half
    'deliberate':     { commit: 0.50, minProgress: 0.30, velocity: 4.5, projectSec: 0.05 },
};
const FLICK_PROFILE_DEFAULT = 'balanced';
let flickProfile = FLICK_PROFILE_DEFAULT;

// Release animation. The glide starts at the speed the window had under the finger and
// decelerates to rest exactly on the target (cubic Hermite, no overshoot).
// Glide timing profiles (the release animation). All use the same velocity-matched curve and
// differ only in timing, about 15% apart: shorter = quicker, longer = softer landing. Fast
// flicks finish at the speed of the release in every profile. Chosen in the settings window
// ('glide-profile'); a change applies from the next swipe.
//   min/base/perScreen/max: duration limits (ms); momentum: duration = momentum * distance / speed
const GLIDE_PROFILES = {
    'responsive': { min: 200, base: 200, perScreen: 250, max: 420, momentum: 2.0 },
    'relaxed':    { min: 260, base: 260, perScreen: 300, max: 520, momentum: 2.5 },
    'calm':       { min: 299, base: 299, perScreen: 345, max: 598, momentum: 2.875 },   // relaxed x 1.15
    'gentle':     { min: 344, base: 344, perScreen: 397, max: 688, momentum: 3.3 },     // calm x 1.15
};
const GLIDE_PROFILE_DEFAULT = 'calm';
const GLIDE_MAX_AWAY = 0.5;       // max momentum away from the target (screen widths/s)
let glideProfile = GLIDE_PROFILE_DEFAULT;
const EDGE_RESISTANCE = 0.12;     // max travel when there is no neighbour
const STALL_TIMEOUT_S = 15;       // cancel if a gesture never ends (pauses up to ~1.2 s are normal)
const HANDOFF_CARRY_MS = 20;      // a swipe that takes over a glide inherits its speed, fading out over a few frames
const SWIPE_LOG_SIZE = 500;       // per-swipe diagnostics kept in memory (see __windowSwipe)

let swipeLog = [];
let swipeSeq = 0;

let originalMakeAction = null;
let session = null;

function log(msg) {
    global.log(`[window-swipe] ${msg}`);
}

function median(a) {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
}

function pct(a, q) {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

function intervals(ts) {
    const out = [];
    for (let i = 1; i < ts.length; i++) out.push((ts[i] - ts[i - 1]) / 1000);
    return out;
}

// Minimized windows and windows hidden by Show Desktop stay in the list: their actors are
// only hidden and keep the last frame, which the clones below can still draw. Fullscreen
// windows are included too (Muffin keeps them composited here); only windows that ask
// to bypass the compositor (games, exclusive fullscreen) are left out, since their
// content can't be drawn reliably.
function isEligible(w, monitorIndex) {
    return w.get_window_type() === Meta.WindowType.NORMAL &&
           !w.is_skip_taskbar() && !w.requested_bypass_compositor() &&
           w.get_monitor() === monitorIndex && !!w.get_compositor_private();
}

// Navigation order = Plank dock order, read fresh at every gesture so reordering the dock
// takes effect immediately:
//  - apps pinned in the dock, left to right; an app's windows stay together, oldest first
//  - a window whose app id extends a launcher's id (cinnamon-settings-extensions.desktop
//    under cinnamon-settings.desktop) belongs to that launcher
//  - apps that are not pinned come after all pinned ones, in the order they were opened
//    (as Plank shows them); windows without an app the same, one group each
// Plank order is used only while Plank's dock is running; otherwise (Plank not installed,
// not running, or its settings unreadable) the order is plain window-creation order: the
// order the windows were opened, which never changes while they stay open.
const PLANK_SCHEMA = 'net.launchpad.plank.dock.settings';
const PLANK_ROOT_SCHEMA = 'net.launchpad.plank';
const PLANK_DEFAULT_DOCK = 'dock1';

function plankRunning() {
    return global.get_window_actors().some(a => {
        const w = a.meta_window;
        return w && w.get_window_type() === Meta.WindowType.DOCK && w.get_wm_class() === 'Plank';
    });
}

// The first dock Plank has enabled (normally 'dock1').
function plankDockName(source) {
    if (!source.lookup(PLANK_ROOT_SCHEMA, true)) return PLANK_DEFAULT_DOCK;
    const docks = new Gio.Settings({ schema_id: PLANK_ROOT_SCHEMA }).get_strv('enabled-docks');
    return docks.length && /^[\w-]+$/.test(docks[0]) ? docks[0] : PLANK_DEFAULT_DOCK;
}

function dockLaunchers() {
    const source = Gio.SettingsSchemaSource.get_default();
    if (!source || !source.lookup(PLANK_SCHEMA, true) || !plankRunning()) return [];
    const dock = plankDockName(source);
    const dockSettings = new Gio.Settings({ schema_id: PLANK_SCHEMA, path: `/net/launchpad/plank/docks/${dock}/` });
    const dir = GLib.build_filenamev([GLib.get_user_config_dir(), 'plank', dock, 'launchers']);
    const ids = [];
    for (const item of dockSettings.get_strv('dock-items')) {
        try {
            const [ok, bytes] = GLib.file_get_contents(GLib.build_filenamev([dir, item]));
            if (!ok) continue;
            const m = /^Launcher=(.*)$/m.exec(imports.byteArray.toString(bytes));
            const id = m && GLib.path_get_basename(m[1].trim());
            if (id && id.endsWith('.desktop')) ids.push(id);
        } catch (e) { /* missing or unreadable dock item: skip it */ }
    }
    return ids;
}

function dockRank(appId, launchers) {
    if (!appId) return -1;
    const exact = launchers.indexOf(appId);
    if (exact >= 0) return exact;
    let best = -1, bestLen = 0;
    launchers.forEach((id, i) => {
        const base = id.slice(0, -'.desktop'.length);
        if (appId.startsWith(base + '-') && base.length > bestLen) { best = i; bestLen = base.length; }
    });
    return best;
}

function eligibleWindows(monitorIndex) {
    const ws = global.workspace_manager.get_active_workspace();
    const wins = ws.list_windows()
        .filter(w => isEligible(w, monitorIndex))
        .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
    if (navigationOrder !== 'dock') return wins;
    try {
        const launchers = dockLaunchers();
        if (!launchers.length) return wins;
        const tracker = imports.gi.Cinnamon.WindowTracker.get_default();
        const key = new Map(), firstSeq = new Map();
        for (const w of wins) {
            const app = tracker.get_window_app(w);
            const appId = app ? app.get_id() : `window:${w.get_stable_sequence()}`;
            if (!firstSeq.has(appId)) firstSeq.set(appId, w.get_stable_sequence());
            const rank = dockRank(appId, launchers);
            key.set(w, [rank >= 0 ? rank : launchers.length, rank >= 0 ? 0 : firstSeq.get(appId), w.get_stable_sequence()]);
        }
        return wins.sort((a, b) => {
            const ka = key.get(a), kb = key.get(b);
            return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
        });
    } catch (e) {
        log(`dock order unavailable, using creation order: ${e}`);
        return wins;
    }
}

// The window a swipe starts from. Returns a window, 'desktop', or null (= ignore the swipe).
//  - a focused app window: itself
//  - a focused dialog or other transient: its top-level parent, if that is eligible
//  - the Desktop focused: 'desktop'
//  - nothing focused (e.g. after activating a window that refuses keyboard focus): the
//    topmost visible eligible window, or 'desktop' if no app window is visible
function startWindow(focus) {
    if (focus && focus.get_window_type() === Meta.WindowType.DESKTOP)
        return 'desktop';
    if (focus) {
        const root = focus.find_root_ancestor();
        if (root && !root.minimized && isEligible(root, root.get_monitor()))
            return root;
        return null;
    }
    const visible = eligibleWindows(Main.layoutManager.primaryIndex)
        .filter(w => !w.minimized && w.showing_on_its_workspace());
    if (!visible.length) return 'desktop';
    const stacked = global.display.sort_windows_by_stacking(visible);
    return stacked[stacked.length - 1];
}

// Everything that makes up the Desktop page on this monitor: Nemo's desktop icons window
// and desktop-type widgets such as Conky, bottom-to-top in stacking order.
function desktopActors(monitorIndex) {
    return global.get_window_actors().filter(a =>
        a.meta_window && a.meta_window.get_window_type() === Meta.WindowType.DESKTOP &&
        a.meta_window.get_monitor() === monitorIndex && a.visible);
}

// Decide which two windows this gesture is about. null = no slide possible (the gesture is
// then ignored, see patchedMakeAction). plan.from === null means the swipe starts from the
// Desktop.
function makePlan(direction, startOverride) {
    if (Main.modalCount > 0) return null;   // menu, Scale, Expo, ... open
    // Content follows the fingers: swiping left brings in the next window from the right.
    const sign = direction === GestureDirection.LEFT ? 1 : -1;
    const focus = global.display.focus_window;
    const start = startOverride !== undefined ? startOverride : startWindow(focus);
    if (!start) return null;

    if (start === 'desktop') {
        // From the Desktop: left brings in the first window, right the last one.
        const monitorIndex = focus && startOverride === undefined ? focus.get_monitor() : Main.layoutManager.primaryIndex;
        const wins = eligibleWindows(monitorIndex);
        return {
            from: null,
            desktop: desktopActors(monitorIndex),
            to: (sign > 0 ? wins[0] : wins[wins.length - 1]) || null,
            sign,
            monitor: Main.layoutManager.monitors[monitorIndex],
        };
    }

    const monitorIndex = start.get_monitor();
    const wins = eligibleWindows(monitorIndex);
    const i = wins.indexOf(start);
    if (i < 0) return null;

    return {
        from: start,
        to: wins[i + sign] || null,      // null -> rubber-band at the end of the list
        sign,
        monitor: Main.layoutManager.monitors[monitorIndex],
    };
}

function isHiddenWindow(win) {
    return win.minimized || !win.showing_on_its_workspace();
}

// One overlay serves a whole run of swipes. Windows are pages on a horizontal strip
// (page 0 = where the run started, +1 = next window, -1 = previous) and the camera
// position P says what is on screen. Each swipe works in its own coordinate e, where
// 0 = its base page D and 1 = the neighbour D + sign, so P = D + sign * e (with edge
// resistance when that neighbour doesn't exist). A swipe that starts while the previous
// one is still gliding takes over the same strip from the position and speed on screen,
// so nothing snaps; focus changes once, when the run comes to rest on a page.
class SlideSession {
    constructor(plan, definition) {
        this.plan = plan;
        this.definition = definition;   // gesturesManager compares this by identity
        this.threshold = 0;
        this.pages = new Map();         // page index -> { win (null = Desktop), group, hidden }
        this.D = 0;
        this.P = 0;
        this.recentP = [];
        this.signals = [];
        this.state = 'tracking';        // tracking -> settling -> (tracking again) ... -> finishing -> done
        this.lastFrame = GLib.get_monotonic_time();
        this._resetGesture(plan.sign, 0, 0);

        // If any step below fails, undo the steps already done (overlay on screen, running
        // timeline, timers, signals) before reporting the error, so nothing is left behind.
        try {
            const m = plan.monitor;
            this.overlay = new Clutter.Actor({
                name: 'window-swipe-overlay',
                x: m.x, y: m.y, width: m.width, height: m.height,
                clip_to_allocation: true, reactive: false,
            });
            this.overlay.add_child(new Clutter.Clone({ source: global.background_actor, x: -m.x, y: -m.y }));
            this.pages.set(0, plan.from ? this._addWindow(plan.from) : this._addDesktop(plan.desktop));
            if (plan.to) this.pages.set(plan.sign, this._addWindow(plan.to));
            this.nextPage = this.pages.get(plan.sign) || null;
            this.toWasHidden = this.nextPage ? this.nextPage.hidden : false;
            // Starting from a fullscreen window the panel is not on screen, so slide above
            // it; otherwise stay under the panel as before.
            if (plan.from && plan.from.is_fullscreen())
                Main.uiGroup.add_child(this.overlay);
            else
                Main.uiGroup.insert_child_above(this.overlay, global.window_group);
            this._render(0, this.lastFrame);

            this.timeline = new Clutter.Timeline({ duration: 1000, repeat_count: -1 });
            this.timeline.connect('new-frame', () => this._guard(() => this._onFrame()));
            this.timeline.start();
            this._armStall();
        } catch (e) {
            this._teardown();
            this.state = 'done';
            throw e;
        }
    }

    // Per-swipe state. e0: where this swipe starts in its own coordinate; carryV: speed (e/s)
    // the strip already had when the swipe took it over.
    _resetGesture(sign, e0, carryV) {
        const now = GLib.get_monotonic_time();
        // profiles are fixed for the whole swipe; a switch applies from the next one
        this.glideProfile = glideProfile;
        this.flickProfile = flickProfile;
        this.sign = sign;
        this.e0 = e0;
        this.target = e0;
        this.shown = e0;
        this.drawn = e0;
        this.carryV = carryV;
        this.carryStart = this.lastFrame;
        this.peak = Math.max(0, e0);
        this.eventTimes = [];
        this.history = [];
        this.frameTimes = [];
        this.recentShown = [];
        this.startTime = now;
        this.releaseTime = 0;
        this.settleV0 = 0;
        this.settlePow = 0;
        this.settleCarryV = 0;
        this.settleMs = 0;
        this.settleFirstPx = undefined;
        this.dragLastPx = 0;
        this.endProgress = undefined;
        this.releaseVelocity = 0;
        this.releaseDrawnVelocity = 0;
        this.result = null;
        this.fingerQ = 0;
        this.statsWritten = false;
    }

    _armStall() {
        if (this.stallId) GLib.source_remove(this.stallId);
        this.stallId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, STALL_TIMEOUT_S, () => {
            this.stallId = 0;
            if (this.state === 'tracking') this._settle(false, 'stalled');
            return GLib.SOURCE_REMOVE;
        });
    }

    // Release everything this session created. Safe to call on a partly built session.
    _teardown() {
        if (this.timeline) {
            try { this.timeline.stop(); } catch (e) {}
            this.timeline = null;
        }
        if (this.stallId) GLib.source_remove(this.stallId);
        if (this.fallbackId) GLib.source_remove(this.fallbackId);
        if (this.paintId) global.stage.disconnect(this.paintId);
        this.stallId = this.fallbackId = this.paintId = 0;
        for (const [obj, id] of this.signals) {
            try { obj.disconnect(id); } catch (e) {}
        }
        this.signals = [];
        if (this.overlay) {
            this.overlay.destroy();
            this.overlay = null;
        }
    }

    _addWindow(win) {
        const m = this.plan.monitor;
        const actor = win.get_compositor_private();
        const group = new Clutter.Actor({ width: m.width, height: m.height });
        group.add_child(new Clutter.Clone({ source: actor, x: actor.x - m.x, y: actor.y - m.y }));
        this.overlay.add_child(group);
        // A window closing mid-gesture ends the slide immediately.
        this.signals.push([win, win.connect('unmanaged', () => this.cleanup('window-closed'))]);
        return { win, group, hidden: isHiddenWindow(win) };
    }

    // The Desktop page: desktop icons and widgets over the (static) wallpaper.
    _addDesktop(actors) {
        const m = this.plan.monitor;
        const group = new Clutter.Actor({ width: m.width, height: m.height });
        for (const actor of actors)
            group.add_child(new Clutter.Clone({ source: actor, x: actor.x - m.x, y: actor.y - m.y }));
        this.overlay.add_child(group);
        return { win: null, group, hidden: false };
    }

    // The window next to page D in direction s, in navigation order; null at the ends.
    _neighbour(D, s) {
        const base = this.pages.get(D);
        const list = eligibleWindows(this.plan.monitor.index);
        let w;
        if (base.win) {
            const i = list.indexOf(base.win);
            w = i < 0 ? null : list[i + s];
        } else {
            w = s > 0 ? list[0] : list[list.length - 1];   // from the Desktop, as in makePlan
        }
        if (!w) return null;
        for (const page of this.pages.values())
            if (page.win === w) return null;
        return w;
    }

    _guard(fn) {
        try {
            fn();
        } catch (e) {
            global.logError(`[window-swipe] ${e}\n${e.stack}`);
            this.cleanup('error');
        }
    }

    // e (this swipe's coordinate) -> drawn offset from page D; with no neighbour, rubber-band.
    _vis(e) {
        return this.nextPage || e <= 0 ? e : EDGE_RESISTANCE * (1 - Math.exp(-3 * e));
    }

    _unvis(v) {
        if (this.nextPage || v <= 0) return v;
        return -Math.log(1 - Math.min(v, 0.95 * EDGE_RESISTANCE) / EDGE_RESISTANCE) / 3;
    }

    _render(e, now) {
        const W = this.plan.monitor.width;
        this.P = this.D + this.sign * this._vis(e);
        for (const [k, page] of this.pages) {
            const off = k - this.P;
            page.group.visible = Math.abs(off) < 1;
            page.group.translation_x = W * off;
        }
        this.recentP.push([now, this.P]);
        if (this.recentP.length > 3) this.recentP.shift();
    }

    _onFrame() {
        const now = GLib.get_monotonic_time();
        const dt = (now - this.lastFrame) / 1000;
        this.lastFrame = now;
        this.frameTimes.push(now);
        const prevDrawn = this.drawn;

        if (this.state === 'tracking') {
            if (SMOOTHING_MS > 0)
                this.shown += (this.target - this.shown) * (1 - Math.exp(-dt / SMOOTHING_MS));
            else
                this.shown = this.target;
            if (Math.abs(this.target - this.shown) < 0.0005) this.shown = this.target;
            // Speed the strip had when this swipe took it over, fading out within a few frames.
            let carry = 0;
            if (this.carryV) {
                const t = (now - this.carryStart) / 1e6, tau = HANDOFF_CARRY_MS / 1000;
                carry = this.carryV * t * Math.exp(-t / tau);
                if (t > 8 * tau) {
                    this.shown += carry;   // fold the (tiny) remainder in; nothing moves
                    this.target += carry;
                    this.e0 += carry;
                    this.carryV = 0;
                    carry = 0;
                }
            }
            this.drawn = this.shown + carry;
            this.dragLastPx = Math.abs(this.drawn - prevDrawn) * this.plan.monitor.width;
            // remember the last few drawn positions to know the window's speed at release
            this.recentShown.push([now, this.drawn]);
            if (this.recentShown.length > 3) this.recentShown.shift();
        } else if (this.state === 'settling') {
            let t = Math.min(1, (now - this.settleStart) / 1000 / this.settleMs);
            if (this.settlePow) {
                // released faster than the curve below can absorb: same family, steeper start
                this.drawn = this.settleFrom + (this.settleTo - this.settleFrom) * (1 - Math.pow(1 - t, this.settlePow));
            } else {
                // cubic Hermite: starts at settleV0, ends at rest on settleTo
                const T = this.settleMs / 1000;
                const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2;
                this.drawn = h00 * this.settleFrom + h10 * T * this.settleV0 + h01 * this.settleTo;
            }
            const ts = (now - this.settleStart) / 1e6, tau = HANDOFF_CARRY_MS / 1000;
            if (this.settleCarryV) this.drawn += this.settleCarryV * ts * Math.exp(-ts / tau);
            this.shown = this.drawn;
            // stats: how far the window moved in the first frame after release
            if (this.settleFirstPx === undefined)
                this.settleFirstPx = Math.abs(this.drawn - prevDrawn) * this.plan.monitor.width;
            // the rest of the glide would move less than a third of a pixel: land now
            const W = this.plan.monitor.width;
            if (t < 1 && t > 0.5 && (!this.settleCarryV || ts > 8 * tau) &&
                Math.abs(this.settleTo - this.drawn) * W < 0.3) {
                this.drawn = this.settleTo;
                t = 1;
            }
            if (t >= 1) {
                this._render(this.drawn, now);
                this._finish();
                return;
            }
        }
        this._render(this.drawn, now);
    }

    _velocity() {
        const now = GLib.get_monotonic_time();
        const recent = this.history.filter(h => now - h[0] <= 80000);
        if (recent.length < 2) return 0;
        const [t0, p0] = recent[0];
        const [t1, p1] = recent[recent.length - 1];
        return t1 > t0 ? (p1 - p0) / ((t1 - t0) / 1e6) : 0;
    }

    _input(percentage) {
        const now = GLib.get_monotonic_time();
        this.fingerQ = Math.max(0, Math.min(1, percentage / 100));   // this swipe's own travel
        this.target = Math.min(1, this.e0 + this.fingerQ);
        this.peak = Math.max(this.peak, this.target);
        this.eventTimes.push(now);
        this.history.push([now, this.target]);
        if (this.history.length > 64) this.history.shift();
    }

    // --- gesturesManager interface ---
    begin(direction, percentage, time) {
        this._guard(() => {
            // Taking over a glide: Touchegg reports a few percent at begin; start the finger
            // from where the strip is instead of pulling it there.
            if (this.absorbBegin) {
                this.e0 -= Math.max(0, Math.min(1, percentage / 100));
                this.absorbBegin = false;
            }
            this._input(percentage);
        });
    }

    update(direction, percentage, time) {
        if (this.state !== 'tracking') return;
        this._guard(() => this._input(percentage));
    }

    end(direction, percentage, time) {
        if (this.state !== 'tracking') return;
        this._guard(() => {
            this._input(percentage);
            this.endProgress = this.target;
            this.releaseVelocity = this._velocity();
            const v = this.releaseVelocity;
            const f = FLICK_PROFILES[this.flickProfile];
            const decide = x => {
                const projected = x + v * f.projectSec;
                return x >= f.commit ? projected >= f.commit
                                     : v >= f.velocity && x >= f.minProgress && projected >= f.commit;
            };
            // For a fresh swipe both are the same number. A swipe that took over a glide
            // commits on its own finger travel (one swipe = one window) or when the strip
            // has visibly passed halfway.
            let commit = decide(this.target) || (this.regrabbedAt !== undefined && decide(this.fingerQ));
            commit = commit && !!this.nextPage;
            this._settle(commit, commit ? 'commit' : (this.nextPage ? 'cancel' : 'edge'));
        });
    }

    // The glide continues from the last drawn frame (its position, speed and time), so the
    // first glide frame moves a full frame's worth instead of pausing at the release.
    _settle(commit, reason) {
        this.state = 'settling';
        this.result = reason;
        this.commit = commit;
        this.carryV = 0;
        this.settleFrom = this.drawn;
        this.settleTo = commit ? 1 : 0;
        const dist = Math.abs(this.settleTo - this.settleFrom);
        this._planGlide(dist);
        this.settleStart = this.lastFrame;
        this.releaseTime = GLib.get_monotonic_time();
    }

    // Velocity-matched release: continue at the window's current speed and decelerate to rest.
    // A fast release finishes sooner (following its momentum), a slow one glides longer.
    _planGlide(dist) {
        const rs = this.recentShown;
        let v = 0;   // drawn speed in screen widths per second, over the last drawn frame
        const a = rs[rs.length - 2], b = rs[rs.length - 1];
        if (a && b[0] > a[0])
            v = (b[1] - a[1]) / ((b[0] - a[0]) / 1e6);
        const dir = this.settleTo >= this.settleFrom ? 1 : -1;
        let toward = v * dir;
        const g = GLIDE_PROFILES[this.glideProfile];
        const longest = Math.min(g.max, g.base + g.perScreen * dist);
        const byMomentum = toward > 1e-3 ? g.momentum * dist / toward * 1000 : longest;
        this.settleMs = dist < 1e-4 ? g.min : Math.max(g.min, Math.min(longest, byMomentum));
        const T = this.settleMs / 1000;
        // The Hermite curve can start at up to 3 * dist / T without overshooting. Faster than
        // that, continue on 1 - (1 - u)^n with n = speed * T / dist: it starts at exactly the
        // release speed, never overshoots, and equals the Hermite curve at n = 3.
        this.settlePow = dist > 0 && toward > 3 * dist / T ? toward * T / dist : 0;
        // Momentum away from the target is limited; the excess fades out within a few frames
        // instead of vanishing in one.
        this.settleCarryV = toward < -GLIDE_MAX_AWAY ? (toward + GLIDE_MAX_AWAY) * dir : 0;
        toward = dist > 0 ? Math.max(toward, -GLIDE_MAX_AWAY) : 0;
        this.settleV0 = toward * dir;
        this.releaseDrawnVelocity = v;
    }

    // A new swipe started while this run is gliding: take the strip over where it is.
    // The interrupted glide was heading for page D (its decided destination); the new swipe
    // goes from D towards D + s, starting from the current camera position and speed.
    regrab(definition) {
        if (this.state !== 'settling') return false;
        const s = definition.direction === GestureDirection.LEFT ? 1 : -1;
        const rp = this.recentP;
        let vP = 0;   // camera speed, pages per second
        if (rp.length >= 2 && rp[rp.length - 1][0] > rp[0][0])
            vP = (rp[rp.length - 1][1] - rp[0][1]) / ((rp[rp.length - 1][0] - rp[0][0]) / 1e6);
        const D = this.D + (this.settleTo === 1 ? this.sign : 0);
        this._writeStats('interrupted');

        const nextIndex = D + s;
        if (!this.pages.has(nextIndex)) {
            const w = this._neighbour(D, s);
            if (w) this.pages.set(nextIndex, this._addWindow(w));
        }
        this.D = D;
        this.definition = definition;
        this.nextPage = this.pages.get(nextIndex) || null;
        this.toWasHidden = this.nextPage ? this.nextPage.hidden : false;
        this.plan.from = this.pages.get(D).win;
        this.plan.to = this.nextPage ? this.nextPage.win : null;
        this.plan.sign = s;
        const e0 = this._unvis((this.P - D) * s);
        this._resetGesture(s, e0, vP * s);
        this.regrabbedAt = e0;
        this.absorbBegin = true;
        this.state = 'tracking';
        this._armStall();
        return true;
    }

    // Where the run rests once it is finishing: the window to start the next run from.
    restingStart() {
        const page = this.pages.get(this.finalPage);
        return page && page.win ? page.win : 'desktop';
    }

    // Run finished: change focus (unless it came back to where it started), then drop the
    // overlay once the real target window has been raised and painted underneath it.
    _finish() {
        if (this.state === 'finishing' || this.state === 'done') return;
        this.state = 'finishing';
        if (this.timeline) this.timeline.stop();
        this.finalPage = this.D + (this.settleTo === 1 ? this.sign : 0);
        const page = this.pages.get(this.finalPage);
        if (this.finalPage === 0 || !page || !page.win) {
            this.cleanup(this.result);
            return;
        }
        // Activation also restores a minimized target (and, in Show Desktop mode, Muffin
        // minimizes the other hidden windows, as when clicking a dock icon there). Cinnamon
        // then plays its unminimize effect on the real window; keep the overlay up until
        // that effect is over so the window doesn't visibly move a second time.
        const actor = page.win.get_compositor_private();
        Main.activateWindow(page.win, global.get_current_time());
        const unminimizing = () => !!(Main.wm._unminimizing && actor && Main.wm._unminimizing.has(actor));
        let paints = 0;
        this.paintId = global.stage.connect('after-paint', () => {
            if (++paints >= 2 && !unminimizing()) this.cleanup(this.result);
        });
        this.fallbackId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, page.hidden ? 800 : 150, () => {
            this.fallbackId = 0;
            this.cleanup(this.result);
            return GLib.SOURCE_REMOVE;
        });
        global.stage.queue_redraw();
    }

    // Jump straight to the end state (only used when a run can't be continued).
    finishNow() {
        if (this.state === 'done') return;
        if (this.state === 'tracking') this._settle(false, 'superseded');
        if (this.state === 'settling') {
            this.drawn = this.settleTo;
            this._finish();
        }
        this.cleanup(this.result || 'superseded');
    }

    cleanup(reason) {
        if (this.state === 'done') return;
        this.state = 'done';
        if (!this.result) this.result = reason;
        this._teardown();
        if (session === this) session = null;
        if (!this.statsWritten) this._writeStats(reason);
    }

    _writeStats(reason) {
        this.statsWritten = true;
        const ev = intervals(this.eventTimes);
        const tracking = this.frameTimes.filter(t => !this.releaseTime || t <= this.releaseTime);
        const settling = this.frameTimes.filter(t => this.releaseTime && t > this.releaseTime);
        const fr = intervals(tracking);
        const fs = intervals(settling);
        const r = x => Math.round(x * 10) / 10;
        const stats = {
            seq: ++swipeSeq,
            at: GLib.DateTime.new_now_local().format('%F %T'),
            result: this.result || reason,
            interrupted: reason === 'interrupted',
            regrabbedAt: this.regrabbedAt === undefined ? null : r(this.regrabbedAt * 100),
            from: this.plan.from ? this.plan.from.get_wm_class() : 'Desktop',
            to: this.plan.to ? this.plan.to.get_wm_class() : null,
            toWasHidden: this.toWasHidden,
            dir: this.sign > 0 ? 'left(next)' : 'right(prev)',
            fingers: this.definition.fingers,
            smoothingMs: SMOOTHING_MS,
            durationMs: r((GLib.get_monotonic_time() - this.startTime) / 1000),
            peak: r(this.peak * 100), endProgress: r((this.endProgress || 0) * 100),
            fingerProgress: r((this.fingerQ || 0) * 100),
            releaseVelocity: r(this.releaseVelocity || 0), settleMs: r(this.settleMs || 0),
            settleStyle: `glide:${this.glideProfile}`,
            flickProfile: this.flickProfile,
            drawnVelocity: r(this.releaseDrawnVelocity || 0), settleV0: r(this.settleV0 || 0),
            settlePow: r(this.settlePow || 0), settleCarryV: r(this.settleCarryV || 0),
            settleFirstPx: r(this.settleFirstPx || 0), dragLastPx: r(this.dragLastPx || 0),
            events: this.eventTimes.length,
            eventMs: { median: r(median(ev)), p95: r(pct(ev, 0.95)), max: r(Math.max(0, ...ev)) },
            trackFrames: tracking.length,
            trackFrameMs: { median: r(median(fr)), p95: r(pct(fr, 0.95)), max: r(Math.max(0, ...fr)),
                            over10: fr.filter(x => x > 10).length, over14: fr.filter(x => x > 14).length },
            settleFrames: settling.length,
            settleFrameMs: { median: r(median(fs)), p95: r(pct(fs, 0.95)), max: r(Math.max(0, ...fs)),
                             over10: fs.filter(x => x > 10).length },
        };
        // Kept in memory only (nothing is written to disk), for diagnostics and the QA tools.
        swipeLog.push(stats);
        if (swipeLog.length > SWIPE_LOG_SIZE) swipeLog.shift();
        if (globalThis.__windowSwipe) globalThis.__windowSwipe.lastStats = stats;
    }
}

// Stand-in action for our swipes when no slide can be made (dialog without an eligible
// parent, a menu or Scale open, an unsupported window, an error). It does nothing, so the
// key's configured command (e.g. xdotool Alt+Tab) never runs while the extension is on.
class IgnoredSwipe {
    constructor(definition, reason) {
        this.definition = definition;   // gesturesManager compares this by identity
        this.threshold = 0;
        this.reason = reason;
    }
    begin() {}
    update() {}
    end() {}
}

function patchedMakeAction(settings, definition, device) {
    if (!(definition.type === GestureType.SWIPE && swipeFingers.includes(definition.fingers) &&
          device === DeviceType.TOUCHPAD &&
          (definition.direction === GestureDirection.LEFT || definition.direction === GestureDirection.RIGHT)))
        return originalMakeAction(settings, definition, device);

    try {
        if (Main.modalCount > 0) return new IgnoredSwipe(definition, 'modal');   // leave any glide running
        // A swipe during a glide takes the moving strip over (no snap). Once a run is only
        // waiting for the real window to paint, the next run starts from that window.
        if (session && session.state === 'settling' && session.regrab(definition))
            return session;
        let start;
        if (session) {
            if (session.state === 'finishing') start = session.restingStart();
            session.finishNow();
        }
        const plan = makePlan(definition.direction, start);
        if (plan) {
            session = new SlideSession(plan, definition);
            return session;
        }
        return new IgnoredSwipe(definition, 'no-plan');
    } catch (e) {
        global.logError(`[window-swipe] make_action: ${e}\n${e.stack}`);
        if (session) session.cleanup('error');
        return new IgnoredSwipe(definition, 'error');
    }
}

let extensionMeta = null;
let settings = null;

function init(metadata) {
    extensionMeta = metadata;
}

// Settings from the Cinnamon settings window (settings-schema.json). Each value is checked:
// anything unknown (e.g. a hand-edited file) falls back to the default instead of failing.
// Changes are read when a swipe starts, so a swipe in progress is never affected.
const SETTING_KEYS = {
    'glide-profile': v => { glideProfile = GLIDE_PROFILES[v] ? v : GLIDE_PROFILE_DEFAULT; return glideProfile; },
    'flick-profile': v => { flickProfile = FLICK_PROFILES[v] ? v : FLICK_PROFILE_DEFAULT; return flickProfile; },
    'navigation-order': v => { navigationOrder = ORDER_CHOICES.includes(v) ? v : ORDER_DEFAULT; return navigationOrder; },
    'swipe-fingers': v => { swipeFingers = FINGER_CHOICES[v] || FINGER_CHOICES[FINGERS_DEFAULT]; return FINGER_CHOICES[v] ? v : FINGERS_DEFAULT; },
};

function applySetting(key, value) {
    const used = SETTING_KEYS[key](value);
    if (used !== value) {
        log(`setting ${key}: unknown value ${JSON.stringify(value)}, using ${used}`);
        // store the value in use, so the settings window shows it again
        if (settings) settings.setValue(key, used);
    }
    return used;
}

function loadSettings() {
    for (const key in SETTING_KEYS) SETTING_KEYS[key](undefined);   // defaults first
    try {
        settings = new Settings.ExtensionSettings({}, extensionMeta.uuid);
        for (const key in SETTING_KEYS) {
            applySetting(key, settings.getValue(key));
            settings.connect(`changed::${key}`, (s, k, oldValue, value) => applySetting(key, value));
        }
    } catch (e) {
        global.logError(`[window-swipe] settings unavailable, using defaults: ${e}`);
        settings = null;
    }
}

// Used by the QA tools (__windowSwipe.setSetting): change a setting as the settings window does.
const SETTING_VALUES = {
    'glide-profile': () => Object.keys(GLIDE_PROFILES), 'flick-profile': () => Object.keys(FLICK_PROFILES),
    'navigation-order': () => ORDER_CHOICES, 'swipe-fingers': () => Object.keys(FINGER_CHOICES),
};
function setSetting(key, value) {
    if (!SETTING_VALUES[key]) return `unknown setting; available: ${Object.keys(SETTING_VALUES).join(', ')}`;
    if (!SETTING_VALUES[key]().includes(value)) return `unknown value for ${key}; available: ${SETTING_VALUES[key]().join(', ')}`;
    applySetting(key, value);
    if (settings) settings.setValue(key, value);
    return `${key}: ${value}`;
}

function enable() {
    if (originalMakeAction) return;
    originalMakeAction = Actions.make_action;
    Actions.make_action = patchedMakeAction;
    loadSettings();
    // Diagnostics and test hooks, reachable from Looking Glass (lg): current settings, the
    // navigation order, the state of the running slide and the last swipes' measurements.
    globalThis.__windowSwipe = {
        lastStats: null, active: () => session ? session.state : null,
        swipes: (sinceSeq = 0) => swipeLog.filter(x => x.seq > sinceSeq),
        swipeSeq: () => swipeSeq,
        profile: () => glideProfile,
        flickProfile: () => flickProfile,
        profiles: () => ({ glide: Object.keys(GLIDE_PROFILES), flick: Object.keys(FLICK_PROFILES) }),
        setFlickProfile: name => setSetting('flick-profile', name),
        setProfile: name => setSetting('glide-profile', name),
        setSetting,
        settings: () => ({ glide: glideProfile, flick: flickProfile, order: navigationOrder, fingers: swipeFingers.join('+'), stored: !!settings }),
        order: () => eligibleWindows(Main.layoutManager.primaryIndex).map(w => w.get_wm_class()),
    };
    log('enabled');
}

function disable() {
    if (session) session.cleanup('disabled');
    if (originalMakeAction && Actions.make_action === patchedMakeAction)
        Actions.make_action = originalMakeAction;
    originalMakeAction = null;
    if (settings) {
        settings.finalize();
        settings = null;
    }
    delete globalThis.__windowSwipe;
    swipeLog = [];
    log('disabled');
}
