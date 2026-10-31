// Base class for the extension's shader effects.
//
// On Cinnamon 6.2+ the effects are built on Cinnamon.GLSLEffect, which runs each .glsl file as a Cogl
// snippet. Clutter.ShaderEffect with set_shader_source() leaks: Muffin builds it on Cogl's deprecated
// CoglShader/CoglProgram code, where the shader keeps a reference to the pipeline it was compiled for
// (cogl/cogl/deprecated/cogl-shader.c), and that pipeline owns the program that owns the shader. So no
// such effect, nor its full-size offscreen texture, is ever freed. Upstream Mutter made the same move
// (ClutterShaderEffect was ported to CoglSnippet in Mutter 51).
//
// On Cinnamon 6.0, which has no GLSLEffect, the effects fall back to Clutter.ShaderEffect as before.
//
// An effect class extends EffectBase and implements get_effect_source(), returning its GLSL source.
// It must not depend on instance state: with GLSLEffect it is called once per class, from inside the
// first constructor. Everything else (set_uniform_value(), vfunc_paint_target()) works as with
// Clutter.ShaderEffect.

const GObject  = imports.gi.GObject;
const Cinnamon = imports.gi.Cinnamon;
const Clutter  = imports.gi.Clutter;

var USE_GLSL_EFFECT = (Cinnamon.GLSLEffect !== undefined);

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

    return { declarations, renamed };
}

// The shaders write premultiplied colour like any Clutter paint, but GLSLEffect blends with
// RGBA = SRC_COLOR * SRC_A + DST_COLOR * (1 - SRC_A), so un-premultiply on the way out.
// That is exact for the colour channels. The blend also gives a stored alpha of a*a instead of a,
// which only shows where an inner pass of an effect chain outputs partial alpha (antialiased edges).
const SNIPPET_CODE = 'effect_base_main();\n' +
                     'cogl_color_out.rgb /= max(cogl_color_out.a, 0.0001);\n';

// Muffin's ClutterActorMeta forgets its actor when that actor is destroyed, but keeps the id of its
// "destroy" handler. The next time the effect is attached anywhere it disconnects that id from NULL,
// logging "invalid (NULL) pointer instance" and "g_signal_handler_disconnect: assertion failed".
// So note when an effect's actor goes away while it is attached (Clutter then calls set_actor(NULL)
// with get_actor() already NULL, or the effect is released before that call arrives), and replace
// such an effect instead of reusing it. Called before chaining up, while get_actor() is the old actor.
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
    GTypeName: `BlurCinnamonGlslEffectBase_${Math.floor(Math.random() * 100000) + 1}`,
}, class GlslEffectBase extends Cinnamon.GLSLEffect {
    // Called once per class (GLSLEffect keeps one base pipeline per class and copies it per instance)
    vfunc_build_pipeline() {
        let source = this.get_effect_source();
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
    // run during construction, before GLSLEffect has created this instance's pipeline. The pipeline keeps its
    // uniform values between paints, so only the ones that changed since the last paint are sent.
    set_uniform_value(name, value) {
        if (!this._effect_base_uniforms) {
            this._effect_base_uniforms = new Map();
            this._effect_base_changed = new Map();
        }
        value = Number(value);
        if (this._effect_base_uniforms.get(name) === value)
            return;
        this._effect_base_uniforms.set(name, value);
        this._effect_base_changed.set(name, value);
        // Like ClutterShaderEffect: a new value needs a repaint. Without one, an offscreen effect keeps
        // showing its cached image until something else redraws the actor.
        this.queue_repaint();
    }

    vfunc_set_actor(actor) {
        _noteSetActor(this, actor);
        super.vfunc_set_actor(actor);
    }

    vfunc_paint_target(...params) {
        let renamed = this.constructor._effect_base_renamed;
        if (this._effect_base_changed?.size && renamed) {
            for (let [name, value] of this._effect_base_changed) {
                let location = this.get_uniform_location(renamed.has(name) ? `_u_${name}` : name);
                this.set_uniform_float(location, 1, [value]);
            }
            this._effect_base_changed.clear();
        }
        super.vfunc_paint_target(...params);
    }
}) : null;

const ShaderEffectBase = USE_GLSL_EFFECT ? null : GObject.registerClass({
    GTypeName: `BlurCinnamonShaderEffectBase_${Math.floor(Math.random() * 100000) + 1}`,
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
// Released effects go back into a per-type pool for reuse. On Cinnamon 6.2+ (GLSLEffect) a new
// effect is cheap and an unreferenced one is finalized, so a pool only needs to cover routine churn
// (a menu opening and closing, focus moving between windows) and is capped. Pooled effects are not
// free: ClutterOffscreenEffect only releases its texture in finalize(), so each idle effect holds a
// texture the size of the last actor it painted. An effect over the cap, or orphaned (see
// _noteSetActor), is just dropped. run_dispose() is not used: it would not release that texture.
//
// On Cinnamon 6.0 an EffectBase (Clutter.ShaderEffect) effect can never be freed, so dropping one
// would just leak it; those pools stay unbounded and reuse is what limits the total. Orphaned ones
// are reused there too, accepting the criticals over the leak.
var MAX_POOLED_EFFECTS = 4;

function _canFree(effect) {
    return USE_GLSL_EFFECT || !(effect instanceof EffectBase);
}

// True if the effect should be replaced by a new one rather than reattached
function shouldDiscard(effect) {
    return _canFree(effect) && isOrphaned(effect);
}

function _dropEffect(effect) {
    try {
        let actor = effect.get_actor();
        if (actor)
            actor.remove_effect(effect);
    } catch (e) {
        global.logError(`BlurCinnamon: failed to detach dropped effect: ${e}`);
    }
}

// Put a released (already detached) effect back into its pool, or drop it
function releaseToPool(pool, effect, max = MAX_POOLED_EFFECTS) {
    if (!_canFree(effect))
        pool.push(effect);
    else if (pool.length < max && !isOrphaned(effect))
        pool.push(effect);
    else
        _dropEffect(effect);
}

// Drop every pooled effect that can be freed (all of them on 6.2+), used when the extension is disabled
function drainPool(pool) {
    for (let i = pool.length - 1; i >= 0; i--) {
        let effect = pool[i];
        if (_canFree(effect)) {
            pool.splice(i, 1);
            _dropEffect(effect);
        }
    }
}
