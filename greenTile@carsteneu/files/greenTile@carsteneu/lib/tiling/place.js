/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Window placement: animated single-window placement and the layout-cell
 * wrapper, plus the gap read and the cells-of-ordered-windows renderer.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { gapValue, gapCell } = XLET.lib.model.gap;
const { splitRects } = XLET.lib.model.split;
const { windowReset, windowMoveResize } = XLET.lib.tiling.windows;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

// Animated placement: the window gets its final geometry instantly (no stepped
// resizes — those reflow terminal text at every step), while the compositor actor
// is parked at the old rect via translation/scale and eased back to identity.
// Offsets are set BEFORE the move so no intermediate frame shows the final position.
//
// The shell's own size-change effect writes exactly these four properties too
// (windowManager.js _sizeChangedWindow, gated on windows with __animationInfo
// and on desktop-effects-change-size) and its done handler mass-cancels them.
// Two consequences the owner handles: (1) if that effect is ALREADY running on
// one of these properties, the placement skips its animation entirely — the
// platform cancels whatever sits on an eased property, and cancelling a foreign
// animation is forbidden; (2) if it starts while our ease runs, our transitions
// are cancelled and the record survives so its values are still repaired. The
// visible animation is the shell's in both cases.
var ANIMATE_MS = 250;
// The properties greenTile parks and eases on the compositor actor. Single
// source of truth for three things that must never disagree: the park below,
// the ease targets and the per-App ownership table (the parked values are
// actor fields, the dashed `prop` is the Clutter transition name). 'offset'
// entries are absolute positions, 'ratio' entries are size factors; `axis`
// names the frame-rect member the property derives from. The tiling layer must
// not import the runtime layer, so the table is handed to the owner as an
// argument.
const EASE_PROPS = Object.freeze([
    Object.freeze({ prop: 'translation-x', field: 'translation_x', identity: 0, kind: 'offset', axis: 'x' }),
    Object.freeze({ prop: 'translation-y', field: 'translation_y', identity: 0, kind: 'offset', axis: 'y' }),
    Object.freeze({ prop: 'scale-x', field: 'scale_x', identity: 1, kind: 'ratio', axis: 'width' }),
    Object.freeze({ prop: 'scale-y', field: 'scale_y', identity: 1, kind: 'ratio', axis: 'height' }),
]);
// animate = false: the window jumps (resize hotkeys held down retile ~33 times per second;
// overlapping animations would make the windows swim). With the setting tileAnimation off
// every placement jumps; read at each placement, so a change applies from the next tiling.
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow} metaWindow
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {boolean} [animate]
 */
var place = (app, metaWindow, x, y, width, height, animate = true) => {
    const oldRect = metaWindow.get_frame_rect();
    const actor = metaWindow.get_compositor_private();
    const animateOn = animate && app.config.settings.getValue(SETTINGS_KEYS.tileAnimation) !== false;
    // Set the geometry and read the settled frame back. Nothing is remembered here: the
    // caller compares the settled frame with the size it asked for, which is the only
    // valid evidence of an application-enforced minimum (an older or larger frame on
    // its own is not a minimum).
    const settle = () => {
        windowMoveResize(metaWindow, x, y, width, height);
        return metaWindow.get_frame_rect();
    };
    if (!actor) {
        return settle();
    }
    const placement = app.placement;
    if (!animateOn) {
        // Only an OWN in-flight ease is superseded, and only the transitions
        // that are still ours (the placement owner re-checks the transition
        // identity): a foreign transition — e.g. the shell's size-change effect,
        // which drives the same translation/scale — is never touched. Stomping
        // translation/scale while it runs left actors visually desynced from
        // their Meta buffers.
        placement.release(metaWindow);
        return settle();
    }
    if (placement.foreignActive(metaWindow, actor, EASE_PROPS)) {
        // A foreign animation is already running on one of these properties.
        // The platform cancels whatever sits on an eased property
        // (environment.js _easeActor), so easing here would cancel a foreign
        // animation — exactly what the contract forbids. Skip our animation:
        // release only our own in-flight transitions and set the requested
        // geometry on the buffer, leaving the foreign transition and its value
        // untouched.
        placement.release(metaWindow);
        return settle();
    }
    // Park the actor at its CURRENT VISUAL position: the frame rect is the
    // buffer position, the visible position is frame + translation (and the
    // visible size is frame * scale). Parking from the frame alone — while a
    // foreign animation or a leftover own ease still carries translation —
    // lands exactly that many pixels off, the persistent actor/buffer offset
    // observed live on workspace switches.
    const next = { x, y, width, height };
    for (const p of EASE_PROPS) {
        actor[p.field] = p.kind === 'offset'
            ? oldRect[p.axis] + actor[p.field] - next[p.axis]
            : (oldRect[p.axis] * actor[p.field]) / next[p.axis];
    }
    const settled = settle();
    // The token is this acquisition's identity: a superseded ease's stop must
    // never release the record of the ease that replaced it (each owned
    // transition additionally carries its own stop handler in the owner).
    const token = {};
    const Clutter = imports.gi.Clutter;
    /** @type {Record<string, number>} */
    const identityTargets = {};
    for (const p of EASE_PROPS) {
        identityTargets[p.field] = p.identity;
    }
    actor.ease({
        ...identityTargets,
        duration: ANIMATE_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
    // after the ease: the transitions exist, so the owner can take exactly them
    placement.acquired(metaWindow, token, actor, EASE_PROPS);
    return settled;
};
/**
 * @param {AppFacade} app
 * @returns {number}
 */
var gap = (app) => gapValue(app.config.settings.getValue(SETTINGS_KEYS.windowGap));
// Places a window into a layout cell of the usable area, minus the window gap.
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow} metaWindow
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Rect} area
 * @param {boolean} [animate]
 */
var placeCell = (app, metaWindow, x, y, width, height, area, animate = true) => {
    const [cx, cy, cw, ch] = gapCell([x, y, width, height], area, gap(app));
    // A degenerate usable area (a zero-length axis, or non-finite geometry) cannot
    // contain any frame. Placing would move the window onto geometry outside it —
    // and animate that move. Leave the window exactly as it is instead: no reset,
    // no move/resize, no ease. A repairable area already comes back contained from
    // gapCell (bounded gap).
    const [ax, ay, aw, ah] = area;
    if (!Number.isFinite(cx + cy + cw + ch) || cw < 1 || ch < 1
        || !Number.isFinite(ax + ay + aw + ah)
        || cx < ax || cy < ay || cx + cw > ax + aw || cy + ch > ay + ah) {
        return null;
    }
    // The reset belongs before the watch: a maximized window carries a different actor
    // offset than the tiled one, so the baseline must be the geometry state the placement
    // actually starts from.
    windowReset(metaWindow);
    // The asked-for frame and the settled one travel back together: their difference is
    // the refusal evidence the fit re-runs on. The actor state this placement invalidates
    // must be read BEFORE the frame moves — the actor resync compares it with what the
    // actor shows after the retile (lib/runtime/actorsync.js).
    const watch = app.actorsync.watch(metaWindow);
    const got = place(app, metaWindow, cx, cy, cw, ch, animate);
    return { req: /** @type {Rect} */ ([cx, cy, cw, ch]), got: got, watch: watch };};
// Places the ordered windows into the cells of the layout (split or equal division).
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow[]} ordered
 * @param {Layout} layout
 * @param {Split | null} split
 * @param {Rect} area
 * @param {boolean} animate
 */
var placeRects = (app, ordered, layout, split, area, animate) => {
    const rects = splitRects(layout.kind, layout.shape, split, layout.area || area);
    /** @type {Array<{req: Rect, got: CinnamonRectangle, watch: ActorWatch | null} | null>} */
    const evidence = [];
    for (let i = 0; i < rects.length && i < ordered.length; i++) {
        const [x, y, w, h] = rects[i];
        evidence.push(placeCell(app, ordered[i], x, y, w, h, area, animate));
    }
    return evidence;
};
// Places the ordered windows into the arrangement effective for the minima seen in
// THIS call, then re-places from the freshly settled frames until the arrangement
// stops changing. The evidence is local and never cached across retiles: a minimum an
// application relaxed is therefore picked up by the very next retile (the nominal
// arrangement comes back) instead of keeping the layout squeezed, and no invalidation
// network is needed. Refusal evidence only grows within this call. The explicit pass
// cap bounds best-effort fitting; dynamic minima can grow repeatedly on either axis,
// so it is not a proof that every application constraint converges within the cap.
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow[]} ordered
 * @param {Layout} layout
 * @param {Rect} area
 * @param {boolean} animate
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {number} n
 * @returns {FittedLayout} the arrangement the windows settled into
 */
var placeFit = (app, ordered, layout, area, animate, monitorIndex, wsIndex, n) => {
    const gapPx = gap(app);
    /** @type {Array<{w: number, h: number}>} */
    let mins = ordered.map(() => ({ w: 0, h: 0 }));
    let fit = app.split.fit(app, monitorIndex, wsIndex, n, layout, mins, area, gapPx);
    let evidence = placeRects(app, ordered, fit, fit.split, area, animate);
    for (let pass = 0; pass <= 2 * n; pass++) {
        const next = mins.map((cur, i) => {
            const seen = evidence[i];
            if (!seen || !seen.got) {
                return cur;
            }
            return {
                w: seen.got.width > seen.req[2] + 2 ? Math.max(cur.w, seen.got.width) : cur.w,
                h: seen.got.height > seen.req[3] + 2 ? Math.max(cur.h, seen.got.height) : cur.h,
            };
        });
        if (next.every((m, i) => m.w === mins[i].w && m.h === mins[i].h)) {
            break;
        }
        mins = next;
        fit = app.split.fit(app, monitorIndex, wsIndex, n, layout, mins, area, gapPx);
        evidence = placeRects(app, ordered, fit, fit.split, area, false);
    }
    // Publish what was ACTUALLY placed — the arrangement, the identity of the windows in
    // placement order, and the minima the placement observed. The consumers read this
    // instead of re-deriving an arrangement, and the identity is what stops a replaced
    // window at the same count from inheriting its predecessor's record. Replaced, never
    // merged, so a relaxed minimum cannot survive.
    const differs = evidence.some((seen) => seen && (seen.got.x !== seen.req[0] || seen.got.y !== seen.req[1]
        || seen.got.width !== seen.req[2] || seen.got.height !== seen.req[3]));
    app.split.setPlacement(app, monitorIndex, wsIndex, n, {
        ...fit,
        mins: mins.map((m, i) => ({ seq: ordered[i].get_stable_sequence(), w: m.w, h: m.h })),
        ...(differs ? {
            requested: evidence.map((seen) => seen && seen.req),
            cells: ordered.map((w) => {
                const f = w.get_frame_rect();
                return /** @type {Rect} */ ([f.x, f.y, f.width, f.height]);
            }),
        } : {}),
    });
    // One verification per surface for the whole retile: the windows the LAST pass placed
    // are the ones on screen, and a newer placement of this surface supersedes this check
    // rather than stacking another (lib/runtime/actorsync.js). A window without a
    // compositor actor has nothing to compare and is left out.
    /** @type {ActorWatch[]} */
    const watched = [];
    for (const seen of evidence) {
        if (seen && seen.watch) {
            watched.push(seen.watch);
        }
    }
    app.actorsync.arm(app, monitorIndex, wsIndex, watched);
    return fit;
};
