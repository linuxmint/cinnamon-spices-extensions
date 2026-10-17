/*
 * tilo - motion.
 *
 * Clutter ships the usual named easings, and none of them is the curve this
 * interface wants. Windows 11 publishes its own: entrances use
 * cubic-bezier(0, 0, 0, 1), which leaves instantly and spends most of its time
 * settling, and exits use cubic-bezier(1, 0, 1, 1), which hesitates then goes.
 * EASE_OUT_QUAD next to either of them reads as soft and slightly cheap.
 *
 * Clutter can do exactly those curves: set the mode to CUBIC_BEZIER and hand
 * the control points to each transition after it is created. That is all this
 * module does, plus keep the durations in one place.
 */

const Clutter = require('gi.Clutter');
const Graphene = require('gi.Graphene');
const Logger = require('./lib/logger');

/* Control points, from Microsoft's published motion tokens. */
const CURVE = {
    /* Arriving. Decisive at the start, long tail. */
    entrance: [0.0, 0.0, 0.0, 1.0],
    /* Leaving. Slow to commit, then gone. */
    exit: [1.0, 0.0, 1.0, 1.0],
    /* Moving between two places that are both already on screen. */
    standard: [0.8, 0.0, 0.2, 1.0]
};

/*
 * Durations. The first three are Fluent's own tokens; GHOST is longer because
 * it is the only thing here that crosses the whole screen, and a rectangle
 * covering half a display cannot arrive in 83ms without appearing to teleport.
 */
const MS = {
    hover: 120,
    quick: 150,
    normal: 220,
    morph: 260,
    ghost: 200
};

/* Properties that ease() turns into transitions we may need to re-curve. */
const ANIMATABLE = ['x', 'y', 'width', 'height', 'opacity', 'scale_x', 'scale_y',
                    'translation_y', 'translation_x'];

function point(x, y) {
    const p = new Graphene.Point();
    p.init(x, y);
    return p;
}

/*
 * actor.ease() with a real cubic bezier. The mode has to be set before the
 * transitions exist and the control points after, which is why this is a
 * function rather than a constant handed to ease().
 *
 * If anything about that fails, the animation still runs on the named easing
 * the transition already has. Motion is polish; it must never be able to stop
 * the picker from opening.
 */
function ease(actor, props, curve) {
    actor.ease(Object.assign({}, props, {
        mode: Clutter.AnimationMode.CUBIC_BEZIER
    }));

    try {
        const c1 = point(curve[0], curve[1]);
        const c2 = point(curve[2], curve[3]);
        for (const name of ANIMATABLE) {
            if (!(name in props)) continue;
            const transition = actor.get_transition(name);
            if (transition) transition.set_cubic_bezier_progress(c1, c2);
        }
    } catch (e) {
        Logger.error('could not apply the easing curve', e);
    }
}

const arrive = (actor, props) => ease(actor, props, CURVE.entrance);
const leave = (actor, props) => ease(actor, props, CURVE.exit);
const move = (actor, props) => ease(actor, props, CURVE.standard);

module.exports = { CURVE, MS, ease, arrive, leave, move };
