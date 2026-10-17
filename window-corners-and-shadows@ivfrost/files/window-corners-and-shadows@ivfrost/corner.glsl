// Rounded-corner clip and edge highlight for Cinnamon/Muffin window actors.
//
// Added to the actor's own fragment shader as a Cogl snippet (see
// buildCornerEffect() in extension.js). Split matters: everything above main()
// becomes the snippet's *declarations* - uniforms and helper functions - while
// the body of main() becomes its *code*, appended to the end of the generated
// fragment shader. So this is not a standalone shader, and there is no
// `cogl_color_out = cogl_color_in` preamble: Cogl has already sampled the
// window by the time our code runs, and `cogl_color_out` arrives holding it.
//
// The values are uniforms, not constants. They used to be written into the
// source, and the reason given was that reaching a uniform from JavaScript does
// not work - that is only half true, and the half that is false is what made
// this extension expensive. Clutter.ShaderEffect's JS binding cannot set a
// *vector* uniform (`set_uniform_value('v', [1, 1, 1, 1])` throws "Could not
// guess unspecified GValue type"); scalars are fine. Writing every value into
// the source was therefore the only way to change them, which meant compiling
// and re-attaching a fresh ShaderEffect on every geometry change - every frame
// of a drag or a resize, and every window at once when the workspaces settled.
// Cinnamon.GLSLEffect is the way out: set_uniform_float() takes vectors, so each
// window compiles this once and is thereafter handed new numbers.
//
// Three dialect details, each of which is a compile error if you get it wrong:
//   * Cinnamon's Cogl is old-style, so the texture coordinate varying is
//     `cogl_tex_coord_in[0]`. The GNOME Shell version of this shader uses
//     `cogl_tex_coord0_in`, which does not exist here.
//   * The actor's texture is bound to layer 0, which Cogl exposes as the
//     sampler `cogl_sampler0`. That is what sample_stage() below reads.
//   * The fragment output is `cogl_color_out`.
//
// Coordinate space, and why `uv` is not the window:
//
// The shader is attached to the window actor, so it never sees the window's own
// pixels directly. Clutter renders the actor into an offscreen buffer and runs
// the shader over that, which makes `cogl_tex_coord_in[0]` normalised over the
// *buffer*, not over the window. The buffer is sized from the actor's paint
// volume - the window together with its shadow - and anchored at the actor's
// position, so for a window with a large shadow it is tens of pixels larger
// than the window.
//
// Treating `uv * window_size` as the window's own pixel grid therefore put the
// clip and the border on a slightly stretched, slightly shifted grid: almost
// right at the top-left corner, but a couple of dozen pixels past the window at
// the bottom-right one, where the corner went unclipped and the border was
// painted beside the window instead of on it. Windows whose shadow fits inside
// their allocation were close enough to look correct, which is why only some
// windows showed the problem.
//
// The extension works the buffer's rectangle out and passes it in as
// `fboOrigin`/`fboSize`, along with the window rectangle in the same units, so
// everything below is plain screen pixels and the radius is a real radius.

// The window rectangle, on the stage, in pixels: x0, y0, x1, y1.
uniform vec4 bounds;

// The offscreen buffer the actor is rendered into: where it sits on the stage
// and how large it is. `fboOrigin + uv * fboSize` is the screen position of the
// fragment being shaded.
uniform vec2 fboOrigin;
uniform vec2 fboSize;

// How round the corners are, in pixels. Below 1 the window is not clipped at
// all, which is how maximized/fullscreen windows keep square corners.
uniform float radius;

// Width of the hairline stroke, in pixels. At 0 the window is only clipped.
uniform float borderWidth;

// How much room the window has around it inside the buffer, in pixels - its
// shadow. Zero for a window that casts none.
uniform float shadowDepth;

// 1 when the extension is drawing the window's shadow itself, on an actor of
// its own behind the window. Then the shadow in this buffer is left out: it
// would double up with the one being drawn, and being square it would show
// through the very corners being rounded.
uniform float clipOwnShadow;

// Read the buffer back at a point on the stage. Used to look at parts of the
// window other than the fragment being shaded.
vec4 sample_stage(vec2 p) {
    return texture2D(cogl_sampler0, (p - fboOrigin) / fboSize);
}

// Signed distance to the rounded rectangle: negative inside, positive outside,
// zero on the edge.
//
// A distance rather than a set of inside/outside tests, because the rectangle
// is placed from the actor's position and that is not always a whole number:
// a window mid-move or snapped sits at a fractional one. Deciding each pixel
// in or out against an edge that falls between two of them leaves a square
// step at the corners, a pixel wide, which is what makes them look chipped.
// A distance feathers the edge over the pixel it lands in instead.
float sd_round_rect(vec2 p, vec4 b, float r) {
    vec2 half = (b.zw - b.xy) * 0.5;
    vec2 c = (b.xy + b.zw) * 0.5;
    vec2 q = abs(p - c) - half + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// How much of a point is inside the rectangle: 1 well inside, 0 well outside,
// and a pixel's worth of feather across the edge.
float coverage(vec2 p, vec4 b, float r) {
    return clamp(0.5 - sd_round_rect(p, b, r), 0.0, 1.0);
}

// The colour of the hairline at one point on the border.
//
// Native chrome does not frame a window with one fixed white or black line. It
// takes the material the edge actually borders and pushes it away from
// whatever is behind it - a dark material's edge lifts, a light one's deepens -
// so the stroke belongs to what it frames rather than to the extension. That
// has to be read per fragment, from just inside this very point: a window with
// a dark toolbar over a light body should carry a dark line along its top and a
// light one along its bottom, the way the materials meet, and a single average
// over the whole window would smear the two together.
//
// The lift fades down the window, so the top edge takes the light and the
// bottom edge almost none of it, and a soft specular line sits along the top -
// the bevel reading that makes chrome look lit rather than outlined.
vec3 edge_colour(vec2 pos) {
    // Read inside the window, clear of the corner arcs and of the stroke
    // itself, so this is the window's chrome rather than whatever icon,
    // scrollbar or text happens to sit against the very edge.
    float inset = borderWidth + 3.0;

    float left = pos.x - bounds.x;
    float right = bounds.z - pos.x;
    float top = pos.y - bounds.y;
    float bottom = bounds.w - pos.y;

    vec2 inward = vec2(0.0, 0.0);
    float nearest = min(min(left, right), min(top, bottom));
    if (nearest == left)
        inward.x = 1.0;
    else if (nearest == right)
        inward.x = -1.0;
    else if (nearest == top)
        inward.y = 1.0;
    else
        inward.y = -1.0;

    vec4 s = sample_stage(pos + inward * inset);

    // The buffer is premultiplied.
    vec3 bg = s.rgb / max(s.a, 0.001);

    float luma = dot(bg, vec3(0.2126, 0.7152, 0.0722));
    bool dark = luma < 0.5;

    // How high up the window this edge is, 1 at the top and 0 at the bottom:
    // the light is imagined to fall from above, so the top edge takes the most
    // and the bottom the least.
    float down = (pos.y - bounds.y) / max(bounds.w - bounds.y, 1.0);
    float lit = 1.0 - smoothstep(0.0, 1.0, down);

    // The material is scaled rather than mixed with white or black, because
    // scaling multiplies every channel alike and so keeps the ratios between
    // them - a tinted window gets a tinted edge, a red one a red edge. Mixing
    // towards white would pull every hue towards grey.
    //
    // The amounts are deliberately tiny. A native window is held away from its
    // background by its shadow; the edge itself is a whisper on top of that. A
    // hairline of a few percent reads as the window's own edge catching the
    // light, while a strong one reads as an outline someone drew around the
    // window - which is what it looks like the moment it is heavy enough to
    // notice as a line rather than as an edge.
    // Scaling alone is not enough to lift a dark window - a tenth of 42 is 4 -
    // so the edge is a touch of scaling, which carries the material's own
    // colour, over a small overlay, which is what actually moves a dark value.
    // Both stay in the single digits, which is where native chrome keeps them:
    // enough to see the edge, not enough to read as a line.
    vec3 edge;
    if (dark) {
        edge = bg * mix(1.03, 1.07, lit) + vec3(mix(0.045, 0.085, lit));
    } else {
        edge = bg * mix(0.97, 0.93, lit) - vec3(0.008);
    }

    // The top edge is the one that catches the light, and only the top: the
    // highlight is gone a tenth of the way down, so it wraps the top corners
    // and dies along the sides.
    float spec = 1.0 - smoothstep(0.0, 0.10, down);
    return mix(edge, vec3(1.0), spec * (dark ? 0.16 : 0.12));
}

void main(void) {
    vec2 uv = cogl_tex_coord_in[0].xy;

    // Cogl has already sampled the window into cogl_color_out, with the actor's
    // opacity applied. Taking it from there rather than sampling cogl_sampler0
    // again keeps window fades working - the extension only shapes what Cogl
    // drew, it does not replace it.
    vec4 color = cogl_color_out;

    // Screen position of the fragment being shaded.
    vec2 pos = fboOrigin + uv * fboSize;

    // Never let the radius exceed half the window, or opposing corners would
    // overlap and eat into each other.
    float r = min(radius, min(bounds.z - bounds.x, bounds.w - bounds.y) / 2.0);

    if (r < 1.0) {
        cogl_color_out = color;
        return;
    }

    if (pos.x < bounds.x || pos.x > bounds.z ||
        pos.y < bounds.y || pos.y > bounds.w) {
        // Out here the buffer holds the window's own shadow. Left exactly as it
        // is when that is the shadow the window is going to keep - rounding a
        // window should not cost it its depth - and dropped when the extension
        // is drawing the shadow instead.
        cogl_color_out = clipOwnShadow > 0.5 ? vec4(0.0) : color;
        return;
    }

    float outerAlpha = coverage(pos, bounds, r);
    float innerAlpha = outerAlpha;
    if (borderWidth > 0.0) {
        vec4 innerBounds = vec4(
            bounds.x + borderWidth,
            bounds.y + borderWidth,
            bounds.z - borderWidth,
            bounds.w - borderWidth
        );
        float innerRadius = max(r - borderWidth, 0.0);
        innerAlpha = innerRadius < 1.0
            ? 1.0
            : coverage(pos, innerBounds, innerRadius);
    }

    vec3 rgb = color.rgb;
    float a = color.a * outerAlpha;

    // Only the ring is lifted, so only the ring pays for reading the window's
    // colour back - the rest of the window is a plain copy.
    float stroke = clamp(outerAlpha - innerAlpha, 0.0, 1.0);
    if (borderWidth > 0.0 && stroke > 0.0)
        rgb = mix(rgb, edge_colour(pos), stroke);

    // Premultiplied output, matching what Cogl expects.
    vec4 shaded = vec4(rgb * outerAlpha, a);

    if (outerAlpha < 1.0 && shadowDepth > 0.5 && clipOwnShadow < 0.5) {
        // The arc has just been cut out of the window body. What the window had
        // behind it there was its own shadow, but the buffer only holds the
        // window, square, over the top of it - so borrow the shadow from just
        // outside that corner. Without this the corner reads as a hole punched
        // through to the desktop, next to a square-edged shadow.
        float d = min(3.0, shadowDepth * 0.5);
        bool left = pos.x < (bounds.x + bounds.z) * 0.5;
        bool top = pos.y < (bounds.y + bounds.w) * 0.5;
        vec2 corner = vec2(left ? bounds.x : bounds.z, top ? bounds.y : bounds.w);
        vec2 outward = vec2(left ? -1.0 : 1.0, top ? -1.0 : 1.0);
        shaded = mix(sample_stage(corner + outward * d), shaded, outerAlpha);
    }

    cogl_color_out = shaded;
}
