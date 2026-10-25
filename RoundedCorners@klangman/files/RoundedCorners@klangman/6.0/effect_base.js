// Base class and pooling for the extension's shader effects (CornerEffect and ShadowEffect).
//
// Clutter.ShaderEffect with set_shader_source() leaks: Muffin builds it on Cogl's deprecated
// CoglShader/CoglProgram code, where the shader keeps a reference to the pipeline it was compiled for
// (cogl/cogl/deprecated/cogl-shader.c), and that pipeline owns the program that owns the shader. So no
// such effect, nor its offscreen texture (the size of the window), is ever freed.
//
// Cinnamon.GLSLEffect runs the .glsl file as a Cogl snippet instead, and is freed normally. But it
// blends with RGBA = SRC_COLOR * SRC_A + DST_COLOR * (1 - SRC_A), which can't give both the right
// colour and the right alpha for the premultiplied colour our shaders write: un-premultiplying gets
// the colour right but stores an alpha of a*a + dst_a*(1-a). Where the shadow or the anti-aliased
// edge lies over something opaque, that leaves the target partly transparent, which shows as a glow
// around windows in anything that renders the scene offscreen (e.g. BlurCinnamon's blurred
// backgrounds). Cinnamon 6.7.6 added GLSLEffect.get_pipeline(), which lets each effect set the
// normal premultiplied blend instead.
//
// So, chosen at runtime:
//   - GLSLEffect with get_pipeline() (Cinnamon 6.7.6+): EffectBase is GLSLEffect-based, with the
//     correct blend. Unused effects are freed; the pools below only cover routine churn.
//   - Otherwise: EffectBase is Clutter.ShaderEffect as before. The effects can never be freed, so
//     released ones are always pooled and reused; the total is then bounded by the most windows
//     rounded at once rather than growing with every window opened.
//
// An effect class extends EffectBase and implements get_effect_source(), returning its GLSL source.
// It must not depend on instance state: with GLSLEffect it is called once per class, from inside the
// first constructor. Everything else (set_uniform_value(), vfunc_pre_paint(), ...) works as with
// Clutter.ShaderEffect.

const GObject  = imports.gi.GObject;
const Cinnamon = imports.gi.Cinnamon;
const Clutter  = imports.gi.Clutter;

var USE_GLSL_EFFECT = (Cinnamon.GLSLEffect !== undefined) &&
                      (typeof Cinnamon.GLSLEffect.prototype.get_pipeline === 'function');

// Cogl's normal blend for premultiplied colour (what Clutter.ShaderEffect uses)
const PREMULTIPLIED_BLEND = 'RGBA = ADD (SRC_COLOR, DST_COLOR * (1-SRC_COLOR[A]))';

// Turns a complete fragment shader into snippet declarations. GLSLEffect only sets float uniforms,
// so int and bool uniforms are declared as floats and #defined back to their original type.
// Handles the plain one-per-line `uniform int name;` / `uniform bool name;` declarations the
// extension's shaders use (no precision qualifiers or comma-separated lists).
function toSnippet(source) {
    let renamed = new Set();
    let declarations = source.replace(/\buniform\s+(int|bool)\s+(\w+)\s*;/g, (_m, type, name) => {
        renamed.add(name);
        let value = (type === 'int') ? `int(floor(_u_${name} + 0.5))` : `(_u_${name} > 0.5)`;
        return `uniform float _u_${name};\n#define ${name} ${value}\n`;
    }).replace(/\bvoid\s+main\s*\(\s*(void)?\s*\)/, 'void effect_base_main()');

    return { declarations: declarations + '\nuniform float effect_base_unpremultiply;\n', renamed };
}

// effect_base_unpremultiply is only set if an effect couldn't set PREMULTIPLIED_BLEND on its pipeline:
// it is then left with GLSLEffect's blend, where un-premultiplying at least gets the colour right
const SNIPPET_CODE = 'effect_base_main();\n' +
                     'if (effect_base_unpremultiply > 0.5)\n' +
                     '    cogl_color_out.rgb /= max(cogl_color_out.a, 0.0001);\n';

let blendErrorLogged = false;

// Muffin's ClutterActorMeta forgets its actor when that actor is destroyed, but keeps the id of its
// "destroy" handler. The next time the effect is attached anywhere it disconnects that id from NULL,
// logging "invalid (NULL) pointer instance" and "g_signal_handler_disconnect: assertion failed".
// So note when an effect's actor goes away while it is attached (Clutter then calls set_actor(NULL)
// with get_actor() already NULL), and replace such an effect instead of reusing it where it can be
// freed. Called before chaining up, while get_actor() is still the old actor. (Same as BlurCinnamon.)
function _noteSetActor(effect, actor) {
    if (effect._effect_base_attached && effect.get_actor() === null)
        effect._effect_base_orphaned = true;
    effect._effect_base_attached = !!actor;
}

// True if the effect's actor was destroyed while the effect was attached to it
function isOrphaned(effect) {
    return !!effect._effect_base_orphaned || (!!effect._effect_base_attached && effect.get_actor() === null);
}

const GlslEffectBase = USE_GLSL_EFFECT ? GObject.registerClass({
    GTypeName: `RoundedCornersGlslEffectBase_${Math.floor(Math.random() * 100000) + 1}`,
}, class GlslEffectBase extends Cinnamon.GLSLEffect {
    // Called once per class (GLSLEffect keeps one base pipeline per class and copies it per instance)
    vfunc_build_pipeline() {
        let source = this.get_effect_source();
        this.constructor._effect_base_locations = new Map();
        if (!source) {
            // Like ShaderEffect without a source: the effect just paints its input unchanged
            this.constructor._effect_base_renamed = new Set();
            return;
        }
        let snippet = toSnippet(source);
        this.constructor._effect_base_renamed = snippet.renamed;
        this.add_glsl_snippet(Cinnamon.SnippetHook.FRAGMENT, snippet.declarations, SNIPPET_CODE, true);
    }

    // Uniforms are kept here and applied at paint time, like ShaderEffect does, because property setters
    // run during construction, before GLSLEffect has created this instance's pipeline.
    set_uniform_value(name, value) {
        if (!this._effect_base_uniforms)
            this._effect_base_uniforms = new Map();
        this._effect_base_uniforms.set(name, Number(value));
    }

    // Replace GLSLEffect's blend on this instance's pipeline (each instance has its own copy)
    _effectBaseSetBlend() {
        this._effect_base_blend_done = true;
        try {
            this.get_pipeline().set_blend(PREMULTIPLIED_BLEND);
        } catch (e) {
            this.set_uniform_value('effect_base_unpremultiply', 1);
            if (!blendErrorLogged) {
                blendErrorLogged = true;
                global.logError(`RoundedCorners: couldn't set the effect blend mode, edges may look wrong: ${e}`);
            }
        }
    }

    _effectBaseUniformLocation(name) {
        let renamed = this.constructor._effect_base_renamed;
        let locations = this.constructor._effect_base_locations;
        let location = locations.get(name);
        if (location === undefined) {
            location = this.get_uniform_location(renamed.has(name) ? `_u_${name}` : name);
            locations.set(name, location);
        }
        return location;
    }

    vfunc_set_actor(actor) {
        _noteSetActor(this, actor);
        super.vfunc_set_actor(actor);
    }

    vfunc_paint_target(...params) {
        if (!this._effect_base_blend_done)
            this._effectBaseSetBlend();
        if (this._effect_base_uniforms && this.constructor._effect_base_renamed) {
            for (let [name, value] of this._effect_base_uniforms) {
                let location = this._effectBaseUniformLocation(name);
                // -1: the shader doesn't use this uniform (or the compiler optimized it out)
                if (location >= 0)
                    this.set_uniform_float(location, 1, [value]);
            }
        }
        super.vfunc_paint_target(...params);
    }
}) : null;

const ShaderEffectBase = USE_GLSL_EFFECT ? null : GObject.registerClass({
    GTypeName: `RoundedCornersShaderEffectBase_${Math.floor(Math.random() * 100000) + 1}`,
}, class ShaderEffectBase extends Clutter.ShaderEffect {
    constructor(params) {
        super(params);
        let source = this.get_effect_source();
        if (source)
            this.set_shader_source(source);
    }

    vfunc_set_actor(actor) {
        _noteSetActor(this, actor);
        super.vfunc_set_actor(actor);
    }
});

var EffectBase = USE_GLSL_EFFECT ? GlslEffectBase : ShaderEffectBase;

// Effect pools
//
// Released effects go back into a per-type pool for reuse. With GLSLEffect a new effect is cheap and
// an unreferenced one is freed, so a pool only needs to cover routine churn (a dialog opening and
// closing, settings changes re-rounding every window) and is capped. Pooled effects are not free:
// ClutterOffscreenEffect only releases its texture when finalized, so each idle effect holds a
// texture the size of the last window it painted. An effect over the cap, or orphaned, is dropped.
//
// With Clutter.ShaderEffect an effect can never be freed, so dropping one would just leak it; those
// pools are unbounded and reuse is what limits the total. Orphaned ones are reused there too,
// accepting the log messages over the leak.
var MAX_POOLED_EFFECTS = 4;

// True if the effect should be replaced by a new one rather than reattached
function shouldDiscard(effect) {
    return USE_GLSL_EFFECT && isOrphaned(effect);
}

function _dropEffect(effect) {
    try {
        let actor = effect.get_actor();
        if (actor)
            actor.remove_effect(effect);
    } catch (e) {
        global.logError(`RoundedCorners: failed to detach a dropped effect: ${e}`);
    }
}

// Take an effect from the pool, or null if there is none to reuse
function takeFromPool(pool) {
    while (pool.length > 0) {
        let effect = pool.pop();
        if (!shouldDiscard(effect))
            return effect;
        _dropEffect(effect);
    }
    return null;
}

// Put a released effect back into its pool (detaching it first if needed), or drop it
function releaseToPool(pool, effect, max = MAX_POOLED_EFFECTS) {
    if (!effect)
        return;
    _dropEffect(effect);
    if (!USE_GLSL_EFFECT || (pool.length < max && !isOrphaned(effect)))
        pool.push(effect);
}

// Drop every pooled effect that can be freed (none with Clutter.ShaderEffect), for disable()
function drainPool(pool) {
    if (USE_GLSL_EFFECT)
        pool.length = 0;
}
